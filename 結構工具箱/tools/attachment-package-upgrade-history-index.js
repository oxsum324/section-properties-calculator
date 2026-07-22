'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Verifier = require('./attachment-package-verify.js');

const INDEX_KIND = 'formal-attachment-package-upgrade-history-index.v1';
const INDEX_EXIT_CODES = Object.freeze({ valid: 0, review: 1, blocked: 2, error: 3 });
const MAX_JSON_BYTES = 1024 * 1024;
const TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'recordedAt', 'receiptId', 'receiptFingerprint',
  'boundary', 'flow', 'input', 'output', 'evidence',
]);
const BOUNDARY_FIELDS = Object.freeze(['classification', 'attachToFormalReport', 'instruction']);
const FLOW_FIELDS = Object.freeze(['kind', 'inputKind', 'action', 'status', 'changedManagedArtifact']);
const INPUT_FIELDS = Object.freeze(['packageFingerprint', 'workspacePlanFingerprint']);
const OUTPUT_FIELDS = Object.freeze(['packageFingerprint']);
const EVIDENCE_FIELDS = Object.freeze([
  'assessmentStatus', 'completionStatus', 'completionSummary', 'selfVerificationStatus',
]);
const COMPLETION_SUMMARY_FIELDS = Object.freeze(['total', 'matched', 'pending', 'errors', 'warnings']);
const INDEX_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'generatedAt', 'status', 'collectionFingerprint',
  'summary', 'receipts', 'baseline', 'issues',
]);
const INDEX_RECEIPT_FIELDS = Object.freeze([
  'fileName', 'recordedAt', 'receiptId', 'receiptFingerprint', 'inputKind',
  'action', 'status', 'changedManagedArtifact', 'inputPackageFingerprint',
  'workspacePlanFingerprint', 'outputPackageFingerprint',
]);
const INPUT_KINDS = new Set(['formal-package', 'upgrade-workspace', 'upgrade-package-source']);
const FLOW_STATUSES = new Set(['ready', 'review', 'blocked']);
const ACTION_RULES = Object.freeze({
  'workspace-created': { status: 'review', changed: true },
  'no-upgrade-needed': { status: 'ready', changed: false },
  'package-blocked': { status: 'blocked', changed: false },
  'completion-pending': { status: 'review', changed: false },
  'workspace-blocked': { status: 'blocked', changed: false },
  'package-built': { status: 'ready', changed: true },
});

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function issue(level, code, message, files = []) {
  return { level, code, message, files: [...files] };
}

