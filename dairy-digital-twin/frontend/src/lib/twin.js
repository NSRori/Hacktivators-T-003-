import { useEffect, useState } from 'react'

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
      if (ws) ws.close()
    }
  }, [])

  return { frame, history, packets, mode, connected }
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
    return { ok: false, message: 'Backend unreachable - is uvicorn running on :8000?' }
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
export const SHORT = {
  silo: 'SILO', pasteurizer_a: 'PAS-A', pasteurizer_b: 'PAS-B', homogenizer: 'HOMOG',
  surge_tank: 'SURGE', filler: 'FILL', packaging: 'PACK',
}
export const UNITS = ['silo', 'pasteurizer_a', 'pasteurizer_b', 'homogenizer', 'surge_tank', 'filler', 'packaging']

/** Engine status palette (hex for SVG, classes for HTML). */
export const TONE = {
  OK: { hex: '#34d399', text: 'text-emerald-300', soft: 'bg-emerald-400/10', ring: 'ring-emerald-400/25', word: 'Normal' },
  WATCH: { hex: '#38bdf8', text: 'text-sky-300', soft: 'bg-sky-400/10', ring: 'ring-sky-400/40', word: 'Watch' },
  MAINT: { hex: '#38bdf8', text: 'text-sky-300', soft: 'bg-sky-400/10', ring: 'ring-sky-400/50', word: 'Maintenance' },
  WARN: { hex: '#fbbf24', text: 'text-amber-300', soft: 'bg-amber-400/10', ring: 'ring-amber-400/60', word: 'Warning' },
  CRITICAL: { hex: '#fb4469', text: 'text-rose-300', soft: 'bg-rose-500/15', ring: 'ring-rose-500/80', word: 'Critical' },
  QUARANTINED: { hex: '#d946ef', text: 'text-fuchsia-300', soft: 'bg-fuchsia-500/15', ring: 'ring-fuchsia-500/80', word: 'Quarantined' },
}
export const LEGACY_HEX = { GREEN: '#22e36b', AMBER: '#ffb020', RED: '#ff3b3b' }
export const SEVERITY = {
  CRITICAL: { cls: 'border-rose-500/50 bg-rose-500/[0.07]', text: 'text-rose-300' },
  HIGH: { cls: 'border-amber-500/50 bg-amber-500/[0.07]', text: 'text-amber-300' },
  MEDIUM: { cls: 'border-sky-500/40 bg-sky-500/[0.06]', text: 'text-sky-300' },
}

/** Plain-language unit descriptions for the digital-twin hover cards. */
export const UNIT_INFO = {
  intake: { name: 'Raw Milk Tankers', step: 'Supply', what: 'Farm tankers deliver raw milk to the plant. The intake pump decides how fast milk enters the silo.', watch: 'Pillar 1 throttles this pump so the silo never overflows.' },
  silo: { name: 'Raw Chilling Silo', step: 'Step 1 · Cold storage', what: 'Stores up to 24,000 L of raw milk at 4 °C until it can be processed. Warm milk spoils fast.', watch: 'Level (overflow) and temperature, cross-checked against independent inlet sensors (Pillar 3).' },
  pasteurizer_a: { name: 'Pasteurizer A', step: 'Step 2 · Heat treatment', what: 'Heats milk to 72 °C and holds it about 15 s to kill harmful bacteria. Runs in parallel with Pasteurizer B; either can carry the whole plant alone.', watch: 'Temperature, pump wear, and whether the PLC flow reading matches the motor current (cyber spoofing).' },
  pasteurizer_b: { name: 'Pasteurizer B', step: 'Step 2 · Heat treatment', what: 'Twin of Pasteurizer A: same 72 °C / 15 s treatment. If A is isolated, B takes 100 % of the flow with no downtime.', watch: 'Temperature, flow and load share.' },
  homogenizer: { name: 'Homogenizer', step: 'Step 3 · Texture', what: 'Pushes milk through a tiny valve at about 2,000 PSI to break up fat so the cream never separates. Every litre goes through this one machine.', watch: 'Hidden pressure drift from valve fouling (Pillar 1) and pump vibration / remaining life (Pillar 2).' },
  surge_tank: { name: 'Surge Tank', step: 'Step 4 · Buffer', what: 'A 6,000 L buffer between processing and filling. It absorbs short slowdowns upstream so the filler never stops.', watch: 'How long until it runs empty (T_starve), and keeping it near 50 %.' },
  filler: { name: 'Aseptic Filler', step: 'Step 5 · Filling', what: 'Fills sterile 1 L cartons in a germ-free chamber at up to 800 L/min. If the surge tank runs dry, it starves and stops.', watch: 'Fill rate vs demand, and starvation.' },
  packaging: { name: 'Cold-Chain Packaging', step: 'Step 6 · Dispatch', what: 'Cases the cartons and moves them into a 4 °C cold room, ready for refrigerated trucks.', watch: 'Output rate and cold-room temperature.' },
  dispatch: { name: 'Cold-Chain Dispatch', step: 'Out', what: 'Refrigerated trucks carry finished cartons to retailers.', watch: 'This is the plant’s real output, so every lost litre shows up here.' },
}

export const SCENARIOS = [
  { key: 'drift', n: 1, title: 'Hidden slowdown', long: 'Silent Homogenizer Drift', tab: 'sync',
    blurb: 'The homogenizer valve slowly clogs. Its pressure stays inside the "green" limits, so the old SCADA sees nothing, yet the line starts to starve.',
    tip: 'Run it with Auto-Sync OFF, then press Reset and run it with Auto-Sync ON.' },
  { key: 'pump_wear', n: 2, title: 'Pump wearing out', long: 'Pump Seal Wear', tab: 'maint',
    blurb: 'A pump seal wears gradually. Vibration creeps up until the pump breaks down.',
    tip: 'Watch the "fails in N min" badge, then dispatch a technician before it hits zero.' },
  { key: 'cyber_spike', n: 3, title: 'Cyber attack', long: 'Pasteurizer A Cyber Spike', tab: 'soc',
    blurb: 'A hacker pushes Pasteurizer A to +40 % flow so milk misses 72 °C, and fakes its readings to look normal.',
    tip: 'With Auto-Isolate ON the engine quarantines A and reroutes everything through B.' },
  { key: 'chiller_spoof', n: 4, title: 'Fake temperature', long: 'Chiller Sensor Spoof', tab: 'soc',
    blurb: 'A compromised PC freezes the silo thermometer at 4 °C while the raw milk quietly warms up.',
    tip: 'Turn Auto-Isolate OFF to watch the engine catch it by cross-checking another sensor.' },
]
