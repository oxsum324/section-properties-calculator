const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const catalogPath = path.join(ROOT, 'excavation-traceability.catalog.json');

let failed = 0;

function assert(pass, label, detail = '') {
  if (!pass) {
    failed++;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function sameArray(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function localPath(relativePath) {
  return path.join(ROOT, ...relativePath.split('/'));
}

function evidenceExists(relativePath) {
  return fs.existsSync(localPath(relativePath));
}

function readUtf8(relativePath) {
  return fs.readFileSync(localPath(relativePath), 'utf8');
}

const catalogText = fs.readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const readme = readUtf8('README.md');
const parsers = readUtf8('backend/app/parsers.py');
const calculations = readUtf8('backend/app/calculations.py');
const reporting = readUtf8('backend/app/reporting.py');
const schemas = readUtf8('backend/app/schemas.py');
const main = readUtf8('backend/app/main.py');
const config = readUtf8('backend/app/config.py');
const workbookLoader = readUtf8('backend/app/workbook_loader.py');
const projectStore = readUtf8('backend/app/project_store.py');
const app = readUtf8('frontend/src/App.tsx');
const api = readUtf8('frontend/src/api.ts');
const parserTests = readUtf8('backend/tests/test_parsers.py');
const importFlowTests = readUtf8('backend/tests/test_import_flow.py');
const calculationTests = readUtf8('backend/tests/test_calculations.py');
const reportingTests = readUtf8('backend/tests/test_reporting.py');
const referenceTests = readUtf8('backend/tests/test_reference_data.py');
const storeTests = readUtf8('backend/tests/test_project_store.py');
const preflight = readUtf8('../preflight-tools.ps1');
const home = readUtf8('../結構工具箱/assets/home/home.js');
const reportContract = readUtf8('excavation-report.contract.test.js');

const expectedTools = [
  'excavation-analysis-import',
  'excavation-member-strength',
  'excavation-column-foundation',
  'excavation-report-governance',
  'excavation-service-data-governance',
];

assert(catalog.version === '0.1.0', 'excavation traceability catalog version', catalog.version);
assert(catalog.family === 'excavation-traceability', 'excavation traceability catalog family', catalog.family);
assertString(catalog.description, 'excavation traceability catalog description');
assert(Array.isArray(catalog.tools), 'excavation traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(
  sameArray((catalog.tools || []).map(tool => tool.key), expectedTools),
  'excavation traceability catalog tool order',
  JSON.stringify((catalog.tools || []).map(tool => tool.key))
);

const seenToolKeys = new Set();
const seenTraceIds = new Set();
let manualReviewCount = 0;
for (const tool of catalog.tools || []) {
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assert(!seenToolKeys.has(tool.key), `${tool.key} unique key`, tool.key);
  seenToolKeys.add(tool.key);
  assertString(tool.label, `${tool.key} label`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(tool.status === 'covered', `${tool.key} status`, tool.status);
  assert(Array.isArray(tool.traces) && tool.traces.length >= 2, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  for (const [index, trace] of (tool.traces || []).entries()) {
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!seenTraceIds.has(trace.id), `${trace.id} unique trace id`, trace.id);
    seenTraceIds.add(trace.id);
    assertString(trace.clause, `${trace.id} clause`);
    assert(
      /鋼結構|Excel|分析|本機|服務|報表|工程判讀|基礎|土層|專案|工作流|邊界/.test(trace.clause),
      `${trace.id} names formal source or engineering basis`,
      trace.clause
    );
    assertString(trace.purpose, `${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${trace.id} ${field}`);
    }
    manualReviewCount += trace.manualReview.length;
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|現場|地質|分析|審查者|使用者/.test(item)),
      `${trace.id} manual review wording`,
      trace.manualReview.join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${trace.id} evidence exists`, evidence);
    }
  }
}

assert(seenTraceIds.size >= 10, 'excavation traceability catalog trace volume', `traces=${seenTraceIds.size}`);
assert(manualReviewCount >= 10, 'excavation traceability catalog manual review volume', `manualReview=${manualReviewCount}`);

[
  'parse_analysis_file',
  'def _parse_lst_like',
  'def _parse_o_file',
  'def _classify_setup_event',
  'def _apply_o_but_force_summary',
  '未辨識副檔名',
  '"floor"',
  '"remove"',
  '"support"',
  '"brace"',
].forEach((needle) => {
  assert(parsers.includes(needle), `excavation parser keeps ${needle}`, needle);
});

[
  'def calculate_horizontal_support',
  'def calculate_wale',
  'def calculate_brace',
  'def calculate_corner_brace',
  'def calculate_column_scenario',
  'def allowable_axial_stress',
  'def allowable_fbx',
  'def allowable_fby',
  'def wall_moment_strength',
  'def _compression_breakdown',
  'def _tension_breakdown',
  'support_interaction',
  'wale_bending_shear',
  'brace_interaction',
  'corner_brace_interaction',
  'column_interaction',
].forEach((needle) => {
  assert(calculations.includes(needle), `excavation calculations keep ${needle}`, needle);
});

[
  'def build_report',
  'def build_word_report',
  'def _design_basis_lines',
  'def _report_scope_lines',
  'def _formula_source_text',
  '鋼結構容許應力設計法規範及解說',
  'support_interaction',
  'wale_bending_shear',
  'column_interaction',
  'concise_mode',
].forEach((needle) => {
  assert(reporting.includes(needle), `excavation reporting keeps ${needle}`, needle);
});

[
  'class ReportPayload',
  'class ProjectState',
  'class AnalysisImportResult',
  'class ColumnScenarioInput',
  'formula_id',
].forEach((needle) => {
  assert(schemas.includes(needle), `excavation schemas keep ${needle}`, needle);
});

[
  '@app.post("/api/projects/{project_id}/import-analysis"',
  '@app.post("/api/projects/{project_id}/calculate"',
  '@app.post("/api/projects/{project_id}/report"',
  '@app.post("/api/projects/{project_id}/report/docx"',
  '@app.get("/api/projects/{project_id}/report/latest-docx"',
  'Path(filename).name',
  'Cache-Control',
  'latest-report.docx',
].forEach((needle) => {
  assert(main.includes(needle), `excavation API keeps ${needle}`, needle);
});

[
  '2_開挖擋土支撐-v95000.xlsm',
  'STRUT_WORKBOOK_PATH',
  'STRUT_WORD_TEMPLATE_PATH',
].forEach((needle) => {
  assert(config.includes(needle), `excavation config keeps ${needle}`, needle);
});

[
  'def save_reference_data',
  'def _sanitize_reference_data',
  'def load_default_project',
  'openpyxl.load_workbook',
].forEach((needle) => {
  assert(workbookLoader.includes(needle), `excavation workbook loader keeps ${needle}`, needle);
});

[
  'class ProjectStore',
  'def save_imported_file',
  'def save_report',
  'state.json',
  'latest-report.pdf',
].forEach((needle) => {
  assert(projectStore.includes(needle), `excavation project store keeps ${needle}`, needle);
});

[
  'analysisWorkflowOptions',
  'handleImportAnalysis',
  'handleCalculate',
  'handleGenerateReport',
  'handleGenerateWordReport',
  '待判讀事件',
  '請先重新計算，再產出最新 Word / PDF。',
  '產出 PDF 正式版',
  '產出 Word 編修版',
].forEach((needle) => {
  assert(app.includes(needle), `excavation frontend keeps ${needle}`, needle);
});

[
  'generateReport',
  'generateWordReport',
  '/api/projects/${projectId}/report',
  '/api/projects/${projectId}/report/docx',
].forEach((needle) => {
  assert(api.includes(needle), `excavation API client keeps ${needle}`, needle);
});

[
  [parserTests, 'parse_analysis_file', 'parser tests cover parse_analysis_file'],
  [importFlowTests, 'test_apply_import_to_top_side_only_updates_top_rows', 'import flow tests cover single-side flow'],
  [importFlowTests, 'test_merge_analysis_sources_keeps_both_side_labels', 'import flow tests cover two-side merge flow'],
  [calculationTests, 'calculate_project', 'calculation tests cover calculate_project'],
  [calculationTests, 'wall', 'calculation tests cover wall deduction/foundation semantics'],
  [reportingTests, 'build_report', 'reporting tests cover PDF report'],
  [reportingTests, 'build_word_report', 'reporting tests cover Word report'],
  [referenceTests, 'save_reference_data', 'reference tests cover reference override'],
  [storeTests, 'save_imported_file', 'project store tests cover imported file persistence'],
].forEach(([haystack, needle, label]) => {
  assert(haystack.includes(needle), label, needle);
});

[
  'excavation-launcher',
  'excavation-backend-quick',
  'excavation-report-contract',
  'excavation-backend',
  'excavation-frontend',
].forEach((needle) => {
  assert(preflight.includes(needle), `excavation preflight keeps existing gate ${needle}`, needle);
});

[
  'backend.tests.test_reporting',
  'Excavation report contract checks passed.',
].forEach((needle) => {
  assert(reportContract.includes(needle), `excavation report contract keeps ${needle}`, needle);
});

assert(home.includes("'excavation-service': {"), 'excavation home governance keeps service source', 'excavation-service');
assert(home.includes("label: 'Excavation service governance'"), 'excavation home governance keeps service label', 'Excavation service governance');
assert(
  home.includes("preflightKeys: ['excavation-launcher', 'excavation-traceability-contract', 'excavation-backend-quick', 'excavation-report-contract']"),
  'excavation home governance includes report contract gate',
  'excavation-service'
);
assert(
  home.includes("fullPreflightKeys: ['excavation-backend', 'excavation-frontend']"),
  'excavation home governance keeps full backend/frontend gates',
  'excavation-service'
);

assert(readme.includes('excavation-traceability.catalog.json'), 'excavation README documents traceability catalog path', 'README.md');
assert(readme.includes('規範語意追蹤'), 'excavation README documents traceability purpose', 'README.md');
assert(readme.includes('excavation-report.contract.test.js'), 'excavation README documents report contract path', 'README.md');

if (failed) {
  console.error(`\n${failed} excavation traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll excavation traceability contract checks passed.');
