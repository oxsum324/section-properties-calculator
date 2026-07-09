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

[
  'preflight-tools.ps1',
  '-Quiet',
  '-ForceSlowChecks',
  '-ForcePlatformAudit',
  '%*',
].forEach(needle => assertIncludes(releaseWrapper, needle, `release wrapper keeps ${needle}`));
assert(!releaseWrapper.includes('-Quick'), 'release wrapper does not run quick mode', 'run-preflight-tools-release.bat');

[
  '[switch]$ForcePlatformAudit',
  '[switch]$ForceSlowChecks',
  'forcePlatformAudit = [bool]$ForcePlatformAudit',
  'forceSlowChecks = [bool]$ForceSlowChecks',
  '$ForceSlowChecks -or $ForcePlatformAudit',
  'release startup existing node cleanup',
  'release slow checks startup',
  'slowReuseCount = $runSlowReuseKeys.Count',
  'slowReuseKeys = @($runSlowReuseKeys.ToArray())',
  'platformAuditReused = $runPlatformAuditReused',
  'Path = \'run-preflight-tools-release.bat\'',
  'Needles = @(\'preflight-tools.ps1\', \'-Quiet\', \'-ForceSlowChecks\', \'-ForcePlatformAudit\', \'%*\')',
  'release-readiness-contract',
  'node 結構工具箱/tools/release-readiness.contract.test.js',
  'Release readiness governance contract',
].forEach(needle => assertIncludes(preflight, needle, `preflight preserves release readiness ${needle}`));

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
].forEach(needle => assertIncludes(dashboardContract, needle, `dashboard contract preserves release readiness ${needle}`));

[
  'forcePlatformAudit',
  'forceSlowChecks',
  'release-readiness-contract',
  '正式放行證據',
  'fixture-release',
  '正式放行',
  'R',
].forEach(needle => assertIncludes(dashboardBrowserSmoke, needle, `dashboard browser smoke preserves release readiness ${needle}`));

[
  'run-preflight-tools-release.bat',
  'ForceSlowChecks',
  'ForcePlatformAudit',
  'release-readiness-contract',
  '結構工具箱/tools/release-readiness.contract.test.js',
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
