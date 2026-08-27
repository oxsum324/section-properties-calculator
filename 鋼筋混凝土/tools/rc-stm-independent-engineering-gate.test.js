const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const catalogPath = path.join(repoRoot, '結構工具箱', 'tools', 'independent-engineering-benchmarks.catalog.json');
const runnerPath = path.join(repoRoot, '結構工具箱', 'tools', 'independent-engineering-benchmarks.js');
const adapterPath = path.join(repoRoot, '結構工具箱', 'tools', 'independent-engineering-adapters', 'rc-stm-strength.js');
const { ORACLES, validateCatalog } = require(runnerPath);
const productionAdapter = require(adapterPath);

const EXPECTED_CAPABILITIES = [
  'rc-deep-beam-stm',
  'rc-foundation-2d-stm',
  'rc-pile-cap-3d-stm',
];
const EXPECTED_PRODUCTION_MODULE = 'independent-engineering-adapters/rc-stm-strength.js';
const FORMAL_ROUTE_CAPABILITIES = new Map([
  ['/rc-deep-beam-stm', 'rc-deep-beam-stm'],
  ['/rc-foundation-deep-beam-stm', 'rc-foundation-2d-stm'],
  ['/rc-pile-cap-3d-stm', 'rc-pile-cap-3d-stm'],
]);
const EXPECTED_CASES = 24;
const EXPECTED_PASS_CASES = 15;
const EXPECTED_REJECTION_CASES = 9;
const EXPECTED_ASSERTIONS = 564;

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
}

function getPath(source, dottedPath) {
  return String(dottedPath || '').split('.').reduce((value, key) => value?.[key], source);
}

function closeEnough(actual, expected, tolerance) {
  if (actual === Infinity && expected === Infinity) return true;
  if (actual === -Infinity && expected === -Infinity) return true;
  return Number.isFinite(actual)
    && Number.isFinite(expected)
    && Math.abs(actual - expected) <= tolerance;
}

function evaluateRcStmCandidates(catalog, options = {}) {
  const catalogIssues = validateCatalog(catalog);
  if (catalogIssues.length) {
    return {
      status:'blocked',
      summary:{ required:0, verified:0, passRequired:0, passVerified:0, rejectionRequired:0, rejectionVerified:0, assertions:0, capabilities:0, issueCount:catalogIssues.length },
      records:[],
      issues:catalogIssues.map(issue => `catalog:${issue}`),
    };
  }

  const calculate = options.calculate || ((input) => productionAdapter.calculate(input));
  const validateInput = options.validateInput || ((input) => productionAdapter.validateInput(input));
  const capabilitySet = new Set(EXPECTED_CAPABILITIES);
  const promotedFormalBenchmarks = catalog.benchmarks
    .filter(item => FORMAL_ROUTE_CAPABILITIES.has(item.route))
    .map(item => ({
      ...item,
      capability:FORMAL_ROUTE_CAPABILITIES.get(item.route),
      expectedOutcome:'strength-pass',
    }));
  const supplementalCandidates = catalog.candidateBenchmarks.filter(item => capabilitySet.has(item.capability));
  const candidates = [...promotedFormalBenchmarks, ...supplementalCandidates];
  const issues = [];
  const records = [];

  if (supplementalCandidates.length !== catalog.candidateBenchmarks.length || promotedFormalBenchmarks.length !== FORMAL_ROUTE_CAPABILITIES.size) {
    issues.push('unexpected-candidate-capability');
  }
  if (candidates.length !== EXPECTED_CASES) {
    issues.push(`candidate-count:actual=${candidates.length}:expected=${EXPECTED_CASES}`);
  }

  for (const benchmark of candidates) {
    const recordIssues = [];
    if (benchmark.productionModule !== EXPECTED_PRODUCTION_MODULE) {
      recordIssues.push(`production-module:actual=${benchmark.productionModule}:expected=${EXPECTED_PRODUCTION_MODULE}`);
    }
    const oracle = ORACLES[benchmark.oracle];
    if (typeof oracle !== 'function') recordIssues.push(`missing-oracle:${benchmark.oracle}`);

    let production;
    let expected;
    try {
      const validationErrors = validateInput(benchmark.input, benchmark);
      if (validationErrors.length) throw new Error(`production-input-invalid:${validationErrors.join('|')}`);
      production = calculate(benchmark.input, benchmark);
      expected = oracle?.(benchmark.input);
    } catch (error) {
      recordIssues.push(`benchmark-execution:${error.message}`);
    }

    if (production && expected) {
      const expectedStrengthPass = benchmark.expectedOutcome === 'strength-pass' ? 1 : 0;
      if (production.strengthPass !== expectedStrengthPass) {
        recordIssues.push(`expected-outcome-mismatch:production:actual=${production.strengthPass}:expected=${expectedStrengthPass}`);
      }
      if (expected.strengthPass !== expectedStrengthPass) {
        recordIssues.push(`expected-outcome-mismatch:oracle:actual=${expected.strengthPass}:expected=${expectedStrengthPass}`);
      }
      for (const assertion of benchmark.assertions) {
        const actualValue = getPath(production, assertion.path);
        const expectedValue = getPath(expected, assertion.path);
        if (!closeEnough(actualValue, expectedValue, assertion.absTolerance)) {
          recordIssues.push(`benchmark-value-mismatch:${assertion.path}:actual=${actualValue}:expected=${expectedValue}`);
        }
      }
    }

    issues.push(...recordIssues.map(issue => `${benchmark.id}:${issue}`));
    records.push({
      id:benchmark.id,
      capability:benchmark.capability,
      expectedOutcome:benchmark.expectedOutcome,
      assertionCount:benchmark.assertions.length,
      status:recordIssues.length ? 'blocked' : 'verified',
      issues:recordIssues,
    });
  }

  const passRecords = records.filter(record => record.expectedOutcome === 'strength-pass');
  const rejectionRecords = records.filter(record => record.expectedOutcome === 'strength-reject');
  const summary = {
    required:records.length,
    verified:records.filter(record => record.status === 'verified').length,
    passRequired:passRecords.length,
    passVerified:passRecords.filter(record => record.status === 'verified').length,
    rejectionRequired:rejectionRecords.length,
    rejectionVerified:rejectionRecords.filter(record => record.status === 'verified').length,
    assertions:records.reduce((sum, record) => sum + record.assertionCount, 0),
    capabilities:new Set(records.filter(record => record.status === 'verified').map(record => record.capability)).size,
    issueCount:issues.length,
  };
  return {
    status:issues.length === 0 && summary.verified === summary.required ? 'ready' : 'blocked',
    summary,
    records,
    issues,
  };
}

