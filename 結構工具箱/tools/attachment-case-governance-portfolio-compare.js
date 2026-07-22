'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Verifier = require('./attachment-package-verify.js');
const History = require('./attachment-package-upgrade-history.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');

const COMPARISON_KIND = 'formal-attachment-case-governance-portfolio-comparison.v1';
const COMPARISON_BOUNDARY_INSTRUCTION = '本比較只供內部確認兩份完整多案件治理快照的差異；不得放入計算書、主報告或正式附件包，亦不代表任何案件的正式附件核可、版本前進或數位簽章。';
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });
const PRIORITY_LEVEL = Object.freeze({ none: 9, P2: 2, P1: 1, P0: 0 });
const CHANGE_ORDER = Object.freeze({ regressed: 0, added: 1, removed: 2, improved: 3, changed: 4, unchanged: 5 });
const TOP_LEVEL_FIELDS = ['schemaVersion', 'kind', 'generatedAt', 'status', 'portfolioFingerprint', 'boundary', 'discovery', 'summary', 'triage', 'cases', 'issues', 'nextActions'];
const CASE_FIELDS = ['caseName', 'status', 'caseFingerprint', 'governanceFingerprint', 'packageStatus', 'chainStatus', 'currentReceiptCount', 'pendingAdditions', 'issueCodes', 'nextActionCodes'];

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) throw new Error(`${label} 必須是 JSON 物件。`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} 欄位不符合封閉格式。`);
}

function safeName(value, label) {
  if (typeof value !== 'string' || !value || value.length > 200 || /[\\/\u0000-\u001f]/.test(value) || value === '.' || value === '..') {
    throw new Error(`${label} 名稱無效。`);
  }
  return value;
}

function validateStringArray(value, label, options = {}) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item || item.length > 200)) throw new Error(`${label} 必須是字串陣列。`);
  if (options.safeNames) value.forEach(item => safeName(item, label));
  const sorted = [...value].sort();
  if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify(sorted)) throw new Error(`${label} 必須排序且不得重複。`);
}

function normalizePath(value) {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function readSnapshotFile(filePath, label) {
  const resolved = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(resolved)) throw new Error(`${label}不存在：${path.basename(resolved) || '(未指定)'}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label}必須是實體 JSON 檔案。`);
  if (stat.size <= 0 || stat.size > MAX_SNAPSHOT_BYTES) throw new Error(`${label}大小必須介於 1 byte 與 ${MAX_SNAPSHOT_BYTES} bytes。`);
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (normalizePath(realPath) !== normalizePath(resolved)) throw new Error(`${label}不得透過連結重新導向。`);
  const raw = fs.readFileSync(resolved, 'utf8');
  const duplicates = Verifier.findDuplicateJsonKeys(raw);
  if (duplicates.length) throw new Error(`${label}含重複 JSON 欄位：${duplicates.slice(0, 5).map(item => item.pointer).join('、')}。`);
  let snapshot;
  try { snapshot = JSON.parse(raw); } catch (error) { throw new Error(`${label}不是有效 JSON：${error.message}`); }
  validateSnapshot(snapshot, label);
  return {
    path: resolved,
    fileName: path.basename(resolved),
    rawHash: crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
    snapshot,
  };
}

function validateCase(item, index) {
  const label = `案件 cases[${index}]`;
  exactKeys(item, CASE_FIELDS, label);
  safeName(item.caseName, label);
  if (!Object.prototype.hasOwnProperty.call(STATUS_LEVEL, item.status)) throw new Error(`${label} status 無效。`);
  if (typeof item.caseFingerprint !== 'string' || !/^CAS-[0-9A-F]{24}$/.test(item.caseFingerprint)) throw new Error(`${label} CAS 指紋無效。`);
  if (typeof item.governanceFingerprint !== 'string' || (item.governanceFingerprint && !/^GOV-[0-9A-F]{24}$/.test(item.governanceFingerprint))) throw new Error(`${label} GOV 指紋無效。`);
  if (!['ready', 'review', 'blocked', 'not-checked'].includes(item.packageStatus)) throw new Error(`${label}附件包狀態無效。`);
  if (!['valid', 'review', 'blocked', 'not-checked'].includes(item.chainStatus)) throw new Error(`${label}版本鏈狀態無效。`);
  ['currentReceiptCount', 'pendingAdditions'].forEach(key => {
    if (!Number.isSafeInteger(item[key]) || item[key] < 0) throw new Error(`${label} ${key} 必須是非負整數。`);
  });
  validateStringArray(item.issueCodes, `${label} issueCodes`);
  validateStringArray(item.nextActionCodes, `${label} nextActionCodes`);
}

function validateIssue(item, index) {
  exactKeys(item, ['level', 'code', 'message', 'entries'], `問題 issues[${index}]`);
  if (!['error', 'warn'].includes(item.level) || typeof item.code !== 'string' || !item.code || typeof item.message !== 'string' || !item.message) throw new Error(`問題 issues[${index}] 內容無效。`);
  validateStringArray(item.entries, `問題 issues[${index}] entries`, { safeNames: true });
}

function validateAction(item, index, caseNames) {
  exactKeys(item, ['code', 'message', 'cases'], `下一步 nextActions[${index}]`);
  if (typeof item.code !== 'string' || !item.code || typeof item.message !== 'string' || !item.message) throw new Error(`下一步 nextActions[${index}] 內容無效。`);
  validateStringArray(item.cases, `下一步 nextActions[${index}] cases`, { safeNames: true });
  item.cases.forEach(name => { if (!caseNames.has(name)) throw new Error(`下一步引用不存在案件：${name}`); });
}

function validateSnapshot(snapshot, label = '總覽快照') {
  if (!plainObject(snapshot)) throw new Error(`${label}必須是 JSON 物件。`);
  if (snapshot.kind === Portfolio.PORTFOLIO_VIEW_KIND) throw new Error(`${label}是篩選視圖；比較必須使用未篩選的完整總覽 JSON。`);
  exactKeys(snapshot, TOP_LEVEL_FIELDS, label);
  if (snapshot.schemaVersion !== 1 || snapshot.kind !== Portfolio.PORTFOLIO_KIND) {
    throw new Error(`${label}版本或種類不受支援。`);
  }
  if (!Number.isFinite(Date.parse(snapshot.generatedAt))) throw new Error(`${label} generatedAt 無效。`);
  if (!Object.prototype.hasOwnProperty.call(STATUS_LEVEL, snapshot.status)) throw new Error(`${label} status 無效。`);
  if (typeof snapshot.portfolioFingerprint !== 'string' || !/^POR-[0-9A-F]{24}$/.test(snapshot.portfolioFingerprint)) throw new Error(`${label} POR 指紋無效。`);
  exactKeys(snapshot.boundary, ['classification', 'attachToFormalReport', 'formalAttachmentApproval', 'instruction'], `${label} boundary`);
  if (snapshot.boundary.classification !== 'internal-governance-only' || snapshot.boundary.attachToFormalReport !== false
      || snapshot.boundary.formalAttachmentApproval !== false || snapshot.boundary.instruction !== Portfolio.PORTFOLIO_BOUNDARY_INSTRUCTION) {
    throw new Error(`${label}治理邊界無效。`);
  }
  exactKeys(snapshot.discovery, ['parentName', 'caseCount', 'ignoredDirectoryCount', 'ignoredDirectories'], `${label} discovery`);
  safeName(snapshot.discovery.parentName, `${label} parentName`);
  validateStringArray(snapshot.discovery.ignoredDirectories, `${label} ignoredDirectories`, { safeNames: true });
  if (!Number.isSafeInteger(snapshot.discovery.caseCount) || snapshot.discovery.caseCount < 0
      || !Number.isSafeInteger(snapshot.discovery.ignoredDirectoryCount) || snapshot.discovery.ignoredDirectoryCount !== snapshot.discovery.ignoredDirectories.length) {
    throw new Error(`${label} discovery 數量不一致。`);
  }
  if (!Array.isArray(snapshot.cases)) throw new Error(`${label} cases 必須是陣列。`);
  snapshot.cases.forEach(validateCase);
  const names = snapshot.cases.map(item => item.caseName);
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...names].sort())) throw new Error(`${label}案件名稱必須排序且不得重複。`);
  if (snapshot.discovery.caseCount !== snapshot.cases.length) throw new Error(`${label}案件總數不一致。`);
  if (!Array.isArray(snapshot.issues)) throw new Error(`${label} issues 必須是陣列。`);
  snapshot.issues.forEach(validateIssue);
  if (!Array.isArray(snapshot.nextActions)) throw new Error(`${label} nextActions 必須是陣列。`);
  const caseNames = new Set(names);
  snapshot.nextActions.forEach((item, index) => validateAction(item, index, caseNames));
  exactKeys(snapshot.summary, ['readyCases', 'reviewCases', 'blockedCases', 'errors', 'warnings'], `${label} summary`);
  const expectedSummary = {
    readyCases: snapshot.cases.filter(item => item.status === 'ready').length,
    reviewCases: snapshot.cases.filter(item => item.status === 'review').length,
    blockedCases: snapshot.cases.filter(item => item.status === 'blocked').length,
    errors: snapshot.issues.filter(item => item.level === 'error').length,
    warnings: snapshot.issues.filter(item => item.level === 'warn').length,
  };
  if (JSON.stringify(snapshot.summary) !== JSON.stringify(expectedSummary)) throw new Error(`${label} summary 與案件／問題內容不一致。`);
  const expectedStatus = expectedSummary.errors || expectedSummary.blockedCases ? 'blocked' : expectedSummary.reviewCases ? 'review' : 'ready';
  if (snapshot.status !== expectedStatus) throw new Error(`${label} status 與摘要不一致。`);
  const expectedTriage = Portfolio.buildTriage(snapshot.cases, snapshot.issues);
  if (History.canonicalJson(snapshot.triage) !== History.canonicalJson(expectedTriage)) throw new Error(`${label} triage 無法由案件與問題重新建立。`);
  return snapshot;
}

function casePriority(snapshot, caseName, status) {
  const levels = snapshot.triage.groups
    .filter(group => group.cases.includes(caseName))
    .map(group => PRIORITY_LEVEL[group.priority]);
  if (levels.length) return `P${Math.min(...levels)}`;
  return status === 'blocked' ? 'P0' : status === 'review' ? 'P2' : 'none';
}

function difference(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter(item => !rightSet.has(item)).sort();
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCase(previous, current, previousSnapshot, currentSnapshot) {
  let change;
  if (!previous) change = 'added';
  else if (!current) change = 'removed';
  else if (STATUS_LEVEL[current.status] > STATUS_LEVEL[previous.status]) change = 'regressed';
  else if (STATUS_LEVEL[current.status] < STATUS_LEVEL[previous.status]) change = 'improved';
  else if (History.canonicalJson(previous) !== History.canonicalJson(current)) change = 'changed';
  else change = 'unchanged';
  return {
    caseName: (current || previous).caseName,
    change,
    previousStatus: previous?.status || 'missing',
    currentStatus: current?.status || 'missing',
    previousPriority: previous ? casePriority(previousSnapshot, previous.caseName, previous.status) : 'none',
    currentPriority: current ? casePriority(currentSnapshot, current.caseName, current.status) : 'none',
    previousCaseFingerprint: previous?.caseFingerprint || '',
    currentCaseFingerprint: current?.caseFingerprint || '',
    addedIssueCodes: difference(current?.issueCodes || [], previous?.issueCodes || []),
    resolvedIssueCodes: difference(previous?.issueCodes || [], current?.issueCodes || []),
    addedActionCodes: difference(current?.nextActionCodes || [], previous?.nextActionCodes || []),
    resolvedActionCodes: difference(previous?.nextActionCodes || [], current?.nextActionCodes || []),
  };
}

function sourcesUnchanged(records) {
  try {
    return records.every(record => crypto.createHash('sha256').update(fs.readFileSync(record.path, 'utf8'), 'utf8').digest('hex') === record.rawHash);
  } catch (error) { return false; }
}

function comparisonFingerprint(previous, current, changes, issues) {
  const payload = {
    previous: previous.portfolioFingerprint,
    current: current.portfolioFingerprint,
    changes,
    issues: issues.map(item => ({ level: item.level, code: item.code })),
  };
  return `CMP-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function compareSnapshots(previousSnapshot, currentSnapshot, options = {}) {
  validateSnapshot(previousSnapshot, '前次總覽');
  validateSnapshot(currentSnapshot, '目前總覽');
  const previousMap = new Map(previousSnapshot.cases.map(item => [item.caseName, item]));
  const currentMap = new Map(currentSnapshot.cases.map(item => [item.caseName, item]));
  const names = [...new Set([...previousMap.keys(), ...currentMap.keys()])].sort();
  const changes = names.map(name => compareCase(previousMap.get(name), currentMap.get(name), previousSnapshot, currentSnapshot))
    .sort((left, right) => CHANGE_ORDER[left.change] - CHANGE_ORDER[right.change] || compareOrdinal(left.caseName, right.caseName));
  const summary = {
    added: changes.filter(item => item.change === 'added').length,
    removed: changes.filter(item => item.change === 'removed').length,
    improved: changes.filter(item => item.change === 'improved').length,
    regressed: changes.filter(item => item.change === 'regressed').length,
    changed: changes.filter(item => item.change === 'changed').length,
    unchanged: changes.filter(item => item.change === 'unchanged').length,
    portfolioChanged: previousSnapshot.portfolioFingerprint !== currentSnapshot.portfolioFingerprint,
  };
  const issues = [];
  if (options.sourcesStable === false) issues.push({ level: 'error', code: 'comparison-source-changed-during-read', message: '比較期間輸入快照發生變更。' });
  const meaningfulChange = summary.added + summary.removed + summary.improved + summary.regressed + summary.changed > 0 || summary.portfolioChanged;
  const addedBlocked = changes.some(item => item.change === 'added' && item.currentStatus === 'blocked');
  const status = issues.length || currentSnapshot.status === 'blocked' || summary.regressed || addedBlocked
    ? 'blocked'
    : currentSnapshot.status === 'review' || meaningfulChange ? 'review' : 'ready';
  const nextActions = [];
  const namesFor = type => changes.filter(item => item.change === type).map(item => item.caseName);
  if (issues.length) nextActions.push({ code: 'rerun-after-snapshots-stable', message: '固定兩份總覽 JSON 後重新比較。', cases: [] });
  if (currentSnapshot.status === 'blocked') nextActions.push({ code: 'repair-current-portfolio', message: '目前總覽仍有 blocked 案件；先依目前批次總覽處理。', cases: currentSnapshot.cases.filter(item => item.status === 'blocked').map(item => item.caseName) });
  if (summary.regressed) nextActions.push({ code: 'review-regressions', message: '優先查明狀態惡化案件。', cases: namesFor('regressed') });
  if (summary.added) nextActions.push({ code: 'review-added-cases', message: '確認新增案件已納入正確上層與治理流程。', cases: namesFor('added') });
  if (summary.removed) nextActions.push({ code: 'confirm-removed-cases', message: '確認案件移除是預期歸檔或移轉，不是遺漏。', cases: namesFor('removed') });
  if (summary.improved) nextActions.push({ code: 'confirm-improvements', message: '確認改善案件的修復證據已完成內部複核。', cases: namesFor('improved') });
  if (summary.changed) nextActions.push({ code: 'review-same-status-changes', message: '確認狀態未變但內容指紋或處置原因改變的案件。', cases: namesFor('changed') });
  if (!nextActions.length) nextActions.push({ code: 'archive-stable-comparison', message: '兩次完整總覽內容相同，可保存本次唯讀比較結果供內部追溯。', cases: [] });
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立比較時間。');
  const result = {
    schemaVersion: 1,
    kind: COMPARISON_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    comparisonFingerprint: '',
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      modifiesSourceSnapshots: false,
      instruction: COMPARISON_BOUNDARY_INSTRUCTION,
    },
    sources: {
      previous: { fileName: options.previousFileName || '', generatedAt: previousSnapshot.generatedAt, status: previousSnapshot.status, portfolioFingerprint: previousSnapshot.portfolioFingerprint, caseCount: previousSnapshot.discovery.caseCount },
      current: { fileName: options.currentFileName || '', generatedAt: currentSnapshot.generatedAt, status: currentSnapshot.status, portfolioFingerprint: currentSnapshot.portfolioFingerprint, caseCount: currentSnapshot.discovery.caseCount },
    },
    summary,
    changes,
    issues,
    nextActions,
  };
  result.comparisonFingerprint = comparisonFingerprint(previousSnapshot, currentSnapshot, changes, issues);
  return result;
}

