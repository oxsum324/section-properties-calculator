import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV025(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { await page.locator(selector).click(); await idle(); };
  const select = async (selector, value) => { await page.locator(selector).selectOption(value); await idle(); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js');
      const p = m.newProject('PAGING', '分頁與待補合成測試', '2026-09-20'), assets = [];
      for (let i = 0; i < 12; i++) {
        const u = m.newUnit(`測試戶 ${String(i + 1).padStart(2, '0')}`); p.units.push(u);
        for (let j = 0; j < (i === 0 ? 2 : 1); j++) {
          const r = m.newRecord(u.id, '1F', '客廳'); p.records.push(r);
          Object.assign(r, { component: i === 0 && j === 1 ? '' : '牆面', condition: 'normal', location: i === 0 && j === 0 ? '' : '入口左側' });
          for (let k = 0; k < (i === 0 && j === 0 ? 7 : 1); k++) {
            const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
            canvas.getContext('2d').fillRect(k + i, 0, 40, 30);
            const blob = await new Promise(resolve => canvas.toBlob(resolve)), mid = m.id();
            p.media.push({ id: mid, name: `合成-${assets.length}.png`, kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() }); assets.push({ id: mid, blob });
            r.photos.push({ mediaId: mid, role: 'overview', caption: `合成照片 ${k + 1}`, marks: [], excluded: false, excludedReason: '', reportInclude: true });
          }
        }
      }
      await s.saveProject(m.syncRooms(p), 0, assets);
      return { units: p.units.map(u => u.id), records: p.records.map(r => r.id), photos: p.records[0].photos.map(photo => photo.mediaId) };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    assert.match(await page.locator('#recordIssues').textContent(), /缺位置說明/);
    assert.match(await page.locator('#otherRecordIssues').textContent(), /位置 002.*缺部位/s);
    assert.equal(await page.locator('#showRecordFollowup').evaluate(el => getComputedStyle(el).color), 'rgb(165, 40, 40)');
    await page.locator('#notes').fill('跳回補填前仍須保存這段現場說明');
    await click(`#otherRecordIssues [data-fix-record="${seed.records[1]}"]`);
    assert.equal((await current()).records[0].notes, '跳回補填前仍須保存這段現場說明');
    await page.waitForFunction(() => document.activeElement.contains(document.querySelector('#component')));
    await page.locator('#component input[value="牆面"]').check(); await click('#saveRecord');
    assert.doesNotMatch(await page.locator('#recordIssues').textContent(), /缺部位/);
    await click(`#otherRecordIssues [data-fix-record="${seed.records[0]}"]`);
    await page.waitForFunction(() => document.activeElement.contains(document.querySelector('#location')));
    await page.locator('#location').fill('客廳入口左側'); await click('#saveRecord');
    assert(await page.locator('#recordFollowup').isHidden());
    await click('[data-view=report]');
    assert.equal(await page.locator('[data-report-record]').count(), 1);
    assert.equal(await page.locator('[data-report-photo]').count(), 3);
    const before = await current();
    await page.locator('[data-report-text]').fill('換頁前輸入的人工附件說明');
    await click('[data-report-bottom-page="1"]');
    assert.equal((await current()).records[0].reportText, '換頁前輸入的人工附件說明');
    assert.equal(await page.locator('[data-report-record]').getAttribute('data-report-record'), seed.records[1]);
    await page.waitForFunction(() => document.activeElement.id === 'reportPager' && document.querySelector('#reportPager').getBoundingClientRect().top >= document.querySelector('#contextStrip').getBoundingClientRect().bottom);
    await click('[data-report-page="-1"]');
    await click('[data-do=record-down]'); assert.equal(await page.locator('[data-report-record]').getAttribute('data-report-record'), seed.records[0]);
    await click('[data-do=record-up]'); assert.equal(await page.locator('#reportPageJump').inputValue(), '0');
    await click('[data-do=photos-next]');
    assert.equal(await page.locator('[data-report-photo]').first().getAttribute('data-report-photo'), seed.photos[3]);
    await page.locator(`[data-report-photo="${seed.photos[4]}"] [data-report-include]`).uncheck(); await idle();
    await click('[data-do=photos-next]'); assert.equal(await page.locator('[data-report-photo]').count(), 1);
    assert(await page.locator('[data-do=photos-next]').isDisabled());
    await click('[data-do=photos-prev]');
    assert.equal(await page.locator(`[data-report-photo="${seed.photos[4]}"] [data-report-include]`).isChecked(), false);
    assert.equal((await current()).records[0].photos.length, 7);
    await select('#reportBrowseUnit', seed.units[11]);
    assert.equal(await page.locator('[data-report-record]').getAttribute('data-report-record'), seed.records[12]);
    assert.equal(await page.locator('#reportScope').inputValue(), '');
    assert.deepEqual((await current()).reportSettings, before.reportSettings);
    // Real preview still includes the whole export scope and off-screen photos.
    await click('#previewReport'); await page.locator('#downloadMapping').waitFor();
    const downloaded = page.waitForEvent('download'); await click('#downloadMapping');
    const mappingFile = path.join(out, 'v0.25-export-scope.json'); await (await downloaded).saveAs(mappingFile);
    const mapping = JSON.parse(await fs.readFile(mappingFile, 'utf8'));
    assert.equal(new Set(mapping.groups.map(group => group.unitId)).size, 12);
    assert.equal(mapping.groups.flatMap(group => group.records).flatMap(record => record.photos).length, 18);
    await click('#closeModal');
    await select('#reportBrowseUnit', ''); await select('#reportPageJump', '12');
    assert(await page.locator('[data-report-page="1"]').isDisabled());
    await select('#reportPageSize', '2'); assert.equal(await page.locator('[data-report-record]').count(), 2);
    await select('#reportPageJump', '6'); assert.equal(await page.locator('[data-report-record]').count(), 1);
    await page.locator('#reportSearch').fill('找不到的戶別'); await page.locator('#reportSearch').press('Tab'); await idle();
    assert.equal(await page.locator('[data-report-record]').count(), 0); assert(await page.locator('#reportPagerBottom').isHidden());
    await page.locator('#reportSearch').fill(''); await page.locator('#reportSearch').press('Tab'); await idle();
    // Paginated unit checkboxes must preserve selections on other pages.
    await click('#reportAdvanced > summary'); await click('#reportUnitPicker > summary');
    assert.equal(await page.locator('[data-report-unit]').count(), 10);
    await click('[data-unit-page="1"]'); assert.equal(await page.locator('[data-report-unit]').count(), 2);
    await page.locator(`[data-report-unit="${seed.units[11]}"] [data-unit-include]`).uncheck(); await idle();
    assert.deepEqual((await current()).reportSettings.unitIds, seed.units.slice(0, 11));
    await page.locator(`[data-report-unit="${seed.units[11]}"] [data-unit-include]`).check(); await idle();
    assert.deepEqual((await current()).reportSettings.unitIds, seed.units);
    await click('#reportAdvanced > summary'); await select('#reportPageSize', '1');
    await page.locator('#toast').waitFor({ state: 'hidden' });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('#reportPager').evaluate(el => el.scrollIntoView({ block: 'start' })); await page.evaluate(() => new Promise(requestAnimationFrame));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert(await page.evaluate(() => document.querySelector('#reportPagerBottom').getBoundingClientRect().bottom <= document.querySelector('#bottomNav').getBoundingClientRect().top), 'Pager must stay above the navigation');
      await page.screenshot({ path: path.join(out, `v0.25-report-${width}.png`) });
    }
    await page.setViewportSize({ width: 320, height: 900 }); await click('#fontSize');
    await page.locator('#reportPager').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.querySelector('#reportPagerBottom').getBoundingClientRect().bottom <= document.querySelector('#bottomNav').getBoundingClientRect().top);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await click('#fontSize');
    await page.setViewportSize({ width: 390, height: 844 }); await click('[data-view=work]');
    await page.locator('#location').fill(''); await click('#saveRecord'); await click('#nextRecord');
    assert.match(await page.locator('#otherRecordIssues').textContent(), /位置 001.*缺位置/s);
    await click('#showRecordFollowup'); await page.screenshot({ path: path.join(out, 'v0.25-field-followup-390.png') });
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
    await context.setOffline(true); await page.reload(); await click('[data-view=report]');
    await click('[data-report-bottom-page="1"]'); assert.equal(await page.locator('[data-report-record]').count(), 1);
    assert.equal((await current()).records[0].reportText, '換頁前輸入的人工附件說明');
    assert.deepEqual(errors, []);
    console.log('PASS V0.25 red actionable follow-ups, saved edits across navigation, bounded record/photo/unit pagination, full export scope, responsive and offline operation');
  } finally { await context.close(); }
}
