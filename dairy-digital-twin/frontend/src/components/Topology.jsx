import { useMemo } from 'react'
import { BaseEdge, Background, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow } from '@xyflow/react'
import { Container, Droplets, Flame, Package, ShieldAlert, ShieldCheck, Snowflake, Sparkles, Truck, Wrench, Waves } from 'lucide-react'
import { ENGINE_STYLE, fmt, fmtInt, LABEL, post } from '../lib/twin'

const POS = {
  silo: { x: 0, y: 130 }, pasteurizer_a: { x: 275, y: 0 }, pasteurizer_b: { x: 275, y: 262 },
  homogenizer: { x: 550, y: 130 }, surge_tank: { x: 825, y: 130 }, filler: { x: 1100, y: 130 }, packaging: { x: 1375, y: 130 },
}
const ICON = { silo: Snowflake, pasteurizer_a: Flame, pasteurizer_b: Flame, homogenizer: Waves, surge_tank: Container, filler: Droplets, packaging: Truck }
const handleStyle = { background: '#475569', border: 0, width: 6, height: 6 }

function StageNode({ data }) {
  const st = ENGINE_STYLE[data.status] || ENGINE_STYLE.OK
  const Icon = ICON[data.id] || Package
  return (
    <div className={`relative w-[210px] rounded-xl border-2 ${st.ring} bg-slate-900/95 px-3 py-2.5 shadow-xl ${data.status === 'CRITICAL' ? 'pulse-crit' : ''}`}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-center gap-2">
        <Icon size={15} className={st.text} />
        <div className="text-[12.5px] font-semibold text-slate-100 leading-tight">{LABEL[data.id]}</div>
        <span className={`ml-auto rounded px-1.5 py-px text-[9px] font-bold tracking-wide ${st.pill}`}>{data.status}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
        {data.metrics.map(([k, v, warn]) => (
          <div key={k} className="flex justify-between text-[10.5px]">
            <span className="text-slate-500">{k}</span>
            <span className={`num ${warn ? 'text-red-300 font-semibold' : 'text-slate-200'}`}>{v}</span>
          </div>
        ))}
      </div>
      {data.level !== undefined && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800">
          <div className={`h-full ${data.level > 90 || data.level < 10 ? 'bg-red-400' : data.level > 70 || data.level < 30 ? 'bg-amber-300' : 'bg-sky-300'}`}
            style={{ width: `${Math.min(100, Math.max(0, data.level))}%`, transition: 'width .4s' }} />
        </div>
      )}
      <div className="mt-1 min-h-[14px] truncate text-[10px] text-slate-400" title={data.reason}>{data.status === 'OK' ? '' : data.reason}</div>
      {data.badges.length > 0 && (
        <div className="absolute -top-3 right-2 flex gap-1">
          {data.badges.map((b) => (
            <span key={b.text} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${b.cls}`}>
              {b.icon === 'wrench' ? <Wrench size={10} /> : <Sparkles size={10} />}{b.text}
            </span>
          ))}
        </div>
      )}
      {data.quarantined && (
        <div className="pulse-shield absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-fuchsia-500 bg-fuchsia-950">
          <ShieldAlert size={28} className="text-fuchsia-300" />
          <div className="mt-1 text-[12px] font-bold tracking-widest text-fuchsia-200">QUARANTINED</div>
          <div className="text-[10px] text-fuchsia-300/80">diversion valve closed · traffic blocked</div>
        </div>
      )}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}

function FlowEdge(props) {
  const { id, data } = props
  const [path, lx, ly] = getBezierPath(props)
  const flow = data.flow || 0
  const color = data.blocked ? '#d946ef' : flow < 1 ? '#334155'
    : data.tone === 'CRITICAL' ? '#f87171' : data.tone === 'WARN' ? '#fbbf24' : '#bae6fd'
  const moving = flow >= 1 && !data.blocked
  return (
    <>
      <BaseEdge id={id} path={path} className={moving ? 'flow-dash' : ''}
        style={{ stroke: color, strokeWidth: data.blocked ? 2 : 1.5 + Math.min(5, flow / 150), opacity: moving || data.blocked ? 0.95 : 0.5,
          strokeDasharray: data.blocked ? '4 5' : undefined, animationDuration: `${Math.min(3, Math.max(0.35, 300 / Math.max(flow, 1)))}s` }} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan absolute rounded border border-slate-700 bg-slate-950/90 px-1.5 py-0.5 text-[10px] num"
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: data.blocked ? '#f0abfc' : data.spoof ? '#fca5a5' : '#cbd5e1' }}>
          {data.blocked ? 'VALVE CLOSED' : <>{fmt(flow)}<span className="text-slate-500"> L/m</span></>}
          {data.spoof && !data.blocked && <div className="text-[9px] text-red-300/80">PLC says {fmt(data.reported)}</div>}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { stage: StageNode }
const edgeTypes = { flow: FlowEdge }

function openTicket(tickets, unit) {
  return tickets.find((t) => t.unit === unit && ['OPEN', 'DISPATCHED', 'FAILED'].includes(t.status))
}

function IsolationControls({ frame, notify }) {
  const call = async (path) => {
    const r = await post(path)
    notify(r.message, r.ok)
  }
  const q = frame.quarantined
  const btn = 'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold'
  return (
    <div className="flex gap-1.5">
      {['pasteurizer_a', 'pasteurizer_b'].map((u) => (q.includes(u)
        ? <button key={u} onClick={() => call(`/release/${u}`)} className={`${btn} border-fuchsia-500/70 bg-fuchsia-500/20 text-fuchsia-200`}>
            <ShieldCheck size={12} />Release {LABEL[u]}</button>
        : <button key={u} onClick={() => call(`/isolate/${u}`)} title="Manual surgical isolation (NetworkX path check)"
            className={`${btn} border-slate-700 bg-slate-900 text-slate-400 hover:border-fuchsia-500/60 hover:text-fuchsia-200`}>
            <ShieldAlert size={12} />Isolate {LABEL[u]}</button>))}
    </div>
  )
}

export default function Topology({ frame, notify }) {
  const { nodes, edges } = useMemo(() => {
    const s = frame.stages
    const units = frame.engine.units
    const tickets = frame.engine.pillar2.tickets
    const chk = frame.engine.pillar3.checks
    const pumps = frame.pumps
    const badges = { silo: [], pasteurizer_a: [], pasteurizer_b: [], homogenizer: [], surge_tank: [], filler: [], packaging: [] }
    for (const [pump, unit] of [['homogenizer_pump_1', 'homogenizer'], ['pasteurizer_a_pump', 'pasteurizer_a']]) {
      const t = openTicket(tickets, pump)
      if (t) {
        const cls = t.status === 'FAILED' ? 'bg-red-600 text-white' : t.status === 'DISPATCHED' ? 'bg-sky-500 text-slate-950'
          : t.priority === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'
        const text = t.status === 'FAILED' ? 'FAILED' : t.status === 'DISPATCHED' ? 'TECH EN ROUTE' : `RUL ${fmt(t.rul_min)}m`
        badges[unit].push({ text, cls, icon: 'wrench' })
      }
    }
    if (s.homogenizer.flushing) badges.homogenizer.push({ text: 'CIP FLUSH', cls: 'bg-sky-400 text-slate-950', icon: 'flush' })
    const fT = openTicket(tickets, 'homogenizer')
    if (fT && fT.status === 'OPEN') badges.homogenizer.push({ text: `FOULING ${fmt(frame.engine.pillar1.est_fouling_pct)}%`, cls: 'bg-amber-400 text-slate-950', icon: 'flush' })

    const pa = s.pasteurizer_a
    const pb = s.pasteurizer_b
    const aPhys = chk.pasteurizer_a.implied_flow
    const aSpoof = chk.pasteurizer_a.mismatch_pct > 12
    const metrics = {
      silo: [['Level', `${fmt(s.silo.level_pct)}%`, s.silo.level_pct > 95], ['Temp', `${fmt(s.silo.temp_c, 1)}°C`, s.silo.temp_c > 6],
        ['Intake', `${fmt(s.silo.intake_lpm)}`], ['Pump', `${fmt(s.silo.intake_cmd_pct)}%`]],
      pasteurizer_a: [['Flow', `${fmt(pa.flow_lpm)}`], ['Temp', `${fmt(pa.temp_c, 1)}°C`, pa.flow_lpm > 0 && pa.temp_c < 71.5],
        ['Hold', `${fmt(pa.hold_time_s, 1)}s`], ['Share', `${fmt(pa.load_share_pct)}%`],
        ['Drive', `${fmt(pa.drive_current_a, 1)}A`, aSpoof], ['Vib', `${fmt(pumps.pasteurizer_a_pump.vibration_mms, 2)}`, pumps.pasteurizer_a_pump.vibration_mms > 4.5]],
      pasteurizer_b: [['Flow', `${fmt(pb.flow_lpm)}`], ['Temp', `${fmt(pb.temp_c, 1)}°C`],
        ['Hold', `${fmt(pb.hold_time_s, 1)}s`], ['Share', `${fmt(pb.load_share_pct)}%`]],
      homogenizer: [['Flow', `${fmt(s.homogenizer.flow_lpm)}`], ['PSI', `${fmt(s.homogenizer.pressure_psi)}`],
        ['Valve', `${fmt(s.homogenizer.valve_position_pct)}%`], ['Vib', `${fmt(pumps.homogenizer_pump_1.vibration_mms, 2)}`, pumps.homogenizer_pump_1.vibration_mms > 4.5]],
      surge_tank: [['Level', `${fmt(s.surge_tank.level_pct)}%`, s.surge_tank.level_pct < 10], ['Litres', fmtInt(s.surge_tank.level_l)],
        ['In', `${fmt(s.surge_tank.flow_in_lpm)}`], ['Out', `${fmt(s.surge_tank.flow_out_lpm)}`]],
      filler: [['Flow', `${fmt(s.filler.flow_lpm)}`, s.filler.starved], ['Pace', `${fmt(s.filler.pace_pct)}%`],
        ['Demand', `${fmt(s.filler.demand_lpm)}`], ['State', s.filler.starved ? 'STARVED' : 'RUN', s.filler.starved]],
      packaging: [['Rate', `${fmt(s.packaging.rate_lpm)}`], ['Cold rm', `${fmt(s.packaging.cold_room_temp_c, 1)}°C`],
        ['Cartons', fmtInt(s.packaging.units_total)]],
    }
    const nodes = Object.keys(POS).map((id) => ({
      id, type: 'stage', position: POS[id], draggable: false,
      data: { id, status: units[id].status, reason: units[id].reason, metrics: metrics[id], badges: badges[id],
        level: id === 'silo' ? s.silo.level_pct : id === 'surge_tank' ? s.surge_tank.level_pct : undefined,
        quarantined: id.startsWith('pasteurizer') && s[id].quarantined },
    }))
    const tone = (n) => units[n].status
    const e = (src, dst, flow, extra = {}) => ({ id: `${src}-${dst}`, source: src, target: dst, type: 'flow', data: { flow, tone: tone(dst), ...extra } })
    const edges = [
      e('silo', 'pasteurizer_a', aPhys, { blocked: pa.quarantined, spoof: aSpoof, reported: pa.flow_lpm, tone: tone('pasteurizer_a') }),
      e('silo', 'pasteurizer_b', pb.flow_lpm, { blocked: pb.quarantined }),
      e('pasteurizer_a', 'homogenizer', aPhys, { blocked: pa.quarantined, spoof: aSpoof, reported: pa.flow_lpm, tone: tone('pasteurizer_a') }),
      e('pasteurizer_b', 'homogenizer', pb.flow_lpm, { blocked: pb.quarantined }),
      e('homogenizer', 'surge_tank', s.surge_tank.flow_in_lpm),
      e('surge_tank', 'filler', s.filler.flow_lpm),
      e('filler', 'packaging', s.packaging.rate_lpm),
    ]
    return { nodes, edges }
  }, [frame])

  const cascade = frame.engine.pillar1.cascade
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="panel-title">Live Dairy Line · Digital Twin Topology</div>
          <IsolationControls frame={frame} notify={notify} />
        </div>
        <div className="flex gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-sky-200" />milk flow</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-amber-300" />at risk</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-red-400" />critical</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-fuchsia-500" />isolated</span>
        </div>
      </div>
      <div className="h-[390px]">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.08 }}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag={false}
          zoomOnDoubleClick={false} preventScrolling={false} minZoom={0.3} style={{ background: 'transparent' }}>
          <Background color="#1e293b" gap={22} size={1} />
        </ReactFlow>
      </div>
      <div className="flex min-h-[38px] flex-wrap items-center gap-2 border-t border-slate-800 px-4 py-2 text-[11px]">
        <span className="panel-title">Causal cascade</span>
        {cascade.length === 0 ? <span className="text-slate-500">No propagating disruption detected - all stages balanced.</span>
          : cascade.map((c) => (
            <span key={c.from + c.node} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              {LABEL[c.from]} → <b>{LABEL[c.node]}</b> {c.effect}
              {c.eta_min === null ? <span className="text-amber-200/60"> · at risk</span>
                : c.eta_min < 1 ? <b className="ml-1 text-red-300">NOW</b> : <> in <span className="num">{fmt(c.eta_min)}</span> min</>}
            </span>
          ))}
      </div>
    </div>
  )
}
