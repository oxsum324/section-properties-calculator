'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const scriptPath = path.join(root, 'run-family-wrappers.ps1');
const expected = [
  { path: '鋼筋混凝土/tools/test-beam.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-column.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-slab.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-wall.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-shear-wall.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-foundation.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-single-pile.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-deep-beam-stm.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-foundation-deep-beam-stm.ps1', kind: 'powershell' },
  { path: '鋼筋混凝土/tools/test-pile-cap-3d-stm.ps1', kind: 'powershell' },
  { path: '鋼構工具/run-audit.bat', kind: 'batch' },
  { path: 'test-continuous-beam.ps1', kind: 'powershell' },
  { path: 'frame-analysis-browser-smoke.test.js', kind: 'node' },
  { path: '結構工具箱/tools/local-quick-browser-smoke.test.js', kind: 'node' },
];

function expectedCommand(entry) {
  if (entry.kind === 'powershell') {
    return `pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "${entry.path}"`;
  }
  if (entry.kind === 'batch') return `cmd /d /c call "${entry.path}"`;
  return `node "${entry.path}"`;
}

assert.ok(fs.existsSync(scriptPath), 'run-family-wrappers.ps1 must exist');
assert.equal(expected.length, 14, 'the contract defines all 14 entries explicitly');
for (const [index, entry] of expected.entries()) {
  assert.ok(fs.existsSync(path.join(root, entry.path)), `wrapper ${index + 1} exists: ${entry.path}`);
}

for (const shell of ['powershell', 'pwsh']) {
  const result = spawnSync(shell, [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ListCommands',
  ], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.error, undefined, `${shell} starts: ${result.error?.message ?? ''}`);
  assert.equal(result.status, 0, `${shell} -ListCommands exits 0; stderr=${result.stderr}`);
  const actual = JSON.parse(result.stdout.trim());
  assert.equal(actual.length, 14, `${shell} returns exactly 14 entries`);
  assert.deepEqual(actual.map(({ index, path: itemPath, kind, command }) => ({ index, path: itemPath, kind, command })),
    expected.map((entry, index) => ({ index: index + 1, ...entry, command: expectedCommand(entry) })),
    `${shell} preserves exact path, kind, order, and command`);
  assert.ok(actual.every((entry) => !path.isAbsolute(entry.path)), `${shell} uses only repo-relative paths`);
}

console.log('family wrapper contract OK (14 ordered commands; Windows PowerShell 5.1 and pwsh; list mode only)');
