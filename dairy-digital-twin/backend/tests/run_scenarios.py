r"""Headless verification of every demo scenario (no server, no browser).

    cd backend
    ..\.venv\Scripts\python tests\run_scenarios.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from engine import DairyPlant                       # noqa: E402
from intelligence import ThreePillarEngine          # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(f"   [{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(name)


def run(scenario=None, auto_sync=True, auto_isolate=True, ticks=200, warmup=30, target="homogenizer_pump_1",
        seed=42, on_tick=None):
    plant = DairyPlant(seed=seed)
    brain = ThreePillarEngine(plant, auto_sync=auto_sync, auto_isolate=auto_isolate)
    frames = []
    for i in range(warmup + ticks):
        if scenario and i == warmup:
            plant.trigger(scenario, target=target)
        tel = plant.step()
        out = brain.analyze(tel, plant.packets)
        frames.append({"tel": tel, "out": out, "truth": plant.truth()})
        if on_tick:
            on_tick(i - warmup, plant, brain, out)
    return plant, brain, frames


def last(frames):
    return frames[-1]["out"]


print("\n=== NORMAL OPERATION (300 min) ===")
p, b, fr = run(None, ticks=300)
k = last(fr)["kpi"]
lv = [f["tel"]["stages"]["surge_tank"]["level_pct"] for f in fr]
check("throughput ~800 L/min", abs(k["throughput_lpm"] - 800) < 5, f"({k['throughput_lpm']})")
check("surge tank steady ~50 %", min(lv) > 45 and max(lv) < 55, f"(range {min(lv)}-{max(lv)})")
check("no waste / unsafe / starvation", k["wasted_l"] == 0 and k["unsafe_l"] == 0 and k["starved_min"] == 0)
check("legacy GREEN and engine OK", last(fr)["legacy"]["overall"] == "GREEN" and last(fr)["engine"]["overall"] == "OK",
      f"(engine {last(fr)['engine']['overall']})")
check("no false cyber alerts", len(b.alerts) == 0, f"({[a['type'] for a in b.alerts]})")
check("no false tickets", len(b.tickets) == 0)
mx = max(f["out"]["engine"]["pillar2"]["anomaly_score"] for f in fr[30:])
print(f"   max anomaly score in normal run: {mx:.3f}")

print("\n=== SCENARIO 1: SILENT HOMOGENIZER DRIFT (200 min) ===")
res = {}
for sync in (False, True):
    p, b, fr = run("drift", auto_sync=sync, ticks=200)
    o = last(fr)
    det = next((f["tel"]["tick"] - 30 for f in fr if f["out"]["engine"]["pillar1"]["drift_detected"]), None)
    legacy_hom = [f["out"]["legacy"]["units"]["homogenizer"]["status"] for f in fr]
    res[sync] = o["kpi"]
    print(f"   Auto-Sync {'ON ' if sync else 'OFF'}: retention since trigger {o['kpi']['scenario_retention_pct']} % | "
          f"last-30 {o['kpi']['retention_pct']} % | wasted {o['kpi']['wasted_l']} L | starved {o['kpi']['starved_min']} min | "
          f"drift detected +{det} min | legacy homogenizer always GREEN: {all(x == 'GREEN' for x in legacy_hom)} | "
          f"legacy first alarm tick {o['engine']['detection']['legacy_first_tick']}")
    lv = [f["tel"]["stages"]["surge_tank"]["level_pct"] for f in fr[30:]]
    print(f"      surge tank range {min(lv)}-{max(lv)} %, final fouling {fr[-1]['truth']['fouling_pct']} %, "
          f"tickets {[(t['id'], t['status']) for t in b.tickets]}")
check("drift detected early while legacy homogenizer GREEN", det is not None and det < 20, f"(+{det} min)")
check("OFF: throughput collapses (~30 % drop)", res[False]["retention_pct"] < 75, f"({res[False]['retention_pct']} %)")
check("ON: retention > 90 %", res[True]["scenario_retention_pct"] > 90, f"({res[True]['scenario_retention_pct']} %)")
check("ON: no milk wasted", res[True]["wasted_l"] == 0)

print("\n=== SCENARIO 2: PUMP SEAL WEAR (homogenizer pump) ===")
for sync, manual in ((False, False), (False, True), (True, False)):
    events = {}

    def hook(t, plant, brain, out, events=events, manual=manual):
        tk = next((x for x in brain.tickets if x["kind"] == "seal"), None)
        if tk and "ticket" not in events:
            events["ticket"] = (t, tk["rul_min"], round((1 - plant.wear["homogenizer_pump_1"]) * 160))
        if plant.failed["homogenizer_pump_1"] and "fail" not in events:
            events["fail"] = t
        if manual and tk and tk["status"] == "OPEN" and tk["rul_min"] is not None and tk["rul_min"] < 60:
            brain.dispatch(tk["id"])
            events["dispatch"] = t

    p, b, fr = run("pump_wear", auto_sync=sync, ticks=200, on_tick=hook)
    o = last(fr)
    lab = f"Auto-Sync {'ON ' if sync else 'OFF'}{' + manual dispatch' if manual else ''}"
    print(f"   {lab}: ticket at +{events.get('ticket', ('-',))[0]} min (RUL est {events.get('ticket', (0, '-'))[1]}, "
          f"true ~{events.get('ticket', (0, 0, '-'))[2]}) | failure at {events.get('fail')} | "
          f"legacy first alarm +{(o['engine']['detection']['legacy_first_tick'] or 0) - 30} | "
          f"retention {o['kpi']['scenario_retention_pct']} % | tickets {[(t['id'], t['status']) for t in b.tickets]}")
    if not sync and not manual:
        check("OFF + no dispatch: pump eventually fails", events.get("fail") is not None)
        check("ticket raised well before failure", events.get("ticket") and events["ticket"][0] < events["fail"] - 60)
    else:
        check(f"{lab}: no failure", events.get("fail") is None)

# RUL accuracy along the way
errs = []


def rul_hook(t, plant, brain, out):
    r = out["engine"]["pillar2"]["rul_min"]["homogenizer_pump_1"]
    w = plant.wear["homogenizer_pump_1"]
    if r is not None and 0.2 < w < 0.95:
        load = plant.flows["process"] / 800
        errs.append((t, r, (1 - w) * 160 / max(load, 0.1)))


run("pump_wear", auto_sync=False, ticks=150, on_tick=rul_hook)
for t, r, tr in errs[::15]:
    print(f"      t=+{t:3d}  RUL predicted {r:6.1f}  vs true {tr:6.1f}")

print("\n=== SCENARIO 2b: PASTEURIZER_A FEED PUMP WEAR (rebalancing) ===")
for sync in (False, True):
    p, b, fr = run("pump_wear", auto_sync=sync, ticks=220, target="pasteurizer_a_pump")
    o = last(fr)
    print(f"   Auto-Sync {'ON ' if sync else 'OFF'}: wear {fr[-1]['truth']['wear_pct']['pasteurizer_a_pump']} % | "
          f"failed {p.failed['pasteurizer_a_pump']} | split_a {o['engine']['pillar1']['setpoints']['split_a_pct']} % | "
          f"retention {o['kpi']['scenario_retention_pct']} % | tickets {[(t['id'], t['status']) for t in b.tickets]}")

print("\n=== SCENARIO 3: PASTEURIZER_A CYBER SPIKE + SPOOF ===")
for iso in (False, True):
    p, b, fr = run("cyber_spike", auto_isolate=iso, ticks=60)
    o = last(fr)
    types = sorted({a["type"] for a in b.alerts})
    leg = [f["out"]["legacy"]["units"]["pasteurizer_a"]["status"] for f in fr]
    print(f"   Auto-Isolate {'ON ' if iso else 'OFF'}: unsafe {o['kpi']['unsafe_l']} L | quarantined {o['engine']['pillar3']['isolated_units']} | "
          f"blocked {o['engine']['pillar3']['blocked_ips']} | retention {o['kpi']['scenario_retention_pct']} % | "
          f"legacy pasteurizer_a statuses {sorted(set(leg))}")
    print(f"      alert types: {types}")
    if iso:
        check("isolation happened", "pasteurizer_a" in o["engine"]["pillar3"]["isolated_units"])
        check("throughput kept via Pasteurizer_B", o["kpi"]["retention_pct"] > 97, f"({o['kpi']['retention_pct']} %)")
        check("B carries 100 %", o["engine"]["pillar1"]["setpoints"]["split_a_pct"] == 0)
    else:
        check("spoof + overspeed detected", {"TELEMETRY_SPOOF", "OVERSPEED", "UNAUTHORIZED_WRITE"} <= set(types))
        check("legacy SCADA stays GREEN on Pasteurizer_A", set(leg) == {"GREEN"})
        check("unsafe milk accumulates when not isolated", o["kpi"]["unsafe_l"] > 10000)

print("\n=== SCENARIO 4: CHILLER SENSOR SPOOF ===")
for iso in (False, True):
    p, b, fr = run("chiller_spoof", auto_isolate=iso, ticks=80)
    o = last(fr)
    print(f"   Auto-Isolate {'ON ' if iso else 'OFF'}: at-risk {o['kpi']['at_risk_l']} L | failover {p.chiller_failover} | "
          f"actual silo temp {fr[-1]['truth']['silo_temp_actual_c']} | reported {fr[-1]['tel']['stages']['silo']['temp_c']} | "
          f"alerts {sorted({a['type'] for a in b.alerts})}")
    if not iso:
        check("chiller spoof detected by cross-check", "CHILLER_SPOOF" in {a["type"] for a in b.alerts})
        silo_after = [f["out"]["engine"]["units"]["silo"]["status"] for f in fr[30 + 40:]]
        check("silo stays CRITICAL while spoof persists", set(silo_after) == {"CRITICAL"}, f"({sorted(set(silo_after))})")
        check("legacy silo stays GREEN (spoofed 4 °C)", o["legacy"]["units"]["silo"]["status"] == "GREEN")
    else:
        check("ON: no warm milk released", o["kpi"]["at_risk_l"] == 0)

print("\n=== SCENARIOS 5-7: ANY FAULT ON ANY UNIT ===")


def first_flag(fr, unit):
    """Minutes after injection until the engine marks the unit non-OK (None = never)."""
    for i, f in enumerate(fr[30:]):
        if f["out"]["engine"]["units"][unit]["status"] != "OK":
            return i
    return None


# leaks: the mass balance must find every one of them quickly, while the legacy SCADA stays green on that unit
for unit in ("silo", "pasteurizer_b", "homogenizer", "surge_tank", "filler", "packaging"):
    p, b, fr = run("leak", target=unit, auto_sync=False, ticks=40)
    t = first_flag(fr, unit)
    legacy_green = all(f["out"]["legacy"]["units"][unit]["status"] == "GREEN" for f in fr[30:])
    print(f"   leak on {unit:13s}: engine flags it +{t} min | legacy unit always GREEN: {legacy_green} | lost {p.lost_l:.0f} L")
    check(f"leak on {unit} detected within 5 min", t is not None and t <= 5)
p, b, fr = run("leak", target="homogenizer", auto_sync=True, ticks=60)
check("Auto-Sync dispatches the repair crew and the leak stops",
      "homogenizer" not in p.faults and any(t["status"] == "RESOLVED" for t in b.tickets), f"(tickets {[(t['id'], t['status']) for t in b.tickets]})")

# cyber takeover of the silo (the drain valve opens; the PLC keeps reporting the old level)
p, b, fr = run("cyber_takeover", target="silo", auto_isolate=False, ticks=60)
rep = fr[-1]["tel"]["stages"]["silo"]["level_pct"]
print(f"   silo takeover, Auto-Isolate OFF: actual level {100 * p.silo_l / 24000:.0f} % | PLC reports {rep:.0f} % | "
      f"legacy silo {fr[-1]['out']['legacy']['units']['silo']['status']} | lost {p.lost_l:.0f} L")
check("OFF: the silo is drained while its PLC still reports a normal level", p.silo_l < 1000 and rep > 40)
check("OFF: engine flags the rogue write on the silo", any(a["type"] == "UNAUTHORIZED_WRITE" and a["unit"] == "silo" for a in b.alerts))
p, b, fr = run("cyber_takeover", target="silo", auto_isolate=True, ticks=60)
print(f"   silo takeover, Auto-Isolate ON : actual level {100 * p.silo_l / 24000:.0f} % | blocked {sorted(p.blocked_ips)} | lost {p.lost_l:.0f} L")
check("ON: attacker blocked and the silo keeps its milk", "192.168.66.6" in p.blocked_ips and p.silo_l > 0.4 * 24000)
for unit in ("homogenizer", "filler", "pasteurizer_b"):
    p, b, fr = run("cyber_takeover", target=unit, auto_isolate=True, ticks=40)
    t = first_flag(fr, unit)
    check(f"takeover of {unit}: flagged within 5 min and attacker blocked", t is not None and t <= 5 and "192.168.66.6" in p.blocked_ips)

# motor trips: loud (legacy sees them too) - the engine adds the knock-on effects and sends the repair crew
for unit in ("filler", "homogenizer", "surge_tank"):
    p, b, fr = run("motor_trip", target=unit, auto_sync=True, ticks=60)
    t = first_flag(fr, unit)
    end = fr[-1]["tel"]["stages"]["filler"]["flow_lpm"]
    print(f"   motor trip on {unit:12s}: engine +{t} min | knock-on stages {len(fr[32]['out']['engine']['pillar1']['cascade'])} | filler at end {end:.0f} L/min")
    check(f"motor trip on {unit}: flagged at once and repaired by Auto-Sync", t is not None and t <= 1 and unit not in p.faults and end > 600)

print("\n=== DETERMINISM ===")
a = run("drift", ticks=80)[2]
c = run("drift", ticks=80)[2]
check("same seed -> identical telemetry", [f["tel"] for f in a] == [f["tel"] for f in c])

print("\nRESULT:", "ALL PASSED" if not FAILS else f"{len(FAILS)} FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
