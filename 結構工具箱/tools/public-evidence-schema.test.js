const assert = require('assert');
const fs = require('fs');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');

const toolboxRoot = path.resolve(__dirname, '..');
const statusRoot = path.join(toolboxRoot, 'assets', 'status');
const readStatus = name => JSON.parse(fs.readFileSync(path.join(statusRoot, name), 'utf8').replace(/^\uFEFF/, ''));
const bundle = {
  platformStatus: readStatus('platform-status.json'),
  preflightStatus: readStatus('preflight-summary.json'),
  reportReadinessStatus: readStatus('report-readiness-status.json'),
};
const clone = value => JSON.parse(JSON.stringify(value));

assert.equal(schema.SCHEMA_VERSION, 3, 'public evidence schema version is explicit');
assert.equal(schema.RELEASE_HISTORY_SCHEMA_VERSION, 2, 'release history schema version is explicit');
assert.equal(schema.RELEASE_HISTORY_LIMIT, 8, 'release history retention is bounded');
assert.equal(schema.CHANGE_POLICY_VERSION, 1, 'release threshold change policy version is explicit');
assert.deepEqual(schema.DIMENSION_IDS, ['release', 'steel', 'rc', 'delivery'], 'public evidence dimensions are stable');
assert.equal(schema.METRIC_IDS.length, 10, 'release history retains every public completion metric');

const valid = schema.validatePublicEvidenceBundle(bundle);
assert.equal(valid.valid, true, `tracked bundle satisfies schema: ${valid.errors.join(', ')}`);
assert.equal(valid.pass, true, 'tracked bundle proves all public evidence dimensions');
assert.deepEqual(valid.dimensions.map(item => item.pass), [true, true, true, true], 'all four dimensions pass');
assert.equal(valid.releaseHistory.entries.length >= 1, true, 'tracked bundle exposes at least the current formal release');
assert.equal(valid.releaseHistory.entries.at(-1).runId, bundle.preflightStatus.runId, 'release history ends at the current public release');

const withRcStm = clone(bundle);
Object.assign(withRcStm.reportReadinessStatus, {
  rcStmFormalAttachmentRequired: 3,
  rcStmFormalAttachmentComplete: 3,
  rcStmFormalAttachmentIssueCount: 0,
  rcStmFormalAttachmentPass: true,
});
const withRcStmResult = schema.validatePublicEvidenceBundle(withRcStm);
assert.equal(withRcStmResult.pass, true, `schema v3 accepts the optional v27 RC STM public counters: ${withRcStmResult.errors.join(', ')}`);
assert.equal(withRcStmResult.metrics.rcStmAttachment.declared, true, 'RC STM supplemental attachment coverage is explicitly declared');
assert.equal(withRcStmResult.metrics.rcStmAttachment.pass, true, 'RC STM supplemental attachment coverage participates in the RC dimension');
assert.equal(withRcStmResult.releaseHistory.entries.at(-1).metrics.some(metric => metric.id === 'rcStmAttachment'), false, 'RC STM workflow attachments do not inflate the formal homepage portfolio history');

const incompleteRcStm = clone(withRcStm);
incompleteRcStm.reportReadinessStatus.rcStmFormalAttachmentComplete = 2;
incompleteRcStm.reportReadinessStatus.rcStmFormalAttachmentIssueCount = 1;
incompleteRcStm.reportReadinessStatus.rcStmFormalAttachmentPass = false;
const incompleteRcStmResult = schema.validatePublicEvidenceBundle(incompleteRcStm);
assert.equal(incompleteRcStmResult.pass, false, 'incomplete RC STM supplemental attachments fail the public evidence bundle even if the top-level flag is forged green');
assert.deepEqual(incompleteRcStmResult.dimensions.map(item => item.pass), [true, true, false, true], 'incomplete RC STM evidence only fails the RC dimension');

const partialRcStm = clone(bundle);
partialRcStm.reportReadinessStatus.rcStmFormalAttachmentRequired = 3;
const partialRcStmResult = schema.validatePublicEvidenceBundle(partialRcStm);
assert.equal(partialRcStmResult.valid, false, 'a partially declared RC STM public metric fails schema validation');
assert.ok(partialRcStmResult.errors.includes('readiness.rcStmFormalAttachmentRequired.optionalShape'), 'partial RC STM declaration reports its shape error');

const reducedRcStm = clone(withRcStm);
reducedRcStm.reportReadinessStatus.rcStmFormalAttachmentRequired = 2;
reducedRcStm.reportReadinessStatus.rcStmFormalAttachmentComplete = 2;
const reducedRcStmResult = schema.validatePublicEvidenceBundle(reducedRcStm);
assert.equal(reducedRcStmResult.pass, false, 'RC STM public coverage cannot silently shrink from the governed three attachments');
assert.ok(reducedRcStmResult.errors.includes('readiness.rcStmFormalAttachmentRequired.expected'), 'RC STM governed count drift is identified');

