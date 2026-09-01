#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = (fs.realpathSync.native || fs.realpathSync)(path.resolve(__dirname, '..', '..'));
const CANDIDATE_KIND = 'beam-column-moment-real-case-intake.v1';
const CANDIDATE_STATUS = 'candidate-unvalidated';
const RECEIPT_KIND = 'beam-column-moment-real-case-intake-readiness-receipt.v1';
const RECEIPT_STATUS = 'intake-complete-manual-g1-work-required';
const RECEIPT_RELATIVE_PATH = 'references/beam-column-moment-real-case-intake-readiness.receipt.json';
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const TOOL_INPUT_SCHEMA_SHA256 = '02364ef067999cb23479eb061697f80aea6448f5f1ee14c7672d33705f1ed430';
const RECEIPT_NEXT_ACTION = '由案件負責人另行執行 production、規格化外部基準並完成人工 G1；本收據不建立 G1、G2、G3 或簽證。';
const REQUIRED_HUMAN_ACTIONS = Object.freeze([
  '由案件負責人綁定真實案號、來源證據、用途、限制、排除項、規範依據與 applicability。',
  '由案件負責人複核同一次 CF 的實際附件，並留存審閱與採用收據。',
]);

const TOP_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'status', 'boundary', 'caseIdentity', 'criteria',
  'toolInput', 'independentReference', 'requiredHumanActions',
]);
const CANDIDATE_BOUNDARY_FIELDS = Object.freeze([
  'sourceKind', 'calculatorExecuted', 'engineeringResultsCompared', 'g1', 'g2', 'g3',
  'completeJointDesign', 'legalSignoff', 'formalAttachmentApproval', 'pagesPublication',
]);
const RECEIPT_BOUNDARY_FIELDS = Object.freeze([
  'calculatorExecuted', 'engineeringResultsCompared', 'g1', 'g2', 'g3',
  'completeJointDesign', 'legalSignoff', 'formalAttachmentApproval', 'pagesPublication',
]);
const CASE_IDENTITY_FIELDS = Object.freeze([
  'externalCaseId', 'projectName', 'projectNo', 'designer', 'intendedUse', 'permissibleUse',
  'limitations', 'exclusions', 'governingStandards', 'caseSourceArtifactFile',
]);
const STANDARD_FIELDS = Object.freeze(['standardId', 'title', 'edition', 'clauses', 'sourceAuthority']);
const CRITERIA_FIELDS = Object.freeze([
  'definedAt', 'numericToleranceBasis', 'controlBranchExpected', 'decisionExpected',
  'outOfScopeExpected', 'applicabilityExpected',
]);
const REFERENCE_FIELDS = Object.freeze([
  'method', 'independentFromProductionCore', 'author', 'reviewer', 'createdAt', 'basis',
  'artifactFile', 'machineDataFile',
]);
const EVIDENCE_FIELDS = Object.freeze(['file', 'bytes', 'sha256']);
const RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'status', 'validatedAt', 'intakeFingerprint', 'fieldSchemaSha256',
  'intake', 'caseIdentitySha256', 'criteriaSha256', 'toolInputSha256', 'caseSourceArtifact',
  'referenceArtifact', 'referenceDataArtifact', 'boundary', 'nextAction',
]);
const EXTERNAL_REFERENCE_METHODS = Object.freeze([
  'hand-calculation', 'independent-spreadsheet', 'third-party-software',
]);
const PLACEHOLDER_PATTERN = /(?:示例|請依專案覆寫|請填|待補|未填|placeholder|\bTBD\b|\bTODO\b)/iu;
const WINDOWS_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const TOOL_INPUT_TYPES = Object.freeze({
  connectionTag: 'string',
  connectionType: 'string',
  designer: 'string',
  designMethod: 'string',
  exposureCondition: 'string',
  momentAllMembersIncludedConfirmed: 'boolean',
  momentAmplifiedShear: 'number',
  momentAvailableFlexuralStrength: 'number',
  momentAvailableShearStrength: 'number',
  momentAxis: 'string',
  momentBeamFlangeCompactnessRatio: 'number',
  momentBeamFlangePlasticModulusRatio: 'number',
  momentBeamFlangeThickness: 'number',
  momentBeamFlangeWidth: 'number',
  momentBeamLateralBracingConfirmed: 'boolean',
  momentBeamPlasticModulus: 'number',
  momentBeamWebCompactnessRatio: 'number',
  momentBeamYieldStrength: 'number',
  momentCapacityBasis: 'string',
  momentCapacityEvidenceSha256: 'string',
  momentCcwLeftBeamMoment: 'number',
  momentCcwLowerColumnMoment: 'number',
  momentCcwRightBeamMoment: 'number',
  momentCcwUpperColumnMoment: 'number',
  momentCns3506WeldConfirmed: 'boolean',
  momentColumnDepth: 'number',
  momentColumnFlangeLocalNominalStrength: 'number',
  momentColumnStrengthsAtGoverningAxialConfirmed: 'boolean',
  momentColumnWebYieldStrength: 'number',
  momentConnectionDesignRoute: 'string',
  momentConnectionHardwareVerifiedConfirmed: 'boolean',
  momentContinuityPlateProvidedConfirmed: 'boolean',
  momentContinuityPlateWeldConfirmed: 'boolean',
  momentCriticalSectionDistance: 'number',
  momentCwLeftBeamMoment: 'number',
  momentCwLowerColumnMoment: 'number',
  momentCwRightBeamMoment: 'number',
  momentCwUpperColumnMoment: 'number',
  momentDemandBasis: 'string',
  momentDesignBeamFlangeThickness: 'number',
  momentDesignFlangePlasticRatio: 'number',
  momentDoublerAttachmentConfirmed: 'boolean',
  momentDoublerPresent: 'boolean',
  momentElasticStoryDrift: 'number',
  momentEndTabsRemovedGroundConfirmed: 'boolean',
  momentExpectedStrengthFactor: 'number',
  momentFarCriticalSectionExpectedMoment: 'number',
  momentFrameSystem: 'string',
  momentGeometryBasis: 'string',
  momentGravityShear: 'number',
  momentJointLateralRestraintConfirmed: 'boolean',
  momentMatchingWeldConfirmed: 'boolean',
  momentMaterialBasis: 'string',
  momentNonlinearPlasticRotation: 'number',
  momentOpposingDirectionsConfirmed: 'boolean',
  momentOrthogonalDirectionSeparateConfirmed: 'boolean',
  momentPanelZoneAnalysisDemand: 'number',
  momentPanelZoneBasis: 'string',
  momentPanelZoneBeamMomentSum: 'number',
  momentPanelZoneClearDepth: 'number',
  momentPanelZoneClearWidth: 'number',
  momentPanelZoneLeverArm: 'number',
  momentPanelZoneThickness: 'number',
  momentPlasticHingeSpan: 'number',
  momentPlasticZoneGeometryConfirmed: 'boolean',
  momentPlasticZoneOpeningsAbsentConfirmed: 'boolean',
  momentQualificationBasis: 'string',
  momentQualificationConfigurationConfirmed: 'boolean',
  momentQualificationEvidenceSha256: 'string',
  momentQualificationFabricationConfirmed: 'boolean',
  momentQualificationGeometryConfirmed: 'boolean',
  momentQualificationMaterialConfirmed: 'boolean',
  momentQualificationProcedureConfirmed: 'boolean',
  momentQualificationRoute: 'string',
  momentQualificationTestCount: 'number',
  momentQualificationWeldingConfirmed: 'boolean',
  momentQualifiedPlasticRotation: 'number',
  momentRotationDemandMethod: 'string',
  momentSeismicMaterialConfirmed: 'boolean',
  momentSelectedAxisScopeConfirmed: 'boolean',
  momentStrongColumnBasis: 'string',
  momentSystemDuctilityR: 'number',
  momentTestBeamFlangeThickness: 'number',
  momentTestFlangePlasticRatio: 'number',
  momentThirdPartyReviewConfirmed: 'boolean',
  momentWeldProcedureMatchesQualificationConfirmed: 'boolean',
  notes: 'string',
  projectName: 'string',
});

