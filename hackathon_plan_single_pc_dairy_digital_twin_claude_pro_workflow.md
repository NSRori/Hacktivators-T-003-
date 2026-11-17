# Hackathon Plan: Beyond the Factory Floor (Single-PC + Claude Pro Edition)
**Event:** RNS Institute of Technology (RNSIT) — 3rd Semester Hackathon, Dept. of CSE (Cyber Security)  
**Problem Statement:** PS 1 — *Beyond the Factory Floor* (Detecting hidden cross-stage slowdowns & preventing cascading disruptions)  
**Domain:** Automated Dairy Processing & Cold-Chain Plant  
**Execution Setup:** 1 Primary Workstation + Claude Pro + 6-Person Relay & Parallel Support Team  

---

## 1. Strategic Shift: Why 1 PC + Claude Pro Wins (If Managed Properly)
Consolidating development onto a single machine with Claude Pro eliminates Git merge conflicts, branch desyncs, and network push issues. However, it introduces two new bottlenecks:
1. **The Keyboard Bottleneck:** 5 people watching 1 person prompt Claude wastes 80% of your team's capacity.
2. **Claude Pro Quota & Context Bloat:** Pasting massive 600-line files repeatedly burns through your 5-hour rolling message limit and causes context degradation.

**The Solution:** Split the 6-person team into **Two Active Pods**:
* **On-PC Engineering Pod (3 Members rotating in 45-minute sprints):** Driver (prompts & integrates), Logic Co-Pilot (verifies math/thresholds), and UI/QA Co-Pilot (tests scenarios in browser).
* **Off-PC Domain, Pitch & Validation Pod (3 Members working in parallel):** Dairy Physics & Edge-Case Designer, Slide Deck & Pitch Architect, and Demo Director / Backup Recorder.

---

## 2. Three-Pillar Dairy Digital Twin Architecture

Anchoring the simulation to a **Dairy Processing & Packaging Plant** gives judges concrete physical stakes (milk spoilage, surge tank overflow, and pasteurization safety) and clear parallel routing (`Pasteurizer_A` & `Pasteurizer_B`).

```text
                       SINGLE-PC DAIRY DIGITAL TWIN ARCHITECTURE

  +-------------------------------------------------------------------------------------+
  |                     DAIRY PLANT SIMULATION ENGINE (backend/engine.py)               |
  |  [Raw Chilling Silo (4°C)] ---> [Pasteurizer_A / Pasteurizer_B (72°C)]              |
  |                                          |                                          |
  |                                          v                                          |
  |  [Cold-Chain Packaging] <--- [Aseptic Filler] <--- [Surge Tank] <--- [Homogenizer]  |
  +-------------------------------------------------------------------------------------+
                                             |
                      Live Telemetry (L/min, °C, PSI, Tank %) & OT Packets
                                             v
  +-------------------------------------------------------------------------------------+
  |                   THREE-PILLAR INTELLIGENCE & CONTROL (backend/main.py)             |
  |                                                                                     |
  |  +--------------------------+ +-------------------------+ +----------------------+  |
  |  | PILLAR 1:                | | PILLAR 2:               | | PILLAR 3:            |  |
  |  | PRODUCTION SYNC          | | PREDICTIVE MAINTENANCE  | | CYBER OT DEFENSE     |  |
  |  | - Rolling Z-score drift  | | - IsolationForest score | | - +40% flow spike    |  |
  |  | - Surge tank balancing   | | - Remaining Useful Life | | - Rogue CIP/PLC cmd  |  |
  |  | - Intake valve throttle  | | - Time-to-Starve/Spoil  | | - Chiller spoof check|  |
  |  | - Pasteurizer A/B shift  | | - Tech dispatch ticket  | | - Surgical isolation |  |
  |  | - Auto-Sync ON/OFF switch| |                         | |   (Diversion valve)  |  |
  |  +--------------------------+ +-------------------------+ +----------------------+  |
  +-------------------------------------------------------------------------------------+
                                             |
                              FastAPI WebSocket Stream (/ws)
                                             v
  +-------------------------------------------------------------------------------------+
  |                     DIGITAL TWIN DASHBOARD (frontend/src/App.jsx)                   |
  |  - Interactive 6-Node Dairy Topology (React Flow) with Animated Flow & Quarantine   |
  |  - Split-Screen: "Legacy SCADA (ALL GREEN)" vs. "Three-Pillar Causal Engine"        |
  |  - Live L/min Throughput & Surge Tank Charts (Recharts) + Scenario Control Bar      |
  +-------------------------------------------------------------------------------------+
```

