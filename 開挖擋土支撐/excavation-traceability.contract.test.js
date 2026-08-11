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
const pdfRenderEvidence = readUtf8('backend/app/pdf_render_evidence.py');
const backendRequirements = readUtf8('backend/requirements.txt');
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
const pdfRenderEvidenceTests = readUtf8('backend/tests/test_pdf_render_evidence.py');
const reportDeliveryApiTests = readUtf8('backend/tests/test_report_delivery_api.py');
const attachmentEvidenceChainDrillTests = readUtf8('backend/tests/test_attachment_package_evidence_chain_drill.py');
const referenceTests = readUtf8('backend/tests/test_reference_data.py');
const storeTests = readUtf8('backend/tests/test_project_store.py');
const preflight = readUtf8('../preflight-tools.ps1');
const home = readUtf8('../結構工具箱/assets/home/home.js');
const reportContract = readUtf8('excavation-report.contract.test.js');
const handoff = readUtf8('../結構工具箱/tools/construction-stage-load-handoff.js');
const removalTransferHandoff = readUtf8('backend/app/removal_transfer_handoff.py');
const receiverCapacity = readUtf8('backend/app/receiver_capacity.py');
const receiverCapacityTests = readUtf8('backend/tests/test_receiver_capacity.py');
const removalTransferHandoffTests = readUtf8('backend/tests/test_removal_transfer_handoff.py');
const receiverOfflineSigner = readUtf8('backend/sign_receiver_request.py');
const receiverSigningLauncher = readUtf8('sign_receiver_request.ps1');
const sourceEvidenceSigningLauncher = readUtf8('簽署SEV身分請求.bat');
const sourceEvidenceChainVerifier = readUtf8('backend/verify_source_evidence_chain.py');
const sourceEvidenceChainVerifierTests = readUtf8('backend/tests/test_source_evidence_chain_verifier.py');
const sourceEvidenceChainLauncher = readUtf8('verify_source_evidence_chain.ps1');
const sourceEvidenceChainBatch = readUtf8('驗證SEV證據鏈.bat');
const sourceEvidenceChainGuide = readUtf8('SOURCE_EVIDENCE_CHAIN_VERIFIER.md');
const attachmentPackageCheck = readUtf8('../結構工具箱/tools/attachment-package-check.js');
const attachmentPackageCheckTests = readUtf8('../結構工具箱/tools/attachment-package-check.test.js');
const attachmentPackageBuildTests = readUtf8('../結構工具箱/tools/attachment-package-build.test.js');
const attachmentPackageBuild = readUtf8('../結構工具箱/tools/attachment-package-build.js');
const attachmentPackageVerify = readUtf8('../結構工具箱/tools/attachment-package-verify.js');
const receiverKeyEnrollment = readUtf8('backend/app/receiver_key_enrollment.py');
const receiverKeyManager = readUtf8('backend/manage_receiver_key.py');
const receiverKeyLauncher = readUtf8('manage_receiver_key.ps1');
const receiverTrustStore = readUtf8('backend/app/receiver_trust_store.py');
const receiverTrustBackup = readUtf8('backend/app/receiver_trust_backup.py');
const receiverTrustRecovery = readUtf8('backend/app/receiver_trust_recovery.py');
const receiverTrustBackupCli = readUtf8('backend/backup_receiver_trust_registry.py');
const receiverTrustBackupLauncher = readUtf8('backup_receiver_trust_registry.ps1');
const receiverTrustHealthLauncher = readUtf8('check_receiver_trust_backup_health.ps1');
const receiverTrustStoreTests = readUtf8('backend/tests/test_receiver_trust_store.py');
const receiverTrustRecoveryTests = readUtf8('backend/tests/test_receiver_trust_recovery.py');
const receiverEvidenceTemplates = readUtf8('frontend/src/receiverEvidenceTemplates.ts');
const receiverEvidenceTemplateTests = readUtf8('receiver-evidence-templates.test.js');
const receiverEvidenceTemplateGuide = readUtf8('RECEIVER_EVIDENCE_TEMPLATES.md');
const receiverEvidenceTemplatePackage = readUtf8('backend/app/receiver_evidence_template_package.py');
const receiverEvidenceTemplateSigner = readUtf8('backend/sign_receiver_evidence_templates.py');
const receiverEvidenceTemplatePackageTests = readUtf8('backend/tests/test_receiver_evidence_template_package.py');
const receiverEvidenceTemplateSigningLauncher = readUtf8('sign_receiver_evidence_templates.ps1');