const catalog = readCatalog();
const actual = evaluateRcStmCandidates(catalog);
assert.equal(actual.status, 'ready', JSON.stringify(actual.issues));
assert.deepEqual(actual.summary, {
  required:EXPECTED_CASES,
  verified:EXPECTED_CASES,
  passRequired:EXPECTED_PASS_CASES,
  passVerified:EXPECTED_PASS_CASES,
  rejectionRequired:EXPECTED_REJECTION_CASES,
  rejectionVerified:EXPECTED_REJECTION_CASES,
  assertions:EXPECTED_ASSERTIONS,
  capabilities:EXPECTED_CAPABILITIES.length,
  issueCount:0,
});

const falseAcceptance = evaluateRcStmCandidates(catalog, {
  calculate(input, benchmark) {
    const result = productionAdapter.calculate(input);
    if (benchmark.expectedOutcome === 'strength-reject') result.strengthPass = 1;
    return result;
  },
});
assert.equal(falseAcceptance.status, 'blocked', 'false acceptance must fail the RC-local gate');
for (const benchmark of catalog.candidateBenchmarks.filter(item => item.expectedOutcome === 'strength-reject')) {
  assert.ok(falseAcceptance.issues.some(issue => issue.includes(`${benchmark.id}:expected-outcome-mismatch:production`)), `${benchmark.id} false acceptance is reported`);
}

const falseRejection = evaluateRcStmCandidates(catalog, {
  calculate(input, benchmark) {
    const result = productionAdapter.calculate(input);
    if (benchmark.expectedOutcome === 'strength-pass') result.strengthPass = 0;
    return result;
  },
});
assert.equal(falseRejection.status, 'blocked', 'false rejection must fail the RC-local gate');
for (const benchmarkId of [
  ...catalog.benchmarks.filter(item => FORMAL_ROUTE_CAPABILITIES.has(item.route)).map(item => item.id),
  ...catalog.candidateBenchmarks.filter(item => item.expectedOutcome === 'strength-pass').map(item => item.id),
]) {
  assert.ok(falseRejection.issues.some(issue => issue.includes(`${benchmarkId}:expected-outcome-mismatch:production`)), `${benchmarkId} false rejection is reported`);
}

console.log(`RC STM independent engineering gate OK (candidates=${actual.summary.verified}/${actual.summary.required}, pass=${actual.summary.passVerified}/${actual.summary.passRequired}, reject=${actual.summary.rejectionVerified}/${actual.summary.rejectionRequired}, assertions=${actual.summary.assertions}, capabilities=${actual.summary.capabilities}, falseAcceptance=blocked, falseRejection=blocked)`);

module.exports = { evaluateRcStmCandidates };
