import { useEffect, useState } from 'react'
import { Activity, BrainCircuit, ClipboardList, Filter, ScrollText, ShieldHalf, Siren, Wrench } from 'lucide-react'
import { ChillerChart, LevelsChart, PressureChart, SpoofChart, ThroughputChart, VibrationChart } from './Charts'
import { fmt, LABEL, post, SCENARIOS, SEVERITY } from '../lib/twin'

/* ------------------------------------------------------------------ small parts */
const Row = ({ k, v, tone = 'text-slate-100' }) => (
  <div className="flex items-baseline justify-between gap-3 text-[13px]">
    <span className="text-slate-400">{k}</span><span className={`num ${tone}`}>{v}</span>
  </div>
)
const mins = (v) => (v === null || v === undefined ? '—' : `${fmt(v)} min`)

function ZBar({ label, z, thr = 4 }) {
  const hot = Math.abs(z) >= thr
  const w = Math.min(50, (Math.abs(z) / (thr * 2)) * 50)
  return (
    <div>
      <div className="flex justify-between text-[12.5px]"><span className="text-slate-400">{label}</span><span className={`num ${hot ? 'text-amber-300' : 'text-slate-300'}`}>z = {fmt(z, 1)}</span></div>
      <div className="relative mt-1 h-2 rounded-full bg-[#162033]">
        <div className={`absolute h-full rounded-full ${hot ? 'bg-amber-400' : 'bg-sky-400/70'}`}
          style={{ left: z >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, transition: 'all .4s' }} />
        <div className="absolute -top-0.5 h-3 w-px bg-slate-400" style={{ left: '50%' }} />
        <div className="absolute -top-0.5 h-3 w-px bg-amber-400/60" style={{ left: '75%' }} />
        <div className="absolute -top-0.5 h-3 w-px bg-amber-400/60" style={{ left: '25%' }} />
      </div>
    </div>
  )
}

