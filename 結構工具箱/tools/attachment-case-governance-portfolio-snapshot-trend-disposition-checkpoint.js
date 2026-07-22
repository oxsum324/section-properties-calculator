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
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');

const CHECKPOINT_KIND = 'formal-attachment-case-governance-trend-disposition-checkpoint.v1';
const CHECKPOINT_STATE_KIND = 'formal-attachment-case-governance-trend-disposition-checkpoint-state.v1';
const CHECKPOINT_BOUNDARY_INSTRUCTION = '本檢查點只供外部可信位置錨定內部趨勢處置收據鏈；不得放入計算書、主報告或正式附件包，不代表正式附件核可、工程狀態改善、數位簽章或防止檢查點本身遭替換，亦不得發布至 Pages。';
const MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });
const CHECKPOINT_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'generatedAt', 'checkpointFingerprint', 'boundary', 'scope',
  'ledger', 'receipts', 'decision', 'previousCheckpoint',
]);
const BOUNDARY_FIELDS = Object.freeze([
  'classification', 'attachToFormalReport', 'formalAttachmentApproval', 'modifiesDispositionLedger',
  'overridesCurrentStatus', 'pagesPublication', 'instruction',
]);
const SCOPE_FIELDS = Object.freeze(['groupName', 'snapshotDirectoryName', 'ledgerDirectoryName']);
const LEDGER_FIELDS = Object.freeze(['ledgerFingerprint', 'receiptCount', 'terminalReceiptFingerprint']);
const RECEIPT_REFERENCE_FIELDS = Object.freeze(['sequence', 'fileName', 'acknowledgedAt', 'receiptFingerprint', 'sha256']);
const DECISION_FIELDS = Object.freeze(['action', 'reviewer', 'basis', 'acceptedAdditionCount', 'formalAttachmentApproval']);
const PREVIOUS_FIELDS = Object.freeze(['checkpointFingerprint', 'sha256', 'fileName']);

function maxStatus(...statuses) {
  return statuses.filter(status => Object.prototype.hasOwnProperty.call(STATUS_LEVEL, status))
    .reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function checkpointBoundary() {
  return {
    classification: 'external-trusted-disposition-ledger-checkpoint-only',
    attachToFormalReport: false,
    formalAttachmentApproval: false,
    modifiesDispositionLedger: false,
    overridesCurrentStatus: false,
    pagesPublication: false,
    instruction: CHECKPOINT_BOUNDARY_INSTRUCTION,
  };
}

function validateSha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} SHA-256 無效。`);
}

function checkpointFingerprint(record) {
  const payload = { ...record };
  delete payload.checkpointFingerprint;
  return `TAC-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function receiptReferences(ledger) {
  return ledger.records.map(item => ({
    sequence: item.receipt.sequence,
    fileName: item.fileName,
    acknowledgedAt: item.receipt.acknowledgedAt,
    receiptFingerprint: item.receipt.receiptFingerprint,
    sha256: item.rawHash,
  }));
}

function referenceLedgerFingerprint(references) {
  return Disposition.ledgerFingerprint(references.map(item => ({
    fileName: item.fileName,
    rawHash: item.sha256,
    receipt: { sequence: item.sequence, receiptFingerprint: item.receiptFingerprint },
  })));
}

