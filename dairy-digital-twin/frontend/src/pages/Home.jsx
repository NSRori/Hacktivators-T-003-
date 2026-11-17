import { ArrowRight } from 'lucide-react'
import { fmt, SCENARIOS, TONE, UNIT_INFO, UNITS } from '../lib/twin'
import { LogoMark } from '../components/Chrome'
import { Button } from '../components/ui'

/* Hand-drawn line schematic of the six-stage line; pipes animate with live flow. */
function Schematic({ flowing }) {
  const S = '#2F5D7C'
  const pipe = (d, k) => (
    <g key={k}>
      <path d={d} fill="none" stroke="#D9D3C5" strokeWidth="9" strokeLinecap="round" />
      <path d={d} fill="none" stroke={S} strokeWidth="2.5" className={flowing ? 'flow-dash' : ''} style={{ animationDuration: '0.9s' }} />
    </g>
  )
  const label = (x, y, t) => <text x={x} y={y} textAnchor="middle" fontSize="13" fill="#5B6770" fontFamily="IBM Plex Sans">{t}</text>
  return (
    <svg viewBox="16 44 600 204" className="h-auto w-full" role="img" aria-label="Schematic of the dairy line: silo, two pasteurizers, homogenizer, surge tank, filler, packaging">
      {[
        'M78 150 H118 V88 H150', 'M118 150 V212 H150', 'M232 88 H262 V150 H290', 'M232 212 H262 V150',
        'M352 150 H392', 'M452 150 H482', 'M532 150 H556',
      ].map(pipe)}
      {/* silo */}
      <rect x="28" y="60" width="50" height="130" rx="14" fill="#fff" stroke={S} strokeWidth="2" />
      <rect x="32" y="114" width="42" height="72" rx="10" fill="#A9C3D6" />
      <path d="M36 190 L32 214 M70 190 L74 214" stroke={S} strokeWidth="2" />
      {label(53, 236, 'Silo')}
      {/* pasteurizers */}
      {[[150, 62, 'Pasteurizer A'], [150, 186, 'Pasteurizer B']].map(([x, y, t]) => (
        <g key={t}>
          <rect x={x} y={y} width="82" height="52" rx="6" fill="#fff" stroke={S} strokeWidth="2" />
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={x + 14 + i * 13} x2={x + 14 + i * 13} y1={y + 10} y2={y + 42} stroke="#9DB7CA" strokeWidth="2" />)}
          {label(x + 41, y + (y < 100 ? -8 : 70), t)}
        </g>
      ))}
      {/* homogenizer */}
      <rect x="290" y="118" width="62" height="64" rx="6" fill="#fff" stroke={S} strokeWidth="2" />
      <path d="M302 162 A19 19 0 0 1 340 162" fill="none" stroke="#CFE5D8" strokeWidth="5" />
      <line x1="321" y1="162" x2="331" y2="146" stroke="#1B2A33" strokeWidth="2" />
      {label(321, 202, 'Homogenizer')}
      {/* surge tank */}
      <rect x="392" y="104" width="60" height="92" rx="12" fill="#fff" stroke={S} strokeWidth="2" />
      <rect x="396" y="150" width="52" height="42" rx="8" fill="#A9C3D6" />
      <line x1="388" x2="456" y1="150" y2="150" stroke="#1B2A33" strokeDasharray="3 3" />
      {label(422, 216, 'Surge tank')}
      {/* filler */}
      <rect x="482" y="112" width="50" height="76" rx="6" fill="#fff" stroke={S} strokeWidth="2" />
      {[0, 1, 2].map((i) => <rect key={i} x={489 + i * 13} y="160" width="9" height="20" rx="1.5" fill="#EFEBE1" stroke={S} strokeWidth="1.5" />)}
      <path d="M494 124 V146 M507 124 V146 M520 124 V146" stroke="#9DB7CA" strokeWidth="2" />
      {label(507, 208, 'Filler')}
      {/* packaging */}
      {[[560, 158], [578, 158], [569, 140]].map(([x, y], i) => <rect key={i} x={x} y={y} width="16" height="18" rx="1.5" fill="#EFEBE1" stroke={S} strokeWidth="1.5" />)}
      {label(578, 200, 'Cold chain')}
    </svg>
  )
}

