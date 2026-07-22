'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Index = require('./attachment-case-governance-portfolio-snapshot-index.js');
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');
const Checkpoint = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js');

const HISTORY_STATE_KIND = 'formal-attachment-case-governance-trend-disposition-checkpoint-history-state.v1';
const HISTORY_BOUNDARY_INSTRUCTION = '本結果只供內部驗證趨勢處置可信檢查點歷程；必須明確指定受信任的 TAC 終點，不得自動猜選最新檔，不得放入計算書、主報告或正式附件包，不代表正式附件核可、工程狀態改善、數位簽章或防竄改儲存，亦不得發布至 Pages。';
const MAX_HISTORY_FILES = 1000;
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });

function maxStatus(...statuses) {
  return statuses.filter(status => Object.prototype.hasOwnProperty.call(STATUS_LEVEL, status))
    .reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function historyBoundary() {
  return {
    classification: 'internal-trusted-disposition-checkpoint-history-only',
    attachToFormalReport: false,
    formalAttachmentApproval: false,
    modifiesCheckpoints: false,
    overridesCurrentStatus: false,
    pagesPublication: false,
    instruction: HISTORY_BOUNDARY_INSTRUCTION,
  };
}

function validateHistoryBoundary(snapshotDirectory, ledgerDirectory, historyDirectory, headPath) {
  const sources = Disposition.validateLedgerBoundary(snapshotDirectory, ledgerDirectory);
  const resolvedHistory = path.resolve(historyDirectory || '');
  const resolvedHead = path.resolve(headPath || '');
  if (!historyDirectory) throw new Error('必須指定可信檢查點歷程資料夾。');
  if (!headPath) throw new Error('必須明確指定受信任的 TAC 終點檔案。');
  for (const source of [sources.resolvedSnapshots, sources.resolvedLedger]) {
    if (Builder.isPathInside(source, resolvedHistory) || Builder.isPathInside(resolvedHistory, source)) {
      throw new Error('可信檢查點歷程必須與治理快照及處置紀錄完全分離。');
    }
  }
  Snapshot.validatePhysicalDirectory(resolvedHistory, '可信檢查點歷程資料夾');
  if (!Snapshot.samePath(path.dirname(resolvedHead), resolvedHistory)) throw new Error('受信任的 TAC 終點必須是歷程資料夾中的直接檔案。');
  return { ...sources, resolvedHistory, resolvedHead };
}

function recordKey(item) {
  return `${item.checkpoint.checkpointFingerprint}\u0000${item.rawHash}\u0000${item.fileName}`;
}

function previousKey(checkpoint) {
  return `${checkpoint.previousCheckpoint.checkpointFingerprint}\u0000${checkpoint.previousCheckpoint.sha256}\u0000${checkpoint.previousCheckpoint.fileName}`;
}

function orderCheckpointChain(records) {
  const initials = records.filter(item => item.checkpoint.decision.action === 'initial');
  if (initials.length !== 1) throw new Error('可信檢查點歷程必須恰有一份初始檢查點。');
  const byKey = new Map(records.map(item => [recordKey(item), item]));
  if (byKey.size !== records.length) throw new Error('可信檢查點歷程含重複檢查點身分。');
  const children = new Map(records.map(item => [recordKey(item), []]));
  records.filter(item => item.checkpoint.decision.action === 'advance').forEach(item => {
    const parent = byKey.get(previousKey(item.checkpoint));
    if (!parent) throw new Error('可信檢查點歷程缺少前一檢查點或前一檔案已被替換。');
    children.get(recordKey(parent)).push(item);
  });
  for (const childList of children.values()) {
    if (childList.length > 1) throw new Error('可信檢查點歷程發生分叉。');
  }
  const ordered = [];
  let current = initials[0];
  const visited = new Set();
  while (current) {
    const key = recordKey(current);
    if (visited.has(key)) throw new Error('可信檢查點歷程發生循環。');
    visited.add(key);
    ordered.push(current);
    current = children.get(key)[0] || null;
  }
  if (ordered.length !== records.length) throw new Error('可信檢查點歷程含未連接的檔案。');
  ordered.forEach((item, index) => {
    if (!index) return;
    const previous = ordered[index - 1];
    if (Date.parse(item.checkpoint.generatedAt) < Date.parse(previous.checkpoint.generatedAt)) throw new Error('可信檢查點歷程時間不得倒退。');
    if (History.canonicalJson(item.checkpoint.scope) !== History.canonicalJson(previous.checkpoint.scope)) throw new Error('可信檢查點歷程的案件與資料夾範圍不得改變。');
    const previousReceipts = previous.checkpoint.receipts;
    const currentReceipts = item.checkpoint.receipts;
    if (currentReceipts.length <= previousReceipts.length) throw new Error('前進檢查點的收據數必須增加。');
    if (History.canonicalJson(currentReceipts.slice(0, previousReceipts.length)) !== History.canonicalJson(previousReceipts)) throw new Error('前進檢查點未完整保留前一份收據前綴。');
    if (item.checkpoint.decision.acceptedAdditionCount !== currentReceipts.length - previousReceipts.length) throw new Error('前進檢查點接受新增數與實際差異不一致。');
  });
  return ordered;
}

function checkpointHistoryFingerprint(records) {
  const payload = records.map((item, index) => ({
    position: index + 1,
    fileName: item.fileName,
    sha256: item.rawHash,
    checkpointFingerprint: item.checkpoint.checkpointFingerprint,
    generatedAt: item.checkpoint.generatedAt,
    action: item.checkpoint.decision.action,
    ledgerFingerprint: item.checkpoint.ledger.ledgerFingerprint,
    receiptCount: item.checkpoint.ledger.receiptCount,
    terminalReceiptFingerprint: item.checkpoint.ledger.terminalReceiptFingerprint,
  }));
  return `TCH-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function readCheckpointHistoryStrict(historyDirectory, headPath, options = {}) {
  const resolvedHistory = path.resolve(historyDirectory || '');
  const resolvedHead = path.resolve(headPath || '');
  Snapshot.validatePhysicalDirectory(resolvedHistory, '可信檢查點歷程資料夾');
  if (!Snapshot.samePath(path.dirname(resolvedHead), resolvedHistory)) throw new Error('受信任的 TAC 終點必須是歷程資料夾中的直接檔案。');
  const signatureBefore = Index.directorySignature(resolvedHistory);
  const entries = fs.readdirSync(resolvedHistory).sort(Index.compareOrdinal);
  if (!entries.length) throw new Error('可信檢查點歷程不得為空。');
  if (entries.length > MAX_HISTORY_FILES) throw new Error(`可信檢查點歷程超過 ${MAX_HISTORY_FILES} 份上限。`);
  const records = entries.map(name => {
    const filePath = path.join(resolvedHistory, name);
    const stat = fs.lstatSync(filePath, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || path.extname(name).toLowerCase() !== '.json') throw new Error(`可信檢查點歷程含非實體 JSON 項目：${name}`);
    if (String(stat.nlink) !== '1') throw new Error(`可信檢查點有其他硬連結別名：${name}`);
    return Checkpoint.readCheckpointFile(filePath);
  });
  const ordered = orderCheckpointChain(records);
  const headIndex = ordered.findIndex(item => Snapshot.samePath(item.path, resolvedHead));
  if (headIndex < 0) throw new Error('明確指定的受信任 TAC 終點不存在於檢查點歷程。');
  const relation = headIndex === ordered.length - 1 ? 'trusted-head-is-terminal' : 'trusted-head-behind-history';
  const status = relation === 'trusted-head-is-terminal' ? 'ready' : 'review';
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ resolvedHistory, resolvedHead, records: ordered });
  let stable = false;
  try {
    stable = History.canonicalJson(signatureBefore) === History.canonicalJson(Index.directorySignature(resolvedHistory))
      && Compare.sourcesUnchanged(ordered);
  } catch (error) { stable = false; }
  if (!stable) throw new Error('可信檢查點歷程在讀取期間發生變更。');
  return {
    resolved: resolvedHistory,
    directoryName: path.basename(resolvedHistory),
    status,
    relation,
    historyFingerprint: checkpointHistoryFingerprint(ordered),
    records: ordered,
    headIndex,
    head: ordered[headIndex],
    terminal: ordered.at(-1),
    signature: signatureBefore,
  };
}

function historyStateFingerprint(result) {
  const payload = {
    status: result.status,
    integrityStatus: result.integrityStatus,
    currentCheckpointStatus: result.currentCheckpointStatus,
    dispositionFingerprint: result.dispositionFingerprint,
    historyFingerprint: result.historyFingerprint,
    head: result.head,
    summary: result.summary,
    issues: result.issues.map(item => ({ level: item.level, code: item.code })),
  };
  return `THS-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildHistoryState(disposition, history, currentCheckpointState, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立可信檢查點歷程狀態時間。');
  const invalid = Boolean(options.errorCode);
  const integrityStatus = invalid ? 'blocked' : history.status;
  const currentCheckpointStatus = currentCheckpointState?.checkpointStatus || 'blocked';
  const status = maxStatus(disposition.status, integrityStatus, currentCheckpointStatus);
  const issues = [];
  if (invalid) issues.push({ level: 'error', code: options.errorCode, message: '可信檢查點歷程、指定終點或其鏈結未通過封閉驗證。' });
  else if (history.status === 'review') issues.push({ level: 'warn', code: 'trusted-head-behind-checkpoint-history', message: '指定的受信任終點之後仍有合法檢查點，需人工確認後改為明確指定新的終點。' });
  const head = history?.head;
  const terminal = history?.terminal;
  const result = {
    schemaVersion: 1,
    kind: HISTORY_STATE_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    integrityStatus,
    currentCheckpointStatus,
    historyStateFingerprint: '',
    dispositionFingerprint: disposition.dispositionFingerprint,
    historyFingerprint: history?.historyFingerprint || '',
    groupName: disposition.groupName,
    snapshotDirectoryName: disposition.snapshotDirectoryName,
    ledgerDirectoryName: disposition.ledgerDirectoryName,
    historyDirectoryName: history?.directoryName || '',
    boundary: historyBoundary(),
    summary: {
      checkpointCount: history?.records.length || 0,
      trustedHeadPosition: head ? history.headIndex + 1 : 0,
      checkpointsAfterTrustedHead: head ? history.records.length - history.headIndex - 1 : 0,
      anchoredReceiptCount: head?.checkpoint.ledger.receiptCount || 0,
      terminalReceiptCount: terminal?.checkpoint.ledger.receiptCount || 0,
    },
    head: {
      relation: invalid ? 'invalid' : history.relation,
      fileName: head?.fileName || '',
      checkpointFingerprint: head?.checkpoint.checkpointFingerprint || '',
      sha256: head?.rawHash || '',
      terminalCheckpointFingerprint: terminal?.checkpoint.checkpointFingerprint || '',
    },
    issues,
    nextActions: [],
  };
  if (invalid) result.nextActions.push({ code: 'repair-trusted-checkpoint-history', message: '依明確指定的受信任 TAC 終點還原缺檔、替換、分叉或回退；不得改指較舊檔案掩蓋缺失。' });
  else if (history.status === 'review') result.nextActions.push({ code: 'advance-designated-trusted-head', message: '人工確認終點後，將後續合法檢查點中的目標檔明確指定為新的受信任終點。' });
  else if (currentCheckpointState.status !== 'ready') result.nextActions.push(...currentCheckpointState.nextActions);
  else result.nextActions.push({ code: 'retain-designated-trusted-head', message: '歷程完整且指定終點為唯一鏈尾，請持續保護並固定使用這個明確路徑。' });
  result.historyStateFingerprint = historyStateFingerprint(result);
  return result;
}

function inspectCheckpointHistory(snapshotDirectory, ledgerDirectory, historyDirectory, headPath, options = {}) {
  const boundary = validateHistoryBoundary(snapshotDirectory, ledgerDirectory, historyDirectory, headPath);
  const disposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
  let history;
  let checkpointState;
  try {
    history = readCheckpointHistoryStrict(boundary.resolvedHistory, boundary.resolvedHead);
    checkpointState = Checkpoint.inspectCheckpointState(boundary.resolvedSnapshots, boundary.resolvedLedger, boundary.resolvedHead, { now: options.now });
  } catch (error) {
    return buildHistoryState(disposition, null, null, { now: options.now, errorCode: 'invalid-trusted-checkpoint-history' });
  }
  if (history.head.checkpoint.scope.groupName !== disposition.groupName
      || history.head.checkpoint.scope.snapshotDirectoryName !== disposition.snapshotDirectoryName
      || history.head.checkpoint.scope.ledgerDirectoryName !== disposition.ledgerDirectoryName) {
    return buildHistoryState(disposition, history, checkpointState, { now: options.now, errorCode: 'trusted-checkpoint-history-scope-mismatch' });
  }
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ boundary, disposition, history, checkpointState });
  let stable = false;
  try {
    const confirmedDisposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
    const confirmedHistory = readCheckpointHistoryStrict(boundary.resolvedHistory, boundary.resolvedHead);
    const confirmedCheckpoint = Checkpoint.inspectCheckpointState(boundary.resolvedSnapshots, boundary.resolvedLedger, boundary.resolvedHead, { now: options.now });
    stable = confirmedDisposition.dispositionFingerprint === disposition.dispositionFingerprint
      && confirmedHistory.historyFingerprint === history.historyFingerprint
      && confirmedHistory.head.rawHash === history.head.rawHash
      && confirmedCheckpoint.checkpointStateFingerprint === checkpointState.checkpointStateFingerprint;
  } catch (error) { stable = false; }
  if (!stable) return buildHistoryState(disposition, history, checkpointState, { now: options.now, errorCode: 'trusted-checkpoint-history-sources-changed' });
  return buildHistoryState(disposition, history, checkpointState, { now: options.now });
}

