const { chromium } = require('../../.github/pages-smoke/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url'), { randomUUID, createHash } = require('node:crypto');
(async () => {
  const base = process.env.LAB_URL || 'https://field-survey-cloud-lab.oxsum324-learning.workers.dev', room = randomUUID(), url = base + '/#' + room, out = path.resolve(__dirname, '../../output/cloud-lab-validation');
  await fs.mkdir(out, { recursive: true });
  const { FIXTURES } = await import(pathToFileURL(path.join(__dirname, 'fixtures.js')));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : undefined, headless: true });
  const a = await browser.newContext({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }), b = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const pa = await a.newPage(), pb = await b.newPage(), errors = [], localPosts = [];
  for (const p of [pa, pb]) p.on('pageerror', e => errors.push(e.message));
  const wait = p => p.waitForFunction(() => !document.querySelector('#submit').disabled);
  const click = async (p, selector) => { await p.locator(selector).click(); await wait(p); };
  try {
    await pa.goto(url); await wait(pa); assert.equal(await pa.locator('#count').textContent(), '0 筆雲端提交');
    pa.on('request', r => { if (r.method() === 'POST') localPosts.push(r.url()); });
    await pa.locator('#file').setInputFiles({ name: 'synthetic.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(FIXTURES['600'].base64, 'base64') });
    await click(pa, '#compress'); assert.match(await pa.locator('#localStats').textContent(), /1772 × 1181/); assert.equal(localPosts.length, 0);
    await pa.locator('#ppi').selectOption('600'); await click(pa, '#compress'); assert.match(await pa.locator('#localStats').textContent(), /3543 × 2362/); assert.equal(localPosts.length, 0);
    await click(pa, '#submit'); assert.equal(await pa.locator('#count').textContent(), '1 筆雲端提交');
    await click(pa, '#retry'); assert.equal(await pa.locator('#count').textContent(), '1 筆雲端提交');
    await click(pa, '#submit'); assert.equal(await pa.locator('#count').textContent(), '1 筆雲端提交');
    await pb.goto(url); await wait(pb); assert.equal(await pb.locator('#count').textContent(), '1 筆雲端提交');
    await pb.locator('#contributor').selectOption('乙'); await pb.locator('#condition').selectOption('裂隙'); await click(pb, '#submit'); assert.equal(await pb.locator('#count').textContent(), '2 筆雲端提交');
    await click(pa, '#refresh'); await click(pa, '#merge'); assert.match(await pa.locator('#status').textContent(), /請先核對/);
    await pa.locator('[data-resolve]').selectOption('all'); let download = pa.waitForEvent('download'); await click(pa, '#merge');
    const bundlePath = path.join(out, 'merged-synthetic.json'); await (await download).saveAs(bundlePath); const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8'));
    assert.equal(bundle.records.length, 1); assert.equal(bundle.records[0].sources.length, 2); assert.deepEqual(bundle.records[0].conditions.sort(), ['滲水痕', '裂隙'].sort());
    for (const s of bundle.records[0].sources) assert.equal(createHash('sha256').update(Buffer.from(s.photo, 'base64')).digest('hex'), s.photoSha256);
    await pa.locator('[data-resolve]').selectOption('滲水痕'); download = pa.waitForEvent('download'); await click(pa, '#merge'); const selectivePath = path.join(out, 'selected-synthetic.json'); await (await download).saveAs(selectivePath);
    const selective = JSON.parse(await fs.readFile(selectivePath, 'utf8')); assert.equal(selective.records[0].sources.length, 2); assert.equal(selective.records[0].sources.filter(s => s.adopted).length, 1);
    const bad = await pa.evaluate(async () => {
      const headers = { 'X-Test-Room': location.hash.slice(1), 'Content-Type': 'application/json' }, list = await (await fetch('/api/submissions', { headers })).json(), original = await (await fetch('/api/submissions/' + list.items[0].id, { headers })).json();
      const source = original.package, p = Object.fromEntries(['id','contributor','location','condition','quality','photo'].map(k => [k,source[k]]));
      p.condition = p.condition === '滲水痕' ? '裂隙' : '滲水痕'; const conflict = (await fetch('/api/submissions', { method: 'POST', headers, body: JSON.stringify(p) })).status;
      p.id = crypto.randomUUID(); p.photo = 'arbitrary-photo'; const privatePhoto = (await fetch('/api/submissions', { method: 'POST', headers, body: JSON.stringify(p) })).status;
      const unauthorized = (await fetch('/api/submissions')).status, isolated = (await fetch('/api/submissions/' + list.items[0].id, { headers: { 'X-Test-Room': crypto.randomUUID() } })).status;
      const oversized = (await fetch('/api/submissions', { method: 'POST', headers, body: JSON.stringify({ data: 'x'.repeat(400001) }) })).status;
      const after = await (await fetch('/api/submissions/' + list.items[0].id, { headers })).json();
      return { conflict, privatePhoto, unauthorized, isolated, oversized, unchanged: after.digest === original.digest };
    });
    assert.deepEqual(bad, { conflict: 409, privatePhoto: 400, unauthorized: 401, isolated: 404, oversized: 400, unchanged: true });
    await pb.locator('#location').selectOption('浴室牆面'); await click(pb, '#submit'); await click(pa, '#refresh'); assert.equal(await pa.locator('#count').textContent(), '3 筆雲端提交');
    for (const p of [pa,pb]) { assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await p.screenshot({ path: path.join(out, p === pa ? 'desktop.png' : 'mobile.png'), fullPage: true }); }
    await pb.evaluate(value => { location.hash = value; }, randomUUID()); await pb.waitForFunction(() => document.querySelector('#count')?.textContent === '0 筆雲端提交');
    await pb.evaluate(value => { location.hash = value; }, room); await pb.waitForFunction(() => document.querySelector('#count')?.textContent === '3 筆雲端提交');
    const html = await (await fetch(base)).text(), js = await (await fetch(base + '/client.js')).text(); assert.equal(html, await fs.readFile(path.join(__dirname, 'index.html'), 'utf8')); assert.equal(js, await fs.readFile(path.join(__dirname, 'client.js'), 'utf8'));
    assert.deepEqual(errors, []); await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, base, room, submissions: 3, separateBrowserContexts: 2, localPhotoUploadRequests: 0, verifiedPhotoHashes: 2, physicalDevicesTested: false, ...bad }, null, 2));
    console.log('PASS live upload, separate browser retrieval, duplicate suppression, conflict resolution, verified download, room isolation, local compression and source bytes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
