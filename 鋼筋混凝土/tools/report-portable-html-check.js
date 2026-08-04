const AttachmentPackageChecker = require('../../結構工具箱/tools/attachment-package-check');
const { describeHtmlArtifact } = require('../../dev_tools/html-attachment-integrity');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  const state = await report.evaluate(() => {
    const approval = document.getElementById('repAttachmentApproval');
    const downloadButton = document.getElementById('repDownloadCurrentHtml');
    const serializerAvailable = typeof serializeReportDocumentHtml === 'function';
    if (approval) {
      approval.checked = true;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const source = document.querySelector('.rep-attachment-approval-source');
    const status = document.querySelector('.rep-document-status-line');
    const approvedDocumentTitle = document.title || '';
    const approvedHtml = serializerAvailable ? serializeReportDocumentHtml() : '';
    let downloadedFileName = '';
    if (downloadButton) {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      try {
        HTMLAnchorElement.prototype.click = function captureReportDownload() {
          downloadedFileName = this.download || '';
        };
        downloadButton.click();
      } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }

    return {
      approvalControl: Boolean(approval),
      downloadControl: Boolean(downloadButton),
      serializerAvailable,
      approvedAt: source?.dataset.approvedAt || status?.dataset.approvedAt || '',
      calculationFingerprint: source?.dataset.calculationFingerprint || '',
      reportTitle: source?.dataset.reportTitle || '',
      approvedDocumentTitle,
      approvedHtml,
      downloadedFileName,
    };
  });

  const visibleText = AttachmentPackageChecker.extractHtmlVisibleContent(state.approvedHtml).text;
  const savedStatusCount = (state.approvedHtml.match(/class=["'][^"']*rep-document-status-line[^"']*["']/gi) || []).length;
  const savedTitle = state.approvedHtml.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
  const summary = {
    approvalControl: state.approvalControl,
    downloadControl: state.downloadControl,
    serializerAvailable: state.serializerAvailable,
    approvedAt: state.approvedAt,
    calculationFingerprint: state.calculationFingerprint,
    reportTitle: state.reportTitle,
    approvedDocumentTitle: state.approvedDocumentTitle,
    downloadedFileName: state.downloadedFileName,
    savedStatusCount,
    savedTitle,
  };
  const detail = JSON.stringify(summary);

  assert(state.approvalControl && state.downloadControl && state.serializerAvailable, `${label} exposes approval and current-state HTML download`, detail);
  assert(Number.isFinite(Date.parse(state.approvedAt)), `${label} formal HTML records machine-readable approval time`, state.approvedAt);
  assert(/^CF-[0-9A-F]{16}$/.test(state.calculationFingerprint), `${label} formal HTML keeps calculation fingerprint`, state.calculationFingerprint);
  assert(state.reportTitle.includes('計算書'), `${label} formal HTML keeps stable calculation-book title`, state.reportTitle);
  assert(state.approvedDocumentTitle.includes('正式附件') && state.approvedDocumentTitle.includes(state.calculationFingerprint), `${label} approved title carries document state and fingerprint`, state.approvedDocumentTitle);
  assert(state.downloadedFileName === `${state.approvedDocumentTitle}.html`, `${label} downloaded filename matches approved title`, state.downloadedFileName);
  assert(savedTitle === state.approvedDocumentTitle, `${label} saved HTML title matches downloaded filename`, `${savedTitle} -> ${state.downloadedFileName}`);
  assert(savedStatusCount === 1 && visibleText.includes('文件狀態：正式附件') && visibleText.includes('核可時間') && visibleText.includes(state.calculationFingerprint), `${label} attachment checker reads one static formal state line`, detail);
  assert(/data-initial-approved=["']true["']/i.test(state.approvedHtml) && state.approvedHtml.includes(`data-approved-at="${state.approvedAt}"`), `${label} saved HTML preserves approval provenance`, detail);
  assert(!/class=["'][^"']*(?:rep-approval-control|rep-download-control)[^"']*["']/i.test(state.approvedHtml), `${label} saved HTML excludes transient controls`, detail);
  assert(!/<body\b[^>]*data-document-class=/i.test(state.approvedHtml), `${label} saved HTML rehydrates document class from static source`, detail);

  let htmlArtifact = '';
  let htmlArtifactManifest = {};
  if (options.outputDir) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    htmlArtifact = state.downloadedFileName;
    htmlArtifactManifest = describeHtmlArtifact(htmlArtifact, state.approvedHtml);
    fs.writeFileSync(path.join(options.outputDir, htmlArtifact), state.approvedHtml, 'utf8');
  }

  const sourceReportPackage = options.sourceSnapshot
    ? assertSourceReportPackagePair(options.sourceSnapshot, state.approvedHtml, label, assert)
    : null;

  return { ...summary, htmlArtifact, ...htmlArtifactManifest, sourceReportPackage };
}

module.exports = { assertPortableFormalHtml, assertSourceReportPackagePair };
