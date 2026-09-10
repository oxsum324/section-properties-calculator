import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Synthetic capacity evidence; not a claim about full-resolution phone storage.
export async function verifyScale(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('SYNTHETIC-SCALE', '合成 250 戶 3000 張小圖', '2026-09-10'), assets = [], canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
      const ctx = canvas.getContext('2d'), started = performance.now(); let serial = 0;
      const image = async kind => { const id = m.id(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 240, 160); ctx.strokeStyle = '#344d44'; ctx.strokeRect(10, 10, 220, 140); ctx.fillStyle = '#344d44'; ctx.font = '18px sans-serif'; ctx.fillText('SYNTHETIC ' + (++serial), 15, 65); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); p.media.push({ id, kind, name: 'synthetic-' + serial + '.png', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() }); assets.push({ id, blob, thumb: blob }); return id; };
      p.visits.push({ id: m.id(), name: '第 2 次會勘', start: '2026-09-11', end: '2026-09-11' }, { id: m.id(), name: '第 3 次會勘', start: '2026-09-12', end: '2026-09-12' });
      for (let i = 0; i < 250; i++) {
        const u = m.newUnit('A-' + String(i + 1).padStart(3, '0'), '合成測試地址 ' + (i + 1)); p.units.push(u);
        const plan = { id: m.id(), unitId: u.id, floor: '1F', title: '合成平面圖', mediaId: await image('plan') }; p.plans.push(plan);
        for (let ri = 0; ri < 2; ri++) {
          const r = m.newRecord(u.id, '1F', '合成空間 ' + ri), visit = p.visits[(i + ri) % 3]; Object.assign(r, { component: '牆面', condition: 'normal', location: '入口 ' + ri, visitId: visit.id, observedOn: visit.start, detail: { kind: 'text', value: 'current' }, placement: { planId: plan.id, x: .2 + ri * .5, y: .6, endX: .4 + ri * .5, endY: .8 } });
          for (let j = 0; j < 6; j++) r.photos.push({ mediaId: await image('image'), role: j ? 'close' : 'overview', caption: '合成小圖 ' + j, marks: [], reportInclude: true, excluded: false, excludedReason: '' }); p.records.push(r);
        }
      }
      m.syncRooms(p); const saved = await s.saveProject(p, 0, assets); return { revision: saved.revision, seedMs: Math.round(performance.now() - started), sourceBytes: assets.reduce((n, a) => n + a.blob.size, 0), distinctHashes: new Set(p.media.map(m => m.sha256)).size };
    });
    assert.equal(seed.distinctHashes, 3250);
    await page.reload(); await page.locator('#recordForm').waitFor(); await page.locator('[data-view=report]').click(); await page.locator('#busy').waitFor({ state: 'hidden' });
    await page.locator('[data-report-image]').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-report-image]')].some(img => img.complete && img.naturalWidth));
    const dom = await page.evaluate(() => ({ records: document.querySelectorAll('[data-report-record]').length, images: document.querySelectorAll('[data-report-image]').length, loadedImages: [...document.querySelectorAll('[data-report-image]')].filter(img => img.src).length }));
    assert.equal(dom.records, 8); assert.equal(dom.images, 48); assert(dom.loadedImages > 0 && dom.loadedImages < 48);
    await page.locator('[data-report-page="1"]').click(); await page.locator('#busy').waitFor({ state: 'hidden' }); assert.equal(await page.locator('[data-report-record]').count(), 8);
    const result = await page.evaluate(async () => {
      const s = await import('./store.js'), r = await import('./report.js'), p = (await s.allProjects())[0], before = JSON.stringify(p), start = performance.now();
      const plan = await r.prepareVolumes(p, { maxPages: 40, tableRows: 8, plansPerPage: 2, pagePrefix: '8-', pageStart: 41, toc: true }); const layoutMs = Math.round(performance.now() - start), encoded = [];
      for (const volume of [plan.volumes[0], plan.volumes.at(-1)]) {
        let reads = 0; const t = performance.now(), output = await r.renderPlannedVolume(p, async id => { reads++; return (await s.getMedia(id)).blob; }, plan, volume.number);
        const iframe = document.createElement('iframe'); document.body.append(iframe); await new Promise(resolve => { iframe.onload = resolve; iframe.srcdoc = output.html; }); await Promise.all([...iframe.contentDocument.images].map(img => img.decode()));
        const overflows = [...iframe.contentDocument.querySelectorAll('.sheet-content')].filter(el => el.scrollHeight > el.clientHeight + 1).length; iframe.remove();
        encoded.push({ number: volume.number, pageCount: output.index.sections.length, reads, htmlBytes: new Blob([output.html]).size, renderMs: Math.round(performance.now() - t), overflows });
      }
      return { units: p.units.length, photos: plan.index.groups.flatMap(g => g.records).reduce((n, r) => n + r.photos.length, 0), pages: plan.index.sections.length, volumes: plan.volumes.length, entries: plan.entries.length, layoutMs, encoded, unchanged: before === JSON.stringify(p) && before === JSON.stringify((await s.allProjects())[0]), allUnitNumbersReset: plan.index.groups.filter((g, i, all) => !i || g.unitId !== all[i - 1].unitId).every(g => g.records[0].photos[0].number === '001') };
    });
    assert.equal(result.units, 250); assert.equal(result.photos, 3000); assert.equal(result.entries, 250); assert(result.pages >= 2000); assert(result.volumes > 40); assert(result.unchanged); assert(result.allUnitNumbersReset);
    for (const v of result.encoded) { assert(v.reads < 80); assert.equal(v.overflows, 0); assert(v.pageCount <= 40); }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'v0.10-scale-result.json'), JSON.stringify({ passed: true, ...seed, ...dom, ...result, imageSize: '240x160 synthetic PNG', actualPhoneTested: false, checkedAt: new Date().toISOString() }, null, 2));
    console.log('PASS synthetic 250 units / 3000 distinct photos; bounded DOM, ' + result.pages + ' pages planned without image reads; first/last volumes rendered without overflow');
  } finally { await context.close(); }
}
