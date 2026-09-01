'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const PILOT_PATH = __filename;
const BUNDLE_PATH = path.join(__dirname, 'engineering-qualification-case-bundle.js');
const CHECKER_PATH = path.join(__dirname, 'attachment-package-check.js');
const VERIFIER_PATH = path.join(__dirname, 'attachment-package-verify.js');
const HISTORY_PATH = path.join(__dirname, 'attachment-package-upgrade-history.js');
const COMPARISON_CONTRACT_PATH = path.join(__dirname, 'attachment-case-governance-portfolio-compare.js');
const CATALOG_PATH = path.join(__dirname, 'independent-engineering-benchmarks.catalog.json');
const BENCHMARK_RUNNER_PATH = path.join(__dirname, 'independent-engineering-benchmarks.js');
const PRODUCTION_ADAPTER = 'independent-engineering-adapters/steel-formal.js';
const PRODUCTION_ADAPTER_PATH = path.join(__dirname, ...PRODUCTION_ADAPTER.split('/'));
const PRODUCTION_CORE_PATH = path.join(REPOSITORY_ROOT, '鋼構工具', 'calculator.js');
const TOOL_METADATA_PATH = path.join(REPOSITORY_ROOT, '鋼構工具', 'tool-metadata.js');
const BENCHMARK_ID = 'steel-formal-strength';
const BENCHMARK_CASE_ID = 'momentPriorTestSmrfPass';
const RUN_ID = 'RUN-MOMENT-G1-001';
const COMPARISON_ID = 'CMP-MOMENT-G1-001';
const DECISION_ID = 'QD-MOMENT-G1-001';
const REGISTERED_ASSERTION_COUNT = 71;
const QUALIFIED_RESULT_ASSERTION_COUNT = 79;
const SOURCE_FIELD_COUNT = 88;
const REGISTERED_TOLERANCE_POLICY_SHA256 = 'e7a6e07ac9fa5d0906456a66d1b39653f707b63544acbf5b8be9860ec63dce1a';
const SUPPLEMENTAL_CLOSURE_KEYS = Object.freeze([
  'allMembersIncludedPass',
  'cns3506WeldPass',
  'endTabsPass',
  'governingAxialPass',
  'matchingWeldPass',
  'plasticZoneGeometryPass',
  'plasticZoneOpeningsPass',
  'thirdPartyReviewPass',
].sort());

const GOVERNED_SOURCE_PATHS = Object.freeze({
  pilot: { path: '結構工具箱/tools/beam-column-moment-g1-pilot.js', absolute: PILOT_PATH },
  caseBundle: { path: '結構工具箱/tools/engineering-qualification-case-bundle.js', absolute: BUNDLE_PATH },
  attachmentChecker: { path: '結構工具箱/tools/attachment-package-check.js', absolute: CHECKER_PATH },
  attachmentVerifier: { path: '結構工具箱/tools/attachment-package-verify.js', absolute: VERIFIER_PATH },
  history: { path: '結構工具箱/tools/attachment-package-upgrade-history.js', absolute: HISTORY_PATH },
  comparisonContract: { path: '結構工具箱/tools/attachment-case-governance-portfolio-compare.js', absolute: COMPARISON_CONTRACT_PATH },
  productionAdapter: { path: `結構工具箱/tools/${PRODUCTION_ADAPTER}`, absolute: PRODUCTION_ADAPTER_PATH },
  productionCore: { path: '鋼構工具/calculator.js', absolute: PRODUCTION_CORE_PATH },
  oracle: { path: '結構工具箱/tools/independent-engineering-benchmarks.js', absolute: BENCHMARK_RUNNER_PATH },
  catalog: { path: '結構工具箱/tools/independent-engineering-benchmarks.catalog.json', absolute: CATALOG_PATH },
  metadata: { path: '鋼構工具/tool-metadata.js', absolute: TOOL_METADATA_PATH },
});

class PilotUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PilotUsageError';
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const PROFILE = deepFreeze({
  schemaVersion: 2,
  kind: 'beam-column-moment-g1-pilot-profile.v2',
  benchmarkId: BENCHMARK_ID,
  benchmarkCaseId: BENCHMARK_CASE_ID,
  productionAdapter: PRODUCTION_ADAPTER,
  oracle: BENCHMARK_ID,
  sourceKind: 'synthetic',
  claimedLevel: 'G1',
  toolId: 'steel-connection-formal.beam_column_moment',
  toolName: '鋼構接頭正式規範核算工具／梁柱彎矩接頭',
  toolVersion: 'V1.3',
  sourceFieldCount: SOURCE_FIELD_COUNT,
  benchmarkAssertionCount: REGISTERED_ASSERTION_COUNT,
  registeredTolerancePolicySha256: REGISTERED_TOLERANCE_POLICY_SHA256,
  supplementalClosureKeys: SUPPLEMENTAL_CLOSURE_KEYS,
  qualifiedResultAssertionCount: QUALIFIED_RESULT_ASSERTION_COUNT,
  scope: {
    designMethod: 'LRFD',
    frameSystem: 'smrf',
    selectedAxis: 'x',
    connectionDesignRoute: 'reinforced',
    qualificationRoute: 'prior_test_similarity',
    selectedFramePlaneOnly: true,
    completeJointDesign: false,
    claimsAisc358Prequalification: false,
    orthogonalDirection: 'separate-review',
    requiresExternalHardwareCapacityEvidence: true,
    trustedProcessLaunchRequired: true,
    gitAttributeFiltersAllowed: false,
  },
  exclusions: [
    '不是真實案件，不支持 G2 指定案件適用性。',
    '不是已完成人工複核與內部採用的正式附件，不支持 G3。',
    '不宣稱 AISC 358 預認證，不是完整梁柱接頭設計。',
    '只涵蓋單一選定構架面；正交方向與未建模的力流另案檢核。',
    '同 repo 獨立閉式 oracle 可偵測程式漂移，不能排除共同條文誤讀。',
    '證據以前置程式碼未控制 parent process 為信任前提；任意本機 preload／假 Node／假 Git 屬外部威脅，不能由同一行程自我證明不存在。',
  ],
  realCaseIntake: {
    requiredToolFieldCount: SOURCE_FIELD_COUNT,
    criteriaPolicy: '數值容許差、控制分支、判定與超範圍處置必須在實案工具執行前固定。',
    independentReferencePolicy: '實案 G1 使用外部手算、獨立 Excel 或第三方軟體，不得呼叫 production core。',
    g2Responsibility: '由案件負責人綁定真實案號、來源證據、用途、限制、排除項、規範依據與 applicability。',
    g3Responsibility: '由案件負責人複核同一次 CF 的實際附件，並留存審閱與採用收據。',
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nextIso(previousMilliseconds = 0) {
  return Math.max(Date.now(), previousMilliseconds + 1);
}

function assertExactKeys(record, expected, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${label}-not-object`);
  const actual = Object.keys(record).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) throw new Error(`${label}-keys:${actual.join(',')}`);
}

function validatePublicOptions(options) {
  const candidate = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const unexpected = Object.keys(candidate).filter(key => !['caseId', 'caseLabel'].includes(key));
  if (unexpected.length) throw new PilotUsageError(`beam-column moment G1 pilot 不接受可注入選項：${unexpected.join('、')}。`);
  return candidate;
}

const FORBIDDEN_RUNTIME_ENVIRONMENT = Object.freeze([
  'NODE_OPTIONS', 'NODE_PATH',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_REPLACE_REF_BASE', 'GIT_NAMESPACE', 'GIT_SHALLOW_FILE',
  'GIT_ATTR_SOURCE', 'GIT_EXEC_PATH',
]);

function isForbiddenRuntimeEnvironment(name) {
  return FORBIDDEN_RUNTIME_ENVIRONMENT.includes(name) || /^GIT_CONFIG(?:_|$)/iu.test(name);
}

function assertTrustedRuntime() {
  const forbiddenExecArg = process.execArgv[0];
  const forbiddenEnvironment = Object.keys(process.env)
    .find(name => isForbiddenRuntimeEnvironment(name) && String(process.env[name] || '').trim());
  if (forbiddenExecArg || forbiddenEnvironment) {
    throw new Error(`beam-column-moment-g1-untrusted-runtime-injection:${forbiddenExecArg || forbiddenEnvironment}`);
  }
}

function sanitizedChildEnvironment() {
  const environment = { ...process.env };
  Object.keys(environment).filter(isForbiddenRuntimeEnvironment)
    .forEach(name => { delete environment[name]; });
  return environment;
}

function governedGit(args, options = {}) {
  const environment = sanitizedChildEnvironment();
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return execFileSync('git', [
    '--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    '-c', `core.attributesFile=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, '-C', REPOSITORY_ROOT, ...args,
  ], {
    encoding: options.encoding === null ? null : 'utf8', input: options.input,
    maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: environment,
  });
}

function normalizedGovernedSource(buffer, label) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) throw new Error(`beam-column-moment-g1-governed-source-not-utf8:${label}`);
  return Buffer.from(text.replace(/\r\n/gu, '\n'), 'utf8');
}

function repositoryGitDirectory() {
  const marker = path.join(REPOSITORY_ROOT, '.git');
  if (!fs.existsSync(marker)) throw new Error('beam-column-moment-g1-git-metadata-missing');
  const stat = fs.lstatSync(marker);
  if (stat.isSymbolicLink()) throw new Error('beam-column-moment-g1-git-metadata-symlink');
  if (stat.isDirectory()) return marker;
  if (!stat.isFile()) throw new Error('beam-column-moment-g1-git-metadata-invalid');
  const match = fs.readFileSync(marker, 'utf8').trim().match(/^gitdir:\s*(.+)$/iu);
  if (!match) throw new Error('beam-column-moment-g1-gitdir-pointer-invalid');
  const gitDirectory = path.resolve(REPOSITORY_ROOT, match[1]);
  if (!fs.existsSync(gitDirectory) || !fs.lstatSync(gitDirectory).isDirectory() || fs.lstatSync(gitDirectory).isSymbolicLink()) {
    throw new Error('beam-column-moment-g1-gitdir-target-invalid');
  }
  return gitDirectory;
}

function assertNoGitAttributeFilters() {
  const gitDirectory = repositoryGitDirectory();
  const commonDirectoryPointer = path.join(gitDirectory, 'commondir');
  let commonDirectory = gitDirectory;
  if (fs.existsSync(commonDirectoryPointer)) {
    const relativeCommonDirectory = fs.readFileSync(commonDirectoryPointer, 'utf8').trim();
    commonDirectory = path.resolve(gitDirectory, relativeCommonDirectory);
    if (!relativeCommonDirectory || !fs.existsSync(commonDirectory) || !fs.lstatSync(commonDirectory).isDirectory()
        || fs.lstatSync(commonDirectory).isSymbolicLink()) throw new Error('beam-column-moment-g1-git-common-dir-invalid');
  }
  const hasInfoAttributes = [...new Set([gitDirectory, commonDirectory])]
    .some(directory => fs.existsSync(path.join(directory, 'info', 'attributes')));
  if (hasInfoAttributes) throw new Error('beam-column-moment-g1-git-info-attributes-forbidden');
  const trackedOutput = governedGit(['ls-files', '-z', '--cached'], { encoding: null });
  const trackedText = trackedOutput.toString('utf8');
  if (!Buffer.from(trackedText, 'utf8').equals(trackedOutput)) throw new Error('beam-column-moment-g1-tracked-path-not-utf8');
  const directories = new Set([REPOSITORY_ROOT]);
  trackedText.split('\0').filter(Boolean).forEach(relativePath => {
    let directory = path.dirname(path.resolve(REPOSITORY_ROOT, ...relativePath.replace(/\\/gu, '/').split('/')));
    while (directory === REPOSITORY_ROOT || directory.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
      directories.add(directory);
      if (directory === REPOSITORY_ROOT) break;
      directory = path.dirname(directory);
    }
  });
  const attributesPath = [...directories].map(directory => path.join(directory, '.gitattributes')).find(fs.existsSync);
  if (attributesPath) throw new Error('beam-column-moment-g1-repository-gitattributes-forbidden');
}

