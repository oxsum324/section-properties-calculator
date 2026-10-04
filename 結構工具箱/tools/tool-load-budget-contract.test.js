'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyzeResults, collectFailureRecords, resetBaseline, sourceDriftPaths, validateBaseline } = require('./tool-load-budget-contract');

const routes = Array.from({ length: 52 }, (_, index) => `/route-${index}`);
const baseline = {
  schemaVersion: 1, capturedAt: new Date(0).toISOString(), sourceCommit: 'base-commit', routeCount: 52,
  totalJsBytes: 5200, docxRuntimePath: '/docx.js', docxRuntimeBytes: 100,
  routes: routes.map(route => ({ route, jsBytes: 100, sharedScripts: [{ path: '/core/shared.js', bytes: 100 }] })),
};
const baseUrl = 'http://127.0.0.1:1234/';
function cleanResults() {
  return routes.map(route => ({ route, status: 200, navigationError: null, jsBytes: 100, scripts: [
    { url: `${baseUrl}core/shared.js`, status: 200, bytes: 100, error: null },
  ], workflowScripts: [], workflowPanel: false }));
}
function withTempBaseline(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-load-budget-contract-'));
  const file = path.join(directory, 'baseline.json');
  fs.writeFileSync(file, JSON.stringify(baseline));
  try { callback(file); } finally {
    const resolvedDirectory = path.resolve(directory);
    const resolvedTemp = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolvedDirectory).toLowerCase(), resolvedTemp.toLowerCase(), 'temp directory parent must be OS temp');
    assert(path.basename(resolvedDirectory).startsWith('tool-load-budget-contract-'), 'temp directory must use this contract prefix');
    fs.rmSync(resolvedDirectory, { recursive: true, force: true });
  }
}
function guardedAttempt({ functionalFailures, sourceDrift = [], capacityDifferences = [], nextBaseline = baseline, routes: expectedRoutes = routes }, file) {
  let writes = 0;
  const decision = resetBaseline({ docxCheck: () => {}, functionalFailures, sourceDrift, capacityDifferences, nextBaseline, expectedRoutes, write: value => {
    writes += 1;
    fs.writeFileSync(file, JSON.stringify(value));
  } });
  return { decision, writes };
}

assert.deepEqual(validateBaseline(baseline, routes), []);
assert.deepEqual(sourceDriftPaths({ 'route/page.js': 'hash-a' }, { 'route/page.js': 'hash-b' }), ['route/page.js'], 'same-sized source content changes must count as drift');
assert.deepEqual(sourceDriftPaths({ 'route/page.js': 'hash-a' }, {}), ['route/page.js'], 'source removal must count as drift');
const mergedFailures = collectFailureRecords(['HTTP 404'], new Error('DOCX guard failed'), ['route/page.js']);
assert.equal(mergedFailures[0], 'HTTP 404');
assert.equal(mergedFailures[1].startsWith('Error: DOCX guard failed'), true);
assert.equal(mergedFailures[2], 'source changed during audit: route/page.js');
const hashContent = content => crypto.createHash('sha256').update(content).digest('hex');
const sourceDrift = sourceDriftPaths({ 'route/page.js': hashContent('AAAA') }, { 'route/page.js': hashContent('BBBB') });
assert.deepEqual(sourceDrift, ['route/page.js']);
withTempBaseline(file => {
  const before = fs.readFileSync(file);
  const { decision, writes } = guardedAttempt({ functionalFailures: [], sourceDrift }, file);
  assert.equal(decision.written, false, 'content drift must block baseline write');
  assert.equal(writes, 0);
  assert.deepEqual(fs.readFileSync(file), before, 'content drift must leave persisted baseline unchanged');
});

for (const [name, alter] of [
  ['HTTP 404', result => { result.status = 404; }],
  ['navigation failure', result => { result.navigationError = 'navigation timeout'; }],
  ['script failure', result => { result.scripts[0] = { url: `${baseUrl}core/shared.js`, status: null, bytes: null, error: 'net::ERR_FAILED' }; }],
  ['missing workflow panel', result => { result.workflowScripts = ['/core/tool-workflow.js']; result.workflowPanel = false; }],
  ['missing scripts array', result => { delete result.scripts; }],
  ['invalid result byte count', result => { result.jsBytes = Infinity; }],
  ['result byte sum mismatch', result => { result.jsBytes = 99; }],
]) {
  const results = cleanResults();
  alter(results[0]);
  const analysis = analyzeResults(results, baseline, baseUrl);
  assert.equal(analysis.functionalFailures.length > 0, true, `${name} must be functional failure`);
  withTempBaseline(file => {
    const before = fs.readFileSync(file);
    const { decision, writes } = guardedAttempt({ functionalFailures: analysis.functionalFailures }, file);
    assert.equal(decision.written, false, `${name} must reject baseline write`);
    assert.equal(writes, 0, `${name} must not write`);
    assert.deepEqual(fs.readFileSync(file), before, `${name} must leave persisted baseline unchanged`);
  });
}

