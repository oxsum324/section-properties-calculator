'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  CANONICAL_RENDER_EVIDENCE_KIND,
  resolveEvidenceDir,
  validatePdfFile,
  writeEvidenceSummary,
} = require('./結構工具箱/tools/rendered-delivery-evidence.js');
const AttachmentPackageChecker = require('./結構工具箱/tools/attachment-package-check.js');
const analysisSectionMetadata = require('./結構工具箱/tools/analysis-section-tool-metadata.js');

const repoRoot = __dirname;
const frameMetadata = analysisSectionMetadata['frame-analysis'];
assert.ok(frameMetadata, 'frame-analysis canonical metadata exists');
const outDir = path.resolve(
  process.env.FRAME_ANALYSIS_BROWSER_OUT
    || resolveEvidenceDir(repoRoot, 'frame-analysis-formal')
);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  path.join(repoRoot, '.github', 'pages-smoke', 'node_modules', 'playwright'),
].filter(Boolean);
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const project = {
  name: '平面剛架正式化驗證工程',
  no: 'FA-BROWSER-2026-001',
  designer: '正式工具瀏覽器驗證',
  note: '懸臂端點水平力封閉解與案例回放',
  basis: 'S-201；FA-BM-01；專案指定固定端懸臂模型與一階線彈性分析',
};

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function loadPlaywright() {
  for (const candidate of playwrightCandidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Playwright runtime not found; install the pinned .github/pages-smoke runtime first.');
}

function findBrowser() {
  const candidate = browserCandidates.find(file => fs.existsSync(file));
  if (!candidate) throw new Error('Chrome or Edge executable not found.');
  return candidate;
}

function contentType(file) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relative = pathname.replace(/^\/+/, '');
      const file = path.resolve(repoRoot, relative || 'index.html');
      const safePrefix = `${repoRoot}${path.sep}`.toLowerCase();
      if (!file.toLowerCase().startsWith(safePrefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': contentType(file),
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message || String(error));
    }
  });
}

async function fillProject(page, values) {
  await page.fill('#projName', values.name || '');
  await page.fill('#projNo', values.no || '');
  await page.fill('#projDesigner', values.designer || '');
  await page.fill('#projNote', values.note || '');
  await page.fill('#projBasis', values.basis || '');
  await page.evaluate(() => renderFrameReportReadiness());
}

async function openReport(page) {
  const [report] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#btnReport'),
  ]);
  await report.waitForLoadState('domcontentloaded');
  await report.waitForSelector('.rep-document-status-line');
  await report.waitForFunction(() => typeof serializeReportDocumentHtml === 'function');
  return report;
}

