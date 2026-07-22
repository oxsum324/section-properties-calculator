'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');
const Canonical = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');
const Checkpoint = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js');
const CheckpointHistory = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js');

const WORKSPACE_KIND = 'formal-attachment-case-governance-workspace.v1';
const WORKSPACE_STATE_KIND = 'formal-attachment-case-governance-workspace-state.v1';
const WORKSPACE_BOUNDARY_INSTRUCTION = '本設定只供內部固定附件治理來源與受信任 TAC 終點；不得放入計算書、主報告或正式附件包，不代表正式附件核可、工程狀態改善、數位簽章或防竄改儲存，亦不得發布至 Pages。';
const MAX_WORKSPACE_BYTES = 1024 * 1024;
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });
const WORKSPACE_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'createdAt', 'workspaceFingerprint', 'workspaceName',
  'boundary', 'sources', 'trustedHead', 'decision', 'previousWorkspace',
]);
const BOUNDARY_FIELDS = Object.freeze([
  'classification', 'attachToFormalReport', 'formalAttachmentApproval', 'modifiesGovernanceSources',
  'overridesCurrentStatus', 'pagesPublication', 'instruction',
]);
const SOURCE_FIELDS = Object.freeze(['snapshotDirectory', 'dispositionLedgerDirectory', 'checkpointHistoryDirectory']);
const HEAD_FIELDS = Object.freeze(['fileName', 'checkpointFingerprint', 'sha256']);
const DECISION_FIELDS = Object.freeze(['action', 'reviewer', 'basis', 'formalAttachmentApproval']);
const PREVIOUS_FIELDS = Object.freeze(['fileName', 'workspaceFingerprint', 'sha256']);

function maxStatus(...statuses) {
  return statuses.filter(status => Object.prototype.hasOwnProperty.call(STATUS_LEVEL, status))
    .reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function workspaceBoundary() {
  return {
    classification: 'internal-attachment-governance-workspace-only',
    attachToFormalReport: false,
    formalAttachmentApproval: false,
    modifiesGovernanceSources: false,
    overridesCurrentStatus: false,
    pagesPublication: false,
    instruction: WORKSPACE_BOUNDARY_INSTRUCTION,
  };
}

function validateSha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} SHA-256 無效。`);
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.length > 1024 || path.isAbsolute(value)
      || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label}必須是標準相對路徑。`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized.startsWith('/')) throw new Error(`${label}必須是已正規化的相對路徑。`);
  return value;
}

function resolveRelativePath(configDirectory, value, label) {
  normalizeRelativePath(value, label);
  return path.resolve(configDirectory, ...value.split('/'));
}

function relativePortablePath(configDirectory, target, label) {
  const relative = path.relative(path.resolve(configDirectory), path.resolve(target)).replace(/\\/g, '/');
  return normalizeRelativePath(relative, label);
}

