import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Loader2, Microscope, XCircle } from 'lucide-react'
import { useTwin } from './lib/twin'
import { ScenarioBar, TopBar } from './components/Header'
import PlantFloor from './components/PlantFloor'
import { Monitors, Timeline } from './components/Monitors'
import KpiStrip from './components/KpiStrip'
import Insights from './components/Insights'

export default function App() {
  const { frame, history, packets, mode, connected } = useTwin()
  const [toast, setToast] = useState(null)
  const [details, setDetails] = useState(false)
  const timer = useRef(null)
  const notify = useCallback((msg, ok = true) => {
    setToast({ msg, ok, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  return (
    <div className="min-h-screen pb-10">
      <TopBar frame={frame} mode={mode} connected={connected} notify={notify} />
      <ScenarioBar frame={frame} mode={mode} notify={notify} />
      {!frame ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="animate-spin text-sky-300" size={32} />
          <div className="text-[15px]">Connecting to the plant engine…</div>
          <div className="num text-[12px] text-slate-500">backend: cd backend → ..\.venv\Scripts\python -m uvicorn main:app --port 8000</div>
        </div>
      ) : (
        <main className="mx-auto max-w-[1920px] space-y-4 px-5 pt-4">
          {/* the digital twin is the hero */}
          <div className="h-[700px]"><PlantFloor frame={frame} mode={mode} notify={notify} /></div>

          {/* what it means: two monitors · the story · the numbers */}
          <div className="grid gap-4 xl:h-[440px] xl:grid-cols-12">
            <div className="xl:col-span-4"><Monitors frame={frame} /></div>
            <div className="flex min-h-[300px] flex-col xl:col-span-4"><Timeline frame={frame} /></div>
            <div className="xl:col-span-4"><KpiStrip frame={frame} history={history} /></div>
          </div>

          {/* deep-dive for judges, collapsed by default */}
          <button onClick={() => setDetails(!details)}
            className="card flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]">
            <Microscope size={20} className="text-sky-300" />
            <div>
              <div className="text-[15px] font-semibold text-white">Engineering details</div>
              <div className="text-[12.5px] text-slate-400">Live charts, ML anomaly score and remaining life, maintenance tickets, SOC alerts and raw OT packets</div>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-slate-400">{details ? 'Hide' : 'Show'}
              <ChevronDown size={18} className={`transition ${details ? 'rotate-180' : ''}`} /></span>
          </button>
          {details && <Insights frame={frame} history={history} packets={packets} notify={notify} />}
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
