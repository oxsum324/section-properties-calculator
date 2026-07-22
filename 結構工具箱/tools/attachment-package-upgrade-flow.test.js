'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Workspace = require('./attachment-package-upgrade-workspace.js');
const Flow = require('./attachment-package-upgrade-flow.js');
const Verifier = require('./attachment-package-verify.js');

const FINGERPRINT = 'CF-1122334455667788';
const PROJECT_NO = 'PKG-FLOW-001';
const OLD_PACKAGE_NOW = new Date('2026-07-21T14:00:00.000Z');
const WORKSPACE_NOW = new Date('2026-07-21T15:00:00.000Z');
const NEW_PACKAGE_NOW = new Date('2026-07-21T15:10:00.000Z');

function writeSource(filePath, savedAt = '2026/07/21 21:45:00', version = 'V3.1') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version },
    project: { no: PROJECT_NO },
    calculationFingerprint: FINGERPRINT,
    savedAt,
  }), 'utf8');
}

function writeReport(filePath, outputTime = '2026/07/21 21:50:00', approvalTime = '2026/07/21 21:55:00', version = 'v3.1') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    `<div>計畫編號：${PROJECT_NO}</div>`,
    '<div>產出工具：RC 梁</div>',
    `<div>工具版本：${version}</div>`,
    `<div>輸出時間：${outputTime}</div>`,
    `<div>核可時間：${approvalTime}</div>`,
    `<div>計算指紋：${FINGERPRINT}</div>`,
  ].join('\n'), 'utf8');
}

function createCurrentPackage(tempRoot, name) {
  const inputDir = path.join(tempRoot, `${name}-input`);
  const packageDir = path.join(tempRoot, `${name}-v3-package`);
  fs.mkdirSync(inputDir, { recursive: true });
  writeSource(path.join(inputDir, 'source', 'beam.json'));
  writeReport(path.join(inputDir, 'reports', 'beam.html'));
  const result = Builder.buildPackage(inputDir, { output: packageDir, projectNo: PROJECT_NO, now: OLD_PACKAGE_NOW });
  assert.equal(result.status, 'ready');
  return packageDir;
}

function manifestPath(packageDir) {
  return path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
}

function writeLegacyReadme(packageDir, packageFingerprint) {
  fs.writeFileSync(
    path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.INTERNAL_README_FILE),
    `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${Builder.FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${packageFingerprint}\r\n`,
    'utf8',
  );
}

function convertToLegacyV2(packageDir) {
  const filePath = manifestPath(packageDir);
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  manifest.schemaVersion = 2;
  manifest.kind = Builder.PREVIOUS_MANIFEST_KIND;
  manifest.formalAttachments.forEach(record => { delete record.approvalTime; });
  manifest.traceabilitySources.forEach(record => { delete record.approvalTime; });
  manifest.packageFingerprint = Builder.packageFingerprintV2(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeLegacyReadme(packageDir, manifest.packageFingerprint);
  return manifest;
}

function createLegacyPackage(tempRoot, name) {
  const packageDir = createCurrentPackage(tempRoot, name);
  const manifest = convertToLegacyV2(packageDir);
  return { packageDir, manifest };
}

function directorySnapshot(rootDir) {
  const records = [];
  function visit(currentDir, relativeDir = '') {
    fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .forEach(entry => {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = path.posix.join(relativeDir, entry.name);
        if (entry.isDirectory()) visit(absolutePath, relativePath);
        else records.push({
          path: relativePath,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
        });
      });
  }
  visit(rootDir);
  return records;
}

function fillFreshWorkspace(workspaceDir) {
  const formalDir = path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR, Workspace.NEW_FORMAL_REPORTS_DIR);
  const sourceDir = path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR, Workspace.NEW_TRACE_SOURCES_DIR);
  writeReport(path.join(formalDir, 'beam-new.html'), '2026/07/21 23:05:00', '2026/07/21 23:06:00', 'v3.2');
  writeSource(path.join(sourceDir, 'beam-new.json'), '2026/07/21 23:04:00', 'V3.2');
}

