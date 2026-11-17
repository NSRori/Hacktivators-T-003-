import { useEffect, useState } from 'react'
import { ArrowRight, Radar, ShieldCheck, Timer } from 'lucide-react'
import { SCENARIOS, TONE, UNIT_INFO, UNITS } from '../lib/twin'
import { LogoMark, ThemeToggle } from '../components/Chrome'
import { Button, Num, Panel } from '../components/ui'

/* The problem in ten seconds: a looping illustration (not live data) of a valve that clogs while every
   legacy reading stays inside its limits, the slowdown travelling down the line, and the engine fixing it. */
const LOOP = [
  { ms: 2600, engine: ['ok', 'Balanced: every stage keeps pace with the next'] },
  { ms: 3000, engine: ['warn', 'Homogenizer valve clogging: root cause found'] },
  { ms: 3200, engine: ['crit', 'Surge tank empties next, then the filler starves'] },
  { ms: 3200, engine: ['ok', 'Auto-Sync rebalanced the line: output kept'] },
]
const HUE = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', crit: 'var(--color-crit)', flow: 'var(--pf-flow)', milk: 'var(--pf-milk)', dot: 'var(--pf-particle)', steel: 'var(--pf-steel)' }

function useLoop() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const t = setTimeout(() => setI((x) => (x + 1) % LOOP.length), LOOP[i].ms)
    return () => clearTimeout(t)
  }, [i])
  return i
}

