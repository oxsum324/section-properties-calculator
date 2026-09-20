import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV018(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = async selector => { await page.locator(selector).click(); await idle(); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const visible = selector => page.locator(selector).isVisible();
  const activeView = () => page.locator('#bottomNav .active').getAttribute('data-view');
  const text = selector => page.locator(selector).textContent();
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V018', '分頁與脈絡列測試', '2026-09-18');
      const a = m.newUnit('A戶', '合成路 1 號'), b = { ...m.newUnit('B棟公設'), kind: 'public' }; p.units.push(a, b);
      const r = m.newRecord(a.id, '2F', '客廳'); Object.assign(r, { location: '窗角', component: '牆面', components: ['牆面'], condition: 'crack', conditions: ['crack'], crackPattern: 'horizontal' }); p.records.push(r);
      await s.saveProject(m.syncRooms(p), 0, []); return { id: p.id, a: a.id, b: b.id, record: r.id, visit: p.visits[0].id };
    });
    await page.reload(); await page.locator('#recordForm').waitFor(); const before = await current();
    // Four exclusive views; the work view is the default and keeps only per-unit controls.
    assert.deepEqual(await page.locator('#bottomNav [data-view]').evaluateAll(nodes => nodes.map(n => n.dataset.view)), ['case', 'work', 'review', 'report']);
    assert.equal(await activeView(), 'work');
    for (const selector of ['#unitSelect', '#addUnit', '#editUnit', '#unitPlans', '#addRecord', '#recordForm', '#gotoCase']) assert(await visible(selector), selector + ' visible on work view');
    for (const selector of ['#visitSelect', '#manageVisits', '#importRoster', '#newCase', '#prepareHandoff', '#readBackup']) assert(!(await visible(selector)), selector + ' hidden on work view');
    // The context strip names case, visit, unit and the record being edited, and follows edits.
    assert(await visible('#contextStrip')); assert.equal(await page.locator('#caseSelect').inputValue(), seed.id);
    assert.equal(await text('#contextVisit'), '第 1 次會勘'); assert.equal(await text('#contextUnit'), 'A戶'); assert.equal(await text('#contextRecord'), '位置 001 · 2F 客廳');
    await page.locator('#space').fill('主臥'); await click('#saveRecord'); assert.equal(await text('#contextRecord'), '位置 001 · 2F 主臥');
    await page.locator('#notes').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 400));
    assert(await page.evaluate(() => window.scrollY > 200), 'the work view is long enough to scroll');
    const strip = await page.locator('#contextStrip').boundingBox(); assert(Math.abs(strip.y) <= 1, 'context strip stays pinned to the top while the form scrolls');
    await page.locator('#unitSelect').selectOption(seed.b); await idle(); assert.equal(await text('#contextUnit'), 'B棟公設'); assert(!(await visible('#contextRecord')));
    await page.locator('#unitSelect').selectOption(seed.a); await idle(); assert.equal(await text('#contextRecord'), '位置 001 · 2F 主臥');
    // The case view gathers setup and backup; the record crumb and the shortcut button are hidden there.
    await click('[data-view=case]'); assert.equal(await activeView(), 'case');
    for (const selector of ['#visitSelect', '#manageVisits', '#importRoster', '#newCase', '#prepareHandoff', '#readBackup']) assert(await visible(selector), selector + ' visible on case view');
    assert(!(await visible('#recordForm'))); assert(!(await visible('#contextRecord'))); assert(!(await visible('#gotoCase')));
    assert.match(await text('#caseUnitSummary'), /2 戶：住戶 1、公設 1/); assert.match(await text('#backupSummary'), /2 戶 · 1 筆紀錄/);
    await click('#manageVisits'); await click('#newVisitBatch'); await page.locator('#visitForm [name=name]').fill('補勘'); await page.locator('#visitForm [name=start]').fill('2026-09-20'); await page.locator('#visitForm [name=end]').fill('2026-09-20'); await click('#visitForm .primary');
    assert.equal(await activeView(), 'case'); assert.equal(await text('#contextVisit'), '補勘');
    await page.locator('#visitSelect').selectOption(seed.visit); await idle(); assert.equal(await text('#contextVisit'), '第 1 次會勘');
    await click('[data-view=work]'); assert(await visible('#recordForm')); assert(await visible('#gotoCase')); await click('#gotoCase'); assert.equal(await activeView(), 'case');
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) { await page.setViewportSize({ width, height }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at ' + width); await page.screenshot({ path: path.join(out, `v0.18-case-${width}.png`) }); }
    await page.setViewportSize({ width: 390, height: 844 }); await click('[data-view=work]'); await page.screenshot({ path: path.join(out, 'v0.18-work-390.png') });
    // Navigating between views changed nothing except the edited space and the added batch.
    const after = await current(); assert.equal(after.records[0].space, '主臥'); assert.equal(after.visits.length, 2); assert.deepEqual(after.units, before.units); assert.equal(after.records[0].id, before.records[0].id);
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    assert(await visible('#contextStrip')); assert.equal(await text('#contextUnit'), 'A戶'); await click('[data-view=case]'); assert(await visible('#prepareHandoff'));
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.18-result.json'), JSON.stringify({ passed: true, views: ['case', 'work', 'review', 'report'], errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.18 four-view navigation, case/backup page, pinned context strip, mobile widths, unchanged data and offline reload');
  } finally { await context.close(); }
}
