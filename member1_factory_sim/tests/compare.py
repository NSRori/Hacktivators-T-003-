import sys, io, contextlib
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, simpy
from config import FactoryConfig
from factory import Factory, PROCESSING, IDLE, BLOCKED

def run(scenario, seed=7, dur=480.0, interval=30.0):
    cfg = FactoryConfig(sim_duration=dur, status_interval=interval, seed=seed, scenario=scenario)
    env = simpy.Environment(); f = Factory(env, cfg)
    bufs = {}
    def mon():  # sample cnc_out level at fixed times
        while True:
            bufs[env.now] = len(f.buffers["cnc_out"].items)
            yield env.timeout(60)
    env.process(mon())
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        env.run(until=dur)
    f.record_telemetry()
    return env, f, bufs, out.getvalue()

def window_mean(jobs, lo, hi):
    d = [x for (t, x) in jobs if lo <= t < hi]
    return np.mean(d), len(d)

res = {}
for sc in ("normal", "wear"):
    res[sc] = run(sc)

print("%-34s %12s %12s" % ("METRIC (seed 7, 480 min, int 30)", "normal", "wear"))
def row(name, a, b): print("%-34s %12s %12s" % (name, a, b))
for key, label in (("completed", "Total completed"),):
    row(label, len(res["normal"][1].completed), len(res["wear"][1].completed))
row("Raw released", res["normal"][1].raw_released, res["wear"][1].raw_released)
row("Assembly utilisation", "%.4f" % res["normal"][1].machines[2].utilization(), "%.4f" % res["wear"][1].machines[2].utilization())
row("Assembly jobs done", res["normal"][1].machines[2].processed, res["wear"][1].machines[2].processed)
row("Throughput /hr", "%.2f" % (len(res["normal"][1].completed)/8), "%.2f" % (len(res["wear"][1].completed)/8))
print("\nAssembly processing time (mean of jobs finishing in window; nominal mean 2.50)")
for name, lo, hi in (("begin  0-60", 0, 60), ("middle 210-270", 210, 270), ("end   420-480", 420, 480)):
    a, na = window_mean(res["normal"][1].machines[2].job_log, lo, hi)
    b, nb = window_mean(res["wear"][1].machines[2].job_log, lo, hi)
    row("  " + name, "%.3f (n=%d)" % (a, na), "%.3f (n=%d)" % (b, nb))
print("\nAssembly vibration mm/s (telemetry sample at that time)")
for t in (0, 240, 480):
    vals = []
    for sc in ("normal", "wear"):
        r = [x for x in res[sc][1].telemetry.to_dicts("Assembly") if x["time"] == t][0]
        vals.append("%.3f" % r["vibration"])
    row("  t=%d" % t, *vals)
print("\ncnc_out buffer level (cap 10) sampled every 60 min")
ts = sorted(res["normal"][2])
row("  times", " ".join(str(int(t)) for t in ts), "")
row("  normal", " ".join(str(res["normal"][2][t]) for t in ts), "")
row("  wear", " ".join(str(res["wear"][2][t]) for t in ts), "")

print("\nPRODUCT ACCOUNTING & TERMINATION")
for sc in ("normal", "wear"):
    env, f, _, _ = res[sc]
    ids = [p.id for p in f.completed]
    for s in f.buffers.values(): ids += [p.id for p in s.items]
    for s in f.buffers.values(): ids += [e.item.id for e in s.put_queue]
    inproc = sum(1 for m in f.machines if m.status == PROCESSING)
    seq_ok = all([h[0] for h in p.history][1:] == ["Assembly", "QC", "Packaging"] and p.history[0][0] in ("CNC_A", "CNC_B") for p in f.completed)
    print("  %-7s end=%.1f dup=%d released=%d accounted=%d+inproc %d -> %s | sequence ok: %s" % (
        sc, env.now, len(ids) - len(set(ids)), f.raw_released, len(ids), inproc, len(ids) + inproc == f.raw_released, seq_ok))

print("\nWEAR CHECKS")
env, f, _, _ = res["wear"]
tel = f.telemetry.to_dicts("Assembly")
vib = np.array([r["vibration"] for r in tel]); tt = np.array([r["time"] for r in tel])
trend = 2.0 * (1 + 0.6 * tt / 480)
print("  max |vib - trend| = %.4f (limit 3 sigma = 0.09)" % np.max(np.abs(vib - trend)))
print("  max sample-to-sample vib change = %.3f mm/s (5-min step; trend step = %.3f)" % (np.max(np.abs(np.diff(vib))), 2.0*0.6*5/480))
wm = [vib[(tt >= lo) & (tt < lo + 60)].mean() for lo in range(0, 480, 60)]
print("  vibration 60-min means:", " ".join("%.2f" % x for x in wm), "| strictly increasing:", all(b > a for a, b in zip(wm, wm[1:])))
jm = [window_mean(f.machines[2].job_log, lo, lo + 60)[0] for lo in range(0, 480, 60)]
nm = [window_mean(res["normal"][1].machines[2].job_log, lo, lo + 60)[0] for lo in range(0, 480, 60)]
print("  asm job-time 60-min means wear  :", " ".join("%.2f" % x for x in jm))
print("  asm job-time 60-min means normal:", " ".join("%.2f" % x for x in nm))
ratio = [w / n for w, n in zip(jm, nm)]
print("  wear/normal ratio per window    :", " ".join("%.3f" % r for r in ratio))
log = f.machines[2].job_log
gaps = np.diff([0] + [t for t, _ in log])
print("  Assembly: max gap between job completions = %.2f min (mean job %.2f); max job = %.2f; jobs in every 30-min window: %s" % (
    gaps.max(), np.mean([d for _, d in log]), max(d for _, d in log),
    all(sum(1 for t, _ in log if lo <= t < lo + 30) > 0 for lo in range(0, 480, 30))))
print("  telemetry rows %d, completed_count non-decreasing: %s" % (len(f.telemetry.records), all(b >= a for a, b in zip(*(lambda c: (c[:-1], c[1:]))([r.completed_count for r in f.telemetry.records])))))
st = sorted({r["status"] for r in tel}); print("  Assembly statuses seen:", st)

print("\nDETERMINISM")
for sc in ("normal", "wear"):
    a = run(sc); b = run(sc); c = run(sc, seed=8)
    same = a[3] == b[3] and a[1].telemetry.to_dicts() == b[1].telemetry.to_dicts()
    print("  %-7s same seed identical (output + telemetry): %s | different seed differs: %s" % (sc, same, c[3] != a[3]))
# telemetry independent of print interval?
a = run("wear", interval=30); b = run("wear", interval=77)
print("  wear telemetry independent of --interval:", a[1].telemetry.to_dicts() == b[1].telemetry.to_dicts())
# normal vibration healthy
nv = [r["vibration"] for r in res["normal"][1].telemetry.to_dicts("Assembly")]
print("  normal vibration range: %.3f - %.3f (baseline 2.0)" % (min(nv), max(nv)))
