from __future__ import annotations

import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import quote

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def run() -> dict[str, object]:
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT))
    )
    Thread(target=server.serve_forever, daemon=True).start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1365, "height": 1000})
            page.goto(
                base_url + "/" + quote("鋼構工具/index.html", safe="/"),
                wait_until="networkidle",
                timeout=60000,
            )
            page.locator('select[name="connectionType"]').select_option("tension_member")
            page.locator("#examplePresetSelect").select_option("tension_bolted_plate")
            page.locator("#loadExampleBtn").click()
            page.locator("svg.plate-sketch").wait_for(state="visible", timeout=15000)
            tension = page.locator("svg.plate-sketch").evaluate(
                """svg => {
                  const vb = svg.viewBox.baseVal;
                  const elements = [...svg.querySelectorAll('*')]
                    .filter(el => !el.closest('defs') && typeof el.getBBox === 'function');
                  const bounds = elements.map(el => {
                    const b = el.getBBox();
                    const style = getComputedStyle(el);
                    const stroke = style.stroke === 'none' ? 0 : (parseFloat(style.strokeWidth) || 0) / 2;
                    const marker = el.hasAttribute('marker-start') || el.hasAttribute('marker-end') ? 8 : 0;
                    return {
                      left: b.x - stroke - marker,
                      top: b.y - stroke - marker,
                      right: b.x + b.width + stroke + marker,
                      bottom: b.y + b.height + stroke + marker,
                    };
                  });
                  const extents = {
                    left: Math.min(...bounds.map(b => b.left)),
                    top: Math.min(...bounds.map(b => b.top)),
                    right: Math.max(...bounds.map(b => b.right)),
                    bottom: Math.max(...bounds.map(b => b.bottom)),
                  };
                  const overflow = {
                    left: Math.max(0, vb.x - extents.left),
                    top: Math.max(0, vb.y - extents.top),
                    right: Math.max(0, extents.right - (vb.x + vb.width)),
                    bottom: Math.max(0, extents.bottom - (vb.y + vb.height)),
                  };
                  const labels = [...svg.querySelectorAll('text')].map((el, index) => {
                    const b = el.getBBox();
                    return {
                      index,
                      text: el.textContent.trim(),
                      x: b.x,
                      right: b.x + b.width,
                      y: b.y,
                      bottom: b.y + b.height,
                      font: parseFloat(getComputedStyle(el).fontSize),
                    };
                  });
                  const pairs = [];
                  for (let i = 0; i < labels.length; i += 1) {
                    for (let j = i + 1; j < labels.length; j += 1) {
                      const a = labels[i], b = labels[j];
                      const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.x, b.x);
                      if (horizontalOverlap <= 0.5) continue;
                      const gap = Math.max(0, Math.max(a.y, b.y) - Math.min(a.bottom, b.bottom));
                      const required = 1.2 * Math.max(a.font, b.font);
                      pairs.push({ first: a.text, second: b.text, gap, required });
                    }
                  }
                  return { viewBox: svg.getAttribute('viewBox'), extents, overflow, pairs };
                }"""
            )
            if max(tension["overflow"].values()) > 0.01:
                raise AssertionError(f"拉力草圖仍有 viewBox 裁切：{tension}")
            failed_pairs = [pair for pair in tension["pairs"] if pair["gap"] + 0.01 < pair["required"]]
            if failed_pairs:
                raise AssertionError(f"拉力草圖註記間距不足：{failed_pairs}")
            if os.environ.get("T14_CAPTURE") == "1":
                capture_dir = ROOT / "output" / "playwright" / "t14"
                capture_dir.mkdir(parents=True, exist_ok=True)
                page.locator("svg.plate-sketch").screenshot(path=str(capture_dir / "tension-sketch.png"))

            page.goto(
                base_url + "/" + quote("結構工具箱/tools/earth/earth-pressure.html", safe="/"),
                wait_until="networkidle",
                timeout=60000,
            )
            page.locator("#btnCalc").click()
            page.locator("#diagramBody svg.pressure-diagram text").first.wait_for(
                state="visible", timeout=15000
            )
            earth = page.locator("#diagramBody svg.pressure-diagram").evaluate(
                """svg => {
                  const luminance = (color) => {
                    const rgb = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => v / 255);
                    const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
                  };
                  const backgrounds = ['rgb(255, 255, 255)', 'rgb(248, 250, 252)'];
                  const labels = [...svg.querySelectorAll('text')].map(el => {
                    const style = getComputedStyle(el);
                    const foreground = luminance(style.fill);
                    const contrast = Math.min(...backgrounds.map(bg => {
                      const background = luminance(bg);
                      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
                    }));
                    const b = el.getBBox();
                    return {
                      text: el.textContent.trim(),
                      x: b.x,
                      right: b.x + b.width,
                      y: b.y,
                      bottom: b.y + b.height,
                      font: parseFloat(style.fontSize),
                      fill: style.fill,
                      contrast,
                    };
                  });
                  const overlaps = [];
                  for (let i = 0; i < labels.length; i += 1) {
                    for (let j = i + 1; j < labels.length; j += 1) {
                      const a = labels[i], b = labels[j];
                      const horizontal = Math.min(a.right, b.right) - Math.max(a.x, b.x);
                      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
                      if (horizontal > 0.5 && vertical > 0.5) overlaps.push({ first: a.text, second: b.text, horizontal, vertical });
                    }
                  }
                  return {
                    count: labels.length,
                    minimumFont: Math.min(...labels.map(x => x.font)),
                    minimumContrast: Math.min(...labels.map(x => x.contrast)),
                    labels,
                    overlaps,
                  };
                }"""
            )
            if earth["count"] == 0 or earth["minimumFont"] < 10:
                raise AssertionError(f"土壓圖文字少於 10px 或無標註：{earth}")
            if earth["minimumContrast"] < 4.5:
                raise AssertionError(f"土壓圖標註對比度低於 4.5:1：{earth}")
            if earth["overlaps"]:
                raise AssertionError(f"土壓圖標註文字互相重疊：{earth['overlaps']}")
            if os.environ.get("T14_CAPTURE") == "1":
                capture_dir = ROOT / "output" / "playwright" / "t14"
                capture_dir.mkdir(parents=True, exist_ok=True)
                page.locator("#diagramBody svg.pressure-diagram").screenshot(path=str(capture_dir / "earth-pressure-diagram.png"))

            page.emulate_media(media="print")
            print_earth = page.locator("#diagramBody svg.pressure-diagram").evaluate(
                """svg => [...svg.querySelectorAll('text')].map(el => {
                  const style = getComputedStyle(el);
                  return { text: el.textContent.trim(), font: parseFloat(style.fontSize), fill: style.fill };
                })"""
            )
            if not print_earth or min(label["font"] for label in print_earth) < 10:
                raise AssertionError(f"列印媒體土壓圖文字小於 10px：{print_earth}")
            browser.close()
            return {"tension": tension, "earth": earth, "earthPrintMinimumFont": min(x["font"] for x in print_earth)}
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, ensure_ascii=True, indent=2))
    print("鋼構拉力草圖與土壓圖呈現斷言通過。")
