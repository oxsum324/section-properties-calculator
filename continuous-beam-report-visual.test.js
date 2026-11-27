const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { captureReportTextDownload } = require('./鋼筋混凝土/tools/report-text-download-check');
const beamMetadata = require('./結構工具箱/tools/analysis-section-tool-metadata')['continuous-beam'];

const ROOT = __dirname;
const OUT_DIR = path.resolve(process.env.CONTINUOUS_BEAM_REPORT_OUT || (process.env.PREFLIGHT_RUN_DIR
  ? path.join(process.env.PREFLIGHT_RUN_DIR, 'continuous-beam-text-export')
  : path.join(ROOT, 'output', 'playwright', 'continuous-beam')));
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function safeRequestPath(reqUrl) {
  return decodeURIComponent(new URL(reqUrl || '/', 'http://127.0.0.1').pathname);
}

function serveStatic(rootDir) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const requestPath = safeRequestPath(req.url);
    const target = path.normalize(path.join(rootDir, requestPath === '/' ? '連續梁分析.html' : requestPath));
    const relative = path.relative(rootDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchBrowser(executablePath) {
  let lastError;
  for (const delayMs of [0, 5000, 15000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (error) {
      lastError = error;
      if (!/spawn EPERM|WinError 5|access is denied|Permission denied/i.test(String(error?.message || error))) throw error;
    }
  }
  throw lastError;
}

async function verifyDeflectionReview(page) {
  const load = async (name, payload) => {
    await page.locator('#localJsonFile').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await page.waitForFunction(filename => document.getElementById('saveStatus').textContent.includes(filename), name);
  };
  const download = async (name, trigger) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
    const file = path.join(OUT_DIR, name);
    await download.saveAs(file);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  const calculate = () => page.locator('.btn-calc').click();
  const panel = page.locator('#deflectionReview');
  const button = page.locator('#downloadDeflectionReview');
  const saved = await download('continuous-beam-current-input.json', () => page.getByRole('button', { name: '匯出案件 JSON', exact: true }).click());
  const { analysisVersion, ...data } = saved.data;

  await load('legacy-beam.json', { ...saved, tool: { ...saved.tool, pageVersion: 'V1.4', calculationEngine: 'continuous-beam.inline.v1.4.0' }, data });
  assert((await page.locator('#saveStatus').textContent()).includes('核對原報告'), 'legacy input prompts a review on import', 'V1.4');
  assert(!(await button.isVisible()), 'review export is hidden before calculation after import', 'legacy case');
  await page.setViewportSize({ width: 390, height: 844 });
  await calculate();
  assert(await button.isVisible(), 'review opens automatically for a legacy case at 390 px', await panel.locator('summary').textContent());
  assert((await panel.locator('#deflectionReviewSource').textContent()).includes('修正前後共用版號'), 'V1.4 source remains ambiguous', 'review guidance');
  const review = await download('continuous-beam-deflection-review.json', () => button.click());
  const expectedDifference = 10 * 6 ** 4 / (384 * Number(data.eVal) * Number(data.globalI));
  assert(review.schema === 'continuous-beam.deflection-review.v1' && review.source.pageVersion === 'V1.4' && review.current.pageVersion === analysisVersion.pageVersion,
    'review export identifies input and calculation versions', review.schema);
  assert(/^[0-9a-f]{64}$/.test(review.modelFingerprint) && review.lengthUnit === 'm' && review.spans.length === 1,
    'review export identifies units, model and span', review.modelFingerprint);
  const [span] = review.spans;
  assert(span.legacy.stationFromLeft === 3 && Math.abs(span.current.stationFromLeft - 3) < 1e-10 &&
    Math.abs(span.legacy.magnitude - 4 * expectedDifference) < 1e-15 && Math.abs(span.current.magnitude - 5 * expectedDifference) < 1e-15 &&
    Math.abs(span.magnitudeDifference - expectedDifference) < 1e-15,
    'review export matches simple-span closed form', JSON.stringify(span));
  const reviewRow = await panel.locator('tbody tr').innerText();
  assert(reviewRow.includes('2.206') && reviewRow.includes('2.757') && reviewRow.includes('0.551') &&
    (await panel.locator('caption').innerText()).includes('量差（mm）'), 'review table shows directly readable deflection millimetres', reviewRow);
  const narrowLayout = await panel.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth);
  assert(narrowLayout, 'review panel fits the 390 px viewport', 'mobile layout');
  await panel.screenshot({ path: path.join(OUT_DIR, 'continuous-beam-deflection-review-390.png') });

  const resaved = await download('continuous-beam-resaved-input.json', () => page.getByRole('button', { name: '匯出案件 JSON', exact: true }).click());
  await load('resaved-beam.json', resaved);
  await calculate();
  assert((await panel.locator('#deflectionReviewSource').textContent()).includes('V1.4'), 'resaving preserves the original source version', 'V1.4');
  await page.locator('#globalI').fill('0.0006');
  await page.locator('#globalI').blur();
  assert(!(await button.isVisible()), 'editing input hides stale review results and export', 'moment of inertia changed');

  await load('unversioned-beam.json', data);
  await calculate();
  assert((await panel.locator('#deflectionReviewSource').textContent()).includes('未記錄'), 'unversioned input is marked as unknown', 'no engine tag');
  await load('current-beam.json', saved);
  await calculate();
  assert(!(await button.isVisible()) && !(await page.locator('#saveStatus').textContent()).includes('核對原報告'),
    'current input keeps comparison available on demand', 'comparison starts collapsed');
  const precedingTool = { ...saved.tool, pageVersion: 'V1.8', calculationEngine: 'continuous-beam.inline.v1.5.0' };
  await load('v18-uniform-beam.json', { ...saved, tool: precedingTool });
  await calculate();
  assert(!(await button.isVisible()) && !(await page.locator('#saveStatus').textContent()).includes('核對原報告'),
    'V1.8 uniform-load projects remain recognized', 'no ambiguous-version prompt');
  const descending = { ...data, model: { ...data.model, loads: [[{ type: 'trapezoid', w1: 10, w2: 5 }]] } };
  await load('v18-descending-beam.json', { ...saved, tool: precedingTool, data: descending });
  await calculate();
  assert(await button.isVisible() && (await panel.locator('#deflectionReviewSource').textContent()).includes('遞減梯形等效載重'),
    'V1.8 descending-load projects prompt a review', 'prior trapezoid direction');
  const descendingReview = await download('continuous-beam-descending-review.json', () => button.click());
  assert(descendingReview.legacyMethod.includes('跨內載重特解') &&
    Math.abs(descendingReview.spans[0].legacy.signedDeflection - (-0.002068023216352544)) < 1e-15,
    'V1.8 review reproduces the previous descending-load peak', JSON.stringify(descendingReview.spans[0].legacy));
  await load('current-beam.json', saved);
}

async function verifyUnitRoundTrips(page) {
  const unit = page.locator('#unitSystem');
  const material = page.locator('#matSelect');
  const fc = page.locator('#fcVal');
  const readResult = units => page.evaluate(({ length, force, elasticity, strength }) => ({
    E: Number(document.querySelector('#eVal').value) * elasticity,
    fc: Number(document.querySelector('#fcVal').value) * strength,
    reaction: window.solution.reactions[0].Ry * force,
    peak: window.diagrams.spans[0].peakDeflection.value * length,
  }), units);
  const scales = {
    'kN-m': { length: 1, force: 1, elasticity: 1, strength: 1 },
    'tf-m': { length: 1, force: 9.80665, elasticity: 9.80665, strength: 0.0980665 },
    'kgf-cm': { length: 0.01, force: 0.00980665, elasticity: 98.0665, strength: 0.0980665 },
  };
  assert(Math.abs(Number(await fc.inputValue()) - 27.45862) < 1e-10, 'new-model concrete strength starts at the same physical default', '280 kgf/cm² = 27.45862 MPa');
  for (const key of ['steel', 'custom', 'concrete']) {
    await material.selectOption(key);
    const edited = key === 'custom' ? page.locator('#eVal') : fc;
    if (key !== 'steel') {
      await edited.fill(key === 'custom' ? '173000000' : '28');
      await edited.blur();
    }
    await page.locator('.btn-calc').click();
    const original = await readResult(scales['kN-m']);
    for (const next of ['tf-m', 'kgf-cm', 'kN-m']) {
      await unit.selectOption(next);
      assert(await page.locator('#resultsCard').isHidden(), `${key} unit change invalidates the prior display`, next);
      await page.locator('.btn-calc').click();
      const actual = await readResult(scales[next]);
      for (const [quantity, value] of Object.entries(original)) {
        assert(Math.abs(actual[quantity] - value) / Math.abs(value) < 2e-7, `${key} unit conversion preserves physical ${quantity}`, `${next}: ${actual[quantity]} vs ${value}`);
      }
    }
  }
  await fc.fill('');
  await fc.blur();
  await page.locator('.btn-calc').click();
  assert(await page.locator('#resultsCard').isHidden() && (await page.locator('#errorMsg').textContent()).includes('混凝土強度'),
    'clearing concrete strength requires the user to provide it before solving', 'analysis remains unavailable');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(Boolean(chromePath), 'continuous beam browser executable exists', chromePath || 'not found');

  let server;
  let browser;
  try {
    server = await serveStatic(ROOT);
    const pageUrl = `http://127.0.0.1:${server.address().port}/${encodeURIComponent('連續梁分析.html')}`;
    browser = await launchBrowser(chromePath);
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const response = await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
    assert(response?.status() === 200, 'continuous beam work page loads', `status=${response?.status()}`);
    await page.waitForFunction(() => typeof window.runAnalysis === 'function' && typeof window.exportPDF === 'function' && window.model?.spans?.length, null, { timeout: 15000 });

    const result = await page.evaluate(() => {
      document.getElementById('projName').value = '連續梁 TXT 驗證案';
      document.getElementById('projNo').value = 'CB-TXT-001';
      document.getElementById('projDesigner').value = '測試設計者';
      document.getElementById('projNote').value = '同一份報表狀態衍生文字備查';
      window.initModel(1);
      window.model.supports[0] = { type: 'pin' };
      window.model.supports[1] = { type: 'roller' };
      window.model.spans[0] = { L: 6, eiMul: 1, hinges: [] };
      window.model.loads[0] = [{ type: 'udl', w: 10 }];
      document.getElementById('numSpans').value = '1';
      window.renderSpanInputs();
      window.renderLoadSpanSelect();
      window.renderLoadInputs();
      window.runAnalysis();
      return {
        version: document.getElementById('continuousBeamVersion')?.textContent || '',
        reportReady: Boolean(window.solution && window.diagrams),
        reactionText: document.getElementById('reactionTable')?.textContent || '',
      };
    });
    assert(result.version === beamMetadata.version, 'continuous beam public version matches its catalogue', result.version);
    assert(result.reportReady && /30(?:\.0+)?/.test(result.reactionText), 'continuous beam representative result is calculated', result.reactionText.replace(/\s+/g, ' ').trim());

    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await page.evaluate(() => window.exportPDF());
    const report = await popupPromise;
    await report.waitForLoadState('domcontentloaded');
    await report.waitForFunction(() => document.getElementById('repDownloadCurrentText') && typeof window.buildReportText === 'function', null, { timeout: 15000 });
    assert(!(await report.locator('body').innerText()).includes('舊案撓度比對'), 'calculation book only includes the current method', 'review is a standalone export');

    const record = await captureReportTextDownload(report, {
      outputDir: OUT_DIR,
      filePrefix: 'continuous-beam',
      caseKey: 'simple-span-udl',
      label: 'continuous beam simple-span UDL report',
      assert,
      expectedFragments: [
        '連續梁分析計算書',
        '連續梁 TXT 驗證案',
        'CB-TXT-001',
        '基本設定',
        '載重清單',
        '支承反力',
        '各跨內力極值',
        '梁示意圖',
        '剪力圖',
        '彎矩圖',
        '線彈性連續梁分析',
      ],
      minBytes: 1200,
    });
    await report.close();
    await verifyDeflectionReview(page);
    await verifyUnitRoundTrips(page);

    const summary = {
      generatedAt: new Date().toISOString(),
      tool: 'continuous-beam',
      version: result.version,
      caseKey: 'simple-span-udl',
      referenceTextRole: 'non-formal-reference-text',
      referenceTextPackageStatus: record.packageStatus,
      referenceTextBytes: record.bytes,
      referenceTextArtifact: record.artifact,
      suggestedFilename: record.suggestedFilename,
      hasBom: record.hasBom,
      packageIssueCodes: record.packageIssueCodes,
      pass: record.packageStatus === 'blocked' && record.packageIssueCodes.includes('non-formal-reference-text'),
    };
    fs.writeFileSync(path.join(OUT_DIR, 'continuous-beam-text-export-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    assert(summary.pass, 'continuous beam TXT evidence summary passes', JSON.stringify(summary));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