const expectedTools = [
  'excavation-analysis-import',
  'excavation-member-strength',
  'excavation-column-foundation',
  'excavation-report-governance',
  'excavation-service-data-governance',
];

assert(catalog.version === '1.22.0', 'excavation traceability catalog version', catalog.version);
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
  'SUPPORTED_RECEIPT_SCHEMA_VERSIONS',
  'verifiedCapacityTf',
  'expected_ratio = adopted_demand / verified_capacity',
  '"capacityValueFromReceiverDocument": True',
  'def _validated_capacity_evidence',
  'source-capacity-evidence-verification-record',
  'def build_source_capacity_evidence_verification',
  'def validate_source_capacity_evidence_verification',
  'def source_evidence_verification_fingerprint',
  'def build_source_evidence_identity_signing_request',
  'def validate_source_evidence_identity_signing_request',
  'def attach_source_evidence_identity_signature',
  'def verify_source_evidence_identity_signature',
  'source-evidence-verification-identity-signing-request',
  'source-evidence-verification-identity-signature-response',
  'source-evidence-verification-identity-signature-v1',
  '來源端證據核對紀錄的 RVR 文件受控欄位不一致',
  'SOURCE_EVIDENCE_VERIFICATION_FINGERPRINT_PREFIX',
  'per-ERT-document-metadata-and-sha256',
  'per-ERT-structured-model-combination-load-path-eccentricity-and-limit-states',
  'def _validated_receiver_verification_scope',
  'checkedLimitStates',
  'otherChecksStatus',
  'verificationScopeStructured',
  'capacityEvidenceFileNotEmbedded',
  '承載力文件 SHA-256 格式不正確',
  'adopted-demand-divided-by-verified-capacity',
  '來源構件、生命週期、控制軸力',
].forEach((needle) => {
  assert(removalTransferHandoff.includes(needle), `excavation removal transfer handoff keeps ${needle}`, needle);
});
[
  'excavation-reshore-member-capacity-calculation',
  'calculate_reshore_member_capacity',
  'allowable_axial_stress',
  'KL/r <= 200',
  'bf/(2tf) <= 25/sqrt(Fy)',
  '(d-2tf)/tw <= 68/sqrt(Fy)',
  'adoptableTransferCapacityTf',
  'pureAxialNoEccentricityOnly',
  'doesNotAutoApproveReceiverReceipt',
  'requiresSeparateOtherChecks',
  'otherChecksStatus',
  'contentBase64',
  'fileSha256',
].forEach((needle) => {
  assert(receiverCapacity.includes(needle), `excavation reshore capacity keeps ${needle}`, needle);
});
[
  'test_golden_short_column_capacity_and_evidence',
  'test_long_column_uses_euler_branch_and_fails_slenderness',
  'test_local_slenderness_failure_is_not_adoptable',
  'test_rejects_non_reshore_transfer',
  'test_rejects_tampered_handoff',
].forEach((needle) => {
  assert(receiverCapacityTests.includes(needle), `excavation reshore capacity tests keep ${needle}`, needle);
});
[
  '/api/projects/{project_id}/removal-transfer-handoff',
  '/api/projects/{project_id}/removal-transfer-receipts',
  '/api/projects/{project_id}/source-capacity-evidence-verifications',
  '/api/projects/{project_id}/source-capacity-evidence-verifications/signing-request',
  '/api/projects/{project_id}/source-capacity-evidence-verifications/attach-signature',
  '/api/projects/{project_id}/source-capacity-evidence-verifications/{verification_fingerprint}/validation',
  '/api/removal-transfer-handoffs/validate',
  '/api/removal-transfer-evidence-template-packages/validate',
  '/api/removal-transfer-receipts/build',
  '/api/removal-transfer-receipts/validate',
  '/api/removal-transfer-receipts/signing-request',
  '/api/removal-transfer-receipts/attach-signature',
  '/api/removal-transfer/reshore-member-capacity',
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
  'source_capacity_evidence_verifications',
  'BuildSourceEvidenceVerificationRequest',
  'CalculateReshoreMemberCapacityRequest',
  'BuildSourceEvidenceSigningRequestRequest',
  'AttachSourceEvidenceSignatureRequest',
  'calculation_fingerprint(project)',
].forEach((needle) => {
  assert(main.includes(needle), `excavation removal transfer API keeps ${needle}`, needle);
});
[
  'source_capacity_evidence_verifications',
  'validate_source_capacity_evidence_verification',
  'receipts_by_fingerprint',
].forEach((needle) => {
  assert(projectStore.includes(needle), `excavation project store keeps ${needle}`, needle);
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
  'handleCalculateReshoreMemberCapacity',
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
  '核定承載力（tf）',
  '重撐／回撐 H 型鋼純軸壓容量',
  '計算、下載證據並回填軸壓結果',
  '若要整列通過，須在五類補充查核中逐項附上正式文件',
  '容量利用率（需求／承載力，自動）',
  '結果與利用率會由後端自動判定',
  '舊版 RVR v1：容量利用率為接收端外部登錄值',
  '承載力文件編號',
  '證據檔 SHA-256',
  'crypto.subtle.digest("SHA-256"',
  '檔案只在瀏覽器本機計算雜湊，不會上傳或嵌入 RVR',
  'RVR v5：已逐列記錄五類補充查核的狀態、依據及證據檔 SHA-256',
  '正式分析模型／計算書識別',
  '控制載重組合',
  '傳力方向與分配依據',
  '偏心與二次效應依據',
  '五類補充查核彙整（自動）',
  '五類補充查核與文件證據',
  '此欄由下方五類查核自動推導，不能手動覆寫',
  'RSC 不會被當成其他查核的證據',
  '受控補充證據範本庫',
  '匯出全部範本',
  '匯入範本庫 JSON',
  '匯入組織簽章包',
  '此為匯入當下的來源驗證紀錄',
  '套用至全部同類列',
  '儲存為範本／新修訂',
  '套用本機範本',
  '本機審核人',
  '有效期限',
  '修訂紀錄',
  '撤銷核准',
  '外部核准一律降級',
  '請重新選取本案實際證據檔',
  'evidenceKey',
  'SourceCapacityEvidenceMatch',
  'handleSourceCapacityEvidenceFile',
  'sourceCapacityEvidenceAllMatched',
  'sourceCapacityEvidenceSatisfied',
  '(activeRemovalTransferReceipt?.schemaVersion ?? 0) >= 3',
  'createSourceCapacityEvidenceVerification',
  'handleCreateSourceEvidenceVerification',
  'handleDownloadSourceEvidenceSigningRequest',
  'handleAttachSourceEvidenceSignature',
  '下載 SEV 離線簽署請求',
  '匯入 SEV 離線簽章回應',
  'SEV 身分簽章',
  '建立、保存並下載 SEV',
  'SEV 核驗指紋',
  'fileSha256Hex',
  '接收端結果通過／證據檔待逐列比對',
  'SHA-256 不相符，不得視為同一證據檔',
  '只證明檔案位元相同，工程內容仍須人工審閱',
  '舊版 RVR v1／v2，沒有逐列承載力文件 SHA-256',
].forEach((needle) => {
  assert(app.includes(needle) || api.includes(needle), `excavation removal transfer frontend keeps ${needle}`, needle);
});
[
  'receiver-supplemental-evidence-template-library',
  'evidenceFileNameExcluded: true',
  'evidenceFileSha256Excluded: true',
  'actualEvidenceFileRequiredAfterApply: true',
  'governanceRequiredBeforeApply: true',
  'importedApprovalRequiresLocalReview: true',
  'publisherProvenanceIsInformational: true',
  'localApprovalStillRequiredAfterImport: true',
  'MAX_RECEIVER_EVIDENCE_TEMPLATES = 100',
  'MAX_RECEIVER_EVIDENCE_TEMPLATE_CHANGE_LOG = 50',
  '不得保存證據檔名或 SHA-256',
  'fileName: ""',
  'fileSha256: ""',
  'reviseReceiverEvidenceTemplate',
  'approveReceiverEvidenceTemplate',
  'revokeReceiverEvidenceTemplateApproval',
  'receiverEvidenceTemplateAvailability',
  'prepareImportedReceiverEvidenceTemplates',
  'prepareSignedImportedReceiverEvidenceTemplates',
  'verificationScope: "import-time-only"',
  'parseReceiverEvidenceTemplateLibrary',
  'mergeReceiverEvidenceTemplates',
].forEach((needle) => {
  assert(receiverEvidenceTemplates.includes(needle), `receiver evidence template contract keeps ${needle}`, needle);
});
[
  'template must not persist evidence fileName',
  'template must not persist evidence SHA-256',
  'applying a template requires a fresh evidence file selection',
  'applying a template cannot reuse a prior evidence hash',
  'content revision must revoke approval',
  'external approval cannot become local trust',
  'saving unchanged content must not create a false revision',
  'trusted publisher signature cannot bypass local approval',
  'plain JSON import must discard publisher provenance',
  'content revision must clear publisher provenance',
  'receiver evidence templates v3 signed publisher governance OK',
].forEach((needle) => {
  assert(receiverEvidenceTemplateTests.includes(needle), `receiver evidence template tests keep ${needle}`, needle);
});
[
  '範本明確不保存證據檔名及 SHA-256',
  '套用範本後',
  '重新選取本案實際文件',
  '只有經本機核准且尚未過期的範本可以套用',
  '外部檔案即使聲稱已核准，匯入後仍一律降級',
  '內容修訂會自動升版並撤銷核准',
  '發布者簽章只證明對應私鑰簽署了該範本庫',
  '匯入當下',
  '簽署補充證據範本包.bat',
  '不會寫入來源專案、PDF、DOCX、ERH、RVR、SEV 或 SCV',
].forEach((needle) => {
  assert(receiverEvidenceTemplateGuide.includes(needle), `receiver evidence template guide keeps ${needle}`, needle);
});
[
  'receiver-evidence-template-publisher-package',
  'receiver-evidence-template-publisher-package-v1',
  'valid-signature-untrusted-key',
  'valid-signature-revoked-key',
  'valid-signature-organization-mismatch',
  'trusted-signature-valid',
  'ETL-',
  'ETP-',
  'fileName',
  'fileSha256',
].forEach((needle) => {
  assert(receiverEvidenceTemplatePackage.includes(needle), `receiver template publisher package keeps ${needle}`, needle);
});
[
  'load_private_key',
  'build_receiver_evidence_template_publisher_package',
  '--organization',
  '--display-name',
].forEach((needle) => {
  assert(receiverEvidenceTemplateSigner.includes(needle), `receiver template publisher signer keeps ${needle}`, needle);
});
[
  'test_api_uses_local_trust_registry_and_rejects_tampering',
  'test_classifies_trusted_revoked_and_mismatched_keys',
  'test_rejects_evidence_filename_or_hash_anywhere_in_templates',
  'test_accepts_schema_v3_boundary_but_never_treats_signature_as_local_approval',
].forEach((needle) => {
  assert(receiverEvidenceTemplatePackageTests.includes(needle), `receiver template publisher tests keep ${needle}`, needle);
});
[
  'backend.sign_receiver_evidence_templates',
  'Ed25519 PEM private key',
].forEach((needle) => {
  assert(receiverEvidenceTemplateSigningLauncher.includes(needle), `receiver template publisher launcher keeps ${needle}`, needle);
});
[
  'test_builds_pending_receiver_verification_handoff',
  'test_rejects_tampered_transfer_content',
  'test_outside_scope_handoff_keeps_receiver_identity_pending',
  'test_rejects_source_member_that_did_not_pass_calculation',
  'test_validates_complete_external_receiver_receipt',
  'test_rejects_tampered_receiver_receipt',
  'test_rejects_incomplete_receiver_receipt',
  'test_v5_supplemental_check_failure_controls_overall_result',
  'test_v5_requires_evidence_for_each_passed_supplemental_check',
  'test_v5_derives_other_checks_status_and_sev_v2_covers_every_file',
  'test_v5_rejects_rsc_file_reused_as_supplemental_pass_evidence',
  'test_keeps_legacy_sev_v1_read_compatibility_for_pre_v5_receipt',
  'test_v5_rejects_legacy_sev_v1_partial_evidence_coverage',
  'test_v4_rejects_missing_structured_verification_scope',
  'test_rejects_passed_receipt_with_over_capacity_ratio',
  'test_keeps_legacy_v1_receipt_without_capacity_read_compatibility',
  'test_keeps_legacy_v3_handoff_with_v1_receipt_contract',
  'test_keeps_legacy_v3_handoff_with_v2_receipt_contract',
  'test_keeps_legacy_v2_receipt_without_document_evidence',
  'test_v2_rejects_capacity_ratio_mismatch',
  'test_v2_rejects_manual_status_override',
  'test_v3_rejects_tampered_capacity_evidence_hash',
  'test_v3_rejects_capacity_evidence_filename_path',
  'test_assistant_derives_failed_status_from_demand_and_capacity',
  'test_reuses_handoff_when_only_issue_time_changes',
  'test_builds_controlled_receiver_receipt_for_assistant',
  'test_builds_source_capacity_evidence_verification_record',
  'test_rejects_source_evidence_record_when_actual_hash_differs',
  'test_rejects_tampered_source_evidence_verification_record',
  'test_rejects_source_evidence_record_with_rewritten_rvr_metadata',
  'test_builds_and_attaches_source_evidence_offline_signature',
  'test_rejects_tampered_source_evidence_signing_request_and_signed_record',
  'test_assistant_rejects_missing_receiver_result',
  'test_builds_offline_signing_request_and_attaches_response',
  'test_rejects_tampered_signing_request_or_signature_response',
].forEach((needle) => {
  assert(removalTransferHandoffTests.includes(needle), `excavation removal transfer tests keep ${needle}`, needle);
});

[
  'validate_receiver_identity_signing_request',
  'validate_source_evidence_identity_signing_request',
  'Ed25519PrivateKey',
  'build_signature_response',
  'SOURCE_EVIDENCE_SIGNATURE_RESPONSE_KIND',
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
  'sign_receiver_request.ps1',
  'SEV identity signature response created',
].forEach((needle) => {
  assert(sourceEvidenceSigningLauncher.includes(needle), `excavation SEV signer launcher keeps ${needle}`, needle);
});
[
  'source-evidence-chain-verification-receipt',
  'def build_source_evidence_chain_verification_receipt',
  'def validate_source_evidence_chain_verification_receipt',
  'validate_receiver_trust_registry_backup',
  'verify_receiver_identity_signature',
  'verify_source_evidence_identity_signature',
  'eligible-trusted-identities',
  'manual-identity-review-required',
  'not-eligible-engineering-failed',
  'independentOfflineValidation',
  'noProjectDatabaseRequired',
  'noPrivateKeysRead',
  'doesNotRecalculateEngineeringCapacity',
  'doesNotConstituteEngineeringApproval',
  'receiptIsNotStandaloneProof',
  'requiresSourceFilesForRevalidation',
].forEach((needle) => {
  assert(sourceEvidenceChainVerifier.includes(needle), `excavation independent evidence-chain verifier keeps ${needle}`, needle);
});
[
  'test_signed_chain_with_valid_public_backup_is_eligible',
  'test_failed_receiver_engineering_result_is_not_eligible',
  'test_tampered_trust_registry_summary_is_rejected',
  'test_tampered_identity_result_is_rejected',
  'test_source_file_summary_rejects_path_disclosure',
  'test_cli_writes_independent_chain_receipt_without_database',
].forEach((needle) => {
  assert(sourceEvidenceChainVerifierTests.includes(needle), `excavation independent evidence-chain tests keep ${needle}`, needle);
});
[
  'backend.verify_source_evidence_chain',
  '--handoff',
  '--receipt',
  '--sev',
  '--trust-backup',
].forEach((needle) => {
  assert(sourceEvidenceChainLauncher.includes(needle), `excavation evidence-chain launcher keeps ${needle}`, needle);
});
[
  'verify_source_evidence_chain.ps1',
  'SEV evidence-chain verification receipt created',
].forEach((needle) => {
  assert(sourceEvidenceChainBatch.includes(needle), `excavation evidence-chain batch keeps ${needle}`, needle);
});
[
  'SCV 採用狀態',
  '不啟動開挖擋土支撐服務',
  '不讀取私人金鑰',
  '不構成工程核可',
  '99_內部追溯_勿附入主報告',
].forEach((needle) => {
  assert(sourceEvidenceChainGuide.includes(needle), `excavation evidence-chain guide keeps ${needle}`, needle);
});
[
  'excavationEvidenceMetadata',
  'analyzeExcavationEvidenceChains',
  'scv-source-file-hash-mismatch',
  'scv-fingerprint-link-mismatch',
  'unlinked-excavation-evidence-record',
  'evidenceChainLinks',
].forEach((needle) => {
  assert(attachmentPackageCheck.includes(needle), `attachment package check keeps excavation evidence-chain token ${needle}`, needle);
});
[
  'complete SCV source set',
  'unlinked-excavation-evidence-record',
].forEach((needle) => {
  assert(attachmentPackageCheckTests.includes(needle), `attachment package check tests keep ${needle}`, needle);
});
[
  'complete ERH/RVR/SEV/SCV chain',
  '99_內部追溯_勿附入主報告',
].forEach((needle) => {
  assert(attachmentPackageBuildTests.includes(needle), `attachment package build tests keep ${needle}`, needle);
});
[
  'evidenceChainExpected',
  'evidenceChainVerified',
].forEach((needle) => {
  assert(attachmentPackageVerify.includes(needle), `attachment package verifier keeps ${needle}`, needle);
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
  'receiver-trust-registry-recovery-drill-receipt',
  'write_receiver_trust_registry_backup',
  'validate_receiver_trust_registry_backup_file',
  'perform_receiver_trust_registry_recovery_drill',
  'validate_receiver_trust_recovery_drill_receipt',
  'isolated-temporary-registry',
  'productionRegistryUnchanged',
  'receiptFingerprint',
  'RDR-',
  '備份最長允許天數',
  'backup-health-ok',
  'rvr-backup-health-transition',
  'rvr-backup-health-history',
  'record_receiver_trust_backup_health_transition',
  'previousEventFingerprint',
  'eventFingerprint',
  'RBH-',
  'RVR-backup-health-event-',
].forEach((needle) => {
  assert(receiverTrustRecovery.includes(needle), `excavation receiver trust recovery keeps ${needle}`, needle);
});
[
  'backup-created-and-verified',
  'backup-valid',
  'recovery-drill-passed',
  'backup-cycle-passed',
  '--max-age-days',
  'productionRegistryUnchanged',
  'evaluate_receiver_trust_backup_directory',
  'history_parser',
  '--current-status',
  '--history-dir',
  '--dashboard-history',
  'record_receiver_trust_backup_health_transition',
  '_sanitized_health_history_result',
].forEach((needle) => {
  assert(receiverTrustBackupCli.includes(needle), `excavation receiver trust backup CLI keeps ${needle}`, needle);
});
[
  'ValidateSet("Cycle", "Backup", "Verify", "Drill")',
  'backend.backup_receiver_trust_registry',
  '--registry',
  '--max-age-days',
].forEach((needle) => {
  assert(receiverTrustBackupLauncher.includes(needle), `excavation receiver trust backup launcher keeps ${needle}`, needle);
});
[
  'RVR-backup-health-latest.json',
  'attention-required',
  'Get-ScheduledTaskInfo',
  'LastTaskResult',
  'Show-HealthAlert',
  'rvr-backup-health-history.json',
  'history-record-failed',
  'DashboardStatusMaxAgeHours',
  'statusMaxAgeHours = $DashboardStatusMaxAgeHours',
  'transition-recorded',
  '$historyTransition.toStatus -eq "attention-required"',
  '$historyTransition.fromStatus -eq "attention-required"',
  'RVR backup health recovered',
  '$ShowAlert -and $historyRecordFailed',
].forEach((needle) => {
  assert(receiverTrustHealthLauncher.includes(needle), `excavation receiver trust health launcher keeps ${needle}`, needle);
});
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
  'test_backup_cycle_restores_in_isolation_and_keeps_production_unchanged',
  'test_tampered_backup_cannot_create_drill_receipt',
  'test_backup_freshness_gate_rejects_stale_evidence',
  'test_backup_health_accepts_a_current_matching_evidence_pair',
  'test_backup_health_rejects_a_new_backup_without_matching_drill',
  'test_backup_health_rejects_stale_drill_receipt',
  'test_existing_backup_is_never_overwritten_or_deleted',
  'test_drill_receipt_tampering_is_detected',
  'test_health_history_records_only_state_or_issue_code_changes',
  'test_health_history_records_attention_recovery',
  'test_health_history_rejects_tampered_chain',
  'test_dashboard_health_history_excludes_private_evidence',
].forEach((needle) => {
  assert(receiverTrustRecoveryTests.includes(needle), `excavation receiver trust recovery tests keep ${needle}`, needle);
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
  'stage_force_cases',
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
  'stage_force_cases',
  'analysis_install_stage_index',
  'analysis_control_stage_index',
  'analysis_removal_stage_index',
  'removal_transfer_mode',
  'removal_transfer_target',
  'removal_transfer_direction',
  'removal_transfer_share_percent',
  'removal_transfer_additional_receivers',
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
  '拆撐後荷重處置必須填寫傳力方向或作用線',
  '尚未確認拆撐後荷重處置及其承接構造檢核邊界',
  '尚未確認控制分析階段與實際施工步驟的對應',
  '目前採用內力與控制分析階段軸力不一致',
].forEach((needle) => {
  assert(calculations.includes(needle), `excavation stage mapping calculation keeps ${needle}`, needle);
});
[
  'AnalysisMappingEditor',
  '施工階段軸力時序',
  '實際施工步驟',
  '階段對應依據',
  '分析生命週期',
  '確認本列安裝、控制內力與拆撐時序',
  '拆撐後荷重處置（必選）',
  '傳力方向／作用線（必填）',
  '新增承接對象',
  '承接分配合計',
  '確認拆撐後荷重處置、傳力方向及承接構造的另案檢核邊界',
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
  'report_document_metadata',
  '文件狀態：',
  'REPORT_TOOL_VERSION',
].forEach((needle) => {
  assert(reporting.includes(needle), `excavation reporting keeps ${needle}`, needle);
});

[
  'class ReportPayload',
  'class ProjectState',
  'class AnalysisImportResult',
  'class ColumnScenarioInput',
  'formula_id',
  'document_status',
  'approval_time',
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
  'approved: bool = False',
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
  '核可為正式附件',
  '未勾選時為可列印的內部審閱文件',
  '工程名稱、設計人員留空可由主文承接',
  '產出 PDF（',
  '產出 Word（',
  '本次 PDF／正式組包可見性證據',
  '下載 PDF＋證據組包來源套件',
  '可直接交給正式附件包管理器',
  '儲存、產生 PDF 並逐頁驗證',
  'setReportApproved(false)',
].forEach((needle) => {
  assert(app.includes(needle), `excavation frontend keeps ${needle}`, needle);
});

[
  'build_pdf_canonical_render_evidence',
  'canonical_evidence_url',
  'formal_source_bundle_url',
  '.canonical-render.evidence.json',
  '.formal-source.zip',
].forEach((needle) => {
  assert(main.includes(needle) || schemas.includes(needle), `excavation API keeps canonical PDF evidence token ${needle}`, needle);
});

[
  'attachment-canonical-render-evidence.v1',
  'rendered-page-ocr-text-layer-bigram-alignment',
  'rapidocr-onnxruntime',
  'minimumRequiredScore',
  'textLayerSha256',
  'ocrTextSha256',
  'build_pdf_formal_source_bundle',
  'FORMAL_SOURCE_BUNDLE_SUFFIX',
].forEach((needle) => {
  assert(pdfRenderEvidence.includes(needle), `excavation PDF evidence generator keeps ${needle}`, needle);
});
[
  'contains_only_exact_pdf_and_evidence_bytes',
  'rejects_pdf_changed_after_evidence',
  'rejects_mismatched_evidence_name_or_artifact',
  'never_overwrites_an_existing_transport_file',
].forEach((needle) => {
  assert(pdfRenderEvidenceTests.includes(needle), `excavation PDF source bundle tests keep ${needle}`, needle);
});
[
  'approved_pdf_response_exposes_single_source_bundle',
  'bundle_failure_removes_all_partial_formal_outputs',
  'download_boundary_allows_only_named_formal_source_zip',
].forEach((needle) => {
  assert(reportDeliveryApiTests.includes(needle), `excavation report delivery API tests keep ${needle}`, needle);
});
['pypdf==', 'pypdfium2==', 'rapidocr-onnxruntime=='].forEach((needle) => {
  assert(backendRequirements.includes(needle), `excavation backend pins PDF evidence dependency ${needle}`, needle);
});
[
  'canonicalRenderEvidenceRecord',
  '99_內部追溯_勿附入主報告',
].forEach((needle) => {
  assert(attachmentPackageBuild.includes(needle), `attachment package build keeps canonical evidence boundary ${needle}`, needle);
});

[
  'generateReport',
  'generateWordReport',
  '/api/projects/${projectId}/report',
  '/api/projects/${projectId}/report/docx',
  '&approved=${approved ? "true" : "false"}',
].forEach((needle) => {
  assert(api.includes(needle), `excavation API client keeps ${needle}`, needle);
});

[
  'build_removal_transfer_handoff',
  'build_receiver_verification_receipt',
  'build_source_capacity_evidence_verification',
  'build_source_evidence_chain_verification_receipt',
  'build_pdf_canonical_render_evidence',
  'build_pdf_formal_source_bundle',
  'attachment-package-manager-worker.js',
  'zip-direct-formal-package',
  '"inputKind"',
  'ocr-alignment-page-1-ocr-sha256',
  'attachment-package-build.js',
  'attachment-package-verify.js',
  'scv-source-file-hash-mismatch',
  '01_正式附件',
  '99_內部追溯_勿附入主報告',
  'len(manifest["formalAttachments"]), 1',
].forEach((needle) => {
  assert(attachmentEvidenceChainDrillTests.includes(needle), `excavation real attachment evidence-chain drill keeps ${needle}`, needle);
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
assert(
  preflight.includes('node 開挖擋土支撐/receiver-evidence-templates.test.js'),
  'excavation traceability gate runs receiver evidence template behavior tests',
  'receiver-evidence-templates.test.js'
);

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
assert(readme.includes('RECEIVER_EVIDENCE_TEMPLATES.md'), 'excavation README documents receiver evidence templates', 'README.md');

if (failed) {
  console.error(`\n${failed} excavation traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll excavation traceability contract checks passed.');
