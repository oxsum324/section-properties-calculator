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
const rcAudit = readText('鋼筋混凝土/audit-tool.ps1');
const deliveryArtifactsContract = readText('結構工具箱/tools/delivery-artifacts.contract.test.js');
const renderedEvidenceContract = readText('結構工具箱/tools/rendered-delivery-evidence.contract.test.js');
const renderedEvidenceInventory = readText('結構工具箱/tools/rendered-delivery-evidence.inventory.json');

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
  'writeEvidenceSummary',
].forEach(needle => assertIncludes(renderedEvidenceHelper, needle, `rendered delivery helper preserves ${needle}`));

[
  'renderAndValidateReportPdf',
  'formalTools.map(tool => tool.key)',
  'shared-summary-layout',
  'shared-detailed-layout',
  'writeEvidenceSummary',
].forEach(needle => assertIncludes(formalBrowserSmoke, needle, `formal browser smoke preserves rendered evidence ${needle}`));

[
  'renderAndValidateReportPdf',
  'manifest.tools.map(tool => tool.key)',
  'shared-summary-layout',
  'shared-detailed-layout',
  'writeEvidenceSummary',
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
  "family === 'office-artifacts'",
  'release rendered evidence resolves every homepage formal tool',
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
  'typeof payload.latestPreflight.forcePlatformAudit',
  'typeof payload.latestPreflight.forceSlowChecks',
  'tool maturity matrix release readiness gate passed',
  'rendered-delivery-evidence',
  '實際交付物渲染佐證',
  'tool maturity matrix rendered delivery evidence gate passed',
  'function isRenderedDeliveryRelease',
  'function resolveRenderedDeliveryEvidenceSource',
  'renderedDeliveryEvidenceRequired',
  'renderedDeliveryEvidenceSourceHash',
].forEach(needle => assertIncludes(maturityMatrix, needle, `maturity matrix preserves release readiness ${needle}`));

[
  '.run-tick.release',
  'function isReleasePreflightRun',
  'item.forcePlatformAudit === true && item.forceSlowChecks === true',
  "return '正式放行'",
  "releaseRun ? 'release'",
  "releaseRun ? 'R'",
  '已強制平台巡檢與慢測，可作為正式放行證據。',
].forEach(needle => assertIncludes(dashboard, needle, `dashboard exposes release readiness ${needle}`));

[
  'forcePlatformAudit',
  'forceSlowChecks',
  'release-readiness-contract',
  'maturity globalGovernance release readiness gate exists',
  'maturity latest preflight forcePlatformAudit boolean',
  'maturity latest preflight forceSlowChecks boolean',
  'rendered-delivery-evidence',
  'maturity globalGovernance rendered delivery evidence gate exists',
].forEach(needle => assertIncludes(dashboardContract, needle, `dashboard contract preserves release readiness ${needle}`));

[
  'forcePlatformAudit',
  'forceSlowChecks',
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
