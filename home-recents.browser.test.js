'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const deps = path.join(__dirname, 'output/playwright/phase2-quality-deps/node_modules');
const { chromium } = require(path.join(deps, 'playwright'));
const { expect } = require(path.join(deps, 'playwright/test'));
const AxeBuilder = require(path.join(deps, '@axe-core/playwright')).default;
// 使用 Edge 穩定啟動器路徑；版本子目錄（例如 154.0.4258.62）會隨自動更新消失。
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const recentKey = 'structToolbox.home.recentTools';
const pinnedKey = 'structToolbox.home.pinnedTools';
const git = (...args) => execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', windowsHide: true }).trim();
const out = path.join(__dirname, 'output/playwright/home-recents', new Date().toISOString().replace(/[:.]/g, '-'));
const summary = { startedAt: new Date().toISOString(), startHead: git('rev-parse', 'HEAD'), startDirty: !!git('status', '--porcelain'), cases: [], diagnostics: [], axe: [] };

async function startServer() {
  const server = http.createServer((req, res) => {
    let file;
    try { file = path.resolve(__dirname, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { res.writeHead(400).end(); return; }
    if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403).end(); return; }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const data = fs.readFileSync(file);
      const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server;
}

function observe(page, name) {
  const record = { name, consoleErrors: [], pageErrors: [], requestFailures: [] };
  summary.diagnostics.push(record);
  page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push({ text: message.text(), location: message.location() }); });
  page.on('pageerror', error => record.pageErrors.push(String(error.stack || error)));
  page.on('requestfailed', request => record.requestFailures.push({ url: request.url(), failure: request.failure() }));
  return record;
}

