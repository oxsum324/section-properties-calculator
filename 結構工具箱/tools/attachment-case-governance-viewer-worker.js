'use strict';

const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Root = require('./attachment-case-governance-root.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');

const ACTIONS = new Set(['smoke', 'case', 'portfolio']);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function requireDirectory(value) {
  if (!text(value)) throw new Error('尚未選擇資料夾。');
  const resolved = path.resolve(text(value));
  if (!fs.existsSync(resolved) || !fs.lstatSync(resolved).isDirectory()) {
    throw new Error(`資料夾不存在：${resolved}`);
  }
  return resolved;
}

function statusTitle(status, mode) {
  if (status === 'ready') return mode === 'portfolio' ? '全部案件可進入內部歸檔複核' : '案件可進入內部歸檔複核';
  if (status === 'review') return mode === 'portfolio' ? '部分案件需人工確認' : '案件需人工確認';
  return mode === 'portfolio' ? '多案件治理存在阻擋事項' : '案件治理存在阻擋事項';
}

function normalizeIssue(item = {}, fallbackComponent = '') {
  return {
    level: text(item.level),
    component: text(item.component || fallbackComponent),
    code: text(item.code),
    message: text(item.message),
    entries: Array.isArray(item.entries) ? item.entries.map(text).filter(Boolean) : [],
  };
}

function normalizeAction(item = {}) {
  return {
    code: text(item.code),
    message: text(item.message),
    cases: Array.isArray(item.cases) ? item.cases.map(text).filter(Boolean) : [],
  };
}

function rootIssues(result = {}) {
  return [
    ...(result.issues || []).map(item => normalizeIssue(item, 'case-root')),
    ...(result.governance?.issues || []).map(item => normalizeIssue(item, 'governance')),
  ];
}

function rootRecords(result = {}) {
  const governance = result.governance;
  const issueCodes = rootIssues(result).map(item => item.code).filter(Boolean);
  const actionCodes = (result.nextActions || []).map(item => text(item.code)).filter(Boolean);
  const overall = {
    item: '案件總覽',
    name: text(result.discovery?.caseRootName),
    status: text(result.status),
    priority: result.status === 'blocked' ? 'P0' : result.status === 'review' ? 'P2' : '',
    packageStatus: text(governance?.package?.status || 'not-checked'),
    chainStatus: text(governance?.chain?.status || 'not-checked'),
    pending: Number(governance?.history?.pendingAdditions || 0),
    issues: issueCodes.join('、'),
    next: actionCodes.join('、'),
  };
  if (!governance) return [overall];
  return [
    overall,
    {
      item: '正式附件包', name: text(result.discovery?.selectedPackage), status: text(governance.package?.status), priority: '',
      packageStatus: text(governance.package?.status), chainStatus: '', pending: 0,
      issues: Number(governance.package?.errors || 0) ? `errors=${governance.package.errors}` : '', next: '',
    },
    {
      item: '升級歷程', name: text(result.discovery?.selectedHistory), status: text(governance.history?.status), priority: '',
      packageStatus: '', chainStatus: '', pending: Number(governance.history?.pendingAdditions || 0), issues: '', next: '',
    },
    {
      item: '可信基準鏈', name: text(result.discovery?.selectedChain), status: text(governance.chain?.status), priority: '',
      packageStatus: '', chainStatus: text(governance.chain?.status), pending: 0,
      issues: Number(governance.chain?.baselines || 0) ? `基準 ${governance.chain.baselines}；連結 ${governance.chain.links}` : '', next: '',
    },
  ];
}

function rootResponse(result, root = Root) {
  const issues = rootIssues(result);
  return {
    action: 'case',
    status: result.status,
    title: statusTitle(result.status, 'case'),
    readOnly: true,
    fingerprint: text(result.caseFingerprint),
    counts: {
      cases: 1,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn' || item.level === 'warning').length,
      actions: Number(result.nextActions?.length || 0),
    },
    records: rootRecords(result),
    triage: [],
    issues,
    nextActions: (result.nextActions || []).map(normalizeAction),
    displayText: root.formatSummary(result),
  };
}

function priorityForCase(caseName, triage = {}) {
  const groups = (triage.groups || []).filter(group => (group.cases || []).includes(caseName));
  return groups.length ? text(groups[0].priority) : '';
}

