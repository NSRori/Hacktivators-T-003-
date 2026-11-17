import PlantFloor from '../components/PlantFloor'
import { CaptionStrip } from '../components/Chrome'
import { IncidentStory, KnockOn, KpiRow, Verdict } from '../components/Verdict'
import { LevelsChart, ScenarioChart, ThroughputChart } from '../components/Charts'
import { eventMarks } from '../lib/actions'

/** Presenter view: everything the jury needs is above the fold at 1600x1000 (spec §5.3).
    Rows are flex/auto-fit rather than fixed heights, so nothing overlaps when text wraps on a smaller
    screen, and the remaining widgets close the gap when one is minimized. */
export default function Twin({ frame, mode, history, call, notify }) {
  const marks = eventMarks(frame)
  return (
    <div className="space-y-4">
      <CaptionStrip frame={frame} mode={mode} call={call} />
      <div className="flex flex-wrap items-stretch gap-4">
        <PlantFloor frame={frame} notify={notify} className="min-h-[640px] flex-[1.55_1_620px]" />
        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4 empty:hidden">
          <Verdict frame={frame} className="flex-1" />
          <KpiRow frame={frame} />
        </div>
      </div>
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
  )
}
