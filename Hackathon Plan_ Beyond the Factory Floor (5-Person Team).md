# **Hackathon Plan: Beyond the Factory Floor (6-Person Dairy Digital Twin)**

## **Three-Pillar Causal Digital Twin, Predictive Maintenance & Cyber-Resilient Auto-Synchronization Engine**

**Event Context:** RNS Institute of Technology (RNSIT) — 3rd Semester Hackathon, Department of Computer Science & Engineering (Cyber Security)  
**Domain Focus:** Automated Dairy Processing & Cold-Chain Plant  
**Team Structure:** 6 Members (3 Paired Pods — Zero Merge Conflicts)

---

# **1\. Problem Statement & Dairy Domain Strategic Angle**

## **Problem Statement**

A modern manufacturing facility experiences unexpected overall production slowdowns even when individual machines appear to operate strictly within normal parameters. Traditional legacy monitoring tools analyze operational metrics in silos, completely missing cross-stage dependencies, impending component degradation, and stealthy cyber-physical interference.

## **Why a Dairy Production Plant Wins the Demo**

Yes, we are building a live discrete-event simulation—and anchoring it to a **Dairy Processing & Packaging Plant** makes the problem immediately concrete and high-stakes:

* **Real Physics & Spoilage Stakes:** Unlike generic widget factories, milk in intermediate surge tanks cannot sit idle indefinitely. A bottleneck downstream causes upstream raw milk buffers to risk thermal spoilage or overflow, while an uncoordinated upstream halt wastes pasteurizer heating energy.  
* **Realistic Parallel & Sequential Stages:**  
  * **Raw Milk Receiving & Chilling Silo** (4°C intake buffer)  
  * **Parallel HTST Pasteurization Lines (Pasteurizer\_A & Pasteurizer\_B)** (72°C for 15s—allows live load rebalancing and surgical isolation)  
  * **Homogenization & Standardization** (fat separation & pressure balancing)  
  * **Intermediate Surge Tank (WIP Buffer)** (temperature-critical holding buffer)  
  * **Automated Aseptic Filling & Sealing**  
  * **Cold-Storage Packaging & Dispatch**  
* **Cybersecurity Department Alignment:** Dairy/food-processing plants rely on PLCs controlling pasteurization temperatures, homogenizer valves, and CIP (Clean-in-Place) cycles. Tampering with pasteurizer flow rates or spoofing chiller sensors creates immediate safety and spoilage hazards—making **Surgical Section Isolation** (quarantining Pasteurizer\_A while rerouting milk to Pasteurizer\_B without halting the plant) a compelling cyber-defense demo for CSE (Cyber Security) judges.

---

# **2\. Three-Pillar System Architecture (Dairy Plant Edition)**

* 

