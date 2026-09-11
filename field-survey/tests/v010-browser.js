import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from '../model.js';

export async function verifyV010(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { const locator = page.locator(selector); await locator.evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; }); await locator.click(); await idle(); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const download = async (button, filename) => { const waiting = page.waitForEvent('download'); await click(button); const file = path.join(out, filename); await (await waiting).saveAs(file); return file; };
  const paint = async () => { await page.locator('#detailStage svg').scrollIntoViewIfNeeded(); const b = await page.locator('#detailStage svg').boundingBox(); await page.mouse.move(b.x + b.width * .25, b.y + b.height * .25); await page.mouse.down(); await page.mouse.move(b.x + b.width * .4, b.y + b.height * .6, { steps: 8 }); await page.mouse.move(b.x + b.width * .5, b.y + b.height * .7, { steps: 6 }); await page.mouse.up(); return b; };
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('SYNTHETIC-V010', '合成多戶與公設附件', '2026-09-10'); p.visits[0].end = '2026-09-11';
      const units = ['A-001', 'B-001', 'P-001', 'C-001'].map(code => m.newUnit(code, '合成測試地址')); units[2].kind = 'public'; units[2].building = 'A 棟'; units[3].status = 'inaccessible'; units[3].reason = '合成：未能入內'; p.units.push(...units);
      const assets = [], canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400; const ctx = canvas.getContext('2d'); let serial = 0;
      const asset = async kind => { ctx.fillStyle = kind === 'plan' ? '#ffffff' : '#eceadf'; ctx.fillRect(0, 0, 600, 400); ctx.strokeStyle = '#284441'; ctx.lineWidth = 3; ctx.strokeRect(90, 75, 420, 250); ctx.fillStyle = '#284441'; ctx.font = '24px sans-serif'; ctx.fillText('SYNTHETIC ' + (++serial), 115, 145); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); const mid = m.id(); p.media.push({ id: mid, name: 'synthetic-' + serial + '.png', kind, size: blob.size, type: blob.type, importedAt: m.now(), sha256: await m.sha256(blob) }); assets.push({ id: mid, blob, thumb: blob }); return mid; };
      for (let ui = 0; ui < 3; ui++) {
        const u = units[ui], plans = [];
        for (const floor of ['1F', '2F']) { const plan = { id: m.id(), unitId: u.id, floor, title: '合成 ' + floor + ' 平面圖', mediaId: await asset('plan') }; plans.push(plan); p.plans.push(plan); }
        for (let i = 0; i < (ui === 0 ? 10 : 2); i++) {
          const plan = plans[i % 2], r = m.newRecord(u.id, plan.floor, '空間 ' + (i + 1)); Object.assign(r, { component: '牆面', condition: 'normal', location: '合成入口 ' + (i + 1), visitId: p.visits[0].id, observedOn: ui ? '2026-09-11' : '', placement: { planId: plan.id, x: .25 + .03 * i, y: .4, endX: .7, endY: .6 } });
          for (const role of ['overview', 'close']) r.photos.push({ mediaId: await asset('image'), role, caption: '合成照片', marks: [], excluded: false, excludedReason: '', reportInclude: true });
          if (i === 2) r.detail = { kind: 'text', value: 'current' }; p.records.push(r);
        }
      }
      m.syncRooms(p); await s.saveProject(p, 0, assets); return { id: p.id, a: units[0].id, first: p.records[0].id, second: p.records[1].id, visit: p.visits[0].id, originalHash: p.media[2].sha256 };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    await page.locator('#recordDateSummary').evaluate(el => el.closest('details').open = true); await page.locator('#observedOn').fill('2026-09-10'); await click('#saveRecord');
    assert.equal((await current()).records[0].observedOn, '2026-09-10');
    await click('#importRoster'); await page.locator('#rosterText').fill('戶別\t地址\t棟別\t種類\nA-001\t重複戶別\tA\t住戶'); await click('#reviewRoster'); assert(await page.locator('#applyRoster').isDisabled());
    await page.locator('#rosterText').fill('戶別\t地址\t棟別\t種類\nD-001\t合成新增地址\tB棟\t住戶'); await click('#reviewRoster'); await click('#applyRoster'); assert.equal((await current()).units.length, 5);
    await click('#manageVisits'); await click('#newVisitBatch'); await page.locator('#visitForm [name=name]').fill('第 2 次會勘'); await page.locator('#visitForm [name=start]').fill('2026-09-12'); await page.locator('#visitForm [name=end]').fill('2026-09-13'); await click('#visitForm .primary');
    await click('#editUnit'); await page.locator('#unitForm [name=status]').selectOption('partial'); await page.locator('#unitForm [name=reason]').fill('房間尚未開門'); await page.locator('#unitForm [name=visitDate]').fill('2026-09-12'); await page.locator('#unitForm [name=visitScope]').fill('客廳及廚房'); await click('#unitForm .primary');
    let data = await current(); assert.equal(data.units[0].visitHistory.length, 1); assert.equal(data.records[0].observedOn, '2026-09-10');
    await page.locator('#visitSelect').selectOption(seed.visit); await idle(); await click('#editUnit'); await page.locator('#unitForm [name=status]').selectOption('partial'); await page.locator('#unitForm [name=reason]').fill('樓上待補'); await page.locator('#unitForm [name=visitDate]').fill('2026-09-10'); await click('#unitForm .primary'); data = await current(); assert.equal(data.units[0].visitHistory.length, 2); assert.equal(data.units[0].reason, '房間尚未開門');
    await click('[data-view=review]'); await page.locator('#reviewList details summary').click(); assert.match(await page.locator('#reviewList').innerText(), /第 2 次會勘/); await page.locator('#reviewFilter').selectOption('public'); await idle(); assert.equal(await page.locator('.review-unit').count(), 1); await page.locator('#reviewFilter').selectOption(''); await idle();
    await click('[data-view=report]'); assert.equal(await page.locator('[data-report-record]').count(), 8);
    const first = '[data-report-record="' + seed.first + '"]'; await page.locator(first + ' [data-report-text]').fill('人工核對：保留這段附件說明。'); await click('[data-report-page="1"]'); assert.equal((await current()).records[0].reportText, '人工核對：保留這段附件說明。'); await click('[data-report-page="-1"]');
    await click(first + ' [data-do=edit-detail]'); assert.equal(await page.locator('[data-detail-preset]').count(), 6); assert(!(await page.locator('#modalBody').innerText()).includes('圖層'));
    await click('[data-detail-preset=beam]'); assert(await page.locator('#detailChoices').isHidden()); await paint(); assert.equal(await page.locator('#detailStage svg polyline').count(), 1);
    await click('#detailUndo'); assert.equal(await page.locator('#detailStage svg polyline').count(), 0); await click('#detailRedo'); assert.equal(await page.locator('#detailStage svg polyline').count(), 1);
    await click('[data-detail-tool=erase]');
    await page.locator('#detailStage svg polyline').evaluate(el => { const p = el.points.getItem(5), svg = el.ownerSVGElement, point = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: point.x, clientY: point.y })); });
    assert.equal(await page.locator('#detailStage svg polyline').count(), 0); await click('#detailUndo'); assert.equal(await page.locator('#detailStage svg polyline').count(), 1); await click('[data-detail-tool=pen]');
    await click('#mirrorDetail'); await page.locator('#detailStage svg').screenshot({ path: path.join(out, 'v0.10-detail-marks.png') }); await download('#downloadDetail', 'synthetic-v0.10-detail.png'); await click('#saveDetail');
    assert.equal((await current()).records[0].detail.marks.length, 1); assert.equal((await current()).records[0].detail.mirror, true);
    await click(first + ' [data-do=edit-detail]'); assert(await page.locator('#detailChoices').isHidden()); assert.equal(await page.locator('#detailStage svg polyline').count(), 1); await page.screenshot({ path: path.join(out, 'v0.10-detail-mobile.png') }); await click('#closeModal');
    const second = '[data-report-record="' + seed.second + '"]'; await click(second + ' [data-do=edit-detail]'); await page.locator('#detailFile').setInputFiles(path.join(out, 'synthetic-v0.10-detail.png')); await idle(); await paint(); await click('#saveDetail'); assert.equal((await current()).records[1].detail.kind, 'image');
    await page.locator('#reportSearch').fill('A-001'); await page.locator('#reportSearch').press('Tab'); await idle(); assert.match(await page.locator('#reportPager').innerText(), /10 筆/); await page.locator('#reportSearch').fill(''); await page.locator('#reportSearch').press('Tab'); await idle();
    await page.locator('#reportLayout').evaluate(el => el.open = true); await page.locator('#reportPlans').selectOption('2'); await page.locator('#reportPageStart').fill('41'); await page.locator('#reportPublicFloors').check(); await page.locator('#volumeMaxPages').fill('5'); await click('#planVolumes');
    const planFile = await download('#downloadVolumePlan', 'synthetic-v0.10-volumes.json'), plan = JSON.parse(await fs.readFile(planFile, 'utf8')); assert(plan.volumes.length >= 4); assert.equal(plan.index.numbering, 'unit'); assert.equal(plan.index.pageStart, 41); assert(plan.entries.some(e => e.floor === '1F'));
    const tocFile = await download('#downloadContents', 'synthetic-v0.10-contents.html'); const selectedKeys = [];
    for (const v of plan.volumes) {
      await page.locator('#volumeSelect').selectOption(String(v.number)); await click('#previewVolume');
      const frame = page.frames().find(f => f.parentFrame() === page.mainFrame()); await frame.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await frame.locator('.standard-sheet:not(.toc-sheet)').count(), v.pageCount);
      for (const text of await frame.locator('.table-sheet').allTextContents()) assert.doesNotMatch(text, /日期|2026-09-/);
      for (const text of await frame.locator('.table-sheet footer').allTextContents()) assert.match(text, /^第 8-\d+ 頁$/);
      assert.deepEqual(await frame.locator('.sheet-content').evaluateAll(els => els.filter(el => el.scrollHeight > el.clientHeight + 1).map(el => el.scrollHeight)), []);
      assert.equal(await frame.locator('script').count(), 0);
      const mappingPath = await download('#downloadMapping', 'synthetic-v0.10-volume-' + v.number + '.json'), mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8'));
      assert.equal(mapping.sections[0].page, v.start); assert.equal(mapping.sections.at(-1).page, v.start + v.pageCount - 1); assert(mapping.contentsPageCount > 0);
      if (v.number === 1) { const record = mapping.groups.flatMap(g => g.records).find(r => r.recordId === seed.first); assert.equal(record.observedOn, '2026-09-10'); assert.equal(record.visitId, seed.visit); }
      for (const g of mapping.groups) for (const r of g.records) for (const photo of r.photos) selectedKeys.push(r.recordId + '/' + photo.mediaId);
      const htmlFile = await download('#downloadAttachment', 'synthetic-v0.10-volume-' + v.number + '.html');
      if (v.number <= 2) {
        const preview = await context.newPage(); await preview.goto('file:///' + htmlFile.replaceAll('\\', '/')); await preview.pdf({ path: path.join(out, 'synthetic-v0.10-volume-' + v.number + '.pdf'), preferCSSPageSize: true, printBackground: true });
        if (v.number === 1) { assert.equal(await preview.locator('.plan-sheet').count(), 1); assert.equal(await preview.locator('.plan-sheet img').count(), 2); assert(await preview.locator('.detail-img').count() >= 2); await preview.locator('.table-sheet').first().screenshot({ path: path.join(out, 'v0.10-standard-table.png') }); }
        await preview.close();
      }
      await click('#backToVolumes');
    }
    const expected = plan.index.groups.flatMap(g => g.records.flatMap(r => r.photos.map(p => r.recordId + '/' + p.mediaId))); assert.deepEqual(selectedKeys.sort(), expected.sort()); assert.equal(new Set(selectedKeys).size, selectedKeys.length);
    const preview = await context.newPage(); await preview.goto('file:///' + tocFile.replaceAll('\\', '/')); await preview.pdf({ path: path.join(out, 'synthetic-v0.10-contents.pdf'), preferCSSPageSize: true, printBackground: true }); assert.match(await preview.locator('body').innerText(), /8-41/); await preview.close(); await click('#closeModal');
    const roundtrip = await page.evaluate(async () => { const s = await import('./store.js'), b = await import('./bundle.js'), m = await import('./model.js'), p = (await s.allProjects())[0]; const result = await b.readBundle((await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob); const copy = m.restoredCopy(result.project); m.validateProject(copy.project); return { equal: JSON.stringify(p) === JSON.stringify(result.project), version: result.manifest.version, custom: copy.project.records[1].detail.mediaId !== p.records[1].detail.mediaId }; }); assert.deepEqual(roundtrip, { equal: true, version: 5, custom: true });
    await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor(); await click('[data-view=report]'); await click(first + ' [data-do=edit-detail]'); assert.equal(await page.locator('#detailStage svg polyline').count(), 1); await click('#closeModal'); await context.setOffline(false);
    assert.deepEqual(errors, []); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await fs.writeFile(path.join(out, 'v0.10-result.json'), JSON.stringify({ passed: true, version: VERSION, selectedPhotos: selectedKeys.length, volumes: plan.volumes.length, contentPages: plan.index.sections.length, actualPhoneTested: false, originalMediaAndDetailBackupVerified: true, checkedAt: new Date().toISOString() }, null, 2));
    console.log('PASS V0.10 roster, visit history, detail presets/custom originals, offline restore, pagination and complete volume/photo mapping');
  } finally { await context.close(); }
}
