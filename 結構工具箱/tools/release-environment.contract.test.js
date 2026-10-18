'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const helperRelativePath = path.join('結構工具箱', 'tools', 'release-environment.ps1');
const helperSource = fs.readFileSync(path.join(repoRoot, helperRelativePath), 'utf8');
const preflightSource = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
const releaseWrapper = fs.readFileSync(path.join(repoRoot, 'run-preflight-tools-release.bat'), 'utf8');
const lockSource = fs.readFileSync(path.join(repoRoot, '結構工具箱', 'tools', 'release-preflight-lock.ps1'), 'utf8');
const envCheckSource = fs.readFileSync(path.join(repoRoot, '石材固定', 'env_check.py'), 'utf8');
const stoneContractSource = fs.readFileSync(path.join(repoRoot, '石材固定', 'stone-report.contract.test.js'), 'utf8');
const autoWordArtifactSource = fs.readFileSync(path.join(repoRoot, '石材固定', 'auto_word_artifact_test.py'), 'utf8');
const clearFunctionBaselineSha256 = '90dcaa01a5e301d2e713edf5f53ec7fc68e22b13c25ec43b9ef126e5b646985d';
const checksDeclarationBaselineSha256 = '1b00ef12ac0ad72963bf19efeb7cfed148b58d945c43eebe853e051d1119915f';

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), `${message}: missing ${JSON.stringify(needle)}`);
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function copyTree(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) return false;
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyTree(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name));
    }
  } else {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }
  return true;
}

function snapshotOutcome(parent, name, result, receipts = []) {
  const destination = path.join(parent, 'scenario snapshots', name);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'stdout.txt'), result.stdout || '', 'utf8');
  fs.writeFileSync(path.join(destination, 'stderr.txt'), result.stderr || '', 'utf8');
  fs.writeFileSync(path.join(destination, 'process-result.json'), JSON.stringify({ status: result.status, signal: result.signal || null }, null, 2));
  for (const receipt of receipts) {
    copyTree(path.dirname(receipt.path), path.join(destination, 'private-attempts', path.basename(path.dirname(receipt.path))));
  }
  const summaryPath = path.join(parent, 'scenario-summary.json');
  const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : [];
  summary.push({ name, status: result.status, signal: result.signal || null, receiptCount: receipts.length,
    privateReceiptDirectories: receipts.map(receipt => path.basename(path.dirname(receipt.path))) });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
}

