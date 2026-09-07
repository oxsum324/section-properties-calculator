'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const Intake = require('./beam-column-moment-real-case-intake.js');
const Bundle = require('./engineering-qualification-case-bundle.js');
const Contract = require('./beam-column-moment-real-case-g1-contract.js');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const RUNNER_PATH = __filename;
const CONTRACT_PATH = path.join(__dirname, 'beam-column-moment-real-case-g1-contract.js');
const INTAKE_PATH = path.join(__dirname, 'beam-column-moment-real-case-intake.js');
const BUNDLE_PATH = path.join(__dirname, 'engineering-qualification-case-bundle.js');
const CHECKER_PATH = path.join(__dirname, 'attachment-package-check.js');
const VERIFIER_PATH = path.join(__dirname, 'attachment-package-verify.js');
const HISTORY_PATH = path.join(__dirname, 'attachment-package-upgrade-history.js');
const COMPARISON_CONTRACT_PATH = path.join(__dirname, 'attachment-case-governance-portfolio-compare.js');
const PRODUCTION_ADAPTER_PATH = path.join(__dirname, 'independent-engineering-adapters', 'steel-formal.js');
const PRODUCTION_CORE_PATH = path.join(REPOSITORY_ROOT, '鋼構工具', 'calculator.js');
const TOOL_METADATA_PATH = path.join(REPOSITORY_ROOT, '鋼構工具', 'tool-metadata.js');

const FIXED_INTAKE_INPUT = 'beam-column-moment-real-case-intake.json';
const INPUT_ARTIFACT_PATH = 'inputs/beam-column-moment-real-case-g1.input.json';
const PRODUCTION_DATA_PATH = 'outputs/beam-column-moment-real-case.production.json';
const HUMAN_OUTPUT_PATH = 'outputs/beam-column-moment-real-case.g1-review.html';
const COMPARISON_DATA_PATH = 'references/beam-column-moment-real-case-g1.comparison-data.json';
const DECISION_TEMPLATE_PATH = 'references/beam-column-moment-real-case-g1-decision.template.json';
const DECISION_CANDIDATE_PATH = 'references/beam-column-moment-real-case-g1-decision.json';
const DECISION_RECEIPT_PATH = 'references/beam-column-moment-real-case-g1-decision.receipt.json';
const REVIEW_BUNDLE_PATH = 'case-bundle.g1.review.json';
const G1_DRAFT_PATH = 'case-bundle.g1.draft.json';
const RUN_ID = 'RUN-MOMENT-REAL-G1-001';
const COMPARISON_ID = 'CMP-MOMENT-REAL-G1-001';
const DECISION_ID = 'QD-MOMENT-REAL-G1-001';
const TOOL_NAME = '鋼構接頭正式規範核算工具／梁柱彎矩接頭';
const MAX_INTERNAL_BUFFER = 64 * 1024 * 1024;

const DECISION_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'status', 'runId', 'comparisonId', 'reviewer', 'basis', 'decidedAt', 'confirmations',
]);
const DECISION_CONFIRMATION_FIELDS = Object.freeze([
  'productionAndReferenceReviewed', 'sourceAndInputsReviewed', 'tolerancesWerePredefined',
  'completeJointDesignFalseAcknowledged', 'g2FalseAcknowledged', 'g3FalseAcknowledged',
  'legalSignoffFalseAcknowledged', 'formalAttachmentApprovalFalseAcknowledged', 'pagesPublicationFalseAcknowledged',
]);
const DECISION_RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'decisionId', 'runId', 'comparisonId', 'claimedLevel', 'reviewer', 'basis', 'decidedAt',
  'decision', 'sourceKind', 'intakeFingerprint', 'calculationFingerprint', 'runFingerprint',
  'manualDecisionArtifact', 'intakeReceiptArtifact', 'comparisonDataArtifact', 'source', 'boundary',
]);
const RUN_INPUT_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'profileId', 'intakeFingerprint', 'caseIdentity', 'criteria', 'toolInput',
  'intakeEvidence', 'resultSchemaSha256', 'source', 'boundary',
]);
const RUN_INPUT_EVIDENCE_FIELDS = Object.freeze([
  'candidate', 'readinessReceipt', 'caseSourceArtifact', 'referenceArtifact', 'referenceDataArtifact',
]);
const PRODUCTION_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'profileId', 'intakeFingerprint', 'calculationFingerprint', 'resultSchemaSha256',
  'sourceCommit', 'formalResult', 'result', 'results', 'comparison',
]);
const PRODUCTION_COMPARISON_FIELDS = Object.freeze(['controlBranch', 'decision', 'outOfScope']);
const COMPARISON_DATA_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'comparisonId', 'runId', 'calculationFingerprint', 'runFingerprint',
  'criteriaDefinedAt', 'inputArtifactSha256', 'intakeReceiptSha256', 'productionOutputSha256',
  'productionResultDataSha256', 'referenceArtifactSha256', 'referenceDataArtifactSha256', 'assertions',
]);

const GOVERNED_SOURCE_PATHS = Object.freeze({
  runner: { path: '結構工具箱/tools/beam-column-moment-real-case-g1-runner.js', absolute: RUNNER_PATH },
  contract: { path: '結構工具箱/tools/beam-column-moment-real-case-g1-contract.js', absolute: CONTRACT_PATH },
  intake: { path: '結構工具箱/tools/beam-column-moment-real-case-intake.js', absolute: INTAKE_PATH },
  caseBundle: { path: '結構工具箱/tools/engineering-qualification-case-bundle.js', absolute: BUNDLE_PATH },
  attachmentChecker: { path: '結構工具箱/tools/attachment-package-check.js', absolute: CHECKER_PATH },
  attachmentVerifier: { path: '結構工具箱/tools/attachment-package-verify.js', absolute: VERIFIER_PATH },
  history: { path: '結構工具箱/tools/attachment-package-upgrade-history.js', absolute: HISTORY_PATH },
  comparisonContract: { path: '結構工具箱/tools/attachment-case-governance-portfolio-compare.js', absolute: COMPARISON_CONTRACT_PATH },
  productionAdapter: { path: '結構工具箱/tools/independent-engineering-adapters/steel-formal.js', absolute: PRODUCTION_ADAPTER_PATH },
  productionCore: { path: '鋼構工具/calculator.js', absolute: PRODUCTION_CORE_PATH },
  metadata: { path: '鋼構工具/tool-metadata.js', absolute: TOOL_METADATA_PATH },
});

const RESERVED_OUTPUT_PATHS = Object.freeze([
  INPUT_ARTIFACT_PATH, PRODUCTION_DATA_PATH, HUMAN_OUTPUT_PATH, COMPARISON_DATA_PATH,
  DECISION_TEMPLATE_PATH, DECISION_CANDIDATE_PATH, DECISION_RECEIPT_PATH,
  REVIEW_BUNDLE_PATH, G1_DRAFT_PATH,
].map(value => value.toLowerCase()));

class RealCaseG1UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RealCaseG1UsageError';
  }
}

class RealCaseG1Error extends Error {
  constructor(code) {
    super(`beam-column-moment-real-case-g1:${code}`);
    this.name = 'RealCaseG1Error';
  }
}

function fail(code) {
  throw new RealCaseG1Error(code);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  return Contract.canonicalJson(value);
}

