const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const health = require('./public-release-decision-backup-health.js');

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

try {
  const root = tempRoot('decision-backup-health-');
  initializeRepo(root);
  const localDir = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDir = path.join(root, 'external');
  const exported = backups.exportBackup(root, localDir, '2099-01-01T02:02:02Z', [externalDir]);
  assert.equal(exported.mirrorCount, 1, 'fixture creates a local and external mirror pair');
  const healthy = health.checkBackupHealth(root, {
    externalDirectory: externalDir,
    requireExternal: true,
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.equal(healthy.status, 'healthy', 'matching current local and external backup pair is healthy');
  assert.equal(healthy.local.currentCount, 1, 'health confirms a current local backup');
  assert.equal(healthy.external.currentCount, 1, 'health confirms a current external backup');
  assert.equal(healthy.mirror.pairedCurrentBackupCount, 1, 'health binds the same PRB across both locations');
  assert.deepEqual(healthy.issueCodes, [], 'healthy pair has no issue code');
  assert.equal(health.validateHealthStatus(healthy).pass, true, 'health summary validates as a closed schema');
  assert.equal(health.validateHealthStatus({ ...healthy, undeclared: true }).pass, false, 'health summary rejects undeclared fields');

  const statusPath = health.writeHealthStatus(root, healthy);
  const statusText = fs.readFileSync(statusPath, 'utf8');
  assert.equal(/PRB-|[0-9a-f]{40}|[0-9a-f]{64}|external\\|external\//i.test(statusText), false, 'written health status omits backup IDs, hashes, and private paths');

  const localOnly = health.checkBackupHealth(root, {
    externalDirectory: '',
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.equal(localOnly.status, 'local-only', 'missing optional external configuration is disclosed without corrupting valid local evidence');
  const externalRequired = health.checkBackupHealth(root, {
    externalDirectory: '',
    requireExternal: true,
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.equal(externalRequired.status, 'attention-required', 'required external backup fails when not configured');
  assert.ok(externalRequired.issueCodes.includes('external-backup-not-configured'), 'missing required external directory has a stable issue code');

  const sameDirectory = health.checkBackupHealth(root, {
    externalDirectory: localDir,
    requireExternal: true,
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.ok(sameDirectory.issueCodes.includes('external-backup-matches-local-directory'), 'same directory cannot masquerade as redundant storage');

  const invalidName = 'public-release-decision-backup-20990101-010101-PRB-AAAAAAAAAAAAAAAAAAAAAAAA.json';
  fs.writeFileSync(path.join(externalDir, invalidName), '{invalid', 'utf8');
  const corrupt = health.checkBackupHealth(root, {
    externalDirectory: externalDir,
    requireExternal: true,
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.ok(corrupt.issueCodes.includes('invalid-external-backup'), 'one corrupt external PRB prevents a healthy result');
  fs.rmSync(path.join(externalDir, invalidName));

  backups.exportBackup(root, localDir, '2098-01-01T00:00:00Z');
  const expired = health.checkBackupHealth(root, {
    externalDirectory: externalDir,
    requireExternal: true,
    retentionDays: 365,
    now: new Date('2099-02-01T00:00:00Z'),
  });
  assert.ok(expired.issueCodes.includes('expired-local-backup-present'), 'expired backup is reported for governed retention review without deletion');

  const unpairedRoot = tempRoot('decision-backup-health-unpaired-');
  initializeRepo(unpairedRoot);
  const unpairedLocal = path.join(unpairedRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const unpairedExternal = path.join(unpairedRoot, 'external');
  backups.exportBackup(unpairedRoot, unpairedLocal, '2099-01-01T03:03:03Z');
  backups.exportBackup(unpairedRoot, unpairedExternal, '2099-01-01T04:04:04Z');
  const unpaired = health.checkBackupHealth(unpairedRoot, {
    externalDirectory: unpairedExternal,
    requireExternal: true,
    now: new Date('2099-01-02T00:00:00Z'),
  });
  assert.ok(unpaired.issueCodes.includes('current-mirror-pair-missing'), 'independently exported current backups do not masquerade as an atomic mirror pair');

  assert.throws(() => health.checkBackupHealth(root, { retentionDays: 0 }), /1 to 3650/, 'invalid retention policy fails closed');
  assert.throws(() => health.writeHealthStatus(root, healthy, '..\\outside.json'), /inside the repository/, 'health status cannot escape the repository');
  assert.throws(() => health.parseArgs(['--unknown']), /unknown argument/, 'unknown health CLI arguments fail closed');
} finally {
  roots.reverse().forEach(root => fs.rmSync(root, { recursive: true, force: true }));
}

const repoRoot = path.resolve(__dirname, '..', '..');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
assert.ok(preflight.includes('public-release-decision-backup-health.test.js'), 'preflight includes backup health contract');
assert.ok(preflight.indexOf('$decisionBackupScript') < preflight.indexOf('$decisionBackupHealthScript'), 'formal release checks backup health only after the mirrored export succeeds');

console.log('public release decision backup health OK (healthy=1, degraded=5, privacy=2, policyGuards=3)');
