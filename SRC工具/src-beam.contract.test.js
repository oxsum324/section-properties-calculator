'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./core/src-beam-core.js');
const Page = require('./src-beam.js');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'src-beam.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'src-beam.js'), 'utf8');
const directPrintCss = fs.readFileSync(path.join(repoRoot, '結構工具箱', 'core', 'direct-print-boundary.css'), 'utf8');
const boundary = JSON.parse(fs.readFileSync(path.join(repoRoot, '結構工具箱', 'tools', 'calculation-book-content-boundary.json'), 'utf8'));
const reportRuntimePath = path.join(repoRoot, '結構工具箱', 'core', 'ui', 'report.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function officialBeamExample() {
  return {
    schema: Core.INPUT_SCHEMA,
    demands: { puTf: 0, muTfM: 150, vuTf: 96.5 },
    concrete: {
      bCm: 50, hCm: 80, fcKgfCm2: 280,
      flexureDepthCm: 68, compressionSteelDepthCm: 12, shearDepthCm: 73,
    },
    reinforcement: {
      asTensionCm2: 32.68, asCompressionCm2: 32.68, esKgfCm2: 2040000,
      fyrTensionKgfCm2: 4200, fyrCompressionKgfCm2: 4200,
      avCm2: 1.426, avfCm2: 1.426, spacingCm: 15, fyhKgfCm2: 4200,
    },
    steel: {
      grade: 'A572 Gr.50', depthCm: 51.2, flangeWidthCm: 20.2,
      flangeThicknessCm: 2.2, webThicknessCm: 1.2, zCm3: 2870,
      fysKgfCm2: 3500, fywKgfCm2: 3500,
    },
    shearFriction: { mu: 0.8, k1KgfCm2: 28, studContributionTf: 0 },
    detailing: {
      fullyEncased: true, normalWeightConcrete: true,
      monolithicShearFrictionSurface: true, mainBarsContinuous: true,
      reinforcementDetailingConfirmed: true, temporaryShoringProvided: true,
      steelConstructionCapacityVerified: false,
      highStrengthConcreteEvidenceConfirmed: false,
      highStrengthMaterialEvidenceConfirmed: false,
      longitudinalClearSpacingMm: 25, seismicDesign: false,
    },
  };
}