function sourceSnapshot() {
  assertTrustedRuntime();
  const commit = governedGit(['rev-parse', 'HEAD']).trim().toLowerCase();
  assertNoGitAttributeFilters();
  const dirtyText = governedGit(['status', '--porcelain', '--untracked-files=all']).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('beam-column-moment-g1-source-commit-invalid');
  if (dirtyText) throw new Error('beam-column-moment-g1-requires-clean-immutable-source');
  const files = Object.fromEntries(Object.entries(GOVERNED_SOURCE_PATHS).map(([key, item]) => {
    if (!fs.existsSync(item.absolute) || !fs.lstatSync(item.absolute).isFile() || fs.lstatSync(item.absolute).isSymbolicLink()) {
      throw new Error(`beam-column-moment-g1-governed-source-invalid:${key}`);
    }
    const committedBlob = governedGit(['rev-parse', `HEAD:${item.path}`]).trim().toLowerCase();
    const committedContent = governedGit(['show', `HEAD:${item.path}`], { encoding: null });
    const physicalContent = normalizedGovernedSource(fs.readFileSync(item.absolute), key);
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(committedBlob)
        || sha256(physicalContent) !== sha256(committedContent)) {
      throw new Error(`beam-column-moment-g1-governed-source-not-at-head:${key}`);
    }
    return [key, {
      path: item.path,
      gitBlob: committedBlob,
      gitContentSha256: sha256(committedContent),
    }];
  }));
  return { commit, dirty: false, files };
}

function assertSameSource(left, right, label) {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`beam-column-moment-g1-source-changed:${label}`);
}

function readCatalogDefinition(expectedCatalogSha256) {
  const buffer = fs.readFileSync(CATALOG_PATH);
  if (sha256(normalizedGovernedSource(buffer, 'catalog-read')) !== expectedCatalogSha256) throw new Error('beam-column-moment-g1-catalog-changed-before-read');
  const catalog = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  const benchmark = catalog.benchmarks?.find(item => item.id === BENCHMARK_ID);
  if (!benchmark || benchmark.productionModule !== PRODUCTION_ADAPTER || benchmark.oracle !== BENCHMARK_ID) {
    throw new Error('beam-column-moment-g1-benchmark-route-drift');
  }
  const benchmarkCase = benchmark.input?.momentCases?.find(item => item.id === BENCHMARK_CASE_ID);
  if (!benchmarkCase) throw new Error(`beam-column-moment-g1-case-missing:${BENCHMARK_CASE_ID}`);
  const caseFields = Object.keys(benchmarkCase).filter(key => key !== 'id');
  if (caseFields.length !== SOURCE_FIELD_COUNT) throw new Error(`beam-column-moment-g1-source-field-count:${caseFields.length}`);
  const registeredAssertions = benchmark.assertions?.filter(item => item.path.startsWith(`${BENCHMARK_CASE_ID}.`)) || [];
  if (registeredAssertions.length !== REGISTERED_ASSERTION_COUNT) throw new Error(`beam-column-moment-g1-assertion-count:${registeredAssertions.length}`);
  if (registeredAssertions.some(item => !Number.isFinite(item.absTolerance) || item.absTolerance < 0)) throw new Error('beam-column-moment-g1-invalid-catalog-tolerance');
  const registeredTolerancePolicy = registeredAssertions.map(item => ({
    key: item.path.slice(`${BENCHMARK_CASE_ID}.`.length),
    toleranceMode: item.absTolerance === 0 ? 'exact' : 'absolute',
    absoluteTolerance: item.absTolerance,
    relativeTolerance: 0,
  })).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const registeredTolerancePolicySha256 = sha256(Buffer.from(canonicalJson(registeredTolerancePolicy), 'utf8'));
  if (registeredTolerancePolicySha256 !== REGISTERED_TOLERANCE_POLICY_SHA256) throw new Error('beam-column-moment-g1-registered-tolerance-policy-drift');
  return { catalog, benchmark, benchmarkCase, caseFields, registeredAssertions, registeredTolerancePolicySha256 };
}

function runtimeProfile(caseFields) {
  return { ...clone(PROFILE), realCaseIntake: { ...clone(PROFILE.realCaseIntake), requiredToolFields: [...caseFields] } };
}

function realCaseIntakeTemplate(caseFields) {
  return {
    schemaVersion: 1,
    kind: 'beam-column-moment-real-case-intake.v1',
    status: 'candidate-unvalidated',
    boundary: {
      sourceKind: 'real-case',
      calculatorExecuted: false,
      engineeringResultsCompared: false,
      g1: false,
      g2: false,
      g3: false,
      completeJointDesign: false,
      legalSignoff: false,
      formalAttachmentApproval: false,
      pagesPublication: false,
    },
    caseIdentity: {
      externalCaseId: '', caseSourceArtifactFile: '', projectName: '', projectNo: '', designer: '', intendedUse: '', permissibleUse: '', limitations: [], exclusions: [], governingStandards: [],
    },
    criteria: {
      definedAt: '', numericToleranceBasis: '', controlBranchExpected: '', decisionExpected: '', outOfScopeExpected: '', applicabilityExpected: '',
    },
    toolInput: Object.fromEntries(caseFields.map(field => [field, null])),
    independentReference: {
      independentFromProductionCore: true, method: '', author: '', reviewer: '', createdAt: '', basis: '', artifactFile: '', machineDataFile: '',
    },
    requiredHumanActions: [PROFILE.realCaseIntake.g2Responsibility, PROFILE.realCaseIntake.g3Responsibility],
  };
}

