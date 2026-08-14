const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');
const assistant = require('./public-release-change-assistant.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const clone = value => JSON.parse(JSON.stringify(value));
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const metricsOf = entry => Object.fromEntries(entry.metrics.map(metric => [metric.id, metric.required]));
const inactiveAuthorization = {
  schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
  kind: schema.REDUCTION_AUTHORIZATION_KIND,
  active: false,
};

const baseline = assistant.baselineHistoryEntry(repoRoot);
const baselineMetrics = metricsOf(baseline);
const unchangedCandidate = assistant.candidateEntry(
  baseline.runId,
  baseline.records.required,
  baseline.postChecks.required,
  baselineMetrics,
);
const unchanged = assistant.buildPreview(baseline, unchangedCandidate);
assert.equal(unchanged.classification, 'unchanged', 'same public thresholds preview as unchanged');
assert.equal(unchanged.authorizationRequired, false, 'unchanged preview does not ask for authorization');

const expandedCandidate = assistant.candidateEntry(
  '20990101-010101',
  baseline.records.required + 1,
  baseline.postChecks.required,
  baselineMetrics,
);
const expanded = assistant.buildPreview(baseline, expandedCandidate);
assert.equal(expanded.classification, 'expanded', 'higher threshold previews as expanded');
assert.deepEqual(expanded.increases, [{ id: 'records', from: baseline.records.required, to: baseline.records.required + 1 }]);

const reducedMetrics = { ...baselineMetrics, steelResult: baselineMetrics.steelResult - 1 };
assert.ok(reducedMetrics.steelResult > 0, 'tracked fixture leaves a positive reduced threshold');
const reducedCandidate = assistant.candidateEntry(
  '20990101-020202',
  baseline.records.required,
  baseline.postChecks.required,
  reducedMetrics,
);
const reduced = assistant.buildPreview(baseline, reducedCandidate);
assert.equal(reduced.classification, 'reduced', 'lower threshold previews as reduced');
assert.equal(reduced.authorizationRequired, true, 'reduction explicitly requires authorization');

const reasonCode = 'scope-change';
const reason = '公開工具範圍調整，移除已停用且不再交付的既有頁面。';
const exactAuthorization = assistant.buildAuthorization(reduced, reasonCode, reason);
assert.deepEqual(exactAuthorization.reductions, reduced.reductions, 'authorization records the exact previewed reduction');
assert.throws(() => assistant.buildAuthorization(unchanged, reasonCode, reason), /actual reduction/, 'no-change preview cannot create approval');
assert.throws(() => assistant.buildAuthorization(reduced, reasonCode, 'C:\\Users\\USER\\private evidence'), /authorization is invalid/, 'private path cannot become a public reason');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-release-change-assistant-'));
try {
  writeJson(path.join(tempRoot, '.github', 'public-release-reduction-authorization.json'), inactiveAuthorization);
  const written = assistant.writeAuthorization(tempRoot, reduced, reasonCode, reason);
  assert.equal(written.changed, true, 'exact reduction authorization is written once');
  assert.deepEqual(readJson(written.target), exactAuthorization, 'written authorization is closed and exact');
  assert.equal(assistant.writeAuthorization(tempRoot, reduced, reasonCode, reason).changed, false, 'same active authorization is idempotent');
  assert.throws(
    () => assistant.writeAuthorization(tempRoot, reduced, reasonCode, '公開工具範圍調整，改以另一份不可混用的核准理由。'),
    /different active reduction authorization/,
    'different active approval cannot be overwritten',
  );
  assert.throws(
    () => assistant.writeAuthorization(tempRoot, reduced, reasonCode, reason, '..\\outside-authorization.json'),
    /inside the repository/,
    'authorization writes cannot escape the repository',
  );

  const candidateFile = path.join(tempRoot, 'candidate.json');
  writeJson(candidateFile, {
    schemaVersion: 1,
    kind: 'public-release-threshold-candidate',
    runId: reducedCandidate.runId,
    recordsRequired: reducedCandidate.records.required,
    postChecksRequired: reducedCandidate.postChecks.required,
    metrics: reducedMetrics,
  });
  assert.equal(assistant.candidateFromClosedFile(candidateFile).runId, reducedCandidate.runId, 'closed candidate file is accepted');
  writeJson(candidateFile, { ...readJson(candidateFile), undeclared: true });
  assert.throws(() => assistant.candidateFromClosedFile(candidateFile), /undeclared or missing fields/, 'candidate file rejects extra fields');

  assert.throws(
    () => assistant.parseArgs(['--candidate-file', 'candidate.json', '--candidate-preflight', 'preflight.json']),
    /cannot be combined/,
    'candidate sources cannot be mixed',
  );
  assert.throws(() => assistant.parseArgs(['--reason', reason]), /only accepted/, 'reason without write action is rejected');
  assert.throws(() => assistant.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI arguments fail closed');
  const baselinePreflightPath = path.join(repoRoot, 'output', 'preflight', 'history', baseline.runId, 'preflight-summary.json');
  if (fs.existsSync(baselinePreflightPath)) {
    assert.throws(
      () => assistant.candidateFromCurrentOutput(repoRoot, {
        preflightFile: `output/preflight/history/${baseline.runId}/preflight-summary.json`,
        renderedEvidenceFile: 'output/definitely-missing-evidence.json',
      }),
      /rendered delivery evidence is missing/,
      'explicit candidate evidence cannot silently fall back to another release',
    );
  }
  const latestOutputPath = path.join(repoRoot, 'output', 'preflight', 'preflight-summary.json');
  if (fs.existsSync(latestOutputPath)) {
    const latestOutput = readJson(latestOutputPath);
    if (latestOutput.quick === true) {
      assert.throws(
        () => assistant.candidateFromCurrentOutput(repoRoot, { preflightFile: 'output/preflight/preflight-summary.json' }),
        /quick evidence cannot predict formal thresholds/,
        'explicit quick preflight remains ineligible for threshold authorization',
      );
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const statusRoot = path.join(repoRoot, '結構工具箱', 'assets', 'status');
const baseBundle = {
  platformStatus: readJson(path.join(statusRoot, 'platform-status.json')),
  preflightStatus: readJson(path.join(statusRoot, 'preflight-summary.json')),
  reportReadinessStatus: readJson(path.join(statusRoot, 'report-readiness-status.json')),
};
function bundleFor(runId, generatedAt) {
  const bundle = clone(baseBundle);
  Object.values(bundle).forEach(snapshot => {
    snapshot.publicEvidenceSchemaVersion = schema.SCHEMA_VERSION;
    snapshot.runId = runId;
    snapshot.generatedAt = generatedAt;
  });
  delete bundle.preflightStatus.releaseHistory;
  return bundle;
}
function setMetricRequired(bundle, requiredKey, completeKey, passKey, value) {
  bundle.reportReadinessStatus[requiredKey] = value;
  bundle.reportReadinessStatus[completeKey] = value;
  bundle.reportReadinessStatus[passKey] = true;
}

const resetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-release-change-reset-'));
try {
  const previousBundle = bundleFor('20990102-010101', '2099-01-02T01:01:01+08:00');
  const reducedBundle = bundleFor('20990102-020202', '2099-01-02T02:02:02+08:00');
  const requiredKey = 'steelResultReconciliationRequired';
  const completeKey = 'steelResultReconciliationComplete';
  const passKey = 'steelResultReconciliationPass';
  const from = previousBundle.reportReadinessStatus[requiredKey];
  setMetricRequired(reducedBundle, requiredKey, completeKey, passKey, from - 1);
  const resetAuthorization = {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    previousRunId: previousBundle.preflightStatus.runId,
    reasonCode,
    reason,
    reductions: [{ id: 'steelResult', from, to: from - 1 }],
  };
  reducedBundle.preflightStatus.releaseHistory = schema.buildReleaseHistory(previousBundle, reducedBundle, resetAuthorization);
  assert.equal(schema.validatePublicEvidenceBundle(reducedBundle).pass, true, 'reset fixture is a valid tracked reduced release');
  writeJson(path.join(resetRoot, '結構工具箱', 'assets', 'status', 'platform-status.json'), reducedBundle.platformStatus);
  writeJson(path.join(resetRoot, '結構工具箱', 'assets', 'status', 'preflight-summary.json'), reducedBundle.preflightStatus);
  writeJson(path.join(resetRoot, '結構工具箱', 'assets', 'status', 'report-readiness-status.json'), reducedBundle.reportReadinessStatus);
  const resetPath = path.join(resetRoot, '.github', 'public-release-reduction-authorization.json');
  writeJson(resetPath, resetAuthorization);
  assert.equal(assistant.resetAuthorization(resetRoot).changed, true, 'used authorization resets only after exact tracked history proof');
  assert.deepEqual(readJson(resetPath), inactiveAuthorization, 'safe reset removes all reusable approval details');
  assert.equal(assistant.resetAuthorization(resetRoot).changed, false, 'inactive reset is idempotent');

  writeJson(resetPath, { ...inactiveAuthorization, undeclared: true });
  assert.throws(() => assistant.resetAuthorization(resetRoot), /inactive authorization config is malformed/, 'malformed inactive config fails closed');

  writeJson(resetPath, { ...resetAuthorization, undeclared: true });
  assert.throws(
    () => assistant.resetAuthorization(resetRoot),
    /cannot be reset until the tracked public history proves/,
    'malformed active authorization cannot be reset through historical coincidence',
  );
  writeJson(resetPath, resetAuthorization);
  assert.throws(
    () => assistant.resetAuthorization(resetRoot, assistant.AUTHORIZATION_FILE, () => { throw new Error('simulated receipt failure'); }),
    /active authorization was restored/,
    'receipt failure rolls the authorization config back to active',
  );
  assert.deepEqual(readJson(resetPath), resetAuthorization, 'rollback preserves the exact active authorization for a safe retry');
} finally {
  fs.rmSync(resetRoot, { recursive: true, force: true });
}

const authorizationPath = path.join(repoRoot, '.github', 'public-release-reduction-authorization.json');
const authorizationHashBefore = fs.readFileSync(authorizationPath, 'utf8');
const latestOutputPath = path.join(repoRoot, 'output', 'preflight', 'preflight-summary.json');
let liveReadOnly = 0;
if (fs.existsSync(latestOutputPath)) {
  const livePreview = JSON.parse(childProcess.execFileSync(process.execPath, [__filename.replace(/\.test\.js$/, '.js'), '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }));
  assert.equal(livePreview.classification, 'unchanged', 'default CLI previews current formal evidence read-only');
  assert.equal(livePreview.authorizationRequired, false, 'current unchanged release needs no approval');
  assert.equal(fs.readFileSync(authorizationPath, 'utf8'), authorizationHashBefore, 'default CLI never mutates tracked authorization');
  liveReadOnly = 1;
}

console.log(`public release change assistant OK (preview=3, writeGuards=7, resetGuards=5, evidenceGuards=2, liveReadOnly=${liveReadOnly})`);