function formatSummary(result) {
  const lines = [
    '多案件治理趨勢處置可信檢查點歷程',
    `狀態：${result.status}；歷程完整性：${result.integrityStatus}；目前檢查點：${result.currentCheckpointStatus}`,
    `檢查點：${result.summary.checkpointCount} 份；受信任終點位置 ${result.summary.trustedHeadPosition}；其後 ${result.summary.checkpointsAfterTrustedHead} 份`,
    `終點關係：${result.head.relation}`,
    `歷程指紋：${result.historyFingerprint || '無法建立'}`,
    `歷程狀態指紋：${result.historyStateFingerprint}`,
  ];
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '阻擋' : '提醒'} [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(HISTORY_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`參數 ${arg} 缺少值。`);
      index += 1;
      return next;
    };
    if (arg === '--directory') options.directory = value();
    else if (arg === '--ledger') options.ledger = value();
    else if (arg === '--history') options.history = value();
    else if (arg === '--head') options.head = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js --directory <治理快照資料夾> --ledger <內部處置紀錄資料夾> --history <可信檢查點歷程資料夾> --head <明確指定的受信任 TAC 終點 JSON> [--json]',
    '指定終點必須是歷程資料夾中的直接實體檔案；不得自動猜選最新檢查點。',
    '缺檔、替換、分叉、回退或終點不存在均 blocked；終點之後只有合法新增時為 review。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.directory || !options.ledger || !options.history || !options.head) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = inspectCheckpointHistory(options.directory, options.ledger, options.history, options.head, options);
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
  HISTORY_STATE_KIND,
  HISTORY_BOUNDARY_INSTRUCTION,
  MAX_HISTORY_FILES,
  maxStatus,
  historyBoundary,
  validateHistoryBoundary,
  recordKey,
  previousKey,
  orderCheckpointChain,
  checkpointHistoryFingerprint,
  readCheckpointHistoryStrict,
  historyStateFingerprint,
  buildHistoryState,
  inspectCheckpointHistory,
  formatSummary,
  parseArgs,
  usage,
  main,
};
