import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['microphone'] });
const page = await context.newPage(), errors = [], outbound = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
context.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(base).origin) outbound.push(r.url()); });
const idle = p => p.locator('#busy').waitFor({ state: 'hidden' });
async function click(sel, p = page) { await p.locator(sel).click(); await idle(p); }
async function projects(p = page) { return p.evaluate(async () => (await import('./store.js')).allProjects()); }
async function originalHash(p, mid) { return p.evaluate(async mid => { const a = await (await import('./store.js')).getMedia(mid); return (await import('./model.js')).sha256(a.blob); }, mid); }
async function draw(sel, p = page, start = [.22, .28], end = [.72, .68]) {
  const box = await p.locator(sel).boundingBox(); assert(box?.width > 30);
  await p.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]); await p.mouse.down();
  await p.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 5 }); await p.mouse.up();
}
try {
  await page.goto(base); await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
  assert.equal(await page.locator('#errorBar').isVisible(), false);
  await page.screenshot({ path: path.join(out, '01-mobile-start.png'), fullPage: true });
  await click('#startCase'); await page.locator('#caseForm [name=code]').fill('DEMO-001'); await page.locator('#caseForm [name=name]').fill('合成操作測試（非真實鑑定）'); await click('#caseForm button[type=submit]');
  await click('#addUnit'); await page.locator('#unitForm [name=code]').fill('測試 A 戶'); await click('#unitForm button[type=submit]'); await click('#addRecord');
  for (const [key, value] of Object.entries({ floor: '1F', space: '客廳', location: '入口右側牆面', notes: '合成測試：裂隙可见範圍紀錄。' })) await page.locator('#' + key).fill(value);
  await page.locator('#component').selectOption('牆面'); await page.locator('#condition').selectOption('crack'); await click('#saveRecord');
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
  const picker = page.waitForEvent('filechooser'); await click('#takePhoto'); await (await picker).setFiles(imagePath); await idle(page);
  await page.locator('.photo-card img').waitFor(); p = (await projects())[0]; assert.equal(p.media.length, 1); assert.equal(p.media[0].source, 'camera'); const mid = p.media[0].id, hash = p.media[0].sha256;
  await click('.photo-card'); await page.locator('#photoStage svg').waitFor();
  const imgBox = await page.locator('#photoStage img').boundingBox(), svgBox = await page.locator('#photoStage svg').boundingBox();
  assert(Math.abs(imgBox.height / imgBox.width - .7) < .01); assert(Math.abs(svgBox.height - imgBox.height) < 1);
  await draw('#photoStage svg'); await page.locator('#photoCaption').fill('合成測試圈註');
  await click('#closeModal'); assert(await page.locator('#discardPrompt').isVisible()); await click('#keepEditing'); assert(!(await page.locator('#discardPrompt').isVisible()));
  await page.screenshot({ path: path.join(out, '02-mobile-annotation.png'), fullPage: true });
  const markedDownload = page.waitForEvent('download'); await click('#downloadMarked'); const marked = await markedDownload; await marked.saveAs(path.join(out, 'marked-copy.jpg'));
  await click('#savePhoto'); p = (await projects())[0]; assert.equal(p.records[0].photos[0].marks.length, 1); assert.equal(await originalHash(page, mid), hash);
  await click('.photo-card'); await page.locator('#photoStage svg').waitFor(); await draw('#photoStage svg'); await click('#closeModal'); await click('#discardChanges'); assert.equal((await projects())[0].records[0].photos[0].marks.length, 1);
  await page.locator('#widthMode').selectOption('lt03'); await page.locator('#crackPattern').selectOption('diagonal'); await click('#saveRecord');
  p = (await projects())[0]; assert.equal(p.records[0].width, null); assert.equal(p.records[0].measured, false); assert.equal(p.records[0].widthMode, 'lt03');
  await page.locator('#measured').check(); await page.locator('#length').fill('1.2'); await click('#saveRecord'); assert.equal((await projects())[0].records[0].width, null);
  await page.locator('#widthMode').selectOption('ge03'); await click('#saveRecord'); assert.equal((await projects())[0].records[0].widthMode, 'ge03');
  await page.locator('#widthMode').selectOption('exact'); await page.locator('#width').fill('0.3'); await click('#saveRecord');
  await page.locator('#widthMode').selectOption('lt03'); await click('#saveRecord'); assert.equal(await page.locator('#width').inputValue(), ''); assert.equal((await projects())[0].records[0].width, null);
  await page.locator('#widthMode').selectOption('exact'); await page.locator('#width').fill('0.3'); await click('#saveRecord');
  await click('#showPlan'); const planPicker = page.waitForEvent('filechooser'); await click('#addPlanImage'); await (await planPicker).setFiles(imagePath); await idle(page); await page.locator('#planStage svg').waitFor(); await draw('#planStage svg'); await click('#savePlacement');
  p = (await projects())[0]; assert(p.records[0].placement); assert.equal(p.plans.length, 1);
  const imagePlanId = p.plans[0].id;
  await click('#showPlan'); await click('#drawPlan'); await page.locator('#sketchStage svg').waitFor();
  await click('[data-sketch-mode=rect]'); await draw('#sketchStage svg', page, [.1, .13], [.87, .83]);
  await click('[data-sketch-mode=line]'); await draw('#sketchStage svg', page, [.5, .13], [.5, .83]);
  await click('[data-sketch-mode=pen]');
  const touchBox = await page.locator('#sketchStage svg').boundingBox(), touch = await context.newCDPSession(page), scrollBeforeTouch = await page.evaluate(() => document.querySelector('#modal').scrollTop);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchBox.x + touchBox.width * .16, y: touchBox.y + touchBox.height * .7 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchBox.x + touchBox.width * .28, y: touchBox.y + touchBox.height * .78 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
  assert.equal(await page.evaluate(() => document.querySelector('#modal').scrollTop), scrollBeforeTouch);
  await page.locator('#sketchText').fill('客廳'); await click('[data-sketch-mode=text]'); await page.locator('#sketchStage svg').click({ position: { x: touchBox.width * .2, y: touchBox.height * .4 } });
  await click('#undoSketch'); assert((await page.locator('#sketchCount').innerText()).startsWith('3／')); await click('#redoSketch');
  await click('#closeModal'); assert(await page.locator('#discardPrompt').isVisible()); await click('#keepEditing');
  await page.screenshot({ path: path.join(out, '04-mobile-sketch.png'), fullPage: true }); await click('#saveSketch');
  await page.locator('#planStage svg').waitFor(); p = (await projects())[0]; assert.equal(p.plans.length, 2); assert.equal(p.plans[1].sketch.strokes.length, 4); assert.equal(p.records[0].placement.planId, imagePlanId);
  await draw('#planStage svg'); await click('#savePlacement'); p = (await projects())[0]; const sketchPlan = structuredClone(p.plans[1]); assert.equal(p.records[0].placement.planId, sketchPlan.id);
  await click('#showPlan'); await click('#editSketch'); await click('[data-sketch-mode=line]'); await draw('#sketchStage svg', page, [.5, .5], [.87, .5]); await click('#saveSketch');
  await page.locator('#planStage svg').waitFor(); p = (await projects())[0]; assert.equal(p.plans.length, 3); assert.deepEqual(p.plans[1], sketchPlan); assert.equal(p.plans[2].sketch.strokes.length, 5); assert.equal(p.records[0].placement.planId, sketchPlan.id);
  await draw('#planStage svg'); await click('#savePlacement');
  console.log('PASS camera input path, crack ranges without invented readings, touch sketch, revision copy and arrow placement');
  console.log('PASS mobile capture, annotation geometry, untouched original, measurements, floorplan');

  await page.locator('details summary').click(); await click('#recordAudio');
  await page.waitForFunction(() => document.querySelector('#audioStatus').textContent.includes('錄音中'));
  await page.waitForTimeout(1200); // Let the simulated microphone deliver a real recording chunk.
  await click('#recordAudio'); p = (await projects())[0]; assert.equal(p.records[0].audioIds.length, 1);
  await context.setOffline(true); await page.reload(); await page.locator('.photo-card img').waitFor();
  assert.equal(await page.locator('#width').inputValue(), '0.3'); assert.equal(await page.locator('#notes').inputValue(), '合成測試：裂隙可见範圍紀錄。');
  assert.equal(await page.locator('#crackPattern').inputValue(), 'diagonal');
  await click('#showPlan'); await click('#editSketch'); await page.locator('#sketchStage svg').waitFor(); await draw('#sketchStage svg'); await click('#closeModal'); await click('#discardChanges');
  await page.locator('#notes').fill('離線新增的合成測試紀錄'); await click('#saveRecord'); await page.reload(); await page.locator('#notes').waitFor(); assert.equal(await page.locator('#notes').inputValue(), '離線新增的合成測試紀錄');
  await context.setOffline(false);
  console.log('PASS microphone capture with simulated stream; offline reload and editing');

  await click('[data-view=backup]'); const downloadEvent = page.waitForEvent('download'); await click('#exportBackup'); const downloaded = await downloadEvent;
  const bundlePath = path.join(out, 'synthetic-backup.csurvey'); await downloaded.saveAs(bundlePath);
  const bundle = await readBundle(new Blob([await fs.readFile(bundlePath)])); assert.equal(bundle.media.length, 5); assert.equal(bundle.project.records[0].photos[0].marks.length, 1); assert.equal(bundle.project.plans[2].sketch.strokes.length, 5);
  assert((await page.locator('#exportState').innerText()).includes('待接收端'));
  const receiverContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const receiver = await receiverContext.newPage();
  await receiver.goto(base); await receiver.locator('#startCase').waitFor();
  await receiver.locator('#bundleInput').setInputFiles(bundlePath); await idle(receiver); await receiver.locator('#downloadReceipt').waitFor();
  const receiptEvent = receiver.waitForEvent('download'); await click('#downloadReceipt', receiver); const receiptFile = path.join(out, 'receipt.json'); await (await receiptEvent).saveAs(receiptFile);
  await click('#restoreBundle', receiver); const copies = await projects(receiver); assert.equal(copies.length, 1); assert.notEqual(copies[0].id, bundle.project.id);
  assert.equal(await originalHash(receiver, copies[0].records[0].photos[0].mediaId), hash);
  assert.deepEqual(copies[0].plans[2].sketch, bundle.project.plans[2].sketch); assert.equal(copies[0].records[0].widthMode, 'exact');
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
  assert(markedCopy); assert.equal(markedCopy.records[0].photos[0].marks.length, 2); assert.equal(await originalHash(photoTab, markedCopy.records[0].photos[0].mediaId), hash); await photoTab.close();
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
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, browser: await browser.version(), viewport: '390x844 + 1280x900', physicalPhoneTested: false, pageErrors: errors, externalRequests: outbound, originalHash: hash, packageMediaCount: bundle.media.length, checkedAt: new Date().toISOString() }, null, 2));
} finally { await browser.close(); server?.kill(); }
