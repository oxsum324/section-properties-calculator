'use strict';

const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');

const ACTIONS = new Set(['smoke', 'check', 'build', 'verify']);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function firstFingerprint(record = {}) {
  return Array.isArray(record.fingerprints) && record.fingerprints.length
    ? text(record.fingerprints[0])
    : '';
}

function documentState(record = {}, checker = Checker) {
  if ((record.draftDocumentNeedles || []).length) return '內部審閱';
  if ((record.readyDocumentNeedles || []).includes(checker.READY_DOCUMENT_CLASS_LABEL)) return '正式附件';
  return typeof checker.isDocumentClassRequired === 'function' && checker.isDocumentClassRequired(record)
    ? '未分類'
    : '來源資料';
}

function checkRecords(report = {}, checker = Checker) {
  return (report.attachments || []).map(record => ({
    file: text(record.file),
    role: text(record.type).toLowerCase() === 'json' ? '內部追溯來源' : '計算文件',
    state: documentState(record, checker),
    tool: text(record.sourceTool),
    version: text(record.toolVersion),
    fingerprint: firstFingerprint(record),
    result: (record.errors || []).length
      ? '讀取失敗'
      : record.contentBoundary?.missingGroups?.length
        ? `內容缺 ${record.contentBoundary.missingGroups.join('、')}`
        : '已讀取',
  }));
}

function verifyRecords(report = {}) {
  return (report.records || []).map(record => ({
    file: text(record.packagedFile || record.file),
    role: text(record.role || record.type),
    state: text(record.documentState || record.status),
    tool: text(record.sourceTool),
    version: text(record.toolVersion),
    fingerprint: firstFingerprint(record),
    result: text(record.status),
  }));
}

function issueRecords(report = {}) {
  return (report.issues || []).map(issue => ({
    level: text(issue.level),
    code: text(issue.code),
    message: text(issue.message),
    files: Array.isArray(issue.files) ? issue.files.map(text).filter(Boolean) : [],
  }));
}

function requireInput(options = {}) {
  const input = path.resolve(text(options.input));
  if (!text(options.input)) throw new Error('尚未選擇資料夾。');
  if (!fs.existsSync(input) || !fs.lstatSync(input).isDirectory()) {
    throw new Error(`資料夾不存在：${input}`);
  }
  return input;
}

function checkResponse(report, checker = Checker) {
  return {
    action: 'check',
    status: report.status,
    title: report.status === 'ready' ? '附件來源可建立正式附件包' : report.status === 'review' ? '附件來源需人工確認' : '附件來源已阻擋',
    canBuild: report.status === 'ready',
    built: false,
    outputDir: '',
    packageFingerprint: '',
    counts: {
      attachments: Number(report.summary?.attachments || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
      fingerprintLinks: Number(report.fingerprintLinks?.length || 0),
    },
    records: checkRecords(report, checker),
    issues: issueRecords(report),
    displayText: checker.formatSummary(report),
  };
}

function buildResponse(result, checker = Checker) {
  const report = result.report || {};
  const lines = [checker.formatSummary(report)];
  if (result.built) {
    lines.push(`正式附件包已建立：${result.outputDir}`);
    lines.push(`正式附件 ${result.formalAttachmentCount} 份；內部追溯來源 ${result.traceabilitySourceCount} 份。`);
    lines.push(`附件包指紋：${result.packageFingerprint}`);
    lines.push('發布前完整性與工程內容驗證：通過。');
  } else {
    lines.push('未建立正式附件包。');
  }
  return {
    action: 'build',
    status: result.status,
    title: result.built ? '正式附件包已建立並完成自我驗證' : result.status === 'review' ? '尚待人工確認，未建立附件包' : '組包條件未通過',
    canBuild: false,
    built: result.built === true,
    outputDir: text(result.outputDir),
    packageFingerprint: text(result.packageFingerprint),
    counts: {
      attachments: Number(report.summary?.attachments || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
      fingerprintLinks: Number(report.fingerprintLinks?.length || 0),
    },
    records: checkRecords(report, checker),
    issues: issueRecords(report),
    displayText: lines.filter(Boolean).join('\n'),
  };
}

function verifyResponse(report, verifier = Verifier) {
  return {
    action: 'verify',
    status: report.status,
    title: report.status === 'ready' ? '正式附件包驗證通過' : report.status === 'review' ? '附件包需人工確認' : '附件包完整性驗證已阻擋',
    canBuild: false,
    built: false,
    outputDir: '',
    packageFingerprint: text(report.packageFingerprint),
    counts: {
      attachments: Number(report.summary?.expectedFiles || 0),
      verified: Number(report.summary?.verifiedFiles || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
    },
    records: verifyRecords(report),
    issues: issueRecords(report),
    displayText: verifier.formatSummary(report),
  };
}

function runAction(action, options = {}, dependencies = {}) {
  const checker = dependencies.Checker || Checker;
  const builder = dependencies.Builder || Builder;
  const verifier = dependencies.Verifier || Verifier;
  if (!ACTIONS.has(action)) throw new Error(`不支援的管理器動作：${action || '(空白)'}`);
  if (action === 'smoke') {
    return {
      action,
      status: 'ready',
      title: '附件包管理器核心可用',
      canBuild: false,
      built: false,
      outputDir: '',
      packageFingerprint: '',
      counts: { modules: 3 },
      records: [],
      issues: [],
      displayText: '檢查、正式組包與事後驗證核心均已載入。',
    };
  }

  const input = requireInput(options);
  if (action === 'check') {
    return checkResponse(checker.checkPackage(input, { projectNo: text(options.projectNo) }), checker);
  }
  if (action === 'build') {
    const buildOptions = { projectNo: text(options.projectNo) };
    if (text(options.output)) buildOptions.output = path.resolve(text(options.output));
    return buildResponse(builder.buildPackage(input, buildOptions), checker);
  }
  return verifyResponse(verifier.verifyPackage(input), verifier);
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') options.action = argv[++index];
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usageResponse() {
  return {
    action: 'help',
    status: 'ready',
    usage: 'node attachment-package-manager-worker.js --action smoke|check|build|verify [--input <資料夾>] [--output <輸出資料夾>] [--project-no <計畫編號>]',
  };
}

function exitCodeForResponse(response, checker = Checker) {
  if (response?.status === 'error') return checker.CLI_ERROR_EXIT_CODE;
  return checker.exitCodeForStatus(response?.status);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const response = options.help ? usageResponse() : runAction(text(options.action), options);
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return exitCodeForResponse(response);
  } catch (error) {
    const response = {
      action: 'error',
      status: 'error',
      title: '附件包管理器執行失敗',
      canBuild: false,
      built: false,
      outputDir: '',
      packageFingerprint: '',
      counts: {},
      records: [],
      issues: [{ level: 'error', code: 'manager-error', message: text(error?.message || error), files: [] }],
      displayText: text(error?.message || error),
    };
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ACTIONS,
  text,
  firstFingerprint,
  documentState,
  checkRecords,
  verifyRecords,
  issueRecords,
  requireInput,
  checkResponse,
  buildResponse,
  verifyResponse,
  runAction,
  parseArgs,
  usageResponse,
  exitCodeForResponse,
  main,
};

if (require.main === module) process.exitCode = main();
