'use strict';

// T20 正式 popup 與可攜 HTML 回歸；成功載入分支只用明確標記的 loader stub，不宣稱真實公式排版。
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = __dirname;
const CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
const FORMULA = '<p id="formula">\\(V_u = \\frac{V_u}{\\phi V_n}\\)</p>';
const PLAIN = '<p id="plain">沒有公式的報告</p>';
const CONFIG = { title: 'T20 popup MathJax 回歸', project: {}, inputs: [], checks: [], summary: { ok: true, text: '測試案例' } };

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html'; }
    catch (_) { response.writeHead(400); response.end('Invalid path'); return; }
    if (pathname === 'favicon.ico') { response.writeHead(204); response.end(); return; }
    const fullPath = path.resolve(ROOT, pathname);
    const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (fullPath !== ROOT && !fullPath.startsWith(rootPrefix)) { response.writeHead(403); response.end('Forbidden'); return; }
    fs.readFile(fullPath, (error, content) => {
      if (error) { response.writeHead(404); response.end('Not found'); return; }
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' })[path.extname(fullPath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      response.end(content);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function observeContext(context, summary, labelPrefix) {
  let index = 0;
  context.on('request', request => {
    summary.requests.push({ url: request.url(), pageUrl: request.frame()?.page()?.url() || '' });
    if (request.url() === CDN) summary.mathJaxRequests += 1;
  });
  context.on('page', page => {
    const label = `${labelPrefix}-${++index}`;
    page.on('console', message => {
      if (message.type() === 'error') summary.errors.push({ page: label, kind: 'console', message: message.text() });
    });
    page.on('pageerror', error => summary.errors.push({ page: label, kind: 'pageerror', message: String(error) }));
    page.on('requestfailed', request => {
      summary.requestFailures.push({ page: label, url: request.url(), failure: request.failure()?.errorText || '' });
    });
  });
}

async function openBuiltCoreReport(page, bodyHtml) {
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(({ cfg, body }) => {
    let button = document.getElementById('t20OpenCoreReport');
    if (!button) {
      button = document.createElement('button');
      button.id = 't20OpenCoreReport';
      button.textContent = 'Open test report';
      button.addEventListener('click', () => window.openReport(window.__t20Config, window.__t20Presentation));
      document.body.appendChild(button);
    }
    window.__t20Config = cfg;
    window.__t20Presentation = { bodyHtml: body, css: '', mathJax: true };
  }, { cfg: CONFIG, body: bodyHtml });
  await page.locator('#t20OpenCoreReport').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load', { timeout: 15000 });
  await popup.waitForFunction(() => Boolean(document.querySelector('#formula, #plain')), undefined, { timeout: 15000 });
  return popup;
}

async function openRcReport(page) {
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 't20OpenRcReport';
    button.textContent = 'Open RC test report';
    button.addEventListener('click', () => window.openReport({
      title: 'T20 RC adapter 回歸', project: {}, inputs: [],
      checks: [{ group: '公式接線', items: [{ label: 'V_u', formula: '\\(V_u = \\frac{V_u}{\\phi V_n}\\)', sub: 'V_u = 1', value: '1', unit: 'kN', ok: true }] }],
      summary: { ok: true, text: '測試案例' },
    }));
    document.body.appendChild(button);
    button.click();
  });
  const popup = await popupPromise;
  await popup.waitForLoadState('load', { timeout: 15000 });
  await popup.waitForFunction(() => Boolean(document.querySelector('.rep-check .formula')), undefined, { timeout: 15000 });
  return popup;
}

async function downloadHtml(popup, filePath) {
  await popup.locator('#repDownloadCurrentHtml').waitFor({ state: 'visible', timeout: 10000 });
  const downloadPromise = popup.waitForEvent('download', { timeout: 15000 });
  await popup.locator('#repDownloadCurrentHtml').click();
  const download = await downloadPromise;
  await download.saveAs(filePath);
  return { suggestedFilename: download.suggestedFilename(), bytes: fs.statSync(filePath).size };
}

