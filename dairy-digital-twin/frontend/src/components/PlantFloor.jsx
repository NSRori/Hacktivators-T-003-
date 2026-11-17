import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Background, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, NodeToolbar, Position, ReactFlow } from '@xyflow/react'
import { CheckCircle2, Container, Droplets, Flame, MousePointerClick, Package, ShieldAlert, Snowflake, Sparkles, Truck, Waves, Wrench, X } from 'lucide-react'
import { fmt, fmtInt, LABEL, LEGACY_HEX, post, TONE, UNIT_INFO } from '../lib/twin'

const W = 272
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

/* ------------------------------------------------------------------ visuals */
function Tank({ id, level, target = 50 }) {
  const w = 58
  const h = 108
  const lv = clamp(level ?? 0, 0, 100)
  const color = lv > 95 || lv < 8 ? '#fb4469' : lv > 80 || lv < 20 ? '#fbbf24' : '#7dd3fc'
  const inner = h - 10
  const fill = (inner * lv) / 100
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <defs>
        <linearGradient id={`tank-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
        <clipPath id={`clip-${id}`}><rect x="5" y="5" width={w - 10} height={h - 10} rx="11" /></clipPath>
      </defs>
      <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="14" fill="#08101d" stroke="#2c3a52" strokeWidth="2" />
      <g clipPath={`url(#clip-${id})`}>
        <rect x="5" y={h - 5 - fill} width={w - 10} height={fill} fill={`url(#tank-${id})`} style={{ transition: 'all .6s ease' }} />
        <rect x="5" y={h - 5 - fill} width={w - 10} height="2" fill="#fff" opacity="0.5" style={{ transition: 'all .6s ease' }} />
      </g>
      <line x1="2" x2={w - 2} y1={5 + inner * (1 - target / 100)} y2={5 + inner * (1 - target / 100)} stroke="#e2e8f0" strokeOpacity="0.55" strokeDasharray="4 3" />
    </svg>
  )
}

function Gauge({ value, min = 1700, max = 2400, band = [1800, 2250] }) {
  const cx = 70
  const cy = 64
  const r = 54
  const ang = (v) => Math.PI * (1 - (clamp(v, min, max) - min) / (max - min))
  const pt = (a, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]
  const arc = (v1, v2) => {
    const [x1, y1] = pt(ang(v1))
    const [x2, y2] = pt(ang(v2))
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  const [nx, ny] = pt(ang(value), r - 12)
  const inBand = value >= band[0] && value <= band[1]
  return (
    <svg width="140" height="98" viewBox="0 0 140 98" className="shrink-0">
      <path d={arc(min, max)} stroke="#1b2639" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={arc(band[0], band[1])} stroke="#34d399" strokeOpacity="0.45" strokeWidth="10" fill="none" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={inBand ? '#f8fafc' : '#fb4469'} strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all .5s ease' }} />
      <circle cx={cx} cy={cy} r="5" fill="#f8fafc" />
      <text x={cx} y={cy + 24} textAnchor="middle" className="num" fontSize="16" fontWeight="700" fill={inBand ? '#f8fafc' : '#fda4af'}>
        {fmt(value)}<tspan fontSize="9" fill="#7d8ba6" fontWeight="500"> PSI</tspan></text>
    </svg>
  )
}

function TempBar({ t, active }) {
  const min = 64
  const max = 76
  const x = (v) => ((clamp(v, min, max) - min) / (max - min)) * 100
  const bad = active && t < 71.5
  return (
    <div className="relative h-2 w-full rounded-full bg-[#1b2639]">
      <div className="absolute inset-y-0 rounded-full bg-emerald-400/35" style={{ left: `${x(71.5)}%`, width: `${x(75) - x(71.5)}%` }} />
      <div className={`absolute -top-1 h-4 w-1 rounded-full ${bad ? 'bg-rose-400' : 'bg-white'}`} style={{ left: `calc(${x(t)}% - 2px)`, transition: 'left .5s' }} />
    </div>
  )
}

const Stat = ({ k, v, unit, warn }) => (
  <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
    <span className="text-slate-500">{k}</span>
    <span className={`num ${warn ? 'font-semibold text-rose-300' : 'text-slate-200'}`}>{v}{unit && <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>}</span>
  </div>
)
const Big = ({ v, unit, tone = 'text-white' }) => (
  <div className={`num text-[24px] font-bold leading-none ${tone}`}>{v}<span className="ml-1 text-[11px] font-medium text-slate-500">{unit}</span></div>
)

/* ------------------------------------------------------------------ node shell */
const ICON = { silo: Snowflake, pasteurizer_a: Flame, pasteurizer_b: Flame, homogenizer: Waves, surge_tank: Container, filler: Droplets, packaging: Package }

function Shell({ data, children, handles }) {
  const t = TONE[data.status] || TONE.OK
  const Icon = ICON[data.id]
  return (
    <div className={`unit-card relative rounded-2xl bg-[#0b1322] px-3.5 pb-3 pt-3 ring-1 ${t.ring} ${data.status === 'CRITICAL' ? 'pulse-crit' : ''}`}
      style={{ width: W, boxShadow: data.status === 'OK' ? '0 10px 30px -18px #000' : `0 0 28px -10px ${t.hex}` }}>
      {handles}
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${t.soft}`}><Icon size={15} className={t.text} /></span>
        <span className="text-[14px] font-semibold tracking-tight text-white">{LABEL[data.id]}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${t.soft} ${t.text}`}>{t.word}</span>
      </div>
      <div className="mt-2.5">{children}</div>
      {data.status !== 'OK' && (
        <div className={`mt-2 truncate border-t border-white/5 pt-1.5 text-[11px] ${t.text}`} title={data.reason}>{data.reason}</div>
      )}
      {data.badges.length > 0 && (
        <div className="absolute -top-3 right-3 flex gap-1">
          {data.badges.map((b) => (
            <span key={b.text} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-lg ${b.cls}`}>
              {b.icon === 'wrench' ? <Wrench size={10} /> : <Sparkles size={10} />}{b.text}
            </span>
          ))}
        </div>
      )}
      {data.quarantined && (
        <div className="pulse-shield absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#1d0624] ring-2 ring-fuchsia-500">
          <ShieldAlert size={30} className="text-fuchsia-300" />
          <div className="mt-1.5 text-[13px] font-extrabold tracking-[0.2em] text-fuchsia-100">QUARANTINED</div>
          <div className="text-[10.5px] text-fuchsia-300/80">diversion valve closed · attacker blocked</div>
        </div>
      )}
    </div>
  )
}

const h = (type, pos, id) => <Handle key={id + type} type={type} position={pos} id={id} />

function TankNode({ data }) {
  const s = data.s
  const isSilo = data.id === 'silo'
  return (
    <Shell data={data} handles={isSilo ? [h('source', Position.Right, 'r'), h('target', Position.Left, 'l')]
      : [h('target', Position.Top, 't'), h('source', Position.Left, 'l')]}>
      <div className="flex gap-3">
        <Tank id={data.id} level={s.level_pct} />
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <Big v={fmt(s.level_pct)} unit="% full" tone={s.level_pct > 95 || s.level_pct < 8 ? 'text-rose-300' : 'text-white'} />
            <div className="num mt-0.5 text-[10.5px] text-slate-500">{fmtInt(s.level_l)} / {isSilo ? '24,000' : '6,000'} L</div>
          </div>
          <div className="space-y-0.5">
            {isSilo ? <>
              <Stat k="Temp (PLC)" v={fmt(s.temp_c, 1)} unit="°C" warn={s.temp_c > 6} />
              <Stat k="Intake pump" v={fmt(s.intake_cmd_pct)} unit="%" />
              <Stat k="Out" v={fmt(s.flow_out_lpm)} unit="L/min" />
            </> : <>
              <Stat k="In" v={fmt(s.flow_in_lpm)} unit="L/min" />
              <Stat k="Out" v={fmt(s.flow_out_lpm)} unit="L/min" />
              <Stat k="Target" v="50" unit="%" />
            </>}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function PasteurizerNode({ data }) {
  const s = data.s
  const flowing = s.flow_lpm > 0
  return (
    <Shell data={data} handles={[h('target', Position.Left, 'l'), h('source', Position.Right, 'r')]}>
      <div className="flex items-end justify-between">
        <Big v={fmt(s.flow_lpm)} unit="L/min" />
        <div className="text-right">
          <div className="num text-[16px] font-semibold text-white">{fmt(s.temp_c, 1)}<span className="text-[10px] text-slate-500"> °C</span></div>
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500">PLC reading</div>
        </div>
      </div>
      {data.spoof && (
        <div className="mt-1.5 rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
          Motor current says <b className="num">{fmt(data.physical)}</b> L/min, so the PLC reading is fake
        </div>
      )}
      <div className="mt-2"><TempBar t={s.temp_c} active={flowing} /></div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat k="Hold" v={fmt(s.hold_time_s, 0)} unit="s" />
        <Stat k="Share" v={fmt(s.load_share_pct)} unit="%" />
        <Stat k="Drive" v={fmt(s.drive_current_a, 0)} unit="A" warn={data.spoof} />
      </div>
    </Shell>
  )
}

function HomogNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Left, 'l'), h('source', Position.Bottom, 'b')]}>
      <div className="flex items-center gap-2">
        <Gauge value={s.pressure_psi} />
        <div className="flex-1 space-y-0.5">
          <Big v={fmt(s.flow_lpm)} unit="L/min" />
          <div className="pt-1" />
          <Stat k="Valve" v={fmt(s.valve_position_pct)} unit="%" />
          <Stat k="Vib" v={fmt(data.vib, 2)} unit="mm/s" warn={data.vib > 4.5} />
        </div>
      </div>
      <div className="text-[10px] text-slate-500">green arc = legacy “OK” band</div>
    </Shell>
  )
}

function FillerNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Right, 'r'), h('source', Position.Left, 'l')]}>
      <div className="flex items-end justify-between">
        <Big v={fmt(s.flow_lpm)} unit="L/min" tone={s.starved ? 'text-rose-300' : 'text-white'} />
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${s.starved ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-400/10 text-emerald-300'}`}>
          {s.starved ? 'STARVED' : 'FILLING'}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b2639]">
        <div className="h-full rounded-full bg-sky-300/80" style={{ width: `${clamp(s.flow_lpm / 10, 0, 100)}%`, transition: 'width .5s' }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat k="Pace" v={fmt(s.pace_pct)} unit="%" />
        <Stat k="Demand" v={fmt(s.demand_lpm)} unit="L/min" />
      </div>
    </Shell>
  )
}

function PackagingNode({ data }) {
  const s = data.s
  return (
    <Shell data={data} handles={[h('target', Position.Right, 'r'), h('source', Position.Left, 'l')]}>
      <Big v={fmtInt(s.units_total)} unit="1 L cartons" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat k="Rate" v={fmt(s.rate_lpm)} unit="/min" />
        <Stat k="Cold room" v={fmt(s.cold_room_temp_c, 1)} unit="°C" />
      </div>
    </Shell>
  )
}

function Terminal({ data }) {
  return (
    <div className="unit-card flex w-[190px] items-center gap-2.5 rounded-full border border-dashed border-slate-600/70 bg-[#0a111e] px-3 py-2">
      {data.out ? <Handle type="source" position={Position.Right} id="r" /> : <Handle type="target" position={Position.Right} id="r" />}
      <Truck size={16} className={data.out ? 'text-sky-300' : 'text-slate-400'} />
      <div>
        <div className="text-[11.5px] font-semibold text-slate-200">{data.title}</div>
        <div className="num text-[10.5px] text-slate-500">{data.sub}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ hover / pinned info card */
const TONE_BTN = {
  sky: 'bg-sky-400 text-slate-950 hover:bg-sky-300',
  rose: 'bg-rose-500 text-white hover:bg-rose-400',
  fuchsia: 'bg-fuchsia-500 text-white hover:bg-fuchsia-400',
  amber: 'bg-amber-400 text-slate-950 hover:bg-amber-300',
  ghost: 'bg-white/5 text-slate-200 ring-1 ring-white/15 hover:bg-white/10',
}

function InfoCard({ id, data, pinned, actions, onAct, onClose }) {
  const info = UNIT_INFO[id]
  const t = data.status ? TONE[data.status] : null
  return (
    <div className="nodrag nopan w-[320px] rounded-2xl bg-[#0a1220] p-4 text-left shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/15"
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sky-300/80">{info.step}</div>
          <div className="text-[17px] font-bold leading-tight text-white">{info.name}</div>
        </div>
        {t && <span className={`ml-auto mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.soft} ${t.text}`}>{t.word}</span>}
        {pinned && (
          <button onClick={onClose} className={`${t ? '' : 'ml-auto'} grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white`} aria-label="Close">
            <X size={14} />
          </button>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{info.what}</p>
      <div className="mt-2.5 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12px] leading-snug text-slate-400">
        <span className="font-semibold text-slate-200">What the engine watches: </span>{info.watch}
      </div>
      {t && data.status !== 'OK' && <div className={`mt-2.5 text-[12.5px] font-medium ${t.text}`}>● Now: {data.reason}</div>}
      {t && data.status === 'OK' && <div className="mt-2.5 text-[12.5px] text-emerald-300">● Now: working normally</div>}
      {pinned && actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a.label} onClick={() => onAct(a)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${TONE_BTN[a.tone]}`}>{a.label}</button>
          ))}
        </div>
      )}
      <div className="mt-2.5 text-[11px] text-slate-500">
        {pinned ? 'Click anywhere on the floor to close' : `Click the unit to pin this card${actions.length ? ' and take action' : ''}`}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ edges */
function Pipe(props) {
  const { id, data, markerEnd } = props
  const [path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 18, offset: 26 })
  const flow = data.flow || 0
  const moving = flow >= 1 && !data.blocked
  const color = data.blocked ? '#d946ef' : flow < 1 ? '#334155'
    : data.tone === 'CRITICAL' ? '#fb4469' : data.tone === 'WARN' ? '#fbbf24' : '#a5e3ff'
  return (
    <>
      <path d={path} fill="none" stroke="#0e1828" strokeWidth={15} strokeLinecap="round" />
      <path d={path} fill="none" stroke="#1a273b" strokeWidth={10} strokeLinecap="round" />
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={moving ? 'flow-dash' : ''}
        style={{ stroke: color, strokeWidth: moving ? 2.5 + Math.min(3, flow / 260) : 2, strokeDasharray: data.blocked ? '3 6' : undefined,
          animationDuration: `${clamp(320 / Math.max(flow, 1), 0.3, 3)}s`, filter: moving ? `drop-shadow(0 0 5px ${color}99)` : undefined }} />
      {data.label !== false && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute rounded-md border border-white/10 bg-[#070c16]/95 px-1.5 py-0.5 text-[10.5px] font-semibold num"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: data.blocked ? '#f0abfc' : data.spoof ? '#fda4af' : '#c9d6e8' }}>
            {data.blocked ? 'CLOSED' : fmt(flow)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ wiring */
/* Live values reach the nodes through context, so the node objects handed to React Flow
   never change. React Flow drops a node's measured size whenever its object is replaced,
   and an unmeasured node is hidden - re-creating nodes every tick made them blink out. */
const NodeData = createContext({})
const Ui = createContext({ hover: null, pinned: null })
const TIP_POS = {
  intake: Position.Right, silo: Position.Right, pasteurizer_a: Position.Right, pasteurizer_b: Position.Right,
  homogenizer: Position.Left, surge_tank: Position.Left, filler: Position.Top, packaging: Position.Right, dispatch: Position.Right,
}
const live = (C) => function LiveNode({ id }) {
  const data = useContext(NodeData)[id]
  const ui = useContext(Ui)
  if (!data) return null
  return (
    <>
      <NodeToolbar isVisible={ui.hover === id || ui.pinned === id} position={TIP_POS[id]} offset={16}>
        <InfoCard id={id} data={data} pinned={ui.pinned === id} actions={ui.actionsFor(id)} onAct={ui.act} onClose={() => ui.setPinned(null)} />
      </NodeToolbar>
      <C data={data} />
    </>
  )
}
const nodeTypes = { tank: live(TankNode), past: live(PasteurizerNode), homog: live(HomogNode), filler: live(FillerNode),
  pack: live(PackagingNode), term: live(Terminal) }
const edgeTypes = { pipe: Pipe }

const POS = {
  intake: { x: -300, y: 150 }, silo: { x: 0, y: 90 },
  pasteurizer_a: { x: 420, y: 0 }, pasteurizer_b: { x: 420, y: 240 },
  homogenizer: { x: 840, y: 100 }, surge_tank: { x: 840, y: 450 },
  filler: { x: 420, y: 462 }, packaging: { x: 0, y: 468 }, dispatch: { x: -300, y: 498 },
}
const TYPE = { silo: 'tank', surge_tank: 'tank', pasteurizer_a: 'past', pasteurizer_b: 'past', homogenizer: 'homog', filler: 'filler', packaging: 'pack' }
const NODES = [...Object.keys(TYPE).map((id) => ({ id, type: TYPE[id], position: POS[id], draggable: false })),
  { id: 'intake', type: 'term', position: POS.intake, draggable: false },
  { id: 'dispatch', type: 'term', position: POS.dispatch, draggable: false }]
const FIT = { padding: { top: 0.06, bottom: 0.08, left: 0.03, right: 0.03 } }

const openTicket = (tickets, unit) => tickets.find((t) => t.unit === unit && ['OPEN', 'DISPATCHED', 'FAILED'].includes(t.status))
const chillerSpoofed = (f) => f.engine.pillar3.checks.chiller.diff_c > 1.5 && !f.chiller_failover
const underAttack = (f, id) => !f.stages[id].quarantined && f.engine.units[id].status === 'CRITICAL'
  && f.engine.pillar3.alerts.some((a) => a.unit === id && f.tick - a.tick <= 15)

/** Buttons offered on a pinned unit card. */
function actionsFor(id, f) {
  const acts = []
  const tickets = f.engine.pillar2.tickets
  if (id === 'pasteurizer_a' || id === 'pasteurizer_b') {
    acts.push(f.stages[id].quarantined
      ? { label: `Release ${UNIT_INFO[id].name}`, path: `/release/${id}`, tone: 'fuchsia' }
      : { label: `Isolate ${UNIT_INFO[id].name}`, path: `/isolate/${id}`, tone: underAttack(f, id) ? 'rose' : 'ghost' })
  }
  const pump = id === 'homogenizer' ? 'homogenizer_pump_1' : id === 'pasteurizer_a' ? 'pasteurizer_a_pump' : null
  const pt = pump && openTicket(tickets, pump)
  if (pt && ['OPEN', 'FAILED'].includes(pt.status)) acts.push({ label: 'Dispatch technician', path: `/maintenance/${pt.id}/dispatch`, tone: 'sky' })
  const ft = id === 'homogenizer' && openTicket(tickets, 'homogenizer')
  if (ft && ft.status === 'OPEN') acts.push({ label: 'Run cleaning flush', path: `/maintenance/${ft.id}/dispatch`, tone: 'sky' })
  if (id === 'silo' && chillerSpoofed(f)) acts.push({ label: 'Switch to backup chiller', path: '/chiller/failover', tone: 'rose' })
  return acts
}

/** Plain-language "needs attention" list with one-click fixes. */
function attention(f, mode) {
  const items = []
  const tickets = f.engine.pillar2.tickets
  for (const [pump, label] of [['homogenizer_pump_1', 'Homogenizer pump'], ['pasteurizer_a_pump', 'Pasteurizer A pump']]) {
    const tk = openTicket(tickets, pump)
    if (tk?.status === 'OPEN') items.push({ key: pump, tone: tk.priority === 'CRITICAL' ? 'rose' : 'amber', text: `${label} is wearing out, about ${fmt(tk.rul_min)} min before it fails`, act: { label: 'Dispatch technician', path: `/maintenance/${tk.id}/dispatch` } })
    if (tk?.status === 'FAILED') items.push({ key: pump, tone: 'rose', text: `${label} has broken down`, act: { label: 'Send repair crew', path: `/maintenance/${tk.id}/dispatch` } })
    if (tk?.status === 'DISPATCHED') items.push({ key: pump, tone: 'sky', text: `Technician on the way to the ${label.toLowerCase()}`, act: null })
  }
  if (f.engine.pillar1.drift_detected && !mode?.auto_sync) {
    items.push({ key: 'sync', tone: 'amber', text: 'Homogenizer is slowly clogging and the line will starve soon', act: { label: 'Turn on Auto-Sync', path: '/auto-sync', body: { enabled: true } } })
  }
  if (f.stages.homogenizer.flushing) items.push({ key: 'flush', tone: 'sky', text: 'Homogenizer is self-cleaning (short flush), and the surge tank keeps the filler running', act: null })
  for (const id of ['pasteurizer_a', 'pasteurizer_b']) {
    if (f.stages[id].quarantined) items.push({ key: id, tone: 'fuchsia', text: `${UNIT_INFO[id].name} isolated after a cyber attack, its twin carries 100 % of the milk`, act: { label: 'Release', path: `/release/${id}` } })
    else if (underAttack(f, id)) items.push({ key: id, tone: 'rose', text: `${UNIT_INFO[id].name} is under cyber attack and its readings are fake`, act: { label: `Isolate ${UNIT_INFO[id].name}`, path: `/isolate/${id}` } })
  }
  if (chillerSpoofed(f)) items.push({ key: 'chiller', tone: 'rose', text: 'Silo temperature sensor is faked while the milk warms up', act: { label: 'Switch to backup chiller', path: '/chiller/failover' } })
  return items
}

const PILL = {
  rose: 'bg-rose-500/12 text-rose-100 ring-rose-500/40', amber: 'bg-amber-400/10 text-amber-100 ring-amber-400/40',
  sky: 'bg-sky-400/10 text-sky-100 ring-sky-400/30', fuchsia: 'bg-fuchsia-500/12 text-fuchsia-100 ring-fuchsia-500/40',
}

/* ------------------------------------------------------------------ component */
export default function PlantFloor({ frame, mode, notify }) {
  const flow = useRef(null)
  const box = useRef(null)
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)
  useEffect(() => {                                    // re-fit the plant whenever the canvas changes size
    if (!box.current) return undefined
    const ro = new ResizeObserver(() => flow.current?.fitView(FIT))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const act = useCallback(async (a) => {
    const r = await post(a.path, a.body)
    notify(r.message || (r.ok ? 'done' : 'failed'), r.ok !== false)
  }, [notify])

  const { view, edges } = useMemo(() => {
    const s = frame.stages
    const units = frame.engine.units
    const tickets = frame.engine.pillar2.tickets
    const chk = frame.engine.pillar3.checks
    const badges = Object.fromEntries(Object.keys(TYPE).map((k) => [k, []]))
    for (const [pump, unit] of [['homogenizer_pump_1', 'homogenizer'], ['pasteurizer_a_pump', 'pasteurizer_a']]) {
      const t = openTicket(tickets, pump)
      if (!t) continue
      const cls = t.status === 'FAILED' ? 'bg-rose-600 text-white' : t.status === 'DISPATCHED' ? 'bg-sky-400 text-slate-950'
        : t.priority === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
      badges[unit].push({ text: t.status === 'FAILED' ? 'PUMP FAILED' : t.status === 'DISPATCHED' ? 'TECH EN ROUTE' : `FAILS IN ${fmt(t.rul_min)} MIN`, cls, icon: 'wrench' })
    }
    if (s.homogenizer.flushing) badges.homogenizer.push({ text: 'SELF-CLEANING', cls: 'bg-sky-400 text-slate-950', icon: 'flush' })
    const aSpoof = chk.pasteurizer_a.mismatch_pct > 12

    const view = Object.fromEntries(Object.keys(TYPE).map((id) => [id, {
      id, s: s[id], status: units[id].status, reason: units[id].reason, badges: badges[id],
      quarantined: id.startsWith('pasteurizer') && s[id].quarantined,
      spoof: id === 'pasteurizer_a' && aSpoof, physical: chk.pasteurizer_a.implied_flow,
      vib: frame.pumps.homogenizer_pump_1.vibration_mms,
    }]))
    view.intake = { out: true, title: 'Raw milk tankers', sub: `${fmt(s.silo.intake_lpm)} L/min in` }
    view.dispatch = { out: false, title: 'Cold-chain dispatch', sub: `${fmt(s.packaging.rate_lpm)} cartons/min` }

    const tone = (n) => units[n]?.status
    const e = (src, sh, dst, th, f, extra = {}) => {
      const color = extra.blocked ? '#d946ef' : f < 1 ? '#334155' : tone(dst) === 'CRITICAL' ? '#fb4469' : tone(dst) === 'WARN' ? '#fbbf24' : '#a5e3ff'
      return { id: `${src}-${dst}`, source: src, sourceHandle: sh, target: dst, targetHandle: th, type: 'pipe',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15, markerUnits: 'userSpaceOnUse' }, data: { flow: f, tone: tone(dst), ...extra } }
    }
    const pa = s.pasteurizer_a
    const pb = s.pasteurizer_b
    const aFlow = chk.pasteurizer_a.implied_flow
    const edges = [
      e('intake', 'r', 'silo', 'l', s.silo.intake_lpm, { label: false }),
      e('silo', 'r', 'pasteurizer_a', 'l', aFlow, { blocked: pa.quarantined, spoof: aSpoof }),
      e('silo', 'r', 'pasteurizer_b', 'l', pb.flow_lpm, { blocked: pb.quarantined }),
      e('pasteurizer_a', 'r', 'homogenizer', 'l', aFlow, { blocked: pa.quarantined, spoof: aSpoof }),
      e('pasteurizer_b', 'r', 'homogenizer', 'l', pb.flow_lpm, { blocked: pb.quarantined }),
      e('homogenizer', 'b', 'surge_tank', 't', s.surge_tank.flow_in_lpm),
      e('surge_tank', 'l', 'filler', 'r', s.filler.flow_lpm),
      e('filler', 'l', 'packaging', 'r', s.packaging.rate_lpm),
      e('packaging', 'l', 'dispatch', 'r', s.packaging.rate_lpm, { label: false }),
    ]
    return { view, edges }
  }, [frame])

  const ui = useMemo(() => ({ hover, pinned, setPinned, act, actionsFor: (id) => actionsFor(id, frame) }), [hover, pinned, act, frame])
  const todo = attention(frame, mode)
  const legacy = frame.legacy.overall
  const eng = frame.engine.overall
  const cascade = frame.engine.pillar1.cascade

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
        <div>
          <div className="text-[19px] font-bold tracking-tight text-white">Digital twin · live dairy line</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate-400">
            <MousePointerClick size={13} className="text-sky-300" />Hover any unit to see what it does · click it to pin details and act
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11.5px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-sky-200" />milk flowing</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-amber-300" />at risk</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-rose-400" />critical</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-fuchsia-500" />isolated</span>
        </div>
      </div>

      {/* needs-attention bar */}
      <div className="mt-3 flex min-h-[44px] flex-wrap items-center gap-2 border-y border-white/5 bg-white/[0.015] px-5 py-2">
        {todo.length === 0 ? (
          <span className="flex items-center gap-2 text-[13px] text-emerald-300"><CheckCircle2 size={16} />Everything is running smoothly. No action needed.</span>
        ) : (
          <>
            <span className="label mr-1">Needs attention</span>
            {todo.map((t) => (
              <span key={t.key} className={`rise flex items-center gap-2 rounded-xl py-1 pl-3 pr-1 text-[12.5px] ring-1 ${PILL[t.tone]}`}>
                {t.text}
                {t.act ? <button onClick={() => act(t.act)} className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${TONE_BTN[t.tone]}`}>{t.act.label}</button>
                  : <span className="pr-2" />}
              </span>
            ))}
          </>
        )}
      </div>

      <div ref={box} className="relative min-h-[460px] flex-1">
        {/* verdict ribbon: same plant, two monitors */}
        <div className="pointer-events-none absolute left-4 top-3 z-10 flex flex-col gap-1.5">
          <div className="hmi flex items-center gap-2 px-2.5 py-1 text-[11.5px]">
            <span className="text-[#7f8f7f]">LEGACY SCADA</span>
            <span className="hmi-glow font-bold tracking-wider" style={{ color: LEGACY_HEX[legacy] }}>■ {legacy === 'GREEN' ? 'ALL GREEN' : legacy === 'AMBER' ? 'WARNING' : 'ALARM'}</span>
          </div>
          <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11.5px] ring-1 ${TONE[eng].soft} ${TONE[eng].ring}`}>
            <span className="text-slate-400">THREE-PILLAR ENGINE</span>
            <span className={`font-bold tracking-wide ${TONE[eng].text}`}>{eng === 'OK' ? 'BALANCED' : eng}</span>
          </div>
        </div>
        <NodeData.Provider value={view}>
          <Ui.Provider value={ui}>
            <ReactFlow nodes={NODES} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={FIT}
              onInit={(inst) => { flow.current = inst }}
              onNodeMouseEnter={(_, n) => setHover(n.id)} onNodeMouseLeave={() => setHover(null)}
              onNodeClick={(_, n) => setPinned((p) => (p === n.id ? null : n.id))} onPaneClick={() => setPinned(null)}
              nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag={false}
              zoomOnDoubleClick={false} zoomOnPinch={false} preventScrolling={false} minZoom={0.3} style={{ background: 'transparent' }}>
              <Background color="#1a2436" gap={24} size={1.2} />
            </ReactFlow>
          </Ui.Provider>
        </NodeData.Provider>
      </div>

      <div className="scroll-thin flex h-[46px] shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-white/5 px-5 text-[12px]">
        <span className="label mr-1 shrink-0">Knock-on effects</span>
        {cascade.length === 0 ? <span className="text-slate-500">None. A problem in one unit would show here, with when it reaches the next units.</span>
          : cascade.map((c) => (
            <span key={c.from + c.node} className="rounded-lg bg-amber-400/10 px-2.5 py-1 text-amber-100 ring-1 ring-amber-400/30">
              {LABEL[c.from]} → <b>{LABEL[c.node]}</b> {c.effect}
              {c.eta_min === null ? <span className="text-amber-200/60"> · at risk</span>
                : c.eta_min < 1 ? <b className="ml-1 text-rose-300">NOW</b> : <> in <b className="num">{fmt(c.eta_min)}</b> min</>}
            </span>
          ))}
      </div>
    </div>
  )
}
