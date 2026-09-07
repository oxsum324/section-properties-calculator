'use strict';

const crypto = require('node:crypto');

const REAL_TOOL_ID = 'steel-connection-formal.beam_column_moment';
const REAL_PROFILE_ID = 'beam-column-moment-real-case-g1.v1';
const REFERENCE_KIND = 'beam-column-moment-real-case-independent-reference.v1';
const INPUT_KIND = 'beam-column-moment-real-case-g1-input.v1';
const PRODUCTION_KIND = 'beam-column-moment-real-case-production-result.v1';
const DECISION_CANDIDATE_KIND = 'beam-column-moment-real-case-g1-decision-candidate.v1';
const DECISION_RECEIPT_KIND = 'beam-column-moment-real-case-g1-decision-receipt.v1';
const CLI_RESULT_KIND = 'beam-column-moment-real-case-g1-result.v1';

const RESULT_KEYS = Object.freeze([
  'Mp', 'Mpr', 'MprFar', 'MuFace', 'Vp', 'VpzAvailable', 'VpzMin', 'VpzNominal', 'VpzRequired', 'VuRequired',
  'allMembersIncludedPass', 'axisPass', 'beamFlangeCompactnessPass', 'beamFlangePlasticModulusPass',
  'beamLateralBracingPass', 'beamWebCompactnessPass', 'capacityBasisPass', 'capacityEvidenceShaPass',
  'checkCount', 'cns3506WeldPass', 'completeJointDesign', 'complianceReady', 'continuityPlateRequirementPass',
  'continuityPlateWeldPass', 'continuityRequired', 'continuityThreshold', 'demandBasisPass', 'designRoutePass',
  'detailPass', 'doublerAttachmentPass', 'endTabsPass', 'expectedStrengthFactorPass', 'farCriticalMomentPass',
  'flexuralRatio', 'frameSystemPass', 'geometryBasisPass', 'governingAxialPass', 'hardwareVerifiedPass',
  'jointLateralRestraintPass', 'lrfdPass', 'matchingWeldPass', 'materialBasisPass', 'opposingDirectionsPass',
  'orthogonalSeparatePass', 'panelThicknessRequired', 'panelZoneBasisPass', 'panelZoneRatio',
  'panelZoneThicknessPass', 'passes', 'plasticZoneGeometryPass', 'plasticZoneOpeningsPass',
  'qualificationBasisPass', 'qualificationConfigurationPass', 'qualificationEvidenceShaPass',
  'qualificationFabricationPass', 'qualificationGeometryPass', 'qualificationMaterialPass',
  'qualificationPlasticRatioSimilarityPass', 'qualificationProcedurePass', 'qualificationRoutePass',
  'qualificationTestCountPass', 'qualificationThicknessSimilarityPass', 'qualificationWeldingPass',
  'qualifiedRotation', 'rotationDemand', 'rotationRatio', 'scwbCcw', 'scwbCcwRatio', 'scwbCw', 'scwbCwRatio',
  'seismicMaterialPass', 'selectedAxisScopePass', 'shearRatio', 'sourceFieldCount', 'strengthPass',
  'strongColumnBasisPass', 'thirdPartyReviewPass', 'validationFailure', 'weldProcedurePass',
].sort());

