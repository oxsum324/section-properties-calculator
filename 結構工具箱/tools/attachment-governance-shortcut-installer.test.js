'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');
const installerPath = path.join(toolsDir, 'install-attachment-governance-shortcuts.ps1');
const targetPath = path.join(repoRoot, '啟動案件附件工作台.bat');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

function runPowerShell(args, options = {}) {
  return childProcess.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

function runInstaller(desktopPath, sendToPath, programsPath) {
  return runPowerShell([
    '-File', installerPath,
    '-DesktopPath', desktopPath,
    '-SendToPath', sendToPath,
    '-ProgramsPath', programsPath,
    '-Json',
  ]);
}

function runChecker(desktopPath, sendToPath, programsPath) {
  return runPowerShell([
    '-File', installerPath,
    '-DesktopPath', desktopPath,
    '-SendToPath', sendToPath,
    '-ProgramsPath', programsPath,
    '-Check',
    '-Json',
  ]);
}

function runRemover(desktopPath, sendToPath, programsPath) {
  return runPowerShell([
    '-File', installerPath,
    '-DesktopPath', desktopPath,
    '-SendToPath', sendToPath,
    '-ProgramsPath', programsPath,
    '-Remove',
    '-Json',
  ]);
}

function inspectShortcuts(desktopPath, sendToPath, programsPath) {
  const command = [
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    "$shell = New-Object -ComObject WScript.Shell",
    "$paths = @($env:TEST_DESKTOP_LINK, $env:TEST_SENDTO_LINK, $env:TEST_PROGRAMS_LINK)",
    "$items = foreach ($path in $paths) { $link = $shell.CreateShortcut($path); [pscustomobject]@{ Path = $path; TargetPath = $link.TargetPath; WorkingDirectory = $link.WorkingDirectory; Arguments = $link.Arguments; Description = $link.Description } }",
    '$items | ConvertTo-Json -Depth 3 -Compress',
  ].join('; ');
  const result = runPowerShell(['-Command', command], {
    env: {
      ...process.env,
      TEST_DESKTOP_LINK: path.join(desktopPath, '案件附件工作台.lnk'),
      TEST_SENDTO_LINK: path.join(sendToPath, '以附件工作台檢查.lnk'),
      TEST_PROGRAMS_LINK: path.join(programsPath, '案件附件工作台.lnk'),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

const installerSource = fs.readFileSync(installerPath, 'utf8');
assert.equal(installerSource.charCodeAt(0), 0xFEFF, 'installer keeps UTF-8 BOM for Windows PowerShell 5.1');
[
  'WScript.Shell', '啟動案件附件工作台.bat', '案件附件工作台.lnk', '以附件工作台檢查.lnk', "GetFolderPath('Programs')", 'start-menu',
  'Test-ShortcutManaged', 'Test-ShortcutCurrent', 'Test-ShortcutRemovable', 'Get-ShortcutInspection', 'Assert-ShortcutInstallable', 'Remove-ManagedShortcut', "operation = 'check'", "operation = 'remove'", "Arguments = ''", 'Move-Item', '已保留原檔',
].forEach(needle => assert.ok(installerSource.includes(needle), `installer includes ${needle}`));
assert.doesNotMatch(installerSource, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'installer stays local');

const launcher = read('安裝案件附件工作台捷徑.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-File/i);
assert.match(launcher, /install-attachment-governance-shortcuts\.ps1/);
assert.match(launcher, /%\*/i, 'installer launcher forwards optional verification paths');
assert.ok(launcher.includes('\r\n'), 'Windows batch launcher uses CRLF line endings');
assert.equal(launcher.replace(/\r\n/g, '').includes('\n'), false, 'Windows batch launcher has no bare LF line endings');

const checker = read('檢查案件附件工作台捷徑.bat');
assert.match(checker, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-File/i);
assert.match(checker, /install-attachment-governance-shortcuts\.ps1/);
assert.match(checker, /-Check\s+%\*/i, 'checker fixes the read-only inspection mode and forwards optional paths');
assert.ok(checker.includes('\r\n'), 'Windows checker uses CRLF line endings');
assert.equal(checker.replace(/\r\n/g, '').includes('\n'), false, 'Windows checker has no bare LF line endings');

const remover = read('移除案件附件工作台捷徑.bat');
assert.match(remover, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-File/i);
assert.match(remover, /install-attachment-governance-shortcuts\.ps1/);
assert.match(remover, /-Remove\s+%\*/i, 'remover fixes the safe removal mode and forwards optional paths');
assert.ok(remover.includes('\r\n'), 'Windows remover uses CRLF line endings');
assert.equal(remover.replace(/\r\n/g, '').includes('\n'), false, 'Windows remover has no bare LF line endings');

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-governance-shortcut-installer\.test\.js/);
assert.match(preflight, /key = "attachment-governance-shortcut-installer"/);

const privateFiles = [
  '安裝案件附件工作台捷徑.bat',
  '檢查案件附件工作台捷徑.bat',
  '移除案件附件工作台捷徑.bat',
  '結構工具箱/tools/install-attachment-governance-shortcuts.ps1',
  '結構工具箱/tools/attachment-governance-shortcut-installer.test.js',
];
const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
const pagesBuilder = require('./build-pages-artifact.js');
for (const privateFile of privateFiles) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
  assert.deepEqual(
    pagesBuilder.classifyPublishedPath(privateFile),
    { publish: false, reason: 'private-tooling' },
    `Pages artifact builder explicitly excludes ${privateFile}`,
  );
}

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  for (const privateFile of privateFiles) {
    assert.ok(source.includes(path.basename(privateFile)), `${doc} documents ${privateFile}`);
  }
  assert.ok(source.includes('同名'), `${doc} documents same-name shortcut conflict handling`);
  assert.ok(source.includes('保留'), `${doc} documents preservation of user shortcuts`);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-shortcuts-'));
const desktopPath = path.join(temporaryRoot, 'Desktop');
const sendToPath = path.join(temporaryRoot, 'SendTo');
const programsPath = path.join(temporaryRoot, 'Programs');
fs.mkdirSync(desktopPath);
fs.mkdirSync(sendToPath);
fs.mkdirSync(programsPath);

try {
  const conflictingModes = runPowerShell([
    '-File', installerPath,
    '-DesktopPath', desktopPath,
    '-SendToPath', sendToPath,
    '-ProgramsPath', programsPath,
    '-Check',
    '-Remove',
    '-Json',
  ]);
  assert.notEqual(conflictingModes.status, 0, 'check and remove modes are mutually exclusive');
  assert.match(`${conflictingModes.stdout}\n${conflictingModes.stderr}`, /不可同時使用/);

  const first = runInstaller(desktopPath, sendToPath, programsPath);
  assert.equal(first.status, 0, first.stderr);
  const firstPayload = JSON.parse(first.stdout.trim());
  assert.equal(firstPayload.operation, 'install');
  assert.deepEqual(firstPayload.shortcuts.map(item => item.status), ['created', 'created', 'created']);

  const shortcuts = inspectShortcuts(desktopPath, sendToPath, programsPath);
  assert.equal(shortcuts.length, 3);
  for (const shortcut of shortcuts) {
    assert.equal(path.normalize(shortcut.TargetPath).toLowerCase(), path.normalize(targetPath).toLowerCase());
    assert.equal(path.normalize(shortcut.WorkingDirectory).toLowerCase(), path.normalize(repoRoot).toLowerCase());
    assert.equal(shortcut.Arguments, '');
    assert.match(shortcut.Description, /由小工具安裝器管理/);
  }

  const timestamps = shortcuts.map(shortcut => fs.statSync(shortcut.Path).mtimeMs);
  const second = runInstaller(desktopPath, sendToPath, programsPath);
  assert.equal(second.status, 0, second.stderr);
  const secondPayload = JSON.parse(second.stdout.trim());
  assert.deepEqual(secondPayload.shortcuts.map(item => item.status), ['current', 'current', 'current']);
  assert.deepEqual(shortcuts.map(shortcut => fs.statSync(shortcut.Path).mtimeMs), timestamps, 'current shortcuts are not rewritten');

  const currentCheck = runChecker(desktopPath, sendToPath, programsPath);
  assert.equal(currentCheck.status, 0, currentCheck.stderr);
  const currentCheckPayload = JSON.parse(currentCheck.stdout.trim());
  assert.equal(currentCheckPayload.operation, 'check');
  assert.equal(currentCheckPayload.status, 'ready');
  assert.equal(currentCheckPayload.targetAvailable, true);
  assert.deepEqual(currentCheckPayload.shortcuts.map(item => item.status), ['current', 'current', 'current']);
  assert.deepEqual(shortcuts.map(shortcut => fs.statSync(shortcut.Path).mtimeMs), timestamps, 'read-only check does not rewrite current shortcuts');

  const corruptCommand = [
    '$shell = New-Object -ComObject WScript.Shell',
    '$link = $shell.CreateShortcut($env:TEST_CORRUPT_LINK)',
    '$link.Arguments = "--unexpected"',
    '$link.Save()',
  ].join('; ');
  const corruptSetup = runPowerShell(['-Command', corruptCommand], {
    env: { ...process.env, TEST_CORRUPT_LINK: path.join(desktopPath, '案件附件工作台.lnk') },
  });
  assert.equal(corruptSetup.status, 0, corruptSetup.stderr);
  const corruptTimestamp = fs.statSync(path.join(desktopPath, '案件附件工作台.lnk')).mtimeMs;
  const repairableCheck = runChecker(desktopPath, sendToPath, programsPath);
  assert.equal(repairableCheck.status, 1, repairableCheck.stderr);
  const repairablePayload = JSON.parse(repairableCheck.stdout.trim());
  assert.equal(repairablePayload.status, 'review');
  assert.deepEqual(repairablePayload.shortcuts.map(item => item.status), ['repairable', 'current', 'current']);
  assert.equal(fs.statSync(path.join(desktopPath, '案件附件工作台.lnk')).mtimeMs, corruptTimestamp, 'read-only check does not repair a managed shortcut');
  const repaired = runInstaller(desktopPath, sendToPath, programsPath);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.deepEqual(JSON.parse(repaired.stdout.trim()).shortcuts.map(item => item.status), ['updated', 'current', 'current']);

  const absentDesktop = path.join(temporaryRoot, 'AbsentDesktop');
  const absentSendTo = path.join(temporaryRoot, 'AbsentSendTo');
  const absentPrograms = path.join(temporaryRoot, 'AbsentPrograms');
  fs.mkdirSync(absentDesktop);
  fs.mkdirSync(absentSendTo);
  fs.mkdirSync(absentPrograms);
  const absentCheck = runChecker(absentDesktop, absentSendTo, absentPrograms);
  assert.equal(absentCheck.status, 1, absentCheck.stderr);
  const absentPayload = JSON.parse(absentCheck.stdout.trim());
  assert.equal(absentPayload.status, 'review');
  assert.deepEqual(absentPayload.shortcuts.map(item => item.status), ['absent', 'absent', 'absent']);
  assert.equal(fs.readdirSync(absentDesktop).length + fs.readdirSync(absentSendTo).length + fs.readdirSync(absentPrograms).length, 0, 'read-only check does not create missing shortcuts');

  const conflictDesktop = path.join(temporaryRoot, 'ConflictDesktop');
  const conflictSendTo = path.join(temporaryRoot, 'ConflictSendTo');
  const conflictPrograms = path.join(temporaryRoot, 'ConflictPrograms');
  fs.mkdirSync(conflictDesktop);
  fs.mkdirSync(conflictSendTo);
  fs.mkdirSync(conflictPrograms);
  const conflictPath = path.join(conflictDesktop, '案件附件工作台.lnk');
  const conflictCommand = [
    '$shell = New-Object -ComObject WScript.Shell',
    '$link = $shell.CreateShortcut($env:TEST_CONFLICT_LINK)',
    '$link.TargetPath = "$env:SystemRoot\\System32\\notepad.exe"',
    '$link.Description = "user-owned shortcut"',
    '$link.Save()',
  ].join('; ');
  const conflictSetup = runPowerShell(['-Command', conflictCommand], {
    env: { ...process.env, TEST_CONFLICT_LINK: conflictPath },
  });
  assert.equal(conflictSetup.status, 0, conflictSetup.stderr);
  const conflictTimestamp = fs.statSync(conflictPath).mtimeMs;
  const conflictCheck = runChecker(conflictDesktop, conflictSendTo, conflictPrograms);
  assert.equal(conflictCheck.status, 2, conflictCheck.stderr);
  const conflictCheckPayload = JSON.parse(conflictCheck.stdout.trim());
  assert.equal(conflictCheckPayload.status, 'blocked');
  assert.deepEqual(conflictCheckPayload.shortcuts.map(item => item.status), ['foreign', 'absent', 'absent']);
  assert.equal(fs.statSync(conflictPath).mtimeMs, conflictTimestamp, 'read-only check preserves a same-name user shortcut');
  const conflict = runInstaller(conflictDesktop, conflictSendTo, conflictPrograms);
  assert.notEqual(conflict.status, 0, 'a same-name user shortcut must block installation');
  assert.match(`${conflict.stdout}\n${conflict.stderr}`, /已保留原檔/);

  const conflictInspect = inspectShortcuts(conflictDesktop, sendToPath, programsPath)[0];
  assert.match(conflictInspect.TargetPath, /notepad\.exe$/i, 'conflicting user shortcut remains untouched');
  const preservedRemoval = runRemover(conflictDesktop, conflictSendTo, conflictPrograms);
  assert.equal(preservedRemoval.status, 0, preservedRemoval.stderr);
  const preservedPayload = JSON.parse(preservedRemoval.stdout.trim());
  assert.deepEqual(preservedPayload.shortcuts.map(item => item.status), ['preserved', 'absent', 'absent']);
  const preservedInspect = inspectShortcuts(conflictDesktop, sendToPath, programsPath)[0];
  assert.match(preservedInspect.TargetPath, /notepad\.exe$/i, 'removal preserves a same-name user shortcut');

  const sameLeafDesktop = path.join(temporaryRoot, 'SameLeafDesktop');
  const sameLeafSendTo = path.join(temporaryRoot, 'SameLeafSendTo');
  const sameLeafPrograms = path.join(temporaryRoot, 'SameLeafPrograms');
  const unrelatedRoot = path.join(temporaryRoot, 'UnrelatedTool');
  fs.mkdirSync(sameLeafDesktop);
  fs.mkdirSync(sameLeafSendTo);
  fs.mkdirSync(sameLeafPrograms);
  fs.mkdirSync(unrelatedRoot);
  const unrelatedTarget = path.join(unrelatedRoot, '啟動案件附件工作台.bat');
  fs.writeFileSync(unrelatedTarget, '@echo user-owned\r\n', 'utf8');
  const sameLeafPath = path.join(sameLeafDesktop, '案件附件工作台.lnk');
  const sameLeafCommand = [
    '$shell = New-Object -ComObject WScript.Shell',
    '$link = $shell.CreateShortcut($env:TEST_CONFLICT_LINK)',
    '$link.TargetPath = $env:TEST_CONFLICT_TARGET',
    '$link.Description = "user-owned same-leaf shortcut"',
    '$link.Save()',
  ].join('; ');
  const sameLeafSetup = runPowerShell(['-Command', sameLeafCommand], {
    env: { ...process.env, TEST_CONFLICT_LINK: sameLeafPath, TEST_CONFLICT_TARGET: unrelatedTarget },
  });
  assert.equal(sameLeafSetup.status, 0, sameLeafSetup.stderr);
  const sameLeafRemoval = runRemover(sameLeafDesktop, sameLeafSendTo, sameLeafPrograms);
  assert.equal(sameLeafRemoval.status, 0, sameLeafRemoval.stderr);
  assert.deepEqual(JSON.parse(sameLeafRemoval.stdout.trim()).shortcuts.map(item => item.status), ['preserved', 'absent', 'absent']);
  const sameLeafInspect = inspectShortcuts(sameLeafDesktop, sendToPath, programsPath)[0];
  assert.equal(path.normalize(sameLeafInspect.TargetPath).toLowerCase(), path.normalize(unrelatedTarget).toLowerCase(), 'removal does not trust a matching target filename outside this repo');

  const lateConflictDesktop = path.join(temporaryRoot, 'LateConflictDesktop');
  const lateConflictSendTo = path.join(temporaryRoot, 'LateConflictSendTo');
  const lateConflictPrograms = path.join(temporaryRoot, 'LateConflictPrograms');
  fs.mkdirSync(lateConflictDesktop);
  fs.mkdirSync(lateConflictSendTo);
  fs.mkdirSync(lateConflictPrograms);
  const lateConflictPath = path.join(lateConflictSendTo, '以附件工作台檢查.lnk');
  const lateConflictSetup = runPowerShell(['-Command', conflictCommand], {
    env: { ...process.env, TEST_CONFLICT_LINK: lateConflictPath },
  });
  assert.equal(lateConflictSetup.status, 0, lateConflictSetup.stderr);
  const lateConflict = runInstaller(lateConflictDesktop, lateConflictSendTo, lateConflictPrograms);
  assert.notEqual(lateConflict.status, 0, 'a SendTo conflict must block the whole installation before writes');
  assert.equal(
    fs.existsSync(path.join(lateConflictDesktop, '案件附件工作台.lnk')),
    false,
    'desktop shortcut is not created when the later SendTo destination conflicts',
  );

  const lastConflictDesktop = path.join(temporaryRoot, 'LastConflictDesktop');
  const lastConflictSendTo = path.join(temporaryRoot, 'LastConflictSendTo');
  const lastConflictPrograms = path.join(temporaryRoot, 'LastConflictPrograms');
  fs.mkdirSync(lastConflictDesktop);
  fs.mkdirSync(lastConflictSendTo);
  fs.mkdirSync(lastConflictPrograms);
  const lastConflictPath = path.join(lastConflictPrograms, '案件附件工作台.lnk');
  const lastConflictSetup = runPowerShell(['-Command', conflictCommand], {
    env: { ...process.env, TEST_CONFLICT_LINK: lastConflictPath },
  });
  assert.equal(lastConflictSetup.status, 0, lastConflictSetup.stderr);
  const lastConflict = runInstaller(lastConflictDesktop, lastConflictSendTo, lastConflictPrograms);
  assert.notEqual(lastConflict.status, 0, 'a Start Menu conflict must block the whole installation before writes');
  assert.equal(fs.existsSync(path.join(lastConflictDesktop, '案件附件工作台.lnk')), false);
  assert.equal(fs.existsSync(path.join(lastConflictSendTo, '以附件工作台檢查.lnk')), false);

  const removeDesktop = path.join(temporaryRoot, 'RemoveDesktop');
  const removeSendTo = path.join(temporaryRoot, 'RemoveSendTo');
  const removePrograms = path.join(temporaryRoot, 'RemovePrograms');
  fs.mkdirSync(removeDesktop);
  fs.mkdirSync(removeSendTo);
  fs.mkdirSync(removePrograms);
  const removeSetup = runInstaller(removeDesktop, removeSendTo, removePrograms);
  assert.equal(removeSetup.status, 0, removeSetup.stderr);
  const removed = runRemover(removeDesktop, removeSendTo, removePrograms);
  assert.equal(removed.status, 0, removed.stderr);
  const removedPayload = JSON.parse(removed.stdout.trim());
  assert.equal(removedPayload.operation, 'remove');
  assert.deepEqual(removedPayload.shortcuts.map(item => item.status), ['removed', 'removed', 'removed']);
  assert.equal(fs.readdirSync(removeDesktop).length, 0);
  assert.equal(fs.readdirSync(removeSendTo).length, 0);
  assert.equal(fs.readdirSync(removePrograms).length, 0);
  const removedAgain = runRemover(removeDesktop, removeSendTo, removePrograms);
  assert.equal(removedAgain.status, 0, removedAgain.stderr);
  assert.deepEqual(JSON.parse(removedAgain.stdout.trim()).shortcuts.map(item => item.status), ['absent', 'absent', 'absent']);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('attachment governance shortcut installer tests passed');
