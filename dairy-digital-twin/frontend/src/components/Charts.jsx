import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Panel } from './ui'
import { useZoomed } from './widgets'

const INK = 'var(--color-ink)'
const INK2 = 'var(--color-ink-2)'
const LINE = 'var(--color-line-2)'
const ACCENT = 'var(--color-accent)'
const MARK = { ink: 'var(--color-ink-2)', accent: 'var(--color-accent)', legacy: 'var(--color-legacy)', warn: 'var(--color-warn-ink)', iso: 'var(--color-iso)' }

const axis = { stroke: INK2, fontSize: 12.5, tickLine: false, axisLine: { stroke: LINE } }
const tip = (
  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', boxShadow: 'var(--shadow-pop)', borderRadius: 6, fontSize: 13, color: INK }}
    labelFormatter={(t) => `minute ${t}`} isAnimationActive={false} />
)
const margin = { top: 22, right: 12, left: -8, bottom: 0 }

/* Labels in the right third of the chart hang to the left of their line so they are never cut off. */
const MarkLabel = ({ viewBox, value, fill, row, end, dx = 0 }) => (viewBox ? (
  <text x={viewBox.x + (end ? -5 : 5) + dx} y={viewBox.y + 13 + row * 16} textAnchor={end ? 'end' : 'start'} fill={fill} fontSize={12.5} fontWeight={600}>{value}</text>
) : null)

/** Event annotations drawn on every chart ("engine flags it", "legacy alarm", ...).
    Events within a few minutes of each other share one line. Each label takes the first of 4 rows where it
    fits next to the labels already placed (using the measured plot width `pw`), and hangs left of its line
    when it would otherwise run off the right edge. A label with no free row keeps its line but drops its text
    rather than printing on top of another; the incident story lists every event anyway. */
function marksFor(marks, data, pw = 320) {
  if (!data.length) return null
  const lo = data[0].tick
  const span = Math.max(1, data[data.length - 1].tick - lo)
  const merged = []
  for (const m of [...marks].filter((x) => x.x >= lo).sort((a, b) => a.x - b.x)) {
    const prev = merged[merged.length - 1]
    if (prev && m.x - prev.x <= span * 0.015) prev.label += ` · ${m.label}`
    else merged.push({ ...m })
  }
  const rowEnd = [-1, -1, -1, -1]                      // right edge of the last label in each row (0-1 of plot width)
  return merged.map((m) => {
    const f = (m.x - lo) / span
    const w = (m.label.length * 6.9 + 14) / Math.max(pw, 120)
    const end = f + w > 1 && f > 0.5                   // hang left only when there is more room on that side
    const want = end ? f - w : f
    const a = Math.min(Math.max(want, 0), Math.max(0, 1 - w))   // still too long? slide it back inside the plot
    const row = rowEnd.findIndex((r) => r < a)
    if (row >= 0) rowEnd[row] = a + w
    return (
      <ReferenceLine key={m.label + m.x} x={m.x} stroke={MARK[m.tone]} strokeDasharray="4 3"
        label={row >= 0 ? <MarkLabel value={m.label} fill={MARK[m.tone]} row={row} end={end} dx={(a - want) * pw} /> : undefined} />
    )
  })
}

/* Inside the Panel, so it knows when the card is open in the focus view: the plot then fills the screen.
   It also measures itself, so event labels are laid out for the real plot width. */
function Plot({ height, children }) {
  const zoomed = useZoomed()
  const ref = useRef(null)
  const [w, setW] = useState(400)
  useEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className={zoomed ? 'mt-2 min-h-[320px] flex-1' : 'mt-2'} style={zoomed ? undefined : { height }}>
      <ResponsiveContainer width="100%" height="100%">{typeof children === 'function' ? children(w - 64) : children}</ResponsiveContainer>
    </div>
  )
}

/** Every chart is a widget: minimize / zoom from its header. `wid` defaults to the title. */
export function ChartCard({ wid, title, sub, legend = [], height = 230, className = '', children }) {
  return (
    <Panel wid={wid || title} title={title} sub={sub} zoom="fill" className={className} bodyClass="flex flex-col !pb-4 !pt-2.5">
      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {legend.map(([c, l, dash]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block w-4" style={{ borderTop: `2.5px ${dash ? 'dashed' : 'solid'} ${c}` }} />{l}
            </span>
          ))}
        </div>
      )}
      <Plot height={height}>{children}</Plot>
    </Panel>
  )
}

const X = <XAxis dataKey="tick" type="number" domain={['dataMin', 'dataMax']} {...axis} tickCount={8} allowDecimals={false} />
const ln = (key, color, extra = {}) => <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false} {...extra} />

export const ThroughputChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="Bottling throughput" sub="Litres per minute leaving the filler. Target is 800." legend={[[ACCENT, 'bottling'], [INK2, 'target', true]]}>
    {(pw) => (<AreaChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 1000]} />{tip}
      <ReferenceLine y={800} stroke={INK2} strokeDasharray="5 4" />
      <Area type="monotone" dataKey="throughput" stroke={ACCENT} strokeWidth={2.2} fill={ACCENT} fillOpacity={0.08} isAnimationActive={false} name="bottling L/min" />
      {marksFor(marks, h, pw)}
    </AreaChart>)}
  </ChartCard>
)

