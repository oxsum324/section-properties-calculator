'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');

const ADVANCEMENT_KIND = 'formal-attachment-package-upgrade-history-baseline-advancement.v1';
const APPROVAL_KIND = 'formal-attachment-package-upgrade-history-baseline-advancement-record.v1';
const BASELINE_FILE_NAME = '附件升級歷程可信基準.json';
const APPROVAL_FILE_NAME = '可信基準前進內部核准紀錄.json';
const ADVANCEMENT_BOUNDARY_INSTRUCTION = '本前進包與核准紀錄僅供案件內部歷程完整性治理，不得放入計算書、主報告或正式附件包；此核准不是正式附件核可。';

const APPROVAL_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'reviewedAt', 'advancementId', 'advancementFingerprint',
  'boundary', 'decision', 'previousBaseline', 'nextBaseline', 'acceptedAdditions',
]);
const BOUNDARY_FIELDS = Object.freeze(['classification', 'attachToFormalReport', 'formalAttachmentApproval', 'instruction']);
const DECISION_FIELDS = Object.freeze(['kind', 'reviewer', 'basis', 'formalAttachmentApproval']);
const BASELINE_REF_FIELDS = Object.freeze(['collectionFingerprint', 'receiptCount', 'sha256']);
const ADDITION_FIELDS = Object.freeze(['receiptId', 'receiptFingerprint', 'recordedAt', 'action', 'status']);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, fields) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function sha256File(filePath) {
  return `SHA256-${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase()}`;
}

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function fileSnapshot(filePath) {
  const resolved = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(resolved)) throw new Error(`找不到既有可信基準：${resolved || filePath || '(未指定)'}`);
  const stat = fs.lstatSync(resolved, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('既有可信基準必須是外部實體 JSON 檔。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!samePath(realPath, resolved)) throw new Error('既有可信基準不得透過符號連結或目錄連接重新導向。');
  return {
    resolved,
    realPath,
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    sha256: sha256File(resolved),
  };
}

function approvalFingerprint(record) {
  const payload = { ...record };
  delete payload.advancementFingerprint;
  const hash = crypto.createHash('sha256')
    .update(History.canonicalJson(payload), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `HAD-${hash}`;
}

function normalizeReviewText(value, label, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label}不得空白。`);
  if (normalized.length > maxLength) throw new Error(`${label}不得超過 ${maxLength} 字。`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${label}不得包含控制字元。`);
  return normalized;
}

function buildApprovalRecord(options) {
  const reviewedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(reviewedAt.getTime())) throw new Error('無法建立可信基準前進核准時間。');
  const reviewer = normalizeReviewText(options.reviewer, '內部複核人', 80);
  const basis = normalizeReviewText(options.basis, '內部複核依據', 500);
  const advancementId = String(options.advancementId || `ADV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`);
  if (!/^ADV-[0-9A-Z-]{8,64}$/.test(advancementId)) throw new Error('可信基準 advancementId 格式無效。');
  const acceptedAdditions = options.acceptedAdditions.map(record => ({
    receiptId: record.receiptId,
    receiptFingerprint: record.receiptFingerprint,
    recordedAt: record.recordedAt,
    action: record.action,
    status: record.status,
  }));
  const record = {
    schemaVersion: 1,
    kind: APPROVAL_KIND,
    reviewedAt: reviewedAt.toISOString(),
    advancementId,
    advancementFingerprint: '',
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: ADVANCEMENT_BOUNDARY_INSTRUCTION,
    },
    decision: {
      kind: 'accept-history-additions-only',
      reviewer,
      basis,
      formalAttachmentApproval: false,
    },
    previousBaseline: {
      collectionFingerprint: options.previousBaseline.collectionFingerprint,
      receiptCount: options.previousBaseline.receipts.length,
      sha256: options.previousBaselineSha256,
    },
    nextBaseline: {
      collectionFingerprint: options.nextBaseline.collectionFingerprint,
      receiptCount: options.nextBaseline.receipts.length,
      sha256: options.nextBaselineSha256,
    },
    acceptedAdditions,
  };
  record.advancementFingerprint = approvalFingerprint(record);
  return record;
}