function Panel({ icon: Icon, title, right, children, className = '' }) {
  return (
    <div className={`card flex flex-col p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-white"><Icon size={16} className="text-slate-400" />{title}</div>{right}
      </div>
      <div className="mt-3 flex-1">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ Pillar 1 */
function SyncPanel({ frame }) {
  const p1 = frame.engine.pillar1
  const sp = p1.setpoints
  return (
    <Panel icon={Activity} title="Pillar 1 · Production Sync">
      <div className={`rounded-xl px-3 py-2 text-[13px] ${p1.drift_detected ? 'bg-amber-400/10 text-amber-100 ring-1 ring-amber-400/30' : 'bg-white/[0.03] text-slate-400'}`}>
        {p1.drift_detected ? <>Silent drift found: <b>{p1.root_cause}</b>, about <b className="num">{fmt(p1.est_fouling_pct)} %</b>. Legacy pressure limits still read OK.</>
          : 'No silent drift. Rolling Z-scores are inside ±4σ.'}
      </div>
      <div className="mt-3 space-y-3">
        <ZBar label="Homogenizer pressure vs healthy baseline" z={p1.z.homog_pressure} />
        <ZBar label="Surge tank net flow" z={p1.z.surge_net_flow} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[['Bottleneck in', p1.t_to_bottleneck_min, 'text-amber-300'], ['T_starve', p1.t_starve_min, 'text-rose-300'], ['T_overflow', p1.t_overflow_min, 'text-rose-300']].map(([k, v, c]) => (
          <div key={k} className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
            <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className={`num mt-1 text-[18px] font-bold ${v === null ? 'text-slate-500' : c}`}>{mins(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5 border-t border-white/5 pt-3">
        <Row k="Raw-milk intake pump" v={`${fmt(sp.intake_pct)} %`} />
        <Row k="Aseptic filler pace" v={`${fmt(sp.filler_pace_pct)} %`} />
        <Row k="Pasteurizer split A / B" v={`${fmt(sp.split_a_pct)} / ${fmt(100 - sp.split_a_pct)} %`} />
        <div className={`pt-1 text-[12px] ${p1.auto_sync ? 'text-emerald-300' : 'text-slate-500'}`}>
          {p1.auto_sync ? '● Closed-loop control active' : '○ Auto-Sync OFF: fixed legacy set-points'}</div>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ Pillar 2 */
const PRIO = { CRITICAL: 'ring-rose-500/50 bg-rose-500/[0.07]', HIGH: 'ring-amber-400/50 bg-amber-400/[0.06]', MEDIUM: 'ring-sky-400/40 bg-sky-400/[0.05]' }
const STATUS = { OPEN: 'bg-amber-400 text-slate-950', DISPATCHED: 'bg-sky-400 text-slate-950', RESOLVED: 'bg-emerald-500 text-slate-950', FAILED: 'bg-rose-600 text-white' }

function RulCard({ label, rul, vib }) {
  const tone = rul === null ? 'text-emerald-300' : rul < 30 ? 'text-rose-300' : rul < 90 ? 'text-amber-300' : 'text-sky-300'
  const pct = rul === null ? 100 : Math.max(2, Math.min(100, (rul / 160) * 100))
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
      <div className="text-[12px] text-slate-400">{label}</div>
      <div className={`num mt-1 text-[26px] font-bold leading-none ${tone}`}>{rul === null ? 'Healthy' : `${fmt(rul)} min`}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{rul === null ? 'no degradation trend' : 'remaining useful life'} · {fmt(vib, 2)} mm/s</div>
      <div className="mt-2 h-1.5 rounded-full bg-[#162033]">
        <div className={`h-full rounded-full ${rul === null ? 'bg-emerald-400/70' : rul < 30 ? 'bg-rose-400' : rul < 90 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${pct}%`, transition: 'width .5s' }} />
      </div>
    </div>
  )
}

function MaintPanel({ frame, notify }) {
  const p2 = frame.engine.pillar2
  const dispatch = async (id) => {
    const r = await post(`/maintenance/${id}/dispatch`)
    notify(r.message, r.ok)
  }
  return (
    <Panel icon={BrainCircuit} title="Pillar 2 · Predictive Maintenance">
      <div className="text-[12.5px] text-slate-400">IsolationForest anomaly score</div>
      <div className="mt-1 flex items-center gap-3">
        <div className="relative h-3 flex-1 rounded-full bg-[#162033]">
          <div className={`h-full rounded-full ${p2.anomaly_score >= 0.6 ? 'bg-rose-400' : 'bg-violet-400/80'}`} style={{ width: `${p2.anomaly_score * 100}%`, transition: 'width .3s' }} />
          <div className="absolute -top-1 h-5 w-0.5 bg-white/60" style={{ left: '60%' }} />
        </div>
        <span className={`num w-24 text-right text-[15px] font-bold ${p2.anomaly_flag ? 'text-rose-300' : 'text-slate-200'}`}>{fmt(p2.anomaly_score, 2)}{p2.anomaly_flag ? ' !' : ''}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">top driver: {p2.top_feature || '—'} · alarm line at 0.60</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <RulCard label="Homogenizer Pump #1" rul={p2.rul_min.homogenizer_pump_1} vib={frame.pumps.homogenizer_pump_1.vibration_mms} />
        <RulCard label="Pasteurizer A Feed Pump" rul={p2.rul_min.pasteurizer_a_pump} vib={frame.pumps.pasteurizer_a_pump.vibration_mms} />
      </div>
      <div className="mt-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500"><ClipboardList size={13} />Dispatch tickets</div>
      <div className="scroll-thin mt-2 max-h-[260px] space-y-2 overflow-y-auto pr-1">
        {p2.tickets.length === 0 && <div className="py-4 text-center text-[13px] text-slate-500">No tickets. All equipment is healthy.</div>}
        {p2.tickets.map((t) => (
          <div key={t.id} className={`rounded-xl p-3 ring-1 ${t.status === 'RESOLVED' ? 'bg-white/[0.02] opacity-60 ring-white/5' : PRIO[t.priority]}`}>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-slate-500">{t.id}</span>
              <span className="text-[13.5px] font-semibold text-white">{t.label}</span>
              <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold ${STATUS[t.status]}`}>{t.status}{t.auto ? ' · AUTO' : ''}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-slate-300">{t.issue}</div>
            <div className="text-[11.5px] text-slate-500">{t.metric}</div>
            <div className="mt-2 flex items-center gap-2">
              {t.status !== 'RESOLVED' && t.rul_min !== null && (
                <span className={`num rounded-md px-2 py-0.5 text-[12px] font-bold ${t.rul_min < 30 ? 'bg-rose-500/25 text-rose-100' : 'bg-white/5 text-amber-200'}`}>
                  {t.kind === 'fouling' ? 'bottleneck in' : 'RUL'} {fmt(t.rul_min)} min</span>
              )}
              <span className="text-[11.5px] text-slate-400">{t.status === 'RESOLVED' ? `resolved at minute ${t.resolved_tick}` : t.window}</span>
              {(t.status === 'OPEN' || t.status === 'FAILED') && (
                <button onClick={() => dispatch(t.id)} className="ml-auto rounded-lg bg-sky-400 px-3 py-1 text-[12px] font-bold text-slate-950 hover:bg-sky-300">
                  {t.kind === 'fouling' ? 'Run CIP flush' : 'Dispatch technician'}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ Pillar 3 */
function ThreatPanel({ frame }) {
  const p3 = frame.engine.pillar3
  const a = p3.checks.pasteurizer_a
  const c = p3.checks.chiller
  const tl = p3.threat_level
  const tone = tl === 'CRITICAL' ? 'bg-rose-500/15 text-rose-200 ring-rose-500/50' : tl === 'ELEVATED' ? 'bg-amber-400/10 text-amber-200 ring-amber-400/40' : 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30'
  return (
    <Panel icon={ShieldHalf} title="Pillar 3 · Cyber OT Defense">
      <div className={`rounded-xl px-3 py-2.5 ring-1 ${tone}`}>
        <div className="text-[10.5px] uppercase tracking-[0.16em] opacity-70">Threat level</div>
        <div className="text-[22px] font-extrabold tracking-tight">{tl}</div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Row k="Auto-Isolate" v={p3.auto_isolate ? 'ON' : 'OFF'} tone={p3.auto_isolate ? 'text-emerald-300' : 'text-slate-400'} />
        <Row k="Frames this minute" v={p3.packets_per_tick} />
        <Row k="Dropped at firewall" v={p3.dropped_packets} />
        <Row k="Blocked hosts" v={p3.blocked_ips.join(', ') || 'none'} tone={p3.blocked_ips.length ? 'text-rose-300' : 'text-slate-100'} />
        <Row k="Isolated cells" v={p3.isolated_units.map((u) => LABEL[u]).join(', ') || 'none'} tone={p3.isolated_units.length ? 'text-fuchsia-300' : 'text-slate-100'} />
      </div>
      <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Physics cross-checks</div>
      <div className="mt-2 space-y-2">
        <div className={`rounded-xl p-2.5 ring-1 ${a.mismatch_pct > 12 ? 'bg-rose-500/10 ring-rose-500/40' : 'bg-white/[0.03] ring-white/5'}`}>
          <div className="text-[12px] text-slate-400">Pasteurizer A: PLC flow vs drive current</div>
          <div className="num text-[15px] font-semibold text-white">{fmt(a.reported_flow)} vs {fmt(a.implied_flow)} L/min
            <span className={`ml-2 text-[12px] ${a.mismatch_pct > 12 ? 'text-rose-300' : 'text-slate-500'}`}>Δ {fmt(a.mismatch_pct, 1)} %</span></div>
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${c.diff_c > 1.5 ? 'bg-rose-500/10 ring-rose-500/40' : 'bg-white/[0.03] ring-white/5'}`}>
          <div className="text-[12px] text-slate-400">Silo chiller PLC vs pasteurizer inlets</div>
          <div className="num text-[15px] font-semibold text-white">{fmt(c.reported_c, 1)} vs {fmt(c.inlet_c, 1)} °C
            <span className={`ml-2 text-[12px] ${c.diff_c > 1.5 ? 'text-rose-300' : 'text-slate-500'}`}>Δ {fmt(c.diff_c, 1)} °C</span></div>
        </div>
      </div>
    </Panel>
  )
}

function SocFeed({ frame }) {
  const alerts = frame.engine.pillar3.alerts
  return (
    <Panel icon={Siren} title="SOC alert feed" right={<span className="text-[12px] text-slate-500">{alerts.length} recent</span>}>
      <div className="scroll-thin max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {alerts.length === 0 && <div className="py-10 text-center text-[13px] text-slate-500">No OT security events. Network traffic matches the baseline.</div>}
        {alerts.map((a) => (
          <div key={a.id} className={`rounded-xl border p-3 ${SEVERITY[a.severity].cls}`}>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`font-bold ${SEVERITY[a.severity].text}`}>{a.severity}</span>
              <span className="num text-slate-500">{a.id} · min {a.tick}</span>
              <span className="ml-auto rounded-md bg-black/30 px-1.5 py-0.5 font-semibold text-slate-200">{a.type.replaceAll('_', ' ')}</span>
            </div>
            <div className="mt-1 text-[13px] text-slate-100">{a.msg}</div>
            {a.action && <div className="mt-1.5 rounded-lg bg-emerald-400/10 px-2 py-1 text-[12px] text-emerald-200">AUTO-RESPONSE · {a.action}</div>}
          </div>
        ))}
      </div>
    </Panel>
  )
}

const KNOWN = ['10.0.0.10', '10.0.0.11', '10.0.0.20']
function PacketMonitor({ packets }) {
  const [onlySus, setOnlySus] = useState(false)
  const rows = packets.filter((p) => !onlySus || !KNOWN.includes(p.src) || (p.op === 'WRITE' && p.src !== '10.0.0.10'))
  return (
    <Panel icon={Filter} title="OT packet monitor · Modbus/TCP & OPC-UA"
      right={<button onClick={() => setOnlySus(!onlySus)} className={`rounded-lg px-2.5 py-1 text-[11.5px] ring-1 ${onlySus ? 'bg-rose-500/15 text-rose-200 ring-rose-500/40' : 'text-slate-400 ring-white/10'}`}>
        {onlySus ? 'Suspicious only' : 'All traffic'}</button>}>
      <div className="scroll-thin max-h-[420px] overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-[#0d1527] text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr><th className="py-1.5 font-medium">min</th><th className="font-medium">source</th><th className="font-medium">target PLC</th><th className="font-medium">op</th><th className="font-medium">register</th></tr>
          </thead>
          <tbody className="num">
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center font-sans text-slate-500">Nothing suspicious.</td></tr>}
            {rows.map((p, i) => {
              const rogue = !KNOWN.includes(p.src)
              const badWrite = p.op === 'WRITE' && p.src !== '10.0.0.10'
              const cls = p.blocked ? 'text-slate-600 line-through' : rogue ? 'text-rose-300' : badWrite ? 'text-amber-300' : p.op === 'WRITE' ? 'text-sky-300' : 'text-slate-400'
              return (
                <tr key={`${p.tick}-${i}-${p.txn}`} className={`${cls} border-t border-white/[0.03] ${rogue && !p.blocked ? 'bg-rose-500/[0.06]' : ''}`}>
                  <td className="py-1">{p.tick}</td><td>{p.src}</td><td className="font-sans">{LABEL[p.unit] || p.unit}</td>
                  <td>{p.op}</td><td className="truncate">{p.register}{p.value !== null ? `=${p.value}` : ''}{p.blocked ? ' · DROPPED' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ log */
const SRC = { pillar1: 'text-sky-300', pillar2: 'text-violet-300', pillar3: 'text-rose-300', plant: 'text-slate-400' }
const LVL = { crit: 'text-rose-200', warn: 'text-amber-100', action: 'text-emerald-200', info: 'text-slate-300' }
function EventLog({ frame }) {
  return (
    <Panel icon={ScrollText} title="Engine action & event log">
      <div className="scroll-thin max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
        {frame.log.length === 0 && <div className="py-10 text-center text-[13px] text-slate-500">Waiting for events…</div>}
        {frame.log.map((e, i) => (
          <div key={`${e.tick}-${i}-${e.msg}`} className="flex gap-3 text-[13px] leading-snug">
            <span className="num w-12 shrink-0 text-slate-500">min {e.tick}</span>
            <span className={`w-14 shrink-0 text-[11px] font-bold uppercase ${SRC[e.source] || 'text-slate-400'}`}>{e.source === 'plant' ? 'plant' : `pillar ${e.source.slice(-1)}`}</span>
            <span className={LVL[e.level] || 'text-slate-300'}>{e.msg}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ tabs */
const TABS = [
  { key: 'sync', label: 'Production Sync', icon: Activity, pillar: 'Pillar 1' },
  { key: 'maint', label: 'Predictive Maintenance', icon: Wrench, pillar: 'Pillar 2' },
  { key: 'soc', label: 'Cyber SOC', icon: ShieldHalf, pillar: 'Pillar 3' },
  { key: 'log', label: 'Event Log', icon: ScrollText, pillar: 'All' },
]

export default function Insights({ frame, history, packets, notify }) {
  const [tab, setTab] = useState('sync')
  const scnKey = `${frame.scenario}-${frame.scenario_tick}`
  useEffect(() => {                                   // follow the demo: jump to the pillar the scenario is about
    const s = SCENARIOS.find((x) => x.key === frame.scenario)
    if (s) setTab(s.tab)
  }, [scnKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const openTickets = frame.engine.pillar2.tickets.filter((t) => ['OPEN', 'FAILED'].includes(t.status)).length
  const crit = frame.engine.pillar3.alerts.filter((a) => frame.tick - a.tick <= 15).length
  const badge = { maint: openTickets, soc: crit, sync: frame.engine.pillar1.drift_detected ? 1 : 0 }

  return (
    <section>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold ring-1 transition ${tab === t.key
              ? 'bg-white/[0.07] text-white ring-white/20' : 'text-slate-400 ring-transparent hover:bg-white/[0.03] hover:text-slate-200'}`}>
            <t.icon size={16} />
            <span className="text-[11px] font-medium text-slate-500">{t.pillar}</span>{t.label}
            {badge[t.key] > 0 && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] text-white">{badge[t.key]}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === 'sync' && (
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-4"><SyncPanel frame={frame} /></div>
            <div className="grid gap-3 md:grid-cols-2 xl:col-span-8">
              <ThroughputChart h={history} /><LevelsChart h={history} />
              <div className="md:col-span-2"><PressureChart h={history} /></div>
            </div>
          </div>
        )}
        {tab === 'maint' && (
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-5"><MaintPanel frame={frame} notify={notify} /></div>
            <div className="space-y-3 xl:col-span-7"><VibrationChart h={history} /><ThroughputChart h={history} /></div>
          </div>
        )}
        {tab === 'soc' && (
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-3"><ThreatPanel frame={frame} /></div>
            <div className="space-y-3 xl:col-span-4"><SpoofChart h={history} /><ChillerChart h={history} /></div>
            <div className="xl:col-span-5"><SocFeed frame={frame} /></div>
            <div className="xl:col-span-12"><PacketMonitor packets={packets} /></div>
          </div>
        )}
        {tab === 'log' && <EventLog frame={frame} />}
      </div>
    </section>
  )
}