function loadReportRuntime(windowOverrides = {}) {
  const context = {
    window: { ...windowOverrides },
    console,
    Date,
    setTimeout,
    clearTimeout,
  };
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

assert.equal(Page.PAGE_VERSION, 'v1.0');
assert.equal(Page.TOOL_ID, 'src-beam');
assert.equal(Page.CASE_SCHEMA, 'src-beam.case.v1');
assert.match(html, /<body class="formal-tool-output-page">/);
assert.match(html, /class="formal-direct-print-boundary"/);
assert.match(html, /core\/direct-print-boundary\.css/);
assert.match(html, /core\/ui\/report\.js\?v=7/);
assert.match(html, /core\/src-beam-core\.js/);
assert.match(html, /tools\/project-meta-profile\.js/);
assert.match(html, /id="btnReport"/);
assert.match(html, /id="btnExportCase"/);
assert.match(html, /id="btnImportCase"/);
assert.match(html, /SRC 梁操作頁列印已封鎖/);
assert.match(directPrintCss, /body\.formal-tool-output-page > :not\(\.formal-direct-print-boundary\)/);
assert.match(directPrintCss, /body\.formal-tool-output-page > \.formal-direct-print-boundary/);

const input = officialBeamExample();
const result = Core.calculate(input);
const config = Page.buildReportConfig(input, result, { name: '', no: '', designer: '' });
assert.equal(result.status, 'OK');
assert.equal(config.inputs.length, 3, 'report includes adopted regulation, geometry and material groups');
assert.equal(config.diagrams.length, 1, 'report includes one calculation-section diagram');
assert.equal(config.diagrams[0].title, 'SRC 梁計算斷面');
assert.match(config.diagrams[0].dataURL, /^data:image\/svg\+xml;charset=utf-8,/);
assert.match(config.diagrams[0].caption, /As／As′.*非施工配筋詳圖/);
const diagramSvg = decodeURIComponent(config.diagrams[0].dataURL.split(',').slice(1).join(','));
for (const needle of ['b = 50.0 cm', 'h = 80.0 cm', '51.2 × 20.2 × 1.2 × 2.2 cm', 'As = 32.680 cm²', 'd = 68.0 cm']) {
  assert.ok(diagramSvg.includes(needle), `section diagram includes ${needle}`);
}
assert.match(html, /id="sectionDiagramImage"/);
assert.match(html, /id="sectionDiagramCaption"/);
const invalidDiagramInput = clone(input);
invalidDiagramInput.steel.depthCm = invalidDiagramInput.concrete.hCm;
assert.throws(() => Page.buildSectionDiagram(invalidDiagramInput), /H 型鋼未完全包覆/, 'impossible section geometry fails closed instead of drawing a misleading image');
assert.equal(config.checks.flatMap(group => group.items).length, 5);
assert.equal(config.steps.length, 4);
assert.equal(config.summary.ok, true);
assert.match(JSON.stringify(config), /100 年修正版/);
assert.match(JSON.stringify(config), /無軸力、非耐震構材強度檢核/);
assert.match(JSON.stringify(config), /5\.4\.1/);
assert.match(JSON.stringify(config), /5\.5/);
assert.equal(config.project.name, '', 'blank project name remains acceptable');
assert.equal(config.project.designer, '', 'blank designer remains acceptable');

const forbidden = [...new Set(Object.values(boundary.forbiddenCategories).flat())];
const configText = JSON.stringify(config);
for (const needle of forbidden) {
  assert.equal(configText.includes(needle), false, `report config excludes page-only wording: ${needle}`);
}
for (const needle of ['適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML']) {
  assert.equal(configText.includes(needle), false, `report config excludes work-page note: ${needle}`);
  assert.equal(`${html}\n${source}`.includes(needle), true, `work-page source retains helpful note: ${needle}`);
}

const reportContext = loadReportRuntime();
const reportUi = reportContext.window.ToolReportUI;
assert.ok(reportUi);
const documentState = reportUi.buildFormalDocumentStateReport(config);
assert.equal(documentState.status, 'ready', 'blank optional project metadata does not block attachment approval');
assert.match(documentState.html, /本計算內容已完成審閱，核可作為正式附件/);
assert.doesNotMatch(documentState.html, /DRAFT|非正式附件/);
const payload = Page.buildCasePayload(input, result, { name: '', no: '', designer: '' }, reportUi);
assert.equal(payload.schema, Page.CASE_SCHEMA);
assert.equal(payload.tool.id, Page.TOOL_ID);
assert.equal(payload.tool.version, Page.PAGE_VERSION);
assert.match(payload.calculationFingerprint, /^CF-[A-F0-9]{16}$/);
assert.equal(payload.report.calculationFingerprint, payload.calculationFingerprint);
assert.doesNotThrow(() => reportUi.validateCalculationCasePayload(payload, {
  expectedSchema: Page.CASE_SCHEMA,
  expectedToolId: Page.TOOL_ID,
  expectedVersion: Page.PAGE_VERSION,
}));
assert.throws(() => reportUi.validateCalculationCasePayload({ ...payload, schema: 'src-beam.case.v0' }, {
  expectedSchema: Page.CASE_SCHEMA, expectedToolId: Page.TOOL_ID, expectedVersion: Page.PAGE_VERSION,
}), /案件格式不符/);
assert.throws(() => reportUi.validateCalculationCasePayload({ ...payload, tool: { ...payload.tool, id: 'other-tool' } }, {
  expectedSchema: Page.CASE_SCHEMA, expectedToolId: Page.TOOL_ID, expectedVersion: Page.PAGE_VERSION,
}), /工具種類不符/);

const changedInput = clone(input);
changedInput.demands.muTfM = 70;
const changedTrace = reportUi.buildReportTrace(Page.buildReportConfig(changedInput, Core.calculate(changedInput), {}));
assert.notEqual(changedTrace.calculationFingerprint, payload.calculationFingerprint);
assert.throws(
  () => reportUi.assertCalculationCaseReplay(payload, changedTrace.calculationFingerprint),
  /重現失敗/,
  'changed engineering input cannot replay under the old calculation fingerprint'
);

let renderedHtml = '';
const renderContext = loadReportRuntime({
  open() {
    return {
      document: {
        open() {},
        write(nextHtml) { renderedHtml += String(nextHtml || ''); },
        close() {},
      },
      focus() {},
    };
  },
});
renderContext.openReport(config);
const renderedText = visibleText(renderedHtml);
for (const needle of [
  'SRC 梁正式規範核算計算書', '產出工具', '工具版本', '輸出時間', '計算指紋',
  '規範與構材條件', '設計需求與混凝土斷面', '計算過程明細', '檢核結論',
  'SRC 梁計算斷面', '非施工配筋詳圖',
]) {
  assert.ok(renderedText.includes(needle), `rendered report includes ${needle}`);
}
for (const needle of forbidden) {
  assert.equal(renderedText.includes(needle), false, `rendered report excludes page-only wording: ${needle}`);
}
assert.equal(renderedText.includes('計畫名稱'), false, 'blank optional project name is omitted from the report');
assert.equal(renderedText.includes('設計人員'), false, 'blank optional designer is omitted from the report');

console.log('SRC beam page/report contract: OK');
