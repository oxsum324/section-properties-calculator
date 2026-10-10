'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(path.join(process.cwd(), 'output', 'playwright', 'phase2-quality-deps', 'node_modules', 'playwright'));

const repo = path.resolve(__dirname, '../..');
const CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edge = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
assert.ok(edge, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
const fakeChart = `window.Chart=class{static version='4.4.7';constructor(target,config){this.canvas=target.canvas||target;this.config=config;(window.__charts||(window.__charts=[])).push(this);const c=this.canvas.getContext('2d');c.fillStyle='#2563eb';c.fillRect(1,1,24,18)}destroy(){window.__charts=window.__charts.filter(chart=>chart!==this)}};`;

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function mime(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function startServer(port) {
  const server = http.createServer((req, res) => {
    let relative;
    try { relative = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname).replace(/^\/+/, ''); }
    catch (_) { res.writeHead(400); res.end(); return; }
    const file = path.resolve(repo, relative);
    if (!file.startsWith(repo + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

function attachEvidence(page, record) {
  page.on('pageerror', error => record.pageErrors.push({ message: error.message, stack: error.stack || '' }));
  page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => record.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || '' }));
  page.on('request', request => { if (request.url().startsWith(CDN)) record.chartRequests.push(request.url()); });
  page.on('response', response => { if (response.url().startsWith(CDN)) record.chartResponses.push({ status: response.status(), url: response.url() }); });
}

async function installChartRoute(context, record, mode) {
  await context.route(CDN, async route => {
    record.routeHits += 1;
    if (mode === 'blocked') return route.abort('failed');
    if (mode === 'timeout-retry' && record.routeHits === 1) {
      await new Promise(resolve => setTimeout(resolve, 16000));
      try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeChart }); } catch (_) { /* timed-out script should already be removed */ }
      return;
    }
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeChart });
  });
}

function newRecord(name) {
  return { name, startedAt: new Date().toISOString(), chartRequests: [], chartResponses: [], routeHits: 0, pageErrors: [], consoleErrors: [], requestFailures: [], checks: [], passed: false };
}

async function chartEvidence(page, selector) {
  return page.locator(selector).evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    let paintedPixels = 0;
    if (ctx) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) paintedPixels++;
    }
    return { hidden: canvas.hidden, width: canvas.width, height: canvas.height, paintedPixels, chartVersion: window.Chart?.version || '', instance: Boolean(window.Chart?.getChart?.(canvas) || window.__charts?.some(chart => chart.canvas === canvas)) };
  });
}

function check(record, name, condition, details) {
  record.checks.push({ name, passed: Boolean(condition), details: details ?? null });
  assert.ok(condition, `${record.name}: ${name}${details ? ` (${JSON.stringify(details)})` : ''}`);
}