async function checkCase(name, run) {
  const item = { name, passed: false };
  summary.cases.push(item);
  try { await run(); item.passed = true; }
  catch (error) { item.failure = String(error.stack || error); }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer();
  const home = `http://127.0.0.1:${server.address().port}/結構工具箱/`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: edge, headless: true });
    summary.browserVersion = browser.version();
    await checkCase('recent-pinned-search-keyboard-and-reload', async () => {
      const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      try {
        // Only destination documents are fixtures; homepage scripts/storage are real.
        // Real tool navigation/calculation remains covered by local-quick smoke.
        await context.route('**/*', route => {
          const request = route.request();
          if (request.isNavigationRequest() && !['/結構工具箱/', '/結構工具箱/index.html'].includes(decodeURIComponent(new URL(request.url()).pathname))) {
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-TW"><title>首頁導覽測試替身</title><link rel="icon" href="data:,"><body>工具導覽已抵達</body></html>' });
          }
          return route.continue();
        });
        const page = await context.newPage();
        const errors = observe(page, 'personal-flow');
        await page.goto(home);
        await expect(page.locator('#toolGrid .tool-pin')).toHaveCount(53);
        await expect(page.locator('.home-personal')).toHaveCount(0);
        // 「全部」依家族分段，每段超過 6 張的卡片以 class 收合；互動路徑只取可見卡片（DOM 仍為 53 張，上方已斷言）。
        const routes = await page.locator('#toolGrid .tool-card:visible').evaluateAll(cards => cards.map(card => card.dataset.routeHref));
        for (const [index, href] of routes.slice(0, 2).entries()) {
          const card = page.locator(`#toolGrid .tool-card[data-route-href="${href}"]`);
          if (index) await card.press('Enter'); else await card.click();
          await expect(page).toHaveURL(/\.html$/);
          await page.goto(home);
        }
        await page.reload();
        await expect(page.locator('.home-personal .tool-card')).toHaveCount(2);
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), recentKey)).toMatchObject([{ href: routes[1] }, { href: routes[0] }]);
        await page.locator(`#toolGrid .tool-pin[data-pin-href="${routes[0]}"]`).press('Enter');
        await expect(page.locator('.home-personal .tool-card').first()).toHaveAttribute('data-route-href', routes[0]);
        await expect(page.locator('.home-personal .tool-pin').first()).toHaveAttribute('aria-pressed', 'true');
        await page.reload();
        await expect(page.locator('.home-personal .tool-card').first()).toHaveAttribute('data-route-href', routes[0]);
        await expect(page.locator('.home-personal .tool-card')).toHaveCount(2);
        await page.locator('#toolSearch').fill('Shear Tab');
        await expect(page.locator('.home-personal')).toHaveCount(0);
        await page.locator('#clearToolSearch').click();
        await expect(page.locator('.home-personal .tool-card')).toHaveCount(2);
        for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          const axe = await new AxeBuilder({ page }).analyze();
          summary.axe.push({ viewport, violations: axe.violations });
          await expect.poll(() => axe.violations.length).toBe(0);
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        for (const href of [...routes.slice(2, 10), routes[0]]) {
          await page.locator(`#toolGrid .tool-card[data-route-href="${href}"]`).click();
          await expect(page).toHaveURL(/\.html$/);
          await page.goto(home);
        }
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, recentKey)).toBe(8);
        await expect.poll(() => page.evaluate(key => new Set(JSON.parse(localStorage.getItem(key)).map(item => item.href)).size, recentKey)).toBe(8);
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].href, recentKey)).toBe(routes[0]);
        await page.setViewportSize({ width: 1365, height: 900 });
        for (const href of routes.slice(1, 12)) await page.locator(`#toolGrid .tool-pin[data-pin-href="${href}"]`).click();
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, pinnedKey)).toBe(12);
        await page.locator(`#toolGrid .tool-pin[data-pin-href="${routes[12]}"]`).click();
        await expect(page.locator('.home-personal__notice')).toHaveText('最多可釘選 12 項工具，請先取消一項釘選。');
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, pinnedKey)).toBe(12);
        await page.locator(`#toolGrid .tool-pin[data-pin-href="${routes[0]}"]`).click();
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, pinnedKey)).toBe(11);
        await expect.poll(() => errors.pageErrors).toEqual([]);
      } finally { await context.close(); }
    });
    await checkCase('storage-denied-remains-usable', async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
        const page = await context.newPage();
        const errors = observe(page, 'storage-denied');
        await page.goto(home);
        await expect(page.locator('#toolGrid .tool-pin')).toHaveCount(53);
        await expect(page.locator('#toolGrid .tool-card')).toHaveCount(53);
        await expect(page.locator('.home-personal')).toHaveCount(0);
        await page.locator('#toolGrid .tool-pin').first().click();
        await expect(page.locator('.home-personal .tool-card')).toHaveCount(1);
        await page.reload();
        await expect(page.locator('#toolGrid .tool-card')).toHaveCount(53);
        await expect(page.locator('.home-personal')).toHaveCount(0);
        await expect.poll(() => errors.pageErrors).toEqual([]);
      } finally { await context.close(); }
    });
    await checkCase('malformed-and-unknown-storage-is-ignored', async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(({ recentKey, pinnedKey }) => {
          localStorage.setItem(recentKey, JSON.stringify([{ href: 'javascript:alert(1)', at: 1 }, { href: '/rc-beam', at: 'invalid' }]));
          localStorage.setItem(pinnedKey, '{broken');
        }, { recentKey, pinnedKey });
        const page = await context.newPage();
        const errors = observe(page, 'invalid-storage');
        await page.goto(home);
        await expect(page.locator('#toolGrid .tool-card')).toHaveCount(53);
        await expect(page.locator('.home-personal')).toHaveCount(0);
        await expect.poll(() => errors.pageErrors).toEqual([]);
      } finally { await context.close(); }
    });
  } catch (error) { summary.fatalError = String(error.stack || error); }
  finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    summary.endHead = git('rev-parse', 'HEAD');
    summary.endDirty = !!git('status', '--porcelain');
    summary.finishedAt = new Date().toISOString();
    summary.passed = !summary.fatalError && summary.startHead === summary.endHead && summary.cases.length === 3 && summary.cases.every(item => item.passed);
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({ passed: summary.passed, summary: path.join(out, 'summary.json') }));
    if (!summary.passed) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
