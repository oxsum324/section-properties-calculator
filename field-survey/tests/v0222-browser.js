import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV0222(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const source = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js');
      const p = m.newProject('TEXT-DEMO', '照片內容精簡測試（合成資料）', '2026-09-20'), u = m.newUnit('A戶'), r = m.newRecord(u.id, '1F', '客廳');
      p.units.push(u); p.records.push(r);
      Object.assign(r, { component: '牆面', condition: 'damp', location: '窗角', notes: '水痕由窗角向下延伸。', detail: { kind: 'preset', preset: 'window', mirror: false, note: '水痕由窗角向下延伸。', marks: [{ type: 'symbol', symbol: 'damp', points: [{ x: .55, y: .6 }], size: .24, rotation: 0, mirror: false }] } });
      r.reportText = m.observationText(r);
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 400, 300); ctx.fillStyle = '#222'; ctx.font = '24px sans-serif'; ctx.fillText('SYNTHETIC PHOTO', 50, 150);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), assets = [];
      for (let i = 0; i < 2; i++) {
        const id = m.id(); assets.push({ id, blob, thumb: blob }); p.media.push({ id, name: `sample-${i}.png`, kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
        r.photos.push({ mediaId: id, role: i ? 'close' : 'overview', caption: i ? '近照：窗角表面痕跡。' : r.notes, marks: [], excluded: false, excludedReason: '' });
      }
      await s.saveProject(m.syncRooms(p), 0, assets); return (await s.allProjects())[0];
    });
    await page.reload(); await page.locator('#recordForm').waitFor(); await clickSurvey(page, '[data-view=report]');
    const preview = page.locator('[data-content-preview]');
    assert.equal(await preview.evaluate(el => el.parentElement.open), false);
    await preview.evaluate(el => el.parentElement.open = true);
    const common = await preview.textContent(); assert.equal(common.split('水痕由窗角向下延伸').length - 1, 1); assert.doesNotMatch(common, /部位：|細圖標註/);
    const edited = '窗角寬 0.2 mm（實測）；另處寬 0.3 mm（估計）。';
    await page.locator('[data-report-text]').fill(edited); assert((await preview.textContent()).includes(edited));
    await page.locator('[data-report-text]').fill(source.records[0].reportText);
    const output = await page.evaluate(async () => {
      const s = await import('./store.js'), report = await import('./report.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob;
      return { source: p, backup: (await b.readBundle((await b.makeBundle(p, get)).blob)).project, standard: (await report.renderAttachment(p, get, { format: 'standard' })).html, quick: (await report.renderAttachment(p, get, { format: 'quick' })).html };
    });
    assert.deepEqual(output.source, source); assert.deepEqual(output.backup, source);
    for (const format of ['standard', 'quick']) {
      const file = path.join(out, `v0.22.2-${format}.html`); await fs.writeFile(file, output[format]); const tab = await context.newPage(); await tab.goto('file:///' + file.replaceAll('\\', '/'));
      if (format === 'standard') {
        const rows = tab.locator('.row-text'); assert.equal(await rows.count(), 2);
        for (const text of await rows.allTextContents()) { assert.equal(text.split('水痕由窗角向下延伸').length - 1, 1); assert.equal(text.split('滲水痕').length - 1, 1); assert.doesNotMatch(text, /部位：|細圖標註/); }
        assert((await rows.nth(1).textContent()).includes('窗角表面痕跡。'));
        assert(await tab.locator('.sheet-content').evaluateAll(nodes => nodes.every(n => n.scrollHeight <= n.clientHeight + 1)));
        await tab.setViewportSize({ width: 1100, height: 1000 }); await tab.locator('.table-sheet').screenshot({ path: path.join(out, 'v0.22.2-photo-content.png') });
      } else {
        const description = await tab.locator('.photo-sheet .description').textContent(); assert.equal(description.split('水痕由窗角向下延伸').length - 1, 1);
        const captions = await tab.locator('figcaption').allTextContents(); assert(!captions[0].includes('水痕由窗角向下延伸')); assert(captions[1].includes('窗角表面痕跡。'));
      }
      await tab.close();
    }
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await clickSurvey(page, '[data-view=report]');
    assert.equal(await page.locator('[data-content-preview]').textContent(), common); assert.deepEqual(errors, []);
    console.log('PASS V0.22.2 concise photo content, draft preview, both attachments, unchanged backup and offline');
  } finally { await context.close(); }
}
