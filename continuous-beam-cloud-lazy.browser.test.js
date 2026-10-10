'use strict';

// T28 Firebase 按需載入瀏覽器回歸；fixture 不連接或寫入遠端 Firestore。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const APP_URL = 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
const FIRESTORE_URL = 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const CDN_URLS = new Set([APP_URL, FIRESTORE_URL]);
const FALLBACK = '雲端服務暫時無法連線，可改用本地存檔';
const observedPages = new WeakMap();
const scriptBodyPromisesByLabel = new Map();
const firebaseResponseBodyPromises = [];
const gitValue = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();

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

function fixtureFor(url) {
  if (url === APP_URL) return `export function initializeApp(config) { const owner = window.parent && window.parent !== window ? window.parent : window; owner.__firebaseConfig = config; owner.__firebaseFixtureStats = owner.__firebaseFixtureStats || { initializeApp: 0, getFirestore: 0, getDocs: 0 }; owner.__firebaseFixtureStats.initializeApp++; return { app: true }; }`;
  if (url === FIRESTORE_URL) return `
    function statsOwner() { const owner = window.parent && window.parent !== window ? window.parent : window; owner.__firebaseFixtureStats = owner.__firebaseFixtureStats || { initializeApp: 0, getFirestore: 0, getDocs: 0 }; return owner; }
    export function getFirestore() { statsOwner().__firebaseFixtureStats.getFirestore++; return { fixture: true }; }
    export function collection(db, name) { return { db, name }; }
    function validatePayload(payload, includeCreatedAt) {
      const plain = Object.getPrototypeOf(payload) === Object.prototype || Object.getPrototypeOf(payload) === null;
      const expected = includeCreatedAt ? ['created_at', 'data', 'name', 'note', 'project', 'updated_at'] : ['data', 'name', 'note', 'project', 'updated_at'];
      const keys = Object.keys(payload).sort();
      if (!plain || JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error('Firestore payload prototype/schema mismatch');
      if (typeof payload.data !== 'string' || payload.name !== '20261010_T28 fixture' || payload.project !== 'T28 fixture' || payload.note !== '') throw new Error('Firestore payload values changed');
      if (!payload.updated_at?.fixtureTimestamp || (includeCreatedAt && !payload.created_at?.fixtureTimestamp)) throw new Error('Firestore timestamp sentinel missing');
      const owner = statsOwner();
      owner.__firebaseFixtureWrites = owner.__firebaseFixtureWrites || [];
      owner.__firebaseFixtureWrites.push({ operation: includeCreatedAt ? 'addDoc' : 'updateDoc', plain, keys, payload: JSON.parse(JSON.stringify(payload, (key, value) => value?.fixtureTimestamp ? '[timestamp]' : value)) });
    }
    export function addDoc(collectionRef, payload) { if (collectionRef.name !== 'beam_saves') throw new Error('Firestore collection changed'); validatePayload(payload, true); return Promise.resolve({ id: 'fixture-id' }); }
    export function doc(db, name, id) { return { db, name, id }; }
    export function getDoc() { return Promise.resolve({ exists: () => false }); }
    export function getDocs() { statsOwner().__firebaseFixtureStats.getDocs++; return Promise.resolve({ empty: true, forEach() {} }); }
    export function updateDoc(documentRef, payload) { if (documentRef.name !== 'beam_saves' || documentRef.id !== 'fixture-id') throw new Error('Firestore document reference changed'); validatePayload(payload, false); return Promise.resolve(); }
    export function deleteDoc() { return Promise.resolve(); }
    export function query(collection, order) { return { collection, order }; }
    export function orderBy(field, direction) { return { field, direction }; }
    export function serverTimestamp() { return { fixtureTimestamp: true }; }
  `;
  throw new Error(`Unexpected Firebase URL: ${url}`);
}