async function openTool(browser, port, route, record, mode) {
  const context = await browser.newContext();
  await installChartRoute(context, record, mode);
  const page = await context.newPage();
  attachEvidence(page, record);
  const file = route === 'seismic-force' ? '結構工具箱/tools/地震力/seismic-force.html' : '結構工具箱/tools/地震力/seismic-dynamic.html';
  await page.goto(`http://127.0.0.1:${port}/${encodeURI(file)}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function calculate(page) {
  await page.locator('#btnCalc').click();
}

async function main() {
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const output = path.join(repo, 'output', 'playwright', 'seismic-chart-lazy', runId);
  fs.mkdirSync(output, { recursive: true });
  const summary = {
    runId,
    startedAt: new Date().toISOString(),
    startHead: git(['rev-parse', 'HEAD']),
    startDirty: git(['status', '--porcelain']),
    edgePath: edge,
    playwrightVersion: require(path.join(process.cwd(), 'output', 'playwright', 'phase2-quality-deps', 'node_modules', 'playwright/package.json')).version,
    cases: [],
    failures: [],
  };
  assert.equal(summary.playwrightVersion, '1.63.0', 'pinned ignored Playwright dependency must be 1.63.0');
  let browser;
  let server;
  try {
    const port = await getFreePort();
    server = await startServer(port);
    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run', '--no-default-browser-check'] });
    summary.edgeVersion = browser.version();

    for (const tool of ['seismic-force', 'seismic-dynamic']) {
      const record = newRecord(`${tool}-cold-first`);
      summary.cases.push(record);
      let ctx;
      try {
        let page;
        ({ context: ctx, page } = await openTool(browser, port, tool, record, 'fulfill'));
        let baseline = 0;
        if (tool === 'seismic-dynamic') {
          await calculate(page);
          await page.waitForFunction(() => document.querySelector('#dynamicSpectrumChart')?.hidden === false);
          const fixture = await page.evaluate(() => localStorage.getItem('seismic-dynamic-summary'));
          record.savedSummaryFixture = fixture ? { bytes: Buffer.byteLength(fixture), sha256: crypto.createHash('sha256').update(fixture).digest('hex') } : null;
          check(record, 'setup-generated-restorable-summary', Boolean(fixture), record.savedSummaryFixture);
          baseline = record.chartRequests.length;
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        if (tool === 'seismic-dynamic') {
          await page.waitForFunction(() => document.querySelector('#resultPanel')?.style.display !== 'none');
          check(record, 'saved-summary-restores-without-chart-request', record.chartRequests.length === baseline, { setupRequests: baseline, coldRequests: record.chartRequests.length - baseline });
          check(record, 'restore-fallback-is-visible', await page.locator('#dynamicSpectrumChartFallback').isVisible());
        } else {
          check(record, 'cold-load-has-zero-chart-requests', record.chartRequests.length === baseline, { requests: record.chartRequests.length - baseline });
        }
        await calculate(page);
        const canvasSelector = tool === 'seismic-force' ? '#spectrumChart' : '#dynamicSpectrumChart';
        await page.waitForFunction(selector => {
          const c = document.querySelector(selector);
          return c && !c.hidden && window.Chart && (window.Chart.getChart?.(c) || window.__charts?.some(chart => chart.canvas === c));
        }, canvasSelector);
        const evidence = await chartEvidence(page, canvasSelector);
        check(record, 'first-spectrum-requests-chart-once', record.chartRequests.length - baseline === 1, { requests: record.chartRequests.length - baseline });
        check(record, 'first-spectrum-draws-current-chart-with-painted-pixels', !evidence.hidden && evidence.instance && evidence.paintedPixels > 0, evidence);
        if (tool === 'seismic-dynamic') {
          await page.evaluate(() => { calcDynamic(); clearDynamicSummary(); });
          const cleared = await chartEvidence(page, '#dynamicSpectrumChart');
          check(record, 'clearing-summary-invalidates-pending-chart-render', cleared.hidden && !cleared.instance && await page.locator('#resultPanel').isHidden(), cleared);
        }
        check(record, 'no-page-errors', record.pageErrors.length === 0, record.pageErrors);
        record.passed = true;
      } catch (error) { record.error = String(error.stack || error); summary.failures.push({ case: record.name, error: record.error }); }
      finally { if (ctx) await ctx.close(); record.endedAt = new Date().toISOString(); }
    }

    for (const tool of ['seismic-force', 'seismic-dynamic']) {
      const record = newRecord(`${tool}-blocked-fallback`);
      summary.cases.push(record);
      let ctx;
      try {
        let page;
        ({ context: ctx, page } = await openTool(browser, port, tool, record, 'blocked'));
        await calculate(page);
        const fallbackId = tool === 'seismic-force' ? '#spectrumChartFallback' : '#dynamicSpectrumChartFallback';
        const expectedRows = tool === 'seismic-force' ? 201 : await page.evaluate(() => lastDynamicResult?.result?.responseSpectrum?.exportRows?.length || 0);
        await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('無法載入'), fallbackId);
        check(record, 'blocked-fallback-visible', await page.locator(fallbackId).isVisible());
        if (tool === 'seismic-force') {
          check(record, 'force-complete-spectrum-table-preserved', await page.locator('#spectrumChartFallback tbody tr').count() === 201);
        } else {
          check(record, 'dynamic-complete-spectrum-table-preserved', expectedRows > 50 && await page.locator('#codeSpectrumPanel table:last-of-type tbody tr').count() === expectedRows, { expectedRows, renderedRows: await page.locator('#codeSpectrumPanel table:last-of-type tbody tr').count() });
        }
        check(record, 'blocked-case-has-no-page-errors', record.pageErrors.length === 0, record.pageErrors);
        check(record, 'blocked-case-records-original-request-failure', record.requestFailures.some(item => item.url.startsWith(CDN)), record.requestFailures);
        const popupWait = page.waitForEvent('popup');
        await page.locator('#btnReport').click();
        const popup = await popupWait;
        await popup.waitForLoadState('domcontentloaded');
        const report = await popup.evaluate(() => ({ text: document.body.innerText, images: [...document.images].map(img => ({ src: img.src, alt: img.alt })), scripts: [...document.scripts].map(script => script.src), forceRows: document.querySelectorAll('.spectrum-fallback-table tbody tr').length, dynamicRows: [...document.querySelectorAll('section')].find(section => section.querySelector('h3')?.textContent.includes('第 3.2 節反應譜資料表'))?.querySelectorAll('table:last-of-type tbody tr').length || 0 }));
        const reportRows = tool === 'seismic-force' ? report.forceRows : report.dynamicRows;
        check(record, 'blocked-report-keeps-complete-numeric-spectrum-data-and-has-no-chart-runtime', reportRows === expectedRows && !report.scripts.some(src => src.includes('chart.umd.min.js')), { expectedRows, reportRows, scriptCount: report.scripts.length, bodyHasSpectrum: /反應譜|週期|SaD/i.test(report.text) });
        const spectrumAlt = tool === 'seismic-force' ? '設計反應譜' : '動力反應譜';
        check(record, 'blocked-report-does-not-embed-spectrum-image', report.images.every(image => image.alt !== spectrumAlt), { spectrumAlt, images: report.images.map(image => ({ alt: image.alt, src: image.src.slice(0, 80) })) });
        await popup.close();
        record.passed = true;
      } catch (error) { record.error = String(error.stack || error); summary.failures.push({ case: record.name, error: record.error }); }
      finally { if (ctx) await ctx.close(); record.endedAt = new Date().toISOString(); }
    }

    {
      const record = newRecord('dynamic-timeout-concurrency-retry-generation');
      summary.cases.push(record);
      let ctx;
      try {
        let page;
        ({ context: ctx, page } = await openTool(browser, port, 'seismic-dynamic', record, 'timeout-retry'));
        await page.evaluate(() => {
          const loader = window.loadChartRuntime;
          window.__loaderPromises = [];
          window.loadChartRuntime = function() {
            const promise = loader();
            const entry = { promise, state: 'pending' };
            window.__loaderPromises.push(entry);
            promise.then(() => { entry.state = 'resolved'; }, () => { entry.state = 'rejected'; });
            return promise;
          };
        });
        await calculate(page);
        await page.locator('#btnCalc').click();
        await page.waitForFunction(() => document.querySelector('#dynamicSpectrumChartFallback')?.textContent.includes('載入中'));
        check(record, 'concurrent-render-shares-one-chart-request', record.chartRequests.length === 1, { requests: record.chartRequests.length });
        await page.evaluate(() => {
          const script = [...document.scripts].find(item => item.src.includes('chart.umd.min.js'));
          window.__staleChartLoad = script?.onload;
        });
        await page.waitForFunction(() => document.querySelector('#dynamicSpectrumChartFallback')?.textContent.includes('無法載入'), null, { timeout: 15000 });
        check(record, 'timeout-removes-old-chart-script', await page.locator('script[src*="chart.umd.min.js"]').count() === 0);
        await calculate(page);
        await page.waitForFunction(() => {
          const c = document.querySelector('#dynamicSpectrumChart');
          return c && !c.hidden && (window.Chart?.getChart?.(c) || window.__charts?.some(chart => chart.canvas === c));
        }, null, { timeout: 5000 });
        const retryEvidence = await chartEvidence(page, '#dynamicSpectrumChart');
        const promiseStates = await page.evaluate(() => window.__loaderPromises.map(item => item.state));
        const promisesAreDistinct = await page.evaluate(() => window.__loaderPromises.length >= 3 && window.__loaderPromises[0].promise !== window.__loaderPromises.at(-1).promise);
        check(record, 'timeout-clears-failed-promise-and-retry-draws', promiseStates[0] === 'rejected' && promiseStates.at(-1) === 'resolved' && promisesAreDistinct && retryEvidence.paintedPixels > 0, { requests: record.chartRequests.length, promiseStates, promisesAreDistinct, ...retryEvidence });
        await page.evaluate(() => window.__staleChartLoad?.());
        check(record, 'late-old-onload-cannot-replace-retried-chart', await page.locator('#dynamicSpectrumChart').isVisible() && await page.locator('#dynamicSpectrumChartFallback').isHidden());
        check(record, 'timeout-retry-has-no-page-errors', record.pageErrors.length === 0, record.pageErrors);
        record.passed = true;
      } catch (error) { record.error = String(error.stack || error); summary.failures.push({ case: record.name, error: record.error }); }
      finally { if (ctx) await ctx.close(); record.endedAt = new Date().toISOString(); }
    }

    {
      const record = newRecord('force-real-cdn');
      summary.cases.push(record);
      let ctx;
      try {
        let page;
        ({ context: ctx, page } = await openTool(browser, port, 'seismic-force', record, 'real'));
        await ctx.unroute(CDN);
        await calculate(page);
        await page.waitForFunction(() => {
          const c = document.querySelector('#spectrumChart');
          return c && !c.hidden && window.Chart?.version === '4.4.7' && window.Chart.getChart?.(c);
        }, null, { timeout: 30000 });
        const realEvidence = await chartEvidence(page, '#spectrumChart');
        check(record, 'real-cdn-response-and-version-and-drawn-pixels', record.chartRequests.length === 1 && record.chartResponses.some(response => response.status === 200) && realEvidence.chartVersion === '4.4.7' && realEvidence.instance && realEvidence.paintedPixels > 0, { requests: record.chartRequests.length, responses: record.chartResponses, ...realEvidence });
        check(record, 'real-cdn-case-has-no-page-errors', record.pageErrors.length === 0, record.pageErrors);
        record.passed = true;
      } catch (error) { record.error = String(error.stack || error); summary.failures.push({ case: record.name, error: record.error }); }
      finally { if (ctx) await ctx.close(); record.endedAt = new Date().toISOString(); }
    }
  } catch (error) { summary.failures.push({ fatal: String(error.stack || error) }); }
  finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    summary.endedAt = new Date().toISOString();
    summary.endHead = git(['rev-parse', 'HEAD']);
    summary.endDirty = git(['status', '--porcelain']);
    summary.expectedCaseIds = ['seismic-force-cold-first', 'seismic-dynamic-cold-first', 'seismic-force-blocked-fallback', 'seismic-dynamic-blocked-fallback', 'dynamic-timeout-concurrency-retry-generation', 'force-real-cdn'];
    summary.caseIdsComplete = JSON.stringify(summary.cases.map(record => record.name)) === JSON.stringify(summary.expectedCaseIds);
    summary.headUnchanged = summary.startHead === summary.endHead;
    summary.dirtyUnchanged = summary.startDirty === summary.endDirty;
    summary.pass = summary.failures.length === 0 && summary.cases.every(record => record.passed) && summary.caseIdsComplete && summary.headUnchanged && summary.dirtyUnchanged;
    fs.writeFileSync(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ pass: summary.pass, cases: summary.cases.length, failures: summary.failures.length, summary: path.join(output, 'summary.json') }));
    if (!summary.pass) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
