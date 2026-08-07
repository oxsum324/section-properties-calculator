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
const handoff = readUtf8('../結構工具箱/tools/construction-stage-load-handoff.js');
const removalTransferHandoff = readUtf8('backend/app/removal_transfer_handoff.py');
const removalTransferHandoffTests = readUtf8('backend/tests/test_removal_transfer_handoff.py');
const receiverOfflineSigner = readUtf8('backend/sign_receiver_request.py');
const receiverSigningLauncher = readUtf8('sign_receiver_request.ps1');
const receiverKeyEnrollment = readUtf8('backend/app/receiver_key_enrollment.py');
const receiverKeyManager = readUtf8('backend/manage_receiver_key.py');
const receiverKeyLauncher = readUtf8('manage_receiver_key.ps1');
const receiverTrustStore = readUtf8('backend/app/receiver_trust_store.py');
const receiverTrustBackup = readUtf8('backend/app/receiver_trust_backup.py');
const receiverTrustStoreTests = readUtf8('backend/tests/test_receiver_trust_store.py');

const expectedTools = [
  'excavation-analysis-import',
  'excavation-member-strength',
  'excavation-column-foundation',
  'excavation-report-governance',
  'excavation-service-data-governance',
];

assert(catalog.version === '1.1.0', 'excavation traceability catalog version', catalog.version);
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

['construction_stage_load_t', 'construction_stage_load_source', 'construction_stage_loads', 'target_column_id', 'distribution_factor', 'distribution_basis', '_construction_stage_distribution_errors', '跨柱反力分配合計', 'apply_transfer_eccentricity', 'transfer_eccentricity_x_m', 'transfer_eccentricity_y_m', 'transfer_basis', 'handoff_record', '_validate_construction_stage_handoff', '_construction_stage_load_cases', 'construction_stage_envelope', 'source_load_t', 'transfer_mx', 'transfer_my', '"Np"', '缺少可追溯交接來源', '無施工構台荷重基準案', '必須填寫採用依據'].forEach((needle) => {
  assert(calculations.includes(needle) || schemas.includes(needle), `excavation construction-stage calculation keeps ${needle}`, needle);
});
['validateConstructionStageHandoff', 'constructionStageHandoffFingerprint', 'normalizeConstructionStageColumns', '新增覆工板施工階段', '本柱反力分配比例', '同一交接來源目前分配至', '明確採用本階段附加傳力偏心', 'ΔMx = Np·Δex'].forEach((needle) => {
  assert(app.includes(needle), `excavation frontend handoff keeps ${needle}`, needle);
});
assert(handoff.includes('construction-stage-decking-load-handoff'), 'excavation handoff producer schema is governed', 'construction-stage-decking-load-handoff');

