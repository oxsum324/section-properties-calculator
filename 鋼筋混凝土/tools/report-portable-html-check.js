const AttachmentPackageChecker = require('../../結構工具箱/tools/attachment-package-check');
const { describeHtmlArtifact } = require('../../dev_tools/html-attachment-integrity');
const { assertReportPdfTextQuality, captureArtifactIntegrity } = require('./report-screenshot-quality');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function renderStandaloneFormalHtmlPdf(report, approvedHtml, summary, label, assert, outputDir) {
  const standalonePage = await report.context().browser().newPage({ viewport: { width: 980, height: 1200 } });
  const externalRequests = [];
  standalonePage.on('request', request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  const artifact = summary.downloadedFileName.replace(/\.html$/i, '_獨立列印.pdf');
  const artifactPath = path.join(outputDir, artifact);
  let sealVerification = null;
  let approvalSealVerification = null;
  let tamperDetection = null;
  let approvalTamperDetection = null;
  try {
    await standalonePage.setContent(approvedHtml, { waitUntil: 'load' });
    sealVerification = await standalonePage.evaluate(async () => (
      typeof window.verifyReportContentSeal === 'function'
        ? window.verifyReportContentSeal()
        : { status: 'missing-verifier', expected: '', actual: '' }
    ));
    approvalSealVerification = await standalonePage.evaluate(async () => (
      typeof window.verifyReportApprovalSeal === 'function'
        ? window.verifyReportApprovalSeal()
        : { status: 'missing-verifier', expected: '', actual: '' }
    ));
    await standalonePage.emulateMedia({ media: 'print' });
    const reopened = await standalonePage.evaluate(() => {
      const statusLines = [...document.querySelectorAll('.rep-document-status-line')];
      const transientControls = [...document.querySelectorAll('.rep-approval-control, .rep-download-control')];
      const visibleText = document.body?.innerText || '';
      return {
        title: document.title || '',
        paperCount: document.querySelectorAll('.rep-paper').length,
        statusCount: statusLines.length,
        visibleStatusCount: statusLines.filter(node => node.getClientRects().length > 0).length,
        documentClass: statusLines[0]?.dataset.documentClass || '',
        approved: statusLines[0]?.dataset.approved || '',
        approvedAt: statusLines[0]?.dataset.approvedAt || '',
        transientControlCount: transientControls.length,
        visibleTransientControlCount: transientControls.filter(node => node.getClientRects().length > 0).length,
        contentIntegrity: document.body?.dataset.contentIntegrity || '',
        approvalIntegrity: document.body?.dataset.approvalIntegrity || '',
        visibleText,
      };
    });
    const reopenedDetail = JSON.stringify({
      ...reopened,
      visibleText: undefined,
      externalRequestCount: externalRequests.length,
    });
    assert(reopened.title === summary.approvedDocumentTitle, `${label} standalone HTML reopens with the approved title`, reopenedDetail);
    assert(
      sealVerification?.status === 'verified'
        && sealVerification.expected === summary.contentSealSha256
        && sealVerification.actual === summary.contentSealSha256
        && reopened.contentIntegrity === 'verified',
      `${label} standalone HTML independently verifies its SHA-256 content seal`,
      JSON.stringify({ sealVerification, reopened: reopenedDetail }),
    );
    assert(
      approvalSealVerification?.status === 'verified'
        && approvalSealVerification.expected === summary.approvalSealSha256
        && approvalSealVerification.actual === summary.approvalSealSha256
        && reopened.approvalIntegrity === 'verified',
      `${label} standalone HTML independently verifies its SHA-256 approval seal`,
      JSON.stringify({ approvalSealVerification, reopened: reopenedDetail }),
    );
    assert(reopened.paperCount === 1, `${label} standalone HTML reopens one calculation-book paper`, reopenedDetail);
    assert(
      reopened.statusCount === 1
        && reopened.visibleStatusCount === 1
        && reopened.documentClass === 'formal-attachment'
        && reopened.approved === 'true'
        && Number.isFinite(Date.parse(reopened.approvedAt)),
      `${label} standalone HTML reopens with one visible formal approval state`,
      reopenedDetail,
    );
    assert(
      reopened.transientControlCount >= 1 && reopened.visibleTransientControlCount === 0,
      `${label} standalone HTML keeps screen controls out of print media`,
      reopenedDetail,
    );
    assert(
      reopened.visibleText.includes(summary.reportTitle)
        && reopened.visibleText.includes('文件狀態：正式附件')
        && reopened.visibleText.includes(summary.calculationFingerprint),
      `${label} standalone HTML keeps the report title, formal state and fingerprint visible`,
      reopenedDetail,
    );
    assert(externalRequests.length === 0, `${label} standalone HTML reopens without external network requests`, externalRequests.join(' | '));

    await standalonePage.pdf({
      path: artifactPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    const sealEnd = '<!--rc-content-seal:end-->';
    const sealEndIndex = approvedHtml.lastIndexOf(sealEnd);
    const tamperedHtml = sealEndIndex >= 0
      ? `${approvedHtml.slice(0, sealEndIndex)}<span class="rep-tamper-probe">變更後計算內容</span>${approvedHtml.slice(sealEndIndex)}`
      : approvedHtml;
    await standalonePage.setContent(tamperedHtml, { waitUntil: 'load' });
    tamperDetection = await standalonePage.evaluate(async () => {
      const verification = typeof window.verifyReportContentSeal === 'function'
        ? await window.verifyReportContentSeal()
        : { status: 'missing-verifier', expected: '', actual: '' };
      return {
        ...verification,
        documentIntegrity: document.body?.dataset.contentIntegrity || '',
        alertText: document.querySelector('.rep-content-integrity-alert')?.textContent || '',
      };
    });
    await standalonePage.emulateMedia({ media: 'print' });
    const tamperPrintAlertVisible = await standalonePage.evaluate(() => (
      (document.querySelector('.rep-content-integrity-alert')?.getClientRects().length || 0) > 0
    ));
    assert(
      tamperDetection?.status === 'failed'
        && tamperDetection.documentIntegrity === 'failed'
        && tamperDetection.alertText.includes('內容完整性異常')
        && tamperPrintAlertVisible,
      `${label} changed standalone HTML is visibly blocked on screen and in print`,
      JSON.stringify({ tamperDetection, tamperPrintAlertVisible }),
    );

    const approvalTamperedHtml = approvedHtml.replace(
      /data-approved-at="[^"]*"/i,
      'data-approved-at="2000-01-01T00:00:00.000Z"',
    );
    await standalonePage.setContent(approvalTamperedHtml, { waitUntil: 'load' });
    approvalTamperDetection = await standalonePage.evaluate(async () => {
      const contentVerification = typeof window.verifyReportContentSeal === 'function'
        ? await window.verifyReportContentSeal()
        : { status: 'missing-verifier' };
      const approvalVerification = typeof window.verifyReportApprovalSeal === 'function'
        ? await window.verifyReportApprovalSeal()
        : { status: 'missing-verifier', expected: '', actual: '' };
      return {
        ...approvalVerification,
        contentStatus: contentVerification.status,
        documentIntegrity: document.body?.dataset.approvalIntegrity || '',
        alertText: document.querySelector('.rep-content-integrity-alert')?.textContent || '',
      };
    });
    await standalonePage.emulateMedia({ media: 'print' });
    const approvalTamperPrintAlertVisible = await standalonePage.evaluate(() => (
      (document.querySelector('.rep-content-integrity-alert')?.getClientRects().length || 0) > 0
    ));
    assert(
      approvalTamperDetection?.status === 'failed'
        && approvalTamperDetection.contentStatus === 'verified'
        && approvalTamperDetection.documentIntegrity === 'failed'
        && approvalTamperDetection.alertText.includes('核可完整性異常')
        && approvalTamperPrintAlertVisible,
      `${label} changed approval record is independently blocked on screen and in print`,
      JSON.stringify({ approvalTamperDetection, approvalTamperPrintAlertVisible }),
    );
  } finally {
    await standalonePage.close();
  }

  const pdfQuality = assertReportPdfTextQuality(artifactPath, `${label} standalone approved HTML`, {
    assert,
    minPages: 1,
    minTextLength: 500,
    include: ['文件狀態：正式附件', summary.calculationFingerprint],
    contentBoundaryProfile: 'traceable-calculation-book',
  });
  const integrity = captureArtifactIntegrity(artifactPath, 'standaloneFormalHtmlPrintPdf');
  return {
    status: 'ready',
    artifact: integrity.name,
    artifactBytes: integrity.bytes,
    artifactSha256: integrity.sha256,
    pageCount: Number(pdfQuality?.pages || 0),
    textLength: Number(pdfQuality?.textLength || 0),
    calculationFingerprint: summary.calculationFingerprint,
    externalRequestCount: externalRequests.length,
    contentSealStatus: sealVerification?.status || '',
    contentSealSha256: sealVerification?.actual || '',
    tamperDetectionStatus: tamperDetection?.status || '',
    approvalSealStatus: approvalSealVerification?.status || '',
    approvalSealSha256: approvalSealVerification?.actual || '',
    approvalTamperDetectionStatus: approvalTamperDetection?.status || '',
  };
}

function assertSourceReportPackagePair(sourceSnapshot, approvedHtml, label, assert) {
  const pairDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-source-report-pair-'));
  try {
    const sourceFile = 'RC專案來源.json';
    const reportFile = 'RC正式計算書.html';
    fs.writeFileSync(path.join(pairDir, reportFile), approvedHtml, 'utf8');
    const sourceMetadata = AttachmentPackageChecker.extractJsonMetadata(sourceSnapshot);
    const checkSnapshot = snapshot => {
      fs.writeFileSync(path.join(pairDir, sourceFile), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      return AttachmentPackageChecker.checkPackage(pairDir, { projectNo: sourceMetadata.projectNo || '' });
    };
    const packageReport = checkSnapshot(sourceSnapshot);
    const detail = JSON.stringify({
      status: packageReport.status,
      summary: packageReport.summary,
      links: packageReport.fingerprintLinks,
      issues: packageReport.issues.map(issue => ({ level: issue.level, code: issue.code })),
    });
    assert(packageReport.status === 'ready', `${label} real project JSON and formal HTML are package-ready`, detail);
    assert(
      packageReport.fingerprintLinks.length === 1
        && packageReport.fingerprintLinks[0].sourceFile === sourceFile
        && packageReport.fingerprintLinks[0].reportFile === reportFile
        && packageReport.fingerprintLinks[0].fingerprint === sourceSnapshot.calculationFingerprint,
      `${label} real project JSON and formal HTML share one traceability link`,
      detail,
    );

    const tamperedSnapshot = JSON.parse(JSON.stringify(sourceSnapshot));
    tamperedSnapshot.calculationFingerprint = 'CF-0000000000000000';
    const tamperedReport = checkSnapshot(tamperedSnapshot);
    assert(
      tamperedReport.status === 'blocked'
        && tamperedReport.issues.some(issue => issue.code === 'source-report-fingerprint-mismatch'),
      `${label} rejects a tampered project fingerprint`,
      JSON.stringify({ status: tamperedReport.status, issues: tamperedReport.issues.map(issue => issue.code) }),
    );

    const wrongVersionSnapshot = JSON.parse(JSON.stringify(sourceSnapshot));
    const wrongVersion = 'v0.0-package-mismatch';
    if (wrongVersionSnapshot.tool && typeof wrongVersionSnapshot.tool === 'object') {
      wrongVersionSnapshot.tool.version = wrongVersion;
      wrongVersionSnapshot.tool.pageVersion = wrongVersion;
    }
    wrongVersionSnapshot.appVersion = wrongVersion;
    wrongVersionSnapshot.toolVersion = wrongVersion;
    wrongVersionSnapshot.pageVersion = wrongVersion;
    const wrongVersionReport = checkSnapshot(wrongVersionSnapshot);
    assert(
      wrongVersionReport.status === 'blocked'
        && wrongVersionReport.issues.some(issue => issue.code === 'source-report-identity-mismatch'),
      `${label} rejects a wrong-version project source`,
      JSON.stringify({ status: wrongVersionReport.status, issues: wrongVersionReport.issues.map(issue => issue.code) }),
    );

    const reidentifiedSnapshot = JSON.parse(JSON.stringify(wrongVersionSnapshot));
    reidentifiedSnapshot.calculationFingerprint = 'CF-0000000000000000';
    reidentifiedSnapshot.toolTitle = '偽造來源';
    reidentifiedSnapshot.toolName = '偽造來源';
    if (reidentifiedSnapshot.tool && typeof reidentifiedSnapshot.tool === 'object') {
      reidentifiedSnapshot.tool.id = 'forged-source';
      reidentifiedSnapshot.tool.name = '偽造來源';
    } else reidentifiedSnapshot.tool = 'forged-source';
    const reidentifiedReport = checkSnapshot(reidentifiedSnapshot);
    assert(
      reidentifiedReport.status === 'blocked'
        && reidentifiedReport.fingerprintLinks.length === 0
        && reidentifiedReport.issues.some(issue => issue.code === 'source-report-link-missing'),
      `${label} rejects a fully reidentified unrelated project source`,
      JSON.stringify({ status: reidentifiedReport.status, issues: reidentifiedReport.issues.map(issue => issue.code) }),
    );

    return {
      status: packageReport.status,
      fingerprintLinkCount: packageReport.fingerprintLinks.length,
      fingerprint: packageReport.fingerprintLinks[0]?.fingerprint || '',
    };
  } finally {
    fs.rmSync(pairDir, { recursive: true, force: true });
  }
}

async function assertPortableFormalHtml(report, label, assert, options = {}) {
  const state = await report.evaluate(async () => {
    const approval = document.getElementById('repAttachmentApproval');
    const approvedByInput = document.getElementById('repAttachmentApprovedBy');
    const approvalBasisInput = document.getElementById('repAttachmentApprovalBasis');
    const downloadButton = document.getElementById('repDownloadCurrentHtml');
    const serializerAvailable = typeof serializeReportDocumentHtml === 'function';
    if (approvedByInput) {
      approvedByInput.value = 'RC 複核人';
      approvedByInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (approvalBasisInput) {
      approvalBasisInput.value = 'RC 複核紀錄 QA-01';
      approvalBasisInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (approval) {
      approval.checked = true;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const source = document.querySelector('.rep-attachment-approval-source');
    const status = document.querySelector('.rep-document-status-line');
    const approvedAt = source?.dataset.approvedAt || status?.dataset.approvedAt || '';
    const approvedBy = source?.dataset.approvedBy || status?.dataset.approvedBy || '';
    const approvalBasis = source?.dataset.approvalBasis || status?.dataset.approvalBasis || '';
    const approvedDocumentTitle = document.title || '';
    const approvedHtml = serializerAvailable ? await serializeReportDocumentHtml() : '';
    let downloadedFileName = '';
    if (downloadButton) {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      try {
        HTMLAnchorElement.prototype.click = function captureReportDownload() {
          downloadedFileName = this.download || '';
        };
        await window.downloadReportHtml();
      } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }
    const approvalMetaHintText = (document.getElementById('repApprovalMetaHint')?.textContent || '').replace(/\s+/g, ' ').trim();
    if (approvedByInput) {
      approvedByInput.value = 'RC 複核人（修訂）';
      approvedByInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const metadataEditDocumentClass = status?.dataset.documentClass || '';
    const metadataEditApprovedAt = status?.dataset.approvedAt || '';
    const metadataEditCheckboxAttribute = Boolean(approval?.hasAttribute('checked'));
    const metadataEditStatusText = (status?.textContent || '').replace(/\s+/g, ' ').trim();
    const metadataEditMessage = (document.getElementById('repWindowStatus')?.textContent || '').replace(/\s+/g, ' ').trim();
    const metadataEditHintText = (document.getElementById('repApprovalMetaHint')?.textContent || '').replace(/\s+/g, ' ').trim();

    return {
      approvalControl: Boolean(approval),
      approvalMetaControl: Boolean(approvedByInput && approvalBasisInput),
      downloadControl: Boolean(downloadButton),
      serializerAvailable,
      approvedAt,
      approvedBy,
      approvalBasis,
      approvalMetaHintText,
      metadataEditDocumentClass,
      metadataEditApprovedAt,
      metadataEditCheckboxAttribute,
      metadataEditStatusText,
      metadataEditMessage,
      metadataEditHintText,
      calculationFingerprint: source?.dataset.calculationFingerprint || '',
      reportTitle: source?.dataset.reportTitle || '',
      approvedDocumentTitle,
      approvedHtml,
      downloadedFileName,
    };
  });

  const visibleText = AttachmentPackageChecker.extractHtmlVisibleContent(state.approvedHtml).text;
  const contentSeal = AttachmentPackageChecker.verifyRcHtmlContentSeal(state.approvedHtml);
  const approvalSeal = AttachmentPackageChecker.verifyRcHtmlApprovalSeal(state.approvedHtml);
  const sealEnd = '<!--rc-content-seal:end-->';
  const sealEndIndex = state.approvedHtml.lastIndexOf(sealEnd);
  const tamperedApprovedHtml = sealEndIndex >= 0
    ? `${state.approvedHtml.slice(0, sealEndIndex)}<span>竄改後內容</span>${state.approvedHtml.slice(sealEndIndex)}`
    : state.approvedHtml;
  const tamperedContentSeal = AttachmentPackageChecker.verifyRcHtmlContentSeal(tamperedApprovedHtml);
  const tamperedApprovalHtml = state.approvedHtml.replace(
    /data-approved-at="[^"]*"/i,
    'data-approved-at="2000-01-01T00:00:00.000Z"',
  );
  const tamperedApprovalSeal = AttachmentPackageChecker.verifyRcHtmlApprovalSeal(tamperedApprovalHtml);
  const tamperedApproverSeal = AttachmentPackageChecker.verifyRcHtmlApprovalSeal(
    state.approvedHtml.replaceAll('RC 複核人', '未授權人員'),
  );
  const savedStatusCount = (state.approvedHtml.match(/<span\b[^>]*class=["'][^"']*rep-document-status-line[^"']*["'][^>]*data-document-class=/gi) || []).length;
  const savedTitle = state.approvedHtml.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
  const summary = {
    approvalControl: state.approvalControl,
    approvalMetaControl: state.approvalMetaControl,
    downloadControl: state.downloadControl,
    serializerAvailable: state.serializerAvailable,
    approvedAt: state.approvedAt,
    approvedBy: state.approvedBy,
    approvalBasis: state.approvalBasis,
    calculationFingerprint: state.calculationFingerprint,
    reportTitle: state.reportTitle,
    approvedDocumentTitle: state.approvedDocumentTitle,
    downloadedFileName: state.downloadedFileName,
    savedStatusCount,
    savedTitle,
    contentSealStatus: contentSeal.status,
    contentSealScope: contentSeal.scope,
    contentSealSha256: contentSeal.actualSha256,
    approvalSealStatus: approvalSeal.status,
    approvalSealScope: approvalSeal.scope,
    approvalSealSha256: approvalSeal.actualSha256,
  };
  const detail = JSON.stringify(summary);

  assert(state.approvalControl && state.approvalMetaControl && state.downloadControl && state.serializerAvailable, `${label} exposes approval, optional approval metadata, and current-state HTML download`, detail);
  assert(state.approvalMetaHintText.includes('修改上述紀錄會撤銷正式核可') && state.approvalMetaHintText.includes('重新勾選'), `${label} explains approval metadata revocation before editing`, state.approvalMetaHintText);
  assert(Number.isFinite(Date.parse(state.approvedAt)), `${label} formal HTML records machine-readable approval time`, state.approvedAt);
  assert(state.approvedBy === 'RC 複核人' && state.approvalBasis === 'RC 複核紀錄 QA-01', `${label} formal HTML records optional approver and approval basis`, detail);
  assert(state.metadataEditDocumentClass === 'internal-review' && state.metadataEditApprovedAt === '' && state.metadataEditCheckboxAttribute === false, `${label} changing approval metadata revokes formal status and clears the prior approval time`, JSON.stringify({ documentClass: state.metadataEditDocumentClass, approvedAt: state.metadataEditApprovedAt, checked: state.metadataEditCheckboxAttribute }));
  assert(state.metadataEditStatusText.includes('文件狀態：內部審閱') && state.metadataEditHintText.includes('正式核可已撤銷') && state.metadataEditHintText.includes('重新勾選'), `${label} revoked approval is explicit in the footer and persistent page-only hint`, JSON.stringify({ status: state.metadataEditStatusText, message: state.metadataEditMessage, hint: state.metadataEditHintText }));
  assert(/^CF-[0-9A-F]{16}$/.test(state.calculationFingerprint), `${label} formal HTML keeps calculation fingerprint`, state.calculationFingerprint);
  assert(state.reportTitle.includes('計算書'), `${label} formal HTML keeps stable calculation-book title`, state.reportTitle);
  assert(state.approvedDocumentTitle.includes('正式附件') && state.approvedDocumentTitle.includes(state.calculationFingerprint), `${label} approved title carries document state and fingerprint`, state.approvedDocumentTitle);
  assert(state.downloadedFileName === `${state.approvedDocumentTitle}.html`, `${label} downloaded filename matches approved title`, state.downloadedFileName);
  assert(savedTitle === state.approvedDocumentTitle, `${label} saved HTML title matches downloaded filename`, `${savedTitle} -> ${state.downloadedFileName}`);
  assert(savedStatusCount === 1 && visibleText.includes('文件狀態：正式附件') && visibleText.includes('核可時間') && visibleText.includes('核可人：RC 複核人') && visibleText.includes('核可依據：RC 複核紀錄 QA-01') && visibleText.includes(state.calculationFingerprint), `${label} attachment checker reads one static formal state line`, detail);
  assert(/data-initial-approved=["']true["']/i.test(state.approvedHtml) && state.approvedHtml.includes(`data-approved-at="${state.approvedAt}"`) && state.approvedHtml.includes('data-approved-by="RC 複核人"') && state.approvedHtml.includes('data-approval-basis="RC 複核紀錄 QA-01"'), `${label} saved HTML preserves approval provenance`, detail);
  assert(!/class=["'][^"']*(?:rep-approval-control|rep-approval-meta-control|rep-download-control)[^"']*["']/i.test(state.approvedHtml), `${label} saved HTML excludes transient controls`, detail);
  assert(!/<body\b[^>]*data-document-class=/i.test(state.approvedHtml), `${label} saved HTML rehydrates document class from static source`, detail);
  assert(
    contentSeal.status === 'verified'
      && contentSeal.scope === AttachmentPackageChecker.RC_CONTENT_SEAL_SCOPE
      && /^[0-9a-f]{64}$/.test(contentSeal.actualSha256),
    `${label} saved HTML carries an independently reproducible SHA-256 content seal`,
    JSON.stringify(contentSeal),
  );
  assert(
    approvalSeal.status === 'verified'
      && approvalSeal.scope === AttachmentPackageChecker.RC_APPROVAL_SEAL_SCOPE
      && /^[0-9a-f]{64}$/.test(approvalSeal.actualSha256),
    `${label} saved HTML carries an independently reproducible SHA-256 approval seal`,
    JSON.stringify(approvalSeal),
  );
  assert(
    tamperedContentSeal.status === 'failed' && tamperedContentSeal.reasons.includes('content-sha256-mismatch'),
    `${label} changed calculation content invalidates the saved HTML seal`,
    JSON.stringify(tamperedContentSeal),
  );
  assert(
    tamperedApprovalSeal.status === 'failed'
      && tamperedApprovalSeal.reasons.includes('approval-sha256-mismatch')
      && AttachmentPackageChecker.verifyRcHtmlContentSeal(tamperedApprovalHtml).status === 'verified',
    `${label} changed approval metadata invalidates only the approval seal`,
    JSON.stringify(tamperedApprovalSeal),
  );
  assert(
    tamperedApproverSeal.status === 'failed' && tamperedApproverSeal.reasons.includes('approval-sha256-mismatch'),
    `${label} changed optional approver invalidates the approval seal`,
    JSON.stringify(tamperedApproverSeal),
  );

  let htmlArtifact = '';
  let htmlArtifactManifest = {};
  let standalonePrint = null;
  if (options.outputDir) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    htmlArtifact = state.downloadedFileName;
    htmlArtifactManifest = describeHtmlArtifact(htmlArtifact, state.approvedHtml);
    fs.writeFileSync(path.join(options.outputDir, htmlArtifact), state.approvedHtml, 'utf8');
    standalonePrint = await renderStandaloneFormalHtmlPdf(
      report,
      state.approvedHtml,
      summary,
      label,
      assert,
      options.outputDir,
    );
  }

  const sourceReportPackage = options.sourceSnapshot
    ? assertSourceReportPackagePair(options.sourceSnapshot, state.approvedHtml, label, assert)
    : null;

  return { ...summary, htmlArtifact, ...htmlArtifactManifest, standalonePrint, sourceReportPackage };
}

module.exports = { assertPortableFormalHtml, assertSourceReportPackagePair, renderStandaloneFormalHtmlPdf };
