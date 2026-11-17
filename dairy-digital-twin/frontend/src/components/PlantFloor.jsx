import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, NodeToolbar, Position, ReactFlow } from '@xyflow/react'
import { MousePointerClick, ShieldAlert, X } from 'lucide-react'
import { fmt, post, TONE, UNIT_INFO } from '../lib/twin'
import { actionsFor, chillerSpoofed, openTicket } from '../lib/actions'
import { sfx } from '../lib/feel'
import { BTN, Num, Panel, StatusBadge } from './ui'
import { useZoomed } from './widgets'

const W = 252
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const CALM = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/* every colour is a theme variable (src/theme.css), so light / dark mode repaint the floor without re-rendering */
const C = { line: 'var(--pf-pipe)', line2: 'var(--color-line-2)', steel: 'var(--pf-steel)', ink: 'var(--color-ink)', ink2: 'var(--color-ink-2)',
  accent: 'var(--color-accent)', flow: 'var(--pf-flow)', milk: 'var(--pf-milk)', particle: 'var(--pf-particle)', shell: 'var(--pf-shell)',
  ok: 'var(--color-ok)', okTint: 'var(--pf-ok-tint)', warn: 'var(--color-warn)', crit: 'var(--color-crit)', iso: 'var(--color-iso)' }

/* ------------------------------------------------------------------ equipment drawings */
function Vessel({ level, target = 50 }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const w = 54
  const h = 104
  const lv = clamp(level ?? 0, 0, 100)
  const fillCol = lv > 95 || lv < 8 ? 'var(--pf-tank-hot)' : lv > 82 || lv < 18 ? 'var(--pf-tank-warm)' : C.milk
  const inner = h - 14
  const top = 7 + inner - (inner * lv) / 100
  const ty = 7 + inner * (1 - target / 100)
  // a wave strip one period (28 px) wider than the tank on each side, so sliding it by one period loops seamlessly
  const wave = (amp) => {
    let d = 'M -23 0'
    for (let x = -23; x < w + 28; x += 28) d += ` q 7 ${-amp} 14 0 t 14 0`
    return `${d} V ${inner + 10} H -23 Z`
  }
  return (
    <svg width={w + 14} height={h} viewBox={`0 0 ${w + 14} ${h}`} className="shrink-0" aria-hidden>
      <defs>
        <clipPath id={`c${id}`}><rect x="5" y="7" width={w - 8} height={inner} rx="8" /></clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: fillCol, stopOpacity: 1 }} /><stop offset="1" style={{ stopColor: fillCol, stopOpacity: 0.7 }} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width={w} height={h - 2} rx="12" fill={C.shell} stroke={C.steel} strokeWidth="2" />
      <g clipPath={`url(#c${id})`} opacity={lv < 0.5 ? 0 : 1}>
        <g style={{ transform: `translateY(${top}px)`, transition: 'transform .7s cubic-bezier(.2,.8,.2,1)' }}>
          <path className={CALM ? '' : 'tank-wave slow'} d={wave(2)} fill={fillCol} />
          <path className={CALM ? '' : 'tank-wave'} d={wave(2.6)} fill={`url(#g${id})`} />
        </g>
      </g>
      <rect x="9" y="12" width="4" height={h - 30} rx="2" fill="#fff" opacity="0.08" />
      <line x1="1" x2={w + 8} y1={ty} y2={ty} stroke={C.ink2} strokeWidth="1" strokeDasharray="3 3" />
      <text x={w + 13} y={ty + 4} textAnchor="end" fontSize="10" fill={C.ink2}>50</text>
    </svg>
  )
}

