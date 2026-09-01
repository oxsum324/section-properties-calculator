'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Checker = require('./attachment-package-check.js');
const Verifier = require('./attachment-package-verify.js');
const History = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');

const SCHEMA_VERSION = 1;
const KIND = 'engineering-qualification-case-bundle.v1';
const REPOSITORY_ROOT = (fs.realpathSync.native || fs.realpathSync)(path.resolve(__dirname, '..', '..'));
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 512 * 1024 * 1024;
const MAX_FUTURE_SKEW_MILLISECONDS = 5 * 60 * 1000;
const BOUNDARY_INSTRUCTION = '本案件包只供私有工程資格化與報告附件編排；不得放入計算書、主報告、正式附件包或 Pages。案件包內的資格化決定與採用紀錄不會覆寫計算附件核可，也不等同數位簽章。';
const COMPARISON_DATA_KIND = 'engineering-qualification-comparison-data.v1';
const SOURCE_KINDS = Object.freeze(['real-case', 'synthetic', 'code-example']);
const RUN_STATES = Object.freeze(['candidate', 'current', 'stale', 'superseded', 'rejected']);
const REFERENCE_METHODS = Object.freeze(['hand-calculation', 'independent-spreadsheet', 'published-example', 'third-party-software', 'same-core-replay']);
const ASSERTION_TYPES = Object.freeze(['numeric', 'categorical', 'control-branch', 'decision', 'out-of-scope', 'applicability']);
const TOLERANCE_MODES = Object.freeze(['exact', 'absolute', 'relative', 'absolute-or-relative']);
const DISCREPANCY_CATEGORIES = Object.freeze(['tool-defect', 'reference-defect', 'input-interpretation', 'scope-mismatch', 'rounding', 'report-layout', 'other']);
const DISCREPANCY_STATES = Object.freeze(['open', 'resolved', 'accepted']);
const REVIEW_STATES = Object.freeze(['not-reviewed', 'pass', 'needs-revision']);
const REPORT_PACKAGE_STATES = Object.freeze(['unplanned', 'draft', 'ready-for-render', 'rendered', 'adopted']);
const LEVEL_RANK = Object.freeze({ none: 0, G1: 1, G2: 2, G3: 3 });
const REQUIRED_G1_ASSERTIONS = Object.freeze(['numeric', 'control-branch', 'decision', 'out-of-scope']);
const REQUIRED_G2_ASSERTIONS = Object.freeze([...REQUIRED_G1_ASSERTIONS, 'applicability']);
const REQUIRED_REPORT_CHECKS = Object.freeze([
  'identity-and-provenance',
  'inputs-and-assumptions',
  'calculation-and-governing-result',
  'scope-and-exclusions',
  'pagination-and-legibility',
]);
const FORMAL_ARTIFACT_EXTENSIONS = Object.freeze(['.pdf', '.docx', '.xlsx', '.html']);

const TOP_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'lifecycle', 'createdAt', 'updatedAt', 'sealedAt', 'bundleFingerprint', 'boundary', 'case',
  'calculationRuns', 'independentComparisons', 'discrepancies', 'artifactReviews',
  'qualificationDecisions', 'formalAdoptions', 'reportPackage',
]);
const BOUNDARY_FIELDS = Object.freeze([
  'classification', 'attachToFormalReport', 'formalAttachmentApproval', 'pagesPublication',
  'modifiesCalculationArtifacts', 'overridesAttachmentGovernance', 'attestation', 'instruction',
]);
const CASE_FIELDS = Object.freeze([
  'caseId', 'caseLabel', 'sourceKind', 'externalCaseId', 'caseSourceArtifact', 'projectName', 'projectNo', 'designer', 'intendedUse',
  'permissibleUse', 'limitations', 'exclusions', 'governingStandards',
]);
const STANDARD_FIELDS = Object.freeze(['standardId', 'title', 'edition', 'clauses', 'sourceAuthority']);
const EVIDENCE_FIELDS = Object.freeze(['file', 'bytes', 'sha256']);
const RUN_FIELDS = Object.freeze([
  'runId', 'toolId', 'toolName', 'toolVersion', 'engineVersion', 'executedAt', 'calculationFingerprint', 'runFingerprint',
  'inputArtifact', 'resultDataArtifact', 'outputArtifact', 'state', 'staleReasons', 'supersedesRunId',
]);
const COMPARISON_FIELDS = Object.freeze([
  'comparisonId', 'runId', 'comparedAt', 'criteriaDefinedAt', 'referenceMethod',
  'independentFromProductionCore', 'referenceArtifact', 'referenceDataArtifact', 'referenceAuthor', 'referenceReviewer',
  'referenceCreatedAt', 'referenceBasis', 'comparisonDataArtifact', 'assertions',
]);
const ASSERTION_FIELDS = Object.freeze([
  'assertionId', 'label', 'type', 'unit', 'expectedNumber', 'actualNumber', 'expectedText', 'actualText',
  'expectedPointer', 'actualPointer', 'toleranceMode', 'absoluteTolerance', 'relativeTolerance',
]);
const DISCREPANCY_FIELDS = Object.freeze([
  'discrepancyId', 'comparisonId', 'assertionId', 'category', 'state', 'description', 'resolution',
  'reviewer', 'basis', 'resolvedAt',
]);
const REVIEW_FIELDS = Object.freeze(['reviewId', 'runId', 'artifact', 'visibilityEvidenceArtifact', 'state', 'reviewer', 'reviewedAt', 'reviewReceipt', 'checks']);
const REVIEW_CHECK_FIELDS = Object.freeze(['checkId', 'label', 'pass', 'evidence']);
const DECISION_FIELDS = Object.freeze([
  'decisionId', 'runId', 'comparisonIds', 'claimedLevel', 'basedOnDecisionId', 'reviewer', 'basis', 'decidedAt', 'decisionReceipt',
]);
const ADOPTION_FIELDS = Object.freeze([
  'adoptionId', 'runId', 'qualificationDecisionId', 'artifactReviewId', 'reviewer', 'basis', 'adoptedAt', 'adoptionReceipt',
]);
const REPORT_PACKAGE_FIELDS = Object.freeze([
  'state', 'templateId', 'templateVersion', 'sections', 'renderedArtifact', 'renderedVisibilityEvidenceArtifact',
  'adoptedBy', 'adoptedAt', 'adoptionBasis', 'adoptionReceipt',
]);
const REPORT_SECTION_FIELDS = Object.freeze(['order', 'runId', 'formalAdoptionId', 'title', 'appendixNo']);
const COMPARISON_DATA_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'comparisonId', 'runId', 'productionOutputSha256', 'productionResultDataSha256',
  'referenceArtifactSha256', 'referenceDataArtifactSha256', 'assertions',
]);

class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
  }
}

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function fail(message) {
  throw new ContractError(message);
}

function isInsideDirectory(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveThroughExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const physical = fs.existsSync(cursor) ? (fs.realpathSync.native || fs.realpathSync)(cursor) : cursor;
  return path.resolve(physical, ...suffix);
}

function requirePrivateWorkspaceLocation(candidate, label) {
  if (isInsideDirectory(REPOSITORY_ROOT, resolveThroughExistingAncestor(candidate))) throw new UsageError(`${label}不得位於工具程式庫內；請改用案件私人資料夾。`);
}

function qualificationBoundary() {
  return {
    classification: 'private-engineering-qualification-only',
    attachToFormalReport: false,
    formalAttachmentApproval: false,
    pagesPublication: false,
    modifiesCalculationArtifacts: false,
    overridesAttachmentGovernance: false,
    attestation: 'unsigned-self-attested-internal-record',
    instruction: BOUNDARY_INSTRUCTION,
  };
}

function emptyEvidence() {
  return { file: '', bytes: 0, sha256: '' };
}

function isEmptyEvidence(value) {
  return value?.file === '' && value?.bytes === 0 && value?.sha256 === '';
}

function validateFormalVisibilityEvidence(artifact, visibilityEvidence, label, required) {
  validateEvidence(visibilityEvidence, `${label}可見性證據`, true);
  const extension = path.posix.extname(artifact.file || '').toLowerCase();
  if (extension !== '.pdf') {
    if (!isEmptyEvidence(visibilityEvidence)) fail(`${label}只有 PDF 可以綁定 canonical render 可見性證據。`);
    return;
  }
  if (required && isEmptyEvidence(visibilityEvidence)) fail(`${label}PDF 必須綁定 canonical render 可見性證據。`);
  if (isEmptyEvidence(visibilityEvidence)) return;
  const parsed = path.posix.parse(artifact.file);
  const expectedFile = path.posix.join(parsed.dir, `${parsed.name}.canonical-render.evidence.json`);
  if (visibilityEvidence.file !== expectedFile) fail(`${label}PDF 可見性證據必須使用同資料夾 canonical-render 固定檔名：${expectedFile}。`);
  if (visibilityEvidence.sha256 === artifact.sha256) fail(`${label}PDF 與可見性證據不得共用內容雜湊。`);
}

