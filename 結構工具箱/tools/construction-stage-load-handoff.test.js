const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const Handoff = require('./construction-stage-load-handoff');
const { replayDeckingExport } = require('../../覆工板/decking-result-replay');

const deckingRoot = path.resolve(__dirname, '..', '..', '覆工板');
const excavationRoot = path.resolve(__dirname, '..', '..', '開挖擋土支撐');
const fixture = JSON.parse(fs.readFileSync(path.join(deckingRoot, 'test-fixtures', 'report-smoke.json'), 'utf8'));
const replay = replayDeckingExport(fixture, { toolRoot: deckingRoot });
const source = JSON.parse(JSON.stringify(fixture));
source.results = replay.results;
source.document.calculationFingerprint = replay.calculationFingerprint;

const generatedAt = '2026-08-07T08:00:00.000Z';
const record = Handoff.buildHandoff(source, { deckingRoot, generatedAt });
assert.equal(record.kind, Handoff.KIND);
assert.equal(record.load.target, Handoff.TARGET);
assert.equal(record.load.controlAxialLoadTf, replay.results.girder.PuMax);
assert.deepEqual(record.load.controllingCases, ['Pu1']);
assert.equal(record.source.calculationFingerprint, replay.calculationFingerprint);
assert.equal(record.boundary.requiresExplicitAcceptance, true);
assert.equal(record.boundary.autoApplied, false);
assert.equal(Handoff.validateHandoff(record), record);

const backendReplay = spawnSync('python', ['-c', [
  'import json, sys',
  'from backend.app.calculations import _validate_construction_stage_handoff',
  'from backend.app.schemas import ConstructionStageLoadSource',
  'record = json.load(sys.stdin)',
  'source = record["source"]',
  'load = record["load"]',
  'summary = ConstructionStageLoadSource(handoff_fingerprint=record["handoffFingerprint"], source_tool=source["toolName"], source_version=source["toolVersion"], source_calculation_fingerprint=source["calculationFingerprint"], source_project_name=source["projectName"], source_project_no=source["projectNo"], controlling_cases=load["controllingCases"], handoff_record=record)',
  'valid, message = _validate_construction_stage_handoff(load["controlAxialLoadTf"], summary)',
  'raise SystemExit(0 if valid else message)',
].join('; ')], {
  cwd: excavationRoot,
  input: JSON.stringify(record),
  encoding: 'utf8',
  env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
});
assert.equal(backendReplay.status, 0, `Python backend must replay the Node handoff fingerprint: ${backendReplay.stderr || backendReplay.stdout}`);

const changedLoad = JSON.parse(JSON.stringify(record));
changedLoad.load.controlAxialLoadTf += 1;
assert.throws(() => Handoff.validateHandoff(changedLoad), /交接檔內容與交接指紋不一致/);

const changedStoredResult = JSON.parse(JSON.stringify(source));
changedStoredResult.results.girder.PuMax += 1;
assert.throws(() => Handoff.buildHandoff(changedStoredResult, { deckingRoot, generatedAt }), /PuMax 與目前核心重算不一致/);

const changedFingerprint = JSON.parse(JSON.stringify(source));
changedFingerprint.document.calculationFingerprint = 'CF-0000000000000000';
assert.throws(() => Handoff.buildHandoff(changedFingerprint, { deckingRoot, generatedAt }), /計算指紋與目前核心重算不一致/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'construction-stage-handoff-'));
try {
  const duplicatePath = path.join(tempRoot, 'duplicate.json');
  fs.writeFileSync(duplicatePath, JSON.stringify(source).replace('"project":', '"project":{},"project":'), 'utf8');
  assert.throws(() => Handoff.readJsonFile(duplicatePath, '測試來源'), /重複 JSON 欄位/);

  const sourcePath = path.join(tempRoot, 'decking.json');
  const outputPath = path.join(tempRoot, 'handoff.json');
  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2), 'utf8');
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    Handoff.runCli(['--input', sourcePath, '--output', outputPath, '--json']);
  } finally {
    process.stdout.write = originalWrite;
  }
  const written = Handoff.readJsonFile(outputPath, '交接檔');
  Handoff.validateHandoff(written);
  assert.equal(written.load.controlAxialLoadTf, replay.results.girder.PuMax);
  assert.throws(() => Handoff.runCli(['--input', sourcePath, '--output', outputPath]), /EEXIST/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('construction stage load handoff contract OK');
