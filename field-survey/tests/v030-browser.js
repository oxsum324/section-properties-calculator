import assert from 'node:assert/strict';
import { clickSurvey } from './ui-click.js';
import fs from 'node:fs/promises';
import path from 'node:path';

async function signAndReturn(page) {
  await page.locator('#signoffCanvas').waitFor();
  const box = await page.locator('#signoffCanvas').boundingBox();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .35); await page.mouse.down();
  for (let i = 0; i < 18; i++) await page.mouse.move(box.x + box.width * (.1 + i * .037), box.y + box.height * (.35 + .2 * Math.sin(i / 2)));
  await page.mouse.up(); await clickSurvey(page, '#signoffSave');
  await page.locator('#signoffReturn').waitFor();
  await page.locator('#signoffReturn').hover(); await page.mouse.down(); await page.waitForTimeout(1650); await page.mouse.up();
  await page.locator('#signoffForm').waitFor();
}

export async function verifyV030(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await context.newPage(), errors = [], outbound = [];
  page.on('pageerror', e => errors.push(e.message));
  context.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) outbound.push(request.url()); });
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('SIGNOFF-TEST', '簽認合成測試', '2026-09-29');
      const u = m.newUnit('A101', '測試地址'); p.units.push(u); await s.saveProject(p, 0);
    });
    await page.reload(); await page.locator('#unitSignoff').waitFor();
    await clickSurvey(page, '#unitSignoff');
    await page.locator('#signoffForm [name=name]').fill('測試住戶');
    await clickSurvey(page, '#signoffForm button[type=submit]');
    await page.locator('#signoffCanvas').waitFor();
    assert.equal(await page.locator('#app').evaluate(el => el.inert), true, 'handoff locks the main interface');
    await clickSurvey(page, '#signoffSave');
    assert.match(await page.locator('#signoffDrawError').textContent(), /筆跡過短/);
    await page.evaluate(() => history.back()); await page.waitForTimeout(150);
    assert.equal(await page.locator('#signoffHandoff').isVisible(), true, 'browser back remains on the handoff screen');
    await signAndReturn(page);
    const result = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), b = await import('./bundle.js'), r = await import('./report.js'), signoff = await import('./signoff.js');
      const p = (await s.allProjects())[0], x = p.signoffs[0]; m.validateProject(p);
      const asset = await s.getMedia(x.signers[0].mediaId), get = async mid => (await s.getMedia(mid)).blob;
      const html = await signoff.signoffHTML(p, x, s.getMedia), png = await signoff.signoffPNG(p, x, s.getMedia);
      const many = { ...x, signers: Array.from({ length: 5 }, (_, i) => ({ ...x.signers[0], id: m.id(), name: `簽署人 ${i + 1}` })) };
      const manyHtml = await signoff.signoffHTML(p, many, s.getMedia), manyPNGs = await signoff.signoffPNGs(p, many, s.getMedia);
      const attachment = await r.renderAttachment(p, get, { format: 'standard', includeEmpty: true, includeSignoffs: true });
      const multiProject = structuredClone(p); multiProject.signoffs[0].signers = many.signers; multiProject.signoffs[0].snapshotHash = await m.signoffHash(multiProject, multiProject.signoffs[0]);
      const multiAttachment = await r.renderAttachment(multiProject, get, { format: 'standard', includeEmpty: true, includeSignoffs: true });
      const backup = await b.readBundle((await b.makeBundle(p, get)).blob);
      return { html, signers: x.signers.length, kind: asset.blob.type, imageSize: asset.blob.size, pngSize: png.size, multiPages: (manyHtml.match(/class="sheet"/g) || []).length, multiPNGs: manyPNGs.length, multiAttachmentPages: multiAttachment.index.sections.filter(x => x.type === 'signoff-sheet').length, meta: html.includes('condition-survey-private" content="signoff"'), attachment: attachment.html.includes('signoff-sheet'), sections: attachment.index.sections.map(x => x.type), backupVersion: backup.manifest.version, equal: JSON.stringify(backup.project) === JSON.stringify(p) };
    });
    assert.equal(result.signers, 1); assert.equal(result.kind, 'image/png'); assert(result.imageSize > 0 && result.pngSize > 0);
    assert.equal(result.multiPages, 3); assert.equal(result.multiPNGs, 3); assert.equal(result.multiAttachmentPages, 2);
    assert(result.meta && result.attachment && result.sections.includes('signoff-sheet'));
    assert.equal(result.backupVersion, 17); assert(result.equal);
    await page.locator('#signoffForm [name=role]').selectOption('surveyor');
    await page.locator('#signoffForm [name=name]').fill('甲技師');
    await clickSurvey(page, '#signoffForm button[type=submit]'); await signAndReturn(page);
    await page.locator('#signoffForm [name=role]').selectOption('resident');
    await page.locator('#signoffForm [name=signerStatus]').selectOption('refused');
    await page.locator('#signoffForm [name=name]').fill('乙住戶');
    await page.locator('#signoffForm [name=signerReason]').fill('當場表示不簽');
    await clickSurvey(page, '#signoffForm button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.signoff-existing .panel').length === 3);
    await page.locator('#signoffForm [name=role]').selectOption('contractor');
    await page.locator('#signoffForm [name=signerStatus]').selectOption('paper');
    await page.locator('#signoffForm [name=name]').fill('施工代表');
    await page.locator('#signoffForm [name=paper]').setInputFiles({ name: '紙本.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64') });
    await clickSurvey(page, '#signoffForm button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.signoff-existing .panel').length === 4);
    page.once('dialog', dialog => dialog.accept('資料誤植'));
    await page.locator('.signoff-existing [data-void-signer]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.signoff-existing .panel').length === 3);
    const variants = await page.evaluate(async () => {
      const s = await import('./store.js'), p = (await s.allProjects())[0], x = p.signoffs[0];
      return { total: x.signers.length, voided: x.signers.filter(y => y.voided).length, refused: x.signers.find(y => y.status === 'refused')?.attestedBy === x.signers.find(y => y.role === 'surveyor')?.id, paper: p.media.find(m => m.id === x.signers.find(y => y.status === 'paper')?.mediaId)?.kind };
    });
    assert.deepEqual(variants, { total: 4, voided: 1, refused: true, paper: 'image' });
    await clickSurvey(page, '#closeModal');
    await clickSurvey(page, '#bottomNav [data-view="case"]');
    await clickSurvey(page, '#signoffSettingsButton');
    await page.locator('#signoffSettings [name=allowProfileSignature]').check();
    await clickSurvey(page, '#signoffSettings button[type=submit]');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    await clickSurvey(page, '#signoffSettingsButton');
    await clickSurvey(page, '#saveSignatureProfile');
    await page.locator('#signoffSettings').waitFor();
    await clickSurvey(page, '#closeModal');
    await clickSurvey(page, '#caseSignoff');
    await page.locator('#signoffForm [name=role]').selectOption('surveyor');
    await page.locator('#signoffForm [name=name]').fill('甲技師');
    await page.locator('#signoffForm [name=useProfile]').check();
    await clickSurvey(page, '#signoffForm button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.signoff-existing .panel').length === 4);
    await clickSurvey(page, '#closeModal');
    await clickSurvey(page, '#visitSignoff');
    await page.locator('#signoffForm [name=name]').fill('監造代表');
    await page.locator('#signoffForm [name=role]').selectOption('supervisor');
    await clickSurvey(page, '#signoffForm button[type=submit]'); await signAndReturn(page);
    const batch = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = (await s.allProjects())[0]; m.validateProject(p);
      const unit = p.signoffs.find(x => x.level === 'unit'), visit = p.signoffs.find(x => x.level === 'visit');
      return { profile: unit.signers.some(y => y.source === 'profile' && y.role === 'surveyor'), visit: visit.signers.some(y => y.role === 'supervisor' && y.status === 'signed') };
    });
    assert.deepEqual(batch, { profile: true, visit: true });
    await clickSurvey(page, '#closeModal');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `no horizontal scroll at ${width}px`);
    }
    if (out) {
      await fs.mkdir(out, { recursive: true });
      await fs.writeFile(path.join(out, 'v0.30-signoff-preview.html'), result.html);
      const preview = await context.newPage(); await preview.setViewportSize({ width: 900, height: 1300 });
      await preview.setContent(result.html); await preview.screenshot({ path: path.join(out, 'v0.30-signoff-preview.png'), fullPage: true }); await preview.close();
    }
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    console.log('PASS V0.30 touch signoff, private standalone output, PNG, standard attachment pages and backup');
  } finally { await context.close(); }
}