function runInternalExecution() {
  const before = sourceSnapshot();
  const definition = readCatalogDefinition(before.files.catalog.gitContentSha256);
  const BenchmarkRunner = require(BENCHMARK_RUNNER_PATH);
  const ProductionAdapter = require(PRODUCTION_ADAPTER_PATH);
  delete globalThis.SteelToolMetadata;
  delete require.cache[require.resolve(TOOL_METADATA_PATH)];
  require(TOOL_METADATA_PATH);
  const toolMetadata = globalThis.SteelToolMetadata?.connection;
  const catalogIssues = BenchmarkRunner.validateCatalog(definition.catalog);
  if (catalogIssues.length) throw new Error(`beam-column-moment-g1-catalog-invalid:${catalogIssues.join('|')}`);
  if (!toolMetadata || toolMetadata.id !== 'steel-connection-formal' || toolMetadata.version !== PROFILE.toolVersion
      || toolMetadata.modules?.beamColumnMoment?.completeJointDesign !== false) throw new Error('beam-column-moment-g1-tool-metadata-drift');
  if (ProductionAdapter.calculate === BenchmarkRunner.ORACLES[PROFILE.oracle]) throw new Error('beam-column-moment-g1-independent-calculators-required');
  const productionInvocation = clone(definition.benchmark.input);
  const validationIssues = ProductionAdapter.validateInput(productionInvocation);
  if (validationIssues.length) throw new Error(`beam-column-moment-g1-production-input-invalid:${validationIssues.join('|')}`);
  const productionAll = ProductionAdapter.calculate(productionInvocation);
  const oracleAll = BenchmarkRunner.ORACLES[PROFILE.oracle](clone(definition.benchmark.input));
  const productionResult = productionAll?.[BENCHMARK_CASE_ID];
  const oracleResult = oracleAll?.[BENCHMARK_CASE_ID];
  if (!productionResult || !oracleResult) throw new Error('beam-column-moment-g1-selected-result-missing');
  const after = sourceSnapshot();
  assertSameSource(before, after, 'internal-execution');
  return {
    schemaVersion: 1,
    kind: 'beam-column-moment-g1-internal-execution-envelope.v1',
    sourceBefore: before,
    sourceAfter: after,
    benchmarkInput: clone(definition.benchmark.input),
    benchmarkCase: clone(definition.benchmarkCase),
    registeredAssertions: clone(definition.registeredAssertions),
    toolVersion: toolMetadata.version,
    productionResult,
    oracleResult,
  };
}

function executeGovernedCalculators(expectedSource) {
  const child = spawnSync(process.execPath, [PILOT_PATH, '--internal-execute'], {
    cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    env: sanitizedChildEnvironment(),
  });
  if (child.status !== 0) throw new Error(`beam-column-moment-g1-internal-execution-failed:${(child.stderr || child.stdout || '').trim()}`);
  let envelope;
  try { envelope = JSON.parse(child.stdout); } catch (error) { throw new Error(`beam-column-moment-g1-internal-envelope-invalid:${error.message}`); }
  assertExactKeys(envelope, [
    'schemaVersion', 'kind', 'sourceBefore', 'sourceAfter', 'benchmarkInput', 'benchmarkCase',
    'registeredAssertions', 'toolVersion', 'productionResult', 'oracleResult',
  ], 'beam-column-moment-g1-internal-envelope');
  if (envelope.schemaVersion !== 1 || envelope.kind !== 'beam-column-moment-g1-internal-execution-envelope.v1'
      || envelope.toolVersion !== PROFILE.toolVersion) throw new Error('beam-column-moment-g1-internal-envelope-route-drift');
  assertSameSource(expectedSource, envelope.sourceBefore, 'parent-to-child');
  assertSameSource(envelope.sourceBefore, envelope.sourceAfter, 'child-before-after');
  return envelope;
}

function evidence(workspace, relativePath, content) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`beam-column-moment-g1-unsafe-evidence-path:${relativePath}`);
  const root = path.resolve(workspace);
  const target = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`beam-column-moment-g1-evidence-outside-workspace:${relativePath}`);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer, { flag: 'wx' });
  return { file: normalized, bytes: buffer.length, sha256: sha256(buffer) };
}

function unitFor(key) {
  if (['Mp', 'Mpr', 'MprFar', 'MuFace', 'continuityThreshold'].includes(key)) return 'kN-m';
  if (['Vp', 'VuRequired', 'VpzMin', 'VpzRequired', 'VpzNominal', 'VpzAvailable'].includes(key)) return 'kN';
  if (key === 'panelThicknessRequired') return 'mm';
  if (['rotationDemand', 'qualifiedRotation'].includes(key)) return 'rad';
  if (key.endsWith('Count') || key === 'sourceFieldCount' || key === 'checkCount') return 'count';
  if (key.endsWith('Pass') || ['continuityRequired', 'validationFailure', 'complianceReady', 'completeJointDesign', 'passes'].includes(key)) return 'flag';
  return '-';
}

function textAssertion(assertionId, label, type, expectedPointer, actualPointer, expectedText, actualText) {
  return {
    assertionId, label, type, unit: '', expectedNumber: null, actualNumber: null, expectedText, actualText,
    expectedPointer, actualPointer, toleranceMode: 'exact', absoluteTolerance: 0, relativeTolerance: 0,
  };
}

function branchValue(input, result) {
  if (!['frameSystemPass', 'axisPass', 'designRoutePass', 'qualificationRoutePass'].every(key => result?.[key] === 1)) return 'blocked-control-branch';
  return [input.momentFrameSystem, input.momentAxis, input.momentConnectionDesignRoute, input.momentQualificationRoute, 'six-strength-checks'].join('|');
}

