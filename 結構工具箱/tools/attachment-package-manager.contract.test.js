'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Worker = require('./attachment-package-manager-worker.js');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const fakeReport = {
  status: 'ready',
  summary: { attachments: 2, errors: 0, warnings: 0 },
  attachments: [
    {
      file: '正式計算書.pdf', type: 'pdf', sourceTool: '測試工具', toolVersion: 'v1.0',
      projectNo: 'CASE-001',
      fingerprints: ['CF-0011223344556677'], readyDocumentNeedles: ['文件狀態：正式附件'],
      draftDocumentNeedles: [], errors: [], contentBoundary: { missingGroups: [] },
    },
    {
      file: '來源.json', type: 'json', sourceTool: '測試工具', toolVersion: 'v1.0',
      projectNo: 'CASE-001',
      fingerprints: ['CF-0011223344556677'], readyDocumentNeedles: [], draftDocumentNeedles: [], errors: [],
    },
  ],
  fingerprintLinks: [{ fingerprint: 'CF-0011223344556677' }],
  issues: [],
};

const fakeChecker = {
  READY_DOCUMENT_CLASS_LABEL: '文件狀態：正式附件',
  CLI_ERROR_EXIT_CODE: 3,
  checkPackage() { return fakeReport; },
  formatSummary(report) { return `CHECK:${report.status}`; },
  exitCodeForStatus(status) { return { ready: 0, review: 1, blocked: 2 }[status] ?? 3; },
  isDocumentClassRequired(record) { return record.type !== 'json'; },
};
const fakeBuilder = {
  defaultOutputDir(input) { return `${input}-正式附件包-suggested`; },
  buildPackage() {
    return {
      status: 'ready', built: true, outputDir: 'C:\\case\\正式附件包',
      formalAttachmentCount: 1, traceabilitySourceCount: 1,
      packageFingerprint: 'PKG-00112233445566778899AABB', report: fakeReport,
      selfVerification: { summary: { htmlDualSealExpected: 1, htmlDualSealVerified: 1, evidenceChainExpected: 1, evidenceChainVerified: 1 } },
    };
  },
};
const fakeVerifier = {
  verifyPackage() {
    return {
      status: 'ready', packageFingerprint: 'PKG-00112233445566778899AABB',
      summary: { expectedFiles: 2, verifiedFiles: 2, htmlDualSealExpected: 1, htmlDualSealVerified: 1, evidenceChainExpected: 1, evidenceChainVerified: 1, errors: 0, warnings: 0 },
      records: [{
        packagedFile: '01_正式附件/正式計算書.html', role: 'formal', status: 'verified',
        htmlDualSeal: { family: 'anchor', contentStatus: 'verified', approvalStatus: 'verified' },
      }],
      issues: [],
    };
  },
  formatSummary(report) { return `VERIFY:${report.status}`; },
};
const dependencies = { Checker: fakeChecker, Builder: fakeBuilder, Verifier: fakeVerifier };

const check = Worker.runAction('check', { input: toolsDir }, dependencies);
assert.equal(check.status, 'ready');
assert.equal(check.canBuild, true);
assert.equal(check.records.length, 2);
assert.equal(check.records[0].state, '正式附件');
assert.equal(check.records[1].role, '內部追溯來源');
assert.equal(check.suggestedProjectNo, 'CASE-001');
assert.equal(check.suggestedOutputDir, '', 'ordinary source folders keep the established safe implicit output default');
assert.equal(check.displayText, 'CHECK:ready');
assert.equal(Worker.suggestedProjectNo({ attachments: [{ projectNo: '' }, {}] }), '', 'blank project metadata stays optional');
assert.equal(Worker.suggestedProjectNo({ attachments: [{ projectNo: 'A' }, { projectNo: 'B' }] }), '', 'conflicting project numbers are never guessed');

const build = Worker.runAction('build', { input: toolsDir, output: path.join(repoRoot, 'never-created') }, dependencies);
assert.equal(build.built, true);
assert.equal(build.packageFingerprint, 'PKG-00112233445566778899AABB');
assert.match(build.displayText, /發布前完整性與工程內容驗證：通過/);
assert.match(build.displayText, /HTML 雙封印複驗 1 \/ 1 份/);
assert.match(build.displayText, /開挖證據鏈複驗 1 \/ 1 組/);
assert.equal(build.counts.htmlDualSealVerified, 1);
assert.equal(build.counts.evidenceChainVerified, 1);

