'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');

const FINGERPRINT = 'CF-1234ABCD5678EF90';
const FIXED_NOW = new Date('2026-07-21T14:10:00.000Z');

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
    '<div>核可時間：2026/07/21 22:05:00</div>',
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
assert.equal(Verifier.isSafeManifestPath('01_正式附件/reports/CON.txt'), false);
assert.equal(Verifier.isSafeManifestPath('01_正式附件/reports/beam.html.'), false);
assert.equal(Verifier.isSafeManifestPath('01_正式附件/reports/beam?.html'), false);
assert.equal(Verifier.isSafeManifestPath('01_正式附件/reports/cafe\u0301.html'), false);
assert.equal(
  Verifier.portableManifestPathKey('01_正式附件/reports/BEAM.HTML'),
  Verifier.portableManifestPathKey('01_正式附件/reports/beam.html'),
);
assert.deepEqual(
  Verifier.findDuplicateJsonKeys('{"a":1,"a":2}'),
  [{ key: 'a', pointer: '/a' }],
);
assert.deepEqual(
  Verifier.findDuplicateJsonKeys('{"projectNo":"A","project\\u004eo":"B"}'),
  [{ key: 'projectNo', pointer: '/projectNo' }],
);
assert.deepEqual(
  Verifier.findDuplicateJsonKeys('{"items":[{"x":1,"x":2}]}'),
  [{ key: 'x', pointer: '/items/0/x' }],
);
assert.deepEqual(Verifier.findDuplicateJsonKeys('{"a":1,"b":{"c":2}}'), []);
assert.equal(Verifier.jsonPointerPart('a~/b'), 'a~0~1b');
assert.deepEqual(Verifier.unknownObjectFields({ a: 1, extra: 2 }, ['a']), ['extra']);
assert.deepEqual(Verifier.parseArgs(['--input', 'C:/formal-package']), { input: 'C:/formal-package' });
assert.match(Verifier.usage(), /正式附件包資料夾/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-verify-'));
try {
  const readyPackage = createPackage(tempRoot, 'ready');
  const readyReport = Verifier.verifyPackage(readyPackage);
  assert.equal(readyReport.kind, Verifier.VERIFICATION_KIND);
  assert.equal(readyReport.status, 'ready');
  assert.equal(readyReport.manifestSchemaVersion, 3);
  assert.equal(readyReport.manifestKind, Builder.MANIFEST_KIND);
  assert.equal(readyReport.summary.expectedFiles, 2);
  assert.equal(readyReport.summary.verifiedFiles, 2);
  assert.equal(readyReport.summary.errors, 0);
  assert.equal(readyReport.summary.warnings, 0);
  assert.equal(readyReport.records.every(record => record.status === 'verified'), true);
  const readyFormalRecord = readyReport.records.find(record => record.role === 'formal');
  assert.equal(readyFormalRecord.sourceTool, 'RC 梁');
  assert.equal(readyFormalRecord.toolVersion, 'v3.1');
  assert.equal(readyFormalRecord.outputTime, '2026/07/21 22:00:00');
  assert.equal(readyFormalRecord.approvalTime, '2026/07/21 22:05:00');
  assert.deepEqual(readyFormalRecord.fingerprints, [FINGERPRINT]);
  assert.match(Verifier.formatSummary(readyReport), /完整性驗證：通過/);
  assert.equal(
    Verifier.samePackageRoot(
      Verifier.packageRootIdentity(readyPackage),
      Verifier.packageRootIdentity(readyPackage),
    ),
    true,
  );

  const linkedTargetPackage = createPackage(tempRoot, 'linked-root-target');
  const linkedRootPackage = path.join(tempRoot, 'linked-root-package');
  fs.symlinkSync(linkedTargetPackage, linkedRootPackage, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedRootReport = Verifier.verifyPackage(linkedRootPackage);
  assert.equal(linkedRootReport.status, 'blocked');
  assert.equal(hasIssue(linkedRootReport, 'package-root-symbolic-link'), true);
  const linkedRootCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-verify.js'), '--input', linkedRootPackage,
  ], { encoding: 'utf8' });
  assert.equal(linkedRootCli.status, 2, linkedRootCli.stderr || linkedRootCli.stdout);
  assert.match(linkedRootCli.stdout, /根目錄本身不得是符號連結或 Windows junction/);

  const legacyPackage = createPackage(tempRoot, 'legacy-v1');
  const legacyManifest = readManifest(legacyPackage);
  legacyManifest.schemaVersion = 1;
  legacyManifest.kind = Builder.LEGACY_MANIFEST_KIND;
  legacyManifest.packageFingerprint = Builder.packageFingerprint(legacyManifest.formalAttachments, legacyManifest.traceabilitySources);
  writeManifest(legacyPackage, legacyManifest);
  writeReadme(legacyPackage, legacyManifest.packageFingerprint);
  const legacyReport = Verifier.verifyPackage(legacyPackage);
  assert.equal(legacyReport.status, 'review', 'existing v1 packages remain integrity-verifiable but cannot be auto-released');
  assert.equal(legacyReport.manifestSchemaVersion, 1);
  assert.equal(legacyReport.manifestKind, Builder.LEGACY_MANIFEST_KIND);
  assert.equal(legacyReport.summary.errors, 0);
  assert.equal(legacyReport.summary.warnings, 1);
  assert.equal(legacyReport.records.every(record => record.status === 'verified'), true);
  assert.equal(legacyReport.records.find(record => record.role === 'formal').approvalTime, '2026/07/21 22:05:00');
  assert.equal(hasIssue(legacyReport, 'legacy-manifest-review'), true);
  assert.match(Verifier.formatSummary(legacyReport), /完整性驗證：需人工確認/);
  const legacyCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-verify.js'), '--input', legacyPackage,
  ], { encoding: 'utf8' });
  assert.equal(legacyCli.status, 1, legacyCli.stderr || legacyCli.stdout);
  assert.match(legacyCli.stdout, /\[提醒\].*重新組包為 v3/);

  const previousV2Package = createPackage(tempRoot, 'previous-v2');
  const previousV2Manifest = readManifest(previousV2Package);
  previousV2Manifest.schemaVersion = 2;
  previousV2Manifest.kind = Builder.PREVIOUS_MANIFEST_KIND;
  previousV2Manifest.formalAttachments.forEach(record => { delete record.approvalTime; });
  previousV2Manifest.traceabilitySources.forEach(record => { delete record.approvalTime; });
  previousV2Manifest.packageFingerprint = Builder.packageFingerprintV2(previousV2Manifest);
  writeManifest(previousV2Package, previousV2Manifest);
  writeReadme(previousV2Package, previousV2Manifest.packageFingerprint);
  const previousV2Report = Verifier.verifyPackage(previousV2Package);
  assert.equal(previousV2Report.status, 'review', 'existing v2 packages remain integrity-verifiable without approval-time fields but cannot be auto-released');
  assert.equal(previousV2Report.manifestSchemaVersion, 2);
  assert.equal(previousV2Report.manifestKind, Builder.PREVIOUS_MANIFEST_KIND);
  assert.equal(previousV2Report.summary.errors, 0);
  assert.equal(previousV2Report.summary.warnings, 1);
  assert.equal(previousV2Report.records.every(record => record.status === 'verified'), true);
  assert.equal(previousV2Report.records.find(record => record.role === 'formal').approvalTime, '');
  assert.equal(hasIssue(previousV2Report, 'legacy-manifest-review'), true);

  const previousV2FormalPath = path.join(previousV2Package, ...previousV2Manifest.formalAttachments[0].packagedFile.split('/'));
  fs.appendFileSync(previousV2FormalPath, '\n內容遭修改', 'utf8');
  const blockedPreviousV2Report = Verifier.verifyPackage(previousV2Package);
  assert.equal(blockedPreviousV2Report.status, 'blocked', 'integrity errors take precedence over legacy review');
  assert.equal(blockedPreviousV2Report.summary.errors > 0, true);
  assert.equal(blockedPreviousV2Report.summary.warnings, 1);
  assert.equal(hasIssue(blockedPreviousV2Report, 'hash-mismatch'), true);

  const fingerprintTamperCases = [
    ['trace-source-tool', manifest => { manifest.formalAttachments[0].sourceTool = '另一套工具'; }],
    ['trace-tool-version', manifest => { manifest.formalAttachments[0].toolVersion = 'v9.9'; }],
    ['trace-output-time', manifest => { manifest.formalAttachments[0].outputTime = '2026/07/21 23:59:59'; }],
    ['formal-approval-time', manifest => { manifest.formalAttachments[0].approvalTime = '2026/07/21 23:58:00'; }],
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
    assert.equal(hasIssue(report, 'package-fingerprint-mismatch'), true, `${name} tampering must invalidate the v3 fingerprint`);
  });

  const approvalBeforeOutputPackage = createPackage(tempRoot, 'approval-before-output');
  const approvalBeforeOutputManifest = readManifest(approvalBeforeOutputPackage);
  approvalBeforeOutputManifest.formalAttachments[0].outputTime = '2026/07/21 22:06:00';
  approvalBeforeOutputManifest.packageFingerprint = Builder.packageFingerprintV3(approvalBeforeOutputManifest);
  writeManifest(approvalBeforeOutputPackage, approvalBeforeOutputManifest);
  writeReadme(approvalBeforeOutputPackage, approvalBeforeOutputManifest.packageFingerprint);
  const approvalBeforeOutputReport = Verifier.verifyPackage(approvalBeforeOutputPackage);
  assert.equal(hasIssue(approvalBeforeOutputReport, 'formal-approval-before-output'), true);
  assert.equal(hasIssue(approvalBeforeOutputReport, 'package-fingerprint-mismatch'), false, 'chronology is validated independently of fingerprint consistency');

  const invalidOutputTimePackage = createPackage(tempRoot, 'invalid-output-time');
  const invalidOutputTimeManifest = readManifest(invalidOutputTimePackage);
  invalidOutputTimeManifest.formalAttachments[0].outputTime = '2026/02/30 22:00:00';
  invalidOutputTimeManifest.packageFingerprint = Builder.packageFingerprintV3(invalidOutputTimeManifest);
  writeManifest(invalidOutputTimePackage, invalidOutputTimeManifest);
  writeReadme(invalidOutputTimePackage, invalidOutputTimeManifest.packageFingerprint);
  const invalidOutputTimeReport = Verifier.verifyPackage(invalidOutputTimePackage);
  assert.equal(hasIssue(invalidOutputTimeReport, 'invalid-output-time'), true);

  const packageBeforeApproval = createPackage(tempRoot, 'package-before-approval');
  const packageBeforeApprovalManifest = readManifest(packageBeforeApproval);
  packageBeforeApprovalManifest.generatedAt = '2026-07-21T14:04:00.000Z';
  packageBeforeApprovalManifest.packageFingerprint = Builder.packageFingerprintV3(packageBeforeApprovalManifest);
  writeManifest(packageBeforeApproval, packageBeforeApprovalManifest);
  writeReadme(packageBeforeApproval, packageBeforeApprovalManifest.packageFingerprint);
  const packageBeforeApprovalReport = Verifier.verifyPackage(packageBeforeApproval);
  assert.equal(hasIssue(packageBeforeApprovalReport, 'package-generated-before-approval'), true);
  assert.equal(hasIssue(packageBeforeApprovalReport, 'package-fingerprint-mismatch'), false, 'package chronology is validated independently of fingerprint consistency');

  const invalidGeneratedAtPackage = createPackage(tempRoot, 'invalid-generated-at');
  const invalidGeneratedAtManifest = readManifest(invalidGeneratedAtPackage);
  invalidGeneratedAtManifest.generatedAt = '2026-02-30T14:10:00.000Z';
  invalidGeneratedAtManifest.packageFingerprint = Builder.packageFingerprintV3(invalidGeneratedAtManifest);
  writeManifest(invalidGeneratedAtPackage, invalidGeneratedAtManifest);
  writeReadme(invalidGeneratedAtPackage, invalidGeneratedAtManifest.packageFingerprint);
  const invalidGeneratedAtReport = Verifier.verifyPackage(invalidGeneratedAtPackage);
  assert.equal(hasIssue(invalidGeneratedAtReport, 'invalid-generated-at'), true);

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

  const changingPackage = createPackage(tempRoot, 'changing-during-verification');
  const changingManifest = readManifest(changingPackage);
  const changingFile = path.join(changingPackage, ...changingManifest.formalAttachments[0].packagedFile.split('/'));
  const originalSha256File = Builder.sha256File;
  let changedDuringVerification = false;
  let changingReport;
  try {
    Builder.sha256File = filePath => {
      const hash = originalSha256File(filePath);
      if (!changedDuringVerification && path.resolve(filePath) === path.resolve(changingFile)) {
        fs.appendFileSync(filePath, '\nchanged during verification', 'utf8');
        changedDuringVerification = true;
      }
      return hash;
    };
    changingReport = Verifier.verifyPackage(changingPackage);
  } finally {
    Builder.sha256File = originalSha256File;
  }
  assert.equal(changedDuringVerification, true);
  assert.equal(changingReport.status, 'blocked');
  assert.equal(hasIssue(changingReport, 'package-changed-during-verification'), true);
  assert.equal(hasIssue(changingReport, 'hash-mismatch'), false, 'the second snapshot must catch changes after the first successful hash');
  assert.equal(hasIssue(changingReport, 'package-fingerprint-mismatch'), false);

  const replacedRootPackage = createPackage(tempRoot, 'replaced-root-during-verification');
  const replacedRootPath = path.resolve(replacedRootPackage);
  const originalLstatSync = fs.lstatSync;
  let rootIdentityReads = 0;
  let replacedRootReport;
  try {
    fs.lstatSync = (filePath, ...args) => {
      const stat = originalLstatSync(filePath, ...args);
      if (path.resolve(filePath) === replacedRootPath) {
        rootIdentityReads += 1;
        if (rootIdentityReads === 2) {
          return {
            isDirectory: () => stat.isDirectory(),
            isSymbolicLink: () => stat.isSymbolicLink(),
            dev: stat.dev,
            ino: `${stat.ino}-replaced`,
            birthtimeMs: stat.birthtimeMs,
          };
        }
      }
      return stat;
    };
    replacedRootReport = Verifier.verifyPackage(replacedRootPackage);
  } finally {
    fs.lstatSync = originalLstatSync;
  }
  assert.equal(rootIdentityReads >= 2, true);
  assert.equal(replacedRootReport.status, 'blocked');
  assert.equal(hasIssue(replacedRootReport, 'package-changed-during-verification'), true);
  assert.equal(replacedRootReport.issues.some(issue => issue.files.includes('(附件包根目錄)')), true);

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

  const duplicatePathPackage = createPackage(tempRoot, 'duplicate-path');
  const duplicatePathManifest = readManifest(duplicatePathPackage);
  duplicatePathManifest.formalAttachments.push({ ...duplicatePathManifest.formalAttachments[0] });
  duplicatePathManifest.checkSummary.attachments += 1;
  duplicatePathManifest.packageFingerprint = Builder.packageFingerprintV3(duplicatePathManifest);
  writeManifest(duplicatePathPackage, duplicatePathManifest);
  writeReadme(duplicatePathPackage, duplicatePathManifest.packageFingerprint);
  const duplicatePathReport = Verifier.verifyPackage(duplicatePathPackage);
  assert.equal(hasIssue(duplicatePathReport, 'duplicate-manifest-path'), true);
  assert.equal(hasIssue(duplicatePathReport, 'package-fingerprint-mismatch'), false);

  const portableCollisionPackage = createPackage(tempRoot, 'portable-path-collision');
  const portableCollisionManifest = readManifest(portableCollisionPackage);
  portableCollisionManifest.formalAttachments.push({
    ...portableCollisionManifest.formalAttachments[0],
    packagedFile: portableCollisionManifest.formalAttachments[0].packagedFile.replace('beam.html', 'BEAM.HTML'),
  });
  portableCollisionManifest.checkSummary.attachments += 1;
  portableCollisionManifest.packageFingerprint = Builder.packageFingerprintV3(portableCollisionManifest);
  writeManifest(portableCollisionPackage, portableCollisionManifest);
  writeReadme(portableCollisionPackage, portableCollisionManifest.packageFingerprint);
  const portableCollisionReport = Verifier.verifyPackage(portableCollisionPackage);
  assert.equal(hasIssue(portableCollisionReport, 'portable-path-collision'), true);
  assert.equal(hasIssue(portableCollisionReport, 'package-fingerprint-mismatch'), false, 'path uniqueness is validated independently of fingerprint consistency');

  const duplicateJsonCases = [
    ['literal', 'projectNo'],
    ['escaped', 'project\\u004eo'],
  ];
  duplicateJsonCases.forEach(([name, finalKey]) => {
    const packageDir = createPackage(tempRoot, `duplicate-json-key-${name}`);
    const originalText = fs.readFileSync(manifestPath(packageDir), 'utf8');
    const expectedLine = '  "projectNo": "PKG-VERIFY-001"';
    const tamperedText = originalText.replace(
      expectedLine,
      `  "projectNo": "AMBIGUOUS",\n  "${finalKey}": "PKG-VERIFY-001"`,
    );
    assert.notEqual(tamperedText, originalText, `${name} duplicate-key fixture must modify the manifest`);
    fs.writeFileSync(manifestPath(packageDir), tamperedText, 'utf8');
    const report = Verifier.verifyPackage(packageDir);
    assert.equal(report.status, 'blocked');
    assert.equal(hasIssue(report, 'duplicate-manifest-json-key'), true);
    assert.equal(hasIssue(report, 'package-fingerprint-mismatch'), false, `${name} duplicate key must be blocked even when the parsed fingerprint remains valid`);
    assert.equal(hasIssue(report, 'readme-mismatch'), false);
  });

  const duplicateJsonCliPackage = createPackage(tempRoot, 'duplicate-json-key-cli');
  const duplicateJsonCliText = fs.readFileSync(manifestPath(duplicateJsonCliPackage), 'utf8').replace(
    '  "projectNo": "PKG-VERIFY-001"',
    '  "projectNo": "AMBIGUOUS",\n  "projectNo": "PKG-VERIFY-001"',
  );
  fs.writeFileSync(manifestPath(duplicateJsonCliPackage), duplicateJsonCliText, 'utf8');
  const duplicateJsonCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-verify.js'), '--input', duplicateJsonCliPackage,
  ], { encoding: 'utf8' });
  assert.equal(duplicateJsonCli.status, 2, duplicateJsonCli.stderr || duplicateJsonCli.stdout);
  assert.match(duplicateJsonCli.stdout, /重複 JSON 欄位/);

  const unknownFieldCases = [
    ['top-level', manifest => { manifest.releaseStatus = 'ready'; }, '/releaseStatus'],
    ['check-summary', manifest => { manifest.checkSummary.reviewed = true; }, '/checkSummary/reviewed'],
    ['boundary', manifest => { manifest.boundary.alternateDirectory = 'formal'; }, '/boundary/alternateDirectory'],
    ['formal-record', manifest => { manifest.formalAttachments[0].documentState = '正式附件'; }, '/formalAttachments/0/documentState'],
    ['trace-record', manifest => { manifest.traceabilitySources[0].trusted = true; }, '/traceabilitySources/0/trusted'],
  ];
  unknownFieldCases.forEach(([name, mutate, pointer]) => {
    const packageDir = createPackage(tempRoot, `unknown-manifest-field-${name}`);
    const manifest = readManifest(packageDir);
    mutate(manifest);
    writeManifest(packageDir, manifest);
    const report = Verifier.verifyPackage(packageDir);
    const issue = report.issues.find(item => item.code === 'unknown-manifest-field');
    assert.equal(report.status, 'blocked');
    assert.ok(issue, `${name} unknown field must be blocked`);
    assert.match(issue.message, new RegExp(pointer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(hasIssue(report, 'package-fingerprint-mismatch'), false, `${name} unknown field must be blocked even when the parsed fingerprint remains valid`);
    assert.equal(hasIssue(report, 'readme-mismatch'), false);
    if (name === 'top-level') {
      const cli = spawnSync(process.execPath, [
        path.join(__dirname, 'attachment-package-verify.js'), '--input', packageDir,
      ], { encoding: 'utf8' });
      assert.equal(cli.status, 2, cli.stderr || cli.stdout);
      assert.match(cli.stdout, /未定義且未納入附件包指紋/);
    }
  });

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
