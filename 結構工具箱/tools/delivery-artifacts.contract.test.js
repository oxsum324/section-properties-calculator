const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

let failed = 0;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(readText(repoFile(relativePath)));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertIncludes(text, needle, label) {
  assert(text.includes(needle), label, needle);
}

function assertIncludesAny(text, needles, label) {
  assert(needles.some(needle => text.includes(needle)), label, needles.join(' || '));
}

function assertIncludesAll(text, needles, label) {
  for (const needle of needles) {
    assertIncludes(text, needle, `${label} keeps ${needle}`);
  }
}

function tracesFor(catalog, toolKey) {
  const tool = (catalog.tools || []).find(item => item.key === toolKey);
  assert(Boolean(tool), `${catalog.family} has tool`, toolKey);
  return Array.isArray(tool?.traces) ? tool.traces : [];
}

function traceById(catalog, toolKey, traceId) {
  const trace = tracesFor(catalog, toolKey).find(item => item.id === traceId);
  assert(Boolean(trace), `${catalog.family} has trace`, traceId);
  return trace || {};
}

function assertTraceEvidence(catalogPath, trace, requiredNeedles) {
  const catalogDir = path.dirname(repoFile(catalogPath));
  assert(Array.isArray(trace.evidence) && trace.evidence.length > 0, `${trace.id} evidence populated`, trace.evidence?.join(', ') || '');
  for (const evidence of trace.evidence || []) {
    const evidencePath = path.resolve(catalogDir, ...String(evidence).split('/'));
    assert(fs.existsSync(evidencePath), `${trace.id} evidence exists`, evidence);
  }
  const combined = [
    trace.clause,
    trace.purpose,
    ...(trace.inputs || []),
    ...(trace.calculation || []),
    ...(trace.report || []),
    ...(trace.manualReview || []),
  ].join(' / ');
  for (const needle of requiredNeedles) {
    assert(combined.includes(needle), `${trace.id} trace declares ${needle}`, combined);
  }
  assert(
    /人工確認|人工複核|設計者|審查者|使用者|施工圖|專案|簽章|附件/.test((trace.manualReview || []).join(' / ')),
    `${trace.id} manual delivery boundary`,
    (trace.manualReview || []).join(' / ')
  );
}

const stoneCatalogPath = '石材固定/stone-traceability.catalog.json';
const deckingCatalogPath = '覆工板/decking-traceability.catalog.json';
const excavationCatalogPath = '開挖擋土支撐/excavation-traceability.catalog.json';
const anchorCatalogPath = '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json';
const stoneCatalog = readJson(stoneCatalogPath);
const deckingCatalog = readJson(deckingCatalogPath);
const excavationCatalog = readJson(excavationCatalogPath);
const anchorCatalog = readJson(anchorCatalogPath);

