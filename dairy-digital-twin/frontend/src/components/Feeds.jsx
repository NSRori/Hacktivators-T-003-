import { ClipboardList, Network, ScrollText, Siren } from 'lucide-react'
import { fmt, LABEL, post, SEVERITY_STYLE } from '../lib/twin'

function Panel({ icon: Icon, title, right, children }) {
  return (
    <div className="panel flex h-[330px] flex-col">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <div className="flex items-center gap-1.5 panel-title"><Icon size={13} />{title}</div>{right}
      </div>
      <div className="scroll-thin mt-2 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">{children}</div>
    </div>
  )
}
const Empty = ({ children }) => <div className="pt-8 text-center text-[11.5px] text-slate-500">{children}</div>

const PRIO = {
  CRITICAL: 'border-red-500/60 bg-red-500/10', HIGH: 'border-amber-500/60 bg-amber-500/10', MEDIUM: 'border-sky-600/50 bg-sky-500/5',
}
const STATUS = {
  OPEN: 'bg-amber-400 text-slate-950', DISPATCHED: 'bg-sky-400 text-slate-950', RESOLVED: 'bg-emerald-500 text-slate-950', FAILED: 'bg-red-600 text-white',
}

export function Tickets({ frame, notify }) {
  const tickets = frame.engine.pillar2.tickets
  const dispatch = async (id) => {
    const r = await post(`/maintenance/${id}/dispatch`)
    notify(r.message, r.ok)
  }
  return (
    <Panel icon={ClipboardList} title="Maintenance dispatch">
      {tickets.length === 0 ? <Empty>No maintenance tickets - all equipment healthy.</Empty> : tickets.map((t) => (
        <div key={t.id} className={`rounded-lg border p-2 ${t.status === 'RESOLVED' ? 'border-slate-800 bg-slate-900/40 opacity-70' : PRIO[t.priority]}`}>
          <div className="flex items-center gap-2">
            <span className="num text-[10px] text-slate-400">{t.id}</span>
            <span className="text-[12px] font-semibold text-slate-100">{t.label}</span>
            <span className={`ml-auto rounded px-1.5 py-px text-[9px] font-bold ${STATUS[t.status]}`}>{t.status}{t.auto ? ' · AUTO' : ''}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">{t.issue}</div>
          <div className="text-[10.5px] text-slate-400">{t.metric}</div>
          <div className="mt-1 flex items-center gap-2">
            {t.status !== 'RESOLVED' && t.rul_min !== null && (
              <span className={`num rounded px-1.5 text-[11px] font-bold ${t.rul_min < 30 ? 'bg-red-500/25 text-red-200' : 'bg-slate-800 text-amber-200'}`}>
                {t.kind === 'fouling' ? 'bottleneck in' : 'RUL'} {fmt(t.rul_min)} min</span>
            )}
            <span className="text-[10.5px] text-slate-400">{t.status === 'RESOLVED' ? `resolved at tick ${t.resolved_tick}` : t.window}</span>
            {(t.status === 'OPEN' || t.status === 'FAILED') && (
              <button onClick={() => dispatch(t.id)}
                className="ml-auto rounded bg-sky-500 px-2 py-0.5 text-[11px] font-semibold text-slate-950 hover:bg-sky-400">
                {t.kind === 'fouling' ? 'Run CIP flush' : 'Dispatch technician'}
              </button>
            )}
          </div>
        </div>
      ))}
    </Panel>
  )
}

export function SocFeed({ frame }) {
  const alerts = frame.engine.pillar3.alerts
  return (
    <Panel icon={Siren} title="SOC alert feed" right={<span className="text-[10px] text-slate-500">{alerts.length} recent</span>}>
      {alerts.length === 0 ? <Empty>No OT security events. Network baseline normal.</Empty> : alerts.map((a) => (
        <div key={a.id} className={`rounded-lg border p-2 ${SEVERITY_STYLE[a.severity]}`}>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-bold">{a.severity}</span><span className="num text-slate-400">{a.id} · tick {a.tick}</span>
            <span className="ml-auto rounded bg-slate-950/60 px-1.5 font-semibold text-slate-200">{a.type}</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-200">{a.msg}</div>
          {a.action && <div className="mt-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-300">AUTO-RESPONSE: {a.action}</div>}
        </div>
      ))}
    </Panel>
  )
}

export function PacketMonitor({ packets }) {
  return (
    <Panel icon={Network} title="OT packet monitor · Modbus/TCP & OPC-UA" right={<span className="text-[10px] text-slate-500">latest {packets.length}</span>}>
      <table className="w-full text-[10.5px]">
        <thead className="sticky top-0 bg-slate-900 text-slate-500">
          <tr><th className="py-0.5 text-left font-medium">tick</th><th className="text-left font-medium">src</th><th className="text-left font-medium">target</th>
            <th className="text-left font-medium">function</th><th className="text-left font-medium">register=value</th></tr>
        </thead>
        <tbody className="num">
          {packets.map((p, i) => {
            const rogue = !['10.0.0.10', '10.0.0.11', '10.0.0.20'].includes(p.src)
            const badWrite = p.op === 'WRITE' && p.src !== '10.0.0.10'
            const cls = p.blocked ? 'text-slate-600 line-through' : rogue ? 'text-red-300' : badWrite ? 'text-amber-300' : p.op === 'WRITE' ? 'text-sky-300' : 'text-slate-400'
            return (
              <tr key={`${p.tick}-${i}-${p.txn}`} className={`${cls} ${rogue && !p.blocked ? 'bg-red-500/5' : ''}`}>
                <td className="py-px">{p.tick}</td><td>{p.src}</td><td>{LABEL[p.unit] || p.unit}</td>
                <td>{p.func} {p.op}</td><td className="truncate">{p.register}{p.value !== null ? `=${p.value}` : ''}{p.blocked ? ' DROPPED' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}

const SRC = { pillar1: 'text-sky-300', pillar2: 'text-violet-300', pillar3: 'text-rose-300', plant: 'text-slate-400' }
const LVL = { crit: 'text-red-300', warn: 'text-amber-200', action: 'text-emerald-300', info: 'text-slate-300' }

export function EventLog({ frame }) {
  return (
    <Panel icon={ScrollText} title="Engine action & event log">
      {frame.log.length === 0 ? <Empty>Waiting for events…</Empty> : frame.log.map((e, i) => (
        <div key={`${e.tick}-${i}-${e.msg}`} className="flex gap-2 text-[11px] leading-snug">
          <span className="num w-9 shrink-0 text-slate-500">{e.tick}</span>
          <span className={`w-12 shrink-0 text-[10px] font-semibold uppercase ${SRC[e.source] || 'text-slate-400'}`}>{e.source === 'plant' ? 'plant' : `P${e.source.slice(-1)}`}</span>
          <span className={LVL[e.level] || 'text-slate-300'}>{e.msg}</span>
        </div>
      ))}
    </Panel>
  )
}
