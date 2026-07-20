const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
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
const readme = readText('README.md');
const preflightTools = readText('preflight-tools.ps1');
const context = readText('CONTEXT.md');
const adr = readText('docs/adr/0001-page-only-report-readiness.md');
const pagesWorkflow = readText('.github/workflows/pages-deploy.yml');
const pagesSmoke = readText('結構工具箱/tools/pages-live-smoke.js');
const pagesBrowserSmoke = readText('結構工具箱/tools/pages-live-browser-smoke.js');
const pagesBrowserRunner = readText('結構工具箱/tools/run-pages-browser-smoke.sh');
const artifactBuilderPath = path.join(repoRoot, '結構工具箱', 'tools', 'build-pages-artifact.js');
const artifactBuilder = readText('結構工具箱/tools/build-pages-artifact.js');
const deploymentManifestBuilderPath = path.join(repoRoot, '結構工具箱', 'tools', 'build-pages-deployment-manifest.js');
const deploymentManifestBuilder = readText('結構工具箱/tools/build-pages-deployment-manifest.js');
const artifactSmoke = readText('run-pages-artifact-smoke.ps1');
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
assert.ok(
  adr.includes('page diagnostics') && adr.includes('must not be copied into calculation books') && adr.includes('DRAFT／非正式附件'),
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
    for (const privatePath of ['README.md', 'secret.test.js', 'dev_tools/secret.html', '結構工具箱/tools/build-pages-artifact.js', 'ignored.html', 'deleted.html']) {
      assert.equal(fs.existsSync(path.join(fixtureSite, ...privatePath.split('/'))), false, `artifact builder excludes ${privatePath}`);
    }
  } finally {
    fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(fixtureSite, { recursive: true, force: true });
  }
}

{
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-deployment-manifest-contract-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'index.html'), '<!doctype html><title>fixture</title>', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'assets', 'app.js'), 'console.log("fixture");', 'utf8');
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
    assert.equal(first.fileCount, 2, 'deployment manifest excludes hidden files and itself from the published tree digest');
    assert.equal(first.artifactDigest, second.artifactDigest, 'deployment manifest tree digest is deterministic across regeneration');
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'pages-deployment.json'), 'utf8')).commitSha, 'a'.repeat(40), 'deployment manifest is written to the staged root');
    assert.equal(first.sourceDirty, false, 'deployment manifest records clean or dirty source state explicitly');
    fs.writeFileSync(path.join(fixtureRoot, 'assets', 'app.js'), 'console.log("changed");', 'utf8');
    const changed = buildDeploymentManifest(options);
    assert.notEqual(first.artifactDigest, changed.artifactDigest, 'deployment manifest tree digest changes with published content');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

assert.ok(pagesWorkflow.includes('node "結構工具箱/tools/build-pages-artifact.js" --repo-root "." --site-root "_site"'), 'Pages workflow stages through the shared Git-inventory builder');
assert.equal(pagesWorkflow.includes('rsync -a'), false, 'Pages workflow does not keep a second rsync exclusion policy');
assert.ok(artifactBuilder.includes("'output'") && artifactBuilder.includes("'.md'") && artifactBuilder.includes("'.ps1'"), 'shared artifact builder excludes generated output, docs, and scripts');
assert.ok(artifactBuilder.includes('attachment-package-check.js') && artifactBuilder.includes('rendered-delivery-evidence.js'), 'shared artifact builder excludes delivery governance helpers');
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
assert.ok(pagesWorkflow.includes('PAGES_BROWSER_SMOKE_ATTEMPTS: 2') && pagesWorkflow.includes('PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS: 5'), 'Pages live browser smoke allows one bounded transient retry');
assert.ok(pagesBrowserRunner.includes("@playwright/cli@0.1.17") && pagesBrowserRunner.includes('install-browser chromium'), 'Pages browser runner installs the pinned Chromium runtime');
assert.ok(pagesBrowserRunner.includes("terser@5.49.0") && pagesBrowserRunner.includes('pages-live-browser-smoke.js'), 'Pages browser runner invokes the reusable browser smoke source');
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
assert.ok(pagesSmoke.includes('結構工具箱/tools/pages-live-browser-smoke.js'), 'Pages smoke blocks browser smoke source publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/run-pages-browser-smoke.sh'), 'Pages smoke blocks browser smoke runner publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/build-pages-artifact.js'), 'Pages smoke blocks shared artifact builder publication');
assert.ok(pagesSmoke.includes('結構工具箱/tools/build-pages-deployment-manifest.js'), 'Pages smoke blocks deployment manifest builder publication');
assert.ok(pagesSmoke.includes("liveUrl(base, 'pages-deployment.json')") && pagesSmoke.includes('deployed Pages commit matches the requested source commit'), 'Pages smoke validates the public deployment manifest and expected commit');
assert.ok(pagesSmoke.includes('deployed Pages runId matches the current workflow run') && pagesSmoke.includes('sha256-tree-v1'), 'Pages smoke validates workflow run and tree digest metadata');
assert.ok(pagesSmoke.includes('deployed Pages manifest must come from a clean source checkout'), 'Pages smoke validates clean deployment provenance');
assert.ok(pagesSmoke.includes("manifest.fileCount > 0") && !pagesSmoke.includes('manifest.fileCount >= 300'), 'Pages smoke does not confuse a dirty local file count with the canonical clean artifact');
assert.ok(readme.includes('sourceDirty: false') && readme.includes('sourceDirty: true'), 'README explains formal clean and local dirty provenance');
assert.ok(toolBoundaries.includes('sourceDirty: false') && toolBoundaries.includes('sourceDirty: true'), 'tool boundaries explain clean deployment provenance');
assert.ok(staging.includes('git status --porcelain --untracked-files=all') && staging.includes('sourceDirty: false'), 'staging guide documents the clean checkout requirement');
assert.ok(deploymentManifestBuilder.includes("algorithm: 'sha256-tree-v1'") && deploymentManifestBuilder.includes("entry.name.startsWith('.')"), 'deployment manifest builder hashes the published non-hidden tree');
assert.ok(deploymentManifestBuilder.includes("relativePath === MANIFEST_FILE") && deploymentManifestBuilder.includes("files.sort"), 'deployment manifest builder excludes itself and uses stable path ordering');

