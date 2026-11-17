"""Dairy plant physics engine + fault / cyber-attack injectors  (Pod 1: Members 1 & 2).

Tick-based simulation: ONE TICK = ONE SIMULATED MINUTE (the server runs 2 ticks / second).

    Raw Chilling Silo (4 °C) -> Pasteurizer_A / Pasteurizer_B (parallel HTST, 72 °C)
        -> Homogenizer -> Surge Tank (WIP buffer) -> Aseptic Filler -> Cold-Chain Packaging

Units:  flow L/min · temperature °C · pressure PSI · vibration mm/s RMS · current A · level %

The plant exposes two views of itself:
  * telemetry()  -> what the PLCs REPORT (can be spoofed by an attacker) + independent
                    physical sensors (drive current, inlet temperature, tank inflow)
  * truth()      -> hidden ground truth (fouling %, wear %, attack state) for QA only.
"""
import numpy as np

# ---------------- plant design constants ----------------
DT_MIN = 1.0                    # minutes per tick
NOMINAL_FLOW = 800.0            # L/min plant design throughput
SILO_CAP_L = 24000.0            # raw milk chilling silo
TANK_CAP_L = 6000.0             # intermediate surge tank
PAST_CAP_LPM = 900.0            # each pasteurizer can carry the whole plant alone
PAST_SHARE_LPM = 400.0          # normal load per pasteurizer (50/50 split)
HOLD_TUBE_RATED_LPM = 900.0     # hold tube sized for 15 s at 900 L/min
PAST_TEMP_C = 72.0
HOMOG_CAP_LPM = 1000.0
HOMOG_PRESSURE_PSI = 2000.0
FILLER_CAP_LPM = 1000.0
SILO_TEMP_C = 4.0

# ---------------- fault models ----------------
FOULING_MAX = 0.45              # homogenizer valve drift: up to -45 % capacity (1000 -> 550 L/min)
DRIFT_TICKS = 120               # minutes for the drift to reach FOULING_MAX
WEAR_TICKS = 160                # minutes for a pump seal to wear out at nominal load
FLUSH_TICKS = 8                 # micro-CIP flush duration (minutes)
FLUSH_CAPACITY = 0.7            # homogenizer runs at 70 % capacity while flushing
REPAIR_TICKS = 12               # technician seal hot-swap duration
VIB_BASE = 2.0                  # healthy pump vibration, mm/s RMS
VIB_FAIL = 7.1                  # ISO 10816-style "unacceptable" zone -> seal failure

# ---------------- OT network ----------------
SCADA_MASTER = "10.0.0.10"
KNOWN_HOSTS = {SCADA_MASTER: "SCADA master", "10.0.0.11": "Operator HMI", "10.0.0.20": "Engineering WS"}
ROGUE_IP = "192.168.66.6"
PLC_IP = {"silo": "10.0.1.11", "pasteurizer_a": "10.0.1.21", "pasteurizer_b": "10.0.1.22",
          "homogenizer": "10.0.1.31", "surge_tank": "10.0.1.41", "filler": "10.0.1.51",
          "packaging": "10.0.1.61", "chiller": "10.0.1.12"}
PUMPS = ("homogenizer_pump_1", "pasteurizer_a_pump")
PUMP_LABEL = {"homogenizer_pump_1": "Homogenizer Pump #1", "pasteurizer_a_pump": "Pasteurizer_A Feed Pump"}
SCENARIOS = ("drift", "pump_wear", "cyber_spike", "chiller_spoof")