const docxGuard = new Error('DOCX runtime eagerly loaded');
withTempBaseline(file => {
  const before = fs.readFileSync(file);
  let writes = 0;
  assert.throws(() => resetBaseline({ docxCheck: () => { throw docxGuard; }, functionalFailures: [], capacityDifferences: [], nextBaseline: baseline, expectedRoutes: routes, write: () => { writes += 1; } }), /DOCX runtime eagerly loaded/);
  assert.equal(writes, 0);
  assert.deepEqual(fs.readFileSync(file), before, 'DOCX guard must leave baseline unchanged');
});

for (const [name, mutate] of [
  ['missing route', candidate => { candidate.routes.pop(); candidate.routeCount = 51; candidate.totalJsBytes -= 100; }],
  ['duplicate route', candidate => { candidate.routes[1].route = candidate.routes[0].route; }],
  ['invalid page bytes', candidate => { candidate.routes[0].jsBytes = Infinity; }],
  ['zero shared-script bytes', candidate => { candidate.routes[0].sharedScripts[0].bytes = 0; }],
  ['invalid DOCX bytes', candidate => { candidate.docxRuntimeBytes = NaN; }],
]) {
  const candidate = structuredClone(baseline);
  mutate(candidate);
  withTempBaseline(file => {
    const before = fs.readFileSync(file);
    const { decision, writes } = guardedAttempt({ functionalFailures: [], nextBaseline: candidate }, file);
    assert.equal(decision.written, false, `${name} must reject write`);
    assert.equal(decision.errors.length > 0, true, `${name} must explain rejection`);
    assert.equal(writes, 0, `${name} must fail before persistence`);
    assert.deepEqual(fs.readFileSync(file), before, `${name} must leave persisted baseline unchanged`);
  });
}

for (const malformedRoutes of [routes.slice(1), [...routes.slice(0, 51), routes[0]]]) {
  const errors = validateBaseline(baseline, malformedRoutes);
  assert(errors.length > 0, 'expected route list with missing/duplicate route must fail');
}
for (const malformedResults of [cleanResults().slice(1), [...cleanResults().slice(0, 51), cleanResults()[0]]]) {
  assert(analyzeResults(malformedResults, baseline, baseUrl).functionalFailures.length > 0, 'missing/duplicate measured routes must be functional failures');
}

const grownResults = cleanResults();
grownResults[0].scripts[0].bytes = 101;
grownResults[0].jsBytes = 101;
const growth = analyzeResults(grownResults, baseline, baseUrl);
assert.deepEqual(growth.functionalFailures, []);
assert.equal(growth.capacityDifferences.length, 1);
withTempBaseline(file => {
  const before = fs.readFileSync(file);
  const ordinaryModeFailures = [...growth.functionalFailures, ...growth.capacityDifferences];
  const ordinary = guardedAttempt({ functionalFailures: ordinaryModeFailures }, file);
  assert.equal(ordinary.decision.written, false, 'ordinary mode must reject capacity growth');
  assert.deepEqual(fs.readFileSync(file), before);
  const acceptedBaseline = structuredClone(baseline);
  acceptedBaseline.routes[0].jsBytes = 101;
  acceptedBaseline.totalJsBytes += 1;
  acceptedBaseline.routes[0].sharedScripts[0].bytes = 101;
  const accepted = guardedAttempt({ functionalFailures: growth.functionalFailures, capacityDifferences: growth.capacityDifferences, nextBaseline: acceptedBaseline }, file);
  assert.equal(accepted.decision.written, true, 'explicit reset accepts clean capacity growth');
  assert.equal(accepted.writes, 1);
  assert.equal(accepted.decision.acceptedCapacityDifferences.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).totalJsBytes, baseline.totalJsBytes + 1, 'accepted reset must persist changed baseline content');
});

console.log('tool-load-budget-contract: PASS (functional failures, DOCX guard, route integrity, byte validation, reset growth)');
