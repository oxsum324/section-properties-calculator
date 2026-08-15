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

function assertPythonFunctionRole(source, functionName, role) {
  const marker = `def ${functionName}(`;
  const start = source.indexOf(marker);
  const nextRoute = start >= 0 ? source.indexOf('\n\n@app.', start + marker.length) : -1;
  const body = start >= 0 ? source.slice(start, nextRoute >= 0 ? nextRoute : source.length) : '';
  assert(
    start >= 0 && body.includes(`required_role="${role}"`),
    `excavation ${functionName} requires ${role}`,
    marker,
  );
}

const catalogText = fs.readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const launcher = readUtf8('index.html');
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
const receiverCapacityBenchmarkText = readUtf8('backend/tests/fixtures/reshore_biaxial_independent_benchmark.json');
const receiverCapacityBenchmark = JSON.parse(receiverCapacityBenchmarkText);
const receiverCapacity822BenchmarkText = readUtf8('backend/tests/fixtures/reshore_biaxial_independent_benchmark_822.json');
const receiverCapacity822Benchmark = JSON.parse(receiverCapacity822BenchmarkText);
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
const receiverOperatorAuth = readUtf8('backend/app/receiver_operator_auth.py');
const receiverOperatorBackup = readUtf8('backend/app/receiver_operator_backup.py');
const receiverOperatorRecovery = readUtf8('backend/app/receiver_operator_recovery.py');
const receiverGovernanceHealth = readUtf8('backend/app/receiver_governance_health.py');
const receiverGovernanceCheckpoint = readUtf8('backend/app/receiver_governance_checkpoint.py');
const receiverGovernanceCheckpointVerifier = readUtf8('backend/verify_receiver_governance_checkpoint.py');
const receiverGovernanceCheckpointVerifierLauncher = readUtf8('verify_receiver_governance_checkpoint.ps1');
const receiverGovernanceCheckpointVerifierBatch = readUtf8('驗證治理健康檢核點.bat');
const receiverGovernanceCheckpointVerifierGuide = readUtf8('GOVERNANCE_CHECKPOINT_VERIFIER.md');
const receiverGovernanceTimestamp = readUtf8('backend/receiver_governance_timestamp.py');
const receiverGovernanceTimestampTests = readUtf8('backend/tests/test_receiver_governance_timestamp.py');
const receiverGovernanceTimestampLauncher = readUtf8('receiver_governance_timestamp.ps1');
const receiverGovernanceTimestampPrepareBatch = readUtf8('建立治理檢核可信時間請求.bat');
const receiverGovernanceTimestampFinalizeBatch = readUtf8('完成治理檢核可信時間證據包.bat');
const receiverGovernanceTimestampVerifyBatch = readUtf8('驗證治理檢核可信時間證據包.bat');
const receiverGovernanceTimestampGuide = readUtf8('GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md');
const receiverGovernanceArchive = readUtf8('backend/receiver_governance_archive.py');
const receiverGovernanceArchiveTests = readUtf8('backend/tests/test_receiver_governance_archive.py');
const receiverGovernanceArchiveLauncher = readUtf8('receiver_governance_archive.ps1');
const receiverGovernanceArchivePrepareBatch = readUtf8('建立治理可信時間外部歸檔請求.bat');
const receiverGovernanceArchiveFinalizeBatch = readUtf8('完成治理可信時間外部歸檔證據包.bat');
const receiverGovernanceArchiveVerifyBatch = readUtf8('驗證治理可信時間外部歸檔證據包.bat');
const receiverGovernanceArchiveGuide = readUtf8('GOVERNANCE_TRUSTED_ARCHIVE.md');
const receiverGovernanceArchiveSchema = JSON.parse(readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json'));
const receiverGovernanceArchiveLifecycle = readUtf8('backend/receiver_governance_archive_lifecycle.py');
const receiverGovernanceArchiveLifecycleTests = readUtf8('backend/tests/test_receiver_governance_archive_lifecycle.py');
const receiverGovernanceArchiveLifecycleLauncher = readUtf8('receiver_governance_archive_lifecycle.ps1');
const receiverGovernanceArchiveLifecycleIssueBatch = readUtf8('簽發外部歸檔週期狀態收據.bat');
const receiverGovernanceArchiveLifecycleFinalizeBatch = readUtf8('建立外部歸檔生命週期檢查點.bat');
const receiverGovernanceArchiveLifecycleVerifyBatch = readUtf8('驗證外部歸檔生命週期檢查點.bat');
const receiverGovernanceArchiveLifecycleGuide = readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md');
const receiverGovernanceArchiveLifecycleSchema = JSON.parse(readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json'));
const receiverGovernanceArchiveLifecyclePortfolio = readUtf8('backend/receiver_governance_archive_lifecycle_portfolio.py');
const receiverGovernanceArchiveLifecyclePortfolioTests = readUtf8('backend/tests/test_receiver_governance_archive_lifecycle_portfolio.py');
const receiverGovernanceArchiveLifecyclePortfolioLauncher = readUtf8('receiver_governance_archive_lifecycle_portfolio.ps1');
const receiverGovernanceArchiveLifecyclePortfolioScanBatch = readUtf8('檢查多案件外部歸檔生命週期.bat');
const receiverGovernanceArchiveLifecyclePortfolioPublishBatch = readUtf8('建立多案件外部歸檔生命週期總覽快照.bat');
const receiverGovernanceArchiveLifecyclePortfolioVerifyBatch = readUtf8('驗證多案件外部歸檔生命週期總覽快照.bat');
const receiverGovernanceArchiveLifecyclePortfolioGuide = readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO.md');
const receiverGovernanceArchiveLifecyclePortfolioSchema = JSON.parse(readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json'));
const receiverGovernanceArchiveLifecycleMonitor = readUtf8('backend/receiver_governance_archive_lifecycle_monitor.py');
const receiverGovernanceArchiveLifecycleMonitorTests = readUtf8('backend/tests/test_receiver_governance_archive_lifecycle_monitor.py');
const receiverGovernanceArchiveLifecycleMonitorLauncher = readUtf8('receiver_governance_archive_lifecycle_monitor.ps1');
const receiverGovernanceArchiveLifecycleMonitorTaskManager = readUtf8('manage_receiver_governance_archive_lifecycle_monitor_task.ps1');
const receiverGovernanceArchiveLifecycleMonitorOnboarding = readUtf8('onboard_receiver_governance_archive_lifecycle_monitor.ps1');
const receiverGovernanceArchiveLifecycleMonitorCenter = readUtf8('receiver_governance_archive_lifecycle_monitor_center.ps1');
const receiverGovernanceArchiveLifecycleMonitorInstallBatch = readUtf8('安裝多案件外部歸檔生命週期每日監測.bat');
const receiverGovernanceArchiveLifecycleMonitorCenterBatch = readUtf8('開啟多案件生命週期監控管理中心.bat');
const receiverGovernanceArchiveLifecycleMonitorStatusBatch = readUtf8('檢查多案件外部歸檔生命週期監測排程.bat');
const receiverGovernanceArchiveLifecycleMonitorRemoveBatch = readUtf8('移除多案件外部歸檔生命週期每日監測.bat');
const receiverGovernanceArchiveLifecycleMonitorGuide = readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR.md');
const receiverGovernanceArchiveLifecycleMonitorSchema = JSON.parse(readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json'));
const receiverGovernanceArchiveLifecycleDashboardSchema = JSON.parse(readUtf8('GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json'));
const pagesArtifactBuilder = require('../結構工具箱/tools/build-pages-artifact.js');
const pagesLiveSmoke = readUtf8('../結構工具箱/tools/pages-live-smoke.js');
const rootGitignore = readUtf8('../.gitignore');
const receiverKeyManagementGuide = readUtf8('RECEIVER_KEY_MANAGEMENT.md');
const receiverTrustBackup = readUtf8('backend/app/receiver_trust_backup.py');
const receiverTrustRecovery = readUtf8('backend/app/receiver_trust_recovery.py');
const receiverTrustBackupCli = readUtf8('backend/backup_receiver_trust_registry.py');
const receiverTrustBackupLauncher = readUtf8('backup_receiver_trust_registry.ps1');
const receiverTrustHealthLauncher = readUtf8('check_receiver_trust_backup_health.ps1');
const receiverTrustStoreTests = readUtf8('backend/tests/test_receiver_trust_store.py');
const receiverOperatorAuthTests = readUtf8('backend/tests/test_receiver_operator_auth.py');
const receiverOperatorBackupTests = readUtf8('backend/tests/test_receiver_operator_backup.py');
const receiverOperatorRecoveryTests = readUtf8('backend/tests/test_receiver_operator_recovery.py');
const receiverGovernanceHealthTests = readUtf8('backend/tests/test_receiver_governance_health.py');
const receiverGovernanceCheckpointTests = readUtf8('backend/tests/test_receiver_governance_checkpoint.py');
const receiverGovernanceCheckpointVerifierTests = readUtf8('backend/tests/test_receiver_governance_checkpoint_verifier.py');
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

assert(catalog.version === '1.50.0', 'excavation traceability catalog version', catalog.version);
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
  'SCHEMA_VERSION = 3',
  'calculate_reshore_member_capacity',
  'allowable_axial_stress',
  'allowable_fbx',
  'allowable_fby',
  'interaction_components',
  'axial_biaxial_bending',
  'KL/r <= 200',
  'bf/(2tf) <= 25/sqrt(Fy)',
  '(d-2tf)/tw <= 68/sqrt(Fy)',
  'adoptableTransferCapacityTf',
  'capacityInteractionRatio',
  'interaction821Ratio',
  'interaction822Ratio',
  'interaction823Ratio',
  'governingInteractionEquation',
  'dominantBendingAxis',
  'capacityGoverningInteractionEquation',
  'pureAxialNoEccentricityOnly',
  'axialBiaxialBendingInteractionChecked',
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
  'test_biaxial_interaction_reduces_adoptable_transfer_capacity',
  'test_independent_biaxial_benchmark_matches_closed_form_reference',
  'test_biaxial_mode_requires_effects_and_engineering_basis',
  'test_rejects_non_reshore_transfer',
  'test_rejects_tampered_handoff',
].forEach((needle) => {
  assert(receiverCapacityTests.includes(needle), `excavation reshore capacity tests keep ${needle}`, needle);
});
assert(receiverCapacityBenchmark.kind === 'independent-engineering-benchmark', 'excavation reshore independent benchmark kind', receiverCapacityBenchmark.kind);
assert(receiverCapacityBenchmark.benchmarkId === 'EXC-RSC-BX-001', 'excavation reshore independent benchmark id', receiverCapacityBenchmark.benchmarkId);
assert(receiverCapacityBenchmark.independenceBoundary.includes('不呼叫 receiver_capacity.py'), 'excavation reshore independent benchmark excludes production helpers', receiverCapacityBenchmark.independenceBoundary);
assert(receiverCapacityBenchmark.codeBasis.length === 3, 'excavation reshore independent benchmark code basis count', receiverCapacityBenchmark.codeBasis.length);
assert(receiverCapacity822Benchmark.kind === 'independent-engineering-benchmark', 'excavation reshore 8.2-2 benchmark kind', receiverCapacity822Benchmark.kind);
assert(receiverCapacity822Benchmark.benchmarkId === 'EXC-RSC-BX-002', 'excavation reshore 8.2-2 benchmark id', receiverCapacity822Benchmark.benchmarkId);
assert(receiverCapacity822Benchmark.independenceBoundary.includes('不呼叫 receiver_capacity.py'), 'excavation reshore 8.2-2 benchmark excludes production helpers', receiverCapacity822Benchmark.independenceBoundary);
assert(receiverCapacity822Benchmark.calculationInput.allowable_stress_increase_factor === 1.25, 'excavation reshore 8.2-2 benchmark uses 1.25 factor', receiverCapacity822Benchmark.calculationInput.allowable_stress_increase_factor);
assert(receiverCapacity822Benchmark.expected.results.dominantBendingAxis === 'Y', 'excavation reshore 8.2-2 benchmark covers weak axis', receiverCapacity822Benchmark.expected.results.dominantBendingAxis);
assert(receiverCapacity822Benchmark.expected.results.governingInteractionEquation === '8.2-2', 'excavation reshore 8.2-2 benchmark controls current demand', receiverCapacity822Benchmark.expected.results.governingInteractionEquation);
assert(receiverCapacity822Benchmark.expected.results.capacityGoverningInteractionEquation === '8.2-2', 'excavation reshore 8.2-2 benchmark controls capacity root', receiverCapacity822Benchmark.expected.results.capacityGoverningInteractionEquation);
assert(readme.includes('EXC-RSC-BX-001'), 'excavation README documents reshore independent benchmark', 'EXC-RSC-BX-001');
assert(readme.includes('EXC-RSC-BX-002'), 'excavation README documents reshore 8.2-2 benchmark', 'EXC-RSC-BX-002');
[
  'interaction',
  'capacityRoot',
].forEach((key) => {
  assert(typeof receiverCapacityBenchmark.derivation[key] === 'string' && receiverCapacityBenchmark.derivation[key].length > 0, `excavation reshore independent benchmark derivation ${key}`, receiverCapacityBenchmark.derivation[key]);
  assert(typeof receiverCapacity822Benchmark.derivation[key] === 'string' && receiverCapacity822Benchmark.derivation[key].length > 0, `excavation reshore 8.2-2 benchmark derivation ${key}`, receiverCapacity822Benchmark.derivation[key]);
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
  'handleRequestReceiverKeyRotationCompletion',
  'handleApproveReceiverKeyRotationCompletion',
  '輪替申請待第二人覆核：新舊金鑰仍同時受信任',
  '建立 72 小時雙人覆核申請',
  '覆核通過並撤銷舊金鑰',
  '本機登入可驗證同一服務資料庫中的帳號與角色',
  'SQLite 交易鎖與唯一待審約束',
  '此申請沒有可同時驗證的登入帳號 ID 與 SQLite 交易紀錄',
  'handleDownloadReceiverTrustRegistryBackup',
  'handleImportReceiverTrustRegistryBackup',
  'handleRestoreReceiverTrustRegistryBackup',
  '下載目前信任清冊備份',
  '驗證／預覽清冊備份',
  '確認復原已驗證備份',
  '此備份不得復原',
  '交接完成不等於承接構造合格',
  '核定承載力（tf）',
  '重撐／回撐 H 型鋼構件容量',
  '軸壓＋雙向彎矩互制',
  '主要彎曲方向',
  '目前需求控制式',
  '容量根控制式',
  '計算、下載證據並回填構件結果',
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
  'complete_rotation',
  'request_rotation_completion',
  'approve_rotation_completion',
  'ROTATION_APPROVAL_WINDOW_HOURS',
  'RLock',
  'rotation-completion-requested',
  'approvalRequestFingerprint',
  'rotationApprovalRequestFingerprint',
  'replacedByKeyId',
  'rotationCompletionEventFingerprint',
  'relatedKeyId',
  '輪替完成已改為兩階段流程',
  '輪替覆核人必須與申請人不同',
  '同一輪替完成申請不得被重複覆核執行',
].forEach((needle) => {
  assert(receiverTrustStore.includes(needle), `excavation receiver trust store keeps ${needle}`, needle);
});
[
  'class ReceiverOperatorStore',
  'hashlib.scrypt',
  'RECEIVER_SESSION_COOKIE',
  'LOGIN_FAILURE_LIMIT = 5',
  'BEGIN IMMEDIATE',
  'receiver_rotation_one_pending_per_new_key',
  "approved_by_operator_id <> requested_by_operator_id",
  'receiver-key-admin',
  'receiver-key-requester',
  'receiver-key-approver',
  'password_reset_required',
  'receiver_operator_audit_events',
  'receiver_operator_audit_no_update',
  'receiver_operator_audit_no_delete',
  'operator-roles-changed',
  'operator-password-reset',
  'operator-password-changed',
  'blockedPendingRotationClaims',
  'receiver_operator_maintenance',
  'operator-governance-restored',
  'operator-governance-backup-exported',
  'receiver_backup_disposition_claims',
  'operator-backup-disposition-requested',
  'operator-backup-disposition-approved',
  'operator-backup-disposition-completed',
  'create_backup_disposition_request',
  'prepare_backup_disposition_approval',
  'reserve_backup_disposition_completion',
  'complete_backup_disposition',
  'expected_current_snapshot',
  '"receiver-key-requester": "治理申請人"',
  '"receiver-key-approver": "治理覆核人"',
].forEach((needle) => {
  assert(receiverOperatorAuth.includes(needle), `excavation receiver operator auth keeps ${needle}`, needle);
});
[
  '/api/receiver-operator-auth/session',
  '/api/receiver-operator-auth/bootstrap',
  '/api/receiver-operator-auth/login',
  '/api/receiver-operator-auth/logout',
  '/api/receiver-operators',
  '/api/receiver-operator-auth/change-password',
  '/api/receiver-operator-audit-events',
  '/api/receiver-operator-governance-backups/export',
  '/api/receiver-operator-governance-backups/validate',
  '/api/receiver-operator-governance-backups/restore',
  '/api/receiver-operator-governance-backups/inventory',
  '/api/receiver-operator-governance-backups/drill',
  '/api/receiver-operator-governance-backups/disposition-requests',
  '/roles',
  '/status',
  '/password-reset',
  'required_role="receiver-key-requester"',
  'required_role="receiver-key-approver"',
  'authorizationState',
  'missing-claim',
  'allow_origins=settings.cors_origins',
].forEach((needle) => {
  assert(main.includes(needle), `excavation receiver operator API keeps ${needle}`, needle);
});
[
  'list_receiver_operators',
  'create_receiver_operator',
  'update_receiver_operator_roles',
  'set_receiver_operator_status',
  'reset_receiver_operator_password',
  'list_receiver_operator_audit_events',
  'export_receiver_operator_governance_backup',
  'list_receiver_operator_governance_backup_inventory',
  'validate_receiver_operator_governance_backup',
  'restore_receiver_operator_governance',
  'drill_receiver_operator_governance_backup',
  'register_receiver_trust_key',
  'register_receiver_trust_key_enrollment',
  'revoke_receiver_trust_key',
  'export_receiver_trust_registry_backup',
  'validate_receiver_trust_registry_backup',
  'restore_receiver_trust_registry',
].forEach((functionName) => assertPythonFunctionRole(main, functionName, 'receiver-key-admin'));
[
  'request_receiver_key_rotation_completion',
  'request_receiver_operator_governance_backup_disposition',
].forEach((functionName) => assertPythonFunctionRole(main, functionName, 'receiver-key-requester'));
[
  'approve_receiver_key_rotation_completion',
  'approve_receiver_operator_governance_backup_disposition',
].forEach((functionName) => assertPythonFunctionRole(main, functionName, 'receiver-key-approver'));
[
  'X-CSRF-Token',
  'credentials: "same-origin"',
  'getReceiverOperatorSession',
  'bootstrapReceiverOperator',
  'loginReceiverOperator',
  'createReceiverOperator',
  'updateReceiverOperatorRoles',
  'setReceiverOperatorDisabled',
  'resetReceiverOperatorPassword',
  'changeReceiverOperatorPassword',
  'listReceiverOperatorAuditEvents',
  'exportReceiverOperatorGovernanceBackup',
  'validateReceiverOperatorGovernanceBackup',
  'restoreReceiverOperatorGovernanceBackup',
  'listReceiverOperatorGovernanceRecoveryInventory',
  'drillReceiverOperatorGovernanceBackup',
  'requestReceiverOperatorBackupDisposition',
  'approveReceiverOperatorBackupDisposition',
].forEach((needle) => {
  assert(api.includes(needle), `excavation frontend receiver auth keeps ${needle}`, needle);
});
[
  'test_http_boundary_requires_session_csrf_role_and_restricts_cors',
  'test_bootstrap_hashes_password_and_creates_csrf_protected_session',
  'test_authenticated_event_without_sqlite_claim_is_visible_but_cannot_be_approved',
  'test_roles_are_enforced_and_login_is_rate_limited',
  'test_bootstrap_and_pending_rotation_claims_are_unique_across_store_instances',
  'test_parallel_database_approvals_allow_one_completion',
  'test_account_lifecycle_revokes_access_blocks_pending_claims_and_keeps_audit_chain',
  'test_http_password_reset_requires_change_before_admin_actions',
].forEach((needle) => {
  assert(receiverOperatorAuthTests.includes(needle), `excavation receiver operator tests keep ${needle}`, needle);
});
[
  'RECEIVER_OPERATOR_BACKUP_KIND',
  'AESGCM',
  'Scrypt',
  '_KDF_N = 2**15',
  'receiver_operator_snapshot_fingerprint',
  'RECEIVER_OPERATOR_BACKUP_PAYLOAD_KIND',
  'backup_schema_version = 3 if history is not None',
  'governanceHealthObservationCount',
  'governanceHealthHeadFingerprint',
  '_decrypt_receiver_operator_governance_backup_payload',
  '備份 GHR 歷程不是目前健康收據鏈的相同內容或向前延伸',
  'preview_receiver_operator_governance_restore',
  'restore_receiver_operator_governance_backup',
  'receiver_operator_governance_backups',
  'secrets.token_hex(4)',
].forEach((needle) => {
  assert(receiverOperatorBackup.includes(needle), `excavation receiver operator backup keeps ${needle}`, needle);
});
[
  'test_encrypted_backup_hides_credentials_accounts_and_runtime_sessions',
  'test_legacy_v1_backup_remains_readable_after_disposition_claim_upgrade',
  'test_wrong_passphrase_and_ciphertext_tampering_fail_closed',
  'test_restore_requires_backup_admin_credential_safeguards_current_state_and_revokes_sessions',
  'test_failed_transaction_rolls_back_data_sessions_and_maintenance_unlock',
  'test_restore_aborts_when_governance_changes_after_preview',
  'test_restore_rejects_history_rollback_and_identical_snapshot',
  'test_http_backup_restore_requires_admin_csrf_and_logs_out_restored_session',
  'test_v3_backup_encrypts_governance_health_history_and_binds_summary',
  'test_v3_restore_recovers_history_and_safeguards_replaced_local_chain',
  'test_v3_restore_accepts_history_forward_extension_and_rejects_rollback',
  'test_v3_restore_aborts_if_health_history_changes_after_preview',
  'test_legacy_v2_restore_preserves_local_health_history',
].forEach((needle) => {
  assert(receiverOperatorBackupTests.includes(needle), `excavation receiver operator backup tests keep ${needle}`, needle);
});
[
  'receiver-operator-governance-recovery-drill-receipt',
  'receiver-operator-governance-backup-disposition-receipt',
  'write_managed_receiver_operator_governance_backup',
  'list_receiver_operator_governance_recovery_inventory',
  'perform_receiver_operator_governance_recovery_drill',
  'request_receiver_operator_backup_disposition',
  'approve_receiver_operator_backup_disposition',
  'validate_receiver_operator_backup_disposition_receipt',
  'isolated-temporary-sqlite',
  'productionGovernanceUnchangedDuringDrill',
  'governanceHealthHistoryIncluded',
  'isolatedRestoredHealthHistoryValid',
  'isolatedRestoredHealthObservationCount',
  'isolatedRestoredHealthHeadFingerprint',
  'secureEraseGuaranteed',
  'latest-backup-not-drilled',
  'latest-backup-missing-governance-health-history',
  'latest-drill-missing-governance-health-history-proof',
  'explicit-two-person-approved-expired-backup-disposition',
  'ordinaryFilesystemEntryRemovalOnly',
  'otherCopiesMayRemain',
  'caseReferenceSha256',
  'basisSha256',
  'RBR-',
  'RBD-',
  'ROD-',
].forEach((needle) => {
  assert(receiverOperatorRecovery.includes(needle), `excavation receiver operator recovery keeps ${needle}`, needle);
});
[
  'test_managed_backup_inventory_tracks_retention_without_exposing_secrets',
  'test_legacy_managed_backup_is_not_healthy_without_ghr_coverage',
  'test_isolated_drill_uses_real_restore_login_and_keeps_production_unchanged',
  'test_inventory_marks_expiry_and_surfaces_invalid_files',
  'test_failed_drill_writes_no_receipt_and_tampered_receipt_is_rejected',
  'test_http_managed_export_inventory_and_drill_require_admin_csrf',
  'test_expired_backup_disposition_requires_different_reviewer_and_writes_receipt',
  'test_disposition_claim_is_preserved_by_governance_backup_and_tampering_is_rejected',
  'test_interrupted_disposition_can_resume_without_duplicate_receipt',
  'test_http_disposition_requires_csrf_roles_and_different_operator',
].forEach((needle) => {
  assert(receiverOperatorRecoveryTests.includes(needle), `excavation receiver operator recovery tests keep ${needle}`, needle);
});
[
  'receiverOperatorGovernancePermissionRows',
  '{ value: "receiver-key-requester", label: "治理申請人" }',
  '{ value: "receiver-key-approver", label: "治理覆核人" }',
  '治理權限矩陣（唯讀）',
  '管理員角色不會自動取得治理申請或治理覆核權限',
  '提出金鑰輪替完成及到期備份處置申請',
  '第二人覆核輪替完成及到期備份處置',
  'operator ID 必須與申請者不同',
  '本矩陣只供 HTML 操作頁核對，不會寫入 PDF／DOCX 計算書',
  'receiverOperatorEffectivePermissions',
  '目前登入帳號有效權限',
  '依後端工作階段回傳的穩定角色 ID 與臨時密碼狀態即時計算',
  'state === "active" ? "有效" : state === "suspended" ? "暫停" : "未授權"',
  '此帳號已配置的角色目前全部暫停',
  '後端仍禁止覆核自己提出的申請',
  '身分保證邊界：',
  '本摘要只供 HTML 操作頁核對，不取代後端逐項授權，也不會寫入 PDF／DOCX 計算書',
  '治理分權健康摘要',
  '不同帳號雙人流程',
  '專責角色分離',
  '目前不可覆核',
  '目前沒有待覆核 claim；此狀態不代表曾有案件且已完成覆核',
  '本摘要由後端依受驗證帳號治理快照、信任清冊與 claim 狀態計算',
  '快照追溯與一致性邊界',
  'healthFingerprint',
  'operatorGovernanceSnapshotFingerprint',
  'trustRegistryFingerprint',
  '兩者不是跨儲存體原子交易',
  '目前不可覆核案件',
  '每次實際申請或覆核仍由後端重新驗證',
  '本摘要與狀態歷程只供 HTML 管理頁核對，不會寫入 PDF／DOCX 計算書',
  '目前快照已寫入歷程鏈',
  '來源已變動，尚未形成目前快照收據',
  '治理健康狀態歷程',
  '下載完整歷程 JSON',
  '匯入並驗證歷程 JSON',
  '匯入歷程驗證通過',
  '不是外部時間戳、數位簽章',
  '下載外部簽章請求',
  '匯入簽章檢核點',
  '外部簽章檢核點可錨定目前歷程',
  '相同、延伸、落後或分叉',
  '不是第三方外部時間戳',
  '兩種角色同時適用於金鑰輪替及到期備份處置',
  '受管制備份與復原演練清冊',
  '提出雙人處置申請',
  '第二人覆核到期備份處置',
  '覆核通過、移除受管制副本並產生 RBD 收據',
  '一般檔案系統項目移除，不是安全抹除',
  '執行隔離復原演練（不改正式資料）',
  '其他副本仍可能存在',
  '演練與處置收據不保存加密密碼、登入密碼、帳號名稱或伺服器路徑',
  'v3 備份會把帳號、角色、加鹽密碼驗證值',
  'GHR 歷程數（目前 → 備份）',
  'GHR 復原方式',
  '舊版備份未涵蓋 GHR 歷程',
  '復原後狀態收據',
].forEach((needle) => {
  assert(app.includes(needle), `excavation operator recovery UI keeps ${needle}`, needle);
});
[
  'build_receiver_governance_health_snapshot',
  'single-sqlite-read-transaction',
  'single-validated-json-snapshot',
  '"crossStoreAtomic": False',
  'authorizationRevalidatedPerOperation',
  'receiver_operator_snapshot_fingerprint',
  'receiver_trust_registry_fingerprint',
  'missing-or-nonpending-trust-registry-event',
  'no-distinct-active-approver',
  'RGH-',
  'build_receiver_governance_health_history_export',
  'validate_receiver_governance_health_history_export',
  'GHE-',
  '分權完整',
  '可執行但角色重疊',
  '需要處理',
].forEach((needle) => {
  assert(receiverGovernanceHealth.includes(needle), `excavation governance health backend keeps ${needle}`, needle);
});
[
  'CHECKPOINT_SIGNING_REQUEST_KIND',
  'CHECKPOINT_SIGNATURE_RESPONSE_KIND',
  'receiver-governance-health-checkpoint-v1',
  'build_receiver_governance_checkpoint_signing_request',
  'validate_receiver_governance_checkpoint_signing_request',
  'validate_receiver_governance_signed_checkpoint',
  'verify_receiver_governance_checkpoint_against_current',
  'current-matches-checkpoint',
  'current-extends-checkpoint',
  'current-behind-checkpoint',
  'current-diverged-from-checkpoint',
  'GCR',
  'GHC',
  'externalStorageVerified',
  'formalCalculationAttachment',
  'Key ID 對應的完整公鑰與信任清冊不一致',
].forEach((needle) => {
  assert(receiverGovernanceCheckpoint.includes(needle), `excavation governance signed checkpoint keeps ${needle}`, needle);
});
[
  'receiver-governance-checkpoint-verification-receipt',
  'def build_receiver_governance_checkpoint_verification_receipt',
  'def validate_receiver_governance_checkpoint_verification_receipt',
  'validate_receiver_governance_signed_checkpoint',
  'validate_receiver_trust_registry_backup',
  'validate_receiver_governance_health_history_export',
  'compare_receiver_governance_checkpoint_history',
  'independentOfflineValidation',
  'noServiceRequired',
  'noProjectDatabaseRequired',
  'noPrivateKeysRead',
  'doesNotVerifyExternalStorage',
  'doesNotProvideExternalTimestamp',
  'trustRegistrySnapshotDoesNotProveTrustAtSignedAt',
  'verificationReceiptIsNotStandaloneProof',
  'requiresSourceFilesForRevalidation',
  'formalCalculationAttachment',
  'trusted-anchor-for-provided-history',
  'not-anchor-for-provided-history',
  'def _read_json_with_summary',
  'GCV 輸出路徑不得覆寫任何來源檔案',
  'GCV 輸出檔已存在',
  'GCV-',
].forEach((needle) => {
  assert(receiverGovernanceCheckpointVerifier.includes(needle), `excavation independent governance checkpoint verifier keeps ${needle}`, needle);
});
[
  '-m',
  'backend.verify_receiver_governance_checkpoint',
  '--checkpoint',
  '--trust-backup',
  '--current-history',
].forEach((needle) => {
  assert(receiverGovernanceCheckpointVerifierLauncher.includes(needle), `excavation governance checkpoint verifier launcher keeps ${needle}`, needle);
});
assert(receiverGovernanceCheckpointVerifierBatch.includes('verify_receiver_governance_checkpoint.ps1'), 'excavation governance checkpoint verifier batch invokes PowerShell launcher', 'verify_receiver_governance_checkpoint.ps1');
[
  '不啟動開挖擋土支撐服務',
  '不連接專案資料庫',
  '不讀取私人金鑰',
  'GCV 是重新驗證結果，不是可脫離來源檔使用的單獨證明',
  '使用同一份 bytes 解析內容並計算 SHA-256',
  '不能反推它在自陳簽署時間已受信任',
  'RFC 3161',
].forEach((needle) => {
  assert(receiverGovernanceCheckpointVerifierGuide.includes(needle), `excavation governance checkpoint verifier guide keeps ${needle}`, needle);
});
[
  'receiver-governance-checkpoint-rfc3161-archive-manifest',
  'receiver-governance-checkpoint-rfc3161-verification-receipt',
  'receiver-governance-checkpoint-rfc3161-archive-v1',
  'def build_archive_manifest',
  'def validate_archive_manifest',
  'def prepare_timestamp_request',
  'def finalize_timestamp_package',
  'def verify_timestamp_package',
  'timestampBindsManifestAndReferencedFileHashes',
  'timestampEstablishesExistenceByGenTimeOnlyWhenTsaTrustAndPolicyAreAccepted',
  'tsaTrustAnchorIsUserSelected',
  'tsaRevocationStatusNotEstablished',
  'noPrivateKeysAcceptedOrRetained',
  'privateKeyMaterialRejected',
  'doesNotVerifyExternalStorage',
  'doesNotConstituteEngineeringApproval',
  'formalCalculationAttachment',
  'GAM-',
  'GTV-',
  '"ts", "-query"',
  '"ts", "-verify", "-queryfile"',
  '"ts", "-verify", "-data"',
  'TemporaryDirectory(prefix="ghc-rfc3161-")',
  'def _assert_closed_directory',
  '重複可攜式檔名或子資料夾',
].forEach((needle) => {
  assert(receiverGovernanceTimestamp.includes(needle), `excavation RFC 3161 governance timestamp keeps ${needle}`, needle);
});
[
  'backend.receiver_governance_timestamp',
  '--openssl',
  'prepare',
  'finalize',
  'verify',
  '--verification-receipt',
  '--timestamp-response',
  '--trust-anchor',
].forEach((needle) => {
  assert(receiverGovernanceTimestampLauncher.includes(needle), `excavation RFC 3161 launcher keeps ${needle}`, needle);
});
assert(receiverGovernanceTimestampPrepareBatch.includes('-Mode Prepare'), 'excavation RFC 3161 prepare batch selects prepare mode', '-Mode Prepare');
assert(receiverGovernanceTimestampFinalizeBatch.includes('-Mode Finalize'), 'excavation RFC 3161 finalize batch selects finalize mode', '-Mode Finalize');
assert(receiverGovernanceTimestampVerifyBatch.includes('-Mode Verify'), 'excavation RFC 3161 verify batch selects verify mode', '-Mode Verify');
[
  '本工具不內建或暗中呼叫任何 TSA',
  '查詢 nonce',
  'GAM 實際 bytes',
  '本工具不查詢 OCSP／CRL',
  '不證明內容在該時間已完成工程核可',
  '不證明檔案已存入異地',
  '不得進入 PDF／DOCX 計算書',
].forEach((needle) => {
  assert(receiverGovernanceTimestampGuide.includes(needle), `excavation RFC 3161 guide keeps ${needle}`, needle);
});
[
  'test_prepare_revalidates_gcv_and_builds_closed_sha256_nonce_query',
  'test_real_rfc3161_round_trip_and_complete_package_reverification',
  'test_unrelated_query_response_and_wrong_trust_anchor_fail_closed',
  'must-not-be-created.sqlite3',
  'mixed-private-material.pem',
  'extra.txt',
].forEach((needle) => {
  assert(receiverGovernanceTimestampTests.includes(needle), `excavation RFC 3161 tests keep ${needle}`, needle);
});
[
  'governance-trusted-timestamp-external-archive-request',
  'governance-trusted-timestamp-external-archive-provider-receipt',
  'governance-trusted-timestamp-external-archive-verification-receipt',
  'closed-flat-zip-stored-v1',
  'def prepare_archive_request',
  'def issue_archive_provider_receipt',
  'def finalize_archive_verification_package',
  'def verify_archive_verification_package',
  'providerSignedReceiptIsAttestationNotIndependentObservation',
  'doesNotQueryCurrentExternalRepositoryState',
  'providerKeyApprovalEvidenceContentIsNotInterpreted',
  'requiresExplicitProviderKeyApproval',
  'versioningOrLocalCopyAloneDoesNotSatisfyWorm',
  'noPrivateKeyCredentialInputsAcceptedByFinalizeOrVerify',
  'recognizablePrivateKeyFilesAndPemMaterialRejected',
  'formalCalculationAttachment',
  'worm-compliance',
  'worm-governance',
  'retention-lock',
  'GAD-',
  'GAP-',
  'GAR-',
  'GAV-',
  'zipfile.ZIP_STORED',
  'GAP 不得包含 ZIP comment 或尾隨資料',
  '核定證據必須是獨立文件',
  'Ed25519PublicKey',
].forEach((needle) => {
  assert(receiverGovernanceArchive.includes(needle), `excavation external archive receipt keeps ${needle}`, needle);
});
[
  'backend.receiver_governance_archive',
  '--openssl',
  'prepare',
  'finalize',
  'verify',
  '--gtv-package',
  '--retention-policy-id',
  '--provider-receipt',
  '--provider-public-key',
  '--provider-key-approval-evidence',
  '--provider-key-approval-basis',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLauncher.includes(needle), `excavation external archive launcher keeps ${needle}`, needle);
});
assert(receiverGovernanceArchivePrepareBatch.includes('-Mode Prepare'), 'excavation external archive prepare batch selects prepare mode', '-Mode Prepare');
assert(receiverGovernanceArchiveFinalizeBatch.includes('-Mode Finalize'), 'excavation external archive finalize batch selects finalize mode', '-Mode Finalize');
assert(receiverGovernanceArchiveVerifyBatch.includes('-Mode Verify'), 'excavation external archive verify batch selects verify mode', '-Mode Verify');
[
  'test_real_gtv_archive_round_trip_and_independent_reverification',
  'test_policy_shortfall_wrong_key_and_signature_tampering_fail_closed',
  'test_compressed_zip_private_material_and_missing_openssl_are_rejected',
  'must-not-be-created.sqlite3',
  'extra.txt',
  'wrong-public.pem',
].forEach((needle) => {
  assert(receiverGovernanceArchiveTests.includes(needle), `excavation external archive tests keep ${needle}`, needle);
});
[
  '不會自行上傳',
  '實際入庫後',
  '版本控制、備份、唯讀檔案',
  '不會獨立觀察物件目前是否仍存在',
  '不得進入 PDF／DOCX 計算書',
].forEach((needle) => {
  assert(receiverGovernanceArchiveGuide.includes(needle), `excavation external archive guide keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveSchema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'excavation external archive schema draft', receiverGovernanceArchiveSchema.$schema);
assert(receiverGovernanceArchiveSchema.$defs.archiveRequest.properties.kind.const === 'governance-trusted-timestamp-external-archive-request', 'excavation external archive schema keeps GAD kind', receiverGovernanceArchiveSchema.$defs.archiveRequest.properties.kind.const);
assert(receiverGovernanceArchiveSchema.$defs.providerReceipt.properties.kind.const === 'governance-trusted-timestamp-external-archive-provider-receipt', 'excavation external archive schema keeps GAR kind', receiverGovernanceArchiveSchema.$defs.providerReceipt.properties.kind.const);
assert(receiverGovernanceArchiveSchema.$defs.providerReceipt.properties.signature.properties.algorithm.const === 'Ed25519', 'excavation external archive schema keeps Ed25519 signature', 'Ed25519');
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation external archive schema is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json'"),
  'excavation external archive schema has a live private-boundary probe',
  'HTTP status must not be 200',
);
[
  'def issue_lifecycle_provider_status',
  'def finalize_lifecycle_checkpoint_package',
  'def verify_lifecycle_checkpoint_package',
  'def assess_lifecycle_checkpoint',
  'providerStatusRequiresActualRepositoryObservation',
  'providerSignedStatusIsAttestationNotIndependentObservation',
  'standaloneCheckpointJsonIsNotCompleteEvidence',
  'packageVerificationRequiredForGovernedCurrentAssessment',
  'historicalIntegrityRemainsVerifiableAfterReviewDue',
  'providerKeyRotationRequiresNewIndependentApprovalEvidence',
  'noPrivateKeyCredentialInputsAcceptedByFinalizeOrVerify',
  'formalCalculationAttachment',
  'current',
  'review-due',
  'blocked',
  'retention-expired',
  'periodic-review-due',
  'retention-renewal-window',
  'GSR-',
  'GSC-',
  'zipfile.ZIP_STORED',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycle.includes(needle), `excavation archive lifecycle keeps ${needle}`, needle);
});
[
  'backend.receiver_governance_archive_lifecycle',
  'issue-status',
  'finalize-checkpoint',
  'verify-checkpoint',
  '--review-interval-days',
  '--maximum-observation-age-hours',
  '--retention-warning-days',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleLauncher.includes(needle), `excavation archive lifecycle launcher keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleIssueBatch.includes('-Mode IssueStatus'), 'excavation lifecycle issue batch selects IssueStatus', '-Mode IssueStatus');
assert(receiverGovernanceArchiveLifecycleFinalizeBatch.includes('-Mode Finalize'), 'excavation lifecycle finalize batch selects Finalize', '-Mode Finalize');
assert(receiverGovernanceArchiveLifecycleVerifyBatch.includes('-Mode Verify'), 'excavation lifecycle verify batch selects Verify', '-Mode Verify');
[
  'test_rotated_key_round_trip_schema_windows_and_lifecycle_exit_codes',
  'test_negative_or_stale_provider_status_fails_closed',
  'test_wrong_key_private_material_tamper_and_hostile_zip_are_rejected',
  'returncode, 2',
  'returncode, 3',
  'unexpected.txt',
  'ZIP_DEFLATED',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleTests.includes(needle), `excavation archive lifecycle tests keep ${needle}`, needle);
});
[
  '實際重新查詢',
  '歷史完整性',
  'current',
  'review-due',
  'blocked',
  '金鑰輪替',
  '不得進入 PDF／DOCX 計算書',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleGuide.includes(needle), `excavation archive lifecycle guide keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleSchema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'excavation archive lifecycle schema draft', receiverGovernanceArchiveLifecycleSchema.$schema);
assert(receiverGovernanceArchiveLifecycleSchema.$defs.providerStatus.properties.kind.const === 'governance-trusted-timestamp-external-archive-lifecycle-provider-status', 'excavation archive lifecycle schema keeps GSR kind', receiverGovernanceArchiveLifecycleSchema.$defs.providerStatus.properties.kind.const);
assert(receiverGovernanceArchiveLifecycleSchema.$defs.lifecycleCheckpoint.properties.kind.const === 'governance-trusted-timestamp-external-archive-lifecycle-checkpoint', 'excavation archive lifecycle schema keeps GSC kind', receiverGovernanceArchiveLifecycleSchema.$defs.lifecycleCheckpoint.properties.kind.const);
assert(receiverGovernanceArchiveLifecycleSchema.$defs.signature.properties.algorithm.const === 'Ed25519', 'excavation archive lifecycle schema keeps Ed25519 signature', 'Ed25519');
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation archive lifecycle schema is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json'"),
  'excavation archive lifecycle schema has a live private-boundary probe',
  'HTTP status must not be 200',
);
[
  'verify_lifecycle_checkpoint_package',
  'invalidPackagesCannotBeMaskedByOlderValidPackages',
  'sameTimeConflictingLatestCheckpointsBlockSelection',
  'duplicateCheckpointCopiesAreDeduplicated',
  'periodic-review-upcoming',
  'retention-expiry-upcoming',
  'source-changed-during-scan',
  'not-assessed-requires-fresh-rescan',
  'GSP-',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecyclePortfolio.includes(needle), `excavation lifecycle portfolio keeps ${needle}`, needle);
});
[
  'backend.receiver_governance_archive_lifecycle_portfolio',
  'Scan',
  'Publish',
  'VerifySnapshot',
  'UpcomingDays',
  'MaxDepth',
  'Start-Process -FilePath $result.htmlPath',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecyclePortfolioLauncher.includes(needle), `excavation lifecycle portfolio launcher keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecyclePortfolioScanBatch.includes('-Mode Scan'), 'excavation lifecycle portfolio scan batch selects Scan', '-Mode Scan');
assert(receiverGovernanceArchiveLifecyclePortfolioPublishBatch.includes('-Mode Publish'), 'excavation lifecycle portfolio publish batch selects Publish', '-Mode Publish');
assert(receiverGovernanceArchiveLifecyclePortfolioVerifyBatch.includes('-Mode VerifySnapshot'), 'excavation lifecycle portfolio verify batch selects VerifySnapshot', '-Mode VerifySnapshot');
[
  'test_current_upcoming_review_blocked_duplicate_and_cli_exit_codes',
  'test_invalid_package_ambiguity_and_source_change_fail_closed',
  'test_closed_snapshot_html_tamper_extra_file_and_publish_rollback',
  'test_snapshot_validator_boundary_and_html_escape',
  'returncode, 2',
  'late-before-publish.txt',
  'extra.txt',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecyclePortfolioTests.includes(needle), `excavation lifecycle portfolio tests keep ${needle}`, needle);
});
[
  '完整重驗所有 GSC',
  '有效舊包不得掩蓋',
  'upcoming',
  '不會重新讀取來源 GSC',
  '不得進入 PDF／DOCX 計算書',
  '工具程式庫內都會拒絕發布',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecyclePortfolioGuide.includes(needle), `excavation lifecycle portfolio guide keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecyclePortfolioSchema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'excavation lifecycle portfolio schema draft', receiverGovernanceArchiveLifecyclePortfolioSchema.$schema);
assert(receiverGovernanceArchiveLifecyclePortfolioSchema.properties.kind.const === 'governance-external-archive-lifecycle-portfolio-snapshot', 'excavation lifecycle portfolio schema keeps GSP kind', receiverGovernanceArchiveLifecyclePortfolioSchema.properties.kind.const);
assert(receiverGovernanceArchiveLifecyclePortfolioSchema.properties.boundary.properties.formalCalculationAttachment.const === false, 'excavation lifecycle portfolio schema excludes formal attachment', 'false');
assert(receiverGovernanceArchiveLifecyclePortfolioSchema.properties.boundary.properties.pagesPublication.const === false, 'excavation lifecycle portfolio schema excludes Pages', 'false');
assert(receiverGovernanceArchiveLifecyclePortfolio.includes('TOOL_REPOSITORY_ROOT'), 'excavation lifecycle portfolio rejects repository-local output', 'TOOL_REPOSITORY_ROOT');
assert(rootGitignore.includes('GSP-外部歸檔生命週期總覽-*/'), 'excavation lifecycle portfolio snapshots are gitignored', 'GSP-外部歸檔生命週期總覽-*/');
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation lifecycle portfolio schema is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json'"),
  'excavation lifecycle portfolio schema has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('案件/GSP-外部歸檔生命週期總覽-GSP-00000000000000000000/GSP-外部歸檔生命週期總覽-GSP-00000000000000000000.html')) === JSON.stringify({ publish: false, reason: 'private-generated-evidence' }),
  'excavation lifecycle portfolio generated HTML is excluded from Pages artifacts',
  'private-generated-evidence',
);
assert(
  pagesLiveSmoke.includes("'GSP-外部歸檔生命週期總覽-GSP-00000000000000000000/GSP-外部歸檔生命週期總覽-GSP-00000000000000000000.html'"),
  'excavation lifecycle portfolio generated HTML has a live private-boundary probe',
  'HTTP status must not be 200',
);
[
  'MONITOR_KIND',
  'SIGNAL_KIND',
  'EVENT_KIND',
  'sameSignalDoesNotRepeatEventOrAlert',
  'alertOnlyOnAttentionChangeOrRecovery',
  'def run_monitor',
  'def _validate_latest_against_events',
  'def verify_monitor_state_directory',
  '另一個 GSM',
  'not-assessed-requires-monitor-run',
  'def build_dashboard_summaries',
  'def write_dashboard_summaries',
  'containsCaseIdentifiers',
  'containsArchiveMetadata',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitor.includes(needle), `excavation lifecycle monitor keeps ${needle}`, needle);
});
[
  'test_transition_dedup_attention_recovery_and_windows_entrypoint',
  'test_baseline_attention_tamper_unknown_entry_and_staleness',
  'test_event_tamper_lock_overlap_repository_and_rollback',
  'test_current_inventory_change_records_event_without_alert',
  'test_signal_and_state_semantic_tamper',
  'simulated latest failure',
  '孤兒狀態',
  'latest 狀態遺失',
  'dashboard_status',
  'monitor-operation-failed',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitorTests.includes(needle), `excavation lifecycle monitor tests keep ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleMonitorLauncher.includes('[ValidateSet("Run", "VerifyState")]'), 'excavation lifecycle monitor launcher keeps explicit modes', 'Run VerifyState');
