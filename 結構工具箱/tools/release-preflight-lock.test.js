'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');

const helperPath = path.join(__dirname, 'release-preflight-lock.ps1');
const powershell = process.platform === 'win32'
  ? (childProcess.spawnSync('where.exe', ['pwsh'], { encoding: 'utf8' }).status === 0 ? 'pwsh' : 'powershell')
  : 'pwsh';

function encodedCommand(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function command(workspace, { holdMilliseconds = 0 } = {}) {
  return [
    "$ErrorActionPreference='Stop'",
    `. ${psLiteral(helperPath)}`,
    `$state=Enter-ReleasePreflightLock -WorkspaceRoot ${psLiteral(workspace)}`,
    "Write-Output ('ACQUIRED abandoned=' + $state.Abandoned.ToString().ToLowerInvariant())",
    '[Console]::Out.Flush()',
    holdMilliseconds > 0 ? `Start-Sleep -Milliseconds ${holdMilliseconds}` : '',
    'Exit-ReleasePreflightLock -Mutex $state.Mutex -Acquired $true',
  ].filter(Boolean).join('; ');
}

function run(workspace, options = {}) {
  return childProcess.spawnSync(
    powershell,
    ['-NoProfile', '-EncodedCommand', encodedCommand(command(workspace, options))],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
}

function waitForAcquired(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`lock holder did not become ready: ${stderr || stdout}`)), 10000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.includes('ACQUIRED')) {
        clearTimeout(timer);
        resolve(stdout);
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('exit', code => {
      if (!stdout.includes('ACQUIRED')) {
        clearTimeout(timer);
        reject(new Error(`lock holder exited early (${code}): ${stderr || stdout}`));
      }
    });
  });
}

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

(async () => {
  const workspace = path.resolve(__dirname, '..', '..');
  const alternateWorkspace = `${workspace}-independent-lock-test`;

  const first = run(workspace);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.match(first.stdout, /ACQUIRED abandoned=false/);
  const secondAfterRelease = run(workspace);
  assert.equal(secondAfterRelease.status, 0, secondAfterRelease.stderr || secondAfterRelease.stdout);

  const holder = childProcess.spawn(
    powershell,
    ['-NoProfile', '-EncodedCommand', encodedCommand(command(workspace, { holdMilliseconds: 30000 }))],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await waitForAcquired(holder);

  const competitor = run(workspace);
  assert.notEqual(competitor.status, 0, 'same-workspace overlapping release lock must fail closed');
  assert.match(`${competitor.stderr}\n${competitor.stdout}`, /Another formal release preflight is already running for this workspace/);

  const independent = run(alternateWorkspace);
  assert.equal(independent.status, 0, independent.stderr || independent.stdout);
  assert.match(independent.stdout, /ACQUIRED abandoned=false/);

  const holderExit = waitForExit(holder);
  holder.kill();
  await holderExit;
  const takeover = run(workspace);
  assert.equal(takeover.status, 0, takeover.stderr || takeover.stdout);
  assert.match(takeover.stdout, /ACQUIRED abandoned=(?:true|false)/, 'OS mutex leaves no stale lock after holder termination');

  console.log('release preflight lock contract OK (same workspace blocked, separate workspace allowed, forced termination recovered)');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
