'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Worker = require('./attachment-package-upgrade-assistant-worker.js');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const INPUT_KINDS = {
  FORMAL_PACKAGE: 'formal-package',
  UPGRADE_WORKSPACE: 'upgrade-workspace',
  PACKAGE_SOURCE: 'upgrade-package-source',
};

const legacyAssessment = {
  status: 'review',
  requiresUpgrade: true,
  currentPackage: { packageFingerprint: 'PKG-LEGACY-001' },
  workItemSummary: { total: 1, paired: 1, externalSourceRequired: 0 },
  workItems: [{
    sequence: 1, formalAttachment: '01_正式附件/舊計算書.pdf', sourceTool: '測試工具', toolVersion: 'v1.0',
    sourceStatus: 'paired', sourceFiles: ['99_內部追溯_勿附入主報告/來源.json'],
  }],
  verification: { summary: { errors: 0 }, issues: [] },
};

const readyCompletion = {
  status: 'ready',
  plan: { planFingerprint: 'UPG-PLAN-001' },
  summary: { total: 1, matched: 1, pending: 0, errors: 0, warnings: 0 },
  workItems: [{
    sequence: 1, legacyFormalAttachment: '01_正式附件/舊計算書.pdf', sourceTool: '測試工具', priorToolVersion: 'v1.0',
    formalFiles: ['新計算書.pdf'], sourceFiles: ['新來源.json'], status: 'ready', issues: [],
  }],
  issues: [],
};

const fakeAssess = {
  assessUpgrade() { return legacyAssessment; },
  formatSummary(report) { return `ASSESS:${report.status}`; },
};
const fakeCompletion = {
  checkUpgradeWorkspace() { return readyCompletion; },
  formatSummary(report) { return `COMPLETE:${report.status}`; },
};

function formalFlow() {
  return {
    INPUT_KINDS,
    detectInputKind(input) { return { kind: INPUT_KINDS.FORMAL_PACKAGE, inputDir: input, workspaceDir: '' }; },
    runUpgradeFlowWithHistory() {
      return {
        status: 'review', action: 'workspace-created', changedState: true,
        workspaceDir: 'C:\\case\\舊包-升級工作區', packageDir: '',
        workspaceResult: { planFingerprint: 'UPG-PLAN-001' },
        history: { written: true, recordPath: 'C:\\case\\歷程\\receipt.json', receiptFingerprint: 'HIS-001' },
      };
    },
    formatSummary(result) { return `FLOW:${result.action}`; },
  };
}

function workspaceFlow() {
  return {
    INPUT_KINDS,
    detectInputKind(input) { return { kind: INPUT_KINDS.UPGRADE_WORKSPACE, inputDir: input, workspaceDir: input }; },
    runUpgradeFlowWithHistory() {
      return {
        status: 'ready', action: 'package-built', changedState: true,
        workspaceDir: 'C:\\case\\工作區', packageDir: 'C:\\case\\新v3正式附件包',
        buildResult: { packageFingerprint: 'PKG-V3-001' },
        history: { written: true, recordPath: 'C:\\case\\歷程\\receipt2.json', receiptFingerprint: 'HIS-002' },
      };
    },
    formatSummary(result) { return `FLOW:${result.action}`; },
  };
}

const formalDependencies = { Flow: formalFlow(), Assess: fakeAssess, Completion: fakeCompletion };
const inspectLegacy = Worker.runAction('inspect', { input: toolsDir }, formalDependencies);
assert.equal(inspectLegacy.status, 'review');
assert.equal(inspectLegacy.canExecute, true);
assert.equal(inspectLegacy.executeAction, 'create-workspace');
assert.equal(inspectLegacy.records.length, 1);
assert.match(inspectLegacy.displayText, /ASSESS:review/);

const executeLegacy = Worker.runAction('execute', { input: toolsDir }, formalDependencies);
assert.equal(executeLegacy.executed, true);
assert.equal(executeLegacy.changedState, true);
assert.equal(executeLegacy.outputDir, 'C:\\case\\舊包-升級工作區');
assert.equal(executeLegacy.historyRecord, 'C:\\case\\歷程\\receipt.json');
assert.match(executeLegacy.displayText, /FLOW:workspace-created/);

const workspaceDependencies = { Flow: workspaceFlow(), Assess: fakeAssess, Completion: fakeCompletion };
const inspectWorkspace = Worker.runAction('inspect', { input: toolsDir, projectNo: 'P-001' }, workspaceDependencies);
assert.equal(inspectWorkspace.status, 'ready');
assert.equal(inspectWorkspace.canExecute, true);
assert.equal(inspectWorkspace.executeAction, 'build-v3-package');
assert.equal(inspectWorkspace.records[0].newFormal, '新計算書.pdf');