const FLAG_KEYS = Object.freeze(RESULT_KEYS.filter(key => key.endsWith('Pass') || [
  'continuityRequired', 'validationFailure', 'complianceReady', 'completeJointDesign', 'passes',
].includes(key)));
const EXACT_TOLERANCE_KEYS = Object.freeze([...new Set([
  ...FLAG_KEYS, 'sourceFieldCount', 'checkCount',
])].sort());
const REFERENCE_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'externalCaseId', 'caseIdentitySha256', 'criteriaSha256', 'toolInputSha256',
  'caseSourceArtifactSha256', 'humanArtifactSha256', 'resultSchemaSha256', 'independentFromProductionCore',
  'method', 'author', 'reviewer', 'createdAt', 'basis', 'results', 'tolerances', 'comparison',
]);
const REFERENCE_EXPECTED_METADATA_FIELDS = Object.freeze([
  'externalCaseId', 'caseIdentitySha256', 'criteriaSha256', 'toolInputSha256', 'caseSourceArtifactSha256',
  'humanArtifactSha256', 'method', 'author', 'reviewer', 'createdAt', 'basis', 'comparison',
]);
const TOLERANCE_FIELDS = Object.freeze(['mode', 'absoluteTolerance', 'relativeTolerance']);
const COMPARISON_FIELDS = Object.freeze(['controlBranch', 'decision', 'outOfScope']);
const DESCRIPTOR_FIELDS = Object.freeze(['file', 'bytes', 'sha256']);
const TOLERANCE_MODES = Object.freeze(['exact', 'absolute', 'relative', 'absolute-or-relative']);
const REFERENCE_METHODS = Object.freeze(['hand-calculation', 'independent-spreadsheet', 'third-party-software']);
const DECISION_VALUES = Object.freeze(['pass', 'review', 'blocked']);
const OUT_OF_SCOPE_VALUES = Object.freeze(['reject', 'warning', 'not-applicable']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const WINDOWS_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

class RealCaseG1ContractError extends Error {
  constructor(code) {
    super(`beam-column-moment-real-case-g1-contract:${code}`);
    this.name = 'RealCaseG1ContractError';
  }
}

function fail(code) {
  throw new RealCaseG1ContractError(code);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical-non-finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('canonical-unsupported-value');
}

function sha256(value) {
  const payload = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : canonicalJson(value), 'utf8');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function exactKeys(record, expectedFields) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('exact-keys-record');
  if (!Array.isArray(expectedFields) || expectedFields.some(field => typeof field !== 'string')) fail('exact-keys-schema');
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail('exact-keys-mismatch');
  return record;
}

function requireHash(value, code) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}

function requireText(value, code, allowEmpty = false) {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)
      || (!allowEmpty && !value) || value.length > 2000) fail(code);
  return value;
}

function requireIso(value, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function normalizeDescriptorFile(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value !== value.normalize('NFC')
      || value.startsWith('/') || value.includes('\\') || value.includes(':') || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('descriptor-file');
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || WINDOWS_DEVICE_PATTERN.test(part))) fail('descriptor-file');
  return value;
}

function validateDescriptor(value, options = {}) {
  exactKeys(value, DESCRIPTOR_FIELDS);
  if (options.allowEmpty === true && value.file === '' && value.bytes === 0 && value.sha256 === '') return value;
  normalizeDescriptorFile(value.file);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) fail('descriptor-bytes');
  requireHash(value.sha256, 'descriptor-sha256');
  return value;
}

function descriptor(file, bytes, digest) {
  return validateDescriptor({ file, bytes, sha256: digest });
}

function emptyDescriptor() {
  return Object.freeze({ file: '', bytes: 0, sha256: '' });
}

function sameDescriptor(left, right) {
  validateDescriptor(left);
  validateDescriptor(right);
  return canonicalJson(left) === canonicalJson(right);
}

function unitFor(key) {
  if (['Mp', 'Mpr', 'MprFar', 'MuFace', 'continuityThreshold'].includes(key)) return 'kN-m';
  if (['Vp', 'VuRequired', 'VpzMin', 'VpzRequired', 'VpzNominal', 'VpzAvailable'].includes(key)) return 'kN';
  if (key === 'panelThicknessRequired') return 'mm';
  if (['rotationDemand', 'qualifiedRotation'].includes(key)) return 'rad';
  if (key.endsWith('Count') || key === 'sourceFieldCount' || key === 'checkCount') return 'count';
  if (FLAG_KEYS.includes(key)) return 'flag';
  return '-';
}

function validateResultVector(results) {
  exactKeys(results, RESULT_KEYS);
  RESULT_KEYS.forEach(key => {
    if (typeof results[key] !== 'number' || !Number.isFinite(results[key])) fail('result-non-finite');
  });
  FLAG_KEYS.forEach(key => {
    if (results[key] !== 0 && results[key] !== 1) fail('result-flag');
  });
  if (results.sourceFieldCount !== 88) fail('result-source-field-count');
  if (results.checkCount !== 6) fail('result-check-count');
  if (results.completeJointDesign !== 0) fail('result-complete-joint-design');
  if (results.validationFailure !== 0) fail('result-validation-failure');
  return results;
}

