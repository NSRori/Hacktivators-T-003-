import { Activity, BrainCircuit, ShieldHalf } from 'lucide-react'
import { fmt } from '../lib/twin'

function Row({ k, v, tone = 'text-slate-200' }) {
  return (
    <div className="flex justify-between text-[11.5px]">
      <span className="text-slate-500">{k}</span><span className={`num ${tone}`}>{v}</span>
    </div>
  )
}

function ZBar({ label, z, thr = 4 }) {
  const w = Math.min(100, (Math.abs(z) / (thr * 2)) * 100)
  const hot = Math.abs(z) >= thr
  return (
    <div className="text-[11px]">
      <div className="flex justify-between"><span className="text-slate-500">{label}</span><span className={`num ${hot ? 'text-amber-300' : 'text-slate-300'}`}>z {fmt(z, 1)}</span></div>
      <div className="relative mt-0.5 h-1.5 rounded bg-slate-800">
        <div className={`h-full rounded ${hot ? 'bg-amber-400' : 'bg-sky-400/70'}`} style={{ width: `${w}%` }} />
        <div className="absolute top-[-2px] h-2.5 w-px bg-slate-400" style={{ left: '50%' }} />
      </div>
    </div>
  )
}

function Card({ icon: Icon, n, title, color, children }) {
  return (
    <div className="panel p-3">
      <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${color}`}><Icon size={14} />Pillar {n} · {title}</div>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  )
}

const mins = (v) => (v === null || v === undefined ? '—' : `${fmt(v)} min`)

export default function Pillars({ frame }) {
  const p1 = frame.engine.pillar1
  const p2 = frame.engine.pillar2
  const p3 = frame.engine.pillar3
  const sp = p1.setpoints
  const open = p2.tickets.filter((t) => ['OPEN', 'DISPATCHED', 'FAILED'].includes(t.status)).length
  const threatTone = p3.threat_level === 'CRITICAL' ? 'bg-red-500/20 text-red-300' : p3.threat_level === 'ELEVATED' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
  const a = p3.checks.pasteurizer_a
  const c = p3.checks.chiller
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card icon={Activity} n={1} title="Production Sync" color="text-sky-300">
        <div className={`rounded px-2 py-1 text-[11px] ${p1.drift_detected ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-800/60 text-slate-400'}`}>
          {p1.drift_detected ? `Silent drift: ${p1.root_cause} (~${fmt(p1.est_fouling_pct)} %)` : 'No silent drift detected'}
        </div>
        <ZBar label="Homogenizer pressure drift" z={p1.z.homog_pressure} />
        <ZBar label="Surge tank net flow" z={p1.z.surge_net_flow} />
        <Row k="Time to bottleneck" v={mins(p1.t_to_bottleneck_min)} tone={p1.t_to_bottleneck_min !== null ? 'text-amber-300' : 'text-slate-200'} />
        <Row k="T_starve (surge tank)" v={mins(p1.t_starve_min)} tone={p1.t_starve_min !== null ? 'text-red-300' : 'text-slate-200'} />
        <Row k="T_overflow (silo)" v={mins(p1.t_overflow_min)} tone={p1.t_overflow_min !== null ? 'text-red-300' : 'text-slate-200'} />
        <div className="border-t border-slate-800 pt-1.5" />
        <Row k="Intake pump" v={`${fmt(sp.intake_pct)} %`} />
        <Row k="Filler pace" v={`${fmt(sp.filler_pace_pct)} %`} />
        <Row k="Split A / B" v={`${fmt(sp.split_a_pct)} / ${fmt(100 - sp.split_a_pct)} %`} />
        <div className={`text-[10.5px] ${p1.auto_sync ? 'text-emerald-300' : 'text-slate-500'}`}>{p1.auto_sync ? 'Closed-loop control active' : 'Auto-Sync OFF: fixed legacy set-points'}</div>
      </Card>
      <Card icon={BrainCircuit} n={2} title="Predictive Maintenance" color="text-violet-300">
        <div className="text-[11px]">
          <div className="flex justify-between"><span className="text-slate-500">IsolationForest anomaly</span>
            <span className={`num ${p2.anomaly_flag ? 'text-red-300' : 'text-slate-300'}`}>{fmt(p2.anomaly_score, 2)}{p2.anomaly_flag ? ' ANOMALY' : ''}</span></div>
          <div className="relative mt-0.5 h-2 rounded bg-slate-800">
            <div className={`h-full rounded ${p2.anomaly_score >= 0.6 ? 'bg-red-400' : 'bg-violet-400/80'}`} style={{ width: `${p2.anomaly_score * 100}%`, transition: 'width .3s' }} />
            <div className="absolute top-[-2px] h-3 w-px bg-slate-300" style={{ left: '60%' }} />
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">top driver: {p2.top_feature || '—'}</div>
        </div>
        {[['homogenizer_pump_1', 'Homogenizer Pump #1'], ['pasteurizer_a_pump', 'Pasteurizer_A Feed Pump']].map(([pm, lab]) => {
          const r = p2.rul_min[pm]
          return (
            <div key={pm} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-2 py-1">
              <span className="text-[11px] text-slate-400">{lab}</span>
              <span className={`num text-[15px] font-semibold ${r === null ? 'text-emerald-300' : r < 30 ? 'text-red-300' : r < 90 ? 'text-amber-300' : 'text-sky-300'}`}>
                {r === null ? 'healthy' : `RUL ${fmt(r)} min`}</span>
            </div>
          )
        })}
        <Row k="Open maintenance tickets" v={open} tone={open ? 'text-amber-300' : 'text-slate-200'} />
        <div className="text-[10px] text-slate-500">RUL: (vib − base)^⅔ linear fit → 7.1 mm/s failure threshold</div>
      </Card>
      <Card icon={ShieldHalf} n={3} title="Cyber OT Defense" color="text-rose-300">
        <div className="flex items-center justify-between">
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${threatTone}`}>THREAT {p3.threat_level}</span>
          <span className={`text-[10.5px] ${p3.auto_isolate ? 'text-emerald-300' : 'text-slate-500'}`}>Auto-Isolate {p3.auto_isolate ? 'ON' : 'OFF'}</span>
        </div>
        <Row k="Frames this minute" v={p3.packets_per_tick} />
        <Row k="Dropped at firewall" v={p3.dropped_packets} />
        <Row k="Blocked hosts" v={p3.blocked_ips.length ? p3.blocked_ips.join(', ') : 'none'} tone={p3.blocked_ips.length ? 'text-rose-300' : 'text-slate-200'} />
        <Row k="Isolated cells" v={p3.isolated_units.length ? p3.isolated_units.join(', ') : 'none'} tone={p3.isolated_units.length ? 'text-fuchsia-300' : 'text-slate-200'} />
        <div className="border-t border-slate-800 pt-1.5" />
        <Row k="Past. A PLC vs physical" v={`${fmt(a.reported_flow)} vs ${fmt(a.implied_flow)} L/min`} tone={a.mismatch_pct > 12 ? 'text-red-300' : 'text-slate-200'} />
        <Row k="Mismatch" v={`${fmt(a.mismatch_pct, 1)} %`} tone={a.mismatch_pct > 12 ? 'text-red-300' : 'text-slate-200'} />
        <Row k="Chiller PLC vs inlet" v={`${fmt(c.reported_c, 1)} vs ${fmt(c.inlet_c, 1)} °C`} tone={c.diff_c > 1.5 ? 'text-red-300' : 'text-slate-200'} />
      </Card>
    </div>
  )
}
