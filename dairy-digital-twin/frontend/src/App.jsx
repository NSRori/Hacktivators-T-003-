import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { post, SCENARIOS, TABS, useRoute, useTwin } from './lib/twin'
import { AppHeader, LogoMark, ScenarioBar, Toast } from './components/Chrome'
import Backdrop from './components/Backdrop'
import { WidgetProvider } from './components/widgets'
import { isMuted, setMuted, useClickFeel, useFeel } from './lib/feel'
import { toggleTheme } from './lib/theme'
import { useSteadyFrame } from './lib/steady'
import Home from './pages/Home'
import Twin from './pages/Twin'
import { CyberPage, LogPage, MaintPage, SyncPage } from './pages/Pillars'

export default function App() {
  const { frame: raw, history, packets, mode, connected } = useTwin()
  const frame = useSteadyFrame(raw)                    // display-only averaging of noisy readings (lib/steady.js)
  const [route, go] = useRoute()
  const [toast, setToast] = useState(null)
  const [presenter, setPresenter] = useState(false)
  const timer = useRef(null)
  useFeel(raw)
  useClickFeel()

  const notify = useCallback((msg, ok = true) => {
    setToast({ msg, ok, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2800)
  }, [])
  // every async action: the button that started it shows a spinner and is disabled until the server answers
  const call = useCallback(async (path, body) => {
    const btn = document.activeElement?.closest?.('button')
    if (btn) { btn.setAttribute('data-loading', ''); btn.setAttribute('aria-busy', 'true'); btn.disabled = true }
    try {
      const r = await post(path, body)
      notify(r.message || (r.ok ? 'Done' : 'Failed'), r.ok !== false)
      return r
    } finally {
      if (btn) { btn.removeAttribute('data-loading'); btn.removeAttribute('aria-busy'); btn.disabled = false }
    }
  }, [notify])
  const run = useCallback(async (s) => {
    await call(`/scenario/${s.key}`)
    go('twin')
  }, [call, go])

  // presenter keyboard shortcuts (spec §5.3): 1-4 scenarios, R reset, A / I toggles, P presenter mode
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      const s = SCENARIOS.find((x) => String(x.n) === k)
      if (s) run(s)
      else if (k === 'r') call('/reset')
      else if (k === 'a' && mode) call('/auto-sync', { enabled: !mode.auto_sync })
      else if (k === 'i' && mode) call('/auto-isolate', { enabled: !mode.auto_isolate })
      else if (k === 'p') setPresenter((p) => !p)
      else if (k === 'm') setMuted(!isMuted())
      else if (k === 't') toggleTheme()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [call, run, mode])

  // first-load splash: brand mark + one animation, gone after about 1.2 s
  const [splash, setSplash] = useState(2)              // 2 shown, 1 fading out, 0 gone
  useEffect(() => {
    const a = setTimeout(() => setSplash(1), 900)
    const b = setTimeout(() => setSplash(0), 1250)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])

  const scope = TABS.some((t) => t.key === route) ? route : 'home'
  return (
    <WidgetProvider scope={scope}>
      {splash > 0 && <Splash leaving={splash === 1} />}
      <Backdrop />
      <div id="fx" className="fx" aria-hidden="true" />
      {scope === 'home' ? (
        <><Home frame={frame} connected={connected} go={go} run={run} /><Toast toast={toast} /></>
      ) : (
        <AppPage {...{ route, go, frame, history, packets, mode, connected, call, notify, presenter, setPresenter, toast }} />
      )}
    </WidgetProvider>
  )
}

function AppPage({ route, go, frame, history, packets, mode, connected, call, notify, presenter, setPresenter, toast }) {
  const page = !frame ? null
    : route === 'twin' ? <Twin frame={frame} mode={mode} history={history} call={call} notify={notify} />
      : route === 'sync' ? <SyncPage frame={frame} history={history} />
        : route === 'maint' ? <MaintPage frame={frame} history={history} call={call} />
          : route === 'cyber' ? <CyberPage frame={frame} history={history} packets={packets} />
            : <LogPage frame={frame} />

  return (
    <div className="min-h-screen pb-12" data-presenter={presenter ? '1' : '0'}>
      <AppHeader route={route} go={go} frame={frame} mode={mode} connected={connected} call={call} presenter={presenter} setPresenter={setPresenter} />
      <ScenarioBar frame={frame} mode={mode} call={call} />
      <main className="app-main mx-auto max-w-[1680px] px-6 pt-5">
        {page ? <div key={route} className="page-in">{page}</div> : <Waiting connected={connected} />}
      </main>
      <Toast toast={toast} />
    </div>
  )
}

function Splash({ leaving }) {
  return (
    <div className={`splash ${leaving ? 'splash-out' : ''}`} aria-hidden="true">
      <div className="flex flex-col items-center gap-4">
        <div className="splash-mark"><LogoMark size={56} /></div>
        <div className="text-[17px] font-semibold tracking-tight text-ink">Dairy Digital Twin</div>
        <div className="splash-bar"><span /></div>
      </div>
    </div>
  )
}

/** Before the first frame arrives: a skeleton of the page, and a way out if the backend is down. */
function Waiting({ connected }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t) }, [])
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-ink-2">
        <Loader2 className="animate-spin text-accent" size={20} />
        <span className="text-[15px]">{connected ? 'Loading the plant…' : 'Connecting to the plant engine…'}</span>
        {slow && !connected && (
          <>
            <span className="mono hidden text-[13px] text-ink-3 lg:inline">cd backend → python -m uvicorn main:app --port 8000</span>
            <button onClick={() => window.location.reload()} className="ml-auto rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[14px] font-semibold text-ink hover:bg-surface-3">Retry</button>
          </>
        )}
      </div>
      <div className="skeleton h-[150px]" />
      <div className="flex flex-wrap gap-4">
        <div className="skeleton h-[560px] flex-[1.6_1_640px]" />
        <div className="flex flex-[1_1_400px] flex-col gap-4"><div className="skeleton h-[380px]" /><div className="skeleton h-[160px]" /></div>
      </div>
    </div>
  )
}
