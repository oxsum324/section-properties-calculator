const fs = require('fs');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_KIND = 'public-release-decision-backup';
const DEFAULT_BACKUP_DIR = 'output/private-backups/public-release-decisions';
const HISTORY_DIR = 'output/preflight/history';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label} is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function backupId(core) {
  return `PRB-${receipts.digestObject(core).slice(0, 24).toUpperCase()}`;
}

function backupCore(exportedAt, history, anchor) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: BACKUP_KIND,
    exportedAt,
    chain: {
      anchor: clone(anchor),
      receiptCount: history.entries.length,
      pendingResetCount: history.pendingRunIds.length,
      firstRunId: history.entries[0]?.decision.runId || '',
      latestRunId: history.entries.at(-1)?.decision.runId || '',
      entries: history.entries.map(entry => ({
        runId: entry.decision.runId,
        decision: clone(entry.decision),
        reset: entry.reset ? clone(entry.reset) : null,
      })),
    },
  };
}

function assertValidBackup(backup) {
  if (!hasExactKeys(backup, ['schemaVersion', 'kind', 'backupId', 'exportedAt', 'chain'])) throw new Error('backup has undeclared or missing fields');
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION || backup.kind !== BACKUP_KIND) throw new Error('backup schema or kind is unsupported');
  if (!Number.isFinite(Date.parse(String(backup.exportedAt || '')))) throw new Error('backup exportedAt is invalid');
  if (!hasExactKeys(backup.chain, ['anchor', 'receiptCount', 'pendingResetCount', 'firstRunId', 'latestRunId', 'entries'])) throw new Error('backup chain has undeclared or missing fields');
  if (!Array.isArray(backup.chain.entries) || backup.chain.entries.length === 0) throw new Error('backup must contain at least one decision receipt');
  const portableEntries = backup.chain.entries.map((entry, index) => {
    if (!hasExactKeys(entry, ['runId', 'decision', 'reset'])) throw new Error(`backup entry ${index} has undeclared or missing fields`);
    if (entry.runId !== entry.decision?.runId) throw new Error(`backup entry runId mismatch at index ${index}`);
    return { decision: entry.decision, reset: entry.reset };
  });
  const history = receipts.validateDecisionHistoryEntries(portableEntries);
  if (backup.chain.receiptCount !== history.entries.length) throw new Error('backup receiptCount is invalid');
  if (backup.chain.pendingResetCount !== history.pendingRunIds.length) throw new Error('backup pendingResetCount is invalid');
  if (backup.chain.firstRunId !== history.entries[0].decision.runId) throw new Error('backup firstRunId is invalid');
  if (backup.chain.latestRunId !== history.entries.at(-1).decision.runId) throw new Error('backup latestRunId is invalid');
  const expectedAnchor = receipts.anchorForDecision(history.entries.at(-1).decision);
  if (receipts.stableJson(backup.chain.anchor) !== receipts.stableJson(expectedAnchor)) throw new Error('backup anchor does not match its chain tip');
  const { backupId: ignored, ...core } = backup;
  if (backup.backupId !== backupId(core)) throw new Error('backup content-derived ID is invalid');
  return { backup, history };
}

function validateBackup(backup) {
  try {
    const result = assertValidBackup(backup);
    return { pass: true, errors: [], history: result.history };
  } catch (error) {
    return { pass: false, errors: [error.message] };
  }
}

function buildBackup(repoRoot, exportedAt = new Date().toISOString()) {
  const history = receipts.loadDecisionHistory(repoRoot);
  const anchorState = receipts.validateDecisionHistoryAnchor(repoRoot, history);
  if (!history.entries.length) throw new Error('no private release decision receipts are available to back up');
  const core = backupCore(exportedAt, history, anchorState.anchor);
  const backup = { ...core, backupId: backupId(core) };
  assertValidBackup(backup);
  return backup;
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

function exportBackup(repoRoot, outputDir = path.join(repoRoot, ...DEFAULT_BACKUP_DIR.split('/')), exportedAt) {
  const backup = buildBackup(repoRoot, exportedAt);
  const directory = path.resolve(outputDir);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `public-release-decision-backup-${backup.chain.latestRunId}-${backup.backupId}.json`);
  writeNewJson(target, backup);
  return { changed: true, target, backup };
}

