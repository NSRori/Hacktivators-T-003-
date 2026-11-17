import { useState } from 'react'
import { Bug, Gauge, Milk, Pause, Play, RotateCcw, ShieldCheck, Thermometer, Unplug, Waves, Wifi, Wrench } from 'lucide-react'
import { clock, fmt, fmtInt, post } from '../lib/twin'

function Kpi({ label, value, unit, tone = 'text-slate-100', sub }) {
  return (
    <div className="min-w-[104px] rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
      <div className="text-[9.5px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`num text-[17px] font-semibold leading-tight ${tone}`}>{value}<span className="ml-1 text-[10px] text-slate-500">{unit}</span></div>
      {sub && <div className="text-[9.5px] text-slate-500">{sub}</div>}
    </div>
  )
}

export function TopBar({ frame, connected }) {
  const k = frame?.kpi
  const ret = k?.retention_pct
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300"><Milk size={20} /></div>
        <div>
          <div className="text-[15px] font-bold text-slate-100">Dairy Digital Twin <span className="font-normal text-slate-400">· Three-Pillar Causal Engine</span></div>
          <div className="text-[10.5px] text-slate-500">Beyond the Factory Floor · Production Sync · Predictive Maintenance · OT Cyber Defense</div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Kpi label="Plant clock" value={frame ? clock(frame.sim_min) : '--:--'} unit="sim" sub={frame ? `tick ${frame.tick}` : ''} />
        <Kpi label="Bottling" value={fmt(k?.throughput_lpm)} unit="L/min"
          tone={ret === undefined ? 'text-slate-100' : ret >= 95 ? 'text-emerald-300' : ret >= 80 ? 'text-amber-300' : 'text-red-300'}
          sub={`${fmt(ret, 1)} % of 800 (30-min avg)`} />
        <Kpi label="Since scenario" value={fmt(k?.scenario_retention_pct, 1)} unit="%" sub="throughput retention" />
        <Kpi label="Bottled" value={fmtInt(k?.bottled_l)} unit="L" />
        <Kpi label="Milk wasted" value={fmtInt(k?.wasted_l)} unit="L" tone={k?.wasted_l ? 'text-red-300' : 'text-slate-100'} sub="silo overflow" />
        <Kpi label="Unsafe / at-risk" value={`${fmtInt(k?.unsafe_l)} / ${fmtInt(k?.at_risk_l)}`} unit="L"
          tone={k?.unsafe_l || k?.at_risk_l ? 'text-red-300' : 'text-slate-100'} sub="under-pasteurized / warm" />
        <Kpi label="Filler starved" value={fmt(k?.starved_min)} unit="min" tone={k?.starved_min ? 'text-amber-300' : 'text-slate-100'} />
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
          {connected ? <Wifi size={13} /> : <Unplug size={13} />}{connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>
    </header>
  )
}

function Toggle({ label, on, onChange, hint }) {
  return (
    <button onClick={() => onChange(!on)} title={hint}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${on
        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}>
      <span className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {label}: {on ? 'ON' : 'OFF'}
    </button>
  )
}

const SCN = [
  { key: 'drift', n: 1, label: 'Silent Homogenizer Drift', icon: Waves, cls: 'hover:border-amber-400/70', hint: 'Valve fouling slowly cuts homogenizer capacity while pressure stays inside the green band' },
  { key: 'pump_wear', n: 2, label: 'Pump Seal Wear', icon: Wrench, cls: 'hover:border-sky-400/70', hint: 'Gradual seal wear raises vibration until the pump fails' },
  { key: 'cyber_spike', n: 3, label: 'Pasteurizer_A Cyber Spike', icon: Bug, cls: 'hover:border-red-400/70', hint: 'Rogue PLC write: +40 % flow with spoofed "normal" telemetry' },
  { key: 'chiller_spoof', n: 4, label: 'Chiller Sensor Spoof', icon: Thermometer, cls: 'hover:border-fuchsia-400/70', hint: 'Compromised workstation freezes the silo temperature reading at 4 °C' },
]
const SPEEDS = [[1.0, '0.5×'], [0.5, '1×'], [0.25, '2×'], [0.125, '4×']]

export function ControlBar({ frame, mode, notify }) {
  const [pump, setPump] = useState('homogenizer_pump_1')
  const call = async (path, body) => {
    const r = await post(path, body)
    notify(r.message || (r.ok ? 'done' : 'failed'), r.ok !== false)
  }
  const active = frame?.scenario
  const quarantined = frame?.quarantined || []
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/50 px-4 py-2">
      <span className="panel-title mr-1">Scenarios</span>
      {SCN.map((s) => (
        <div key={s.key} className="flex items-center">
          <button onClick={() => call(`/scenario/${s.key}${s.key === 'pump_wear' ? `?target=${pump}` : ''}`)} title={s.hint}
            className={`flex items-center gap-1.5 border border-slate-700 bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-slate-200 transition ${s.cls}
              ${s.key === 'pump_wear' ? 'rounded-l-lg' : 'rounded-lg'} ${active === s.key ? 'ring-1 ring-sky-400/60' : ''}`}>
            <span className="num rounded bg-slate-800 px-1 text-[10px] text-slate-400">{s.n}</span>
            <s.icon size={14} />{s.label}
          </button>
          {s.key === 'pump_wear' && (
            <select value={pump} onChange={(e) => setPump(e.target.value)}
              className="rounded-r-lg border border-l-0 border-slate-700 bg-slate-900 px-1.5 py-[7px] text-[11px] text-slate-300 outline-none">
              <option value="homogenizer_pump_1">Homogenizer Pump #1</option>
              <option value="pasteurizer_a_pump">Pasteurizer_A Feed Pump</option>
            </select>
          )}
        </div>
      ))}
      <div className="mx-1 h-6 w-px bg-slate-700" />
      {mode && <Toggle label="Auto-Sync" on={mode.auto_sync} onChange={(v) => call('/auto-sync', { enabled: v })}
        hint="Pillar 1 closed-loop control: intake throttling, filler pacing, A/B rebalancing, auto micro-CIP flush" />}
      {mode && <Toggle label="Auto-Isolate" on={mode.auto_isolate} onChange={(v) => call('/auto-isolate', { enabled: v })}
        hint="Pillar 3 automatic surgical isolation + firewall blocking" />}
      {quarantined.length > 0 && (
        <span className="flex items-center gap-1 rounded-lg bg-fuchsia-500/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-fuchsia-200">
          <ShieldCheck size={13} />{quarantined.length} cell isolated
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-700" title="simulation speed">
          <span className="flex items-center bg-slate-900 px-2 text-slate-500"><Gauge size={13} /></span>
          {SPEEDS.map(([ts, lab]) => (
            <button key={lab} onClick={() => call('/speed', { tick_seconds: ts })}
              className={`px-2 py-1.5 text-[11px] num ${mode?.tick_seconds === ts ? 'bg-sky-500/25 text-sky-200' : 'bg-slate-900 text-slate-400'}`}>{lab}</button>
          ))}
        </div>
        <button onClick={() => call(mode?.paused ? '/resume' : '/pause')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[12px] text-slate-200">
          {mode?.paused ? <Play size={14} /> : <Pause size={14} />}{mode?.paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => call('/reset')}
          className="flex items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-[12px] font-semibold text-sky-200">
          <RotateCcw size={14} />Reset Plant to Normal
        </button>
      </div>
    </div>
  )
}
