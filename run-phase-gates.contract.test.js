const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const runnerPath = path.join(root, 'run-phase-gates.ps1');
const dispatchPath = path.join(root, '_tmp', '派工', '小工具優化派工指示-20261008-V3.md');

assert.ok(fs.existsSync(runnerPath), 'run-phase-gates.ps1 must exist');
assert.ok(fs.existsSync(dispatchPath), 'the original V3 dispatch must exist');

const dispatch = fs.readFileSync(dispatchPath, 'utf8');
const section = dispatch.match(/^## 0\.[\s\S]*?^```(?:bash|sh)?\s*\r?\n([\s\S]*?)^```/m);
assert.ok(section, 'V3 section 0 command block must exist');
const expectedCommands = section[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
assert.equal(expectedCommands.length, 28, 'V3 section 0 must contain the original 26 commands and two governance checks');
assert.deepEqual(expectedCommands.slice(-2), [
  'node 結構工具箱/tools/regulatory-data.contract.test.js',
  'node 結構工具箱/tools/sync-home-update-dates.js --check',
], 'the mirror parity and clean-tree homepage date checks must be appended in order');

const invokePowerShell = (args) => spawnSync('powershell', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', runnerPath,
  ...args,
], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 });

const listed = invokePowerShell(['-ListCommands']);
assert.equal(listed.error, undefined, `command extraction process should start: ${listed.error?.message}`);
assert.equal(listed.status, 0, `command extraction should pass: ${listed.stderr}`);
assert.deepEqual(JSON.parse(listed.stdout), expectedCommands, 'runner commands must exactly match V3 section 0 in order');

const timestampFor = (value) => {
  const pad = (part) => String(part).padStart(2, '0');
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
};
let timestampDate = new Date();
let timestamp = timestampFor(timestampDate);
while (fs.existsSync(path.join(root, 'output', 'phase-gates', timestamp))) {
  timestampDate = new Date(timestampDate.getTime() + 1000);
  timestamp = timestampFor(timestampDate);
}
const failedProbe = invokePowerShell(['-SelfTestFailure', '-RunTimestamp', timestamp]);
assert.equal(failedProbe.error, undefined, `failure probe process should start: ${failedProbe.error?.message}`);
assert.equal(failedProbe.status, 1, 'a failing injected command must make the runner exit 1');

const summaryPath = path.join(root, 'output', 'phase-gates', timestamp, 'summary.json');
assert.ok(fs.existsSync(summaryPath), 'failure probe must write summary.json');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
assert.equal(summary.passed, false, 'a nonzero command must set passed=false');
assert.equal(summary.commandCount, 1, 'the isolated failure probe must contain one injected command');
assert.equal(summary.results.length, 1);
assert.equal(summary.results[0].command, "node -e process.stderr.write('phase-gate-injected-failure');process.exit(23)");
assert.equal(summary.results[0].exitCode, 23);
assert.equal(summary.results[0].error, null);
assert.equal(summary.sourceFile, path.relative(root, dispatchPath).replace(/\\/g, '/'));
assert.ok(Number.isFinite(summary.results[0].durationMilliseconds));
assert.ok(Array.isArray(summary.results[0].stdoutTail));
assert.ok(Array.isArray(summary.results[0].stderrTail));
assert.ok(summary.results[0].stdoutTail.length <= 20);
assert.ok(summary.results[0].stderrTail.length <= 20);
assert.ok(summary.results[0].stdoutTail.every((line) => typeof line === 'string'));
assert.ok(summary.results[0].stderrTail.every((line) => typeof line === 'string'));
assert.match(summary.results[0].stderrTail.join('\n'), /phase-gate-injected-failure/);
assert.match(summary.headSha, /^[0-9a-f]{40}$/);
assert.equal(typeof summary.dirty, 'boolean');

console.log('run-phase-gates contract passed: exact V3 command extraction and failure recording');
