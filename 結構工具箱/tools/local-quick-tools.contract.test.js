const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolsRoot, '..', '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function assertFile(relativePath) {
  const fullPath = toolboxFile(relativePath);
  assert.ok(fs.existsSync(fullPath), `missing toolbox file: ${relativePath}`);
  return fullPath;
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing: ${needle}`);
}

function assertNoIncludes(text, needle, label) {
  assert.equal(text.includes(needle), false, `${label} should not include: ${needle}`);
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.ok(start >= 0, `${functionName} missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:none\\s*!important`);
    assert.ok(pattern.test(text), `${label} print hides ${selector}`);
  });
}

function assertFunctionTemplateExcludes(source, functionName, startNeedle, needles, label) {
  const body = functionSource(source, functionName);
  const start = body.indexOf(startNeedle);
  assert.ok(start >= 0, `${label} missing template start: ${startNeedle}`);
  const template = body.slice(start);
  needles.forEach(needle => assertNoIncludes(template, needle, label));
}

const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
];

function assertHomeToolCategories(title, categories, label) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expectedCategories = categories.map(category => `'${category}'`).join(', ');
  assert.match(
    repoDocs.homeJs,
    new RegExp(`title: '${escapedTitle}'[\\s\\S]*?categories: \\[${expectedCategories}\\]`),
    label
  );
}

const manifestPath = assertFile('tools/local-quick-tools.manifest.json');
const manifestText = readText(manifestPath);
const manifest = JSON.parse(manifestText);
const tools = manifest.tools;
const formalManifestPath = assertFile('tools/formal-tools.manifest.json');
const formalManifestText = readText(formalManifestPath);
const formalManifest = JSON.parse(formalManifestText);

assert.equal(manifest.version, '0.3.0', 'local quick tools manifest version');
assert.equal(manifest.family, 'local-quick-tools', 'local quick tools manifest family');
assert.ok(Array.isArray(tools), 'local quick tools manifest tools');
assert.ok(tools.length >= 3, 'local quick tools manifest tool count');
assert.equal(formalManifest.version, '0.2.0', 'formal tools manifest version');
assert.equal(formalManifest.family, 'formal-tools', 'formal tools manifest family');
assert.ok(Array.isArray(formalManifest.tools), 'formal tools manifest tools');
assert.ok(Array.isArray(formalManifest.requiredRoutes), 'formal tools manifest required routes');
assert.ok(formalManifest.tools.length >= 14, 'formal tools manifest tool count');
const formalManifestRoutes = new Set(formalManifest.tools.map(tool => tool.route));
formalManifest.requiredRoutes.forEach(route => {
  assert.ok(formalManifestRoutes.has(route), `formal tools manifest missing route: ${route}`);
});

const repoDocs = {
  index: readText(path.join(toolboxRoot, 'index.html')),
  homeHtml: readText(toolboxFile('index.html')),
  indexClassic: readText(toolboxFile('index-classic.html')),
  homeCss: readText(toolboxFile('assets/home/home.css')),
  homeTokens: readText(toolboxFile('assets/hy/colors_and_type.css')),
  homeJs: readText(toolboxFile('assets/home/home.js')),
  seismicCore: readText(toolboxFile('core/loads/seismic.js')),
  windReport: readText(toolboxFile('core/wind-report.js')),
  seismicDynamic: readText(toolboxFile('tools/地震力/seismic-dynamic.html')),
  seismicAppendage: readText(toolboxFile('tools/地震力/seismic-appendage.html')),
  seismicMisc: readText(toolboxFile('tools/地震力/seismic-misc.html')),
  windKzt: readText(toolboxFile('tools/風力/wind-kzt.html')),
  windSpecial: readText(toolboxFile('tools/風力/wind-special.html')),
  windObjectSolid: readText(toolboxFile('tools/風力/wind-object-solid.html')),
  windObjectFrame: readText(toolboxFile('tools/風力/wind-object-frame.html')),
  windLatticeTower: readText(toolboxFile('tools/風力/wind-lattice-tower.html')),
  windObjectTower: readText(toolboxFile('tools/風力/wind-object-tower.html')),
  windFenceSign: readText(toolboxFile('tools/風力/wind-fence-sign.html')),
  windSignPole: readText(toolboxFile('tools/風力/wind-sign-pole.html')),
  steelBeam: readText(toolboxFile('tools/鋼構/steel-beam.html')),
  steelColumn: readText(toolboxFile('tools/鋼構/steel-column.html')),
  forcePicker: readText(toolboxFile('tools/force-picker.html')),
  readme: readText(repoFile('README.md')),
  toolReportGuide: readText(repoFile('TOOL_REPORT_GUIDE.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  vercel: readText(repoFile('vercel.json')),
};
repoDocs.homeSource = `${repoDocs.index}\n${repoDocs.homeHtml}\n${repoDocs.homeJs}`;

assertIncludes(repoDocs.windReport, 'showWindReportIssue', 'shared wind report inline status helper');
assertIncludes(repoDocs.windReport, 'repWindowStatus', 'shared wind report window status helper');
assert.equal(repoDocs.windReport.includes('alert('), false, 'shared wind report core uses inline status instead of alerts');

const runnerPath = assertFile(manifest.shared.runner);
const exportHelperPath = assertFile(manifest.shared.exportHelper);
const exportHelperTestPath = assertFile(manifest.shared.exportHelperTest);
const outputConsistencyTestPath = assertFile(manifest.shared.outputConsistencyTest);
const browserSmokeTestPath = assertFile(manifest.shared.browserSmokeTest);
const documentStateHelperPath = assertFile(manifest.shared.documentStateHelper);
const directPrintBoundaryPath = assertFile(manifest.shared.directPrintBoundaryStylesheet);
const formalBrowserSmokeTestPath = assertFile('tools/formal-browser-smoke.test.js');
const runnerText = readText(runnerPath);
const exportHelperText = readText(exportHelperPath);
const exportHelperTestText = readText(exportHelperTestPath);
const outputConsistencyTestText = readText(outputConsistencyTestPath);
const browserSmokeTestText = readText(browserSmokeTestPath);
const documentStateHelperText = readText(documentStateHelperPath);
const directPrintBoundaryText = readText(directPrintBoundaryPath);
const formalBrowserSmokeTestText = readText(formalBrowserSmokeTestPath);
const ExportHelper = require(exportHelperPath);

[
  '"version": "0.3.0"',
  '"family": "local-quick-tools"',
  '"shared"',
  '"runner"',
  '"outputConsistencyTest"',
  '"browserSmokeTest"',
  '"documentStateHelper"',
  '"documentStateBuilder"',
  '"documentStateRequired"',
  '"tools"',
  '"foundation-local"',
  '"equipment-load"',
  '"earth-pressure"',
  '"jsonRoundTrip"',
].forEach(needle => assertIncludes(manifestText, needle, 'local quick tools manifest'));

assert.equal(manifest.shared.documentStateRequired, true, 'local quick calculation-book document state is required');
[
  manifest.shared.documentStateBuilder,
  'getPageReportReadinessLevel',
  'DRAFT／非正式附件',
  manifest.shared.readyDocumentClass,
  '文件分類｜',
  '可送簽版',
  'data-formal-document-state-style',
].forEach(needle => assertIncludes(documentStateHelperText, needle, 'local quick shared document-state helper'));

assert.equal(manifest.shared.readyDocumentClass, 'ready-to-sign', 'local quick ready document class');
assert.equal(manifest.shared.readyDocumentLabel, '文件分類｜可送簽版', 'local quick ready document label');

assert.equal(manifest.shared.directPrintBodyClass, 'local-quick-output-page', 'local quick direct-print body class');
assert.equal(manifest.shared.directPrintBoundaryClass, 'local-quick-direct-print-boundary', 'local quick direct-print boundary class');
assert.deepEqual(
  manifest.shared.directPrintBoundaryNeedles,
  ['局部快算主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件'],
  'local quick direct-print boundary wording'
);
assertIncludes(
  directPrintBoundaryText,
  'body.local-quick-output-page > :not(.local-quick-direct-print-boundary)',
  'local quick direct-print CSS hides work-page content'
);
assertIncludes(
  directPrintBoundaryText,
  'body.local-quick-output-page > .local-quick-direct-print-boundary',
  'local quick direct-print CSS renders only boundary notice'
);
assert.equal(directPrintBoundaryText.includes('content: "DRAFT"'), false, 'local quick direct print is not a draft calculation book');

[
  'local quick tools manifest runner OK',
  'manifest.shared.exportHelperTest',
  'manifest.shared.outputConsistencyTest',
  'manifest.shared.browserSmokeTest',
  'manifest.shared.contractTest',
  'runNode',
].forEach(needle => assertIncludes(runnerText, needle, 'local quick tools runner'));

[
  'local quick output consistency OK',
  'assertNonFiniteNumbersSerialized',
  'Exporter.buildPayload',
  'r.provenance',
].forEach(needle => assertIncludes(outputConsistencyTestText, needle, 'local quick output consistency test'));

[
  'local quick browser smoke OK',
  'Microsoft Edge',
  'vercel.json',
  'Target.createTarget',
  'Emulation.setDeviceMetricsOverride',
  'route-tool',
  'route-toolbox-home',
  'file-url-new-home',
  'assertNewHomeState',
  'btnJson',
  'blob.text()',
  'assertJsonExportState',
  'assertPlaceholderJsonExportState',
  'jsonImportExpression(tool, exportState.payload)',
  'tool.jsonRoundTrip === true',
  'assertFoundationJsonImportState',
  'assertEquipmentJsonImportState',
  'assertEarthJsonImportState',
  'foundation import service load',
  'earth import wall output',
  'btnPrint',
  'assertReportState',
  'assertPlaceholderReportState',
  'reportHtmlText',
  'visible report text',
  "reportExpression('summary')",
  "reportExpression('detailed')",
  "jsonExportExpression('placeholder')",
  "reportExpression('summary', 'placeholder')",
  "reportExpression('detailed', 'placeholder')",
  "viewport.key === 'desktop'",
  'desktop route-tool interaction',
  'relativeLinks',
  'horizontalOverflow',
  'Page.javascriptDialogOpening',
  'legacyInlineValidationCases',
  'steel-beam',
  'steel-column',
  'referenceReadinessExpression',
  'referenceReadinessCases',
  'assertReferenceReadinessState',
  'wind-kzt',
  'wind-special',
  'forcePickerStatusExpression',
  '/force-picker',
  'targetStatus',
].forEach(needle => assertIncludes(browserSmokeTestText, needle, 'local quick browser smoke test'));

[
  'formal browser smoke OK',
  'Microsoft Edge',
  'formal-tools.manifest.json',
  'assertFormalToolCoverage',
  'formalTools',
  'requiredFormalRoutes',
  'tool.reportButtonSelector',
  'tool.exportButton',
  'Emulation.setDeviceMetricsOverride',
  'horizontalOverflow',
  'reportModeControls',
  'selectId',
  'exportCaptureExpression',
  'reportCaptureExpression',
  'data-diagram-role',
  'diagramRoleNeedles',
  'reportForbiddenNeedles',
  'reportDisclosureNeedles',
  'goldenCaseExpression',
  'assertGoldenCaseState',
  'settlePage',
  'waitForImportStatus',
  "viewport.key === 'desktop'",
  'desktop interaction',

  '工具內建',
  '專業版',
].forEach(needle => assertIncludes(formalBrowserSmokeTestText, needle, 'formal browser smoke test'));

[
  '"version": "0.2.0"',
  '"family": "formal-tools"',
  '"shared"',
  '"runner"',
  '"contractTest"',
  '"browserSmokeTest"',
  '"maturityMatrix"',
  '"requiredRoutes"',
  '"reportForbiddenNeedles"',
  '"reportDisclosureNeedles"',
  '"tools"',
  '"wind-force"',
  '"wind-cc"',
  '"wind-open-roof"',
  '"wind-parapet"',
  '"wind-object-solid"',
  '"wind-lattice-tower"',
  '"wind-sign-pole"',
  '"seismic-force"',
  '"seismic-appendage"',
  '"seismic-misc"',
  '"seismic-dynamic"',
  '"reportButtonSelector"',
  '"exportButton"',
  '"diagramRoleNeedles"',
  '"goldenCases"',
  '"default-solid-sign-table-2-10"',
  '"default-ground-fence-table-2-10"',
  '"default-unreinforced-masonry-appendage"',
  '"工具內建"',
  '"專業版"',
].forEach(needle => assertIncludes(formalManifestText, needle, 'formal tools manifest'));

[
  'LocalQuickExport',
  'function escapeHtml',
  'function normalizeProjectFieldValue',
  'function normalizeProjectMeta',
  'function isProjectMetaMissing',
  'function renderStatusGridPanel',
  'function jsonReplacer',
  'function buildPayload',
  'function downloadJson',
  'function downloadResultJson',
  'options.input',
  'application/json',
  'module.exports',
].forEach(needle => assertIncludes(exportHelperText, needle, 'local quick export helper'));

[
  'withDownloadStubs',
  'normalizeProjectMeta',
  'downloadResultJson',
  'foundation-local-2026-05-19.json',
  'application/json;charset=utf-8',
  'local quick export helper OK',
].forEach(needle => assertIncludes(exportHelperTestText, needle, 'local quick export helper test'));

assert.equal(ExportHelper.version, '0.2.0', 'local quick export helper version');
assert.equal(ExportHelper.normalizeProjectFieldValue('未填'), '', 'local quick export helper clears placeholder project metadata');
const helperPayload = ExportHelper.buildPayload({
  tool: { id: 'helper-smoke', name: 'Helper Smoke' },
  project: { name: '未填', no: 'LOCAL-VERIFY-001', designer: 'Codex QA' },
  generatedAt: '2026-05-19T00:00:00.000Z',
  result: { value: Infinity }
});
assert.equal(helperPayload.tool.id, 'helper-smoke', 'local quick export helper payload tool');
assert.equal(helperPayload.project.name, '', 'local quick export helper payload scrubs placeholder project name');
assert.equal(helperPayload.project.no, 'LOCAL-VERIFY-001', 'local quick export helper payload keeps project number');
assert.equal(helperPayload.project.designer, 'Codex QA', 'local quick export helper payload keeps project designer');
assert.equal(JSON.stringify(helperPayload, ExportHelper.jsonReplacer).includes('"Infinity"'), true, 'local quick export helper non-finite number serialization');
assert.equal(ExportHelper.isProjectMetaMissing({ name: '案名', no: 'A-1', designer: 'QA' }), false, 'local quick export helper complete project metadata');
assert.equal(ExportHelper.isProjectMetaMissing({ name: '未填', no: 'A-1', designer: 'QA' }), true, 'local quick export helper placeholder metadata');
delete require.cache[require.resolve(exportHelperTestPath)];
require(exportHelperTestPath);
[
  ['tools/equipment/equipment-load.html', 'Exporter.normalizeProjectFieldValue(project.name)'],
  ['tools/earth/earth-pressure.html', 'Exporter.normalizeProjectFieldValue(project.name)'],
  ['tools/foundation/foundation-local.html', 'Exporter.normalizeProjectFieldValue(project.name)'],
  ['tools/equipment/equipment-load.html', 'reportProjectMetaValue(proj.name)'],
  ['tools/earth/earth-pressure.html', 'reportProjectMetaValue(proj.name)'],
  ['tools/foundation/foundation-local.html', 'reportProjectMetaValue(proj.name)'],
  ['tools/equipment/equipment-load.html', "name: Exporter.normalizeProjectFieldValue($('projName').value)"],
  ['tools/earth/earth-pressure.html', "name: Exporter.normalizeProjectFieldValue($('projName').value)"],
  ['tools/foundation/foundation-local.html', "name: Exporter.normalizeProjectFieldValue($('projName').value)"],
  ['tools/鋼構/steel-beam.html', "window.ToolReportUI.normalizeProjectFieldValue(document.getElementById('projName')?.value)"],
  ['tools/鋼構/steel-column.html', "window.ToolReportUI.normalizeProjectFieldValue(document.getElementById('projName')?.value)"],
].forEach(([relativePath, needle]) => {
  assertIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} project metadata normalization`);
});
[
  ['tools/equipment/equipment-load.html', "if (data.name != null) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/equipment/equipment-load.html', "if (data.no != null) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/equipment/equipment-load.html', "if (data.designer != null) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
  ['tools/earth/earth-pressure.html', "if (data.name != null) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/earth/earth-pressure.html', "if (data.no != null) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/earth/earth-pressure.html', "if (data.designer != null) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
  ['tools/foundation/foundation-local.html', "if (data.name != null) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/foundation/foundation-local.html', "if (data.no != null) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/foundation/foundation-local.html', "if (data.designer != null) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
].forEach(([relativePath, needle]) => {
  assertIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} project metadata restore clears stale blank values`);
});
[
  ['tools/鋼構/steel-beam.html', "name: (document.getElementById('projName')?.value || '').trim()"],
  ['tools/鋼構/steel-column.html', "name: (document.getElementById('projName')?.value || '').trim()"],
].forEach(([relativePath, needle]) => {
  assertNoIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} should not use raw project metadata trim in report header`);
});
[
  ['tools/equipment/equipment-load.html', "if (data.name) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/equipment/equipment-load.html', "if (data.no) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/equipment/equipment-load.html', "if (data.designer) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
  ['tools/earth/earth-pressure.html', "if (data.name) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/earth/earth-pressure.html', "if (data.no) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/earth/earth-pressure.html', "if (data.designer) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
  ['tools/foundation/foundation-local.html', "if (data.name) $('projName').value = Exporter.normalizeProjectFieldValue(data.name);"],
  ['tools/foundation/foundation-local.html', "if (data.no) $('projNo').value = Exporter.normalizeProjectFieldValue(data.no);"],
  ['tools/foundation/foundation-local.html', "if (data.designer) $('projDesigner').value = Exporter.normalizeProjectFieldValue(data.designer);"],
].forEach(([relativePath, needle]) => {
  assertNoIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} should not keep stale project metadata when saved blank values are restored`);
});
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-export.js', 'local quick export README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/formal-browser-smoke.test.js', 'formal browser smoke test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner README');
assertIncludes(repoDocs.readme, '結構工具箱/index-classic.html', 'classic home README');
assertIncludes(repoDocs.readme, '/toolbox-home', 'new home route README');
assertIncludes(repoDocs.readme, 'TOOL_REPORT_GUIDE.md', 'tool report guide README');
[
  '## 示意圖說規範',
  '## 計算書版面模式',
  '## 計算書內容規範',
  '### 工具邊界拆分',
  '若兩種構造型式使用不同規範表格、不同輸入資料模型、不同計算結果表或不同計算書責任，應拆成不同工具頁',
  '表 2.11「中空式標示物 / 格子式構架」與表 2.15「桁架高塔」應拆為不同頁',
  '名詞、表號、構造名稱應以規範文字為準',
  '不得為了 UI 分類、卡片標題或內部口語自行創造替代名稱',
  '不得讓箭頭頭部壓到文字、力值標籤或結果框',
  '力值標籤應放在獨立 label 區',
  '`data-diagram-role`',
  '### 規範名詞',
  '詳算式與簡易結果是兩種輸出模式',
  '適用性檢核、限制提醒、操作防呆屬於輸入輔助',
  '不列入送審或簽認用列印計算書',
  '規範表格路線應由用途、構造型式、幾何條件與規範適用條件判定',
  'reportNeedles',
  'local-quick-tools.manifest.json',
  '簡易結果與詳算式都要保留精簡限制說明',
  '表格邊界不得混用',
  '表 2.10 實體標示物應只處理開口率',
  '物體高度、斷面尺寸與底緣離地三者不得混用',
  '## 實體標示物表 2.10 工作流',
  '`H_o`：物體本身高度',
  '`M`、`N`：物體平面斷面兩邊長',
  '`b_w`：本次風向受風投影寬度',
  '計算書文字不退回單一路線查表',
  'max[C_f(ν), C_f(M/N)]',
  '採用值來源：規範判定、專案指定、風洞或專案文件',
  '工具內建',
  'preflight-tools.ps1 -Quick',
].forEach(needle => assertIncludes(repoDocs.toolReportGuide, needle, 'tool report guide'));
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.js', 'local quick export boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/formal-browser-smoke.test.js', 'formal browser smoke test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/index-classic.html', 'classic home boundary');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/formal-browser-smoke.test.js', 'formal browser smoke test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner staging group');
assertIncludes(repoDocs.boundaries, '結構工具箱/assets/hy/colors_and_type.css', 'home design tokens boundary');
assertIncludes(repoDocs.staging, '結構工具箱/assets/hy/colors_and_type.css', 'home design tokens staging group');
assertIncludes(repoDocs.homeHtml, '<title>結構工具箱</title>', 'new home title');
assertIncludes(repoDocs.homeHtml, 'assets/home/home.css', 'new home stylesheet');
assertIncludes(repoDocs.homeHtml, 'assets/home/home.js', 'new home script');
assert.equal(repoDocs.homeHtml.includes('不取代原本首頁'), false, 'new home is now the live home (no preserve-original copy)');
assertIncludes(repoDocs.indexClassic, '結構工具箱', 'classic home preserved');
assertIncludes(repoDocs.homeHtml, '力量來源與檢核目的', 'new home logic categories copy');
assertIncludes(repoDocs.homeHtml, 'data-file-href="index-classic.html"', 'new home links to classic menu');
assert.equal(repoDocs.homeHtml.includes('Tool Finder'), false, 'new home removes Tool Finder');
assert.equal(repoDocs.homeHtml.includes('id="toolSearch"'), false, 'new home removes search input');
assert.equal(repoDocs.homeHtml.includes('id="stateFilterPanel"'), false, 'new home removes state filter panel');
assert.equal(repoDocs.homeHtml.includes('id="stateFilters"'), false, 'new home removes state filters');
assertIncludes(repoDocs.homeHtml, 'id="memberSystemPanel"', 'new home member system panel');
[
  '結構分析力量',
  '風力規範外力',
  '地震力規範外力',
  '構件承載力檢核',
  '連接、附掛物與外牆構件',
  '斷面與資料查詢',
  '施工臨設與現場快算',
  'categoryIcons',
  "mark: 'S'",
  "mark: 'W'",
  "mark: 'E'",
  "mark: 'F'",
  "mark: 'B'",
  "mark: 'P'",
  "mark: 'T'",
  'toolStates',
  'stateInfo',
  'appendUniqueMeta',
  'profileItem',
  'memberSystems',
  "memberSystem: 'rc'",
  "memberSystem: 'steel'",
  "label: 'SRC'",
  'HOME_TOOL_UPDATES',
  'tool-updated',
].forEach(needle => assertIncludes(repoDocs.homeJs, needle, 'new home logic category data'));
const homeToolObjectCount = (repoDocs.homeJs.match(/\r?\n\s*{\r?\n\s*title: '/g) || []).length;
assert.ok(homeToolObjectCount >= 35, 'new home governed tool object count');
assert.equal((repoDocs.homeJs.match(/\n\s*state: '/g) || []).length, homeToolObjectCount, 'every new home tool has a governed state');
assert.equal((repoDocs.homeJs.match(/\n\s*output: '/g) || []).length, homeToolObjectCount, 'every new home tool has an output field');
assertIncludes(repoDocs.homeJs, "profileItem('閱讀狀態', currentState.summary)", 'new home readiness profile item');
[
  "formal: { label: '正式核算'",
  "reference: { label: '輔助查詢'",
  "estimate: { label: '初估 / 簡化'",
  "service: { label: '本機服務'",
  "legacy: { label: '過渡工具'",
].forEach(needle => assertIncludes(repoDocs.homeJs, needle, 'new home governed states'));
assertIncludes(repoDocs.homeCss, '.category-icon', 'new home category icon CSS');
assertIncludes(repoDocs.homeCss, '.icon-mark', 'new home icon mark CSS');
assertIncludes(repoDocs.homeCss, '.tool-state', 'new home tool state CSS');
assertIncludes(repoDocs.homeCss, '.tool-updated', 'new home updated date CSS');
assertIncludes(repoDocs.homeCss, '.tool-profile', 'new home tool profile CSS');
assertIncludes(repoDocs.homeCss, '.member-system-panel', 'new home member system CSS');
assertIncludes(repoDocs.homeCss, '.tool-group__grid', 'new home member grouped CSS');
assertIncludes(repoDocs.homeCss, '.tool-chip--system', 'new home member system chip CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--analysis', 'new home logic card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--wind', 'new home wind card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--seismic', 'new home seismic card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card__icon', 'new home tool icon CSS');
assertIncludes(repoDocs.homeCss, '.status-card__badge.warn', 'new home warning status badge CSS');
assertIncludes(repoDocs.homeJs, "node.classList.toggle('status-card--warn', badgeClassName === 'warn')", 'new home warning status card visual state');
assert.equal(repoDocs.homeCss.includes('category-tiles.png'), false, 'new home does not use category tile image');
assert.equal(repoDocs.homeJs.includes('category-art'), false, 'new home does not render category art');
assert.equal(repoDocs.homeJs.includes('renderStateFilters'), false, 'new home does not render state filter panel');
assert.equal(repoDocs.homeJs.includes('tool-boundary'), false, 'new home does not render fit/limit on dashboard');
assert.equal(repoDocs.homeCss.includes('.tool-ribbon'), false, 'new home does not keep tool ribbon CSS');
assert.equal(repoDocs.homeCss.includes('.tool-boundary'), false, 'new home does not keep fit/limit CSS');
assertIncludes(repoDocs.homeTokens, 'Use local/system fonts only', 'home design tokens offline font note');
assert.equal(repoDocs.homeTokens.includes('fonts.googleapis.com'), false, 'home design tokens avoid remote Google Fonts');
assert.equal(repoDocs.homeTokens.includes('fonts.gstatic.com'), false, 'home design tokens avoid remote font binaries');
assert.equal(repoDocs.homeJs.includes("categories: ['seismic', 'analysis'"), false, 'dynamic seismic summary is not mixed into structural analysis');
[
  [repoDocs.steelBeam, 'steel beam transition page', 'beamLegacyPurpose', 'beamLegacyUseConfirm', 'isBeamLegacyUseConfirmed', '鋼梁舊案延續計算記錄'],
  [repoDocs.steelColumn, 'steel column transition page', 'columnLegacyPurpose', 'columnLegacyUseConfirm', 'isColumnLegacyUseConfirmed', '鋼柱舊案延續計算記錄'],
].forEach(([html, label, purposeId, confirmId, confirmFunction, reportTitle]) => {
  assertIncludes(html, 'id="inputStatus"', `${label} inline input status`);
  assertIncludes(html, 'function setInputStatus', `${label} inline input status helper`);
  assertIncludes(html, 'return inputFail(', `${label} validation returns inline failure`);
  assert.equal(html.includes('alert('), false, `${label} uses inline validation instead of alerts`);
  [
    'page-only-report-status',
    '優先閱讀',
    '不會寫入計算書或列印 PDF',
  ].forEach(needle => assertIncludes(html, needle, `${label} page-only readiness copy`));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), `${label} page-only readiness hidden from print`);
  assertIncludes(html, 'renderStatusGridPanel', `${label} readiness shared renderer usage`);
  assertIncludes(html, `id="${purposeId}"`, `${label} existing-project purpose selection`);
  assertIncludes(html, '既有計算記錄延續', `${label} legacy record purpose option`);
  assertIncludes(html, '既有案件復核 / 變更比較', `${label} legacy review purpose option`);
  assertIncludes(html, `id="${confirmId}"`, `${label} existing-project confirmation`);
  assertIncludes(html, `function ${confirmFunction}`, `${label} output confirmation guard`);
  assertIncludes(html, 'LegacyConfirmationScope', `${label} confirmation scope persistence`);
  assertIncludes(html, 'invalidate', `${label} project or purpose change revokes confirmation`);
  assertIncludes(html, '用途確認', `${label} report purpose confirmation provenance`);
  assertIncludes(html, '已確認：僅限既有案件，不作新案正式計算附件', `${label} report purpose confirmation boundary`);
  assertIncludes(html, '>舊案延續計算記錄</button>', `${label} report button classification`);
  assert.ok(/id="btnReport"[^>]*disabled/.test(html), `${label} report output starts disabled`);
  assertIncludes(html, reportTitle, `${label} report title classification`);
  assertIncludes(html, '不得作為新案正式計算附件', `${label} report excludes new-project use`);
  assertIncludes(html, '新案正式計算附件必須由', `${label} report points new projects to formal page`);
  assertIncludes(html, 'id="legacyDirectPrintNotice"', `${label} direct-print boundary notice`);
  assertIncludes(html, 'body > * { display:none !important; }', `${label} direct print hides live calculation page`);
  assertIncludes(html, '#legacyDirectPrintNotice { display:block !important;', `${label} direct print only shows boundary notice`);
});
assertFunctionTemplateExcludes(repoDocs.steelBeam, 'buildBeamReport', 'openReport({', pageOnlyReportStatusNeedles, 'steel beam legacy report excludes page-only readiness wording');
assertFunctionTemplateExcludes(repoDocs.steelColumn, 'buildColumnReport', 'openReport({', pageOnlyReportStatusNeedles, 'steel column legacy report excludes page-only readiness wording');
[
  [repoDocs.windKzt, 'wind kzt reference page', 'kztReportReadiness'],
  [repoDocs.windSpecial, 'wind special reference page', 'specialReportReadiness'],
].forEach(([html, label, targetId]) => {
  [
    'page-only-report-status',
    '優先閱讀',
    '不會寫入計算書或列印 PDF',
    'renderStatusGridPanel',
    `id="${targetId}"`,
  ].forEach(needle => assertIncludes(html, needle, `${label} page-only readiness copy`));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), `${label} page-only readiness hidden from print`);
});
assertIncludes(repoDocs.windKzt, '列印頁面結果', 'wind kzt reference page print wording');
assertIncludes(repoDocs.windSpecial, 'const DEFAULT_BASIS_PROMPT', 'wind special reference page default basis guard');
assertIncludes(repoDocs.windSpecial, 'function normalizeBasisText', 'wind special reference page basis normalization helper');
assertIncludes(repoDocs.forcePicker, 'id="targetStatus"', 'force picker inline target status');
assertIncludes(repoDocs.forcePicker, 'function setTargetStatus', 'force picker inline target status helper');
assert.equal(repoDocs.forcePicker.includes('alert('), false, 'force picker uses inline status instead of alerts');
assertHomeToolCategories('連續梁分析', ['analysis'], 'continuous beam stays in analysis category');
assertHomeToolCategories('struct.dx 解題套件', ['analysis'], 'struct dx stays in analysis category');
assertHomeToolCategories('合成斷面性質', ['reference'], 'composite section stays in reference category');
assertHomeToolCategories('Kzt 地形係數', ['wind'], 'Kzt stays under wind-code category');
assertHomeToolCategories('RC 補強斷面', ['member'], 'RC strengthening stays in member category');
assertHomeToolCategories('連接板檢核', ['attachments'], 'connection plate stays in attachment category');
assertHomeToolCategories('區域風壓 C&C', ['wind'], 'wind C&C stays in wind category');
assertHomeToolCategories('女兒牆風壓', ['wind'], 'parapet wind stays in wind category');
assertHomeToolCategories('實體標示物風力', ['wind'], 'solid object wind stays in wind category');
assertHomeToolCategories('中空式 / 格子式風力', ['wind'], 'frame object wind stays in wind category');
assertHomeToolCategories('桁架高塔風力', ['wind'], 'lattice tower wind stays in wind category');
assertHomeToolCategories('煙囪 / 水塔風力', ['wind'], 'chimney and water tower wind stays in wind category');
assertHomeToolCategories('圍籬牆 / 獨立招牌風力', ['wind'], 'fence sign wind stays in wind category');
assertHomeToolCategories('招牌 / 燈桿組合風力', ['wind'], 'sign pole combo wind stays in wind category');
assert.match(repoDocs.homeJs, /title: '實體標示物風力'[\s\S]*?version: 'V4\.0'/, 'solid object wind new home version');
assert.match(repoDocs.homeJs, /title: '中空式 \/ 格子式風力'[\s\S]*?version: 'V3\.3'/, 'frame object wind new home version');
assert.match(repoDocs.homeJs, /title: '桁架高塔風力'[\s\S]*?version: 'V1\.1'/, 'lattice tower wind home version');
assert.match(repoDocs.homeJs, /title: '煙囪 \/ 水塔風力'[\s\S]*?version: 'V3\.2'/, 'chimney and water tower wind home version');
assert.match(repoDocs.homeJs, /title: '圍籬牆 \/ 獨立招牌風力'[\s\S]*?version: 'V2\.1'/, 'fence sign wind new home version');
assert.match(repoDocs.homeJs, /title: '招牌 \/ 燈桿組合風力'[\s\S]*?version: 'V1\.0'/, 'sign pole wind home version');
assert.equal(repoDocs.homeJs.includes('H/B、M/N 判定 Cf'), false, 'solid object homepage no longer mixes object height and section ratio');
assert.equal(repoDocs.homeJs.includes('斜風向 0.3B 偏心'), false, 'solid object homepage uses wind-width eccentricity wording');
assert.equal(repoDocs.homeSource.includes('風力係數選用導引'), false, 'shape factor guide removed from homepage surfaces');
assert.equal(repoDocs.homeSource.includes('wind-shape-factor'), false, 'shape factor guide route removed from homepage route maps');
assert.equal(repoDocs.vercel.includes('/wind-shape-factor'), false, 'shape factor guide clean route removed from vercel rewrites');
[
  ['/wind-force', 'tools/風力/wind-force.html', '/結構工具箱/tools/風力/wind-force'],
  ['/wind-cc', 'tools/風力/wind-cc.html', '/結構工具箱/tools/風力/wind-cc'],
  ['/wind-open-roof', 'tools/風力/wind-open-roof.html', '/結構工具箱/tools/風力/wind-open-roof'],
  ['/wind-parapet', 'tools/風力/wind-parapet.html', '/結構工具箱/tools/風力/wind-parapet'],
  ['/wind-object-solid', 'tools/風力/wind-object-solid.html', '/結構工具箱/tools/風力/wind-object-solid'],
  ['/wind-object-frame', 'tools/風力/wind-object-frame.html', '/結構工具箱/tools/風力/wind-object-frame'],
  ['/wind-lattice-tower', 'tools/風力/wind-lattice-tower.html', '/結構工具箱/tools/風力/wind-lattice-tower'],
  ['/wind-object-tower', 'tools/風力/wind-object-tower.html', '/結構工具箱/tools/風力/wind-object-tower'],
  ['/wind-fence-sign', 'tools/風力/wind-fence-sign.html', '/結構工具箱/tools/風力/wind-fence-sign'],
  ['/wind-sign-pole', 'tools/風力/wind-sign-pole.html', '/結構工具箱/tools/風力/wind-sign-pole'],
  ['/seismic-force', 'tools/地震力/seismic-force.html', '/結構工具箱/tools/地震力/seismic-force'],
  ['/seismic-appendage', 'tools/地震力/seismic-appendage.html', '/結構工具箱/tools/地震力/seismic-appendage'],
  ['/seismic-misc', 'tools/地震力/seismic-misc.html', '/結構工具箱/tools/地震力/seismic-misc'],
  ['/seismic-dynamic', 'tools/地震力/seismic-dynamic.html', '/結構工具箱/tools/地震力/seismic-dynamic'],
  ['/steel-beam-formal', '../鋼構工具/steel-beam-formal.html', '/鋼構工具/steel-beam-formal'],
  ['/steel-column-formal', '../鋼構工具/steel-column-formal.html', '/鋼構工具/steel-column-formal'],
].forEach(([route, homeTarget, vercelTarget]) => {
  assertIncludes(repoDocs.homeJs, `href: '${route}'`, `${route} clean route card`);
  assertIncludes(repoDocs.homeJs, `'${route}': '${homeTarget}'`, `${route} clean route map`);
  assertIncludes(repoDocs.vercel, `"source": "${route}"`, `${route} vercel route`);
  assertIncludes(repoDocs.vercel, `"destination": "${vercelTarget}"`, `${route} vercel destination`);
});
assertIncludes(repoDocs.homeJs, "'/wind-lattice-tower': 'tools/風力/wind-lattice-tower.html'", 'lattice tower clean route map');
assertIncludes(repoDocs.vercel, '"source": "/wind-lattice-tower"', 'lattice tower vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/tools/風力/wind-lattice-tower"', 'lattice tower vercel destination');
assertIncludes(repoDocs.homeJs, "href: '/wind-fence-sign'", 'fence sign clean route card');
assertIncludes(repoDocs.homeJs, "'/wind-fence-sign': 'tools/風力/wind-fence-sign.html'", 'fence sign clean route map');
assertIncludes(repoDocs.vercel, '"source": "/wind-fence-sign"', 'fence sign vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/tools/風力/wind-fence-sign"', 'fence sign vercel destination');
assertIncludes(repoDocs.homeJs, "'/wind-sign-pole': 'tools/風力/wind-sign-pole.html'", 'sign pole clean route map');
assertIncludes(repoDocs.vercel, '"source": "/wind-sign-pole"', 'sign pole vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/tools/風力/wind-sign-pole"', 'sign pole vercel destination');
assertHomeToolCategories('動力分析摘要', ['seismic'], 'dynamic summary stays in seismic category');
assertHomeToolCategories('附屬構造物地震力', ['seismic'], 'seismic appendage stays in seismic category');
assertHomeToolCategories('雜項工作物地震力', ['seismic'], 'seismic misc stays in seismic category');
assertIncludes(repoDocs.homeJs, "href: '/seismic-appendage'", 'seismic appendage clean route card');
assertIncludes(repoDocs.homeJs, "'/seismic-appendage': 'tools/地震力/seismic-appendage.html'", 'seismic appendage clean route map');
assertIncludes(repoDocs.vercel, '"source": "/seismic-appendage"', 'seismic appendage vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/tools/地震力/seismic-appendage"', 'seismic appendage vercel destination');
assertHomeToolCategories('錨栓檢討工具', ['attachments'], 'anchor stays in attachment category');
assertHomeToolCategories('石材固定構件計算書', ['attachments'], 'stone fixing stays in attachment category');
assertHomeToolCategories('設備局部荷重', ['temporary'], 'equipment load stays in temporary category');
assertHomeToolCategories('覆工板系統計算', ['temporary'], 'deck system stays in temporary category');
assertIncludes(repoDocs.vercel, '"source": "/toolbox-home"', 'new home vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/"', 'new home vercel destination');
[
  '<title>建築物耐震設計 — 反應譜動力分析規範整理 V3.8</title>',
  '總橫力調整檢核',
  'id="designActionPanel"',
  '規範反應譜資料表',
  'id="codeSpectrumPanel"',
  '設計譜值來源',
  '中小度下限譜',
  '最大考量地震輸入譜',
  'baseShearFloorRatio',
  'id="VxAdopted"',
  'id="VyAdopted"',
  'Accel./g',
  'S.buildDynamicDesignActions',
  'S.buildCodeResponseSpectrum',
  '最低縮放倍率',
  '輸入採用總橫力',
  '匯出反應譜 CSV',
  '匯出反應譜 JSON',
  '圖表週期上限',
  '匯出週期上限',
  'spectrumPlotRangeMode',
  'spectrumExportTmax',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'printModelCheckSection',
  '計算書包含動力模型檢核表',
  '動力模型檢核表',
  'function exportResponseSpectrumCsv',
  'function readModelCheckInputs',
].forEach(needle => assertIncludes(repoDocs.seismicDynamic, needle, 'seismic dynamic work output'));
[
  'function buildCodeResponseSpectrum',
  'function calcDynamicStaticReference',
  'function buildDynamicDirectionResult',
  'function buildDynamicDesignAction',
  'function buildDynamicDesignActions'
].forEach(needle => assertIncludes(repoDocs.seismicCore, needle, 'seismic dynamic core output'));
[
  '<title>附屬構造物地震力 V2.5</title>',
  'CASE_SCHEMA_VERSION',
  'seismic-appendage.case.v1',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'escHtml',
  '案件 JSON 回讀',
  'printReportMode',
  'printCalcDetailSection',
  '列印詳算式計算書',
  'btnReportModeDetail',
  'btnReportModeSimple',
  'btnApGroupT1',
  'btnApGroupT2',
  'btnApGroupCustom',
  'inputCheckPanel',
  'appendDiagram',
  'function renderAppendageDiagram',
  'data-diagram-role="fph-arrow-zone"',
  'data-diagram-role="fpv-arrow-zone"',
  'data-diagram-role="force-panel"',
  '簡化線稿示意',
  'function validateAppendageInputs',
  'function setAppendageTypeGroup',
  'includeCalcDetail',
  'simpleCtrlLabel',
  'simpleReportHtml',
  'detailedReportHtml',
  'detail-basis',
  'btnReport',
].forEach(needle => assertIncludes(repoDocs.seismicAppendage, needle, 'seismic appendage case workflow'));
assert.equal(repoDocs.seismicAppendage.includes('id="btnPrint"'), false, 'seismic appendage removes duplicate print action');
[
  '<title>雜項工作物地震力 V3.3</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'seismic-misc.case.v1',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'printReportMode',
  'miscCategory',
  'rebuildMiscCategoryOptions',
  'typeMatchesCategory',
  'renderSvgTitleLines',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'inputCheckPanel',
  'function validateMiscInputs',
  'miscDiagram',
  'function renderMiscDiagram',
  'data-diagram-object="building"',
  'data-diagram-object="nonbuilding"',
  'data-diagram-role="type-title"',
  'data-diagram-role="vh-arrow-zone"',
  'data-diagram-role="vv-arrow-zone"',
  'data-diagram-role="force-panel"',
  'simpleReportHtml',
  'detailedReportHtml',
  'includeDetail',
  'btnReport',
].forEach(needle => assertIncludes(repoDocs.seismicMisc, needle, 'seismic misc case workflow'));
assert.equal(repoDocs.seismicMisc.includes('id="btnPrint"'), false, 'seismic misc removes duplicate print action');
assert.equal(repoDocs.seismicMisc.includes('diagram-caption'), false, 'seismic misc removes diagram caption copy');
[
  '<title>建築物耐風設計 — 實體標示物風力 V4.0</title>',
  'CASE_SCHEMA_VERSION',
  'wind-object-solid.case.v3',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  'card mode-bar print-meta',
  '<div class="main-layout">',
  '<div id="resultPanel">',
  'class="mode-bar__report" id="btnReport"',
  'objectHeight',
  'sectionMajor',
  'sectionMinor',
  'windWidthMode',
  'windWidthCustom',
  'bottomClearance',
  'openingRatio',
  '物體高度 H<sub>o</sub>',
  '斷面大邊 M',
  '斷面小邊 N',
  '物體底緣離地 z<sub>b</sub>',
  'objectHeightDim',
  'windWidthDim',
  'mDim',
  'nDim',
  'nuRatio',
  'mnRatio',
  'cfNuValue',
  'cfMnValue',
  'zrDim',
  'topElevation',
  'groundRoute',
  'tableRatio',
  'cfSource',
  'cfBasis',
  'formError',
  'function updateComputedValues',
  'function showFormError',
  'W.lookupSignCf',
  'groundLimit',
  'atGround',
  'function gustDetailHtml',
  '陣風反應因子依規範式',
  'g<sub>Q</sub> = g<sub>V</sub>',
  'schemaSvg',
  'function drawSolidObjectDiagram',
  '0.3b_w',
  'obliqueEccentricity',
  'function buildSolidObjectReportHtml',
  'window.buildSolidObjectReportHtml',
  'simpleReportHtml',
  'detailedReportHtml',
  'rep-paper',
  'rep-toolbar',
  '規範判定值',
  '專案指定值',
  '風洞試驗 / 專案文件',
  '表 2.10 實體標示物',
  '表 2.10 比對',
  'max[C<sub>f</sub>(ν), C<sub>f</sub>(M/N)]',
  '開口率需小於 30%',
  'H_o 不代入 M/N',
  'M、N 為物體平面斷面兩邊長',
].forEach(needle => assertIncludes(repoDocs.windObjectSolid, needle, 'solid object wind v4.0 workflow'));
assert.equal(repoDocs.windObjectSolid.includes('class="btn-print" id="btnReport"'), false, 'solid object wind keeps report action in shared mode bar');
assert.equal((repoDocs.windObjectSolid.match(/item: 'C_f'/g) || []).length, 1, 'solid object adoption table lists Cf once');
[
  'const arrowX2',
  'marker-end="url(#signWindArrow)"',
].forEach(needle => assertIncludes(repoDocs.windObjectSolid, needle, 'solid object wind diagram keeps force arrows clear'));
assert.equal(repoDocs.windObjectSolid.includes('<option value="flat_panel"'), false, 'solid object wind removes flat sign route from shape options');
assert.equal(repoDocs.windObjectSolid.includes('<option value="box"'), false, 'solid object wind removes box object route from shape options');
assert.equal(repoDocs.windObjectSolid.includes('shapeType'), false, 'solid object wind removes shape-type branching');
assert.equal(repoDocs.windObjectSolid.includes('shapeFactor'), false, 'solid object wind removes non-table shape modifier');
assert.equal(repoDocs.windObjectSolid.includes('C_f,eff'), false, 'solid object wind reports adopted Cf directly');
assert.equal(repoDocs.windObjectSolid.includes('SHAPE_CF_BASIS'), false, 'solid object wind removes legacy shape basis');
assert.equal(repoDocs.windObjectSolid.includes('第二章表 2.13 實體標的物'), false, 'solid object wind does not describe signs as table 2.13 route');
assert.equal(repoDocs.windObjectSolid.includes('第二章表 2.13'), false, 'solid object wind does not use table 2.13 route');
assert.equal(repoDocs.windObjectSolid.includes('第二章表 2.14'), false, 'solid object wind does not use table 2.14 route');
assert.equal(repoDocs.windObjectSolid.includes('專業版'), false, 'solid object wind does not imply a professional version is required');
assert.equal(repoDocs.windObjectSolid.includes('工具內建'), false, 'solid object wind does not use tool-centric Cf basis wording');
assert.equal(repoDocs.windObjectSolid.includes('工具起算'), false, 'solid object wind does not use tool-centric Cf starting-value wording');
assert.equal(repoDocs.windObjectSolid.includes('工具查表'), false, 'solid object wind does not use tool-centric Cf lookup wording');
assert.equal(repoDocs.windObjectSolid.includes('工具建議'), false, 'solid object wind does not use tool-centric Cf recommendation wording');
assert.equal(repoDocs.windObjectSolid.includes('工具預設 C'), false, 'solid object wind does not use tool-centric Cf default wording');
assert.equal(repoDocs.windObjectSolid.includes("alert('請輸入有效"), false, 'solid object wind uses inline validation instead of input alerts');
assert.equal(repoDocs.windObjectSolid.includes('鋼筋混凝土/shared/report.js'), false, 'solid object wind removes shared report collector');
assert.equal(repoDocs.windObjectSolid.includes('../../core/wind-report.js'), false, 'solid object wind removes shared wind report collector');
const solidSimpleReportBlock = repoDocs.windObjectSolid.slice(
  repoDocs.windObjectSolid.indexOf('const simpleReportHtml'),
  repoDocs.windObjectSolid.indexOf('const detailedReportHtml')
);
const solidDetailedReportBlock = repoDocs.windObjectSolid.slice(
  repoDocs.windObjectSolid.indexOf('const detailedReportHtml'),
  repoDocs.windObjectSolid.indexOf('return `<!doctype html>')
);
const solidConditionRowsBlock = repoDocs.windObjectSolid.slice(
  repoDocs.windObjectSolid.indexOf('function buildConditionRows'),
  repoDocs.windObjectSolid.indexOf('function buildSimpleResultRows')
);
const solidReportBuilderBlock = repoDocs.windObjectSolid.slice(
  repoDocs.windObjectSolid.indexOf('function buildSolidObjectReportHtml'),
  repoDocs.windObjectSolid.indexOf('function openSolidObjectReport')
);
assertIncludes(solidSimpleReportBlock, '<h3>控制結果</h3>', 'solid object simple report block');
assertIncludes(solidSimpleReportBlock, '<h3>計算示意圖</h3>', 'solid object simple diagram block');
assert.equal(solidSimpleReportBlock.includes('計算內容'), false, 'solid object simple report omits detailed calculation content');
assert.equal(solidSimpleReportBlock.includes('lastStepsHtml'), false, 'solid object simple report omits formula steps');
assert.equal(solidSimpleReportBlock.includes('陣風反應因子 G'), false, 'solid object simple report omits gust detail formula');
assert.equal(solidSimpleReportBlock.includes('適用性與採用說明'), false, 'solid object simple report omits UI-only applicability notes');
assertIncludes(solidDetailedReportBlock, '<h3>計算內容</h3>', 'solid object detailed report block');
assertIncludes(solidDetailedReportBlock, '${lastStepsHtml}', 'solid object detailed report includes detailed calculation steps');
assert.equal(solidDetailedReportBlock.includes('<h3>控制結果</h3>'), false, 'solid object detailed report omits simple result block');
assert.equal(solidDetailedReportBlock.includes('<h3>設計條件</h3>'), false, 'solid object detailed report omits repeated design condition block');
assert.equal(solidDetailedReportBlock.includes('<h3>設計採用表</h3>'), false, 'solid object detailed report omits repeated adoption table');
assert.equal(solidDetailedReportBlock.includes('適用性與採用提醒'), false, 'solid object detailed report omits UI-only applicability notes');
assert.equal(solidDetailedReportBlock.includes('buildReportTable(conditionRows)'), false, 'solid object detailed report does not repeat simple condition table');
assert.equal(solidDetailedReportBlock.includes('${adoptTable}'), false, 'solid object detailed report does not repeat adoption table markup');
assertIncludes(solidConditionRowsBlock, "['地點 / V'", 'solid object design condition keeps wind location row');
assertIncludes(solidConditionRowsBlock, "['C_f 採用來源'", 'solid object design condition keeps Cf source row');
assert.equal(solidConditionRowsBlock.includes('getProjectInfo'), false, 'solid object design condition omits duplicated project metadata');
assert.equal(solidConditionRowsBlock.includes("['計畫名稱'"), false, 'solid object design condition omits duplicated project name');
assert.equal(solidConditionRowsBlock.includes("['編號'"), false, 'solid object design condition omits duplicated project number');
assert.equal(solidConditionRowsBlock.includes("['設計人'"), false, 'solid object design condition omits duplicated designer');
assert.equal(solidConditionRowsBlock.includes("['工具版本'"), false, 'solid object design condition omits non-design metadata');
assert.equal(solidReportBuilderBlock.includes('shapeBasisPanel'), false, 'solid object report omits UI-only Cf reminder panel');
assert.equal(solidReportBuilderBlock.includes('formError'), false, 'solid object report omits UI-only validation prompt');
[
  '<title>建築物耐風設計 — 中空式 / 格子式風力 V3.3</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'wind-object-frame.case.v2',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'class="mode-bar__report" id="btnReport"',
  'function buildFrameObjectReportHtml',
  'window.buildFrameObjectReportHtml',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'formError',
  'schemaSvg',
  'function drawFrameDiagram',
  'data-diagram-role="force-arrow-zone"',
  'data-diagram-role="force-label-zone"',
  'data-diagram-role="height-arrow-zone"',
  'data-diagram-role="height-label-zone"',
  'data-diagram-role="force-label-mask"',
  '表 2.11',
  'D√q(z)',
  '平邊構材依表 2.11 對應列查 C_f',
  'rep-paper',
  'rep-toolbar',
].forEach(needle => assertIncludes(repoDocs.windObjectFrame, needle, 'frame object wind v3.3 workflow'));
assert.equal(repoDocs.windObjectFrame.includes('透空式'), false, 'frame object wind uses code terminology instead of ad hoc porous wording');
assert.equal(repoDocs.homeJs.includes('透空式 / 格子式風力'), false, 'homepage uses code terminology for frame object wind');
assert.equal(repoDocs.windObjectFrame.includes('鋼筋混凝土/shared/report.js'), false, 'frame object wind removes shared report collector');
assert.equal(repoDocs.windObjectFrame.includes('../../core/wind-report.js'), false, 'frame object wind removes shared wind report collector');
assert.equal(repoDocs.windObjectFrame.includes("alert('請輸入有效"), false, 'frame object wind uses inline validation instead of input alerts');
assert.equal(repoDocs.windObjectFrame.includes('工具內建'), false, 'frame object wind avoids tool-centric wording');
assert.equal(repoDocs.windObjectFrame.includes('class="btn-print"'), false, 'frame object wind removes duplicate lower print action');
assert.equal(repoDocs.windObjectFrame.includes('表 2.15'), false, 'frame object wind no longer mixes table 2.15 route');
assert.equal(repoDocs.windObjectFrame.includes('分段剪力表'), false, 'frame object wind no longer carries lattice segment table');
assert.equal(repoDocs.windObjectFrame.includes('桁架高塔'), false, 'frame object wind no longer presents tower workflow');
assert.equal(repoDocs.windObjectFrame.includes('id="mode"'), false, 'frame object wind removes mixed calculation-type select');
assert.equal(repoDocs.windObjectFrame.includes('lSegments'), false, 'frame object wind removes tower segment input');
[
  '<title>建築物耐風設計 — 桁架高塔風力 V1.1</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'wind-lattice-tower.case.v1',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'class="mode-bar__report" id="btnReport"',
  'function buildLatticeTowerReportHtml',
  'window.buildLatticeTowerReportHtml',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'formError',
  'schemaSvg',
  'function drawLatticeTowerDiagram',
  'data-diagram-role="force-arrow-zone"',
  'data-diagram-role="force-label-zone"',
  'data-diagram-role="height-arrow-zone"',
  'data-diagram-role="height-label-zone"',
  'data-diagram-role="force-label-mask"',
  '表 2.15',
  '方形塔斜風向修正',
  'function buildSegmentReportTable',
  '分段剪力表',
  'rep-paper',
  'rep-toolbar',
].forEach(needle => assertIncludes(repoDocs.windLatticeTower, needle, 'lattice tower wind v1 workflow'));
assert.equal(repoDocs.windLatticeTower.includes('表 2.11'), false, 'lattice tower wind no longer mixes table 2.11 route');
assert.equal(repoDocs.windLatticeTower.includes('D√q(z)'), false, 'lattice tower wind removes frame member classification');
assert.equal(repoDocs.windLatticeTower.includes('id="mode"'), false, 'lattice tower wind removes mixed calculation-type select');
assert.equal(repoDocs.windLatticeTower.includes('function buildFrameObjectReportHtml'), false, 'lattice tower wind has its own report builder');
assert.equal(repoDocs.windLatticeTower.includes('工具內建'), false, 'lattice tower wind avoids tool-centric wording');
const frameSimpleReportBlock = repoDocs.windObjectFrame.slice(
  repoDocs.windObjectFrame.indexOf('const simpleReportHtml'),
  repoDocs.windObjectFrame.indexOf('const detailedReportHtml')
);
const frameDetailedReportBlock = repoDocs.windObjectFrame.slice(
  repoDocs.windObjectFrame.indexOf('const detailedReportHtml'),
  repoDocs.windObjectFrame.indexOf('return `<!doctype html>')
);
const frameConditionRowsBlock = repoDocs.windObjectFrame.slice(
  repoDocs.windObjectFrame.indexOf('function buildConditionRows'),
  repoDocs.windObjectFrame.indexOf('function buildSimpleResultRows')
);
const frameReportBuilderBlock = repoDocs.windObjectFrame.slice(
  repoDocs.windObjectFrame.indexOf('function buildFrameObjectReportHtml'),
  repoDocs.windObjectFrame.indexOf('function openFrameObjectReport')
);
assertIncludes(frameSimpleReportBlock, '<h3>設計條件</h3>', 'frame object simple report keeps design condition block');
assertIncludes(frameSimpleReportBlock, '<h3>計算示意圖</h3>', 'frame object simple report keeps diagram block');
assertIncludes(frameSimpleReportBlock, '<h3>控制結果</h3>', 'frame object simple report keeps control result block');
assert.equal(frameSimpleReportBlock.includes('計算內容'), false, 'frame object simple report omits detailed calculation content');
assert.equal(frameSimpleReportBlock.includes('lastStepsHtml'), false, 'frame object simple report omits formula steps');
assertIncludes(frameDetailedReportBlock, '<h3>計算內容</h3>', 'frame object detailed report includes calculation content');
assertIncludes(frameDetailedReportBlock, '${lastStepsHtml}', 'frame object detailed report includes detailed calculation steps');
assert.equal(frameDetailedReportBlock.includes('<h3>分段剪力表</h3>'), false, 'frame object detailed report omits lattice segment table');
assert.equal(frameDetailedReportBlock.includes('<h3>控制結果</h3>'), false, 'frame object detailed report omits simple result block');
assert.equal(frameDetailedReportBlock.includes('<h3>設計條件</h3>'), false, 'frame object detailed report omits repeated design condition block');
assert.equal(frameConditionRowsBlock.includes('getProjectInfo'), false, 'frame object design condition omits duplicated project metadata');
assert.equal(frameConditionRowsBlock.includes("['計畫名稱'"), false, 'frame object design condition omits duplicated project name');
assert.equal(frameReportBuilderBlock.includes('applicList'), false, 'frame object report omits UI-only applicability list');
assert.equal(frameReportBuilderBlock.includes('formError'), false, 'frame object report omits UI-only validation prompt');
const latticeSimpleReportBlock = repoDocs.windLatticeTower.slice(
  repoDocs.windLatticeTower.indexOf('const simpleReportHtml'),
  repoDocs.windLatticeTower.indexOf('const detailedReportHtml')
);
const latticeDetailedReportBlock = repoDocs.windLatticeTower.slice(
  repoDocs.windLatticeTower.indexOf('const detailedReportHtml'),
  repoDocs.windLatticeTower.indexOf('return `<!doctype html>')
);
const latticeConditionRowsBlock = repoDocs.windLatticeTower.slice(
  repoDocs.windLatticeTower.indexOf('function buildConditionRows'),
  repoDocs.windLatticeTower.indexOf('function buildSimpleResultRows')
);
const latticeReportBuilderBlock = repoDocs.windLatticeTower.slice(
  repoDocs.windLatticeTower.indexOf('function buildLatticeTowerReportHtml'),
  repoDocs.windLatticeTower.indexOf('function openLatticeTowerReport')
);
assertIncludes(latticeSimpleReportBlock, '<h3>設計條件</h3>', 'lattice tower simple report keeps design condition block');
assertIncludes(latticeSimpleReportBlock, '<h3>計算示意圖</h3>', 'lattice tower simple report keeps diagram block');
assertIncludes(latticeSimpleReportBlock, '<h3>控制結果</h3>', 'lattice tower simple report keeps control result block');
assert.equal(latticeSimpleReportBlock.includes('計算內容'), false, 'lattice tower simple report omits detailed calculation content');
assertIncludes(latticeDetailedReportBlock, '<h3>計算內容</h3>', 'lattice tower detailed report includes calculation content');
assertIncludes(latticeDetailedReportBlock, '<h3>分段剪力表</h3>', 'lattice tower detailed report includes segment table');
assert.equal(latticeDetailedReportBlock.includes('<h3>控制結果</h3>'), false, 'lattice tower detailed report omits simple result block');
assert.equal(latticeDetailedReportBlock.includes('<h3>設計條件</h3>'), false, 'lattice tower detailed report omits repeated design condition block');
assert.equal(latticeConditionRowsBlock.includes('getProjectInfo'), false, 'lattice tower design condition omits duplicated project metadata');
assert.equal(latticeReportBuilderBlock.includes('applicList'), false, 'lattice tower report omits UI-only applicability list');
assert.equal(latticeReportBuilderBlock.includes('formError'), false, 'lattice tower report omits UI-only validation prompt');
[
  '<title>建築物耐風設計 — 煙囪 / 水塔風力 V3.2</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'wind-object-tower.case.v2',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'class="mode-bar__report" id="btnReport"',
  'function buildTowerObjectReportHtml',
  'window.buildTowerObjectReportHtml',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'formError',
  'schemaSvg',
  'function drawTowerDiagram',
  'data-diagram-role="force-arrow-zone"',
  'data-diagram-role="force-label-zone"',
  'data-diagram-role="height-arrow-zone"',
  'data-diagram-role="height-label-zone"',
  'data-diagram-role="force-label-mask"',
  'data-diagram-role="top-load-zone"',
  '表 2.12',
  'D√q(z)',
  'function buildSegmentReportTable',
  '分段剪力表',
  'rep-paper',
  'rep-toolbar',
].forEach(needle => assertIncludes(repoDocs.windObjectTower, needle, 'chimney and water tower wind v3.2 workflow'));
assert.equal(repoDocs.windObjectTower.includes('鋼筋混凝土/shared/report.js'), false, 'tower object wind removes shared report collector');
assert.equal(repoDocs.windObjectTower.includes('../../core/wind-report.js'), false, 'tower object wind removes shared wind report collector');
assert.equal(repoDocs.windObjectTower.includes("alert('請輸入有效"), false, 'tower object wind uses inline validation instead of input alerts');
assert.equal(repoDocs.windObjectTower.includes('工具內建'), false, 'tower object wind avoids tool-centric wording');
assert.equal(repoDocs.windObjectTower.includes('class="btn-print"'), false, 'tower object wind removes duplicate lower print action');
assert.equal(repoDocs.windObjectTower.includes('煙囪 / 高塔 / 水塔'), false, 'table 2.12 tool does not label itself as high tower workflow');
assert.equal(repoDocs.windObjectTower.includes('高塔 / 多邊柱'), false, 'table 2.12 tool removes high tower object type');
const towerSimpleReportBlock = repoDocs.windObjectTower.slice(
  repoDocs.windObjectTower.indexOf('const simpleReportHtml'),
  repoDocs.windObjectTower.indexOf('const detailedReportHtml')
);
const towerDetailedReportBlock = repoDocs.windObjectTower.slice(
  repoDocs.windObjectTower.indexOf('const detailedReportHtml'),
  repoDocs.windObjectTower.indexOf('return `<!doctype html>')
);
const towerConditionRowsBlock = repoDocs.windObjectTower.slice(
  repoDocs.windObjectTower.indexOf('function buildConditionRows'),
  repoDocs.windObjectTower.indexOf('function buildSimpleResultRows')
);
const towerReportBuilderBlock = repoDocs.windObjectTower.slice(
  repoDocs.windObjectTower.indexOf('function buildTowerObjectReportHtml'),
  repoDocs.windObjectTower.indexOf('function openTowerObjectReport')
);
assertIncludes(towerSimpleReportBlock, '<h3>設計條件</h3>', 'tower object simple report keeps design condition block');
assertIncludes(towerSimpleReportBlock, '<h3>計算示意圖</h3>', 'tower object simple report keeps diagram block');
assertIncludes(towerSimpleReportBlock, '<h3>控制結果</h3>', 'tower object simple report keeps control result block');
assert.equal(towerSimpleReportBlock.includes('計算內容'), false, 'tower object simple report omits detailed calculation content');
assertIncludes(towerDetailedReportBlock, '<h3>計算內容</h3>', 'tower object detailed report includes calculation content');
assertIncludes(towerDetailedReportBlock, '<h3>分段剪力表</h3>', 'tower object detailed report includes segment table');
assert.equal(towerDetailedReportBlock.includes('<h3>控制結果</h3>'), false, 'tower object detailed report omits simple result block');
assert.equal(towerDetailedReportBlock.includes('<h3>設計條件</h3>'), false, 'tower object detailed report omits repeated design condition block');
assert.equal(towerConditionRowsBlock.includes('getProjectInfo'), false, 'tower object design condition omits duplicated project metadata');
assert.equal(towerReportBuilderBlock.includes('applicList'), false, 'tower object report omits UI-only applicability list');
assert.equal(towerReportBuilderBlock.includes('formError'), false, 'tower object report omits UI-only validation prompt');
[
  '<title>建築物耐風設計 — 圍籬牆 / 獨立招牌風力 V2.1</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'wind-fence-sign.case.v1',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'function buildFenceSignReportHtml',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function drawSchema',
  'data-diagram-object="',
  'data-diagram-role="force-panel"',
  'applic-warn',
  '圍籬牆 / 直接座地',
  '獨立招牌 / 離地架高',
  '專案指定 C<sub>f</sub>',
  '規範表 2.10 判定值',
].forEach(needle => assertIncludes(repoDocs.windFenceSign, needle, 'wind fence sign v2 workflow'));
assert.equal(repoDocs.windFenceSign.includes('覆寫'), false, 'wind fence sign avoids override wording for Cf adoption');
assert.equal(repoDocs.windFenceSign.includes('使用者'), false, 'wind fence sign avoids user-choice wording in report-sensitive flow');
assert.equal(repoDocs.windFenceSign.includes('工具預設'), false, 'wind fence sign avoids tool-centric default wording');
[
  '<title>建築物耐風設計 — 招牌 / 燈桿組合風力 V1.0</title>',
  'TOOL_VERSION',
  'CASE_SCHEMA_VERSION',
  'wind-sign-pole.case.v1',
  '匯出案件 JSON',
  '匯入案件 JSON',
  '恢復預設',
  'caseJsonFile',
  'printReportMode',
  'btnReportModeDetail',
  'btnReportModeSimple',
  '簡易結果',
  'class="mode-bar__report" id="btnReport"',
  'function buildSignPoleReportHtml',
  'window.buildSignPoleReportHtml',
  'function exportCaseJson',
  'function importCaseJsonFile',
  'function applyCaseInputs',
  'function resetCaseDefaults',
  'formError',
  'schemaSvg',
  'function drawSignPoleDiagram',
  'window.drawSignPoleDiagram',
  'function calcSupportSegments',
  'W.lookupSignCf',
  'W.lookupCableCf',
  'W.lookupAngularPrismCf',
  'W.lookupAngularPrismR',
  '表 2.10',
  '表 2.14 繩、竿、管',
  '表 2.13 角柱體',
  '支撐分段風力',
  '面板採表 2.10',
  'data-diagram-role="panel-force-zone"',
  'data-diagram-role="support-load-zone"',
  'data-diagram-role="force-label-zone"',
  'data-diagram-role="height-label-zone"',
  'data-diagram-role="result-panel"',
  'data-diagram-role="component-result-panel"',
  'markerUnits="userSpaceOnUse"',
].forEach(needle => assertIncludes(repoDocs.windSignPole, needle, 'sign pole combo wind v1 workflow'));
assert.equal(repoDocs.windSignPole.includes('工具內建'), false, 'sign pole combo avoids tool-centric wording');
assert.equal(repoDocs.windSignPole.includes('專業版'), false, 'sign pole combo does not imply a professional version is required');
assert.equal(repoDocs.windSignPole.includes('class="btn-print"'), false, 'sign pole combo removes duplicate lower print action');
assert.equal(repoDocs.windSignPole.includes('../../core/wind-report.js'), false, 'sign pole combo removes shared wind report collector');
assert.equal(repoDocs.windSignPole.includes('鋼筋混凝土/shared/report.js'), false, 'sign pole combo removes shared report collector');
assert.equal(repoDocs.windSignPole.includes('表 2.15'), false, 'sign pole combo does not mix lattice tower table route');
assert.equal(repoDocs.windSignPole.includes('表 2.12'), false, 'sign pole combo does not mix chimney and water tower table route');
const signPoleSimpleReportBlock = repoDocs.windSignPole.slice(
  repoDocs.windSignPole.indexOf('const simpleReportHtml'),
  repoDocs.windSignPole.indexOf('const detailedReportHtml')
);
const signPoleDetailedReportBlock = repoDocs.windSignPole.slice(
  repoDocs.windSignPole.indexOf('const detailedReportHtml'),
  repoDocs.windSignPole.indexOf('return `<!doctype html>')
);
const signPoleConditionRowsBlock = repoDocs.windSignPole.slice(
  repoDocs.windSignPole.indexOf('function buildConditionRows'),
  repoDocs.windSignPole.indexOf('function buildSimpleResultRows')
);
const signPoleReportBuilderBlock = repoDocs.windSignPole.slice(
  repoDocs.windSignPole.indexOf('function buildSignPoleReportHtml'),
  repoDocs.windSignPole.indexOf('function openSignPoleReport')
);
assertIncludes(signPoleSimpleReportBlock, '<h3>設計條件</h3>', 'sign pole simple report keeps design condition block');
assertIncludes(signPoleSimpleReportBlock, '<h3>計算示意圖</h3>', 'sign pole simple report keeps diagram block');
assertIncludes(signPoleSimpleReportBlock, '<h3>控制結果</h3>', 'sign pole simple report keeps control result block');
assertIncludes(signPoleSimpleReportBlock, '<h3>元件合計表</h3>', 'sign pole simple report keeps component summary');
assert.equal(signPoleSimpleReportBlock.includes('計算內容'), false, 'sign pole simple report omits detailed calculation content');
assertIncludes(signPoleDetailedReportBlock, '<h3>計算內容</h3>', 'sign pole detailed report includes calculation content');
assertIncludes(signPoleDetailedReportBlock, '<h3>支撐分段風力表</h3>', 'sign pole detailed report includes support segment table');
assertIncludes(signPoleDetailedReportBlock, '<h3>元件合計表</h3>', 'sign pole detailed report keeps component summary');
assert.equal(signPoleDetailedReportBlock.includes('<h3>控制結果</h3>'), false, 'sign pole detailed report omits simple result block');
assert.equal(signPoleDetailedReportBlock.includes('<h3>設計條件</h3>'), false, 'sign pole detailed report omits repeated design condition block');
assert.equal(signPoleConditionRowsBlock.includes('getProjectInfo'), false, 'sign pole design condition omits duplicated project metadata');
assert.equal(signPoleReportBuilderBlock.includes('formError'), false, 'sign pole report omits UI-only validation prompt');
assertIncludes(repoDocs.homeSource, '招牌 / 燈桿組合風力', 'sign pole platform index');
const routes = new Set();

for (const tool of tools) {
  assert.ok(!routes.has(tool.route), `duplicate route: ${tool.route}`);
  routes.add(tool.route);

  const htmlPath = assertFile(tool.html);
  const corePath = assertFile(tool.core);
  const testPath = assertFile(tool.test);
  const goldenPath = assertFile(tool.golden);

  const html = readText(htmlPath);
  const core = readText(corePath);
  const test = readText(testPath);
  const golden = readText(goldenPath);
  const hasJsonImportWorkflow = html.includes('id="btnImportJson"') || html.includes('讀取 JSON');
  if (hasJsonImportWorkflow) {
    assert.equal(tool.jsonRoundTrip, true, `${tool.key} manifest declares JSON round-trip smoke`);
  }
  assert.ok(Array.isArray(tool.reportNeedles) && tool.reportNeedles.length >= 2, `${tool.key} manifest report needles`);

  [
    tool.smoke,
    tool.title,
    `pageVersion: '${tool.pageVersion}'`,
    tool.calcFunction,
    'href="../../core/style.css"',
    'href="../../core/direct-print-boundary.css"',
    `src="../../${manifest.shared.documentStateHelper}`,
    'src="../local-quick-export.js',
    `src="${tool.core.split('/').pop()}`,
    'id="btnCalc"',
    'id="btnJson"',
    tool.key === 'equipment-load' ? 'id="btnImportJson"' : 'id="btnJson"',
    'id="metricGrid"',
    'id="checkList"',
    'id="coreVersion"',
    tool.coreGlobal,
    tool.label,
    '列印計算書',
    '下載 JSON',
    'LocalQuickExport',
    'function downloadResultJson',
    `ReportUI.${manifest.shared.documentStateBuilder}`,
    'ReportUI.getPageReportReadinessLevel(document)',
    '${documentStateReport.html}',
    "const level = !lastResult.overallOk ? 'blocked'",
    `class="${manifest.shared.directPrintBodyClass}"`,
    `class="${manifest.shared.directPrintBoundaryClass}"`,
  ].forEach(needle => assertIncludes(html, needle, `${tool.key} html`));
  manifest.shared.directPrintBoundaryNeedles.forEach(needle => assertIncludes(html, needle, `${tool.key} direct-print boundary`));
  tool.reportNeedles.forEach(needle => assertIncludes(html, needle, `${tool.key} report needle source`));
  [
    'page-only-report-status',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, `${tool.key} page-only readiness copy`));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), `${tool.key} page-only readiness hidden from print`);
  if (['foundation-local', 'earth-pressure', 'equipment-load'].includes(tool.key)) {
    assertPrintHidesSelectors(html, ['.case-actions'], `${tool.key} print-only case helper boundary`);
  }
  if (['foundation-local', 'earth-pressure', 'equipment-load'].includes(tool.key)) {
    [
      'Exporter.isProjectMetaMissing',
      'Exporter.renderStatusGridPanel',
    ].forEach(needle => assertIncludes(html, needle, `${tool.key} readiness helper usage`));
    assertFunctionTemplateExcludes(
      html,
      'openReport',
      'const reportHtml = `',
      pageOnlyReportStatusNeedles,
      `${tool.key} report excludes page-only readiness wording`
    );
  }
  if (tool.key === 'equipment-load') assertIncludes(html, 'id="equipmentReportReadiness"', `${tool.key} page-only readiness target`);
  if (tool.key === 'earth-pressure') assertIncludes(html, 'id="earthReportReadiness"', `${tool.key} page-only readiness target`);
  if (tool.key === 'foundation-local') assertIncludes(html, 'id="foundationReportReadiness"', `${tool.key} page-only readiness target`);
  // 已正式化的工具（report standard）不再以「初估」標示；尚未正式化者仍須保留
  if (!['foundation-local', 'equipment-load'].includes(tool.key)) {
    assertIncludes(html, '初估', `${tool.key} html estimate label`);
  }
  if (!['foundation-local', 'earth-pressure', 'equipment-load'].includes(tool.key)) {
    [
      '工具與責任邊界',
      '輸入格式',
      '計算指紋',
    ].forEach(needle => assertIncludes(html, needle, `${tool.key} report provenance`));
  }
  if (tool.key === 'equipment-load') {
    [
      'id="jsonFile"',
      '讀取 JSON',
      'function extractImportedInput',
      'function applyImportedCase',
      'function importJsonFile',
      'JSON 可用於保存與回讀本頁案例',
      'class="case-actions"',
      'class="output-actions"',
      '④ 計算與輸出',
      '混凝土承壓檢核',
      'RC 穿孔剪力初判',
      '鋼板分散彎曲初判',
      'id="concreteFc"',
      'id="effectiveDepth"',
      'id="steelPlateThickness"',
    ].forEach(needle => assertIncludes(html, needle, `${tool.key} JSON import sample`));
    assert.ok(html.indexOf('id="btnImportJson"') < html.indexOf('class="main-layout equipment-shell"'), `${tool.key} import action stays in top case-management area`);
    assert.ok(html.indexOf('id="btnReset"') < html.indexOf('class="main-layout equipment-shell"'), `${tool.key} reset action stays in top case-management area`);
    assert.ok(html.indexOf('id="btnCalc"') > html.indexOf('③ 材料與厚度檢核'), `${tool.key} calculate action stays after full input basis`);
    assert.ok(html.indexOf('id="btnJson"') > html.indexOf('③ 材料與厚度檢核'), `${tool.key} JSON download stays after full input basis`);
    assert.equal(html.includes('id="btnReport"'), false, `${tool.key} removes duplicate top report action`);
    assert.equal(html.includes('class="card tool-context-card"'), false, `${tool.key} removes context card sample`);
  }
  if (tool.key === 'foundation-local') {
    [
      'class="case-actions"',
      'class="output-actions"',
      'id="btnImportJson"',
      'id="jsonFile"',
      '讀取 JSON',
      '① 規範與安全係數設定',
      '台灣基礎構造設計規範 112',
      'id="designCode"',
      'id="loadCondition"',
      'id="bearingMode"',
      'id="bearingSafetyFactor"',
      'id="qult"',
      'id="basisPreview"',
      'id="basisSummary"',
      'function applyCriteriaPreset',
      'function renderBasisSummary',
      'function extractImportedInput',
      'function applyImportedCase',
      'function importJson',
      'input: gatherInputs()',
      '④ 計算與輸出',
    ].forEach(needle => assertIncludes(html, needle, `${tool.key} action layout`));
    assert.ok(html.indexOf('id="btnReset"') < html.indexOf('class="main-layout foundation-shell"'), `${tool.key} reset action stays in top case-management area`);
    assert.ok(html.indexOf('id="btnCalc"') > html.indexOf('③ 服務載重'), `${tool.key} calculate action stays after full input basis`);
    assert.ok(html.indexOf('id="btnJson"') > html.indexOf('③ 服務載重'), `${tool.key} JSON download stays after full input basis`);
    assert.equal(html.includes('id="btnReport"'), false, `${tool.key} removes duplicate top report action`);
    assertIncludes(
      html,
      'h2,h3{break-after:avoid-page;page-break-after:avoid}.rpt-step{break-inside:avoid-page;page-break-inside:avoid}tr{break-inside:avoid-page;page-break-inside:avoid}thead{display:table-header-group}',
      `${tool.key} report pagination context`,
    );
  }
  if (tool.key === 'earth-pressure') {
    [
      'class="case-actions"',
      'class="output-actions"',
      'id="btnImportJson"',
      'id="jsonFile"',
      '讀取 JSON',
      '① 土壓模型與假設',
      'id="designReference"',
      'id="wallType"',
      '擋土牆型式',
      'id="wallCondition"',
      'id="waterModel"',
      'id="passiveMode"',
      'id="passiveReductionFactor"',
      'id="wallTypeOutputBody"',
      'id="diagramBody"',
      'function syncModeFromWallCondition',
      'function extractImportedInput',
      'function applyImportedCase',
      'function importJsonFile',
      'function renderModelSummary',
      'function renderWallTypeOutput',
      'function buildPressureDiagramSvg',
      'function renderDiagram',
      '牆型工作輸出',
      '計算示意圖',
      '④ 計算與輸出',
      '<h2>設計條件</h2>',
      '<h2>計算內容</h2>',
      'Rankine 水平背填土壓初估',
    ].forEach(needle => assertIncludes(html, needle, `${tool.key} action and report layout`));
    assert.ok(html.indexOf('id="btnImportJson"') < html.indexOf('class="main-layout earth-shell"'), `${tool.key} import action stays in top case-management area`);
    assert.ok(html.indexOf('id="btnReset"') < html.indexOf('class="main-layout earth-shell"'), `${tool.key} reset action stays in top case-management area`);
    assert.ok(html.indexOf('id="btnCalc"') > html.indexOf('③ 簡化穩定參數'), `${tool.key} calculate action stays after full input basis`);
    assert.ok(html.indexOf('id="btnJson"') > html.indexOf('③ 簡化穩定參數'), `${tool.key} JSON download stays after full input basis`);
    assert.equal(html.includes('id="btnReport"'), false, `${tool.key} removes duplicate top report action`);
    assert.equal(html.includes('<h2>工具與責任邊界</h2>'), false, `${tool.key} removes report boundary heading`);
  }

  [
    tool.coreGlobal,
    'CORE_VERSION',
    'inputSchemaVersion',
    'resultSchemaVersion',
    'logicSignature',
    tool.key === 'foundation-local' ? 'getDesignBasis' : 'function provenance',
    'function provenance',
    'function checkItem',
    'function normalizeInput',
    'function validateInput',
    'function calculate',
    'module.exports',
  ].forEach(needle => assertIncludes(core, needle, `${tool.key} core`));

  const api = require(corePath);
  assert.match(api.version, /^0\.\d+\.0$/, `${tool.key} core version`);
  assert.match(api.inputSchemaVersion, /\.input\.v0\.\d+$/, `${tool.key} input schema version`);
  assert.match(api.resultSchemaVersion, /\.result\.v0\.\d+$/, `${tool.key} result schema version`);
  assert.ok(api.logicSignature.startsWith(`${tool.key}-core:v0.`), `${tool.key} logic signature`);
  assert.equal(typeof api.provenance, 'function', `${tool.key} provenance function`);
  const apiProvenance = api.provenance();
  assert.equal(apiProvenance.core, tool.coreGlobal, `${tool.key} provenance core`);
  assert.equal(apiProvenance.version, api.version, `${tool.key} provenance version`);
  assert.equal(apiProvenance.inputSchemaVersion, api.inputSchemaVersion, `${tool.key} provenance schema`);
  assert.equal(apiProvenance.resultSchemaVersion, api.resultSchemaVersion, `${tool.key} provenance result schema`);
  assert.equal(apiProvenance.logicSignature, api.logicSignature, `${tool.key} provenance signature`);
  const goldenCases = require(goldenPath);
  const result = api.calculate(goldenCases[0].input);
  assert.equal(result.resultSchemaVersion, api.resultSchemaVersion, `${tool.key} result schema`);
  assert.deepEqual(result.provenance, apiProvenance, `${tool.key} result provenance`);
  assert.ok(result.summary, `${tool.key} result summary`);
  assert.equal(typeof result.summary.status, 'string', `${tool.key} summary status`);
  assert.equal(typeof result.summary.headline, 'string', `${tool.key} summary headline`);
  assert.ok(Array.isArray(result.summary.primaryMetrics), `${tool.key} summary primary metrics`);
  assert.ok(result.summary.primaryMetrics.length >= 3, `${tool.key} summary primary metrics count`);
  assert.ok(Array.isArray(result.checks), `${tool.key} result checks`);
  assert.ok(result.checks.length >= 3, `${tool.key} checks count`);
  for (const check of result.checks) {
    assert.equal(typeof check.key, 'string', `${tool.key} check key`);
    assert.equal(typeof check.label, 'string', `${tool.key} check label`);
    assert.ok(['pass', 'fail', 'not_applicable'].includes(check.status), `${tool.key} check status`);
    assert.ok(Object.prototype.hasOwnProperty.call(check, 'passed'), `${tool.key} check passed`);
    assert.equal(typeof check.detail, 'string', `${tool.key} check detail`);
  }

  [
    'goldenCases',
    'approx',
    tool.coreGlobal,
    'validateInput',
    'calculate',
  ].forEach(needle => assertIncludes(test, needle, `${tool.key} regression test`));

  [
    'expected',
    'input',
  ].forEach(needle => assertIncludes(golden, needle, `${tool.key} golden cases`));

  assertIncludes(repoDocs.homeSource, tool.indexHref, `${tool.key} platform index`);
  assertIncludes(repoDocs.homeSource, tool.label, `${tool.key} platform index label`);
  assertIncludes(repoDocs.readme, tool.label, `${tool.key} README`);
  assertIncludes(repoDocs.boundaries, tool.boundaryPath, `${tool.key} tool boundary`);
  assertIncludes(repoDocs.staging, tool.html, `${tool.key} staging group`);
  assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
  assertIncludes(repoDocs.vercel, `"source": "${tool.route}"`, `${tool.key} vercel route`);
  const cleanDestination = `/結構工具箱/${tool.html.replace(/\.html$/i, '')}`;
  assert.ok(
    repoDocs.vercel.includes(`"destination": "/結構工具箱/${tool.html}"`) ||
      repoDocs.vercel.includes(`"destination": "${cleanDestination}"`),
    `${tool.key} vercel destination missing: /結構工具箱/${tool.html} or ${cleanDestination}`
  );
  delete require.cache[require.resolve(testPath)];
  require(testPath);
}

console.log(`local quick tools contract OK (${tools.length} tools)`);