```
                                THREE-PILLAR DAIRY DIGITAL TWIN ARCHITECTURE

  +---------------------------------------------------------------------------------------------------+
  |                         SIMULATED DAIRY PROCESSING PLANT (SimPy)                                  |
  |  [Raw Chilling Silo] ---> [Pasteurizer_A / Pasteurizer_B] ---> [Homogenizer] ---> [Surge Tank]    |
  |                                                                                         |         |
  |                                      [Cold-Chain Packaging] <--- [Aseptic Filling] <----+         |
  +---------------------------------------------------------------------------------------------------+
                                               | Live Telemetry (L/min, °C, PSI, RPM) + OT Packets
                                               v
  +---------------------------------------------------------------------------------------------------+
  |                          CORE INTELLIGENCE & CONTROL ENGINE (Python)                              |
  |                                                                                                   |
  |  +-----------------------------+  +---------------------------+  +-----------------------------+  |
  |  | PILLAR 1:                   |  | PILLAR 2:                 |  | PILLAR 3:                   |  |
  |  | PRODUCTION SYNCHRONIZATION  |  | PREDICTIVE MAINTENANCE    |  | CYBER THREAT DETECTION      |  |
  |  | - Flow & surge tank Z-score |  | - IsolationForest + RUL   |  | - Over-pressure / RPM spike |  |
  |  | - Intake valve throttling   |  | - Fouling/seal wear alert |  | - Unauthorized PLC/CIP cmd  |  |
  |  | - Pasteurizer A/B rebalance |  | - Maintenance dispatch    |  | - Chiller sensor spoof check|  |
  |  | - Auto-Sync ON/OFF toggle   |  | - T_spoil / T_starve calc |  | - Surgical cell isolation   |  |
  |  +-----------------------------+  +---------------------------+  +-----------------------------+  |
  +---------------------------------------------------------------------------------------------------+
                                               | WebSocket Stream (State, Alerts & Actions)
                                               v
  +---------------------------------------------------------------------------------------------------+
  |                           REAL-TIME DIGITAL TWIN UI (React + Vite)                                |
  |  - Interactive Dairy Line (React Flow)        - Legacy SCADA Monitor vs. 3-Pillar Split View      |
  |  - Isolated Pasteurizer Quarantine Visuals    - Live Maintenance & SOC Alert Feed                 |
  +---------------------------------------------------------------------------------------------------+
```

* ## **Pillar 1: Production Synchronization (Flow Balancing & Bottleneck Mitigation)**

* **Continuous Stage Monitoring:** Tracks flow rates (L/min), pasteurization temperatures (°C), homogenizer pressure (PSI), and intermediate surge tank levels (%) across a NetworkX directed dependency graph.  
* **Silent Cascade Detection:** Uses rolling Z-score drift and lag cross-correlation across surge tanks to flag slowdowns even when individual machine sensors remain inside "normal" green bounds (e.g., Homogenizer throughput silently drifting down by 12% due to valve fouling—still inside its normal pressure band, yet causing the Surge Tank to starve Aseptic Filling 3 minutes later).  
* **Closed-Loop Workflow Balancing:**  
  * **Upstream Intake Throttling:** Dynamically throttles raw milk intake pumps via proportional queue-balancing logic so surge tanks stay at an optimal 50% level without overflowing.  
  * **Dynamic Parallel Load Rebalancing:** Shifts milk flow from a degraded pasteurizer (Pasteurizer\_A) onto its healthy parallel twin (Pasteurizer\_B) to preserve near-100% bottling throughput.  
  * **Interactive Proof ("Auto-Sync: OFF vs. ON" Toggle):** Demonstrates surge tank overflow/starvation and a 32% bottling drop when OFF vs. stabilized 50% tank levels and 94% throughput retention when ON.

## **Pillar 2: Predictive Maintenance (Degradation Forecasting & Targeted Alerts)**