function workspaceFingerprint(record) {
  const payload = { ...record };
  delete payload.workspaceFingerprint;
  return `TGW-${crypto.createHash('sha256').update(Canonical.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function validateWorkspace(record) {
  Compare.exactKeys(record, WORKSPACE_FIELDS, '附件治理工作區設定');
  if (record.schemaVersion !== 1 || record.kind !== WORKSPACE_KIND) throw new Error('附件治理工作區設定版本或種類不受支援。');
  if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
      || new Date(record.createdAt).toISOString() !== record.createdAt) throw new Error('附件治理工作區建立時間無效。');
  Disposition.validateFingerprint(record.workspaceFingerprint, 'TGW', '附件治理工作區');
  Compare.safeName(record.workspaceName, '附件治理工作區名稱');
  if (record.workspaceName.trim() !== record.workspaceName) throw new Error('附件治理工作區名稱不得含首尾空白。');
  Compare.exactKeys(record.boundary, BOUNDARY_FIELDS, '附件治理工作區邊界');
  if (Canonical.canonicalJson(record.boundary) !== Canonical.canonicalJson(workspaceBoundary())) throw new Error('附件治理工作區邊界無效。');
  Compare.exactKeys(record.sources, SOURCE_FIELDS, '附件治理工作區來源');
  normalizeRelativePath(record.sources.snapshotDirectory, '治理快照資料夾');
  normalizeRelativePath(record.sources.dispositionLedgerDirectory, '處置紀錄資料夾');
  normalizeRelativePath(record.sources.checkpointHistoryDirectory, '可信檢查點歷程資料夾');
  if (new Set(Object.values(record.sources).map(value => value.toLowerCase())).size !== SOURCE_FIELDS.length) throw new Error('附件治理工作區三個來源路徑不得重複。');
  Compare.exactKeys(record.trustedHead, HEAD_FIELDS, '附件治理工作區受信任終點');
  if (typeof record.trustedHead.fileName !== 'string' || path.basename(record.trustedHead.fileName) !== record.trustedHead.fileName
      || !record.trustedHead.fileName.endsWith(`-${record.trustedHead.checkpointFingerprint}.json`)) throw new Error('附件治理工作區受信任終點檔名無效。');
  Disposition.validateFingerprint(record.trustedHead.checkpointFingerprint, 'TAC', '受信任終點');
  validateSha256(record.trustedHead.sha256, '受信任終點');
  Compare.exactKeys(record.decision, DECISION_FIELDS, '附件治理工作區決定');
  if (!['initial', 'advance'].includes(record.decision.action)) throw new Error('附件治理工作區決定類型無效。');
  if (Disposition.normalizeReviewText(record.decision.reviewer, '附件治理工作區複核人', 80) !== record.decision.reviewer
      || Disposition.normalizeReviewText(record.decision.basis, '附件治理工作區複核依據', 500) !== record.decision.basis) throw new Error('附件治理工作區決定必須使用標準文字。');
  if (record.decision.formalAttachmentApproval !== false) throw new Error('附件治理工作區不得宣稱正式附件核可。');
  Compare.exactKeys(record.previousWorkspace, PREVIOUS_FIELDS, '前一附件治理工作區設定');
  if (record.decision.action === 'initial') {
    if (record.previousWorkspace.fileName !== '' || record.previousWorkspace.workspaceFingerprint !== '' || record.previousWorkspace.sha256 !== '') throw new Error('初始附件治理工作區不得引用前一設定。');
  } else {
    if (typeof record.previousWorkspace.fileName !== 'string' || path.basename(record.previousWorkspace.fileName) !== record.previousWorkspace.fileName
        || !record.previousWorkspace.fileName.endsWith(`-${record.previousWorkspace.workspaceFingerprint}.json`)) throw new Error('前一附件治理工作區檔名無效。');
    Disposition.validateFingerprint(record.previousWorkspace.workspaceFingerprint, 'TGW', '前一附件治理工作區');
    validateSha256(record.previousWorkspace.sha256, '前一附件治理工作區');
  }
  if (workspaceFingerprint(record) !== record.workspaceFingerprint) throw new Error('附件治理工作區設定指紋不一致。');
  return record;
}

function workspaceFileName(record) {
  validateWorkspace(record);
  return `attachment-governance-workspace-${Snapshot.timestampToken(record.createdAt)}-${record.workspaceFingerprint}.json`;
}

function readWorkspaceFile(filePath, options = {}) {
  const resolved = path.resolve(filePath || '');
  const stat = fs.lstatSync(resolved, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('附件治理工作區設定必須是實體 JSON 檔案。');
  if (String(stat.nlink) !== '1') throw new Error('附件治理工作區設定不得有其他硬連結別名。');
  if (stat.size <= 0 || stat.size > MAX_WORKSPACE_BYTES) throw new Error('附件治理工作區設定大小超出限制。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!Snapshot.samePath(realPath, resolved)) throw new Error('附件治理工作區設定不得透過連結重新導向。');
  const raw = fs.readFileSync(resolved, 'utf8');
  if (Verifier.findDuplicateJsonKeys(raw).length) throw new Error('附件治理工作區設定含重複 JSON 欄位。');
  let workspace;
  try { workspace = JSON.parse(raw); } catch (error) { throw new Error('附件治理工作區設定不是有效 JSON。'); }
  validateWorkspace(workspace);
  if (options.checkFileName !== false && path.basename(resolved) !== workspaceFileName(workspace)) throw new Error('附件治理工作區設定檔名與內容不一致。');
  return {
    path: resolved,
    directory: path.dirname(resolved),
    fileName: path.basename(resolved),
    rawHash: crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
    workspace,
  };
}

function resolveWorkspaceSources(workspaceFile) {
  const base = workspaceFile.directory;
  const sources = {
    snapshotDirectory: resolveRelativePath(base, workspaceFile.workspace.sources.snapshotDirectory, '治理快照資料夾'),
    dispositionLedgerDirectory: resolveRelativePath(base, workspaceFile.workspace.sources.dispositionLedgerDirectory, '處置紀錄資料夾'),
    checkpointHistoryDirectory: resolveRelativePath(base, workspaceFile.workspace.sources.checkpointHistoryDirectory, '可信檢查點歷程資料夾'),
  };
  sources.headPath = path.join(sources.checkpointHistoryDirectory, workspaceFile.workspace.trustedHead.fileName);
  return sources;
}

function validateWorkspaceDirectorySeparation(configDirectory, sources) {
  const resolvedConfig = path.resolve(configDirectory);
  for (const source of [sources.snapshotDirectory, sources.dispositionLedgerDirectory, sources.checkpointHistoryDirectory]) {
    if (Builder.isPathInside(source, resolvedConfig) || Builder.isPathInside(resolvedConfig, source)) throw new Error('附件治理工作區設定資料夾必須與全部治理來源完全分離。');
  }
  return resolvedConfig;
}

function workspaceStateFingerprint(result) {
  const payload = {
    status: result.status,
    integrityStatus: result.integrityStatus,
    workspaceFingerprint: result.workspaceFingerprint,
    workspaceSha256: result.workspaceSha256,
    historyStateFingerprint: result.historyStateFingerprint,
    trustedHead: result.trustedHead,
    issues: result.issues.map(item => ({ level: item.level, code: item.code })),
  };
  return `TWS-${crypto.createHash('sha256').update(Canonical.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildWorkspaceState(workspaceFile, historyState, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立附件治理工作區狀態時間。');
  const invalid = Boolean(options.errorCode);
  const integrityStatus = invalid ? 'blocked' : 'ready';
  const status = invalid ? 'blocked' : maxStatus(integrityStatus, historyState.status);
  const workspace = workspaceFile?.workspace;
  const issues = invalid
    ? [{ level: 'error', code: options.errorCode, message: '附件治理工作區設定、固定來源或受信任終點未通過封閉驗證。' }]
    : historyState.issues.map(item => ({ ...item }));
  const result = {
    schemaVersion: 1,
    kind: WORKSPACE_STATE_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    integrityStatus,
    workspaceStateFingerprint: '',
    workspaceName: workspace?.workspaceName || '',
    workspaceFileName: workspaceFile?.fileName || '',
    workspaceFingerprint: workspace?.workspaceFingerprint || '',
    workspaceSha256: workspaceFile?.rawHash || '',
    historyStateFingerprint: historyState?.historyStateFingerprint || '',
    boundary: workspaceBoundary(),
    trustedHead: {
      fileName: workspace?.trustedHead.fileName || '',
      checkpointFingerprint: workspace?.trustedHead.checkpointFingerprint || '',
      sha256: workspace?.trustedHead.sha256 || '',
      relation: historyState?.head.relation || 'invalid',
    },
    sources: {
      snapshotDirectoryName: historyState?.snapshotDirectoryName || '',
      ledgerDirectoryName: historyState?.ledgerDirectoryName || '',
      historyDirectoryName: historyState?.historyDirectoryName || '',
    },
    issues,
    nextActions: [],
    publication: null,
  };
  if (invalid) result.nextActions.push({ code: 'repair-governance-workspace', message: '還原受保護的工作區設定或其固定來源；不得改指舊終點規避問題。' });
  else if (historyState.status !== 'ready') result.nextActions.push(...historyState.nextActions);
  else result.nextActions.push({ code: 'retain-governance-workspace', message: '工作區設定、固定來源與受信任終點一致，可繼續以此單一設定檔執行檢查。' });
  result.workspaceStateFingerprint = workspaceStateFingerprint(result);
  return result;
}

function inspectWorkspace(configPath, options = {}) {
  let workspaceFile;
  let sources;
  let historyState;
  try {
    workspaceFile = readWorkspaceFile(configPath);
    sources = resolveWorkspaceSources(workspaceFile);
    validateWorkspaceDirectorySeparation(workspaceFile.directory, sources);
    const head = Checkpoint.readCheckpointFile(sources.headPath);
    if (head.fileName !== workspaceFile.workspace.trustedHead.fileName
        || head.checkpoint.checkpointFingerprint !== workspaceFile.workspace.trustedHead.checkpointFingerprint
        || head.rawHash !== workspaceFile.workspace.trustedHead.sha256) throw new Error('附件治理工作區指定的受信任終點已被替換。');
    historyState = CheckpointHistory.inspectCheckpointHistory(
      sources.snapshotDirectory,
      sources.dispositionLedgerDirectory,
      sources.checkpointHistoryDirectory,
      sources.headPath,
      { now: options.now },
    );
  } catch (error) {
    return buildWorkspaceState(workspaceFile || null, null, { now: options.now, errorCode: 'invalid-governance-workspace' });
  }
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ workspaceFile, sources, historyState });
  let stable = false;
  try {
    const confirmedWorkspace = readWorkspaceFile(configPath);
    const confirmedHead = Checkpoint.readCheckpointFile(sources.headPath);
    const confirmedHistory = CheckpointHistory.inspectCheckpointHistory(
      sources.snapshotDirectory,
      sources.dispositionLedgerDirectory,
      sources.checkpointHistoryDirectory,
      sources.headPath,
      { now: options.now },
    );
    stable = confirmedWorkspace.rawHash === workspaceFile.rawHash
      && confirmedHead.rawHash === workspaceFile.workspace.trustedHead.sha256
      && confirmedHistory.historyStateFingerprint === historyState.historyStateFingerprint;
  } catch (error) { stable = false; }
  if (!stable) return buildWorkspaceState(workspaceFile, historyState, { now: options.now, errorCode: 'governance-workspace-sources-changed' });
  return buildWorkspaceState(workspaceFile, historyState, { now: options.now });
}

function validateOutputDirectory(outputDirectory, sources) {
  const resolved = path.resolve(outputDirectory || '');
  if (!outputDirectory) throw new Error('必須指定附件治理工作區設定輸出資料夾。');
  validateWorkspaceDirectorySeparation(resolved, sources);
  Snapshot.validatePhysicalDirectory(Snapshot.nearestExistingAncestor(resolved), '附件治理工作區輸出的既有上層');
  if (fs.existsSync(resolved)) Snapshot.validatePhysicalDirectory(resolved, '附件治理工作區設定輸出資料夾');
  return resolved;
}

function sameSources(left, right) {
  return Snapshot.samePath(left.snapshotDirectory, right.snapshotDirectory)
    && Snapshot.samePath(left.dispositionLedgerDirectory, right.dispositionLedgerDirectory)
    && Snapshot.samePath(left.checkpointHistoryDirectory, right.checkpointHistoryDirectory);
}

function buildWorkspace(workspaceName, outputDirectory, sources, headFile, previousFile, options = {}) {
  const createdAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(createdAt.getTime())) throw new Error('無法建立附件治理工作區設定時間。');
  const lowerBound = Math.max(
    Date.parse(headFile.checkpoint.generatedAt),
    previousFile ? Date.parse(previousFile.workspace.createdAt) : 0,
  );
  if (createdAt.getTime() < lowerBound) throw new Error('附件治理工作區設定時間不得早於受信任終點或前一設定。');
  const record = {
    schemaVersion: 1,
    kind: WORKSPACE_KIND,
    createdAt: createdAt.toISOString(),
    workspaceFingerprint: '',
    workspaceName: String(workspaceName || '').trim(),
    boundary: workspaceBoundary(),
    sources: {
      snapshotDirectory: relativePortablePath(outputDirectory, sources.snapshotDirectory, '治理快照資料夾'),
      dispositionLedgerDirectory: relativePortablePath(outputDirectory, sources.dispositionLedgerDirectory, '處置紀錄資料夾'),
      checkpointHistoryDirectory: relativePortablePath(outputDirectory, sources.checkpointHistoryDirectory, '可信檢查點歷程資料夾'),
    },
    trustedHead: {
      fileName: headFile.fileName,
      checkpointFingerprint: headFile.checkpoint.checkpointFingerprint,
      sha256: headFile.rawHash,
    },
    decision: {
      action: previousFile ? 'advance' : 'initial',
      reviewer: Disposition.normalizeReviewText(options.reviewer, '附件治理工作區複核人', 80),
      basis: Disposition.normalizeReviewText(options.basis, '附件治理工作區複核依據', 500),
      formalAttachmentApproval: false,
    },
    previousWorkspace: previousFile ? {
      fileName: previousFile.fileName,
      workspaceFingerprint: previousFile.workspace.workspaceFingerprint,
      sha256: previousFile.rawHash,
    } : { fileName: '', workspaceFingerprint: '', sha256: '' },
  };
  record.workspaceFingerprint = workspaceFingerprint(record);
  validateWorkspace(record);
  return record;
}

