export type ProjectListItem = {
  id: string;
  name: string;
  updated_at?: string | null;
};

export type SectionProperty = {
  name: string;
  depth_cm: number;
  flange_width_cm: number;
  web_thickness_cm: number;
  flange_thickness_cm: number;
  area_cm2: number;
  unit_weight_kgf_per_m: number;
  ix_cm4: number;
  iy_cm4: number;
  rx_cm: number;
  ry_cm: number;
  rt_cm: number;
  sx_cm3: number;
  sy_cm3: number;
  zx_cm3: number;
  zy_cm3: number;
};

export type BoltStrengthRow = {
  grade: string;
  ft_tf_per_cm2?: number | null;
  fv_tf_per_cm2?: number | null;
  sizes: Record<string, number>;
};

export type BasicParameters = {
  e_tf_per_cm2: number;
  fy_tf_per_cm2: number;
  cm_factor: number;
  surcharge_wl_tf_per_m: number;
  alpha_support: number;
  alpha_wale: number;
  alpha_brace: number;
  alpha_corner_brace: number;
  alpha_column: number;
  psi_material: number;
  wall_type: string;
  wall_thickness_cm: number;
  wall_fc_kg_per_cm2: number;
};

export type AnalysisForceCase = {
  stage_index: number;
  stage_label: string;
  axial_force_t: number;
};

export type RemovalTransferMode =
  | "unassigned"
  | "outside_scope"
  | "floor"
  | "reshore"
  | "permanent_structure"
  | "other";

export type RemovalTransferReceiverAllocation = {
  mode: Exclude<RemovalTransferMode, "unassigned">;
  target: string;
  direction: string;
  share_percent: number;
  basis: string;
};

export type SupportRow = {
  level_label: string;
  support_count: number;
  section_name: string;
  axial_force_t: number;
  temp_force_t: number;
  spacing_m: number;
  force_source?: "manual" | "analysis_import";
  analysis_stage_cases?: AnalysisForceCase[];
  analysis_install_stage_index?: number | null;
  analysis_install_stage_label?: string;
  analysis_control_stage_index?: number | null;
  analysis_control_stage_label?: string;
  analysis_removal_stage_index?: number | null;
  analysis_removal_stage_label?: string;
  removal_transfer_mode?: RemovalTransferMode;
  removal_transfer_target?: string;
  removal_transfer_direction?: string;
  removal_transfer_share_percent?: number;
  removal_transfer_additional_receivers?: RemovalTransferReceiverAllocation[];
  removal_transfer_basis?: string;
  removal_transfer_confirmed?: boolean;
  construction_step_label?: string;
  analysis_mapping_confirmed?: boolean;
  analysis_mapping_basis?: string;
};

export type WaleRow = {
  level_label: string;
  wale_count: number;
  section_name: string;
  span_m: number;
  support_spacing_m: number;
  line_load_tf_per_m: number;
};

export type BraceRow = {
  level_label: string;
  section_name: string;
  l1_m: number;
  l2_m: number;
  angle_deg: number;
  tributary_line_load_tf_per_m: number;
  force_source?: "manual" | "analysis_import";
  analysis_stage_cases?: AnalysisForceCase[];
  analysis_install_stage_index?: number | null;
  analysis_install_stage_label?: string;
  analysis_control_stage_index?: number | null;
  analysis_control_stage_label?: string;
  analysis_removal_stage_index?: number | null;
  analysis_removal_stage_label?: string;
  removal_transfer_mode?: RemovalTransferMode;
  removal_transfer_target?: string;
  removal_transfer_direction?: string;
  removal_transfer_share_percent?: number;
  removal_transfer_additional_receivers?: RemovalTransferReceiverAllocation[];
  removal_transfer_basis?: string;
  removal_transfer_confirmed?: boolean;
  construction_step_label?: string;
  analysis_mapping_confirmed?: boolean;
  analysis_mapping_basis?: string;
};

export type CornerBraceRow = {
  level_label: string;
  section_name: string;
  length_m: number;
  axial_force_t: number;
};

export type CalculationOptions = {
  include_top_supports: boolean;
  include_bottom_supports: boolean;
  auto_temp_force_top_supports: boolean;
  auto_temp_force_bottom_supports: boolean;
  consider_wall_deduction_for_wales: boolean;
  include_top_wales: boolean;
  include_bottom_wales: boolean;
  include_top_braces: boolean;
  include_bottom_braces: boolean;
  include_corner_braces: boolean;
};

export type FoundationSoilLayer = {
  index: number;
  name: string;
  depth_m: number;
  thickness_m: number;
  n_value?: number | null;
  su_t_per_m2?: number | null;
  soil_type: "sand" | "clay" | "mixed";
};

