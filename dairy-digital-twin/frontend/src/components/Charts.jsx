import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const INK = '#1B2A33'
const INK2 = '#5B6770'
const LINE = '#E7E2D6'
const ACCENT = '#2F5D7C'
const MARK = { ink: '#5B6770', accent: '#2F5D7C', legacy: '#3B4247', warn: '#8C6100', iso: '#6B3FA0' }

const axis = { stroke: INK2, fontSize: 12.5, tickLine: false, axisLine: { stroke: LINE } }
const tip = (
  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #D9D3C5', borderRadius: 6, fontSize: 13, color: INK }}
    labelFormatter={(t) => `minute ${t}`} isAnimationActive={false} />
)
const margin = { top: 22, right: 12, left: -8, bottom: 0 }

const MarkLabel = ({ viewBox, value, fill, row }) => (viewBox ? (
  <text x={viewBox.x + 5} y={viewBox.y + 13 + row * 16} fill={fill} fontSize={12.5} fontWeight={600}>{value}</text>
) : null)

/** Event annotations drawn on every chart ("engine flags it", "legacy alarm", ...).
    Events within a few minutes of each other share one line; labels stack so they never overlap. */
function marksFor(marks, data) {
  if (!data.length) return null
  const lo = data[0].tick
  const span = Math.max(1, data[data.length - 1].tick - lo)
  const merged = []
  for (const m of [...marks].filter((x) => x.x >= lo).sort((a, b) => a.x - b.x)) {
    const prev = merged[merged.length - 1]
    if (prev && m.x - prev.x <= span * 0.015) prev.label += ` · ${m.label}`
    else merged.push({ ...m })
  }
  return merged.map((m, i) => (
    <ReferenceLine key={m.label + m.x} x={m.x} stroke={MARK[m.tone]} strokeDasharray="4 3"
      label={<MarkLabel value={m.label} fill={MARK[m.tone]} row={i % 3} />} />
  ))
}

export function ChartCard({ title, sub, legend = [], height = 230, children }) {
  return (
    <section className="panel flex flex-col px-5 pb-4 pt-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
          <p className="text-[13.5px] text-ink-2">{sub}</p>
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-[13px] text-ink-2">
          {legend.map(([c, l, dash]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block w-4" style={{ borderTop: `2.5px ${dash ? 'dashed' : 'solid'} ${c}` }} />{l}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2" style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </section>
  )
}

const X = <XAxis dataKey="tick" type="number" domain={['dataMin', 'dataMax']} {...axis} tickCount={8} allowDecimals={false} />
const ln = (key, color, extra = {}) => <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false} {...extra} />

export const ThroughputChart = ({ h, marks = [] }) => (
  <ChartCard title="Bottling throughput" sub="Litres per minute leaving the filler. Target is 800." legend={[[ACCENT, 'bottling'], [INK2, 'target', true]]}>
    <AreaChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 1000]} />{tip}
      <ReferenceLine y={800} stroke={INK2} strokeDasharray="5 4" />
      <Area type="monotone" dataKey="throughput" stroke={ACCENT} strokeWidth={2.2} fill={ACCENT} fillOpacity={0.08} isAnimationActive={false} name="bottling L/min" />
      {marksFor(marks, h)}
    </AreaChart>
  </ChartCard>
)

export const LevelsChart = ({ h, marks = [] }) => (
  <ChartCard title="Buffer levels" sub="How full the raw silo and the surge tank are. Shaded band is the healthy 35-65 %." legend={[['#7A5C99', 'raw silo'], [ACCENT, 'surge tank']]}>
    <LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 100]} unit="%" />{tip}
      <ReferenceArea y1={35} y2={65} fill={ACCENT} fillOpacity={0.05} />
      {ln('silo', '#7A5C99', { name: 'silo %' })}{ln('surge', ACCENT, { name: 'surge tank %' })}
      {marksFor(marks, h)}
    </LineChart>
  </ChartCard>
)

export const PressureChart = ({ h, marks = [] }) => (
  <ChartCard title="Homogenizer pressure" sub="The clogging valve pushes pressure up, but never out of the legacy “OK” band (green)." legend={[['#8C6100', 'pressure'], ['#2E7D5B', 'legacy OK band']]}>
    <LineChart data={h} margin={{ ...margin, left: 4 }}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[1750, 2300]} allowDataOverflow />{tip}
      <ReferenceArea y1={1800} y2={2250} fill="#2E7D5B" fillOpacity={0.08} />
      {ln('pressure', '#8C6100', { name: 'pressure PSI', strokeWidth: 1.8 })}
      {marksFor(marks, h)}
    </LineChart>
  </ChartCard>
)

