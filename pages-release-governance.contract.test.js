const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PagesLiveSmoke = require('./結構工具箱/tools/pages-live-smoke.js');

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
const readme = readText('README.md');
const preflightTools = readText('preflight-tools.ps1');
const context = readText('CONTEXT.md');
const adr = readText('docs/adr/0001-page-only-report-readiness.md');
const pagesWorkflow = readText('.github/workflows/pages-deploy.yml');
const pagesSmokeRuntime = readJson('.github/pages-smoke/package.json');
const pagesSmokeLock = readJson('.github/pages-smoke/package-lock.json');
const pagesPerformanceBudget = readJson('.github/pages-smoke/performance-budget.json');
const pagesCiSummary = require('./.github/pages-smoke/write-ci-summary.js');
const pagesCiPerformanceTrend = require('./.github/pages-smoke/build-performance-trend.js');
const pagesSmoke = readText('結構工具箱/tools/pages-live-smoke.js');
const pagesBrowserSmoke = readText('結構工具箱/tools/pages-live-browser-smoke.js');
const pagesBrowserRunner = readText('結構工具箱/tools/run-pages-browser-smoke.sh');
const artifactBuilderPath = path.join(repoRoot, '結構工具箱', 'tools', 'build-pages-artifact.js');
const artifactBuilder = readText('結構工具箱/tools/build-pages-artifact.js');
const deploymentManifestBuilderPath = path.join(repoRoot, '結構工具箱', 'tools', 'build-pages-deployment-manifest.js');
const deploymentManifestBuilder = readText('結構工具箱/tools/build-pages-deployment-manifest.js');
const releaseLineageVerifierPath = path.join(repoRoot, '結構工具箱', 'tools', 'verify-pages-release-lineage.js');
const releaseLineageVerifier = readText('結構工具箱/tools/verify-pages-release-lineage.js');
const artifactSmoke = readText('run-pages-artifact-smoke.ps1');
const pushPagesRelease = readText('push-pages-release.ps1');
const pushPagesReleaseBatch = readText('push-pages-release.bat');
const maturityMatrix = readText('結構工具箱/tools/tool-maturity-matrix.js');
const platformStatus = readJson('結構工具箱/assets/status/platform-status.json');
const preflightStatus = readJson('結構工具箱/assets/status/preflight-summary.json');
const reportReadinessStatus = readJson('結構工具箱/assets/status/report-readiness-status.json');

assert.ok(staging.includes('## 目前狀態'), 'staging guide records current release status');
assert.ok(staging.includes('不是目前待提交清單'), 'staging guide distinguishes release ledger from active worktree queue');
assert.ok(staging.includes('最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準'), 'staging guide avoids self-staling latest HEAD');
assert.ok(staging.includes('本文件不硬編碼自我引用的最新 commit hash'), 'staging guide documents why latest HEAD is not hard-coded');
assert.ok(staging.includes('狀態快照證據基準：以 tracked `結構工具箱/assets/status/preflight-summary.json` 與 `report-readiness-status.json`'), 'staging guide names tracked status snapshots as evidence source');
assert.ok(staging.includes('承載提交由 `git log -1 --oneline` 查詢，不在本 ledger 重複硬編碼'), 'staging guide avoids duplicated status commit ids');
assert.equal(/HEAD\s+`[0-9a-f]{7,40}`/.test(staging), false, 'staging guide must not hard-code a self-staling current HEAD');
assert.ok(staging.includes('4944fa7 Harden page-only report readiness release evidence'), 'staging guide records page-only readiness release commit');
assert.ok(staging.includes('b1a534e Expand report boundary governance across tools'), 'staging guide records cross-family report governance commit');
assert.ok(staging.includes('d530816 Refresh anchor deployment assets'), 'staging guide records anchor deploy asset commit');
assert.ok(staging.includes('60f3c18 Update release status snapshots'), 'staging guide records status snapshot commit');
assert.ok(staging.includes('2029758 Enforce formal attachment boundaries and rendered release evidence'), 'staging guide records rendered release evidence commit');
assert.ok(staging.includes('當前 `runId` 直接讀取 JSON，不在本 ledger 複製'), 'staging guide reads current release runId from tracked JSON');
assert.ok(staging.includes('ForcePlatformAudit=true') && staging.includes('ForceSlowChecks=true'), 'staging guide records forced release evidence flags');
assert.ok(staging.includes('gh run list --workflow "Pages deploy" --limit 1'), 'staging guide queries the current Pages deploy evidence');
assert.ok(staging.includes('workflow run ID 不在本 ledger 硬編碼'), 'staging guide avoids self-staling Pages run ids');
assert.ok(staging.includes('最新 `Pages deploy` 必須為 completed/success'), 'staging guide requires current Pages deploy success');
assert.ok(staging.includes('page-only boundary `4/4`') && staging.includes('issue `0`'), 'staging guide records page-only boundary health');
assert.ok(staging.includes('首頁正式工具實際交付物渲染 `31/31`'), 'staging guide records homepage rendered delivery evidence health');
assert.ok(staging.includes('補充報告 / 服務成品 `2/2`'), 'staging guide records supplemental report and service delivery evidence health');
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
assert.ok(toolBoundaries.includes('push-pages-release.ps1') && toolBoundaries.includes('push-pages-release.bat'), 'tool boundaries documents safe Pages push and verification entrypoints');
assert.ok(toolBoundaries.includes('pages-release-governance.contract.test.js'), 'tool boundaries documents A0 release governance contract');
assert.ok(toolBoundaries.includes('CONTEXT.md') && toolBoundaries.includes('docs/adr/'), 'tool boundaries keeps page-only docs out of Pages artifact');
assert.ok(toolBoundaries.includes('output/') && toolBoundaries.includes('.claude') && toolBoundaries.includes('node_modules'), 'tool boundaries documents local artifact exclusions');
assert.ok(toolBoundaries.includes('--allow-local-output') && toolBoundaries.includes('不得用在公開站 smoke'), 'tool boundaries limits local-output allowance');
assert.ok(readme.includes('v3 manifest') && readme.includes('正式 release runId') && readme.includes('逐檔下載整個公開 artifact'), 'README documents release-bound complete deployed artifact verification');
assert.ok(readme.includes('一般巡檢新鮮度與正式放行證據拆開') && readme.includes('未對齊'), 'README documents release freshness and deployment alignment semantics');
assert.ok(toolBoundaries.includes('封閉 v2 清冊') && toolBoundaries.includes('核對 HTTP 200、位元組數及 SHA-256'), 'tool boundaries documents closed file inventory verification');
assert.ok(staging.includes('v2 `pages-deployment.json`') && staging.includes('最多 8 個並行請求逐檔下載整個公開 artifact'), 'staging guide keeps complete artifact verification in the release package');
assert.ok(toolBoundaries.includes('Pages deployment manifest 現採 schema v3') && toolBoundaries.includes('未部署證據') && toolBoundaries.includes('未對齊'), 'tool boundaries documents release-bound deployment trust');
assert.ok(staging.includes('schema v3 延續並增列 `releaseEvidence`') && staging.includes('7 日／30 日只作重驗提醒'), 'staging guide keeps release freshness and alignment changes together');

assert.ok(preflightTools.includes('pagesReleaseGovernanceContractCommand'), 'preflight defines A0 governance contract command');
assert.ok(preflightTools.includes('node .github/pages-smoke/build-performance-trend.test.js'), 'preflight runs the closed performance trend contract');
assert.ok(preflightTools.includes('node pages-release-governance.contract.test.js'), 'preflight runs A0 governance contract');
assert.ok(preflightTools.includes('pages-release-governance-contract'), 'preflight records A0 governance contract result');

