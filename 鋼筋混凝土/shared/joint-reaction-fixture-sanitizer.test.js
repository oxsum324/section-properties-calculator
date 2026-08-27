const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Adapter = require('./joint-reaction-load-adapter.js');
const Sanitizer = require('./joint-reaction-fixture-sanitizer.js');

const secretTokens = [
  '秘密工程 A 棟',
  'B3-FOUNDATION-SECRET',
  'J-PRIVATE-908',
  '928374',
  'SUPER-DEAD-PRIVATE',
  '987654.321',
  '設計者王小明',
];
const raw = [
  'TABLE: "秘密工程 A 棟 - Joint Reactions"',
  '"Story","Joint Label","Unique Name","Load Case/Combo","Case Type","Step Type","Step Number","F1","F2","F3","M1","M2","M3","User Note"',
  '"B3-FOUNDATION-SECRET","J-PRIVATE-908","928374","SUPER-DEAD-PRIVATE","Linear Static","","","0","0","987654.321","0","0","0","設計者王小明"',
  '"B3-FOUNDATION-SECRET","J-PRIVATE-908","928374","W-COMBO-PRIVATE","Combination","Step","88","123.456","0","0","77.7","0","0","設計者王小明"',
].join('\r\n');

const result = Sanitizer.sanitizeExport({
  raw,
  software:'ETABS',
  softwareVersion:'v-observed-test',
  units:'kN, m',
  tableName:'Joint Reactions',
  originKind:'privacy-test',
  sourceExtension:'.csv',
  generatedAt:'2026-08-26T10:00:00+08:00',
});

assert.equal(result.evidence.schemaVersion, 'rc-joint-reaction-anonymization-evidence.v1');
assert.equal(result.evidence.status, 'candidate-manual-review-required');
assert.equal(result.evidence.provenance, 'anonymized-observed-export-candidate');
assert.equal(result.evidence.originKind, 'privacy-test');
assert.equal(result.evidence.notEngineeringData, true);
assert.equal(result.evidence.source.stored, false);
assert.equal(result.evidence.source.software, 'ETABS');
assert.equal(result.evidence.source.softwareVersion, 'v-observed-test');
assert.equal(result.evidence.output.headerLine, 2);
assert.equal(result.evidence.output.delimiter, 'comma');
assert.equal(result.evidence.output.rowCount, 2);
assert.deepEqual(result.evidence.transform.unknownHeaders, ['User Note']);
assert.ok(result.evidence.reviewChecklist.length >= 5);
assert.notEqual(result.evidence.source.sha256, result.evidence.output.sha256);

for (const secret of secretTokens) {
  assert.ok(!result.sanitized.includes(secret), `sanitized content leaked: ${secret}`);
  assert.ok(!JSON.stringify(result.evidence).includes(secret), `evidence leaked: ${secret}`);
}
assert.match(result.sanitized, /^FIXTURE PREAMBLE 1: \[REDACTED\]/);
assert.match(result.sanitized, /"Story","Joint Label","Unique Name","Load Case\/Combo"/);
assert.match(result.sanitized, /"STORY_001","JOINT_001","UNIQUE_001","CASE_001","Linear Static"/);
assert.match(result.sanitized, /"STORY_001","JOINT_001","UNIQUE_001","CASE_002","Combination","STEP","STEP_001"/);
assert.match(result.sanitized, /"\[REDACTED\]"$/m);

const reparsed = Adapter.parseTable(result.sanitized);
assert.deepEqual(reparsed.points, ['STORY_001 / JOINT_001']);
assert.equal(reparsed.rows[0].caseType, 'Linear Static');
assert.equal(reparsed.rows[1].caseType, 'Combination');

const dynamicResult = Sanitizer.sanitizeExport({
  raw: raw.replace('Linear Static', 'Response Spectrum'),
  software:'ETABS',
  softwareVersion:'22.0.0',
  units:'kN-m',
  tableName:'Joint Reactions',
  originKind:'privacy-test',
  sourceExtension:'.csv',
});
assert.match(dynamicResult.sanitized, /"CASE_001","Other Case Type"/);
assert.deepEqual(reparsed.casesByPoint['STORY_001 / JOINT_001'], ['CASE_001', 'CASE_002']);
assert.equal(reparsed.rows[0].F3, 110);
assert.equal(reparsed.rows[1].M2, -9);

