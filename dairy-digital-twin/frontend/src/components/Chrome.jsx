import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, Presentation, RotateCcw, SlidersHorizontal, Unplug, XCircle } from 'lucide-react'
import { caption, clock, post, SCENARIOS, TABS } from '../lib/twin'
import { attention } from '../lib/actions'
import { BTN, Kbd, StatusBadge } from './ui'

export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0091D3" />
      <path d="M11 7h10v4l2.5 3.5V25a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 25V14.5L11 11z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 18.5h15" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}

const SPEEDS = [[1.0, '½×'], [0.5, '1×'], [0.25, '2×'], [0.125, '4×']]

function ControlsMenu({ mode, call, presenter, setPresenter }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium ${open ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
        <SlidersHorizontal size={16} />Controls
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[290px] rounded-lg border border-line bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(27,42,51,0.35)]">
          <div className="text-[13px] font-semibold text-ink-2">Simulation speed</div>
          <div className="mt-1.5 grid grid-cols-4 overflow-hidden rounded-md border border-line">
            {SPEEDS.map(([ts, lab]) => (
              <button key={lab} onClick={() => call('/speed', { tick_seconds: ts })}
                className={`num py-1.5 text-[14px] ${mode?.tick_seconds === ts ? 'bg-accent text-white' : 'text-ink hover:bg-surface-2'}`}>{lab}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => call(mode?.paused ? '/resume' : '/pause')} className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-[14px] font-semibold ${BTN.secondary}`}>
              {mode?.paused ? <Play size={15} /> : <Pause size={15} />}{mode?.paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => setPresenter(!presenter)} className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-[14px] font-semibold ${presenter ? BTN.primary : BTN.secondary}`}>
              <Presentation size={15} />Presenter
            </button>
          </div>
          <div className="mt-4 text-[13px] font-semibold text-ink-2">Keyboard</div>
          <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink">
            <li className="flex justify-between"><span>Run scenario 1-4</span><span className="flex gap-1"><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd><Kbd>4</Kbd></span></li>
            <li className="flex justify-between"><span>Reset plant</span><Kbd>R</Kbd></li>
            <li className="flex justify-between"><span>Auto-Sync on/off</span><Kbd>A</Kbd></li>
            <li className="flex justify-between"><span>Auto-Isolate on/off</span><Kbd>I</Kbd></li>
            <li className="flex justify-between"><span>Presenter mode</span><Kbd>P</Kbd></li>
          </ul>
        </div>
      )}
    </div>
  )
}

export function AppHeader({ route, go, frame, mode, connected, call, presenter, setPresenter }) {
  const state = !connected ? ['Offline', 'bg-crit'] : mode?.paused ? ['Paused', 'bg-warn'] : ['Live', 'bg-ok']
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-[1680px] items-stretch gap-6 px-6">
        <button onClick={() => go('home')} className="flex items-center gap-2.5" title="Back to the homepage">
          <LogoMark />
          <span className="text-[16px] font-semibold text-ink">Dairy Digital Twin</span>
        </button>
        <nav className="hidden items-stretch gap-1 md:flex">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => go(t.key)}
              className={`border-b-2 px-3 text-[14.5px] font-medium transition-colors ${route === t.key ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="num hidden text-[14px] text-ink-2 lg:inline" title="Simulated plant time">T+{frame ? clock(frame.sim_min) : '--:--'}</span>
          <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[13.5px] font-semibold text-ink">
            {connected ? <span className={`live-dot h-2 w-2 rounded-full ${state[1]}`} /> : <Unplug size={14} className="text-crit" />}{state[0]}
          </span>
          <ControlsMenu mode={mode} call={call} presenter={presenter} setPresenter={setPresenter} />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line-2 px-4 md:hidden">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => go(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-[14px] ${route === t.key ? 'border-accent text-ink' : 'border-transparent text-ink-2'}`}>{t.label}</button>
        ))}
      </nav>
    </header>
  )
}

