const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const health = require('./public-release-decision-backup-health.js');

const DRILL_SCHEMA_VERSION = 1;
const DRILL_KIND = 'public-release-decision-restore-drill-receipt';
const STATUS_KIND = 'public-release-decision-restore-drill-status';
const DEFAULT_STATUS_FILE = 'output/audit/public-release-decision-restore-drill.json';
const DRILL_DIRECTORY = 'restore-drills';
const ISOLATION_PREFIX = 'public-release-decision-restore-drill-';
const ISSUE_CODES = new Set([
  'external-backup-not-configured',
  'external-backup-matches-local-directory',
  'backup-directory-unavailable',
  'current-backup-pair-missing',
  'isolated-restore-failed',
  'isolation-cleanup-failed',
  'source-repository-changed',
  'receipt-mirror-write-failed',
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

function buildReceipt(completedAt, selection, sourceState, restoreResult) {
  const core = {
    schemaVersion: DRILL_SCHEMA_VERSION,
    kind: DRILL_KIND,
    completedAt,
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
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'completedAt', 'source', 'chain', 'restore', 'receiptId']), 'receipt.shape');
  add(value?.schemaVersion === DRILL_SCHEMA_VERSION, 'receipt.schemaVersion');
  add(value?.kind === DRILL_KIND, 'receipt.kind');
  add(Number.isFinite(Date.parse(String(value?.completedAt || ''))), 'receipt.completedAt');
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
    schemaVersion: DRILL_SCHEMA_VERSION,
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
    },
    issueCodes,
  };
}

function validateStatus(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'checkedAt', 'status', 'sourceMode', 'current', 'restore', 'receipts', 'issueCodes']), 'status.shape');
  add(value?.schemaVersion === DRILL_SCHEMA_VERSION && value?.kind === STATUS_KIND, 'status.identity');
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
  add(hasExactKeys(value?.receipts, ['localWritten', 'externalWritten', 'mirrorPairWritten']), 'status.receipts.shape');
  for (const key of ['localWritten', 'externalWritten', 'mirrorPairWritten']) add(typeof value?.receipts?.[key] === 'boolean', `status.receipts.${key}`);
  add(value?.receipts?.mirrorPairWritten === Boolean(value?.receipts?.localWritten && value?.receipts?.externalWritten), 'status.receipts.mirrorSemantics');
  add(Array.isArray(value?.issueCodes) && value.issueCodes.every(code => ISSUE_CODES.has(code)) && new Set(value.issueCodes).size === value.issueCodes.length, 'status.issueCodes');
  add(value?.status === (value?.issueCodes?.length ? 'failed' : 'passed'), 'status.statusSemantics');
  if (value?.status === 'passed') {
    add(value.sourceMode !== 'unavailable', 'status.pass.source');
    add(value.restore.attempted && value.restore.completed && value.restore.classification === 'tracked-anchor-bootstrap', 'status.pass.restore');
    add(value.restore.anchorValidated && value.restore.sourceUnchanged && value.restore.cleanupCompleted, 'status.pass.proofs');
    add(value.receipts.localWritten, 'status.pass.receipt');
    add(value.sourceMode !== 'external-mirror' || value.receipts.mirrorPairWritten, 'status.pass.externalReceipt');
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
  let selection;
  let isolatedRoot = '';
  let restoreResult = null;
  let restoreCompleted = false;
  let anchorValidated = false;
  let cleanupCompleted = false;
  let issue = null;
  try {
    selection = selectCurrentBackup(root, sourceState, options);
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
    });
    const validation = validateStatus(status);
    if (!validation.pass) throw new Error(`generated failed restore drill status is invalid: ${validation.errors.join(', ')}`);
    return { pass: false, status, error: issue };
  }
  const receipt = buildReceipt(completedAt, selection, sourceState, restoreResult);
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
    });
    return { pass: false, status, error };
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
  DRILL_SCHEMA_VERSION,
  DRILL_KIND,
  STATUS_KIND,
  DEFAULT_STATUS_FILE,
  DRILL_DIRECTORY,
  ISSUE_CODES,
  sourceFileFingerprint,
  validateReceipt,
  validateStatus,
  writeStatus,
  runRestoreDrill,
  parseArgs,
};