assert.ok(exists('push-pages-release.ps1') && exists('push-pages-release.bat'), 'safe Pages push and verification entrypoints exist');
assert.ok(pushPagesRelease.includes("'status', '--porcelain', '--untracked-files=all'"), 'Pages push wrapper rejects dirty tracked and untracked worktrees');
assert.ok(pushPagesRelease.includes('System.Text.UTF8Encoding') && pushPagesRelease.includes('[Console]::OutputEncoding = $script:NativeUtf8Encoding') && pushPagesRelease.includes('$OutputEncoding = $script:NativeUtf8Encoding'), 'Pages push wrapper pins native GitHub JSON decoding to UTF-8 for redirected Windows PowerShell runs');
assert.ok(pushPagesRelease.includes("$ErrorActionPreference = 'Continue'") && pushPagesRelease.includes('$exitCode = $LASTEXITCODE'), 'Pages push wrapper lets native exit codes decide success instead of treating Git progress on stderr as failure');
assert.ok(pushPagesRelease.includes("'fetch', '--prune', $Remote, $Branch") && pushPagesRelease.includes("'rev-list', '--left-right', '--count'"), 'Pages push wrapper checks remote divergence before push');
assert.ok(pushPagesRelease.includes("'push', $Remote") && !pushPagesRelease.includes('--force'), 'Pages push wrapper performs a non-force push');
assert.ok(pushPagesRelease.includes('Wait-PushRun') && pushPagesRelease.includes('Dispatch-WorkflowRun'), 'Pages push wrapper waits for the push workflow before fallback dispatch');
assert.ok(pushPagesRelease.includes('Test-QueuedPagesDeploymentTimeout') && pushPagesRelease.includes('Timeout reached, aborting!') && pushPagesRelease.includes('Canceling Pages deployment'), 'Pages push wrapper narrowly identifies the deploy-pages queued timeout');
assert.ok(pushPagesRelease.includes('Wait-PagesDeploymentRecovery') && pushPagesRelease.includes('pages/deployments/$HeadSha') && pushPagesRelease.includes("$status -eq 'succeed'"), 'Pages push wrapper waits for backend completion after the action timeout');
assert.ok(pushPagesRelease.includes("'run', 'rerun', ([string]$RunId), '--failed'") && pushPagesRelease.includes('Wait-RerunAttempt'), 'Pages push wrapper reruns only failed jobs after backend completion');
assert.ok(pushPagesRelease.includes('deploymentRecoveryUsed = [bool]$script:DeploymentRecoveryUsed'), 'Pages push wrapper reports queued-deployment recovery evidence');
assert.ok(pushPagesRelease.indexOf('Wait-PushRun -HeadSha $headSha') < pushPagesRelease.indexOf('Dispatch-WorkflowRun -HeadSha $headSha'), 'fallback dispatch is ordered after the bounded push-run wait');
assert.ok(pushPagesRelease.includes("$expectedNames = @('build', 'deploy', 'live-smoke', 'performance-trend')"), 'Pages push wrapper requires deployment and private performance trend jobs');
assert.ok(pushPagesRelease.includes('$failedJobs') && pushPagesRelease.includes('has failed jobs'), 'Pages push wrapper fails closed on a failed job instead of dispatching over it');
assert.ok(pushPagesRelease.includes('TopLevelStale') && pushPagesRelease.includes('AllExpectedSuccessful'), 'Pages push wrapper distinguishes stale aggregate status from successful required jobs');
assert.ok(pushPagesRelease.includes('JobStatusStale') && pushPagesRelease.includes('allStepsSuccessful') && pushPagesRelease.includes("$run.conclusion -eq 'success'"), 'Pages push wrapper accepts a stale job aggregate only when the successful run and every job step agree');
assert.ok(pushPagesRelease.includes('$failedSteps') && pushPagesRelease.includes('has failed steps'), 'Pages push wrapper fails closed on any failed job step');
assert.ok(pushPagesRelease.includes('pages-deployment.json?release_check=') && pushPagesRelease.includes('Test-ManifestIdentity'), 'Pages push wrapper verifies a cache-busted public deployment manifest');
assert.ok(pushPagesRelease.includes('commitSha') && pushPagesRelease.includes('runId') && pushPagesRelease.includes('sourceDirty'), 'Pages push wrapper binds the manifest to commit, run, and clean source provenance');
assert.ok(pushPagesRelease.includes("Resolve-RepoToolScript -LeafName 'pages-live-smoke.js'") && pushPagesRelease.includes('Independently verifying every public artifact file'), 'Pages push wrapper independently resolves and reruns the public HTTP artifact verifier');
assert.ok(pushPagesRelease.includes('[int]$PublicSmokeAttempts = 3') && pushPagesRelease.includes('[int]$PublicSmokeRetryDelaySeconds = 10'), 'Pages push wrapper gives workstation artifact verification a bounded transient retry policy');
assert.ok(pushPagesRelease.includes("$attemptsVariable = 'PAGES_HTTP_SMOKE_ATTEMPTS'") && pushPagesRelease.includes("$delayVariable = 'PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS'"), 'Pages push wrapper delegates retry eligibility to the governed HTTP smoke');
assert.ok(pushPagesRelease.includes('function Invoke-PublicArtifactVerification') && pushPagesRelease.includes('finally {') && pushPagesRelease.includes("SetEnvironmentVariable($attemptsVariable, $previousAttempts, 'Process')"), 'Pages push wrapper restores process retry settings after verification');
assert.ok(pushPagesRelease.includes("'(?m)^pagesHttpSmokeAttemptCount=(\\d+)\\s*$'") && pushPagesRelease.includes('$attemptMatches.Count -ne 1') && pushPagesRelease.includes('$attemptCount -gt $PublicSmokeAttempts'), 'Pages push wrapper fail-closes on missing, duplicate, or out-of-range attempt evidence');
assert.ok(pushPagesRelease.includes("'--check-private-boundary'") && pushPagesRelease.includes("'--expected-commit-sha'") && pushPagesRelease.includes("'--expected-run-id'") && pushPagesRelease.includes("'--expect-clean-source'"), 'Pages push wrapper preserves full public provenance and boundary arguments');
assert.ok(pushPagesRelease.indexOf('$manifest = Wait-PublicManifest') < pushPagesRelease.indexOf('Independently verifying every public artifact file'), 'workstation artifact verification runs after the matching public manifest is visible');
assert.ok(pushPagesRelease.includes('publicArtifactVerified = $true') && pushPagesRelease.includes('schemaVersion = $manifest.schemaVersion') && pushPagesRelease.includes('fileCount = $manifest.fileCount') && pushPagesRelease.includes('totalBytes = $manifest.totalBytes'), 'Pages push wrapper reports independently verified artifact evidence');
assert.ok(pushPagesRelease.includes('publicArtifactVerificationMaxAttempts = $PublicSmokeAttempts') && pushPagesRelease.includes('publicArtifactVerificationRetryDelaySeconds = $PublicSmokeRetryDelaySeconds'), 'Pages push wrapper reports its bounded workstation retry policy');
assert.ok(pushPagesRelease.includes('publicArtifactVerificationAttemptCount = $publicArtifactVerificationAttemptCount') && pushPagesRelease.includes('publicArtifactVerificationRetried = $publicArtifactVerificationAttemptCount -gt 1'), 'Pages push wrapper reports actual workstation verification attempts');
assert.ok(pushPagesRelease.includes('verify-pages-release-lineage.js') && pushPagesRelease.includes('Verifying that HEAD only carries status snapshots'), 'Pages push wrapper blocks untested carrier changes before push');
assert.equal(/[^\x00-\x7F]/.test(pushPagesRelease), false, 'Pages push wrapper avoids source-encoding-sensitive path literals under Windows PowerShell 5.1');
assert.ok(pushPagesRelease.includes('AllowDirtyVerification is only valid with VerifyOnly and can never authorize a push or dispatch.'), 'dirty verification mode cannot authorize mutation');
assert.ok(pushPagesReleaseBatch.includes('push-pages-release.ps1') && pushPagesReleaseBatch.includes('%*'), 'Pages release batch forwards explicit operator options to the safe PowerShell entrypoint');
assert.ok(pushPagesReleaseBatch.includes('where pwsh') && pushPagesReleaseBatch.includes('pwsh -NoProfile'), 'Pages release batch prefers PowerShell 7 when available');
assert.ok(pushPagesReleaseBatch.includes('powershell -NoProfile'), 'Pages release batch retains a Windows PowerShell 5.1 fallback');
assert.ok(readme.includes('publicArtifactVerified=true') && readme.includes('工作站事後複驗'), 'README documents workstation artifact verification as a completion condition');
assert.ok(readme.includes('pagesHttpSmokeAttemptCount') && readme.includes('publicArtifactVerificationAttemptCount') && readme.includes('publicArtifactVerificationRetried'), 'README documents actual workstation verification attempt evidence');
assert.ok(toolBoundaries.includes('工作站再次呼叫 `pages-live-smoke.js`') && toolBoundaries.includes('全部公開檔案大小／SHA-256'), 'tool boundaries documents the independent workstation verifier');
assert.ok(staging.includes('一般推送、既有同 SHA 部署及 `-VerifyOnly`') && staging.includes('預設最多進行 3 次') && staging.includes('非暫態錯誤立即失敗') && staging.includes('暫態重試用盡後也維持失敗'), 'staging guide keeps bounded transient retries fail-closed');
assert.ok(staging.includes('pagesHttpSmokeAttemptCount') && staging.includes('不超過 `PublicSmokeAttempts`') && staging.includes('缺少、重複或超界'), 'staging guide requires valid actual attempt evidence');

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
assert.ok(
  adr.includes('page diagnostics') && adr.includes('must not be copied into calculation books') && adr.includes('文件狀態：內部審閱') && adr.includes('文件狀態：正式附件'),
  'ADR records page-only diagnostics and governed document-state delivery decision',
);

