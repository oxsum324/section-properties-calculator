const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

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

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:none\\s*!important`);
    assert.ok(pattern.test(text), `${label} print hides ${selector}`);
  });
}

function loadWindowScript(filePath) {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(readText(filePath), context, { filename: filePath });
  return context.window;
}

function renderReportHtml(filePath, project = {}, overrides = {}) {
  let html = '';
  const context = {
    window: {
      open() {
        return {
          document: {
            open() {},
            write(nextHtml) { html += String(nextHtml || ''); },
            close() {}
          },
          focus() {}
        };
      }
    },
    console,
    Date,
  };
  vm.createContext(context);
  vm.runInContext(readText(filePath), context, { filename: filePath });
  assert.equal(typeof context.openReport, 'function', `${filePath} openReport exposed`);
  context.openReport({
    title: 'QA 計算書',
    outputSource: { tool: 'QA 正式工具', version: 'V9.9' },
    project,
    inputs: [
      { group: '頁面操作說明', items: [
        { label: '輸入模式', value: '舊制' },
        { label: '換算對照', value: '1 tf = 9.80665 kN' },
        { label: '流程顯示', value: '核心計算單位' },
      ] },
      { group: '輸入資料', items: [{ label: 'A', value: '1', unit: '' }, { label: 'B', value: '2', unit: 'tf' }] },
    ],
    checks: [{
      group: '檢核結果',
      items: [
        { label: 'A', formula: 'A', sub: '1', value: '1', unit: '', ok: true },
        { label: 'B', formula: 'B / A', sub: '2 / 1', value: '2.00', unit: '', ok: true, note: '控制檢核' },
      ],
    }],
    summaryFacts: [{ label: '摘要卡說明', value: 'B / A', tone: 'ok' }],
    summary: { ok: true, text: 'OK' },
    steps: [{ group: '1. 計算代入', body: 'B / A = 2 / 1 = 2.00' }],
    symbols: [{ sym: 'A', desc: '符號附註' }],
    notes: ['本報告樣本用於驗證正式輸出文字抽檢。'],
    ...overrides,
  });
  return html;
}

function reportHtmlText(html) {
  return String(html || '')
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

const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '輸入模式',
  '計算書模式',
  '換算對照',
  '流程顯示',
  '報表模式',
  '輸出設定',
];

function assertReportHtmlText(html, label, requiredNeedles) {
  const text = reportHtmlText(html);
  assert.ok(text.length > 160, `${label} should produce substantial visible report text`);
  requiredNeedles.forEach(needle => assertIncludes(text, needle, `${label} visible report text`));
  pageOnlyReportStatusNeedles.forEach(needle => assertNoIncludes(text, needle, `${label} visible report text`));
  return text;
}

const manifestPath = assertFile('tools/formal-tools.manifest.json');
const manifestText = readText(manifestPath);
const manifest = JSON.parse(manifestText);
const tools = manifest.tools;
const traceCatalogPath = assertFile(manifest.shared.traceabilityCatalog);
const traceCatalog = JSON.parse(readText(traceCatalogPath));
const directPrintBoundaryPath = assertFile(manifest.shared.directPrintBoundaryStylesheet);
const directPrintBoundary = readText(directPrintBoundaryPath);

assert.equal(manifest.version, '0.1.0', 'formal tools manifest version');
assert.equal(manifest.family, 'formal-tools', 'formal tools manifest family');
assert.ok(Array.isArray(tools), 'formal tools manifest tools');
assert.equal(tools.length, 14, 'formal tools manifest tool count');
assert.equal(manifest.shared.directPrintBodyClass, 'formal-tool-output-page', 'formal direct-print body class');
assert.equal(manifest.shared.directPrintBoundaryClass, 'formal-direct-print-boundary', 'formal direct-print boundary class');
assert.ok(manifest.shared.directPrintBoundaryNeedles.length >= 3, 'formal direct-print boundary wording');
assertIncludes(
  directPrintBoundary,
  'body.formal-tool-output-page > :not(.formal-direct-print-boundary)',
  'formal direct-print CSS hides every work-page child'
);
assertIncludes(
  directPrintBoundary,
  'body.formal-tool-output-page > .formal-direct-print-boundary',
  'formal direct-print CSS renders only the boundary notice'
);
assertNoIncludes(directPrintBoundary, 'content: "DRAFT"', 'formal direct-print boundary is not a draft report');
assert.deepEqual(
  manifest.requiredRoutes,
  tools.map(tool => tool.route),
  'formal tools requiredRoutes must match tool order'
);
const traceRequiredToolKeys = [
  'wind-force',
  'wind-cc',
  'wind-open-roof',
  'wind-parapet',
  'wind-object-solid',
  'wind-object-frame',
  'wind-lattice-tower',
  'wind-object-tower',
  'wind-fence-sign',
  'wind-sign-pole',
  'seismic-force',
  'seismic-appendage',
  'seismic-misc',
  'seismic-dynamic',
];
assert.deepEqual(
  tools.filter(tool => tool.reportTraceRequired).map(tool => tool.key),
  traceRequiredToolKeys,
  'formal trace metadata coverage'
);

const repoDocs = {
  readme: readText(repoFile('README.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  reportGuide: readText(repoFile('TOOL_REPORT_GUIDE.md')),
  coreStyle: readText(toolboxFile('core/style.css')),
  vercel: readText(repoFile('vercel.json')),
  homeJs: readText(toolboxFile('assets/home/home.js')),
  smoke: readText(toolboxFile('tools/formal-browser-smoke.test.js')),
  runner: readText(toolboxFile(manifest.shared.runner)),
  maturity: readText(toolboxFile(manifest.shared.maturityMatrix)),
  goldenHarvest: readText(toolboxFile(manifest.shared.goldenHarvest))
};

const sharedReportRuntime = loadWindowScript(toolboxFile('core/ui/report.js'));
assert.ok(sharedReportRuntime.ToolReportUI, 'shared report runtime helper loaded');
assertIncludes(repoDocs.coreStyle, '.case-actions, .case-status, .case-file-actions, .project-storage-bar', 'shared core print boundary hides page-only case helper UI');
assert.equal(sharedReportRuntime.ToolReportUI, sharedReportRuntime.SteelFormalUI, 'shared report runtime aliases ToolReportUI and SteelFormalUI');
assert.equal(
  sharedReportRuntime.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'], (id) => ({ value: id === 'projName' ? '未填' : 'QA' })),
  true,
  'shared report runtime helper treats placeholder project name as missing'
);
assert.equal(sharedReportRuntime.ToolReportUI.normalizeProjectFieldValue('未填'), '', 'shared report runtime helper clears placeholder project text');
assert(sharedReportRuntime.ToolReportUI.calculationBookPageOnlyLabels.includes('輸入模式'), 'shared report runtime publishes calculation-book page-only labels');
assert.deepEqual(
  JSON.parse(JSON.stringify(sharedReportRuntime.ToolReportUI.getCalculationBookInputGroups([
    { group: '頁面操作說明', items: [{ label: '輸入模式', value: '舊制' }] },
    { group: '採用輸入', items: [{ label: 'Fy', value: '2500' }] },
  ]))),
  [{ group: '採用輸入', items: [{ label: 'Fy', value: '2500' }] }],
  'shared report runtime removes page-only input groups while retaining adopted engineering inputs',
);
assert.equal(
  sharedReportRuntime.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'], () => ({ value: 'QA' })),
  false,
  'shared report runtime helper accepts complete project metadata'
);
const sharedReportHtml = renderReportHtml(toolboxFile('core/ui/report.js'), { name: '未填', no: 'FORMAL-VERIFY-001', designer: 'Codex QA' });
const sharedReportText = assertReportHtmlText(sharedReportHtml, 'shared formal report generator', [
  'QA 計算書',
  '計畫名稱',
  '計畫編號',
  'FORMAL-VERIFY-001',
  '設計人員',
  'Codex QA',
  '產出工具',
  'QA 正式工具',
  '工具版本',
  'v9.9',
  '輸出時間',
  '計算指紋',
  '輸入資料',
  '檢核結果',
  '計算過程明細',
  '檢核結論',
  'OK',
]);
assert(sharedReportText.indexOf('輸入資料') < sharedReportText.indexOf('檢核結果'), 'shared report places adopted inputs before checks');
assert(sharedReportText.indexOf('檢核結果') < sharedReportText.indexOf('計算過程明細'), 'shared report places checks before calculation steps');
assert(sharedReportText.indexOf('計算過程明細') < sharedReportText.indexOf('檢核結論'), 'shared report places conclusion after calculation content');
for (const forbidden of ['頁面操作說明', '摘要卡說明', '符號附註', '本報告樣本用於驗證正式輸出文字抽檢。']) {
  assertNoIncludes(sharedReportText, forbidden, 'shared report excludes page-only/explanatory content');
}
assertNoIncludes(sharedReportHtml, '未填', 'shared report generator should scrub placeholder project metadata at render time');
assertNoIncludes(sharedReportText, '未填', 'shared report generator visible text should scrub placeholder project metadata at render time');
assertIncludes(sharedReportHtml, '計畫名稱</b>—', 'shared report generator should fallback blank project name to dash');
assertIncludes(sharedReportHtml, 'FORMAL-VERIFY-001', 'shared report generator should keep project number');
assertIncludes(sharedReportHtml, 'Codex QA', 'shared report generator should keep designer');
assert.match(sharedReportHtml, /計算指紋<\/b>CF-[0-9A-F]{16}/, 'shared report generator should include a stable calculation fingerprint');
const reportFingerprintOf = (html) => html.match(/計算指紋<\/b>(CF-[0-9A-F]{16})/)?.[1] || '';
const matchingCalculationHtml = renderReportHtml(toolboxFile('core/ui/report.js'), { name: '另一個案件', no: 'FORMAL-VERIFY-002', designer: 'Reviewer' });
const changedCalculationHtml = renderReportHtml(toolboxFile('core/ui/report.js'), { name: '未填', no: 'FORMAL-VERIFY-001', designer: 'Codex QA' }, {
  inputs: [{ group: '輸入資料', items: [{ label: 'A', value: '9', unit: '' }, { label: 'B', value: '2', unit: 'tf' }] }],
});
assert.equal(reportFingerprintOf(sharedReportHtml), reportFingerprintOf(matchingCalculationHtml), 'report fingerprint ignores project metadata for the same calculation');
assert.notEqual(reportFingerprintOf(sharedReportHtml), reportFingerprintOf(changedCalculationHtml), 'report fingerprint changes when calculation input changes');
const sharedCompatPanel = { className: '', innerHTML: '' };
sharedReportRuntime.ToolReportUI.renderStatusGridPanel({
  target: sharedCompatPanel,
  containerClassName: 'report-readiness page-only-report-status',
  level: 'review',
  eyebrow: '頁面輔助｜產報前檢查｜優先閱讀',
  title: '分析已完成，但產報前建議優先閱讀下列項目。',
  badge: '優先複核',
  items: [
    ['控制值', '風向 X'],
    { label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF' }
  ],
  priorityItems: ['先補計畫名稱'],
  note: '此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。'
});
assert.equal(sharedCompatPanel.className, 'report-readiness page-only-report-status review', 'shared report runtime helper supports shared readiness container class');
assertIncludes(sharedCompatPanel.innerHTML, '先補計畫名稱', 'shared report runtime helper priority items');
assertIncludes(sharedCompatPanel.innerHTML, '控制值', 'shared report runtime helper tuple item label');
assertIncludes(sharedCompatPanel.innerHTML, '風向 X', 'shared report runtime helper tuple item value');
const sharedReportTrace = sharedReportRuntime.ToolReportUI.buildReportTrace({
  title: 'QA 計算書',
  outputSource: { tool: 'QA 正式工具', version: 'V9.9' },
  snapshot: { control: 1.25, inputs: { A: 1, B: 2 } },
  generatedAt: new Date('2026-07-12T12:34:56'),
});
assert.deepEqual(
  JSON.parse(JSON.stringify(sharedReportTrace.sourceTrace)),
  { tool: 'QA 正式工具', version: 'v9.9' },
  'shared report trace source'
);
assert.equal(sharedReportTrace.generatedAt, '2026/07/12 12:34:56', 'shared report trace timestamp');
assert.match(sharedReportTrace.calculationFingerprint, /^CF-[0-9A-F]{16}$/, 'shared report trace fingerprint');
[
  ['4.0', 'v4.0'],
  ['V4.0', 'v4.0'],
  ['wind-force.v1', 'v1']
].forEach(([sourceVersion, expectedVersion]) => {
  const trace = sharedReportRuntime.ToolReportUI.buildReportTrace({
    title: 'QA 計算書',
    outputSource: { tool: 'QA 正式工具', version: sourceVersion },
    snapshot: { control: 1.25, inputs: { A: 1, B: 2 } },
    generatedAt: new Date('2026-07-12T12:34:56'),
  });
  assert.equal(trace.sourceTrace.version, expectedVersion, `shared report trace normalizes ${sourceVersion}`);
  assert.equal(trace.calculationFingerprint, sharedReportTrace.calculationFingerprint, `shared report fingerprint excludes display version ${sourceVersion}`);
});

const windReportRuntimePath = toolboxFile('core/wind-report.js');
const originalWindReport = global.WindReport;
delete require.cache[require.resolve(windReportRuntimePath)];
require(windReportRuntimePath);
assert.ok(global.WindReport, 'wind report runtime helper loaded');
assert.equal(
  global.WindReport.isProjectMetaMissing({ name: '未填', no: 'A-1', designer: 'QA' }),
  true,
  'wind report runtime helper treats placeholder project name as missing'
);
assert.equal(global.WindReport.normalizeProjectFieldValue('未填'), '', 'wind report runtime helper clears placeholder project text');
const windCompatPanel = { className: '', innerHTML: '' };
global.WindReport.renderStatusGridPanel({
  container: windCompatPanel,
  containerClassName: 'report-readiness page-only-report-status',
  panelLabel: '頁面輔助｜產報前檢查｜優先閱讀',
  model: {
    level: 'review',
    title: '分析已完成，但產報前建議優先閱讀下列項目。',
    badge: '優先複核',
    items: [
      ['控制值', '風向 X'],
      { label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF' }
    ]
  },
  priorityItems: ['先補計畫名稱'],
  note: '此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。'
});
assert.equal(windCompatPanel.className, 'report-readiness page-only-report-status review', 'wind report runtime helper supports shared readiness container class');
assertIncludes(windCompatPanel.innerHTML, '先補計畫名稱', 'wind report runtime helper priority items');
assertIncludes(windCompatPanel.innerHTML, '控制值', 'wind report runtime helper tuple item label');
assertIncludes(windCompatPanel.innerHTML, '風向 X', 'wind report runtime helper tuple item value');
if (originalWindReport === undefined) {
  delete global.WindReport;
} else {
  global.WindReport = originalWindReport;
}

[
  'tools/風力/wind-force.html',
  'tools/風力/wind-cc.html',
  'tools/風力/wind-open-roof.html',
  'tools/風力/wind-parapet.html',
].forEach(relativePath => {
  const html = readText(toolboxFile(relativePath));
  assertIncludes(html, '../../core/ui/report.js', `${relativePath} loads shared trace helper`);
  assertNoIncludes(html, '../../../鋼筋混凝土/shared/report.js', `${relativePath} does not load unrelated RC report helper`);
});
['產出工具', '工具版本', '輸出時間', '計算指紋', 'buildWindReportTrace'].forEach(needle => {
  assertIncludes(readText(toolboxFile('core/wind-report.js')), needle, `wind report trace ${needle}`);
});
const windReportSource = readText(toolboxFile('core/wind-report.js'));
assertIncludes(windReportSource, 'function isCalculationBookOutputControl', 'wind report identifies page-only output controls');
assertIncludes(windReportSource, 'global.ToolReportUI.getCalculationBookInputGroups(groups)', 'wind report reuses the shared calculation-book input filter');
['openWindForceReport', 'openWindGenericReport'].forEach(functionName => {
  const start = windReportSource.indexOf(`function ${functionName}()`);
  const end = windReportSource.indexOf('\n  function ', start + 1);
  const body = windReportSource.slice(start, end === -1 ? undefined : end);
  assert.ok(start >= 0, `${functionName} exists`);
  assert.ok(
    body.indexOf('const calcResult =') < body.indexOf('const w = openWindReportWindow();'),
    `${functionName} validates inputs before opening the report popup`
  );
});
[
  'tools/地震力/seismic-force.html',
  'tools/地震力/seismic-appendage.html',
  'tools/地震力/seismic-misc.html',
  'tools/地震力/seismic-dynamic.html',
].forEach(relativePath => {
  const html = readText(toolboxFile(relativePath));
  ['window.ToolReportUI.buildReportTrace', 'reportTrace.sourceTrace.tool', 'reportTrace.sourceTrace.version', '產出工具', '工具版本', '輸出時間', '計算指紋'].forEach(needle => {
    assertIncludes(html, needle, `${relativePath} formal trace ${needle}`);
  });
});

[
  ['tools/風力/wind-force.html', "window.WindReport.normalizeProjectFieldValue(document.getElementById('projName').value)"],
  ['tools/風力/wind-force.html', 'window.WindReport.normalizeProjectFieldValue(project.name)'],
  ['tools/風力/wind-cc.html', "window.WindReport.normalizeProjectFieldValue(document.getElementById('projName').value)"],
  ['tools/風力/wind-cc.html', 'window.WindReport.normalizeProjectFieldValue(project.name)'],
  ['tools/風力/wind-open-roof.html', "window.WindReport.normalizeProjectFieldValue(document.getElementById('projName').value)"],
  ['tools/風力/wind-open-roof.html', 'window.WindReport.normalizeProjectFieldValue(project.name)'],
  ['tools/風力/wind-parapet.html', "window.WindReport.normalizeProjectFieldValue(document.getElementById('projName').value)"],
  ['tools/風力/wind-parapet.html', 'window.WindReport.normalizeProjectFieldValue(project.name)'],
  ['tools/風力/wind-object-frame.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/風力/wind-object-tower.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/風力/wind-lattice-tower.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/風力/wind-sign-pole.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/風力/wind-fence-sign.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/風力/wind-object-solid.html', "window.ToolReportUI.normalizeProjectFieldValue(project.name)"],
  ['tools/地震力/seismic-force.html', "window.ToolReportUI.normalizeProjectFieldValue(saved.name)"],
  ['tools/地震力/seismic-appendage.html', "window.ToolReportUI.normalizeProjectFieldValue(saved.name)"],
  ['tools/地震力/seismic-appendage.html', 'const PROJECT_CASE_VALUE_FIELDS = new Set([\'projName\', \'projNo\', \'projDesigner\'])'],
  ['tools/地震力/seismic-appendage.html', 'values[id] = PROJECT_CASE_VALUE_FIELDS.has(id)'],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneCity != null) document.getElementById('zoneCity').value = proj.zoneCity;"],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneDist != null) document.getElementById('zoneDist').value = proj.zoneDist;"],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneDist != null) document.getElementById('zoneDist').dispatchEvent(new Event('change'));"],
  ['tools/地震力/seismic-appendage.html', "if (proj.siteClass != null) document.getElementById('siteClass').value = proj.siteClass;"],
  ['tools/地震力/seismic-dynamic.html', "window.ToolReportUI.normalizeProjectFieldValue(saved.name)"],
  ['tools/地震力/seismic-dynamic.html', 'const PROJECT_CASE_VALUE_FIELDS = new Set([\'projName\', \'projNo\', \'projDesigner\'])'],
  ['tools/地震力/seismic-dynamic.html', 'values[id] = PROJECT_CASE_VALUE_FIELDS.has(id)'],
  ['tools/地震力/seismic-dynamic.html', 'project: syncProjectMeta(lastDynamicResult.result.project)'],
  ['tools/地震力/seismic-dynamic.html', 'project: syncProjectMeta(result.project)'],
  ['tools/formal-tools.manifest.json', '"extraExportButtons": ['],
  ['tools/formal-tools.manifest.json', '"btnExportSpectrumJson"'],
  ['tools/formal-tools.manifest.json', '"btnExportModelCheckJson"'],
  ['tools/地震力/seismic-misc.html', "window.ToolReportUI.normalizeProjectFieldValue(saved.name)"],
].forEach(([relativePath, needle]) => {
  assertIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} project metadata normalization`);
});
[
  ['tools/地震力/seismic-dynamic.html', "if (proj.name != null) document.getElementById('projName').value = window.ToolReportUI.normalizeProjectFieldValue(proj.name);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.no != null) document.getElementById('projNo').value = window.ToolReportUI.normalizeProjectFieldValue(proj.no);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.designer != null) document.getElementById('projDesigner').value = window.ToolReportUI.normalizeProjectFieldValue(proj.designer);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.zoneCity != null) {"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.zoneDist != null) {"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.siteInputMode != null) document.getElementById('siteInputMode').value = proj.siteInputMode;"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.siteClass != null) document.getElementById('siteClass').value = proj.siteClass;"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.importanceKey != null) document.getElementById('impClass').value = proj.importanceKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.x?.systemKey != null) document.getElementById('sysX').value = saved.x.systemKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.y?.systemKey != null) document.getElementById('sysY').value = saved.y.systemKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.name != null) document.getElementById('projName').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.name);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.no != null) document.getElementById('projNo').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.no);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.designer != null) document.getElementById('projDesigner').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.designer);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.software != null) document.getElementById('software').value = saved.project.software;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.remark != null) document.getElementById('remark').value = saved.project.remark;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.siteInputMode != null) document.getElementById('siteInputMode').value = saved.project.siteInputMode;"],
  ['tools/地震力/seismic-dynamic.html', "if (savedRange.plotMode != null) document.getElementById('spectrumPlotRangeMode').value = savedRange.plotMode;"],
].forEach(([relativePath, needle]) => {
  assertIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} project metadata restore clears stale blank values`);
});
[
  ['tools/地震力/seismic-dynamic.html', "if (proj.name) document.getElementById('projName').value = window.ToolReportUI.normalizeProjectFieldValue(proj.name);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.no) document.getElementById('projNo').value = window.ToolReportUI.normalizeProjectFieldValue(proj.no);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.designer) document.getElementById('projDesigner').value = window.ToolReportUI.normalizeProjectFieldValue(proj.designer);"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.zoneCity) {"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.zoneDist) {"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.siteInputMode) document.getElementById('siteInputMode').value = proj.siteInputMode;"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.siteClass) document.getElementById('siteClass').value = proj.siteClass;"],
  ['tools/地震力/seismic-dynamic.html', "if (proj.importanceKey) document.getElementById('impClass').value = proj.importanceKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.x?.systemKey) document.getElementById('sysX').value = saved.x.systemKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.y?.systemKey) document.getElementById('sysY').value = saved.y.systemKey;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.name) document.getElementById('projName').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.name);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.no) document.getElementById('projNo').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.no);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.designer) document.getElementById('projDesigner').value = window.ToolReportUI.normalizeProjectFieldValue(saved.project.designer);"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.software) document.getElementById('software').value = saved.project.software;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.remark) document.getElementById('remark').value = saved.project.remark;"],
  ['tools/地震力/seismic-dynamic.html', "if (saved.project?.siteInputMode) document.getElementById('siteInputMode').value = saved.project.siteInputMode;"],
  ['tools/地震力/seismic-dynamic.html', "if (savedRange.plotMode) document.getElementById('spectrumPlotRangeMode').value = savedRange.plotMode;"],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneCity) document.getElementById('zoneCity').value = proj.zoneCity;"],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneDist) document.getElementById('zoneDist').value = proj.zoneDist;"],
  ['tools/地震力/seismic-appendage.html', "if (proj.zoneDist) document.getElementById('zoneDist').dispatchEvent(new Event('change'));"],
  ['tools/地震力/seismic-appendage.html', "if (proj.siteClass) document.getElementById('siteClass').value = proj.siteClass;"],
].forEach(([relativePath, needle]) => {
  assertNoIncludes(readText(toolboxFile(relativePath)), needle, `${relativePath} should not retain stale project metadata when restored blank values are present`);
});

[
  'tools/formal-tools.manifest.json',
  'formalTools = formalManifest.tools',
  'requiredFormalRoutes = formalManifest.requiredRoutes',
  'popupReportModes',
  'reportExpectations',
  'reportDisclosureNeedles',
  'diagramChecks',
  'roleBoxesNonZero',
  'rolesInsideDiagram',
  'goldenCaseExpression',
  'assertGoldenCaseState',
  'reportPopupOpenExpression',
  'waitForNewPageTarget',
  'popupReportCaptureState',
  'assertPopupReportState',
  'assertPlaceholderPopupReportState',
  'assertPlaceholderExportState',
  'assertExtraExportState',
  'assertExtraPlaceholderExportState',
  'const popupModes = Array.isArray(tool.popupReportModes) && tool.popupReportModes.length > 0',
  "tool.reportMode ? ['detail']",
  "projectState === 'placeholder'",
  'placeholderPopupReportStates',
  "exportCaptureExpression(tool, 'placeholder')",
  "exportCaptureExpression(tool, 'complete', extraExport.id)",
  'tool.extraExportButtons || []',
  'settlePage',
  'waitForImportStatus',
  'Page.javascriptDialogOpening',
  'inlineValidationExpression',
  'assertInlineValidationState',
  "viewport.key === 'desktop'",
  'desktop interaction'
].forEach(needle => assertIncludes(repoDocs.smoke, needle, 'formal browser smoke manifest contract'));

[
  'formal tools manifest runner OK',
  'manifest.shared.contractTest',
  'manifest.shared.browserSmokeTest',
  'manifest.shared.maturityMatrix',
  'manifest.shared.traceabilityCatalog',
  'manifest.shared.traceabilityContract',
  'runNode'
].forEach(needle => assertIncludes(repoDocs.runner, needle, 'formal tools runner'));

[
  'tool maturity matrix',
  'formal-tools',
  'local-quick-tools',
  '--write',
  '--check',
  'tool-maturity-matrix.json',
  'tool-maturity-matrix.md',
  'goldenCaseRegression',
  'jsonRoundTrip',
  'referenceTraceability'
].forEach(needle => assertIncludes(repoDocs.maturity, needle, 'tool maturity matrix generator'));

[
  'formal-golden-harvest',
  '--tool=<key>',
  '--inputs64=<base64-json>',
  'startStaticServer',
  'selectorValues',
  'resultItems',
  'metricValues',
  'dialogs',
  'bodyTextPreview'
].forEach(needle => assertIncludes(repoDocs.goldenHarvest, needle, 'formal golden harvest helper'));

[
  '結構工具箱/tools/formal-tools.manifest.json',
  '結構工具箱/tools/formal-traceability.contract.test.js',
  '結構工具箱/tools/formal-tools.run.js',
  '結構工具箱/tools/formal-tools.contract.test.js',
  '結構工具箱/tools/tool-maturity-matrix.js',
  '工具成熟度矩陣'
].forEach(needle => {
  assertIncludes(repoDocs.readme, needle, 'README formal tools governance');
  assertIncludes(repoDocs.boundaries, needle, 'TOOL_BOUNDARIES formal tools governance');
  assertIncludes(repoDocs.staging, needle, 'STAGING_GROUPS formal tools governance');
});
assertIncludes(repoDocs.reportGuide, 'formal-tools.manifest.json', 'TOOL_REPORT_GUIDE formal manifest');
assertIncludes(repoDocs.reportGuide, 'formal-traceability.catalog.json', 'TOOL_REPORT_GUIDE formal traceability catalog');
assertIncludes(repoDocs.reportGuide, 'formal-traceability.contract.test.js', 'TOOL_REPORT_GUIDE formal traceability contract');
assertIncludes(repoDocs.reportGuide, '條文語意追蹤', 'TOOL_REPORT_GUIDE traceability section');
assertIncludes(repoDocs.reportGuide, 'reportDisclosureNeedles', 'TOOL_REPORT_GUIDE report disclosure needles');
assertIncludes(repoDocs.reportGuide, '建築物耐風設計規範及解說', 'TOOL_REPORT_GUIDE wind report disclosure');
assertIncludes(repoDocs.reportGuide, '建築物耐震設計規範及解說', 'TOOL_REPORT_GUIDE seismic report disclosure');
assertIncludes(repoDocs.reportGuide, '工具成熟度矩陣', 'TOOL_REPORT_GUIDE maturity matrix');

const routeSet = new Set();
const keySet = new Set();
const reportForbidden = manifest.reportForbiddenNeedles || [];
const reportPageOnlyForbidden = manifest.reportPageOnlyForbiddenNeedles || [];
const reportDisclosureNeedles = manifest.reportDisclosureNeedles || {};
const traceTools = Array.isArray(traceCatalog.tools) ? traceCatalog.tools : [];
const traceByKey = new Map(traceTools.map(tool => [tool.key, tool]));

assert.equal(traceCatalog.version, '0.1.0', 'formal traceability catalog version');
assert.equal(traceCatalog.family, 'formal-traceability', 'formal traceability catalog family');
assert.equal(manifest.shared.traceabilityContract, 'tools/formal-traceability.contract.test.js', 'formal traceability contract path');
assertFile(manifest.shared.traceabilityContract);
assert.ok(reportPageOnlyForbidden.length >= 8, 'formal report page-only forbidden needles');
[
  '產報前檢查',
  '附件適用狀態',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '不會寫入計算書'
].forEach(needle => assertIncludes(manifestText, needle, 'formal report page-only boundary manifest'));
assert.deepEqual(
  traceTools.map(tool => tool.key),
  tools.map(tool => tool.key),
  'formal traceability catalog must match formal tool order'
);
const popupAuditTools = tools.filter(tool => Array.isArray(tool.popupReportModes) && tool.popupReportModes.length > 0);
assert.ok(popupAuditTools.length >= 2, 'formal tools manifest popup report audit coverage');
assert.ok(popupAuditTools.some(tool => tool.discipline === 'wind'), 'formal tools manifest popup report audit should cover wind');
assert.ok(popupAuditTools.some(tool => tool.discipline === 'seismic'), 'formal tools manifest popup report audit should cover seismic');
popupAuditTools.forEach(tool => {
  assert.ok(tool.popupReportModes.includes('simple'), `${tool.key} popup report audit should cover simple mode`);
  assert.ok(tool.popupReportModes.includes('detail'), `${tool.key} popup report audit should cover detail mode`);
});

for (const tool of tools) {
  assert.ok(tool.key, 'formal tool key');
  assert.ok(tool.label, `${tool.key} label`);
  assert.ok(tool.route && tool.route.startsWith('/'), `${tool.key} clean route`);
  assert.ok(tool.html && tool.html.endsWith('.html'), `${tool.key} html`);
  assert.ok(!keySet.has(tool.key), `duplicate formal key: ${tool.key}`);
  assert.ok(!routeSet.has(tool.route), `duplicate formal route: ${tool.route}`);
  keySet.add(tool.key);
  routeSet.add(tool.route);

  const htmlPath = assertFile(tool.html);
  const html = readText(htmlPath);
  assertIncludes(html, tool.titleNeedle, `${tool.key} title needle in HTML`);
  assertIncludes(html, tool.familyNeedle, `${tool.key} family needle in HTML`);
  assertIncludes(html, tool.calcButton, `${tool.key} calc button in HTML`);
  if (tool.reportButton) assertIncludes(html, tool.reportButton, `${tool.key} report button in HTML`);
  if (tool.reportButtonSelector) assertIncludes(html, 'btn-print', `${tool.key} print selector fallback in HTML`);
  assertIncludes(
    html,
    `../../${manifest.shared.directPrintBoundaryStylesheet}`,
    `${tool.key} loads shared direct-print boundary`
  );
  assertIncludes(
    html,
    `<body class="${manifest.shared.directPrintBodyClass}">`,
    `${tool.key} blocks direct work-page print`
  );
  assertIncludes(
    html,
    `class="${manifest.shared.directPrintBoundaryClass}"`,
    `${tool.key} has direct-print boundary notice`
  );
  for (const needle of manifest.shared.directPrintBoundaryNeedles) {
    assertIncludes(html, needle, `${tool.key} direct-print guidance`);
  }
  if (tool.exportButton) assertIncludes(html, tool.exportButton, `${tool.key} export button in HTML`);
  if (tool.importButton) assertIncludes(html, tool.importButton, `${tool.key} import button in HTML`);
  if (tool.reportMode) {
    const controls = tool.reportModeControls || {};
    if (controls.simpleButton || controls.detailButton) {
      assertIncludes(html, controls.simpleButton, `${tool.key} report simple mode button`);
      assertIncludes(html, controls.detailButton, `${tool.key} report detail mode button`);
    } else if (controls.selectId || controls.simpleValue || controls.detailValue) {
      assertIncludes(html, `id="${controls.selectId || 'reportMode'}"`, `${tool.key} report mode select`);
      assertIncludes(html, controls.simpleValue || 'summary', `${tool.key} report simple mode option`);
      assertIncludes(html, controls.detailValue || 'detailed', `${tool.key} report detail mode option`);
    } else {
      assertIncludes(html, 'btnReportModeDetail', `${tool.key} report detail mode`);
      assertIncludes(html, 'btnReportModeSimple', `${tool.key} report simple mode`);
    }
  }
  for (const role of tool.diagramRoleNeedles || []) {
    assertIncludes(html, `data-diagram-role="${role}"`, `${tool.key} diagram role`);
  }

  for (const needle of reportForbidden) {
    if (['undefined', 'NaN'].includes(needle)) continue;
    assertNoIncludes(html, needle, `${tool.key} source wording`);
  }
  const disclosureNeedles = reportDisclosureNeedles[tool.discipline] || [];
  assert.ok(disclosureNeedles.length >= 2, `${tool.key} report disclosure needles`);
  for (const needle of disclosureNeedles) {
    assertIncludes(html, needle, `${tool.key} source report disclosure`);
  }

  assertIncludes(repoDocs.homeJs, `href: '${tool.route}'`, `${tool.key} home clean route card`);
  assertIncludes(repoDocs.homeJs, `'${tool.route}': '${tool.html}'`, `${tool.key} home clean route map`);
  assertIncludes(repoDocs.vercel, `"source": "${tool.route}"`, `${tool.key} vercel route`);
  const cleanDestination = `/結構工具箱/${tool.html.replace(/\.html$/i, '')}`;
  assert.ok(
    repoDocs.vercel.includes(`"destination": "/結構工具箱/${tool.html}"`) ||
      repoDocs.vercel.includes(`"destination": "${cleanDestination}"`),
    `${tool.key} vercel destination missing: /結構工具箱/${tool.html} or ${cleanDestination}`
  );

  const caps = tool.capabilities || {};
  assert.equal(caps.cleanRoute, true, `${tool.key} cleanRoute capability`);
  assert.equal(caps.report, true, `${tool.key} report capability`);
  assert.equal(caps.browserSmoke, true, `${tool.key} browser smoke capability`);
  assert.equal(caps.reportRegression, true, `${tool.key} report regression capability`);
  assert.equal(caps.coreRegression, true, `${tool.key} core regression capability`);
  assert.equal(Boolean(caps.reportModes), Boolean(tool.reportMode), `${tool.key} report mode capability`);
  assert.equal(Boolean(caps.jsonExport), Boolean(tool.exportButton), `${tool.key} JSON export capability`);
  assert.equal(Boolean(caps.jsonImport), Boolean(tool.importButton), `${tool.key} JSON import capability`);
  assert.equal(Boolean(caps.diagramGeometry), Boolean(tool.diagramChecks), `${tool.key} diagram geometry capability`);

  if (tool.reportMode) {
    assert.ok(tool.reportExpectations?.simple, `${tool.key} simple report expectations`);
    assert.ok(tool.reportExpectations?.detail, `${tool.key} detail report expectations`);
    assert.ok(tool.reportExpectations.simple.mustInclude.length >= 3, `${tool.key} simple report mustInclude`);
    assert.ok(tool.reportExpectations.detail.mustInclude.length >= 2, `${tool.key} detail report mustInclude`);
    assert.ok(tool.reportExpectations.simple.mustExclude.length >= 2, `${tool.key} simple report mustExclude`);
    assert.ok(tool.reportExpectations.detail.mustExclude.length >= 2, `${tool.key} detail report mustExclude`);
  }

  const traceEntry = traceByKey.get(tool.key);
  assert.ok(traceEntry, `${tool.key} traceability entry`);
  assert.equal(typeof traceEntry.scope, 'string', `${tool.key} traceability scope`);
  assert.ok(traceEntry.scope.length > 0, `${tool.key} traceability scope populated`);
  assert.ok(Array.isArray(traceEntry.traces) && traceEntry.traces.length > 0, `${tool.key} traceability traces`);
  const seenTraceIds = new Set();
  const goldenIds = new Set((tool.goldenCases || []).map(goldenCase => goldenCase.id));
  for (const [traceIndex, trace] of traceEntry.traces.entries()) {
    assert.equal(typeof trace.id, 'string', `${tool.key} trace ${traceIndex} id`);
    assert.ok(trace.id.trim().length > 0, `${tool.key} trace ${traceIndex} id populated`);
    assert.ok(!seenTraceIds.has(trace.id), `${tool.key} trace ${traceIndex} id unique`);
    seenTraceIds.add(trace.id);
    assert.equal(typeof trace.clause, 'string', `${tool.key} trace ${traceIndex} clause`);
    assert.ok(/規範|表|圖|式|章|節/.test(trace.clause), `${tool.key} trace ${traceIndex} clause names a formal source`);
    assert.equal(typeof trace.purpose, 'string', `${tool.key} trace ${traceIndex} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'goldenCases', 'manualReview']) {
      assert.ok(Array.isArray(trace[field]) && trace[field].length > 0, `${tool.key} trace ${traceIndex} ${field}`);
      for (const item of trace[field]) {
        assert.equal(typeof item, 'string', `${tool.key} trace ${traceIndex} ${field} string`);
        assert.ok(item.trim().length > 0, `${tool.key} trace ${traceIndex} ${field} populated`);
        for (const forbidden of reportForbidden) {
          if (['undefined', 'NaN'].includes(forbidden)) continue;
          assertNoIncludes(item, forbidden, `${tool.key} trace ${traceIndex} wording`);
        }
      }
    }
    for (const goldenId of trace.goldenCases) {
      assert.ok(goldenIds.has(goldenId), `${tool.key} trace ${traceIndex} golden case exists: ${goldenId}`);
    }
  }

  for (const goldenCase of tool.goldenCases || []) {
    assert.ok(goldenCase.id, `${tool.key} golden case id`);
    assert.ok(goldenCase.description, `${tool.key} golden case description`);
    assert.ok(goldenCase.inputs && typeof goldenCase.inputs === 'object', `${tool.key} golden case inputs`);
    assert.ok(
      Object.keys(goldenCase.expectedSelectors || {}).length > 0 ||
        (goldenCase.expectedTextNeedles || []).length > 0 ||
        Object.keys(goldenCase.expectedMetrics || {}).length > 0,
      `${tool.key} golden case expected outputs`
    );
    for (const [metricPath, expectation] of Object.entries(goldenCase.expectedMetrics || {})) {
      assert.ok(metricPath.includes('.'), `${tool.key} ${goldenCase.id} metric path`);
      if (typeof expectation === 'number') continue;
      assert.equal(typeof expectation, 'object', `${tool.key} ${goldenCase.id} metric expectation object`);
      assert.equal(typeof expectation.value, 'number', `${tool.key} ${goldenCase.id} metric value`);
      if (expectation.tolerance != null) {
        assert.equal(typeof expectation.tolerance, 'number', `${tool.key} ${goldenCase.id} metric tolerance`);
      }
    }
  }
}