function portfolioRecords(result = {}, portfolio = Portfolio, options = {}) {
  const view = portfolio.hasViewFilter(options) ? portfolio.buildFilteredView(result, options) : null;
  const cases = view ? view.cases : result.cases || [];
  return cases.map(item => ({
    item: '案件',
    name: text(item.caseName),
    status: text(item.status),
    priority: priorityForCase(item.caseName, result.triage),
    packageStatus: text(item.packageStatus),
    chainStatus: text(item.chainStatus),
    pending: Number(item.pendingAdditions || 0),
    issues: (item.issueCodes || []).map(text).filter(Boolean).join('、'),
    next: (item.nextActionCodes || []).map(text).filter(Boolean).join('、'),
  }));
}

function portfolioResponse(result, portfolio = Portfolio, options = {}) {
  const filter = portfolio.normalizeViewOptions(options);
  return {
    action: 'portfolio',
    status: result.status,
    title: statusTitle(result.status, 'portfolio'),
    readOnly: true,
    fingerprint: text(result.portfolioFingerprint),
    counts: {
      cases: Number(result.discovery?.caseCount || 0),
      ready: Number(result.summary?.readyCases || 0),
      review: Number(result.summary?.reviewCases || 0),
      blocked: Number(result.summary?.blockedCases || 0),
      actionable: Number(result.triage?.actionableCaseCount || 0),
      groups: Number(result.triage?.groupCount || 0),
    },
    filter: { onlyActionable: filter.onlyActionable, priority: filter.priority || 'all' },
    records: portfolioRecords(result, portfolio, options),
    triage: (result.triage?.groups || []).map(group => ({
      priority: text(group.priority), label: text(group.label), caseCount: Number(group.caseCount || 0),
      cases: (group.cases || []).map(text).filter(Boolean),
      portfolioIssueCodes: (group.portfolioIssueCodes || []).map(text).filter(Boolean),
    })),
    issues: (result.issues || []).map(item => normalizeIssue(item, 'portfolio')),
    nextActions: (result.nextActions || []).map(normalizeAction),
    displayText: portfolio.formatSummary(result, options),
  };
}

function runAction(action, options = {}, dependencies = {}) {
  const root = dependencies.Root || Root;
  const portfolio = dependencies.Portfolio || Portfolio;
  if (!ACTIONS.has(action)) throw new Error(`不支援的檢視器動作：${action || '(空白)'}`);
  if (action === 'smoke') {
    return {
      action, status: 'ready', title: '案件附件治理檢視器核心可用', readOnly: true, fingerprint: '',
      counts: { modules: 2 }, records: [], triage: [], issues: [], nextActions: [],
      displayText: '單一案件與多案件唯讀治理核心均已載入。',
    };
  }
  const input = requireDirectory(options.input);
  if (action === 'case') return rootResponse(root.inspectCaseRoot(input), root);
  const viewOptions = { onlyActionable: options.onlyActionable === true, priority: text(options.priority).toUpperCase() };
  return portfolioResponse(portfolio.inspectPortfolio(input, viewOptions), portfolio, viewOptions);
}

function parseArgs(argv = []) {
  const options = { onlyActionable: false, priority: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') options.action = argv[++index];
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--only-actionable') options.onlyActionable = true;
    else if (arg === '--priority') options.priority = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usageResponse() {
  return {
    action: 'help', status: 'ready',
    usage: 'node attachment-case-governance-viewer-worker.js --action smoke|case|portfolio [--input <資料夾>] [--only-actionable] [--priority P0|P1|P2]',
  };
}

function exitCodeForStatus(status) {
  return Checker.exitCodeForStatus(status);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const response = options.help ? usageResponse() : runAction(text(options.action), options);
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return exitCodeForStatus(response.status);
  } catch (error) {
    const message = text(error?.message || error);
    process.stdout.write(`${JSON.stringify({
      action: 'error', status: 'error', title: '案件附件治理檢視器執行失敗', readOnly: true,
      fingerprint: '', counts: {}, records: [], triage: [],
      issues: [{ level: 'error', component: 'viewer', code: 'viewer-error', message, entries: [] }],
      nextActions: [], displayText: message,
    })}\n`);
    return Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ACTIONS,
  text,
  requireDirectory,
  statusTitle,
  normalizeIssue,
  normalizeAction,
  rootIssues,
  rootRecords,
  rootResponse,
  priorityForCase,
  portfolioRecords,
  portfolioResponse,
  runAction,
  parseArgs,
  usageResponse,
  exitCodeForStatus,
  main,
};

if (require.main === module) process.exitCode = main();