function requireText(value, label, maxLength = 1000, allowEmpty = false) {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)
      || value.length > maxLength || (!allowEmpty && !value)) fail(`${label}必須是${allowEmpty ? '不超過' : ' 1 至'} ${maxLength} 個可顯示字元。`);
  return value;
}

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) fail(`${label}必須是 1 至 80 字元的穩定識別碼。`);
  return value;
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label}不受支援。`);
  return value;
}

function requireIso(value, label, allowEmpty = false) {
  if (allowEmpty && value === '') return '';
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label}必須是標準 UTC ISO 時間。`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label}必須是布林值。`);
  return value;
}

function requireFinite(value, label, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}必須是有限數值。`);
  if (options.nonNegative && value < 0) fail(`${label}不得為負值。`);
  return value;
}

function validateUniqueIds(items, field, label) {
  if (!Array.isArray(items)) fail(`${label}必須是陣列。`);
  const ids = items.map((item, index) => requireId(item?.[field], `${label}第 ${index + 1} 筆 ${field}`));
  if (new Set(ids).size !== ids.length) fail(`${label}的 ${field} 不得重複。`);
}

function validateTextList(value, label, allowEmpty = true) {
  if (!Array.isArray(value)) fail(`${label}必須是字串陣列。`);
  value.forEach((item, index) => requireText(item, `${label}第 ${index + 1} 項`, 500));
  if (!allowEmpty && !value.length) fail(`${label}不得為空。`);
  if (new Set(value).size !== value.length) fail(`${label}不得重複。`);
}

function validateEvidence(value, label, allowEmpty = false) {
  try { Compare.exactKeys(value, EVIDENCE_FIELDS, label); } catch (error) { fail(error.message); }
  if (allowEmpty && isEmptyEvidence(value)) return value;
  normalizeEvidencePath(value.file, `${label}檔案`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > MAX_EVIDENCE_BYTES) fail(`${label}檔案大小無效。`);
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) fail(`${label} SHA-256 無效。`);
  return value;
}

function normalizeEvidencePath(value, label) {
  if (typeof value !== 'string' || !value || value.length > 1024 || path.isAbsolute(value) || value.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(value) || value !== value.normalize('NFC')) fail(`${label}必須是 NFC 標準相對路徑。`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) fail(`${label}不得越出案件工作區。`);
  return value;
}

function fingerprint(prefix, record, field) {
  const payload = { ...record };
  delete payload[field];
  return `${prefix}-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function bundleFingerprint(record) {
  return fingerprint('EQB', record, 'bundleFingerprint');
}

function qualificationRunFingerprint(record) {
  const payload = {
    runId: record.runId,
    toolId: record.toolId,
    toolVersion: record.toolVersion,
    engineVersion: record.engineVersion,
    executedAt: record.executedAt,
    calculationFingerprint: record.calculationFingerprint,
    inputArtifact: record.inputArtifact,
    resultDataArtifact: record.resultDataArtifact,
    outputArtifact: record.outputArtifact,
  };
  return `QRF-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function validateCase(record) {
  try { Compare.exactKeys(record, CASE_FIELDS, '案件身分'); } catch (error) { fail(error.message); }
  requireId(record.caseId, '案件 ID');
  requireText(record.caseLabel, '案件顯示名稱', 200);
  requireEnum(record.sourceKind, SOURCE_KINDS, '案件來源類型');
  requireText(record.externalCaseId, '外部案件 ID', 200, true);
  validateEvidence(record.caseSourceArtifact, '案件來源證據', true);
  requireText(record.projectName, '計畫名稱', 200, true);
  requireText(record.projectNo, '計畫編號', 100, true);
  requireText(record.designer, '設計人', 100, true);
  requireText(record.intendedUse, '預定用途', 1000, true);
  requireText(record.permissibleUse, '允許用途', 1000, true);
  validateTextList(record.limitations, '限制');
  validateTextList(record.exclusions, '排除項');
  if (!Array.isArray(record.governingStandards)) fail('規範依據必須是陣列。');
  const ids = [];
  record.governingStandards.forEach((item, index) => {
    try { Compare.exactKeys(item, STANDARD_FIELDS, `規範依據第 ${index + 1} 筆`); } catch (error) { fail(error.message); }
    ids.push(requireId(item.standardId, `規範依據第 ${index + 1} 筆 ID`));
    requireText(item.title, `規範依據第 ${index + 1} 筆名稱`, 300);
    requireText(item.edition, `規範依據第 ${index + 1} 筆版次`, 100);
    validateTextList(item.clauses, `規範依據第 ${index + 1} 筆條文`, false);
    requireText(item.sourceAuthority, `規範依據第 ${index + 1} 筆來源`, 500);
    if (/(?:工具內建|工具建議|專業版)/u.test(item.sourceAuthority)) fail(`規範依據第 ${index + 1} 筆不得以工具本身作為權威來源。`);
  });
  if (new Set(ids).size !== ids.length) fail('規範依據 ID 不得重複。');
}

function validateRun(record, index, updatedAt) {
  const label = `計算執行紀錄第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, RUN_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.runId, `${label} ID`);
  requireId(record.toolId, `${label}工具 ID`);
  requireText(record.toolName, `${label}工具名稱`, 200);
  requireText(record.toolVersion, `${label}工具版本`, 100);
  requireText(record.engineVersion, `${label}引擎版本`, 100);
  requireIso(record.executedAt, `${label}執行時間`);
  if (Date.parse(record.executedAt) > Date.parse(updatedAt)) fail(`${label}執行時間不得晚於案件包更新時間。`);
  if (typeof record.calculationFingerprint !== 'string' || !/^CF-[0-9A-F]{16}$/.test(record.calculationFingerprint)) fail(`${label}計算指紋無效。`);
  validateEvidence(record.inputArtifact, `${label}輸入`);
  validateEvidence(record.resultDataArtifact, `${label}機讀結果`);
  validateEvidence(record.outputArtifact, `${label}輸出`);
  if (path.posix.extname(record.resultDataArtifact.file).toLowerCase() !== '.json') fail(`${label}機讀結果必須是 JSON。`);
  if ([record.inputArtifact.file, record.inputArtifact.sha256, record.outputArtifact.file, record.outputArtifact.sha256]
    .includes(record.resultDataArtifact.file) || [record.inputArtifact.sha256, record.outputArtifact.sha256].includes(record.resultDataArtifact.sha256)) fail(`${label}機讀結果必須是獨立證據，不得冒用輸入或人讀成品。`);
  if (typeof record.runFingerprint !== 'string' || !/^QRF-[0-9A-F]{24}$/.test(record.runFingerprint)
      || record.runFingerprint !== qualificationRunFingerprint(record)) fail(`${label}案件包執行指紋無效或與工具、版本、時間及輸入輸出不一致。`);
  if (record.inputArtifact.file === record.outputArtifact.file || record.inputArtifact.sha256 === record.outputArtifact.sha256) fail(`${label}輸入與輸出必須是不同證據。`);
  requireEnum(record.state, RUN_STATES, `${label}狀態`);
  validateTextList(record.staleReasons, `${label}失效原因`);
  requireText(record.supersedesRunId, `${label}前一執行 ID`, 80, true);
  if (record.supersedesRunId) requireId(record.supersedesRunId, `${label}前一執行 ID`);
  if (record.state === 'stale' && !record.staleReasons.length) fail(`${label}標示 stale 時必須列出失效原因。`);
  if (record.state !== 'stale' && record.staleReasons.length) fail(`${label}只有 stale 狀態可列失效原因。`);
}

function assertionPass(record) {
  if (record.type !== 'numeric') return record.expectedText === record.actualText;
  const difference = Math.abs(record.actualNumber - record.expectedNumber);
  const relative = record.expectedNumber === 0 ? (difference === 0 ? 0 : Number.POSITIVE_INFINITY) : difference / Math.abs(record.expectedNumber);
  if (record.toleranceMode === 'exact') return difference === 0;
  if (record.toleranceMode === 'absolute') return difference <= record.absoluteTolerance;
  if (record.toleranceMode === 'relative') return relative <= record.relativeTolerance;
  return difference <= record.absoluteTolerance || relative <= record.relativeTolerance;
}

function validateAssertion(record, comparisonLabel, index) {
  const label = `${comparisonLabel}斷言第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, ASSERTION_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.assertionId, `${label} ID`);
  requireText(record.label, `${label}名稱`, 300);
  requireEnum(record.type, ASSERTION_TYPES, `${label}類型`);
  requireText(record.unit, `${label}單位`, 50, record.type !== 'numeric');
  requireText(record.expectedPointer, `${label}基準資料指標`, 500);
  requireText(record.actualPointer, `${label}正式結果指標`, 500);
  if (!record.expectedPointer.startsWith('/') || !record.actualPointer.startsWith('/')) fail(`${label}資料指標必須是 RFC 6901 JSON Pointer。`);
  requireEnum(record.toleranceMode, TOLERANCE_MODES, `${label}容許差模式`);
  requireFinite(record.absoluteTolerance, `${label}絕對容許差`, { nonNegative: true });
  requireFinite(record.relativeTolerance, `${label}相對容許差`, { nonNegative: true });
  if (record.type === 'numeric') {
    requireFinite(record.expectedNumber, `${label}預期值`);
    requireFinite(record.actualNumber, `${label}實際值`);
    if (record.expectedText !== '' || record.actualText !== '') fail(`${label}數值斷言不得混入文字答案。`);
    if (record.toleranceMode === 'exact' && (record.absoluteTolerance !== 0 || record.relativeTolerance !== 0)) fail(`${label}精確比較的容許差必須為 0。`);
    if (record.toleranceMode === 'absolute' && record.absoluteTolerance <= 0) fail(`${label}絕對容許差必須大於 0。`);
    if (record.toleranceMode === 'relative' && (record.relativeTolerance <= 0 || record.expectedNumber === 0)) fail(`${label}相對容許差必須大於 0，且預期值不得為 0。`);
    if (record.toleranceMode === 'absolute-or-relative' && record.absoluteTolerance <= 0 && record.relativeTolerance <= 0) fail(`${label}至少要有一個正容許差。`);
  } else {
    if (record.expectedNumber !== null || record.actualNumber !== null || record.unit !== ''
        || record.toleranceMode !== 'exact' || record.absoluteTolerance !== 0 || record.relativeTolerance !== 0) fail(`${label}文字斷言只能使用精確文字比較。`);
    requireText(record.expectedText, `${label}預期文字`, 300);
    requireText(record.actualText, `${label}實際文字`, 300);
    if (record.type === 'out-of-scope') {
      requireEnum(record.expectedText, ['reject', 'warning', 'not-applicable'], `${label}預期處置`);
      requireEnum(record.actualText, ['reject', 'warning', 'not-applicable'], `${label}實際處置`);
    }
    if (record.type === 'decision') {
      requireEnum(record.expectedText, ['pass', 'review', 'blocked'], `${label}預期決定`);
      requireEnum(record.actualText, ['pass', 'review', 'blocked'], `${label}實際決定`);
    }
    if (record.type === 'applicability') {
      requireEnum(record.expectedText, ['applicable', 'conditional', 'not-applicable'], `${label}預期適用性`);
      requireEnum(record.actualText, ['applicable', 'conditional', 'not-applicable'], `${label}實際適用性`);
    }
  }
  return assertionPass(record);
}

