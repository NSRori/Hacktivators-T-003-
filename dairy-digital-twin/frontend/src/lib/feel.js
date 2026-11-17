import { useEffect, useRef, useState } from 'react'

/* "Feel": the haptics layer.
   - tiny synthesized UI sounds (Web Audio oscillators, no audio files),
   - phone vibration where the browser supports it,
   - a screen-edge glow and a short shake of the page on big events.
   Display/feedback only: it reads the frame and never talks to the engine. Sound waits for the first click
   or key press (browser autoplay rules), can be muted with M or the Controls menu, and the motion parts are
   switched off under prefers-reduced-motion. */

const KEY = 'ddt.muted.v1'
let muted = (() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })()
let ctx = null
let out = null
const subs = new Set()
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function audio() {
  if (muted) return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      out = ctx.createGain()
      out.gain.value = 0.55
      const comp = ctx.createDynamicsCompressor()     // overlapping sounds never clip
      out.connect(comp)
      comp.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx.state === 'running' ? ctx : null
  } catch {
    return null
  }
}

function blip({ f = 660, f2 = null, dur = 0.08, type = 'sine', gain = 0.1, at = 0, attack = 0.006 }) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + dur + 0.03)
}

const last = {}
const once = (k, ms, fn) => {                        // cooldown so a flickering status never machine-guns a sound
  const now = performance.now()
  if (last[k] && now - last[k] < ms) return
  last[k] = now
  fn()
}

export const sfx = {
  click: () => blip({ f: 1400, f2: 950, dur: 0.04, type: 'triangle', gain: 0.045 }),
  hover: () => once('hover', 90, () => blip({ f: 2100, dur: 0.025, type: 'sine', gain: 0.018 })),
  on: () => { blip({ f: 520, dur: 0.06, type: 'triangle', gain: 0.07 }); blip({ f: 780, dur: 0.09, type: 'triangle', gain: 0.07, at: 0.065 }) },
  off: () => { blip({ f: 700, dur: 0.06, type: 'triangle', gain: 0.06 }); blip({ f: 440, dur: 0.09, type: 'triangle', gain: 0.06, at: 0.065 }) },
  scenario: () => once('scn', 800, () => { blip({ f: 180, f2: 360, dur: 0.38, type: 'sawtooth', gain: 0.03 }); blip({ f: 270, f2: 540, dur: 0.38, gain: 0.07, at: 0.02 }) }),
  detect: () => once('detect', 4000, () => { blip({ f: 880, dur: 0.12, gain: 0.09 }); blip({ f: 1320, dur: 0.24, gain: 0.08, at: 0.11 }) }),
  warn: () => once('warn', 8000, () => { blip({ f: 520, dur: 0.15, type: 'square', gain: 0.025 }); blip({ f: 390, dur: 0.2, type: 'square', gain: 0.025, at: 0.17 }) }),
  crit: () => once('crit', 12000, () => { for (let i = 0; i < 3; i++) blip({ f: 210, f2: 165, dur: 0.17, type: 'sawtooth', gain: 0.045, at: i * 0.23 }) }),
  isolate: () => once('iso', 3000, () => { blip({ f: 320, f2: 80, dur: 0.5, gain: 0.16 }); blip({ f: 1800, f2: 420, dur: 0.22, type: 'triangle', gain: 0.035 }) }),
  ok: () => once('ok', 6000, () => [523.25, 659.25, 783.99].forEach((f, i) => blip({ f, dur: 0.3, gain: 0.07, at: i * 0.09 }))),
}

export function buzz(pattern) {
  try { if (!muted) navigator.vibrate?.(pattern) } catch { /* not supported */ }
}

export const isMuted = () => muted
export function setMuted(v) {
  muted = v
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private mode: still works for this visit */ }
  subs.forEach((fn) => fn(v))
  if (!v) sfx.on()
}
export function useMuted() {
  const [m, setM] = useState(muted)
  useEffect(() => { subs.add(setM); return () => { subs.delete(setM) } }, [])
  return m
}

/* ---------------------------------------------------------------- screen feedback */
let fxTimer = 0
export function flash(kind) {
  if (calm()) return
  const el = document.getElementById('fx')
  if (!el) return
  el.removeAttribute('data-kind')
  void el.offsetWidth                                  // restart the CSS animation
  el.setAttribute('data-kind', kind)
  clearTimeout(fxTimer)
  fxTimer = setTimeout(() => el.removeAttribute('data-kind'), kind === 'crit' ? 3300 : 1300)
}

export function shake() {
  if (calm()) return
  const el = document.querySelector('.app-main')
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
  setTimeout(() => el.classList.remove('shake'), 460)
}

/* ---------------------------------------------------------------- frame → feedback */
const RANK = { OK: 0, WATCH: 1, MAINT: 1, WARN: 2, QUARANTINED: 2, CRITICAL: 3 }
function snap(f) {
  const p3 = f.engine.pillar3
  const tickets = f.engine.pillar2.tickets
  return {
    tick: f.tick,
    scenario: f.scenario,
    overall: f.engine.overall,
    detected: f.engine.detection.engine_first_tick !== null && f.engine.detection.engine_first_tick !== undefined,
    contained: p3.isolated_units.length + p3.blocked_ips.length + (f.chiller_failover ? 1 : 0),
    dispatched: tickets.filter((t) => t.status === 'DISPATCHED').length,
    failed: tickets.filter((t) => t.status === 'FAILED').length,
  }
}

/** Watches the live frame and turns big moments into sound, vibration and an edge glow. */
export function useFeel(frame) {
  const prev = useRef(null)
  useEffect(() => {
    if (!frame) return
    const n = snap(frame)
    const p = prev.current
    prev.current = n
    if (!p || n.tick === p.tick) return               // first frame, or a StrictMode repeat
    if (n.scenario && n.scenario !== p.scenario) { sfx.scenario(); flash('info'); buzz(25); return }
    if (!n.scenario) return                            // reset: stay quiet
    if (n.contained > p.contained) { sfx.isolate(); flash('iso'); buzz([40, 40, 60]); shake(); return }
    if (n.failed > p.failed) { sfx.crit(); flash('crit'); buzz([90, 50, 90]); shake(); return }
    if (n.dispatched > p.dispatched) { sfx.on(); flash('ok'); return }
    if (n.detected && !p.detected) { sfx.detect(); buzz(30) }
    const up = (RANK[n.overall] ?? 0) - (RANK[p.overall] ?? 0)
    if (up > 0 && n.overall === 'CRITICAL') { sfx.crit(); flash('crit'); buzz([90, 50, 90]); shake() }
    else if (up > 0 && n.overall === 'WARN') sfx.warn()
    else if (n.overall === 'OK' && p.overall !== 'OK') { sfx.ok(); flash('ok') }
  }, [frame])
}

/** Click ticks for every button, and the first gesture unlocks audio. */
export function useClickFeel() {
  useEffect(() => {
    const down = (e) => {
      if (e.button !== 0) return
      if (e.target.closest?.('button, a, [role="button"]')) sfx.click()
      else audio()                                     // any first click unlocks sound
    }
    window.addEventListener('pointerdown', down, { passive: true })
    return () => window.removeEventListener('pointerdown', down)
  }, [])
}