{
  const fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-artifact-builder-repo-'));
  const fixtureSite = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-artifact-builder-site-'));
  try {
    childProcess.execFileSync('git', ['init', '--quiet', fixtureRepo]);
    childProcess.execFileSync('git', ['-C', fixtureRepo, 'config', 'core.autocrlf', 'true']);
    fs.writeFileSync(path.join(fixtureRepo, '.gitignore'), 'ignored.html\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'keep.html'), '<p>tracked</p>\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'deleted.html'), '<p>delete</p>\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'README.md'), '# private\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'secret.test.js'), 'throw new Error("private");\n', 'utf8');
    fs.mkdirSync(path.join(fixtureRepo, 'dev_tools'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRepo, 'dev_tools', 'secret.html'), '<p>private</p>\n', 'utf8');
    const privateGsp = path.join(fixtureRepo, '案件', 'GSP-外部歸檔生命週期總覽-GSP-00000000000000000000', 'overview.html');
    fs.mkdirSync(path.dirname(privateGsp), { recursive: true });
    fs.writeFileSync(privateGsp, '<p>private GSP</p>\n', 'utf8');
    const privateGsmLatest = path.join(fixtureRepo, '案件', 'GSM-外部歸檔生命週期監測-latest.json');
    fs.writeFileSync(privateGsmLatest, '{"private":"GSM latest"}\n', 'utf8');
    const privateGsmEvent = path.join(fixtureRepo, '案件', 'events', 'GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json');
    fs.mkdirSync(path.dirname(privateGsmEvent), { recursive: true });
    fs.writeFileSync(privateGsmEvent, '{"private":"GSM event"}\n', 'utf8');
    const privateDashboardSchema = path.join(fixtureRepo, '案件', 'GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json');
    fs.writeFileSync(privateDashboardSchema, '{"private":"dashboard schema"}\n', 'utf8');
    const privateDashboardOutput = path.join(fixtureRepo, 'output', 'audit');
    fs.mkdirSync(privateDashboardOutput, { recursive: true });
    for (const filename of ['gsm-lifecycle-monitor-status.json', 'gsm-lifecycle-monitor-history.json', 'gsm-lifecycle-monitor-task-status.json']) {
      fs.writeFileSync(path.join(privateDashboardOutput, filename), '{"private":"local dashboard state"}\n', 'utf8');
    }
    const privateBuilder = path.join(fixtureRepo, '結構工具箱', 'tools', 'build-pages-artifact.js');
    fs.mkdirSync(path.dirname(privateBuilder), { recursive: true });
    fs.writeFileSync(privateBuilder, 'module.exports = {};\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'ignored.html'), '<p>ignored</p>\n', 'utf8');
    childProcess.execFileSync('git', ['-C', fixtureRepo, 'add', '-A']);

    fs.writeFileSync(path.join(fixtureRepo, 'keep.html'), '<p>working change</p>\r\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'new-page.html'), '<p>new page</p>\r\n', 'utf8');
    fs.rmSync(path.join(fixtureRepo, 'deleted.html'));

    const { stagePagesArtifact } = require(artifactBuilderPath);
    const result = stagePagesArtifact({ repoRoot: fixtureRepo, siteRoot: fixtureSite });
    assert.equal(result.publishedCount, 2, 'artifact builder stages tracked changes and non-ignored new published files only');
    assert.equal(result.missingCount, 1, 'artifact builder omits tracked working-tree deletions');
    assert.equal(fs.readFileSync(path.join(fixtureSite, 'keep.html'), 'utf8'), '<p>working change</p>\n', 'artifact builder applies Git clean filters to tracked changes');
    assert.equal(fs.readFileSync(path.join(fixtureSite, 'new-page.html'), 'utf8'), '<p>new page</p>\n', 'artifact builder applies Git clean filters to new published files');
    for (const privatePath of ['README.md', 'secret.test.js', 'dev_tools/secret.html', '案件/GSP-外部歸檔生命週期總覽-GSP-00000000000000000000/overview.html', '案件/GSM-外部歸檔生命週期監測-latest.json', '案件/events/GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json', '案件/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json', 'output/audit/gsm-lifecycle-monitor-status.json', 'output/audit/gsm-lifecycle-monitor-history.json', 'output/audit/gsm-lifecycle-monitor-task-status.json', '結構工具箱/tools/build-pages-artifact.js', 'ignored.html', 'deleted.html']) {
      assert.equal(fs.existsSync(path.join(fixtureSite, ...privatePath.split('/'))), false, `artifact builder excludes ${privatePath}`);
    }
  } finally {
    fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(fixtureSite, { recursive: true, force: true });
  }
}

function createReleaseLineageFixture({ extraCarrierChange = false, sourceDirty = false } = {}) {
  const fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-release-lineage-'));
  const git = (...args) => childProcess.execFileSync('git', ['-C', fixtureRepo, ...args], { encoding: 'utf8' }).trim();
  childProcess.execFileSync('git', ['init', '--quiet', fixtureRepo]);
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('symbolic-ref', 'HEAD', 'refs/heads/master');
  fs.writeFileSync(path.join(fixtureRepo, 'index.html'), '<p>tested source</p>\n', 'utf8');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'tested source');
  const sourceCommitSha = git('rev-parse', 'HEAD').toLowerCase();

  for (const relativePath of ['platform-status.json', 'preflight-summary.json', 'report-readiness-status.json']) {
    const fullPath = path.join(fixtureRepo, '結構工具箱', 'assets', 'status', relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const payload = relativePath === 'preflight-summary.json'
      ? {
          runId: 'fixture-release',
          quick: false,
          forcePlatformAudit: true,
          forceSlowChecks: true,
          sourceCommitSha,
          sourceBranch: 'master',
          sourceDirty,
          pass: true,
          slowReuseCount: 0,
          platformAuditReused: false,
          recordsCount: 2,
          passedCount: 2,
          postCheckCount: 1,
          postChecksPassedCount: 1,
        }
      : { runId: 'fixture-release', pass: true };
    fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  if (extraCarrierChange) fs.writeFileSync(path.join(fixtureRepo, 'index.html'), '<p>untested carrier change</p>\n', 'utf8');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'release snapshots');
  return { fixtureRepo, sourceCommitSha, headSha: git('rev-parse', 'HEAD').toLowerCase() };
}

{
  const fixture = createReleaseLineageFixture();
  try {
    const { STATUS_PATHS, verifyPagesReleaseLineage } = require(releaseLineageVerifierPath);
    const result = verifyPagesReleaseLineage({ repoRoot: fixture.fixtureRepo, headSha: fixture.headSha, expectedBranch: 'master' });
    assert.equal(result.sourceCommitSha, fixture.sourceCommitSha, 'release lineage binds the carrier to the tested commit');
    assert.deepEqual(result.changedPaths, STATUS_PATHS, 'release lineage accepts exactly the three status snapshots');
  } finally {
    fs.rmSync(fixture.fixtureRepo, { recursive: true, force: true });
  }
}

{
  const fixture = createReleaseLineageFixture({ extraCarrierChange: true });
  try {
    const { verifyPagesReleaseLineage } = require(releaseLineageVerifierPath);
    assert.throws(
      () => verifyPagesReleaseLineage({ repoRoot: fixture.fixtureRepo, headSha: fixture.headSha, expectedBranch: 'master' }),
      /changes only the three public status snapshots/,
      'release lineage rejects untested carrier content',
    );
  } finally {
    fs.rmSync(fixture.fixtureRepo, { recursive: true, force: true });
  }
}

{
  const fixture = createReleaseLineageFixture({ sourceDirty: true });
  try {
    const { verifyPagesReleaseLineage } = require(releaseLineageVerifierPath);
    assert.throws(
      () => verifyPagesReleaseLineage({ repoRoot: fixture.fixtureRepo, headSha: fixture.headSha, expectedBranch: 'master' }),
      /clean tested worktree/,
      'release lineage rejects dirty tested sources',
    );
  } finally {
    fs.rmSync(fixture.fixtureRepo, { recursive: true, force: true });
  }
}

{
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-deployment-manifest-contract-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, '結構工具箱', 'assets', 'status'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'index.html'), '<!doctype html><title>fixture</title>', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'assets', 'app.js'), 'console.log("fixture");', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, '結構工具箱', 'assets', 'status', 'platform-status.json'), JSON.stringify({
      publicEvidenceSchemaVersion: 3,
      snapshotVersion: 1,
      kind: 'platform-status',
      generatedAt: '2026-07-19 00:00:00',
      runId: '20260719-000000',
      pass: true,
      failureCount: 0,
      modules: ['steel', 'rc', 'core'],
      sourcePath: 'output/audit/platform-status.json',
      sourceHash: 'a'.repeat(64),
    }), 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, '結構工具箱', 'assets', 'status', 'preflight-summary.json'), JSON.stringify({
      publicEvidenceSchemaVersion: 3,
      snapshotVersion: 1,
      kind: 'preflight-summary',
      generatedAt: '2026-07-19 00:00:00',
      runId: '20260719-000000',
      quick: false,
      forcePlatformAudit: true,
      forceSlowChecks: true,
      sourceDirty: false,
      pass: true,
      failureCount: 0,
      failedKeys: [],
      recordsCount: 82,
      passedCount: 82,
      postCheckCount: 3,
      postChecksPassedCount: 3,
      postCheckFailures: [],
      sourceCommitSha: 'c'.repeat(40),
      sourcePath: 'output/preflight/history/20260719-000000/preflight-summary.json',
      sourceHash: 'b'.repeat(64),
      releaseHistory: {
        schemaVersion: 2,
        limit: 8,
        entries: [{
          runId: '20260719-000000',
          generatedAt: '2026-07-19 00:00:00',
          sourceCommitSha: 'c'.repeat(40),
          records: { passed: 82, required: 82 },
          postChecks: { passed: 3, required: 3 },
          dimensions: ['release', 'steel', 'rc', 'delivery'].map(id => ({ id, pass: true })),
          metrics: [
            ['steelResult', 5], ['steelContentSeal', 5], ['steelApprovalSeal', 5],
            ['rcResult', 34], ['rcPrint', 34], ['rcPackage', 32],
            ['formalResult', 14], ['localQuickResult', 3], ['rendered', 31], ['delivery', 139],
          ].map(([id, required]) => ({ id, complete: required, required })),
          change: {
            policyVersion: 1,
            classification: 'baseline',
            increases: [],
            reductions: [],
            reasonCode: '',
            reason: '',
          },
        }],
      },
    }), 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, '結構工具箱', 'assets', 'status', 'report-readiness-status.json'), JSON.stringify({
      publicEvidenceSchemaVersion: 3,
      snapshotVersion: 1,
      kind: 'report-readiness-status',
      generatedAt: '2026-07-19 00:00:00',
      runId: '20260719-000000',
      pass: true,
      failureCount: 0,
      sourcePath: 'output/audit/tool-maturity-matrix.json',
      sourceHash: 'd'.repeat(64),
      steelResultReconciliationRequired: 5,
      steelResultReconciliationComplete: 5,
      steelResultReconciliationPass: true,
      steelHtmlContentSealRequired: 5,
      steelHtmlContentSealComplete: 5,
      steelHtmlContentSealPass: true,
      steelHtmlApprovalSealRequired: 5,
      steelHtmlApprovalSealComplete: 5,
      steelHtmlApprovalSealPass: true,
      rcResultReconciliationRequired: 34,
      rcResultReconciliationComplete: 34,
      rcResultReconciliationPass: true,
      rcStandaloneFormalHtmlPrintRequired: 34,
      rcStandaloneFormalHtmlPrintComplete: 34,
      rcStandaloneFormalHtmlPrintPass: true,
      rcSourceReportPackageRequired: 32,
      rcSourceReportPackageComplete: 32,
      rcSourceReportPackagePass: true,
      formalResultReconciliationRequired: 14,
      formalResultReconciliationComplete: 14,
      formalResultReconciliationPass: true,
      localQuickResultReconciliationRequired: 3,
      localQuickResultReconciliationComplete: 3,
      localQuickResultReconciliationPass: true,
      renderedDeliveryEvidenceRequired: 31,
      renderedDeliveryEvidenceComplete: 31,
      deliveryFileIntegrityRequired: 139,
      deliveryFileIntegrityVerified: 139,
      deliveryFileIntegrityPass: true,
    }), 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, '.nojekyll'), '', 'utf8');
    const { buildDeploymentManifest } = require(deploymentManifestBuilderPath);
    const options = {
      siteRoot: fixtureRoot,
      commitSha: 'a'.repeat(40),
      sourceRef: 'refs/heads/fixture',
      sourceDirty: false,
      runId: 'fixture-run',
      runAttempt: 1,
      generatedAt: '2026-07-19T00:00:00.000Z',
    };
    const first = buildDeploymentManifest(options);
    const second = buildDeploymentManifest({ ...options, generatedAt: '2026-07-19T00:01:00.000Z' });
    assert.equal(first.schemaVersion, 3, 'deployment manifest uses the release-bound closed file-inventory schema');
    assert.equal(first.fileCount, 5, 'deployment manifest includes all three public release snapshots while excluding hidden files and itself');
    assert.deepEqual(first.files.map(file => file.path), ['assets/app.js', 'index.html', '結構工具箱/assets/status/platform-status.json', '結構工具箱/assets/status/preflight-summary.json', '結構工具箱/assets/status/report-readiness-status.json'], 'deployment manifest publishes the complete ordinal file inventory');
    assert.deepEqual(first.releaseEvidence, {
      schemaVersion: 3,
      runId: '20260719-000000',
      generatedAt: '2026-07-19 00:00:00',
      sourceCommitSha: 'c'.repeat(40),
      dimensions: [
        { id: 'release', pass: true },
        { id: 'steel', pass: true },
        { id: 'rc', pass: true },
        { id: 'delivery', pass: true },
      ],
      releaseHistory: {
        schemaVersion: 2,
        changePolicyVersion: 1,
        retainedCount: 1,
        oldestRunId: '20260719-000000',
        latestRunId: '20260719-000000',
        latestClassification: 'baseline',
        latestReductionCount: 0,
      },
    }, 'deployment manifest binds formal release identity and all public evidence dimensions');
    PagesLiveSmoke.validateDeploymentReleaseEvidence(first.releaseEvidence);
    assert.equal(first.files.reduce((sum, file) => sum + file.bytes, 0), first.totalBytes, 'deployment manifest file inventory reproduces total bytes');
    PagesLiveSmoke.validateManifestFileInventory(first);
    assert.equal(first.artifactDigest, second.artifactDigest, 'deployment manifest tree digest is deterministic across regeneration');
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'pages-deployment.json'), 'utf8')).commitSha, 'a'.repeat(40), 'deployment manifest is written to the staged root');
    assert.equal(first.sourceDirty, false, 'deployment manifest records clean or dirty source state explicitly');
    fs.writeFileSync(path.join(fixtureRoot, 'assets', 'app.js'), 'console.log("changed");', 'utf8');
    const changed = buildDeploymentManifest(options);
    assert.notEqual(first.artifactDigest, changed.artifactDigest, 'deployment manifest tree digest changes with published content');
    const forged = JSON.parse(JSON.stringify(first));
    forged.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => PagesLiveSmoke.validateManifestFileInventory(forged), /inventory tree digest/, 'deployment manifest rejects forged file hashes');
    const unsafe = JSON.parse(JSON.stringify(first));
    unsafe.files[0].path = '../outside.html';
    assert.throws(() => PagesLiveSmoke.validateManifestFileInventory(unsafe), /safe path segments/, 'deployment manifest rejects unsafe inventory paths');
    const appEntry = first.files.find(file => file.path === 'assets/app.js');
    PagesLiveSmoke.validatePublishedFileContent(appEntry, Buffer.from('console.log("fixture");', 'utf8'));
    assert.throws(
      () => PagesLiveSmoke.validatePublishedFileContent(appEntry, Buffer.from('console.log("tampered");', 'utf8')),
      /deployed (?:byte count|SHA-256)/,
      'deployed artifact verification rejects changed public bytes',
    );
    const preflightPath = path.join(fixtureRoot, '結構工具箱', 'assets', 'status', 'preflight-summary.json');
    const preflightFixture = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
    fs.writeFileSync(preflightPath, JSON.stringify({ ...preflightFixture, quick: true }), 'utf8');
    assert.throws(() => buildDeploymentManifest(options), /public evidence bundle failed schema.*preflight\.formalRelease/, 'deployment manifest rejects quick evidence');
    fs.writeFileSync(preflightPath, JSON.stringify(preflightFixture), 'utf8');
    const readinessPath = path.join(fixtureRoot, '結構工具箱', 'assets', 'status', 'report-readiness-status.json');
    const readinessFixture = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    fs.writeFileSync(readinessPath, JSON.stringify({ ...readinessFixture, runId: '20260719-000001' }), 'utf8');
    assert.throws(() => buildDeploymentManifest(options), /public evidence bundle failed schema.*readiness\.releaseAlignment/, 'deployment manifest rejects mismatched report readiness evidence');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

