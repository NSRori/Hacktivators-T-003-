import { useEffect, useRef } from 'react'
import { fmt, fmtInt, LABEL, LEGACY, SCENARIOS, TONE, UNITS } from '../lib/twin'
import { Panel, STATUS_ICON, StatusBadge } from './ui'

const RANK = { OK: 0, WATCH: 1, MAINT: 1, WARN: 2, QUARANTINED: 2, CRITICAL: 3 }

/* ---------------------------------------------------------------- legacy vs engine */
function LegacyPanel({ legacy }) {
  const L = LEGACY[legacy.overall]
  return (
    <div className="hmi flex flex-col p-3.5">
      <div className="flex items-center justify-between text-[12px] text-[#9AA3A9]"><span>LEGACY SCADA</span><span>fixed limits</span></div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="h-5 w-5 rounded-sm" style={{ background: L.hex }} />
        <span className="text-[26px] font-medium uppercase leading-none tracking-wide" style={{ color: L.hex }}>{L.word}</span>
      </div>
      <ul className="mt-3.5 space-y-1.5 text-[13.5px]">
        {UNITS.map((u) => {
          const x = legacy.units[u]
          return (
            <li key={u} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: LEGACY[x.status].hex }} />
              <span className="truncate text-[#D7DCDF]">{LABEL[u]}</span>
              <span className="ml-auto truncate text-[12.5px] text-[#9AA3A9]">{x.status === 'GREEN' ? (x.reason === 'within limits' ? 'ok' : x.reason) : x.reason}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EnginePanel({ engine }) {
  const t = TONE[engine.overall]
  const Icon = STATUS_ICON[engine.overall]
  return (
    <div className="flex flex-col rounded-md border border-line border-t-4 border-t-accent bg-surface p-3.5">
      <div className="flex items-center justify-between text-[12px] font-semibold text-accent"><span>THREE-PILLAR ENGINE</span><span className="font-normal text-ink-2">cross-stage</span></div>
      <div className={`mt-3 flex items-center gap-2 ${t.text}`}>
        <Icon size={22} strokeWidth={2.4} />
        <span className="text-[26px] font-semibold uppercase leading-none tracking-wide">{engine.overall === 'OK' ? 'Balanced' : t.word}</span>
      </div>
      <ul className="mt-3.5 space-y-1.5 text-[13.5px]">
        {UNITS.map((u) => {
          const x = engine.units[u]
          const ut = TONE[x.status]
          const I = STATUS_ICON[x.status]
          return (
            <li key={u} className="flex items-center gap-2" title={x.reason}>
              <I size={14} className={`shrink-0 ${ut.text}`} strokeWidth={2.4} />
              <span className="shrink-0 text-ink">{LABEL[u]}</span>
              <span className={`ml-auto truncate text-[12.5px] ${x.status === 'OK' ? 'text-ink-3' : ut.text}`}>{x.status === 'OK' ? 'ok' : x.reason}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The hero metric: how much earlier the engine noticed than the legacy SCADA (spec §5.5). */
export function DetectionTimeline({ frame }) {
  const d = frame.engine.detection
  if (!d.scenario) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-3.5 text-[14px] text-ink-2">
        Run a scenario and this bar compares <b className="text-ink">when each monitor notices the problem</b>.
      </div>
    )
  }
  const now = frame.tick - d.scenario_tick
  const e = d.engine_first_tick === null ? null : d.engine_first_tick - d.scenario_tick
  const l = d.legacy_first_tick === null ? null : d.legacy_first_tick - d.scenario_tick
  const span = Math.max(now, 12)
  const pct = (v) => `${(Math.min(v, span) / span) * 100}%`
  const lead = e === null ? null : l === null ? now - e : l - e
  return (
    <div className="rounded-md border border-line bg-surface px-4 pb-3 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-ink">Who noticed first?</span>
        {lead !== null && lead > 0 ? (
          <span className="text-[14px] text-ink-2"><b className="num text-[22px] font-semibold text-accent">{lead} min</b> {l === null ? 'and counting' : ''} earlier warning</span>
        ) : <span className="text-[14px] text-ink-2">engine watching…</span>}
      </div>
      <div className="relative mx-2 mb-12 mt-4 h-1.5 rounded-sm bg-line-2">
        <div className="absolute inset-y-0 left-0 rounded-sm bg-accent-3" style={{ width: pct(now) }} />
        {e !== null && l !== null && <div className="absolute inset-y-0 bg-accent" style={{ left: pct(e), width: `calc(${pct(l)} - ${pct(e)})` }} />}
        {e !== null && l === null && <div className="absolute inset-y-0 bg-accent" style={{ left: pct(e), width: `calc(${pct(now)} - ${pct(e)})` }} />}
        <Mark at="0%" label="Start" sub="T+0" align="left" hideLabel={e !== null && e / span < 0.22} />
        {e !== null && <Mark at={pct(e)} label="Engine" sub={`+${e} min`} tone="accent" align={e / span < 0.22 ? 'left' : 'center'} />}
        {l !== null ? <Mark at={pct(l)} label="Legacy" sub={`+${l} min`} tone="legacy" align={l / span > 0.88 ? 'right' : 'center'} />
          : <span className="absolute right-0 top-4 text-right text-[12.5px] leading-tight text-ink-2"><b className="text-ink">Legacy</b><br />no alarm yet</span>}
      </div>
      <div className="text-[12.5px] text-ink-3">Simulated minutes since the scenario started.</div>
    </div>
  )
}

function Mark({ at, label, sub, tone, align = 'center', hideLabel = false }) {
  const col = tone === 'accent' ? 'bg-accent' : tone === 'legacy' ? 'bg-legacy' : 'bg-ink-3'
  const pos = align === 'left' ? 'left-0 text-left' : align === 'right' ? 'right-0 text-right' : 'left-1/2 -translate-x-1/2 text-center'
  return (
    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at }}>
      <span className={`block h-3.5 w-3.5 rounded-full border-2 border-surface ${col}`} />
      {!hideLabel && (
        <span className={`absolute top-5 whitespace-nowrap text-[12.5px] leading-tight ${pos}`}>
          <b className="text-ink">{label}</b><br /><span className="num text-ink-2">{sub}</span>
        </span>
      )}
    </span>
  )
}

export function Verdict({ frame, className = '' }) {
  return (
    <Panel wid="verdict" title="Same plant, two monitors" right={<span className="text-[13px] text-ink-2">which would you trust?</span>}
      className={className} bodyClass="@container flex flex-col gap-3 !px-4 !pt-3.5">
      <div className="grid grid-cols-1 gap-3 @min-[420px]:grid-cols-2">
        <LegacyPanel legacy={frame.legacy} />
        <EnginePanel engine={frame.engine} />
      </div>
      <DetectionTimeline frame={frame} />
    </Panel>
  )
}

/* ---------------------------------------------------------------- KPIs */
export function KpiRow({ frame, className = '' }) {
  const k = frame.kpi
  const ret = k.retention_pct
  const sret = k.scenario_retention_pct
  const lost = k.wasted_l + k.unsafe_l + k.at_risk_l
  const tiles = [
    { label: 'Bottling now', v: fmt(k.throughput_lpm), u: 'L/min', sub: `${fmt(ret)} % of target`, tone: ret >= 95 ? 'text-ink' : ret >= 80 ? 'text-warn-ink' : 'text-crit' },
    { label: 'Output kept', v: sret === null ? '—' : fmt(sret, 1), u: sret === null ? '' : '%', sub: sret === null ? 'no scenario yet' : 'since scenario start', tone: sret === null || sret >= 95 ? 'text-ink' : sret >= 85 ? 'text-warn-ink' : 'text-crit' },
    { label: 'Milk lost or unsafe', v: fmtInt(lost), u: 'L', sub: lost ? `${fmtInt(k.wasted_l)} spilled · ${fmtInt(k.unsafe_l + k.at_risk_l)} unsafe` : 'none', tone: lost ? 'text-crit' : 'text-ink' },
    { label: 'Filler stopped', v: fmt(k.starved_min), u: 'min', sub: k.starved_min ? 'waiting for milk' : 'never ran dry', tone: k.starved_min ? 'text-warn-ink' : 'text-ink' },
  ]
  // 4 across when the card is wide enough, otherwise 2 x 2: the tiles never squeeze their text into the next card
  return (
    <Panel wid="kpi" title="Production at a glance" className={className} bodyClass="@container !p-0">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-[9px] bg-line-2 @min-[560px]:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 bg-surface px-4 py-3.5">
            <div className="text-[13px] text-ink-2">{t.label}</div>
            <div className={`num mt-1 whitespace-nowrap text-[26px] font-semibold leading-none ${t.tone}`}>{t.v}<span className="ml-1 text-[13px] font-normal text-ink-2">{t.u}</span></div>
            <div className="mt-1.5 text-[13px] leading-snug text-ink-2">{t.sub}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ---------------------------------------------------------------- incident story */
const SRC = { pillar1: ['Sync', 'bg-accent'], pillar2: ['Maintenance', 'bg-warn'], pillar3: ['Cyber', 'bg-iso'], plant: ['Plant', 'bg-ink-3'] }

export function IncidentStory({ frame, max = 12, className = '' }) {
  const st = frame.scenario_tick
  const scn = SCENARIOS.find((s) => s.key === frame.scenario)
  let items = []
  if (st !== null && st !== undefined) {
    const seen = new Set()
    for (const e of frame.log) {
      if (e.tick < st) continue
      const key = e.source === 'pillar1' && e.level === 'action' ? e.msg.split(' ').slice(0, 3).join(' ') : e.msg
      if (seen.has(key)) continue
      seen.add(key)
      items.push(e)
    }
    items = items.slice(0, max).reverse()
  }
  return (
    <Panel wid="story" title="What happened, step by step" zoom="fill" className={className} bodyClass="!p-0 flex flex-col"
      right={scn && <span className="num text-[13px] text-ink-2">{scn.long} · T+{frame.tick - st} min</span>}>
      {!scn ? (
        <p className="px-5 py-4 text-[14.5px] text-ink-2">Nothing to report. Start a scenario and each pillar’s findings and actions appear here as they happen.</p>
      ) : <StoryList items={items} st={st} />}
    </Panel>
  )
}

/* its own component so it remounts (and scrolls to the newest line) when the card opens in the focus view */
function StoryList({ items, st }) {
  const list = useRef(null)
  const newest = items.length ? items[items.length - 1].tick + items[items.length - 1].msg : ''
  useEffect(() => {
    if (list.current) list.current.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [newest])
  return (
    <ol ref={list} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
      {items.length === 0 && <li className="text-[14px] text-ink-2">Injected. Waiting for the first symptom…</li>}
      {items.map((e) => {
        const [name, dot] = SRC[e.source] || SRC.plant
        return (
          <li key={`${e.tick}-${e.msg}`} className="rise grid grid-cols-[64px_96px_1fr] gap-2 text-[14px] leading-snug">
            <span className="num text-ink-2">+{e.tick - st} min</span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2"><span className={`h-2 w-2 rounded-full ${dot}`} />{name}</span>
            <span className={e.level === 'crit' ? 'font-medium text-crit' : 'text-ink'}>{e.msg.replace(/^\[[A-Z_]+\]\s*/, '')}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------------------------------------------------------------- knock-on effects */
export function KnockOn({ frame, className = '' }) {
  const c = frame.engine.pillar1.cascade
  return (
    <Panel wid="knockon" title="Knock-on effects" zoom="fill" className={className} bodyClass="!p-0 scroll-thin overflow-y-auto"
      sub="The dependency graph follows a problem downstream (and upstream) and estimates when it arrives.">
      {c.length === 0 ? <p className="px-5 py-4 text-[14.5px] text-ink-2">None. Every stage is balanced.</p> : (
        <ul className="divide-y divide-line-2">
          {c.map((x) => (
            <li key={x.from + x.node} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[14.5px]">
              <StatusBadge status={x.eta_min !== null && x.eta_min < 1 ? 'CRITICAL' : 'WARN'} label={x.eta_min === null ? 'At risk' : x.eta_min < 1 ? 'Now' : `${fmt(x.eta_min)} min`} />
              <span className="text-ink"><b className="font-semibold">{LABEL[x.node]}</b> {x.effect}</span>
              <span className="ml-auto text-[13px] text-ink-2">caused by {LABEL[x.from]}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function worstUnit(engine) {
  return UNITS.reduce((a, u) => (RANK[engine.units[u].status] > RANK[engine.units[a].status] ? u : a), UNITS[0])
}
