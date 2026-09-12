import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyFieldV08Workflow(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['camera'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { await page.locator(selector).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const record = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0].records[0]);
  const tapWorld = async (x, y) => { const q = await page.locator('#sketchStage svg').evaluate((svg, [x, y]) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]); await page.touchscreen.tap(q.x, q.y); };
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    await page.evaluate(async () => { const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V08-SYNTHETIC', '合成現場操作測試', '2026-09-09'), u = m.newUnit('A 戶'), r = m.newRecord(u.id, '1F', '客廳'); p.units.push(u); p.records.push(r); Object.assign(r, { component: '牆面', condition: 'crack', location: '入口旁', measured: true, widthMode: 'exact', width: .2, length: 3 }); await s.saveProject(p, 0); });
    await page.reload(); await page.locator('#individualCracks').waitFor();
    await click('#individualCracks [data-count="3"]');
    for (const [i, values] of [[0, ['le03', '', '1.2']], [1, ['exact', '.45', '2.1']]]) {
      const card = page.locator('[data-crack-id]').nth(i); await card.evaluate(el => { el.open = true; });
      await card.locator('[data-key=measured]').check(); await card.locator('[data-key=widthMode]').selectOption(values[0]);
      if (values[1]) {
        const width = card.locator('[data-key=width]'); await width.focus(); await page.keyboard.insertText('-');
        assert.deepEqual(errors, [], 'Incomplete decimal typing must not throw from layout updates');
        await width.fill(values[1]);
      }
      await card.locator('[data-key=length]').fill(values[2]);
      await card.evaluate(el => { el.open = false; });
    }
    await page.locator('[data-crack-id]').nth(2).locator('[data-key=notes]').fill('窗角未能接近'); await click('#saveRecord');
    let r = await record(); assert.equal(r.cracks.length, 3); assert.equal(r.cracks[0].width, null); assert.equal(r.cracks[1].width, .45); assert.equal(r.cracks[2].length, null); assert.equal(r.legacyCrack.length, 3); assert.equal(r.length, null);
    await page.reload(); await page.locator('[data-crack-id]').nth(2).waitFor(); assert.match(await page.locator('#recordIssues').textContent(), /裂縫 C未量測/);
    await click('#fontSize'); assert.equal(await page.locator('#fontSize').getAttribute('aria-pressed'), 'true'); await page.reload(); await page.locator('#recordForm').waitFor(); assert(await page.locator('body').evaluate(el => el.classList.contains('large-type'))); await click('#fontSize');
    await click('#fieldPresets [data-field-preset=tile]'); await page.locator('#tileCrackCountText').selectOption('十餘塊'); await click('#saveRecord'); assert.equal((await record()).tiles.crackCount, null); assert.match(await page.locator('#tileTotal').textContent(), /不自動合計/);
    await click('#tileCrackQuantity [data-value="20"]'); await click('#tileCrackQuantity [data-step="10"]'); await click('#saveRecord'); assert.equal((await record()).tiles.crackCount, 30); assert.equal((await record()).tiles.crackText, '');
    await page.locator('#surface').selectOption(''); await click('#saveRecord'); assert.equal((await record()).cracks[1].length, 2.1);
    await click('#takePhoto'); await click('#startCamera'); await page.locator('#shutter:enabled').waitFor(); assert(await page.locator('#cameraPermission').isHidden());
    await page.setViewportSize({ width: 844, height: 390 });
    const preview = await page.locator('.camera-stage').boundingBox(); assert(preview.width > 500 && preview.height > 220);
    await page.screenshot({ path: path.join(out, 'v0.8-camera-landscape.png') });
    const dimensions = await page.locator('#cameraPreview').evaluate(v => [v.videoWidth, v.videoHeight]);
    await click('#shutter'); await page.setViewportSize({ width: 390, height: 844 }); await click('#retakeCamera'); await page.locator('#shutter:enabled').waitFor(); await click('#shutter'); await click('#saveCamera');
    const photoDimensions = await page.evaluate(async () => { const s = await import('./store.js'), p = (await s.allProjects())[0], photo = await s.getMedia(p.records[0].photos[0].mediaId), img = await createImageBitmap(photo.blob); const dims = [img.width, img.height]; img.close(); return dims; }); assert.deepEqual(photoDimensions, dimensions);
    await click('.photo-card'); await page.locator('#photoStage svg').waitFor(); await click('[data-crack-label="B"]'); await page.locator('#photoStage svg').click({ position: { x: 100, y: 100 } }); await click('#savePhoto'); assert.equal((await record()).photos[0].marks[0].text, '裂縫 B');
    await click('#quickSketch'); await page.locator('#sketchStage svg').waitFor(); assert.equal(await page.locator('#sketchHelp').evaluate(el => el.open), false);
    assert((await page.locator('#sketchStage').boundingBox()).height > 400);
    await click('[data-sketch-mode=stairs]'); assert.equal(await page.locator('#stairType option').count(), 4);
    await page.locator('#sketchSettings').evaluate(el => { el.open = true; }); await page.locator('#sketchSnap').uncheck(); await page.locator('#sketchSettings').evaluate(el => { el.open = false; });
    for (const [i, type] of ['straight', 'l', 'u', 'unequal'].entries()) {
      await page.locator('#stairType').selectOption(type); await tapWorld(100 + i * 250, 200); await tapWorld(280 + i * 250, 620);
    }
    assert.equal(await page.locator('[data-sketch-type=stairs]').count(), 4); assert.equal(await page.locator('[data-sketch-type=stairs] text').count(), 0); assert.equal(await page.locator('[data-stair-arrow]').count(), 0);
    await click('#undoSketch'); assert.equal(await page.locator('[data-sketch-type=stairs]').count(), 3); await click('#redoSketch'); assert.equal(await page.locator('[data-sketch-type=stairs]').count(), 4);
    await page.setViewportSize({ width: 844, height: 390 }); await page.screenshot({ path: path.join(out, 'v0.8-sketch-landscape.png') });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'v0.8-sketch-portrait.png') });
    await page.locator('#stairDirection').selectOption('up'); await page.locator('#stairRotation').selectOption('90'); await page.locator('#stairMirror').check(); await page.locator('#stairBreak').check(); await tapWorld(100, 660); await tapWorld(350, 810);
    assert.equal(await page.locator('[data-stair-arrow=up]').count(), 1);
    await click('#saveSketch'); await page.locator('#planStage svg').waitFor(); await click('#closeModal');
    const roundtrip = await page.evaluate(async () => { const s = await import('./store.js'), b = await import('./bundle.js'), m = await import('./model.js'), p = (await s.allProjects())[0], before = await m.sha256((await s.getMedia(p.records[0].photos[0].mediaId)).blob); const bundle = await b.readBundle((await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob); const restored = m.restoredCopy(bundle.project); m.validateProject(restored.project); return { equal: JSON.stringify(bundle.project) === JSON.stringify(p), version: bundle.manifest.version, stairs: restored.project.plans[0].sketch.strokes.length, originalHash: before, description: m.observationText(p.records[0]) }; });
    assert(roundtrip.equal); assert.equal(roundtrip.version, 6); assert.equal(roundtrip.stairs, 5); assert.match(roundtrip.description, /裂縫 B.*0.45 mm.*2.1 m/);
    await context.setOffline(true); await page.reload(); await page.locator('.photo-card img').waitFor(); assert.equal((await record()).cracks.length, 3);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'v0.8-field-result.json'), JSON.stringify({ passed: true, ...roundtrip, physicalPhoneTested: false, checkedAt: new Date().toISOString() }, null, 2));
    console.log('PASS V0.8 independent cracks, legacy group, tile quantities, font preference, camera rotation, four stairs, undo/redo, annotation and offline backup');
  } finally { await context.close(); }
}
