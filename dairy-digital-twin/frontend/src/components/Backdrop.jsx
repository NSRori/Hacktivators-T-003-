import { useEffect, useRef } from 'react'

/* The page background: a slow sky-blue / periwinkle / white gradient that notices the visitor.
   Moving the mouse lights up the dot grid under the cursor and leans the colour fields towards it;
   clicking empty background sends out a ripple. All of it sits behind the content (z-index -1),
   updates CSS variables from one requestAnimationFrame loop that sleeps when the mouse is still,
   and calms down under prefers-reduced-motion. */
const SKIP = '.panel, button, a, input, select, textarea, label, header, nav, [role="dialog"], .dock, .react-flow'

export default function Backdrop() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let tx = window.innerWidth * 0.5
    let ty = window.innerHeight * 0.3
    let x = tx
    let y = ty
    let on = 0
    let onT = 0
    let raf = 0
    const set = () => {
      el.style.setProperty('--mx', `${x.toFixed(1)}px`)
      el.style.setProperty('--my', `${y.toFixed(1)}px`)
      el.style.setProperty('--px', (x / window.innerWidth - 0.5).toFixed(4))
      el.style.setProperty('--py', (y / window.innerHeight - 0.5).toFixed(4))
      el.style.setProperty('--on', on.toFixed(3))
    }
    const tick = () => {
      const k = calm ? 1 : 0.16
      x += (tx - x) * k
      y += (ty - y) * k
      on += (onT - on) * (calm ? 1 : 0.09)
      set()
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.4 || Math.abs(onT - on) > 0.004 ? requestAnimationFrame(tick) : 0
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }
    // full effect over empty background; dimmed while reading text or using a card
    const move = (e) => { tx = e.clientX; ty = e.clientY; onT = e.target.closest?.(`${SKIP}, p, h1, h2, h3, li`) ? 0.35 : 1; kick() }
    const leave = () => { onT = 0; kick() }
    const ripple = (e) => {
      if (calm || e.button !== 0 || e.target.closest?.(SKIP)) return
      const r = document.createElement('span')
      r.className = 'bd-ripple'
      r.style.left = `${e.clientX}px`
      r.style.top = `${e.clientY}px`
      r.addEventListener('animationend', () => r.remove())
      el.appendChild(r)
    }
    set()
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', ripple, { passive: true })
    document.documentElement.addEventListener('mouseleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', ripple)
      document.documentElement.removeEventListener('mouseleave', leave)
      window.removeEventListener('blur', leave)
    }
  }, [])

  return (
    <div ref={ref} className="backdrop" aria-hidden="true">
      <div className="bd-fields">
        <i className="bd-f1" /><i className="bd-f2" /><i className="bd-f3" /><i className="bd-f4" />
      </div>
      <div className="bd-grid" />
      <div className="bd-glow" />
      <div className="bd-dots" />
    </div>
  )
}
