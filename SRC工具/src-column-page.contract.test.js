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
    demands: { puTf: 734, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied', fyKgfCm2: 4200, esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 20.28 }, { yCm: 17, areaCm2: 10.14 },
        { yCm: 63, areaCm2: 10.14 }, { yCm: 73, areaCm2: 20.28 },
      ],
    },
    steel: { catalogId: 'rh-500x304x15x24', grade: 'A572 Gr.50', fysKgfCm2: 3500, fywKgfCm2: 3500, esKgfCm2: 2_040_000 },
    member: { lengthCm: 350, kx: 1.53, ky: 1.83 },
    detailing: {
      fullyEncased: true, centeredDoublySymmetricH: true, mainBarsContinuous: true,
      secondOrderDemandIncluded: true, seismicDesign: true, seismicAxialStrengthSubcheck: true,
      seismicColumnShearSubcheck: true, seismicStrongColumnWeakBeamSubcheck: true,
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

assert.equal(Page.PAGE_VERSION, 'v0.2');
assert.equal(Page.TOOL_ID, 'src-column-research');
assert.equal(Page.CASE_SCHEMA, 'src-column-research.case.v1');
assert.match(html, /<body class="formal-tool-output-page">/);
assert.match(html, /SRC 柱操作頁列印已封鎖/);
assert.match(html, /id="btnReport"/);
assert.match(html, /id="btnExportCase"/);
assert.match(html, /id="btnImportCase"/);
assert.match(html, /core\/src-column-seismic-axial\.js/);
assert.match(html, /id="enableShearSubcheck"[^>]*checked/);
assert.match(html, /id="enableStrongColumnSubcheck"[^>]*checked/);
assert.match(html, /id="enableConfinementSubcheck"[^>]*checked/);
for (const fieldId of ['mctTfM', 'mcbTfM', 'clearHeightCm', 'avCm2', 'cwUpperColumnTfM', 'ccwRightBeamTfM', 'coreWidthCm', 'coreAreaCm2', 'highlyConfinedAreaCm2']) {
  assert.match(html, new RegExp(`id="${fieldId}"`), `page exposes ${fieldId}`);
}
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
assert.equal(result.strongColumnWeakBeam.ok, true);
assert.equal(result.confinement.ok, true);
assert.equal(config.formalApprovalAllowed, false, 'research report explicitly blocks formal approval');
assert.equal(config.summary.ok, true);
assert.equal(config.inputs.length, 6);
assert.equal(config.diagrams.length, 1);
assert.equal(config.checks.flatMap(group => group.items).length, 11);
assert.equal(config.steps.length, 8);
assert.equal(config.project.name, '', 'blank optional project metadata remains acceptable');
assert.match(config.diagrams[0].dataURL, /^data:image\/svg\+xml;charset=utf-8,/);
const diagramSvg = decodeURIComponent(config.diagrams[0].dataURL.split(',').slice(1).join(','));
for (const needle of ['b = 65.0 cm', 'h = 80.0 cm', 'H500×304×15×24', 'L1: y=7.0 cm, As=20.28 cm²']) {
  assert.ok(diagramSvg.includes(needle), `section diagram includes ${needle}`);
}
const invalidDiagram = clone(input);
invalidDiagram.concrete.depthCm = 50;
assert.throws(() => Page.buildSectionDiagram(invalidDiagram), /未完全包覆/, 'impossible encasement fails closed');

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
  'SRC 柱強軸耐震研究核算計算書', '產出工具', '工具版本', '計算引擎', '計算指紋',
  '規範、構材與分析條件', '採用斷面與材料', '第 9.3 節採用地震軸力資料',
  '第 9.6.2 節採用柱剪力資料', '第 9.6.1 節採用接頭面名義彎矩', '第 9.6.3 節採用圍束資料',
  '第 9.6 節強軸耐震子檢核', 'SRC 柱計算斷面', '計算過程明細', '檢核結論',
]) assert.ok(renderedText.includes(needle), `rendered report includes ${needle}`);
for (const needle of [...forbidden, '適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML', '弱軸耐震、接頭區']) {
  assert.equal(renderedText.includes(needle), false, `rendered report excludes ${needle}`);
}
assert.equal(renderedText.includes('計畫名稱'), false);
assert.equal(renderedText.includes('設計人員'), false);
assert.match(renderedHtml, /data-formal-approval-allowed="false"/);

console.log('SRC column research page/report contract: OK');