function validateCheckpoint(record) {
  Compare.exactKeys(record, CHECKPOINT_FIELDS, '趨勢處置可信檢查點');
  if (record.schemaVersion !== 1 || record.kind !== CHECKPOINT_KIND) throw new Error('趨勢處置可信檢查點版本或種類不受支援。');
  if (typeof record.generatedAt !== 'string' || !Number.isFinite(Date.parse(record.generatedAt))
      || new Date(record.generatedAt).toISOString() !== record.generatedAt) throw new Error('趨勢處置可信檢查點時間無效。');
  Disposition.validateFingerprint(record.checkpointFingerprint, 'TAC', '可信檢查點');
  Compare.exactKeys(record.boundary, BOUNDARY_FIELDS, '可信檢查點邊界');
  if (History.canonicalJson(record.boundary) !== History.canonicalJson(checkpointBoundary())) throw new Error('趨勢處置可信檢查點邊界無效。');
  Compare.exactKeys(record.scope, SCOPE_FIELDS, '可信檢查點範圍');
  Compare.safeName(record.scope.groupName, '案件群組');
  Compare.safeName(record.scope.snapshotDirectoryName, '快照資料夾名稱');
  Compare.safeName(record.scope.ledgerDirectoryName, '處置紀錄資料夾名稱');
  Compare.exactKeys(record.ledger, LEDGER_FIELDS, '可信檢查點鏈摘要');
  Disposition.validateFingerprint(record.ledger.ledgerFingerprint, 'TAI', '處置鏈');
  if (!Number.isSafeInteger(record.ledger.receiptCount) || record.ledger.receiptCount < 0
      || record.ledger.receiptCount > Disposition.MAX_LEDGER_FILES) throw new Error('可信檢查點收據數無效。');
  if (record.ledger.receiptCount === 0) {
    if (record.ledger.terminalReceiptFingerprint !== '') throw new Error('空收據鏈不得有終端收據指紋。');
  } else Disposition.validateFingerprint(record.ledger.terminalReceiptFingerprint, 'TRA', '終端收據');
  if (!Array.isArray(record.receipts) || record.receipts.length !== record.ledger.receiptCount) throw new Error('可信檢查點收據參照數與鏈摘要不一致。');
  record.receipts.forEach((item, index) => {
    Compare.exactKeys(item, RECEIPT_REFERENCE_FIELDS, `可信檢查點收據 receipts[${index}]`);
    if (item.sequence !== index + 1) throw new Error('可信檢查點收據序號必須由 1 連續遞增。');
    if (typeof item.fileName !== 'string' || path.basename(item.fileName) !== item.fileName || !/^trend-disposition-\d{6}-\d{8}-\d{6}-\d{3}Z-TRA-[0-9A-F]{24}\.json$/.test(item.fileName)) throw new Error('可信檢查點收據檔名無效。');
    if (typeof item.acknowledgedAt !== 'string' || !Number.isFinite(Date.parse(item.acknowledgedAt))
        || new Date(item.acknowledgedAt).toISOString() !== item.acknowledgedAt) throw new Error('可信檢查點收據時間無效。');
    if (Date.parse(item.acknowledgedAt) > Date.parse(record.generatedAt)) throw new Error('可信檢查點時間不得早於所錨定收據。');
    if (index && Date.parse(item.acknowledgedAt) < Date.parse(record.receipts[index - 1].acknowledgedAt)) throw new Error('可信檢查點收據時間不得倒退。');
    Disposition.validateFingerprint(item.receiptFingerprint, 'TRA', '收據');
    if (!item.fileName.endsWith(`-${item.receiptFingerprint}.json`)) throw new Error('可信檢查點收據檔名與指紋不一致。');
    validateSha256(item.sha256, '收據');
  });
  if (referenceLedgerFingerprint(record.receipts) !== record.ledger.ledgerFingerprint) throw new Error('可信檢查點處置鏈指紋不一致。');
  if ((record.receipts.at(-1)?.receiptFingerprint || '') !== record.ledger.terminalReceiptFingerprint) throw new Error('可信檢查點終端收據指紋不一致。');
  Compare.exactKeys(record.decision, DECISION_FIELDS, '可信檢查點決定');
  if (!['initial', 'advance'].includes(record.decision.action)) throw new Error('可信檢查點決定類型無效。');
  if (Disposition.normalizeReviewText(record.decision.reviewer, '可信檢查點複核人', 80) !== record.decision.reviewer
      || Disposition.normalizeReviewText(record.decision.basis, '可信檢查點複核依據', 500) !== record.decision.basis) throw new Error('可信檢查點決定必須使用標準文字。');
  if (!Number.isSafeInteger(record.decision.acceptedAdditionCount) || record.decision.acceptedAdditionCount < 0
      || record.decision.acceptedAdditionCount > record.ledger.receiptCount) throw new Error('可信檢查點接受新增數無效。');
  if (record.decision.formalAttachmentApproval !== false) throw new Error('可信檢查點不得宣稱正式附件核可。');
  Compare.exactKeys(record.previousCheckpoint, PREVIOUS_FIELDS, '前一可信檢查點');
  if (record.decision.action === 'initial') {
    if (record.previousCheckpoint.checkpointFingerprint !== '' || record.previousCheckpoint.sha256 !== '' || record.previousCheckpoint.fileName !== '') throw new Error('初始可信檢查點不得引用前一檢查點。');
    if (record.decision.acceptedAdditionCount !== record.ledger.receiptCount) throw new Error('初始可信檢查點接受數必須等於目前收據數。');
  } else {
    Disposition.validateFingerprint(record.previousCheckpoint.checkpointFingerprint, 'TAC', '前一可信檢查點');
    validateSha256(record.previousCheckpoint.sha256, '前一可信檢查點');
    if (typeof record.previousCheckpoint.fileName !== 'string' || path.basename(record.previousCheckpoint.fileName) !== record.previousCheckpoint.fileName
        || !record.previousCheckpoint.fileName.endsWith(`-${record.previousCheckpoint.checkpointFingerprint}.json`)) throw new Error('前一可信檢查點檔名無效。');
    if (record.decision.acceptedAdditionCount < 1) throw new Error('前進可信檢查點至少必須接受一份新增收據。');
  }
  if (checkpointFingerprint(record) !== record.checkpointFingerprint) throw new Error('趨勢處置可信檢查點指紋不一致。');
  return record;
}