assert.ok(pagesWorkflow.includes('node "結構工具箱/tools/build-pages-artifact.js" --repo-root "." --site-root "_site"'), 'Pages workflow stages through the shared Git-inventory builder');
assert.ok(pagesWorkflow.includes('fetch-depth: 2'), 'Pages workflow fetches the tested parent commit for release lineage verification');
assert.ok(pagesWorkflow.includes('- name: Verify tested release lineage') && pagesWorkflow.includes('verify-pages-release-lineage.js'), 'Pages workflow blocks staging until tested release lineage passes');
assert.ok(pagesWorkflow.indexOf('- name: Verify tested release lineage') < pagesWorkflow.indexOf('- name: Stage static site'), 'Pages release lineage gate runs before artifact staging');
assert.equal(pagesWorkflow.includes('rsync -a'), false, 'Pages workflow does not keep a second rsync exclusion policy');
assert.ok(artifactBuilder.includes("'output'") && artifactBuilder.includes("'.md'") && artifactBuilder.includes("'.ps1'"), 'shared artifact builder excludes generated output, docs, and scripts');
assert.ok(artifactBuilder.includes('attachment-package-check.js') && artifactBuilder.includes('rendered-delivery-evidence.js') && artifactBuilder.includes('docx-package-integrity.js') && artifactBuilder.includes('xlsx-package-integrity.js') && artifactBuilder.includes('xlsx-print-export.py') && artifactBuilder.includes('xlsx-print-visual.js') && artifactBuilder.includes('xlsx-seal-verifier.js'), 'shared artifact builder excludes delivery governance helpers');
assert.ok(artifactBuilder.includes('PRIVATE_GENERATED_FILE_PREFIXES') && artifactBuilder.includes('GSM-外部歸檔生命週期監測-latest') && artifactBuilder.includes('GSM-外部歸檔生命週期監測事件-'), 'shared artifact builder excludes copied GSM monitor state and events');
assert.ok(artifactBuilder.includes('verify-pages-release-lineage.js'), 'shared artifact builder excludes the release lineage verifier');
assert.ok(artifactBuilder.includes('GIT_INDEX_FILE') && artifactBuilder.includes("core.autocrlf=false") && artifactBuilder.includes("core.eol=lf"), 'shared artifact builder uses an isolated normalized Git index');
assert.ok(artifactBuilder.includes("'--cached', '--others', '--exclude-standard'") && artifactBuilder.includes("'--pathspec-from-file=-'"), 'shared artifact builder stages tracked and non-ignored working files');
assert.ok(pagesWorkflow.includes('pages-live-smoke.js') && pagesWorkflow.includes('--check-private-boundary'), 'Pages workflow runs private-boundary smoke before and after deploy');
assert.ok(pagesWorkflow.includes('actions/setup-node@v6') && pagesWorkflow.includes('node-version: 24'), 'Pages browser smoke pins its Node runtime');
const stagedGateIndex = pagesWorkflow.indexOf('- name: Verify staged Pages artifact');
const archiveIndex = pagesWorkflow.indexOf('- name: Archive GitHub Pages artifact');
assert.ok(stagedGateIndex >= 0 && stagedGateIndex < archiveIndex, 'Pages staged artifact gate blocks archive and deploy');
assert.ok(pagesWorkflow.includes('python3 -m http.server 4173') && pagesWorkflow.includes('--directory _site'), 'Pages staged artifact gate serves the exact _site tree');
assert.ok(pagesWorkflow.includes('node "結構工具箱/tools/pages-live-smoke.js"') && pagesWorkflow.includes('--base-url "$base_url"') && pagesWorkflow.includes('--check-private-boundary'), 'Pages staged artifact gate runs HTTP and private-boundary checks');
assert.ok(pagesWorkflow.includes('build-pages-deployment-manifest.js') && pagesWorkflow.includes('--commit-sha "$GITHUB_SHA"') && pagesWorkflow.includes('--run-id "$GITHUB_RUN_ID"'), 'Pages workflow binds the staged manifest to the source commit and workflow run');
assert.ok(pagesWorkflow.includes('- name: Verify clean source checkout') && pagesWorkflow.includes('git status --porcelain --untracked-files=all') && pagesWorkflow.includes('--source-dirty "false"'), 'Pages workflow proves the source checkout is clean before staging');
assert.ok(pagesWorkflow.includes('--expected-commit-sha "$GITHUB_SHA"') && pagesWorkflow.includes('--expected-run-id "$GITHUB_RUN_ID"'), 'Pages staged smoke verifies deployment provenance');
assert.ok(pagesWorkflow.includes('--expect-clean-source') && pagesWorkflow.includes('PAGES_EXPECT_CLEAN_SOURCE: 1'), 'Pages staged and live smoke reject dirty deployment provenance');
assert.ok(pagesWorkflow.includes('PAGES_EXPECTED_COMMIT_SHA: ${{ github.sha }}') && pagesWorkflow.includes('PAGES_EXPECTED_RUN_ID: ${{ github.run_id }}'), 'Pages live smoke verifies the deployed commit and run identity');
assert.equal((pagesWorkflow.match(/bash "結構工具箱\/tools\/run-pages-browser-smoke\.sh"/g) || []).length, 2, 'Pages workflow reuses the browser runner before and after deploy');
assert.equal((pagesWorkflow.match(/uses: actions\/cache@v5/g) || []).length, 4, 'Pages workflow restores explicit npm and Playwright caches in build and live jobs');
assert.equal((pagesWorkflow.match(/path: ~\/\.cache\/ms-playwright/g) || []).length, 2, 'Pages workflow caches the canonical Linux Playwright browser directory in both browser jobs');
assert.equal((pagesWorkflow.match(/runner\.os }}-\${{ runner\.arch }}-pages-playwright-\${{ hashFiles\('\.github\/pages-smoke\/package-lock\.json'\) }}-chromium-v1/g) || []).length, 2, 'Pages browser cache key binds OS, architecture, lockfile digest, and browser family');
assert.equal((pagesWorkflow.match(/path: ~\/\.npm/g) || []).length, 2, 'Pages workflow caches the npm content store explicitly in both jobs');
assert.equal((pagesWorkflow.match(/runner\.os }}-\${{ runner\.arch }}-pages-npm-\${{ hashFiles\('\.github\/pages-smoke\/package-lock\.json'\) }}/g) || []).length, 2, 'Pages npm cache key binds OS, architecture, and the complete lockfile digest');
assert.equal(pagesWorkflow.includes('cache-dependency-path:'), false, 'Pages workflow does not hide npm cache evidence behind setup-node');
assert.equal((pagesWorkflow.match(/npm ci --ignore-scripts --no-audit --no-fund/g) || []).length, 2, 'Pages workflow installs the exact lockfile runtime without lifecycle scripts in both jobs');
assert.deepEqual(pagesSmokeRuntime.dependencies, { '@playwright/cli': '0.1.17', terser: '5.49.0' }, 'Pages smoke runtime pins direct browser dependencies exactly');
assert.equal(pagesSmokeLock.lockfileVersion, 3, 'Pages smoke runtime uses npm lockfile v3');
assert.equal(pagesSmokeLock.packages['node_modules/@playwright/cli'].version, '0.1.17');
assert.equal(pagesSmokeLock.packages['node_modules/terser'].version, '5.49.0');
for (const name of ['node_modules/@playwright/cli', 'node_modules/playwright', 'node_modules/playwright-core', 'node_modules/terser']) {
  assert.match(pagesSmokeLock.packages[name].integrity, /^sha512-/, `Pages smoke lock preserves registry integrity for ${name}`);
}
assert.ok(pagesBrowserRunner.includes('node_modules/@playwright/cli/playwright-cli.js') && pagesBrowserRunner.includes('node_modules/terser/bin/terser'), 'Pages browser runner executes only the lockfile-installed local CLIs');
assert.equal(pagesBrowserRunner.includes('npx '), false, 'Pages browser runner does not resolve floating npx packages at runtime');
assert.equal((pagesWorkflow.match(/if: always\(\)/g) || []).length, 6, 'Pages build and live jobs always prepare, upload, and summarize CI evidence');
assert.equal((pagesWorkflow.match(/run: node \.github\/pages-smoke\/write-ci-summary\.js/g) || []).length, 4, 'Pages workflow uses one implementation to prepare and summarize staged and live evidence');
assert.ok(pagesWorkflow.indexOf('- name: Upload GitHub Pages artifact') < pagesWorkflow.indexOf('- name: Publish build CI evidence'), 'Pages build summary runs after archive upload so job status covers the complete build');
assert.equal((pagesWorkflow.match(/PAGES_NPM_CACHE_HIT: \${{ steps\.npm-cache\.outputs\.cache-hit }}/g) || []).length, 2, 'Pages summaries consume the explicit npm cache hit output');
assert.equal((pagesWorkflow.match(/PAGES_BROWSER_CACHE_HIT: \${{ steps\.playwright-browser-cache\.outputs\.cache-hit }}/g) || []).length, 2, 'Pages summaries consume the explicit browser cache hit output');
assert.equal((pagesWorkflow.match(/PAGES_RUNTIME_INSTALL_DURATION_MS: \${{ steps\.runtime-install\.outputs\.duration_ms }}/g) || []).length, 2, 'Pages summaries receive measured lockfile install durations');
assert.equal((pagesWorkflow.match(/PAGES_HTTP_SMOKE_RESULT_FILE:/g) || []).length, 4, 'Pages HTTP smoke and both summaries share private result file locations');
assert.equal((pagesWorkflow.match(/PAGES_BROWSER_SMOKE_RESULT_FILE:/g) || []).length, 4, 'Pages browser smoke and both summaries share private result file locations');
assert.equal((pagesWorkflow.match(/PAGES_CI_ACTION: prepare/g) || []).length, 2, 'Pages workflow prepares one governed evidence receipt per browser job');
assert.equal((pagesWorkflow.match(/PAGES_CI_ACTION: summary/g) || []).length, 2, 'Pages workflow summarizes only prepared evidence receipts');
assert.equal((pagesWorkflow.match(/PAGES_CI_PERFORMANCE_BUDGET_FILE: \.github\/pages-smoke\/performance-budget\.json/g) || []).length, 2, 'Pages evidence uses the same versioned performance budget in both jobs');
assert.equal((pagesWorkflow.match(/uses: actions\/upload-artifact@v6\n\s+with:\n\s+name: pages-ci-evidence-(?:build|live-smoke)/g) || []).length, 2, 'Pages workflow uploads staged and live evidence under unique artifact names');
assert.ok(pagesWorkflow.indexOf('- name: Upload build CI evidence') < pagesWorkflow.indexOf('- name: Publish build CI evidence'), 'Pages build summary job status includes its evidence upload outcome');
assert.ok(pagesWorkflow.indexOf('- name: Upload live CI evidence') < pagesWorkflow.indexOf('- name: Publish live CI evidence'), 'Pages live summary job status includes its evidence upload outcome');
assert.ok(pagesBrowserRunner.includes("kind: 'pages-browser-smoke'") && pagesBrowserRunner.includes('write_result failed') && pagesBrowserRunner.includes('write_result passed') && pagesBrowserRunner.includes('durationMs') && pagesBrowserRunner.includes('attemptCount'), 'Pages browser runner records success or failure timing and attempt evidence');
assert.ok(pagesSmoke.includes("kind: 'pages-http-smoke'") && pagesSmoke.includes("status: 'failed'") && pagesSmoke.includes('durationMs') && pagesSmoke.includes('attemptCount'), 'Pages HTTP smoke records success or failure timing and attempt evidence');
assert.ok(pagesSmoke.includes("'.github/pages-smoke/write-ci-summary.js'"), 'Pages private-boundary probe covers the CI summary source');
assert.ok(pagesSmoke.includes("'.github/pages-smoke/performance-budget.json'"), 'Pages private-boundary probe covers the CI performance budget');
assert.ok(pagesSmoke.includes("'.github/pages-smoke/build-performance-trend.js'") && pagesSmoke.includes("'.github/pages-smoke/build-performance-trend.test.js'"), 'Pages private-boundary probe covers performance trend source and contract');
assert.ok(artifactBuilder.includes("'.github/pages-smoke/build-performance-trend.js'") && artifactBuilder.includes("'.github/pages-smoke/build-performance-trend.test.js'"), 'Pages artifact builder explicitly excludes performance trend governance');
assert.ok(pagesWorkflow.includes('performance-trend:') && pagesWorkflow.includes('needs:\n      - build\n      - live-smoke'), 'Pages performance trend waits for both complete current-run receipts');
assert.equal((pagesWorkflow.match(/uses: actions\/download-artifact@v8/g) || []).length, 2, 'Pages trend downloads current build and live receipts with pinned actions');
assert.ok(pagesWorkflow.includes("--status success") && pagesWorkflow.includes('pages-ci-evidence-build') && pagesWorkflow.includes('pages-ci-evidence-live-smoke'), 'Pages trend samples only successful runs with paired receipts');
assert.ok(pagesWorkflow.includes('timeout-minutes: 10') && pagesWorkflow.includes('select(.expired == false)') && pagesWorkflow.includes('incomplete or duplicate Pages CI evidence artifacts'), 'Pages trend bounds collection and distinguishes legacy absence from incomplete evidence');
assert.ok(pagesWorkflow.includes('gh run download "$run_id" -n pages-ci-evidence-build') && !pagesWorkflow.includes('gh run download "$run_id" -n pages-ci-evidence-build -D "$run_root" >/dev/null 2>&1'), 'Pages trend does not suppress governed receipt download failures');
assert.ok(pagesWorkflow.includes('PAGES_CI_TREND_MAX_RUNS: 20') && pagesWorkflow.includes('name: pages-ci-performance-trend'), 'Pages trend bounds history and saves a unique artifact');
assert.equal((pagesWorkflow.match(/retention-days: 14/g) || []).length, 3, 'Pages CI receipts and performance trend are retained for fourteen days');
assert.equal((pagesWorkflow.match(/if-no-files-found: error/g) || []).length, 4, 'Pages site, CI evidence, and trend uploads fail closed on missing files');
assert.ok(pagesWorkflow.indexOf('- name: Upload Pages CI performance trend') < pagesWorkflow.indexOf('- name: Publish Pages CI performance trend'), 'Pages trend summary follows successful artifact upload');
assert.equal(pagesCiPerformanceTrend.percentileNearestRank([1, 3, 2, 5, 4], 0.50), 3, 'Pages trend computes nearest-rank P50');
assert.equal(pagesCiPerformanceTrend.percentileNearestRank([1, 3, 2, 5, 4], 0.95), 5, 'Pages trend computes nearest-rank P95');
assert.ok(readme.includes('GitHub Actions job summary') && readme.includes('趨勢統計的納入條件') && readme.includes('趨勢與摘要都屬私有 CI 治理') && readme.includes('不進 Pages artifact、計算書或正式附件'), 'README documents CI evidence, cold-cache trend eligibility, visibility, and report boundary');
assert.ok(toolBoundaries.includes('封閉 v1 JSON') && toolBoundaries.includes('上傳失敗不得忽略') && toolBoundaries.includes('nearest-rank') && toolBoundaries.includes('不得進入 Pages、計算書或正式附件'), 'TOOL_BOUNDARIES fail-closes reproducible trend evidence and keeps it private');
assert.ok(staging.includes('不足 3 輪顯示 `collecting`') && staging.includes('不得發布至 Pages 或放入計算書／正式附件'), 'STAGING_GROUPS documents trend maturity and private report boundary');
assert.equal(pagesPerformanceBudget.schemaVersion, 1, 'Pages performance budget uses schema v1');
assert.equal(pagesPerformanceBudget.kind, 'pages-ci-performance-budget');
assert.equal(pagesPerformanceBudget.mode, 'warning-only', 'Pages performance budget cannot block deployment');
assert.equal(pagesPerformanceBudget.basis.sourceCommit, '14cddc1a820b01b45c402d487a016386058532cb');
assert.deepEqual(pagesPerformanceBudget.basis.sampleRunIds, ['31683313569', '31683809298', '31683817481'], 'Pages performance budget preserves three same-commit warm-cache samples');
assert.deepEqual(pagesPerformanceBudget.thresholdsMs, { runtimeInstall: 8000, httpSmoke: 90000, browserSmoke: 180000 }, 'Pages performance thresholds retain material headroom over observations');
{
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-ci-summary-contract-'));
  try {
    const httpPath = path.join(fixture, 'http.json');
    const browserPath = path.join(fixture, 'browser.json');
    const budgetPath = path.join(fixture, 'budget.json');
    const evidencePath = path.join(fixture, 'evidence.json');
    fs.writeFileSync(httpPath, JSON.stringify({ schemaVersion: 1, kind: 'pages-http-smoke', status: 'passed', durationMs: 1234, attemptCount: 1, fileCount: 318, routeCount: 43 }));
    fs.writeFileSync(browserPath, JSON.stringify({ schemaVersion: 1, kind: 'pages-browser-smoke', status: 'passed', durationMs: 5678, attemptCount: 1, routes: 43, checks: 86, issues: 0 }));
    fs.writeFileSync(budgetPath, JSON.stringify(pagesPerformanceBudget));
    const environment = {
      PAGES_CI_JOB: 'fixture', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
      PAGES_RUNTIME_LOCK_DIGEST: 'b'.repeat(64), PAGES_NPM_CACHE_HIT: 'true', PAGES_BROWSER_CACHE_HIT: 'false',
      PAGES_RUNTIME_INSTALL_OUTCOME: 'success', PAGES_RUNTIME_INSTALL_DURATION_MS: '987',
      PAGES_HTTP_SMOKE_RESULT_FILE: httpPath, PAGES_BROWSER_SMOKE_RESULT_FILE: browserPath,
      PAGES_CI_PERFORMANCE_BUDGET_FILE: budgetPath, PAGES_CI_EVIDENCE_FILE: evidencePath,
    };
    const evidence = pagesCiSummary.buildEvidence(environment);
    const summary = pagesCiSummary.buildSummary(evidence, 'success');
    assert.ok(summary.includes('exact hit') && summary.includes('miss'), 'Pages CI summary distinguishes exact cache hits from misses');
    assert.ok(summary.includes('318 files; 43 routes') && summary.includes('86 checks; 0 issues'), 'Pages CI summary exposes bounded smoke evidence');
    assert.ok(summary.includes('1.2 s') && summary.includes('5.7 s') && summary.includes('987 ms'), 'Pages CI summary formats measured stage durations');
    assert.equal(evidence.performanceBudget.withinBudget, true, 'Pages CI evidence records an in-budget result');
    assert.deepEqual(evidence.performanceBudget.warnings, []);
    assert.equal(evidence.cache.npmContent, 'exact-hit');
    assert.equal(evidence.cache.playwrightBrowser, 'miss');
    assert.equal(Object.prototype.hasOwnProperty.call(evidence, 'jobStatus'), false, 'Prepared evidence does not freeze the pre-upload job status');
    pagesCiSummary.prepareEvidence(environment);
    assert.deepEqual(pagesCiSummary.readEvidence(evidencePath), evidence, 'Prepared Pages CI evidence round-trips through the closed receipt');
    fs.writeFileSync(evidencePath, JSON.stringify({ ...evidence, unexpected: true }));
    assert.throws(() => pagesCiSummary.readEvidence(evidencePath), /Unexpected Pages CI evidence fields/, 'Pages CI evidence rejects undeclared fields');
    pagesCiSummary.prepareEvidence(environment);
    const slowEnvironment = { ...environment, PAGES_RUNTIME_INSTALL_DURATION_MS: '8001' };
    fs.writeFileSync(httpPath, JSON.stringify({ schemaVersion: 1, kind: 'pages-http-smoke', status: 'passed', durationMs: 90001, attemptCount: 1, fileCount: 318, routeCount: 43 }));
    fs.writeFileSync(browserPath, JSON.stringify({ schemaVersion: 1, kind: 'pages-browser-smoke', status: 'passed', durationMs: 180001, attemptCount: 1, routes: 43, checks: 86, issues: 0 }));
    const slowEvidence = pagesCiSummary.buildEvidence(slowEnvironment);
    assert.equal(slowEvidence.performanceBudget.withinBudget, false, 'Pages CI evidence records performance warnings without changing smoke success');
    assert.deepEqual(slowEvidence.performanceBudget.warnings.map(item => item.signal), ['runtimeInstall', 'httpSmoke', 'browserSmoke']);
    assert.ok(pagesCiSummary.buildSummary(slowEvidence, 'success').includes('3 warning(s)'), 'Pages CI summary renders all non-blocking warnings');
    const missing = pagesCiSummary.buildEvidence({ ...environment, PAGES_HTTP_SMOKE_RESULT_FILE: '', PAGES_BROWSER_SMOKE_RESULT_FILE: '' });
    assert.equal(missing.httpSmoke.status, 'not-run', 'Pages CI evidence explicitly records absent HTTP evidence');
    assert.equal(missing.browserSmoke.status, 'not-run', 'Pages CI evidence explicitly records absent browser evidence');
    fs.writeFileSync(httpPath, JSON.stringify({ schemaVersion: 2, kind: 'pages-http-smoke', status: 'passed', durationMs: 1, attemptCount: 1 }));
    assert.throws(() => pagesCiSummary.buildEvidence(environment), /Unexpected pages-http-smoke evidence schema/, 'Pages CI evidence rejects unknown result schemas');
    const invalidBudget = { ...pagesPerformanceBudget, mode: 'blocking' };
    fs.writeFileSync(budgetPath, JSON.stringify(invalidBudget));
    assert.throws(() => pagesCiSummary.buildEvidence(environment), /Unexpected Pages CI performance budget schema/, 'Pages CI evidence rejects a blocking performance policy');
    const duplicateRunBudget = JSON.parse(JSON.stringify(pagesPerformanceBudget));
    duplicateRunBudget.basis.sampleRunIds[2] = duplicateRunBudget.basis.sampleRunIds[1];
    fs.writeFileSync(budgetPath, JSON.stringify(duplicateRunBudget));
    assert.throws(() => pagesCiSummary.buildEvidence(environment), /unique numeric IDs/, 'Pages CI evidence rejects duplicate baseline samples');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
assert.ok(readme.includes('actions/cache@v5') && readme.includes('~/.cache/ms-playwright') && readme.includes('cache hit'), 'README documents the cross-job Playwright cache and validation boundary');
assert.ok(toolBoundaries.includes('actions/cache@v5') && toolBoundaries.includes('~/.cache/ms-playwright') && toolBoundaries.includes('install-browser chromium'), 'TOOL_BOUNDARIES requires cache restore without skipping browser validation');
assert.ok(staging.includes('pages-release-governance.contract.test.js') && staging.includes('.github/workflows/pages-deploy.yml') && staging.includes('run-pages-browser-smoke.sh'), 'STAGING_GROUPS keeps the Pages cache workflow, runner, and contract together');
assert.ok(pagesWorkflow.includes('PAGES_BROWSER_SMOKE_ATTEMPTS: 2') && pagesWorkflow.includes('PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS: 5'), 'Pages live browser smoke allows one bounded transient retry');
assert.ok(pagesWorkflow.includes('PAGES_HTTP_SMOKE_ATTEMPTS: 2') && pagesWorkflow.includes('PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS: 5'), 'Pages live HTTP smoke allows one bounded transient retry');
assert.ok(pagesSmoke.includes('response.status >= 500 && response.status <= 599') && pagesSmoke.includes('runWithTransientRetry'), 'Pages HTTP smoke classifies 5xx and runs through the bounded retry wrapper');
assert.ok(pagesSmoke.includes("environmentInteger('PAGES_HTTP_SMOKE_ATTEMPTS', 1, 1)") && pagesSmoke.includes("environmentInteger('PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS', 5, 0)"), 'Pages HTTP smoke defaults staged and local runs to one attempt');
assert.ok(pagesBrowserRunner.includes('runtime.dependencies') && pagesBrowserRunner.includes('version mismatch') && pagesBrowserRunner.includes('install-browser chromium'), 'Pages browser runner verifies installed versions before Chromium validation');
assert.ok(pagesBrowserRunner.includes('terser_cli') && pagesBrowserRunner.includes('pages-live-browser-smoke.js'), 'Pages browser runner invokes the reusable browser smoke source through pinned Terser');
assert.ok(pagesBrowserRunner.includes('value.isError') && pagesBrowserRunner.includes('trap cleanup EXIT'), 'Pages browser runner fails on CLI JSON errors and always closes its session');
assert.ok(pagesBrowserRunner.includes('status(?: of)? 5') && pagesBrowserRunner.includes('ERR_(?:TIMED_OUT|CONNECTION_RESET'), 'Pages browser runner narrows retry eligibility to transient 5xx and network failures');
assert.ok(pagesBrowserRunner.includes('"$attempt" -lt "$attempts"') && pagesBrowserRunner.includes('throw new Error(value.error)'), 'Pages browser runner bounds retries and fails persistent or non-transient errors');

assert.ok(pagesSmoke.includes('assets/status/platform-status.json'), 'Pages smoke checks platform status');
assert.ok(pagesSmoke.includes('assets/status/preflight-summary.json'), 'Pages smoke checks preflight status');
assert.ok(pagesSmoke.includes('assets/status/report-readiness-status.json'), 'Pages smoke checks report readiness status');
assert.ok(pagesSmoke.includes('reportReadinessStatus.runId, preflightStatus.runId'), 'Pages smoke aligns report readiness and preflight runId');
assert.ok(pagesSmoke.includes('reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath'), 'Pages smoke aligns report readiness preflight source');
assert.ok(pagesSmoke.includes("{ path: 'anchor/', needles: ['錨栓檢討工具'], checkAssets: true }"), 'Pages smoke opts anchor into public asset checks');
assert.ok(pagesSmoke.includes('async function assertPublicAssets'), 'Pages smoke fetches public page assets');
assert.ok(pagesSmoke.includes('response.arrayBuffer()'), 'Pages smoke rejects empty public assets');
assert.ok(pagesSmoke.includes("'../結構工具箱/assets/status/platform-status.json'"), 'Pages smoke checks RC public status routing');
assert.ok(pagesSmoke.includes('homeCleanRoutes'), 'Pages smoke derives the complete clean-route inventory from public home.js');
assert.ok(pagesSmoke.includes('assertAllHomeCleanRoutes'), 'Pages smoke checks every homepage clean route after deploy');
assert.ok(pagesSmoke.includes('CONTEXT.md'), 'Pages smoke blocks context publication');
assert.ok(pagesSmoke.includes('docs/adr/0001-page-only-report-readiness.md'), 'Pages smoke blocks ADR publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/attachment-package-check.js'), 'Pages smoke blocks attachment package checker publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/rendered-delivery-evidence.js'), 'Pages smoke blocks rendered delivery evidence helper publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/rendered-delivery-evidence.inventory.json'), 'Pages smoke blocks rendered delivery evidence inventory publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/docx-package-integrity.js'), 'Pages smoke blocks DOCX package integrity helper publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/docx-package-integrity.test.js'), 'Pages smoke blocks DOCX package integrity fixture publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/xlsx-package-integrity.js'), 'Pages smoke blocks XLSX package integrity helper publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/xlsx-package-integrity.test.js'), 'Pages smoke blocks XLSX package integrity fixture publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/xlsx-print-export.py'), 'Pages smoke blocks XLSX Office print exporter publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/xlsx-print-visual.js'), 'Pages smoke blocks XLSX Office print visual helper publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/xlsx-print-visual.test.js'), 'Pages smoke blocks XLSX Office print visual fixture publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/pages-live-browser-smoke.js'), 'Pages smoke blocks browser smoke source publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/run-pages-browser-smoke.sh'), 'Pages smoke blocks browser smoke runner publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/build-pages-artifact.js'), 'Pages smoke blocks shared artifact builder publication');
assert.ok(pagesSmoke.includes('GSM-外部歸檔生命週期監測-latest.json') && pagesSmoke.includes('GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json'), 'Pages smoke blocks GSM monitor state and event publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/build-pages-deployment-manifest.js'), 'Pages smoke blocks deployment manifest builder publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/verify-pages-release-lineage.js'), 'Pages smoke blocks release lineage verifier publication');
assert.ok(artifactBuilder.includes('結構工具箱/tools/release-preflight-lock.ps1') && artifactBuilder.includes('結構工具箱/tools/release-preflight-lock.test.js'), 'Pages artifact builder explicitly keeps release singleton lock and its fixture private');
assert.ok(pagesSmoke.includes("liveUrl(base, 'pages-deployment.json')") && pagesSmoke.includes('deployed Pages commit matches the requested source commit'), 'Pages smoke validates the public deployment manifest and expected commit');
assert.ok(pagesSmoke.includes('deployed Pages runId matches the current workflow run') && pagesSmoke.includes('sha256-tree-v1'), 'Pages smoke validates workflow run and tree digest metadata');
assert.ok(pagesSmoke.includes('validateManifestFileInventory') && pagesSmoke.includes('inventory tree digest'), 'Pages smoke recomputes the closed file inventory digest');
assert.ok(pagesSmoke.includes('async function assertPublishedArtifact') && pagesSmoke.includes('deployed SHA-256'), 'Pages smoke fetches and hashes every deployed artifact file');
assert.ok(pagesSmoke.includes('Math.min(8, manifest.files.length)') && pagesSmoke.includes("artifact_check"), 'Pages smoke bounds artifact verification concurrency and cache-busts each file');
assert.ok(pagesSmoke.includes('deployed Pages manifest must come from a clean source checkout'), 'Pages smoke validates clean deployment provenance');
assert.ok(pagesSmoke.includes('published formal preflight status reran platform audit'), 'Pages smoke rejects reused platform audit in public formal evidence');
assert.ok(pagesSmoke.includes("manifest.fileCount > 0") && !pagesSmoke.includes('manifest.fileCount >= 300'), 'Pages smoke does not confuse a dirty local file count with the canonical clean artifact');
assert.ok(readme.includes('sourceDirty: false') && readme.includes('sourceDirty: true'), 'README explains formal clean and local dirty provenance');
assert.ok(toolBoundaries.includes('sourceDirty: false') && toolBoundaries.includes('sourceDirty: true'), 'tool boundaries explain clean deployment provenance');
assert.ok(staging.includes('git status --porcelain --untracked-files=all') && staging.includes('sourceDirty: false'), 'staging guide documents the clean checkout requirement');
assert.ok(deploymentManifestBuilder.includes("algorithm: 'sha256-tree-v1'") && deploymentManifestBuilder.includes("entry.name.startsWith('.')"), 'deployment manifest builder hashes the published non-hidden tree');
assert.ok(deploymentManifestBuilder.includes("relativePath === MANIFEST_FILE") && deploymentManifestBuilder.includes("files.sort"), 'deployment manifest builder excludes itself and uses stable path ordering');
assert.ok(deploymentManifestBuilder.includes('schemaVersion: 3') && deploymentManifestBuilder.includes('releaseEvidence') && deploymentManifestBuilder.includes('files: identity.files'), 'deployment manifest publishes release identity and the complete closed file inventory');
assert.ok(pagesSmoke.includes('deployment release run matches public preflight status') && pagesSmoke.includes('deployment tested source matches public preflight status'), 'Pages smoke binds deployment, release run, and tested source');
assert.ok(pushPagesRelease.includes('[int]$Manifest.schemaVersion -ne 3') && pushPagesRelease.includes('$Manifest.releaseEvidence.sourceCommitSha') && pushPagesRelease.includes('-ExpectedSourceSha $testedSourceSha'), 'safe push rejects legacy, incomplete, or parent-mismatched deployment provenance');

