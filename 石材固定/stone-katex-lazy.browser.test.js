'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DEPS = path.join(ROOT, 'output/playwright/phase2-quality-deps/node_modules');
const { chromium } = require(path.join(DEPS, 'playwright'));
const { expect } = require(path.join(DEPS, 'playwright/test'));
const { classifyPublishedPath } = require('../結構工具箱/tools/build-pages-artifact');
const PAGE = '石材固定/石材計算書產生器_規範版V2.html';
const KATEX = path.join(ROOT, '石材固定/vendor/katex/katex.min.js');
const katexBytes = fs.readFileSync(KATEX);
const katexVersion = require(KATEX).version;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => fs.existsSync(file));
assert.ok(edge, 'Microsoft Edge must be installed');
assert.equal(classifyPublishedPath('石材固定/stone-katex-lazy.browser.test.js').publish, false);
assert.equal(require(path.join(DEPS, 'playwright/package.json')).version, '1.63.0');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
const output = path.join(ROOT, 'output/playwright/stone-katex-lazy', stamp);
fs.mkdirSync(output, { recursive: true });
const summary = {
  test: 'stone-katex-lazy.browser.test.js', startedAt: new Date().toISOString(),
  startHead: git(['rev-parse', 'HEAD']), startDirty: Boolean(git(['status', '--porcelain'])),
  edgeExecutable: edge, playwrightVersion: '1.63.0',
  katex: { bytes: katexBytes.length, sha256: hash(katexBytes), version: katexVersion },
  pageSha256: hash(fs.readFileSync(path.join(ROOT, PAGE))),
  cases: [], passed: false,
};

