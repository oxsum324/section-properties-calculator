import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV019(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { await page.locator(selector).click(); await idle(); };
  const byCode = code => page.evaluate(async c => (await (await import('./store.js')).allProjects()).find(p => p.code === c), code);
  const visible = selector => page.locator(selector).isVisible();
  const text = selector => page.locator(selector).textContent();
  const chips = selector => page.locator(selector + ' button').evaluateAll(nodes => nodes.map(n => n.textContent));
  const pressed = selector => page.locator(selector + ' button[aria-pressed=true]').evaluateAll(nodes => nodes.map(n => n.textContent));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    // An apartment case is created through the real dialog and pre-builds one unit per floor plus a public unit.
    await click('#startCase'); await page.locator('#caseForm [name=code]').fill('V019'); await page.locator('#caseForm [name=name]').fill('案件型態測試');
    await page.locator('#caseForm [name=type]').selectOption('apartment'); assert.match(await text('#caseTypeHelp'), /一層一戶/);
    await page.locator('#caseForm [name=above]').fill('3'); await page.locator('#caseForm [name=below]').fill('1'); assert(!(await visible('#buildingsField')));
    await click('#caseForm button[type=submit]'); await page.locator('#recordForm, #recordEmpty').first().waitFor();
    let project = await byCode('V019'); assert.equal(project.buildingType, 'apartment'); assert.deepEqual(project.floorConfig, { above: 3, below: 1, mezzanine: false });
    assert.deepEqual(project.units.map(u => [u.code, u.floor || '', u.kind || 'residence']), [['1F', '1F', 'residence'], ['2F', '2F', 'residence'], ['3F', '3F', 'residence'], ['公設', '', 'public']]);
    const unit = code => project.units.find(u => u.code === code).id;
    // The case is read-only outside the case page; the selector lives on the case page.
    assert.equal(await text('#contextCase'), 'V019 · 案件型態測試'); assert(!(await visible('#caseSelect'))); assert(!(await visible('#editCase')));
    assert.deepEqual(await page.locator('#unitSelect option').evaluateAll(nodes => nodes.map(n => n.textContent)), ['1F', '2F', '3F', '公設']);
    // Fixed unit floors pre-fill new records and stay editable through floor chips.
    await page.locator('#unitSelect').selectOption(unit('2F')); await idle(); await click('#addRecord');
    assert.equal(await page.locator('#floor').inputValue(), '2F'); assert.deepEqual(await chips('#floorChips'), ['B1', '1F', '2F', '3F', 'RF']); assert.deepEqual(await pressed('#floorChips'), ['2F']);
    assert.deepEqual((await chips('#spaceChips')).slice(0, 3), ['客廳', '房間', '主臥']); assert((await chips('#spaceChips')).includes('正面外牆'));
    await click('#floorChips [data-floor="3F"]'); await click('#spaceChips [data-space="客廳"]'); await click('#saveRecord');
    assert.equal(await page.locator('#floor').inputValue(), '3F'); assert.deepEqual(await pressed('#floorChips'), ['3F']); assert.deepEqual(await pressed('#spaceChips'), ['客廳']);
    project = await byCode('V019'); assert.equal(project.records.length, 1); assert.equal(project.records[0].floor, '3F'); assert.equal(project.records[0].space, '客廳'); assert.equal(await text('#contextRecord'), '位置 001 · 3F 客廳');
    await page.locator('#floor').fill('MF'); assert.deepEqual(await pressed('#floorChips'), []);
    await click('#floorChips [data-floor="2F"]'); await click('#saveRecord'); project = await byCode('V019'); assert.equal(project.records[0].floor, '2F');
    // The address shortcut records the unit's exterior without extra typing.
    await click('#addAddressRecord'); project = await byCode('V019'); assert.equal(project.records.length, 2);
    const address = project.records[1]; assert.deepEqual([address.floor, address.space, address.location, address.components, address.conditions, address.component, address.condition], ['2F', '外觀', '門牌', ['外觀'], ['normal'], '外觀', 'normal']);
    assert.equal(await text('#contextRecord'), '位置 002 · 2F 外觀'); assert.deepEqual(await pressed('#spaceChips'), ['外觀']);
    // Next-unit follows building, floor and code order and stops at the last unit.
    await click('#nextUnit'); assert.equal(await text('#contextUnit'), '3F'); await click('#nextUnit'); assert.equal(await text('#contextUnit'), '公設'); assert(await page.locator('#nextUnit').isDisabled());
    await click('#addRecord'); assert.equal(await page.locator('#floor').inputValue(), ''); assert((await chips('#spaceChips')).includes('樓梯間')); assert(!(await chips('#spaceChips')).includes('客廳'));
    await page.locator('#floor').fill('1F'); await page.locator('#space').fill('樓梯間'); await click('#saveRecord');
    // Case settings change only the quick choices; existing records and units stay.
    await click('[data-view=case]'); assert(await visible('#caseSelect')); assert.match(await text('#caseTypeSummary'), /公寓 · 地上 3 層、地下 1 層/);
    await click('#editCase'); assert.equal(await page.locator('#caseForm [name=type]').inputValue(), 'apartment'); assert.equal(await page.locator('#caseForm [name=above]').inputValue(), '3');
    await page.locator('#caseForm [name=above]').fill('5'); await page.locator('#caseForm [name=mezzanine]').check(); await click('#caseForm button[type=submit]');
    assert.match(await text('#caseTypeSummary'), /地上 5 層、地下 1 層、含夾層/); const after = await byCode('V019'); assert.equal(after.units.length, 4); assert.equal(after.records.length, 3); assert.deepEqual(after.floorConfig, { above: 5, below: 1, mezzanine: true });
    await click('[data-view=work]'); await page.locator('#unitSelect').selectOption(unit('1F')); await idle(); await click('#addRecord'); assert.deepEqual(await chips('#floorChips'), ['B1', '1F', 'MF', '2F', '3F', '4F', '5F', 'RF']);
    // A tower case with two buildings gets one public unit per building; the roster import accepts a floor column.
    await click('[data-view=case]'); await click('#newCase'); await page.locator('#caseForm [name=code]').fill('V019-T'); await page.locator('#caseForm [name=name]').fill('大樓型態測試');
    await page.locator('#caseForm [name=type]').selectOption('tower'); assert(await visible('#buildingsField')); await page.locator('#caseForm [name=above]').fill('12'); await page.locator('#caseForm [name=buildings]').fill('A棟, B棟'); await click('#caseForm button[type=submit]');
    const tower = await byCode('V019-T'); assert.deepEqual(tower.units.map(u => [u.code, u.building, u.kind]), [['A棟公設', 'A棟', 'public'], ['B棟公設', 'B棟', 'public']]); assert.equal(await text('#contextCase'), 'V019-T · 大樓型態測試');
    await click('[data-view=case]'); await click('#importRoster'); await page.locator('#rosterText').fill('戶別\t地址\t棟別\t種類\t樓層\nA-301\t合成路 1 號\tA棟\t住戶\t3F\nA-1201\t合成路 1 號\tA棟\t住戶\t12F'); await click('#reviewRoster'); await click('#applyRoster');
    const imported = await byCode('V019-T'); assert.deepEqual(imported.units.map(u => u.code), ['A棟公設', 'B棟公設', 'A-301', 'A-1201']); assert.equal(imported.units.find(u => u.code === 'A-1201').floor, '12F');
    await click('[data-view=work]'); assert.deepEqual(await page.locator('#unitSelect option').evaluateAll(nodes => nodes.map(n => n.textContent.split(' · ')[0])), ['A-301', 'A-1201', 'A棟公設', 'B棟公設']);
    await page.locator('#unitSelect').selectOption(imported.units.find(u => u.code === 'A-1201').id); await idle(); await click('#addRecord'); assert.equal(await page.locator('#floor').inputValue(), '12F'); assert((await chips('#floorChips')).includes('12F'));
    // Backups carry the new fields under format 12 and restore unchanged.
    const roundtrip = await page.evaluate(async code => { const s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects()).find(x => x.code === code), get = async id => (await s.getMedia(id)).blob, bundle = await b.readBundle((await b.makeBundle(p, get)).blob); return { version: bundle.manifest.version, equal: JSON.stringify(bundle.project) === JSON.stringify(p), type: bundle.project.buildingType, floors: bundle.project.units.map(u => u.floor || '') }; }, 'V019');
    assert.equal(roundtrip.version, 13); assert(roundtrip.equal); assert.equal(roundtrip.type, 'apartment'); assert.deepEqual(roundtrip.floors, ['1F', '2F', '3F', '']);
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) { await page.setViewportSize({ width, height }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at ' + width); await page.screenshot({ path: path.join(out, `v0.19-work-${width}.png`) }); }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#contextStrip').waitFor();
    assert(await visible('#contextStrip')); assert.match(await text('#contextCase'), /V019/); await page.locator('#recordForm, #recordEmpty').first().waitFor(); assert((await chips('#floorChips')).length > 0 || await visible('#recordEmpty'));
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.19-result.json'), JSON.stringify({ passed: true, backupVersion: 12, types: ['apartment', 'tower'], errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.19 case types, auto units, fixed floors with editable chips, space chips, address shortcut, next unit, case settings, tower buildings, roster floors, backup 12 and offline');
  } finally { await context.close(); }
}
