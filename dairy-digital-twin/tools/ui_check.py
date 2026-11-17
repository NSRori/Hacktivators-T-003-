"""Headless-Chrome UI check: screenshots, overlap audit, console errors, minimize/zoom.

Needs: the backend running on :8000 (it also serves frontend/dist, so run `npm run build` first),
Google Chrome, and `pip install websockets` (Pillow optional, only for cropping shots).

    W=1536 H=730 python tools/ui_check.py home twin minimize zoom pages restore

Plans are defined in P at the bottom. Screenshots go to tools/shots/ (git-ignored).
"audit" prints overlapping cards ("OVERLAP a x b") or content spilling out of a card ("SPILL").
"""
import asyncio, base64, json, os, subprocess, sys, tempfile, urllib.request
import websockets

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)
PROFILE = os.path.join(tempfile.gettempdir(), "ddt-cdp-profile")
CHROME = os.environ.get("CHROME", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
BASE = os.environ.get("BASE", "http://localhost:8000")
W, H = int(os.environ.get("W", 1600)), int(os.environ.get("H", 1000))
TAG = os.environ.get("TAG", f"{W}")

AUDIT = r"""(() => {
  const top = [...document.querySelectorAll('section.panel')].filter(e => !e.parentElement.closest('section.panel'));
  const name = (e) => (e.querySelector('h3,h2')?.textContent || '?').slice(0, 28);
  const bad = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const a = top[i].getBoundingClientRect(), b = top[j].getBoundingClientRect();
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push('OVERLAP ' + name(top[i]) + ' x ' + name(top[j]));
  }
  for (const p of top) if (p.scrollHeight > p.clientHeight + 2 && getComputedStyle(p).overflowY === 'visible') bad.push('SPILL ' + name(p) + ' ' + p.scrollHeight + '>' + p.clientHeight);
  const kpi = [...top].find(p => name(p).startsWith('Production at'));
  const cols = kpi ? getComputedStyle(kpi.querySelector('[class*="grid-cols-2"]')).gridTemplateColumns.split(' ').length : null;
  return { panels: top.length, kpiCols: cols, bad };
})()"""


def api(path, body=None):
    req = urllib.request.Request(BASE + "/api" + path, method="POST", data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


async def main(plan):
    proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9336",
                             f"--user-data-dir={PROFILE}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9336/json/list").read())
                page = next(p for p in pages if p["type"] == "page")
                break
            except Exception:
                await asyncio.sleep(0.2)
        errors, mid, pending = [], [0], {}
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=80_000_000) as ws:
            async def reader():
                async for raw in ws:
                    m = json.loads(raw)
                    if "id" in m and m["id"] in pending:
                        pending.pop(m["id"]).set_result(m)
                    elif m.get("method") == "Runtime.exceptionThrown":
                        errors.append("EXC " + str(m["params"]["exceptionDetails"].get("exception", {}).get("description", m["params"]))[:300])
                    elif m.get("method") == "Runtime.consoleAPICalled" and m["params"]["type"] in ("error", "warning"):
                        errors.append(m["params"]["type"].upper() + " " + " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])[:300])
                    elif m.get("method") == "Log.entryAdded" and m["params"]["entry"]["level"] == "error":
                        errors.append("LOG " + m["params"]["entry"]["text"][:300])

            async def cmd(method, params=None):
                mid[0] += 1
                fut = asyncio.get_event_loop().create_future()
                pending[mid[0]] = fut
                await ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
                return await fut

            async def ev(expr):
                r = await cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
                return r["result"].get("result", {}).get("value")

            async def mouse(x, y, click=False):
                await cmd("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
                if click:
                    for t in ("mousePressed", "mouseReleased"):
                        await cmd("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "clickCount": 1})

            rt = asyncio.create_task(reader())
            for m in ("Runtime.enable", "Page.enable", "Log.enable"):
                await cmd(m)
            await cmd("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False})
            await cmd("Page.navigate", {"url": BASE + "/"})
            await asyncio.sleep(2.5)
            await ev("localStorage.clear()")
            for step in plan:
                k = step[0]
                if k == "wait":
                    await asyncio.sleep(step[1])
                elif k == "api":
                    r = api(*step[1:])
                    print("  api", step[1], "->", r.get("message"))
                elif k == "go":
                    await ev(f"location.hash = '/{step[1]}'")
                    await asyncio.sleep(1.5)
                elif k == "eval":
                    print("  eval", step[1][:40], "->", await ev(step[1]))
                elif k == "audit":
                    print("  audit", step[1], "->", await ev(AUDIT))
                elif k == "move":
                    for i in range(8):                       # a short drag across the background
                        await mouse(step[1] + i * 6, step[2] + i * 3)
                        await asyncio.sleep(0.03)
                    await asyncio.sleep(0.6)
                elif k == "clicksel":
                    await ev(f"document.querySelector({json.dumps(step[1])})?.scrollIntoView({{block: 'center'}})")
                    await asyncio.sleep(0.4)
                    rect = await ev(f"(() => {{ const e = document.querySelector({json.dumps(step[1])}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] }})()")
                    print("  click", step[1], "->", rect)
                    if rect:
                        await mouse(rect[0], rect[1], True)
                    await asyncio.sleep(0.9)
                elif k == "key":
                    await cmd("Input.dispatchKeyEvent", {"type": "keyDown", "key": step[1], "code": step[1], "windowsVirtualKeyCode": 27 if step[1] == "Escape" else 0})
                    await cmd("Input.dispatchKeyEvent", {"type": "keyUp", "key": step[1], "code": step[1]})
                    await asyncio.sleep(0.6)
                elif k == "hover":
                    rect = await ev(f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"{step[1]}\"]').getBoundingClientRect(); return [r.x + r.width/2, r.y + 30] }})()")
                    await mouse(*rect)
                    await asyncio.sleep(0.8)
                elif k in ("view", "full"):
                    if k == "full":
                        m = await cmd("Page.getLayoutMetrics")
                        h = int(m["result"]["cssContentSize"]["height"])
                        await cmd("Emulation.setDeviceMetricsOverride", {"width": W, "height": h, "deviceScaleFactor": 1, "mobile": False})
                        await asyncio.sleep(0.8)
                    r = await cmd("Page.captureScreenshot", {"format": "png"})
                    path = os.path.join(OUT, f"v3_{TAG}_{step[1]}.png")
                    open(path, "wb").write(base64.b64decode(r["result"]["data"]))
                    print("  shot", path)
                    if k == "full":
                        await cmd("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False})
                        await asyncio.sleep(0.5)
            rt.cancel()
        print("CONSOLE ERRORS/WARNINGS:", len(errors))
        for e in errors[:15]:
            print("   ", e)
    finally:
        proc.kill()


P = {
    "home": [("api", "/reset"), ("wait", 1.5), ("move", 120, 300), ("view", "home_cursor"), ("full", "home")],
    "twin": [("api", "/speed", {"tick_seconds": 0.25}), ("api", "/auto-sync", {"enabled": True}), ("api", "/reset"), ("go", "twin"), ("wait", 1),
             ("api", "/scenario/drift"), ("wait", 12), ("audit", "twin"), ("view", "twin_fold"), ("full", "twin_full")],
    "presenter": [("eval", "document.querySelector('[data-presenter]').setAttribute('data-presenter','1')"), ("wait", 1), ("audit", "presenter"),
                  ("view", "presenter"), ("eval", "document.querySelector('[data-presenter]').setAttribute('data-presenter','0')")],
    "minimize": [("clicksel", 'button[aria-label="Minimize Buffer levels"]'), ("clicksel", 'button[aria-label="Minimize Production at a glance"]'),
                 ("eval", "window.scrollTo(0, 0)"), ("audit", "minimized"), ("full", "minimized"), ("eval", "JSON.parse(localStorage.getItem('ddt.minimized.v1'))"),
                 ("clicksel", ".dock > button"), ("audit", "restored")],
    "zoom": [("clicksel", 'button[aria-label="Zoom Plant floor"]'), ("wait", 1), ("hover", "homogenizer"), ("view", "zoom_floor"), ("key", "Escape"),
             ("clicksel", 'button[aria-label="Zoom Bottling throughput"]'), ("view", "zoom_chart"), ("key", "Escape"),
             ("clicksel", 'button[aria-label="Zoom Production at a glance"]'), ("view", "zoom_kpi"), ("key", "Escape"), ("audit", "after-zoom")],
    "pages": [("go", "sync"), ("audit", "sync"), ("full", "sync"), ("go", "maint"), ("audit", "maint"), ("full", "maint"),
              ("go", "cyber"), ("audit", "cyber"), ("full", "cyber"), ("go", "log"), ("audit", "log"), ("full", "log")],
    "restore": [("api", "/speed", {"tick_seconds": 0.5}), ("api", "/auto-sync", {"enabled": True}), ("api", "/auto-isolate", {"enabled": True}), ("api", "/reset")],
}
asyncio.run(main(sum((P[p] for p in sys.argv[1:]), [])))