function validateComparison(record, index, runs, updatedAt) {
  const label = `獨立比較第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, COMPARISON_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.comparisonId, `${label} ID`);
  requireId(record.runId, `${label}執行 ID`);
  const run = runs.get(record.runId);
  if (!run) fail(`${label}引用不存在的計算執行紀錄。`);
  requireIso(record.comparedAt, `${label}比較時間`);
  requireIso(record.criteriaDefinedAt, `${label}判定基準建立時間`);
  if (Date.parse(record.comparedAt) > Date.parse(updatedAt) || Date.parse(record.criteriaDefinedAt) > Date.parse(updatedAt)) fail(`${label}時間不得晚於案件包更新時間。`);
  if (Date.parse(record.criteriaDefinedAt) >= Date.parse(run.executedAt)) fail(`${label}容許差與判定基準必須早於工具執行時間固定。`);
  if (Date.parse(record.comparedAt) < Date.parse(run.executedAt)) fail(`${label}比較時間不得早於工具執行時間。`);
  requireEnum(record.referenceMethod, REFERENCE_METHODS, `${label}基準方法`);
  requireBoolean(record.independentFromProductionCore, `${label}獨立性`);
  if (record.referenceMethod === 'same-core-replay' && record.independentFromProductionCore) fail(`${label}同核心重播不得宣稱獨立。`);
  validateEvidence(record.referenceArtifact, `${label}基準檔`);
  validateEvidence(record.referenceDataArtifact, `${label}基準機讀資料`);
  if (path.posix.extname(record.referenceDataArtifact.file).toLowerCase() !== '.json') fail(`${label}基準機讀資料必須是 JSON。`);
  requireText(record.referenceAuthor, `${label}基準作者`, 100);
  requireText(record.referenceReviewer, `${label}基準複核人`, 100, true);
  requireIso(record.referenceCreatedAt, `${label}基準建立時間`);
  if (Date.parse(record.referenceCreatedAt) > Date.parse(updatedAt)) fail(`${label}基準建立時間不得晚於案件包更新時間。`);
  requireText(record.referenceBasis, `${label}基準依據`, 1000);
  validateEvidence(record.comparisonDataArtifact, `${label}比較資料`);
  if (record.referenceDataArtifact.file === record.referenceArtifact.file
      || record.referenceDataArtifact.sha256 === record.referenceArtifact.sha256
      || record.referenceDataArtifact.file === run.resultDataArtifact.file
      || record.referenceDataArtifact.sha256 === run.resultDataArtifact.sha256) fail(`${label}基準機讀資料必須與原始基準及正式機讀結果分離。`);
  if (record.comparisonDataArtifact.file === record.referenceArtifact.file
      || record.comparisonDataArtifact.sha256 === record.referenceArtifact.sha256
      || record.comparisonDataArtifact.file === record.referenceDataArtifact.file
      || record.comparisonDataArtifact.sha256 === record.referenceDataArtifact.sha256
      || record.comparisonDataArtifact.file === run.resultDataArtifact.file
      || record.comparisonDataArtifact.sha256 === run.resultDataArtifact.sha256
      || record.comparisonDataArtifact.file === run.outputArtifact.file
      || record.comparisonDataArtifact.sha256 === run.outputArtifact.sha256) fail(`${label}比較資料必須是獨立的正規化證據，不得冒用基準檔或正式輸出。`);
  if (Date.parse(record.referenceCreatedAt) > Date.parse(record.comparedAt)) fail(`${label}基準建立時間不得晚於比較時間。`);
  if (record.independentFromProductionCore
      && (record.referenceArtifact.file === run.outputArtifact.file || record.referenceArtifact.sha256 === run.outputArtifact.sha256
        || record.referenceArtifact.file === run.inputArtifact.file || record.referenceArtifact.sha256 === run.inputArtifact.sha256)) fail(`${label}獨立基準不得與正式輸入或輸出共用檔案或雜湊。`);
  validateUniqueIds(record.assertions, 'assertionId', `${label}斷言`);
  if (!record.assertions.length) fail(`${label}至少需要一項斷言。`);
  const assertionResults = new Map();
  record.assertions.forEach((assertion, assertionIndex) => assertionResults.set(assertion.assertionId, validateAssertion(assertion, label, assertionIndex)));
  return {
    ...record,
    pass: [...assertionResults.values()].every(Boolean),
    assertionResults,
    assertionTypes: new Set(record.assertions.map(item => item.type)),
  };
}

function validateDiscrepancy(record, index, comparisons, updatedAt) {
  const label = `差異處置第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, DISCREPANCY_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.discrepancyId, `${label} ID`);
  requireId(record.comparisonId, `${label}比較 ID`);
  const comparison = comparisons.get(record.comparisonId);
  if (!comparison) fail(`${label}引用不存在的獨立比較。`);
  requireText(record.assertionId, `${label}斷言 ID`, 80, true);
  if (record.assertionId && !comparison.assertionResults.has(record.assertionId)) fail(`${label}引用不存在的斷言。`);
  requireEnum(record.category, DISCREPANCY_CATEGORIES, `${label}類別`);
  requireEnum(record.state, DISCREPANCY_STATES, `${label}狀態`);
  requireText(record.description, `${label}說明`, 1000);
  if (record.state === 'open') {
    ['resolution', 'reviewer', 'basis', 'resolvedAt'].forEach(field => requireText(record[field], `${label}${field}`, field === 'resolvedAt' ? 40 : 1000, true));
    if (record.resolution || record.reviewer || record.basis || record.resolvedAt) fail(`${label}尚未處置時不得預填結案資料。`);
  } else {
    requireText(record.resolution, `${label}處置`, 1000);
    requireText(record.reviewer, `${label}複核人`, 100);
    requireText(record.basis, `${label}處置依據`, 1000);
    requireIso(record.resolvedAt, `${label}處置時間`);
    if (Date.parse(record.resolvedAt) < Date.parse(comparison.comparedAt) || Date.parse(record.resolvedAt) > Date.parse(updatedAt)) fail(`${label}處置時間不得早於比較時間或晚於案件包更新時間。`);
  }
  return { runId: comparison.runId, comparisonId: record.comparisonId, state: record.state, assertionId: record.assertionId, resolvedAt: record.resolvedAt };
}