function Gauge({ value, min = 1700, max = 2400, band = [1800, 2250] }) {
  const cx = 66
  const cy = 62
  const r = 50
  const ang = (v) => Math.PI * (1 - (clamp(v, min, max) - min) / (max - min))
  const pt = (a, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]
  const arc = (v1, v2) => {
    const [x1, y1] = pt(ang(v1))
    const [x2, y2] = pt(ang(v2))
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  const [nx, ny] = pt(ang(value), r - 10)
  const inBand = value >= band[0] && value <= band[1]
  return (
    <svg width="132" height="92" viewBox="0 0 132 92" className="shrink-0" aria-hidden>
      <path d={arc(min, max)} stroke={C.line2} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={arc(band[0], band[1])} stroke={C.okTint} strokeWidth="9" fill="none" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={inBand ? C.ink : C.crit} strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all .5s ease' }} />
      <circle cx={cx} cy={cy} r="4.5" fill={C.ink} />
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="15" fontWeight="600" fill={inBand ? C.ink : C.crit} className="num">
        {fmt(value)}<tspan fontSize="11" fontWeight="400" fill={C.ink2}> PSI</tspan></text>
    </svg>
  )
}

function TempBar({ t, active }) {
  const min = 64
  const max = 76
  const x = (v) => ((clamp(v, min, max) - min) / (max - min)) * 100
  const bad = active && t < 71.5
  return (
    <div>
      <div className="relative h-2 w-full rounded-sm bg-line-2">
        <div className="absolute inset-y-0 bg-ok/35" style={{ left: `${x(71.5)}%`, width: `${x(75) - x(71.5)}%` }} />
        <div className="absolute -top-1 h-4 w-px bg-ink-3" style={{ left: `${x(72)}%` }} />
        <div className={`absolute -top-1.5 h-5 w-1 rounded-sm ${bad ? 'bg-crit' : 'bg-ink'}`} style={{ left: `calc(${x(t)}% - 2px)`, transition: 'left .5s' }} />
      </div>
      <div className="mt-1 flex justify-between text-[11.5px] text-ink-3"><span>64 °C</span><span>72 °C minimum</span><span>76</span></div>
    </div>
  )
}

const Big = ({ n, int = false, d = 0, unit, tone = 'text-ink' }) => (
  <div className={`num text-[28px] font-semibold leading-none tracking-tight ${tone}`}><Num value={n} int={int} d={d} /><span className="ml-1 text-[14px] font-normal text-ink-2">{unit}</span></div>
)
const Line = ({ children, tone = 'text-ink-2' }) => <div className={`text-[14px] leading-snug ${tone}`}>{children}</div>

/* ------------------------------------------------------------------ node shell */
const GLOW = { WARN: 'glow-warn', CRITICAL: 'glow-crit', QUARANTINED: 'glow-iso' }

function Shell({ data, children, handles }) {
  const t = TONE[data.status] || TONE.OK
  const ok = data.status === 'OK'
  return (
    <div className={`unit-card relative rounded-lg bg-surface ${ok ? 'outline-1' : 'outline-2'} outline -outline-offset-1 ${ok ? 'outline-line' : t.outline} ${data.status === 'CRITICAL' ? 'crit-outline' : ''} ${GLOW[data.quarantined ? 'QUARANTINED' : data.status] || ''}`}
      style={{ width: W }}>
      {handles}
      {data.role && !data.quarantined && <span className={`cascade-ring ${data.role.tone === 'crit' ? 'text-crit' : 'text-warn'}`} />}
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="text-[15.5px] font-semibold leading-tight text-ink">{UNIT_INFO[data.id].name}</span>
        <span className="ml-auto"><StatusBadge status={data.status} /></span>
      </div>
      <div className="px-3.5 pb-3 pt-2.5">{children}</div>
      {/* always rendered so a unit never changes height when its status changes (keeps the fit stable) */}
      <div className={`truncate border-t border-line-2 px-3.5 py-2 text-[13px] ${ok ? 'text-ink-3' : `font-medium ${t.text}`}`} title={data.reason}>
        {ok ? 'Working normally' : data.reason}
      </div>
      {data.badge && (
        <div className={`absolute -top-3 left-3.5 rounded px-2 py-0.5 text-[12px] font-semibold ${data.badge.cls}`}>{data.badge.text}</div>
      )}
      {data.role?.text && !data.quarantined && (
        <div className={`absolute -top-3 right-3 rounded px-2 py-0.5 text-[12px] font-bold ${data.role.kind === 'root' ? 'bg-crit-deep text-white' : data.role.tone === 'crit' ? 'bg-crit-deep text-white' : 'bg-warn text-[#1B1405]'}`}>{data.role.text}</div>
      )}
      {data.quarantined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border-2 border-iso bg-iso-2">
          <ShieldAlert size={30} className="text-iso" strokeWidth={2.2} />
          <div className="mt-1 text-[17px] font-bold text-iso">Isolated</div>
          <div className="text-[13px] text-ink-2">valve closed · attacker blocked</div>
        </div>
      )}
    </div>
  )
}