function sha256(value) {
  return Contract.sha256(value);
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function nextIso(after = '') {
  const lower = after ? Date.parse(after) + 1 : 0;
  return new Date(Math.max(Date.now(), lower)).toISOString();
}

function exactKeys(record, fields, code) {
  try {
    Contract.exactKeys(record, fields);
  } catch {
    fail(code);
  }
  return record;
}

function descriptor(item) {
  return Contract.descriptor(item.relative, item.bytes, item.sha256);
}

function sameSnapshot(left, right) {
  return canonicalJson({
    receipt: left.receipt,
    candidateSha256: left.candidateEvidence.sha256,
    caseSourceSha256: left.caseSource.sha256,
    referenceArtifactSha256: left.referenceArtifact.sha256,
    referenceDataSha256: left.referenceData.sha256,
  }) === canonicalJson({
    receipt: right.receipt,
    candidateSha256: right.candidateEvidence.sha256,
    caseSourceSha256: right.caseSource.sha256,
    referenceArtifactSha256: right.referenceArtifact.sha256,
    referenceDataSha256: right.referenceData.sha256,
  });
}

function referenceExpectedMetadata(snapshot) {
  const candidate = snapshot.candidate;
  return {
    externalCaseId: candidate.caseIdentity.externalCaseId,
    caseIdentitySha256: snapshot.receipt.caseIdentitySha256,
    criteriaSha256: snapshot.receipt.criteriaSha256,
    toolInputSha256: snapshot.receipt.toolInputSha256,
    caseSourceArtifactSha256: snapshot.receipt.caseSourceArtifact.sha256,
    humanArtifactSha256: snapshot.receipt.referenceArtifact.sha256,
    method: candidate.independentReference.method,
    author: candidate.independentReference.author,
    reviewer: candidate.independentReference.reviewer,
    createdAt: candidate.independentReference.createdAt,
    basis: candidate.independentReference.basis,
    comparison: {
      controlBranch: candidate.criteria.controlBranchExpected,
      decision: candidate.criteria.decisionExpected,
      outOfScope: candidate.criteria.outOfScopeExpected,
    },
  };
}

function validateExecutionSnapshot(snapshot) {
  Contract.validateReferenceData(snapshot.referenceData.record, referenceExpectedMetadata(snapshot));
  if (snapshot.candidate.criteria.decisionExpected !== 'pass') fail('comparison-decision-must-be-pass');
  if (snapshot.candidate.criteria.outOfScopeExpected !== 'warning') fail('out-of-scope-must-remain-warning');
  return snapshot;
}

const FORBIDDEN_RUNTIME_ENVIRONMENT = Object.freeze([
  'NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_REPLACE_REF_BASE', 'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE', 'GIT_ATTR_SOURCE', 'GIT_EXEC_PATH',
]);

function isForbiddenRuntimeEnvironment(name) {
  return FORBIDDEN_RUNTIME_ENVIRONMENT.includes(name) || /^GIT_CONFIG(?:_|$)/iu.test(name);
}

function assertTrustedRuntime() {
  const forbiddenExecArg = process.execArgv[0];
  const forbiddenEnvironment = Object.keys(process.env)
    .find(name => isForbiddenRuntimeEnvironment(name) && String(process.env[name] || '').trim());
  if (forbiddenExecArg || forbiddenEnvironment) fail('untrusted-runtime-injection');
}

function sanitizedChildEnvironment() {
  const environment = { ...process.env };
  Object.keys(environment).filter(isForbiddenRuntimeEnvironment).forEach(name => { delete environment[name]; });
  return environment;
}

function governedGit(args, options = {}) {
  const environment = sanitizedChildEnvironment();
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return execFileSync('git', [
    '--no-replace-objects', '-c', 'core.fsmonitor=false',
    '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-c', `core.attributesFile=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-C', REPOSITORY_ROOT, ...args,
  ], {
    encoding: options.encoding === null ? null : 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    env: environment,
  });
}

function normalizedGovernedSource(buffer, key) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) fail(`governed-source-not-utf8-${key}`);
  return Buffer.from(text.replace(/\r\n/gu, '\n'), 'utf8');
}

function repositoryGitDirectory() {
  const marker = path.join(REPOSITORY_ROOT, '.git');
  if (!fs.existsSync(marker)) fail('git-metadata-missing');
  const stat = fs.lstatSync(marker);
  if (stat.isSymbolicLink()) fail('git-metadata-symlink');
  if (stat.isDirectory()) return marker;
  if (!stat.isFile()) fail('git-metadata-invalid');
  const match = fs.readFileSync(marker, 'utf8').trim().match(/^gitdir:\s*(.+)$/iu);
  if (!match) fail('gitdir-pointer-invalid');
  const directory = path.resolve(REPOSITORY_ROOT, match[1]);
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) fail('gitdir-target-invalid');
  return directory;
}

function assertNoGitAttributeFilters() {
  const gitDirectory = repositoryGitDirectory();
  const commonPointer = path.join(gitDirectory, 'commondir');
  let commonDirectory = gitDirectory;
  if (fs.existsSync(commonPointer)) {
    const relative = fs.readFileSync(commonPointer, 'utf8').trim();
    commonDirectory = path.resolve(gitDirectory, relative);
    if (!relative || !fs.existsSync(commonDirectory) || !fs.lstatSync(commonDirectory).isDirectory()
        || fs.lstatSync(commonDirectory).isSymbolicLink()) fail('git-common-dir-invalid');
  }
  if ([...new Set([gitDirectory, commonDirectory])].some(directory => fs.existsSync(path.join(directory, 'info', 'attributes')))) {
    fail('git-info-attributes-forbidden');
  }
  const tracked = governedGit(['ls-files', '-z', '--cached'], { encoding: null });
  const trackedText = tracked.toString('utf8');
  if (!Buffer.from(trackedText, 'utf8').equals(tracked)) fail('tracked-path-not-utf8');
  const directories = new Set([REPOSITORY_ROOT]);
  trackedText.split('\0').filter(Boolean).forEach(relativePath => {
    let directory = path.dirname(path.resolve(REPOSITORY_ROOT, ...relativePath.replace(/\\/gu, '/').split('/')));
    while (directory === REPOSITORY_ROOT || directory.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
      directories.add(directory);
      if (directory === REPOSITORY_ROOT) break;
      directory = path.dirname(directory);
    }
  });
  if ([...directories].some(directory => fs.existsSync(path.join(directory, '.gitattributes')))) fail('repository-gitattributes-forbidden');
}

function sourceSnapshot() {
  assertTrustedRuntime();
  const commit = governedGit(['rev-parse', 'HEAD']).trim().toLowerCase();
  assertNoGitAttributeFilters();
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail('source-commit-invalid');
  if (governedGit(['status', '--porcelain', '--untracked-files=all']).trim()) fail('requires-clean-immutable-source');
  const files = Object.fromEntries(Object.entries(GOVERNED_SOURCE_PATHS).map(([key, item]) => {
    if (!fs.existsSync(item.absolute) || !fs.lstatSync(item.absolute).isFile() || fs.lstatSync(item.absolute).isSymbolicLink()) {
      fail(`governed-source-invalid-${key}`);
    }
    const gitBlob = governedGit(['rev-parse', `HEAD:${item.path}`]).trim().toLowerCase();
    const committed = governedGit(['show', `HEAD:${item.path}`], { encoding: null });
    const physical = normalizedGovernedSource(fs.readFileSync(item.absolute), key);
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(gitBlob) || sha256(physical) !== sha256(committed)) {
      fail(`governed-source-not-at-head-${key}`);
    }
    return [key, { path: item.path, gitBlob, gitContentSha256: sha256(committed) }];
  }));
  return { commit, dirty: false, files };
}

function assertSameSource(left, right, code) {
  if (canonicalJson(left) !== canonicalJson(right)) fail(`source-changed-${code}`);
}

function relativeInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateOutputTarget(intakeRoot, outputWorkspace) {
  if (!outputWorkspace) throw new RealCaseG1UsageError('請指定全新的 output workspace。');
  const output = path.resolve(outputWorkspace);
  Bundle.requirePrivateWorkspaceLocation(output, '梁柱彎矩實案 G1 output workspace');
  if (fs.existsSync(output)) fail('output-workspace-already-exists');
  if (relativeInside(intakeRoot, output) || relativeInside(output, intakeRoot)) fail('intake-output-workspaces-must-be-disjoint');
  const parent = path.dirname(output);
  if (!fs.existsSync(parent) || !fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink()) fail('output-parent-invalid');
  if (fs.realpathSync.native(parent) !== path.resolve(parent)) fail('output-parent-redirected');
  return output;
}

function ensureReservedPathsAvailable(snapshot) {
  const occupied = snapshot.evidence.map(item => item.relative.toLowerCase());
  if (occupied.some(item => RESERVED_OUTPUT_PATHS.includes(item))) fail('intake-evidence-collides-with-runner-output');
}

function writeEvidence(root, relativePath, content) {
  const normalized = String(relativePath || '').replace(/\\/gu, '/');
  Contract.validateDescriptor({ file: normalized, bytes: 1, sha256: '1'.repeat(64) });
  const target = path.resolve(root, ...normalized.split('/'));
  if (!relativeInside(root, target) || target === path.resolve(root)) fail('evidence-path-outside-workspace');
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer, { flag: 'wx' });
  return Contract.descriptor(normalized, buffer.length, sha256(buffer));
}

function copyIntakeSnapshot(snapshot, outputRoot) {
  ensureReservedPathsAvailable(snapshot);
  snapshot.evidence.forEach(item => {
    const copied = writeEvidence(outputRoot, item.relative, item.buffer);
    if (canonicalJson(copied) !== canonicalJson(descriptor(item))) fail('intake-copy-mismatch');
  });
  ['inputs', 'outputs', 'references', 'reports'].forEach(name => fs.mkdirSync(path.join(outputRoot, name), { recursive: true }));
}

function runInternalExecution() {
  let request;
  try {
    request = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    fail('internal-request-invalid');
  }
  exactKeys(request, ['schemaVersion', 'kind', 'toolInput'], 'internal-request-fields');
  if (request.schemaVersion !== 1 || request.kind !== 'beam-column-moment-real-case-g1-internal-request.v1') fail('internal-request-identity');
  const before = sourceSnapshot();
  const Adapter = require(PRODUCTION_ADAPTER_PATH);
  const issues = Adapter.validateBeamColumnMomentCase88(request.toolInput);
  if (!Array.isArray(issues) || issues.length) fail('production-input-invalid');
  delete globalThis.SteelToolMetadata;
  delete require.cache[require.resolve(TOOL_METADATA_PATH)];
  require(TOOL_METADATA_PATH);
  const metadata = globalThis.SteelToolMetadata?.connection;
  if (!metadata || metadata.id !== 'steel-connection-formal' || metadata.modules?.beamColumnMoment?.completeJointDesign !== false) {
    fail('tool-metadata-drift');
  }
  const execution = Adapter.executeBeamColumnMomentCase88(request.toolInput);
  Contract.validateResultVector(execution.normalizedResult);
  if (!execution.formalResult || typeof execution.formalResult !== 'object' || Array.isArray(execution.formalResult)
      || execution.formalResult.completeJointDesign !== false) fail('formal-result-boundary');
  const after = sourceSnapshot();
  assertSameSource(before, after, 'internal-execution');
  return {
    schemaVersion: 1,
    kind: 'beam-column-moment-real-case-g1-internal-envelope.v1',
    sourceBefore: before,
    sourceAfter: after,
    toolVersion: metadata.version,
    formalResult: execution.formalResult,
    normalizedResult: execution.normalizedResult,
  };
}

function executeGovernedProduction(expectedSource, toolInput) {
  const request = {
    schemaVersion: 1,
    kind: 'beam-column-moment-real-case-g1-internal-request.v1',
    toolInput: clone(toolInput),
  };
  const child = spawnSync(process.execPath, [RUNNER_PATH, '--internal-execute'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(request),
    windowsHide: true,
    maxBuffer: MAX_INTERNAL_BUFFER,
    env: sanitizedChildEnvironment(),
  });
  if (child.status !== 0) fail('internal-execution-failed');
  let envelope;
  try {
    envelope = JSON.parse(child.stdout);
  } catch {
    fail('internal-envelope-invalid');
  }
  exactKeys(envelope, [
    'schemaVersion', 'kind', 'sourceBefore', 'sourceAfter', 'toolVersion', 'formalResult', 'normalizedResult',
  ], 'internal-envelope-fields');
  if (envelope.schemaVersion !== 1 || envelope.kind !== 'beam-column-moment-real-case-g1-internal-envelope.v1') fail('internal-envelope-identity');
  assertSameSource(expectedSource, envelope.sourceBefore, 'parent-child');
  assertSameSource(envelope.sourceBefore, envelope.sourceAfter, 'child-before-after');
  Contract.validateResultVector(envelope.normalizedResult);
  return envelope;
}

function reviewHtml(inputPayload, run, production, assertions) {
  const candidate = inputPayload.caseIdentity;
  const resultRows = assertions.filter(item => item.type === 'numeric').map(item => {
    const passed = Contract.assertionPass(item);
    const tolerance = item.toleranceMode === 'exact'
      ? 'exact'
      : `${item.toleranceMode}; abs=${item.absoluteTolerance}; rel=${item.relativeTolerance}`;
    return `<tr><th>${htmlEscape(item.label.replace('real-case result: ', ''))}</th><td>${htmlEscape(item.expectedNumber)}</td><td>${htmlEscape(item.actualNumber)}</td><td>${htmlEscape(item.unit)}</td><td>${htmlEscape(tolerance)}</td><td>${passed ? 'PASS' : 'FAIL'}</td></tr>`;
  }).join('');
  const textRows = assertions.filter(item => item.type !== 'numeric').map(item => (
    `<tr><th>${htmlEscape(item.type)}</th><td>${htmlEscape(item.expectedText)}</td><td>${htmlEscape(item.actualText)}</td><td colspan="2">exact</td><td>${Contract.assertionPass(item) ? 'PASS' : 'FAIL'}</td></tr>`
  )).join('');
  const comparisonPassed = assertions.every(Contract.assertionPass);
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="private-kind" content="${Contract.CLI_RESULT_KIND}">
<title>梁柱彎矩接頭實案 G1 比較審閱稿</title><style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;margin:28px;line-height:1.5;color:#18202a}h1,h2{color:#17365d}.warning{border:2px solid #a33;background:#fff4f4;padding:12px}.meta{display:grid;grid-template-columns:12rem 1fr;gap:4px 12px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #777;padding:5px;vertical-align:top}thead{background:#eaf0f8}.fail{color:#a00;font-weight:700}code{font-family:Consolas,monospace}</style></head>
<body><h1>梁柱彎矩接頭實案 G1 比較審閱稿</h1>
<div class="warning"><strong>私人資格化證據；尚未完成人工 G1。</strong><br>本頁不是正式附件核可、不是完整接頭設計、不是技師簽證，也不得發布至 Pages。</div>
<h2>案件與執行</h2><div class="meta"><strong>外部案件 ID</strong><span>${htmlEscape(candidate.externalCaseId)}</span><strong>計畫</strong><span>${htmlEscape(candidate.projectName)}／${htmlEscape(candidate.projectNo)}</span><strong>接頭標籤</strong><span>${htmlEscape(inputPayload.toolInput.connectionTag)}</span><strong>設計者</strong><span>${htmlEscape(candidate.designer)}</span><strong>計算指紋</strong><code>${run.calculationFingerprint}</code><strong>source commit</strong><code>${htmlEscape(inputPayload.source.commit)}</code></div>
<h2>逐項外部基準比較</h2><p>比較狀態：<strong class="${comparisonPassed ? '' : 'fail'}">${comparisonPassed ? 'PASS／待人工 G1 決定' : 'FAIL／須處理差異'}</strong></p>
<table><thead><tr><th>項目</th><th>外部基準</th><th>正式工具</th><th>單位</th><th>容許差</th><th>比較</th></tr></thead><tbody>${resultRows}${textRows}</tbody></table>
<h2>固定邊界</h2><pre>completeJointDesign=false
G1=false
G2=false
G3=false
legalSignoff=false
formalAttachmentApproval=false
pagesPublication=false
trustedProcessLaunchRequired=true
gitAttributeFiltersAllowed=false</pre>
<p>正式工具原始摘要：passes=${htmlEscape(production.results.passes)}；complianceReady=${htmlEscape(production.results.complianceReady)}；validationFailure=${htmlEscape(production.results.validationFailure)}。</p>
</body></html>\n`;
}

function decisionTemplate() {
  return {
    schemaVersion: 1,
    kind: Contract.DECISION_CANDIDATE_KIND,
    status: 'manual-review-required',
    runId: RUN_ID,
    comparisonId: COMPARISON_ID,
    reviewer: '',
    basis: '',
    decidedAt: '',
    confirmations: Object.fromEntries(DECISION_CONFIRMATION_FIELDS.map(key => [key, false])),
  };
}

function buildRunInput(snapshot, source) {
  return {
    schemaVersion: 1,
    kind: Contract.INPUT_KIND,
    profileId: Contract.REAL_PROFILE_ID,
    intakeFingerprint: snapshot.receipt.intakeFingerprint,
    caseIdentity: clone(snapshot.candidate.caseIdentity),
    criteria: clone(snapshot.candidate.criteria),
    toolInput: clone(snapshot.candidate.toolInput),
    intakeEvidence: {
      candidate: descriptor(snapshot.candidateEvidence),
      readinessReceipt: descriptor(snapshot.receiptEvidence),
      caseSourceArtifact: descriptor(snapshot.caseSource),
      referenceArtifact: descriptor(snapshot.referenceArtifact),
      referenceDataArtifact: descriptor(snapshot.referenceData),
    },
    resultSchemaSha256: Contract.RESULT_SCHEMA_SHA256,
    source,
    boundary: {
      sourceKind: 'real-case', calculatorExecuted: false, engineeringResultsCompared: false, g1: false, g2: false, g3: false,
      completeJointDesign: false, legalSignoff: false, formalAttachmentApproval: false, pagesPublication: false,
      trustedProcessLaunchRequired: true, gitAttributeFiltersAllowed: false,
    },
  };
}

function buildReviewBundle(snapshot, inputArtifact, run, comparison, comparedAt) {
  const caseHash = sha256(canonicalJson(snapshot.candidate.caseIdentity)).slice(0, 16).toUpperCase();
  const connectionTag = snapshot.candidate.toolInput.connectionTag;
  const record = Bundle.buildInitialBundle({
    caseId: `MOMENT-${caseHash}`,
    caseLabel: `梁柱彎矩接頭實案／${connectionTag}`.slice(0, 200),
    sourceKind: 'real-case',
    createdAt: snapshot.candidate.criteria.definedAt,
  });
  record.case = {
    caseId: record.case.caseId,
    caseLabel: record.case.caseLabel,
    sourceKind: 'real-case',
    externalCaseId: snapshot.candidate.caseIdentity.externalCaseId,
    caseSourceArtifact: descriptor(snapshot.caseSource),
    projectName: snapshot.candidate.caseIdentity.projectName,
    projectNo: snapshot.candidate.caseIdentity.projectNo,
    designer: snapshot.candidate.caseIdentity.designer,
    intendedUse: snapshot.candidate.caseIdentity.intendedUse,
    permissibleUse: snapshot.candidate.caseIdentity.permissibleUse,
    limitations: clone(snapshot.candidate.caseIdentity.limitations),
    exclusions: clone(snapshot.candidate.caseIdentity.exclusions),
    governingStandards: clone(snapshot.candidate.caseIdentity.governingStandards),
  };
  record.calculationRuns = [run];
  record.independentComparisons = [comparison];
  record.updatedAt = comparedAt;
  record.bundleFingerprint = Bundle.bundleFingerprint(record);
  return record;
}

function publicResult(overrides = {}) {
  return {
    kind: Contract.CLI_RESULT_KIND,
    status: overrides.status || 'ready-for-production-execution',
    intakeFingerprint: overrides.intakeFingerprint || '',
    calculationFingerprint: overrides.calculationFingerprint || '',
    runFingerprint: overrides.runFingerprint || '',
    comparisonPassed: Boolean(overrides.comparisonPassed),
    reviewBundleFile: overrides.reviewBundleFile || '',
    decisionTemplateFile: overrides.decisionTemplateFile || '',
    sealedBundleFile: overrides.sealedBundleFile || '',
    calculatorExecuted: Boolean(overrides.calculatorExecuted),
    engineeringResultsCompared: Boolean(overrides.engineeringResultsCompared),
    g1: Boolean(overrides.g1),
    g2: false,
    g3: false,
    completeJointDesign: false,
    legalSignoff: false,
    formalAttachmentApproval: false,
    pagesPublication: false,
    nextAction: overrides.nextAction || 'execute-production-after-sealed-intake',
  };
}

function assessExecutionReadiness(intakeWorkspace, inputRelative = FIXED_INTAKE_INPUT) {
  if (inputRelative !== FIXED_INTAKE_INPUT) fail('fixed-intake-input-required');
  const snapshot = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(intakeWorkspace, inputRelative));
  return publicResult({ intakeFingerprint: snapshot.receipt.intakeFingerprint });
}

function executeProduction(intakeWorkspace, inputRelative, outputWorkspace) {
  if (inputRelative !== FIXED_INTAKE_INPUT) fail('fixed-intake-input-required');
  const initial = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(intakeWorkspace, inputRelative));
  const sourceBefore = sourceSnapshot();
  const output = validateOutputTarget(initial.workspace, outputWorkspace);
  ensureReservedPathsAvailable(initial);
  const parent = path.dirname(output);
  const temp = path.join(parent, `.${path.basename(output)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  if (fs.existsSync(temp)) fail('temporary-output-collision');
  try {
    fs.mkdirSync(temp);
    copyIntakeSnapshot(initial, temp);
    const copied = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(temp, inputRelative));
    if (!sameSnapshot(initial, copied)) fail('copied-intake-snapshot-mismatch');

    const inputPayload = buildRunInput(copied, sourceBefore);
    const inputArtifact = writeEvidence(temp, INPUT_ARTIFACT_PATH, jsonText(inputPayload));
    const envelope = executeGovernedProduction(sourceBefore, inputPayload.toolInput);
    const executedAt = nextIso(inputPayload.criteria.definedAt);
    const normalized = envelope.normalizedResult;
    const actualComparisonSeed = {
      controlBranch: Contract.branchValue(inputPayload.toolInput, normalized),
      decision: 'review',
      outOfScope: normalized.completeJointDesign === 0 ? 'warning' : 'reject',
    };
    const assertions = Contract.buildAssertions(copied.referenceData.record, normalized, actualComparisonSeed);
    const decisionAssertion = assertions.find(item => item.type === 'decision');
    const actualComparison = {
      controlBranch: actualComparisonSeed.controlBranch,
      decision: decisionAssertion.actualText,
      outOfScope: actualComparisonSeed.outOfScope,
    };
    const calculationFingerprint = `CF-${sha256(canonicalJson({
      input: inputPayload,
      formalResult: envelope.formalResult,
      normalizedResult: normalized,
    })).slice(0, 16).toUpperCase()}`;
    const productionData = {
      schemaVersion: 1,
      kind: Contract.PRODUCTION_KIND,
      profileId: Contract.REAL_PROFILE_ID,
      intakeFingerprint: copied.receipt.intakeFingerprint,
      calculationFingerprint,
      resultSchemaSha256: Contract.RESULT_SCHEMA_SHA256,
      sourceCommit: sourceBefore.commit,
      formalResult: envelope.formalResult,
      result: normalized,
      results: normalized,
      comparison: actualComparison,
    };
    const resultDataArtifact = writeEvidence(temp, PRODUCTION_DATA_PATH, jsonText(productionData));
    const provisionalRun = {
      runId: RUN_ID,
      toolId: Contract.REAL_TOOL_ID,
      toolName: TOOL_NAME,
      toolVersion: envelope.toolVersion,
      engineVersion: `calculator.js-git-sha256-${sourceBefore.files.productionCore.gitContentSha256.slice(0, 16)}`,
      executedAt,
      calculationFingerprint,
      runFingerprint: '',
      inputArtifact,
      resultDataArtifact,
      outputArtifact: { file: HUMAN_OUTPUT_PATH, bytes: 1, sha256: '1'.repeat(64) },
      state: 'current',
      staleReasons: [],
      supersedesRunId: '',
    };
    const provisionalFingerprint = Bundle.qualificationRunFingerprint(provisionalRun);
    const outputArtifact = writeEvidence(temp, HUMAN_OUTPUT_PATH, reviewHtml(inputPayload, { ...provisionalRun, runFingerprint: provisionalFingerprint }, productionData, assertions));
    const run = { ...provisionalRun, outputArtifact };
    run.runFingerprint = Bundle.qualificationRunFingerprint(run);
    if (run.runFingerprint === provisionalFingerprint) fail('run-fingerprint-must-bind-final-output');

    const comparedAt = nextIso(executedAt);
    const comparisonDataArtifact = writeEvidence(temp, COMPARISON_DATA_PATH, jsonText({
      schemaVersion: 2,
      kind: Bundle.COMPARISON_DATA_KIND_V2,
      comparisonId: COMPARISON_ID,
      runId: RUN_ID,
      calculationFingerprint,
      runFingerprint: run.runFingerprint,
      criteriaDefinedAt: inputPayload.criteria.definedAt,
      inputArtifactSha256: inputArtifact.sha256,
      intakeReceiptSha256: inputPayload.intakeEvidence.readinessReceipt.sha256,
      productionOutputSha256: outputArtifact.sha256,
      productionResultDataSha256: resultDataArtifact.sha256,
      referenceArtifactSha256: copied.referenceArtifact.sha256,
      referenceDataArtifactSha256: copied.referenceData.sha256,
      assertions,
    }));
    const comparison = {
      comparisonId: COMPARISON_ID,
      runId: RUN_ID,
      comparedAt,
      criteriaDefinedAt: inputPayload.criteria.definedAt,
      referenceMethod: inputPayload.caseIdentity ? copied.candidate.independentReference.method : '',
      independentFromProductionCore: true,
      referenceArtifact: descriptor(copied.referenceArtifact),
      referenceDataArtifact: descriptor(copied.referenceData),
      referenceAuthor: copied.candidate.independentReference.author,
      referenceReviewer: copied.candidate.independentReference.reviewer,
      referenceCreatedAt: copied.candidate.independentReference.createdAt,
      referenceBasis: copied.candidate.independentReference.basis,
      comparisonDataArtifact,
      assertions,
    };
    const record = buildReviewBundle(copied, inputArtifact, run, comparison, comparedAt);
    const validation = Bundle.validateBundle(record, { baseDirectory: temp });
    if (validation.status !== 'review' || validation.qualificationStatus !== 'review' || validation.currentRuns !== 1) fail('review-bundle-validation');
    writeEvidence(temp, REVIEW_BUNDLE_PATH, jsonText(record));
    writeEvidence(temp, DECISION_TEMPLATE_PATH, jsonText(decisionTemplate()));

    const originAfter = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(intakeWorkspace, inputRelative));
    const copyAfter = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(temp, inputRelative));
    if (!sameSnapshot(initial, originAfter) || !sameSnapshot(initial, copyAfter)) fail('intake-changed-during-production');
    assertSameSource(sourceBefore, sourceSnapshot(), 'after-production');
    fs.renameSync(temp, output);
    const comparisonPassed = assertions.every(Contract.assertionPass);
    return publicResult({
      status: comparisonPassed ? 'comparison-pass-manual-g1-decision-required' : 'comparison-failed-discrepancy-review-required',
      intakeFingerprint: copied.receipt.intakeFingerprint,
      calculationFingerprint,
      runFingerprint: run.runFingerprint,
      comparisonPassed,
      reviewBundleFile: REVIEW_BUNDLE_PATH,
      decisionTemplateFile: DECISION_TEMPLATE_PATH,
      calculatorExecuted: true,
      engineeringResultsCompared: true,
      nextAction: comparisonPassed ? 'fill-manual-decision-candidate-then-seal-g1' : 'review-and-disposition-comparison-differences',
    });
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function validateManualDecision(record, comparison) {
  exactKeys(record, DECISION_FIELDS, 'manual-decision-fields');
  exactKeys(record.confirmations, DECISION_CONFIRMATION_FIELDS, 'manual-decision-confirmations');
  if (record.schemaVersion !== 1 || record.kind !== Contract.DECISION_CANDIDATE_KIND
      || record.status !== 'accepted-manual-g1' || record.runId !== RUN_ID || record.comparisonId !== COMPARISON_ID) {
    fail('manual-decision-identity');
  }
  for (const key of ['reviewer', 'basis']) {
    if (typeof record[key] !== 'string' || !record[key].trim() || record[key] !== record[key].trim() || record[key].length > (key === 'reviewer' ? 100 : 1000)) {
      fail(`manual-decision-${key}`);
    }
  }
  if (typeof record.decidedAt !== 'string' || !Number.isFinite(Date.parse(record.decidedAt))
      || new Date(record.decidedAt).toISOString() !== record.decidedAt
      || Date.parse(record.decidedAt) < Date.parse(comparison.comparedAt)
      || Date.parse(record.decidedAt) > Date.now() + 5 * 60 * 1000) fail('manual-decision-time');
  if (DECISION_CONFIRMATION_FIELDS.some(key => record.confirmations[key] !== true)) fail('manual-decision-confirmation-required');
  return record;
}

function sealG1(outputWorkspace, decisionRelative) {
  if (!outputWorkspace) throw new RealCaseG1UsageError('請指定既有 output workspace。');
  if (decisionRelative !== DECISION_CANDIDATE_PATH) fail('fixed-manual-decision-path-required');
  const root = path.resolve(outputWorkspace);
  Bundle.requirePrivateWorkspaceLocation(root, '梁柱彎矩實案 G1 output workspace');
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) fail('output-workspace-invalid');
  for (const relative of [DECISION_RECEIPT_PATH, G1_DRAFT_PATH]) {
    if (fs.existsSync(path.join(root, ...relative.split('/')))) fail('g1-seal-output-already-exists');
  }
  const reviewPath = path.join(root, REVIEW_BUNDLE_PATH);
  const loadedReview = Bundle.readStrictJsonFile(reviewPath, '梁柱彎矩實案 G1 review bundle');
  const reviewInspection = Bundle.validateBundle(loadedReview.record, { baseDirectory: root });
  if (reviewInspection.status !== 'review' || loadedReview.record.calculationRuns.length !== 1
      || loadedReview.record.independentComparisons.length !== 1 || loadedReview.record.qualificationDecisions.length !== 0) {
    fail('review-bundle-not-sealable');
  }
  const run = loadedReview.record.calculationRuns[0];
  const comparison = loadedReview.record.independentComparisons[0];
  if (run.toolId !== Contract.REAL_TOOL_ID || run.runId !== RUN_ID || comparison.comparisonId !== COMPARISON_ID
      || !comparison.assertions.every(Contract.assertionPass)
      || comparison.assertions.find(item => item.type === 'decision')?.actualText !== 'pass') fail('comparison-not-qualified-for-manual-g1');
  const inputLoaded = Bundle.readStrictJsonFile(path.join(root, ...run.inputArtifact.file.split('/')), '梁柱彎矩實案 G1 input');
  validateRunInputShape(inputLoaded.record);
  const sourceBefore = sourceSnapshot();
  assertSameSource(inputLoaded.record.source, sourceBefore, 'manual-decision-source');
  const decisionLoaded = Bundle.readStrictJsonFile(path.join(root, ...decisionRelative.split('/')), '梁柱彎矩實案 G1 manual decision');
  const decision = validateManualDecision(decisionLoaded.record, comparison);
  const manualDecisionArtifact = Contract.descriptor(decisionRelative, Buffer.byteLength(decisionLoaded.raw), sha256(decisionLoaded.raw));
  const receiptRecord = {
    schemaVersion: 1,
    kind: Contract.DECISION_RECEIPT_KIND,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    comparisonId: COMPARISON_ID,
    claimedLevel: 'G1',
    reviewer: decision.reviewer,
    basis: decision.basis,
    decidedAt: decision.decidedAt,
    decision: 'pass',
    sourceKind: 'real-case',
    intakeFingerprint: inputLoaded.record.intakeFingerprint,
    calculationFingerprint: run.calculationFingerprint,
    runFingerprint: run.runFingerprint,
    manualDecisionArtifact,
    intakeReceiptArtifact: inputLoaded.record.intakeEvidence.readinessReceipt,
    comparisonDataArtifact: comparison.comparisonDataArtifact,
    source: inputLoaded.record.source,
    boundary: {
      completeJointDesign: false, g2: false, g3: false, legalSignoff: false,
      formalAttachmentApproval: false, pagesPublication: false,
      trustedProcessLaunchRequired: true, gitAttributeFiltersAllowed: false,
    },
  };
  validateDecisionReceiptShape(receiptRecord, { decision, run, comparison, input: inputLoaded.record });
  const decisionReceipt = writeEvidence(root, DECISION_RECEIPT_PATH, jsonText(receiptRecord));
  const record = clone(loadedReview.record);
  record.qualificationDecisions = [{
    decisionId: DECISION_ID,
    runId: RUN_ID,
    comparisonIds: [COMPARISON_ID],
    claimedLevel: 'G1',
    basedOnDecisionId: '',
    reviewer: decision.reviewer,
    basis: decision.basis,
    decidedAt: decision.decidedAt,
    decisionReceipt,
  }];
  record.updatedAt = decision.decidedAt;
  record.bundleFingerprint = Bundle.bundleFingerprint(record);
  const validation = Bundle.validateBundle(record, { baseDirectory: root });
  if (validation.highestLevel !== 'G1' || validation.minimumCurrentLevel !== 'G1' || validation.status !== 'review') fail('manual-g1-draft-validation');
  writeEvidence(root, G1_DRAFT_PATH, jsonText(record));
  const sealed = Bundle.sealBundle(path.join(root, G1_DRAFT_PATH), { sealedAt: nextIso(decision.decidedAt) });
  const inspection = Bundle.inspectBundleFile(path.join(root, sealed.outputFileName));
  if (inspection.status !== 'ready' || inspection.qualificationStatus !== 'G1' || inspection.highestLevel !== 'G1') fail('manual-g1-sealed-validation');
  assertSameSource(sourceBefore, sourceSnapshot(), 'after-manual-g1-seal');
  return publicResult({
    status: 'real-case-g1-sealed-manual-decision',
    intakeFingerprint: inputLoaded.record.intakeFingerprint,
    calculationFingerprint: run.calculationFingerprint,
    runFingerprint: run.runFingerprint,
    comparisonPassed: true,
    reviewBundleFile: REVIEW_BUNDLE_PATH,
    sealedBundleFile: sealed.outputFileName,
    calculatorExecuted: true,
    engineeringResultsCompared: true,
    g1: true,
    nextAction: 'manual-g2-applicability-and-case-use-review',
  });
}

function validateRunInputShape(record) {
  exactKeys(record, RUN_INPUT_FIELDS, 'run-input-fields');
  exactKeys(record.intakeEvidence, RUN_INPUT_EVIDENCE_FIELDS, 'run-input-evidence-fields');
  if (record.schemaVersion !== 1 || record.kind !== Contract.INPUT_KIND || record.profileId !== Contract.REAL_PROFILE_ID
      || !/^RCI-[0-9A-F]{24}$/u.test(record.intakeFingerprint) || record.resultSchemaSha256 !== Contract.RESULT_SCHEMA_SHA256) {
    fail('run-input-identity');
  }
  Object.values(record.intakeEvidence).forEach(Contract.validateDescriptor);
  return record;
}

function validateProductionShape(record, run) {
  exactKeys(record, PRODUCTION_FIELDS, 'production-fields');
  exactKeys(record.comparison, PRODUCTION_COMPARISON_FIELDS, 'production-comparison-fields');
  if (record.schemaVersion !== 1 || record.kind !== Contract.PRODUCTION_KIND || record.profileId !== Contract.REAL_PROFILE_ID
      || record.calculationFingerprint !== run.calculationFingerprint || record.resultSchemaSha256 !== Contract.RESULT_SCHEMA_SHA256
      || canonicalJson(record.result) !== canonicalJson(record.results) || record.sourceCommit.length !== 40) fail('production-identity');
  Contract.validateResultVector(record.results);
  return record;
}

function boundJson(root, artifact) {
  Contract.validateDescriptor(artifact);
  const loaded = Bundle.readStrictJsonFile(path.join(root, ...artifact.file.split('/')), '實案 G1 綁定證據');
  if (Buffer.byteLength(loaded.raw) !== artifact.bytes || sha256(loaded.raw) !== artifact.sha256) fail('bound-artifact-digest');
  return loaded.record;
}

function verifyComparisonBindings(root, comparison, run) {
  const input = validateRunInputShape(boundJson(root, run.inputArtifact));
  const production = validateProductionShape(boundJson(root, run.resultDataArtifact), run);
  const data = boundJson(root, comparison.comparisonDataArtifact);
  exactKeys(data, COMPARISON_DATA_FIELDS, 'comparison-data-fields');
  const snapshot = validateExecutionSnapshot(Intake.consumeSealedReadinessForExecution(root, FIXED_INTAKE_INPUT));
  const expectedInput = buildRunInput(snapshot, input.source);
  if (canonicalJson(input) !== canonicalJson(expectedInput)) fail('run-input-intake-binding');
  const reference = boundJson(root, comparison.referenceDataArtifact);
  if (canonicalJson(reference) !== canonicalJson(snapshot.referenceData.record)
      || canonicalJson(comparison.referenceArtifact) !== canonicalJson(descriptor(snapshot.referenceArtifact))) fail('reference-intake-binding');
  const expectedAssertions = Contract.buildAssertions(reference, production.results, {
    controlBranch: Contract.branchValue(input.toolInput, production.results), decision: production.comparison.decision,
    outOfScope: production.results.completeJointDesign === 0 ? 'warning' : 'reject',
  });
  const expectedDecision = expectedAssertions.find(item => item.type === 'decision').actualText;
  if (canonicalJson(expectedAssertions) !== canonicalJson(comparison.assertions)
      || canonicalJson(data.assertions) !== canonicalJson(expectedAssertions)
      || production.comparison.decision !== expectedDecision
      || production.comparison.controlBranch !== Contract.branchValue(input.toolInput, production.results)
      || production.comparison.outOfScope !== 'warning') fail('comparison-assertion-binding');
  if (data.schemaVersion !== 2 || data.kind !== Bundle.COMPARISON_DATA_KIND_V2
      || data.comparisonId !== comparison.comparisonId || data.runId !== run.runId
      || data.calculationFingerprint !== run.calculationFingerprint || data.runFingerprint !== run.runFingerprint
      || data.criteriaDefinedAt !== input.criteria.definedAt || comparison.criteriaDefinedAt !== input.criteria.definedAt
      || data.inputArtifactSha256 !== run.inputArtifact.sha256 || data.intakeReceiptSha256 !== snapshot.receiptEvidence.sha256
      || data.productionOutputSha256 !== run.outputArtifact.sha256 || data.productionResultDataSha256 !== run.resultDataArtifact.sha256
      || data.referenceArtifactSha256 !== comparison.referenceArtifact.sha256 || data.referenceDataArtifactSha256 !== comparison.referenceDataArtifact.sha256) fail('comparison-data-binding');
  const referenceFields = { referenceMethod: 'method', referenceAuthor: 'author', referenceReviewer: 'reviewer', referenceCreatedAt: 'createdAt', referenceBasis: 'basis' };
  if (Object.entries(referenceFields).some(([key, refKey]) => comparison[key] !== snapshot.candidate.independentReference[refKey])
      || comparison.independentFromProductionCore !== true) fail('reference-provenance-binding');
  const cf = `CF-${sha256(canonicalJson({ input, formalResult: production.formalResult, normalizedResult: production.results })).slice(0, 16).toUpperCase()}`;
  if (cf !== run.calculationFingerprint || production.intakeFingerprint !== input.intakeFingerprint
      || production.sourceCommit !== input.source.commit || production.formalResult?.completeJointDesign !== false) fail('production-calculation-binding');
  return { input, production, snapshot };
}

function verifyBundleBindings(root, record, run) {
  const comparisons = record.independentComparisons.filter(item => item.runId === run.runId);
  const decisions = record.qualificationDecisions.filter(item => item.runId === run.runId);
  if (record.case.sourceKind !== 'real-case' || comparisons.length !== 1 || decisions.length > 1
      || decisions.some(item => item.claimedLevel !== 'G1') || record.artifactReviews.length || record.formalAdoptions.length
      || record.reportPackage.state !== 'unplanned') fail('real-case-g1-only-boundary');
  const comparison = comparisons[0];
  const { input, snapshot } = verifyComparisonBindings(root, comparison, run);
  const expectedCase = buildReviewBundle(snapshot, run.inputArtifact, run, comparison, comparison.comparedAt).case;
  if (canonicalJson(record.case) !== canonicalJson(expectedCase)) fail('case-identity-binding');
  exactKeys(input.source, ['commit', 'dirty', 'files'], 'saved-source-fields');
  exactKeys(input.source.files, Object.keys(GOVERNED_SOURCE_PATHS), 'saved-source-file-fields');
  if (!/^[0-9a-f]{40}$/u.test(input.source.commit) || input.source.dirty !== false) fail('saved-source-identity');
  for (const [key, item] of Object.entries(GOVERNED_SOURCE_PATHS)) {
    const saved = input.source.files[key];
    exactKeys(saved, ['path', 'gitBlob', 'gitContentSha256'], 'saved-source-descriptor');
    if (saved.path !== item.path
        || saved.gitBlob !== governedGit(['rev-parse', `${input.source.commit}:${item.path}`]).trim()
        || saved.gitContentSha256 !== sha256(governedGit(['show', `${input.source.commit}:${item.path}`], { encoding: null }))) fail('saved-source-content-binding');
  }
  if (run.engineVersion !== `calculator.js-git-sha256-${input.source.files.productionCore.gitContentSha256.slice(0, 16)}`) fail('engine-source-binding');
  if (decisions.length) {
    const decision = decisions[0];
    const receipt = boundJson(root, decision.decisionReceipt);
    const manual = validateManualDecision(boundJson(root, receipt.manualDecisionArtifact), comparison);
    validateDecisionReceiptShape(receipt, { decision: manual, run, comparison, input });
    if (decision.reviewer !== manual.reviewer || decision.basis !== manual.basis || decision.decidedAt !== manual.decidedAt
        || decision.decisionId !== DECISION_ID || !comparison.assertions.every(Contract.assertionPass)) fail('manual-decision-binding');
  }
}

function validateDecisionReceiptShape(record, context) {
  exactKeys(record, DECISION_RECEIPT_FIELDS, 'decision-receipt-fields');
  exactKeys(record.boundary, [
    'completeJointDesign', 'g2', 'g3', 'legalSignoff', 'formalAttachmentApproval',
    'pagesPublication', 'trustedProcessLaunchRequired', 'gitAttributeFiltersAllowed',
  ], 'decision-receipt-boundary-fields');
  Contract.validateDescriptor(record.manualDecisionArtifact);
  Contract.validateDescriptor(record.intakeReceiptArtifact);
  Contract.validateDescriptor(record.comparisonDataArtifact);
  if (record.schemaVersion !== 1 || record.kind !== Contract.DECISION_RECEIPT_KIND || record.decisionId !== DECISION_ID
      || record.runId !== context.run.runId || record.comparisonId !== context.comparison.comparisonId
      || record.claimedLevel !== 'G1' || record.decision !== 'pass' || record.sourceKind !== 'real-case'
      || record.reviewer !== context.decision.reviewer || record.basis !== context.decision.basis
      || record.decidedAt !== context.decision.decidedAt || record.intakeFingerprint !== context.input.intakeFingerprint
      || record.calculationFingerprint !== context.run.calculationFingerprint || record.runFingerprint !== context.run.runFingerprint
      || canonicalJson(record.intakeReceiptArtifact) !== canonicalJson(context.input.intakeEvidence.readinessReceipt)
      || canonicalJson(record.comparisonDataArtifact) !== canonicalJson(context.comparison.comparisonDataArtifact)
      || canonicalJson(record.source) !== canonicalJson(context.input.source)
      || Object.values(record.boundary).some(value => value !== false && value !== true)
      || record.boundary.completeJointDesign !== false || record.boundary.g2 !== false || record.boundary.g3 !== false
      || record.boundary.legalSignoff !== false || record.boundary.formalAttachmentApproval !== false
      || record.boundary.pagesPublication !== false || record.boundary.trustedProcessLaunchRequired !== true
      || record.boundary.gitAttributeFiltersAllowed !== false) fail('decision-receipt-binding');
  return record;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--internal-execute') return { internal: true };
  const options = { intakeWorkspace: '', input: '', outputWorkspace: '', executeProduction: false, sealG1: false, decision: '', json: false, internal: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      if (seen.has(token)) throw new RealCaseG1UsageError('--json 不得重複。');
      seen.add(token);
      options.json = true;
      continue;
    }
    if (!['--intake-workspace', '--input', '--output-workspace', '--execute-production', '--seal-g1', '--decision'].includes(token)) {
      throw new RealCaseG1UsageError(`不支援的參數：${token}`);
    }
    if (seen.has(token)) throw new RealCaseG1UsageError(`${token} 不得重複。`);
    seen.add(token);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new RealCaseG1UsageError(`${token} 需要值。`);
    index += 1;
    if (token === '--intake-workspace') options.intakeWorkspace = value;
    if (token === '--input') options.input = value;
    if (token === '--output-workspace') options.outputWorkspace = value;
    if (token === '--decision') options.decision = value;
    if (token === '--execute-production') {
      if (value !== 'yes') throw new RealCaseG1UsageError('--execute-production 只接受明確值 yes。');
      options.executeProduction = true;
    }
    if (token === '--seal-g1') {
      if (value !== 'yes') throw new RealCaseG1UsageError('--seal-g1 只接受明確值 yes。');
      options.sealG1 = true;
    }
  }
  if (options.executeProduction && options.sealG1) throw new RealCaseG1UsageError('production 執行與人工 G1 封印必須分兩次命令。');
  if (options.sealG1) {
    if (!options.outputWorkspace || !options.decision || options.intakeWorkspace || options.input) {
      throw new RealCaseG1UsageError('人工 G1 封印只接受 --output-workspace、--decision 與 --seal-g1 yes。');
    }
  } else {
    if (!options.intakeWorkspace || options.input !== FIXED_INTAKE_INPUT || options.decision) {
      throw new RealCaseG1UsageError(`收件檢查／production 執行需要 --intake-workspace 與 --input ${FIXED_INTAKE_INPUT}。`);
    }
    if (options.executeProduction !== Boolean(options.outputWorkspace)) {
      throw new RealCaseG1UsageError('只有 --execute-production yes 可同時指定全新 --output-workspace。');
    }
  }
  return options;
}

function usage() {
  return [
    `唯讀：node beam-column-moment-real-case-g1-runner.js --intake-workspace <repo 外已封工作區> --input ${FIXED_INTAKE_INPUT} [--json]`,
    `執行：上述參數另加 --output-workspace <repo 外全新且分離資料夾> --execute-production yes [--json]`,
    `人工 G1：node beam-column-moment-real-case-g1-runner.js --output-workspace <既有執行工作區> --decision ${DECISION_CANDIDATE_PATH} --seal-g1 yes [--json]`,
    'production 執行只產生比較與 review draft；必須另填人工 decision candidate 才能封印 G1。',
  ].join('\n');
}

function formatSummary(result) {
  return [
    `狀態：${result.status}`,
    `外部比較通過：${result.comparisonPassed ? '是' : '否'}`,
    `calculator executed：${result.calculatorExecuted ? '是' : '否'}`,
    `G1：${result.g1 ? '是' : '否'}；G2：否；G3：否`,
    `下一步：${result.nextAction}`,
  ].join('\n');
}

function runCli(argv) {
  const options = parseArgs(argv);
  if (options.internal) {
    const result = runInternalExecution();
    process.stdout.write(JSON.stringify(result));
    return { internal: true, result };
  }
  const result = options.sealG1
    ? sealG1(options.outputWorkspace, options.decision)
    : options.executeProduction
      ? executeProduction(options.intakeWorkspace, options.input, options.outputWorkspace)
      : assessExecutionReadiness(options.intakeWorkspace, options.input);
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${formatSummary(result)}\n`);
  return { internal: false, result };
}

function redactedError(error) {
  const value = String(error?.message || error || 'unknown-error');
  return value.replace(/[A-Za-z]:[\\/][^\r\n]*/gu, '<private-path>');
}

function main(argv = process.argv.slice(2)) {
  try {
    const outcome = runCli(argv);
    process.exitCode = outcome.internal || outcome.result.status !== 'comparison-failed-discrepancy-review-required' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${redactedError(error)}\n`);
    if (error instanceof RealCaseG1UsageError) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 3;
    } else process.exitCode = 2;
  }
}

module.exports = {
  FIXED_INTAKE_INPUT,
  INPUT_ARTIFACT_PATH,
  PRODUCTION_DATA_PATH,
  HUMAN_OUTPUT_PATH,
  COMPARISON_DATA_PATH,
  DECISION_TEMPLATE_PATH,
  DECISION_CANDIDATE_PATH,
  DECISION_RECEIPT_PATH,
  REVIEW_BUNDLE_PATH,
  G1_DRAFT_PATH,
  RUN_ID,
  COMPARISON_ID,
  DECISION_ID,
  GOVERNED_SOURCE_PATHS,
  RealCaseG1UsageError,
  RealCaseG1Error,
  referenceExpectedMetadata,
  validateExecutionSnapshot,
  sourceSnapshot,
  assessExecutionReadiness,
  executeProduction,
  decisionTemplate,
  validateManualDecision,
  validateRunInputShape,
  validateProductionShape,
  validateDecisionReceiptShape,
  verifyComparisonBindings,
  verifyBundleBindings,
  sealG1,
  parseArgs,
  usage,
  formatSummary,
  runCli,
  main,
};

if (require.main === module) main();
