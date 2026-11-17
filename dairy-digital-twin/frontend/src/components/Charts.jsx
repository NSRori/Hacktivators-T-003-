import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#46546b', fontSize: 11, tickLine: false, axisLine: false }
const grid = <CartesianGrid stroke="#162033" vertical={false} />
const tip = (
  <Tooltip contentStyle={{ background: '#0b1322', border: '1px solid #26344b', borderRadius: 10, fontSize: 12 }}
    labelStyle={{ color: '#94a3b8' }} labelFormatter={(t) => `minute ${t}`} isAnimationActive={false} />
)
const margin = { top: 6, right: 8, left: -14, bottom: 0 }
const line = (key, color, extra = {}) => <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} {...extra} />

export function ChartCard({ title, sub, legend = [], height = 200, children }) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-white">{title}</div>
          <div className="text-[11.5px] text-slate-500">{sub}</div>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
          {legend.map(([c, l, dash]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block w-4" style={{ borderTop: `2.5px ${dash ? 'dashed' : 'solid'} ${c}` }} />{l}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3" style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  )
}

const X = <XAxis dataKey="tick" {...axis} minTickGap={50} />

export const ThroughputChart = ({ h }) => (
  <ChartCard title="Bottling throughput" sub="Aseptic filler output vs the 800 L/min design rate" legend={[['#7dd3fc', 'L/min'], ['#64748b', 'design', true]]}>
    <AreaChart data={h} margin={margin}>
      <defs><linearGradient id="thr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7dd3fc" stopOpacity={0.35} /><stop offset="1" stopColor="#7dd3fc" stopOpacity={0} /></linearGradient></defs>
      {grid}{X}<YAxis {...axis} domain={[0, 1000]} />{tip}
      <ReferenceLine y={800} stroke="#64748b" strokeDasharray="5 5" />
      <Area type="monotone" dataKey="throughput" stroke="#7dd3fc" strokeWidth={2} fill="url(#thr)" isAnimationActive={false} name="bottling L/min" />
    </AreaChart>
  </ChartCard>
)

export const LevelsChart = ({ h }) => (
  <ChartCard title="Buffer levels" sub="Auto-Sync defends the 35-65 % band around 50 %" legend={[['#c4b5fd', 'raw silo'], ['#7dd3fc', 'surge tank']]}>
    <LineChart data={h} margin={margin}>
      {grid}{X}<YAxis {...axis} domain={[0, 100]} unit="%" />{tip}
      <ReferenceArea y1={35} y2={65} fill="#38bdf8" fillOpacity={0.06} />
      <ReferenceLine y={50} stroke="#334155" strokeDasharray="5 5" />
      {line('silo', '#c4b5fd', { name: 'silo %' })}{line('surge', '#7dd3fc', { name: 'surge tank %' })}
    </LineChart>
  </ChartCard>
)

export const PressureChart = ({ h }) => (
  <ChartCard title="Homogenizer pressure" sub="The silent drift never leaves the legacy 'OK' band" legend={[['#fbbf24', 'PSI'], ['#34d399', 'legacy OK band']]}>
    <LineChart data={h} margin={{ ...margin, left: -4 }}>
      {grid}{X}<YAxis {...axis} domain={[1750, 2300]} allowDataOverflow />{tip}
      <ReferenceArea y1={1800} y2={2250} fill="#34d399" fillOpacity={0.07} />
      {line('pressure', '#fbbf24', { name: 'pressure PSI', strokeWidth: 1.6 })}
    </LineChart>
  </ChartCard>
)

export const VibrationChart = ({ h }) => (
  <ChartCard title="Pump vibration & ML anomaly score" sub="mm/s RMS (left) · IsolationForest score 0-1 (right) · amber = legacy alarm, red = failure"
    legend={[['#f472b6', 'homog. pump'], ['#a3e635', 'past. A pump'], ['#a78bfa', 'anomaly', true]]} height={240}>
    <ComposedChart data={h} margin={{ ...margin, right: -6 }}>
      {grid}{X}<YAxis yAxisId="v" {...axis} domain={[0, 8]} /><YAxis yAxisId="a" orientation="right" {...axis} domain={[0, 1]} />{tip}
      <ReferenceLine yAxisId="v" y={4.5} stroke="#f59e0b" strokeDasharray="4 4" />
      <ReferenceLine yAxisId="v" y={7.1} stroke="#fb4469" strokeDasharray="4 4" />
      <Area yAxisId="a" type="monotone" dataKey="anomaly" stroke="#a78bfa" strokeDasharray="4 3" fill="#a78bfa" fillOpacity={0.1} isAnimationActive={false} name="anomaly score" />
      {line('vib_h', '#f472b6', { yAxisId: 'v', name: 'homogenizer pump mm/s' })}
      {line('vib_a', '#a3e635', { yAxisId: 'v', name: 'pasteurizer A pump mm/s' })}
    </ComposedChart>
  </ChartCard>
)

export const SpoofChart = ({ h }) => (
  <ChartCard title="Pasteurizer A: what the PLC says vs physics" sub="Reported flow vs flow implied by the motor drive current"
    legend={[['#94a3b8', 'PLC reported', true], ['#fb4469', 'physical'], ['#7dd3fc', 'Past. B']]}>
    <LineChart data={h} margin={margin}>
      {grid}{X}<YAxis {...axis} domain={[0, 900]} />{tip}
      {line('a_physical', '#fb4469', { name: 'A physical L/min' })}
      {line('a_reported', '#94a3b8', { name: 'A PLC-reported L/min', strokeDasharray: '6 4' })}
      {line('b_flow', '#7dd3fc', { name: 'B L/min', strokeWidth: 1.5 })}
    </LineChart>
  </ChartCard>
)

export const ChillerChart = ({ h }) => (
  <ChartCard title="Silo chiller: PLC sensor vs inlet sensors" sub="Independent pasteurizer inlet temperature exposes a frozen reading"
    legend={[['#94a3b8', 'silo PLC', true], ['#fb923c', 'inlet actual']]}>
    <LineChart data={h} margin={margin}>
      {grid}{X}<YAxis {...axis} domain={[2, 11]} unit="°" />{tip}
      <ReferenceLine y={7} stroke="#fb4469" strokeDasharray="4 4" />
      {line('inlet_temp', '#fb923c', { name: 'inlet °C' })}
      {line('silo_temp', '#94a3b8', { name: 'silo PLC °C', strokeDasharray: '6 4' })}
    </LineChart>
  </ChartCard>
)
