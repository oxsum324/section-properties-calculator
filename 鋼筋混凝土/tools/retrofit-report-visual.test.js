const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { assertReportPdfTextQuality, assertReportScreenshotQuality, captureArtifactIntegrity } = require('./report-screenshot-quality');
const { assertPortableFormalHtml } = require('./report-portable-html-check');
const { buildRcResultReconciliation } = require('./report-result-reconciliation');

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

async function captureRetrofitSourceSnapshot(page, kind) {
  return page.evaluate(sourceKind => {
    const prefix = sourceKind === 'beam' ? 'b-' : 'c-';
    const fields = Array.from(document.querySelectorAll('input[id], select[id], textarea[id]'))
      .filter(node => node.id.startsWith(prefix))
      .map(node => ({
        id: node.id,
        type: node.type || node.tagName.toLowerCase(),
        value: node.value,
        checked: Boolean(node.checked),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const result = sourceKind === 'beam' ? lastBeam : lastCol;
    return JSON.parse(JSON.stringify({
      schemaVersion: 1,
      kind: `rc-retrofit-${sourceKind}-form-snapshot`,
      fields,
      result,
    }));
  }, kind);
}

async function replayRetrofitSourceSnapshot(page, kind, sourceSnapshot) {
  const replayed = await page.evaluate(({ sourceKind, snapshot }) => {
    const perturbId = sourceKind === 'beam' ? 'b-Vu' : 'c-Mu';
    const perturb = document.getElementById(perturbId);
    if (perturb) {
      perturb.value = String(Number(perturb.value || 0) + 7);
      perturb.dispatchEvent(new Event('input', { bubbles: true }));
      perturb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (sourceKind === 'beam') calcBeam(); else calcCol();
    const perturbedResult = JSON.parse(JSON.stringify(sourceKind === 'beam' ? lastBeam : lastCol));
    for (const field of snapshot.fields) {
      const node = document.getElementById(field.id);
      if (!node) throw new Error(`Missing retrofit replay field: ${field.id}`);
      if (node.type === 'checkbox' || node.type === 'radio') node.checked = field.checked;
      else node.value = field.value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (sourceKind === 'beam') calcBeam(); else calcCol();
    const result = JSON.parse(JSON.stringify(sourceKind === 'beam' ? lastBeam : lastCol));
    return { perturbedResult, result };
  }, { sourceKind: kind, snapshot: sourceSnapshot });
  assert.notDeepEqual(replayed.perturbedResult, sourceSnapshot.result, `RC retrofit ${kind} perturbation changes calculated results before replay`);
  assert.deepEqual(replayed.result, sourceSnapshot.result, `RC retrofit ${kind} form snapshot replays the same calculated results`);
  return replayed.result;
}

async function openReplayReportFingerprint(page, exportFunctionName) {
  const popupPromise = page.context().waitForEvent('page', { timeout: 15000 });
  await page.evaluate(name => window[name](), exportFunctionName);
  const replayReport = await popupPromise;
  await replayReport.waitForSelector('.rep-attachment-approval-source', { state: 'attached', timeout: 15000 });
  const fingerprint = await replayReport.locator('.rep-attachment-approval-source').getAttribute('data-calculation-fingerprint');
  await replayReport.close();
  return fingerprint || '';
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

    const beamSourceSnapshotBase = await captureRetrofitSourceSnapshot(page, 'beam');

    const popupPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => exportBeamReport());
    const report = await popupPromise;
    await report.waitForSelector('.rep-paper', { timeout: 15000 });
    await report.setViewportSize({ width: 980, height: 1300 });
    await report.waitForTimeout(300);
    const metrics = await report.evaluate(() => {
      const paper = document.querySelector('.rep-paper')?.cloneNode(true);
      paper?.querySelector('.rep-document-status-line')?.remove();
      return {
        title: document.querySelector('h1')?.innerText?.trim() || '',
        bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim(),
        calculationText: (paper?.innerText || '').replace(/\s+/g, ' ').trim(),
        documentState: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
        documentApproved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
        documentStateText: (document.querySelector('.rep-document-status-line')?.innerText || '').replace(/\s+/g, ' ').trim(),
        tableCount: document.querySelectorAll('table').length,
        tableHeaderCount: document.querySelectorAll('th').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        elementOverflow: Array.from(document.querySelectorAll('table, th, td, pre, img'))
          .filter(node => node.scrollWidth > node.clientWidth + 2)
          .length,
      };
    });
    assert.equal(metrics.title, 'RC 梁補強斷面計算書', 'RC retrofit report title');
    assert.equal(metrics.documentState, 'internal-review', 'RC retrofit report defaults to printable internal review');
    assert.ok(metrics.tableCount > 0 && metrics.tableHeaderCount > 0, 'RC retrofit report tables expose headings');
    assert.equal(metrics.horizontalOverflow, false, 'RC retrofit report has no horizontal overflow');
    assert.equal(metrics.elementOverflow, 0, 'RC retrofit report tables and media do not overflow');
    for (const forbidden of ['優先建議報告閱讀狀態', '優先閱讀', '頁面輔助', '不會寫入計算書或列印 PDF', '本結果為標稱強度計算', '本結果為補強初估']) {
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
      include: ['計畫名稱', 'RC 補強正式報告驗證案', '文件狀態：內部審閱'],
      exclude: ['DRAFT／非正式附件'],
    });
    const portableBeamHtml = await assertPortableFormalHtml(report, 'RC retrofit beam report', assert, { outputDir });
    assert.equal(errors.length, 0, `RC retrofit page/report console errors: ${errors.join(' | ')}`);
    const beamSourceSnapshot = {
      ...beamSourceSnapshotBase,
      calculationFingerprint: portableBeamHtml.calculationFingerprint,
    };
    await report.close();
    await replayRetrofitSourceSnapshot(page, 'beam', beamSourceSnapshot);
    const replayBeamFingerprint = await openReplayReportFingerprint(page, 'exportBeamReport');
    assert.equal(replayBeamFingerprint, portableBeamHtml.calculationFingerprint, 'RC retrofit beam replay keeps the original report calculation fingerprint');
    const beamResultReconciliation = buildRcResultReconciliation({
      strategy: 'rc-form-replay-to-report-fingerprint',
      caseId: 'rc-retrofit-section',
      sourceSnapshot: beamSourceSnapshot,
      reportCalculationFingerprint: replayBeamFingerprint,
      verifiedAssertionCount: 6,
    });
    const summary = {
      schemaVersion: 1,
      family: 'rc-retrofit',
      pass: true,
      generatedAt: new Date().toISOString(),
      records: [{
        key: 'rc-retrofit-section',
        artifact: path.basename(pdfPath),
        htmlArtifact: portableBeamHtml.htmlArtifact,
        screenshot: path.basename(screenshotPath),
        title: metrics.title,
        tableCount: metrics.tableCount,
        tableHeaderCount: metrics.tableHeaderCount,
        screenshotQuality,
        pdfTextQuality,
        artifactIntegrity: [
          captureArtifactIntegrity(pdfPath, 'reportPdf'),
          captureArtifactIntegrity(screenshotPath, 'reportScreenshot'),
        ],
        metrics: { calculationFingerprint: portableBeamHtml.calculationFingerprint },
        calculationFingerprint: portableBeamHtml.calculationFingerprint,
        portableHtml: portableBeamHtml,
        resultReconciliation: beamResultReconciliation,
      }],
    };

    const metadataReviewPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => {
      const projectNo = document.getElementById('projNo');
      projectNo.value = '';
      projectNo.dispatchEvent(new Event('input', { bubbles: true }));
      exportBeamReport();
    });
    const metadataReview = await metadataReviewPromise;
    await metadataReview.waitForSelector('.rep-document-status-line', { timeout: 10000 });
    const metadataReviewState = await metadataReview.evaluate(() => ({
      state: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      approved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      labels: [...document.querySelectorAll('.rep-meta b')].map(node => node.textContent?.trim() || ''),
      bodyText: document.body.innerText || '',
    }));
    assert.deepEqual([metadataReviewState.state, metadataReviewState.approved], ['internal-review', 'false'], 'RC retrofit blank project metadata remains printable for internal review');
    assert.equal(metadataReviewState.labels.includes('計畫編號'), false, 'RC retrofit blank project number row is omitted');
    assert.equal(metadataReviewState.bodyText.includes('DRAFT／非正式附件'), false, 'RC retrofit blank project metadata does not create DRAFT');
    await metadataReview.close();

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
      calcCol();
    });
    const columnSourceSnapshotBase = await captureRetrofitSourceSnapshot(page, 'column');
    const blockedPopupPromise = page.context().waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => exportColReport());
    const blockedReport = await blockedPopupPromise;
    await blockedReport.waitForSelector('.rep-document-status-line', { timeout: 10000 });
    const blockedState = await blockedReport.evaluate(() => ({
      state: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      approved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
    }));
    assert.deepEqual([blockedState.state, blockedState.approved], ['internal-review', 'false'], 'RC retrofit failed column report remains printable and defaults to internal review');
    await blockedReport.check('#repAttachmentApproval');
    const approvedBlockedState = await blockedReport.evaluate(() => ({
      state: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      text: document.querySelector('.rep-document-status-line')?.innerText || '',
    }));
    assert.equal(approvedBlockedState.state, 'formal-attachment', 'RC retrofit NG calculation can be explicitly approved as a truthful formal attachment');
    assert.ok(approvedBlockedState.text.includes('核可時間'), 'RC retrofit formal attachment records approval time');
    const portableBlockedHtml = await assertPortableFormalHtml(blockedReport, 'RC retrofit NG column report', assert, { outputDir });
    const columnSourceSnapshot = {
      ...columnSourceSnapshotBase,
      calculationFingerprint: portableBlockedHtml.calculationFingerprint,
    };
    await blockedReport.close();
    await replayRetrofitSourceSnapshot(page, 'column', columnSourceSnapshot);
    const replayColumnFingerprint = await openReplayReportFingerprint(page, 'exportColReport');
    assert.equal(replayColumnFingerprint, portableBlockedHtml.calculationFingerprint, 'RC retrofit column replay keeps the original report calculation fingerprint');
    const columnResultReconciliation = buildRcResultReconciliation({
      strategy: 'rc-form-replay-to-report-fingerprint',
      caseId: 'rc-retrofit-ng-column-formal-html',
      sourceSnapshot: columnSourceSnapshot,
      reportCalculationFingerprint: replayColumnFingerprint,
      verifiedAssertionCount: 6,
    });
    summary.records.push({
      key: 'rc-retrofit-ng-column-formal-html',
      htmlArtifact: portableBlockedHtml.htmlArtifact,
      title: portableBlockedHtml.reportTitle,
      metrics: { calculationFingerprint: portableBlockedHtml.calculationFingerprint },
      calculationFingerprint: portableBlockedHtml.calculationFingerprint,
      portableHtml: portableBlockedHtml,
      resultReconciliation: columnResultReconciliation,
    });
    fs.writeFileSync(path.join(outputDir, 'rendered-delivery-evidence-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await page.close();
    console.log(`RC retrofit report visual smoke OK (downloads=${portableBeamHtml.downloadedFileName}, ${portableBlockedHtml.downloadedFileName}; summary=${path.join(outputDir, 'rendered-delivery-evidence-summary.json')})`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