function validateArtifactReview(record, index, runs, updatedAt) {
  const label = `附件審閱第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, REVIEW_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.reviewId, `${label} ID`);
  requireId(record.runId, `${label}執行 ID`);
  const run = runs.get(record.runId);
  if (!run) fail(`${label}引用不存在的計算執行紀錄。`);
  validateEvidence(record.artifact, `${label}成品`);
  requireEnum(record.state, REVIEW_STATES, `${label}狀態`);
  validateFormalVisibilityEvidence(record.artifact, record.visibilityEvidenceArtifact, `${label}成品`, record.state === 'pass');
  if (!Array.isArray(record.checks)) fail(`${label}檢查必須是陣列。`);
  validateUniqueIds(record.checks, 'checkId', `${label}檢查`);
  if (record.state === 'not-reviewed') {
    requireText(record.reviewer, `${label}複核人`, 100, true);
    requireText(record.reviewedAt, `${label}複核時間`, 40, true);
    validateEvidence(record.reviewReceipt, `${label}審閱收據`, true);
    if (record.reviewer || record.reviewedAt || !isEmptyEvidence(record.reviewReceipt) || record.checks.length) fail(`${label}尚未審閱時不得預填審閱結果。`);
  } else {
    requireText(record.reviewer, `${label}複核人`, 100);
    requireIso(record.reviewedAt, `${label}複核時間`);
    validateEvidence(record.reviewReceipt, `${label}審閱收據`);
    if (Date.parse(record.reviewedAt) < Date.parse(run.executedAt) || Date.parse(record.reviewedAt) > Date.parse(updatedAt)) fail(`${label}複核時間不得早於計算執行或晚於案件包更新時間。`);
    record.checks.forEach((item, checkIndex) => {
      try { Compare.exactKeys(item, REVIEW_CHECK_FIELDS, `${label}檢查第 ${checkIndex + 1} 筆`); } catch (error) { fail(error.message); }
      requireId(item.checkId, `${label}檢查第 ${checkIndex + 1} 筆 ID`);
      requireText(item.label, `${label}檢查第 ${checkIndex + 1} 筆名稱`, 300);
      requireBoolean(item.pass, `${label}檢查第 ${checkIndex + 1} 筆結果`);
      requireText(item.evidence, `${label}檢查第 ${checkIndex + 1} 筆依據`, 1000);
    });
    const passes = record.checks.every(item => item.pass);
    if (record.state === 'pass') {
      const ids = new Set(record.checks.map(item => item.checkId));
      const missing = REQUIRED_REPORT_CHECKS.filter(id => !ids.has(id));
      if (missing.length || !passes) fail(`${label}標示通過時必須完成五項固定檢查且全部通過。`);
      if (!FORMAL_ARTIFACT_EXTENSIONS.includes(path.posix.extname(record.artifact.file).toLowerCase())) fail(`${label}通過成品只接受 PDF、DOCX、XLSX 或 HTML。`);
    }
    if (record.state === 'needs-revision' && passes) fail(`${label}標示需修正時至少要有一項未通過。`);
  }
  return record;
}

function comparisonSupportsLevel(comparison, level) {
  if (!comparison.independentFromProductionCore || comparison.referenceMethod === 'same-core-replay' || !comparison.pass) return false;
  const required = level === 'G2' ? REQUIRED_G2_ASSERTIONS : REQUIRED_G1_ASSERTIONS;
  if (!required.every(type => comparison.assertionTypes.has(type))) return false;
  const decisions = comparison.assertions.filter(item => item.type === 'decision');
  const applicability = comparison.assertions.filter(item => item.type === 'applicability');
  if (!decisions.length || decisions.some(item => item.actualText !== 'pass')) return false;
  if (level === 'G2' && (!applicability.length || applicability.some(item => item.actualText !== 'applicable'))) return false;
  return true;
}

function validateDecision(record, index, context) {
  const label = `資格化決定第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, DECISION_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.decisionId, `${label} ID`);
  requireId(record.runId, `${label}執行 ID`);
  const run = context.runs.get(record.runId);
  if (!run) fail(`${label}引用不存在的計算執行紀錄。`);
  if (run.state !== 'current') fail(`${label}只能針對 current 計算執行紀錄。`);
  if (!Array.isArray(record.comparisonIds) || !record.comparisonIds.length) fail(`${label}至少要引用一份獨立比較。`);
  record.comparisonIds.forEach((id, comparisonIndex) => requireId(id, `${label}比較 ID 第 ${comparisonIndex + 1} 項`));
  if (new Set(record.comparisonIds).size !== record.comparisonIds.length || JSON.stringify(record.comparisonIds) !== JSON.stringify([...record.comparisonIds].sort())) fail(`${label}比較 ID 必須排序且不得重複。`);
  requireEnum(record.claimedLevel, ['G1', 'G2'], `${label}層級`);
  requireText(record.basedOnDecisionId, `${label}前一決定 ID`, 80, true);
  requireText(record.reviewer, `${label}複核人`, 100);
  requireText(record.basis, `${label}決定依據`, 1000);
  requireIso(record.decidedAt, `${label}決定時間`);
  validateEvidence(record.decisionReceipt, `${label}決定收據`);
  if (Date.parse(record.decidedAt) > Date.parse(context.updatedAt)) fail(`${label}時間不得晚於案件包更新時間。`);
  const comparisons = record.comparisonIds.map(id => context.comparisons.get(id));
  if (comparisons.some(item => !item || item.runId !== record.runId)) fail(`${label}比較不存在或屬於其他計算執行。`);
  if (!comparisons.some(item => comparisonSupportsLevel(item, record.claimedLevel))) fail(`${label}沒有一份獨立比較完整覆蓋 ${record.claimedLevel} 必要斷言。`);
  if (comparisons.some(item => !item.pass || !item.independentFromProductionCore || item.referenceMethod === 'same-core-replay')) fail(`${label}不得引用失敗或非獨立比較。`);
  if (comparisons.some(item => Date.parse(record.decidedAt) < Date.parse(item.comparedAt))) fail(`${label}時間不得早於引用的獨立比較。`);
  if ((context.openDiscrepanciesByRun.get(record.runId) || 0) > 0) fail(`${label}不得在差異仍 open 時宣稱資格化。`);
  if ((context.unhandledFailedComparisonsByRun.get(record.runId) || 0) > 0) fail(`${label}不得略過尚未完成處置的失敗獨立比較。`);
  const laterDisposition = (context.discrepanciesByRun.get(record.runId) || [])
    .find(item => item.state !== 'open' && Date.parse(item.resolvedAt) > Date.parse(record.decidedAt));
  if (laterDisposition) fail(`${label}不得早於差異處置完成時間。`);
  if (record.claimedLevel === 'G1') {
    if (record.basedOnDecisionId !== '') fail(`${label}G1 不得引用前一資格化決定。`);
  } else {
    if (context.caseRecord.sourceKind !== 'real-case') fail(`${label}只有真實案件可以宣稱 G2。`);
    if (!context.caseRecord.externalCaseId || isEmptyEvidence(context.caseRecord.caseSourceArtifact)) fail(`${label}G2 必須綁定外部案件 ID 與案件來源證據。`);
    if (!context.caseRecord.intendedUse || !context.caseRecord.permissibleUse || !context.caseRecord.limitations.length
        || !context.caseRecord.exclusions.length || !context.caseRecord.governingStandards.length) fail(`${label}G2 必須完整列明用途、限制、排除項與規範依據。`);
    requireId(record.basedOnDecisionId, `${label}前一 G1 決定 ID`);
    const prior = context.decisions.get(record.basedOnDecisionId);
    if (!prior || prior.runId !== record.runId || prior.claimedLevel !== 'G1' || Date.parse(prior.decidedAt) >= Date.parse(record.decidedAt)) fail(`${label}必須引用同一執行且時間較早的 G1 決定。`);
  }
  return record;
}

function validateFormalAdoption(record, index, context) {
  const label = `附件內部採用第 ${index + 1} 筆`;
  try { Compare.exactKeys(record, ADOPTION_FIELDS, label); } catch (error) { fail(error.message); }
  requireId(record.adoptionId, `${label} ID`);
  requireId(record.runId, `${label}執行 ID`);
  const run = context.runs.get(record.runId);
  if (!run || run.state !== 'current') fail(`${label}只能引用 current 計算執行紀錄。`);
  requireId(record.qualificationDecisionId, `${label}G2 決定 ID`);
  const decision = context.decisions.get(record.qualificationDecisionId);
  if (!decision || decision.runId !== record.runId || decision.claimedLevel !== 'G2') fail(`${label}必須引用同一執行的 G2 決定。`);
  requireId(record.artifactReviewId, `${label}附件審閱 ID`);
  const review = context.reviews.get(record.artifactReviewId);
  if (!review || review.runId !== record.runId || review.state !== 'pass') fail(`${label}必須引用同一執行且已通過的附件審閱。`);
  if (review.artifact.file !== run.outputArtifact.file || review.artifact.bytes !== run.outputArtifact.bytes
      || review.artifact.sha256 !== run.outputArtifact.sha256) fail(`${label}附件審閱成品必須精確綁定該次執行輸出。`);
  if (!FORMAL_ARTIFACT_EXTENSIONS.includes(path.posix.extname(review.artifact.file).toLowerCase())) fail(`${label}只能採用 PDF、DOCX、XLSX 或 HTML 成品。`);
  requireText(record.reviewer, `${label}採用人`, 100);
  requireText(record.basis, `${label}採用依據`, 1000);
  requireIso(record.adoptedAt, `${label}採用時間`);
  validateEvidence(record.adoptionReceipt, `${label}採用收據`);
  if (Date.parse(record.adoptedAt) < Date.parse(decision.decidedAt) || Date.parse(record.adoptedAt) < Date.parse(review.reviewedAt)) fail(`${label}時間不得早於 G2 決定或附件審閱。`);
  if (Date.parse(record.adoptedAt) > Date.parse(context.updatedAt)) fail(`${label}時間不得晚於案件包更新時間。`);
  return record;
}

