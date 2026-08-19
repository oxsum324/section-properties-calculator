'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const runner = path.join(root, 'run-all-tests.ps1');
const source = fs.readFileSync(runner, 'utf8');

for (const token of [
  'PASS',
  'FAIL_CODE',
  'BLOCKED_ENV',
  'UNSUPPORTED_DIRECT',
  'ensure-playwright-deps.ps1',
  "PreferredDirName '.beam-testdeps'",
  'node_modules\\vitest\\vitest.mjs',
  "--files -g '*.test.js' -g '*.test.ts'",
]) {
  assert.ok(source.includes(token), `runner keeps canonical token: ${token}`);
}

assert.match(
  source,
  /\$needsPlaywright = Select-String[^\r\n]+playwright/,
  'runner identifies direct Playwright consumers before execution',
);

const inventory = spawnSync('rg', ['--files', '-g', '*.test.js', '-g', '*.test.ts'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(inventory.status, 0, inventory.stderr || 'rg inventory failed');
const discoveredCount = inventory.stdout.split(/\r?\n/).filter(Boolean).length;

const list = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runner,
    '-ListOnly',
    '-PathPattern',
    '(^|[\\\\/])run-all-tests\\.contract\\.test\\.js$',
  ],
  { cwd: root, encoding: 'utf8' },
);

assert.equal(list.status, 0, list.stderr || list.stdout || 'list-only invocation failed');
assert.match(
  list.stdout,
  new RegExp(`Discovered:\\s+${discoveredCount}\\s+Selected:\\s+1`),
  'list mode reports the live repository inventory and one selected test',
);
assert.match(list.stdout, /node\s+run-all-tests\.contract\.test\.js/s, 'list mode routes the ASCII self-check through Node');
assert.doesNotMatch(list.stdout + list.stderr, /MODULE_NOT_FOUND/, 'list mode never probes Playwright by direct execution');

console.log('run-all-tests contract passed');
