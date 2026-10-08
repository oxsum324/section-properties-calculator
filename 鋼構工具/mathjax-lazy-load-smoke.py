from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import Browser, Route, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8769"
MATHJAX_PATH = "/npm/mathjax@3/es5/tex-svg.js"
ROUTE_PATTERN = "**/mathjax@3/es5/tex-svg.js"
PAGES = {
    "鋼構主頁": "/鋼構工具/index.html",
    "獨立連接板頁": "/鋼構工具/plate-check.html",
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def request_count(requests: list[str]) -> int:
    return sum(MATHJAX_PATH in url for url in requests)


def assert_text_fallback(page, label: str) -> None:
    page.locator('button[data-panel="flow"]').click()
    page.wait_for_function(
        """() => document.documentElement.classList.contains('mathjax-fallback')
          && document.querySelectorAll('.equation-list--fallback').length > 0""",
        timeout=15000,
    )
    visible = page.locator(".equation-list--fallback").first.is_visible()
    if not visible:
        raise AssertionError(f"{label}：MathJax 失敗後文字公式 fallback 未顯示")
    if not page.evaluate("() => Boolean(window.latestSteelConnectionResult?.checks?.length)"):
        raise AssertionError(f"{label}：MathJax 失敗時計算結果未完成")


def prepare_pure_calculation(page, requests: list[str], label: str) -> None:
    if request_count(requests) != 0:
        raise AssertionError(f"{label}：開頁時不應請求 MathJax：{request_count(requests)}")
    if page.evaluate("() => Boolean(window.MathJax?.typesetPromise)"):
        raise AssertionError(f"{label}：開頁時不應載入 MathJax")
    page.locator("#showFlow").uncheck()
    page.locator("#resetBtn").click()
    if request_count(requests) != 0:
        raise AssertionError(f"{label}：純計算不應請求 MathJax：{request_count(requests)}")
    if page.evaluate("() => Boolean(window.MathJax?.typesetPromise)"):
        raise AssertionError(f"{label}：純計算前 MathJax 不應載入")


def test_success(browser: Browser, label: str, path: str) -> None:
    context = browser.new_context()
    page = context.new_page()
    requests: list[str] = []
    page.on("request", lambda request: requests.append(request.url))
    page.goto(BASE_URL + path, wait_until="networkidle", timeout=60000)
    prepare_pure_calculation(page, requests, label)

    page.locator("#showFlow").check()
    page.locator('button[data-panel="flow"]').click()
    page.wait_for_function(
        "() => document.documentElement.classList.contains('mathjax-ready')",
        timeout=30000,
    )
    if request_count(requests) != 1:
        raise AssertionError(f"{label}：首次顯示公式應只請求一次 MathJax：{request_count(requests)}")
    if page.locator(".equation-math mjx-container svg").count() == 0:
        raise AssertionError(f"{label}：MathJax 載入成功但沒有 SVG 公式")

    context.close()


def test_block_and_retry(browser: Browser, label: str, path: str) -> None:
    context = browser.new_context()
    page = context.new_page()
    requests: list[str] = []
    page.on("request", lambda request: requests.append(request.url))
    blocked = {"count": 0}

    def block_first_request(route: Route) -> None:
        if blocked["count"] == 0:
            blocked["count"] += 1
            route.abort()
        else:
            route.continue_()

    context.route(ROUTE_PATTERN, block_first_request)
    page.goto(BASE_URL + path, wait_until="networkidle", timeout=60000)
    prepare_pure_calculation(page, requests, f"{label}（阻斷案例）")

    page.locator("#showFlow").check()
    page.wait_for_timeout(400)
    if request_count(requests) != 1:
        raise AssertionError(f"{label}：阻斷案例首次應請求一次 MathJax：{request_count(requests)}")
    assert_text_fallback(page, label)
    if page.evaluate("() => Boolean(window.MathJax?.typesetPromise)"):
        raise AssertionError(f"{label}：阻斷案例不應留下可用的 MathJax runtime")

    page.locator("#showFlow").uncheck()
    page.locator("#showFlow").check()
    page.wait_for_function(
        "() => document.documentElement.classList.contains('mathjax-ready')",
        timeout=30000,
    )
    if request_count(requests) != 2:
        raise AssertionError(f"{label}：解除阻斷後應只重試一次：{request_count(requests)}")
    if page.locator(".equation-math mjx-container svg").count() == 0:
        raise AssertionError(f"{label}：重試成功後沒有 SVG 公式")
    context.close()


def main() -> int:
    server = ThreadingHTTPServer(
        ("127.0.0.1", 8769),
        partial(QuietHandler, directory=str(ROOT)),
    )
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            for label, path in PAGES.items():
                test_success(browser, label, path)
                test_block_and_retry(browser, label, path)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print("鋼構 MathJax 按需載入、文字 fallback 與失敗重試 smoke 通過。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