function loadBackup(backupPath) {
  const target = path.resolve(backupPath);
  const backup = readJson(target, 'release decision backup');
  const validated = assertValidBackup(backup);
  return { target, backup: validated.backup, history: validated.history };
}

function planRestore(repoRoot, backupInput) {
  const validated = assertValidBackup(backupInput);
  const incoming = validated.history.entries;
  const current = receipts.loadDecisionHistory(repoRoot);
  let currentAnchorValid = true;
  try {
    receipts.validateDecisionHistoryAnchor(repoRoot, current);
  } catch (error) {
    currentAnchorValid = false;
    const trackedAnchor = readJson(path.join(repoRoot, ...receipts.ANCHOR_FILE.split('/')), 'tracked release decision anchor');
    if (receipts.stableJson(trackedAnchor) !== receipts.stableJson(backupInput.chain.anchor)) throw error;
  }
  if (current.entries.length > incoming.length) throw new Error('backup is older than the current private decision chain');
  const operations = [];
  current.entries.forEach((entry, index) => {
    const candidate = incoming[index];
    if (receipts.stableJson(entry.decision) !== receipts.stableJson(candidate.decision)) {
      throw new Error(`backup forks from the current decision chain at ${entry.decision.runId}`);
    }
    if (entry.reset && receipts.stableJson(entry.reset) !== receipts.stableJson(candidate.reset)) {
      throw new Error(`backup changes an existing reset receipt at ${entry.decision.runId}`);
    }
    if (!entry.reset && candidate.reset) operations.push({ type: 'reset', runId: candidate.decision.runId, value: candidate.reset });
  });
  for (let index = current.entries.length; index < incoming.length; index += 1) {
    const entry = incoming[index];
    operations.push({ type: 'decision', runId: entry.decision.runId, value: entry.decision });
    if (entry.reset) operations.push({ type: 'reset', runId: entry.decision.runId, value: entry.reset });
  }
  return {
    changed: operations.length > 0,
    classification: operations.length ? (currentAnchorValid ? 'forward-extension' : 'tracked-anchor-bootstrap') : 'identical',
    currentReceiptCount: current.entries.length,
    restoredReceiptCount: incoming.length,
    addedDecisionCount: operations.filter(item => item.type === 'decision').length,
    addedResetCount: operations.filter(item => item.type === 'reset').length,
    latestRunId: incoming.at(-1).decision.runId,
    operations,
    anchor: clone(backupInput.chain.anchor),
  };
}

function ensureDirectory(directory, createdDirectories) {
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`restore directory must be a regular directory: ${directory}`);
    return;
  }
  ensureDirectory(path.dirname(directory), createdDirectories);
  fs.mkdirSync(directory);
  createdDirectories.push(directory);
}

