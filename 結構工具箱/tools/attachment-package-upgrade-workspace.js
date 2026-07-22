'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Assessor = require('./attachment-package-upgrade-assess.js');

const WORKSPACE_KIND = 'formal-attachment-package-upgrade-workspace.v1';
const INTERNAL_GUIDE_DIR = '00_內部升級工作說明_勿附入主報告';
const PACKAGE_SOURCE_DIR = '01_新組包來源';
const NEW_FORMAL_REPORTS_DIR = '01_重新輸出正式計算書';
const NEW_TRACE_SOURCES_DIR = '02_重新確認來源資料';
const PLAN_JSON_FILE = '升級工作清單.json';
const PLAN_MARKDOWN_FILE = '升級工作清單.md';

function defaultWorkspaceDir(inputDir, now = new Date()) {
  const resolvedInput = path.resolve(inputDir || '');
  return path.join(
    path.dirname(resolvedInput),
    `${path.basename(resolvedInput)}-v3升級工作區-${Builder.timestampToken(now)}`,
  );
}

function normalizedDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('無法建立升級工作區時間戳記。');
  return date;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function planFingerprint(plan) {
  const payload = { ...plan };
  delete payload.planFingerprint;
  return `WSP-${crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function validateWorkspacePaths(inputDir, outputDir) {
  const resolvedInput = path.resolve(inputDir || '');
  const resolvedOutput = path.resolve(outputDir || '');
  if (Builder.isPathInside(resolvedInput, resolvedOutput)) {
    throw new Error('升級工作區不得建立在舊附件包內。');
  }
  if (Builder.isPathInside(resolvedOutput, resolvedInput)) {
    throw new Error('升級工作區不得包住或取代舊附件包。');
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new Error(`升級工作區已存在，為避免混入舊資料而停止：${resolvedOutput}`);
  }
  return { resolvedInput, resolvedOutput };
}

function workspacePlan(assessment, generatedAt = new Date().toISOString()) {
  const plan = {
    schemaVersion: 1,
    kind: WORKSPACE_KIND,
    generatedAt,
    formalReadiness: 'review',
    sourcePackage: {
      path: assessment.packageDir,
      schemaVersion: assessment.currentPackage.schemaVersion,
      kind: assessment.currentPackage.kind,
      packageFingerprint: assessment.currentPackage.packageFingerprint,
    },
    targetPackage: { ...assessment.targetPackage },
    boundaries: {
      internalGuideDirectory: INTERNAL_GUIDE_DIR,
      packageSourceDirectory: PACKAGE_SOURCE_DIR,
      newFormalReportsDirectory: `${PACKAGE_SOURCE_DIR}/${NEW_FORMAL_REPORTS_DIR}`,
      newTraceSourcesDirectory: `${PACKAGE_SOURCE_DIR}/${NEW_TRACE_SOURCES_DIR}`,
      instruction: `建立 v3 包時只選取「${PACKAGE_SOURCE_DIR}」；「${INTERNAL_GUIDE_DIR}」不得附入主報告或正式附件包。`,
    },
    copiedLegacyFiles: [],
    workItemSummary: { ...assessment.workItemSummary },
    workItems: assessment.workItems.map(item => ({
      sequence: item.sequence,
      legacyFormalAttachment: item.formalAttachment,
      sourceTool: item.sourceTool,
      toolVersion: item.toolVersion,
      priorOutputTime: item.priorOutputTime,
      fingerprints: [...item.fingerprints],
      sourceStatus: item.sourceStatus,
      legacySourceFiles: [...item.sourceFiles],
      actions: item.actions.map(action => ({ ...action })),
    })),
  };
  plan.planFingerprint = planFingerprint(plan);
  return plan;
}

function formatPlanMarkdown(plan) {
  const lines = [
    '# 舊版附件包 v3 升級工作清單',
    '',
    '> 本文件僅供內部升級作業，不是計算書、正式附件或核可紀錄。',
    '',
    `- 舊包版本：v${plan.sourcePackage.schemaVersion}`,
    `- 舊包指紋：${plan.sourcePackage.packageFingerprint}`,
    `- 工作清單指紋：${plan.planFingerprint}`,
    `- 目標版本：v${plan.targetPackage.schemaVersion}`,
    `- 正式狀態：尚待重新輸出與核可（review）`,
    `- 組包來源：${plan.boundaries.packageSourceDirectory}`,
    `- 內部說明：${plan.boundaries.internalGuideDirectory}（勿附入主報告）`,
    '',
    '## 使用順序',
    '',
    '1. 保留舊附件包不變。',
    '2. 依下列逐份清單回到原始工具或可信來源重新確認計算。',
    `3. 新計算書放入「${plan.boundaries.newFormalReportsDirectory}」。`,
    `4. 對應來源資料放入「${plan.boundaries.newTraceSourcesDirectory}」。`,
    '5. 檢查新計算書後重新勾選正式附件核可，產生新的核可時間。',
    `6. 只以「${plan.boundaries.packageSourceDirectory}」執行建立正式附件包，不得選取整個工作區。`,
    '',
    `## 逐份清單（${plan.workItemSummary.total} 份）`,
    '',
  ];
  plan.workItems.forEach(item => {
    lines.push(`### 附件 ${item.sequence}：${item.legacyFormalAttachment}`);
    lines.push('');
    lines.push(`- 產出工具：${item.sourceTool} ${item.toolVersion}`);
    lines.push(`- 舊輸出時間：${item.priorOutputTime || '未記錄'}`);
    lines.push(`- 計算指紋：${item.fingerprints.join('、') || '未記錄'}`);
    lines.push(`- 舊包來源：${item.legacySourceFiles.length ? item.legacySourceFiles.join('、') : '未配對；需回外部可信來源，禁止從舊報告反推輸入'}`);
    item.actions.forEach(action => lines.push(`- [ ] ${action.message}`));
    lines.push('');
  });
  lines.push('---');
  lines.push('工作區建立時未複製任何舊附件、來源資料、metadata 或核可時間。');
  lines.push('');
  return lines.join('\n');
}

