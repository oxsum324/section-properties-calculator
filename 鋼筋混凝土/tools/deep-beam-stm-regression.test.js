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
  const mime = {
    '.html':'text/html; charset=utf-8',
    '.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8',
  };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = path.normalize(path.join(rootDir, pathname === '/' ? 'index.html' : pathname));
    const rel = path.relative(rootDir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
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

    const url = `http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/deep-beam-stm.html`;
    const response = await page.goto(url, { waitUntil:'load', timeout:30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.DeepBeamSTM && window.calculateDeepBeamSTM);
    assert.match(await page.locator('#statusBanner').innerText(), /計算檢核符合.+人工複核/);
    assert.equal(await page.locator('#stmDiagram svg').count(), 1);
    assert.equal(await page.locator('#checkRows tr').count(), 15);
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'review');
    assert.equal(await page.locator('#resAsReq .value').innerText(), '124.01');
    assert.equal(await page.locator('#resTieRows .value').innerText(), '10+10');
    assert.equal(await page.locator('#tieSectionDiagram svg').count(), 1);

    await page.fill('#tieRows', '3');
    await page.click('#btnCalc');
    assert.equal(await page.locator('#resTieRows .value').innerText(), '7+7+6');
    assert.match(await page.locator('#checkRows').innerText(), /拉桿水平淨距/);
    assert.match(await page.locator('#checkRows').innerText(), /拉桿層間淨距/);

    await page.check('#geometryConfirmed');
    await page.check('#anchorageConfirmed');
    await page.click('#btnCalc');
    assert.match(await page.locator('#statusBanner').innerText(), /模型與錨定已確認/);
    assert.equal(await page.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'ready');

    const screenshotPath = path.join(OUT_SCREEN, 'deep-beam-stm-page.png');
    await page.screenshot({ path:screenshotPath, fullPage:true });
    assert.ok(fs.statSync(screenshotPath).size > 10000);

    const popupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const report = await popupPromise;
    await report.waitForLoadState('load');
    await report.waitForSelector('.rep-paper');
    const reportText = await report.locator('body').innerText();
    for (const needle of [
      'RC 深梁壓拉桿模型檢核計算書',
      '對稱單跨簡支深梁',
      '底部拉桿提供量',
      '同層水平淨距',
      '多層垂直淨距',
      '上層鋼筋直接位於下層鋼筋之上',
      '底部拉桿多排斷面配置',
      '上部 CCC 節點',
      '23.4.4 剪力條件',
      '壓拉桿力流示意圖',
      '文件狀態：內部審閱',
      '工具版本V0.3',
    ]) assert.ok(reportText.replace(/\s+/g, '').includes(needle.replace(/\s+/g, '')), `report includes ${needle}`);
    for (const forbidden of ['DRAFT', '產報前檢查', '頁面輔助', '本頁支援範圍']) {
      assert.ok(!reportText.includes(forbidden), `report excludes ${forbidden}`);
    }
    assert.equal(await report.locator('.rep-diagram img').count(), 2);
    await report.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('.rep-diagram img'));
      return images.length === 2 && images.every(img => img.complete && img.naturalWidth > 300);
    }, null, { timeout:10000 });

    const pdfPath = path.join(OUT_PDF, 'deep-beam-stm-report.pdf');
    await report.pdf({ path:pdfPath, format:'A4', printBackground:true, margin:{ top:'10mm', right:'8mm', bottom:'10mm', left:'8mm' } });
    assert.ok(fs.statSync(pdfPath).size > 20000);
    const pdf = readPdfTextWithPoppler(pdfPath);
    assert.equal(pdf.pages, 3, `expected stable three-page report, pages=${pdf.pages}`);
    assert.ok(pdf.textLength > 1200, `expected report text, length=${pdf.textLength}`);
    for (const needle of ['RC 深梁壓拉桿模型檢核計算書', '底部拉桿提供量', '同層水平淨距', '3 排（7+7+6支）', '文件狀態：內部審閱']) {
      assert.ok(pdf.text.includes(needle), `PDF includes ${needle}`);
    }
    assert.match(pdf.text, /25\.2\.2[\s\S]{0,200}層鋼筋直接位於下層鋼筋之上/, 'PDF preserves 25.2.2 vertical alignment statement across table wrapping');
    assert.ok(!pdf.text.includes('產報前檢查'));

    const portableHtml = await assertPortableFormalHtml(report, 'RC deep-beam STM report', assertCheck, {
      outputDir:OUT_FORMAL,
      continuationContextLabels:['壓拉桿力流示意圖'],
    });
    assert.equal(portableHtml.calculationFingerprint, await report.locator('.rep-attachment-approval-source').getAttribute('data-calculation-fingerprint'));
    const evidence = {
      schemaVersion:1,
      key:'deep-beam-stm',
      href:'/rc-deep-beam-stm',
      title:'RC 深梁 STM',
      sourcePage:'鋼筋混凝土/tools/deep-beam-stm.html',
      pdfPath:path.basename(pdfPath),
      screenshotPath:path.basename(screenshotPath),
      artifactIntegrity:[
        captureArtifactIntegrity(pdfPath, 'reportPdf'),
        captureArtifactIntegrity(screenshotPath, 'reportScreenshot'),
      ],
      metrics:{ pages:pdf.pages, textLength:pdf.textLength, calculationFingerprint:portableHtml.calculationFingerprint },
      portableHtml,
    };
    const evidencePath = path.join(OUT_FORMAL, 'deep-beam-stm-formal-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await report.close();

    await page.emulateMedia({ media:'print' });
    const directBoundary = await page.evaluate(() => ({
      boundaryRects:document.querySelector('.rc-direct-print-boundary')?.getClientRects().length || 0,
      visibleOthers:Array.from(document.body.children).filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0).length,
    }));
    assert.ok(directBoundary.boundaryRects > 0);
    assert.equal(directBoundary.visibleOthers, 0);

    await page.emulateMedia({ media:'screen' });
    const beamUrl = `http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/beam.html`;
    await page.goto(beamUrl, { waitUntil:'load', timeout:30000 });
    await page.waitForFunction(() => typeof window.calcBeam === 'function');
    await page.evaluate(() => {
      document.getElementById('h').value = '400';
      document.getElementById('ln').value = '1000';
      document.getElementById('Vu').value = '250';
      window.calcBeam();
    });
    const handoff = page.locator('#deepBeamNotice .deep-beam-tool-link');
    await handoff.waitFor({ state:'visible' });
    const href = await handoff.getAttribute('href');
    assert.ok(href.startsWith('deep-beam-stm.html?'));
    assert.ok(href.includes('h=400'));
    assert.ok(href.includes('ln=1000'));
    assert.ok(href.includes('Pu=500'));
    const handoffResponse = await page.goto(new URL(href, beamUrl).toString(), { waitUntil:'load', timeout:30000 });
    assert.equal(handoffResponse.status(), 200);
    assert.equal(await page.inputValue('#h'), '400');
    assert.equal(await page.inputValue('#ln'), '1000');
    assert.equal(await page.inputValue('#Pu'), '500');
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ pass:true, screenshotPath, pdfPath, evidencePath, pages:pdf.pages, textLength:pdf.textLength }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
