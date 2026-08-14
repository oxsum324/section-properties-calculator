const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const health = require('./public-release-decision-backup-health.js');

const LEGACY_DRILL_SCHEMA_VERSION = 1;
const DRILL_SCHEMA_VERSION = 2;
const STATUS_SCHEMA_VERSION = 2;
const ANCHOR_SCHEMA_VERSION = 1;
const DRILL_KIND = 'public-release-decision-restore-drill-receipt';
const STATUS_KIND = 'public-release-decision-restore-drill-status';
const ANCHOR_KIND = 'public-release-decision-restore-drill-anchor';
const DEFAULT_STATUS_FILE = 'output/audit/public-release-decision-restore-drill.json';
const DEFAULT_ANCHOR_FILE = 'output/audit/public-release-decision-restore-drill-anchor.json';
const DRILL_DIRECTORY = 'restore-drills';
const ISOLATION_PREFIX = 'public-release-decision-restore-drill-';
const DRILL_FILE_PATTERN = /^public-release-decision-restore-drill-\d{8}-\d{6}-(PDR-[0-9A-F]{24})\.json$/;
const ISSUE_CODES = new Set([
  'external-backup-not-configured',
  'external-backup-matches-local-directory',
  'backup-directory-unavailable',
  'current-backup-pair-missing',
  'isolated-restore-failed',
  'isolation-cleanup-failed',
  'source-repository-changed',
  'receipt-mirror-write-failed',
  'receipt-history-invalid',
  'receipt-history-mismatch',
  'receipt-history-rollback',
  'receipt-history-anchor-mismatch',
  'receipt-anchor-write-failed',
]);

class DrillError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sourceFileFingerprint(repoRoot) {
  const root = path.resolve(repoRoot);
  const anchorPath = path.join(root, ...receipts.ANCHOR_FILE.split('/'));
  const historyRoot = path.join(root, 'output', 'preflight', 'history');
  const files = [];
  if (fs.existsSync(anchorPath)) files.push(anchorPath);
  if (fs.existsSync(historyRoot)) {
    fs.readdirSync(historyRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d{8}-\d{6}$/.test(entry.name))
      .forEach(entry => {
        for (const name of [receipts.DECISION_FILE, receipts.RESET_FILE]) {
          const candidate = path.join(historyRoot, entry.name, name);
          if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) files.push(candidate);
        }
      });
  }
  const inventory = files.sort().map(filePath => ({
    path: path.relative(root, filePath).replace(/\\/g, '/'),
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  }));
  return receipts.digestObject(inventory);
}

function currentSourceState(repoRoot) {
  const historyState = receipts.loadDecisionHistory(repoRoot);
  const anchorState = receipts.validateDecisionHistoryAnchor(repoRoot, historyState);
  if (!historyState.entries.length) throw new Error('restore drill requires at least one private release decision receipt');
  return {
    history: historyState,
    anchor: anchorState.anchor,
    fingerprint: sourceFileFingerprint(repoRoot),
  };
}

