import { Monitor, Radar } from 'lucide-react'
import { ENGINE_STYLE, LABEL, LEGACY_STYLE, UNITS } from '../lib/twin'

export default function SplitView({ frame }) {
  const legacy = frame.legacy
  const eng = frame.engine
  const det = eng.detection
  const allGreen = legacy.overall === 'GREEN'
  const scnTick = det.scenario_tick
  const rel = (t) => (t === null || t === undefined || scnTick === null ? null : t - scnTick)
  return (
    <div className="panel flex h-full flex-col">
      <div className="px-4 pt-3 panel-title">Split view · same plant, two monitors</div>
      <div className="grid flex-1 grid-cols-2 gap-3 p-3">
        {/* ---------------- legacy ---------------- */}
        <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Monitor size={13} />Legacy SCADA</div>
          <div className={`mt-2 rounded-lg py-2 text-center text-[19px] font-black tracking-wider ${allGreen
            ? 'bg-emerald-500/15 text-emerald-300' : legacy.overall === 'AMBER' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
            {allGreen ? 'ALL GREEN' : legacy.overall === 'AMBER' ? 'WARNING' : 'ALARM'}
          </div>
          <div className="mt-1 text-center text-[10px] text-slate-500">static limits · one unit at a time · trusts PLC values</div>
          <ul className="mt-2 space-y-1">
            {UNITS.map((u) => {
              const x = legacy.units[u]
              return (
                <li key={u} className="flex items-center gap-2 text-[11.5px]">
                  <span className={`h-2 w-2 rounded-full ${LEGACY_STYLE[x.status].dot}`} />
                  <span className="text-slate-300">{LABEL[u]}</span>
                  <span className={`ml-auto text-[10px] ${LEGACY_STYLE[x.status].text}`}>{x.status === 'GREEN' ? 'OK' : x.reason}</span>
                </li>
              )
            })}
          </ul>
        </div>
        {/* ---------------- three-pillar ---------------- */}
        <div className="flex flex-col rounded-xl border border-sky-800/70 bg-sky-950/20 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300"><Radar size={13} />Three-Pillar Engine</div>
          <div className={`mt-2 rounded-lg py-2 text-center text-[19px] font-black tracking-wider ${ENGINE_STYLE[eng.overall].pill}`}>
            {eng.overall === 'OK' ? 'BALANCED' : eng.overall}
          </div>
          <div className="mt-1 text-center text-[10px] text-slate-500">cross-stage context · ML trend · physics cross-checks</div>
          <ul className="mt-2 space-y-1">
            {UNITS.map((u) => {
              const x = eng.units[u]
              const st = ENGINE_STYLE[x.status]
              return (
                <li key={u} className="flex items-center gap-2 text-[11.5px]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <span className="shrink-0 text-slate-300">{LABEL[u]}</span>
                  <span className={`ml-auto truncate text-right text-[10px] ${st.text}`} title={x.reason}>{x.status === 'OK' ? 'OK' : x.reason}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="mx-3 mb-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11.5px]">
        {det.scenario ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-slate-500">Scenario <b className="text-slate-300">{det.scenario.replace('_', ' ')}</b></span>
            <span>Engine flagged: <b className="num text-sky-300">{rel(det.engine_first_tick) === null ? 'watching…' : `+${rel(det.engine_first_tick)} min`}</b></span>
            <span>Legacy alarm: <b className={`num ${det.legacy_first_tick === null ? 'text-emerald-300' : 'text-amber-300'}`}>
              {rel(det.legacy_first_tick) === null ? 'still ALL GREEN' : `+${rel(det.legacy_first_tick)} min`}</b></span>
            {det.lead_min !== null && <span className="rounded bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-200">{det.lead_min} min earlier warning</span>}
          </div>
        ) : <span className="text-slate-500">Trigger a scenario to compare detection times.</span>}
      </div>
    </div>
  )
}
