const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const drill = require('./public-release-decision-restore-drill.js');
const health = require('./public-release-decision-restore-drill-health.js');

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

function decisionFor(runId, previous = null) {
  const core = {
    schemaVersion: receipts.DECISION_SCHEMA_VERSION,
    kind: receipts.DECISION_KIND,
    generatedAt: `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)}T${runId.slice(9, 11)}:${runId.slice(11, 13)}:${runId.slice(13, 15)}Z`,
    runId,
    sourceCommitSha: (previous ? 'b' : 'a').repeat(40),
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
  return { ...core, receiptId: `PRD-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
}

function initializeRepo(root) {
  const decision = decisionFor('20990101-010101');
  writeJson(path.join(root, receipts.ANCHOR_FILE), receipts.anchorForDecision(decision));
  writeJson(path.join(root, 'output', 'preflight', 'history', decision.runId, receipts.DECISION_FILE), decision);
  return decision;
}

function initializePair(root) {
  const decision = initializeRepo(root);
  const localDirectory = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDirectory = path.join(root, 'external');
  backups.exportBackup(root, localDirectory, '2099-01-01T02:02:02Z', [externalDirectory]);
  return { decision, localDirectory, externalDirectory };
}

function runAndWrite(root, externalDirectory, temporaryParent, now) {
  const result = drill.runRestoreDrill(root, { externalDirectory, requireExternal: true, temporaryParent, now });
  assert.equal(result.pass, true, 'fixture isolated restore succeeds');
  drill.writeStatus(root, result.status);
  return result;
}

try {
  const temporaryParent = tempRoot('decision-drill-health-isolation-');
  const root = tempRoot('decision-drill-health-');
  const pair = initializePair(root);
  runAndWrite(root, pair.externalDirectory, temporaryParent, new Date('2099-01-02T03:04:05Z'));
  runAndWrite(root, pair.externalDirectory, temporaryParent, new Date('2099-01-03T03:04:05Z'));
  const healthy = health.checkDrillHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.equal(healthy.status, 'healthy', 'fresh matching chained histories are healthy');
  assert.equal(healthy.local.receiptCount, 2, 'health counts the full local drill history');
  assert.equal(healthy.local.chainedReceiptCount, 2, 'new fixture receipts are chained schema v2');
  assert.equal(healthy.external.receiptCount, 2, 'health counts the full external drill history');
  assert.equal(healthy.chain.pairedReceiptCount, 2, 'health verifies the complete mirrored history prefix');
  assert.equal(healthy.chain.checkpointReceiptCount, 2, 'health reads the monotonic status checkpoint');
  assert.equal(healthy.chain.anchorInitialized, true, 'health verifies the independent private chain-tip anchor');
  assert.equal(healthy.local.currentReceiptCount, 2, 'both drills prove the current decision chain');
  assert.deepEqual(healthy.issueCodes, [], 'healthy drill chain has no issue code');
  assert.equal(health.validateHealthStatus(healthy).pass, true, 'health output validates as a closed schema');
  assert.equal(health.validateHealthStatus({ ...healthy, undeclared: true }).pass, false, 'health output rejects undeclared fields');

  const statusPath = health.writeHealthStatus(root, healthy);
  const statusText = fs.readFileSync(statusPath, 'utf8');
  assert.equal(/PR[BD]-|[0-9a-f]{40}|[0-9a-f]{64}|receiptId|backupId|[A-Za-z]:\\|external[\\/]/i.test(statusText), false, 'written health omits private paths, IDs, hashes, and receipt content');

  const localOnly = health.checkDrillHealth(root, {
    externalDirectory: '',
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.equal(localOnly.status, 'local-only', 'portable environment can disclose a valid local-only drill history');
  const missingRequired = health.checkDrillHealth(root, {
    externalDirectory: '',
    requireExternal: true,
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.ok(missingRequired.issueCodes.includes('external-drill-not-configured'), 'required external history has a stable missing-config issue');

  const overdue = health.checkDrillHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    maximumAgeDays: 8,
    now: new Date('2099-01-12T04:04:06Z'),
  });
  assert.ok(overdue.issueCodes.includes('drill-overdue'), 'drill older than eight days requires attention');

  const externalDrillDirectory = path.join(pair.externalDirectory, drill.DRILL_DIRECTORY);
  const latestExternal = drill.loadReceiptHistory(externalDrillDirectory).entries.at(-1).filePath;
  const latestExternalBytes = fs.readFileSync(latestExternal);
  fs.rmSync(latestExternal);
  const mismatch = health.checkDrillHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.ok(mismatch.issueCodes.includes('drill-history-mismatch'), 'one-sided receipt deletion is detected');
  fs.writeFileSync(latestExternal, latestExternalBytes);

  const localHistory = drill.loadReceiptHistory(path.join(pair.localDirectory, drill.DRILL_DIRECTORY));
  const latestLocal = localHistory.entries.at(-1).filePath;
  const latestLocalBytes = fs.readFileSync(latestLocal);
  fs.rmSync(latestLocal);
  fs.rmSync(latestExternal);
  const rollback = health.checkDrillHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-04T03:04:05Z'),
  });
  assert.ok(rollback.issueCodes.includes('drill-history-rollback'), 'matching two-sided tip deletion is detected by the monotonic checkpoint');
  assert.ok(rollback.issueCodes.includes('drill-anchor-mismatch'), 'matching two-sided tip deletion is independently detected by the private tip anchor');
  fs.writeFileSync(latestLocal, latestLocalBytes);
  fs.writeFileSync(latestExternal, latestExternalBytes);

  const corruptRoot = tempRoot('decision-drill-health-corrupt-');
  const corruptPair = initializePair(corruptRoot);
  runAndWrite(corruptRoot, corruptPair.externalDirectory, temporaryParent, new Date('2099-01-02T03:04:06Z'));
  const corruptLocal = drill.loadReceiptHistory(path.join(corruptPair.localDirectory, drill.DRILL_DIRECTORY)).entries[0].filePath;
  const corruptReceipt = JSON.parse(fs.readFileSync(corruptLocal, 'utf8'));
  corruptReceipt.source.backupSha256 = 'f'.repeat(64);
  writeJson(corruptLocal, corruptReceipt);
  const corrupt = health.checkDrillHealth(corruptRoot, {
    externalDirectory: corruptPair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-03T03:04:06Z'),
  });
  assert.ok(corrupt.issueCodes.includes('invalid-local-drill-history'), 'tampered local receipt history is invalid');

  const currentRoot = tempRoot('decision-drill-health-current-');
  const currentPair = initializePair(currentRoot);
  runAndWrite(currentRoot, currentPair.externalDirectory, temporaryParent, new Date('2099-01-02T03:04:07Z'));
  const first = receipts.loadDecisionHistory(currentRoot).entries[0].decision;
  const second = decisionFor('20990102-020202', first);
  writeJson(path.join(currentRoot, 'output', 'preflight', 'history', second.runId, receipts.DECISION_FILE), second);
  writeJson(path.join(currentRoot, receipts.ANCHOR_FILE), receipts.anchorForDecision(second));
  const currentMissing = health.checkDrillHealth(currentRoot, {
    externalDirectory: currentPair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-03T03:04:07Z'),
  });
  assert.ok(currentMissing.issueCodes.includes('current-drill-missing'), 'new decision chain requires a matching new restore drill');

  assert.throws(() => health.checkDrillHealth(root, { maximumAgeDays: 0 }), /1 to 365/, 'invalid freshness policy fails closed');
  assert.throws(() => health.writeHealthStatus(root, healthy, '..\\outside.json'), /inside the repository/, 'health status cannot escape the repository');
  assert.throws(() => health.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI arguments fail closed');
} finally {
  roots.reverse().forEach(root => fs.rmSync(root, { recursive: true, force: true }));
}

const repoRoot = path.resolve(__dirname, '..', '..');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
assert.ok(preflight.includes('public-release-decision-restore-drill-health.test.js'), 'preflight includes restore drill history health contract');
assert.ok(preflight.indexOf('$decisionRestoreDrillScript') < preflight.indexOf('$decisionRestoreDrillHealthScript'), 'formal release checks chained drill health only after the actual drill succeeds');

console.log('public release decision restore drill health OK (healthy=1, degraded=7, privacy=2, guards=3)');
