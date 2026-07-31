'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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
  '工作台只負責安全分流', '不代替正式核可',
  '只有計算書內明確核可才是正式附件', 'ProcessStartInfo', 'UseShellExecute',
].forEach(needle => assert.ok(hubPs.includes(needle), `PowerShell hub includes ${needle}`));
assert.equal(hubPs.charCodeAt(0), 0xFEFF, 'PowerShell hub keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(hubPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'hub stays local');
assert.doesNotMatch(
  hubPs,
  /Set-Content|Out-File|Add-Content|Remove-Item|Move-Item|Copy-Item|New-Item|writeFile|mkdir|rename|rmSync|unlink|copyFile|appendFile/i,
  'hub does not mutate case files or implement another write path',
);

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
assert.equal(smokePayload.available, 3);
assert.equal(smokePayload.total, 3);
assert.deepEqual(smokePayload.entries.map(entry => entry.id), ['manager', 'viewer', 'upgrade']);
assert.ok(smokePayload.entries.every(entry => entry.available));

const launcher = read('結構工具箱/tools/啟動案件附件工作台.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-governance-hub\.ps1/);

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-governance-hub\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-governance-hub"/);

const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-governance-hub.ps1', '啟動案件附件工作台.bat',
  'attachment-governance-hub.contract.test.js',
]) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
}

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-governance-hub.ps1'), `${doc} documents attachment governance hub`);
  assert.ok(source.includes('attachment-governance-hub.contract.test.js'), `${doc} documents hub contract`);
  assert.ok(source.includes('啟動案件附件工作台.bat'), `${doc} documents hub launcher`);
}

console.log('attachment governance hub contract tests passed');
