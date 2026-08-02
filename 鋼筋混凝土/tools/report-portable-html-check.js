const AttachmentPackageChecker = require('../../結構工具箱/tools/attachment-package-check');

async function assertPortableFormalHtml(report, label, assert) {
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

  return { ...summary, approvedHtml: state.approvedHtml };
}

module.exports = { assertPortableFormalHtml };