### Pillar 1: Closed-Loop Production Synchronization
* **The "Appearing Normal" Problem:** Individual machines stay within green thresholds (e.g., Homogenizer pressure stays inside normal PSI limits), yet a silent 12% valve fouling drift starves the Surge Tank 3 minutes later.
* **Automated Response (`Auto-Sync: ON`):**
  * Dynamically throttles raw milk intake pumps to hold the intermediate **Surge Tank** near an optimal **50% level** (preventing overflow or thermal spoilage).
  * Rebalances load from a degraded pasteurizer (`Pasteurizer_A`) onto its healthy twin (`Pasteurizer_B`) to sustain near-100% bottling throughput.
  * Includes a live **`Auto-Sync: OFF / ON`** toggle to prove throughput collapse (OFF) vs. self-healing stabilization (ON).

### Pillar 2: Predictive Maintenance & Spoilage Forecasting
* **Degradation Detection:** Combines Scikit-Learn `IsolationForest` anomaly scoring with rolling variance trends on pump vibration and homogenizer pressure.
* **Actionable Alerts:** Forecasts **Remaining Useful Life ($RUL$)** in minutes and **Time-to-Buffer-Exhaustion ($T_{\text{starve}}$)**, generating a maintenance dispatch ticket naming the exact unit (e.g., *Homogenizer Pump #1*) and recommended CIP flush window before failure occurs.

### Pillar 3: Cyber Threat Detection & Surgical Isolation (CSE Cyber Security Edge)
* **OT/ICS Attack Detection:**
  * Flags unusual $+40\%$ production spikes (which prevent milk from holding $72^\circ\text{C}$ for the required 15 seconds) and unauthorized PLC/CIP commands.
  * Detects **Telemetry Spoofing** by comparing reported PLC flow rates against actual physical surge tank inflow rates.
* **Surgical Section Isolation:** Instead of shutting down the entire factory, the engine triggers `Pasteurizer_A`'s diversion valve, quarantines the compromised unit, and reroutes 100% of milk flow through `Pasteurizer_B` with zero plant downtime.

---

## 3. Clean Modular File Structure (Optimized for Claude Pro)
Keep the entire codebase strictly inside **3 core files** so Claude Pro can generate, debug, and update each module cleanly without losing context:

```text
dairy-digital-twin/
├── backend/
│   ├── engine.py        # 6-stage Dairy physics, fault/attack injectors, RUL & Sync math
│   └── main.py          # FastAPI server, WebSocket broadcaster (/ws), REST scenario triggers
└── frontend/
    └── src/
        └── App.jsx      # React Flow dairy topology, SCADA split-view, Recharts, controls
```

### Lightweight Local Stack
* **Backend:** Python 3, `fastapi`, `uvicorn`, `numpy`, `scikit-learn` (tick-based simulation loop at 2 Hz—lighter and easier to synchronize with WebSockets than blocking threads).
* **Frontend:** React (`Vite`), `tailwindcss`, `reactflow`, `recharts`, `lucide-react`.

---

## 4. 6-Person Team Role Split & Rotation Schedule

| Member | Primary Role | Station | Concrete Responsibilities |
| :--- | :--- | :--- | :--- |
| **Member 1** | **Lead Prompt & Backend Driver** | **On-PC** | Operates the workstation during backend build; feeds structured prompts to Claude Pro for `engine.py` and `main.py`; manages local `git commit` checkpoints. |
| **Member 2** | **Simulation Math & Control Co-Pilot** | **On-PC** | Sits beside Driver; validates dairy parameters ($\text{L/min}$, $72^\circ\text{C}$, tank %), verifies Z-score/RUL thresholds, and tests API endpoints via terminal. |
| **Member 3** | **Lead Frontend Driver & UI Integrator** | **On-PC** | Takes over keyboard for frontend phase; prompts Claude Pro for `App.jsx` (`React Flow` + `Recharts`); tunes layout, animations, and responsiveness. |
| **Member 4** | **Dairy Domain & Judge Q&A Strategist** | **Off-PC** | Writes realistic dairy fault descriptions, alert copy, and prepares crisp technical answers for cybersecurity & ML questions from judges. |
| **Member 5** | **Pitch Deck & Visual Storyteller** | **Off-PC** | Builds the 5-slide presentation deck on a secondary laptop/tablet (Problem $\rightarrow$ Why Dairy $\rightarrow$ 3 Pillars $\rightarrow$ Surgical Isolation $\rightarrow$ Live Demo Metrics). |
| **Member 6** | **Demo Director, QA Lead & Recorder** | **Off-PC / QA** | Enforces the 60-minute pre-judging code freeze, stress-tests all 3 demo buttons, records a clean backup screen-capture video, and leads pitch rehearsals. |

---

## 5. Step-by-Step Execution Timeline

### Phase 1: Environment Setup & Backend Core (`0:00 – 1:15`)
* **On-PC (Members 1 & 2):**
  1. Create project folder and initialize local Git (`git init`) for instant rollback safety.
  2. Prompt Claude Pro to generate `backend/engine.py` + `backend/main.py` in one clean pass.
  3. Run `uvicorn main:app --reload` and verify JSON output in terminal for normal flow and all 3 injected scenarios.
  4. Run `git add . && git commit -m "v1: working dairy backend"`.
* **Off-PC (Members 4, 5 & 6):** Draft the 5-slide pitch outline and exact demo script timing (3 minutes total).

### Phase 2: Digital Twin Frontend (`1:15 – 2:45`)
* **On-PC (Members 3 & 1):**
  1. Scaffold Vite React app (`npm create vite@latest frontend -- --template react`) and install `reactflow recharts lucide-react tailwindcss`.
  2. Prompt Claude Pro with the exact JSON payload from `/ws` to generate `frontend/src/App.jsx`.
  3. Verify all visual states:
     * **Normal State:** Smooth green milk flow across all 6 stages; Surge Tank steady at ~50%.
     * **Scenario 1 (`Silent Homogenizer Drift`):** Legacy SCADA panel stays **ALL GREEN**, while 3-Pillar Engine highlights the hidden bottleneck and stabilizes flow when `Auto-Sync` is toggled **ON**.
     * **Scenario 2 (`Pump Seal Wear`):** Triggers $RUL$ countdown badge and dispatches a Maintenance Ticket before breakdown.
     * **Scenario 3 (`Pasteurizer_A Cyber Spike`):** Flags unauthorized $+40\%$ flow surge, snaps `Pasteurizer_A` into a **RED QUARANTINE SHIELD**, and reroutes 100% flow through `Pasteurizer_B`.
  4. Run `git add . && git commit -m "v2: full UI + backend integration"`.

### Phase 3: Polish, Edge-Case Hardening & Freeze (`2:45 – 3:30`)
* **All Hands:**
  1. Add a **"Reset Plant to Normal"** button so you can cleanly reset the simulation between judge questions.
  2. **Strict Code Freeze at T-60 mins:** No new features after this point.
  3. **Member 6** records a 90-second uninterrupted backup video showing all 3 scenarios executing smoothly on localhost.

### Phase 4: Pitch Rehearsal (`Final 30 Mins`)
Run two timed 3-minute rehearsals:
1. **0:00 – 0:45 (Hook & Problem):** Why legacy SCADA shows "ALL GREEN" while hidden stage drift ruins dairy batches.
2. **0:45 – 2:15 (Live Demo — 3 Scenarios):** Trigger Silent Drift + `Auto-Sync ON/OFF` $\rightarrow$ Trigger Predictive Maintenance $RUL$ alert $\rightarrow$ Trigger Cyber Spike & Surgical Isolation of `Pasteurizer_A`.
3. **2:15 – 3:00 (Architecture & Cyber Impact):** Highlight how surgical cell isolation prevents full-plant shutdowns and batch spoilage.

---

## 6. Claude Pro Quota-Saving Rules
1. **Never paste full files for small bug fixes:** Copy only the exact traceback (last 15 lines) or the single broken function.
2. **Use Local Git Snapshots:** Before asking Claude to modify a working file, run `git commit -am "checkpoint"`. If Claude's edit introduces a bug, run `git checkout .` instead of spending 4 prompts trying to untangle it.
3. **One Feature Per Prompt:** Ask for complete, runnable code with zero placeholders (`// TODO`), test it immediately, and move on.