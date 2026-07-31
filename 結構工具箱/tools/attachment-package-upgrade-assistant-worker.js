'use strict';

const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Flow = require('./attachment-package-upgrade-flow.js');
const Assess = require('./attachment-package-upgrade-assess.js');
const Completion = require('./attachment-package-upgrade-workspace-check.js');

const ACTIONS = new Set(['smoke', 'inspect', 'execute']);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function requireDirectory(value) {
  if (!text(value)) throw new Error('尚未選擇正式附件包或升級工作區。');
  const resolved = path.resolve(text(value));
  if (!fs.existsSync(resolved) || !fs.lstatSync(resolved).isDirectory()) {
    throw new Error(`資料夾不存在：${resolved}`);
  }
  return resolved;
}

function normalizeIssues(items = [], component = '') {
  return items.map(item => ({
    level: text(item.level),
    component,
    code: text(item.code),
    message: text(item.message),
    files: Array.isArray(item.files) ? item.files.map(text).filter(Boolean) : [],
  }));
}

function assessmentRecords(report = {}) {
  return (report.workItems || []).map(item => ({
    sequence: Number(item.sequence || 0),
    attachment: text(item.formalAttachment),
    tool: text(item.sourceTool),
    version: text(item.toolVersion),
    sourceState: text(item.sourceStatus),
    newFormal: '',
    newSource: (item.sourceFiles || []).map(text).filter(Boolean).join('、'),
    status: '待重新輸出與核可',
    issues: item.sourceStatus === 'external-source-required' ? '需回外部可信來源' : '',
  }));
}

function completionRecords(report = {}) {
  return (report.workItems || []).map(item => ({
    sequence: Number(item.sequence || 0),
    attachment: text(item.legacyFormalAttachment),
    tool: text(item.sourceTool),
    version: text(item.priorToolVersion),
    sourceState: '',
    newFormal: (item.formalFiles || []).map(text).filter(Boolean).join('、'),
    newSource: (item.sourceFiles || []).map(text).filter(Boolean).join('、'),
    status: text(item.status),
    issues: (item.issues || []).map(issue => text(issue.code)).filter(Boolean).join('、'),
  }));
}