const rebuiltHistory = schema.buildReleaseHistory([], bundle);
assert.equal(rebuiltHistory.entries.length, 1, 'history builder can seed a bounded chain from the current release');
assert.equal(rebuiltHistory.entries[0].runId, bundle.preflightStatus.runId, 'seeded history identifies the current release');
assert.equal(rebuiltHistory.entries[0].change.classification, 'baseline', 'seeded history establishes an explicit comparison baseline');

const wrongVersion = clone(bundle);
wrongVersion.preflightStatus.publicEvidenceSchemaVersion = 4;
assert.equal(schema.validatePublicEvidenceBundle(wrongVersion).pass, false, 'unknown producer schema version fails closed');

const stringCount = clone(bundle);
stringCount.reportReadinessStatus.steelHtmlApprovalSealComplete = String(stringCount.reportReadinessStatus.steelHtmlApprovalSealComplete);
const stringCountResult = schema.validatePublicEvidenceBundle(stringCount);
assert.equal(stringCountResult.pass, false, 'string completion count cannot impersonate an integer');
assert.ok(stringCountResult.errors.includes('readiness.steelHtmlApprovalSealRequired/steelHtmlApprovalSealComplete'), 'typed field error is identified');

const mismatchedRun = clone(bundle);
mismatchedRun.reportReadinessStatus.runId = '20000101-000000';
assert.equal(schema.validatePublicEvidenceBundle(mismatchedRun).pass, false, 'report readiness from another release cannot be combined');

const partialSteel = clone(bundle);
partialSteel.reportReadinessStatus.steelHtmlApprovalSealComplete -= 1;
partialSteel.reportReadinessStatus.steelHtmlApprovalSealPass = false;
const partialResult = schema.validatePublicEvidenceBundle(partialSteel);
assert.deepEqual(partialResult.dimensions.map(item => item.pass), [true, false, true, true], 'one incomplete family only fails its evidence dimension');

const leakedPath = clone(bundle);
leakedPath.platformStatus.sourcePath = 'C:\\private\\platform-status.json';
assert.equal(schema.validatePublicEvidenceBundle(leakedPath).pass, false, 'absolute Windows source path is rejected');

const missingHistory = clone(bundle);
delete missingHistory.preflightStatus.releaseHistory;
assert.equal(schema.validatePublicEvidenceBundle(missingHistory).pass, false, 'schema v3 without release history fails closed');

const staleLatest = clone(bundle);
staleLatest.preflightStatus.releaseHistory.entries.pop();
assert.equal(schema.validatePublicEvidenceBundle(staleLatest).pass, false, 'history that omits the current release fails closed');

const reversedHistory = clone(bundle);
reversedHistory.preflightStatus.releaseHistory.entries.reverse();
if (reversedHistory.preflightStatus.releaseHistory.entries.length > 1) {
  assert.equal(schema.validatePublicEvidenceBundle(reversedHistory).pass, false, 'release history must remain chronological');
}

const leakedHistoryField = clone(bundle);
leakedHistoryField.preflightStatus.releaseHistory.entries[0].sourcePath = 'output/private.json';
assert.equal(schema.validatePublicEvidenceBundle(leakedHistoryField).pass, false, 'release history rejects undeclared or private fields');

const forgedClassification = clone(bundle);
forgedClassification.preflightStatus.releaseHistory.entries.at(-1).change.classification = valid.releaseHistory.entries.at(-1).change.classification === 'expanded' ? 'unchanged' : 'expanded';
assert.equal(schema.validatePublicEvidenceBundle(forgedClassification).pass, false, 'release history change classification must be derived from exact counters');

const forgedReduction = clone(bundle);
forgedReduction.preflightStatus.releaseHistory.entries.at(-1).change.reductions = [{ id: 'records', from: 84, to: 83 }];
assert.equal(schema.validatePublicEvidenceBundle(forgedReduction).pass, false, 'release history cannot invent an undeclared reduction');

const unusedReason = clone(bundle);
unusedReason.preflightStatus.releaseHistory.entries.at(-1).change.reasonCode = 'scope-change';
unusedReason.preflightStatus.releaseHistory.entries.at(-1).change.reason = '沒有縮減時不得附帶可重用的例外理由。';
assert.equal(schema.validatePublicEvidenceBundle(unusedReason).pass, false, 'non-reduced release cannot carry a reusable reduction reason');

console.log(`public evidence schema OK (v${schema.SCHEMA_VERSION}, history=${valid.releaseHistory.entries.length}/${schema.RELEASE_HISTORY_LIMIT}, dimensions=${schema.DIMENSION_IDS.length}, negativeCases=15)`);
