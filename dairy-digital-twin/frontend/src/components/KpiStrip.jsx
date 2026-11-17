import { AlertOctagon, Droplets, Gauge, Hourglass, Trash2 } from 'lucide-react'
import { fmt, fmtInt } from '../lib/twin'

function Spark({ data, color, min = 0, max = 1000, baseline: refLine }) {
  if (data.length < 2) return <div className="h-10" />
  const w = 160
  const h = 40
  const x = (i) => (i / (data.length - 1)) * w
  const y = (v) => h - 2 - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (h - 4)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
      {refLine !== undefined && <line x1="0" x2={w} y1={y(refLine)} y2={y(refLine)} stroke="#64748b" strokeDasharray="3 3" strokeWidth="1" />}
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ icon: Icon, label, value, unit, sub, tone, children }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"><Icon size={14} />{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className={`num text-[30px] font-bold leading-none ${tone}`}>{value}<span className="ml-1 text-[13px] font-medium text-slate-500">{unit}</span></div>
          <div className="mt-1.5 text-[11.5px] text-slate-400">{sub}</div>
        </div>
        {children && <div className="w-[45%]">{children}</div>}
      </div>
    </div>
  )
}

export default function KpiStrip({ frame, history }) {
  const k = frame.kpi
  const ret = k.retention_pct
  const tone = ret >= 95 ? 'text-emerald-300' : ret >= 80 ? 'text-amber-300' : 'text-rose-300'
  const sret = k.scenario_retention_pct
  const thr = history.slice(-120).map((p) => p.throughput)
  const surge = history.slice(-120).map((p) => p.surge)
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Tile icon={Gauge} label="Bottling rate" value={fmt(k.throughput_lpm)} unit="L/min" tone={tone} sub={`${fmt(ret, 1)} % of 800 L/min design (30-min avg)`}>
        <Spark data={thr} color={ret >= 95 ? '#34d399' : ret >= 80 ? '#fbbf24' : '#fb4469'} baseline={800} />
      </Tile>
      <Tile icon={Droplets} label="Throughput retained" value={sret === null ? '—' : fmt(sret, 1)} unit={sret === null ? '' : '%'}
        tone={sret === null ? 'text-slate-300' : sret >= 95 ? 'text-emerald-300' : sret >= 85 ? 'text-amber-300' : 'text-rose-300'}
        sub={sret === null ? 'since scenario start - trigger one' : 'of design output since the scenario started'}>
        <Spark data={surge} color="#7dd3fc" max={100} baseline={50} />
      </Tile>
      <Tile icon={Trash2} label="Milk wasted" value={fmtInt(k.wasted_l)} unit="L" tone={k.wasted_l ? 'text-rose-300' : 'text-white'} sub="raw silo overflow to drain" />
      <Tile icon={AlertOctagon} label="Unsafe / at-risk milk" value={fmtInt(k.unsafe_l + k.at_risk_l)} unit="L"
        tone={k.unsafe_l + k.at_risk_l ? 'text-rose-300' : 'text-white'} sub={`${fmtInt(k.unsafe_l)} under-pasteurized · ${fmtInt(k.at_risk_l)} warm`} />
      <Tile icon={Hourglass} label="Filler starved" value={fmt(k.starved_min)} unit="min" tone={k.starved_min ? 'text-amber-300' : 'text-white'} sub="aseptic filler waiting on empty surge tank" />
    </div>
  )
}