const REQUIRED_BASIS_FIELDS = Object.freeze([
  'momentDemandBasis', 'momentGeometryBasis', 'momentMaterialBasis', 'momentCapacityBasis',
  'momentPanelZoneBasis', 'momentStrongColumnBasis', 'momentQualificationBasis',
]);
const SHA_FIELDS = Object.freeze(['momentQualificationEvidenceSha256', 'momentCapacityEvidenceSha256']);
const FIXED_SCOPE = Object.freeze({
  designMethod: 'LRFD',
  connectionType: 'beam_column_moment',
  momentFrameSystem: 'smrf',
  momentAxis: 'x',
  momentConnectionDesignRoute: 'reinforced',
  momentQualificationRoute: 'prior_test_similarity',
});

class IntakeContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntakeContractError';
  }
}

class IntakeUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntakeUsageError';
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonPointerPart(value) {
  return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

// This scanner mirrors the repository's attachment verifier without importing its
// document/checker dependency tree. Intake readiness must never load a calculator,
// renderer, office tool, child process, or benchmark runner.
function findDuplicateJsonKeys(value, maxDepth = 128) {
  const text = String(value);
  const duplicates = [];
  let index = 0;

  function fail(message) {
    throw new IntakeContractError(`${message}（字元 ${index + 1}）`);
  }
  function skipWhitespace() {
    while (index < text.length && /[\u0020\u0009\u000a\u000d]/u.test(text[index])) index += 1;
  }
  function parseString() {
    if (text[index] !== '"') fail('預期 JSON 字串');
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') index += 2;
      else if (text[index] === '"') {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); } catch (error) { fail(`JSON 字串無效：${error.message}`); }
      } else index += 1;
    }
    fail('JSON 字串未結束');
  }
  function scanValue(pointer, depth) {
    if (depth > maxDepth) throw new IntakeContractError(`JSON 巢狀深度超過 ${maxDepth} 層`);
    skipWhitespace();
    if (index >= text.length) fail('JSON 值不完整');
    if (text[index] === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') { index += 1; return; }
      while (index < text.length) {
        const key = parseString();
        const childPointer = `${pointer}/${jsonPointerPart(key)}`;
        if (keys.has(key)) duplicates.push({ key, pointer: childPointer });
        else keys.add(key);
        skipWhitespace();
        if (text[index] !== ':') fail('JSON 物件欄位缺少冒號');
        index += 1;
        scanValue(childPointer, depth + 1);
        skipWhitespace();
        if (text[index] === '}') { index += 1; return; }
        if (text[index] !== ',') fail('JSON 物件欄位之間缺少逗號');
        index += 1;
        skipWhitespace();
      }
      fail('JSON 物件未結束');
    }
    if (text[index] === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') { index += 1; return; }
      let itemIndex = 0;
      while (index < text.length) {
        scanValue(`${pointer}/${itemIndex}`, depth + 1);
        itemIndex += 1;
        skipWhitespace();
        if (text[index] === ']') { index += 1; return; }
        if (text[index] !== ',') fail('JSON 陣列項目之間缺少逗號');
        index += 1;
        skipWhitespace();
      }
      fail('JSON 陣列未結束');
    }
    if (text[index] === '"') { parseString(); return; }
    const start = index;
    while (index < text.length && !/[\u0020\u0009\u000a\u000d,}\]]/u.test(text[index])) index += 1;
    if (start === index) fail('JSON 值格式不正確');
    try { JSON.parse(text.slice(start, index)); } catch (error) { fail(`JSON 值無效：${error.message}`); }
  }

  scanValue('', 0);
  skipWhitespace();
  if (index !== text.length) fail('JSON 根值後仍有多餘內容');
  return duplicates;
}