const h = (type, pos, id) => <Handle key={id + type} type={type} position={pos} id={id} />

/* tanks: the drawing shows what the independent load cells weigh, so a drained tank looks drained even when its
   PLC replays an old level; the gap is called out under the numbers */
const weighed = (s, cap) => (typeof s.load_cell_l === 'number' ? (100 * s.load_cell_l) / cap : s.level_pct)
const Faked = ({ s }) => (typeof s.load_cell_l === 'number' && Math.abs(s.level_l - s.load_cell_l) > 300 ? (
  <div className="mt-2 rounded border-l-4 border-crit bg-crit-2 px-2 py-1 text-[13px] leading-snug text-ink">
    Load cells weigh <b className="num"><Num value={s.load_cell_l} int /> L</b>. The level reading is fake.
  </div>
) : null)

function SiloNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('source', Position.Right, 'r')]}>
      <div className="flex items-center gap-3">
        <Vessel level={weighed(s, 24000)} />
        <div className="space-y-1.5">
          <Big n={s.level_pct} unit="% full" tone={s.level_pct > 95 ? 'text-crit' : 'text-ink'} />
          <Line><Num value={s.level_l} int /> L of 24,000</Line>
          <Line tone={s.temp_c > 6 ? 'text-crit font-semibold' : 'text-ink-2'}>Temperature {fmt(s.temp_c, 1)} °C</Line>
        </div>
      </div>
      <Faked s={s} />
    </Shell>
  )
}

function SurgeNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Top, 't'), h('source', Position.Left, 'l')]}>
      <div className="flex items-center gap-3">
        <Vessel level={weighed(s, 6000)} />
        <div className="space-y-1.5">
          <Big n={s.level_pct} unit="% full" tone={s.level_pct < 10 ? 'text-crit' : 'text-ink'} />
          <Line><Num value={s.level_l} int /> L of 6,000</Line>
          <Line tone={data.tStarve !== null || s.level_pct < 8 ? 'text-crit font-semibold' : 'text-ink-2'}>
            {data.tStarve !== null ? `Empties in ${fmt(data.tStarve)} min`
              : s.level_pct < 8 ? 'Empty: filler starving' : s.level_pct > 92 ? 'Nearly full' : 'Holding steady'}</Line>
        </div>
      </div>
      <Faked s={s} />
    </Shell>
  )
}

function PasteurizerNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Left, 'l'), h('source', Position.Right, 'r')]}>
      <div className="flex items-baseline justify-between">
        <Big n={s.flow_lpm} unit="L/min" />
        <span className="num text-[16px] font-semibold text-ink">{fmt(s.temp_c, 1)} °C</span>
      </div>
      {data.spoof && (
        <div className="mt-2 rounded border-l-4 border-crit bg-crit-2 px-2 py-1 text-[13px] leading-snug text-ink">
          Motor current says <b className="num">{fmt(data.physical)} L/min</b>. The reading above is fake.
        </div>
      )}
      <div className="mt-2.5"><TempBar t={s.temp_c} active={s.flow_lpm > 0} /></div>
    </Shell>
  )
}

function HomogNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Left, 'l'), h('source', Position.Bottom, 'b')]}>
      <div className="flex items-center gap-2">
        <Gauge value={s.pressure_psi} />
        <Big n={s.flow_lpm} unit="L/min" />
      </div>
      <Line tone="text-[13px] text-ink-2">Green arc: legacy “OK” range</Line>
    </Shell>
  )
}

function FillerNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Right, 'r'), h('source', Position.Left, 'l')]}>
      <Big n={s.flow_lpm} unit="L/min" tone={s.starved ? 'text-crit' : 'text-ink'} />
      <div className="mt-2.5 h-2 rounded-sm bg-line-2">
        <div className={`h-full rounded-sm ${s.starved ? 'bg-crit' : 'bg-accent'}`} style={{ width: `${clamp(s.flow_lpm / 8, 0, 100)}%`, transition: 'width .5s' }} />
      </div>
      <Line tone={s.starved ? 'mt-2 text-crit font-semibold' : 'mt-2 text-ink-2'}>{s.starved ? 'Waiting for milk' : 'Filling 1 L cartons'}</Line>
    </Shell>
  )
}

function PackagingNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Right, 'r')]}>
      <Big int n={s.units_total} unit="cartons" />
      <Line tone="mt-2 text-ink-2">{fmt(s.rate_lpm)} per min · cold room {fmt(s.cold_room_temp_c, 1)} °C</Line>
    </Shell>
  )
}

/* ------------------------------------------------------------------ hover / pinned card */
function InfoCard({ id, data, pinned, actions, onAct, onClose }) {
  const info = UNIT_INFO[id]
  const t = TONE[data.status] || TONE.OK
  return (
    <div className="nodrag nopan w-[330px] rounded-lg border border-line bg-surface p-4 text-left shadow-[0_22px_50px_-16px_rgba(0,0,0,0.9)] ring-1 ring-[#84BEE5]/15"
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <div>
          <div className="text-[13px] font-semibold text-accent">{info.step}</div>
          <div className="text-[18px] font-semibold leading-tight text-ink">{info.name}</div>
        </div>
        {pinned && (
          <button onClick={onClose} className="ml-auto grid h-7 w-7 place-items-center rounded text-ink-2 hover:bg-surface-2" aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink">{info.what}</p>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-2"><span className="font-semibold text-ink">Engine watches: </span>{info.watch}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-line-2 pt-3">
        <StatusBadge status={data.status} />
        <span className={`truncate text-[13.5px] ${data.status === 'OK' ? 'text-ink-2' : t.text}`}>{data.status === 'OK' ? 'Working normally' : data.reason}</span>
      </div>
      {pinned && actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a.label} onClick={() => onAct(a)} className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${BTN[a.kind]}`}>{a.label}</button>
          ))}
        </div>
      )}
      <div className="mt-2.5 text-[12.5px] text-ink-3">
        {pinned ? 'Click the floor to close' : `Click the unit to pin this card${actions.length ? ' and act' : ''}`}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pipes */
/* Drops of milk travelling along a pipe. More drops and faster travel when more litres flow; the timing is
   rounded so a small change in flow does not restart the animation every tick. */
function Particles({ path, flow, color }) {
  const n = clamp(Math.round(flow / 170), 1, 5)
  const dur = Math.round(clamp(2600 / Math.max(flow, 1), 1.4, 9) * 2) / 2
  return Array.from({ length: n }, (_, i) => (
    <circle key={`${i}-${n}-${dur}-${color}`} r="2.7" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${((i * dur) / n).toFixed(2)}s`} path={path} />
    </circle>
  ))
}

