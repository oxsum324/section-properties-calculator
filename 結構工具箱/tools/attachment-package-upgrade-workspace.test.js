'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const Workspace = require('./attachment-package-upgrade-workspace.js');

const FINGERPRINT = 'CF-13579BDF2468ACE0';
const FIXED_NOW = new Date('2026-07-21T15:00:00.000Z');

function writeReadySource(inputDir) {
  const sourcePath = path.join(inputDir, 'source', 'beam.json');
  const reportPath = path.join(inputDir, 'reports', 'beam.html');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: 'V3.1' },
    project: { no: 'PKG-WORKSPACE-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/21 22:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>只有舊附件含有的內容標記：LEGACY-CONTENT-MUST-NOT-BE-COPIED</div>',
    '<div>文件狀態：正式附件</div>',
    '<div>計畫編號：PKG-WORKSPACE-001</div>',
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/21 22:00:00</div>',
    '<div>核可時間：2026/07/21 22:05:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
    '<section><h2>採用輸入</h2><div>材料與荷載資料：fc\'=280 kgf/cm²；Mu=12.5 tf·m</div></section>',
    '<section><h2>計算內容</h2><div>檢核公式與代入值：Mu=12.5 tf·m；φMn=18.2 tf·m</div></section>',
    '<section><h2>檢核結論</h2><div>DCR=0.69；檢核結果：通過</div></section>',
  ].join('\n'), 'utf8');
}

function createPackage(tempRoot, name) {
  const inputDir = path.join(tempRoot, `${name}-input`);
  const outputDir = path.join(tempRoot, `${name}-package`);
  fs.mkdirSync(inputDir, { recursive: true });
  writeReadySource(inputDir);
  const result = Builder.buildPackage(inputDir, {
    output: outputDir,
    projectNo: 'PKG-WORKSPACE-001',
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

function convertToLegacyV2(packageDir) {
  const filePath = manifestPath(packageDir);
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  manifest.schemaVersion = 2;
  manifest.kind = Builder.PREVIOUS_MANIFEST_KIND;
  manifest.formalAttachments.forEach(record => { delete record.approvalTime; });
  manifest.traceabilitySources.forEach(record => { delete record.approvalTime; });
  manifest.packageFingerprint = Builder.packageFingerprintV2(manifest);
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
        else records.push({
          path: relativePath,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
        });
      });
  }
  visit(rootDir);
  return records;
}

function workspaceInventory(rootDir) {
  const directories = [];
  const files = [];
  function visit(currentDir, relativeDir = '') {
    fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .forEach(entry => {
        const relativePath = path.posix.join(relativeDir, entry.name);
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          directories.push(relativePath);
          visit(absolutePath, relativePath);
        } else files.push(relativePath);
      });
  }
  visit(rootDir);
  return { directories, files };
}

