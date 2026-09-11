import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from '../model.js';

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
    assert.equal(await page.locator('#reportFormat').inputValue(), 'standard');
    await page.locator('#reportLayout').evaluate(el => el.open = true); await page.locator('#reportToc').uncheck(); await page.locator('#reportRows').selectOption('0'); await page.locator('#reportPrefix').fill(''); await page.locator('#reportStart').fill('10'); await click('#previewReport'); await page.frameLocator('#attachmentPreview').locator('figure img').first().waitFor();
    const frame = page.frameLocator('#attachmentPreview'); assert.equal(await frame.locator('figure').count(), 3); assert.match(await frame.locator('body').innerText(), /照片 010/); assert(!(await frame.locator('.sheet').allTextContents()).join('').includes('R-')); assert(!(await frame.locator('.sheet').allTextContents()).join('').includes('總長'));
    const download = page.waitForEvent('download'); await click('#downloadAttachment'); const htmlPath = path.join(out, 'synthetic-attachment-v0.9.html'); await (await download).saveAs(htmlPath);
    const mappingDownload = page.waitForEvent('download'); await click('#downloadMapping'); const mappingPath = path.join(out, 'synthetic-attachment-v0.9.json'); await (await mappingDownload).saveAs(mappingPath);
    const mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8')); assert.equal(mapping.groups[0].records[0].photos[0].number, '010'); assert.equal(mapping.groups[0].records[0].photos[0].mediaId, seed.close); assert(mapping.groups[0].records[0].pin); assert.equal(mapping.assets.length, 4);
    assert.equal(mapping.format, 'standard'); assert.deepEqual(mapping.sections.map(s => s.type), ['plan-sheet', 'table-sheet', 'photo-sheet', 'photo-sheet']);
    assert.equal(await frame.locator('.plan-sheet').count(), 1); assert.equal(await frame.locator('tbody tr').count(), 3);
    assert.match(await frame.locator('tbody').innerText(), /mm|1.2 m/);
    assert.doesNotMatch(await frame.locator('.table-sheet').innerText(), /日期|2026-09-09/);
    await page.screenshot({ path: path.join(out, 'v0.9-mobile-attachment.png') });
    await click('#closeModal');
    await page.locator(row + ' [data-report-text]').fill('切換格式仍保留手動說明');
    await page.locator('#reportFormat').selectOption('quick'); await idle(); assert.equal((await current()).records[0].reportText, '切換格式仍保留手動說明');
    await click('#previewReport'); await page.frameLocator('#attachmentPreview').locator('figure').first().waitFor();
    assert.equal(await page.frameLocator('#attachmentPreview').locator('.plan-sheet').count(), 2); assert.equal(await page.frameLocator('#attachmentPreview').locator('table').count(), 0);
    const quickDownload = page.waitForEvent('download'); await click('#downloadAttachment'); const quickPath = path.join(out, 'synthetic-quick-v0.9.html'); await (await quickDownload).saveAs(quickPath);
    await click('#closeModal'); await click(row + ' [data-do="main-only"]');
    assert.equal(await page.locator(row + ' [data-report-include]:checked').count(), 1);
    await page.locator(row + ' [data-report-text]').fill('重新整理後的說明'); await click('[data-view="work"]'); assert.equal((await current()).records[0].reportText, '重新整理後的說明');
    const restored = await page.evaluate(async () => { const m = await import('./model.js'), b = await import('./bundle.js'), s = await import('./store.js'), p = (await s.allProjects())[0]; const result = await b.readBundle((await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob); const c = m.restoredCopy(result.project); m.validateProject(c.project); return { version: result.manifest.version, equal: JSON.stringify(result.project) === JSON.stringify(p), hash: await m.sha256((await s.getMedia(p.media[0].id)).blob) }; });
    assert.deepEqual(restored, { version: 5, equal: true, hash: seed.hash });
    await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor(); await click('[data-view="report"]'); assert.match(await page.locator(row + ' [data-report-text]').inputValue(), /重新整理/); await context.setOffline(false);
    const standalone = await context.newPage(); await standalone.goto('file:///' + htmlPath.replaceAll('\\', '/')); await standalone.emulateMedia({ media: 'print' });
    await standalone.pdf({ path: path.join(out, 'synthetic-attachment-v0.9.pdf'), preferCSSPageSize: true, printBackground: true });
    assert.equal(await standalone.locator('figure').count(), 3); assert.match(await standalone.locator('body').innerText(), /人工核對/); assert(!(await standalone.locator('body').innerText()).includes('重新整理後的說明'));
    await standalone.screenshot({ path: path.join(out, 'v0.9-attachment-page.png'), fullPage: true });
    await standalone.goto('file:///' + quickPath.replaceAll('\\', '/')); await standalone.pdf({ path: path.join(out, 'synthetic-quick-v0.9.pdf'), preferCSSPageSize: true, printBackground: true });
    await standalone.close(); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'report-v0.9-result.json'), JSON.stringify({ passed: true, version: VERSION, backupVersion: 5, originalHash: seed.hash, selectedPhotos: 3, physicalPhoneTested: false, checkedAt: new Date().toISOString() }, null, 2));
    await verifyStandardPagination(page, context, out);
    console.log('PASS standard/quick layouts, consolidated plans, shared numbering, measured table pagination, standalone frozen PDF and offline backup');
  } finally { await context.close(); }
}

