import { useRef, useState } from 'react'
import { CheckCircle2, Eye, Maximize2, Minimize2, Minus, OctagonAlert, ShieldAlert, TriangleAlert, Wrench } from 'lucide-react'
import { TONE } from '../lib/twin'
import { FocusView, useWidget, useZoomed } from './widgets'

export const STATUS_ICON = { OK: CheckCircle2, WATCH: Eye, MAINT: Wrench, WARN: TriangleAlert, CRITICAL: OctagonAlert, QUARANTINED: ShieldAlert }

/** Status = icon + word + colour, never colour alone (spec §5.4). */
export function StatusBadge({ status, size = 'md', label }) {
  const t = TONE[status] || TONE.OK
  const Icon = STATUS_ICON[status] || CheckCircle2
  const big = size === 'lg'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${t.soft} ${t.text} ${big ? 'px-2.5 py-1 text-[15px]' : 'px-2 py-0.5 text-[13px]'}`}>
      <Icon size={big ? 17 : 14} strokeWidth={2.2} />{label || t.word}
    </span>
  )
}

const CTL = 'grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors hover:bg-accent-2 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent'

/**
 * Every card in the app. With a `wid` it becomes a widget with window controls:
 * minimize (to the dock at the bottom) and zoom (focus view).
 *   zoom="scale": static content is magnified in the focus view (numbers, verdicts)
 *   zoom="fill":  content stretches to fill the focus view (charts, plant floor, long lists)
 *   controls="zoom": no minimize button (used on the homepage)
 */
export function Panel({ wid, title, sub, right, children, className = '', bodyClass = '', zoom = 'scale', controls = 'all' }) {
  const w = useWidget(wid, title)
  const ref = useRef(null)
  const [held, setHeld] = useState(0)                 // height kept free on the page while zoomed
  if (w?.minimized && controls === 'all') return null

  const frame = (focused) => (
    <section ref={focused ? undefined : ref}
      className={`panel flex min-h-0 min-w-0 flex-col ${focused ? `${zoom === 'fill' ? 'h-full' : 'max-h-full'} overflow-hidden` : className}`}>
      {(title || right || w) && (
        <header className="flex items-start gap-2 border-b border-line-2 py-3 pl-5 pr-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2 py-0.5">
            <div className="min-w-0 flex-1 basis-[170px]">
              <h3 className="text-[16px] font-semibold leading-tight text-ink">{title}</h3>
              {sub && <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{sub}</div>}
            </div>
            {right && <div className="ml-auto shrink-0">{right}</div>}
          </div>
          {w && (focused ? (
            <button onClick={w.zoomOut} title="Back to the page (Esc)"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
              <Minimize2 size={15} />Close <Kbd>Esc</Kbd>
            </button>
          ) : (
            <div className="-mt-0.5 flex shrink-0 items-center">
              {controls === 'all' && (
                <button className={CTL} onClick={w.minimize} title="Minimize: park it in the dock at the bottom" aria-label={`Minimize ${title}`}>
                  <Minus size={17} strokeWidth={2.2} />
                </button>
              )}
              <button className={CTL} onClick={() => { setHeld(ref.current?.offsetHeight || 0); w.zoomIn() }}
                title="Zoom: open on its own" aria-label={`Zoom ${title}`}>
                <Maximize2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </header>
      )}
      <div className={`min-h-0 flex-1 px-5 py-4 ${focused ? `overflow-auto ${zoom === 'scale' ? 'focus-scale' : ''}` : ''} ${bodyClass}`}>{children}</div>
    </section>
  )

  if (w?.zoomed) {
    return (
      <>
        <div className={`${className} grid place-items-center rounded-[10px] border-2 border-dashed border-accent-3 bg-surface/60 text-[14px] text-ink-2`}
          style={{ height: held || 160 }}>
          <span>“{title}” is open in the focus view</span>
        </div>
        <FocusView title={title} mode={zoom} onClose={w.zoomOut}>{frame(true)}</FocusView>
      </>
    )
  }
  return frame(false)
}

/** A list that scrolls inside its card, and fills the focus view when zoomed. `limit` = max-height class. */
export function ScrollArea({ limit = 'max-h-[420px]', className = '', children, ...rest }) {
  const z = useZoomed()
  return <div {...rest} className={`scroll-thin overflow-y-auto ${z ? 'min-h-0 flex-1' : limit} ${className}`}>{children}</div>
}

export function PageHeader({ eyebrow, title, lede, right }) {
  return (
    <div className="flex flex-wrap items-end gap-4 pb-1">
      <div className="max-w-[880px]">
        {eyebrow && <div className="inline-block rounded-md bg-surface px-2 py-0.5 text-[13px] font-semibold text-accent">{eyebrow}</div>}
        <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {lede && <p className="mt-1.5 text-[15.5px] leading-relaxed text-ink">{lede}</p>}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}

export const BTN = {
  primary: 'bg-accent text-white hover:bg-[#095A88]',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  crit: 'bg-crit text-white hover:bg-[#9c2f25]',
  warn: 'bg-warn text-ink hover:bg-[#b37a00]',
  iso: 'bg-iso text-white hover:bg-[#59348a]',
  quiet: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
}

export function Button({ kind = 'secondary', className = '', children, ...rest }) {
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[14px] font-semibold transition-colors disabled:opacity-50 ${BTN[kind]} ${className}`}>
      {children}
    </button>
  )
}

export const Kbd = ({ children }) => (
  <kbd className="mono rounded border border-line bg-surface-2 px-1.5 text-[11.5px] font-medium text-ink-2">{children}</kbd>
)

export function Metric({ label, value, unit, tone = 'text-ink', sub }) {
  return (
    <div>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className={`num mt-0.5 text-[28px] font-semibold leading-none ${tone}`}>{value}{unit && <span className="ml-1 text-[14px] font-normal text-ink-2">{unit}</span>}</div>
      {sub && <div className="mt-1 text-[13px] text-ink-2">{sub}</div>}
    </div>
  )
}