function inspectUpgrade(input, options = {}, dependencies = {}) {
  const flow = dependencies.Flow || Flow;
  const assess = dependencies.Assess || Assess;
  const completion = dependencies.Completion || Completion;
  const detected = flow.detectInputKind(input);

  if (detected.kind === flow.INPUT_KINDS.FORMAL_PACKAGE) {
    const report = assess.assessUpgrade(detected.inputDir);
    const canExecute = report.status === 'review' && report.requiresUpgrade === true;
    return {
      action: 'inspect',
      status: report.status,
      stage: detected.kind,
      title: report.status === 'ready' ? '目前已是完整 v3，不需升級' : canExecute ? '完整舊包可建立安全升級工作區' : '附件包完整性異常，停止升級',
      canExecute,
      executeAction: canExecute ? 'create-workspace' : '',
      executeLabel: canExecute ? '建立安全升級工作區' : '',
      executed: false,
      changedState: false,
      outputDir: '',
      historyRecord: '',
      fingerprint: text(report.currentPackage?.packageFingerprint),
      counts: {
        workItems: Number(report.workItemSummary?.total || 0),
        pairedSources: Number(report.workItemSummary?.paired || 0),
        externalSources: Number(report.workItemSummary?.externalSourceRequired || 0),
        errors: Number(report.verification?.summary?.errors || 0),
      },
      records: assessmentRecords(report),
      issues: normalizeIssues(report.verification?.issues || [], 'formal-package'),
      displayText: assess.formatSummary(report),
    };
  }

  const report = completion.checkUpgradeWorkspace(detected.workspaceDir, { projectNo: text(options.projectNo) });
  const canExecute = report.status === 'ready';
  return {
    action: 'inspect',
    status: report.status,
    stage: detected.kind,
    title: canExecute ? '升級工作區完成，可另建 v3 正式附件包' : report.status === 'review' ? '升級工作區尚有待辦' : '升級工作區存在阻擋事項',
    canExecute,
    executeAction: canExecute ? 'build-v3-package' : '',
    executeLabel: canExecute ? '建立新的 v3 正式附件包' : '',
    executed: false,
    changedState: false,
    outputDir: '',
    historyRecord: '',
    fingerprint: text(report.plan?.planFingerprint),
    counts: {
      workItems: Number(report.summary?.total || 0),
      completed: Number(report.summary?.matched || 0),
      pending: Number(report.summary?.pending || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
    },
    records: completionRecords(report),
    issues: normalizeIssues(report.issues || [], 'upgrade-workspace'),
    displayText: completion.formatSummary(report),
  };
}

function executeUpgrade(input, options = {}, dependencies = {}) {
  const flow = dependencies.Flow || Flow;
  const inspection = inspectUpgrade(input, options, dependencies);
  if (!inspection.canExecute) {
    return {
      ...inspection,
      action: 'execute',
      title: '目前條件不允許新建升級產物',
      displayText: `${inspection.displayText}\n本次未執行任何新建動作。`,
    };
  }
  const result = flow.runUpgradeFlowWithHistory(input, { projectNo: text(options.projectNo) });
  const outputDir = text(result.packageDir || result.workspaceDir);
  const fingerprint = text(
    result.buildResult?.packageFingerprint
    || result.workspaceResult?.plan?.planFingerprint
    || result.workspaceResult?.planFingerprint
    || inspection.fingerprint,
  );
  return {
    ...inspection,
    action: 'execute',
    status: result.status,
    title: result.action === 'workspace-created'
      ? '安全升級工作區已建立'
      : result.action === 'package-built'
        ? '新的 v3 正式附件包已建立並驗證'
        : '升級流程未建立新產物',
    canExecute: false,
    executeAction: '',
    executeLabel: '',
    executed: true,
    changedState: result.changedState === true,
    outputDir,
    historyRecord: text(result.history?.recordPath),
    fingerprint,
    displayText: flow.formatSummary(result),
  };
}

function runAction(action, options = {}, dependencies = {}) {
  if (!ACTIONS.has(action)) throw new Error(`不支援的升級助手動作：${action || '(空白)'}`);
  if (action === 'smoke') {
    return {
      action, status: 'ready', stage: '', title: '舊版附件升級助手核心可用',
      canExecute: false, executeAction: '', executeLabel: '', executed: false, changedState: false,
      outputDir: '', historyRecord: '', fingerprint: '', counts: { modules: 3 }, records: [], issues: [],
      displayText: '唯讀評估、工作區完成度檢查與統一升級流程均已載入。',
    };
  }
  const input = requireDirectory(options.input);
  return action === 'inspect'
    ? inspectUpgrade(input, options, dependencies)
    : executeUpgrade(input, options, dependencies);
}

function parseArgs(argv = []) {
  const options = { projectNo: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') options.action = argv[++index];
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usageResponse() {
  return {
    action: 'help', status: 'ready',
    usage: 'node attachment-package-upgrade-assistant-worker.js --action smoke|inspect|execute [--input <正式附件包或工作區>] [--project-no <計畫編號>]',
  };
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const response = options.help ? usageResponse() : runAction(text(options.action), options);
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return Checker.exitCodeForStatus(response.status);
  } catch (error) {
    const message = text(error?.message || error);
    process.stdout.write(`${JSON.stringify({
      action: 'error', status: 'error', stage: '', title: '舊版附件升級助手執行失敗',
      canExecute: false, executeAction: '', executeLabel: '', executed: false, changedState: false,
      outputDir: '', historyRecord: '', fingerprint: '', counts: {}, records: [],
      issues: [{ level: 'error', component: 'assistant', code: 'assistant-error', message, files: [] }],
      displayText: message,
    })}\n`);
    return Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ACTIONS,
  text,
  requireDirectory,
  normalizeIssues,
  assessmentRecords,
  completionRecords,
  inspectUpgrade,
  executeUpgrade,
  runAction,
  parseArgs,
  usageResponse,
  main,
};

if (require.main === module) process.exitCode = main();
