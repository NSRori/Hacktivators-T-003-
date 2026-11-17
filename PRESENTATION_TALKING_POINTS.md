# Dairy Digital Twin: Talking Points and Practice Report

**For:** whoever presents (solo or as a team) at the RNSIT hackathon.
**Use it to:** rehearse the 3-minute pitch, memorise the key numbers, and prepare answers for judges.

Every number below was measured on the current build (commit `0cdf2a9` and later) by
`dairy-digital-twin/backend/tests/run_scenarios.py`, using the fixed seed, so it is the same on every run.
They come from **our simulation**, not a real plant. Say "in our simulation" when you quote them.

---

## 1. The one sentence (if you blank, say this)

> "Legacy tools watch machines one at a time. We watch the whole plant, predict failures before they happen,
> and contain cyber attacks without shutting the plant down."

## 2. The 30-second version (elevator pitch)

- **Problem:** plants lose output even when every machine on the SCADA screen is green. Each alarm checks one
  sensor against a fixed limit, so slow problems that build up *between* stages are invisible, and a hacked
  controller can simply report fake "normal" numbers.
- **What we built:** a live digital twin of a dairy line (silo → two pasteurizers → homogenizer → surge tank →
  filler → cold-chain packaging) with an engine that has three pillars:
  1. **Production sync:** finds hidden slowdowns and rebalances the line.
  2. **Predictive maintenance:** predicts which pump will fail and when, then dispatches a technician.
  3. **Cyber defense:** checks controller readings against physics and isolates only the hacked unit.
- **Proof:** in our hidden-slowdown scenario the engine warns **78 minutes before** the legacy SCADA raises any
  alarm, and with Auto-Sync on the plant keeps **96 % of its output with zero milk wasted**.

---

## 3. The 3-minute run-sheet

Before you start: the app is open on the **homepage**, the backend is running, speed is **2×** (Controls menu),
both switches are **on**. Keys: `1`-`4` run scenarios, `R` resets, `A` Auto-Sync, `I` Auto-Isolate.

| Time | Screen | What to say (say it in your own words) |
|---|---|---|
| 0:00-0:25 | Homepage hero | "Your SCADA says all green. Your milk says otherwise. In a dairy, milk can't wait: tanks overflow, warm milk spoils, under-heated milk is a safety problem. Yet the tools plants use watch each machine on its own." |
| 0:25-0:40 | Click **Open the live twin** | "This is a live twin of a dairy line, 800 litres a minute. Left: the plant floor. Right: the same plant seen by two monitors, the old SCADA and our engine. Hover any unit and it explains what it does." *(hover the homogenizer)* |
| 0:40-1:25 | Press `A` (Auto-Sync **off**), then `1` | "I'm making the homogenizer valve slowly clog. Its pressure creeps up but stays inside the legacy limits, so the old SCADA stays all green. Our engine flags it after 11 minutes from a pressure trend, a rolling Z-score." *(wait for the starving)* "Without help the surge tank runs dry, the filler starves, raw milk overflows. The old SCADA only alarms at minute 89: **78 minutes late**." |
| 1:25-1:45 | Press `R`, `A` (Auto-Sync **on**), `1` | "Same fault, Auto-Sync on. The engine throttles intake, paces the filler and schedules a short cleaning flush before capacity drops. **96 % of output kept, zero litres wasted**, and the old SCADA never noticed anything." |
| 1:45-2:10 | `R`, then `2` | "Pump wear. Vibration creeps up. A fixed alarm at 4.5 mm/s would fire at minute 99. Our model raises a ticket at minute 30 with a remaining-life countdown." *(point at "Pump fails in N min")* "One click dispatches a technician and the pump never fails." |
| 2:10-2:45 | `R`, then `3` (Auto-Isolate **on**) | "Now a cyber attack. A rogue host writes to Pasteurizer A: 40 % more flow, so the milk no longer reaches 72 °C, and the PLC replays fake 'normal' numbers. The old SCADA stays green. Our engine compares the PLC reading with the motor's current: **an attacker can fake a screen, not physics.** It isolates only Pasteurizer A, blocks the attacker, and Pasteurizer B carries 100 %. No shutdown, no lost batch." |
| 2:45-3:00 | Point at the "Who noticed first?" bar | "Three pillars, one engine, one live plant: it sees the hidden slowdown, predicts the failure, contains the attack, and keeps the milk moving. Thank you." |

**If you are running short on time:** skip scenario 2 (pump wear) and mention it in one sentence.
**If you have extra time:** show scenario 4 (fake temperature) with Auto-Isolate **off** so judges see the cross-check catch it.