function Switch({ on, onChange, label, hint, k }) {
  return (
    <button onClick={() => onChange(!on)} title={hint} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface">
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-ok' : 'bg-ink-3'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <span className={`text-[13px] font-semibold ${on ? 'text-ok' : 'text-ink-2'}`}>{on ? 'on' : 'off'}</span>
      <Kbd>{k}</Kbd>
    </button>
  )
}

export function ScenarioBar({ frame, mode, call }) {
  const active = frame?.scenario
  const since = frame && frame.scenario_tick !== null && frame.scenario_tick !== undefined ? frame.tick - frame.scenario_tick : null
  return (
    <div className="border-b border-line bg-white/75">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-2 px-6 py-2.5">
        <span className="mr-1 text-[14px] font-semibold text-ink">Scenarios</span>
        {SCENARIOS.map((s) => {
          const on = active === s.key
          return (
            <div key={s.key} className="group relative">
              <button onClick={() => call(`/scenario/${s.key}`)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[14px] font-medium transition-colors ${on
                  ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink hover:border-accent'}`}>
                <span className={`mono rounded px-1 text-[12px] ${on ? 'bg-white/20' : 'bg-surface-2 text-ink-2'}`}>{s.n}</span>
                {s.title}
                {on && <span className="num text-[13px] opacity-90">· T+{since} min</span>}
              </button>
              <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-[340px] rounded-lg border border-line bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(27,42,51,0.35)] group-hover:block">
                <div className="text-[16px] font-semibold text-ink">{s.long}</div>
                <p className="mt-1 text-[14px] leading-relaxed text-ink">{s.blurb}</p>
                <p className="mt-2 border-t border-line-2 pt-2 text-[13.5px] leading-snug text-ink-2"><b className="text-ink">Demo tip:</b> {s.tip}</p>
              </div>
            </div>
          )
        })}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Switch on={!!mode?.auto_sync} onChange={(v) => call('/auto-sync', { enabled: v })} label="Auto-Sync" k="A"
            hint="Pillar 1 self-balancing: throttles intake, paces the filler, rebalances A/B and cleans a clogging valve" />
          <Switch on={!!mode?.auto_isolate} onChange={(v) => call('/auto-isolate', { enabled: v })} label="Auto-Isolate" k="I"
            hint="Pillar 3 cyber response: isolates only the hacked unit and blocks the attacker" />
          <button onClick={() => call('/reset')} title="Clear every scenario and restart the plant (switches are kept)"
            className={`ml-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-semibold ${BTN.secondary}`}>
            <RotateCcw size={15} />Reset <Kbd>R</Kbd>
          </button>
        </div>
      </div>
    </div>
  )
}

/** One sentence for the audience + any action the operator should take now. */
export function CaptionStrip({ frame, mode, call }) {
  const todo = attention(frame, mode)
  return (
    <section className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
      <p className="min-w-[280px] flex-1 text-[17px] font-medium leading-snug text-ink">{caption(frame, mode)}</p>
      {todo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {todo.map((t) => (
            <span key={t.key} className="rise flex items-center gap-2 rounded-md border border-line bg-surface-2 py-1 pl-1.5 pr-1 text-[14px] text-ink">
              <StatusBadge status={t.status} label={t.text} />
              {t.act && (
                <button onClick={() => call(t.act.path, t.act.body)}
                  className={`rounded px-2.5 py-1 text-[13.5px] font-semibold ${t.status === 'QUARANTINED' ? BTN.iso : t.status === 'CRITICAL' ? BTN.crit : BTN.primary}`}>{t.act.label}</button>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div key={toast.id} className={`rise fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md border bg-surface px-4 py-2.5 text-[14px] text-ink shadow-[0_12px_32px_-12px_rgba(27,42,51,0.35)] ${toast.ok ? 'border-ok' : 'border-crit'}`}>
      {toast.ok ? <CheckCircle2 size={17} className="text-ok" /> : <XCircle size={17} className="text-crit" />}{toast.msg}
    </div>
  )
}
