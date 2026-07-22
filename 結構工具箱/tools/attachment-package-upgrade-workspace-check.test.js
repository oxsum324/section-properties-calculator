'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Workspace = require('./attachment-package-upgrade-workspace.js');
const Completion = require('./attachment-package-upgrade-workspace-check.js');
const Verifier = require('./attachment-package-verify.js');

const FINGERPRINT = 'CF-2468ACE013579BDF';
const OTHER_FINGERPRINT = 'CF-FEDCBA9876543210';
const PROJECT_NO = 'PKG-COMPLETE-001';
const OLD_PACKAGE_NOW = new Date('2026-07-21T14:00:00.000Z');
const WORKSPACE_NOW = new Date('2026-07-21T15:00:00.000Z');
const NEW_PACKAGE_NOW = new Date('2026-07-21T15:10:00.000Z');

function writeSource(filePath, options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: options.version || 'V3.1' },
    project: { no: PROJECT_NO },
    calculationFingerprint: options.fingerprint || FINGERPRINT,
    savedAt: options.savedAt || '2026/07/21 21:45:00',
  }), 'utf8');
}

function writeReport(filePath, options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '<h1>RC 梁設計計算書</h1>',
    `<div>${options.documentState || '文件狀態：正式附件'}</div>`,
    `<div>計畫編號：${PROJECT_NO}</div>`,
    '<div>產出工具：RC 梁</div>',
    `<div>工具版本：${options.version || 'v3.1'}</div>`,
    `<div>輸出時間：${options.outputTime || '2026/07/21 21:50:00'}</div>`,
    `<div>核可時間：${options.approvalTime || '2026/07/21 21:55:00'}</div>`,
    `<div>計算指紋：${options.fingerprint || FINGERPRINT}</div>`,
    '<section><h2>採用輸入</h2><div>材料與荷載資料</div></section>',
    '<section><h2>計算內容</h2><div>檢核公式與代入值</div></section>',
    '<section><h2>檢核結論</h2><div>檢核結果：通過</div></section>',
  ].join('\n'), 'utf8');
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

function createLegacyWorkspace(tempRoot, name) {
  const inputDir = path.join(tempRoot, `${name}-old-input`);
  const packageDir = path.join(tempRoot, `${name}-legacy-v2`);
  const workspaceDir = path.join(tempRoot, `${name}-workspace`);
  fs.mkdirSync(inputDir, { recursive: true });
  writeSource(path.join(inputDir, 'source', 'beam.json'));
  writeReport(path.join(inputDir, 'reports', 'beam.html'));
  const built = Builder.buildPackage(inputDir, { output: packageDir, projectNo: PROJECT_NO, now: OLD_PACKAGE_NOW });
  assert.equal(built.status, 'ready');
  const legacyManifest = convertToLegacyV2(packageDir);
  const created = Workspace.createUpgradeWorkspace(packageDir, { output: workspaceDir, now: WORKSPACE_NOW });
  assert.equal(created.status, 'review');
  return {
    inputDir,
    packageDir,
    workspaceDir,
    packageSourceDir: path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR),
    formalDir: path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR, Workspace.NEW_FORMAL_REPORTS_DIR),
    sourceDir: path.join(workspaceDir, Workspace.PACKAGE_SOURCE_DIR, Workspace.NEW_TRACE_SOURCES_DIR),
    legacyManifest,
  };
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

