'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const History = require('./attachment-package-upgrade-history.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');
const Root = require('./attachment-case-governance-root.js');

const PORTFOLIO_KIND = 'formal-attachment-case-governance-portfolio.v1';
const PORTFOLIO_BOUNDARY_INSTRUCTION = '本總覽只供案件內部批次確認附件治理狀態；不得放入計算書、主報告或正式附件包，亦不代表任何案件的正式附件核可或數位簽章。';
const TRIAGE_RULES = Object.freeze([
  { code: 'source-stability-blocked', label: '檢查期間資料異動，先停止歸檔並固定來源', priority: 'P0', priorityLevel: 0, sequence: 10, actionCodes: ['rerun-after-source-stable', 'rerun-after-case-root-stable'], portfolioIssueCodes: ['portfolio-changed-during-read'] },
  { code: 'formal-package-blocked', label: '正式附件包需修復或重新建立', priority: 'P0', priorityLevel: 0, sequence: 20, actionCodes: ['repair-formal-package'], portfolioIssueCodes: [] },
  { code: 'trusted-chain-blocked', label: '可信基準版本鏈需修復', priority: 'P0', priorityLevel: 0, sequence: 30, actionCodes: ['repair-trusted-baseline-chain'], portfolioIssueCodes: [] },
  { code: 'case-layout-blocked', label: '案件或上層資料夾結構需整理', priority: 'P0', priorityLevel: 0, sequence: 40, actionCodes: ['fix-case-root-layout'], portfolioIssueCodes: ['unsafe-portfolio-entry', 'portfolio-entry-unreadable', 'portfolio-empty'] },
  { code: 'other-blocked', label: '其他阻擋問題需先查明並修復', priority: 'P0', priorityLevel: 0, sequence: 90, actionCodes: [], portfolioIssueCodes: [] },
  { code: 'baseline-advance-review', label: '合法新增收據待複核並前進可信基準', priority: 'P1', priorityLevel: 1, sequence: 10, actionCodes: ['advance-trusted-baseline'], portfolioIssueCodes: [] },
  { code: 'package-compatibility-review', label: '附件包相容性提醒待確認或升級', priority: 'P2', priorityLevel: 2, sequence: 10, actionCodes: ['review-or-upgrade-formal-package'], portfolioIssueCodes: [] },
  { code: 'other-review', label: '其他人工確認事項待處理', priority: 'P2', priorityLevel: 2, sequence: 90, actionCodes: [], portfolioIssueCodes: [] },
]);

function issue(level, code, message, entries = []) {
  return { level, code, message, entries: [...entries].sort() };
}