function validateReportPackage(record, context) {
  try { Compare.exactKeys(record, REPORT_PACKAGE_FIELDS, '報告附件編排'); } catch (error) { fail(error.message); }
  requireEnum(record.state, REPORT_PACKAGE_STATES, '報告附件編排狀態');
  requireText(record.templateId, '報告範本 ID', 100, true);
  requireText(record.templateVersion, '報告範本版本', 100, true);
  if (!Array.isArray(record.sections)) fail('報告附件編排章節必須是陣列。');
  const seenRuns = new Set();
  const seenAppendix = new Set();
  record.sections.forEach((section, index) => {
    try { Compare.exactKeys(section, REPORT_SECTION_FIELDS, `報告附件編排第 ${index + 1} 節`); } catch (error) { fail(error.message); }
    if (!Number.isSafeInteger(section.order) || section.order !== index + 1) fail('報告附件編排順序必須由 1 連續遞增。');
    requireId(section.runId, `報告附件編排第 ${index + 1} 節執行 ID`);
    if (!context.runs.has(section.runId) || seenRuns.has(section.runId)) fail('報告附件編排不得引用不存在或重複的計算執行。');
    seenRuns.add(section.runId);
    requireText(section.formalAdoptionId, `報告附件編排第 ${index + 1} 節內部採用 ID`, 80, true);
    requireText(section.title, `報告附件編排第 ${index + 1} 節標題`, 300);
    requireText(section.appendixNo, `報告附件編排第 ${index + 1} 節附件編號`, 100);
    if (seenAppendix.has(section.appendixNo)) fail('報告附件編排附件編號不得重複。');
    seenAppendix.add(section.appendixNo);
  });
  validateEvidence(record.renderedArtifact, '報告附件編排成品', true);
  validateFormalVisibilityEvidence(
    record.renderedArtifact,
    record.renderedVisibilityEvidenceArtifact,
    '報告附件編排成品',
    ['rendered', 'adopted'].includes(record.state),
  );
  requireText(record.adoptedBy, '報告附件編排採用人', 100, true);
  requireText(record.adoptedAt, '報告附件編排採用時間', 40, true);
  requireText(record.adoptionBasis, '報告附件編排採用依據', 1000, true);
  validateEvidence(record.adoptionReceipt, '報告附件編排採用收據', true);

  if (record.state === 'unplanned') {
    if (record.templateId || record.templateVersion || record.sections.length || !isEmptyEvidence(record.renderedArtifact)
        || !isEmptyEvidence(record.renderedVisibilityEvidenceArtifact)
        || record.adoptedBy || record.adoptedAt || record.adoptionBasis || !isEmptyEvidence(record.adoptionReceipt)) fail('未規劃的報告附件編排不得預填範本、章節、成品或採用資料。');
    return;
  }
  if (!record.templateId || !record.templateVersion || !record.sections.length) fail('已規劃的報告附件編排必須指定範本與至少一節。');
  if (['ready-for-render', 'rendered', 'adopted'].includes(record.state)) {
    record.sections.forEach(section => {
      requireId(section.formalAdoptionId, `報告附件編排 ${section.appendixNo} 內部採用 ID`);
      const adoption = context.adoptions.get(section.formalAdoptionId);
      if (!adoption || adoption.runId !== section.runId) fail(`報告附件編排 ${section.appendixNo} 必須引用同一執行的內部採用紀錄。`);
    });
  }
  if (['rendered', 'adopted'].includes(record.state) && isEmptyEvidence(record.renderedArtifact)) fail('已渲染或採用的報告附件編排必須保存實際成品。');
  if (['rendered', 'adopted'].includes(record.state)
      && !FORMAL_ARTIFACT_EXTENSIONS.includes(path.posix.extname(record.renderedArtifact.file).toLowerCase())) fail('報告附件編排成品只接受 PDF、DOCX、XLSX 或 HTML。');
  if (!['rendered', 'adopted'].includes(record.state) && !isEmptyEvidence(record.renderedArtifact)) fail('報告附件編排尚未渲染時不得預填成品。');
  if (record.state === 'adopted') {
    requireText(record.adoptedBy, '報告附件編排採用人', 100);
    requireIso(record.adoptedAt, '報告附件編排採用時間');
    requireText(record.adoptionBasis, '報告附件編排採用依據', 1000);
    if (isEmptyEvidence(record.adoptionReceipt)) fail('報告附件編排採用時必須保存採用收據。');
    const latestAdoption = Math.max(...record.sections.map(section => Date.parse(context.adoptions.get(section.formalAdoptionId).adoptedAt)));
    if (Date.parse(record.adoptedAt) < latestAdoption || Date.parse(record.adoptedAt) > Date.parse(context.updatedAt)) fail('報告附件編排採用時間不得早於附件內部採用或晚於案件包更新時間。');
  } else if (record.adoptedBy || record.adoptedAt || record.adoptionBasis || !isEmptyEvidence(record.adoptionReceipt)) fail('報告附件編排未採用時不得預填採用資料。');
}

function physicalFile(filePath, label, maxBytes = MAX_BUNDLE_BYTES) {
  const resolved = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(resolved)) throw new UsageError(`${label}不存在：${path.basename(resolved) || '(未指定)'}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label}必須是實體檔案。`);
  if (stat.nlink > 1) fail(`${label}不得是硬連結。`);
  if (stat.size <= 0 || stat.size > maxBytes) fail(`${label}大小不受支援。`);
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (path.resolve(realPath).toLowerCase() !== resolved.toLowerCase()) fail(`${label}不得透過連結重新導向。`);
  return { resolved, stat };
}

function readStrictJsonFile(filePath, label = '工程資格化案件包') {
  const identity = physicalFile(filePath, label);
  const raw = fs.readFileSync(identity.resolved, 'utf8');
  let duplicates;
  try { duplicates = Verifier.findDuplicateJsonKeys(raw); } catch (error) { fail(`${label}無法完成 JSON 欄位唯一性檢查：${error.message}`); }
  if (duplicates.length) fail(`${label}含重複 JSON 欄位：${duplicates.slice(0, 5).map(item => item.pointer).join('、')}。`);
  try { return { record: JSON.parse(raw), filePath: identity.resolved, raw }; } catch (error) { fail(`${label}不是有效 JSON：${error.message}`); }
}

function verifyLoadedJsonStability(loaded, label = '工程資格化案件包') {
  const identity = physicalFile(loaded.filePath, label);
  const currentRaw = fs.readFileSync(identity.resolved, 'utf8');
  if (identity.resolved !== loaded.filePath || currentRaw !== loaded.raw) fail(`${label}在驗證期間發生變更。`);
}

function verifyEvidenceFile(baseDirectory, evidence, label, observed) {
  if (isEmptyEvidence(evidence)) return;
  const relative = normalizeEvidencePath(evidence.file, label);
  const resolvedBase = path.resolve(baseDirectory);
  const resolved = path.resolve(resolvedBase, ...relative.split('/'));
  const basePrefix = `${resolvedBase.toLowerCase()}${path.sep}`;
  if (!resolved.toLowerCase().startsWith(basePrefix)) fail(`${label}越出案件工作區。`);
  if (!fs.existsSync(resolved)) fail(`${label}不存在：${relative}。`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) fail(`${label}必須是案件工作區內的單一實體檔案。`);
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (path.resolve(realPath).toLowerCase() !== resolved.toLowerCase()) fail(`${label}不得透過連結重新導向。`);
  const portableKey = relative.toLowerCase();
  const prior = observed.get(portableKey);
  if (prior && prior.relative !== relative) fail(`${label}與 ${prior.relative} 形成不分大小寫路徑碰撞。`);
  const buffer = fs.readFileSync(resolved);
  const sha256 = Verifier.sha256Buffer(buffer);
  if (buffer.length !== evidence.bytes || sha256 !== evidence.sha256) fail(`${label}大小或 SHA-256 與案件包紀錄不一致。`);
  if (prior && (prior.bytes !== evidence.bytes || prior.sha256 !== evidence.sha256)) fail(`${label}同一路徑被記錄為不同內容。`);
  observed.set(portableKey, { relative, resolved, bytes: evidence.bytes, sha256: evidence.sha256 });
}

function verifyEvidenceStability(observed) {
  observed.forEach(item => {
    if (!fs.existsSync(item.resolved)) fail(`證據檔在驗證期間消失：${item.relative}。`);
    const stat = fs.lstatSync(item.resolved);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1 || stat.size !== item.bytes) fail(`證據檔在驗證期間改變：${item.relative}。`);
    const hash = Verifier.sha256Buffer(fs.readFileSync(item.resolved));
    if (hash !== item.sha256) fail(`證據檔在驗證期間改變：${item.relative}。`);
  });
}

function evidenceAbsolutePath(baseDirectory, evidence) {
  return path.resolve(path.resolve(baseDirectory), ...normalizeEvidencePath(evidence.file, '證據檔案').split('/'));
}