function writeWorkspace(stagingDir, plan) {
  const guideDir = path.join(stagingDir, INTERNAL_GUIDE_DIR);
  const formalDir = path.join(stagingDir, PACKAGE_SOURCE_DIR, NEW_FORMAL_REPORTS_DIR);
  const sourceDir = path.join(stagingDir, PACKAGE_SOURCE_DIR, NEW_TRACE_SOURCES_DIR);
  fs.mkdirSync(guideDir, { recursive: true });
  fs.mkdirSync(formalDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(guideDir, PLAN_JSON_FILE), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(guideDir, PLAN_MARKDOWN_FILE), formatPlanMarkdown(plan), 'utf8');
}

function createUpgradeWorkspace(inputDir, options = {}) {
  const assessment = Assessor.assessUpgrade(inputDir);
  if (assessment.status !== 'review') {
    return {
      kind: WORKSPACE_KIND,
      status: assessment.status,
      created: false,
      workspaceDir: '',
      packageSourceDir: '',
      copiedLegacyFiles: [],
      assessment,
    };
  }

  const now = normalizedDate(options.now || new Date());
  const outputDir = options.output || defaultWorkspaceDir(inputDir, now);
  const { resolvedOutput } = validateWorkspacePaths(assessment.packageDir, outputDir);
  const parentDir = path.dirname(resolvedOutput);
  fs.mkdirSync(parentDir, { recursive: true });
  const stagingDir = path.join(
    parentDir,
    `.${path.basename(resolvedOutput)}.staging-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
  const plan = workspacePlan(assessment, now.toISOString());
  try {
    fs.mkdirSync(stagingDir);
    writeWorkspace(stagingDir, plan);
    Builder.publishStagingDirectory(stagingDir, resolvedOutput, options.publishOptions);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return {
    kind: WORKSPACE_KIND,
    status: 'review',
    created: true,
    workspaceDir: resolvedOutput,
    packageSourceDir: path.join(resolvedOutput, PACKAGE_SOURCE_DIR),
    copiedLegacyFiles: [],
    planFiles: [
      `${INTERNAL_GUIDE_DIR}/${PLAN_JSON_FILE}`,
      `${INTERNAL_GUIDE_DIR}/${PLAN_MARKDOWN_FILE}`,
    ],
    workItemSummary: { ...plan.workItemSummary },
    assessment,
  };
}

function formatSummary(result) {
  if (result.status === 'blocked') {
    const lines = ['舊版附件包升級工作區：未建立（附件包驗證阻擋）'];
    result.assessment.verification.issues
      .filter(issue => issue.level === 'error')
      .forEach(issue => lines.push(`[阻擋] ${issue.message}`));
    return lines.join('\n');
  }
  if (result.status === 'ready') {
    return '舊版附件包升級工作區：未建立；此附件包已是驗證通過的 v3，不需升級。';
  }
  return [
    '舊版附件包升級工作區：已建立（仍待重新輸出與核可）',
    `工作區：${result.workspaceDir}`,
    `新組包來源：${result.packageSourceDir}`,
    `逐份待辦：${result.workItemSummary.total} 份；需外部可信來源：${result.workItemSummary.externalSourceRequired} 份。`,
    '舊附件複製：0 份；舊 metadata／核可時間預填：0 項。',
    `完成新輸出與核可後，只選取「${PACKAGE_SOURCE_DIR}」執行建立正式附件包。`,
    '工作區建立成功不代表正式附件已核可，因此狀態維持 review。',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-package-upgrade-workspace.js --input <舊版正式附件包> [--output <新工作區>] [--json]';
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.input) {
    console.log(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = createUpgradeWorkspace(options.input, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`舊版附件包升級工作區建立失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  WORKSPACE_KIND,
  INTERNAL_GUIDE_DIR,
  PACKAGE_SOURCE_DIR,
  NEW_FORMAL_REPORTS_DIR,
  NEW_TRACE_SOURCES_DIR,
  PLAN_JSON_FILE,
  PLAN_MARKDOWN_FILE,
  defaultWorkspaceDir,
  normalizedDate,
  canonicalJson,
  planFingerprint,
  validateWorkspacePaths,
  workspacePlan,
  formatPlanMarkdown,
  writeWorkspace,
  createUpgradeWorkspace,
  formatSummary,
  parseArgs,
  usage,
};
