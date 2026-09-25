import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyV024(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] }), page = await context.newPage();
  const receiver = await browser.newContext(), other = await receiver.newPage(), errors = [];
  for (const p of [page, other]) p.on('pageerror', e => errors.push(e.message));
  const idle = async (p = page) => { await p.locator('#busy').waitFor({ state: 'hidden' }); await p.waitForFunction(() => document.querySelector('#reportView').getAttribute('aria-busy') !== 'true'); };
  const click = selector => clickSurvey(page, selector);
  const select = async (selector, value) => { await page.locator(selector).selectOption(value); await idle(); };
  const current = () => page.evaluate(async () => (await import('./store.js')).getProject(document.querySelector('#caseSelect').value));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js');
      const p = m.newProject('COMPACT', '精簡介面合成案件', '2026-09-20'), a = m.newUnit('A戶'), b = m.newUnit('B戶'), r = m.newRecord(a.id, '1F', '客廳');
      p.units.push(a, b); p.records.push(r); r.component = '牆面'; r.condition = 'normal'; r.detail = { kind: 'text', value: 'current' };
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 80; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#9bbab1'; ctx.fillRect(0, 0, 100, 80);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), media = [];
      for (let i = 0; i < 7; i++) { const mid = m.id(); p.media.push({ id: mid, name: `合成-${i}.png`, kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() }); media.push({ id: mid, blob }); r.photos.push({ mediaId: mid, role: 'overview', caption: '', marks: [], excluded: false, excludedReason: '' }); }
      await s.saveProject(m.syncRooms(p), 0, media);
      const second = m.newProject('OTHER', '另一個案件', '2026-09-20'); second.units.push(m.newUnit('C戶')); await s.saveProject(second, 0);
      return { id: p.id, second: second.id, a: a.id, b: b.id, record: r.id };
    });
    await page.reload(); await click('[data-view=case]'); await select('#caseSelect', seed.id);
    assert.equal(await page.locator('#photoGrid .photo-card:visible').count(), 3);
    await click('#togglePhotos'); assert.equal(await page.locator('#photoGrid .photo-card:visible').count(), 7); await click('#togglePhotos');
    assert.equal(await page.locator('#recordAdvanced').evaluate(el => el.open), false);
    await click('[data-visibility=partial]'); await page.locator('#visibilityHint').waitFor();
    await page.locator('#notes').fill('櫃後受限，保留觀察說明'); await click('#editRecordDate');
    await page.locator('#resident').fill('住戶表示曾有水痕'); await click('#saveRecord');
    assert.match(await page.locator('#recordAdvancedSummary').textContent(), /有住戶陳述/);
    await page.locator('#recordAdvanced').evaluate(el => el.open = false);
    await page.locator('#condition input[value=tileBroken]').check(); await page.locator('#tileFields').waitFor();
    assert.equal(await page.locator('#surface').inputValue(), '', 'Tile condition alone reveals counts without inventing surface');
    await page.locator('#tileBrokenCount').fill('3'); await click('#saveRecord');
    await click('#nextRecord'); assert.equal(await page.locator('#recordAdvanced').evaluate(el => el.open), false);
    assert.equal((await current()).records[0].visibility, 'partial');
    await click(`[data-record="${seed.record}"]`);
    await click('#recordAdvanced > summary'); await click('#recordAudio');
    await page.waitForFunction(() => document.querySelector('#audioStatus').textContent.includes('錄音中'));
    await click('#recordAdvanced > summary'); assert(await page.locator('#stopAudioVisible').isVisible());
    await page.waitForTimeout(1200); // Obtain a real chunk from the simulated microphone.
    await click('#stopAudioVisible'); assert.equal((await current()).records[0].audioIds.length, 1);
    assert.equal(await page.locator('#recordingBanner').isVisible(), false);
    await click('[data-view=case]');
    assert.equal(await page.locator('.case-file-actions button:visible').count(), 3);
    assert.equal(await page.locator('#importReceipt').isVisible(), false);
    assert.equal(await page.locator('#persistStorage').isVisible(), false);
    await click('[data-view=report]');
    assert.equal(await page.locator('#reportAdvanced').evaluate(el => el.open), false);
    assert.match(await page.locator('#reportStyleSummary').textContent(), /標準附件.*每戶重編.*2 張.*8 列.*8-/);
    await click('#reportAdvanced > summary'); await click('#reportLayout > summary');
    await select('#reportFormat', 'quick'); await select('#reportNumbering', 'project'); await select('#reportPerPage', '1'); await select('#reportRows', '0');
    // Rapid adjacent field edits must survive blur autosaves without losing focus/input.
    await page.locator('#reportPrefix').fill('附-'); await page.locator('#reportPageStart').fill('31'); await page.locator('#reportStart').fill('10'); await page.locator('#volumeMaxPages').fill('12');
    await page.locator('#reportColor').check(); await idle();
    await click('#reportUnitPicker > summary');
    await click(`[data-report-unit="${seed.b}"] [data-unit-move="-1"]`);
    await page.locator(`[data-report-unit="${seed.b}"] [data-unit-include]`).uncheck(); await idle();
    await page.locator(`[data-report-unit="${seed.a}"] [data-unit-break]`).check(); await idle();
    const text = page.locator(`[data-report-record="${seed.record}"] [data-report-text]`);
    await text.fill('人工附件說明，不被公司預設覆蓋');
    await click('#companyReportStyle');
    const saved = await current(), prefs = saved.reportSettings;
    assert.equal(prefs.format, 'standard'); assert.equal(prefs.perPage, 2); assert.equal(prefs.tableRows, 8); assert.equal(prefs.pagePrefix, '8-');
    assert.equal(prefs.start, 10); assert.equal(prefs.pageStart, 31); assert.equal(prefs.maxPages, 12); assert.equal(prefs.color, true);
    assert.deepEqual(prefs.unitIds, [seed.a]); assert.deepEqual(prefs.order, [seed.b, seed.a]); assert.deepEqual(prefs.breakBefore, [seed.a]);
    assert.equal(saved.records[0].reportText, '人工附件說明，不被公司預設覆蓋'); assert.equal(saved.records[0].photos.length, 7);
    await page.reload(); await click('[data-view=report]');
    assert.equal(await page.locator('#reportStart').inputValue(), '10'); assert.equal(await page.locator('#volumeMaxPages').inputValue(), '12');
    await click('[data-view=case]'); await select('#caseSelect', seed.second); await click('[data-view=report]');
    assert.equal(await page.locator('#reportStart').inputValue(), '1'); assert.equal(await page.locator('#reportColor').isChecked(), false);
    await click('[data-view=case]'); await select('#caseSelect', seed.id); await click('[data-view=report]'); assert.equal(await page.locator('#reportStart').inputValue(), '10');
    await click('[data-view=case]'); await click('#prepareHandoff');
    const event = page.waitForEvent('download'); await click('#downloadHandoff'); const file = path.join(out, 'v0.24.0-editable-settings.csurvey'); await (await event).saveAs(file); await click('#closeModal');
    await other.goto(base); await other.locator('#contextStrip').waitFor(); await other.locator('#bundleInput').setInputFiles(file); await other.locator('#restoreBundle').click(); await idle(other);
    await other.waitForFunction(() => !document.querySelector('#modal').open);
    const restored = await other.evaluate(async () => (await (await import('./store.js')).allProjects())[0]); assert.deepEqual(restored.reportSettings, prefs);
    await other.locator('[data-view=report]').click(); await idle(other); assert.equal(await other.locator('#reportStart').inputValue(), '10');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['case', 'work', 'report']) {
        await click(`[data-view=${view}]`); await page.evaluate(() => scrollTo(0, 0));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view} overflow at ${width}`);
        await page.screenshot({ path: path.join(out, `v0.24.0-${view}-${width}.png`), fullPage: view !== 'work' });
      }
    }
    await page.setViewportSize({ width: 390, height: 900 }); await click('[data-view=work]');
    await page.evaluate(() => scrollTo(0, scrollY + document.querySelector('#recordHeading').getBoundingClientRect().top - document.querySelector('#contextStrip').getBoundingClientRect().height - 12));
    await page.screenshot({ path: path.join(out, 'v0.24.0-record-focused-390.png') });
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
    await context.setOffline(true); await page.reload(); await click('[data-view=report]'); assert.equal(await page.locator('#reportStart').inputValue(), '10');
    // Deterministically reproduce a second blur save during a slow text write.
    // Use the real controller with a delayed revision-checked storage boundary.
    const race = await receiver.newPage(); await race.goto(base); await race.locator('#contextStrip').waitFor();
    const concurrency = await race.evaluate(async () => {
      const m = await import('./model.js'), { createReportController } = await import('./report-ui.js');
      let p = m.newProject('QUEUE', '延遲保存合成測試', '2026-09-20'), active = 0, peak = 0, triggered = false;
      const u = m.newUnit('A'), r = m.newRecord(u.id, '1F', '客廳'); p.units.push(u); p.records.push(r); r.condition = 'normal';
      const errors = [], $ = selector => document.querySelector(selector);
      const commit = async mutate => {
        const expected = p.revision, next = m.clone(p); mutate(next); active++; peak = Math.max(peak, active);
        try {
          if (next.records[0].reportText && !triggered) {
            triggered = true; $('#reportStart').value = '37';
            $('#reportStart').dispatchEvent(new Event('input', { bubbles: true }));
            $('#reportStart').dispatchEvent(new Event('change', { bubbles: true }));
          }
          await new Promise(resolve => setTimeout(resolve, 30));
          if (p.revision !== expected) throw new Error('Concurrent project revision');
          next.revision++; p = next;
        } finally { active--; }
      };
      const controller = createReportController({ $, commit, getProject: () => p, action: async fn => fn(), getMedia: async () => null, fail: e => errors.push(e.message) });
      await controller.render();
      const input = $('#reportRooms [data-report-text]'); input.value = '連續操作仍保留人工說明'; input.dispatchEvent(new Event('input', { bubbles: true }));
      $('#reportFormat').value = 'quick'; $('#reportFormat').dispatchEvent(new Event('input', { bubbles: true })); $('#reportFormat').dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 200 && $('#reportView').getAttribute('aria-busy') === 'true'; i++) await new Promise(resolve => setTimeout(resolve, 10));
      return { peak, triggered, errors, p, busy: $('#reportView').getAttribute('aria-busy') };
    });
    assert.equal(concurrency.triggered, true); assert.equal(concurrency.peak, 1); assert.deepEqual(concurrency.errors, []); assert.equal(concurrency.busy, 'false');
    assert.equal(concurrency.p.reportSettings.start, 37); assert.equal(concurrency.p.records[0].reportText, '連續操作仍保留人工說明'); await race.close();
    assert.deepEqual(errors, []);
    console.log('PASS V0.24 compact workflows, conditional inputs, rapid setting edits, company style isolation, case switching, complete transfer, responsive/offline persistence');
  } finally { await context.close(); await receiver.close(); }
}