assert.ok(pagesBrowserSmoke.includes("{ key: 'desktop', width: 1280, height: 800 }") && pagesBrowserSmoke.includes("{ key: 'mobile', width: 390, height: 844 }"), 'Pages browser smoke covers desktop and mobile viewports');
assert.ok(pagesBrowserSmoke.includes("sessionStorage.getItem(storageKey)") && pagesBrowserSmoke.includes("sessionStorage.setItem(storageKey, candidateBase)"), 'Pages browser smoke preserves the deployment base across bounded retries');
assert.ok(pagesBrowserSmoke.indexOf("await page.goto(`${base}%E7%B5%90%E6%A7%8B%E5%B7%A5%E5%85%B7%E7%AE%B1/`") < pagesBrowserSmoke.indexOf("fetch('assets/home/home.js'"), 'Pages browser smoke returns to the toolbox inventory before every retry');
assert.ok(pagesBrowserSmoke.includes('routes.length < 40') && pagesBrowserSmoke.includes('new Set(routes).size'), 'Pages browser smoke validates the homepage route inventory');
assert.ok(pagesBrowserSmoke.includes("page.on('pageerror'") && pagesBrowserSmoke.includes("page.on('requestfailed'") && pagesBrowserSmoke.includes("page.on('response'"), 'Pages browser smoke captures runtime and network failures');
assert.ok(pagesBrowserSmoke.includes('horizontal overflow') && pagesBrowserSmoke.includes("route === '/rc-pile'") && pagesBrowserSmoke.includes("route === '/wind-cc'") && pagesBrowserSmoke.includes("route === '/stone-fixing'"), 'Pages browser smoke covers overflow and high-risk route regressions');
assert.ok(pagesBrowserSmoke.includes('localArtifactPreview') && pagesBrowserSmoke.includes('127.0.0.1:8765/status'), 'Pages browser smoke narrows local artifact service exceptions');
assert.ok(pagesBrowserSmoke.includes("'?audit_scope=local'") && pagesBrowserSmoke.includes("state.auditScope !== 'public'"), 'Pages browser smoke proves external scope override cannot expose local diagnostics');
assert.ok(pagesBrowserSmoke.includes('privateOutputRequests') && pagesBrowserSmoke.includes("decodeURIComponent(value).includes('/output/')"), 'Pages browser smoke proves the public dashboard makes zero private output requests');
assert.ok(pagesBrowserSmoke.includes("['正式 release 總覽', '鋼構正式附件證據', 'RC 正式附件證據', '風震與跨家族交付證據']") && pagesBrowserSmoke.includes("value !== '公開證據完整'"), 'Pages browser smoke verifies distinct complete public evidence dimensions');
assert.ok(pagesBrowserSmoke.includes("[0, '正式檢查']") && pagesBrowserSmoke.includes("[3, '檔案完整性']") && pagesBrowserSmoke.includes("match[1] === match[2]"), 'Pages browser smoke verifies positive complete public evidence counts without freezing the evolving preflight total');
assert.ok(pagesBrowserSmoke.includes('publicReleaseHistory') && pagesBrowserSmoke.includes('public release history leaks private implementation details'), 'Pages browser smoke verifies the public release history without private implementation leakage');
assert.ok(deploymentManifestBuilder.includes('retainedCount') && deploymentManifestBuilder.includes('oldestRunId') && deploymentManifestBuilder.includes('latestRunId'), 'deployment manifest binds the independently validated public release history range');
assert.ok(deploymentManifestBuilder.includes('changePolicyVersion') && deploymentManifestBuilder.includes('latestClassification') && deploymentManifestBuilder.includes('latestReductionCount'), 'deployment manifest binds the latest governed public threshold change');
assert.ok(pagesBrowserSmoke.includes('localDiagnosticSectionsVisible') && pagesBrowserSmoke.includes('local diagnostic sections remain visible'), 'Pages browser smoke verifies public reading density excludes local diagnostics');
assert.ok(toolBoundaries.includes('只有正式 live') && toolBoundaries.includes('HTTP smoke') && toolBoundaries.includes('HTTP 5xx'), 'tool boundaries documents the live-only transient retry boundary');
assert.ok(staging.includes('HTTP smoke') && staging.includes('完整重跑最多一次') && staging.includes('第二次持續失敗仍阻擋'), 'staging guide documents the bounded live retry rule');