async function verifyStandardPagination(page, context, out) {
  const result = await page.evaluate(async () => {
    const m = await import('./model.js'), s = await import('./store.js'), report = await import('./report.js');
    const p = m.clone((await s.allProjects())[0]), media = p.media[0], blobs = new Map();
    for (const asset of p.media) blobs.set(asset.id, (await s.getMedia(asset.id)).blob);
    p.records[0].photos.forEach((photo, i) => { photo.reportInclude = i < 2; });
    const long = '完整段落：裂縫寬度 ≤0.3 mm；長度 1.2 m；白華面積 2.5 m²。\n'.repeat(110) + '完整說明終點';
    p.records[0].reportText = long; p.records[0].notes = '<script>不可執行</script>\n屋主陳述：2026-09-08 曾有滲水。';
    const other = m.newUnit('B 戶', '合成測試地址'); p.units.push(other);
    for (const [unit, floor] of [[p.units[0], '2F'], [other, '1F']]) {
      const record = m.newRecord(unit.id, floor, '新增房間'); Object.assign(record, { component: '牆面', condition: 'normal', location: '門旁' });
      const asset = { ...media, id: m.id() }; p.media.push(asset); blobs.set(asset.id, blobs.get(media.id));
      record.photos.push({ mediaId: asset.id, role: 'overview', caption: '合成照片', marks: [], reportInclude: true, excluded: false, excludedReason: '' });
      if (floor === '2F') {
        const oldPlan = p.plans[0], plan = { ...oldPlan, id: m.id(), floor, title: '2F 整體圖' }; p.plans.push(plan);
        record.placement = { planId: plan.id, x: .3, y: .3, endX: .7, endY: .6 };
      }
      p.records.push(record);
    }
    m.syncRooms(p); const before = JSON.stringify(p);
    const standard = await report.renderAttachment(p, id => blobs.get(id), { start: 21 });
    const single = await report.renderAttachment(p, id => blobs.get(id), { unitId: other.id, perPage: 1 });
    const quick = report.attachmentIndex(p, { start: 21, format: 'quick' });
    if (JSON.stringify(p) !== before) throw new Error('Report mutated source');
    return { ...standard, single, long, sameNumbering: JSON.stringify(standard.index.groups) === JSON.stringify(quick.groups) };
  });
  assert(result.sameNumbering); const sections = result.index.sections, firstUnit = result.index.groups[0].unitId;
  assert.equal(result.single.index.groups.length, 1); assert.equal(result.single.index.groups[0].unit, 'B 戶');
  assert.equal(result.single.index.assets.length, 1); assert.equal(result.single.index.plans.length, 0);
  assert.deepEqual(result.single.index.sections.map(s => s.type), ['table-sheet', 'photo-sheet']);
  const a = sections.filter(s => s.unitId === firstUnit), b = sections.filter(s => s.unitId !== firstUnit);
  assert.deepEqual(a.slice(0, 2).map(s => s.type), ['plan-sheet', 'plan-sheet']);
  assert.equal(a.filter(s => s.type === 'plan-sheet').length, 2); assert(a.filter(s => s.type === 'table-sheet').length > 2);
  const firstPhoto = a.findIndex(s => s.type === 'photo-sheet'); assert(a.slice(2, firstPhoto).every(s => s.type === 'table-sheet'));
  assert.deepEqual(b.map(s => s.type), ['table-sheet', 'photo-sheet']);
  assert.equal(a[0].entries.flatMap(e => e.label.split('、')).includes('023'), true);
  const file = path.join(out, 'synthetic-standard-long-v0.9.html'); await fs.writeFile(file, result.html);
  await fs.writeFile(path.join(out, 'synthetic-standard-long-v0.9.json'), JSON.stringify(result.index, null, 2));
  const preview = await context.newPage();
  try {
    await preview.goto('file:///' + file.replaceAll('\\', '/')); await preview.emulateMedia({ media: 'print' });
    assert.equal(await preview.locator('.sheet').count(), sections.length);
    assert.equal(await preview.locator('script').count(), 0);
    const joined = (await preview.locator('tr[data-photo-number="021"] .row-text').allTextContents()).join(''); assert(joined.includes(result.long)); assert(joined.includes('<script>不可執行</script>'));
    assert(joined.includes('屋主陳述：2026-09-08 曾有滲水。'));
    assert((await preview.locator('.table-sheet').last().innerText()).includes('尚未定位'));
    const overflows = await preview.locator('.sheet-content').evaluateAll(elements => elements.map(el => ({ height: el.clientHeight, used: el.scrollHeight })).filter(x => x.used > x.height + 1)); assert.deepEqual(overflows, []);
    await preview.pdf({ path: path.join(out, 'synthetic-standard-long-v0.9.pdf'), preferCSSPageSize: true, printBackground: true });
    await preview.locator('.table-sheet').first().screenshot({ path: path.join(out, 'v0.9-standard-table.png') });
    await preview.setContent(result.single.html); assert.equal(await preview.locator('.count-1 img').count(), 1);
    assert.deepEqual(await preview.locator('.sheet-content').evaluateAll(els => els.filter(el => el.scrollHeight > el.clientHeight + 1).map(el => el.scrollHeight)), []);
  } finally { await preview.close(); }
  await fs.writeFile(path.join(out, 'report-v0.9-result.json'), JSON.stringify({ passed: true, version: VERSION, formats: ['standard', 'quick'], pages: sections.length, sourceUnchanged: true, longTextPreserved: true, checkedAt: new Date().toISOString() }, null, 2));
}
