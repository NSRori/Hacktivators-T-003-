"""Three-Pillar intelligence & control engine  (Pod 2: Members 3 & 4).

Pillar 1  Production Synchronization  - rolling Z-score drift, NetworkX cascade ETA,
                                         intake throttling, filler pacing, A/B rebalancing,
                                         auto micro-CIP flush (Auto-Sync ON/OFF)
Pillar 2  Predictive Maintenance      - IsolationForest anomaly score + physics-linearised
                                         RUL regression, T_starve / T_overflow, dispatch tickets
Pillar 3  Cyber OT Defense            - Modbus/OPC-UA packet rules, overspeed & spoof
                                         cross-checks, surgical isolation (Auto-Isolate ON/OFF)

Also contains legacy_scada(): the "old" static-threshold monitor used for the split view.
Detectors only read telemetry() + packets - never the plant's hidden truth().
"""
from collections import defaultdict, deque

import networkx as nx
import numpy as np
from sklearn.ensemble import IsolationForest

from engine import (DairyPlant, KNOWN_HOSTS, NOMINAL_FLOW, PAST_SHARE_LPM, PUMP_LABEL, PUMPS,
                    SCADA_MASTER, SILO_CAP_L, TANK_CAP_L, HOMOG_PRESSURE_PSI, VIB_BASE, VIB_FAIL,
                    HOMOG_CAP_LPM)

UNITS = ["silo", "pasteurizer_a", "pasteurizer_b", "homogenizer", "surge_tank", "filler", "packaging"]
LABEL = {"silo": "Raw Chilling Silo", "pasteurizer_a": "Pasteurizer_A", "pasteurizer_b": "Pasteurizer_B",
         "homogenizer": "Homogenizer", "surge_tank": "Surge Tank", "filler": "Aseptic Filler",
         "packaging": "Cold-Chain Packaging", "chiller": "Silo Chiller"}
PUMP_UNIT = {"homogenizer_pump_1": "homogenizer", "pasteurizer_a_pump": "pasteurizer_a"}
RANK = {"OK": 0, "MAINT": 1, "WATCH": 1, "WARN": 2, "QUARANTINED": 2, "CRITICAL": 3}
LEGACY_RANK = {"GREEN": 0, "AMBER": 1, "RED": 2}


def build_graph():
    g = nx.DiGraph()
    g.add_edges_from([("silo", "pasteurizer_a"), ("silo", "pasteurizer_b"),
                      ("pasteurizer_a", "homogenizer"), ("pasteurizer_b", "homogenizer"),
                      ("homogenizer", "surge_tank"), ("surge_tank", "filler"), ("filler", "packaging")])
    return g


# =====================================================================================
# Legacy SCADA: static thresholds on REPORTED values, one unit at a time (no context)
# =====================================================================================
def legacy_scada(tel):
    s, pumps = tel["stages"], tel["pumps"]
    units = {}

    def put(unit, checks):
        status, reason = "GREEN", "within limits"
        for bad, level, why in checks:
            if bad and LEGACY_RANK[level] > LEGACY_RANK[status]:
                status, reason = level, why
        units[unit] = {"status": status, "reason": reason}

    put("silo", [(not 2 <= s["silo"]["temp_c"] <= 6, "AMBER", "temperature out of 2-6 °C"),
                 (s["silo"]["temp_c"] > 8, "RED", "temperature above 8 °C"),
                 (s["silo"]["level_pct"] > 95, "AMBER", "level high"),
                 (s["silo"]["level_pct"] >= 99.5, "RED", "silo overflow")])
    for u in ("pasteurizer_a", "pasteurizer_b"):
        p = s[u]
        pump = "pasteurizer_a_pump" if u == "pasteurizer_a" else None
        put(u, [(p["flow_lpm"] < 1, "AMBER", "no flow"),
                (p["flow_lpm"] > 1 and not 70 <= p["temp_c"] <= 75, "RED", "temperature out of 70-75 °C"),
                (p["flow_lpm"] > 850, "AMBER", "flow above 850 L/min"),
                (pump is not None and pumps[pump]["vibration_mms"] > 4.5, "AMBER", "pump vibration > 4.5 mm/s"),
                (pump is not None and pumps[pump]["failed"], "RED", "pump tripped")])
    h = s["homogenizer"]
    put("homogenizer", [(not 1800 <= h["pressure_psi"] <= 2250, "AMBER", "pressure out of 1800-2250 PSI"),
                        (h["pressure_psi"] < 100, "RED", "no pressure"),
                        (pumps["homogenizer_pump_1"]["vibration_mms"] > 4.5, "AMBER", "pump vibration > 4.5 mm/s"),
                        (pumps["homogenizer_pump_1"]["failed"], "RED", "pump tripped")])
    put("surge_tank", [(s["surge_tank"]["level_pct"] < 10, "AMBER", "level low"),
                       (s["surge_tank"]["level_pct"] < 3, "RED", "tank empty"),
                       (s["surge_tank"]["level_pct"] > 95, "AMBER", "level high")])
    put("filler", [(s["filler"]["flow_lpm"] < 50, "RED", "no product flow")])
    put("packaging", [(s["packaging"]["cold_room_temp_c"] > 6, "AMBER", "cold room warm")])
    overall = max((u["status"] for u in units.values()), key=lambda x: LEGACY_RANK[x])
    return {"overall": overall, "units": units}


