# PROJECT CONTEXT: Hacktivators T-003 · Dairy Digital Twin

> **Read this first if you are an AI assistant picking up this project.** It is the handoff from the previous
> Claude Code session (its usage limit ran out). It covers what exists, how to run and verify it, the decisions
> and preferences already settled with the team, and **exactly what was requested but not built yet (§9)**.
> Last updated 2026-11-17, after commit `2e926df`.

---

## 1. What this is

* **Event:** RNSIT hackathon, Problem Statement 1, *"Beyond the Factory Floor"*. Team **Hacktivators T-003**.
* **Repo:** `https://github.com/NSRori/Hacktivators-T-003-`, branch `main`. On the presenter laptop it is cloned at
  `C:\Users\hp\BeyondFactoryFloor\Hacktivators-T-003-` (Windows 11; PowerShell plus Git Bash).
* **Product:** a live **digital twin of a dairy processing line**. A Python simulation streams telemetry over a WebSocket
  to a React dashboard that compares a **Legacy SCADA** (fixed thresholds, one sensor at a time) with our
  **Three-Pillar Engine**:
  1. Production Sync
  2. Predictive Maintenance
  3. Cyber OT Defense
* **The plan we follow:** `hackathon_plan_single_pc_dairy_digital_twin_claude_pro_workflow.md` (6-member dairy plan).
  An older 5-person factory plan is also in the repo root as `.md` and `.pdf`.
* **The line:**

  ```
  Raw Chilling Silo (4 °C) ─┬─> Pasteurizer_A ─┐
                            └─> Pasteurizer_B ─┴─> Homogenizer ─> Surge Tank ─> Aseptic Filler ─> Cold-Chain Packaging
  ```

## 2. Repo layout

| Path | What |
|---|---|
| `dairy-digital-twin/` | **The app.** Backend, frontend, `run.bat`, `README.md` (the README has the REST/WS contract and code map) |
| `dairy-digital-twin/backend/engine.py` | Plant physics + fault/attack injectors (`DairyPlant`) |
| `dairy-digital-twin/backend/intelligence.py` | Legacy SCADA + `ThreePillarEngine` (ML, drift, cyber, control) |
| `dairy-digital-twin/backend/main.py` | FastAPI hub: `/ws` broadcaster at 2 Hz + REST controls; serves `frontend/dist` on :8000 |
| `dairy-digital-twin/backend/tests/run_scenarios.py` | Headless pass/fail checks of every scenario. **Must stay green** |
| `dairy-digital-twin/frontend/` | Vite 8 + React 19 + Tailwind v4 + @xyflow/react 13 + Recharts 3 + lucide-react, IBM Plex fonts |
| `dairy-digital-twin/tools/ui_check.py` | Headless-Chrome checker: screenshots, overlap audit, console errors (see §4) |
| `member1_factory_sim/` | Member 1's original SimPy factory module (CNC line, wear scenario). Separate from the dairy app; kept for the record |
| `PRESENTATION_TALKING_POINTS.md` | Presenter practice report: pitch, 3-min run-sheet, verified numbers, judge Q&A, corrections to older PDFs |
| `UI_REVIEW_AND_REDESIGN_SPEC.md` | Teammate's UI spec (readability, status = icon + word + colour, 14 px min text, presenter layout) |
| `*.pdf`, `Dairy_Digital_Twin_Pitch.pptx` | Teammates' pitch material. Some lines in the PDFs are out of date; see the talking-points file §7 |

## 3. Run it

* **One click:** double-click `dairy-digital-twin/run.bat`. It creates `.venv` and `node_modules` the first time,
  starts the API on :8000 and Vite on :5173, then opens the browser.
* **Manual:**
  * backend: `cd dairy-digital-twin/backend` → `..\.venv\Scripts\python -m uvicorn main:app --port 8000`
  * frontend: `cd dairy-digital-twin/frontend` → `npm run dev`