function validateApprovalRecord(record) {
  if (!exactKeys(record, APPROVAL_FIELDS)
      || record.schemaVersion !== 1
      || record.kind !== APPROVAL_KIND
      || !validIsoTimestamp(record.reviewedAt)
      || typeof record.advancementId !== 'string'
      || !/^ADV-[0-9A-Z-]{8,64}$/.test(record.advancementId)
      || typeof record.advancementFingerprint !== 'string'
      || !/^HAD-[0-9A-F]{24}$/.test(record.advancementFingerprint)
      || approvalFingerprint(record) !== record.advancementFingerprint) {
    throw new Error('可信基準前進核准紀錄的頂層結構或 HAD 指紋無效。');
  }
  if (!exactKeys(record.boundary, BOUNDARY_FIELDS)
      || record.boundary.classification !== 'internal-governance-only'
      || record.boundary.attachToFormalReport !== false
      || record.boundary.formalAttachmentApproval !== false
      || record.boundary.instruction !== ADVANCEMENT_BOUNDARY_INSTRUCTION) {
    throw new Error('可信基準前進核准紀錄的內部治理邊界無效。');
  }
  if (!exactKeys(record.decision, DECISION_FIELDS)
      || record.decision.kind !== 'accept-history-additions-only'
      || record.decision.formalAttachmentApproval !== false) {
    throw new Error('可信基準前進決定種類無效。');
  }
  normalizeReviewText(record.decision.reviewer, '內部複核人', 80);
  normalizeReviewText(record.decision.basis, '內部複核依據', 500);
  for (const reference of [record.previousBaseline, record.nextBaseline]) {
    if (!exactKeys(reference, BASELINE_REF_FIELDS)
        || typeof reference.collectionFingerprint !== 'string'
        || !/^HIX-[0-9A-F]{24}$/.test(reference.collectionFingerprint)
        || !Number.isSafeInteger(reference.receiptCount)
        || reference.receiptCount < 0
        || typeof reference.sha256 !== 'string'
        || !/^SHA256-[0-9A-F]{64}$/.test(reference.sha256)) {
      throw new Error('可信基準前進核准紀錄的基準參照無效。');
    }
  }
  if (!Array.isArray(record.acceptedAdditions) || !record.acceptedAdditions.length) {
    throw new Error('可信基準前進至少必須明確接受一份新增收據。');
  }
  const ids = new Set();
  record.acceptedAdditions.forEach(addition => {
    if (!exactKeys(addition, ADDITION_FIELDS)
        || typeof addition.receiptId !== 'string'
        || !/^[0-9A-Z-]{8,64}$/.test(addition.receiptId)
        || typeof addition.receiptFingerprint !== 'string'
        || !/^HIS-[0-9A-F]{24}$/.test(addition.receiptFingerprint)
        || !validIsoTimestamp(addition.recordedAt)
        || typeof addition.action !== 'string'
        || !addition.action
        || !['ready', 'review', 'blocked'].includes(addition.status)
        || ids.has(addition.receiptId)) {
      throw new Error('可信基準前進核准紀錄的新增收據摘要無效或重複。');
    }
    ids.add(addition.receiptId);
  });
  if (record.nextBaseline.receiptCount !== record.previousBaseline.receiptCount + record.acceptedAdditions.length) {
    throw new Error('可信基準前進的收據數與接受新增數不一致。');
  }
  return true;
}

function defaultBundleDir(historyDir, index) {
  const parent = path.join(path.dirname(path.resolve(historyDir)), Baseline.BASELINE_DIR_NAME);
  const token = Builder.timestampToken(index.generatedAt);
  return path.join(parent, `附件升級可信基準前進-${token}-${index.collectionFingerprint}`);
}

function validateBundleOutput(historyDir, bundleDir) {
  const resolvedBundle = path.resolve(bundleDir || '');
  if (!bundleDir) throw new Error('未指定可信基準前進包輸出資料夾。');
  Baseline.validateOutputPath(historyDir, path.join(resolvedBundle, BASELINE_FILE_NAME));
  if (fs.existsSync(resolvedBundle)) throw new Error(`可信基準前進包已存在，不得覆寫：${resolvedBundle}`);
  return resolvedBundle;
}

function readBaselineJson(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(rawText);
}