function exactKeys(record, fields, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new IntakeContractError(`${label}必須是物件。`);
  }
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    const missing = expected.filter(key => !actual.includes(key));
    const extra = actual.filter(key => !expected.includes(key));
    throw new IntakeContractError(`${label}欄位不符封閉契約（missing=${missing.join(',') || 'none'}; extra=${extra.join(',') || 'none'}）。`);
  }
}

function requiredText(value, label, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  const maxLength = options.maxLength || 1000;
  if (typeof value !== 'string' || value !== value.trim() || value !== value.normalize('NFC')
      || /[\u0000-\u001f\u007f]/u.test(value) || value.length > maxLength || (!allowEmpty && !value)) {
    throw new IntakeContractError(`${label}必須是已 trim、NFC 正規化且不超過 ${maxLength} 字的可顯示文字。`);
  }
  return value;
}

function requiredNonPlaceholder(value, label, options = {}) {
  const result = requiredText(value, label, options);
  if (PLACEHOLDER_PATTERN.test(result)) throw new IntakeContractError(`${label}仍是占位文字。`);
  return result;
}

function requiredIso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new IntakeContractError(`${label}必須是標準 UTC ISO 時間。`);
  }
  return value;
}

function textList(value, label) {
  if (!Array.isArray(value) || !value.length) throw new IntakeContractError(`${label}必須是非空字串陣列。`);
  const normalized = value.map((item, index) => requiredNonPlaceholder(item, `${label}第 ${index + 1} 項`, { maxLength: 500 }));
  if (new Set(normalized).size !== normalized.length) throw new IntakeContractError(`${label}不得重複。`);
  return normalized;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function realPath(value) {
  return (fs.realpathSync.native || fs.realpathSync)(value);
}

function samePhysicalPath(left, right) {
  const leftResolved = path.resolve(left);
  const rightResolved = path.resolve(right);
  return process.platform === 'win32'
    ? leftResolved.toLowerCase() === rightResolved.toLowerCase()
    : leftResolved === rightResolved;
}

function fsIdentity(stat) {
  return `${String(stat.dev)}:${String(stat.ino)}`;
}

function lstatIdentity(value) {
  return fs.lstatSync(value, { bigint: true });
}

function physicalWorkspace(candidate) {
  const resolved = path.resolve(String(candidate || ''));
  if (!candidate || !fs.existsSync(resolved)) throw new IntakeUsageError('私有收件工作區不存在。');
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntakeContractError('私有收件工作區必須是實體資料夾。');
  const physical = realPath(resolved);
  if (!samePhysicalPath(physical, resolved)) throw new IntakeContractError('私有收件工作區不得透過連結或 reparse point 重新導向。');
  if (isInside(REPOSITORY_ROOT, physical) || isInside(physical, REPOSITORY_ROOT)) {
    throw new IntakeUsageError('私有收件工作區必須與工具程式庫完全分離，不得位於其內或作為其上層。');
  }
  return physical;
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value !== value.normalize('NFC')
      || value.includes('\\') || value.includes(':') || /[\u0000-\u001f\u007f]/u.test(value)
      || path.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new IntakeContractError(`${label}必須是 NFC POSIX 相對路徑。`);
  }
  const normalized = path.posix.normalize(value);
  const parts = normalized.split('/');
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')
      || parts.some(part => !part || part === '.' || part === '..' || WINDOWS_DEVICE_PATTERN.test(part))) {
    throw new IntakeContractError(`${label}不得越出工作區或使用 Windows 裝置名稱。`);
  }
  return normalized;
}

