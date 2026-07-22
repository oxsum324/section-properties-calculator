'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Assessor = require('./attachment-package-upgrade-assess.js');

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
    project: { no: 'PKG-UPGRADE-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/21 22:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    '<div>計畫編號：PKG-UPGRADE-001</div>',
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
    projectNo: 'PKG-UPGRADE-001',
    now: FIXED_NOW,
  });
  assert.equal(result.status, 'ready');
  return outputDir;
}

function manifestPath(packageDir) {
  return path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
}

function writeReadme(packageDir, packageFingerprint) {
  fs.writeFileSync(
    path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.INTERNAL_README_FILE),
    `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${Builder.FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${packageFingerprint}\r\n`,
    'utf8',
  );
}

function convertToLegacy(packageDir, schemaVersion) {
  const filePath = manifestPath(packageDir);
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  manifest.schemaVersion = schemaVersion;
  manifest.kind = schemaVersion === 1 ? Builder.LEGACY_MANIFEST_KIND : Builder.PREVIOUS_MANIFEST_KIND;
  manifest.formalAttachments.forEach(record => { delete record.approvalTime; });
  manifest.traceabilitySources.forEach(record => { delete record.approvalTime; });
  manifest.packageFingerprint = schemaVersion === 1
    ? Builder.packageFingerprint(manifest.formalAttachments, manifest.traceabilitySources)
    : Builder.packageFingerprintV2(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeReadme(packageDir, manifest.packageFingerprint);
  return manifest;
}

function directorySnapshot(rootDir) {
  const records = [];
  function visit(currentDir, relativeDir = '') {
    fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .forEach(entry => {
        const relativePath = path.posix.join(relativeDir, entry.name);
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) visit(absolutePath, relativePath);
        else {
          records.push({
            path: relativePath,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
          });
        }
      });
  }
  visit(rootDir);
  return records;
}

function requirementCodes(report) {
  return report.requirements.map(requirement => requirement.code);
}

assert.deepEqual(
  Assessor.parseArgs(['--input', 'C:/formal-package', '--json']),
  { json: true, input: 'C:/formal-package' },
);
assert.match(Assessor.usage(), /--json/);
assert.equal(Assessor.legacyUpgradeRequirements().length, 4);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-assess-'));
try {
  const currentPackage = createPackage(tempRoot, 'current-v3');
  const currentSnapshot = directorySnapshot(currentPackage);
  const currentReport = Assessor.assessUpgrade(currentPackage);
  assert.equal(currentReport.kind, Assessor.ASSESSMENT_KIND);
  assert.equal(currentReport.status, 'ready');
  assert.equal(currentReport.requiresUpgrade, false);
  assert.equal(currentReport.automaticUpgradeAllowed, false);
  assert.equal(currentReport.inPlaceUpgradeAllowed, false);
  assert.equal(currentReport.currentPackage.schemaVersion, 3);
  assert.deepEqual(requirementCodes(currentReport), ['no-upgrade-needed']);
  assert.deepEqual(directorySnapshot(currentPackage), currentSnapshot, 'v3 assessment must not modify the package');
  assert.match(Assessor.formatSummary(currentReport), /不需升級/);

  const currentCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-assess.js'), '--input', currentPackage,
  ], { encoding: 'utf8' });
  assert.equal(currentCli.status, 0, currentCli.stderr || currentCli.stdout);
  assert.match(currentCli.stdout, /原地升級：不允許/);

  for (const schemaVersion of [1, 2]) {
    const legacyPackage = createPackage(tempRoot, `legacy-v${schemaVersion}`);
    const legacyManifest = convertToLegacy(legacyPackage, schemaVersion);
    const beforeSnapshot = directorySnapshot(legacyPackage);
    const report = Assessor.assessUpgrade(legacyPackage);
    assert.equal(report.status, 'review');
    assert.equal(report.requiresUpgrade, true);
    assert.equal(report.currentPackage.schemaVersion, schemaVersion);
    assert.equal(report.currentPackage.kind, legacyManifest.kind);
    assert.equal(report.verification.summary.errors, 0);
    assert.equal(report.verification.summary.warnings, 1);
    assert.deepEqual(requirementCodes(report), [
      'preserve-legacy-package',
      'confirm-and-reexport-current-results',
      'fresh-formal-approval',
      'build-separate-v3-package',
    ]);
    assert.deepEqual(directorySnapshot(legacyPackage), beforeSnapshot, `v${schemaVersion} assessment must be read-only`);
    const summary = Assessor.formatSummary(report);
    assert.match(summary, /需重新核可後組包/);
    assert.match(summary, /不得覆寫舊包/);
    assert.doesNotMatch(summary, /自動升級/);

    const cli = spawnSync(process.execPath, [
      path.join(__dirname, 'attachment-package-upgrade-assess.js'), '--input', legacyPackage, '--json',
    ], { encoding: 'utf8' });
    assert.equal(cli.status, 1, cli.stderr || cli.stdout);
    const jsonReport = JSON.parse(cli.stdout);
    assert.equal(jsonReport.status, 'review');
    assert.equal(jsonReport.inPlaceUpgradeAllowed, false);

    if (schemaVersion === 2) {
      const formalPath = path.join(legacyPackage, ...legacyManifest.formalAttachments[0].packagedFile.split('/'));
      fs.appendFileSync(formalPath, '\n內容遭修改', 'utf8');
      const blockedReport = Assessor.assessUpgrade(legacyPackage);
      assert.equal(blockedReport.status, 'blocked');
      assert.equal(blockedReport.requiresUpgrade, false);
      assert.deepEqual(requirementCodes(blockedReport), ['repair-integrity-before-upgrade']);
      assert.match(Assessor.formatSummary(blockedReport), /完整性異常未排除前/);
      const blockedCli = spawnSync(process.execPath, [
        path.join(__dirname, 'attachment-package-upgrade-assess.js'), '--input', legacyPackage,
      ], { encoding: 'utf8' });
      assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
    }
  }

  const helpCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-assess.js'), '--help',
  ], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-assess.js'),
  ], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
  const missingFolderCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-assess.js'), '--input', path.join(tempRoot, 'missing'),
  ], { encoding: 'utf8' });
  assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade assessment OK');