function checkpointFileName(record) {
  validateCheckpoint(record);
  return `trend-disposition-checkpoint-${Snapshot.timestampToken(record.generatedAt)}-${record.checkpointFingerprint}.json`;
}

function readCheckpointFile(filePath, options = {}) {
  const resolved = path.resolve(filePath || '');
  const stat = fs.lstatSync(resolved, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('趨勢處置可信檢查點必須是實體 JSON 檔案。');
  if (String(stat.nlink) !== '1') throw new Error('趨勢處置可信檢查點不得有其他硬連結別名。');
  if (stat.size <= 0 || stat.size > MAX_CHECKPOINT_BYTES) throw new Error('趨勢處置可信檢查點大小超出限制。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!Snapshot.samePath(realPath, resolved)) throw new Error('趨勢處置可信檢查點不得透過連結重新導向。');
  const raw = fs.readFileSync(resolved, 'utf8');
  if (Verifier.findDuplicateJsonKeys(raw).length) throw new Error('趨勢處置可信檢查點含重複 JSON 欄位。');
  let checkpoint;
  try { checkpoint = JSON.parse(raw); } catch (error) { throw new Error('趨勢處置可信檢查點不是有效 JSON。'); }
  validateCheckpoint(checkpoint);
  if (options.checkFileName !== false && path.basename(resolved) !== checkpointFileName(checkpoint)) throw new Error('趨勢處置可信檢查點檔名與內容不一致。');
  return {
    path: resolved,
    fileName: path.basename(resolved),
    rawHash: crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
    checkpoint,
  };
}

function validateExternalPath(snapshotDirectory, ledgerDirectory, candidate, label, options = {}) {
  const resolvedSnapshots = path.resolve(snapshotDirectory || '');
  const resolvedLedger = path.resolve(ledgerDirectory || '');
  const resolved = path.resolve(candidate || '');
  if (!candidate) throw new Error(`必須指定${label}。`);
  const location = options.directory ? resolved : path.dirname(resolved);
  for (const source of [resolvedSnapshots, resolvedLedger]) {
    if (Builder.isPathInside(source, location) || Builder.isPathInside(location, source)) throw new Error(`${label}必須位於治理快照與處置紀錄之外的獨立位置。`);
  }
  Snapshot.validatePhysicalDirectory(Snapshot.nearestExistingAncestor(location), `${label}的既有上層`);
  if (options.mustExist) Snapshot.validatePhysicalDirectory(location, label);
  return resolved;
}

function compareLedgerToCheckpoint(ledger, checkpoint) {
  const current = receiptReferences(ledger);
  const anchored = checkpoint.receipts;
  const shared = Math.min(current.length, anchored.length);
  for (let index = 0; index < shared; index += 1) {
    if (History.canonicalJson(current[index]) !== History.canonicalJson(anchored[index])) {
      return { status: 'blocked', relation: 'prefix-mismatch', addedReceiptCount: Math.max(0, current.length - anchored.length), code: 'checkpoint-prefix-mismatch' };
    }
  }
  if (current.length < anchored.length) return { status: 'blocked', relation: 'tail-truncated', addedReceiptCount: 0, code: 'ledger-tail-truncated' };
  if (current.length > anchored.length) return { status: 'review', relation: 'new-receipts', addedReceiptCount: current.length - anchored.length, code: 'checkpoint-advance-required' };
  if (ledger.ledgerFingerprint !== checkpoint.ledger.ledgerFingerprint
      || ledger.terminalReceiptFingerprint !== checkpoint.ledger.terminalReceiptFingerprint) {
    return { status: 'blocked', relation: 'summary-mismatch', addedReceiptCount: 0, code: 'checkpoint-ledger-summary-mismatch' };
  }
  return { status: 'ready', relation: 'match', addedReceiptCount: 0, code: 'checkpoint-match' };
}

function stateFingerprint(result) {
  const payload = {
    dispositionFingerprint: result.dispositionFingerprint,
    checkpointFingerprint: result.checkpoint.checkpointFingerprint,
    checkpointSha256: result.checkpoint.sha256,
    currentLedgerFingerprint: result.currentLedgerFingerprint,
    relation: result.checkpoint.relation,
    status: result.status,
    issues: result.issues.map(item => ({ level: item.level, code: item.code })),
  };
  return `TCS-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildState(disposition, ledger, checkpointFile, comparison, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立可信檢查點狀態時間。');
  const issues = [];
  if (options.errorCode) issues.push({ level: 'error', code: options.errorCode, message: '指定的外部可信檢查點或目前處置鏈未通過封閉驗證。' });
  else if (comparison.status === 'blocked') issues.push({ level: 'error', code: comparison.code, message: comparison.relation === 'tail-truncated' ? '目前收據鏈比可信檢查點短，疑似尾端遭移除。' : '目前收據鏈的既有前綴與可信檢查點不一致。' });
  else if (comparison.status === 'review') issues.push({ level: 'warn', code: comparison.code, message: '目前收據鏈有檢查點建立後的合法新增，需明確複核後前進至另一份新檢查點。' });
  const checkpoint = checkpointFile?.checkpoint;
  const checkpointStatus = options.errorCode ? 'blocked' : comparison.status;
  const status = maxStatus(disposition.status, checkpointStatus);
  const result = {
    schemaVersion: 1,
    kind: CHECKPOINT_STATE_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    checkpointStatus,
    checkpointStateFingerprint: '',
    dispositionFingerprint: disposition.dispositionFingerprint,
    currentLedgerFingerprint: ledger.ledgerFingerprint,
    groupName: disposition.groupName,
    snapshotDirectoryName: disposition.snapshotDirectoryName,
    ledgerDirectoryName: disposition.ledgerDirectoryName,
    boundary: checkpointBoundary(),
    checkpoint: {
      checkpointFingerprint: checkpoint?.checkpointFingerprint || '',
      sha256: checkpointFile?.rawHash || '',
      fileName: checkpointFile?.fileName || '',
      relation: options.errorCode ? 'invalid' : comparison.relation,
      anchoredReceiptCount: checkpoint?.ledger.receiptCount || 0,
      currentReceiptCount: ledger.records.length,
      addedReceiptCount: options.errorCode ? 0 : comparison.addedReceiptCount,
    },
    issues,
    nextActions: [],
    publication: null,
  };
  if (checkpointStatus === 'blocked') result.nextActions.push({ code: 'restore-or-investigate-disposition-chain', message: '以指定的外部可信檢查點調查並還原收據鏈；不得改用較舊檢查點掩蓋缺失。' });
  else if (checkpointStatus === 'review') result.nextActions.push({ code: 'advance-trusted-disposition-checkpoint', message: '複核新增收據後，以 --advance --accept-additions 建立另一份不可覆寫的新檢查點。' });
  else if (disposition.status !== 'ready') result.nextActions.push({ code: 'follow-current-disposition-state', message: '可信檢查點相符，但仍須依目前治理趨勢處置狀態完成 review／blocked 工作。' });
  else result.nextActions.push({ code: 'retain-external-trusted-checkpoint', message: '目前收據鏈與指定的外部可信檢查點相符，請持續保護並明確指定這份檢查點。' });
  result.checkpointStateFingerprint = stateFingerprint(result);
  return result;
}

function inspectCheckpointState(snapshotDirectory, ledgerDirectory, checkpointPath, options = {}) {
  const boundary = Disposition.validateLedgerBoundary(snapshotDirectory, ledgerDirectory);
  validateExternalPath(boundary.resolvedSnapshots, boundary.resolvedLedger, checkpointPath, '外部可信檢查點');
  const disposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
  let ledger;
  let checkpointFile;
  try {
    ledger = Disposition.readLedgerStrict(boundary.resolvedLedger);
    checkpointFile = readCheckpointFile(checkpointPath);
  } catch (error) {
    ledger = Disposition.emptyLedger(boundary.resolvedLedger);
    return buildState(disposition, ledger, null, { status: 'blocked', relation: 'invalid', addedReceiptCount: 0 }, { now: options.now, errorCode: 'invalid-trusted-disposition-checkpoint' });
  }
  let comparison = compareLedgerToCheckpoint(ledger, checkpointFile.checkpoint);
  if (checkpointFile.checkpoint.scope.groupName !== disposition.groupName
      || checkpointFile.checkpoint.scope.snapshotDirectoryName !== disposition.snapshotDirectoryName
      || checkpointFile.checkpoint.scope.ledgerDirectoryName !== disposition.ledgerDirectoryName) {
    comparison = { status: 'blocked', relation: 'scope-mismatch', addedReceiptCount: 0, code: 'checkpoint-scope-mismatch' };
  }
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ boundary, disposition, ledger, checkpointFile });
  let stable = false;
  try {
    const confirmedDisposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
    const confirmedLedger = Disposition.readLedgerStrict(boundary.resolvedLedger);
    const confirmedCheckpoint = readCheckpointFile(checkpointPath);
    stable = confirmedDisposition.dispositionFingerprint === disposition.dispositionFingerprint
      && confirmedLedger.ledgerFingerprint === ledger.ledgerFingerprint
      && confirmedCheckpoint.rawHash === checkpointFile.rawHash;
  } catch (error) { stable = false; }
  if (!stable) comparison = { status: 'blocked', relation: 'sources-changed', addedReceiptCount: 0, code: 'checkpoint-sources-changed-during-read' };
  return buildState(disposition, ledger, checkpointFile, comparison, { now: options.now });
}

function buildCheckpoint(disposition, ledger, previousFile, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立可信檢查點時間。');
  const references = receiptReferences(ledger);
  const action = previousFile ? 'advance' : 'initial';
  const acceptedAdditionCount = previousFile ? references.length - previousFile.checkpoint.receipts.length : references.length;
  const latestSourceTime = Math.max(
    ...references.map(item => Date.parse(item.acknowledgedAt)),
    previousFile ? Date.parse(previousFile.checkpoint.generatedAt) : 0,
  );
  if (generatedAt.getTime() < latestSourceTime) throw new Error('可信檢查點時間不得早於收據或前一檢查點。');
  const record = {
    schemaVersion: 1,
    kind: CHECKPOINT_KIND,
    generatedAt: generatedAt.toISOString(),
    checkpointFingerprint: '',
    boundary: checkpointBoundary(),
    scope: {
      groupName: disposition.groupName,
      snapshotDirectoryName: disposition.snapshotDirectoryName,
      ledgerDirectoryName: disposition.ledgerDirectoryName,
    },
    ledger: {
      ledgerFingerprint: ledger.ledgerFingerprint,
      receiptCount: references.length,
      terminalReceiptFingerprint: ledger.terminalReceiptFingerprint,
    },
    receipts: references,
    decision: {
      action,
      reviewer: Disposition.normalizeReviewText(options.reviewer, '可信檢查點複核人', 80),
      basis: Disposition.normalizeReviewText(options.basis, '可信檢查點複核依據', 500),
      acceptedAdditionCount,
      formalAttachmentApproval: false,
    },
    previousCheckpoint: previousFile ? {
      checkpointFingerprint: previousFile.checkpoint.checkpointFingerprint,
      sha256: previousFile.rawHash,
      fileName: previousFile.fileName,
    } : { checkpointFingerprint: '', sha256: '', fileName: '' },
  };
  record.checkpointFingerprint = checkpointFingerprint(record);
  validateCheckpoint(record);
  return record;
}

function validateOutputDirectory(snapshotDirectory, ledgerDirectory, outputDirectory) {
  const resolved = validateExternalPath(snapshotDirectory, ledgerDirectory, outputDirectory, '可信檢查點輸出資料夾', { directory: true });
  if (fs.existsSync(resolved)) Snapshot.validatePhysicalDirectory(resolved, '可信檢查點輸出資料夾');
  return resolved;
}

function publishCheckpoint(snapshotDirectory, ledgerDirectory, options = {}) {
  const boundary = Disposition.validateLedgerBoundary(snapshotDirectory, ledgerDirectory);
  const outputDirectory = validateOutputDirectory(boundary.resolvedSnapshots, boundary.resolvedLedger, options.output);
  let previousFile = null;
  if (options.advance) {
    validateExternalPath(boundary.resolvedSnapshots, boundary.resolvedLedger, options.checkpoint, '前一外部可信檢查點');
    previousFile = readCheckpointFile(options.checkpoint);
  }
  const outputExisted = fs.existsSync(outputDirectory);
  const parent = path.dirname(outputDirectory);
  Snapshot.validatePhysicalDirectory(parent, '可信檢查點輸出上層');
  const lockPath = path.join(parent, `.${path.basename(outputDirectory)}.trend-disposition-checkpoint.lock`);
  let lockHandle = null;
  let lockAcquired = false;
  let stagingPath = '';
  let stagingHandle = null;
  let publishedPath = '';
  const linkSync = options.linkSync || fs.linkSync;
  try {
    lockHandle = fs.openSync(lockPath, 'wx');
    lockAcquired = true;
    fs.mkdirSync(outputDirectory, { recursive: true });
    Snapshot.validatePhysicalDirectory(outputDirectory, '可信檢查點輸出資料夾');
    const disposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
    const ledger = Disposition.readLedgerStrict(boundary.resolvedLedger);
    if (options.advance) {
      const comparison = compareLedgerToCheckpoint(ledger, previousFile.checkpoint);
      if (comparison.relation !== 'new-receipts') throw new Error('只有既有前綴完全相同且確有新增收據時，才可前進可信檢查點。');
      if (!options.acceptAdditions) throw new Error('前進可信檢查點必須明確指定 --accept-additions。');
      if (previousFile.checkpoint.scope.groupName !== disposition.groupName
          || previousFile.checkpoint.scope.snapshotDirectoryName !== disposition.snapshotDirectoryName
          || previousFile.checkpoint.scope.ledgerDirectoryName !== disposition.ledgerDirectoryName) throw new Error('前一可信檢查點的範圍與目前來源不一致。');
    }
    const checkpoint = buildCheckpoint(disposition, ledger, previousFile, options);
    const fileName = checkpointFileName(checkpoint);
    const targetPath = path.join(outputDirectory, fileName);
    if (fs.existsSync(targetPath)) throw new Error(`同名可信檢查點已存在，不得覆寫：${fileName}`);
    stagingPath = path.join(outputDirectory, `.${fileName}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    stagingHandle = fs.openSync(stagingPath, 'wx');
    fs.writeFileSync(stagingHandle, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
    fs.fsyncSync(stagingHandle);
    fs.closeSync(stagingHandle);
    stagingHandle = null;
    if (typeof options.beforeValidate === 'function') options.beforeValidate({ stagingPath, targetPath, checkpoint });
    const staged = readCheckpointFile(stagingPath, { checkFileName: false });
    if (History.canonicalJson(staged.checkpoint) !== History.canonicalJson(checkpoint)) throw new Error('可信檢查點暫存檔自我驗證不一致。');
    const confirmedDisposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
    const confirmedLedger = Disposition.readLedgerStrict(boundary.resolvedLedger);
    if (confirmedDisposition.dispositionFingerprint !== disposition.dispositionFingerprint
        || confirmedLedger.ledgerFingerprint !== ledger.ledgerFingerprint) throw new Error('發布可信檢查點前，治理快照或處置收據鏈已改變。');
    if (previousFile && readCheckpointFile(options.checkpoint).rawHash !== previousFile.rawHash) throw new Error('發布可信檢查點前，前一檢查點已改變。');
    if (typeof options.beforePublish === 'function') options.beforePublish({ stagingPath, targetPath, checkpoint });
    if (fs.existsSync(targetPath)) throw new Error(`同名可信檢查點已存在，不得覆寫：${fileName}`);
    linkSync(stagingPath, targetPath);
    publishedPath = targetPath;
    fs.unlinkSync(stagingPath);
    stagingPath = '';
    readCheckpointFile(targetPath);
    if (typeof options.afterPublish === 'function') options.afterPublish({ targetPath, checkpoint });
    const afterDisposition = Disposition.inspectDispositionState(boundary.resolvedSnapshots, boundary.resolvedLedger, { now: options.now });
    const afterLedger = Disposition.readLedgerStrict(boundary.resolvedLedger);
    if (afterDisposition.dispositionFingerprint !== disposition.dispositionFingerprint
        || afterLedger.ledgerFingerprint !== ledger.ledgerFingerprint) throw new Error('可信檢查點發布期間，治理快照或處置收據鏈已改變。');
    if (previousFile && readCheckpointFile(options.checkpoint).rawHash !== previousFile.rawHash) throw new Error('可信檢查點發布期間，前一檢查點已改變。');
    const result = inspectCheckpointState(boundary.resolvedSnapshots, boundary.resolvedLedger, targetPath, { now: options.now });
    result.publication = {
      published: true,
      action: checkpoint.decision.action,
      checkpointFileName: fileName,
      checkpointFingerprint: checkpoint.checkpointFingerprint,
      acceptedAdditionCount: checkpoint.decision.acceptedAdditionCount,
    };
    publishedPath = '';
    return result;
  } catch (error) {
    if (stagingHandle !== null) { try { fs.closeSync(stagingHandle); } catch {} }
    if (stagingPath) { try { fs.rmSync(stagingPath, { force: true }); } catch {} }
    if (publishedPath) { try { fs.rmSync(publishedPath, { force: true }); } catch {} }
    if (!outputExisted && fs.existsSync(outputDirectory)) { try { fs.rmdirSync(outputDirectory); } catch {} }
    throw error;
  } finally {
    if (lockHandle !== null) { try { fs.closeSync(lockHandle); } catch {} }
    if (lockAcquired) { try { fs.rmSync(lockPath, { force: true }); } catch {} }
  }
}

function formatSummary(result) {
  const lines = [
    '多案件治理趨勢處置可信檢查點',
    `狀態：${result.status}；檢查點：${result.checkpointStatus}；關係：${result.checkpoint.relation}`,
    `收據：目前 ${result.checkpoint.currentReceiptCount}；錨定 ${result.checkpoint.anchoredReceiptCount}；新增 ${result.checkpoint.addedReceiptCount}`,
    `目前處置鏈：${result.currentLedgerFingerprint}`,
    `可信檢查點：${result.checkpoint.checkpointFingerprint || '無法驗證'}`,
    `檢查狀態指紋：${result.checkpointStateFingerprint}`,
  ];
  if (result.publication?.published) lines.push(`新檢查點：${result.publication.checkpointFileName}；${result.publication.action}`);
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '阻擋' : '提醒'} [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(CHECKPOINT_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false, initialize: false, advance: false, acceptAdditions: false };
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
    else if (arg === '--checkpoint') options.checkpoint = value();
    else if (arg === '--output') options.output = value();
    else if (arg === '--reviewer') options.reviewer = value();
    else if (arg === '--basis') options.basis = value();
    else if (arg === '--initialize') options.initialize = true;
    else if (arg === '--advance') options.advance = true;
    else if (arg === '--accept-additions') options.acceptAdditions = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  if (options.initialize && options.advance) throw new Error('--initialize 與 --advance 不得同時使用。');
  const writeMode = options.initialize || options.advance;
  if (writeMode && (!options.output || !options.reviewer || !options.basis)) throw new Error('建立或前進可信檢查點必須提供 --output、--reviewer 與 --basis。');
  if (options.initialize && options.checkpoint) throw new Error('初始可信檢查點不得指定 --checkpoint。');
  if (options.advance && !options.checkpoint) throw new Error('前進可信檢查點必須指定 --checkpoint。');
  if (options.advance && !options.acceptAdditions) throw new Error('前進可信檢查點必須明確指定 --accept-additions。');
  if (!writeMode && (options.output || options.reviewer || options.basis || options.acceptAdditions)) throw new Error('寫入參數只能搭配 --initialize 或 --advance。');
  return options;
}

function usage() {
  return [
    '檢查：node attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js --directory <治理快照資料夾> --ledger <內部處置紀錄資料夾> --checkpoint <指定的外部可信檢查點 JSON> [--json]',
    '初始：加上 --initialize --output <外部檢查點資料夾> --reviewer <複核人> --basis <複核依據>',
    '前進：加上 --advance --checkpoint <前一檢查點> --accept-additions --output <外部檢查點資料夾> --reviewer <複核人> --basis <複核依據>',
    '不得自動猜選最新檢查點；必須從受保護的外部位置明確指定。檢查點不會覆蓋目前 review／blocked。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.directory || !options.ledger || (!options.initialize && !options.checkpoint)) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = options.initialize || options.advance
    ? publishCheckpoint(options.directory, options.ledger, options)
    : inspectCheckpointState(options.directory, options.ledger, options.checkpoint, options);
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
  CHECKPOINT_KIND,
  CHECKPOINT_STATE_KIND,
  CHECKPOINT_BOUNDARY_INSTRUCTION,
  MAX_CHECKPOINT_BYTES,
  maxStatus,
  checkpointBoundary,
  checkpointFingerprint,
  receiptReferences,
  referenceLedgerFingerprint,
  validateCheckpoint,
  checkpointFileName,
  readCheckpointFile,
  validateExternalPath,
  compareLedgerToCheckpoint,
  stateFingerprint,
  buildState,
  inspectCheckpointState,
  buildCheckpoint,
  validateOutputDirectory,
  publishCheckpoint,
  formatSummary,
  parseArgs,
  usage,
  main,
};