assert(receiverGovernanceArchiveLifecycleMonitorLauncher.includes('$result.notification.shouldNotify'), 'excavation lifecycle monitor launcher throttles desktop alerts', 'notification.shouldNotify');
assert(receiverGovernanceArchiveLifecycleMonitorLauncher.includes('This operational or integrity failure is not alert-throttled.'), 'excavation lifecycle monitor launcher never throttles untrusted operational failures', 'not alert-throttled');
assert(receiverGovernanceArchiveLifecycleMonitorLauncher.includes('gsm-lifecycle-monitor-status.json'), 'excavation lifecycle monitor launcher publishes local dashboard status', 'gsm dashboard status');
assert(receiverGovernanceArchiveLifecycleMonitorLauncher.includes('status = "untrusted"'), 'excavation lifecycle monitor launcher invalidates dashboard status on operational failure', 'untrusted');
[
  'New-ScheduledTaskPrincipal',
  'Get-Command powershell.exe -CommandType Application',
  '[regex]::Escape($expectedScript)',
  '[ValidateSet("Install", "Preview", "Status", "Remove")]',
  '-LogonType Interactive',
  '-RunLevel Limited',
  '-StartWhenAvailable',
  '-MultipleInstances IgnoreNew',
  'New-TimeSpan -Hours 2',
  'Register-ScheduledTask',
  'Unregister-ScheduledTask',
  'actionMatchesCurrentTool',
  'scheduleMatchesMonitorPolicy',
  'configurationMatchesCurrentTool',
  'StateDirectory must be completely separate from SourceRoot',
  'StateDirectory must not be inside the tool repository',
  'MaxAgeHours',
  'DashboardTaskStatusPath',
  'dashboardMaxAgeArgumentPattern',
  'Dashboard output directory chain must be physical.',
  'containsTaskName = $false',
  'monitorStateFresh',
  'NoDashboardWrite',
  'ConfirmedConfigurationFingerprint',
  'Get-ConfigurationFingerprint',
  'Install requires the exact configuration fingerprint returned by Preview.',
  'confirmationRequired',
  'sourceScanExecuted = $false',
  'monitorStateWritten = $false',
  'taskRegistered = $false',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitorTaskManager.includes(needle), `excavation lifecycle monitor task manager keeps ${needle}`, needle);
});
[
  '[ValidateSet("Interactive", "Snapshot", "Smoke")]',
  'governance-external-archive-lifecycle-monitor-management-center-snapshot',
  'Get-ScheduledTask -ErrorAction Stop',
  '[string]$_.TaskPath -eq "\\"',
  '[string]$_.Description -eq $taskDescription',
  'configuration-drift',
  'monitor-state-stale',
  'last-run-failed',
  '-NoDashboardWrite',
  'containsPaths = $true',
  'containsCaseIdentifiers = $true',
  'taskInventoryReadOnly = $true',
  'sourceScanExecuted = $false',
  'statusStateVerificationReadOnly = $true',
  'persistedByDefault = $false',
  '$ui.Buttons.refresh.PerformClick()',
  'refreshEventVerified=$true',
  'New-RemovalConfirmation',
  '我確認只移除這個 Windows 排程',
  'Invoke-OnboardingForItem',
  '重新預覽／更新',
  '僅限本機維運',
  'formalCalculationAttachment = $false',
  'pagesPublication = $false',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitorCenter.includes(needle), `excavation lifecycle monitor center keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleMonitorCenterBatch.includes('receiver_governance_archive_lifecycle_monitor_center.ps1'), 'excavation lifecycle monitor center batch delegates to center', 'monitor center');
assert(receiverGovernanceArchiveLifecycleMonitorCenterBatch.includes('-STA'), 'excavation lifecycle monitor center batch starts WinForms in STA mode', '-STA');
assert(receiverGovernanceArchiveLifecycleMonitorCenterBatch.includes('-Mode Interactive'), 'excavation lifecycle monitor center batch starts interactive mode', '-Mode Interactive');
[
  '[ValidateSet("Interactive", "Preview", "Install", "Cancel")]',
  'governance-external-archive-lifecycle-monitor-onboarding-preview',
  'Invoke-ReadOnlyPortfolioScan',
  'readOnlySourceScanExecuted = $true',
  'Install requires explicit confirmation of the exact onboarding preview fingerprint.',
  '我已核對來源、狀態資料夾與排程設定',
  '$install.Enabled = $false',
  '$confirm.Add_CheckedChanged',
  '取消，不建立',
  'New-CancelledResult([bool]$SourceScanExecuted = $false)',
  'New-CancelledResult $true',
  'containsPaths = $false',
  'formalCalculationAttachment = $false',
  'pagesPublication = $false',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitorOnboarding.includes(needle), `excavation lifecycle monitor onboarding keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleMonitorInstallBatch.includes('onboard_receiver_governance_archive_lifecycle_monitor.ps1'), 'excavation lifecycle monitor install batch delegates to onboarding wizard', 'onboarding wizard');