assert.ok(artifactSmoke.includes('GetTempPath'), 'local artifact smoke stages in temp');
assert.ok(artifactSmoke.includes('$ArtifactBuilder') && artifactSmoke.includes('--repo-root $RepoRoot --site-root $SiteRoot'), 'local artifact smoke uses the shared Git-inventory builder');
assert.equal(artifactSmoke.includes('robocopy'), false, 'local artifact smoke does not keep a second robocopy exclusion policy');
assert.ok(artifactSmoke.includes('pages-live-smoke.js'), 'local artifact smoke reuses Pages smoke');
assert.ok(artifactSmoke.includes('pages-live-browser-smoke.js'), 'local artifact smoke reuses Pages browser smoke');
assert.ok(artifactSmoke.includes('IO.Compression.GZipStream') && artifactSmoke.includes("page.evaluate(async s=>") && artifactSmoke.includes("new DecompressionStream('gzip')"), 'local artifact smoke transports the full browser program within the Windows command-line limit');
assert.ok(artifactSmoke.includes('$DeploymentManifestBuilder') && artifactSmoke.includes('--expected-commit-sha $CommitSha'), 'local artifact smoke builds and verifies deployment provenance');
assert.ok(artifactSmoke.includes('$SourceDirty') && artifactSmoke.includes('--source-dirty $SourceDirty.ToString().ToLowerInvariant()'), 'local artifact smoke records dirty source state honestly');
assert.ok(artifactSmoke.includes('$PagesSmokeRuntimeManifest') && artifactSmoke.includes('$ExpectedRuntime.dependencies') && artifactSmoke.includes('version mismatch'), 'local artifact smoke verifies installed browser CLI and minifier versions against the shared manifest');
assert.ok(artifactSmoke.includes('ConvertFrom-Json') && artifactSmoke.includes('$BrowserResult.isError'), 'local artifact smoke fails on Playwright CLI JSON errors');
assert.ok(artifactSmoke.includes('--check-private-boundary'), 'local artifact smoke keeps private-boundary check');
assert.equal(artifactSmoke.includes('--allow-local-output'), false, 'local artifact smoke must not allow repo-root output');