* **Dairy Equipment Degradation Modeling:** Combines Scikit-Learn IsolationForest anomaly scoring with rolling variance and trend extrapolation on pump vibration, homogenizer PSI variance, and heat-exchanger thermal efficiency to catch gradual plate fouling or seal wear before sudden breakdown.  
* **Remaining Useful Life (RUL) & Time-to-Spoil/Starve (T\_starve) Forecasting:** Calculates exact minutes remaining before a degrading pump fails or an upstream milk buffer breaches safe holding time/capacity.  
* **Automated Maintenance Personnel Dispatch:** Generates prioritized maintenance alerts specifying the exact dairy unit (e.g., Homogenizer Pump \#1), degraded metric trend, estimated RUL, and a recommended micro-maintenance / CIP flush window.

## **Pillar 3: Cyber Threat Detection & Surgical Isolation (OT/ICS Defense)**

* **Multi-Vector Dairy OT Threat Detection:**  
  * **Unusual Production Spikes & Unauthorized Commands:** Flags abnormal pump over-speeding (e.g., sudden \+40% flow surge that prevents full 15-second pasteurization) and unauthenticated PLC write/CIP valve commands.  
  * **Telemetry Spoofing Check:** Cross-checks reported chiller/pasteurizer PLC speeds against actual downstream surge tank inflow rates to catch Stuxnet-style stealth attacks where SCADA screens show normal 72°C / nominal flow while physical output is throttled.  
  * **Suspicious Network Activity Monitor:** Inspects simulated Modbus/OPC-UA industrial packets for burst anomalies, unknown source IPs, or out-of-sequence actuator frames.  
* **Surgical Section Isolation (Zero Full-Plant Shutdown):** Instead of shutting down the entire dairy plant and risking batch spoilage, the engine automatically isolates only the compromised unit (Pasteurizer\_A), closes its diversion valve, blocks unauthorized PLC traffic, and reroutes milk flow through Pasteurizer\_B.

# **3\. Lightweight Tech Stack (Optimized for Fast Local Execution)**

* **Simulation & Dairy OT Generator:** Python, SimPy (discrete-event fluid/batch simulation), NumPy  
* **Intelligence, ML & API Layer:** FastAPI, WebSockets, NetworkX (dependency graph & valve rerouting), Scikit-Learn (IsolationForest \+ rolling drift/RUL regression)  
* **Frontend & Visualization:** React (Vite), Tailwind CSS, React Flow (interactive dairy floor topology with flow & quarantine visuals), Recharts (live L/min throughput & surge tank charts)

* # **4\. 6-Person Team Role Split & Deliverables (3 Paired Pods)**

With all 6 members present, organize into **3 Pods of 2** with strict JSON interfaces so nobody blocks anyone else:

* 

| Pod & Member | Role Title | Core Domain & Deliverables | Interface / Output |
| :---- | :---- | :---- | :---- |
| **Pod 1 — Member 1** | Dairy Physics & SimPy Lead (Backend) | Build the 6-stage dairy discrete-event simulation (Chilling Silo, parallel Pasteurizer\_A/B, Homogenizer, Surge Tank, Aseptic Filler, Packaging) with realistic L/min, °C, and PSI physics. | Live SimPy state engine |
| **Pod 1 — Member 2** | Fault, Spoilage & Cyberattack Injector (Backend) | Build real-time scenario triggers: (1) Silent Homogenizer valve drift, (2) Pump wear/hard breakdown, and (3) Unauthorized \+40% pasteurizer spike, rogue CIP command, & chiller telemetry spoof. | `telemetry_stream` \+ `ot_packets` JSON stream |
| **Pod 2 — Member 3** | Sync Controller & Surgical Isolation Architect (Backend) | Implement Pillar 1 closed-loop workflow balancing (intake throttling, Pasteurizer\_A/B load rebalancing, Auto-Sync ON/OFF) \+ Pillar 3 surgical diversion valve isolation \+ FastAPI WebSocket hub. | FastAPI REST/WS endpoints & control actions |
| **Pod 2 — Member 4** | Predictive Maintenance & OT Security ML Engineer (Backend) | Implement Pillar 2 (IsolationForest \+ RUL & T\_starve forecasting \+ maintenance dispatch tickets) and Pillar 3 (spike/command validator, PLC-vs-tank spoof detector, Modbus packet monitor). | `maintenance_alerts` & `cyber_alerts` JSON |
| **Pod 3 — Member 5** | Digital Twin Dairy Topology UI Developer (Frontend) | Build the interactive React Flow dairy floor diagram with animated milk-flow edges, amber/red bottleneck propagation, maintenance countdown badges, red quarantine shields, and Scenario/Auto-Sync controls. | Interactive React Flow Canvas & Control Panel |
| **Pod 3 — Member 6** | SCADA Split-View, Alert Feed, QA & Pitch Lead (Frontend \+ Demo) | Build the "Legacy SCADA (ALL GREEN)" vs. "Three-Pillar Engine" comparison panel, Recharts L/min & tank charts, Maintenance/SOC alert feed, run QA freeze 90 mins early, record backup video, and lead pitch. | Split-View Analytics, Demo Video & 3-Min Pitch |

## **5\. Hackathon Execution Timeline & Coordination Rules**

## **Phase 1: Architecture Alignment & Data Contract Lock (0:00 – 0:30)**

* **All Hands:** Lock JSON schemas for dairy telemetry (flow\_lpm, temp\_c, pressure\_psi, tank\_level\_pct), synchronization actions, RUL maintenance tickets, and cyber isolation events.  
* Pod 3 (Members 5 & 6\) immediately builds the UI against mock JSON while Pods 1 & 2 build the Python simulation and intelligence layers.

## **Phase 2: Parallel Pod Construction (0:30 – 2:30)**

* **Pod 1 (Members 1 & 2):** Build the SimPy dairy plant and real-time fault/cyberattack injectors.  
* **Pod 2 (Members 3 & 4):** Build the closed-loop Auto-Sync controller, surgical diversion isolation router, RUL predictive maintenance engine, OT security rules, and FastAPI server.  
* **Pod 3 (Members 5 & 6):** Build the React Flow dairy topology, Legacy SCADA vs. Three-Pillar comparison panel, Recharts graphs, and Maintenance/SOC alert feed.

## **Phase 3: Integration & Three-Scenario Verification (2:30 – 3:30)**

Connect WebSockets end-to-end and verify three high-impact dairy demo triggers:

* **Silent Homogenizer Drift \+ Auto-Sync ON/OFF:** Shows upstream intake throttling and parallel pasteurizer balancing preventing surge tank overflow/starvation.  
  * **Gradual Pump Seal Wear \+ Predictive Maintenance Alert:** Shows RUL countdown and automated maintenance technician dispatch before line failure.  
  * **Unauthorized Pasteurizer Spike / PLC Spoof \+ Surgical Isolation:** Shows Pasteurizer\_A quarantined via diversion valve and milk rerouted to Pasteurizer\_B with zero full-plant shutdown.

## **Phase 4: Code Freeze, Quality Assurance & Pitch Practice (Final 90 Minutes)**

* **Enforce Strict Code Freeze:** Stop adding new features 90 minutes before submission.  
* Member 6 runs end-to-end stress tests, records an uninterrupted backup video of all three dairy scenarios, and leads full-team rehearsals of the 3-minute judging pitch.

```
                             6-PERSON POD TIMELINE & MILESTONES

  Phase 1: Lock Dairy Schemas (0:00 - 0:30)
  +---------------------------------------------------------------------------------+
  | Lock JSON schema for dairy telemetry (L/min, °C, PSI), sync, RUL & isolation.   |
  +---------------------------------------------------------------------------------+
                                          |
                                          v
  Phase 2: Parallel Pod Build (0:30 - 2:30)
  +------------------------+  +------------------------+  +-------------------------+
  | Pod 1 (M1 & M2)        |  | Pod 2 (M3 & M4)        |  | Pod 3 (M5 & M6)         |
  | SimPy Dairy + Injectors|  | Sync/Isolate + ML/OT   |  | React Flow + SCADA UI   |
  +------------------------+  +------------------------+  +-------------------------+
                                          |
                                          v
  Phase 3: Integration & 3-Scenario Verification (2:30 - 3:30)
  +---------------------------------------------------------------------------------+
  | Connect WebSockets. Verify: (1) Homogenizer Drift + Auto-Sync, (2) Pump Wear    |
  | RUL Alert, and (3) Pasteurizer Cyber Spike + Surgical Diversion Isolation.      |
  +---------------------------------------------------------------------------------+
                                          |
                                          v
  Phase 4: Freeze & Pitch Prep (Final 90 Mins)
  +---------------------------------------------------------------------------------+
  | Code freeze. Member 6 records backup demo video & leads 3-min pitch rehearsal.  |
  +---------------------------------------------------------------------------------+
```

