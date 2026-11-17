import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp } from 'lucide-react'

/* Window-style controls for every widget (see Panel in ui.jsx):
   - minimize: the widget leaves the page and waits in the dock at the bottom; the layout closes the gap
   - zoom: the widget opens alone in a focus view; Esc or a click outside brings it back
   Minimized widgets are remembered per page, in this browser only. */
const Ctx = createContext(null)
const ZoomCtx = createContext(false)
const KEY = 'ddt.minimized.v1'

function load() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return new Set() }
}

/** True inside a widget that is open in the focus view. Call it from a child component of the Panel. */
export const useZoomed = () => useContext(ZoomCtx)
export const Zoomed = ({ children }) => <ZoomCtx.Provider value>{children}</ZoomCtx.Provider>

export function WidgetProvider({ scope, children }) {
  const [min, setMin] = useState(load)
  const [zoom, setZoom] = useState(null)              // { scope, id } - closes by itself when the page changes
  const [names, setNames] = useState({})              // mounted widgets: id -> title
  const zoomId = zoom && zoom.scope === scope ? zoom.id : null

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify([...min])) } catch { /* storage blocked: still works for this visit */ }
  }, [min])

  useEffect(() => {
    if (!zoomId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setZoom(null) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [zoomId])

  const register = useCallback((id, title) => setNames((n) => (n[id] === title ? n : { ...n, [id]: title })), [])
  const unregister = useCallback((id) => setNames((n) => {
    if (!(id in n)) return n
    const c = { ...n }
    delete c[id]
    return c
  }), [])

  const api = useMemo(() => ({
    scope, zoomId, register, unregister,
    isMin: (id) => min.has(id),
    minimize: (id) => setMin((s) => new Set(s).add(id)),
    restore: (ids) => setMin((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n }),
    zoomIn: (id) => setZoom({ scope, id }),
    zoomOut: () => setZoom(null),
  }), [scope, zoomId, min, register, unregister])

  const docked = Object.keys(names).filter((id) => min.has(id))
  return (
    <Ctx.Provider value={api}>
      {children}
      {docked.length > 0 && <Dock items={docked.map((id) => [id, names[id]])} restore={api.restore} />}
    </Ctx.Provider>
  )
}

/** Hook for one widget. `wid` only needs to be unique on its page. */
export function useWidget(wid, title) {
  const w = useContext(Ctx)
  const id = w && wid ? `${w.scope}:${wid}` : null
  const register = w?.register
  const unregister = w?.unregister
  useEffect(() => {
    if (!id) return undefined
    register(id, typeof title === 'string' ? title : wid)
    return () => unregister(id)
  }, [id, wid, title, register, unregister])
  if (!id) return null
  return {
    minimized: w.isMin(id),
    zoomed: w.zoomId === id,
    minimize: () => w.minimize(id),
    zoomIn: () => w.zoomIn(id),
    zoomOut: w.zoomOut,
  }
}

function Dock({ items, restore }) {
  return (
    <div className="dock fixed bottom-5 left-1/2 z-[45] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-4 pr-1.5"
      role="toolbar" aria-label="Minimized widgets">
      <span className="shrink-0 text-[13px] font-semibold text-ink-2">Minimized</span>
      <div className="scroll-thin flex min-w-0 gap-1.5 overflow-x-auto py-0.5">
        {items.map(([id, title]) => (
          <button key={id} onClick={() => restore([id])} title={`Bring back "${title}"`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1.5 pl-2 pr-3 text-[13.5px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent-2">
            <ChevronUp size={15} className="text-accent" />{title}
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <button onClick={() => restore(items.map(([id]) => id))}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold text-accent hover:bg-accent-2">Restore all</button>
      )}
    </div>
  )
}

/** The focus view: one widget over a dimmed page. */
export function FocusView({ title, mode, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-[3vh_3vw]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="focus-backdrop absolute inset-0" onClick={onClose} />
      <div className={`focus-card relative flex w-full min-h-0 flex-col ${mode === 'fill' ? 'h-full' : 'max-h-full max-w-[1100px]'}`}>
        <Zoomed>{children}</Zoomed>
      </div>
    </div>,
    document.body,
  )
}
