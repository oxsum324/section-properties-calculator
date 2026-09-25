import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const ascii = s => [...s].map(c => c.charCodeAt(0)), u16 = v => [v & 255, v >> 8], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
// Splice a minimal APP1/EXIF segment (DateTimeOriginal only) into a real JPEG so the photo still decodes.
function jpegWithExif(jpeg, dateText) {
  const tiff = [...ascii('II'), ...u16(42), ...u32(8), ...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0), ...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0), ...ascii(dateText.padEnd(19, ' ').slice(0, 19)), 0];
  const app1 = [...ascii('Exif'), 0, 0, ...tiff], size = app1.length + 2;
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xFF, 0xE1, size >> 8, size & 255, ...app1]), jpeg.subarray(2)]);
}
export async function verifyV020(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const click = selector => clickSurvey(page, selector);
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const text = selector => page.locator(selector).textContent();
  const choose = async files => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#pickPhotos').click()]); await chooser.setFiles(files); await idle(); };
  const tapStage = async (x, y) => { const b = await page.locator('#detailStage svg').boundingBox(); await page.mouse.click(b.x + b.width * x, b.y + b.height * y); await page.waitForTimeout(80); };
  const scan = (pixels, test) => { for (let i = 0; i < pixels.length; i += 4) if (test(pixels[i], pixels[i + 1], pixels[i + 2])) return true; return false; };
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V020', '戳記與線色測試', '2026-09-19'), u = m.newUnit('A戶'), r = m.newRecord(u.id, '2F', '客廳');
      Object.assign(r, { location: '窗角', component: '牆面', components: ['牆面'], condition: 'crack', conditions: ['crack', 'damp'], crackPattern: 'network' }); p.units.push(u); p.records.push(r);
      await s.saveProject(m.syncRooms(p), 0, []); return { id: p.id, record: r.id };
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    // A JPEG with EXIF supplies the capture date; the record date follows it. A plain file falls back to its file date.
    const jpeg = Buffer.from(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const ctx = c.getContext('2d'); ctx.fillStyle = '#c9d6c2'; ctx.fillRect(0, 0, 640, 480); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); return [...new Uint8Array(await b.arrayBuffer())]; }));
    await choose([{ name: 'exif.jpg', mimeType: 'image/jpeg', buffer: jpegWithExif(jpeg, '2026:09:19 10:20:30') }]);
    let project = await current(); let [first] = project.records[0].photos;
    assert.equal(first.capturedOn, '2026-09-19'); assert.equal(first.captureSource, 'exif'); assert.equal(first.stamp, '2026-09-19'); assert.equal(first.stampHidden, false);
    assert.equal(project.records[0].observedOn, '2026-09-19'); assert.match(await text('#recordDateSummary'), /2026-09-19/);
    const png = Buffer.from(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const ctx = c.getContext('2d'); ctx.fillStyle = '#dfcbb9'; ctx.fillRect(0, 0, 800, 600); const b = await new Promise(r => c.toBlob(r, 'image/png')); return [...new Uint8Array(await b.arrayBuffer())]; }));
    await choose([{ name: 'plain.png', mimeType: 'image/png', buffer: png }]);
    project = await current(); const second = project.records[0].photos[1];
    assert.equal(second.captureSource, 'file'); assert.match(second.capturedOn, /^\d{4}-\d{2}-\d{2}$/); assert.equal(second.stamp, second.capturedOn + '（檔案日期）');
    assert.equal(project.records[0].observedOn, '2026-09-19', 'a later photo never overwrites the adopted record date');
    // The photo dialog previews the stamp, lets it be edited or hidden, and colours marks by tone.
    await click('.photo-card >> nth=1'); await page.locator('#photoStage svg').waitFor();
    assert.equal(await page.locator('#photoStamp').inputValue(), second.stamp); assert.equal(await text('#photoStage svg [data-stamp]'), second.stamp);
    await page.locator('#photoStamp').fill('2026-09-18'); await page.locator('#photoStamp').dispatchEvent('input'); assert.equal(await text('#photoStage svg [data-stamp]'), '2026-09-18');
    await page.locator('#photoStampHidden').check(); assert.equal(await page.locator('#photoStage svg [data-stamp]').count(), 0); await page.locator('#photoStampHidden').uncheck(); assert.equal(await page.locator('#photoStage svg [data-stamp]').count(), 1);
    await page.locator('#photoTools [data-tone=blue]').click(); await page.locator('#photoTools [data-mode=pen]').click();
    const box = await page.locator('#photoStage svg').boundingBox(); await page.mouse.move(box.x + box.width * .3, box.y + box.height * .3); await page.mouse.down(); await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5, { steps: 5 }); await page.mouse.up();
    await click('#savePhoto'); project = await current(); const saved = project.records[0].photos[1];
    assert.equal(saved.stamp, '2026-09-18'); assert.equal(saved.stampHidden, false); assert.equal(saved.marks.length, 1); assert.equal(saved.marks[0].tone, 'blue'); assert.equal(saved.capturedOn, second.capturedOn, 'editing the stamp never rewrites the recorded date');
    // The marked copy carries the stamp bottom-right and the blue mark; without a stamp the corner stays clean.
    const copy = await page.evaluate(async ({ mediaId, marks }) => {
      const a = await import('./annotation.js'), s = await import('./store.js'), blob = (await s.getMedia(mediaId)).blob;
      const draw = async options => { const out = await a.markedImage(blob, marks, options), img = new Image(); img.src = URL.createObjectURL(out); await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return { corner: [...ctx.getImageData(Math.round(c.width * .72), Math.round(c.height * .88), Math.round(c.width * .27), Math.round(c.height * .11)).data], all: [...ctx.getImageData(0, 0, c.width, c.height).data] }; };
      return { stamped: await draw({ stamp: '2026-09-18' }), plain: await draw({}) };
    }, { mediaId: saved.mediaId, marks: saved.marks });
    assert(scan(copy.stamped.corner, (r, g, b) => r + g + b < 200), 'stamp text is drawn in the corner'); assert(!scan(copy.plain.corner, (r, g, b) => r + g + b < 200), 'no stamp when none is requested');
    assert(scan(copy.stamped.all, (r, g, b) => b - r > 60), 'blue tone marks stay blue on photos');
    // Detail sketch: four-cornered opening on an oblique base, tone selection, grayscale export by default.
    await click(`[data-field-detail="${seed.record}"]`); await page.locator('#detailStage').waitFor();
    if (await page.locator('#detailChoices').isHidden()) await click('#chooseDetail');
    await click('[data-detail-preset=corner]'); await page.locator('#detailStage svg').waitFor();
    await click('[data-detail-tool=door]'); await page.locator('#detailQuad').check();
    for (const [x, y] of [[.12, .30], [.40, .36], [.40, .70], [.12, .78]]) await tapStage(x, y);
    await click('[data-detail-tool=line]'); await page.locator('#detailTone').selectOption('blue'); await tapStage(.6, .3); await tapStage(.8, .5); await click('#detailFinish');
    await click('[data-detail-tool=symbol]'); await click('[data-detail-symbol=network]'); await tapStage(.7, .75);
    await click('#saveDetail'); project = await current(); const detail = project.records[0].detail;
    assert.equal(detail.preset, 'corner'); assert.equal(detail.marks.length, 3);
    assert.deepEqual([detail.marks[0].type, detail.marks[0].kind, detail.marks[0].points.length], ['opening', 'door', 4]); assert.deepEqual([detail.marks[1].type, detail.marks[1].tone], ['pen', 'blue']); assert.equal(detail.marks[2].symbol, 'network');
    const rendered = await page.evaluate(async detail => {
      const d = await import('./detail.js');
      const pixels = async options => { const blob = await d.detailImage(detail, () => null, options), img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(0, 0, c.width, c.height).data]; };
      return { gray: await pixels({}), color: await pixels({ color: true }) };
    }, detail);
    assert(!scan(rendered.gray, (r, g, b) => Math.abs(r - g) > 12 || Math.abs(g - b) > 12), 'default export is pure grayscale line art');
    assert(scan(rendered.gray, (r, g, b) => r + g + b < 150), 'grayscale export still has dark lines');
    assert(scan(rendered.color, (r, g, b) => r - b > 80), 'colour export shows the red crack symbol'); assert(scan(rendered.color, (r, g, b) => b - r > 60), 'colour export shows the blue line');
    // Plan sketches now render black walls, and attachments build in both modes.
    const sketchCheck = await page.evaluate(async () => {
      const s = await import('./sketch.js'), sketch = { version: 1, width: 1200, height: 900, strokes: [{ type: 'rect', points: [{ x: .1, y: .1 }, { x: .9, y: .8 }] }, { type: 'door', points: [{ x: .3, y: .8 }, { x: .5, y: .8 }], swing: 1 }] };
      const out = await s.sketchImage(sketch), blob = out instanceof Blob ? out : out.blob, img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let teal = 0, dark = 0; for (let i = 0; i < px.length; i += 4) { if (Math.abs(px[i] - 36) < 14 && Math.abs(px[i + 1] - 70) < 14 && Math.abs(px[i + 2] - 68) < 14) teal++; if (px[i] < 40 && px[i + 1] < 40 && px[i + 2] < 40) dark++; }
      return { teal, dark };
    });
    assert.equal(sketchCheck.teal, 0, 'plan sketch walls are no longer teal'); assert(sketchCheck.dark > 100, 'plan sketch walls are black');
    const attachments = await page.evaluate(async () => { const s = await import('./store.js'), r = await import('./report.js'), p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob; const a = await r.renderAttachment(p, get, { format: 'standard' }), b = await r.renderAttachment(p, get, { format: 'standard', color: true }); return { gray: a.html.length > 1000, color: b.html.length > 1000 }; });
    assert(attachments.gray && attachments.color);
    // The case-level switch turns stamps off everywhere without touching recorded dates.
    await click('[data-view=case]'); await click('#editCase'); await page.locator('#caseForm [name=photoStamp]').uncheck(); await click('#caseForm button[type=submit]');
    project = await current(); assert.equal(project.photoStamp, false); assert.equal(project.records[0].photos[1].stamp, '2026-09-18');
    assert.equal(await page.evaluate(async () => { const m = await import('./model.js'), s = await import('./store.js'), p = (await s.allProjects())[0]; return m.photoStampText(p, p.records[0].photos[1]); }), '');
    await click('#editCase'); await page.locator('#caseForm [name=photoStamp]').check(); await click('#caseForm button[type=submit]'); project = await current(); assert.equal(project.photoStamp, true);
    const roundtrip = await page.evaluate(async () => { const s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0], get = async id => (await s.getMedia(id)).blob, bundle = await b.readBundle((await b.makeBundle(p, get)).blob); return { version: bundle.manifest.version, equal: JSON.stringify(bundle.project) === JSON.stringify(p) }; });
    assert.equal(roundtrip.version, 16); assert(roundtrip.equal);
    await click('[data-view=work]');
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) { await page.setViewportSize({ width, height }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at ' + width); }
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'v0.20-work-390.png') });
    await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === '離線已就緒'); await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    await click('.photo-card >> nth=1'); await page.locator('#photoStage svg').waitFor(); assert.equal(await text('#photoStage svg [data-stamp]'), '2026-09-18');
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'v0.20-result.json'), JSON.stringify({ passed: true, backupVersion: 13, errors, physicalPhoneTested: false }, null, 2));
    console.log('PASS V0.20 EXIF/file capture dates, record date adoption, editable date stamps on copies only, tone colours, four-corner openings, grayscale exports, black plan sketches, case switch, backup and offline');
  } finally { await context.close(); }
}
