const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root, 'output/playwright/phase2-quality-deps/node_modules/playwright'));
const beamMetadata = require('../結構工具箱/tools/analysis-section-tool-metadata')['continuous-beam'];

function simpleBeamInput(load = 12, units = 'kN-m') {
  return { unitSystem: units, matSelect: 'steel', eVal: 2.04e8, globalI: 0.0003, projNo: '', model: {
    numSpans: 1,
    supports: [{ type: 'pin' }, { type: 'roller' }],
    spans: [{ L: 6, eiMul: 1, hinges: [] }],
    loads: [[{ type: 'udl', w: 2 }, { type: 'point', P: load, a: 2 }]],
  }, elasticModulusBasis: '材料規格 E-01', inertiaBasis: '斷面圖 I-02' };
}

async function checkEarlyLocalImport(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const release = Promise.withResolvers();
  try {
    // Keep the load event pending while the real file input and Calculate button are usable.
    await page.route('**/tool-chrome.js', async route => {
      await release.promise;
      await route.continue();
    });
    const pendingScript = page.waitForRequest('**/tool-chrome.js');
    await page.goto(url, { waitUntil: 'commit' });
    await pendingScript;
    await page.waitForFunction(() => typeof window._localImportFile === 'function');
    const data = simpleBeamInput();
    await page.locator('#localJsonFile').setInputFiles({
      name: 'early-synthetic-beam.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
    await page.locator('#saveStatus').filter({ hasText: '已讀取本地檔：early-synthetic-beam.json' }).waitFor();
    assert.notEqual(await page.evaluate(() => document.readyState), 'complete');
    await page.locator('.btn-calc').click();
    const read = () => page.evaluate(() => ({
      model: window.model,
      reactions: window.solution?.reactions.map(item => item.Ry),
      canSendStation: !document.getElementById('stationTransfer').hidden,
    }));
    const early = await read();
    assert.deepEqual(early.model, data.model);
    assert.deepEqual(early.reactions.map(value => Number(value.toFixed(9))), [14, 10]);
    assert.equal(early.canSendStation, true);
    release.resolve();
    await page.waitForLoadState('load');
    assert.deepEqual(await read(), early, 'Late page load must preserve the imported model, solution, and transfer controls');
  } finally {
    release.resolve();
    await context.close();
  }
}

async function main() {
  const server = spawn(process.execPath, ['serve-local.js', '--no-open', '--route', '/beam-analysis'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const lines = readline.createInterface({ input: server.stdout });
      lines.on('line', line => {
        const match = line.match(/listening on (http:\/\/\S+)/);
        if (match) { lines.close(); resolve(match[1]); }
      });
      server.on('error', reject);
      server.once('exit', () => reject(new Error('local server stopped')));
    });
    browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
    await checkEarlyLocalImport(browser, url);
    const context = await browser.newContext();
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const beam = await context.newPage();
    await beam.goto(url);
    await beam.waitForFunction(() => typeof runAnalysis === 'function');
    const form = beam.locator('#stationTransferBody form');
    async function solve(load = 12, units = 'kN-m') {
      await beam.evaluate(async data => {
        await window._localImportFile({ files: [new File([JSON.stringify(data)], 'beam.json')] });
        runAnalysis();
      }, simpleBeamInput(load, units));
      if (!await beam.locator('#stationTransfer').evaluate(e => e.open)) await beam.locator('#stationTransfer summary').click();
      await form.waitFor();
    }
    async function send(project, revision, side, basis = 'factored') {
      for (const [name, value] of Object.entries({ project, revision, member: 'B-1', caseName: '載重 A', combination: 'U1' })) {
        await form.locator('[name=' + name + ']').fill(String(value));
      }
      await form.locator('[name=basis]').selectOption(basis);
      const options = form.locator('[name=section] option');
      const choice = options.filter({ hasText: new RegExp('^2 (m|cm)・' + side) });
      await form.locator('[name=section]').selectOption(await choice.getAttribute('value'));
      await form.locator('[type=submit]').click();
      const link = form.locator('a');
      await link.waitFor();
      return link.evaluate(el => el.href);
    }
    async function openReview(url) {
      const page = await context.newPage();
      await page.goto(url);
      await page.locator('#stationCandidate').waitFor();
      return page;
    }
    const snapshot = page => page.evaluate(() => window.buildBeamSourcePayload());
    await solve();
    const urlA = await send('P2-A', 1, '右側');
    const a = await openReview(urlA);
    const initial = await snapshot(a);
    assert.equal(initial.adoptedBeamImport, undefined);
    assert.equal(await a.locator('#stationApply').isDisabled(), true);
    assert.match(await a.locator('#stationIncoming').innerText(), /M = 24 kN·m、V = -2 kN/);
    await a.locator('#stationConfirm').check();
    await a.locator('#stationApply').click();
    const adopted = await snapshot(a);
    const p = adopted.adoptedBeamImport.station;
    assert.equal(p.side, 'right');
    assert.equal('P' in p, false);
    assert.equal(p.combination, 'U1');
    assert.equal(p.span, 1);
    assert.equal(p.x, 2);
    assert.deepEqual(p.analysis, {
      pageVersion: beamMetadata.version,
      engine: beamMetadata.calculationEngine,
      material: 'steel',
      elasticModulus: 2.04e8,
      elasticModulusUnit: 'kN/m²',
      elasticModulusBasis: '材料規格 E-01',
      inertia: 0.0003,
      inertiaUnit: 'm⁴',
      inertiaBasis: '斷面圖 I-02',
      sectionBasis: '',
    });
    assert.match(p.analysis.pageVersion, /^V\d+\.\d+/);
    assert.ok(Math.abs(Number(adopted.fields.inMu.value) - 24 / 9.80665) < 1e-12);
    assert.ok(Math.abs(Number(adopted.fields.inVu.value) - 2 / 9.80665) < 1e-12);
    assert.equal(adopted.fields.inL.value, '600');
    assert.match(JSON.stringify(adopted.report.inputs), /V = -2 kN/);
    assert.match(JSON.stringify(adopted.report.inputs), /斷面圖 I-02/);
    assert.doesNotMatch(JSON.stringify(adopted.report.inputs), /套用後經人工調整/);
    await send('P2-A', 1, '左側');
    await a.waitForFunction(() => document.querySelector('#stationCandidate').length === 2);
    async function choose(page, re) {
      const option = page.locator('#stationCandidate option').filter({ hasText: re }).first();
      await page.locator('#stationCandidate').selectOption(await option.getAttribute('value'));
    }
    await choose(a, /左側/);
    assert.match(await a.locator('#stationIncoming').innerText(), /M = 24 kN·m、V = 10 kN/);
    await send('P2-A', 1, '左側');
    assert.equal(await a.locator('#stationCandidate option').count(), 2);
    const urlB = await send('P2-B', 1, '右側', 'unconfirmed');
    const b = await openReview(urlB);
    assert.equal(await b.locator('#stationConfirm').isDisabled(), true);
    assert.equal((await snapshot(b)).adoptedBeamImport, undefined);
    await solve(18);
    await send('P2-A', 2, '右側');
    await a.waitForFunction(() => document.querySelector('#stationStatus').textContent === '舊修次');
    assert.equal(await a.locator('#stationConfirm').isDisabled(), true);
    assert.equal((await snapshot(a)).calculationFingerprint, adopted.calculationFingerprint);
    await a.reload();
    await a.locator('#stationCandidate').waitFor();
    assert.equal((await snapshot(a)).calculationFingerprint, adopted.calculationFingerprint);
    assert.equal((await snapshot(a)).adoptedBeamImport.station.id, p.id);
    await solve();
    await send('P2-A', 1, '右側');
    await choose(a, /R1.*右側/);
    assert.equal(await a.locator('#stationStatus').innerText(), '舊修次');
    await send('P2-A', 2, '右側');
    await a.waitForFunction(() => [...document.querySelector('#stationCandidate').options].some(o => o.text.includes('來源衝突')));
    await choose(a, /R2/);
    assert.equal(await a.locator('#stationConfirm').isDisabled(), true);
    await send('P2-A', 3, '右側');
    await choose(a, /R3/);
    assert.equal(await a.locator('#stationConfirm').isEnabled(), true);
    assert.equal(await b.locator('#stationCandidate option').count(), 1);
    for (const [units, expected] of [['tf-m', [24, 2, 600]], ['kgf-cm', [0.00024, 0.002, 6]]]) {
      await solve(12, units);
      const id = 'UNIT-' + units;
      const review = await openReview(await send(id, 1, '右側'));
      const incoming = await review.locator('#stationIncoming').innerText();
      assert.ok(incoming.includes(`|M| ${expected[0]} tf·m，|V| ${expected[1]} tf，L ${expected[2]} cm`), incoming);
      await review.locator('#stationConfirm').check();
      await review.locator('#stationApply').click();
      await review.locator('#beamUnitModeSiBtn').click();
      await review.locator('#beamUnitModeLegacyBtn').click();
      const stored = await snapshot(review);
      assert.ok(Math.abs(Number(stored.fields.inMu.value) - expected[0]) < 1e-12);
      assert.ok(Math.abs(Number(stored.fields.inVu.value) - expected[1]) < 1e-12);
      await review.close();
    }
    const replay = await context.newPage();
    await replay.goto(new URL('/steel-beam-formal', url).href);
    await replay.evaluate(saved => window.importBeamSourceJson(new File([JSON.stringify(saved)], 'adopted.json')), adopted);
    const restored = await snapshot(replay);
    assert.equal(restored.calculationFingerprint, adopted.calculationFingerprint);
    assert.equal(restored.adoptedBeamImport.station.id, p.id);
    assert.deepEqual(restored.adoptedBeamImport.station.analysis, p.analysis);
    const packetChecks = await replay.evaluate(async source => {
      const transfer = await import('./beam-station-transfer.js');
      const { analysis, ...legacy } = source;
      legacy.id = StructReportUtils.sha256Text(JSON.stringify([legacy.project, legacy.member, legacy.revision,
        legacy.caseName, legacy.combination, legacy.basis, legacy.fingerprint, legacy.units, legacy.span, legacy.x,
        legacy.side, legacy.length, legacy.moment, legacy.shear]));
      return {
        legacyRead: transfer.validPacket(legacy),
        legacyText: transfer.stationText(legacy),
        tamperedRead: transfer.validPacket({ ...source, analysis: { ...analysis, inertiaBasis: '替換值' } }),
        alternateBasisRevision: transfer.revisionStatus(source, [{ ...source, analysis: { ...analysis, inertiaBasis: '不同來源' } }]),
      };
    }, p);
    assert.equal(packetChecks.legacyRead, true);
    assert.doesNotMatch(packetChecks.legacyText, /基準 I/);
    assert.equal(packetChecks.tamperedRead, false);
    assert.match(packetChecks.alternateBasisRevision, /同修次來源衝突/);
    assert.deepEqual(errors, []);
    console.log('PASS 同站左右側、三種單位、人工採用、兩案隔離、新舊修次、同修次衝突、重整、JSON 指紋重播');
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
