const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');
const receipts = require('./public-release-decision-receipt.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const clone = value => JSON.parse(JSON.stringify(value));
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const statusRoot = path.join(repoRoot, '結構工具箱', 'assets', 'status');
const baseBundle = {
  platformStatus: readJson(path.join(statusRoot, 'platform-status.json')),
  preflightStatus: readJson(path.join(statusRoot, 'preflight-summary.json')),
  reportReadinessStatus: readJson(path.join(statusRoot, 'report-readiness-status.json')),
};
const baselineRelease = baseBundle.preflightStatus.releaseHistory.entries.at(-1);
const basePreflight = {
  generatedAt: baseBundle.preflightStatus.generatedAt,
  runId: baselineRelease.runId,
  quick: false,
  forcePlatformAudit: true,
  forceSlowChecks: true,
  sourceCommitSha: baselineRelease.sourceCommitSha,
  sourceBranch: 'master',
  sourceDirty: false,
  pass: true,
  failureCount: 0,
  failures: [],
  failedKeys: [],
  recordsCount: baselineRelease.records.required,
  passedCount: baselineRelease.records.required,
  postCheckCount: baselineRelease.postChecks.required,
  postChecksPassedCount: baselineRelease.postChecks.required,
  postCheckFailures: [],
};
const baseEvidence = {
  schemaVersion: 1,
  kind: 'rendered-delivery-evidence-summary',
  runId: baselineRelease.runId,
  pass: true,
};
const inactive = receipts.inactiveAuthorization();
assert.equal(receipts.isFormalPreflightForRelease(basePreflight, baselineRelease), true, 'complete clean formal preflight matches its tracked public release');
assert.equal(receipts.isFormalPreflightForRelease({ ...basePreflight, pass: false, failureCount: 1 }, baselineRelease), false, 'failed latest preflight cannot represent the tracked public release');
assert.equal(receipts.isFormalPreflightForRelease({ ...basePreflight, postChecksPassedCount: basePreflight.postCheckCount - 1 }, baselineRelease), false, 'partial post-check evidence cannot represent the tracked public release');

function writeBundle(root, bundle) {
  writeJson(path.join(root, '結構工具箱', 'assets', 'status', 'platform-status.json'), bundle.platformStatus);
  writeJson(path.join(root, '結構工具箱', 'assets', 'status', 'preflight-summary.json'), bundle.preflightStatus);
  writeJson(path.join(root, '結構工具箱', 'assets', 'status', 'report-readiness-status.json'), bundle.reportReadinessStatus);
}

function writeInputs(root, bundle, preflight, evidence, authorization) {
  writeBundle(root, bundle);
  writeJson(path.join(root, 'output', 'preflight', 'preflight-summary.json'), preflight);
  writeJson(path.join(root, 'output', 'preflight', 'history', preflight.runId, 'rendered-delivery-evidence', 'rendered-delivery-evidence-summary.json'), evidence);
  writeJson(path.join(root, '.github', 'public-release-reduction-authorization.json'), authorization);
  const anchorPath = path.join(root, '.github', 'public-release-decision-anchor.json');
  if (!fs.existsSync(anchorPath)) writeJson(anchorPath, receipts.inactiveAnchor());
}

function bundleFor(runId, generatedAt, sourceCommitSha) {
  const bundle = clone(baseBundle);
  Object.values(bundle).forEach(snapshot => {
    snapshot.publicEvidenceSchemaVersion = schema.SCHEMA_VERSION;
    snapshot.runId = runId;
    snapshot.generatedAt = generatedAt;
  });
  bundle.preflightStatus.sourceCommitSha = sourceCommitSha;
  delete bundle.preflightStatus.releaseHistory;
  return bundle;
}

function preflightFor(bundle) {
  const latest = bundle.preflightStatus.releaseHistory.entries.at(-1);
  return {
    ...clone(basePreflight),
    generatedAt: bundle.preflightStatus.generatedAt,
    runId: latest.runId,
    quick: false,
    forcePlatformAudit: true,
    forceSlowChecks: true,
    sourceCommitSha: latest.sourceCommitSha,
    sourceBranch: 'master',
    sourceDirty: false,
    pass: true,
    failureCount: 0,
    failures: [],
    failedKeys: [],
    recordsCount: latest.records.required,
    passedCount: latest.records.required,
    postCheckCount: latest.postChecks.required,
    postChecksPassedCount: latest.postChecks.required,
    postCheckFailures: [],
  };
}

const livePreflightPath = path.join(repoRoot, 'output', 'preflight', 'preflight-summary.json');
const anchor = readJson(path.join(repoRoot, receipts.ANCHOR_FILE));
const liveAnchorReceiptPath = anchor.active === true
  ? path.join(repoRoot, 'output', 'preflight', 'history', anchor.runId, receipts.DECISION_FILE)
  : '';
const hasLiveDecisionContext = fs.existsSync(livePreflightPath)
  && (anchor.active === false || fs.existsSync(liveAnchorReceiptPath));
let liveReadOnly = 0;
if (hasLiveDecisionContext) {
  const livePreflight = readJson(livePreflightPath);
  const liveEvidencePath = path.join(
    repoRoot,
    'output',
    'preflight',
    'history',
    livePreflight.runId,
    'rendered-delivery-evidence',
    'rendered-delivery-evidence-summary.json',
  );
  if (receipts.isFormalPreflightForRelease(livePreflight, baselineRelease) && fs.existsSync(liveEvidencePath)) {
    const preview = receipts.buildDecisionReceipt(repoRoot);
    assert.equal(preview.authorization.state, 'not-required', 'current unchanged release needs no authorization in its private decision receipt');
    assert.equal(preview.reset.state, 'not-applicable', 'no-authorization receipt has no reset lifecycle');
    assert.equal(receipts.validateDecisionReceipt(preview).pass, true, 'current receipt preview validates as a closed receipt');
    assert.equal(receipts.validateDecisionReceipt({ ...preview, undeclared: true }).pass, false, 'decision receipt rejects undeclared fields');

    const realTarget = path.join(repoRoot, 'output', 'preflight', 'history', livePreflight.runId, receipts.DECISION_FILE);
    const existedBefore = fs.existsSync(realTarget);
    const stdout = childProcess.execFileSync(process.execPath, [path.join(__dirname, 'public-release-decision-receipt.js'), '--json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(JSON.parse(stdout).changed, false, 'default CLI is read-only');
    assert.equal(fs.existsSync(realTarget), existedBefore, 'default CLI does not create a real decision receipt');
    liveReadOnly = 1;
  }
}

const historyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-release-decision-history-'));
try {
  writeInputs(historyRoot, baseBundle, basePreflight, baseEvidence, inactive);
  const first = receipts.writeDecisionReceipt(historyRoot);
  assert.equal(first.changed, true, 'first decision receipt is appended');
  assert.match(first.receipt.receiptId, /^PRD-[0-9A-F]{24}$/, 'decision receipt has content-derived ID');
  assert.equal(receipts.writeDecisionReceipt(historyRoot).changed, false, 'same formal evidence is idempotent without rewriting receipt');
  assert.equal(receipts.loadDecisionHistory(historyRoot).entries.length, 1, 'single decision receipt validates as the chain root');

  const nextBundle = bundleFor('20990103-020202', '2099-01-03 02:02:02', 'b'.repeat(40));
  nextBundle.preflightStatus.releaseHistory = schema.buildReleaseHistory(baseBundle, nextBundle, inactive);
  const nextPreflight = preflightFor(nextBundle);
  const nextEvidence = { ...clone(baseEvidence), runId: nextPreflight.runId, pass: true };
  writeInputs(historyRoot, nextBundle, nextPreflight, nextEvidence, inactive);
  const second = receipts.writeDecisionReceipt(historyRoot);
  assert.equal(second.receipt.previousReceipt.receiptId, first.receipt.receiptId, 'next receipt links the prior content-derived ID');
  assert.equal(second.receipt.previousReceipt.receiptSha256, receipts.digestObject(first.receipt), 'next receipt links the prior canonical digest');
  assert.equal(receipts.loadDecisionHistory(historyRoot).entries.length, 2, 'two decision receipts validate as an ordered hash chain');
  assert.equal(receipts.validateDecisionHistoryAnchor(historyRoot).anchor.receiptId, second.receipt.receiptId, 'tracked private anchor binds the current chain tip');

  const firstPath = path.join(historyRoot, 'output', 'preflight', 'history', first.receipt.runId, receipts.DECISION_FILE);
  const pristineFirst = fs.readFileSync(firstPath, 'utf8');
  writeJson(firstPath, { ...readJson(firstPath), undeclared: true });
  assert.throws(() => receipts.loadDecisionHistory(historyRoot), /invalid release decision receipt/, 'tampered prior receipt invalidates the whole chain');
  fs.writeFileSync(firstPath, pristineFirst, 'utf8');
  assert.equal(receipts.loadDecisionHistory(historyRoot).entries.length, 2, 'restored append-only bytes restore the validated chain');

  const secondPath = path.join(historyRoot, 'output', 'preflight', 'history', second.receipt.runId, receipts.DECISION_FILE);
  const pristineSecond = fs.readFileSync(secondPath, 'utf8');
  fs.rmSync(firstPath);
  fs.rmSync(secondPath);
  assert.throws(
    () => receipts.validateDecisionHistoryAnchor(historyRoot, receipts.loadDecisionHistory(historyRoot)),
    /anchor does not match/,
    'tracked anchor detects deletion of the entire ignored private receipt chain',
  );
  fs.writeFileSync(firstPath, pristineFirst, 'utf8');
  fs.writeFileSync(secondPath, pristineSecond, 'utf8');
  assert.equal(receipts.validateDecisionHistoryAnchor(historyRoot).anchor.receiptId, second.receipt.receiptId, 'restored receipts satisfy the tracked chain anchor');
} finally {
  fs.rmSync(historyRoot, { recursive: true, force: true });
}

const resetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-release-decision-reset-'));
try {
  const previous = bundleFor('20990104-010101', '2099-01-04 01:01:01', 'c'.repeat(40));
  previous.preflightStatus.releaseHistory = schema.buildReleaseHistory(null, previous, inactive);
  const reduced = bundleFor('20990104-020202', '2099-01-04 02:02:02', 'd'.repeat(40));
  const requiredKey = 'steelResultReconciliationRequired';
  const completeKey = 'steelResultReconciliationComplete';
  const passKey = 'steelResultReconciliationPass';
  const from = previous.reportReadinessStatus[requiredKey];
  reduced.reportReadinessStatus[requiredKey] = from - 1;
  reduced.reportReadinessStatus[completeKey] = from - 1;
  reduced.reportReadinessStatus[passKey] = true;
  const authorization = {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    previousRunId: previous.preflightStatus.runId,
    reasonCode: 'scope-change',
    reason: '公開工具範圍調整，移除已停用且不再交付的既有頁面。',
    reductions: [{ id: 'steelResult', from, to: from - 1 }],
  };
  reduced.preflightStatus.releaseHistory = schema.buildReleaseHistory(previous, reduced, authorization);
  const reducedPreflight = preflightFor(reduced);
  const reducedEvidence = { ...clone(baseEvidence), runId: reducedPreflight.runId, pass: true };
  writeInputs(resetRoot, reduced, reducedPreflight, reducedEvidence, authorization);
  const decision = receipts.writeDecisionReceipt(resetRoot);
  assert.equal(decision.receipt.authorization.state, 'used', 'authorized reduction receipt records exact one-time approval use');
  assert.equal(decision.receipt.reset.state, 'pending', 'used approval remains pending until a separate reset receipt exists');
  assert.deepEqual(receipts.loadDecisionHistory(resetRoot).pendingRunIds, [reducedPreflight.runId], 'history exposes one pending reset at the chain tip');

  const authorizationPath = path.join(resetRoot, '.github', 'public-release-reduction-authorization.json');
  writeJson(authorizationPath, { ...authorization, reason: '另一份不可混用的核准理由，應被決策鏈拒絕。' });
  assert.throws(() => receipts.prepareAuthorizationResetReceipt(resetRoot), /does not match/, 'different active authorization cannot claim the pending decision');
  writeJson(authorizationPath, authorization);
  const prepared = receipts.prepareAuthorizationResetReceipt(resetRoot);
  assert.equal(receipts.validateResetReceipt(prepared.receipt, decision.receipt).pass, true, 'prepared reset receipt is closed and linked');
  writeJson(authorizationPath, inactive);
  const reset = receipts.writePreparedResetReceipt(resetRoot, prepared);
  assert.match(reset.receipt.receiptId, /^PRA-[0-9A-F]{24}$/, 'reset receipt has content-derived ID');
  const completedHistory = receipts.loadDecisionHistory(resetRoot);
  assert.equal(completedHistory.pendingRunIds.length, 0, 'reset receipt completes the authorization lifecycle');
  assert.equal(completedHistory.entries.at(-1).reset.receiptId, reset.receipt.receiptId, 'history binds the separate reset receipt to its decision');
  assert.equal(receipts.validateResetReceipt({ ...reset.receipt, undeclared: true }, decision.receipt).pass, false, 'reset receipt rejects undeclared fields');
} finally {
  fs.rmSync(resetRoot, { recursive: true, force: true });
}

assert.throws(() => receipts.parseArgs(['--write', '--check-history']), /mutually exclusive/, 'conflicting CLI actions fail closed');
assert.throws(() => receipts.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI argument fails closed');

const preflightSource = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');
assert.ok(preflightSource.includes('public-release-decision-receipt.test.js'), 'existing public release governance gate runs the receipt contract');
assert.ok(preflightSource.includes('public-release-decision-receipt.js') && preflightSource.includes('"--write", "--json"'), 'formal release writes the private decision receipt');
assert.ok(preflightSource.indexOf('$postSummaryMatrixProc') < preflightSource.indexOf('$decisionReceiptScript'), 'receipt is created only after final public snapshots and post-check evidence');
assert.ok(preflightSource.includes('if ($overallPass -and $isReleaseMode)'), 'quick and ordinary full runs cannot create formal decision receipts');

console.log(`public release decision receipt OK (decisionChain=2, resetLifecycle=1, tamperGuards=7, liveReadOnly=${liveReadOnly})`);
