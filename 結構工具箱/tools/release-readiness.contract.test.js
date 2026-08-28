const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

let failed = 0;

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readText(relativePath) {
  return fs.readFileSync(repoFile(relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertIncludes(text, needle, label) {
  assert(text.includes(needle), label, needle);
}

const releaseWrapper = readText('run-preflight-tools-release.bat');
const preflight = readText('preflight-tools.ps1');
const releasePreflightLock = readText('結構工具箱/tools/release-preflight-lock.ps1');
const maturityMatrix = readText('結構工具箱/tools/tool-maturity-matrix.js');
const publicEvidenceSchema = readText('結構工具箱/assets/status/public-evidence-schema.js');
const dashboard = readText('結構工具箱/audit-dashboard.html');
const dashboardContract = readText('結構工具箱/tools/audit-dashboard.contract.test.js');
const dashboardBrowserSmoke = readText('結構工具箱/tools/audit-dashboard-browser-smoke.test.js');
const readme = readText('README.md');
const staging = readText('STAGING_GROUPS.md');
const boundaries = readText('TOOL_BOUNDARIES.md');
const reportGuide = readText('TOOL_REPORT_GUIDE.md');
const renderedEvidenceHelper = readText('結構工具箱/tools/rendered-delivery-evidence.js');
const formalBrowserSmoke = readText('結構工具箱/tools/formal-browser-smoke.test.js');
const localQuickBrowserSmoke = readText('結構工具箱/tools/local-quick-browser-smoke.test.js');
const steelBrowserRunner = readText('鋼構工具/steel-audit-browser-runner.js');
const steelResultReconciliationHelper = readText('鋼構工具/steel-result-reconciliation.js');
const rcAudit = readText('鋼筋混凝土/audit-tool.ps1');
const rcResultReconciliationHelper = readText('鋼筋混凝土/tools/report-result-reconciliation.js');
const rcPortableHtmlHelper = readText('鋼筋混凝土/tools/report-portable-html-check.js');
const rcReportScreenshotQuality = readText('鋼筋混凝土/tools/report-screenshot-quality.js');
const rcStmFormalAttachmentSources = [
  'deep-beam-stm', 'foundation-deep-beam-stm', 'pile-cap-3d-stm',
].map(name => ({ name, source:readText(`鋼筋混凝土/tools/${name}-regression.test.js`) }));
const rcSharedReport = readText('鋼筋混凝土/shared/report.js');
const formalSharedReport = readText('結構工具箱/core/ui/report.js');
const steelSharedReport = readText('鋼構工具/core/ui/report.js');
const formalWindReport = readText('結構工具箱/core/wind-report.js');
const attachmentPackageChecker = readText('結構工具箱/tools/attachment-package-check.js');
const attachmentPackageVerifier = readText('結構工具箱/tools/attachment-package-verify.js');
const attachmentPackageManagerWorker = readText('結構工具箱/tools/attachment-package-manager-worker.js');
const rcReportVisualSources = [
  'beam', 'column', 'slab', 'wall', 'shear-wall', 'foundation', 'single-pile', 'retrofit',
].map(name => ({ name, source: readText(`鋼筋混凝土/tools/${name}-report-visual.test.js`) }));
const deliveryArtifactsContract = readText('結構工具箱/tools/delivery-artifacts.contract.test.js');
const renderedEvidenceContract = readText('結構工具箱/tools/rendered-delivery-evidence.contract.test.js');
const renderedEvidenceInventory = readText('結構工具箱/tools/rendered-delivery-evidence.inventory.json');
const rcStmAtomicChangeSet = JSON.parse(readText('結構工具箱/tools/rc-stm-atomic-change-set.manifest.json'));
const stoneAutoWordArtifact = readText('石材固定/auto_word_artifact_test.py');
const anchorReportArtifacts = readText('螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts');
const anchorReportHtmlSeal = readText('螺栓檢討/bolt-review-tool/src/reportHtmlSeal.ts');
const anchorHtmlSealVerifier = readText('結構工具箱/tools/anchor-html-seal-verifier.js');
const xlsxPrintExporter = readText('結構工具箱/tools/xlsx-print-export.py');
const xlsxPrintVisual = readText('結構工具箱/tools/xlsx-print-visual.js');
const xlsxSealVerifier = readText('結構工具箱/tools/xlsx-seal-verifier.js');
const anchorWorkbook = readText('螺栓檢討/bolt-review-tool/src/reportWorkbook.ts');
const anchorWorkbookSeal = readText('螺栓檢討/bolt-review-tool/src/reportWorkbookSeal.ts');
const maturityMatrixApi = require('./tool-maturity-matrix.js');

const rcStmFormalAttachmentFixture = {
  schemaVersion: 27,
  rcStmFormalAttachment: {
    scope: 'rc-stm-supplemental-formal-attachments',
    required: 3,
    complete: 3,
    issueCount: 0,
    artifactRequired: 12,
    artifactVerified: 12,
    pass: true,
    setSha256: 'a'.repeat(64),
  },
};
assert(maturityMatrixApi.isCompleteRcStmFormalAttachmentEvidence(rcStmFormalAttachmentFixture), 'Schema v27 accepts the complete RC STM supplemental attachment fixture');
assert(maturityMatrixApi.isCompleteRcStmFormalAttachmentEvidence({ schemaVersion: 26 }), 'Schema v26 remains backward compatible without RC STM supplemental attachment evidence');
for (const [field, value] of [['complete', 2], ['issueCount', 1], ['artifactVerified', 11], ['pass', false], ['setSha256', 'invalid']]) {
  const mutated = JSON.parse(JSON.stringify(rcStmFormalAttachmentFixture));
  mutated.rcStmFormalAttachment[field] = value;
  assert(!maturityMatrixApi.isCompleteRcStmFormalAttachmentEvidence(mutated), `Schema v27 RC STM evidence fails closed when ${field} drifts`);
}

const publicTransitionRunId = '20260826-235959';
const publicTransitionMatrix = {
  generatedAt: '2026-08-26T23:59:59+08:00',
  entrypointCoverage: {
    boundaryRoutes: [],
    pageOnlyBoundaryRequired: 0,
    pageOnlyBoundaryComplete: 0,
    pageOnlyBoundaryIssueCount: 0,
  },
  rows: [
    { family: 'formal-tools', coverage: { reportModes: true, reportTextSmoke: true } },
    { family: 'local-quick-tools', coverage: { reportModes: true, reportTextSmoke: true } },
  ],
  independentBenchmarkCoverage: {
    status: 'ready',
    summary: {
      eligibleFormalRoutes: 0,
      independentlyVerifiedRoutes: 0,
      pilotRequired: 0,
      pilotVerified: 0,
      candidateRequired: 0,
      candidateVerified: 0,
      issueCount: 0,
    },
  },
};
const publicTransitionPreflightStatus = {
  runId: publicTransitionRunId,
  sourcePath: 'output/preflight/history/schema-v27/preflight-summary.json',
};
const publicTransitionPreflightPayload = {
  runId: publicTransitionRunId,
  pass: true,
  records: [
    { key: 'formal-browser-smoke', pass: true },
    { key: 'local-quick-tools-runner', pass: true },
  ],
};
const publicTransitionEvidence = {
  payload: {
    ...rcStmFormalAttachmentFixture,
    kind: 'release-rendered-delivery-evidence',
    runId: publicTransitionRunId,
    required: 1,
    complete: 1,
    pass: true,
  },
  families: [{ family: 'formal-tools', complete: 1 }],
  sourcePath: 'output/preflight/history/schema-v27/rendered-delivery-evidence/rendered-delivery-evidence-summary.json',
  sourceHash: 'b'.repeat(64),
};
const passingPublicTransition = maturityMatrixApi.buildHomepageReportReadinessStatus(
  publicTransitionMatrix,
  'c'.repeat(64),
  publicTransitionPreflightStatus,
  publicTransitionPreflightPayload,
  publicTransitionEvidence,
);
assert(passingPublicTransition.pass === true && passingPublicTransition.failureCount === 0, 'Schema v27 complete RC STM evidence keeps the public readiness snapshot green');
assert(passingPublicTransition.rcStmFormalAttachmentRequired === 3 && passingPublicTransition.rcStmFormalAttachmentComplete === 3, 'Schema v27 public readiness exposes RC STM 3 / 3');
assert((passingPublicTransition.details || []).some(detail => detail.includes('RC STM 正式入口附件')), 'Schema v27 public readiness explains the RC STM formal-entry boundary');
const failingPublicTransitionEvidence = JSON.parse(JSON.stringify(publicTransitionEvidence));
Object.assign(failingPublicTransitionEvidence.payload.rcStmFormalAttachment, { complete: 2, issueCount: 1, pass: false });
const failingPublicTransition = maturityMatrixApi.buildHomepageReportReadinessStatus(
  publicTransitionMatrix,
  'c'.repeat(64),
  publicTransitionPreflightStatus,
  publicTransitionPreflightPayload,
  failingPublicTransitionEvidence,
);
assert(failingPublicTransition.pass === false && failingPublicTransition.failureCount === 1, 'Schema v27 incomplete RC STM evidence fails the public readiness snapshot closed');
[
  'function optionalCoverage',
  "optionalCoverage(readiness, 'rcStmFormalAttachmentRequired'",
  'metrics.rcStmAttachment.pass',
].forEach(needle => assertIncludes(publicEvidenceSchema, needle, `public evidence schema governs optional RC STM transition ${needle}`));

[
  'node 結構工具箱/tools/xlsx-seal-verifier.test.js',
  'node 結構工具箱/tools/xlsx-print-visual.test.js',
  'node 結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
].forEach(needle => assertIncludes(preflight, needle, `preflight preserves XLSX Office print visual gate ${needle}`));
[
  'DispatchEx("Excel.Application")',
  'UpdateLinks=0',
  'ReadOnly=True',
  'AutomationSecurity',
  'ExportAsFixedFormat',
].forEach(needle => assertIncludes(xlsxPrintExporter, needle, `XLSX print exporter preserves controlled Office boundary ${needle}`));
[
  'validatePdfFile',
  'verifyPrintMetadata',
  'not-a4',
  'horizontal-overflow-pages',
  'artifactSetSha256',
].forEach(needle => assertIncludes(xlsxPrintVisual, needle, `XLSX print visual gate preserves ${needle}`));
[
  "paperSize: 9",
  "orientation: isWideTable ? 'landscape' : 'portrait'",
  'fitToWidth: 1',
  'fitToHeight: 0',
  "printTitlesRow: '1:1'",
].forEach(needle => assertIncludes(anchorWorkbook, needle, `anchor workbook preserves printable XLSX setting ${needle}`));
[
  'anchor-xlsx-calculation-book-content-v1',
  'anchor-xlsx-calculation-book-approval-v1',
  'content-sha256-mismatch',
  'approval-sha256-mismatch',
  'canonicalContent',
  'canonicalApproval',
].forEach(needle => assertIncludes(xlsxSealVerifier, needle, `independent XLSX seal verifier preserves ${needle}`));
[
  'appendAnchorWorkbookSealRows',
  'XLSX 內容 SHA-256',
  'XLSX 核可 SHA-256',
  '非核可人身分之數位簽章',
].forEach(needle => assertIncludes(anchorWorkbookSeal, needle, `anchor workbook seal producer preserves ${needle}`));

[
  'htmlDualSealEvidence',
  'htmlDualSealExpected',
  'htmlDualSealVerified',
  'xlsxDualSealEvidence',
  'xlsxDualSealExpected',
  'xlsxDualSealVerified',
  '只顯示完成數，不輸出封印值',
].forEach(needle => assertIncludes(attachmentPackageVerifier, needle, `attachment verifier preserves private dual seal evidence ${needle}`));
[
  'dualSealSummaryLine',
  'xlsxDualSealSummaryLine',
  'htmlDualSealExpected',
  'htmlDualSealVerified',
  'xlsxDualSealExpected',
  'xlsxDualSealVerified',
  "anchor: '錨栓'",
  '雙封印',
].forEach(needle => assertIncludes(attachmentPackageManagerWorker, needle, `attachment manager exposes dual seal verification ${needle}`));
[
  ['README', readme],
  ['STAGING_GROUPS', staging],
  ['TOOL_BOUNDARIES', boundaries],
].forEach(([label, source]) => {
  assertIncludes(source, 'HTML 雙封印', `${label} documents daily package dual seal evidence`);
  assertIncludes(source, 'XLSX 雙封印', `${label} documents daily package XLSX dual seal evidence`);
  assertIncludes(source, '封印值', `${label} keeps daily package seal values private`);
});

[
  'preflight-tools.ps1',
  '-Quiet',
  '-ForceSlowChecks',
  '-ForcePlatformAudit',
].forEach(needle => assertIncludes(releaseWrapper, needle, `release wrapper keeps ${needle}`));
assert(!releaseWrapper.includes('-Quick'), 'release wrapper does not run quick mode', 'run-preflight-tools-release.bat');
assert(!releaseWrapper.includes('%*'), 'release wrapper does not pass through arbitrary arguments', 'prevents -Quick override');
[
  'Enter-ReleasePreflightLock',
  'Get-ReleasePreflightMutexName',
  'Local\\StructuralToolsReleasePreflight-',
  'WaitOne(0)',
  'AbandonedMutexException',
  'Another formal release preflight is already running for this workspace',
].forEach(needle => assertIncludes(releasePreflightLock, needle, `release singleton lock preserves ${needle}`));
[
  '$isReleaseMode',
  '(-not $Quick) -and [bool]$ForcePlatformAudit -and [bool]$ForceSlowChecks',
  'release-preflight-lock.ps1',
  'Enter-ReleasePreflightLock -WorkspaceRoot $root',
  'function Close-ReleasePreflightLock',
  'trap {',
  'Close-ReleasePreflightLock',
  'node 結構工具箱/tools/release-preflight-lock.test.js',
].forEach(needle => assertIncludes(preflight, needle, `preflight preserves release singleton wiring ${needle}`));
assert(
  preflight.indexOf('function Close-ReleasePreflightLock') < preflight.indexOf('Enter-ReleasePreflightLock -WorkspaceRoot $root'),
  'preflight defines its cleanup function before lock acquisition can fail',
);

[
  '[switch]$ForcePlatformAudit',
  '[switch]$ForceSlowChecks',
  'forcePlatformAudit = [bool]$ForcePlatformAudit',
  'forceSlowChecks = [bool]$ForceSlowChecks',
  'sourceCommitSha = $sourceCommitSha',
  'sourceBranch = $sourceBranch',
  'sourceDirty = $sourceDirty',
  'Release preflight requires an identifiable Git source commit and worktree state',
  'Release preflight requires a clean Git worktree',
  'Quick preflight cannot be combined with release force flags',
  '$ForceSlowChecks -or $ForcePlatformAudit',
  'release startup existing node cleanup',
  'release slow checks startup',
  'slowReuseCount = $runSlowReuseKeys.Count',
  'slowReuseKeys = @($runSlowReuseKeys.ToArray())',
  'platformAuditReused = $runPlatformAuditReused',
  'Path = \'run-preflight-tools-release.bat\'',
  'Needles = @(\'preflight-tools.ps1\', \'-Quiet\', \'-ForceSlowChecks\', \'-ForcePlatformAudit\')',
  'release-readiness-contract',
  'node 結構工具箱/tools/release-readiness.contract.test.js',
  'Release readiness governance contract',
  'PREFLIGHT_RUN_DIR',
  'rendered-delivery-evidence.js',
  'PREFLIGHT_RELEASE',
  'rendered-delivery-evidence',
  'node 結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
  'Rendered delivery evidence release gate',
  'independent-engineering-benchmarks',
  'node 結構工具箱/tools/independent-engineering-benchmarks.test.js',
  'node 結構工具箱/tools/independent-engineering-benchmarks.js --write',
  'Independent engineering benchmarks',
].forEach(needle => assertIncludes(preflight, needle, `preflight preserves release readiness ${needle}`));

[
  '$postSummaryMatrixArgs = @(',
  'if (-not $isReleaseMode) { $postSummaryMatrixArgs += "--preserve-homepage-status" }',
].forEach(needle => assertIncludes(preflight, needle, `preflight restricts tracked homepage status publication to formal release mode ${needle}`));
assert(
  !preflight.includes('if ($Quick) { $postSummaryMatrixArgs += "--preserve-homepage-status" }'),
  'ordinary full preflight cannot publish tracked formal-release homepage status',
);

[
  'Page.printToPDF',
  'pdfinfo',
  'pdftotext',
  'pdftoppm',
  'readPpmMetrics',
  'PDF has readable text',
  'PDF reading order keeps title before project metadata',
  'report tables expose headings',
  'PDF excludes page-only/forbidden text',
  'content is not clipped at page edges',
  'PDF footer does not overlap report content',
  'findPdfFooterOverlapLines',
  'PDF keeps section headings with following content',
  'findPdfOrphanPageEndHeadings',
  'PDF continuation pages start with context',
  'findPdfUncontextualPageStarts',
  'PDF final page is not sparse',
  'findSparseFinalPage',
  'marginBottom: 0.55',
  'writeEvidenceSummary',
].forEach(needle => assertIncludes(renderedEvidenceHelper, needle, `rendered delivery helper preserves ${needle}`));

[
  'renderAndValidateReportPdf',
  'formalTools.map(tool => tool.key)',
  'shared-summary-layout',
  'shared-detailed-layout',
  'writeEvidenceSummary',
  'buildFormalResultReconciliation',
  'golden-state-to-report-fingerprint',
  'resultReconciliation',
].forEach(needle => assertIncludes(formalBrowserSmoke, needle, `formal browser smoke preserves rendered evidence ${needle}`));
[
  'formal-calculation-book-content-v1',
  'formal-calculation-book-approval-v2',
  '核可人（選填）',
  '核可依據（選填）',
  '核可後修改上述紀錄會撤銷正式核可，需重新勾選',
  '核可紀錄已異動，正式核可已撤銷；請確認後重新勾選',
  'function updateApprovalMetadata()',
  'data-approved-by',
  'data-approval-basis',
  'verifyReportContentSeal',
  'verifyReportApprovalSeal',
  '內容完整性異常',
  '核可完整性異常',
].forEach(needle => assertIncludes(formalSharedReport, needle, `formal shared report preserves HTML dual seal ${needle}`));
assertIncludes(formalSharedReport, '內容完整性：此預覽頁尚未封印；下載目前版本 HTML 時建立 SHA-256 內容封印', 'formal shared report explains when the live preview receives a content seal');
assertIncludes(formalSharedReport, '核可完整性：此預覽頁尚未封印；下載目前版本 HTML 時建立 SHA-256 核可封印', 'formal shared report explains when the live preview receives an approval seal');
assertIncludes(steelSharedReport, '內容完整性：此預覽頁尚未封印；下載目前版本 HTML 時建立 SHA-256 內容封印', 'steel shared report explains when the live preview receives a content seal');
assertIncludes(steelSharedReport, '核可完整性：此預覽頁尚未封印；下載目前版本 HTML 時建立 SHA-256 核可封印', 'steel shared report explains when the live preview receives an approval seal');
[
  '<!--formal-content-seal:start-->',
  '<!--formal-content-seal:end-->',
  'rep-sealed-content',
].forEach(needle => assertIncludes(formalWindReport, needle, `formal wind/seismic report preserves sealed calculation boundary ${needle}`));
[
  'verifyApprovedHtmlDualSeals',
  'contentTamperDetectionStatus',
  'approvalTamperDetectionStatus',
  'htmlArtifactSha256',
].forEach(needle => assertIncludes(formalBrowserSmoke, needle, `formal browser smoke preserves HTML dual seal evidence ${needle}`));

[
  'renderAndValidateReportPdf',
  'manifest.tools.map(tool => tool.key)',
  'shared-summary-layout',
  'shared-detailed-layout',
  'writeEvidenceSummary',
  'new home preflight source commit',
  'new home preflight clean source',
  '成品檔案完整性',
  '145 / 145',
  '151 / 151',
].forEach(needle => assertIncludes(localQuickBrowserSmoke, needle, `local quick browser smoke preserves rendered evidence ${needle}`));

[
  'steel-main-plate',
  'steel-beam-formal',
  'steel-column-formal',
  'renderAndValidateReportPdf',
  'writeEvidenceSummary',
].forEach(needle => assertIncludes(steelBrowserRunner, needle, `steel browser runner preserves rendered evidence ${needle}`));
[
  'captureReportApprovalState',
  'verifySteelApprovedHtml',
  'saveSteelApprovedHtml',
  "evidenceRole: 'approved-formal-attachment'",
  'contentTamperDetectionStatus',
  'approvalTamperDetectionStatus',
  'htmlArtifactSha256',
].forEach(needle => assertIncludes(steelBrowserRunner, needle, `steel browser runner preserves approved HTML dual seal evidence ${needle}`));

[
  'Beam regression and report visual smoke',
  'Column regression and report visual smoke',
  'Slab regression and report visual smoke',
  'Wall regression and report visual smoke',
  'Shear wall report visual smoke',
  'Foundation regression and report visual smoke',
  'Single pile regression and report visual smoke',
  'RC Retrofit report visual smoke',
].forEach(needle => assertIncludes(rcAudit, needle, `RC audit preserves actual report rendering ${needle}`));

[
  'RC STM independent engineering benchmarks',
  'rc-stm-independent-engineering-gate.test.js',
  'recordCount = $auditRecords.Count',
  'TimeoutSeconds = 120',
].forEach(needle => assertIncludes(rcAudit, needle, `RC audit preserves its local STM independent benchmark gate ${needle}`));
[
  'RC STM independent engineering benchmarks',
  'rc-stm-independent-engineering-benchmarks.txt',
  'RC STM independent benchmark record count drifted',
  'RC STM independent benchmark record failed',
  'candidates=24/24',
  'pass=15/15',
  'reject=9/9',
  'assertions=564',
  'falseAcceptance=blocked',
  'falseRejection=blocked',
].forEach(needle => assertIncludes(preflight, needle, `preflight validates RC STM audit evidence ${needle}`));

[
  'rc-project-replay-to-report-fingerprint',
  'sourceSnapshotSha256',
  'RC report fingerprint matches the recalculated source snapshot',
  'rc-form-replay-to-report-fingerprint',
].forEach(needle => assertIncludes(rcResultReconciliationHelper, needle, `RC result reconciliation helper preserves ${needle}`));
for (const { name, source } of rcReportVisualSources) {
  assertIncludes(source, 'buildRcResultReconciliation', `RC ${name} report visual smoke builds result reconciliation`);
  assertIncludes(source, 'resultReconciliation', `RC ${name} report visual audit records result reconciliation`);
}
[
  'renderStandaloneFormalHtmlPdf',
  'standalone HTML keeps screen controls out of print media',
  'standalone HTML reopens without external network requests',
  "'standaloneFormalHtmlPrintPdf'",
  'changed standalone HTML is visibly blocked on screen and in print',
  'changed approval record is independently blocked on screen and in print',
].forEach(needle => assertIncludes(rcPortableHtmlHelper, needle, `RC portable formal HTML helper preserves ${needle}`));
assertIncludes(rcReportScreenshotQuality, 'continuationContextLabels: options.continuationContextLabels || []', 'RC standalone PDF quality forwards report-specific continuation context labels');
for (const { name, source } of rcStmFormalAttachmentSources) {
  [
    'PREFLIGHT_RUN_DIR',
    'rc-stm-formal',
    'assertPortableFormalHtml',
    'continuationContextLabels',
    `${name}-formal-evidence.json`,
  ].forEach(needle => assertIncludes(source, needle, `RC ${name} regression preserves supplemental formal attachment evidence ${needle}`));
}
[
  'rc-calculation-book-content-v1',
  'sha256Fallback',
  'verifyReportContentSeal',
  '內容完整性異常',
  '非數位簽章',
].forEach(needle => assertIncludes(rcSharedReport, needle, `RC shared report preserves HTML content seal ${needle}`));
[
  'rc-calculation-book-approval-v2',
  '核可人（選填）',
  '核可依據（選填）',
  '核可後修改上述紀錄會撤銷正式核可，需重新勾選',
  '核可紀錄已異動，正式核可已撤銷；請確認後重新勾選',
  'function updateApprovalMetadata()',
  'data-approved-by',
  'data-approval-basis',
  'verifyReportApprovalSeal',
  '核可完整性異常',
].forEach(needle => assertIncludes(rcSharedReport, needle, `RC shared report preserves HTML approval seal ${needle}`));
assertIncludes(rcSharedReport, '核可完整性：此預覽頁尚未封印；下載目前版本 HTML 時建立 SHA-256 核可封印', 'RC shared report explains when the live preview receives an approval seal');
assertIncludes(reportGuide, '不得誤稱為舊版', 'report guide distinguishes a live unsealed preview from a legacy report');
[
  'verifyRcHtmlContentSeal',
  'rc-html-content-seal-missing',
  'rc-html-content-seal-invalid',
  '可能是舊版輸出',
].forEach(needle => assertIncludes(attachmentPackageChecker, needle, `attachment checker preserves RC HTML content seal ${needle}`));
[
  'verifyRcHtmlApprovalSeal',
  'rc-html-approval-seal-missing',
  'rc-html-approval-seal-invalid',
  '人工複核核可狀態',
].forEach(needle => assertIncludes(attachmentPackageChecker, needle, `attachment checker preserves RC HTML approval seal ${needle}`));
[
  'verifyFormalHtmlContentSeal',
  'verifyFormalHtmlApprovalSeal',
  'formal-html-content-seal-invalid',
  'formal-html-approval-seal-invalid',
].forEach(needle => assertIncludes(attachmentPackageChecker, needle, `attachment checker preserves formal-tool HTML dual seal ${needle}`));

[
  'verifyAnchorHtmlDualSeals',
  'isAnchorHtmlSealRequired',
  'anchor-html-content-seal-missing',
  'anchor-html-content-seal-invalid',
  'anchor-html-approval-seal-missing',
  'anchor-html-approval-seal-invalid',
].forEach(needle => assertIncludes(attachmentPackageChecker, needle, `attachment checker preserves anchor HTML dual seal ${needle}`));

[
  'steel-source-replay-to-report-fingerprint',
  'sourcePayloadSha256',
  'steel rendered report fingerprint matches its replayed source',
].forEach(needle => assertIncludes(steelResultReconciliationHelper, needle, `steel result reconciliation helper preserves ${needle}`));
[
  'buildSteelResultReconciliation',
  'resultReconciliation',
  'calculationFingerprint',
].forEach(needle => assertIncludes(steelBrowserRunner, needle, `steel browser runner preserves result reconciliation ${needle}`));

[
  'extract_docx_text',
  'docxPayload.text.length > 2500',
  'workbook/docx 邊界',
].forEach(needle => assertIncludes(deliveryArtifactsContract, needle, `delivery artifact contract preserves extracted Office evidence ${needle}`));

[
  'inventory.tools.length, 37',
  "process.env.PREFLIGHT_RELEASE === '1'",
  "['formal-tools', 'local-quick-tools', 'steel-formal', 'src-formal']",
  "family === 'rc-formal'",
  "family === 'rc-retrofit'",
  "family === 'rc-stm-formal'",
  "family === 'stone-formal'",
  "family === 'anchor-formal'",
  "family === 'decking-formal'",
  "'seismic-dynamic'",
  "family: 'seismic-report'",
  "'excavation-formal'",
  'release rendered evidence resolves every homepage formal tool',
  'release rendered evidence resolves every supplemental report and service artifact',
  'supplementalRequired: 2',
  'supplementalRecords',
  'schemaVersion: 28',
  'rcSupplementalAttachments',
  'rcStmFormalAttachment',
  "scope:'rc-stm-supplemental-formal-attachments'",
  'rcStmFormalAttachment=',
  'canonicalArtifactIntegrity',
  'docxPackageIntegrity',
  "scope: 'formal-docx-clean-ooxml-package'",
  'docxPackageIntegrity=',
  'xlsxPackageIntegrity',
  "scope: 'formal-xlsx-clean-ooxml-package-and-formula-cache'",
  'xlsxPackageIntegrity=',
  'xlsxPrintVisual',
  "scope: 'formal-xlsx-microsoft-excel-pdf-visual-print'",
  'xlsxPrintVisual=',
  'xlsxDualSeal',
  "scope: 'formal-anchor-xlsx-content-and-approval-dual-seal'",
  'xlsxContentSeal=',
  'xlsxApprovalSeal=',
  "scope: 'canonical-rendered-pdf-evidence'",
  'required: 66',
  'canonicalIntegrity=',
  'formalResultReconciliation',
  "scope: 'formal-golden-result-to-report-fingerprint'",
  'formalResultReconciliation=',
  'rcResultReconciliation',
  "scope: 'rc-source-replay-to-report-fingerprint'",
  'required: 34',
  'rcResultReconciliation=',
  'rcSourceReportPackage',
  "scope: 'rc-real-source-json-to-formal-html-package-check'",
  'required: 32',
  'rcSourceReportPackage=',
  'rcStandaloneFormalHtmlPrint',
  "scope: 'rc-approved-standalone-html-to-validated-pdf'",
  'rcStandaloneFormalHtmlPrint=',
  'rcFormalHtmlContentSeal',
  "scope: 'rc-formal-html-reproducible-content-sha256'",
  'rcFormalHtmlContentSeal=',
  'rcFormalHtmlApprovalSeal',
  "scope: 'rc-formal-html-reproducible-approval-sha256'",
  'rcFormalHtmlApprovalSeal=',
  'formalHtmlContentSeal',
  "scope: 'formal-tools-html-reproducible-content-sha256'",
  'formalHtmlContentSeal=',
  'formalHtmlApprovalSeal',
  "scope: 'formal-tools-html-reproducible-approval-sha256'",
  'formalHtmlApprovalSeal=',
  'steelHtmlContentSeal',
  "scope: 'steel-formal-html-reproducible-content-sha256'",
  'steelHtmlContentSeal=',
  'steelHtmlApprovalSeal',
  "scope: 'steel-formal-html-reproducible-approval-sha256'",
  'steelHtmlApprovalSeal=',
  'anchorHtmlContentSeal',
  "scope: 'anchor-formal-html-reproducible-content-sha256'",
  'anchorHtmlContentSeal=',
  'anchorHtmlApprovalSeal',
  "scope: 'anchor-formal-html-reproducible-approval-sha256'",
  'anchorHtmlApprovalSeal=',
  'steelResultReconciliation',
  "scope: 'steel-source-replay-to-report-fingerprint'",
  'required: 5',
  'steelResultReconciliation=',
  'stoneResultReconciliation',
  "scope: 'stone-golden-replay-to-pdf-docx-hash'",
  'stoneResultReconciliation=',
  'anchorResultReconciliation',
  "scope: 'anchor-workspace-replay-to-html-docx-xlsx-hash'",
  'anchorResultReconciliation=',
  'deckingResultReconciliation',
  "scope: 'decking-json-replay-to-docx-hash'",
  'deckingResultReconciliation=',
  'excavationResultReconciliation',
  "scope: 'excavation-project-state-replay-to-pdf-docx-hash'",
  'excavationResultReconciliation=',
  'localQuickResultReconciliation',
  "scope: 'local-quick-json-replay-to-pdf-hash'",
  'localQuickResultReconciliation=',
  'rendered-delivery-evidence-summary.json',
].forEach(needle => assertIncludes(renderedEvidenceContract, needle, `rendered evidence aggregate contract preserves ${needle}`));
assert(JSON.parse(renderedEvidenceInventory).tools.length === 37, 'rendered evidence inventory has 37 formal tools', 'rendered-delivery-evidence.inventory.json');
assert(JSON.parse(renderedEvidenceInventory).rcSupplementalAttachments.length === 3, 'rendered evidence inventory has three RC STM dedicated formal-entry attachments', 'rendered-delivery-evidence.inventory.json');
assert(rcStmAtomicChangeSet.kind === 'rc-stm-atomic-change-set' && rcStmAtomicChangeSet.schemaVersion === 2, 'release governance reads the RC STM atomic change-set manifest with governed handoff edges');
assert(Array.isArray(rcStmAtomicChangeSet.handoffs) && rcStmAtomicChangeSet.handoffs.length === 4, 'RC STM atomic change set declares all four cross-tool handoffs');
assert(rcStmAtomicChangeSet.homepageFormalToolDelta === 3, 'RC STM atomic change set records the three formal homepage promotions');
assert(rcStmAtomicChangeSet.releaseEvidence?.schemaVersion === 27
  && rcStmAtomicChangeSet.releaseEvidence?.requiredAttachments === 3
  && rcStmAtomicChangeSet.releaseEvidence?.requiredArtifacts === 12,
'RC STM atomic change set matches Schema v27 release evidence counts');
const rcStmAtomicPaths = new Set(rcStmAtomicChangeSet.groups.flatMap(group => group.paths));
[
  '結構工具箱/tools/rc-stm-atomic-change-set.manifest.json',
  '結構工具箱/tools/rc-stm-atomic-change-set.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.test.js',
].forEach(relativePath => assert(rcStmAtomicPaths.has(relativePath), 'RC STM atomic manifest includes its governance implementation', relativePath));
assertIncludes(preflight, 'node 結構工具箱/tools/rc-stm-atomic-change-set-review.test.js', 'preflight runs the RC STM atomic review contract');
assertIncludes(preflight, 'node 結構工具箱/tools/regulatory-data.contract.test.js', 'preflight runs the regulatory data synchronization contract');

[
  'release-readiness-contract',
  '正式放行證據',
  '結構工具箱/tools/release-readiness.contract.test.js',
  'minCatalogs: 0',
  'forcePlatformAudit: preflightSummary.forcePlatformAudit',
  'forceSlowChecks: preflightSummary.forceSlowChecks',
  "sourceCommitSha: String(preflightSummary.sourceCommitSha || '')",
  'sourceDirty: preflightSummary.sourceDirty !== false',
  'typeof payload.latestPreflight.forcePlatformAudit',
  'typeof payload.latestPreflight.forceSlowChecks',
  'tool maturity matrix release readiness gate passed',
  'rendered-delivery-evidence',
  '實際交付物渲染佐證',
  'tool maturity matrix rendered delivery evidence gate passed',
  'independent-engineering-benchmarks',
  '獨立工程基準',
  'tool maturity matrix independent engineering benchmark gate passed',
  '## Independent Engineering Benchmarks',
  'function isRenderedDeliveryRelease',
  'function isCompleteFormalPreflight',
  'payload.postChecksPassedCount === payload.postCheckCount',
  'payload.postCheckFailures.length === 0',
  "/^[0-9a-f]{40}$/i.test(String(payload.sourceCommitSha || ''))",
  'payload.sourceDirty === false',
  "const currentRunId = String(currentBundle.preflightStatus?.runId || '')",
  ".filter(bundle => String(bundle.preflightStatus?.runId || '') !== currentRunId)",
  'function isCompleteRenderedDeliveryEvidence',
  'function isCompleteRcStmFormalAttachmentEvidence',
  'completeIntegrityDeclared',
  'resultReconciliationDeclared',
  'rcResultReconciliationDeclared',
  'rcSourceReportPackageDeclared',
  'rcStandaloneFormalHtmlPrintDeclared',
  'rcFormalHtmlContentSealDeclared',
  'rcFormalHtmlApprovalSealDeclared',
  'formalHtmlDualSealDeclared',
  'steelHtmlDualSealDeclared',
  'anchorHtmlDualSealDeclared',
  'docxPackageIntegrityDeclared',
  'xlsxPackageIntegrityDeclared',
  'xlsxPrintVisualDeclared',
  'xlsxDualSealDeclared',
  'rcStmFormalAttachmentDeclared',
  'steelResultReconciliationDeclared',
  'stoneResultReconciliationDeclared',
  'anchorResultReconciliationDeclared',
  'deckingResultReconciliationDeclared',
  'excavationResultReconciliationDeclared',
  'localQuickResultReconciliationDeclared',
  "evidence.canonicalArtifactIntegrity?.scope === 'canonical-rendered-pdf-evidence'",
  'expectedCanonicalArtifactIntegrityCount',
  'evidence.canonicalArtifactIntegrity.required === expectedCanonicalArtifactIntegrityCount',
  "evidence.docxPackageIntegrity?.scope === 'formal-docx-clean-ooxml-package'",
  'evidence.docxPackageIntegrity.required === 4',
  "evidence.xlsxPackageIntegrity?.scope === 'formal-xlsx-clean-ooxml-package-and-formula-cache'",
  'evidence.xlsxPackageIntegrity.required === 1',
  "evidence.xlsxPrintVisual?.scope === 'formal-xlsx-microsoft-excel-pdf-visual-print'",
  'evidence.xlsxPrintVisual.sheetRequired === 9',
  "evidence.xlsxDualSeal?.scope === 'formal-anchor-xlsx-content-and-approval-dual-seal'",
  'evidence.xlsxDualSeal.contentRequired === 1',
  'evidence.xlsxDualSeal.approvalRequired === 1',
  "evidence.rcStmFormalAttachment?.scope === 'rc-stm-supplemental-formal-attachments'",
  'evidence.rcStmFormalAttachment.required === 3',
  'evidence.rcStmFormalAttachment.artifactRequired === 12',
  "evidence.formalResultReconciliation?.scope === 'formal-golden-result-to-report-fingerprint'",
  'evidence.formalResultReconciliation.required === 14',
  "'rc-source-replay-to-report-fingerprint'",
  'expandedRcResultReconciliationDeclared ? 32 : 30',
  "evidence.rcSourceReportPackage?.scope === 'rc-real-source-json-to-formal-html-package-check'",
  'evidence.rcSourceReportPackage.required === 32',
  "evidence.rcStandaloneFormalHtmlPrint?.scope === 'rc-approved-standalone-html-to-validated-pdf'",
  'evidence.rcStandaloneFormalHtmlPrint.required === 34',
  "evidence.rcFormalHtmlContentSeal?.scope === 'rc-formal-html-reproducible-content-sha256'",
  'evidence.rcFormalHtmlContentSeal.required === 34',
  "evidence.rcFormalHtmlApprovalSeal?.scope === 'rc-formal-html-reproducible-approval-sha256'",
  'evidence.rcFormalHtmlApprovalSeal.required === 34',
  "evidence.formalHtmlContentSeal?.scope === 'formal-tools-html-reproducible-content-sha256'",
  'evidence.formalHtmlContentSeal.required === 14',
  "evidence.formalHtmlApprovalSeal?.scope === 'formal-tools-html-reproducible-approval-sha256'",
  'evidence.formalHtmlApprovalSeal.required === 14',
  "evidence.steelHtmlContentSeal?.scope === 'steel-formal-html-reproducible-content-sha256'",
  'evidence.steelHtmlContentSeal.required === 5',
  "evidence.steelHtmlApprovalSeal?.scope === 'steel-formal-html-reproducible-approval-sha256'",
  'evidence.steelHtmlApprovalSeal.required === 5',
  "evidence.anchorHtmlContentSeal?.scope === 'anchor-formal-html-reproducible-content-sha256'",
  'evidence.anchorHtmlContentSeal.required === 1',
  "evidence.anchorHtmlApprovalSeal?.scope === 'anchor-formal-html-reproducible-approval-sha256'",
  'evidence.anchorHtmlApprovalSeal.required === 1',
  "evidence.steelResultReconciliation?.scope === 'steel-source-replay-to-report-fingerprint'",
  'evidence.steelResultReconciliation.required === 5',
  "evidence.stoneResultReconciliation?.scope === 'stone-golden-replay-to-pdf-docx-hash'",
  'evidence.stoneResultReconciliation.required === 1',
  "evidence.anchorResultReconciliation?.scope === 'anchor-workspace-replay-to-html-docx-xlsx-hash'",
  'evidence.anchorResultReconciliation.required === 1',
  "evidence.deckingResultReconciliation?.scope === 'decking-json-replay-to-docx-hash'",
  'evidence.deckingResultReconciliation.required === 1',
  "evidence.excavationResultReconciliation?.scope === 'excavation-project-state-replay-to-pdf-docx-hash'",
  'evidence.excavationResultReconciliation.required === 1',
  "evidence.localQuickResultReconciliation?.scope === 'local-quick-json-replay-to-pdf-hash'",
  'expandedLocalQuickResultReconciliationDeclared',
  'expectedLocalQuickResultReconciliationCount',
  'evidence.localQuickResultReconciliation.required === expectedLocalQuickResultReconciliationCount',
  'function resolveRenderedDeliveryEvidenceSource',
  'function resolveHomepagePreflightSource',
  'isCompleteFormalPreflight(latestSummary)',
  'latestReleaseSummary = readJsonIfExists(preflightSummarySourcePath)',
  'renderedDeliveryEvidenceRequired',
  'renderedDeliveryEvidenceSourceHash',
  'supplementalDeliveryEvidenceRequired',
  'supplementalDeliveryEvidenceFamilies',
  '補充報告 / 服務實際交付物渲染',
  'deliveryFileIntegrityRequired',
  'deliveryFileIntegrityVerified',
  'deliveryFileIntegrityBreakdown',
  '公開狀態只提供類別、數量與通過狀態',
  'formalResultReconciliationRequired',
  '正式計算書結果鏈',
  'rcResultReconciliationRequired',
  'RC 正式計算書結果鏈',
  'rcSourceReportPackageRequired',
  'RC 來源／正式 HTML 組包',
  'rcStandaloneFormalHtmlPrintRequired',
  'RC 核可 HTML 獨立列印',
  'rcFormalHtmlContentSealRequired',
  'RC 正式 HTML 內容封印',
  'rcFormalHtmlApprovalSealRequired',
  'RC 正式 HTML 核可封印',
  'rcStmFormalAttachmentRequired',
  'RC STM 正式入口附件',
  'formalHtmlContentSealRequired',
  'formalHtmlApprovalSealRequired',
  '風力／地震正式 HTML 雙封印',
  'steelHtmlContentSealRequired',
  'steelHtmlApprovalSealRequired',
  '鋼構正式 HTML 雙封印',
  'anchorHtmlContentSealRequired',
  'anchorHtmlApprovalSealRequired',
  '錨栓正式 HTML 雙封印',
  'docxPackageIntegrityRequired',
  '正式 Word 附件乾淨封裝',
  'xlsxPackageIntegrityRequired',
  '正式 Excel 附件乾淨封裝',
  'xlsxPrintVisualRequired',
  '正式 Excel 列印成品',
  'xlsxContentSealRequired',
  'xlsxApprovalSealRequired',
  '正式 Excel 雙封印',
  'steelResultReconciliationRequired',
  '鋼構正式計算書結果鏈',
  'stoneResultReconciliationRequired',
  '石材正式計算書結果鏈',
  'anchorResultReconciliationRequired',
  '錨栓正式計算書結果鏈',
  'deckingResultReconciliationRequired',
  '覆工板正式計算書結果鏈',
  'excavationResultReconciliationRequired',
  '開挖擋土支撐正式計算書結果鏈',
  'localQuickResultReconciliationRequired',
  '局部快算計算書結果鏈',
].forEach(needle => assertIncludes(maturityMatrix, needle, `maturity matrix preserves release readiness ${needle}`));

[
  'replay_golden_formal_payload',
  'stone-golden-replay-to-pdf-docx-hash',
  'goldenCaseSha256',
  'goldenInputSha256',
  'sourcePayloadSha256',
  'pdfSha256',
  'docxSha256',
  'auditSha256',
].forEach(needle => assertIncludes(stoneAutoWordArtifact, needle, `stone formal artifact preserves ${needle}`));

[
  'buildWorkspaceBackup',
  'verifyWorkspaceBackupReplay',
  'anchor-workspace-replay-to-html-docx-xlsx-hash',
  'sourceBackupSha256',
  'sourceReplayFingerprint',
  'calculationFingerprint',
  'htmlSha256',
  'docxSha256',
  'workbookSha256',
  'referenceTextSha256',
  "referenceTextRole: 'non-formal-reference-text'",
  "referenceTextPackageStatus: 'blocked'",
  "evidenceRole: 'approved-formal-attachment'",
  'contentTamperDetectionStatus',
  'approvalTamperDetectionStatus',
].forEach(needle => assertIncludes(anchorReportArtifacts, needle, `anchor formal artifact preserves ${needle}`));

[
  'anchor-calculation-book-content-v1',
  'anchor-calculation-book-approval-v1',
  'sealAnchorReportHtml',
  'verifyAnchorReportHtmlSeals',
  'anchor-integrity-alert',
].forEach(needle => assertIncludes(anchorReportHtmlSeal, needle, `anchor report producer preserves ${needle}`));

[
  'anchor-calculation-book-content-v1',
  'anchor-calculation-book-approval-v1',
  'verifyAnchorReportHtmlSeals',
].forEach(needle => assertIncludes(anchorHtmlSealVerifier, needle, `anchor independent seal verifier preserves ${needle}`));

[
  '.run-tick.release',
  'function isReleasePreflightRun',
  'item.forcePlatformAudit === true',
  'item.forceSlowChecks === true',
  "/^[0-9a-f]{40}$/i.test(String(item.sourceCommitSha || ''))",
  'item.sourceDirty === false',
  "return '正式放行'",
  "releaseRun ? 'release'",
  "releaseRun ? 'R'",
  '來源 commit 可辨識、啟動時工作樹乾淨',
  'kpiReleaseFreshness',
  'kpiDeploymentAlignment',
  'renderReleaseTrust',
  '7 日內',
  '30 日內',
  '建議重驗',
  '未部署證據',
  '未對齊',
  '已對齊',
  "manifest?.schemaVersion === 3",
].forEach(needle => assertIncludes(dashboard, needle, `dashboard exposes release readiness ${needle}`));

[
  'forcePlatformAudit',
  'forceSlowChecks',
  'release-readiness-contract',
  'maturity globalGovernance release readiness gate exists',
  'maturity latest preflight forcePlatformAudit boolean',
  'maturity latest preflight forceSlowChecks boolean',
  'maturity latest preflight sourceCommitSha git sha',
  'maturity latest preflight sourceDirty boolean',
  'rendered-delivery-evidence',
  'maturity globalGovernance rendered delivery evidence gate exists',
  'independent-engineering-benchmarks',
  'maturity globalGovernance independent engineering benchmark gate exists',
  'maturity independent engineering benchmark pilot verified',
  'maturity independent engineering candidate cases required',
  'maturity independent engineering candidate cases verified',
  'maturity independent engineering passing candidate cases required',
  'maturity independent engineering passing candidate cases verified',
  'maturity independent engineering rejection candidate cases required',
  'maturity independent engineering rejection candidate cases verified',
  'maturity independent engineering candidate capabilities remain distinct',
].forEach(needle => assertIncludes(dashboardContract, needle, `dashboard contract preserves release readiness ${needle}`));

[
  'forcePlatformAudit',
  'forceSlowChecks',
  'sourceCommitSha',
  'sourceDirty',
  'release-readiness-contract',
  '正式放行證據',
  'fixture-release',
  '正式放行',
  'R',
  'rendered-delivery-evidence',
  '實際交付物渲染佐證',
  'fixtureReleaseRunId',
  'deploymentMismatchViewports',
  'kpiDeploymentAlignment',
  'publicRequests.filter(isOutputRequest)',
  'public dashboard hides private output links',
  'public cards expose distinct evidence dimensions',
  'public steel evidence uses tracked readiness counts',
  'public RC evidence uses tracked readiness counts',
  'public cross-family evidence uses tracked readiness counts',
  'string completion count fails closed',
  '未部署證據',
  '未對齊',
  '已對齊',
].forEach(needle => assertIncludes(dashboardBrowserSmoke, needle, `dashboard browser smoke preserves release readiness ${needle}`));

[
  'independent-engineering-benchmarks.catalog.json',
  '37 / 37',
  '/src-beam',
  '/src-column',
  '石材固定',
  '不等同獨立工程驗證',
  'candidate cases 21 / 21',
  '564 項',
  'strength-reject',
].forEach(needle => {
  assertIncludes(readme, needle, `README documents independent engineering benchmark boundary ${needle}`);
  assertIncludes(staging, needle, `STAGING_GROUPS documents independent engineering benchmark boundary ${needle}`);
  assertIncludes(boundaries, needle, `TOOL_BOUNDARIES documents independent engineering benchmark boundary ${needle}`);
});
[
  '獨立工程基準與計算書邊界',
  '不可直接稱為獨立工程驗證',
  '不寫入計算書正文、列印或正式附件',
].forEach(needle => assertIncludes(reportGuide, needle, `TOOL_REPORT_GUIDE documents independent engineering benchmark report boundary ${needle}`));

[
  'run-preflight-tools-release.bat',
  'ForceSlowChecks',
  'ForcePlatformAudit',
  'sourceCommitSha',
  'sourceDirty',
  'release-readiness-contract',
  '結構工具箱/tools/release-readiness.contract.test.js',
  '結構工具箱/tools/rendered-delivery-evidence.js',
  '結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
  '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
].forEach(needle => {
  assertIncludes(readme, needle, `README documents release readiness ${needle}`);
  assertIncludes(staging, needle, `STAGING_GROUPS documents release readiness ${needle}`);
  assertIncludes(boundaries, needle, `TOOL_BOUNDARIES documents release readiness ${needle}`);
});

[
  ['README', readme],
  ['STAGING_GROUPS', staging],
  ['TOOL_BOUNDARIES', boundaries],
  ['TOOL_REPORT_GUIDE', reportGuide],
].forEach(([label, source]) => {
  assertIncludes(source, 'Schema v15', `${label} documents RC source/report package release evidence schema`);
  assertIncludes(source, '32/32', `${label} documents RC source/report package required count`);
  assertIncludes(source, 'Schema v16', `${label} documents RC standalone formal HTML print release evidence schema`);
  assertIncludes(source, '核可 HTML', `${label} documents RC standalone formal HTML print scope`);
  assertIncludes(source, 'Schema v17', `${label} documents RC formal HTML content seal release evidence schema`);
  assertIncludes(source, 'Schema v18', `${label} documents RC formal HTML approval seal release evidence schema`);
  assertIncludes(source, 'Schema v19', `${label} documents formal-tool HTML dual seal release evidence schema`);
  assertIncludes(source, 'Schema v20', `${label} documents steel formal HTML dual seal release evidence schema`);
  assertIncludes(source, 'Schema v21', `${label} documents anchor formal HTML dual seal release evidence schema`);
  assertIncludes(source, 'Schema v22', `${label} documents formal DOCX clean package release evidence schema`);
  assertIncludes(source, '4/4', `${label} documents formal DOCX package required count`);
  assertIncludes(source, '未引用媒體', `${label} documents formal DOCX hidden-package boundary`);
  assertIncludes(source, 'Schema v23', `${label} documents formal XLSX clean package release evidence schema`);
  assertIncludes(source, '1/1', `${label} documents formal XLSX package required count`);
  assertIncludes(source, '外部公式', `${label} documents formal XLSX hidden and external package boundary`);
  assertIncludes(source, 'Schema v24', `${label} documents formal XLSX Office print visual release evidence schema`);
  assertIncludes(source, '9/9', `${label} documents formal XLSX worksheet print visual count`);
  assertIncludes(source, 'Microsoft Excel', `${label} documents formal XLSX Office print renderer`);
  assertIncludes(source, 'Schema v25', `${label} documents formal XLSX dual seal release evidence schema`);
  assertIncludes(source, 'XLSX', `${label} documents formal XLSX dual seal family`);
  assertIncludes(source, 'Schema v27', `${label} documents RC STM supplemental formal attachment release evidence schema`);
  assertIncludes(source, 'Schema v28', `${label} documents four-tool local quick result reconciliation release evidence schema`);
  assertIncludes(source, '4/4', `${label} documents four local quick result reconciliations`);
  assertIncludes(source, 'rc-stm-formal', `${label} documents RC STM release evidence directory`);
  assertIncludes(source, 'rc-stm-atomic-change-set.manifest.json', `${label} documents the RC STM machine-readable atomic change set`);
  assertIncludes(source, 'rc-stm-atomic-change-set-review.js', `${label} documents the RC STM human-readable atomic review`);
  assertIncludes(source, '平面剛架 V1.6', `${label} documents the frame-to-pile-cap STM handoff`);
  assertIncludes(source, '最小／最大配筋', `${label} documents the RC beam reinforcement-to-STM boundary`);
  assertIncludes(source, '3/3', `${label} documents RC STM supplemental formal attachment count`);
  assertIncludes(source, '風力／地震', `${label} documents formal-tool HTML dual seal family`);
  assertIncludes(source, '鋼構', `${label} documents steel formal HTML dual seal family`);
  assertIncludes(source, '錨栓', `${label} documents anchor formal HTML dual seal family`);
  assertIncludes(source, '雙封印', `${label} documents formal-tool HTML dual seal scope`);
  assertIncludes(source, '內容封印', `${label} documents RC formal HTML content seal scope`);
  assertIncludes(source, '數位簽章', `${label} distinguishes content seal from identity signature`);
});

if (failed) {
  console.error(`\n${failed} release readiness checks failed.`);
  process.exit(1);
}

console.log('\nAll release readiness checks passed.');