function persistFixtureEvidence(parent, formalFixture) {
  if (!fs.existsSync(path.join(parent, 'scenario-summary.json'))) return null;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const destination = path.join(repoRoot, '_tmp', 'dispatch', 'v16-20261018', 't51-fixtures', `${stamp}-${process.pid}`);
  fs.mkdirSync(destination, { recursive: true });
  copyTree(path.join(parent, 'scenario snapshots'), path.join(destination, 'scenarios'));
  copyTree(path.join(parent, 'scenario-summary.json'), path.join(destination, 'scenario-summary.json'));
  if (formalFixture) {
    copyTree(formalFixture.dispatchPath, path.join(destination, 'actual-dispatch-list.jsonl'));
    copyTree(formalFixture.expectedPath, path.join(destination, 'expected-formal-checks.json'));
    copyTree(formalFixture.expectedPostPath, path.join(destination, 'expected-post-checks.json'));
    copyTree(formalFixture.fixtureReceiptPath, path.join(destination, 'fixture-receipt.json'));
    copyTree(path.join(formalFixture.fixtureRoot, 'output', 'preflight', 'environment-precheck'), path.join(destination, 'private-attempts'));
    copyTree(path.join(formalFixture.fixtureRoot, 'output', 'preflight', 'preflight-summary.json'), path.join(destination, 'preflight-summary.json'));
    copyTree(path.join(formalFixture.fixtureRoot, 'output', 'preflight', 'preflight-summary.md'), path.join(destination, 'preflight-summary.md'));
  }
  fs.writeFileSync(path.join(destination, 'retained-fixture-receipt.json'), JSON.stringify({
    suite: 'release environment T51 isolated contract fixtures',
    savedAt: new Date().toISOString(),
    scenarioSummary: path.join(destination, 'scenario-summary.json'),
    actualDispatchList: formalFixture ? path.join(destination, 'actual-dispatch-list.jsonl') : null,
    expectedFormalChecks: formalFixture ? path.join(destination, 'expected-formal-checks.json') : null,
    expectedPostChecks: formalFixture ? path.join(destination, 'expected-post-checks.json') : null,
    privateReceipts: path.join(destination, 'private-attempts'),
    fixtureSafety: 'The source Clear-PreflightRuntimeProcesses function is checked against its execution-before protected SHA. Only the isolated fixture scopes Get-Process to an empty result to protect the test host; fake check children receive PREFLIGHT_* values and record the original command as JSON data without executing it.',
  }, null, 2));
  return destination;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function encodedPowerShell(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}

function powershellPath() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function fixturePython(env) {
  const result = run('python', ['-c', 'import sys; print(sys.executable)'], { env, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const executable = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(executable && path.isAbsolute(executable), `python did not report an absolute executable: ${result.stdout}`);
  return executable;
}

function copyTrackedStoneFiles(destinationRoot) {
  const listing = run('git', ['-C', repoRoot, '-c', 'core.quotePath=false', 'ls-files', '--cached', '--', '石材固定'], { timeout: 30000 });
  assert.equal(listing.status, 0, listing.stderr || listing.stdout);
  const relativeFiles = listing.stdout.split(/\r?\n/).filter(Boolean);
  for (const relativeFile of relativeFiles) {
    const source = path.join(repoRoot, ...relativeFile.split('/'));
    const destination = path.join(destinationRoot, ...relativeFile.split('/'));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const relativeFile of [helperRelativePath]) {
    const source = path.join(repoRoot, relativeFile);
    const destination = path.join(destinationRoot, relativeFile);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function copyTrackedRepositoryFiles(destinationRoot) {
  const listing = run('git', ['-C', repoRoot, '-c', 'core.quotePath=false', 'ls-files', '--cached', '-z'], { timeout: 60000 });
  assert.equal(listing.status, 0, listing.stderr || listing.stdout);
  const relativeFiles = listing.stdout.split('\0').filter(Boolean);
  for (const relativeFile of relativeFiles) {
    const source = path.join(repoRoot, ...relativeFile.split('/'));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const destination = path.join(destinationRoot, ...relativeFile.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const relativeFile of [helperRelativePath]) {
    const source = path.join(repoRoot, relativeFile);
    const destination = path.join(destinationRoot, relativeFile);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function installPreflightFixtureOverrides(fixtureRoot) {
  const preflightPath = path.join(fixtureRoot, 'preflight-tools.ps1');
  let source = fs.readFileSync(preflightPath, 'utf8');
  const environmentHook = /^  \$releaseEnvironmentState = Invoke-ReleaseEnvironmentPrecheck -WorkspaceRoot \$root -SourceCommitSha \$sourceCommitSha -SourceBranch \$sourceBranch\r?\n/m;
  assert.match(source, environmentHook, 'fixture can verify the real hook restores its caller PREFLIGHT_* values');
  source = source.replace(environmentHook, match => `${match}  if ($env:PREFLIGHT_RUN_DIR -cne $env:RELEASE_ENV_FIXTURE_EXPECTED_PARENT_RUN_DIR -or $env:PREFLIGHT_CHECK_KEY -cne $env:RELEASE_ENV_FIXTURE_EXPECTED_PARENT_CHECK_KEY -or $env:PREFLIGHT_RELEASE -cne $env:RELEASE_ENV_FIXTURE_EXPECTED_PARENT_RELEASE -or $env:STONE_RENDERED_EVIDENCE_DIR -cne $env:RELEASE_ENV_FIXTURE_EXPECTED_PARENT_STONE_DIR) { throw 'fixture observed leaked environment-precheck PREFLIGHT state' }\r\n`);
  const anchor = /^Update-PreflightHistoryManifest\s*\r?\n\r?\n\$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"/m;
  const dispatchOverride = String.raw`function Invoke-PreflightCheck {
  param([string]$Key, [string]$Label, [string]$Workdir, [string]$Command, [string]$RunDir, [int]$TimeoutSeconds = 180)
  if ($isReleaseMode) { Assert-ReleaseEnvironmentPinned -State $releaseEnvironmentState }
  $latestLog = Join-Path $outputDir "$Key.txt"
  $historyLog = Join-Path $RunDir "$Key.txt"
  $releaseEvidenceRequired = if ((-not $Quick) -and $ForceSlowChecks -and $ForcePlatformAudit) { '1' } else { '0' }
  $payload = [ordered]@{ key = $Key; label = $Label; workdir = $Workdir; command = $Command; pinnedPython = $env:STRUCTURAL_TOOLS_PYTHON }
  $payloadText = ConvertTo-Json -InputObject $payload -Compress -Depth 4
  $payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadText))
  $childScript = Join-Path $RunDir "$Key.fixture-dispatch.ps1"
  $childSource = @'
$payloadText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:RELEASE_ENV_FIXTURE_PAYLOAD))
$payload = $payloadText | ConvertFrom-Json
$row = [ordered]@{ key = $payload.key; label = $payload.label; workdir = $payload.workdir; command = $payload.command; pinnedPython = $payload.pinnedPython; preflightRelease = $env:PREFLIGHT_RELEASE; runDir = $env:PREFLIGHT_RUN_DIR; checkKey = $env:PREFLIGHT_CHECK_KEY; childPid = $PID }
Add-Content -LiteralPath $env:RELEASE_ENV_FIXTURE_DISPATCH -Value (ConvertTo-Json -InputObject $row -Compress) -Encoding UTF8
'@
  [System.IO.File]::WriteAllText($childScript, $childSource, [System.Text.UTF8Encoding]::new($false))
  $processInfo = [Diagnostics.ProcessStartInfo]::new()
  $processInfo.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $processInfo.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $childScript + '"'
  $processInfo.WorkingDirectory = $Workdir
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $processInfo.EnvironmentVariables['RELEASE_ENV_FIXTURE_PAYLOAD'] = $payloadBase64
  $processInfo.EnvironmentVariables['PREFLIGHT_RUN_DIR'] = $RunDir
  $processInfo.EnvironmentVariables['PREFLIGHT_CHECK_KEY'] = $Key
  $processInfo.EnvironmentVariables['PREFLIGHT_RELEASE'] = $releaseEvidenceRequired
  $child = [Diagnostics.Process]::new()
  $child.StartInfo = $processInfo
  [void]$child.Start()
  $childStdout = $child.StandardOutput.ReadToEndAsync()
  $childStderr = $child.StandardError.ReadToEndAsync()
  $child.WaitForExit()
  [void]$childStdout.Wait(5000)
  [void]$childStderr.Wait(5000)
  $childExitCode = [int]$child.ExitCode
  $child.Dispose()
  if ($childExitCode -ne 0) { throw "fixture-only lightweight child failed for $Key ($childExitCode)" }
  [System.IO.File]::WriteAllText($latestLog, ("fixture pass" + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($historyLog, ("fixture pass" + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
  return [pscustomobject]@{ key = $Key; label = $Label; pass = $true; exitCode = 0; seconds = 0.01; mode = "run-command"; reused = $false; workdir = $Workdir; workdirRelative = Get-PreflightRelativePath $Workdir; command = $Command; commandHash = Get-CommandHash $Command; script = "fixture-only"; log = $latestLog; historyLog = $historyLog }
}

function Start-Process {
  param([string]$FilePath, [object[]]$ArgumentList, [string]$WorkingDirectory, [string]$RedirectStandardOutput, [string]$RedirectStandardError, [switch]$PassThru, [switch]$Wait, [string]$WindowStyle)
  if ($RedirectStandardOutput) { [System.IO.File]::WriteAllText($RedirectStandardOutput, ("fixture tail pass" + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false)) }
  if ($RedirectStandardError) { [System.IO.File]::WriteAllText($RedirectStandardError, "", [System.Text.UTF8Encoding]::new($false)) }
  return [pscustomobject]@{ ExitCode = 0 }
}

function Get-Process {
  param([string[]]$Name, [string]$ErrorAction)
  return @()
}`;
  const expectedCapture = String.raw`$fixtureExpectedChecks = @($checks | ForEach-Object { [ordered]@{ key = [string]$_.key; command = [string]$_.command } })
$fixtureExpectedPostChecks = @(
  [ordered]@{ key = 'audit-dashboard-contract-final'; command = [string]$auditDashboardContractCommand },
  [ordered]@{ key = 'audit-dashboard-browser-smoke-final'; command = [string]$auditDashboardBrowserSmokeCommand },
  [ordered]@{ key = 'audit-dashboard-live-output-smoke-final'; command = [string]$auditDashboardLiveOutputSmokeCommand }
)
[System.IO.File]::WriteAllText($env:RELEASE_ENV_FIXTURE_EXPECTED, (ConvertTo-Json -InputObject @($fixtureExpectedChecks) -Depth 4), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($env:RELEASE_ENV_FIXTURE_EXPECTED_POST, (ConvertTo-Json -InputObject @($fixtureExpectedPostChecks) -Depth 4), [System.Text.UTF8Encoding]::new($false))`;
  assert.match(source, anchor, 'fixture insertion point is after the complete unmodified check list');
  source = source.replace(anchor, match => `${dispatchOverride}\r\n\r\n${expectedCapture}\r\n\r\n${match}`);
  fs.writeFileSync(preflightPath, source, 'utf8');
}

function createPreflightFixture(parent, stoneMode = 'pass') {
  const fixtureRoot = path.join(parent, 'full preflight workspace 中文 space');
  fs.mkdirSync(fixtureRoot);
  copyTrackedRepositoryFiles(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, '石材固定', 'stone-report.contract.test.js'), fixtureStoneContract(), 'utf8');
  installPreflightFixtureOverrides(fixtureRoot);
  initializeFixtureGit(fixtureRoot);
  const dispatchPath = path.join(parent, 'actual dispatch list.jsonl');
  const expectedPath = path.join(parent, 'expected formal checks.json');
  const expectedPostPath = path.join(parent, 'expected post checks.json');
  const fixtureReceiptPath = path.join(parent, 'fixture receipt.json');
  fs.writeFileSync(fixtureReceiptPath, JSON.stringify({
    scope: 'isolated full preflight fixture',
    real: ['release-preflight-lock.ps1', 'release-environment.ps1', 'environment-precheck hook', 'formal $checks array and foreach loop', 'three formal post-check invocations'],
    replaced: ['Invoke-PreflightCheck body writes dispatch records instead of launching the expensive commands', 'Start-Process tail returns fixture success without launching Node'],
    processSafety: 'Fixture script scope shadows Get-Process with an empty result while the original Clear-PreflightRuntimeProcesses function remains unchanged; no production module-import workaround is injected.',
    protectedClearSha256: clearFunctionBaselineSha256,
    dispatchPath,
    expectedPath,
    expectedPostPath,
  }, null, 2));
  return { fixtureRoot, dispatchPath, expectedPath, expectedPostPath, fixtureReceiptPath, stoneMode };
}

function fixtureStoneContract() {
  return String.raw`'use strict';
const { spawnSync } = require('node:child_process');
const mode = process.env.RELEASE_ENV_CONTRACT_STONE_MODE || 'pass';
if (mode === 'contract-fail') {
  console.error('fixture artifact contract failure');
  process.exit(37);
}
if (mode === 'converter-fail') {
  const result = spawnSync('python', ['-c', "from pdf2docx import Converter; Converter('fixture.pdf').convert('fixture.docx')"], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status == null ? 1 : result.status);
}
const result = spawnSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
if (result.stdout) process.stdout.write('fixture-python=' + result.stdout.trim() + '\n');
process.stdout.write('fixture-pythonpath=' + (process.env.PYTHONPATH || '') + '\n');
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status == null ? 1 : result.status);
`;
}

function initializeFixtureGit(fixtureRoot) {
  const commands = [
    ['init', '-q'],
    ['config', 'user.name', 'Release Environment Fixture'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['add', '--all'],
    ['commit', '-q', '-m', 'Create isolated release environment fixture'],
  ];
  for (const args of commands) {
    const result = run('git', ['-C', fixtureRoot, ...args], { cwd: fixtureRoot, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
}

function createFixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'release environment 中文 '));
  const fixtureRoot = path.join(parent, 'fixture workspace 中文 space');
  fs.mkdirSync(fixtureRoot);
  copyTrackedStoneFiles(fixtureRoot);
  const stoneContractPath = path.join(fixtureRoot, '石材固定', 'stone-report.contract.test.js');
  fs.writeFileSync(stoneContractPath, fixtureStoneContract(), 'utf8');
  initializeFixtureGit(fixtureRoot);
  return { parent, fixtureRoot };
}

function makeVenv(parent, label, systemSitePackages = true) {
  const basePython = fixturePython(process.env);
  const venvDirectory = path.join(parent, `${label} 環境 with spaces`);
  const args = ['-m', 'venv', '--without-pip'];
  if (systemSitePackages) args.push('--system-site-packages');
  args.push(venvDirectory);
  const created = run(basePython, args, { timeout: 120000 });
  assert.equal(created.status, 0, created.stderr || created.stdout);
  const executable = path.join(venvDirectory, 'Scripts', 'python.exe');
  assert.ok(fs.existsSync(executable), `venv interpreter missing: ${executable}`);
  return { directory: venvDirectory, executable };
}

function addSiteModule(venv, name, source) {
  const sitePackages = path.join(venv.directory, 'Lib', 'site-packages');
  fs.mkdirSync(sitePackages, { recursive: true });
  const destination = path.join(sitePackages, ...name.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source, 'utf8');
  return destination;
}

function runPrecheck(fixtureRoot, env, timeout = 240000, scenarioName = '') {
  const helperPath = path.join(fixtureRoot, helperRelativePath);
  const attemptRoot = path.join(fixtureRoot, 'output', 'preflight', 'environment-precheck');
  const resolvedAttemptRoot = path.resolve(attemptRoot);
  assert.ok(resolvedAttemptRoot.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`), 'attempt cleanup stays inside isolated fixture');
  fs.rmSync(resolvedAttemptRoot, { recursive: true, force: true });
  const source = [
    "$ErrorActionPreference = 'Stop'",
    `. ${psQuote(helperPath)}`,
    `try { $state = Invoke-ReleaseEnvironmentPrecheck -WorkspaceRoot ${psQuote(fixtureRoot)} -SourceCommitSha 'fixture-source-sha' -SourceBranch 'fixture'; Write-Output ('FIXTURE_STATE=' + ($state | ConvertTo-Json -Depth 12 -Compress)); exit 0 } catch { Write-Error $_; exit 23 }`,
  ].join('; ');
  const result = run(powershellPath(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedPowerShell(source)], {
    cwd: fixtureRoot,
    env,
    timeout,
  });
  const stateLine = `${result.stdout || ''}\n${result.stderr || ''}`.split(/\r?\n/).find(line => line.startsWith('FIXTURE_STATE='));
  let state = null;
  if (stateLine) state = JSON.parse(stateLine.slice('FIXTURE_STATE='.length));
  const attempts = fs.existsSync(attemptRoot)
    ? fs.readdirSync(attemptRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())
    : [];
  const receiptPaths = attempts.map(entry => path.join(attemptRoot, entry.name, 'receipt.json'));
  const receipts = receiptPaths.filter(file => fs.existsSync(file)).map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  const existingReceiptPaths = receiptPaths.filter(file => fs.existsSync(file));
  if (scenarioName) snapshotOutcome(path.dirname(fixtureRoot), scenarioName, result,
    existingReceiptPaths.map(file => ({ path: file })));
  return { result, state, attempts, receipts, receiptPaths: existingReceiptPaths };
}

function cleanFixture(parent) {
  const resolvedParent = path.resolve(parent);
  const tempRoot = path.resolve(os.tmpdir());
  assert.ok(resolvedParent.startsWith(`${tempRoot}${path.sep}`), `refusing to remove fixture outside temp: ${resolvedParent}`);
  fs.rmSync(resolvedParent, { recursive: true, force: true });
}

function assertFailedReceipt(outcome, label) {
  assert.notEqual(outcome.result.status, 0, `${label}: helper unexpectedly passed`);
  assert.equal(outcome.receipts.length, 1, `${label}: expected one private attempt receipt`);
  const [receipt] = outcome.receipts;
  assert.equal(receipt.pass, false, `${label}: receipt must record pass=false`);
  assert.notEqual(Number(receipt.exitCode), 0, `${label}: receipt must preserve a nonzero exit code`);
  return receipt;
}

function commandText(receipt, name) {
  const command = receipt.commands.find(item => item.name === name);
  assert.ok(command, `receipt is missing command ${name}`);
  return `${fs.existsSync(command.stdout) ? fs.readFileSync(command.stdout, 'utf8') : ''}\n${fs.existsSync(command.stderr) ? fs.readFileSync(command.stderr, 'utf8') : ''}`;
}

function testStaticContract() {
  for (const token of [
    'function Invoke-ReleaseEnvironmentPrecheck',
    'function Set-ReleaseEnvironmentRunLink',
    'STRUCTURAL_TOOLS_PYTHON',
    'SourceCommitSha',
    'SourceBranch',
    'attemptId',
    'receipt.json',
    'pythonExecutable',
    'environment',
    'function Assert-ReleaseEnvironmentPinned',
    'Set-ReleaseEnvironmentRunLink',
  ]) assertIncludes(helperSource, token, 'release environment helper contract');

  assertIncludes(preflightSource, 'Invoke-ReleaseEnvironmentPrecheck', 'preflight invokes the environment precheck');
  assertIncludes(preflightSource, 'Set-ReleaseEnvironmentRunLink', 'preflight links only a successful precheck to its formal run');
  assert.ok(preflightSource.indexOf('Release preflight requires a clean Git worktree') < preflightSource.indexOf('Invoke-ReleaseEnvironmentPrecheck'), 'precheck runs after release source cleanliness is established');
  const precheckIndex = preflightSource.indexOf('Invoke-ReleaseEnvironmentPrecheck');
  const historyCallMatch = /^Update-PreflightHistoryManifest\s*$/m.exec(preflightSource);
  const historyCallIndex = historyCallMatch ? historyCallMatch.index : -1;
  assert.ok(precheckIndex >= 0 && historyCallIndex > precheckIndex, 'precheck runs before formal history refresh');
  assert.ok(preflightSource.indexOf('Invoke-ReleaseEnvironmentPrecheck') < preflightSource.indexOf('$runStamp = Get-Date -Format'), 'precheck runs before a formal run id is created');

  assertIncludes(releaseWrapper, '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'release wrapper pins native Windows PowerShell 5.1');
  assert.match(releaseWrapper, /^"%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe".*-ForceSlowChecks.*-ForcePlatformAudit\s*$/m, 'release batch directly invokes native Windows PowerShell 5.1 with release flags');
  assert.ok(!/\belse\s*\(/i.test(releaseWrapper), 'release batch has no legacy PowerShell fallback branch');
  assert.ok(!/\bwhere\s+pwsh\b/i.test(releaseWrapper), 'release wrapper does not select PowerShell 7');
  assert.ok(!/\bpwsh(?:\.exe)?\s+-NoProfile/i.test(releaseWrapper), 'release wrapper does not invoke PowerShell 7');
  for (const token of ['-Quiet', '-ForceSlowChecks', '-ForcePlatformAudit']) assertIncludes(releaseWrapper, token, 'release wrapper retains forced release arguments');
  assert.ok(!releaseWrapper.includes('%*') && !releaseWrapper.includes('-Quick'), 'release wrapper rejects arbitrary and quick-mode arguments');

  assertIncludes(envCheckSource, 'def probe_json()', 'stone environment checker exposes full import probe');
  assertIncludes(envCheckSource, "'--json' in sys.argv[1:]", 'stone environment checker preserves its default CLI while adding JSON mode');
  for (const moduleName of ['docx', 'lxml.etree', 'pdf2docx', 'fitz', 'fontTools', 'fire', 'cv2', 'numpy', 'pypdf', 'playwright.sync_api']) {
    assertIncludes(envCheckSource, `'${moduleName}'`, `JSON environment probe imports ${moduleName}`);
  }
  assertIncludes(envCheckSource, "'executable': sys.executable", 'JSON environment probe reports the running interpreter');
  assertIncludes(envCheckSource, "getattr(module, 'Document')", 'JSON environment probe validates the DOCX generator symbol');
  assertIncludes(envCheckSource, "getattr(module, 'Converter')", 'JSON environment probe validates the PDF converter symbol');
  assertIncludes(stoneContractSource, 'auto_word_artifact_test.AutoWordArtifactTests.test_formal_auto_word_outputs_pdf_docx_with_review_notes_and_boundaries', 'original stone contract keeps the full artifact test');
  assertIncludes(autoWordArtifactSource, 'self.assertGreater(pdf_path.stat().st_size, 1_000_000)', 'stone artifact contract keeps the PDF size threshold');
  assertIncludes(autoWordArtifactSource, 'self.assertGreater(docx_path.stat().st_size, 120_000)', 'stone artifact contract keeps the DOCX size threshold');

  assertIncludes(lockSource, 'WaitOne(0)', 'release lock remains nonblocking');
  assertIncludes(lockSource, 'Another formal release preflight is already running for this workspace', 'release lock fails closed when occupied');

  const clearStart = preflightSource.indexOf('function Clear-PreflightRuntimeProcesses {');
  const clearEnd = preflightSource.indexOf('\nfunction Write-JsonFile {', clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart, 'locate the complete protected process cleanup function');
  const clearFunction = preflightSource.slice(clearStart, clearEnd).trimEnd().replace(/\r\n/g, '\n');
  assert.equal(require('node:crypto').createHash('sha256').update(clearFunction).digest('hex'), clearFunctionBaselineSha256,
    'Clear-PreflightRuntimeProcesses remains byte-for-byte equal to the execution-before protected AST');
  const checksDeclaration = preflightSource.match(/^\$checks = @\(\r?\n  \[pscustomobject\]@\{[\s\S]*?^\)/m);
  assert.ok(checksDeclaration, 'locate the original formal 70-check declaration');
  assert.equal(require('node:crypto').createHash('sha256').update(checksDeclaration[0].replace(/\r\n/g, '\n')).digest('hex'), checksDeclarationBaselineSha256,
    'the 70-check key/order/command declaration remains byte-for-byte equal to its protected execution-before node');
}

function runFormalPreflight(fixture, env, timeout = 300000, scenarioName = '') {
  const scriptPath = path.join(fixture.fixtureRoot, 'preflight-tools.ps1');
  const result = run(powershellPath(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    '-Quiet', '-ForceSlowChecks', '-ForcePlatformAudit'], {
    cwd: fixture.fixtureRoot,
    env: {
      ...env,
      RELEASE_ENV_FIXTURE_DISPATCH: fixture.dispatchPath,
      RELEASE_ENV_FIXTURE_EXPECTED: fixture.expectedPath,
      RELEASE_ENV_FIXTURE_EXPECTED_POST: fixture.expectedPostPath,
      PREFLIGHT_RUN_DIR: 'fixture-parent-run-dir-sentinel',
      PREFLIGHT_CHECK_KEY: 'fixture-parent-check-key-sentinel',
      PREFLIGHT_RELEASE: 'fixture-parent-release-sentinel',
      STONE_RENDERED_EVIDENCE_DIR: 'fixture-parent-stone-dir-sentinel',
      RELEASE_ENV_FIXTURE_EXPECTED_PARENT_RUN_DIR: 'fixture-parent-run-dir-sentinel',
      RELEASE_ENV_FIXTURE_EXPECTED_PARENT_CHECK_KEY: 'fixture-parent-check-key-sentinel',
      RELEASE_ENV_FIXTURE_EXPECTED_PARENT_RELEASE: 'fixture-parent-release-sentinel',
      RELEASE_ENV_FIXTURE_EXPECTED_PARENT_STONE_DIR: 'fixture-parent-stone-dir-sentinel',
    },
    timeout,
  });
  const attemptRoot = path.join(fixture.fixtureRoot, 'output', 'preflight', 'environment-precheck');
  const attempts = fs.existsSync(attemptRoot)
    ? fs.readdirSync(attemptRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())
    : [];
  const receipts = attempts.map(entry => path.join(attemptRoot, entry.name, 'receipt.json'))
    .filter(file => fs.existsSync(file))
    .map(file => ({ path: file, value: JSON.parse(fs.readFileSync(file, 'utf8')) }));
  if (scenarioName) snapshotOutcome(path.dirname(fixture.fixtureRoot), scenarioName, result, receipts);
  return { result, receipts };
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/, '')));
}

function launchMutexHolder(fixture, readyPath, releasePath) {
  const lockPath = path.join(fixture.fixtureRoot, '結構工具箱', 'tools', 'release-preflight-lock.ps1');
  const source = [
    "$ErrorActionPreference = 'Stop'",
    `. ${psQuote(lockPath)}`,
    `$state = Enter-ReleasePreflightLock -WorkspaceRoot ${psQuote(fixture.fixtureRoot)}`,
    `[System.IO.File]::WriteAllText(${psQuote(readyPath)}, 'locked')`,
    `while (-not (Test-Path -LiteralPath ${psQuote(releasePath)})) { Start-Sleep -Milliseconds 100 }`,
    'Exit-ReleasePreflightLock -Mutex $state.Mutex -Acquired $true',
  ].join('; ');
  const child = childProcess.spawn(powershellPath(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedPowerShell(source)], {
    cwd: fixture.fixtureRoot,
    windowsHide: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 15000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(readyPath) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 50);
  assert.ok(fs.existsSync(readyPath), 'real PowerShell 5.1 mutex holder acquired the fixture lock');
  return child;
}

function waitForChildExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mutex holder did not exit and release its real lock')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`mutex holder exited unexpectedly: code=${code}, signal=${signal}`));
      else resolve();
    });
  });
}

function assertCanAcquireFixtureLock(fixture) {
  const lockPath = path.join(fixture.fixtureRoot, '結構工具箱', 'tools', 'release-preflight-lock.ps1');
  const source = `$ErrorActionPreference = 'Stop'; . ${psQuote(lockPath)}; $s = Enter-ReleasePreflightLock -WorkspaceRoot ${psQuote(fixture.fixtureRoot)}; Exit-ReleasePreflightLock -Mutex $s.Mutex -Acquired $true; exit 0`;
  const result = run(powershellPath(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedPowerShell(source)], {
    cwd: fixture.fixtureRoot,
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function main() {
  testStaticContract();

  if (process.platform !== 'win32') {
    throw new Error('release environment fixtures require Windows PowerShell 5.1 and Windows Python venvs');
  }
  assert.ok(fs.existsSync(powershellPath()), `Windows PowerShell 5.1 executable missing: ${powershellPath()}`);

  const { parent, fixtureRoot } = createFixture();
  let formalFixture = null;
  let retainedEvidencePath = null;
  try {
    const healthy = makeVenv(parent, 'python 中文 healthy', true);
    const alternate = makeVenv(parent, 'python alternate', true);

    // Invalid explicit interpreter: fail before any probe or stone command and keep a private failure receipt.
    {
      const outcome = runPrecheck(fixtureRoot, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: path.join(parent, 'missing python 中文.exe'),
      }, 240000, '01-invalid-selected-python');
      const receipt = assertFailedReceipt(outcome, 'invalid STRUCTURAL_TOOLS_PYTHON');
      assert.equal(receipt.commands.length, 0, 'invalid explicit Python fails before probe commands start');
      assert.match(String(receipt.error), /STRUCTURAL_TOOLS_PYTHON|python/i);
    }

    // An alternate PATH Python must not replace the explicit process-scoped interpreter.
    {
      const env = {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: healthy.executable,
        PATH: `${path.dirname(alternate.executable)};${process.env.PATH || ''}`,
        PYTHONPATH: path.join(parent, 'preserved PYTHONPATH 中文'),
        RELEASE_ENV_CONTRACT_STONE_MODE: 'pass',
      };
      const outcome = runPrecheck(fixtureRoot, env);
      snapshotOutcome(parent, '02-explicit-python-pinned-and-pythonpath-preserved', outcome.result,
        outcome.receiptPaths.map(file => ({ path: file })));
      assert.equal(outcome.result.status, 0, outcome.result.stderr || outcome.result.stdout);
      assert.equal(outcome.receipts.length, 1);
      const receipt = outcome.receipts[0];
      assert.equal(receipt.pass, true, 'healthy precheck writes pass=true');
      assert.equal(receipt.sourceDirty, false, 'receipt records the actual clean Git source state');
      assert.ok(Object.hasOwn(receipt, 'artifactSummary'), 'receipt schema reserves private artifact measurement summary');
      assert.equal(path.resolve(receipt.pythonExecutable), path.resolve(healthy.executable));
      assert.equal(path.resolve(receipt.environment.python.executable), path.resolve(healthy.executable));
      assert.equal(receipt.commands.length, 4, 'Python identity, probe, stone self-check, and full stone report contract all run');
      const contractCommand = receipt.commands.find(command => command.name === 'stone_contract');
      assert.ok(contractCommand, 'receipt identifies the full stone report contract command');
      const contractOutput = fs.readFileSync(contractCommand.stdout, 'utf8');
      const reportedPython = contractOutput.match(/^fixture-python=(.+)$/m);
      assert.ok(reportedPython, 'stone contract reports its Python interpreter');
      assert.equal(path.resolve(reportedPython[1]), path.resolve(healthy.executable), 'stone contract launches the selected Python from process PATH');
      const reportedPythonPath = contractOutput.match(/^fixture-pythonpath=(.*)$/m);
      assert.ok(reportedPythonPath, 'stone contract reports the inherited PYTHONPATH');
      assert.equal(reportedPythonPath[1], env.PYTHONPATH, 'process-scoped Python pin preserves the original PYTHONPATH');
      assert.ok(healthy.directory.includes('中文') && healthy.directory.includes('spaces'), 'selected Python path contains Chinese and spaces');
    }

    // find_spec can succeed while importing the module fails; the probe must catch the import error.
    {
      const poisoned = makeVenv(parent, 'python import failure', true);
      addSiteModule(poisoned, 'fitz.py', "raise RuntimeError('fixture import failure after module discovery')\n");
      const outcome = runPrecheck(fixtureRoot, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: poisoned.executable,
      }, 240000, '03-discovered-module-import-fails');
      const receipt = assertFailedReceipt(outcome, 'find_spec succeeds but import fails');
      assert.match(commandText(receipt, 'env_probe'), /fitz|fixture import failure/i);
      assert.equal(receipt.commands.length, 2, 'an import-chain failure stops after identity and before self-check/report contract');
    }

    // A venv without system packages proves missing dependencies fail without any installer path.
    {
      const empty = makeVenv(parent, 'python missing packages', false);
      const outcome = runPrecheck(fixtureRoot, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: empty.executable,
      }, 240000, '04-missing-dependencies-without-install');
      const receipt = assertFailedReceipt(outcome, 'missing Python packages');
      const probeText = commandText(receipt, 'env_probe');
      assert.match(probeText, /python-docx|playwright|pdf2docx|missing/i);
      assert.ok(!probeText.includes('pip install'), 'precheck does not offer or execute automatic package installation');
    }

    // The import chain can load a converter whose actual conversion operation fails.
    {
      const brokenConverter = makeVenv(parent, 'python converter failure', true);
      const packagePath = path.join(brokenConverter.directory, 'Lib', 'site-packages', 'pdf2docx');
      fs.mkdirSync(packagePath, { recursive: true });
      fs.writeFileSync(path.join(packagePath, '__init__.py'), [
        'class Converter:',
        '    def __init__(self, *args, **kwargs): pass',
        "    def convert(self, *args, **kwargs): raise RuntimeError('fixture converter failure')",
      ].join('\n') + '\n', 'utf8');
      const outcome = runPrecheck(fixtureRoot, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: brokenConverter.executable,
        RELEASE_ENV_CONTRACT_STONE_MODE: 'converter-fail',
      }, 240000, '05-converter-operation-fails');
      const receipt = assertFailedReceipt(outcome, 'converter operation failure');
      assert.match(commandText(receipt, 'stone_contract'), /fixture converter failure|convert/i);
      assert.equal(receipt.commands.length, 4, 'converter failure is retained as the stone contract command result');
    }

    // The unmodified helper must preserve a nonzero result from the full-contract command.
    {
      const outcome = runPrecheck(fixtureRoot, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: healthy.executable,
        RELEASE_ENV_CONTRACT_STONE_MODE: 'contract-fail',
      }, 240000, '06-stone-contract-nonzero-preserved');
      const receipt = assertFailedReceipt(outcome, 'stone artifact contract nonzero exit');
      assert.equal(Number(receipt.commands[3].exitCode), 37, 'stone contract exit code is preserved in the receipt');
      assert.match(commandText(receipt, 'stone_contract'), /fixture artifact contract failure/);
    }

    // Real preflight lock: a competing process must fail before environment receipt or dispatch.
    formalFixture = createPreflightFixture(parent);
    const readyPath = path.join(parent, 'mutex holder ready.txt');
    const releasePath = path.join(parent, 'mutex holder release.txt');
    const holder = launchMutexHolder(formalFixture, readyPath, releasePath);
    try {
      const busy = runFormalPreflight(formalFixture, {
        ...process.env,
        STRUCTURAL_TOOLS_PYTHON: path.join(parent, 'must not be reached.exe'),
      }, 300000, '07-lock-busy-skips-precheck-and-dispatch');
      assert.notEqual(busy.result.status, 0, 'overlapping formal preflight fails closed');
      assert.match(`${busy.result.stderr || ''}\n${busy.result.stdout || ''}`, /already running for this workspace/i);
      assert.equal(busy.receipts.length, 0, 'busy mutex prevents environment precheck and receipt creation');
      assert.deepEqual(readJsonLines(formalFixture.dispatchPath), [], 'busy mutex prevents all formal and post-check dispatch');
      assert.equal(fs.existsSync(formalFixture.expectedPath), false, 'busy mutex exits before the fixture captures the check list');
    } finally {
      fs.writeFileSync(releasePath, 'release');
      await waitForChildExit(holder);
    }

    // A real precheck failure traps through the original cleanup path and releases the mutex.
    const failedPrecheck = runFormalPreflight(formalFixture, {
      ...process.env,
      STRUCTURAL_TOOLS_PYTHON: path.join(parent, 'missing interpreter.exe'),
    }, 300000, '08-failed-precheck-releases-lock-and-skips-dispatch');
    assert.notEqual(failedPrecheck.result.status, 0, 'invalid explicit Python fails the formal preflight before any expensive runner');
    assert.equal(failedPrecheck.receipts.length, 1, 'failed formal environment precheck keeps one private receipt');
    assert.equal(failedPrecheck.receipts[0].value.pass, false);
    assert.notEqual(Number(failedPrecheck.receipts[0].value.exitCode), 0);
    assert.equal(readJsonLines(formalFixture.dispatchPath).length, 0, 'failed precheck launches zero expensive checks');
    assertCanAcquireFixtureLock(formalFixture);

    // The successful run uses the real precheck, lock, unmodified key/command list, loop, and three post-checks.
    const succeeded = runFormalPreflight(formalFixture, {
      ...process.env,
      STRUCTURAL_TOOLS_PYTHON: healthy.executable,
      RELEASE_ENV_CONTRACT_STONE_MODE: 'pass',
    }, 480000, '09-successful-70-plus-3-real-loop-dispatch');
    assert.equal(succeeded.result.status, 0, succeeded.result.stderr || succeeded.result.stdout);
    assert.equal(succeeded.receipts.length, 2, 'the failed attempt remains alongside the successful private attempt receipt');
    const successfulReceipt = succeeded.receipts.map(item => item.value).find(item => item.pass === true);
    assert.ok(successfulReceipt, 'successful formal precheck writes pass=true receipt');
    const expectedChecks = JSON.parse(fs.readFileSync(formalFixture.expectedPath, 'utf8'));
    const expectedPostChecks = JSON.parse(fs.readFileSync(formalFixture.expectedPostPath, 'utf8'));
    const dispatched = readJsonLines(formalFixture.dispatchPath);
    assert.equal(expectedChecks.length, 70, 'original formal check declaration contains 70 entries');
    assert.equal(dispatched.length, 73, 'successful full release loop dispatches 70 original checks and exactly three post-checks');
    assert.deepEqual(dispatched.slice(0, 70).map(({ key, command }) => ({ key, command })), expectedChecks,
      'each original key and command is dispatched once, in the original order and byte-for-byte command text');
    assert.deepEqual(dispatched.slice(70).map(({ key, command }) => ({ key, command })), expectedPostChecks,
      'all three original post-checks dispatch in order with unchanged command text');
    assert.ok(dispatched.every(record => path.resolve(record.pinnedPython) === path.resolve(healthy.executable)),
      'Assert-ReleaseEnvironmentPinned accepts the helper-selected interpreter before every formal and post check');
    const formalRunLink = path.join(path.dirname(successfulReceipt.commands[0].stdout), 'formal-run-link.json');
    assert.ok(fs.existsSync(formalRunLink), 'successful precheck is privately linked only after a formal run id exists');
    const link = JSON.parse(fs.readFileSync(formalRunLink, 'utf8'));
    assert.equal(link.attemptId, successfulReceipt.attemptId);
    assert.match(link.runId, /^\d{8}-\d{6}$/);
    const successfulReceiptPath = succeeded.receipts.find(item => item.value.pass).path;
    assert.equal(String(link.receiptSha256).toLowerCase(), require('node:crypto').createHash('sha256').update(fs.readFileSync(successfulReceiptPath)).digest('hex'),
      'formal link records the SHA256 of the exact successful receipt bytes');
    const formalRunDirectory = path.join(formalFixture.fixtureRoot, 'output', 'preflight', 'history', link.runId);
    assert.ok(fs.existsSync(formalRunDirectory), 'formal run link points to the actual newly-created history directory');
    assert.ok(dispatched.every(record => record.preflightRelease === '1' && record.checkKey === record.key &&
      path.resolve(record.runDir) === path.resolve(formalRunDirectory) && !record.runDir.includes('environment-precheck')),
      'formal child PREFLIGHT_* values point to its own formal run, never the private environment-precheck directory');
    assert.ok(dispatched.every(record => record.command && record.key), 'all dispatched records preserve their actual command/key inputs');
    assert.ok(succeeded.receipts.every(item => item.path.includes(path.join('output', 'preflight', 'environment-precheck'))),
      'both successful and failed receipts stay under private output/preflight/environment-precheck');
    const fixtureReceipt = JSON.parse(fs.readFileSync(formalFixture.fixtureReceiptPath, 'utf8'));
    assert.match(fixtureReceipt.processSafety, /shadows Get-Process with an empty result/);
    assert.ok(fs.existsSync(formalFixture.dispatchPath), 'fixture receipt points to a retained actual dispatch list');

    console.log('release environment static, direct-helper, mutex, failure, and successful 70+3 dispatch fixtures OK');
  } finally {
    try {
      retainedEvidencePath = persistFixtureEvidence(parent, formalFixture);
      if (retainedEvidencePath) console.log(`fixture evidence retained at ${retainedEvidencePath}`);
    } catch (preserveError) {
      console.error(`fixture evidence preservation failed: ${preserveError.message}`);
    }
    cleanFixture(parent);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
