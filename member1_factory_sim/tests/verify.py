import sys, io, contextlib
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import simpy
from config import FactoryConfig
from factory import Factory, IDLE, PROCESSING, BLOCKED

def run(seed, duration=480.0, monitor=None, quiet=True):
    cfg = FactoryConfig(sim_duration=duration, seed=seed)
    env = simpy.Environment()
    f = Factory(env, cfg)
    viol = []
    both_cnc = [0]
    if monitor:
        def mon():
            t = 0.37
            yield env.timeout(t)
            while True:
                for k, s in f.buffers.items():
                    if len(s.items) > s.capacity: viol.append(("cap", env.now, k))
                for m in f.machines:
                    if m.status == IDLE and len(m.in_buffer.items) > 0:
                        viol.append(("IDLE but input available", env.now, m.name))
                    if m.status == BLOCKED and m.out_buffer is not None and len(m.out_buffer.items) < m.out_buffer.capacity:
                        viol.append(("BLOCKED but output has room", env.now, m.name))
                if f.machines[0].status == PROCESSING and f.machines[1].status == PROCESSING:
                    both_cnc[0] += 1
                yield env.timeout(1.0)
        env.process(mon())
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        env.run(until=duration)
    return env, f, viol, both_cnc[0], buf.getvalue()

env, f, viol, both, _ = run(42, monitor=True)
print("1. SEQUENCE")
exp = [{"CNC_A", "CNC_B"}, {"Assembly"}, {"QC"}, {"Packaging"}]
bad = 0
for p in f.completed:
    names = [h[0] for h in p.history]
    ts = [h[1] for h in p.history]
    if len(names) != 4 or any(names[i] not in exp[i] for i in range(4)) or ts != sorted(ts):
        bad += 1
print("   completed:", len(f.completed), "bad sequences:", bad)

print("2. PARALLEL CNC")
print("   same input buffer object:", f.machines[0].in_buffer is f.machines[1].in_buffer)
print("   processed A/B:", f.machines[0].processed, f.machines[1].processed, "| samples with both PROCESSING:", both)

print("3. CONSERVATION")
ids = [p.id for p in f.completed]
for s in f.buffers.values(): ids += [p.id for p in s.items]
for s in f.buffers.values(): ids += [e.item.id for e in s.put_queue]
processing = sum(1 for m in f.machines if m.status == PROCESSING)
print("   duplicate ids:", len(ids) - len(set(ids)))
print("   released", f.raw_released, "= accounted", len(ids), "+ in-process", processing, "->", len(ids) + processing == f.raw_released)

print("4. UTILISATION (final) vs. exact busy-time incl. in-progress work")
for m in f.machines:
    print("  ", m.name, "reported %.4f" % m.utilization(), "status", m.status)

print("5. STATUS/CAPACITY violations sampled:", len(viol), viol[:5])

print("6. TERMINATION: env.now =", env.now)

print("7. DETERMINISM")
a = run(42)[4:]; b = run(42)[4:]; c = run(43)[4:]
sa = run(42)[1].snapshot(); sb = run(42)[1].snapshot(); sc = run(43)[1].snapshot()
print("   same seed identical output & snapshot:", a == b and sa == sb, "| different seed differs:", sc != sa)
