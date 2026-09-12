import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV011(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { await page.locator(selector).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const choose = (key, checked = true) => page.locator(`#condition input[value="${key}"]`).setChecked(checked);
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V011-SYNTHETIC', '合成現況分類擴充測試', '2026-09-12'), u = m.newUnit('A 戶'); p.units.push(u);
      const r = m.newRecord(u.id, '1F', '客廳'); Object.assign(r, { component: '牆面', condition: 'damp', location: '入口旁', notes: '人工文字保留：舊稱滲水跡。' }); p.records.push(r);
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 400, 300); ctx.fillStyle = '#193c34'; ctx.font = '25px sans-serif'; ctx.fillText('SYNTHETIC PHOTO', 35, 150);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), mid = m.id(); p.media.push({ id: mid, name: 'synthetic.png', kind: 'image', size: blob.size, type: blob.type, importedAt: m.now(), sha256: await m.sha256(blob) }); r.photos.push({ mediaId: mid, role: 'overview', caption: '', marks: [], excluded: false, excludedReason: '' });
      await s.saveProject(m.syncRooms(p), 0, [{ id: mid, blob, thumb: blob }]);
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    assert.equal(await page.locator('#commonConditions input').count(), 6);
    assert.match(await page.locator('#commonConditions').innerText(), /滲水痕/); assert.doesNotMatch(await page.locator('#commonConditions').innerText(), /正在漏水|滲水跡/);
    assert.equal(await page.locator('#moreConditions').evaluate(el => el.open), false);
    await choose('tileBulge'); await page.locator('#tileBulgeCountText').selectOption('二十餘塊');
    await choose('tileBroken'); await page.locator('#tileBrokenCount').fill('2'); await click('#saveRecord');
    let r = (await current()).records[0]; assert.equal(r.tiles.bulgeCount, null); assert.equal(r.tiles.bulgeText, '二十餘塊'); assert.equal(r.surface, ''); assert.match(await page.locator('#tileTotal').innerText(), /不自動合計/);
    await click('#moreConditions summary');
    for (const key of ['exposedRebar', 'rebarCorrosion', 'honeycomb', 'jointOffset', 'activeLeak', 'paintBlister']) await choose(key);
    await page.locator('#leakForms input[value=drip]').check(); await click('#moreConditions summary');
    assert(await page.locator('[data-remove-condition=activeLeak]').isVisible());
    await click('[data-remove-condition=activeLeak]'); assert(await page.locator('#leakFields').isHidden()); assert.doesNotMatch(await page.locator('#quickDescription').textContent(), /現場可見漏水/);
    await click('#moreConditions summary'); await choose('activeLeak'); await click('#moreConditions summary'); assert(await page.locator('#leakForms input[value=drip]').isChecked());
    await choose('crack'); assert(await page.locator('#crackLayer input[value=unknown]').isChecked());
    await page.locator('#crackLayer input[value=plaster]').check(); await click('#individualCracks [data-count="2"]');
    const cards = page.locator('[data-crack-id]');
    await cards.nth(0).evaluate(el => el.open = true); await cards.nth(0).locator('[data-key=layer]').selectOption('plaster'); await cards.nth(1).locator('[data-key=layer]').selectOption('structural');
    await click('#saveRecord'); r = (await current()).records[0]; assert.deepEqual(r.cracks.map(c => c.layer), ['plaster', 'structural']); assert.equal(r.legacyCrack.crackLayer, 'plaster'); assert.deepEqual(r.leakForms, ['drip']); assert.equal(r.notes, '人工文字保留：舊稱滲水跡。');
    await page.locator('#areaMeasurements summary').click(); await page.locator('#area-tileBulge').fill('1.5'); await page.locator('#area-method-tileBulge').selectOption('estimated'); await click('#saveRecord');
    await choose('tileBulge', false); await click('#saveRecord'); assert(await page.locator('#tileBulgeQuantity').isHidden()); assert.doesNotMatch(await page.locator('#quickDescription').textContent(), /磁磚拱起/);
    await choose('tileBulge'); assert.equal(await page.locator('#tileBulgeCountText').inputValue(), '二十餘塊'); assert.equal(await page.locator('#area-tileBulge').inputValue(), '1.5'); await click('#saveRecord');
    await page.reload(); await page.locator('#recordForm').waitFor(); assert.equal(await page.locator('#moreConditions').evaluate(el => el.open), false); assert(await page.locator('[data-remove-condition=honeycomb]').isVisible());
    for (const width of [320, 390, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#commonConditions').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'v0.11-common-mobile.png') });
    await click('#moreConditions summary'); await page.locator('#condition').screenshot({ path: path.join(out, 'v0.11-condition-groups.png') }); await click('#moreConditions summary');
    await click('[data-view=report]');
    for (const format of ['standard', 'quick']) {
      await page.locator('#reportFormat').selectOption(format); await click('#previewReport');
      const frame = page.frameLocator('#attachmentPreview'); await frame.locator('figure').first().waitFor();
      const text = await frame.locator('body').innerText();
      for (const phrase of ['滲水痕', '磁磚拱起', '二十餘塊', '1.5 m²', '粉刷層', '結構體', '現場可見漏水（滴水）']) assert(text.includes(phrase), `${format}: ${phrase}`);
      if (format === 'standard') assert.doesNotMatch((await frame.locator('.table-sheet').allTextContents()).join(''), /拍攝日期|2026-09-12/);
      await click('#closeModal');
    }
    await click('[data-view=work]'); await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    await choose('normal'); await click('#saveRecord'); r = (await current()).records[0]; assert.deepEqual(r.conditions, ['normal']); assert.equal(r.tiles.bulge, false); assert.equal(r.tiles.broken, false); assert.equal(r.cracks[1].layer, 'structural'); assert(await page.locator('#measurement').isHidden());
    await choose('tileBulge'); await click('#saveRecord'); assert.equal((await current()).records[0].tiles.bulgeText, '二十餘塊');
    const backup = await page.evaluate(async () => { const m = await import('./model.js'), s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0]; const result = await b.readBundle((await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob); const restored = m.restoredCopy(result.project).project; m.validateProject(restored); return { version: result.manifest.version, equal: JSON.stringify(p) === JSON.stringify(result.project), layer: restored.records[0].cracks[1].layer, countText: restored.records[0].tiles.bulgeText, hash: await m.sha256(result.media[0].blob), sourceHash: p.media[0].sha256 }; });
    assert.equal(backup.version, 6); assert(backup.equal); assert.equal(backup.layer, 'structural'); assert.equal(backup.countText, '二十餘塊'); assert.equal(backup.hash, backup.sourceHash); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'v0.11-result.json'), JSON.stringify({ passed: true, ...backup, errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.11 compact conditions, neutral per-crack layers, tile counts, optional areas, both report formats and offline backup');
  } finally { await context.close(); }
}