function physicalFile(workspace, relativePath, label, maxBytes) {
  const relative = normalizeRelativePath(relativePath, label);
  const resolved = path.resolve(workspace, ...relative.split('/'));
  if (!isInside(workspace, resolved) || !fs.existsSync(resolved)) throw new IntakeContractError(`${label}不存在。`);
  let descriptor;
  try {
    descriptor = fs.openSync(resolved, 'r');
    const opened = fs.fstatSync(descriptor, { bigint: true });
    const byPath = lstatIdentity(resolved);
    const identity = fsIdentity(opened);
    const physical = realPath(resolved);
    if (!opened.isFile() || opened.isSymbolicLink() || opened.nlink !== 1n
        || !byPath.isFile() || byPath.isSymbolicLink() || byPath.nlink !== 1n
        || fsIdentity(byPath) !== identity
        || opened.size !== byPath.size
        || opened.mtimeNs !== byPath.mtimeNs || opened.ctimeNs !== byPath.ctimeNs) {
      throw new IntakeContractError(`${label}必須是單一穩定的實體檔案，不得是連結或硬連結。`);
    }
    if (!samePhysicalPath(physical, resolved) || !isInside(workspace, physical)) {
      throw new IntakeContractError(`${label}不得透過連結重新導向或越出工作區。`);
    }
    if (isInside(REPOSITORY_ROOT, physical)) throw new IntakeContractError(`${label}不得指向工具程式庫內的檔案。`);
    if (opened.size <= 0n || opened.size > BigInt(maxBytes)) throw new IntakeContractError(`${label}大小不受支援。`);
    const buffer = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const afterByPath = lstatIdentity(resolved);
    const afterPhysical = realPath(resolved);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1n
        || !afterByPath.isFile() || afterByPath.isSymbolicLink() || afterByPath.nlink !== 1n
        || fsIdentity(after) !== identity || fsIdentity(afterByPath) !== identity
        || after.size !== opened.size || afterByPath.size !== opened.size
        || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs
        || afterByPath.mtimeNs !== opened.mtimeNs || afterByPath.ctimeNs !== opened.ctimeNs
        || BigInt(buffer.length) !== opened.size
        || !samePhysicalPath(afterPhysical, physical) || !samePhysicalPath(afterPhysical, resolved)
        || !isInside(workspace, afterPhysical) || isInside(REPOSITORY_ROOT, afterPhysical)) {
      throw new IntakeContractError(`${label}在讀取期間發生變更或重新導向。`);
    }
    return {
      relative,
      resolved,
      workspace,
      maxBytes,
      physical,
      identity,
      bytes: buffer.length,
      sha256: sha256(buffer),
      buffer,
      mtimeNs: String(after.mtimeNs),
      ctimeNs: String(after.ctimeNs),
    };
  } catch (error) {
    if (error instanceof IntakeContractError) throw error;
    throw new IntakeContractError(`${label}無法以穩定實體檔案讀取。`);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
}

function readStrictJson(workspace, relativePath, label, maxBytes = MAX_JSON_BYTES) {
  const evidence = physicalFile(workspace, relativePath, label, maxBytes);
  const raw = evidence.buffer.toString('utf8');
  if (!Buffer.from(raw, 'utf8').equals(evidence.buffer)) throw new IntakeContractError(`${label}必須是有效 UTF-8。`);
  const duplicates = findDuplicateJsonKeys(raw);
  if (duplicates.length) throw new IntakeContractError(`${label}含重複 JSON 欄位：${duplicates.slice(0, 5).map(item => item.pointer).join('、')}。`);
  let record;
  try { record = JSON.parse(raw); } catch (error) { throw new IntakeContractError(`${label}不是有效 JSON：${error.message}`); }
  return { ...evidence, raw, record };
}

function verifyStable(items) {
  items.forEach(item => {
    const current = physicalFile(item.workspace, item.relative, '收件證據', item.maxBytes);
    if (current.identity !== item.identity || current.bytes !== item.bytes || current.sha256 !== item.sha256
        || current.mtimeNs !== item.mtimeNs || current.ctimeNs !== item.ctimeNs
        || !samePhysicalPath(current.physical, item.physical)) {
      throw new IntakeContractError('收件證據在驗證期間發生變更或重新導向。');
    }
  });
}

function candidateBoundary() {
  return {
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
  };
}

function receiptBoundary() {
  const value = candidateBoundary();
  delete value.sourceKind;
  return value;
}

function validateBoundary(value, fields, expected, label) {
  exactKeys(value, fields, label);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new IntakeContractError(`${label}不得改寫封閉邊界。`);
}

function validateCaseIdentity(value) {
  exactKeys(value, CASE_IDENTITY_FIELDS, '案件身分');
  ['externalCaseId', 'projectName', 'projectNo', 'designer', 'intendedUse', 'permissibleUse']
    .forEach(key => requiredNonPlaceholder(value[key], `案件身分.${key}`, { maxLength: key.includes('Use') ? 1000 : 200 }));
  textList(value.limitations, '案件限制');
  textList(value.exclusions, '案件排除項');
  if (!Array.isArray(value.governingStandards) || !value.governingStandards.length) throw new IntakeContractError('規範依據不得為空。');
  const standardIds = [];
  value.governingStandards.forEach((item, index) => {
    const label = `規範依據第 ${index + 1} 筆`;
    exactKeys(item, STANDARD_FIELDS, label);
    const id = requiredText(item.standardId, `${label}.standardId`, { maxLength: 80 });
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw new IntakeContractError(`${label}.standardId 必須是穩定識別碼。`);
    standardIds.push(id);
    requiredNonPlaceholder(item.title, `${label}.title`, { maxLength: 300 });
    requiredNonPlaceholder(item.edition, `${label}.edition`, { maxLength: 100 });
    textList(item.clauses, `${label}.clauses`);
    const authority = requiredNonPlaceholder(item.sourceAuthority, `${label}.sourceAuthority`, { maxLength: 500 });
    if (/(?:工具內建|工具建議|專業版)/u.test(authority)) throw new IntakeContractError(`${label}不得以工具本身作為權威來源。`);
    if (!/^(?:規範判定|專案指定|風洞\s*[/／]\s*專案文件|設計者判斷|designer judgment)(?:\s|[:：]|$)/iu.test(authority)) {
      throw new IntakeContractError(`${label}.sourceAuthority 必須明列規範判定、專案指定、風洞／專案文件或設計者判斷。`);
    }
  });
  if (new Set(standardIds).size !== standardIds.length) throw new IntakeContractError('規範依據 standardId 不得重複。');
  normalizeRelativePath(value.caseSourceArtifactFile, '案件來源證據檔案');
}

