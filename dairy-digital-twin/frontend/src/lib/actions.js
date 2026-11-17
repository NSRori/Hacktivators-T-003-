import { fmt, hijackAlert, repairTicket, UNIT_INFO } from './twin'

export const openTicket = (tickets, unit) => tickets.find((t) => t.unit === unit && ['OPEN', 'DISPATCHED', 'FAILED'].includes(t.status))
export const chillerSpoofed = (f) => f.engine.pillar3.checks.chiller.diff_c > 1.5 && !f.chiller_failover
export const underAttack = (f, id) => !f.stages[id].quarantined && f.engine.units[id].status === 'CRITICAL'
  && f.engine.pillar3.alerts.some((a) => a.unit === id && f.tick - a.tick <= 15)

/** Buttons offered on a pinned unit card in the twin. */
export function actionsFor(id, f) {
  const acts = []
  const tickets = f.engine.pillar2.tickets
  if (id === 'pasteurizer_a' || id === 'pasteurizer_b') {
    acts.push(f.stages[id].quarantined
      ? { label: `Release ${UNIT_INFO[id].name}`, path: `/release/${id}`, kind: 'iso' }
      : { label: `Isolate ${UNIT_INFO[id].name}`, path: `/isolate/${id}`, kind: underAttack(f, id) ? 'crit' : 'secondary' })
  }
  const pump = id === 'homogenizer' ? 'homogenizer_pump_1' : id === 'pasteurizer_a' ? 'pasteurizer_a_pump' : null
  const pt = pump && openTicket(tickets, pump)
  if (pt && ['OPEN', 'FAILED'].includes(pt.status)) acts.push({ label: 'Dispatch technician', path: `/maintenance/${pt.id}/dispatch`, kind: 'primary' })
  const ft = id === 'homogenizer' && openTicket(tickets, 'homogenizer')
  if (ft && ft.status === 'OPEN') acts.push({ label: 'Run cleaning flush', path: `/maintenance/${ft.id}/dispatch`, kind: 'primary' })
  if (id === 'silo' && chillerSpoofed(f)) acts.push({ label: 'Switch to backup chiller', path: '/chiller/failover', kind: 'crit' })
  const rt = repairTicket(f, id)
  if (rt && ['OPEN', 'FAILED'].includes(rt.status)) acts.push({ label: 'Send repair crew', path: `/maintenance/${rt.id}/dispatch`, kind: 'primary' })
  if (!id.startsWith('pasteurizer') && hijackAlert(f, id) && !f.engine.pillar3.blocked_ips.includes(hijackAlert(f, id).src)) {
    acts.push({ label: 'Block the attacker', path: `/contain/${id}`, kind: 'crit' })
  }
  return acts
}

/** Plain-language "needs attention" list with one-click fixes. */
export function attention(f, mode) {
  const items = []
  const tickets = f.engine.pillar2.tickets
  for (const [pump, label] of [['homogenizer_pump_1', 'Homogenizer pump'], ['pasteurizer_a_pump', 'Pasteurizer A pump']]) {
    const tk = openTicket(tickets, pump)
    if (tk?.status === 'OPEN') items.push({ key: pump, status: tk.priority === 'CRITICAL' ? 'CRITICAL' : 'WARN', text: `${label} fails in about ${fmt(tk.rul_min)} min`, act: { label: 'Dispatch technician', path: `/maintenance/${tk.id}/dispatch` } })
    if (tk?.status === 'FAILED') items.push({ key: pump, status: 'CRITICAL', text: `${label} has broken down`, act: { label: 'Send repair crew', path: `/maintenance/${tk.id}/dispatch` } })
    if (tk?.status === 'DISPATCHED') items.push({ key: pump, status: 'MAINT', text: `Technician on the way to the ${label.toLowerCase()}`, act: null })
  }
  if (f.engine.pillar1.drift_detected && !mode?.auto_sync) {
    items.push({ key: 'sync', status: 'WARN', text: 'Homogenizer is clogging; the line will starve', act: { label: 'Turn on Auto-Sync', path: '/auto-sync', body: { enabled: true } } })
  }
  if (f.stages.homogenizer.flushing) items.push({ key: 'flush', status: 'MAINT', text: 'Homogenizer self-cleaning in progress', act: null })
  for (const id of ['pasteurizer_a', 'pasteurizer_b']) {
    if (f.stages[id].quarantined) items.push({ key: id, status: 'QUARANTINED', text: `${UNIT_INFO[id].name} isolated`, act: { label: 'Release', path: `/release/${id}` } })
    else if (underAttack(f, id)) items.push({ key: id, status: 'CRITICAL', text: `${UNIT_INFO[id].name} is under attack`, act: { label: 'Isolate it', path: `/isolate/${id}` } })
  }
  if (chillerSpoofed(f)) items.push({ key: 'chiller', status: 'CRITICAL', text: 'Silo thermometer is being faked', act: { label: 'Switch to backup chiller', path: '/chiller/failover' } })
  for (const id of Object.keys(UNIT_INFO)) {
    const rt = repairTicket(f, id)
    if (rt?.status === 'OPEN') items.push({ key: `r-${id}`, status: rt.priority === 'CRITICAL' ? 'CRITICAL' : 'WARN', text: `${UNIT_INFO[id].name} needs a repair`, act: { label: 'Send repair crew', path: `/maintenance/${rt.id}/dispatch` } })
    if (rt?.status === 'DISPATCHED') items.push({ key: `r-${id}`, status: 'MAINT', text: `Repair crew at the ${UNIT_INFO[id].name}`, act: null })
    const h = !id.startsWith('pasteurizer') && hijackAlert(f, id)
    if (h && !f.engine.pillar3.blocked_ips.includes(h.src)) items.push({ key: `h-${id}`, status: 'CRITICAL', text: `${UNIT_INFO[id].name} PLC hijacked`, act: { label: 'Block the attacker', path: `/contain/${id}` } })
  }
  return items
}

/** Event markers for chart annotations (spec §5.6), derived from the frame - never from `truth`. */
export function eventMarks(f) {
  if (!f || f.scenario_tick === null || f.scenario_tick === undefined) return []
  const d = f.engine.detection
  const marks = [{ x: f.scenario_tick, label: 'scenario starts', tone: 'ink' }]
  if (d.engine_first_tick !== null) marks.push({ x: d.engine_first_tick, label: 'engine flags it', tone: 'accent' })
  if (d.legacy_first_tick !== null) marks.push({ x: d.legacy_first_tick, label: 'legacy alarm', tone: 'legacy' })
  for (const t of f.engine.pillar2.tickets) {
    if (t.created_tick >= f.scenario_tick) marks.push({ x: t.created_tick, label: `${t.id} raised`, tone: 'warn' })
    if (t.dispatched_tick !== null && t.dispatched_tick >= f.scenario_tick) marks.push({ x: t.dispatched_tick, label: 'dispatched', tone: 'accent' })
  }
  const iso = [...f.log].reverse().find((e) => e.tick >= f.scenario_tick && /isolated: diversion valve CLOSED|backup chiller/.test(e.msg))
  if (iso) marks.push({ x: iso.tick, label: 'isolated', tone: 'iso' })
  const seen = new Set()
  return marks.filter((m) => (seen.has(m.label + m.x) ? false : seen.add(m.label + m.x)))
}
