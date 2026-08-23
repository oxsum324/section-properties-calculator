'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./core/src-column-core.js');
const Page = require('./src-column.js');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'src-column.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'src-column.js'), 'utf8');
const directPrintCss = fs.readFileSync(path.join(repoRoot, '結構工具箱', 'core', 'direct-print-boundary.css'), 'utf8');
const boundary = JSON.parse(fs.readFileSync(path.join(repoRoot, '結構工具箱', 'tools', 'calculation-book-content-boundary.json'), 'utf8'));
const reportRuntimePath = path.join(repoRoot, '結構工具箱', 'core', 'ui', 'report.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exampleInput() {
  return {
    schema: Core.INPUT_SCHEMA,
    seismicAxis: 'x',
    demands: { puTf: 734, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied', fyKgfCm2: 4200, esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 20.28 }, { yCm: 17, areaCm2: 10.14 },
        { yCm: 63, areaCm2: 10.14 }, { yCm: 73, areaCm2: 20.28 },
      ],
      xLayers: [
        { xCm: 7, areaCm2: 20.28 }, { xCm: 17, areaCm2: 10.14 },
        { xCm: 48, areaCm2: 10.14 }, { xCm: 58, areaCm2: 20.28 },
      ],
    },
    steel: { catalogId: 'rh-500x304x15x24', grade: 'A572 Gr.50', fysKgfCm2: 3500, fywKgfCm2: 3500, esKgfCm2: 2_040_000 },
    member: { lengthCm: 350, kx: 1.53, ky: 1.83 },
    detailing: {
      fullyEncased: true, centeredDoublySymmetricH: true, mainBarsContinuous: true,
      secondOrderDemandIncluded: true, seismicDesign: true, seismicAxialStrengthSubcheck: true,
      seismicColumnShearSubcheck: true, jointFlexuralStrengthRatioSubcheck: true, seismicStrongColumnWeakBeamSubcheck: true,
      seismicConfinementSubcheck: true, redistributeToSteelBoundary: true,
      highStrengthConcreteEvidenceConfirmed: false, highStrengthMaterialEvidenceConfirmed: false,
    },
    seismicAxial: {
      pdTf: 400, plTf: 100, peTf: 80, fu: 3,
      fuFromProjectSeismicCriteriaConfirmed: true,
      parkingUse: true, publicAssemblyUse: false, liveLoadExceeds05TfM2: false,
      designTensionStrengthTf: 900, designTensionStrengthConfirmed: false,
      applyTransferCapacityCap: false, transferCapacityConfirmed: false,
      compressionTransferCapacityTf: 1000, tensionTransferCapacityTf: 800,
      applyMomentFrameOmission: false, momentFrameConfirmed: false,
      relevantProvisionsSatisfiedConfirmed: false,
    },
    shear: {
      axis: 'x', mctTfM: 120, mcbTfM: 110, clearHeightCm: 300, effectiveDepthCm: 73,
      avCm2: 2.54, avfCm2: 2.54, spacingCm: 10, fyhKgfCm2: 4200, shearStudContributionTf: 0,
      projectPlasticHingeMomentsConfirmed: true, normalWeightConcreteConfirmed: true,
      monolithicInterfaceConfirmed: true, transverseReinforcementPerpendicularConfirmed: true,
    },
    jointFlexuralStrengthRatio: {
      axis: 'x', connectionType: 'src-beam-src-column',
      jointFaceNominalStrengthsConfirmed: true, allConnectedMembersIncludedConfirmed: true,
      componentStrengthsSeparatedConfirmed: true, useVerifiedSmoothTransferAlternative: false,
      smoothStressTransferAnalysisConfirmed: false,
      cases: [
        { sense: 'clockwise', steelColumnSumTfM: 251.424, steelBeamSumTfM: 209.52, rcColumnSumTfM: 167.616, rcBeamSumTfM: 139.68 },
        { sense: 'counterclockwise', steelColumnSumTfM: 251.424, steelBeamSumTfM: 209.52, rcColumnSumTfM: 167.616, rcBeamSumTfM: 139.68 },
      ],
    },
    strongColumnWeakBeam: {
      axis: 'x', orthogonalBeamDirectionPresent: false,
      columnStrengthsAtGoverningAxialLoadsConfirmed: true, jointFaceNominalStrengthsConfirmed: true,
      opposingMomentDirectionsConfirmed: true,
      cases: [
        { sense: 'clockwise', upperColumnNominalTfM: 209.52, lowerColumnNominalTfM: 209.52, leftBeamNominalTfM: 195.8, rightBeamNominalTfM: 153.4 },
        { sense: 'counterclockwise', upperColumnNominalTfM: 209.52, lowerColumnNominalTfM: 209.52, leftBeamNominalTfM: 153.4, rightBeamNominalTfM: 195.8 },
      ],
    },
    confinement: {
      axis: 'x', coreWidthCm: 54, coreAreaCm2: 4104, highlyConfinedAreaCm2: 0,
      minimumLongitudinalBarDiameterCm: 2.54, providedConfinementZoneHeightCm: 80,
      nonConfinedSpacingCm: 15, firstHoopDistanceCm: 5, inflectionPointWithinMiddleHalf: true,
      wholeLengthConfined: false, mainBarSplicePresent: false, highlyConfinedAreaConfirmed: true,
      cornerLongitudinalBarsConfirmed: true, crosstiesProvidedAsNeededConfirmed: true,
      crosstiesEngageLongitudinalBarsConfirmed: true, crosstieHooksAlternatedConfirmed: true,
      spliceWithinMiddleHalfConfirmed: false, tensionLapSpliceDesignedConfirmed: false,
      confinementThroughSpliceConfirmed: false, alternateBarsSplicedOnlyConfirmed: false,
      spliceStaggerDistanceCm: 60,
    },
  };
}

