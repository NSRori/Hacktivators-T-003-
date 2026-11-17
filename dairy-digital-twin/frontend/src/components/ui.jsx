import { CheckCircle2, Eye, OctagonAlert, ShieldAlert, TriangleAlert, Wrench } from 'lucide-react'
import { TONE } from '../lib/twin'

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

export function Panel({ title, sub, right, children, className = '', bodyClass = '' }) {
  return (
    <section className={`panel flex flex-col ${className}`}>
      {(title || right) && (
        <header className="flex items-start gap-3 border-b border-line-2 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold leading-tight text-ink">{title}</h3>
            {sub && <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{sub}</p>}
          </div>
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </header>
      )}
      <div className={`flex-1 px-5 py-4 ${bodyClass}`}>{children}</div>
    </section>
  )
}

export function PageHeader({ eyebrow, title, lede, right }) {
  return (
    <div className="flex flex-wrap items-end gap-4 pb-1">
      <div className="max-w-[880px]">
        {eyebrow && <div className="text-[13px] font-semibold text-accent">{eyebrow}</div>}
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {lede && <p className="mt-1.5 text-[15.5px] leading-relaxed text-ink-2">{lede}</p>}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}

export const BTN = {
  primary: 'bg-accent text-white hover:bg-[#244a63]',
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