function writeFreshPair(fixture, options = {}) {
  writeReport(path.join(fixture.formalDir, options.reportName || 'beam-new.html'), {
    documentState: options.documentState,
    fingerprint: options.reportFingerprint,
    version: options.reportVersion || 'v3.2',
    outputTime: options.outputTime || '2026/07/21 23:05:00',
    approvalTime: options.approvalTime || '2026/07/21 23:06:00',
  });
  writeSource(path.join(fixture.sourceDir, options.sourceName || 'beam-new.json'), {
    fingerprint: options.sourceFingerprint,
    version: options.sourceVersion || 'V3.2',
    savedAt: options.savedAt || '2026/07/21 23:04:00',
  });
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

assert.equal(Completion.CHECK_KIND, 'formal-attachment-package-upgrade-workspace-check.v1');
assert.deepEqual(
  Completion.parseArgs(['--input', 'C:/workspace', '--project-no', PROJECT_NO, '--json']),
  { json: true, input: 'C:/workspace', projectNo: PROJECT_NO },
);
assert.match(Completion.usage(), /--project-no/);
assert.equal(
  Completion.workspaceRootForPackageSource('C:/case/workspace/01_新組包來源'),
  path.resolve('C:/case/workspace'),
);
assert.equal(Completion.workspaceRootForPackageSource('C:/case/ordinary-input'), '');
assert.equal(Workspace.planFingerprint({ a: 1, b: 2 }), Workspace.planFingerprint({ b: 2, a: 1 }));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-workspace-check-'));
try {
  const fixture = createLegacyWorkspace(tempRoot, 'main');
  const initialSnapshot = directorySnapshot(fixture.workspaceDir);
  const initial = Completion.checkUpgradeWorkspace(fixture.workspaceDir, { projectNo: PROJECT_NO });
  assert.equal(initial.kind, Completion.CHECK_KIND);
  assert.equal(initial.status, 'review');
  assert.equal(initial.formalReady, false);
  assert.deepEqual(initial.summary, { total: 1, matched: 0, pending: 1, errors: 0, warnings: 3 });
  assert.equal(issueCodes(initial).includes('no-attachments'), true);
  assert.equal(issueCodes(initial).includes('new-formal-match-count'), true);
  assert.equal(issueCodes(initial).includes('new-source-match-count'), true);
  assert.deepEqual(directorySnapshot(fixture.workspaceDir), initialSnapshot, 'completion check must be read-only');
  assert.match(Completion.formatSummary(initial), /待完成/);
  assert.match(Completion.formatSummary(initial), /不會代替人工核可/);

  const incompleteOutput = path.join(tempRoot, 'incomplete-package-must-not-exist');
  const incompleteBuild = Builder.buildPackage(fixture.packageSourceDir, {
    output: incompleteOutput,
    projectNo: PROJECT_NO,
    now: NEW_PACKAGE_NOW,
  });
  assert.equal(incompleteBuild.status, 'review');
  assert.equal(incompleteBuild.built, false);
  assert.equal(incompleteBuild.upgradeWorkspaceCheck.status, 'review');
  assert.equal(fs.existsSync(incompleteOutput), false);
  const incompleteCliOutput = path.join(tempRoot, 'incomplete-cli-package-must-not-exist');
  const incompleteCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-build.js'),
    '--input', fixture.packageSourceDir,
    '--output', incompleteCliOutput,
  ], { encoding: 'utf8' });
  assert.equal(incompleteCli.status, 1, incompleteCli.stderr || incompleteCli.stdout);
  assert.match(incompleteCli.stdout, /升級工作區完成度：待完成/);
  assert.doesNotMatch(incompleteCli.stdout, /附件組包一致性檢查：暫勿整理/);
  assert.equal(fs.existsSync(incompleteCliOutput), false);

  const oldFormal = path.join(fixture.packageDir, ...fixture.legacyManifest.formalAttachments[0].packagedFile.split('/'));
  const oldSource = path.join(fixture.packageDir, ...fixture.legacyManifest.traceabilitySources[0].packagedFile.split('/'));
  fs.copyFileSync(oldFormal, path.join(fixture.formalDir, 'beam-old-copy.html'));
  fs.copyFileSync(oldSource, path.join(fixture.sourceDir, 'beam-old-copy.json'));
  const copiedOld = Completion.checkUpgradeWorkspace(fixture.workspaceDir);
  assert.equal(copiedOld.status, 'review');
  assert.equal(copiedOld.summary.matched, 0);
  assert.equal(issueCodes(copiedOld).includes('new-output-not-fresh'), true);
  assert.equal(issueCodes(copiedOld).includes('new-approval-not-fresh'), true);
  assert.equal(copiedOld.packageCheck.status, 'ready', 'old copies would pass ordinary package checks but must fail workspace freshness');
  const copiedOutput = path.join(tempRoot, 'copied-old-package-must-not-exist');
  const copiedBuild = Builder.buildPackage(fixture.packageSourceDir, { output: copiedOutput, now: NEW_PACKAGE_NOW });
  assert.equal(copiedBuild.status, 'review');
  assert.equal(copiedBuild.built, false);
  assert.equal(fs.existsSync(copiedOutput), false);

  fs.rmSync(path.join(fixture.formalDir, 'beam-old-copy.html'));
  fs.rmSync(path.join(fixture.sourceDir, 'beam-old-copy.json'));
  writeFreshPair(fixture);
  const readySnapshot = directorySnapshot(fixture.workspaceDir);
  const ready = Completion.checkUpgradeWorkspace(fixture.workspaceDir, { projectNo: PROJECT_NO });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.formalReady, true);
  assert.deepEqual(ready.summary, { total: 1, matched: 1, pending: 0, errors: 0, warnings: 0 });
  assert.equal(ready.packageCheck.status, 'ready');
  assert.equal(ready.workItems[0].status, 'ready');
  assert.deepEqual(ready.workItems[0].formalFiles, [`${Workspace.NEW_FORMAL_REPORTS_DIR}\\beam-new.html`]);
  assert.deepEqual(ready.workItems[0].sourceFiles, [`${Workspace.NEW_TRACE_SOURCES_DIR}\\beam-new.json`]);
  assert.deepEqual(directorySnapshot(fixture.workspaceDir), readySnapshot, 'ready check must not write approval or status back to workspace');
  assert.match(Completion.formatSummary(ready), /可進入正式組包/);

  const readyCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'),
    '--input', fixture.workspaceDir,
    '--project-no', PROJECT_NO,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(readyCli.status, 0, readyCli.stderr || readyCli.stdout);
  assert.equal(JSON.parse(readyCli.stdout).status, 'ready');

  const expectedDefaultOutput = path.join(
    tempRoot,
    `${path.basename(fixture.workspaceDir)}-v3正式附件包-${Builder.timestampToken(NEW_PACKAGE_NOW)}`,
  );
  const built = Builder.buildPackage(fixture.packageSourceDir, { projectNo: PROJECT_NO, now: NEW_PACKAGE_NOW });
  assert.equal(built.status, 'ready');
  assert.equal(built.built, true);
  assert.equal(built.outputDir, expectedDefaultOutput);
  assert.equal(built.upgradeWorkspaceCheck.status, 'ready');
  assert.equal(Verifier.verifyPackage(expectedDefaultOutput).status, 'ready');
  assert.equal(Builder.isPathInside(fixture.workspaceDir, expectedDefaultOutput), false);
  assert.deepEqual(directorySnapshot(fixture.workspaceDir), readySnapshot, 'formal packaging must not modify the upgrade workspace');
  assert.throws(
    () => Builder.buildPackage(fixture.packageSourceDir, {
      output: path.join(fixture.workspaceDir, 'must-not-build-here'),
      now: NEW_PACKAGE_NOW,
    }),
    /必須輸出在工作區外/,
  );

  const reviewFixture = createLegacyWorkspace(tempRoot, 'internal-review');
  writeFreshPair(reviewFixture, { documentState: '文件狀態：內部審閱' });
  const review = Completion.checkUpgradeWorkspace(reviewFixture.workspaceDir);
  assert.equal(review.status, 'review');
  assert.deepEqual(review.summary, { total: 1, matched: 0, pending: 1, errors: 0, warnings: 1 });
  assert.equal(review.workItems[0].status, 'pending');
  assert.equal(issueCodes(review).includes('internal-review-document'), true);
  const reviewCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'), '--input', reviewFixture.workspaceDir,
  ], { encoding: 'utf8' });
  assert.equal(reviewCli.status, 1, reviewCli.stderr || reviewCli.stdout);

  const mismatchFixture = createLegacyWorkspace(tempRoot, 'fingerprint-mismatch');
  writeFreshPair(mismatchFixture, { sourceFingerprint: OTHER_FINGERPRINT });
  const mismatch = Completion.checkUpgradeWorkspace(mismatchFixture.workspaceDir);
  assert.equal(mismatch.status, 'blocked');
  assert.equal(issueCodes(mismatch).includes('source-report-fingerprint-mismatch'), true);

  const tamperedPlanFixture = createLegacyWorkspace(tempRoot, 'tampered-plan');
  const tamperedPlanPath = path.join(tamperedPlanFixture.workspaceDir, Workspace.INTERNAL_GUIDE_DIR, Workspace.PLAN_JSON_FILE);
  const tamperedPlan = JSON.parse(fs.readFileSync(tamperedPlanPath, 'utf8'));
  tamperedPlan.workItems[0].sourceTool = '被改寫的工具';
  fs.writeFileSync(tamperedPlanPath, `${JSON.stringify(tamperedPlan, null, 2)}\n`, 'utf8');
  const tamperedPlanResult = Completion.checkUpgradeWorkspace(tamperedPlanFixture.workspaceDir);
  assert.equal(tamperedPlanResult.status, 'blocked');
  assert.equal(issueCodes(tamperedPlanResult).includes('workspace-plan-fingerprint-mismatch'), true);
  const tamperedCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'), '--input', tamperedPlanFixture.workspaceDir,
  ], { encoding: 'utf8' });
  assert.equal(tamperedCli.status, 2, tamperedCli.stderr || tamperedCli.stdout);

  const tamperedMarkdownFixture = createLegacyWorkspace(tempRoot, 'tampered-markdown');
  const markdownPath = path.join(tamperedMarkdownFixture.workspaceDir, Workspace.INTERNAL_GUIDE_DIR, Workspace.PLAN_MARKDOWN_FILE);
  fs.appendFileSync(markdownPath, '\n自行宣告完成', 'utf8');
  const tamperedMarkdown = Completion.checkUpgradeWorkspace(tamperedMarkdownFixture.workspaceDir);
  assert.equal(tamperedMarkdown.status, 'blocked');
  assert.equal(issueCodes(tamperedMarkdown).includes('workspace-plan-markdown-mismatch'), true);

  const extraFileFixture = createLegacyWorkspace(tempRoot, 'extra-root-file');
  fs.writeFileSync(path.join(extraFileFixture.workspaceDir, '正式核可.txt'), 'yes', 'utf8');
  const extraFile = Completion.checkUpgradeWorkspace(extraFileFixture.workspaceDir);
  assert.equal(extraFile.status, 'blocked');
  assert.equal(issueCodes(extraFile).includes('workspace-root-layout-mismatch'), true);

  const helpCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'), '--help',
  ], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'),
  ], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
  const missingFolderCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace-check.js'), '--input', path.join(tempRoot, 'missing'),
  ], { encoding: 'utf8' });
  assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade workspace completion check OK');