function jsonPointerValue(root, pointer, label) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) fail(`${label}必須是 RFC 6901 JSON Pointer。`);
  const parts = pointer.slice(1).split('/').map(part => {
    if (/~(?![01])/u.test(part)) fail(`${label}含無效 JSON Pointer 跳脫。`);
    return part.replace(/~1/gu, '/').replace(/~0/gu, '~');
  });
  let cursor = root;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) fail(`${label}找不到：${pointer}。`);
    cursor = cursor[part];
  }
  return cursor;
}

function verifyComparisonData(baseDirectory, comparison, run) {
  const label = `獨立比較 ${comparison.comparisonId} 比較資料`;
  if (path.posix.extname(comparison.comparisonDataArtifact.file).toLowerCase() !== '.json') fail(`${label}必須是 JSON。`);
  const loaded = readStrictJsonFile(evidenceAbsolutePath(baseDirectory, comparison.comparisonDataArtifact), label);
  const productionData = readStrictJsonFile(evidenceAbsolutePath(baseDirectory, run.resultDataArtifact), `計算執行 ${run.runId} 機讀結果`);
  const referenceData = readStrictJsonFile(evidenceAbsolutePath(baseDirectory, comparison.referenceDataArtifact), `獨立比較 ${comparison.comparisonId} 基準機讀資料`);
  try { Compare.exactKeys(loaded.record, COMPARISON_DATA_FIELDS, label); } catch (error) { fail(error.message); }
  const data = loaded.record;
  if (data.schemaVersion !== 1 || data.kind !== COMPARISON_DATA_KIND || data.comparisonId !== comparison.comparisonId || data.runId !== comparison.runId) fail(`${label}版本或比較身分不一致。`);
  if (data.productionOutputSha256 !== run.outputArtifact.sha256
      || data.productionResultDataSha256 !== run.resultDataArtifact.sha256
      || data.referenceArtifactSha256 !== comparison.referenceArtifact.sha256
      || data.referenceDataArtifactSha256 !== comparison.referenceDataArtifact.sha256) fail(`${label}未綁定正式輸出、正式機讀結果、獨立基準與基準機讀資料雜湊。`);
  if (!Array.isArray(data.assertions)
      || History.canonicalJson(data.assertions) !== History.canonicalJson(comparison.assertions)) fail(`${label}斷言值未與正規化比較資料一致。`);
  comparison.assertions.forEach(assertion => {
    const expected = jsonPointerValue(referenceData.record, assertion.expectedPointer, `${label}斷言 ${assertion.assertionId} 基準指標`);
    const actual = jsonPointerValue(productionData.record, assertion.actualPointer, `${label}斷言 ${assertion.assertionId} 正式結果指標`);
    if (assertion.type === 'numeric') {
      if (typeof expected !== 'number' || !Number.isFinite(expected) || typeof actual !== 'number' || !Number.isFinite(actual)
          || expected !== assertion.expectedNumber || actual !== assertion.actualNumber) fail(`${label}斷言 ${assertion.assertionId} 未從兩側機讀資料取得相同數值。`);
    } else if (typeof expected !== 'string' || typeof actual !== 'string'
        || expected !== assertion.expectedText || actual !== assertion.actualText) fail(`${label}斷言 ${assertion.assertionId} 未從兩側機讀資料取得相同文字。`);
  });
  verifyLoadedJsonStability(loaded, label);
  verifyLoadedJsonStability(productionData, `計算執行 ${run.runId} 機讀結果`);
  verifyLoadedJsonStability(referenceData, `獨立比較 ${comparison.comparisonId} 基準機讀資料`);
}

function verifyFormalArtifact(baseDirectory, evidence, label, expectedFingerprints = [], visibilityEvidenceArtifact = emptyEvidence()) {
  const extension = path.posix.extname(evidence.file).toLowerCase();
  if (!FORMAL_ARTIFACT_EXTENSIONS.includes(extension)) fail(`${label}只接受 PDF、DOCX、XLSX 或 HTML。`);
  const filePath = evidenceAbsolutePath(baseDirectory, evidence);
  if (extension === '.html') {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 4096);
    if (!/(?:<!doctype\s+html|<html\b)/iu.test(head)) fail(`${label}不是可辨識的 HTML 文件。`);
  }
  const inspection = Checker.inspectAttachment(filePath, baseDirectory);
  if (inspection.errors.length || inspection.sourceSha256 !== evidence.sha256 || inspection.textLength <= 0) {
    const detail = inspection.errors.slice(0, 3).join('；') || '文件沒有可讀內容或雜湊不一致';
    fail(`${label}不是可解析的正式文件：${detail}。`);
  }
  const requiredVisibilityStatus = extension === '.pdf' ? 'verified' : 'bounded';
  if (inspection.visibilityEvidence?.status !== requiredVisibilityStatus) {
    const reasons = inspection.visibilityEvidence?.reasons?.join('、') || '缺少可見內容邊界';
    fail(`${label}可見性證據未通過：${reasons}。`);
  }
  if (extension === '.pdf'
      && inspection.visibilityEvidence.evidenceFile !== path.posix.basename(visibilityEvidenceArtifact.file)) {
    fail(`${label}使用的 PDF 可見性證據未與案件包紀錄一致。`);
  }
  const observedFingerprints = new Set((inspection.fingerprints || []).map(value => String(value).toUpperCase()));
  const missingFingerprints = expectedFingerprints.filter(value => !observedFingerprints.has(String(value).toUpperCase()));
  if (missingFingerprints.length) fail(`${label}可見內容缺少對應計算指紋：${missingFingerprints.join('、')}。`);
}