---

## 4. Numbers to memorise

| Scenario | Engine | Legacy SCADA | Outcome |
|---|---|---|---|
| **1. Hidden slowdown**, Auto-Sync off | flags it at **+11 min** (valve only ~4 % clogged) | first alarm **+89 min** (tank empty) | bottling falls to **69 %** of target (about a **31 % drop**), **16,459 L** of raw milk overflows, filler starved **108 min** (over 200 min) |
| **1. Hidden slowdown**, Auto-Sync on | **+11 min** | **never alarms** | **96.4 %** of output kept, **0 L** wasted, **0 min** starved, surge tank never below 33 % |
| **2. Pump wear** (homogenizer pump) | ticket at **+30 min** | alarm at **+99 min** (vibration > 4.5 mm/s) | **69 min** earlier warning; ignored, the pump **fails at +182 min**; dispatched, **no failure** |
| **2b. Pasteurizer A pump wear** | ticket; Auto-Sync shifts load to **30 / 70** | no early alarm | Auto-Sync off: pump fails, output 87.8 %; Auto-Sync on: **no failure**, **99.5 %** output |
| **3. Cyber attack**, Auto-Isolate on | suspicious traffic at **+1 min**; rogue write at +3 min, **isolated the same minute** | **never alarms** | **560 L** under-heated (one minute), B carries **800 L/min**, attacker IP **192.168.66.6** blocked |
| **3. Cyber attack**, Auto-Isolate off | spoof and overspeed proven at **+4 min** | **never alarms** | **32,480 L** of under-heated milk in an hour while the screen says normal |
| **4. Fake temperature**, Auto-Isolate off | rogue write **+1 min**; physics cross-check **+15 min** | **never alarms** (reads 4.0 °C) | **44,800 L** of warm (> 7 °C) milk in 80 min |
| **4. Fake temperature**, Auto-Isolate on | **+1 min**, backup chiller engaged | never alarms | **0 L** at risk |
| **Normal operation** (300 min) | **zero** false alerts, **zero** false tickets | all green | 800 L/min, both tanks steady at 50 % |

**RUL accuracy (pump wear):** the prediction stays within about **3-7 minutes** of the true remaining life from
mid-life onward (e.g. predicted 97.7 vs true 98 min; 64.3 vs 68). The very first estimate is about 10 %
optimistic (142 vs 129 min) and tightens as data arrives.

---

## 5. Talking points per pillar

### Pillar 1: Production sync

- **What it does:** watches how stages affect each other, not single sensors. It found the clogging valve while
  pressure was still inside the legacy "OK" band (1800-2250 PSI).
- **How:**
  - a **rolling Z-score**: the 5-minute mean homogenizer pressure, compared with a healthy baseline, flagged
    when z > 4 for 3 minutes in a row
  - **forecasts**: time until the bottleneck, minutes until the surge tank runs empty (`T_starve`) and minutes
    until the silo overflows
  - a **NetworkX dependency graph** of the 7 units that follows a problem downstream ("knock-on effects") and
    upstream (silo overflow)
- **Auto-Sync actions (closed loop):**
  - throttles the raw-milk intake pump to match what the line can actually process, holding the silo near 50 %
  - paces the filler so the surge tank stays in a 35-65 % band
  - moves load from a degrading Pasteurizer A to B (30 / 70)
  - schedules an automatic **micro-CIP cleaning flush** once the valve is about 12 % fouled, before capacity
    drops; in the 200-minute test it ran five flushes
- **Line to use:** "The old SCADA checks *is this number inside its box*. We check *is the plant still balanced*."

### Pillar 2: Predictive maintenance

- **What it does:** notices wear early, says how long the pump has left, and opens a dispatch ticket naming the
  unit and a repair window.
- **How:**
  - **IsolationForest** (scikit-learn, 150 trees), trained at start-up on 500 minutes of *healthy* simulated
    operation. It is unsupervised, so it needs no failure labels.
  - The features are pump vibration level and trend for both pumps, plus homogenizer pressure mean and
    variance. A score above 0.6 for 3 minutes counts as an anomaly.
  - **Remaining useful life (RUL):** our wear model makes vibration grow as wear^1.5, so `(vibration − 2.0)^(2/3)`
    rises in a straight line over time. We fit that line over the last 25 minutes and extrapolate to the
    failure limit of **7.1 mm/s** (the ISO 10816-style "unacceptable" zone).