function verifyDualSeals(approvedHtml) {
  const contentSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(approvedHtml);
  const approvalSeal = AttachmentPackageChecker.verifyFormalHtmlApprovalSeal(approvedHtml);
  assert.equal(contentSeal.status, 'verified', 'approved HTML content seal verifies');
  assert.equal(contentSeal.scope, AttachmentPackageChecker.FORMAL_CONTENT_SEAL_SCOPE);
  assert.equal(contentSeal.expectedSha256, contentSeal.actualSha256);
  assert.equal(approvalSeal.status, 'verified', 'approved HTML approval seal verifies');
  assert.equal(approvalSeal.scope, AttachmentPackageChecker.FORMAL_APPROVAL_SEAL_SCOPE);
  assert.equal(approvalSeal.expectedSha256, approvalSeal.actualSha256);

  const contentBoundary = approvedHtml.lastIndexOf(AttachmentPackageChecker.FORMAL_CONTENT_SEAL_START);
  assert.ok(contentBoundary >= 0, 'approved HTML exposes a governed calculation-content boundary');
  const contentInsertAt = contentBoundary + AttachmentPackageChecker.FORMAL_CONTENT_SEAL_START.length;
  const contentTamperedHtml = `${approvedHtml.slice(0, contentInsertAt)}<p>異動後計算內容</p>${approvedHtml.slice(contentInsertAt)}`;
  const contentTamper = AttachmentPackageChecker.verifyFormalHtmlContentSeal(contentTamperedHtml);
  assert.equal(contentTamper.status, 'failed', 'calculation-content tampering invalidates the content seal');
  assert.ok(contentTamper.reasons.includes('content-sha256-mismatch'));

  const approvalTamperedHtml = approvedHtml.replace(
    /(rep-attachment-approval-source[^>]*data-approved-at=")[^"]+/i,
    (_, prefix) => `${prefix}2000-01-01T00:00:00.000Z`
  );
  assert.notEqual(approvalTamperedHtml, approvedHtml, 'approval provenance is present and can be tamper-probed');
  const approvalTamperContentSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(approvalTamperedHtml);
  const approvalTamper = AttachmentPackageChecker.verifyFormalHtmlApprovalSeal(approvalTamperedHtml);
  assert.equal(approvalTamperContentSeal.status, 'verified', 'approval-only tampering leaves calculation content intact');
  assert.equal(approvalTamper.status, 'failed', 'approval-only tampering invalidates the approval seal');
  assert.ok(approvalTamper.reasons.includes('approval-sha256-mismatch'));

  return {
    contentSeal,
    approvalSeal,
    contentTamper,
    approvalTamper,
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = loadPlaywright();
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  let browser = null;
  let context = null;
  const pageErrors = [];
  const attachErrorCapture = page => {
    page.on('pageerror', error => pageErrors.push(error.message || String(error)));
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });
  };

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: findBrowser(),
    });
    context = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    attachErrorCapture(page);
    const pageUrl = `http://127.0.0.1:${port}/${encodeURIComponent('鋼架')}/${encodeURIComponent('平面剛架分析.html')}`;
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (
      typeof loadExample === 'function'
      && typeof runAnalysis === 'function'
      && typeof frameReportReadinessModel === 'function'
      && typeof buildFrameCasePayload === 'function'
      && typeof applyImportedFrameCase === 'function'
      && Boolean(state.solution)
    ));

    await page.emulateMedia({ media: 'print' });
    const directPrint = await page.evaluate(() => {
      const boundary = document.querySelector('.formal-direct-print-boundary');
      const visibleNonBoundary = Array.from(document.body.children).filter(node => (
        node !== boundary
        && !['SCRIPT', 'STYLE'].includes(node.tagName)
        && node.getClientRects().length > 0
      ));
      return {
        boundaryVisible: Boolean(boundary && boundary.getClientRects().length),
        boundaryText: String(boundary?.innerText || '').replace(/\s+/g, ' ').trim(),
        visibleNonBoundaryCount: visibleNonBoundary.length,
      };
    });
    assert.equal(directPrint.boundaryVisible, true, 'direct print exposes the blocking boundary');
    assert.equal(directPrint.visibleNonBoundaryCount, 0, 'direct print hides the operating interface');
    for (const needle of ['分析工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件']) {
      assert.ok(directPrint.boundaryText.includes(needle), `direct-print boundary includes ${needle}`);
    }
    await page.emulateMedia({ media: 'screen' });

    // Exercise a real review state: the released-end example requires a project basis.
    await page.evaluate(() => loadExample('portalHinge'));
    await fillProject(page, { ...project, basis: '' });
    const reviewReadiness = await page.evaluate(() => frameReportReadinessModel());
    assert.equal(reviewReadiness.level, 'review', 'missing project basis keeps governed assumptions in review');
    assert.ok(reviewReadiness.reviewItems.some(item => /端部釋放/.test(item)));
    assert.ok(reviewReadiness.reviewItems.some(item => /專案文件依據/.test(item)));

    const reviewReport = await openReport(page);
    attachErrorCapture(reviewReport);
    const reviewReportState = await reviewReport.evaluate(() => {
      const approval = document.getElementById('repAttachmentApproval');
      const status = document.querySelector('.rep-document-status-line');
      const initial = {
        title: document.title,
        documentClass: status?.dataset.documentClass || '',
        statusText: String(status?.textContent || '').replace(/\s+/g, ' ').trim(),
        bodyText: String(document.body.innerText || '').replace(/\s+/g, ' ').trim(),
        disabled: Boolean(approval?.disabled),
      };
      if (approval) {
        approval.checked = true;
        approval.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        ...initial,
        attemptedDocumentClass: status?.dataset.documentClass || '',
        attemptedChecked: Boolean(approval?.checked),
      };
    });
    assert.equal(reviewReportState.documentClass, 'internal-review');
    assert.match(reviewReportState.title, /內部審閱/);
    assert.ok(reviewReportState.statusText.includes('文件狀態：內部審閱'));
    assert.equal(reviewReportState.attemptedDocumentClass, 'internal-review', 'review report cannot be promoted by forcing the checkbox');
    assert.ok(reviewReportState.disabled || !reviewReportState.attemptedChecked, 'review report exposes a non-approvable control state');
    await reviewReport.close();

    const oldReportLink = await page.evaluate(() => {
      const link = document.getElementById('reportLink');
      return {
        href: link?.getAttribute('href') || '',
        visible: Boolean(link && getComputedStyle(link).display !== 'none'),
      };
    });
    assert.match(oldReportLink.href, /^blob:/, 'generated review report exposes its current blob link');
    assert.equal(oldReportLink.visible, true);

    // Canonical formal case: fixed-free cantilever, 6 m, 1 tf horizontal tip load.
    await page.evaluate(() => loadExample('cantilever'));
    const invalidatedReportLink = await page.evaluate(() => {
      const link = document.getElementById('reportLink');
      return {
        href: link?.getAttribute('href') || '',
        visible: Boolean(link && getComputedStyle(link).display !== 'none'),
      };
    });
    assert.equal(invalidatedReportLink.href, '', 'model changes clear the stale report URL');
    assert.equal(invalidatedReportLink.visible, false, 'model changes hide the stale report link');
    await fillProject(page, project);
    await page.evaluate(() => runAnalysis());
    const canonical = await page.evaluate(() => {
      const trace = buildFrameCalculationTrace();
      return {
        readiness: frameReportReadinessModel(),
        fingerprint: trace.calculationFingerprint,
        version: FRAME_PUBLIC_VERSION,
        calculationEngine: FRAME_CALCULATION_ENGINE,
        tipUx: state.solution.d[3],
        baseMoment: state.solution.reactions[2],
        equilibriumOk: state.solution.equilibrium?.ok,
        solverPassed: state.solution.solverDiagnostics?.passed,
        payload: buildFrameCasePayload(),
      };
    });
    assert.equal(canonical.readiness.level, 'ready');
    assert.match(canonical.fingerprint, /^CF-[0-9A-F]{16}$/);
    assert.equal(canonical.version, frameMetadata.version);
    assert.equal(canonical.calculationEngine, frameMetadata.calculationEngine);
    assert.equal(canonical.payload.calculationFingerprint, canonical.fingerprint);
    assert.equal(canonical.payload.report.calculationFingerprint, canonical.fingerprint);

    const expectedTipUx = (1 * Math.pow(6, 3)) / (3 * 2040 * 13600 * 1e-4);
    assert.ok(Math.abs(canonical.tipUx - expectedTipUx) <= 1e-10, `cantilever tip displacement matches PL^3/(3EI): ${canonical.tipUx}`);
    assert.ok(Math.abs(Math.abs(canonical.baseMoment) - 6) <= 1e-10, `cantilever base moment matches PL: ${canonical.baseMoment}`);
    assert.equal(canonical.equilibriumOk, true);
    assert.equal(canonical.solverPassed, true);

    const sourceName = 'frame-analysis-cantilever-tip-load-source.json';
    const sourcePath = path.join(outDir, sourceName);
    const sourceBuffer = Buffer.from(`${JSON.stringify(canonical.payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(sourcePath, sourceBuffer);
    const sourceSnapshotSha256 = sha256(sourceBuffer);

    await page.evaluate(() => {
      updateNodalLoad(0, 'Fx', 1.75);
      runAnalysis();
    });
    const mutationFingerprint = await page.evaluate(() => buildFrameCalculationTrace().calculationFingerprint);
    assert.notEqual(mutationFingerprint, canonical.fingerprint, 'engineering input mutation changes the calculation fingerprint');

    await page.setInputFiles('#jsonFile', {
      name: sourceName,
      mimeType: 'application/json',
      buffer: sourceBuffer,
    });
    await page.waitForFunction(fingerprint => (
      document.querySelector('#reportStatus')?.textContent.includes('已重現計算指紋')
      && buildFrameCalculationTrace().calculationFingerprint === fingerprint
    ), canonical.fingerprint);
    const replay = await page.evaluate(() => ({
      load: state.nodalLoads[0]?.Fx,
      fingerprint: buildFrameCalculationTrace().calculationFingerprint,
      project: getFrameProjectInfo(),
    }));
    assert.equal(replay.load, 1);
    assert.equal(replay.fingerprint, canonical.fingerprint);
    assert.deepEqual(replay.project, project);

    await page.evaluate(() => {
      updateNodalLoad(0, 'Fx', 1.25);
      runAnalysis();
    });
    const rollbackBaseline = await page.evaluate(() => ({
      load: state.nodalLoads[0]?.Fx,
      fingerprint: buildFrameCalculationTrace().calculationFingerprint,
    }));
    assert.notEqual(rollbackBaseline.fingerprint, canonical.fingerprint);
    const mismatchedPayload = JSON.parse(JSON.stringify(canonical.payload));
    mismatchedPayload.report.calculationFingerprint = 'CF-0000000000000000';
    await page.setInputFiles('#jsonFile', {
      name: 'frame-analysis-mismatched-fingerprint.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(mismatchedPayload)),
    });
    await page.waitForFunction(() => document.querySelector('#reportStatus')?.textContent.includes('來源與報告計算指紋不一致'));
    const rollbackAfter = await page.evaluate(() => ({
      load: state.nodalLoads[0]?.Fx,
      fingerprint: buildFrameCalculationTrace().calculationFingerprint,
      status: document.querySelector('#reportStatus')?.textContent || '',
    }));
    assert.equal(rollbackAfter.load, rollbackBaseline.load, 'mismatched import preserves the current load');
    assert.equal(rollbackAfter.fingerprint, rollbackBaseline.fingerprint, 'mismatched import preserves the current calculation fingerprint');
    assert.ok(rollbackAfter.status.includes('已保留原輸入'));

    const resultTamperedPayload = JSON.parse(JSON.stringify(canonical.payload));
    resultTamperedPayload.result.combinations[0].d[3] += 0.1;
    const resultTamperRollback = await page.evaluate(payload => {
      const before = {
        load: state.nodalLoads[0]?.Fx,
        fingerprint: buildFrameCalculationTrace().calculationFingerprint,
      };
      let error = '';
      try {
        applyImportedFrameCase(payload, 'frame-analysis-result-tampered.json');
      } catch (caught) {
        error = String(caught?.message || caught);
      }
      return {
        before,
        after: {
          load: state.nodalLoads[0]?.Fx,
          fingerprint: buildFrameCalculationTrace().calculationFingerprint,
        },
        error,
      };
    }, resultTamperedPayload);
    assert.match(resultTamperRollback.error, /結果|result|重現|指紋|快照/i, 'tampered V2 result snapshot is rejected');
    assert.ok(resultTamperRollback.error.includes('已保留原輸入'));
    assert.deepEqual(resultTamperRollback.after, resultTamperRollback.before, 'tampered V2 result snapshot rolls back transactionally');

    await page.fill('#projName', 'UNSAVED-WIP');
    const memberEInput = page.locator('#memberTbody tr').first().locator('td').nth(3).locator('input');
    await memberEInput.fill('0');
    await memberEInput.press('Tab');
    await page.waitForFunction(() => (
      document.getElementById('projName')?.value === 'UNSAVED-WIP'
      && state.members[0]?.E === 0
      && state.solution === null
    ));
    const invalidWipRollback = await page.evaluate(payload => {
      const snapshot = () => ({
        projectName: document.getElementById('projName')?.value || '',
        memberE: state.members[0]?.E,
        memberEInput: document.querySelector('#memberTbody tr:first-child td:nth-child(4) input')?.value || '',
        solutionIsNull: state.solution === null,
        readinessLevel: frameReportReadinessModel().level,
      });
      const before = snapshot();
      let error = '';
      try {
        applyImportedFrameCase(payload, 'frame-analysis-result-tampered-over-invalid-wip.json');
      } catch (caught) {
        error = String(caught?.message || caught);
      }
      return { before, after: snapshot(), error };
    }, resultTamperedPayload);
    assert.match(invalidWipRollback.error, /結果|result|重現|指紋|快照/i, 'tampered V2 result is rejected over invalid unsaved WIP');
    assert.ok(invalidWipRollback.error.includes('已保留原輸入'));
    assert.doesNotMatch(invalidWipRollback.error, /復原失敗|rollback failure/i, 'raw workspace rollback itself does not fail');
    assert.deepEqual(invalidWipRollback.before, {
      projectName: 'UNSAVED-WIP',
      memberE: 0,
      memberEInput: '0',
      solutionIsNull: true,
      readinessLevel: 'blocked',
    });
    assert.deepEqual(invalidWipRollback.after, invalidWipRollback.before, 'result-tampered import preserves invalid unsaved WIP exactly');

    await page.setInputFiles('#jsonFile', {
      name: sourceName,
      mimeType: 'application/json',
      buffer: sourceBuffer,
    });
    await page.waitForFunction(fingerprint => (
      document.querySelector('#reportStatus')?.textContent.includes('已重現計算指紋')
      && buildFrameCalculationTrace().calculationFingerprint === fingerprint
    ), canonical.fingerprint);

    const report = await openReport(page);
    attachErrorCapture(report);
    const reportText = await report.locator('body').innerText();
    for (const needle of [
      '平面剛架分析 計算書',
      project.name,
      project.no,
      project.designer,
      'FA-BM-01',
      frameMetadata.version,
      frameMetadata.calculationEngine,
      '計算指紋',
      canonical.fingerprint,
      '分析方法、符號與適用範圍',
      '模型自檢與求解診斷',
      '分量式平衡檢核',
      '節點位移 / 反力',
      '桿件極值',
    ]) {
      assert.ok(reportText.includes(needle), `formal report DOM includes ${needle}`);
    }
    for (const needle of ['標準驗證案例庫', '不會寫入計算書', '產報前閱讀狀態', 'DRAFT／非正式附件']) {
      assert.equal(reportText.includes(needle), false, `formal report excludes page-only wording ${needle}`);
    }

    const initialFormalState = await report.evaluate(() => {
      const approval = document.getElementById('repAttachmentApproval');
      const status = document.querySelector('.rep-document-status-line');
      return {
        documentClass: status?.dataset.documentClass || '',
        checkboxDisabled: Boolean(approval?.disabled),
        title: document.title,
      };
    });
    assert.equal(initialFormalState.documentClass, 'internal-review');
    assert.equal(initialFormalState.checkboxDisabled, false);
    assert.match(initialFormalState.title, /內部審閱/);

    await report.fill('#repAttachmentApprovedBy', '平面剛架正式附件複核人');
    await report.fill('#repAttachmentApprovalBasis', 'FA-BROWSER-01 懸臂封閉解與來源 JSON 回放核對');
    await report.check('#repAttachmentApproval');
    await report.waitForFunction(() => document.querySelector('.rep-document-status-line')?.dataset.documentClass === 'formal-attachment');
    const approved = await report.evaluate(() => {
      const status = document.querySelector('.rep-document-status-line');
      const source = document.querySelector('.rep-attachment-approval-source');
      const approvedHtml = serializeReportDocumentHtml();
      const reportText = typeof buildReportText === 'function' ? buildReportText() : '';
      return {
        approvedHtml,
        reportText,
        textBuilderAvailable: typeof buildReportText === 'function',
        textDownloadControl: Boolean(document.getElementById('repDownloadCurrentText')),
        title: document.title,
        documentClass: status?.dataset.documentClass || '',
        approvedAt: status?.dataset.approvedAt || source?.dataset.approvedAt || '',
        approvedBy: status?.dataset.approvedBy || source?.dataset.approvedBy || '',
        approvalBasis: status?.dataset.approvalBasis || source?.dataset.approvalBasis || '',
        calculationFingerprint: source?.dataset.calculationFingerprint || '',
      };
    });
    assert.equal(approved.documentClass, 'formal-attachment');
    assert.match(approved.title, /正式附件/);
    assert.ok(approved.title.includes(canonical.fingerprint));
    assert.ok(Number.isFinite(Date.parse(approved.approvedAt)));
    assert.equal(approved.approvedBy, '平面剛架正式附件複核人');
    assert.equal(approved.approvalBasis, 'FA-BROWSER-01 懸臂封閉解與來源 JSON 回放核對');
    assert.equal(approved.calculationFingerprint, canonical.fingerprint);
    assert.match(approved.approvedHtml, /^<!DOCTYPE html>/i);
    assert.ok(approved.approvedHtml.includes('文件狀態：正式附件'));
    assert.ok(approved.approvedHtml.includes(canonical.fingerprint));
    assert.doesNotMatch(approved.approvedHtml, /class=["'][^"']*(?:rep-approval-control|rep-approval-meta-control|rep-download-control)[^"']*["']/i);
    assert.equal(approved.textBuilderAvailable, true);
    assert.equal(approved.textDownloadControl, true);
    for (const needle of [
      '文件類別：文字備查',
      '正式附件資格：否',
      `計畫名稱：${project.name}`,
      `計畫編號：${project.no}`,
      `設計人員：${project.designer}`,
      `專案依據：${project.basis}`,
      '分析方法、符號與適用範圍',
      '二維、一階、線彈性平面剛架',
      '圖形內容請參閱 HTML／PDF 計算書。',
      '文字版限制：不含可列印圖形',
      canonical.fingerprint,
    ]) {
      assert.ok(approved.reportText.includes(needle), `actual TXT export includes ${needle}`);
    }
    assert.equal(approved.reportText.includes('data:image/'), false);
    assert.equal(approved.reportText.includes('<svg'), false);
    const textDigest = approved.reportText.match(/文字內容 SHA-256（非數位簽章）：([0-9a-f]{64})\r?\n$/);
    assert.ok(textDigest, 'actual TXT export carries its SHA-256 digest');
    assert.equal(sha256(Buffer.from(approved.reportText.slice(0, textDigest.index), 'utf8')), textDigest[1]);

    const seals = verifyDualSeals(approved.approvedHtml);
    const htmlName = 'frame-analysis-cantilever-approved-formal-attachment.html';
    const htmlPath = path.join(outDir, htmlName);
    const htmlBuffer = Buffer.from(approved.approvedHtml, 'utf8');
    fs.writeFileSync(htmlPath, htmlBuffer);
    const htmlArtifactSha256 = sha256(htmlBuffer);

    const externalRequests = [];
    const artifactPage = await context.newPage();
    attachErrorCapture(artifactPage);
    artifactPage.on('request', request => {
      if (/^(?:https?|file):/i.test(request.url())) externalRequests.push(request.url());
    });
    await artifactPage.setContent(approved.approvedHtml, { waitUntil: 'load' });
    await artifactPage.waitForFunction(() => document.body?.dataset.documentClass === 'formal-attachment');
    await artifactPage.waitForFunction(() => Array.from(document.images).every(image => image.complete));
    const standaloneDom = await artifactPage.evaluate(() => ({
      documentClass: document.body.dataset.documentClass || '',
      bodyText: String(document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      tableCount: document.querySelectorAll('table').length,
      headingCount: document.querySelectorAll('h1,h2,h3').length,
      savedStatusCount: document.querySelectorAll('.rep-document-status-line').length,
      calculationFingerprint: document.querySelector('.rep-attachment-approval-source')?.dataset.calculationFingerprint || '',
    }));
    assert.equal(standaloneDom.documentClass, 'formal-attachment');
    assert.equal(standaloneDom.horizontalOverflow, false);
    assert.ok(standaloneDom.tableCount >= 4);
    assert.equal(standaloneDom.savedStatusCount, 1);
    assert.equal(standaloneDom.calculationFingerprint, canonical.fingerprint);
    for (const needle of ['文件狀態：正式附件', '平面剛架分析 計算書', project.name, 'FA-BM-01', canonical.fingerprint]) {
      assert.ok(standaloneDom.bodyText.includes(needle), `standalone approved HTML DOM includes ${needle}`);
    }
    assert.deepEqual(externalRequests, [], 'approved formal HTML is self-contained and makes no external request');

    const screenshotName = 'frame-analysis-cantilever-approved-formal-attachment.png';
    const screenshotPath = path.join(outDir, screenshotName);
    const screenshotBuffer = await artifactPage.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotArtifactSha256 = sha256(screenshotBuffer);

    await artifactPage.emulateMedia({ media: 'print' });
    assert.equal(await artifactPage.locator('.rep-toolbar').evaluate(node => node.getClientRects().length > 0), false);
    const pdfName = 'frame-analysis-cantilever-approved-formal-attachment.pdf';
    const pdfPath = path.join(outDir, pdfName);
    await artifactPage.pdf({
      path: pdfPath,
      format: 'A4',
      preferCSSPageSize: true,
      scale: 0.95,
      printBackground: true,
      displayHeaderFooter: false,
    });
    const pdfBuffer = fs.readFileSync(pdfPath);
    assert.ok(pdfBuffer.length > 10000);
    assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
    const pdfValidation = validatePdfFile(pdfPath, {
      label: '平面剛架正式附件',
      minTextLength: 1200,
      titleNeedle: '平面剛架分析 計算書',
      projectNeedle: '__skip_project_order__',
      requiredNeedles: [
        '平面剛架分析 計算書',
        project.name,
        'FA-BM-01',
        '產出工具',
        '工具版本',
        frameMetadata.version,
        '計算引擎',
        frameMetadata.calculationEngine,
        '計算指紋',
        canonical.fingerprint,
        '分量式平衡檢核',
        '節點位移 / 反力',
        '桿件極值',
        '文件狀態：正式附件',
      ],
      forbiddenNeedles: ['標準驗證案例庫', '不會寫入計算書', '產報前閱讀狀態'],
      contentBoundaryProfile: 'traceable-calculation-book',
      keepWithNextLabels: [
        '分析方法、符號與適用範圍', '載重組合矩陣', '節點', '桿件', '載重',
        '模型自檢與求解診斷', '分量式平衡檢核',
        '節點位移 / 反力', '桿件端力（局部座標）', '桿件極值',
      ],
      continuationContextLabels: [
        '案件資料', '分析方法、符號與適用範圍', '載重組合矩陣', '節點', '桿件', '載重',
        '模型自檢與求解診斷', '分量式平衡檢核', '幾何 / 變形圖',
        '彎矩圖 M (tf·m)', '剪力圖 V (tf)', '軸力圖 N (tf)',
        '節點位移 / 反力', '桿件端力（局部座標）', '桿件極值',
      ],
    });
    assert.ok(Math.abs(pdfValidation.pages[0].width - 595) <= 2, `PDF width is A4 at 72 dpi: ${pdfValidation.pages[0].width}`);
    assert.ok(Math.abs(pdfValidation.pages[0].height - 842) <= 2, `PDF height is A4 at 72 dpi: ${pdfValidation.pages[0].height}`);

    const verifiedAssertionCount = 9;
    const sourceResult = canonical.payload.result.combinations[0];
    assert.equal(canonical.payload.schema, 'plane-frame.case.v2');
    assert.equal(canonical.payload.tool.id, 'frame-analysis');
    assert.deepEqual(
      [canonical.payload.model.nodes.length, canonical.payload.model.members.length, canonical.payload.model.nodalLoads.length],
      [2, 1, 1]
    );
    assert.equal(canonical.payload.model.nodalLoads[0].Fx, 1);
    assert.ok(Math.abs(sourceResult.d[3] - expectedTipUx) <= 1e-10);
    assert.ok(Math.abs(Math.abs(sourceResult.reactions[2]) - 6) <= 1e-10);
    assert.equal(sourceResult.equilibrium.ok, true);
    assert.equal(sourceResult.solverDiagnostics.passed, true);
    assert.equal(approved.calculationFingerprint, canonical.payload.calculationFingerprint);

    const pdfArtifactSha256 = sha256(pdfBuffer);
    const evidenceName = 'frame-analysis-cantilever-approved-formal-attachment.evidence.json';
    const evidencePath = path.join(outDir, evidenceName);
    const evidence = {
      schemaVersion: 1,
      kind: CANONICAL_RENDER_EVIDENCE_KIND,
      generatedAt: new Date().toISOString(),
      key: 'frame-analysis',
      artifact: pdfName,
      artifactBytes: pdfBuffer.length,
      artifactSha256: pdfArtifactSha256,
      sourceHtmlSha256: htmlArtifactSha256,
      sourceArtifact: sourceName,
      sourceArtifactSha256: sourceSnapshotSha256,
      screenshotArtifact: screenshotName,
      screenshotArtifactBytes: screenshotBuffer.length,
      screenshotArtifactSha256,
      calculationFingerprint: canonical.fingerprint,
      documentState: {
        documentClass: 'formal-attachment',
        approvedAt: approved.approvedAt,
        calculationFingerprint: canonical.fingerprint,
      },
      dom: {
        horizontalOverflow: standaloneDom.horizontalOverflow,
        tableCount: standaloneDom.tableCount,
        headingCount: standaloneDom.headingCount,
        textLength: standaloneDom.bodyText.length,
        externalRequestCount: externalRequests.length,
      },
      pdf: {
        format: 'A4',
        pageCount: pdfValidation.pageCount,
        textLength: pdfValidation.textLength,
        footerLineCount: pdfValidation.footerLineCount,
        orphanHeadingCount: pdfValidation.orphanHeadingCount,
        uncontextualPageStartCount: pdfValidation.uncontextualPageStartCount,
        contentBoundaryProfile: pdfValidation.contentBoundary.profile,
      },
    };
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    const portableHtml = {
      documentClass: 'formal-attachment',
      calculationFingerprint: canonical.fingerprint,
      reportTitle: '平面剛架分析 計算書',
      approvedDocumentTitle: approved.title,
      approvedAt: approved.approvedAt,
      approvedBy: approved.approvedBy,
      approvalBasis: approved.approvalBasis,
      savedStatusCount: standaloneDom.savedStatusCount,
      htmlArtifact: htmlName,
      htmlArtifactBytes: htmlBuffer.length,
      htmlArtifactSha256,
      contentSealStatus: seals.contentSeal.status,
      contentSealScope: seals.contentSeal.scope,
      contentSealSha256: seals.contentSeal.actualSha256,
      approvalSealStatus: seals.approvalSeal.status,
      approvalSealScope: seals.approvalSeal.scope,
      approvalSealSha256: seals.approvalSeal.actualSha256,
      contentTamperDetectionStatus: seals.contentTamper.status,
      approvalTamperDetectionStatus: seals.approvalTamper.status,
      standalonePrint: {
        status: 'ready',
        artifact: pdfName,
        artifactBytes: pdfBuffer.length,
        artifactSha256: pdfArtifactSha256,
        pageCount: pdfValidation.pageCount,
        textLength: pdfValidation.textLength,
        calculationFingerprint: canonical.fingerprint,
        externalRequestCount: externalRequests.length,
        contentSealStatus: seals.contentSeal.status,
        contentSealSha256: seals.contentSeal.actualSha256,
        tamperDetectionStatus: seals.contentTamper.status,
        approvalSealStatus: seals.approvalSeal.status,
        approvalSealSha256: seals.approvalSeal.actualSha256,
        approvalTamperDetectionStatus: seals.approvalTamper.status,
      },
    };
    const record = {
      key: 'frame-analysis',
      evidenceRole: 'approved-formal-attachment',
      documentClass: 'formal-attachment',
      artifact: pdfName,
      evidence: evidenceName,
      calculationFingerprint: canonical.fingerprint,
      htmlArtifact: htmlName,
      htmlArtifactBytes: htmlBuffer.length,
      htmlArtifactSha256,
      screenshotArtifact: screenshotName,
      screenshotArtifactBytes: screenshotBuffer.length,
      screenshotArtifactSha256,
      sourceArtifact: sourceName,
      sourceArtifactBytes: sourceBuffer.length,
      sourceArtifactSha256: sourceSnapshotSha256,
      portableHtml,
      resultReconciliation: {
        schemaVersion: 1,
        strategy: 'frame-source-replay-to-report-fingerprint',
        caseId: 'cantilever-tip-load',
        sourceSnapshotSha256,
        verifiedAssertionCount,
        calculationFingerprint: canonical.fingerprint,
        pass: true,
      },
    };
    const summary = writeEvidenceSummary(outDir, 'frame-analysis-formal', [record], ['frame-analysis']);
    assert.equal(summary.payload.pass, true);
    assert.equal(summary.payload.records.length, 1);
    assert.deepEqual(pageErrors, []);

    await artifactPage.close();
    await report.close();
    console.log(`Frame analysis browser smoke: OK (${canonical.fingerprint}; PDF ${pdfBuffer.length} bytes; ${pdfValidation.pageCount} pages)`);
    console.log(`Evidence: ${summary.summaryPath}`);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
