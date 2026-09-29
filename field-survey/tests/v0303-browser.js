import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyV0303(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    window.__wake = { calls: 0, hidden: false, reject: false, sentinel: null };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__wake.hidden });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async type => {
      if (type !== 'screen') throw new Error('unexpected wake lock type');
      window.__wake.calls++;
      if (window.__wake.reject) throw new DOMException('denied', 'NotAllowedError');
      const sentinel = new EventTarget();
      sentinel.released = false;
      sentinel.release = async () => { if (!sentinel.released) { sentinel.released = true; sentinel.dispatchEvent(new Event('release')); } };
      window.__wake.sentinel = sentinel;
      return sentinel;
    } } });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.evaluate(async () => {
      const model = await import('./model.js'), store = await import('./store.js');
      await store.saveProject(model.newProject('WAKE-TEST', '螢幕常亮合成測試', '2026-09-29'), 0);
    });
    await page.reload();
    const button = page.locator('#keepAwake');
    await button.waitFor({ state: 'visible' });
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await button.click();
    await page.waitForFunction(() => document.querySelector('#keepAwake').dataset.state === 'active');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await button.isEnabled(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#keepAwake')).backgroundColor === 'rgb(23, 61, 59)');
    assert.equal(await page.evaluate(() => window.__wake.calls), 1);
    if (out) { await page.locator('#busy').waitFor({ state: 'hidden' }); await page.screenshot({ path: path.join(out, 'v0.30.3-wake-lock-mobile.png') }); }
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.__wake.sentinel.released), true);
    await button.click();
    await page.evaluate(() => { window.__wake.hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__wake.sentinel.release(); });
    await page.waitForFunction(() => document.querySelector('#keepAwake').dataset.state === 'paused');
    await page.evaluate(() => { window.__wake.hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('#keepAwake').dataset.state === 'active' && window.__wake.calls === 3);
    await page.evaluate(() => window.__wake.sentinel.release());
    await page.waitForFunction(() => document.querySelector('#keepAwake').dataset.state === 'failed');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => { window.__wake.reject = true; });
    await button.click();
    await page.waitForFunction(() => document.querySelector('#keepAwake').dataset.state === 'failed');
    assert.match(await page.locator('#keepAwakeStatus').textContent(), /未允許/);
    await page.evaluate(() => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); });
    await button.click();
    assert.match(await page.locator('#keepAwakeStatus').textContent(), /不支援/);
    await page.reload();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `no horizontal scroll at ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS V0.30.3 mobile wake lock on/off, foreground reacquire, system refusal, unsupported browser and session reset');
  } finally { await context.close(); }
}