* **Single port:** `npm run build` in `frontend/`. The backend then serves the built UI at http://localhost:8000.
* **Vite proxy** (`vite.config.js`): `/api` → `http://127.0.0.1:8000`, `/ws` → `ws://127.0.0.1:8000`.
* **Vite address:** Vite listens on IPv6 `[::1]:5173`, so `curl 127.0.0.1:5173` fails even when it is up. Use
  `http://localhost:5173` or `http://[::1]:5173`.
* **Rebasing restarts Vite:** a git rebase that rewrites `vite.config.js` (CRLF) makes Vite hot-restart. Once that
  left `/api` returning index.html until Vite was restarted.
* **Keyboard in the app:** `1`-`4` scenarios, `R` reset, `A` Auto-Sync, `I` Auto-Isolate, `P` presenter mode, `Esc` close
  the focus view.

## 4. Verify before every push

1. `cd dairy-digital-twin/backend` → `..\.venv\Scripts\python tests\run_scenarios.py` must end with **RESULT: ALL PASSED**.
2. `cd dairy-digital-twin/frontend` → `npm run build` must succeed. Two warnings are pre-existing and harmless:
   * chunk size
   * "use no memo" directive
3. UI check, with the backend on :8000 serving a fresh build:

   ```
   W=1536 H=730 python dairy-digital-twin/tools/ui_check.py home twin minimize zoom pages restore
   ```

   * Needs Chrome and `pip install websockets`.
   * Prints `audit ... 'bad': []` per page and `CONSOLE ERRORS/WARNINGS: 0`.
   * Screenshots go to `tools/shots/`. Look at them.
   * Widths checked so far: 1024, 1280, 1366, 1440, 1536, 1600 and 1920. All clean.
   * The presenter's screen is about **1536 px wide (125 % scaling)**. Always check that width.

## 5. Team preferences and standing rules (from the user, keep following them)

**Git and process**
* **Push after every verified checkpoint:** commit → `git fetch` → `git rebase origin/main` → push to `main`.
  **Never force-push.** End commit messages with a `Co-Authored-By:` line for the AI model.
* **Don't break the contract.** Keep the REST/WS shape and the test assertions. The UI must **never read `frame.truth`**
  (hidden ground truth, QA only). `run.bat`, the Vite proxy and the single-port build must keep working.
* **Before editing in the UI-polish task (§9.3):** do not change routes, API calls, form logic or data handling
  without telling the user first.

**Look and feel**
* The user hates generic "AI slop" dashboards (dark neon, glassy cards). The app must look designed.
* **Homepage first** (`#/home`), never dropping straight into the simulation.
* **One tab per feature:** Live twin · Production sync · Predictive maintenance · Cyber defense · Event log.
* **Twin-focused and simple:** hover a unit for a plain-language description plus live status; click to pin it and act.
  "Keep the haptics": hover cards, pinning, flowing pipes, toasts, ripples.
