import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#475569', fontSize: 10, tickLine: false }
const grid = <CartesianGrid stroke="#1e293b" vertical={false} />
const tip = (
  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
    labelStyle={{ color: '#94a3b8' }} labelFormatter={(t) => `tick ${t}`} isAnimationActive={false} />
)

function Card({ title, sub, legend, children }) {
  return (
    <div className="panel flex flex-col px-3 pb-2 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold text-slate-200">{title}</div>
        <div className="flex gap-2 text-[9.5px] text-slate-400">
          {legend.map(([c, l, dash]) => (
            <span key={l} className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ background: dash ? 'none' : c, borderTop: dash ? `2px dashed ${c}` : 'none' }} />{l}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-slate-500">{sub}</div>
      <div className="mt-1 h-[132px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  )
}

export default function Charts({ history }) {
  const h = history
  const x = <XAxis dataKey="tick" {...axis} minTickGap={40} />
  const line = (key, color, extra = {}) => <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} {...extra} />
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      <Card title="Bottling throughput" sub="Aseptic filler output vs 800 L/min design" legend={[['#7dd3fc', 'L/min'], ['#64748b', 'nominal', true]]}>
        <AreaChart data={h} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
          {grid}{x}<YAxis {...axis} domain={[0, 1000]} />{tip}
          <ReferenceLine y={800} stroke="#64748b" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="throughput" stroke="#7dd3fc" fill="#7dd3fc" fillOpacity={0.15} strokeWidth={1.8} isAnimationActive={false} name="bottling L/min" />
        </AreaChart>
      </Card>
      <Card title="Buffer levels" sub="Raw silo & surge tank — Auto-Sync defends 50 %" legend={[['#c4b5fd', 'silo %'], ['#7dd3fc', 'surge %']]}>
        <LineChart data={h} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
          {grid}{x}<YAxis {...axis} domain={[0, 100]} />{tip}
          <ReferenceArea y1={35} y2={65} fill="#38bdf8" fillOpacity={0.05} />
          <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
          {line('silo', '#c4b5fd', { name: 'silo %' })}{line('surge', '#7dd3fc', { name: 'surge tank %' })}
        </LineChart>
      </Card>
      <Card title="Homogenizer pressure" sub="Silent drift stays inside the legacy 1800-2250 PSI band" legend={[['#fbbf24', 'PSI'], ['#10b981', 'legacy OK band']]}>
        <LineChart data={h} margin={{ top: 4, right: 6, left: -10, bottom: 0 }}>
          {grid}{x}<YAxis {...axis} domain={[1750, 2300]} allowDataOverflow />{tip}
          <ReferenceArea y1={1800} y2={2250} fill="#10b981" fillOpacity={0.07} />
          {line('pressure', '#fbbf24', { name: 'pressure PSI', strokeWidth: 1.4 })}
        </LineChart>
      </Card>
      <Card title="Pump vibration & anomaly score" sub="mm/s RMS · IsolationForest score (right axis)" legend={[['#f472b6', 'homog pump'], ['#a3e635', 'past. A pump'], ['#94a3b8', 'anomaly', true]]}>
        <ComposedChart data={h} margin={{ top: 4, right: -14, left: -18, bottom: 0 }}>
          {grid}{x}<YAxis yAxisId="v" {...axis} domain={[0, 8]} /><YAxis yAxisId="a" orientation="right" {...axis} domain={[0, 1]} />{tip}
          <ReferenceLine yAxisId="v" y={4.5} stroke="#f59e0b" strokeDasharray="3 3" />
          <ReferenceLine yAxisId="v" y={7.1} stroke="#ef4444" strokeDasharray="3 3" />
          <Area yAxisId="a" type="monotone" dataKey="anomaly" stroke="#94a3b8" strokeDasharray="3 3" fill="#94a3b8" fillOpacity={0.08} isAnimationActive={false} name="anomaly score" />
          {line('vib_h', '#f472b6', { yAxisId: 'v', name: 'homogenizer pump mm/s' })}
          {line('vib_a', '#a3e635', { yAxisId: 'v', name: 'pasteurizer A pump mm/s' })}
        </ComposedChart>
      </Card>
      <Card title="Pasteurizer_A spoof check" sub="PLC-reported flow vs drive-current physical flow" legend={[['#94a3b8', 'PLC reported', true], ['#f87171', 'physical'], ['#7dd3fc', 'Past. B']]}>
        <LineChart data={h} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
          {grid}{x}<YAxis {...axis} domain={[0, 900]} />{tip}
          {line('a_physical', '#f87171', { name: 'A physical L/min' })}
          {line('a_reported', '#94a3b8', { name: 'A PLC-reported L/min', strokeDasharray: '5 4' })}
          {line('b_flow', '#7dd3fc', { name: 'B L/min', strokeWidth: 1.3 })}
        </LineChart>
      </Card>
      <Card title="Chiller spoof check" sub="Silo sensor (PLC) vs independent pasteurizer inlet °C" legend={[['#94a3b8', 'silo reported', true], ['#fb923c', 'inlet actual']]}>
        <LineChart data={h} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
          {grid}{x}<YAxis {...axis} domain={[2, 11]} />{tip}
          <ReferenceLine y={7} stroke="#ef4444" strokeDasharray="3 3" />
          {line('inlet_temp', '#fb923c', { name: 'inlet °C' })}
          {line('silo_temp', '#94a3b8', { name: 'silo reported °C', strokeDasharray: '5 4' })}
        </LineChart>
      </Card>
    </div>
  )
}
