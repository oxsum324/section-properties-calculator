import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clickSurvey } from './ui-click.js';

export async function verifyV028(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const click = selector => clickSurvey(page, selector);
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const tap = async (x, y) => {
    const point = await page.locator('#detailStage svg').evaluate((svg, [x, y]) => { const box = svg.viewBox.baseVal, p = new DOMPoint(box.x + x * box.width, box.y + y * box.height).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y }; }, [x, y]);
    await page.touchscreen.tap(point.x, point.y);
  };
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V028', '地板及平頂合成測試', '2026-09-25'), u = m.newUnit('A 戶'); p.units.push(u);
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 80; canvas.getContext('2d').fillRect(20, 10, 50, 40);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), mid = m.id();
      p.media.push({ id: mid, kind: 'image', name: '合成.png', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
      for (const component of ['地坪', '平頂', '牆面']) {
        const r = m.newRecord(u.id, '1F', '客廳'); Object.assign(r, { component, location: '入口側', condition: 'crack', widthMode: 'range0103', reportText: component + '人工說明保留' });
        r.photos.push({ mediaId: mid, role: 'overview', caption: '合成', marks: [], excluded: false, excludedReason: '' }); p.records.push(r);
      }
      p.records[2].detail = { kind: 'preset', preset: 'flatWall', mirror: false, marks: [{ type: 'pen', points: [{ x: .3, y: .4 }, { x: .6, y: .7 }] }] };
      return s.saveProject(m.syncRooms(p), 0, [{ id: mid, blob }]);
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    for (const [i, preset] of ['flatFloor', 'flatCeiling'].entries()) {
      if (i) await click(`[data-record="${seed.records[i].id}"]`);
      await click(`[data-field-detail="${seed.records[i].id}"]`);
      assert.equal(await page.locator('.detail-preset-group').first().textContent(), '地板／平頂（2D）');
      assert.match(await page.locator('[data-detail-preset=flatCeiling] > span').textContent(), /平頂/);
      assert.doesNotMatch(await page.locator('#detailChoices').textContent(), /天花板/);
      await click(`[data-detail-preset=${preset}]`); await page.locator('#detailStage svg').waitFor(); await click('#saveDetail');
      assert.deepEqual((await current()).records[i].detail.marks, [], 'The base does not invent cracks or fixtures');
      await click(`[data-field-detail="${seed.records[i].id}"]`); await click('[data-detail-tool=line]');
      await tap(.26, .38); await tap(.48, .52); await tap(.70, .70); await click('#detailFinish');
      await click('[data-detail-tool=symbol]'); await click('[data-detail-symbol=network]'); await tap(.7, .36);
      await click('#saveDetail');
      const beforeMirror = (await current()).records[i].detail;
      await click(`[data-field-detail="${seed.records[i].id}"]`); await click('#mirrorDetail'); await click('#saveDetail');
      const mirrored = (await current()).records[i].detail;
      assert.equal(mirrored.mirror, true);
      mirrored.marks[0].points.forEach((point, n) => { assert(Math.abs(point.x - (1 - beforeMirror.marks[0].points[n].x)) < 1e-9); assert.equal(point.y, beforeMirror.marks[0].points[n].y); });
      await click(`[data-field-detail="${seed.records[i].id}"]`);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert(await page.locator('#saveDetail').isVisible());
        await page.screenshot({ path: path.join(out, `v0.28-${preset}-${width}.png`) });
      }
      const downloadEvent = page.waitForEvent('download'); await click('#downloadDetail'); const download = await downloadEvent;
      await download.saveAs(path.join(out, `v0.28-${preset}.png`)); await click('#closeModal');
    }
    const saved = await current();
    assert.deepEqual(saved.records[2], seed.records[2], 'Existing wall drawing stays unchanged');
    for (let i = 0; i < 2; i++) for (const key of ['component', 'condition', 'widthMode', 'width', 'length', 'photos', 'reportText']) assert.deepEqual(saved.records[i][key], seed.records[i][key]);
    const result = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), b = await import('./bundle.js'), d = await import('./detail.js'), r = await import('./report.js');
      const p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob, bundle = await b.readBundle((await b.makeBundle(p, get)).blob), hashes = [], sizes = [], labels = [];
      for (const record of p.records) {
        const blob = await d.detailImage(record.detail, get), bitmap = await createImageBitmap(blob); sizes.push([bitmap.width, bitmap.height]); bitmap.close(); hashes.push(await m.sha256(blob));
        const doc = new DOMParser().parseFromString(d.presetSVG(record.detail.preset, true), 'image/svg+xml');
        labels.push([...doc.querySelectorAll('[data-base-label]')].map(el => ({ text: el.textContent, transformed: !!el.closest('[transform]') })));
      }
      const reports = {};
      for (const format of ['quick', 'standard']) {
        const doc = new DOMParser().parseFromString((await r.renderAttachment(p, get, { format })).html, 'text/html');
        reports[format] = await Promise.all([...doc.querySelectorAll('.detail-img')].map(img => m.sha256(Uint8Array.from(atob(img.src.split(',')[1]), c => c.charCodeAt(0)))));
      }
      return { restored: bundle.project, version: bundle.manifest.version, hashes, sizes, labels, reports };
    });
    assert.deepEqual(result.restored.records, saved.records); assert.equal(result.version, 16);
    assert.deepEqual(result.labels, [[{ text: '地板（俯視）', transformed: false }], [{ text: '平頂（仰視）', transformed: false }], []]);
    assert(result.sizes.every(size => size[0] === 1200 && size[1] === 640), 'No extra caption band below the diagram');
    for (const hashes of Object.values(result.reports)) assert.deepEqual(hashes, result.hashes);
    const downloaded = await Promise.all(['flatFloor', 'flatCeiling'].map(preset => fs.readFile(path.join(out, `v0.28-${preset}.png`))));
    const { createHash } = await import('node:crypto'); downloaded.forEach((bytes, i) => assert.equal(createHash('sha256').update(bytes).digest('hex'), result.hashes[i]));
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    await click(`[data-record="${seed.records[1].id}"]`); await click(`[data-field-detail="${seed.records[1].id}"]`); assert.equal(await page.locator('#detailStage [data-detail-index]').count(), 2); await click('#saveDetail');
    assert.deepEqual((await current()).records[1].detail, saved.records[1].detail); assert.deepEqual(errors, []);
    console.log('PASS V0.28 floor and flat-ceiling bases, blank defaults, cracks/symbols, mirror labels, mobile drawing, exact PNG/report match, backup and offline; existing observations preserved');
  } finally { await context.close(); }
}