function loadReportRuntime(windowOverrides = {}) {
  const context = { window: { ...windowOverrides }, console, Date, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(reportRuntimePath, 'utf8'), context, { filename: reportRuntimePath });
  return context;
}

function visibleText(reportHtml) {
  return String(reportHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

assert.equal(Page.PAGE_VERSION, 'v0.5');
assert.equal(Page.TOOL_ID, 'src-column-research');
assert.equal(Page.CASE_SCHEMA, 'src-column-research.case.v4');
assert.equal(Page.PREVIOUS_CASE_SCHEMA, 'src-column-research.case.v3');
assert.equal(Page.PREVIOUS_PAGE_VERSION, 'v0.4');
assert.equal(Page.LEGACY_CASE_SCHEMA, 'src-column-research.case.v2');
assert.equal(Page.LEGACY_PAGE_VERSION, 'v0.3');
assert.match(html, /SRC 柱方向可選耐震研究核算 V0\.5/);
assert.match(html, /案件 schema v4/);
assert.match(html, /<body class="formal-tool-output-page">/);
assert.match(html, /SRC 柱操作頁列印已封鎖/);
assert.match(html, /id="btnReport"/);
assert.match(html, /id="btnExportCase"/);
assert.match(html, /id="btnImportCase"/);
assert.match(html, /core\/src-column-seismic-axial\.js/);
assert.match(html, /id="enableShearSubcheck"[^>]*checked/);
assert.match(html, /id="enableJointRatioSubcheck"[^>]*checked/);
assert.match(html, /id="enableStrongColumnSubcheck"[^>]*checked/);
assert.match(html, /id="enableConfinementSubcheck"[^>]*checked/);
for (const fieldId of ['seismicAxis', 'muyTfM', 'mctTfM', 'mcbTfM', 'clearHeightCm', 'avCm2', 'weakAxisRcDesignBasis', 'weakAxisSteelNominalShearTf', 'weakAxisEffectiveDepthCm', 'weakAxisAvCm2', 'weakAxisAvfCm2', 'weakAxisRcNominalShearTf', 'weakAxisRequiredTransverseAreaCm2', 'xLayer1X', 'jcwSteelColumnTfM', 'jccwRcBeamTfM', 'cwUpperColumnTfM', 'ccwRightBeamTfM', 'coreWidthCm', 'coreAreaCm2', 'highlyConfinedAreaCm2', 'weakAxisAhccZeroConfirmed']) {
  assert.match(html, new RegExp(`id="${fieldId}"`), `page exposes ${fieldId}`);
}
assert.match(html, /id="weakAxisSteelReference"[^>]*src-page-only[^>]*data-y-shear/, 'external weak-axis steel reference is explicitly page-only and direction-scoped');
assert.match(html, /core\/src-column-weak-axis-shear-reference\.js/, 'page loads the independent AISC G6 reference');
assert.match(html, /core\/src-column-core\.js/);
assert.match(html, /鋼筋混凝土\/shared\/pmsection\.js/);
assert.match(directPrintCss, /body\.formal-tool-output-page > :not\(\.formal-direct-print-boundary\)/);

const input = exampleInput();
const result = Core.calculate(input);
const config = Page.buildReportConfig(input, result, { name: '', no: '', designer: '' });
assert.equal(result.status, 'REVIEW');
assert.equal(result.checks.engineeringStrength, true);
assert.equal(result.seismicAxial.ok, true);
assert.equal(result.shear.ok, true);
assert.equal(result.jointFlexuralStrengthRatio.ok, true);
assert.equal(result.strongColumnWeakBeam.ok, true);
assert.equal(result.confinement.ok, true);
assert.equal(config.formalApprovalAllowed, false, 'research report explicitly blocks formal approval');
assert.equal(config.summary.ok, true);
assert.equal(config.inputs.length, 7);
assert.equal(config.diagrams.length, 1);
assert.equal(config.checks.flatMap(group => group.items).length, 15);
assert.equal(config.steps.length, 9);
assert.equal(config.project.name, '', 'blank optional project metadata remains acceptable');
assert.match(config.diagrams[0].dataURL, /^data:image\/svg\+xml;charset=utf-8,/);
const diagramSvg = decodeURIComponent(config.diagrams[0].dataURL.split(',').slice(1).join(','));
for (const needle of ['b = 65.0 cm', 'h = 80.0 cm', 'H500×304×15×24', 'L1: y=7.0 cm, As=20.28 cm²']) {
  assert.ok(diagramSvg.includes(needle), `section diagram includes ${needle}`);
}
const invalidDiagram = clone(input);
invalidDiagram.concrete.depthCm = 50;
assert.throws(() => Page.buildSectionDiagram(invalidDiagram), /未完全包覆/, 'impossible encasement fails closed');

const weakAxisInput = clone(input);
weakAxisInput.seismicAxis = 'y';
weakAxisInput.demands.muxTfM = 0;
weakAxisInput.demands.muyTfM = 60;
weakAxisInput.shear.axis = 'y';
weakAxisInput.jointFlexuralStrengthRatio.axis = 'y';
weakAxisInput.strongColumnWeakBeam.axis = 'y';
weakAxisInput.confinement.axis = 'y';
Object.assign(weakAxisInput.shear, {
  weakAxisRcDesignBasis: 'automatic-clause-5.5.2',
  weakAxisSteelNominalShearTf: 100,
  weakAxisEffectiveDepthCm: 58,
  weakAxisAvCm2: 2.54,
  weakAxisAvfCm2: 2.54,
  weakAxisRcNominalShearTf: 120,
  weakAxisRequiredTransverseAreaCm2: 1.2,
  weakAxisStrengthsConfirmed: true,
  weakAxisRcStrengthConfirmed: true,
  weakAxisRequiredTransverseAreaConfirmed: true,
});
weakAxisInput.confinement.weakAxisAhccZeroConfirmed = true;
const weakAxisResult = Core.calculate(weakAxisInput);
const weakAxisConfig = Page.buildReportConfig(weakAxisInput, weakAxisResult, {});
assert.equal(weakAxisResult.rc.uniaxialAxis, 'y', 'page input supports a true weak-axis uniaxial RC P-M path');
assert.equal(weakAxisConfig.title, 'SRC 柱 Y 向（鋼骨弱軸）耐震研究核算計算書');
assert.equal(JSON.stringify(weakAxisConfig).includes('第 5.5.2 節自動計算'), true, 'weak-axis report states the adopted automatic RC basis');
assert.equal(JSON.stringify(weakAxisConfig).includes('Y 向 RC b / d / b′'), true, 'weak-axis report exposes direction-aware RC geometry');
assert.equal(JSON.stringify(weakAxisConfig).includes('一般剪力：Vnr + Vnc'), true, 'weak-axis report includes clause 5.5.2 substitutions');
assert.equal(JSON.stringify(weakAxisConfig).includes('x=7.0 cm：As=20.28 cm²'), true, 'weak-axis report labels the adopted reinforcement-row coordinate as x');
assert.equal(JSON.stringify(weakAxisConfig).includes('y=7.0 cm：As=20.28 cm²'), false, 'weak-axis report does not mislabel the reinforcement-row coordinate as y');
const weakAxisDiagramSvg = decodeURIComponent(weakAxisConfig.diagrams[0].dataURL.split(',').slice(1).join(','));
assert.ok(weakAxisDiagramSvg.includes('L1: x=7.0 cm, As=20.28 cm²'), 'weak-axis diagram uses the adopted x-coordinate reinforcement rows');

const manualWeakAxisInput = clone(weakAxisInput);
manualWeakAxisInput.shear.weakAxisRcDesignBasis = 'project-confirmed';
const manualWeakAxisResult = Core.calculate(manualWeakAxisInput);
const manualWeakAxisConfig = Page.buildReportConfig(manualWeakAxisInput, manualWeakAxisResult, {});
assert.equal(JSON.stringify(manualWeakAxisConfig).includes('專案確認 Vnrc'), true, 'legacy project-confirmed RC basis remains reportable');

const forbidden = [...new Set(Object.values(boundary.forbiddenCategories).flat())];
const configText = JSON.stringify(config);
for (const needle of forbidden) assert.equal(configText.includes(needle), false, `report config excludes page-only wording: ${needle}`);
for (const needle of ['適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML']) {
  assert.equal(configText.includes(needle), false, `report config excludes work-page note: ${needle}`);
  assert.equal(`${html}\n${source}`.includes(needle), true, `work page retains ${needle}`);
}

const reportContext = loadReportRuntime();
const reportUi = reportContext.window.ToolReportUI;
const assessment = reportUi.assessFormalAttachment(config);
assert.equal(assessment.status, 'review');
assert.equal(assessment.formalApprovalAllowed, false);
assert.equal(assessment.formalOutputAllowed, false);
assert.equal(assessment.readyToSign, false);
assert.equal(assessment.approvalRequired, false);
const documentState = reportUi.buildFormalDocumentStateReport(config);
assert.match(documentState.html, /data-formal-approval-allowed="false"/);
assert.match(documentState.html, /研究核算：正式附件核可尚未開放/);

const payload = Page.buildCasePayload(input, result, { name: '', no: '', designer: '' }, reportUi);
assert.equal(payload.schema, Page.CASE_SCHEMA);
assert.equal(payload.tool.id, Page.TOOL_ID);
assert.match(payload.calculationFingerprint, /^CF-[A-F0-9]{16}$/);
assert.equal(payload.report.calculationFingerprint, payload.calculationFingerprint);
assert.doesNotThrow(() => reportUi.validateCalculationCasePayload(payload, {
  expectedSchema: Page.CASE_SCHEMA, expectedToolId: Page.TOOL_ID, expectedVersion: Page.PAGE_VERSION,
}));
const legacyPayload = clone(payload);
legacyPayload.schema = Page.LEGACY_CASE_SCHEMA;
legacyPayload.tool.name = 'SRC 柱強軸耐震研究核算';
legacyPayload.tool.version = Page.LEGACY_PAGE_VERSION;
legacyPayload.tool.calculationEngine = 'src-column.core.v0.9.0-research';
legacyPayload.input.schema = 'src-column.input.v8';
delete legacyPayload.input.seismicAxis;
delete legacyPayload.input.reinforcement.xLayers;
for (const key of ['shear', 'jointFlexuralStrengthRatio', 'strongColumnWeakBeam', 'confinement']) {
  delete legacyPayload.input[key].axis;
}
const migration = Page.migrateCasePayload(legacyPayload);
assert.equal(migration.migrated, true);
assert.equal(migration.payload.schema, Page.CASE_SCHEMA);
assert.equal(migration.payload.tool.version, Page.PAGE_VERSION);
assert.equal(migration.payload.input.schema, Core.INPUT_SCHEMA);
assert.equal(migration.payload.input.seismicAxis, 'x');
assert.equal(migration.payload.input.demands.muyTfM, 0);
assert.equal(migration.payload.input.shear.axis, 'x');
assert.equal('calculationFingerprint' in migration.payload, false, 'legacy fingerprint is not misrepresented as a current replay');
assert.doesNotThrow(() => Core.calculate(migration.payload.input), 'legacy v0.3 X-axis input recalculates under the current core');
assert.throws(() => Page.migrateCasePayload({ ...legacyPayload, input: null }), /缺少計算輸入/);
const previousPayload = Page.buildCasePayload(manualWeakAxisInput, manualWeakAxisResult, {}, reportUi);
previousPayload.schema = Page.PREVIOUS_CASE_SCHEMA;
previousPayload.tool.version = Page.PREVIOUS_PAGE_VERSION;
previousPayload.tool.calculationEngine = 'src-column.core.v0.10.0-research';
previousPayload.input.schema = 'src-column.input.v9';
delete previousPayload.input.shear.weakAxisRcDesignBasis;
delete previousPayload.input.shear.weakAxisEffectiveDepthCm;
delete previousPayload.input.shear.weakAxisAvCm2;
delete previousPayload.input.shear.weakAxisAvfCm2;
delete previousPayload.input.shear.weakAxisRcStrengthConfirmed;
const previousMigration = Page.migrateCasePayload(previousPayload);
assert.equal(previousMigration.migrated, true);
assert.equal(previousMigration.payload.input.shear.weakAxisRcDesignBasis, 'project-confirmed', 'v0.4 weak-axis case preserves its historical manual RC basis');
assert.equal(previousMigration.payload.input.shear.weakAxisRcNominalShearTf, 120, 'v0.4 weak-axis Vnrc is preserved');
assert.equal(previousMigration.payload.input.shear.weakAxisRequiredTransverseAreaCm2, 1.2, 'v0.4 weak-axis Ash is preserved');
assert.equal(previousMigration.payload.input.shear.weakAxisAvCm2, 2.54, 'v0.4 provided Av is mapped to the selected y direction');
assert.doesNotThrow(() => Core.calculate(previousMigration.payload.input), 'v0.4 weak-axis case recalculates with preserved manual values');
const changedInput = clone(input);
changedInput.seismicAxial.pdTf = 450;
const changedTrace = reportUi.buildReportTrace(Page.buildReportConfig(changedInput, Core.calculate(changedInput), {}));
assert.notEqual(changedTrace.calculationFingerprint, payload.calculationFingerprint);
assert.throws(() => reportUi.assertCalculationCaseReplay(payload, changedTrace.calculationFingerprint), /重現失敗/);

let renderedHtml = '';
const renderContext = loadReportRuntime({
  open() {
    return {
      document: { open() {}, write(nextHtml) { renderedHtml += String(nextHtml || ''); }, close() {} },
      focus() {},
    };
  },
});
renderContext.openReport(config);
const renderedText = visibleText(renderedHtml);
for (const needle of [
  'SRC 柱 X 向（鋼骨強軸）耐震研究核算計算書', '產出工具', '工具版本', '計算引擎', '計算指紋',
  '規範、構材與分析條件', '採用斷面與材料', '第 9.3 節採用地震軸力資料',
  '第 9.6.2 節採用柱剪力資料', '第 8.4.2 節採用接頭面分量彎矩', '第 9.6.1 節採用接頭面名義彎矩', '第 9.6.3 節採用圍束資料',
  '第 8.4.2 節接頭撓曲強度比', '第 9.6 節X 向（鋼骨強軸）耐震子檢核', 'SRC 柱計算斷面', '計算過程明細', '檢核結論',
]) assert.ok(renderedText.includes(needle), `rendered report includes ${needle}`);
for (const needle of [...forbidden, '適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML', '接頭區剪力與接合細部']) {
  assert.equal(renderedText.includes(needle), false, `rendered report excludes ${needle}`);
}
assert.equal(renderedText.includes('計畫名稱'), false);
assert.equal(renderedText.includes('設計人員'), false);
assert.equal(renderedText.includes('AISC 360 G6'), false, 'HTML-only external comparison does not leak into the calculation report');
assert.match(renderedHtml, /data-formal-approval-allowed="false"/);
assert.match(renderedHtml, /rep-block rep-block--keep rep-block--new-page/, 'selected report groups start on a clean printed page');

console.log('SRC column research page/report contract: OK');