function Schematic({ phase }) {
  const S = 'var(--color-accent)'
  const unit = (u) => (phase === 1 && u === 'homog') || (phase === 2 && u === 'homog') ? HUE.warn
    : phase === 2 && u === 'surge' ? HUE.warn : phase === 2 && u === 'filler' ? HUE.crit
      : phase === 3 && u === 'homog' ? HUE.ok : S
  const down = phase === 2
  const pipe = (d, k, hot) => {
    const c = hot ? HUE.warn : HUE.flow
    const dur = hot ? 3.2 : 1.6
    return (
      <g key={k}>
        <path d={d} fill="none" stroke="var(--pf-pipe)" strokeWidth="9" strokeLinecap="round" />
        <path d={d} fill="none" stroke={c} strokeWidth="2.5" className="flow-dash" style={{ animationDuration: `${hot ? 1.8 : 0.9}s`, transition: 'stroke .5s' }} />
        {[0, 1].map((i) => (
          <circle key={`${i}${hot}`} r="2.6" fill={hot ? HUE.warn : HUE.dot} style={{ filter: `drop-shadow(0 0 3px ${hot ? HUE.warn : HUE.dot})` }}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${i * dur / 2}s`} path={d} />
          </circle>
        ))}
      </g>
    )
  }
  const label = (x, y, t, c = 'var(--color-ink-2)') => <text x={x} y={y} textAnchor="middle" fontSize="13" fill={c} fontFamily="IBM Plex Sans" style={{ transition: 'fill .5s' }}>{t}</text>
  const ring = (cx, cy, r, c) => <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="2" className="home-ring" />
  const surgeLevel = phase === 2 ? 10 : 42
  return (
    <svg viewBox="16 44 600 220" className="h-auto w-full" role="img" aria-label="Schematic of the dairy line: silo, two pasteurizers, homogenizer, surge tank, filler, packaging">
      {[['M78 150 H118 V88 H150'], ['M118 150 V212 H150'], ['M232 88 H262 V150 H290'], ['M232 212 H262 V150']].map(([d], k) => pipe(d, k, false))}
      {[['M352 150 H392'], ['M452 150 H482'], ['M532 150 H556']].map(([d], k) => pipe(d, `d${k}`, down))}
      {/* silo */}
      <rect x="28" y="60" width="50" height="130" rx="14" fill="var(--pf-shell)" stroke={S} strokeWidth="2" />
      <rect x="32" y="114" width="42" height="72" rx="10" fill={HUE.milk} opacity=".9" />
      <path d="M36 190 L32 214 M70 190 L74 214" stroke={S} strokeWidth="2" />
      {label(53, 236, 'Silo')}
      {/* pasteurizers */}
      {[[150, 62, 'Pasteurizer A'], [150, 186, 'Pasteurizer B']].map(([x, y, t]) => (
        <g key={t}>
          <rect x={x} y={y} width="82" height="52" rx="6" fill="var(--pf-shell)" stroke={S} strokeWidth="2" />
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={x + 14 + i * 13} x2={x + 14 + i * 13} y1={y + 10} y2={y + 42} stroke="#84BEE5" strokeWidth="2" />)}
          {label(x + 41, y + (y < 100 ? -8 : 70), t)}
        </g>
      ))}
      {/* homogenizer: the needle stays in the green band the whole time - that is the point */}
      {(phase === 1 || phase === 2) && ring(321, 150, 44, HUE.warn)}
      <rect x="290" y="118" width="62" height="64" rx="6" fill="var(--pf-shell)" stroke={unit('homog')} strokeWidth="2.5" style={{ transition: 'stroke .5s' }} />
      <path d="M302 162 A19 19 0 0 1 340 162" fill="none" stroke="var(--pf-ok-tint)" strokeWidth="5" />
      <line x1="321" y1="162" x2={phase === 0 || phase === 3 ? 331 : 334} y2={phase === 0 || phase === 3 ? 146 : 149} stroke="var(--color-ink)" strokeWidth="2" style={{ transition: 'all .8s' }} />
      {label(321, 202, 'Homogenizer', unit('homog') === S ? 'var(--color-ink-2)' : unit('homog'))}
      {/* surge tank */}
      <rect x="392" y="104" width="60" height="92" rx="12" fill="var(--pf-shell)" stroke={unit('surge')} strokeWidth="2.5" style={{ transition: 'stroke .5s' }} />
      <rect x="396" y={192 - surgeLevel} width="52" height={surgeLevel} rx="8" fill={phase === 2 ? HUE.warn : HUE.milk} opacity=".9" style={{ transition: 'all 1.2s ease' }} />
      <line x1="388" x2="456" y1="150" y2="150" stroke="var(--color-ink-2)" strokeDasharray="3 3" />
      {label(422, 216, 'Surge tank', unit('surge') === S ? 'var(--color-ink-2)' : unit('surge'))}
      {/* filler */}
      {phase === 2 && ring(507, 150, 40, HUE.crit)}
      <rect x="482" y="112" width="50" height="76" rx="6" fill="var(--pf-shell)" stroke={unit('filler')} strokeWidth="2.5" style={{ transition: 'stroke .5s' }} />
      {[0, 1, 2].map((i) => <rect key={i} x={489 + i * 13} y="160" width="9" height="20" rx="1.5" fill="var(--color-surface-2)" stroke={S} strokeWidth="1.5" />)}
      <path d="M494 124 V146 M507 124 V146 M520 124 V146" stroke="#84BEE5" strokeWidth="2" />
      {label(507, 208, 'Filler', unit('filler') === S ? 'var(--color-ink-2)' : unit('filler'))}
      {/* packaging */}
      {[[560, 158], [578, 158], [569, 140]].map(([x, y], i) => <rect key={i} x={x} y={y} width="16" height="18" rx="1.5" fill="var(--color-surface-2)" stroke={S} strokeWidth="1.5" />)}
      {label(578, 200, 'Cold chain')}
    </svg>
  )
}

function LoopMonitors({ phase }) {
  const [tone, msg] = LOOP[phase].engine
  const col = HUE[tone]
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
      <div className="hmi flex items-center gap-2.5 px-3 py-2">
        <span className="text-[11.5px] leading-tight text-[#B9C1C6]">LEGACY<br />SCADA</span>
        <span className="h-3 w-3 rounded-[2px] bg-[#4CC46B]" />
        <span className="text-[17px] font-semibold tracking-wide text-[#4CC46B]">ALL GREEN</span>
      </div>
      <div key={phase} className="rise flex items-center gap-2.5 rounded-md border px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${col} 55%, transparent)`, background: `color-mix(in srgb, ${col} 11%, transparent)` }}>
        <span className="text-[11.5px] font-semibold leading-tight" style={{ color: col }}>OUR<br />ENGINE</span>
        <span className="text-[15px] font-medium leading-snug text-ink">{msg}</span>
      </div>
    </div>
  )
}

const RESULTS = [
  { icon: Radar, big: '70+', unit: 'min', text: 'earlier than the legacy alarm, on a clogging valve whose pressure never left its limits.' },
  { icon: Timer, big: '96', unit: '%', text: 'of bottling output kept by Auto-Sync during the same fault, against about 69 % without it.' },
  { icon: ShieldCheck, big: '0', unit: 'shutdowns', text: 'when a pasteurizer is hacked: it is isolated within minutes and its twin carries all the milk.' },
]

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
  const phase = useLoop()
  const eng = frame?.engine.overall
  return (
    <div className="min-h-screen">
      <header className="band sticky top-0 z-40 border-b border-line bg-header/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-6">
          <div className="flex items-center gap-2.5"><LogoMark size={32} /><span className="text-[17px] font-semibold text-ink">Dairy Digital Twin</span></div>
          <nav className="ml-6 hidden gap-6 text-[14.5px] text-ink-2 md:flex">
            <a href="#problem" className="hover:text-ink">The problem</a>
            <a href="#pillars" className="hover:text-ink">Three pillars</a>
            <a href="#line" className="hover:text-ink">The line</a>
            <a href="#demo" className="hover:text-ink">Demo guide</a>
          </nav>
          <div className="ml-auto flex items-center gap-2.5"><ThemeToggle /><Button kind="primary" onClick={() => go('twin')}>Open the live twin <ArrowRight size={16} /></Button></div>
        </div>
      </header>

      {/* hero */}
      <section>
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="inline-block rounded-md border border-line bg-surface px-2.5 py-1 text-[14px] font-semibold text-accent">RNSIT Hackathon · Problem statement 1 · Beyond the Factory Floor</div>
            <h1 className="mt-5 text-[38px] font-semibold leading-[1.12] tracking-tight text-ink sm:text-[44px] xl:text-[46px]">
              Your SCADA <span className="whitespace-nowrap">says <span className="hmi inline-block translate-y-[-4px] px-2.5 py-0.5 align-middle text-[0.58em] font-semibold tracking-wide !text-[#4CC46B]">ALL GREEN</span>.</span><br />
              Your milk says <span className="relative inline-block">otherwise
                <svg className="pointer-events-none absolute -bottom-2 left-0 h-3 w-full overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
                  <path className="scribble" d="M2 8 C 40 2, 70 11, 105 6 S 170 3, 198 7" fill="none" stroke="var(--color-crit)" strokeWidth="3.5" strokeLinecap="round" />
                </svg></span>.
            </h1>
            <p className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-ink">
              A live digital twin of a dairy processing line that finds what one-sensor-at-a-time alarms miss: a slowly clogging
              valve, a pump that will fail in two hours, a hacked controller reporting fake numbers. Then it acts, without
              shutting the plant down.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button kind="primary" className="px-5 py-2.5 text-[15px]" onClick={() => go('twin')}>Open the live twin <ArrowRight size={17} /></Button>
              <a href="#demo" className="inline-flex items-center rounded-md border border-line bg-surface px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-surface-2">Three-minute demo guide</a>
            </div>
          </div>
          <Panel wid="schematic" controls="zoom" title="The problem, in ten seconds" sub="An illustrated loop: a valve clogs, the slowdown travels down the line, and only one monitor notices." className="h-full" bodyClass="flex flex-col justify-between gap-3">
            <Schematic phase={phase} />
            <LoopMonitors phase={phase} />
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-2 pt-3.5 text-[14px] text-ink-2">
              {live ? (
                <>
                  <span className="flex items-center gap-2 font-semibold text-ink"><span className="live-dot h-2 w-2 rounded-full bg-ok" />Live plant</span>
                  <span>Bottling <b className="num text-ink"><Num value={frame.kpi.throughput_lpm} /> L/min</b></span>
                  <span>Engine <b className={TONE[eng].text}>{eng === 'OK' ? 'balanced' : TONE[eng].word.toLowerCase()}</b></span>
                </>
              ) : <span>Start the backend to see live numbers here.</span>}
            </div>
          </Panel>
        </div>
      </section>

      {/* what it buys you, in three numbers */}
      <section className="mx-auto max-w-[1240px] px-6">
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {RESULTS.map(({ icon: Icon, big, unit, text }) => (
            <div key={big + unit} className="flex gap-4 bg-surface/95 p-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-2 text-accent"><Icon size={22} /></span>
              <div>
                <div className="num text-[34px] font-semibold leading-none tracking-tight text-ink">{big}<span className="ml-1 text-[16px] font-medium text-ink-2">{unit}</span></div>
                <p className="mt-2 text-[15px] leading-snug text-ink-2">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] text-ink-3">Measured in our simulation (fixed seed). Run any scenario in the live twin to see it happen.</p>
      </section>

      {/* problem */}
      <section id="problem" className="mx-auto max-w-[1240px] px-6 py-14">
        <h2 className="text-[30px] font-semibold tracking-tight text-ink">Why plants slow down while every screen looks fine</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map(([t, d], i) => (
            <div key={t} className="panel p-6">
              <div className="num text-[14px] font-semibold text-accent">0{i + 1}</div>
              <h3 className="mt-2 text-[19px] font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pillars */}
      <section id="pillars">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <h2 className="text-[30px] font-semibold tracking-tight text-ink">One engine, three pillars</h2>
          <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink">Each pillar has its own tab in the app. All three read the same live telemetry, never the simulator’s hidden ground truth.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <article key={p.n} className="panel flex flex-col p-6">
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
      <section id="line" className="mx-auto max-w-[1240px] px-6 py-14">
        <h2 className="text-[30px] font-semibold tracking-tight text-ink">The line we simulate</h2>
        <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink">Seven units, six steps, 800 litres a minute. In the twin, hover any unit for this description and its live status.</p>
        <ol className="panel mt-8 grid gap-px overflow-hidden !bg-line sm:grid-cols-2 lg:grid-cols-4">
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
      <section id="demo">
        <div className="mx-auto max-w-[1240px] px-6 pb-16 pt-14">
          <h2 className="text-[30px] font-semibold tracking-tight text-ink">Run the demo in three minutes</h2>
          <p className="mt-2 max-w-[760px] text-[16.5px] leading-relaxed text-ink">Each button starts the scenario and takes you to the live twin. Keys <b>1-4</b> do the same from inside the app, and <b>R</b> resets the plant.</p>
          <div className="panel mt-8 divide-y divide-line-2 px-6">
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

      <footer className="band border-t border-line bg-header/90">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-2 px-6 py-8 text-[14px] text-ink-2">
          <span>All figures come from a simplified simulation (illustrative physics, fixed random seed), not real plant measurements.</span>
          <span className="ml-auto">FastAPI · WebSockets · scikit-learn · NetworkX · React Flow</span>
        </div>
      </footer>
    </div>
  )
}
