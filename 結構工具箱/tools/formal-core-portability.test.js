"use strict";
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-core-portability-'));
const manifestPath = '鋼構工具/core/formal-core-manifest.json', scriptPath = '鋼構工具/sync-formal-core.ps1';
const files = [manifestPath, scriptPath, '結構工具箱/core/materials/steel.js', '結構工具箱/core/ui/report.js', '結構工具箱/core/ui/report-utils.js', '結構工具箱/core/direct-print-boundary.css', '鋼構工具/core/materials/steel.js', '鋼構工具/core/ui/report.js', '鋼構工具/core/ui/report-utils.js', '鋼筋混凝土/shared/direct-print-boundary.css'];
try {
  for (const file of files) {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target);
  }
  const original = fs.readFileSync(path.join(fixture, manifestPath), 'utf8');
  const run = () => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture, scriptPath), '-Check', '-Quiet'], { encoding: 'utf8' });
  const clean = run(); assert.equal(clean.status, 0, `relocated exact files must pass: ${clean.stderr}`);
  for (const [name, mutate] of [
    ['source path', m => { m.files[0].source = m.files[0].source.replace('materials', 'wrong'); }],
    ['target path', m => { m.files[0].target = m.files[0].target.replace('materials', 'wrong'); }],
    ['source hash', m => { m.files[0].sourceHash = '0'.repeat(64); }],
    ['target hash', m => { m.files[0].targetHash = '0'.repeat(64); }],
    ['missing root', m => { delete m.toolRoot; }]
  ]) {
    const manifest = JSON.parse(original.replace(/^\uFEFF/, '')); mutate(manifest);
    fs.writeFileSync(path.join(fixture, manifestPath), '\uFEFF' + JSON.stringify(manifest));
    assert.notEqual(run().status, 0, `${name} corruption must be rejected`);
  }
  fs.writeFileSync(path.join(fixture, manifestPath), original);
  fs.appendFileSync(path.join(fixture, '鋼構工具/core/materials/steel.js'), '\n// corrupt fixture\n');
  assert.notEqual(run().status, 0, 'changed core bytes must be rejected');
  console.log('Formal core portability passed: relocated checkout and six corruption checks');
} finally {
  const resolved = path.resolve(fixture), tempRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('formal-core-portability-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
