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
      res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.mkdirSync(OUT_SCREEN, { recursive:true });
  fs.mkdirSync(OUT_PDF, { recursive:true });
  fs.mkdirSync(OUT_FORMAL, { recursive:true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(chromePath, 'Chrome or Edge executable is required');
  const consoleErrors = [];
  const pageErrors = [];
  let server;
  let browser;
  try {
    server = await serve(ROOT);
    const port = server.address().port;
    browser = await chromium.launch({ headless:true, executablePath:chromePath });
    const page = await browser.newPage({ viewport:{ width:1440, height:1100 } });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    const url = `http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/pile-cap-3d-stm.html`;
    const response = await page.goto(url, { waitUntil:'load', timeout:30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.PileCap3DSTM && window.calculatePileCap3DSTM);
    assert.equal(await page.locator('#fy').getAttribute('max'), '5600');
    assert.equal(await page.locator('#lambda').getAttribute('max'), '1');
    await page.fill('#lambda', '1.01');
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /λ 不得大於 1\.0/);
    await page.fill('#lambda', '1');
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /尚有 5 項模型採用確認/);
    assert.equal(await page.locator('#planDiagram svg').count(), 1);
    assert.equal(await page.locator('#isoDiagram svg').count(), 1);
    assert.equal(await page.locator('#resReaction .value').innerText(), '400.00');
    assert.equal(await page.locator('#resMoments .value').innerText(), '0.000 / 0.000');
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'review');

    await page.fill('#My', '60');
    await page.fill('#pileReactions', 'P1, -150, -150, 90\nP2, 150, -150, 110\nP3, -150, 150, 90\nP4, 150, 150, 110');
    await page.click('#btnCalc');
    assert.equal(await page.locator('#resLoadPoint .value').innerText(), '15.0 / 0.0');
    assert.equal(await page.locator('#resMoments .value').innerText(), '0.000 / 0.000');
    assert.match(await page.locator('#checkRows').innerText(), /Mux \/ Muy 平衡/);
    assert.match(await page.locator('#checkRows').innerText(), /X 向拉桿/);
    assert.match(await page.locator('#checkRows').innerText(), /Y 向拉桿/);

    for (const id of ['reactionSourceConfirmed','threeDimensionalTopologyConfirmed','nodalGeometryConfirmed','anchorageConfirmed','localTieDistributionConfirmed']) {
      await page.check(`#${id}`);
    }
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /數值檢核與模型採用確認完成/);
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'ready');

    const screenshotPath = path.join(OUT_SCREEN, 'pile-cap-3d-stm-page.png');
    await page.screenshot({ path:screenshotPath, fullPage:true });
    assert.ok(fs.statSync(screenshotPath).size > 15000);

    const popupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const report = await popupPromise;
    await report.waitForLoadState('load');
    await report.waitForSelector('.rep-paper');
    const reportText = await report.locator('body').innerText();
    for (const needle of [
      'RC 樁帽三維壓拉桿模型檢核計算書',
      '完整矩形正交樁群三維 STM',
      'Pu / Mux / Muy',
      '載重合力節點 x / y',
      '三維邊界合力與平衡',
      '數值門檻（非條文值）',
      '|ΣR−Pu| / Pu ≤ 2.0%',
      '|Σ(Ri yi)−Mux×100| / (Pu Ly/2) ≤ 1.0%',
      '|Σ(Ri xi)−Muy×100| / (Pu Lx/2) ≤ 1.0%',
      'X 向水平力平衡',
      'Y 向水平力平衡',
      '|ΣHx| / Σ|Hx,i| ≤ 1.0%',
      '|ΣHy| / Σ|Hy,i| ≤ 1.0%',
      'X/Y 底部拉桿強度與配置',
      '三維壓桿與節點區強度',
      '13.4.6.1',
      '23.2.7',
      '文件狀態：內部審閱',
      '工具版本V0.5',
    ]) assert.ok(reportText.replace(/\s+/g, '').includes(needle.replace(/\s+/g, '')), `report includes ${needle}`);
    for (const forbidden of ['DRAFT','產報前檢查','頁面輔助','本頁支援範圍','優先處理']) {
      assert.ok(!reportText.includes(forbidden), `report excludes ${forbidden}`);
    }
    assert.ok(!reportText.replace(/\s+/g, '').includes('13.2.6.3：|ΣR−Pu|/Pu≤2.0%'), 'tool tolerance is not attributed to clause 13.2.6.3');
    assert.equal(await report.locator('.rep-diagram img').count(), 2);
    await report.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('.rep-diagram img'));
      return images.length === 2 && images.every(img => img.complete && img.naturalWidth > 300);
    }, null, { timeout:10000 });

    const pdfPath = path.join(OUT_PDF, 'pile-cap-3d-stm-report.pdf');
    await report.pdf({ path:pdfPath, format:'A4', printBackground:true, margin:{ top:'10mm', right:'8mm', bottom:'10mm', left:'8mm' } });
    assert.ok(fs.statSync(pdfPath).size > 25000);
    const pdf = readPdfTextWithPoppler(pdfPath);
    assert.ok(pdf.pages >= 3 && pdf.pages <= 6, `expected 3-6 report pages, pages=${pdf.pages}`);
    assert.ok(pdf.textLength > 1800, `expected report text, length=${pdf.textLength}`);
    for (const needle of ['RC 樁帽三維壓拉桿模型檢核計算書','完整矩形正交樁群三維 STM','X 向水平力平衡','Y 向水平力平衡','X 向拉桿需求','Y 向拉桿需求','文件狀態：內部審閱']) {
      assert.ok(pdf.text.includes(needle), `PDF includes ${needle}`);
    }
    const normalizedPdfText = pdf.text.replace(/\s+/g, '');
    assert.ok(normalizedPdfText.includes('數值門檻（非條文值）'), 'PDF identifies the numerical tolerance as a non-clause numerical gate');
    assert.ok(!normalizedPdfText.includes('13.2.6.3：|ΣR−Pu|/Pu≤2.0%'), 'PDF does not attribute the tool tolerance to clause 13.2.6.3');
    assert.ok(!pdf.text.includes('產報前檢查'));

    const portableHtml = await assertPortableFormalHtml(report, 'RC pile-cap 3D STM report', assertCheck, {
      outputDir:OUT_FORMAL,
      continuationContextLabels:['樁帽平面配置與三維力流'],
    });
    assert.equal(portableHtml.calculationFingerprint, await report.locator('.rep-attachment-approval-source').getAttribute('data-calculation-fingerprint'));
    const evidence = {
      schemaVersion:1,
      key:'pile-cap-3d-stm',
      href:'/rc-foundation',
      title:'RC 樁帽三維壓拉桿模型',
      sourcePage:'鋼筋混凝土/tools/pile-cap-3d-stm.html',
      pdfPath:path.basename(pdfPath),
      screenshotPath:path.basename(screenshotPath),
      artifactIntegrity:[
        captureArtifactIntegrity(pdfPath, 'reportPdf'),
        captureArtifactIntegrity(screenshotPath, 'reportScreenshot'),
      ],
      metrics:{ pages:pdf.pages, textLength:pdf.textLength, calculationFingerprint:portableHtml.calculationFingerprint },
      portableHtml,
    };
    const evidencePath = path.join(OUT_FORMAL, 'pile-cap-3d-stm-formal-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await report.close();

    await page.emulateMedia({ media:'print' });
    const directBoundary = await page.evaluate(() => ({
      boundaryRects:document.querySelector('.rc-direct-print-boundary')?.getClientRects().length || 0,
      visibleOthers:Array.from(document.body.children).filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0).length,
    }));
    assert.ok(directBoundary.boundaryRects > 0);
    assert.equal(directBoundary.visibleOthers, 0);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ pass:true, screenshotPath, pdfPath, evidencePath, pages:pdf.pages, textLength:pdf.textLength }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
