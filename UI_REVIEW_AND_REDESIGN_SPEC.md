# Dairy Digital Twin: UI Review and Redesign Spec

**Audience:** the AI agent (and any human) working on `dairy-digital-twin/frontend`.
**Status:** review only. Nothing in the repo was changed by this review.
**Date of review:** 2026-11-17, against `main` at commit `6bacefe`.

## 0. How this was tested

Backend (`uvicorn main:app --port 8000`) and frontend (`npm run dev`) were run locally and driven in real Chrome with Playwright at 1600x1000 and 390x844. Scenarios were triggered through the REST API (`cyber_spike`, `drift` with Auto-Sync OFF) and full-page screenshots were taken.

Backend QA (`backend/tests/run_scenarios.py`) passes completely. The backend is in good shape. **This document is almost entirely about the frontend.**

## 1. Hard constraints (do not break these)

1. Do **not** change the REST/WebSocket contract described in `README.md`, and do not change what `backend/tests/run_scenarios.py` asserts. The tests must still print `ALL PASSED`.
2. Keep `run.bat`, the Vite dev proxy (`vite.config.js`) and the single-port build mode (`npm run build`, served by the backend on :8000) working.
3. Keep the demo flow: 4 scenario buttons, Auto-Sync toggle, Auto-Isolate toggle, speed buttons, Pause, Reset Plant to Normal.
4. The jury demo is about 3 minutes on a projector. **Readability from several metres away beats information density.**
5. Never read `truth` from the WebSocket frame in the UI. It is hidden ground truth for QA only.

## 2. What works (keep it)

- Live streaming, scenario buttons, toggles and Reset all behave correctly.
- The drift scenario with Auto-Sync OFF shows engine flagged at +17 min and legacy alarm at +89 min, with a "72 min earlier warning" pill. This is the best number in the project.
- Cyber spike with Auto-Isolate ON quarantines Pasteurizer_A, blocks `192.168.66.6` and reroutes through B.
- Component split is clean (`Topology`, `SplitView`, `Pillars`, `Charts`, `Feeds`, `Header`).

## 3. Bugs and inconsistencies (fix first)

| # | Problem | Where | Suggested fix |
|---|---|---|---|
| B1 | During the cyber spike the legacy panel shows **WARNING** (Pasteurizer_A reads "no flow" after isolation), while the banner under it says **"Legacy alarm: still ALL GREEN"**. This contradicts the central story. | `SplitView.jsx` line ~20 (overall label) and lines ~63-64 (banner uses `det.legacy_first_tick === null`) | Decide one truth. Either keep legacy green until it would really alarm and show "no flow" only on the engine side, or make the banner reflect what the panel shows. The banner and the panel must never disagree. |
| B2 | Pillar 3 card shows **THREAT NORMAL** while it also lists a blocked host and an isolated cell. | `Pillars.jsx` line ~88; backend `intelligence.py` lines ~260-268 (threat decays to NORMAL 15 ticks after the last alert) | Add a **CONTAINED** state (for example when any cell is isolated or any host is blocked) and style it distinctly from NORMAL. This may need a one-line backend field; if so, add it without removing existing fields. |
| B3 | OT packet monitor: DROPPED rows are struck through and overlap the next text, columns are cramped and the table is clipped at the bottom. | `Feeds.jsx` | Fixed row height, truncate with ellipsis, a status column (DROPPED as a badge, not strikethrough), and a scroll region with a fixed max height. |
| B4 | Console error on first load: `WebSocket connection to 'ws://localhost:5173/ws' failed: WebSocket is closed before the connection is established.` Probably React `StrictMode` double-mount closing the first socket. | `lib/twin.js` line ~34, `main.jsx` | Guard the connect/cleanup so the first socket is not closed mid-handshake, or ignore close events from a superseded socket. Harmless, but it reads as sloppy in DevTools. |
| B5 | Mobile (390px): the header wraps awkwardly and the topology title wraps one word per line. | `Header.jsx`, `Topology.jsx` | Low priority. Only fix if cheap. |

## 4. Why it currently reads as generic "AI dashboard"

- **Palette:** default near-black navy with neon cyan/teal, fuchsia and emerald glows. This is the stock cyber-dashboard look.
- **Typography:** monospace used for much more than numbers, plus tiny uppercase letter-spaced labels everywhere.
- **Layout:** every panel is the same bordered rounded card at the same visual weight, so nothing leads. Full page is about 5,000px tall (4 stacked rows).
- **Hero visual too small:** the plant diagram (`Topology.jsx`) uses 9-12.5px text and fills only the top-left of its panel. The Raw Chilling Silo node is clipped at the left edge. Unreadable on a projector.

## 5. Redesign spec

### 5.1 Colour scheme (light "milk and stainless steel")

Use CSS variables in `index.css` and reference them everywhere. Do not hard-code Tailwind slate/emerald/fuchsia classes in components.

```css
:root {
  --bg:        #F6F3EC;  /* warm milk off-white */
  --surface:   #FFFFFF;
  --surface-2: #EFEBE1;  /* subtle panel tint */
  --line:      #D9D3C5;  /* hairline dividers */
  --ink:       #1B2A33;  /* primary text */
  --ink-2:     #5B6770;  /* secondary text */
  --accent:    #2F5D7C;  /* stainless-steel blue: the ONLY brand accent */
  --accent-2:  #E8EFF4;  /* accent wash */
  /* status colours are for status ONLY, never decoration */
  --ok:        #2E7D5B;
  --warn:      #C98A00;
  --crit:      #B83A2E;
  --iso:       #6B3FA0;  /* quarantined / isolated */
}
```

