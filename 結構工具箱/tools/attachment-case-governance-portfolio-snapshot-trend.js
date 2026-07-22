'use strict';

const crypto = require('crypto');
const Checker = require('./attachment-package-check.js');
const History = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Index = require('./attachment-case-governance-portfolio-snapshot-index.js');

const TREND_KIND = 'formal-attachment-case-governance-portfolio-snapshot-trend.v1';
const TREND_BOUNDARY_INSTRUCTION = '本趨勢只供內部追蹤同一案件群組的治理快照變化；不得放入計算書、主報告或正式附件包，不代表正式附件核可、版本前進、風險評分或數位簽章，亦不得發布至 Pages。';
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });
const ATTENTION_LEVEL = Object.freeze({ P0: 0, P1: 1, P2: 2, none: 9 });
const CHANGE_TYPES = Object.freeze(['added', 'removed', 'improved', 'regressed', 'changed', 'unchanged']);

function maxStatus(...statuses) {
  return statuses.reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function emptySummary() {
  return {
    snapshotCount: 0,
    transitionCount: 0,
    trackedCases: 0,
    currentCases: 0,
    removedCurrentCases: 0,
    attentionP0: 0,
    attentionP1: 0,
    attentionP2: 0,
    added: 0,
    removed: 0,
    improved: 0,
    regressed: 0,
    changed: 0,
    unchanged: 0,
    recurringIssueCodes: 0,
    activeRecurringIssueCodes: 0,
    errors: 0,
    warnings: 0,
  };
}

function compareAttention(left, right) {
  return ATTENTION_LEVEL[left.attentionPriority] - ATTENTION_LEVEL[right.attentionPriority]
    || Index.compareOrdinal(left.caseName, right.caseName);
}

function transitionSummary(comparison) {
  return Object.fromEntries(CHANGE_TYPES.map(type => [type, comparison.summary[type]]));
}

function buildTransitions(records, options = {}) {
  const transitions = [];
  const comparisons = [];
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    const comparison = Compare.compareSnapshots(previous.file.snapshot, current.file.snapshot, {
      now: options.now,
      previousFileName: previous.public.fileName,
      currentFileName: current.public.fileName,
    });
    comparisons.push(comparison);
    transitions.push({
      previousGeneratedAt: previous.public.generatedAt,
      currentGeneratedAt: current.public.generatedAt,
      previousPortfolioFingerprint: previous.public.portfolioFingerprint,
      currentPortfolioFingerprint: current.public.portfolioFingerprint,
      status: comparison.status,
      comparisonFingerprint: comparison.comparisonFingerprint,
      summary: transitionSummary(comparison),
    });
  }
  return { transitions, comparisons };
}

function attentionForCase(currentCase, currentPriority, latestTransitionChange, lastSignificantChange, activeRecurringIssueCodes) {
  const reasons = [];
  let priority = 'none';
  const raise = value => {
    if (ATTENTION_LEVEL[value] < ATTENTION_LEVEL[priority]) priority = value;
  };
  if (currentCase?.status === 'blocked') { raise('P0'); reasons.push('current-blocked'); }
  if (latestTransitionChange === 'regressed') { raise('P0'); reasons.push('latest-regression'); }
  if (currentPriority === 'P0') { raise('P0'); reasons.push('current-priority-p0'); }
  if (currentPriority === 'P1') { raise('P1'); reasons.push('current-priority-p1'); }
  if (currentCase?.status === 'review' || currentPriority === 'P2') { raise('P2'); reasons.push('current-review'); }
  if (latestTransitionChange === 'added') { raise('P2'); reasons.push('latest-addition'); }
  if (!currentCase && lastSignificantChange === 'removed') { raise('P2'); reasons.push('case-removed-from-current'); }
  if (activeRecurringIssueCodes.length) { raise('P2'); reasons.push('active-recurring-issue'); }
  return { priority, reasons: [...new Set(reasons)] };
}

