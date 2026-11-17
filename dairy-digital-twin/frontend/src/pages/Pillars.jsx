import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fmt, LABEL } from '../lib/twin'
import { eventMarks } from '../lib/actions'
import { AnomalyChart, ChillerChart, LevelsChart, PressureChart, SpoofChart, ThroughputChart, VibrationChart } from '../components/Charts'
import { IncidentStory, KnockOn } from '../components/Verdict'
import { Button, PageHeader, Panel, ScrollArea, StatusBadge } from '../components/ui'

/* Layout helpers: rows reflow when a widget is minimized, so the rest close the gap. */
const AUTO = (min) => ({ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` })

const mins = (v) => (v === null || v === undefined ? '—' : `${fmt(v)} min`)
const Row = ({ k, v, tone = 'text-ink' }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 text-[14.5px]">
    <span className="text-ink-2">{k}</span><span className={`num font-medium ${tone}`}>{v}</span>
  </div>
)

function ZBar({ label, z, thr = 4 }) {
  const hot = Math.abs(z) >= thr
  const w = Math.min(50, (Math.abs(z) / (thr * 2)) * 50)
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-[14px]"><span className="text-ink-2">{label}</span>
        <span className={`num font-medium ${hot ? 'text-warn-ink' : 'text-ink'}`}>z = {fmt(z, 1)}{hot ? ' (drift)' : ''}</span></div>
      <div className="relative mt-1.5 h-2 rounded-sm bg-line-2">
        <div className={`absolute h-full rounded-sm ${hot ? 'bg-warn' : 'bg-accent-3'}`} style={{ left: z >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, transition: 'all .4s' }} />
        {[25, 50, 75].map((p) => <div key={p} className={`absolute -top-1 h-4 w-px ${p === 50 ? 'bg-ink-2' : 'bg-warn'}`} style={{ left: `${p}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-3"><span>−8σ</span><span>−4σ</span><span>0</span><span>+4σ</span><span>+8σ</span></div>
    </div>
  )
}