export type ConstructionStageLoadSource = {
  kind: "construction-stage-decking-load-handoff";
  handoff_fingerprint: string;
  source_tool: string;
  source_version: string;
  source_calculation_fingerprint: string;
  source_project_name: string;
  source_project_no: string;
  controlling_cases: string[];
  handoff_record: Record<string, unknown>;
};

export type ConstructionStageLoadAdoption = {
  stage_id: string;
  stage_label: string;
  target_column_id: string;
  load_t: number;
  distribution_factor: number;
  distribution_basis: string;
  apply_transfer_eccentricity: boolean;
  transfer_eccentricity_x_m: number;
  transfer_eccentricity_y_m: number;
  transfer_basis: string;
  source: ConstructionStageLoadSource;
};

export type ColumnScenarioInput = {
  column_id: string;
  title: string;
  variant: "middle" | "composite_normal" | "composite_crane";
  enabled: boolean;
  column_section_name: string;
  support_rows: SupportRow[];
  foundation_type: string;
  foundation_shape: string;
  foundation_size_x_m: number;
  foundation_size_y_m: number;
  column_length_m: number;
  kh_kg_per_cm3: number;
  pile_width_cm?: number | null;
  bottom_to_excavation_distance_m: number;
  eccentricity_x_m?: number | null;
  eccentricity_y_m: number;
  embedment_length_cm: number;
  concrete_strength_kg_per_cm2: number;
  soil_layers: FoundationSoilLayer[];
  construction_stage_load_t: number;
  construction_stage_load_source?: ConstructionStageLoadSource | null;
  construction_stage_loads: ConstructionStageLoadAdoption[];
  compression_fs: number;
  tension_fs: number;
  pile_unit_weight_t_per_m3: number;
};

export type SoilLayer = {
  index: number;
  name: string;
  thickness_m?: number | null;
  depth_m?: number | null;
  n_value?: number | null;
  unit_weight_t_per_m3?: number | null;
  phi_deg?: number | null;
  cohesion_t_per_m2?: number | null;
  delta_ratio?: number | null;
  su_t_per_m2?: number | null;
  ka?: number | null;
  kp?: number | null;
  es_t_per_m2?: number | null;
  kh_t_per_m3?: number | null;
  soil_type: "sand" | "clay" | "mixed";
};

export type AnalysisStrut = {
  index: number;
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  stiffness: number;
};

export type AnalysisEvent = {
  stage_index: number;
  stage_label: string;
  classification: "support" | "brace" | "floor" | "remove" | "other";
  butt_no?: number | null;
  depth_m?: number | null;
  span_m?: number | null;
  angle_deg?: number | null;
  load_t?: number | null;
  stiffness?: number | null;
  control_stage_indices?: number[];
  stage_force_cases?: AnalysisForceCase[];
  description: string;
  included: boolean;
};

export type AnalysisStage = {
  index: number;
  label: string;
  excavation_depth_m?: number | null;
  water_level_m?: number | null;
  struts: AnalysisStrut[];
};

export type AnalysisImportResult = {
  source_name: string;
  source_type: string;
  project_title: string;
  wall_length_m?: number | null;
  wall_thickness_m?: number | null;
  excavation_depth_m?: number | null;
  ground_water_level_m?: number | null;
  wall_ei_tf_m2_per_m?: number | null;
  soils: SoilLayer[];
  stages: AnalysisStage[];
  events: AnalysisEvent[];
  warnings: string[];
  raw_preview: string[];
};

export type AnalysisSourceMode = "unused" | "import" | "manual";

export type AnalysisSideSource = {
  mode: AnalysisSourceMode;
  import_result: AnalysisImportResult;
};

export type CheckResult = {
  module_name: string;
  label: string;
  formula_id: string;
  inputs: Record<string, string | number>;
  computed_value?: number | null;
  allowable_value?: number | null;
  utilization_ratio?: number | null;
  status: "OK" | "Say~OK" | "NG";
  controlling_condition: string;
  details: Record<string, string | number | string[]>;
};

export type SummaryItem = {
  group: string;
  label: string;
  section_name: string;
  status: string;
  utilization_ratio?: number | null;
};

export type CalculationResults = {
  generated_at: string;
  support_checks: CheckResult[];
  wale_checks: CheckResult[];
  brace_checks: CheckResult[];
  corner_brace_checks: CheckResult[];
  column_checks: CheckResult[];
  summary: SummaryItem[];
  warnings: string[];
};

export type ReferenceData = {
  sections: SectionProperty[];
  bolts: BoltStrengthRow[];
  basic_defaults: BasicParameters;
};