* **Colours:** the user's swatch is cerulean `#0091D3`, sky `#84BEE5`, periwinkle `#8CAAD2`, plus white.
  * The page has an **animated gradient background that reacts to the mouse** (requested by the user; this overrides the
    teammate spec's "no gradients").
  * Cards stay white.
  * Text directly on the gradient uses `text-ink`, not `ink-2`.
* **Status:** colour is used only for status, always with an icon and a word.
* **Every widget has minimize (to a dock) and zoom (focus view).** New cards must be `<Panel wid="...">`.
* **No fixed-height layout rows.** That caused the KPI tiles to overlap the charts. Use flex-wrap, auto-fit grids and
  container queries.

**Talking to the user**
* Casual and brief. They are preparing a live demo for judges.

## 6. Backend in detail

**`engine.py` (DairyPlant)**
* **Timing:** 1 tick = 1 simulated minute. The server runs 2 ticks/s, and speed can be changed. Seed 42.
* **Capacities:**
  * NOMINAL_FLOW 800 L/min
  * silo 24,000 L
  * surge tank 6,000 L
  * each pasteurizer 900 L/min (so B can carry the whole plant)
  * homogenizer 1,000 L/min at about 2,000 PSI
  * filler 1,000 L/min
* **Physics:** volume balance with back-pressure.
* **Counters:** `bottled_l`, `wasted_l` (silo overflow), `unsafe_l` (under-pasteurized), `at_risk_l` (left the silo above
  7 °C), `starved_min`.
* **Injectors:** `SCENARIOS = ("drift", "pump_wear", "cyber_spike", "chiller_spoof")`.

| Scenario | What the injector does |
|---|---|
| `drift` | Homogenizer valve fouling grows to 45 % over 120 ticks. Pressure rises by `400 × fouling`, so it stays inside the legacy 1800-2250 band |
| `pump_wear` | Target `homogenizer_pump_1` or `pasteurizer_a_pump`. Wear runs over 160 ticks and is load-dependent; vibration = `2.0 + 5.1·wear^1.5`; fails at 7.1 mm/s. A repair takes 12 ticks |
| `cyber_spike` | Rogue host `192.168.66.6` scans for 3 ticks, then writes `pump_speed_sp=140` to Pasteurizer A (+40 % flow, heating frozen, so milk misses 72 °C). The PLC replays "400 L/min, 72 °C" |
| `chiller_spoof` | The Engineering WS writes an OPC-UA override that freezes the silo temperature reading at 4 °C while the milk warms by 0.12 °C/tick |

* **Plant actions:** `quarantine()`/`release()` (**pasteurizers only**), `block_ip()`, `dispatch_repair()`,
  `start_flush()` (8-tick micro-CIP at 70 % capacity), `engage_chiller_failover()`.
* **Network traffic:** `_generate_packets()` emits Modbus/OPC-UA frames:
  * SCADA master `10.0.0.10`, HMI `10.0.0.11`, Engineering WS `10.0.0.20`
  * attack frames from the rogue host
* **Independent physical sensors** (assumed uncompromised): drive current, pasteurizer inlet temperature, tank inflow.

**`intelligence.py`**
* **Legacy SCADA:** `legacy_scada(tel)` applies static limits per unit. A quarantined pasteurizer shows
  "offline (valve closed)", not an alarm.
* **Pillar 2 ML: IsolationForest** (scikit-learn, 150 trees, `random_state=0`).
  * **Training:** 500 minutes of a separate healthy plant (seed 2024), skipping the first 30.
  * **6 features** over the last 15 ticks: homogenizer pump vibration (mean of last 3) and its slope; Pasteurizer A pump
    vibration and its slope; homogenizer pressure mean (last 5) and its standard deviation.
  * **Score:** `-score_samples` is normalised between the training 50th and 99.5th percentiles, ÷2, clipped to 0-1.
  * **Anomaly:** ≥ 0.6 for 3 consecutive ticks.
  * **Top contributor:** the feature with the largest |z| against the training mean and standard deviation.
* **RUL (remaining useful life):**
  * `(vib − 2)^(2/3)` is linear in time.
  * A line is fitted to the last 25 samples and extrapolated to `(7.1 − 2)^(2/3)`.
  * A ticket opens when the anomaly flag is set or RUL < 60.
  * Priority: CRITICAL if < 30, HIGH if < 90.
  * With Auto-Sync on, a CRITICAL ticket is auto-dispatched.
* **Pillar 1 drift** (statistics, not ML):
  * The Z-score of homogenizer pressure mean must stay above 4 for 3 ticks.
  * Estimated fouling = `(pressure − 2000)/400`.
  * `t_bottleneck` comes from the fouling trend; `t_starve` and `t_overflow` come from tank net flows.
  * The NetworkX DiGraph gives the cascade (knock-on effects) and checks a path still exists before isolating anything.
* **Auto-Sync control:**
  * intake follows downstream flow, holding the silo at 50 %
  * filler pacing defends a 35-65 % surge band
  * A/B split goes to 0.3 when A's pump has a ticket, and 0 if it failed
  * auto micro-CIP flush at estimated fouling ≥ 12 %
* **Pillar 3 cyber rules:**
  * unknown host
  * a WRITE from anyone but the SCADA master (UNAUTHORIZED_WRITE)
  * out-of-sequence transaction ids
  * a packet burst above 2.2× the EWMA
  * OVERSPEED: drive-current flow above 125 % of the set-point
  * TELEMETRY_SPOOF: reported vs drive-current mismatch above 12 %
  * CHILLER_SPOOF: inlet minus silo reading above 1.5 °C for 3 ticks
* **Auto-Isolate response:**
  * quarantine the pasteurizer if a path remains
  * chiller failover
  * block the source IPs
* **Threat levels:** `NORMAL`, `ELEVATED`, `CRITICAL`, `CONTAINED` (a response is holding the attack off).

**`main.py`**
* **`/ws`:** a `hello` message (history plus latest frame), then one `tick` frame per tick. A frame contains `stages`,
  `pumps`, `counters`, `setpoints`, `legacy`, `engine{units, pillar1, pillar2, pillar3, detection}`, `kpi`, `packets`,
  `log`, `mode` and `truth`.
* **REST:**
  * `POST /api/scenario/{name}?target=`
  * `/api/reset`, `/api/pause`, `/api/resume`, `/api/speed {tick_seconds}`
  * `/api/auto-sync {enabled}`, `/api/auto-isolate {enabled}`
  * `/api/isolate/{unit}`, `/api/release/{unit}`
  * `/api/maintenance/{id}/dispatch`, `/api/chiller/failover`
  * `GET /api/health`, `/api/state`, `/api/history`
* **Performance:** about 21 ms per tick.

**Verified numbers** (fixed seed; `run_scenarios.py` plus measurements; quote them as "in our simulation"):

| Scenario | Result |
|---|---|
| Normal, 300 min | 800 L/min, 0 false alerts or tickets, max anomaly score 0.557 |
| Drift, Auto-Sync OFF | Engine detects at +11 to 12 min. Legacy alarms at +89 (≈78 min later). Last-30-min retention 68.8 % (≈31 % drop), 16,459 L wasted, 108 min starved |
| Drift, Auto-Sync ON | 96.4 % kept, 0 L wasted, 0 min starved, legacy never alarms, 5 flushes |
| Pump wear (homogenizer) | Ticket at +30, legacy at +99, failure at +182 if ignored. RUL within about 3-7 min from mid-life |
| Pump wear (Pasteurizer A) | Auto-Sync OFF: the pump fails at 87.8 % wear. ON: split 30/70, 99.5 % kept |
| Cyber, Auto-Isolate ON | Flagged at +1, isolated at +3 (the same minute as the rogue write), 560 L unsafe |
| Cyber, Auto-Isolate OFF | Spoof and overspeed at +4, 32,480 L unsafe, legacy stays green |
| Chiller, Auto-Isolate OFF | Unauthorized write at +1, cross-check at +15, 44,800 L at risk |
| Chiller, Auto-Isolate ON | 0 L at risk |

## 7. Frontend in detail (`dairy-digital-twin/frontend/src`)

**Files**

| File | What it does |
|---|---|
| `main.jsx` | Fonts, xyflow CSS, `index.css` |
| `index.css` | Tailwind v4 `@theme` tokens (see the palette below), `.panel`, `.hmi`, backdrop styles, focus view and dock styles, the React Flow light override, reduced-motion rules, presenter mode (`[data-presenter="1"] .app-main { zoom: 1.12 }`) |
| `App.jsx` | `WidgetProvider scope={route}` + `<Backdrop/>` + Home or `AppPage` (AppHeader, ScenarioBar, page, Toast). Keyboard shortcuts |
| `lib/twin.js` | `useTwin()` WebSocket hook (auto-reconnect, StrictMode-safe close), `useRoute()` hash router, `post()`, `fmt`, `fmtInt`, `clock`, `LABEL`, `UNITS`, `TONE`, `LEGACY`, `UNIT_INFO` (hover-card text), `SCENARIOS`, `TABS`, `caption()` |
| `lib/actions.js` | `actionsFor(unit, frame)` (pinned-card buttons), `attention()` (caption-strip one-click fixes), `eventMarks()` (chart annotations) |
| `components/ui.jsx` | **`Panel`** (every card; with a `wid` it gets minimize and zoom buttons; `zoom="scale"` magnifies, `zoom="fill"` stretches; `controls="zoom"` hides minimize), `ScrollArea`, `StatusBadge`, `PageHeader`, `Button`, `BTN`, `Kbd`, `Metric` |
| `components/widgets.jsx` | `WidgetProvider` (minimized set in localStorage `ddt.minimized.v1`, ids `scope:wid`), `useWidget`, the `Dock`, `FocusView` (portal, Esc, click outside), `useZoomed()` |
| `components/Backdrop.jsx` | Animated gradient fields, dot grid lit around the cursor, glow, click ripple on empty background. One rAF loop that sleeps when idle. Dimmed over text and cards |
| `components/PlantFloor.jsx` | React Flow plant floor (see the notes below) |
| `components/Verdict.jsx` | Legacy vs Engine panel, "Who noticed first?" timeline, `KpiRow` (container query: 4 tiles across or 2×2), `IncidentStory`, `KnockOn` |
| `components/Charts.jsx` | `ChartCard` (a Panel), `Plot` (measures its width; chart children are `(pw) => <Chart>`), `marksFor()` (event labels placed by measured width in up to 4 rows, hang left near the right edge, slide back inside the plot, drop text rather than overlap). Charts: Throughput, Levels, Pressure, Vibration (8-min rolling mean; thresholds in the legend), Anomaly, Spoof, Chiller, ScenarioChart |
| `components/Chrome.jsx` | `LogoMark`, `AppHeader` (sticky, tabs, Live/Paused, Controls menu with speed, pause, presenter, key list), `ScenarioBar` (hover popovers, Auto-Sync / Auto-Isolate switches, Reset), `CaptionStrip`, `Toast` |
| `pages/Home.jsx` | Landing page: hero, live schematic (zoomable Panel), problem cards, pillars, the line, demo guide, footer |
| `pages/Twin.jsx` | Caption strip; flex row with PlantFloor and the Verdict + KPI column; auto-fit charts row; story and knock-on row |
| `pages/Pillars.jsx` | SyncPage, MaintPage (RUL cards, anomaly, tickets), CyberPage (threat status, PLC checks, charts, alerts, packet monitor), LogPage |

**PlantFloor notes**
* Nodes: Silo, Pasteurizer, Homogenizer (gauge), Surge, Filler, Packaging. Hover or pin an `InfoCard` through `NodeToolbar`.
* Pipes are smooth-step edges with flowing dashes; their colour follows the status.
* The node objects stay stable (the `NODES` constant). Live data reaches them through context, because React Flow v13
  drops a node's measured size when its object is replaced.
* `FloorCanvas` is a separate component so it remounts in the focus view. There it enables scroll-zoom, pan and
  `<Controls>`, and it refits on ResizeObserver and on `document.fonts.ready`.

**Palette** (`@theme` in `index.css`)

| Token | Value |
|---|---|
| bg | `#EAF3FA` |
| surface | `#FFFFFF` |
| surface-2 | `#F0F5FA` |
| line | `#D3DEEA` |
| line-2 | `#E3EAF2` |
| ink | `#152A3B` |
| ink-2 | `#4B5D6E` |
| ink-3 | `#8394A4` |
| accent | `#0B6FA8` (text-safe cerulean) |
| accent-2 | `#E2F1FA` |
| accent-3 / sky | `#84BEE5` |
| brand | `#0091D3` |
| peri | `#8CAAD2` |
| ok | `#2E7D5B` |
| warn | `#C98A00` |
| warn-ink | `#8C6100` |
| crit | `#B83A2E` |
| iso | `#6B3FA0` |

Some hex values are still hardcoded in `Charts.jsx` (`INK`, `ACCENT`, ...), `PlantFloor.jsx` (`C`), the `Home.jsx` schematic
and `twin.js` `TONE.hex`. Centralising them is part of §9.3.

**Gotchas**
* **React Flow v13** has no `colorMode` prop and follows the OS dark mode, so `index.css` forces light CSS variables.
  `fitView` padding numbers are pixels, so pass strings like `'24px'`. Markers use `markerUnits: 'userSpaceOnUse'`.
* **Tailwind v4:** the plain-CSS `.panel` is unlayered, so it beats utility classes. Override it with `!` (for example
  `!bg-line`). Container queries use `@container` + `@min-[560px]:...`.
* **`useZoomed()`** only works in components rendered *inside* a Panel's children, not in the component that renders the
  Panel.

## 8. History of the work (chronological)

1. **Member 1 SimPy module** (`member1_factory_sim`): a CNC_A/CNC_B → Assembly → QC → Packaging line, reviewed and fixed
   (utilisation counting), then a silent-wear scenario on Assembly (about 12.5 % slowdown by 480 min, vibration
   telemetry, `--scenario normal|wear`). Pushed.
2. Pulled the 6-member dairy plan and **built the whole dairy app** (backend, engine, tests, React UI). Pushed.
3. UI rework rounds:
   * "make it better"
   * twin focus with hover descriptions
   * the teammate's `UI_REVIEW_AND_REDESIGN_SPEC.md`: homepage, a tab per feature, the light spec look
   * added scenario 4 (chiller), the CONTAINED threat level, and legacy no longer alarming on our own isolation
4. Wrote **`PRESENTATION_TALKING_POINTS.md`**: it corrects the teammates' PDFs (the app uses a NumPy tick loop, not
   SimPy; drift is caught at about 4 % fouling, not 12 %; Auto-Sync doesn't rebalance A/B during drift; the cyber spike
   makes milk miss 72 °C rather than breaking the hold time).