/* ================================================================ Pillar 1 */
export function SyncPage({ frame, history }) {
  const p1 = frame.engine.pillar1
  const sp = p1.setpoints
  const marks = eventMarks(frame)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Pillar 1" title="Production sync"
        lede="Finds slowdowns that hide inside normal limits, predicts when buffers will run out, and, with Auto-Sync on, rebalances the line by itself."
        right={<StatusBadge size="lg" status={p1.drift_detected ? 'WARN' : 'OK'} label={p1.drift_detected ? 'Silent drift found' : 'No hidden drift'} />} />
      <div className="flex flex-wrap gap-4">
        <Panel wid="sees" title="What the engine sees" sub="Rolling Z-scores against a healthy baseline, and forecasts from the live trend." className="flex-[1_1_420px]">
          <div className={`rounded-md border-l-4 px-3 py-2.5 text-[15px] ${p1.drift_detected ? 'border-warn bg-warn-2 text-ink' : 'border-ok bg-ok-2 text-ink'}`}>
            {p1.drift_detected ? <><b>{p1.root_cause}</b>, about <b className="num">{fmt(p1.est_fouling_pct)} %</b>. Legacy pressure limits still read OK.</>
              : 'Every reading matches the healthy baseline.'}
          </div>
          <div className="mt-3">
            <ZBar label="Homogenizer pressure" z={p1.z.homog_pressure} />
            <ZBar label="Surge tank net flow" z={p1.z.surge_net_flow} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line-2 pt-3">
            {[['Bottleneck in', p1.t_to_bottleneck_min, 'text-warn-ink'], ['Surge tank empty in', p1.t_starve_min, 'text-crit'], ['Silo overflows in', p1.t_overflow_min, 'text-crit']].map(([k, v, c]) => (
              <div key={k}>
                <div className="text-[13px] text-ink-2">{k}</div>
                <div className={`num mt-0.5 text-[22px] font-semibold ${v === null ? 'text-ink-3' : c}`}>{mins(v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line-2 pt-2">
            <Row k="Raw-milk intake pump" v={`${fmt(sp.intake_pct)} %`} />
            <Row k="Aseptic filler pace" v={`${fmt(sp.filler_pace_pct)} %`} />
            <Row k="Pasteurizer split A / B" v={`${fmt(sp.split_a_pct)} / ${fmt(100 - sp.split_a_pct)} %`} />
            <Row k="Auto-Sync" v={p1.auto_sync ? 'on: closed-loop control' : 'off: fixed set-points'} tone={p1.auto_sync ? 'text-ok' : 'text-ink-2'} />
          </div>
        </Panel>
        <div className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-4 empty:hidden">
          <ThroughputChart h={history} marks={marks} />
          <PressureChart h={history} marks={marks} />
        </div>
      </div>
      <div className="grid gap-4" style={AUTO(480)}>
        <LevelsChart h={history} marks={marks} />
        <KnockOn frame={frame} />
      </div>
    </div>
  )
}

/* ================================================================ Pillar 2 */
const TICKET = { OPEN: 'WARN', DISPATCHED: 'MAINT', RESOLVED: 'OK', FAILED: 'CRITICAL' }
const TICKET_WORD = { OPEN: 'Open', DISPATCHED: 'Technician dispatched', RESOLVED: 'Resolved', FAILED: 'Failed' }

function RulCard({ wid, label, rul, vib }) {
  const status = rul === null ? 'OK' : rul < 30 ? 'CRITICAL' : 'WARN'
  const pct = rul === null ? 100 : Math.max(2, Math.min(100, (rul / 160) * 100))
  return (
    <Panel wid={wid} title={label} right={<StatusBadge status={status} label={rul === null ? 'Healthy' : rul < 30 ? 'Replace now' : 'Wearing'} />}>
      <div className={`num text-[40px] font-semibold leading-none ${rul === null ? 'text-ok' : rul < 30 ? 'text-crit' : 'text-warn-ink'}`}>
        {rul === null ? 'No trend' : `${fmt(rul)} min`}</div>
      <div className="mt-1 text-[14px] text-ink-2">{rul === null ? 'vibration matches a healthy pump' : 'remaining useful life (predicted)'} · {fmt(vib, 2)} mm/s now</div>
      <div className="mt-3 h-2 rounded-sm bg-line-2">
        <div className={`h-full rounded-sm ${rul === null ? 'bg-ok' : rul < 30 ? 'bg-crit' : 'bg-warn'}`} style={{ width: `${pct}%`, transition: 'width .5s' }} />
      </div>
    </Panel>
  )
}

export function MaintPage({ frame, history, call }) {
  const p2 = frame.engine.pillar2
  const marks = eventMarks(frame)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Pillar 2" title="Predictive maintenance"
        lede="Learns what healthy pumps look like, notices wear long before a fixed vibration alarm, and tells a technician which pump to fix and by when."
        right={<StatusBadge size="lg" status={p2.anomaly_flag ? 'WARN' : 'OK'} label={p2.anomaly_flag ? 'Anomaly detected' : 'Equipment healthy'} />} />
      <div className="grid gap-4" style={AUTO(340)}>
        <RulCard wid="rul-homog" label="Homogenizer Pump #1" rul={p2.rul_min.homogenizer_pump_1} vib={frame.pumps.homogenizer_pump_1.vibration_mms} />
        <RulCard wid="rul-past-a" label="Pasteurizer A feed pump" rul={p2.rul_min.pasteurizer_a_pump} vib={frame.pumps.pasteurizer_a_pump.vibration_mms} />
        <Panel wid="anomaly-now" title="ML anomaly score" right={<StatusBadge status={p2.anomaly_flag ? 'WARN' : 'OK'} label={p2.anomaly_flag ? 'Anomaly' : 'Normal'} />}>
          <div className={`num text-[40px] font-semibold leading-none ${p2.anomaly_flag ? 'text-crit' : 'text-ink'}`}>{fmt(p2.anomaly_score, 2)}</div>
          <div className="mt-1 text-[14px] text-ink-2">0 = like the healthy baseline · alarm at 0.60</div>
          <div className="relative mt-3 h-2 rounded-sm bg-line-2">
            <div className={`h-full rounded-sm ${p2.anomaly_score >= 0.6 ? 'bg-crit' : 'bg-accent'}`} style={{ width: `${p2.anomaly_score * 100}%`, transition: 'width .3s' }} />
            <div className="absolute -top-1 h-4 w-px bg-ink" style={{ left: '60%' }} />
          </div>
          <div className="mt-2 text-[13.5px] text-ink-2">Biggest contributor: <b className="text-ink">{(p2.top_feature || '—').replaceAll('_', ' ')}</b></div>
        </Panel>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-4 empty:hidden">
          <VibrationChart h={history} marks={marks} height={260} />
          <AnomalyChart h={history} marks={marks} />
        </div>
        <Panel wid="tickets" title="Dispatch tickets" zoom="fill" className="flex-[1_1_380px]"
          sub="Raised automatically when the model sees wear. Auto-Sync dispatches by itself once a ticket turns critical.">
          {p2.tickets.length === 0 && <p className="py-6 text-center text-[14.5px] text-ink-2">No tickets. All equipment is healthy.</p>}
          <ul className="space-y-3">
            {p2.tickets.map((t) => (
              <li key={t.id} className={`rounded-md border border-line p-3.5 ${t.status === 'RESOLVED' ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="mono text-[12.5px] text-ink-2">{t.id}</span>
                  <span className="text-[15px] font-semibold text-ink">{t.label}</span>
                  <span className="ml-auto"><StatusBadge status={TICKET[t.status]} label={TICKET_WORD[t.status] + (t.auto ? ' (auto)' : '')} /></span>
                </div>
                <p className="mt-1.5 text-[14px] text-ink">{t.issue}</p>
                <p className="text-[13.5px] text-ink-2">{t.metric}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  {t.status !== 'RESOLVED' && t.rul_min !== null && (
                    <span className={`num text-[15px] font-semibold ${t.rul_min < 30 ? 'text-crit' : 'text-warn-ink'}`}>{t.kind === 'fouling' ? 'Bottleneck in' : 'Fails in'} {fmt(t.rul_min)} min</span>
                  )}
                  <span className="text-[13.5px] text-ink-2">{t.status === 'RESOLVED' ? `Resolved at minute ${t.resolved_tick}` : t.window}</span>
                  {(t.status === 'OPEN' || t.status === 'FAILED') && (
                    <Button kind="primary" className="ml-auto" onClick={() => call(`/maintenance/${t.id}/dispatch`)}>{t.kind === 'fouling' ? 'Run cleaning flush' : 'Dispatch technician'}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/* ================================================================ Pillar 3 */
const THREAT = {
  NORMAL: ['OK', 'Normal', 'Network traffic and controller readings match the baseline.'],
  ELEVATED: ['WARN', 'Elevated', 'Suspicious traffic seen. Watching closely.'],
  CRITICAL: ['CRITICAL', 'Under attack', 'An attack is affecting the plant right now.'],
  CONTAINED: ['QUARANTINED', 'Contained', 'The attack is being held off by an active response: a blocked host, an isolated unit or the backup chiller.'],
}
const SEV = { CRITICAL: 'border-crit', HIGH: 'border-warn', MEDIUM: 'border-accent' }

function SocList({ alerts }) {
  const [open, setOpen] = useState(null)
  const groups = []
  for (const a of alerts) {                            // de-duplicate repeated messages (spec §5.7)
    const g = groups.find((x) => x.type === a.type && x.unit === a.unit && x.src === a.src)
    if (g) g.count += 1
    else groups.push({ ...a, count: 1 })
  }
  if (!groups.length) return <p className="py-6 text-center text-[14.5px] text-ink-2">No security events. Traffic matches the baseline.</p>
  return (
    <ul className="divide-y divide-line-2">
      {groups.map((a) => (
        <li key={a.id} className={`border-l-4 ${SEV[a.severity]} pl-3`}>
          <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
            <span className="num w-16 shrink-0 text-[13.5px] text-ink-2">min {a.tick}</span>
            <span className="text-[14.5px] font-medium text-ink">{a.type.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
            <span className="truncate text-[14px] text-ink-2">{LABEL[a.unit] || a.unit}{a.count > 1 ? ` · ×${a.count}` : ''}</span>
            {a.action && <span className="ml-auto shrink-0"><StatusBadge status="QUARANTINED" label="Responded" /></span>}
            <ChevronDown size={16} className={`shrink-0 text-ink-3 transition ${a.action ? '' : 'ml-auto'} ${open === a.id ? 'rotate-180' : ''}`} />
          </button>
          {open === a.id && (
            <div className="pb-3 text-[14px] leading-relaxed text-ink">
              {a.msg}
              {a.action && <div className="mt-1.5 text-ink-2"><b className="text-iso">Automatic response:</b> {a.action}</div>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

const KNOWN = ['10.0.0.10', '10.0.0.11', '10.0.0.20']
function PacketTable({ packets, className = '' }) {
  const [onlySus, setOnlySus] = useState(false)
  const rows = packets.filter((p) => !onlySus || !KNOWN.includes(p.src) || (p.op === 'WRITE' && p.src !== '10.0.0.10'))
  return (
    <Panel wid="packets" title="OT packet monitor" sub="Modbus/TCP and OPC-UA frames on the plant network, newest first." zoom="fill" className={className}
      right={<Button kind={onlySus ? 'primary' : 'secondary'} onClick={() => setOnlySus(!onlySus)}>{onlySus ? 'Showing suspicious only' : 'Show suspicious only'}</Button>}
      bodyClass="!p-0 flex flex-col">
      <ScrollArea limit="max-h-[420px]">
        <table className="w-full table-fixed text-[13.5px]">
          <thead className="sticky top-0 bg-surface-2 text-left text-[13px] text-ink-2">
            <tr className="h-9">
              <th className="w-[70px] pl-5 font-medium">Minute</th><th className="w-[130px] font-medium">Source</th><th className="w-[170px] font-medium">Target</th>
              <th className="w-[80px] font-medium">Operation</th><th className="font-medium">Register</th><th className="w-[150px] pr-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-ink-2">Nothing suspicious.</td></tr>}
            {rows.map((p, i) => {
              const rogue = !KNOWN.includes(p.src)
              const badWrite = p.op === 'WRITE' && p.src !== '10.0.0.10'
              const status = p.blocked ? ['QUARANTINED', 'Dropped'] : rogue ? ['CRITICAL', 'Unknown host'] : badWrite ? ['WARN', 'Unauthorized'] : ['OK', 'Allowed']
              return (
                <tr key={`${p.tick}-${i}-${p.txn}`} className={`h-[34px] border-t border-line-2 ${p.blocked ? 'text-ink-3' : 'text-ink'}`}>
                  <td className="num pl-5">{p.tick}</td>
                  <td className="mono truncate">{p.src}</td>
                  <td className="truncate">{LABEL[p.unit] || p.unit}</td>
                  <td>{p.op === 'WRITE' ? 'write' : 'read'}</td>
                  <td className="mono truncate pr-3" title={`${p.register}${p.value !== null ? `=${p.value}` : ''}`}>{p.register}{p.value !== null ? `=${p.value}` : ''}</td>
                  <td className="pr-5"><StatusBadge status={status[0]} label={status[1]} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollArea>
    </Panel>
  )
}

export function CyberPage({ frame, history, packets }) {
  const p3 = frame.engine.pillar3
  const [st, word, desc] = THREAT[p3.threat_level] || THREAT.NORMAL
  const a = p3.checks.pasteurizer_a
  const c = p3.checks.chiller
  const marks = eventMarks(frame)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Pillar 3" title="Cyber defense"
        lede="Checks what the controllers claim against physics, flags rogue network commands, and isolates only the compromised unit, so the plant never has to shut down."
        right={<StatusBadge size="lg" status={st} label={`Threat: ${word}`} />} />
      <div className="grid gap-4" style={AUTO(360)}>
        <Panel wid="threat" title="Threat status">
          <div className={`rounded-md border-l-4 px-3 py-2.5 ${st === 'OK' ? 'border-ok bg-ok-2' : st === 'WARN' ? 'border-warn bg-warn-2' : st === 'CRITICAL' ? 'border-crit bg-crit-2' : 'border-iso bg-iso-2'}`}>
            <div className="text-[20px] font-semibold text-ink">{word}</div>
            <p className="text-[14px] leading-snug text-ink-2">{desc}</p>
          </div>
          <div className="mt-3">
            <Row k="Auto-Isolate" v={p3.auto_isolate ? 'on' : 'off'} tone={p3.auto_isolate ? 'text-ok' : 'text-ink-2'} />
            <Row k="Blocked hosts" v={p3.blocked_ips.join(', ') || 'none'} tone={p3.blocked_ips.length ? 'text-crit mono' : 'text-ink'} />
            <Row k="Isolated units" v={p3.isolated_units.map((u) => LABEL[u]).join(', ') || 'none'} tone={p3.isolated_units.length ? 'text-iso' : 'text-ink'} />
            <Row k="Frames dropped at firewall" v={p3.dropped_packets} />
            <Row k="Frames this minute" v={p3.packets_per_tick} />
          </div>
        </Panel>
        <Panel wid="check-past-a" title="Pasteurizer A: does the PLC tell the truth?" sub="Reported flow against flow implied by the motor drive current.">
          <div className="flex items-end gap-6">
            <div><div className="text-[13px] text-ink-2">PLC says</div><div className="num text-[30px] font-semibold text-ink">{fmt(a.reported_flow)}<span className="text-[14px] font-normal text-ink-2"> L/min</span></div></div>
            <div><div className="text-[13px] text-ink-2">Physics says</div><div className={`num text-[30px] font-semibold ${a.mismatch_pct > 12 ? 'text-crit' : 'text-ink'}`}>{fmt(a.implied_flow)}<span className="text-[14px] font-normal text-ink-2"> L/min</span></div></div>
          </div>
          <div className="mt-3">
            {frame.stages.pasteurizer_a.quarantined ? <StatusBadge status="QUARANTINED" label="Isolated: no flow to check" />
              : <StatusBadge status={a.mismatch_pct > 12 ? 'CRITICAL' : 'OK'} label={a.mismatch_pct > 12 ? `Mismatch ${fmt(a.mismatch_pct, 1)} %: spoofed` : `Mismatch ${fmt(a.mismatch_pct, 1)} %: consistent`} />}
          </div>
        </Panel>
        <Panel wid="check-chiller" title="Silo chiller: is the thermometer honest?" sub="PLC reading against independent sensors at the pasteurizer inlets.">
          <div className="flex items-end gap-6">
            <div><div className="text-[13px] text-ink-2">PLC says</div><div className="num text-[30px] font-semibold text-ink">{fmt(c.reported_c, 1)}<span className="text-[14px] font-normal text-ink-2"> °C</span></div></div>
            <div><div className="text-[13px] text-ink-2">Inlet sensors</div><div className={`num text-[30px] font-semibold ${c.diff_c > 1.5 ? 'text-crit' : 'text-ink'}`}>{fmt(c.inlet_c, 1)}<span className="text-[14px] font-normal text-ink-2"> °C</span></div></div>
          </div>
          <div className="mt-3"><StatusBadge status={c.diff_c > 1.5 ? 'CRITICAL' : 'OK'} label={c.diff_c > 1.5 ? `Off by ${fmt(c.diff_c, 1)} °C: spoofed` : 'Readings agree'} /></div>
        </Panel>
      </div>
      <div className="grid gap-4" style={AUTO(480)}>
        <SpoofChart h={history} marks={marks} />
        <ChillerChart h={history} marks={marks} />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <Panel wid="alerts" title="Security alerts" sub="Grouped by type. Click one for details and the automatic response." zoom="fill" className="flex-[1_1_400px]">
          <SocList alerts={p3.alerts} />
        </Panel>
        <PacketTable packets={packets} className="flex-[1.4_1_560px]" />
      </div>
    </div>
  )
}

/* ================================================================ Log */
const FILTERS = [['all', 'Everything'], ['pillar1', 'Production sync'], ['pillar2', 'Maintenance'], ['pillar3', 'Cyber'], ['plant', 'Plant events']]
const SRC_NAME = { pillar1: 'Sync', pillar2: 'Maintenance', pillar3: 'Cyber', plant: 'Plant' }
const LVL = { crit: 'CRITICAL', warn: 'WARN', action: 'MAINT', info: 'OK' }

export function LogPage({ frame }) {
  const [f, setF] = useState('all')
  const rows = frame.log.filter((e) => f === 'all' || e.source === f)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Everything, in order" title="Event log" lede="Every finding and action from the three pillars, plus physical events in the plant. Newest first." />
      <div className="flex flex-wrap items-start gap-4">
        <Panel wid="log" title="Log" zoom="fill" className="flex-[1.5_1_560px]" right={(
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => setF(k)} className={`rounded-md px-2.5 py-1 text-[13.5px] ${f === k ? 'bg-brand-deep text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{l}</button>
            ))}
          </div>
        )} bodyClass="!p-0 flex flex-col">
          <ScrollArea limit="max-h-[640px]">
            <ul className="divide-y divide-line-2">
              {rows.length === 0 && <li className="px-5 py-8 text-center text-[14.5px] text-ink-2">Nothing logged yet.</li>}
              {rows.map((e, i) => (
                <li key={`${e.tick}-${i}-${e.msg}`} className="grid grid-cols-[80px_110px_1fr] items-start gap-3 px-5 py-2.5 text-[14.5px]">
                  <span className="num text-ink-2">min {e.tick}</span>
                  <span><StatusBadge status={LVL[e.level] || 'OK'} label={SRC_NAME[e.source] || e.source} /></span>
                  <span className="text-ink">{e.msg}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </Panel>
        <IncidentStory frame={frame} max={20} className="h-[600px] flex-[1_1_380px]" />
      </div>
    </div>
  )
}
