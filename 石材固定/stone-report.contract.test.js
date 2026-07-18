const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolRoot = __dirname;
const formalPagePath = path.join(toolRoot, '石材計算書產生器_規範版V2.html');
const formalPage = fs.readFileSync(formalPagePath, 'utf8');

function assertContract(condition, label, detail) {
  if (!condition) {
    console.error(`FAIL | ${label} :: ${detail}`);
    process.exit(1);
  }
  console.log(`PASS | ${label} | ${detail}`);
}

const directPrintNeedles = [
  '../結構工具箱/core/direct-print-boundary.css',
  '<body class="formal-tool-output-page">',
  'class="formal-direct-print-boundary"',
  '石材工具主頁列印已封鎖',
  '本頁不得作為附件',
  'body.formal-tool-output-page > #printout{display:none!important}',
];

for (const needle of directPrintNeedles) {
  assertContract(formalPage.includes(needle), 'Stone direct-print boundary is present', needle);
}

const privateMethodPhotoPaths = [
  '01_背扣雙角鐵.jpg',
  '02_插銷鐵件.jpg',
  '02套管式膨脹螺栓.jpg',
  '02鎚釘式膨脹螺栓.png',
];
for (const privatePath of privateMethodPhotoPaths) {
  assertContract(
    !formalPage.includes(privatePath),
    'Stone public method media does not request ignored raster files',
    privatePath
  );
}

for (const needle of [
  'const V2_METHOD_MEDIA = Object.freeze({',
  "src:v2MethodSchematicDataUrl('sleeve')",
  "src:v2MethodSchematicDataUrl('wedge')",
  'v2InitMethodMedia();',
  "mode:'public_static'",
  '公開靜態版不檢查本機服務',
  'const proseAt = m.search(/[\\u3400-\\u9fff]/);',
]) {
  assertContract(formalPage.includes(needle), 'Stone public console safety contract is present', needle);
}

assertContract(
  formalPage.includes("const source = document.getElementById('preview-sheets');")
    && formalPage.includes('openPagedPrintWindow(buildPagedPrintHtml('),
  'Stone report output remains dedicated',
  'printable sheets are cloned into a separate report window'
);

const reportBuilderStart = formalPage.indexOf('function buildPagedPrintHtml(');
const reportBuilderEnd = formalPage.indexOf('/* ══════════════════ PERSIST', reportBuilderStart);
const reportBuilderSource = formalPage.slice(reportBuilderStart, reportBuilderEnd);
assertContract(
  reportBuilderStart >= 0
    && reportBuilderEnd > reportBuilderStart
    && !reportBuilderSource.includes('formal-direct-print-boundary')
    && !reportBuilderSource.includes('石材工具主頁列印已封鎖')
    && !reportBuilderSource.includes('本頁不得作為附件'),
  'Stone report window excludes work-page boundary wording',
  'dedicated PDF/preview HTML contains report sheets only'
);

const result = spawnSync(
  'python',
  [
    '-m',
    'unittest',
    'server_smoke_test.ServerSmokeTests.test_export_audit_records_summary_and_trace',
    'server_smoke_test.ServerSmokeTests.test_legacy_generate_report_outputs_structured_docx_and_audit_boundary',
    'server_smoke_test.ServerSmokeTests.test_export_audit_strips_page_only_report_reading_status',
    'server_smoke_test.ServerSmokeTests.test_export_audit_forces_quality_c_when_payload_html_differs',
    'auto_word_artifact_test.AutoWordArtifactTests.test_review_summary_import_is_true_opt_in_without_toc_ghost',
    'auto_word_artifact_test.AutoWordArtifactTests.test_formal_auto_word_outputs_pdf_docx_with_review_notes_and_boundaries',
  ],
  {
    cwd: toolRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  }
);

if (result.error) {
  console.error(`FAIL | stone report contract spawn error :: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`FAIL | stone report contract :: exit=${result.status ?? 'null'}`);
  process.exit(result.status || 1);
}

console.log('\nStone report contract checks passed.');