5. Commit `2e926df`:
   * the user's blue swatch theme and the animated mouse-reactive background
   * minimize and zoom on every widget
   * fixed KPI tiles overlapping the charts on the Live twin (the fixed `660px` row)
   * chart labels that don't collide
6. This file and `tools/ui_check.py`.

## 9. OPEN WORK: the user's latest request (not started; pick up here)

The user sent five items. Only the ML question (§9.2) has been answered. Do them in this order, and commit and push
after each verified step:

### 9.1 Smoother numbers
> "Make the number fluctuations more smooth, rather than showing each change on every tick, maybe show the avg for the
> last 30-60 secs or something."

Proposed design (not yet agreed in detail; tell the user it's display-only):
* A central hook `useSteadyFrame(frame)` in `lib/`, applied in `App` to the frame handed to display components. It must
  never affect the engine or tests.
* For each **physical readout path**, keep a rolling mean over about **30 s of real time, capped at 60 ticks**. Paths:
  * stage flows, temperatures, levels and pressure
  * pump vibration
  * `kpi.throughput_lpm` and `retention_pct`
  * `checks.pasteurizer_a.implied_flow` and `reported_flow`, `checks.chiller.reported_c` and `inlet_c`
  * edge flows
* **Snap to the new value** when the raw value moves away from the mean by more than a per-quantity threshold (about
  4σ of the engine noise; noise is in `engine.telemetry()`, roughly ±2 L/min on flows, ±0.08 °C, ±6 PSI). Real events
  (attack, isolation, starvation) then show instantly and only noise is averaged. Deduplicate by `frame.tick`
  (StrictMode).
* **Do not smooth** engine decisions or scores (statuses, anomaly score, z-scores, RUL, mismatch %) or cumulative
  counters. A smoothed number next to a raw verdict would contradict it.
* Optionally use Magic UI's **Number Ticker** in the KPI tiles to tween between values (fits §9.3).

### 9.2 "What is our ML algorithm?" (already answered in chat; for reference)
* **IsolationForest** for Pillar 2 predictive maintenance, trained only on healthy operation.
* It scores how unusual the last 15 minutes of pump vibration and homogenizer pressure look; see §6 for the features,
  normalisation and alarm rule.
* A physics-based RUL fit (`(vib−2)^(2/3)` linear in time, to the 7.1 mm/s failure) turns that into "fails in N min" and
  a maintenance ticket about 70 min before legacy alarms.
* Drift detection (Z-score) and the cyber checks (rules plus physics cross-checks) are **not** ML.

### 9.3 UI polish brief (the user's full instructions, verbatim)
```
GOAL
Polish this website for a hackathon demo. Improve the UI quality, add loading
states, and keep all existing functionality working.

AVAILABLE RESOURCES (use these, do not invent components)
- Magic UI (MIT): https://github.com/magicuidesign/magicui
  Animated components for hero sections, text effects, buttons and cards.
- shadcn/ui (MIT): https://github.com/shadcn-ui/ui
  Base components: button, card, input, dialog, skeleton, tabs, toast.
- Fusion UI: https://github.com/nyxb-ui/ui
  Extra shadcn and Magic UI components.
- Loading UI: https://loading-ui.com
  Spinners and loading animations. Copy the code snippet only.

RULES
- Clone reference repos into ./reference/ (do not put them in the app folder).
- Copy only the components you actually use. Do not copy whole repos into the app.
- Keep each library's license in the file header comment or a NOTICE file.
- Do not copy images, logos, icons or fonts from showcase sites. Use free
  sources only (Unsplash, Pexels, Google Fonts, or Lucide icons).
- Do not change routes, API calls, form logic or data handling unless a
  fix is required. Tell me before changing any of these.

STEP 1: INSPECT (do this first, change nothing yet)
- Read the project structure, package.json, and the main layout and pages.
- Identify the framework, styling method (Tailwind, CSS modules, etc.) and
  any existing theme or design tokens.
- List every UI element you see: navbar, hero, buttons, forms, cards,
  footer, modals, and any loading states that already exist.
- Report the list and your plan before editing.

STEP 2: THEME
- Create or update one central theme file with: colour palette (primary,
  secondary, accent, background, text, muted), font pairing, spacing,
  border radius, and shadow scale.
- Apply the theme across the app. Remove hardcoded colours where you can.
- Keep the existing look where it already works. Upgrade only what looks
  weak.

STEP 3: LOADING STATES
- Add a full-page loading screen for the first load (brand mark plus a
  simple animation, under 2 seconds, then fade out).
- Add skeleton loaders for any data-driven section.
- Add button loading states (spinner and disabled state) for every
  async action.
- Add a fallback for empty states and failed requests (message plus
  retry where useful).

STEP 4: UI ELEMENT UPGRADES
- Buttons: hover, focus and active states, with smooth transitions.
- Cards: consistent padding, radius, shadow, and a subtle hover lift.
- Forms: clear focus rings, inline validation messages, and labels for
  every input.
- Navbar: sticky, responsive, with a working mobile menu.
- Hero: one animated element from Magic UI, used sparingly.
- Footer: consistent with the theme.

STEP 5: MOTION AND POLISH
- Add page transitions or section fade-ins. Keep durations under 400 ms.
- Respect prefers-reduced-motion: disable animations when it is set.
- Check contrast (WCAG AA) on all text.

STEP 6: CHECK
- Test at mobile (375 px), tablet (768 px) and desktop (1280 px) widths.
- Run the build and any existing tests. Fix any errors.
- Confirm no console errors on the main pages.

GIT RULES
- Commit after each step with a clear message (e.g. "feat: add loading
  screen").
- If a step breaks the build, revert that step and report what failed.
```

Notes for doing it here:
* **Step 1 needs a check-in:** report the inventory and plan to the user before editing.
* **Inventory so far:**
  * no shadcn setup; no forms or inputs (only buttons, switches, a speed segmented control)
  * existing loading state: "Connecting to the plant engine…" spinner in `App.jsx`
  * `post()` returns `{ok:false, message}` on failure and shows a toast
  * no per-button pending states
  * the homepage header is not sticky and has no mobile menu
  * the app header has a scrolling tab strip on mobile
* **`reference/` must be git-ignored.** Clone with `--depth 1` (sparse if possible).
* **Likely new dependencies** (tell the user first):
  * `motion` (Magic UI)
  * `clsx` + `tailwind-merge` (shadcn `cn()`)
  * Radix only if a Radix-based component is actually used
* **Good fits:**
  * Magic UI *Border Beam* or *Animated Shiny Text* on the hero (one element only)
  * *Number Ticker* for the KPIs
  * shadcn *Skeleton* for cards before the first frame
  * a loading-ui spinner in buttons and the splash screen
* **Pages to test:** home, twin, sync, maint, cyber and log at 375, 768 and 1280 px, plus 1536 px for the presenter.

### 9.4 More anomaly types, applicable to ANY unit
> "Add more anomalies or scenarios, maybe 2-3 more of different types, and make it so that these anomalies can be
> applied to any machinery on the plant floor, e.g. I select cyber attack and I select the silo, and then whatever is
> stored gets leaked, the silo becomes empty."

Where the code stands today:
* Each injector is wired to one unit:
  * drift → homogenizer only
  * pump wear → two pumps only
  * cyber → Pasteurizer A only
  * chiller spoof → silo only
* `quarantine()` and `manual_isolate()` only accept pasteurizers.

Suggested design:
* **API:** `POST /api/scenario/{type}?target={unit}`. Keep the current defaults so the existing calls, the tests and
  keys 1-4 behave exactly as today.
* **Fault types × units:** add an `engine.faults` dict `{unit: {type, start_tick, params}}` and apply its effects in
  `step()`.

| Fault type | Effect on tanks (silo, surge tank) | Effect on flow units |
|---|---|---|
| New: **Leak** (physical) | Level falls with no matching outflow | A share of the flow is lost between stages |
| New: **Cyber takeover** of any PLC | Rogue writes from `192.168.66.6`: silo or surge **drain valve opens** (it empties, the user's example) and the reported level is spoofed as normal | Pasteurizer overspeed (existing); homogenizer pressure set-point; filler speed |
| New: **Sensor fault** (stuck or noisy reading, hardware not attack) | Reading freezes or goes noisy; no rogue traffic | Same |
| New: **Motor trip / jam** (sudden stop) | (not applicable) | Unit drops to 0 flow and recovers after a repair dispatch |
| Existing: drift, pump wear | (pick sensible effects per unit kind) | Generalise to every flow unit where it makes sense |

* **Detection must exist for every combination** (the engine must catch what we inject), using telemetry only:
  * a **mass-balance residual** per unit (in − out − Δlevel), which catches leaks and drains
  * the existing UNAUTHORIZED_WRITE / UNKNOWN_SOURCE rules, plus the generic packets for the target unit
  * a stuck sensor: near-zero variance, or disagreement with a neighbour
* **Response for units without a twin:** block the IP and **revert the set-point** (last-known-good); close the drain
  valve. Quarantine stays pasteurizer-only (NetworkX path check).
* **Legacy must stay naive:** it should only notice late (low-level limit, etc.).
* **Tests:** add `run_scenarios.py` cases for each new type. Keep all existing checks green, and keep the 4 original
  scenarios byte-identical (determinism check).
* **UI:**
  * ScenarioBar: a "Fault" picker (type) plus a "Target" picker (unit), with the 4 presets kept as quick buttons
  * `caption()`, `actionsFor()` and `attention()` cover the new types
  * `UNIT_INFO`-style plain-language blurbs
* **Docs:** update README and the talking points.

### 9.5 Theme: "a little more bluish, it looks too light, add some darker accents, but not too dark"
Ideas:
* a deep navy accent band (for example the app header or scenario bar in about `#0E3A5B`, `#123F63` or `#1B4F7A`, with
  white text)
* slightly stronger blue in `bg` and `surface-2` (about `#DCEBF7` / `#E6F0F9`)
* bluer lines and borders (`#C5D6E8`)
* a darker cerulean for primary buttons and active tabs
* keep cards white and status colours unchanged

Do this together with §9.3 Step 2 (one central theme file). Re-check WCAG AA.

### 9.6 Open question to clear up with the user
The user said the KPI tiles still overlap the charts "in the blue theme". The image they attached was **byte-identical
to the first (old cream-theme) screenshot** (`#F6F3EC` background; the current build has no such colour). The overlap
audit passes at 1024, 1280, 1366, 1440, 1536, 1600 and 1920 px. If they still see it:
* ask for a fresh screenshot plus the browser window size and zoom level
* make sure they hard-refresh (Ctrl+F5) and are on `http://localhost:5173` or `:8000` with a fresh build
