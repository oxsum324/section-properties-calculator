import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSurvey } from './ui-click.js';

// Use direct interactions here to test the actual initial disclosure state.
export async function verifyV027(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const click = async selector => { await page.locator(selector).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const save = () => clickSurvey(page, '#saveRecord');
  const cards = () => page.locator('#conditionCards > details:not([hidden])').evaluateAll(els => els.map(el => el.dataset.conditionCard));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const ids = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V027', '精簡現場表單合成測試', '2026-09-25'), u = m.newUnit('A 戶'); p.units.push(u);
      const r = m.newRecord(u.id, '1F', '客廳'), old = m.newRecord(u.id, '2F', '浴廁');
      Object.assign(r, { component: '牆面', location: '入口左側' });
      Object.assign(old, { component: '梁', location: '窗上', condition: 'crack', crackPattern: 'diagonal', crackLayer: 'structural', visibility: 'partial', notes: '櫃後遮蔽，保留既有說明', widthMode: 'le03' });
      p.records.push(r, old); await s.saveProject(m.syncRooms(p), 0); return p.records.map(r => r.id);
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    assert.equal(await page.locator('#conditionPicker').evaluate(el => el.open), true);
    assert(await page.locator('#conditionCards').isHidden());
    assert.equal(await page.locator('#visibility').inputValue(), 'visible');
    assert.equal(await page.locator('#visibilityOptions').evaluate(el => el.open), false);
    assert(await page.locator('#crackLayer input[value=unknown]').isChecked());
    await page.locator('#conditionPanel').scrollIntoViewIfNeeded();
    const beforeY = await page.evaluate(() => scrollY);
    for (const key of ['crack', 'damp', 'salt']) await page.locator(`#condition input[value=${key}]`).check();
    assert.equal(await page.locator('#conditionPicker').evaluate(el => el.open), true);
    assert(await page.locator('#conditionCards').isHidden());
    assert(Math.abs(await page.evaluate(() => scrollY) - beforeY) < 80, 'Selecting multiple conditions keeps the selection area in place');
    assert(Number(await page.locator('#condition input[value=crack]').evaluate(el => getComputedStyle(el.parentElement).fontWeight)) >= 700);
    await page.screenshot({ path: path.join(out, 'v0.27-select-mobile.png') });
    await click('#fillConditionDetails');
    assert.deepEqual(await cards(), ['crack', 'damp', 'salt']);
    assert(await page.locator('#widthPresets').isVisible());
    assert(await page.locator('#crackPattern').isHidden());
    assert(await page.locator('#crackLayer').isHidden());
    assert.match(await page.locator('#conditionCard-crack > summary').textContent(), /待補/);
    await click('[data-width=range0103]'); await save();
    let r = (await current()).records[0]; assert.equal(r.measured, false); assert.equal(r.width, null); assert.equal(r.crackLayer, 'unknown');
    assert.match(await page.locator('#conditionCard-crack > summary').textContent(), /長度待補/);
    await click('#conditionPickerSummary'); await click('#showRecordFollowup');
    await click('#recordIssues [data-fix-issue="裂縫長度待補"]');
    await page.locator('#widthPresets').waitFor();
    assert.equal(await page.locator('#conditionPicker').evaluate(el => el.open), false);
    assert.equal(await page.locator('#conditionCard-crack').evaluate(el => el.open), true);
    const stableOrder = await cards();
    await click('[data-width=exact]'); await page.locator('#width').fill('0.45'); await page.locator('#length').fill('1.2');
    assert.equal(await page.locator('#length').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await cards(), stableOrder); assert.equal(await page.locator('#conditionCard-crack').evaluate(el => el.open), true);
    await click('#crackExtras > summary'); await page.locator('#crackPattern').selectOption('diagonal'); await page.locator('#crackLayer input[value=plaster]').check();
    await click('#crackExtras > summary'); assert.match(await page.locator('#crackExtraSummary').textContent(), /斜向.*粉刷層/);
    await click('#conditionCard-damp > summary'); await click('[data-area-extra=damp] > summary'); await page.locator('#area-damp').fill('1.5'); await page.locator('#area-method-damp').selectOption('estimated');
    await click('#conditionCard-damp > summary');
    await click('#conditionPickerSummary'); await page.locator('#condition input[value=damp]').uncheck(); await page.locator('#condition input[value=damp]').check();
    await click('#fillConditionDetails'); assert.equal(await page.locator('#area-damp').inputValue(), '1.5');
    assert.equal(await page.locator('#conditionCards > details[open]').count(), 0, 'Completed cards start compact after explicitly finishing selection');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 }); await page.locator('#conditionPanel').scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, `v0.27-cards-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await click('#visibilitySummary'); await click('[data-visibility=partial]');
    assert(await page.locator('#notesLabel').evaluate(el => el.classList.contains('needs-input')));
    await page.locator('#notes').fill('櫃後範圍受限'); assert(!(await page.locator('#notesLabel').evaluate(el => el.classList.contains('needs-input')))); await save();
    r = (await current()).records[0]; assert.equal(r.visibility, 'partial'); assert.equal(r.width, .45); assert.equal(r.length, 1.2); assert.deepEqual(r.areas.damp, { value: 1.5, method: 'estimated' });
    await click(`[data-record="${ids[1]}"]`);
    assert.equal(await page.locator('#visibilityOptions').evaluate(el => el.open), true); assert.equal(await page.locator('#notes').inputValue(), '櫃後遮蔽，保留既有說明');
    assert.equal(await page.locator('#crackExtras').evaluate(el => el.open), false); assert.match(await page.locator('#crackExtraSummary').textContent(), /斜向.*結構體/);
    assert.match(await page.locator('#widthLegacy').textContent(), /≤0.3/);
    await click('[data-crack-type=network]');
    assert.equal(await page.locator('#crackSizeFields').evaluate(el => el.open), false); assert.doesNotMatch(await page.locator('#conditionCard-crack > summary').textContent(), /待補/);
    await click('[data-field-preset=u]'); await click('#crackCountPresets [data-count="3"]'); await save(); assert.equal((await current()).records[1].crackCount, 3);
    await click('[data-crack-type=general]'); await click('#individualCracks [data-count="2"]');
    const second = page.locator('[data-crack-id]').nth(1); assert(await second.locator('[data-key=layer]').isHidden());
    await save(); await second.locator(':scope > summary').click();
    await clickSurvey(page, '#recordIssues [data-fix-issue="裂縫 B未量測"]');
    await second.locator('[data-narrow]').waitFor(); assert.equal(await second.evaluate(el => el.open), true);
    await second.locator('[data-narrow]').click(); await second.locator('[data-key=measured]').check(); await second.locator('[data-key=length]').fill('2.3');
    await second.locator('.crack-extra > summary').click(); await second.locator('[data-key=layer]').selectOption('plaster'); await save();
    assert.equal((await current()).records[1].cracks[1].length, 2.3);
    await click('#conditionPickerSummary'); await click('#materialSummary'); await click('[data-field-preset=tile]'); await page.locator('#condition input[value=tileBroken]').check(); await click('#fillConditionDetails');
    assert.deepEqual(await cards(), ['tile']); assert(await page.locator('#tileCrackCount').isVisible());
    await page.locator('#tileCrackCount').fill('4'); await page.locator('#tileBrokenCount').fill('2'); await page.locator('#tileOverlapCount').fill('1'); await save();
    assert.match(await page.locator('#tileTotal').textContent(), /5 塊/); assert.equal((await current()).records[1].cracks[1].length, 2.3);
    const roundtrip = await page.evaluate(async () => {
      const s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0], bundle = await b.makeBundle(p, async id => (await s.getMedia(id)).blob);
      return { original: p, restored: (await b.readBundle(bundle.blob)).project };
    }); assert.deepEqual(roundtrip.restored.records, roundtrip.original.records);
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
    await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    assert.equal(await page.locator('#conditionPicker').evaluate(el => el.open), false);
    assert.deepEqual((await current()).records, roundtrip.original.records);
    assert.deepEqual(errors, []);
    console.log('PASS V0.27 real selection/fill phases, stable typing, optional defaults, legacy exceptions, area preservation, U/network/tile/individual cracks, mobile layouts, backup and offline reload');
  } catch (error) { await page.screenshot({ path: path.join(out, 'v0.27-failure.png'), fullPage: true }); console.error('V0.27 page errors:', errors); throw error; }
  finally { await context.close(); }
}
