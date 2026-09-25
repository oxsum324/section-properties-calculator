import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV029(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const source = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js');
      const p = m.newProject('TEXT-029', '照片為主的附件測試（合成資料）', '2026-09-25'), u = m.newUnit('A戶');
      p.units.push(u);
      const first = m.newRecord(u.id, '1F', '客廳');
      Object.assign(first, { component: '牆面', condition: 'crack', location: '位置不確定', widthMode: 'range0103', crackLayer: 'unknown', notes: '疑似結構體裂縫。', detail: { kind: 'preset', preset: 'flatCeiling', mirror: false, note: '狀況待確認。', marks: [] } });
      first.reportText = m.observationText(first);
      const second = m.newRecord(u.id, '樓層不明', '空間不清楚');
      Object.assign(second, { reportText: '疑似白華。', notes: '未確認。', location: '位置未確定' });
      const third = m.newRecord(u.id, '2F', '浴廁');
      Object.assign(third, { component: '牆面', condition: 'tileBroken', location: '門旁', observedOn: '2026-09-25', notes: '相鄰牆面未見滲水。', tiles: { crack: false, broken: true, approx: false, crackCount: null, brokenCount: null, overlapCount: null } });
      third.conditions = ['tileBroken', 'damp', 'salt'];
      third.areas = { damp: { value: 2.5, method: 'measured' }, salt: { value: 1.2, method: 'estimated' } };
      const fourth = m.newRecord(u.id, '2F', '臥室');
      Object.assign(fourth, { component: '牆面', condition: 'crack', location: '窗旁', widthMode: 'le03' });
      fourth.reportText = m.observationText(fourth);
      p.records.push(first, second, third, fourth);
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 400, 300); ctx.fillStyle = '#222'; ctx.font = '24px sans-serif'; ctx.fillText('SYNTHETIC PHOTO', 40, 150);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), assets = [];
      for (const [i, r] of p.records.entries()) {
        const id = m.id(); assets.push({ id, blob, thumb: blob });
        p.media.push({ id, name: `sample-${i}.png`, kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
        r.photos.push({ mediaId: id, role: 'close', caption: i === 0 ? '近照：疑似表面裂隙。' : i === 1 ? '照片模糊。' : i === 2 ? '近照：門旁磁磚表面。' : '位置全景（主要照片）：窗旁裂隙。', marks: [], excluded: false, excludedReason: '' });
        r.mainPhotoId = id;
      }
      await s.saveProject(m.syncRooms(p), 0, assets); return (await s.allProjects())[0];
    });
    await page.reload(); await page.locator('#recordForm').waitFor(); await clickSurvey(page, '[data-view=report]');
    const preview = page.locator('[data-content-preview]');
    const expected = '客廳 · 牆面：裂隙；裂縫寬度約 0.1～0.3 mm。';
    assert.equal(await preview.textContent(), expected);
    assert.equal(await page.locator('[data-photo-content-caption]').textContent(), '');
    assert.equal(await page.locator('[data-report-text]').inputValue(), source.records[0].reportText, 'Raw editable source remains available');
    await preview.evaluate(el => el.parentElement.open = true);
    const draft = '東牆可見裂隙。\n以上位置尚未確認。';
    await page.locator('[data-report-text]').fill(draft); assert.equal(await preview.textContent(), '', 'A later qualifier cannot leave an asserted first sentence');
    await page.locator('[data-report-text]').fill('窗角裂縫寬 0.4 mm（實測）。');
    assert.match(await preview.textContent(), /窗角裂縫寬 0.4 mm（實測）/);
    await page.locator('[data-report-text]').fill(source.records[0].reportText);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('[data-content-preview]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `v0.29-preview-${width}.png`) });
    }
    const result = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), b = await import('./bundle.js'), report = await import('./report.js');
      const p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob, outputs = {};
      for (const format of ['standard', 'quick']) outputs[format] = (await report.renderAttachment(p, get, { format })).html;
      const empty = m.clone(p);
      empty.records = Array.from({ length: 80 }, (_, i) => ({ ...m.clone(p.records[1]), id: m.id(), fieldNumber: i + 1 }));
      const emptyDoc = new DOMParser().parseFromString((await report.renderAttachment(empty, get, { format: 'standard', tableRows: 0 })).html, 'text/html');
      const emptyRows = { numbers: [...emptyDoc.querySelectorAll('tr[data-photo-number]')].map(row => row.dataset.photoNumber), pages: emptyDoc.querySelectorAll('.table-sheet').length, content: [...emptyDoc.querySelectorAll('.row-text')].map(cell => cell.textContent) };
      return { source: p, backup: (await b.readBundle((await b.makeBundle(p, get)).blob)).project, issues: m.recordIssues(p.records[0]), outputs, emptyRows };
    });
    assert.deepEqual(result.source, source); assert.deepEqual(result.backup, source); assert(result.issues.length > 0);
    assert(result.emptyRows.pages > 1); assert.equal(result.emptyRows.numbers.length, 80); assert.equal(new Set(result.emptyRows.numbers).size, 80); assert(result.emptyRows.content.every(text => text === ''));
    for (const [format, html] of Object.entries(result.outputs)) {
      const file = path.join(out, `v0.29-${format}.html`); await fs.writeFile(file, html);
      const tab = await context.newPage(); await tab.goto('file:///' + file.replaceAll('\\', '/'));
      const text = await tab.locator('body').innerText();
      assert.doesNotMatch(text, /不確定|不清楚|未確定|未確認|待確認|未量測|未填|塊數未記|尚未定位|疑似|照片模糊|樓層不明/);
      assert(text.includes(expected)); assert(text.includes('磁磚破損')); assert(text.includes('未見滲水')); assert(text.includes('2026-09-25'));
      assert(text.includes('滲水痕面積 2.5 m²')); assert(text.includes('白華面積約 1.2 m²')); assert(text.includes('0.3 mm 以下')); assert(text.includes('窗旁裂隙。'));
      assert.doesNotMatch(text, /近照|位置全景|量尺照|主(?:要)?照片|（實測）|（估計）|（≤0.3）/);
      if (format === 'standard') {
        assert.equal(await tab.locator('tr[data-photo-number]').count(), 4, 'Photos with empty prose still receive rows');
        assert.equal(await tab.locator('.photos img').count(), 4);
        assert.equal(await tab.locator('tr[data-photo-number="002"] td').nth(1).textContent(), '');
        assert.equal(await tab.locator('tr[data-photo-number="002"] td').nth(2).textContent(), '');
        assert.equal(await tab.locator('tr[data-photo-number="002"] .row-text').textContent(), '');
        assert(await tab.locator('.sheet-content').evaluateAll(nodes => nodes.every(n => n.scrollHeight <= n.clientHeight + 1)));
        await tab.setViewportSize({ width: 1000, height: 1100 });
        await tab.locator('.table-sheet').first().screenshot({ path: path.join(out, 'v0.29-table.png') });
        await tab.pdf({ path: path.join(out, 'v0.29-standard.pdf'), preferCSSPageSize: true, printBackground: true });
      } else {
        assert.equal(await tab.locator('.photo-sheet .photos img').count(), 4);
        assert.equal(await tab.locator('.photo-sheet .description').nth(1).textContent(), '');
      }
      await tab.close();
    }
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await clickSurvey(page, '[data-view=report]');
    assert.equal(await page.locator('[data-content-preview]').textContent(), expected); assert.deepEqual(errors, []);
    console.log('PASS V0.29 concise attachment prose, area precision, single width bounds, role-free captions, empty photo rows, both printed formats, unchanged backup/reminders, mobile and offline');
  } finally { await context.close(); }
}
