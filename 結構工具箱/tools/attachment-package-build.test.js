'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Checker = require('./attachment-package-check.js');
const Verifier = require('./attachment-package-verify.js');

const FINGERPRINT = 'CF-1234ABCD5678EF90';
const FIXED_NOW = new Date('2026-07-21T13:00:00.000Z');

function writeSourceJson(inputDir, relativeFile = 'source/beam.json') {
  const filePath = path.join(inputDir, relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: 'V3.1' },
    project: { no: 'PKG-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/21 21:00:00',
  }), 'utf8');
  return filePath;
}

function writeReport(inputDir, documentState, relativeFile = 'reports/beam.html') {
  const filePath = path.join(inputDir, relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '<h1>RC 梁設計計算書</h1>',
    `<div>${documentState}</div>`,
    '<div>計畫編號：PKG-001</div>',
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/21 20:50:00</div>',
    '<div>核可時間：2026/07/21 20:55:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
    '<section><h2>採用輸入</h2><div>材料與荷載資料</div></section>',
    '<section><h2>計算內容</h2><div>檢核公式與代入值</div></section>',
    '<section><h2>檢核結論</h2><div>檢核結果：通過</div></section>',
  ].join('\n'), 'utf8');
  return filePath;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

assert.equal(Builder.timestampToken(FIXED_NOW), '20260721-210000');
assert.equal(Builder.defaultOutputDir('C:/case/attachments', FIXED_NOW), path.resolve('C:/case/attachments-正式附件包-20260721-210000'));
assert.deepEqual(
  Builder.parseArgs(['--input', 'C:/case', '--output', 'C:/package', '--project-no', 'PKG-001']),
  { input: 'C:/case', output: 'C:/package', projectNo: 'PKG-001' },
);
assert.match(Builder.usage(), /--input <附件資料夾>/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-build-'));
try {
  const readyInput = path.join(tempRoot, 'ready-input');
  const readyOutput = path.join(tempRoot, 'new-output-parent', 'ready-package');
  fs.mkdirSync(readyInput, { recursive: true });
  assert.equal(fs.existsSync(path.dirname(readyOutput)), false, 'builder creates a missing output parent only after readiness passes');
  const sourcePath = writeSourceJson(readyInput);
  const reportPath = writeReport(readyInput, '文件狀態：正式附件');

  const result = Builder.buildPackage(readyInput, { output: readyOutput, projectNo: 'PKG-001', now: FIXED_NOW });
  assert.equal(result.status, 'ready');
  assert.equal(result.built, true);
  assert.equal(result.formalAttachmentCount, 1);
  assert.equal(result.traceabilitySourceCount, 1);
  assert.match(result.packageFingerprint, /^PKG-[0-9A-F]{24}$/);
  assert.equal(result.selfVerification.status, 'ready');
  assert.equal(result.selfVerification.packageFingerprint, result.packageFingerprint);
  assert.equal(result.selfVerification.summary.expectedFiles, 2);
  assert.equal(result.selfVerification.summary.verifiedFiles, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(result.selfVerification, 'packageDir'), false, 'portable verification result must not retain the temporary path');

  const packagedReport = path.join(readyOutput, Builder.FORMAL_ATTACHMENTS_DIR, 'reports', 'beam.html');
  const packagedSource = path.join(readyOutput, Builder.INTERNAL_TRACE_DIR, Builder.TRACE_SOURCES_DIR, 'source', 'beam.json');
  const manifestPath = path.join(readyOutput, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
  const readmePath = path.join(readyOutput, Builder.INTERNAL_TRACE_DIR, Builder.INTERNAL_README_FILE);
  assert.equal(fs.existsSync(packagedReport), true);
  assert.equal(fs.existsSync(packagedSource), true);
  assert.equal(sha256(packagedReport), sha256(reportPath));
  assert.equal(sha256(packagedSource), sha256(sourcePath));
  assert.match(fs.readFileSync(readmePath, 'utf8'), /勿附入主報告/);

  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.kind, Builder.MANIFEST_KIND);
  assert.equal(manifest.generatedAt, FIXED_NOW.toISOString());
  assert.equal(manifest.projectNo, 'PKG-001');
  assert.equal(manifest.packageFingerprint, result.packageFingerprint);
  assert.equal(Builder.packageFingerprintForManifest(manifest), result.packageFingerprint);
  assert.equal(manifest.formalAttachments[0].packagedFile, '01_正式附件/reports/beam.html');
  assert.equal(manifest.traceabilitySources[0].packagedFile, '99_內部追溯_勿附入主報告/來源資料/source/beam.json');
  assert.equal(manifest.formalAttachments[0].sha256, sha256(reportPath));
  assert.equal(manifest.traceabilitySources[0].sha256, sha256(sourcePath));
  assert.equal(manifest.boundary.instruction.includes('送入主報告的檔案只取 01_正式附件'), true);
  const reorderedManifest = JSON.parse(JSON.stringify(manifest));
  reorderedManifest.formalAttachments[0].fingerprints.reverse();
  reorderedManifest.traceabilitySources[0].fingerprints.reverse();
  assert.equal(Builder.packageFingerprintV3(reorderedManifest), result.packageFingerprint, 'v3 fingerprint is independent of fingerprint array order');
  const changedTraceabilityManifest = JSON.parse(JSON.stringify(manifest));
  changedTraceabilityManifest.formalAttachments[0].toolVersion = 'v9.9';
  assert.notEqual(Builder.packageFingerprintV3(changedTraceabilityManifest), result.packageFingerprint, 'v3 fingerprint covers traceability metadata');
  const changedApprovalManifest = JSON.parse(JSON.stringify(manifest));
  changedApprovalManifest.formalAttachments[0].approvalTime = '2026/07/21 22:00:00';
  assert.notEqual(Builder.packageFingerprintV3(changedApprovalManifest), result.packageFingerprint, 'v3 fingerprint covers formal approval time');
  const changedBoundaryManifest = JSON.parse(JSON.stringify(manifest));
  changedBoundaryManifest.boundary.instruction = 'altered boundary';
  assert.notEqual(Builder.packageFingerprintV3(changedBoundaryManifest), result.packageFingerprint, 'v3 fingerprint covers package boundary');
  assert.equal(manifestText.includes(tempRoot), false, 'internal manifest must not leak absolute local paths');
  assert.equal(fs.existsSync(path.join(readyOutput, Builder.FORMAL_ATTACHMENTS_DIR, 'source', 'beam.json')), false, 'source JSON is not placed in the formal attachment directory');

  const cliOutput = path.join(tempRoot, 'cli-package');
  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-build.js'),
    '--input', readyInput,
    '--output', cliOutput,
    '--project-no', 'PKG-001',
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /正式附件包已建立/);
  assert.match(cli.stdout, /正式附件 1 份；內部追溯來源 1 份/);
  assert.match(cli.stdout, /發布前完整性與工程內容驗證：通過/);
  assert.equal(fs.existsSync(path.join(cliOutput, Builder.FORMAL_ATTACHMENTS_DIR, 'reports', 'beam.html')), true);

  const retryRenameSource = path.join(tempRoot, 'retry-rename-source');
  const retryRenameOutput = path.join(tempRoot, 'retry-rename-output');
  fs.mkdirSync(retryRenameSource);
  const originalRenameSync = fs.renameSync;
  let renameAttempts = 0;
  fs.renameSync = function patchedRenameSync(source, target) {
    renameAttempts += 1;
    if (renameAttempts === 1) {
      const error = new Error('simulated transient Windows lock');
      error.code = 'EPERM';
      throw error;
    }
    return originalRenameSync.call(fs, source, target);
  };
  try {
    Builder.publishStagingDirectory(retryRenameSource, retryRenameOutput, { retryDelaysMs: [0, 0] });
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(renameAttempts, 2, 'transient Windows rename lock is retried once');
  assert.equal(fs.existsSync(retryRenameOutput), true);
  const nonRetryRenameSource = path.join(tempRoot, 'non-retry-rename-source');
  const nonRetryRenameOutput = path.join(tempRoot, 'non-retry-rename-output');
  fs.mkdirSync(nonRetryRenameSource);
  let nonRetryAttempts = 0;
  fs.renameSync = function patchedNonRetryableRename() {
    nonRetryAttempts += 1;
    const error = new Error('simulated non-retryable rename failure');
    error.code = 'EXDEV';
    throw error;
  };
  try {
    assert.throws(
      () => Builder.publishStagingDirectory(nonRetryRenameSource, nonRetryRenameOutput, { retryDelaysMs: [0, 0, 0] }),
      /simulated non-retryable rename failure/,
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(nonRetryAttempts, 1, 'non-retryable rename errors fail immediately');
  assert.equal(fs.existsSync(nonRetryRenameSource), true);

  const selfVerifyInput = path.join(tempRoot, 'self-verify-failure-input');
  const selfVerifyOutput = path.join(tempRoot, 'self-verify-failure-package');
  fs.mkdirSync(selfVerifyInput, { recursive: true });
  writeSourceJson(selfVerifyInput);
  writeReport(selfVerifyInput, '文件狀態：正式附件');
  const originalVerifyPackage = Verifier.verifyPackage;
  Verifier.verifyPackage = () => ({
    kind: Verifier.VERIFICATION_KIND,
    status: 'blocked',
    packageFingerprint: '',
    summary: { expectedFiles: 2, verifiedFiles: 1, errors: 1, warnings: 0 },
    issues: [{ level: 'error', code: 'simulated-verification-failure', message: '模擬完整性驗證失敗', files: [] }],
    records: [],
  });
  try {
    assert.throws(
      () => Builder.buildPackage(selfVerifyInput, { output: selfVerifyOutput, projectNo: 'PKG-001', now: FIXED_NOW }),
      /發布前完整性與工程內容驗證未通過：模擬完整性驗證失敗/,
    );
  } finally {
    Verifier.verifyPackage = originalVerifyPackage;
  }
  assert.equal(fs.existsSync(selfVerifyOutput), false, 'failed self-verification must not publish the output directory');
  const selfVerifyStagingPrefix = `.${path.basename(selfVerifyOutput)}.tmp-`;
  assert.deepEqual(
    fs.readdirSync(path.dirname(selfVerifyOutput)).filter(name => name.startsWith(selfVerifyStagingPrefix)),
    [],
    'failed self-verification must remove the temporary package',
  );

  const linkedInput = path.join(tempRoot, 'linked-input');
  const linkedTarget = path.join(tempRoot, 'linked-target');
  const linkedOutput = path.join(tempRoot, 'linked-package');
  const linkedEntry = path.join(linkedInput, 'linked-outside');
  fs.mkdirSync(linkedInput, { recursive: true });
  fs.mkdirSync(linkedTarget, { recursive: true });
  writeSourceJson(linkedInput);
  writeReport(linkedInput, '文件狀態：正式附件');
  fs.writeFileSync(path.join(linkedTarget, 'outside.html'), '<div>outside</div>', 'utf8');
  fs.symlinkSync(linkedTarget, linkedEntry, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedResult = Builder.buildPackage(linkedInput, { output: linkedOutput, projectNo: 'PKG-001', now: FIXED_NOW });
  assert.equal(linkedResult.status, 'blocked', 'source junction must block the builder');
  assert.equal(linkedResult.built, false);
  assert(linkedResult.report.issues.some(issue => issue.code === 'unsafe-source-entry'));
  assert.equal(fs.existsSync(linkedOutput), false, 'unsafe source junction must not create an output package');
  assert.throws(
    () => Builder.safeSourcePath(linkedInput, path.join('linked-outside', 'outside.html')),
    /來源路徑不得包含符號連結或 junction/,
    'copy layer independently rejects a linked path even if the pre-check were bypassed',
  );

  const changedAfterCheckInput = path.join(tempRoot, 'changed-after-check-input');
  const changedAfterCheckOutput = path.join(tempRoot, 'changed-after-check-package');
  fs.mkdirSync(changedAfterCheckInput, { recursive: true });
  const changedAfterCheckReport = writeReport(changedAfterCheckInput, '文件狀態：正式附件');
  const originalCheckPackage = Checker.checkPackage;
  Checker.checkPackage = (...args) => {
    const report = originalCheckPackage(...args);
    fs.appendFileSync(changedAfterCheckReport, '\nchanged-after-check', 'utf8');
    return report;
  };
  try {
    assert.throws(
      () => Builder.buildPackage(changedAfterCheckInput, { output: changedAfterCheckOutput, projectNo: 'PKG-001', now: FIXED_NOW }),
      /來源檔案在檢查後已變更/,
    );
  } finally {
    Checker.checkPackage = originalCheckPackage;
  }
  assert.equal(fs.existsSync(changedAfterCheckOutput), false, 'source replacement after check must not publish a package');
  const changedAfterCheckStagingPrefix = `.${path.basename(changedAfterCheckOutput)}.tmp-`;
  assert.deepEqual(
    fs.readdirSync(path.dirname(changedAfterCheckOutput)).filter(name => name.startsWith(changedAfterCheckStagingPrefix)),
    [],
    'source replacement after check must remove the temporary package',
  );

  const changedDuringCopyInput = path.join(tempRoot, 'changed-during-copy-input');
  const changedDuringCopyOutput = path.join(tempRoot, 'changed-during-copy-package');
  fs.mkdirSync(changedDuringCopyInput, { recursive: true });
  const changedDuringCopyReport = writeReport(changedDuringCopyInput, '文件狀態：正式附件');
  const originalCopyFileSync = fs.copyFileSync;
  let changedDuringCopy = false;
  fs.copyFileSync = function patchedCopyFileSync(sourcePath, targetPath, ...args) {
    const result = originalCopyFileSync.call(fs, sourcePath, targetPath, ...args);
    if (!changedDuringCopy && path.resolve(String(sourcePath)) === path.resolve(changedDuringCopyReport)) {
      changedDuringCopy = true;
      fs.appendFileSync(changedDuringCopyReport, '\nchanged-during-copy', 'utf8');
    }
    return result;
  };
  try {
    assert.throws(
      () => Builder.buildPackage(changedDuringCopyInput, { output: changedDuringCopyOutput, projectNo: 'PKG-001', now: FIXED_NOW }),
      /來源檔案在複製期間發生變更/,
    );
  } finally {
    fs.copyFileSync = originalCopyFileSync;
  }
  assert.equal(fs.existsSync(changedDuringCopyOutput), false, 'source change during copy must not publish a package');
  const changedDuringCopyStagingPrefix = `.${path.basename(changedDuringCopyOutput)}.tmp-`;
  assert.deepEqual(
    fs.readdirSync(path.dirname(changedDuringCopyOutput)).filter(name => name.startsWith(changedDuringCopyStagingPrefix)),
    [],
    'source change during copy must remove the temporary package',
  );

  const reviewInput = path.join(tempRoot, 'review-input');
  const reviewOutput = path.join(tempRoot, 'review-package');
  fs.mkdirSync(reviewInput, { recursive: true });
  writeSourceJson(reviewInput);
  writeReport(reviewInput, '計算結果已完成', 'reports/unclassified.html');
  const reviewResult = Builder.buildPackage(reviewInput, { output: reviewOutput, projectNo: 'PKG-001' });
  assert.equal(reviewResult.status, 'review');
  assert.equal(reviewResult.built, false);
  assert.equal(fs.existsSync(reviewOutput), false, 'review state must not create an output folder');
  const reviewCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-build.js'), '--input', reviewInput, '--output', reviewOutput], { encoding: 'utf8' });
  assert.equal(reviewCli.status, 1, reviewCli.stderr || reviewCli.stdout);
  assert.match(reviewCli.stdout, /未建立正式附件包/);

  const blockedInput = path.join(tempRoot, 'blocked-input');
  const blockedOutput = path.join(tempRoot, 'blocked-package');
  fs.mkdirSync(blockedInput, { recursive: true });
  writeSourceJson(blockedInput);
  writeReport(blockedInput, '文件狀態：內部審閱');
  const blockedResult = Builder.buildPackage(blockedInput, { output: blockedOutput, projectNo: 'PKG-001' });
  assert.equal(blockedResult.status, 'blocked');
  assert.equal(blockedResult.built, false);
  assert.equal(fs.existsSync(blockedOutput), false, 'internal-review state must not create an output folder');
  const blockedCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-build.js'), '--input', blockedInput, '--output', blockedOutput], { encoding: 'utf8' });
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);

  const sourceOnlyInput = path.join(tempRoot, 'source-only-input');
  const sourceOnlyOutput = path.join(tempRoot, 'source-only-package');
  fs.mkdirSync(sourceOnlyInput, { recursive: true });
  writeSourceJson(sourceOnlyInput);
  const sourceOnlyResult = Builder.buildPackage(sourceOnlyInput, { output: sourceOnlyOutput, projectNo: 'PKG-001' });
  assert.equal(sourceOnlyResult.status, 'blocked');
  assert.equal(sourceOnlyResult.built, false);
  assert.equal(sourceOnlyResult.report.issues.some(issue => issue.code === 'no-formal-attachments'), true);
  assert.equal(fs.existsSync(sourceOnlyOutput), false, 'source-only input must not create an empty formal package');

  assert.throws(
    () => Builder.buildPackage(readyInput, { output: path.join(readyInput, 'package') }),
    /不得位於來源附件資料夾內/,
  );
  const existingOutput = path.join(tempRoot, 'existing-output');
  fs.mkdirSync(existingOutput);
  fs.writeFileSync(path.join(existingOutput, 'keep.txt'), 'keep', 'utf8');
  assert.throws(() => Builder.buildPackage(readyInput, { output: existingOutput }), /輸出位置已存在/);
  assert.equal(fs.readFileSync(path.join(existingOutput, 'keep.txt'), 'utf8'), 'keep');

  const helpCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-build.js'), '--help'], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-build.js')], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package build OK');