function physicalParent(parentDir) {
  const resolved = path.resolve(parentDir || '');
  if (!parentDir || !fs.existsSync(resolved)) throw new Error(`案件上層資料夾不存在：${resolved || parentDir || '(未指定)'}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('案件上層資料夾必須是實體資料夾。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  if (normalize(realPath) !== normalize(resolved)) throw new Error('案件上層資料夾不得透過符號連結或目錄連接重新導向。');
  return { resolved, realPath };
}

function hasExactGovernanceName(directory) {
  try {
    const names = new Set(fs.readdirSync(directory));
    return names.has(History.HISTORY_DIR_NAME) || names.has(Baseline.BASELINE_DIR_NAME);
  } catch (error) {
    return false;
  }
}

function caseSignal(scan, directory) {
  const candidates = scan.candidates;
  return candidates.packages.length + candidates.histories.length + candidates.chains.length > 0
    || hasExactGovernanceName(directory);
}

function scanPortfolio(parentDir) {
  const parent = physicalParent(parentDir);
  const cases = [];
  const ignoredDirectories = [];
  const issues = [];
  fs.readdirSync(parent.resolved).sort().forEach(name => {
    const candidate = path.join(parent.resolved, name);
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      issues.push(issue('error', 'unsafe-portfolio-entry', '案件上層資料夾含連結項目，無法安全批次辨識。', [name]));
      return;
    }
    if (!stat.isDirectory()) return;
    let scan;
    try {
      scan = Root.scanCaseRoot(candidate);
    } catch (error) {
      issues.push(issue('error', 'portfolio-entry-unreadable', '案件候選資料夾無法安全讀取。', [name]));
      return;
    }
    if (caseSignal(scan, candidate)) cases.push({ name, path: candidate, scan });
    else ignoredDirectories.push(name);
  });
  if (!cases.length) issues.push(issue('error', 'portfolio-empty', '案件上層資料夾找不到任何附件治理案件。'));
  return { parent, cases, ignoredDirectories: ignoredDirectories.sort(), issues };
}

function scanSignature(scan) {
  return {
    parentName: path.basename(scan.parent.resolved),
    cases: scan.cases.map(item => ({
      name: item.name,
      candidates: Root.candidateNames(item.scan.candidates),
      issues: item.scan.issues.map(entry => ({ code: entry.code, entries: entry.entries })),
    })),
    ignoredDirectories: [...scan.ignoredDirectories],
    issues: scan.issues.map(item => ({ code: item.code, entries: item.entries })),
  };
}

function governanceCandidateSnapshots(scan) {
  const snapshots = [];
  scan.cases.forEach(caseEntry => {
    const seen = new Set();
    ['packages', 'histories', 'chains'].forEach(role => {
      caseEntry.scan.candidates[role].forEach(candidate => {
        const key = path.resolve(candidate.path).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        snapshots.push({
          caseName: caseEntry.name,
          candidateName: candidate.name,
          role,
          path: candidate.path,
          snapshot: Chain.directorySnapshot(candidate.path, '案件治理候選資料夾'),
        });
      });
    });
  });
  return snapshots;
}

function snapshotsUnchanged(records) {
  try {
    return records.every(record => JSON.stringify(record.snapshot)
      === JSON.stringify(Chain.directorySnapshot(record.path, '案件治理候選資料夾')));
  } catch (error) {
    return false;
  }
}

function buildTriage(cases, portfolioIssues = []) {
  const groups = new Map();
  const casePriorities = new Map();
  const ruleByCode = new Map(TRIAGE_RULES.map(rule => [rule.code, rule]));
  const ensureGroup = rule => {
    if (!groups.has(rule.code)) {
      groups.set(rule.code, {
        rule,
        cases: new Set(),
        actionCodes: new Set(),
        portfolioIssueCodes: new Set(),
      });
    }
    return groups.get(rule.code);
  };

  cases.filter(item => item.status !== 'ready').forEach(item => {
    const actions = new Set(item.nextActionCodes);
    let matched = TRIAGE_RULES.filter(rule => rule.actionCodes.some(code => actions.has(code)));
    if (!matched.length) matched = [ruleByCode.get(item.status === 'blocked' ? 'other-blocked' : 'other-review')];
    matched.forEach(rule => {
      const group = ensureGroup(rule);
      group.cases.add(item.caseName);
      rule.actionCodes.filter(code => actions.has(code)).forEach(code => group.actionCodes.add(code));
    });
    const best = matched.reduce((current, rule) => Math.min(current, rule.priorityLevel), 9);
    casePriorities.set(item.caseName, best);
  });

  portfolioIssues.forEach(item => {
    let matched = TRIAGE_RULES.filter(rule => rule.portfolioIssueCodes.includes(item.code));
    if (!matched.length) matched = [ruleByCode.get(item.level === 'error' ? 'other-blocked' : 'other-review')];
    matched.forEach(rule => ensureGroup(rule).portfolioIssueCodes.add(item.code));
  });

  const serializedGroups = [...groups.values()]
    .sort((left, right) => left.rule.priorityLevel - right.rule.priorityLevel
      || left.rule.sequence - right.rule.sequence
      || left.rule.code.localeCompare(right.rule.code))
    .map(group => {
      const caseNames = [...group.cases].sort();
      const portfolioCodes = [...group.portfolioIssueCodes].sort();
      return {
        priority: group.rule.priority,
        code: group.rule.code,
        label: group.rule.label,
        scope: caseNames.length && portfolioCodes.length ? 'portfolio-and-case' : portfolioCodes.length ? 'portfolio' : 'case',
        caseCount: caseNames.length,
        cases: caseNames,
        actionCodes: [...group.actionCodes].sort(),
        portfolioIssueCodes: portfolioCodes,
      };
    });
  const casePriorityCounts = { P0: 0, P1: 0, P2: 0 };
  casePriorities.forEach(level => { casePriorityCounts[`P${Math.min(level, 2)}`] += 1; });
  return {
    highestPriority: serializedGroups.length ? serializedGroups[0].priority : 'none',
    actionableCaseCount: casePriorities.size,
    portfolioIssueCount: portfolioIssues.length,
    groupCount: serializedGroups.length,
    casePriorityCounts,
    groups: serializedGroups,
  };
}

function portfolioFingerprint(scan, cases, issues, triage = buildTriage(cases, issues)) {
  const payload = {
    discovery: scanSignature(scan),
    cases: cases.map(item => ({
      caseName: item.caseName,
      status: item.status,
      caseFingerprint: item.caseFingerprint,
      governanceFingerprint: item.governanceFingerprint,
      issueCodes: item.issueCodes,
      nextActionCodes: item.nextActionCodes,
    })),
    issues: issues.map(item => ({ level: item.level, code: item.code, entries: item.entries })),
    triage,
  };
  const digest = crypto.createHash('sha256')
    .update(History.canonicalJson(payload), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `POR-${digest}`;
}

function portableCase(caseName, result) {
  return {
    caseName,
    status: result.status,
    caseFingerprint: result.caseFingerprint,
    governanceFingerprint: result.governance?.governanceFingerprint || '',
    packageStatus: result.governance?.package.status || 'not-checked',
    chainStatus: result.governance?.chain.status || 'not-checked',
    currentReceiptCount: result.governance?.history.currentReceiptCount || 0,
    pendingAdditions: result.governance?.history.pendingAdditions || 0,
    issueCodes: [
      ...result.issues.map(item => item.code),
      ...(result.governance?.issues || []).map(item => item.code),
    ].sort(),
    nextActionCodes: result.nextActions.map(item => item.code).sort(),
  };
}

function inspectPortfolio(parentDir, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立多案件治理總覽時間。');
  const scanBefore = scanPortfolio(parentDir);
  const candidateSnapshots = governanceCandidateSnapshots(scanBefore);
  const cases = scanBefore.cases.map(item => portableCase(
    item.name,
    Root.inspectCaseRoot(item.path, { now: generatedAt }),
  ));
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ scan: scanBefore, cases });

  const issues = [...scanBefore.issues];
  try {
    const scanAfter = scanPortfolio(parentDir);
    if (JSON.stringify(scanSignature(scanBefore)) !== JSON.stringify(scanSignature(scanAfter))
        || !snapshotsUnchanged(candidateSnapshots)) {
      issues.push(issue('error', 'portfolio-changed-during-read', '案件候選或治理資料在批次總覽期間發生變更。'));
    }
  } catch (error) {
    issues.push(issue('error', 'portfolio-changed-during-read', '案件上層資料夾在批次總覽期間無法再次確認。'));
  }

  const readyCases = cases.filter(item => item.status === 'ready').length;
  const reviewCases = cases.filter(item => item.status === 'review').length;
  const blockedCases = cases.filter(item => item.status === 'blocked').length;
  const status = issues.some(item => item.level === 'error') || blockedCases
    ? 'blocked'
    : reviewCases ? 'review' : 'ready';
  const nextActions = [];
  const blockedNames = cases.filter(item => item.status === 'blocked').map(item => item.caseName);
  const reviewNames = cases.filter(item => item.status === 'review').map(item => item.caseName);
  if (issues.some(item => item.code === 'portfolio-changed-during-read')) {
    nextActions.push({ code: 'rerun-after-portfolio-stable', message: '固定案件上層資料夾與治理資料後重新執行批次總覽。', cases: [] });
  }
  if (blockedNames.length) {
    nextActions.push({ code: 'repair-blocked-cases', message: `先處理 ${blockedNames.length} 個 blocked 案件。`, cases: blockedNames });
  }
  if (reviewNames.length) {
    nextActions.push({ code: 'review-pending-cases', message: `完成人工確認或基準前進：${reviewNames.length} 個案件。`, cases: reviewNames });
  }
  if (!nextActions.length && status === 'ready') {
    nextActions.push({ code: 'internal-archive-review', message: '全部案件可進入各自的內部歸檔複核；正式採用仍由各案主文及負責人確認。', cases: cases.map(item => item.caseName) });
  }
  if (!nextActions.length) {
    nextActions.push({ code: 'fix-portfolio-layout', message: '整理案件上層資料夾後重新執行批次總覽。', cases: [] });
  }
  const triage = buildTriage(cases, issues);
  const result = {
    schemaVersion: 1,
    kind: PORTFOLIO_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    portfolioFingerprint: '',
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: PORTFOLIO_BOUNDARY_INSTRUCTION,
    },
    discovery: {
      parentName: path.basename(scanBefore.parent.resolved),
      caseCount: cases.length,
      ignoredDirectoryCount: scanBefore.ignoredDirectories.length,
      ignoredDirectories: [...scanBefore.ignoredDirectories],
    },
    summary: {
      readyCases,
      reviewCases,
      blockedCases,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn').length,
    },
    triage,
    cases,
    issues,
    nextActions,
  };
  result.portfolioFingerprint = portfolioFingerprint(scanBefore, cases, issues, triage);
  return result;
}

function formatSummary(result) {
  const statusLabel = result.status === 'ready' ? '全部可進入內部歸檔複核' : result.status === 'review' ? '有案件需人工確認' : '有案件停止歸檔';
  const priorityLabel = result.triage.highestPriority === 'none' ? '無' : result.triage.highestPriority;
  const lines = [
    '多案件附件治理唯讀總覽',
    `狀態：${statusLabel}`,
    `案件：${result.discovery.caseCount}；ready ${result.summary.readyCases}；review ${result.summary.reviewCases}；blocked ${result.summary.blockedCases}`,
    `忽略非案件資料夾：${result.discovery.ignoredDirectoryCount}`,
    `批次指紋：${result.portfolioFingerprint}`,
    `處置優先：${priorityLabel}；待處理案件 ${result.triage.actionableCaseCount}；問題群組 ${result.triage.groupCount}`,
  ];
  result.triage.groups.forEach(group => {
    const caseText = group.caseCount ? `；${group.caseCount} 案（${group.cases.join('、')}）` : '';
    const portfolioText = group.portfolioIssueCodes.length ? `；上層問題 ${group.portfolioIssueCodes.join('、')}` : '';
    lines.push(`- [${group.priority}] ${group.label}${caseText}${portfolioText}`);
  });
  result.cases.forEach(item => lines.push(`- ${item.caseName}：${item.status}；附件包 ${item.packageStatus}；版本鏈 ${item.chainStatus}；待前進 ${item.pendingAdditions}`));
  result.issues.forEach(item => lines.push(`- 阻擋 [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(PORTFOLIO_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--parent') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('參數 --parent 缺少路徑值。');
      options.parent = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio.js --parent <案件上層資料夾> [--json]',
    '只掃描直接子資料夾；有附件治理結構的視為案件，其餘列為忽略。',
    '結果固定唯讀；ready 不代表任何案件的正式附件核可。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Checker.PACKAGE_STATUS_EXIT_CODES.ready;
  }
  if (!options.parent) {
    console.error(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = inspectPortfolio(options.parent, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  PORTFOLIO_KIND,
  PORTFOLIO_BOUNDARY_INSTRUCTION,
  TRIAGE_RULES,
  hasExactGovernanceName,
  caseSignal,
  scanPortfolio,
  scanSignature,
  governanceCandidateSnapshots,
  snapshotsUnchanged,
  buildTriage,
  portfolioFingerprint,
  portableCase,
  inspectPortfolio,
  formatSummary,
  parseArgs,
  usage,
};