function validateCriteria(value, validatedAt) {
  exactKeys(value, CRITERIA_FIELDS, '實案比較基準');
  const definedAt = requiredIso(value.definedAt, '實案比較基準.definedAt');
  if (Date.parse(definedAt) > Date.parse(validatedAt)) throw new IntakeContractError('實案比較基準不得晚於收件驗證時間。');
  requiredNonPlaceholder(value.numericToleranceBasis, '數值容許差依據', { maxLength: 1000 });
  if (value.controlBranchExpected !== 'smrf|x|reinforced|prior_test_similarity|six-strength-checks') {
    throw new IntakeContractError('控制分支預期值越出本收件契約的固定範圍。');
  }
  if (!['pass', 'review', 'blocked'].includes(value.decisionExpected)) throw new IntakeContractError('工程判定預期值不受支援。');
  if (!['reject', 'warning', 'not-applicable'].includes(value.outOfScopeExpected)) throw new IntakeContractError('超範圍處置預期值不受支援。');
  if (!['applicable', 'conditional', 'not-applicable'].includes(value.applicabilityExpected)) throw new IntakeContractError('案件適用性預期值不受支援。');
}

function validateToolInput(value, caseIdentity) {
  exactKeys(value, Object.keys(TOOL_INPUT_TYPES), '梁柱彎矩實案 88 欄輸入');
  Object.entries(TOOL_INPUT_TYPES).forEach(([key, type]) => {
    if (typeof value[key] !== type || (type === 'number' && !Number.isFinite(value[key]))) {
      throw new IntakeContractError(`梁柱彎矩實案輸入.${key} 必須是 ${type}${type === 'number' ? ' 有限值' : ''}。`);
    }
    if (type === 'string') requiredText(value[key], `梁柱彎矩實案輸入.${key}`, { allowEmpty: key === 'notes', maxLength: 2000 });
  });
  Object.entries(FIXED_SCOPE).forEach(([key, expected]) => {
    if (value[key] !== expected) throw new IntakeContractError(`梁柱彎矩實案輸入.${key} 必須固定為 ${expected}。`);
  });
  if (!['painted', 'weathering'].includes(value.exposureCondition)) throw new IntakeContractError('梁柱彎矩實案 exposureCondition 不受支援。');
  if (!['default', 'nonlinear', 'formula'].includes(value.momentRotationDemandMethod)) throw new IntakeContractError('梁柱彎矩實案 momentRotationDemandMethod 不受支援。');
  if (!Number.isInteger(value.momentQualificationTestCount) || value.momentQualificationTestCount < 0) throw new IntakeContractError('momentQualificationTestCount 必須是非負整數。');
  if (value.momentFarCriticalSectionExpectedMoment < 0) throw new IntakeContractError('momentFarCriticalSectionExpectedMoment 不得為負值。');
  REQUIRED_BASIS_FIELDS.forEach(key => requiredNonPlaceholder(value[key], `梁柱彎矩實案輸入.${key}`, { maxLength: 2000 }));
  SHA_FIELDS.forEach(key => {
    if (!/^[0-9a-f]{64}$/u.test(value[key]) || /^0{64}$/u.test(value[key])) throw new IntakeContractError(`梁柱彎矩實案輸入.${key} 必須是非占位的 lowercase SHA-256。`);
  });
  requiredNonPlaceholder(value.projectName, '梁柱彎矩實案輸入.projectName', { maxLength: 200 });
  requiredNonPlaceholder(value.connectionTag, '梁柱彎矩實案輸入.connectionTag', { maxLength: 200 });
  requiredNonPlaceholder(value.designer, '梁柱彎矩實案輸入.designer', { maxLength: 200 });
  if (value.projectName !== caseIdentity.projectName || value.designer !== caseIdentity.designer) {
    throw new IntakeContractError('工具輸入的 projectName、designer 必須與案件身分完全一致。');
  }
}

function validateReference(value, validatedAt) {
  exactKeys(value, REFERENCE_FIELDS, '外部獨立基準');
  if (!EXTERNAL_REFERENCE_METHODS.includes(value.method)) throw new IntakeContractError('外部獨立基準只接受手算、獨立試算表或第三方軟體。');
  if (value.independentFromProductionCore !== true) throw new IntakeContractError('外部基準必須明確 independentFromProductionCore=true。');
  requiredNonPlaceholder(value.author, '外部基準.author', { maxLength: 200 });
  requiredText(value.reviewer, '外部基準.reviewer', { allowEmpty: true, maxLength: 200 });
  const createdAt = requiredIso(value.createdAt, '外部基準.createdAt');
  if (Date.parse(createdAt) > Date.parse(validatedAt)) throw new IntakeContractError('外部基準 createdAt 不得晚於收件驗證時間。');
  requiredNonPlaceholder(value.basis, '外部基準.basis', { maxLength: 2000 });
  normalizeRelativePath(value.artifactFile, '外部基準人讀成品');
  const machine = normalizeRelativePath(value.machineDataFile, '外部基準機讀資料');
  if (path.posix.extname(machine).toLowerCase() !== '.json') throw new IntakeContractError('外部基準機讀資料必須是 JSON。');
}