async function saveAndOpenOffline(browser, filePath, label, summary) {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  await context.setOffline(true);
  observeContext(context, summary, label);
  const page = await context.newPage();
  await page.goto(pathToFileURL(filePath).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => {
    const statuses = [...document.querySelectorAll('.rep-content-integrity-status[data-integrity-kind]')];
    return statuses.length >= 2 && statuses.every(item => item.dataset.integrityStatus === 'verified');
  }, undefined, { timeout: 20000 });
  const visibleState = await page.evaluate(() => ({
    documentClass: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
    approved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
    contentSeal: document.querySelector('.rep-formal-content-seal-source, .rep-content-seal-source')?.dataset.contentSha256 || '',
    approvalSeal: document.querySelector('.rep-formal-approval-seal-source, .rep-approval-seal-source')?.dataset.approvalSha256 || '',
    integrity: [...document.querySelectorAll('.rep-content-integrity-status[data-integrity-kind]')].map(item => ({ kind: item.dataset.integrityKind, status: item.dataset.integrityStatus, text: item.textContent.trim() })),
    fallbackVisible: Boolean(document.querySelector('.mathjax-readable-fallback') && getComputedStyle(document.querySelector('.mathjax-readable-fallback')).display !== 'none'),
    fallbackText: document.querySelector('.mathjax-readable-fallback')?.textContent.trim() || '',
    sourceVisible: Boolean(document.querySelector('.mathjax-source') && getComputedStyle(document.querySelector('.mathjax-source')).display !== 'none'),
    rootClass: document.documentElement.className,
  }));
  assert.ok(visibleState.contentSeal, `${label} must retain its content seal`);
  assert.ok(visibleState.approvalSeal, `${label} must retain its approval seal`);
  assert.equal(visibleState.documentClass, 'internal-review', `${label} must not claim formal approval`);
  assert.equal(visibleState.approved, 'false', `${label} approval state must remain internal review`);
  return { context, page, visibleState };
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(16).slice(2, 10);
  const output = path.join(ROOT, 'output', 'playwright', 'report-mathjax-popup', runId);
  fs.mkdirSync(output, { recursive: true });
  const summary = {
    runId, cases: [], errors: [], requestFailures: [], requests: [], routeAborts: 0,
    mathJaxRequests: 0, pass: false, strictZeroConsoleErrorMetricPass: false,
    readyRenderer: 'explicit test stub; resolves loader only and does not typeset or render formulas',
    openPath: 'production window.openReport() -> shared Blob document navigation',
  };
  const writeSummary = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  let server, browser, context, pendingRouteFinishedResolve;
  try {
    server = await startStaticServer();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const edge = process.env.EDGE_PATH || [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].find(file => fs.existsSync(file));
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run'] });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    observeContext(context, summary, 'online');
    let responseMode = 'ready-stub';
    let pendingRequestStartedAt = 0;
    let pendingRouteSeenResolve;
    const waitingForPendingRoute = new Promise(resolve => { pendingRouteSeenResolve = resolve; });
    const pendingRouteFinished = new Promise(resolve => { pendingRouteFinishedResolve = resolve; });
    await context.route('**/*', async route => {
      if (route.request().url() !== CDN) { await route.continue(); return; }
      if (responseMode === 'ready-stub') {
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.__t20MathJaxTestStub = true;
          window.MathJax = window.MathJax || {};
          window.MathJax.typesetPromise = function () { return Promise.resolve(); };` });
        return;
      }
      if (responseMode === 'abort') {
        summary.routeAborts += 1;
        await route.abort('internetdisconnected');
        return;
      }
      pendingRequestStartedAt = Date.now();
      pendingRouteSeenResolve();
      try {
        // 不回應，保留 production 12000ms timeout 實際決定 fallback；15 秒後 route.abort 僅清理攔截。
        await new Promise(resolve => setTimeout(resolve, 15000));
        summary.routeAborts += 1;
        await route.abort('internetdisconnected');
      } catch (error) {
        summary.pendingRouteCleanup = String(error);
      } finally {
        pendingRouteFinishedResolve();
      }
    });

    const page = await context.newPage();
    const response = await page.goto(baseUrl + '/結構工具箱/tools/風力/wind-force.html', { waitUntil: 'load', timeout: 45000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => typeof window.openReport === 'function' && typeof window.StructReportUtils?.openReportDocument === 'function');

    let popup = await openBuiltCoreReport(page, PLAIN);
    await popup.waitForTimeout(250);
    assert.equal(summary.mathJaxRequests, 0, '無公式報告必須是 0 次 MathJax 請求');
    assert.equal(await popup.evaluate(() => document.documentElement.classList.contains('mathjax-ready') || document.documentElement.classList.contains('mathjax-fallback')), false);
    summary.cases.push({ name: '正式 core 開報表入口／無公式 popup', requestDelta: 0, pass: true });
    await popup.close();

    responseMode = 'ready-stub';
    const beforeReady = summary.mathJaxRequests;
    popup = await openBuiltCoreReport(page, FORMULA);
    await popup.waitForFunction(() => document.documentElement.classList.contains('mathjax-ready'), undefined, { timeout: 15000 });
    assert.equal(summary.mathJaxRequests - beforeReady, 1, '含公式報告必須是 1 次 CDN 請求');
    assert.equal(await popup.evaluate(() => window.__t20MathJaxTestStub === true), true, '成功分支必須明確標記測試 stub');
    assert.equal(await popup.locator('#formula .mathjax-source').isVisible(), true, 'stub 不得冒充已排版公式');
    assert.equal(await popup.locator('#formula .mathjax-test-stub').count(), 0, 'stub 不得偽造 SVG 或公式結果');
    summary.cases.push({ name: 'core loader-ready 明示 stub（非公式排版）', requestDelta: 1, renderer: summary.readyRenderer, pass: true });
    const readyDownload = await downloadHtml(popup, path.join(output, 'core-loader-ready-downloaded.html'));
    const readyOffline = await saveAndOpenOffline(browser, path.join(output, 'core-loader-ready-downloaded.html'), 'ready-file', summary);
    await readyOffline.page.waitForFunction(() => document.documentElement.classList.contains('mathjax-fallback'), undefined, { timeout: 15000 });
    Object.assign(readyOffline.visibleState, await readyOffline.page.evaluate(() => ({ rootClass: document.documentElement.className,
      fallbackVisible: Boolean(document.querySelector('.mathjax-readable-fallback') && getComputedStyle(document.querySelector('.mathjax-readable-fallback')).display !== 'none'),
      fallbackText: document.querySelector('.mathjax-readable-fallback')?.textContent.trim() || '',
      documentClass: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      approved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      integrity: [...document.querySelectorAll('.rep-content-integrity-status[data-integrity-kind]')].map(item => ({ kind: item.dataset.integrityKind, status: item.dataset.integrityStatus }))
    })));
    assert.equal(readyOffline.visibleState.fallbackVisible, true, 'ready HTML 的 file URL 離線重開必須回到可讀 fallback');
    summary.cases.push({ name: 'core loader-ready 實際下載／file URL 離線重開 fallback', requestDelta: 1, download: readyDownload, offline: readyOffline.visibleState, pass: true });
    await readyOffline.context.close(); await popup.close();

    responseMode = 'abort';
    const beforeAbort = summary.mathJaxRequests;
    const routeAbortsBefore = summary.routeAborts;
    popup = await openBuiltCoreReport(page, FORMULA);
    await popup.waitForFunction(() => !document.querySelector('script[data-report-mathjax-runtime]'), undefined, { timeout: 10000 });
    assert.equal(summary.mathJaxRequests - beforeAbort, 1, '真正 route.abort 分支只發出一次 CDN 請求');
    assert.equal(summary.routeAborts - routeAbortsBefore, 1, 'blocked 分支必須實際呼叫 route.abort');
    assert.equal(await popup.locator('#formula .mathjax-readable-fallback').isVisible(), true, 'route.abort 後文字 fallback 可見');
    const blockedText = await popup.locator('#formula .mathjax-readable-fallback').innerText();
    assert.match(blockedText, /V_\(u\).*φ.*V_\(n\)/);
    const blockedDownload = await downloadHtml(popup, path.join(output, 'core-blocked-downloaded.html'));
    const blockedOffline = await saveAndOpenOffline(browser, path.join(output, 'core-blocked-downloaded.html'), 'blocked-file', summary);
    assert.equal(blockedOffline.visibleState.fallbackVisible, true);
    assert.match(blockedOffline.visibleState.fallbackText, /V_\(u\).*φ.*V_\(n\)/);
    assert.deepEqual(blockedOffline.visibleState.integrity.map(item => item.status), ['verified', 'verified'], 'fallback 不得改動內容或核可封印');
    summary.cases.push({ name: '真正 route.abort／fallback 可見／實際下載 file URL 離線重開', requestDelta: 1, fallbackText: blockedText, download: blockedDownload, offline: blockedOffline.visibleState, pass: true });
    await blockedOffline.context.close(); await popup.close();

    responseMode = 'waiting-12000ms';
    const beforePending = summary.mathJaxRequests;
    const pendingRouteAbortsBefore = summary.routeAborts;
    popup = await openBuiltCoreReport(page, FORMULA);
    await waitingForPendingRoute;
    await popup.waitForFunction(() => Boolean(document.querySelector('script[data-report-mathjax-runtime]')), undefined, { timeout: 5000 });
    const pendingBefore = await popup.evaluate(() => ({
      rootClass: document.documentElement.className,
      loaderPresent: Boolean(document.querySelector('script[data-report-mathjax-runtime]')),
      fallbackText: document.querySelector('#formula .mathjax-readable-fallback')?.textContent || '',
    }));
    assert.equal(pendingBefore.loaderPresent, true, 'production timeout 前 CDN request 必須仍 pending');
    assert.equal(pendingBefore.rootClass.includes('mathjax-fallback'), true, 'pending 期間需顯示 fallback');
    assert.equal(summary.mathJaxRequests - beforePending, 1);
    const pendingDownload = await downloadHtml(popup, path.join(output, 'core-pending-downloaded.html'));
    const pendingOffline = await saveAndOpenOffline(browser, path.join(output, 'core-pending-downloaded.html'), 'pending-file', summary);
    assert.equal(pendingOffline.visibleState.fallbackVisible, true, 'pending 時下載的 HTML file URL 離線重開仍顯示 fallback');
    assert.deepEqual(pendingOffline.visibleState.integrity.map(item => item.status), ['verified', 'verified']);
    await pendingOffline.context.close();
    await popup.waitForFunction(() => !document.querySelector('script[data-report-mathjax-runtime]'), undefined, { timeout: 14000 });
    const pendingElapsedMs = Date.now() - pendingRequestStartedAt;
    assert.ok(pendingElapsedMs >= 11800 && pendingElapsedMs <= 14500, `production 12000ms timeout 實測 ${pendingElapsedMs}ms`);
    assert.equal(await popup.evaluate(() => document.documentElement.classList.contains('mathjax-fallback')), true);
    assert.equal(summary.mathJaxRequests - beforePending, 1);
    await pendingRouteFinished;
    assert.equal(summary.routeAborts - pendingRouteAbortsBefore, 1, 'pending route 僅在 production timeout 後以 abort 清理');
    summary.cases.push({ name: 'CDN 未回應直到 production 12 秒逾時／實際下載 pending HTML 離線重開', requestDelta: 1, elapsedMs: pendingElapsedMs, download: pendingDownload, offline: pendingOffline.visibleState, pass: true });
    await popup.close();

    responseMode = 'ready-stub';
    const rcPage = await context.newPage();
    const rcResponse = await rcPage.goto(baseUrl + '/鋼筋混凝土/tools/beam.html', { waitUntil: 'load', timeout: 45000 });
    assert.equal(rcResponse.status(), 200);
    await rcPage.waitForFunction(() => typeof window.openReport === 'function' && typeof window.RCReportUtils?.openReportDocument === 'function');
    const beforeRc = summary.mathJaxRequests;
    const rcPopup = await openRcReport(rcPage);
    await rcPopup.waitForFunction(() => document.documentElement.classList.contains('mathjax-ready'), undefined, { timeout: 15000 });
    assert.equal(summary.mathJaxRequests - beforeRc, 1, 'RC adapter 含公式報告只請求一次');
    assert.equal(await rcPopup.evaluate(() => window.__t20MathJaxTestStub === true), true, 'RC ready state 同樣是明示 stub');
    const rcDownload = await downloadHtml(rcPopup, path.join(output, 'rc-loader-ready-downloaded.html'));
    const rcOffline = await saveAndOpenOffline(browser, path.join(output, 'rc-loader-ready-downloaded.html'), 'rc-file', summary);
    await rcOffline.page.waitForFunction(() => document.documentElement.classList.contains('mathjax-fallback'), undefined, { timeout: 15000 });
    rcOffline.visibleState = await rcOffline.page.evaluate(() => ({
      rootClass: document.documentElement.className,
      fallbackVisible: Boolean(document.querySelector('.mathjax-readable-fallback') && getComputedStyle(document.querySelector('.mathjax-readable-fallback')).display !== 'none'),
      documentClass: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      approved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      integrity: [...document.querySelectorAll('.rep-content-integrity-status[data-integrity-kind]')].map(item => ({ kind: item.dataset.integrityKind, status: item.dataset.integrityStatus }))
    }));
    assert.equal(rcOffline.visibleState.fallbackVisible, true);
    assert.deepEqual(rcOffline.visibleState.integrity.map(item => item.status), ['verified', 'verified']);
    summary.cases.push({ name: 'RC 正式 openReport／adapter loader stub／下載 file URL 離線重開', requestDelta: 1, download: rcDownload, offline: rcOffline.visibleState, pass: true });
    await rcOffline.context.close(); await rcPopup.close(); await rcPage.close();

    summary.strictZeroConsoleErrorMetricPass = summary.errors.length === 0;
    summary.functionalCasesPass = summary.cases.length === 6 && summary.cases.every(item => item.pass === true);
    summary.pass = summary.functionalCasesPass && summary.strictZeroConsoleErrorMetricPass;
    if (!summary.strictZeroConsoleErrorMetricPass) summary.strictMetricConflict = '真實網路阻斷或 file URL 離線載入產生瀏覽器 console error；原始錯誤保留於 errors，不以通過替代。';
    if (!summary.pass) process.exitCode = 1;
  } catch (error) {
    summary.failure = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    summary.finishedAt = new Date().toISOString();
    writeSummary();
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve)).catch(() => {});
    console.log(JSON.stringify({ output, cases: summary.cases.length, mathJaxRequests: summary.mathJaxRequests, errors: summary.errors.length, strictZeroConsoleErrorMetricPass: summary.strictZeroConsoleErrorMetricPass, pass: summary.pass }));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
