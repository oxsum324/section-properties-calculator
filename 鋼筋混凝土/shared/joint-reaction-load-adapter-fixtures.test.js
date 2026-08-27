const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const LoadCombo = require('../../結構工具箱/core/loads/loadcombo.js');
const Adapter = require('./joint-reaction-load-adapter.js');

const fixtureDir = path.join(__dirname, 'fixtures', 'joint-reactions');
const manifestPath = path.join(fixtureDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const delimiters = { comma:',', tab:'\t', semicolon:';' };

assert.equal(manifest.schemaVersion, 'rc-joint-reaction-fixtures.v1');
assert.equal(manifest.fixturePolicy, 'synthetic-compatibility-only');
assert.equal(manifest.notEngineeringData, true);
assert.ok(Array.isArray(manifest.fixtures) && manifest.fixtures.length >= 6);
const observedManifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'observed-manifest.json'), 'utf8'));
assert.equal(observedManifest.schemaVersion, 'rc-joint-reaction-observed-fixtures.v1');
assert.equal(observedManifest.fixturePolicy, 'anonymized-observed-exports-only');
assert.ok(Array.isArray(observedManifest.fixtures));
const observedIds = new Set();
for (const observed of observedManifest.fixtures) {
  assert.ok(!observedIds.has(observed.id), `${observed.id}: observed fixture id must be unique`);
  observedIds.add(observed.id);
  assert.equal(observed.provenance, 'anonymized-observed-export', `${observed.id}: observed provenance classification`);
  const observedPath = path.join(fixtureDir, observed.file);
  const provenancePath = path.join(fixtureDir, observed.provenanceFile);
  assert.ok(fs.existsSync(observedPath), `${observed.id}: observed fixture exists`);
  assert.ok(fs.existsSync(provenancePath), `${observed.id}: committed provenance exists`);
  const observedRaw = fs.readFileSync(observedPath, 'utf8');
  const observedSha256 = crypto.createHash('sha256').update(Buffer.from(observedRaw, 'utf8')).digest('hex');
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  assert.equal(observedSha256, observed.sha256, `${observed.id}: observed SHA-256 drift`);
  assert.equal(provenance.schemaVersion, 'rc-joint-reaction-observed-provenance.v1', `${observed.id}: provenance schema`);
  assert.equal(provenance.output.sha256, observedSha256, `${observed.id}: provenance SHA-256 drift`);
  assert.equal(provenance.privacy.sourceHashCommitted, false, `${observed.id}: original source hash excluded`);
  assert.equal(Object.hasOwn(provenance, 'source'), false, `${observed.id}: committed provenance excludes source object`);
  const observedParsed = Adapter.parseTable(observedRaw);
  assert.equal(observedParsed.headerLine, observed.headerLine, `${observed.id}: observed header line drift`);
  assert.equal(observedParsed.rowCount, observed.rowCount, `${observed.id}: observed row count drift`);
}

const ids = new Set();
const referencedFiles = new Set();
for (const fixture of manifest.fixtures) {
  assert.ok(!ids.has(fixture.id), `fixture id must be unique: ${fixture.id}`);
  ids.add(fixture.id);
  referencedFiles.add(fixture.file);
  assert.ok(['ETABS', 'SAP2000'].includes(fixture.software), `${fixture.id}: software must be explicit`);
  assert.ok(Object.hasOwn(delimiters, fixture.format), `${fixture.id}: delimiter format must be controlled`);

  const raw = fs.readFileSync(path.join(fixtureDir, fixture.file), 'utf8');
  const parsed = Adapter.parseTable(raw);
  assert.equal(parsed.headerLine, fixture.headerLine, `${fixture.id}: header line drift`);
  assert.equal(parsed.delimiter, delimiters[fixture.format], `${fixture.id}: delimiter drift`);
  assert.ok(parsed.points.includes(fixture.pointKey), `${fixture.id}: selected point must exist`);

  const build = () => Adapter.buildPackage({
    loadCombo:LoadCombo,
    software:fixture.software,
    filename:fixture.file,
    parsed,
    pointKey:fixture.pointKey,
    unitProfile:fixture.unitProfile,
    cases:fixture.cases,
    verticalForce:fixture.verticalForce,
    verticalSign:fixture.verticalSign,
    mxMoment:fixture.mxMoment,
    myMoment:fixture.myMoment,
    generatedAt:'2026-08-26T00:00:00.000Z',
  });

  if (fixture.expectedError) {
    assert.throws(build, new RegExp(fixture.expectedError), `${fixture.id}: must fail closed`);
  } else {
    const built = build();
    assert.deepEqual(built.forces, fixture.expectedForces, `${fixture.id}: normalized D/L/W/E forces drift`);
    assert.match(built.source.label, new RegExp(fixture.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}

const dataFiles = fs.readdirSync(fixtureDir, { withFileTypes:true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name)
  .filter(name => !['README.md', 'manifest.json', 'observed-manifest.json'].includes(name))
  .sort();
assert.deepEqual(dataFiles, [...referencedFiles].sort(), 'every fixture file must be governed by manifest.json');

console.log(`joint reaction compatibility fixture tests passed (${manifest.fixtures.length} synthetic fixtures)`);
