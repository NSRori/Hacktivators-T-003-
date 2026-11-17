r"""FastAPI server - WebSocket broadcaster (/ws) + REST scenario & control endpoints.

    cd backend
    ..\.venv\Scripts\python -m uvicorn main:app --port 8000

Every TICK_SECONDS (default 0.5 s = 2 Hz) the plant advances one simulated minute, the
Three-Pillar engine analyses it, and the full frame is pushed to every WebSocket client.
If ../frontend/dist exists, the built dashboard is also served at http://localhost:8000/
"""
import asyncio
import json
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from engine import ALL_SCENARIOS, FAULT_TYPES, FAULT_UNITS, PUMPS, SCENARIOS, DairyPlant
from intelligence import ThreePillarEngine, baseline

SEED = int(os.getenv("SEED", "42"))
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def chart_point(f):
    s, chk = f["stages"], f["engine"]["pillar3"]["checks"]
    return {"tick": f["tick"], "throughput": s["filler"]["flow_lpm"], "nominal": 800,
            "silo": s["silo"]["level_pct"], "surge": s["surge_tank"]["level_pct"],
            "vib_h": f["pumps"]["homogenizer_pump_1"]["vibration_mms"],
            "vib_a": f["pumps"]["pasteurizer_a_pump"]["vibration_mms"],
            "anomaly": f["engine"]["pillar2"]["anomaly_score"],
            "pressure": s["homogenizer"]["pressure_psi"],
            "a_reported": s["pasteurizer_a"]["flow_lpm"], "a_physical": chk["pasteurizer_a"]["implied_flow"],
            "b_flow": s["pasteurizer_b"]["flow_lpm"],
            "silo_temp": s["silo"]["temp_c"], "inlet_temp": chk["chiller"]["inlet_c"]}


class Hub:
    def __init__(self):
        self.clients = set()
        self.paused = False
        self.tick_seconds = float(os.getenv("TICK_SECONDS", "0.5"))
        self.auto_sync = True
        self.auto_isolate = True
        self.reset()

    def reset(self):
        self.plant = DairyPlant(seed=SEED)
        self.brain = ThreePillarEngine(self.plant, self.auto_sync, self.auto_isolate)
        self.history = deque(maxlen=300)
        self.latest = None

    def mode(self):
        return {"auto_sync": self.brain.auto_sync, "auto_isolate": self.brain.auto_isolate,
                "paused": self.paused, "tick_seconds": self.tick_seconds}

    def step(self):
        tel = self.plant.step()
        out = self.brain.analyze(tel, self.plant.packets)
        frame = {"type": "tick", **tel, **out, "packets": self.plant.packets,
                 "mode": self.mode(), "truth": self.plant.truth()}
        self.history.append(chart_point(frame))
        self.latest = frame
        return frame

    async def broadcast(self, msg):
        text = json.dumps(msg)
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                self.clients.discard(ws)


hub = Hub()


async def ticker():
    while True:
        t0 = time.perf_counter()
        if not hub.paused:
            await hub.broadcast(hub.step())
        await asyncio.sleep(max(0.02, hub.tick_seconds - (time.perf_counter() - t0)))


@asynccontextmanager
async def lifespan(app):
    baseline()                      # train IsolationForest once before serving
    task = asyncio.create_task(ticker())
    yield
    task.cancel()


app = FastAPI(title="Dairy Digital Twin - Three-Pillar Engine", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Toggle(BaseModel):
    enabled: bool


class Speed(BaseModel):
    tick_seconds: float


async def done(ok=True, message=""):
    await hub.broadcast({"type": "mode", **hub.mode()})
    return {"ok": ok, "message": message, "mode": hub.mode()}


# ------------------------------------------------------------------ REST
@app.get("/api/health")
async def health():
    return {"ok": True, "tick": hub.plant.tick, "clients": len(hub.clients), **hub.mode()}


@app.get("/api/state")
async def state():
    return hub.latest or {}


@app.get("/api/history")
async def history():
    return list(hub.history)


@app.post("/api/scenario/{name}")
async def scenario(name: str, target: str = "homogenizer_pump_1"):
    if name not in ALL_SCENARIOS:
        raise HTTPException(400, f"unknown scenario; choose one of {list(ALL_SCENARIOS)}")
    if name in FAULT_TYPES and target not in FAULT_UNITS:
        raise HTTPException(400, f"unknown unit; choose one of {list(FAULT_UNITS)}")
    if name == "pump_wear" and target not in PUMPS:
        raise HTTPException(400, f"unknown pump; choose one of {list(PUMPS)}")
    hub.plant.trigger(name, target=target)
    return await done(True, f"scenario {name} triggered")


@app.post("/api/reset")
async def reset():
    hub.auto_sync, hub.auto_isolate = hub.brain.auto_sync, hub.brain.auto_isolate
    hub.reset()
    await hub.broadcast({"type": "reset"})
    return await done(True, "plant reset to normal")


@app.post("/api/auto-sync")
async def auto_sync(t: Toggle):
    hub.brain.set_auto_sync(t.enabled)
    return await done(True, f"Auto-Sync {'ON' if t.enabled else 'OFF'}")


@app.post("/api/auto-isolate")
async def auto_isolate(t: Toggle):
    hub.brain.set_auto_isolate(t.enabled)
    return await done(True, f"Auto-Isolate {'ON' if t.enabled else 'OFF'}")


@app.post("/api/isolate/{unit}")
async def isolate(unit: str):
    ok, msg = hub.brain.manual_isolate(unit)
    return await done(ok, msg)


@app.post("/api/release/{unit}")
async def release(unit: str):
    ok = hub.plant.release(unit)
    return await done(ok, f"{unit} released" if ok else f"{unit} is not isolated")


@app.post("/api/contain/{unit}")
async def contain(unit: str):
    """Operator response to a hijacked PLC: block the attacker (and isolate a pasteurizer)."""
    ok, msg = hub.brain.contain(unit)
    return await done(ok, msg)


@app.post("/api/chiller/failover")
async def chiller_failover():
    ok = hub.plant.engage_chiller_failover()
    if ok:
        hub.brain._log("crit", "pillar3", "MANUAL RESPONSE: operator switched silo to backup chiller + redundant sensor")
    return await done(ok, "backup chiller engaged" if ok else "no chiller incident to respond to")


@app.post("/api/maintenance/{ticket_id}/dispatch")
async def dispatch(ticket_id: str):
    ok = hub.brain.dispatch(ticket_id)
    return await done(ok, f"{ticket_id} dispatched" if ok else f"{ticket_id} cannot be dispatched")


@app.post("/api/pause")
async def pause():
    hub.paused = True
    return await done(True, "paused")


@app.post("/api/resume")
async def resume():
    hub.paused = False
    return await done(True, "running")


@app.post("/api/speed")
async def speed(s: Speed):
    hub.tick_seconds = min(2.0, max(0.1, s.tick_seconds))
    return await done(True, f"{1 / hub.tick_seconds:.1f} ticks/s")


# ------------------------------------------------------------------ WebSocket
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    hub.clients.add(ws)
    await ws.send_text(json.dumps({"type": "hello", "history": list(hub.history),
                                   "latest": hub.latest, "mode": hub.mode()}))
    try:
        while True:
            await ws.receive_text()     # clients only listen; this detects disconnects
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


if DIST.exists():                       # serve the production build on the same port
    app.mount("/", StaticFiles(directory=DIST, html=True), name="ui")