function closeEnough(actual, expected, tolerance) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function verifyGovernedOutcome(definition, productionResult, oracleResult) {
  const productionKeys = Object.keys(productionResult).sort();
  const oracleKeys = Object.keys(oracleResult).sort();
  if (productionKeys.length !== QUALIFIED_RESULT_ASSERTION_COUNT || JSON.stringify(productionKeys) !== JSON.stringify(oracleKeys)) {
    throw new Error(`beam-column-moment-g1-result-keyset:${productionKeys.length}/${oracleKeys.length}`);
  }
  const registeredKeys = definition.registeredAssertions.map(item => item.path.slice(`${BENCHMARK_CASE_ID}.`.length));
  const supplementalKeys = productionKeys.filter(key => !registeredKeys.includes(key)).sort();
  if (JSON.stringify(supplementalKeys) !== JSON.stringify(SUPPLEMENTAL_CLOSURE_KEYS)) throw new Error(`beam-column-moment-g1-supplemental-closure-drift:${supplementalKeys.join(',')}`);
  definition.registeredAssertions.forEach(item => {
    const key = item.path.slice(`${BENCHMARK_CASE_ID}.`.length);
    if (!closeEnough(productionResult[key], oracleResult[key], item.absTolerance)) throw new Error(`beam-column-moment-g1-registered-benchmark-mismatch:${key}`);
  });
  SUPPLEMENTAL_CLOSURE_KEYS.forEach(key => {
    if (productionResult[key] !== oracleResult[key]) throw new Error(`beam-column-moment-g1-closure-mismatch:${key}`);
  });
  const failedPass = productionKeys.filter(key => key.endsWith('Pass')).find(key => productionResult[key] !== 1 || oracleResult[key] !== 1);
  if (failedPass || productionResult.strengthPass !== 1 || oracleResult.strengthPass !== 1
      || productionResult.detailPass !== 1 || oracleResult.detailPass !== 1
      || productionResult.passes !== 1 || oracleResult.passes !== 1
      || productionResult.complianceReady !== 1 || oracleResult.complianceReady !== 1
      || productionResult.validationFailure !== 0 || oracleResult.validationFailure !== 0
      || productionResult.completeJointDesign !== 0 || oracleResult.completeJointDesign !== 0) {
    throw new Error(`beam-column-moment-g1-positive-case-boundary-failed:${failedPass || 'summary'}`);
  }
}

function createAssertions(definition, productionResult, oracleResult) {
  const assertions = definition.registeredAssertions.map((item, index) => {
    const key = item.path.slice(`${BENCHMARK_CASE_ID}.`.length);
    return {
      assertionId: `A-N-${String(index + 1).padStart(3, '0')}`, label: `registered benchmark: ${key}`, type: 'numeric', unit: unitFor(key),
      expectedNumber: oracleResult[key], actualNumber: productionResult[key], expectedText: '', actualText: '',
      expectedPointer: `/results/${key}`, actualPointer: `/results/${key}`,
      toleranceMode: item.absTolerance === 0 ? 'exact' : 'absolute', absoluteTolerance: item.absTolerance, relativeTolerance: 0,
    };
  });
  SUPPLEMENTAL_CLOSURE_KEYS.forEach((key, index) => {
    assertions.push({
      assertionId: `A-X-${String(index + 1).padStart(2, '0')}`, label: `supplemental closure gate: ${key}`, type: 'numeric', unit: unitFor(key),
      expectedNumber: oracleResult[key], actualNumber: productionResult[key], expectedText: '', actualText: '',
      expectedPointer: `/results/${key}`, actualPointer: `/results/${key}`,
      toleranceMode: 'exact', absoluteTolerance: 0, relativeTolerance: 0,
    });
  });
  assertions.push(textAssertion('A-CONTROL-BRANCH', '登錄控制分支：SMRF／x 軸／補強式／先前試驗相似性', 'control-branch', '/comparison/controlBranch', '/comparison/controlBranch', branchValue(definition.benchmarkCase, oracleResult), branchValue(definition.benchmarkCase, productionResult)));
  assertions.push(textAssertion('A-DECISION', '本次 synthetic benchmark 工程判定', 'decision', '/comparison/decision', '/comparison/decision', 'pass', 'pass'));
  assertions.push(textAssertion('A-OUT-OF-SCOPE', '未完成完整梁柱接頭設計之超範圍處置', 'out-of-scope', '/comparison/outOfScope', '/comparison/outOfScope', 'warning', 'warning'));
  return assertions;
}

function referenceMarkdown(calculationFingerprint, runFingerprint, input, result, sources) {
  return [
    '# 梁柱彎矩接頭 synthetic G1 獨立閉式基準', '',
    `- 計算指紋：${calculationFingerprint}`, `- 執行指紋：${runFingerprint}`,
    `- benchmark：${PROFILE.benchmarkId} / ${PROFILE.benchmarkCaseId}`, `- oracle：${PROFILE.oracle}`,
    `- oracle Git content SHA-256：${sources.files.oracle.gitContentSha256}`,
    '- 獨立性：本 oracle 未呼叫 production calculator，也未讀取 golden expected。',
    '- 限制：公式實作仍與 production 位於同一 repo，可抓程式漂移，不能排除共同條文誤讀。', '',
    '## 關鍵輸入與獨立結果', '',
    `- 構架系統／選定軸：${input.momentFrameSystem} / ${input.momentAxis}`,
    `- Mpr / Mpr,far：${result.Mpr} / ${result.MprFar} kN-m`, `- Vp：${result.Vp} kN`,
    `- Mu,face：${result.MuFace} kN-m`, `- Vpz,required / available：${result.VpzRequired} / ${result.VpzAvailable} kN`,
    `- SCWB CW / CCW：${result.scwbCw} / ${result.scwbCcw}`, `- completeJointDesign：${result.completeJointDesign}`, '',
    '## 證據層級邊界', '', '- 這是 synthetic G1 的程式漂移檢查，不是真實案件。',
    '- 未建立 G2 案件適用性，也未建立 G3 附件人工複核與內部採用。',
    '- G2=false；G3=false。',
    '- completeJointDesign=false；不宣稱 AISC 358 預認證，正交方向與外部五金容量證據另案負責。', '',
    `- source commit：${sources.commit}`,
    '- trustedProcessLaunchRequired=true；本紀錄不自證 parent process 未遭前置程式碼控制。',
    '- gitAttributeFiltersAllowed=false；來源檢查不接受 repository 或 info attributes。', '',
  ].join('\n');
}

