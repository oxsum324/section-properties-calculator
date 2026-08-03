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
const renderedEvidenceHelper = readText('結構工具箱/tools/rendered-delivery-evidence.js');
const formalBrowserSmoke = readText('結構工具箱/tools/formal-browser-smoke.test.js');
const localQuickBrowserSmoke = readText('結構工具箱/tools/local-quick-browser-smoke.test.js');
const steelBrowserRunner = readText('鋼構工具/steel-audit-browser-runner.js');
const steelResultReconciliationHelper = readText('鋼構工具/steel-result-reconciliation.js');
const rcAudit = readText('鋼筋混凝土/audit-tool.ps1');
const rcResultReconciliationHelper = readText('鋼筋混凝土/tools/report-result-reconciliation.js');
const rcReportVisualSources = [
  'beam', 'column', 'slab', 'wall', 'shear-wall', 'foundation', 'single-pile', 'retrofit',
].map(name => ({ name, source: readText(`鋼筋混凝土/tools/${name}-report-visual.test.js`) }));
const deliveryArtifactsContract = readText('結構工具箱/tools/delivery-artifacts.contract.test.js');
const renderedEvidenceContract = readText('結構工具箱/tools/rendered-delivery-evidence.contract.test.js');
const renderedEvidenceInventory = readText('結構工具箱/tools/rendered-delivery-evidence.inventory.json');
const stoneAutoWordArtifact = readText('石材固定/auto_word_artifact_test.py');
const anchorReportArtifacts = readText('螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts');

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
  'renderAndValidateReportPdf',
  'manifest.tools.map(tool => tool.key)',
  'shared-summary-layout',
  'shared-detailed-layout',
  'writeEvidenceSummary',
  'new home preflight source commit',
  'new home preflight clean source',
  '成品檔案完整性',
  '135 / 135',
].forEach(needle => assertIncludes(localQuickBrowserSmoke, needle, `local quick browser smoke preserves rendered evidence ${needle}`));

[
  'steel-main-plate',
  'steel-beam-formal',
  'steel-column-formal',
  'renderAndValidateReportPdf',
  'writeEvidenceSummary',
].forEach(needle => assertIncludes(steelBrowserRunner, needle, `steel browser runner preserves rendered evidence ${needle}`));

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
  'schemaVersion: 13',
  'canonicalArtifactIntegrity',
  "scope: 'canonical-rendered-pdf-evidence'",
  'required: 60',
  'canonicalIntegrity=',
  'formalResultReconciliation',
  "scope: 'formal-golden-result-to-report-fingerprint'",
  'formalResultReconciliation=',
  'rcResultReconciliation',
  "scope: 'rc-source-replay-to-report-fingerprint'",
  'required: 33',
  'rcResultReconciliation=',
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
  'function isRenderedDeliveryRelease',
  "/^[0-9a-f]{40}$/i.test(String(payload.sourceCommitSha || ''))",
  'payload.sourceDirty === false',
  'function isCompleteRenderedDeliveryEvidence',
  'completeIntegrityDeclared',
  'resultReconciliationDeclared',
  'rcResultReconciliationDeclared',
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
].forEach(needle => assertIncludes(anchorReportArtifacts, needle, `anchor formal artifact preserves ${needle}`));

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

if (failed) {
  console.error(`\n${failed} release readiness checks failed.`);
  process.exit(1);
}

console.log('\nAll release readiness checks passed.');