function startServer() {
  const server = http.createServer((request, response) => {
    let relative;
    try { relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, ''); }
    catch (_) { response.writeHead(400); response.end(); return; }
    if (relative === 'favicon.ico') { response.writeHead(204); response.end(); return; }
    const fullPath = path.resolve(ROOT, relative);
    if (!fullPath.startsWith(ROOT + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(fullPath, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' })[path.extname(fullPath)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(bytes);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function diagnostics(context, record, pendingBodies) {
  context.on('page', page => {
    page.on('pageerror', error => record.pageErrors.push({ page: page.url(), message: String(error), stack: error.stack || '' }));
    page.on('console', message => record.console.push({ type: message.type(), text: message.text(), page: page.url(), location: message.location() }));
  });
  context.on('request', request => record.requests.push({ url: request.url(), resourceType: request.resourceType(), at: new Date().toISOString() }));
  context.on('requestfailed', request => record.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || '' }));
  context.on('response', response => {
    if (response.status() >= 400) record.httpErrors.push({ url: response.url(), status: response.status() });
    if (/\/vendor\/katex\/katex\.min\.js(?:$|\?)/.test(response.url())) {
      pendingBodies.push(response.body().then(bytes => record.runtimeResponses.push({
        url: response.url(), status: response.status(), bytes: bytes.length, sha256: hash(bytes),
      }), error => record.runtimeResponses.push({ url: response.url(), status: response.status(), bodyError: String(error) })));
    }
  });
}

function counts(record) {
  return {
    js: record.requests.filter(item => /\/vendor\/katex\/katex\.min\.js(?:$|\?)/.test(item.url)).length,
    css: record.requests.filter(item => /\/vendor\/katex\/katex\.min\.css(?:$|\?)/.test(item.url)).length,
  };
}

function formulaProof(page) {
  return page.evaluate(() => {
    const html = buildPrintableSheetsHtml();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const spans = [...doc.querySelectorAll('.v2-math-inline[data-tex]')];
    return { htmlBytes: new TextEncoder().encode(html).length, formulas: spans.length,
      rendered: spans.filter(span => span.dataset.rendered === '1').length,
      fallback: spans.filter(span => span.dataset.rendered !== '1' && span.textContent === span.dataset.tex).length,
      invalid: spans.filter(span => !span.textContent.trim() || /undefined|NaN/.test(span.textContent)
        || (span.dataset.rendered !== '1' && span.textContent !== span.dataset.tex)).map(span => ({ tex: span.dataset.tex, text: span.textContent })),
    };
  });
}

async function main() {
  const started = Date.now();
  let server, browser;
  try {
    server = await startServer();
    const url = `http://127.0.0.1:${server.address().port}/${encodeURI(PAGE)}`;
    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run', '--no-default-browser-check'] });
    summary.browserVersion = browser.version();
    for (const name of ['cold-first-once', 'blocked-fallback-retry', 'timeout-promise-retry', 'blocked-calculation-book']) {
      const record = { name, passed: false, requests: [], runtimeResponses: [], requestFailures: [], httpErrors: [], pageErrors: [], console: [] };
      summary.cases.push(record);
      const pendingBodies = [], pendingRoutes = [];
      let context;
      try {
        context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        diagnostics(context, record, pendingBodies);
        const scriptPattern = '**/vendor/katex/katex.min.js*';
        if (name.startsWith('blocked')) await context.route(scriptPattern, route => route.abort('failed'));
        if (name === 'timeout-promise-retry') {
          let hits = 0;
          await context.route(scriptPattern, route => {
            if (++hits !== 1) return route.continue();
            const pending = new Promise(resolve => setTimeout(resolve, 16000)).then(async () => {
              try { await route.continue(); } catch (error) { record.fixtureRouteCompletion = String(error); }
            });
            pendingRoutes.push(pending);
            return pending;
          });
        }
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        const first = page.locator('#preview-sheets .v2-math-inline[data-tex]').first();
        await expect(first).toBeAttached({ timeout: 15000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect.poll(() => counts(record)).toEqual({ js: 0, css: 0 });
        record.coldRequests = counts(record);

        if (name === 'timeout-promise-retry') {
          await page.evaluate(() => {
            document.querySelector('#preview-sheets .v2-math-inline[data-tex]').scrollIntoView({ block: 'center' });
            const started = performance.now(), first = loadKatexRuntime(), second = loadKatexRuntime();
            v2KatexifyFormulas(); v2KatexifyFormulas();
            window.__katexSamePromise = first === second;
            window.__katexFirstStatus = null;
            first.then(() => { window.__katexFirstStatus = { status: 'resolved' }; }, error => {
              window.__katexFirstStatus = { status: 'rejected', message: error.message, elapsedMs: performance.now() - started };
            });
            second.catch(() => {});
          });
          await expect.poll(() => page.evaluate(() => window.__katexSamePromise)).toBe(true);
          await expect.poll(() => page.evaluate(() => window.__katexFirstStatus), { timeout: 18000 }).toMatchObject({ status: 'rejected', message: 'KaTeX 載入逾時' });
          record.timeout = await page.evaluate(() => window.__katexFirstStatus);
          await expect.poll(() => record.timeout.elapsedMs).toBeGreaterThanOrEqual(12000);
          await expect.poll(() => counts(record)).toEqual({ js: 1, css: 1 });
        } else {
          await first.scrollIntoViewIfNeeded();
          await expect.poll(() => counts(record)).toEqual({ js: 1, css: 1 });
        }
        record.firstRequests = counts(record);

        if (name !== 'cold-first-once') {
          await expect.poll(() => first.evaluate(span => span.textContent === span.dataset.tex && Boolean(span.textContent.trim()))).toBe(true);
          await expect(first).toBeVisible();
          record.fallbackText = await first.textContent();
          await expect.poll(() => page.locator('script[src*="vendor/katex/katex.min.js"]').count()).toBe(0);
          await expect.poll(async () => (await formulaProof(page)).invalid).toEqual([]);
          record.reportBeforeRetry = await formulaProof(page);
          await expect.poll(() => record.reportBeforeRetry.formulas).toBeGreaterThan(0);
        }

        if (name === 'blocked-calculation-book') {
          const popupEvent = page.waitForEvent('popup', { timeout: 60000 });
          await page.locator('button[onclick="previewPrint()"]').click();
          const popup = await popupEvent;
          const outputFormula = popup.locator('.v2-math-inline[data-tex]').first();
          const confirmation = await Promise.race([
            page.locator('#v2-check-modal.show').waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false),
            outputFormula.waitFor({ state: 'attached', timeout: 30000 }).then(() => false, () => false),
          ]);
          if (confirmation) await page.locator('#v2_check_proceed').click();
          await expect(outputFormula).toBeAttached({ timeout: 30000 });
          await expect.poll(() => popup.locator('.v2-math-inline[data-tex]').evaluateAll(spans =>
            spans.length > 0 && spans.every(span => span.textContent.trim() && span.textContent === span.dataset.tex
              && !/undefined|NaN/.test(span.textContent)))).toBe(true);
          record.actualBook = await popup.locator('.v2-math-inline[data-tex]').evaluateAll(spans => ({
            formulas: spans.length, fallback: spans.filter(span => span.textContent === span.dataset.tex).length,
          }));
          await expect.poll(() => counts(record)).toEqual({ js: 1, css: 1 });
          await popup.close();
        } else {
          if (name !== 'cold-first-once') {
            if (name === 'blocked-fallback-retry') await context.unroute(scriptPattern);
            await page.evaluate(() => {
              const first = loadKatexRuntime(), second = loadKatexRuntime();
              window.__katexRetrySamePromise = first === second;
              first.catch(() => {}); second.catch(() => {});
            });
            await expect.poll(() => page.evaluate(() => window.__katexRetrySamePromise)).toBe(true);
            await expect.poll(() => counts(record)).toEqual({ js: 2, css: 1 });
          }
          await expect.poll(() => page.evaluate(() => window.katex?.version || '')).toBe(katexVersion);
          await page.evaluate(() => v2KatexifyFormulas());
          await expect(first).toHaveAttribute('data-rendered', '1');
          await expect(first.locator('.katex')).toBeVisible();
          await expect.poll(() => record.runtimeResponses.some(response => response.status === 200
            && response.bytes === katexBytes.length && response.sha256 === hash(katexBytes))).toBe(true);
          await expect.poll(async () => (await formulaProof(page)).invalid).toEqual([]);
          record.reportAfterReady = await formulaProof(page);
          if (name === 'cold-first-once') {
            await page.evaluate(() => document.fonts.ready);
            await first.screenshot({ path: path.join(output, 'first-formula.png') });
            await page.evaluate(() => v2KatexifyFormulas());
            await expect.poll(() => counts(record)).toEqual({ js: 1, css: 1 });
          }
        }
        await expect.poll(() => record.pageErrors.length).toBe(0);
        record.passed = true;
      } catch (error) { record.failure = String(error.stack || error); }
      finally {
        await Promise.allSettled(pendingRoutes);
        await Promise.allSettled(pendingBodies);
        if (context) await context.close();
        record.finalRequests = counts(record);
        if (record.pageErrors.length) record.passed = false;
        fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
      }
    }
    summary.passed = summary.cases.length === 4 && summary.cases.every(record => record.passed);
  } catch (error) { summary.startupFailure = String(error.stack || error); }
  finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    summary.finishedAt = new Date().toISOString(); summary.durationSeconds = (Date.now() - started) / 1000;
    summary.endHead = git(['rev-parse', 'HEAD']); summary.endDirty = Boolean(git(['status', '--porcelain']));
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ output, passed: summary.passed, cases: summary.cases.map(record => ({ name: record.name, passed: record.passed, cold: record.coldRequests, final: record.finalRequests })) }));
    if (!summary.passed) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
