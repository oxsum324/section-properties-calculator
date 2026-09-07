'use strict';

// All identities, decisions and reference artifacts below are disposable synthetic
// fixtures. They test the workflow, never establish actual-case qualification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const Runner = require('./beam-column-moment-real-case-g1-runner.js');
const Contract = require('./beam-column-moment-real-case-g1-contract.js');
const Intake = require('./beam-column-moment-real-case-intake.js');
const Pilot = require('./beam-column-moment-g1-pilot.js');
const { ORACLES } = require('./independent-engineering-benchmarks.js');
const root = path.resolve(__dirname, '..', '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'moment-real-g1-test-'));
const repo = path.join(temp, 'source');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => Contract.sha256(Buffer.isBuffer(value) ? value : Contract.canonicalJson(value));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const catalog = read(path.join(__dirname, 'independent-engineering-benchmarks.catalog.json'));
const benchmark = catalog.benchmarks.find(item => item.id === 'steel-formal-strength');
const inputCase = benchmark.input.momentCases.find(item => item.id === 'momentPriorTestSmrfPass');
const expected = ORACLES['steel-formal-strength'](benchmark.input)[inputCase.id];

function git(args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true });
}

function copySource() {
  fs.mkdirSync(repo);
  const pending = Object.values(Runner.GOVERNED_SOURCE_PATHS).map(item => item.absolute);
  pending.push(path.join(root, '鋼構工具/index.html'), path.join(root, '鋼構工具/app.js'));
  const copied = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (copied.has(file)) continue;
    const relative = path.relative(root, file);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n');
    const destination = path.join(repo, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
    copied.add(file);
    for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/gu)) {
      pending.push(require.resolve(path.resolve(path.dirname(file), match[1])));
    }
  }
  git(['init', '--quiet']);
  git(['config', 'user.name', 'Synthetic workflow test']);
  git(['config', 'user.email', 'synthetic-test@example.invalid']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Isolated synthetic workflow fixture']);
}

function fixture(name, mutateReference) {
  const workspace = path.join(temp, `intake-${name}`);
  fs.mkdirSync(path.join(workspace, 'inputs'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'references'));
  const source = Buffer.from('Synthetic case-source fixture; no real project data.\n');
  const human = Buffer.from('Synthetic external-reference artifact for workflow regression only.\n');
  fs.writeFileSync(path.join(workspace, 'inputs/source.md'), source);
  fs.writeFileSync(path.join(workspace, 'references/reference.md'), human);
  const toolInput = clone(inputCase);
  delete toolInput.id;
  const candidate = Pilot.realCaseIntakeTemplate(Object.keys(toolInput));
  Object.assign(candidate.caseIdentity, {
    externalCaseId: 'REGRESSION-BCM-001', projectName: 'Regression structural comparison',
    projectNo: 'REG-001', designer: 'Regression designer', intendedUse: 'Workflow comparison regression',
    permissibleUse: 'Disposable regression workspace only', limitations: ['SMRF x axis reinforced connection'],
    exclusions: ['Complete joint design and legal signoff excluded'],
    governingStandards: [{ standardId: 'TW-STEEL', title: '鋼構造建築物鋼結構設計技術規範', edition: '案例採用版', clauses: ['13'], sourceAuthority: '規範判定：案例採用規範' }],
    caseSourceArtifactFile: 'inputs/source.md',
  });
  candidate.criteria = {
    definedAt: '2026-01-02T03:04:05.000Z', numericToleranceBasis: '專案指定：測試前固定絕對及相對容許差',
    controlBranchExpected: 'smrf|x|reinforced|prior_test_similarity|six-strength-checks',
    decisionExpected: 'pass', outOfScopeExpected: 'warning', applicabilityExpected: 'applicable',
  };
  candidate.toolInput = { ...toolInput, projectName: candidate.caseIdentity.projectName, designer: candidate.caseIdentity.designer };
  candidate.independentReference = {
    method: 'independent-spreadsheet', independentFromProductionCore: true, author: 'Regression reference author', reviewer: '',
    createdAt: '2026-01-03T04:05:06.000Z', basis: 'Synthetic workflow reference from repository oracle; no actual-case claim',
    artifactFile: 'references/reference.md', machineDataFile: 'references/reference.json',
  };
  const reference = {
    schemaVersion: 1, kind: Contract.REFERENCE_KIND,
    externalCaseId: candidate.caseIdentity.externalCaseId,
    caseIdentitySha256: hash(candidate.caseIdentity), criteriaSha256: hash(candidate.criteria),
    toolInputSha256: hash(candidate.toolInput), caseSourceArtifactSha256: hash(source), humanArtifactSha256: hash(human),
    resultSchemaSha256: Contract.RESULT_SCHEMA_SHA256, independentFromProductionCore: true,
    ...Object.fromEntries(['method', 'author', 'reviewer', 'createdAt', 'basis'].map(key => [key, candidate.independentReference[key]])),
    results: clone(expected),
    tolerances: Object.fromEntries(Contract.RESULT_KEYS.map(key => [key, Contract.EXACT_TOLERANCE_KEYS.includes(key)
      ? { mode: 'exact', absoluteTolerance: 0, relativeTolerance: 0 }
      : { mode: 'absolute-or-relative', absoluteTolerance: 1e-8, relativeTolerance: 1e-8 }])),
    comparison: { controlBranch: candidate.criteria.controlBranchExpected, decision: 'pass', outOfScope: 'warning' },
  };
  if (mutateReference) mutateReference(reference);
  write(path.join(workspace, 'references/reference.json'), reference);
  write(path.join(workspace, Runner.FIXED_INTAKE_INPUT), candidate);
  Intake.sealReadiness(workspace, Runner.FIXED_INTAKE_INPUT);
  return workspace;
}

