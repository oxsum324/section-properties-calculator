// Survey-only overlay of a verified, already published Pages artifact.
// Existing whole-toolbox evidence stays attached to its original release.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { VERSION } from './model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(fs.readFileSync(new URL('./release-baseline.json', import.meta.url), 'utf8'));
const runtime = ['recorder.html', 'app.css', 'app.js', 'model.js', 'report.js', 'report-ui.js', 'store.js', 'bundle.js', 'annotation.js', 'sketch.js', 'stairs.js', 'cracks.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'sw.js'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', ['-C', root, ...args]);
const head = git(['rev-parse', 'HEAD']).toString().trim();
const draft = process.argv.includes('--draft');
const content = name => draft ? fs.readFileSync(path.join(root, 'field-survey', name)) : git(['show', `${head}:field-survey/${name}`]);
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Artifact must not contain symlinks');
    const name = prefix + entry.name, absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? files(absolute, name + '/') : [{ path: name, sha256: sha(fs.readFileSync(absolute)) }];
  }).sort((a, b) => ordinal(a.path, b.path));
}
async function remote(relative, base = baseline.url) {
  const response = await fetch(new URL(relative, base), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert(response.ok, `HTTP ${response.status}: ${relative}`); return Buffer.from(await response.arrayBuffer());
}
async function currentBaseline() {
  assert.equal(sha(await remote('pages-deployment.json')), baseline.manifestSha256, 'Published base changed; refresh survey baseline before deployment');
}
function sourceScope() {
  if (!draft) assert.equal(git(['status', '--porcelain', '--untracked-files=all']).toString().trim(), '', 'Release requires a clean source checkout');
  const changed = git(['diff', '--name-only', '--no-renames', '-z', baseline.commitSha, head]).toString().split('\0').filter(Boolean);
  assert(changed.every(name => name.startsWith('field-survey/') || ['.github/workflows/pages-deploy.yml', '.github/workflows/field-survey-deploy.yml'].includes(name)), 'Source changes exceed the survey module and its publishing entry');
}

const mode = process.argv[2];
if (mode === 'baseline') {
  await currentBaseline(); console.log('PASS current published baseline');
} else if (mode === 'stage') {
  sourceScope(); await currentBaseline();
  const site = path.resolve(process.argv[3] || ''); assert(site !== root && !root.startsWith(site + path.sep), 'Staging directory must be separate from source');
  const manifestBytes = fs.readFileSync(path.join(site, 'pages-deployment.json'));
  assert.equal(sha(manifestBytes), baseline.manifestSha256, 'Downloaded artifact manifest must match the pinned published release');
  const manifest = JSON.parse(manifestBytes); assert.equal(manifest.commitSha, baseline.commitSha); assert.equal(manifest.runId, baseline.runId);
  const before = files(site);
  const listed = new Map(manifest.files.map(f => [f.path, f.sha256]));
  for (const f of before) if (!['pages-deployment.json', '.nojekyll'].includes(f.path)) assert.equal(f.sha256, listed.get(f.path), `Baseline artifact mismatch: ${f.path}`);
  assert.equal(before.filter(f => !['pages-deployment.json', '.nojekyll'].includes(f.path)).length, listed.size, 'Baseline artifact is complete');
  for (const name of runtime) fs.writeFileSync(path.join(site, 'field-survey', name), content(name));
  const outside = inventory => inventory.filter(f => !f.path.startsWith('field-survey/'));
  assert.deepEqual(outside(files(site)), outside(before), 'Other published files must remain byte-for-byte unchanged');
  const receipt = { schemaVersion: 1, kind: 'field-survey-module-release', version: VERSION, sourceCommitSha: head, sourceDirty: draft, baseSiteCommitSha: baseline.commitSha, baseRunId: baseline.runId, baseManifestSha256: baseline.manifestSha256, validationScope: 'field-survey only; whole-toolbox evidence remains at the base release', unchangedOtherFiles: outside(before).length, files: runtime.map(name => ({ path: name, sha256: sha(content(name)) })) };
  fs.writeFileSync(path.join(site, 'field-survey', 'release.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`PASS staged survey V${VERSION}; ${receipt.unchangedOtherFiles} other files unchanged`);
} else if (mode === 'live') {
  await currentBaseline();
  const receipt = JSON.parse(await remote('field-survey/release.json'));
  assert.equal(receipt.sourceCommitSha, head); assert.equal(receipt.version, VERSION); assert.equal(receipt.sourceDirty, false);
  assert.equal(receipt.baseManifestSha256, baseline.manifestSha256);
  assert.deepEqual(receipt.files.map(f => f.path).sort(), [...runtime].sort());
  for (const file of receipt.files) {
    assert.equal(file.sha256, sha(content(file.path)), `Receipt source mismatch: ${file.path}`);
    assert.equal(sha(await remote('field-survey/' + file.path)), file.sha256, `Live module mismatch: ${file.path}`);
  }
  console.log(`PASS live survey V${VERSION}; ${runtime.length} files match ${head}`);
} else throw new Error('Use baseline, stage <extracted-site>, or live');