const stoneServer = readText(repoFile('石材固定/server.py'));
const stoneServerSmoke = readText(repoFile('石材固定/server_smoke_test.py'));
const stoneAutoWordArtifact = readText(repoFile('石材固定/auto_word_artifact_test.py'));
const stoneReportContract = readText(repoFile('石材固定/stone-report.contract.test.js'));
const stoneAuditSchema = readText(repoFile('石材固定/audit_schema.py'));
const stoneAuditSchemaTests = readText(repoFile('石材固定/audit_schema_test.py'));
const stoneAuditCompareTests = readText(repoFile('石材固定/audit_compare_test.py'));
const stonePreDeliveryCheck = readText(repoFile('石材固定/pre_delivery_check.py'));
const stoneReleaseBundleSmoke = readText(repoFile('石材固定/release_bundle_smoke_test.py'));
const stoneReadme = readText(repoFile('石材固定/README.md'));
const deckingHtml = readText(repoFile('覆工板/index.html'));
const deckingReport = readText(repoFile('覆工板/report/gen_report.py'));
const deckingReportContract = readText(repoFile('覆工板/decking-report.contract.test.js'));
const deckingFixture = readText(repoFile('覆工板/test-fixtures/report-smoke.json'));
const deckingReadme = readText(repoFile('覆工板/README.md'));
const excavationReporting = readText(repoFile('開挖擋土支撐/backend/app/reporting.py'));
const excavationSchemas = readText(repoFile('開挖擋土支撐/backend/app/schemas.py'));
const excavationMain = readText(repoFile('開挖擋土支撐/backend/app/main.py'));
const excavationStore = readText(repoFile('開挖擋土支撐/backend/app/project_store.py'));
const excavationApp = readText(repoFile('開挖擋土支撐/frontend/src/App.tsx'));
const excavationApi = readText(repoFile('開挖擋土支撐/frontend/src/api.ts'));
const excavationReportingTests = readText(repoFile('開挖擋土支撐/backend/tests/test_reporting.py'));
const excavationStoreTests = readText(repoFile('開挖擋土支撐/backend/tests/test_project_store.py'));
const excavationReadme = readText(repoFile('開挖擋土支撐/README.md'));
const anchorReportContract = readText(repoFile('螺栓檢討/anchor-report.contract.test.js'));
const anchorPackageReadme = readText(repoFile('螺栓檢討/bolt-review-tool/README.md'));
const anchorReportExportTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportExport.test.ts'));
const anchorReportDocxTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportDocx.test.ts'));
const anchorReportWorkbookTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportWorkbook.test.ts'));
const anchorAttachmentReadinessTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/attachmentReadiness.test.ts'));
const rootReadme = readText(repoFile('README.md'));
const preflight = readText(repoFile('preflight-tools.ps1'));
const staging = readText(repoFile('STAGING_GROUPS.md'));
const boundaries = readText(repoFile('TOOL_BOUNDARIES.md'));
const reportGuide = readText(repoFile('TOOL_REPORT_GUIDE.md'));
const maturityMatrixScript = readText(repoFile('結構工具箱/tools/tool-maturity-matrix.js'));

assert(stoneCatalog.family === 'stone-traceability', 'stone catalog family', stoneCatalog.family);
assert(deckingCatalog.family === 'decking-traceability', 'decking catalog family', deckingCatalog.family);
assert(excavationCatalog.family === 'excavation-traceability', 'excavation catalog family', excavationCatalog.family);
assert(anchorCatalog.family === 'anchor-traceability', 'anchor catalog family', anchorCatalog.family);

const stoneReportTrace = traceById(stoneCatalog, 'stone-serviceability-report', 'stone-report-audit-golden-governance');
assertTraceEvidence(stoneCatalogPath, stoneReportTrace, ['Word', 'PDF', 'JSON', '交付前檢查']);
const deckingReportTrace = traceById(deckingCatalog, 'decking-report-governance', 'decking-json-report-schema');
assertTraceEvidence(deckingCatalogPath, deckingReportTrace, ['JSON', 'Word', 'report-smoke.json']);
const excavationReportTrace = traceById(excavationCatalog, 'excavation-report-governance', 'excavation-pdf-word-report-parity');
assertTraceEvidence(excavationCatalogPath, excavationReportTrace, ['PDF', 'DOCX', 'ProjectState']);
const excavationDownloadTrace = traceById(excavationCatalog, 'excavation-report-governance', 'excavation-report-download-boundary');
assertTraceEvidence(excavationCatalogPath, excavationDownloadTrace, ['latest', 'PDF', 'Word']);
const anchorReportTrace = traceById(anchorCatalog, 'anchor-strength', 'anchor-strength-tension-modes');
[
  '鋼材拉力強度',
  '控制檢核',
  '列印報告',
].forEach(needle => assertIncludes((anchorReportTrace.report || []).join(' / '), needle, `anchor report trace declares ${needle}`));
[
  'src/calc.ts',
  'src/ReportDocument.tsx',
].forEach(evidence => assert(fs.existsSync(repoFile(`螺栓檢討/bolt-review-tool/${evidence}`)), 'anchor report trace evidence exists', evidence));

[
  'def write_export_audit',
  'generate_legacy_compat',
  'auto_word',
  'payload_sha256',
  'delivery_quality',
  'server_evaluation',
].forEach(needle => assertIncludes(stoneServer, needle, `stone export server keeps ${needle}`));

