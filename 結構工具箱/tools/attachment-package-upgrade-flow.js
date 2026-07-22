'use strict';

const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Workspace = require('./attachment-package-upgrade-workspace.js');
const Completion = require('./attachment-package-upgrade-workspace-check.js');
const History = require('./attachment-package-upgrade-history.js');

const FLOW_KIND = 'formal-attachment-package-upgrade-flow.v1';
const INPUT_KINDS = Object.freeze({
  FORMAL_PACKAGE: 'formal-package',
  UPGRADE_WORKSPACE: 'upgrade-workspace',
  PACKAGE_SOURCE: 'upgrade-package-source',
});

function detectInputKind(inputDir) {
  const resolvedInput = path.resolve(inputDir || '');
  if (!fs.existsSync(resolvedInput)) throw new Error(`輸入資料夾不存在：${resolvedInput || inputDir || '(未指定)'}`);
  const stat = fs.lstatSync(resolvedInput);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`統一升級流程只接受實體資料夾，不得為連結或其他特殊項目：${resolvedInput}`);
  }
  if (path.basename(resolvedInput) === Workspace.PACKAGE_SOURCE_DIR) {
    return { kind: INPUT_KINDS.PACKAGE_SOURCE, inputDir: resolvedInput, workspaceDir: path.dirname(resolvedInput) };
  }
  const manifestPath = path.join(resolvedInput, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
  const formalDirectory = path.join(resolvedInput, Builder.FORMAL_ATTACHMENTS_DIR);
  const internalDirectory = path.join(resolvedInput, Builder.INTERNAL_TRACE_DIR);
  if (fs.existsSync(manifestPath) || fs.existsSync(formalDirectory) || fs.existsSync(internalDirectory)) {
    return { kind: INPUT_KINDS.FORMAL_PACKAGE, inputDir: resolvedInput, workspaceDir: '' };
  }
  const guideMarker = path.join(resolvedInput, Workspace.INTERNAL_GUIDE_DIR);
  const sourceMarker = path.join(resolvedInput, Workspace.PACKAGE_SOURCE_DIR);
  if (fs.existsSync(guideMarker) || fs.existsSync(sourceMarker)) {
    return { kind: INPUT_KINDS.UPGRADE_WORKSPACE, inputDir: resolvedInput, workspaceDir: resolvedInput };
  }
  throw new Error(`無法辨識輸入階段；請選取正式附件包、升級工作區或「${Workspace.PACKAGE_SOURCE_DIR}」：${resolvedInput}`);
}

function runUpgradeFlow(inputDir, options = {}) {
  const detected = detectInputKind(inputDir);
  if (detected.kind === INPUT_KINDS.FORMAL_PACKAGE) {
    const workspaceResult = Workspace.createUpgradeWorkspace(detected.inputDir, {
      output: options.output,
      now: options.now,
      publishOptions: options.publishOptions,
    });
    const action = workspaceResult.created
      ? 'workspace-created'
      : workspaceResult.status === 'ready'
        ? 'no-upgrade-needed'
        : 'package-blocked';
    return {
      kind: FLOW_KIND,
      inputKind: detected.kind,
      action,
      status: workspaceResult.status,
      changedState: workspaceResult.created,
      workspaceDir: workspaceResult.workspaceDir,
      packageDir: '',
      workspaceResult,
    };
  }

  const workspaceDir = detected.workspaceDir;
  const completion = Completion.checkUpgradeWorkspace(workspaceDir, { projectNo: options.projectNo || '' });
  if (completion.status !== 'ready') {
    return {
      kind: FLOW_KIND,
      inputKind: detected.kind,
      action: completion.status === 'blocked' ? 'workspace-blocked' : 'completion-pending',
      status: completion.status,
      changedState: false,
      workspaceDir,
      packageDir: '',
      completion,
    };
  }

  const buildResult = Builder.buildPackage(completion.packageSourceDir, {
    output: options.output,
    projectNo: options.projectNo || '',
    now: options.now,
  });
  return {
    kind: FLOW_KIND,
    inputKind: detected.kind,
    action: buildResult.built ? 'package-built' : buildResult.status === 'blocked' ? 'workspace-blocked' : 'completion-pending',
    status: buildResult.status,
    changedState: buildResult.built,
    workspaceDir,
    packageDir: buildResult.outputDir,
    completion: buildResult.upgradeWorkspaceCheck || completion,
    buildResult,
  };
}

function runUpgradeFlowWithHistory(inputDir, options = {}) {
  const detected = detectInputKind(inputDir);
  const historyContext = History.prepareHistoryContext(inputDir, detected, options);
  const flowResult = runUpgradeFlow(inputDir, options);
  const history = History.recordFlowResult(flowResult, historyContext, options);
  return { ...flowResult, history };
}

function formatSummary(result) {
  const lines = ['舊版正式附件統一升級流程'];
  if (result.action === 'workspace-created') {
    lines.push(Workspace.formatSummary(result.workspaceResult));
    lines.push('下一步：回原始工具或可信來源逐份重新輸出並人工核可；完成後再次把同一工作區交給本流程。');
  } else if (result.action === 'no-upgrade-needed') {
    lines.push('辨識結果：目前輸入已是完整的 v3 正式附件包，不執行任何變更。');
  } else if (result.action === 'package-blocked') {
    lines.push(Workspace.formatSummary(result.workspaceResult));
    lines.push('完整性異常未排除前，不建立工作區或新附件包。');
  } else if (result.action === 'completion-pending' || result.action === 'workspace-blocked') {
    lines.push(Completion.formatSummary(result.completion));
    lines.push('本次未建立正式附件包。');
  } else if (result.action === 'package-built') {
    lines.push(Completion.formatSummary(result.completion));
    lines.push(`新的 v3 正式附件包已建立：${result.packageDir}`);
    lines.push(`附件包指紋：${result.buildResult.packageFingerprint}`);
    lines.push('發布前完整性與工程內容驗證：通過。');
  }
  if (result.history?.written) {
    lines.push(`內部升級歷程收據：${result.history.recordPath}`);
    lines.push(`歷程收據指紋：${result.history.receiptFingerprint}`);
    lines.push(History.HISTORY_BOUNDARY_INSTRUCTION);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--history-dir') options.historyDir = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-package-upgrade-flow.js --input <正式附件包｜升級工作區｜新組包來源>',
    '  [--output <新工作區或新 v3 包>] [--project-no <計畫編號>]',
    '  [--history-dir <外部內部歷程資料夾>] [--json]',
  ].join('\n');
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
  const result = runUpgradeFlowWithHistory(options.input, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`統一升級流程執行失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  FLOW_KIND,
  INPUT_KINDS,
  detectInputKind,
  runUpgradeFlow,
  runUpgradeFlowWithHistory,
  formatSummary,
  parseArgs,
  usage,
};