function writeApprovalRecord(record, filePath) {
  let handle = null;
  try {
    handle = fs.openSync(filePath, 'wx');
    fs.writeFileSync(handle, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    validateApprovalRecord(persisted);
    if (persisted.advancementFingerprint !== record.advancementFingerprint) {
      throw new Error('可信基準前進核准紀錄寫入後指紋不一致。');
    }
  } catch (error) {
    if (handle !== null) {
      try { fs.closeSync(handle); } catch {}
    }
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

function validateAdvancementBundle(bundleDir, historyDir, previousBaselinePath, options = {}) {
  const resolvedBundle = path.resolve(bundleDir || '');
  if (!bundleDir || !fs.existsSync(resolvedBundle)) throw new Error('找不到可信基準前進包。');
  const stat = fs.lstatSync(resolvedBundle);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('可信基準前進包必須是實體資料夾。');
  const entries = fs.readdirSync(resolvedBundle).sort();
  if (JSON.stringify(entries) !== JSON.stringify([APPROVAL_FILE_NAME, BASELINE_FILE_NAME].sort())) {
    throw new Error('可信基準前進包只能包含新版基準與內部核准紀錄。');
  }
  const nextBaselinePath = path.join(resolvedBundle, BASELINE_FILE_NAME);
  const approvalPath = path.join(resolvedBundle, APPROVAL_FILE_NAME);
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  validateApprovalRecord(approval);
  if (approval.previousBaseline.sha256 !== sha256File(previousBaselinePath)) {
    throw new Error('可信基準前進核准紀錄的舊基準 SHA-256 不符。');
  }
  if (approval.nextBaseline.sha256 !== sha256File(nextBaselinePath)) {
    throw new Error('可信基準前進核准紀錄的新版基準 SHA-256 不符。');
  }
  const previousIssues = [];
  const previousRecords = Index.baselineRecords(previousBaselinePath, historyDir, previousIssues);
  const nextIssues = [];
  const nextRecords = Index.baselineRecords(nextBaselinePath, historyDir, nextIssues);
  if (!previousRecords || previousIssues.some(item => item.level === 'error')) {
    throw new Error('可信基準前進包無法回讀有效的舊基準。');
  }
  if (!nextRecords || nextIssues.some(item => item.level === 'error')) {
    throw new Error('可信基準前進包無法回讀有效的新版基準。');
  }
  const differenceIssues = [];
  const difference = Index.compareWithBaseline(nextRecords, previousRecords, differenceIssues, true);
  if (difference.status !== 'new-records'
      || !difference.added.length
      || difference.missing.length
      || difference.changed.length) {
    throw new Error('可信基準前進包的新舊基準差異不是純新增收據。');
  }
  const approvedIds = approval.acceptedAdditions.map(item => item.receiptId).sort();
  if (JSON.stringify(approvedIds) !== JSON.stringify(difference.added)) {
    throw new Error('可信基準前進核准紀錄未完整對應新舊基準的新增收據。');
  }
  const nextById = new Map(nextRecords.map(record => [record.receiptId, record]));
  approval.acceptedAdditions.forEach(addition => {
    const actual = nextById.get(addition.receiptId);
    for (const field of ADDITION_FIELDS) {
      if (!actual || actual[field] !== addition[field]) {
        throw new Error('可信基準前進核准紀錄的新增收據摘要與新版基準不一致。');
      }
    }
  });
  if (approval.previousBaseline.collectionFingerprint !== Index.collectionFingerprint(previousRecords)
      || approval.previousBaseline.receiptCount !== previousRecords.length
      || approval.nextBaseline.collectionFingerprint !== Index.collectionFingerprint(nextRecords)
      || approval.nextBaseline.receiptCount !== nextRecords.length) {
    throw new Error('可信基準前進核准紀錄的集合指紋或收據數不一致。');
  }
  const historyMatch = Index.inspectHistoryDir(historyDir, {
    baseline: nextBaselinePath,
    now: options.now,
  });
  if (historyMatch.status !== 'valid' || historyMatch.baseline.status !== 'match') {
    throw new Error('可信基準前進包的新版基準與目前歷程未完全相符。');
  }
  return { approval, previousRecords, nextRecords, difference, historyMatch };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resultFromComparison(comparison, overrides = {}) {
  return {
    kind: ADVANCEMENT_KIND,
    status: comparison.status,
    advanced: false,
    reason: comparison.baseline.status === 'match' ? 'no-new-receipts' : 'approval-required',
    bundleDir: '',
    baselinePath: '',
    approvalPath: '',
    collectionFingerprint: comparison.collectionFingerprint,
    previousCollectionFingerprint: '',
    acceptedAddedReceiptIds: [...comparison.baseline.added],
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: ADVANCEMENT_BOUNDARY_INSTRUCTION,
    },
    comparison,
    ...overrides,
  };
}

function advanceBaseline(historyDir, options = {}) {
  const resolvedHistory = path.resolve(historyDir || '');
  if (!options.baseline) throw new Error('可信基準前進必須指定既有外部可信基準。');
  const baselineBefore = fileSnapshot(options.baseline);
  const historyBefore = Index.historySnapshot(resolvedHistory);
  const comparison = Index.inspectHistoryDir(resolvedHistory, {
    baseline: baselineBefore.resolved,
    now: options.now,
  });
  const previousBaseline = readBaselineJson(baselineBefore.resolved);
  const baseResult = resultFromComparison(comparison, {
    previousCollectionFingerprint: previousBaseline.collectionFingerprint || '',
  });

  if (comparison.status === 'valid' && comparison.baseline.status === 'match') {
    return { ...baseResult, status: 'valid', reason: 'no-new-receipts' };
  }
  const onlyAddedWarning = comparison.status === 'review'
    && comparison.baseline.status === 'new-records'
    && comparison.baseline.added.length > 0
    && comparison.baseline.missing.length === 0
    && comparison.baseline.changed.length === 0
    && comparison.issues.every(item => item.level === 'warn' && item.code === 'baseline-receipt-added');
  if (!onlyAddedWarning) {
    return { ...baseResult, reason: comparison.status === 'blocked' ? 'integrity-blocked' : 'not-additions-only' };
  }
  if (!options.acceptAdditions) return baseResult;

  const reviewer = normalizeReviewText(options.reviewer, '內部複核人', 80);
  const basis = normalizeReviewText(options.basis, '內部複核依據', 500);
  const current = Index.inspectHistoryDir(resolvedHistory, { now: options.now });
  if (current.status !== 'valid'
      || current.collectionFingerprint !== comparison.collectionFingerprint
      || JSON.stringify(current.receipts) !== JSON.stringify(comparison.receipts)) {
    throw new Error('移除基準比對後的目前歷程索引不一致，停止前進。');
  }
  if (!snapshotsEqual(historyBefore, Index.historySnapshot(resolvedHistory))
      || !snapshotsEqual(baselineBefore, fileSnapshot(baselineBefore.resolved))) {
    throw new Error('歷程或既有可信基準在前進準備期間發生變更。');
  }

  const resolvedBundle = validateBundleOutput(
    resolvedHistory,
    options.output || defaultBundleDir(resolvedHistory, current),
  );
  const outputParent = path.dirname(resolvedBundle);
  const outputParentExisted = fs.existsSync(outputParent);
  const stagingBundle = path.join(
    outputParent,
    `.${path.basename(resolvedBundle)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
  const stagingBaselinePath = path.join(stagingBundle, BASELINE_FILE_NAME);
  const stagingApprovalPath = path.join(stagingBundle, APPROVAL_FILE_NAME);
  const renameSync = options.renameSync || fs.renameSync;
  try {
    const published = Baseline.publishBaseline(resolvedHistory, {
      now: options.now,
      output: stagingBaselinePath,
    });
    if (!published.published
        || published.status !== 'valid'
        || published.collectionFingerprint !== current.collectionFingerprint) {
      throw new Error('新版可信基準暫存發布結果與目前歷程不一致。');
    }
    const acceptedSet = new Set(comparison.baseline.added);
    const acceptedAdditions = current.receipts.filter(record => acceptedSet.has(record.receiptId));
    if (acceptedAdditions.length !== comparison.baseline.added.length) {
      throw new Error('無法完整對應本次接受的新增收據。');
    }
    const nextBaseline = readBaselineJson(stagingBaselinePath);
    const approval = buildApprovalRecord({
      now: options.now,
      advancementId: options.advancementId,
      reviewer,
      basis,
      acceptedAdditions,
      previousBaseline,
      previousBaselineSha256: baselineBefore.sha256,
      nextBaseline,
      nextBaselineSha256: sha256File(stagingBaselinePath),
    });
    validateApprovalRecord(approval);
    writeApprovalRecord(approval, stagingApprovalPath);
    validateAdvancementBundle(stagingBundle, resolvedHistory, baselineBefore.resolved, { now: options.now });
    if (typeof options.beforeFinalize === 'function') options.beforeFinalize();
    if (!snapshotsEqual(historyBefore, Index.historySnapshot(resolvedHistory))) {
      throw new Error('歷程在可信基準前進發布前發生變更。');
    }
    if (!snapshotsEqual(baselineBefore, fileSnapshot(baselineBefore.resolved))) {
      throw new Error('既有可信基準在前進發布前發生變更。');
    }
    if (fs.existsSync(resolvedBundle)) throw new Error(`可信基準前進包已存在，不得覆寫：${resolvedBundle}`);
    renameSync(stagingBundle, resolvedBundle);
    return resultFromComparison(comparison, {
      status: 'valid',
      advanced: true,
      reason: 'additions-accepted',
      bundleDir: resolvedBundle,
      baselinePath: path.join(resolvedBundle, BASELINE_FILE_NAME),
      approvalPath: path.join(resolvedBundle, APPROVAL_FILE_NAME),
      previousCollectionFingerprint: previousBaseline.collectionFingerprint,
      acceptedAddedReceiptIds: acceptedAdditions.map(record => record.receiptId).sort(),
      approvalFingerprint: approval.advancementFingerprint,
    });
  } catch (error) {
    if (fs.existsSync(stagingBundle)) fs.rmSync(stagingBundle, { recursive: true, force: true });
    if (!outputParentExisted && fs.existsSync(outputParent)) {
      try { fs.rmdirSync(outputParent); } catch {}
    }
    throw error;
  }
}

function formatSummary(result) {
  if (result.advanced) {
    return [
      '附件升級可信基準已完成版本前進',
      `舊集合指紋：${result.previousCollectionFingerprint}`,
      `新集合指紋：${result.collectionFingerprint}`,
      `接受新增收據：${result.acceptedAddedReceiptIds.join('、')}`,
      `前進包：${result.bundleDir}`,
      ADVANCEMENT_BOUNDARY_INSTRUCTION,
    ].join('\n');
  }
  if (result.reason === 'no-new-receipts') {
    return [
      '附件升級可信基準不需前進',
      `集合指紋：${result.collectionFingerprint}`,
      '目前歷程與既有可信基準完全相符；本次沒有建立任何檔案。',
      ADVANCEMENT_BOUNDARY_INSTRUCTION,
    ].join('\n');
  }
  const lines = [
    '附件升級可信基準未前進',
    `狀態：${result.status === 'blocked' ? '完整性阻擋' : '需明確接受新增收據'}`,
    `新增收據：${result.acceptedAddedReceiptIds.length ? result.acceptedAddedReceiptIds.join('、') : '無'}`,
    '本次沒有建立或修改任何基準檔。',
  ];
  result.comparison.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '錯誤' : '提醒'}：${item.message}`));
  lines.push(ADVANCEMENT_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false, acceptAdditions: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少值。`);
      index += 1;
      return value;
    };
    if (arg === '--history') options.history = takeValue();
    else if (arg === '--baseline') options.baseline = takeValue();
    else if (arg === '--reviewer') options.reviewer = takeValue();
    else if (arg === '--basis') options.basis = takeValue();
    else if (arg === '--output') options.output = takeValue();
    else if (arg === '--accept-additions') options.acceptAdditions = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-package-upgrade-history-baseline-advance.js',
    '  --history <外部歷程資料夾> --baseline <既有外部可信基準 JSON>',
    '  [--accept-additions --reviewer <內部複核人> --basis <複核依據>]',
    '  [--output <新的外部前進包資料夾>] [--json]',
    '只有純新增收據可在明確接受後前進；遺失、改變或篡改一律阻擋。',
    '核准紀錄只代表內部歷程治理，不是正式附件核可。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Index.INDEX_EXIT_CODES.valid;
  }
  if (!options.history || !options.baseline) {
    console.error(usage());
    return Index.INDEX_EXIT_CODES.error;
  }
  const result = advanceBaseline(options.history, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Index.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = Index.INDEX_EXIT_CODES.error;
  }
}

module.exports = {
  ADVANCEMENT_KIND,
  APPROVAL_KIND,
  BASELINE_FILE_NAME,
  APPROVAL_FILE_NAME,
  ADVANCEMENT_BOUNDARY_INSTRUCTION,
  sha256File,
  fileSnapshot,
  approvalFingerprint,
  buildApprovalRecord,
  validateApprovalRecord,
  validateAdvancementBundle,
  defaultBundleDir,
  validateBundleOutput,
  advanceBaseline,
  formatSummary,
  parseArgs,
  usage,
};
