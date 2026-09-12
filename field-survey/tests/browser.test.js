import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { VERSION } from '../model.js';
import assert from 'node:assert/strict';
import { verifyFieldV08Workflow } from './field-v08-browser.js';
import { verifyReportWorkflow } from './report-browser.js';
import { verifyV011 } from './v011-browser.js';
import { verifyV010 } from './v010-browser.js';
import { readBundle } from '../bundle.js';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.github/pages-smoke/node_modules/playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'output', 'field-survey-validation');
let base = process.env.SURVEY_URL, server;
if (!base) {
  server = spawn(process.execPath, [path.join(root, 'serve-local.js'), '--no-open', '--route', '/field-survey/recorder.html'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    server.stdout.on('data', data => { const match = String(data).match(/listening on (http:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    server.on('error', e => { clearTimeout(timer); reject(e); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error('Test server exited: ' + code)); });
  });
}
await fs.mkdir(out, { recursive: true });
let browser;
try { browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); }
catch (e) { server?.kill(); throw e; }
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['microphone', 'camera'] });
const page = await context.newPage(), errors = [], outbound = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
context.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(base).origin) outbound.push(r.url()); });
const idle = p => p.locator('#busy').waitFor({ state: 'hidden' });
async function click(sel, p = page) { const el = p.locator(sel); await el.evaluate(el => { for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; }); await el.click(); await idle(p); if (sel === '#addRoomFrame' || sel === '#clearSketch') await p.locator('#sketchSettings').evaluate(el => { el.open = false; }); }
async function projects(p = page) { return p.evaluate(async () => (await import('./store.js')).allProjects()); }
async function originalHash(p, mid) { return p.evaluate(async mid => { const a = await (await import('./store.js')).getMedia(mid); return (await import('./model.js')).sha256(a.blob); }, mid); }
async function sketchPoint(p, position) { return p.locator('#sketchStage svg').evaluate((svg, pos) => { const paper = svg.firstElementChild, point = svg.createSVGPoint(); point.x = Number(paper.getAttribute('width')) * pos[0]; point.y = Number(paper.getAttribute('height')) * pos[1]; const q = point.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y }; }, position); }
async function draw(sel, p = page, start = [.22, .28], end = [.72, .68]) {
  if (sel.includes('sketchStage') && await p.locator('#sketchZoom').textContent() === '100%' && await p.locator('[data-sketch-mode=pan]').getAttribute('aria-pressed') !== 'true') { const a = await sketchPoint(p, start), b = await sketchPoint(p, end); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 5 }); await p.mouse.up(); return; }
  const box = await p.locator(sel).boundingBox(); assert(box?.width > 30);
  await p.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]); await p.mouse.down();
  await p.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 5 }); await p.mouse.up();
}
async function tapSketch(start, end) {
  for (const pos of [start, end]) { const q = await sketchPoint(page, pos); await page.touchscreen.tap(q.x, q.y); }
}
async function sketchGesture(value) {
  await page.locator('#sketchSettings').evaluate(el => { el.open = true; }); await page.locator('#sketchGesture').selectOption(value); await page.locator('#sketchSettings').evaluate(el => { el.open = false; });
}
async function tapPair(sel) {
  await page.locator(sel).scrollIntoViewIfNeeded(); const b = await page.locator(sel).boundingBox();
  await page.touchscreen.tap(b.x + b.width * .25, b.y + b.height * .3); await page.touchscreen.tap(b.x + b.width * .7, b.y + b.height * .65);
}
async function verifyHttpCachedUpdate() {
  // Simulate a phone that opened the old release seconds before a deployment.
  // Fresh max-age=600 HTTP responses must not enter the next offline cache.
  const worker = await fs.readFile(path.join(root, 'field-survey/sw.js'), 'utf8');
  const assets = [...worker.match(/const ASSETS = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const files = new Map(await Promise.all([...assets, './sw.js'].map(async name => [name, await fs.readFile(path.join(root, 'field-survey', name))])));
  const cacheName = worker.match(/const CACHE = '([^']+)'/)[1], requestedNew = new Set();
  let phase = 0;
  const fixtureServer = createServer((request, response) => {
    const name = '.' + new URL(request.url, 'http://localhost').pathname.replace(/^\/field-survey/, '');
    if (!files.has(name)) { response.writeHead(404); response.end(); return; }
    if (phase) requestedNew.add(name);
    let bytes = files.get(name);
    if (!phase && name === './sw.js') bytes = Buffer.from(worker.replace(cacheName, cacheName + '-old-fixture').replace("ASSETS.map(url => new Request(url, { cache: 'reload' }))", 'ASSETS'));
    else if (!phase && /\.(html|js|css)$/.test(name)) bytes = Buffer.from(bytes.toString().replaceAll(VERSION, VERSION + '-old-fixture') + '\n/* old fixture */');
    const extension = path.extname(name), mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Cache-Control': name === './sw.js' ? 'no-store' : 'public, max-age=600' }); response.end(bytes);
  });
  await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
  const upgradeContext = await browser.newContext(), upgrade = await upgradeContext.newPage();
  try {
    await upgrade.goto(`http://127.0.0.1:${fixtureServer.address().port}/field-survey/recorder.html`);
    await upgrade.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
    assert((await upgrade.title()).includes('old-fixture'));
    const before = await upgrade.evaluate(async () => {
      const model = await import('./model.js'), store = await import('./store.js');
      return store.saveProject(model.newProject('CACHE-DEMO', '合成快取更新測試', '2026-09-08'), 0);
    });
    phase = 1; await upgrade.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await upgrade.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    await click('#help', upgrade); await upgrade.locator('#applyUpdate').waitFor({ state: 'visible' });
    await Promise.all([upgrade.waitForEvent('load'), upgrade.locator('#applyUpdate').click()]);
    await upgrade.locator('#caseSelect').waitFor(); assert.equal(await upgrade.title(), '現況鑑定紀錄 V' + VERSION);
    assert.equal(await upgrade.evaluate(async () => (await import('./model.js')).VERSION), VERSION);
    assert.deepEqual((await projects(upgrade))[0], before);
    const cached = await upgrade.evaluate(async cacheName => {
      const cache = await caches.open(cacheName), result = {};
      for (const request of await cache.keys()) { const buffer = await (await cache.match(request)).arrayBuffer(); result['.' + new URL(request.url).pathname.replace(/^\/field-survey/, '')] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join(''); }
      return result;
    }, cacheName);
    assert.equal(Object.keys(cached).length, assets.length);
    for (const asset of assets) { assert(requestedNew.has(asset), 'new worker refetches ' + asset); assert.equal(cached[asset], createHash('sha256').update(files.get(asset)).digest('hex'), 'offline cache bytes match current ' + asset); }
    await upgradeContext.setOffline(true); await upgrade.reload(); await upgrade.locator('#caseSelect').waitFor(); assert.equal(await upgrade.title(), '現況鑑定紀錄 V' + VERSION); assert.deepEqual((await projects(upgrade))[0], before);
    console.log('PASS update bypasses fresh HTTP cache for every offline asset and preserves existing case');
  } finally { await upgradeContext.close(); await new Promise(resolve => fixtureServer.close(resolve)); }
}
async function verifyPlanFirstWorkflow() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }), p = await ctx.newPage(), failures = [];
  p.on('pageerror', e => failures.push(e.message));
  const c = selector => click(selector, p), data = async () => (await projects(p))[0];
  const tapWorld = async (x, y) => {
    await p.locator('#sketchStage').scrollIntoViewIfNeeded();
    const screen = await p.locator('#sketchStage svg').evaluate((svg, [x, y]) => { const point = svg.createSVGPoint(); point.x = x; point.y = y; const result = point.matrixTransform(svg.getScreenCTM()); return { x: result.x, y: result.y }; }, [x, y]);
    await p.touchscreen.tap(screen.x, screen.y);
  };
  try {
    await p.goto(base); await c('#startCase'); await p.locator('#caseForm [name=code]').fill('DEMO-PLANS'); await p.locator('#caseForm [name=name]').fill('合成先建圖測試'); await c('#caseForm button[type=submit]');
    await c('#addUnit'); await p.locator('#unitForm [name=code]').fill('圖庫 A 戶'); await c('#unitForm button[type=submit]');
    assert(await p.locator('#unitPlans').isEnabled()); assert.equal((await data()).records.length, 0);
    await c('#unitPlans'); await p.locator('#libraryFloor').fill('3F'); await c('#librarySketch'); await c('#addRoomFrame'); await c('[data-sketch-mode=erase]');
    await tapWorld(600, 450); assert(await p.locator('#deleteSelection').isDisabled());
    await tapWorld(600, 177); assert(await p.locator('#deleteSelection').isEnabled()); assert.equal(await p.locator('[data-selection]').count(), 1);
    await c('#deleteSelection'); assert((await p.locator('#sketchCount').textContent()).startsWith('3／'));
    await c('#undoSketch'); assert((await p.locator('#sketchCount').textContent()).startsWith('1／'));
    await c('#redoSketch'); assert((await p.locator('#sketchCount').textContent()).startsWith('3／'));
    await c('#zoomIn'); await tapWorld(600, 723); await c('#deleteSelection'); assert((await p.locator('#sketchCount').textContent()).startsWith('2／')); await c('#undoSketch'); await c('#fitSketch');
    await p.locator('#eraseScope').selectOption('whole'); await tapWorld(196.8, 450); await c('#deleteSelection'); assert((await p.locator('#sketchCount').textContent()).startsWith('2／')); await c('#undoSketch');
    await p.screenshot({ path: path.join(out, '08-mobile-eraser.png'), fullPage: true });
    await c('#saveSketch'); assert.equal(await p.locator('#modalTitle').innerText(), '本戶共用平面圖庫'); assert.equal((await data()).records.length, 0); assert.equal((await data()).plans.length, 1);
    const saved = (await data()).plans[0]; assert.equal(saved.sketch.strokes.length, 3); assert(saved.sketch.strokes.every(s => s.type === 'line'));
    // A library with no records must be independently backed up and restored.
    await c('#finishLibrary'); await c('[data-view=backup]'); const backupEvent = p.waitForEvent('download'); await c('#exportBackup'); const backupPath = path.join(out, 'synthetic-plan-only.csurvey'); await (await backupEvent).saveAs(backupPath);
    const bundle = await readBundle(new Blob([await fs.readFile(backupPath)])); assert.equal(bundle.project.records.length, 0); assert.deepEqual(bundle.project.plans[0].sketch, saved.sketch); assert.equal(bundle.media.length, 1);
    await c('[data-view=work]'); await c('#unitPlans'); await p.locator('#libraryFloor').fill('2F');
    const fixture = await p.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 600); ctx.strokeRect(80, 70, 640, 460); return canvas.toDataURL().split(',')[1]; });
    const imagePath = path.join(out, 'synthetic-library-plan.png'); await fs.writeFile(imagePath, Buffer.from(fixture, 'base64'));
    const picker = p.waitForEvent('filechooser'); await c('#libraryImport'); await (await picker).setFiles(imagePath); await idle(p); assert.equal((await data()).plans.length, 2); assert.equal((await data()).records.length, 0);
    await p.screenshot({ path: path.join(out, '09-mobile-plan-library.png'), fullPage: true }); await c('#finishLibrary');
    await c('#addRecord'); await p.locator('#floor').fill('3F'); await p.locator('#space').fill('客廳'); await c('#saveRecord'); await c('#showPlan');
    assert.equal(await p.locator('#planSelect option').count(), 1); assert.equal(await p.locator('#planSelect').inputValue(), saved.id);
    await p.locator('#planStage svg').scrollIntoViewIfNeeded(); const box = await p.locator('#planStage svg').boundingBox();
    await p.touchscreen.tap(box.x + box.width * .3, box.y + box.height * .4); await p.touchscreen.tap(box.x + box.width * .6, box.y + box.height * .4); await c('#savePlacement');
    assert.equal((await data()).records[0].placement.planId, saved.id); assert.equal(await p.locator('#recordLocation svg path').count(), 1); assert((await p.locator('#recordLocation').innerText()).includes(saved.title));
    await c('#unitPlans'); await c(`[data-plan-overview="${saved.id}"]`); assert.equal(await p.locator('#overviewPlan svg path').count(), 1); await c('[data-location-record]'); assert.equal(await p.locator('#recordCode').innerText(), '位置 001');
    await p.locator('#floor').fill('2F'); await c('#saveRecord'); assert.equal((await data()).records[0].placement, null); assert.equal(await p.locator('#recordLocation svg').count(), 0);
    await c('#addUnit'); await p.locator('#unitForm [name=code]').fill('圖庫 B 戶'); await c('#unitForm button[type=submit]'); await c('#unitPlans'); assert.equal(await p.locator('[data-plan-overview]').count(), 0); await c('#finishLibrary');
    await ctx.setOffline(true); await p.reload(); await p.locator('#unitPlans').waitFor(); await c('#unitPlans'); assert.equal(await p.locator('[data-plan-overview]').count(), 2); assert.deepEqual((await data()).plans[0], saved);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(failures, []);
    console.log('PASS plan-first library with no records, segment eraser/undo/redo/zoom, backup, import, floor/unit isolation, overview, stale placement removal and offline reopen');
  } finally { await ctx.close(); }
}
try {
  await verifyHttpCachedUpdate();
  await verifyPlanFirstWorkflow();
  await page.goto(base); await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
  assert.equal(await page.locator('#errorBar').isVisible(), false);
  await page.screenshot({ path: path.join(out, '01-mobile-start.png'), fullPage: true });
  await click('#startCase'); await page.locator('#caseForm [name=code]').fill('DEMO-001'); await page.locator('#caseForm [name=name]').fill('合成操作測試（非真實鑑定）'); await click('#caseForm button[type=submit]');
  await click('#addUnit'); await page.locator('#unitForm [name=code]').fill('測試 A 戶'); await click('#unitForm button[type=submit]'); await click('#addRecord');
  await click('#quickSketch'); await page.locator('#planFloor').fill('1F'); await click('#planFloorForm button');
  assert(await page.locator('#redoSketch').isDisabled()); assert(await page.locator('#undoSketch').isDisabled());
  await page.locator('#sketchStage').scrollIntoViewIfNeeded();
  const quickBox = await page.locator('#sketchStage').boundingBox();
  const quickTap = async (x, y) => { const q = await sketchPoint(page, [x, y]); await page.touchscreen.tap(q.x, q.y); };
  await quickTap(.2, .2); assert((await page.locator('#sketchHint').innerText()).includes('起點已選好'));
  assert(await page.locator('#saveSketch').isDisabled()); await click('#undoSketch');
  assert((await page.locator('#sketchCount').textContent()).startsWith('0／')); assert(await page.locator('#redoSketch').isDisabled());
  await quickTap(.2, .2); await quickTap(.8, .3); assert((await page.locator('#sketchCount').textContent()).startsWith('1／'));
  let line = page.locator('#sketchStage g[clip-path] > line').first(); assert.equal(await line.getAttribute('y1'), await line.getAttribute('y2'));
  await click('#undoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('0／')); assert(await page.locator('#redoSketch').isEnabled());
  await click('#redoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('1／')); assert(await page.locator('#redoSketch').isDisabled());
  await click('#addRoomFrame'); await click('#undoSketch'); await click('#undoSketch');
  assert((await page.locator('#sketchCount').textContent()).startsWith('0／'));
  await click('#redoSketch'); await click('#redoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('2／'));
  await click('#clearSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('0／'));
  await click('#undoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('2／'));
  await click('#redoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('0／'));
  await click('#undoSketch'); await click('#addRoomFrame'); assert(await page.locator('#redoSketch').isDisabled());
  const beforeNavigation = await page.locator('#sketchCount').textContent();
  await click('#zoomIn'); assert.equal(await page.locator('#sketchZoom').innerText(), '140%');
  const beforePan = await page.locator('#sketchStage svg').getAttribute('viewBox');
  await click('[data-sketch-mode=pan]'); await page.locator('#sketchStage').scrollIntoViewIfNeeded(); await draw('#sketchStage svg', page, [.5, .5], [.7, .6]);
  assert.notEqual(await page.locator('#sketchStage svg').getAttribute('viewBox'), beforePan);
  await click('#fitSketch'); assert.equal(await page.locator('#sketchZoom').innerText(), '100%');
  await click('[data-sketch-mode=line]'); await tapSketch([.4, .4], [.4, .4]); assert(await page.locator('#saveSketch').isDisabled());
  await page.locator('#sketchStage').scrollIntoViewIfNeeded(); const pinchBox = await page.locator('#sketchStage svg').boundingBox(), pinch = await context.newCDPSession(page);
  const fingers = separation => [{ id: 1, x: pinchBox.x + pinchBox.width * (.5 - separation), y: pinchBox.y + pinchBox.height * .5 }, { id: 2, x: pinchBox.x + pinchBox.width * (.5 + separation), y: pinchBox.y + pinchBox.height * .5 }];
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(.15) });
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(.3) });
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [fingers(.3)[0]] });
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...fingers(.3)[0], x: fingers(.3)[0].x + 10 }] });
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pinch.detach();
  assert(Number.parseInt(await page.locator('#sketchZoom').innerText()) > 190); assert.equal(await page.locator('#sketchCount').textContent(), beforeNavigation); assert(await page.locator('#saveSketch').isEnabled());
  // Plot at zoomed screen positions and compare the stored SVG world geometry to inverse CTM coordinates.
  await sketchGesture('drag'); await page.locator('#sketchSettings').evaluate(el => { el.open = true; }); await page.locator('#sketchSnap').uncheck(); await page.locator('#sketchSettings').evaluate(el => { el.open = false; });
  await page.locator('#sketchStage').scrollIntoViewIfNeeded();
  const expected = await page.locator('#sketchStage svg').evaluate(svg => { const b = svg.getBoundingClientRect(); return [.4, .6].map(x => { const p = svg.createSVGPoint(); p.x = b.x + b.width * x; p.y = b.y + b.height * .5; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, y: q.y }; }); });
  await draw('#sketchStage svg', page, [.4, .5], [.6, .5]);
  const zoomLine = page.locator('#sketchStage g[clip-path] > line').last();
  assert(Math.abs(Number(await zoomLine.getAttribute('x1')) - expected[0].x) < 1); assert(Math.abs(Number(await zoomLine.getAttribute('x2')) - expected[1].x) < 1);
  await click('#undoSketch'); await click('#fitSketch');
  const inkBefore = await page.locator('#sketchStage g[clip-path]').innerHTML();
  await page.locator('#sketchExpansion').evaluate(el => { el.open = true; });
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const originalSize = await page.locator('#sketchStage svg > rect').evaluate(el => [el.getAttribute('width'), el.getAttribute('height')]);
    await click('[data-expand=' + side + ']'); const expandedSize = await page.locator('#sketchStage svg > rect').evaluate(el => [el.getAttribute('width'), el.getAttribute('height')]); assert.notDeepEqual(expandedSize, originalSize);
    await click('#undoSketch'); assert.equal(await page.locator('#sketchStage g[clip-path]').innerHTML(), inkBefore);
    await click('#redoSketch'); assert.deepEqual(await page.locator('#sketchStage svg > rect').evaluate(el => [el.getAttribute('width'), el.getAttribute('height')]), expandedSize); await click('#undoSketch');
  }
  console.log('PASS actual two-finger pinch, single-finger pan, inverse-CTM plotting, four-direction expansion and undo/redo');
  await click('#closeModal'); await click('#discardChanges');
  for (const [key, value] of Object.entries({ floor: '1F', space: '客廳', location: '入口右側牆面', notes: '合成測試：裂隙可见範圍紀錄。' })) await page.locator('#' + key).fill(value);
  for (const value of ['牆面', '梁', '柱']) await page.locator(`#component input[value="${value}"]`).check(); await page.locator('#condition input[value=crack]').check(); await click('#saveRecord');
  let p = (await projects())[0]; assert.equal(p.records[0].width, null); assert.equal(p.records[0].measured, false);
  const fixture = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const g = c.getContext('2d');
    g.fillStyle = '#ebe5d8'; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#aca391'; g.lineWidth = 2;
    for (let y = 0; y < 700; y += 70) { g.beginPath(); g.moveTo(0, y); g.lineTo(1000, y); g.stroke(); }
    g.strokeStyle = '#544e47'; g.lineWidth = 6; g.beginPath(); g.moveTo(410, 80); g.lineTo(440, 240); g.lineTo(420, 400); g.lineTo(520, 570); g.stroke();
    g.fillStyle = '#173d3b'; g.font = '32px sans-serif'; g.fillText('SYNTHETIC TEST IMAGE', 45, 650); return c.toDataURL('image/png').split(',')[1];
  });
  const imagePath = path.join(out, 'synthetic-wall.png'); await fs.writeFile(imagePath, Buffer.from(fixture, 'base64'));
  assert.equal(await page.locator('#cameraInput').getAttribute('capture'), 'environment');
  assert.equal(await page.locator('#cameraInput').getAttribute('accept'), 'image/*');
  await click('#takePhoto');
  await page.evaluate(() => { window.realCamera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test denial', 'NotAllowedError'); }; });
  await click('#startCamera'); await page.waitForFunction(() => document.querySelector('#cameraStatus').textContent.includes('尚未取得相機權限'));
  assert.equal(await page.locator('#busy').isVisible(), false); assert.equal(await page.locator('#shutter').isDisabled(), true);
  const picker = page.waitForEvent('filechooser'); await click('#nativeCamera'); await (await picker).setFiles([]);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.realCamera; });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async constraints => { window.lateCameraStream = await window.realCamera(constraints); return new Promise(resolve => { window.resolveCamera = () => resolve(window.lateCameraStream); }); }; });
  await click('#takePhoto'); await click('#startCamera'); await page.waitForFunction(() => !!window.resolveCamera); await click('#closeModal');
  await page.evaluate(() => window.resolveCamera()); await page.waitForFunction(() => window.lateCameraStream.getTracks().every(t => t.readyState === 'ended'));
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.realCamera; });
  await click('#takePhoto'); await click('#startCamera'); await page.locator('#shutter:enabled').waitFor();
  await page.evaluate(() => { window.cameraTracks = document.querySelector('#cameraPreview').srcObject.getTracks(); });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))); assert(await page.evaluate(() => window.cameraTracks.every(t => t.readyState === 'ended'))); assert(await page.locator('#shutter').isDisabled()); await click('#startCamera'); await page.locator('#shutter:enabled').waitFor(); await page.evaluate(() => { window.cameraTracks = document.querySelector('#cameraPreview').srcObject.getTracks(); });
  await click('#closeModal'); assert(await page.evaluate(() => window.cameraTracks.every(t => t.readyState === 'ended')));
  await click('#takePhoto'); await click('#startCamera'); await page.locator('#shutter:enabled').waitFor();
  await click('#shutter'); await page.locator('#saveCamera').waitFor(); await click('#retakeCamera'); await page.locator('#shutter:enabled').waitFor();
  await click('#shutter'); await page.locator('#saveCamera').waitFor(); await click('#closeModal'); assert(await page.locator('#discardPrompt').isVisible()); await click('#keepEditing');
  await page.screenshot({ path: path.join(out, '05-camera-review.png'), fullPage: true }); await click('#saveCamera');
  await page.locator('.photo-card img').waitFor(); p = (await projects())[0]; assert.equal(p.media.length, 1); assert.equal(p.media[0].source, 'camera-preview'); assert.deepEqual(p.records[0].components, ['牆面', '梁', '柱']); const mid = p.media[0].id, hash = p.media[0].sha256;
  await click('.photo-card'); await page.locator('#photoStage svg').waitFor();
  const imgBox = await page.locator('#photoStage img').boundingBox(), svgBox = await page.locator('#photoStage svg').boundingBox();
  assert(Math.abs(imgBox.height / imgBox.width - p.media[0].height / p.media[0].width) < .01); assert(Math.abs(svgBox.height - imgBox.height) < 1);
  await draw('#photoStage svg'); await page.locator('#photoCaption').fill('合成測試圈註');
  await click('#closeModal'); assert(await page.locator('#discardPrompt').isVisible()); await click('#keepEditing'); assert(!(await page.locator('#discardPrompt').isVisible()));
  await page.screenshot({ path: path.join(out, '02-mobile-annotation.png'), fullPage: true });
  const markedDownload = page.waitForEvent('download'); await click('#downloadMarked'); const marked = await markedDownload; await marked.saveAs(path.join(out, 'marked-copy.jpg'));
  await click('#savePhoto'); p = (await projects())[0]; assert.equal(p.records[0].photos[0].marks.length, 1); assert.equal(await originalHash(page, mid), hash);
  await click('.photo-card'); await page.locator('#photoStage svg').waitFor(); await draw('#photoStage svg'); await click('#closeModal'); await click('#discardChanges'); assert.equal((await projects())[0].records[0].photos[0].marks.length, 1);
  await page.locator('#crackPattern').selectOption('network'); await click('#saveRecord');
  assert.equal(await page.locator('#recordIssues').innerText(), '本筆必要紀錄已齊'); assert((await page.locator('#widthLabel').innerText()).includes('選填')); assert((await page.locator('#lengthLabel').innerText()).includes('選填'));
  await page.reload(); await page.locator('#crackPattern').waitFor(); assert.equal(await page.locator('#crackPattern').inputValue(), 'network'); assert.equal(await page.locator('#recordIssues').innerText(), '本筆必要紀錄已齊');
  assert.equal(await page.locator('#measured').isChecked(), false); p = (await projects())[0]; assert.equal(p.records[0].width, null); assert.equal(p.records[0].length, null);
  await click('[data-view=review]'); assert((await page.locator('#reviewList').innerText()).includes('未列出必要欄位待補')); await click('[data-view=work]');
  await page.locator('#measured').check(); await page.locator('#widthMode').selectOption('exact'); await page.locator('#width').fill('0.2'); await click('#saveRecord');
  assert.equal(await page.locator('#recordIssues').innerText(), '本筆必要紀錄已齊');
  await page.locator('#crackPattern').selectOption('diagonal'); await click('#saveRecord'); assert((await page.locator('#recordIssues').innerText()).includes('量測尺寸未齊')); assert(!(await page.locator('#lengthLabel').innerText()).includes('選填')); assert.equal(await page.locator('#width').inputValue(), '0.2');
  await page.locator('#crackPattern').selectOption('network'); await click('#saveRecord'); assert.equal(await page.locator('#recordIssues').innerText(), '本筆必要紀錄已齊'); assert.equal((await projects())[0].records[0].width, .2);
  await page.screenshot({ path: path.join(out, '06-network-crack-optional.png'), fullPage: true });
  await page.locator('#measured').uncheck(); await click('#saveRecord'); assert.equal(await page.locator('#recordIssues').innerText(), '本筆必要紀錄已齊');
  await page.locator('#crackPattern').selectOption('horizontal'); await click('#saveRecord'); assert((await page.locator('#recordIssues').innerText()).includes('裂縫未量測'));
  console.log('PASS network crack dimensions optional, reload and review without measurement reminders, optional readings preserved, regular cracks still checked');
  await click('[data-width=le03]'); await click('#saveRecord'); p = (await projects())[0]; assert.equal(p.records[0].widthMode, 'le03'); assert.equal(p.records[0].width, null); assert.equal(p.records[0].measured, false);
  await click('[data-width=gt03]'); await click('#saveRecord'); assert.equal((await projects())[0].records[0].widthMode, 'gt03');
  await page.locator('#widthMode').selectOption('lt03'); await page.locator('#crackPattern').selectOption('diagonal'); await click('#saveRecord');
  p = (await projects())[0]; assert.equal(p.records[0].width, null); assert.equal(p.records[0].measured, false); assert.equal(p.records[0].widthMode, 'lt03');
  await page.locator('#measured').check(); await page.locator('#length').fill('1.2'); await click('#saveRecord'); assert.equal((await projects())[0].records[0].width, null);
  await page.locator('#widthMode').selectOption('ge03'); await click('#saveRecord'); assert.equal((await projects())[0].records[0].widthMode, 'ge03');
  await page.locator('#widthMode').selectOption('exact'); await page.locator('#width').fill('0.3'); await click('#saveRecord');
  await page.locator('#widthMode').selectOption('lt03'); await click('#saveRecord'); assert.equal(await page.locator('#width').inputValue(), ''); assert.equal((await projects())[0].records[0].width, null);
  await page.locator('#widthMode').selectOption('exact'); await page.locator('#width').fill('0.3'); await click('#saveRecord');
  await click('#showPlan'); const planPicker = page.waitForEvent('filechooser'); await click('#addPlanImage'); await (await planPicker).setFiles(imagePath); await idle(page); await page.locator('#planStage svg').waitFor(); await tapPair('#planStage svg'); await click('#savePlacement');
  p = (await projects())[0]; assert(p.records[0].placement); assert.equal(p.plans.length, 1);
  const imagePlanId = p.plans[0].id;
  await click('#showPlan'); await click('#drawPlan'); await sketchGesture('drag'); await page.locator('#sketchStage svg').waitFor();
  await click('[data-sketch-mode=rect]'); await draw('#sketchStage svg', page, [.1, .13], [.87, .83]);
  await click('[data-sketch-mode=line]'); await draw('#sketchStage svg', page, [.5, .13], [.5, .83]);
  await click('[data-sketch-mode=pen]');
  const touchBox = await page.locator('#sketchStage svg').boundingBox(), touch = await context.newCDPSession(page), scrollBeforeTouch = await page.evaluate(() => document.querySelector('#modal').scrollTop);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchBox.x + touchBox.width * .16, y: touchBox.y + touchBox.height * .7 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchBox.x + touchBox.width * .28, y: touchBox.y + touchBox.height * .78 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
  assert.equal(await page.evaluate(() => document.querySelector('#modal').scrollTop), scrollBeforeTouch);
  await click('[data-sketch-mode=text]'); await page.locator('#sketchText').fill('客廳'); await page.locator('#sketchStage svg').click({ position: { x: touchBox.width * .2, y: touchBox.height * .4 } });
  await click('#undoSketch'); assert((await page.locator('#sketchCount').textContent()).startsWith('3／')); await click('#redoSketch');
  await click('#closeModal'); assert(await page.locator('#discardPrompt').isVisible()); await click('#keepEditing');
  await sketchGesture('tap'); await click('[data-sketch-mode=door]'); await page.locator('#doorSwing').selectOption('1'); await page.locator('#sketchStage').scrollIntoViewIfNeeded();
  await tapSketch([.2, .13], [.4, .14]); assert.equal(await page.locator('[data-sketch-type=door]').count(), 1);
  await click('[data-sketch-mode=window]'); await page.locator('#sketchStage').scrollIntoViewIfNeeded(); await tapSketch([.6, .13], [.8, .14]); assert.equal(await page.locator('[data-sketch-type=window]').count(), 1);
  await click('#undoSketch'); assert.equal(await page.locator('[data-sketch-type=window]').count(), 0); await click('#redoSketch'); assert.equal(await page.locator('[data-sketch-type=window]').count(), 1);
  await page.screenshot({ path: path.join(out, '04-mobile-sketch.png'), fullPage: true }); await click('#saveSketch');
  await page.locator('#planStage svg').waitFor(); p = (await projects())[0]; assert.equal(p.plans.length, 2); assert.equal(p.plans[1].sketch.strokes.length, 6); assert.equal(p.plans[1].sketch.strokes[4].type, 'door'); assert.equal(p.plans[1].sketch.strokes[4].swing, 1); assert.equal(p.plans[1].sketch.strokes[5].type, 'window'); assert.equal(p.records[0].placement.planId, imagePlanId);
  await tapPair('#planStage svg'); await click('#savePlacement'); p = (await projects())[0]; const sketchPlan = structuredClone(p.plans[1]); assert.equal(p.records[0].placement.planId, sketchPlan.id);
  await click('#showPlan'); await click('#editSketch'); assert(await page.locator('#redoSketch').isDisabled()); await page.locator('#sketchExpansion').evaluate(el => { el.open = true; }); await click('[data-expand=left]'); await click('[data-expand=top]'); await page.locator('#sketchExpansion').evaluate(el => { el.open = false; }); await sketchGesture('drag'); await click('[data-sketch-mode=line]'); await draw('#sketchStage svg', page, [.5, .5], [.87, .5]); await click('#saveSketch');
  await page.locator('#planStage svg').waitFor(); p = (await projects())[0]; assert.equal(p.plans.length, 3); assert.deepEqual(p.plans[1], sketchPlan); assert.equal(p.plans[2].sketch.strokes.length, 7); assert.equal(p.records[0].placement.planId, sketchPlan.id);
  await tapPair('#planStage svg'); await click('#savePlacement');
  for (const value of ['damp', 'salt', 'spall']) await page.locator('#condition input[value=' + value + ']').check();
  await page.locator('#areaMeasurements summary').click(); await page.locator('#area-damp').fill('1.5'); await page.locator('#area-salt').fill('0.8'); await page.locator('#area-method-salt').selectOption('estimated'); await page.locator('#area-spall').fill('0.25'); await click('#saveRecord');
  let multi = (await projects())[0].records[0]; assert.deepEqual(multi.conditions, ['crack', 'damp', 'salt', 'spall']); assert.deepEqual(multi.areas.salt, { value: .8, method: 'estimated' }); assert.equal(multi.width, .3); assert.equal(multi.length, 1.2);
  await page.locator('#condition input[value=normal]').check(); await click('#saveRecord'); assert.deepEqual((await projects())[0].records[0].conditions, ['normal']); assert.equal(await page.locator('#areaMeasurements').isVisible(), false);
  for (const value of ['crack', 'damp', 'salt', 'spall']) await page.locator('#condition input[value=' + value + ']').check(); await click('#saveRecord');
  assert.equal(await page.locator('#area-salt').inputValue(), '0.8'); assert.equal(await page.locator('#width').inputValue(), '0.3');
  await click('.photo-card'); await page.locator('#photoStage svg').waitFor();
  for (const [i, condition] of ['salt', 'spall'].entries()) { await click('[data-condition-label=' + condition + ']'); await page.locator('#photoStage svg').click({ position: { x: 50 + i * 60, y: 60 + i * 30 } }); }
  assert.equal(await page.locator('#photoLocation svg path').count(), 1);
  const compositeEvent = page.waitForEvent('download'); await click('#downloadPhotoLocation'); const compositePath = path.join(out, 'synthetic-photo-location.jpg'); await (await compositeEvent).saveAs(compositePath);
  const compositeBytes = await fs.readFile(compositePath); assert.equal(compositeBytes.subarray(0, 2).toString('hex'), 'ffd8');
  const compositeDimensions = await page.evaluate(async bytes => { const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })); const size = [img.width, img.height]; img.close(); return size; }, [...compositeBytes]); assert.deepEqual(compositeDimensions, [1600, 1900]);
  assert.equal((await projects())[0].records[0].photos[0].marks.length, 1, 'download does not silently save or change originals');
  await click('#photoLocation .location-edit'); await page.locator('#planStage svg').waitFor(); await click('#closeModal');
  multi = (await projects())[0].records[0]; assert.equal(multi.photos.length, 1); assert.deepEqual(multi.photos[0].marks.filter(m => m.type === 'text').map(m => m.text), ['白華', '剝落']); assert.equal(await originalHash(page, mid), hash);
  console.log('PASS photo location preview, composite JPEG export and save-before-location navigation preserve originals and annotations');
  await page.screenshot({ path: path.join(out, '07-multiple-conditions.png'), fullPage: true });
  console.log('PASS camera and component flows; undo/redo and new-branch history, pending-point cancel, orthogonal touch sketch, doors/windows and arrow placement');
  console.log('PASS mobile capture, annotation geometry, untouched original, measurements, floorplan');

  await page.locator('details:has(#resident) summary').click(); await click('#recordAudio');
  await page.waitForFunction(() => document.querySelector('#audioStatus').textContent.includes('錄音中'));
  await page.waitForTimeout(1200); // Let the simulated microphone deliver a real recording chunk.
  await click('#recordAudio'); p = (await projects())[0]; assert.equal(p.records[0].audioIds.length, 1);
  await context.setOffline(true); await page.reload(); await page.locator('.photo-card img').waitFor();
  assert.equal(await page.locator('#width').inputValue(), '0.3'); assert.equal(await page.locator('#notes').inputValue(), '合成測試：裂隙可见範圍紀錄。');
  assert.equal(await page.locator('#crackPattern').inputValue(), 'diagonal');
  await click('#showPlan'); await click('#editSketch'); await sketchGesture('drag'); await page.locator('#sketchStage svg').waitFor(); await draw('#sketchStage svg'); await click('#closeModal'); await click('#discardChanges');
  await page.locator('#notes').fill('離線新增的合成測試紀錄'); await click('#saveRecord'); await page.reload(); await page.locator('#notes').waitFor(); assert.equal(await page.locator('#notes').inputValue(), '離線新增的合成測試紀錄');
  await context.setOffline(false);
  console.log('PASS microphone capture with simulated stream; offline reload and editing');

  await click('[data-view=backup]'); const downloadEvent = page.waitForEvent('download'); await click('#exportBackup'); const downloaded = await downloadEvent;
  const bundlePath = path.join(out, 'synthetic-backup.csurvey'); await downloaded.saveAs(bundlePath);
  const bundle = await readBundle(new Blob([await fs.readFile(bundlePath)])); assert.equal(bundle.media.length, 5); assert.equal(bundle.project.records[0].photos[0].marks.length, 3); assert.equal(bundle.project.plans[2].sketch.strokes.length, 7);
  assert((await page.locator('#exportState').innerText()).includes('待接收端'));
  const receiverContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const receiver = await receiverContext.newPage();
  await receiver.goto(base); await receiver.locator('#startCase').waitFor();
  await receiver.locator('#bundleInput').setInputFiles(bundlePath); await idle(receiver); await receiver.locator('#downloadReceipt').waitFor();
  const receiptEvent = receiver.waitForEvent('download'); await click('#downloadReceipt', receiver); const receiptFile = path.join(out, 'receipt.json'); await (await receiptEvent).saveAs(receiptFile);
  await click('#restoreBundle', receiver); const copies = await projects(receiver); assert.equal(copies.length, 1); assert.notEqual(copies[0].id, bundle.project.id);
  assert.equal(await originalHash(receiver, copies[0].records[0].photos[0].mediaId), hash);
  assert.deepEqual(copies[0].records[0].conditions, ['crack', 'damp', 'salt', 'spall']); assert.deepEqual(copies[0].records[0].areas, multi.areas); assert.equal(copies[0].plans[2].sketch.version, 2);
  assert.deepEqual(copies[0].records[0].components, ['牆面', '梁', '柱']); assert.deepEqual(copies[0].plans[2].sketch, bundle.project.plans[2].sketch); assert.equal(copies[0].records[0].widthMode, 'exact');
  await receiver.screenshot({ path: path.join(out, '03-desktop-restored.png'), fullPage: true });
  await page.locator('#receiptInput').setInputFiles(receiptFile); await idle(page); await page.waitForFunction(() => document.querySelector('#exportState').textContent.includes('已匯入本版本'));
  const corrupt = Buffer.from(await fs.readFile(bundlePath)); corrupt[corrupt.length - 1] ^= 1; const corruptPath = path.join(out, 'corrupt.csurvey'); await fs.writeFile(corruptPath, corrupt);
  await receiver.locator('#bundleInput').setInputFiles(corruptPath); await idle(receiver); await receiver.locator('#errorBar').waitFor(); assert.equal((await projects(receiver)).length, 1);
  await receiverContext.close();
  console.log('PASS backup restores to independent browser, receipt verified, corrupt file rejected');

  await click('[data-view=work]'); const other = await context.newPage(); await other.goto(base); await other.locator('#notes').waitFor();
  await page.locator('#notes').fill('第一視窗修改'); await click('#saveRecord');
  await other.locator('#notes').fill('第二視窗保留的修改'); await click('#saveRecord', other); await other.locator('#recoverCopy').waitFor();
  await click('#recoverCopy', other); const saved = await projects(other); assert.equal(saved.length, 2);
  assert(saved.some(x => x.records[0].notes === '第一視窗修改')); assert(saved.some(x => x.records[0].notes === '第二視窗保留的修改'));
  await other.close();
  const photoTab = await context.newPage(); await photoTab.goto(base); await photoTab.locator('#caseSelect').selectOption(bundle.project.id); await idle(photoTab);
  await click('.photo-card', photoTab); await photoTab.locator('#photoStage svg').waitFor(); await draw('#photoStage svg', photoTab); await photoTab.locator('#photoCaption').fill('衝突圈註副本');
  await page.locator('#notes').fill('第一視窗再次修改'); await click('#saveRecord');
  await click('#savePhoto', photoTab); await photoTab.locator('#modalRecover').waitFor(); await click('#modalRecover', photoTab);
  const markedCopy = (await projects(photoTab)).find(x => x.records[0].photos[0].caption === '衝突圈註副本');
  assert(markedCopy); assert.equal(markedCopy.records[0].photos[0].marks.length, 4); assert.equal(await originalHash(photoTab, markedCopy.records[0].photos[0].mediaId), hash); await photoTab.close();
  const captureTab = await context.newPage(); await captureTab.goto(base); await captureTab.locator('#caseSelect').selectOption(bundle.project.id); await idle(captureTab);
  const extraPath = path.join(out, 'synthetic-extra.png'); await fs.writeFile(extraPath, Buffer.concat([Buffer.from(fixture, 'base64'), Buffer.from([1])]));
  const extraPicker = captureTab.waitForEvent('filechooser'); await click('#pickPhotos', captureTab);
  await page.locator('#notes').fill('原案持續保存'); await click('#saveRecord'); await (await extraPicker).setFiles(extraPath); await idle(captureTab); await captureTab.locator('#recoverCopy').waitFor(); await click('#recoverCopy', captureTab);
  const capturedCopy = (await projects(captureTab)).find(x => x.records[0].photos.length === 2); assert(capturedCopy); assert.equal(capturedCopy.media.length, 6);
  const extraId = capturedCopy.records[0].photos[1].mediaId; assert.equal(await originalHash(captureTab, extraId), capturedCopy.media.find(m => m.id === extraId).sha256); await captureTab.close();
  console.log('PASS conflicting annotation and incoming photo both survive isolated-copy recovery');
  await click('.photo-card'); await page.locator('#photoExcluded').check(); await page.locator('#excludedReason').fill('測試排除'); await click('#savePhoto');
  assert((await page.locator('#recordIssues').innerText()).includes('尚無採用照片')); assert.equal(await originalHash(page, mid), hash);
  await click('[data-view=backup]'); assert((await page.locator('#exportState').innerText()).includes('已有修改'));
  await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS conflict recovery, exclusion preserves original, stale backup reminder, no external requests');
  await verifyReportWorkflow(browser, base, out);
  await verifyFieldV08Workflow(browser, base, out);
  await verifyV010(browser, base, out);
  await verifyV011(browser, base, out);
  await (await import('./scale-browser.js')).verifyScale(browser, base, out);
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, browser: await browser.version(), viewport: '390x844 + 1280x900', physicalPhoneTested: false, httpCacheUpgradeVerified: true, pageErrors: errors, externalRequests: outbound, originalHash: hash, packageMediaCount: bundle.media.length, checkedAt: new Date().toISOString() }, null, 2));
} finally { await browser.close(); server?.kill(); }
