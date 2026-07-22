'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');

const HISTORY_KIND = 'formal-attachment-package-upgrade-history-record.v1';
const HISTORY_DIR_NAME = '附件升級內部歷程_勿附入主報告';
const HISTORY_BOUNDARY_INSTRUCTION = '本收據僅供案件內部追溯，不得放入計算書、主報告或正式附件包。';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function receiptFingerprint(receipt) {
  const payload = { ...receipt };
  delete payload.receiptFingerprint;
  return `HIS-${crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function defaultHistoryDir(inputDir, detected = {}) {
  const anchor = detected.workspaceDir || detected.inputDir || path.resolve(inputDir || '');
  return path.join(path.dirname(path.resolve(anchor)), HISTORY_DIR_NAME);
}

function validateHistoryBoundary(historyDir, protectedPaths = []) {
  const resolvedHistory = path.resolve(historyDir || '');
  if (!historyDir) throw new Error('未指定附件升級內部歷程資料夾。');
  protectedPaths.filter(Boolean).forEach(protectedPath => {
    const resolvedProtected = path.resolve(protectedPath);
    if (Builder.isPathInside(resolvedProtected, resolvedHistory)
        || Builder.isPathInside(resolvedHistory, resolvedProtected)) {
      throw new Error(`內部歷程資料夾必須位於附件包、升級工作區及正式輸出之外：${resolvedHistory}`);
    }
  });
  if (fs.existsSync(resolvedHistory)) {
    const stat = fs.lstatSync(resolvedHistory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`內部歷程位置必須是實體資料夾，不得為連結或其他特殊項目：${resolvedHistory}`);
    }
  }
  return resolvedHistory;
}

function ensureHistoryWritable(historyDir, options = {}) {
  fs.mkdirSync(historyDir, { recursive: true });
  const stat = fs.lstatSync(historyDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`內部歷程位置不是安全的實體資料夾：${historyDir}`);
  const token = options.probeToken || `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const probePath = path.join(historyDir, `.history-write-probe-${token}`);
  try {
    fs.writeFileSync(probePath, 'probe', { encoding: 'utf8', flag: 'wx' });
  } finally {
    fs.rmSync(probePath, { force: true });
  }
}

function prepareHistoryContext(inputDir, detected, options = {}) {
  const historyDir = validateHistoryBoundary(
    options.historyDir || defaultHistoryDir(inputDir, detected),
    [detected.inputDir, detected.workspaceDir, options.output],
  );
  ensureHistoryWritable(historyDir, options);
  return {
    historyDir,
    selectedInput: path.resolve(inputDir),
    inputKind: detected.kind,
  };
}

function buildReceipt(flowResult, context, options = {}) {
  const recordedAt = options.now instanceof Date
    ? options.now
    : new Date(options.now || Date.now());
  if (!Number.isFinite(recordedAt.getTime())) throw new Error('無法建立附件升級歷程時間。');
  const receiptId = String(options.receiptId || crypto.randomBytes(8).toString('hex')).toUpperCase();
  if (!/^[0-9A-Z-]{8,64}$/.test(receiptId)) throw new Error('附件升級歷程 receiptId 格式無效。');
  const assessment = flowResult.workspaceResult?.assessment || null;
  const completion = flowResult.completion || flowResult.buildResult?.upgradeWorkspaceCheck || null;
  const receipt = {
    schemaVersion: 1,
    kind: HISTORY_KIND,
    recordedAt: recordedAt.toISOString(),
    receiptId,
    receiptFingerprint: '',
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      instruction: HISTORY_BOUNDARY_INSTRUCTION,
    },
    flow: {
      kind: flowResult.kind,
      inputKind: flowResult.inputKind,
      action: flowResult.action,
      status: flowResult.status,
      changedManagedArtifact: Boolean(flowResult.changedState),
    },
    input: {
      packageFingerprint: assessment?.currentPackage?.packageFingerprint
        || completion?.plan?.sourcePackageFingerprint
        || '',
      workspacePlanFingerprint: completion?.plan?.planFingerprint
        || flowResult.workspaceResult?.planFingerprint
        || '',
    },
    output: {
      packageFingerprint: flowResult.buildResult?.packageFingerprint || '',
    },
    evidence: {
      assessmentStatus: assessment?.status || '',
      completionStatus: completion?.status || '',
      completionSummary: completion?.summary ? { ...completion.summary } : null,
      selfVerificationStatus: flowResult.buildResult?.selfVerification?.status || '',
    },
  };
  receipt.receiptFingerprint = receiptFingerprint(receipt);
  return receipt;
}

function writeReceipt(receipt, historyDir, options = {}) {
  const resolvedHistory = path.resolve(historyDir);
  ensureHistoryWritable(resolvedHistory, options);
  const timestamp = Builder.timestampToken(receipt.recordedAt);
  const action = String(receipt.flow?.action || 'unknown').replace(/[^a-z0-9-]+/gi, '-');
  const fileName = `${timestamp}-${action}-${receipt.receiptId}.json`;
  const targetPath = path.join(resolvedHistory, fileName);
  if (fs.existsSync(targetPath)) throw new Error(`附件升級歷程收據已存在，不得覆寫：${targetPath}`);
  const stagingPath = path.join(
    resolvedHistory,
    `.${fileName}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
  const renameSync = options.renameSync || fs.renameSync;
  try {
    fs.writeFileSync(stagingPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(stagingPath, targetPath);
  } catch (error) {
    fs.rmSync(stagingPath, { force: true });
    throw error;
  }
  return {
    written: true,
    historyDir: resolvedHistory,
    recordPath: targetPath,
    receiptId: receipt.receiptId,
    receiptFingerprint: receipt.receiptFingerprint,
  };
}

function recordFlowResult(flowResult, context, options = {}) {
  const protectedPaths = [
    context.selectedInput,
    flowResult.workspaceDir,
    flowResult.packageDir,
  ];
  validateHistoryBoundary(context.historyDir, protectedPaths);
  const receipt = buildReceipt(flowResult, context, options);
  return { ...writeReceipt(receipt, context.historyDir, options), receipt };
}

module.exports = {
  HISTORY_KIND,
  HISTORY_DIR_NAME,
  HISTORY_BOUNDARY_INSTRUCTION,
  canonicalJson,
  receiptFingerprint,
  defaultHistoryDir,
  validateHistoryBoundary,
  ensureHistoryWritable,
  prepareHistoryContext,
  buildReceipt,
  writeReceipt,
  recordFlowResult,
};
