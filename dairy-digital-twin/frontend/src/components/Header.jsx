import { useState } from 'react'
import { Bug, Gauge, Milk, Pause, Play, RotateCcw, ShieldHalf, Thermometer, Unplug, Waves, Workflow, Wrench } from 'lucide-react'
import { clock, post, SCENARIOS } from '../lib/twin'

const SPEEDS = [[1.0, '½×'], [0.5, '1×'], [0.25, '2×'], [0.125, '4×']]

export function TopBar({ frame, mode, connected, notify }) {
  const call = async (path, body) => {
    const r = await post(path, body)
    notify(r.message || (r.ok ? 'done' : 'failed'), r.ok !== false)
  }
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#05080f]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1920px] items-center gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-sky-500/20">
            <Milk size={21} />
          </div>
          <div>
            <div className="text-[17px] font-bold tracking-tight text-white">Dairy Digital Twin</div>
            <div className="text-[11.5px] text-slate-400">Three-Pillar Causal Engine · <span className="text-slate-500">PS 1 · Beyond the Factory Floor</span></div>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-3 lg:flex">
          <div className="rounded-xl bg-white/[0.03] px-4 py-1.5 ring-1 ring-white/10">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-slate-500">Plant clock</div>
            <div className="num text-[20px] font-bold leading-tight text-white">T+{frame ? clock(frame.sim_min) : '--:--'}</div>
          </div>
          <div className="text-[11px] leading-tight text-slate-500">1 tick = 1 simulated minute<br />engine refresh 2 Hz</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-white/10" title="Simulation speed">
            <span className="grid place-items-center bg-white/[0.03] px-2 text-slate-500"><Gauge size={14} /></span>
            {SPEEDS.map(([ts, lab]) => (
              <button key={lab} onClick={() => call('/speed', { tick_seconds: ts })}
                className={`num px-2.5 py-1.5 text-[12px] transition ${mode?.tick_seconds === ts ? 'bg-sky-400/20 text-sky-200' : 'bg-white/[0.02] text-slate-400 hover:text-white'}`}>{lab}</button>
            ))}
          </div>
          <button onClick={() => call(mode?.paused ? '/resume' : '/pause')}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-slate-200 ring-1 ring-white/10 hover:bg-white/[0.07]">
            {mode?.paused ? <Play size={14} /> : <Pause size={14} />}{mode?.paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={() => call('/reset')}
            className="flex items-center gap-1.5 rounded-lg bg-sky-400/15 px-3 py-1.5 text-[12.5px] font-semibold text-sky-100 ring-1 ring-sky-400/50 hover:bg-sky-400/25">
            <RotateCcw size={14} />Reset plant
          </button>
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold tracking-wide ${connected
            ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40'}`}>
            {connected ? <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" /> : <Unplug size={13} />}
            {connected ? (mode?.paused ? 'PAUSED' : 'LIVE') : 'OFFLINE'}
          </div>
        </div>
      </div>
    </header>
  )
}

const ICONS = { drift: Waves, pump_wear: Wrench, cyber_spike: Bug, chiller_spoof: Thermometer }
const ACCENT = {
  drift: 'from-amber-400/25 ring-amber-400/60 text-amber-300',
  pump_wear: 'from-violet-400/25 ring-violet-400/60 text-violet-300',
  cyber_spike: 'from-rose-500/25 ring-rose-500/60 text-rose-300',
  chiller_spoof: 'from-fuchsia-500/25 ring-fuchsia-500/60 text-fuchsia-300',
}

function Switch({ on, onChange, title, sub, icon: Icon }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition ${on
        ? 'bg-emerald-400/[0.08] ring-emerald-400/40' : 'bg-white/[0.02] ring-white/10 hover:ring-white/20'}`}>
      <Icon size={18} className={on ? 'text-emerald-300' : 'text-slate-500'} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-white">{title}</div>
        <div className="truncate text-[11px] text-slate-400">{sub}</div>
      </div>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

export function ScenarioDeck({ frame, mode, notify }) {
  const [pump, setPump] = useState('homogenizer_pump_1')
  const call = async (path, body) => {
    const r = await post(path, body)
    notify(r.message || (r.ok ? 'done' : 'failed'), r.ok !== false)
  }
  const active = frame?.scenario
  const since = frame && frame.scenario_tick !== null && frame.scenario_tick !== undefined ? frame.tick - frame.scenario_tick : null
  return (
    <div className="mx-auto grid max-w-[1920px] gap-3 px-5 pt-4 xl:grid-cols-12">
      <div className="grid gap-3 sm:grid-cols-2 xl:col-span-8 xl:grid-cols-4">
        {SCENARIOS.map((s) => {
          const Icon = ICONS[s.key]
          const on = active === s.key
          const [grad, ring, text] = ACCENT[s.key].split(' ')
          return (
            <div key={s.key} className={`group relative overflow-hidden rounded-2xl ring-1 transition ${on ? `bg-gradient-to-br ${grad} to-transparent ${ring}` : 'bg-white/[0.02] ring-white/10 hover:ring-white/25'}`}>
              <button onClick={() => call(`/scenario/${s.key}${s.key === 'pump_wear' ? `?target=${pump}` : ''}`)} className="w-full px-4 pb-3 pt-3.5 text-left">
                <div className="flex items-center gap-2">
                  <span className={`num grid h-6 w-6 place-items-center rounded-md bg-white/5 text-[12px] font-bold ${on ? text : 'text-slate-400'}`}>{s.n}</span>
                  <Icon size={17} className={on ? text : 'text-slate-400 group-hover:text-slate-200'} />
                  {on && <span className={`ml-auto flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${text}`}>
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" />running · <span className="num">T+{since}m</span></span>}
                </div>
                <div className="mt-2 text-[14px] font-semibold leading-snug text-white">{s.title}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{s.blurb}</div>
              </button>
              {s.key === 'pump_wear' && (
                <select value={pump} onChange={(e) => setPump(e.target.value)}
                  className="mx-4 mb-3 -mt-1 w-[calc(100%-2rem)] rounded-md bg-[#0b1322] px-2 py-1 text-[11.5px] text-slate-300 ring-1 ring-white/10 outline-none">
                  <option value="homogenizer_pump_1">on Homogenizer Pump #1</option>
                  <option value="pasteurizer_a_pump">on Pasteurizer A Feed Pump</option>
                </select>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-2 xl:col-span-4 sm:flex-row xl:flex-col">
        <Switch on={!!mode?.auto_sync} onChange={(v) => call('/auto-sync', { enabled: v })} icon={Workflow}
          title={`Auto-Sync ${mode?.auto_sync ? 'ON' : 'OFF'}`} sub="Pillar 1 · intake throttle, filler pacing, A/B rebalance, auto CIP flush" />
        <Switch on={!!mode?.auto_isolate} onChange={(v) => call('/auto-isolate', { enabled: v })} icon={ShieldHalf}
          title={`Auto-Isolate ${mode?.auto_isolate ? 'ON' : 'OFF'}`} sub="Pillar 3 · surgical cell isolation + firewall block" />
      </div>
    </div>
  )
}