const goldenToolKeys = tools.filter(tool => (tool.goldenCases || []).length > 0).map(tool => tool.key);
assert.deepEqual(
  goldenToolKeys,
  ['wind-force', 'wind-cc', 'wind-open-roof', 'wind-parapet', 'wind-object-solid', 'wind-object-frame', 'wind-lattice-tower', 'wind-object-tower', 'wind-fence-sign', 'wind-sign-pole', 'seismic-force', 'seismic-appendage', 'seismic-misc', 'seismic-dynamic'],
  'formal golden case pilot tool set'
);

for (const tool of tools) {
  const html = readText(toolboxFile(tool.html));
  assertNoIncludes(html, 'alert(', `${tool.key} user feedback must be inline, not blocking alerts`);
}

for (const inlineValidationPage of [
  'tools/風力/wind-force.html',
  'tools/風力/wind-cc.html',
  'tools/風力/wind-open-roof.html',
  'tools/風力/wind-parapet.html',
  'tools/風力/wind-fence-sign.html'
]) {
  const html = readText(toolboxFile(inlineValidationPage));
  assertIncludes(html, 'id="inputStatus"', `${inlineValidationPage} inline input status element`);
  assertIncludes(html, 'aria-live="polite"', `${inlineValidationPage} inline input status live region`);
  assertIncludes(html, 'function setInputStatus', `${inlineValidationPage} inline input status helper`);
  assertIncludes(html, 'return false;', `${inlineValidationPage} invalid calc return`);
  assertIncludes(html, 'if (calc() === false) return;', `${inlineValidationPage} export guard`);
  assertNoIncludes(html, 'alert(', `${inlineValidationPage} input validation must be inline`);
}