function exactKeys(value, allowedFields, pointer, label, issues) {
  if (!plainObject(value)) {
    issues.push(issue('error', 'invalid-history-object', `${label}必須是 JSON 物件：${pointer}。`));
    return false;
  }
  const allowed = new Set(allowedFields);
  const actual = Object.keys(value);
  const unknown = actual.filter(key => !allowed.has(key)).sort();
  const missing = allowedFields.filter(key => !Object.hasOwn(value, key));
  if (unknown.length) {
    issues.push(issue('error', 'unknown-history-field', `${label}含未定義欄位：${unknown.map(key => `${pointer}/${key}`).join('、')}。`));
  }
  if (missing.length) {
    issues.push(issue('error', 'missing-history-field', `${label}缺少必要欄位：${missing.map(key => `${pointer}/${key}`).join('、')}。`));
  }
  return !unknown.length && !missing.length;
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validFingerprint(value, prefix) {
  return value === '' || new RegExp(`^${prefix}-[0-9A-F]{24}$`).test(value);
}

function receiptFileName(receipt) {
  const timestamp = Builder.timestampToken(receipt.recordedAt);
  const action = String(receipt.flow?.action || 'unknown').replace(/[^a-z0-9-]+/gi, '-');
  return `${timestamp}-${action}-${receipt.receiptId}.json`;
}

function indexReceipt(receipt, fileName) {
  return {
    fileName,
    recordedAt: receipt.recordedAt,
    receiptId: receipt.receiptId,
    receiptFingerprint: receipt.receiptFingerprint,
    inputKind: receipt.flow.inputKind,
    action: receipt.flow.action,
    status: receipt.flow.status,
    changedManagedArtifact: receipt.flow.changedManagedArtifact,
    inputPackageFingerprint: receipt.input.packageFingerprint,
    workspacePlanFingerprint: receipt.input.workspacePlanFingerprint,
    outputPackageFingerprint: receipt.output.packageFingerprint,
  };
}

function compareIndexReceipts(left, right) {
  return left.recordedAt.localeCompare(right.recordedAt)
    || left.receiptId.localeCompare(right.receiptId)
    || left.fileName.localeCompare(right.fileName);
}

function collectionFingerprint(records) {
  const canonicalRecords = [...records]
    .map(record => Object.fromEntries(INDEX_RECEIPT_FIELDS.map(field => [field, record[field]])))
    .sort(compareIndexReceipts);
  const hash = crypto.createHash('sha256')
    .update(History.canonicalJson(canonicalRecords), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `HIX-${hash}`;
}

function validateReceipt(receipt, rawText, fileName) {
  const issues = [];
  let duplicateKeys = [];
  try {
    duplicateKeys = Verifier.findDuplicateJsonKeys(rawText);
  } catch (error) {
    issues.push(issue('error', 'invalid-receipt-json', `收據 JSON 結構無法安全解析：${error.message}`, [fileName]));
  }
  if (duplicateKeys.length) {
    issues.push(issue(
      'error',
      'duplicate-receipt-json-key',
      `收據含重複 JSON 欄位：${duplicateKeys.slice(0, 5).map(item => item.pointer).join('、')}。`,
      [fileName],
    ));
  }
  exactKeys(receipt, TOP_LEVEL_FIELDS, '', '歷程收據', issues);
  if (!plainObject(receipt)) return { record: null, issues };

  if (receipt.schemaVersion !== 1 || receipt.kind !== History.HISTORY_KIND) {
    issues.push(issue('error', 'unsupported-receipt-schema', '歷程收據版本或種類不受支援。', [fileName]));
  }
  if (!validIsoTimestamp(receipt.recordedAt)) {
    issues.push(issue('error', 'invalid-receipt-time', '歷程收據 recordedAt 必須是標準 ISO 時間。', [fileName]));
  }
  if (typeof receipt.receiptId !== 'string' || !/^[0-9A-Z-]{8,64}$/.test(receipt.receiptId)) {
    issues.push(issue('error', 'invalid-receipt-id', '歷程收據 receiptId 格式無效。', [fileName]));
  }
  if (typeof receipt.receiptFingerprint !== 'string' || !/^HIS-[0-9A-F]{24}$/.test(receipt.receiptFingerprint)) {
    issues.push(issue('error', 'invalid-receipt-fingerprint', '歷程收據 HIS 指紋格式無效。', [fileName]));
  } else if (History.receiptFingerprint(receipt) !== receipt.receiptFingerprint) {
    issues.push(issue('error', 'receipt-fingerprint-mismatch', '歷程收據指紋不符；內容可能遭修改。', [fileName]));
  }

  const boundaryValid = exactKeys(receipt.boundary, BOUNDARY_FIELDS, '/boundary', '收據邊界', issues);
  if (boundaryValid && (
    receipt.boundary.classification !== 'internal-governance-only'
    || receipt.boundary.attachToFormalReport !== false
    || receipt.boundary.instruction !== History.HISTORY_BOUNDARY_INSTRUCTION
  )) {
    issues.push(issue('error', 'invalid-receipt-boundary', '歷程收據的內部治理邊界不正確。', [fileName]));
  }

  const flowValid = exactKeys(receipt.flow, FLOW_FIELDS, '/flow', '流程證據', issues);
  if (flowValid) {
    if (receipt.flow.kind !== 'formal-attachment-package-upgrade-flow.v1') {
      issues.push(issue('error', 'invalid-flow-kind', '收據流程種類不受支援。', [fileName]));
    }
    if (!INPUT_KINDS.has(receipt.flow.inputKind)) {
      issues.push(issue('error', 'invalid-flow-input-kind', '收據輸入階段不受支援。', [fileName]));
    }
    if (!FLOW_STATUSES.has(receipt.flow.status) || typeof receipt.flow.changedManagedArtifact !== 'boolean') {
      issues.push(issue('error', 'invalid-flow-status', '收據流程狀態或受管產物變更旗標無效。', [fileName]));
    }
    const rule = ACTION_RULES[receipt.flow.action];
    if (!rule) {
      issues.push(issue('error', 'invalid-flow-action', '收據流程動作不受支援。', [fileName]));
    } else if (receipt.flow.status !== rule.status || receipt.flow.changedManagedArtifact !== rule.changed) {
      issues.push(issue('error', 'inconsistent-flow-result', '收據動作、狀態與受管產物變更旗標彼此矛盾。', [fileName]));
    }
  }

  const inputValid = exactKeys(receipt.input, INPUT_FIELDS, '/input', '輸入指紋證據', issues);
  if (inputValid && (
    !validFingerprint(receipt.input.packageFingerprint, 'PKG')
    || !validFingerprint(receipt.input.workspacePlanFingerprint, 'WSP')
  )) {
    issues.push(issue('error', 'invalid-input-fingerprint', '收據的舊包或工作清單指紋格式無效。', [fileName]));
  }
  const outputValid = exactKeys(receipt.output, OUTPUT_FIELDS, '/output', '輸出指紋證據', issues);
  if (outputValid && !validFingerprint(receipt.output.packageFingerprint, 'PKG')) {
    issues.push(issue('error', 'invalid-output-fingerprint', '收據的新包指紋格式無效。', [fileName]));
  }

  const evidenceValid = exactKeys(receipt.evidence, EVIDENCE_FIELDS, '/evidence', '完成證據', issues);
  if (evidenceValid) {
    const allowedEvidenceStatuses = new Set(['', 'ready', 'review', 'blocked']);
    for (const field of ['assessmentStatus', 'completionStatus', 'selfVerificationStatus']) {
      if (!allowedEvidenceStatuses.has(receipt.evidence[field])) {
        issues.push(issue('error', 'invalid-evidence-status', `收據 ${field} 狀態無效。`, [fileName]));
      }
    }
    const summary = receipt.evidence.completionSummary;
    if (summary !== null) {
      const summaryValid = exactKeys(summary, COMPLETION_SUMMARY_FIELDS, '/evidence/completionSummary', '完成度摘要', issues);
      if (summaryValid) {
        const valuesValid = COMPLETION_SUMMARY_FIELDS.every(field => Number.isSafeInteger(summary[field]) && summary[field] >= 0);
        if (!valuesValid || summary.total !== summary.matched + summary.pending) {
          issues.push(issue('error', 'invalid-completion-summary', '收據完成度摘要必須是非負整數，且 total 應等於 matched 加 pending。', [fileName]));
        }
      }
    }
  }

  if (validIsoTimestamp(receipt.recordedAt)
      && typeof receipt.receiptId === 'string'
      && flowValid
      && fileName !== receiptFileName(receipt)) {
    issues.push(issue('error', 'receipt-filename-mismatch', '收據檔名與 recordedAt、action、receiptId 不一致。', [fileName]));
  }

  return {
    record: issues.some(item => item.level === 'error') ? null : indexReceipt(receipt, fileName),
    issues,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function historySnapshot(historyDir) {
  const rootStat = fs.lstatSync(historyDir, { bigint: true });
  const realPath = (fs.realpathSync.native || fs.realpathSync)(historyDir);
  const entries = fs.readdirSync(historyDir).sort().map(name => {
    const absolutePath = path.join(historyDir, name);
    const stat = fs.lstatSync(absolutePath, { bigint: true });
    const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    return {
      name,
      type,
      size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString(),
      sha256: type === 'file' ? sha256File(absolutePath) : '',
    };
  });
  return {
    root: {
      isDirectory: rootStat.isDirectory(),
      isSymbolicLink: rootStat.isSymbolicLink(),
      realPath,
      dev: rootStat.dev.toString(),
      ino: rootStat.ino.toString(),
    },
    entries,
  };
}

function baselineRecords(baselinePath, historyDir, issues) {
  if (!baselinePath) return null;
  const resolvedBaseline = path.resolve(baselinePath);
  if (Builder.isPathInside(historyDir, resolvedBaseline)) {
    issues.push(issue('error', 'baseline-inside-history', '可信基準索引不得存放在歷程收據資料夾內。'));
    return null;
  }
  if (!fs.existsSync(resolvedBaseline)) {
    issues.push(issue('error', 'baseline-not-found', '找不到指定的可信基準索引。'));
    return null;
  }
  const stat = fs.lstatSync(resolvedBaseline);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) {
    issues.push(issue('error', 'unsafe-baseline-index', '可信基準必須是外部實體 JSON 檔，且大小不得超過 1 MB。'));
    return null;
  }
  const beforeHash = sha256File(resolvedBaseline);
  const rawText = fs.readFileSync(resolvedBaseline, 'utf8');
  let baseline;
  try {
    const duplicates = Verifier.findDuplicateJsonKeys(rawText);
    if (duplicates.length) throw new Error('含重複 JSON 欄位');
    baseline = JSON.parse(rawText);
  } catch (error) {
    issues.push(issue('error', 'invalid-baseline-index', `可信基準 JSON 無法安全解析：${error.message}`));
    return null;
  }
  if (beforeHash !== sha256File(resolvedBaseline)) {
    issues.push(issue('error', 'baseline-changed-during-read', '可信基準在讀取期間發生變更。'));
    return null;
  }
  const baselineIssues = [];
  exactKeys(baseline, INDEX_FIELDS, '', '可信基準索引', baselineIssues);
  if (!plainObject(baseline)
      || baseline.schemaVersion !== 1
      || baseline.kind !== INDEX_KIND
      || !validIsoTimestamp(baseline.generatedAt)
      || baseline.status !== 'valid'
      || !Array.isArray(baseline.receipts)
      || typeof baseline.collectionFingerprint !== 'string'
      || !/^HIX-[0-9A-F]{24}$/.test(baseline.collectionFingerprint)) {
    baselineIssues.push(issue('error', 'invalid-baseline-index', '可信基準不是狀態為 valid 的支援索引。'));
  }
  const records = [];
  if (Array.isArray(baseline?.receipts)) {
    baseline.receipts.forEach((record, index) => {
      const recordIssues = [];
      const fieldsValid = exactKeys(record, INDEX_RECEIPT_FIELDS, `/receipts/${index}`, '基準收據摘要', recordIssues);
      if (fieldsValid) {
        const rule = ACTION_RULES[record.action];
        const expectedName = validIsoTimestamp(record.recordedAt)
          && typeof record.receiptId === 'string'
          ? `${Builder.timestampToken(record.recordedAt)}-${record.action}-${record.receiptId}.json`
          : '';
        const valuesValid = typeof record.fileName === 'string'
          && path.basename(record.fileName) === record.fileName
          && validIsoTimestamp(record.recordedAt)
          && typeof record.receiptId === 'string'
          && /^[0-9A-Z-]{8,64}$/.test(record.receiptId)
          && typeof record.receiptFingerprint === 'string'
          && /^HIS-[0-9A-F]{24}$/.test(record.receiptFingerprint)
          && INPUT_KINDS.has(record.inputKind)
          && Boolean(rule)
          && FLOW_STATUSES.has(record.status)
          && typeof record.changedManagedArtifact === 'boolean'
          && rule.status === record.status
          && rule.changed === record.changedManagedArtifact
          && validFingerprint(record.inputPackageFingerprint, 'PKG')
          && validFingerprint(record.workspacePlanFingerprint, 'WSP')
          && validFingerprint(record.outputPackageFingerprint, 'PKG')
          && record.fileName === expectedName;
        if (!valuesValid) {
          recordIssues.push(issue('error', 'invalid-baseline-receipt', `可信基準第 ${index + 1} 筆收據摘要值無效。`));
        }
      }
      if (recordIssues.length) baselineIssues.push(...recordIssues);
      else records.push({ ...record });
    });
  }
  const ids = new Set();
  const fingerprints = new Set();
  records.forEach(record => {
    if (ids.has(record.receiptId)) baselineIssues.push(issue('error', 'duplicate-baseline-receipt-id', '可信基準含重複 receiptId。'));
    if (fingerprints.has(record.receiptFingerprint)) baselineIssues.push(issue('error', 'duplicate-baseline-receipt-fingerprint', '可信基準含重複 HIS 指紋。'));
    ids.add(record.receiptId);
    fingerprints.add(record.receiptFingerprint);
  });
  if (records.length && collectionFingerprint(records) !== baseline.collectionFingerprint) {
    baselineIssues.push(issue('error', 'baseline-fingerprint-mismatch', '可信基準集合指紋不符。'));
  }
  if (!records.length && baseline.collectionFingerprint !== collectionFingerprint([])) {
    baselineIssues.push(issue('error', 'baseline-fingerprint-mismatch', '可信基準空集合指紋不符。'));
  }
  issues.push(...baselineIssues);
  return baselineIssues.some(item => item.level === 'error') ? null : records.sort(compareIndexReceipts);
}

function compareWithBaseline(currentRecords, trustedRecords, issues, requested = false) {
  const result = {
    requested,
    used: Boolean(trustedRecords),
    status: trustedRecords ? 'match' : requested ? 'invalid' : 'not-provided',
    added: [], missing: [], changed: [],
  };
  if (!trustedRecords) return result;
  const currentById = new Map(currentRecords.map(record => [record.receiptId, record]));
  const trustedById = new Map(trustedRecords.map(record => [record.receiptId, record]));
  result.added = currentRecords.filter(record => !trustedById.has(record.receiptId)).map(record => record.receiptId).sort();
  result.missing = trustedRecords.filter(record => !currentById.has(record.receiptId)).map(record => record.receiptId).sort();
  result.changed = currentRecords.filter(record => {
    const trusted = trustedById.get(record.receiptId);
    return trusted && INDEX_RECEIPT_FIELDS.some(field => record[field] !== trusted[field]);
  }).map(record => record.receiptId).sort();
  if (result.missing.length) {
    issues.push(issue('error', 'baseline-receipt-missing', `相較可信基準遺失 ${result.missing.length} 份收據。`, result.missing));
  }
  if (result.changed.length) {
    issues.push(issue('error', 'baseline-receipt-changed', `相較可信基準有 ${result.changed.length} 份同 ID 收據內容改變。`, result.changed));
  }
  if (result.added.length) {
    issues.push(issue('warn', 'baseline-receipt-added', `相較可信基準新增 ${result.added.length} 份收據；確認後可另存新的外部可信基準。`, result.added));
  }
  result.status = result.missing.length || result.changed.length ? 'differences' : result.added.length ? 'new-records' : 'match';
  return result;
}

function inspectHistoryDir(historyDir, options = {}) {
  const resolvedHistory = path.resolve(historyDir || '');
  if (!historyDir || !fs.existsSync(resolvedHistory)) throw new Error(`歷程收據資料夾不存在：${resolvedHistory || historyDir || '(未指定)'}`);
  const initialStat = fs.lstatSync(resolvedHistory);
  if (initialStat.isSymbolicLink() || !initialStat.isDirectory()) throw new Error('歷程收據位置必須是實體資料夾，不得為連結或其他特殊項目。');
  const before = historySnapshot(resolvedHistory);
  const issues = [];
  const records = [];
  let scannedJsonFiles = 0;

  before.entries.forEach(entry => {
    if (entry.type !== 'file') {
      issues.push(issue('error', 'unsafe-history-entry', '歷程資料夾含連結、子資料夾或特殊項目。', [entry.name]));
      return;
    }
    if (!entry.name.toLowerCase().endsWith('.json')) {
      issues.push(issue('error', 'unexpected-history-entry', '歷程資料夾只能包含 JSON 收據。', [entry.name]));
      return;
    }
    scannedJsonFiles += 1;
    if (Number(entry.size) > MAX_JSON_BYTES) {
      issues.push(issue('error', 'receipt-too-large', '單份歷程收據不得超過 1 MB。', [entry.name]));
      return;
    }
    const rawText = fs.readFileSync(path.join(resolvedHistory, entry.name), 'utf8');
    let receipt;
    try {
      receipt = JSON.parse(rawText);
    } catch (error) {
      issues.push(issue('error', 'invalid-receipt-json', `收據 JSON 無法解析：${error.message}`, [entry.name]));
      return;
    }
    const validated = validateReceipt(receipt, rawText, entry.name);
    issues.push(...validated.issues);
    if (validated.record) records.push(validated.record);
  });

  records.sort(compareIndexReceipts);
  const receiptIds = new Set();
  const receiptFingerprints = new Set();
  records.forEach(record => {
    if (receiptIds.has(record.receiptId)) issues.push(issue('error', 'duplicate-receipt-id', '歷程資料夾含重複 receiptId。', [record.receiptId]));
    if (receiptFingerprints.has(record.receiptFingerprint)) issues.push(issue('error', 'duplicate-receipt-fingerprint', '歷程資料夾含重複 HIS 指紋。', [record.receiptId]));
    receiptIds.add(record.receiptId);
    receiptFingerprints.add(record.receiptFingerprint);
  });

  const trustedRecords = baselineRecords(options.baseline, resolvedHistory, issues);
  const baseline = compareWithBaseline(records, trustedRecords, issues, Boolean(options.baseline));
  let after;
  try {
    after = historySnapshot(resolvedHistory);
  } catch (error) {
    issues.push(issue('error', 'history-changed-during-read', '歷程資料夾在讀取期間無法再次確認。'));
  }
  if (after && JSON.stringify(before) !== JSON.stringify(after)) {
    issues.push(issue('error', 'history-changed-during-read', '歷程資料夾或收據在讀取期間發生變更。'));
  }
  if (!scannedJsonFiles) issues.push(issue('warn', 'history-empty', '歷程資料夾尚無任何收據。'));

  const errors = issues.filter(item => item.level === 'error').length;
  const warnings = issues.filter(item => item.level === 'warn').length;
  const status = errors ? 'blocked' : warnings ? 'review' : 'valid';
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立歷程索引時間。');
  return {
    schemaVersion: 1,
    kind: INDEX_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    collectionFingerprint: collectionFingerprint(records),
    summary: {
      files: before.entries.length,
      validReceipts: records.length,
      invalidReceipts: Math.max(0, scannedJsonFiles - records.length),
      readyOutcomes: records.filter(record => record.status === 'ready').length,
      reviewOutcomes: records.filter(record => record.status === 'review').length,
      blockedOutcomes: records.filter(record => record.status === 'blocked').length,
      added: baseline.added.length,
      missing: baseline.missing.length,
      changed: baseline.changed.length,
      errors,
      warnings,
    },
    receipts: records,
    baseline,
    issues,
  };
}

function formatSummary(result) {
  const statusLabel = result.status === 'valid' ? '完整性通過' : result.status === 'review' ? '需人工確認' : '完整性阻擋';
  const lines = [
    '附件升級外部歷程唯讀索引',
    `歷程完整性：${statusLabel}`,
    `收據：有效 ${result.summary.validReceipts}；無效 ${result.summary.invalidReceipts}`,
    `歷史結果：ready ${result.summary.readyOutcomes}；review ${result.summary.reviewOutcomes}；blocked ${result.summary.blockedOutcomes}`,
    `集合指紋：${result.collectionFingerprint}`,
  ];
  if (result.baseline.used) {
    lines.push(`可信基準：${result.baseline.status}；新增 ${result.summary.added}；遺失 ${result.summary.missing}；改變 ${result.summary.changed}`);
  } else if (result.baseline.requested) {
    lines.push('可信基準：無效，未進行差異比對。');
  } else {
    lines.push('可信基準：未提供；本次只能驗證現有收據，無法證明過去收據是否曾遭刪除。');
  }
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '錯誤' : '提醒'}：${item.message}`));
  lines.push('本索引只驗證內部歷程完整性，不代表附件已正式核可。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--history') options.history = argv[++index];
    else if (arg === '--baseline') options.baseline = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-package-upgrade-history-index.js --history <外部歷程資料夾>',
    '  [--baseline <外部保存的可信索引 JSON>] [--json]',
    '索引器固定唯讀；不得把可信基準或索引輸出存回歷程資料夾。',
  ].join('\n');
}

function exitCodeForStatus(status) {
  return INDEX_EXIT_CODES[status] ?? INDEX_EXIT_CODES.error;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return INDEX_EXIT_CODES.valid;
  }
  if (!options.history) {
    console.error(usage());
    return INDEX_EXIT_CODES.error;
  }
  const result = inspectHistoryDir(options.history, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = INDEX_EXIT_CODES.error;
  }
}

module.exports = {
  INDEX_KIND,
  INDEX_EXIT_CODES,
  TOP_LEVEL_FIELDS,
  INDEX_RECEIPT_FIELDS,
  receiptFileName,
  collectionFingerprint,
  validateReceipt,
  historySnapshot,
  baselineRecords,
  compareWithBaseline,
  inspectHistoryDir,
  formatSummary,
  parseArgs,
  usage,
  exitCodeForStatus,
};
