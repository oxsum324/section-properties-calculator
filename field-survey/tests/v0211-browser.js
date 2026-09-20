import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Another same-origin window holding the old database open must not leave the app hanging on the
// welcome screen; it has to say what to close, and recover once that window lets go.
export async function verifyBlockedUpgrade(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(url => url.searchParams.has('holder'), route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>holder</title><p>holding the old database open</p>' }));
  const holder = await context.newPage(), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await holder.goto(base + '?holder=1');
    await holder.evaluate(() => new Promise((resolve, reject) => { const req = indexedDB.open('condition-survey-v1', 13); req.onupgradeneeded = () => {}; req.onsuccess = () => { window.__db = req.result; window.__db.onversionchange = () => { /* deliberately keeps the old connection open */ }; resolve(); }; req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error('holder itself was blocked')); }));
    const started = Date.now();
    await page.goto(base); await page.locator('#errorBar').waitFor({ state: 'visible', timeout: 20000 });
    const message = await page.locator('#errorText').textContent(), waited = Date.now() - started;
    assert.match(message, /占用/); assert.match(message, /關閉其他/); assert(waited >= 7000 && waited < 20000, 'guidance appears after the bounded wait, not immediately and not never');
    assert(await page.locator('#startCase').isDisabled()); assert(await page.locator('#welcomeImport').isDisabled()); assert.match(await page.locator('#offlineStatus').textContent(), /資料庫尚未開啟/);
    // Releasing the old connection and reloading brings the app back with the upgraded database.
    await holder.evaluate(() => window.__db.close());
    await page.reload(); await page.locator('#startCase').waitFor(); await page.waitForTimeout(500);
    assert(!(await page.locator('#errorBar').isVisible())); assert(!(await page.locator('#startCase').isDisabled()));
    await page.locator('#startCase').click(); await page.locator('#caseForm [name=code]').fill('BLOCK'); await page.locator('#caseForm [name=name]').fill('占用後恢復'); await page.locator('#caseForm button[type=submit]').click(); await page.locator('#busy').waitFor({ state: 'hidden' });
    const projects = await page.evaluate(async () => (await (await import('./store.js')).allProjects()).map(p => p.code)); assert.deepEqual(projects, ['BLOCK']);
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.21.1-result.json'), JSON.stringify({ passed: true, waitedMs: waited, errors }, null, 2));
    console.log('PASS V0.21.1 blocked database upgrade shows what to close within the bounded wait and recovers after the old window releases it');
  } finally { await context.close(); }
}
