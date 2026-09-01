'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Checker = require('./attachment-package-check.js');
const Bundle = require('./engineering-qualification-case-bundle.js');

const CLI = path.join(__dirname, 'engineering-qualification-case-bundle.js');
const CREATED_AT = '2026-01-01T00:00:00.000Z';
const CRITERIA_AT = '2026-01-01T00:05:00.000Z';
const REFERENCE_AT = '2026-01-01T00:08:00.000Z';
const EXECUTED_AT = '2026-01-01T00:10:00.000Z';
const COMPARED_AT = '2026-01-01T00:20:00.000Z';
const G1_AT = '2026-01-01T00:30:00.000Z';
const REVIEWED_AT = '2026-01-01T00:35:00.000Z';
const G2_AT = '2026-01-01T00:40:00.000Z';
const ADOPTED_AT = '2026-01-01T00:50:00.000Z';
const REPORT_ADOPTED_AT = '2026-01-01T01:00:00.000Z';
const SEALED_AT = '2026-01-01T01:10:00.000Z';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function makeWorkspace(tempRoot, name) {
  const directory = path.join(tempRoot, name);
  fs.mkdirSync(directory);
  return directory;
}

function writeEvidence(directory, relative, content) {
  const buffer = Buffer.from(content, 'utf8');
  const filePath = path.join(directory, ...relative.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return { file: relative, bytes: buffer.length, sha256: sha256(buffer) };
}

function assertion(assertionId, label, type, expectedText) {
  const pointerByType = {
    numeric: '/results/moment',
    'control-branch': '/results/branch',
    decision: '/results/decision',
    'out-of-scope': '/results/scope',
    applicability: '/results/applicability',
  };
  if (type === 'numeric') {
    return {
      assertionId,
      label,
      type,
      unit: 'kN-m',
      expectedNumber: 125.4,
      actualNumber: 125.4,
      expectedText: '',
      actualText: '',
      expectedPointer: pointerByType[type],
      actualPointer: pointerByType[type],
      toleranceMode: 'absolute-or-relative',
      absoluteTolerance: 0.1,
      relativeTolerance: 0.001,
    };
  }
  return {
    assertionId,
    label,
    type,
    unit: '',
    expectedNumber: null,
    actualNumber: null,
    expectedText,
    actualText: expectedText,
    expectedPointer: pointerByType[type],
    actualPointer: pointerByType[type],
    toleranceMode: 'exact',
    absoluteTolerance: 0,
    relativeTolerance: 0,
  };
}

function requiredAssertions(includeApplicability) {
  const assertions = [
    assertion('A-NUMERIC', '控制彎矩', 'numeric'),
    assertion('A-BRANCH', '控制分支', 'control-branch', 'flange-weld-governs'),
    assertion('A-DECISION', '工程判定', 'decision', 'pass'),
    assertion('A-SCOPE', '超出範圍處置', 'out-of-scope', 'warning'),
  ];
  if (includeApplicability) assertions.push(assertion('A-APPLICABILITY', '案件適用性', 'applicability', 'applicable'));
  return assertions;
}

function reportChecks() {
  return Bundle.REQUIRED_REPORT_CHECKS.map(checkId => ({
    checkId,
    label: `檢查 ${checkId}`,
    pass: true,
    evidence: `${checkId} 已由複核人逐項確認。`,
  }));
}

function resign(record) {
  (record.calculationRuns || []).forEach(run => { run.runFingerprint = Bundle.qualificationRunFingerprint(run); });
  record.bundleFingerprint = Bundle.bundleFingerprint(record);
  return record;
}

function qualifiedRecord(directory, options = {}) {
  // `real-case` variants below exercise the closed G2/G3 schema only. They are ephemeral temp fixtures,
  // are deleted at test end, and are not evidence that any engineering case has reached G2.
  const sourceKind = options.sourceKind || 'synthetic';
  const claimedLevel = options.claimedLevel || 'G1';
  const reportAdopted = options.reportAdopted === true;
  const lifecycle = options.lifecycle || 'sealed';
  const inputArtifact = writeEvidence(directory, 'inputs/beam-column.json', '{"Mu":125.4}\n');
  const machineResults = {
    results: {
      moment: 125.4,
      branch: 'flange-weld-governs',
      decision: 'pass',
      scope: 'warning',
      applicability: 'applicable',
    },
  };
  const resultDataArtifact = writeEvidence(directory, 'outputs/beam-column-result.json', `${JSON.stringify(machineResults, null, 2)}\n`);
  const outputArtifact = writeEvidence(directory, 'outputs/beam-column-result.html', '<!doctype html><html><body><h1>梁柱彎矩接頭</h1><p>DCR 0.82 PASS</p><p>計算指紋：CF-1234567890ABCDEF</p></body></html>\n');
  const referenceArtifact = writeEvidence(directory, 'references/independent-check.txt', 'independent hand calculation source\n');
  const independentMachineResults = {
    source: 'independent-spreadsheet',
    ...machineResults,
  };
  const referenceDataArtifact = writeEvidence(directory, 'references/independent-check.data.json', `${JSON.stringify(independentMachineResults, null, 2)}\n`);
  const caseSourceArtifact = sourceKind === 'real-case'
    ? writeEvidence(directory, 'inputs/anonymized-case-source.json', '{"externalCaseId":"OWNER-CASE-001","source":"anonymized project extract"}\n')
    : Bundle.emptyEvidence();
  const assertions = requiredAssertions(claimedLevel === 'G2');
  const comparisonDataArtifact = writeEvidence(directory, 'references/CMP-001.comparison-data.json', `${JSON.stringify({
    schemaVersion: 1,
    kind: Bundle.COMPARISON_DATA_KIND,
    comparisonId: 'CMP-001',
    runId: 'RUN-001',
    productionOutputSha256: outputArtifact.sha256,
    productionResultDataSha256: resultDataArtifact.sha256,
    referenceArtifactSha256: referenceArtifact.sha256,
    referenceDataArtifactSha256: referenceDataArtifact.sha256,
    assertions,
  }, null, 2)}\n`);
  const g1DecisionReceipt = writeEvidence(directory, 'references/QD-G1-001.receipt.json', '{"decisionId":"QD-G1-001","reviewedBy":"internal-reviewer"}\n');
  const g2DecisionReceipt = claimedLevel === 'G2'
    ? writeEvidence(directory, 'references/QD-G2-001.receipt.json', '{"decisionId":"QD-G2-001","reviewedBy":"responsible-engineer"}\n')
    : null;
  const renderedArtifact = reportAdopted
    ? writeEvidence(directory, 'reports/case-appendix.html', '<!doctype html><html><body><h1>案件附件彙整</h1><p>附錄 A-1 梁柱彎矩接頭</p><p>計算指紋：CF-1234567890ABCDEF</p></body></html>\n')
    : Bundle.emptyEvidence();
  const record = Bundle.buildInitialBundle({
    caseId: `CASE-${sourceKind.toUpperCase()}`,
    caseLabel: sourceKind === 'real-case' ? '實案梁柱彎矩接頭' : '合成梁柱彎矩接頭',
    sourceKind,
    createdAt: CREATED_AT,
  });
  if (sourceKind === 'real-case') {
    Object.assign(record.case, {
      externalCaseId: 'OWNER-CASE-001',
      caseSourceArtifact,
      projectName: '某既有建築耐震能力評估',
      projectNo: 'SEISMIC-001',
      designer: '結構技師甲',
      intendedUse: '供本案梁柱彎矩接頭耐震能力審查之計算附件採用判斷。',
      permissibleUse: '僅限輸入條件、構造型式與規範版本均與本案件紀錄一致時使用。',
      limitations: ['僅涵蓋已記錄之梁柱構形與材料強度。'],
      exclusions: ['不涵蓋梁柱接頭域之非線性歷時分析。'],
      governingStandards: [{
        standardId: 'TWS-STEEL-2024',
        title: '鋼構造建築物鋼結構設計技術規範',
        edition: '2024',
        clauses: ['梁柱接頭章節'],
        sourceAuthority: '規範判定',
      }],
    });
  }
  record.calculationRuns = [{
    runId: 'RUN-001',
    toolId: 'beam-column-moment-connection',
    toolName: '梁柱彎矩接頭',
    toolVersion: 'v1.0.0',
    engineVersion: 'engine-v1.0.0',
    executedAt: EXECUTED_AT,
    calculationFingerprint: 'CF-1234567890ABCDEF',
    runFingerprint: '',
    inputArtifact,
    resultDataArtifact,
    outputArtifact,
    state: 'current',
    staleReasons: [],
    supersedesRunId: '',
  }];
  record.independentComparisons = [{
    comparisonId: 'CMP-001',
    runId: 'RUN-001',
    comparedAt: COMPARED_AT,
    criteriaDefinedAt: CRITERIA_AT,
    referenceMethod: 'independent-spreadsheet',
    independentFromProductionCore: true,
    referenceArtifact,
    referenceDataArtifact,
    referenceAuthor: '結構技師乙',
    referenceReviewer: '結構技師丙',
    referenceCreatedAt: REFERENCE_AT,
    referenceBasis: '獨立公式與手動輸入之試算表，未呼叫正式工具核心。',
    comparisonDataArtifact,
    assertions,
  }];
  record.qualificationDecisions = [{
    decisionId: 'QD-G1-001',
    runId: 'RUN-001',
    comparisonIds: ['CMP-001'],
    claimedLevel: 'G1',
    basedOnDecisionId: '',
    reviewer: '複核技師',
    basis: '獨立比較完整覆蓋數值、控制分支、判定及超出範圍處置。',
    decidedAt: G1_AT,
    decisionReceipt: g1DecisionReceipt,
  }];
  if (claimedLevel === 'G2') {
    record.qualificationDecisions.push({
      decisionId: 'QD-G2-001',
      runId: 'RUN-001',
      comparisonIds: ['CMP-001'],
      claimedLevel: 'G2',
      basedOnDecisionId: 'QD-G1-001',
      reviewer: '簽證技師',
      basis: '真實案件之適用性、限制、排除項與規範依據均已確認。',
      decidedAt: G2_AT,
      decisionReceipt: g2DecisionReceipt,
    });
  }
  if (reportAdopted) {
    record.artifactReviews = [{
      reviewId: 'REV-001',
      runId: 'RUN-001',
      artifact: outputArtifact,
      visibilityEvidenceArtifact: Bundle.emptyEvidence(),
      state: 'pass',
      reviewer: '報告複核人',
      reviewedAt: REVIEWED_AT,
      reviewReceipt: writeEvidence(directory, 'references/REV-001.receipt.json', '{"reviewId":"REV-001","checks":5}\n'),
      checks: reportChecks(),
    }];
    record.formalAdoptions = [{
      adoptionId: 'ADOPT-001',
      runId: 'RUN-001',
      qualificationDecisionId: 'QD-G2-001',
      artifactReviewId: 'REV-001',
      reviewer: '簽證技師',
      basis: 'G2 與附件五項固定審閱均通過，准予本次附件採用。',
      adoptedAt: ADOPTED_AT,
      adoptionReceipt: writeEvidence(directory, 'references/ADOPT-001.receipt.json', '{"adoptionId":"ADOPT-001","scope":"same-run-artifact"}\n'),
    }];
    record.reportPackage = {
      state: 'adopted',
      templateId: 'assessment-report-appendix',
      templateVersion: 'v1.0.0',
      sections: [{
        order: 1,
        runId: 'RUN-001',
        formalAdoptionId: 'ADOPT-001',
        title: '梁柱彎矩接頭檢核',
        appendixNo: '附錄 A-1',
      }],
      renderedArtifact,
      renderedVisibilityEvidenceArtifact: Bundle.emptyEvidence(),
      adoptedBy: '簽證技師',
      adoptedAt: REPORT_ADOPTED_AT,
      adoptionBasis: '附件順序、來源、指紋與可讀性均確認後採用。',
      adoptionReceipt: writeEvidence(directory, 'references/REPORT-ADOPTION.receipt.json', '{"reportPackage":"adopted","sections":1}\n'),
    };
  }
  record.lifecycle = lifecycle;
  record.updatedAt = lifecycle === 'sealed' ? SEALED_AT : REPORT_ADOPTED_AT;
  record.sealedAt = lifecycle === 'sealed' ? SEALED_AT : '';
  return resign(record);
}

function writeBundle(directory, record, fileName) {
  const target = path.join(directory, fileName || (record.lifecycle === 'sealed'
    ? `case-bundle-${record.bundleFingerprint}.json`
    : 'case-bundle.draft.json'));
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return target;
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-qualification-case-bundle-'));
try {
  assert.equal(Bundle.KIND, 'engineering-qualification-case-bundle.v1');
  assert.match(Bundle.BOUNDARY_INSTRUCTION, /不得放入計算書、主報告、正式附件包或 Pages/);
  assert.deepEqual(Bundle.REQUIRED_G1_ASSERTIONS, ['numeric', 'control-branch', 'decision', 'out-of-scope']);
  assert.deepEqual(Bundle.REQUIRED_G2_ASSERTIONS, ['numeric', 'control-branch', 'decision', 'out-of-scope', 'applicability']);

  const initial = Bundle.buildInitialBundle({
    caseId: 'CASE-DRAFT-001',
    caseLabel: '尚未資格化草稿',
    sourceKind: 'synthetic',
    createdAt: CREATED_AT,
  });
  const initialResult = Bundle.validateBundle(initial);
  assert.equal(initial.lifecycle, 'draft');
  assert.equal(initialResult.status, 'review');
  assert.equal(initialResult.highestLevel, 'none');
  assert.equal(initialResult.evidenceVerified, false);
  assert.equal(initial.boundary.pagesPublication, false);
  assert.equal(initial.boundary.formalAttachmentApproval, false);
  assert.equal(initial.boundary.attestation, 'unsigned-self-attested-internal-record');
  assert.throws(() => Bundle.initWorkspace(path.join(__dirname, '.qualification-workspace-must-stay-private'), {
    caseId: 'CASE-IN-REPO',
    caseLabel: '不得建立在程式庫內',
    sourceKind: 'synthetic',
  }), /不得位於工具程式庫內/);

  const syntheticDir = makeWorkspace(tempRoot, 'synthetic-g1');
  const synthetic = qualifiedRecord(syntheticDir);
  const syntheticResult = Bundle.validateBundle(synthetic, { baseDirectory: syntheticDir });
  assert.equal(syntheticResult.status, 'ready');
  assert.equal(syntheticResult.qualificationStatus, 'G1');
  assert.equal(syntheticResult.minimumCurrentLevel, 'G1');
  assert.equal(syntheticResult.highestLevel, 'G1');
  assert.equal(syntheticResult.evidenceVerified, true);
  assert.deepEqual(syntheticResult.runLevels, { 'RUN-001': 'G1' });
  const shapeOnlySynthetic = Bundle.validateBundle(synthetic);
  assert.equal(shapeOnlySynthetic.status, 'review');
  assert.equal(shapeOnlySynthetic.qualificationStatus, 'review');
  assert.equal(shapeOnlySynthetic.evidenceVerified, false, 'shape-only API validation must never return ready');

  const realG2Dir = makeWorkspace(tempRoot, 'real-g2');
  const realG2 = qualifiedRecord(realG2Dir, { sourceKind: 'real-case', claimedLevel: 'G2' });
  const realG2Result = Bundle.validateBundle(realG2, { baseDirectory: realG2Dir });
  assert.equal(realG2Result.status, 'ready');
  assert.equal(realG2Result.qualificationStatus, 'G2');
  assert.equal(realG2Result.highestLevel, 'G2');
  assert.equal(realG2Result.reportPackageState, 'unplanned');

  const realG3Dir = makeWorkspace(tempRoot, 'real-g3-report');
  const realG3 = qualifiedRecord(realG3Dir, { sourceKind: 'real-case', claimedLevel: 'G2', reportAdopted: true });
  const realG3Result = Bundle.validateBundle(realG3, { baseDirectory: realG3Dir });
  assert.equal(realG3Result.status, 'ready');
  assert.equal(realG3Result.qualificationStatus, 'G3');
  assert.equal(realG3Result.highestLevel, 'G3');
  assert.equal(realG3Result.reportPackageState, 'adopted');

  const syntheticG2Dir = makeWorkspace(tempRoot, 'synthetic-cannot-g2');
  const syntheticG2 = qualifiedRecord(syntheticG2Dir, { sourceKind: 'real-case', claimedLevel: 'G2' });
  syntheticG2.case.sourceKind = 'synthetic';
  resign(syntheticG2);
  assert.throws(() => Bundle.validateBundle(syntheticG2), /只有真實案件可以宣稱 G2/);

  const replay = clone(synthetic);
  replay.independentComparisons[0].referenceMethod = 'same-core-replay';
  replay.independentComparisons[0].independentFromProductionCore = true;
  resign(replay);
  assert.throws(() => Bundle.validateBundle(replay), /同核心重播不得宣稱獨立/);

  const declaredReplay = clone(synthetic);
  declaredReplay.independentComparisons[0].referenceMethod = 'same-core-replay';
  declaredReplay.independentComparisons[0].independentFromProductionCore = false;
  resign(declaredReplay);
  assert.throws(() => Bundle.validateBundle(declaredReplay), /沒有一份獨立比較完整覆蓋 G1/);

  const blockedDecision = clone(synthetic);
  const blockedDecisionAssertion = blockedDecision.independentComparisons[0].assertions.find(item => item.type === 'decision');
  blockedDecisionAssertion.expectedText = 'blocked';
  blockedDecisionAssertion.actualText = 'blocked';
  resign(blockedDecision);
  assert.throws(() => Bundle.validateBundle(blockedDecision), /沒有一份獨立比較完整覆蓋 G1/);

  const notApplicable = clone(realG2);
  const applicabilityAssertion = notApplicable.independentComparisons[0].assertions.find(item => item.type === 'applicability');
  applicabilityAssertion.expectedText = 'not-applicable';
  applicabilityAssertion.actualText = 'not-applicable';
  resign(notApplicable);
  assert.throws(() => Bundle.validateBundle(notApplicable), /沒有一份獨立比較完整覆蓋 G2/);

  const mismatchedG3Artifact = clone(realG3);
  mismatchedG3Artifact.artifactReviews[0].artifact = clone(mismatchedG3Artifact.reportPackage.renderedArtifact);
  resign(mismatchedG3Artifact);
  assert.throws(() => Bundle.validateBundle(mismatchedG3Artifact), /附件審閱成品必須精確綁定/);

  const nonFormalRenderedArtifact = clone(realG3);
  nonFormalRenderedArtifact.reportPackage.renderedArtifact.file = 'reports/case-appendix.txt';
  resign(nonFormalRenderedArtifact);
  assert.throws(() => Bundle.validateBundle(nonFormalRenderedArtifact), /報告附件編排成品只接受/);

  const fakeDocxDir = makeWorkspace(tempRoot, 'fake-docx-rejected');
  const fakeDocx = qualifiedRecord(fakeDocxDir, { sourceKind: 'real-case', claimedLevel: 'G2', reportAdopted: true });
  fakeDocx.reportPackage.renderedArtifact = writeEvidence(fakeDocxDir, 'reports/fake.docx', 'plain text with a DOCX suffix\n');
  resign(fakeDocx);
  assert.throws(
    () => Bundle.validateBundle(fakeDocx, { baseDirectory: fakeDocxDir }),
    /不是可解析的正式文件/,
  );

  const missingVisibleCfDir = makeWorkspace(tempRoot, 'rendered-report-missing-visible-cf');
  const missingVisibleCf = qualifiedRecord(missingVisibleCfDir, { sourceKind: 'real-case', claimedLevel: 'G2', reportAdopted: true });
  missingVisibleCf.reportPackage.renderedArtifact = writeEvidence(
    missingVisibleCfDir,
    'reports/case-appendix.html',
    '<!doctype html><html><body><h1>案件附件彙整</h1><p>附錄 A-1 梁柱彎矩接頭</p></body></html>\n',
  );
  resign(missingVisibleCf);
  assert.throws(
    () => Bundle.validateBundle(missingVisibleCf, { baseDirectory: missingVisibleCfDir }),
    /可見內容缺少對應計算指紋/,
    '可解析的附件也必須在可見內容綁定同次計算指紋',
  );

  const pdfWithoutBoundVisibility = clone(realG3);
  pdfWithoutBoundVisibility.calculationRuns[0].outputArtifact = {
    file: 'outputs/beam-column-result.pdf',
    bytes: 100,
    sha256: '1'.repeat(64),
  };
  pdfWithoutBoundVisibility.artifactReviews[0].artifact = clone(pdfWithoutBoundVisibility.calculationRuns[0].outputArtifact);
  pdfWithoutBoundVisibility.artifactReviews[0].visibilityEvidenceArtifact = Bundle.emptyEvidence();
  resign(pdfWithoutBoundVisibility);
  assert.throws(
    () => Bundle.validateBundle(pdfWithoutBoundVisibility),
    /PDF 必須綁定 canonical render 可見性證據/,
    'PDF 不得只靠文字層或副檔名升為通過審閱',
  );

  const unverifiedPdfVisibilityDir = makeWorkspace(tempRoot, 'pdf-visibility-not-verified');
  const unverifiedPdfVisibility = qualifiedRecord(unverifiedPdfVisibilityDir, { sourceKind: 'real-case', claimedLevel: 'G2', reportAdopted: true });
  const unverifiedPdfArtifact = writeEvidence(
    unverifiedPdfVisibilityDir,
    'outputs/beam-column-result.pdf',
    '%PDF-1.4\nqualification visibility contract fixture\n%%EOF\n',
  );
  const unverifiedPdfEvidence = writeEvidence(
    unverifiedPdfVisibilityDir,
    'outputs/beam-column-result.canonical-render.evidence.json',
    '{"kind":"attachment-canonical-render-evidence.v1","fixture":"inspection-status-owned-by-attachment-checker"}\n',
  );
  unverifiedPdfVisibility.calculationRuns[0].outputArtifact = unverifiedPdfArtifact;
  unverifiedPdfVisibility.artifactReviews[0].artifact = unverifiedPdfArtifact;
  unverifiedPdfVisibility.artifactReviews[0].visibilityEvidenceArtifact = unverifiedPdfEvidence;
  const unverifiedPdfComparison = unverifiedPdfVisibility.independentComparisons[0];
  unverifiedPdfComparison.comparisonDataArtifact = writeEvidence(
    unverifiedPdfVisibilityDir,
    'references/CMP-001.comparison-data.json',
    `${JSON.stringify({
      schemaVersion: 1,
      kind: Bundle.COMPARISON_DATA_KIND,
      comparisonId: unverifiedPdfComparison.comparisonId,
      runId: unverifiedPdfComparison.runId,
      productionOutputSha256: unverifiedPdfArtifact.sha256,
      productionResultDataSha256: unverifiedPdfVisibility.calculationRuns[0].resultDataArtifact.sha256,
      referenceArtifactSha256: unverifiedPdfComparison.referenceArtifact.sha256,
      referenceDataArtifactSha256: unverifiedPdfComparison.referenceDataArtifact.sha256,
      assertions: unverifiedPdfComparison.assertions,
    }, null, 2)}\n`,
  );
  resign(unverifiedPdfVisibility);
  const inspectAttachment = Checker.inspectAttachment;
  Checker.inspectAttachment = (filePath, baseDirectory) => {
    if (path.extname(filePath).toLowerCase() !== '.pdf') return inspectAttachment(filePath, baseDirectory);
    return {
      errors: [],
      sourceSha256: unverifiedPdfArtifact.sha256,
      textLength: 80,
      fingerprints: ['CF-1234567890ABCDEF'],
      visibilityEvidence: {
        status: 'review',
        method: 'pdftotext-only',
        evidenceFile: path.basename(unverifiedPdfEvidence.file),
        reasons: ['canonical-render-evidence-missing'],
      },
    };
  };
  try {
    assert.throws(
      () => Bundle.validateBundle(unverifiedPdfVisibility, { baseDirectory: unverifiedPdfVisibilityDir }),
      /可見性證據未通過/,
      'PDF 文字層即使含 CF，canonical render 未 verified 仍必須失敗',
    );
  } finally {
    Checker.inspectAttachment = inspectAttachment;
  }

  const missingG2 = clone(realG3);
  missingG2.qualificationDecisions = missingG2.qualificationDecisions.filter(item => item.claimedLevel !== 'G2');
  resign(missingG2);
  assert.throws(() => Bundle.validateBundle(missingG2), /必須引用同一執行的 G2 決定/);

  const prematureReport = clone(realG2);
  prematureReport.reportPackage = {
    state: 'ready-for-render',
    templateId: 'assessment-report-appendix',
    templateVersion: 'v1.0.0',
    sections: [{ order: 1, runId: 'RUN-001', formalAdoptionId: '', title: '梁柱彎矩接頭檢核', appendixNo: '附錄 A-1' }],
    renderedArtifact: Bundle.emptyEvidence(),
    renderedVisibilityEvidenceArtifact: Bundle.emptyEvidence(),
    adoptedBy: '',
    adoptedAt: '',
    adoptionBasis: '',
    adoptionReceipt: Bundle.emptyEvidence(),
  };
  resign(prematureReport);
  assert.throws(() => Bundle.validateBundle(prematureReport), /內部採用 ID/);

  const toolAsAuthority = clone(realG2);
  toolAsAuthority.case.governingStandards[0].sourceAuthority = '工具內建';
  resign(toolAsAuthority);
  assert.throws(() => Bundle.validateBundle(toolAsAuthority), /不得以工具本身作為權威來源/);

  const missingCaseSource = clone(realG2);
  missingCaseSource.case.caseSourceArtifact = Bundle.emptyEvidence();
  resign(missingCaseSource);
  assert.throws(() => Bundle.validateBundle(missingCaseSource), /外部案件 ID 與案件來源證據/);

  const missingDecisionReceipt = clone(synthetic);
  missingDecisionReceipt.qualificationDecisions[0].decisionReceipt = Bundle.emptyEvidence();
  resign(missingDecisionReceipt);
  assert.throws(() => Bundle.validateBundle(missingDecisionReceipt), /決定收據/);

  const eventAfterSeal = clone(synthetic);
  eventAfterSeal.independentComparisons[0].comparedAt = '2026-01-01T02:00:00.000Z';
  resign(eventAfterSeal);
  assert.throws(() => Bundle.validateBundle(eventAfterSeal), /不得晚於案件包更新時間/);

  const sameInputOutput = clone(synthetic);
  sameInputOutput.calculationRuns[0].outputArtifact = clone(sameInputOutput.calculationRuns[0].inputArtifact);
  resign(sameInputOutput);
  assert.throws(() => Bundle.validateBundle(sameInputOutput), /輸入與輸出必須是不同證據/);

  const reusedFingerprint = clone(synthetic);
  const conflictingRun = clone(reusedFingerprint.calculationRuns[0]);
  conflictingRun.runId = 'RUN-CONFLICTING-OUTPUT';
  conflictingRun.outputArtifact = writeEvidence(syntheticDir, 'outputs/conflicting-result.html', '<p>different result</p>\n');
  conflictingRun.state = 'rejected';
  reusedFingerprint.calculationRuns.push(conflictingRun);
  resign(reusedFingerprint);
  assert.throws(() => Bundle.validateBundle(reusedFingerprint), /計算指紋 .* 被不同工具版本、引擎、輸入或輸出重用/);

  const lateCriteria = clone(synthetic);
  lateCriteria.independentComparisons[0].criteriaDefinedAt = '2026-01-01T00:11:00.000Z';
  resign(lateCriteria);
  assert.throws(() => Bundle.validateBundle(lateCriteria), /判定基準必須早於工具執行時間固定/);

  const equalCriteria = clone(synthetic);
  equalCriteria.independentComparisons[0].criteriaDefinedAt = EXECUTED_AT;
  resign(equalCriteria);
  assert.throws(() => Bundle.validateBundle(equalCriteria), /判定基準必須早於工具執行時間固定/);

  const equalG1G2Time = clone(realG2);
  equalG1G2Time.qualificationDecisions.find(item => item.claimedLevel === 'G2').decidedAt = G1_AT;
  resign(equalG1G2Time);
  assert.throws(() => Bundle.validateBundle(equalG1G2Time), /時間較早的 G1 決定/);

  const openDiscrepancy = clone(synthetic);
  openDiscrepancy.discrepancies = [{
    discrepancyId: 'DISC-001',
    comparisonId: 'CMP-001',
    assertionId: 'A-NUMERIC',
    category: 'rounding',
    state: 'open',
    description: '差異仍待釐清。',
    resolution: '',
    reviewer: '',
    basis: '',
    resolvedAt: '',
  }];
  resign(openDiscrepancy);
  assert.throws(() => Bundle.validateBundle(openDiscrepancy), /差異仍 open/);

  const lateResolvedDiscrepancy = clone(synthetic);
  lateResolvedDiscrepancy.discrepancies = [{
    discrepancyId: 'DISC-LATE-001',
    comparisonId: 'CMP-001',
    assertionId: 'A-NUMERIC',
    category: 'rounding',
    state: 'resolved',
    description: '差異已處置，但晚於資格化決定。',
    resolution: '確認為顯示四捨五入。',
    reviewer: '差異複核人',
    basis: '獨立重算紀錄。',
    resolvedAt: '2026-01-01T00:31:00.000Z',
  }];
  resign(lateResolvedDiscrepancy);
  assert.throws(() => Bundle.validateBundle(lateResolvedDiscrepancy), /不得早於差異處置完成時間/);

  const ignoredFailedComparison = clone(synthetic);
  const failedComparison = clone(ignoredFailedComparison.independentComparisons[0]);
  failedComparison.comparisonId = 'CMP-FAILED-UNHANDLED';
  failedComparison.assertions[0].actualNumber = 999;
  ignoredFailedComparison.independentComparisons.push(failedComparison);
  resign(ignoredFailedComparison);
  assert.throws(() => Bundle.validateBundle(ignoredFailedComparison), /不得略過尚未完成處置的失敗獨立比較/);

  const resolvedFailureDir = makeWorkspace(tempRoot, 'resolved-failed-comparison');
  const resolvedFailure = qualifiedRecord(resolvedFailureDir);
  const resolvedComparison = clone(resolvedFailure.independentComparisons[0]);
  resolvedComparison.comparisonId = 'CMP-FAILED-RESOLVED';
  resolvedComparison.assertions[0].expectedNumber = 999;
  const resolvedReferenceData = clone({
    source: 'independent-spreadsheet',
    results: {
    moment: 999,
    branch: 'flange-weld-governs',
    decision: 'pass',
    scope: 'warning',
    applicability: 'applicable',
    },
  });
  resolvedComparison.referenceDataArtifact = writeEvidence(
    resolvedFailureDir,
    'references/CMP-FAILED-RESOLVED.reference-data.json',
    `${JSON.stringify(resolvedReferenceData, null, 2)}\n`,
  );
  resolvedComparison.comparisonDataArtifact = writeEvidence(resolvedFailureDir, 'references/CMP-FAILED-RESOLVED.comparison-data.json', `${JSON.stringify({
    schemaVersion: 1,
    kind: Bundle.COMPARISON_DATA_KIND,
    comparisonId: resolvedComparison.comparisonId,
    runId: resolvedComparison.runId,
    productionOutputSha256: resolvedFailure.calculationRuns[0].outputArtifact.sha256,
    productionResultDataSha256: resolvedFailure.calculationRuns[0].resultDataArtifact.sha256,
    referenceArtifactSha256: resolvedComparison.referenceArtifact.sha256,
    referenceDataArtifactSha256: resolvedComparison.referenceDataArtifact.sha256,
    assertions: resolvedComparison.assertions,
  }, null, 2)}\n`);
  resolvedFailure.independentComparisons.push(resolvedComparison);
  resolvedFailure.discrepancies = [{
    discrepancyId: 'DISC-RESOLVED-FAILURE',
    comparisonId: resolvedComparison.comparisonId,
    assertionId: 'A-NUMERIC',
    category: 'reference-defect',
    state: 'resolved',
    description: '獨立基準儲存格引用錯誤。',
    resolution: '修正基準前保留失敗紀錄；本次決定只引用另一份完整通過的獨立比較。',
    reviewer: '差異複核人',
    basis: '基準公式逐格查核。',
    resolvedAt: '2026-01-01T00:25:00.000Z',
  }];
  resign(resolvedFailure);
  assert.equal(
    Bundle.validateBundle(resolvedFailure, { baseDirectory: resolvedFailureDir }).status,
    'ready',
    'resolved failed comparison may remain as history when every failed assertion is dispositioned before the decision',
  );

  const incompleteAssertions = clone(synthetic);
  incompleteAssertions.independentComparisons[0].assertions = incompleteAssertions.independentComparisons[0].assertions
    .filter(item => item.type !== 'control-branch');
  resign(incompleteAssertions);
  assert.throws(() => Bundle.validateBundle(incompleteAssertions), /完整覆蓋 G1 必要斷言/);

  const fingerprintTamper = clone(synthetic);
  fingerprintTamper.case.caseLabel = '未重算指紋的竄改名稱';
  assert.throws(() => Bundle.validateBundle(fingerprintTamper), /指紋無效或與內容不一致/);

  const runFingerprintTamper = clone(synthetic);
  runFingerprintTamper.calculationRuns[0].runFingerprint = `QRF-${'0'.repeat(24)}`;
  runFingerprintTamper.bundleFingerprint = Bundle.bundleFingerprint(runFingerprintTamper);
  assert.throws(() => Bundle.validateBundle(runFingerprintTamper), /案件包執行指紋無效/);

  const incompatibleLongCalculationFingerprint = clone(synthetic);
  incompatibleLongCalculationFingerprint.calculationRuns[0].calculationFingerprint = `CF-${'A'.repeat(32)}`;
  resign(incompatibleLongCalculationFingerprint);
  assert.throws(
    () => Bundle.validateBundle(incompatibleLongCalculationFingerprint),
    /計算指紋無效/,
    '案件包 CF 必須和全庫附件抽取器共用固定 16 位契約',
  );

  const futureBundle = clone(initial);
  futureBundle.createdAt = '2100-01-01T00:00:00.000Z';
  futureBundle.updatedAt = futureBundle.createdAt;
  resign(futureBundle);
  assert.throws(() => Bundle.validateBundle(futureBundle), /不得晚於目前時間的合理誤差範圍/);

  const duplicateDir = makeWorkspace(tempRoot, 'duplicate-json');
  const duplicatePath = path.join(duplicateDir, 'duplicate.json');
  const duplicateRaw = JSON.stringify(initial, null, 2).replace(
    '  "schemaVersion": 1,',
    '  "schemaVersion": 1,\n  "schemaVersion": 1,',
  );
  fs.writeFileSync(duplicatePath, duplicateRaw, 'utf8');
  assert.throws(() => Bundle.readStrictJsonFile(duplicatePath), /含重複 JSON 欄位/);

  const badHashDir = makeWorkspace(tempRoot, 'bad-evidence-hash');
  const badHash = qualifiedRecord(badHashDir);
  badHash.calculationRuns[0].inputArtifact.sha256 = '0'.repeat(64);
  resign(badHash);
  assert.throws(() => Bundle.validateBundle(badHash, { baseDirectory: badHashDir }), /大小或 SHA-256/);

  const detachedComparisonDir = makeWorkspace(tempRoot, 'detached-comparison-data');
  const detachedComparison = qualifiedRecord(detachedComparisonDir);
  const comparison = detachedComparison.independentComparisons[0];
  const detachedAssertions = clone(comparison.assertions);
  detachedAssertions[0].actualNumber = 777;
  comparison.comparisonDataArtifact = writeEvidence(detachedComparisonDir, 'references/CMP-001.comparison-data.json', `${JSON.stringify({
    schemaVersion: 1,
    kind: Bundle.COMPARISON_DATA_KIND,
    comparisonId: comparison.comparisonId,
    runId: comparison.runId,
    productionOutputSha256: detachedComparison.calculationRuns[0].outputArtifact.sha256,
    productionResultDataSha256: detachedComparison.calculationRuns[0].resultDataArtifact.sha256,
    referenceArtifactSha256: comparison.referenceArtifact.sha256,
    referenceDataArtifactSha256: comparison.referenceDataArtifact.sha256,
    assertions: detachedAssertions,
  }, null, 2)}\n`);
  resign(detachedComparison);
  assert.throws(
    () => Bundle.validateBundle(detachedComparison, { baseDirectory: detachedComparisonDir }),
    /斷言值未與正規化比較資料一致/,
  );

  const extractedValueTamperDir = makeWorkspace(tempRoot, 'comparison-extracted-value-tamper');
  const extractedValueTamper = qualifiedRecord(extractedValueTamperDir);
  const extractedValueComparison = extractedValueTamper.independentComparisons[0];
  extractedValueComparison.assertions[0].expectedNumber = 777;
  extractedValueComparison.assertions[0].actualNumber = 777;
  extractedValueComparison.comparisonDataArtifact = writeEvidence(
    extractedValueTamperDir,
    'references/CMP-001.comparison-data.json',
    `${JSON.stringify({
      schemaVersion: 1,
      kind: Bundle.COMPARISON_DATA_KIND,
      comparisonId: extractedValueComparison.comparisonId,
      runId: extractedValueComparison.runId,
      productionOutputSha256: extractedValueTamper.calculationRuns[0].outputArtifact.sha256,
      productionResultDataSha256: extractedValueTamper.calculationRuns[0].resultDataArtifact.sha256,
      referenceArtifactSha256: extractedValueComparison.referenceArtifact.sha256,
      referenceDataArtifactSha256: extractedValueComparison.referenceDataArtifact.sha256,
      assertions: extractedValueComparison.assertions,
    }, null, 2)}\n`,
  );
  resign(extractedValueTamper);
  assert.throws(
    () => Bundle.validateBundle(extractedValueTamper, { baseDirectory: extractedValueTamperDir }),
    /未從兩側機讀資料取得相同數值/,
    '同步竄改案件包與比較 JSON 仍不得取代對兩側機讀原始檔的實際提取',
  );

  const escapeDir = makeWorkspace(tempRoot, 'path-escape');
  const escape = qualifiedRecord(escapeDir);
  escape.calculationRuns[0].inputArtifact.file = '../outside.json';
  resign(escape);
  assert.throws(() => Bundle.validateBundle(escape), /不得越出案件工作區/);

  const collisionDir = makeWorkspace(tempRoot, 'case-fold-collision');
  const collision = qualifiedRecord(collisionDir);
  const collisionRelative = 'inputs/BEAM-COLUMN.JSON';
  if (process.platform !== 'win32') writeEvidence(collisionDir, collisionRelative, '{"Mu":125.4}\n');
  const priorRun = clone(collision.calculationRuns[0]);
  priorRun.runId = 'RUN-CASE-COLLISION';
  priorRun.inputArtifact.file = collisionRelative;
  priorRun.outputArtifact = writeEvidence(collisionDir, 'outputs/collision-result.html', '<p>separate output</p>\n');
  priorRun.state = 'rejected';
  priorRun.calculationFingerprint = 'CF-FEDCBA0987654321';
  collision.calculationRuns.push(priorRun);
  resign(collision);
  assert.throws(
    () => Bundle.validateBundle(collision, { baseDirectory: collisionDir }),
    /不分大小寫路徑碰撞/,
  );

  const replacementDir = makeWorkspace(tempRoot, 'resolved-stale-run');
  const replacement = qualifiedRecord(replacementDir);
  const staleRun = clone(replacement.calculationRuns[0]);
  staleRun.runId = 'RUN-STALE-001';
  staleRun.executedAt = '2026-01-01T00:09:00.000Z';
  staleRun.inputArtifact = writeEvidence(replacementDir, 'inputs/old-beam-column.json', '{"Mu":120.0}\n');
  staleRun.outputArtifact = writeEvidence(replacementDir, 'outputs/old-beam-column-result.html', '<p>DCR 0.90</p>\n');
  staleRun.state = 'stale';
  staleRun.staleReasons = ['工具公式版本已更新。'];
  staleRun.calculationFingerprint = 'CF-0011223344556677';
  replacement.calculationRuns.unshift(staleRun);
  replacement.calculationRuns[1].supersedesRunId = staleRun.runId;
  resign(replacement);
  const replacementResult = Bundle.validateBundle(replacement, { baseDirectory: replacementDir });
  assert.equal(replacementResult.status, 'ready');
  assert.equal(replacementResult.qualificationStatus, 'G1');
  const unresolvedStale = clone(replacement);
  unresolvedStale.calculationRuns[1].supersedesRunId = '';
  resign(unresolvedStale);
  assert.equal(Bundle.validateBundle(unresolvedStale, { baseDirectory: replacementDir }).status, 'review');

  const orphanDir = makeWorkspace(tempRoot, 'orphan-superseded-chain');
  const orphan = qualifiedRecord(orphanDir);
  const orphanA = clone(orphan.calculationRuns[0]);
  orphanA.runId = 'RUN-ORPHAN-A';
  orphanA.toolId = 'orphan-tool';
  orphanA.toolName = '孤兒工具';
  orphanA.executedAt = '2026-01-01T00:01:00.000Z';
  orphanA.inputArtifact = writeEvidence(orphanDir, 'inputs/orphan-a.json', '{"case":"A"}\n');
  orphanA.outputArtifact = writeEvidence(orphanDir, 'outputs/orphan-a.html', '<!doctype html><p>orphan A</p>\n');
  orphanA.state = 'stale';
  orphanA.staleReasons = ['已由中間版本取代。'];
  orphanA.supersedesRunId = '';
  orphanA.calculationFingerprint = 'CF-AAAAAAAAAAAAAAAA';
  const orphanB = clone(orphanA);
  orphanB.runId = 'RUN-ORPHAN-B';
  orphanB.executedAt = '2026-01-01T00:02:00.000Z';
  orphanB.inputArtifact = writeEvidence(orphanDir, 'inputs/orphan-b.json', '{"case":"B"}\n');
  orphanB.outputArtifact = writeEvidence(orphanDir, 'outputs/orphan-b.html', '<!doctype html><p>orphan B</p>\n');
  orphanB.state = 'superseded';
  orphanB.staleReasons = [];
  orphanB.supersedesRunId = orphanA.runId;
  orphanB.calculationFingerprint = 'CF-BBBBBBBBBBBBBBBB';
  orphan.calculationRuns.push(orphanA, orphanB);
  resign(orphan);
  const orphanResult = Bundle.validateBundle(orphan, { baseDirectory: orphanDir });
  assert.equal(orphanResult.status, 'review', 'stale/superseded chain must end at a same-tool current run');

  const unstableDir = makeWorkspace(tempRoot, 'unstable-evidence');
  const unstable = qualifiedRecord(unstableDir);
  assert.throws(() => Bundle.validateBundle(unstable, {
    baseDirectory: unstableDir,
    beforeStabilityCheck({ observed }) {
      const first = observed.values().next().value;
      fs.appendFileSync(first.resolved, 'changed during validation', 'utf8');
    },
  }), /證據檔在驗證期間改變/);

  const unstableBundleDir = makeWorkspace(tempRoot, 'unstable-bundle');
  const unstableBundle = qualifiedRecord(unstableBundleDir);
  const unstableBundlePath = writeBundle(unstableBundleDir, unstableBundle);
  assert.throws(() => Bundle.inspectBundleFile(unstableBundlePath, {
    beforeBundleStabilityCheck({ loaded }) {
      fs.appendFileSync(loaded.filePath, ' \n', 'utf8');
    },
  }), /案件包在驗證期間發生變更/);

  const directInit = path.join(tempRoot, 'direct-init');
  const initResult = Bundle.initWorkspace(directInit, {
    caseId: 'CASE-INIT-001',
    caseLabel: '初始化案件',
    sourceKind: 'code-example',
    createdAt: CREATED_AT,
  });
  assert.equal(initResult.status, 'review');
  assert.deepEqual(fs.readdirSync(directInit).sort(), [
    'case-bundle.draft.json', 'inputs', 'outputs', 'references', 'reports',
  ]);
  fs.writeFileSync(path.join(directInit, 'sentinel.txt'), 'must survive', 'utf8');
  assert.throws(() => Bundle.initWorkspace(directInit, {
    caseId: 'CASE-INIT-002',
    caseLabel: '不得覆寫',
    sourceKind: 'synthetic',
  }), /為避免覆寫而停止/);
  assert.equal(fs.readFileSync(path.join(directInit, 'sentinel.txt'), 'utf8'), 'must survive');

  const directSealDir = makeWorkspace(tempRoot, 'direct-seal');
  const directDraft = qualifiedRecord(directSealDir, { lifecycle: 'draft' });
  const directDraftPath = writeBundle(directSealDir, directDraft);
  const directSealed = Bundle.sealBundle(directDraftPath, { sealedAt: SEALED_AT });
  assert.equal(directSealed.status, 'ready');
  assert.match(directSealed.outputFileName, /^case-bundle-EQB-[0-9A-F]{24}\.json$/);
  assert.equal(fs.existsSync(path.join(directSealDir, directSealed.outputFileName)), true);
  assert.equal(fs.existsSync(directDraftPath), true, 'seal must preserve the draft');
  assert.throws(() => Bundle.sealBundle(directDraftPath, { sealedAt: SEALED_AT }), /EEXIST/);

  const cliDraftDir = makeWorkspace(tempRoot, 'cli-draft');
  const cliDraft = Bundle.buildInitialBundle({
    caseId: 'CASE-CLI-DRAFT',
    caseLabel: 'CLI 草稿',
    sourceKind: 'synthetic',
    createdAt: CREATED_AT,
  });
  const cliDraftPath = writeBundle(cliDraftDir, cliDraft);
  const reviewCli = runCli(['--input', cliDraftPath, '--json']);
  assert.equal(reviewCli.status, 1, reviewCli.stderr || reviewCli.stdout);
  assert.equal(JSON.parse(reviewCli.stdout).status, 'review');

  const readyPath = writeBundle(syntheticDir, synthetic);
  const readyCli = runCli(['--input', readyPath, '--json']);
  assert.equal(readyCli.status, 0, readyCli.stderr || readyCli.stdout);
  assert.equal(JSON.parse(readyCli.stdout).highestLevel, 'G1');

  const blockedPath = path.join(cliDraftDir, 'tampered.json');
  const blocked = clone(cliDraft);
  blocked.case.caseLabel = 'CLI 指紋竄改';
  fs.writeFileSync(blockedPath, `${JSON.stringify(blocked, null, 2)}\n`, 'utf8');
  const blockedCli = runCli(['--input', blockedPath]);
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  assert.match(blockedCli.stderr, /指紋無效或與內容不一致/);

  const usageCli = runCli([]);
  assert.equal(usageCli.status, 3, usageCli.stderr || usageCli.stdout);
  assert.match(usageCli.stderr, /請擇一使用 --input、--seal 或 --init/);

  const mixedModesCli = runCli(['--input', cliDraftPath, '--seal', cliDraftPath]);
  assert.equal(mixedModesCli.status, 3, mixedModesCli.stderr || mixedModesCli.stdout);
  assert.match(mixedModesCli.stderr, /請擇一使用 --input、--seal 或 --init/);

  const cliInitPath = path.join(tempRoot, 'cli-init');
  const initCli = runCli([
    '--init', cliInitPath,
    '--case-id', 'CASE-CLI-INIT',
    '--case-label', 'CLI 初始化案件',
    '--source-kind', 'synthetic',
    '--json',
  ]);
  assert.equal(initCli.status, 1, initCli.stderr || initCli.stdout);
  assert.equal(JSON.parse(initCli.stdout).fileName, 'case-bundle.draft.json');
  fs.writeFileSync(path.join(cliInitPath, 'sentinel.txt'), 'cli must not overwrite', 'utf8');
  const secondInitCli = runCli([
    '--init', cliInitPath,
    '--case-id', 'CASE-CLI-INIT',
    '--case-label', 'CLI 初始化案件',
    '--source-kind', 'synthetic',
  ]);
  assert.equal(secondInitCli.status, 3, secondInitCli.stderr || secondInitCli.stdout);
  assert.equal(fs.readFileSync(path.join(cliInitPath, 'sentinel.txt'), 'utf8'), 'cli must not overwrite');

  const cliSealDir = makeWorkspace(tempRoot, 'cli-seal');
  const cliSealDraft = qualifiedRecord(cliSealDir, { lifecycle: 'draft' });
  const cliSealDraftPath = writeBundle(cliSealDir, cliSealDraft);
  const sealCli = runCli(['--seal', cliSealDraftPath, '--json']);
  assert.equal(sealCli.status, 0, sealCli.stderr || sealCli.stdout);
  const sealCliResult = JSON.parse(sealCli.stdout);
  assert.match(sealCliResult.outputFileName, /^case-bundle-EQB-[0-9A-F]{24}\.json$/);
  assert.equal(fs.existsSync(path.join(cliSealDir, sealCliResult.outputFileName)), true);
  assert.equal(fs.existsSync(cliSealDraftPath), true);
} finally {
  const resolvedTempRoot = path.resolve(tempRoot);
  const allowedParent = `${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase();
  assert.equal(resolvedTempRoot.toLowerCase().startsWith(allowedParent), true, 'cleanup must remain under the OS temp directory');
  assert.match(path.basename(resolvedTempRoot), /^engineering-qualification-case-bundle-/);
  fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
}

console.log('engineering qualification case bundle OK');