function Pipe(props) {
  const { id, data, markerEnd } = props
  const [path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 16, offset: 24 })
  const flow = data.flow || 0
  const moving = flow >= 1 && !data.blocked
  const color = data.blocked ? C.iso : flow < 1 ? C.steel : data.tone === 'CRITICAL' ? C.crit : data.tone === 'WARN' ? C.warn : C.flow
  return (
    <>
      <path d={path} fill="none" stroke={C.line} strokeWidth={13} strokeLinecap="round" />
      <path d={path} fill="none" stroke={C.shell} strokeWidth={9} strokeLinecap="round" />
      {moving && <path d={path} fill="none" stroke={color} strokeWidth={11} strokeOpacity={0.14} strokeLinecap="round" />}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={moving ? 'flow-dash' : ''}
        style={{ stroke: color, strokeWidth: moving ? 2 + Math.min(3.5, flow / 240) : 2, strokeDasharray: data.blocked ? '4 5' : undefined,
          animationDuration: `${clamp(320 / Math.max(flow, 1), 0.3, 3)}s` }} />
      {moving && !CALM && <Particles path={path} flow={flow} color={data.spoof || data.tone === 'CRITICAL' ? C.crit : data.tone === 'WARN' ? C.warn : C.particle} />}
      <EdgeLabelRenderer>
        <div className="nodrag nopan num absolute rounded border bg-surface px-1.5 py-px text-[12.5px] font-semibold"
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: data.blocked ? C.iso : data.spoof ? C.crit : C.ink,
            borderColor: data.blocked ? C.iso : C.line }}>
          {data.blocked ? 'valve closed' : `${fmt(flow)} L/min`}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

/* ------------------------------------------------------------------ wiring */
/* Live values reach nodes through context so the node objects given to React Flow never change.
   React Flow drops a node's measured size when its object is replaced, which hid nodes between ticks. */
const NodeData = createContext({})
const Ui = createContext({ hover: null, pinned: null })
const TIP_POS = { silo: Position.Right, pasteurizer_a: Position.Right, pasteurizer_b: Position.Right, homogenizer: Position.Left,
  surge_tank: Position.Left, filler: Position.Top, packaging: Position.Top }
const live = (Comp) => function LiveNode({ id }) {
  const data = useContext(NodeData)[id]
  const ui = useContext(Ui)
  if (!data) return null
  return (
    <>
      <NodeToolbar isVisible={ui.hover === id || ui.pinned === id} position={TIP_POS[id]} offset={14}>
        <InfoCard id={id} data={data} pinned={ui.pinned === id} actions={ui.actionsFor(id)} onAct={ui.act} onClose={() => ui.setPinned(null)} />
      </NodeToolbar>
      <Comp data={data} />
    </>
  )
}
const nodeTypes = { silo: live(SiloNode), surge: live(SurgeNode), past: live(PasteurizerNode), homog: live(HomogNode),
  filler: live(FillerNode), pack: live(PackagingNode) }
const edgeTypes = { pipe: Pipe }

const POS = {
  silo: { x: 0, y: 100 }, pasteurizer_a: { x: 330, y: 0 }, pasteurizer_b: { x: 330, y: 238 },
  homogenizer: { x: 660, y: 92 }, surge_tank: { x: 660, y: 476 }, filler: { x: 330, y: 476 }, packaging: { x: 0, y: 476 },
}
const TYPE = { silo: 'silo', surge_tank: 'surge', pasteurizer_a: 'past', pasteurizer_b: 'past', homogenizer: 'homog', filler: 'filler', packaging: 'pack' }
const NODES = Object.keys(TYPE).map((id) => ({ id, type: TYPE[id], position: POS[id], draggable: false }))
const FIT = { padding: { x: '24px', y: '30px' } }     // v13: bare numbers are pixels, so be explicit

/* The React Flow canvas. A component of its own so it remounts (and re-fits) when the card opens in the
   focus view, where scroll-to-zoom, drag-to-pan and the zoom buttons switch on. */
