#!/usr/bin/env node
'use strict';

// Repeatable homepage quality checks. Dependencies are preinstalled in ignored output/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');

const repo = __dirname;
const deps = path.join(repo, 'output', 'playwright', 'phase2-quality-deps');
const outputRoot = path.join(repo, 'output', 'playwright', 'homepage-quality');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const expected = { lighthouse: '13.5.0', playwright: '1.63.0', '@axe-core/playwright': '4.13.0' };
const sourceFiles = ['結構工具箱/index.html', '結構工具箱/assets/home/home.js', '結構工具箱/assets/home/home.css'];
const interactionsOnly = process.argv.includes('--interactions-only');

function pkgVersion(name) {
  return JSON.parse(fs.readFileSync(path.join(deps, 'node_modules', name, 'package.json'), 'utf8')).version;
}
function assertRuntime() {
  if (!fs.existsSync(edge)) throw new Error(`Edge executable not found: ${edge}`);
  for (const [name, version] of Object.entries(expected)) {
    const actual = pkgVersion(name);
    if (actual !== version) throw new Error(`${name} version mismatch: expected ${version}, found ${actual}`);
  }
  if (!fs.existsSync(path.join(repo, 'serve-local.js'))) throw new Error('serve-local.js is missing');
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex').toUpperCase(); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function waitForServer(proc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for serve-local URL. Output: ${buffer}`)), timeoutMs);
    const onData = chunk => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/https?:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timeout); proc.stdout.off('data', onData); resolve({ url: match[0], output: buffer }); }
    };
    proc.stdout.on('data', onData);
    proc.once('error', error => { clearTimeout(timeout); reject(error); });
    proc.once('exit', (code, signal) => { clearTimeout(timeout); reject(new Error(`serve-local exited before ready (code=${code}, signal=${signal}). Output: ${buffer}`)); });
  });
}
async function closeServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await Promise.race([new Promise(resolve => proc.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
}
function recordErrorListeners(page) {
  const errors = { consoleErrors: [], pageErrors: [], httpErrors: [], requestFailures: [] };
  page.on('console', msg => { if (msg.type() === 'error') errors.consoleErrors.push(msg.text()); });
  page.on('pageerror', error => errors.pageErrors.push(error.stack || error.message));
  page.on('response', response => { if (response.status() >= 400) errors.httpErrors.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => errors.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || null }));
  return errors;
}
function check(checks, id, ok, details = {}) {
  checks.push({ id, ok: Boolean(ok), ...details });
  console.log(JSON.stringify({ check: id, ok: Boolean(ok), ...details }));
}
function mime(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
async function startPagesFixture() {
  const prefix = '/my-classroom-tools/';
  const requests = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); requests.push({ path: pathname, status: 400 }); return; }
    if (!decoded.startsWith(prefix)) { res.writeHead(404).end(); requests.push({ path: decoded, status: 404 }); return; }
    let relative = decoded.slice(prefix.length).replace(/\\/g, '/');
    if (!relative) relative = '結構工具箱/index.html';
    let target = path.resolve(repo, relative);
    if (target !== repo && !target.startsWith(repo + path.sep)) { res.writeHead(403).end(); requests.push({ path: decoded, status: 403 }); return; }
    try {
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      const stat = fs.statSync(target);
      if (!stat.isFile()) throw new Error('Not a file');
      res.writeHead(200, { 'Content-Type': mime(target), 'Cache-Control': 'no-store', 'Content-Length': stat.size });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
      requests.push({ method: req.method, path: decoded, status: 200, file: path.relative(repo, target) });
    } catch { res.writeHead(404).end('Not found'); requests.push({ method: req.method, path: decoded, status: 404 }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, requests, url: `http://127.0.0.1:${server.address().port}${prefix}結構工具箱/` };
}
async function runLighthouse(baseUrl, out, summary) {
  const cli = path.join(deps, 'node_modules', 'lighthouse', 'cli', 'index.js');
  const dir = path.join(out, 'lighthouse'); fs.mkdirSync(dir, { recursive: true });
  summary.lighthouse = { attempts: [], medians: {} };
  for (let run = 1; run <= 3; run++) {
    const stem = path.join(dir, `mobile-run-${run}`);
    const port = await freePort();
    const args = [cli, baseUrl, '--form-factor=mobile', '--only-categories=performance,accessibility', '--output=json,html', `--output-path=${stem}`, '--chrome-flags=--headless=new --no-first-run --no-default-browser-check', '--max-wait-for-load=45000', `--port=${port}`];
    const command = `node ${JSON.stringify(cli)} ${JSON.stringify(baseUrl)} --form-factor=mobile --only-categories=performance,accessibility --output=json,html --output-path=${JSON.stringify(stem)} --chrome-flags="--headless=new --no-first-run --no-default-browser-check" --max-wait-for-load=45000 --port=${port}`;
    const startedAt = new Date().toISOString(), start = Date.now();
    const child = spawn(process.execPath, args, { cwd: deps, env: { ...process.env, CHROME_PATH: edge }, windowsHide: true });
    const stdout = [], stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    const durationMs = Date.now() - start;
    const stdoutText = Buffer.concat(stdout).toString('utf8'), stderrText = Buffer.concat(stderr).toString('utf8');
    fs.writeFileSync(path.join(dir, `mobile-run-${run}.stdout.log`), stdoutText);
    fs.writeFileSync(path.join(dir, `mobile-run-${run}.stderr.log`), stderrText);
    let metrics = null, reportError = null;
    try {
      const report = JSON.parse(fs.readFileSync(`${stem}.report.json`, 'utf8'));
      const audit = id => report.audits?.[id] || {};
      metrics = {
        performance: report.categories?.performance?.score == null ? null : Math.round(report.categories.performance.score * 100),
        accessibility: report.categories?.accessibility?.score == null ? null : Math.round(report.categories.accessibility.score * 100),
        fcp: audit('first-contentful-paint').numericValue ?? null, lcp: audit('largest-contentful-paint').numericValue ?? null,
        tbt: audit('total-blocking-time').numericValue ?? null, cls: audit('cumulative-layout-shift').numericValue ?? null,
        lcpElement: audit('largest-contentful-paint-element').details || null,
        mainThreadWorkBreakdown: audit('mainthread-work-breakdown').details || null,
        longTasks: audit('long-tasks').details || null,
        networkRequests: audit('network-requests').details || null
      };
    } catch (error) { reportError = String(error); }
    const attempt = { run, command, startedAt, durationMs, exitCode, stdoutLog: `lighthouse/mobile-run-${run}.stdout.log`, stderrLog: `lighthouse/mobile-run-${run}.stderr.log`, json: `lighthouse/mobile-run-${run}.report.json`, html: `lighthouse/mobile-run-${run}.report.html`, metrics, reportError };
    summary.lighthouse.attempts.push(attempt); writeJson(path.join(out, 'summary.json'), summary);
    console.log(JSON.stringify({ run, exitCode, durationMs, metrics: metrics && { performance: metrics.performance, accessibility: metrics.accessibility, fcp: metrics.fcp, lcp: metrics.lcp, tbt: metrics.tbt, cls: metrics.cls }, reportError }));
    await closeCdpBrowser(port);
  }
  for (const key of ['performance', 'accessibility', 'fcp', 'lcp', 'tbt', 'cls']) summary.lighthouse.medians[key] = median(summary.lighthouse.attempts.map(attempt => attempt.metrics?.[key]).filter(Number.isFinite));
  summary.lighthouse.acceptance = {
    performanceMedianAtLeast90: summary.lighthouse.attempts.length === 3 && summary.lighthouse.medians.performance >= 90,
    everyAccessibilityAtLeast95: summary.lighthouse.attempts.length === 3 && summary.lighthouse.attempts.every(attempt => Number.isFinite(attempt.metrics?.accessibility) && attempt.metrics.accessibility >= 95),
  };
  if (!Object.values(summary.lighthouse.acceptance).every(Boolean)) summary.failed = true;
}
function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
}
async function closeCdpBrowser(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  try {
    const data = await fetch(versionUrl, { signal: AbortSignal.timeout(1000) }).then(response => response.json());
    if (!data.webSocketDebuggerUrl) return;
    const socket = new WebSocket(data.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); setTimeout(() => reject(new Error('CDP close timeout')), 1500); });
    socket.send(JSON.stringify({ id: 77, method: 'Browser.close' }));
    await new Promise(resolve => { socket.addEventListener('close', resolve, { once: true }); setTimeout(resolve, 2000); });
    socket.close();
  } catch { /* Lighthouse may already have closed its own browser. */ }
}
function median(values) { const sorted = values.slice().sort((a, b) => a - b); if (!sorted.length) return null; const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
async function runAxe(baseUrl, out, summary) {
  const { chromium } = require(path.join(deps, 'node_modules', 'playwright'));
  const { AxeBuilder } = require(path.join(deps, 'node_modules', '@axe-core', 'playwright'));
  const browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run', '--no-default-browser-check'] });
  const result = { viewports: [] }; let failed = false;
  try {
    for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 375, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile' });
      const page = await context.newPage(), errors = recordErrorListeners(page), started = Date.now();
      try {
        const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.includes('項工具'), null, { timeout: 30000 });
        await page.waitForTimeout(700);
        const axe = await new AxeBuilder({ page }).analyze();
        const seriousCritical = axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
        const run = { viewport, durationMs: Date.now() - started, goto: { status: response?.status(), finalUrl: page.url(), title: await page.title() }, violationCount: axe.violations.length, seriousCount: axe.violations.filter(item => item.impact === 'serious').length, criticalCount: axe.violations.filter(item => item.impact === 'critical').length, seriousCritical: seriousCritical.map(v => ({ id: v.id, impact: v.impact, help: v.help, description: v.description, helpUrl: v.helpUrl, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })), violations: axe.violations, incomplete: axe.incomplete, passes: axe.passes.length, inapplicable: axe.inapplicable.length, errors, screenshot: `axe-${viewport.name}.png` };
        await page.screenshot({ path: path.join(out, run.screenshot), fullPage: false }); result.viewports.push(run);
        if (!response || response.status() >= 400 || errors.pageErrors.length || seriousCritical.length > 0) failed = true;
      } catch (error) { failed = true; result.viewports.push({ viewport, durationMs: Date.now() - started, error: error.stack || String(error), errors }); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
  summary.axe = result; writeJson(path.join(out, 'axe-summary.json'), result);
  if (failed) summary.failed = true;
}
async function runInteractions(baseUrl, pagesFixture, out, summary) {
  const { chromium } = require(path.join(deps, 'node_modules', 'playwright'));
  const browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run', '--no-default-browser-check'] });
  const checks = [], flow = { startedAt: new Date().toISOString(), baseUrl, pagesSubdirectoryUrl: pagesFixture.url, checks, live: {}, file: {}, pagesSubdirectory: {} };
  try {
  const mobile = await browser.newContext({ viewport: { width: 375, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    const page = await mobile.newPage(), errors = recordErrorListeners(page), response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.includes('項工具'), null, { timeout: 30000 });
    await page.waitForTimeout(500);
    check(checks, 'homepage-loaded', response?.status() === 200 && decodeURIComponent(new URL(page.url()).pathname) === '/結構工具箱/', { status: response?.status(), url: page.url(), title: await page.title() });
    await page.locator('#toolSearch').fill('剪力板');
    await page.waitForFunction(() => [...document.querySelectorAll('#toolGrid a.tool-card')].some(a => a.dataset.routeHref === '/steel-formal'));
    const search = await page.evaluate(() => ({ count: document.querySelectorAll('#toolGrid a.tool-card').length, titles: [...document.querySelectorAll('#toolGrid a.tool-card')].map(a => a.dataset.title) }));
    check(checks, 'search-steel-alias', search.count === 1, search);
    await page.locator('#clearToolSearch').click();
    await page.locator('#categoryFilters .filter-button').filter({ hasText: '風力規範外力' }).click();
    await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.startsWith('13 /'));
    const category = await page.evaluate(() => ({ count: document.querySelectorAll('#toolGrid a.tool-card').length, active: [...document.querySelectorAll('#categoryFilters .filter-button[aria-pressed="true"]')].map(x => x.innerText.trim()) }));
    check(checks, 'sidebar-category-filter', category.count === 13 && category.active.some(x => x.includes('風力規範外力')), category);
    await page.locator('.category-card').filter({ hasText: '地震力規範外力' }).click();
    await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.startsWith('4 /'));
    const overview = await page.evaluate(() => ({ count: document.querySelectorAll('#toolGrid a.tool-card').length, active: [...document.querySelectorAll('#categoryFilters .filter-button[aria-pressed="true"]')].map(x => x.innerText.trim()) }));
    check(checks, 'overview-card-updates-filter-and-list', overview.count === 4 && overview.active.length === 1 && overview.active[0].includes('地震力規範外力'), overview);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#platformStatusSection .status-card')].map(card => ({ id: card.id, role: card.getAttribute('role'), live: card.getAttribute('aria-live') })));
    check(checks, 'three-live-status-cards', cards.length === 3 && cards.every(card => card.role === 'status' && card.live === 'polite'), { cards });
    await page.locator('#categoryFilters .filter-button').filter({ hasText: '全部' }).click();
    await page.locator('#toolSearch').fill('quality-harness-no-such-entry');
    await page.waitForFunction(() => !document.querySelector('#emptyState')?.hidden);
    const empty = await page.evaluate(() => ({ visible: !document.querySelector('#emptyState').hidden, cards: document.querySelectorAll('#toolGrid a.tool-card').length, text: document.querySelector('#emptyState').innerText }));
    check(checks, 'empty-search-state', empty.visible && empty.cards === 0, empty);
    await page.locator('#clearToolSearch').click();
    await page.locator('#categoryFilters .filter-button').filter({ hasText: '構件承載力檢核' }).click();
    await page.waitForFunction(() => !document.querySelector('#memberSystemPanel').hidden);
    const tabs = page.locator('#memberSystemTabs [role="tab"]');
    const firstTab = tabs.first(); await firstTab.focus();
    const tabIds = await tabs.evaluateAll(nodes => nodes.map(node => node.id));
    const expectedIds = [tabIds.at(-1), tabIds[0], tabIds.at(-1), tabIds[0]];
    const keyboard = [];
    for (const key of ['End', 'Home', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.press(key);
      keyboard.push({ key, ...await page.evaluate(() => {
        const all = [...document.querySelectorAll('#memberSystemTabs [role="tab"]')];
        const selected = all.find(node => node.getAttribute('aria-selected') === 'true');
        const panel = document.getElementById(selected?.getAttribute('aria-controls'));
        return { selected: selected?.id, focused: document.activeElement?.id,
          tabStops: all.filter(node => node.tabIndex === 0).map(node => node.id),
          allOthersUntabbable: all.filter(node => node !== selected).every(node => node.tabIndex === -1),
          panelRole: panel?.getAttribute('role'), panelLabel: panel?.getAttribute('aria-labelledby') };
      }) });
    }
    const tabOk = keyboard.every((item, index) => item.selected === expectedIds[index] && item.focused === item.selected && item.tabStops.length === 1 && item.tabStops[0] === item.selected && item.allOthersUntabbable && item.panelRole === 'tabpanel' && item.panelLabel === item.selected);
    check(checks, 'material-tabs-keyboard', tabOk, { keyboard });
    await page.locator('#toolSearch').fill('');
    const dimensions = await page.evaluate(() => ({ innerWidth, bodyScrollWidth: document.body.scrollWidth, documentScrollWidth: document.documentElement.scrollWidth, cards: document.querySelectorAll('#toolGrid a.tool-card').length }));
    check(checks, 'mobile-no-horizontal-overflow', Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth) <= dimensions.innerWidth, dimensions);
    flow.live = { errors, overview, statusCards: cards, empty, keyboard, dimensions };
    await page.screenshot({ path: path.join(out, 'interaction-mobile-375.png'), fullPage: true });
  } finally { await mobile.close(); }
  const fileContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await fileContext.newPage(), errors = recordErrorListeners(page);
    const fileUrl = pathToFileURL(path.join(repo, '結構工具箱', 'index.html')).href;
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.includes('項工具'), null, { timeout: 20000 });
    const links = await page.locator('#toolGrid a.tool-card[data-route-href]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), resolved: node.href })));
    const targets = links.map(item => { try { const target = fileURLToPath(item.resolved); return { ...item, exists: fs.existsSync(target), insideRepo: path.resolve(target).startsWith(repo + path.sep) }; } catch (error) { return { ...item, exists: false, error: String(error) }; } });
    const valid = targets.length === 52 && targets.every(item => item.href && !/^[a-z][a-z0-9+.-]*:/i.test(item.href) && !item.href.startsWith('/') && item.exists && item.insideRepo);
    check(checks, 'file-url-relative-links', valid, { count: targets.length, failures: targets.filter(item => !item.exists || !item.insideRepo || !item.href || item.href.startsWith('/')), errors });
    flow.file = { fileUrl, targets, errors };
    await page.screenshot({ path: path.join(out, 'file-mode-desktop.png') });
  } finally { await fileContext.close(); }
  const pagesContext = await browser.newContext({ viewport: { width: 375, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    const page = await pagesContext.newPage(), errors = recordErrorListeners(page);
    const response = await page.goto(pagesFixture.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent.includes('項工具'), null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const links = await page.locator('#toolGrid a.tool-card[data-route-href]').evaluateAll(nodes => nodes.map(node => ({ title: node.dataset.title, href: node.getAttribute('href') })));
    const routes = await page.evaluate(async hrefs => Promise.all(hrefs.map(async href => { try { const r = await fetch(href, { method: 'HEAD' }); return { href, status: r.status, ok: r.ok }; } catch (error) { return { href, ok: false, error: String(error) }; } })), links.map(item => item.href));
    const badPrefix = links.filter(item => !item.href || /^[a-z][a-z0-9+.-]*:/i.test(item.href) || !new URL(item.href, page.url()).pathname.startsWith('/my-classroom-tools/'));
    const badMetadata = await page.locator('[data-file-href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')).filter(href => !href || !new URL(href, location.href).pathname.startsWith('/my-classroom-tools/')));
    const dimensions = await page.evaluate(() => ({ innerWidth, bodyScrollWidth: document.body.scrollWidth, documentScrollWidth: document.documentElement.scrollWidth }));
    const details = { status: response?.status(), url: page.url(), linkCount: links.length, badPrefix, badRoutes: routes.filter(route => !route.ok), routes, badMetadata, dimensions, errors, serverRequests: pagesFixture.requests };
    check(checks, 'pages-prefix-all-links-resolve', response?.status() === 200 && links.length === 52 && !badPrefix.length && routes.length === 52 && routes.every(route => route.ok) && !badMetadata.length, { status: details.status, linkCount: links.length, badPrefix, badRoutes: details.badRoutes, badMetadata, errors });
    check(checks, 'pages-prefix-mobile-no-overflow', Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth) <= dimensions.innerWidth, dimensions);
    flow.pagesSubdirectory = details;
    await page.screenshot({ path: path.join(out, 'pages-prefix-mobile-375.png'), fullPage: true });
  } finally { await pagesContext.close(); }
  flow.serverRequests = pagesFixture.requests; flow.completedAt = new Date().toISOString();
  writeJson(path.join(out, 'interactions.json'), flow);
  summary.interactions = flow;
  if (checks.some(item => !item.ok)) summary.failed = true;
  } finally { await browser.close(); }
}
(async () => {
  const out = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(out, { recursive: true });
  const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), interactionsOnly, node: process.version, dependencies: {}, sourceCommit: null, sourceSha256: {}, attemptsPolicy: 'Fixed three Lighthouse attempts; no best-of selection and no retries.' };
  let serverProc, fixture;
  try {
    assertRuntime();
    summary.dependencies = Object.fromEntries(Object.keys(expected).map(name => [name, pkgVersion(name)]));
    summary.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    for (const file of sourceFiles) summary.sourceSha256[file] = sha(file);
    serverProc = spawn(process.execPath, [path.join(repo, 'serve-local.js'), '--no-open'], { cwd: repo, windowsHide: true });
    const serverReady = await waitForServer(serverProc); summary.baseUrl = serverReady.url;
    fixture = await startPagesFixture(); summary.pagesSubdirectoryUrl = fixture.url;
    if (!interactionsOnly) {
      await runLighthouse(summary.baseUrl, out, summary);
      await runAxe(summary.baseUrl, out, summary);
    }
    await runInteractions(summary.baseUrl, fixture, out, summary);
  } catch (error) {
    summary.fatalError = error.stack || String(error); summary.failed = true; console.error(summary.fatalError);
  } finally {
    if (fixture?.server) await new Promise(resolve => fixture.server.close(resolve));
    await closeServer(serverProc);
    summary.completedAt = new Date().toISOString();
    for (const file of sourceFiles) { try { summary.sourceSha256AtEnd ||= {}; summary.sourceSha256AtEnd[file] = sha(file); } catch {} }
    summary.sourceFilesUnchanged = !summary.sourceSha256AtEnd || sourceFiles.every(file => summary.sourceSha256[file] === summary.sourceSha256AtEnd[file]);
    if (!summary.sourceFilesUnchanged) summary.failed = true;
    writeJson(path.join(out, 'summary.json'), summary);
    fs.writeFileSync(path.join(outputRoot, 'latest-run.txt'), path.basename(out) + '\n');
    console.log(JSON.stringify({ output: out, failed: Boolean(summary.failed), interactionsOnly, completedAt: summary.completedAt }));
  }
  if (summary.failed || (!interactionsOnly && (summary.lighthouse?.attempts?.length !== 3 || summary.lighthouse.attempts.some(attempt => attempt.exitCode !== 0 || attempt.reportError) || summary.axe?.viewports?.some(run => run.goto?.status !== 200 || run.error)))) process.exitCode = 1;
})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
