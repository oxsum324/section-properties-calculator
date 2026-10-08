from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
UI_SMOKE = SCRIPT_DIR / "ui_smoke_test.py"
REAL_PORT = 8766
FAKE_PORT = 8765
TOOL_PATH = "/石材固定/石材計算書產生器_規範版V2.html"
REAL_URL = f"http://127.0.0.1:{REAL_PORT}{TOOL_PATH}"
os.environ["STONE_SERVER_PORT"] = str(REAL_PORT)
import server


class FakeStatusHandler(BaseHTTPRequestHandler):
    delay_seconds = 0.0

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        if self.path != "/status":
            self.send_error(404)
            return
        if self.delay_seconds:
            time.sleep(self.delay_seconds)
        body = json.dumps({
            "ok": True,
            "service_id": "unrelated-local-service",
            "port": FAKE_PORT,
            "tool_html": "other-tool.html",
            "tool_url": "/status",
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Stone-Calc-Service")
        self.send_header("X-Stone-Calc-Service", "unrelated-local-service")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass


class LocalStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] != "/status":
            super().do_GET()
            return
        body = json.dumps(server.server_status(), ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        origin = self.headers.get("Origin")
        if origin in server.LOCAL_HTTP_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        elif origin == "null":
            self.send_header("Access-Control-Allow-Origin", "null")
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Expose-Headers", "X-Stone-Calc-Service")
        self.send_header("X-Stone-Calc-Service", server.SERVER_ID)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def wait_for_real_server() -> None:
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{REAL_PORT}/status", timeout=1) as response:
                status = json.loads(response.read().decode("utf-8"))
                if status.get("service_id") == "stonecalc-local":
                    return
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            time.sleep(0.2)
    raise RuntimeError("石材測試伺服器未在 8766 啟動")


def run_ui_smoke() -> None:
    env = os.environ.copy()
    env["STONE_SERVER_PORT"] = str(REAL_PORT)
    env["STONE_UI_SMOKE_PORT"] = str(REAL_PORT)
    env["STONE_UI_SMOKE_LOCAL_PORT"] = ""
    env["STONE_UI_SMOKE_EXPECT_LOCAL_SERVER"] = "0"
    result = subprocess.run([sys.executable, str(UI_SMOKE)], cwd=SCRIPT_DIR, env=env)
    if result.returncode != 0:
        raise AssertionError(f"8765 被其他服務占用時，石材完整 UI smoke 失敗，exit={result.returncode}")


def run_probe_cases() -> dict[str, object]:
    from playwright.sync_api import sync_playwright

    console_errors: list[str] = []
    measurements: dict[str, object] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for label, width in (("桌機", 1440), ("手機", 390)):
            page = browser.new_page(viewport={"width": width, "height": 900})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.goto(REAL_URL, wait_until="networkidle", timeout=60000)
            page.wait_for_selector("#review-dashboard .dash-card", timeout=30000)
            result = page.evaluate("""async () => {
              const started = performance.now();
              const status = await v2FetchServerStatus();
              return { status, elapsedMs: performance.now() - started };
            }""")
            status = result["status"]
            if status.get("ok") or not status.get("skipped") or status.get("mode") != "public_static":
                raise AssertionError(f"{label}：未知服務未降級為公開靜態模式：{status}")
            if result["elapsedMs"] > 1500:
                raise AssertionError(f"{label}：探測耗時超過 1500 ms：{result['elapsedMs']:.1f} ms")
            pages = page.locator("#preview-sheets .a4").count()
            if pages < 1:
                raise AssertionError(f"{label}：本機服務不符時頁面計算／預覽未完成")
            measurements[label] = {"probeMs": round(result["elapsedMs"], 1), "previewPages": pages}
            page.close()

        query_page = browser.new_page(viewport={"width": 1280, "height": 900})
        query_page.goto(REAL_URL + "?localPort=8766", wait_until="networkidle", timeout=60000)
        query_status = query_page.evaluate("() => v2FetchServerStatus()")
        if not query_status.get("ok") or query_status.get("port") != REAL_PORT:
            raise AssertionError(f"URL localPort 覆寫未生效：{query_status}")
        query_page.close()

        storage_page = browser.new_page(viewport={"width": 1280, "height": 900})
        storage_page.add_init_script("localStorage.setItem('stonecalc.localServerPort', '8766')")
        storage_page.goto(REAL_URL, wait_until="networkidle", timeout=60000)
        storage_status = storage_page.evaluate("() => v2FetchServerStatus()")
        if not storage_status.get("ok") or storage_status.get("port") != REAL_PORT:
            raise AssertionError(f"localStorage 埠號覆寫未生效：{storage_status}")
        storage_page.close()

        precedence_page = browser.new_page(viewport={"width": 1280, "height": 900})
        precedence_page.add_init_script("localStorage.setItem('stonecalc.localServerPort', '8765')")
        precedence_page.goto(REAL_URL + "?localPort=8766", wait_until="networkidle", timeout=60000)
        precedence_status = precedence_page.evaluate("() => v2FetchServerStatus()")
        if not precedence_status.get("ok") or precedence_status.get("port") != REAL_PORT:
            raise AssertionError(f"URL 埠號應優先於 localStorage：{precedence_status}")
        precedence_page.close()

        FakeStatusHandler.delay_seconds = 2.2
        timeout_page = browser.new_page(viewport={"width": 1280, "height": 900})
        timeout_page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        timeout_page.goto(REAL_URL, wait_until="domcontentloaded", timeout=60000)
        timeout_result = timeout_page.evaluate("""async () => {
          const started = performance.now();
          const status = await v2FetchServerStatus();
          return { status, elapsedMs: performance.now() - started };
        }""")
        if timeout_result["elapsedMs"] > 1500:
            raise AssertionError(f"慢速 /status 探測超過 1500 ms：{timeout_result['elapsedMs']:.1f} ms")
        if timeout_result["status"].get("ok") or not timeout_result["status"].get("skipped"):
            raise AssertionError(f"慢速服務應靜默降級：{timeout_result['status']}")
        measurements["timeoutMs"] = round(timeout_result["elapsedMs"], 1)
        timeout_page.close()
        browser.close()

    if console_errors:
        raise AssertionError(f"佔用埠負向情境出現 console error：{console_errors[:5]}")
    return measurements


def main() -> int:
    fake_server = ThreadingHTTPServer(
        ("127.0.0.1", FAKE_PORT),
        FakeStatusHandler,
    )
    fake_server.daemon_threads = True
    Thread(target=fake_server.serve_forever, daemon=True).start()
    static_server = ThreadingHTTPServer(
        ("127.0.0.1", REAL_PORT),
        partial(LocalStaticHandler, directory=str(ROOT_DIR)),
    )
    static_server.daemon_threads = True
    Thread(target=static_server.serve_forever, daemon=True).start()
    try:
        wait_for_real_server()
        run_ui_smoke()
        measurements = run_probe_cases()
        print(json.dumps({
            "result": "通過",
            "occupiedPort": FAKE_PORT,
            "realServerPort": REAL_PORT,
            "desktopMobile": measurements,
            "consoleErrors": 0,
            "overrides": ["URL localPort", "localStorage stonecalc.localServerPort", "URL 優先於 localStorage"],
        }, ensure_ascii=False, indent=2))
        return 0
    finally:
        FakeStatusHandler.delay_seconds = 0.0
        static_server.shutdown()
        static_server.server_close()
        fake_server.shutdown()
        fake_server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