assert.throws(() => Sanitizer.sanitizeExport({ raw, software:'ETABS', units:'kN, m' }), /軟體版本不得空白/);
assert.throws(() => Sanitizer.sanitizeExport({ raw, software:'OTHER', softwareVersion:'1', units:'kN, m', originKind:'privacy-test' }), /ETABS 或 SAP2000/);
assert.throws(() => Sanitizer.sanitizeExport({ raw, software:'ETABS', softwareVersion:'1', units:'kN, m', originKind:'unknown' }), /來源分類只支援/);
assert.throws(() => Sanitizer.sanitizeExport({ raw, software:'ETABS', softwareVersion:'1', units:'kN, m', originKind:'privacy-test', sourceExtension:'.xlsx' }), /只支援/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-reaction-sanitizer-'));
try {
  const inputPath = path.join(tempRoot, 'private-export.csv');
  const outputDir = path.join(tempRoot, 'candidate-output');
  fs.writeFileSync(inputPath, raw, 'utf8');
  const runCliFor = targetDir => spawnSync(process.execPath, [
      path.join(__dirname, 'joint-reaction-fixture-sanitizer.js'),
      '--input', inputPath,
      '--software', 'ETABS',
      '--version', 'v-observed-test',
      '--units', 'kN, m',
      '--origin', 'privacy-test',
      '--output-dir', targetDir,
    ], { encoding:'utf8' });
  const cli = runCliFor(outputDir);
  assert.equal(cli.status, 0, cli.stderr);
  const summary = JSON.parse(cli.stdout);
  assert.equal(summary.status, 'candidate-manual-review-required');
  assert.equal(summary.sourceStored, false);
  assert.equal(summary.manualReviewRequired, true);
  assert.ok(fs.existsSync(summary.sanitizedPath));
  assert.ok(fs.existsSync(summary.evidencePath));
  assert.ok(!fs.readFileSync(summary.sanitizedPath, 'utf8').includes('秘密工程 A 棟'));
  const evidence = JSON.parse(fs.readFileSync(summary.evidencePath, 'utf8'));
  assert.equal(evidence.output.file, path.basename(summary.sanitizedPath));
  assert.ok(!JSON.stringify(evidence).includes(inputPath));

  const originalCandidate = fs.readFileSync(summary.sanitizedPath, 'utf8');
  const originalEvidence = fs.readFileSync(summary.evidencePath, 'utf8');
  const repeated = runCliFor(outputDir);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(fs.readFileSync(summary.sanitizedPath, 'utf8'), originalCandidate, 'exact rerun keeps candidate bytes');
  assert.equal(fs.readFileSync(summary.evidencePath, 'utf8'), originalEvidence, 'exact rerun keeps evidence bytes');

  const conflictDir = path.join(tempRoot, 'conflict-output');
  fs.mkdirSync(conflictDir, { recursive:true });
  const conflictEvidencePath = path.join(conflictDir, path.basename(summary.evidencePath));
  fs.writeFileSync(conflictEvidencePath, 'preexisting-conflict\n', 'utf8');
  const conflicted = runCliFor(conflictDir);
  assert.equal(conflicted.status, 1, conflicted.stdout);
  assert.match(conflicted.stderr, /輸出檔已存在且內容不同/);
  assert.deepEqual(fs.readdirSync(conflictDir), [path.basename(conflictEvidencePath)], 'preflight conflict leaves no partial candidate');
  assert.equal(fs.readFileSync(conflictEvidencePath, 'utf8'), 'preexisting-conflict\n');

  const junctionDir = path.join(tempRoot, 'junction-output');
  const junctionTarget = path.join(tempRoot, 'junction-target');
  fs.mkdirSync(junctionDir, { recursive:true });
  fs.mkdirSync(junctionTarget, { recursive:true });
  const junctionCandidatePath = path.join(junctionDir, path.basename(summary.sanitizedPath));
  fs.symlinkSync(junctionTarget, junctionCandidatePath, 'junction');
  assert.equal(fs.lstatSync(junctionCandidatePath).isSymbolicLink(), true, 'test fixture must be a junction');
  const junctionBlocked = runCliFor(junctionDir);
  assert.equal(junctionBlocked.status, 1, junctionBlocked.stdout);
  assert.match(junctionBlocked.stderr, /輸出目標不得是符號連結/);
  assert.deepEqual(fs.readdirSync(junctionDir), [path.basename(junctionCandidatePath)], 'blocked junction leaves no other output');
  assert.deepEqual(fs.readdirSync(junctionTarget), [], 'junction target stays untouched');

  const rollbackDir = path.join(tempRoot, 'rollback-output');
  fs.mkdirSync(rollbackDir, { recursive:true });
  const preservedPath = path.join(rollbackDir, 'preserved.txt');
  const rolledBackPath = path.join(rollbackDir, 'must-roll-back.txt');
  const unwritablePath = path.join(rollbackDir, 'missing-parent', 'never-written.txt');
  fs.writeFileSync(preservedPath, 'preserved\n', 'utf8');
  assert.throws(() => Sanitizer.writeBundleIfAbsentOrSame([
    { filePath:preservedPath, content:'preserved\n' },
    { filePath:rolledBackPath, content:'temporary\n' },
    { filePath:unwritablePath, content:'never\n' },
  ]), /交易式輸出失敗/);
  assert.equal(fs.readFileSync(preservedPath, 'utf8'), 'preserved\n', 'rollback keeps pre-existing exact files');
  assert.equal(fs.existsSync(rolledBackPath), false, 'rollback removes files created before a later write failure');
  assert.equal(fs.existsSync(unwritablePath), false);
} finally {
  fs.rmSync(tempRoot, { recursive:true, force:true });
}

console.log('joint reaction fixture sanitizer tests passed');
