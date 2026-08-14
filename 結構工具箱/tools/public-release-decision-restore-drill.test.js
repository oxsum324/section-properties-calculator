const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const drill = require('./public-release-decision-restore-drill.js');

const roots = [];
const tempRoot = prefix => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
};
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

function decisionFor(runId) {
  const core = {
    schemaVersion: receipts.DECISION_SCHEMA_VERSION,
    kind: receipts.DECISION_KIND,
    generatedAt: '2099-01-01T01:01:01Z',
    runId,
    sourceCommitSha: 'a'.repeat(40),
    sourceBranch: 'master',
    sourceDirty: false,
    preflight: { recordsPassed: 84, recordsRequired: 84, postChecksPassed: 3, postChecksRequired: 3 },
    change: { baselineRunId: '', classification: 'baseline', increases: [], reductions: [] },
    authorization: { state: 'not-required' },
    reset: { state: 'not-applicable' },
    evidence: {
      publicBundleSha256: '1'.repeat(64),
      preflightSummarySha256: '2'.repeat(64),
      renderedEvidenceSha256: '3'.repeat(64),
    },
    previousReceipt: { receiptId: '', receiptSha256: '' },
  };
  return { ...core, receiptId: `PRD-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
}

function initializeRepo(root) {
  const decision = decisionFor('20990101-010101');
  writeJson(path.join(root, receipts.ANCHOR_FILE), receipts.anchorForDecision(decision));
  writeJson(path.join(root, 'output', 'preflight', 'history', decision.runId, receipts.DECISION_FILE), decision);
}

function initializePair(root, exportedAt = '2099-01-01T02:02:02Z') {
  initializeRepo(root);
  const localDirectory = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDirectory = path.join(root, 'external');
  backups.exportBackup(root, localDirectory, exportedAt, [externalDirectory]);
  return { localDirectory, externalDirectory };
}

function drillFiles(directory) {
  const target = path.join(directory, drill.DRILL_DIRECTORY);
  return fs.existsSync(target) ? fs.readdirSync(target).filter(name => name.endsWith('.json')) : [];
}

try {
  const root = tempRoot('decision-restore-drill-');
  const temporaryParent = tempRoot('decision-restore-isolation-parent-');
  const { localDirectory, externalDirectory } = initializePair(root);
  const before = drill.sourceFileFingerprint(root);
  const passed = drill.runRestoreDrill(root, {
    externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:05Z'),
  });
  assert.equal(passed.pass, true, 'external mirror completes a real isolated restore drill');
  assert.equal(passed.status.status, 'passed', 'successful drill emits passed status');
  assert.equal(passed.status.sourceMode, 'external-mirror', 'drill restores from the external mirror');
  assert.equal(passed.status.restore.classification, 'tracked-anchor-bootstrap', 'drill recreates a clean clone from its tracked anchor');
  assert.equal(passed.status.restore.restoredReceiptCount, 1, 'drill restores the complete decision chain');
  assert.equal(passed.status.restore.anchorValidated, true, 'drill validates the restored anchor');
  assert.equal(passed.status.restore.sourceUnchanged, true, 'drill proves source decision files stayed unchanged');
  assert.equal(passed.status.restore.cleanupCompleted, true, 'drill removes its isolation workspace');
  assert.equal(passed.status.receipts.mirrorPairWritten, true, 'successful external drill writes paired private receipts');
  assert.equal(drill.sourceFileFingerprint(root), before, 'actual drill does not mutate source release evidence');
  assert.equal(fs.readdirSync(temporaryParent).length, 0, 'actual drill leaves no isolation directory behind');
  assert.equal(drillFiles(localDirectory).length, 1, 'local private receipt is append-only');
  assert.equal(drillFiles(externalDirectory).length, 1, 'external private receipt mirrors the local receipt');
  const localReceiptPath = path.join(localDirectory, drill.DRILL_DIRECTORY, drillFiles(localDirectory)[0]);
  const externalReceiptPath = path.join(externalDirectory, drill.DRILL_DIRECTORY, drillFiles(externalDirectory)[0]);
  assert.equal(fs.readFileSync(localReceiptPath, 'utf8'), fs.readFileSync(externalReceiptPath, 'utf8'), 'paired drill receipt bytes are identical');
  const privateReceipt = JSON.parse(fs.readFileSync(localReceiptPath, 'utf8'));
  assert.equal(drill.validateReceipt(privateReceipt).pass, true, 'private restore drill receipt validates as a closed schema');
  assert.equal(drill.validateReceipt({ ...privateReceipt, undeclared: true }).pass, false, 'private receipt rejects undeclared fields');
  const privateHistory = drill.loadReceiptHistory(path.join(localDirectory, drill.DRILL_DIRECTORY));
  const privateAnchor = JSON.parse(fs.readFileSync(path.join(root, ...drill.DEFAULT_ANCHOR_FILE.split('/')), 'utf8'));
  assert.equal(drill.validateReceiptAnchor(privateAnchor).pass, true, 'private restore drill tip anchor validates as a closed schema');
  assert.deepEqual(privateAnchor, drill.anchorForReceiptHistory(privateHistory), 'private tip anchor binds the complete receipt history tip and count');

  const statusPath = drill.writeStatus(root, passed.status);
  const statusText = fs.readFileSync(statusPath, 'utf8');
  assert.equal(/PR[BD]-|[0-9a-f]{40}|[0-9a-f]{64}|receiptId|backupId|[A-Za-z]:\\|external[\\/]/i.test(statusText), false, 'written status omits private paths, IDs, hashes, and receipt content');
  assert.equal(drill.validateStatus(passed.status).pass, true, 'de-identified passed status validates');
  assert.equal(drill.validateStatus({ ...passed.status, undeclared: true }).pass, false, 'status rejects undeclared fields');

  const localOnlyRoot = tempRoot('decision-restore-local-only-');
  initializeRepo(localOnlyRoot);
  const localOnlyDirectory = path.join(localOnlyRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  backups.exportBackup(localOnlyRoot, localOnlyDirectory, '2099-01-01T02:02:03Z');
  const localOnly = drill.runRestoreDrill(localOnlyRoot, {
    externalDirectory: '',
    temporaryParent,
    now: new Date('2099-01-02T03:04:06Z'),
  });
  assert.equal(localOnly.pass, true, 'portable workstation can drill a valid local-only backup');
  assert.equal(localOnly.status.sourceMode, 'local-default', 'local-only drill discloses its source class');
  assert.equal(localOnly.status.receipts.localWritten, true, 'local-only drill writes a local private receipt');
  assert.equal(localOnly.status.receipts.externalWritten, false, 'local-only drill does not invent an external receipt');

  const externalRequired = drill.runRestoreDrill(localOnlyRoot, {
    externalDirectory: '',
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:07Z'),
  });
  assert.equal(externalRequired.pass, false, 'required external source fails when not configured');
  assert.deepEqual(externalRequired.status.issueCodes, ['external-backup-not-configured'], 'missing configuration has a stable issue code');

  const sameDirectory = drill.runRestoreDrill(localOnlyRoot, {
    externalDirectory: localOnlyDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:08Z'),
  });
  assert.equal(sameDirectory.pass, false, 'same directory cannot masquerade as an external restore source');
  assert.deepEqual(sameDirectory.status.issueCodes, ['external-backup-matches-local-directory'], 'same-directory failure has a stable issue code');

  const unpairedRoot = tempRoot('decision-restore-unpaired-');
  initializeRepo(unpairedRoot);
  const unpairedLocal = path.join(unpairedRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const unpairedExternal = path.join(unpairedRoot, 'external');
  backups.exportBackup(unpairedRoot, unpairedLocal, '2099-01-01T02:02:09Z');
  backups.exportBackup(unpairedRoot, unpairedExternal, '2099-01-01T02:02:10Z');
  const unpaired = drill.runRestoreDrill(unpairedRoot, {
    externalDirectory: unpairedExternal,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:09Z'),
  });
  assert.equal(unpaired.pass, false, 'independent current backups cannot masquerade as an atomic mirror pair');
  assert.deepEqual(unpaired.status.issueCodes, ['current-backup-pair-missing'], 'unpaired backup has a stable issue code');

  const restoreFailureRoot = tempRoot('decision-restore-failure-');
  const restoreFailurePair = initializePair(restoreFailureRoot, '2099-01-01T02:02:11Z');
  const restoreFailure = drill.runRestoreDrill(restoreFailureRoot, {
    externalDirectory: restoreFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:10Z'),
    hooks: {
      beforeRestore: ({ isolatedRoot }) => writeJson(path.join(isolatedRoot, receipts.ANCHOR_FILE), receipts.inactiveAnchor()),
    },
  });
  assert.equal(restoreFailure.pass, false, 'wrong isolation anchor blocks a false restore success');
  assert.deepEqual(restoreFailure.status.issueCodes, ['isolated-restore-failed'], 'restore failure has a stable issue code');
  assert.equal(restoreFailure.status.restore.cleanupCompleted, true, 'failed restore still cleans its isolation workspace');

  const cleanupFailureRoot = tempRoot('decision-restore-cleanup-failure-');
  const cleanupFailurePair = initializePair(cleanupFailureRoot, '2099-01-01T02:02:12Z');
  const cleanupFailure = drill.runRestoreDrill(cleanupFailureRoot, {
    externalDirectory: cleanupFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:11Z'),
    hooks: { beforeCleanup: () => { throw new Error('simulated cleanup confirmation failure'); } },
  });
  assert.equal(cleanupFailure.pass, false, 'cleanup confirmation failure blocks a drill receipt');
  assert.deepEqual(cleanupFailure.status.issueCodes, ['isolation-cleanup-failed'], 'cleanup failure has a stable issue code');
  assert.equal(fs.readdirSync(temporaryParent).length, 0, 'fallback cleanup removes the isolation directory after a cleanup failure');

  const sourceChangeRoot = tempRoot('decision-restore-source-change-');
  const sourceChangePair = initializePair(sourceChangeRoot, '2099-01-01T02:02:13Z');
  const sourceAnchorPath = path.join(sourceChangeRoot, receipts.ANCHOR_FILE);
  const sourceAnchorBytes = fs.readFileSync(sourceAnchorPath);
  const sourceChanged = drill.runRestoreDrill(sourceChangeRoot, {
    externalDirectory: sourceChangePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:12Z'),
    hooks: { afterRestore: () => fs.appendFileSync(sourceAnchorPath, ' ') },
  });
  assert.equal(sourceChanged.pass, false, 'source decision byte changes block the drill');
  assert.deepEqual(sourceChanged.status.issueCodes, ['source-repository-changed'], 'source mutation has a stable issue code');
  fs.writeFileSync(sourceAnchorPath, sourceAnchorBytes);

  const mirrorFailureRoot = tempRoot('decision-restore-receipt-rollback-');
  const mirrorFailurePair = initializePair(mirrorFailureRoot, '2099-01-01T02:02:14Z');
  const mirrorFailure = drill.runRestoreDrill(mirrorFailureRoot, {
    externalDirectory: mirrorFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:13Z'),
    hooks: { beforeReceiptWrite: ({ index }) => { if (index === 1) throw new Error('simulated external receipt failure'); } },
  });
  assert.equal(mirrorFailure.pass, false, 'external receipt failure blocks a partial drill receipt');
  assert.deepEqual(mirrorFailure.status.issueCodes, ['receipt-mirror-write-failed'], 'receipt transaction failure has a stable issue code');
  assert.equal(drillFiles(mirrorFailurePair.localDirectory).length, 0, 'receipt transaction rollback removes the new local receipt');
  assert.equal(drillFiles(mirrorFailurePair.externalDirectory).length, 0, 'receipt transaction rollback leaves no external receipt');

  const anchorFailureRoot = tempRoot('decision-restore-anchor-rollback-');
  const anchorFailurePair = initializePair(anchorFailureRoot, '2099-01-01T02:02:15Z');
  const anchorFailure = drill.runRestoreDrill(anchorFailureRoot, {
    externalDirectory: anchorFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:14Z'),
    hooks: { beforeAnchorWrite: () => { throw new Error('simulated private anchor failure'); } },
  });
  assert.equal(anchorFailure.pass, false, 'private tip anchor failure blocks a partial drill receipt');
  assert.deepEqual(anchorFailure.status.issueCodes, ['receipt-anchor-write-failed'], 'anchor transaction failure has a stable issue code');
  assert.equal(drillFiles(anchorFailurePair.localDirectory).length, 0, 'anchor failure rolls back the new local receipt');
  assert.equal(drillFiles(anchorFailurePair.externalDirectory).length, 0, 'anchor failure rolls back the new external receipt');
  assert.equal(fs.existsSync(path.join(anchorFailureRoot, ...drill.DEFAULT_ANCHOR_FILE.split('/'))), false, 'anchor failure leaves no false private tip anchor');

  const postAnchorFailureRoot = tempRoot('decision-restore-post-anchor-rollback-');
  const postAnchorFailurePair = initializePair(postAnchorFailureRoot, '2099-01-01T02:02:16Z');
  const firstAnchored = drill.runRestoreDrill(postAnchorFailureRoot, {
    externalDirectory: postAnchorFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-02T03:04:15Z'),
  });
  assert.equal(firstAnchored.pass, true, 'fixture initializes an existing private tip anchor');
  drill.writeStatus(postAnchorFailureRoot, firstAnchored.status);
  const existingAnchorPath = path.join(postAnchorFailureRoot, ...drill.DEFAULT_ANCHOR_FILE.split('/'));
  const existingAnchorBytes = fs.readFileSync(existingAnchorPath);
  const postAnchorFailure = drill.runRestoreDrill(postAnchorFailureRoot, {
    externalDirectory: postAnchorFailurePair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-03T03:04:15Z'),
    hooks: { afterAnchorWrite: () => { throw new Error('simulated post-anchor verification failure'); } },
  });
  assert.equal(postAnchorFailure.pass, false, 'post-anchor verification failure rolls back the whole append');
  assert.deepEqual(postAnchorFailure.status.issueCodes, ['receipt-history-invalid'], 'post-anchor verification failure has a stable issue code');
  assert.equal(drillFiles(postAnchorFailurePair.localDirectory).length, 1, 'post-anchor failure retains only the prior local receipt');
  assert.equal(drillFiles(postAnchorFailurePair.externalDirectory).length, 1, 'post-anchor failure retains only the prior external receipt');
  assert.deepEqual(fs.readFileSync(existingAnchorPath), existingAnchorBytes, 'post-anchor failure restores the exact prior anchor bytes');

  const legacyRoot = tempRoot('decision-restore-legacy-migration-');
  const legacyPair = initializePair(legacyRoot, '2099-01-01T02:02:02Z');
  const { sequence: ignoredSequence, previousReceipt: ignoredPrevious, receiptId: ignoredId, ...currentCore } = passed.receipt;
  const legacyCore = { ...currentCore, schemaVersion: drill.LEGACY_DRILL_SCHEMA_VERSION };
  const legacyReceipt = { ...legacyCore, receiptId: `PDR-${receipts.digestObject(legacyCore).slice(0, 24).toUpperCase()}` };
  const legacyFileName = `public-release-decision-restore-drill-20990102-030405-${legacyReceipt.receiptId}.json`;
  for (const directory of [legacyPair.localDirectory, legacyPair.externalDirectory]) {
    writeJson(path.join(directory, drill.DRILL_DIRECTORY, legacyFileName), legacyReceipt);
  }
  const migrated = drill.runRestoreDrill(legacyRoot, {
    externalDirectory: legacyPair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-03T03:04:05Z'),
  });
  assert.equal(migrated.pass, true, 'legacy schema v1 history migrates by appending a chained schema v2 receipt');
  assert.equal(migrated.receipt.schemaVersion, drill.DRILL_SCHEMA_VERSION, 'new receipt uses the chained schema');
  assert.equal(migrated.receipt.sequence, 2, 'first chained receipt continues after the legacy history count');
  assert.equal(migrated.receipt.previousReceipt.receiptId, legacyReceipt.receiptId, 'first chained receipt binds the legacy history tip');
  const migratedHistory = drill.loadReceiptHistory(path.join(legacyPair.localDirectory, drill.DRILL_DIRECTORY));
  assert.equal(migratedHistory.legacyCount, 1, 'migrated history retains the legacy receipt');
  assert.equal(migratedHistory.currentCount, 1, 'migrated history adds one chained receipt');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(legacyRoot, ...drill.DEFAULT_ANCHOR_FILE.split('/')), 'utf8')),
    drill.anchorForReceiptHistory(migratedHistory),
    'legacy migration initializes the private tip anchor at the new chained receipt',
  );
  drill.writeStatus(legacyRoot, migrated.status);
  for (const directory of [legacyPair.localDirectory, legacyPair.externalDirectory]) {
    fs.rmSync(path.join(directory, drill.DRILL_DIRECTORY, legacyFileName));
  }
  const deletedLegacy = drill.runRestoreDrill(legacyRoot, {
    externalDirectory: legacyPair.externalDirectory,
    requireExternal: true,
    temporaryParent,
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.equal(deletedLegacy.pass, false, 'two-sided deletion inside a chained history is blocked');
  assert.deepEqual(deletedLegacy.status.issueCodes, ['receipt-history-invalid'], 'interior history deletion has a stable issue code');

  assert.throws(() => drill.writeStatus(root, passed.status, '..\\outside.json'), /inside the repository/, 'status cannot escape the repository');
  assert.throws(() => drill.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI arguments fail closed');
} finally {
  roots.reverse().forEach(root => fs.rmSync(root, { recursive: true, force: true }));
}

const repoRoot = path.resolve(__dirname, '..', '..');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
assert.ok(preflight.includes('public-release-decision-restore-drill.test.js'), 'preflight includes isolated restore drill contract');
assert.ok(preflight.indexOf('$decisionBackupHealthScript') < preflight.indexOf('$decisionRestoreDrillScript'), 'formal release drills only after backup health succeeds');

console.log('public release decision restore drill OK (passed=4, failures=10, privacy=2, rollback=3, migration=1, guards=4)');