function compareFiles(previousPath, currentPath, options = {}) {
  const previous = readSnapshotFile(previousPath, '前次總覽 JSON');
  const current = readSnapshotFile(currentPath, '目前總覽 JSON');
  const prepared = compareSnapshots(previous.snapshot, current.snapshot, {
    ...options,
    previousFileName: previous.fileName,
    currentFileName: current.fileName,
  });
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ previous, current, prepared });
  if (sourcesUnchanged([previous, current])) return prepared;
  return compareSnapshots(previous.snapshot, current.snapshot, {
    ...options,
    previousFileName: previous.fileName,
    currentFileName: current.fileName,
    sourcesStable: false,
  });
}

function formatSummary(result) {
  const label = result.status === 'ready' ? '內容穩定且目前批次 ready' : result.status === 'review' ? '差異需人工確認' : '目前批次或差異有阻擋';
  const lines = [
    '多案件附件治理快照唯讀比較',
    `狀態：${label}`,
    `前次：${result.sources.previous.fileName}；${result.sources.previous.status}；${result.sources.previous.portfolioFingerprint}`,
    `目前：${result.sources.current.fileName}；${result.sources.current.status}；${result.sources.current.portfolioFingerprint}`,
    `差異：新增 ${result.summary.added}；移除 ${result.summary.removed}；改善 ${result.summary.improved}；惡化 ${result.summary.regressed}；同狀態變更 ${result.summary.changed}；未變 ${result.summary.unchanged}`,
    `比較指紋：${result.comparisonFingerprint}`,
  ];
  result.changes.filter(item => item.change !== 'unchanged').forEach(item => lines.push(`- ${item.caseName}：${item.change}；${item.previousStatus}/${item.previousPriority} → ${item.currentStatus}/${item.currentPriority}`));
  result.issues.forEach(item => lines.push(`- 阻擋 [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(COMPARISON_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--previous' || arg === '--current') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少 JSON 路徑。`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio-compare.js --previous <前次完整總覽.json> --current <目前完整總覽.json> [--json]',
    '只接受未套用 --only-actionable 或 --priority 的完整多案件總覽 JSON。',
    '比較固定唯讀；結果不會修改、核可或推進任何案件。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.previous || !options.current) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = compareFiles(options.previous, options.current, options);
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
  COMPARISON_KIND,
  COMPARISON_BOUNDARY_INSTRUCTION,
  MAX_SNAPSHOT_BYTES,
  plainObject,
  exactKeys,
  safeName,
  validateStringArray,
  readSnapshotFile,
  validateCase,
  validateIssue,
  validateAction,
  validateSnapshot,
  casePriority,
  difference,
  compareOrdinal,
  compareCase,
  sourcesUnchanged,
  comparisonFingerprint,
  compareSnapshots,
  compareFiles,
  formatSummary,
  parseArgs,
  usage,
};
