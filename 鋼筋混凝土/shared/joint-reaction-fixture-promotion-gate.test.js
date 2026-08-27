const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Sanitizer = require('./joint-reaction-fixture-sanitizer.js');
const Gate = require('./joint-reaction-fixture-promotion-gate.js');

const raw = [
  'TABLE: "CONFIDENTIAL PROJECT 9387"',
  'Story,Point,Unique Name,OutputCase,CaseType,StepType,StepNum,F1,F2,F3,M1,M2,M3',
  'PRIVATE-B3,SECRET-J1,9988,PRIVATE-DEAD,Linear Static,,,0,0,765432.1,0,0,0',
].join('\n');
const sanitizedAt = '2026-08-26T01:00:00.000Z';
const reviewedAt = '2026-08-26T02:00:00.000Z';
const fixtureId = 'etabs-v23-observed-001';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-reaction-promotion-'));

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

try {
  const candidatePath = path.join(tempRoot, 'candidate.csv');
  const evidencePath = path.join(tempRoot, 'candidate.evidence.json');
  const reviewPath = path.join(tempRoot, 'candidate.review.json');
  const manifestPath = path.join(tempRoot, 'observed-manifest.json');
  const sanitized = Sanitizer.sanitizeExport({
    raw,
    software:'ETABS',
    softwareVersion:'v23.0.0',
    units:'kN, m',
    tableName:'Joint Reactions',
    originKind:'actual-observed',
    sourceExtension:'.csv',
    generatedAt:sanitizedAt,
  });
  fs.writeFileSync(candidatePath, sanitized.sanitized, 'utf8');
  const evidence = { ...sanitized.evidence, output:{ ...sanitized.evidence.output, file:path.basename(candidatePath) } };
  writeJson(evidencePath, evidence);
  const review = {
    schemaVersion:'rc-joint-reaction-observed-review.v1',
    fixtureId,
    candidateSha256:evidence.output.sha256,
    reviewedAt,
    reviewer:'fixture-governance-test',
    assertions:{
      noProjectIdentity:true,
      headersReviewed:true,
      softwareVersionConfirmed:true,
      tableNameConfirmed:true,
      unitsConfirmed:true,
      compatibilityReplayPassed:true,
      nonEngineeringUseAcknowledged:true,
      originalSourceExcluded:true,
    },
  };
  writeJson(reviewPath, review);
  writeJson(manifestPath, {
    schemaVersion:'rc-joint-reaction-observed-fixtures.v1',
    fixturePolicy:'anonymized-observed-exports-only',
    fixtures:[],
  });
  const options = { candidatePath, evidencePath, reviewPath, manifestPath, fixtureId };

  const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
  const lockPath = `${manifestPath}.promotion.lock`;
  const lockData = overrides => ({
    schemaVersion:'rc-joint-reaction-observed-promotion-lock.v2',
    transactionId:'a'.repeat(32),
    fixtureId,
    candidateSha256:evidence.output.sha256,
    fixtureFile:`observed/${fixtureId}.csv`,
    provenanceFile:`observed/${fixtureId}.provenance.json`,
    manifestSha256:sha256(Buffer.from(manifestBefore, 'utf8')),
    pid:2147483647,
    hostname:os.hostname(),
    acquiredAt:new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    ...(overrides || {}),
  });

  const absentLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(absentLock.status, 'absent');
  assert.equal(absentLock.lockExists, false);
  assert.equal(absentLock.safeToClear, false);
  const cliAbsentLock = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
    '--manifest', manifestPath,
    '--lock-status', 'yes',
  ], { encoding:'utf8' });
  assert.equal(cliAbsentLock.status, 0, cliAbsentLock.stderr);
  assert.equal(JSON.parse(cliAbsentLock.stdout).status, 'absent');
  const missingManifestLock = Gate.assessPromotionLock({ manifestPath:path.join(tempRoot, 'missing-observed-manifest.json') });
  assert.equal(missingManifestLock.status, 'invalid-manifest-target');
  assert.deepEqual(missingManifestLock.issues, ['manifest-missing']);
  const invalidManifestPath = path.join(tempRoot, 'invalid-observed-manifest.json');
  fs.writeFileSync(invalidManifestPath, '{not-json}\n', 'utf8');
  const invalidManifestLock = Gate.assessPromotionLock({ manifestPath:invalidManifestPath });
  assert.equal(invalidManifestLock.status, 'invalid-manifest');
  assert.deepEqual(invalidManifestLock.issues, ['manifest-unreadable']);
  fs.unlinkSync(invalidManifestPath);

  const junctionManifestDir = path.join(tempRoot, 'junction-manifest-target');
  const junctionManifestTarget = path.join(junctionManifestDir, path.basename(manifestPath));
  fs.mkdirSync(junctionManifestDir);
  fs.writeFileSync(junctionManifestTarget, manifestBefore, 'utf8');
  const manifestJunctionPath = path.join(os.tmpdir(), `${path.basename(tempRoot)}-manifest-junction`);
  fs.symlinkSync(tempRoot, manifestJunctionPath, 'junction');
  try {
    const junctionManifestPath = path.join(manifestJunctionPath, path.basename(junctionManifestDir), path.basename(manifestPath));
    const junctionLock = Gate.assessPromotionLock({ manifestPath:junctionManifestPath });
    assert.equal(junctionLock.status, 'invalid-manifest-target');
    assert.ok(junctionLock.issues.includes('manifest-parent-not-canonical'));
    const cliJunctionLock = spawnSync(process.execPath, [
      path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
      '--manifest', junctionManifestPath,
      '--lock-status', 'yes',
    ], { encoding:'utf8' });
    assert.equal(cliJunctionLock.status, 0, cliJunctionLock.stderr);
    assert.equal(JSON.parse(cliJunctionLock.stdout).status, 'invalid-manifest-target');
    assert.throws(
      () => Gate.promoteCandidate({ ...options, manifestPath:junctionManifestPath }),
      /父路徑不得經過符號連結或 junction/
    );
    assert.equal(fs.existsSync(`${junctionManifestTarget}.promotion.lock`), false, 'manifest junction block creates no promotion lock');
    assert.equal(fs.existsSync(path.join(junctionManifestDir, 'observed')), false, 'manifest junction block creates no observed output');
  } finally {
    fs.unlinkSync(manifestJunctionPath);
    fs.unlinkSync(junctionManifestTarget);
    fs.rmdirSync(junctionManifestDir);
  }

  const originalRealpathNative = fs.realpathSync.native;
  let manifestParentIdentityChecks = 0;
  fs.realpathSync.native = function injectedManifestParentRedirect(filePath, ...args) {
    if (path.resolve(filePath) === path.resolve(tempRoot)) {
      manifestParentIdentityChecks += 1;
      if (manifestParentIdentityChecks === 2) return path.join(tempRoot, 'redirected-parent');
    }
    return originalRealpathNative.call(fs.realpathSync, filePath, ...args);
  };
  try {
    assert.throws(() => Gate.promoteCandidate(options), /父路徑不得經過符號連結或 junction/);
  } finally {
    fs.realpathSync.native = originalRealpathNative;
  }
  assert.ok(manifestParentIdentityChecks >= 2, 'promotion rechecks canonical manifest parent before lock acquisition');
  assert.equal(fs.existsSync(lockPath), false, 'manifest parent identity change creates no promotion lock');
  assert.equal(fs.existsSync(path.join(tempRoot, 'observed')), false, 'manifest parent identity change creates no observed output');

  const cliStatusWithoutYes = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
    '--manifest', manifestPath,
    '--lock-status', 'no',
  ], { encoding:'utf8' });
  assert.equal(cliStatusWithoutYes.status, 1);
  assert.match(cliStatusWithoutYes.stderr, /--lock-status 只接受明確值 yes/);
  const cliClearWithoutYes = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
    '--manifest', manifestPath,
    '--clear-stale-lock', 'no',
    '--expected-lock-sha256', '0'.repeat(64),
  ], { encoding:'utf8' });
  assert.equal(cliClearWithoutYes.status, 1);
  assert.match(cliClearWithoutYes.stderr, /--clear-stale-lock 只接受明確值 yes/);

  writeJson(lockPath, lockData({ pid:process.pid }));
  const activeLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(activeLock.status, 'active');
  assert.equal(activeLock.processState, 'active');
  assert.equal(activeLock.safeToClear, false);
  assert.throws(() => Gate.clearStalePromotionLock({ manifestPath, confirm:'yes', expectedLockSha256:activeLock.lockSha256 }), /不可安全清除：active/);
  fs.unlinkSync(lockPath);

  writeJson(lockPath, lockData({ acquiredAt:new Date().toISOString() }));
  const recentLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(recentLock.status, 'recent-inactive');
  assert.equal(recentLock.processState, 'inactive');
  assert.equal(recentLock.safeToClear, false);
  fs.unlinkSync(lockPath);

  writeJson(lockPath, lockData({ hostname:'different-host-for-negative-test' }));
  const foreignLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(foreignLock.status, 'foreign-host-unverified');
  assert.equal(foreignLock.processState, 'foreign-host');
  assert.equal(foreignLock.safeToClear, false);
  fs.unlinkSync(lockPath);

  writeJson(lockPath, lockData());
  const staleAbandonedLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(staleAbandonedLock.status, 'stale-safe-to-clear');
  assert.equal(staleAbandonedLock.transactionState, 'abandoned-lock-only');
  assert.equal(staleAbandonedLock.safeToClear, true);
  assert.throws(() => Gate.clearStalePromotionLock({ manifestPath, confirm:'yes', expectedLockSha256:'0'.repeat(64) }), /SHA-256 已改變/);
  assert.equal(fs.existsSync(lockPath), true, 'hash mismatch keeps stale lock');
  const cliClear = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
    '--manifest', manifestPath,
    '--clear-stale-lock', 'yes',
    '--expected-lock-sha256', staleAbandonedLock.lockSha256,
  ], { encoding:'utf8' });
  assert.equal(cliClear.status, 0, cliClear.stderr);
  assert.equal(JSON.parse(cliClear.stdout).status, 'cleared');
  assert.equal(fs.existsSync(lockPath), false, 'explicit SHA-bound clear removes stale lock');
  assert.deepEqual(fs.readdirSync(tempRoot).filter(name => name.includes('.promotion-clear-')), [], 'stale clear leaves no quarantine residue');

  const assessed = Gate.assessPromotion(options);
  assert.equal(assessed.ready, true);
  assert.equal(assessed.issueCount, 0);
  assert.equal(assessed.sourceFileStored, false);
  assert.equal(assessed.sourceHashWillBeCommitted, false);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'assessment must be read-only');
  assert.equal(fs.existsSync(path.join(tempRoot, 'observed')), false, 'assessment must not create output directory');

  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-fixture-promotion-gate.js'),
    '--candidate', candidatePath,
    '--evidence', evidencePath,
    '--review', reviewPath,
    '--fixture-id', fixtureId,
    '--manifest', manifestPath,
  ], { encoding:'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ready, true);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'CLI without --promote yes must remain read-only');

  const failedReviewPath = path.join(tempRoot, 'failed.review.json');
  writeJson(failedReviewPath, { ...review, assertions:{ ...review.assertions, headersReviewed:false } });
  const failedReview = Gate.assessPromotion({ ...options, reviewPath:failedReviewPath });
  assert.equal(failedReview.ready, false);
  assert.ok(failedReview.issues.some(item => item.code === 'review-assertion-incomplete'));

  const placeholderReviewerPath = path.join(tempRoot, 'placeholder-reviewer.review.json');
  writeJson(placeholderReviewerPath, { ...review, reviewer:'replace-with-reviewer-or-role' });
  const placeholderReviewer = Gate.assessPromotion({ ...options, reviewPath:placeholderReviewerPath });
  assert.equal(placeholderReviewer.ready, false);
  assert.ok(placeholderReviewer.issues.some(item => item.code === 'reviewer-missing'));

  const syntheticEvidencePath = path.join(tempRoot, 'synthetic-origin.evidence.json');
  writeJson(syntheticEvidencePath, { ...evidence, originKind:'synthetic-compatibility' });
  const syntheticOrigin = Gate.assessPromotion({ ...options, evidencePath:syntheticEvidencePath });
  assert.equal(syntheticOrigin.ready, false);
  assert.ok(syntheticOrigin.issues.some(item => item.code === 'origin-not-observed'));
  assert.throws(
    () => Gate.promoteCandidate({ ...options, evidencePath:syntheticEvidencePath }),
    /只有 actual-observed 實際匯出候選可升級/
  );

  const tamperedPath = path.join(tempRoot, 'tampered.csv');
  fs.writeFileSync(tamperedPath, sanitized.sanitized.replace('110', '999'), 'utf8');
  const tamperedEvidence = { ...evidence, output:{ ...evidence.output, file:path.basename(tamperedPath) } };
  const tamperedEvidencePath = path.join(tempRoot, 'tampered.evidence.json');
  writeJson(tamperedEvidencePath, tamperedEvidence);
  const tampered = Gate.assessPromotion({ ...options, candidatePath:tamperedPath, evidencePath:tamperedEvidencePath });
  assert.equal(tampered.ready, false);
  assert.ok(tampered.issues.some(item => item.code === 'candidate-hash-mismatch'));
  assert.ok(tampered.issues.some(item => item.code === 'numeric-not-synthetic'));

  const observedDir = path.join(tempRoot, 'observed');
  const fixtureTarget = path.join(observedDir, `${fixtureId}.csv`);
  const transactionResidue = () => fs.readdirSync(tempRoot).filter(name => name.includes('.promotion')).sort();

  fs.mkdirSync(observedDir);
  fs.writeFileSync(fixtureTarget, 'preexisting-observed-fixture\n', 'utf8');
  assert.throws(() => Gate.promoteCandidate(options), /observed fixture 目標已存在/);
  assert.equal(fs.readFileSync(fixtureTarget, 'utf8'), 'preexisting-observed-fixture\n');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'target conflict keeps manifest bytes');
  assert.deepEqual(fs.readdirSync(observedDir), [`${fixtureId}.csv`], 'target conflict creates no provenance');
  assert.equal(fs.existsSync(lockPath), false, 'target conflict releases promotion lock');
  fs.rmSync(observedDir, { recursive:true, force:true });

  const observedJunctionTarget = path.join(tempRoot, 'observed-junction-target');
  fs.mkdirSync(observedJunctionTarget);
  fs.symlinkSync(observedJunctionTarget, observedDir, 'junction');
  assert.equal(fs.lstatSync(observedDir).isSymbolicLink(), true, 'test fixture must be a junction');
  assert.throws(() => Gate.promoteCandidate(options), /observed 輸出目錄不得是符號連結/);
  assert.deepEqual(fs.readdirSync(observedJunctionTarget), [], 'blocked observed junction target stays untouched');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'junction block keeps manifest bytes');
  assert.equal(fs.existsSync(lockPath), false, 'junction block releases promotion lock');
  fs.rmSync(observedDir, { recursive:true, force:true });

  fs.writeFileSync(lockPath, 'preexisting-promotion-lock\n', 'utf8');
  const invalidLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(invalidLock.status, 'invalid-lock');
  assert.equal(invalidLock.safeToClear, false);
  assert.throws(() => Gate.promoteCandidate(options), /observed 清冊升級鎖已存在/);
  assert.equal(fs.readFileSync(lockPath, 'utf8'), 'preexisting-promotion-lock\n', 'existing lock is never overwritten');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'lock conflict keeps manifest bytes');
  assert.equal(fs.existsSync(observedDir), false, 'lock conflict creates no observed directory');
  fs.unlinkSync(lockPath);

  const recoveryResiduePath = `${manifestPath}.promotion-clear-${'b'.repeat(16)}`;
  fs.writeFileSync(recoveryResiduePath, 'incomplete-lock-clear\n', 'utf8');
  const recoveryResidue = Gate.assessPromotionLock({ manifestPath });
  assert.equal(recoveryResidue.status, 'recovery-residue');
  assert.equal(recoveryResidue.recoveryResidueCount, 1);
  assert.throws(() => Gate.promoteCandidate(options), /lock recovery 殘留/);
  assert.equal(fs.existsSync(observedDir), false, 'recovery residue blocks before observed output');
  fs.unlinkSync(recoveryResiduePath);

  fs.mkdirSync(observedDir);
  fs.writeFileSync(fixtureTarget, 'partial-observed-fixture\n', 'utf8');
  writeJson(lockPath, lockData({ transactionId:'c'.repeat(32) }));
  const partialLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(partialLock.status, 'partial-transaction');
  assert.equal(partialLock.transactionState, 'partial-or-inconsistent');
  assert.equal(partialLock.safeToClear, false);
  assert.throws(() => Gate.clearStalePromotionLock({ manifestPath, confirm:'yes', expectedLockSha256:partialLock.lockSha256 }), /不可安全清除：partial-transaction/);
  assert.equal(fs.readFileSync(fixtureTarget, 'utf8'), 'partial-observed-fixture\n', 'partial transaction is never auto-deleted');
  fs.rmSync(observedDir, { recursive:true, force:true });
  fs.unlinkSync(lockPath);

  const concurrentManifest = `${JSON.stringify({
    schemaVersion:'rc-joint-reaction-observed-fixtures.v1',
    fixturePolicy:'anonymized-observed-exports-only',
    fixtures:[{ id:'other-process-observed-001' }],
  }, null, 2)}\n`;
  const originalReadFileSync = fs.readFileSync;
  const originalWriteFileSync = fs.writeFileSync;
  let manifestReadCount = 0;
  fs.readFileSync = function injectedConcurrentManifestRead(filePath, ...args) {
    if (typeof filePath === 'string' && path.resolve(filePath) === path.resolve(manifestPath)) {
      manifestReadCount += 1;
      if (manifestReadCount === 3) originalWriteFileSync(manifestPath, concurrentManifest, 'utf8');
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  };
  try {
    assert.throws(() => Gate.promoteCandidate(options), /清冊在升級期間已變更/);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), concurrentManifest, 'transaction preserves a competing manifest update');
  assert.equal(fs.existsSync(observedDir), false, 'manifest competition rolls back observed outputs and empty directory');
  assert.equal(fs.existsSync(lockPath), false, 'manifest competition releases promotion lock');
  assert.deepEqual(transactionResidue(), [], 'manifest competition leaves no lock, next or backup residue');
  fs.writeFileSync(manifestPath, manifestBefore, 'utf8');

  const originalRenameSync = fs.renameSync;
  fs.renameSync = function injectedManifestReplaceFailure(sourcePath, destinationPath) {
    if (typeof sourcePath === 'string' && sourcePath.includes('.promotion-next')
        && path.resolve(destinationPath) === path.resolve(manifestPath)) {
      const error = new Error('injected manifest replace failure');
      error.code = 'EIO';
      throw error;
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  try {
    assert.throws(() => Gate.promoteCandidate(options), /交易式升級失敗：injected manifest replace failure/);
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'replace failure preserves original manifest bytes');
  assert.equal(fs.existsSync(observedDir), false, 'replace failure rolls back fixture, provenance and empty directory');
  assert.equal(fs.existsSync(lockPath), false, 'replace failure releases promotion lock');
  assert.deepEqual(transactionResidue(), [], 'replace failure leaves no lock, next or backup residue');

  const promoted = Gate.promoteCandidate(options);
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.transaction, 'exclusive-lock-preflight-atomic-manifest-v1');
  assert.equal(promoted.lockCleanupRequired, false);
  assert.equal(promoted.sourceFileStored, false);
  assert.equal(promoted.sourceHashCommitted, false);
  const promotedFixture = fs.readFileSync(path.join(tempRoot, promoted.fixtureFile), 'utf8');
  const promotedProvenanceText = fs.readFileSync(path.join(tempRoot, promoted.provenanceFile), 'utf8');
  const promotedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(promotedManifest.fixtures.length, 1);
  assert.equal(promotedManifest.fixtures[0].provenance, 'anonymized-observed-export');
  assert.equal(promotedManifest.fixtures[0].sha256, evidence.output.sha256);
  assert.equal(JSON.parse(promotedProvenanceText).privacy.sourceHashCommitted, false);
  assert.ok(!promotedProvenanceText.includes(evidence.source.sha256), 'committed provenance must exclude original source hash');
  for (const secret of ['CONFIDENTIAL PROJECT 9387', 'PRIVATE-B3', 'SECRET-J1', 'PRIVATE-DEAD', '765432.1']) {
    assert.ok(!promotedFixture.includes(secret), `promoted fixture leaked ${secret}`);
    assert.ok(!promotedProvenanceText.includes(secret), `promoted provenance leaked ${secret}`);
  }
  assert.equal(fs.existsSync(lockPath), false, 'successful promotion releases promotion lock');
  assert.deepEqual(transactionResidue(), [], 'successful promotion leaves no lock, next or backup residue');

  writeJson(lockPath, lockData({ transactionId:'d'.repeat(32) }));
  fs.writeFileSync(path.join(tempRoot, promoted.provenanceFile), `${promotedProvenanceText.trimEnd()}\nTAMPERED\n`, 'utf8');
  const tamperedCommittedLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(tamperedCommittedLock.status, 'partial-transaction');
  assert.equal(tamperedCommittedLock.transactionState, 'partial-or-inconsistent');
  assert.equal(tamperedCommittedLock.safeToClear, false);
  assert.equal(fs.existsSync(lockPath), true, 'tampered committed output keeps stale lock');
  fs.writeFileSync(path.join(tempRoot, promoted.provenanceFile), promotedProvenanceText, 'utf8');
  const committedLock = Gate.assessPromotionLock({ manifestPath });
  assert.equal(committedLock.status, 'stale-safe-to-clear');
  assert.equal(committedLock.transactionState, 'committed-lock-residue');
  assert.equal(committedLock.safeToClear, true);
  const clearedCommittedLock = Gate.clearStalePromotionLock({
    manifestPath,
    confirm:'yes',
    expectedLockSha256:committedLock.lockSha256,
  });
  assert.equal(clearedCommittedLock.status, 'cleared');
  assert.equal(clearedCommittedLock.transactionState, 'committed-lock-residue');
  assert.equal(fs.existsSync(lockPath), false);
  assert.deepEqual(transactionResidue(), [], 'committed lock recovery leaves no residue');
  assert.throws(() => Gate.promoteCandidate(options), /不可升級|已存在/);
} finally {
  fs.rmSync(tempRoot, { recursive:true, force:true });
}

console.log('joint reaction observed fixture promotion gate tests passed');