[
  'excavation-removal-transfer-handoff',
  'receiver-capacity-verification-receipt',
  'def build_removal_transfer_handoff',
  'def build_receiver_verification_receipt',
  'def validate_removal_transfer_handoff',
  'def validate_receiver_verification_receipt',
  'def receiver_verification_receipt_fingerprint',
  'def build_receiver_identity_signing_request',
  'def validate_receiver_identity_signing_request',
  'def attach_receiver_identity_signature',
  'def same_removal_transfer_handoff_content',
  'ERH',
  'ERT',
  'RVR',
  '"status": "pending"',
  '"autoApplied": False',
  '"autoVerified": False',
  '來源構件、生命週期、控制軸力',
].forEach((needle) => {
  assert(removalTransferHandoff.includes(needle), `excavation removal transfer handoff keeps ${needle}`, needle);
});
[
  '/api/projects/{project_id}/removal-transfer-handoff',
  '/api/projects/{project_id}/removal-transfer-receipts',
  '/api/removal-transfer-handoffs/validate',
  '/api/removal-transfer-receipts/build',
  '/api/removal-transfer-receipts/validate',
  '/api/removal-transfer-receipts/signing-request',
  '/api/removal-transfer-receipts/attach-signature',
  '/api/removal-transfer-trust-keys/enrollments/validate',
  '/api/removal-transfer-trust-keys/enrollments/register',
  '/api/removal-transfer-trust-keys/{key_id}/revoke',
  '/api/removal-transfer-trust-registry/backups/export',
  '/api/removal-transfer-trust-registry/backups/validate',
  '/api/removal-transfer-trust-registry/backups/restore',
  'RevokeReceiverTrustKeyRequest',
  'build_removal_transfer_handoff',
  'build_receiver_verification_receipt',
  'validate_receiver_verification_receipt',
  'removal_transfer_handoffs',
  'removal_transfer_verification_receipts',
  'calculation_fingerprint(project)',
].forEach((needle) => {
  assert(main.includes(needle), `excavation removal transfer API keeps ${needle}`, needle);
});
[
  'generateRemovalTransferHandoff',
  'handleGenerateRemovalTransferHandoff',
  'importRemovalTransferReceipt',
  'handleImportRemovalTransferReceipt',
  'validateRemovalTransferHandoff',
  'buildReceiverVerificationReceipt',
  'validateReceiverVerificationReceipt',
  'handleImportReceiverAssistantHandoff',
  'handleBuildReceiverAssistantReceipt',
  'handleValidateReceiverAssistantReceipt',
  'handleDownloadReceiverIdentitySigningRequest',
  'handleAttachReceiverIdentitySignature',
  '接收端回簽助手',
  '獨立接收端工作區',
  '不會寫入目前來源專案或計算書',
  '產生並下載 RVR 回簽 JSON',
  'RVR 指紋不驗證人員身分',
  '匯出待驗證交接 JSON',
  '匯入承接構造回簽 JSON',
  '待承接構造驗證',
  '接收端檢核通過／回簽人身分待核對',
  'RVR 指紋已通過完整性檢查',
  '下載離線身分簽署請求',
  '匯入離線簽章回應',
  'handleImportReceiverKeyEnrollment',
  '匯入 RKE 公鑰登錄包',
  '已透過獨立管道核對公鑰所屬單位與 Key ID',
  '撤銷原因與處理摘要',
  '確認撤銷並寫入事件清冊',
  '金鑰生命週期事件清冊',
  'handleDownloadReceiverTrustRegistryBackup',
  'handleImportReceiverTrustRegistryBackup',
  'handleRestoreReceiverTrustRegistryBackup',
  '下載目前信任清冊備份',
  '驗證／預覽清冊備份',
  '確認復原已驗證備份',
  '此備份不得復原',
  '交接完成不等於承接構造合格',
].forEach((needle) => {
  assert(app.includes(needle) || api.includes(needle), `excavation removal transfer frontend keeps ${needle}`, needle);
});
[
  'test_builds_pending_receiver_verification_handoff',
  'test_rejects_tampered_transfer_content',
  'test_outside_scope_handoff_keeps_receiver_identity_pending',
  'test_rejects_source_member_that_did_not_pass_calculation',
  'test_validates_complete_external_receiver_receipt',
  'test_rejects_tampered_receiver_receipt',
  'test_rejects_incomplete_receiver_receipt',
  'test_rejects_passed_receipt_with_over_capacity_ratio',
  'test_reuses_handoff_when_only_issue_time_changes',
  'test_builds_controlled_receiver_receipt_for_assistant',
  'test_assistant_rejects_missing_receiver_result',
  'test_builds_offline_signing_request_and_attaches_response',
  'test_rejects_tampered_signing_request_or_signature_response',
].forEach((needle) => {
  assert(removalTransferHandoffTests.includes(needle), `excavation removal transfer tests keep ${needle}`, needle);
});

