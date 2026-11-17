import { Bug, Gauge, Lightbulb, Milk, Pause, Play, RotateCcw, ShieldHalf, Thermometer, Unplug, Waves, Workflow, Wrench } from 'lucide-react'
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
            <div className="text-[11.5px] text-slate-400">Spots hidden slowdowns, wear and cyber attacks before the old SCADA does</div>
          </div>
        </div>

        <div className="mx-auto hidden items-center lg:flex" title="1 tick = 1 simulated minute · the engine refreshes twice a second at 1×">
          <div className="rounded-xl bg-white/[0.03] px-4 py-1.5 text-center ring-1 ring-white/10">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-slate-500">Plant clock</div>
            <div className="num text-[20px] font-bold leading-tight text-white">T+{frame ? clock(frame.sim_min) : '--:--'}</div>
          </div>
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
          <button onClick={() => call('/reset')} title="Clear every scenario and restart the plant (your switch settings are kept)"
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
const ACTIVE = {
  drift: 'bg-amber-400/15 text-amber-200 ring-amber-400/60',
  pump_wear: 'bg-violet-400/15 text-violet-200 ring-violet-400/60',
  cyber_spike: 'bg-rose-500/15 text-rose-200 ring-rose-500/60',
  chiller_spoof: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-500/60',
}

function MiniSwitch({ on, onChange, title, sub, icon: Icon }) {
  return (
    <button onClick={() => onChange(!on)} title={sub}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1 transition ${on ? 'bg-emerald-400/[0.08] ring-emerald-400/40' : 'bg-white/[0.02] ring-white/10 hover:ring-white/25'}`}>
      <Icon size={16} className={on ? 'text-emerald-300' : 'text-slate-500'} />
      <div className="text-left leading-tight">
        <div className="text-[13px] font-semibold text-white">{title}</div>
        <div className="text-[10.5px] text-slate-400">{on ? 'ON · engine acts by itself' : 'OFF · engine only warns'}</div>
      </div>
      <span className={`relative ml-1 h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function ScenarioBar({ frame, mode, notify }) {
  const call = async (path, body) => {
    const r = await post(path, body)
    notify(r.message || (r.ok ? 'done' : 'failed'), r.ok !== false)
  }
  const active = frame?.scenario
  const since = frame && frame.scenario_tick !== null && frame.scenario_tick !== undefined ? frame.tick - frame.scenario_tick : null
  return (
    <div className="mx-auto max-w-[1920px] px-5 pt-4">
      <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="mr-2">
          <div className="text-[13.5px] font-semibold text-white">Try a scenario</div>
          <div className="text-[11px] text-slate-500">hover a button to see what happens</div>
        </div>
        {SCENARIOS.map((s) => {
          const Icon = ICONS[s.key]
          const on = active === s.key
          return (
            <div key={s.key} className="group relative">
              <button onClick={() => call(`/scenario/${s.key}`)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold ring-1 transition ${on ? ACTIVE[s.key]
                  : 'bg-white/[0.03] text-slate-200 ring-white/10 hover:bg-white/[0.06] hover:ring-white/25'}`}>
                <span className="num grid h-5 w-5 place-items-center rounded-md bg-black/30 text-[11px]">{s.n}</span>
                <Icon size={16} />{s.title}
                {on && <span className="num ml-1 flex items-center gap-1 text-[11px] font-bold"><span className="live-dot h-1.5 w-1.5 rounded-full bg-current" />T+{since}m</span>}
              </button>
              <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-[320px] rounded-xl bg-[#0a1220] p-3.5 shadow-2xl ring-1 ring-white/15 group-hover:block">
                <div className="text-[14px] font-bold text-white">{s.long}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{s.blurb}</p>
                <div className="mt-2 flex gap-1.5 rounded-lg bg-sky-400/10 px-2.5 py-1.5 text-[12px] text-sky-100"><Lightbulb size={14} className="mt-px shrink-0" />{s.tip}</div>
              </div>
            </div>
          )
        })}
        <div className="ml-auto flex flex-wrap gap-2">
          <MiniSwitch on={!!mode?.auto_sync} onChange={(v) => call('/auto-sync', { enabled: v })} icon={Workflow}
            title="Auto-Sync" sub="Self-balancing: throttles intake, paces the filler, rebalances A/B and cleans a clogging valve automatically" />
          <MiniSwitch on={!!mode?.auto_isolate} onChange={(v) => call('/auto-isolate', { enabled: v })} icon={ShieldHalf}
            title="Auto-Isolate" sub="Cyber defense: quarantines only the hacked unit and blocks the attacker, with no full shutdown" />
        </div>
      </div>
    </div>
  )
}
