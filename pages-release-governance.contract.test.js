const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = __dirname;

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, ...relativePath.split('/')));
}

const staging = readText('STAGING_GROUPS.md');
const toolBoundaries = readText('TOOL_BOUNDARIES.md');
const preflightTools = readText('preflight-tools.ps1');
const context = readText('CONTEXT.md');
const adr = readText('docs/adr/0001-page-only-report-readiness.md');
const pagesWorkflow = readText('.github/workflows/pages-deploy.yml');
const pagesSmoke = readText('結構工具箱/tools/pages-live-smoke.js');
const artifactSmoke = readText('run-pages-artifact-smoke.ps1');
const maturityMatrix = readText('結構工具箱/tools/tool-maturity-matrix.js');
const platformStatus = readJson('結構工具箱/assets/status/platform-status.json');
const preflightStatus = readJson('結構工具箱/assets/status/preflight-summary.json');
const reportReadinessStatus = readJson('結構工具箱/assets/status/report-readiness-status.json');

assert.ok(staging.includes('## 目前狀態'), 'staging guide records current release status');
assert.ok(staging.includes('不是目前待提交清單'), 'staging guide distinguishes release ledger from active worktree queue');
assert.ok(staging.includes('60f3c1803ea28cf3bb8ea057ef128b40f22dbcf4'), 'staging guide records current published head');
assert.ok(staging.includes('4944fa7 Harden page-only report readiness release evidence'), 'staging guide records page-only readiness release commit');
assert.ok(staging.includes('b1a534e Expand report boundary governance across tools'), 'staging guide records cross-family report governance commit');
assert.ok(staging.includes('d530816 Refresh anchor deployment assets'), 'staging guide records anchor deploy asset commit');
assert.ok(staging.includes('60f3c18 Update release status snapshots'), 'staging guide records status snapshot commit');
assert.ok(staging.includes('runId=20260710-053304'), 'staging guide records latest formal release run evidence');
assert.ok(staging.includes('ForcePlatformAudit=true') && staging.includes('ForceSlowChecks=true'), 'staging guide records forced release evidence flags');
assert.ok(staging.includes('workflow run `29052463494`'), 'staging guide records Pages deploy workflow evidence');
assert.ok(staging.includes('page-only boundary `4/4`') && staging.includes('issue `0`'), 'staging guide records page-only boundary health');
assert.ok(staging.includes('不得附入計算書、列印輸出或 PDF'), 'staging guide keeps report readiness page-only boundary');
assert.ok(staging.includes('下次同類變更的分包 playbook'), 'staging guide keeps future staging playbook');
assert.equal(staging.includes('本檔把目前工作樹切成可審查的提交包'), false, 'staging guide must not describe landed work as the current worktree');
assert.equal(staging.includes('適合最先提交。這包只處理'), false, 'staging guide must not present landed A0 as an active first commit');
assert.ok(staging.includes('## A0. 報告閱讀狀態與 Pages release governance'), 'A0 future staging package exists');
assert.ok(staging.includes('下次同類變更低風險可整檔 staging 的檔案'), 'A0 separates low-risk whole-file staging for future changes');
assert.ok(staging.includes('下次同類變更需要人工 hunk review'), 'A0 marks broad docs/contracts for future hunk review');
assert.ok(staging.includes('下次不要混入本包'), 'A0 lists excluded neighboring work for future changes');
assert.ok(staging.includes('anchor/assets/') && staging.includes('改放 B 包'), 'A0 keeps anchor deploy assets out');
assert.ok(staging.includes('run-pages-artifact-smoke.ps1'), 'A0 includes local Pages artifact smoke wrapper');
assert.ok(staging.includes('結構工具箱/assets/status/report-readiness-status.json'), 'A0 includes report readiness snapshot');

assert.ok(toolBoundaries.includes('run-pages-artifact-smoke.ps1'), 'tool boundaries documents local Pages artifact smoke wrapper');
assert.ok(toolBoundaries.includes('pages-release-governance.contract.test.js'), 'tool boundaries documents A0 release governance contract');
assert.ok(toolBoundaries.includes('CONTEXT.md') && toolBoundaries.includes('docs/adr/'), 'tool boundaries keeps page-only docs out of Pages artifact');
assert.ok(toolBoundaries.includes('output/') && toolBoundaries.includes('.claude') && toolBoundaries.includes('node_modules'), 'tool boundaries documents local artifact exclusions');
assert.ok(toolBoundaries.includes('--allow-local-output') && toolBoundaries.includes('不得用在公開站 smoke'), 'tool boundaries limits local-output allowance');

assert.ok(preflightTools.includes('pagesReleaseGovernanceContractCommand'), 'preflight defines A0 governance contract command');
assert.ok(preflightTools.includes('node pages-release-governance.contract.test.js'), 'preflight runs A0 governance contract');
assert.ok(preflightTools.includes('pages-release-governance-contract'), 'preflight records A0 governance contract result');