function validateTolerance(value, expectedNumber, exactRequired) {
  exactKeys(value, TOLERANCE_FIELDS);
  if (!TOLERANCE_MODES.includes(value.mode)) fail('tolerance-mode');
  if (typeof value.absoluteTolerance !== 'number' || !Number.isFinite(value.absoluteTolerance) || value.absoluteTolerance < 0
      || typeof value.relativeTolerance !== 'number' || !Number.isFinite(value.relativeTolerance) || value.relativeTolerance < 0) {
    fail('tolerance-value');
  }
  if (exactRequired && (value.mode !== 'exact' || value.absoluteTolerance !== 0 || value.relativeTolerance !== 0)) {
    fail('tolerance-exact-required');
  }
  if (value.mode === 'exact' && (value.absoluteTolerance !== 0 || value.relativeTolerance !== 0)) fail('tolerance-exact');
  if (value.mode === 'absolute' && (value.absoluteTolerance <= 0 || value.relativeTolerance !== 0)) fail('tolerance-absolute');
  if (value.mode === 'relative' && (value.relativeTolerance <= 0 || value.absoluteTolerance !== 0 || expectedNumber === 0)) fail('tolerance-relative');
  if (value.mode === 'absolute-or-relative' && value.absoluteTolerance <= 0 && value.relativeTolerance <= 0) fail('tolerance-combined');
  return value;
}

function validateComparison(value, requirePass) {
  exactKeys(value, COMPARISON_FIELDS);
  requireText(value.controlBranch, 'comparison-control-branch');
  if (!DECISION_VALUES.includes(value.decision) || (requirePass && value.decision !== 'pass')) fail('comparison-decision');
  if (!OUT_OF_SCOPE_VALUES.includes(value.outOfScope)) fail('comparison-out-of-scope');
  return value;
}

function validateReferenceRecord(record) {
  exactKeys(record, REFERENCE_FIELDS);
  if (record.schemaVersion !== 1 || record.kind !== REFERENCE_KIND) fail('reference-identity');
  requireText(record.externalCaseId, 'reference-external-case-id');
  ['caseIdentitySha256', 'criteriaSha256', 'toolInputSha256', 'caseSourceArtifactSha256', 'humanArtifactSha256']
    .forEach(key => requireHash(record[key], 'reference-binding-sha256'));
  if (record.resultSchemaSha256 !== RESULT_SCHEMA_SHA256) fail('reference-result-schema');
  if (record.independentFromProductionCore !== true) fail('reference-independence');
  if (!REFERENCE_METHODS.includes(record.method)) fail('reference-method');
  requireText(record.author, 'reference-author');
  requireText(record.reviewer, 'reference-reviewer', true);
  requireIso(record.createdAt, 'reference-created-at');
  requireText(record.basis, 'reference-basis');
  validateResultVector(record.results);
  exactKeys(record.tolerances, RESULT_KEYS);
  RESULT_KEYS.forEach(key => validateTolerance(record.tolerances[key], record.results[key], EXACT_TOLERANCE_KEYS.includes(key)));
  validateComparison(record.comparison, true);
  return record;
}

function validateReferenceData(record, expectedMetadata) {
  validateReferenceRecord(record);
  exactKeys(expectedMetadata, REFERENCE_EXPECTED_METADATA_FIELDS);
  const observed = Object.fromEntries(REFERENCE_EXPECTED_METADATA_FIELDS.map(key => [key, record[key]]));
  if (canonicalJson(observed) !== canonicalJson(expectedMetadata)) fail('reference-metadata-binding');
  return record;
}

function assertionPass(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.type !== 'numeric') return record.expectedText === record.actualText;
  if (!Number.isFinite(record.expectedNumber) || !Number.isFinite(record.actualNumber)) return false;
  const difference = Math.abs(record.actualNumber - record.expectedNumber);
  const relative = record.expectedNumber === 0
    ? (difference === 0 ? 0 : Number.POSITIVE_INFINITY)
    : difference / Math.abs(record.expectedNumber);
  if (record.toleranceMode === 'exact') return difference === 0;
  if (record.toleranceMode === 'absolute') return difference <= record.absoluteTolerance;
  if (record.toleranceMode === 'relative') return relative <= record.relativeTolerance;
  if (record.toleranceMode === 'absolute-or-relative') {
    return difference <= record.absoluteTolerance || relative <= record.relativeTolerance;
  }
  return false;
}