function validateRequiredHumanActions(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new IntakeContractError('requiredHumanActions 必須精確列出 G2 與 G3 兩項人工責任。');
  value.forEach((item, index) => requiredText(item, `requiredHumanActions[${index}]`, { maxLength: 1000 }));
  if (canonicalJson(value) !== canonicalJson(REQUIRED_HUMAN_ACTIONS)) {
    throw new IntakeContractError('requiredHumanActions 必須保持受治理的 G2、G3 人工責任原文。');
  }
}

function validateFiniteJsonTree(value, label, depth = 0) {
  if (depth > 128) throw new IntakeContractError(`${label}巢狀深度超過 128 層。`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new IntakeContractError(`${label}不得包含非有限數值。`);
  if (Array.isArray(value)) value.forEach(item => validateFiniteJsonTree(item, label, depth + 1));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => validateFiniteJsonTree(item, label, depth + 1));
  return value;
}

function validateCandidate(record, validatedAt) {
  exactKeys(record, TOP_FIELDS, '梁柱彎矩實案收件');
  if (record.schemaVersion !== 1 || record.kind !== CANDIDATE_KIND || record.status !== CANDIDATE_STATUS) {
    throw new IntakeContractError('收件必須是 beam-column-moment-real-case-intake.v1 / candidate-unvalidated；不得直接填寫舊 synthetic template。');
  }
  validateBoundary(record.boundary, CANDIDATE_BOUNDARY_FIELDS, candidateBoundary(), '實案收件邊界');
  validateCaseIdentity(record.caseIdentity);
  validateCriteria(record.criteria, validatedAt);
  validateToolInput(record.toolInput, record.caseIdentity);
  validateReference(record.independentReference, validatedAt);
  validateRequiredHumanActions(record.requiredHumanActions);
  return record;
}

function evidenceRecord(item) {
  return { file: item.relative, bytes: item.bytes, sha256: item.sha256 };
}

function buildReceipt(loaded, caseSource, referenceArtifact, referenceData, validatedAt) {
  const receipt = {
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    status: RECEIPT_STATUS,
    validatedAt,
    intakeFingerprint: '',
    fieldSchemaSha256: TOOL_INPUT_SCHEMA_SHA256,
    intake: evidenceRecord(loaded),
    caseIdentitySha256: sha256(Buffer.from(canonicalJson(loaded.record.caseIdentity), 'utf8')),
    criteriaSha256: sha256(Buffer.from(canonicalJson(loaded.record.criteria), 'utf8')),
    toolInputSha256: sha256(Buffer.from(canonicalJson(loaded.record.toolInput), 'utf8')),
    caseSourceArtifact: evidenceRecord(caseSource),
    referenceArtifact: evidenceRecord(referenceArtifact),
    referenceDataArtifact: evidenceRecord(referenceData),
    boundary: receiptBoundary(),
    nextAction: RECEIPT_NEXT_ACTION,
  };
  receipt.intakeFingerprint = `RCI-${sha256(Buffer.from(canonicalJson(receipt), 'utf8')).slice(0, 24).toUpperCase()}`;
  return receipt;
}

function validateReceiptShape(receipt) {
  exactKeys(receipt, RECEIPT_FIELDS, '收件完成收據');
  if (receipt.schemaVersion !== 1 || receipt.kind !== RECEIPT_KIND || receipt.status !== RECEIPT_STATUS
      || receipt.fieldSchemaSha256 !== TOOL_INPUT_SCHEMA_SHA256
      || !/^RCI-[0-9A-F]{24}$/u.test(receipt.intakeFingerprint)) throw new IntakeContractError('收件完成收據身分無效。');
  requiredIso(receipt.validatedAt, '收件完成收據.validatedAt');
  if (receipt.nextAction !== RECEIPT_NEXT_ACTION) throw new IntakeContractError('收件完成收據下一步邊界無效。');
  ['caseIdentitySha256', 'criteriaSha256', 'toolInputSha256'].forEach(key => {
    if (!/^[0-9a-f]{64}$/u.test(receipt[key])) throw new IntakeContractError(`收件完成收據.${key} 無效。`);
  });
  validateBoundary(receipt.boundary, RECEIPT_BOUNDARY_FIELDS, receiptBoundary(), '收件完成收據邊界');
  ['intake', 'caseSourceArtifact', 'referenceArtifact', 'referenceDataArtifact'].forEach(key => {
    exactKeys(receipt[key], EVIDENCE_FIELDS, `收據.${key}`);
    normalizeRelativePath(receipt[key].file, `收據.${key}.file`);
    if (!Number.isSafeInteger(receipt[key].bytes) || receipt[key].bytes <= 0
      || !/^[0-9a-f]{64}$/u.test(receipt[key].sha256)) throw new IntakeContractError(`收據.${key} 證據描述無效。`);
  });
  const receiptEvidence = ['intake', 'caseSourceArtifact', 'referenceArtifact', 'referenceDataArtifact'].map(key => receipt[key]);
  if (new Set(receiptEvidence.map(item => item.file.toLowerCase())).size !== receiptEvidence.length
      || new Set(receiptEvidence.map(item => item.sha256)).size !== receiptEvidence.length
      || receiptEvidence.some(item => item.file.toLowerCase() === RECEIPT_RELATIVE_PATH.toLowerCase())) {
    throw new IntakeContractError('收件完成收據的證據檔案必須彼此獨立，且不得指向收據本身。');
  }
  const copy = JSON.parse(JSON.stringify(receipt));
  copy.intakeFingerprint = '';
  const expected = `RCI-${sha256(Buffer.from(canonicalJson(copy), 'utf8')).slice(0, 24).toUpperCase()}`;
  if (receipt.intakeFingerprint !== expected) throw new IntakeContractError('收件完成收據指紋無效。');
  return receipt;
}

