# Dairy Digital Twin — Three-Pillar Causal Engine

Local web app built from `hackathon_plan_single_pc_dairy_digital_twin_claude_pro_workflow.md`
(PS 1 *Beyond the Factory Floor*, RNSIT). A live dairy plant simulation streams telemetry over a
WebSocket to a React dashboard that compares a **Legacy SCADA** monitor with the
**Three-Pillar Engine** (Production Sync · Predictive Maintenance · Cyber OT Defense).

```
Raw Chilling Silo (4 °C) ─┬─> Pasteurizer_A ─┐
                          └─> Pasteurizer_B ─┴─> Homogenizer ─> Surge Tank ─> Aseptic Filler ─> Cold-Chain Packaging
```

## Run it

**One click (Windows):** double-click `run.bat`. It sets up `.venv` and `node_modules` the first time, starts both
servers in their own windows and opens http://localhost:5173.

**Manually (two terminals):**

```powershell
# terminal 1 - backend API + WebSocket on http://localhost:8000
cd backend
..\.venv\Scripts\python -m uvicorn main:app --port 8000

# terminal 2 - dashboard on http://localhost:5173
cd frontend
npm run dev
```

First-time setup, if you are not using `run.bat`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt
cd frontend; npm install
```

**Single port (demo backup):** run `npm run build` once in `frontend/`. The backend then also serves the built
dashboard at http://localhost:8000.

## Demo script (the 3 plan scenarios + 1 bonus)

| # | Button | What happens | Toggle to compare |
|---|---|---|---|
| 1 | **Silent Homogenizer Drift** | Valve fouling slowly cuts capacity (1000 → 550 L/min). Pressure stays inside the legacy 1800-2250 PSI band, so legacy shows **ALL GREEN**. The engine spots the pressure Z-score drift about 11 min after it starts. | **Auto-Sync OFF:** bottling drops about 31 %, surge tank starves, silo overflows. **ON:** intake throttling, filler pacing and automatic micro-CIP flushes hold about 96 % throughput with no waste. |
| 2 | **Pump Seal Wear** (choose pump) | Vibration rises. IsolationForest flags it, the RUL countdown appears and a dispatch ticket opens about 70 min before legacy alarms. | Click **Dispatch technician** (or Auto-Sync auto-dispatches at CRITICAL). Do nothing and the pump fails. On *Pasteurizer_A Feed Pump*, Auto-Sync shifts load 30/70 to B. |
| 3 | **Pasteurizer_A Cyber Spike** | Rogue host `192.168.66.6` scans the PLCs, then writes `pump_speed_sp=140` (+40 % flow, heating loop frozen, under 72 °C). The PLC replays "400 L/min, 72 °C", so legacy stays green. | **Auto-Isolate ON:** surgical isolation. A is quarantined, its IP is blocked and 100 % of flow goes through B with zero downtime. **OFF:** SOC alerts fire and unsafe milk accumulates. |
| 4 | **Chiller Sensor Spoof** | A compromised Engineering WS freezes the silo temperature reading at 4 °C while the milk warms. | The cross-check against the independent pasteurizer inlet sensors catches it. Auto-Isolate switches to the backup chiller. |

**Reset** restarts the plant between judge questions. Your switch settings are kept. Speed (½× to 4×), Pause and
Presenter mode are in the **Controls** menu (1× = 2 ticks/s, 1 tick = 1 simulated minute).

## Using the app

* **Homepage** (`#/home`) explains the problem, the line and the three pillars, and has a three-minute demo guide.
  Nothing starts until you open the twin.
* **Tabs:** `Live twin` · `Production sync` (Pillar 1) · `Predictive maintenance` (Pillar 2) · `Cyber defense` (Pillar 3) ·
  `Event log`. Each pillar has its own page with its charts, numbers and actions.
* **Live twin:** hover any unit for what it does, what the engine watches and its live status. Click a unit to pin
  the card and act (isolate, release, dispatch, cleaning flush, backup chiller). The caption strip says in one sentence
  what is happening and offers the one-click fix.
* **Every card is a widget:** `–` minimizes it to the dock at the bottom of the screen (the other cards close the gap;
  click a chip or *Restore all* to bring it back, and the choice is remembered in this browser), and `⤢` opens it on its
  own in a focus view (`Esc` or a click outside closes it). In the focus view charts fill the screen, number cards are
  magnified, and the plant floor gains scroll-to-zoom, drag-to-pan and zoom buttons.