function humanOutputHtml(calculationFingerprint, productionResult, source) {
  const rows = [
    ['Mp', productionResult.Mp, 'kN-m'], ['Mpr', productionResult.Mpr, 'kN-m'], ['Mpr,far', productionResult.MprFar, 'kN-m'],
    ['Vp', productionResult.Vp, 'kN'], ['Mu,face', productionResult.MuFace, 'kN-m'],
    ['Vpz required / available', `${productionResult.VpzRequired} / ${productionResult.VpzAvailable}`, 'kN'],
    ['SCWB CW / CCW', `${productionResult.scwbCw} / ${productionResult.scwbCcw}`, '-'],
  ].map(([label, value, unit]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td><td>${htmlEscape(unit)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>梁柱彎矩接頭 synthetic G1 dry-run</title>
<style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;max-width:900px;margin:32px auto;line-height:1.55}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:6px;text-align:left}.warning{border:2px solid #9b2c2c;background:#fff5f5;padding:12px}code,pre{font-family:Consolas,monospace}</style></head>
<body><h1>梁柱彎矩接頭 synthetic G1 dry-run</h1>
<div class="warning"><strong>非實案／非簽證／非正式附件採用。</strong><br>本頁只證明登錄 MC-G1 本次 production 與同 repo 獨立閉式 oracle 一致。</div>
<p>計算指紋：<code>${calculationFingerprint}</code></p>
<p>工具：${htmlEscape(PROFILE.toolName)} ${htmlEscape(PROFILE.toolVersion)}；source commit：<code>${htmlEscape(source.commit)}</code>；source dirty：false</p>
<table><thead><tr><th>項目</th><th>結果</th><th>單位</th></tr></thead><tbody>${rows}</tbody></table>
<h2>判定與邊界</h2><p>synthetic G1 comparison decision: <strong>PASS</strong></p>
<pre>completeJointDesign=false
claimsAisc358Prequalification=false
selectedFramePlaneOnly=true
orthogonalDirection=separate-review
trustedProcessLaunchRequired=true
gitAttributeFiltersAllowed=false
G2=false
G3=false</pre>
</body></html>\n`;
}

function createSyntheticG1Workspace(workspace, rawOptions = {}) {
  const options = validatePublicOptions(rawOptions);
  const caseId = String(options.caseId || '').trim();
  if (!caseId) throw new PilotUsageError('beam-column moment G1 pilot 需要 case-id。');
  if (!workspace) throw new PilotUsageError('beam-column moment G1 pilot 需要新的 private workspace。');
  const caseLabel = String(options.caseLabel || `梁柱彎矩接頭 synthetic G1／${caseId}`).trim();
  const root = path.resolve(workspace);
  const sourceBefore = sourceSnapshot();
  const definition = readCatalogDefinition(sourceBefore.files.catalog.gitContentSha256);
  const Bundle = require(BUNDLE_PATH);
  Bundle.requirePrivateWorkspaceLocation(root, 'beam-column moment G1 pilot workspace');

  let stamp = nextIso();
  const createdAt = new Date(stamp).toISOString();
  Bundle.initWorkspace(root, { caseId, caseLabel, sourceKind: PROFILE.sourceKind, createdAt });
  stamp = nextIso(stamp);
  const criteriaDefinedAt = new Date(stamp).toISOString();
  const criteria = {
    definedAt: criteriaDefinedAt,
    registeredAssertionCount: REGISTERED_ASSERTION_COUNT,
    registeredTolerancePolicySha256: definition.registeredTolerancePolicySha256,
    supplementalClosureKeys: [...SUPPLEMENTAL_CLOSURE_KEYS],
    qualifiedResultAssertionCount: QUALIFIED_RESULT_ASSERTION_COUNT,
    numericPolicy: 'catalog-tolerance-plus-exact-closure',
    controlBranchExpected: 'smrf|x|reinforced|prior_test_similarity|six-strength-checks',
    decisionExpected: 'pass',
    outOfScopeExpected: 'warning',
  };
  const invocationPayload = {
    schemaVersion: 1, kind: 'beam-column-moment-g1-pilot-input.v1', benchmarkId: PROFILE.benchmarkId,
    benchmarkCaseId: PROFILE.benchmarkCaseId, input: clone(definition.benchmarkCase),
    fullBenchmarkInput: clone(definition.benchmark.input), source: sourceBefore, boundary: clone(PROFILE.scope), criteria,
  };

  // The criteria-bearing input is physically written before either calculator executes.
  const inputArtifact = evidence(root, 'inputs/momentPriorTestSmrfPass.input.json', jsonText(invocationPayload));
  const profileArtifact = evidence(root, 'references/qualification-profile.json', jsonText(runtimeProfile(definition.caseFields)));
  const intakeTemplateArtifact = evidence(root, 'inputs/real-case-intake.template.json', jsonText(realCaseIntakeTemplate(definition.caseFields)));
  const envelope = executeGovernedCalculators(sourceBefore);
  if (canonicalJson(envelope.benchmarkInput) !== canonicalJson(definition.benchmark.input)
      || canonicalJson(envelope.benchmarkCase) !== canonicalJson(definition.benchmarkCase)
      || canonicalJson(envelope.registeredAssertions) !== canonicalJson(definition.registeredAssertions)) throw new Error('beam-column-moment-g1-parent-child-catalog-drift');
  const productionResult = envelope.productionResult;
  const oracleResult = envelope.oracleResult;
  verifyGovernedOutcome(definition, productionResult, oracleResult);
  assertSameSource(sourceBefore, sourceSnapshot(), 'after-calculators');
  stamp = nextIso(stamp);
  const executedAt = new Date(stamp).toISOString();
  const calculationFingerprint = `CF-${sha256(Buffer.from(canonicalJson({ invocation: invocationPayload, productionResult }), 'utf8')).slice(0, 16).toUpperCase()}`;
  const productionData = {
    schemaVersion: 1, kind: 'beam-column-moment-production-result.v1', benchmarkId: PROFILE.benchmarkId,
    benchmarkCaseId: PROFILE.benchmarkCaseId, productionAdapter: PROFILE.productionAdapter, calculationFingerprint,
    result: productionResult, results: productionResult,
    comparison: { controlBranch: branchValue(definition.benchmarkCase, productionResult), decision: 'pass', outOfScope: 'warning' },
  };
  const resultDataArtifact = evidence(root, 'outputs/momentPriorTestSmrfPass.production.json', jsonText(productionData));
  const outputArtifact = evidence(root, 'outputs/momentPriorTestSmrfPass.synthetic-g1.html', humanOutputHtml(calculationFingerprint, productionResult, sourceBefore));
  const run = {
    runId: RUN_ID, toolId: PROFILE.toolId, toolName: PROFILE.toolName, toolVersion: PROFILE.toolVersion,
    engineVersion: `calculator.js-git-sha256-${sourceBefore.files.productionCore.gitContentSha256.slice(0, 16)}`, executedAt,
    calculationFingerprint, runFingerprint: '', inputArtifact, resultDataArtifact, outputArtifact,
    state: 'current', staleReasons: [], supersedesRunId: '',
  };
  run.runFingerprint = Bundle.qualificationRunFingerprint(run);

  stamp = nextIso(stamp);
  const referenceCreatedAt = new Date(stamp).toISOString();
  const referenceData = {
    schemaVersion: 1, kind: 'beam-column-moment-independent-reference.v1', benchmarkId: PROFILE.benchmarkId,
    benchmarkCaseId: PROFILE.benchmarkCaseId, oracle: PROFILE.oracle, independentFromProductionCore: true,
    calculationFingerprint, runFingerprint: run.runFingerprint, result: oracleResult, results: oracleResult,
    comparison: { controlBranch: branchValue(definition.benchmarkCase, oracleResult), decision: 'pass', outOfScope: 'warning' },
  };
  const referenceArtifact = evidence(root, 'references/momentPriorTestSmrfPass.closed-form.md', referenceMarkdown(calculationFingerprint, run.runFingerprint, definition.benchmarkCase, oracleResult, sourceBefore));
  const referenceDataArtifact = evidence(root, 'references/momentPriorTestSmrfPass.closed-form.json', jsonText(referenceData));
  const assertions = createAssertions(definition, productionResult, oracleResult);
  stamp = nextIso(stamp);
  const comparedAt = new Date(stamp).toISOString();
  const comparisonDataArtifact = evidence(root, `references/${COMPARISON_ID}.comparison-data.json`, jsonText({
    schemaVersion: 2, kind: Bundle.COMPARISON_DATA_KIND_V2, comparisonId: COMPARISON_ID, runId: RUN_ID,
    calculationFingerprint, runFingerprint: run.runFingerprint, criteriaDefinedAt, inputArtifactSha256: inputArtifact.sha256,
    productionOutputSha256: outputArtifact.sha256, productionResultDataSha256: resultDataArtifact.sha256,
    referenceArtifactSha256: referenceArtifact.sha256, referenceDataArtifactSha256: referenceDataArtifact.sha256, assertions,
  }));

  const decisionBasis = '本次 synthetic MC-G1 之 71 項登錄斷言與 8 個補充閉合 gate、控制分支、工程判定及 completeJointDesign=false 超範圍警示全數通過；可信 parent process／Node／Git 執行檔為外部前提，gitAttributeFiltersAllowed=false；不支持 G2、G3 或簽證。';
  stamp = nextIso(stamp);
  const decidedAt = new Date(stamp).toISOString();
  const decisionReceipt = evidence(root, `references/${DECISION_ID}.receipt.json`, jsonText({
    schemaVersion: 2, kind: 'engineering-qualification-g1-decision-receipt.v2', decisionId: DECISION_ID, runId: RUN_ID,
    comparisonIds: [COMPARISON_ID], claimedLevel: PROFILE.claimedLevel, basedOnDecisionId: '',
    reviewer: 'automated benchmark comparator (unsigned)', basis: decisionBasis, decidedAt, decision: 'pass',
    sourceKind: PROFILE.sourceKind, calculationFingerprint, runFingerprint: run.runFingerprint,
    comparisonBindings: [{ comparisonId: COMPARISON_ID, comparisonDataArtifact }], source: sourceBefore,
    supportingWorkspaceFiles: { qualificationProfile: profileArtifact, realCaseIntakeTemplate: intakeTemplateArtifact },
    boundary: {
      completeJointDesign: false, g2: false, g3: false, legalSignoff: false,
      trustedProcessLaunchRequired: true, gitAttributeFiltersAllowed: false,
    },
  }));

  const record = Bundle.readStrictJsonFile(path.join(root, 'case-bundle.draft.json'), '初始 synthetic G1 案件包').record;
  record.calculationRuns = [run];
  record.independentComparisons = [{
    comparisonId: COMPARISON_ID, runId: RUN_ID, comparedAt, criteriaDefinedAt, referenceMethod: 'closed-form-oracle',
    independentFromProductionCore: true, referenceArtifact, referenceDataArtifact,
    referenceAuthor: 'independent-engineering-benchmarks.js::steel-formal-strength oracle',
    referenceReviewer: 'automated benchmark comparator (unsigned)', referenceCreatedAt,
    referenceBasis: '同 repo 另一份獨立閉式公式實作，未呼叫 production calculator，也未讀取 golden expected；本 synthetic G1 只能偵測登錄 MC-G1 的程式漂移，不能排除共同條文誤讀。',
    comparisonDataArtifact, assertions,
  }];
  record.discrepancies = [];
  record.artifactReviews = [];
  record.qualificationDecisions = [{
    decisionId: DECISION_ID, runId: RUN_ID, comparisonIds: [COMPARISON_ID], claimedLevel: 'G1', basedOnDecisionId: '',
    reviewer: 'automated benchmark comparator (unsigned)', basis: decisionBasis, decidedAt, decisionReceipt,
  }];
  record.formalAdoptions = [];
  record.updatedAt = decidedAt;
  record.bundleFingerprint = Bundle.bundleFingerprint(record);
  const validation = Bundle.validateBundle(record, { baseDirectory: root });
  if (validation.status !== 'review' || validation.highestLevel !== 'G1'
      || validation.minimumCurrentLevel !== 'G1' || validation.evidenceVerified !== true) throw new Error(`beam-column-moment-g1-draft-validation-failed:${JSON.stringify(validation)}`);
  const draftPath = path.join(root, 'case-bundle.g1.draft.json');
  fs.writeFileSync(draftPath, jsonText(record), { encoding: 'utf8', flag: 'wx' });
  const sealed = Bundle.sealBundle(draftPath, { sealedAt: new Date(nextIso(stamp)).toISOString() });
  const sealedPath = path.join(root, sealed.outputFileName);
  const inspection = Bundle.inspectBundleFile(sealedPath);
  if (inspection.status !== 'ready' || inspection.qualificationStatus !== 'G1'
      || inspection.highestLevel !== 'G1' || inspection.evidenceVerified !== true) throw new Error(`beam-column-moment-g1-sealed-validation-failed:${JSON.stringify(inspection)}`);
  try { assertSameSource(sourceBefore, sourceSnapshot(), 'after-seal'); } catch (error) { fs.rmSync(sealedPath, { force: true }); throw error; }
  return {
    ...inspection, kind: 'beam-column-moment-g1-pilot-result.v2', workspaceName: path.basename(root), draftFileName: path.basename(draftPath), outputFileName: sealed.outputFileName,
    calculationFingerprint, runFingerprint: run.runFingerprint, benchmarkId: PROFILE.benchmarkId,
    benchmarkCaseId: PROFILE.benchmarkCaseId, sourceCommit: sourceBefore.commit, sourceDirty: false,
    evidenceBoundary: 'synthetic-G1-only-no-G2-no-G3-no-legal-signoff',
  };
}

function parseArgs(argv) {
  const options = { workspace: '', caseId: '', caseLabel: '', json: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      if (seen.has(token)) throw new PilotUsageError('參數 --json 不得重複。');
      seen.add(token); options.json = true; continue;
    }
    if (!['--workspace', '--case-id', '--case-label'].includes(token)) throw new PilotUsageError(`不支援的參數：${token}`);
    if (seen.has(token)) throw new PilotUsageError(`參數 ${token} 不得重複。`);
    seen.add(token);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new PilotUsageError(`參數 ${token} 需要值。`);
    if (token === '--workspace') options.workspace = value;
    else if (token === '--case-id') options.caseId = value;
    else options.caseLabel = value;
  }
  if (!options.workspace || !options.caseId) throw new PilotUsageError('beam-column moment G1 pilot 需要 --workspace 與 --case-id 參數。');
  return options;
}

function usage() {
  return [
    '建立 production-backed synthetic G1：',
    'node beam-column-moment-g1-pilot.js --workspace <repo 外新資料夾> --case-id <穩定 ID> [--case-label <顯示名稱>] [--json]',
    '固定只產生 synthetic G1；只接受乾淨 Git 與可信 parent process；不建立 G2、G3、完整接頭設計或法定簽證。',
  ].join('\n');
}

function runCli(argv) {
  const args = parseArgs(argv);
  const result = createSyntheticG1Workspace(args.workspace, { caseId: args.caseId, caseLabel: args.caseLabel });
  if (args.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write([
    '梁柱彎矩接頭 production-backed synthetic G1 已封印', `案件包檔名：${result.outputFileName}`,
    `計算指紋：${result.calculationFingerprint}`, `執行指紋：${result.runFingerprint}`,
    `證據層級：${result.qualificationStatus}`, '邊界：非實案、無 G2/G3、completeJointDesign=false、非法定簽證；可信 parent process 為外部前提。',
  ].join('\n') + '\n');
  return result;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--internal-execute') {
    try { process.stdout.write(`${JSON.stringify(runInternalExecution())}\n`); process.exitCode = 0; }
    catch (error) { process.stderr.write(`${error.message || error}\n`); process.exitCode = 2; }
    return;
  }
  try { runCli(argv); process.exitCode = 0; }
  catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    if (error instanceof PilotUsageError) { process.stderr.write(`${usage()}\n`); process.exitCode = 3; }
    else process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  PROFILE,
  REPOSITORY_ROOT,
  CATALOG_PATH,
  PRODUCTION_ADAPTER_PATH,
  SUPPLEMENTAL_CLOSURE_KEYS,
  PilotUsageError,
  realCaseIntakeTemplate,
  createSyntheticG1Workspace,
  parseArgs,
  usage,
  runCli,
  main,
};