assert.equal(Flow.FLOW_KIND, 'formal-attachment-package-upgrade-flow.v1');
assert.deepEqual(
  Flow.parseArgs(['--input', 'C:/input', '--output', 'C:/output', '--project-no', PROJECT_NO, '--history-dir', 'C:/history', '--json']),
  { json: true, input: 'C:/input', output: 'C:/output', projectNo: PROJECT_NO, historyDir: 'C:/history' },
);
assert.match(Flow.usage(), /正式附件包｜升級工作區｜新組包來源/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-flow-'));
try {
  const legacy = createLegacyPackage(tempRoot, 'legacy-main');
  assert.equal(Flow.detectInputKind(legacy.packageDir).kind, Flow.INPUT_KINDS.FORMAL_PACKAGE);
  const legacyBefore = directorySnapshot(legacy.packageDir);
  const workspaceDir = path.join(tempRoot, 'main-upgrade-workspace');
  const legacyFlow = Flow.runUpgradeFlow(legacy.packageDir, { output: workspaceDir, now: WORKSPACE_NOW });
  assert.equal(legacyFlow.kind, Flow.FLOW_KIND);
  assert.equal(legacyFlow.inputKind, Flow.INPUT_KINDS.FORMAL_PACKAGE);
  assert.equal(legacyFlow.action, 'workspace-created');
  assert.equal(legacyFlow.status, 'review');
  assert.equal(legacyFlow.changedState, true);
  assert.equal(legacyFlow.workspaceDir, workspaceDir);
  assert.equal(fs.existsSync(workspaceDir), true);
  assert.deepEqual(directorySnapshot(legacy.packageDir), legacyBefore, 'flow must not modify the legacy package');
  assert.match(Flow.formatSummary(legacyFlow), /下一步：回原始工具或可信來源逐份重新輸出並人工核可/);

  assert.equal(Flow.detectInputKind(workspaceDir).kind, Flow.INPUT_KINDS.UPGRADE_WORKSPACE);
  const packageSourceDir = path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR);
  assert.equal(Flow.detectInputKind(packageSourceDir).kind, Flow.INPUT_KINDS.PACKAGE_SOURCE);
  const emptySnapshot = directorySnapshot(workspaceDir);
  const pendingOutput = path.join(tempRoot, 'pending-package-must-not-exist');
  const pending = Flow.runUpgradeFlow(workspaceDir, { output: pendingOutput, projectNo: PROJECT_NO, now: NEW_PACKAGE_NOW });
  assert.equal(pending.action, 'completion-pending');
  assert.equal(pending.status, 'review');
  assert.equal(pending.changedState, false);
  assert.equal(fs.existsSync(pendingOutput), false);
  assert.deepEqual(directorySnapshot(workspaceDir), emptySnapshot, 'pending flow must be read-only');
  assert.match(Flow.formatSummary(pending), /本次未建立正式附件包/);

  fillFreshWorkspace(workspaceDir);
  const readyWorkspaceSnapshot = directorySnapshot(workspaceDir);
  const newPackageDir = path.join(tempRoot, 'main-new-v3-package');
  const completed = Flow.runUpgradeFlow(workspaceDir, {
    output: newPackageDir,
    projectNo: PROJECT_NO,
    now: NEW_PACKAGE_NOW,
  });
  assert.equal(completed.action, 'package-built');
  assert.equal(completed.status, 'ready');
  assert.equal(completed.changedState, true);
  assert.equal(completed.packageDir, newPackageDir);
  assert.equal(completed.completion.status, 'ready');
  assert.equal(completed.buildResult.selfVerification.status, 'ready');
  assert.equal(Verifier.verifyPackage(newPackageDir).status, 'ready');
  assert.deepEqual(directorySnapshot(workspaceDir), readyWorkspaceSnapshot, 'successful flow must not modify the workspace');
  assert.match(Flow.formatSummary(completed), /新的 v3 正式附件包已建立/);
  assert.match(Flow.formatSummary(completed), /發布前完整性驗證：通過/);

  const sourceInputPackage = path.join(tempRoot, 'source-input-v3-package');
  const sourceInputResult = Flow.runUpgradeFlow(packageSourceDir, {
    output: sourceInputPackage,
    projectNo: PROJECT_NO,
    now: new Date('2026-07-21T15:11:00.000Z'),
  });
  assert.equal(sourceInputResult.inputKind, Flow.INPUT_KINDS.PACKAGE_SOURCE);
  assert.equal(sourceInputResult.action, 'package-built');
  assert.equal(Verifier.verifyPackage(sourceInputPackage).status, 'ready');
  assert.throws(
    () => Flow.runUpgradeFlow(workspaceDir, {
      output: path.join(workspaceDir, 'must-not-build-inside-workspace'),
      now: NEW_PACKAGE_NOW,
    }),
    /必須輸出在工作區外/,
  );

  const currentPackage = createCurrentPackage(tempRoot, 'current');
  const currentBefore = directorySnapshot(currentPackage);
  const current = Flow.runUpgradeFlow(currentPackage, { output: path.join(tempRoot, 'unused-output') });
  assert.equal(current.action, 'no-upgrade-needed');
  assert.equal(current.status, 'ready');
  assert.equal(current.changedState, false);
  assert.equal(fs.existsSync(path.join(tempRoot, 'unused-output')), false);
  assert.deepEqual(directorySnapshot(currentPackage), currentBefore, 'current v3 flow must be read-only');
  assert.match(Flow.formatSummary(current), /不執行任何變更/);
  const currentHistoryDir = path.join(tempRoot, 'current-history');
  const currentCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'),
    '--input', currentPackage,
    '--history-dir', currentHistoryDir,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(currentCli.status, 0, currentCli.stderr || currentCli.stdout);
  const currentCliResult = JSON.parse(currentCli.stdout);
  assert.equal(currentCliResult.action, 'no-upgrade-needed');
  assert.equal(currentCliResult.history.written, true);
  assert.equal(fs.existsSync(currentCliResult.history.recordPath), true);
  assert.deepEqual(directorySnapshot(currentPackage), currentBefore, 'external history must not modify current v3 package');

  const blockedLegacy = createLegacyPackage(tempRoot, 'blocked-legacy');
  const blockedFormalPath = path.join(
    blockedLegacy.packageDir,
    ...blockedLegacy.manifest.formalAttachments[0].packagedFile.split('/'),
  );
  fs.appendFileSync(blockedFormalPath, '\n內容遭修改', 'utf8');
  const blockedWorkspace = path.join(tempRoot, 'blocked-workspace-must-not-exist');
  const blocked = Flow.runUpgradeFlow(blockedLegacy.packageDir, { output: blockedWorkspace, now: WORKSPACE_NOW });
  assert.equal(blocked.action, 'package-blocked');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.changedState, false);
  assert.equal(fs.existsSync(blockedWorkspace), false);
  const blockedHistoryDir = path.join(tempRoot, 'blocked-history');
  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'),
    '--input', blockedLegacy.packageDir,
    '--history-dir', blockedHistoryDir,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  const blockedCliResult = JSON.parse(blockedCli.stdout);
  assert.equal(blockedCliResult.action, 'package-blocked');
  assert.equal(blockedCliResult.history.receipt.flow.status, 'blocked');
  assert.equal(fs.existsSync(blockedCliResult.history.recordPath), true);

  const missingManifestPackage = createCurrentPackage(tempRoot, 'missing-manifest');
  fs.rmSync(manifestPath(missingManifestPackage));
  assert.equal(Flow.detectInputKind(missingManifestPackage).kind, Flow.INPUT_KINDS.FORMAL_PACKAGE);
  const missingManifest = Flow.runUpgradeFlow(missingManifestPackage, { output: path.join(tempRoot, 'missing-manifest-workspace') });
  assert.equal(missingManifest.action, 'package-blocked');
  assert.equal(missingManifest.status, 'blocked');

  const tamperedLegacy = createLegacyPackage(tempRoot, 'tampered-workspace');
  const tamperedWorkspace = path.join(tempRoot, 'tampered-workspace');
  Flow.runUpgradeFlow(tamperedLegacy.packageDir, { output: tamperedWorkspace, now: WORKSPACE_NOW });
  const planPath = path.join(tamperedWorkspace, Workspace.INTERNAL_GUIDE_DIR, Workspace.PLAN_JSON_FILE);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  plan.formalReadiness = 'ready';
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const tamperedOutput = path.join(tempRoot, 'tampered-package-must-not-exist');
  const tampered = Flow.runUpgradeFlow(tamperedWorkspace, { output: tamperedOutput, now: NEW_PACKAGE_NOW });
  assert.equal(tampered.action, 'workspace-blocked');
  assert.equal(tampered.status, 'blocked');
  assert.equal(fs.existsSync(tamperedOutput), false);

  const cliLegacy = createLegacyPackage(tempRoot, 'cli-legacy');
  const cliWorkspace = path.join(tempRoot, 'cli-workspace');
  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'),
    '--input', cliLegacy.packageDir,
    '--output', cliWorkspace,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.action, 'workspace-created');
  assert.equal(cliResult.status, 'review');
  assert.equal(fs.existsSync(cliWorkspace), true);
  assert.equal(cliResult.history.written, true);
  assert.equal(fs.existsSync(cliResult.history.recordPath), true);
  assert.equal(path.resolve(cliResult.history.historyDir), path.join(tempRoot, '附件升級內部歷程_勿附入主報告'));
  assert.equal(Builder.isPathInside(cliLegacy.packageDir, cliResult.history.recordPath), false);
  assert.equal(Builder.isPathInside(cliWorkspace, cliResult.history.recordPath), false);
  assert.doesNotMatch(fs.readFileSync(cliResult.history.recordPath, 'utf8'), /approvalTime|核可時間/i);

  const invalidHistoryLegacy = createLegacyPackage(tempRoot, 'invalid-history-legacy');
  const invalidHistoryWorkspace = path.join(tempRoot, 'invalid-history-workspace-must-not-exist');
  assert.throws(
    () => Flow.runUpgradeFlowWithHistory(invalidHistoryLegacy.packageDir, {
      output: invalidHistoryWorkspace,
      historyDir: path.join(invalidHistoryLegacy.packageDir, 'history'),
      now: WORKSPACE_NOW,
    }),
    /必須位於附件包、升級工作區及正式輸出之外/,
  );
  assert.equal(fs.existsSync(invalidHistoryWorkspace), false, 'unsafe history boundary must stop before workspace creation');

  const unknownDir = path.join(tempRoot, 'unknown');
  fs.mkdirSync(unknownDir);
  assert.throws(() => Flow.detectInputKind(unknownDir), /無法辨識輸入階段/);
  const unknownCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'), '--input', unknownDir,
  ], { encoding: 'utf8' });
  assert.equal(unknownCli.status, 3, unknownCli.stderr || unknownCli.stdout);
  const helpCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'), '--help',
  ], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'),
  ], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
  const missingFolderCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-flow.js'), '--input', path.join(tempRoot, 'missing'),
  ], { encoding: 'utf8' });
  assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package unified upgrade flow OK');
