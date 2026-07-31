'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Worker = require('./attachment-governance-hub-worker.js');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const hubPath = path.join(toolsDir, 'attachment-governance-hub.ps1');
const hubPs = fs.readFileSync(hubPath, 'utf8');
[
  'System.Windows.Forms', '案件附件工作台', '選擇原則：新案組包',
  '正式附件包管理器', '案件附件治理檢視器', '舊版附件升級助手',
  '可新建產物', '永遠唯讀', '另建升級產物',
  '唯讀路徑辨識', '不代替正式核可',
  '只有計算書內明確核可才是正式附件', 'ProcessStartInfo', 'UseShellExecute',
  '共用起始資料夾（可拖放）', '選擇並辨識…', '唯讀辨識建議', 'FolderBrowserDialog',
  'AllowDrop', 'DataFormats]::FileDrop', 'DragDropEffects]::Copy', 'DragDropEffects]::None',
  'Set-SharedPathAndRecommend', '一次只能拖入一個資料夾',
  '[string]$InitialPath', 'ValueFromRemainingArguments', '[string[]]$AdditionalPath',
  '$script:StartupPaths', '啟動時一次只能帶入一個資料夾', 'Add_Shown',
  '-InitialPath', '-InitialMode', '-AutoInspect', 'attachment-governance-hub-worker.js',
  '建議｜開啟並唯讀檢查', '已帶入建議模式並執行唯讀檢查',
].forEach(needle => assert.ok(hubPs.includes(needle), `PowerShell hub includes ${needle}`));
assert.equal(hubPs.charCodeAt(0), 0xFEFF, 'PowerShell hub keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(hubPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'hub stays local');
assert.doesNotMatch(
  hubPs,
  /Set-Content|Out-File|Add-Content|Remove-Item|Move-Item|Copy-Item|New-Item|writeFile|mkdir|rename|rmSync|unlink|copyFile|appendFile/i,
  'hub does not mutate case files or implement another write path',
);
assert.doesNotMatch(hubPs, /Invoke-AttachmentWorker|Invoke-GovernanceViewerWorker|Invoke-UpgradeAssistantWorker/, 'hub never invokes a case core directly');
assert.doesNotMatch(hubPs, /-Action\s+(?:check|build|verify|case|portfolio|inspect|execute)/, 'hub never invokes a child worker action directly');
assert.match(hubPs, /\$script:AdvicePath -eq \$initialPath[\s\S]*?\$script:Advice\.recommendedTool -eq \$Target\.Id[\s\S]*?\$arguments \+= ' -AutoInspect'/, 'one-click read-only inspection requires a current matched recommendation and an explicit tool click');
assert.doesNotMatch(hubPs, /-AutoInspect[\s\S]{0,300}BtnBuild|-AutoInspect[\s\S]{0,300}BtnExecute/, 'hub does not expose a one-click write path');
const pathHandoff = hubPs.match(/function Set-SharedPathAndRecommend \{[\s\S]*?(?=\nfunction Select-SharedFolder)/)?.[0] || '';
assert.match(pathHandoff, /Test-Path[\s\S]*?PathType Container[\s\S]*?\$script:SharedPath\.Text[\s\S]*?Show-Recommendation/, 'selected or dropped path is validated and sent only to the read-only advisor');
assert.doesNotMatch(pathHandoff, /Start-GovernedTool|ProcessStartInfo|-AutoInspect/, 'automatic advice never opens or runs a child tool');
assert.match(hubPs, /ShowDialog\(\) -eq \[System\.Windows\.Forms\.DialogResult\]::OK[\s\S]*?Set-SharedPathAndRecommend -SelectedPath \$dialog\.SelectedPath/, 'folder selection immediately requests read-only advice');
assert.match(hubPs, /\$folderDragDrop = \{[\s\S]*?\$paths\.Count -ne 1[\s\S]*?Set-SharedPathAndRecommend -SelectedPath/, 'drop accepts exactly one folder and requests the same read-only advice');
const startupHandoff = hubPs.match(/\$script:MainForm\.Add_Shown\(\{[\s\S]*?(?=\n\}\)\n\n\[void\]\$script:MainForm\.ShowDialog)/)?.[0] || '';
assert.match(startupHandoff, /StartupPaths\.Count -ne 1[\s\S]*?Set-SharedPathAndRecommend -SelectedPath/, 'startup arguments accept exactly one path and request the same read-only advice');
assert.doesNotMatch(startupHandoff, /Start-GovernedTool|ProcessStartInfo|-AutoInspect/, 'startup path advice never opens or runs a child tool');

const workerSource = read('結構工具箱/tools/attachment-governance-hub-worker.js');
assert.doesNotMatch(workerSource, /writeFile|mkdir|rename|rmSync|unlink|copyFile|appendFile/, 'advisor worker stays read-only');
assert.doesNotMatch(workerSource, /https?:\/\/|fetch\(|HttpClient|Invoke-WebRequest/i, 'advisor worker stays local');
assert.doesNotMatch(workerSource, /runUpgradeFlow|createUpgradeWorkspace|buildPackage|advanceBaseline|writeSnapshot/, 'advisor cannot call a mutating core');

const baseDeps = {
  Flow: {
    INPUT_KINDS: { FORMAL_PACKAGE: 'formal-package', UPGRADE_WORKSPACE: 'upgrade-workspace', PACKAGE_SOURCE: 'upgrade-package-source' },
    detectInputKind() { throw new Error('not a governed package'); },
  },
  Assess: { assessUpgrade() { throw new Error('not assessed'); } },
  Root: { scanCaseRoot() { return { candidates: { packages: [], histories: [], chains: [] } }; } },
  Portfolio: { scanPortfolio() { return { cases: [] }; } },
  Checker: { checkPackage() { return { status: 'ready', summary: { attachments: 0, unsupported: 0, unsafeSourceEntries: 0 } }; } },
};
function deps(overrides = {}) { return { ...baseDeps, ...overrides }; }

const workspaceAdvice = Worker.advisePath(toolsDir, deps({
  Flow: { ...baseDeps.Flow, detectInputKind() { return { kind: 'upgrade-workspace' }; } },
}));
assert.equal(workspaceAdvice.recommendedTool, 'upgrade');
assert.equal(workspaceAdvice.changedState, false);
assert.equal(workspaceAdvice.autoLaunched, false);

const legacyAdvice = Worker.advisePath(toolsDir, deps({
  Flow: { ...baseDeps.Flow, detectInputKind() { return { kind: 'formal-package' }; } },
  Assess: { assessUpgrade() { return { requiresUpgrade: true, status: 'review', currentPackage: { schemaVersion: 2 } }; } },
}));
assert.equal(legacyAdvice.recommendedTool, 'upgrade');

const currentAdvice = Worker.advisePath(toolsDir, deps({
  Flow: { ...baseDeps.Flow, detectInputKind() { return { kind: 'formal-package' }; } },
  Assess: { assessUpgrade() { return { requiresUpgrade: false, status: 'ready', currentPackage: { schemaVersion: 3 } }; } },
}));
assert.equal(currentAdvice.recommendedTool, 'manager');
assert.equal(currentAdvice.recommendedMode, 'verify');

const caseAdvice = Worker.advisePath(toolsDir, deps({
  Root: { scanCaseRoot() { return { candidates: { packages: [{}], histories: [], chains: [] } }; } },
}));
assert.equal(caseAdvice.recommendedTool, 'viewer');
assert.equal(caseAdvice.recommendedMode, 'case');

const portfolioAdvice = Worker.advisePath(toolsDir, deps({
  Portfolio: { scanPortfolio() { return { cases: [{ name: 'A案' }] }; } },
}));
assert.equal(portfolioAdvice.recommendedMode, 'portfolio');

const sourceAdvice = Worker.advisePath(toolsDir, deps({
  Checker: { checkPackage() { return { status: 'review', summary: { attachments: 2, unsupported: 0, unsafeSourceEntries: 0 }, attachments: [{ type: 'pdf' }, { type: 'json', sourceTool: 'RC 梁', toolVersion: 'v3.1', fingerprints: ['CF-1234ABCD5678EF90'] }] }; } },
}));
assert.equal(sourceAdvice.recommendedTool, 'manager');
assert.equal(sourceAdvice.recommendedMode, 'source');
const genericJsonAdvice = Worker.advisePath(toolsDir, deps({
  Checker: { checkPackage() { return { status: 'blocked', summary: { attachments: 3, unsupported: 0, unsafeSourceEntries: 0 }, attachments: [{ type: 'json' }, { type: 'json' }, { type: 'json' }] }; } },
}));
assert.equal(genericJsonAdvice.outcome, 'unknown', 'generic JSON folders are not mistaken for calculation sources');
const unsupportedOnlyAdvice = Worker.advisePath(toolsDir, deps({
  Checker: { checkPackage() { return { status: 'review', summary: { attachments: 0, unsupported: 2, unsafeSourceEntries: 0 }, attachments: [] }; } },
}));
assert.equal(unsupportedOnlyAdvice.outcome, 'unknown', 'unsupported files alone do not create a package-manager recommendation');
assert.equal(Worker.hasAttachmentSourceSignal({ type: 'pdf' }), true);
assert.equal(Worker.hasAttachmentSourceSignal({ type: 'json', sourceTool: 'RC 梁', toolVersion: 'v3.1' }), true);
assert.equal(Worker.hasAttachmentSourceSignal({ type: 'json' }), false);
assert.equal(Worker.advisePath(toolsDir, baseDeps).outcome, 'unknown');
assert.equal(Worker.runAction('smoke').readOnly, true);
assert.throws(() => Worker.runAction('execute', { input: toolsDir }), /不支援的工作台動作/);

const workerCli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-governance-hub-worker.js'), '--action', 'smoke'], { encoding: 'utf8' });
assert.equal(workerCli.status, 0, workerCli.stderr || workerCli.stdout);
assert.equal(JSON.parse(workerCli.stdout).autoLaunched, false);

const targetLaunchers = [
  '啟動正式附件包管理器.bat',
  '啟動案件附件治理檢視器.bat',
  '啟動舊版附件升級助手.bat',
];
for (const launcher of targetLaunchers) {
  assert.ok(hubPs.includes(launcher), `hub routes to existing launcher ${launcher}`);
  assert.ok(fs.existsSync(path.join(toolsDir, launcher)), `existing launcher is present: ${launcher}`);
}
assert.equal((hubPs.match(/\bLauncher\s*=\s*'/g) || []).length, 3, 'hub exposes exactly the three governed launcher definitions');
assert.equal((hubPs.match(/\bScript\s*=\s*'/g) || []).length, 3, 'hub passes InitialPath only to the three governed PowerShell entrypoints');
for (const childScript of [
  'attachment-package-manager.ps1',
  'attachment-case-governance-viewer.ps1',
  'attachment-package-upgrade-assistant.ps1',
]) assert.ok(hubPs.includes(childScript), `hub routes to governed script ${childScript}`);

const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const smoke = childProcess.spawnSync(
  powershell,
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', hubPath, '-Smoke'],
  { encoding: 'utf8' },
);
assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
const smokePayload = JSON.parse(smoke.stdout.replace(/^\uFEFF/, '').trim());
assert.equal(smokePayload.status, 'ready');
assert.equal(smokePayload.windowsFormsLoaded, true);
assert.equal(smokePayload.readOnlyHub, true);
assert.equal(smokePayload.advisorAvailable, true);
assert.equal(smokePayload.available, 3);
assert.equal(smokePayload.total, 3);
assert.deepEqual(smokePayload.entries.map(entry => entry.id), ['manager', 'viewer', 'upgrade']);
assert.ok(smokePayload.entries.every(entry => entry.available));

const launcher = read('結構工具箱/tools/啟動案件附件工作台.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-governance-hub\.ps1/);
assert.match(launcher, /if\s+"%~1"==""/i, 'launcher keeps ordinary no-path startup');
assert.match(launcher, /-InitialPath\s+%\*/i, 'launcher forwards dropped arguments for closed validation in the hub');

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-governance-hub\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-governance-hub"/);

const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-governance-hub-worker.js', 'attachment-governance-hub.ps1', '啟動案件附件工作台.bat',
  'attachment-governance-hub.contract.test.js',
]) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
}

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-governance-hub-worker.js'), `${doc} documents attachment governance advisor`);
  assert.ok(source.includes('attachment-governance-hub.ps1'), `${doc} documents attachment governance hub`);
  assert.ok(source.includes('attachment-governance-hub.contract.test.js'), `${doc} documents hub contract`);
  assert.ok(source.includes('啟動案件附件工作台.bat'), `${doc} documents hub launcher`);
}

console.log('attachment governance hub contract tests passed');
