import { fmt, hijackAlert, LABEL, repairTicket, UNIT_INFO } from './twin'
import { chillerSpoofed, openTicket } from './actions'

/* The problem statement, told as it happens. Four chronological steps for whatever scenario is running:
     1 a hidden fault starts
     2 the engine notices it (while the legacy SCADA is still green)
     3 the engine traces it to a root cause and says where it will hurt next
     4 the response contains it (automatically, or after the operator acts)
   Every step is derived from the live frame (never from `truth`), so it can't run ahead of the engine. */

const since = (f, tick) => (tick === null || tick === undefined ? null : tick - f.scenario_tick)

function trace(f) {
  const s = f.stages
  const p1 = f.engine.pillar1
  const p3 = f.engine.pillar3
  const tickets = f.engine.pillar2.tickets
  switch (f.scenario) {
    case 'drift': {
      if (!p1.drift_detected && !p1.cascade.length) return null
      const hit = p1.cascade.find((x) => x.node === 'filler') || p1.cascade.find((x) => x.node === 'surge_tank') || p1.cascade[0]
      const where = hit ? `${LABEL[hit.node]} ${hit.eta_min === null ? 'at risk' : hit.eta_min < 1 ? 'hit now' : `hit in ${fmt(hit.eta_min)} min`}` : null
      return { root: 'Homogenizer valve fouling', text: where ? `Root cause: homogenizer valve fouling → ${where}` : 'Root cause: homogenizer valve fouling', bad: !!hit && hit.eta_min !== null && hit.eta_min < 1 }
    }
    case 'pump_wear': {
      const t = openTicket(tickets, 'homogenizer_pump_1') || openTicket(tickets, 'pasteurizer_a_pump')
        || tickets.find((x) => x.created_tick >= f.scenario_tick && x.status === 'RESOLVED')
      if (!t) return null
      return { root: t.label, bad: t.status === 'FAILED',
        text: t.status === 'FAILED' ? `${t.label} failed` : t.status === 'RESOLVED' ? `Traced to ${t.label}, repaired in time` : `${t.label} predicted to fail in ${fmt(t.rul_min)} min` }
    }
    case 'cyber_spike': {
      const a = p3.checks.pasteurizer_a
      const spoof = a.mismatch_pct > 12
      const alert = p3.alerts.find((x) => x.tick >= f.scenario_tick)
      if (!spoof && !alert && !s.pasteurizer_a.quarantined) return null
      return { root: 'Pasteurizer A PLC', text: spoof ? `PLC claims ${fmt(a.reported_flow)} L/min, motor current says ${fmt(a.implied_flow)}: the screen is lying`
        : alert ? `Rogue network traffic aimed at ${LABEL[alert.unit] || 'the PLCs'}` : 'Attack traced to Pasteurizer A', bad: spoof }
    }
    case 'chiller_spoof': {
      const c = p3.checks.chiller
      const alert = p3.alerts.find((x) => x.tick >= f.scenario_tick)
      if (!(c.diff_c > 1.5) && !alert) return null
      return { root: 'Silo thermometer', text: c.diff_c > 1.5 ? `Thermometer frozen at ${fmt(c.reported_c, 1)} °C, inlet sensors read ${fmt(c.inlet_c, 1)} °C` : 'Unauthorized write to the chiller controller', bad: c.diff_c > 1.5 }
    }
    case 'leak': {
      const t = f.scenario_target
      const miss = f.engine.pillar1.mass_balance?.[t]
      if (!repairTicket(f, t) && f.engine.units[t]?.status === 'OK') return null
      return { text: `Mass balance: about ${fmt(miss > 0 ? miss : null)} L/min of milk missing at the ${UNIT_INFO[t]?.name}`, bad: true }
    }
    case 'cyber_takeover': {
      const t = f.scenario_target
      const a = hijackAlert(f, t)
      if (!a) return null
      return { text: `Rogue writes from ${a.src} to the ${UNIT_INFO[t]?.name} PLC (${t === 'silo' || t === 'surge_tank' ? 'drain valve' : 'speed set-point'})`, bad: !f.engine.pillar3.blocked_ips.includes(a.src) }
    }
    case 'motor_trip': {
      const t = f.scenario_target
      if (!repairTicket(f, t) && f.engine.units[t]?.status === 'OK') return null
      const n = f.engine.pillar1.cascade.filter((x) => x.from === t).length
      return { text: `${UNIT_INFO[t]?.name} stopped${n ? `: ${n} stage${n > 1 ? 's' : ''} downstream lose flow` : ''}`, bad: false }
    }
    default:
      return null
  }
}