const PROBLEMS = [
  ['Alarms judge one sensor at a time.', 'A legacy SCADA checks each reading against a fixed limit. A slow problem that stays inside its limit is invisible until it is too late.'],
  ['Slowdowns travel down the line.', 'A clogging homogenizer starves the filler half an hour later and backs raw milk up until the silo overflows.'],
  ['Controllers can lie.', 'An attacker who controls a PLC can make the screen show 72 °C and normal flow while milk leaves under-heated.'],
]

const PILLARS = [
  { n: 1, tab: 'sync', title: 'Production sync', text: 'Watches how every stage affects the next. It spots drift that stays inside the limits, predicts when buffers run empty, and rebalances the line by itself.',
    see: ['Rolling Z-score drift on homogenizer pressure', 'Time until the surge tank starves', 'Intake throttling, filler pacing and A/B rebalancing'] },
  { n: 2, tab: 'maint', title: 'Predictive maintenance', text: 'Learns what healthy pumps look like, notices wear early, and tells a technician which pump will fail and roughly when.',
    see: ['IsolationForest anomaly score', 'Remaining useful life in minutes', 'Dispatch tickets with a repair window'] },
  { n: 3, tab: 'cyber', title: 'Cyber defense', text: 'Checks what the controllers claim against physics, flags rogue network commands, and isolates only the compromised unit.',
    see: ['PLC reading vs motor current cross-check', 'Unauthorized Modbus / OPC-UA writes', 'Surgical isolation with zero plant shutdown'] },
]