# =====================================================================================
# Feature extraction + baseline model (trained once on a healthy plant)
# =====================================================================================
FEATURE_NAMES = ["vib_homog_pump", "vib_homog_slope", "vib_pastA_pump", "vib_pastA_slope",
                 "homog_pressure_mean", "homog_pressure_std"]
FEATURE_UNIT = ["homogenizer_pump_1", "homogenizer_pump_1", "pasteurizer_a_pump", "pasteurizer_a_pump",
                "homogenizer", "homogenizer_pump_1"]


def _slope(y):
    return float(np.polyfit(np.arange(len(y)), y, 1)[0]) if len(y) >= 5 else 0.0


def features(hist):
    last = list(hist)[-15:]
    vh = [t["pumps"]["homogenizer_pump_1"]["vibration_mms"] for t in last]
    va = [t["pumps"]["pasteurizer_a_pump"]["vibration_mms"] for t in last]
    pr = [t["stages"]["homogenizer"]["pressure_psi"] for t in last]
    return np.array([np.mean(vh[-3:]), _slope(vh), np.mean(va[-3:]), _slope(va), np.mean(pr[-5:]), np.std(pr)])


_BASELINE = None


def baseline():
    """Train IsolationForest on 500 minutes of healthy operation (cached, ~1 s)."""
    global _BASELINE
    if _BASELINE is None:
        plant, hist, rows = DairyPlant(seed=2024), deque(maxlen=60), []
        for i in range(500):
            hist.append(plant.step())
            if i >= 30:
                rows.append(features(hist))
        x = np.array(rows)
        model = IsolationForest(n_estimators=150, random_state=0).fit(x)
        raw = -model.score_samples(x)
        _BASELINE = (model, {"mu": x.mean(0), "sd": x.std(0) + 1e-9,
                             "s50": float(np.percentile(raw, 50)), "s995": float(np.percentile(raw, 99.5))})
    return _BASELINE