function buildIssueTrends(snapshots) {
  const records = new Map();
  const touch = (code, generatedAt, caseName = '', portfolioLevel = false) => {
    if (!records.has(code)) {
      records.set(code, {
        code,
        snapshotTimes: new Set(),
        caseNames: new Set(),
        caseOccurrences: 0,
        portfolioOccurrences: 0,
        firstSeenAt: generatedAt,
        lastSeenAt: generatedAt,
      });
    }
    const item = records.get(code);
    item.snapshotTimes.add(generatedAt);
    if (caseName) item.caseNames.add(caseName);
    if (portfolioLevel) item.portfolioOccurrences += 1;
    else item.caseOccurrences += 1;
    if (generatedAt < item.firstSeenAt) item.firstSeenAt = generatedAt;
    if (generatedAt > item.lastSeenAt) item.lastSeenAt = generatedAt;
  };
  snapshots.forEach(snapshot => {
    snapshot.cases.forEach(caseItem => caseItem.issueCodes.forEach(code => touch(code, snapshot.generatedAt, caseItem.caseName, false)));
    snapshot.issues.forEach(item => touch(item.code, snapshot.generatedAt, '', true));
  });
  const latest = snapshots.at(-1);
  const latestCaseCodes = new Map();
  latest?.cases.forEach(item => item.issueCodes.forEach(code => {
    if (!latestCaseCodes.has(code)) latestCaseCodes.set(code, new Set());
    latestCaseCodes.get(code).add(item.caseName);
  }));
  const latestPortfolioCodes = new Set((latest?.issues || []).map(item => item.code));
  return [...records.values()].map(item => ({
    code: item.code,
    snapshotCount: item.snapshotTimes.size,
    affectedCaseCount: item.caseNames.size,
    caseOccurrences: item.caseOccurrences,
    portfolioOccurrences: item.portfolioOccurrences,
    activeCaseCount: latestCaseCodes.get(item.code)?.size || 0,
    activeAtPortfolio: latestPortfolioCodes.has(item.code),
    recurring: item.snapshotTimes.size >= 2,
    active: latestPortfolioCodes.has(item.code) || latestCaseCodes.has(item.code),
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
  })).sort((left, right) => Number(right.active) - Number(left.active)
    || Number(right.recurring) - Number(left.recurring)
    || right.snapshotCount - left.snapshotCount
    || Index.compareOrdinal(left.code, right.code));
}

function buildCaseTrends(snapshots, comparisons, issueTrends) {
  const names = [...new Set(snapshots.flatMap(snapshot => snapshot.cases.map(item => item.caseName)))].sort(Index.compareOrdinal);
  const recurringCodes = new Set(issueTrends.filter(item => item.recurring).map(item => item.code));
  const latest = snapshots.at(-1);
  const latestCases = new Map((latest?.cases || []).map(item => [item.caseName, item]));
  const changesByCase = new Map(names.map(name => [name, []]));
  comparisons.forEach((comparison, transitionIndex) => comparison.changes.forEach(change => {
    if (!changesByCase.has(change.caseName)) changesByCase.set(change.caseName, []);
    changesByCase.get(change.caseName).push({ transitionIndex, change: change.change });
  }));
  return names.map(caseName => {
    const statusTrail = snapshots.map(snapshot => {
      const item = snapshot.cases.find(candidate => candidate.caseName === caseName);
      return {
        generatedAt: snapshot.generatedAt,
        status: item?.status || 'missing',
        priority: item ? Compare.casePriority(snapshot, caseName, item.status) : 'none',
      };
    });
    const observed = statusTrail.filter(item => item.status !== 'missing');
    const issueOccurrences = new Map();
    snapshots.forEach(snapshot => {
      const item = snapshot.cases.find(candidate => candidate.caseName === caseName);
      item?.issueCodes.forEach(code => issueOccurrences.set(code, (issueOccurrences.get(code) || 0) + 1));
    });
    const currentCase = latestCases.get(caseName);
    const currentPriority = currentCase ? Compare.casePriority(latest, caseName, currentCase.status) : 'none';
    const changes = changesByCase.get(caseName) || [];
    const latestChangeRecord = changes.find(item => item.transitionIndex === comparisons.length - 1);
    const lastSignificant = [...changes].reverse().find(item => item.change !== 'unchanged');
    const activeRecurringIssueCodes = (currentCase?.issueCodes || []).filter(code => recurringCodes.has(code)).sort();
    const attention = attentionForCase(currentCase, currentPriority, latestChangeRecord?.change || 'not-observed', lastSignificant?.change || 'not-observed', activeRecurringIssueCodes);
    const transitionCounts = Object.fromEntries(CHANGE_TYPES.map(type => [type, changes.filter(item => item.change === type).length]));
    return {
      caseName,
      attentionPriority: attention.priority,
      attentionReasons: attention.reasons,
      currentStatus: currentCase?.status || 'missing',
      currentPriority,
      latestTransitionChange: latestChangeRecord?.change || 'not-observed',
      firstSeenAt: observed[0]?.generatedAt || '',
      lastSeenAt: observed.at(-1)?.generatedAt || '',
      snapshotsPresent: observed.length,
      statusTrail,
      transitionCounts,
      activeIssueCodes: [...(currentCase?.issueCodes || [])],
      recurringIssueCodes: [...issueOccurrences.entries()].filter(([code, count]) => count >= 2 && recurringCodes.has(code)).map(([code]) => code).sort(),
      activeRecurringIssueCodes,
    };
  }).sort(compareAttention);
}