[
  'validate_receiver_identity_signing_request',
  'Ed25519PrivateKey',
  'build_signature_response',
  'signatureBase64',
].forEach((needle) => {
  assert(receiverOfflineSigner.includes(needle), `excavation offline receiver signer keeps ${needle}`, needle);
});
[
  '-m backend.sign_receiver_request',
  '--private-key',
  '--output',
].forEach((needle) => {
  assert(receiverSigningLauncher.includes(needle), `excavation receiver signer launcher keeps ${needle}`, needle);
});
[
  'receiver-verification-key-enrollment',
  'receiver-verification-key-enrollment-v1',
  'build_receiver_key_enrollment',
  'validate_receiver_key_enrollment',
  'proofOfPossessionBase64',
  'packageFingerprint',
  'replacesKeyId',
].forEach((needle) => {
  assert(receiverKeyEnrollment.includes(needle), `excavation receiver key enrollment keeps ${needle}`, needle);
});
[
  'BestAvailableEncryption',
  'create_receiver_key_package',
  '--replaces-key-id',
  '--password-env',
].forEach((needle) => {
  assert(receiverKeyManager.includes(needle), `excavation receiver key manager keeps ${needle}`, needle);
});
[
  'backend.manage_receiver_key',
  '--output-dir',
  '--password-env',
].forEach((needle) => {
  assert(receiverKeyLauncher.includes(needle), `excavation receiver key launcher keeps ${needle}`, needle);
});
[
  'receiver-verification-key-event',
  'eventFingerprint',
  'previousEventFingerprint',
  'revocationReasonCode',
  'revocationEventFingerprint',
  '既有撤銷原因與事件記錄不可覆寫',
].forEach((needle) => {
  assert(receiverTrustStore.includes(needle), `excavation receiver trust store keeps ${needle}`, needle);
});
[
  'receiver-verification-trust-registry-backup',
  'registryFingerprint',
  'backupFingerprint',
  'build_receiver_trust_registry_backup',
  'validate_receiver_trust_registry_backup',
  'preview_receiver_trust_registry_restore',
  'restore_receiver_trust_registry_backup',
  'restoreAllowed',
  '備份會把已撤銷金鑰恢復為受信任',
  '備份事件鏈不是目前清冊的向前延伸',
].forEach((needle) => {
  assert(receiverTrustBackup.includes(needle), `excavation receiver trust backup keeps ${needle}`, needle);
});
assert(receiverTrustStore.includes('pre-restore'), 'excavation receiver trust restore keeps safeguard copy', 'pre-restore');
[
  'test_validates_and_registers_proof_of_possession_enrollment',
  'test_rotation_enrollment_links_but_does_not_revoke_previous_key',
  'test_creates_encrypted_private_key_and_public_only_enrollment',
  'test_revocation_requires_complete_confirmation_and_supported_reason',
  'test_event_chain_rejects_tampering_and_old_registry_remains_readable',
  'test_registry_rejects_revoked_key_restored_without_matching_event',
  'test_builds_and_validates_public_only_trust_registry_backup',
  'test_previews_and_restores_backup_with_safeguard_copy',
  'test_restore_blocks_revocation_rollback_or_key_removal',
  'test_restore_can_replace_unreadable_registry_after_preview',
].forEach((needle) => {
  assert(receiverTrustStoreTests.includes(needle), `excavation receiver trust tests keep ${needle}`, needle);
});
[
  'removal_transfer_handoffs',
  'removal_transfer_verification_receipts',
].forEach((needle) => {
  assert(schemas.includes(needle), `excavation project schema keeps ${needle}`, needle);
  assert(storeTests.includes(needle), `excavation project store tests keep ${needle}`, needle);
});

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
  'force_source',
  'analysis_stage_cases',
  'analysis_install_stage_index',
  'analysis_control_stage_index',
  'analysis_removal_stage_index',
  'removal_transfer_mode',
  'removal_transfer_target',
  'removal_transfer_basis',
  'removal_transfer_confirmed',
  'construction_step_label',
  'analysis_mapping_confirmed',
  'analysis_mapping_basis',
].forEach((needle) => {
  assert(schemas.includes(needle), `excavation stage mapping schema keeps ${needle}`, needle);
});
[
  'def _validate_analysis_force_mapping',
  '控制分析階段不是本列控制階段軸力包絡最大值',
  '外部分析的控制內力階段早於支撐安裝階段',
  '外部分析的拆撐階段未晚於控制內力階段',
  '尚未指定拆撐後荷重處置',
  '拆撐後荷重處置必須填寫承接構造或指定對象',
  '尚未確認拆撐後荷重處置及其承接構造檢核邊界',
  '尚未確認控制分析階段與實際施工步驟的對應',
  '目前採用內力與控制分析階段軸力不一致',
].forEach((needle) => {
  assert(calculations.includes(needle), `excavation stage mapping calculation keeps ${needle}`, needle);
});
[
  'AnalysisMappingEditor',
  '實際施工步驟',
  '階段對應依據',
  '分析生命週期',
  '確認本列安裝、控制內力與拆撐時序',
  '拆撐後荷重處置（必選）',
  '確認拆撐後荷重處置及承接構造的另案檢核邊界',
].forEach((needle) => {
  assert(app.includes(needle), `excavation frontend stage mapping keeps ${needle}`, needle);
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
  home.includes("preflightKeys: ['excavation-launcher', 'excavation-traceability-contract', 'excavation-backend-quick', 'excavation-report-contract', 'construction-stage-load-handoff']"),
  'excavation home governance includes report and construction-stage handoff gates',
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