Rules:
- Red, amber, green and purple appear **only** to encode status. Everything else is ink, grey or the single accent.
- No glows, no neon shadows, no gradient text. Use flat fills and 1px hairlines.
- Optional dark variant is fine later, but light is the default (projects better in bright rooms).
- Check contrast: body text at least 4.5:1, status text at least 3:1 on its background.

### 5.2 Typography

- One humanist sans for everything: **IBM Plex Sans** (or DM Sans). Use `--font-mono` **only** for numeric readouts that benefit from tabular alignment (`font-variant-numeric: tabular-nums` is often enough).
- Sentence-case labels. Remove all-caps tracked micro-labels except at most one per panel.
- Minimum text size on anything the jury must read: **14px**. Key numbers 28-40px.

### 5.3 Layout hierarchy (presenter-first)

Above the fold at 1600x1000, show only:
1. **Slim header:** title, LIVE badge, scenario buttons, the two toggles, Reset. Move speed and Pause into a small "controls" popover.
2. **Plant diagram (hero, about 60% width):** see 5.4.
3. **Legacy vs Engine split-view (about 40% width):** see 5.5.
4. **A caption strip** (one sentence, changes per scenario), for example "Silent drift: every legacy sensor is still inside its limits."

Everything else (Pillar cards, six charts, maintenance dispatch, SOC feed, packet monitor, event log) goes below the fold or into a collapsible drawer ("Details"). Default state: collapsed. Add a **Presenter mode** toggle (keyboard `P`) that hides the drawer and enlarges type further.

Keyboard shortcuts for presenters: `1`-`4` trigger scenarios, `R` resets, `A` toggles Auto-Sync, `I` toggles Auto-Isolate. Show them as small hints on the buttons.

### 5.4 Plant diagram (`Topology.jsx`)

- Fit the diagram to its container (`fitView` with padding) so no node is clipped; fix the silo clipping.
- Node text at least 14px. Show at most 3 numbers per node (flow, one key physical value, status).
- Draw **tanks as tanks** (a vertical rounded vessel with a visible fill level) for Chilling Silo and Surge Tank, with the 50% target line marked on the surge tank.
- Pasteurizers show temperature as a small gauge or bar with the 72 C line marked.
- Pipe (edge) thickness scales with flow in L/min; animation speed also scales. Isolated edges are dashed purple with the "valve closed" tag.
- Status is shown by outline colour plus an icon plus a word, never colour alone.
- Quarantine shield on Pasteurizer_A stays, but flat and bold (no glow).

### 5.5 Split-view (`SplitView.jsx`)

- Two large side-by-side panels: "Legacy SCADA" and "Three-Pillar Engine". Each has one big status word and the per-stage list.
- Add a **detection timeline** under them: a horizontal bar from scenario start, a marker where the engine flagged the problem and a marker where legacy alarmed (or "legacy never alarmed"), with the gap labelled, for example "72 min earlier". This is the hero metric; right now it is a small pill.
- Resolve bug B1 here.

### 5.6 Charts (`Charts.jsx`)

- Show 3 charts by default: bottling throughput, buffer levels, and one scenario-relevant chart (pressure for drift, vibration/RUL for wear, PLC-vs-physical for cyber). The other charts live in the Details drawer.
- Annotate events directly on the chart ("drift starts", "ticket raised", "isolated") using reference lines with labels.
- The vibration chart is currently too noisy: smooth it or plot a rolling mean plus the failure threshold.

### 5.7 Alerts, tickets, packets (`Feeds.jsx`)

- Calm list style: severity as a small left bar, not a full coloured box. One line of summary, expandable detail.
- De-duplicate repeated text (the SOC feed repeats the same host and write twice).
- Fix B3.

## 6. Suggested order of work

1. Bugs B1, B2, B3, B4 (small, high credibility).
2. Palette and typography via CSS variables (5.1, 5.2). This alone removes most of the "AI template" look.
3. Layout: presenter-first above-the-fold structure and Details drawer (5.3).
4. Plant diagram upgrade (5.4) and detection timeline (5.5).
5. Chart annotations and feed polish (5.6, 5.7).
6. Mobile fixes (B5) only if time remains.

## 7. Definition of done

- `python tests/run_scenarios.py` (in `backend/`) still prints `RESULT: ALL PASSED`.
- `npm run build` succeeds in `frontend/`.
- At 1600x1000, with no scrolling, a viewer can read the plant diagram, both monitor verdicts and the detection timeline from 3 metres away.
- No text on the main view is smaller than 14px; no status is conveyed by colour alone.
- Legacy panel and legacy banner never contradict each other in any of the 4 scenarios.
- Pillar 3 never shows "NORMAL" while a cell is isolated or a host is blocked.
- No console errors on load.
- Screenshots of all 4 scenarios (and the normal state) captured and reviewed before declaring done.

## 8. Honesty notes for the demo copy

All figures come from a simplified simulation (illustrative physics, fixed seed). UI copy should avoid implying real-plant measurements; "in our simulation" is the safe phrasing.
