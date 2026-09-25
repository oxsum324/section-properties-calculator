import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV0292(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1000 } }), page = await context.newPage();
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const gallery = await page.evaluate(async () => {
      const m = await import('./model.js'), d = await import('./detail.js'), report = await import('./report-standard.js');
      const url = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      const items = [];
      for (const preset of Object.keys(m.DETAIL_PRESETS)) {
        const blob = await d.detailImage({ kind: 'preset', preset, mirror: false, marks: [{ type: 'symbol', symbol: 'network', points: [{ x: .52, y: .5 }], size: .24, rotation: 0, mirror: false }] }, () => {});
        const src = await url(blob); items.push({ name: preset, html: await report.fittedDetailHTML(src), hash: await m.sha256(blob) });
      }
      for (const name of ['portrait', 'edge-marks', 'blank']) {
        const c = document.createElement('canvas'); c.width = 600; c.height = name === 'portrait' ? 1000 : 400;
        const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#1a1a1a';
        if (name === 'portrait') ctx.fillRect(250, 60, 100, 880);
        if (name === 'edge-marks') { ctx.fillRect(0, 0, 3, 3); ctx.fillRect(c.width - 3, c.height - 3, 3, 3); }
        const blob = await new Promise(resolve => c.toBlob(resolve)), src = await url(blob);
        items.push({ name, html: await report.fittedDetailHTML(src), hash: await m.sha256(blob) });
      }
      return { items, html: `<!doctype html><meta charset="utf-8"><style>${report.STANDARD_STYLE}body{margin:12px}.standard-sheet{display:block!important;width:auto!important;height:auto!important;min-height:0!important}.gallery{display:grid;grid-template-columns:repeat(4,190px);gap:12px}table{width:47.5mm!important}h2{font:14px sans-serif!important}</style><div class="standard-sheet gallery">${items.map(item => `<section data-name="${item.name}"><h2>${item.name}</h2><table><tr><td class="detail-cell">${item.html}</td></tr></table></section>`).join('')}</div>` };
    });
    const file = path.join(out, 'v0.29.2-detail-layout.html'); await fs.writeFile(file, gallery.html);
    await page.goto('file:///' + file.replaceAll('\\', '/'));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const checks = await page.locator('[data-name]').evaluateAll(items => items.map(item => {
      const image = item.querySelector('img'), frame = item.querySelector('.detail-fit'), cell = item.querySelector('td'), i = image.getBoundingClientRect(), f = frame.getBoundingClientRect(), c = cell.getBoundingClientRect(), style = getComputedStyle(cell);
      return { name: item.dataset.name, width: f.width, height: f.height, available: c.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2, ratio: i.width / i.height, naturalRatio: image.naturalWidth / image.naturalHeight, frame: frame.dataset.detailFrame, source: image.src };
    }));
    const { createHash } = await import('node:crypto');
    for (const [i, check] of checks.entries()) {
      assert(Math.abs(check.ratio - check.naturalRatio) < .002, `${check.name}: no stretching`);
      assert(check.width >= check.available - 1 || Math.abs(check.height - 36 * 96 / 25.4) < 1, `${check.name}: fill one available axis`);
      assert(check.height <= 36 * 96 / 25.4 + 1);
      assert.equal(createHash('sha256').update(Buffer.from(check.source.split(',')[1], 'base64')).digest('hex'), gallery.items[i].hash, 'Embedded drawing remains byte-for-byte intact');
    }
    for (const name of ['edge-marks', 'blank']) assert.equal(checks.find(item => item.name === name).frame, '0,0,600,400');
    const floor = checks.find(item => item.name === 'flatFloor'); assert(floor.frame.split(',').map(Number)[2] < 1200, 'Outer white margins are reduced');
    await page.screenshot({ path: path.join(out, 'v0.29.2-detail-layout.png'), fullPage: true });
    console.log('PASS V0.29.2 all detail presets, portrait/edge/blank drawings, proportional cell fill, white margins and unchanged embedded PNGs');
  } finally { await context.close(); }
}
