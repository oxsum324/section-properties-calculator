const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const drill = require('./public-release-decision-restore-drill.js');
const cloud = require('./public-release-decision-cloud-checkpoint.js');

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
  initializeRepo(root);
  const localDirectory = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDirectory = path.join(root, 'external');
  backups.exportBackup(root, localDirectory, '2099-01-01T02:02:02Z', [externalDirectory]);
  return { localDirectory, externalDirectory };
}

function runDrill(root, externalDirectory, temporaryParent, now) {
  const result = drill.runRestoreDrill(root, { externalDirectory, requireExternal: true, temporaryParent, now });
  assert.equal(result.pass, true, 'fixture restore drill succeeds');
  drill.writeStatus(root, result.status);
  return result;
}

function observationFor(root, externalDirectory, observedAt, suffix = '') {
  const state = cloud.currentState(root, externalDirectory);
  const core = {
    schemaVersion: cloud.OBSERVATION_SCHEMA_VERSION,
    kind: cloud.OBSERVATION_KIND,
    provider: cloud.PROVIDER,
    observedAt,
    backup: {
      fileName: state.backup.fileName,
      byteLength: state.backup.byteLength,
      providerFileId: `backupProviderFile${suffix || 'One'}_1234567890`,
      createdAt: observedAt,
      modifiedAt: observedAt,
    },
    drill: {
      fileName: state.drill.fileName,
      byteLength: state.drill.byteLength,
      providerFileId: `drillProviderFile${suffix || 'One'}_1234567890`,
      createdAt: observedAt,
      modifiedAt: observedAt,
    },
  };
  return { ...core, observationId: `PCO-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
}

function prepareAndMount(root, externalDirectory, observation, now) {
  const observationPath = path.join(root, 'output', 'audit', `cloud-observation-${observation.observationId}.json`);
  writeJson(observationPath, observation);
  const result = cloud.buildCheckpoint(root, { externalDirectory, observationFile: observationPath, now });
  const cloudDirectory = path.join(externalDirectory, cloud.DEFAULT_CLOUD_DIRECTORY);
  fs.mkdirSync(cloudDirectory, { recursive: true });
  fs.copyFileSync(result.target, path.join(cloudDirectory, result.fileName));
  return result;
}

function providerVerificationFor(checkpointResult, observedAt, suffix = '') {
  const core = {
    schemaVersion: cloud.VERIFICATION_SCHEMA_VERSION,
    kind: cloud.VERIFICATION_KIND,
    provider: cloud.PROVIDER,
    observedAt,
    checkpoint: {
      fileName: checkpointResult.fileName,
      byteLength: checkpointResult.byteLength,
      contentSha256: crypto.createHash('sha256').update(fs.readFileSync(checkpointResult.target)).digest('hex'),
      providerFileId: `checkpointProviderFile${suffix || 'One'}_1234567890`,
      createdAt: observedAt,
      modifiedAt: observedAt,
    },
  };
  return { ...core, verificationId: `PCV-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
}

function confirmProviderRoundTrip(root, externalDirectory, checkpointResult, verification, now) {
  const verificationPath = path.join(root, 'output', 'audit', `provider-verification-${verification.verificationId}.json`);
  writeJson(verificationPath, verification);
  return cloud.recordProviderVerification(root, { externalDirectory, verificationFile: verificationPath, now });
}

try {
  const temporaryParent = tempRoot('decision-cloud-checkpoint-isolation-');
  const root = tempRoot('decision-cloud-checkpoint-');
  const pair = initializePair(root);
  runDrill(root, pair.externalDirectory, temporaryParent, new Date('2099-01-02T03:04:05Z'));

  const firstObservation = observationFor(root, pair.externalDirectory, '2099-01-02T03:05:00Z');
  assert.equal(cloud.validateObservation(firstObservation).pass, true, 'provider observation validates as a closed schema');
  assert.equal(cloud.validateObservation({ ...firstObservation, undeclared: true }).pass, false, 'provider observation rejects undeclared fields');
  const first = prepareAndMount(root, pair.externalDirectory, firstObservation, new Date('2099-01-02T03:06:00Z'));
  assert.equal(first.checkpoint.sequence, 1, 'first cloud checkpoint starts a monotonic sequence');
  assert.equal(first.checkpoint.previousCheckpoint.checkpointId, '', 'first cloud checkpoint has no invented predecessor');
  assert.equal(cloud.validateCheckpoint(first.checkpoint).pass, true, 'cloud checkpoint validates as a closed schema');
  assert.equal(cloud.validateCheckpoint({ ...first.checkpoint, undeclared: true }).pass, false, 'cloud checkpoint rejects undeclared fields');

  const notConfirmed = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-02T03:07:00Z'),
  });
  assert.ok(notConfirmed.issueCodes.includes('cloud-checkpoint-provider-confirmation-missing'), 'a mounted checkpoint cannot masquerade as a completed provider round trip');
  assert.equal(notConfirmed.provider.roundTripValidated, false, 'health remains explicit before provider API readback is recorded');
  const firstVerification = providerVerificationFor(first, '2099-01-02T03:06:30Z');
  assert.equal(cloud.validateProviderVerification(firstVerification).pass, true, 'provider readback verification validates as a closed schema');
  assert.equal(cloud.validateProviderVerification({ ...firstVerification, undeclared: true }).pass, false, 'provider readback verification rejects undeclared fields');
  const legacyCore = {
    ...firstVerification,
    schemaVersion: cloud.LEGACY_VERIFICATION_SCHEMA_VERSION,
    checkpoint: { ...firstVerification.checkpoint },
  };
  delete legacyCore.checkpoint.contentSha256;
  delete legacyCore.verificationId;
  const legacyVerification = { ...legacyCore, verificationId: `PCV-${receipts.digestObject(legacyCore).slice(0, 24).toUpperCase()}` };
  assert.equal(cloud.validateProviderVerification(legacyVerification).pass, true, 'legacy metadata-only verification remains readable for history compatibility');
  const legacyVerificationPath = path.join(root, 'output', 'audit', 'legacy-provider-verification.json');
  writeJson(legacyVerificationPath, legacyVerification);
  assert.throws(() => cloud.recordProviderVerification(root, {
    externalDirectory: pair.externalDirectory,
    verificationFile: legacyVerificationPath,
    now: new Date('2099-01-02T03:06:45Z'),
  }), /raw content SHA-256/, 'legacy metadata-only verification cannot establish a new round trip');
  confirmProviderRoundTrip(root, pair.externalDirectory, first, firstVerification, new Date('2099-01-02T03:06:45Z'));
  const notAccepted = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-02T03:07:00Z'),
  });
  assert.ok(notAccepted.issueCodes.includes('cloud-checkpoint-anchor-missing'), 'provider-confirmed history is not trusted before its private tip is accepted');
  const accepted = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    acceptNewTip: true,
    now: new Date('2099-01-02T03:07:00Z'),
  });
  assert.equal(accepted.status, 'healthy', 'accepted current provider checkpoint becomes healthy');
  assert.equal(accepted.external.checkpointCount, 1, 'health counts the complete round-trip checkpoint history');
  assert.equal(accepted.external.currentCheckpointCount, 1, 'health binds the checkpoint to the current PRD, PRB, and PDR tips');
  assert.equal(accepted.provider.roundTripValidated, true, 'health discloses the DriveFS-to-provider API readback round trip');
  assert.equal(accepted.provider.anchorAccepted, true, 'health discloses the monotonic tip acceptance event');

  const secondObservation = observationFor(root, pair.externalDirectory, '2099-01-03T03:05:00Z', 'Two');
  const second = prepareAndMount(root, pair.externalDirectory, secondObservation, new Date('2099-01-03T03:06:00Z'));
  assert.equal(second.checkpoint.sequence, 2, 'second cloud checkpoint advances the sequence');
  assert.equal(second.checkpoint.previousCheckpoint.checkpointId, first.checkpoint.checkpointId, 'second cloud checkpoint links the first checkpoint');
  const unconfirmedSecond = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    acceptNewTip: true,
    now: new Date('2099-01-03T03:06:15Z'),
  });
  assert.ok(unconfirmedSecond.issueCodes.includes('cloud-checkpoint-provider-confirmation-missing'), 'a new checkpoint cannot advance the anchor before provider API readback');
  assert.ok(unconfirmedSecond.issueCodes.includes('cloud-checkpoint-anchor-behind'), 'unconfirmed evidence leaves the previous trusted tip unchanged');
  const secondVerification = providerVerificationFor(second, '2099-01-03T03:06:30Z', 'Two');
  confirmProviderRoundTrip(root, pair.externalDirectory, second, secondVerification, new Date('2099-01-03T03:06:45Z'));
  const behind = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-03T03:07:00Z'),
  });
  assert.ok(behind.issueCodes.includes('cloud-checkpoint-anchor-behind'), 'new provider evidence requires explicit monotonic tip acceptance');
  const advanced = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    acceptNewTip: true,
    now: new Date('2099-01-03T03:07:00Z'),
  });
  assert.equal(advanced.status, 'healthy', 'forward-only checkpoint extension can be accepted');
  assert.equal(advanced.external.checkpointCount, 2, 'accepted history retains both cloud confirmations');
  assert.equal(cloud.validateHealthStatus(advanced).pass, true, 'de-identified health validates as a closed schema');
  assert.equal(cloud.validateHealthStatus({ ...advanced, undeclared: true }).pass, false, 'health rejects undeclared fields');
  const statusPath = cloud.writeHealthStatus(root, advanced);
  const statusText = fs.readFileSync(statusPath, 'utf8');
  assert.equal(/P(?:CO|CV|DC|R[BD])-|[0-9a-f]{40}|[0-9a-f]{64}|providerFileId|checkpointId|backupId|receiptId|[A-Za-z]:\\|external[\\/]/i.test(statusText), false, 'written health omits private paths, IDs, hashes, file names, and provider identifiers');

  runDrill(root, pair.externalDirectory, temporaryParent, new Date('2099-01-03T04:04:05Z'));
  const drillExtended = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-03T04:07:00Z'),
  });
  assert.equal(drillExtended.status, 'healthy', 'later append-only restore drills retain the provider proof for the same formal release and backup');

  const staleObservation = observationFor(root, pair.externalDirectory, '2099-01-01T00:00:00Z', 'Stale');
  const stalePath = path.join(root, 'output', 'audit', 'stale-observation.json');
  writeJson(stalePath, staleObservation);
  assert.throws(() => cloud.buildCheckpoint(root, {
    externalDirectory: pair.externalDirectory,
    observationFile: stalePath,
    now: new Date('2099-01-03T03:06:00Z'),
  }), /observation is too old/, 'stale provider metadata cannot create fresh cloud evidence');
  const mismatchedObservation = observationFor(root, pair.externalDirectory, '2099-01-03T03:05:00Z', 'Mismatch');
  mismatchedObservation.backup.byteLength += 1;
  mismatchedObservation.observationId = `PCO-${receipts.digestObject(cloud.observationCore(mismatchedObservation)).slice(0, 24).toUpperCase()}`;
  const mismatchPath = path.join(root, 'output', 'audit', 'mismatched-observation.json');
  writeJson(mismatchPath, mismatchedObservation);
  assert.throws(() => cloud.buildCheckpoint(root, {
    externalDirectory: pair.externalDirectory,
    observationFile: mismatchPath,
    now: new Date('2099-01-03T03:06:00Z'),
  }), /backup metadata mismatch/, 'provider file size must match the current external backup');

  const staleVerification = providerVerificationFor(second, '2099-01-01T00:00:00Z', 'Stale');
  const staleVerificationPath = path.join(root, 'output', 'audit', 'stale-provider-verification.json');
  writeJson(staleVerificationPath, staleVerification);
  assert.throws(() => cloud.recordProviderVerification(root, {
    externalDirectory: pair.externalDirectory,
    verificationFile: staleVerificationPath,
    now: new Date('2099-01-03T03:06:00Z'),
  }), /verification is too old/, 'stale provider readback cannot prove a fresh round trip');
  const mismatchedVerification = providerVerificationFor(second, '2099-01-03T03:05:00Z', 'Mismatch');
  mismatchedVerification.checkpoint.byteLength += 1;
  mismatchedVerification.verificationId = `PCV-${receipts.digestObject(cloud.verificationCore(mismatchedVerification)).slice(0, 24).toUpperCase()}`;
  const mismatchedVerificationPath = path.join(root, 'output', 'audit', 'mismatched-provider-verification.json');
  writeJson(mismatchedVerificationPath, mismatchedVerification);
  assert.throws(() => cloud.recordProviderVerification(root, {
    externalDirectory: pair.externalDirectory,
    verificationFile: mismatchedVerificationPath,
    now: new Date('2099-01-03T03:06:00Z'),
  }), /expected one matching cloud checkpoint/, 'provider readback bytes must match the mounted checkpoint');
  const mismatchedContentVerification = providerVerificationFor(second, '2099-01-03T03:05:00Z', 'ContentMismatch');
  mismatchedContentVerification.checkpoint.contentSha256 = '0'.repeat(64);
  mismatchedContentVerification.verificationId = `PCV-${receipts.digestObject(cloud.verificationCore(mismatchedContentVerification)).slice(0, 24).toUpperCase()}`;
  const mismatchedContentVerificationPath = path.join(root, 'output', 'audit', 'mismatched-provider-content-verification.json');
  writeJson(mismatchedContentVerificationPath, mismatchedContentVerification);
  assert.throws(() => cloud.recordProviderVerification(root, {
    externalDirectory: pair.externalDirectory,
    verificationFile: mismatchedContentVerificationPath,
    now: new Date('2099-01-03T03:06:00Z'),
  }), /expected one matching cloud checkpoint/, 'provider-downloaded content SHA-256 must match the mounted checkpoint');

  const cloudDirectory = path.join(pair.externalDirectory, cloud.DEFAULT_CLOUD_DIRECTORY);
  const secondCloudPath = path.join(cloudDirectory, second.fileName);
  const secondBytes = fs.readFileSync(secondCloudPath);
  fs.rmSync(secondCloudPath);
  const rollback = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-03T03:08:00Z'),
  });
  assert.ok(rollback.issueCodes.includes('cloud-checkpoint-anchor-mismatch'), 'provider-confirmed checkpoint history rollback is detected by the private tip anchor');
  fs.writeFileSync(secondCloudPath, secondBytes);

  const overdue = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    maximumAgeDays: 8,
    now: new Date('2099-01-12T04:00:00Z'),
  });
  assert.ok(overdue.issueCodes.includes('cloud-checkpoint-overdue'), 'provider confirmation older than eight days requires attention');

  const previousDecision = receipts.loadDecisionHistory(root).entries.at(-1).decision;
  const nextDecision = decisionFor('20990104-010101', previousDecision);
  writeJson(path.join(root, 'output', 'preflight', 'history', nextDecision.runId, receipts.DECISION_FILE), nextDecision);
  writeJson(path.join(root, receipts.ANCHOR_FILE), receipts.anchorForDecision(nextDecision));
  backups.exportBackup(root, pair.localDirectory, '2099-01-04T02:02:02Z', [pair.externalDirectory]);
  runDrill(root, pair.externalDirectory, temporaryParent, new Date('2099-01-04T03:04:05Z'));
  const currentMissing = cloud.checkHealth(root, {
    externalDirectory: pair.externalDirectory,
    requireExternal: true,
    now: new Date('2099-01-04T03:07:00Z'),
  });
  assert.ok(currentMissing.issueCodes.includes('current-cloud-checkpoint-missing'), 'a new formal release requires new provider-confirmed cloud evidence');

  const localOnly = cloud.checkHealth(root, { externalDirectory: '', now: new Date('2099-01-04T03:07:00Z') });
  assert.equal(localOnly.status, 'local-only', 'portable environment can disclose that no provider proof is configured');
  const required = cloud.checkHealth(root, { externalDirectory: '', requireExternal: true, now: new Date('2099-01-04T03:07:00Z') });
  assert.ok(required.issueCodes.includes('external-cloud-directory-not-configured'), 'required provider evidence has a stable missing-config issue');

  assert.throws(() => cloud.writeHealthStatus(root, advanced, '..\\outside.json'), /inside the repository/, 'health status cannot escape the repository');
  assert.throws(() => cloud.parseArgs(['--prepare', '--check']), /exactly one/, 'CLI rejects conflicting actions');
  assert.throws(() => cloud.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI arguments fail closed');
} finally {
  roots.reverse().forEach(root => fs.rmSync(root, { recursive: true, force: true }));
}

console.log('public release decision cloud checkpoint OK (chain=2, provider=4, degraded=9, privacy=2, guards=6)');
