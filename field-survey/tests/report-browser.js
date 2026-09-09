import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyReportWorkflow(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { await page.locator(selector).click(); await idle(); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), store = await import('./store.js'), p = m.newProject('REPORT-DEMO', '合成附件流程驗證', '2026-09-09'), unit = m.newUnit('A 戶'); p.units.push(unit);
      const r = m.newRecord(unit.id, '1F', '客廳'), s = m.newRecord(unit.id, '1F', '浴廁'); p.records.push(r, s);
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f0eee7'; ctx.fillRect(0, 0, 1000, 700); ctx.strokeStyle = '#314d49'; ctx.lineWidth = 8; ctx.strokeRect(120, 100, 740, 480); ctx.font = '40px sans-serif'; ctx.fillStyle = '#314d49'; ctx.fillText('SYNTHETIC FIELD PHOTO', 180, 250);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), assets = [];
      for (let i = 0; i < 5; i++) { const mid = m.id(); p.media.push({ id: mid, kind: i === 4 ? 'plan' : 'image', name: `synthetic-${i}.png`, type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() }); assets.push({ id: mid, blob }); if (i < 4) (i < 3 ? r : s).photos.push({ mediaId: mid, role: i === 0 || i === 3 ? 'overview' : i === 1 ? 'close' : 'scale', caption: '', marks: [], excluded: false, excludedReason: '' }); }
      const plan = { id: m.id(), unitId: unit.id, floor: '1F', title: '合成平面位置圖', mediaId: p.media[4].id }; p.plans.push(plan);
      for (const record of p.records) Object.assign(record, { component: '牆面', condition: 'normal', location: '入口旁', placement: { planId: plan.id, x: .2, y: .3, endX: .7, endY: .6 } });
      await store.saveProject(p, 0, assets); return { r: r.id, s: s.id, close: r.photos[1].mediaId, planId: plan.id, hash: p.media[0].sha256 };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    await click('[data-field-preset="u"]'); await click('[data-count="4"]'); await click('#saveRecord');
    assert.equal((await current()).records[0].crackCount, 4); assert(!(await page.locator('#recordIssues').innerText()).includes('尺寸'));
    assert.equal(await page.locator('#recordLocation svg text').count(), 0);
    await page.locator('#measured').check(); await page.locator('#length').fill('1.2'); await click('#saveRecord');
    assert((await page.locator('#lengthLabel').innerText()).includes('單條 U 型')); assert(!(await page.locator('#quickDescription').textContent()).includes('4.8'));
    await click('#recordLocation button:text("標示狀況位置點")'); await page.locator('#planStage svg').scrollIntoViewIfNeeded(); let box = await page.locator('#planStage svg').boundingBox(); await page.touchscreen.tap(box.x + box.width * .7, box.y + box.height * .6); await click('#savePlacement');
    await click('[data-photo="' + seed.close + '"]'); await page.locator('#photoCaption').fill('U 型裂縫近照'); await click('#photoLocation .location-edit');
    await page.locator('#planStage svg').scrollIntoViewIfNeeded(); box = await page.locator('#planStage svg').boundingBox(); await page.touchscreen.tap(box.x + box.width * .4, box.y + box.height * .4); await page.touchscreen.tap(box.x + box.width * .7, box.y + box.height * .6); await click('#savePlacement');
    let data = await current(); assert.equal(data.records[0].photos[1].placement.x.toFixed(1), '0.4'); assert.equal(data.records[0].placement.x, .2); assert.equal(data.records[0].photos[1].caption, 'U 型裂縫近照');
    await click('[data-record="' + seed.s + '"]'); await click('[data-field-preset="tile"]'); await page.locator('#tileBroken').check(); await page.locator('#tileCrackCount').fill('4'); await page.locator('#tileBrokenCount').fill('2'); await page.locator('#tileOverlapCount').fill('2'); await click('#saveRecord');
    assert.equal((await page.locator('#tileTotal').textContent()).includes('4 塊'), true); assert(!(await page.locator('#recordIssues').innerText()).includes('量測'));
    await click('[data-view="report"]'); assert.equal(await page.locator('.report-room').count(), 2); assert.equal(await page.locator('[data-report-include]:checked').count(), 3);
    const row = '[data-report-record="' + seed.r + '"]', close = row + ' [data-report-photo="' + seed.close + '"]';
    await page.locator(row + ' [data-report-text]').fill('人工核對：梁 U 型裂縫 4 條，代表條展開長度 1.2 m。');
    await click(close + ' [data-do="main"]'); await click(close + ' [data-do="photo-up"]');
    data = await current(); assert.match(data.records[0].reportText, /人工核對/); assert.equal(data.records[0].mainPhotoId, seed.close); assert.equal(data.records[0].photos[0].mediaId, seed.close); assert.equal(data.records[0].fieldNumber, 1);
    await page.locator('#reportStart').fill('10'); await click('#previewReport'); await page.frameLocator('#attachmentPreview').locator('figure img').first().waitFor();
    const frame = page.frameLocator('#attachmentPreview'); assert.equal(await frame.locator('figure').count(), 3); assert.match(await frame.locator('body').innerText(), /照片 010/); assert(!(await frame.locator('.sheet').allTextContents()).join('').includes('R-')); assert(!(await frame.locator('.sheet').allTextContents()).join('').includes('總長'));
    const download = page.waitForEvent('download'); await click('#downloadAttachment'); const htmlPath = path.join(out, 'synthetic-attachment-v0.7.html'); await (await download).saveAs(htmlPath);
    const mappingDownload = page.waitForEvent('download'); await click('#downloadMapping'); const mappingPath = path.join(out, 'synthetic-attachment-v0.7.json'); await (await mappingDownload).saveAs(mappingPath);
    const mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8')); assert.equal(mapping.groups[0].records[0].photos[0].number, '010'); assert.equal(mapping.groups[0].records[0].photos[0].mediaId, seed.close); assert(mapping.groups[0].records[0].pin); assert.equal(mapping.assets.length, 4);
    await page.screenshot({ path: path.join(out, 'v0.7-mobile-attachment.png') });
    await click('#closeModal'); await click(row + ' [data-do="main-only"]');
    assert.equal(await page.locator(row + ' [data-report-include]:checked').count(), 1);
    await page.locator(row + ' [data-report-text]').fill('重新整理後的說明'); await click('[data-view="work"]'); assert.equal((await current()).records[0].reportText, '重新整理後的說明');
    const restored = await page.evaluate(async () => { const m = await import('./model.js'), b = await import('./bundle.js'), s = await import('./store.js'), p = (await s.allProjects())[0]; const result = await b.readBundle((await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob); const c = m.restoredCopy(result.project); m.validateProject(c.project); return { version: result.manifest.version, equal: JSON.stringify(result.project) === JSON.stringify(p), hash: await m.sha256((await s.getMedia(p.media[0].id)).blob) }; });
    assert.deepEqual(restored, { version: 3, equal: true, hash: seed.hash });
    await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor(); await click('[data-view="report"]'); assert.match(await page.locator(row + ' [data-report-text]').inputValue(), /重新整理/); await context.setOffline(false);
    const standalone = await context.newPage(); await standalone.goto('file:///' + htmlPath.replaceAll('\\', '/')); await standalone.emulateMedia({ media: 'print' });
    await standalone.pdf({ path: path.join(out, 'synthetic-attachment-v0.7.pdf'), preferCSSPageSize: true, printBackground: true });
    assert.equal(await standalone.locator('figure').count(), 3); assert.match(await standalone.locator('body').innerText(), /人工核對/); assert(!(await standalone.locator('body').innerText()).includes('重新整理後的說明'));
    await standalone.screenshot({ path: path.join(out, 'v0.7-attachment-page.png'), fullPage: true });
    await standalone.close(); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'report-v0.7-result.json'), JSON.stringify({ passed: true, version: '0.7.0', backupVersion: 3, originalHash: seed.hash, selectedPhotos: 3, physicalPhoneTested: false, checkedAt: new Date().toISOString() }, null, 2));
    console.log('PASS U count-only/single-path length, tile overlap counts, rooms, separate photo positioning, selected main photo, stable field labels, generated report numbering, standalone frozen attachment, PDF and offline v3 backup');
  } finally { await context.close(); }
}