function listCurrentBackups(directory, anchor, receiptCount) {
  if (!directory || !fs.existsSync(directory)) throw new DrillError('backup-directory-unavailable', 'backup directory is unavailable');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new DrillError('backup-directory-unavailable', 'backup directory must be a regular directory');
  return fs.readdirSync(directory)
    .filter(name => health.BACKUP_FILE_PATTERN.test(name))
    .map(name => {
      const filePath = path.join(directory, name);
      try {
        const loaded = backups.loadBackup(filePath);
        const current = receipts.stableJson(loaded.backup.chain.anchor) === receipts.stableJson(anchor)
          && loaded.backup.chain.receiptCount === receiptCount;
        return current ? {
          filePath,
          backup: loaded.backup,
          backupId: loaded.backup.backupId,
          exportedAtMs: Date.parse(loaded.backup.exportedAt),
          sha256: sha256File(filePath),
        } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.exportedAtMs - left.exportedAtMs || left.backupId.localeCompare(right.backupId));
}

function selectCurrentBackup(repoRoot, sourceState, options) {
  const localDirectory = path.join(repoRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDirectory = options.externalDirectory === undefined
    ? String(process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '')
    : String(options.externalDirectory || '');
  if (options.requireExternal && !externalDirectory) {
    throw new DrillError('external-backup-not-configured', 'external backup directory is required');
  }
  if (externalDirectory && samePath(localDirectory, externalDirectory)) {
    throw new DrillError('external-backup-matches-local-directory', 'external backup directory matches the local directory');
  }
  const local = listCurrentBackups(localDirectory, sourceState.anchor, sourceState.history.entries.length);
  if (!externalDirectory) {
    if (!local.length) throw new DrillError('current-backup-pair-missing', 'no current local backup is available');
    return { mode: 'local-default', selected: local[0], localDirectory, externalDirectory: '' };
  }
  const external = listCurrentBackups(externalDirectory, sourceState.anchor, sourceState.history.entries.length);
  const localById = new Map(local.map(record => [record.backupId, record]));
  const pair = external.find(record => {
    const localRecord = localById.get(record.backupId);
    return localRecord && localRecord.sha256 === record.sha256;
  });
  if (!pair) throw new DrillError('current-backup-pair-missing', 'no byte-identical current local and external backup pair is available');
  return { mode: 'external-mirror', selected: pair, localDirectory, externalDirectory };
}

function safeRemoveIsolation(isolatedRoot, temporaryParent) {
  if (!isolatedRoot) return;
  const target = path.resolve(isolatedRoot);
  const parent = path.resolve(temporaryParent);
  if (!samePath(path.dirname(target), parent) || !path.basename(target).startsWith(ISOLATION_PREFIX)) {
    throw new Error('refusing to remove an unrecognized isolation directory');
  }
  fs.rmSync(target, { recursive: true, force: true });
  if (fs.existsSync(target)) throw new Error('isolation directory still exists after cleanup');
}

function receiptId(core) {
  return `PDR-${receipts.digestObject(core).slice(0, 24).toUpperCase()}`;
}

function buildReceipt(completedAt, selection, sourceState, restoreResult, receiptHistory) {
  const previous = receiptHistory.entries.at(-1)?.receipt || null;
  const core = {
    schemaVersion: DRILL_SCHEMA_VERSION,
    kind: DRILL_KIND,
    completedAt,
    sequence: receiptHistory.entries.length + 1,
    previousReceipt: previous
      ? { receiptId: previous.receiptId, receiptSha256: receipts.digestObject(previous) }
      : { receiptId: '', receiptSha256: '' },
    source: {
      mode: selection.mode,
      backupId: selection.selected.backup.backupId,
      backupSha256: selection.selected.sha256,
    },
    chain: {
      receiptCount: sourceState.history.entries.length,
      pendingResetCount: sourceState.history.pendingRunIds.length,
      latestRunId: sourceState.history.entries.at(-1).decision.runId,
      anchorReceiptId: sourceState.anchor.receiptId,
      anchorReceiptSha256: sourceState.anchor.receiptSha256,
    },
    restore: {
      classification: restoreResult.classification,
      restoredReceiptCount: restoreResult.restoredReceiptCount,
      addedDecisionCount: restoreResult.addedDecisionCount,
      addedResetCount: restoreResult.addedResetCount,
      anchorValidated: true,
      sourceUnchanged: true,
      cleanupCompleted: true,
    },
  };
  const receipt = { ...core, receiptId: receiptId(core) };
  const validation = validateReceipt(receipt);
  if (!validation.pass) throw new Error(`generated restore drill receipt is invalid: ${validation.errors.join(', ')}`);
  return receipt;
}

function validateReceipt(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  const legacy = value?.schemaVersion === LEGACY_DRILL_SCHEMA_VERSION;
  const current = value?.schemaVersion === DRILL_SCHEMA_VERSION;
  const expectedKeys = legacy
    ? ['schemaVersion', 'kind', 'completedAt', 'source', 'chain', 'restore', 'receiptId']
    : ['schemaVersion', 'kind', 'completedAt', 'sequence', 'previousReceipt', 'source', 'chain', 'restore', 'receiptId'];
  add(hasExactKeys(value, expectedKeys), 'receipt.shape');
  add(legacy || current, 'receipt.schemaVersion');
  add(value?.kind === DRILL_KIND, 'receipt.kind');
  add(Number.isFinite(Date.parse(String(value?.completedAt || ''))), 'receipt.completedAt');
  if (current) {
    add(Number.isInteger(value?.sequence) && value.sequence > 0, 'receipt.sequence');
    add(hasExactKeys(value?.previousReceipt, ['receiptId', 'receiptSha256']), 'receipt.previousReceipt.shape');
    const first = value?.sequence === 1;
    add(first ? value?.previousReceipt?.receiptId === '' : /^PDR-[0-9A-F]{24}$/.test(String(value?.previousReceipt?.receiptId || '')), 'receipt.previousReceipt.receiptId');
    add(first ? value?.previousReceipt?.receiptSha256 === '' : /^[0-9a-f]{64}$/.test(String(value?.previousReceipt?.receiptSha256 || '')), 'receipt.previousReceipt.receiptSha256');
  }
  add(hasExactKeys(value?.source, ['mode', 'backupId', 'backupSha256']), 'receipt.source.shape');
  add(['external-mirror', 'local-default'].includes(value?.source?.mode), 'receipt.source.mode');
  add(/^PRB-[0-9A-F]{24}$/.test(String(value?.source?.backupId || '')), 'receipt.source.backupId');
  add(/^[0-9a-f]{64}$/.test(String(value?.source?.backupSha256 || '')), 'receipt.source.backupSha256');
  add(hasExactKeys(value?.chain, ['receiptCount', 'pendingResetCount', 'latestRunId', 'anchorReceiptId', 'anchorReceiptSha256']), 'receipt.chain.shape');
  add(Number.isInteger(value?.chain?.receiptCount) && value.chain.receiptCount > 0, 'receipt.chain.receiptCount');
  add(Number.isInteger(value?.chain?.pendingResetCount) && value.chain.pendingResetCount >= 0 && value.chain.pendingResetCount <= 1, 'receipt.chain.pendingResetCount');
  add(/^\d{8}-\d{6}$/.test(String(value?.chain?.latestRunId || '')), 'receipt.chain.latestRunId');
  add(/^PRD-[0-9A-F]{24}$/.test(String(value?.chain?.anchorReceiptId || '')), 'receipt.chain.anchorReceiptId');
  add(/^[0-9a-f]{64}$/.test(String(value?.chain?.anchorReceiptSha256 || '')), 'receipt.chain.anchorReceiptSha256');
  add(hasExactKeys(value?.restore, ['classification', 'restoredReceiptCount', 'addedDecisionCount', 'addedResetCount', 'anchorValidated', 'sourceUnchanged', 'cleanupCompleted']), 'receipt.restore.shape');
  add(value?.restore?.classification === 'tracked-anchor-bootstrap', 'receipt.restore.classification');
  for (const key of ['restoredReceiptCount', 'addedDecisionCount', 'addedResetCount']) {
    add(Number.isInteger(value?.restore?.[key]) && value.restore[key] >= 0, `receipt.restore.${key}`);
  }
  add(value?.restore?.restoredReceiptCount === value?.chain?.receiptCount, 'receipt.restore.receiptCount');
  add(value?.restore?.addedDecisionCount === value?.chain?.receiptCount, 'receipt.restore.addedDecisionCount');
  add(value?.restore?.anchorValidated === true && value?.restore?.sourceUnchanged === true && value?.restore?.cleanupCompleted === true, 'receipt.restore.proofs');
  if (isObject(value)) {
    const { receiptId: ignored, ...core } = value;
    add(value.receiptId === receiptId(core), 'receipt.receiptId');
  }
  return { pass: errors.length === 0, errors };
}

function loadReceiptHistory(directory, options = {}) {
  const target = path.resolve(directory);
  if (!fs.existsSync(target)) {
    if (options.allowMissing) return { directory: target, entries: [], legacyCount: 0, currentCount: 0 };
    throw new DrillError('receipt-history-invalid', 'restore drill receipt directory is missing');
  }
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new DrillError('receipt-history-invalid', 'restore drill receipt directory must be a regular directory');
  const entries = fs.readdirSync(target)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .map(name => {
      const match = name.match(DRILL_FILE_PATTERN);
      if (!match) throw new DrillError('receipt-history-invalid', 'restore drill receipt filename is invalid');
      const filePath = path.join(target, name);
      const fileStat = fs.lstatSync(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new DrillError('receipt-history-invalid', 'restore drill receipt must be a regular file');
      let receipt;
      try {
        receipt = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      } catch {
        throw new DrillError('receipt-history-invalid', 'restore drill receipt JSON is invalid');
      }
      const validation = validateReceipt(receipt);
      if (!validation.pass || receipt.receiptId !== match[1]) throw new DrillError('receipt-history-invalid', 'restore drill receipt content or filename does not validate');
      return { name, filePath, receipt, fileSha256: sha256File(filePath) };
    })
    .sort((left, right) => Date.parse(left.receipt.completedAt) - Date.parse(right.receipt.completedAt) || left.receipt.receiptId.localeCompare(right.receipt.receiptId));
  const ids = new Set();
  let currentStarted = false;
  entries.forEach((entry, index) => {
    const value = entry.receipt;
    if (ids.has(value.receiptId)) throw new DrillError('receipt-history-invalid', 'restore drill history repeats a receipt ID');
    ids.add(value.receiptId);
    if (value.schemaVersion === LEGACY_DRILL_SCHEMA_VERSION) {
      if (currentStarted) throw new DrillError('receipt-history-invalid', 'legacy restore drill receipt appears after the chained history began');
      return;
    }
    currentStarted = true;
    if (value.sequence !== index + 1) throw new DrillError('receipt-history-invalid', 'restore drill sequence is not contiguous');
    const previous = entries[index - 1]?.receipt || null;
    const expectedPrevious = previous
      ? { receiptId: previous.receiptId, receiptSha256: receipts.digestObject(previous) }
      : { receiptId: '', receiptSha256: '' };
    if (receipts.stableJson(value.previousReceipt) !== receipts.stableJson(expectedPrevious)) {
      throw new DrillError('receipt-history-invalid', 'restore drill receipt does not chain to the prior receipt');
    }
  });
  return {
    directory: target,
    entries,
    legacyCount: entries.filter(entry => entry.receipt.schemaVersion === LEGACY_DRILL_SCHEMA_VERSION).length,
    currentCount: entries.filter(entry => entry.receipt.schemaVersion === DRILL_SCHEMA_VERSION).length,
  };
}

function historiesMatch(left, right) {
  if (left.entries.length !== right.entries.length) return false;
  return left.entries.every((entry, index) => {
    const candidate = right.entries[index];
    return entry.name === candidate.name
      && entry.fileSha256 === candidate.fileSha256
      && receipts.stableJson(entry.receipt) === receipts.stableJson(candidate.receipt);
  });
}

function anchorForReceiptHistory(history) {
  const tip = history.entries.at(-1)?.receipt || null;
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    kind: ANCHOR_KIND,
    receiptCount: history.entries.length,
    receiptId: tip?.receiptId || '',
    receiptSha256: tip ? receipts.digestObject(tip) : '',
  };
}

function validateReceiptAnchor(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'receiptCount', 'receiptId', 'receiptSha256']), 'anchor.shape');
  add(value?.schemaVersion === ANCHOR_SCHEMA_VERSION && value?.kind === ANCHOR_KIND, 'anchor.identity');
  add(Number.isInteger(value?.receiptCount) && value.receiptCount >= 0, 'anchor.receiptCount');
  const inactive = value?.receiptCount === 0;
  add(inactive ? value?.receiptId === '' : /^PDR-[0-9A-F]{24}$/.test(String(value?.receiptId || '')), 'anchor.receiptId');
  add(inactive ? value?.receiptSha256 === '' : /^[0-9a-f]{64}$/.test(String(value?.receiptSha256 || '')), 'anchor.receiptSha256');
  return { pass: errors.length === 0, errors };
}