function sourceOptionsFromPrevious(previousFile) {
  return resolveWorkspaceSources(previousFile);
}

function publishWorkspace(options = {}) {
  let previousFile = null;
  let sources;
  let workspaceName = options.workspaceName;
  if (options.previousConfig) {
    previousFile = readWorkspaceFile(options.previousConfig);
    sources = sourceOptionsFromPrevious(previousFile);
    workspaceName = previousFile.workspace.workspaceName;
  } else {
    sources = {
      snapshotDirectory: path.resolve(options.directory || ''),
      dispositionLedgerDirectory: path.resolve(options.ledger || ''),
      checkpointHistoryDirectory: path.resolve(options.history || ''),
    };
  }
  if (!options.head) throw new Error('必須明確指定受信任 TAC 終點。');
  sources.headPath = path.resolve(options.head);
  const boundary = CheckpointHistory.validateHistoryBoundary(
    sources.snapshotDirectory,
    sources.dispositionLedgerDirectory,
    sources.checkpointHistoryDirectory,
    sources.headPath,
  );
  sources = {
    snapshotDirectory: boundary.resolvedSnapshots,
    dispositionLedgerDirectory: boundary.resolvedLedger,
    checkpointHistoryDirectory: boundary.resolvedHistory,
    headPath: boundary.resolvedHead,
  };
  if (previousFile) {
    const previousSources = sourceOptionsFromPrevious(previousFile);
    if (!sameSources(previousSources, sources)) throw new Error('前進附件治理工作區不得切換固定來源。');
  }
  const history = CheckpointHistory.readCheckpointHistoryStrict(sources.checkpointHistoryDirectory, sources.headPath);
  const historyState = CheckpointHistory.inspectCheckpointHistory(
    sources.snapshotDirectory,
    sources.dispositionLedgerDirectory,
    sources.checkpointHistoryDirectory,
    sources.headPath,
    { now: options.now },
  );
  if (history.status !== 'ready' || historyState.integrityStatus !== 'ready' || historyState.currentCheckpointStatus !== 'ready') throw new Error('只有歷程完整、指定終點為唯一鏈尾且目前收據鏈相符時，才可建立工作區設定。');
  const headFile = history.head;
  if (previousFile) {
    const oldHeadIndex = history.records.findIndex(item => item.fileName === previousFile.workspace.trustedHead.fileName
      && item.checkpoint.checkpointFingerprint === previousFile.workspace.trustedHead.checkpointFingerprint
      && item.rawHash === previousFile.workspace.trustedHead.sha256);
    if (oldHeadIndex < 0 || oldHeadIndex >= history.headIndex) throw new Error('新受信任終點必須是前一工作區終點的後續檢查點。');
  }
  const outputDirectory = validateOutputDirectory(options.output, sources);
  const outputExisted = fs.existsSync(outputDirectory);
  const parent = path.dirname(outputDirectory);
  Snapshot.validatePhysicalDirectory(parent, '附件治理工作區輸出上層');
  const lockPath = path.join(parent, `.${path.basename(outputDirectory)}.governance-workspace.lock`);
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
    Snapshot.validatePhysicalDirectory(outputDirectory, '附件治理工作區設定輸出資料夾');
    const workspace = buildWorkspace(workspaceName, outputDirectory, sources, headFile, previousFile, options);
    const fileName = workspaceFileName(workspace);
    const targetPath = path.join(outputDirectory, fileName);
    if (fs.existsSync(targetPath)) throw new Error(`同名附件治理工作區設定已存在，不得覆寫：${fileName}`);
    stagingPath = path.join(outputDirectory, `.${fileName}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    stagingHandle = fs.openSync(stagingPath, 'wx');
    fs.writeFileSync(stagingHandle, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
    fs.fsyncSync(stagingHandle);
    fs.closeSync(stagingHandle);
    stagingHandle = null;
    if (typeof options.beforeValidate === 'function') options.beforeValidate({ stagingPath, targetPath, workspace });
    const staged = readWorkspaceFile(stagingPath, { checkFileName: false });
    if (Canonical.canonicalJson(staged.workspace) !== Canonical.canonicalJson(workspace)) throw new Error('附件治理工作區暫存檔自我驗證不一致。');
    const confirmedHistory = CheckpointHistory.inspectCheckpointHistory(
      sources.snapshotDirectory,
      sources.dispositionLedgerDirectory,
      sources.checkpointHistoryDirectory,
      sources.headPath,
      { now: options.now },
    );
    if (confirmedHistory.historyStateFingerprint !== historyState.historyStateFingerprint) throw new Error('發布工作區設定前，固定治理來源或終點已改變。');
    if (previousFile && readWorkspaceFile(options.previousConfig).rawHash !== previousFile.rawHash) throw new Error('發布工作區設定前，前一設定已改變。');
    if (typeof options.beforePublish === 'function') options.beforePublish({ stagingPath, targetPath, workspace });
    if (fs.existsSync(targetPath)) throw new Error(`同名附件治理工作區設定已存在，不得覆寫：${fileName}`);
    linkSync(stagingPath, targetPath);
    publishedPath = targetPath;
    fs.unlinkSync(stagingPath);
    stagingPath = '';
    readWorkspaceFile(targetPath);
    if (typeof options.afterPublish === 'function') options.afterPublish({ targetPath, workspace });
    const afterHistory = CheckpointHistory.inspectCheckpointHistory(
      sources.snapshotDirectory,
      sources.dispositionLedgerDirectory,
      sources.checkpointHistoryDirectory,
      sources.headPath,
      { now: options.now },
    );
    if (afterHistory.historyStateFingerprint !== historyState.historyStateFingerprint) throw new Error('工作區設定發布期間，固定治理來源或終點已改變。');
    if (previousFile && readWorkspaceFile(options.previousConfig).rawHash !== previousFile.rawHash) throw new Error('工作區設定發布期間，前一設定已改變。');
    const result = inspectWorkspace(targetPath, { now: options.now });
    result.publication = {
      published: true,
      action: workspace.decision.action,
      workspaceFileName: fileName,
      workspaceFingerprint: workspace.workspaceFingerprint,
      trustedHeadFingerprint: workspace.trustedHead.checkpointFingerprint,
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
    '附件治理工作區狀態',
    `狀態：${result.status}；設定完整性：${result.integrityStatus}`,
    `工作區：${result.workspaceName || '無法驗證'}；設定：${result.workspaceFileName || '無法驗證'}`,
    `工作區指紋：${result.workspaceFingerprint || '無法驗證'}`,
    `受信任終點：${result.trustedHead.checkpointFingerprint || '無法驗證'}；${result.trustedHead.relation}`,
    `工作區狀態指紋：${result.workspaceStateFingerprint}`,
  ];
  if (result.publication?.published) lines.push(`新設定：${result.publication.workspaceFileName}；${result.publication.action}`);
  result.issues.forEach(item => lines.push(`- 阻擋 [${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(WORKSPACE_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false, create: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`參數 ${arg} 缺少值。`);
      index += 1;
      return next;
    };
    if (arg === '--config') options.config = value();
    else if (arg === '--create') options.create = true;
    else if (arg === '--previous-config') options.previousConfig = value();
    else if (arg === '--workspace-name') options.workspaceName = value();
    else if (arg === '--directory') options.directory = value();
    else if (arg === '--ledger') options.ledger = value();
    else if (arg === '--history') options.history = value();
    else if (arg === '--head') options.head = value();
    else if (arg === '--output') options.output = value();
    else if (arg === '--reviewer') options.reviewer = value();
    else if (arg === '--basis') options.basis = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  const writeFields = options.previousConfig || options.workspaceName || options.directory || options.ledger
    || options.history || options.head || options.output || options.reviewer || options.basis;
  if (!options.create && writeFields) throw new Error('建立或前進參數只能搭配 --create。');
  if (options.create && options.config) throw new Error('--config 不得與 --create 同時使用。');
  if (options.create && (!options.output || !options.head || !options.reviewer || !options.basis)) throw new Error('建立工作區設定必須提供 --output、--head、--reviewer 與 --basis。');
  if (options.create && !options.previousConfig && (!options.workspaceName || !options.directory || !options.ledger || !options.history)) throw new Error('初始工作區設定必須提供 --workspace-name、--directory、--ledger 與 --history。');
  if (options.create && options.previousConfig && (options.workspaceName || options.directory || options.ledger || options.history)) throw new Error('前進工作區設定固定沿用前一設定來源，不得重新指定名稱或來源。');
  return options;
}

function usage() {
  return [
    '檢查：node attachment-case-governance-workspace.js --config <附件治理工作區設定 JSON> [--json]',
    '初始：加上 --create --workspace-name <名稱> --directory <快照> --ledger <處置鏈> --history <檢查點歷程> --head <受信任 TAC 終點> --output <設定資料夾> --reviewer <複核人> --basis <依據>',
    '前進：加上 --create --previous-config <前一工作區設定> --head <新的受信任 TAC 終點> --output <設定資料夾> --reviewer <複核人> --basis <依據>',
    '設定檔固定來源及終點三重身分；建立新版本但不覆寫舊設定，也不得自動猜選最新終點。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.create && !options.config) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = options.create ? publishWorkspace(options) : inspectWorkspace(options.config, options);
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
  WORKSPACE_KIND,
  WORKSPACE_STATE_KIND,
  WORKSPACE_BOUNDARY_INSTRUCTION,
  MAX_WORKSPACE_BYTES,
  maxStatus,
  workspaceBoundary,
  normalizeRelativePath,
  resolveRelativePath,
  relativePortablePath,
  workspaceFingerprint,
  validateWorkspace,
  workspaceFileName,
  readWorkspaceFile,
  resolveWorkspaceSources,
  validateWorkspaceDirectorySeparation,
  workspaceStateFingerprint,
  buildWorkspaceState,
  inspectWorkspace,
  validateOutputDirectory,
  sameSources,
  buildWorkspace,
  sourceOptionsFromPrevious,
  publishWorkspace,
  formatSummary,
  parseArgs,
  usage,
  main,
};
