import { useState } from 'react'
import { ChevronDown, LineChart } from 'lucide-react'
import PlantFloor from '../components/PlantFloor'
import { CaptionStrip } from '../components/Chrome'
import { IncidentStory, KnockOn, KpiRow, Verdict } from '../components/Verdict'
import { LevelsChart, ScenarioChart, ThroughputChart } from '../components/Charts'
import { eventMarks } from '../lib/actions'

const KEY = 'ddt.evidence.v1'
const readOpen = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** Presenter view, built around the problem statement:
      1. the story strip: what is going wrong, who noticed, what happens next
      2. the plant itself, next to "same plant, two monitors"
      3. the evidence (charts, step-by-step log, knock-on effects), folded away until someone asks for it
    Rows are flex/auto-fit rather than fixed heights, so nothing overlaps when text wraps on a smaller
    screen, and the remaining widgets close the gap when one is minimized. */
export default function Twin({ frame, mode, history, call, notify }) {
  const marks = eventMarks(frame)
  const [open, setOpen] = useState(readOpen)
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(KEY, o ? '0' : '1') } catch { /* storage blocked: still works for this visit */ }
    return !o
  })
  return (
    <div className="space-y-4">
      <CaptionStrip frame={frame} mode={mode} call={call} />
      <div className="flex flex-wrap items-stretch gap-4">
        <PlantFloor frame={frame} notify={notify} className="min-h-[660px] flex-[1.6_1_640px]" />
        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4 empty:hidden">
          <Verdict frame={frame} className="flex-1" />
          <KpiRow frame={frame} />
        </div>
      </div>

      <button onClick={toggle} aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface/80 px-5 py-3.5 text-left backdrop-blur-sm hover:border-[#3D3D40] hover:bg-surface">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-2 text-accent"><LineChart size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-ink">{open ? 'Hide the evidence' : 'Show the evidence'}</span>
          <span className="block text-[13.5px] text-ink-2">Live charts with event markers, the step-by-step incident log, and every knock-on effect the engine predicts.</span>
        </span>
        <ChevronDown size={20} className={`text-ink-2 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="rise space-y-4">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))]">
            <ThroughputChart h={history} marks={marks} />
            <LevelsChart h={history} marks={marks} />
            <ScenarioChart scenario={frame.scenario} h={history} marks={marks} />
          </div>
          <div className="flex flex-wrap gap-4">
            <IncidentStory frame={frame} className="h-[380px] flex-[1_1_520px]" />
            <KnockOn frame={frame} className="h-[380px] flex-[1_1_520px]" />
          </div>
        </div>
      )}
    </div>
  )
}