function loadReceiptAnchor(repoRoot, history) {
  const target = path.join(repoRoot, ...DEFAULT_ANCHOR_FILE.split('/'));
  if (!fs.existsSync(target)) {
    if (history.currentCount === 0) return { initialized: false, target, anchor: anchorForReceiptHistory(history) };
    throw new DrillError('receipt-history-anchor-mismatch', 'chained restore drill history has no private tip anchor');
  }
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('anchor must be a regular file');
    const anchor = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
    const validation = validateReceiptAnchor(anchor);
    if (!validation.pass) throw new Error(validation.errors.join(', '));
    const expected = anchorForReceiptHistory(history);
    if (receipts.stableJson(anchor) !== receipts.stableJson(expected)) throw new Error('anchor does not match history tip');
    return { initialized: true, target, anchor };
  } catch (error) {
    if (error instanceof DrillError) throw error;
    throw new DrillError('receipt-history-anchor-mismatch', `restore drill private tip anchor is invalid: ${error.message}`);
  }
}

function replaceReceiptAnchor(repoRoot, value, hooks = {}) {
  const validation = validateReceiptAnchor(value);
  if (!validation.pass) throw new DrillError('receipt-anchor-write-failed', `new restore drill anchor is invalid: ${validation.errors.join(', ')}`);
  const target = path.join(repoRoot, ...DEFAULT_ANCHOR_FILE.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const previousExists = fs.existsSync(target);
  const previousBytes = previousExists ? fs.readFileSync(target) : null;
  const replaceBytes = bytes => {
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    const displaced = `${target}.${process.pid}.${Date.now()}.bak`;
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    let displacedExisting = false;
    try {
      if (fs.existsSync(target)) {
        fs.renameSync(target, displaced);
        displacedExisting = true;
      }
      fs.renameSync(temporary, target);
      if (displacedExisting) {
        try { fs.rmSync(displaced, { force: true }); }
        catch { /* the committed anchor remains authoritative; a stale private backup is not a transaction failure */ }
      }
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      if (displacedExisting && !fs.existsSync(target)) fs.renameSync(displaced, target);
      else fs.rmSync(displaced, { force: true });
      throw error;
    }
  };
  try {
    if (typeof hooks.beforeAnchorWrite === 'function') hooks.beforeAnchorWrite({ target, value });
    replaceBytes(`${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    throw new DrillError('receipt-anchor-write-failed', `restore drill private tip anchor write failed: ${error.message}`);
  }
  return {
    target,
    rollback() {
      if (previousExists) replaceBytes(previousBytes);
      else fs.rmSync(target, { force: true });
    },
  };
}

function readStatusCheckpoint(repoRoot) {
  const target = path.join(repoRoot, ...DEFAULT_STATUS_FILE.split('/'));
  if (!fs.existsSync(target)) return 0;
  try {
    const status = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
    if (status?.schemaVersion === 1 && status?.kind === STATUS_KIND) return 0;
    const validation = validateStatus(status);
    if (!validation.pass) throw new Error(validation.errors.join(', '));
    return status.receipts.checkpointReceiptCount;
  } catch {
    throw new DrillError('receipt-history-invalid', 'restore drill status checkpoint is invalid');
  }
}

function loadMirroredReceiptHistory(repoRoot, selection, options = {}) {
  const local = loadReceiptHistory(path.join(selection.localDirectory, DRILL_DIRECTORY), { allowMissing: true });
  const external = selection.externalDirectory
    ? loadReceiptHistory(path.join(selection.externalDirectory, DRILL_DIRECTORY), { allowMissing: true })
    : { directory: '', entries: [], legacyCount: 0, currentCount: 0 };
  if (selection.externalDirectory && !historiesMatch(local, external)) {
    throw new DrillError('receipt-history-mismatch', 'local and external restore drill histories differ');
  }
  const checkpointCount = readStatusCheckpoint(repoRoot);
  if (checkpointCount > local.entries.length) {
    throw new DrillError('receipt-history-rollback', 'restore drill history is shorter than its prior monotonic checkpoint');
  }
  const anchorState = options.skipAnchor ? null : loadReceiptAnchor(repoRoot, local);
  return { local, external, checkpointCount, anchorState };
}

function writeNewJson(filePath, value) {
  if (fs.existsSync(filePath)) throw new Error(`append-only file already exists: ${filePath}`);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function writeReceiptTransaction(selection, receipt, hooks = {}) {
  const directories = [path.join(selection.localDirectory, DRILL_DIRECTORY)];
  if (selection.externalDirectory) directories.push(path.join(selection.externalDirectory, DRILL_DIRECTORY));
  const unique = directories.filter((directory, index) => directories.findIndex(candidate => samePath(candidate, directory)) === index);
  unique.forEach(directory => fs.mkdirSync(directory, { recursive: true }));
  const runId = receipt.completedAt.replace(/[-:TZ.]/g, '').slice(0, 14).replace(/^(\d{8})(\d{6})/, '$1-$2');
  const fileName = `public-release-decision-restore-drill-${runId}-${receipt.receiptId}.json`;
  const targets = unique.map(directory => path.join(directory, fileName));
  const written = [];
  try {
    targets.forEach((target, index) => {
      if (typeof hooks.beforeReceiptWrite === 'function') hooks.beforeReceiptWrite({ index, target, targets: targets.slice() });
      writeNewJson(target, receipt);
      written.push(target);
    });
  } catch (error) {
    written.reverse().forEach(target => fs.rmSync(target, { force: true }));
    throw new DrillError('receipt-mirror-write-failed', `restore drill receipt mirror transaction rolled back: ${error.message}`);
  }
  return targets;
}

function statusFor(sourceState, completedAt, fields = {}) {
  const issueCodes = fields.issueCode ? [fields.issueCode] : [];
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    kind: STATUS_KIND,
    checkedAt: completedAt,
    status: issueCodes.length ? 'failed' : 'passed',
    sourceMode: fields.sourceMode || 'unavailable',
    current: {
      receiptCount: sourceState.history.entries.length,
      pendingResetCount: sourceState.history.pendingRunIds.length,
      latestRunId: sourceState.history.entries.at(-1).decision.runId,
    },
    restore: {
      attempted: Boolean(fields.restoreResult),
      completed: Boolean(fields.restoreCompleted),
      classification: fields.restoreResult?.classification || '',
      restoredReceiptCount: fields.restoreResult?.restoredReceiptCount || 0,
      addedDecisionCount: fields.restoreResult?.addedDecisionCount || 0,
      addedResetCount: fields.restoreResult?.addedResetCount || 0,
      anchorValidated: Boolean(fields.anchorValidated),
      sourceUnchanged: Boolean(fields.sourceUnchanged),
      cleanupCompleted: Boolean(fields.cleanupCompleted),
    },
    receipts: {
      localWritten: Boolean(fields.localWritten),
      externalWritten: Boolean(fields.externalWritten),
      mirrorPairWritten: Boolean(fields.localWritten && fields.externalWritten),
      previousReceiptCount: Number.isInteger(fields.previousReceiptCount) ? fields.previousReceiptCount : 0,
      historyReceiptCount: Number.isInteger(fields.historyReceiptCount) ? fields.historyReceiptCount : 0,
      checkpointReceiptCount: Number.isInteger(fields.checkpointReceiptCount) ? fields.checkpointReceiptCount : 0,
      appendVerified: Boolean(fields.appendVerified),
    },
    issueCodes,
  };
}

function validateStatus(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'checkedAt', 'status', 'sourceMode', 'current', 'restore', 'receipts', 'issueCodes']), 'status.shape');
  add(value?.schemaVersion === STATUS_SCHEMA_VERSION && value?.kind === STATUS_KIND, 'status.identity');
  add(Number.isFinite(Date.parse(String(value?.checkedAt || ''))), 'status.checkedAt');
  add(['passed', 'failed'].includes(value?.status), 'status.status');
  add(['external-mirror', 'local-default', 'unavailable'].includes(value?.sourceMode), 'status.sourceMode');
  add(hasExactKeys(value?.current, ['receiptCount', 'pendingResetCount', 'latestRunId']), 'status.current.shape');
  add(Number.isInteger(value?.current?.receiptCount) && value.current.receiptCount > 0, 'status.current.receiptCount');
  add(Number.isInteger(value?.current?.pendingResetCount) && value.current.pendingResetCount >= 0 && value.current.pendingResetCount <= 1, 'status.current.pendingResetCount');
  add(/^\d{8}-\d{6}$/.test(String(value?.current?.latestRunId || '')), 'status.current.latestRunId');
  add(hasExactKeys(value?.restore, ['attempted', 'completed', 'classification', 'restoredReceiptCount', 'addedDecisionCount', 'addedResetCount', 'anchorValidated', 'sourceUnchanged', 'cleanupCompleted']), 'status.restore.shape');
  for (const key of ['attempted', 'completed', 'anchorValidated', 'sourceUnchanged', 'cleanupCompleted']) add(typeof value?.restore?.[key] === 'boolean', `status.restore.${key}`);
  for (const key of ['restoredReceiptCount', 'addedDecisionCount', 'addedResetCount']) add(Number.isInteger(value?.restore?.[key]) && value.restore[key] >= 0, `status.restore.${key}`);
  add(['', 'tracked-anchor-bootstrap', 'forward-extension', 'identical'].includes(value?.restore?.classification), 'status.restore.classification');
  add(hasExactKeys(value?.receipts, ['localWritten', 'externalWritten', 'mirrorPairWritten', 'previousReceiptCount', 'historyReceiptCount', 'checkpointReceiptCount', 'appendVerified']), 'status.receipts.shape');
  for (const key of ['localWritten', 'externalWritten', 'mirrorPairWritten']) add(typeof value?.receipts?.[key] === 'boolean', `status.receipts.${key}`);
  for (const key of ['previousReceiptCount', 'historyReceiptCount', 'checkpointReceiptCount']) add(Number.isInteger(value?.receipts?.[key]) && value.receipts[key] >= 0, `status.receipts.${key}`);
  add(typeof value?.receipts?.appendVerified === 'boolean', 'status.receipts.appendVerified');
  add((value?.receipts?.previousReceiptCount || 0) <= (value?.receipts?.historyReceiptCount || 0), 'status.receipts.countRange');
  add(value?.receipts?.mirrorPairWritten === Boolean(value?.receipts?.localWritten && value?.receipts?.externalWritten), 'status.receipts.mirrorSemantics');
  add(Array.isArray(value?.issueCodes) && value.issueCodes.every(code => ISSUE_CODES.has(code)) && new Set(value.issueCodes).size === value.issueCodes.length, 'status.issueCodes');
  add(value?.status === (value?.issueCodes?.length ? 'failed' : 'passed'), 'status.statusSemantics');
  if (value?.status === 'passed') {
    add(value.sourceMode !== 'unavailable', 'status.pass.source');
    add(value.restore.attempted && value.restore.completed && value.restore.classification === 'tracked-anchor-bootstrap', 'status.pass.restore');
    add(value.restore.anchorValidated && value.restore.sourceUnchanged && value.restore.cleanupCompleted, 'status.pass.proofs');
    add(value.receipts.localWritten, 'status.pass.receipt');
    add(value.sourceMode !== 'external-mirror' || value.receipts.mirrorPairWritten, 'status.pass.externalReceipt');
    add(value.receipts.appendVerified && value.receipts.historyReceiptCount === value.receipts.previousReceiptCount + 1, 'status.pass.historyAppend');
    add(value.receipts.checkpointReceiptCount === value.receipts.historyReceiptCount, 'status.pass.checkpoint');
  }
  return { pass: errors.length === 0, errors };
}

function writeStatus(repoRoot, status, requestedPath = DEFAULT_STATUS_FILE) {
  const validation = validateStatus(status);
  if (!validation.pass) throw new Error(`restore drill status is invalid: ${validation.errors.join(', ')}`);
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error('restore drill status path must stay inside the repository');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

function runRestoreDrill(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const completedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const temporaryParent = path.resolve(options.temporaryParent || os.tmpdir());
  const hooks = options.hooks || {};
  const sourceState = currentSourceState(root);
  let priorCheckpointCount = 0;
  try { priorCheckpointCount = readStatusCheckpoint(root); } catch { /* the governed load below reports the invalid checkpoint */ }
  let selection;
  let receiptHistory = null;
  let isolatedRoot = '';
  let restoreResult = null;
  let restoreCompleted = false;
  let anchorValidated = false;
  let cleanupCompleted = false;
  let issue = null;
  try {
    selection = selectCurrentBackup(root, sourceState, options);
    receiptHistory = loadMirroredReceiptHistory(root, selection);
    if (!fs.existsSync(temporaryParent) || !fs.lstatSync(temporaryParent).isDirectory()) {
      throw new DrillError('backup-directory-unavailable', 'temporary isolation parent is unavailable');
    }
    isolatedRoot = fs.mkdtempSync(path.join(temporaryParent, ISOLATION_PREFIX));
    const isolatedAnchor = path.join(isolatedRoot, ...receipts.ANCHOR_FILE.split('/'));
    fs.mkdirSync(path.dirname(isolatedAnchor), { recursive: true });
    fs.copyFileSync(path.join(root, ...receipts.ANCHOR_FILE.split('/')), isolatedAnchor);
    if (typeof hooks.beforeRestore === 'function') hooks.beforeRestore({ isolatedRoot, backup: selection.selected.backup });
    restoreResult = backups.applyRestore(isolatedRoot, selection.selected.backup);
    if (restoreResult.classification !== 'tracked-anchor-bootstrap' || !restoreResult.changed) {
      throw new Error('isolated restore did not perform a tracked-anchor bootstrap');
    }
    const restoredHistory = receipts.loadDecisionHistory(isolatedRoot);
    const restoredAnchor = receipts.validateDecisionHistoryAnchor(isolatedRoot, restoredHistory).anchor;
    if (restoredHistory.entries.length !== sourceState.history.entries.length
      || receipts.stableJson(restoredAnchor) !== receipts.stableJson(sourceState.anchor)) {
      throw new Error('isolated restored chain does not match the current source chain');
    }
    anchorValidated = true;
    restoreCompleted = true;
    if (typeof hooks.afterRestore === 'function') hooks.afterRestore({ isolatedRoot, repoRoot: root });
  } catch (error) {
    issue = error instanceof DrillError ? error : new DrillError('isolated-restore-failed', error.message);
  } finally {
    try {
      if (typeof hooks.beforeCleanup === 'function') hooks.beforeCleanup({ isolatedRoot, temporaryParent });
      safeRemoveIsolation(isolatedRoot, temporaryParent);
      cleanupCompleted = true;
    } catch (error) {
      issue = new DrillError('isolation-cleanup-failed', error.message);
      try { safeRemoveIsolation(isolatedRoot, temporaryParent); } catch { /* preserve the failure result */ }
    }
  }
  const sourceUnchanged = sourceFileFingerprint(root) === sourceState.fingerprint;
  if (!sourceUnchanged) issue = new DrillError('source-repository-changed', 'source release decision files changed during the isolated drill');
  if (issue) {
    const status = statusFor(sourceState, completedAt, {
      issueCode: issue.code,
      sourceMode: selection?.mode || 'unavailable',
      restoreResult,
      restoreCompleted,
      anchorValidated,
      sourceUnchanged,
      cleanupCompleted,
      previousReceiptCount: receiptHistory?.local.entries.length || 0,
      historyReceiptCount: receiptHistory?.local.entries.length || 0,
      checkpointReceiptCount: Math.max(priorCheckpointCount, receiptHistory?.local.entries.length || 0),
    });
    const validation = validateStatus(status);
    if (!validation.pass) throw new Error(`generated failed restore drill status is invalid: ${validation.errors.join(', ')}`);
    return { pass: false, status, error: issue };
  }
  const previousReceiptCount = receiptHistory.local.entries.length;
  const receipt = buildReceipt(completedAt, selection, sourceState, restoreResult, receiptHistory.local);
  let targets;
  try {
    targets = writeReceiptTransaction(selection, receipt, hooks);
  } catch (error) {
    const issueCode = error instanceof DrillError ? error.code : 'receipt-mirror-write-failed';
    const status = statusFor(sourceState, completedAt, {
      issueCode,
      sourceMode: selection.mode,
      restoreResult,
      restoreCompleted,
      anchorValidated,
      sourceUnchanged,
      cleanupCompleted,
      previousReceiptCount,
      historyReceiptCount: previousReceiptCount,
      checkpointReceiptCount: Math.max(priorCheckpointCount, previousReceiptCount),
    });
    return { pass: false, status, error };
  }
  let verifiedHistory;
  let anchorReplacement = null;
  try {
    verifiedHistory = loadMirroredReceiptHistory(root, selection, { skipAnchor: true });
    const latest = verifiedHistory.local.entries.at(-1)?.receipt;
    if (verifiedHistory.local.entries.length !== previousReceiptCount + 1 || latest?.receiptId !== receipt.receiptId) {
      throw new DrillError('receipt-history-invalid', 'restore drill receipt append did not become the validated history tip');
    }
    anchorReplacement = replaceReceiptAnchor(root, anchorForReceiptHistory(verifiedHistory.local), hooks);
    if (typeof hooks.afterAnchorWrite === 'function') hooks.afterAnchorWrite({ target: anchorReplacement.target, receipt });
    verifiedHistory = loadMirroredReceiptHistory(root, selection);
  } catch (error) {
    targets.reverse().forEach(target => fs.rmSync(target, { force: true }));
    let transactionError = error;
    if (anchorReplacement) {
      try { anchorReplacement.rollback(); }
      catch (rollbackError) {
        transactionError = new DrillError('receipt-anchor-write-failed', `restore drill anchor rollback failed: ${rollbackError.message}`);
      }
    }
    const issueCode = transactionError instanceof DrillError ? transactionError.code : 'receipt-history-invalid';
    const status = statusFor(sourceState, completedAt, {
      issueCode,
      sourceMode: selection.mode,
      restoreResult,
      restoreCompleted,
      anchorValidated,
      sourceUnchanged,
      cleanupCompleted,
      previousReceiptCount,
      historyReceiptCount: previousReceiptCount,
      checkpointReceiptCount: Math.max(priorCheckpointCount, previousReceiptCount),
    });
    return { pass: false, status, error: transactionError };
  }
  const status = statusFor(sourceState, completedAt, {
    sourceMode: selection.mode,
    restoreResult,
    restoreCompleted,
    anchorValidated,
    sourceUnchanged,
    cleanupCompleted,
    localWritten: targets.length >= 1,
    externalWritten: targets.length >= 2,
    previousReceiptCount,
    historyReceiptCount: verifiedHistory.local.entries.length,
    checkpointReceiptCount: verifiedHistory.local.entries.length,
    appendVerified: true,
  });
  const validation = validateStatus(status);
  if (!validation.pass) throw new Error(`generated restore drill status is invalid: ${validation.errors.join(', ')}`);
  return { pass: true, status, receipt, targets };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--json' || token === '--require-external') options[token.slice(2)] = true;
    else if (token === '--repo-root' || token === '--status-file') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  const result = runRestoreDrill(repoRoot, { requireExternal: options['require-external'] === true });
  const target = options.write ? writeStatus(repoRoot, result.status, options['status-file'] || DEFAULT_STATUS_FILE) : '';
  const output = { ...result.status, written: Boolean(target) };
  console.log(options.json ? JSON.stringify(output, null, 2) : `release decision restore drill: ${result.status.status} (source=${result.status.sourceMode}, receipts=${result.status.current.receiptCount}, issues=${result.status.issueCodes.length})`);
  if (!result.pass) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release decision restore drill blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  LEGACY_DRILL_SCHEMA_VERSION,
  DRILL_SCHEMA_VERSION,
  STATUS_SCHEMA_VERSION,
  ANCHOR_SCHEMA_VERSION,
  DRILL_KIND,
  STATUS_KIND,
  ANCHOR_KIND,
  DEFAULT_STATUS_FILE,
  DEFAULT_ANCHOR_FILE,
  DRILL_DIRECTORY,
  DRILL_FILE_PATTERN,
  ISSUE_CODES,
  sourceFileFingerprint,
  validateReceipt,
  loadReceiptHistory,
  historiesMatch,
  anchorForReceiptHistory,
  validateReceiptAnchor,
  loadReceiptAnchor,
  replaceReceiptAnchor,
  readStatusCheckpoint,
  loadMirroredReceiptHistory,
  validateStatus,
  writeStatus,
  runRestoreDrill,
  parseArgs,
};