class DairyPlant:
    def __init__(self, seed=42):
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.tick = 0
        self.silo_l = 0.5 * SILO_CAP_L
        self.tank_l = 0.5 * TANK_CAP_L

        # control set-points (written by the Sync Controller / operators)
        self.intake_cmd = 1.0       # raw-milk intake pump, fraction of 800 L/min
        self.filler_pace = 1.0      # filler speed, fraction of 800 L/min
        self.split_a = 0.5          # share of flow routed to Pasteurizer_A
        self.quarantined = set()    # units behind a closed diversion valve
        self.blocked_ips = set()    # firewall drop list

        # hidden physical state
        self.fouling = 0.0
        self.wear = {p: 0.0 for p in PUMPS}
        self.failed = {p: False for p in PUMPS}
        self.flush_left = 0
        self.flush_step = 0.0
        self.repairs = {}           # pump -> ticks left
        self.silo_temp = SILO_TEMP_C

        # injected scenarios
        self.drift_active = False
        self.wear_active = {p: False for p in PUMPS}
        self.cyber_tick = None      # tick the pasteurizer attack started (None = no attack)
        self.chiller_tick = None    # tick the chiller spoof started
        self.chiller_failover = False
        self.cip_valve_a_open = False
        self.scenario = None
        self.scenario_tick = None

        # counters
        self.bottled_l = 0.0
        self.wasted_l = 0.0         # silo overflow to drain
        self.unsafe_l = 0.0         # under-pasteurized milk produced
        self.at_risk_l = 0.0        # milk that left the silo above 7 °C
        self.starved_min = 0.0
        self._txn = {}
        self._last_written = {"intake": 100, "pace": 100, "split": 50}
        self.events = []
        self.log_sink = None
        self.packets = []
        self._prev_flags = {}
        self.flows = {"intake": NOMINAL_FLOW, "a": PAST_SHARE_LPM, "b": PAST_SHARE_LPM,
                      "process": NOMINAL_FLOW, "draw": NOMINAL_FLOW, "demand": NOMINAL_FLOW}

    # ======================= helpers =======================
    def _noise(self, sd):
        return float(np.clip(self.rng.normal(0.0, sd), -3 * sd, 3 * sd))

    def _event(self, level, msg):
        e = {"tick": self.tick, "level": level, "source": "plant", "msg": msg}
        self.events.append(e)
        if self.log_sink is not None:       # shared event log (set by the intelligence engine)
            self.log_sink.append(e)

    def pump_factor(self, pump):
        """Fraction of rated flow a (possibly worn) pump can still deliver."""
        if self.failed[pump]:
            return 0.0
        return 1.0 - 0.6 * self.wear[pump] ** 2

    def flushing(self):
        return self.flush_left > 0

    def attack_on_a(self):
        """Rogue speed write is reaching Pasteurizer_A's PLC."""
        return (self.cyber_tick is not None and self.tick - self.cyber_tick >= 3
                and ROGUE_IP not in self.blocked_ips and "pasteurizer_a" not in self.quarantined)

    def chiller_spoofed(self):
        return self.chiller_tick is not None and not self.chiller_failover

    # ======================= control API =======================
    def set_intake(self, frac):
        self.intake_cmd = float(np.clip(frac, 0.0, 1.1))

    def set_filler_pace(self, frac):
        self.filler_pace = float(np.clip(frac, 0.3, 1.25))

    def set_split(self, frac_a):
        if "pasteurizer_a" in self.quarantined or self.failed["pasteurizer_a_pump"]:
            frac_a = 0.0
        if "pasteurizer_b" in self.quarantined:
            frac_a = 1.0
        self.split_a = float(np.clip(frac_a, 0.0, 1.0))

    def start_flush(self):
        if self.flushing():
            return False
        self.flush_left = FLUSH_TICKS
        self.flush_step = max(0.0, self.fouling - 0.01) / FLUSH_TICKS
        self._event("info", f"Micro-CIP flush started on Homogenizer valve ({FLUSH_TICKS} min at "
                            f"{FLUSH_CAPACITY * 100:.0f} % capacity)")
        return True

    def quarantine(self, unit):
        if unit not in ("pasteurizer_a", "pasteurizer_b") or unit in self.quarantined:
            return False
        self.quarantined.add(unit)
        self.split_a = 0.0 if unit == "pasteurizer_a" else 1.0   # reroute through the twin
        if unit == "pasteurizer_a":
            self.cip_valve_a_open = False
        self._event("crit", f"{unit} isolated: diversion valve CLOSED, flow rerouted to twin")
        return True

    def release(self, unit):
        if unit not in self.quarantined:
            return False
        self.quarantined.discard(unit)
        if unit == "pasteurizer_a":                 # operator confirms the threat is remediated
            self.cyber_tick = None
            self.blocked_ips.discard(ROGUE_IP)
            if self.scenario == "cyber_spike":
                self.scenario = None
        self.split_a = 0.5 if not self.quarantined else self.split_a
        self._event("info", f"{unit} released from quarantine, 50/50 split restored")
        return True

    def block_ip(self, ip):
        if ip in self.blocked_ips:
            return False
        self.blocked_ips.add(ip)
        self._event("warn", f"Firewall: traffic from {ip} now DROPPED")
        return True

    def dispatch_repair(self, pump):
        if pump not in PUMPS or pump in self.repairs:
            return False
        self.repairs[pump] = REPAIR_TICKS
        self._event("info", f"Technician dispatched to {PUMP_LABEL[pump]} (seal hot-swap, {REPAIR_TICKS} min)")
        return True

    def engage_chiller_failover(self):
        if self.chiller_tick is None or self.chiller_failover:
            return False
        self.chiller_failover = True
        self._event("crit", "Chiller control segment isolated: redundant sensor + backup chiller loop engaged")
        return True

    def trigger(self, name, target="homogenizer_pump_1"):
        if name not in SCENARIOS:
            raise ValueError(f"unknown scenario {name}")
        self.scenario, self.scenario_tick = name, self.tick
        if name == "drift":
            self.drift_active = True
            self._event("warn", "[INJECT] Silent Homogenizer valve fouling drift started")
        elif name == "pump_wear":
            if target not in PUMPS:
                raise ValueError(f"unknown pump {target}")
            self.wear_active[target] = True
            self._event("warn", f"[INJECT] Gradual seal wear started on {PUMP_LABEL[target]}")
        elif name == "cyber_spike":
            self.cyber_tick = self.tick
            self._event("warn", "[INJECT] OT intrusion from 192.168.66.6 targeting Pasteurizer_A PLC")
        elif name == "chiller_spoof":
            self.chiller_tick = self.tick
            self.chiller_failover = False
            self._event("warn", "[INJECT] Chiller sensor spoof via compromised Engineering WS")
        return True

    # ======================= simulation step =======================
    def step(self):
        self.tick += 1
        self.events = []
        self._progress_faults()

        # ---- capacities ----
        cap_a = 0.0 if "pasteurizer_a" in self.quarantined else PAST_CAP_LPM * self.pump_factor("pasteurizer_a_pump")
        cap_b = 0.0 if "pasteurizer_b" in self.quarantined else PAST_CAP_LPM
        cap_h = HOMOG_CAP_LPM * (1 - self.fouling) * self.pump_factor("homogenizer_pump_1")
        if self.flushing():
            cap_h *= FLUSH_CAPACITY

        # ---- flows (1-minute volume balance with back-pressure) ----
        intake = NOMINAL_FLOW * self.intake_cmd
        demand = min(FILLER_CAP_LPM, NOMINAL_FLOW * self.filler_pace)
        a_sp = NOMINAL_FLOW * self.split_a
        if self.attack_on_a():
            a_sp *= 1.4                                   # rogue +40 % speed set-point
        fa = min(a_sp, cap_a)
        fb = min(NOMINAL_FLOW * (1 - self.split_a), cap_b)
        limit = min(cap_h,
                    (TANK_CAP_L - self.tank_l) / DT_MIN + demand,     # surge tank head-room
                    self.silo_l / DT_MIN + intake)                    # milk available
        if fa + fb > limit:
            k = limit / (fa + fb)
            fa, fb = fa * k, fb * k
        process = fa + fb

        self.silo_l += (intake - process) * DT_MIN
        if self.silo_l > SILO_CAP_L:
            self.wasted_l += self.silo_l - SILO_CAP_L
            self.silo_l = SILO_CAP_L
        self.silo_l = max(0.0, self.silo_l)

        draw = min(demand, self.tank_l / DT_MIN + process)
        self.tank_l = float(np.clip(self.tank_l + (process - draw) * DT_MIN, 0.0, TANK_CAP_L))
        if draw < demand * 0.98:
            self.starved_min += DT_MIN
        self.bottled_l += draw

        # ---- temperatures / safety ----
        if self.chiller_spoofed():
            self.silo_temp = min(10.0, self.silo_temp + 0.12)    # chiller secretly drifting off
        elif self.silo_temp > SILO_TEMP_C:
            self.silo_temp = max(SILO_TEMP_C, self.silo_temp - 0.2)
        if self.silo_temp > 7.0:
            self.at_risk_l += process

        temp_a = PAST_TEMP_C - 0.05 * (self.silo_temp - SILO_TEMP_C)
        if self.attack_on_a() and fa > 0:                 # heating loop frozen by attacker
            temp_a -= 14.0 * max(0.0, fa / PAST_SHARE_LPM - 1.0)
        temp_b = PAST_TEMP_C - 0.05 * (self.silo_temp - SILO_TEMP_C)
        hold_a = 15.0 * HOLD_TUBE_RATED_LPM / fa if fa > 1 else None
        hold_b = 15.0 * HOLD_TUBE_RATED_LPM / fb if fb > 1 else None
        if fa > 1 and (temp_a < 71.5 or hold_a < 15.0):
            self.unsafe_l += fa * DT_MIN
        if fb > 1 and (temp_b < 71.5 or hold_b < 15.0):
            self.unsafe_l += fb * DT_MIN

        # ---- pump wear is load-dependent: a lighter load slows the wear ----
        load = {"homogenizer_pump_1": process / NOMINAL_FLOW, "pasteurizer_a_pump": fa / PAST_SHARE_LPM}
        for p in PUMPS:
            if self.wear_active[p] and not self.failed[p] and p not in self.repairs:
                self.wear[p] = min(1.0, self.wear[p] + load[p] / WEAR_TICKS)
                if self.wear[p] >= 1.0:
                    self.failed[p] = True
                    self._event("crit", f"{PUMP_LABEL[p]} SEAL FAILURE - hard breakdown")

        self.flows = {"intake": intake, "a": fa, "b": fb, "process": process, "draw": draw,
                      "demand": demand, "cap_h": cap_h}
        self._temps = (temp_a, temp_b, hold_a, hold_b)
        self._edge_events(draw, demand)
        self.packets = self._generate_packets()
        return self.telemetry()

    def _progress_faults(self):
        if self.drift_active:
            self.fouling = min(FOULING_MAX, self.fouling + FOULING_MAX / DRIFT_TICKS)
        if self.flushing():
            self.fouling = max(0.01, self.fouling - self.flush_step)
            self.flush_left -= 1
            if self.flush_left == 0:
                self._event("info", f"Micro-CIP flush complete (valve fouling now {self.fouling * 100:.0f} %)")
        for p in list(self.repairs):
            self.repairs[p] -= 1
            if self.repairs[p] <= 0:
                del self.repairs[p]
                self.wear[p], self.failed[p], self.wear_active[p] = 0.0, False, False
                if p == "pasteurizer_a_pump" and "pasteurizer_a" not in self.quarantined:
                    self.split_a = 0.5
                self._event("info", f"{PUMP_LABEL[p]} seal replaced - pump back to as-new condition")

    def _edge_events(self, draw, demand):
        flags = {"starved": draw < demand * 0.98, "silo_full": self.silo_l >= SILO_CAP_L - 1,
                 "unsafe": self.attack_on_a(), "warm_silo": self.silo_temp > 7.0}
        msgs = {"starved": ("warn", "Aseptic Filler STARVED - surge tank empty"),
                "silo_full": ("crit", "Raw milk silo OVERFLOW - milk diverted to drain"),
                "unsafe": ("crit", "Pasteurizer_A producing UNDER-PASTEURIZED milk"),
                "warm_silo": ("crit", "Silo milk above 7 °C - thermal spoilage risk")}
        for k, on in flags.items():
            if on and not self._prev_flags.get(k):
                self._event(*msgs[k])
        self._prev_flags = flags

    # ======================= OT network traffic =======================
    def _pkt(self, src, unit, func, register, value=None, proto="Modbus/TCP", txn=None):
        if txn is None:
            txn = self._txn.get(src, 0) + 1
            self._txn[src] = txn
        names = {3: "Read Holding Registers", 43: "Read Device ID", 5: "Write Single Coil",
                 6: "Write Single Register", 16: "Write Multiple Registers", 100: "OPC-UA Read", 101: "OPC-UA Write"}
        return {"tick": self.tick, "txn": int(txn), "proto": proto, "src": src, "dst": PLC_IP[unit],
                "unit": unit, "func": func, "func_name": names[func],
                "op": "WRITE" if func in (5, 6, 16, 101) else "READ",
                "register": register, "value": value, "bytes": 12 if func in (3, 100) else 17,
                "blocked": src in self.blocked_ips}

    def _generate_packets(self):
        pk = []
        units = ["silo", "pasteurizer_a", "pasteurizer_b", "homogenizer", "surge_tank", "filler", "packaging"]
        for u in self.rng.choice(units, size=4, replace=False):
            pk.append(self._pkt(SCADA_MASTER, str(u), 3, "status_block"))
        pk.append(self._pkt("10.0.0.11", str(self.rng.choice(units)), 3, "hmi_view"))
        # legitimate set-point writes from the SCADA master when the controller changes them
        for key, unit, reg, val in (("intake", "silo", "intake_pump_sp", round(self.intake_cmd * 100)),
                                    ("pace", "filler", "filler_speed_sp", round(self.filler_pace * 100)),
                                    ("split", "pasteurizer_a", "split_sp", round(self.split_a * 100))):
            if abs(val - self._last_written[key]) >= 2:
                pk.append(self._pkt(SCADA_MASTER, unit, 6, reg, val))
                self._last_written[key] = val
        # attack traffic
        if self.cyber_tick is not None:
            age = self.tick - self.cyber_tick
            if age < 3:      # reconnaissance burst, random (out-of-sequence) transaction ids
                for _ in range(int(self.rng.integers(7, 11))):
                    pk.append(self._pkt(ROGUE_IP, str(self.rng.choice(units)), int(self.rng.choice([3, 43])),
                                        "device_scan", txn=int(self.rng.integers(1, 60000))))
            else:
                pk.append(self._pkt(ROGUE_IP, "pasteurizer_a", 6, "pump_speed_sp", 140,
                                    txn=int(self.rng.integers(1, 60000))))
                if age >= 5 and age % 4 == 1:
                    pk.append(self._pkt(ROGUE_IP, "pasteurizer_a", 5, "cip_valve", 1,
                                        txn=int(self.rng.integers(1, 60000))))
                    if not pk[-1]["blocked"] and "pasteurizer_a" not in self.quarantined:
                        self.cip_valve_a_open = True
        if self.chiller_tick is not None and self.tick - self.chiller_tick in (0, 1):
            pk.append(self._pkt("10.0.0.20", "chiller", 101, "chiller_1.temp_pv.override", 4.0, proto="OPC-UA"))
        return pk

    # ======================= outputs =======================
    def telemetry(self):
        f = self.flows
        temp_a, temp_b, hold_a, hold_b = getattr(self, "_temps", (PAST_TEMP_C, PAST_TEMP_C, 33.75, 33.75))
        n = self._noise
        fa_rep, ta_rep, hold_a_rep, speed_a = f["a"], temp_a, hold_a, (f["a"] / max(NOMINAL_FLOW * self.split_a, 1)) * 100
        if self.attack_on_a():                 # Stuxnet-style replay: PLC reports "all normal"
            fa_rep, ta_rep, speed_a = PAST_SHARE_LPM, PAST_TEMP_C, 100.0
            hold_a_rep = 15.0 * HOLD_TUBE_RATED_LPM / PAST_SHARE_LPM
        silo_temp_rep = SILO_TEMP_C + n(0.04) if self.chiller_spoofed() else self.silo_temp + n(0.04)
        vib = {p: (0.0 if self.failed[p] else VIB_BASE + 5.1 * self.wear[p] ** 1.5 + n(0.05)) for p in PUMPS}
        p_noise = 6.0 * (1 + 3 * self.wear["homogenizer_pump_1"])
        pressure = 0.0 if self.failed["homogenizer_pump_1"] else (
            HOMOG_PRESSURE_PSI + 400 * self.fouling - 120 * self.wear["homogenizer_pump_1"] ** 2 + n(p_noise))
        r1 = lambda x: None if x is None else round(x, 1)
        r2 = lambda x: None if x is None else round(x, 2)
        return {
            "tick": self.tick,
            "sim_min": self.tick * DT_MIN,
            "stages": {
                "silo": {"level_pct": r1(100 * self.silo_l / SILO_CAP_L), "level_l": round(self.silo_l),
                         "temp_c": r2(silo_temp_rep), "intake_lpm": r1(f["intake"] + n(2)),
                         "flow_out_lpm": r1(f["process"] + n(2)), "intake_cmd_pct": r1(self.intake_cmd * 100)},
                "pasteurizer_a": {"flow_lpm": r1(max(0.0, fa_rep + n(2)) if fa_rep > 0 else 0.0),
                                  "temp_c": r2(ta_rep + n(0.08)), "hold_time_s": r1(hold_a_rep),
                                  "speed_pct": r1(speed_a if f["a"] > 0 else 0.0),
                                  "drive_current_a": r2(4 + 16 * f["a"] / PAST_SHARE_LPM + n(0.15) if f["a"] > 0 else 0.0),
                                  "inlet_temp_c": r2(self.silo_temp + 0.1 + n(0.05)),
                                  "load_share_pct": r1(self.split_a * 100),
                                  "quarantined": "pasteurizer_a" in self.quarantined,
                                  "valve_open": "pasteurizer_a" not in self.quarantined,
                                  "cip_valve_open": self.cip_valve_a_open},
                "pasteurizer_b": {"flow_lpm": r1(max(0.0, f["b"] + n(2)) if f["b"] > 0 else 0.0),
                                  "temp_c": r2(temp_b + n(0.08)), "hold_time_s": r1(hold_b),
                                  "speed_pct": r1(100.0 if f["b"] > 0 else 0.0),
                                  "drive_current_a": r2(4 + 16 * f["b"] / PAST_SHARE_LPM + n(0.15) if f["b"] > 0 else 0.0),
                                  "inlet_temp_c": r2(self.silo_temp + 0.1 + n(0.05)),
                                  "load_share_pct": r1((1 - self.split_a) * 100),
                                  "quarantined": "pasteurizer_b" in self.quarantined,
                                  "valve_open": "pasteurizer_b" not in self.quarantined,
                                  "cip_valve_open": False},
                "homogenizer": {"flow_lpm": r1(f["process"] + n(2)), "pressure_psi": r1(pressure),
                                "valve_position_pct": r1(55 + 60 * self.fouling), "flushing": self.flushing()},
                "surge_tank": {"level_pct": r1(100 * self.tank_l / TANK_CAP_L), "level_l": round(self.tank_l),
                               "flow_in_lpm": r1(f["process"]), "flow_out_lpm": r1(f["draw"]), "temp_c": r2(4.5 + n(0.05))},
                "filler": {"flow_lpm": r1(f["draw"]), "demand_lpm": r1(f["demand"]), "pace_pct": r1(self.filler_pace * 100),
                           "starved": f["draw"] < f["demand"] * 0.98},
                "packaging": {"rate_lpm": r1(f["draw"]), "units_total": int(self.bottled_l),
                              "cold_room_temp_c": r2(3.5 + n(0.05))},
            },
            "pumps": {p: {"label": PUMP_LABEL[p], "vibration_mms": r2(vib[p]), "failed": self.failed[p],
                          "under_repair": p in self.repairs} for p in PUMPS},
            "counters": {"bottled_l": round(self.bottled_l), "wasted_l": round(self.wasted_l),
                         "unsafe_l": round(self.unsafe_l), "at_risk_l": round(self.at_risk_l),
                         "starved_min": self.starved_min},
            "setpoints": {"intake_pct": r1(self.intake_cmd * 100), "filler_pace_pct": r1(self.filler_pace * 100),
                          "split_a_pct": r1(self.split_a * 100)},
            "blocked_ips": sorted(self.blocked_ips),
            "quarantined": sorted(self.quarantined),
            "scenario": self.scenario, "scenario_tick": self.scenario_tick,
            "chiller_failover": self.chiller_failover,
        }

    def truth(self):
        """Hidden ground truth - for QA / explanation only, never used by the detectors."""
        return {"fouling_pct": round(self.fouling * 100, 1),
                "wear_pct": {p: round(self.wear[p] * 100, 1) for p in PUMPS},
                "failed": dict(self.failed), "attack_reaching_plc": self.attack_on_a(),
                "silo_temp_actual_c": round(self.silo_temp, 2),
                "pasteurizer_a_actual_flow": round(self.flows["a"], 1),
                "pasteurizer_a_actual_temp": round(self._temps[0], 2) if hasattr(self, "_temps") else PAST_TEMP_C,
                "homogenizer_capacity_lpm": round(self.flows.get("cap_h", HOMOG_CAP_LPM), 1)}