assert.deepEqual(
  Workspace.parseArgs(['--input', 'C:/formal-package', '--output', 'C:/upgrade', '--json']),
  { json: true, input: 'C:/formal-package', output: 'C:/upgrade' },
);
assert.match(Workspace.usage(), /--output/);
assert.equal(Workspace.normalizedDate('2026-07-21T15:00:00.000Z').toISOString(), FIXED_NOW.toISOString());
assert.throws(() => Workspace.normalizedDate('not-a-date'), /時間戳記/);
assert.match(Workspace.defaultWorkspaceDir('C:/case/formal-package', FIXED_NOW), /formal-package-v3升級工作區-20260721-230000$/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-workspace-'));
try {
  const legacyPackage = createPackage(tempRoot, 'legacy-v2');
  convertToLegacyV2(legacyPackage);
  const packageBefore = directorySnapshot(legacyPackage);
  const outputDir = path.join(tempRoot, 'safe-upgrade-workspace');

  assert.throws(
    () => Workspace.validateWorkspacePaths(legacyPackage, path.join(legacyPackage, 'upgrade')),
    /不得建立在舊附件包內/,
  );
  assert.throws(
    () => Workspace.validateWorkspacePaths(legacyPackage, tempRoot),
    /不得包住或取代舊附件包/,
  );

  const result = Workspace.createUpgradeWorkspace(legacyPackage, { output: outputDir, now: FIXED_NOW });
  assert.equal(result.kind, Workspace.WORKSPACE_KIND);
  assert.equal(result.status, 'review');
  assert.equal(result.created, true);
  assert.equal(result.workspaceDir, outputDir);
  assert.equal(result.packageSourceDir, path.join(outputDir, Workspace.PACKAGE_SOURCE_DIR));
  assert.match(result.planFingerprint, /^WSP-[0-9A-F]{24}$/);
  assert.deepEqual(result.copiedLegacyFiles, []);
  assert.deepEqual(result.workItemSummary, { total: 1, paired: 1, externalSourceRequired: 0 });
  assert.deepEqual(directorySnapshot(legacyPackage), packageBefore, 'workspace creation must not modify the old package');

  const inventory = workspaceInventory(outputDir);
  assert.deepEqual(inventory.directories, [
    Workspace.INTERNAL_GUIDE_DIR,
    Workspace.PACKAGE_SOURCE_DIR,
    `${Workspace.PACKAGE_SOURCE_DIR}/${Workspace.NEW_FORMAL_REPORTS_DIR}`,
    `${Workspace.PACKAGE_SOURCE_DIR}/${Workspace.NEW_TRACE_SOURCES_DIR}`,
  ]);
  assert.deepEqual(inventory.files, [
    `${Workspace.INTERNAL_GUIDE_DIR}/${Workspace.PLAN_JSON_FILE}`,
    `${Workspace.INTERNAL_GUIDE_DIR}/${Workspace.PLAN_MARKDOWN_FILE}`,
  ]);

  const planJsonPath = path.join(outputDir, Workspace.INTERNAL_GUIDE_DIR, Workspace.PLAN_JSON_FILE);
  const planMarkdownPath = path.join(outputDir, Workspace.INTERNAL_GUIDE_DIR, Workspace.PLAN_MARKDOWN_FILE);
  const planText = fs.readFileSync(planJsonPath, 'utf8');
  const plan = JSON.parse(planText);
  const markdown = fs.readFileSync(planMarkdownPath, 'utf8');
  assert.equal(plan.kind, Workspace.WORKSPACE_KIND);
  assert.equal(plan.formalReadiness, 'review');
  assert.equal(plan.generatedAt, FIXED_NOW.toISOString());
  assert.match(plan.planFingerprint, /^WSP-[0-9A-F]{24}$/);
  assert.equal(Workspace.planFingerprint(plan), plan.planFingerprint);
  assert.deepEqual(plan.copiedLegacyFiles, []);
  assert.equal(plan.workItems.length, 1);
  assert.equal(plan.workItems[0].priorOutputTime, '2026/07/21 22:00:00');
  assert.equal(Object.hasOwn(plan.workItems[0], 'priorApprovalTime'), false);
  assert.doesNotMatch(planText, /approvalTime/i);
  assert.doesNotMatch(markdown, /LEGACY-CONTENT-MUST-NOT-BE-COPIED/);
  assert.match(markdown, /僅供內部升級作業/);
  assert.match(markdown, new RegExp(plan.planFingerprint));
  assert.match(markdown, /不得選取整個工作區/);
  assert.match(markdown, /未複製任何舊附件、來源資料、metadata 或核可時間/);
  assert.match(Workspace.formatSummary(result), /舊附件複製：0 份；舊 metadata／核可時間預填：0 項/);
  assert.match(Workspace.formatSummary(result), /狀態維持 review/);
  assert.throws(() => Workspace.validateWorkspacePaths(legacyPackage, outputDir), /已存在/);

  const cliOutput = path.join(tempRoot, 'cli-workspace');
  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'),
    '--input', legacyPackage,
    '--output', cliOutput,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.status, 'review');
  assert.equal(cliResult.created, true);
  assert.deepEqual(cliResult.copiedLegacyFiles, []);
  assert.deepEqual(directorySnapshot(legacyPackage), packageBefore, 'CLI workspace creation must remain read-only');

  const currentPackage = createPackage(tempRoot, 'current-v3');
  const currentOutput = path.join(tempRoot, 'current-workspace-must-not-exist');
  const currentResult = Workspace.createUpgradeWorkspace(currentPackage, { output: currentOutput, now: FIXED_NOW });
  assert.equal(currentResult.status, 'ready');
  assert.equal(currentResult.created, false);
  assert.equal(fs.existsSync(currentOutput), false);
  const currentCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'), '--input', currentPackage, '--output', currentOutput,
  ], { encoding: 'utf8' });
  assert.equal(currentCli.status, 0, currentCli.stderr || currentCli.stdout);
  assert.match(currentCli.stdout, /不需升級/);

  const blockedPackage = createPackage(tempRoot, 'blocked-v2');
  const blockedManifest = convertToLegacyV2(blockedPackage);
  const blockedFormalPath = path.join(blockedPackage, ...blockedManifest.formalAttachments[0].packagedFile.split('/'));
  fs.appendFileSync(blockedFormalPath, '\n遭修改', 'utf8');
  const blockedOutput = path.join(tempRoot, 'blocked-workspace-must-not-exist');
  const blockedResult = Workspace.createUpgradeWorkspace(blockedPackage, { output: blockedOutput, now: FIXED_NOW });
  assert.equal(blockedResult.status, 'blocked');
  assert.equal(blockedResult.created, false);
  assert.equal(fs.existsSync(blockedOutput), false);
  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'), '--input', blockedPackage, '--output', blockedOutput,
  ], { encoding: 'utf8' });
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);

  const failedOutput = path.join(tempRoot, 'failed-workspace-must-not-exist');
  const originalRenameSync = fs.renameSync;
  try {
    fs.renameSync = () => {
      const error = new Error('simulated atomic publish failure');
      error.code = 'EIO';
      throw error;
    };
    assert.throws(
      () => Workspace.createUpgradeWorkspace(legacyPackage, {
        output: failedOutput,
        now: FIXED_NOW,
        publishOptions: { retryDelaysMs: [0] },
      }),
      /simulated atomic publish failure/,
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(fs.existsSync(failedOutput), false);
  assert.equal(
    fs.readdirSync(tempRoot).some(name => name.startsWith(`.${path.basename(failedOutput)}.staging-`)),
    false,
    'failed atomic publish must remove staging output',
  );
  assert.deepEqual(directorySnapshot(legacyPackage), packageBefore, 'failed publish must not modify the old package');

  const existingOutput = path.join(tempRoot, 'existing-workspace');
  fs.mkdirSync(existingOutput);
  fs.writeFileSync(path.join(existingOutput, 'sentinel.txt'), 'keep', 'utf8');
  assert.throws(
    () => Workspace.createUpgradeWorkspace(legacyPackage, { output: existingOutput, now: FIXED_NOW }),
    /已存在/,
  );
  assert.equal(fs.readFileSync(path.join(existingOutput, 'sentinel.txt'), 'utf8'), 'keep');

  const helpCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'), '--help',
  ], { encoding: 'utf8' });
  assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
  const missingInputCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'),
  ], { encoding: 'utf8' });
  assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
  const missingFolderCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-workspace.js'), '--input', path.join(tempRoot, 'missing'),
  ], { encoding: 'utf8' });
  assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade workspace OK');
