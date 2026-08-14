const assert = require('assert');
const fs = require('fs');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const statusRoot = path.join(repoRoot, '結構工具箱', 'assets', 'status');
const authorizationPath = path.join(repoRoot, '.github', 'public-release-reduction-authorization.json');
const clone = value => JSON.parse(JSON.stringify(value));
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
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
  if (passKey) bundle.reportReadinessStatus[passKey] = true;
}

const trackedAuthorization = readJson(authorizationPath);
assert.deepEqual(trackedAuthorization, {
  schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
  kind: schema.REDUCTION_AUTHORIZATION_KIND,
  active: false,
}, 'tracked reduction authorization starts inactive and contains no reusable approval');

const legacyBundle = clone(baseBundle);
Object.values(legacyBundle).forEach(snapshot => { snapshot.publicEvidenceSchemaVersion = 2; });
legacyBundle.preflightStatus.releaseHistory.schemaVersion = 1;
legacyBundle.preflightStatus.releaseHistory.entries.forEach(entry => { delete entry.change; });
const migratedCurrent = bundleFor('20260815-120000', '2026-08-15T12:00:00+08:00');
const migratedHistory = schema.buildReleaseHistory(legacyBundle, migratedCurrent, trackedAuthorization);
assert.equal(
  migratedHistory.entries.length,
  Math.min(schema.RELEASE_HISTORY_LIMIT, legacyBundle.preflightStatus.releaseHistory.entries.length + 1),
  'valid schema v1 history migrates while preserving the bounded retention limit',
);
assert.equal(migratedHistory.entries.at(-1).runId, migratedCurrent.preflightStatus.runId, 'migration retains the new current release at the bounded history tip');
assert.deepEqual(
  migratedHistory.entries.slice(0, -1).map(entry => entry.runId),
  legacyBundle.preflightStatus.releaseHistory.entries.slice(-(schema.RELEASE_HISTORY_LIMIT - 1)).map(entry => entry.runId),
  'migration preserves the newest legacy suffix that fits beside the current release',
);
assert.equal(migratedHistory.entries[0].change.classification, 'baseline', 'migrated history recomputes its bounded comparison baseline');

const previous = bundleFor('20260814-120000', '2026-08-14T12:00:00+08:00');
const unchanged = bundleFor('20260814-130000', '2026-08-14T13:00:00+08:00');
const unchangedHistory = schema.buildReleaseHistory(previous, unchanged, trackedAuthorization);
assert.equal(unchangedHistory.entries.at(-1).change.classification, 'unchanged', 'unchanged public thresholds need no authorization');

const expanded = bundleFor('20260814-140000', '2026-08-14T14:00:00+08:00');
expanded.preflightStatus.recordsCount += 1;
expanded.preflightStatus.passedCount += 1;
const expandedHistory = schema.buildReleaseHistory(previous, expanded, trackedAuthorization);
assert.equal(expandedHistory.entries.at(-1).change.classification, 'expanded', 'higher public thresholds are recorded without an exception');
assert.deepEqual(expandedHistory.entries.at(-1).change.increases, [{
  id: 'records',
  from: previous.preflightStatus.recordsCount,
  to: expanded.preflightStatus.recordsCount,
}], 'expanded history names the exact increased counter');

const reduced = bundleFor('20260814-150000', '2026-08-14T15:00:00+08:00');
const from = previous.reportReadinessStatus.steelResultReconciliationRequired;
assert.ok(from > 1, 'fixture has room for a positive reduced threshold');
setMetricRequired(reduced, 'steelResultReconciliationRequired', 'steelResultReconciliationComplete', 'steelResultReconciliationPass', from - 1);
assert.throws(
  () => schema.buildReleaseHistory(previous, reduced, trackedAuthorization),
  /authorization\.requiredForReduction/,
  'a reduced public threshold fails closed without explicit authorization',
);

const reduction = [{ id: 'steelResult', from, to: from - 1 }];
const exactAuthorization = {
  schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
  kind: schema.REDUCTION_AUTHORIZATION_KIND,
  active: true,
  previousRunId: previous.preflightStatus.runId,
  reasonCode: 'scope-change',
  reason: '公開工具範圍調整，移除已停用且不再交付的既有頁面。',
  reductions: reduction,
};
const reducedHistory = schema.buildReleaseHistory(previous, reduced, exactAuthorization);
assert.equal(reducedHistory.entries.at(-1).change.classification, 'reduced', 'authorized reduction is explicitly classified');
assert.deepEqual(reducedHistory.entries.at(-1).change.reductions, reduction, 'authorized reduction preserves the exact counter delta');
assert.equal(reducedHistory.entries.at(-1).change.reason, exactAuthorization.reason, 'public-safe authorization reason is copied into the release history');

const retainedReduced = clone(reduced);
retainedReduced.preflightStatus.releaseHistory = clone(reducedHistory);
const revalidatedHistory = schema.buildReleaseHistory(retainedReduced, reduced, trackedAuthorization);
assert.equal(revalidatedHistory.entries.at(-1).change.reason, exactAuthorization.reason, 'an already-authorized identical release remains revalidatable after the one-time authorization is reset');
const malformedRetainedReduced = clone(retainedReduced);
malformedRetainedReduced.preflightStatus.releaseHistory.entries.at(-1).sourcePath = 'output/private.json';
assert.throws(
  () => schema.buildReleaseHistory(malformedRetainedReduced, reduced, trackedAuthorization),
  /invalid retained public release history/,
  'malformed retained history cannot impersonate a previously authorized release',
);

assert.throws(
  () => schema.buildReleaseHistory(previous, reduced, { ...exactAuthorization, previousRunId: '20260813-120000' }),
  /authorization\.previousRunId/,
  'authorization cannot be reused against another previous release',
);
assert.throws(
  () => schema.buildReleaseHistory(previous, reduced, { ...exactAuthorization, reductions: [{ id: 'records', from: 83, to: 82 }] }),
  /authorization\.reductions/,
  'authorization must match every derived reduction exactly',
);
assert.throws(
  () => schema.buildReleaseHistory(previous, unchanged, exactAuthorization),
  /authorization\.unused/,
  'active authorization fails when no public threshold was reduced',
);
assert.throws(
  () => schema.buildReleaseHistory(previous, reduced, { ...exactAuthorization, reason: 'C:\\Users\\USER\\private evidence' }),
  /authorization\.reason/,
  'public reason cannot expose a workstation path',
);
assert.throws(
  () => schema.buildReleaseHistory(previous, reduced, { ...exactAuthorization, expiresNever: true }),
  /authorization\.activeShape/,
  'authorization rejects undeclared fields and permanent exceptions',
);

console.log(`public release change governance OK (counters=${schema.COUNTER_IDS.length}, reductionReasons=${schema.REDUCTION_REASON_CODES.length}, negativeCases=7)`);
