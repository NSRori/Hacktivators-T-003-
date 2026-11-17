import { useCallback, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTwin } from './lib/twin'
import { ControlBar, TopBar } from './components/Header'
import Topology from './components/Topology'
import SplitView from './components/SplitView'
import Charts from './components/Charts'
import Pillars from './components/Pillars'
import { EventLog, PacketMonitor, SocFeed, Tickets } from './components/Feeds'

export default function App() {
  const { frame, history, packets, mode, connected } = useTwin()
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const notify = useCallback((msg, ok = true) => {
    setToast({ msg, ok })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  return (
    <div className="min-h-screen">
      <TopBar frame={frame} connected={connected} />
      <ControlBar frame={frame} mode={mode} notify={notify} />
      {!frame ? (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="animate-spin" size={28} />
          <div className="text-sm">Connecting to the plant engine on <span className="num">localhost:8000</span>…</div>
          <div className="text-xs text-slate-500">Start the backend: <span className="num">cd backend &amp;&amp; ..\.venv\Scripts\python -m uvicorn main:app --port 8000</span></div>
        </div>
      ) : (
        <main className="grid gap-3 p-3 xl:grid-cols-12">
          <section className="xl:col-span-8"><Topology frame={frame} notify={notify} /></section>
          <section className="xl:col-span-4"><SplitView frame={frame} /></section>
          <section className="xl:col-span-12"><Pillars frame={frame} /></section>
          <section className="xl:col-span-12"><Charts history={history} /></section>
          <section className="xl:col-span-3"><Tickets frame={frame} notify={notify} /></section>
          <section className="xl:col-span-3"><SocFeed frame={frame} /></section>
          <section className="xl:col-span-3"><PacketMonitor packets={packets} /></section>
          <section className="xl:col-span-3"><EventLog frame={frame} /></section>
        </main>
      )}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-2 text-sm shadow-xl ${toast.ok
          ? 'border-emerald-500/50 bg-slate-900 text-emerald-200' : 'border-red-500/50 bg-slate-900 text-red-200'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
