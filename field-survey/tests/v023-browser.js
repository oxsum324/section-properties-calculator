import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV023(browser, base, out) {
  const sender = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const receiver = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await sender.newPage(), other = await receiver.newPage(), errors = [];
  for (const p of [page, other]) p.on('pageerror', e => errors.push(e.message));
  const selectColleagueFiles = async files => {
    // Follow the visible, enabled entry point. Setting a hidden input directly can
    // dispatch while the preceding navigation is still busy and intentionally inert.
    await other.locator('#busy').waitFor({ state: 'hidden' });
    const chooser = other.waitForEvent('filechooser');
    await other.locator('#mergeBundles').click(); await (await chooser).setFiles(files);
    await other.locator('#busy').waitFor({ state: 'hidden' });
  };
  try {
    const checkFolderLink = async locator => {
      assert(await locator.isVisible());
      assert.equal(await locator.getAttribute('href'), 'https://drive.google.com/drive/folders/1jwhulKJvNKLTRFoA1a5rw-PKIN9_5g7J');
      assert.equal(await locator.getAttribute('target'), '_blank');
      assert.match(await locator.getAttribute('rel'), /noopener/);
    };
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    await checkFolderLink(page.locator('#welcome .cloud-folder-link'));
    await page.locator('#welcomeImport').click();
    await checkFolderLink(page.locator('#modalBody .cloud-folder-link'));
    const cancelled = page.waitForEvent('filechooser'); await page.locator('#chooseLocalCaseFile').click();
    await (await cancelled).setFiles([]);
    assert(await page.locator('#chooseLocalCaseFile').isVisible());
    await page.locator('#closeModal').click();
    const sourceId = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js');
      const p = m.newProject('HANDOFF', '整案跨裝置測試（合成資料）', '2026-09-20'), u = m.newUnit('A戶'), r = m.newRecord(u.id, '1F', '客廳');
      p.units.push(u); p.records.push(r);
      r.component = '牆面'; r.condition = 'damp'; r.notes = '窗角水痕';
      r.detail = { kind: 'preset', preset: 'wall', mirror: false, note: '保留可編輯細圖', marks: [{ type: 'text', text: '窗角', points: [{ x: .4, y: .4 }] }] };
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
      const blob = await new Promise(resolve => canvas.toBlob(resolve)), mid = m.id();
      p.media.push({ id: mid, name: '合成照片.png', kind: 'image', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
      r.photos.push({ mediaId: mid, role: 'overview', caption: '原照片說明', marks: [], excluded: false, excludedReason: '' });
      await s.saveProject(m.syncRooms(p), 0, [{ id: mid, blob }]); return p.id;
    });
    await page.reload(); await page.locator('[data-view=case]').click();
    await checkFolderLink(page.locator('#backupView .cloud-folder-link'));
    await page.locator('#readBackup').click();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await checkFolderLink(page.locator('#modalBody .cloud-folder-link'));
      assert(await page.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth + 1));
      await page.screenshot({ path: path.join(out, `v0.24.1-open-cloud-${width}.png`) });
    }
    await page.locator('#closeModal').click();
    await page.locator('#prepareHandoff').click(); await page.locator('#downloadHandoff').waitFor();
    await checkFolderLink(page.locator('#modalBody .cloud-folder-link'));
    assert.match(await page.locator('#modalBody').textContent(), /文字說明.*照片.*錄音/);
    assert.equal(await page.locator('#modalBody a').getAttribute('href'), 'https://drive.google.com/drive/folders/1jwhulKJvNKLTRFoA1a5rw-PKIN9_5g7J');
    const download = page.waitForEvent('download'); await page.locator('#downloadHandoff').click();
    const file = path.join(out, 'v0.23.0-whole-case.csurvey'); await (await download).saveAs(file);
    assert((await fs.stat(file)).size > 0);
    assert.match(await page.locator('#handoffStatus').textContent(), /確認檔案保存完成/);
    await page.screenshot({ path: path.join(out, 'v0.23.0-phone-handoff.png') });
    await page.locator('#closeModal').click();

    await other.goto(base); await other.locator('#contextStrip').waitFor();
    await other.locator('#welcomeImport').click();
    const chooser = other.waitForEvent('filechooser'); await other.locator('#chooseLocalCaseFile').click();
    await (await chooser).setFiles(file); await other.locator('#restoreBundle').click();
    await other.waitForFunction(() => document.querySelector('#modal').open === false && document.querySelector('#caseSelect').value !== '');
    const restored = await other.evaluate(async () => {
      const s = await import('./store.js'), m = await import('./model.js'); const p = (await s.allProjects())[0];
      return { p, hash: await m.sha256((await s.getMedia(p.media[0].id)).blob) };
    });
    assert.notEqual(restored.p.id, sourceId); assert.equal(restored.p.records[0].notes, '窗角水痕');
    assert.equal(restored.p.records[0].detail.marks[0].text, '窗角'); assert.equal(restored.hash, restored.p.media[0].sha256);
    // Continue actual editing after opening the complete case in an isolated browser.
    await other.locator('[data-view=work]').click(); await other.locator('#notes').fill('另一台電腦繼續編輯');
    await other.locator('[data-view=case]').click();
    await other.waitForFunction(async () => (await (await import('./store.js')).allProjects())[0].records[0].notes === '另一台電腦繼續編輯');
    const colleague = await other.evaluate(async () => {
      const s = await import('./store.js'), b = await import('./bundle.js');
      const p = (await s.allProjects())[0]; p.records[0].notes = '同事不同的觀察';
      const { blob } = await b.makeBundle(p, async id => (await s.getMedia(id)).blob);
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const second = path.join(out, 'v0.23.0-colleague.csurvey'); await fs.writeFile(second, Buffer.from(colleague));
    await selectColleagueFiles([second, second]);
    await other.locator('[data-handoff-label="0"]').fill('乙同事'); await other.locator('#confirmConsolidate').click();
    await other.waitForFunction(async () => (await (await import('./store.js')).allProjects()).length === 2);
    const combined = await other.evaluate(async () => {
      const s = await import('./store.js'), all = await s.allProjects();
      return { all, merged: all.find(p => p.name.endsWith('（彙整）')) };
    });
    assert.equal(combined.merged.records.length, 2); assert.equal(combined.merged.units.length, 2);
    assert.equal(combined.merged.records[0].notes, '另一台電腦繼續編輯'); assert.equal(combined.merged.records[1].notes, '同事不同的觀察');
    assert(combined.merged.units[1].code.includes('乙同事')); assert.equal(combined.merged.handoffImports.length, 1);
    assert.equal(combined.all.find(p => p.id === restored.p.id).records.length, 1);
    await other.locator('[data-view=case]').click(); await other.locator('#backupAdvanced').evaluate(el => el.open = true); await other.locator('#handoffHistory').waitFor();
    await selectColleagueFiles(second); await other.locator('#confirmConsolidate').click();
    await other.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal(await other.evaluate(async () => (await (await import('./store.js')).allProjects()).length), 2);
    // Corrupt input must not create even a partial combined project.
    await selectColleagueFiles({ name: 'damaged.csurvey', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
    await other.locator('#errorBar').waitFor();
    assert.equal(await other.evaluate(async () => (await (await import('./store.js')).allProjects()).length), 2);
    await other.locator('#dismissError').click();
    for (const width of [320, 390, 1200]) {
      await other.setViewportSize({ width, height: 900 });
      assert(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await other.locator('#backupView').screenshot({ path: path.join(out, `v0.23.0-backup-${width}.png`) });
    }
    // Native save/share APIs are simulated here; this is not physical-device/cloud proof.
    await page.evaluate(() => {
      window.nativeCalls = [];
      window.showSaveFilePicker = async () => { nativeCalls.push(['picker', navigator.userActivation.isActive]); return { createWritable: async () => ({ write: async blob => nativeCalls.push(['write', blob.size]), close: async () => nativeCalls.push(['close']), abort: async () => {} }) }; };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => nativeCalls.push(['share', navigator.userActivation.isActive, files[0].name]) });
    });
    await page.locator('#prepareHandoff').click(); await page.locator('#saveHandoff').click();
    await page.waitForFunction(() => document.querySelector('#handoffStatus').textContent.includes('已寫入'));
    await page.locator('#shareHandoff').click(); await page.waitForFunction(() => document.querySelector('#handoffStatus').textContent.includes('系統分享'));
    const calls = await page.evaluate(() => nativeCalls); assert.deepEqual(calls[0], ['picker', true]); assert.equal(calls.at(-1)[0], 'share'); assert.equal(calls.at(-1)[1], true);
    await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
    await page.locator('#saveHandoff').click(); await page.waitForFunction(() => document.querySelector('#handoffStatus').textContent.includes('已取消'));
    await page.locator('#closeModal').click();
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒');
    await sender.setOffline(true); await page.reload(); await page.locator('[data-view=case]').click(); await page.locator('#prepareHandoff').click(); await page.locator('#downloadHandoff').waitFor();
    await page.locator('#closeModal').click(); await page.locator('#readBackup').click();
    const offlinePicker = page.waitForEvent('filechooser'); await page.locator('#chooseLocalCaseFile').click();
    await (await offlinePicker).setFiles(file); await page.locator('#restoreBundle').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS V0.23 complete-case handoff across isolated browsers, continued edits, consolidation, duplicate/corrupt imports, responsive/offline UI; native APIs simulated; shared folder entries, file picker cancellation/retry, offline open verified');
  } finally { await sender.close(); await receiver.close(); }
}
