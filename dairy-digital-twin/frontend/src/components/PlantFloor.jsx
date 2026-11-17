import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Background, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, NodeToolbar, Position, ReactFlow } from '@xyflow/react'
import { MousePointerClick, ShieldAlert, X } from 'lucide-react'
import { fmt, fmtInt, post, TONE, UNIT_INFO } from '../lib/twin'
import { actionsFor, openTicket } from '../lib/actions'
import { BTN, StatusBadge } from './ui'

const W = 252
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const C = { line: '#D9D3C5', line2: '#E7E2D6', steel: '#8A949B', ink: '#1B2A33', ink2: '#5B6770', accent: '#2F5D7C', milk: '#A9C3D6', ok: '#2E7D5B', okTint: '#CFE5D8', warn: '#C98A00', crit: '#B83A2E', iso: '#6B3FA0' }

/* ------------------------------------------------------------------ equipment drawings */
function Vessel({ level, target = 50 }) {
  const w = 54
  const h = 104
  const lv = clamp(level ?? 0, 0, 100)
  const fillCol = lv > 95 || lv < 8 ? '#E3A79F' : lv > 82 || lv < 18 ? '#E9CC85' : C.milk
  const inner = h - 14
  const fill = (inner * lv) / 100
  const ty = 7 + inner * (1 - target / 100)
  return (
    <svg width={w + 14} height={h} viewBox={`0 0 ${w + 14} ${h}`} className="shrink-0" aria-hidden>
      <rect x="1" y="1" width={w} height={h - 2} rx="12" fill="#F4F1EA" stroke={C.steel} strokeWidth="2" />
      <clipPath id={`v${target}${Math.round(lv)}`}><rect x="5" y="7" width={w - 8} height={inner} rx="8" /></clipPath>
      <rect x="5" y={7 + inner - fill} width={w - 8} height={fill} fill={fillCol} clipPath={`url(#v${target}${Math.round(lv)})`} style={{ transition: 'all .6s ease' }} />
      <line x1="5" x2={w - 3} y1={7 + inner - fill} y2={7 + inner - fill} stroke={C.accent} strokeWidth="1.5" style={{ transition: 'all .6s ease' }} />
      <line x1="1" x2={w + 8} y1={ty} y2={ty} stroke={C.ink} strokeWidth="1" strokeDasharray="3 3" />
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
        <div className="absolute inset-y-0 bg-[#CFE5D8]" style={{ left: `${x(71.5)}%`, width: `${x(75) - x(71.5)}%` }} />
        <div className="absolute -top-1 h-4 w-px bg-ink-3" style={{ left: `${x(72)}%` }} />
        <div className={`absolute -top-1.5 h-5 w-1 rounded-sm ${bad ? 'bg-crit' : 'bg-ink'}`} style={{ left: `calc(${x(t)}% - 2px)`, transition: 'left .5s' }} />
      </div>
      <div className="mt-1 flex justify-between text-[11.5px] text-ink-3"><span>64 °C</span><span>72 °C minimum</span><span>76</span></div>
    </div>
  )
}

const Big = ({ v, unit, tone = 'text-ink' }) => (
  <div className={`num text-[28px] font-semibold leading-none tracking-tight ${tone}`}>{v}<span className="ml-1 text-[14px] font-normal text-ink-2">{unit}</span></div>
)
const Line = ({ children, tone = 'text-ink-2' }) => <div className={`text-[14px] leading-snug ${tone}`}>{children}</div>

/* ------------------------------------------------------------------ node shell */
function Shell({ data, children, handles }) {
  const t = TONE[data.status] || TONE.OK
  const ok = data.status === 'OK'
  return (
    <div className={`unit-card relative rounded-lg bg-surface ${ok ? 'outline-1' : 'outline-2'} outline -outline-offset-1 ${ok ? 'outline-line' : t.outline} ${data.status === 'CRITICAL' ? 'crit-outline' : ''}`}
      style={{ width: W }}>
      {handles}
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

function SiloNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('source', Position.Right, 'r')]}>
      <div className="flex items-center gap-3">
        <Vessel level={s.level_pct} />
        <div className="space-y-1.5">
          <Big v={fmt(s.level_pct)} unit="% full" tone={s.level_pct > 95 ? 'text-crit' : 'text-ink'} />
          <Line>{fmtInt(s.level_l)} L of 24,000</Line>
          <Line tone={s.temp_c > 6 ? 'text-crit font-semibold' : 'text-ink-2'}>Temperature {fmt(s.temp_c, 1)} °C</Line>
        </div>
      </div>
    </Shell>
  )
}

function SurgeNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Top, 't'), h('source', Position.Left, 'l')]}>
      <div className="flex items-center gap-3">
        <Vessel level={s.level_pct} />
        <div className="space-y-1.5">
          <Big v={fmt(s.level_pct)} unit="% full" tone={s.level_pct < 10 ? 'text-crit' : 'text-ink'} />
          <Line>{fmtInt(s.level_l)} L of 6,000</Line>
          <Line tone={data.tStarve !== null ? 'text-crit font-semibold' : 'text-ink-2'}>
            {data.tStarve !== null ? `Empties in ${fmt(data.tStarve)} min` : 'Holding steady'}</Line>
        </div>
      </div>
    </Shell>
  )
}

function PasteurizerNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Left, 'l'), h('source', Position.Right, 'r')]}>
      <div className="flex items-baseline justify-between">
        <Big v={fmt(s.flow_lpm)} unit="L/min" />
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
        <Big v={fmt(s.flow_lpm)} unit="L/min" />
      </div>
      <Line tone="text-[13px] text-ink-2">Green arc: legacy “OK” range</Line>
    </Shell>
  )
}

function FillerNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Right, 'r'), h('source', Position.Left, 'l')]}>
      <Big v={fmt(s.flow_lpm)} unit="L/min" tone={s.starved ? 'text-crit' : 'text-ink'} />
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
      <Big v={fmtInt(s.units_total)} unit="cartons" />
      <Line tone="mt-2 text-ink-2">{fmt(s.rate_lpm)} per min · cold room {fmt(s.cold_room_temp_c, 1)} °C</Line>
    </Shell>
  )
}

/* ------------------------------------------------------------------ hover / pinned card */
function InfoCard({ id, data, pinned, actions, onAct, onClose }) {
  const info = UNIT_INFO[id]
  const t = TONE[data.status] || TONE.OK
  return (
    <div className="nodrag nopan w-[330px] rounded-lg border border-line bg-surface p-4 text-left shadow-[0_12px_32px_-12px_rgba(27,42,51,0.35)]"
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
function Pipe(props) {
  const { id, data, markerEnd } = props
  const [path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 16, offset: 24 })
  const flow = data.flow || 0
  const moving = flow >= 1 && !data.blocked
  const color = data.blocked ? C.iso : flow < 1 ? C.steel : data.tone === 'CRITICAL' ? C.crit : data.tone === 'WARN' ? C.warn : C.accent
  return (
    <>
      <path d={path} fill="none" stroke={C.line} strokeWidth={13} strokeLinecap="round" />
      <path d={path} fill="none" stroke="#F4F1EA" strokeWidth={9} strokeLinecap="round" />
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={moving ? 'flow-dash' : ''}
        style={{ stroke: color, strokeWidth: moving ? 2 + Math.min(3.5, flow / 240) : 2, strokeDasharray: data.blocked ? '4 5' : undefined,
          animationDuration: `${clamp(320 / Math.max(flow, 1), 0.3, 3)}s` }} />
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

export default function PlantFloor({ frame, notify }) {
  const flow = useRef(null)
  const box = useRef(null)
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)
  useEffect(() => {                                    // re-fit whenever the canvas changes size
    if (!box.current) return undefined
    const ro = new ResizeObserver(() => flow.current?.fitView(FIT))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const act = useCallback(async (a) => {
    const r = await post(a.path, a.body)
    notify(r.message || (r.ok ? 'Done' : 'Failed'), r.ok !== false)
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
      badge[unit] = t.status === 'FAILED' ? { text: 'Pump failed', cls: 'bg-crit text-white' }
        : t.status === 'DISPATCHED' ? { text: 'Technician on the way', cls: 'bg-accent text-white' }
          : { text: `Pump fails in ${fmt(t.rul_min)} min`, cls: t.priority === 'CRITICAL' ? 'bg-crit text-white' : 'bg-warn text-ink' }
    }
    if (s.homogenizer.flushing) badge.homogenizer = { text: 'Self-cleaning', cls: 'bg-accent text-white' }
    const aSpoof = chk.pasteurizer_a.mismatch_pct > 12

    const view = Object.fromEntries(Object.keys(TYPE).map((id) => [id, {
      id, s: s[id], status: units[id].status, reason: units[id].reason, badge: badge[id],
      quarantined: id.startsWith('pasteurizer') && s[id].quarantined,
      spoof: id === 'pasteurizer_a' && aSpoof, physical: chk.pasteurizer_a.implied_flow,
      tStarve: frame.engine.pillar1.t_starve_min,
    }]))

    const tone = (n) => units[n]?.status
    const e = (src, sh, dst, th, f, extra = {}) => {
      const color = extra.blocked ? C.iso : f < 1 ? C.steel : tone(dst) === 'CRITICAL' ? C.crit : tone(dst) === 'WARN' ? C.warn : C.accent
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
    <section className="panel flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 px-5 py-3">
        <h2 className="text-[17px] font-semibold text-ink">Plant floor</h2>
        <span className="flex items-center gap-1.5 text-[13.5px] text-ink-2"><MousePointerClick size={15} className="text-accent" />Hover a unit to see what it does · click to pin it and act</span>
        <div className="ml-auto flex items-center gap-4 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-accent" />milk flowing</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-warn" />at risk</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-crit" />critical</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm border-t-2 border-dashed border-iso" />valve closed</span>
        </div>
      </header>
      <div ref={box} className="relative min-h-[420px] flex-1 bg-[#FBFAF6]">
        <NodeData.Provider value={view}>
          <Ui.Provider value={ui}>
            <ReactFlow nodes={NODES} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={FIT}
              onInit={(inst) => {
                flow.current = inst
                // node sizes change once webfonts finish loading: fit again then
                setTimeout(() => inst.fitView(FIT), 300)
                document.fonts?.ready.then(() => inst.fitView(FIT))
              }}
              onNodeMouseEnter={(_, n) => setHover(n.id)} onNodeMouseLeave={() => setHover(null)}
              onNodeClick={(_, n) => setPinned((p) => (p === n.id ? null : n.id))} onPaneClick={() => setPinned(null)}
              nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag={false}
              zoomOnDoubleClick={false} zoomOnPinch={false} preventScrolling={false} minZoom={0.3} style={{ background: 'transparent' }}>
              <Background color="#E2DCCD" bgColor="#FBFAF6" gap={22} size={1.2} />
            </ReactFlow>
          </Ui.Provider>
        </NodeData.Provider>
      </div>
    </section>
  )
}
