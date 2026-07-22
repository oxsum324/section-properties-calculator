'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');
const History = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Index = require('./attachment-case-governance-portfolio-snapshot-index.js');
const Trend = require('./attachment-case-governance-portfolio-snapshot-trend.js');

const DISPOSITION_KIND = 'formal-attachment-case-governance-trend-disposition.v1';
const DISPOSITION_STATE_KIND = 'formal-attachment-case-governance-trend-disposition-state.v1';
const DISPOSITION_BOUNDARY_INSTRUCTION = '本處置紀錄只供內部確認治理趨勢中的預期移除或反覆提醒；不得覆蓋目前工程／文件狀態，不得放入計算書、主報告或正式附件包，不代表正式附件核可、版本前進、風險評分或數位簽章，亦不得發布至 Pages。';
const MAX_LEDGER_FILES = 1000;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const TARGET_TYPES = Object.freeze(['case-removal', 'recurring-issue']);
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });
const ATTENTION_LEVEL = Object.freeze({ P0: 0, P1: 1, P2: 2, none: 9 });
const RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'sequence', 'acknowledgedAt', 'trendFingerprint', 'indexFingerprint',
  'groupName', 'latestPortfolioFingerprint', 'targets', 'decision', 'previousReceiptFingerprint',
  'receiptFingerprint', 'boundary',
]);
const TARGET_FIELDS = Object.freeze(['type', 'key', 'evidenceAt', 'evidenceFingerprint']);
const DECISION_FIELDS = Object.freeze(['reviewer', 'basis', 'formalAttachmentApproval']);
const BOUNDARY_FIELDS = Object.freeze([
  'classification', 'attachToFormalReport', 'formalAttachmentApproval', 'modifiesSnapshots',
  'overridesCurrentStatus', 'pagesPublication', 'instruction',
]);

function maxStatus(...statuses) {
  return statuses.filter(status => Object.prototype.hasOwnProperty.call(STATUS_LEVEL, status))
    .reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function normalizeReviewText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label}必須為 1 至 ${maxLength} 個可顯示字元。`);
  return text;
}

function validateFingerprint(value, prefix, label) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}-[0-9A-F]{24}$`).test(value)) throw new Error(`${label}指紋無效。`);
}

function targetId(target) {
  return `${target.type}\u0000${target.key}\u0000${target.evidenceAt}\u0000${target.evidenceFingerprint}`;
}

function compareTargets(left, right) {
  return Index.compareOrdinal(targetId(left), targetId(right));
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets) || !targets.length) throw new Error('至少需要一個趨勢處置目標。');
  const normalized = targets.map((target, index) => {
    Compare.exactKeys(target, TARGET_FIELDS, `處置目標 targets[${index}]`);
    if (!TARGET_TYPES.includes(target.type)) throw new Error(`處置目標 targets[${index}] 類型無效。`);
    if (target.type === 'case-removal') Compare.safeName(target.key, `處置目標 targets[${index}]`);
    else if (typeof target.key !== 'string' || !target.key || target.key.length > 200 || /[\u0000-\u001f\u007f]/.test(target.key)) throw new Error(`處置目標 targets[${index}] 問題代碼無效。`);
    if (typeof target.evidenceAt !== 'string' || !Number.isFinite(Date.parse(target.evidenceAt))) throw new Error(`處置目標 targets[${index}] 證據時間無效。`);
    validateFingerprint(target.evidenceFingerprint, 'DTE', '處置目標證據');
    return { type: target.type, key: target.key, evidenceAt: new Date(target.evidenceAt).toISOString(), evidenceFingerprint: target.evidenceFingerprint };
  }).sort(compareTargets);
  if (new Set(normalized.map(targetId)).size !== normalized.length) throw new Error('趨勢處置目標不得重複。');
  return normalized;
}

function dispositionBoundary() {
  return {
    classification: 'internal-governance-trend-disposition-only',
    attachToFormalReport: false,
    formalAttachmentApproval: false,
    modifiesSnapshots: false,
    overridesCurrentStatus: false,
    pagesPublication: false,
    instruction: DISPOSITION_BOUNDARY_INSTRUCTION,
  };
}