[
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'test_export_audit_records_summary_and_trace',
  'test_legacy_generate_report_outputs_structured_docx_and_audit_boundary',
  'test_export_audit_strips_page_only_report_reading_status',
  'test_export_audit_forces_quality_c_when_payload_html_differs',
].forEach(needle => assertIncludes(stoneServerSmoke, needle, `stone export smoke keeps ${needle}`));

[
  'test_export_audit_records_summary_and_trace',
  'test_legacy_generate_report_outputs_structured_docx_and_audit_boundary',
  'test_export_audit_strips_page_only_report_reading_status',
  'test_export_audit_forces_quality_c_when_payload_html_differs',
  'test_review_summary_import_is_true_opt_in_without_toc_ghost',
  'test_formal_auto_word_outputs_pdf_docx_with_review_notes_and_boundaries',
].forEach(needle => assertIncludes(stoneReportContract, needle, `stone report contract keeps ${needle}`));

[
  'auto_export_word',
  'PdfReader',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'extract_docx_text',
  'pdf_text =',
  'docx_text',
  'self.assertGreaterEqual(len(pdf_text), 8_000)',
  'self.assertGreaterEqual(len(docx_text), 8_000)',
  'self.assertNotIn(needle, text)',
  'test_review_summary_import_is_true_opt_in_without_toc_ghost',
  'test_formal_auto_word_outputs_pdf_docx_with_review_notes_and_boundaries',
].forEach(needle => assertIncludes(stoneAutoWordArtifact, needle, `stone auto_word artifact text extraction keeps ${needle}`));

[
  'REQUIRED_AUDIT_PATHS',
  "('trace', 'payload_sha256')",
  "('review', 'delivery_quality', 'code')",
  "('review', 'server_evaluation', 'tool_html_match')",
].forEach(needle => assertIncludes(stoneAuditSchema, needle, `stone audit schema keeps ${needle}`));

[
  'review.server_evaluation.tool_html_match',
  'delivery_quality',
  'payload_sha256',
].forEach(needle => assertIncludes(stoneAuditSchemaTests, needle, `stone audit schema tests keep ${needle}`));

[
  '--latest',
  'tool_html_match',
  '稽核報告必要欄位缺漏增加',
  'delivery_quality',
].forEach(needle => assertIncludes(stoneAuditCompareTests, needle, `stone audit compare tests keep ${needle}`));

[
  'run_latest_audit_gate',
  'audit_compare.py',
  '--latest',
  '--fail-on-regression',
  'Release bundle gate',
  'verify_release_bundle.py',
].forEach(needle => assertIncludes(stonePreDeliveryCheck, needle, `stone pre-delivery gate keeps ${needle}`));

[
  'auto_word.py',
  '交付前檢查.bat',
  '比對稽核報告.bat',
].forEach(needle => assertIncludes(stoneReleaseBundleSmoke, needle, `stone release bundle smoke keeps ${needle}`));

assertIncludesAll(stoneReadme, [
  '產生稽核報告 JSON',
  '交付前檢查.bat',
  'audit_compare.py --latest --fail-on-regression',
  '正式送審或交付前',
], 'stone README delivery boundary');
assertIncludesAny(
  stoneReadme,
  ['輸出版面', 'PDF / Word / XLSX / 稽核 JSON / 儀表板'],
  'stone README delivery boundary keeps formal output scope'
);

[
  'function exportJSON',
  'buildProjectPayload',
  'results: JSON.parse(JSON.stringify(RESULTS',
  '產生計算書.bat',
  '可產出 Word 報告',
].forEach(needle => assertIncludes(deckingHtml, needle, `decking HTML delivery workflow keeps ${needle}`));

[
  'from docx import Document',
  '覆工板系統結構計算書',
  '適用規範',
  '計算結果總表',
  'JSON',
].forEach(needle => assertIncludes(deckingReport, needle, `decking Word report keeps ${needle}`));

[
  'readDocxPayload',
  "z.read('word/document.xml')",
  'docxPayload.text.length > 2500',
  'docxPayload.paragraphCount >= 60',
  'docxPayload.tableCount >= 6',
  'docxPayload.sectionCount >= 8',
  'docxPayload.xml.includes',
  'docxPayload.text.includes',
  '!docxPayload.xml.includes(needle)',
  '!docxPayload.text.includes(needle)',
].forEach(needle => assertIncludes(deckingReportContract, needle, `decking report contract text extraction keeps ${needle}`));