assert.ok(pagesBrowserSmoke.includes("{ key: 'desktop', width: 1280, height: 800 }") && pagesBrowserSmoke.includes("{ key: 'mobile', width: 390, height: 844 }"), 'Pages browser smoke covers desktop and mobile viewports');
assert.ok(pagesBrowserSmoke.includes("sessionStorage.getItem(storageKey)") && pagesBrowserSmoke.includes("sessionStorage.setItem(storageKey, candidateBase)"), 'Pages browser smoke preserves the deployment base across bounded retries');
assert.ok(pagesBrowserSmoke.indexOf("await page.goto(`${base}%E7%B5%90%E6%A7%8B%E5%B7%A5%E5%85%B7%E7%AE%B1/`") < pagesBrowserSmoke.indexOf("fetch('assets/home/home.js'"), 'Pages browser smoke returns to the toolbox inventory before every retry');
assert.ok(pagesBrowserSmoke.includes('routes.length < 40') && pagesBrowserSmoke.includes('new Set(routes).size'), 'Pages browser smoke validates the homepage route inventory');
assert.ok(pagesBrowserSmoke.includes("page.on('pageerror'") && pagesBrowserSmoke.includes("page.on('requestfailed'") && pagesBrowserSmoke.includes("page.on('response'"), 'Pages browser smoke captures runtime and network failures');
assert.ok(pagesBrowserSmoke.includes('horizontal overflow') && pagesBrowserSmoke.includes("route === '/rc-pile'") && pagesBrowserSmoke.includes("route === '/wind-cc'") && pagesBrowserSmoke.includes("route === '/stone-fixing'"), 'Pages browser smoke covers overflow and high-risk route regressions');
assert.ok(pagesBrowserSmoke.includes('localArtifactPreview') && pagesBrowserSmoke.includes('127.0.0.1:8765/status'), 'Pages browser smoke narrows local artifact service exceptions');
assert.ok(toolBoundaries.includes('只有正式 live') && toolBoundaries.includes('HTTP 5xx'), 'tool boundaries documents the live-only transient retry boundary');
assert.ok(staging.includes('暫態網路錯誤最多重試一次'), 'staging guide documents the bounded live retry rule');

assert.ok(artifactSmoke.includes('GetTempPath'), 'local artifact smoke stages in temp');
assert.ok(artifactSmoke.includes('$ArtifactBuilder') && artifactSmoke.includes('--repo-root $RepoRoot --site-root $SiteRoot'), 'local artifact smoke uses the shared Git-inventory builder');
assert.equal(artifactSmoke.includes('robocopy'), false, 'local artifact smoke does not keep a second robocopy exclusion policy');
assert.ok(artifactSmoke.includes('pages-live-smoke.js'), 'local artifact smoke reuses Pages smoke');
assert.ok(artifactSmoke.includes('pages-live-browser-smoke.js'), 'local artifact smoke reuses Pages browser smoke');
assert.ok(artifactSmoke.includes('$DeploymentManifestBuilder') && artifactSmoke.includes('--expected-commit-sha $CommitSha'), 'local artifact smoke builds and verifies deployment provenance');
assert.ok(artifactSmoke.includes('$SourceDirty') && artifactSmoke.includes('--source-dirty $SourceDirty.ToString().ToLowerInvariant()'), 'local artifact smoke records dirty source state honestly');
assert.ok(artifactSmoke.includes("@playwright/cli@0.1.17") && artifactSmoke.includes("terser@5.49.0"), 'local artifact smoke pins the browser CLI and minifier');
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
assert.ok(String(reportReadinessStatus.compactSummary || '').includes('優先建議報告閱讀狀態') && String(reportReadinessStatus.compactSummary || '').includes('不會寫入計算書、列印或 PDF'), 'report readiness keeps compact page-only summary');
assert.ok(reportReadinessStatus.details.join(' ').includes('正式計算書可讀文字抽檢'), 'report readiness exposes report text coverage');
assert.ok(reportReadinessStatus.details.join(' ').includes('瀏覽器 smoke 證據'), 'report readiness exposes report text runtime evidence');
assert.ok(reportReadinessStatus.details.join(' ').includes('正式放行實際交付物渲染佐證'), 'report readiness exposes actual rendered delivery evidence');

console.log('pages release governance contract OK');