function trendFingerprint(result) {
  const payload = {
    indexFingerprint: result.indexFingerprint,
    group: result.group,
    sources: result.sources,
    statusTimeline: result.statusTimeline,
    transitions: result.transitions,
    caseTrends: result.caseTrends,
    issueTrends: result.issueTrends,
    issues: result.issues.map(item => ({ level: item.level, code: item.code, entries: item.entries })),
  };
  return `TRD-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildNextActions(result) {
  if (result.integrityStatus === 'blocked') return [{ code: 'repair-snapshot-trend-input', message: '修復、分流或固定治理快照資料夾後重新分析。' }];
  if (!result.analysisComplete) return [{ code: 'capture-another-snapshot', message: '同一案件群組至少保存兩份有效快照後再分析趨勢。' }];
  const actions = [];
  const p0Cases = result.caseTrends.filter(item => item.attentionPriority === 'P0').map(item => item.caseName);
  const activeRecurring = result.issueTrends.filter(item => item.recurring && item.active).map(item => item.code);
  if (p0Cases.length) actions.push({ code: 'resolve-current-p0-trends', message: '先處理目前 blocked 或最新惡化案件。', cases: p0Cases });
  if (activeRecurring.length) actions.push({ code: 'review-active-recurring-issues', message: '確認目前仍存在且跨期反覆出現的問題代碼。', issueCodes: activeRecurring });
  if (result.currentHealth === 'review') actions.push({ code: 'review-current-portfolio', message: '依最新完整總覽完成目前 review 案件的內部複核。' });
  if (!actions.length && result.latestTransitionStatus === 'review') actions.push({ code: 'confirm-latest-transition', message: '確認最新改善、新增、移除或同狀態內容變更符合預期。' });
  if (!actions.length) actions.push({ code: 'retain-stable-trend', message: '目前健康與最新轉折穩定；保留唯讀趨勢供內部追溯。' });
  return actions;
}

function analyzeSnapshotTrend(directory, options = {}) {
  const prepared = Index.prepareSnapshotIndex(directory, options);
  const base = prepared.result;
  const issues = base.issues.map(item => ({ ...item, entries: [...item.entries] }));
  if (base.groups.length > 1) {
    issues.push(Index.issue('error', 'trend-requires-single-group', '跨版本趨勢只接受單一案件群組的專用資料夾，不得跨群組猜選。', base.groups.map(group => group.groupName)));
  }
  let integrityStatus = issues.some(item => item.level === 'error') ? 'blocked' : issues.length ? 'review' : 'ready';
  const groupIndex = base.groups.length === 1 ? base.groups[0] : null;
  const orderedRecords = groupIndex ? groupIndex.snapshots.map(item => prepared.recordsByName.get(item.fileName)) : [];
  const sources = orderedRecords.map(item => ({
    fileName: item.public.fileName,
    generatedAt: item.public.generatedAt,
    status: item.public.status,
    portfolioFingerprint: item.public.portfolioFingerprint,
    caseCount: item.public.caseCount,
    sha256: item.public.sha256,
  }));
  const result = {
    schemaVersion: 1,
    kind: TREND_KIND,
    generatedAt: (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString(),
    status: maxStatus(base.status, integrityStatus),
    integrityStatus,
    currentHealth: groupIndex?.latestStatus || 'blocked',
    latestTransitionStatus: 'not-available',
    attentionStatus: 'not-available',
    analysisComplete: false,
    trendFingerprint: '',
    indexFingerprint: base.indexFingerprint,
    boundary: {
      classification: 'internal-governance-snapshot-trend-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      modifiesSnapshots: false,
      riskScore: false,
      pagesPublication: false,
      instruction: TREND_BOUNDARY_INSTRUCTION,
    },
    directoryName: base.directoryName,
    group: groupIndex ? {
      groupName: groupIndex.groupName,
      snapshotCount: groupIndex.snapshotCount,
      earliestGeneratedAt: groupIndex.earliestGeneratedAt,
      latestGeneratedAt: groupIndex.latestGeneratedAt,
      currentStatus: groupIndex.latestStatus,
      currentPortfolioFingerprint: groupIndex.snapshots.at(-1).portfolioFingerprint,
    } : null,
    summary: emptySummary(),
    sources,
    statusTimeline: [],
    transitions: [],
    caseTrends: [],
    issueTrends: [],
    issues,
    nextActions: [],
  };
  if (groupIndex && orderedRecords.length >= 2 && integrityStatus !== 'blocked') {
    const snapshots = orderedRecords.map(item => item.file.snapshot);
    const built = buildTransitions(orderedRecords, options);
    result.statusTimeline = snapshots.map(snapshot => ({
      generatedAt: snapshot.generatedAt,
      status: snapshot.status,
      portfolioFingerprint: snapshot.portfolioFingerprint,
      readyCases: snapshot.summary.readyCases,
      reviewCases: snapshot.summary.reviewCases,
      blockedCases: snapshot.summary.blockedCases,
      errors: snapshot.summary.errors,
      warnings: snapshot.summary.warnings,
    }));
    result.transitions = built.transitions;
    result.issueTrends = buildIssueTrends(snapshots);
    result.caseTrends = buildCaseTrends(snapshots, built.comparisons, result.issueTrends);
    result.analysisComplete = true;
    result.latestTransitionStatus = built.comparisons.at(-1).status;
    result.attentionStatus = result.caseTrends.some(item => item.attentionPriority === 'P0')
      ? 'blocked'
      : result.caseTrends.some(item => ['P1', 'P2'].includes(item.attentionPriority)) ? 'review' : 'ready';
    const totals = Object.fromEntries(CHANGE_TYPES.map(type => [type, built.comparisons.reduce((sum, item) => sum + item.summary[type], 0)]));
    result.summary = {
      snapshotCount: snapshots.length,
      transitionCount: built.comparisons.length,
      trackedCases: result.caseTrends.length,
      currentCases: snapshots.at(-1).cases.length,
      removedCurrentCases: result.caseTrends.filter(item => item.currentStatus === 'missing').length,
      attentionP0: result.caseTrends.filter(item => item.attentionPriority === 'P0').length,
      attentionP1: result.caseTrends.filter(item => item.attentionPriority === 'P1').length,
      attentionP2: result.caseTrends.filter(item => item.attentionPriority === 'P2').length,
      ...totals,
      recurringIssueCodes: result.issueTrends.filter(item => item.recurring).length,
      activeRecurringIssueCodes: result.issueTrends.filter(item => item.recurring && item.active).length,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn').length,
    };
    result.status = maxStatus(integrityStatus, result.currentHealth, result.latestTransitionStatus, result.attentionStatus);
  } else {
    result.summary.snapshotCount = sources.length;
    result.summary.currentCases = sources.at(-1)?.caseCount || 0;
    result.summary.errors = issues.filter(item => item.level === 'error').length;
    result.summary.warnings = issues.filter(item => item.level === 'warn').length;
  }
  if (typeof options.afterAnalyze === 'function') options.afterAnalyze({ prepared, result });
  let directoryStable = false;
  try {
    directoryStable = History.canonicalJson(prepared.signature) === History.canonicalJson(Index.directorySignature(prepared.resolved))
      && Compare.sourcesUnchanged(prepared.records.map(item => item.file));
  } catch (error) { directoryStable = false; }
  if (!directoryStable && !result.issues.some(item => item.code === 'snapshot-directory-changed-during-read')) {
    result.issues.push(Index.issue('error', 'snapshot-directory-changed-during-trend-analysis', '治理快照資料夾在跨版本趨勢分析期間發生變更。'));
    result.integrityStatus = 'blocked';
    result.status = 'blocked';
    result.summary.errors += 1;
  }
  result.nextActions = buildNextActions(result);
  result.trendFingerprint = trendFingerprint(result);
  return result;
}

function formatSummary(result) {
  const lines = [
    '多案件附件治理快照跨版本趨勢',
    `狀態：${result.status}；完整性：${result.integrityStatus}；目前健康：${result.currentHealth}；最新轉折：${result.latestTransitionStatus}；目前注意：${result.attentionStatus}`,
    `資料夾：${result.directoryName}`,
    `快照：${result.summary.snapshotCount}；轉折：${result.summary.transitionCount}；追蹤案件：${result.summary.trackedCases}`,
    `注意排序：P0 ${result.summary.attentionP0}／P1 ${result.summary.attentionP1}／P2 ${result.summary.attentionP2}`,
    `變化累計：惡化 ${result.summary.regressed}／改善 ${result.summary.improved}／新增 ${result.summary.added}／移除 ${result.summary.removed}／同狀態變更 ${result.summary.changed}`,
    `反覆問題代碼：${result.summary.recurringIssueCodes}；目前仍存在：${result.summary.activeRecurringIssueCodes}`,
    `趨勢指紋：${result.trendFingerprint}`,
  ];
  result.caseTrends.filter(item => item.attentionPriority !== 'none').forEach(item => {
    lines.push(`- ${item.attentionPriority} ${item.caseName}：目前 ${item.currentStatus}；最新轉折 ${item.latestTransitionChange}；原因 ${item.attentionReasons.join('、')}`);
  });
  result.issueTrends.filter(item => item.recurring).forEach(item => {
    lines.push(`- 反覆問題 [${item.code}]：${item.snapshotCount} 期；目前${item.active ? '仍存在' : '已不在最新快照'}`);
  });
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '阻擋' : '提醒'} [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(TREND_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--directory') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('參數 --directory 缺少路徑值。');
      options.directory = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio-snapshot-trend.js --directory <單一案件群組的內部治理快照資料夾> [--json]',
    '沿用快照索引的封閉驗證，分析全部連續快照的狀態軌跡、反覆問題及目前注意排序。',
    '趨勢固定唯讀；不是風險評分，不修改快照、不核可、不前進版本。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.directory) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = analyzeSnapshotTrend(options.directory, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(error.message || error);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  TREND_KIND,
  TREND_BOUNDARY_INSTRUCTION,
  CHANGE_TYPES,
  maxStatus,
  emptySummary,
  compareAttention,
  transitionSummary,
  buildTransitions,
  attentionForCase,
  buildIssueTrends,
  buildCaseTrends,
  trendFingerprint,
  buildNextActions,
  analyzeSnapshotTrend,
  formatSummary,
  parseArgs,
  usage,
  main,
};