[
  '"project"',
  '"global"',
  '"inputs"',
  '"results"',
  '"deck"',
  '"column"',
  '"pile"',
].forEach(needle => assertIncludes(deckingFixture, needle, `decking report fixture keeps ${needle}`));

[
  'test-fixtures/report-smoke.json',
  '產生一份 smoke `.docx`',
  'Word 計算書',
  '不應直接採用計算書結論',
].forEach(needle => assertIncludes(deckingReadme, needle, `decking README delivery boundary keeps ${needle}`));

[
  'def build_report',
  'def build_word_report',
  'ProjectState',
  '_design_basis_lines',
  '_formula_source_text',
  'concise_mode',
].forEach(needle => assertIncludes(excavationReporting, needle, `excavation reporting keeps ${needle}`));

[
  'class ReportPayload',
  'latest_download_url',
  'report_mode',
  'report_kind',
  'Literal["pdf", "docx"]',
].forEach(needle => assertIncludes(excavationSchemas, needle, `excavation report payload schema keeps ${needle}`));

[
  '@app.post("/api/projects/{project_id}/report"',
  '@app.post("/api/projects/{project_id}/report/docx"',
  '@app.get("/api/projects/{project_id}/report/latest"',
  '@app.get("/api/projects/{project_id}/report/latest-docx"',
  'Path(filename).name',
  'Cache-Control',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].forEach(needle => assertIncludes(excavationMain, needle, `excavation API delivery boundary keeps ${needle}`));

[
  'latest-report.pdf',
  'def save_report',
  'latest_name',
  'shutil.copyfile',
].forEach(needle => assertIncludes(excavationStore, needle, `excavation project store keeps ${needle}`));

[
  'handleGenerateReport',
  'handleGenerateWordReport',
  '產出 PDF 正式版',
  '產出 Word 編修版',
  '請先重新計算，再產出最新 Word / PDF。',
].forEach(needle => assertIncludes(excavationApp, needle, `excavation frontend delivery state keeps ${needle}`));

[
  'generateReport',
  'generateWordReport',
  '/api/projects/${projectId}/report',
  '/api/projects/${projectId}/report/docx',
].forEach(needle => assertIncludes(excavationApi, needle, `excavation API client keeps ${needle}`));

[
  'build_report',
  'build_word_report',
  'PdfReader',
  'Document',
  'test_pdf_report_uses_formal_section_structure',
  'test_pdf_report_excludes_page_only_status_overview',
  'self.assertGreater(len(full_text), 25000)',
  'self.assertEqual(sum(1 for page_text in page_texts if len(page_text.strip()) > 100), len(reader.pages))',
  'for needle in PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'self.assertNotIn(needle, text)',
  'self.assertGreater(len(artifact["combined_text"]), 25000)',
].forEach(needle => assertIncludes(excavationReportingTests, needle, `excavation reporting tests text extraction cover ${needle}`));

[
  'latest-report.docx',
  'test_save_report_copies_latest_report_to_project_folder',
].forEach(needle => assertIncludes(excavationStoreTests, needle, `excavation project store tests cover ${needle}`));

[
  'PDF 計算書與 Word 編修版輸出',
  'app_data',
  'Word/PDF 輸出',
  'PDF / DOCX 版面先以穩定輸出為優先',
].forEach(needle => assertIncludes(excavationReadme, needle, `excavation README delivery boundary keeps ${needle}`));

[
  'src/reportExport.test.ts',
  'src/reportDocx.test.ts',
  'src/reportWorkbook.test.ts',
  'src/attachmentReadiness.test.ts',
].forEach(needle => assertIncludes(anchorReportContract, needle, `anchor report boundary contract wraps ${needle}`));

[
  'buildStandaloneReportHtml',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'expectNoPageOnlyReportStatus',
  'autoPrint',
].forEach(needle => assertIncludes(anchorReportExportTest, needle, `anchor HTML report artifact test keeps ${needle}`));

