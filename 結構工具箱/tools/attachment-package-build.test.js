'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');

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
    '<div>輸出時間：2026/07/21 21:00:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
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
  assert.equal(manifest.kind, 'formal-attachment-package.v1');
  assert.equal(manifest.generatedAt, FIXED_NOW.toISOString());
  assert.equal(manifest.projectNo, 'PKG-001');
  assert.equal(manifest.packageFingerprint, result.packageFingerprint);
  assert.equal(manifest.formalAttachments[0].packagedFile, '01_正式附件/reports/beam.html');
  assert.equal(manifest.traceabilitySources[0].packagedFile, '99_內部追溯_勿附入主報告/來源資料/source/beam.json');
  assert.equal(manifest.formalAttachments[0].sha256, sha256(reportPath));
  assert.equal(manifest.traceabilitySources[0].sha256, sha256(sourcePath));
  assert.equal(manifest.boundary.instruction.includes('送入主報告的檔案只取 01_正式附件'), true);
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
  assert.equal(fs.existsSync(path.join(cliOutput, Builder.FORMAL_ATTACHMENTS_DIR, 'reports', 'beam.html')), true);

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