function observeContext(context, summary, label) {
  const scriptByRequest = new WeakMap();
  const scriptBodyPromises = [];
  context.on('request', request => {
    const page = request.frame()?.page();
    summary.requests.push({ url: request.url(), pageUrl: page?.url() || '', page: observedPages.get(page) || label });
    if (CDN_URLS.has(request.url())) summary.firebaseRequests.push(request.url());
    try {
      if (new URL(request.url()).hostname.endsWith('gstatic.com')) summary.gstaticRequests.push(request.url());
    } catch (_) { /* Keep the original URL in requests. */ }
    if (request.resourceType() === 'script' && label === 'fixture-cold-and-success' && !summary.coldPageLoad.captured) {
      const script = { url: request.url(), status: null, bytes: null, error: null };
      summary.coldPageLoad.scripts.push(script);
      scriptByRequest.set(request, script);
    }
  });
  context.on('response', response => {
    if (CDN_URLS.has(response.url())) {
      const record = { page: label, url: response.url(), status: response.status(), bytes: null, error: null };
      summary.firebaseResponses.push(record);
      firebaseResponseBodyPromises.push(response.body().then(body => { record.bytes = body.length; }).catch(error => { record.error = String(error); }));
    }
    const script = scriptByRequest.get(response.request());
    if (!script) return;
    script.status = response.status();
    scriptBodyPromises.push(response.body().then(body => { script.bytes = body.length; }).catch(error => { script.error = String(error); }));
  });
  scriptBodyPromisesByLabel.set(label, scriptBodyPromises);
  context.on('page', page => {
    observedPages.set(page, label);
    page.on('console', message => {
      if (message.type() === 'error') summary.consoleErrors.push({ page: label, message: message.text(), location: message.location() });
    });
    page.on('pageerror', error => summary.pageErrors.push({ page: label, message: String(error) }));
    page.on('requestfailed', request => summary.requestFailures.push({ page: label, url: request.url(), failure: request.failure()?.errorText || '' }));
  });
}