assert(receiverGovernanceArchiveLifecycleMonitorInstallBatch.includes('-Mode Interactive'), 'excavation lifecycle monitor install batch starts preview-first interactive mode', '-Mode Interactive');
assert(!receiverGovernanceArchiveLifecycleMonitorInstallBatch.includes('-Mode Install'), 'excavation lifecycle monitor install batch cannot bypass explicit onboarding confirmation', 'no direct Install');
assert(receiverGovernanceArchiveLifecycleMonitorStatusBatch.includes('-Mode Status'), 'excavation lifecycle monitor status batch selects Status', '-Mode Status');
assert(receiverGovernanceArchiveLifecycleMonitorRemoveBatch.includes('-Mode Remove'), 'excavation lifecycle monitor remove batch selects Remove', '-Mode Remove');
[receiverGovernanceArchiveLifecycleMonitorInstallBatch, receiverGovernanceArchiveLifecycleMonitorStatusBatch, receiverGovernanceArchiveLifecycleMonitorRemoveBatch].forEach((source, index) => {
  assert(source.includes('%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'), `excavation lifecycle monitor batch ${index + 1} pins Windows PowerShell`, 'SystemRoot PowerShell');
});
[
  '相同訊號只更新 latest',
  '36 小時新鮮度',
  '不刪除狀態資料夾',
  '不得進入 PDF／DOCX 計算書',
].forEach((needle) => {
  assert(receiverGovernanceArchiveLifecycleMonitorGuide.includes(needle), `excavation lifecycle monitor guide keeps ${needle}`, needle);
});
assert(receiverGovernanceArchiveLifecycleMonitorSchema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'excavation lifecycle monitor schema draft', receiverGovernanceArchiveLifecycleMonitorSchema.$schema);
assert(receiverGovernanceArchiveLifecycleMonitorSchema.properties.kind.const === 'governance-external-archive-lifecycle-monitor-state', 'excavation lifecycle monitor schema keeps GSM kind', receiverGovernanceArchiveLifecycleMonitorSchema.properties.kind.const);
assert(receiverGovernanceArchiveLifecycleMonitorSchema.properties.boundary.properties.formalCalculationAttachment.const === false, 'excavation lifecycle monitor schema excludes formal attachment', 'false');
assert(receiverGovernanceArchiveLifecycleMonitorSchema.properties.boundary.properties.pagesPublication.const === false, 'excavation lifecycle monitor schema excludes Pages', 'false');
assert(receiverGovernanceArchiveLifecycleDashboardSchema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'excavation lifecycle dashboard schema draft', receiverGovernanceArchiveLifecycleDashboardSchema.$schema);
assert(receiverGovernanceArchiveLifecycleDashboardSchema.$defs.status.properties.kind.const === 'governance-external-archive-lifecycle-monitor-dashboard-status', 'excavation lifecycle dashboard schema keeps status kind', 'dashboard status');
assert(receiverGovernanceArchiveLifecycleDashboardSchema.$defs.task.properties.privacy.allOf.length === 1, 'excavation lifecycle dashboard task schema keeps privacy contract', 'privacy');
assert(rootGitignore.includes('GSM-外部歸檔生命週期監測-latest.json'), 'excavation lifecycle monitor latest state is gitignored', 'GSM latest');
assert(rootGitignore.includes('GSM-外部歸檔生命週期監測事件-*.json'), 'excavation lifecycle monitor events are gitignored', 'GSM events');
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation lifecycle monitor schema is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation lifecycle dashboard schema is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('GSM-外部歸檔生命週期監測-latest.json')) === JSON.stringify({ publish: false, reason: 'private-generated-evidence' }),
  'excavation lifecycle monitor generated latest state is excluded from Pages artifacts',
  'private-generated-evidence',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('events/GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json')) === JSON.stringify({ publish: false, reason: 'private-generated-evidence' }),
  'excavation lifecycle monitor generated event is excluded from Pages artifacts',
  'private-generated-evidence',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json'"),
  'excavation lifecycle monitor schema has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json'"),
  'excavation lifecycle dashboard schema has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'GSM-外部歸檔生命週期監測-latest.json'"),
  'excavation lifecycle monitor latest state has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'events/GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json'"),
  'excavation lifecycle monitor event has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/manage_receiver_governance_archive_lifecycle_monitor_task.ps1'"),
  'excavation lifecycle monitor task manager has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/onboard_receiver_governance_archive_lifecycle_monitor.ps1'"),
  'excavation lifecycle monitor onboarding wizard has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  pagesLiveSmoke.includes("'開挖擋土支撐/receiver_governance_archive_lifecycle_monitor_center.ps1'"),
  'excavation lifecycle monitor center has a live private-boundary probe',
  'HTTP status must not be 200',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/onboard_receiver_governance_archive_lifecycle_monitor.ps1')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation lifecycle monitor onboarding wizard is excluded from Pages artifacts',
  'private-source-file',
);
assert(
  JSON.stringify(pagesArtifactBuilder.classifyPublishedPath('開挖擋土支撐/receiver_governance_archive_lifecycle_monitor_center.ps1')) === JSON.stringify({ publish: false, reason: 'private-source-file' }),
  'excavation lifecycle monitor center is excluded from Pages artifacts',
  'private-source-file',
);
[
  'test_health_progresses_from_attention_to_overlap_to_complete',
  'test_health_excludes_disabled_and_password_reset_accounts',
  'test_orphaned_pending_sqlite_claim_fails_closed_and_fingerprint_is_stable',
  'test_pending_trust_event_without_sqlite_claim_fails_closed',
  'test_append_only_history_chains_state_transitions_and_deduplicates',
  'test_local_governance_restore_preserves_existing_health_history',
  'test_http_health_endpoint_is_admin_only_and_returns_no_credentials',
].forEach((needle) => {
  assert(receiverGovernanceHealthTests.includes(needle), `excavation governance health tests keep ${needle}`, needle);
});
[
  'test_signed_checkpoint_is_self_contained_and_detects_tampering',
  'test_trusted_checkpoint_accepts_same_or_extended_history',
  'test_checkpoint_detects_rollback_and_divergence',
  'test_revoked_or_untrusted_key_does_not_anchor_current_state',
  'test_key_id_match_without_exact_public_key_match_is_not_trusted',
  'test_same_public_key_in_pem_representation_remains_trusted',
  'test_checkpoint_api_is_admin_only_and_compares_current_history',
].forEach((needle) => {
  assert(receiverGovernanceCheckpointTests.includes(needle), `excavation governance checkpoint tests keep ${needle}`, needle);
});
[
  'test_integrity_only_receipt_is_valid_but_does_not_establish_trust_or_history',
  'test_empty_but_valid_history_checkpoint_remains_independently_verifiable',
  'test_trusted_backup_and_same_or_extended_ghe_establish_provided_history_anchor',
  'test_rollback_and_divergence_are_not_accepted_for_provided_history',
  'test_revoked_key_and_tampered_receipt_fail_closed',
  'test_cli_verifies_without_service_or_project_database',
].forEach((needle) => {
  assert(receiverGovernanceCheckpointVerifierTests.includes(needle), `excavation governance checkpoint verifier tests keep ${needle}`, needle);
});
assert(main.includes('/api/receiver-governance-health'), 'excavation governance health API is present', '/api/receiver-governance-health');
assert(main.includes('/api/receiver-governance-health/history'), 'excavation governance health history API is present', '/api/receiver-governance-health/history');
assert(main.includes('/api/receiver-governance-health/observations'), 'excavation explicit health observation API is present', '/api/receiver-governance-health/observations');
assert(main.includes('/api/receiver-governance-health/history/validate'), 'excavation governance health history validator API is present', '/api/receiver-governance-health/history/validate');
assert(main.includes('/api/receiver-governance-health/history/checkpoint-signing-request'), 'excavation governance checkpoint signing request API is present', '/api/receiver-governance-health/history/checkpoint-signing-request');
assert(main.includes('/api/receiver-governance-health/history/checkpoint/validate'), 'excavation governance checkpoint validator API is present', '/api/receiver-governance-health/history/checkpoint/validate');
assert(api.includes('getReceiverGovernanceHealth'), 'excavation frontend reads backend governance health snapshot', 'getReceiverGovernanceHealth');
assert(api.includes('getReceiverGovernanceHealthHistory'), 'excavation frontend reads verified governance health history', 'getReceiverGovernanceHealthHistory');
assert(api.includes('validateReceiverGovernanceHealthHistory'), 'excavation frontend validates exported governance health history', 'validateReceiverGovernanceHealthHistory');
assert(api.includes('exportReceiverGovernanceCheckpointSigningRequest'), 'excavation frontend exports governance checkpoint signing request', 'exportReceiverGovernanceCheckpointSigningRequest');
assert(api.includes('validateReceiverGovernanceCheckpoint'), 'excavation frontend validates governance signed checkpoint', 'validateReceiverGovernanceCheckpoint');
assert(receiverOfflineSigner.includes('CHECKPOINT_SIGNING_REQUEST_KIND'), 'offline signer accepts governance checkpoint requests', 'CHECKPOINT_SIGNING_REQUEST_KIND');
assert(receiverSigningLauncher.includes('governance-health-signed-checkpoint-'), 'offline signing launcher names governance checkpoints distinctly', 'governance-health-signed-checkpoint-');
[
  'receiver_governance_health_observations',
  'receiver_governance_health_no_update',
  'receiver_governance_health_no_delete',
  'receiver_governance_health_single_successor',
  'record_governance_health_observation',
  'governance_health_history',
  'GHR-',
].forEach((needle) => {
  assert(receiverOperatorAuth.includes(needle), `excavation governance health history store keeps ${needle}`, needle);
});
assert(!app.includes('deriveReceiverGovernanceSeparationHealth'), 'excavation frontend does not duplicate governance health authority', 'deriveReceiverGovernanceSeparationHealth excluded');
assert(config.includes('STRUT_DB_PATH'), 'excavation database path supports isolated verification', 'STRUT_DB_PATH');
[
  'RequestReceiverKeyRotationCompletionRequest',
  'ApproveReceiverKeyRotationCompletionRequest',
  'RequestReceiverOperatorBackupDispositionRequest',
  'ApproveReceiverOperatorBackupDispositionRequest',
  '/rotation-requests',
  '/approve',
].forEach((needle) => {
  assert(schemas.includes(needle) || main.includes(needle), `excavation receiver key rotation API keeps ${needle}`, needle);
});
assert(
  api.includes('requestReceiverKeyRotationCompletion') && api.includes('approveReceiverKeyRotationCompletion'),
  'excavation frontend exposes two-person receiver key rotation API',
  'requestReceiverKeyRotationCompletion + approveReceiverKeyRotationCompletion',
);
[
  '登錄新金鑰不會自動撤銷舊金鑰',
  '輪替案件或變更編號',
  '72 小時期限',
  'operator ID 不同',
  '不是外部組織目錄、自然人身分或公司授權',
  'JSON 事件清冊與 SQLite claim 分屬兩個檔案',
  'STRUT_DB_PATH',
  '不應等待 72 小時雙人輪替覆核',
  '不得自行停用、改角色或由管理入口重設自己的密碼',
  '須變更臨時密碼',
  '禁止事件更新／刪除',
  '角色 ID 維持不變',
  '治理申請人',
  '治理覆核人',
  '同時適用於金鑰輪替及到期備份處置',
  '唯讀治理權限矩陣',
  '目前帳號有效權限摘要',
  '治理分權健康摘要',
  '分權完整',
  '可執行但角色重疊',
  '不同 operator ID',
  '待覆核 claim',
  '後端工作階段',
  '有效／暫停／未授權',
  '禁止覆核自己提出的申請',
  '管理員角色不會自動取得治理申請或治理覆核權限',
  '不會寫入 PDF／DOCX 計算書',
  '加密封包為 schema v3 並納入 GHR',
  'ROE 稽核鏈及 v3 GHR 歷程都與目前相同或向前延伸',
  'v1／v2 則保留本機 GHR',
].forEach((needle) => {
  assert(receiverKeyManagementGuide.includes(needle), `excavation receiver key rotation guide keeps ${needle}`, needle);
});
assert(
  !reporting.includes('治理權限矩陣')
    && !reporting.includes('目前登入帳號有效權限')
    && !reporting.includes('有效權限摘要')
    && !reporting.includes('治理分權健康摘要')
    && !reporting.includes('治理健康狀態歷程')
    && !reporting.includes('GHR-')
    && !reporting.includes('GHE-')
    && !reporting.includes('GCR-')
    && !reporting.includes('GHC-')
    && !reporting.includes('GCV-')
    && !reporting.includes('專責角色分離')
    && !reporting.includes('receiver-key-admin')
    && !reporting.includes('receiver-key-requester')
    && !reporting.includes('receiver-key-approver'),
  'excavation calculation reports exclude operator governance permission and separation-health summaries',
  'reporting.py excludes operator governance role, effective-permission, and separation-health content',
);
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
  'def interaction_components',
  'def interaction_ratio',
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
[
  '../結構工具箱/core/direct-print-boundary.css',
  'formal-tool-output-page',
  '開挖服務入口列印已封鎖',
  '本頁不得作為附件',
  '本機受控服務工具',
  '已驗證範圍',
  '工程判斷邊界',
  '平台公開巡檢狀態',
  'RSC v3 證據',
].forEach((needle) => {
  assert(launcher.includes(needle), `excavation public launcher keeps ${needle}`, needle);
});
assert(!launcher.includes('柱構件檢核仍屬第一版移植'), 'excavation public launcher removes retired first-port limitation', '第一版移植');
[
  '開挖服務入口列印已封鎖',
  '已驗證範圍',
  '工程判斷邊界',
  '平台公開巡檢狀態',
].forEach((needle) => {
  assert(preflight.includes(needle), `excavation launcher preflight protects ${needle}`, needle);
  assert(pagesLiveSmoke.includes(needle), `excavation Pages live smoke protects ${needle}`, needle);
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
assert(home.includes('重撐軸壓／雙向彎矩承接'), 'excavation home output names biaxial reshore scope', '重撐軸壓／雙向彎矩承接');
assert(home.includes('構件與基礎檢核'), 'excavation home summary names governed member and foundation scope', '構件與基礎檢核');
assert(home.includes("capabilities: ['本機服務', 'PDF/DOCX', 'RSC v3 證據鏈']"), 'excavation home names current RSC schema', 'RSC v3 證據鏈');

assert(readme.includes('excavation-traceability.catalog.json'), 'excavation README documents traceability catalog path', 'README.md');
assert(readme.includes('規範語意追蹤'), 'excavation README documents traceability purpose', 'README.md');
assert(readme.includes('excavation-report.contract.test.js'), 'excavation README documents report contract path', 'README.md');
assert(readme.includes('RECEIVER_EVIDENCE_TEMPLATES.md'), 'excavation README documents receiver evidence templates', 'README.md');
assert(readme.includes('Repo 根下的 `index.html` 只是在公開工具箱中的本機服務 launcher'), 'excavation README distinguishes launcher from service UI and report', 'README.md');
assert(readme.includes('開挖服務入口列印已封鎖'), 'excavation README documents launcher direct-print block', 'README.md');

if (failed) {
  console.error(`\n${failed} excavation traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll excavation traceability contract checks passed.');
