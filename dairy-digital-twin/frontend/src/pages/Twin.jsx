import PlantFloor from '../components/PlantFloor'
import { CaptionStrip } from '../components/Chrome'
import { IncidentStory, KnockOn, KpiRow, Verdict } from '../components/Verdict'
import { LevelsChart, ScenarioChart, ThroughputChart } from '../components/Charts'
import { eventMarks } from '../lib/actions'

/** Presenter view: everything the jury needs is above the fold at 1600x1000 (spec §5.3). */
export default function Twin({ frame, mode, history, call, notify }) {
  const marks = eventMarks(frame)
  return (
    <div className="space-y-4">
      <CaptionStrip frame={frame} mode={mode} call={call} />
      <div className="grid gap-4 xl:h-[660px] xl:grid-cols-[1.55fr_1fr]">
        <div className="h-[640px] xl:h-full"><PlantFloor frame={frame} notify={notify} /></div>
        <div className="flex min-h-0 flex-col gap-4">
          <Verdict frame={frame} />
          <KpiRow frame={frame} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ThroughputChart h={history} marks={marks} />
        <LevelsChart h={history} marks={marks} />
        <ScenarioChart scenario={frame.scenario} h={history} marks={marks} />
      </div>
      <div className="grid gap-4 xl:h-[380px] xl:grid-cols-2">
        <IncidentStory frame={frame} />
        <KnockOn frame={frame} />
      </div>
    </div>
  )
}
