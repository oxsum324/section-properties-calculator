const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');

const clone = value => JSON.parse(JSON.stringify(value));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

function withId(prefix, core) {
  return { ...core, receiptId: `${prefix}-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
}

function decisionFor(runId, previous = null, source = 'a'.repeat(40)) {
  const core = {
    schemaVersion: receipts.DECISION_SCHEMA_VERSION,
    kind: receipts.DECISION_KIND,
    generatedAt: `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)}T${runId.slice(9, 11)}:${runId.slice(11, 13)}:${runId.slice(13, 15)}Z`,
    runId,
    sourceCommitSha: source,
    sourceBranch: 'master',
    sourceDirty: false,
    preflight: { recordsPassed: 84, recordsRequired: 84, postChecksPassed: 3, postChecksRequired: 3 },
    change: { baselineRunId: previous?.runId || '', classification: previous ? 'unchanged' : 'baseline', increases: [], reductions: [] },
    authorization: { state: 'not-required' },
    reset: { state: 'not-applicable' },
    evidence: {
      publicBundleSha256: '1'.repeat(64),
      preflightSummarySha256: '2'.repeat(64),
      renderedEvidenceSha256: '3'.repeat(64),
    },
    previousReceipt: previous
      ? { receiptId: previous.receiptId, receiptSha256: receipts.digestObject(previous) }
      : { receiptId: '', receiptSha256: '' },
  };
  return withId('PRD', core);
}

function reducedDecisionFor(runId) {
  const previousRunId = '20990104-000000';
  const reductions = [{ id: 'steelResult', from: 2, to: 1 }];
  const authorization = {
    previousRunId,
    reasonCode: 'scope-change',
    reason: '公開工具範圍調整，移除已停用且不再交付的既有頁面。',
    reductions,
  };
  const core = {
    schemaVersion: receipts.DECISION_SCHEMA_VERSION,
    kind: receipts.DECISION_KIND,
    generatedAt: '2099-01-04T01:01:01Z',
    runId,
    sourceCommitSha: 'd'.repeat(40),
    sourceBranch: 'master',
    sourceDirty: false,
    preflight: { recordsPassed: 84, recordsRequired: 84, postChecksPassed: 3, postChecksRequired: 3 },
    change: { baselineRunId: previousRunId, classification: 'reduced', increases: [], reductions },
    authorization: { state: 'used', ...authorization },
    reset: { state: 'pending' },
    evidence: {
      publicBundleSha256: '4'.repeat(64),
      preflightSummarySha256: '5'.repeat(64),
      renderedEvidenceSha256: '6'.repeat(64),
    },
    previousReceipt: { receiptId: '', receiptSha256: '' },
  };
  return withId('PRD', core);
}

function resetFor(decision) {
  const authorization = {
    previousRunId: decision.authorization.previousRunId,
    reasonCode: decision.authorization.reasonCode,
    reason: decision.authorization.reason,
    reductions: decision.authorization.reductions,
  };
  const active = {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    ...authorization,
  };
  const core = {
    schemaVersion: receipts.RESET_SCHEMA_VERSION,
    kind: receipts.RESET_KIND,
    generatedAt: '2099-01-04T02:02:02Z',
    runId: decision.runId,
    decisionReceiptId: decision.receiptId,
    decisionReceiptSha256: receipts.digestObject(decision),
    authorization,
    configBeforeSha256: receipts.digestObject(active),
    configAfterSha256: receipts.digestObject(receipts.inactiveAuthorization()),
    result: 'inactive',
  };
  return withId('PRA', core);
}

function initializeRepo(root, entries = []) {
  writeJson(
    path.join(root, '.github', 'public-release-decision-anchor.json'),
    entries.length ? receipts.anchorForDecision(entries.at(-1).decision) : receipts.inactiveAnchor(),
  );
  entries.forEach(entry => {
    const directory = path.join(root, 'output', 'preflight', 'history', entry.decision.runId);
    writeJson(path.join(directory, receipts.DECISION_FILE), entry.decision);
    if (entry.reset) writeJson(path.join(directory, receipts.RESET_FILE), entry.reset);
  });
}

const first = decisionFor('20990101-010101');
const second = decisionFor('20990102-020202', first, 'b'.repeat(40));
const fullEntries = [{ decision: first, reset: null }, { decision: second, reset: null }];
const roots = [];
const tempRoot = prefix => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
};

try {
  const sourceRoot = tempRoot('decision-backup-source-');
  initializeRepo(sourceRoot, fullEntries);
  const backup = backups.buildBackup(sourceRoot, '2099-01-03T03:03:03Z');
  assert.match(backup.backupId, /^PRB-[0-9A-F]{24}$/, 'backup has a content-derived ID');
  assert.equal(backup.chain.receiptCount, 2, 'backup contains the complete decision chain');
  assert.equal(backups.validateBackup(backup).pass, true, 'closed backup validates');
  assert.equal(backups.validateBackup({ ...backup, undeclared: true }).pass, false, 'backup rejects undeclared fields');
  const tampered = clone(backup);
  tampered.chain.entries[0].decision.evidence.publicBundleSha256 = 'f'.repeat(64);
  assert.equal(backups.validateBackup(tampered).pass, false, 'tampered receipt invalidates the backup');

  const exportDir = path.join(sourceRoot, 'portable');
  const exported = backups.exportBackup(sourceRoot, exportDir, '2099-01-03T04:04:04Z');
  assert.equal(fs.existsSync(exported.target), true, 'export writes one portable backup file');
  assert.equal(backups.loadBackup(exported.target).backup.backupId, exported.backup.backupId, 'written backup verifies from disk');
  assert.throws(() => backups.exportBackup(sourceRoot, exportDir, '2099-01-03T04:04:04Z'), /already exists/, 'same append-only backup cannot be overwritten');

  const emptyRoot = tempRoot('decision-backup-empty-');
  initializeRepo(emptyRoot);
  const preview = backups.planRestore(emptyRoot, backup);
  assert.equal(preview.classification, 'forward-extension', 'empty workspace previews a forward-only restore');
  assert.equal(preview.addedDecisionCount, 2, 'preview reports both missing decisions');
  assert.equal(receipts.loadDecisionHistory(emptyRoot).entries.length, 0, 'restore preview is read-only');
  const restored = backups.applyRestore(emptyRoot, backup);
  assert.equal(restored.changed, true, 'restore applies a forward extension');
  assert.equal(receipts.loadDecisionHistory(emptyRoot).entries.length, 2, 'restore recreates the complete chain');
  assert.equal(receipts.validateDecisionHistoryAnchor(emptyRoot).anchor.receiptId, second.receiptId, 'restore advances the tracked anchor to the imported tip');
  assert.equal(backups.applyRestore(emptyRoot, backup).changed, false, 'identical restore is idempotent');

  const cloneRoot = tempRoot('decision-backup-git-clone-');
  initializeRepo(cloneRoot);
  writeJson(path.join(cloneRoot, receipts.ANCHOR_FILE), backup.chain.anchor);
  const bootstrap = backups.planRestore(cloneRoot, backup);
  assert.equal(bootstrap.classification, 'tracked-anchor-bootstrap', 'clean clone can bootstrap only from the backup bound to its tracked anchor');
  backups.applyRestore(cloneRoot, backup);
  assert.equal(receipts.validateDecisionHistoryAnchor(cloneRoot).anchor.receiptId, second.receiptId, 'tracked-anchor bootstrap recreates the private chain');

  const oneRoot = tempRoot('decision-backup-one-');
  initializeRepo(oneRoot, fullEntries.slice(0, 1));
  const forward = backups.applyRestore(oneRoot, backup);
  assert.equal(forward.addedDecisionCount, 1, 'existing prefix imports only the missing suffix');
  assert.equal(receipts.loadDecisionHistory(oneRoot).entries.length, 2, 'forward suffix restore validates');

  const forkRoot = tempRoot('decision-backup-fork-');
  const fork = decisionFor(first.runId, null, 'c'.repeat(40));
  initializeRepo(forkRoot, [{ decision: fork, reset: null }]);
  assert.throws(() => backups.planRestore(forkRoot, backup), /forks from/, 'different existing receipt blocks a forked restore');

  const oldSource = tempRoot('decision-backup-old-source-');
  initializeRepo(oldSource, fullEntries.slice(0, 1));
  const oldBackup = backups.buildBackup(oldSource, '2099-01-03T05:05:05Z');
  assert.throws(() => backups.planRestore(emptyRoot, oldBackup), /older than/, 'older backup cannot roll back a newer local chain');

  const rollbackRoot = tempRoot('decision-backup-rollback-');
  initializeRepo(rollbackRoot);
  assert.throws(
    () => backups.applyRestore(rollbackRoot, backup, { beforeAnchorReplace: () => { throw new Error('simulated anchor failure'); } }),
    /rolled back/,
    'post-write failure triggers a transactional rollback',
  );
  assert.equal(receipts.loadDecisionHistory(rollbackRoot).entries.length, 0, 'rollback removes every newly created receipt');
  assert.deepEqual(readJson(path.join(rollbackRoot, receipts.ANCHOR_FILE)), receipts.inactiveAnchor(), 'rollback restores the original anchor');

  const reduced = reducedDecisionFor('20990104-010101');
  const reset = resetFor(reduced);
  const resetSource = tempRoot('decision-backup-reset-source-');
  initializeRepo(resetSource, [{ decision: reduced, reset }]);
  const resetBackup = backups.buildBackup(resetSource, '2099-01-04T03:03:03Z');
  const resetTarget = tempRoot('decision-backup-reset-target-');
  initializeRepo(resetTarget, [{ decision: reduced, reset: null }]);
  const resetPlan = backups.applyRestore(resetTarget, resetBackup);
  assert.equal(resetPlan.addedDecisionCount, 0, 'reset-only extension does not rewrite its decision receipt');
  assert.equal(resetPlan.addedResetCount, 1, 'reset-only extension imports the missing linked reset receipt');
  assert.equal(receipts.loadDecisionHistory(resetTarget).pendingRunIds.length, 0, 'restored reset closes the pending authorization lifecycle');

  const cliTarget = path.join(sourceRoot, 'portable', path.basename(exported.target));
  const cli = path.join(__dirname, 'public-release-decision-backup.js');
  const verified = JSON.parse(childProcess.execFileSync(process.execPath, [cli, '--verify', cliTarget, '--json'], { encoding: 'utf8' }));
  assert.equal(verified.action, 'verify', 'CLI verifies a portable backup read-only');
  const environmentBackupDir = path.join(sourceRoot, 'environment-backups');
  const environmentExport = JSON.parse(childProcess.execFileSync(process.execPath, [cli, '--export', '--repo-root', sourceRoot, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_RELEASE_DECISION_BACKUP_DIR: environmentBackupDir },
  }));
  assert.equal(environmentExport.mirrorCount, 1, 'private environment setting adds one external mirror without replacing the local backup');
  assert.equal(environmentExport.targets.some(target => path.dirname(target) === environmentBackupDir), true, 'private environment setting mirrors to the external directory without entering repository config');
  assert.equal(environmentExport.targets.some(target => path.dirname(target) === path.join(sourceRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'))), true, 'automatic export preserves its ignored local copy');

  const mirrorRollbackDir = path.join(sourceRoot, 'mirror-rollback');
  assert.throws(
    () => backups.exportBackup(sourceRoot, path.join(sourceRoot, 'primary-rollback'), '2099-01-03T06:06:06Z', [mirrorRollbackDir], {
      beforeWrite: ({ index }) => { if (index === 1) throw new Error('simulated mirror failure'); },
    }),
    /mirror transaction rolled back/,
    'mirror failure rolls back the whole newly exported backup set',
  );
  assert.equal(fs.readdirSync(path.join(sourceRoot, 'primary-rollback')).length, 0, 'mirror rollback removes the primary copy created in the failed transaction');
  const cliPreview = JSON.parse(childProcess.execFileSync(process.execPath, [cli, '--restore', cliTarget, '--repo-root', oneRoot, '--json'], { encoding: 'utf8' }));
  assert.equal(cliPreview.action, 'restore-preview', 'CLI restore defaults to preview');
  assert.throws(() => backups.parseArgs(['--export', '--verify', 'x.json']), /exactly one/, 'CLI actions are mutually exclusive');
  assert.throws(() => backups.parseArgs(['--apply', '--export']), /only with/, 'CLI apply requires restore');
  assert.throws(() => backups.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI arguments fail closed');
} finally {
  roots.reverse().forEach(root => fs.rmSync(root, { recursive: true, force: true }));
}

const repoRoot = path.resolve(__dirname, '..', '..');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
assert.ok(preflight.includes('public-release-decision-backup.test.js'), 'preflight includes the portable backup contract');
assert.ok(preflight.indexOf('$decisionReceiptScript') < preflight.indexOf('$decisionBackupScript'), 'formal release exports only after the decision receipt is complete');
assert.ok(preflight.includes('PUBLIC_RELEASE_DECISION_BACKUP_DIR') === false, 'preflight inherits the optional private backup directory without publishing or hard-coding it');

console.log('public release decision backup OK (export=5, restore=5, reset=1, rollback=2, tamperGuards=7)');
