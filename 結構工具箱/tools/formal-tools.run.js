const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function readJson(relativePath) {
  const fullPath = toolboxFile(relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assertFile(relativePath) {
  const fullPath = toolboxFile(relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`missing toolbox file: ${relativePath}`);
  }
  return fullPath;
}

const transientRunDelaysMs = [0, 5000, 15000, 30000, 60000];

function waitSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isTransientRunFailure(run) {
  if (run.error && ['EPERM', 'EACCES', 'EBUSY'].includes(run.error.code)) return true;
  const text = `${run.stdout || ''}\n${run.stderr || ''}\n${run.error ? run.error.message : ''}`;
  return /spawn(?:Sync)? .*EPERM|spawn EPERM|WinError 5|access is denied|Permission denied/i.test(text);
}

function runNode(label, relativePath, args = []) {
  const fullPath = assertFile(relativePath);
  let lastRun = null;
  for (let attempt = 0; attempt < transientRunDelaysMs.length; attempt += 1) {
    const run = spawnSync(process.execPath, [fullPath, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    lastRun = run;

    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.status === 0) {
      console.log(`[formal-tools] ${label} OK`);
      return;
    }

    const canRetry = attempt < transientRunDelaysMs.length - 1 && isTransientRunFailure(run);
    if (canRetry) {
      const delayMs = transientRunDelaysMs[attempt + 1];
      const detail = run.error ? run.error.message : `exitCode=${run.status}`;
      process.stderr.write(`[formal-tools] ${label} transient launch failure on attempt ${attempt + 1}: ${detail}; retrying in ${delayMs}ms\n`);
      waitSync(delayMs);
      continue;
    }

    if (run.error) process.stderr.write(`${label} spawn error: ${run.error.message}\n`);
    const detail = run.error ? ` (${run.error.message})` : (run.signal ? ` (signal ${run.signal})` : '');
    throw new Error(`${label} failed: ${relativePath}${detail}`);
  }

  const detail = lastRun && lastRun.error ? ` (${lastRun.error.message})` : '';
  throw new Error(`${label} failed: ${relativePath}${detail}`);
}
const manifest = readJson('tools/formal-tools.manifest.json');
if (manifest.family !== 'formal-tools') {
  throw new Error(`unexpected formal tools manifest family: ${manifest.family}`);
}
if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
  throw new Error('formal tools manifest has no tools');
}

assertFile(manifest.shared.contractTest);
assertFile(manifest.shared.browserSmokeTest);
assertFile(manifest.shared.maturityMatrix);

console.log(`[formal-tools] manifest v${manifest.version}: ${manifest.tools.length} tools`);
runNode('manifest contract regression', manifest.shared.contractTest);
runNode('browser smoke regression', manifest.shared.browserSmokeTest);
runNode('maturity matrix generation', manifest.shared.maturityMatrix, ['--write', '--check']);
console.log(`formal tools manifest runner OK (${manifest.tools.length} tools)`);