function receiptFingerprint(record) {
  const payload = { ...record };
  delete payload.receiptFingerprint;
  return `TRA-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function validateReceipt(record) {
  Compare.exactKeys(record, RECEIPT_FIELDS, '趨勢處置收據');
  if (record.schemaVersion !== 1 || record.kind !== DISPOSITION_KIND) throw new Error('趨勢處置收據版本或種類不受支援。');
  if (!Number.isSafeInteger(record.sequence) || record.sequence < 1 || record.sequence > MAX_LEDGER_FILES) throw new Error('趨勢處置收據序號無效。');
  if (typeof record.acknowledgedAt !== 'string' || !Number.isFinite(Date.parse(record.acknowledgedAt)) || new Date(record.acknowledgedAt).toISOString() !== record.acknowledgedAt) throw new Error('趨勢處置收據確認時間無效。');
  validateFingerprint(record.trendFingerprint, 'TRD', '趨勢');
  validateFingerprint(record.indexFingerprint, 'PSI', '索引');
  validateFingerprint(record.latestPortfolioFingerprint, 'POR', '最新批次');
  Compare.safeName(record.groupName, '案件群組');
  const normalizedTargets = normalizeTargets(record.targets);
  if (History.canonicalJson(normalizedTargets) !== History.canonicalJson(record.targets)) throw new Error('趨勢處置目標必須排序並使用標準時間格式。');
  Compare.exactKeys(record.decision, DECISION_FIELDS, '內部處置決定');
  if (normalizeReviewText(record.decision.reviewer, '內部複核人', 80) !== record.decision.reviewer
      || normalizeReviewText(record.decision.basis, '內部複核依據', 500) !== record.decision.basis) {
    throw new Error('內部處置決定必須使用已去除首尾空白的標準文字。');
  }
  if (record.decision.formalAttachmentApproval !== false) throw new Error('趨勢處置不得宣稱正式附件核可。');
  if (record.sequence === 1) {
    if (record.previousReceiptFingerprint !== '') throw new Error('第一份趨勢處置收據不得引用前一收據。');
  } else validateFingerprint(record.previousReceiptFingerprint, 'TRA', '前一收據');
  validateFingerprint(record.receiptFingerprint, 'TRA', '處置收據');
  Compare.exactKeys(record.boundary, BOUNDARY_FIELDS, '趨勢處置邊界');
  if (History.canonicalJson(record.boundary) !== History.canonicalJson(dispositionBoundary())) throw new Error('趨勢處置邊界無效。');
  if (receiptFingerprint(record) !== record.receiptFingerprint) throw new Error('趨勢處置收據指紋不一致。');
  return record;
}

function receiptFileName(record) {
  validateReceipt(record);
  return `trend-disposition-${String(record.sequence).padStart(6, '0')}-${Snapshot.timestampToken(record.acknowledgedAt)}-${record.receiptFingerprint}.json`;
}

function readReceiptFile(filePath, options = {}) {
  const resolved = path.resolve(filePath || '');
  const stat = fs.lstatSync(resolved, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('趨勢處置收據必須是實體 JSON 檔案。');
  if (String(stat.nlink) !== '1') throw new Error('趨勢處置收據不得有其他硬連結別名。');
  if (stat.size <= 0 || stat.size > MAX_RECEIPT_BYTES) throw new Error('趨勢處置收據大小超出限制。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!Snapshot.samePath(realPath, resolved)) throw new Error('趨勢處置收據不得透過連結重新導向。');
  const raw = fs.readFileSync(resolved, 'utf8');
  const duplicates = Verifier.findDuplicateJsonKeys(raw);
  if (duplicates.length) throw new Error('趨勢處置收據含重複 JSON 欄位。');
  let receipt;
  try { receipt = JSON.parse(raw); } catch (error) { throw new Error('趨勢處置收據不是有效 JSON。'); }
  validateReceipt(receipt);
  const expectedName = receiptFileName(receipt);
  if (options.checkFileName !== false && path.basename(resolved) !== expectedName) throw new Error('趨勢處置收據檔名與內容不一致。');
  return {
    path: resolved,
    fileName: path.basename(resolved),
    rawHash: crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
    receipt,
  };
}

function validateLedgerBoundary(snapshotDirectory, ledgerDirectory) {
  const resolvedSnapshots = path.resolve(snapshotDirectory || '');
  const resolvedLedger = path.resolve(ledgerDirectory || '');
  if (!ledgerDirectory) throw new Error('必須指定內部趨勢處置紀錄資料夾。');
  Snapshot.validatePhysicalDirectory(resolvedSnapshots, '治理快照資料夾');
  if (Builder.isPathInside(resolvedSnapshots, resolvedLedger) || Builder.isPathInside(resolvedLedger, resolvedSnapshots)) {
    throw new Error('趨勢處置紀錄資料夾與治理快照資料夾必須完全分離。');
  }
  Snapshot.validatePhysicalDirectory(Snapshot.nearestExistingAncestor(resolvedLedger), '處置紀錄的既有上層');
  if (fs.existsSync(resolvedLedger)) Snapshot.validatePhysicalDirectory(resolvedLedger, '趨勢處置紀錄資料夾');
  return { resolvedSnapshots, resolvedLedger };
}

function ledgerFingerprint(records) {
  const payload = records.map(item => ({
    sequence: item.receipt.sequence,
    fileName: item.fileName,
    receiptFingerprint: item.receipt.receiptFingerprint,
    sha256: item.rawHash,
  }));
  return `TAI-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function targetEvidenceFingerprint(payload) {
  return `DTE-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function emptyLedger(resolved) {
  return {
    resolved,
    exists: false,
    directoryName: path.basename(resolved),
    status: 'ready',
    ledgerFingerprint: ledgerFingerprint([]),
    records: [],
    terminalReceiptFingerprint: '',
    signature: null,
  };
}

function readLedgerStrict(ledgerDirectory, options = {}) {
  const resolved = path.resolve(ledgerDirectory || '');
  if (!fs.existsSync(resolved)) return emptyLedger(resolved);
  Snapshot.validatePhysicalDirectory(resolved, '趨勢處置紀錄資料夾');
  const signatureBefore = Index.directorySignature(resolved);
  const entries = fs.readdirSync(resolved).sort(Index.compareOrdinal);
  if (entries.length > MAX_LEDGER_FILES) throw new Error(`趨勢處置紀錄超過 ${MAX_LEDGER_FILES} 份上限。`);
  const records = entries.map(name => {
    const filePath = path.join(resolved, name);
    const stat = fs.lstatSync(filePath, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || path.extname(name).toLowerCase() !== '.json') throw new Error(`趨勢處置紀錄資料夾含非實體 JSON 項目：${name}`);
    if (String(stat.nlink) !== '1') throw new Error(`趨勢處置收據有其他硬連結別名：${name}`);
    return readReceiptFile(filePath);
  }).sort((left, right) => left.receipt.sequence - right.receipt.sequence || Index.compareOrdinal(left.fileName, right.fileName));
  records.forEach((item, index) => {
    const expectedSequence = index + 1;
    if (item.receipt.sequence !== expectedSequence) throw new Error('趨勢處置收據序號必須由 1 連續遞增。');
    const previous = records[index - 1]?.receipt;
    const expectedPrevious = previous?.receiptFingerprint || '';
    if (item.receipt.previousReceiptFingerprint !== expectedPrevious) throw new Error('趨勢處置收據鏈前後指紋不一致。');
    if (previous && Date.parse(item.receipt.acknowledgedAt) < Date.parse(previous.acknowledgedAt)) throw new Error('趨勢處置收據時間不得倒退。');
  });
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ resolved, records });
  let stable = false;
  try {
    stable = History.canonicalJson(signatureBefore) === History.canonicalJson(Index.directorySignature(resolved))
      && Compare.sourcesUnchanged(records);
  } catch (error) { stable = false; }
  if (!stable) throw new Error('趨勢處置紀錄資料夾在讀取期間發生變更。');
  return {
    resolved,
    exists: true,
    directoryName: path.basename(resolved),
    status: 'ready',
    ledgerFingerprint: ledgerFingerprint(records),
    records,
    terminalReceiptFingerprint: records.at(-1)?.receipt.receiptFingerprint || '',
    signature: signatureBefore,
  };
}

function dispositionTargets(trend) {
  if (!trend.analysisComplete) return [];
  const targets = [];
  trend.caseTrends.filter(item => item.attentionReasons.includes('case-removed-from-current')).forEach(item => {
    if (item.missingSinceAt) targets.push({
      type: 'case-removal',
      key: item.caseName,
      evidenceAt: item.missingSinceAt,
      evidenceFingerprint: targetEvidenceFingerprint({ type: 'case-removal', caseName: item.caseName, missingSinceAt: item.missingSinceAt, lastSeenAt: item.lastSeenAt }),
    });
  });
  trend.issueTrends.filter(item => item.recurring && item.active && item.activeSinceAt).forEach(item => {
    const activeCases = trend.caseTrends.filter(caseItem => caseItem.activeIssueCodes.includes(item.code)).map(caseItem => caseItem.caseName).sort();
    targets.push({
      type: 'recurring-issue',
      key: item.code,
      evidenceAt: item.activeSinceAt,
      evidenceFingerprint: targetEvidenceFingerprint({ type: 'recurring-issue', code: item.code, activeSinceAt: item.activeSinceAt, activeCases, activeAtPortfolio: item.activeAtPortfolio }),
    });
  });
  return targets.sort(compareTargets);
}

function effectivePriority(reasons) {
  if (reasons.some(reason => ['current-blocked', 'latest-regression', 'current-priority-p0'].includes(reason))) return 'P0';
  if (reasons.includes('current-priority-p1')) return 'P1';
  return reasons.length ? 'P2' : 'none';
}

function stateFingerprint(result) {
  const payload = {
    trendFingerprint: result.trendFingerprint,
    ledgerFingerprint: result.ledger.ledgerFingerprint,
    targets: result.targets,
    caseAttention: result.caseAttention,
    issues: result.issues.map(item => ({ level: item.level, code: item.code })),
  };
  return `TDS-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildDispositionState(trend, ledger, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立趨勢處置狀態時間。');
  const issues = [];
  if (options.ledgerError) issues.push({ level: 'error', code: 'invalid-disposition-ledger', message: '趨勢處置紀錄資料夾無法通過封閉驗證。' });
  const candidates = dispositionTargets(trend);
  const candidateMap = new Map(candidates.map(item => [targetId(item), item]));
  const acknowledgements = new Map();
  const applicableReceipts = new Set();
  (ledger.records || []).forEach(record => record.receipt.targets.forEach(target => {
    const id = targetId(target);
    if (!candidateMap.has(id)) return;
    applicableReceipts.add(record.receipt.receiptFingerprint);
    if (acknowledgements.has(id)) {
      issues.push({ level: 'error', code: 'duplicate-active-disposition', message: '同一個目前處置目標有多份有效收據。' });
      return;
    }
    acknowledgements.set(id, record.receipt.receiptFingerprint);
  }));
  const targets = candidates.map(target => {
    const receipt = acknowledgements.get(targetId(target)) || '';
    return { ...target, acknowledged: Boolean(receipt), receiptFingerprint: receipt };
  });
  const targetByTypeKey = new Map(targets.map(target => [`${target.type}\u0000${target.key}`, target]));
  const caseAttention = trend.caseTrends.filter(item => item.attentionPriority !== 'none').map(item => {
    const remainingReasons = [...item.attentionReasons];
    const acknowledgedReasons = [];
    const receiptFingerprints = new Set();
    const removal = targetByTypeKey.get(`case-removal\u0000${item.caseName}`);
    if (removal?.acknowledged) {
      const index = remainingReasons.indexOf('case-removed-from-current');
      if (index >= 0) { remainingReasons.splice(index, 1); acknowledgedReasons.push('case-removed-from-current'); }
      receiptFingerprints.add(removal.receiptFingerprint);
    }
    const recurring = item.activeRecurringIssueCodes.map(code => targetByTypeKey.get(`recurring-issue\u0000${code}`)).filter(Boolean);
    if (item.activeRecurringIssueCodes.length && recurring.length === item.activeRecurringIssueCodes.length && recurring.every(target => target.acknowledged)) {
      const index = remainingReasons.indexOf('active-recurring-issue');
      if (index >= 0) { remainingReasons.splice(index, 1); acknowledgedReasons.push('active-recurring-issue'); }
      recurring.forEach(target => receiptFingerprints.add(target.receiptFingerprint));
    }
    return {
      caseName: item.caseName,
      rawPriority: item.attentionPriority,
      effectivePriority: effectivePriority(remainingReasons),
      acknowledgedReasons,
      remainingReasons,
      receiptFingerprints: [...receiptFingerprints].sort(),
    };
  }).sort((left, right) => ATTENTION_LEVEL[left.effectivePriority] - ATTENTION_LEVEL[right.effectivePriority]
    || ATTENTION_LEVEL[left.rawPriority] - ATTENTION_LEVEL[right.rawPriority]
    || Index.compareOrdinal(left.caseName, right.caseName));
  const effectiveAttentionStatus = !trend.analysisComplete
    ? 'not-available'
    : caseAttention.some(item => item.effectivePriority === 'P0') ? 'blocked'
      : caseAttention.some(item => ['P1', 'P2'].includes(item.effectivePriority)) || targets.some(item => !item.acknowledged) ? 'review' : 'ready';
  const ledgerStatus = issues.some(item => item.level === 'error') ? 'blocked' : 'ready';
  const status = trend.analysisComplete
    ? maxStatus(trend.integrityStatus, trend.currentHealth, trend.latestTransitionStatus, effectiveAttentionStatus, ledgerStatus)
    : maxStatus(trend.status, ledgerStatus);
  const receiptCount = ledger.records?.length || 0;
  const result = {
    schemaVersion: 1,
    kind: DISPOSITION_STATE_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    rawTrendStatus: trend.status,
    rawAttentionStatus: trend.attentionStatus,
    effectiveAttentionStatus,
    dispositionFingerprint: '',
    trendFingerprint: trend.trendFingerprint,
    indexFingerprint: trend.indexFingerprint,
    boundary: dispositionBoundary(),
    snapshotDirectoryName: trend.directoryName,
    ledgerDirectoryName: ledger.directoryName,
    groupName: trend.group?.groupName || '',
    latestPortfolioFingerprint: trend.group?.currentPortfolioFingerprint || '',
    summary: {
      receiptCount,
      applicableReceiptCount: applicableReceipts.size,
      staleReceiptCount: receiptCount - applicableReceipts.size,
      activeTargets: targets.length,
      acknowledgedTargets: targets.filter(item => item.acknowledged).length,
      unacknowledgedTargets: targets.filter(item => !item.acknowledged).length,
      rawAttentionP0: trend.summary.attentionP0,
      rawAttentionP1: trend.summary.attentionP1,
      rawAttentionP2: trend.summary.attentionP2,
      effectiveAttentionP0: caseAttention.filter(item => item.effectivePriority === 'P0').length,
      effectiveAttentionP1: caseAttention.filter(item => item.effectivePriority === 'P1').length,
      effectiveAttentionP2: caseAttention.filter(item => item.effectivePriority === 'P2').length,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn').length,
    },
    ledger: {
      status: ledgerStatus,
      ledgerFingerprint: ledger.ledgerFingerprint,
      receiptCount,
      terminalReceiptFingerprint: ledger.terminalReceiptFingerprint,
    },
    targets,
    caseAttention,
    issues,
    nextActions: [],
    publication: null,
  };
  if (ledgerStatus === 'blocked') result.nextActions.push({ code: 'repair-disposition-ledger', message: '修復處置收據鏈後重新檢查；不得用處置紀錄覆蓋目前狀態。' });
  else if (!trend.analysisComplete) result.nextActions.push({ code: 'capture-another-snapshot', message: '同一案件群組至少保存兩份有效快照後再建立處置紀錄。' });
  else if (result.summary.unacknowledgedTargets) result.nextActions.push({ code: 'review-trend-dispositions', message: '逐項確認預期移除或目前反覆提醒；只有明確人工處置後才建立收據。' });
  else if (status === 'blocked') result.nextActions.push({ code: 'resolve-current-blocking-state', message: '處置收據不能覆蓋目前 blocked 或最新惡化，請依最新治理總覽處理。' });
  else if (status === 'review') result.nextActions.push({ code: 'complete-current-review', message: '處置收據不能覆蓋目前 review 或最新變更，請完成目前內部複核。' });
  else result.nextActions.push({ code: 'retain-disposition-chain', message: '目前趨勢處置與來源狀態一致，可保留收據鏈供內部追溯。' });
  result.dispositionFingerprint = stateFingerprint(result);
  return result;
}

function inspectDispositionState(snapshotDirectory, ledgerDirectory, options = {}) {
  const boundary = validateLedgerBoundary(snapshotDirectory, ledgerDirectory);
  const trend = Trend.analyzeSnapshotTrend(boundary.resolvedSnapshots, { now: options.now });
  let ledger;
  let ledgerError = null;
  try { ledger = readLedgerStrict(boundary.resolvedLedger, options.ledgerOptions || {}); }
  catch (error) {
    ledgerError = error;
    ledger = emptyLedger(boundary.resolvedLedger);
    ledger.status = 'blocked';
  }
  const result = buildDispositionState(trend, ledger, { now: options.now, ledgerError });
  if (ledgerError) return result;
  if (typeof options.beforeStateFinalize === 'function') options.beforeStateFinalize({ boundary, trend, ledger, result });
  let stable = false;
  try {
    const confirmedTrend = Trend.analyzeSnapshotTrend(boundary.resolvedSnapshots, { now: options.now });
    const confirmedLedger = readLedgerStrict(boundary.resolvedLedger);
    stable = confirmedTrend.trendFingerprint === trend.trendFingerprint
      && confirmedLedger.ledgerFingerprint === ledger.ledgerFingerprint;
  } catch (error) { stable = false; }
  if (!stable) {
    result.issues.push({ level: 'error', code: 'disposition-sources-changed-during-read', message: '治理快照或趨勢處置收據鏈在組合判讀期間發生變更。' });
    result.status = 'blocked';
    result.summary.errors += 1;
    result.nextActions = [{ code: 'rerun-after-disposition-sources-stable', message: '固定治理快照與處置收據鏈後重新檢查。' }];
    result.dispositionFingerprint = stateFingerprint(result);
  }
  return result;
}

function requestedTargets(trend, options = {}) {
  const candidates = new Map(dispositionTargets(trend).map(target => [targetId(target), target]));
  const requested = [];
  [...new Set(options.caseRemovals || [])].forEach(caseName => {
    Compare.safeName(caseName, '預期移除案件');
    const target = [...candidates.values()].find(item => item.type === 'case-removal' && item.key === caseName);
    if (!target) throw new Error(`案件不是目前可確認的持續移除目標：${caseName}`);
    requested.push(target);
  });
  [...new Set(options.recurringIssues || [])].forEach(code => {
    const target = [...candidates.values()].find(item => item.type === 'recurring-issue' && item.key === code);
    if (!target) throw new Error(`問題不是目前可確認的持續反覆目標：${code}`);
    requested.push(target);
  });
  return normalizeTargets(requested);
}

function buildReceipt(trend, ledger, targets, options = {}) {
  const acknowledgedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(acknowledgedAt.getTime())) throw new Error('無法建立趨勢處置確認時間。');
  if (!trend.analysisComplete || trend.integrityStatus === 'blocked') throw new Error('治理快照趨勢尚未完整或來源已阻擋，不得建立處置收據。');
  if (Date.parse(trend.group.latestGeneratedAt) > acknowledgedAt.getTime()) throw new Error('趨勢處置確認時間不得早於最新治理快照。');
  const previous = ledger.records.at(-1)?.receipt;
  if (previous && Date.parse(previous.acknowledgedAt) > acknowledgedAt.getTime()) throw new Error('趨勢處置確認時間不得早於前一收據。');
  const record = {
    schemaVersion: 1,
    kind: DISPOSITION_KIND,
    sequence: ledger.records.length + 1,
    acknowledgedAt: acknowledgedAt.toISOString(),
    trendFingerprint: trend.trendFingerprint,
    indexFingerprint: trend.indexFingerprint,
    groupName: trend.group.groupName,
    latestPortfolioFingerprint: trend.group.currentPortfolioFingerprint,
    targets: normalizeTargets(targets),
    decision: {
      reviewer: normalizeReviewText(options.reviewer, '內部複核人', 80),
      basis: normalizeReviewText(options.basis, '內部複核依據', 500),
      formalAttachmentApproval: false,
    },
    previousReceiptFingerprint: previous?.receiptFingerprint || '',
    receiptFingerprint: '',
    boundary: dispositionBoundary(),
  };
  record.receiptFingerprint = receiptFingerprint(record);
  validateReceipt(record);
  return record;
}

function publishDisposition(snapshotDirectory, ledgerDirectory, options = {}) {
  const boundary = validateLedgerBoundary(snapshotDirectory, ledgerDirectory);
  const resolvedLedger = boundary.resolvedLedger;
  const parent = path.dirname(resolvedLedger);
  Snapshot.validatePhysicalDirectory(parent, '趨勢處置紀錄上層資料夾');
  const ledgerExisted = fs.existsSync(resolvedLedger);
  const lockPath = path.join(parent, `.${path.basename(resolvedLedger)}.trend-disposition.lock`);
  let lockHandle = null;
  let lockAcquired = false;
  let stagingPath = '';
  let stagingHandle = null;
  let publishedPath = '';
  const linkSync = options.linkSync || fs.linkSync;
  try {
    lockHandle = fs.openSync(lockPath, 'wx');
    lockAcquired = true;
    fs.mkdirSync(resolvedLedger, { recursive: true });
    Snapshot.validatePhysicalDirectory(resolvedLedger, '趨勢處置紀錄資料夾');
    const trend = Trend.analyzeSnapshotTrend(boundary.resolvedSnapshots, { now: options.now });
    const ledger = readLedgerStrict(resolvedLedger);
    if (ledger.records.length >= MAX_LEDGER_FILES) throw new Error('趨勢處置紀錄已達上限。');
    const targets = requestedTargets(trend, options);
    const currentState = buildDispositionState(trend, ledger, { now: options.now });
    const alreadyAcknowledged = new Set(currentState.targets.filter(item => item.acknowledged).map(item => targetId(item)));
    if (targets.some(target => alreadyAcknowledged.has(targetId(target)))) throw new Error('指定的趨勢處置目標已有有效收據，不得重複確認。');
    const receipt = buildReceipt(trend, ledger, targets, options);
    const fileName = receiptFileName(receipt);
    const targetPath = path.join(resolvedLedger, fileName);
    if (fs.existsSync(targetPath)) throw new Error(`同名趨勢處置收據已存在，不得覆寫：${fileName}`);
    stagingPath = path.join(parent, `.${fileName}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    stagingHandle = fs.openSync(stagingPath, 'wx');
    fs.writeFileSync(stagingHandle, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    fs.fsyncSync(stagingHandle);
    fs.closeSync(stagingHandle);
    stagingHandle = null;
    if (typeof options.beforeValidate === 'function') options.beforeValidate({ stagingPath, targetPath, receipt });
    const staged = readReceiptFile(stagingPath, { checkFileName: false });
    if (History.canonicalJson(staged.receipt) !== History.canonicalJson(receipt)) throw new Error('趨勢處置暫存收據自我驗證不一致。');
    const confirmedTrend = Trend.analyzeSnapshotTrend(boundary.resolvedSnapshots, { now: options.now });
    if (confirmedTrend.trendFingerprint !== trend.trendFingerprint) throw new Error('發布趨勢處置收據前，治理快照趨勢已改變。');
    const confirmedLedger = readLedgerStrict(resolvedLedger);
    if (confirmedLedger.ledgerFingerprint !== ledger.ledgerFingerprint) throw new Error('發布趨勢處置收據前，既有收據鏈已改變。');
    if (typeof options.beforePublish === 'function') options.beforePublish({ stagingPath, targetPath, receipt });
    if (fs.existsSync(targetPath)) throw new Error(`同名趨勢處置收據已存在，不得覆寫：${fileName}`);
    linkSync(stagingPath, targetPath);
    publishedPath = targetPath;
    fs.unlinkSync(stagingPath);
    stagingPath = '';
    readReceiptFile(targetPath);
    if (typeof options.afterPublish === 'function') options.afterPublish({ targetPath, receipt });
    const afterTrend = Trend.analyzeSnapshotTrend(boundary.resolvedSnapshots, { now: options.now });
    if (afterTrend.trendFingerprint !== trend.trendFingerprint) throw new Error('趨勢處置收據發布期間，治理快照趨勢已改變。');
    const afterLedger = readLedgerStrict(resolvedLedger);
    if (afterLedger.records.length !== ledger.records.length + 1
        || afterLedger.terminalReceiptFingerprint !== receipt.receiptFingerprint) throw new Error('趨勢處置收據發布後的鏈結驗證失敗。');
    const result = buildDispositionState(afterTrend, afterLedger, { now: options.now });
    result.publication = {
      published: true,
      receiptFileName: fileName,
      receiptFingerprint: receipt.receiptFingerprint,
      sequence: receipt.sequence,
      targetCount: receipt.targets.length,
    };
    publishedPath = '';
    return result;
  } catch (error) {
    if (stagingHandle !== null) { try { fs.closeSync(stagingHandle); } catch {} }
    if (stagingPath) { try { fs.rmSync(stagingPath, { force: true }); } catch {} }
    if (publishedPath) { try { fs.rmSync(publishedPath, { force: true }); } catch {} }
    if (!ledgerExisted && fs.existsSync(resolvedLedger)) { try { fs.rmdirSync(resolvedLedger); } catch {} }
    throw error;
  } finally {
    if (lockHandle !== null) { try { fs.closeSync(lockHandle); } catch {} }
    if (lockAcquired) { try { fs.rmSync(lockPath, { force: true }); } catch {} }
  }
}

function formatSummary(result) {
  const lines = [
    '多案件治理趨勢處置狀態',
    `狀態：${result.status}；原始趨勢：${result.rawTrendStatus}；原始注意：${result.rawAttentionStatus}；處置後注意：${result.effectiveAttentionStatus}`,
    `快照資料夾：${result.snapshotDirectoryName}；處置紀錄：${result.ledgerDirectoryName}`,
    `處置目標：${result.summary.acknowledgedTargets}/${result.summary.activeTargets} 已確認；收據 ${result.summary.receiptCount} 份；歷史失效 ${result.summary.staleReceiptCount} 份`,
    `趨勢指紋：${result.trendFingerprint}`,
    `處置鏈指紋：${result.ledger.ledgerFingerprint}`,
    `處置狀態指紋：${result.dispositionFingerprint}`,
  ];
  if (result.publication?.published) lines.push(`新收據：${result.publication.receiptFileName}；${result.publication.receiptFingerprint}`);
  result.targets.forEach(target => lines.push(`- ${target.acknowledged ? '已確認' : '待確認'} [${target.type}] ${target.key}；起點 ${target.evidenceAt}`));
  result.caseAttention.filter(item => item.rawPriority !== item.effectivePriority).forEach(item => lines.push(`- ${item.caseName}：${item.rawPriority} → ${item.effectivePriority}（只解除歷史型注意）`));
  result.issues.forEach(item => lines.push(`- 阻擋 [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(DISPOSITION_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false, acknowledge: false, caseRemovals: [], recurringIssues: [] };
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
    else if (arg === '--acknowledge') options.acknowledge = true;
    else if (arg === '--case-removal') options.caseRemovals.push(value());
    else if (arg === '--recurring-issue') options.recurringIssues.push(value());
    else if (arg === '--reviewer') options.reviewer = value();
    else if (arg === '--basis') options.basis = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  const writeFields = options.caseRemovals.length || options.recurringIssues.length || options.reviewer || options.basis;
  if (!options.acknowledge && writeFields) throw new Error('處置目標、複核人與依據只能搭配 --acknowledge。');
  if (options.acknowledge && (!options.caseRemovals.length && !options.recurringIssues.length)) throw new Error('--acknowledge 至少需要一個 --case-removal 或 --recurring-issue。');
  if (options.acknowledge && (!options.reviewer || !options.basis)) throw new Error('--acknowledge 必須提供 --reviewer 與 --basis。');
  return options;
}

function usage() {
  return [
    '檢查：node attachment-case-governance-portfolio-snapshot-trend-disposition.js --directory <治理快照資料夾> --ledger <內部處置紀錄資料夾> [--json]',
    '確認：加上 --acknowledge [--case-removal <案件名稱> ...] [--recurring-issue <問題代碼> ...] --reviewer <內部複核人> --basis <複核依據>',
    '處置收據只解除符合相同持續證據的歷史型注意，不得覆蓋目前 blocked／review 或最新惡化。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.directory || !options.ledger) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = options.acknowledge
    ? publishDisposition(options.directory, options.ledger, options)
    : inspectDispositionState(options.directory, options.ledger, options);
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
  DISPOSITION_KIND,
  DISPOSITION_STATE_KIND,
  DISPOSITION_BOUNDARY_INSTRUCTION,
  MAX_LEDGER_FILES,
  MAX_RECEIPT_BYTES,
  TARGET_TYPES,
  maxStatus,
  normalizeReviewText,
  validateFingerprint,
  targetId,
  compareTargets,
  normalizeTargets,
  dispositionBoundary,
  receiptFingerprint,
  validateReceipt,
  receiptFileName,
  readReceiptFile,
  validateLedgerBoundary,
  ledgerFingerprint,
  targetEvidenceFingerprint,
  emptyLedger,
  readLedgerStrict,
  dispositionTargets,
  effectivePriority,
  stateFingerprint,
  buildDispositionState,
  inspectDispositionState,
  requestedTargets,
  buildReceipt,
  publishDisposition,
  formatSummary,
  parseArgs,
  usage,
  main,
};
