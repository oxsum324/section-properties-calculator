import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyV026(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { await page.locator(selector).click(); await idle(); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V026', '介面與裂縫合成測試', '2026-09-25');
      const u = m.newUnit('A 戶'), empty = m.newUnit('B 戶'); p.units.push(u, empty);
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 80; canvas.getContext('2d').fillRect(10, 10, 50, 50);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), mid = m.id();
      p.media.push({ id: mid, name: '合成.png', kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
      for (let i = 0; i < 2; i++) {
        const r = m.newRecord(u.id, '1F', '客廳'); Object.assign(r, { component: '牆面', condition: 'crack', crackPattern: 'diagonal', location: i ? '' : '入口左側' });
        if (i) r.widthMode = 'le03';
        r.photos.push({ mediaId: mid, role: 'overview', caption: '合成照片', marks: [], excluded: false, excludedReason: '', reportInclude: true }); p.records.push(r);
      }
      await s.saveProject(m.syncRooms(p), 0, [{ id: mid, blob }]); return { units: p.units.map(u => u.id), records: p.records.map(r => r.id) };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    assert.equal(await page.locator('[data-width]').count(), 2);
    assert.equal(await page.locator('[data-width=gt03],[data-width=le03]').count(), 0);
    await click('[data-width=range0103]');
    await page.waitForFunction(async () => (await (await import('./store.js')).allProjects())[0].records[0].widthMode === 'range0103');
    assert.equal((await current()).records[0].measured, false);
    assert.equal((await current()).records[0].width, null);
    assert.match(await page.locator('#widthHint').textContent(), /裂縫寬度約 0.1～0.3 mm/);
    assert(await page.locator('#widthMode').isHidden()); assert(await page.locator('#saveRecord').isHidden());
    assert.equal(await page.locator('#recordFollowup').getAttribute('open'), null);
    await page.waitForFunction(() => document.querySelector('#recordIssues').textContent.includes('長度待補'));
    await click('#showRecordFollowup'); assert.match(await page.locator('#recordIssues').innerText(), /長度待補/);
    assert.doesNotMatch(await page.locator('#recordIssues').innerText(), /未量測/);
    assert.equal(await page.locator('#showAllRecordIssues').count(), 0);
    await click('[data-width=exact]'); await page.locator('#width').fill('0.45'); await page.locator('#length').fill('1.2');
    await click(`[data-record="${seed.records[1]}"]`);
    assert.equal((await current()).records[0].width, .45);
    assert.match(await page.locator('#widthLegacy').textContent(), /≤0.3/);
    await page.locator('#notes').fill('舊區間原樣保留'); await click('[data-view=review]');
    assert.equal((await current()).records[1].widthMode, 'le03');
    assert.match(await page.locator('[data-view=review]').textContent(), /戶別進度/);
    await page.locator('#reviewFilter').selectOption('unvisited'); assert.equal(await page.locator('.review-unit').count(), 1);
    assert.match(await page.locator('#reviewList').textContent(), /B 戶/);
    await page.locator('#reviewFilter').selectOption('attachments'); assert.equal(await page.locator('.review-unit').count(), 1);
    assert.match(await page.locator('#reviewList').textContent(), /附件待核對/);
    await click('[data-view=report]');
    assert.equal(await page.locator('#reportView').getAttribute('data-mode'), 'simple');
    assert(await page.locator('[data-report-text]').isHidden()); assert(await page.locator('#reportAdvanced').isHidden());
    assert.match(await page.locator('.report-read-only').innerText(), /0.45 mm/);
    assert(await page.locator('#previewReport').isVisible());
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 }); await page.locator('[data-report-record]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.waitForFunction(() => [...document.querySelectorAll('[data-report-image]')].every(img => img.complete && img.naturalWidth > 0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, `v0.26-mobile-${width}.png`) });
    }
    await click('[data-do=edit-layout]'); await page.locator('[data-report-text]').fill('保留人工附件文字');
    await click('#reportModeToggle'); assert.equal((await current()).records[0].reportText, '保留人工附件文字');
    assert.match(await page.locator('.report-read-only').innerText(), /保留人工附件文字/);
    const before = (await current()).reportSettings;
    await click('[data-report-bottom-page="1"]'); assert.equal(await page.locator('[data-report-record]').getAttribute('data-report-record'), seed.records[1]);
    assert.deepEqual((await current()).reportSettings, before);
    await page.setViewportSize({ width: 1440, height: 1000 }); await click('#reportModeToggle');
    assert(await page.locator('#reportNavigator').isVisible());
    await click(`[data-report-goto="${seed.records[0]}"]`);
    assert.equal(await page.locator('[data-report-record]').getAttribute('data-report-record'), seed.records[0]);
    assert.equal(await page.locator('[data-report-text]').inputValue(), '保留人工附件文字');
    await page.screenshot({ path: path.join(out, 'v0.26-desktop.png') });
    await page.reload(); await page.locator('#recordForm').waitFor(); await click('[data-view=report]');
    assert.equal(await page.locator('#reportView').getAttribute('data-mode'), 'full');
    await click('[data-view=case]'); assert.match(await page.locator('#localSaveState').textContent(), /已存本機/);
    assert.match(await page.locator('#exportState').textContent(), /尚未匯出/);
    assert.deepEqual(errors, []);
    console.log('PASS V0.26 approximate width, legacy preservation, one local reminder, household progress, mobile preview, desktop navigator and saved edits');
  } finally { await context.close(); }
}
