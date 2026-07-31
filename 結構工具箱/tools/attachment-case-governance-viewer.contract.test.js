'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Worker = require('./attachment-case-governance-viewer-worker.js');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const fakeRootReport = {
  status: 'review',
  caseFingerprint: 'CAS-00112233445566778899AABB',
  discovery: {
    caseRootName: 'A案', status: 'resolved', selectedPackage: '正式附件包',
    selectedHistory: '附件升級內部歷程_勿附入主報告', selectedChain: '附件升級可信基準_勿附入主報告',
  },
  governance: {
    package: { status: 'ready', errors: 0, warnings: 0 },
    history: { status: 'review', pendingAdditions: 2 },
    chain: { status: 'review', baselines: 1, links: 0 },
    issues: [{ level: 'warn', component: 'trusted-baseline-chain', code: 'pending-additions', message: '尚有合法新增收據。' }],
  },
  issues: [],
  nextActions: [{ code: 'advance-trusted-baseline', message: '複核新增收據後前進可信基準。' }],
};

const fakeRoot = {
  inspectCaseRoot() { return fakeRootReport; },
  formatSummary(result) { return `ROOT:${result.status}`; },
};

const fakePortfolioReport = {
  status: 'blocked',
  portfolioFingerprint: 'POR-00112233445566778899AABB',
  discovery: { parentName: '案件上層', caseCount: 2, ignoredDirectoryCount: 1 },
  summary: { readyCases: 1, reviewCases: 0, blockedCases: 1 },
  triage: {
    actionableCaseCount: 1,
    groupCount: 1,
    groups: [{ priority: 'P0', label: '正式附件包需修復', caseCount: 1, cases: ['B案'], portfolioIssueCodes: [] }],
  },
  cases: [
    { caseName: 'A案', status: 'ready', packageStatus: 'ready', chainStatus: 'ready', pendingAdditions: 0, issueCodes: [], nextActionCodes: ['internal-archive-review'] },
    { caseName: 'B案', status: 'blocked', packageStatus: 'blocked', chainStatus: 'not-checked', pendingAdditions: 0, issueCodes: ['manifest-mismatch'], nextActionCodes: ['repair-formal-package'] },
  ],
  issues: [],
  nextActions: [{ code: 'repair-blocked-cases', message: '先處理 1 個 blocked 案件。', cases: ['B案'] }],
};

const fakePortfolio = {
  inspectPortfolio() { return fakePortfolioReport; },
  normalizeViewOptions(options = {}) { return { onlyActionable: options.onlyActionable === true, priority: String(options.priority || '') }; },
  hasViewFilter(options = {}) { return options.onlyActionable === true || Boolean(options.priority); },
  buildFilteredView(result) { return { cases: result.cases.filter(item => item.status !== 'ready') }; },
  formatSummary(result, options) { return `PORTFOLIO:${result.status}:${options.onlyActionable ? 'filtered' : 'all'}`; },
};

const dependencies = { Root: fakeRoot, Portfolio: fakePortfolio };

const single = Worker.runAction('case', { input: toolsDir }, dependencies);
assert.equal(single.status, 'review');
assert.equal(single.readOnly, true);
assert.equal(single.records.length, 4);
assert.equal(single.records[0].name, 'A案');
assert.equal(single.records[2].pending, 2);
assert.match(single.displayText, /ROOT:review/);

const portfolio = Worker.runAction('portfolio', { input: toolsDir, onlyActionable: true }, dependencies);
assert.equal(portfolio.status, 'blocked');
assert.equal(portfolio.records.length, 1);
assert.equal(portfolio.records[0].name, 'B案');
assert.equal(portfolio.records[0].priority, 'P0');
assert.equal(portfolio.counts.cases, 2);
assert.match(portfolio.displayText, /PORTFOLIO:blocked:filtered/);

const smoke = Worker.runAction('smoke');
assert.equal(smoke.status, 'ready');
assert.equal(smoke.readOnly, true);
assert.equal(Worker.exitCodeForStatus(smoke.status), 0);
assert.throws(() => Worker.runAction('write', { input: toolsDir }), /不支援的檢視器動作/);
assert.throws(() => Worker.runAction('case', { input: '' }), /尚未選擇資料夾/);

const cli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-case-governance-viewer-worker.js'), '--action', 'smoke'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.equal(JSON.parse(cli.stdout).readOnly, true);

const badCli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-case-governance-viewer-worker.js'), '--action', 'unknown'], { encoding: 'utf8' });
assert.equal(badCli.status, 3);
assert.equal(JSON.parse(badCli.stdout).status, 'error');

const workerSource = read('結構工具箱/tools/attachment-case-governance-viewer-worker.js');
assert.doesNotMatch(workerSource, /writeFile|mkdir|rename|rmSync|unlink|copyFile|appendFile/, 'viewer worker stays read-only');
assert.doesNotMatch(workerSource, /https?:\/\/|fetch\(|HttpClient|Invoke-WebRequest/i, 'viewer worker stays local');

const viewerPs = read('結構工具箱/tools/attachment-case-governance-viewer.ps1');
[
  'System.Windows.Forms', 'FolderBrowserDialog', 'attachment-case-governance-viewer-worker.js',
  "ValidateSet('smoke', 'case', 'portfolio')", '單一案件根目錄', '多案件上層資料夾',
  '只顯示待處理案件', '本畫面不核可、不修改、也不寫入案件資料', 'workerExitCode',
].forEach(needle => assert.ok(viewerPs.includes(needle), `PowerShell viewer includes ${needle}`));
assert.equal(viewerPs.charCodeAt(0), 0xFEFF, 'PowerShell viewer keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(viewerPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'viewer does not send case data over network');
assert.doesNotMatch(viewerPs, /Set-Content|Out-File|Add-Content|Remove-Item|Move-Item|Copy-Item|New-Item/i, 'viewer does not mutate case files');
assert.doesNotMatch(viewerPs, /-Priority\s+\(if\s*\(/, 'PowerShell 5.1 does not receive an inline if expression as an argument');
assert.match(viewerPs, /\$priority = if \(\$script:RadioPortfolio\.Checked\)/, 'priority is resolved before invoking the worker');

const launcher = read('結構工具箱/tools/啟動案件附件治理檢視器.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-case-governance-viewer\.ps1/);

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-case-governance-viewer\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-case-governance-viewer"/);

const pagesBuilder = read('結構工具箱/tools/build-pages-artifact.js');
const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-case-governance-viewer-worker.js', 'attachment-case-governance-viewer.ps1',
  '啟動案件附件治理檢視器.bat', 'attachment-case-governance-viewer.contract.test.js',
]) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
}
assert.ok(pagesBuilder.includes('結構工具箱/tools/attachment-case-governance-viewer-worker.js'), 'Pages artifact builder excludes viewer worker');

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-case-governance-viewer-worker.js'), `${doc} documents viewer worker`);
  assert.ok(source.includes('attachment-case-governance-viewer.contract.test.js'), `${doc} documents viewer contract`);
  assert.ok(source.includes('啟動案件附件治理檢視器.bat'), `${doc} documents viewer launcher`);
}

console.log('attachment case governance viewer contract tests passed');