* **Keyboard:** `1`-`4` run a scenario, `R` reset, `A` Auto-Sync, `I` Auto-Isolate, `P` presenter mode, `Esc` close the focus view.
* **Look:** sky-blue / periwinkle / white palette (CSS variables in `src/index.css`) on an animated gradient background
  that reacts to the mouse (`components/Backdrop.jsx`; it calms down under *reduce motion*). Cards stay white so text
  keeps its contrast. IBM Plex Sans. Status colours are used only for status, and always come with an icon and a word
  (`../UI_REVIEW_AND_REDESIGN_SPEC.md`).

## Code map (plan roles)

| File | Plan role | Contents |
|---|---|---|
| `backend/engine.py` | Pod 1 — M1 physics, M2 injectors | Tick-based plant physics (L/min, °C, PSI, mm/s), volume balances with back-pressure, the 4 fault/attack injectors, Modbus/OPC-UA packet generator, spoofable PLC telemetry |
| `backend/intelligence.py` | Pod 2 — M3 sync/isolation, M4 ML/OT | Legacy SCADA thresholds, IsolationForest + RUL, NetworkX dependency graph and cascade ETA, Auto-Sync controller, packet rules, spoof cross-checks, surgical isolation |
| `backend/main.py` | Pod 2 — M3 API hub | FastAPI, `/ws` broadcaster at 2 Hz, REST controls |
| `frontend/src/pages/Home.jsx` | Pod 3 — M6 | Landing page: problem, live schematic, three pillars, the line, demo guide |
| `frontend/src/pages/Twin.jsx`, `components/PlantFloor.jsx` | Pod 3 — M5 | Presenter view; React Flow plant floor with vessels, gauge, flow pipes, hover / pin info cards and actions |
| `frontend/src/components/Verdict.jsx` | Pod 3 — M6 | Legacy SCADA vs Three-Pillar Engine, "who noticed first" detection timeline, KPIs, incident story, knock-on effects |
| `frontend/src/pages/Pillars.jsx`, `components/Charts.jsx` | Pod 3 — M6 | Production sync / Predictive maintenance / Cyber defense / Event log pages; annotated charts, tickets, SOC alerts, packet monitor |
| `frontend/src/components/Chrome.jsx`, `lib/` | Pod 3 — M5 | Header, tabs, scenario bar, caption strip; WebSocket hook, hash router, action helpers |
| `frontend/src/components/ui.jsx`, `widgets.jsx`, `Backdrop.jsx` | Pod 3 — M5 | `Panel` (every card, with minimize / zoom), dock and focus view, the animated background |
| `backend/tests/run_scenarios.py` | M6 QA | Headless pass/fail check of every scenario |

## REST / WebSocket contract

* `GET /ws`: `hello` message (history + latest frame), then one `tick` frame per simulated minute containing
  `stages`, `pumps`, `counters`, `setpoints`, `legacy`, `engine.{units,pillar1,pillar2,pillar3,detection}`, `kpi`,
  `packets`, `log`, `mode`, plus `truth` (hidden ground truth, for QA only; the detectors never read it).
* `POST /api/scenario/{drift|pump_wear|cyber_spike|chiller_spoof}` (`?target=homogenizer_pump_1|pasteurizer_a_pump`)
* `POST /api/reset`, `/api/pause`, `/api/resume`, `/api/speed {"tick_seconds":0.5}`
* `POST /api/auto-sync {"enabled":true}`, `/api/auto-isolate {"enabled":true}`
* `POST /api/isolate/{unit}`, `/api/release/{unit}`, `/api/maintenance/{ticket_id}/dispatch`, `/api/chiller/failover`
* `engine.pillar3.threat_level` is `NORMAL`, `ELEVATED`, `CRITICAL` or `CONTAINED` (a response is holding the attack off)
* `GET /api/health`, `/api/state`, `/api/history`

## Verify

```powershell
cd backend
..\.venv\Scripts\python tests\run_scenarios.py
```

## Modelling assumptions (stated for judges)

* 1 tick = 1 simulated minute. Physics is a simplified volume balance, not CFD. Every number is illustrative.
* The design throughput is 800 L/min. Each pasteurizer is rated 900 L/min with a hold tube sized for 15 s at
  900 L/min, so B can legally carry the full plant alone.
* The cyber spike makes milk unsafe through **temperature** (the attacker freezes the heating loop, so +40 % flow
  falls below 72 °C), not through hold time.
* Pump vibration follows `2.0 + 5.1·wear^1.5` mm/s and fails at 7.1 mm/s (ISO 10816-style zone). The RUL model
  linearises that law.
* "Physical" cross-check signals (drive current, pasteurizer inlet temperature, tank inflow) are assumed to come
  from instruments the attacker did not compromise.
* The plan specified SimPy. Following the single-PC plan, this uses a deterministic tick loop instead (seed 42),
  which is easier to sync with WebSockets. Member 1's SimPy module is still in `../member1_factory_sim`.