- **Actions:** one-click "Dispatch technician". With Auto-Sync on, the engine dispatches by itself once remaining
  life drops below 30 minutes.
- **Line to use:** "A fixed alarm tells you the pump is already in trouble. We tell you it *will* be, and when."

### Pillar 3: Cyber defense (our CSE-cyber angle)

- **What it does:** catches attacks that a normal SCADA cannot see, because the attacker controls what the
  SCADA is told.
- **Three layers of detection:**
  1. **Network rules** on simulated Modbus/TCP and OPC-UA traffic:
     - an allow-list of known hosts
     - only the SCADA master may write set-points
     - out-of-sequence transaction IDs
     - packet bursts above 2.2× the baseline
  2. **Physics cross-checks**, the key idea:
     - Pasteurizer A's PLC flow against the flow implied by its **motor drive current** (more than 12 % apart
       for 2 minutes means spoofing)
     - an overspeed check (more than 125 % of the set-point)
     - the silo thermometer against **independent inlet sensors** (more than 1.5 °C apart for 3 minutes)
  3. **Correlation:** the PLC total compared with the surge tank's actual inflow.
- **Response, surgical isolation:**
  - Before isolating, the engine uses the graph to check that milk can still reach packaging without that unit.
  - It then closes the diversion valve, quarantines only Pasteurizer A, firewalls the attacker and reroutes
    100 % through B.
  - For the chiller attack, it switches to the backup chiller and a redundant sensor.
- **Line to use:** "An attacker can fake a screen. They can't fake physics."
- **Interesting fact for judges:** during the attack, output actually goes *up* (Pasteurizer A pushes 560 L/min).
  A plant manager watching throughput would be *happy*. Meanwhile the milk is under-heated. That is exactly why
  single-metric monitoring fails.

---

## 6. Likely judge questions, with short answers

**Is this real plant data?**
No. It is a physics-inspired simulation with a fixed random seed, so every demo is repeatable. You cannot
safely make real pumps fail or hack a real pasteurizer. The engine only reads the same kind of signals a plant
PLC reports (flow, temperature, pressure, level, vibration, drive current, network frames), so it could be
pointed at real OPC-UA or Modbus data.

**Does the engine cheat by reading the simulator's hidden state?**
No. The simulator has a hidden "truth" section (real fouling %, real wear %), used only by our tests to grade
the engine. The detectors read only telemetry and network packets, exactly like the real world.

**Isn't "legacy SCADA" a strawman?**
It uses realistic fixed limits: 2-6 °C silo, 70-75 °C pasteurizer, 1800-2250 PSI homogenizer, 4.5 mm/s
vibration. Those catch real failures, which is their job. They cannot catch slow drift inside the limits, or
lies from a compromised PLC.

**Why not just tighten the thresholds?**
Tighter fixed limits create false alarms on normal noise, so operators learn to ignore them. We compare against
a learned healthy baseline and look at trends and cross-stage effects. In 300 minutes of normal operation we
raised **zero** false alerts.

**How was the ML model trained? Where are the labels?**
IsolationForest is unsupervised. It learns what *healthy* looks like from 500 minutes of normal operation and
scores how unusual new data is. No failure examples are needed, which matters because real plants rarely have
labelled failure data.

**How accurate is the remaining-life prediction?**
From mid-life on, within about 3-7 minutes of the true value in our runs. The first estimate is about 10 %
optimistic and corrects as more data arrives. We also give a repair window of about half the remaining life as
a safety margin.

**What if the attacker also spoofs the drive current?**
Then the downstream checks remain: the surge tank's real inflow and the temperature physics. The point is
defence in depth. An attacker would have to fake several independent instruments consistently, which is far
harder. On a real plant those sensors would sit on a separate, segmented network.

**Why isolate instead of shutting the plant down?**
A full shutdown of a dairy wastes milk that is already in the tanks and loses hours of production. The
pasteurizers are twins, each rated for the whole plant (900 L/min, hold tube sized for 15 s at that flow), so
isolating A and running B alone is safe. We check with the dependency graph that an alternative path exists
before isolating; if it doesn't, the engine refuses.

**Could an attacker just turn Auto-Isolate off?**
In our demo the switch is for showing the contrast. In a real deployment the engine's own controls would sit on
a separate, authenticated network, and switching off protection would itself raise an alert.

**What exactly does Auto-Sync control?**
Four things: intake pump speed, filler speed, the A/B split, and scheduling a short cleaning flush. It never
switches safety equipment.