function respond(f, mode) {
  const s = f.stages
  const p2 = f.engine.pillar2
  switch (f.scenario) {
    case 'drift':
      if (s.filler.starved && !mode?.auto_sync) return { state: 'fail', text: 'Filler starving: nobody rebalanced the line' }
      if (mode?.auto_sync) return { state: f.engine.pillar1.drift_detected || s.homogenizer.flushing ? 'done' : 'wait', text: s.homogenizer.flushing ? 'Auto-Sync is cleaning the valve while pacing the line' : 'Auto-Sync is pacing intake and filler to protect output' }
      return { state: 'wait', text: 'Waiting for an operator: Auto-Sync is off' }
    case 'pump_wear': {
      const t = openTicket(p2.tickets, 'homogenizer_pump_1') || openTicket(p2.tickets, 'pasteurizer_a_pump')
      const done = p2.tickets.find((x) => x.created_tick >= f.scenario_tick && ['DISPATCHED', 'RESOLVED'].includes(x.status))
      if (t?.status === 'FAILED') return { state: 'fail', text: 'Pump broke down before anyone acted' }
      if (done) return { state: 'done', text: done.status === 'RESOLVED' ? 'Repaired before it failed' : 'Technician dispatched before it fails' }
      return { state: 'wait', text: t ? 'Dispatch a technician before the countdown ends' : 'Waiting for the prediction' }
    }
    case 'cyber_spike':
      if (s.pasteurizer_a.quarantined) return { state: 'done', text: 'Pasteurizer A isolated, attacker blocked, B carries 100 %' }
      if (f.kpi.unsafe_l > 0) return { state: mode?.auto_isolate ? 'wait' : 'fail', text: `${fmt(f.kpi.unsafe_l)} L of under-heated milk so far: isolate A` }
      return { state: 'wait', text: mode?.auto_isolate ? 'Auto-Isolate armed' : 'Auto-Isolate is off' }
    case 'chiller_spoof':
      if (f.chiller_failover) return { state: 'done', text: 'Backup chiller engaged, milk cooling back to 4 °C' }
      if (chillerSpoofed(f)) return { state: f.kpi.at_risk_l > 0 ? 'fail' : 'wait', text: f.kpi.at_risk_l > 0 ? `${fmt(f.kpi.at_risk_l)} L left the silo too warm: switch chillers` : 'Switch to the backup chiller' }
      return { state: 'wait', text: mode?.auto_isolate ? 'Auto-Isolate armed' : 'Auto-Isolate is off' }
    case 'leak':
    case 'motor_trip': {
      const tk = repairTicket(f, f.scenario_target)
      if (tk?.status === 'RESOLVED') return { state: 'done', text: 'Repaired, flow back to normal' }
      if (tk?.status === 'DISPATCHED') return { state: 'done', text: `Repair crew dispatched${tk.auto ? ' automatically' : ''}` }
      if (tk) return { state: 'wait', text: mode?.auto_sync ? 'Auto-Sync is sending the crew' : 'Send the repair crew (Auto-Sync is off)' }
      return { state: 'wait', text: '' }
    }
    case 'cyber_takeover': {
      const a = hijackAlert(f, f.scenario_target)
      if (a && f.engine.pillar3.blocked_ips.includes(a.src)) return { state: 'done', text: 'Attacker blocked, last good settings restored' }
      if (a) return { state: mode?.auto_isolate ? 'wait' : 'fail', text: mode?.auto_isolate ? 'Auto-Isolate is blocking the attacker' : 'Block the attacker: Auto-Isolate is off' }
      return { state: 'wait', text: mode?.auto_isolate ? 'Auto-Isolate armed' : 'Auto-Isolate is off' }
    }
    default:
      return { state: 'wait', text: '' }
  }
}

/** [{ n, title, detail, state: 'done' | 'active' | 'wait' | 'fail' | 'idle' }] + the legacy comparison line. */
export function mission(f, mode) {
  if (!f || !f.scenario) {
    return {
      live: false,
      legacy: null,
      steps: [
        { n: 1, title: 'A hidden fault starts', detail: 'Press 1-4 to inject one', state: 'idle' },
        { n: 2, title: 'Engine notices', detail: 'Legacy SCADA usually does not', state: 'idle' },
        { n: 3, title: 'Root cause traced', detail: 'and where it hits next', state: 'idle' },
        { n: 4, title: 'Contained', detail: 'without stopping the plant', state: 'idle' },
      ],
    }
  }
  const d = f.engine.detection
  const now = f.tick - f.scenario_tick
  const e = since(f, d.engine_first_tick)
  const l = since(f, d.legacy_first_tick)
  const tr = trace(f)
  const rs = respond(f, mode)
  const steps = [
    { n: 1, title: 'A hidden fault starts', detail: `T+0 · ${now} min ago`, state: 'done' },
    { n: 2, title: 'Engine notices', detail: e === null ? 'watching the cross-stage signals…' : `at +${e} min${l === null ? ' · legacy still green' : ''}`, state: e === null ? 'active' : 'done' },
    { n: 3, title: 'Root cause traced', detail: tr ? tr.text : 'following the dependency graph…', state: tr ? 'done' : e === null ? 'wait' : 'active', hot: !!tr?.bad },
    { n: 4, title: 'Contained', detail: rs.text, state: rs.state === 'done' ? 'done' : rs.state === 'fail' ? 'fail' : tr ? 'active' : 'wait' },
  ]
  const legacy = l === null
    ? { word: 'still ALL GREEN', mins: now, lead: e === null ? null : now - e, alarmed: false }
    : { word: `alarmed at +${l} min`, mins: l, lead: e === null ? null : l - e, alarmed: true }
  return { live: true, legacy, steps, contained: rs.state === 'done' }
}