[
  'serializeReportDocument',
  'word/document.xml',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'visibleText',
  'expect(visibleText).not.toContain(needle)',
  'tableCount',
  'pageBreakCount',
].forEach(needle => assertIncludes(anchorReportDocxTest, needle, `anchor DOCX artifact test keeps ${needle}`));

[
  'serializeReportWorkbook',
  'ExcelJS',
  'workbookText',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'expect(text.length).toBeGreaterThan(2_000)',
  'expect(text).not.toContain(needle)',
  'CORE_WORKBOOK_SHEETS',
].forEach(needle => assertIncludes(anchorReportWorkbookTest, needle, `anchor XLSX artifact test keeps ${needle}`));

[
  '頁面顯示，不進計算書、列印或 PDF',
  '不會寫入計算書或列印 PDF',
  '優先閱讀',
].forEach(needle => assertIncludes(anchorAttachmentReadinessTest, needle, `anchor attachment readiness boundary keeps ${needle}`));

[
  '螺栓檢討/anchor-report.contract.test.js',
  '報告匯出與附件閱讀狀態',
  '平台層報告邊界 gate',
  'workbook/docx 邊界',
].forEach(needle => assertIncludes(anchorPackageReadme, needle, `anchor README delivery boundary keeps ${needle}`));

[
  'delivery-artifacts-contract',
  'node 結構工具箱/tools/delivery-artifacts.contract.test.js',
  'Delivery artifact governance contract',
  'node 石材固定/stone-report.contract.test.js',
  'decking-report-contract',
  'excavation-report-contract',
  'excavation-backend-quick',
  'excavation-backend',
  'excavation-frontend',
].forEach(needle => assertIncludes(preflight, needle, `preflight wires delivery artifact governance ${needle}`));

[
  '結構工具箱/tools/delivery-artifacts.contract.test.js',
  'delivery-artifacts-contract',
].forEach(needle => {
  assertIncludes(staging, needle, `STAGING_GROUPS documents delivery artifact governance ${needle}`);
  assertIncludes(boundaries, needle, `TOOL_BOUNDARIES documents delivery artifact governance ${needle}`);
  assertIncludes(reportGuide, needle, `TOOL_REPORT_GUIDE documents delivery artifact governance ${needle}`);
  assertIncludes(rootReadme, needle, `README documents delivery artifact governance ${needle}`);
});

[
  ['README', rootReadme],
  ['STAGING_GROUPS', staging],
  ['TOOL_BOUNDARIES', boundaries],
  ['TOOL_REPORT_GUIDE', reportGuide],
].forEach(([label, text]) => {
  assertIncludesAny(
    text,
    ['stone audit JSON / Word / PDF', '石材 audit JSON / Word / PDF'],
    `${label} delivery artifact scope keeps stone audit JSON / Word / PDF`
  );
  assertIncludesAny(
    text,
    ['覆工板 JSON / Word', '覆工板 JSON 匯出 / Word 計算書', '覆工板 JSON / Word 報表'],
    `${label} delivery artifact scope keeps decking JSON / Word scope`
  );
  assertIncludesAny(
    text,
    [
      '開挖擋土支撐 PDF / DOCX / latest download API',
      '開挖 PDF / DOCX / latest download API',
      '開挖擋土支撐 PDF / DOCX / 下載 API',
      '開挖 PDF / DOCX / 下載 API',
    ],
    `${label} delivery artifact scope keeps excavation PDF / DOCX / download scope`
  );
  assertIncludesAny(
    text,
    [
      '錨栓 HTML / XLSX / DOCX',
      '錨栓 HTML / workbook / DOCX',
      '錨栓 HTML / XLSX / DOCX 報告',
    ],
    `${label} delivery artifact scope keeps anchor HTML / XLSX / DOCX scope`
  );
});

[
  'delivery-artifacts-contract',
  '交付物一致性',
  '結構工具箱/tools/delivery-artifacts.contract.test.js',
  '石材 audit JSON / Word / PDF',
  '錨栓 HTML / XLSX / DOCX',
].forEach(needle => assertIncludes(maturityMatrixScript, needle, `maturity matrix global gate includes ${needle}`));

if (failed) {
  console.error(`\n${failed} delivery artifact governance checks failed.`);
  process.exit(1);
}

console.log('\nAll delivery artifact governance checks passed.');