async function openPage(context, baseUrl) {
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/連續梁分析.html`, { waitUntil: 'load', timeout: 45000 });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => typeof window._fbLoad === 'function' && typeof window._fbSave === 'function');
  return page;
}

async function waitForRequestCount(page, summary, count) {
  await page.waitForTimeout(100);
  assert.equal(summary.firebaseRequests.length, count);
}

async function main() {
  const playwrightPath = path.join(ROOT, 'output', 'playwright', 'phase2-quality-deps', 'node_modules', 'playwright');
  assert.ok(fs.existsSync(playwrightPath), `Pinned ignored Playwright dependency is missing: ${playwrightPath}`);
  const { chromium } = require(playwrightPath);
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(16).slice(2, 10);
  const output = path.join(ROOT, 'output', 'playwright', 'continuous-beam-cloud-lazy', runId);
  fs.mkdirSync(output, { recursive: true });
  const summary = { runId, cases: [], requests: [], firebaseRequests: [], firebaseResponses: [], gstaticRequests: [], fixtureResponses: [], consoleErrors: [], pageErrors: [], requestFailures: [], pass: false,
    testedHead: gitValue(['rev-parse', 'HEAD']), worktreeStatusAtStart: gitValue(['status', '--porcelain=v1']),
    coldPageLoad: { scripts: [], scriptCount: 0, jsBytes: 0, captured: false },
    fixtureBoundary: 'fixture cases use deterministic ES module stubs; CRUD calls validate fixture payloads only and never read or write remote Firestore', realCdn: { attempted: false } };
  const writeSummary = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  let server, browser, contexts = [];
  try {
    server = await startStaticServer();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const edge = process.env.EDGE_PATH || [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].find(file => fs.existsSync(file));
    assert.ok(edge && fs.existsSync(edge), 'Microsoft Edge executable was not found; refusing to substitute bundled Chromium');
    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run'] });

    const coldContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(coldContext);
    observeContext(coldContext, summary, 'fixture-cold-and-success');
    await coldContext.route('**/*', async route => {
      if (!CDN_URLS.has(route.request().url())) { await route.continue(); return; }
      const body = fixtureFor(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      summary.fixtureResponses.push({ page: 'fixture-cold-and-success', url: route.request().url(), status: 200, body });
    });
    const coldPage = await openPage(coldContext, baseUrl);
    await coldPage.waitForTimeout(250);
    await Promise.all(scriptBodyPromisesByLabel.get('fixture-cold-and-success'));
    summary.coldPageLoad.scriptCount = summary.coldPageLoad.scripts.length;
    summary.coldPageLoad.jsBytes = summary.coldPageLoad.scripts.reduce((sum, script) => sum + (script.bytes || 0), 0);
    summary.coldPageLoad.captured = true;
    assert.ok(summary.coldPageLoad.scripts.every(script => script.status === 200 && script.bytes > 0 && !script.error), '冷開腳本回應須完整且成功');
    assert.ok(770286 - summary.coldPageLoad.jsBytes >= 540000, '連續梁冷開 JS 減量須至少 540,000 bytes');
    assert.equal(summary.gstaticRequests.length, 0, '冷開頁面不得發出任何 gstatic.com 請求');
    summary.cases.push({ id: 'cold-zero', name: '冷開頁面 Firebase 請求為 0', requestCount: 0, pass: true });
    await coldPage.locator('button[onclick="window._fbLoad()"]').click();
    await coldPage.locator('#loadList .empty-msg').filter({ hasText: '尚無存檔' }).waitFor({ timeout: 10000 });
    await waitForRequestCount(coldPage, summary, 2);
    await coldPage.locator('#loadModal button[data-ui-action="dismiss"]').click();
    await coldPage.locator('button[onclick="window._fbSave()"]').click();
    assert.equal(await coldPage.locator('#saveModal').getAttribute('class').then(value => value.includes('active')), true);
    assert.equal(summary.firebaseRequests.length, 2, '後續雲端操作共用已載入模組');
    summary.cases.push({ id: 'first-operation-two', name: '首次雲端載入恰兩個 Firebase 模組；後續操作不重複請求', requestCount: 2, pass: true });

    let retryAttempts = 0;
    const retryStartedAt = Date.now();
    const retryContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(retryContext);
    observeContext(retryContext, summary, 'fixture-blocked-then-retry');
    await retryContext.route('**/*', async route => {
      const url = route.request().url();
      if (!CDN_URLS.has(url)) { await route.continue(); return; }
      retryAttempts += 1;
      if (retryAttempts <= 2) { await route.abort('internetdisconnected'); return; }
      const body = fixtureFor(url);
      await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      summary.fixtureResponses.push({ page: 'fixture-blocked-then-retry', attempt: retryAttempts, url, status: 200, body });
    });
    const retryPage = await openPage(retryContext, baseUrl);
    try {
      await retryPage.locator('button[onclick="window._fbLoad()"]').click();
      await retryPage.locator('#loadModalStatus').getByText(FALLBACK, { exact: true }).waitFor({ timeout: 10000 });
      assert.equal(summary.pageErrors.length, 0, '阻斷 CDN 不得產生 pageerror');
      const firstAttemptFailures = summary.requestFailures.filter(item => item.page === 'fixture-blocked-then-retry');
      assert.equal(firstAttemptFailures.length, 2, '兩個阻斷請求都保留原始 requestfailed');
      await retryPage.locator('#loadModal button[data-ui-action="dismiss"]').click();
      await retryPage.locator('button[onclick="window._fbLoad()"]').click();
      await retryPage.locator('#loadList .empty-msg').filter({ hasText: '尚無存檔' }).waitFor({ timeout: 16000 });
      assert.equal(retryAttempts, 4, '失敗後重試應重新請求兩個模組，不得卡在失敗的 import promise');
      assert.equal(summary.pageErrors.length, 0);
      summary.cases.push({ id: 'blocked-retry', name: 'CDN 阻斷顯示 fallback；重試重新請求兩個模組且成功', blockedRequests: 2, retryRequests: 2,
        elapsedMs: Date.now() - retryStartedAt, fixtureStats: await retryPage.evaluate(() => window.__firebaseFixtureStats || null), pass: true });
    } catch (error) {
      const observation = await retryPage.evaluate(() => ({
        fixtureStats: window.__firebaseFixtureStats || null,
        statusText: document.getElementById('loadModalStatus')?.textContent || '',
        listText: document.getElementById('loadList')?.textContent || '',
        modalClass: document.getElementById('loadModal')?.className || '',
      })).catch(readError => ({ observationError: String(readError) }));
      summary.cases.push({ id: 'blocked-retry', name: 'CDN 阻斷 fallback 與同 URL 重試', blockedRequests: summary.requestFailures.filter(item => item.page === 'fixture-blocked-then-retry').length,
        retryRequestsObserved: Math.max(0, retryAttempts - 2), elapsedMs: Date.now() - retryStartedAt, observation,
        consoleErrors: summary.consoleErrors.filter(item => item.page === 'fixture-blocked-then-retry'),
        requestFailures: summary.requestFailures.filter(item => item.page === 'fixture-blocked-then-retry'),
        fixtureResponses: summary.fixtureResponses.filter(item => item.page === 'fixture-blocked-then-retry'),
        failure: String(error.stack || error), pass: false });
    }

    const iframeProofStartedAt = Date.now();
    const iframeRealmProof = await retryPage.evaluate(urls => new Promise(resolve => {
      const messageType = 'continuous-beam-firebase-fresh-realm-proof';
      const timeout = window.setTimeout(() => finish({ ok: false, error: 'fresh module realm proof timed out' }), 10000);
      const finish = result => {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        iframe.remove();
        resolve(result);
      };
      const onMessage = event => {
        if (event.source !== iframe.contentWindow || event.data?.type !== messageType) return;
        finish(event.data);
      };
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.title = 'Firebase module retry proof';
      window.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
      const moduleScript = iframe.contentDocument.createElement('script');
      moduleScript.type = 'module';
      const imports = urls.map(url => `import(${JSON.stringify(url)})`).join(',');
      moduleScript.textContent = `Promise.all([${imports}]).then(() => parent.postMessage({type:${JSON.stringify(messageType)},ok:true}, '*'), error => parent.postMessage({type:${JSON.stringify(messageType)},ok:false,error:String(error)}, '*'));`;
      iframe.contentDocument.head.appendChild(moduleScript);
    }), [APP_URL, FIRESTORE_URL]);
    summary.cases.push({ id: 'fresh-module-realm-proof', name: '相同 URL 在新的同源 module realm 可重試', ...iframeRealmProof,
      elapsedMs: Date.now() - iframeProofStartedAt, pass: iframeRealmProof.ok === true });

    // Fixture CRUD contract only: validate same-realm payload prototype, stable fields and both timestamp paths; no remote Firestore request is made.
    const crudContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(crudContext);
    observeContext(crudContext, summary, 'fixture-crud-payload-contract');
    await crudContext.route('**/*', async route => {
      if (!CDN_URLS.has(route.request().url())) { await route.continue(); return; }
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: fixtureFor(route.request().url()) });
    });
    const crudPage = await openPage(crudContext, baseUrl);
    await crudPage.evaluate(() => window._fbSave());
    await crudPage.locator('#saveDateInput').fill('20261010');
    await crudPage.locator('#saveProjectInput').fill('T28 fixture');
    await crudPage.evaluate(() => window._fbDoSave());
    await crudPage.locator('#saveModal').waitFor({ state: 'hidden', timeout: 10000 });
    await crudPage.evaluate(() => window._fbSave());
    await crudPage.locator('#saveDateInput').fill('20261010');
    await crudPage.locator('#saveProjectInput').fill('T28 fixture');
    await crudPage.evaluate(() => window._fbDoSave());
    await crudPage.getByRole('button', { name: '覆蓋原檔' }).click();
    await crudPage.waitForFunction(() => (window.__firebaseFixtureWrites || []).length === 2);
    summary.fixtureCrudWrites = await crudPage.evaluate(() => window.__firebaseFixtureWrites);
    assert.deepEqual(summary.fixtureCrudWrites.map(write => write.operation), ['addDoc', 'updateDoc']);
    assert.equal(summary.fixtureCrudWrites.every(write => write.plain), true);
    summary.cases.push({ id: 'same-realm-payload-contract', name: 'fixture 驗證新增／覆蓋 payload prototype、欄位及 timestamp', pass: true });

    // Real CDN is a separate production-loader probe. It opens the save modal and initializes Firebase, but never confirms a save or queries Firestore.
    const realContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(realContext);
    observeContext(realContext, summary, 'real-cdn-fetch-only');
    await realContext.route('https://firestore.googleapis.com/**', route => route.abort('blockedbyclient'));
    const realPage = await openPage(realContext, baseUrl);
    const realCdnStartedAt = Date.now();
    summary.realCdn.attempted = true;
    try {
      const responseStart = summary.firebaseResponses.length;
      await realPage.locator('button[onclick="window._fbSave()"]') .click();
      await realPage.locator('#saveModal').waitFor({ state: 'visible', timeout: 5000 });
      const deadline = Date.now() + 16000;
      while (Date.now() < deadline) {
        const newResponses = summary.firebaseResponses.slice(responseStart).filter(response => response.page === 'real-cdn-fetch-only');
        if (newResponses.length === 2) {
          await Promise.all(firebaseResponseBodyPromises.slice(-2));
          await realPage.waitForTimeout(250);
          const state = await realPage.evaluate(() => ({
            fallback: document.getElementById('saveModalStatus')?.textContent || '',
            retainedRuntimeFrameCount: document.querySelectorAll('iframe[title="Firebase module loader"]').length,
          }));
          summary.realCdn.responses = newResponses;
          summary.realCdn.state = state;
          summary.realCdn.firestoreRequests = summary.requests.filter(request => request.page === 'real-cdn-fetch-only' && /firestore\.googleapis\.com/i.test(request.url));
          summary.realCdn.result = state.fallback === FALLBACK ? 'fallback' : state.retainedRuntimeFrameCount === 1 ? 'production-loader-initialized' : 'uncertain';
          break;
        }
        await realPage.waitForTimeout(100);
      }
      if (!summary.realCdn.result) summary.realCdn.result = 'timeout';
    } catch (error) {
      summary.realCdn.result = 'failed';
      summary.realCdn.error = String(error);
    }
    summary.realCdn.urls = [...CDN_URLS];
    summary.realCdn.note = 'Real CDN probe uses the production save button, waits for production initialization, and opens only the save modal; it does not confirm a save or query Firestore. Its outcome is separate from fixture assertions.';
    summary.cases.push({ id: 'real-cdn-observation', name: '真實 CDN 模組載入觀察（獨立於 fixture，不連接 Firestore）', result: summary.realCdn.result,
      elapsedMs: Date.now() - realCdnStartedAt, informational: true });

    // Timeout/retry identity check: first attempt hangs; after 12 seconds fallback must appear, then retry succeeds.
    let timeoutAttempts = 0;
    const timeoutAttemptsByUrl = new Map();
    const timeoutStartedAt = Date.now();
    const timeoutContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(timeoutContext);
    observeContext(timeoutContext, summary, 'fixture-timeout-retry');
    await timeoutContext.route('**/*', async route => {
      const url = route.request().url();
      if (!CDN_URLS.has(url)) { await route.continue(); return; }
      timeoutAttempts += 1;
      const perUrlAttempt = (timeoutAttemptsByUrl.get(url) || 0) + 1;
      timeoutAttemptsByUrl.set(url, perUrlAttempt);
      const body = fixtureFor(url);
      if (url === APP_URL && perUrlAttempt === 1) {
        await new Promise(resolve => setTimeout(resolve, 13000));
      }
      try {
        await route.fulfill({ status: 200, contentType: 'application/javascript', body });
        summary.fixtureResponses.push({ page: 'fixture-timeout-retry', attempt: perUrlAttempt, url, status: 200, body });
      } catch (error) {
        summary.fixtureResponses.push({ page: 'fixture-timeout-retry', attempt: perUrlAttempt, url, status: null, error: String(error), body });
      }
    });
    const timeoutPage = await openPage(timeoutContext, baseUrl);
    await timeoutPage.locator('button[onclick="window._fbLoad()"]').click();
    await timeoutPage.locator('#loadModalStatus').getByText(FALLBACK, { exact: true }).waitFor({ timeout: 16000 });
    await timeoutPage.locator('#loadModal button[data-ui-action="dismiss"]').click();
    await timeoutPage.locator('button[onclick="window._fbLoad()"]').click();
    await timeoutPage.locator('#loadList .empty-msg').filter({ hasText: '尚無存檔' }).waitFor({ timeout: 10000 });
    assert.equal(summary.pageErrors.length, 0, 'timeout/retry 不得產生 pageerror');
    assert.ok(timeoutAttempts >= 2, 'timeout/retry 應實際載入並觀察 Firebase 模組');
    summary.cases.push({ id: 'timeout-retry', name: '12 秒逾時後，延遲完成的舊請求不阻止新 loader 成功', requestAttempts: timeoutAttempts,
      elapsedMs: Date.now() - timeoutStartedAt, fixtureStats: await timeoutPage.evaluate(() => window.__firebaseFixtureStats || null), pass: true });

    // Concurrent requests share one loader promise and therefore only fetch the two module URLs once.
    let concurrentCount = 0;
    const concurrentContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(concurrentContext);
    observeContext(concurrentContext, summary, 'fixture-concurrent');
    await concurrentContext.route('**/*', async route => {
      const url = route.request().url();
      if (!CDN_URLS.has(url)) { await route.continue(); return; }
      concurrentCount += 1;
      await new Promise(resolve => setTimeout(resolve, 75));
      const body = fixtureFor(url);
      await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      summary.fixtureResponses.push({ page: 'fixture-concurrent', url, status: 200, body });
    });
    const concurrentPage = await openPage(concurrentContext, baseUrl);
    await concurrentPage.evaluate(() => Promise.all([window._fbLoad(), window._fbSave()]));
    await concurrentPage.locator('#loadList .empty-msg').filter({ hasText: '尚無存檔' }).waitFor({ timeout: 10000 });
    assert.equal(concurrentCount, 2, '同時發起雲端操作只載入兩個模組一次');
    summary.cases.push({ id: 'concurrent-single-promise', name: '同時雲端操作共享單一 loader promise', requestCount: concurrentCount, pass: true });

  } catch (error) {
    summary.failure = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve)).catch(() => {});
    const requiredFixtureIds = ['cold-zero', 'first-operation-two', 'blocked-retry', 'fresh-module-realm-proof', 'same-realm-payload-contract', 'timeout-retry', 'concurrent-single-promise'];
    const fixtureCases = summary.cases.filter(item => !item.informational);
    summary.fixtureCasesPass = fixtureCases.length === requiredFixtureIds.length && requiredFixtureIds.every(id => fixtureCases.some(item => item.id === id && item.pass === true));
    summary.pageErrorPass = summary.pageErrors.length === 0;
    summary.testedHeadAtFinish = gitValue(['rev-parse', 'HEAD']);
    summary.worktreeStatusAtFinish = gitValue(['status', '--porcelain=v1']);
    summary.pass = !summary.failure && summary.fixtureCasesPass && summary.pageErrorPass && summary.testedHead === summary.testedHeadAtFinish;
    if (!summary.pass) process.exitCode = 1;
    summary.finishedAt = new Date().toISOString();
    writeSummary();
    console.log(JSON.stringify({ output, cases: summary.cases.length, fixtureCasesPass: summary.fixtureCasesPass,
      realCdn: summary.realCdn.result || 'not-run', requests: summary.firebaseRequests.length,
      coldPageLoadScriptCount: summary.coldPageLoad.scriptCount, coldPageLoadJsBytes: summary.coldPageLoad.jsBytes,
      pageErrors: summary.pageErrors.length, pass: summary.pass }));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
