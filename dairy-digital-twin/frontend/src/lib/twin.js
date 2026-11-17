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

export const SCENARIOS = [
  { key: 'drift', n: 1, title: 'Silent Homogenizer Drift', blurb: 'Valve fouling cuts capacity while pressure stays "green"', tab: 'sync', toggle: 'Auto-Sync' },
  { key: 'pump_wear', n: 2, title: 'Pump Seal Wear', blurb: 'Vibration creeps up until the seal fails', tab: 'maint', toggle: 'Dispatch' },
  { key: 'cyber_spike', n: 3, title: 'Pasteurizer A Cyber Spike', blurb: 'Rogue PLC write: +40 % flow, spoofed "normal" readings', tab: 'soc', toggle: 'Auto-Isolate' },
  { key: 'chiller_spoof', n: 4, title: 'Chiller Sensor Spoof', blurb: 'Silo reading frozen at 4 °C while milk warms', tab: 'soc', toggle: 'Auto-Isolate' },
]