assert.ok(maturityMatrix.includes('writeHomepageStatusSnapshots'), 'maturity matrix writes homepage status snapshots');
assert.ok(maturityMatrix.includes('report-readiness-status'), 'maturity matrix writes report readiness snapshot');
assert.ok(maturityMatrix.includes('preflightStatusSourcePath'), 'report readiness snapshot records preflight source');
assert.ok(maturityMatrix.includes('--preserve-homepage-status'), 'maturity matrix can preserve homepage status snapshots for quick checks');
assert.ok(preflightTools.includes('$maturityMatrixArgs += "--preserve-homepage-status"'), 'quick preflight preserves homepage status on first matrix refresh');
assert.ok(preflightTools.includes('$postSummaryMatrixArgs += "--preserve-homepage-status"'), 'quick preflight preserves homepage status on final matrix refresh');

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
assert.match(preflightStatus.sourceCommitSha, /^[0-9a-f]{40}$/i, 'public preflight snapshot identifies the tested Git commit');
assert.equal(typeof preflightStatus.sourceBranch, 'string', 'public preflight snapshot identifies the tested branch');
assert.equal(preflightStatus.sourceDirty, false, 'public preflight snapshot comes from a clean worktree');
assert.equal(reportReadinessStatus.kind, 'report-readiness-status', 'report readiness kind');
assert.equal(reportReadinessStatus.badge, '頁面專用', 'report readiness badge');
assert.equal(reportReadinessStatus.runId, preflightStatus.runId, 'report readiness runId matches public preflight');
assert.equal(reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath, 'report readiness source matches public preflight source');
assert.equal(reportReadinessStatus.pageOnlyBoundaryComplete, reportReadinessStatus.pageOnlyBoundaryRequired, 'report readiness page-only boundary complete');
assert.equal(reportReadinessStatus.pageOnlyBoundaryIssueCount, 0, 'report readiness has no page-only boundary issues');
assert.equal(reportReadinessStatus.reportTextSmokeComplete, reportReadinessStatus.reportTextSmokeRequired, 'report readiness report text coverage complete');
assert.equal(reportReadinessStatus.reportTextSmokeIssueCount, 0, 'report readiness has no report text issues');
assert.equal(reportReadinessStatus.reportTextSmokeEvidenceComplete, reportReadinessStatus.reportTextSmokeEvidenceRequired, 'report readiness report text runtime evidence complete');
assert.equal(reportReadinessStatus.reportTextSmokeEvidenceIssueCount, 0, 'report readiness has no report text runtime evidence issues');
assert.equal(reportReadinessStatus.reportTextSmokeEvidenceRunId, preflightStatus.runId, 'report readiness runtime evidence runId matches public preflight');
assert.deepEqual(reportReadinessStatus.reportTextSmokeEvidenceUnmappedFamilies, [], 'report readiness maps every report text family to runtime evidence');
assert.ok(reportReadinessStatus.reportTextSmokeEvidenceGates.every(gate => gate.pass && gate.complete === gate.required), 'report readiness runtime evidence gates pass');
assert.ok(String(reportReadinessStatus.reportTextSmokeScope || '').includes('風力 / 地震正式工具') && String(reportReadinessStatus.reportTextSmokeScope || '').includes('局部快算'), 'report readiness names report text scope');
assert.ok(String(reportReadinessStatus.reportTextSmokeScope || '').includes('矩陣外工具家族'), 'report readiness keeps other-family report boundary');
assert.equal(reportReadinessStatus.renderedDeliveryEvidenceRequired, 31, 'report readiness rendered delivery covers every formal homepage tool');
assert.equal(reportReadinessStatus.renderedDeliveryEvidenceComplete, reportReadinessStatus.renderedDeliveryEvidenceRequired, 'report readiness rendered delivery complete');
assert.equal(reportReadinessStatus.renderedDeliveryEvidenceIssueCount, 0, 'report readiness rendered delivery issues empty');
assert.match(reportReadinessStatus.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'report readiness rendered delivery runId');
assert.ok(Array.isArray(reportReadinessStatus.renderedDeliveryEvidenceFamilies) && reportReadinessStatus.renderedDeliveryEvidenceFamilies.length >= 6, 'report readiness rendered delivery family coverage');
assert.equal(reportReadinessStatus.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), reportReadinessStatus.renderedDeliveryEvidenceComplete, 'report readiness rendered delivery family totals');
assert.ok(String(reportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('實際交付物渲染'), 'report readiness rendered delivery summary');
assert.equal(reportReadinessStatus.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${reportReadinessStatus.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/rendered-delivery-evidence-summary.json`, 'report readiness rendered delivery source path');
assert.match(reportReadinessStatus.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'report readiness rendered delivery source hash');
if (Number.isInteger(reportReadinessStatus.supplementalDeliveryEvidenceRequired)) {
  assert.ok([1, 2].includes(reportReadinessStatus.supplementalDeliveryEvidenceRequired), 'report readiness supplemental delivery uses a supported transition count');
  assert.equal(reportReadinessStatus.supplementalDeliveryEvidenceComplete, reportReadinessStatus.supplementalDeliveryEvidenceRequired, 'report readiness supplemental delivery complete');
  assert.equal(reportReadinessStatus.supplementalDeliveryEvidenceIssueCount, 0, 'report readiness supplemental delivery issues empty');
  assert.ok(reportReadinessStatus.supplementalDeliveryEvidenceFamilies.some(item => item.family === 'excavation-formal' && item.complete === 1), 'report readiness supplemental delivery keeps excavation service coverage');
  if (reportReadinessStatus.supplementalDeliveryEvidenceRequired === 2) {
    assert.deepEqual(reportReadinessStatus.supplementalDeliveryEvidenceFamilies, [{ family: 'excavation-formal', complete: 1 }, { family: 'seismic-report', complete: 1 }], 'report readiness supplemental delivery covers report and service families');
    assert.ok(String(reportReadinessStatus.supplementalDeliveryEvidenceSummary || '').includes('補充報告 / 服務實際交付物渲染'), 'report readiness supplemental delivery summary');
  }
}
assert.equal(JSON.stringify(reportReadinessStatus).includes('"artifact":'), false, 'report readiness snapshot excludes artifact fields');
assert.equal(/\.(?:pdf|docx|xlsx)\b/i.test(JSON.stringify(reportReadinessStatus)), false, 'report readiness snapshot excludes delivery filenames');
assert.ok(String(reportReadinessStatus.compactSummary || '').includes('頁面診斷明細不進計算書') && String(reportReadinessStatus.compactSummary || '').includes('內部審閱') && String(reportReadinessStatus.compactSummary || '').includes('正式附件') && String(reportReadinessStatus.compactSummary || '').includes('兩者皆可列印'), 'report readiness keeps compact page-only and approval-state summary');
assert.ok(reportReadinessStatus.details.join(' ').includes('正式計算書可讀文字抽檢'), 'report readiness exposes report text coverage');
assert.ok(reportReadinessStatus.details.join(' ').includes('瀏覽器 smoke 證據'), 'report readiness exposes report text runtime evidence');
assert.ok(reportReadinessStatus.details.join(' ').includes('正式放行實際交付物渲染佐證'), 'report readiness exposes actual rendered delivery evidence');

async function testPagesHttpRetryBoundary() {
  await assert.rejects(
    () => PagesLiveSmoke.fetchResponse('https://example.test/transient', {}, async () => ({ status: 503 })),
    error => error instanceof PagesLiveSmoke.TransientPagesSmokeError && /HTTP 503/.test(error.message),
  );
  const notPublished = await PagesLiveSmoke.fetchResponse('https://example.test/private', {}, async () => ({ status: 404 }));
  assert.equal(notPublished.status, 404, 'HTTP 404 remains a non-transient private-boundary result');

  const reset = new Error('fetch failed');
  reset.cause = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
  await assert.rejects(
    () => PagesLiveSmoke.fetchResponse('https://example.test/reset', {}, async () => { throw reset; }),
    error => error instanceof PagesLiveSmoke.TransientPagesSmokeError && error.cause === reset,
  );

  let attempts = 0;
  const retryDelays = [];
  const recovered = await PagesLiveSmoke.runWithTransientRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new PagesLiveSmoke.TransientPagesSmokeError('temporary HTTP 503');
    return 'recovered';
  }, {
    attempts: 2,
    delayMs: 5000,
    sleep: async value => { retryDelays.push(value); },
  });
  assert.equal(recovered, 'recovered');
  assert.equal(attempts, 2, 'transient HTTP smoke retries exactly once');
  assert.deepEqual(retryDelays, [5000], 'transient HTTP smoke uses the bounded delay');

  attempts = 0;
  await assert.rejects(
    () => PagesLiveSmoke.runWithTransientRetry(async () => {
      attempts += 1;
      throw new Error('expected HTTP 200, got 404');
    }, { attempts: 2, sleep: async () => {} }),
    /got 404/,
  );
  assert.equal(attempts, 1, 'non-transient HTTP failures do not retry');

  attempts = 0;
  await assert.rejects(
    () => PagesLiveSmoke.runWithTransientRetry(async () => {
      attempts += 1;
      throw new PagesLiveSmoke.TransientPagesSmokeError('persistent HTTP 503');
    }, { attempts: 2, delayMs: 0, sleep: async () => {} }),
    /persistent HTTP 503/,
  );
  assert.equal(attempts, 2, 'persistent transient failure remains blocked after one retry');

  attempts = 0;
  const counted = await PagesLiveSmoke.runWithAttemptCount(async () => {
    attempts += 1;
    if (attempts < 3) throw new PagesLiveSmoke.TransientPagesSmokeError('temporary HTTP 503');
    return 'verified';
  }, { attempts: 3, delayMs: 0, sleep: async () => {} });
  assert.deepEqual(counted, { result: 'verified', attemptCount: 3 }, 'successful HTTP smoke reports the actual attempt count');
}

testPagesHttpRetryBoundary().then(() => {
  console.log('pages release governance contract OK');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