{
  const html = readText(toolboxFile('tools/風力/wind-force.html'));
  [
    'id="windForceReportReadiness"',
    'function buildWindForceReportReadinessModel',
    'function renderWindForceReportReadiness',
    'function markWindForceReportInputsChanged',
    'window.WindReport.isProjectMetaMissing()',
    'window.WindReport.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF',
    '計算書模式'
  ].forEach(needle => assertIncludes(html, needle, 'wind-force page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-force page-only report readiness hidden from print');

  const windReport = readText(toolboxFile('core/wind-report.js'));
  assertIncludes(windReport, 'function isProjectMetaMissing', 'wind report shared project meta helper');
  assertIncludes(windReport, 'function renderStatusGridPanel', 'wind report shared readiness renderer');
  assertIncludes(windReport, 'const calcResult = typeof global.calc', 'wind report recalculates before report generation');
  assertIncludes(windReport, 'if (calcResult === false)', 'wind report blocks invalid calc output');
  [
    'windForceReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF',
    '計算書模式'
  ].forEach(needle => assertNoIncludes(windReport, needle, 'wind report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-cc.html'));
  [
    'id="windCcReportReadiness"',
    'function buildWindCcReportReadinessModel',
    'function renderWindCcReportReadiness',
    'function markWindCcReportInputsChanged',
    'window.WindReport.isProjectMetaMissing()',
    'window.WindReport.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-cc page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-cc page-only report readiness hidden from print');

  const windReport = readText(toolboxFile('core/wind-report.js'));
  [
    'windCcReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(windReport, needle, 'wind report excludes wind-cc page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-open-roof.html'));
  [
    'id="openRoofReportReadiness"',
    'function buildOpenRoofReportReadinessModel',
    'function renderOpenRoofReportReadiness',
    'function markOpenRoofReportInputsChanged',
    'window.WindReport.isProjectMetaMissing()',
    'window.WindReport.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-open-roof page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-open-roof page-only report readiness hidden from print');

  const windReport = readText(toolboxFile('core/wind-report.js'));
  [
    'openRoofReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(windReport, needle, 'wind report excludes wind-open-roof page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-parapet.html'));
  [
    'id="parapetReportReadiness"',
    'function buildParapetReportReadinessModel',
    'function renderParapetReportReadiness',
    'function markParapetReportInputsChanged',
    'window.WindReport.isProjectMetaMissing()',
    'window.WindReport.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-parapet page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-parapet page-only report readiness hidden from print');

  const windReport = readText(toolboxFile('core/wind-report.js'));
  [
    'parapetReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(windReport, needle, 'wind report excludes wind-parapet page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-object-solid.html'));
  [
    '../../core/ui/report.js',
    'value="" placeholder="計畫名稱"',
    'id="solidReportReadiness"',
    "window.ToolReportUI.normalizeProjectFieldValue(project.name)",
    'function buildSolidReportReadinessModel',
    'function renderSolidReportReadiness',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-object-solid page-only report readiness'));
  assertNoIncludes(html, 'value="未填" placeholder="計畫名稱"', 'wind-object-solid project name should start blank');
  assertNoIncludes(html, "project: { name: '未填', no: '', designer: '' }", 'wind-object-solid default case project metadata should start blank');
  assertNoIncludes(html, 'function normalizeProjectFieldValue(value)', 'wind-object-solid should reuse shared project metadata normalization helper');
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-object-solid page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildSolidObjectReportHtml()');
  const reportEnd = html.indexOf('function openSolidObjectReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-object-solid report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'solidReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-object-solid report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-object-frame.html'));
  [
    '../../core/ui/report.js',
    'id="frameObjectReportReadiness"',
    'function buildFrameObjectReportReadinessModel',
    'function renderFrameObjectReportReadiness',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-object-frame page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-object-frame page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildFrameObjectReportHtml()');
  const reportEnd = html.indexOf('function openFrameObjectReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-object-frame report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'frameObjectReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-object-frame report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-object-tower.html'));
  [
    '../../core/ui/report.js',
    'id="towerObjectReportReadiness"',
    'function buildTowerObjectReportReadinessModel',
    'function renderTowerObjectReportReadiness',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-object-tower page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-object-tower page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildTowerObjectReportHtml()');
  const reportEnd = html.indexOf('function openTowerObjectReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-object-tower report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'towerObjectReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-object-tower report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-lattice-tower.html'));
  [
    '../../core/ui/report.js',
    'id="latticeTowerReportReadiness"',
    'function buildLatticeTowerReportReadinessModel',
    'function renderLatticeTowerReportReadiness',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-lattice-tower page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-lattice-tower page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildLatticeTowerReportHtml()');
  const reportEnd = html.indexOf('function openLatticeTowerReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-lattice-tower report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'latticeTowerReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-lattice-tower report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-fence-sign.html'));
  [
    '../../core/ui/report.js',
    'id="fenceSignReportReadiness"',
    'function buildFenceSignReportReadinessModel',
    'function renderFenceSignReportReadiness',
    'function markFenceSignReportInputsChanged',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-fence-sign page-only report readiness'));
  assertIncludes(html, 'function setInputStatus', 'wind-fence-sign inline input status helper');
  assertIncludes(html, "if (!lastResult || fenceSignReportInputsChanged)", 'wind-fence-sign stale report recalculation guard');
  assertIncludes(html, "const Kzt = val('Kzt');", 'wind-fence-sign preserves raw Kzt for validation');
  assertIncludes(html, "const phi = val('phi');", 'wind-fence-sign preserves raw phi for validation');
  assertNoIncludes(html, "const Kzt = val('Kzt') || 1.0;", 'wind-fence-sign avoids defaulting invalid Kzt to 1.0');
  assertNoIncludes(html, "const phi = val('phi') || 1.0;", 'wind-fence-sign avoids defaulting invalid phi to 1.0');
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-fence-sign page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildFenceSignReportHtml()');
  const reportEnd = html.indexOf('function openFenceSignReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-fence-sign report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'fenceSignReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-fence-sign report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/風力/wind-sign-pole.html'));
  [
    '../../core/ui/report.js',
    'id="signPoleReportReadiness"',
    'function buildSignPoleReportReadinessModel',
    'function renderSignPoleReportReadiness',
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'wind-sign-pole page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'wind-sign-pole page-only report readiness hidden from print');
  const reportStart = html.indexOf('function buildSignPoleReportHtml()');
  const reportEnd = html.indexOf('function openSignPoleReport()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'wind-sign-pole report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'signPoleReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'wind-sign-pole report excludes page-only readiness wording'));
}

for (const [relativePath, reportFunction, openFunction] of [
  ['tools/風力/wind-object-solid.html', 'buildSolidObjectReportHtml', 'openSolidObjectReport'],
  ['tools/風力/wind-object-frame.html', 'buildFrameObjectReportHtml', 'openFrameObjectReport'],
  ['tools/風力/wind-lattice-tower.html', 'buildLatticeTowerReportHtml', 'openLatticeTowerReport'],
  ['tools/風力/wind-object-tower.html', 'buildTowerObjectReportHtml', 'openTowerObjectReport'],
  ['tools/風力/wind-fence-sign.html', 'buildFenceSignReportHtml', 'openFenceSignReport'],
  ['tools/風力/wind-sign-pole.html', 'buildSignPoleReportHtml', 'openSignPoleReport']
]) {
  const html = readText(toolboxFile(relativePath));
  const reportStart = html.indexOf(`function ${reportFunction}()`);
  const reportEnd = html.indexOf(`function ${openFunction}()`, reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, `${relativePath} trace report body isolated`);
  const reportBody = html.slice(reportStart, reportEnd);
  ['window.ToolReportUI.buildReportTrace', '產出工具', '工具版本', '輸出時間', '計算指紋'].forEach(needle => {
    assertIncludes(reportBody, needle, `${relativePath} formal trace ${needle}`);
  });
}

{
  const html = readText(toolboxFile('tools/地震力/seismic-force.html'));
  assertIncludes(html, 'id="inputStatus"', 'seismic-force inline input status element');
  assertIncludes(html, 'id="apStatus"', 'seismic-force appendage input status element');
  assertIncludes(html, 'id="vStatus"', 'seismic-force vertical input status element');
  assertIncludes(html, 'id="miscStatus"', 'seismic-force misc input status element');
  assertIncludes(html, 'function setInputStatus', 'seismic-force inline input status helper');
  assertIncludes(html, 'if (calc() === false) return;', 'seismic-force export guard');
  assertIncludes(html, "document.getElementById('resultPanel').style.display === 'none' || window._lastSeismicReportStale", 'seismic-force stale report recalculation guard');
  [
    '../../core/ui/report.js',
    'id="seismicReportReadiness"',
    'function buildSeismicReportReadinessModel',
    'function renderSeismicReportReadiness',
    'function markSeismicReportInputsChanged',
    "window.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'])",
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'seismic-force page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'seismic-force page-only report readiness hidden from print');
  assertIncludes(html, 'class="rep-source-tool"', 'seismic-force trace source has dedicated print cell');
  assertIncludes(html, '.rep-meta--traceable .rep-source-tool { grid-column:span 2; }', 'seismic-force trace source spans two print columns');
  const reportStart = html.indexOf('function openSeismicReport()');
  const reportEnd = html.indexOf("document.getElementById('btnExportCase')", reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'seismic-force report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'seismicReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'seismic-force report excludes page-only readiness wording'));
  [
    "alert('請完整填入有效的震區參數",
    'alert(floorMsg)',
    "alert('請先執行主結構地震力計算",
    "alert('請填入自訂 ap 與 Rp')",
    "alert('請先在左側②面板填入有效的震區參數",
    "alert('請輸入有效的工作物重量與高度')"
  ].forEach(needle => assertNoIncludes(html, needle, 'seismic-force input validation alert'));
}

{
  const html = readText(toolboxFile('tools/地震力/seismic-appendage.html'));
  assertIncludes(html, 'id="inputStatus"', 'seismic-appendage inline input status element');
  assertIncludes(html, 'function setInputStatus', 'seismic-appendage inline input status helper');
  [
    '../../core/ui/report.js',
    'id="appendageReportReadiness"',
    'function buildAppendageReportReadinessModel',
    'function renderAppendageReportReadiness',
    'function markAppendageReportInputsChanged',
    "window.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'])",
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'seismic-appendage page-only report readiness'));
  assertIncludes(html, "if (!lastAppendResult || appendageReportInputsChanged || document.getElementById('resultPanel')?.style.display === 'none')", 'seismic-appendage stale report recalculation guard');
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'seismic-appendage page-only report readiness hidden from print');
  const reportStart = html.indexOf('function openAppendageReport()');
  const reportEnd = html.indexOf('(function initPageScopeCard()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'seismic-appendage report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'appendageReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'seismic-appendage report excludes page-only readiness wording'));
}

{
  const html = readText(toolboxFile('tools/地震力/seismic-dynamic.html'));
  assertIncludes(html, 'id="inputStatus"', 'seismic-dynamic inline input status element');
  assertIncludes(html, 'function setInputStatus', 'seismic-dynamic inline input status helper');
  assertIncludes(html, 'function showResetCaseConfirmation', 'seismic-dynamic inline reset confirmation helper');
  assertIncludes(html, 'function confirmResetCaseDefaults', 'seismic-dynamic reset confirmation apply helper');
  assertIncludes(html, 'function cancelResetCaseDefaults', 'seismic-dynamic reset confirmation cancel helper');
  assertIncludes(html, 'if (calcDynamic() === false) return null;', 'seismic-dynamic case payload guard');
  assertIncludes(html, "if (!lastDynamicResult || dynamicReportInputsChanged || document.getElementById('resultPanel')?.style.display === 'none')", 'seismic-dynamic stale report recalculation guard');
  [
    '../../core/ui/report.js',
    'id="dynamicReportReadiness"',
    'function buildDynamicReportReadinessModel',
    'function renderDynamicReportReadiness',
    'function markDynamicReportInputsChanged',
    "window.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'])",
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'seismic-dynamic page-only report readiness'));
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'seismic-dynamic page-only report readiness hidden from print');
  const reportStart = html.indexOf('function openDynamicReport()');
  const reportEnd = html.indexOf('function exportResponseSpectrumCsv()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'seismic-dynamic report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'dynamicReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF',
    '計算書模式'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'seismic-dynamic report excludes page-only readiness wording'));
  assertNoIncludes(html, 'confirm(', 'seismic-dynamic reset confirmation must be inline');
  [
    "alert('這不是本頁支援的動力分析案件 JSON。')",
    'alert(`案件 JSON 讀取失敗：${err.message}`)',
    "alert('請完整填入有效的規範反應譜參數。')",
    "alert('請完整填入有效的工址條件與動力分析結果。')"
  ].forEach(needle => assertNoIncludes(html, needle, 'seismic-dynamic input validation alert'));
}

{
  const html = readText(toolboxFile('tools/地震力/seismic-misc.html'));
  assertIncludes(html, 'id="inputStatus"', 'seismic-misc inline input status element');
  assertIncludes(html, 'function setInputStatus', 'seismic-misc inline input status helper');
  assertIncludes(html, 'return false;', 'seismic-misc blocking validation return');
  assertNoIncludes(html, 'alert(blockingMessages', 'seismic-misc blocking validation alert');
  [
    '../../core/ui/report.js',
    'id="miscReportReadiness"',
    'function buildMiscReportReadinessModel',
    'function renderMiscReportReadiness',
    'function markMiscReportInputsChanged',
    "window.ToolReportUI.hasBlankFieldValues(['projName', 'projNo', 'projDesigner'])",
    'window.ToolReportUI.renderStatusGridPanel({',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertIncludes(html, needle, 'seismic-misc page-only report readiness'));
  assertIncludes(html, "if (!lastMiscResult || miscReportInputsChanged || document.getElementById('resultPanel')?.style.display === 'none')", 'seismic-misc stale report recalculation guard');
  assert.ok(/@media\s+print[\s\S]*\.page-only-report-status/.test(html), 'seismic-misc page-only report readiness hidden from print');
  const reportStart = html.indexOf('function openMiscReport()');
  const reportEnd = html.indexOf('(function initPageScopeCard()', reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, 'seismic-misc report body isolated');
  const reportBody = html.slice(reportStart, reportEnd);
  [
    'miscReportReadiness',
    'page-only-report-status',
    '產報前檢查',
    '優先閱讀',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => assertNoIncludes(reportBody, needle, 'seismic-misc report excludes page-only readiness wording'));
}

for (const relativePath of [
  'tools/風力/wind-force.html',
  'tools/風力/wind-cc.html',
  'tools/風力/wind-open-roof.html',
  'tools/風力/wind-parapet.html',
  'tools/風力/wind-fence-sign.html',
  'tools/風力/wind-object-solid.html',
  'tools/風力/wind-object-frame.html',
  'tools/風力/wind-object-tower.html',
  'tools/風力/wind-lattice-tower.html',
  'tools/風力/wind-sign-pole.html',
  'tools/地震力/seismic-force.html',
  'tools/地震力/seismic-appendage.html',
  'tools/地震力/seismic-misc.html',
]) {
  const html = readText(toolboxFile(relativePath));
  assertPrintHidesSelectors(html, ['.case-actions', '.case-status'], `${relativePath} print-only case helper boundary`);
}

{
  const html = readText(toolboxFile('tools/地震力/seismic-dynamic.html'));
  assertPrintHidesSelectors(html, ['.case-file-actions'], 'seismic-dynamic print-only case helper boundary');
}

for (const relativePath of [
  'tools/風力/wind-fence-sign.html',
  'tools/風力/wind-object-solid.html',
  'tools/風力/wind-object-frame.html',
  'tools/風力/wind-object-tower.html',
  'tools/風力/wind-lattice-tower.html',
  'tools/風力/wind-sign-pole.html',
  'tools/地震力/seismic-appendage.html',
  'tools/地震力/seismic-misc.html',
]) {
  const html = readText(toolboxFile(relativePath));
  assertPrintHidesSelectors(html, ['.report-mode-control'], `${relativePath} print-only report mode boundary`);
}

for (const relativePath of [
  'tools/地震力/seismic-appendage.html',
  'tools/地震力/seismic-misc.html',
]) {
  const html = readText(toolboxFile(relativePath));
  assertPrintHidesSelectors(html, ['.print-option-row'], `${relativePath} print-only print option boundary`);
}

console.log(`formal tools contract OK (${tools.length} tools)`);