const verify = Worker.runAction('verify', { input: toolsDir }, dependencies);
assert.equal(verify.status, 'ready');
assert.equal(verify.records[0].result, 'verified｜錨栓雙封印已驗證');
assert.equal(verify.counts.htmlDualSealExpected, 1);
assert.equal(verify.counts.htmlDualSealVerified, 1);
assert.equal(verify.counts.evidenceChainExpected, 1);
assert.equal(verify.counts.evidenceChainVerified, 1);
assert.equal(verify.displayText, 'VERIFY:ready');

const smoke = Worker.runAction('smoke');
assert.equal(smoke.status, 'ready');
assert.equal(Worker.exitCodeForResponse(smoke), 0);
assert.throws(() => Worker.runAction('publish', { input: toolsDir }), /不支援的管理器動作/);
assert.throws(() => Worker.runAction('check', { input: '' }), /尚未選擇附件來源/);

const zipFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-manager-zip-test-'));
try {
  const zipSource = path.join(zipFixtureRoot, 'source');
  fs.mkdirSync(zipSource);
  const pdfName = '核可計算書.pdf';
  const evidenceName = '核可計算書.canonical-render.evidence.json';
  fs.writeFileSync(path.join(zipSource, pdfName), '%PDF-1.7\nfixture\n', 'utf8');
  fs.writeFileSync(path.join(zipSource, evidenceName), '{"kind":"fixture"}\n', 'utf8');
  const bundlePath = path.join(zipFixtureRoot, '核可計算書.formal-source.zip');
  const archive = childProcess.spawnSync('tar', ['-a', '-cf', bundlePath, '-C', zipSource, pdfName, evidenceName], { encoding: 'utf8' });
  assert.equal(archive.status, 0, archive.stderr || archive.stdout);

  let checkedTemp = '';
  const zipChecker = {
    ...fakeChecker,
    checkPackage(input) {
      checkedTemp = input;
      assert.equal(fs.readFileSync(path.join(input, pdfName), 'utf8'), '%PDF-1.7\nfixture\n');
      assert.equal(fs.readFileSync(path.join(input, evidenceName), 'utf8'), '{"kind":"fixture"}\n');
      assert.deepEqual(fs.readdirSync(input).sort(), [evidenceName, pdfName].sort());
      return fakeReport;
    },
  };
  const zipCheck = Worker.runAction('check', { input: bundlePath }, { ...dependencies, Checker: zipChecker });
  assert.equal(zipCheck.inputKind, 'formal-source-zip');
  assert.equal(zipCheck.suggestedOutputDir, path.join(zipFixtureRoot, '核可計算書-正式附件包-suggested'));
  assert.match(zipCheck.displayText, /隔離暫存區安全讀取/);
  assert.ok(path.basename(path.dirname(checkedTemp)).startsWith(`formal-source-${process.pid}-`), 'ZIP isolation roots carry the worker pid for bounded parent cleanup');
  assert.ok(checkedTemp && !fs.existsSync(checkedTemp), 'ZIP check always removes isolated temporary input');

  let builtTemp = '';
  let builtOptions;
  const zipBuilder = {
    defaultOutputDir(input) {
      assert.equal(input, path.join(zipFixtureRoot, '核可計算書'));
      return path.join(zipFixtureRoot, '核可計算書-正式附件包-test');
    },
    buildPackage(input, options) {
      builtTemp = input;
      builtOptions = options;
      assert.deepEqual(fs.readdirSync(input).sort(), [evidenceName, pdfName].sort());
      return fakeBuilder.buildPackage();
    },
  };
  const zipBuild = Worker.runAction('build', { input: bundlePath }, { ...dependencies, Checker: zipChecker, Builder: zipBuilder });
  assert.equal(zipBuild.built, true);
  assert.equal(builtOptions.output, path.join(zipFixtureRoot, '核可計算書-正式附件包-test'));
  assert.ok(builtTemp && !fs.existsSync(builtTemp), 'ZIP build always removes isolated temporary input');

  assert.throws(() => Worker.runAction('verify', { input: bundlePath }, dependencies), /必須選擇資料夾/);
  assert.throws(
    () => Worker.validateBundleEntries(bundlePath, ['../核可計算書.pdf', evidenceName]),
    /依序且只含根目錄兩檔/,
  );
  assert.throws(
    () => Worker.validateBundleEntries(bundlePath, [pdfName, evidenceName, '多餘.txt']),
    /依序且只含根目錄兩檔/,
  );
  const mismatchedBundle = path.join(zipFixtureRoot, '錯配名稱.formal-source.zip');
  fs.copyFileSync(bundlePath, mismatchedBundle);
  assert.throws(() => Worker.extractFormalSourceBundle(mismatchedBundle), /依序且只含根目錄兩檔/);

  const cancellation = childProcess.spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(toolsDir, 'attachment-package-manager.ps1'),
    '-SmokeReadOnlyCancellation', '-WorkerSmokeDelayMilliseconds', '2000', '-InitialPath', bundlePath,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(cancellation.status, 0, cancellation.stderr || cancellation.stdout);
  const cancellationPayload = JSON.parse(cancellation.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(cancellationPayload.status, 'pass');
  assert.equal(cancellationPayload.winFormsMessageLoop, true);
  assert.equal(cancellationPayload.runningActionVisible, true);
  assert.equal(cancellationPayload.windowStayedOpen, true);
  assert.ok(cancellationPayload.workerPid > 0);
  assert.equal(cancellationPayload.workerExited, true);
  assert.equal(cancellationPayload.resultFileRemoved, true);
  assert.equal(cancellationPayload.sourceTempRootsRemoved, true);
  assert.equal(cancellationPayload.operationCleared, true);
  assert.equal(cancellationPayload.idleActionRestored, true);
  assert.equal(cancellationPayload.cancellationMessageShown, true);
  assert.equal(cancellationPayload.built, false);

  const completion = childProcess.spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(toolsDir, 'attachment-package-manager.ps1'),
    '-SmokeReadOnlyCompletion', '-InitialPath', bundlePath,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(completion.status, 0, completion.stderr || completion.stdout);
  const completionPayload = JSON.parse(completion.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(completionPayload.status, 'pass');
  assert.equal(completionPayload.winFormsMessageLoop, true);
  assert.ok(completionPayload.workerPid > 0);
  assert.equal(completionPayload.workerExited, true);
  assert.equal(completionPayload.resultApplied, true);
  assert.equal(completionPayload.resultFileRemoved, true);
  assert.equal(completionPayload.sourceTempRootsRemoved, true);
  assert.equal(completionPayload.operationCleared, true);
  assert.equal(completionPayload.buildStayedDisabled, true);
  assert.equal(completionPayload.built, false);

  const keyboard = childProcess.spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(toolsDir, 'attachment-package-manager.ps1'),
    '-SmokeKeyboard', '-WorkerSmokeDelayMilliseconds', '2000', '-InitialPath', bundlePath,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(keyboard.status, 0, keyboard.stderr || keyboard.stdout);
  const keyboardPayload = JSON.parse(keyboard.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(keyboardPayload.status, 'pass');
  assert.equal(keyboardPayload.winFormsMessageLoop, true);
  assert.equal(keyboardPayload.ctrlLFocusedSource, true);
  assert.equal(keyboardPayload.ctrlLHandled, true);
  assert.equal(keyboardPayload.enterStartedReadOnly, true);
  assert.equal(keyboardPayload.escapeStoppedWorker, true);
  assert.equal(keyboardPayload.resultFileRemoved, true);
  assert.equal(keyboardPayload.sourceTempRootsRemoved, true);
  assert.equal(keyboardPayload.buildEnterSuppressed, true);
  assert.equal(keyboardPayload.accessibleNamesPresent, true);
  assert.equal(keyboardPayload.built, false);
} finally {
  fs.rmSync(zipFixtureRoot, { recursive: true, force: true });
}

const cli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-manager-worker.js'), '--action', 'smoke'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const cliPayload = JSON.parse(cli.stdout);
assert.equal(cliPayload.status, 'ready');
assert.equal(cliPayload.counts.modules, 3);

const badCli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-manager-worker.js'), '--action', 'unknown'], { encoding: 'utf8' });
assert.equal(badCli.status, 3);
assert.equal(JSON.parse(badCli.stdout).status, 'error');

const viewport = childProcess.spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(toolsDir, 'attachment-package-manager.ps1'),
  '-SmokeViewport',
], { encoding: 'utf8', timeout: 15000 });
assert.equal(viewport.status, 0, viewport.stderr || viewport.stdout);
const viewportPayload = JSON.parse(viewport.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(viewportPayload.status, 'pass');
assert.equal(viewportPayload.winFormsMessageLoop, true);
assert.equal(viewportPayload.selectedScreenContainsWindow, true);
assert.ok(viewportPayload.windowWidth <= 800);
assert.ok(viewportPayload.windowHeight <= 640);
assert.ok(viewportPayload.horizontalScroll > 0);
assert.ok(viewportPayload.verticalScroll > 0);
assert.equal(viewportPayload.rightBottomVisible, true);
assert.equal(viewportPayload.statusFixedVisible, true);
assert.equal(viewportPayload.operationRunning, false);
assert.equal(viewportPayload.built, false);

const dragDrop = childProcess.spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(toolsDir, 'attachment-package-manager.ps1'),
  '-SmokeDragDrop', '-WorkerSmokeDelayMilliseconds', '2000',
], { encoding: 'utf8', timeout: 20000 });
assert.equal(dragDrop.status, 0, dragDrop.stderr || dragDrop.stdout);
const dragDropPayload = JSON.parse(dragDrop.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(dragDropPayload.status, 'pass');
assert.equal(dragDropPayload.winFormsMessageLoop, true);
assert.equal(dragDropPayload.sourceDropAccepted, true);
assert.equal(dragDropPayload.multiDropRejected, true);
assert.equal(dragDropPayload.ordinaryFileRejected, true);
assert.equal(dragDropPayload.verifyFolderAccepted, true);
assert.equal(dragDropPayload.sourceZipRejectedByVerify, true);
assert.equal(dragDropPayload.resultFilesRemoved, true);
assert.equal(dragDropPayload.operationCleared, true);
assert.equal(dragDropPayload.built, false);

const requestBase64 = Buffer.from(JSON.stringify({ action: 'smoke' }), 'utf8').toString('base64');
const resultFile = path.join(os.tmpdir(), `${Worker.RESULT_FILE_PREFIX}${process.pid}-${Date.now()}${Worker.RESULT_FILE_SUFFIX}`);
try {
  const backgroundCli = childProcess.spawnSync(process.execPath, [
    path.join(toolsDir, 'attachment-package-manager-worker.js'), '--request-base64', requestBase64, '--result-file', resultFile,
  ], { encoding: 'utf8' });
  assert.equal(backgroundCli.status, 0, backgroundCli.stderr || backgroundCli.stdout);
  assert.equal(backgroundCli.stdout, '', 'managed background IPC writes no case result to inherited stdout');
  assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).status, 'ready');
} finally {
  fs.rmSync(resultFile, { force: true });
}
assert.deepEqual(Worker.parseRequestBase64(requestBase64), { action: 'smoke' });
assert.throws(() => Worker.parseRequestBase64(Buffer.from('{"action":"smoke","write":true}').toString('base64')), /未知欄位/);
assert.throws(() => Worker.resolveResultFile(path.join(repoRoot, `${Worker.RESULT_FILE_PREFIX}bad.json`)), /系統暫存區/);
assert.equal(Worker.parseArgs(['--smoke-delay-ms', '250']).smokeDelayMs, 250);
assert.throws(() => Worker.parseArgs(['--smoke-delay-ms', '5001']), /0 至 5000/);