const executeWorkspace = Worker.runAction('execute', { input: toolsDir }, workspaceDependencies);
assert.equal(executeWorkspace.outputDir, 'C:\\case\\新v3正式附件包');
assert.equal(executeWorkspace.fingerprint, 'PKG-V3-001');
assert.match(executeWorkspace.displayText, /FLOW:package-built/);

const blockedAssess = {
  ...legacyAssessment,
  status: 'blocked',
  requiresUpgrade: false,
  verification: { summary: { errors: 1 }, issues: [{ level: 'error', code: 'tampered', message: '附件包不完整', files: [] }] },
};
const blockedDependencies = {
  Flow: formalFlow(),
  Assess: { assessUpgrade() { return blockedAssess; }, formatSummary() { return 'BLOCKED'; } },
  Completion: fakeCompletion,
};
const blocked = Worker.runAction('execute', { input: toolsDir }, blockedDependencies);
assert.equal(blocked.canExecute, false);
assert.equal(blocked.executed, false);
assert.equal(blocked.changedState, false);
assert.match(blocked.displayText, /未執行任何新建動作/);

const smoke = Worker.runAction('smoke');
assert.equal(smoke.status, 'ready');
assert.equal(smoke.changedState, false);
assert.throws(() => Worker.runAction('overwrite', { input: toolsDir }), /不支援的升級助手動作/);
assert.throws(() => Worker.runAction('inspect', { input: '' }), /尚未選擇正式附件包或升級工作區/);

const cli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-upgrade-assistant-worker.js'), '--action', 'smoke'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.equal(JSON.parse(cli.stdout).status, 'ready');

const badCli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-upgrade-assistant-worker.js'), '--action', 'unknown'], { encoding: 'utf8' });
assert.equal(badCli.status, 3);
assert.equal(JSON.parse(badCli.stdout).status, 'error');

const workerSource = read('結構工具箱/tools/attachment-package-upgrade-assistant-worker.js');
assert.match(workerSource, /assess\.assessUpgrade\(detected\.inputDir\)/, 'inspect uses the read-only legacy assessment');
assert.match(workerSource, /completion\.checkUpgradeWorkspace/, 'inspect uses the read-only workspace completion gate');
assert.match(workerSource, /flow\.runUpgradeFlowWithHistory/, 'execute reuses the governed unified flow');
assert.doesNotMatch(workerSource, /writeFile|mkdir|rename|copyFile|appendFile/, 'assistant worker does not implement a second write path');

const assistantPs = read('結構工具箱/tools/attachment-package-upgrade-assistant.ps1');
[
  'System.Windows.Forms', 'FolderBrowserDialog', 'attachment-package-upgrade-assistant-worker.js',
  "ValidateSet('smoke', 'inspect', 'execute')", '1. 唯讀檢查目前階段', '我確認只新建產物，不改寫舊包',
  '2. 尚未取得可執行動作', '檢查本身不留下歷程收據', 'workerExitCode',
  "[string]$InitialPath = ''",
].forEach(needle => assert.ok(assistantPs.includes(needle), `PowerShell assistant includes ${needle}`));
assert.equal(assistantPs.charCodeAt(0), 0xFEFF, 'PowerShell assistant keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(assistantPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'assistant does not send case data over network');
assert.doesNotMatch(assistantPs, /Set-Content|Out-File|Add-Content|Remove-Item|Move-Item|Copy-Item|New-Item/i, 'GUI does not implement direct case mutation');
assert.match(assistantPs, /Clear-ExecutionGrant\s+Set-UiBusy \$true\s+try \{\s+\$response = Invoke-UpgradeAssistantWorker -Action inspect/s, 'every inspect clears the prior execution grant');
assert.match(assistantPs, /if \(\$InitialPath\.Trim\(\)\) \{ \$script:InputPath\.Text = \$InitialPath\.Trim\(\) \}/, 'assistant only pre-fills the upgrade input path');

const launcher = read('結構工具箱/tools/啟動舊版附件升級助手.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-package-upgrade-assistant\.ps1/);

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-package-upgrade-assistant\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-package-upgrade-assistant"/);

const pagesBuilder = read('結構工具箱/tools/build-pages-artifact.js');
const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-package-upgrade-assistant-worker.js', 'attachment-package-upgrade-assistant.ps1',
  '啟動舊版附件升級助手.bat', 'attachment-package-upgrade-assistant.contract.test.js',
]) assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
assert.ok(pagesBuilder.includes('結構工具箱/tools/attachment-package-upgrade-assistant-worker.js'), 'Pages artifact builder excludes assistant worker');

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-package-upgrade-assistant-worker.js'), `${doc} documents assistant worker`);
  assert.ok(source.includes('attachment-package-upgrade-assistant.contract.test.js'), `${doc} documents assistant contract`);
  assert.ok(source.includes('啟動舊版附件升級助手.bat'), `${doc} documents assistant launcher`);
}

console.log('attachment package upgrade assistant contract tests passed');
