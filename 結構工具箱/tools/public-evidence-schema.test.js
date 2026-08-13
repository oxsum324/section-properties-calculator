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

assert.equal(schema.SCHEMA_VERSION, 1, 'public evidence schema version is explicit');
assert.deepEqual(schema.DIMENSION_IDS, ['release', 'steel', 'rc', 'delivery'], 'public evidence dimensions are stable');

const valid = schema.validatePublicEvidenceBundle(bundle);
assert.equal(valid.valid, true, `tracked bundle satisfies schema: ${valid.errors.join(', ')}`);
assert.equal(valid.pass, true, 'tracked bundle proves all public evidence dimensions');
assert.deepEqual(valid.dimensions.map(item => item.pass), [true, true, true, true], 'all four dimensions pass');

const wrongVersion = clone(bundle);
wrongVersion.preflightStatus.publicEvidenceSchemaVersion = 2;
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

console.log(`public evidence schema OK (v${schema.SCHEMA_VERSION}, dimensions=${schema.DIMENSION_IDS.length}, negativeCases=5)`);