const managerPs = read('結構工具箱/tools/attachment-package-manager.ps1');
[
  'System.Windows.Forms', 'FolderBrowserDialog', 'OpenFileDialog', 'attachment-package-manager-worker.js',
  "ValidateSet('smoke', 'check', 'build', 'verify')", '檢查附件來源', '建立正式附件包',
  '驗證附件包', '管理畫面與檢查結果僅供內部整理', 'workerExitCode',
  "[string]$InitialPath = ''", "[ValidateSet('source', 'verify')][string]$InitialMode = 'source'", '[switch]$AutoInspect',
  'PDF＋證據來源 ZIP', '*.formal-source.zip', '選擇來源 ZIP…',
  'System.Diagnostics.ProcessStartInfo', 'System.Windows.Forms.Timer', 'Start-ReadOnlyOperation',
  'Complete-ReadOnlyOperation', 'Stop-ReadOnlyOperation', 'Cancel-ReadOnlyOperation',
  '停止檢查', '停止驗證', '畫面仍可操作', '超過 5 分鐘', 'Add_FormClosing',
  'KeyPreview', 'Invoke-ManagerKeyDown', 'Ctrl+L 路徑', 'Enter 唯讀檢查', 'Esc 停止',
  'AccessibleName', 'AccessibleDescription', 'TabIndex', 'SmokeKeyboard',
  'SmokeViewport', 'AutoScrollMinSize', 'ScrollControlIntoView', 'Screen]::FromPoint',
  'SmokeDragDrop', 'AllowDrop', 'DataFormats]::FileDrop', 'DragDropEffects]::Copy', 'DragDropEffects]::None',
].forEach(needle => assert.ok(managerPs.includes(needle), `PowerShell manager includes ${needle}`));
assert.ok(managerPs.charCodeAt(0) === 0xFEFF, 'PowerShell manager keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(managerPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'manager stays local and does not send case data over network');
assert.match(managerPs, /\$previousOutputEncoding = \[Console\]::OutputEncoding[\s\S]*?UTF8Encoding\(\$false\)[\s\S]*?finally \{\s*\[Console\]::OutputEncoding = \$previousOutputEncoding/, 'manager decodes Node JSON as UTF-8 and restores the prior console encoding');
assert.match(
  managerPs,
  /\$script:BtnCheck\.Add_Click\(\{[\s\S]*?\$script:LastReadyInput = ''[\s\S]*?\$script:LastReadyProjectNo = ''[\s\S]*?Start-ReadOnlyOperation -Action check/,
  'every new check clears the prior ready grant before the worker runs',
);
assert.match(
  managerPs,
  /if \(-not \$script:ProjectNo\.Text\.Trim\(\) -and \$suggestedProjectNo\)[\s\S]*?\$script:ProjectNo\.Text = \$suggestedProjectNo[\s\S]*?建立前仍會再次完整檢查/,
  'manager only fills a unique detected project number into an empty field and discloses the rebuild check',
);
assert.doesNotMatch(
  managerPs,
  /if \(\$suggestedProjectNo\)\s*\{\s*\$script:ProjectNo\.Text =/,
  'manager never overwrites a project number already entered by the user',
);
const sourceCheckHandler = managerPs.match(/\$script:BtnCheck\.Add_Click\(\{[\s\S]*?(?=\n\}\)\n\n\$script:BtnBuild\.Add_Click)/)?.[0] || '';
const applyCheckResponse = managerPs.match(/function Apply-CheckResponse \{[\s\S]*?(?=\nfunction Complete-ReadOnlyOperation)/)?.[0] || '';
assert.match(sourceCheckHandler, /Start-ReadOnlyOperation -Action check/, 'source checks start a non-blocking read-only worker');
assert.doesNotMatch(sourceCheckHandler, /Invoke-AttachmentWorker/, 'source checks never synchronously wait on the UI thread');
assert.match(
  applyCheckResponse,
  /\$script:ProjectNo\.Text = \$suggestedProjectNo[\s\S]*?\$Response\.status -eq 'ready'[\s\S]*?\$script:LastReadyInput = \$script:SourcePath\.Text\.Trim\(\)[\s\S]*?\$script:LastReadyProjectNo = \$script:ProjectNo\.Text\.Trim\(\)[\s\S]*?\$script:BtnBuild\.Enabled = \$true/,
  'the build grant is recreated only after the suggested value is applied and is bound to that current value',
);
assert.match(
  applyCheckResponse,
  /\$Response\.status -eq 'ready'[\s\S]*?if \(-not \$script:OutputPath\.Text\.Trim\(\) -and \$suggestedOutputDir\)[\s\S]*?\$script:LastSuggestedOutput = \$suggestedOutputDir[\s\S]*?\$script:OutputPath\.Text = \$suggestedOutputDir[\s\S]*?尚未建立任何資料夾/,
  'a ready source ZIP fills only an empty output field and clearly remains a non-writing plan',
);
const verifyHandler = managerPs.match(/\$script:BtnVerify\.Add_Click\(\{[\s\S]*?(?=\n\}\)\n\n\$script:BtnOpenOutput\.Add_Click)/)?.[0] || '';
assert.match(verifyHandler, /Start-ReadOnlyOperation -Action verify/, 'package verification starts a non-blocking read-only worker');
assert.doesNotMatch(verifyHandler, /Invoke-AttachmentWorker/, 'package verification never synchronously waits on the UI thread');
const completeReadOnly = managerPs.match(/function Complete-ReadOnlyOperation \{[\s\S]*?(?=\nfunction Cancel-ReadOnlyOperation)/)?.[0] || '';
assert.doesNotMatch(completeReadOnly, /ReadToEnd|WaitForExit/, 'normal read-only completion is timer-polled and never synchronously waits on the UI thread');
const buildHandler = managerPs.match(/\$script:BtnBuild\.Add_Click\(\{[\s\S]*?(?=\n\}\)\n\n\$script:BtnVerify\.Add_Click)/)?.[0] || '';
assert.match(buildHandler, /Invoke-AttachmentWorker -Action build/, 'formal package creation remains on the established atomic builder path');
assert.doesNotMatch(buildHandler, /Start-ReadOnlyOperation/, 'the writable build action is never mixed into the cancellable read-only worker path');
assert.match(managerPs, /Cancel-ReadOnlyOperation[\s\S]*?Stop-ReadOnlyOperation[\s\S]*?未建立或修改案件資料/, 'explicit cancellation terminates and cleans the read-only worker without widening authority');
assert.match(managerPs, /taskkill\.exe \/PID \$workerPid \/T \/F[\s\S]*?WaitForExit\(2000\)/, 'cancellation stops the worker process tree before bounded cleanup');
assert.match(managerPs, /Remove-WorkerSourceTempRoots[\s\S]*?formal-source-\$WorkerPid-[\s\S]*?Remove-Item -LiteralPath \$resolved -Recurse -Force/, 'parent cleanup is limited to the cancelled worker pid inside the system temp root');
assert.match(managerPs, /ReadOnlyTimer\.Add_Tick\([\s\S]*?TotalSeconds -ge 300[\s\S]*?Stop-ReadOnlyOperation/, 'read-only workers have a bounded five-minute timeout');
assert.match(managerPs, /MainForm\.Add_FormClosing\([\s\S]*?Stop-ReadOnlyOperation/, 'closing the manager always cleans a running read-only worker');
const keyboardHandler = managerPs.match(/function Invoke-ManagerKeyDown \{[\s\S]*?(?=\n\$script:MainForm =)/)?.[0] || '';
assert.match(keyboardHandler, /Control[\s\S]*?Keys\]::L[\s\S]*?SourcePath[\s\S]*?Focus\(\)/, 'Ctrl+L focuses the active mode path');
assert.match(keyboardHandler, /Keys\]::Escape[\s\S]*?Cancel-ReadOnlyOperation/, 'Escape safely cancels only an active read-only worker');
assert.match(keyboardHandler, /Keys\]::Enter[\s\S]*?BtnVerify\.PerformClick\(\)[\s\S]*?BtnCheck\.PerformClick\(\)/, 'Enter routes only to the current read-only check or verification action');
assert.doesNotMatch(keyboardHandler, /BtnBuild\.PerformClick|Invoke-AttachmentWorker|Start-ReadOnlyOperation -Action build/, 'keyboard routing can never trigger formal package creation');
assert.match(managerPs, /BtnBuild\.AccessibleDescription = '唯一寫入動作；[\s\S]*?不由 Enter 快捷鍵觸發。'/, 'assistive text clearly identifies the sole write action and its explicit activation boundary');
assert.match(managerPs, /SourcePath\.TabIndex = 0[\s\S]*?BtnCheck\.TabIndex = 6[\s\S]*?BtnBuild\.TabIndex = 7[\s\S]*?PackagePath\.TabIndex = 0[\s\S]*?BtnVerify\.TabIndex = 2/, 'source and verification controls expose deliberate tab order');
const windowBoundsHelper = managerPs.match(/function Set-ManagerWindowBounds \{[\s\S]*?(?=\n\$script:MainForm =)/)?.[0] || '';
assert.match(managerPs, /StartPosition = 'Manual'[\s\S]*?WindowWorkingArea = Set-ManagerWindowBounds/, 'manager uses explicit multi-screen placement instead of primary-screen centering');
assert.match(windowBoundsHelper, /Screen\]::FromPoint\(\[System\.Windows\.Forms\.Cursor\]::Position\)[\s\S]*?workingArea[\s\S]*?MainForm\.Location/, 'manager centers and clamps itself to the screen containing the launch cursor');
assert.match(windowBoundsHelper, /minimumWidth = \[Math\]::Min\(800,[\s\S]*?minimumHeight = \[Math\]::Min\(640,[\s\S]*?MinimumSize = New-Object System\.Drawing\.Size\(\$minimumWidth, \$minimumHeight\)/, 'minimum size remains bounded by an 800 by 640 working area');
assert.match(managerPs, /ScrollViewport\.Dock = 'Fill'[\s\S]*?ScrollViewport\.AutoScroll = \$true[\s\S]*?ContentSurface\.Size = New-Object System\.Drawing\.Size\(1040, 784\)[\s\S]*?AutoScrollMinSize = \$script:ContentSurface\.Size/, 'fixed design surface is exposed through a bidirectional scrolling viewport');
for (const control of ['$header', '$subheader', '$sourceGroup', '$verifyGroup', '$script:StatusPanel', '$script:ResultGrid', '$script:DetailsBox']) {
  assert.ok(managerPs.includes(`$script:ContentSurface.Controls.Add(${control})`), `${control} stays inside the scrollable content surface`);
}
assert.match(managerPs, /MainForm\.Controls\.Add\(\$statusStrip\)[\s\S]*?statusStrip\.BringToFront\(\)/, 'status strip stays fixed outside the scrolling content surface');
assert.match(managerPs, /SmokeViewport[\s\S]*?Size\(800, 640\)[\s\S]*?HorizontalScroll\.Value -gt 0[\s\S]*?VerticalScroll\.Value -gt 0[\s\S]*?rightBottomVisible[\s\S]*?statusFixedVisible/, 'dynamic viewport smoke proves both scroll axes, the bottom-right boundary, and fixed status visibility');
const dropPathValidator = managerPs.match(/function Test-ManagerDropPath \{[\s\S]*?(?=\nfunction Get-ManagerDropPaths)/)?.[0] || '';
assert.match(dropPathValidator, /ReparsePoint[\s\S]*?Mode -eq 'verify'[\s\S]*?PSIsContainer[\s\S]*?\.formal-source\.zip[\s\S]*?StringComparison\]::Ordinal/, 'drag-and-drop accepts only physical source folders or exact source ZIPs and keeps verification folder-only');
assert.match(managerPs, /sourceGroup\.AllowDrop = \$true[\s\S]*?SourcePath\.AllowDrop = \$true[\s\S]*?verifyGroup\.AllowDrop = \$true[\s\S]*?PackagePath\.AllowDrop = \$true/, 'both governed sections and path fields expose native Windows file drops');
assert.match(managerPs, /\$sourceDragDrop = \{[\s\S]*?Set-ManagerDroppedPath -Mode source[\s\S]*?\$verifyDragDrop = \{[\s\S]*?Set-ManagerDroppedPath -Mode verify/, 'drop handlers delegate to the shared governed path handoff');
const droppedPathHandoff = managerPs.match(/function Set-ManagerDroppedPath \{[\s\S]*?(?=\nfunction New-ReadOnlyResultPath)/)?.[0] || '';
assert.match(droppedPathHandoff, /Paths\)\.Count -ne 1[\s\S]*?Test-ManagerDropPath[\s\S]*?Resolve-Path[\s\S]*?BtnCheck\.PerformClick\(\)[\s\S]*?BtnVerify\.PerformClick\(\)/, 'a drop accepts exactly one validated path and starts only the matching read-only action');
assert.doesNotMatch(droppedPathHandoff, /BtnBuild|Invoke-AttachmentWorker|Action build/, 'drag-and-drop can never trigger formal package creation');
assert.match(managerPs, /SmokeDragDrop[\s\S]*?OnDragEnter[\s\S]*?OnDragDrop[\s\S]*?sourceDropAccepted[\s\S]*?multiDropRejected[\s\S]*?ordinaryFileRejected[\s\S]*?verifyFolderAccepted[\s\S]*?sourceZipRejectedByVerify[\s\S]*?built = \$false/, 'dynamic drag smoke uses native WinForms events and proves accepted and rejected paths without building');
assert.match(
  managerPs,
  /\$sourceChanged = \{[\s\S]*?LastSuggestedOutput[\s\S]*?OutputPath\.Text\.Trim\(\) -eq \$script:LastSuggestedOutput[\s\S]*?LastSuggestedOutput = ''[\s\S]*?OutputPath\.Clear\(\)/,
  'changing source clears a stale automatic output suggestion only when the field still matches it',
);
assert.match(
  managerPs,
  /\$outputChanged = \{[\s\S]*?OutputPath\.Text\.Trim\(\) -ne \$script:LastSuggestedOutput[\s\S]*?LastSuggestedOutput = ''/,
  'editing the planned output converts it to a user choice that later source changes preserve',
);
assert.match(
  managerPs,
  /\$script:BtnBrowseOutput\.Add_Click\(\{[\s\S]*?if \(\$selected\)[\s\S]*?\$script:LastSuggestedOutput = ''[\s\S]*?\$script:OutputPath\.Text =/,
  'an explicit output-folder selection is always preserved as a user choice even if its text matches a suggestion',
);
assert.match(managerPs, /if \(\$InitialMode -eq 'source'[^\n]+\$script:SourcePath\.Text/, 'manager pre-fills source input only in source mode');
assert.match(managerPs, /if \(\$InitialMode -eq 'verify'[^\n]+\$script:PackagePath\.Text/, 'manager pre-fills package input only in verify mode');
assert.match(managerPs, /Add_Shown\(\{[\s\S]*?\$InitialMode -eq 'verify'[\s\S]*?\$script:BtnVerify\.PerformClick\(\)[\s\S]*?\$script:BtnCheck\.PerformClick\(\)[\s\S]*?\}\)/, 'explicit AutoInspect only triggers the read-only action for the selected mode');
assert.doesNotMatch(managerPs.match(/Add_Shown\(\{[\s\S]*?\}\)/)?.[0] || '', /BtnBuild|build/, 'AutoInspect never triggers package creation');

const launcher = read('結構工具箱/tools/啟動正式附件包管理器.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-package-manager\.ps1/);

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-package-manager\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-package-manager"/);

const pagesBuilder = read('結構工具箱/tools/build-pages-artifact.js');
const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-package-manager-worker.js', 'attachment-package-manager.ps1',
  '啟動正式附件包管理器.bat', 'attachment-package-manager.contract.test.js',
]) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
}
assert.ok(pagesBuilder.includes('結構工具箱/tools/attachment-package-manager-worker.js'), 'Pages artifact builder excludes manager worker');

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-package-manager-worker.js'), `${doc} documents manager worker`);
  assert.ok(source.includes('attachment-package-manager.contract.test.js'), `${doc} documents manager contract`);
  assert.ok(source.includes('啟動正式附件包管理器.bat'), `${doc} documents manager launcher`);
}

console.log('attachment package manager contract tests passed');