function FloorCanvas({ view, edges, ui, setHover, setPinned }) {
  const zoomed = useZoomed()
  const flow = useRef(null)
  const box = useRef(null)
  useEffect(() => {                                    // re-fit whenever the canvas changes size
    if (!box.current) return undefined
    const ro = new ResizeObserver(() => flow.current?.fitView(FIT))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => () => setHover(null), [setHover])   // leaving the focus view: no hover card left hanging
  return (
    <div ref={box} className="relative min-h-[420px] flex-1 rounded-b-[11px] bg-canvas">
      <NodeData.Provider value={view}>
        <Ui.Provider value={ui}>
          <ReactFlow nodes={NODES} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={FIT}
            onInit={(inst) => {
              flow.current = inst
              // node sizes change once webfonts finish loading: fit again then
              setTimeout(() => inst.fitView(FIT), 300)
              document.fonts?.ready.then(() => inst.fitView(FIT))
            }}
            onNodeMouseEnter={(_, n) => { setHover(n.id); sfx.hover() }} onNodeMouseLeave={() => setHover(null)}
            onNodeClick={(_, n) => setPinned((p) => (p === n.id ? null : n.id))} onPaneClick={() => setPinned(null)}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            zoomOnScroll={zoomed} panOnDrag={zoomed} zoomOnDoubleClick={zoomed} zoomOnPinch={zoomed} preventScrolling={zoomed}
            minZoom={0.3} maxZoom={2.5} style={{ background: 'transparent' }}>
            <Background color="var(--pf-dots)" bgColor="var(--color-canvas)" gap={22} size={1.2} />
            {zoomed && <Controls showInteractive={false} position="bottom-left" fitViewOptions={FIT} />}
          </ReactFlow>
        </Ui.Provider>
      </NodeData.Provider>
    </div>
  )
}

export default function PlantFloor({ frame, notify, className = '' }) {
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)

  const act = useCallback(async (a) => {
    const btn = document.activeElement?.closest?.('button')
    if (btn) { btn.setAttribute('data-loading', ''); btn.disabled = true }
    try {
      const r = await post(a.path, a.body)
      notify(r.message || (r.ok ? 'Done' : 'Failed'), r.ok !== false)
    } finally {
      if (btn) { btn.removeAttribute('data-loading'); btn.disabled = false }
    }
  }, [notify])

  const { view, edges } = useMemo(() => {
    const s = frame.stages
    const units = frame.engine.units
    const tickets = frame.engine.pillar2.tickets
    const chk = frame.engine.pillar3.checks
    const badge = {}
    for (const [pump, unit] of [['homogenizer_pump_1', 'homogenizer'], ['pasteurizer_a_pump', 'pasteurizer_a']]) {
      const t = openTicket(tickets, pump)
      if (!t) continue
      badge[unit] = t.status === 'FAILED' ? { text: 'Pump failed', cls: 'bg-crit-deep text-white' }
        : t.status === 'DISPATCHED' ? { text: 'Technician on the way', cls: 'bg-brand-deep text-white' }
          : { text: `Pump fails in ${fmt(t.rul_min)} min`, cls: t.priority === 'CRITICAL' ? 'bg-crit-deep text-white' : 'bg-warn text-[#1B1405]' }
    }
    if (s.homogenizer.flushing) badge.homogenizer = { text: 'Self-cleaning', cls: 'bg-brand-deep text-white' }
    const aSpoof = chk.pasteurizer_a.mismatch_pct > 12

    // where the problem starts and where it will hurt next: drawn as rings and tags on the floor
    const role = {}
    const p1 = frame.engine.pillar1
    for (const x of p1.cascade) {
      if (x.from && !role[x.from]) role[x.from] = { kind: 'root', text: 'Root cause', tone: 'crit' }
      if (x.node && !role[x.node] && !(x.eta_min !== null && x.eta_min > 120)) {   // far-off effects: listed in the evidence, not tagged
        role[x.node] = { kind: 'impact', tone: x.eta_min !== null && x.eta_min < 1 ? 'crit' : 'warn',
          text: x.eta_min === null ? 'At risk' : x.eta_min < 1 ? 'Hit now' : `Hit in ${fmt(x.eta_min)} min` }
      }
    }
    if (p1.drift_detected) role.homogenizer = { kind: 'root', text: 'Root cause', tone: 'crit' }
    if (aSpoof && !s.pasteurizer_a.quarantined) role.pasteurizer_a = { kind: 'root', text: 'Hacked PLC', tone: 'crit' }
    if (chillerSpoofed(frame)) role.silo = { kind: 'root', text: 'Sensor faked', tone: 'crit' }
    for (const [pump, unit] of [['homogenizer_pump_1', 'homogenizer'], ['pasteurizer_a_pump', 'pasteurizer_a']]) {
      const t = openTicket(tickets, pump)
      if (t && t.status !== 'DISPATCHED' && !role[unit]) role[unit] = { kind: 'root', text: null, tone: t.status === 'FAILED' || t.priority === 'CRITICAL' ? 'crit' : 'warn' }
    }

    const view = Object.fromEntries(Object.keys(TYPE).map((id) => [id, {
      id, s: s[id], status: units[id].status, reason: units[id].reason, badge: badge[id], role: role[id],
      quarantined: id.startsWith('pasteurizer') && s[id].quarantined,
      spoof: id === 'pasteurizer_a' && aSpoof, physical: chk.pasteurizer_a.implied_flow,
      tStarve: frame.engine.pillar1.t_starve_min,
    }]))

    const tone = (n) => units[n]?.status
    const e = (src, sh, dst, th, f, extra = {}) => {
      const color = extra.blocked ? C.iso : f < 1 ? C.steel : tone(dst) === 'CRITICAL' ? C.crit : tone(dst) === 'WARN' ? C.warn : C.flow
      return { id: `${src}-${dst}`, source: src, sourceHandle: sh, target: dst, targetHandle: th, type: 'pipe',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14, markerUnits: 'userSpaceOnUse' }, data: { flow: f, tone: tone(dst), ...extra } }
    }
    const pa = s.pasteurizer_a
    const pb = s.pasteurizer_b
    const aFlow = chk.pasteurizer_a.implied_flow
    const edges = [
      e('silo', 'r', 'pasteurizer_a', 'l', aFlow, { blocked: pa.quarantined, spoof: aSpoof }),
      e('silo', 'r', 'pasteurizer_b', 'l', pb.flow_lpm, { blocked: pb.quarantined }),
      e('pasteurizer_a', 'r', 'homogenizer', 'l', aFlow, { blocked: pa.quarantined, spoof: aSpoof }),
      e('pasteurizer_b', 'r', 'homogenizer', 'l', pb.flow_lpm, { blocked: pb.quarantined }),
      e('homogenizer', 'b', 'surge_tank', 't', s.surge_tank.flow_in_lpm),
      e('surge_tank', 'l', 'filler', 'r', s.filler.flow_lpm),
      e('filler', 'l', 'packaging', 'r', s.packaging.rate_lpm),
    ]
    return { view, edges }
  }, [frame])

  const ui = useMemo(() => ({ hover, pinned, setPinned, act, actionsFor: (id) => actionsFor(id, frame) }), [hover, pinned, act, frame])

  return (
    <Panel wid="floor" title="Plant floor" zoom="fill" className={`overflow-hidden ${className}`} bodyClass="!p-0 flex flex-col"
      sub={<FloorHint />}
      right={(
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-brand" />milk flowing</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-warn" />at risk</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-crit" />critical</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm border-t-2 border-dashed border-iso" />valve closed</span>
        </div>
      )}>
      <FloorCanvas view={view} edges={edges} ui={ui} setHover={setHover} setPinned={setPinned} />
    </Panel>
  )
}

function FloorHint() {
  const zoomed = useZoomed()
  return (
    <span className="flex items-center gap-1.5">
      <MousePointerClick size={15} className="shrink-0 text-accent" />
      Hover a unit to see what it does · click to pin it and act{zoomed ? ' · scroll to zoom, drag to pan' : ''}
    </span>
  )
}
