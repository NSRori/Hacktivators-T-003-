import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useTwin } from './lib/twin'
import { ScenarioDeck, TopBar } from './components/Header'
import PlantFloor from './components/PlantFloor'
import { Monitors, Timeline } from './components/Monitors'
import KpiStrip from './components/KpiStrip'
import Insights from './components/Insights'

export default function App() {
  const { frame, history, packets, mode, connected } = useTwin()
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const notify = useCallback((msg, ok = true) => {
    setToast({ msg, ok, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  return (
    <div className="min-h-screen pb-10">
      <TopBar frame={frame} mode={mode} connected={connected} notify={notify} />
      <ScenarioDeck frame={frame} mode={mode} notify={notify} />
      {!frame ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="animate-spin text-sky-300" size={32} />
          <div className="text-[15px]">Connecting to the plant engine…</div>
          <div className="num text-[12px] text-slate-500">backend: cd backend → ..\.venv\Scripts\python -m uvicorn main:app --port 8000</div>
        </div>
      ) : (
        <main className="mx-auto max-w-[1920px] space-y-4 px-5 pt-4">
          <div className="grid gap-4 xl:h-[660px] xl:grid-cols-12">
            <div className="h-[640px] xl:col-span-8 xl:h-full"><PlantFloor frame={frame} notify={notify} /></div>
            <div className="flex min-h-0 flex-col gap-4 xl:col-span-4"><Monitors frame={frame} /><Timeline frame={frame} /></div>
          </div>
          <KpiStrip frame={frame} history={history} />
          <Insights frame={frame} history={history} packets={packets} notify={notify} />
        </main>
      )}
      {toast && (
        <div key={toast.id} className={`rise fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] shadow-2xl ring-1 backdrop-blur ${toast.ok
          ? 'bg-[#0b1322]/95 text-emerald-100 ring-emerald-400/40' : 'bg-[#1a0b12]/95 text-rose-100 ring-rose-500/50'}`}>
          {toast.ok ? <CheckCircle2 size={16} className="text-emerald-300" /> : <XCircle size={16} className="text-rose-300" />}{toast.msg}
        </div>
      )}
    </div>
  )
}
