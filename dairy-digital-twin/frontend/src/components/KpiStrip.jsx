import { AlertOctagon, Droplets, Gauge, Hourglass } from 'lucide-react'
import { fmt, fmtInt } from '../lib/twin'

function Spark({ data, color, min = 0, max = 1000, baseline }) {
  if (data.length < 2) return <div className="h-9" />
  const w = 160
  const h = 36
  const x = (i) => (i / (data.length - 1)) * w
  const y = (v) => h - 2 - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (h - 4)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-9 w-full">
      {baseline !== undefined && <line x1="0" x2={w} y1={y(baseline)} y2={y(baseline)} stroke="#64748b" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ icon: Icon, label, value, unit, sub, tone, children }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"><Icon size={14} />{label}</div>
      <div>
        <div className={`num mt-2 text-[30px] font-bold leading-none ${tone}`}>{value}<span className="ml-1 text-[13px] font-medium text-slate-500">{unit}</span></div>
        <div className="mt-1.5 text-[12px] leading-snug text-slate-400">{sub}</div>
        {children}
      </div>
    </div>
  )
}

export default function KpiStrip({ frame, history }) {
  const k = frame.kpi
  const ret = k.retention_pct
  const tone = ret >= 95 ? 'text-emerald-300' : ret >= 80 ? 'text-amber-300' : 'text-rose-300'
  const sret = k.scenario_retention_pct
  const lost = k.wasted_l + k.unsafe_l + k.at_risk_l
  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <Tile icon={Gauge} label="Bottling now" value={fmt(k.throughput_lpm)} unit="L/min" tone={tone} sub={`${fmt(ret, 0)} % of the 800 L/min target`}>
        <Spark data={history.slice(-120).map((p) => p.throughput)} color={ret >= 95 ? '#34d399' : ret >= 80 ? '#fbbf24' : '#fb4469'} baseline={800} />
      </Tile>
      <Tile icon={Droplets} label="Output kept" value={sret === null ? '—' : fmt(sret, 1)} unit={sret === null ? '' : '%'}
        tone={sret === null ? 'text-slate-300' : sret >= 95 ? 'text-emerald-300' : sret >= 85 ? 'text-amber-300' : 'text-rose-300'}
        sub={sret === null ? 'starts counting when you run a scenario' : 'of normal output since the scenario began'}>
        <Spark data={history.slice(-120).map((p) => p.surge)} color="#7dd3fc" max={100} baseline={50} />
      </Tile>
      <Tile icon={AlertOctagon} label="Milk lost or unsafe" value={fmtInt(lost)} unit="L" tone={lost ? 'text-rose-300' : 'text-white'}
        sub={lost ? `${fmtInt(k.wasted_l)} spilled · ${fmtInt(k.unsafe_l)} under-heated · ${fmtInt(k.at_risk_l)} warm` : 'none so far'} />
      <Tile icon={Hourglass} label="Filler stopped" value={fmt(k.starved_min)} unit="min" tone={k.starved_min ? 'text-amber-300' : 'text-white'}
        sub={k.starved_min ? 'minutes the filler waited for milk' : 'the filler has never run dry'} />
    </div>
  )
}