function replaceAnchor(anchorPath, value) {
  const stat = fs.lstatSync(anchorPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('tracked release decision anchor must be a regular file');
  const temporary = `${anchorPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, anchorPath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function applyRestore(repoRoot, backupInput, hooks = {}) {
  const plan = planRestore(repoRoot, backupInput);
  if (!plan.changed) return plan;
  const anchorPath = path.join(repoRoot, ...receipts.ANCHOR_FILE.split('/'));
  const previousAnchorContents = fs.readFileSync(anchorPath, 'utf8');
  const createdFiles = [];
  const createdDirectories = [];
  try {
    for (const operation of plan.operations) {
      const directory = path.join(repoRoot, ...HISTORY_DIR.split('/'), operation.runId);
      ensureDirectory(directory, createdDirectories);
      const fileName = operation.type === 'decision' ? receipts.DECISION_FILE : receipts.RESET_FILE;
      const target = path.join(directory, fileName);
      writeNewJson(target, operation.value);
      createdFiles.push(target);
    }
    if (typeof hooks.beforeAnchorReplace === 'function') hooks.beforeAnchorReplace({ plan, createdFiles: createdFiles.slice() });
    replaceAnchor(anchorPath, plan.anchor);
    const restored = receipts.loadDecisionHistory(repoRoot);
    receipts.validateDecisionHistoryAnchor(repoRoot, restored);
    if (restored.entries.length !== plan.restoredReceiptCount || restored.entries.at(-1)?.decision.runId !== plan.latestRunId) {
      throw new Error('restored private decision chain does not match the backup tip');
    }
    return plan;
  } catch (error) {
    fs.writeFileSync(anchorPath, previousAnchorContents, 'utf8');
    createdFiles.reverse().forEach(filePath => fs.rmSync(filePath, { force: true }));
    createdDirectories.reverse().forEach(directory => {
      try { fs.rmdirSync(directory); } catch { /* preserve non-empty pre-existing state */ }
    });
    throw new Error(`release decision restore rolled back: ${error.message}`);
  }
}

function parseArgs(argv) {
  const options = {};
  const actions = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--export') {
      options.export = true;
      actions.push('export');
    } else if (token === '--verify' || token === '--restore' || token === '--repo-root' || token === '--output-dir') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = argv[++index];
      if (token === '--verify' || token === '--restore') actions.push(token.slice(2));
    } else if (token === '--apply' || token === '--json') {
      options[token.slice(2)] = true;
    } else throw new Error(`unknown argument: ${token}`);
  }
  if (actions.length !== 1) throw new Error('choose exactly one of --export, --verify, or --restore');
  if (options.apply && !options.restore) throw new Error('--apply is accepted only with --restore');
  if (options['output-dir'] && !options.export) throw new Error('--output-dir is accepted only with --export');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  let output;
  if (options.export) {
    const configuredDirectory = options['output-dir'] || process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '';
    const directory = configuredDirectory ? path.resolve(configuredDirectory) : path.join(repoRoot, ...DEFAULT_BACKUP_DIR.split('/'));
    const result = exportBackup(repoRoot, directory);
    output = {
      schemaVersion: 1,
      kind: 'public-release-decision-backup-result',
      action: 'export',
      changed: result.changed,
      backupId: result.backup.backupId,
      receiptCount: result.backup.chain.receiptCount,
      latestRunId: result.backup.chain.latestRunId,
      target: result.target,
    };
  } else {
    const loaded = loadBackup(options.verify || options.restore);
    if (options.verify) {
      output = {
        schemaVersion: 1,
        kind: 'public-release-decision-backup-result',
        action: 'verify',
        changed: false,
        backupId: loaded.backup.backupId,
        receiptCount: loaded.backup.chain.receiptCount,
        latestRunId: loaded.backup.chain.latestRunId,
        target: loaded.target,
      };
    } else {
      const plan = options.apply ? applyRestore(repoRoot, loaded.backup) : planRestore(repoRoot, loaded.backup);
      output = {
        schemaVersion: 1,
        kind: 'public-release-decision-backup-result',
        action: options.apply ? 'restore' : 'restore-preview',
        changed: plan.changed,
        classification: plan.classification,
        backupId: loaded.backup.backupId,
        currentReceiptCount: plan.currentReceiptCount,
        restoredReceiptCount: plan.restoredReceiptCount,
        addedDecisionCount: plan.addedDecisionCount,
        addedResetCount: plan.addedResetCount,
        latestRunId: plan.latestRunId,
        target: loaded.target,
      };
    }
  }
  console.log(options.json ? JSON.stringify(output, null, 2) : `${output.action} OK: ${output.backupId} (receipts=${output.receiptCount ?? output.restoredReceiptCount}, latest=${output.latestRunId})`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release decision backup blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  BACKUP_KIND,
  DEFAULT_BACKUP_DIR,
  backupId,
  validateBackup,
  buildBackup,
  exportBackup,
  loadBackup,
  planRestore,
  applyRestore,
  parseArgs,
};