function collectAssessment(workspacePath, inputRelativePath) {
  const workspace = physicalWorkspace(workspacePath);
  const inputRelative = normalizeRelativePath(inputRelativePath, '實案收件 JSON');
  const validatedAt = new Date().toISOString();
  const loaded = readStrictJson(workspace, inputRelative, '實案收件 JSON');
  if (!loaded.record || typeof loaded.record !== 'object' || Array.isArray(loaded.record)) throw new IntakeContractError('實案收件 JSON 根值必須是物件。');
  validateCandidate(loaded.record, validatedAt);
  const caseSource = physicalFile(workspace, loaded.record.caseIdentity.caseSourceArtifactFile, '案件來源證據', MAX_EVIDENCE_BYTES);
  const referenceArtifact = physicalFile(workspace, loaded.record.independentReference.artifactFile, '外部基準人讀成品', MAX_EVIDENCE_BYTES);
  const referenceData = readStrictJson(workspace, loaded.record.independentReference.machineDataFile, '外部基準機讀資料');
  if (!referenceData.record || typeof referenceData.record !== 'object' || Array.isArray(referenceData.record)
      || !Object.keys(referenceData.record).length) throw new IntakeContractError('外部基準機讀資料必須是非空 JSON 物件。');
  validateFiniteJsonTree(referenceData.record, '外部基準機讀資料');

  const evidence = [loaded, caseSource, referenceArtifact, referenceData];
  const pathKeys = evidence.map(item => item.relative.toLowerCase());
  if (new Set(pathKeys).size !== pathKeys.length || pathKeys.includes(RECEIPT_RELATIVE_PATH.toLowerCase())) {
    throw new IntakeContractError('收件、案件來源、外部基準與收據必須是不同的實體檔案。');
  }
  const hashes = evidence.map(item => item.sha256);
  if (new Set(hashes).size !== hashes.length) throw new IntakeContractError('收件、案件來源與外部基準不得共用相同內容。');
  verifyStable(evidence);
  const receipt = validateReceiptShape(buildReceipt(loaded, caseSource, referenceArtifact, referenceData, validatedAt));
  verifyStable(evidence);
  return { workspace, evidence, receipt };
}

function publicResult(receipt, receiptCreated) {
  return {
    status: receipt.status,
    intakeFingerprint: receipt.intakeFingerprint,
    fieldSchemaSha256: receipt.fieldSchemaSha256,
    inputValidated: true,
    receiptFile: receiptCreated ? RECEIPT_RELATIVE_PATH : '',
    receiptCreated,
    calculatorExecuted: false,
    engineeringResultsCompared: false,
    g1: false,
    g2: false,
    g3: false,
    completeJointDesign: false,
    legalSignoff: false,
    nextAction: 'manual-g1-production-and-independent-comparison',
  };
}

function assessIntake(workspacePath, inputRelativePath) {
  const assessment = collectAssessment(workspacePath, inputRelativePath);
  return publicResult(assessment.receipt, false);
}

