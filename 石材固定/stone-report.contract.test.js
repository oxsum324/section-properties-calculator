const { spawnSync } = require('child_process');

const toolRoot = __dirname;

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
