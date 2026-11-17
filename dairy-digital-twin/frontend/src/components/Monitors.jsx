import { useEffect, useRef } from 'react'
import { Activity, BrainCircuit, CircleDot, Cpu, Radar, ShieldHalf, Timer } from 'lucide-react'
import { LABEL, LEGACY_HEX, SCENARIOS, SHORT, TONE, UNITS } from '../lib/twin'

const RANK = { OK: 0, WATCH: 1, MAINT: 1, WARN: 2, QUARANTINED: 2, CRITICAL: 3 }

function LegacyScreen({ legacy }) {
  const word = legacy.overall === 'GREEN' ? 'ALL GREEN' : legacy.overall === 'AMBER' ? 'WARNING' : 'ALARM'
  const col = LEGACY_HEX[legacy.overall]
  const bad = UNITS.filter((u) => legacy.units[u].status !== 'GREEN')
  return (
    <div className="hmi p-3">
      <div className="flex items-center justify-between text-[10px] tracking-widest text-[#6b7a6b]">
        <span>SCADA HMI v4.2 · LINE-1</span><span>STATIC LIMITS</span>
      </div>
      <div className="hmi-glow mt-2 text-center text-[30px] font-bold leading-none tracking-[0.12em]" style={{ color: col }}>■ {word}</div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {UNITS.map((u) => (
          <div key={u} className="text-center">
            <div className="mx-auto h-3 w-full rounded-[2px]" style={{ background: LEGACY_HEX[legacy.units[u].status], boxShadow: `0 0 8px ${LEGACY_HEX[legacy.units[u].status]}66` }} />
            <div className="mt-1 text-[8.5px] tracking-wider text-[#7f8f7f]">{SHORT[u]}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 h-4 truncate text-[10.5px] text-[#8fa08f]">
        {bad.length ? `> ${SHORT[bad[0]]}: ${legacy.units[bad[0]].reason}` : '> all values inside limits_'}
      </div>
    </div>
  )
}

function EngineScreen({ engine }) {
  const t = TONE[engine.overall]
  const worst = UNITS.reduce((a, u) => (RANK[engine.units[u].status] > RANK[engine.units[a].status] ? u : a), UNITS[0])
  const headline = engine.overall === 'OK' ? 'All stages balanced - no hidden drift, wear or intrusion'
    : `${LABEL[worst]} - ${engine.units[worst].reason}`
  return (
    <div className="rounded-xl bg-gradient-to-br from-[#0f1d36] to-[#0b1222] p-3 ring-1 ring-sky-400/20">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-sky-300/70">
        <span className="flex items-center gap-1.5"><Radar size={12} />Three-Pillar Engine</span>
        <span className="flex gap-2 text-slate-500"><Activity size={12} /><BrainCircuit size={12} /><ShieldHalf size={12} /></span>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className={`text-[30px] font-extrabold leading-none tracking-tight ${t.text}`}>{engine.overall === 'OK' ? 'BALANCED' : engine.overall}</div>
      </div>
      <div className="mt-1.5 line-clamp-2 min-h-[34px] text-[12.5px] leading-snug text-slate-300">{headline}</div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {UNITS.map((u) => {
          const tt = TONE[engine.units[u].status]
          return (
            <div key={u} className="text-center" title={`${LABEL[u]}: ${engine.units[u].reason}`}>
              <div className="h-3 w-full rounded-full" style={{ background: tt.hex, opacity: engine.units[u].status === 'OK' ? 0.55 : 1, boxShadow: engine.units[u].status === 'OK' ? 'none' : `0 0 10px ${tt.hex}` }} />
              <div className="mt-1 text-[8.5px] font-semibold tracking-wider text-slate-500">{SHORT[u]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Monitors({ frame }) {
  const det = frame.engine.detection
  const rel = (t) => (t === null || t === undefined || det.scenario_tick === null ? null : t - det.scenario_tick)
  const eng = rel(det.engine_first_tick)
  const leg = rel(det.legacy_first_tick)
  const since = det.scenario_tick !== null ? frame.tick - det.scenario_tick : null
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="label">Same plant · two monitors</div>
        <div className="text-[11px] text-slate-500">which one would you trust?</div>
      </div>
      <div className="mt-3 space-y-2.5">
        <LegacyScreen legacy={frame.legacy} />
        <EngineScreen engine={frame.engine} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500"><Cpu size={11} />Engine flagged</div>
          <div className="num mt-1 text-[20px] font-bold text-sky-300">{det.scenario ? (eng === null ? '…' : `+${eng}m`) : '—'}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500"><CircleDot size={11} />Legacy alarm</div>
          <div className={`num mt-1 text-[20px] font-bold ${leg === null ? 'text-emerald-300' : 'text-amber-300'}`}>
            {det.scenario ? (leg === null ? 'never' : `+${leg}m`) : '—'}</div>
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${det.scenario && eng !== null ? 'bg-sky-400/10 ring-sky-400/40' : 'bg-white/[0.03] ring-white/5'}`}>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500"><Timer size={11} />Head start</div>
          <div className="num mt-1 text-[20px] font-bold text-white">
            {!det.scenario || eng === null ? '—' : leg === null ? `${since - eng}m+` : `${leg - eng}m`}</div>
        </div>
      </div>
    </div>
  )
}

const SRC = {
  pillar1: { cls: 'bg-sky-400', name: 'Sync' }, pillar2: { cls: 'bg-violet-400', name: 'Maint' },
  pillar3: { cls: 'bg-rose-400', name: 'Cyber' }, plant: { cls: 'bg-slate-500', name: 'Plant' },
}
const LVL = { crit: 'text-rose-200', warn: 'text-amber-100', action: 'text-emerald-200', info: 'text-slate-200' }

export function Timeline({ frame }) {
  const st = frame.scenario_tick
  const scn = SCENARIOS.find((s) => s.key === frame.scenario)
  let items = []
  if (st !== null && st !== undefined) {
    const seen = new Set()
    for (const e of frame.log) {                       // newest first
      if (e.tick < st) continue
      const key = e.source === 'pillar1' && e.level === 'action' ? e.msg.split(' ').slice(0, 3).join(' ') : e.msg
      if (seen.has(key)) continue                      // keep only the latest of repeating set-point moves
      seen.add(key)
      items.push(e)
    }
    items = items.slice(0, 12).reverse()
  }
  const list = useRef(null)
  const newest = items.length ? `${items[items.length - 1].tick}${items[items.length - 1].msg}` : ''
  useEffect(() => {                                    // keep the latest step of the story in view
    if (list.current) list.current.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [newest])
  return (
    <div className="card flex min-h-0 flex-1 flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="label">Incident timeline</div>
        {scn && <div className="text-[11.5px] text-slate-400">{scn.long} · <span className="num">T+{frame.tick - st}m</span></div>}
      </div>
      {!scn ? (
        <div className="mt-3 flex flex-1 flex-col justify-center gap-2 text-[13px] text-slate-400">
          <div className="text-[15px] font-semibold text-slate-200">Plant running normally.</div>
          <div>800 L/min bottling, every buffer at 50 %, all pumps healthy, OT traffic baseline.</div>
          <div className="text-slate-500">Pick a scenario above. This panel narrates what each pillar sees and does, minute by minute.</div>
        </div>
      ) : (
        <ol ref={list} className="scroll-thin mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {items.length === 0 && <li className="text-[12.5px] text-slate-500">Injected - watching for the first symptom…</li>}
          {items.map((e, i) => (
            <li key={`${e.tick}-${e.msg}`} className="rise flex gap-2.5" style={{ animationDelay: `${i * 20}ms` }}>
              <span className="num w-10 shrink-0 pt-px text-right text-[11px] text-slate-500">+{e.tick - st}m</span>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${(SRC[e.source] || SRC.plant).cls}`} />
              <span className={`text-[12.5px] leading-snug ${LVL[e.level] || 'text-slate-200'}`}>
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{(SRC[e.source] || SRC.plant).name}</span>{e.msg}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