{
  const orderedTokens = [
    '.\\run-preflight-tools-quick.bat',
    '.\\run-preflight-tools-release.bat',
    '.\\run-pages-artifact-smoke.ps1',
    'git status --short --untracked-files=normal',
  ];
  let previousIndex = -1;
  for (const token of orderedTokens) {
    const nextIndex = toolBoundaries.indexOf(token);
    assert.ok(nextIndex > previousIndex, `tool boundaries check order includes ${token}`);
    previousIndex = nextIndex;
  }
}

assert.ok(exists('CONTEXT.md'), 'context glossary exists');
assert.ok(exists('docs/adr/0001-page-only-report-readiness.md'), 'page-only readiness ADR exists');
assert.ok(context.includes('頁面專用閱讀狀態'), 'context defines page-only readiness');
assert.ok(context.includes('不得') || context.includes('列印與 PDF 匯出時應排除'), 'context keeps export boundary');
assert.ok(adr.includes('page-only') && adr.includes('must not be attached'), 'ADR records page-only delivery decision');

assert.ok(pagesWorkflow.includes("--exclude='output/'"), 'Pages workflow excludes generated output');
assert.ok(pagesWorkflow.includes("--exclude='*.md'"), 'Pages workflow excludes markdown docs');
assert.ok(pagesWorkflow.includes("--exclude='*.ps1'"), 'Pages workflow excludes PowerShell helpers');
assert.ok(pagesWorkflow.includes('pages-live-smoke.js') && pagesWorkflow.includes('--check-private-boundary'), 'Pages workflow runs private-boundary smoke after deploy');

assert.ok(pagesSmoke.includes('assets/status/platform-status.json'), 'Pages smoke checks platform status');
assert.ok(pagesSmoke.includes('assets/status/preflight-summary.json'), 'Pages smoke checks preflight status');
assert.ok(pagesSmoke.includes('assets/status/report-readiness-status.json'), 'Pages smoke checks report readiness status');
assert.ok(pagesSmoke.includes('reportReadinessStatus.runId, preflightStatus.runId'), 'Pages smoke aligns report readiness and preflight runId');
assert.ok(pagesSmoke.includes('reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath'), 'Pages smoke aligns report readiness preflight source');
assert.ok(pagesSmoke.includes('CONTEXT.md'), 'Pages smoke blocks context publication');
assert.ok(pagesSmoke.includes('docs/adr/0001-page-only-report-readiness.md'), 'Pages smoke blocks ADR publication');

assert.ok(artifactSmoke.includes('GetTempPath'), 'local artifact smoke stages in temp');
assert.ok(artifactSmoke.includes('robocopy'), 'local artifact smoke builds a staged site');
assert.ok(artifactSmoke.includes("'output'"), 'local artifact smoke excludes output');
assert.ok(artifactSmoke.includes("'.claude'"), 'local artifact smoke excludes local worktrees');
assert.ok(artifactSmoke.includes("'node_modules'"), 'local artifact smoke excludes node_modules');
assert.ok(artifactSmoke.includes('pages-live-smoke.js'), 'local artifact smoke reuses Pages smoke');
assert.ok(artifactSmoke.includes('--check-private-boundary'), 'local artifact smoke keeps private-boundary check');
assert.equal(artifactSmoke.includes('--allow-local-output'), false, 'local artifact smoke must not allow repo-root output');

assert.ok(maturityMatrix.includes('writeHomepageStatusSnapshots'), 'maturity matrix writes homepage status snapshots');
assert.ok(maturityMatrix.includes('report-readiness-status'), 'maturity matrix writes report readiness snapshot');
assert.ok(maturityMatrix.includes('preflightStatusSourcePath'), 'report readiness snapshot records preflight source');

for (const [label, payload] of Object.entries({ platformStatus, preflightStatus, reportReadinessStatus })) {
  assert.equal(payload.snapshotVersion, 1, `${label} snapshotVersion`);
  assert.equal(payload.pass, true, `${label} pass`);
  assert.equal(payload.failureCount, 0, `${label} failureCount`);
  assert.equal(JSON.stringify(payload).includes('C:\\'), false, `${label} should not expose local Windows paths`);
}
assert.equal(preflightStatus.kind, 'preflight-summary', 'preflight status kind');
assert.equal(preflightStatus.quick, false, 'public preflight snapshot should publish a full/release run');
assert.equal(preflightStatus.forcePlatformAudit, true, 'public preflight snapshot should come from forced platform audit release evidence');
assert.equal(preflightStatus.forceSlowChecks, true, 'public preflight snapshot should come from forced slow-check release evidence');
assert.equal(reportReadinessStatus.kind, 'report-readiness-status', 'report readiness kind');
assert.equal(reportReadinessStatus.badge, '頁面專用', 'report readiness badge');
assert.equal(reportReadinessStatus.runId, preflightStatus.runId, 'report readiness runId matches public preflight');
assert.equal(reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath, 'report readiness source matches public preflight source');
assert.equal(reportReadinessStatus.pageOnlyBoundaryComplete, reportReadinessStatus.pageOnlyBoundaryRequired, 'report readiness page-only boundary complete');
assert.equal(reportReadinessStatus.pageOnlyBoundaryIssueCount, 0, 'report readiness has no page-only boundary issues');

console.log('pages release governance contract OK');
