const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { readPdfTextWithPoppler, captureArtifactIntegrity } = require('./report-screenshot-quality');
const { assertPortableFormalHtml } = require('./report-portable-html-check');

const ROOT = path.resolve(__dirname, '..', '..');
const RELEASE_OUT = process.env.PREFLIGHT_RUN_DIR
  ? path.join(path.resolve(process.env.PREFLIGHT_RUN_DIR), 'rendered-delivery-evidence', 'rc-stm-formal')
  : '';
const OUT_SCREEN = RELEASE_OUT || path.join(ROOT, 'output', 'playwright');
const OUT_PDF = RELEASE_OUT || path.join(ROOT, 'output', 'pdf');
const OUT_FORMAL = RELEASE_OUT || path.join(ROOT, 'output', 'playwright', 'rc-stm-formal');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function assertCheck(pass, title, detail = '') {
  assert.ok(pass, detail ? `${title} | ${detail}` : title);
}

function serve(rootDir) {
  const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = path.normalize(path.join(rootDir, pathname === '/' ? 'index.html' : pathname));
    const rel = path.relative(rootDir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); });
}

async function main() {
  fs.mkdirSync(OUT_SCREEN, { recursive:true }); fs.mkdirSync(OUT_PDF, { recursive:true }); fs.mkdirSync(OUT_FORMAL, { recursive:true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(chromePath, 'Chrome or Edge executable is required');
  const consoleErrors = [], pageErrors = [];
  let server, browser;
  try {
    server = await serve(ROOT); const port = server.address().port;
    browser = await chromium.launch({ headless:true, executablePath:chromePath });
    const page = await browser.newPage({ viewport:{ width:1440, height:1100 } });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    const url = `http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/foundation-deep-beam-stm.html`;
    const response = await page.goto(url, { waitUntil:'load', timeout:30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.FoundationDeepBeamSTM && window.calculateFoundationDeepBeamSTM);
    assert.equal(await page.locator('#fy').getAttribute('max'), '5600');
    assert.equal(await page.locator('#lambda').getAttribute('max'), '1');
    await page.fill('#lambda', '1.01');
    await page.click('#btnCalc');
    assert.match(await page.locator('#pageStatus').innerText(), /λ 不得大於 1\.0/);
    await page.fill('#lambda', '1');
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /計算檢核符合.+人工複核/);
    assert.equal(await page.locator('#stmDiagram svg').count(), 1);
    assert.equal(await page.locator('#tieSectionDiagram svg').count(), 1);
    assert.equal(await page.locator('#resReaction .value').innerText(), '500.00');
    assert.equal(await page.locator('#resBalance .value').innerText(), '0.00');
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'review');

    await page.selectOption('#reactionMode', 'pile-group');
    await page.click('#btnCalc');
    assert.equal(await page.locator('#pilePanel').isVisible(), true);
    assert.equal(await page.locator('#soilPanel').isVisible(), false);
    assert.equal(await page.locator('#resTieRows .value').innerText(), '7+7+6');
    assert.equal(await page.locator('#resReaction .value').innerText(), '500.00');
    assert.match(await page.locator('#checkRows').innerText(), /13\.4\.6\.1/);
    assert.match(await page.locator('#checkRows').innerText(), /對稱反力拓樸/);

    for (const id of ['reactionSourceConfirmed','twoDimensionalConfirmed','geometryConfirmed','anchorageConfirmed']) await page.check(`#${id}`);
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /反力、二維模型與錨定已確認/);
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'ready');

    const screenshotPath = path.join(OUT_SCREEN, 'foundation-deep-beam-stm-page.png');
    await page.screenshot({ path:screenshotPath, fullPage:true });
    assert.ok(fs.statSync(screenshotPath).size > 10000);

    const popupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const report = await popupPromise; await report.waitForLoadState('load'); await report.waitForSelector('.rep-paper');
    const reportText = await report.locator('body').innerText();
    for (const needle of ['RC 基礎深梁二維壓拉桿模型檢核計算書','對稱離散樁反力群','垂直力平衡','水平力平衡','數值門檻（非條文值）','|ΣR−Pu| / Pu ≤ 2.0%','|Σ(Ri xi)| / (Puℓn/2) ≤ 1.0%','|ΣH| / Σ|H| ≤ 1.0%','反力差 ≤ 2.0%','反力力矩平衡','最大分段拉桿力','底部拉桿多排斷面配置','13.4.6.1','23.2.7','文件狀態：內部審閱','工具版本V0.3']) {
      assert.ok(reportText.replace(/\s+/g,'').includes(needle.replace(/\s+/g,'')), `report includes ${needle}`);
    }
    for (const forbidden of ['DRAFT','產報前檢查','頁面輔助','本頁支援範圍','優先處理']) assert.ok(!reportText.includes(forbidden), `report excludes ${forbidden}`);
    assert.ok(!reportText.replace(/\s+/g,'').includes('13.2.6.3：|ΣR−Pu|/Pu≤2.0%'), 'tool tolerance is not attributed to clause 13.2.6.3');
    assert.equal(await report.locator('.rep-diagram img').count(), 2);
    await report.waitForFunction(() => { const images=Array.from(document.querySelectorAll('.rep-diagram img')); return images.length===2&&images.every(img=>img.complete&&img.naturalWidth>300); }, null, { timeout:10000 });

    const pdfPath = path.join(OUT_PDF, 'foundation-deep-beam-stm-report.pdf');
    await report.pdf({ path:pdfPath, format:'A4', printBackground:true, margin:{ top:'10mm',right:'8mm',bottom:'10mm',left:'8mm' } });
    assert.ok(fs.statSync(pdfPath).size > 20000);
    const pdf = readPdfTextWithPoppler(pdfPath);
    assert.ok(pdf.pages >= 3 && pdf.pages <= 5, `expected 3-5 report pages, pages=${pdf.pages}`);
    assert.ok(pdf.textLength > 1600, `expected report text, length=${pdf.textLength}`);
    for (const needle of ['RC 基礎深梁二維壓拉桿模型檢核計算書','對稱離散樁反力群','垂直力平衡','水平力平衡','7+7+6支','文件狀態：內部審閱']) assert.ok(pdf.text.includes(needle), `PDF includes ${needle}`);
    const normalizedPdfText = pdf.text.replace(/\s+/g,'');
    assert.ok(normalizedPdfText.includes('數值門檻（非條文值）'), 'PDF identifies the numerical tolerance as a non-clause numerical gate');
    assert.ok(!normalizedPdfText.includes('13.2.6.3：|ΣR−Pu|/Pu≤2.0%'), 'PDF does not attribute the tool tolerance to clause 13.2.6.3');
    assert.ok(!pdf.text.includes('產報前檢查'));

    const portableHtml = await assertPortableFormalHtml(report, 'RC foundation deep-beam STM report', assertCheck, {
      outputDir:OUT_FORMAL,
      continuationContextLabels:['基礎力流與拉桿配置'],
    });
    assert.equal(portableHtml.calculationFingerprint, await report.locator('.rep-attachment-approval-source').getAttribute('data-calculation-fingerprint'));
    const evidence = {
      schemaVersion:1,
      key:'foundation-deep-beam-stm',
      href:'/rc-foundation',
      title:'RC 基礎深梁二維壓拉桿模型',
      sourcePage:'鋼筋混凝土/tools/foundation-deep-beam-stm.html',
      pdfPath:path.basename(pdfPath),
      screenshotPath:path.basename(screenshotPath),
      artifactIntegrity:[
        captureArtifactIntegrity(pdfPath, 'reportPdf'),
        captureArtifactIntegrity(screenshotPath, 'reportScreenshot'),
      ],
      metrics:{ pages:pdf.pages, textLength:pdf.textLength, calculationFingerprint:portableHtml.calculationFingerprint },
      portableHtml,
    };
    const evidencePath = path.join(OUT_FORMAL, 'foundation-deep-beam-stm-formal-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await report.close();

    await page.emulateMedia({ media:'print' });
    const directBoundary = await page.evaluate(() => ({ boundaryRects:document.querySelector('.rc-direct-print-boundary')?.getClientRects().length || 0, visibleOthers:Array.from(document.body.children).filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0).length }));
    assert.ok(directBoundary.boundaryRects > 0); assert.equal(directBoundary.visibleOthers, 0);
    assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ pass:true, screenshotPath, pdfPath, evidencePath, pages:pdf.pages, textLength:pdf.textLength }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