export type ProjectMetadata = {
  id?: string | null;
  name: string;
  project_code: string;
  client: string;
  designer: string;
  checker: string;
  organization: string;
  location: string;
  notes: string;
  spec_pack_version: string;
  unit_system: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProjectState = {
  metadata: ProjectMetadata;
  basic_parameters: BasicParameters;
  calculation_options: CalculationOptions;
  top_analysis_source: AnalysisSideSource;
  bottom_analysis_source: AnalysisSideSource;
  analysis_import: AnalysisImportResult;
  top_supports: SupportRow[];
  bottom_supports: SupportRow[];
  top_wales: WaleRow[];
  bottom_wales: WaleRow[];
  top_braces: BraceRow[];
  bottom_braces: BraceRow[];
  corner_braces: CornerBraceRow[];
  columns: ColumnScenarioInput[];
  calculation_results?: CalculationResults | null;
  removal_transfer_handoffs?: RemovalTransferHandoff[];
  removal_transfer_verification_receipts?: ReceiverCapacityVerificationReceipt[];
  source_capacity_evidence_verifications?: SourceCapacityEvidenceVerification[];
};

export type RemovalTransferHandoff = {
  schemaVersion: 1 | 2 | 3 | 4;
  kind: "excavation-removal-transfer-handoff";
  generatedAt: string;
  source: {
    toolId: string;
    toolName: string;
    toolVersion: string;
    projectId: string;
    projectName: string;
    projectNo: string;
    calculationFingerprint: string;
  };
  transfers: Array<{
    transferId: string;
    sourceMember: Record<string, string | number>;
    lifecycle: Record<string, unknown>;
    sourceDemand: Record<string, unknown>;
    receiver: {
      mode: RemovalTransferMode;
      modeLabel: string;
      target: string;
      direction?: string;
      dispositionBasis: string;
      receiverIdentityRequired: boolean;
    };
    sourceCheck: Record<string, unknown>;
    verification: {
      status: "pending";
      required: true;
      autoVerified: false;
      acceptedReceiptKind: "receiver-capacity-verification-receipt";
    };
  }>;
  verificationSummary: {
    status: "pending";
    required: number;
    verified: 0;
    receiptKind: "receiver-capacity-verification-receipt";
  };
  receiptContract: {
    schemaVersion: 1 | 2 | 3 | 4 | 5;
    kind: "receiver-capacity-verification-receipt";
    fingerprintAlgorithm: "RVR-SHA256-canonical-json-first-20-uppercase";
    coverage: "all-ERT-transfers-required";
    capacityCheck?: "adopted-demand-divided-by-verified-capacity";
    capacityEvidence?: "per-ERT-document-metadata-and-sha256";
    verificationScope?: "per-ERT-structured-model-combination-load-path-eccentricity-and-limit-states";
    supplementalEvidence?: "per-ERT-five-check-status-basis-and-document-sha256";
    verifierIdentityAuthentication: "manual-review-required" | "manual-review-or-ed25519-trust-registry";
  };
  boundary: {
    requiresReceiverVerification: true;
    autoApplied: false;
    autoVerified: false;
    scope: string;
  };
  handoffFingerprint: string;
};

export type ReceiverVerificationAuthority = {
  organization: string;
  verifierName: string;
  verifierRole: string;
  reportReference: string;
};

export type ReceiverCapacityEvidence = {
  documentReference: string;
  revision: string;
  issuedDate: string;
  pageReference: string;
  fileName: string;
  fileSha256: string;
};

export type ReceiverLimitState =
  | "axial"
  | "shear"
  | "bending"
  | "stability"
  | "punching"
  | "connection"
  | "foundation"
  | "other";

export type ReceiverVerificationScope = {
  analysisModelReference: string;
  governingLoadCombination: string;
  directionAndDistributionBasis: string;
  eccentricityAndSecondaryEffectBasis: string;
  checkedLimitStates: ReceiverLimitState[];
  otherChecksStatus: "passed" | "failed";
};

export type ReceiverSupplementalCheckId =
  | "connection"
  | "bearing"
  | "receiving-structure"
  | "bracing-and-effective-length"
  | "construction-sequence-and-preload";

export type ReceiverSupplementalCheck = {
  checkId: ReceiverSupplementalCheckId;
  status: "passed" | "failed" | "not-applicable";
  basis: string;
  evidence?: ReceiverCapacityEvidence;
};

export type ReceiverVerificationResult = {
  transferId: string;
  status: "passed" | "failed";
  receiverTarget: string;
  adoptedDemandTf: number;
  verifiedCapacityTf?: number;
  capacityUtilizationRatio: number;
  capacityEvidence?: ReceiverCapacityEvidence;
  verificationScope?: ReceiverVerificationScope;
  supplementalChecks?: ReceiverSupplementalCheck[];
  verificationBasis: string;
  conclusion: string;
};

export type ReshoreMemberCapacityInput = {
  section_name: string;
  member_count: number;
  unbraced_length_x_m: number;
  unbraced_length_y_m: number;
  effective_length_factor_kx: number;
  effective_length_factor_ky: number;
  fy_tf_per_cm2: number;
  e_tf_per_cm2: number;
  allowable_stress_increase_factor: 1 | 1.25;
  imbalance_factor: number;
  additional_axial_load_tf_per_member: number;
  governing_load_combination: string;
  effective_length_basis: string;
  load_distribution_basis: string;
  additional_load_basis: string;
  stress_increase_basis: string;
  pure_axial_no_eccentricity_confirmed: boolean;
};

export type ReshoreMemberCapacityCalculationResponse = {
  calculation: {
    schemaVersion: 1;
    kind: "excavation-reshore-member-capacity-calculation";
    generatedAt: string;
    calculationFingerprint: string;
    results: {
      status: "passed" | "failed";
      controllingAxis: "X" | "Y";
      klrX: number;
      klrY: number;
      klrMax: number;
      cc: number;
      baseAllowableAxialStressTfPerCm2: number;
      adjustedAllowableAxialStressTfPerCm2: number;
      perMemberCapacityTf: number;
      transferDemandPerMemberTf: number;
      totalDemandPerMemberTf: number;
      nominalTransferCapacityTf: number;
      adoptableTransferCapacityTf: number;
      memberTotalUtilizationRatio: number | null;
      capacityUtilizationRatio: number | null;
      flangeSlendernessRatio: number;
      flangeSlendernessLimit: number;
      webSlendernessRatio: number;
      webSlendernessLimit: number;
      checks: {
        memberSlenderness: "passed" | "failed";
        localSlenderness: "passed" | "failed";
        axialCapacity: "passed" | "failed";
      };
    };
    verificationScope: {
      checkedLimitStates: ReceiverLimitState[];
      uncoveredChecks: string[];
      otherChecksStatus: "failed";
    };
  };
  evidence: ReceiverCapacityEvidence & {
    mediaType: "application/json";
    contentEncoding: "base64";
    contentBase64: string;
  };
};

export type ReceiverCapacityVerificationReceipt = {
  schemaVersion: 1 | 2 | 3 | 4 | 5;
  kind: "receiver-capacity-verification-receipt";
  issuedAt: string;
  handoffFingerprint: string;
  sourceCalculationFingerprint: string;
  verificationAuthority: ReceiverVerificationAuthority;
  results: ReceiverVerificationResult[];
  summary: {
    status: "passed" | "failed";
    passed: number;
    failed: number;
  };
  boundary: {
    receiverCalculationCompleted: true;
    sourceToolDidNotAutoVerify: true;
    verifierIdentityRequiresManualReview: true;
    capacityValueFromReceiverDocument?: true;
    capacityEvidenceFileNotEmbedded?: true;
    verificationScopeStructured?: true;
    supplementalChecksStructured?: true;
    supplementalEvidenceFilesNotEmbedded?: true;
    otherChecksStatusDerived?: true;
  };
  identitySignature?: {
    schemaVersion: 1;
    algorithm: "Ed25519";
    keyId: string;
    publicKeyBase64: string;
    signedAt: string;
    signatureBase64: string;
  };
  receiptFingerprint: string;
};

export type SourceCapacityEvidenceVerification = {
  schemaVersion: 1 | 2;
  kind: "source-capacity-evidence-verification-record";
  verifiedAt: string;
  handoffFingerprint: string;
  receiptFingerprint: string;
  sourceCalculationFingerprint: string;
  verificationAuthority: {
    organization: string;
    verifierName: string;
    verifierRole: string;
  };
  verificationBasis: string;
  checks: Array<{
    transferId: string;
    evidenceKey?: string;
    evidenceRole?: "capacity" | "supplemental";
    checkLabel?: string;
    documentReference: string;
    revision: string;
    issuedDate: string;
    pageReference: string;
    expectedFileName: string;
    selectedFileName: string;
    expectedSha256: string;
    actualSha256: string;
    sha256Matched: true;
    fileNameMatched: boolean;
  }>;
  summary: {
    status: "matched";
    required: number;
    matched: number;
    fileNameDifferences: number;
  };
  boundary: {
    hashesComputedInSourceBrowser: true;
    evidenceFilesNotUploadedOrEmbedded: true;
    byteIdentityOnly: true;
    engineeringContentRequiresManualReview: true;
    allReferencedEvidenceFilesCompared?: true;
  };
  identitySignature?: {
    schemaVersion: 1;
    algorithm: "Ed25519";
    keyId: string;
    publicKeyBase64: string;
    signedAt: string;
    signatureBase64: string;
  };
  verificationFingerprint: string;
};

export type ReceiverIdentityStatus =
  | "manual-review-required"
  | "valid-signature-untrusted-key"
  | "valid-signature-revoked-key"
  | "valid-signature-organization-mismatch"
  | "trusted-signature-valid";

export type ReceiverIdentityVerification = {
  status: ReceiverIdentityStatus;
  signaturePresent: boolean;
  cryptographicValid: boolean;
  trusted: boolean;
  keyId: string | null;
  signedAt?: string;
  trustedOrganization?: string;
  keyLabel?: string;
  message: string;
};

export type ReceiverTrustKey = {
  keyId: string;
  algorithm: "Ed25519";
  organization: string;
  displayName: string;
  publicKeyBase64: string;
  status: "trusted" | "revoked";
  registeredAt: string;
  revokedAt: string | null;
  registrationMethod?: "manual" | "enrollment-package";
  enrollmentFingerprint?: string | null;
  replacesKeyId?: string | null;
  replacedByKeyId?: string | null;
  proofOfPossessionVerified?: boolean;
  independentVerificationConfirmedAt?: string;
  rotationCompletedAt?: string;
  rotationCompletionEventFingerprint?: string;
  rotationApprovalRequestFingerprint?: string;
  revocationReasonCode?: ReceiverRevocationReason;
  revocationReason?: string;
  revokedBy?: string;
  revocationReference?: string | null;
  revocationEventFingerprint?: string;
};

export type ReceiverRevocationReason =
  | "suspected-compromise"
  | "confirmed-compromise"
  | "lost-key-or-password"
  | "custodian-change"
  | "organization-change"
  | "superseded-after-rotation"
  | "retired"
  | "other";

export type ReceiverTrustEvent = {
  schemaVersion: 1;
  kind: "receiver-verification-key-event";
  eventType: "key-registered" | "key-revoked" | "rotation-completion-requested";
  keyId: string;
  effectiveAt: string;
  recordedAt: string;
  actor: string;
  reasonCode: ReceiverRevocationReason | "new-registration" | "rotation-registration" | "rotation-completion-request";
  reason: string;
  incidentReference: string | null;
  relatedKeyId?: string;
  actorRole?: string;
  actorId?: string;
  authenticationMethod?: "local-password-session";
  expiresAt?: string;
  approvalRequestFingerprint?: string;
  previousEventFingerprint: string | null;
  eventFingerprint: string;
};

export type ReceiverRotationRequest = {
  requestFingerprint: string;
  newKeyId: string;
  oldKeyId: string;
  organization: string;
  requestedAt: string;
  expiresAt: string;
  requestedBy: string;
  requesterRole: string;
  requestedByOperatorId: string | null;
  reason: string;
  incidentReference: string;
  status: "pending" | "expired" | "blocked" | "completed";
  approvedAt: string | null;
  approvedBy: string | null;
  approverRole: string | null;
  approvedByOperatorId: string | null;
  identityAssurance: "authenticated-local-account" | "procedural-declaration";
  authorizationState: "tracked" | "legacy-procedural" | "missing-claim";
  authorizationClaimState?: "pending" | "completed" | "expired" | "blocked";
  completionEventFingerprint: string | null;
};

export type ReceiverOperatorRole =
  | "receiver-key-admin"
  | "receiver-key-requester"
  | "receiver-key-approver";

export type ReceiverOperator = {
  id: string;
  username: string;
  displayName: string;
  roles: ReceiverOperatorRole[];
  disabled: boolean;
  passwordResetRequired: boolean;
  createdAt: string;
  identityAssurance: "authenticated-local-account";
};

export type ReceiverGovernanceHealthSnapshot = {
  schemaVersion: 1;
  kind: "receiver-governance-separation-health";
  generatedAt: string;
  healthFingerprint: string;
  status: "complete" | "overlap" | "attention";
  statusLabel: string;
  nextActionCode:
    | "establish-distinct-operators"
    | "restore-claim-reviewability"
    | "separate-dedicated-roles"
    | "maintain-separation";
  activeRequesterCount: number;
  activeApproverCount: number;
  distinctPairAvailable: boolean;
  dedicatedPairAvailable: boolean;
  pendingRotationCount: number;
  pendingBackupDispositionCount: number;
  unreviewablePendingCount: number;
  unreviewablePendingClaims: Array<{
    claimType: "receiver-key-rotation" | "operator-backup-disposition";
    requestFingerprint: string;
    reasonCodes: string[];
  }>;
  sources: {
    operatorGovernanceSnapshotFingerprint: string;
    trustRegistryFingerprint: string;
    operatorAuditHeadFingerprint: string | null;
  };
  consistencyBoundary: {
    operatorDatabaseSnapshot: "single-sqlite-read-transaction";
    trustRegistrySnapshot: "single-validated-json-snapshot";
    crossStoreAtomic: false;
    authorizationRevalidatedPerOperation: true;
  };
  history: {
    chainValid: true;
    observationCount: number;
    headFingerprint: string | null;
    currentSnapshotRecorded: boolean;
    latestObservation: ReceiverGovernanceHealthObservation | null;
  };
};

export type ReceiverGovernanceHealthObservation = {
  sequenceNo: number;
  observationId: string;
  observedAt: string;
  changeType: string;
  actorOperatorId: string | null;
  fromStatus: "complete" | "overlap" | "attention" | null;
  toStatus: "complete" | "overlap" | "attention";
  healthFingerprint: string;
  operatorGovernanceSnapshotFingerprint: string;
  trustRegistryFingerprint: string;
  operatorAuditHeadFingerprint: string | null;
  summary: {
    activeRequesterCount: number;
    activeApproverCount: number;
    pendingClaimCount: number;
    unreviewablePendingCount: number;
  };
  previousReceiptFingerprint: string | null;
  receiptFingerprint: string;
};

export type ReceiverGovernanceHealthHistory = {
  schemaVersion: 1;
  kind: "receiver-governance-health-history";
  chainValid: true;
  observationCount: number;
  headFingerprint: string | null;
  observations: ReceiverGovernanceHealthObservation[];
};

export type ReceiverOperatorAuditEvent = {
  eventId: string;
  eventType:
    | "operator-bootstrap-created"
    | "operator-created"
    | "operator-roles-changed"
    | "operator-disabled"
    | "operator-enabled"
    | "operator-password-reset"
    | "operator-password-changed"
    | "operator-governance-backup-exported"
    | "operator-backup-disposition-requested"
    | "operator-backup-disposition-approved"
    | "operator-backup-disposition-completed"
    | "operator-governance-restored";
  actorOperatorId: string;
  actorUsername: string;
  actorDisplayName: string;
  targetOperatorId: string;
  targetUsername: string;
  targetDisplayName: string;
  occurredAt: string;
  details: Record<string, unknown>;
  previousEventFingerprint: string | null;
  eventFingerprint: string;
};

export type ReceiverOperatorAuditSummary = {
  events: ReceiverOperatorAuditEvent[];
  chainValid: true;
  eventCount: number;
  headFingerprint: string | null;
};

export type ReceiverOperatorGovernanceBackup = {
  schemaVersion: 1 | 2;
  kind: "receiver-operator-governance-encrypted-backup";
  exportedAt: string;
  encryption: {
    algorithm: "AES-256-GCM";
    kdf: "scrypt";
    n: number;
    r: number;
    p: number;
    keyLength: 32;
    saltBase64: string;
    nonceBase64: string;
  };
  summary: {
    operatorCount: number;
    activeAdminCount: number;
    rotationClaimCount: number;
    backupDispositionClaimCount?: number;
    auditEventCount: number;
    snapshotFingerprint: string;
  };
  ciphertextBase64: string;
  backupFingerprint: string;
};

export type ReceiverOperatorGovernanceRestorePreview = {
  currentStatus: "valid" | "fresh-recovery-bootstrap";
  currentOperatorCount: number;
  backupOperatorCount: number;
  currentAuditEventCount: number;
  backupAuditEventCount: number;
  currentRotationClaimCount: number;
  backupRotationClaimCount: number;
  currentBackupDispositionClaimCount: number;
  backupDispositionClaimCount: number;
  addedUsernames: string[];
  removedUsernames: string[];
  accountChanges: Array<{
    username: string;
    currentRoles: ReceiverOperatorRole[];
    backupRoles: ReceiverOperatorRole[];
    currentStatus: "enabled" | "disabled" | "password-reset-required";
    backupStatus: "enabled" | "disabled" | "password-reset-required";
  }>;
  backupActiveAdminUsernames: string[];
  currentSnapshotFingerprint: string;
  backupSnapshotFingerprint: string;
  wouldReplace: boolean;
  restoreAllowed: boolean;
  blockingReasons: string[];
  sessionsWillBeRevoked: true;
};

export type ReceiverOperatorGovernanceRestoreResult = {
  restored: true;
  loggedOut: true;
  backupFingerprint: string;
  backupSnapshotFingerprint: string;
  restoredSnapshotFingerprint: string;
  restoreEventFingerprint: string;
  safeguardFileName: string;
  safeguardBackupFingerprint: string;
  revokedSessions: number;
  preview: ReceiverOperatorGovernanceRestorePreview;
};

export type ReceiverOperatorManagedBackup = {
  fileName: string;
  backupFingerprint: string;
  snapshotFingerprint: string;
  exportedAt: string;
  retentionDays: number;
  retentionUntil: string;
  fileSha256: string;
  operatorCount: number;
  activeAdminCount: number;
  auditEventCount: number;
  backupDispositionClaimCount: number;
  expired: boolean;
  status: "active" | "expired";
};

export type ReceiverOperatorRecoveryDrillReceipt = {
  schemaVersion: 1;
  kind: "receiver-operator-governance-recovery-drill-receipt";
  performedAt: string;
  backupFingerprint: string;
  backupSnapshotFingerprint: string;
  operatorCount: number;
  activeAdminCount: number;
  auditEventCount: number;
  backupEnvelopeValidated: true;
  encryptedSnapshotDecrypted: true;
  backupAdminAuthenticated: true;
  restoreTarget: "isolated-temporary-sqlite";
  isolatedRestoreCompleted: true;
  isolatedRestoreEventFingerprint: string;
  isolatedRestoredSnapshotFingerprint: string;
  restoredAuditChainValid: true;
  productionSnapshotFingerprintBefore: string;
  productionSnapshotFingerprintAfter: string;
  productionGovernanceUnchangedDuringDrill: true;
  result: "passed";
  privacy: {
    containsPassphrase: false;
    containsPassword: false;
    containsUsername: false;
    containsServerPath: false;
  };
  receiptFingerprint: string;
  receiptFileName?: string;
};

export type ReceiverOperatorBackupDispositionRequest = {
  requestFingerprint: string;
  backupFingerprint: string;
  snapshotFingerprint: string;
  managedFileName: string;
  managedFileSha256: string;
  exportedAt: string;
  retentionUntil: string;
  requestedByOperatorId: string;
  requestedAt: string;
  expiresAt: string;
  caseReference: string;
  basis: string;
  state: "pending" | "removal-in-progress" | "completed" | "expired" | "blocked";
  approvedByOperatorId: string | null;
  approvedAt: string | null;
  completionOperatorId: string | null;
  completedAt: string | null;
  receiptFingerprint: string | null;
  completionEventFingerprint: string | null;
};

export type ReceiverOperatorBackupDispositionReceipt = {
  schemaVersion: 1;
  kind: "receiver-operator-governance-backup-disposition-receipt";
  completedAt: string;
  requestFingerprint: string;
  backupFingerprint: string;
  snapshotFingerprint: string;
  managedFileName: string;
  managedFileSha256: string;
  exportedAt: string;
  retentionUntil: string;
  requestedByOperatorId: string;
  requestedAt: string;
  expiresAt: string;
  approvedByOperatorId: string;
  approvedAt: string;
  completionOperatorId: string;
  caseReferenceSha256: string;
  basisSha256: string;
  disposition: {
    trigger: "explicit-two-person-approved-expired-backup-disposition";
    managedFileAbsentAfterDisposition: true;
    automaticExpiryDeletion: false;
    ordinaryFilesystemEntryRemovalOnly: true;
    secureEraseGuaranteed: false;
    otherCopiesMayRemain: true;
  };
  privacy: {
    containsPassphrase: false;
    containsPassword: false;
    containsUsername: false;
    containsServerPath: false;
  };
  receiptFingerprint: string;
  receiptFileName?: string;
};

export type ReceiverOperatorRecoveryInventory = {
  generatedAt: string;
  scope: "local-server-only";
  managedBackups: ReceiverOperatorManagedBackup[];
  drillReceipts: ReceiverOperatorRecoveryDrillReceipt[];
  invalidBackupFiles: Array<{ fileName: string; error: string }>;
  invalidDrillFiles: Array<{ fileName: string; error: string }>;
  backupDispositionRequests: ReceiverOperatorBackupDispositionRequest[];
  backupDispositionReceipts: ReceiverOperatorBackupDispositionReceipt[];
  invalidBackupDispositionFiles: Array<{ fileName: string; error: string }>;
  health: {
    status: "healthy" | "attention-required";
    issueCount: number;
    issues: Array<{ code: string; message: string }>;
    drillMaxAgeDays: number;
    latestActiveBackupFingerprint: string | null;
    latestMatchingDrillReceiptFingerprint: string | null;
  };
  retentionBoundary: {
    automaticDeletion: false;
    explicitTwoPersonDispositionRequired: true;
    approvedDispositionUsesOrdinaryFilesystemEntryRemoval: true;
    secureEraseGuaranteed: false;
    expiredFilesRequireStorageAdministratorDisposition: true;
    otherCopiesMayRemain: true;
  };
};

export type ReceiverOperatorAuthState = {
  bootstrapRequired: boolean;
  authenticated: boolean;
  operator: ReceiverOperator | null;
  csrfToken?: string;
  expiresAt?: string;
  assuranceBoundary?: string;
};

export type ReceiverTrustRegistryBackup = {
  schemaVersion: 1;
  kind: "receiver-verification-trust-registry-backup";
  exportedAt: string;
  registry: {
    schemaVersion: 1;
    kind: "receiver-verification-trust-registry";
    keys: ReceiverTrustKey[];
    events: ReceiverTrustEvent[];
    keyCount: number;
    eventCount: number;
    chainHeadEventFingerprint: string | null;
    registryFingerprint: string;
  };
  backupFingerprint: string;
};

export type ReceiverTrustRestorePreview = {
  currentStatus: "valid" | "missing" | "unreadable";
  currentError: string | null;
  currentKeyCount: number;
  currentEventCount: number;
  backupKeyCount: number;
  backupEventCount: number;
  addedKeyIds: string[];
  removedKeyIds: string[];
  statusChanges: Array<{
    keyId: string;
    currentStatus: "trusted" | "revoked";
    backupStatus: "trusted" | "revoked";
  }>;
  currentRegistryFingerprint: string;
  backupRegistryFingerprint: string;
  wouldReplace: boolean;
  restoreAllowed: boolean;
  blockingReasons: string[];
};

export type ReceiverKeyEnrollment = {
  schemaVersion: 1;
  kind: "receiver-verification-key-enrollment";
  algorithm: "Ed25519";
  createdAt: string;
  organization: string;
  displayName: string;
  keyId: string;
  publicKeyBase64: string;
  replacesKeyId: string | null;
  proofOfPossessionBase64: string;
  packageFingerprint: string;
};

export type ReceiverIdentitySigningRequest = {
  schemaVersion: 1;
  kind: "receiver-verification-identity-signing-request";
  algorithm: "Ed25519";
  payloadEncoding: "base64";
  signedAt: string;
  receiptFingerprint: string;
  handoffFingerprint: string;
  sourceCalculationFingerprint: string;
  organization: string;
  payloadBase64: string;
  requestFingerprint: string;
};

export type ReceiverIdentitySignatureResponse = {
  schemaVersion: 1;
  kind: "receiver-verification-identity-signature-response";
  signingRequest: ReceiverIdentitySigningRequest;
  signature: {
    algorithm: "Ed25519";
    keyId: string;
    publicKeyBase64: string;
    signatureBase64: string;
  };
};

export type SourceEvidenceIdentitySigningRequest = {
  schemaVersion: 1;
  kind: "source-evidence-verification-identity-signing-request";
  algorithm: "Ed25519";
  payloadEncoding: "base64";
  signedAt: string;
  verificationFingerprint: string;
  handoffFingerprint: string;
  receiptFingerprint: string;
  sourceCalculationFingerprint: string;
  organization: string;
  payloadBase64: string;
  requestFingerprint: string;
};

export type SourceEvidenceIdentitySignatureResponse = {
  schemaVersion: 1;
  kind: "source-evidence-verification-identity-signature-response";
  signingRequest: SourceEvidenceIdentitySigningRequest;
  signature: {
    algorithm: "Ed25519";
    keyId: string;
    publicKeyBase64: string;
    signatureBase64: string;
  };
};

export type RemovalTransferReceiptImportResponse = {
  project: ProjectState;
  handoff: RemovalTransferHandoff;
  receipt: ReceiverCapacityVerificationReceipt;
  receiptValidation: {
    integrity: "valid";
    engineeringStatus: "passed" | "failed";
    verifierIdentity: ReceiverIdentityStatus;
    identityVerification: ReceiverIdentityVerification;
  };
};

export type SourceCapacityEvidenceVerificationResponse = {
  project: ProjectState;
  record: SourceCapacityEvidenceVerification;
  identityVerification: ReceiverIdentityVerification;
};

export type BootstrapPayload = {
  reference_data: ReferenceData;
  default_project: ProjectState;
  sample_analysis_files: string[];
};

export type ReportPayload = {
  project: ProjectState;
  report_path: string;
  download_url: string;
  latest_download_url?: string | null;
  report_mode: "detailed" | "concise";
  report_kind: "pdf" | "docx";
  document_status: "internal-review" | "formal-attachment";
  approval_time?: string | null;
  canonical_evidence_url?: string | null;
  formal_source_bundle_url?: string | null;
};