export default function Home({ frame, connected, go, run }) {
  const live = frame && connected
  const eng = frame?.engine.overall
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-6">
          <div className="flex items-center gap-2.5"><LogoMark size={32} /><span className="text-[17px] font-semibold text-ink">Dairy Digital Twin</span></div>
          <nav className="ml-6 hidden gap-6 text-[14.5px] text-ink-2 md:flex">
            <a href="#problem" className="hover:text-ink">The problem</a>
            <a href="#pillars" className="hover:text-ink">Three pillars</a>
            <a href="#line" className="hover:text-ink">The line</a>
            <a href="#demo" className="hover:text-ink">Demo guide</a>
          </nav>
          <Button kind="primary" className="ml-auto" onClick={() => go('twin')}>Open the live twin <ArrowRight size={16} /></Button>
        </div>
      </header>

      {/* hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="text-[14px] font-semibold text-accent">RNSIT Hackathon · Problem statement 1 · Beyond the Factory Floor</div>
            <h1 className="mt-3 text-[46px] font-semibold leading-[1.08] tracking-tight text-ink">
              Your SCADA says all green.<br />Your milk says otherwise.
            </h1>
            <p className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-ink-2">
              A live digital twin of a dairy processing line that finds what one-sensor-at-a-time alarms miss: a slowly clogging
              valve, a pump that will fail in two hours, a hacked controller reporting fake numbers. Then it acts, without
              shutting the plant down.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button kind="primary" className="px-5 py-2.5 text-[15px]" onClick={() => go('twin')}>Open the live twin <ArrowRight size={17} /></Button>
              <a href="#demo" className={`inline-flex items-center rounded-md border border-line px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-surface-2`}>Three-minute demo guide</a>
            </div>
          </div>
          <div className="flex h-full flex-col justify-between rounded-xl border border-line bg-bg p-6">
            <Schematic flowing={!!live} />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-4 text-[14px] text-ink-2">
              {live ? (
                <>
                  <span className="flex items-center gap-2"><span className="live-dot h-2 w-2 rounded-full bg-ok" />Simulation running</span>
                  <span>Bottling <b className="num text-ink">{fmt(frame.kpi.throughput_lpm)} L/min</b></span>
                  <span>Engine <b className={TONE[eng].text}>{eng === 'OK' ? 'balanced' : TONE[eng].word.toLowerCase()}</b></span>
                </>
              ) : <span>Start the backend to see live numbers here.</span>}
            </div>
          </div>
        </div>
      </section>

      {/* problem */}
      <section id="problem" className="mx-auto max-w-[1240px] px-6 py-16">
        <h2 className="text-[30px] font-semibold tracking-tight text-ink">Why plants slow down while every screen looks fine</h2>
        <div className="mt-8 grid gap-0 border-t border-line md:grid-cols-3">
          {PROBLEMS.map(([t, d], i) => (
            <div key={t} className={`border-b border-line py-6 md:border-b-0 ${i ? 'md:border-l md:pl-8' : ''} md:pr-8`}>
              <div className="num text-[14px] font-semibold text-accent">0{i + 1}</div>
              <h3 className="mt-2 text-[19px] font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pillars */}
      <section id="pillars" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1240px] px-6 py-16">
          <h2 className="text-[30px] font-semibold tracking-tight text-ink">One engine, three pillars</h2>
          <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink-2">Each pillar has its own tab in the app. All three read the same live telemetry, never the simulator’s hidden ground truth.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <article key={p.n} className="flex flex-col rounded-lg border border-line bg-bg p-6">
                <div className="text-[14px] font-semibold text-accent">Pillar {p.n}</div>
                <h3 className="mt-1 text-[21px] font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{p.text}</p>
                <ul className="mt-4 flex-1 space-y-1.5 border-t border-line pt-4 text-[14.5px] text-ink">
                  {p.see.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{s}</li>)}
                </ul>
                <button onClick={() => go(p.tab)} className="mt-5 inline-flex items-center gap-1.5 self-start text-[15px] font-semibold text-accent hover:underline">
                  Open {p.title.toLowerCase()} <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* the line */}
      <section id="line" className="mx-auto max-w-[1240px] px-6 py-16">
        <h2 className="text-[30px] font-semibold tracking-tight text-ink">The line we simulate</h2>
        <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink-2">Seven units, six steps, 800 litres a minute. In the twin, hover any unit for this description and its live status.</p>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {UNITS.filter((u) => u !== 'pasteurizer_b').map((u) => (
            <li key={u} className="bg-surface p-5">
              <div className="text-[13px] font-semibold text-accent">{UNIT_INFO[u].step}</div>
              <div className="mt-1 text-[17px] font-semibold text-ink">{u === 'pasteurizer_a' ? 'Pasteurizers A + B' : UNIT_INFO[u].name}</div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{UNIT_INFO[u].what}</p>
            </li>
          ))}
          <li className="flex flex-col justify-center bg-surface p-5 lg:col-span-2">
            <div className="text-[13px] font-semibold text-accent">See it live</div>
            <button onClick={() => go('twin')} className="mt-1 inline-flex items-center gap-1.5 text-[17px] font-semibold text-ink hover:text-accent">Open the plant floor <ArrowRight size={17} /></button>
          </li>
        </ol>
      </section>

      {/* demo */}
      <section id="demo" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1240px] px-6 py-16">
          <h2 className="text-[30px] font-semibold tracking-tight text-ink">Run the demo in three minutes</h2>
          <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink-2">Each button starts the scenario and takes you to the live twin. Keys <b className="text-ink">1-4</b> do the same from inside the app, and <b className="text-ink">R</b> resets the plant.</p>
          <div className="mt-8 divide-y divide-line border-y border-line">
            {SCENARIOS.map((s) => (
              <div key={s.key} className="grid items-center gap-4 py-5 md:grid-cols-[48px_1fr_auto]">
                <div className="num text-[26px] font-semibold text-accent">{s.n}</div>
                <div>
                  <h3 className="text-[19px] font-semibold text-ink">{s.long}</h3>
                  <p className="mt-1 text-[15.5px] leading-relaxed text-ink-2">{s.blurb}</p>
                  <p className="mt-1 text-[14.5px] text-ink"><b>Tip:</b> {s.tip}</p>
                </div>
                <Button kind="secondary" onClick={() => run(s)} disabled={!connected}>Run it in the twin <ArrowRight size={16} /></Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-2 px-6 py-8 text-[14px] text-ink-2">
          <span>All figures come from a simplified simulation (illustrative physics, fixed random seed), not real plant measurements.</span>
          <span className="ml-auto">FastAPI · WebSockets · scikit-learn · NetworkX · React Flow</span>
        </div>
      </footer>
    </div>
  )
}