const runnerPath = path.join(repo, '結構工具箱/tools/beam-column-moment-real-case-g1-runner.js');
function cli(args, status = 0, env = process.env) {
  const result = spawnSync(process.execPath, [runnerPath, ...args, '--json'], { encoding: 'utf8', windowsHide: true, env });
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result;
}
const executeArgs = (intake, output) => ['--intake-workspace', intake, '--input', Runner.FIXED_INTAKE_INPUT, '--output-workspace', output, '--execute-production', 'yes'];
const sealArgs = output => ['--output-workspace', output, '--decision', Runner.DECISION_CANDIDATE_PATH, '--seal-g1', 'yes'];
function manualDecision(output) {
  const decision = read(path.join(output, Runner.DECISION_TEMPLATE_PATH));
  decision.status = 'accepted-manual-g1';
  decision.reviewer = 'Synthetic regression reviewer';
  decision.basis = 'Synthetic decision exercises the separate manual gate; no engineering approval';
  decision.decidedAt = new Date().toISOString();
  Object.keys(decision.confirmations).forEach(key => { decision.confirmations[key] = true; });
  write(path.join(output, Runner.DECISION_CANDIDATE_PATH), decision);
  return decision;
}

try {
  copySource();
  const intake = fixture('valid');
  const initial = Runner.assessExecutionReadiness(intake);
  assert.equal(initial.g1, false);
  assert.equal(initial.calculatorExecuted, false);
  const output = path.join(temp, 'execution');
  const result = JSON.parse(cli(executeArgs(intake, output)).stdout);
  assert.equal(result.status, 'comparison-pass-manual-g1-decision-required');
  assert.equal(result.comparisonPassed, true);
  assert.equal(result.g1, false, 'automatic comparison cannot approve G1');
  const review = read(path.join(output, Runner.REVIEW_BUNDLE_PATH));
  assert.equal(review.independentComparisons[0].assertions.length, 82);
  assert.equal(review.qualificationDecisions.length, 0);
  const reviewHtml = fs.readFileSync(path.join(output, Runner.HUMAN_OUTPUT_PATH), 'utf8');
  assert.ok(reviewHtml.includes(result.calculationFingerprint));
  assert.equal(/QRF-[0-9A-F]+/u.test(reviewHtml), false, 'HTML must not display a provisional self-referential run fingerprint');
  assert.equal(fs.existsSync(path.join(output, Runner.DECISION_RECEIPT_PATH)), false);
  assert.equal(cli(sealArgs(output), 2).stdout, '', 'no manual decision cannot produce a sealed result');
  const decision = manualDecision(output);
  decision.confirmations.tolerancesWerePredefined = false;
  write(path.join(output, Runner.DECISION_CANDIDATE_PATH), decision);
  assert.match(cli(sealArgs(output), 2).stderr, /confirmation-required/u);
  assert.equal(fs.existsSync(path.join(output, Runner.DECISION_RECEIPT_PATH)), false);
  manualDecision(output);
  const sealed = JSON.parse(cli(sealArgs(output)).stdout);
  assert.equal(sealed.g1, true);
  for (const key of ['g2', 'g3', 'completeJointDesign', 'legalSignoff', 'formalAttachmentApproval', 'pagesPublication']) assert.equal(sealed[key], false);
  assert.match(cli(sealArgs(output), 2).stderr, /already-exists/u);

  const resigned = path.join(temp, 'rebound-comparison');
  fs.cpSync(output, resigned, { recursive: true });
  const rebound = read(path.join(resigned, Runner.REVIEW_BUNDLE_PATH));
  const comparisonArtifact = rebound.independentComparisons[0].comparisonDataArtifact;
  const comparisonFile = path.join(resigned, comparisonArtifact.file);
  const comparisonData = read(comparisonFile);
  comparisonData.intakeReceiptSha256 = '0'.repeat(64);
  write(comparisonFile, comparisonData);
  const bytes = fs.readFileSync(comparisonFile);
  comparisonArtifact.bytes = bytes.length;
  comparisonArtifact.sha256 = hash(bytes);
  const fixtureBundle = require(path.join(repo, '結構工具箱/tools/engineering-qualification-case-bundle.js'));
  rebound.bundleFingerprint = fixtureBundle.bundleFingerprint(rebound);
  assert.throws(() => fixtureBundle.validateBundle(rebound, { baseDirectory: resigned }), /comparison-data-binding/u,
    'recomputing outer hashes cannot change the intake binding');

  const malformed = clone(expected);
  malformed.Mp = String(malformed.Mp);
  assert.throws(() => Contract.validateResultVector(malformed), /non-finite/u);
  const relaxed = read(path.join(intake, 'references/reference.json'));
  relaxed.tolerances.passes = { mode: 'absolute', absoluteTolerance: 1, relativeTolerance: 0 };
  assert.throws(() => Contract.buildAssertions(relaxed, expected, relaxed.comparison), /exact-required/u);
  assert.match(cli(executeArgs(intake, path.join(intake, 'nested-output')), 2).stderr, /disjoint/u);

  const mismatch = fixture('mismatch', reference => { reference.results.Mp *= 1.2; });
  const failedOutput = path.join(temp, 'mismatch-output');
  const failed = JSON.parse(cli(executeArgs(mismatch, failedOutput), 1).stdout);
  assert.equal(failed.comparisonPassed, false);
  assert.equal(failed.g1, false);
  manualDecision(failedOutput);
  assert.match(cli(sealArgs(failedOutput), 2).stderr, /comparison|比較/u);
  assert.equal(fs.existsSync(path.join(failedOutput, Runner.DECISION_RECEIPT_PATH)), false);

  const changed = fixture('tamper');
  fs.appendFileSync(path.join(changed, 'references/reference.md'), 'changed');
  const changedOutput = path.join(temp, 'tamper-output');
  cli(executeArgs(changed, changedOutput), 2);
  assert.equal(fs.existsSync(changedOutput), false);
  const tamperOutput = path.join(temp, 'tamper-before-seal');
  cli(executeArgs(intake, tamperOutput));
  manualDecision(tamperOutput);
  fs.appendFileSync(path.join(tamperOutput, Runner.PRODUCTION_DATA_PATH), ' ');
  cli(sealArgs(tamperOutput), 2);
  assert.equal(fs.existsSync(path.join(tamperOutput, Runner.DECISION_RECEIPT_PATH)), false);

  assert.match(cli(executeArgs(intake, path.join(temp, 'injected')), 2, { ...process.env, NODE_OPTIONS: '--no-warnings' }).stderr, /untrusted-runtime-injection/u);
  fs.writeFileSync(path.join(repo, 'dirty.txt'), 'dirty');
  assert.match(cli(executeArgs(intake, path.join(temp, 'dirty-output')), 2).stderr, /clean-immutable-source/u);
  assert.equal(fs.existsSync(path.join(temp, 'dirty-output')), false);
  assert.throws(() => Runner.parseArgs(['--seal-g1', 'yes', '--execute-production', 'yes']), /兩次/u);
  assert.throws(() => Runner.parseArgs(['--execute-production', 'true']), /yes/u);
  console.log('beam-column-moment-real-case-g1-runner tests: PASS (isolated synthetic execution, manual seal, mismatch, tamper, immutable source)');
} finally {
  assert.ok(path.resolve(temp).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  assert.ok(path.basename(temp).startsWith('moment-real-g1-test-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