function sealReadiness(workspacePath, inputRelativePath) {
  const assessment = collectAssessment(workspacePath, inputRelativePath);
  const receiptPath = path.resolve(assessment.workspace, ...RECEIPT_RELATIVE_PATH.split('/'));
  if (!isInside(assessment.workspace, receiptPath)) throw new IntakeContractError('收據路徑越出工作區。');
  if (fs.existsSync(receiptPath)) throw new IntakeContractError('收件完成收據已存在，不得覆寫。');
  const receiptDirectory = path.dirname(receiptPath);
  if (fs.existsSync(receiptDirectory)) {
    const stat = fs.lstatSync(receiptDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePhysicalPath(realPath(receiptDirectory), receiptDirectory)) {
      throw new IntakeContractError('收據資料夾必須是未重新導向的實體目錄。');
    }
  } else {
    fs.mkdirSync(receiptDirectory, { recursive: false });
  }
  const receiptDirectoryStat = lstatIdentity(receiptDirectory);
  if (!receiptDirectoryStat.isDirectory() || receiptDirectoryStat.isSymbolicLink()
      || !samePhysicalPath(realPath(receiptDirectory), receiptDirectory)) {
    throw new IntakeContractError('收據資料夾必須保持為未重新導向的實體目錄。');
  }
  const receiptDirectoryIdentity = fsIdentity(receiptDirectoryStat);

  verifyStable(assessment.evidence);
  const content = `${JSON.stringify(assessment.receipt, null, 2)}\n`;
  let descriptor;
  let createdFileIdentity = '';
  try {
    descriptor = fs.openSync(receiptPath, 'wx');
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    createdFileIdentity = fsIdentity(openedStat);
    const pathStat = lstatIdentity(receiptPath);
    const currentDirectoryStat = lstatIdentity(receiptDirectory);
    if (!openedStat.isFile() || openedStat.isSymbolicLink() || openedStat.nlink !== 1n
        || !pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1n
        || fsIdentity(pathStat) !== createdFileIdentity
        || !currentDirectoryStat.isDirectory() || currentDirectoryStat.isSymbolicLink()
        || fsIdentity(currentDirectoryStat) !== receiptDirectoryIdentity
        || !samePhysicalPath(realPath(receiptDirectory), receiptDirectory)
        || !samePhysicalPath(realPath(receiptPath), receiptPath)
        || !isInside(assessment.workspace, realPath(receiptPath))) {
      throw new IntakeContractError('收據建立期間的目錄或檔案實體身分發生變更。');
    }
    fs.writeFileSync(descriptor, content, { encoding: 'utf8' });
    fs.fsyncSync(descriptor);
    const writtenStat = fs.fstatSync(descriptor, { bigint: true });
    if (!writtenStat.isFile() || writtenStat.isSymbolicLink() || writtenStat.nlink !== 1n
        || fsIdentity(writtenStat) !== createdFileIdentity) {
      throw new IntakeContractError('收據寫入期間的檔案實體身分發生變更。');
    }
    fs.closeSync(descriptor);
    descriptor = undefined;
    const written = readStrictJson(assessment.workspace, RECEIPT_RELATIVE_PATH, '收件完成收據');
    validateReceiptShape(written.record);
    if (written.raw !== content) throw new IntakeContractError('收件完成收據寫入後內容不穩定。');
    verifyStable([...assessment.evidence, written]);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    // Fail closed without path-based cleanup. A hostile directory swap between a
    // check and unlink could otherwise delete another process's file. A failed
    // exclusive create intentionally leaves its own empty/partial sentinel for
    // manual inspection and can never overwrite a subsequent receipt.
    if (createdFileIdentity) {
      throw new IntakeContractError(`收據封存失敗；安全邊界不會自動刪除可能已建立的固定收據，請人工檢查並將其移出工作區後再重試。原始原因：${error.message || error}`);
    }
    throw error;
  }
  return publicResult(assessment.receipt, true);
}

function parseArgs(argv) {
  const options = { workspace: '', input: '', sealReadiness: false, json: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      if (seen.has(token)) throw new IntakeUsageError('參數 --json 不得重複。');
      seen.add(token);
      options.json = true;
      continue;
    }
    if (!['--workspace', '--input', '--seal-readiness'].includes(token)) throw new IntakeUsageError(`不支援的參數：${token}`);
    if (seen.has(token)) throw new IntakeUsageError(`參數 ${token} 不得重複。`);
    seen.add(token);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new IntakeUsageError(`參數 ${token} 需要值。`);
    if (token === '--workspace') options.workspace = value;
    else if (token === '--input') options.input = value;
    else {
      if (value !== 'yes') throw new IntakeUsageError('--seal-readiness 只接受明確值 yes。');
      options.sealReadiness = true;
    }
  }
  if (!options.workspace || !options.input) throw new IntakeUsageError('請同時指定 --workspace 與 --input。');
  return options;
}

function usage() {
  return [
    '唯讀收件檢查：',
    'node beam-column-moment-real-case-intake.js --workspace <repo 外私有資料夾> --input <POSIX 相對 JSON 路徑> [--json]',
    '封存收件完成收據：上述參數另加 --seal-readiness yes。',
    '成功只表示收件結構與外部檔案完整；未執行 calculator，未建立 G1、G2、G3 或簽證。',
  ].join('\n');
}

function runCli(argv) {
  const options = parseArgs(argv);
  const result = options.sealReadiness
    ? sealReadiness(options.workspace, options.input)
    : assessIntake(options.workspace, options.input);
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : [
    '梁柱彎矩實案收件結構完整',
    `收件指紋：${result.intakeFingerprint}`,
    `收據：${result.receiptCreated ? result.receiptFile : '未建立（唯讀檢查）'}`,
    '邊界：calculatorExecuted=false；G1=false；G2=false；G3=false；非簽證。',
  ].join('\n') + '\n');
  return result;
}

function main(argv = process.argv.slice(2)) {
  try {
    runCli(argv);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    if (error instanceof IntakeUsageError) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 3;
    } else process.exitCode = 2;
  }
}

const observedSchemaHash = sha256(Buffer.from(canonicalJson(TOOL_INPUT_TYPES), 'utf8'));
if (Object.keys(TOOL_INPUT_TYPES).length !== 88 || observedSchemaHash !== TOOL_INPUT_SCHEMA_SHA256) {
  throw new Error(`beam-column-moment-real-case-intake-field-schema-drift:${Object.keys(TOOL_INPUT_TYPES).length}:${observedSchemaHash}`);
}

if (require.main === module) main();

module.exports = {
  CANDIDATE_KIND,
  CANDIDATE_STATUS,
  RECEIPT_KIND,
  RECEIPT_STATUS,
  RECEIPT_RELATIVE_PATH,
  TOOL_INPUT_SCHEMA_SHA256,
  TOOL_INPUT_TYPES,
  IntakeContractError,
  IntakeUsageError,
  canonicalJson,
  findDuplicateJsonKeys,
  candidateBoundary,
  receiptBoundary,
  validateCandidate,
  validateReceiptShape,
  assessIntake,
  sealReadiness,
  parseArgs,
  usage,
  runCli,
  main,
};
