import { useEffect, useState } from 'react'

const MAX_POINTS = 240
const MAX_PACKETS = 60

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
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, message: data.detail || `HTTP ${r.status}` }
  return data
}

export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d))
export const fmtInt = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'))
export const clock = (min) => {
  const m = Math.max(0, Math.round(min || 0))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const LABEL = {
  silo: 'Raw Chilling Silo', pasteurizer_a: 'Pasteurizer_A', pasteurizer_b: 'Pasteurizer_B',
  homogenizer: 'Homogenizer', surge_tank: 'Surge Tank', filler: 'Aseptic Filler',
  packaging: 'Cold-Chain Packaging', chiller: 'Silo Chiller', network: 'OT Network',
}
export const UNITS = ['silo', 'pasteurizer_a', 'pasteurizer_b', 'homogenizer', 'surge_tank', 'filler', 'packaging']

export const ENGINE_STYLE = {
  OK: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-500/40', pill: 'bg-emerald-500/15 text-emerald-300' },
  WATCH: { dot: 'bg-sky-400', text: 'text-sky-300', ring: 'border-sky-500/60', pill: 'bg-sky-500/15 text-sky-300' },
  MAINT: { dot: 'bg-sky-400', text: 'text-sky-300', ring: 'border-sky-400/80', pill: 'bg-sky-500/15 text-sky-300' },
  WARN: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-400/80', pill: 'bg-amber-500/15 text-amber-300' },
  CRITICAL: { dot: 'bg-red-500', text: 'text-red-300', ring: 'border-red-500', pill: 'bg-red-500/20 text-red-300' },
  QUARANTINED: { dot: 'bg-fuchsia-500', text: 'text-fuchsia-300', ring: 'border-fuchsia-500', pill: 'bg-fuchsia-500/20 text-fuchsia-300' },
}
export const LEGACY_STYLE = {
  GREEN: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  AMBER: { dot: 'bg-amber-400', text: 'text-amber-300' },
  RED: { dot: 'bg-red-500', text: 'text-red-300' },
}
export const SEVERITY_STYLE = {
  CRITICAL: 'border-red-500/60 bg-red-500/10 text-red-300',
  HIGH: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
  MEDIUM: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
}