export const LevelsChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="Buffer levels" sub="How full the raw silo and the surge tank are. Shaded band is the healthy 35-65 %." legend={[['var(--ch-silo)', 'raw silo'], [ACCENT, 'surge tank']]}>
    {(pw) => (<LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 100]} unit="%" />{tip}
      <ReferenceArea y1={35} y2={65} fill={ACCENT} fillOpacity={0.05} />
      {ln('silo', 'var(--ch-silo)', { name: 'silo %' })}{ln('surge', ACCENT, { name: 'surge tank %' })}
      {marksFor(marks, h, pw)}
    </LineChart>)}
  </ChartCard>
)

export const PressureChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="Homogenizer pressure" sub="The clogging valve pushes pressure up, but never out of the legacy “OK” band (green)." legend={[['var(--color-warn-ink)', 'pressure'], ['var(--color-ok)', 'legacy OK band']]}>
    {(pw) => (<LineChart data={h} margin={{ ...margin, left: 4 }}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[1750, 2300]} allowDataOverflow />{tip}
      <ReferenceArea y1={1800} y2={2250} fill="var(--color-ok)" fillOpacity={0.08} />
      {ln('pressure', 'var(--color-warn-ink)', { name: 'pressure PSI', strokeWidth: 1.8 })}
      {marksFor(marks, h, pw)}
    </LineChart>)}
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

export function VibrationChart({ h, marks = [], height = 230, wid }) {
  const data = useMemo(() => {
    const a = smooth(h, 'vib_h')
    const b = smooth(h, 'vib_a')
    return h.map((p, i) => ({ tick: p.tick, vib_h: +a[i].toFixed(2), vib_a: +b[i].toFixed(2), anomaly: p.anomaly }))
  }, [h])
  return (
    <ChartCard wid={wid} title="Pump vibration" sub="8-minute rolling mean in mm/s. Legacy alarms at 4.5; the seal fails at 7.1." height={height}
      legend={[['var(--ch-orange)', 'homogenizer pump'], [ACCENT, 'pasteurizer A pump'], ['var(--color-warn)', 'legacy alarm 4.5', true], ['var(--color-crit)', 'seal fails 7.1', true]]}>
      {(pw) => (<LineChart data={data} margin={margin}>
        <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 8]} />{tip}
        <ReferenceLine y={4.5} stroke="var(--color-warn)" strokeDasharray="5 4" />
        <ReferenceLine y={7.1} stroke="var(--color-crit)" strokeDasharray="5 4" />
        {ln('vib_h', 'var(--ch-orange)', { name: 'homogenizer pump mm/s' })}
        {ln('vib_a', ACCENT, { name: 'pasteurizer A pump mm/s' })}
        {marksFor(marks, data, pw)}
      </LineChart>)}
    </ChartCard>
  )
}

export const AnomalyChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="ML anomaly score" sub="IsolationForest trained on healthy operation. Above 0.6 for 3 minutes counts as an anomaly." legend={[['var(--color-iso)', 'anomaly score']]} height={200}>
    {(pw) => (<ComposedChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 1]} />{tip}
      <ReferenceLine y={0.6} stroke="var(--color-crit)" strokeDasharray="5 4" />
      <Area type="stepAfter" dataKey="anomaly" stroke="var(--color-iso)" fill="var(--color-iso)" fillOpacity={0.08} strokeWidth={1.8} isAnimationActive={false} name="anomaly score" />
      {marksFor(marks, h, pw)}
    </ComposedChart>)}
  </ChartCard>
)

export const SpoofChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="Pasteurizer A: PLC reading vs physics" sub="What the PLC reports, against the flow implied by the motor’s drive current."
    legend={[[INK2, 'PLC reported', true], ['var(--color-crit)', 'physical'], [ACCENT, 'Pasteurizer B']]}>
    {(pw) => (<LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[0, 900]} />{tip}
      {ln('a_physical', 'var(--color-crit)', { name: 'A physical L/min' })}
      {ln('a_reported', INK2, { name: 'A PLC-reported L/min', strokeDasharray: '6 4' })}
      {ln('b_flow', ACCENT, { name: 'B L/min', strokeWidth: 1.6 })}
      {marksFor(marks, h, pw)}
    </LineChart>)}
  </ChartCard>
)

export const ChillerChart = ({ h, marks = [], wid }) => (
  <ChartCard wid={wid} title="Silo temperature: PLC vs inlet sensors" sub="An independent sensor at the pasteurizer inlet exposes a frozen PLC reading. Above 7 °C milk spoils."
    legend={[[INK2, 'silo PLC', true], ['var(--ch-orange)', 'inlet sensors']]}>
    {(pw) => (<LineChart data={h} margin={margin}>
      <CartesianGrid stroke={LINE} vertical={false} />{X}<YAxis {...axis} domain={[2, 11]} unit="°" />{tip}
      <ReferenceLine y={7} stroke="var(--color-crit)" strokeDasharray="5 4" />
      {ln('inlet_temp', 'var(--ch-orange)', { name: 'inlet °C' })}
      {ln('silo_temp', INK2, { name: 'silo PLC °C', strokeDasharray: '6 4' })}
      {marksFor(marks, h, pw)}
    </LineChart>)}
  </ChartCard>
)

/** The one chart that matters for the running scenario (one widget id, so minimizing it sticks across scenarios). */
export function ScenarioChart({ scenario, h, marks }) {
  if (scenario === 'pump_wear') return <VibrationChart h={h} marks={marks} wid="scenario" />
  if (scenario === 'cyber_spike') return <SpoofChart h={h} marks={marks} wid="scenario" />
  if (scenario === 'chiller_spoof') return <ChillerChart h={h} marks={marks} wid="scenario" />
  return <PressureChart h={h} marks={marks} wid="scenario" />
}