/** Rolling mean - raw vibration is noisy (spec §5.6). */
function smooth(h, key, n = 8) {
  const out = []
  let sum = 0
  for (let i = 0; i < h.length; i++) {
    sum += h[i][key] ?? 0
    if (i >= n) sum -= h[i - n][key] ?? 0
    out.push(sum / Math.min(i + 1, n))
  }
  return out
}

export function VibrationChart({ h, marks = [], height = 230 }) {
  const data = useMemo(() => {
    const a = smooth(h, 'vib_h')
    const b = smooth(h, 'vib_a')
    return h.map((p, i) => ({ tick: p.tick, vib_h: +a[i].toFixed(2), vib_a: +b[i].toFixed(2), anomaly: p.anomaly }))
  }, [h])
  return (
    <ChartCard title="Pump vibration" sub="8-minute rolling mean in mm/s. Legacy alarms at 4.5; the seal fails at 7.1." height={height}
      legend={[['#B5532D', 'homogenizer pump'], [ACCENT, 'pasteurizer A pump']]}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 8]} />{tip}
        <ReferenceLine y={4.5} stroke="#C98A00" strokeDasharray="5 4" label={{ value: 'legacy alarm 4.5', position: 'insideTopRight', fill: '#8C6100', fontSize: 12.5 }} />
        <ReferenceLine y={7.1} stroke="#B83A2E" strokeDasharray="5 4" label={{ value: 'failure 7.1', position: 'insideTopRight', fill: '#B83A2E', fontSize: 12.5 }} />
        {ln('vib_h', '#B5532D', { name: 'homogenizer pump mm/s' })}
        {ln('vib_a', ACCENT, { name: 'pasteurizer A pump mm/s' })}
        {marksFor(marks, data)}
      </LineChart>
    </ChartCard>
  )
}

export const AnomalyChart = ({ h, marks = [] }) => (
  <ChartCard title="ML anomaly score" sub="IsolationForest trained on healthy operation. Above 0.6 for 3 minutes counts as an anomaly." legend={[['#6B3FA0', 'anomaly score']]} height={200}>
    <ComposedChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 1]} />{tip}
      <ReferenceLine y={0.6} stroke="#B83A2E" strokeDasharray="5 4" />
      <Area type="stepAfter" dataKey="anomaly" stroke="#6B3FA0" fill="#6B3FA0" fillOpacity={0.08} strokeWidth={1.8} isAnimationActive={false} name="anomaly score" />
      {marksFor(marks, h)}
    </ComposedChart>
  </ChartCard>
)

export const SpoofChart = ({ h, marks = [] }) => (
  <ChartCard title="Pasteurizer A: PLC reading vs physics" sub="What the PLC reports, against the flow implied by the motor’s drive current."
    legend={[[INK2, 'PLC reported', true], ['#B83A2E', 'physical'], [ACCENT, 'Pasteurizer B']]}>
    <LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 900]} />{tip}
      {ln('a_physical', '#B83A2E', { name: 'A physical L/min' })}
      {ln('a_reported', INK2, { name: 'A PLC-reported L/min', strokeDasharray: '6 4' })}
      {ln('b_flow', ACCENT, { name: 'B L/min', strokeWidth: 1.6 })}
      {marksFor(marks, h)}
    </LineChart>
  </ChartCard>
)

export const ChillerChart = ({ h, marks = [] }) => (
  <ChartCard title="Silo temperature: PLC vs inlet sensors" sub="An independent sensor at the pasteurizer inlet exposes a frozen PLC reading. Above 7 °C milk spoils."
    legend={[[INK2, 'silo PLC', true], ['#B5532D', 'inlet sensors']]}>
    <LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[2, 11]} unit="°" />{tip}
      <ReferenceLine y={7} stroke="#B83A2E" strokeDasharray="5 4" />
      {ln('inlet_temp', '#B5532D', { name: 'inlet °C' })}
      {ln('silo_temp', INK2, { name: 'silo PLC °C', strokeDasharray: '6 4' })}
      {marksFor(marks, h)}
    </LineChart>
  </ChartCard>
)

/** The one chart that matters for the running scenario. */
export function ScenarioChart({ scenario, h, marks }) {
  if (scenario === 'pump_wear') return <VibrationChart h={h} marks={marks} />
  if (scenario === 'cyber_spike') return <SpoofChart h={h} marks={marks} />
  if (scenario === 'chiller_spoof') return <ChillerChart h={h} marks={marks} />
  return <PressureChart h={h} marks={marks} />
}
