'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');

const FINGERPRINT = 'CF-1234ABCD5678EF90';
const FIXED_NOW = new Date('2026-07-21T14:00:00.000Z');

function writeReadySource(inputDir) {
  const sourcePath = path.join(inputDir, 'source', 'beam.json');
  const reportPath = path.join(inputDir, 'reports', 'beam.html');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: 'V3.1' },
    project: { no: 'PKG-VERIFY-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/21 22:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    '<div>計畫編號：PKG-VERIFY-001</div>',
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/21 22:00:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
  ].join('\n'), 'utf8');
}

function createPackage(tempRoot, name) {
  const inputDir = path.join(tempRoot, `${name}-input`);
  const outputDir = path.join(tempRoot, `${name}-package`);
  fs.mkdirSync(inputDir, { recursive: true });
  writeReadySource(inputDir);
  const result = Builder.buildPackage(inputDir, {
    output: outputDir,
    projectNo: 'PKG-VERIFY-001',
    now: FIXED_NOW,
  });
  assert.equal(result.status, 'ready');
  return outputDir;
}

function manifestPath(packageDir) {
  return path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
}

function readManifest(packageDir) {
  return JSON.parse(fs.readFileSync(manifestPath(packageDir), 'utf8'));
}

function writeManifest(packageDir, manifest) {
  fs.writeFileSync(manifestPath(packageDir), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function writeReadme(packageDir, packageFingerprint) {
  fs.writeFileSync(
    path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.INTERNAL_README_FILE),
    `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${Builder.FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${packageFingerprint}\r\n`,
    'utf8',
  );
}

function hasIssue(report, code) {
  return report.issues.some(issue => issue.code === code);
}

assert.equal(Verifier.isSafeManifestPath('01_正式附件/reports/beam.html'), true);
assert.equal(Verifier.isSafeManifestPath('../beam.html'), false);
assert.equal(Verifier.isSafeManifestPath('C:/beam.html'), false);
assert.equal(Verifier.isSafeManifestPath('01_正式附件\\beam.html'), false);
assert.deepEqual(Verifier.parseArgs(['--input', 'C:/formal-package']), { input: 'C:/formal-package' });
assert.match(Verifier.usage(), /正式附件包資料夾/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-verify-'));
try {
  const readyPackage = createPackage(tempRoot, 'ready');
  const readyReport = Verifier.verifyPackage(readyPackage);
  assert.equal(readyReport.kind, Verifier.VERIFICATION_KIND);
  assert.equal(readyReport.status, 'ready');
  assert.equal(readyReport.summary.expectedFiles, 2);
  assert.equal(readyReport.summary.verifiedFiles, 2);
  assert.equal(readyReport.summary.errors, 0);
  assert.equal(readyReport.records.every(record => record.status === 'verified'), true);
  assert.match(Verifier.formatSummary(readyReport), /完整性驗證：通過/);

  const legacyPackage = createPackage(tempRoot, 'legacy-v1');
  const legacyManifest = readManifest(legacyPackage);
  legacyManifest.schemaVersion = 1;
  legacyManifest.kind = Builder.LEGACY_MANIFEST_KIND;
  legacyManifest.packageFingerprint = Builder.packageFingerprint(legacyManifest.formalAttachments, legacyManifest.traceabilitySources);
  writeManifest(legacyPackage, legacyManifest);
  writeReadme(legacyPackage, legacyManifest.packageFingerprint);
  const legacyReport = Verifier.verifyPackage(legacyPackage);
  assert.equal(legacyReport.status, 'ready', 'existing v1 packages remain verifiable');

  const fingerprintTamperCases = [
    ['trace-source-tool', manifest => { manifest.formalAttachments[0].sourceTool = '另一套工具'; }],
    ['trace-tool-version', manifest => { manifest.formalAttachments[0].toolVersion = 'v9.9'; }],
    ['trace-output-time', manifest => { manifest.formalAttachments[0].outputTime = '2026/07/21 23:59:59'; }],
    ['trace-calculation-fingerprint', manifest => { manifest.formalAttachments[0].fingerprints[0] = 'CF-FFFFFFFFFFFFFFFF'; }],
    ['project-no', manifest => { manifest.projectNo = 'PKG-ALTERED'; }],
    ['generated-at', manifest => { manifest.generatedAt = '2026-07-21T15:00:00.000Z'; }],
    ['check-summary', manifest => { manifest.checkSummary.warnings += 1; }],
    ['package-boundary', manifest => { manifest.boundary.instruction = 'altered boundary'; }],
  ];
  fingerprintTamperCases.forEach(([name, mutate]) => {
    const packageDir = createPackage(tempRoot, `metadata-${name}`);
    const manifest = readManifest(packageDir);
    mutate(manifest);
    writeManifest(packageDir, manifest);
    const report = Verifier.verifyPackage(packageDir);
    assert.equal(hasIssue(report, 'package-fingerprint-mismatch'), true, `${name} tampering must invalidate the v2 fingerprint`);
  });

  const unsupportedPackage = createPackage(tempRoot, 'unsupported-schema-pair');
  const unsupportedManifest = readManifest(unsupportedPackage);
  unsupportedManifest.schemaVersion = 1;
  writeManifest(unsupportedPackage, unsupportedManifest);
  const unsupportedReport = Verifier.verifyPackage(unsupportedPackage);
  assert.equal(hasIssue(unsupportedReport, 'unsupported-manifest-schema'), true);
  assert.equal(hasIssue(unsupportedReport, 'package-fingerprint-mismatch'), true);

  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-verify.js'), '--input', readyPackage,
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /正式附件包完整性驗證：通過/);

  const modifiedPackage = createPackage(tempRoot, 'modified');
  const modifiedManifest = readManifest(modifiedPackage);
  const modifiedFile = path.join(modifiedPackage, ...modifiedManifest.formalAttachments[0].packagedFile.split('/'));
  fs.appendFileSync(modifiedFile, '\nmodified', 'utf8');
  const modifiedReport = Verifier.verifyPackage(modifiedPackage);
  assert.equal(modifiedReport.status, 'blocked');
  assert.equal(hasIssue(modifiedReport, 'size-mismatch'), true);
  assert.equal(hasIssue(modifiedReport, 'hash-mismatch'), true);

  const missingPackage = createPackage(tempRoot, 'missing');
  const missingManifest = readManifest(missingPackage);
  fs.rmSync(path.join(missingPackage, ...missingManifest.formalAttachments[0].packagedFile.split('/')));
  const missingReport = Verifier.verifyPackage(missingPackage);
  assert.equal(hasIssue(missingReport, 'missing-file'), true);

  const extraPackage = createPackage(tempRoot, 'extra');
  fs.writeFileSync(path.join(extraPackage, Builder.FORMAL_ATTACHMENTS_DIR, 'extra.txt'), 'unexpected', 'utf8');
  const extraReport = Verifier.verifyPackage(extraPackage);
  assert.equal(hasIssue(extraReport, 'unexpected-file'), true);

  const extraDirectoryPackage = createPackage(tempRoot, 'extra-directory');
  fs.mkdirSync(path.join(extraDirectoryPackage, 'unused'));
  const extraDirectoryReport = Verifier.verifyPackage(extraDirectoryPackage);
  assert.equal(hasIssue(extraDirectoryReport, 'unexpected-directory'), true);

  const fingerprintPackage = createPackage(tempRoot, 'fingerprint');
  const fingerprintManifest = readManifest(fingerprintPackage);
  fingerprintManifest.packageFingerprint = 'PKG-000000000000000000000000';
  writeManifest(fingerprintPackage, fingerprintManifest);
  const fingerprintReport = Verifier.verifyPackage(fingerprintPackage);
  assert.equal(hasIssue(fingerprintReport, 'package-fingerprint-mismatch'), true);
  assert.equal(hasIssue(fingerprintReport, 'readme-mismatch'), true);

  const unsafePathPackage = createPackage(tempRoot, 'unsafe-path');
  const unsafeManifest = readManifest(unsafePathPackage);
  unsafeManifest.formalAttachments[0].packagedFile = '../outside.html';
  writeManifest(unsafePathPackage, unsafeManifest);
  const unsafeReport = Verifier.verifyPackage(unsafePathPackage);
  assert.equal(hasIssue(unsafeReport, 'unsafe-manifest-path'), true);

  const wrongRolePackage = createPackage(tempRoot, 'wrong-role');
  const wrongRoleManifest = readManifest(wrongRolePackage);
  wrongRoleManifest.formalAttachments[0].packagedFile = `${Builder.INTERNAL_TRACE_DIR}/beam.html`;
  writeManifest(wrongRolePackage, wrongRoleManifest);
  const wrongRoleReport = Verifier.verifyPackage(wrongRolePackage);
  assert.equal(hasIssue(wrongRoleReport, 'wrong-package-role'), true);

  const readmePackage = createPackage(tempRoot, 'readme');
  fs.rmSync(path.join(readmePackage, Builder.INTERNAL_TRACE_DIR, Builder.INTERNAL_README_FILE));
  const readmeReport = Verifier.verifyPackage(readmePackage);
  assert.equal(hasIssue(readmeReport, 'missing-internal-readme'), true);

  const malformedPackage = createPackage(tempRoot, 'malformed');
  fs.writeFileSync(manifestPath(malformedPackage), '{not-json', 'utf8');
  const malformedReport = Verifier.verifyPackage(malformedPackage);
  assert.equal(malformedReport.status, 'blocked');
  assert.equal(hasIssue(malformedReport, 'invalid-manifest-json'), true);
  const malformedCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-verify.js'), '--input', malformedPackage,
  ], { encoding: 'utf8' });
  assert.equal(malformedCli.status, 2, malformedCli.stderr || malformedCli.stdout);

  const nonObjectManifestPackage = createPackage(tempRoot, 'non-object-manifest');
  fs.writeFileSync(manifestPath(nonObjectManifestPackage), 'null\n', 'utf8');
  const nonObjectManifestReport = Verifier.verifyPackage(nonObjectManifestPackage);
  assert.equal(nonObjectManifestReport.status, 'blocked');
  assert.equal(hasIssue(nonObjectManifestReport, 'invalid-manifest'), true);

  const missingManifestPackage = createPackage(tempRoot, 'missing-manifest');
  fs.rmSync(manifestPath(missingManifestPackage));
  const missingManifestReport = Verifier.verifyPackage(missingManifestPackage);
  assert.equal(hasIssue(missingManifestReport, 'missing-manifest'), true);

  const invalidRecordPackage = createPackage(tempRoot, 'invalid-record');
  const invalidRecordManifest = readManifest(invalidRecordPackage);
  invalidRecordManifest.formalAttachments = [null];
  writeManifest(invalidRecordPackage, invalidRecordManifest);
  const invalidRecordReport = Verifier.verifyPackage(invalidRecordPackage);
  assert.equal(hasIssue(invalidRecordReport, 'invalid-manifest-record'), true);

  const helpCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-verify.js'), '--help'], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-verify.js')], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
  const missingFolderCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-verify.js'), '--input', path.join(tempRoot, 'not-found')], { encoding: 'utf8' });
  assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package verification OK');