**How fast is it? Would it scale?**
The engine analyses a minute of plant data in about 21 ms, and the twin streams at two updates per second over
WebSockets. One engine per production line is light enough to run on an ordinary PC.

**How would you connect it to a real plant?**
Read-only taps on the OPC-UA or Modbus network, or the plant historian. Retrain the anomaly model on that
plant's own healthy data. Start in "advise only" mode (switches off) so operators approve every action.

**What is your biggest limitation?**
Be honest:
- The physics is simplified, and the numbers are illustrative.
- The model is trained on simulated healthy data.
- The cyber rules are hand-written for the attack patterns we modelled.
- The next steps would be real plant data, more attack types, and a validated physical model.

**Why a dairy?**
Milk cannot wait: buffers overflow, warm milk spoils, under-heated milk is a food-safety risk. The parallel
pasteurizers give us somewhere to reroute milk, which makes surgical isolation possible.

**Which technologies?**
- Backend: Python, NumPy, scikit-learn, NetworkX, FastAPI with WebSockets.
- Frontend: React (Vite), React Flow, Recharts, Tailwind.

---

## 7. Say this, not that (corrections to the older scripts)

The PDFs in this repo were written against the plan, before the build was finished. Use these versions.

| Older line | Accurate line for the current build |
|---|---|
| "Python + SimPy simulate the plant" | "A Python/NumPy simulation, one tick per simulated minute, streamed live." (SimPy was used in our early factory prototype, `member1_factory_sim`.) |
| "The drift is only about 12 %" | "The engine catches it when the valve is only about **4 %** clogged. Output only starts to drop after about 20 %." |
| "Auto-Sync rebalances Pasteurizers A and B" (in the drift scenario) | In the drift: "it throttles intake, paces the filler and schedules a cleaning flush." A/B rebalancing is for Pasteurizer A pump wear and for cyber isolation. |
| "The +40 % spike means milk can't hold 72 °C for 15 s" | "The +40 % flow with a frozen heating loop means the milk **doesn't reach 72 °C**." (In our model the hold tube still gives at least 15 s.) |
| "The attack also spoofs the chiller" | The chiller spoof is its own scenario, **number 4**. |
| "Quote 32 % drop and 94 % retention" | Measured: about **31 %** drop with Auto-Sync off, **96.4 %** kept with it on. |
| "Cross-checks the PLC against tank inflow" | Mainly against the **motor drive current**, corroborated by tank inflow. |

---

## 8. Demo checklist and recovery

**Before judging:**
- [ ] `run.bat` started both windows (API on :8000, UI on :5173), or the single-port build at http://localhost:8000.
- [ ] Open the homepage and check the "Simulation running" line shows 800 L/min.
- [ ] Set speed to **2×**, check both switches are **on**, and press `R` to reset.
- [ ] Practise once with the keyboard: `A` `1`, `R` `A` `1`, `R` `2`, `R` `3`.
- [ ] Projector: use browser zoom (Ctrl +/-) or Presenter mode (`P`) so the plant floor fills the screen.
- [ ] Have the backup screen-recording ready.

**If something goes wrong:**
- **"Connecting to the plant engine…" or "Offline"**: the backend window was closed. Run `run.bat` again.
- **Something looks stuck**: press `R` and re-run the scenario. Every run is identical (fixed seed).
- **A scenario takes too long**: use 4× speed in the Controls menu, then go back to 2×.
- **Wrong switch state**: `A` and `I` flip them, and the scenario bar shows on or off.

---

## 9. Mini glossary (in case a judge uses the term)

| Term | Meaning in one line |
|---|---|
| SCADA | The control-room software that shows plant readings and raises alarms |
| PLC | The small industrial computer that runs a machine and reports its readings |
| HTST pasteurization | High-temperature short-time: 72 °C held about 15 s |
| Homogenizer | High-pressure valve that breaks up milk fat so cream doesn't separate |
| CIP | Clean-in-place: flushing equipment without taking it apart |
| Modbus / OPC-UA | Common industrial network protocols between SCADA and PLCs |
| Z-score | How many standard deviations a value is from its normal average |
| IsolationForest | ML model that flags data that is easy to "isolate", i.e. unusual |
| RUL | Remaining useful life: predicted minutes until a part fails |
| Surgical isolation | Cutting off only the compromised unit instead of the whole plant |

---

*Numbers regenerate with:* `cd dairy-digital-twin/backend` then `..\.venv\Scripts\python tests\run_scenarios.py`.
*They come from a simplified simulation (illustrative physics, fixed seed), not real plant measurements.*
