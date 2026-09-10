// Run against a freshly extracted pinned artifact; restores every tampered byte.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), site = path.resolve(process.argv[2]);
const recorder = fs.readFileSync(path.join(site, 'field-survey/recorder.html'));
for (const [name, message] of [['index.html', /Baseline artifact mismatch/], ['field-survey/release.json', /Pinned survey artifact receipt mismatch/]]) {
  const file = path.join(site, name), original = fs.readFileSync(file);
  try {
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from('\nsynthetic-corruption')]));
    const result = spawnSync(process.execPath, ['field-survey/release.mjs', 'stage', site, '--draft'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, message); assert.deepEqual(fs.readFileSync(path.join(site, 'field-survey/recorder.html')), recorder);
  } finally { fs.writeFileSync(file, original); }
}
console.log('PASS modified surrounding site or pinned survey receipt is rejected before overlay writes');