# =====================================================================================
class ThreePillarEngine:
    def __init__(self, plant, auto_sync=True, auto_isolate=True):
        self.plant = plant
        self.auto_sync = auto_sync
        self.auto_isolate = auto_isolate
        self.G = build_graph()
        self.model, self.base = baseline()
        self.h = deque(maxlen=60)
        self.alerts = deque(maxlen=40)
        self.tickets = []
        self.log = deque(maxlen=80)
        self.consec = defaultdict(int)
        self.last_alert = {}
        self.last_txn = {}
        self.pkt_ewma = 5.0
        self.dropped = 0
        self.n_alert = self.n_ticket = 0
        self.uw_sources = defaultdict(set)    # unit -> IPs that sent unauthorized writes
        self.last_logged = {"intake": 100.0, "pace": 100.0, "split": 50.0}
        self.flush_requested = False
        self.scn_tick = None
        self.first_engine = self.first_legacy = None
        self.bottled_hist = deque(maxlen=30)
        self.scn_bottled0 = 0.0
        self.anomaly = 0.0
        plant.log_sink = self.log

    # ------------------------------------------------------------------ utils
    def _log(self, level, source, msg):
        self.log.append({"tick": self.plant.tick, "level": level, "source": source, "msg": msg})

    def _alert(self, key, severity, typ, unit, msg, src=None, dedupe=20):
        t = self.plant.tick
        if key in self.last_alert and t - self.last_alert[key] < dedupe:
            return None
        self.last_alert[key] = t
        self.n_alert += 1
        a = {"id": f"SOC-{self.n_alert:03d}", "tick": t, "severity": severity, "type": typ,
             "unit": unit, "src": src, "msg": msg, "action": None}
        self.alerts.appendleft(a)
        self._log("crit" if severity == "CRITICAL" else "warn", "pillar3", f"[{typ}] {msg}")
        return a

    def set_auto_sync(self, on):
        self.auto_sync = bool(on)
        if not on:                      # back to fixed legacy set-points
            p = self.plant
            p.set_intake(1.0)
            p.set_filler_pace(1.0)
            p.set_split(0.5)
        self._log("info", "pillar1", f"Auto-Sync switched {'ON' if on else 'OFF'}")

    def manual_isolate(self, unit):
        """Operator-requested surgical isolation (same NetworkX path check as the auto response)."""
        if unit not in ("pasteurizer_a", "pasteurizer_b"):
            return False, "only Pasteurizer_A / Pasteurizer_B can be isolated"
        g = self.G.copy()
        g.remove_nodes_from(list(self.plant.quarantined) + [unit])
        if not nx.has_path(g, "silo", "packaging"):
            return False, "refused: isolating it would leave no path from silo to packaging"
        if not self.plant.quarantine(unit):
            return False, "already isolated"
        self._log("crit", "pillar3", f"MANUAL ISOLATION: {LABEL[unit]} quarantined by operator")
        return True, f"{LABEL[unit]} isolated"

    def set_auto_isolate(self, on):
        self.auto_isolate = bool(on)
        self._log("info", "pillar3", f"Auto-Isolate switched {'ON' if on else 'OFF'}")

    # ------------------------------------------------------------------ main entry
    def analyze(self, tel, packets):
        p = self.plant
        self.h.append(tel)
        s = tel["stages"]
        legacy = legacy_scada(tel)

        if tel["scenario_tick"] is not None and tel["scenario_tick"] != self.scn_tick:
            self.scn_tick = tel["scenario_tick"]
            self.first_engine = self.first_legacy = None
            self.scn_bottled0 = tel["counters"]["bottled_l"]

        # ---------------- Pillar 2: anomaly model ----------------
        z = np.zeros(len(FEATURE_NAMES))
        top = None
        if len(self.h) >= 15:
            f = features(self.h)
            raw = -self.model.score_samples(f.reshape(1, -1))[0]
            b = self.base
            self.anomaly = float(np.clip((raw - b["s50"]) / (b["s995"] - b["s50"]) / 2, 0, 1))
            z = (f - b["mu"]) / b["sd"]
            top = FEATURE_NAMES[int(np.argmax(np.abs(z)))]
        self.consec["anom"] = self.consec["anom"] + 1 if self.anomaly >= 0.6 else 0
        anomaly_flag = self.consec["anom"] >= 3
        rul = {pm: self._rul(pm) for pm in PUMPS}

        # ---------------- Pillar 1: drift + buffer forecasting ----------------
        z_press = float(z[4])
        self.consec["drift"] = self.consec["drift"] + 1 if z_press > 4 else 0
        drift = self.consec["drift"] >= 3
        press5 = float(np.mean([t["stages"]["homogenizer"]["pressure_psi"] for t in list(self.h)[-5:]]))
        est_f = max(0.0, (press5 - HOMOG_PRESSURE_PSI) / 400) if drift else 0.0
        t_bottleneck = self._t_bottleneck() if drift else None
        last5 = list(self.h)[-5:]
        tank_net = np.mean([t["stages"]["surge_tank"]["flow_in_lpm"] - t["stages"]["surge_tank"]["flow_out_lpm"] for t in last5])
        silo_net = np.mean([t["stages"]["silo"]["intake_lpm"] - t["stages"]["silo"]["flow_out_lpm"] for t in last5])
        t_starve = s["surge_tank"]["level_l"] / -tank_net if tank_net < -5 else None
        t_overflow = (SILO_CAP_L - s["silo"]["level_l"]) / silo_net if silo_net > 5 else None
        thr = np.mean([t["stages"]["filler"]["flow_lpm"] for t in last5])
        z_thr = (thr - NOMINAL_FLOW) / 5.0
        z_net = tank_net / 5.0

        # ---------------- Pillar 2: tickets ----------------
        self._update_tickets(tel, rul, anomaly_flag, drift, est_f, t_bottleneck)

        # ---------------- Pillar 3: OT defense ----------------
        checks = self._cyber(tel, packets)

        # ---------------- Pillar 1: closed-loop control ----------------
        if self.auto_sync:
            self._control(tel, drift, est_f)

        # ---------------- unit statuses + cascade ----------------
        units = self._statuses(tel, drift, est_f, rul, t_starve, t_overflow)
        cascade = self._cascade(units, t_starve, t_overflow, t_bottleneck)
        overall = max((u["status"] for u in units.values()), key=lambda x: RANK[x])

        # ---------------- detection lead time ----------------
        if self.scn_tick is not None:
            if self.first_engine is None and (overall != "OK" or self.alerts and self.alerts[0]["tick"] > self.scn_tick):
                self.first_engine = tel["tick"]
            # ignore "no flow" alarms on cells WE isolated - that is our response, not legacy detection
            legacy_alarm = any(v["status"] != "GREEN" for k, v in legacy["units"].items() if k not in tel["quarantined"])
            if self.first_legacy is None and legacy_alarm:
                self.first_legacy = tel["tick"]

        # ---------------- KPIs ----------------
        self.bottled_hist.append(s["filler"]["flow_lpm"])
        since = tel["tick"] - self.scn_tick if self.scn_tick is not None else 0
        scn_ret = (100 * (tel["counters"]["bottled_l"] - self.scn_bottled0) / (NOMINAL_FLOW * since)) if since > 0 else None
        threat = "NORMAL"
        recent = [a for a in self.alerts if tel["tick"] - a["tick"] <= 15]
        if recent:
            threat = "CRITICAL" if any(a["severity"] == "CRITICAL" for a in recent) else "ELEVATED"

        return {
            "legacy": legacy,
            "engine": {
                "overall": overall, "units": units,
                "pillar1": {"auto_sync": self.auto_sync, "drift_detected": drift,
                            "root_cause": "Homogenizer valve fouling" if drift else None,
                            "z": {"homog_pressure": round(z_press, 2), "surge_net_flow": round(float(z_net), 2),
                                  "throughput": round(float(z_thr), 2)},
                            "est_fouling_pct": round(est_f * 100, 1) if drift else None,
                            "t_to_bottleneck_min": _r(t_bottleneck), "t_starve_min": _r(t_starve),
                            "t_overflow_min": _r(t_overflow), "cascade": cascade, "setpoints": tel["setpoints"]},
                "pillar2": {"anomaly_score": round(self.anomaly, 3), "anomaly_flag": anomaly_flag,
                            "top_feature": top, "z": {n: round(float(v), 2) for n, v in zip(FEATURE_NAMES, z)},
                            "rul_min": {pm: _r(v) for pm, v in rul.items()},
                            "tickets": self.tickets[-12:][::-1]},
                "pillar3": {"auto_isolate": self.auto_isolate, "threat_level": threat,
                            "alerts": list(self.alerts)[:25], "blocked_ips": tel["blocked_ips"],
                            "isolated_units": tel["quarantined"], "packets_per_tick": len(packets),
                            "dropped_packets": self.dropped, "checks": checks},
                "detection": {"scenario": tel["scenario"], "scenario_tick": self.scn_tick,
                              "engine_first_tick": self.first_engine, "legacy_first_tick": self.first_legacy,
                              "lead_min": (self.first_legacy - self.first_engine)
                              if self.first_engine is not None and self.first_legacy is not None else None},
            },
            "kpi": {"throughput_lpm": round(float(np.mean(self.bottled_hist)), 1), "nominal_lpm": NOMINAL_FLOW,
                    "retention_pct": round(100 * float(np.mean(self.bottled_hist)) / NOMINAL_FLOW, 1),
                    "scenario_retention_pct": round(scn_ret, 1) if scn_ret is not None else None,
                    **tel["counters"]},
            "log": list(self.log)[-50:][::-1],
        }

    # ================================================================== Pillar 2
    def _rul(self, pump):
        """Seal wear follows vib - base ∝ wear^1.5, so (vib - base)^(2/3) is linear in time:
        fit a line to the last 25 samples and extrapolate to the failure threshold."""
        vib = np.array([t["pumps"][pump]["vibration_mms"] for t in list(self.h)[-25:]])
        if len(vib) < 15 or self.h[-1]["pumps"][pump]["failed"]:
            return 0.0 if self.h[-1]["pumps"][pump]["failed"] else None
        if vib[-5:].mean() < VIB_BASE + 0.25:
            return None
        y = np.clip(vib - VIB_BASE, 0, None) ** (2 / 3)
        slope, icpt = np.polyfit(np.arange(len(y)), y, 1)
        if slope <= 1e-4:
            return None
        y_fail = (VIB_FAIL - VIB_BASE) ** (2 / 3)
        return float(max(0.0, (y_fail - (icpt + slope * (len(y) - 1))) / slope))

    def _t_bottleneck(self):
        """Minutes until the fouling trend pushes homogenizer capacity below plant demand."""
        pr = np.array([t["stages"]["homogenizer"]["pressure_psi"] for t in list(self.h)[-20:]])
        f = (pr - HOMOG_PRESSURE_PSI) / 400
        f_crit = 1 - NOMINAL_FLOW / HOMOG_CAP_LPM            # 20 % fouling
        now = float(np.mean(f[-5:]))
        if now >= f_crit:
            return 0.0
        slope = _slope(f)
        return (f_crit - now) / slope if slope > 1e-4 else None

    def _ticket(self, unit, label, issue, kind):
        self.n_ticket += 1
        t = {"id": f"MT-{self.n_ticket:03d}", "unit": unit, "label": label, "issue": issue, "kind": kind,
             "status": "OPEN", "priority": "MEDIUM", "rul_min": None, "metric": "", "window": "",
             "created_tick": self.plant.tick, "dispatched_tick": None, "resolved_tick": None, "auto": False}
        self.tickets.append(t)
        self._log("warn", "pillar2", f"Maintenance ticket {t['id']} opened: {label} - {issue}")
        return t

    def _open(self, unit):
        return next((t for t in self.tickets if t["unit"] == unit and t["status"] in ("OPEN", "DISPATCHED")), None)

    def dispatch(self, ticket_id, auto=False):
        t = next((t for t in self.tickets if t["id"] == ticket_id), None)
        if t is None or t["status"] not in ("OPEN", "FAILED"):
            return False
        ok = self.plant.start_flush() if t["kind"] == "fouling" else self.plant.dispatch_repair(t["unit"])
        if ok:
            t["status"], t["dispatched_tick"], t["auto"] = "DISPATCHED", self.plant.tick, auto
            self._log("info", "pillar2", f"{t['id']} {'auto-' if auto else ''}dispatched: {t['label']}")
        return ok

    def _update_tickets(self, tel, rul, anomaly_flag, drift, est_f, t_bottleneck):
        pumps = tel["pumps"]
        for pm in PUMPS:
            r = rul[pm]
            tk = self._open(pm)
            if tk is None and r is not None and not pumps[pm]["failed"] and (anomaly_flag or r < 60):
                tk = self._ticket(pm, PUMP_LABEL[pm], "Seal wear - vibration trending up", "seal")
            if tk is None:
                continue
            v = pumps[pm]["vibration_mms"]
            if pumps[pm]["failed"]:
                if tk["status"] == "OPEN" or not pumps[pm]["under_repair"]:
                    tk["status"], tk["rul_min"] = "FAILED", 0
                    tk["metric"] = "seal failed before repair"
                continue
            if tk["status"] == "DISPATCHED" and not pumps[pm]["under_repair"] and v < VIB_BASE + 0.3:
                tk["status"], tk["resolved_tick"] = "RESOLVED", tel["tick"]
                tk["metric"] = f"vibration back to {v:.2f} mm/s"
                self._log("info", "pillar2", f"{tk['id']} resolved: {tk['label']} seal replaced")
                continue
            if r is not None:
                tk["rul_min"] = round(r)
                tk["priority"] = "CRITICAL" if r < 30 else "HIGH" if r < 90 else "MEDIUM"
                tk["window"] = f"Replace seal within {max(5, r * 0.5):.0f} min"
            slope = _slope([t["pumps"][pm]["vibration_mms"] for t in list(self.h)[-15:]])
            tk["metric"] = f"vibration {v:.2f} mm/s ({slope:+.3f}/min), fail at {VIB_FAIL} mm/s"
            if self.auto_sync and tk["status"] == "OPEN" and tk["priority"] == "CRITICAL":
                self.dispatch(tk["id"], auto=True)

        # homogenizer valve fouling ticket
        tk = self._open("homogenizer")
        flushing = tel["stages"]["homogenizer"]["flushing"]
        if tk is None and drift and not flushing:
            tk = self._ticket("homogenizer", "Homogenizer Valve #1", "Valve fouling - silent throughput drift", "fouling")
        if tk is not None:
            if tk["status"] == "DISPATCHED" and not flushing:
                tk["status"], tk["resolved_tick"] = "RESOLVED", tel["tick"]
                tk["metric"] = "micro-CIP flush complete"
                self._log("info", "pillar2", f"{tk['id']} resolved: valve flushed")
            elif tk["status"] == "OPEN":
                tk["rul_min"] = _r(t_bottleneck)
                tk["priority"] = ("CRITICAL" if t_bottleneck is not None and t_bottleneck < 10
                                  else "HIGH" if t_bottleneck is not None and t_bottleneck < 40 else "MEDIUM")
                tk["metric"] = f"est. fouling {est_f * 100:.0f} %, pressure still inside normal band"
                tk["window"] = "Micro-CIP flush before capacity < 800 L/min"

    # ================================================================== Pillar 3
    def _cyber(self, tel, packets):
        s = tel["stages"]
        crit = []
        for pk in packets:
            src = pk["src"]
            if pk["blocked"]:
                self.dropped += 1
                continue
            if src not in KNOWN_HOSTS:
                self._alert(("unknown", src), "HIGH", "UNKNOWN_SOURCE", pk["unit"],
                            f"Traffic from unknown host {src} ({pk['func_name']} -> {LABEL.get(pk['unit'], pk['unit'])})",
                            src=src, dedupe=30)
            if pk["op"] == "WRITE" and src != SCADA_MASTER:
                a = self._alert(("uw", src, pk["unit"], pk["register"]), "CRITICAL", "UNAUTHORIZED_WRITE", pk["unit"],
                                f"{src} wrote {pk['register']}={pk['value']} on {LABEL.get(pk['unit'], pk['unit'])} PLC",
                                src=src, dedupe=10)
                self.uw_sources[pk["unit"]].add(src)
                if a:
                    crit.append(a)
            last = self.last_txn.get(src)
            if last is not None and not 0 < pk["txn"] - last <= 5:
                self._alert(("seq", src), "MEDIUM", "OUT_OF_SEQUENCE", pk["unit"],
                            f"Out-of-sequence Modbus frames from {src} (txn {last} -> {pk['txn']})", src=src, dedupe=30)
            self.last_txn[src] = pk["txn"]
        n = len(packets)
        if n > max(10, 2.2 * self.pkt_ewma):
            self._alert(("burst",), "HIGH", "PACKET_BURST", "network",
                        f"Packet burst: {n} frames/min vs baseline {self.pkt_ewma:.1f}", dedupe=20)
        else:
            self.pkt_ewma = 0.95 * self.pkt_ewma + 0.05 * n

        checks = {}
        split = tel["setpoints"]["split_a_pct"] / 100
        for u, share in (("pasteurizer_a", split), ("pasteurizer_b", 1 - split)):
            st = s[u]
            implied = max(0.0, (st["drive_current_a"] - 4) / 16 * PAST_SHARE_LPM) if st["drive_current_a"] > 0 else 0.0
            expected = NOMINAL_FLOW * share
            rep = st["flow_lpm"]
            mism = abs(rep - implied) / implied if implied > 50 else 0.0
            checks[u] = {"reported_flow": rep, "implied_flow": round(implied, 1), "expected_flow": round(expected, 1),
                         "mismatch_pct": round(mism * 100, 1)}
            if st["quarantined"]:
                continue
            self.consec[("over", u)] = self.consec[("over", u)] + 1 if expected > 50 and implied / expected > 1.25 else 0
            if self.consec[("over", u)] >= 2:
                a = self._alert(("over", u), "CRITICAL", "OVERSPEED", u,
                                f"{LABEL[u]} physical flow {implied:.0f} L/min = {100 * (implied / expected - 1):+.0f} % "
                                f"vs set-point - milk may not reach 72 °C", dedupe=15)
                if a:
                    crit.append(a)
            self.consec[("spoof", u)] = self.consec[("spoof", u)] + 1 if mism > 0.12 else 0
            if self.consec[("spoof", u)] >= 2:
                down = s["surge_tank"]["flow_in_lpm"]
                tot = s["pasteurizer_a"]["flow_lpm"] + s["pasteurizer_b"]["flow_lpm"]
                a = self._alert(("spoof", u), "CRITICAL", "TELEMETRY_SPOOF", u,
                                f"{LABEL[u]} PLC reports {rep:.0f} L/min but drive current implies {implied:.0f}; "
                                f"downstream tank inflow {down:.0f} vs reported total {tot:.0f}", dedupe=15)
                if a:
                    crit.append(a)
        inlet = (s["pasteurizer_a"]["inlet_temp_c"] + s["pasteurizer_b"]["inlet_temp_c"]) / 2
        diff = inlet - s["silo"]["temp_c"]
        checks["chiller"] = {"reported_c": s["silo"]["temp_c"], "inlet_c": round(inlet, 2), "diff_c": round(diff, 2)}
        self.consec["chill"] = self.consec["chill"] + 1 if diff > 1.5 else 0
        if self.consec["chill"] >= 3:
            a = self._alert(("chill",), "CRITICAL", "CHILLER_SPOOF", "chiller",
                            f"Silo chiller reports {s['silo']['temp_c']:.1f} °C but pasteurizer inlets read "
                            f"{inlet:.1f} °C - sensor spoof", dedupe=20)
            if a:
                crit.append(a)
        for a in crit:
            self._respond(a)
        return checks

    def _respond(self, alert):
        """Surgical isolation: quarantine only the compromised cell, never the whole plant."""
        if not self.auto_isolate:
            return
        p, unit = self.plant, alert["unit"]
        acts = []
        if unit in ("pasteurizer_a", "pasteurizer_b") and unit not in p.quarantined:
            g = self.G.copy()
            g.remove_nodes_from(list(p.quarantined) + [unit])
            if nx.has_path(g, "silo", "packaging"):
                p.quarantine(unit)
                twin = "pasteurizer_b" if unit == "pasteurizer_a" else "pasteurizer_a"
                acts.append(f"{LABEL[unit]} quarantined, 100 % flow rerouted via {LABEL[twin]}")
            else:
                acts.append(f"isolation of {LABEL[unit]} refused - no alternate path")
        if unit == "chiller" and p.engage_chiller_failover():
            acts.append("chiller segment isolated, backup chiller + redundant sensor engaged")
        for ip in set(self.uw_sources.get(unit, set())) | ({alert["src"]} if alert["src"] else set()):
            if ip != SCADA_MASTER and p.block_ip(ip):
                acts.append(f"firewall blocked {ip}")
        if acts:
            alert["action"] = "; ".join(acts)
            self._log("crit", "pillar3", "AUTO-RESPONSE: " + alert["action"])

    # ================================================================== Pillar 1
    def _control(self, tel, drift, est_f):
        p, s = self.plant, tel["stages"]
        flow = float(np.mean([t["stages"]["homogenizer"]["flow_lpm"] for t in list(self.h)[-3:]]))
        # 1) upstream intake throttling: match downstream capability, hold silo at 50 %
        intake = np.clip(flow + 0.02 * (0.5 * SILO_CAP_L - s["silo"]["level_l"]), 0.3 * NOMINAL_FLOW, 1.05 * NOMINAL_FLOW)
        p.set_intake(intake / NOMINAL_FLOW)
        # 2) filler pacing: use the surge tank as a buffer, defend the 35-65 % band
        lvl, tank_l = s["surge_tank"]["level_pct"], s["surge_tank"]["level_l"]
        if lvl < 35:
            pace = (flow + 0.05 * (tank_l - 0.35 * TANK_CAP_L)) / NOMINAL_FLOW
        elif lvl > 65:
            pace = (flow + 0.05 * (tank_l - 0.65 * TANK_CAP_L)) / NOMINAL_FLOW
        else:
            pace = p.filler_pace + 0.05 * np.sign(1.0 - p.filler_pace) if abs(1.0 - p.filler_pace) > 0.05 else 1.0
        p.set_filler_pace(np.clip(pace, 0.4, 1.2))
        # 3) parallel load rebalancing away from a degraded / failed Pasteurizer_A
        a_ticket = self._open("pasteurizer_a_pump")
        if tel["pumps"]["pasteurizer_a_pump"]["failed"]:
            p.set_split(0.0)
        elif a_ticket is not None:
            p.set_split(0.3)
        else:
            p.set_split(0.5)
        # 4) silent drift: schedule a micro-CIP flush while capacity is still above demand
        tk = self._open("homogenizer")
        if drift and tk is not None and tk["status"] == "OPEN" and est_f >= 0.12:
            self.dispatch(tk["id"], auto=True)
        self._log_setpoints(tel)

    def _log_setpoints(self, tel):
        sp = {"intake": self.plant.intake_cmd * 100, "pace": self.plant.filler_pace * 100, "split": self.plant.split_a * 100}
        text = {"intake": "Raw-milk intake throttled to {:.0f} %", "pace": "Aseptic filler paced to {:.0f} %",
                "split": "Load rebalanced: Pasteurizer_A {:.0f} % / Pasteurizer_B {:.0f} %"}
        for k, v in sp.items():
            if abs(v - self.last_logged[k]) >= 5 or (k == "split" and v != self.last_logged[k] and v in (0, 50, 100)):
                msg = text[k].format(v, 100 - v) if k == "split" else text[k].format(v)
                self._log("action", "pillar1", msg)
                self.last_logged[k] = v

    # ================================================================== statuses
    def _statuses(self, tel, drift, est_f, rul, t_starve, t_overflow):
        s, t = tel["stages"], tel["tick"]
        u = {k: {"status": "OK", "reason": "nominal"} for k in UNITS}

        def bump(unit, status, reason):
            if RANK[status] >= RANK[u[unit]["status"]]:
                u[unit] = {"status": status, "reason": reason}

        for a in self.alerts:
            if t - a["tick"] <= 10 and a["unit"] in u:
                bump(a["unit"], "CRITICAL" if a["severity"] == "CRITICAL" else "WARN", a["type"].replace("_", " ").lower())
            if t - a["tick"] <= 10 and a["unit"] == "chiller" and not tel["chiller_failover"]:
                bump("silo", "CRITICAL", "chiller sensor spoofed")
        if tel["chiller_failover"]:
            bump("silo", "WATCH", "backup chiller engaged")
        for pm in PUMPS:
            unit, r, tk = PUMP_UNIT[pm], rul[pm], self._open(pm)
            if tel["pumps"][pm]["failed"]:
                bump(unit, "CRITICAL", f"{PUMP_LABEL[pm]} failed")
            elif tk is not None:
                lvl = "CRITICAL" if r is not None and r < 30 else "WARN"
                bump(unit, "MAINT" if tk["status"] == "DISPATCHED" else lvl,
                     f"{PUMP_LABEL[pm]} RUL {r:.0f} min" if r is not None else "seal wear")
        if drift:
            bump("homogenizer", "WARN", f"silent valve fouling ~{est_f * 100:.0f} % (pressure z-score drift)")
        if s["homogenizer"]["flushing"]:
            bump("homogenizer", "MAINT", "micro-CIP flush in progress")
        lvl = s["surge_tank"]["level_pct"]
        if lvl < 10:
            bump("surge_tank", "CRITICAL", "surge tank nearly empty")
        elif t_starve is not None and t_starve < 30:
            bump("surge_tank", "WARN", f"draining - empty in {t_starve:.0f} min")
        if s["filler"]["starved"]:
            bump("filler", "CRITICAL", "starved - no milk in surge tank")
            bump("packaging", "WARN", "reduced dispatch rate")
        if s["silo"]["level_pct"] > 98:
            bump("silo", "CRITICAL", "overflow - milk to drain")
        elif t_overflow is not None and t_overflow < 60:
            bump("silo", "WARN", f"filling - overflow in {t_overflow:.0f} min")
        for unit in tel["quarantined"]:
            u[unit] = {"status": "QUARANTINED", "reason": "isolated by diversion valve"}
        return u

    def _cascade(self, units, t_starve, t_overflow, t_bottleneck):
        """Walk the NetworkX dependency graph from each root cause to the stages it will hit."""
        roots = [n for n in ("homogenizer", "pasteurizer_a", "pasteurizer_b")
                 if units[n]["status"] in ("WARN", "CRITICAL")]
        out, seen = [], set()
        for r in roots:
            for n in nx.descendants(self.G, r):
                if n in seen:
                    continue
                seen.add(n)
                eta = t_starve if t_starve is not None else t_bottleneck
                out.append({"from": r, "node": n, "effect": "starvation" if n == "surge_tank" else "slowdown",
                            "eta_min": _r(eta)})
            if r == "homogenizer":
                for n in nx.ancestors(self.G, r):
                    if n == "silo" and n not in seen:
                        seen.add(n)
                        out.append({"from": r, "node": n, "effect": "overflow / spoilage",
                                    "eta_min": _r(t_overflow)})
        return out


def _r(x):
    return None if x is None else round(float(x), 1)
