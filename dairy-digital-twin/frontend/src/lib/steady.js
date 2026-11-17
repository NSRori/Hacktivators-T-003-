import { useMemo, useRef } from 'react'

/* Steadier numbers (display only - the engine, its decisions and the tests never see this).
   Each physical reading is shown as its average over the last 30 s of real time (at most 60 ticks), so sensor
   noise stops flickering on every tick. When a reading jumps further from that average than its noise could
   explain (about 4 sigma of the simulator's noise), the window restarts at the new value: real events such as an
   attack, an isolation or a starving filler still show up instantly. Engine verdicts, scores, RUL and the
   cumulative counters are never smoothed, so a smoothed number can never contradict a verdict next to it. */

const WINDOW_MS = 30000
const MAX = 60

const flow = 8          // L/min (noise about +-2)
const temp = 0.35       // degC (noise about +-0.08)
function paths(f) {
  const p = [
    [['stages', 'silo', 'level_pct'], 1.5], [['stages', 'silo', 'level_l'], 360], [['stages', 'silo', 'temp_c'], temp],
    [['stages', 'silo', 'intake_lpm'], flow], [['stages', 'silo', 'flow_out_lpm'], flow],
    [['stages', 'homogenizer', 'flow_lpm'], flow], [['stages', 'homogenizer', 'pressure_psi'], 25],
    [['stages', 'surge_tank', 'level_pct'], 1.5], [['stages', 'surge_tank', 'level_l'], 90],
    [['stages', 'surge_tank', 'flow_in_lpm'], flow], [['stages', 'surge_tank', 'temp_c'], temp],
    [['stages', 'filler', 'flow_lpm'], flow], [['stages', 'packaging', 'rate_lpm'], flow],
    [['stages', 'packaging', 'cold_room_temp_c'], temp],
    [['kpi', 'throughput_lpm'], flow],
    [['engine', 'pillar3', 'checks', 'pasteurizer_a', 'implied_flow'], flow],
    [['engine', 'pillar3', 'checks', 'pasteurizer_a', 'reported_flow'], flow],
    [['engine', 'pillar3', 'checks', 'chiller', 'reported_c'], temp],
    [['engine', 'pillar3', 'checks', 'chiller', 'inlet_c'], temp],
  ]
  for (const u of ['pasteurizer_a', 'pasteurizer_b']) {
    p.push([['stages', u, 'flow_lpm'], flow], [['stages', u, 'temp_c'], temp], [['stages', u, 'inlet_temp_c'], temp],
      [['stages', u, 'drive_current_a'], 0.6])
  }
  for (const pump of Object.keys(f.pumps || {})) p.push([['pumps', pump, 'vibration_mms'], 0.3])
  return p
}

const get = (o, path) => path.reduce((x, k) => (x == null ? undefined : x[k]), o)

/* copy-on-write: clone each object on the way down once, so the raw frame is never mutated */
function put(root, path, v, cloned) {
  const top = cloned.has(root) ? root : { ...root }
  cloned.add(top)
  let node = top
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    if (node[k] == null) return top
    if (!cloned.has(node[k])) { node[k] = { ...node[k] }; cloned.add(node[k]) }
    node = node[k]
  }
  node[path[path.length - 1]] = v
  return top
}

const mean = (b) => b.reduce((a, s) => a + s.v, 0) / b.length

export function useSteadyFrame(frame) {
  const st = useRef({ tick: null, bufs: new Map() })
  return useMemo(() => {
    if (!frame) return frame
    const s = st.current
    if (s.tick !== null && frame.tick < s.tick) s.bufs.clear()           // plant was reset
    const fresh = frame.tick !== s.tick                                     // dedupe repeats (StrictMode, re-sends)
    const now = performance.now()
    const cloned = new WeakSet()
    let out = frame
    for (const [path, snap] of paths(frame)) {
      const raw = get(frame, path)
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
      const key = path.join('.')
      let b = s.bufs.get(key)
      if (!b) { b = []; s.bufs.set(key, b) }
      if (fresh) {
        if (b.length && Math.abs(raw - mean(b)) > snap) b.length = 0      // a real change: show it now
        b.push({ t: now, v: raw })
        while (b.length > MAX || now - b[0].t > WINDOW_MS) b.shift()
      }
      if (b.length > 1) out = put(out, path, mean(b), cloned)
    }
    s.tick = frame.tick
    return out
  }, [frame])
}
