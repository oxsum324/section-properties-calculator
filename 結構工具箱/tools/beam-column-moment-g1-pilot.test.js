'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PILOT_PATH = path.join(__dirname, 'beam-column-moment-g1-pilot.js');
const BUNDLE_PATH = path.join(__dirname, 'engineering-qualification-case-bundle.js');
const CATALOG_PATH = path.join(__dirname, 'independent-engineering-benchmarks.catalog.json');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const Pilot = require(PILOT_PATH);
const Bundle = require(BUNDLE_PATH);
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8').replace(/^\uFEFF/, ''));
const benchmark = catalog.benchmarks.find(item => item.id === 'steel-formal-strength');
const benchmarkCase = benchmark.input.momentCases.find(item => item.id === 'momentPriorTestSmrfPass');

assert.equal(Pilot.PROFILE.schemaVersion, 2, 'pilot uses the hardened profile contract');
assert.equal(Pilot.PROFILE.benchmarkId, 'steel-formal-strength');
assert.equal(Pilot.PROFILE.benchmarkCaseId, 'momentPriorTestSmrfPass');
assert.equal(Pilot.PROFILE.productionAdapter, 'independent-engineering-adapters/steel-formal.js');
assert.equal(Pilot.PROFILE.oracle, 'steel-formal-strength');
assert.equal(Pilot.PROFILE.sourceKind, 'synthetic');
assert.equal(Pilot.PROFILE.claimedLevel, 'G1');
assert.equal(Pilot.PROFILE.benchmarkAssertionCount, 71);
assert.equal(Pilot.PROFILE.qualifiedResultAssertionCount, 79);
assert.equal(Pilot.PROFILE.supplementalClosureKeys.length, 8);
assert.equal(Pilot.PROFILE.scope.trustedProcessLaunchRequired, true);
assert.equal(Pilot.PROFILE.scope.gitAttributeFiltersAllowed, false);
assert.equal(Pilot.PROFILE.exclusions.some(item => item.includes('parent process')), true, 'arbitrary pre-execution code is an explicit external trust boundary');
assert.equal(typeof Pilot.createSyntheticG1Workspace, 'function');
assert.equal(Object.prototype.hasOwnProperty.call(Pilot, 'runInternalExecution'), false, 'internal calculator carrier is not exported');
assert.equal(Object.prototype.hasOwnProperty.call(Pilot, 'sourceSnapshot'), false, 'source provenance cannot be overridden through exports');

