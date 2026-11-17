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

# ---------------- any-unit faults: pick a fault type AND a target unit ----------------
# They run on their own code path: with no such fault active, every number (and every random draw) of the four
# original scenarios is exactly what it was before.
FAULT_TYPES = ("leak", "cyber_takeover", "motor_trip")
FAULT_UNITS = ("silo", "pasteurizer_a", "pasteurizer_b", "homogenizer", "surge_tank", "filler", "packaging")
ALL_SCENARIOS = SCENARIOS + FAULT_TYPES
TANKS = ("silo", "surge_tank")
UNIT_NAME = {"silo": "Raw Chilling Silo", "pasteurizer_a": "Pasteurizer_A", "pasteurizer_b": "Pasteurizer_B",
             "homogenizer": "Homogenizer", "surge_tank": "Surge Tank", "filler": "Aseptic Filler",
             "packaging": "Cold-Chain Packaging"}
LEAK_TANK_LPM = 90.0            # a cracked tank loses 90 L/min
LEAK_FRAC = 0.12                # a leaking line / seal loses 12 % of what flows through the unit
DRAIN_LPM = {"silo": 450.0, "surge_tank": 300.0}   # attacker opens the drain valve
HIJACK_SPEED = 0.3              # attacker forces a pump / drive down to 30 % speed
FIX_TICKS = 10                  # repair crew time for a leak or a tripped motor


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
        self.scenario_target = None
        self.faults = {}            # unit -> {"type", "tick", "fix_left", "frozen", "restored"}  (any-unit faults)
        self.lost_l = 0.0           # milk lost to leaks or an opened drain

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

    # ---- any-unit faults ----
    def hijacked(self, unit):
        """Rogue writes are reaching this unit's PLC (attack started, recon done, attacker not blocked)."""
        f = self.faults.get(unit)
        return (f is not None and f["type"] == "cyber_takeover" and self.tick - f["tick"] >= 3
                and ROGUE_IP not in self.blocked_ips)

    def _has(self, unit, kind):
        f = self.faults.get(unit)
        return f is not None and f["type"] == kind

    def _speed(self, unit):
        """Speed factor of a unit's drive: 0 when its motor tripped, 30 % when an attacker throttles it."""
        if self._has(unit, "motor_trip"):
            return 0.0
        if unit not in TANKS and self.hijacked(unit):
            return HIJACK_SPEED
        return 1.0

    def fix_fault(self, unit):
        """Send the repair crew to a leak or a tripped motor (cyber takeovers are fixed by blocking the attacker)."""
        f = self.faults.get(unit)
        if f is None or f["type"] == "cyber_takeover" or f["fix_left"] is not None:
            return False
        f["fix_left"] = FIX_TICKS
        self._event("info", f"Repair crew dispatched to {UNIT_NAME[unit]} ({FIX_TICKS} min)")
        return True

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

    def _inject(self, kind, unit):
        if unit not in FAULT_UNITS:
            raise ValueError(f"unknown unit {unit}")
        if kind == "cyber_takeover" and unit == "pasteurizer_a":
            return self.trigger("cyber_spike")            # the original attack on A (overspeed + spoof)
        self.scenario, self.scenario_tick, self.scenario_target = kind, self.tick, unit
        self.faults[unit] = {"type": kind, "tick": self.tick, "fix_left": None, "frozen": None, "restored": False}
        name = UNIT_NAME[unit]
        what = {"leak": f"Leak started on {name}" + (" (cracked tank wall)" if unit in TANKS else " (failing seal)"),
                "cyber_takeover": f"OT intrusion from {ROGUE_IP} targeting the {name} PLC",
                "motor_trip": f"{name} {'outlet pump' if unit in TANKS else 'drive motor'} tripped (jam)"}[kind]
        self._event("warn", f"[INJECT] {what}")
        return True

    def trigger(self, name, target="homogenizer_pump_1"):
        if name in FAULT_TYPES:
            return self._inject(name, target)
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
        if self.faults:
            cap_a *= self._speed("pasteurizer_a")
            cap_b *= self._speed("pasteurizer_b")
            cap_h *= self._speed("homogenizer")

        # ---- flows (1-minute volume balance with back-pressure) ----
        intake = NOMINAL_FLOW * self.intake_cmd
        demand = min(FILLER_CAP_LPM, NOMINAL_FLOW * self.filler_pace)
        if self.faults:                                   # a stopped filler or packaging line stops the filling
            demand *= self._speed("filler") * self._speed("packaging")
        a_sp = NOMINAL_FLOW * self.split_a
        if self.attack_on_a():
            a_sp *= 1.4                                   # rogue +40 % speed set-point
        fa = min(a_sp, cap_a)
        fb = min(NOMINAL_FLOW * (1 - self.split_a), cap_b)
        limit = min(cap_h,
                    (TANK_CAP_L - self.tank_l) / DT_MIN + demand,     # surge tank head-room
                    self.silo_l / DT_MIN + intake)                    # milk available
        if self.faults:
            limit *= self._speed("silo")                  # silo outlet pump tripped: nothing leaves the silo
        if fa + fb > limit:
            k = limit / (fa + fb)
            fa, fb = fa * k, fb * k
        process = fa + fb
        # inline leaks: milk measured leaving a unit never reaches the next one
        out_a, out_b, arrive, into_tank = fa, fb, process, process
        if self.faults:
            if self._has("pasteurizer_a", "leak"):
                out_a = fa * (1 - LEAK_FRAC)
            if self._has("pasteurizer_b", "leak"):
                out_b = fb * (1 - LEAK_FRAC)
            arrive = out_a + out_b
            into_tank = arrive * (1 - LEAK_FRAC) if self._has("homogenizer", "leak") else arrive

        self.silo_l += (intake - process) * DT_MIN
        if self.silo_l > SILO_CAP_L:
            self.wasted_l += self.silo_l - SILO_CAP_L
            self.silo_l = SILO_CAP_L
        self.silo_l = max(0.0, self.silo_l)
        if self.faults:
            self.silo_l -= self._tank_loss("silo", self.silo_l)

        draw = min(demand, self.tank_l / DT_MIN + into_tank)
        if self.faults and self._has("surge_tank", "motor_trip"):
            draw = 0.0                                    # surge outlet pump tripped: the filler gets nothing
        self.tank_l = float(np.clip(self.tank_l + (into_tank - draw) * DT_MIN, 0.0, TANK_CAP_L))
        if self.faults:
            self.tank_l -= self._tank_loss("surge_tank", self.tank_l)
        if draw < demand * 0.98:
            self.starved_min += DT_MIN
        to_pack = packed = draw
        if self.faults:
            to_pack = draw * (1 - LEAK_FRAC) if self._has("filler", "leak") else draw
            packed = to_pack * (1 - LEAK_FRAC) if self._has("packaging", "leak") else to_pack
            self.lost_l += (process - into_tank) + (draw - packed)
        self.bottled_l += packed

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
                      "demand": demand, "cap_h": cap_h, "out_a": out_a, "out_b": out_b, "arrive": arrive,
                      "tank_in": into_tank, "to_pack": to_pack}
        self._temps = (temp_a, temp_b, hold_a, hold_b)
        self._edge_events(draw, demand)
        self.packets = self._generate_packets()
        return self.telemetry()

    def _tank_loss(self, tank, level):
        """Litres lost this minute from a leaking tank or one whose drain valve an attacker opened."""
        f = self.faults.get(tank)
        if f is None:
            return 0.0
        if f["type"] == "leak":
            rate = LEAK_TANK_LPM
        elif self.hijacked(tank):
            if f["frozen"] is None:                       # the PLC now replays the last level it saw
                f["frozen"] = level
            rate = DRAIN_LPM[tank]
        else:
            return 0.0
        lost = min(level, rate * DT_MIN)
        self.lost_l += lost
        return lost

    def _progress_faults(self):
        for u in list(self.faults):
            f = self.faults[u]
            if f["fix_left"] is not None:
                f["fix_left"] -= 1
                if f["fix_left"] <= 0:
                    del self.faults[u]
                    self._event("info", f"{UNIT_NAME[u]} repaired and back in service")
            elif f["type"] == "cyber_takeover" and not f["restored"] and ROGUE_IP in self.blocked_ips:
                f["restored"] = True
                what = "drain valve closed" if u in TANKS else "speed set-point restored to last-known-good"
                self._event("info", f"{UNIT_NAME[u]}: attacker cut off, {what}")
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
        for u, ft in self.faults.items():
            if ft["type"] != "cyber_takeover":
                continue
            age = self.tick - ft["tick"]
            if age < 3:
                for _ in range(int(self.rng.integers(7, 11))):
                    pk.append(self._pkt(ROGUE_IP, str(self.rng.choice(units)), int(self.rng.choice([3, 43])),
                                        "device_scan", txn=int(self.rng.integers(1, 60000))))
            elif u in TANKS:
                pk.append(self._pkt(ROGUE_IP, u, 5, "drain_valve", 1, txn=int(self.rng.integers(1, 60000))))
            else:
                pk.append(self._pkt(ROGUE_IP, u, 6, "speed_sp", round(HIJACK_SPEED * 100), txn=int(self.rng.integers(1, 60000))))
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
        silo_rep, tank_rep = self.silo_l, self.tank_l    # a hijacked tank PLC replays the level it saw last
        for tank in TANKS:
            ft = self.faults.get(tank)
            if ft is not None and ft["frozen"] is not None and self.hijacked(tank):
                if tank == "silo":
                    silo_rep = ft["frozen"]
                else:
                    tank_rep = ft["frozen"]
        p_noise = 6.0 * (1 + 3 * self.wear["homogenizer_pump_1"])
        pressure = 0.0 if self.failed["homogenizer_pump_1"] else (
            HOMOG_PRESSURE_PSI + 400 * self.fouling - 120 * self.wear["homogenizer_pump_1"] ** 2 + n(p_noise))
        r1 = lambda x: None if x is None else round(x, 1)
        r2 = lambda x: None if x is None else round(x, 2)
        return {
            "tick": self.tick,
            "sim_min": self.tick * DT_MIN,
            "stages": {
                "silo": {"level_pct": r1(100 * silo_rep / SILO_CAP_L), "level_l": round(silo_rep),
                         "temp_c": r2(silo_temp_rep), "intake_lpm": r1(f["intake"] + n(2)),
                         "flow_out_lpm": r1(f["process"] + n(2)), "intake_cmd_pct": r1(self.intake_cmd * 100),
                         "tripped": self._has("silo", "motor_trip")},
                "pasteurizer_a": {"flow_lpm": r1(max(0.0, fa_rep + n(2)) if fa_rep > 0 else 0.0),
                                  "temp_c": r2(ta_rep + n(0.08)), "hold_time_s": r1(hold_a_rep),
                                  "speed_pct": r1(speed_a if f["a"] > 0 else 0.0),
                                  "drive_current_a": r2(4 + 16 * f["a"] / PAST_SHARE_LPM + n(0.15) if f["a"] > 0 else 0.0),
                                  "inlet_temp_c": r2(self.silo_temp + 0.1 + n(0.05)),
                                  "load_share_pct": r1(self.split_a * 100),
                                  "quarantined": "pasteurizer_a" in self.quarantined,
                                  "valve_open": "pasteurizer_a" not in self.quarantined,
                                  "cip_valve_open": self.cip_valve_a_open,
                                  "outlet_flow_lpm": r1(f.get("out_a", f["a"])), "tripped": self._has("pasteurizer_a", "motor_trip")},
                "pasteurizer_b": {"flow_lpm": r1(max(0.0, f["b"] + n(2)) if f["b"] > 0 else 0.0),
                                  "temp_c": r2(temp_b + n(0.08)), "hold_time_s": r1(hold_b),
                                  "speed_pct": r1(100.0 if f["b"] > 0 else 0.0),
                                  "drive_current_a": r2(4 + 16 * f["b"] / PAST_SHARE_LPM + n(0.15) if f["b"] > 0 else 0.0),
                                  "inlet_temp_c": r2(self.silo_temp + 0.1 + n(0.05)),
                                  "load_share_pct": r1((1 - self.split_a) * 100),
                                  "quarantined": "pasteurizer_b" in self.quarantined,
                                  "valve_open": "pasteurizer_b" not in self.quarantined,
                                  "cip_valve_open": False,
                                  "outlet_flow_lpm": r1(f.get("out_b", f["b"])), "tripped": self._has("pasteurizer_b", "motor_trip")},
                "homogenizer": {"flow_lpm": r1(f.get("arrive", f["process"]) + n(2)), "pressure_psi": r1(pressure),
                                "valve_position_pct": r1(55 + 60 * self.fouling), "flushing": self.flushing(),
                                "tripped": self._has("homogenizer", "motor_trip")},
                "surge_tank": {"level_pct": r1(100 * tank_rep / TANK_CAP_L), "level_l": round(tank_rep),
                               "flow_in_lpm": r1(f.get("tank_in", f["process"])), "flow_out_lpm": r1(f["draw"]), "temp_c": r2(4.5 + n(0.05)),
                               "tripped": self._has("surge_tank", "motor_trip")},
                "filler": {"flow_lpm": r1(f["draw"]), "demand_lpm": r1(f["demand"]), "pace_pct": r1(self.filler_pace * 100),
                           "starved": f["draw"] < f["demand"] * 0.98, "tripped": self._has("filler", "motor_trip")},
                "packaging": {"rate_lpm": r1(f.get("to_pack", f["draw"])), "units_total": int(self.bottled_l),
                              "cold_room_temp_c": r2(3.5 + n(0.05)), "tripped": self._has("packaging", "motor_trip")},
            },
            "pumps": {p: {"label": PUMP_LABEL[p], "vibration_mms": r2(vib[p]), "failed": self.failed[p],
                          "under_repair": p in self.repairs} for p in PUMPS},
            "counters": {"bottled_l": round(self.bottled_l), "wasted_l": round(self.wasted_l),
                         "unsafe_l": round(self.unsafe_l), "at_risk_l": round(self.at_risk_l),
                         "starved_min": self.starved_min, "lost_l": round(self.lost_l)},
            "setpoints": {"intake_pct": r1(self.intake_cmd * 100), "filler_pace_pct": r1(self.filler_pace * 100),
                          "split_a_pct": r1(self.split_a * 100)},
            "blocked_ips": sorted(self.blocked_ips),
            "quarantined": sorted(self.quarantined),
            "scenario": self.scenario, "scenario_tick": self.scenario_tick, "scenario_target": self.scenario_target,
            "under_repair_units": sorted(u for u, x in self.faults.items() if x["fix_left"] is not None),
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
