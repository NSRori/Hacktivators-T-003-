import { useCallback, useEffect, useState } from 'react'

const MAX_POINTS = 240
const MAX_PACKETS = 80

// Same shape as backend main.chart_point()
export function chartPoint(f) {
  const s = f.stages
  const chk = f.engine.pillar3.checks
  return {
    tick: f.tick, throughput: s.filler.flow_lpm, nominal: 800,
    silo: s.silo.level_pct, surge: s.surge_tank.level_pct,
    vib_h: f.pumps.homogenizer_pump_1.vibration_mms, vib_a: f.pumps.pasteurizer_a_pump.vibration_mms,
    anomaly: f.engine.pillar2.anomaly_score, pressure: s.homogenizer.pressure_psi,
    a_reported: s.pasteurizer_a.flow_lpm, a_physical: chk.pasteurizer_a.implied_flow, b_flow: s.pasteurizer_b.flow_lpm,
    silo_temp: s.silo.temp_c, inlet_temp: chk.chiller.inlet_c,
  }
}

/** Live connection to the FastAPI WebSocket hub (auto-reconnects). */
export function useTwin() {
  const [frame, setFrame] = useState(null)
  const [history, setHistory] = useState([])
  const [packets, setPackets] = useState([])
  const [mode, setMode] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws
    let timer
    let closed = false
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws`)
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) timer = setTimeout(connect, 1500)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.type === 'hello') {
          setHistory(m.history.slice(-MAX_POINTS))
          if (m.latest) setFrame(m.latest)
          setMode(m.mode)
        } else if (m.type === 'tick') {
          setFrame(m)
          setMode(m.mode)
          setHistory((h) => [...h.slice(-(MAX_POINTS - 1)), chartPoint(m)])
          if (m.packets.length) setPackets((p) => [...m.packets.slice().reverse(), ...p].slice(0, MAX_PACKETS))
        } else if (m.type === 'mode') {
          setMode({ auto_sync: m.auto_sync, auto_isolate: m.auto_isolate, paused: m.paused, tick_seconds: m.tick_seconds })
        } else if (m.type === 'reset') {
          setHistory([])
          setPackets([])
        }
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      if (!ws) return
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      // StrictMode mounts twice: never close a socket mid-handshake (spec bug B4)
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close()
      else ws.close()
    }
  }, [])

  return { frame, history, packets, mode, connected }
}

/** Tiny hash router: #/home, #/twin, #/sync, #/maint, #/cyber, #/log */
export function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'home'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = useCallback((r) => {
    window.location.hash = `/${r}`
    window.scrollTo({ top: 0 })
  }, [])
  return [route, go]
}

export async function post(path, body) {
  try {
    const r = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, message: data.detail || `HTTP ${r.status}` }
    return data
  } catch {
    return { ok: false, message: 'Backend unreachable. Is uvicorn running on :8000?' }
  }
}

export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d))
export const fmtInt = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'))
export const clock = (min) => {
  const m = Math.max(0, Math.round(min || 0))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const LABEL = {
  silo: 'Raw Chilling Silo', pasteurizer_a: 'Pasteurizer A', pasteurizer_b: 'Pasteurizer B',
  homogenizer: 'Homogenizer', surge_tank: 'Surge Tank', filler: 'Aseptic Filler',
  packaging: 'Cold-Chain Packaging', chiller: 'Silo Chiller', network: 'OT Network',
}
export const UNITS = ['silo', 'pasteurizer_a', 'pasteurizer_b', 'homogenizer', 'surge_tank', 'filler', 'packaging']

/** Engine status → theme classes. Every status also gets an icon + a word (never colour alone). */
export const TONE = {
  OK: { word: 'Normal', text: 'text-ok', soft: 'bg-ok-2', fill: 'bg-ok', outline: 'outline-line', hex: '#3DB07E' },
  WATCH: { word: 'Watch', text: 'text-accent', soft: 'bg-accent-2', fill: 'bg-accent', outline: 'outline-accent', hex: '#4FB3EA' },
  MAINT: { word: 'Maintenance', text: 'text-accent', soft: 'bg-accent-2', fill: 'bg-accent', outline: 'outline-accent', hex: '#4FB3EA' },
  WARN: { word: 'Warning', text: 'text-warn-ink', soft: 'bg-warn-2', fill: 'bg-warn', outline: 'outline-warn', hex: '#E3A41A' },
  CRITICAL: { word: 'Critical', text: 'text-crit', soft: 'bg-crit-2', fill: 'bg-crit', outline: 'outline-crit', hex: '#E5604F' },
  QUARANTINED: { word: 'Isolated', text: 'text-iso', soft: 'bg-iso-2', fill: 'bg-iso', outline: 'outline-iso', hex: '#A07AD9' },
}
export const LEGACY = {
  GREEN: { word: 'All green', hex: '#3FAE5A' },
  AMBER: { word: 'Warning', hex: '#E0A21B' },
  RED: { word: 'Alarm', hex: '#D9483B' },
}

/** Plain-language unit descriptions for the digital-twin hover cards. */
export const UNIT_INFO = {
  silo: { name: 'Raw Chilling Silo', step: 'Step 1 · Cold storage', what: 'Receives raw milk from farm tankers and keeps up to 24,000 L at 4 °C until it can be processed. Warm milk spoils quickly.', watch: 'Level (overflow) and temperature, cross-checked against independent inlet sensors.' },
  pasteurizer_a: { name: 'Pasteurizer A', step: 'Step 2 · Heat treatment', what: 'Heats milk to 72 °C and holds it about 15 s to kill harmful bacteria. Runs in parallel with Pasteurizer B; either one can carry the whole plant alone.', watch: 'Temperature, pump wear, and whether the PLC flow reading agrees with the motor current (spoofing).' },
  pasteurizer_b: { name: 'Pasteurizer B', step: 'Step 2 · Heat treatment', what: 'Twin of Pasteurizer A with the same 72 °C / 15 s treatment. If A is isolated, B takes 100 % of the flow with no downtime.', watch: 'Temperature, flow and load share.' },
  homogenizer: { name: 'Homogenizer', step: 'Step 3 · Texture', what: 'Forces milk through a fine valve at about 2,000 PSI to break up fat, so cream never separates. Every litre passes through this single machine.', watch: 'Hidden pressure drift from valve fouling, and pump vibration / remaining life.' },
  surge_tank: { name: 'Surge Tank', step: 'Step 4 · Buffer', what: 'A 6,000 L buffer between processing and filling. It absorbs short slowdowns upstream so the filler keeps running.', watch: 'Minutes until it runs empty, and keeping it near 50 %.' },
  filler: { name: 'Aseptic Filler', step: 'Step 5 · Filling', what: 'Fills sterile 1 L cartons in a germ-free chamber at up to 800 L/min. If the surge tank runs dry, it starves and stops.', watch: 'Fill rate against demand, and starvation.' },
  packaging: { name: 'Cold-Chain Packaging', step: 'Step 6 · Dispatch', what: 'Cases the cartons and moves them into a 4 °C cold room, ready for refrigerated trucks.', watch: 'Output rate and cold-room temperature.' },
}

export const SCENARIOS = [
  { key: 'drift', n: 1, title: 'Hidden slowdown', long: 'Silent homogenizer drift', tab: 'sync', toggle: 'Auto-Sync',
    blurb: 'The homogenizer valve slowly clogs. Its pressure stays inside the legacy limits, so the old SCADA stays green while the line starts to starve.',
    tip: 'Run it with Auto-Sync off, press Reset, then run it again with Auto-Sync on.' },
  { key: 'pump_wear', n: 2, title: 'Pump wearing out', long: 'Pump seal wear', tab: 'maint', toggle: null,
    blurb: 'A pump seal wears gradually. Vibration creeps up until the pump breaks down.',
    tip: 'Watch the “fails in N min” countdown, then dispatch a technician before it reaches zero.' },
  { key: 'cyber_spike', n: 3, title: 'Cyber attack', long: 'Pasteurizer A cyber spike', tab: 'cyber', toggle: 'Auto-Isolate',
    blurb: 'An attacker pushes Pasteurizer A to +40 % flow so milk misses 72 °C, and replays “normal” readings to the SCADA.',
    tip: 'With Auto-Isolate on, the engine quarantines A and reroutes all milk through B.' },
  { key: 'chiller_spoof', n: 4, title: 'Fake temperature', long: 'Chiller sensor spoof', tab: 'cyber', toggle: 'Auto-Isolate',
    blurb: 'A compromised workstation freezes the silo thermometer at 4 °C while the raw milk quietly warms up.',
    tip: 'Turn Auto-Isolate off to watch the engine catch it by cross-checking a second sensor.' },
]

export const TABS = [
  { key: 'twin', label: 'Live twin' },
  { key: 'sync', label: 'Production sync', pillar: 1 },
  { key: 'maint', label: 'Predictive maintenance', pillar: 2 },
  { key: 'cyber', label: 'Cyber defense', pillar: 3 },
  { key: 'log', label: 'Event log' },
]

/** One sentence that tells the audience what is happening right now (spec §5.3). */
export function caption(f, mode) {
  if (!f) return ''
  const s = f.stages
  const p1 = f.engine.pillar1
  const k = f.kpi
  const tk = (unit) => f.engine.pillar2.tickets.find((t) => t.unit === unit && ['OPEN', 'DISPATCHED', 'FAILED'].includes(t.status))
  switch (f.scenario) {
    case 'drift':
      if (s.filler.starved) return `The surge tank ran dry and the filler is starving. Bottling is down to ${fmt(k.retention_pct)} % of target.`
      if (s.homogenizer.flushing) return 'Auto-Sync is cleaning the clogging valve while the surge tank keeps the filler running.'
      if (p1.drift_detected) return mode?.auto_sync
        ? 'Every legacy sensor is still inside its limits. The engine found the clogging valve and is compensating automatically.'
        : 'Every legacy sensor is still inside its limits, but the engine has found the homogenizer slowing down.'
      return 'The homogenizer valve has started to clog. Its pressure is still well inside the legacy limits.'
    case 'pump_wear': {
      const t = tk('homogenizer_pump_1') || tk('pasteurizer_a_pump')
      if (!t) {
        const r = f.engine.pillar2.tickets.find((x) => x.created_tick >= f.scenario_tick && x.status === 'RESOLVED')
        return r ? `${r.label} was repaired before it broke down: no unplanned stop.`
          : 'A pump seal has started to wear. The vibration change is still too small for any fixed alarm.'
      }
      if (t.status === 'FAILED') return `${t.label} has broken down. Send a repair crew to restart it.`
      if (t.status === 'DISPATCHED') return `A technician is on the way to ${t.label}, before it fails.`
      return `${t.label} is predicted to fail in ${fmt(t.rul_min)} min. The legacy SCADA has not noticed anything yet.`
    }
    case 'cyber_spike':
      if (s.pasteurizer_a.quarantined) return 'Pasteurizer A has been isolated. Pasteurizer B now carries 100 % of the milk with zero downtime.'
      return 'Pasteurizer A has been hacked. It reports 400 L/min at 72 °C, but its motor current says otherwise.'
    case 'chiller_spoof':
      if (f.chiller_failover) return 'The backup chiller is engaged and the milk is cooling back to 4 °C.'
      return `The silo thermometer is frozen at 4 °C by an attacker. Inlet sensors read ${fmt(f.engine.pillar3.checks.chiller.inlet_c, 1)} °C.`
    default:
      return 'Normal operation: 800 L/min bottling, every buffer near 50 %, all stages inside their limits.'
  }
}