function validateBundle(record, options = {}) {
  try { Compare.exactKeys(record, TOP_FIELDS, '工程資格化案件包'); } catch (error) { fail(error.message); }
  if (record.schemaVersion !== SCHEMA_VERSION || record.kind !== KIND) fail('工程資格化案件包版本或種類不受支援。');
  requireEnum(record.lifecycle, ['draft', 'sealed'], '工程資格化案件包生命週期');
  requireIso(record.createdAt, '工程資格化案件包建立時間');
  requireIso(record.updatedAt, '工程資格化案件包更新時間');
  requireIso(record.sealedAt, '工程資格化案件包封印時間', record.lifecycle === 'draft');
  const nowMilliseconds = Date.now();
  if (Date.parse(record.createdAt) > nowMilliseconds + MAX_FUTURE_SKEW_MILLISECONDS
      || Date.parse(record.updatedAt) > nowMilliseconds + MAX_FUTURE_SKEW_MILLISECONDS) fail('案件包時間不得晚於目前時間的合理誤差範圍。');
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) fail('案件包更新時間不得早於建立時間。');
  if (record.lifecycle === 'draft' && record.sealedAt !== '') fail('draft 案件包不得有封印時間。');
  if (record.lifecycle === 'sealed' && record.sealedAt !== record.updatedAt) fail('sealed 案件包的封印時間必須等於最後更新時間。');
  if (typeof record.bundleFingerprint !== 'string' || !/^EQB-[0-9A-F]{24}$/.test(record.bundleFingerprint)
      || record.bundleFingerprint !== bundleFingerprint(record)) fail('工程資格化案件包指紋無效或與內容不一致。');
  try { Compare.exactKeys(record.boundary, BOUNDARY_FIELDS, '工程資格化案件包邊界'); } catch (error) { fail(error.message); }
  if (History.canonicalJson(record.boundary) !== History.canonicalJson(qualificationBoundary())) fail('工程資格化案件包邊界無效。');
  validateCase(record.case);

  validateUniqueIds(record.calculationRuns, 'runId', '計算執行紀錄');
  const runs = new Map(record.calculationRuns.map((item, index) => {
    validateRun(item, index, record.updatedAt);
    return [item.runId, item];
  }));
  const successorByRunId = new Map();
  record.calculationRuns.forEach(item => {
    if (item.supersedesRunId) {
      const prior = runs.get(item.supersedesRunId);
      if (!prior || item.supersedesRunId === item.runId) fail(`計算執行 ${item.runId} 的前一執行 ID 無效。`);
      if (prior.toolId !== item.toolId || Date.parse(prior.executedAt) >= Date.parse(item.executedAt)) fail(`計算執行 ${item.runId} 只能取代同一工具且時間較早的執行。`);
      if (!['stale', 'superseded', 'rejected'].includes(prior.state)) fail(`計算執行 ${item.runId} 的前一執行必須已標示 stale、superseded 或 rejected。`);
      if (successorByRunId.has(prior.runId)) fail(`計算執行 ${prior.runId} 不得分叉為多個後續執行。`);
      successorByRunId.set(prior.runId, item);
    }
  });
  const fingerprints = new Map();
  record.calculationRuns.forEach(run => {
    const signature = `${run.toolId}\u0000${run.toolVersion}\u0000${run.engineVersion}\u0000${run.inputArtifact.sha256}\u0000${run.resultDataArtifact.sha256}\u0000${run.outputArtifact.sha256}`;
    const prior = fingerprints.get(run.calculationFingerprint);
    if (prior && prior !== signature) fail(`計算指紋 ${run.calculationFingerprint} 被不同工具版本、引擎、輸入或輸出重用。`);
    fingerprints.set(run.calculationFingerprint, signature);
  });

  validateUniqueIds(record.independentComparisons, 'comparisonId', '獨立比較');
  const comparisons = new Map(record.independentComparisons.map((item, index) => {
    const validated = validateComparison(item, index, runs, record.updatedAt);
    return [item.comparisonId, validated];
  }));

  validateUniqueIds(record.discrepancies, 'discrepancyId', '差異處置');
  const openDiscrepanciesByRun = new Map();
  const discrepanciesByRun = new Map();
  const dispositionsByComparison = new Map();
  record.discrepancies.forEach((item, index) => {
    const validated = validateDiscrepancy(item, index, comparisons, record.updatedAt);
    if (!discrepanciesByRun.has(validated.runId)) discrepanciesByRun.set(validated.runId, []);
    discrepanciesByRun.get(validated.runId).push(item);
    if (!dispositionsByComparison.has(validated.comparisonId)) dispositionsByComparison.set(validated.comparisonId, []);
    dispositionsByComparison.get(validated.comparisonId).push(item);
    if (item.state === 'open') openDiscrepanciesByRun.set(validated.runId, (openDiscrepanciesByRun.get(validated.runId) || 0) + 1);
  });
  const unhandledFailedComparisonsByRun = new Map();
  comparisons.forEach(comparison => {
    if (!comparison.independentFromProductionCore || comparison.pass) return;
    const failedAssertionIds = [...comparison.assertionResults.entries()].filter(([, pass]) => !pass).map(([id]) => id);
    const dispositions = (dispositionsByComparison.get(comparison.comparisonId) || []).filter(item => item.state !== 'open');
    const wholeComparisonDisposition = dispositions.some(item => item.assertionId === '');
    const covered = wholeComparisonDisposition || failedAssertionIds.every(id => dispositions.some(item => item.assertionId === id));
    if (!covered) unhandledFailedComparisonsByRun.set(comparison.runId, (unhandledFailedComparisonsByRun.get(comparison.runId) || 0) + 1);
  });

  validateUniqueIds(record.artifactReviews, 'reviewId', '附件審閱');
  const reviews = new Map(record.artifactReviews.map((item, index) => [item.reviewId, validateArtifactReview(item, index, runs, record.updatedAt)]));

  validateUniqueIds(record.qualificationDecisions, 'decisionId', '資格化決定');
  const decisions = new Map();
  const decisionContext = {
    runs, comparisons, openDiscrepanciesByRun, unhandledFailedComparisonsByRun,
    discrepanciesByRun, caseRecord: record.case, decisions, updatedAt: record.updatedAt,
  };
  const orderedDecisions = [...record.qualificationDecisions].sort((left, right) => Date.parse(left.decidedAt) - Date.parse(right.decidedAt));
  orderedDecisions.forEach((item, index) => {
    validateDecision(item, index, decisionContext);
    decisions.set(item.decisionId, item);
  });
  const decisionKinds = new Set();
  decisions.forEach(item => {
    const key = `${item.runId}\u0000${item.claimedLevel}`;
    if (decisionKinds.has(key)) fail(`計算執行 ${item.runId} 的 ${item.claimedLevel} 決定不得重複。`);
    decisionKinds.add(key);
  });

  validateUniqueIds(record.formalAdoptions, 'adoptionId', '附件內部採用');
  const adoptionContext = { runs, decisions, reviews, updatedAt: record.updatedAt };
  const adoptions = new Map(record.formalAdoptions.map((item, index) => [item.adoptionId, validateFormalAdoption(item, index, adoptionContext)]));
  validateReportPackage(record.reportPackage, { runs, adoptions, updatedAt: record.updatedAt });

  const runLevels = new Map(record.calculationRuns.map(run => [run.runId, 'none']));
  decisions.forEach(decision => {
    if (LEVEL_RANK[decision.claimedLevel] > LEVEL_RANK[runLevels.get(decision.runId)]) runLevels.set(decision.runId, decision.claimedLevel);
  });
  adoptions.forEach(adoption => runLevels.set(adoption.runId, 'G3'));

  if (options.baseDirectory) {
    const observed = new Map();
    verifyEvidenceFile(options.baseDirectory, record.case.caseSourceArtifact, '案件來源證據', observed);
    record.calculationRuns.forEach(run => {
      verifyEvidenceFile(options.baseDirectory, run.inputArtifact, `計算執行 ${run.runId} 輸入`, observed);
      verifyEvidenceFile(options.baseDirectory, run.resultDataArtifact, `計算執行 ${run.runId} 機讀結果`, observed);
      verifyEvidenceFile(options.baseDirectory, run.outputArtifact, `計算執行 ${run.runId} 輸出`, observed);
    });
    record.independentComparisons.forEach(item => {
      verifyEvidenceFile(options.baseDirectory, item.referenceArtifact, `獨立比較 ${item.comparisonId} 基準`, observed);
      verifyEvidenceFile(options.baseDirectory, item.referenceDataArtifact, `獨立比較 ${item.comparisonId} 基準機讀資料`, observed);
      verifyEvidenceFile(options.baseDirectory, item.comparisonDataArtifact, `獨立比較 ${item.comparisonId} 比較資料`, observed);
    });
    record.qualificationDecisions.forEach(item => verifyEvidenceFile(options.baseDirectory, item.decisionReceipt, `資格化決定 ${item.decisionId} 收據`, observed));
    record.artifactReviews.forEach(item => {
      verifyEvidenceFile(options.baseDirectory, item.artifact, `附件審閱 ${item.reviewId} 成品`, observed);
      verifyEvidenceFile(options.baseDirectory, item.visibilityEvidenceArtifact, `附件審閱 ${item.reviewId} PDF 可見性證據`, observed);
      verifyEvidenceFile(options.baseDirectory, item.reviewReceipt, `附件審閱 ${item.reviewId} 收據`, observed);
    });
    record.formalAdoptions.forEach(item => verifyEvidenceFile(options.baseDirectory, item.adoptionReceipt, `附件內部採用 ${item.adoptionId} 收據`, observed));
    verifyEvidenceFile(options.baseDirectory, record.reportPackage.renderedArtifact, '報告附件編排成品', observed);
    verifyEvidenceFile(options.baseDirectory, record.reportPackage.renderedVisibilityEvidenceArtifact, '報告附件編排 PDF 可見性證據', observed);
    verifyEvidenceFile(options.baseDirectory, record.reportPackage.adoptionReceipt, '報告附件編排採用收據', observed);
    if (typeof options.beforeStabilityCheck === 'function') options.beforeStabilityCheck({ observed, record });
    verifyEvidenceStability(observed);
    record.independentComparisons.forEach(item => verifyComparisonData(options.baseDirectory, item, runs.get(item.runId)));
    record.artifactReviews.filter(item => item.state === 'pass')
      .forEach(item => verifyFormalArtifact(
        options.baseDirectory,
        item.artifact,
        `附件審閱 ${item.reviewId} 成品`,
        [runs.get(item.runId).calculationFingerprint],
        item.visibilityEvidenceArtifact,
      ));
    if (['rendered', 'adopted'].includes(record.reportPackage.state)) verifyFormalArtifact(
      options.baseDirectory,
      record.reportPackage.renderedArtifact,
      '報告附件編排成品',
      record.reportPackage.sections.map(section => runs.get(section.runId).calculationFingerprint),
      record.reportPackage.renderedVisibilityEvidenceArtifact,
    );
  }

  const currentRuns = record.calculationRuns.filter(run => run.state === 'current');
  const endsAtCurrent = run => {
    let cursor = run;
    while (successorByRunId.has(cursor.runId)) cursor = successorByRunId.get(cursor.runId);
    return cursor.state === 'current' && cursor.toolId === run.toolId;
  };
  const pendingRuns = record.calculationRuns.filter(run => run.state === 'candidate'
    || (['stale', 'superseded'].includes(run.state) && !endsAtCurrent(run)));
  const evidenceVerified = Boolean(options.baseDirectory);
  const qualificationReady = evidenceVerified && record.lifecycle === 'sealed' && currentRuns.length
    && currentRuns.every(run => LEVEL_RANK[runLevels.get(run.runId)] >= LEVEL_RANK.G1)
    && !pendingRuns.length;
  const minimumCurrentLevel = currentRuns.length
    ? currentRuns.map(run => runLevels.get(run.runId)).reduce((lowest, level) => LEVEL_RANK[level] < LEVEL_RANK[lowest] ? level : lowest, 'G3')
    : 'none';
  const qualificationStatus = qualificationReady ? minimumCurrentLevel : 'review';
  const highestLevel = [...runLevels.values()].reduce((best, level) => LEVEL_RANK[level] > LEVEL_RANK[best] ? level : best, 'none');
  return {
    status: qualificationReady ? 'ready' : 'review',
    qualificationStatus,
    minimumCurrentLevel,
    highestLevel,
    reportPackageState: record.reportPackage.state,
    bundleFingerprint: record.bundleFingerprint,
    currentRuns: currentRuns.length,
    qualifiedCurrentRuns: currentRuns.filter(run => LEVEL_RANK[runLevels.get(run.runId)] >= LEVEL_RANK.G1).length,
    evidenceVerified,
    attestation: record.boundary.attestation,
    runLevels: Object.fromEntries([...runLevels.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

function inspectBundleFile(filePath, options = {}) {
  requirePrivateWorkspaceLocation(filePath, '工程資格化案件包');
  const loaded = readStrictJsonFile(filePath);
  const result = validateBundle(loaded.record, { ...options, baseDirectory: path.dirname(loaded.filePath) });
  if (typeof options.beforeBundleStabilityCheck === 'function') options.beforeBundleStabilityCheck({ loaded, record: loaded.record });
  verifyLoadedJsonStability(loaded);
  if (loaded.record.lifecycle === 'sealed' && path.basename(loaded.filePath) !== `case-bundle-${loaded.record.bundleFingerprint}.json`) fail('sealed 案件包檔名必須綁定案件包指紋。');
  return { ...result, fileName: path.basename(loaded.filePath) };
}

function buildInitialBundle(options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  requireIso(createdAt, '案件包建立時間');
  const record = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    lifecycle: 'draft',
    createdAt,
    updatedAt: createdAt,
    sealedAt: '',
    bundleFingerprint: '',
    boundary: qualificationBoundary(),
    case: {
      caseId: options.caseId,
      caseLabel: options.caseLabel,
      sourceKind: options.sourceKind,
      externalCaseId: '',
      caseSourceArtifact: emptyEvidence(),
      projectName: '',
      projectNo: '',
      designer: '',
      intendedUse: '',
      permissibleUse: '',
      limitations: [],
      exclusions: [],
      governingStandards: [],
    },
    calculationRuns: [],
    independentComparisons: [],
    discrepancies: [],
    artifactReviews: [],
    qualificationDecisions: [],
    formalAdoptions: [],
    reportPackage: {
      state: 'unplanned',
      templateId: '',
      templateVersion: '',
      sections: [],
      renderedArtifact: emptyEvidence(),
      renderedVisibilityEvidenceArtifact: emptyEvidence(),
      adoptedBy: '',
      adoptedAt: '',
      adoptionBasis: '',
      adoptionReceipt: emptyEvidence(),
    },
  };
  record.bundleFingerprint = bundleFingerprint(record);
  validateBundle(record);
  return record;
}

function initWorkspace(directory, options = {}) {
  const target = path.resolve(directory || '');
  if (!directory) throw new UsageError('請指定新工作區資料夾。');
  requirePrivateWorkspaceLocation(target, '工程資格化案件工作區');
  if (fs.existsSync(target)) throw new UsageError(`工作區已存在，為避免覆寫而停止：${target}`);
  const parent = path.dirname(target);
  if (!fs.existsSync(parent) || !fs.lstatSync(parent).isDirectory()) throw new UsageError(`工作區上層資料夾不存在：${parent}`);
  const temp = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  const record = buildInitialBundle(options);
  try {
    fs.mkdirSync(temp);
    ['inputs', 'outputs', 'references', 'reports'].forEach(name => fs.mkdirSync(path.join(temp, name)));
    fs.writeFileSync(path.join(temp, 'case-bundle.draft.json'), `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    inspectBundleFile(path.join(temp, 'case-bundle.draft.json'));
    fs.renameSync(temp, target);
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  return { status: 'review', qualificationStatus: 'review', minimumCurrentLevel: 'none', workspaceName: path.basename(target), fileName: 'case-bundle.draft.json', bundleFingerprint: record.bundleFingerprint };
}

function sealBundle(inputPath, options = {}) {
  requirePrivateWorkspaceLocation(inputPath, '工程資格化案件包草稿');
  const loaded = readStrictJsonFile(inputPath, '工程資格化案件包草稿');
  if (loaded.record.lifecycle !== 'draft') fail('只有 draft 案件包可以另建封印版本。');
  const record = JSON.parse(JSON.stringify(loaded.record));
  record.lifecycle = 'sealed';
  record.sealedAt = options.sealedAt || new Date().toISOString();
  requireIso(record.sealedAt, '案件包封印時間');
  record.updatedAt = record.sealedAt;
  record.bundleFingerprint = bundleFingerprint(record);
  const result = validateBundle(record, { baseDirectory: path.dirname(loaded.filePath) });
  if (typeof options.beforeDraftStabilityCheck === 'function') options.beforeDraftStabilityCheck({ loaded, record });
  verifyLoadedJsonStability(loaded, '工程資格化案件包草稿');
  const outputPath = path.join(path.dirname(loaded.filePath), `case-bundle-${record.bundleFingerprint}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    const verified = inspectBundleFile(outputPath);
    return { ...verified, outputFileName: path.basename(outputPath) };
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    throw error;
  }
}

function parseArgs(argv) {
  const options = { mode: '', input: '', directory: '', caseId: '', caseLabel: '', sourceKind: '', json: false };
  let modeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => argv[++index] || '';
    if (arg === '--input') { options.mode = 'inspect'; options.input = value(); modeCount += 1; }
    else if (arg === '--seal') { options.mode = 'seal'; options.input = value(); modeCount += 1; }
    else if (arg === '--init') { options.mode = 'init'; options.directory = value(); modeCount += 1; }
    else if (arg === '--case-id') options.caseId = value();
    else if (arg === '--case-label') options.caseLabel = value();
    else if (arg === '--source-kind') options.sourceKind = value();
    else if (arg === '--json') options.json = true;
    else throw new UsageError(`不支援的參數：${arg}`);
  }
  if (!options.mode || modeCount !== 1 || (options.mode === 'init' ? !options.directory : !options.input)) throw new UsageError('請擇一使用 --input、--seal 或 --init。');
  if (options.mode === 'init' && (!options.caseId || !options.caseLabel || !options.sourceKind)) throw new UsageError('--init 需要 --case-id、--case-label 與 --source-kind。');
  if (options.mode !== 'init' && (options.caseId || options.caseLabel || options.sourceKind)) throw new UsageError('案件身分參數只可搭配 --init。');
  return options;
}

function formatSummary(result, action) {
  const lines = [
    action === 'init' ? '工程資格化案件工作區已建立' : action === 'seal' ? '工程資格化案件包已另建封印版本' : '工程資格化案件包唯讀檢查',
    `案件包最低證據層級：${result.qualificationStatus}`,
    `案件包指紋：${result.bundleFingerprint}`,
  ];
  if (result.highestLevel) lines.push(`最高證據層級：${result.highestLevel}`);
  if (result.reportPackageState) lines.push(`報告附件編排：${result.reportPackageState}`);
  if (result.fileName || result.outputFileName) lines.push(`檔案：${result.outputFileName || result.fileName}`);
  lines.push('退出碼 0 只代表未簽署的內部證據紀錄完整；不代表工具認證、法定簽證或其他案件適用。');
  return lines.join('\n');
}

function runCli(argv) {
  const options = parseArgs(argv);
  let result;
  if (options.mode === 'init') result = initWorkspace(options.directory, { caseId: options.caseId, caseLabel: options.caseLabel, sourceKind: options.sourceKind });
  else if (options.mode === 'seal') result = sealBundle(options.input);
  else result = inspectBundleFile(options.input);
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${formatSummary(result, options.mode)}\n`);
  return result.status === 'ready' ? Checker.PACKAGE_STATUS_EXIT_CODES.ready : Checker.PACKAGE_STATUS_EXIT_CODES.review;
}

function usage() {
  return [
    '檢查：node engineering-qualification-case-bundle.js --input <case-bundle.json> [--json]',
    '建立：node engineering-qualification-case-bundle.js --init <新工作區> --case-id <穩定 ID> --case-label <顯示名稱> --source-kind real-case|synthetic|code-example [--json]',
    '封印：node engineering-qualification-case-bundle.js --seal <case-bundle.draft.json> [--json]',
    '案件包固定私有；正式附件仍交由既有 v3 附件包流程處理。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  try {
    process.exitCode = runCli(argv);
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    if (error instanceof UsageError) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
    } else {
      process.exitCode = Checker.PACKAGE_STATUS_EXIT_CODES.blocked;
    }
  }
}

if (require.main === module) main();

module.exports = {
  SCHEMA_VERSION,
  KIND,
  REPOSITORY_ROOT,
  MAX_BUNDLE_BYTES,
  MAX_EVIDENCE_BYTES,
  MAX_FUTURE_SKEW_MILLISECONDS,
  BOUNDARY_INSTRUCTION,
  COMPARISON_DATA_KIND,
  SOURCE_KINDS,
  RUN_STATES,
  REFERENCE_METHODS,
  ASSERTION_TYPES,
  REQUIRED_G1_ASSERTIONS,
  REQUIRED_G2_ASSERTIONS,
  REQUIRED_REPORT_CHECKS,
  FORMAL_ARTIFACT_EXTENSIONS,
  ContractError,
  UsageError,
  qualificationBoundary,
  isInsideDirectory,
  resolveThroughExistingAncestor,
  requirePrivateWorkspaceLocation,
  emptyEvidence,
  bundleFingerprint,
  qualificationRunFingerprint,
  assertionPass,
  validateBundle,
  readStrictJsonFile,
  verifyLoadedJsonStability,
  inspectBundleFile,
  buildInitialBundle,
  initWorkspace,
  sealBundle,
  parseArgs,
  formatSummary,
  runCli,
  usage,
  main,
};
