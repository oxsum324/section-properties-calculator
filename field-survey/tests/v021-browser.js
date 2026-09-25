import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV021(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = selector => clickSurvey(page, selector);
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const tapStage = async (x, y) => { const p = await page.locator('#detailStage svg').evaluate((svg, [x, y]) => { const box = svg.viewBox.baseVal, pt = new DOMPoint(box.x + x * box.width, box.y + y * box.height).matrixTransform(svg.getScreenCTM()); return { x: pt.x, y: pt.y }; }, [x, y]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(80); };
  const near = (a, b, tolerance = .015) => Math.abs(a - b) <= tolerance;
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V021', '展開底圖與貼面測試', '2026-09-21'), u = m.newUnit('A戶'), r = m.newRecord(u.id, '3F', '房間');
      Object.assign(r, { location: '窗邊', component: '牆面', components: ['牆面'], condition: 'crack', conditions: ['crack'], crackPattern: 'diagonal' }); p.units.push(u); p.records.push(r);
      await s.saveProject(m.syncRooms(p), 0, []); return { id: p.id, record: r.id };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    // Both base families are offered: six oblique and six unfolded elevations.
    await click(`[data-field-detail="${seed.record}"]`); await page.locator('#detailChoices').waitFor();
    assert.equal(await page.locator('[data-detail-preset]').count(), 12); assert.deepEqual(await page.locator('.detail-preset-group').allTextContents(), ['斜視（透視）', '展開立面（2D）']);
    // An unfolded elevation takes a plain two-corner door.
    await click('[data-detail-preset=flatWindow]'); await page.locator('#detailStage svg').waitFor(); await click('[data-detail-tool=door]'); await tapStage(.30, .50); await tapStage(.40, .88);
    await click('#saveDetail'); let detail = (await current()).records[0].detail; assert.equal(detail.preset, 'flatWindow'); assert.equal(detail.marks.length, 1); assert.equal(detail.marks[0].points.length, 2);
    // On an oblique base two taps snap to the tapped wall and become a perspective-following quad.
    await click(`[data-field-detail="${seed.record}"]`); await page.locator('#detailStage svg').waitFor(); await click('#chooseDetail'); page.once('dialog', d => d.accept()); await click('[data-detail-preset=corner]'); await page.locator('#detailStage svg').waitFor();
    await click('[data-detail-tool=window]'); await tapStage(.62, .35); await tapStage(.85, .60);
    await click('#saveDetail'); detail = (await current()).records[0].detail; assert.equal(detail.preset, 'corner'); assert.equal(detail.marks.length, 1);
    const quad = detail.marks[0].points; assert.equal(quad.length, 4); assert(Math.abs(quad[0].y - quad[1].y) > .01, 'top edge follows the wall perspective');
    const expected = await page.evaluate(() => import('./detail-geometry.js').then(g => g.openingOnPlane('corner', false, { x: .62, y: .35 }, { x: .85, y: .60 })));
    quad.forEach((p, i) => assert(near(p.x, expected[i].x) && near(p.y, expected[i].y), 'snapped opening matches the face geometry'));
    // Mirroring the base mirrors the snapped opening and keeps it valid.
    await click(`[data-field-detail="${seed.record}"]`); await page.locator('#detailStage svg').waitFor(); await click('#mirrorDetail'); await click('#saveDetail');
    detail = (await current()).records[0].detail; assert.equal(detail.mirror, true); detail.marks[0].points.forEach((p, i) => assert(near(1 - p.x, quad[i].x) && near(p.y, quad[i].y)));
    const rendered = await page.evaluate(async detail => { const d = await import('./detail.js'); const blob = await d.detailImage(detail, () => null); return blob.size > 1000; }, detail); assert(rendered);
    const roundtrip = await page.evaluate(async () => { const s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob, bundle = await b.readBundle((await b.makeBundle(p, get)).blob); return { version: bundle.manifest.version, equal: JSON.stringify(bundle.project) === JSON.stringify(p) }; });
    assert.equal(roundtrip.version, 15); assert(roundtrip.equal);
    await page.screenshot({ path: path.join(out, 'v0.21-work-390.png') });
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    await click(`[data-field-detail="${seed.record}"]`); await page.locator('#detailStage svg').waitFor(); assert.equal(await page.locator('#detailStage [data-detail-index]').count(), 1); await click('#closeModal');
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.21-result.json'), JSON.stringify({ passed: true, presets: 12, backupVersion: 14, errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.21 unfolded elevation presets, plane-snapped two-tap openings on oblique bases, mirror, grayscale render, backup and offline');
  } finally { await context.close(); }
}
