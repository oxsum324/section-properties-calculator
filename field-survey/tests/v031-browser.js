import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clickSurvey } from './ui-click.js';

export async function verifyV031(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), sign = await import('./signoff.js');
      const p = m.newProject('REV-BROWSER', '簽認修訂合成測試', '2026-10-25'), u = m.newUnit('公設', '原門牌'); u.kind = 'public'; p.units.push(u);
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60; canvas.getContext('2d').fillRect(0, 0, 80, 60);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), mid = m.id();
      p.media.push({ id: mid, kind: 'image', name: 'synthetic.png', type: blob.type, size: blob.size, sha256: await m.sha256(blob), importedAt: m.now() });
      for (const floor of ['1F', '2F']) {
        const r = m.newRecord(u.id, floor, '大廳'); r.visitId = p.visits[0].id; r.observedOn = p.date; r.condition = 'normal';
        r.photos.push({ mediaId: mid, role: 'overview', caption: '', marks: [], excluded: false, excludedReason: '' }); p.records.push(r);
      }
      m.syncRooms(p);
      const x = sign.proposedSignoff(p, u.id, p.visits[0].id); x.scope = '原會勘範圍';
      x.signers.push({ id: m.id(), role: 'management', group: 'resident', name: '原簽署人', org: '', title: '', relation: '', status: 'paper', reason: '', signedAt: m.now(), timeZone: 'Asia/Taipei', source: 'live', mediaId: mid });
      await sign.sealSignoff(p, x); p.signoffs.push(x); await s.saveProject(p, 0, [{ id: mid, blob }]);
    });
    await page.reload(); await page.locator('#unitSignoff').waitFor();
    const boundary = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = (await s.allProjects())[0], hash = p.signoffs[0].snapshotHash;
      const overwrite = m.clone(p); overwrite.signoffs[0].scope = '直接覆寫'; let refused = false;
      try { await s.saveProject(overwrite, p.revision); } catch { refused = true; }
      const signer = m.clone(p); signer.signoffs[0].signers[0].name = '移用原簽章'; signer.signoffs[0].snapshotHash = await m.signoffHash(signer, signer.signoffs[0]); let signerRefused = false;
      try { await s.saveProject(signer, p.revision); } catch { signerRefused = true; }
      return { refused, signerRefused, unchanged: (await s.getProject(p.id)).signoffs[0].snapshotHash === hash };
    });
    assert.deepEqual(boundary, { refused: true, signerRefused: true, unchanged: true });
    await clickSurvey(page, '#unitSignoff');
    await page.locator('#signoffForm [name=scope]').fill('兩層公設重新確認');
    await page.locator('#signoffForm [name=signerStatus]').selectOption('paper');
    await page.locator('#signoffForm [name=name]').fill('新版簽署人');
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await page.locator('#signoffForm [name=paper]').setInputFiles({ name: '紙本簽認.png', mimeType: 'image/png', buffer: png });
    await clickSurvey(page, '#signoffForm button[type=submit]');
    await page.waitForFunction(async () => ((await (await import('./store.js')).allProjects())[0].signoffs.length === 2));
    const revision = await page.evaluate(async () => {
      const p = (await (await import('./store.js')).allProjects())[0], [old, next] = p.signoffs;
      return { oldScope: old.scope, oldSigner: old.signers[0].name, newScope: next.scope, newSigners: next.signers.map(y => y.name), linked: next.revisionOf === old.id };
    });
    assert.deepEqual(revision, { oldScope: '原會勘範圍', oldSigner: '原簽署人', newScope: '兩層公設重新確認', newSigners: ['新版簽署人'], linked: true });
    await page.locator('#signoffForm [name=signerStatus]').selectOption('refused');
    await page.locator('#signoffForm [name=name]').fill('拒簽住戶');
    await page.locator('#signoffForm [name=signerReason]').fill('本次拒簽');
    await clickSurvey(page, '#signoffForm button[type=submit]');
    assert.match(await page.locator('#modalError').textContent(), /本版簽名/);
    await clickSurvey(page, '#closeModal');
    const output = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), report = await import('./report.js'), sign = await import('./signoff.js'), b = await import('./bundle.js');
      const p = (await s.allProjects())[0], u = p.units[0], get = async mid => (await s.getMedia(mid)).blob;
      const opts = { includeSignoffs: true, publicByFloor: true, toc: true, maxPages: 2 };
      const full = await report.renderAttachment(p, get, opts);
      const plan = await report.prepareVolumes(p, opts), pages = [];
      const contents = await report.masterContentsHTML(plan);
      for (const volume of plan.volumes) {
        const result = await report.renderPlannedVolume(p, get, plan, volume.number);
        pages.push(...result.index.sections);
      }
      const current = await sign.exportSignoff(p, u.id), pngs = await sign.signoffPNGs(p, current, s.getMedia);
      const bundle = await b.readBundle((await b.makeBundle(p, get, u.id)).blob);
      const copy = m.restoredCopy(bundle.project).project; await m.rebaseSignoffs(copy, bundle.project); m.validateProject(copy);
      return {
        signoffPages: full.index.sections.filter(x => x.type === 'signoff-sheet').length,
        volumeCount: plan.volumes.length,
        volumeSignoffPages: pages.filter(x => x.type === 'signoff-sheet').length,
        pageCountMatches: pages.length === full.index.sections.length,
        contentsPages: new DOMParser().parseFromString(contents, 'text/html').querySelectorAll('.toc-sheet').length > 0,
        fullContents: new DOMParser().parseFromString(full.html, 'text/html').querySelectorAll('.toc-sheet').length > 0,
        coversFloors: full.html.includes('涵蓋樓層：1F、2F'),
        oldNameAbsent: !full.html.includes('原簽署人'),
        signaturePNG: pngs.every(blob => blob.size > 0 && blob.type === 'image/png'),
        restoredSnapshot: JSON.stringify(copy.signoffs[1].signedContent) === JSON.stringify(p.signoffs[1].signedContent),
        restoredUnchanged: !await sign.signoffChanged(copy, copy.signoffs[1]),
        revisionLink: copy.signoffs[1].revisionOf === copy.signoffs[0].id
      };
    });
    assert.equal(output.signoffPages, 1); assert(output.volumeCount >= 2); assert.equal(output.volumeSignoffPages, 1);
    for (const key of ['pageCountMatches', 'contentsPages', 'fullContents', 'coversFloors', 'oldNameAbsent', 'signaturePNG', 'restoredSnapshot', 'restoredUnchanged', 'revisionLink']) assert.equal(output[key], true, key);
    await clickSurvey(page, '#bottomNav [data-view="report"]');
    await clickSurvey(page, '#previewReport');
    await page.locator('#attachmentPreview').waitFor();
    const numberingSaved = await page.evaluate(async () => ((await (await import('./store.js')).allProjects())[0].attachmentNumberingHistory || []).length > 0);
    assert(numberingSaved); await clickSurvey(page, '#closeModal');
    const latest = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), sign = await import('./signoff.js'), report = await import('./report.js'), p = (await s.allProjects())[0], u = p.units[0];
      const v = { id: m.id(), name: '新一輪會勘', start: '2026-10-26', end: '2026-10-26' }; p.visits.push(v);
      const r = m.newRecord(u.id, '2F', '大廳'); r.visitId = v.id; r.observedOn = v.start; p.records.push(r); m.syncRooms(p);
      await s.saveProject(p, p.revision);
      const x = await sign.exportSignoff(p, u.id), html = await sign.signoffHTML(p, x, s.getMedia);
      const attachment = await report.renderAttachment(p, async mid => (await s.getMedia(mid)).blob, { includeSignoffs: true, publicByFloor: true });
      return { latestVisit: x.visitId === v.id, unsigned: x.signers.length === 0, standalone: html.includes('本次尚未簽認') && !html.includes('新版簽署人'), attachment: attachment.html.includes('本次尚未簽認') && !attachment.html.includes('新版簽署人') };
    });
    assert.deepEqual(latest, { latestVisit: true, unsigned: true, standalone: true, attachment: true });
    const migration = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), b = await import('./bundle.js'), sign = await import('./signoff.js'), p = (await s.allProjects())[0];
      const get = async mid => (await s.getMedia(mid)).blob;
      const backup = await b.readBundle((await b.makeBundle(p, get)).blob);
      const restoredCopy = m.restoredCopy(backup.project), copy = restoredCopy.project; await m.rebaseSignoffs(copy, backup.project);
      await s.saveProject(copy, 0, backup.media.map(a => ({ ...a, id: restoredCopy.remap.get(a.id) })));
      const restored = await s.getProject(copy.id);
      let oldWriterRefused = false;
      await new Promise(resolve => { const req = indexedDB.open('condition-survey-v1', 18); req.onerror = () => { oldWriterRefused = req.error.name === 'VersionError'; resolve(); }; req.onsuccess = () => { req.result.close(); resolve(); }; });
      const legacy = m.clone(restored);
      for (const x of legacy.signoffs) { delete x.signedContent; delete x.contentDigest; delete x.comparisonIdentity; x.snapshotHash = await m.signoffHash(legacy, x); }
      const legacyBundle = await b.readBundle((await b.makeBundle(legacy, async mid => (await s.getMedia(mid)).blob)).blob);
      const oldCopy = m.restoredCopy(legacyBundle.project); await m.rebaseSignoffs(oldCopy.project, legacyBundle.project);
      await s.saveProject(oldCopy.project, 0, legacyBundle.media.map(a => ({ ...a, id: oldCopy.remap.get(a.id) })));
      const last = oldCopy.project.signoffs.at(-1), html = await sign.signoffHTML(oldCopy.project, last, s.getMedia);
      return { changedHistoryRestored: restored.signoffs[1].revisionOf === restored.signoffs[0].id, oldWriterRefused, legacyRetained: oldCopy.project.signoffs[0].signers[0].name === '原簽署人', noLegacyNotice: !/舊版簽認|無法完整核對|追溯不足/.test(html) };
    });
    assert.deepEqual(migration, { changedHistoryRestored: true, oldWriterRefused: true, legacyRetained: true, noLegacyNotice: true });
    assert.deepEqual(errors, []);
    if (out) await fs.writeFile(path.join(out, 'v0.31-result.json'), JSON.stringify({ passed: true, boundary, revision, output, numberingSaved, latest, migration, errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.31 immutable signing revisions, storage refusal, original identity, latest unsigned visit, public floors and split volumes, HTML and PNG, scoped restore');
  } finally { await context.close(); }
}
