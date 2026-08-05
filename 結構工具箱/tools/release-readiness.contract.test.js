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
const maturityMatrix = readText('結構工具箱/tools/tool-maturity-matrix.js');
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
const rcSharedReport = readText('鋼筋混凝土/shared/report.js');
const formalSharedReport = readText('結構工具箱/core/ui/report.js');
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
const stoneAutoWordArtifact = readText('石材固定/auto_word_artifact_test.py');
const anchorReportArtifacts = readText('螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts');
const anchorReportHtmlSeal = readText('螺栓檢討/bolt-review-tool/src/reportHtmlSeal.ts');
const anchorHtmlSealVerifier = readText('結構工具箱/tools/anchor-html-seal-verifier.js');

[
  'htmlDualSealEvidence',
  'htmlDualSealExpected',
  'htmlDualSealVerified',
  '只顯示完成數，不輸出封印值',
].forEach(needle => assertIncludes(attachmentPackageVerifier, needle, `attachment verifier preserves private dual seal evidence ${needle}`));
[
  'dualSealSummaryLine',
  'htmlDualSealExpected',
  'htmlDualSealVerified',
  "anchor: '錨栓'",
  '雙封印',
].forEach(needle => assertIncludes(attachmentPackageManagerWorker, needle, `attachment manager exposes dual seal verification ${needle}`));
[
  ['README', readme],
  ['STAGING_GROUPS', staging],
  ['TOOL_BOUNDARIES', boundaries],
].forEach(([label, source]) => {
  assertIncludes(source, 'HTML 雙封印', `${label} documents daily package dual seal evidence`);
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
  'Independent engineering benchmark pilot',
].forEach(needle => assertIncludes(preflight, needle, `preflight preserves release readiness ${needle}`));

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
  'formal-calculation-book-approval-v1',
  'verifyReportContentSeal',
  'verifyReportApprovalSeal',
  '內容完整性異常',
  '核可完整性異常',
].forEach(needle => assertIncludes(formalSharedReport, needle, `formal shared report preserves HTML dual seal ${needle}`));
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
  '139 / 139',
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
[
  'rc-calculation-book-content-v1',
  'sha256Fallback',
  'verifyReportContentSeal',
  '內容完整性異常',
  '非數位簽章',
].forEach(needle => assertIncludes(rcSharedReport, needle, `RC shared report preserves HTML content seal ${needle}`));
[
  'rc-calculation-book-approval-v1',
  'verifyReportApprovalSeal',
  '核可完整性異常',
].forEach(needle => assertIncludes(rcSharedReport, needle, `RC shared report preserves HTML approval seal ${needle}`));
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
  'inventory.tools.length, 31',
  "process.env.PREFLIGHT_RELEASE === '1'",
  "['formal-tools', 'local-quick-tools', 'steel-formal']",
  "family === 'rc-formal'",
  "family === 'rc-retrofit'",
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
  'schemaVersion: 21',
  'canonicalArtifactIntegrity',
  "scope: 'canonical-rendered-pdf-evidence'",
  'required: 60',
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
assert(JSON.parse(renderedEvidenceInventory).tools.length === 31, 'rendered evidence inventory has 31 formal tools', 'rendered-delivery-evidence.inventory.json');

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
  '獨立工程基準試辦',
  'tool maturity matrix independent engineering benchmark gate passed',
  '## Independent Engineering Benchmarks',
  'function isRenderedDeliveryRelease',
  "/^[0-9a-f]{40}$/i.test(String(payload.sourceCommitSha || ''))",
  'payload.sourceDirty === false',
  'function isCompleteRenderedDeliveryEvidence',
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
  'steelResultReconciliationDeclared',
  'stoneResultReconciliationDeclared',
  'anchorResultReconciliationDeclared',
  'deckingResultReconciliationDeclared',
  'excavationResultReconciliationDeclared',
  'localQuickResultReconciliationDeclared',
  "evidence.canonicalArtifactIntegrity?.scope === 'canonical-rendered-pdf-evidence'",
  'evidence.canonicalArtifactIntegrity.required === 60',
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
  'evidence.localQuickResultReconciliation.required === 3',
  'function resolveRenderedDeliveryEvidenceSource',
  'function resolveHomepagePreflightSource',
  'latestSummary && latestSummary.quick === false && latestSummary.pass === true',
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
  'formalHtmlContentSealRequired',
  'formalHtmlApprovalSealRequired',
  '風力／地震正式 HTML 雙封印',
  'steelHtmlContentSealRequired',
  'steelHtmlApprovalSealRequired',
  '鋼構正式 HTML 雙封印',
  'anchorHtmlContentSealRequired',
  'anchorHtmlApprovalSealRequired',
  '錨栓正式 HTML 雙封印',
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
].forEach(needle => assertIncludes(dashboardBrowserSmoke, needle, `dashboard browser smoke preserves release readiness ${needle}`));

[
  'independent-engineering-benchmarks.catalog.json',
  '14 / 14',
  '14 / 31',
  '不等同獨立工程驗證',
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
