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

**Reset Plant to Normal** restarts the plant between judge questions. Your toggle settings are kept. The speed buttons
(0.5×–4×) change how many simulated minutes run per second (1× = 2 ticks/s, 1 tick = 1 simulated minute).

## Code map (plan roles)

| File | Plan role | Contents |
|---|---|---|
| `backend/engine.py` | Pod 1 — M1 physics, M2 injectors | Tick-based plant physics (L/min, °C, PSI, mm/s), volume balances with back-pressure, the 4 fault/attack injectors, Modbus/OPC-UA packet generator, spoofable PLC telemetry |
| `backend/intelligence.py` | Pod 2 — M3 sync/isolation, M4 ML/OT | Legacy SCADA thresholds, IsolationForest + RUL, NetworkX dependency graph and cascade ETA, Auto-Sync controller, packet rules, spoof cross-checks, surgical isolation |
| `backend/main.py` | Pod 2 — M3 API hub | FastAPI, `/ws` broadcaster at 2 Hz, REST controls |
| `frontend/src/components/PlantFloor.jsx` | Pod 3 — M5 | React Flow U-shaped plant floor: fill-level tanks, pressure gauge, piped flow edges, RUL / CIP badges, quarantine shield |
| `frontend/src/components/Header.jsx` | Pod 3 — M5 | Top bar (clock, speed, pause, reset) + scenario deck + Auto-Sync / Auto-Isolate switches |
| `frontend/src/components/Monitors.jsx` | Pod 3 — M6 | Retro legacy SCADA screen vs Three-Pillar Engine, detection head start, live incident timeline |
| `frontend/src/components/KpiStrip.jsx`, `Insights.jsx`, `Charts.jsx` | Pod 3 — M6 | KPI tiles + per-pillar tabs (auto-switch on scenario): charts, RUL cards, dispatch tickets, SOC feed, packet monitor, event log |
| `backend/tests/run_scenarios.py` | M6 QA | Headless pass/fail check of every scenario |

## REST / WebSocket contract

* `GET /ws`: `hello` message (history + latest frame), then one `tick` frame per simulated minute containing
  `stages`, `pumps`, `counters`, `setpoints`, `legacy`, `engine.{units,pillar1,pillar2,pillar3,detection}`, `kpi`,
  `packets`, `log`, `mode`, plus `truth` (hidden ground truth, for QA only; the detectors never read it).
* `POST /api/scenario/{drift|pump_wear|cyber_spike|chiller_spoof}` (`?target=homogenizer_pump_1|pasteurizer_a_pump`)
* `POST /api/reset`, `/api/pause`, `/api/resume`, `/api/speed {"tick_seconds":0.5}`
* `POST /api/auto-sync {"enabled":true}`, `/api/auto-isolate {"enabled":true}`
* `POST /api/isolate/{unit}`, `/api/release/{unit}`, `/api/maintenance/{ticket_id}/dispatch`
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