const sourceText = fs.readFileSync(PILOT_PATH, 'utf8');
assert.doesNotMatch(sourceText, /options\.dependencies|options\.sourceInfo|options\.testSeam/u, 'public producer has no calculator, source, or mutation injection seam');
assert.match(sourceText, /normalizedGovernedSource[\s\S]*governedGit\(\['show',[\s\S]*governed-source-not-at-head/u, 'governed UTF-8 source bytes must match raw committed content');
assert.doesNotMatch(sourceText, /cat-file['"],\s*['"]--filters|hash-object['"][\s\S]*--path/u, 'source proof does not execute checkout filter drivers');
assert.match(sourceText, /git-info-attributes-forbidden[\s\S]*repository-gitattributes-forbidden/u, 'repository and private Git attribute policies are rejected before status');
assert.match(sourceText, /env:\s*sanitizedChildEnvironment\(\)/u, 'governed child execution receives a sanitized environment');
assert.throws(
  () => Pilot.createSyntheticG1Workspace(path.join(os.tmpdir(), 'must-not-create-injected-pilot'), { caseId: 'INJECT', dependencies: {} }),
  /不接受可注入選項/,
  'unknown dependency injection is rejected before workspace creation',
);

const parsed = Pilot.parseArgs(['--workspace', path.join(os.tmpdir(), 'parse-only'), '--case-id', 'CASE-PARSE', '--json']);
assert.equal(parsed.caseId, 'CASE-PARSE');
assert.equal(parsed.json, true);
assert.throws(() => Pilot.parseArgs([]), /workspace.*case-id|需要/u);
assert.throws(() => Pilot.parseArgs(['--unknown']), /不支援/u);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeEvidenceJson(workspace, evidence, payload) {
  const target = path.join(workspace, ...evidence.file.split('/'));
  const buffer = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(target, buffer);
  evidence.bytes = buffer.length;
  evidence.sha256 = sha256(buffer);
}

function evidenceJson(workspace, evidence) {
  return readJson(path.join(workspace, ...evidence.file.split('/')));
}

function resolveSealedPath(workspace, result) {
  return path.join(workspace, result.outputFileName);
}

function assertNoAbsoluteCliPath(result, serialized) {
  assert.equal(result.kind, 'beam-column-moment-g1-pilot-result.v2', 'saved CLI output remains identifiable as private content');
  ['workspace', 'draftPath', 'sealedPath', 'outputPath'].forEach(key => assert.equal(Object.prototype.hasOwnProperty.call(result, key), false, `${key} is not disclosed`));
  assert.equal(serialized.includes(path.resolve(result.workspaceName || '__never__')), false, 'CLI JSON does not disclose a resolved workspace');
  assert.doesNotMatch(serialized, /"[A-Za-z]:\\\\/u, 'CLI JSON contains no Windows absolute path');
  assert.doesNotMatch(serialized, /"\\\\\\\\[^"\\]+\\/u, 'CLI JSON contains no UNC path');
}

function assertReadySyntheticG1(workspace, creationResult) {
  const sealedPath = resolveSealedPath(workspace, creationResult);
  const inspection = Bundle.inspectBundleFile(sealedPath);
  assert.equal(inspection.status, 'ready');
  assert.equal(inspection.qualificationStatus, 'G1');
  assert.equal(inspection.minimumCurrentLevel, 'G1');
  assert.equal(inspection.highestLevel, 'G1');
  assert.equal(inspection.evidenceVerified, true);
  const record = Bundle.readStrictJsonFile(sealedPath).record;
  assert.equal(record.case.sourceKind, 'synthetic');
  assert.equal(record.calculationRuns.length, 1);
  assert.equal(record.independentComparisons.length, 1);
  assert.equal(record.qualificationDecisions.length, 1);
  assert.deepEqual(record.artifactReviews, []);
  assert.deepEqual(record.formalAdoptions, []);
  assert.equal(record.reportPackage.state, 'unplanned');

  const run = record.calculationRuns[0];
  const comparison = record.independentComparisons[0];
  const decision = record.qualificationDecisions[0];
  const input = evidenceJson(workspace, run.inputArtifact);
  const production = evidenceJson(workspace, run.resultDataArtifact);
  const reference = evidenceJson(workspace, comparison.referenceDataArtifact);
  const comparisonData = evidenceJson(workspace, comparison.comparisonDataArtifact);
  const receipt = evidenceJson(workspace, decision.decisionReceipt);
  assert.deepEqual(input.input, benchmarkCase, 'input is the exact registered case');
  assert.equal(input.source.dirty, false, 'source is immutable and clean');
  assert.equal(input.criteria.registeredAssertionCount, 71);
  assert.equal(input.criteria.registeredTolerancePolicySha256, Pilot.PROFILE.registeredTolerancePolicySha256);
  assert.equal(input.criteria.qualifiedResultAssertionCount, 79);
  assert.equal(input.boundary.trustedProcessLaunchRequired, true);
  assert.equal(input.boundary.gitAttributeFiltersAllowed, false);
  assert.deepEqual([...input.criteria.supplementalClosureKeys].sort(), [...Pilot.SUPPLEMENTAL_CLOSURE_KEYS].sort());
  assert.equal(Date.parse(record.createdAt) <= Date.parse(comparison.criteriaDefinedAt), true);
  assert.equal(Date.parse(comparison.criteriaDefinedAt) < Date.parse(run.executedAt), true);
  assert.equal(production.calculationFingerprint, run.calculationFingerprint);
  assert.equal(run.engineVersion, `calculator.js-git-sha256-${input.source.files.productionCore.gitContentSha256.slice(0, 16)}`);
  Object.values(input.source.files).forEach(item => {
    assert.match(item.gitBlob, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
    assert.match(item.gitContentSha256, /^[0-9a-f]{64}$/u);
  });
  assert.equal(Object.prototype.hasOwnProperty.call(production, 'runFingerprint'), false, 'production result avoids QRF self-hash recursion');
  assert.equal(reference.calculationFingerprint, run.calculationFingerprint);
  assert.equal(reference.runFingerprint, run.runFingerprint);
  assert.equal(comparison.referenceMethod, 'closed-form-oracle');
  assert.equal(comparisonData.schemaVersion, 2);
  assert.equal(comparisonData.kind, Bundle.COMPARISON_DATA_KIND_V2);
  assert.equal(comparisonData.calculationFingerprint, run.calculationFingerprint);
  assert.equal(comparisonData.runFingerprint, run.runFingerprint);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.kind, 'engineering-qualification-g1-decision-receipt.v2');
  assert.equal(receipt.calculationFingerprint, run.calculationFingerprint);
  assert.equal(receipt.runFingerprint, run.runFingerprint);
  assert.equal(receipt.boundary.trustedProcessLaunchRequired, true);
  assert.equal(receipt.boundary.gitAttributeFiltersAllowed, false);
  assert.deepEqual(receipt.comparisonBindings[0].comparisonDataArtifact, comparison.comparisonDataArtifact);

  const numeric = comparison.assertions.filter(item => item.type === 'numeric');
  assert.equal(numeric.length, 79, 'all production/oracle result keys are asserted');
  const numericKeys = numeric.map(item => item.actualPointer.slice('/results/'.length)).sort();
  assert.deepEqual(numericKeys, Object.keys(production.results).sort());
  Pilot.SUPPLEMENTAL_CLOSURE_KEYS.forEach(key => {
    const assertion = numeric.find(item => item.actualPointer === `/results/${key}`);
    assert.ok(assertion, `${key} closure assertion exists`);
    assert.equal(assertion.toleranceMode, 'exact');
    assert.equal(assertion.absoluteTolerance, 0);
    assert.equal(production.results[key], 1);
    assert.equal(reference.results[key], 1);
  });
  Object.keys(production.results).filter(key => key.endsWith('Pass')).forEach(key => assert.equal(production.results[key], 1, `${key} passes`));
  assert.equal(production.results.strengthPass, 1);
  assert.equal(production.results.detailPass, 1);
  assert.equal(production.results.passes, 1);
  assert.equal(production.results.complianceReady, 1);
  assert.equal(production.results.validationFailure, 0);
  assert.equal(production.results.completeJointDesign, 0);
  assert.ok(fs.readFileSync(path.join(workspace, ...run.outputArtifact.file.split('/')), 'utf8').includes(run.calculationFingerprint));
  assertNoAbsoluteCliPath(creationResult, JSON.stringify(creationResult));
  return { sealedPath, record };
}

function createResignedTamper(sourceWorkspace, sourceResult, tempRoot, name, mutators) {
  const workspace = path.join(tempRoot, name);
  fs.cpSync(sourceWorkspace, workspace, { recursive: true });
  const originalRecord = readJson(path.join(workspace, sourceResult.outputFileName));
  const record = originalRecord;
  const run = record.calculationRuns[0];
  const comparison = record.independentComparisons[0];
  const decision = record.qualificationDecisions[0];

  const inputPayload = evidenceJson(workspace, run.inputArtifact);
  const productionPayload = evidenceJson(workspace, run.resultDataArtifact);
  const oldCalculationFingerprint = run.calculationFingerprint;
  if (mutators.input) mutators.input(inputPayload);
  if (mutators.production) mutators.production(productionPayload);
  if (mutators.recalculateCalculationFingerprint) {
    run.calculationFingerprint = `CF-${sha256(Buffer.from(canonicalJson({
      invocation: inputPayload,
      productionResult: productionPayload.results,
    }), 'utf8')).slice(0, 16).toUpperCase()}`;
    productionPayload.calculationFingerprint = run.calculationFingerprint;
  }
  writeEvidenceJson(workspace, run.inputArtifact, inputPayload);
  writeEvidenceJson(workspace, run.resultDataArtifact, productionPayload);

  if (mutators.outputText || mutators.recalculateCalculationFingerprint) {
    const outputPath = path.join(workspace, ...run.outputArtifact.file.split('/'));
    let outputText = fs.readFileSync(outputPath, 'utf8');
    if (mutators.recalculateCalculationFingerprint) outputText = outputText.replaceAll(oldCalculationFingerprint, run.calculationFingerprint);
    if (mutators.outputText) outputText = mutators.outputText(outputText);
    const outputBuffer = Buffer.from(outputText, 'utf8');
    fs.writeFileSync(outputPath, outputBuffer);
    run.outputArtifact.bytes = outputBuffer.length;
    run.outputArtifact.sha256 = sha256(outputBuffer);
  }
  if (mutators.run) mutators.run(run);
  run.runFingerprint = Bundle.qualificationRunFingerprint(run);

  if (mutators.referenceText || mutators.recalculateCalculationFingerprint) {
    const referencePath = path.join(workspace, ...comparison.referenceArtifact.file.split('/'));
    let referenceText = fs.readFileSync(referencePath, 'utf8');
    if (mutators.recalculateCalculationFingerprint) referenceText = referenceText.replaceAll(oldCalculationFingerprint, run.calculationFingerprint);
    if (mutators.referenceText) referenceText = mutators.referenceText(referenceText);
    const referenceBuffer = Buffer.from(referenceText, 'utf8');
    fs.writeFileSync(referencePath, referenceBuffer);
    comparison.referenceArtifact.bytes = referenceBuffer.length;
    comparison.referenceArtifact.sha256 = sha256(referenceBuffer);
  }

  const reference = evidenceJson(workspace, comparison.referenceDataArtifact);
  reference.calculationFingerprint = run.calculationFingerprint;
  reference.runFingerprint = run.runFingerprint;
  if (mutators.reference) mutators.reference(reference);
  writeEvidenceJson(workspace, comparison.referenceDataArtifact, reference);

  const comparisonData = evidenceJson(workspace, comparison.comparisonDataArtifact);
  if (mutators.comparisonRecord) mutators.comparisonRecord(comparison);
  comparisonData.calculationFingerprint = run.calculationFingerprint;
  comparisonData.runFingerprint = run.runFingerprint;
  comparisonData.criteriaDefinedAt = comparison.criteriaDefinedAt;
  comparisonData.inputArtifactSha256 = run.inputArtifact.sha256;
  comparisonData.productionOutputSha256 = run.outputArtifact.sha256;
  comparisonData.productionResultDataSha256 = run.resultDataArtifact.sha256;
  comparisonData.referenceArtifactSha256 = comparison.referenceArtifact.sha256;
  comparisonData.referenceDataArtifactSha256 = comparison.referenceDataArtifact.sha256;
  comparisonData.assertions = JSON.parse(JSON.stringify(comparison.assertions));
  if (mutators.comparison) mutators.comparison(comparisonData);
  writeEvidenceJson(workspace, comparison.comparisonDataArtifact, comparisonData);

  const receipt = evidenceJson(workspace, decision.decisionReceipt);
  receipt.decisionId = decision.decisionId;
  receipt.runId = run.runId;
  receipt.comparisonIds = [...decision.comparisonIds];
  receipt.claimedLevel = decision.claimedLevel;
  receipt.basedOnDecisionId = decision.basedOnDecisionId;
  receipt.reviewer = decision.reviewer;
  receipt.basis = decision.basis;
  receipt.decidedAt = decision.decidedAt;
  receipt.calculationFingerprint = run.calculationFingerprint;
  receipt.runFingerprint = run.runFingerprint;
  receipt.source = JSON.parse(JSON.stringify(inputPayload.source));
  receipt.comparisonBindings = [{ comparisonId: comparison.comparisonId, comparisonDataArtifact: { ...comparison.comparisonDataArtifact } }];
  if (mutators.receipt) mutators.receipt(receipt);
  writeEvidenceJson(workspace, decision.decisionReceipt, receipt);

  record.bundleFingerprint = Bundle.bundleFingerprint(record);
  const tamperedPath = path.join(workspace, `case-bundle-${record.bundleFingerprint}.json`);
  fs.writeFileSync(tamperedPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return tamperedPath;
}

function expectResignedTamperBlocked(sourceWorkspace, sourceResult, tempRoot, name, mutators) {
  const tamperedPath = createResignedTamper(sourceWorkspace, sourceResult, tempRoot, name, mutators);
  assert.throws(
    () => Bundle.inspectBundleFile(tamperedPath),
    error => error instanceof Bundle.ContractError
      && /(?:CF|QRF|SHA|指紋|版本|收據|綁定|comparison|比較|正式結果|獨立基準|獨立閉式|oracle|路徑|benchmark|斷言|機讀|容許差|政策|漂移|Git|commit|來源|可讀|邊界)/iu.test(error.message),
    `${name} stays blocked with a governed contract error after outer hashes are recomputed`,
  );
}

const dirty = Boolean(execFileSync('git', ['-C', REPO_ROOT, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim());
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-column-moment-g1-pilot-'));
try {
  function expectRuntimeInjectionBlocked(name, nodeArgs, environment) {
    const workspace = path.join(tempRoot, `runtime-${name}`);
    const cli = spawnSync(process.execPath, [
      ...nodeArgs,
      PILOT_PATH,
      '--workspace', workspace,
      '--case-id', `CASE-RUNTIME-${name.toUpperCase()}`,
      '--json',
    ], { encoding: 'utf8', windowsHide: true, env: environment });
    assert.equal(cli.status, 2, cli.stderr || cli.stdout);
    assert.equal(cli.stdout, '', `${name} injection emits no ready JSON`);
    assert.match(cli.stderr, /untrusted-runtime-injection/u, `${name} injection is explicitly rejected`);
    assert.equal(fs.existsSync(workspace), false, `${name} injection is rejected before workspace creation`);
  }

  expectRuntimeInjectionBlocked('node-options', [], { ...process.env, NODE_OPTIONS: '--no-warnings' });
  expectRuntimeInjectionBlocked('node-flag', ['--no-warnings'], { ...process.env });
  expectRuntimeInjectionBlocked('node-path', [], { ...process.env, NODE_PATH: tempRoot });
  expectRuntimeInjectionBlocked('git-config', [], { ...process.env, GIT_CONFIG_COUNT: '0' });
  expectRuntimeInjectionBlocked('git-config-parameters', [], { ...process.env, GIT_CONFIG_PARAMETERS: "'core.fsmonitor=false'" });
  expectRuntimeInjectionBlocked('git-common-dir', [], { ...process.env, GIT_COMMON_DIR: tempRoot });
  const harmlessPreloader = path.join(tempRoot, 'harmless-preloader.cjs');
  fs.writeFileSync(harmlessPreloader, "'use strict';\n", { encoding: 'utf8', flag: 'wx' });
  expectRuntimeInjectionBlocked('require', ['--require', harmlessPreloader], { ...process.env });

  if (dirty) {
    const workspace = path.join(tempRoot, 'dirty-source');
    assert.throws(() => Pilot.createSyntheticG1Workspace(workspace, { caseId: 'CASE-DIRTY' }), /clean-immutable-source|乾淨/u, 'dirty source cannot seal G1');
    assert.equal(fs.existsSync(workspace), false, 'dirty-source rejection happens before workspace creation');
    const cli = spawnSync(process.execPath, [PILOT_PATH, '--workspace', path.join(tempRoot, 'dirty-cli'), '--case-id', 'CASE-DIRTY-CLI', '--json'], { encoding: 'utf8', windowsHide: true });
    assert.equal(cli.status, 2, cli.stderr || cli.stdout);
    assert.equal(cli.stdout, '', 'blocked CLI emits no ready JSON');
    assert.match(cli.stderr, /clean-immutable-source|乾淨/u);
    console.log('beam-column moment synthetic G1 pilot dirty-source gate OK');
  } else {
    const workspace = path.join(tempRoot, 'api-success');
    const result = Pilot.createSyntheticG1Workspace(workspace, { caseId: 'CASE-MOMENT-G1-API' });
    assertReadySyntheticG1(workspace, result);

    const forbiddenRepoWorkspace = path.join(__dirname, '.beam-column-moment-g1-pilot-must-stay-private');
    assert.equal(fs.existsSync(forbiddenRepoWorkspace), false);
    assert.throws(() => Pilot.createSyntheticG1Workspace(forbiddenRepoWorkspace, { caseId: 'CASE-REPO-REJECT' }), /不得位於工具程式庫內|private/u);
    assert.equal(fs.existsSync(forbiddenRepoWorkspace), false);

    const existingWorkspace = path.join(tempRoot, 'already-exists');
    fs.mkdirSync(existingWorkspace);
    fs.writeFileSync(path.join(existingWorkspace, 'sentinel.txt'), 'keep', 'utf8');
    assert.throws(() => Pilot.createSyntheticG1Workspace(existingWorkspace, { caseId: 'CASE-EXISTS' }), /已存在|exists|覆寫/u);
    assert.equal(fs.readFileSync(path.join(existingWorkspace, 'sentinel.txt'), 'utf8'), 'keep');

    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-production-cf', {
      production: payload => { payload.calculationFingerprint = 'CF-0000000000000000'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-supplemental-closure-gate', {
      production: payload => { payload.result.governingAxialPass = 0; payload.results.governingAxialPass = 0; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-visible-output-cf', {
      outputText: text => text.replace(/CF-[0-9A-F]{16}/gu, 'CF-FFFFFFFFFFFFFFFF'),
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-visible-output-boundary', {
      outputText: text => text.replace('completeJointDesign=false', 'completeJointDesign=true'),
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'downgrade-tool-id', {
      run: value => { value.toolId = 'steel-connection-formal.beam_column_moment.downgraded'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-full-input-shape', {
      input: payload => { payload.fullBenchmarkInput.momentCases = {}; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-fake-source-commit', {
      input: payload => { payload.source.commit = '0'.repeat(40); },
      recalculateCalculationFingerprint: true,
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-source-git-content-sha', {
      input: payload => { payload.source.files.productionCore.gitContentSha256 = '0'.repeat(64); },
      recalculateCalculationFingerprint: true,
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-reference-cf', {
      reference: payload => { payload.calculationFingerprint = 'CF-1111111111111111'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-reference-qrf', {
      reference: payload => { payload.runFingerprint = 'QRF-111111111111111111111111'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-registered-tolerance-policy', {
      reference: payload => { payload.result.Mp += 1000; payload.results.Mp += 1000; },
      comparisonRecord: value => {
        const assertion = value.assertions.find(item => item.actualPointer === '/results/Mp');
        assertion.expectedNumber += 1000;
        assertion.toleranceMode = 'absolute';
        assertion.absoluteTolerance = 2000;
      },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-reference-markdown-qrf', {
      referenceText: text => text.replace(/QRF-[0-9A-F]{24}/u, 'QRF-AAAAAAAAAAAAAAAAAAAAAAAA'),
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-reference-markdown-boundary', {
      referenceText: text => text.replace('G2=false', 'G2=true'),
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-comparison-cf', {
      comparison: payload => { payload.calculationFingerprint = 'CF-2222222222222222'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-comparison-qrf', {
      comparison: payload => { payload.runFingerprint = 'QRF-222222222222222222222222'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'downgrade-comparison-v1', {
      comparison: payload => { payload.schemaVersion = 1; payload.kind = Bundle.COMPARISON_DATA_KIND; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-receipt-decision', {
      receipt: payload => { payload.decision = 'review'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-receipt-cf', {
      receipt: payload => { payload.calculationFingerprint = 'CF-3333333333333333'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-receipt-qrf', {
      receipt: payload => { payload.runFingerprint = 'QRF-333333333333333333333333'; },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'tamper-receipt-binding', {
      receipt: payload => { payload.comparisonBindings[0].comparisonDataArtifact.sha256 = '0'.repeat(64); },
    });
    expectResignedTamperBlocked(workspace, result, tempRoot, 'downgrade-receipt-v1', {
      receipt: payload => { payload.schemaVersion = 1; payload.kind = 'engineering-qualification-g1-decision-receipt.v1'; },
    });

    const cliWorkspace = path.join(tempRoot, 'cli-success');
    const cli = spawnSync(process.execPath, [PILOT_PATH, '--workspace', cliWorkspace, '--case-id', 'CASE-MOMENT-G1-CLI', '--json'], { encoding: 'utf8', windowsHide: true });
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    const cliResult = JSON.parse(cli.stdout);
    assertNoAbsoluteCliPath(cliResult, cli.stdout);
    assertReadySyntheticG1(cliWorkspace, cliResult);

    const usageRun = spawnSync(process.execPath, [PILOT_PATH, '--workspace', path.join(tempRoot, 'missing-case')], { encoding: 'utf8', windowsHide: true });
    assert.equal(usageRun.status, 3, usageRun.stderr || usageRun.stdout);
    assert.match(usageRun.stderr, /case-id|需要/u);
    console.log('beam-column moment synthetic G1 pilot OK');
  }
} finally {
  const resolved = path.resolve(tempRoot);
  assert.equal(resolved.toLowerCase().startsWith(`${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase()), true);
  assert.match(path.basename(resolved), /^beam-column-moment-g1-pilot-/u);
  fs.rmSync(resolved, { recursive: true, force: true });
}
