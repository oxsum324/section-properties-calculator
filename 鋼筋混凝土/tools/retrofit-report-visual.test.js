const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { assertReportPdfTextQuality, assertReportScreenshotQuality } = require('./report-screenshot-quality');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.resolve(
  process.env.RETROFIT_REPORT_OUT
    || (process.env.PREFLIGHT_RUN_DIR
      ? path.join(process.env.PREFLIGHT_RUN_DIR, 'rendered-delivery-evidence', 'rc-retrofit')
      : path.join(repoRoot, 'output', 'playwright'))
);
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname.replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(repoRoot, relative);
    const rootWithSeparator = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
    if (target !== repoRoot && !target.startsWith(rootWithSeparator)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(target) });
      response.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browserPath = browserCandidates.find(candidate => fs.existsSync(candidate));
  assert.ok(browserPath, 'Chrome or Edge executable is required');
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
    args: ['--disable-popup-blocking'],
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/${encodeURIComponent('RC補強斷面性質.html')}`;
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    assert.equal(response?.status(), 200, 'RC retrofit page loads');
    await page.evaluate(() => {
      const setField = (id, value) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setField('projName', 'RC 補強正式報告驗證案');
      setField('projNo', 'RC-RETROFIT-VERIFY-001');
      setField('projDesigner', 'Codex QA');
      setField('b-Vu', '5');
      calcBeam();
    });
    const pageState = await page.evaluate(() => ({
      calculated: !(document.getElementById('b-results')?.innerText || '').includes('請輸入參數後點擊計算'),
      readiness: document.getElementById('b-report-readiness')?.innerText || '',
      readinessStatus: document.getElementById('b-report-readiness')?.dataset.attachmentStatus || '',
    }));
    assert.equal(pageState.calculated, true, 'RC retrofit beam calculation completes');
    assert.ok(pageState.readiness.includes('優先閱讀'), 'RC retrofit page renders page-only readiness');
    assert.ok(pageState.readiness.includes('不會寫入計算書或列印 PDF'), 'RC retrofit page keeps readiness export boundary');
    assert.equal(pageState.readinessStatus, 'ready', 'RC retrofit complete beam is ready to sign');

    const popupPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => exportBeamReport());
    const report = await popupPromise;
    await report.waitForSelector('.rep-paper', { timeout: 15000 });
    await report.setViewportSize({ width: 980, height: 1300 });
    await report.waitForTimeout(300);
    const metrics = await report.evaluate(() => {
      const paper = document.querySelector('.rep-paper')?.cloneNode(true);
      paper?.querySelector('.rep-document-state')?.remove();
      return {
        title: document.querySelector('h1')?.innerText?.trim() || '',
        bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim(),
        calculationText: (paper?.innerText || '').replace(/\s+/g, ' ').trim(),
        documentState: document.querySelector('.rep-document-state')?.dataset.documentState || '',
        documentReason: document.querySelector('.rep-document-state')?.dataset.documentReason || '',
        documentStateText: (document.querySelector('.rep-document-state')?.innerText || '').replace(/\s+/g, ' ').trim(),
        tableCount: document.querySelectorAll('table').length,
        tableHeaderCount: document.querySelectorAll('th').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        elementOverflow: Array.from(document.querySelectorAll('table, th, td, pre, img'))
          .filter(node => node.scrollWidth > node.clientWidth + 2)
          .length,
      };
    });
    assert.equal(metrics.title, 'RC 梁補強斷面計算書', 'RC retrofit report title');
    assert.equal(metrics.documentState, '', 'RC retrofit ready report has no draft classification');
    assert.ok(metrics.tableCount > 0 && metrics.tableHeaderCount > 0, 'RC retrofit report tables expose headings');
    assert.equal(metrics.horizontalOverflow, false, 'RC retrofit report has no horizontal overflow');
    assert.equal(metrics.elementOverflow, 0, 'RC retrofit report tables and media do not overflow');
    for (const forbidden of ['優先建議報告閱讀狀態', '優先閱讀', '頁面輔助', '不會寫入計算書或列印 PDF']) {
      assert.equal(metrics.calculationText.includes(forbidden), false, `RC retrofit report excludes page-only wording: ${forbidden}`);
    }

    const screenshotPath = path.join(outputDir, 'rc-retrofit-beam-report.png');
    const pdfPath = path.join(outputDir, 'rc-retrofit-beam-report.pdf');
    await report.screenshot({ path: screenshotPath, fullPage: true });
    await report.emulateMedia({ media: 'print' });
    await report.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    const screenshotQuality = assertReportScreenshotQuality(screenshotPath, 'RC retrofit beam report', { assert });
    const pdfTextQuality = assertReportPdfTextQuality(pdfPath, 'RC retrofit beam report', {
      assert,
      include: ['計畫名稱', 'RC 補強正式報告驗證案'],
      exclude: ['DRAFT／非正式附件'],
    });
    assert.equal(errors.length, 0, `RC retrofit page/report console errors: ${errors.join(' | ')}`);
    const summary = {
      schemaVersion: 1,
      family: 'rc-retrofit',
      pass: true,
      generatedAt: new Date().toISOString(),
      records: [{
        key: 'rc-retrofit-section',
        artifact: path.basename(pdfPath),
        screenshot: path.basename(screenshotPath),
        title: metrics.title,
        tableCount: metrics.tableCount,
        tableHeaderCount: metrics.tableHeaderCount,
        screenshotQuality,
        pdfTextQuality,
      }],
    };
    fs.writeFileSync(path.join(outputDir, 'rendered-delivery-evidence-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await report.close();

    const metadataDraftPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => {
      const projectNo = document.getElementById('projNo');
      projectNo.value = '';
      projectNo.dispatchEvent(new Event('input', { bubbles: true }));
      exportBeamReport();
    });
    const metadataDraft = await metadataDraftPromise;
    await metadataDraft.waitForSelector('.rep-document-state', { timeout: 10000 });
    const metadataDraftState = await metadataDraft.evaluate(() => ({
      state: document.querySelector('.rep-document-state')?.dataset.documentState || '',
      reason: document.querySelector('.rep-document-state')?.dataset.documentReason || '',
      text: document.querySelector('.rep-document-state')?.innerText || '',
    }));
    assert.deepEqual(
      [metadataDraftState.state, metadataDraftState.reason],
      ['draft', 'review'],
      'RC retrofit report rechecks missing project metadata at export time',
    );
    assert.ok(metadataDraftState.text.includes('計畫編號'), 'RC retrofit draft names missing project number');
    await metadataDraft.close();

    const blockedPopupPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => {
      const setField = (id, value) => {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setField('projNo', 'RC-RETROFIT-VERIFY-001');
      setField('c-Mu', '1000');
      switchTab('col');
      exportColReport();
    });
    const blockedReport = await blockedPopupPromise;
    await blockedReport.waitForSelector('.rep-document-state', { timeout: 10000 });
    const blockedState = await blockedReport.evaluate(() => ({
      state: document.querySelector('.rep-document-state')?.dataset.documentState || '',
      reason: document.querySelector('.rep-document-state')?.dataset.documentReason || '',
    }));
    assert.deepEqual([blockedState.state, blockedState.reason], ['draft', 'blocked'], 'RC retrofit failed column report is blocked draft');
    await blockedReport.close();
    await page.close();
    console.log(`RC retrofit report visual smoke OK (summary=${path.join(outputDir, 'rendered-delivery-evidence-summary.json')})`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
