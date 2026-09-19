import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV012(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { await page.locator(selector).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const transform = () => page.locator('#labelStage [data-plan-label="0"]').getAttribute('transform');
  const tapAt = async (x, y) => {
    const screen = await page.locator('#labelStage svg').evaluate((svg, [x, y]) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]);
    await page.touchscreen.tap(screen.x, screen.y);
  };
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V012-SYNTHETIC', '合成箭頭編號測試', '2026-09-14'), u = m.newUnit('A 戶'); p.units.push(u);
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 900); ctx.strokeStyle = '#627a72'; ctx.lineWidth = 4; ctx.strokeRect(120, 160, 900, 540); ctx.strokeRect(120, 160, 400, 300); ctx.font = '28px sans-serif'; ctx.fillStyle = '#627a72'; ctx.fillText('SYNTHETIC PLAN', 150, 200);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), assets = [];
      const asset = async kind => { const id = m.id(); p.media.push({ id, name: 'synthetic.png', kind, size: blob.size, type: blob.type, importedAt: m.now(), sha256: await m.sha256(blob) }); assets.push({ id, blob, thumb: blob }); return id; };
      const plan = { id: m.id(), unitId: u.id, floor: '1F', title: '全層平面圖', mediaId: await asset('plan') }; p.plans.push(plan);
      for (const [i, q] of [[.2, .3, .65, .7], [.3, .4, .65, .45], [.5, .6, .25, .6]].entries()) {
        const r = m.newRecord(u.id, '1F', '客廳'); Object.assign(r, { component: '牆面', condition: 'damp', location: '合成測試 ' + i, reportText: '人工確認文字保留', placement: { planId: plan.id, x: q[0], y: q[1], endX: q[2], endY: q[3] } });
        for (let j = 0; j < (i === 0 ? 2 : 1); j++) r.photos.push({ mediaId: await asset('image'), role: j ? 'close' : 'overview', caption: '', marks: [], excluded: false, excludedReason: '', reportInclude: true }); p.records.push(r);
      }
      await s.saveProject(m.syncRooms(p), 0, assets);
    });
    await page.reload(); await page.locator('#recordForm').waitFor(); const original = await current();
    await click('[data-view=report]'); await click('#editPlanLabels');
    assert.equal(await page.locator('#labelStage [data-plan-label]').count(), 3); assert.equal(await page.locator('#labelStage [data-plan-arrow]').count(), 3);
    const initial = await transform(); await page.locator('#labelSelect').selectOption('0');
    assert.equal(await page.locator('#labelStage [data-plan-arrow="0"] path').getAttribute('stroke'), '#145ea8');
    await tapAt(900, 65); const moved = await transform(); assert.notEqual(moved, initial); assert.match(await page.locator('#labelLock').innerText(), /已鎖定/);
    await click('#labelUndo'); assert.equal(await transform(), initial); await click('#labelRedo'); assert.equal(await transform(), moved);
    await click('#labelAuto'); assert.equal(await transform(), moved);
    await click('#labelLock'); assert.equal(await page.locator('#labelLock').innerText(), '鎖定位置');
    await click('#labelAuto'); assert.notEqual(await transform(), moved); await click('#labelUndo'); await click('#labelUndo'); assert.equal(await transform(), moved);
    await tapAt(240, 270); assert(await page.locator('#saveLabelLayout').isDisabled()); assert.match(await page.locator('#labelHint').innerText(), /紅框/); await click('#labelUndo');
    assert(!(await page.locator('#saveLabelLayout').isDisabled()));
    await click('#labelZoomIn'); const zoomed = await page.locator('#labelStage svg').getAttribute('viewBox'); assert.notEqual(zoomed, '0 0 1200 900'); await click('#labelFit');
    // A real drag updates only the selected label until release.
    const label = await page.locator('#labelStage [data-plan-label="0"]').boundingBox();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2); await page.mouse.down(); await page.mouse.move(label.x + label.width / 2 - 10, label.y + label.height / 2, { steps: 5 }); await page.mouse.up();
    assert.notEqual(await transform(), moved); await click('#labelUndo'); assert.equal(await transform(), moved);
    await click('.label-fine summary'); await click('[data-label-nudge="-1,0"]'); assert.notEqual(await transform(), moved); await click('#labelUndo'); await click('.label-fine summary');
    await click('#labelPan'); const stage = await page.locator('#labelStage svg').boundingBox();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2); await page.mouse.down(); await page.mouse.move(stage.x + stage.width / 2 + 25, stage.y + stage.height / 2, { steps: 3 }); await page.mouse.up();
    assert.notEqual(await page.locator('#labelStage svg').getAttribute('viewBox'), '0 0 1200 900'); assert.equal(await transform(), moved); await click('#labelFit');
    await click('#labelMode');
    const cdp = await context.newCDPSession(page), cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 60, y: cy, id: 1 }, { x: cx + 60, y: cy, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
    const pinch = (await page.locator('#labelStage svg').getAttribute('viewBox')).split(' ').map(Number); assert(pinch[2] < 900); assert.equal(await transform(), moved); await click('#labelFit');
    for (const width of [320, 390, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      assert(await page.locator('#modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `No dialog overflow at ${width}`);
      const box = await page.locator('#labelStage').boundingBox(); assert(box.height >= 180, `Usable drawing height at ${width}`);
      await page.screenshot({ path: path.join(out, `v0.12-labels-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 }); await click('#saveLabelLayout');
    const saved = await current(); assert.deepEqual(saved.records, original.records); assert.equal(saved.plans[0].labelLayout.length, 4); assert(saved.plans[0].labelLayout[0].locked);
    await page.reload(); await click('[data-view=report]'); await click('#editPlanLabels'); assert.equal(await transform(), moved); await click('#closeModal');
    const verification = await page.evaluate(async () => {
      const s = await import('./store.js'), m = await import('./model.js'), report = await import('./report.js'), a = await import('./annotation.js'), labels = await import('./plan-labels.js'), bundle = await import('./bundle.js');
      const p = (await s.allProjects())[0], plan = p.plans[0], get = async id => (await s.getMedia(id)).blob;
      const entries = report.groupPlanEntries({ records: report.attachmentIndex(p).groups.flatMap(g => g.records) }, plan.id), before = JSON.stringify(p);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), geometry = a.drawPlanOverlay(svg, entries, 1200, 900, plan.labelLayout);
      const renumbered = report.groupPlanEntries({ records: report.attachmentIndex(p, { start: 50 }).groups.flatMap(g => g.records) }, plan.id), second = labels.planLabelGeometry(renumbered, 1200, 900, plan.labelLayout);
      const expected = await m.sha256(await a.reportPlanImage(await get(plan.mediaId), entries, plan.labelLayout)), hashes = [];
      for (const format of ['standard', 'quick']) {
        const rendered = await report.renderAttachment(p, get, { format }), doc = new DOMParser().parseFromString(rendered.html, 'text/html');
        const encoded = doc.querySelector('.plan-sheet img').src.split(',')[1]; hashes.push(await m.sha256(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
        if (JSON.stringify(rendered.index.plans[0].labelLayout) !== JSON.stringify(plan.labelLayout)) throw new Error('Export mapping lost positions');
      }
      const restored = await bundle.readBundle((await bundle.makeBundle(p, get)).blob), copy = m.restoredCopy(restored.project).project; m.validateProject(copy);
      // Changing a camera point requires review; saved label offsets never move it back.
      const changed = structuredClone(entries); changed[0].placement.x += .01; let stale = false;
      try { labels.planLabelGeometry(changed, 1200, 900, plan.labelLayout); } catch (e) { stale = /定位/.test(e.message); }
      return { expected, hashes, unchanged: before === JSON.stringify(p), stale, coordinates: geometry.labels.map(b => [b.x, b.y]), renumbered: second.labels.map(b => [b.x, b.y]), version: restored.manifest.version, isolated: copy.plans[0].labelLayout[0].id !== plan.labelLayout[0].id && copy.plans[0].labelLayout[0].recordId === plan.labelLayout[0].recordId };
    });
    assert(verification.unchanged); assert(verification.stale); assert(verification.isolated); assert.equal(verification.version, 13);
    assert.deepEqual(verification.coordinates, verification.renumbered); assert(verification.hashes.every(h => h === verification.expected));
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await click('[data-view=report]'); await click('#editPlanLabels'); assert.equal(await transform(), moved); await click('#closeModal');
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.12-result.json'), JSON.stringify({ passed: true, ...verification, errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.12 arrow avoidance, tap/drag labels, lock/undo/redo, responsive editor, identical report images, renumbering, saved/offline/backup positions');
  } finally { await context.close(); }
}