function branchValue(input, results) {
  if (!input || typeof input !== 'object' || !results || typeof results !== 'object') fail('branch-input');
  if (!['frameSystemPass', 'axisPass', 'designRoutePass', 'qualificationRoutePass'].every(key => results[key] === 1)) {
    return 'blocked-control-branch';
  }
  const fields = ['momentFrameSystem', 'momentAxis', 'momentConnectionDesignRoute', 'momentQualificationRoute'];
  if (fields.some(key => typeof input[key] !== 'string' || !input[key])) fail('branch-input');
  return [...fields.map(key => input[key]), 'six-strength-checks'].join('|');
}

function numericAssertion(key, index, reference, actual) {
  const tolerance = reference.tolerances[key];
  return {
    assertionId: `A-N-${String(index + 1).padStart(3, '0')}`,
    label: `real-case result: ${key}`,
    type: 'numeric',
    unit: unitFor(key),
    expectedNumber: reference.results[key],
    actualNumber: actual[key],
    expectedText: '',
    actualText: '',
    expectedPointer: `/results/${key}`,
    actualPointer: `/results/${key}`,
    toleranceMode: tolerance.mode,
    absoluteTolerance: tolerance.absoluteTolerance,
    relativeTolerance: tolerance.relativeTolerance,
  };
}

function textAssertion(assertionId, label, type, field, expectedText, actualText) {
  return {
    assertionId,
    label,
    type,
    unit: '',
    expectedNumber: null,
    actualNumber: null,
    expectedText,
    actualText,
    expectedPointer: `/comparison/${field}`,
    actualPointer: `/comparison/${field}`,
    toleranceMode: 'exact',
    absoluteTolerance: 0,
    relativeTolerance: 0,
  };
}

function buildAssertions(reference, productionResults, actualComparison) {
  validateReferenceRecord(reference);
  validateResultVector(productionResults);
  validateComparison(actualComparison, false);

  const numeric = RESULT_KEYS.map((key, index) => numericAssertion(key, index, reference, productionResults));
  const control = textAssertion(
    'A-CONTROL-BRANCH',
    'real-case control branch',
    'control-branch',
    'controlBranch',
    reference.comparison.controlBranch,
    actualComparison.controlBranch,
  );
  const outOfScope = textAssertion(
    'A-OUT-OF-SCOPE',
    'real-case out-of-scope disposition',
    'out-of-scope',
    'outOfScope',
    reference.comparison.outOfScope,
    actualComparison.outOfScope,
  );
  const derivedDecision = [...numeric, control, outOfScope].every(assertionPass) ? 'pass' : 'blocked';
  const decision = textAssertion(
    'A-DECISION',
    'real-case comparison decision',
    'decision',
    'decision',
    reference.comparison.decision,
    derivedDecision,
  );
  return [...numeric, control, decision, outOfScope];
}

const RESULT_SCHEMA_SHA256 = sha256(canonicalJson(RESULT_KEYS));
if (RESULT_KEYS.length !== 79 || new Set(RESULT_KEYS).size !== 79) fail('result-schema-key-count');

const ARTIFACT_KINDS = Object.freeze({
  reference: REFERENCE_KIND,
  input: INPUT_KIND,
  production: PRODUCTION_KIND,
  decisionCandidate: DECISION_CANDIDATE_KIND,
  decisionReceipt: DECISION_RECEIPT_KIND,
  cliResult: CLI_RESULT_KIND,
});

module.exports = {
  REAL_TOOL_ID,
  REAL_PROFILE_ID,
  REFERENCE_KIND,
  INPUT_KIND,
  PRODUCTION_KIND,
  DECISION_CANDIDATE_KIND,
  DECISION_RECEIPT_KIND,
  CLI_RESULT_KIND,
  ARTIFACT_KINDS,
  RESULT_KEYS,
  RESULT_SCHEMA_SHA256,
  FLAG_KEYS,
  EXACT_TOLERANCE_KEYS,
  REFERENCE_FIELDS,
  REFERENCE_EXPECTED_METADATA_FIELDS,
  TOLERANCE_FIELDS,
  COMPARISON_FIELDS,
  DESCRIPTOR_FIELDS,
  RealCaseG1ContractError,
  canonicalJson,
  sha256,
  exactKeys,
  descriptor,
  emptyDescriptor,
  validateDescriptor,
  sameDescriptor,
  validateReferenceData,
  validateResultVector,
  unitFor,
  branchValue,
  buildAssertions,
  assertionPass,
};
