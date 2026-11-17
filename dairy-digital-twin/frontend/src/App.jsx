import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { post, SCENARIOS, TABS, useRoute, useTwin } from './lib/twin'
import { AppHeader, ScenarioBar, Toast } from './components/Chrome'
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
  const call = useCallback(async (path, body) => {
    const r = await post(path, body)
    notify(r.message || (r.ok ? 'Done' : 'Failed'), r.ok !== false)
    return r
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

  const scope = TABS.some((t) => t.key === route) ? route : 'home'
  return (
    <WidgetProvider scope={scope}>
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
        {page || (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-ink-2">
            <Loader2 className="animate-spin text-accent" size={30} />
            <div className="text-[16px]">Connecting to the plant engine…</div>
            <div className="mono text-[13px]">cd backend → ..\.venv\Scripts\python -m uvicorn main:app --port 8000</div>
          </div>
        )}
      </main>
      <Toast toast={toast} />
    </div>
  )
}
