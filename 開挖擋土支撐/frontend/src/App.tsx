import { ChangeEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  applyReceiverEvidenceTemplate,
  approveReceiverEvidenceTemplate,
  buildReceiverEvidenceTemplateLibrary,
  LEGACY_GOVERNED_RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
  LEGACY_RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
  mergeReceiverEvidenceTemplates,
  parseReceiverEvidenceTemplateLibrary,
  prepareImportedReceiverEvidenceTemplates,
  prepareSignedImportedReceiverEvidenceTemplates,
  RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
  ReceiverEvidenceTemplate,
  ReceiverEvidenceTemplatePublisherStatus,
  receiverEvidenceTemplateAvailability,
  reviseReceiverEvidenceTemplate,
  revokeReceiverEvidenceTemplateApproval,
  templateFromSupplementalCheck,
} from "./receiverEvidenceTemplates";
import {
  AnalysisEvent,
  AnalysisForceCase,
  AnalysisImportResult,
  AnalysisSideSource,
  AnalysisSourceMode,
  BoltStrengthRow,
  BootstrapPayload,
  BraceRow,
  CalculationOptions,
  CheckResult,
  ColumnScenarioInput,
  ConstructionStageLoadAdoption,
  ConstructionStageLoadSource,
  CornerBraceRow,
  ProjectListItem,
  ProjectState,
  ReceiverCapacityEvidence,
  ReceiverCapacityVerificationReceipt,
  ReceiverIdentityVerification,
  ReceiverIdentitySignatureResponse,
  ReceiverKeyEnrollment,
  ReceiverLimitState,
  ReceiverSupplementalCheck,
  ReceiverSupplementalCheckId,
  ReceiverRevocationReason,
  ReceiverRotationRequest,
  ReceiverOperator,
  ReceiverOperatorAuditEvent,
  ReceiverOperatorAuditSummary,
  ReceiverOperatorAuthState,
  ReceiverOperatorGovernanceBackup,
  ReceiverOperatorGovernanceRestorePreview,
  ReceiverOperatorGovernanceRestoreResult,
  ReceiverOperatorBackupDispositionReceipt,
  ReceiverOperatorRecoveryDrillReceipt,
  ReceiverOperatorRecoveryInventory,
  ReceiverOperatorRole,
  ReceiverTrustEvent,
  ReceiverTrustKey,
  ReceiverTrustRegistryBackup,
  ReceiverTrustRestorePreview,
  ReceiverVerificationAuthority,
  ReceiverVerificationResult,
  ReshoreMemberCapacityCalculationResponse,
  ReshoreMemberCapacityInput,
  ReferenceData,
  RemovalTransferHandoff,
  RemovalTransferMode,
  RemovalTransferReceiverAllocation,
  SectionProperty,
  SoilLayer,
  SourceCapacityEvidenceVerification,
  SourceEvidenceIdentitySignatureResponse,
  SupportRow,
  SummaryItem,
  WaleRow,
} from "./types";

const STEP_PROJECT = 0;
const STEP_ANALYSIS = 1;
const STEP_COMPONENTS = 2;
const STEP_COLUMNS = 3;
const STEP_RESULTS = 4;
const STEP_REPORT = 5;
const STEP_RECEIPT = 6;

const steps = [
  "專案設定",
  "分析成果匯入",
  "構件輸入",
  "柱構件",
  "檢核結果",
  "報表匯出",
  "接收端回簽助手",
];

const receiverLimitStateOptions: Array<{ value: ReceiverLimitState; label: string }> = [
  { value: "axial", label: "軸力／拉壓" },
  { value: "shear", label: "剪力" },
  { value: "bending", label: "彎曲" },
  { value: "stability", label: "挫屈／穩定" },
  { value: "punching", label: "沖切" },
  { value: "connection", label: "連接" },
  { value: "foundation", label: "基礎" },
  { value: "other", label: "其他" },
];

const receiverSupplementalCheckOptions: Array<{ value: ReceiverSupplementalCheckId; label: string }> = [
  { value: "connection", label: "接頭與接合" },
  { value: "bearing", label: "端部與局部承壓" },
  { value: "receiving-structure", label: "基礎、樓版或承接主體" },
  { value: "bracing-and-effective-length", label: "側向支撐與有效長度條件" },
  { value: "construction-sequence-and-preload", label: "施工順序、預載與卸載控制" },
];

const columnVariantOptions: Array<{
  value: ColumnScenarioInput["variant"];
  label: string;
}> = [
  { value: "middle", label: "中間柱" },
  { value: "composite_normal", label: "共構柱（一般）" },
  { value: "composite_crane", label: "共構柱（大吊車）" },
];

type AnalysisSourceSide = "top" | "bottom";
type AnalysisWorkflowMode = "single_manual" | "dual_manual" | "single_import" | "dual_import" | "mixed";
type ComponentTabKey = "support" | "wale" | "brace" | "corner";
type SourceCapacityEvidenceMatch = {
  transferId: string;
  evidenceKey: string;
  selectedFileName: string;
  actualSha256: string;
  expectedSha256: string;
  matched: boolean;
  fileNameMatched: boolean;
  checkedAt: string;
};

const ADVANCED_PARAMETER_DEFAULTS = {
  alpha_support: 1.25,
  alpha_wale: 1.25,
  alpha_brace: 1.25,
  alpha_corner_brace: 1.25,
  alpha_column: 1.25,
  psi_material: 0.9,
} as const;

const foundationTypeOptions = ["鑽掘或引孔樁", "打入樁"] as const;
const foundationShapeOptions = ["(直徑)", "(寬×長)"] as const;
const wallTypeOptions = ["連續壁", "鋼板樁", "其他"] as const;

const receiverRevocationReasonOptions: Array<{ value: ReceiverRevocationReason; label: string }> = [
  { value: "suspected-compromise", label: "疑似私鑰或密碼外洩" },
  { value: "confirmed-compromise", label: "確認私鑰或密碼外洩" },
  { value: "lost-key-or-password", label: "私鑰或密碼遺失" },
  { value: "custodian-change", label: "保管人異動" },
  { value: "organization-change", label: "組織或單位異動" },
  { value: "retired", label: "一般除役" },
  { value: "other", label: "其他" },
];

const emptyReceiverRevocationDraft = {
  reasonCode: "suspected-compromise" as ReceiverRevocationReason,
  reason: "",
  incidentReference: "",
  confirmed: false,
};

const emptyReceiverRotationDraft = {
  reason: "新金鑰已完成測試簽署與使用端切換，輪替完成後停用舊金鑰。",
  incidentReference: "",
  confirmed: false,
};

const emptyReceiverRotationApprovalDraft = {
  confirmed: false,
};

const emptyReceiverOperatorLoginDraft = { username: "", password: "" };
const emptyReceiverOperatorBootstrapDraft = { username: "", displayName: "", password: "" };
const emptyReceiverOperatorCreateDraft = {
  username: "",
  displayName: "",
  password: "",
  roles: [] as ReceiverOperatorRole[],
};
const emptyReceiverOperatorManageDraft = {
  operatorId: "",
  roles: [] as ReceiverOperatorRole[],
  temporaryPassword: "",
};
const emptyReceiverOperatorPasswordChangeDraft = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
const emptyReceiverOperatorBackupDraft = {
  passphrase: "",
  confirmPassphrase: "",
  recoveryUsername: "",
  recoveryPassword: "",
  retainServerCopy: false,
  retentionDays: 30,
};
const emptyReceiverOperatorBackupDispositionDraft = {
  backupFingerprint: "",
  caseReference: "",
  basis: "依組織備份媒體保存與到期處置程序辦理。",
  confirmed: false,
};
const emptyReceiverOperatorBackupDispositionApprovalDraft = {
  requestFingerprint: "",
  confirmed: false,
};
const emptyReceiverOperatorAuditSummary: ReceiverOperatorAuditSummary = {
  events: [],
  chainValid: true,
  eventCount: 0,
  headFingerprint: null,
};

const receiverOperatorRoleOptions: Array<{ value: ReceiverOperatorRole; label: string }> = [
  { value: "receiver-key-admin", label: "接收端金鑰管理員" },
  { value: "receiver-key-requester", label: "治理申請人" },
  { value: "receiver-key-approver", label: "治理覆核人" },
];

const receiverOperatorGovernancePermissionRows: Array<{
  role: ReceiverOperatorRole;
  administration: string;
  request: string;
  approval: string;
  control: string;
}> = [
  {
    role: "receiver-key-admin",
    administration: "可：公鑰登錄／撤銷、帳號與角色管理、清冊及治理備份／復原／演練",
    request: "須另授治理申請人角色",
    approval: "須另授治理覆核人角色",
    control: "不得自行停用、改角色或由管理入口重設自己的密碼；不得停用最後一位啟用管理員。",
  },
  {
    role: "receiver-key-requester",
    administration: "不可",
    request: "可：提出金鑰輪替完成及到期備份處置申請",
    approval: "不可覆核自己的申請",
    control: "只提出申請；不撤銷舊金鑰、不移除備份，申請有效期為 72 小時。",
  },
  {
    role: "receiver-key-approver",
    administration: "不可",
    request: "不可",
    approval: "可：第二人覆核輪替完成及到期備份處置",
    control: "operator ID 必須與申請者不同；備份處置只做一般檔案項目移除，不代表安全抹除。",
  },
];

function receiverOperatorRoleLabel(role: ReceiverOperatorRole): string {
  return receiverOperatorRoleOptions.find((option) => option.value === role)?.label ?? role;
}

function receiverOperatorRoleLabels(roles: ReceiverOperatorRole[]): string {
  return roles.map(receiverOperatorRoleLabel).join("、") || "—";
}

function receiverOperatorStatusLabel(
  status: "enabled" | "disabled" | "password-reset-required",
): string {
  return {
    enabled: "啟用",
    disabled: "已停用",
    "password-reset-required": "待變更臨時密碼",
  }[status];
}

function receiverOperatorAuditEventLabel(eventType: ReceiverOperatorAuditEvent["eventType"]): string {
  return {
    "operator-bootstrap-created": "建立首位管理員",
    "operator-created": "建立操作帳號",
    "operator-roles-changed": "變更帳號角色",
    "operator-disabled": "停用帳號",
    "operator-enabled": "重新啟用帳號",
    "operator-password-reset": "管理員重設密碼",
    "operator-password-changed": "本人變更密碼",
    "operator-governance-backup-exported": "匯出操作員治理備份",
    "operator-backup-disposition-requested": "提出到期備份處置",
    "operator-backup-disposition-approved": "第二人覆核到期備份處置",
    "operator-backup-disposition-completed": "完成到期備份處置",
    "operator-governance-restored": "復原操作員治理快照",
  }[eventType] ?? eventType;
}

function receiverOperatorAuditDetail(event: ReceiverOperatorAuditEvent): string {
  const roles = Array.isArray(event.details.roles) ? event.details.roles : [];
  const previousRoles = Array.isArray(event.details.previousRoles) ? event.details.previousRoles : [];
  const roleLabel = (role: unknown) => {
    const value = String(role);
    return receiverOperatorRoleOptions.find((option) => option.value === value)?.label ?? value;
  };
  if (event.eventType === "operator-roles-changed") {
    return `${previousRoles.map(roleLabel).join("、") || "—"} → ${roles.map(roleLabel).join("、") || "—"}`;
  }
  if (event.eventType === "operator-created" || event.eventType === "operator-bootstrap-created") {
    return roles.map(roleLabel).join("、") || "—";
  }
  const blocked = Number(event.details.blockedPendingRotationClaims ?? 0);
  const blockedDisposition = Number(event.details.blockedPendingBackupDispositionClaims ?? 0);
  const revoked = Number(event.details.revokedSessions ?? 0);
  if (event.eventType === "operator-disabled") return `撤銷工作階段 ${revoked}；阻斷輪替申請 ${blocked}；阻斷備份處置申請 ${blockedDisposition}`;
  if (event.eventType === "operator-password-reset" || event.eventType === "operator-password-changed") {
    return `撤銷工作階段 ${revoked}`;
  }
  if (event.eventType === "operator-governance-backup-exported") {
    const retention = event.details.managedCopyRequested === true
      ? `；保留受管制本機副本 ${String(event.details.retentionDays ?? "—")} 天`
      : "；未保留伺服器副本";
    return `匯出請求 ${String(event.details.backupExportRequestId ?? "—")}${retention}`;
  }
  if (event.eventType === "operator-governance-restored") {
    const fingerprint = String(event.details.backupFingerprint ?? "—");
    return `備份 ${fingerprint}；撤銷工作階段 ${revoked}`;
  }
  if (event.eventType === "operator-backup-disposition-requested") {
    return `申請 ${String(event.details.requestFingerprint ?? "—")}；備份 ${String(event.details.backupFingerprint ?? "—")}；案件 ${String(event.details.caseReference ?? "—")}`;
  }
  if (event.eventType === "operator-backup-disposition-approved") {
    return `申請 ${String(event.details.requestFingerprint ?? "—")}；已授權一般檔案移除，非安全抹除`;
  }
  if (event.eventType === "operator-backup-disposition-completed") {
    return `申請 ${String(event.details.requestFingerprint ?? "—")}；收據 ${String(event.details.receiptFingerprint ?? "—")}`;
  }
  return "—";
}

function receiverTrustEventReasonLabel(value: ReceiverTrustEvent["reasonCode"]): string {
  if (value === "new-registration") return "新金鑰登錄";
  if (value === "rotation-registration") return "輪替金鑰登錄";
  if (value === "rotation-completion-request") return "輪替完成申請";
  if (value === "superseded-after-rotation") return "輪替完成後停用舊金鑰";
  return receiverRevocationReasonOptions.find((option) => option.value === value)?.label ?? value;
}

function receiverKeyRotationStatus(
  key: ReceiverTrustKey,
  keys: ReceiverTrustKey[],
  requests: ReceiverRotationRequest[],
): { label: string; tone: "pending" | "completed" | "attention"; oldKey: ReceiverTrustKey | null } | null {
  if (!key.replacesKeyId) return null;
  const oldKey = keys.find((item) => item.keyId === key.replacesKeyId) ?? null;
  if (key.status === "revoked") return { label: "輪替新金鑰已撤銷，需重新規劃", tone: "attention", oldKey };
  if (!oldKey) return { label: "找不到輪替舊金鑰，禁止完成", tone: "attention", oldKey };
  if (oldKey.status === "trusted") {
    const latestRequest = [...requests].reverse().find((item) => item.newKeyId === key.keyId);
    if (latestRequest?.status === "pending") {
      return { label: "輪替申請待第二人覆核：新舊金鑰仍同時受信任", tone: "pending", oldKey };
    }
    if (latestRequest?.status === "expired") {
      return { label: "輪替申請已逾期：需重新提出", tone: "attention", oldKey };
    }
    return { label: "輪替待申請：新舊金鑰仍同時受信任", tone: "pending", oldKey };
  }
  if (
    oldKey.revocationReasonCode === "superseded-after-rotation"
    && oldKey.replacedByKeyId === key.keyId
    && key.rotationCompletionEventFingerprint === oldKey.revocationEventFingerprint
  ) {
    return { label: "輪替已完成：舊金鑰已受控撤銷", tone: "completed", oldKey };
  }
  return { label: "舊金鑰已另案撤銷，輪替關聯需人工複核", tone: "attention", oldKey };
}

function receiverRotationRequestStatusLabel(status: ReceiverRotationRequest["status"]): string {
  if (status === "pending") return "等待第二人覆核";
  if (status === "completed") return "已覆核完成";
  if (status === "expired") return "已逾 72 小時期限";
  return "金鑰狀態已變更，禁止執行";
}

function receiverTemplatePublisherStatusLabel(status: ReceiverEvidenceTemplatePublisherStatus): string {
  if (status === "trusted-signature-valid") return "匯入時受信任簽章";
  if (status === "valid-signature-revoked-key") return "匯入時金鑰已撤銷";
  if (status === "valid-signature-organization-mismatch") return "匯入時單位不符";
  return "匯入時簽章有效但未登錄";
}

type ConstructionStageHandoff = {
  schemaVersion: number;
  kind: string;
  generatedAt?: string;
  handoffFingerprint: string;
  source?: {
    toolId?: string;
    toolName?: string;
    toolVersion?: string;
    projectName?: string;
    projectNo?: string;
    calculationFingerprint?: string;
  };
  load?: {
    target?: string;
    unit?: string;
    controlAxialLoadTf?: number;
    controllingCases?: string[];
    cases?: Array<{ key?: string; label?: string; valueTf?: number }>;
  };
  boundary?: {
    requiresExplicitAcceptance?: boolean;
    autoApplied?: boolean;
    scope?: string;
  };
};

function canonicalizeHandoffValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeHandoffValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalizeHandoffValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

async function constructionStageHandoffFingerprint(record: ConstructionStageHandoff): Promise<string> {
  const source = { ...record } as Partial<ConstructionStageHandoff>;
  delete source.handoffFingerprint;
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalizeHandoffValue(source)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `CSH-${hex.slice(0, 20).toUpperCase()}`;
}

async function validateConstructionStageHandoff(record: ConstructionStageHandoff): Promise<void> {
  if (record.schemaVersion !== 1 || record.kind !== "construction-stage-decking-load-handoff") {
    throw new Error("施工階段荷重交接檔版本或種類不受支援。");
  }
  if (record.load?.target !== "excavation-composite-column" || record.load?.unit !== "tf") {
    throw new Error("施工階段荷重交接目標或單位不受支援。");
  }
  if (!Number.isFinite(record.load.controlAxialLoadTf) || Number(record.load.controlAxialLoadTf) <= 0) {
    throw new Error("施工階段荷重交接檔缺少有效控制軸力。");
  }
  if (!/^CF-[0-9A-F]{16}$/.test(record.source?.calculationFingerprint ?? "")) {
    throw new Error("施工階段荷重交接檔缺少有效來源計算指紋。");
  }
  if (!/^CSH-[0-9A-F]{20}$/.test(record.handoffFingerprint ?? "")) {
    throw new Error("施工階段荷重交接指紋格式不正確。");
  }
  if (record.boundary?.requiresExplicitAcceptance !== true || record.boundary?.autoApplied !== false) {
    throw new Error("施工階段荷重交接檔未保留明確採用邊界。");
  }
  if (record.handoffFingerprint !== await constructionStageHandoffFingerprint(record)) {
    throw new Error("施工階段荷重交接內容與交接指紋不一致。");
  }
}

function constructionStageSourceFromRecord(record: ConstructionStageHandoff): ConstructionStageLoadSource {
  return {
    kind: "construction-stage-decking-load-handoff",
    handoff_fingerprint: record.handoffFingerprint,
    source_tool: record.source?.toolName || "覆工板系統計算工具",
    source_version: record.source?.toolVersion || "",
    source_calculation_fingerprint: record.source?.calculationFingerprint || "",
    source_project_name: record.source?.projectName || "",
    source_project_no: record.source?.projectNo || "",
    controlling_cases: Array.isArray(record.load?.controllingCases) ? [...record.load.controllingCases] : [],
    handoff_record: JSON.parse(JSON.stringify(record)) as Record<string, unknown>,
  };
}

function uniqueConstructionStageLabel(stages: ConstructionStageLoadAdoption[], requested: string): string {
  const base = (requested.trim() || `施工階段 ${stages.length + 1}`).slice(0, 72);
  const used = new Set(stages.map((stage) => stage.stage_label.trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${base} (${suffix})`.slice(0, 80);
}

function constructionStageDistributionSummary(project: ProjectState, fingerprint: string): { count: number; total: number } {
  const assignments = project.columns
    .filter((column) => column.enabled)
    .flatMap((column) => column.construction_stage_loads ?? [])
    .filter((stage) => stage.source.handoff_fingerprint === fingerprint);
  return {
    count: assignments.length,
    total: assignments.reduce((sum, stage) => sum + (stage.distribution_factor ?? 1), 0),
  };
}

const columnNumericFields: Array<keyof ColumnScenarioInput> = [
  "foundation_size_x_m",
  "foundation_size_y_m",
  "column_length_m",
  "kh_kg_per_cm3",
  "bottom_to_excavation_distance_m",
  "eccentricity_y_m",
  "embedment_length_cm",
  "concrete_strength_kg_per_cm2",
  "compression_fs",
  "tension_fs",
  "pile_unit_weight_t_per_m3",
];

const columnNullableNumberFields: Array<keyof ColumnScenarioInput> = [
  "eccentricity_x_m",
  "pile_width_cm",
];

const analysisWorkflowOptions: Array<{
  value: AnalysisWorkflowMode;
  label: string;
  description: string;
}> = [
  {
    value: "single_manual",
    label: "單層手動",
    description: "整頁輸入單側支撐荷重與型號，適合先做單層支撐檢討。",
  },
  {
    value: "dual_manual",
    label: "雙層手動",
    description: "上下層分開完整輸入，不再使用左右窄欄位。",
  },
  {
    value: "single_import",
    label: "單層匯入",
    description: "選定上層或下層後匯入單份分析檔，再做微調。",
  },
  {
    value: "dual_import",
    label: "雙層匯入",
    description: "依序匯入上層與下層資料，最後再一起檢查。",
  },
  {
    value: "mixed",
    label: "進階混合",
    description: "允許上層與下層分別選擇匯入、手動或不使用。",
  },
];

function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<ReferenceData | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [reportUrl, setReportUrl] = useState<string>("");
  const [pdfEvidenceUrl, setPdfEvidenceUrl] = useState<string>("");
  const [pdfSourceBundleUrl, setPdfSourceBundleUrl] = useState<string>("");
  const [wordReportUrl, setWordReportUrl] = useState<string>("");
  const [conciseReportMode, setConciseReportMode] = useState<boolean>(false);
  const [reportApproved, setReportApproved] = useState<boolean>(false);
  const [generatedPdfMode, setGeneratedPdfMode] = useState<"detailed" | "concise" | null>(null);
  const [generatedWordMode, setGeneratedWordMode] = useState<"detailed" | "concise" | null>(null);
  const [generatedPdfDocumentStatus, setGeneratedPdfDocumentStatus] = useState<"internal-review" | "formal-attachment" | null>(null);
  const [generatedWordDocumentStatus, setGeneratedWordDocumentStatus] = useState<"internal-review" | "formal-attachment" | null>(null);
  const [removalTransferHandoff, setRemovalTransferHandoff] = useState<RemovalTransferHandoff | null>(null);
  const [removalTransferReceipt, setRemovalTransferReceipt] = useState<ReceiverCapacityVerificationReceipt | null>(null);
  const [removalTransferIdentityVerification, setRemovalTransferIdentityVerification] = useState<ReceiverIdentityVerification | null>(null);
  const [sourceCapacityEvidenceMatches, setSourceCapacityEvidenceMatches] = useState<Record<string, SourceCapacityEvidenceMatch>>({});
  const [sourceEvidenceVerificationAuthority, setSourceEvidenceVerificationAuthority] = useState({
    organization: "",
    verifierName: "",
    verifierRole: "",
  });
  const [sourceEvidenceVerificationBasis, setSourceEvidenceVerificationBasis] = useState(
    "依 RVR v3 以上版本逐列比對來源端實際收到之承載力文件 SHA-256",
  );
  const [sourceEvidenceVerificationRecord, setSourceEvidenceVerificationRecord] = useState<SourceCapacityEvidenceVerification | null>(null);
  const [sourceEvidenceIdentityVerification, setSourceEvidenceIdentityVerification] = useState<ReceiverIdentityVerification | null>(null);
  const [receiverAssistantHandoff, setReceiverAssistantHandoff] = useState<RemovalTransferHandoff | null>(null);
  const [receiverAssistantAuthority, setReceiverAssistantAuthority] = useState<ReceiverVerificationAuthority>({
    organization: "",
    verifierName: "",
    verifierRole: "",
    reportReference: "",
  });
  const [receiverAssistantResults, setReceiverAssistantResults] = useState<ReceiverVerificationResult[]>([]);
  const [receiverEvidenceTemplates, setReceiverEvidenceTemplates] = useState<ReceiverEvidenceTemplate[]>(loadReceiverEvidenceTemplates);
  const [receiverEvidenceTemplateNotice, setReceiverEvidenceTemplateNotice] = useState("");
  const [receiverEvidenceTemplateBindings, setReceiverEvidenceTemplateBindings] = useState<Record<string, string>>({});
  const [receiverEvidenceTemplateReviewDrafts, setReceiverEvidenceTemplateReviewDrafts] = useState<Record<string, { reviewedBy: string; validUntil: string }>>({});
  const receiverEvidenceTemplatesPersisted = useRef(false);
  const [reshoreCapacityDrafts, setReshoreCapacityDrafts] = useState<Record<string, ReshoreMemberCapacityInput>>({});
  const [reshoreCapacityCalculations, setReshoreCapacityCalculations] = useState<Record<string, ReshoreMemberCapacityCalculationResponse>>({});
  const [receiverCalculationConfirmed, setReceiverCalculationConfirmed] = useState(false);
  const [receiverIdentityAcknowledged, setReceiverIdentityAcknowledged] = useState(false);
  const [receiverAssistantReceipt, setReceiverAssistantReceipt] = useState<ReceiverCapacityVerificationReceipt | null>(null);
  const [receiverAssistantIdentityVerification, setReceiverAssistantIdentityVerification] = useState<ReceiverIdentityVerification | null>(null);
  const [receiverTrustKeys, setReceiverTrustKeys] = useState<ReceiverTrustKey[]>([]);
  const [receiverTrustEvents, setReceiverTrustEvents] = useState<ReceiverTrustEvent[]>([]);
  const [receiverRotationRequests, setReceiverRotationRequests] = useState<ReceiverRotationRequest[]>([]);
  const [receiverOperatorAuth, setReceiverOperatorAuth] = useState<ReceiverOperatorAuthState>({
    bootstrapRequired: false,
    authenticated: false,
    operator: null,
  });
  const [receiverOperatorAuthLoaded, setReceiverOperatorAuthLoaded] = useState(false);
  const [receiverOperatorLoginDraft, setReceiverOperatorLoginDraft] = useState(emptyReceiverOperatorLoginDraft);
  const [receiverOperatorBootstrapDraft, setReceiverOperatorBootstrapDraft] = useState(emptyReceiverOperatorBootstrapDraft);
  const [receiverOperators, setReceiverOperators] = useState<ReceiverOperator[]>([]);
  const [receiverOperatorCreateDraft, setReceiverOperatorCreateDraft] = useState(emptyReceiverOperatorCreateDraft);
  const [receiverOperatorManageDraft, setReceiverOperatorManageDraft] = useState(emptyReceiverOperatorManageDraft);
  const [receiverOperatorPasswordChangeDraft, setReceiverOperatorPasswordChangeDraft] = useState(
    emptyReceiverOperatorPasswordChangeDraft,
  );
  const [receiverOperatorAuditSummary, setReceiverOperatorAuditSummary] = useState(
    emptyReceiverOperatorAuditSummary,
  );
  const [receiverOperatorBackupDraft, setReceiverOperatorBackupDraft] = useState(
    emptyReceiverOperatorBackupDraft,
  );
  const [receiverOperatorBackup, setReceiverOperatorBackup] = useState<ReceiverOperatorGovernanceBackup | null>(null);
  const [receiverOperatorRestorePreview, setReceiverOperatorRestorePreview] = useState<ReceiverOperatorGovernanceRestorePreview | null>(null);
  const [receiverOperatorRestoreConfirmed, setReceiverOperatorRestoreConfirmed] = useState(false);
  const [receiverOperatorRestoreOutcome, setReceiverOperatorRestoreOutcome] = useState<ReceiverOperatorGovernanceRestoreResult | null>(null);
  const [receiverOperatorRecoveryInventory, setReceiverOperatorRecoveryInventory] = useState<ReceiverOperatorRecoveryInventory | null>(null);
  const [receiverOperatorDrillOutcome, setReceiverOperatorDrillOutcome] = useState<ReceiverOperatorRecoveryDrillReceipt | null>(null);
  const [receiverOperatorBackupDispositionDraft, setReceiverOperatorBackupDispositionDraft] = useState(
    emptyReceiverOperatorBackupDispositionDraft,
  );
  const [receiverOperatorBackupDispositionApprovalDraft, setReceiverOperatorBackupDispositionApprovalDraft] = useState(
    emptyReceiverOperatorBackupDispositionApprovalDraft,
  );
  const [receiverOperatorBackupDispositionOutcome, setReceiverOperatorBackupDispositionOutcome] = useState<ReceiverOperatorBackupDispositionReceipt | null>(null);
  const [receiverTrustDraft, setReceiverTrustDraft] = useState({ organization: "", displayName: "", publicKey: "" });
  const [receiverTrustEnrollment, setReceiverTrustEnrollment] = useState<ReceiverKeyEnrollment | null>(null);
  const [receiverTrustVerificationConfirmed, setReceiverTrustVerificationConfirmed] = useState(false);
  const [receiverRevocationKeyId, setReceiverRevocationKeyId] = useState<string | null>(null);
  const [receiverRevocationDraft, setReceiverRevocationDraft] = useState(emptyReceiverRevocationDraft);
  const [receiverRotationKeyId, setReceiverRotationKeyId] = useState<string | null>(null);
  const [receiverRotationDraft, setReceiverRotationDraft] = useState(emptyReceiverRotationDraft);
  const [receiverRotationApprovalRequestFingerprint, setReceiverRotationApprovalRequestFingerprint] = useState<string | null>(null);
  const [receiverRotationApprovalDraft, setReceiverRotationApprovalDraft] = useState(emptyReceiverRotationApprovalDraft);
  const [receiverTrustBackup, setReceiverTrustBackup] = useState<ReceiverTrustRegistryBackup | null>(null);
  const [receiverTrustRestorePreview, setReceiverTrustRestorePreview] = useState<ReceiverTrustRestorePreview | null>(null);
  const [receiverTrustRestoreConfirmed, setReceiverTrustRestoreConfirmed] = useState(false);
  const [receiverTrustRestoreOutcome, setReceiverTrustRestoreOutcome] = useState<{ registryFingerprint: string; safeguardPath: string | null } | null>(null);
  const [analysisSingleSide, setAnalysisSingleSide] = useState<AnalysisSourceSide>("top");
  const [componentTab, setComponentTab] = useState<ComponentTabKey>("support");
  const [advancedSettingsExpanded, setAdvancedSettingsExpanded] = useState(false);
  const [quickSettingsExpanded, setQuickSettingsExpanded] = useState(false);
  const [pendingPanelFocus, setPendingPanelFocus] = useState<string | null>(null);
  const [highlightPanelId, setHighlightPanelId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [persistedProjectSnapshot, setPersistedProjectSnapshot] = useState("");
  const reportModeLabel = conciseReportMode ? "簡述版" : "詳細版";
  const reportDocumentStatusLabel = reportApproved ? "正式附件" : "內部審閱";
  const receiverOperatorRoles = receiverOperatorAuth.operator?.roles ?? [];
  const receiverPasswordResetRequired = Boolean(receiverOperatorAuth.operator?.passwordResetRequired);
  const receiverCanAdministerKeys = !receiverPasswordResetRequired && receiverOperatorRoles.includes("receiver-key-admin");
  const receiverCanRequestRotation = !receiverPasswordResetRequired && receiverOperatorRoles.includes("receiver-key-requester");
  const receiverCanApproveRotation = !receiverPasswordResetRequired && receiverOperatorRoles.includes("receiver-key-approver");
  const managedReceiverOperator = receiverOperators.find(
    (operator) => operator.id === receiverOperatorManageDraft.operatorId,
  ) ?? null;
  const activeRemovalTransferHandoff = useMemo(
    () => removalTransferHandoff ?? latestRemovalTransferHandoff(project),
    [project?.removal_transfer_handoffs, removalTransferHandoff],
  );
  const activeRemovalTransferReceipt = useMemo(
    () => removalTransferReceipt ?? latestRemovalTransferReceipt(project, activeRemovalTransferHandoff?.handoffFingerprint),
    [project?.removal_transfer_verification_receipts, removalTransferReceipt, activeRemovalTransferHandoff?.handoffFingerprint],
  );
  const activeSourceEvidenceVerification = useMemo(
    () => sourceEvidenceVerificationRecord
      ?? latestSourceCapacityEvidenceVerification(project, activeRemovalTransferReceipt?.receiptFingerprint),
    [project?.source_capacity_evidence_verifications, sourceEvidenceVerificationRecord, activeRemovalTransferReceipt?.receiptFingerprint],
  );
  const sourceCapacityEvidenceRequired = (activeRemovalTransferReceipt?.schemaVersion ?? 0) >= 3;
  const activeReceiptEvidenceItems = useMemo(
    () => activeRemovalTransferReceipt ? receiptEvidenceItems(activeRemovalTransferReceipt) : [],
    [activeRemovalTransferReceipt],
  );
  const sourceCapacityEvidenceAllMatched = useMemo(() => {
    if (!sourceCapacityEvidenceRequired || !activeReceiptEvidenceItems.length) return false;
    return activeReceiptEvidenceItems.every(
      (item) => sourceCapacityEvidenceMatches[sourceEvidenceMatchKey(item.result.transferId, item.evidenceKey)]?.matched === true,
    );
  }, [activeReceiptEvidenceItems, sourceCapacityEvidenceMatches, sourceCapacityEvidenceRequired]);
  const sourceCapacityEvidenceHasMismatch = useMemo(
    () => Object.values(sourceCapacityEvidenceMatches).some((match) => !match.matched),
    [sourceCapacityEvidenceMatches],
  );
  const sourceCapacityEvidenceSatisfied = sourceCapacityEvidenceRequired
    && !sourceCapacityEvidenceHasMismatch
    && (sourceCapacityEvidenceAllMatched || Boolean(activeSourceEvidenceVerification));
  const receiverAssistantReady = useMemo(() => {
    if (!receiverAssistantHandoff || !receiverCalculationConfirmed || !receiverIdentityAcknowledged) return false;
    if (Object.values(receiverAssistantAuthority).some((value) => !value.trim())) return false;
    if (receiverAssistantResults.length !== receiverAssistantHandoff.transfers.length) return false;
    return receiverAssistantResults.every((result) => (
      result.receiverTarget.trim().length > 0
      && result.verificationBasis.trim().length > 0
      && result.conclusion.trim().length > 0
      && Number.isFinite(result.adoptedDemandTf)
      && result.adoptedDemandTf > 0
      && Number.isFinite(result.verifiedCapacityTf)
      && (result.verifiedCapacityTf ?? 0) > 0
      && Number.isFinite(result.capacityUtilizationRatio)
      && result.capacityUtilizationRatio > 0
      && Math.abs(
        result.capacityUtilizationRatio
        - result.adoptedDemandTf / (result.verifiedCapacityTf ?? 1)
      ) <= 0.000001
      && receiverEvidenceComplete(result.capacityEvidence)
      && Boolean(result.verificationScope?.analysisModelReference.trim())
      && Boolean(result.verificationScope?.governingLoadCombination.trim())
      && Boolean(result.verificationScope?.directionAndDistributionBasis.trim())
      && Boolean(result.verificationScope?.eccentricityAndSecondaryEffectBasis.trim())
      && (result.verificationScope?.checkedLimitStates.length ?? 0) > 0
      && ["passed", "failed"].includes(result.verificationScope?.otherChecksStatus ?? "")
      && result.supplementalChecks?.length === receiverSupplementalCheckOptions.length
      && receiverSupplementalCheckOptions.every((option) => {
        const check = result.supplementalChecks?.find((item) => item.checkId === option.value);
        if (!check?.basis.trim()) return false;
        if (check.status === "passed") return receiverEvidenceComplete(check.evidence);
        if (check.status === "failed") return !check.evidence || receiverEvidenceComplete(check.evidence);
        return check.status === "not-applicable" && !check.evidence;
      })
      && result.verificationScope?.otherChecksStatus === (
        result.supplementalChecks?.some((check) => check.status === "passed")
        && !result.supplementalChecks?.some((check) => check.status === "failed")
          ? "passed"
          : "failed"
      )
      && !(
        result.verificationScope?.otherChecksStatus === "passed"
        && /^RSC-[0-9A-F]{20}$/.test(result.capacityEvidence?.documentReference ?? "")
      )
      && result.status === (
        result.adoptedDemandTf / (result.verifiedCapacityTf ?? 1) <= 1.000000001
        && result.verificationScope?.otherChecksStatus === "passed"
          ? "passed"
          : "failed"
      )
    ));
  }, [
    receiverAssistantHandoff,
    receiverAssistantAuthority,
    receiverAssistantResults,
    receiverCalculationConfirmed,
    receiverIdentityAcknowledged,
  ]);

  useEffect(() => {
    if (activeStep !== STEP_RECEIPT) return;
    let cancelled = false;
    Promise.all([api.listReceiverTrustKeys(), api.getReceiverOperatorSession()])
      .then(async ([response, auth]) => {
        if (!cancelled) {
          setReceiverTrustKeys(response.keys);
          setReceiverTrustEvents(response.events);
          setReceiverRotationRequests(response.rotationRequests);
          setReceiverOperatorAuth(auth);
          setReceiverOperatorAuthLoaded(true);
          if (auth.operator?.roles.includes("receiver-key-admin") && !auth.operator.passwordResetRequired) {
            const [operators, audit, inventory] = await Promise.all([
              api.listReceiverOperators(),
              api.listReceiverOperatorAuditEvents(),
              api.listReceiverOperatorGovernanceRecoveryInventory(),
            ]);
            if (!cancelled) {
              setReceiverOperators(operators.operators);
              setReceiverOperatorAuditSummary(audit);
              setReceiverOperatorRecoveryInventory(inventory);
            }
          } else {
            setReceiverOperators([]);
            setReceiverOperatorAuditSummary(emptyReceiverOperatorAuditSummary);
            setReceiverOperatorRecoveryInventory(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReceiverOperatorAuthLoaded(true);
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => { cancelled = true; };
  }, [activeStep]);

  useEffect(() => {
    if (!receiverEvidenceTemplatesPersisted.current) {
      receiverEvidenceTemplatesPersisted.current = true;
      return;
    }
    try {
      localStorage.setItem(
        RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
        JSON.stringify(buildReceiverEvidenceTemplateLibrary(receiverEvidenceTemplates, new Date().toISOString())),
      );
    } catch (err) {
      setError(err instanceof Error ? `無法保存補充證據範本：${err.message}` : "無法保存補充證據範本。");
    }
  }, [receiverEvidenceTemplates]);

  useEffect(() => {
    setSourceCapacityEvidenceMatches({});
    setSourceEvidenceVerificationRecord(null);
    setSourceEvidenceIdentityVerification(null);
  }, [activeRemovalTransferReceipt?.receiptFingerprint]);

  useEffect(() => {
    if (!project?.metadata.id || !activeSourceEvidenceVerification) {
      setSourceEvidenceIdentityVerification(null);
      return;
    }
    let cancelled = false;
    api.validateSourceEvidenceIdentity(
      project.metadata.id,
      activeSourceEvidenceVerification.verificationFingerprint,
    )
      .then((response) => {
        if (!cancelled) setSourceEvidenceIdentityVerification(response.identityVerification);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [project?.metadata.id, activeSourceEvidenceVerification?.verificationFingerprint, receiverTrustKeys]);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!project) return;
    const derivedSingleSide = deriveSingleAnalysisSide(
      project.top_analysis_source.mode,
      project.bottom_analysis_source.mode,
    );
    if (derivedSingleSide) {
      setAnalysisSingleSide(derivedSingleSide);
    }
  }, [project?.top_analysis_source.mode, project?.bottom_analysis_source.mode]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 360);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!pendingPanelFocus) return;
    const nextTab = componentTabForPanel(pendingPanelFocus);
    if (nextTab) {
      setComponentTab(nextTab);
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(pendingPanelFocus);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setHighlightPanelId(pendingPanelFocus);
        window.setTimeout(() => setHighlightPanelId((current) => (current === pendingPanelFocus ? null : current)), 2200);
      }
      setPendingPanelFocus(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeStep, pendingPanelFocus]);

  useEffect(() => {
    if (!project?.metadata.id || autoSaving) return;
    const isDirty = persistedProjectSnapshot
      ? serializeProjectState(project) !== persistedProjectSnapshot
      : false;
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setAutoSaving(true);
          const savedProject = await saveCurrentProjectState(project);
          setLastAutoSavedAt(savedProject.metadata.updated_at ?? new Date().toISOString());
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setAutoSaving(false);
        }
      })();
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [project, persistedProjectSnapshot, autoSaving]);

  async function initialize() {
    try {
      setBusy("初始化中");
      const [boot, projects] = await Promise.all([api.bootstrap(), api.listProjects()]);
      setBootstrap(boot);
      setReferenceDraft(boot.reference_data);
      setProjectList(projects);
      if (projects.length > 0) {
        const loaded = await api.getProject(projects[0].id);
        applyPersistedProjectState(loaded);
      } else {
        const created = await api.createProject("新建擋土支撐專案");
        applyPersistedProjectState(created);
        setProjectList(await api.listProjects());
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function reloadListAndProject(projectId?: string) {
    const projects = await api.listProjects();
    setProjectList(projects);
    const targetId = projectId ?? projects[0]?.id;
    if (targetId) {
      const loaded = await api.getProject(targetId);
      applyPersistedProjectState(loaded);
    }
  }

  function updateProjectListEntry(savedProject: ProjectState) {
    const nextItem = {
      id: savedProject.metadata.id ?? "",
      name: savedProject.metadata.name,
      updated_at: savedProject.metadata.updated_at ?? null,
    };
    setProjectList((current) => {
      const filtered = current.filter((item) => item.id !== nextItem.id);
      return [nextItem, ...filtered].sort((left, right) =>
        String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")),
      );
    });
  }

  async function handleCreateProject() {
    try {
      setBusy("建立專案");
      const created = await api.createProject(`新專案 ${new Date().toLocaleString("zh-TW")}`);
      applyPersistedProjectState(created);
      await reloadListAndProject(created.metadata.id ?? undefined);
      setActiveStep(STEP_PROJECT);
      setReportUrl("");
      setPdfEvidenceUrl("");
      setPdfSourceBundleUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
      setGeneratedPdfDocumentStatus(null);
      setGeneratedWordDocumentStatus(null);
      setReportApproved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleProjectSwitch(projectId: string) {
    try {
      setBusy("讀取專案");
      const loaded = await api.getProject(projectId);
      applyPersistedProjectState(loaded);
      setReportUrl("");
      setPdfEvidenceUrl("");
      setPdfSourceBundleUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
      setGeneratedPdfDocumentStatus(null);
      setGeneratedWordDocumentStatus(null);
      setReportApproved(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleSaveProject() {
    if (!project) return;
    try {
      setBusy("儲存專案");
      const response = await api.saveProject(syncProjectGuardrails(project));
      applyPersistedProjectState(response.project);
      await reloadListAndProject(response.project.metadata.id ?? undefined);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function saveCurrentProjectState(currentProject: ProjectState): Promise<ProjectState> {
    const response = await api.saveProject(syncProjectGuardrails(currentProject));
    applyPersistedProjectState(response.project);
    updateProjectListEntry(response.project);
    setLastAutoSavedAt(response.project.metadata.updated_at ?? new Date().toISOString());
    return response.project;
  }

  async function handleImportAnalysis(side: AnalysisSourceSide, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !project?.metadata.id) return;
    try {
      setBusy(`匯入${side === "top" ? "上層" : "下層"}分析檔`);
      const savedProject = await saveCurrentProjectState(project);
      const nextProject = await api.importAnalysis(savedProject.metadata.id ?? project.metadata.id, side, file);
      applyPersistedProjectState(nextProject);
      setActiveStep(STEP_ANALYSIS);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function handleCalculate() {
    if (!project?.metadata.id) return;
    try {
      setBusy("儲存並重新計算");
      const savedProject = await saveCurrentProjectState(project);
      const calculated = await api.calculate(savedProject.metadata.id ?? project.metadata.id);
      applyPersistedProjectState(calculated);
      setActiveStep(STEP_RESULTS);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleGenerateReport() {
    if (!project?.metadata.id) return;
    try {
      setBusy(reportApproved ? "儲存、產生 PDF 並逐頁驗證" : "儲存並產生 PDF");
      const savedProject = await saveCurrentProjectState(project);
      const response = await api.generateReport(savedProject.metadata.id ?? project.metadata.id, conciseReportMode, reportApproved);
      applyPersistedProjectState(response.project);
      setReportUrl(cacheBustUrl(response.download_url));
      setPdfEvidenceUrl(response.canonical_evidence_url ? cacheBustUrl(response.canonical_evidence_url) : "");
      setPdfSourceBundleUrl(response.formal_source_bundle_url ? cacheBustUrl(response.formal_source_bundle_url) : "");
      setGeneratedPdfMode(response.report_mode);
      setGeneratedPdfDocumentStatus(response.document_status);
      setActiveStep(STEP_REPORT);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleGenerateWordReport() {
    if (!project?.metadata.id) return;
    try {
      setBusy("儲存並產生 Word");
      const savedProject = await saveCurrentProjectState(project);
      const response = await api.generateWordReport(savedProject.metadata.id ?? project.metadata.id, conciseReportMode, reportApproved);
      applyPersistedProjectState(response.project);
      setWordReportUrl(cacheBustUrl(response.download_url));
      setGeneratedWordMode(response.report_mode);
      setGeneratedWordDocumentStatus(response.document_status);
      setActiveStep(STEP_REPORT);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleGenerateRemovalTransferHandoff() {
    if (!project?.metadata.id) return;
    try {
      setBusy("建立拆撐承接構造交接檔");
      const savedProject = await saveCurrentProjectState(project);
      const record = await api.generateRemovalTransferHandoff(savedProject.metadata.id ?? project.metadata.id);
      downloadJsonFile(
        record,
        `${savedProject.metadata.id ?? "excavation"}-拆撐承接構造交接-${record.handoffFingerprint}.json`,
      );
      const issuedHandoffs = [...(savedProject.removal_transfer_handoffs ?? [])];
      if (!issuedHandoffs.some((item) => item.handoffFingerprint === record.handoffFingerprint)) {
        issuedHandoffs.push(record);
      }
      setProject({ ...savedProject, removal_transfer_handoffs: issuedHandoffs });
      setRemovalTransferHandoff(record);
      setRemovalTransferReceipt(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleImportRemovalTransferReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!project?.metadata.id || !file) return;
    try {
      setBusy("驗證承接構造回簽");
      const response = await api.importRemovalTransferReceipt(project.metadata.id, file);
      applyProjectState(response.project);
      setRemovalTransferHandoff(response.handoff);
      setRemovalTransferReceipt(response.receipt);
      setRemovalTransferIdentityVerification(response.receiptValidation.identityVerification);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleSourceCapacityEvidenceFile(
    result: ReceiverVerificationResult,
    evidenceKey: string,
    evidence: ReceiverCapacityEvidence,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const actualSha256 = await fileSha256Hex(file);
      const expectedSha256 = evidence.fileSha256.toLowerCase();
      setSourceCapacityEvidenceMatches((current) => ({
        ...current,
        [sourceEvidenceMatchKey(result.transferId, evidenceKey)]: {
          transferId: result.transferId,
          evidenceKey,
          selectedFileName: file.name,
          actualSha256,
          expectedSha256,
          matched: actualSha256 === expectedSha256,
          fileNameMatched: file.name === evidence.fileName,
          checkedAt: new Date().toISOString(),
        },
      }));
      setSourceEvidenceVerificationRecord(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法計算來源端證據檔 SHA-256。");
    }
  }

  async function handleCreateSourceEvidenceVerification() {
    if (!project?.metadata.id || !activeRemovalTransferHandoff || !activeRemovalTransferReceipt) return;
    if (!sourceCapacityEvidenceAllMatched) {
      setError("請先逐列選取來源端實際收到的證據檔，並確認所有 SHA-256 均相符。");
      return;
    }
    try {
      setBusy("建立來源端證據核驗紀錄");
      const matches = activeReceiptEvidenceItems.map(({ result, evidenceKey }) => {
        const match = sourceCapacityEvidenceMatches[sourceEvidenceMatchKey(result.transferId, evidenceKey)];
        return {
          transferId: result.transferId,
          evidenceKey,
          selectedFileName: match.selectedFileName,
          actualSha256: match.actualSha256,
        };
      });
      const response = await api.createSourceCapacityEvidenceVerification(
        project.metadata.id,
        activeRemovalTransferHandoff.handoffFingerprint,
        activeRemovalTransferReceipt.receiptFingerprint,
        sourceEvidenceVerificationAuthority,
        sourceEvidenceVerificationBasis,
        matches,
      );
      applyPersistedProjectState(response.project);
      setSourceEvidenceVerificationRecord(response.record);
      setSourceEvidenceIdentityVerification(response.identityVerification);
      downloadJsonFile(
        response.record,
        `${project.metadata.id}-來源端證據核驗-${response.record.verificationFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadSourceEvidenceSigningRequest() {
    if (!project?.metadata.id || !activeSourceEvidenceVerification) return;
    try {
      setBusy("建立 SEV 身分簽署請求");
      const response = await api.buildSourceEvidenceIdentitySigningRequest(
        project.metadata.id,
        activeSourceEvidenceVerification.verificationFingerprint,
      );
      downloadJsonFile(
        response.signingRequest,
        `SEV-身分簽署請求-${response.signingRequest.requestFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleAttachSourceEvidenceSignature(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!project?.metadata.id || !activeSourceEvidenceVerification || !file) return;
    try {
      setBusy("附加並驗證 SEV 身分簽章");
      const parsed = JSON.parse(await file.text()) as SourceEvidenceIdentitySignatureResponse;
      const response = await api.attachSourceEvidenceIdentitySignature(
        project.metadata.id,
        activeSourceEvidenceVerification.verificationFingerprint,
        parsed,
      );
      applyPersistedProjectState(response.project);
      setSourceEvidenceVerificationRecord(response.record);
      setSourceEvidenceIdentityVerification(response.identityVerification);
      downloadJsonFile(
        response.record,
        `${project.metadata.id}-來源端證據核驗-已簽署-${response.record.verificationFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function loadReceiverAssistantHandoff(record: RemovalTransferHandoff) {
    setReceiverAssistantHandoff(record);
    setReceiverAssistantResults(receiverResultDrafts(record));
    setReceiverEvidenceTemplateBindings({});
    setReshoreCapacityDrafts(receiverCapacityDrafts(record, bootstrap?.reference_data));
    setReshoreCapacityCalculations({});
    setReceiverCalculationConfirmed(false);
    setReceiverIdentityAcknowledged(false);
    setReceiverAssistantReceipt(null);
    setReceiverAssistantIdentityVerification(null);
  }

  function openReceiverAssistant(record?: RemovalTransferHandoff | null) {
    if (record) loadReceiverAssistantHandoff(record);
    setActiveStep(STEP_RECEIPT);
    setError("");
  }

  async function handleImportReceiverAssistantHandoff(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setBusy("驗證 ERH 交接檔");
      const parsed = JSON.parse(await file.text()) as RemovalTransferHandoff;
      const handoff = await api.validateRemovalTransferHandoff(parsed);
      loadReceiverAssistantHandoff(handoff);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleBuildReceiverAssistantReceipt() {
    if (!receiverAssistantHandoff) return;
    if (!receiverCalculationConfirmed || !receiverIdentityAcknowledged) {
      setError("請先確認接收端計算已完成，並了解 RVR 不取代回簽人身分核對。");
      return;
    }
    try {
      setBusy("建立接收端 RVR 回簽");
      const response = await api.buildReceiverVerificationReceipt(
        receiverAssistantHandoff,
        receiverAssistantAuthority,
        receiverAssistantResults,
      );
      setReceiverAssistantReceipt(response.receipt);
      setReceiverAssistantIdentityVerification(response.receiptValidation.identityVerification);
      downloadJsonFile(
        response.receipt,
        `承接構造回簽-${response.receipt.handoffFingerprint}-${response.receipt.receiptFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleValidateReceiverAssistantReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !receiverAssistantHandoff) return;
    try {
      setBusy("檢查既有 RVR 回簽");
      const parsed = JSON.parse(await file.text()) as unknown;
      const response = await api.validateReceiverVerificationReceipt(receiverAssistantHandoff, parsed);
      setReceiverAssistantAuthority(response.receipt.verificationAuthority);
      setReceiverAssistantResults(response.receipt.results);
      setReceiverEvidenceTemplateBindings({});
      setReceiverAssistantReceipt(response.receipt);
      setReceiverAssistantIdentityVerification(response.receiptValidation.identityVerification);
      setReceiverCalculationConfirmed(true);
      setReceiverIdentityAcknowledged(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadReceiverIdentitySigningRequest() {
    if (!receiverAssistantHandoff || !receiverAssistantReceipt) return;
    try {
      setBusy("建立 RVR 身分簽署請求");
      const response = await api.buildReceiverIdentitySigningRequest(
        receiverAssistantHandoff,
        receiverAssistantReceipt,
      );
      downloadJsonFile(
        response.signingRequest,
        `RVR-身分簽署請求-${response.signingRequest.requestFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleAttachReceiverIdentitySignature(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !receiverAssistantHandoff || !receiverAssistantReceipt) return;
    try {
      setBusy("附加並驗證 RVR 身分簽章");
      const parsed = JSON.parse(await file.text()) as ReceiverIdentitySignatureResponse;
      const response = await api.attachReceiverIdentitySignature(
        receiverAssistantHandoff,
        receiverAssistantReceipt,
        parsed,
      );
      setReceiverAssistantReceipt(response.receipt);
      setReceiverAssistantIdentityVerification(response.receiptValidation.identityVerification);
      downloadJsonFile(
        response.receipt,
        `承接構造回簽-已簽署-${response.receipt.handoffFingerprint}-${response.receipt.receiptFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function updateReceiverAssistantAuthority(field: keyof ReceiverVerificationAuthority, value: string) {
    setReceiverAssistantAuthority((current) => ({ ...current, [field]: value }));
    setReceiverAssistantReceipt(null);
    setReceiverAssistantIdentityVerification(null);
  }

  function updateReshoreCapacityDraft(
    transferId: string,
    field: keyof ReshoreMemberCapacityInput,
    value: string | boolean,
  ) {
    setReshoreCapacityDrafts((current) => {
      const draft = current[transferId];
      if (!draft) return current;
      const numericFields: Array<keyof ReshoreMemberCapacityInput> = [
        "member_count",
        "unbraced_length_x_m",
        "unbraced_length_y_m",
        "effective_length_factor_kx",
        "effective_length_factor_ky",
        "fy_tf_per_cm2",
        "e_tf_per_cm2",
        "allowable_stress_increase_factor",
        "imbalance_factor",
        "additional_axial_load_tf_per_member",
      ];
      const nextValue = numericFields.includes(field)
        ? Number(value)
        : value;
      return { ...current, [transferId]: { ...draft, [field]: nextValue } };
    });
    setReshoreCapacityCalculations((current) => {
      if (!current[transferId]) return current;
      const next = { ...current };
      delete next[transferId];
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  async function handleCalculateReshoreMemberCapacity(index: number) {
    if (!receiverAssistantHandoff) return;
    const transfer = receiverAssistantHandoff.transfers[index];
    const draft = reshoreCapacityDrafts[transfer.transferId];
    if (!draft) return;
    try {
      setBusy("計算重撐／回撐 H 型鋼軸壓容量");
      const response = await api.calculateReshoreMemberCapacity(
        receiverAssistantHandoff,
        transfer.transferId,
        draft,
      );
      downloadBase64File(
        response.evidence.contentBase64,
        response.evidence.fileName,
        response.evidence.mediaType,
      );
      setReshoreCapacityCalculations((current) => ({
        ...current,
        [transfer.transferId]: response,
      }));
      setReceiverAssistantResults((current) => {
        const next = [...current];
        const result = { ...next[index] };
        const capacity = response.calculation.results.adoptableTransferCapacityTf;
        const demand = result.adoptedDemandTf;
        result.verifiedCapacityTf = capacity;
        result.capacityUtilizationRatio = capacity > 0
          ? Number((demand / capacity).toFixed(6))
          : 0;
        result.status = "failed";
        result.capacityEvidence = {
          documentReference: response.evidence.documentReference,
          revision: response.evidence.revision,
          issuedDate: response.evidence.issuedDate,
          pageReference: response.evidence.pageReference,
          fileName: response.evidence.fileName,
          fileSha256: response.evidence.fileSha256,
        };
        result.verificationScope = {
          analysisModelReference: response.calculation.calculationFingerprint,
          governingLoadCombination: draft.governing_load_combination.trim(),
          directionAndDistributionBasis: draft.load_distribution_basis.trim(),
          eccentricityAndSecondaryEffectBasis: "本模組限純軸壓；已確認無偏心。任何偏心或二次效應須另案檢核。",
          checkedLimitStates: ["axial", "stability"],
          otherChecksStatus: "failed",
        };
        result.supplementalChecks = emptySupplementalChecks();
        result.verificationBasis = [
          "鋼構造建築物鋼結構設計技術規範第四章及第六章",
          `H 型鋼純軸壓計算 ${response.calculation.calculationFingerprint}`,
          `有效長度依據：${draft.effective_length_basis.trim()}`,
        ].join("；");
        result.conclusion = response.calculation.results.status === "passed"
          ? "H 型鋼構件之純軸壓、整體長細比及局部細長檢核通過；接頭、承壓、基礎／樓版與施工程序尚須另行完成。"
          : "H 型鋼構件之純軸壓或穩定適用性檢核未通過，不得採用本次容量。";
        next[index] = result;
        return next;
      });
      setReceiverAssistantReceipt(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function applyReceiverOperatorAuth(auth: ReceiverOperatorAuthState) {
    setReceiverOperatorAuth(auth);
    setReceiverOperatorAuthLoaded(true);
    if (auth.operator?.roles.includes("receiver-key-admin") && !auth.operator.passwordResetRequired) {
      const [response, audit, inventory] = await Promise.all([
        api.listReceiverOperators(),
        api.listReceiverOperatorAuditEvents(),
        api.listReceiverOperatorGovernanceRecoveryInventory(),
      ]);
      setReceiverOperators(response.operators);
      setReceiverOperatorAuditSummary(audit);
      setReceiverOperatorRecoveryInventory(inventory);
    } else {
      setReceiverOperators([]);
      setReceiverOperatorAuditSummary(emptyReceiverOperatorAuditSummary);
      setReceiverOperatorRecoveryInventory(null);
    }
  }

  async function refreshReceiverOperatorGovernance() {
    const [operators, audit, inventory] = await Promise.all([
      api.listReceiverOperators(),
      api.listReceiverOperatorAuditEvents(),
      api.listReceiverOperatorGovernanceRecoveryInventory(),
    ]);
    setReceiverOperators(operators.operators);
    setReceiverOperatorAuditSummary(audit);
    setReceiverOperatorRecoveryInventory(inventory);
    setReceiverOperatorManageDraft((current) => {
      const selected = operators.operators.find((operator) => operator.id === current.operatorId);
      return selected
        ? { ...current, roles: [...selected.roles], temporaryPassword: "" }
        : emptyReceiverOperatorManageDraft;
    });
  }

  async function handleBootstrapReceiverOperator() {
    try {
      setBusy("建立首位接收端金鑰管理員");
      const auth = await api.bootstrapReceiverOperator(
        receiverOperatorBootstrapDraft.username,
        receiverOperatorBootstrapDraft.displayName,
        receiverOperatorBootstrapDraft.password,
      );
      await applyReceiverOperatorAuth(auth);
      setReceiverOperatorBootstrapDraft(emptyReceiverOperatorBootstrapDraft);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleLoginReceiverOperator() {
    try {
      setBusy("登入接收端金鑰管理");
      const auth = await api.loginReceiverOperator(
        receiverOperatorLoginDraft.username,
        receiverOperatorLoginDraft.password,
      );
      await applyReceiverOperatorAuth(auth);
      setReceiverOperatorLoginDraft(emptyReceiverOperatorLoginDraft);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleLogoutReceiverOperator() {
    try {
      setBusy("登出接收端金鑰管理");
      await api.logoutReceiverOperator();
      setReceiverOperatorAuth({ bootstrapRequired: false, authenticated: false, operator: null });
      setReceiverOperators([]);
      setReceiverOperatorCreateDraft(emptyReceiverOperatorCreateDraft);
      setReceiverOperatorManageDraft(emptyReceiverOperatorManageDraft);
      setReceiverOperatorPasswordChangeDraft(emptyReceiverOperatorPasswordChangeDraft);
      setReceiverOperatorAuditSummary(emptyReceiverOperatorAuditSummary);
      setReceiverOperatorBackupDraft(emptyReceiverOperatorBackupDraft);
      setReceiverOperatorBackup(null);
      setReceiverOperatorRestorePreview(null);
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRestoreOutcome(null);
      setReceiverOperatorRecoveryInventory(null);
      setReceiverOperatorDrillOutcome(null);
      setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft);
      setReceiverOperatorBackupDispositionApprovalDraft(emptyReceiverOperatorBackupDispositionApprovalDraft);
      setReceiverOperatorBackupDispositionOutcome(null);
      cancelReceiverKeyRotationCompletion();
      cancelReceiverKeyRotationApproval();
      cancelReceiverTrustKeyRevocation();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function toggleReceiverOperatorRole(role: ReceiverOperatorRole) {
    setReceiverOperatorCreateDraft((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  }

  async function handleCreateReceiverOperator() {
    try {
      setBusy("建立接收端操作帳號");
      const response = await api.createReceiverOperator(
        receiverOperatorCreateDraft.username,
        receiverOperatorCreateDraft.displayName,
        receiverOperatorCreateDraft.password,
        receiverOperatorCreateDraft.roles,
      );
      setReceiverOperators(response.operators);
      setReceiverOperatorCreateDraft(emptyReceiverOperatorCreateDraft);
      setReceiverOperatorAuditSummary(await api.listReceiverOperatorAuditEvents());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function selectReceiverOperator(operator: ReceiverOperator) {
    setReceiverOperatorManageDraft({
      operatorId: operator.id,
      roles: [...operator.roles],
      temporaryPassword: "",
    });
  }

  function toggleManagedReceiverOperatorRole(role: ReceiverOperatorRole) {
    setReceiverOperatorManageDraft((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  }

  async function handleUpdateReceiverOperatorRoles() {
    if (!managedReceiverOperator) return;
    try {
      setBusy("變更操作帳號角色");
      await api.updateReceiverOperatorRoles(
        managedReceiverOperator.id,
        receiverOperatorManageDraft.roles,
      );
      await refreshReceiverOperatorGovernance();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleSetReceiverOperatorDisabled(disabled: boolean) {
    if (!managedReceiverOperator) return;
    try {
      setBusy(disabled ? "停用操作帳號" : "重新啟用操作帳號");
      await api.setReceiverOperatorDisabled(managedReceiverOperator.id, disabled);
      await refreshReceiverOperatorGovernance();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleResetReceiverOperatorPassword() {
    if (!managedReceiverOperator) return;
    try {
      setBusy("重設操作帳號密碼");
      await api.resetReceiverOperatorPassword(
        managedReceiverOperator.id,
        receiverOperatorManageDraft.temporaryPassword,
      );
      await refreshReceiverOperatorGovernance();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleChangeReceiverOperatorPassword() {
    if (
      receiverOperatorPasswordChangeDraft.newPassword
      !== receiverOperatorPasswordChangeDraft.confirmPassword
    ) {
      setError("新密碼與確認密碼不一致。");
      return;
    }
    try {
      setBusy("變更登入密碼");
      await api.changeReceiverOperatorPassword(
        receiverOperatorPasswordChangeDraft.currentPassword,
        receiverOperatorPasswordChangeDraft.newPassword,
      );
      setReceiverOperatorAuth({ bootstrapRequired: false, authenticated: false, operator: null });
      setReceiverOperators([]);
      setReceiverOperatorManageDraft(emptyReceiverOperatorManageDraft);
      setReceiverOperatorPasswordChangeDraft(emptyReceiverOperatorPasswordChangeDraft);
      setReceiverOperatorAuditSummary(emptyReceiverOperatorAuditSummary);
      setReceiverOperatorBackupDraft(emptyReceiverOperatorBackupDraft);
      setReceiverOperatorBackup(null);
      setReceiverOperatorRestorePreview(null);
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRestoreOutcome(null);
      setReceiverOperatorRecoveryInventory(null);
      setReceiverOperatorDrillOutcome(null);
      setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft);
      setReceiverOperatorBackupDispositionApprovalDraft(emptyReceiverOperatorBackupDispositionApprovalDraft);
      setReceiverOperatorBackupDispositionOutcome(null);
      cancelReceiverKeyRotationCompletion();
      cancelReceiverKeyRotationApproval();
      cancelReceiverTrustKeyRevocation();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadReceiverOperatorGovernanceBackup() {
    if (!receiverCanAdministerKeys) {
      setError("操作員治理備份需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (receiverOperatorBackupDraft.passphrase.length < 16) {
      setError("操作員治理備份密碼至少須為 16 個字元。");
      return;
    }
    if (receiverOperatorBackupDraft.passphrase !== receiverOperatorBackupDraft.confirmPassphrase) {
      setError("治理備份密碼與確認密碼不一致。");
      return;
    }
    try {
      setBusy("建立操作員治理加密備份");
      const response = await api.exportReceiverOperatorGovernanceBackup(
        receiverOperatorBackupDraft.passphrase,
        receiverOperatorBackupDraft.retainServerCopy,
        receiverOperatorBackupDraft.retentionDays,
      );
      downloadJsonFile(
        response.backup,
        `RVR-操作員治理加密備份-${response.backup.summary.snapshotFingerprint}-${response.backup.backupFingerprint}.json`,
      );
      await refreshReceiverOperatorGovernance();
      setReceiverOperatorBackupDraft(emptyReceiverOperatorBackupDraft);
      setReceiverOperatorBackup(null);
      setReceiverOperatorRestorePreview(null);
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRestoreOutcome(null);
      setReceiverOperatorDrillOutcome(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleImportReceiverOperatorGovernanceBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!receiverCanAdministerKeys) {
      setError("操作員治理復原預覽需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (receiverOperatorBackupDraft.passphrase.length < 16) {
      setError("請先輸入這份治理備份的 16 字元以上加密密碼，再選取檔案。");
      return;
    }
    try {
      setBusy("解密並驗證操作員治理備份");
      const parsed = JSON.parse(await file.text()) as ReceiverOperatorGovernanceBackup;
      const response = await api.validateReceiverOperatorGovernanceBackup(
        parsed,
        receiverOperatorBackupDraft.passphrase,
      );
      setReceiverOperatorBackup(parsed);
      setReceiverOperatorRestorePreview(response.preview);
      setReceiverOperatorBackupDraft((current) => ({
        ...current,
        confirmPassphrase: "",
        recoveryUsername: "",
        recoveryPassword: "",
      }));
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRestoreOutcome(null);
      setReceiverOperatorDrillOutcome(null);
      setError("");
    } catch (err) {
      setReceiverOperatorBackup(null);
      setReceiverOperatorRestorePreview(null);
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRestoreOutcome(null);
      setReceiverOperatorDrillOutcome(null);
      setReceiverOperatorBackupDraft((current) => ({
        ...current,
        recoveryUsername: "",
        recoveryPassword: "",
      }));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleDrillReceiverOperatorGovernanceBackup() {
    if (!receiverOperatorBackup || !receiverOperatorRestorePreview) return;
    if (!receiverCanAdministerKeys) {
      setError("操作員治理復原演練需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (!receiverOperatorBackupDraft.recoveryUsername.trim() || !receiverOperatorBackupDraft.recoveryPassword) {
      setError("隔離復原演練需要備份內一個啟用中管理員的帳號與密碼，以實際驗證復原後登入。");
      return;
    }
    try {
      setBusy("執行操作員治理隔離復原演練");
      const response = await api.drillReceiverOperatorGovernanceBackup(
        receiverOperatorBackup,
        receiverOperatorBackupDraft.passphrase,
        receiverOperatorBackupDraft.recoveryUsername,
        receiverOperatorBackupDraft.recoveryPassword,
      );
      setReceiverOperatorDrillOutcome(response.receipt);
      setReceiverOperatorRecoveryInventory(response.inventory);
      setError("");
    } catch (err) {
      setReceiverOperatorDrillOutcome(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function startReceiverOperatorBackupDisposition(backupFingerprint: string) {
    setReceiverOperatorBackupDispositionDraft({
      ...emptyReceiverOperatorBackupDispositionDraft,
      backupFingerprint,
    });
    setReceiverOperatorBackupDispositionApprovalDraft(
      emptyReceiverOperatorBackupDispositionApprovalDraft,
    );
    setReceiverOperatorBackupDispositionOutcome(null);
  }

  async function handleRequestReceiverOperatorBackupDisposition() {
    if (!receiverCanRequestRotation) {
      setError("提出到期備份處置需要已登入且具治理申請人角色的不同責任帳號。");
      return;
    }
    if (
      !receiverOperatorBackupDispositionDraft.backupFingerprint
      || !receiverOperatorBackupDispositionDraft.caseReference.trim()
      || !receiverOperatorBackupDispositionDraft.basis.trim()
      || !receiverOperatorBackupDispositionDraft.confirmed
    ) {
      setError("請填寫處置案件編號與依據，並確認交由不同帳號第二人覆核。");
      return;
    }
    try {
      setBusy("提出到期備份雙人處置申請");
      const response = await api.requestReceiverOperatorBackupDisposition(
        receiverOperatorBackupDispositionDraft.backupFingerprint,
        receiverOperatorBackupDispositionDraft.caseReference,
        receiverOperatorBackupDispositionDraft.basis,
      );
      setReceiverOperatorRecoveryInventory(response.inventory);
      setReceiverOperatorAuditSummary(await api.listReceiverOperatorAuditEvents());
      setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft);
      setReceiverOperatorBackupDispositionOutcome(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function startReceiverOperatorBackupDispositionApproval(requestFingerprint: string) {
    setReceiverOperatorBackupDispositionApprovalDraft({
      requestFingerprint,
      confirmed: false,
    });
    setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft);
    setReceiverOperatorBackupDispositionOutcome(null);
  }

  async function handleApproveReceiverOperatorBackupDisposition() {
    const claim = receiverOperatorRecoveryInventory?.backupDispositionRequests.find(
      (item) => item.requestFingerprint
        === receiverOperatorBackupDispositionApprovalDraft.requestFingerprint,
    );
    if (!claim) return;
    if (!receiverCanApproveRotation) {
      setError("第二人覆核到期備份處置需要治理覆核人角色。");
      return;
    }
    if (claim.requestedByOperatorId === receiverOperatorAuth.operator?.id) {
      setError("目前登入帳號就是申請帳號；請改由不同覆核帳號登入。");
      return;
    }
    if (!receiverOperatorBackupDispositionApprovalDraft.confirmed) {
      setError("覆核前必須確認一般檔案移除與非安全抹除邊界。");
      return;
    }
    try {
      setBusy("第二人覆核並移除到期受管制備份");
      const response = await api.approveReceiverOperatorBackupDisposition(
        claim.requestFingerprint,
      );
      setReceiverOperatorRecoveryInventory(response.inventory);
      setReceiverOperatorAuditSummary(await api.listReceiverOperatorAuditEvents());
      setReceiverOperatorBackupDispositionApprovalDraft(
        emptyReceiverOperatorBackupDispositionApprovalDraft,
      );
      setReceiverOperatorBackupDispositionOutcome(response.receipt);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleRestoreReceiverOperatorGovernanceBackup() {
    if (!receiverOperatorBackup || !receiverOperatorRestorePreview) return;
    if (!receiverCanAdministerKeys) {
      setError("操作員治理復原需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (!receiverOperatorRestoreConfirmed) {
      setError("復原前必須確認完整置換帳號、角色、輪替 claim、備份處置 claim 與稽核鏈，並撤銷全部工作階段。");
      return;
    }
    if (!receiverOperatorBackupDraft.recoveryUsername.trim() || !receiverOperatorBackupDraft.recoveryPassword) {
      setError("請輸入備份內一個啟用中管理員的帳號與密碼，以避免復原後無法登入。");
      return;
    }
    try {
      setBusy("復原操作員治理加密備份");
      const response = await api.restoreReceiverOperatorGovernanceBackup(
        receiverOperatorBackup,
        receiverOperatorBackupDraft.passphrase,
        receiverOperatorBackupDraft.recoveryUsername,
        receiverOperatorBackupDraft.recoveryPassword,
      );
      setReceiverOperatorRestoreOutcome(response);
      setReceiverOperatorAuth({ bootstrapRequired: false, authenticated: false, operator: null });
      setReceiverOperators([]);
      setReceiverOperatorCreateDraft(emptyReceiverOperatorCreateDraft);
      setReceiverOperatorManageDraft(emptyReceiverOperatorManageDraft);
      setReceiverOperatorPasswordChangeDraft(emptyReceiverOperatorPasswordChangeDraft);
      setReceiverOperatorAuditSummary(emptyReceiverOperatorAuditSummary);
      setReceiverOperatorBackupDraft(emptyReceiverOperatorBackupDraft);
      setReceiverOperatorBackup(null);
      setReceiverOperatorRestorePreview(null);
      setReceiverOperatorRestoreConfirmed(false);
      setReceiverOperatorRecoveryInventory(null);
      setReceiverOperatorDrillOutcome(null);
      setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft);
      setReceiverOperatorBackupDispositionApprovalDraft(emptyReceiverOperatorBackupDispositionApprovalDraft);
      setReceiverOperatorBackupDispositionOutcome(null);
      cancelReceiverKeyRotationCompletion();
      cancelReceiverKeyRotationApproval();
      cancelReceiverTrustKeyRevocation();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleRegisterReceiverTrustKey() {
    if (!receiverCanAdministerKeys) {
      setError("此操作需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (!receiverTrustVerificationConfirmed) {
      setError("登錄前請先確認已透過獨立管道核對單位與 Key ID。");
      return;
    }
    try {
      setBusy("登錄受信任回簽公鑰");
      const response = receiverTrustEnrollment
        ? await api.registerReceiverKeyEnrollment(receiverTrustEnrollment)
        : await api.registerReceiverTrustKey(
            receiverTrustDraft.organization,
            receiverTrustDraft.displayName,
            receiverTrustDraft.publicKey,
          );
      setReceiverTrustKeys(response.keys);
      setReceiverTrustEvents(response.events);
      setReceiverRotationRequests(response.rotationRequests);
      setReceiverTrustDraft({ organization: "", displayName: "", publicKey: "" });
      setReceiverTrustEnrollment(null);
      setReceiverTrustVerificationConfirmed(false);
      cancelReceiverKeyRotationCompletion();
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      if (receiverAssistantHandoff && receiverAssistantReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(receiverAssistantHandoff, receiverAssistantReceipt);
        setReceiverAssistantIdentityVerification(validated.receiptValidation.identityVerification);
      }
      if (activeRemovalTransferHandoff && activeRemovalTransferReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(activeRemovalTransferHandoff, activeRemovalTransferReceipt);
        setRemovalTransferIdentityVerification(validated.receiptValidation.identityVerification);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleImportReceiverKeyEnrollment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setBusy("驗證 RKE 公鑰登錄包");
      const parsed = JSON.parse(await file.text()) as ReceiverKeyEnrollment;
      const response = await api.validateReceiverKeyEnrollment(parsed);
      setReceiverTrustEnrollment(response.enrollment);
      setReceiverTrustDraft({
        organization: response.enrollment.organization,
        displayName: response.enrollment.displayName,
        publicKey: response.enrollment.publicKeyBase64,
      });
      setReceiverTrustVerificationConfirmed(false);
      setError("");
    } catch (err) {
      setReceiverTrustEnrollment(null);
      setReceiverTrustVerificationConfirmed(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function updateReceiverTrustDraft(field: "organization" | "displayName" | "publicKey", value: string) {
    setReceiverTrustDraft((current) => ({ ...current, [field]: value }));
    setReceiverTrustEnrollment(null);
    setReceiverTrustVerificationConfirmed(false);
  }

  function beginReceiverTrustKeyRevocation(keyId: string) {
    setReceiverRevocationKeyId(keyId);
    setReceiverRevocationDraft(emptyReceiverRevocationDraft);
    setReceiverRotationKeyId(null);
    setReceiverRotationDraft(emptyReceiverRotationDraft);
    setReceiverRotationApprovalRequestFingerprint(null);
    setReceiverRotationApprovalDraft(emptyReceiverRotationApprovalDraft);
  }

  function cancelReceiverTrustKeyRevocation() {
    setReceiverRevocationKeyId(null);
    setReceiverRevocationDraft(emptyReceiverRevocationDraft);
  }

  async function handleRevokeReceiverTrustKey() {
    if (!receiverRevocationKeyId) return;
    if (!receiverCanAdministerKeys) {
      setError("撤銷金鑰需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (!receiverRevocationDraft.confirmed) {
      setError("撤銷前必須確認此動作不可復原，且既有 RVR／SEV 將不再視為受信任簽章。");
      return;
    }
    try {
      setBusy("撤銷受信任回簽公鑰");
      const response = await api.revokeReceiverTrustKey(receiverRevocationKeyId, receiverRevocationDraft);
      setReceiverTrustKeys(response.keys);
      setReceiverTrustEvents(response.events);
      setReceiverRotationRequests(response.rotationRequests);
      cancelReceiverTrustKeyRevocation();
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      if (receiverAssistantHandoff && receiverAssistantReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(receiverAssistantHandoff, receiverAssistantReceipt);
        setReceiverAssistantIdentityVerification(validated.receiptValidation.identityVerification);
      }
      if (activeRemovalTransferHandoff && activeRemovalTransferReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(activeRemovalTransferHandoff, activeRemovalTransferReceipt);
        setRemovalTransferIdentityVerification(validated.receiptValidation.identityVerification);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function beginReceiverKeyRotationCompletion(newKeyId: string) {
    setReceiverRotationKeyId(newKeyId);
    setReceiverRotationDraft(emptyReceiverRotationDraft);
    setReceiverRotationApprovalRequestFingerprint(null);
    setReceiverRotationApprovalDraft(emptyReceiverRotationApprovalDraft);
    cancelReceiverTrustKeyRevocation();
  }

  function cancelReceiverKeyRotationCompletion() {
    setReceiverRotationKeyId(null);
    setReceiverRotationDraft(emptyReceiverRotationDraft);
  }

  async function handleRequestReceiverKeyRotationCompletion() {
    if (!receiverRotationKeyId) return;
    if (!receiverCanRequestRotation) {
      setError("提出輪替申請需要已登入且具治理申請人角色的帳號。");
      return;
    }
    if (!receiverRotationDraft.confirmed) {
      setError("提出輪替完成申請前，必須確認新金鑰已完成測試簽署與使用端切換。");
      return;
    }
    try {
      setBusy("提出受信任公鑰輪替申請");
      const response = await api.requestReceiverKeyRotationCompletion(receiverRotationKeyId, receiverRotationDraft);
      setReceiverTrustKeys(response.keys);
      setReceiverTrustEvents(response.events);
      setReceiverRotationRequests(response.rotationRequests);
      cancelReceiverKeyRotationCompletion();
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function beginReceiverKeyRotationApproval(requestFingerprint: string) {
    setReceiverRotationApprovalRequestFingerprint(requestFingerprint);
    setReceiverRotationApprovalDraft(emptyReceiverRotationApprovalDraft);
    cancelReceiverKeyRotationCompletion();
    cancelReceiverTrustKeyRevocation();
  }

  function cancelReceiverKeyRotationApproval() {
    setReceiverRotationApprovalRequestFingerprint(null);
    setReceiverRotationApprovalDraft(emptyReceiverRotationApprovalDraft);
  }

  async function handleApproveReceiverKeyRotationCompletion() {
    if (!receiverRotationApprovalRequestFingerprint) return;
    if (!receiverCanApproveRotation) {
      setError("輪替覆核需要已登入且具治理覆核人角色的帳號。");
      return;
    }
    if (!receiverRotationApprovalDraft.confirmed) {
      setError("第二人覆核前必須確認申請內容、切換證據與不可復原撤銷結果。");
      return;
    }
    try {
      setBusy("覆核並完成受信任公鑰輪替");
      const response = await api.approveReceiverKeyRotationCompletion(
        receiverRotationApprovalRequestFingerprint,
      );
      setReceiverTrustKeys(response.keys);
      setReceiverTrustEvents(response.events);
      setReceiverRotationRequests(response.rotationRequests);
      cancelReceiverKeyRotationApproval();
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      if (receiverAssistantHandoff && receiverAssistantReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(receiverAssistantHandoff, receiverAssistantReceipt);
        setReceiverAssistantIdentityVerification(validated.receiptValidation.identityVerification);
      }
      if (activeRemovalTransferHandoff && activeRemovalTransferReceipt) {
        const validated = await api.validateReceiverVerificationReceipt(activeRemovalTransferHandoff, activeRemovalTransferReceipt);
        setRemovalTransferIdentityVerification(validated.receiptValidation.identityVerification);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadReceiverTrustRegistryBackup() {
    if (!receiverCanAdministerKeys) {
      setError("信任清冊備份需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    try {
      setBusy("建立信任清冊備份");
      const response = await api.exportReceiverTrustRegistryBackup();
      downloadJsonFile(
        response.backup,
        `RVR-信任清冊備份-${response.backup.registry.registryFingerprint}-${response.backup.backupFingerprint}.json`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleImportReceiverTrustRegistryBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!receiverCanAdministerKeys) {
      setError("信任清冊復原預覽需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    try {
      setBusy("驗證信任清冊備份並建立復原預覽");
      const parsed = JSON.parse(await file.text()) as ReceiverTrustRegistryBackup;
      const response = await api.validateReceiverTrustRegistryBackup(parsed);
      setReceiverTrustBackup(response.backup);
      setReceiverTrustRestorePreview(response.preview);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      setError("");
    } catch (err) {
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      setReceiverTrustRestoreOutcome(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleRestoreReceiverTrustRegistryBackup() {
    if (!receiverTrustBackup || !receiverTrustRestorePreview) return;
    if (!receiverCanAdministerKeys) {
      setError("信任清冊復原需要已登入且具接收端金鑰管理員角色的帳號。");
      return;
    }
    if (!receiverTrustRestoreConfirmed) {
      setError("復原前必須確認以已驗證備份取代目前本機信任清冊。");
      return;
    }
    try {
      setBusy("復原本機信任清冊");
      const response = await api.restoreReceiverTrustRegistryBackup(receiverTrustBackup);
      setReceiverTrustKeys(response.keys);
      setReceiverTrustEvents(response.events);
      setReceiverRotationRequests(response.rotationRequests);
      setReceiverTrustRestoreOutcome({
        registryFingerprint: response.registryFingerprint,
        safeguardPath: response.safeguardPath,
      });
      setReceiverTrustBackup(null);
      setReceiverTrustRestorePreview(null);
      setReceiverTrustRestoreConfirmed(false);
      cancelReceiverTrustKeyRevocation();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function updateReceiverAssistantResult(
    index: number,
    field: keyof ReceiverVerificationResult,
    value: string,
  ) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[index] };
      if (field === "adoptedDemandTf" || field === "verifiedCapacityTf") {
        result[field] = Number(value);
      } else {
        result[field] = value as never;
      }
      if (field === "adoptedDemandTf" || field === "verifiedCapacityTf") {
        const demand = Number(result.adoptedDemandTf);
        const capacity = Number(result.verifiedCapacityTf ?? 0);
        const ratio = demand > 0 && capacity > 0 ? demand / capacity : 0;
        result.capacityUtilizationRatio = Number(ratio.toFixed(6));
        result.status = demand >= 0
          && capacity > 0
          && ratio <= 1.000000001
          && result.verificationScope?.otherChecksStatus === "passed"
          ? "passed"
          : "failed";
      }
      next[index] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  function updateReceiverAssistantVerificationScope(
    index: number,
    field: "analysisModelReference" | "governingLoadCombination" | "directionAndDistributionBasis" | "eccentricityAndSecondaryEffectBasis" | "otherChecksStatus",
    value: string,
  ) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[index] };
      const scope = {
        analysisModelReference: "",
        governingLoadCombination: "",
        directionAndDistributionBasis: "",
        eccentricityAndSecondaryEffectBasis: "",
        checkedLimitStates: [] as ReceiverLimitState[],
        otherChecksStatus: "failed" as "passed" | "failed",
        ...result.verificationScope,
        [field]: value,
      };
      result.verificationScope = scope;
      const ratio = result.adoptedDemandTf / (result.verifiedCapacityTf ?? 0);
      result.status = Number.isFinite(ratio)
        && result.adoptedDemandTf >= 0
        && (result.verifiedCapacityTf ?? 0) > 0
        && ratio <= 1.000000001
        && scope.otherChecksStatus === "passed"
        ? "passed"
        : "failed";
      next[index] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  function toggleReceiverAssistantLimitState(index: number, limitState: ReceiverLimitState) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[index] };
      const currentStates = result.verificationScope?.checkedLimitStates ?? [];
      const checkedLimitStates = currentStates.includes(limitState)
        ? currentStates.filter((item) => item !== limitState)
        : [...currentStates, limitState];
      result.verificationScope = {
        analysisModelReference: "",
        governingLoadCombination: "",
        directionAndDistributionBasis: "",
        eccentricityAndSecondaryEffectBasis: "",
        otherChecksStatus: "failed",
        ...result.verificationScope,
        checkedLimitStates,
      };
      next[index] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  function updateReceiverAssistantCapacityEvidence(
    index: number,
    field: keyof NonNullable<ReceiverVerificationResult["capacityEvidence"]>,
    value: string,
  ) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[index] };
      const evidence = {
        documentReference: "",
        revision: "",
        issuedDate: "",
        pageReference: "",
        fileName: "",
        fileSha256: "",
        ...result.capacityEvidence,
        [field]: field === "fileSha256" ? value.trim().toLowerCase() : value,
      };
      result.capacityEvidence = evidence;
      next[index] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  async function handleReceiverCapacityEvidenceFile(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const fileSha256 = await fileSha256Hex(file);
      setReceiverAssistantResults((current) => {
        const next = [...current];
        const result = { ...next[index] };
        const evidence = {
          documentReference: "",
          revision: "",
          issuedDate: "",
          pageReference: "",
          fileName: "",
          fileSha256: "",
          ...result.capacityEvidence,
        };
        evidence.fileName = file.name;
        evidence.fileSha256 = fileSha256;
        result.capacityEvidence = evidence;
        next[index] = result;
        return next;
      });
      setReceiverAssistantReceipt(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法計算承載力證據檔案 SHA-256。");
    }
  }

  function updateReceiverSupplementalCheck(
    resultIndex: number,
    checkId: ReceiverSupplementalCheckId,
    field: "status" | "basis",
    value: string,
  ) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[resultIndex] };
      const checks = (result.supplementalChecks ?? emptySupplementalChecks()).map((check) => {
        if (check.checkId !== checkId) return check;
        const updated: ReceiverSupplementalCheck = {
          ...check,
          [field]: value,
        } as ReceiverSupplementalCheck;
        if (field === "status" && value === "passed" && !updated.evidence) {
          updated.evidence = {
            documentReference: "",
            revision: "",
            issuedDate: "",
            pageReference: "",
            fileName: "",
            fileSha256: "",
          };
        }
        if (field === "status" && value === "not-applicable") delete updated.evidence;
        if (field === "status" && value === "failed") delete updated.evidence;
        return updated;
      });
      const otherChecksStatus = checks.some((check) => check.status === "passed")
        && !checks.some((check) => check.status === "failed")
        ? "passed"
        : "failed";
      result.supplementalChecks = checks;
      result.verificationScope = {
        analysisModelReference: "",
        governingLoadCombination: "",
        directionAndDistributionBasis: "",
        eccentricityAndSecondaryEffectBasis: "",
        checkedLimitStates: [],
        ...result.verificationScope,
        otherChecksStatus,
      };
      const ratio = result.adoptedDemandTf / (result.verifiedCapacityTf ?? 0);
      result.status = Number.isFinite(ratio)
        && (result.verifiedCapacityTf ?? 0) > 0
        && ratio <= 1.000000001
        && otherChecksStatus === "passed"
        ? "passed"
        : "failed";
      next[resultIndex] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  function updateReceiverSupplementalEvidence(
    resultIndex: number,
    checkId: ReceiverSupplementalCheckId,
    field: keyof ReceiverCapacityEvidence,
    value: string,
  ) {
    setReceiverAssistantResults((current) => {
      const next = [...current];
      const result = { ...next[resultIndex] };
      result.supplementalChecks = (result.supplementalChecks ?? emptySupplementalChecks()).map((check) => (
        check.checkId === checkId
          ? {
              ...check,
              evidence: {
                documentReference: "",
                revision: "",
                issuedDate: "",
                pageReference: "",
                fileName: "",
                fileSha256: "",
                ...check.evidence,
                [field]: field === "fileSha256" ? value.trim().toLowerCase() : value,
              },
            }
          : check
      ));
      next[resultIndex] = result;
      return next;
    });
    setReceiverAssistantReceipt(null);
  }

  async function handleReceiverSupplementalEvidenceFile(
    resultIndex: number,
    checkId: ReceiverSupplementalCheckId,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const fileSha256 = await fileSha256Hex(file);
      updateReceiverSupplementalEvidence(resultIndex, checkId, "fileName", file.name);
      updateReceiverSupplementalEvidence(resultIndex, checkId, "fileSha256", fileSha256);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法計算補充證據檔案 SHA-256。");
    }
  }

  function handleSaveReceiverEvidenceTemplate(resultIndex: number, checkId: ReceiverSupplementalCheckId) {
    try {
      const result = receiverAssistantResults[resultIndex];
      const check = result?.supplementalChecks?.find((item) => item.checkId === checkId);
      if (!check) throw new Error("找不到要儲存的補充查核。");
      const bindingKey = receiverEvidenceTemplateBindingKey(result.transferId, checkId);
      const boundTemplateId = receiverEvidenceTemplateBindings[bindingKey];
      const existing = receiverEvidenceTemplates.find((template) => template.templateId === boundTemplateId)
        ?? receiverEvidenceTemplates.find((template) => (
          template.checkId === checkId
          && template.evidence.documentReference === check.evidence?.documentReference.trim()
          && template.evidence.revision === check.evidence?.revision.trim()
          && template.evidence.issuedDate === check.evidence?.issuedDate.trim()
          && template.evidence.pageReference === check.evidence?.pageReference.trim()
        ));
      const timestamp = new Date().toISOString();
      const label = receiverSupplementalCheckOptions.find((option) => option.value === checkId)?.label ?? checkId;
      const documentReference = check.evidence?.documentReference.trim() ?? "";
      const revision = check.evidence?.revision.trim() ?? "";
      const name = `${label}｜${documentReference}｜${revision}`;
      const template = existing
        ? reviseReceiverEvidenceTemplate(existing, check, name, timestamp)
        : templateFromSupplementalCheck(check, `RET-${crypto.randomUUID()}`, name, timestamp);
      setReceiverEvidenceTemplates((current) => mergeReceiverEvidenceTemplates(current, [template]));
      setReceiverEvidenceTemplateBindings((current) => ({ ...current, [bindingKey]: template.templateId }));
      const unchanged = existing
        && existing.governance.revision === template.governance.revision
        && existing.updatedAt === template.updatedAt;
      setReceiverEvidenceTemplateNotice(
        unchanged
          ? `範本內容沒有變更：${template.name}`
          : existing
            ? `已建立第 ${template.governance.revision} 版並撤銷舊核准：${template.name}`
            : `已儲存待核准範本：${template.name}`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法儲存補充證據範本。");
    }
  }

  function handleApplyReceiverEvidenceTemplate(
    resultIndex: number,
    checkId: ReceiverSupplementalCheckId,
    templateId: string,
  ) {
    if (!templateId) return;
    try {
      const template = receiverEvidenceTemplates.find((item) => item.templateId === templateId);
      if (!template) throw new Error("找不到選取的補充證據範本。");
      setReceiverAssistantResults((current) => current.map((result, index) => (
        index === resultIndex ? applyTemplateToReceiverResult(result, template) : result
      )));
      const result = receiverAssistantResults[resultIndex];
      if (result) {
        const bindingKey = receiverEvidenceTemplateBindingKey(result.transferId, checkId);
        setReceiverEvidenceTemplateBindings((current) => ({ ...current, [bindingKey]: template.templateId }));
      }
      setReceiverAssistantReceipt(null);
      setReceiverEvidenceTemplateNotice(`已套用核准範本 v${template.governance.revision}：${template.name}；請重新選取本案實際證據檔。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法套用補充證據範本。");
    }
  }

  function handleApplyReceiverEvidenceTemplateToAll(templateId: string) {
    try {
      const template = receiverEvidenceTemplates.find((item) => item.templateId === templateId);
      if (!template) throw new Error("找不到選取的補充證據範本。");
      setReceiverAssistantResults((current) => current.map((result) => applyTemplateToReceiverResult(result, template)));
      setReceiverEvidenceTemplateBindings((current) => {
        const next = { ...current };
        receiverAssistantResults.forEach((result) => {
          next[receiverEvidenceTemplateBindingKey(result.transferId, template.checkId)] = template.templateId;
        });
        return next;
      });
      setReceiverAssistantReceipt(null);
      setReceiverEvidenceTemplateNotice(`已將核准範本 v${template.governance.revision} 套用至全部同類交接列：${template.name}；各列仍須重新選取實際證據檔。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法批次套用補充證據範本。");
    }
  }

  function handleDeleteReceiverEvidenceTemplate(templateId: string) {
    const template = receiverEvidenceTemplates.find((item) => item.templateId === templateId);
    setReceiverEvidenceTemplates((current) => current.filter((item) => item.templateId !== templateId));
    setReceiverEvidenceTemplateBindings((current) => Object.fromEntries(
      Object.entries(current).filter(([, boundTemplateId]) => boundTemplateId !== templateId),
    ));
    setReceiverEvidenceTemplateReviewDrafts((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== templateId),
    ));
    setReceiverEvidenceTemplateNotice(template ? `已刪除範本：${template.name}` : "範本已刪除。");
    setError("");
  }

  function updateReceiverEvidenceTemplateReviewDraft(
    templateId: string,
    field: "reviewedBy" | "validUntil",
    value: string,
    fallbackReviewedBy = "",
  ) {
    setReceiverEvidenceTemplateReviewDrafts((current) => {
      const previous = current[templateId] ?? { reviewedBy: fallbackReviewedBy, validUntil: "" };
      return { ...current, [templateId]: { ...previous, [field]: value } };
    });
  }

  function handleApproveReceiverEvidenceTemplate(templateId: string) {
    try {
      const template = receiverEvidenceTemplates.find((item) => item.templateId === templateId);
      if (!template) throw new Error("找不到要核准的補充證據範本。");
      const review = receiverEvidenceTemplateReviewDrafts[templateId] ?? { reviewedBy: "", validUntil: "" };
      const approved = approveReceiverEvidenceTemplate(
        template,
        review.reviewedBy,
        new Date().toISOString(),
        review.validUntil,
      );
      setReceiverEvidenceTemplates((current) => mergeReceiverEvidenceTemplates(current, [approved]));
      setReceiverEvidenceTemplateReviewDrafts((current) => Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== templateId),
      ));
      setReceiverEvidenceTemplateNotice(`已核准範本 v${approved.governance.revision}：${approved.name}，有效至 ${approved.governance.validUntil}。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法核准補充證據範本。");
    }
  }

  function handleRevokeReceiverEvidenceTemplateApproval(templateId: string) {
    try {
      const template = receiverEvidenceTemplates.find((item) => item.templateId === templateId);
      if (!template) throw new Error("找不到要撤銷核准的補充證據範本。");
      const revoked = revokeReceiverEvidenceTemplateApproval(template, new Date().toISOString());
      setReceiverEvidenceTemplates((current) => mergeReceiverEvidenceTemplates(current, [revoked]));
      setReceiverEvidenceTemplateNotice(`已撤銷範本核准：${revoked.name}；重新核准前不得套用。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法撤銷補充證據範本核准。");
    }
  }

  function handleExportReceiverEvidenceTemplates() {
    try {
      if (!receiverEvidenceTemplates.length) throw new Error("目前沒有可匯出的補充證據範本。");
      const timestamp = new Date().toISOString();
      downloadJsonFile(
        buildReceiverEvidenceTemplateLibrary(receiverEvidenceTemplates, timestamp),
        `補充證據範本庫-${timestamp.slice(0, 10)}.json`,
      );
      setReceiverEvidenceTemplateNotice(`已匯出 ${receiverEvidenceTemplates.length} 筆受控範本及修訂紀錄；檔案不含證據檔名或 SHA-256。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法匯出補充證據範本。");
    }
  }

  async function handleImportReceiverEvidenceTemplates(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("補充證據範本庫不得超過 1 MB。");
      const incoming = prepareImportedReceiverEvidenceTemplates(
        parseReceiverEvidenceTemplateLibrary(JSON.parse(await file.text())),
      );
      setReceiverEvidenceTemplates((current) => mergeReceiverEvidenceTemplates(current, incoming));
      setReceiverEvidenceTemplateNotice(`已從 ${file.name} 匯入 ${incoming.length} 筆範本；外部核准一律降級，須由本機重新核准後才能套用。`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法匯入補充證據範本。");
    }
  }

  async function handleImportSignedReceiverEvidenceTemplates(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("組織簽章補充證據範本封包不得超過 1 MB。");
      const validated = await api.validateReceiverEvidenceTemplatePublisherPackage(
        JSON.parse(await file.text()),
      );
      const incoming = prepareSignedImportedReceiverEvidenceTemplates(
        parseReceiverEvidenceTemplateLibrary(validated.package.library),
        validated.publisherVerification,
        new Date().toISOString(),
      );
      setReceiverEvidenceTemplates((current) => mergeReceiverEvidenceTemplates(current, incoming));
      setReceiverEvidenceTemplateNotice(
        `已驗證並匯入 ${incoming.length} 筆組織簽章範本：${validated.publisherVerification.message}`,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法驗證或匯入組織簽章補充證據範本封包。");
    }
  }

  async function handleSaveReferenceData() {
    if (!referenceDraft) return;
    try {
      setBusy("儲存參考資料");
      const saved = await api.saveReferenceData(referenceDraft);
      setBootstrap((current) => (current ? { ...current, reference_data: saved } : current));
      setReferenceDraft(saved);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleResetReferenceData() {
    try {
      setBusy("還原參考資料");
      const restored = await api.resetReferenceData();
      setBootstrap((current) => (current ? { ...current, reference_data: restored } : current));
      setReferenceDraft(restored);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function applyProjectState(nextProject: ProjectState) {
    const synced = syncProjectGuardrails(nextProject);
    setProject(synced);
    setRemovalTransferHandoff(null);
    setRemovalTransferReceipt(null);
    if (!synced.calculation_results) {
      setReportUrl("");
      setPdfEvidenceUrl("");
      setPdfSourceBundleUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
      setGeneratedPdfDocumentStatus(null);
      setGeneratedWordDocumentStatus(null);
      setReportApproved(false);
    }
  }

  function applyPersistedProjectState(nextProject: ProjectState) {
    const synced = syncProjectGuardrails(nextProject);
    setProject(synced);
    setPersistedProjectSnapshot(serializeProjectState(synced));
    if (!synced.calculation_results) {
      setReportUrl("");
      setPdfEvidenceUrl("");
      setPdfSourceBundleUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
      setGeneratedPdfDocumentStatus(null);
      setGeneratedWordDocumentStatus(null);
      setReportApproved(false);
    }
  }

  function setReportMode(nextConcise: boolean) {
    setConciseReportMode(nextConcise);
    setReportUrl("");
    setPdfEvidenceUrl("");
    setPdfSourceBundleUrl("");
    setWordReportUrl("");
    setGeneratedPdfMode(null);
    setGeneratedWordMode(null);
    setGeneratedPdfDocumentStatus(null);
    setGeneratedWordDocumentStatus(null);
  }

  function setReportApproval(nextApproved: boolean) {
    setReportApproved(nextApproved);
    setReportUrl("");
    setPdfEvidenceUrl("");
    setPdfSourceBundleUrl("");
    setWordReportUrl("");
    setGeneratedPdfMode(null);
    setGeneratedWordMode(null);
    setGeneratedPdfDocumentStatus(null);
    setGeneratedWordDocumentStatus(null);
  }

  function jumpToStep(step: number, panelId?: string) {
    if (step === STEP_COMPONENTS && panelId) {
      const nextTab = componentTabForPanel(panelId);
      if (nextTab) {
        setComponentTab(nextTab);
      }
    }
    setActiveStep(step);
    if (panelId) {
      setPendingPanelFocus(panelId);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyQuickSupportMode(mode: "top" | "bottom" | "dual") {
    if (!project) return;
    const nextOptions = {
      ...project.calculation_options,
      include_top_supports: mode !== "bottom",
      include_bottom_supports: mode !== "top",
    };
    if (mode === "top") {
      setAnalysisSingleSide("top");
    } else if (mode === "bottom") {
      setAnalysisSingleSide("bottom");
    }
    applyProjectState({
      ...project,
      calculation_options: nextOptions,
      calculation_results: null,
    });
    setError("");
  }

  function updateMetadata(field: keyof ProjectState["metadata"], value: string) {
    if (!project) return;
    applyProjectState({ ...project, metadata: { ...project.metadata, [field]: value } });
    setReportUrl("");
    setPdfEvidenceUrl("");
    setPdfSourceBundleUrl("");
    setWordReportUrl("");
    setGeneratedPdfMode(null);
    setGeneratedWordMode(null);
    setGeneratedPdfDocumentStatus(null);
    setGeneratedWordDocumentStatus(null);
    setReportApproved(false);
  }

  function updateBasic(field: keyof ProjectState["basic_parameters"], value: string) {
    if (!project) return;
    const parsed = Number(value);
    applyProjectState({
      ...project,
      basic_parameters: {
        ...project.basic_parameters,
        [field]:
          field === "wall_type"
            ? normalizeWallTypeValue(value)
            : Number.isFinite(parsed)
              ? parsed
              : value,
      },
    });
  }

  function updateArrayRow<T extends Record<string, unknown>>(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    index: number,
    field: keyof T,
    value: string,
  ) {
    if (!project) return;
    const list = [...(project[key] as unknown as T[])];
    const target = { ...list[index] };
    const current = target[field];
    target[field] =
      typeof current === "number" ? (Number(value) as T[keyof T]) : (value as T[keyof T]);
    if (
      (key === "top_supports" || key === "bottom_supports" || key === "top_braces" || key === "bottom_braces") &&
      target.force_source === "analysis_import" &&
      ["axial_force_t", "spacing_m", "l1_m", "l2_m", "angle_deg", "tributary_line_load_tf_per_m"].includes(String(field))
    ) {
      (target as Record<string, unknown>).analysis_mapping_confirmed = false;
    }
    list[index] = target;
    const nextProject = { ...project, [key]: list, calculation_results: null } as ProjectState;
    applyProjectState(isSupportKey(key) ? cascadeSupportEdit(project, nextProject, key, index) : nextProject);
  }

  function updateAnalysisMapping(
    key: "top_supports" | "bottom_supports" | "top_braces" | "bottom_braces",
    index: number,
    patch: AnalysisMappingPatch,
  ) {
    if (!project) return;
    const rows = [...project[key]] as Array<SupportRow | BraceRow>;
    const current = rows[index];
    if (!current || current.force_source !== "analysis_import") return;
    const next = { ...current, ...patch };
    if ("construction_step_label" in patch || "analysis_mapping_basis" in patch) {
      next.analysis_mapping_confirmed = false;
    }
    if (
      "removal_transfer_mode" in patch ||
      "removal_transfer_target" in patch ||
      "removal_transfer_direction" in patch ||
      "removal_transfer_share_percent" in patch ||
      "removal_transfer_additional_receivers" in patch ||
      "removal_transfer_basis" in patch
    ) {
      next.removal_transfer_confirmed = false;
    }
    if (patch.removal_transfer_mode === "unassigned" || patch.removal_transfer_mode === "outside_scope") {
      next.removal_transfer_target = "";
    }
    if (patch.removal_transfer_mode === "unassigned") {
      next.removal_transfer_share_percent = 100;
      next.removal_transfer_additional_receivers = [];
    }
    rows[index] = next;
    applyProjectState({ ...project, [key]: rows, calculation_results: null } as ProjectState);
    setError("");
  }

  function applySectionNameToAll(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    sectionName: string,
  ) {
    if (!project || !sectionName) return;
    const nextRows = project[key].map((row) => ({ ...row, section_name: sectionName })) as ProjectState[typeof key];
    const nextProject = { ...project, [key]: nextRows, calculation_results: null } as ProjectState;
    applyProjectState(nextProject);
  }

  function addSupportRow(key: "top_supports" | "bottom_supports") {
    if (!project) return;
    const useDefaultTempForce =
      key === "top_supports"
        ? project.calculation_options.auto_temp_force_top_supports
        : project.calculation_options.auto_temp_force_bottom_supports;
    const list = [...project[key], emptySupportRow(project[key].length, useDefaultTempForce)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addWaleRow(key: "top_wales" | "bottom_wales") {
    if (!project) return;
    const seeds = key === "top_wales" ? buildSupportSeeds(project.top_supports) : buildSupportSeeds(project.bottom_supports);
    const list = [...project[key], defaultWaleRowForIndex(project[key], seeds, project[key].length)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addBraceRow(key: "top_braces" | "bottom_braces") {
    if (!project) return;
    const seeds = key === "top_braces" ? buildSupportSeeds(project.top_supports) : buildSupportSeeds(project.bottom_supports);
    const list = [...project[key], defaultBraceRowForIndex(project[key], seeds, project[key].length)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addCornerBraceRow() {
    if (!project) return;
    const cornerSeeds = buildCornerSeeds(buildSupportSeeds(project.top_supports), buildSupportSeeds(project.bottom_supports));
    applyProjectState({
      ...project,
      corner_braces: [
        ...project.corner_braces,
        defaultCornerBraceRowForIndex(project.corner_braces, cornerSeeds, project.corner_braces.length),
      ],
      calculation_results: null,
    });
  }

  function removeRow(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    index: number,
  ) {
    if (!project) return;
    if (isGuardedDependentKey(key)) {
      const minimumRows = minimumDependentRows(project, key);
      if (project[key].length <= minimumRows) {
        setError(`此表至少需保留 ${minimumRows} 列，請先調整支撐層數；若需要更多列，仍可額外新增。`);
        return;
      }
    }
    if (key === "top_supports" || key === "bottom_supports") {
      applyProjectState(syncAfterSupportRemoval(project, key, index));
      setError("");
      return;
    }
    const list = [...project[key]];
    list.splice(index, 1);
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
    setError("");
  }

  function updateColumn(index: number, field: keyof ColumnScenarioInput, value: string) {
    if (!project) return;
    const columns = [...project.columns];
    const next = { ...columns[index] };
    if (columnNullableNumberFields.includes(field)) {
      next[field] = (value === "" ? null : Number(value)) as never;
    } else if (columnNumericFields.includes(field)) {
      next[field] = Number(value) as never;
    } else {
      next[field] = value as never;
    }
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  function updateColumnEnabled(index: number, enabled: boolean) {
    if (!project) return;
    const columns = [...project.columns];
    const next = { ...columns[index], enabled };
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  function updateColumnVariant(index: number, variant: ColumnScenarioInput["variant"]) {
    if (!project) return;
    const columns = [...project.columns];
    const current = columns[index];
    const currentTitle = current.title?.trim() ?? "";
    const currentDefaultTitle = columnVariantLabel(current.variant);
    const nextDefaultTitle = columnVariantLabel(variant);
    const next = {
      ...current,
      variant,
      title: currentTitle === "" || currentTitle === currentDefaultTitle ? nextDefaultTitle : current.title,
    };
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  async function importConstructionStageHandoff(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!project || !file) return;
    try {
      const column = project.columns[index];
      if (!column || column.variant === "middle") throw new Error("施工階段荷重只能套用至共構柱情境。");
      if (!column.column_id) throw new Error("本共構柱缺少固定識別碼，請先儲存專案後再匯入。");
      const record = JSON.parse(await file.text()) as ConstructionStageHandoff;
      await validateConstructionStageHandoff(record);
      const currentStages = column.construction_stage_loads ?? [];
      if (currentStages.length >= 20) throw new Error("單一共構柱最多可納入 20 個施工階段。");
      if (currentStages.some((stage) => stage.source.handoff_fingerprint === record.handoffFingerprint)) {
        throw new Error("本共構柱已採用相同覆工板交接檔，不得重複匯入。");
      }
      const source = constructionStageSourceFromRecord(record);
      const stageLabel = uniqueConstructionStageLabel(
        currentStages,
        record.source?.projectName || record.source?.projectNo || `施工階段 ${currentStages.length + 1}`,
      );
      const adoption: ConstructionStageLoadAdoption = {
        stage_id: `STG-${record.handoffFingerprint.slice(4)}`,
        stage_label: stageLabel,
        target_column_id: column.column_id,
        load_t: Number(record.load?.controlAxialLoadTf),
        distribution_factor: 1,
        distribution_basis: "",
        apply_transfer_eccentricity: false,
        transfer_eccentricity_x_m: 0,
        transfer_eccentricity_y_m: 0,
        transfer_basis: "",
        source,
      };
      const constructionStageLoads = [...currentStages, adoption];
      const legacyControl = constructionStageLoads.reduce((control, stage) => stage.load_t > control.load_t ? stage : control);
      const columns = [...project.columns];
      columns[index] = {
        ...column,
        construction_stage_load_t: legacyControl.load_t,
        construction_stage_load_source: legacyControl.source,
        construction_stage_loads: constructionStageLoads,
      };
      applyProjectState({ ...project, columns, calculation_results: null });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function updateConstructionStageLabel(columnIndex: number, stageIndex: number, value: string) {
    if (!project) return;
    const columns = [...project.columns];
    const column = columns[columnIndex];
    const constructionStageLoads = [...(column.construction_stage_loads ?? [])];
    constructionStageLoads[stageIndex] = { ...constructionStageLoads[stageIndex], stage_label: value };
    columns[columnIndex] = { ...column, construction_stage_loads: constructionStageLoads };
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function updateConstructionStageAdoption(
    columnIndex: number,
    stageIndex: number,
    patch: Partial<Pick<ConstructionStageLoadAdoption,
      "distribution_factor" | "distribution_basis" |
      "apply_transfer_eccentricity" | "transfer_eccentricity_x_m" | "transfer_eccentricity_y_m" | "transfer_basis">>,
  ) {
    if (!project) return;
    const columns = [...project.columns];
    const column = columns[columnIndex];
    const constructionStageLoads = [...(column.construction_stage_loads ?? [])];
    const current = constructionStageLoads[stageIndex];
    const next = { ...current, ...patch };
    if (patch.apply_transfer_eccentricity === false) {
      next.transfer_eccentricity_x_m = 0;
      next.transfer_eccentricity_y_m = 0;
      next.transfer_basis = "";
    }
    constructionStageLoads[stageIndex] = next;
    columns[columnIndex] = { ...column, construction_stage_loads: constructionStageLoads };
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function removeConstructionStageHandoff(columnIndex: number, stageId: string) {
    if (!project) return;
    const columns = [...project.columns];
    const column = columns[columnIndex];
    const constructionStageLoads = (column.construction_stage_loads ?? []).filter((stage) => stage.stage_id !== stageId);
    const legacyControl = constructionStageLoads.reduce<ConstructionStageLoadAdoption | null>(
      (control, stage) => !control || stage.load_t > control.load_t ? stage : control,
      null,
    );
    columns[columnIndex] = {
      ...column,
      construction_stage_load_t: legacyControl?.load_t ?? 0,
      construction_stage_load_source: legacyControl?.source ?? null,
      construction_stage_loads: constructionStageLoads,
    };
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function addColumnScenario(variant: ColumnScenarioInput["variant"]) {
    if (!project) return;
    const columns = [...project.columns, createColumnScenario(project, variant)];
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function removeColumnScenario(index: number) {
    if (!project) return;
    const columns = [...project.columns];
    columns.splice(index, 1);
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function updateCalculationOption(
    field: keyof CalculationOptions,
    enabled: boolean,
  ) {
    if (!project) return;

    const nextOptions = {
      ...project.calculation_options,
      [field]: enabled,
    };
    if (
      !nextOptions.include_top_supports &&
      !nextOptions.include_bottom_supports
    ) {
      setError("水平支撐至少需納入上層或下層其中一側。");
      return;
    }
    applyProjectState({
      ...project,
      calculation_options: nextOptions,
      calculation_results: null,
    });
    setError("");
  }

  function updateAnalysisSourceMode(side: AnalysisSourceSide, mode: AnalysisSourceMode) {
    if (!project) return;
    applyProjectState(setAnalysisSourceModeOnProject(project, side, mode));
    setError("");
  }

  function applyAnalysisWorkflowPreset(
    mode: AnalysisWorkflowMode,
    preferredSide: AnalysisSourceSide = analysisSingleSide,
  ) {
    if (!project) return;

    let nextProject = project;
    const activeSide = preferredSide;
    const passiveSide = otherAnalysisSide(activeSide);
    const activeSource =
      activeSide === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const passiveSource =
      passiveSide === "top" ? project.top_analysis_source : project.bottom_analysis_source;

    if (mode === "single_manual") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, "manual");
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, "unused");
    } else if (mode === "dual_manual") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, "top", "manual");
      nextProject = setAnalysisSourceModeOnProject(nextProject, "bottom", "manual");
    } else if (mode === "single_import") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, "import");
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, "unused");
    } else if (mode === "dual_import") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, "top", "import");
      nextProject = setAnalysisSourceModeOnProject(nextProject, "bottom", "import");
    } else {
      const activeMode = activeSource.mode === "unused" ? "manual" : activeSource.mode;
      const passiveMode =
        passiveSource.mode === "unused" || passiveSource.mode === activeMode
          ? activeMode === "import"
            ? "manual"
            : "import"
          : passiveSource.mode;
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, activeMode);
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, passiveMode);
    }

    setAnalysisSingleSide(activeSide);
    applyProjectState(nextProject);
    setError("");
  }

  function updateImportEventClassification(
    side: AnalysisSourceSide,
    eventIndex: number,
    classification: AnalysisEvent["classification"],
  ) {
    if (!project) return;

    const sourceKey = side === "top" ? "top_analysis_source" : "bottom_analysis_source";
    const currentSource = project[sourceKey];
    if (currentSource.import_result.events.length <= eventIndex) return;

    const nextEvents = [...currentSource.import_result.events];
    nextEvents[eventIndex] = {
      ...nextEvents[eventIndex],
      classification,
      included: classification === "support" || classification === "brace",
    };

    applyProjectState({
      ...project,
      [sourceKey]: {
        ...currentSource,
        import_result: {
          ...currentSource.import_result,
          events: nextEvents,
        },
      },
      calculation_results: null,
    } as ProjectState);
    setError("");
  }

  function applyImportAssignmentsToSide(side: AnalysisSourceSide) {
    if (!project) return;

    const source = side === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const assignments = buildImportedAssignments(source.import_result);
    const supportAssignments = assignments.filter((item) => item.kind === "support");
    const braceAssignments = assignments.filter((item) => item.kind === "brace");
    const nextProject = {
      ...project,
      calculation_options: { ...project.calculation_options },
      calculation_results: null,
    };

    if (side === "top") {
      nextProject.top_supports = supportAssignments.map((item, index) =>
        toCandidateSupportRow(item, project.top_supports, index, project.calculation_options.auto_temp_force_top_supports),
      );
      nextProject.top_braces = braceAssignments.map((item, index) =>
        toCandidateBraceRow(item, project.top_braces, index),
      );
      nextProject.top_wales = [];
      nextProject.calculation_options.include_top_supports = true;
      nextProject.calculation_options.include_top_braces = braceAssignments.length > 0;
      nextProject.calculation_options.include_top_wales = false;
      nextProject.top_analysis_source = {
        ...project.top_analysis_source,
        mode: "import",
      };
    } else {
      nextProject.bottom_supports = supportAssignments.map((item, index) =>
        toCandidateSupportRow(item, project.bottom_supports, index, project.calculation_options.auto_temp_force_bottom_supports),
      );
      nextProject.bottom_braces = braceAssignments.map((item, index) =>
        toCandidateBraceRow(item, project.bottom_braces, index),
      );
      nextProject.bottom_wales = [];
      nextProject.calculation_options.include_bottom_supports = true;
      nextProject.calculation_options.include_bottom_braces = braceAssignments.length > 0;
      nextProject.calculation_options.include_bottom_wales = false;
      nextProject.bottom_analysis_source = {
        ...project.bottom_analysis_source,
        mode: "import",
      };
    }

    if (
      !nextProject.calculation_options.include_top_supports &&
      !nextProject.calculation_options.include_bottom_supports
    ) {
      if (side === "top") {
        nextProject.calculation_options.include_top_supports = true;
      } else {
        nextProject.calculation_options.include_bottom_supports = true;
      }
    }

    applyProjectState(nextProject);
    setError("");
  }

  const [statusCounts, resultOverview] = useMemo(() => {
    const rows = project?.calculation_results ? flattenChecks(project.calculation_results) : [];
    return [
      {
        ok: rows.filter((item) => item.status === "OK").length,
        warn: rows.filter((item) => item.status === "Say~OK").length,
        ng: rows.filter((item) => item.status === "NG").length,
      },
      {
        total: rows.length,
        warnings: project?.calculation_results?.warnings.length ?? 0,
        worstRatio: rows.reduce((max, row) => Math.max(max, normalizedRatio(row.utilization_ratio)), 0),
      },
    ];
  }, [project?.calculation_results]);

  const topImportedStruts = useMemo(
    () => (project ? flattenImportedStruts(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomImportedStruts = useMemo(
    () => (project ? flattenImportedStruts(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const topIgnoredImportEvents = useMemo(
    () => (project ? flattenIgnoredImportEvents(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomIgnoredImportEvents = useMemo(
    () => (project ? flattenIgnoredImportEvents(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const topImportSummary = useMemo(
    () => (project ? buildImportSummary(project.top_analysis_source.import_result) : emptyImportSummary()),
    [project?.top_analysis_source],
  );
  const bottomImportSummary = useMemo(
    () => (project ? buildImportSummary(project.bottom_analysis_source.import_result) : emptyImportSummary()),
    [project?.bottom_analysis_source],
  );
  const topImportedAssignments = useMemo(
    () => (project ? buildImportedAssignments(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomImportedAssignments = useMemo(
    () => (project ? buildImportedAssignments(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const editableSoils = useMemo(
    () => (project ? buildEditableSoils(project) : []),
    [project?.analysis_import.soils, project?.columns],
  );
  const boltSizeKeys = useMemo(
    () => collectBoltSizeKeys(referenceDraft?.bolts ?? bootstrap?.reference_data.bolts ?? []),
    [referenceDraft?.bolts, bootstrap?.reference_data.bolts],
  );
  const referenceDirty = useMemo(() => {
    if (!referenceDraft || !bootstrap) return false;
    return JSON.stringify(referenceDraft) !== JSON.stringify(bootstrap.reference_data);
  }, [referenceDraft, bootstrap?.reference_data]);
  const sectionOptions = useMemo(
    () => buildSectionOptions(referenceDraft?.sections ?? bootstrap?.reference_data.sections ?? []),
    [referenceDraft?.sections, bootstrap?.reference_data.sections],
  );
  const sectionCatalog = useMemo(
    () => referenceDraft?.sections ?? bootstrap?.reference_data.sections ?? [],
    [referenceDraft?.sections, bootstrap?.reference_data.sections],
  );
  const waleWallDeduction = useMemo(
    () => ({
      moment: wallMomentStrength(project?.basic_parameters),
      shear: wallShearStrength(project?.basic_parameters),
    }),
    [project?.basic_parameters],
  );
  const columnSupportCount = useMemo(
    () =>
      project
        ? (project.calculation_options.include_top_supports ? project.top_supports.length : 0) +
          (project.calculation_options.include_bottom_supports ? project.bottom_supports.length : 0)
        : 0,
    [
      project?.calculation_options.include_top_supports,
      project?.calculation_options.include_bottom_supports,
      project?.top_supports,
      project?.bottom_supports,
    ],
  );
  const currentSupportMode = useMemo(
    () => (project ? supportModeLabel(project.calculation_options) : "未設定"),
    [project?.calculation_options],
  );
  const showConcreteWallFields = useMemo(
    () => usesConcreteWallParameters(project?.basic_parameters.wall_type),
    [project?.basic_parameters.wall_type],
  );
  const advancedSettingsCustomCount = useMemo(
    () => countCustomizedAdvancedSettings(project?.basic_parameters),
    [project?.basic_parameters],
  );
  const advancedSettingsSummary = advancedSettingsCustomCount === 0 ? "全部使用預設值" : `已自訂 ${advancedSettingsCustomCount} 項`;
  const analysisWorkflowMode = useMemo(
    () =>
      project
        ? deriveAnalysisWorkflowMode(project.top_analysis_source.mode, project.bottom_analysis_source.mode)
        : "single_manual",
    [project?.top_analysis_source.mode, project?.bottom_analysis_source.mode],
  );
  const displayedSingleSide = useMemo(
    () =>
      project
        ? deriveSingleAnalysisSide(project.top_analysis_source.mode, project.bottom_analysis_source.mode) ??
          analysisSingleSide
        : analysisSingleSide,
    [analysisSingleSide, project?.top_analysis_source.mode, project?.bottom_analysis_source.mode],
  );
  const componentTabItems = useMemo(() => {
    if (!project) {
      return [] as Array<{ key: ComponentTabKey; label: string; note: string; tone: "ok" | "warn" | "muted" }>;
    }
    return [
      {
        key: "support" as const,
        label: "支撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_supports
              ? rowCompletionSummary(project.top_supports, isSupportRowComplete)
              : null,
            project.calculation_options.include_bottom_supports
              ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete)
              : null,
          ],
          {
            emptyLabel: "未設定支撐",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_supports
              ? rowCompletionSummary(project.top_supports, isSupportRowComplete)
              : null,
            project.calculation_options.include_bottom_supports
              ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete)
              : null,
          ],
        ),
      },
      {
        key: "wale" as const,
        label: "橫擋",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_wales
              ? rowCompletionSummary(project.top_wales, isWaleRowComplete)
              : null,
            project.calculation_options.include_bottom_wales
              ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_wales
              ? rowCompletionSummary(project.top_wales, isWaleRowComplete)
              : null,
            project.calculation_options.include_bottom_wales
              ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete)
              : null,
          ],
          true,
        ),
      },
      {
        key: "brace" as const,
        label: "斜撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_braces
              ? rowCompletionSummary(project.top_braces, isBraceRowComplete)
              : null,
            project.calculation_options.include_bottom_braces
              ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_braces
              ? rowCompletionSummary(project.top_braces, isBraceRowComplete)
              : null,
            project.calculation_options.include_bottom_braces
              ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete)
              : null,
          ],
          true,
        ),
      },
      {
        key: "corner" as const,
        label: "大角撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_corner_braces
              ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_corner_braces
              ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
              : null,
          ],
          true,
        ),
      },
    ];
  }, [project]);
  const topSourceCompletion = useMemo(
    () =>
      project
        ? analysisSourceCompletion(
            project.top_analysis_source.mode,
            project.top_analysis_source,
            project.top_supports,
            topImportedAssignments,
            topImportSummary,
          )
        : "尚未建立",
    [project, topImportedAssignments, topImportSummary],
  );
  const bottomSourceCompletion = useMemo(
    () =>
      project
        ? analysisSourceCompletion(
            project.bottom_analysis_source.mode,
            project.bottom_analysis_source,
            project.bottom_supports,
            bottomImportedAssignments,
            bottomImportSummary,
          )
        : "尚未建立",
    [project, bottomImportedAssignments, bottomImportSummary],
  );
  const stepSummaries = useMemo(() => {
    if (!project) {
      return steps.map(() => ({ text: "待建立", tone: "muted" as const }));
    }

    const metadataFields = [
      project.metadata.name,
      project.metadata.project_code,
      project.metadata.client,
      project.metadata.designer,
      project.metadata.checker,
      project.metadata.location,
    ];
    const metadataCompleted = metadataFields.filter(hasTextValue).length;
    const metadataMissingCount = metadataFields.length - metadataCompleted;

    const activeSourceCompletions = [
      project.top_analysis_source.mode !== "unused"
        ? analysisSourceCompletion(
            project.top_analysis_source.mode,
            project.top_analysis_source,
            project.top_supports,
            topImportedAssignments,
            topImportSummary,
          )
        : null,
      project.bottom_analysis_source.mode !== "unused"
        ? analysisSourceCompletion(
            project.bottom_analysis_source.mode,
            project.bottom_analysis_source,
            project.bottom_supports,
            bottomImportedAssignments,
            bottomImportSummary,
          )
        : null,
    ].filter(Boolean) as string[];
    let analysisSummary: { text: string; tone: "ok" | "warn" | "muted" | "ng" } = {
      text: "待選來源",
      tone: "warn",
    };
    if (activeSourceCompletions.length > 0) {
      if (activeSourceCompletions.some((item) => item.startsWith("待判讀"))) {
        analysisSummary = { text: "待判讀事件", tone: "warn" };
      } else if (activeSourceCompletions.some((item) => item.startsWith("尚未"))) {
        analysisSummary = { text: "待匯入/待填", tone: "warn" };
      } else if (activeSourceCompletions.some((item) => item.startsWith("待補") || item.startsWith("未辨識"))) {
        analysisSummary = { text: "來源待補", tone: "warn" };
      } else {
        analysisSummary = {
          text: activeSourceCompletions.length >= 2 ? "上下層已就緒" : "單側已就緒",
          tone: "ok",
        };
      }
    }

    const basicFields = [
      hasPositiveValue(project.basic_parameters.e_tf_per_cm2),
      hasPositiveValue(project.basic_parameters.fy_tf_per_cm2),
      hasPositiveValue(project.basic_parameters.cm_factor),
      hasPositiveValue(project.basic_parameters.surcharge_wl_tf_per_m),
      hasPositiveValue(project.basic_parameters.alpha_support),
      hasPositiveValue(project.basic_parameters.alpha_wale),
      hasPositiveValue(project.basic_parameters.alpha_brace),
      hasPositiveValue(project.basic_parameters.alpha_corner_brace),
      hasPositiveValue(project.basic_parameters.alpha_column),
      hasPositiveValue(project.basic_parameters.psi_material),
      hasTextValue(project.basic_parameters.wall_type),
      ...(showConcreteWallFields
        ? [
            hasPositiveValue(project.basic_parameters.wall_thickness_cm),
            hasPositiveValue(project.basic_parameters.wall_fc_kg_per_cm2),
          ]
        : []),
    ];
    const missingBasicCount = basicFields.filter((item) => !item).length;
    const validSoils = editableSoils.filter((soil) => hasPositiveValue(soil.depth_m ?? null)).length;
    const projectSettingSummary =
      metadataMissingCount === 0 && missingBasicCount === 0 && validSoils > 0
        ? { text: `基本資料已齊 / 土層 ${validSoils} 層`, tone: "ok" as const }
        : {
            text:
              metadataMissingCount + missingBasicCount > 0
                ? `待補 ${metadataMissingCount + missingBasicCount} 項 / 土層 ${validSoils} 層`
                : `待確認土層 / 目前 ${validSoils} 層`,
            tone: "warn" as const,
          };

    const structuralModuleCompletions = [
      project.calculation_options.include_top_supports ? rowCompletionSummary(project.top_supports, isSupportRowComplete) : null,
      project.calculation_options.include_bottom_supports ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete) : null,
      project.calculation_options.include_top_wales ? rowCompletionSummary(project.top_wales, isWaleRowComplete) : null,
      project.calculation_options.include_bottom_wales ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete) : null,
      project.calculation_options.include_top_braces ? rowCompletionSummary(project.top_braces, isBraceRowComplete) : null,
      project.calculation_options.include_bottom_braces ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete) : null,
      project.calculation_options.include_corner_braces
        ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
        : null,
    ].filter(Boolean) as string[];
    const structuralIncomplete = structuralModuleCompletions.filter((item) => !item.startsWith("已齊")).length;
    const structuralSummary =
      structuralModuleCompletions.length === 0
        ? { text: "待納入模組", tone: "warn" as const }
        : structuralIncomplete === 0
          ? { text: `${structuralModuleCompletions.length} 模組已齊`, tone: "ok" as const }
          : { text: `待補 ${structuralIncomplete} 模組`, tone: "warn" as const };

    const enabledColumns = project.columns.filter((column) => column.enabled);
    const incompleteColumns = enabledColumns.filter((column) => !columnInputComplete(column)).length;
    const columnSummary =
      enabledColumns.length === 0
        ? { text: "未納入柱構件", tone: "muted" as const }
        : incompleteColumns === 0
          ? { text: `${enabledColumns.length} 情境已齊`, tone: "ok" as const }
          : { text: `待補 ${incompleteColumns} 情境`, tone: "warn" as const };

    let resultSummary: { text: string; tone: "ok" | "warn" | "muted" | "ng" } = { text: "待重算", tone: "muted" };
    if (project.calculation_results) {
      if (statusCounts.ng > 0) resultSummary = { text: `NG ${statusCounts.ng} 項`, tone: "ng" };
      else if (statusCounts.warn > 0) resultSummary = { text: `注意 ${statusCounts.warn} 項`, tone: "warn" };
      else resultSummary = { text: "全數通過", tone: "ok" };
    }

    const reportSummary = !project.calculation_results
      ? { text: "待產出", tone: "muted" as const }
      : reportUrl || wordReportUrl
        ? { text: "已有最新檔案", tone: "ok" as const }
        : { text: "可產出報表", tone: "warn" as const };

    const receiptAssistantSummary = !receiverAssistantHandoff
      ? { text: "待匯入 ERH", tone: "muted" as const }
      : receiverAssistantReceipt
        ? receiverAssistantReceipt.summary.status === "passed"
          ? { text: "RVR 已建立／待核身分", tone: "ok" as const }
          : { text: "RVR 結果未通過", tone: "ng" as const }
        : { text: `待填 ${receiverAssistantHandoff.transfers.length} 筆`, tone: "warn" as const };

    return [
      projectSettingSummary,
      analysisSummary,
      structuralSummary,
      columnSummary,
      resultSummary,
      reportSummary,
      receiptAssistantSummary,
    ];
  }, [
    project,
    topImportedAssignments,
    topImportSummary,
    bottomImportedAssignments,
    bottomImportSummary,
    editableSoils,
    showConcreteWallFields,
    statusCounts,
    reportUrl,
    wordReportUrl,
    receiverAssistantHandoff,
    receiverAssistantReceipt,
  ]);
  const enabledSummaryLabels = useMemo(() => {
    if (!project?.calculation_results) return [] as string[];
    return availableSummaryColumns(project.calculation_results.summary).map((column) => column.label);
  }, [project?.calculation_results]);
  const projectDirty = useMemo(() => {
    if (!project || !persistedProjectSnapshot) return false;
    return serializeProjectState(project) !== persistedProjectSnapshot;
  }, [project, persistedProjectSnapshot]);
  const projectFreshness = useMemo(() => {
    if (!project) {
      return {
        text: "待建立專案",
        detail: "目前尚未載入專案資料。",
        tone: "muted" as const,
      };
    }
    if (projectDirty) {
      return {
        text: "有未儲存變更",
        detail: "請先儲存專案，避免後續切換或匯出時混淆版本。",
        tone: "warn" as const,
      };
    }
    return {
      text: "專案已儲存",
      detail: `最近儲存：${fmtDateTime(project.metadata.updated_at)}`,
      tone: "ok" as const,
    };
  }, [project, projectDirty]);
  const calculationFreshness = useMemo(() => {
    if (!project?.calculation_results) {
      return {
        text: "待重新計算",
        detail: "最近的輸入異動尚未反映到檢核結果。",
        tone: "warn" as const,
      };
    }
    if (statusCounts.ng > 0) {
      return {
        text: `已有 NG ${statusCounts.ng} 項`,
        detail: "結果已更新，建議先處理不合格項目。",
        tone: "ng" as const,
      };
    }
    if (statusCounts.warn > 0) {
      return {
        text: `已有注意 ${statusCounts.warn} 項`,
        detail: "結果已更新，建議優先確認臨界項目。",
        tone: "warn" as const,
      };
    }
    return {
      text: "檢核結果已更新",
      detail: `最近計算：${fmtDateTime(project.calculation_results.generated_at)}`,
      tone: "ok" as const,
    };
  }, [project?.calculation_results, statusCounts]);
  const reportFreshness = useMemo(() => {
    if (!project?.calculation_results) {
      return {
        text: "報表待重產",
        detail: "請先重新計算，再產出最新 Word / PDF。",
        tone: "muted" as const,
      };
    }
    if (reportUrl || wordReportUrl) {
      return {
        text: "已有本次報表",
        detail: "目前下載連結對應本次計算結果。",
        tone: "ok" as const,
      };
    }
    return {
      text: "尚未產出報表",
      detail: "結果已可用，若要送審可直接產出報表。",
      tone: "warn" as const,
    };
  }, [project?.calculation_results, reportUrl, wordReportUrl]);
  const autoSaveLabel = useMemo(() => {
    if (autoSaving) return "自動儲存中…";
    if (lastAutoSavedAt) return `自動儲存於 ${fmtClock(lastAutoSavedAt)}`;
    return "自動儲存：閒置 30 秒後";
  }, [autoSaving, lastAutoSavedAt]);

  function renderAnalysisSourceCard(
    side: AnalysisSourceSide,
    options?: {
      showModeSelector?: boolean;
      title?: string;
      subtitle?: string;
    },
  ) {
    if (!project) return null;

    const source = side === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const importedStruts = side === "top" ? topImportedStruts : bottomImportedStruts;
    const ignoredEvents = side === "top" ? topIgnoredImportEvents : bottomIgnoredImportEvents;
    const importSummary = side === "top" ? topImportSummary : bottomImportSummary;
    const importedAssignments = side === "top" ? topImportedAssignments : bottomImportedAssignments;
    const manualRows = side === "top" ? project.top_supports : project.bottom_supports;
    const sideLabel = sidePrefixLabel(side);

    return (
      <AnalysisSourceCard
        key={side}
        title={options?.title ?? `${sideLabel}來源`}
        subtitle={options?.subtitle}
        sideLabel={sideLabel}
        mode={source.mode}
        source={source}
        sectionOptions={sectionOptions}
        importedStruts={importedStruts}
        ignoredEvents={ignoredEvents}
        importSummary={importSummary}
        importedAssignments={importedAssignments}
        manualRows={manualRows}
        showModeSelector={options?.showModeSelector ?? false}
        onModeChange={(mode) => updateAnalysisSourceMode(side, mode)}
        onImport={(event) => void handleImportAnalysis(side, event)}
        onUpdateImportEventClassification={(eventIndex, classification) =>
          updateImportEventClassification(side, eventIndex, classification)
        }
        onApplyAssignments={() => applyImportAssignmentsToSide(side)}
        onAddManualRow={() => addSupportRow(side === "top" ? "top_supports" : "bottom_supports")}
        onRemoveManualRow={(index) =>
          removeRow(side === "top" ? "top_supports" : "bottom_supports", index)
        }
        onChangeManualRow={(index, field, value) =>
          updateArrayRow<SupportRow>(
            side === "top" ? "top_supports" : "bottom_supports",
            index,
            field,
            value,
          )
        }
        onApplySectionToAll={(sectionName) =>
          applySectionNameToAll(side === "top" ? "top_supports" : "bottom_supports", sectionName)
        }
        onGotoDesign={() => setActiveStep(STEP_COMPONENTS)}
      />
    );
  }

  function updateReferenceSection(index: number, field: keyof SectionProperty, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const sections = [...current.sections];
      const next = { ...sections[index] };
      const currentValue = next[field];
      next[field] =
        typeof currentValue === "number" ? (toNumber(value) as never) : (value as never);
      sections[index] = next;
      return { ...current, sections };
    });
  }

  function addReferenceSection() {
    setReferenceDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: [...current.sections, emptySectionProperty(current.sections.length + 1)],
      };
    });
  }

  function removeReferenceSection(index: number) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const sections = [...current.sections];
      sections.splice(index, 1);
      return { ...current, sections };
    });
  }

  function updateReferenceBolt(index: number, field: keyof BoltStrengthRow, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      const next = { ...bolts[index] };
      if (field === "grade") {
        next.grade = value;
      } else if (field === "ft_tf_per_cm2" || field === "fv_tf_per_cm2") {
        next[field] = toNullableNumber(value);
      }
      bolts[index] = next;
      return { ...current, bolts };
    });
  }

  function updateReferenceBoltSize(index: number, sizeKey: string, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      const next = {
        ...bolts[index],
        sizes: {
          ...bolts[index].sizes,
          [sizeKey]: toNumber(value),
        },
      };
      bolts[index] = next;
      return { ...current, bolts };
    });
  }

  function addReferenceBolt() {
    setReferenceDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        bolts: [...current.bolts, emptyBoltStrengthRow(current.bolts.length + 1, boltSizeKeys)],
      };
    });
  }

  function removeReferenceBolt(index: number) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      bolts.splice(index, 1);
      return { ...current, bolts };
    });
  }

  function replaceSoils(nextSoils: SoilLayer[]) {
    if (!project) return;
    const normalized = normalizeSoils(nextSoils);
    applyProjectState({
      ...project,
      analysis_import: {
        ...project.analysis_import,
        soils: normalized,
      },
      columns: syncColumnsFromSoils(project.columns, normalized),
      calculation_results: null,
    });
  }

  function updateSoilRow(index: number, field: keyof SoilLayer, value: string) {
    const rows = [...editableSoils];
    const target = { ...rows[index] };
    const numericFields: Array<keyof SoilLayer> = [
      "depth_m",
      "n_value",
      "unit_weight_t_per_m3",
      "phi_deg",
      "cohesion_t_per_m2",
      "delta_ratio",
      "su_t_per_m2",
      "ka",
      "kp",
      "es_t_per_m2",
      "kh_t_per_m3",
    ];
    if (numericFields.includes(field)) {
      target[field] = (value === "" ? null : Number(value)) as never;
    } else {
      target[field] = value as never;
    }
    rows[index] = target;
    replaceSoils(rows);
  }

  function addSoilRow() {
    replaceSoils([...editableSoils, emptySoilRow(editableSoils.length + 1)]);
  }

  function removeSoilRow(index: number) {
    const rows = [...editableSoils];
    rows.splice(index, 1);
    replaceSoils(rows);
  }

  if (!bootstrap || !project) {
    return (
      <div className="loading-shell">
        <div className="loading-card">
          <h1>擋土支撐計算工具</h1>
          <p>{busy || "載入中..."}</p>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">Excavation Strut</p>
          <h1>擋土支撐計算平台</h1>
          <p className="brand-note">
            單機本地版，整合分析匯入、構件檢核、彙整結果與 PDF 計算書。
          </p>
        </div>
        <div className="status-card">
          <div className="status-card-item ok">
            <span>OK</span>
            <strong>{statusCounts.ok}</strong>
          </div>
          <div className="status-card-item warn">
            <span>Say~OK</span>
            <strong>{statusCounts.warn}</strong>
          </div>
          <div className="status-card-item ng">
            <span>NG</span>
            <strong>{statusCounts.ng}</strong>
          </div>
        </div>
        <nav className="step-nav">
          {steps.map((step, index) => (
            <button
              key={step}
              className={`step-button ${index === activeStep ? "active" : ""} ${stepSummaries[index]?.tone ?? "muted"}`}
              onClick={() => setActiveStep(index)}
            >
              <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="step-copy">
                <strong>{step}</strong>
                <small className={`step-note ${stepSummaries[index]?.tone ?? "muted"}`}>
                  {stepSummaries[index]?.text ?? "待建立"}
                </small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="toolbar">
          <div className="toolbar-group">
            {activeStep === STEP_RECEIPT ? (
              <>
                <strong>獨立接收端工作區</strong>
                <span className="toolbar-label">不會寫入目前來源專案或計算書</span>
              </>
            ) : (
              <>
                <label className="toolbar-label">專案</label>
                <select
                  value={project.metadata.id ?? ""}
                  onChange={(event) => handleProjectSwitch(event.target.value)}
                >
                  {projectList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button className="secondary" onClick={handleCreateProject}>
                  新增專案
                </button>
              </>
            )}
          </div>
          <div className="toolbar-group">
            {activeStep !== STEP_RECEIPT && (
              <>
                <button className="secondary" onClick={handleSaveProject} disabled={!projectDirty}>
                  {projectDirty ? "儲存變更" : "已儲存"}
                </button>
                <span className="toolbar-label">{autoSaveLabel}</span>
              </>
            )}
            <button className="secondary" onClick={() => jumpToStep(STEP_RESULTS)}>
              前往檢核結果
            </button>
            <button className="secondary" onClick={() => jumpToStep(STEP_REPORT)}>
              前往報表匯出
            </button>
            <button className="secondary" onClick={() => openReceiverAssistant(activeRemovalTransferHandoff)}>
              接收端回簽助手
            </button>
          </div>
        </header>

        {activeStep !== STEP_RECEIPT ? (
          <div className="toolbar-status-strip">
            <div className={`toolbar-status-card ${projectFreshness.tone}`}>
              <span>專案狀態</span>
              <strong>{projectFreshness.text}</strong>
              <small>{projectFreshness.detail}</small>
            </div>
            <div className={`toolbar-status-card ${calculationFreshness.tone}`}>
              <span>檢算狀態</span>
              <strong>{calculationFreshness.text}</strong>
              <small>{calculationFreshness.detail}</small>
            </div>
            <div className={`toolbar-status-card ${reportFreshness.tone}`}>
              <span>報表狀態</span>
              <strong>{reportFreshness.text}</strong>
              <small>{reportFreshness.detail}</small>
            </div>
            <div className="toolbar-status-card muted compact">
              <span>附件模式</span>
              <strong>{reportModeLabel}</strong>
              <small>可於報表匯出頁切換詳細版或簡述版。</small>
            </div>
          </div>
        ) : (
          <div className="banner-info receiver-workspace-banner">
            目前為獨立接收端工作區：ERH、表單與產出的 RVR 只存在本次瀏覽器工作階段，不會改動來源專案，也不會寫入 PDF／DOCX 計算書。
          </div>
        )}

        {busy && <div className="banner-info">處理中：{busy}</div>}
        {error && <div className="banner-error">{error}</div>}

        {activeStep === STEP_PROJECT && (
          <section className="panel-grid">
            <Panel title="專案基本資訊" subtitle="這些欄位會出現在結果頁與 PDF 計算書中。">
              <div className="form-grid">
                <Field label="工程名稱" value={project.metadata.name} onChange={(v) => updateMetadata("name", v)} />
                <Field
                  label="專案代號"
                  value={project.metadata.project_code}
                  onChange={(v) => updateMetadata("project_code", v)}
                />
                <Field label="委託單位" value={project.metadata.client} onChange={(v) => updateMetadata("client", v)} />
                <Field label="設計人員" value={project.metadata.designer} onChange={(v) => updateMetadata("designer", v)} />
                <Field label="校核人員" value={project.metadata.checker} onChange={(v) => updateMetadata("checker", v)} />
                <Field label="單位/公司" value={project.metadata.organization} onChange={(v) => updateMetadata("organization", v)} />
                <Field label="工程位置" value={project.metadata.location} onChange={(v) => updateMetadata("location", v)} />
                <Field
                  label="規範包版本"
                  value={project.metadata.spec_pack_version}
                  onChange={(v) => updateMetadata("spec_pack_version", v)}
                />
              </div>
              <label className="field-block">
                <span>備註</span>
                <textarea
                  rows={5}
                  value={project.metadata.notes}
                  onChange={(event) => updateMetadata("notes", event.target.value)}
                />
              </label>
            </Panel>
            <Panel
              title="參考資料"
              subtitle="以 Excel 為基礎，另外提供本地修改、增加、刪除模式；儲存後會影響後續檢核與 PDF。"
            >
              <div className="meta-grid">
                <MetaItem label="型鋼筆數" value={String(referenceDraft?.sections.length ?? 0)} />
                <MetaItem label="螺栓資料" value={String(referenceDraft?.bolts.length ?? 0)} />
                <MetaItem label="目前模式" value={referenceDirty ? "本地草稿未儲存" : "已同步"} />
              </div>
              <div className="action-row">
                <button className="primary" disabled={!referenceDraft || !referenceDirty} onClick={handleSaveReferenceData}>
                  儲存參考資料
                </button>
                <button className="secondary" disabled={!bootstrap} onClick={handleResetReferenceData}>
                  還原 Excel 原始值
                </button>
              </div>
              <p className="meta-line">
                若變更型鋼名稱，請同步確認支撐/橫擋/斜撐/柱構件中的型號文字；既有專案重新計算時也會使用這份資料。
              </p>
              {referenceDraft && (
                <div className="reference-stack">
                  <details className="reference-group">
                    <summary className="reference-summary">型鋼資料庫</summary>
                    <div className="table-actions">
                      <button className="secondary" onClick={addReferenceSection}>
                        新增型鋼
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>型號</th>
                            <th>H (cm)</th>
                            <th>B (cm)</th>
                            <th>tw (cm)</th>
                            <th>tf (cm)</th>
                            <th>A (cm2)</th>
                            <th>單重 (kgf/m)</th>
                            <th>Ix (cm4)</th>
                            <th>Iy (cm4)</th>
                            <th>rx (cm)</th>
                            <th>ry (cm)</th>
                            <th>rt (cm)</th>
                            <th>Sx (cm3)</th>
                            <th>Sy (cm3)</th>
                            <th>Zx (cm3)</th>
                            <th>Zy (cm3)</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {referenceDraft.sections.map((section, index) => (
                            <tr key={`${section.name}-${index}`}>
                              <td><input value={section.name} onChange={(event) => updateReferenceSection(index, "name", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.depth_cm} onChange={(event) => updateReferenceSection(index, "depth_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.flange_width_cm} onChange={(event) => updateReferenceSection(index, "flange_width_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.web_thickness_cm} onChange={(event) => updateReferenceSection(index, "web_thickness_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.flange_thickness_cm} onChange={(event) => updateReferenceSection(index, "flange_thickness_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.area_cm2} onChange={(event) => updateReferenceSection(index, "area_cm2", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.unit_weight_kgf_per_m} onChange={(event) => updateReferenceSection(index, "unit_weight_kgf_per_m", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.ix_cm4} onChange={(event) => updateReferenceSection(index, "ix_cm4", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.iy_cm4} onChange={(event) => updateReferenceSection(index, "iy_cm4", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.rx_cm} onChange={(event) => updateReferenceSection(index, "rx_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.ry_cm} onChange={(event) => updateReferenceSection(index, "ry_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.rt_cm} onChange={(event) => updateReferenceSection(index, "rt_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.sx_cm3} onChange={(event) => updateReferenceSection(index, "sx_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.sy_cm3} onChange={(event) => updateReferenceSection(index, "sy_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.zx_cm3} onChange={(event) => updateReferenceSection(index, "zx_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.zy_cm3} onChange={(event) => updateReferenceSection(index, "zy_cm3", event.target.value)} /></td>
                              <td><button className="ghost" onClick={() => removeReferenceSection(index)}>刪除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  <details className="reference-group">
                    <summary className="reference-summary">螺栓資料庫</summary>
                    <div className="table-actions">
                      <button className="secondary" onClick={addReferenceBolt}>
                        新增螺栓列
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>等級</th>
                            <th>Ft (tf/cm2)</th>
                            <th>Fv (tf/cm2)</th>
                            {boltSizeKeys.map((sizeKey) => (
                              <th key={sizeKey}>{sizeKey}</th>
                            ))}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {referenceDraft.bolts.map((bolt, index) => (
                            <tr key={`${bolt.grade}-${index}`}>
                              <td><input value={bolt.grade} onChange={(event) => updateReferenceBolt(index, "grade", event.target.value)} /></td>
                              <td><input type="number" step="any" value={bolt.ft_tf_per_cm2 ?? ""} onChange={(event) => updateReferenceBolt(index, "ft_tf_per_cm2", event.target.value)} /></td>
                              <td><input type="number" step="any" value={bolt.fv_tf_per_cm2 ?? ""} onChange={(event) => updateReferenceBolt(index, "fv_tf_per_cm2", event.target.value)} /></td>
                              {boltSizeKeys.map((sizeKey) => (
                                <td key={`${bolt.grade}-${sizeKey}`}>
                                  <input
                                    type="number"
                                    step="any"
                                    value={bolt.sizes[sizeKey] ?? 0}
                                    onChange={(event) => updateReferenceBoltSize(index, sizeKey, event.target.value)}
                                  />
                                </td>
                              ))}
                              <td><button className="ghost" onClick={() => removeReferenceBolt(index)}>刪除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeStep >= STEP_COMPONENTS && activeStep < STEP_RESULTS && (
          <section
            className={`panel-stack-tight quick-settings-shell ${quickSettingsExpanded ? "expanded" : "collapsed"}`}
          >
            <Panel
              title="常用工具列"
              subtitle="保留常用操作於上方；需要時再展開設定，避免遮住輸入畫面。"
            >
              <div className="quick-top-actions">
                <button className="secondary" type="button" onClick={scrollToTop}>
                  回到頁首
                </button>
                <button className="secondary" type="button" onClick={handleSaveProject}>
                  先存專案
                </button>
                <button className="secondary" type="button" onClick={() => jumpToStep(STEP_REPORT)}>
                  前往報表匯出
                </button>
                <button
                  className={quickSettingsExpanded ? "ghost" : "secondary"}
                  type="button"
                  aria-expanded={quickSettingsExpanded}
                  onClick={() => setQuickSettingsExpanded((expanded) => !expanded)}
                >
                  {quickSettingsExpanded ? "收合常用設定" : "展開常用設定"}
                </button>
              </div>
              <div className="quick-settings-summary">
                <span className="pill">支撐檢討：{currentSupportMode}</span>
                <span className="pill">
                  橫擋牆體扣底：{project.calculation_options.consider_wall_deduction_for_wales ? "考慮" : "不考慮"}
                </span>
                <span className="pill">
                  上層 N2：{project.calculation_options.auto_temp_force_top_supports ? "自動" : "手動"}
                </span>
                <span className="pill">
                  下層 N2：{project.calculation_options.auto_temp_force_bottom_supports ? "自動" : "手動"}
                </span>
                <span className="pill">報表：{reportModeLabel}</span>
              </div>
              {quickSettingsExpanded && (
                <div className="quick-settings-grid">
                  <div className="quick-setting-group">
                    <span className="toolbar-label">支撐模式</span>
                    <div className="pill-row">
                      <button
                        className={`action-pill ${project.calculation_options.include_top_supports && !project.calculation_options.include_bottom_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("top")}
                      >
                        單向上層
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.include_bottom_supports && !project.calculation_options.include_top_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("bottom")}
                      >
                        單向下層
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.include_top_supports && project.calculation_options.include_bottom_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("dual")}
                      >
                        雙向支撐
                      </button>
                    </div>
                  </div>
                  <div className="quick-setting-group">
                    <span className="toolbar-label">常用選項</span>
                    <div className="pill-row">
                      <button
                        className={`action-pill ${project.calculation_options.consider_wall_deduction_for_wales ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "consider_wall_deduction_for_wales",
                            !project.calculation_options.consider_wall_deduction_for_wales,
                          )
                        }
                      >
                        {`橫擋牆體扣底：${project.calculation_options.consider_wall_deduction_for_wales ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.auto_temp_force_top_supports ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "auto_temp_force_top_supports",
                            !project.calculation_options.auto_temp_force_top_supports,
                          )
                        }
                      >
                        {`上層 N2 自動：${project.calculation_options.auto_temp_force_top_supports ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.auto_temp_force_bottom_supports ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "auto_temp_force_bottom_supports",
                            !project.calculation_options.auto_temp_force_bottom_supports,
                          )
                        }
                      >
                        {`下層 N2 自動：${project.calculation_options.auto_temp_force_bottom_supports ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${!conciseReportMode ? "active" : ""}`}
                        onClick={() => setReportMode(false)}
                      >
                        報表：詳細版
                      </button>
                      <button
                        className={`action-pill ${conciseReportMode ? "active" : ""}`}
                        onClick={() => setReportMode(true)}
                      >
                        報表：簡述版
                      </button>
                    </div>
                  </div>
                  <div className="quick-setting-group">
                    <span className="toolbar-label">快速跳轉</span>
                    <div className="pill-row">
                      <button className="action-pill" onClick={() => jumpToStep(STEP_PROJECT)}>專案設定</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_COMPONENTS)}>構件輸入</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_COLUMNS)}>柱構件</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_RESULTS)}>檢核結果</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_REPORT)}>報表匯出</button>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_ANALYSIS && (
          <section className="panel-stack">
            <Panel title="分析成果分流" subtitle="先選作業方式，再顯示對應的輸入版面；支撐型號可先選，橫擋與斜撐幾何則留到下一步補齊。">
              <div className="workflow-mode-grid">
                {analysisWorkflowOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`workflow-mode-button ${analysisWorkflowMode === option.value ? "active" : ""}`}
                    onClick={() => applyAnalysisWorkflowPreset(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              {(analysisWorkflowMode === "single_manual" || analysisWorkflowMode === "single_import") && (
                <div className="workflow-side-row">
                  <span className="workflow-side-label">檢討側別</span>
                  <div className="pill-row">
                    {(["top", "bottom"] as AnalysisSourceSide[]).map((side) => (
                      <button
                        key={side}
                        type="button"
                        className={`pill action-pill ${displayedSingleSide === side ? "active" : ""}`}
                        onClick={() => {
                          setAnalysisSingleSide(side);
                          applyAnalysisWorkflowPreset(analysisWorkflowMode, side);
                        }}
                      >
                        {sidePrefixLabel(side)}檢討
                      </button>
                    ))}
                  </div>
                </div>
              )}
                <div className="workflow-summary">
                  <div className="pill-row">
                    <span className="pill">作業模式：{analysisWorkflowModeLabel(analysisWorkflowMode)}</span>
                    <span className="pill">支撐檢討：{currentSupportMode}</span>
                    <span className="pill">上層來源：{analysisSourceModeLabel(project.top_analysis_source.mode)}</span>
                    <span className="pill">下層來源：{analysisSourceModeLabel(project.bottom_analysis_source.mode)}</span>
                    <span className={`pill ${analysisSourceTone(project.top_analysis_source.mode, topSourceCompletion)}`}>
                      上層資料：{topSourceCompletion}
                    </span>
                    <span className={`pill ${analysisSourceTone(project.bottom_analysis_source.mode, bottomSourceCompletion)}`}>
                      下層資料：{bottomSourceCompletion}
                    </span>
                  </div>
                  <p className="meta-line">{analysisWorkflowHint(analysisWorkflowMode, displayedSingleSide)}</p>
                </div>
              </Panel>

            <div className="panel-stack">
              {(analysisWorkflowMode === "single_manual" || analysisWorkflowMode === "single_import") &&
                renderAnalysisSourceCard(displayedSingleSide, {
                  title: `${sidePrefixLabel(displayedSingleSide)}支撐資料`,
                  subtitle:
                    analysisWorkflowMode === "single_import"
                      ? `本次先整理${sidePrefixLabel(displayedSingleSide)}分析成果，使用整頁版面檢查匯入事件、候選列與支撐草稿。`
                      : `本次只整理${sidePrefixLabel(displayedSingleSide)}手動輸入資料，支數、軸力、溫度力與型號可在同一張表內完成。`,
                })}
              {analysisWorkflowMode === "dual_manual" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "上層手動輸入",
                    subtitle: "完整寬度輸入上層支撐資料，再往下續填下層，不再使用左右窄欄位。",
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "下層手動輸入",
                    subtitle: "雙層手動模式會保留完整寬度，方便對照上層與下層差異。",
                  })}
                </>
              )}
              {analysisWorkflowMode === "dual_import" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "第一步：上層檔案",
                    subtitle: "先匯入上層分析成果，再微調事件分類與候選列。",
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "第二步：下層檔案",
                    subtitle: "下層資料完成後，可再一起前往支撐頁選型號與補幾何。",
                  })}
                </>
              )}
              {analysisWorkflowMode === "mixed" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "上層來源",
                    subtitle: "進階混合模式可讓上層獨立選擇匯入、手動或暫不使用。",
                    showModeSelector: true,
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "下層來源",
                    subtitle: "進階混合模式可讓下層獨立選擇匯入、手動或暫不使用。",
                    showModeSelector: true,
                  })}
                </>
              )}
            </div>

            <Panel title="牆體與土層摘要" subtitle="牆體、開挖深度、水位與土層資料會彙整在此，若辨識不完整可到下一步手動修正。">
              <div className="meta-grid">
                <MetaItem label="匯入來源摘要" value={project.analysis_import.source_name || "人工 / 尚未匯入"} />
                <MetaItem label="來源格式" value={project.analysis_import.source_type || "—"} />
                <MetaItem label="標題" value={project.analysis_import.project_title || "—"} />
                <MetaItem label="開挖深度" value={fmt(project.analysis_import.excavation_depth_m, "m")} />
                <MetaItem label="地下水位" value={fmt(project.analysis_import.ground_water_level_m, "m")} />
                <MetaItem label="牆體 EI" value={fmt(project.analysis_import.wall_ei_tf_m2_per_m)} />
                <MetaItem label="土層筆數" value={String(project.analysis_import.soils.length)} />
                <MetaItem label="施工階段數" value={String(project.analysis_import.stages.length)} />
              </div>
              {project.analysis_import.warnings.length > 0 && (
                <ul className="warning-list">
                  {project.analysis_import.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {project.analysis_import.stages.length > 0 && (
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>開挖深度 (m)</th>
                      <th>水位 (m)</th>
                      <th>支撐數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.analysis_import.stages.map((stage) => (
                      <tr key={stage.index}>
                        <td>{stage.label}</td>
                        <td>{fmt(stage.excavation_depth_m)}</td>
                        <td>{fmt(stage.water_level_m)}</td>
                        <td>{stage.struts.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_PROJECT && (
          <section className="panel-grid">
            <Panel title="基本材料與牆體參數" subtitle="可依專案需求調整。">
              <div className="form-grid">
                <NumberField label="E (tf/cm2)" value={project.basic_parameters.e_tf_per_cm2} onChange={(v) => updateBasic("e_tf_per_cm2", v)} />
                <NumberField label="Fy (tf/cm2)" value={project.basic_parameters.fy_tf_per_cm2} onChange={(v) => updateBasic("fy_tf_per_cm2", v)} />
                <NumberField label="Cm" value={project.basic_parameters.cm_factor} onChange={(v) => updateBasic("cm_factor", v)} />
                <NumberField label="積載重 WL (tf/m)" value={project.basic_parameters.surcharge_wl_tf_per_m} onChange={(v) => updateBasic("surcharge_wl_tf_per_m", v)} />
                <SelectField label="壁體型式" value={project.basic_parameters.wall_type} options={wallTypeOptions} onChange={(v) => updateBasic("wall_type", v)} />
                {showConcreteWallFields && (
                  <>
                    <NumberField
                      label="壁厚 (cm)"
                      value={project.basic_parameters.wall_thickness_cm}
                      onChange={(v) => updateBasic("wall_thickness_cm", v)}
                    />
                    <NumberField
                      label="混凝土強度 Fc' (kg/cm2)"
                      value={project.basic_parameters.wall_fc_kg_per_cm2}
                      onChange={(v) => updateBasic("wall_fc_kg_per_cm2", v)}
                    />
                  </>
                )}
              </div>
              <div className="advanced-settings-shell">
                <button
                  className="advanced-settings-toggle"
                  type="button"
                  aria-expanded={advancedSettingsExpanded}
                  onClick={() => setAdvancedSettingsExpanded((expanded) => !expanded)}
                >
                  <span>
                    <strong>進階設定</strong>
                    <small>{advancedSettingsSummary}</small>
                  </span>
                  <em>{advancedSettingsExpanded ? "收合" : "展開"}</em>
                </button>
                {advancedSettingsExpanded && (
                  <div className="form-grid advanced-settings-grid">
                    <NumberField label="αs（支撐）" value={project.basic_parameters.alpha_support} onChange={(v) => updateBasic("alpha_support", v)} />
                    <NumberField label="αw（橫擋）" value={project.basic_parameters.alpha_wale} onChange={(v) => updateBasic("alpha_wale", v)} />
                    <NumberField label="αb（斜撐）" value={project.basic_parameters.alpha_brace} onChange={(v) => updateBasic("alpha_brace", v)} />
                    <NumberField label="α角（大角撐）" value={project.basic_parameters.alpha_corner_brace} onChange={(v) => updateBasic("alpha_corner_brace", v)} />
                    <NumberField label="αp（柱）" value={project.basic_parameters.alpha_column} onChange={(v) => updateBasic("alpha_column", v)} />
                    <NumberField label="ψ（材料係數）" value={project.basic_parameters.psi_material} onChange={(v) => updateBasic("psi_material", v)} />
                  </div>
                )}
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={project.calculation_options.consider_wall_deduction_for_wales}
                  onChange={(event) => updateCalculationOption("consider_wall_deduction_for_wales", event.target.checked)}
                />
                <span>橫擋考慮牆體扣底</span>
              </label>
              <p className="meta-line">勾選時會依 Excel 邏輯扣除牆體可提供的彎矩與剪力強度；取消勾選時則直接以橫擋自身需求檢核。</p>
              <div className="meta-grid">
                <MetaItem label="牆體彎矩 Mwc" value={fmt(waleWallDeduction.moment, "tf-m")} />
                <MetaItem label="牆體剪力 Vwc" value={fmt(waleWallDeduction.shear, "tf")} />
                <MetaItem
                  label="橫擋 ratio 規則"
                  value="取彎矩比與剪力比兩者較大值"
                />
              </div>
            </Panel>
            <Panel
              title="土層匯入與人工調整"
              subtitle="匯入無法辨識時可直接手動建立；深度改動後會自動回填厚度，並同步套用到柱構件貫入檢核。"
            >
              <div className="table-actions">
                <button className="secondary" onClick={addSoilRow}>
                  新增土層
                </button>
                <span className="meta-line">厚度會依本層深度減上一層深度自動計算，第 1 層厚度則等於本層深度。</span>
              </div>
              {editableSoils.length === 0 ? (
                <p className="empty-state">目前沒有土層資料，請先匯入分析檔或手動新增土層。</p>
              ) : (
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>土層名稱</th>
                      <th>厚度 (m)</th>
                      <th>深度 (m)</th>
                      <th>N 值</th>
                      <th>Su (t/m2)</th>
                      <th>單位重</th>
                      <th>phi (deg)</th>
                      <th>c (t/m2)</th>
                      <th>Kh (t/m3)</th>
                      <th>型態</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableSoils.map((soil, index) => (
                      <tr key={`${soil.index}-${soil.name}-${index}`}>
                        <td>{index + 1}</td>
                        <td>
                          <input
                            value={soil.name}
                            onChange={(event) => updateSoilRow(index, "name", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.thickness_m ?? ""}
                            readOnly
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.depth_m ?? ""}
                            onChange={(event) => updateSoilRow(index, "depth_m", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.n_value ?? ""}
                            onChange={(event) => updateSoilRow(index, "n_value", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.su_t_per_m2 ?? ""}
                            onChange={(event) => updateSoilRow(index, "su_t_per_m2", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.unit_weight_t_per_m3 ?? ""}
                            onChange={(event) =>
                              updateSoilRow(index, "unit_weight_t_per_m3", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.phi_deg ?? ""}
                            onChange={(event) => updateSoilRow(index, "phi_deg", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.cohesion_t_per_m2 ?? ""}
                            onChange={(event) =>
                              updateSoilRow(index, "cohesion_t_per_m2", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.kh_t_per_m3 ?? ""}
                            onChange={(event) => updateSoilRow(index, "kh_t_per_m3", event.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            value={soil.soil_type}
                            onChange={(event) => updateSoilRow(index, "soil_type", event.target.value)}
                          >
                            <option value="sand">砂土</option>
                            <option value="clay">黏土</option>
                            <option value="mixed">混合</option>
                          </select>
                        </td>
                        <td>
                          <button className="ghost" onClick={() => removeSoilRow(index)}>
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_COMPONENTS && (
          <section className="panel-stack">
            <Panel
              title="構件輸入"
              subtitle="改以頁籤切換支撐、橫擋、斜撐與大角撐，降低頁面長度；各頁籤會同步顯示填表狀態。"
            >
              <div className="meta-grid">
                <MetaItem
                  label="支撐模式"
                  value={supportModeLabel(project.calculation_options)}
                />
                <MetaItem
                  label="上層支撐"
                  value={project.calculation_options.include_top_supports ? "考慮" : "不考慮"}
                />
                <MetaItem
                  label="下層支撐"
                  value={project.calculation_options.include_bottom_supports ? "考慮" : "不考慮"}
                />
              </div>
              <div className="component-tab-bar" role="tablist" aria-label="構件輸入頁籤">
                {componentTabItems.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={componentTab === tab.key}
                    className={`component-tab-button ${componentTab === tab.key ? "active" : ""} ${tab.tone}`}
                    onClick={() => setComponentTab(tab.key)}
                  >
                    <strong>{tab.label}</strong>
                    <span>{tab.note}</span>
                  </button>
                ))}
              </div>
            </Panel>
            {componentTab === "support" && (
              <section className="panel-stack-tight">
                <Panel title="支撐局部捷徑" subtitle="雙向支撐時可直接在上、下層支撐間切換；未納入的一側會以精簡卡片顯示。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_supports ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-supports-panel")}
                    >
                      {moduleShortcutLabel("上層支撐", project.calculation_options.include_top_supports, project.top_supports.length, rowCompletionSummary(project.top_supports, isSupportRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_supports ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-supports-panel")}
                    >
                      {moduleShortcutLabel("下層支撐", project.calculation_options.include_bottom_supports, project.bottom_supports.length, rowCompletionSummary(project.bottom_supports, isSupportRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-supports-panel" className={panelFocusClass(highlightPanelId, "top-supports-panel")}>
                  {project.calculation_options.include_top_supports ? (
                    <EditableSupportTable
                      title={editingModuleTitle("top", "水平支撐", project.calculation_options.include_top_supports, project.calculation_options.include_bottom_supports)}
                      subtitle="支撐為必算項目；至少需納入上層或下層其中一側。"
                      enabled={project.calculation_options.include_top_supports}
                      useDefaultTempForce={project.calculation_options.auto_temp_force_top_supports}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_supports", enabled)}
                      onToggleDefaultTempForce={(enabled) => updateCalculationOption("auto_temp_force_top_supports", enabled)}
                      rows={project.top_supports}
                      onAdd={() => addSupportRow("top_supports")}
                      onRemove={(index) => removeRow("top_supports", index)}
                      onChange={(index, field, value) => updateArrayRow<SupportRow>("top_supports", index, field, value)}
                      onUpdateAnalysisMapping={(index, patch) => updateAnalysisMapping("top_supports", index, patch)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_supports", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層水平支撐"
                      description="目前未納入上層支撐檢討；如本案需要雙向支撐或上層控制，可在此直接啟用。"
                      onEnable={() => updateCalculationOption("include_top_supports", true)}
                    />
                  )}
                </div>
                <div id="bottom-supports-panel" className={panelFocusClass(highlightPanelId, "bottom-supports-panel")}>
                  {project.calculation_options.include_bottom_supports ? (
                    <EditableSupportTable
                      title={editingModuleTitle("bottom", "水平支撐", project.calculation_options.include_top_supports, project.calculation_options.include_bottom_supports)}
                      subtitle="若同時納入上下層，即視為雙向支撐模式。"
                      enabled={project.calculation_options.include_bottom_supports}
                      useDefaultTempForce={project.calculation_options.auto_temp_force_bottom_supports}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_supports", enabled)}
                      onToggleDefaultTempForce={(enabled) => updateCalculationOption("auto_temp_force_bottom_supports", enabled)}
                      rows={project.bottom_supports}
                      onAdd={() => addSupportRow("bottom_supports")}
                      onRemove={(index) => removeRow("bottom_supports", index)}
                      onChange={(index, field, value) => updateArrayRow<SupportRow>("bottom_supports", index, field, value)}
                      onUpdateAnalysisMapping={(index, patch) => updateAnalysisMapping("bottom_supports", index, patch)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_supports", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層水平支撐"
                      description="目前未納入下層支撐檢討；若本案為雙向支撐，可在此快速啟用下層資料。"
                      onEnable={() => updateCalculationOption("include_bottom_supports", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "wale" && (
              <section className="panel-stack-tight">
                <Panel title="橫擋局部捷徑" subtitle="可快速在上、下層橫擋間切換；不考慮的一側會改成精簡提示。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_wales ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-wales-panel")}
                    >
                      {moduleShortcutLabel("上層橫擋", project.calculation_options.include_top_wales, project.top_wales.length, rowCompletionSummary(project.top_wales, isWaleRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_wales ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-wales-panel")}
                    >
                      {moduleShortcutLabel("下層橫擋", project.calculation_options.include_bottom_wales, project.bottom_wales.length, rowCompletionSummary(project.bottom_wales, isWaleRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-wales-panel" className={panelFocusClass(highlightPanelId, "top-wales-panel")}>
                  {project.calculation_options.include_top_wales ? (
                    <EditableWaleTable
                      title={editingModuleTitle("top", "橫擋", project.calculation_options.include_top_wales, project.calculation_options.include_bottom_wales)}
                      enabled={project.calculation_options.include_top_wales}
                      minimumRows={minimumDependentRows(project, "top_wales")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_wales", enabled)}
                      rows={project.top_wales}
                      onAdd={() => addWaleRow("top_wales")}
                      onRemove={(index) => removeRow("top_wales", index)}
                      onChange={(index, field, value) => updateArrayRow<WaleRow>("top_wales", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_wales", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層橫擋"
                      description="此側目前不納入橫擋檢討；若需比對牆體扣底與跨度控制，可在此直接啟用。"
                      onEnable={() => updateCalculationOption("include_top_wales", true)}
                    />
                  )}
                </div>
                <div id="bottom-wales-panel" className={panelFocusClass(highlightPanelId, "bottom-wales-panel")}>
                  {project.calculation_options.include_bottom_wales ? (
                    <EditableWaleTable
                      title={editingModuleTitle("bottom", "橫擋", project.calculation_options.include_top_wales, project.calculation_options.include_bottom_wales)}
                      enabled={project.calculation_options.include_bottom_wales}
                      minimumRows={minimumDependentRows(project, "bottom_wales")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_wales", enabled)}
                      rows={project.bottom_wales}
                      onAdd={() => addWaleRow("bottom_wales")}
                      onRemove={(index) => removeRow("bottom_wales", index)}
                      onChange={(index, field, value) => updateArrayRow<WaleRow>("bottom_wales", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_wales", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層橫擋"
                      description="此側目前不納入橫擋檢討；若需檢視下層跨度與型號，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_bottom_wales", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "brace" && (
              <section className="panel-stack-tight">
                <Panel title="斜撐局部捷徑" subtitle="可快速切換上、下層斜撐；不考慮的一側僅保留精簡啟用卡片。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-braces-panel")}
                    >
                      {moduleShortcutLabel("上層斜撐", project.calculation_options.include_top_braces, project.top_braces.length, rowCompletionSummary(project.top_braces, isBraceRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-braces-panel")}
                    >
                      {moduleShortcutLabel("下層斜撐", project.calculation_options.include_bottom_braces, project.bottom_braces.length, rowCompletionSummary(project.bottom_braces, isBraceRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-braces-panel" className={panelFocusClass(highlightPanelId, "top-braces-panel")}>
                  {project.calculation_options.include_top_braces ? (
                    <EditableBraceTable
                      title={editingModuleTitle("top", "斜撐", project.calculation_options.include_top_braces, project.calculation_options.include_bottom_braces)}
                      enabled={project.calculation_options.include_top_braces}
                      minimumRows={minimumDependentRows(project, "top_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_braces", enabled)}
                      rows={project.top_braces}
                      onAdd={() => addBraceRow("top_braces")}
                      onRemove={(index) => removeRow("top_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<BraceRow>("top_braces", index, field, value)}
                      onUpdateAnalysisMapping={(index, patch) => updateAnalysisMapping("top_braces", index, patch)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層斜撐"
                      description="目前未納入上層斜撐檢討；若本案需檢核 L1、L2 與斜撐型號，可在此啟用。"
                      onEnable={() => updateCalculationOption("include_top_braces", true)}
                    />
                  )}
                </div>
                <div id="bottom-braces-panel" className={panelFocusClass(highlightPanelId, "bottom-braces-panel")}>
                  {project.calculation_options.include_bottom_braces ? (
                    <EditableBraceTable
                      title={editingModuleTitle("bottom", "斜撐", project.calculation_options.include_top_braces, project.calculation_options.include_bottom_braces)}
                      enabled={project.calculation_options.include_bottom_braces}
                      minimumRows={minimumDependentRows(project, "bottom_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_braces", enabled)}
                      rows={project.bottom_braces}
                      onAdd={() => addBraceRow("bottom_braces")}
                      onRemove={(index) => removeRow("bottom_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<BraceRow>("bottom_braces", index, field, value)}
                      onUpdateAnalysisMapping={(index, patch) => updateAnalysisMapping("bottom_braces", index, patch)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層斜撐"
                      description="目前未納入下層斜撐檢討；若後續要補下層斜撐幾何，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_bottom_braces", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "corner" && (
              <section className="panel-stack-tight">
                <Panel title="大角撐捷徑" subtitle="大角撐通常僅在需要時檢討；未啟用時改以精簡卡片呈現。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_corner_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "corner-braces-panel")}
                    >
                      {moduleShortcutLabel("大角撐", project.calculation_options.include_corner_braces, project.corner_braces.length, rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="corner-braces-panel" className={panelFocusClass(highlightPanelId, "corner-braces-panel")}>
                  {project.calculation_options.include_corner_braces ? (
                    <EditableCornerBraceTable
                      title="大角撐"
                      enabled={project.calculation_options.include_corner_braces}
                      minimumRows={minimumDependentRows(project, "corner_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_corner_braces", enabled)}
                      rows={project.corner_braces}
                      onAdd={addCornerBraceRow}
                      onRemove={(index) => removeRow("corner_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<CornerBraceRow>("corner_braces", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("corner_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="大角撐"
                      description="目前未納入大角撐檢討；若本案需比對角隅構件軸力與型號，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_corner_braces", true)}
                    />
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {activeStep === STEP_COLUMNS && (
          <section id="column-settings-panel" className={`panel-stack ${panelFocusClass(highlightPanelId, "column-settings-panel")}`}>
            <Panel title="柱構件情境管理" subtitle="可依本案需求新增中間柱或共構柱情境，並於後續逐一納入或排除檢討。">
              <div className="action-row">
                <button className="secondary" type="button" onClick={() => addColumnScenario("middle")}>
                  新增中間柱
                </button>
                <button className="secondary" type="button" onClick={() => addColumnScenario("composite_normal")}>
                  新增共構柱（一般）
                </button>
                <button className="secondary" type="button" onClick={() => addColumnScenario("composite_crane")}>
                  新增共構柱（大吊車）
                </button>
              </div>
              <p className="meta-line">基礎形式與斷面形狀已改為固定選單，避免自由輸入造成係數或形狀判讀錯誤。</p>
            </Panel>
            {project.columns.length > 1 && (
              <Panel title="柱構件捷徑" subtitle="快速定位到各柱構件情境，適合有多組中間柱或共構柱時使用。">
                <div className="pill-row">
                  {project.columns.map((column, index) => (
                    <button
                      key={`${column.variant}-${index}-jump`}
                      className={`action-pill ${column.enabled ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COLUMNS, `column-panel-${index}`)}
                    >
                      {moduleShortcutLabel(
                        column.title || columnVariantLabel(column.variant),
                        column.enabled,
                        1,
                        columnCompletionSummary(column),
                      )}
                    </button>
                  ))}
                </div>
              </Panel>
            )}
            {project.columns.map((column, index) => (
              <div id={`column-panel-${index}`} key={`${column.variant}-${index}`} className={panelFocusClass(highlightPanelId, `column-panel-${index}`)}>
                {(() => {
                  const selectedSection = sectionCatalog.find((section) => section.name === column.column_section_name) ?? null;
                  return (
                <Panel
                  title={column.title || columnVariantLabel(column.variant)}
                  subtitle="用核取方塊決定是否納入檢討；未勾選者不參與計算、摘要與報表。"
                >
                  <div className="table-actions">
                    <label className="field-block inline-field">
                      <span>情境類型</span>
                      <select
                        value={column.variant}
                        onChange={(event) => updateColumnVariant(index, event.target.value as ColumnScenarioInput["variant"])}
                      >
                        {columnVariantOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="ghost" type="button" onClick={() => removeColumnScenario(index)}>
                      刪除此情境
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field
                      label="情境名稱"
                      value={column.title}
                      onChange={(value) => updateColumn(index, "title", value)}
                    />
                  </div>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={column.enabled}
                      onChange={(event) => updateColumnEnabled(index, event.target.checked)}
                    />
                    <span>納入檢討</span>
                  </label>
                  {!column.enabled && (
                    <CollapsedModuleHint text="此柱構件情境目前未納入檢討；若本案需要檢算，勾選後即可展開完整柱構件參數。" />
                  )}
                  <fieldset className="fieldset-reset" disabled={!column.enabled}>
                    {column.enabled && (
                    <>
                    <div className="form-grid">
                      <label className="field-block">
                        <span>柱型鋼</span>
                        <SectionSelectInput
                          value={column.column_section_name}
                          options={sectionOptions}
                          placeholder="請選擇柱型鋼"
                          onChange={(value) => updateColumn(index, "column_section_name", value)}
                        />
                      </label>
                      <SelectField
                        label="基礎形式"
                        value={column.foundation_type}
                        options={foundationTypeOptions}
                        onChange={(value) => updateColumn(index, "foundation_type", value)}
                      />
                      <SelectField
                        label="斷面形狀"
                        value={column.foundation_shape}
                        options={foundationShapeOptions}
                        onChange={(value) => updateColumn(index, "foundation_shape", value)}
                      />
                      <NumberField
                        label="斷面尺寸 X (m)"
                        value={column.foundation_size_x_m}
                        onChange={(value) => updateColumn(index, "foundation_size_x_m", value)}
                      />
                      <NumberField
                        label="斷面尺寸 Y (m)"
                        value={column.foundation_size_y_m}
                        onChange={(value) => updateColumn(index, "foundation_size_y_m", value)}
                      />
                      <NumberField
                        label="柱長 L (m)"
                        value={column.column_length_m}
                        onChange={(value) => updateColumn(index, "column_length_m", value)}
                      />
                      <NumberField
                        label="地盤反力係數 kh (kg/cm3)"
                        value={column.kh_kg_per_cm3}
                        onChange={(value) => updateColumn(index, "kh_kg_per_cm3", value)}
                      />
                      <OptionalNumberField
                        label="樁寬 b (cm)"
                        value={column.pile_width_cm}
                        placeholder={`系統預設 ${fmt(selectedSection?.flange_width_cm ?? null, "cm")}`}
                        onChange={(value) => updateColumn(index, "pile_width_cm", value)}
                      />
                      <OptionalNumberField
                        label="偏心 ex (m)"
                        value={column.eccentricity_x_m}
                        placeholder={`系統預設 ${fmt(defaultColumnEccentricityX(column, selectedSection), "m")}`}
                        onChange={(value) => updateColumn(index, "eccentricity_x_m", value)}
                      />
                      <NumberField
                        label="偏心 ey (m)"
                        value={column.eccentricity_y_m}
                        onChange={(value) => updateColumn(index, "eccentricity_y_m", value)}
                      />
                      <NumberField
                        label="開挖面距最下支撐 (m)"
                        value={column.bottom_to_excavation_distance_m}
                        onChange={(value) => updateColumn(index, "bottom_to_excavation_distance_m", value)}
                      />
                      <NumberField
                        label="貫入深度 (cm)"
                        value={column.embedment_length_cm}
                        onChange={(value) => updateColumn(index, "embedment_length_cm", value)}
                      />
                      <NumberField
                        label="混凝土強度 fc' (kg/cm2)"
                        value={column.concrete_strength_kg_per_cm2}
                        onChange={(value) => updateColumn(index, "concrete_strength_kg_per_cm2", value)}
                      />
                      <NumberField
                        label="壓力 FS（樁）"
                        value={column.compression_fs}
                        onChange={(value) => updateColumn(index, "compression_fs", value)}
                      />
                      <NumberField
                        label="拔力 FS（樁）"
                        value={column.tension_fs}
                        onChange={(value) => updateColumn(index, "tension_fs", value)}
                      />
                      <NumberField
                        label="樁單位重 (tf/m3)"
                        value={column.pile_unit_weight_t_per_m3}
                        onChange={(value) => updateColumn(index, "pile_unit_weight_t_per_m3", value)}
                      />
                    </div>
                    {column.variant !== "middle" && (
                      <div className="info-card construction-stage-handoff-card">
                        <p className="info-title">施工構台荷重交接與階段包絡</p>
                        <p className="info-body">
                          每份交接檔只套用到本共構柱（{column.title}，識別碼 {column.column_id}）。同一來源分配至多根啟用柱位時，各柱比例合計必須為 100%，且每柱均須填寫分配依據；本柱 Np 以來源控制軸力乘分配比例採用。覆工板來源不會自行判定開挖柱座標方向，如需考慮傳力偏心，請逐階段明確採用附加 X／Y 偏心。後端會計算 ΔMx = Np·Δex、ΔMy = Np·Δey，連同無構台荷重基準案逐案包絡。
                        </p>
                        <div className="upload-row">
                          <label className="file-action secondary">
                            新增覆工板施工階段
                            <input
                              className="file-picker-input"
                              type="file"
                              accept=".json,application/json"
                              onChange={(event) => importConstructionStageHandoff(index, event)}
                            />
                          </label>
                        </div>
                        {(column.construction_stage_loads ?? []).length === 0 ? (
                          <p className="meta-line">尚未加入覆工板施工階段；計算時仍保留無構台荷重基準案。</p>
                        ) : (
                          <div className="construction-stage-list">
                            {(column.construction_stage_loads ?? []).map((stage, stageIndex) => {
                              const distribution = constructionStageDistributionSummary(project, stage.source.handoff_fingerprint);
                              const distributionIsComplete = Math.abs(distribution.total - 1) <= 1e-6;
                              return (
                              <div className="construction-stage-item" key={stage.stage_id}>
                                <div className="construction-stage-item-head">
                                  <label>
                                    <span>施工階段名稱</span>
                                    <input
                                      value={stage.stage_label}
                                      maxLength={80}
                                      onChange={(event) => updateConstructionStageLabel(index, stageIndex, event.target.value)}
                                    />
                                  </label>
                                  <button className="ghost" type="button" onClick={() => removeConstructionStageHandoff(index, stage.stage_id)}>
                                    移除此階段
                                  </button>
                                </div>
                                <div className="meta-grid">
                                  <MetaItem label="來源控制軸力" value={`${fmt(stage.load_t)} tf`} />
                                  <MetaItem label="本柱採用軸力 Np" value={`${fmt(stage.load_t * (stage.distribution_factor ?? 1))} tf`} />
                                  <MetaItem label="來源工具" value={`${stage.source.source_tool} ${stage.source.source_version}`.trim()} />
                                  <MetaItem label="來源計算指紋" value={stage.source.source_calculation_fingerprint} />
                                  <MetaItem label="交接指紋" value={stage.source.handoff_fingerprint} />
                                </div>
                                <div className="construction-stage-distribution-grid">
                                  <label className="field-block">
                                    <span>本柱反力分配比例 (%)</span>
                                    <input
                                      type="number"
                                      min="0.000001"
                                      max="100"
                                      step="any"
                                      value={(stage.distribution_factor ?? 1) * 100}
                                      onChange={(event) => updateConstructionStageAdoption(index, stageIndex, {
                                        distribution_factor: Number(event.target.value) / 100,
                                      })}
                                    />
                                  </label>
                                  <label className="field-block">
                                    <span>反力分配依據{distribution.count > 1 ? "（必填）" : "（單柱可留空）"}</span>
                                    <input
                                      value={stage.distribution_basis ?? ""}
                                      maxLength={120}
                                      placeholder="例如：構台反力分配圖 S-05、依支承剛度分配"
                                      onChange={(event) => updateConstructionStageAdoption(index, stageIndex, {
                                        distribution_basis: event.target.value,
                                      })}
                                    />
                                  </label>
                                </div>
                                <p className={`meta-line ${distributionIsComplete ? "" : "attention-line"}`}>
                                  同一交接來源目前分配至 {distribution.count} 個啟用柱位，合計 {fmt(distribution.total * 100)}%；計算前必須等於 100%。
                                </p>
                                <label className="check-field construction-stage-transfer-toggle">
                                  <input
                                    type="checkbox"
                                    checked={stage.apply_transfer_eccentricity ?? false}
                                    onChange={(event) => updateConstructionStageAdoption(index, stageIndex, {
                                      apply_transfer_eccentricity: event.target.checked,
                                    })}
                                  />
                                  <span>明確採用本階段附加傳力偏心</span>
                                </label>
                                {stage.apply_transfer_eccentricity && (
                                  <div className="construction-stage-transfer-grid">
                                    <NumberField
                                      label="附加偏心 Δex (m，具正負號)"
                                      value={stage.transfer_eccentricity_x_m ?? 0}
                                      onChange={(value) => updateConstructionStageAdoption(index, stageIndex, {
                                        transfer_eccentricity_x_m: Number(value),
                                      })}
                                    />
                                    <NumberField
                                      label="附加偏心 Δey (m，具正負號)"
                                      value={stage.transfer_eccentricity_y_m ?? 0}
                                      onChange={(value) => updateConstructionStageAdoption(index, stageIndex, {
                                        transfer_eccentricity_y_m: Number(value),
                                      })}
                                    />
                                    <label className="field-block construction-stage-transfer-basis">
                                      <span>偏心採用依據（必填）</span>
                                      <input
                                        value={stage.transfer_basis ?? ""}
                                        maxLength={120}
                                        placeholder="例如：施工配置圖 A-03、設計者採用"
                                        onChange={(event) => updateConstructionStageAdoption(index, stageIndex, {
                                          transfer_basis: event.target.value,
                                        })}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    </>
                    )}
                  </fieldset>
                  <p className="meta-line">
                    目前支撐列數：{columnSupportCount}，土層列數：{column.soil_layers.length}
                  </p>
                  {column.enabled && column.eccentricity_x_m === null && (
                    <p className="meta-line">偏心 ex 未指定時，系統將依柱型鋼深度自動取值，目前預設為 {fmt(defaultColumnEccentricityX(column, selectedSection), "m")}。</p>
                  )}
                  {column.enabled && (
                    <p className={`meta-line ${columnCompletionSummary(column).startsWith("待補") ? "attention-line" : ""}`}>
                      填表狀態：{columnCompletionSummary(column)}
                    </p>
                  )}
                </Panel>
                  );
                })()}
              </div>
            ))}
          </section>
        )}

        {activeStep === STEP_RESULTS && (
          <section className="panel-stack">
            <div className={`recalc-banner ${project.calculation_results ? calculationFreshness.tone : "warn"}`}>
              <div className="recalc-banner-copy">
                <strong>{project.calculation_results ? calculationFreshness.text : "資料已變更，請重新計算"}</strong>
                <span>
                  {project.calculation_results
                    ? calculationFreshness.detail
                    : "目前頁面中的輸入已更新，但檢核結果尚未同步；請先重新計算後再確認控制層與報表。"}
                </span>
              </div>
              <button className="primary" type="button" onClick={handleCalculate}>
                {project.calculation_results ? "重新計算" : "開始計算"}
              </button>
            </div>
            <div className="result-overview-grid">
              <div className="result-overview-card ok">
                <span>通過項目</span>
                <strong>{statusCounts.ok}</strong>
                <p>已完成檢核且結果通過。</p>
              </div>
              <div className="result-overview-card warn">
                <span>注意項目</span>
                <strong>{statusCounts.warn}</strong>
                <p>接近控制值或需工程師留意。</p>
              </div>
              <div className="result-overview-card ng">
                <span>不合格項目</span>
                <strong>{statusCounts.ng}</strong>
                <p>建議優先回到對應構件檢查。</p>
              </div>
              <div className="result-overview-card focus">
                <span>最不利比值</span>
                <strong>{fmtRatio(resultOverview.worstRatio)}</strong>
                <p>{`本次共 ${resultOverview.total} 筆檢核，另有 ${resultOverview.warnings} 則系統警示。`}</p>
              </div>
            </div>
            <Panel
              title="分層檢核摘要"
              subtitle={
                enabledSummaryLabels.length > 0
                  ? `僅顯示本案已納入之${enabledSummaryLabels.join("、")}，並標註採用型號，方便直接比對每層的 OK / NG 與設計斷面。`
                  : "同一層構件合併顯示，並標註採用型號，方便直接比對每層的 OK / NG 與設計斷面。"
              }
            >
              {project.calculation_results ? (
                <LevelSummaryTable rows={project.calculation_results.summary} options={project.calculation_options} />
              ) : (
                <p className="empty-state">尚未產生檢核結果。請先點選本頁上方「開始計算」。</p>
              )}
            </Panel>
            <section className="panel-grid">
              <Panel title="柱構件摘要" subtitle="獨立整理柱構件結果，避免和分層支撐混在一起。">
                {project.calculation_results && project.calculation_results.column_checks.length > 0 ? (
                  <ColumnSummaryTable rows={project.calculation_results.column_checks} onLocate={() => jumpToStep(STEP_COLUMNS)} />
                ) : (
                  <p className="empty-state">本案目前未勾選中間柱 / 共構柱檢討。</p>
                )}
              </Panel>
              <Panel title="重點控制項目" subtitle="優先列出 NG / Say~OK；可直接定位回需要修正的設定頁。">
                {project.calculation_results ? (
                  <KeyControlTable
                    rows={flattenChecks(project.calculation_results)}
                    options={project.calculation_options}
                    onLocate={jumpToStep}
                  />
                ) : (
                  <p className="empty-state">尚未產生檢核結果。</p>
                )}
              </Panel>
            </section>
          </section>
        )}

        {activeStep === STEP_REPORT && (
          <section className="panel-grid">
            <Panel title="報表匯出" subtitle="PDF 與 Word 均可輸出內部審閱或核可後正式附件；文件身分不影響列印。">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={conciseReportMode}
                  onChange={(event) => setReportMode(event.target.checked)}
                />
                <span>簡述版：各節首筆詳算，其餘以關鍵值摘要列示</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={reportApproved}
                  onChange={(event) => setReportApproval(event.target.checked)}
                />
                <span>核可為正式附件；未勾選時為可列印的內部審閱文件</span>
              </label>
              <div className="report-mode-card">
                <strong>{`目前準備輸出：${reportModeLabel}／${reportDocumentStatusLabel}`}</strong>
                <span>切換附件編排或核可狀態後，系統會清除上一版下載連結；工程名稱、設計人員留空可由主文承接，不會因此判為不合格附件。</span>
              </div>
              <div className="action-row">
                <button className="primary" onClick={handleGenerateReport} disabled={!project.calculation_results}>
                  {`產出 PDF（${reportModeLabel}／${reportDocumentStatusLabel}）`}
                </button>
                <button className="secondary" onClick={handleGenerateWordReport} disabled={!project.calculation_results}>
                  {`產出 Word（${reportModeLabel}／${reportDocumentStatusLabel}）`}
                </button>
              </div>
               {!project.calculation_results && (
                <p className="meta-line attention-line">目前尚無最新檢核結果，請先重新計算後再產出報表。</p>
              )}
              {(reportUrl || wordReportUrl) && (
                <div className="generated-report-list">
                  {reportUrl && (
                    <a className="generated-report-link" href={reportUrl} target="_blank" rel="noreferrer">
                      <strong>{`本次 PDF／${generatedPdfDocumentStatus === "formal-attachment" ? "正式附件" : "內部審閱"}`}</strong>
                      <span>{generatedPdfMode === "concise" ? "簡述版" : "詳細版"}</span>
                      <em>{extractDownloadFilename(reportUrl)}</em>
                    </a>
                  )}
                  {pdfSourceBundleUrl && (
                    <a className="generated-report-link" href={pdfSourceBundleUrl} target="_blank" rel="noreferrer" download>
                      <strong>下載 PDF＋證據組包來源套件</strong>
                      <span>單一 ZIP 搬運；可直接交給正式附件包管理器</span>
                      <em>{extractDownloadFilename(pdfSourceBundleUrl)}</em>
                    </a>
                  )}
                  {pdfEvidenceUrl && (
                    <a className="generated-report-link" href={pdfEvidenceUrl} target="_blank" rel="noreferrer" download>
                      <strong>本次 PDF／正式組包可見性證據</strong>
                      <span>個別證據備用下載；一般情況直接使用上方來源套件</span>
                      <em>{extractDownloadFilename(pdfEvidenceUrl)}</em>
                    </a>
                  )}
                  {wordReportUrl && (
                    <a className="generated-report-link" href={wordReportUrl} target="_blank" rel="noreferrer">
                      <strong>{`本次 Word／${generatedWordDocumentStatus === "formal-attachment" ? "正式附件" : "內部審閱"}`}</strong>
                      <span>{generatedWordMode === "concise" ? "簡述版" : "詳細版"}</span>
                      <em>{extractDownloadFilename(wordReportUrl)}</em>
                    </a>
                  )}
                </div>
              )}
              <p className="meta-line">
                {`目前附件編排方式為${reportModeLabel}，文件身分為${reportDocumentStatusLabel}。Word 與 PDF 皆包含摘要、輸入基本資料、分析匯入結果、結果彙整與主要檢核內容；核可 PDF 會逐頁建立像素、OCR 與文字層對齊證據，並提供只含該 PDF 與證據的單一來源套件，可直接交給正式附件包管理器安全讀取及組包。`}
              </p>
            </Panel>
            <Panel
              title="拆撐承接構造驗證交接"
              subtitle="將已確認的拆撐處置輸出成具指紋的待驗證 JSON；接收單位可在回簽助手完成逐列檢核結果。"
            >
              <div className="report-mode-card">
                <strong>{`目前可交接：${removalTransferCandidateCount(project)} 筆拆撐處置`}</strong>
                <span>交接檔只保存來源構件、生命週期、控制軸力與指定承接對象；所有列初始狀態均為待承接構造驗證。</span>
              </div>
              <div className="action-row">
                <button
                  className="secondary"
                  type="button"
                  onClick={handleGenerateRemovalTransferHandoff}
                  disabled={!project.calculation_results || removalTransferCandidateCount(project) === 0}
                >
                  匯出待驗證交接 JSON
                </button>
                <label className={`file-action secondary${activeRemovalTransferHandoff ? "" : " disabled"}`}>
                  匯入承接構造回簽 JSON
                  <input
                    className="file-picker-input"
                    type="file"
                    accept=".json,application/json"
                    disabled={!activeRemovalTransferHandoff}
                    onChange={handleImportRemovalTransferReceipt}
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => openReceiverAssistant(activeRemovalTransferHandoff)}
                >
                  開啟接收端回簽助手
                </button>
              </div>
              {!project.calculation_results && (
                <p className="meta-line attention-line">請先完成最新計算，再建立與該計算指紋一致的交接檔。</p>
              )}
              {project.calculation_results && removalTransferCandidateCount(project) === 0 && (
                <p className="meta-line">目前沒有已確認拆撐處置且納入計算的支撐／斜撐列。</p>
              )}
              {activeRemovalTransferHandoff && (
                <div className="meta-grid">
                  <MetaItem
                    label="交接狀態"
                    value={activeRemovalTransferReceipt
                      ? activeRemovalTransferReceipt.summary.status === "passed"
                        ? sourceCapacityEvidenceRequired && !sourceCapacityEvidenceSatisfied
                          ? "接收端結果通過／證據檔待逐列比對"
                          : removalTransferIdentityVerification?.trusted
                            ? "接收端檢核通過／受信任簽章通過"
                            : removalTransferIdentityVerification?.status === "valid-signature-revoked-key"
                              ? "接收端檢核通過／簽章公鑰已撤銷"
                              : removalTransferIdentityVerification?.status === "valid-signature-organization-mismatch"
                                ? "接收端檢核通過／簽章單位不符"
                                : removalTransferIdentityVerification?.cryptographicValid
                                  ? "接收端檢核通過／簽章有效但公鑰待信任"
                                  : "接收端檢核通過／回簽人身分待核對"
                        : "接收端檢核未通過"
                      : "待承接構造驗證"}
                  />
                  <MetaItem label="交接列數" value={String(activeRemovalTransferHandoff.transfers.length)} />
                  <MetaItem label="來源計算指紋" value={activeRemovalTransferHandoff.source.calculationFingerprint} />
                  <MetaItem label="交接指紋" value={activeRemovalTransferHandoff.handoffFingerprint} />
                  {activeRemovalTransferReceipt && (
                    <>
                      <MetaItem label="回簽指紋" value={activeRemovalTransferReceipt.receiptFingerprint} />
                      <MetaItem
                        label="接收端結果"
                        value={`通過 ${activeRemovalTransferReceipt.summary.passed}／未通過 ${activeRemovalTransferReceipt.summary.failed}`}
                      />
                      <MetaItem
                        label="回簽單位／人員"
                        value={`${activeRemovalTransferReceipt.verificationAuthority.organization}／${activeRemovalTransferReceipt.verificationAuthority.verifierName}`}
                      />
                      <MetaItem
                        label="正式文件編號"
                        value={activeRemovalTransferReceipt.verificationAuthority.reportReference}
                      />
                      <MetaItem
                        label="來源端證據檔比對"
                        value={sourceCapacityEvidenceRequired
                          ? activeSourceEvidenceVerification && !sourceCapacityEvidenceHasMismatch
                            ? `已保存 SEV：${activeSourceEvidenceVerification.summary.matched}/${activeSourceEvidenceVerification.summary.required}`
                            : `已相符 ${activeReceiptEvidenceItems.filter((item) => sourceCapacityEvidenceMatches[sourceEvidenceMatchKey(item.result.transferId, item.evidenceKey)]?.matched).length}/${activeReceiptEvidenceItems.length}`
                          : "舊版 RVR 未提供逐列文件 SHA-256"}
                      />
                    </>
                  )}
                </div>
              )}
              {activeRemovalTransferReceipt && sourceCapacityEvidenceRequired && (
                <div className="receiver-result-list">
                  {activeReceiptEvidenceItems.map(({ result, evidenceKey, label, evidence }, index) => {
                    const match = sourceCapacityEvidenceMatches[sourceEvidenceMatchKey(result.transferId, evidenceKey)];
                    const transfer = activeRemovalTransferHandoff?.transfers.find(
                      (item) => item.transferId === result.transferId,
                    );
                    return (
                      <article className="receiver-result-card" key={`source-evidence-${result.transferId}-${evidenceKey}`}>
                        <header className="receiver-result-head">
                          <div>
                            <span>{`證據檔比對 ${index + 1}／${label}`}</span>
                            <strong>{transfer ? handoffSourceMemberLabel(transfer) : result.receiverTarget}</strong>
                          </div>
                          <code>{result.transferId}</code>
                        </header>
                        <div className="receiver-source-summary">
                          <span>{`文件：${evidence?.documentReference ?? "—"}／版次 ${evidence?.revision ?? "—"}／${evidence?.issuedDate ?? "—"}`}</span>
                          <span>{`定位：${evidence?.pageReference ?? "—"}`}</span>
                          <span>{`RVR 檔名：${evidence?.fileName ?? "—"}`}</span>
                          <span>{`RVR SHA-256：${evidence?.fileSha256 ?? "—"}`}</span>
                        </div>
                        <label className="field-block">
                          <span>選取來源端實際收到的證據檔</span>
                          <input
                            type="file"
                            onChange={(event) => void handleSourceCapacityEvidenceFile(result, evidenceKey, evidence, event)}
                          />
                          <small>只在本機重新計算 SHA-256；檔案不會上傳或保存。</small>
                        </label>
                        <div className={`receiver-receipt-result ${match?.matched ? "ok" : "ng"}`}>
                          <strong>
                            {!match
                              ? "待比對"
                              : match.matched
                                ? match.fileNameMatched ? "SHA-256 與檔名均相符" : "SHA-256 相符，但檔名不同"
                                : "SHA-256 不相符，不得視為同一證據檔"}
                          </strong>
                          {match && <span>{`實際檔名：${match.selectedFileName}`}</span>}
                          {match && <span>{`實際 SHA-256：${match.actualSha256}`}</span>}
                          {match && <span>{`比對時間：${new Date(match.checkedAt).toLocaleString("zh-TW")}`}</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {activeSourceEvidenceVerification && !sourceCapacityEvidenceHasMismatch && (
                <div className="meta-grid">
                  <MetaItem label="SEV 核驗指紋" value={activeSourceEvidenceVerification.verificationFingerprint} />
                  <MetaItem
                    label="核驗時間"
                    value={new Date(activeSourceEvidenceVerification.verifiedAt).toLocaleString("zh-TW")}
                  />
                  <MetaItem
                    label="核驗單位／人員"
                    value={`${activeSourceEvidenceVerification.verificationAuthority.organization}／${activeSourceEvidenceVerification.verificationAuthority.verifierName}`}
                  />
                  <MetaItem label="核驗角色" value={activeSourceEvidenceVerification.verificationAuthority.verifierRole} />
                  <MetaItem
                    label="核驗結果"
                    value={`SHA-256 相符 ${activeSourceEvidenceVerification.summary.matched}/${activeSourceEvidenceVerification.summary.required}`}
                  />
                  <MetaItem
                    label="檔名差異"
                    value={String(activeSourceEvidenceVerification.summary.fileNameDifferences)}
                  />
                  <MetaItem
                    label="SEV 身分簽章"
                    value={sourceEvidenceIdentityVerification?.trusted
                      ? "受信任簽章通過"
                      : sourceEvidenceIdentityVerification?.cryptographicValid
                        ? "簽章有效／信任狀態待處理"
                        : "未附數位簽章"}
                  />
                  <MetaItem
                    label="SEV 簽章 Key ID"
                    value={sourceEvidenceIdentityVerification?.keyId ?? "—"}
                  />
                </div>
              )}
              {activeSourceEvidenceVerification && !sourceCapacityEvidenceHasMismatch && (
                <div className="report-card">
                  <h3>SEV 離線身分簽章</h3>
                  <p className={`meta-line ${sourceEvidenceIdentityVerification?.trusted ? "" : "attention-line"}`}>
                    {sourceEvidenceIdentityVerification?.message
                      ?? "正在向本機信任清冊核對 SEV 簽章狀態。"}
                  </p>
                  <div className="action-row">
                    <button
                      className="secondary"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void handleDownloadSourceEvidenceSigningRequest()}
                    >
                      {activeSourceEvidenceVerification.identitySignature
                        ? "重新建立 SEV 離線簽署請求"
                        : "下載 SEV 離線簽署請求"}
                    </button>
                    <label className="file-action secondary">
                      匯入 SEV 離線簽章回應
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => void handleAttachSourceEvidenceSignature(event)}
                      />
                    </label>
                  </div>
                  <p className="meta-line">
                    離線簽署沿用 RVR 的 Ed25519 金鑰與本機信任清冊；私人金鑰不會送入網頁。簽章可確認 SEV 由對應金鑰簽署，但仍不取代工程內容審閱。
                  </p>
                </div>
              )}
              {activeRemovalTransferReceipt && !sourceCapacityEvidenceRequired && (
                <p className="meta-line attention-line">
                  此為舊版 RVR v1／v2，沒有逐列承載力文件 SHA-256，來源端無法在本頁完成實際證據檔自動比對。
                </p>
              )}
              {activeRemovalTransferReceipt && sourceCapacityEvidenceRequired && !sourceCapacityEvidenceSatisfied && (
                <p className="meta-line attention-line">
                  RVR 指紋已通過，但來源端實際證據檔尚未全數相符且未保存有效 SEV；目前不得把證據核對狀態視為完成。
                </p>
              )}
              {activeRemovalTransferReceipt && sourceCapacityEvidenceAllMatched && (
                <p className="meta-line">
                  RVR 引用的全部證據檔 SHA-256 已相符；請填寫核驗責任資訊並建立 SEV，才會保存為可追溯的專案紀錄。
                </p>
              )}
              {activeRemovalTransferReceipt && sourceCapacityEvidenceRequired && sourceCapacityEvidenceAllMatched && (
                <div className="report-card">
                  <h3>保存來源端證據核驗紀錄（SEV）</h3>
                  <div className="form-grid">
                    <Field
                      label="核驗單位"
                      value={sourceEvidenceVerificationAuthority.organization}
                      onChange={(value) => setSourceEvidenceVerificationAuthority((current) => ({ ...current, organization: value }))}
                    />
                    <Field
                      label="核驗人員"
                      value={sourceEvidenceVerificationAuthority.verifierName}
                      onChange={(value) => setSourceEvidenceVerificationAuthority((current) => ({ ...current, verifierName: value }))}
                    />
                    <Field
                      label="核驗角色"
                      value={sourceEvidenceVerificationAuthority.verifierRole}
                      onChange={(value) => setSourceEvidenceVerificationAuthority((current) => ({ ...current, verifierRole: value }))}
                    />
                  </div>
                  <TextAreaField
                    label="核驗依據"
                    value={sourceEvidenceVerificationBasis}
                    onChange={setSourceEvidenceVerificationBasis}
                  />
                  <div className="action-row">
                    <button
                      type="button"
                      onClick={() => void handleCreateSourceEvidenceVerification()}
                      disabled={Boolean(busy)
                        || Object.values(sourceEvidenceVerificationAuthority).some((value) => !value.trim())
                        || !sourceEvidenceVerificationBasis.trim()}
                    >
                      建立、保存並下載 SEV
                    </button>
                  </div>
                  <p className="meta-line">
                    SEV 保存核驗人員、時間、ERH／RVR／計算指紋及逐列雜湊；證據檔本身不會上傳。SEV 只證明檔案位元相同，工程內容仍須人工審閱。
                  </p>
                </div>
              )}
              {activeRemovalTransferReceipt && (
                <p className="meta-line attention-line">
                  {removalTransferIdentityVerification?.message
                    ?? "RVR 指紋已通過完整性檢查；目前尚未使用數位簽章驗證回簽人身分，正式採用前仍須與回簽單位及正式檢核文件人工核對。"}
                </p>
              )}
              <p className="meta-line">
                交接完成不等於承接構造合格；樓版、重撐、永久結構或其他接收端仍須核對實際傳力方向、荷重分配、偏心、載重組合與容量，並以相同交接指紋回簽驗證結果。
              </p>
            </Panel>
            <Panel title="匯出前檢查" subtitle="建議先確認計算結果與警示清單。">
              {project.calculation_results?.warnings.length ? (
                <ul className="warning-list">
                  {project.calculation_results.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">目前沒有額外警示。</p>
              )}
            </Panel>
          </section>
        )}
        {activeStep === STEP_RECEIPT && (
          <section className="panel-stack">
            <Panel
              title="接收端回簽助手"
              subtitle="匯入來源端 ERH，逐筆登錄承接構造檢核結果，再由後端產生具完整性指紋的 RVR；本頁不代替承接構造計算。"
            >
              <div className="action-row">
                <label className="file-action secondary">
                  匯入 ERH 交接 JSON
                  <input
                    className="file-picker-input"
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportReceiverAssistantHandoff}
                  />
                </label>
                <label className={`file-action secondary${receiverAssistantHandoff ? "" : " disabled"}`}>
                  檢查既有 RVR JSON
                  <input
                    className="file-picker-input"
                    type="file"
                    accept=".json,application/json"
                    disabled={!receiverAssistantHandoff}
                    onChange={handleValidateReceiverAssistantReceipt}
                  />
                </label>
                {activeRemovalTransferHandoff && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => loadReceiverAssistantHandoff(activeRemovalTransferHandoff)}
                  >
                    採用目前專案 ERH
                  </button>
                )}
              </div>
              <p className="meta-line attention-line">
                RVR 只封裝接收端已完成的工程結果並檢查內容未遭竄改；容量、傳力路徑、荷重分配、偏心與載重組合仍須由接收端依正式模型及文件完成。
              </p>
            </Panel>

            <Panel
              title="接收端金鑰管理登入"
              subtitle="金鑰登錄、撤銷、治理申請、第二人覆核與清冊復原均由後端依登入帳號及角色授權，不再採用自行填寫的姓名。"
            >
              <div className="receiver-key-rotation-card receiver-governance-permission-matrix">
                <h4>治理權限矩陣（唯讀）</h4>
                <p className="meta-line">
                  下表說明每一角色單獨授權時的權限；角色可以疊加，但管理員角色不會自動取得治理申請或治理覆核權限。所有變更操作仍須由啟用中的登入帳號通過 CSRF 驗證；待變更臨時密碼期間全部暫停。
                </p>
                <div className="table-wrap">
                  <table aria-label="接收端治理權限矩陣">
                    <thead>
                      <tr>
                        <th scope="col">角色／穩定 ID</th>
                        <th scope="col">公鑰、帳號與備份治理</th>
                        <th scope="col">提出治理申請</th>
                        <th scope="col">第二人覆核</th>
                        <th scope="col">核心控制</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiverOperatorGovernancePermissionRows.map((row) => (
                        <tr key={`permission-${row.role}`}>
                          <th scope="row"><strong>{receiverOperatorRoleLabel(row.role)}</strong><br /><code>{row.role}</code></th>
                          <td>{row.administration}</td>
                          <td>{row.request}</td>
                          <td>{row.approval}</td>
                          <td>{row.control}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="meta-line">
                  本矩陣只供 HTML 操作頁核對，不會寫入 PDF／DOCX 計算書，也不取代後端逐項授權檢查。
                </p>
              </div>
              {!receiverOperatorAuthLoaded ? (
                <p className="empty-state">正在讀取本機登入狀態。</p>
              ) : receiverOperatorAuth.bootstrapRequired ? (
                <div className="receiver-key-rotation-card">
                  <h4>首次設定首位管理員</h4>
                  <p className="meta-line attention-line">
                    首位管理員只能由本機連線建立，並同時取得金鑰管理、治理申請與治理覆核角色。建立後不得再次使用首次設定入口。
                  </p>
                  <div className="form-grid">
                    <Field
                      label="登入帳號"
                      value={receiverOperatorBootstrapDraft.username}
                      onChange={(value) => setReceiverOperatorBootstrapDraft((current) => ({ ...current, username: value }))}
                    />
                    <Field
                      label="顯示姓名"
                      value={receiverOperatorBootstrapDraft.displayName}
                      onChange={(value) => setReceiverOperatorBootstrapDraft((current) => ({ ...current, displayName: value }))}
                    />
                    <label className="field-block">
                      <span>管理員密碼</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={receiverOperatorBootstrapDraft.password}
                        onChange={(event) => setReceiverOperatorBootstrapDraft((current) => ({ ...current, password: event.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="meta-line">密碼至少 12 字元，並須包含大寫、小寫、數字、符號其中三類；資料庫只保存 scrypt 雜湊。</p>
                  <button
                    type="button"
                    disabled={
                      receiverOperatorBootstrapDraft.username.trim().length < 3
                      || !receiverOperatorBootstrapDraft.displayName.trim()
                      || receiverOperatorBootstrapDraft.password.length < 12
                    }
                    onClick={() => void handleBootstrapReceiverOperator()}
                  >
                    建立首位管理員並登入
                  </button>
                </div>
              ) : !receiverOperatorAuth.authenticated || !receiverOperatorAuth.operator ? (
                <div className="receiver-key-rotation-card">
                  <h4>登入後才能變更信任清冊</h4>
                  <div className="form-grid">
                    <Field
                      label="登入帳號"
                      value={receiverOperatorLoginDraft.username}
                      onChange={(value) => setReceiverOperatorLoginDraft((current) => ({ ...current, username: value }))}
                    />
                    <label className="field-block">
                      <span>密碼</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={receiverOperatorLoginDraft.password}
                        onChange={(event) => setReceiverOperatorLoginDraft((current) => ({ ...current, password: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void handleLoginReceiverOperator();
                        }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!receiverOperatorLoginDraft.username.trim() || !receiverOperatorLoginDraft.password}
                    onClick={() => void handleLoginReceiverOperator()}
                  >
                    登入金鑰管理
                  </button>
                </div>
              ) : (
                <>
                  <div className="meta-grid">
                    <MetaItem label="登入帳號" value={receiverOperatorAuth.operator.username} />
                    <MetaItem label="顯示姓名" value={receiverOperatorAuth.operator.displayName} />
                    <MetaItem
                      label="角色"
                      value={receiverOperatorAuth.operator.roles
                        .map((role) => receiverOperatorRoleOptions.find((option) => option.value === role)?.label ?? role)
                        .join("、")}
                    />
                    <MetaItem label="工作階段到期" value={receiverOperatorAuth.expiresAt ?? "—"} />
                  </div>
                  <div className="action-row">
                    <button className="secondary" type="button" onClick={() => void handleLogoutReceiverOperator()}>
                      登出金鑰管理
                    </button>
                  </div>
                  <div className="receiver-key-rotation-card">
                    <h4>{receiverPasswordResetRequired ? "必須先變更臨時密碼" : "變更本人密碼"}</h4>
                    <p className={`meta-line${receiverPasswordResetRequired ? " attention-line" : ""}`}>
                      {receiverPasswordResetRequired
                        ? "管理員已重設此帳號密碼。在完成本人密碼變更前，所有金鑰管理、治理申請與覆核權限均暫停。"
                        : "變更成功會撤銷此帳號全部工作階段並登出，須使用新密碼重新登入。"}
                    </p>
                    <div className="form-grid">
                      <label className="field-block">
                        <span>目前密碼</span>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={receiverOperatorPasswordChangeDraft.currentPassword}
                          onChange={(event) => setReceiverOperatorPasswordChangeDraft((current) => ({
                            ...current,
                            currentPassword: event.target.value,
                          }))}
                        />
                      </label>
                      <label className="field-block">
                        <span>新密碼</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={receiverOperatorPasswordChangeDraft.newPassword}
                          onChange={(event) => setReceiverOperatorPasswordChangeDraft((current) => ({
                            ...current,
                            newPassword: event.target.value,
                          }))}
                        />
                      </label>
                      <label className="field-block">
                        <span>再次輸入新密碼</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={receiverOperatorPasswordChangeDraft.confirmPassword}
                          onChange={(event) => setReceiverOperatorPasswordChangeDraft((current) => ({
                            ...current,
                            confirmPassword: event.target.value,
                          }))}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={
                        !receiverOperatorPasswordChangeDraft.currentPassword
                        || receiverOperatorPasswordChangeDraft.newPassword.length < 12
                        || receiverOperatorPasswordChangeDraft.newPassword
                          !== receiverOperatorPasswordChangeDraft.confirmPassword
                      }
                      onClick={() => void handleChangeReceiverOperatorPassword()}
                    >
                      變更密碼並登出全部工作階段
                    </button>
                  </div>
                  {receiverCanAdministerKeys && (
                    <div className="receiver-key-rotation-card">
                      <h4>建立分權操作帳號</h4>
                      <p className="meta-line">
                        建議把治理申請與治理覆核角色分配給不同帳號。兩種角色同時適用於金鑰輪替及到期備份處置，後端會以不可自行填寫的帳號 ID 判斷兩人是否相同。
                      </p>
                      <div className="form-grid">
                        <Field
                          label="新登入帳號"
                          value={receiverOperatorCreateDraft.username}
                          onChange={(value) => setReceiverOperatorCreateDraft((current) => ({ ...current, username: value }))}
                        />
                        <Field
                          label="顯示姓名"
                          value={receiverOperatorCreateDraft.displayName}
                          onChange={(value) => setReceiverOperatorCreateDraft((current) => ({ ...current, displayName: value }))}
                        />
                        <label className="field-block">
                          <span>初始密碼</span>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={receiverOperatorCreateDraft.password}
                            onChange={(event) => setReceiverOperatorCreateDraft((current) => ({ ...current, password: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="check-grid">
                        {receiverOperatorRoleOptions.map((option) => (
                          <label className="check-field" key={option.value}>
                            <input
                              type="checkbox"
                              checked={receiverOperatorCreateDraft.roles.includes(option.value)}
                              onChange={() => toggleReceiverOperatorRole(option.value)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={
                          receiverOperatorCreateDraft.username.trim().length < 3
                          || !receiverOperatorCreateDraft.displayName.trim()
                          || receiverOperatorCreateDraft.password.length < 12
                          || !receiverOperatorCreateDraft.roles.length
                        }
                        onClick={() => void handleCreateReceiverOperator()}
                      >
                        建立操作帳號
                      </button>
                      {receiverOperators.length > 0 && (
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>帳號／姓名</th><th>狀態</th><th>角色</th><th>建立時間</th><th>管理</th></tr></thead>
                            <tbody>
                              {receiverOperators.map((operator) => (
                                <tr key={operator.id}>
                                  <td><strong>{operator.username}</strong><br />{operator.displayName}</td>
                                  <td>
                                    {operator.disabled ? "已停用" : operator.passwordResetRequired ? "待變更臨時密碼" : "啟用"}
                                  </td>
                                  <td>{operator.roles.map((role) => receiverOperatorRoleOptions.find((option) => option.value === role)?.label ?? role).join("、")}</td>
                                  <td>{operator.createdAt}</td>
                                  <td>
                                    <button
                                      className="ghost"
                                      type="button"
                                      disabled={operator.id === receiverOperatorAuth.operator?.id}
                                      onClick={() => selectReceiverOperator(operator)}
                                    >
                                      {operator.id === receiverOperatorAuth.operator?.id ? "目前帳號" : "選取管理"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {managedReceiverOperator && (
                        <div className="receiver-key-rotation-card">
                          <h4>管理帳號：{managedReceiverOperator.displayName}（{managedReceiverOperator.username}）</h4>
                          <p className="meta-line">
                            角色撤除與停用會立即生效；撤除治理申請角色或停用帳號時，該帳號尚未完成的輪替申請與到期備份處置申請會轉為 blocked。
                          </p>
                          <div className="check-grid">
                            {receiverOperatorRoleOptions.map((option) => (
                              <label className="check-field" key={`manage-${option.value}`}>
                                <input
                                  type="checkbox"
                                  checked={receiverOperatorManageDraft.roles.includes(option.value)}
                                  onChange={() => toggleManagedReceiverOperatorRole(option.value)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="action-row">
                            <button
                              type="button"
                              disabled={!receiverOperatorManageDraft.roles.length}
                              onClick={() => void handleUpdateReceiverOperatorRoles()}
                            >
                              儲存角色變更
                            </button>
                            <button
                              className={managedReceiverOperator.disabled ? "secondary" : "danger"}
                              type="button"
                              onClick={() => void handleSetReceiverOperatorDisabled(!managedReceiverOperator.disabled)}
                            >
                              {managedReceiverOperator.disabled ? "重新啟用帳號" : "停用帳號"}
                            </button>
                          </div>
                          <div className="form-grid">
                            <label className="field-block">
                              <span>管理員指定的臨時密碼</span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={receiverOperatorManageDraft.temporaryPassword}
                                onChange={(event) => setReceiverOperatorManageDraft((current) => ({
                                  ...current,
                                  temporaryPassword: event.target.value,
                                }))}
                              />
                            </label>
                          </div>
                          <p className="meta-line">
                            重設後會撤銷該帳號全部工作階段；使用者以臨時密碼登入後，只能先設定自己的新密碼。
                          </p>
                          <button
                            className="secondary"
                            type="button"
                            disabled={receiverOperatorManageDraft.temporaryPassword.length < 12}
                            onClick={() => void handleResetReceiverOperatorPassword()}
                          >
                            重設密碼並撤銷工作階段
                          </button>
                        </div>
                      )}
                      <div className="receiver-key-rotation-card">
                        <h4>帳號治理稽核鏈</h4>
                        <div className="meta-grid">
                          <MetaItem label="鏈結驗證" value={receiverOperatorAuditSummary.chainValid ? "通過" : "未通過"} />
                          <MetaItem label="事件數" value={String(receiverOperatorAuditSummary.eventCount)} />
                          <MetaItem label="最新指紋" value={receiverOperatorAuditSummary.headFingerprint ?? "尚無事件"} />
                        </div>
                        <p className="meta-line">
                          稽核事件在 SQLite 中禁止更新與刪除，並以前一事件指紋串接；本區只記錄此版本啟用後的帳號治理操作。
                        </p>
                        {receiverOperatorAuditSummary.events.length > 0 && (
                          <div className="table-wrap">
                            <table>
                              <thead><tr><th>時間／事件</th><th>操作人</th><th>目標帳號</th><th>摘要</th><th>事件指紋</th></tr></thead>
                              <tbody>
                                {receiverOperatorAuditSummary.events.map((event) => (
                                  <tr key={event.eventId}>
                                    <td>{event.occurredAt}<br /><strong>{receiverOperatorAuditEventLabel(event.eventType)}</strong></td>
                                    <td>{event.actorDisplayName}<br />{event.actorUsername}</td>
                                    <td>{event.targetDisplayName}<br />{event.targetUsername}</td>
                                    <td>{receiverOperatorAuditDetail(event)}</td>
                                    <td>{event.eventFingerprint}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      <div className="receiver-key-rotation-card">
                        <h4>操作員治理加密備份與災難復原</h4>
                        <p className="meta-line attention-line">
                          備份會把帳號、角色、加鹽密碼驗證值、輪替 claim、到期備份處置 claim 與稽核鏈封裝在 AES-256-GCM 密文內；不含明文密碼、登入工作階段或登入失敗紀錄。加密密碼不會儲存在系統，遺失後無法復原；備份檔仍屬高度敏感資料，應離線管制保存。
                        </p>
                        <div className="form-grid">
                          <label className="field-block">
                            <span>備份加密密碼（至少 16 字元）</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={receiverOperatorBackupDraft.passphrase}
                              onChange={(event) => {
                                setReceiverOperatorBackupDraft((current) => ({
                                  ...current,
                                  passphrase: event.target.value,
                                  recoveryUsername: "",
                                  recoveryPassword: "",
                                }));
                                setReceiverOperatorBackup(null);
                                setReceiverOperatorRestorePreview(null);
                                setReceiverOperatorRestoreConfirmed(false);
                                setReceiverOperatorDrillOutcome(null);
                              }}
                            />
                          </label>
                          <label className="field-block">
                            <span>再次輸入備份加密密碼（匯出用）</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={receiverOperatorBackupDraft.confirmPassphrase}
                              onChange={(event) => setReceiverOperatorBackupDraft((current) => ({
                                ...current,
                                confirmPassphrase: event.target.value,
                              }))}
                            />
                          </label>
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={receiverOperatorBackupDraft.retainServerCopy}
                              onChange={(event) => setReceiverOperatorBackupDraft((current) => ({
                                ...current,
                                retainServerCopy: event.target.checked,
                              }))}
                            />
                            <span>下載時另存一份受管制本機加密副本，納入保存期限與復原演練清冊。</span>
                          </label>
                          {receiverOperatorBackupDraft.retainServerCopy && (
                            <label className="field-block">
                              <span>受管制本機副本保存天數（1–365）</span>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={receiverOperatorBackupDraft.retentionDays}
                                onChange={(event) => setReceiverOperatorBackupDraft((current) => ({
                                  ...current,
                                  retentionDays: Math.min(365, Math.max(1, Number(event.target.value) || 1)),
                                }))}
                              />
                            </label>
                          )}
                          <button
                            className="secondary"
                            type="button"
                            disabled={!receiverOperatorBackupDraft.passphrase && !receiverOperatorBackup}
                            onClick={() => {
                              setReceiverOperatorBackupDraft(emptyReceiverOperatorBackupDraft);
                              setReceiverOperatorBackup(null);
                              setReceiverOperatorRestorePreview(null);
                              setReceiverOperatorRestoreConfirmed(false);
                              setReceiverOperatorRestoreOutcome(null);
                              setReceiverOperatorDrillOutcome(null);
                              setError("");
                            }}
                          >
                            清除備份密碼與匯入資料
                          </button>
                        </div>
                        <div className="action-row">
                          <button
                            type="button"
                            disabled={
                              receiverOperatorBackupDraft.passphrase.length < 16
                              || receiverOperatorBackupDraft.passphrase !== receiverOperatorBackupDraft.confirmPassphrase
                            }
                            onClick={() => void handleDownloadReceiverOperatorGovernanceBackup()}
                          >
                            下載加密治理備份
                          </button>
                          <label className="file-action secondary">
                            匯入備份並預覽差異
                            <input
                              className="file-picker-input"
                              type="file"
                              accept=".json,application/json"
                              disabled={receiverOperatorBackupDraft.passphrase.length < 16}
                              onChange={(event) => void handleImportReceiverOperatorGovernanceBackup(event)}
                            />
                          </label>
                        </div>
                        <p className="meta-line">
                          匯入前先輸入該檔案的加密密碼。系統只會解密驗證並顯示差異，不會立即覆寫資料。
                        </p>
                        <p className="meta-line attention-line">
                          保存期限不會觸發自動刪除。到期副本須由申請人提出案件與依據，再由不同登入帳號覆核後，才會從受管制目錄做一般檔案移除並留下 RBD 收據；此流程不宣稱可在 SSD、同步磁碟、備份或快照上安全抹除，其他副本仍可能存在。演練與處置收據不保存加密密碼、登入密碼、帳號名稱或伺服器路徑。
                        </p>
                        {receiverOperatorRecoveryInventory && (
                          <div className="receiver-key-rotation-card">
                            <div className="action-row">
                              <h4>受管制備份與復原演練清冊</h4>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => void refreshReceiverOperatorGovernance()}
                              >
                                重新整理清冊
                              </button>
                            </div>
                            <div className="meta-grid">
                              <MetaItem
                                label="治理健康"
                                value={receiverOperatorRecoveryInventory.health.status === "healthy" ? "正常" : "需要處理"}
                              />
                              <MetaItem
                                label="受管制備份"
                                value={String(receiverOperatorRecoveryInventory.managedBackups.length)}
                              />
                              <MetaItem
                                label="復原演練收據"
                                value={String(receiverOperatorRecoveryInventory.drillReceipts.length)}
                              />
                              <MetaItem
                                label="到期處置收據"
                                value={String(receiverOperatorRecoveryInventory.backupDispositionReceipts.length)}
                              />
                              <MetaItem
                                label="演練期限"
                                value={`${receiverOperatorRecoveryInventory.health.drillMaxAgeDays} 天`}
                              />
                            </div>
                            {receiverOperatorRecoveryInventory.health.issues.length > 0 && (
                              <div className="attention-line">
                                <strong>待處理事項：</strong>
                                <ul>
                                  {receiverOperatorRecoveryInventory.health.issues.map((issue) => (
                                    <li key={issue.code}>{issue.message}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {receiverOperatorRecoveryInventory.managedBackups.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>備份／狀態</th><th>產出與保存期限</th><th>內容摘要</th><th>檔案 SHA-256</th><th>到期處置</th></tr></thead>
                                  <tbody>
                                    {receiverOperatorRecoveryInventory.managedBackups.map((item) => {
                                      const claim = receiverOperatorRecoveryInventory.backupDispositionRequests.find(
                                        (candidate) => candidate.backupFingerprint === item.backupFingerprint
                                          && ["pending", "removal-in-progress", "completed"].includes(candidate.state),
                                      );
                                      return (
                                        <tr key={item.fileName}>
                                          <td><strong>{item.backupFingerprint}</strong><br />{item.expired ? "已到期" : "保存中"}</td>
                                          <td>{item.exportedAt}<br />保存至 {item.retentionUntil}</td>
                                          <td>帳號 {item.operatorCount}；啟用管理員 {item.activeAdminCount}；稽核事件 {item.auditEventCount}；處置 claim {item.backupDispositionClaimCount}</td>
                                          <td>{item.fileSha256}</td>
                                          <td>
                                            {!item.expired && "未到期"}
                                            {item.expired && claim && (
                                              <><strong>{claim.requestFingerprint}</strong><br />{
                                                claim.state === "pending" ? "待第二人覆核"
                                                  : claim.state === "removal-in-progress" ? "已核准，待完成"
                                                    : "已完成但檔案仍存在"
                                              }</>
                                            )}
                                            {item.expired && !claim && (
                                              <button
                                                className="secondary"
                                                type="button"
                                                disabled={!receiverCanRequestRotation}
                                                onClick={() => startReceiverOperatorBackupDisposition(item.backupFingerprint)}
                                              >
                                                提出雙人處置申請
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {receiverOperatorBackupDispositionDraft.backupFingerprint && (
                              <div className="receiver-key-rotation-card">
                                <h4>提出到期備份處置申請</h4>
                                <p className="meta-line">
                                  本步驟只建立 72 小時有效的 RBR 申請，不會移除檔案；須由不同登入帳號第二人覆核後才會執行一般檔案移除。
                                </p>
                                <div className="meta-grid">
                                  <MetaItem label="到期備份" value={receiverOperatorBackupDispositionDraft.backupFingerprint} />
                                  <MetaItem
                                    label="目前申請帳號"
                                    value={receiverOperatorAuth.operator
                                      ? `${receiverOperatorAuth.operator.displayName}｜${receiverOperatorAuth.operator.username}`
                                      : "未登入"}
                                  />
                                </div>
                                <div className="form-grid compact-form-grid">
                                  <label><span>案件／變更編號（必填）</span><input
                                    value={receiverOperatorBackupDispositionDraft.caseReference}
                                    onChange={(event) => setReceiverOperatorBackupDispositionDraft((current) => ({ ...current, caseReference: event.target.value }))}
                                  /></label>
                                  <label className="span-2"><span>處置依據（必填）</span><textarea
                                    value={receiverOperatorBackupDispositionDraft.basis}
                                    onChange={(event) => setReceiverOperatorBackupDispositionDraft((current) => ({ ...current, basis: event.target.value }))}
                                  /></label>
                                </div>
                                <label className="check-row">
                                  <input
                                    type="checkbox"
                                    checked={receiverOperatorBackupDispositionDraft.confirmed}
                                    onChange={(event) => setReceiverOperatorBackupDispositionDraft((current) => ({ ...current, confirmed: event.target.checked }))}
                                  />
                                  <span>我確認此副本已到期，提交不同帳號於 72 小時內覆核；此申請本身不會刪除檔案。</span>
                                </label>
                                <div className="action-row">
                                  <button
                                    type="button"
                                    disabled={
                                      !receiverCanRequestRotation
                                      || !receiverOperatorBackupDispositionDraft.caseReference.trim()
                                      || !receiverOperatorBackupDispositionDraft.basis.trim()
                                      || !receiverOperatorBackupDispositionDraft.confirmed
                                    }
                                    onClick={() => void handleRequestReceiverOperatorBackupDisposition()}
                                  >建立 72 小時雙人處置申請</button>
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={() => setReceiverOperatorBackupDispositionDraft(emptyReceiverOperatorBackupDispositionDraft)}
                                  >取消</button>
                                </div>
                              </div>
                            )}
                            {receiverOperatorRecoveryInventory.backupDispositionRequests.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>申請／備份</th><th>案件與依據</th><th>申請與期限</th><th>狀態</th><th>覆核</th></tr></thead>
                                  <tbody>
                                    {receiverOperatorRecoveryInventory.backupDispositionRequests.map((claim) => {
                                      const sameOperator = claim.requestedByOperatorId === receiverOperatorAuth.operator?.id;
                                      const reservedByAnother = Boolean(
                                        claim.completionOperatorId
                                        && claim.completionOperatorId !== receiverOperatorAuth.operator?.id,
                                      );
                                      return <tr key={claim.requestFingerprint}>
                                        <td><strong>{claim.requestFingerprint}</strong><br />{claim.backupFingerprint}</td>
                                        <td>{claim.caseReference}<br /><span className="table-muted">{claim.basis}</span></td>
                                        <td>{claim.requestedAt}<br />至 {claim.expiresAt}</td>
                                        <td>{
                                          claim.state === "pending" ? "待第二人覆核"
                                            : claim.state === "removal-in-progress" ? "已核准，處置待結案"
                                              : claim.state === "completed" ? "已完成"
                                                : claim.state === "expired" ? "申請逾期"
                                                  : "申請已阻擋"
                                        }{claim.receiptFingerprint && <><br /><strong>{claim.receiptFingerprint}</strong></>}</td>
                                        <td>{["pending", "removal-in-progress"].includes(claim.state) ? (
                                          <button
                                            className="secondary"
                                            type="button"
                                            disabled={!receiverCanApproveRotation || sameOperator || reservedByAnother}
                                            onClick={() => startReceiverOperatorBackupDispositionApproval(claim.requestFingerprint)}
                                          >{claim.state === "pending" ? "第二人覆核" : "續辦中斷處置"}</button>
                                        ) : "—"}</td>
                                      </tr>;
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {receiverOperatorBackupDispositionApprovalDraft.requestFingerprint && (() => {
                              const claim = receiverOperatorRecoveryInventory.backupDispositionRequests.find(
                                (item) => item.requestFingerprint === receiverOperatorBackupDispositionApprovalDraft.requestFingerprint,
                              );
                              const sameOperator = claim?.requestedByOperatorId === receiverOperatorAuth.operator?.id;
                              return claim ? <div className="receiver-key-rotation-card">
                                <h4>第二人覆核到期備份處置</h4>
                                <p className="meta-line attention-line">
                                  覆核通過後，系統會從受管制目錄移除該密文檔並留下 RBD 收據。這只是一般檔案系統項目移除，不是安全抹除；同步端、備份、快照或儲存媒體殘留仍須依組織程序另行處理。
                                </p>
                                <div className="meta-grid">
                                  <MetaItem label="申請指紋" value={claim.requestFingerprint} />
                                  <MetaItem label="備份指紋" value={claim.backupFingerprint} />
                                  <MetaItem label="申請帳號 ID" value={claim.requestedByOperatorId} />
                                  <MetaItem label="目前覆核帳號" value={receiverOperatorAuth.operator ? `${receiverOperatorAuth.operator.displayName}｜${receiverOperatorAuth.operator.username}` : "未登入"} />
                                </div>
                                {sameOperator && <p className="meta-line attention-line">目前登入帳號就是申請帳號，後端禁止自行覆核。</p>}
                                <label className="check-row">
                                  <input
                                    type="checkbox"
                                    checked={receiverOperatorBackupDispositionApprovalDraft.confirmed}
                                    onChange={(event) => setReceiverOperatorBackupDispositionApprovalDraft((current) => ({ ...current, confirmed: event.target.checked }))}
                                  />
                                  <span>我已核對申請指紋、案件依據、保存期限與檔案 SHA-256，並理解此操作不保證安全抹除或其他副本同步刪除。</span>
                                </label>
                                <div className="action-row">
                                  <button
                                    type="button"
                                    disabled={!receiverCanApproveRotation || sameOperator || !receiverOperatorBackupDispositionApprovalDraft.confirmed}
                                    onClick={() => void handleApproveReceiverOperatorBackupDisposition()}
                                  >覆核通過、移除受管制副本並產生 RBD 收據</button>
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={() => setReceiverOperatorBackupDispositionApprovalDraft(emptyReceiverOperatorBackupDispositionApprovalDraft)}
                                  >取消</button>
                                </div>
                              </div> : null;
                            })()}
                            {receiverOperatorRecoveryInventory.backupDispositionReceipts.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>完成時間</th><th>申請／備份</th><th>案件</th><th>處置邊界</th><th>收據指紋</th></tr></thead>
                                  <tbody>
                                    {receiverOperatorRecoveryInventory.backupDispositionReceipts.map((receipt) => (
                                      <tr key={receipt.receiptFingerprint}>
                                        <td>{receipt.completedAt}</td>
                                        <td>{receipt.requestFingerprint}<br />{receipt.backupFingerprint}</td>
                                        <td>案件雜湊 {receipt.caseReferenceSha256}<br /><span className="table-muted">依據雜湊 {receipt.basisSha256}</span></td>
                                        <td>受管制目錄已無該檔；一般檔案移除，非安全抹除，其他副本可能仍存在</td>
                                        <td>{receipt.receiptFingerprint}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {receiverOperatorBackupDispositionOutcome && (
                              <div className="success-line">
                                <strong>到期備份雙人處置已完成</strong>
                                <div className="meta-grid">
                                  <MetaItem label="申請指紋" value={receiverOperatorBackupDispositionOutcome.requestFingerprint} />
                                  <MetaItem label="備份指紋" value={receiverOperatorBackupDispositionOutcome.backupFingerprint} />
                                  <MetaItem label="處置收據" value={receiverOperatorBackupDispositionOutcome.receiptFingerprint} />
                                  <MetaItem label="處置語意" value="一般檔案移除；非安全抹除" />
                                </div>
                              </div>
                            )}
                            {receiverOperatorRecoveryInventory.drillReceipts.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>演練時間</th><th>備份</th><th>結果</th><th>收據指紋</th></tr></thead>
                                  <tbody>
                                    {receiverOperatorRecoveryInventory.drillReceipts.map((receipt) => (
                                      <tr key={receipt.receiptFingerprint}>
                                        <td>{receipt.performedAt}</td>
                                        <td>{receipt.backupFingerprint}</td>
                                        <td>隔離復原、備份管理員登入及稽核鏈均通過；正式治理資料未變更</td>
                                        <td>{receipt.receiptFingerprint}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                        {receiverOperatorRestorePreview && receiverOperatorBackup && (
                          <div className="receiver-key-rotation-card">
                            <h4>復原差異預覽</h4>
                            <div className="meta-grid">
                              <MetaItem label="備份產出時間" value={receiverOperatorBackup.exportedAt} />
                              <MetaItem label="備份檔指紋" value={receiverOperatorBackup.backupFingerprint} />
                              <MetaItem
                                label="目前資料庫狀態"
                                value={receiverOperatorRestorePreview.currentStatus === "fresh-recovery-bootstrap" ? "全新復原環境" : "既有有效治理資料"}
                              />
                              <MetaItem
                                label="復原判定"
                                value={receiverOperatorRestorePreview.restoreAllowed ? "允許復原" : "禁止復原"}
                              />
                              <MetaItem
                                label="帳號數（目前 → 備份）"
                                value={`${receiverOperatorRestorePreview.currentOperatorCount} → ${receiverOperatorRestorePreview.backupOperatorCount}`}
                              />
                              <MetaItem
                                label="稽核事件數（目前 → 備份）"
                                value={`${receiverOperatorRestorePreview.currentAuditEventCount} → ${receiverOperatorRestorePreview.backupAuditEventCount}`}
                              />
                              <MetaItem
                                label="輪替 claim 數（目前 → 備份）"
                                value={`${receiverOperatorRestorePreview.currentRotationClaimCount} → ${receiverOperatorRestorePreview.backupRotationClaimCount}`}
                              />
                              <MetaItem
                                label="備份處置 claim 數（目前 → 備份）"
                                value={`${receiverOperatorRestorePreview.currentBackupDispositionClaimCount} → ${receiverOperatorRestorePreview.backupDispositionClaimCount}`}
                              />
                              <MetaItem
                                label="備份內啟用管理員"
                                value={receiverOperatorRestorePreview.backupActiveAdminUsernames.join("、") || "無"}
                              />
                              <MetaItem label="目前快照指紋" value={receiverOperatorRestorePreview.currentSnapshotFingerprint} />
                              <MetaItem label="備份快照指紋" value={receiverOperatorRestorePreview.backupSnapshotFingerprint} />
                            </div>
                            {receiverOperatorRestorePreview.blockingReasons.length > 0 && (
                              <div className="attention-line">
                                <strong>禁止復原原因：</strong>
                                <ul>
                                  {receiverOperatorRestorePreview.blockingReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="meta-grid">
                              <MetaItem
                                label="備份新增帳號"
                                value={receiverOperatorRestorePreview.addedUsernames.join("、") || "無"}
                              />
                              <MetaItem
                                label="備份移除帳號"
                                value={receiverOperatorRestorePreview.removedUsernames.join("、") || "無"}
                              />
                            </div>
                            {receiverOperatorRestorePreview.accountChanges.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>帳號</th><th>角色變更</th><th>狀態變更</th></tr></thead>
                                  <tbody>
                                    {receiverOperatorRestorePreview.accountChanges.map((change) => (
                                      <tr key={change.username}>
                                        <td>{change.username}</td>
                                        <td>{receiverOperatorRoleLabels(change.currentRoles)} → {receiverOperatorRoleLabels(change.backupRoles)}</td>
                                        <td>{receiverOperatorStatusLabel(change.currentStatus)} → {receiverOperatorStatusLabel(change.backupStatus)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <p className="meta-line attention-line">
                              復原採完整置換帳號、角色、輪替 claim、備份處置 claim 與稽核鏈，並撤銷全部工作階段。既有有效資料庫只接受延續目前稽核鏈的備份；只有全新建立、尚未使用的單一啟動管理員環境可作災難復原例外。
                            </p>
                            <div className="form-grid">
                              <Field
                                label="備份內啟用管理員帳號"
                                value={receiverOperatorBackupDraft.recoveryUsername}
                                onChange={(value) => {
                                  setReceiverOperatorBackupDraft((current) => ({
                                    ...current,
                                    recoveryUsername: value,
                                  }));
                                  setReceiverOperatorDrillOutcome(null);
                                }}
                              />
                              <label className="field-block">
                                <span>該管理員在備份中的密碼</span>
                                <input
                                  type="password"
                                  autoComplete="current-password"
                                  value={receiverOperatorBackupDraft.recoveryPassword}
                                  onChange={(event) => {
                                    setReceiverOperatorBackupDraft((current) => ({
                                      ...current,
                                      recoveryPassword: event.target.value,
                                    }));
                                    setReceiverOperatorDrillOutcome(null);
                                  }}
                                />
                              </label>
                            </div>
                            <div className="action-row">
                              <button
                                className="secondary"
                                type="button"
                                disabled={
                                  !receiverOperatorBackupDraft.recoveryUsername.trim()
                                  || !receiverOperatorBackupDraft.recoveryPassword
                                }
                                onClick={() => void handleDrillReceiverOperatorGovernanceBackup()}
                              >
                                執行隔離復原演練（不改正式資料）
                              </button>
                            </div>
                            {receiverOperatorDrillOutcome && (
                              <div className="success-line">
                                <strong>隔離復原演練通過</strong>
                                <div className="meta-grid">
                                  <MetaItem label="演練收據" value={receiverOperatorDrillOutcome.receiptFingerprint} />
                                  <MetaItem label="備份指紋" value={receiverOperatorDrillOutcome.backupFingerprint} />
                                  <MetaItem label="隔離復原事件" value={receiverOperatorDrillOutcome.isolatedRestoreEventFingerprint} />
                                  <MetaItem label="正式治理資料" value="演練期間未變更" />
                                </div>
                              </div>
                            )}
                            <label className="check-field attention-line">
                              <input
                                type="checkbox"
                                checked={receiverOperatorRestoreConfirmed}
                                onChange={(event) => setReceiverOperatorRestoreConfirmed(event.target.checked)}
                              />
                              <span>我確認完整置換治理資料、撤銷全部工作階段，並在復原後使用備份內帳號重新登入。</span>
                            </label>
                            <button
                              className="danger"
                              type="button"
                              disabled={
                                !receiverOperatorRestorePreview.restoreAllowed
                                || !receiverOperatorRestoreConfirmed
                                || !receiverOperatorBackupDraft.recoveryUsername.trim()
                                || !receiverOperatorBackupDraft.recoveryPassword
                              }
                              onClick={() => void handleRestoreReceiverOperatorGovernanceBackup()}
                            >
                              執行治理資料災難復原
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {receiverOperatorRestoreOutcome && (
                <div className="receiver-key-rotation-card">
                  <h4>治理資料復原完成，已撤銷全部工作階段</h4>
                  <div className="meta-grid">
                    <MetaItem label="復原備份指紋" value={receiverOperatorRestoreOutcome.backupFingerprint} />
                    <MetaItem label="復原後治理快照指紋" value={receiverOperatorRestoreOutcome.restoredSnapshotFingerprint} />
                    <MetaItem label="復原事件指紋" value={receiverOperatorRestoreOutcome.restoreEventFingerprint} />
                    <MetaItem label="復原前保全檔" value={receiverOperatorRestoreOutcome.safeguardFileName} />
                    <MetaItem label="保全備份指紋" value={receiverOperatorRestoreOutcome.safeguardBackupFingerprint} />
                    <MetaItem label="撤銷工作階段" value={String(receiverOperatorRestoreOutcome.revokedSessions)} />
                  </div>
                  <p className="meta-line attention-line">
                    請使用備份內的啟用管理員帳號重新登入。復原前保全檔使用同一組加密密碼，僅顯示檔名而不揭露伺服器路徑。
                  </p>
                </div>
              )}
              <p className="meta-line attention-line">
                本機登入可驗證同一服務資料庫中的帳號與角色，並以 HttpOnly 工作階段及 CSRF 保護變更；它仍不等於外部組織目錄、自然人身分或公司授權已由第三方驗證。正式組織應再與既有身分或簽核制度對接。
              </p>
            </Panel>

            <Panel
              title="本機受信任 RVR／SEV 公鑰"
              subtitle="同一清冊供 RVR 與 SEV 驗章；只有經管理者核對後登錄的 Ed25519 公鑰，才能把有效簽章提升為「受信任簽章通過」。私人金鑰不會進入本工具。"
            >
              <div className="action-row">
                <label className="file-action secondary">
                  匯入 RKE 公鑰登錄包
                  <input
                    className="file-picker-input"
                    type="file"
                    accept=".json,application/json"
                    disabled={!receiverCanAdministerKeys}
                    onChange={handleImportReceiverKeyEnrollment}
                  />
                </label>
              </div>
              <p className="meta-line">
                建議使用離線建鑰程式產出的公開 RKE；系統會先驗證 Key ID、包指紋與私鑰持有證明，但組織身分仍須由管理者透過獨立管道核對。
              </p>
              {receiverTrustEnrollment && (
                <div className="meta-grid">
                  <MetaItem label="持有證明" value="Ed25519 驗證通過" />
                  <MetaItem label="Key ID" value={receiverTrustEnrollment.keyId} />
                  <MetaItem label="RKE 指紋" value={receiverTrustEnrollment.packageFingerprint} />
                  <MetaItem label="輪替關聯" value={receiverTrustEnrollment.replacesKeyId || "新建金鑰"} />
                </div>
              )}
              <div className="form-grid">
                <Field
                  label="公鑰所屬單位"
                  value={receiverTrustDraft.organization}
                  onChange={(value) => updateReceiverTrustDraft("organization", value)}
                />
                <Field
                  label="金鑰名稱／用途"
                  value={receiverTrustDraft.displayName}
                  onChange={(value) => updateReceiverTrustDraft("displayName", value)}
                />
              </div>
              <TextAreaField
                label="Ed25519 公鑰（PEM 或 raw Base64）"
                value={receiverTrustDraft.publicKey}
                onChange={(value) => updateReceiverTrustDraft("publicKey", value)}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={receiverTrustVerificationConfirmed}
                  onChange={(event) => setReceiverTrustVerificationConfirmed(event.target.checked)}
                />
                <span>我已透過獨立管道核對公鑰所屬單位與 Key ID；RKE 持有證明本身不等於組織身分證明。</span>
              </label>
              <div className="action-row">
                <button
                  className="secondary"
                  type="button"
                  disabled={!receiverCanAdministerKeys || !receiverTrustVerificationConfirmed || !receiverTrustDraft.organization.trim() || !receiverTrustDraft.displayName.trim() || !receiverTrustDraft.publicKey.trim()}
                  onClick={handleRegisterReceiverTrustKey}
                >
                  {receiverTrustEnrollment ? "確認並登錄已驗證 RKE 公鑰" : "核對後登錄為本機信任公鑰"}
                </button>
              </div>
              {receiverTrustKeys.length ? (
                <>
                <p className="meta-line table-scroll-hint">窄螢幕可在表格內左右滑動，查看完整 Key ID、狀態與管理動作。</p>
                <div className="table-scroll-card">
                  <table className="data-table compact receiver-trust-key-table">
                    <thead><tr><th>單位／金鑰</th><th>Key ID</th><th>狀態</th><th>管理</th></tr></thead>
                    <tbody>
                      {receiverTrustKeys.map((key) => {
                        const rotation = receiverKeyRotationStatus(key, receiverTrustKeys, receiverRotationRequests);
                        const hasPendingRequest = receiverRotationRequests.some(
                          (item) => item.newKeyId === key.keyId && item.status === "pending",
                        );
                        return (
                        <tr key={key.keyId}>
                          <td>
                            <strong>{key.organization}</strong><br />
                            <span className="table-muted">{key.displayName}</span>
                            {key.registrationMethod === "enrollment-package" && <><br /><span className="table-muted">RKE 持有證明已驗證</span></>}
                            {key.replacesKeyId && <><br /><span className="table-muted">取代：{key.replacesKeyId}</span></>}
                            {key.replacedByKeyId && <><br /><span className="table-muted">已由：{key.replacedByKeyId} 取代</span></>}
                          </td>
                          <td>{key.keyId}</td>
                          <td>
                            {key.status === "trusted" ? "受信任" : "已撤銷"}
                            {key.revokedAt && <><br /><span className="table-muted">{key.revokedAt}</span></>}
                            {key.revocationReasonCode && <><br /><span className="table-muted">{receiverTrustEventReasonLabel(key.revocationReasonCode)}</span></>}
                            {rotation && <><br /><span className={`receiver-key-rotation-status ${rotation.tone}`}>{rotation.label}</span></>}
                          </td>
                          <td>
                            <button
                              className="mini-action"
                              type="button"
                              disabled={key.status === "revoked" || !receiverCanAdministerKeys}
                              onClick={() => beginReceiverTrustKeyRevocation(key.keyId)}
                            >
                              填寫撤銷紀錄
                            </button>
                            {rotation?.oldKey?.status === "trusted" && !hasPendingRequest && (
                              <button
                                className="mini-action"
                                type="button"
                                disabled={!receiverCanRequestRotation}
                                onClick={() => beginReceiverKeyRotationCompletion(key.keyId)}
                              >
                                提出輪替完成申請
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                <p className="empty-state">本機尚未登錄受信任公鑰；未簽或未知公鑰的 RVR／SEV 仍可檢查內容，但身分維持人工核對。</p>
              )}
              {receiverRotationKeyId && (() => {
                const newKey = receiverTrustKeys.find((key) => key.keyId === receiverRotationKeyId) ?? null;
                const oldKey = newKey?.replacesKeyId
                  ? receiverTrustKeys.find((key) => key.keyId === newKey.replacesKeyId) ?? null
                  : null;
                return (
                  <div className="receiver-key-rotation-card">
                    <h4>提出金鑰輪替完成申請</h4>
                    <p className="meta-line attention-line">
                      此步驟只建立具 RVE 指紋、72 小時期限與切換依據的申請，不會撤銷舊金鑰。必須由不同人員另行覆核後才會完成輪替。
                    </p>
                    <div className="meta-grid">
                      <MetaItem label="新金鑰" value={newKey ? `${newKey.displayName}｜${newKey.keyId}` : "找不到"} />
                      <MetaItem label="將撤銷的舊金鑰" value={oldKey ? `${oldKey.displayName}｜${oldKey.keyId}` : "找不到"} />
                      <MetaItem label="所屬單位" value={newKey?.organization || "—"} />
                      <MetaItem
                        label="登入申請帳號"
                        value={receiverOperatorAuth.operator
                          ? `${receiverOperatorAuth.operator.displayName}｜${receiverOperatorAuth.operator.username}`
                          : "尚未登入"}
                      />
                    </div>
                    <div className="form-grid">
                      <Field
                        label="輪替案件／變更編號（必填）"
                        value={receiverRotationDraft.incidentReference}
                        onChange={(value) => setReceiverRotationDraft((current) => ({ ...current, incidentReference: value, confirmed: false }))}
                      />
                    </div>
                    <TextAreaField
                      label="新金鑰啟用、測試簽署與使用端切換摘要"
                      value={receiverRotationDraft.reason}
                      onChange={(value) => setReceiverRotationDraft((current) => ({ ...current, reason: value, confirmed: false }))}
                    />
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={receiverRotationDraft.confirmed}
                        onChange={(event) => setReceiverRotationDraft((current) => ({ ...current, confirmed: event.target.checked }))}
                      />
                      <span>我確認新金鑰已完成測試簽署與使用端切換，並提交予不同人員在 72 小時內覆核；本步驟尚不撤銷舊金鑰。</span>
                    </label>
                    <div className="action-row">
                      <button
                        className="danger-button"
                        type="button"
                        disabled={
                          !receiverRotationDraft.confirmed
                          || !receiverRotationDraft.reason.trim()
                          || !receiverRotationDraft.incidentReference.trim()
                          || !receiverCanRequestRotation
                          || !newKey
                          || !oldKey
                        }
                        onClick={handleRequestReceiverKeyRotationCompletion}
                      >
                        建立 72 小時雙人覆核申請
                      </button>
                      <button className="ghost" type="button" onClick={cancelReceiverKeyRotationCompletion}>取消</button>
                    </div>
                  </div>
                );
              })()}
              <h4>輪替雙人覆核申請</h4>
              <p className="meta-line">
                申請與覆核分成兩筆不可覆寫的事件，後端以登入帳號 ID 而非顯示姓名判斷兩人是否相同，並以 SQLite 交易鎖與唯一待審約束避免跨程序重複完成；申請 72 小時後失效。本機帳號驗證仍不等於外部組織身分或公司授權已獲第三方驗證。疑似外洩、確認外洩或私鑰遺失仍應立即使用一般撤銷，不等待輪替覆核。
              </p>
              {receiverRotationRequests.length ? (
                <>
                  <p className="meta-line table-scroll-hint">窄螢幕可在表格內左右滑動，查看完整申請指紋與覆核狀態。</p>
                  <div className="table-scroll-card">
                    <table className="data-table compact receiver-trust-event-table">
                      <thead><tr><th>狀態／期限</th><th>新舊 Key ID</th><th>申請人／依據</th><th>申請指紋／管理</th></tr></thead>
                      <tbody>
                        {[...receiverRotationRequests].reverse().map((item) => (
                          <tr key={item.requestFingerprint}>
                            <td>
                              <strong className={`receiver-key-rotation-status ${item.status === "completed" ? "completed" : item.status === "pending" ? "pending" : "attention"}`}>
                                {receiverRotationRequestStatusLabel(item.status)}
                              </strong><br />
                              <span className="table-muted">提出：{item.requestedAt}</span><br />
                              <span className="table-muted">期限：{item.expiresAt}</span>
                            </td>
                            <td>
                              新：{item.newKeyId}<br />
                              <span className="table-muted">舊：{item.oldKeyId}</span>
                            </td>
                            <td>
                              {item.requestedBy}｜{item.requesterRole}<br />
                              <span className="table-muted">
                                {item.identityAssurance === "authenticated-local-account"
                                  ? `本機登入帳號：${item.requestedByOperatorId}｜交易：${item.authorizationState === "tracked" ? "已追蹤" : "缺少 SQLite 申請紀錄"}`
                                  : "舊版程序性姓名聲明"}
                              </span><br />
                              <span className="table-muted">{item.reason}</span><br />
                              <span className="table-muted">依據：{item.incidentReference}</span>
                              {item.approvedBy && <><br /><span className="table-muted">覆核：{item.approvedBy}｜{item.approverRole}</span></>}
                            </td>
                            <td>
                              {item.requestFingerprint}
                              {item.status === "pending" && (
                                <><br /><button
                                  className="mini-action"
                                  type="button"
                                  disabled={
                                    !receiverCanApproveRotation
                                    || item.identityAssurance !== "authenticated-local-account"
                                    || item.authorizationState !== "tracked"
                                    || item.requestedByOperatorId === receiverOperatorAuth.operator?.id
                                  }
                                  onClick={() => beginReceiverKeyRotationApproval(item.requestFingerprint)}
                                >第二人覆核</button></>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="empty-state">目前沒有輪替完成申請。</p>
              )}
              {receiverRotationApprovalRequestFingerprint && (() => {
                const rotationRequest = receiverRotationRequests.find(
                  (item) => item.requestFingerprint === receiverRotationApprovalRequestFingerprint,
                ) ?? null;
                const sameOperator = Boolean(
                  rotationRequest
                  && receiverOperatorAuth.operator
                  && rotationRequest.requestedByOperatorId === receiverOperatorAuth.operator.id,
                );
                const authenticatedRequest = rotationRequest?.identityAssurance === "authenticated-local-account"
                  && rotationRequest.authorizationState === "tracked";
                return (
                  <div className="receiver-key-rotation-card">
                    <h4>第二人覆核輪替完成申請</h4>
                    <p className="meta-line attention-line">
                      請由未參與本次申請的人員核對新金鑰測試簽署、所有使用端切換、申請指紋與變更依據。覆核通過後才會不可復原地撤銷申請所指向的舊金鑰。
                    </p>
                    <div className="meta-grid">
                      <MetaItem label="申請指紋" value={rotationRequest?.requestFingerprint || "找不到"} />
                      <MetaItem label="申請人／職責" value={rotationRequest ? `${rotationRequest.requestedBy}｜${rotationRequest.requesterRole}` : "找不到"} />
                      <MetaItem label="申請帳號 ID" value={rotationRequest?.requestedByOperatorId || "舊版申請未保存"} />
                      <MetaItem
                        label="目前覆核帳號"
                        value={receiverOperatorAuth.operator
                          ? `${receiverOperatorAuth.operator.displayName}｜${receiverOperatorAuth.operator.username}`
                          : "尚未登入"}
                      />
                      <MetaItem label="變更編號" value={rotationRequest?.incidentReference || "—"} />
                      <MetaItem label="覆核期限" value={rotationRequest?.expiresAt || "—"} />
                    </div>
                    {!authenticatedRequest && <p className="meta-line attention-line">此申請沒有可同時驗證的登入帳號 ID 與 SQLite 交易紀錄，不得以角色權限完成；請於期限失效後重新提出。</p>}
                    {sameOperator && <p className="meta-line attention-line">目前登入帳號就是申請帳號，後端禁止自行覆核。</p>}
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={receiverRotationApprovalDraft.confirmed}
                        onChange={(event) => setReceiverRotationApprovalDraft((current) => ({ ...current, confirmed: event.target.checked }))}
                      />
                      <span>我已核對申請指紋、切換證據與變更依據，確認由不同人員提出，並了解舊金鑰撤銷不可復原。</span>
                    </label>
                    <div className="action-row">
                      <button
                        className="danger-button"
                        type="button"
                        disabled={
                          !rotationRequest
                          || rotationRequest.status !== "pending"
                          || !receiverRotationApprovalDraft.confirmed
                          || !receiverCanApproveRotation
                          || !authenticatedRequest
                          || sameOperator
                        }
                        onClick={handleApproveReceiverKeyRotationCompletion}
                      >
                        覆核通過並撤銷舊金鑰
                      </button>
                      <button className="ghost" type="button" onClick={cancelReceiverKeyRotationApproval}>取消</button>
                    </div>
                  </div>
                );
              })()}
              {receiverRevocationKeyId && (
                <div className="receiver-key-revocation-card">
                  <h4>撤銷金鑰：{receiverRevocationKeyId}</h4>
                  <p className="meta-line attention-line">
                    撤銷是一次性生命週期事件，不提供復原或覆寫；歷史 RVR／SEV 仍可驗證簽章，但不再顯示為受信任。
                  </p>
                  <div className="meta-grid">
                    <MetaItem
                      label="登入處理帳號"
                      value={receiverOperatorAuth.operator
                        ? `${receiverOperatorAuth.operator.displayName}｜${receiverOperatorAuth.operator.username}`
                        : "尚未登入"}
                    />
                  </div>
                  <div className="form-grid">
                    <label className="field-block">
                      <span>撤銷原因分類</span>
                      <select
                        value={receiverRevocationDraft.reasonCode}
                        onChange={(event) => setReceiverRevocationDraft((current) => ({
                          ...current,
                          reasonCode: event.target.value as ReceiverRevocationReason,
                          confirmed: false,
                        }))}
                      >
                        {receiverRevocationReasonOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="事故、案件或變更編號（選填）"
                      value={receiverRevocationDraft.incidentReference}
                      onChange={(value) => setReceiverRevocationDraft((current) => ({ ...current, incidentReference: value, confirmed: false }))}
                    />
                  </div>
                  <TextAreaField
                    label="撤銷原因與處理摘要"
                    value={receiverRevocationDraft.reason}
                    onChange={(value) => setReceiverRevocationDraft((current) => ({ ...current, reason: value, confirmed: false }))}
                  />
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={receiverRevocationDraft.confirmed}
                      onChange={(event) => setReceiverRevocationDraft((current) => ({ ...current, confirmed: event.target.checked }))}
                    />
                    <span>我確認撤銷原因與處理者正確，並了解撤銷不可復原、既有事件記錄不可覆寫。</span>
                  </label>
                  <div className="action-row">
                    <button
                      className="danger-button"
                      type="button"
                      disabled={!receiverCanAdministerKeys || !receiverRevocationDraft.confirmed || !receiverRevocationDraft.reason.trim()}
                      onClick={handleRevokeReceiverTrustKey}
                    >
                      確認撤銷並寫入事件清冊
                    </button>
                    <button className="ghost" type="button" onClick={cancelReceiverTrustKeyRevocation}>取消</button>
                  </div>
                </div>
              )}
              <h4>金鑰生命週期事件清冊</h4>
              <p className="meta-line">
                登錄與撤銷事件依序串接指紋；此紀錄用於本機稽核，不代表外部時間戳或憑證機構背書。
              </p>
              {receiverTrustEvents.length ? (
                <>
                <p className="meta-line table-scroll-hint">窄螢幕可在表格內左右滑動，查看完整依據與事件指紋。</p>
                <div className="table-scroll-card">
                  <table className="data-table compact receiver-trust-event-table">
                    <thead><tr><th>時間／事件</th><th>Key ID</th><th>處理者／依據</th><th>事件指紋</th></tr></thead>
                    <tbody>
                      {[...receiverTrustEvents].reverse().map((event) => (
                        <tr key={event.eventFingerprint}>
                          <td>
                            <strong>{event.eventType === "key-revoked" ? "撤銷" : event.eventType === "rotation-completion-requested" ? "輪替申請" : "登錄"}</strong><br />
                            <span className="table-muted">{event.effectiveAt}</span><br />
                            <span className="table-muted">{receiverTrustEventReasonLabel(event.reasonCode)}</span>
                          </td>
                          <td>{event.keyId}</td>
                          <td>
                            {event.actor}{event.actorRole ? `｜${event.actorRole}` : ""}<br />
                            {event.actorId && <><span className="table-muted">登入帳號 ID：{event.actorId}</span><br /></>}
                            <span className="table-muted">{event.reason}</span>
                            {event.incidentReference && <><br /><span className="table-muted">依據：{event.incidentReference}</span></>}
                            {event.expiresAt && <><br /><span className="table-muted">覆核期限：{event.expiresAt}</span></>}
                            {event.approvalRequestFingerprint && <><br /><span className="table-muted">申請：{event.approvalRequestFingerprint}</span></>}
                          </td>
                          <td>{event.eventFingerprint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                <p className="empty-state">舊版清冊尚無生命週期事件；下一次登錄或撤銷後將開始建立串接紀錄。</p>
              )}
              <div className="receiver-trust-backup-card">
                <div>
                  <h4>信任清冊備份與復原</h4>
                  <p className="meta-line">
                    備份只包含受信任公鑰與生命週期事件，不含私鑰。匯入後會先驗證雙重指紋並顯示差異；核准復原時，系統會先保留目前清冊副本，再以備份完整取代本機清冊。
                  </p>
                </div>
                <div className="action-row">
                  <button className="ghost" type="button" disabled={!receiverCanAdministerKeys} onClick={handleDownloadReceiverTrustRegistryBackup}>
                    下載目前信任清冊備份
                  </button>
                  <label className="file-action secondary">
                    驗證／預覽清冊備份
                    <input
                      className="file-picker-input"
                      type="file"
                      accept="application/json,.json"
                      disabled={!receiverCanAdministerKeys}
                      onChange={handleImportReceiverTrustRegistryBackup}
                    />
                  </label>
                </div>
                {receiverTrustRestorePreview && receiverTrustBackup && (
                  <div className="receiver-trust-restore-preview">
                    <h4>復原預覽</h4>
                    <div className="meta-grid">
                      <MetaItem label="備份指紋" value={receiverTrustBackup.backupFingerprint} />
                      <MetaItem label="清冊指紋" value={receiverTrustBackup.registry.registryFingerprint} />
                      <MetaItem label="備份時間" value={receiverTrustBackup.exportedAt} />
                      <MetaItem
                        label="目前清冊"
                        value={receiverTrustRestorePreview.currentStatus === "valid"
                          ? "有效"
                          : receiverTrustRestorePreview.currentStatus === "missing"
                            ? "尚未建立"
                            : "無法讀取"}
                      />
                      <MetaItem
                        label="金鑰數"
                        value={`目前 ${receiverTrustRestorePreview.currentKeyCount}／備份 ${receiverTrustRestorePreview.backupKeyCount}`}
                      />
                      <MetaItem
                        label="事件數"
                        value={`目前 ${receiverTrustRestorePreview.currentEventCount}／備份 ${receiverTrustRestorePreview.backupEventCount}`}
                      />
                    </div>
                    {receiverTrustRestorePreview.currentError && (
                      <p className="meta-line attention-line">目前清冊無法讀取：{receiverTrustRestorePreview.currentError}</p>
                    )}
                    {receiverTrustRestorePreview.blockingReasons.length > 0 && (
                      <div className="receiver-receipt-result ng">
                        <strong>此備份不得復原</strong>
                        {receiverTrustRestorePreview.blockingReasons.map((reason) => <span key={reason}>{reason}</span>)}
                      </div>
                    )}
                    <div className="receiver-trust-diff-grid">
                      <div>
                        <strong>將新增的 Key ID</strong>
                        <p>{receiverTrustRestorePreview.addedKeyIds.length ? receiverTrustRestorePreview.addedKeyIds.join("、") : "無"}</p>
                      </div>
                      <div>
                        <strong>將移除的 Key ID</strong>
                        <p>{receiverTrustRestorePreview.removedKeyIds.length ? receiverTrustRestorePreview.removedKeyIds.join("、") : "無"}</p>
                      </div>
                      <div>
                        <strong>狀態變更</strong>
                        <p>
                          {receiverTrustRestorePreview.statusChanges.length
                            ? receiverTrustRestorePreview.statusChanges
                              .map((change) => `${change.keyId}：${change.currentStatus} → ${change.backupStatus}`)
                              .join("、")
                            : "無"}
                        </p>
                      </div>
                    </div>
                    {receiverTrustRestorePreview.wouldReplace && receiverTrustRestorePreview.restoreAllowed ? (
                      <>
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={receiverTrustRestoreConfirmed}
                            disabled={!receiverCanAdministerKeys}
                            onChange={(event) => setReceiverTrustRestoreConfirmed(event.target.checked)}
                          />
                          <span>我確認以此已驗證備份取代目前本機信任清冊；系統會先保留復原前副本。</span>
                        </label>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={!receiverCanAdministerKeys || !receiverTrustRestoreConfirmed}
                          onClick={handleRestoreReceiverTrustRegistryBackup}
                        >
                          確認復原已驗證備份
                        </button>
                      </>
                    ) : !receiverTrustRestorePreview.wouldReplace ? (
                      <p className="meta-line">備份內容與目前清冊相同，無需復原。</p>
                    ) : null}
                  </div>
                )}
                {receiverTrustRestoreOutcome && (
                  <div className="receiver-receipt-result ok">
                    <strong>信任清冊已完成復原</strong>
                    <span>{`復原後清冊指紋：${receiverTrustRestoreOutcome.registryFingerprint}`}</span>
                    <span>
                      {receiverTrustRestoreOutcome.safeguardPath
                        ? `復原前保護副本：${receiverTrustRestoreOutcome.safeguardPath}`
                        : "復原前尚無既有清冊，因此未建立保護副本。"}
                    </span>
                  </div>
                )}
              </div>
            </Panel>

            {receiverAssistantHandoff ? (
              <>
                <Panel title="ERH 交接摘要" subtitle="已通過 ERH／ERT 指紋與責任邊界驗證。">
                  <div className="meta-grid">
                    <MetaItem label="來源專案" value={receiverAssistantHandoff.source.projectName || "—"} />
                    <MetaItem label="計畫編號" value={receiverAssistantHandoff.source.projectNo || "—"} />
                    <MetaItem label="交接列數" value={String(receiverAssistantHandoff.transfers.length)} />
                    <MetaItem label="來源計算指紋" value={receiverAssistantHandoff.source.calculationFingerprint} />
                    <MetaItem label="ERH 指紋" value={receiverAssistantHandoff.handoffFingerprint} />
                    <MetaItem label="接收端狀態" value="待逐列登錄檢核結果" />
                  </div>
                </Panel>

                <Panel title="回簽單位與正式依據" subtitle="下列欄位會寫入 RVR；專案名稱或來源端設計者是否留空不影響回簽格式。">
                  <div className="form-grid">
                    <Field
                      label="回簽單位"
                      value={receiverAssistantAuthority.organization}
                      onChange={(value) => updateReceiverAssistantAuthority("organization", value)}
                    />
                    <Field
                      label="檢核人員"
                      value={receiverAssistantAuthority.verifierName}
                      onChange={(value) => updateReceiverAssistantAuthority("verifierName", value)}
                    />
                    <Field
                      label="人員職責"
                      value={receiverAssistantAuthority.verifierRole}
                      onChange={(value) => updateReceiverAssistantAuthority("verifierRole", value)}
                    />
                    <Field
                      label="正式檢核文件編號"
                      value={receiverAssistantAuthority.reportReference}
                      onChange={(value) => updateReceiverAssistantAuthority("reportReference", value)}
                    />
                  </div>
                </Panel>

                <Panel
                  title="受控補充證據範本庫"
                  subtitle="範本須經本機核准且在有效期限內才可套用；內容修訂會自動升版並撤銷既有核准。"
                >
                  <div className="action-row receiver-template-toolbar">
                    <button
                      className="secondary"
                      type="button"
                      disabled={!receiverEvidenceTemplates.length}
                      onClick={handleExportReceiverEvidenceTemplates}
                    >
                      匯出全部範本
                    </button>
                    <label className="file-action secondary">
                      匯入範本庫 JSON
                      <input
                        className="file-picker-input"
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => void handleImportReceiverEvidenceTemplates(event)}
                      />
                    </label>
                    <label className="file-action secondary">
                      匯入組織簽章包
                      <input
                        className="file-picker-input"
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => void handleImportSignedReceiverEvidenceTemplates(event)}
                      />
                    </label>
                  </div>
                  <p className="meta-line">
                    範本只保存在目前瀏覽器，也可匯出後移轉；一般 JSON 或組織簽章包匯入時，外部核准一律降級為待本機重新核准。組織簽章只驗證發布來源與封包完整性，不等於工程內容正確或本機核准。範本不會寫入 RVR，實際檔案仍由 RVR v5 與 SEV v2 逐檔核對。
                  </p>
                  {receiverEvidenceTemplateNotice && <p className="receiver-template-notice">{receiverEvidenceTemplateNotice}</p>}
                  {receiverEvidenceTemplates.length ? (
                    <div className="receiver-template-list">
                      {receiverEvidenceTemplates.map((template) => {
                        const label = receiverSupplementalCheckOptions.find((option) => option.value === template.checkId)?.label ?? template.checkId;
                        const availability = receiverEvidenceTemplateAvailability(template, localIsoDate());
                        const reviewDraft = receiverEvidenceTemplateReviewDrafts[template.templateId] ?? {
                          reviewedBy: availability.status === "expired" ? template.governance.reviewedBy : "",
                          validUntil: "",
                        };
                        return (
                          <article className="receiver-template-card" key={template.templateId}>
                            <div className="receiver-template-card-main">
                              <div className="receiver-template-card-heading">
                                <span>{label}</span>
                                <span className={`receiver-template-status ${availability.status}`}>
                                  {availability.status === "approved" ? "已核准" : availability.status === "expired" ? "已過期" : "待核准"}
                                </span>
                              </div>
                              <strong>{template.name}</strong>
                              <small>{`範本 v${template.governance.revision}｜${template.evidence.documentReference}｜${template.evidence.revision}｜${template.evidence.issuedDate}｜${template.evidence.pageReference}`}</small>
                              <small>{availability.reason}</small>
                              {template.governance.status === "approved" && (
                                <small>{`審核人：${template.governance.reviewedBy}｜核准：${fmtDateTime(template.governance.reviewedAt)}`}</small>
                              )}
                              {template.publisher && (
                                <div className={`receiver-template-publisher ${template.publisher.trustedAtImport ? "trusted" : "attention"}`}>
                                  <strong>{receiverTemplatePublisherStatusLabel(template.publisher.statusAtImport)}</strong>
                                  <span>{`${template.publisher.organization}｜${template.publisher.displayName}`}</span>
                                  <code>{template.publisher.keyId}</code>
                                  <small>{`封包 ${template.publisher.packageFingerprint}｜驗證：${fmtDateTime(template.publisher.verifiedAt)}`}</small>
                                  <small>此為匯入當下的來源驗證紀錄；金鑰狀態可能日後變更，本機核准仍是套用前必要關卡。</small>
                                </div>
                              )}
                              <details className="receiver-template-history">
                                <summary>{`修訂紀錄（${template.governance.changeLog.length}）`}</summary>
                                <ol>
                                  {[...template.governance.changeLog].reverse().map((entry) => (
                                    <li key={`${template.templateId}-${entry.revision}`}>
                                      <strong>{`v${entry.revision}`}</strong>
                                      <span>{entry.changedFields.join("、")}</span>
                                      <small>{fmtDateTime(entry.recordedAt)}</small>
                                    </li>
                                  ))}
                                </ol>
                              </details>
                            </div>
                            <div className="receiver-template-governance">
                              {!availability.usable && (
                                <div className="receiver-template-review-fields">
                                  <label className="field-block">
                                    <span>本機審核人</span>
                                    <input
                                      value={reviewDraft.reviewedBy}
                                      onChange={(event) => updateReceiverEvidenceTemplateReviewDraft(
                                        template.templateId,
                                        "reviewedBy",
                                        event.target.value,
                                        availability.status === "expired" ? template.governance.reviewedBy : "",
                                      )}
                                    />
                                  </label>
                                  <label className="field-block">
                                    <span>有效期限</span>
                                    <input
                                      type="date"
                                      min={localIsoDate()}
                                      value={reviewDraft.validUntil}
                                      onChange={(event) => updateReceiverEvidenceTemplateReviewDraft(
                                        template.templateId,
                                        "validUntil",
                                        event.target.value,
                                        availability.status === "expired" ? template.governance.reviewedBy : "",
                                      )}
                                    />
                                  </label>
                                </div>
                              )}
                              <div className="action-row">
                                {availability.usable ? (
                                  <button className="ghost" type="button" onClick={() => handleRevokeReceiverEvidenceTemplateApproval(template.templateId)}>
                                    撤銷核准
                                  </button>
                                ) : (
                                  <button
                                    className="secondary"
                                    type="button"
                                    disabled={!reviewDraft.reviewedBy.trim() || !reviewDraft.validUntil}
                                    onClick={() => handleApproveReceiverEvidenceTemplate(template.templateId)}
                                  >
                                    {availability.status === "expired" ? "重新核准" : "核准此範本"}
                                  </button>
                                )}
                                <button
                                  className="secondary"
                                  type="button"
                                  disabled={!availability.usable}
                                  onClick={() => handleApplyReceiverEvidenceTemplateToAll(template.templateId)}
                                >
                                  套用至全部同類列
                                </button>
                                <button className="ghost" type="button" onClick={() => handleDeleteReceiverEvidenceTemplate(template.templateId)}>
                                  刪除
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-state">尚無範本。先在下方將某類查核標示為通過、填妥依據與文件資料，再建立待核准範本。</p>
                  )}
                </Panel>

                <Panel title="逐列承接構造結果" subtitle="每一個 ERT 必須且只能回簽一次；利用率與結果由後端自動判定，核定承載力須逐列連結正式文件與 SHA-256。">
                  <div className="receiver-result-list">
                    {receiverAssistantResults.map((result, index) => {
                      const transfer = receiverAssistantHandoff.transfers[index];
                      return (
                        <article className="receiver-result-card" key={result.transferId}>
                          <header className="receiver-result-head">
                            <div>
                              <span>{`交接列 ${index + 1}`}</span>
                              <strong>{handoffSourceMemberLabel(transfer)}</strong>
                            </div>
                            <code>{result.transferId}</code>
                          </header>
                          <div className="receiver-source-summary">
                            <span>{`承接設計需求：${fmt(handoffDesignDemandTf(transfer), " tf")}`}</span>
                            <span>{`原指定承接對象：${transfer.receiver.target || "待接收端明確指定"}`}</span>
                            <span>{`傳力方向：${transfer.receiver.direction || "舊版交接檔未記錄"}`}</span>
                            <span>{`處置依據：${transfer.receiver.dispositionBasis || "—"}`}</span>
                          </div>
                          {transfer.receiver.mode === "reshore" && reshoreCapacityDrafts[result.transferId] && (() => {
                            const draft = reshoreCapacityDrafts[result.transferId];
                            const calculation = reshoreCapacityCalculations[result.transferId]?.calculation;
                            return (
                              <section className="reshore-capacity-panel">
                                <header>
                                  <div>
                                    <strong>重撐／回撐 H 型鋼純軸壓容量</strong>
                                    <span>限無偏心軸壓構件；本區不檢核接頭、承壓、基礎／樓版或施工程序。</span>
                                  </div>
                                  <span className="status-badge">特定承接實算</span>
                                </header>
                                <div className="form-grid receiver-result-fields">
                                  <label className="field-block">
                                    <span>H 型鋼斷面</span>
                                    <select
                                      value={draft.section_name}
                                      onChange={(event) => updateReshoreCapacityDraft(result.transferId, "section_name", event.target.value)}
                                    >
                                      {(bootstrap?.reference_data.sections ?? []).map((section) => (
                                        <option key={section.name} value={section.name}>{section.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <NumberField
                                    label="共同承接支數"
                                    value={draft.member_count}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "member_count", value)}
                                  />
                                  <NumberField
                                    label="X 向未側撐長度（m）"
                                    value={draft.unbraced_length_x_m}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "unbraced_length_x_m", value)}
                                  />
                                  <NumberField
                                    label="Y 向未側撐長度（m）"
                                    value={draft.unbraced_length_y_m}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "unbraced_length_y_m", value)}
                                  />
                                  <NumberField
                                    label="X 向有效長度係數 Kx"
                                    value={draft.effective_length_factor_kx}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "effective_length_factor_kx", value)}
                                  />
                                  <NumberField
                                    label="Y 向有效長度係數 Ky"
                                    value={draft.effective_length_factor_ky}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "effective_length_factor_ky", value)}
                                  />
                                  <NumberField
                                    label="材料降伏強度 Fy（tf/cm²）"
                                    value={draft.fy_tf_per_cm2}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "fy_tf_per_cm2", value)}
                                  />
                                  <NumberField
                                    label="彈性模數 E（tf/cm²）"
                                    value={draft.e_tf_per_cm2}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "e_tf_per_cm2", value)}
                                  />
                                  <label className="field-block">
                                    <span>容許應力提高係數</span>
                                    <select
                                      value={draft.allowable_stress_increase_factor}
                                      onChange={(event) => updateReshoreCapacityDraft(result.transferId, "allowable_stress_increase_factor", event.target.value)}
                                    >
                                      <option value={1}>1.00</option>
                                      <option value={1.25}>1.25（須填依據）</option>
                                    </select>
                                  </label>
                                  <NumberField
                                    label="支數不均勻係數"
                                    value={draft.imbalance_factor}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "imbalance_factor", value)}
                                  />
                                  <NumberField
                                    label="另加單支軸力（tf）"
                                    value={draft.additional_axial_load_tf_per_member}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "additional_axial_load_tf_per_member", value)}
                                  />
                                  <Field
                                    label="控制載重組合"
                                    value={draft.governing_load_combination}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "governing_load_combination", value)}
                                  />
                                  <TextAreaField
                                    label="有效長度 K 與側向支撐依據"
                                    value={draft.effective_length_basis}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "effective_length_basis", value)}
                                  />
                                  <TextAreaField
                                    label="共同支數、傳力方向與分配依據"
                                    value={draft.load_distribution_basis}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "load_distribution_basis", value)}
                                  />
                                  <TextAreaField
                                    label="另加軸力來源（另加值大於 0 時必填）"
                                    value={draft.additional_load_basis}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "additional_load_basis", value)}
                                  />
                                  <TextAreaField
                                    label="1.25 提高係數依據（採 1.25 時必填）"
                                    value={draft.stress_increase_basis}
                                    onChange={(value) => updateReshoreCapacityDraft(result.transferId, "stress_increase_basis", value)}
                                  />
                                </div>
                                <label className="check-field reshore-applicability-check">
                                  <input
                                    type="checkbox"
                                    checked={draft.pure_axial_no_eccentricity_confirmed}
                                    onChange={(event) => updateReshoreCapacityDraft(
                                      result.transferId,
                                      "pure_axial_no_eccentricity_confirmed",
                                      event.target.checked,
                                    )}
                                  />
                                  <span>確認本構件為無偏心純軸壓；若有偏心、彎矩或二次效應，不採用此模組。</span>
                                </label>
                                <div className="action-row">
                                  <button type="button" onClick={() => void handleCalculateReshoreMemberCapacity(index)}>
                                    計算、下載證據並回填軸壓結果
                                  </button>
                                </div>
                                {calculation && (
                                  <div className={`reshore-capacity-result ${calculation.results.status === "passed" ? "ok" : "ng"}`}>
                                    <strong>{calculation.results.status === "passed" ? "純軸壓與穩定檢核通過" : "純軸壓或穩定適用性未通過"}</strong>
                                    <span>{`控制軸：${calculation.results.controllingAxis}；KL/r = ${fmt(calculation.results.klrMax)}；單支容量 = ${fmt(calculation.results.perMemberCapacityTf, " tf")}`}</span>
                                    <span>{`可採用移轉容量 = ${fmt(calculation.results.adoptableTransferCapacityTf, " tf")}；利用率 = ${calculation.results.capacityUtilizationRatio == null ? "—" : fmt(calculation.results.capacityUtilizationRatio)}`}</span>
                                    <span>軸壓證據已下載並回填；其他未涵蓋查核仍維持「尚未完成」。若要整列通過，須在五類補充查核中逐項附上正式文件，RSC 不會被當成其他查核的證據。</span>
                                  </div>
                                )}
                              </section>
                            );
                          })()}
                          <div className="form-grid receiver-result-fields">
                            <div className="field-block">
                              <span>接收端結果（自動）</span>
                              <strong>
                                {(result.verifiedCapacityTf ?? 0) <= 0
                                  ? "待輸入核定承載力"
                                  : result.status === "passed" ? "通過" : "未通過"}
                              </strong>
                            </div>
                            <Field
                              label="實際承接構造識別"
                              value={result.receiverTarget}
                              onChange={(value) => updateReceiverAssistantResult(index, "receiverTarget", value)}
                            />
                            <NumberField
                              label="接收端採用需求值（tf）"
                              value={result.adoptedDemandTf}
                              onChange={(value) => updateReceiverAssistantResult(index, "adoptedDemandTf", value)}
                            />
                            <NumberField
                              label="核定承載力（tf）"
                              value={result.verifiedCapacityTf ?? 0}
                              onChange={(value) => updateReceiverAssistantResult(index, "verifiedCapacityTf", value)}
                            />
                            <div className="field-block">
                              <span>容量利用率（需求／承載力，自動）</span>
                              <strong>{result.capacityUtilizationRatio > 0 ? fmt(result.capacityUtilizationRatio) : "—"}</strong>
                            </div>
                            <Field
                              label="正式分析模型／計算書識別"
                              value={result.verificationScope?.analysisModelReference ?? ""}
                              onChange={(value) => updateReceiverAssistantVerificationScope(index, "analysisModelReference", value)}
                            />
                            <Field
                              label="控制載重組合"
                              value={result.verificationScope?.governingLoadCombination ?? ""}
                              onChange={(value) => updateReceiverAssistantVerificationScope(index, "governingLoadCombination", value)}
                            />
                            <TextAreaField
                              label="傳力方向與分配依據"
                              value={result.verificationScope?.directionAndDistributionBasis ?? ""}
                              onChange={(value) => updateReceiverAssistantVerificationScope(index, "directionAndDistributionBasis", value)}
                            />
                            <TextAreaField
                              label="偏心與二次效應依據"
                              value={result.verificationScope?.eccentricityAndSecondaryEffectBasis ?? ""}
                              onChange={(value) => updateReceiverAssistantVerificationScope(index, "eccentricityAndSecondaryEffectBasis", value)}
                            />
                            <fieldset className="field-block receiver-limit-state-fieldset">
                              <legend>已完成檢核的極限狀態（至少一項）</legend>
                              <div className="receiver-limit-state-grid">
                                {receiverLimitStateOptions.map((option) => (
                                  <label className="check-field" key={option.value}>
                                    <input
                                      type="checkbox"
                                      checked={result.verificationScope?.checkedLimitStates.includes(option.value) ?? false}
                                      onChange={() => toggleReceiverAssistantLimitState(index, option.value)}
                                    />
                                    <span>{option.label}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <div className="field-block">
                              <span>五類補充查核彙整（自動）</span>
                              <strong>{result.verificationScope?.otherChecksStatus === "passed" ? "全部通過／不適用" : "含未通過／尚未完成"}</strong>
                              <small>此欄由下方五類查核自動推導，不能手動覆寫。</small>
                            </div>
                            <Field
                              label="承載力文件編號"
                              value={result.capacityEvidence?.documentReference ?? ""}
                              onChange={(value) => updateReceiverAssistantCapacityEvidence(index, "documentReference", value)}
                            />
                            <Field
                              label="文件版次"
                              value={result.capacityEvidence?.revision ?? ""}
                              onChange={(value) => updateReceiverAssistantCapacityEvidence(index, "revision", value)}
                            />
                            <label className="field-block">
                              <span>文件日期</span>
                              <input
                                type="date"
                                value={result.capacityEvidence?.issuedDate ?? ""}
                                onChange={(event) => updateReceiverAssistantCapacityEvidence(index, "issuedDate", event.target.value)}
                              />
                            </label>
                            <Field
                              label="頁碼／章節"
                              value={result.capacityEvidence?.pageReference ?? ""}
                              onChange={(value) => updateReceiverAssistantCapacityEvidence(index, "pageReference", value)}
                            />
                            <Field
                              label="證據檔名"
                              value={result.capacityEvidence?.fileName ?? ""}
                              onChange={(value) => updateReceiverAssistantCapacityEvidence(index, "fileName", value)}
                            />
                            <Field
                              label="證據檔 SHA-256"
                              value={result.capacityEvidence?.fileSha256 ?? ""}
                              onChange={(value) => updateReceiverAssistantCapacityEvidence(index, "fileSha256", value)}
                            />
                            <label className="field-block">
                              <span>由本機檔案自動帶入檔名與 SHA-256</span>
                              <input
                                type="file"
                                onChange={(event) => void handleReceiverCapacityEvidenceFile(index, event)}
                              />
                              <small>檔案只在瀏覽器本機計算雜湊，不會上傳或嵌入 RVR。</small>
                            </label>
                            <section className="receiver-supplemental-checks">
                              <h4>五類補充查核與文件證據</h4>
                              <p className="meta-line">每類均須明列通過、未通過或不適用及其依據；標示通過時必須選取實際證據檔並完成文件資料。</p>
                              {(result.supplementalChecks ?? emptySupplementalChecks()).map((check) => {
                                const label = receiverSupplementalCheckOptions.find((option) => option.value === check.checkId)?.label ?? check.checkId;
                                const matchingTemplates = receiverEvidenceTemplates.filter((template) => template.checkId === check.checkId);
                                const usableTemplates = matchingTemplates.filter((template) => receiverEvidenceTemplateAvailability(template, localIsoDate()).usable);
                                return (
                                  <article className="receiver-result-card" key={`${result.transferId}-${check.checkId}`}>
                                    <div className="form-grid">
                                      <label className="field-block">
                                        <span>{label}</span>
                                        <select
                                          value={check.status}
                                          onChange={(event) => updateReceiverSupplementalCheck(index, check.checkId, "status", event.target.value)}
                                        >
                                          <option value="failed">未通過／尚未完成</option>
                                          <option value="passed">通過</option>
                                          <option value="not-applicable">不適用</option>
                                        </select>
                                      </label>
                                      <TextAreaField
                                        label={`${label}查核依據`}
                                        value={check.basis}
                                        onChange={(value) => updateReceiverSupplementalCheck(index, check.checkId, "basis", value)}
                                      />
                                      <label className="field-block receiver-template-picker">
                                        <span>套用本機範本</span>
                                        <select
                                          value=""
                                          disabled={!usableTemplates.length}
                                          onChange={(event) => handleApplyReceiverEvidenceTemplate(index, check.checkId, event.target.value)}
                                        >
                                          <option value="">
                                            {usableTemplates.length ? "選擇已核准範本…" : matchingTemplates.length ? "此類範本尚未核准或已過期" : "尚無此類範本"}
                                          </option>
                                          {matchingTemplates.map((template) => {
                                            const availability = receiverEvidenceTemplateAvailability(template, localIsoDate());
                                            return (
                                              <option value={template.templateId} key={template.templateId} disabled={!availability.usable}>
                                                {`${template.name}｜v${template.governance.revision}｜${availability.reason}`}
                                              </option>
                                            );
                                          })}
                                        </select>
                                        <small>只有本機已核准且未過期的範本可用；套用只帶入查核依據及文件受控欄位。</small>
                                      </label>
                                      <div className="field-block receiver-template-save">
                                        <span>重用目前資料</span>
                                        <button
                                          className="secondary"
                                          type="button"
                                          disabled={!receiverEvidenceTemplateDraftComplete(check)}
                                          onClick={() => handleSaveReceiverEvidenceTemplate(index, check.checkId)}
                                        >
                                          儲存為範本／新修訂
                                        </button>
                                        <small>內容有變更時自動升版並撤銷核准；檔名及 SHA-256 永不存入。</small>
                                      </div>
                                      {check.status === "passed" && (
                                        <>
                                          <Field label="文件編號" value={check.evidence?.documentReference ?? ""} onChange={(value) => updateReceiverSupplementalEvidence(index, check.checkId, "documentReference", value)} />
                                          <Field label="文件版次" value={check.evidence?.revision ?? ""} onChange={(value) => updateReceiverSupplementalEvidence(index, check.checkId, "revision", value)} />
                                          <label className="field-block">
                                            <span>文件日期</span>
                                            <input type="date" value={check.evidence?.issuedDate ?? ""} onChange={(event) => updateReceiverSupplementalEvidence(index, check.checkId, "issuedDate", event.target.value)} />
                                          </label>
                                          <Field label="頁碼／章節" value={check.evidence?.pageReference ?? ""} onChange={(value) => updateReceiverSupplementalEvidence(index, check.checkId, "pageReference", value)} />
                                          <Field label="證據檔名" value={check.evidence?.fileName ?? ""} onChange={(value) => updateReceiverSupplementalEvidence(index, check.checkId, "fileName", value)} />
                                          <Field label="證據檔 SHA-256" value={check.evidence?.fileSha256 ?? ""} onChange={(value) => updateReceiverSupplementalEvidence(index, check.checkId, "fileSha256", value)} />
                                          <label className="field-block">
                                            <span>由本機檔案帶入檔名與 SHA-256</span>
                                            <input type="file" onChange={(event) => void handleReceiverSupplementalEvidenceFile(index, check.checkId, event)} />
                                            <small>檔案只在本機計算雜湊；不會上傳或嵌入 RVR。</small>
                                          </label>
                                        </>
                                      )}
                                    </div>
                                  </article>
                                );
                              })}
                            </section>
                            <TextAreaField
                              label="接收端檢核依據"
                              value={result.verificationBasis}
                              onChange={(value) => updateReceiverAssistantResult(index, "verificationBasis", value)}
                            />
                            <TextAreaField
                              label="逐列檢核結論"
                              value={result.conclusion}
                              onChange={(value) => updateReceiverAssistantResult(index, "conclusion", value)}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="確認與輸出 RVR" subtitle="兩項確認只代表建立回簽的前提已具備，不是電子簽章或來源端正式核可。">
                  <div className="receiver-confirmation-list">
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={receiverCalculationConfirmed}
                        onChange={(event) => {
                          setReceiverCalculationConfirmed(event.target.checked);
                          setReceiverAssistantReceipt(null);
                        }}
                      />
                      <span>我確認每一列已記錄正式模型、控制載重組合、傳力與分配、偏心／二次效應、已檢核極限狀態及五類補充查核，且內容與正式檢核文件一致。</span>
                    </label>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={receiverIdentityAcknowledged}
                        onChange={(event) => {
                          setReceiverIdentityAcknowledged(event.target.checked);
                          setReceiverAssistantReceipt(null);
                        }}
                      />
                      <span>我了解 RVR 指紋不驗證人員身分，來源端仍須核對回簽單位、人員與正式文件。</span>
                    </label>
                  </div>
                  <div className="action-row">
                    <button
                      className="primary"
                      type="button"
                      disabled={!receiverAssistantReady}
                      onClick={handleBuildReceiverAssistantReceipt}
                    >
                      產生並下載 RVR 回簽 JSON
                    </button>
                  </div>
                  {!receiverAssistantReady && (
                    <p className="meta-line">請完成回簽單位、每筆採用需求、核定承載力、文件證據、檢核依據、結論及兩項確認；結果與利用率會由後端自動判定。</p>
                  )}
                  {receiverAssistantReceipt && (
                    <div className={`receiver-receipt-result ${receiverAssistantReceipt.summary.status === "passed" && receiverAssistantIdentityVerification?.status !== "valid-signature-revoked-key" && receiverAssistantIdentityVerification?.status !== "valid-signature-organization-mismatch" ? "ok" : "ng"}`}>
                      <strong>
                        {receiverAssistantReceipt.summary.status === "passed"
                          ? receiverAssistantIdentityVerification?.trusted
                            ? "RVR 已驗證：接收端結果通過／受信任簽章通過"
                            : receiverAssistantIdentityVerification?.status === "valid-signature-revoked-key"
                              ? "RVR 身分驗證未通過：簽章公鑰已撤銷"
                              : receiverAssistantIdentityVerification?.status === "valid-signature-organization-mismatch"
                                ? "RVR 身分驗證未通過：簽章單位與登錄單位不符"
                                : receiverAssistantIdentityVerification?.cryptographicValid
                              ? "RVR 已驗證：接收端結果通過／簽章有效但公鑰尚未信任"
                              : "RVR 已建立：接收端結果通過／回簽人身分待核對"
                          : "RVR 已建立：接收端結果包含未通過項目"}
                      </strong>
                      <span>
                        {receiverAssistantReceipt.schemaVersion === 5
                          ? "RVR v5：已逐列記錄五類補充查核的狀態、依據及證據檔 SHA-256；彙整狀態由後端自動推導。"
                          : receiverAssistantReceipt.schemaVersion === 4
                          ? "舊版 RVR v4：已逐列記錄正式模型、控制組合、傳力與偏心依據、極限狀態及其他檢核結果，但補充查核尚未逐檔結構化。"
                          : receiverAssistantReceipt.schemaVersion === 3
                          ? "舊版 RVR v3：需求／承載力閉環已逐列連結正式文件資料與 SHA-256，但尚未結構化記錄完整驗算範圍。"
                          : receiverAssistantReceipt.schemaVersion === 2
                            ? "舊版 RVR v2：需求／核定承載力已閉環，但尚未強制逐列文件 SHA-256。"
                            : "舊版 RVR v1：容量利用率為接收端外部登錄值，未形成需求／承載力自動閉環。"}
                      </span>
                      <span>{`RVR 指紋：${receiverAssistantReceipt.receiptFingerprint}`}</span>
                      <span>{`通過 ${receiverAssistantReceipt.summary.passed}／未通過 ${receiverAssistantReceipt.summary.failed}`}</span>
                      {receiverAssistantIdentityVerification && <span>{receiverAssistantIdentityVerification.message}</span>}
                    </div>
                  )}
                  {receiverAssistantReceipt && (
                    <div className="report-mode-card">
                      <strong>選用：由接收單位離線完成 RVR 身分簽署</strong>
                      <span>先下載 RSR 簽署請求；接收單位以既有 Ed25519 私鑰執行離線簽署程式，再將簽章回應匯回。本網頁不會接觸私人金鑰。</span>
                      <div className="action-row">
                        <button
                          className="secondary"
                          type="button"
                          disabled={Boolean(receiverAssistantReceipt.identitySignature)}
                          onClick={handleDownloadReceiverIdentitySigningRequest}
                        >
                          下載離線身分簽署請求
                        </button>
                        <label className="file-action secondary">
                          匯入離線簽章回應
                          <input
                            className="file-picker-input"
                            type="file"
                            accept=".json,application/json"
                            onChange={handleAttachReceiverIdentitySignature}
                          />
                        </label>
                      </div>
                      {receiverAssistantReceipt.identitySignature && (
                        <span>{`目前已附簽章：${receiverAssistantReceipt.identitySignature.keyId}`}</span>
                      )}
                    </div>
                  )}
                </Panel>
              </>
            ) : (
              <Panel title="尚未載入 ERH" subtitle="請先取得來源端匯出的拆撐承接構造交接 JSON。">
                <p className="empty-state">匯入後會先驗證 ERH 與每一筆 ERT 指紋，再展開接收端逐列表單。</p>
              </Panel>
            )}
          </section>
        )}
        {showScrollTop && (
          <button className="primary floating-top-button" type="button" onClick={scrollToTop}>
            回到頁首
          </button>
        )}
      </main>
    </div>
  );
}

function Panel(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="panel-title">{props.title}</p>
          {props.subtitle && <p className="panel-subtitle">{props.subtitle}</p>}
        </div>
      </header>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; value: string | number; onChange: (value: string) => void }) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-block text-area-field">
      <span>{props.label}</span>
      <textarea rows={3} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input type="number" step="any" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function OptionalNumberField(props: {
  label: string;
  value: number | null | undefined;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input
        type="number"
        step="any"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function SectionSelectInput(props: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const options = props.value && !props.options.includes(props.value)
    ? [props.value, ...props.options]
    : props.options;
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
      <option value="">{props.placeholder ?? "請選擇型號"}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function MetaItem(props: { label: string; value: string }) {
  return (
    <div className="meta-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function CollapsedModuleHint(props: { text: string }) {
  return <p className="collapsed-module-hint">{props.text}</p>;
}

function ModuleCollapsedCard(props: { title: string; description: string; onEnable: () => void }) {
  return (
    <div className="module-collapsed-card">
      <div className="module-collapsed-copy">
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
      <button className="secondary" type="button" onClick={props.onEnable}>
        納入檢討
      </button>
    </div>
  );
}

function AnalysisSourceCard(props: {
  title: string;
  subtitle?: string;
  sideLabel: string;
  mode: AnalysisSourceMode;
  source: AnalysisSideSource;
  sectionOptions: string[];
  importedStruts: ImportedStrutRow[];
  ignoredEvents: ImportedIgnoredEventRow[];
  importSummary: ImportSummary;
  importedAssignments: ImportedAssignment[];
  manualRows: SupportRow[];
  showModeSelector?: boolean;
  onModeChange: (mode: AnalysisSourceMode) => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onUpdateImportEventClassification: (
    eventIndex: number,
    classification: AnalysisEvent["classification"],
  ) => void;
  onApplyAssignments: () => void;
  onAddManualRow: () => void;
  onRemoveManualRow: (index: number) => void;
  onChangeManualRow: (index: number, field: keyof SupportRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
  onGotoDesign: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const analysis = props.source.import_result;
  const importedCount = props.importedStruts.length;
  const summary = props.importSummary;
  const stageRows = buildStageImportRows(analysis);
  const currentFileName = analysis.source_name || pendingFileName || "尚未選擇檔案";
  const completion = analysisSourceCompletion(
    props.mode,
    props.source,
    props.manualRows,
    props.importedAssignments,
    summary,
  );
  const completionTone = analysisSourceTone(props.mode, completion);

  function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setPendingFileName(file.name);
    }
    props.onImport(event);
  }

  return (
    <Panel
      title={props.title}
      subtitle={props.subtitle ?? `${props.sideLabel}可各自選擇匯入分析檔、手動輸入或暫不使用。`}
    >
      <div className="source-mode-row">
        {props.showModeSelector ? (
          <label className="field-block source-mode-field">
            <span>來源方式</span>
            <select
              value={props.mode}
              onChange={(event) => props.onModeChange(event.target.value as AnalysisSourceMode)}
            >
              <option value="import">匯入分析檔</option>
              <option value="manual">手動輸入</option>
              <option value="unused">不使用</option>
            </select>
          </label>
        ) : (
          <div className="workflow-locked-mode">
            <span>本側模式</span>
            <strong>{analysisSourceModeLabel(props.mode)}</strong>
          </div>
        )}
        <div className="pill-row">
          <span className={`pill ${completionTone}`}>資料狀態：{completion}</span>
          <span className="pill">
            {props.mode === "import"
              ? `可套用候選列 ${summary.candidateCount} 筆`
              : props.mode === "manual"
                ? `目前手動列數 ${props.manualRows.length} 筆`
                : "本側不納入"}
          </span>
        </div>
      </div>

      {props.mode === "import" && (
        <>
          <div className="upload-row">
            <input
              ref={fileInputRef}
              className="file-picker-input"
              type="file"
              accept=".lst,.LST,.rio,.RIO,.o,.O,.txt,.TXT"
              onChange={handleFilePick}
            />
            <button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>
              選擇匯入檔案
            </button>
            <span className="upload-file-name">{currentFileName}</span>
            <button className="secondary" onClick={props.onApplyAssignments}>
              依目前分類重建本側草稿
            </button>
            <button className="secondary" onClick={props.onGotoDesign}>
              前往支撐頁選型號
            </button>
          </div>
          <p className="meta-line">選定檔案後會立即開始匯入並更新下方摘要，不需再按第二次確認。</p>
          <div className="meta-grid">
            <MetaItem label="來源檔名" value={analysis.source_name || "—"} />
            <MetaItem label="來源格式" value={analysis.source_type || "—"} />
            <MetaItem label="標題" value={analysis.project_title || "—"} />
            <MetaItem label="開挖深度" value={fmt(analysis.excavation_depth_m, "m")} />
            <MetaItem label="地下水位" value={fmt(analysis.ground_water_level_m, "m")} />
            <MetaItem label="牆體 EI" value={fmt(analysis.wall_ei_tf_m2_per_m)} />
          </div>
          <div className="info-card">
            <p className="info-title">{props.sideLabel}分析匯入提醒</p>
            <p className="info-body">
              單向分析檔只代表這一側的荷重來源。系統會先把 {props.sideLabel} 的支撐、樓版、拆撐事件分流整理；真正可套用的只有水平支撐 / 斜撐候選，另一側資料不會被覆蓋，橫擋、大角撐與型號仍於後續步驟人工決定。
            </p>
          </div>
          <div className="meta-grid">
            <MetaItem label="水平支撐候選" value={String(summary.supportCount)} />
            <MetaItem label="斜撐候選" value={String(summary.braceCount)} />
            <MetaItem label="忽略樓版" value={String(summary.floorCount)} />
            <MetaItem label="拆撐事件" value={String(summary.removeCount)} />
            <MetaItem label="待人工判讀" value={String(summary.otherCount)} />
            <MetaItem label="可套用候選列" value={String(summary.candidateCount)} />
          </div>
          {analysis.warnings.length > 0 && (
            <ul className="warning-list">
              {analysis.warnings.map((warning) => (
                <li key={`${props.sideLabel}-${warning}`}>{warning}</li>
              ))}
            </ul>
          )}
          {stageRows.length > 0 && (
            <div className="table-scroll table-scroll-card">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>階段</th>
                    <th>開挖深度 (m)</th>
                    <th>水位 (m)</th>
                    <th>候選事件</th>
                    <th>忽略事件</th>
                  </tr>
                </thead>
                <tbody>
                  {stageRows.map((stage) => (
                    <tr key={`${props.sideLabel}-${stage.index}`}>
                      <td>{stage.label}</td>
                      <td>{fmt(stage.excavation_depth_m)}</td>
                      <td>{fmt(stage.water_level_m)}</td>
                      <td>{stage.candidateCount}</td>
                      <td>{stage.ignoredCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {analysis.events.length > 0 && (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">事件清單微調：改完分類後，可直接重建本側草稿。</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>BUT No.</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>角度 (deg)</th>
                      <th>荷重 (tf)</th>
                      <th>目前分類</th>
                      <th>說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.events.map((event, index) => (
                      <tr key={`${props.sideLabel}-event-${index}`}>
                        <td>{event.stage_label}</td>
                        <td>{event.butt_no ?? "—"}</td>
                        <td>{fmt(event.depth_m)}</td>
                        <td>{fmt(event.span_m)}</td>
                        <td>{fmt(event.angle_deg)}</td>
                        <td>{fmt(event.load_t)}</td>
                        <td>
                          <select
                            value={event.classification}
                            onChange={(selectEvent) =>
                              props.onUpdateImportEventClassification(
                                index,
                                selectEvent.target.value as AnalysisEvent["classification"],
                              )
                            }
                          >
                            <option value="support">水平支撐</option>
                            <option value="brace">斜撐</option>
                            <option value="floor">樓版 / 樓層</option>
                            <option value="remove">拆撐事件</option>
                            <option value="other">其他 / 忽略</option>
                          </select>
                        </td>
                        <td>{event.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {importedCount > 0 ? (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">已辨識可套用候選事件：{importedCount} 筆</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>支撐序號</th>
                      <th>類型</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>角度 (deg)</th>
                      <th>荷重 (tf)</th>
                      <th>建議形式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.importedStruts.map((strut) => (
                      <tr key={`${props.sideLabel}-${strut.stageIndex}-${strut.index}`}>
                        <td>{strut.stageLabel}</td>
                        <td>{strut.index}</td>
                        <td>{candidateKindLabel(strut.classification)}</td>
                        <td>{fmt(strut.depth_m)}</td>
                        <td>{fmt(strut.span_m)}</td>
                        <td>{fmt(strut.angle_deg)}</td>
                        <td>{fmt(strut.load_t)}</td>
                        <td>{suggestedSupportType(strut.angle_deg, strut.classification)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-actions">
                <span className="meta-line">候選列建議：{props.importedAssignments.length} 筆</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>候選形式</th>
                      <th>層別</th>
                      <th>深度 (m)</th>
                      <th>角度 (deg)</th>
                      <th>控制荷重 (tf)</th>
                      <th>來源階段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.importedAssignments.map((item) => (
                      <tr key={`${props.sideLabel}-${item.id}`}>
                        <td>{candidateKindLabel(item.kind)}</td>
                        <td>{item.levelLabel}</td>
                        <td>{fmt(item.depth_m)}</td>
                        <td>{fmt(item.angle_deg)}</td>
                        <td>{fmt(item.load_t)}</td>
                        <td>{item.stageLabels.join("、")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="empty-state">尚未辨識到可直接轉成支撐候選列的資料，必要時可切換成手動輸入。</p>
          )}
          {props.ignoredEvents.length > 0 && (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">
                  已辨識但不直接套用的事件：{props.ignoredEvents.length} 筆
                </span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>事件類型</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>荷重 (tf)</th>
                      <th>事件說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.ignoredEvents.map((event, index) => (
                      <tr key={`${props.sideLabel}-${event.stageIndex}-${event.classification}-${index}`}>
                        <td>{event.stageLabel}</td>
                        <td>{ignoredEventLabel(event.classification)}</td>
                        <td>{fmt(event.depth_m)}</td>
                        <td>{fmt(event.span_m)}</td>
                        <td>{fmt(event.load_t)}</td>
                        <td>{event.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {props.mode === "manual" && (
        <div className="panel-stack-tight">
          <div className="info-card">
            <p className="info-title">{props.sideLabel}手動輸入</p>
            <p className="info-body">
              這裡可先輸入支數、軸力、溫度力、間距與支撐型號；橫擋跨度、斜撐幾何與大角撐長度等設計資訊，留到「構件輸入」步驟再補齊。溫度力預設為第 1 層 30 tf，其餘各層 15 tf，仍可再手動修改。
            </p>
          </div>
          <ManualSupportLoadTable
            sideLabel={props.sideLabel}
            sectionOptions={props.sectionOptions}
            rows={props.manualRows}
            onAdd={props.onAddManualRow}
            onRemove={props.onRemoveManualRow}
            onChange={props.onChangeManualRow}
            onApplySectionToAll={props.onApplySectionToAll}
          />
        </div>
      )}

      {props.mode === "unused" && (
        <p className="empty-state">
          本側暫不納入分析來源與支撐檢討。既有資料會先保留，不會自動刪除；若後續需要檢討，再切回匯入分析檔或手動輸入即可。
        </p>
      )}
    </Panel>
  );
}

function ManualSupportLoadTable(props: {
  sideLabel: string;
  sectionOptions: string[];
  rows: SupportRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof SupportRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isSupportRowComplete);
  return (
    <>
      <div className="table-actions">
        <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
        <button className="secondary" onClick={props.onAdd}>
          新增{props.sideLabel}列
        </button>
      </div>
      <div className="table-scroll table-scroll-card">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>層別</th>
              <th>支數</th>
              <th>型號</th>
              <th>軸力 (tf)</th>
              <th>溫度力 (tf)</th>
              <th>間距 (m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.sideLabel}-${index}`}>
                <td><input value={row.level_label} onChange={(event) => props.onChange(index, "level_label", event.target.value)} /></td>
                <td><input type="number" step="1" value={row.support_count} onChange={(event) => props.onChange(index, "support_count", event.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇支撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.axial_force_t} onChange={(event) => props.onChange(index, "axial_force_t", event.target.value)} /></td>
                <td><input type="number" step="any" value={row.temp_force_t} onChange={(event) => props.onChange(index, "temp_force_t", event.target.value)} /></td>
                <td><input type="number" step="any" value={row.spacing_m} onChange={(event) => props.onChange(index, "spacing_m", event.target.value)} /></td>
                <td><button className="ghost" onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.rows.length === 0 && <p className="empty-state">尚未建立任何手動輸入列。</p>}
    </>
  );
}

type AnalysisMappingPatch = Partial<Pick<SupportRow,
  | "construction_step_label"
  | "analysis_mapping_basis"
  | "analysis_mapping_confirmed"
  | "removal_transfer_mode"
  | "removal_transfer_target"
  | "removal_transfer_direction"
  | "removal_transfer_share_percent"
  | "removal_transfer_additional_receivers"
  | "removal_transfer_basis"
  | "removal_transfer_confirmed"
>>;

const removalTransferOptions: Array<{ value: RemovalTransferMode; label: string }> = [
  { value: "unassigned", label: "尚未指定" },
  { value: "outside_scope", label: "本構件檢核範圍外（另案檢核）" },
  { value: "floor", label: "移轉至樓版" },
  { value: "reshore", label: "移轉至重撐／回撐" },
  { value: "permanent_structure", label: "移轉至永久結構" },
  { value: "other", label: "其他人工指定處置" },
];

function AnalysisMappingEditor(props: {
  row: SupportRow | BraceRow;
  onChange: (patch: AnalysisMappingPatch) => void;
}) {
  if (props.row.force_source !== "analysis_import") return null;
  const cases = props.row.analysis_stage_cases ?? [];
  const mappingComplete = Boolean(
    props.row.analysis_mapping_confirmed &&
    props.row.construction_step_label?.trim() &&
    props.row.analysis_mapping_basis?.trim(),
  );
  const hasRemoval = props.row.analysis_removal_stage_index != null;
  const transferMode = props.row.removal_transfer_mode ?? "unassigned";
  const primaryShare = props.row.removal_transfer_share_percent ?? 100;
  const additionalReceivers = props.row.removal_transfer_additional_receivers ?? [];
  const allocationTotal = primaryShare + additionalReceivers.reduce((sum, item) => sum + Number(item.share_percent || 0), 0);
  const allocationsComplete = additionalReceivers.every((item) => (
    item.share_percent > 0 &&
    item.share_percent <= 100 &&
    item.direction.trim() &&
    item.basis.trim() &&
    (item.mode === "outside_scope" || item.target.trim())
  ));
  const transferComplete = !hasRemoval || Boolean(
    transferMode !== "unassigned" &&
    props.row.removal_transfer_confirmed &&
    props.row.removal_transfer_basis?.trim() &&
    props.row.removal_transfer_direction?.trim() &&
    primaryShare > 0 &&
    allocationsComplete &&
    Math.abs(allocationTotal - 100) <= 0.01 &&
    (transferMode === "outside_scope" || props.row.removal_transfer_target?.trim()),
  );
  const updateAdditionalReceiver = (index: number, patch: Partial<RemovalTransferReceiverAllocation>) => {
    const next = additionalReceivers.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    props.onChange({ removal_transfer_additional_receivers: next });
  };
  const addAdditionalReceiver = () => {
    if (additionalReceivers.length >= 9) return;
    const newShare = Math.max(Math.min(primaryShare / 2, 50), 0.001);
    props.onChange({
      removal_transfer_share_percent: Number((primaryShare - newShare).toFixed(3)),
      removal_transfer_additional_receivers: [
        ...additionalReceivers,
        { mode: "floor", target: "", direction: "", share_percent: Number(newShare.toFixed(3)), basis: "" },
      ],
    });
  };
  const removeAdditionalReceiver = (index: number) => {
    const removed = additionalReceivers[index];
    props.onChange({
      removal_transfer_share_percent: Math.min(100, primaryShare + Number(removed?.share_percent || 0)),
      removal_transfer_additional_receivers: additionalReceivers.filter((_, itemIndex) => itemIndex !== index),
    });
  };
  return (
    <div className="analysis-stage-mapping-card">
      <div className="analysis-stage-mapping-summary">
        <strong>
          分析生命週期：安裝 #{props.row.analysis_install_stage_index ?? "—"} {props.row.analysis_install_stage_label || "—"}
          {' → '}控制 #{props.row.analysis_control_stage_index ?? "—"} {props.row.analysis_control_stage_label || "—"}
          {props.row.analysis_removal_stage_index
            ? ` → 拆撐 #${props.row.analysis_removal_stage_index} ${props.row.analysis_removal_stage_label || ""}`
            : " → 未辨識拆撐事件"}
        </strong>
        <span className={`status-chip ${mappingComplete ? "ok" : "warn"}`}>{mappingComplete ? "已確認施工步驟對應" : "待確認施工步驟對應"}</span>
      </div>
      <p className="meta-line">
        施工階段軸力時序：{cases.map((item) => `#${item.stage_index} ${item.stage_label} = ${fmt(item.axial_force_t)} tf`).join("；") || "缺少時序資料"}
      </p>
      <p className="meta-line">拆撐後的傳力路徑不由匯入資料自動推定；以下記錄承接對象、傳力方向與由來源構件設計軸力形成的承接需求，承接構造仍須另依正式模型完成分配、偏心、載重組合及容量檢核。</p>
      <div className="analysis-stage-mapping-grid">
        <label className="field-block">
          <span>實際施工步驟（必填）</span>
          <input
            value={props.row.construction_step_label ?? ""}
            maxLength={120}
            placeholder="例如：第三階開挖至 GL-10.0 m、第二層支撐施作完成"
            onChange={(event) => props.onChange({ construction_step_label: event.target.value })}
          />
        </label>
        <label className="field-block">
          <span>階段對應依據（必填）</span>
          <input
            value={props.row.analysis_mapping_basis ?? ""}
            maxLength={160}
            placeholder="例如：施工程序圖 S-02 與分析模型 Stage 5 對照"
            onChange={(event) => props.onChange({ analysis_mapping_basis: event.target.value })}
          />
        </label>
      </div>
      {hasRemoval && (
        <>
        <div className="analysis-stage-mapping-grid removal-transfer-grid">
          <label className="field-block">
            <span>拆撐後荷重處置（必選）</span>
            <select
              value={transferMode}
              onChange={(event) => props.onChange({ removal_transfer_mode: event.target.value as RemovalTransferMode })}
            >
              {removalTransferOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {transferMode !== "unassigned" && transferMode !== "outside_scope" && (
            <label className="field-block">
              <span>承接構造／指定對象（必填）</span>
              <input
                value={props.row.removal_transfer_target ?? ""}
                maxLength={120}
                placeholder="例如：B2F 樓版 S1 區、第二道回撐 R2"
                onChange={(event) => props.onChange({ removal_transfer_target: event.target.value })}
              />
            </label>
          )}
          {transferMode !== "unassigned" && (
            <label className="field-block">
              <span>主承接分配比例（%）</span>
              <input
                type="number"
                min="0.001"
                max="100"
                step="0.001"
                value={primaryShare}
                onChange={(event) => props.onChange({ removal_transfer_share_percent: Number(event.target.value) })}
              />
            </label>
          )}
          {transferMode !== "unassigned" && (
            <label className="field-block">
              <span>傳力方向／作用線（必填）</span>
              <input
                value={props.row.removal_transfer_direction ?? ""}
                maxLength={120}
                placeholder="例如：沿支撐 S1 軸線向東、樓版面內 X+ 方向"
                onChange={(event) => props.onChange({ removal_transfer_direction: event.target.value })}
              />
            </label>
          )}
          {transferMode !== "unassigned" && (
            <label className="field-block">
              <span>拆撐處置依據（必填）</span>
              <input
                value={props.row.removal_transfer_basis ?? ""}
                maxLength={160}
                placeholder="例如：拆撐順序圖 CS-04、樓版施工階段分析 ST-12"
                onChange={(event) => props.onChange({ removal_transfer_basis: event.target.value })}
              />
            </label>
          )}
        </div>
        {transferMode !== "unassigned" && (
          <div className="removal-transfer-allocations">
            <div className="analysis-stage-mapping-summary">
              <strong>承接分配合計：{fmt(allocationTotal)}%</strong>
              <span className={`status-chip ${Math.abs(allocationTotal - 100) <= 0.01 ? "ok" : "warn"}`}>
                {Math.abs(allocationTotal - 100) <= 0.01 ? "合計 100%" : "合計須為 100%"}
              </span>
              <button type="button" className="ghost" disabled={additionalReceivers.length >= 9} onClick={addAdditionalReceiver}>
                新增承接對象
              </button>
            </div>
            {additionalReceivers.map((receiver, index) => (
              <div className="analysis-stage-mapping-grid removal-transfer-grid" key={`receiver-${index}`}>
                <label className="field-block">
                  <span>承接處置</span>
                  <select
                    value={receiver.mode}
                    onChange={(event) => updateAdditionalReceiver(index, { mode: event.target.value as RemovalTransferReceiverAllocation["mode"] })}
                  >
                    {removalTransferOptions.filter((option) => option.value !== "unassigned").map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {receiver.mode !== "outside_scope" && (
                  <label className="field-block">
                    <span>承接構造／指定對象</span>
                    <input value={receiver.target} maxLength={120} onChange={(event) => updateAdditionalReceiver(index, { target: event.target.value })} />
                  </label>
                )}
                <label className="field-block">
                  <span>傳力方向／作用線</span>
                  <input value={receiver.direction} maxLength={120} onChange={(event) => updateAdditionalReceiver(index, { direction: event.target.value })} />
                </label>
                <label className="field-block">
                  <span>分配比例（%）</span>
                  <input type="number" min="0.001" max="100" step="0.001" value={receiver.share_percent} onChange={(event) => updateAdditionalReceiver(index, { share_percent: Number(event.target.value) })} />
                </label>
                <label className="field-block">
                  <span>處置依據</span>
                  <input value={receiver.basis} maxLength={160} onChange={(event) => updateAdditionalReceiver(index, { basis: event.target.value })} />
                </label>
                <button type="button" className="ghost" onClick={() => removeAdditionalReceiver(index)}>移除承接對象</button>
              </div>
            ))}
          </div>
        )}
        </>
      )}
      <label className="check-field analysis-stage-mapping-confirm">
        <input
          type="checkbox"
          checked={props.row.analysis_mapping_confirmed ?? false}
          onChange={(event) => props.onChange({ analysis_mapping_confirmed: event.target.checked })}
        />
        <span>確認本列安裝、控制內力與拆撐時序，並與上述實際施工步驟相符</span>
      </label>
      {hasRemoval && (
        <label className="check-field analysis-stage-mapping-confirm">
          <input
            type="checkbox"
            disabled={transferMode === "unassigned"}
            checked={props.row.removal_transfer_confirmed ?? false}
            onChange={(event) => props.onChange({ removal_transfer_confirmed: event.target.checked })}
          />
          <span>確認拆撐後荷重處置、傳力方向及承接構造的另案檢核邊界</span>
          <span className={`status-chip ${transferComplete ? "ok" : "warn"}`}>{transferComplete ? "處置已確認" : "處置待確認"}</span>
        </label>
      )}
    </div>
  );
}

function EditableSupportTable(props: {
  title: string;
  subtitle?: string;
  enabled: boolean;
  useDefaultTempForce: boolean;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  onToggleDefaultTempForce: (enabled: boolean) => void;
  rows: SupportRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof SupportRow, value: string) => void;
  onUpdateAnalysisMapping: (index: number, patch: AnalysisMappingPatch) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isSupportRowComplete);
  return (
    <Panel title={props.title} subtitle={props.subtitle}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入此模組檢討；如需檢算，勾選上方核取方塊後即可展開完整輸入表。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          <label className="check-field">
            <input
              type="checkbox"
              checked={props.useDefaultTempForce}
              onChange={(event) => props.onToggleDefaultTempForce(event.target.checked)}
            />
            <span>N2 帶入預設值</span>
          </label>
          <span className="meta-line">勾選後會直接套用第 1 層 30 tf、其餘各層 15 tf，並鎖定欄位避免混淆。</span>
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>層別</th>
                <th>支數</th>
                <th>型號</th>
                <th>N1 (tf)</th>
                <th>N2 (tf)</th>
                <th>間距 (m)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <Fragment key={`${props.title}-${index}`}>
                <tr>
                  <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                  <td><input type="number" value={row.support_count} onChange={(e) => props.onChange(index, "support_count", e.target.value)} /></td>
                  <td>
                    <div className="inline-field-stack">
                      <SectionSelectInput
                        value={row.section_name}
                        options={props.sectionOptions}
                        placeholder="請選擇支撐型號"
                        onChange={(value) => props.onChange(index, "section_name", value)}
                      />
                      <button
                        className="ghost mini-action"
                        type="button"
                        disabled={!row.section_name}
                        onClick={() => props.onApplySectionToAll(row.section_name)}
                      >
                        套用全層
                      </button>
                    </div>
                  </td>
                  <td><input type="number" step="any" value={row.axial_force_t} onChange={(e) => props.onChange(index, "axial_force_t", e.target.value)} /></td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      disabled={props.useDefaultTempForce}
                      value={props.useDefaultTempForce ? defaultSupportTempForce(index) : row.temp_force_t}
                      onChange={(e) => props.onChange(index, "temp_force_t", e.target.value)}
                    />
                  </td>
                  <td><input type="number" step="any" value={row.spacing_m} onChange={(e) => props.onChange(index, "spacing_m", e.target.value)} /></td>
                  <td><button className="ghost" onClick={() => props.onRemove(index)}>刪除</button></td>
                </tr>
                {row.force_source === "analysis_import" && (
                  <tr className="analysis-stage-mapping-row">
                    <td colSpan={7}>
                      <AnalysisMappingEditor row={row} onChange={(patch) => props.onUpdateAnalysisMapping(index, patch)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableWaleTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: WaleRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof WaleRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isWaleRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入橫擋檢討；若本案需要檢算，再勾選後展開跨度、型號與荷重設定。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會隨支撐層數自動補齊。</span>
          )}
          <span className="meta-line">型號預設沿用同層支撐，跨度預設為支撐間距扣 1.5 m；雙支支撐則扣 1.9 m，仍可手動修改。</span>
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>支數</th>
              <th>型號</th>
              <th>跨度 (m)</th>
              <th>支撐間距 (m)</th>
              <th>Ww (tf/m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.title}-${index}`}>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td><input type="number" value={row.wale_count} onChange={(e) => props.onChange(index, "wale_count", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇橫擋型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.span_m} onChange={(e) => props.onChange(index, "span_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.support_spacing_m} onChange={(e) => props.onChange(index, "support_spacing_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.line_load_tf_per_m} onChange={(e) => props.onChange(index, "line_load_tf_per_m", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableBraceTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: BraceRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof BraceRow, value: string) => void;
  onUpdateAnalysisMapping: (index: number, patch: AnalysisMappingPatch) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isBraceRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入斜撐檢討；如需檢算，勾選後再填入型號、L1、L2、角度與荷重。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會隨支撐層數自動補齊。</span>
          )}
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>型號</th>
              <th>L1 (m)</th>
              <th>L2 (m)</th>
              <th>角度 (deg)</th>
              <th>Ww (tf/m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <Fragment key={`${props.title}-${index}`}>
              <tr>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇斜撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.l1_m} onChange={(e) => props.onChange(index, "l1_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.l2_m} onChange={(e) => props.onChange(index, "l2_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.angle_deg} onChange={(e) => props.onChange(index, "angle_deg", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.tributary_line_load_tf_per_m} onChange={(e) => props.onChange(index, "tributary_line_load_tf_per_m", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
              {row.force_source === "analysis_import" && (
                <tr className="analysis-stage-mapping-row">
                  <td colSpan={7}>
                    <AnalysisMappingEditor row={row} onChange={(patch) => props.onUpdateAnalysisMapping(index, patch)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableCornerBraceTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: CornerBraceRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof CornerBraceRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isCornerBraceRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入大角撐檢討；需要時再勾選展開型號、長度與軸力設定。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會依支撐層數自動補齊。</span>
          )}
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>型號</th>
              <th>長度 (m)</th>
              <th>軸力 (tf)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.title}-${index}`}>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇大角撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.length_m} onChange={(e) => props.onChange(index, "length_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.axial_force_t} onChange={(e) => props.onChange(index, "axial_force_t", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function LevelSummaryTable(props: { rows: SummaryItem[]; options: CalculationOptions }) {
  const rows = buildLevelSummaryRows(props.rows);
  const summaryColumns = availableSummaryColumns(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.worstRatio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table">
        <thead>
          <tr>
            <th>層別</th>
            {summaryColumns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            <th>最差比值</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={
                normalizedRatio(row.worstRatio) > 0 && nearlyEqual(normalizedRatio(row.worstRatio), worstRatio)
                  ? "worst-row"
                  : ""
              }
            >
              <td>{row.label}</td>
              {summaryColumns.map((column) => (
                <td key={`${row.label}-${column.key}`}>
                  <SummaryMatrixCell items={summaryRowItems(row, column.key)} options={props.options} />
                </td>
              ))}
              <td><UtilizationCell value={row.worstRatio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnSummaryTable(props: { rows: CheckResult[]; onLocate: () => void }) {
  const rows = buildColumnSummaryRows(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.ratio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>構件</th>
            <th>型號</th>
            <th>利用率</th>
            <th>狀態</th>
            <th>備註</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={
                normalizedRatio(row.ratio) > 0 && nearlyEqual(normalizedRatio(row.ratio), worstRatio)
                  ? "worst-row"
                  : ""
              }
            >
              <td>{row.label}</td>
              <td>{row.sectionName}</td>
              <td><UtilizationCell value={row.ratio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
              <td>{row.note}</td>
              <td><button className="ghost compact-action" onClick={props.onLocate}>前往柱構件</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyControlTable(props: {
  rows: CheckResult[];
  options: CalculationOptions;
  onLocate: (step: number, panelId?: string) => void;
}) {
  const rows = buildKeyControlRows(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.utilization_ratio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>模組</th>
            <th>標籤</th>
            <th>控制條件</th>
            <th>控制值 / 允許值</th>
            <th>利用率</th>
            <th>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.module_name}-${row.label}-${index}`}
              className={normalizedRatio(row.utilization_ratio) > 0 && nearlyEqual(normalizedRatio(row.utilization_ratio), worstRatio) ? "worst-row" : ""}
            >
              <td>{displayCheckModuleName(row.module_name, props.options)}</td>
              <td>{row.label}</td>
              <td>{row.controlling_condition}</td>
              <td>{formatDemandAllowable(row)}</td>
              <td><UtilizationCell value={row.utilization_ratio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
              <td>
                <button
                  className="ghost compact-action"
                  onClick={() => {
                    const target = panelTargetForModule(row.module_name, props.options);
                    props.onLocate(target.step, target.panelId);
                  }}
                >
                  {locateLabelForModule(row.module_name)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryMatrixCell(props: { items: SummaryItem[]; options: CalculationOptions }) {
  if (props.items.length === 0) {
    return <span className="table-muted">—</span>;
  }

  return (
    <div className="summary-matrix-cell">
      {props.items.map((item, index) => (
        <div key={`${item.group}-${item.label}-${index}`} className={`summary-line ${statusTone(item.status)}`}>
          <span className="summary-line-head">{summaryHeadline(item, props.options)}</span>
          <div className="summary-line-progress">
            <div className={`summary-line-progress-fill ${statusTone(item.status)}`} style={{ width: `${Math.min(normalizedRatio(item.utilization_ratio), 1.2) / 1.2 * 100}%` }} />
          </div>
          <span className="summary-line-section">{summarySectionName(item)}</span>
        </div>
      ))}
    </div>
  );
}

function UtilizationCell(props: { value: number | null | undefined; status?: string }) {
  const ratio = normalizedRatio(props.value);
  const tone =
    props.status === "NG" || ratio >= 1
      ? "ng"
      : props.status === "Say~OK" || ratio >= 0.85
        ? "warn"
        : "ok";
  const width = `${Math.min(ratio, 1.2) / 1.2 * 100}%`;

  return (
    <div className={`utilization-cell ${tone}`}>
      <span>{fmtRatio(ratio)}</span>
      <div className="utilization-track" aria-hidden="true">
        <div className={`utilization-fill ${tone}`} style={{ width }} />
      </div>
    </div>
  );
}

function StatusBadge(props: { status: string }) {
  return <span className={`status-badge ${props.status}`}>{props.status}</span>;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string): number | null {
  return value === "" ? null : toNumber(value);
}

function cacheBustUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ts=${Date.now()}`;
}

function extractDownloadFilename(url: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return decodeURIComponent(pathname.split("/").pop() || url);
  } catch {
    return url;
  }
}

function downloadJsonFile(payload: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadBase64File(contentBase64: string, filename: string, mediaType: string): void {
  const binary = window.atob(contentBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fileSha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function handoffDesignDemandTf(transfer: RemovalTransferHandoff["transfers"][number]): number {
  const value = Number(
    transfer.sourceDemand.receiverTransferDemandTf
    ?? transfer.sourceDemand.memberDesignAxialForceTf
    ?? 0,
  );
  return Number.isFinite(value) ? value : 0;
}

function handoffSourceMemberLabel(transfer: RemovalTransferHandoff["transfers"][number]): string {
  const parts = [
    String(transfer.sourceMember.moduleName ?? "").trim(),
    String(transfer.sourceMember.levelLabel ?? "").trim(),
    String(transfer.sourceMember.sectionName ?? "").trim(),
  ].filter(Boolean);
  return parts.join("／") || "未命名來源構件";
}

function receiptEvidenceItems(receipt: ReceiverCapacityVerificationReceipt) {
  return receipt.results.flatMap((result) => {
    const items: Array<{
      result: ReceiverVerificationResult;
      evidenceKey: string;
      label: string;
      evidence: ReceiverCapacityEvidence;
    }> = [];
    if (result.capacityEvidence) {
      items.push({
        result,
        evidenceKey: "capacity",
        label: "核定承載力",
        evidence: result.capacityEvidence,
      });
    }
    if (receipt.schemaVersion >= 5) {
      result.supplementalChecks?.forEach((check) => {
        if (!check.evidence) return;
        const label = receiverSupplementalCheckOptions.find((option) => option.value === check.checkId)?.label
          ?? check.checkId;
        items.push({ result, evidenceKey: check.checkId, label, evidence: check.evidence });
      });
    }
    return items;
  });
}

function receiverEvidenceComplete(evidence?: ReceiverCapacityEvidence): boolean {
  return Boolean(evidence?.documentReference.trim())
    && Boolean(evidence?.revision.trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(evidence?.issuedDate ?? "")
    && Boolean(evidence?.pageReference.trim())
    && Boolean(evidence?.fileName.trim())
    && /^[0-9a-f]{64}$/i.test(evidence?.fileSha256 ?? "");
}

function sourceEvidenceMatchKey(transferId: string, evidenceKey: string): string {
  return `${transferId}::${evidenceKey}`;
}

function emptySupplementalChecks(): ReceiverSupplementalCheck[] {
  return receiverSupplementalCheckOptions.map((option) => ({
    checkId: option.value,
    status: "failed",
    basis: "尚未完成正式查核。",
  }));
}

function loadReceiverEvidenceTemplates(): ReceiverEvidenceTemplate[] {
  if (typeof localStorage === "undefined") return [];
  for (const storageKey of [
    RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
    LEGACY_GOVERNED_RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
    LEGACY_RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY,
  ]) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return parseReceiverEvidenceTemplateLibrary(JSON.parse(raw));
    } catch {
      // Invalid local data is ignored but not overwritten until the user changes the library.
    }
  }
  return [];
}

function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function receiverEvidenceTemplateBindingKey(transferId: string, checkId: ReceiverSupplementalCheckId): string {
  return `${transferId}::${checkId}`;
}

function receiverEvidenceTemplateDraftComplete(check: ReceiverSupplementalCheck): boolean {
  return check.status === "passed"
    && Boolean(check.basis.trim())
    && Boolean(check.evidence?.documentReference.trim())
    && Boolean(check.evidence?.revision.trim())
    && Boolean(check.evidence?.issuedDate.trim())
    && Boolean(check.evidence?.pageReference.trim());
}

function applyTemplateToReceiverResult(
  result: ReceiverVerificationResult,
  template: ReceiverEvidenceTemplate,
): ReceiverVerificationResult {
  const checks = (result.supplementalChecks ?? emptySupplementalChecks()).map((check) => (
    check.checkId === template.checkId ? applyReceiverEvidenceTemplate(check, template) : check
  ));
  const otherChecksStatus = checks.some((check) => check.status === "passed")
    && !checks.some((check) => check.status === "failed")
    ? "passed"
    : "failed";
  const ratio = result.adoptedDemandTf / (result.verifiedCapacityTf ?? 0);
  return {
    ...result,
    status: Number.isFinite(ratio)
      && (result.verifiedCapacityTf ?? 0) > 0
      && ratio <= 1.000000001
      && otherChecksStatus === "passed"
      ? "passed"
      : "failed",
    supplementalChecks: checks,
    verificationScope: {
      analysisModelReference: "",
      governingLoadCombination: "",
      directionAndDistributionBasis: "",
      eccentricityAndSecondaryEffectBasis: "",
      checkedLimitStates: [],
      ...result.verificationScope,
      otherChecksStatus,
    },
  };
}

function receiverResultDrafts(handoff: RemovalTransferHandoff): ReceiverVerificationResult[] {
  return handoff.transfers.map((transfer) => ({
    transferId: transfer.transferId,
    status: "failed",
    receiverTarget: transfer.receiver.target,
    adoptedDemandTf: handoffDesignDemandTf(transfer),
    verifiedCapacityTf: 0,
    capacityUtilizationRatio: 0,
    capacityEvidence: {
      documentReference: "",
      revision: "",
      issuedDate: "",
      pageReference: "",
      fileName: "",
      fileSha256: "",
    },
    verificationScope: {
      analysisModelReference: "",
      governingLoadCombination: "",
      directionAndDistributionBasis: "",
      eccentricityAndSecondaryEffectBasis: "",
      checkedLimitStates: [],
      otherChecksStatus: "failed",
    },
    supplementalChecks: emptySupplementalChecks(),
    verificationBasis: "",
    conclusion: "",
  }));
}

function receiverCapacityDrafts(
  handoff: RemovalTransferHandoff,
  referenceData?: ReferenceData,
): Record<string, ReshoreMemberCapacityInput> {
  const defaultSection = referenceData?.sections[0]?.name ?? "";
  const basic = referenceData?.basic_defaults;
  return Object.fromEntries(
    handoff.transfers
      .filter((transfer) => transfer.receiver.mode === "reshore")
      .map((transfer) => [
        transfer.transferId,
        {
          section_name: defaultSection,
          member_count: 1,
          unbraced_length_x_m: 3,
          unbraced_length_y_m: 3,
          effective_length_factor_kx: 1,
          effective_length_factor_ky: 1,
          fy_tf_per_cm2: basic?.fy_tf_per_cm2 ?? 2.5,
          e_tf_per_cm2: basic?.e_tf_per_cm2 ?? 2040,
          allowable_stress_increase_factor: 1,
          imbalance_factor: 1,
          additional_axial_load_tf_per_member: 0,
          governing_load_combination: "",
          effective_length_basis: "",
          load_distribution_basis: [
            transfer.receiver.direction,
            transfer.receiver.dispositionBasis,
          ].filter(Boolean).join("；"),
          additional_load_basis: "",
          stress_increase_basis: "",
          pure_axial_no_eccentricity_confirmed: false,
        } satisfies ReshoreMemberCapacityInput,
      ]),
  );
}

function latestRemovalTransferHandoff(project: ProjectState | null): RemovalTransferHandoff | null {
  const handoffs = project?.removal_transfer_handoffs ?? [];
  return handoffs.length ? handoffs[handoffs.length - 1] : null;
}

function latestRemovalTransferReceipt(
  project: ProjectState | null,
  handoffFingerprint?: string,
): ReceiverCapacityVerificationReceipt | null {
  if (!handoffFingerprint) return null;
  const receipts = (project?.removal_transfer_verification_receipts ?? [])
    .filter((receipt) => receipt.handoffFingerprint === handoffFingerprint);
  return receipts.length ? receipts[receipts.length - 1] : null;
}

function latestSourceCapacityEvidenceVerification(
  project: ProjectState | null,
  receiptFingerprint?: string,
): SourceCapacityEvidenceVerification | null {
  if (!receiptFingerprint) return null;
  const records = (project?.source_capacity_evidence_verifications ?? [])
    .filter((record) => record.receiptFingerprint === receiptFingerprint);
  return records.length ? records[records.length - 1] : null;
}

function removalTransferCandidateCount(project: ProjectState): number {
  const groups: Array<{ enabled: boolean; rows: Array<SupportRow | BraceRow> }> = [
    { enabled: project.calculation_options.include_top_supports, rows: project.top_supports },
    { enabled: project.calculation_options.include_bottom_supports, rows: project.bottom_supports },
    { enabled: project.calculation_options.include_top_braces, rows: project.top_braces },
    { enabled: project.calculation_options.include_bottom_braces, rows: project.bottom_braces },
  ];
  return groups.reduce((count, group) => count + (group.enabled
    ? group.rows.filter((row) =>
      row.force_source === "analysis_import" &&
      row.analysis_removal_stage_index != null &&
      row.removal_transfer_mode !== "unassigned" &&
      row.removal_transfer_confirmed === true,
    ).length
    : 0), 0);
}

function collectBoltSizeKeys(rows: BoltStrengthRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row.sizes).forEach((key) => keys.add(key));
  }
  return Array.from(keys);
}

function emptySectionProperty(index: number): SectionProperty {
  return {
    name: `NEW-SECTION-${index}`,
    depth_cm: 0,
    flange_width_cm: 0,
    web_thickness_cm: 0,
    flange_thickness_cm: 0,
    area_cm2: 0,
    unit_weight_kgf_per_m: 0,
    ix_cm4: 0,
    iy_cm4: 0,
    rx_cm: 0,
    ry_cm: 0,
    rt_cm: 0,
    sx_cm3: 0,
    sy_cm3: 0,
    zx_cm3: 0,
    zy_cm3: 0,
  };
}

function buildSectionOptions(sections: SectionProperty[]): string[] {
  return Array.from(
    new Set(
      sections
        .map((section) => section.name.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

function emptyBoltStrengthRow(index: number, sizeKeys: string[]): BoltStrengthRow {
  return {
    grade: `NEW-BOLT-${index}`,
    ft_tf_per_cm2: null,
    fv_tf_per_cm2: null,
    sizes: Object.fromEntries(sizeKeys.map((key) => [key, 0])),
  };
}

function defaultSupportTempForce(index: number): number {
  return index === 0 ? 30 : 15;
}

function emptySupportRow(index = 0, useDefaultTempForce = true): SupportRow {
  return {
    level_label: "",
    support_count: 1,
    section_name: "",
    axial_force_t: 0,
    temp_force_t: useDefaultTempForce ? defaultSupportTempForce(index) : 0,
    spacing_m: 0,
  };
}

function emptyWaleRow(): WaleRow {
  return {
    level_label: "",
    wale_count: 1,
    section_name: "",
    span_m: 0,
    support_spacing_m: 0,
    line_load_tf_per_m: 0,
  };
}

function emptyBraceRow(): BraceRow {
  return {
    level_label: "",
    section_name: "",
    l1_m: 0,
    l2_m: 0,
    angle_deg: 45,
    tributary_line_load_tf_per_m: 0,
  };
}

function emptyCornerBraceRow(): CornerBraceRow {
  return {
    level_label: "",
    section_name: "",
    length_m: 0,
    axial_force_t: 0,
  };
}

function emptySoilRow(index: number): SoilLayer {
  return {
    index,
    name: `第 ${index} 層`,
    thickness_m: null,
    depth_m: null,
    n_value: null,
    unit_weight_t_per_m3: null,
    phi_deg: null,
    cohesion_t_per_m2: null,
    delta_ratio: null,
    su_t_per_m2: null,
    ka: null,
    kp: null,
    es_t_per_m2: null,
    kh_t_per_m3: null,
    soil_type: "mixed",
  };
}

function flattenChecks(results: NonNullable<ProjectState["calculation_results"]>): CheckResult[] {
  return [
    ...results.support_checks,
    ...results.wale_checks,
    ...results.brace_checks,
    ...results.corner_brace_checks,
    ...results.column_checks,
  ];
}

function buildEditableSoils(project: ProjectState): SoilLayer[] {
  if (project.analysis_import.soils.length > 0) {
    return normalizeSoils(project.analysis_import.soils);
  }
  const baseLayers = project.columns[0]?.soil_layers ?? [];
  return normalizeSoils(
    baseLayers.map((soil) => ({
      index: soil.index,
      name: soil.name,
      thickness_m: soil.thickness_m,
      depth_m: soil.depth_m,
      n_value: soil.n_value ?? null,
      su_t_per_m2: soil.su_t_per_m2 ?? null,
      soil_type: soil.soil_type,
    })),
  );
}

function normalizeSoils(soils: SoilLayer[]): SoilLayer[] {
  let previousDepth: number | null = null;
  return soils.map((soil, index) => {
    const normalizedDepth =
      soil.depth_m === null || soil.depth_m === undefined || Number.isNaN(soil.depth_m)
        ? null
        : soil.depth_m;
    const calculatedThickness = soilThicknessFromDepth(normalizedDepth, previousDepth);
    if (normalizedDepth !== null) {
      previousDepth = normalizedDepth;
    }
    return {
      ...emptySoilRow(index + 1),
      ...soil,
      index: index + 1,
      name: soil.name || `第 ${index + 1} 層`,
      depth_m: normalizedDepth,
      thickness_m: calculatedThickness,
    };
  });
}

function syncColumnsFromSoils(
  columns: ColumnScenarioInput[],
  soils: SoilLayer[],
): ColumnScenarioInput[] {
  const foundationSoils = toFoundationSoils(soils);
  return columns.map((column) => ({
    ...column,
    soil_layers: foundationSoils.map((soil) => ({ ...soil })),
  }));
}

function toFoundationSoils(soils: SoilLayer[]) {
  return normalizeSoils(soils)
    .filter((soil): soil is SoilLayer & { depth_m: number; thickness_m: number } => soil.depth_m !== null && soil.depth_m !== undefined && soil.thickness_m !== null && soil.thickness_m !== undefined)
    .map((soil, index) => {
    return {
      index: index + 1,
      name: soil.name,
      depth_m: soil.depth_m,
      thickness_m: soil.thickness_m,
      n_value: soil.n_value ?? null,
      su_t_per_m2: soil.su_t_per_m2 ?? null,
      soil_type: soil.soil_type,
    };
  });
}

function soilThicknessFromDepth(depth: number | null, previousDepth: number | null): number | null {
  if (depth === null || Number.isNaN(depth)) return null;
  const baseDepth = previousDepth ?? 0;
  return roundValue(Math.max(depth - baseDepth, 0));
}

function isSameSoilRows(left: SoilLayer[], right: SoilLayer[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isSameColumnSoils(left: ColumnScenarioInput[], right: ColumnScenarioInput[]): boolean {
  return JSON.stringify(left.map((column) => column.soil_layers)) === JSON.stringify(right.map((column) => column.soil_layers));
}

type GuardedDependentKey =
  | "top_wales"
  | "bottom_wales"
  | "top_braces"
  | "bottom_braces"
  | "corner_braces";

type SupportSeed = {
  levelLabel: string;
  supportCount: number;
  spacingM: number;
  totalForceT: number;
  sectionName: string;
};

type SupportKey = "top_supports" | "bottom_supports";

function isSupportKey(key: string): key is SupportKey {
  return key === "top_supports" || key === "bottom_supports";
}

function isGuardedDependentKey(key: string): key is GuardedDependentKey {
  return (
    key === "top_wales" ||
    key === "bottom_wales" ||
    key === "top_braces" ||
    key === "bottom_braces" ||
    key === "corner_braces"
  );
}

function minimumDependentRows(
  project: ProjectState,
  key: GuardedDependentKey,
): number {
  const topCount = project.calculation_options.include_top_supports ? project.top_supports.length : 0;
  const bottomCount = project.calculation_options.include_bottom_supports
    ? project.bottom_supports.length
    : 0;

  if (key === "top_wales" || key === "top_braces") return topCount;
  if (key === "bottom_wales" || key === "bottom_braces") return bottomCount;
  return Math.max(topCount, bottomCount);
}

function syncAfterSupportRemoval(
  project: ProjectState,
  supportKey: SupportKey,
  index: number,
): ProjectState {
  const previousTopMinimum = minimumDependentRows(project, "top_wales");
  const previousBottomMinimum = minimumDependentRows(project, "bottom_wales");
  const previousCornerMinimum = minimumDependentRows(project, "corner_braces");

  const nextSupportRows = [...project[supportKey]];
  nextSupportRows.splice(index, 1);

  const nextProject: ProjectState = {
    ...project,
    [supportKey]: nextSupportRows,
    calculation_results: null,
  } as ProjectState;

  const nextTopMinimum = minimumDependentRows(nextProject, "top_wales");
  const nextBottomMinimum = minimumDependentRows(nextProject, "bottom_wales");
  const nextCornerMinimum = minimumDependentRows(nextProject, "corner_braces");

  if (supportKey === "top_supports") {
    nextProject.top_wales = trimLinkedRowsAfterSupportRemoval(
      project.top_wales,
      previousTopMinimum,
      nextTopMinimum,
      index,
    );
    nextProject.top_braces = trimLinkedRowsAfterSupportRemoval(
      project.top_braces,
      previousTopMinimum,
      nextTopMinimum,
      index,
    );
  } else {
    nextProject.bottom_wales = trimLinkedRowsAfterSupportRemoval(
      project.bottom_wales,
      previousBottomMinimum,
      nextBottomMinimum,
      index,
    );
    nextProject.bottom_braces = trimLinkedRowsAfterSupportRemoval(
      project.bottom_braces,
      previousBottomMinimum,
      nextBottomMinimum,
      index,
    );
  }

  nextProject.corner_braces = trimCornerRowsAfterSupportRemoval(
    project.corner_braces,
    previousCornerMinimum,
    nextCornerMinimum,
  );

  return nextProject;
}

function trimLinkedRowsAfterSupportRemoval<T>(
  rows: T[],
  previousMinimum: number,
  nextMinimum: number,
  index: number,
): T[] {
  if (nextMinimum >= previousMinimum || rows.length !== previousMinimum) {
    return rows;
  }
  const nextRows = [...rows];
  nextRows.splice(Math.min(index, Math.max(nextRows.length - 1, 0)), 1);
  return nextRows;
}

function trimCornerRowsAfterSupportRemoval(
  rows: CornerBraceRow[],
  previousMinimum: number,
  nextMinimum: number,
): CornerBraceRow[] {
  if (nextMinimum >= previousMinimum || rows.length !== previousMinimum) {
    return rows;
  }
  return rows.slice(0, nextMinimum);
}

function syncProjectGuardrails(project: ProjectState): ProjectState {
  const normalizedBasicParameters = {
    ...project.basic_parameters,
    wall_type: normalizeWallTypeValue(project.basic_parameters.wall_type),
  };
  const normalizedSoils = buildEditableSoils(project);
  const nextColumns = normalizeConstructionStageColumns(syncColumnsFromSoils(project.columns, normalizedSoils));
  const soilsChanged = !isSameSoilRows(project.analysis_import.soils, normalizedSoils);
  const columnsChanged = JSON.stringify(project.columns) !== JSON.stringify(nextColumns);
  const basicChanged = JSON.stringify(project.basic_parameters) !== JSON.stringify(normalizedBasicParameters);
  const originalTopSeeds = project.calculation_options.include_top_supports
    ? buildSupportSeeds(project.top_supports)
    : [];
  const originalBottomSeeds = project.calculation_options.include_bottom_supports
    ? buildSupportSeeds(project.bottom_supports)
    : [];

  const [topSupports, topSupportsChanged] = syncSupportRows(
    project.top_supports,
    project.calculation_options.auto_temp_force_top_supports,
  );
  const [bottomSupports, bottomSupportsChanged] = syncSupportRows(
    project.bottom_supports,
    project.calculation_options.auto_temp_force_bottom_supports,
  );

  const topSeeds = project.calculation_options.include_top_supports
    ? buildSupportSeeds(topSupports)
    : [];
  const bottomSeeds = project.calculation_options.include_bottom_supports
    ? buildSupportSeeds(bottomSupports)
    : [];
  const originalCornerSeeds = buildCornerSeeds(originalTopSeeds, originalBottomSeeds);
  const cornerSeeds = buildCornerSeeds(topSeeds, bottomSeeds);

  const [topWales, topWalesChanged] = syncWaleRows(project.top_wales, topSeeds, originalTopSeeds);
  const [bottomWales, bottomWalesChanged] = syncWaleRows(project.bottom_wales, bottomSeeds, originalBottomSeeds);
  const [topBraces, topBracesChanged] = syncBraceRows(project.top_braces, topSeeds, originalTopSeeds);
  const [bottomBraces, bottomBracesChanged] = syncBraceRows(project.bottom_braces, bottomSeeds, originalBottomSeeds);
  const [cornerBraces, cornerBracesChanged] = syncCornerBraceRows(project.corner_braces, cornerSeeds, originalCornerSeeds);

  if (
    !topSupportsChanged &&
    !bottomSupportsChanged &&
    !topWalesChanged &&
    !bottomWalesChanged &&
    !topBracesChanged &&
    !bottomBracesChanged &&
    !cornerBracesChanged &&
    !soilsChanged &&
    !columnsChanged &&
    !basicChanged
  ) {
    return project;
  }

  return {
    ...project,
    basic_parameters: normalizedBasicParameters,
    analysis_import: {
      ...project.analysis_import,
      soils: normalizedSoils,
    },
    columns: nextColumns,
    top_supports: topSupports,
    bottom_supports: bottomSupports,
    top_wales: topWales,
    bottom_wales: bottomWales,
    top_braces: topBraces,
    bottom_braces: bottomBraces,
    corner_braces: cornerBraces,
  };
}

function normalizeConstructionStageColumns(columns: ColumnScenarioInput[]): ColumnScenarioInput[] {
  const usedColumnIds = new Set<string>();
  return columns.map((column, index) => {
    const existingStages = column.construction_stage_loads ?? [];
    const targetFromStage = existingStages[0]?.target_column_id?.trim() || "";
    let columnId = column.column_id?.trim() || targetFromStage || `COL-${column.variant.toUpperCase().replaceAll("_", "-")}-${index + 1}`;
    if (usedColumnIds.has(columnId)) columnId = `${columnId}-${index + 1}`;
    usedColumnIds.add(columnId);

    let constructionStageLoads = existingStages.map((stage) => ({
      ...stage,
      distribution_factor: stage.distribution_factor ?? 1,
      distribution_basis: stage.distribution_basis ?? "",
      apply_transfer_eccentricity: stage.apply_transfer_eccentricity ?? false,
      transfer_eccentricity_x_m: stage.transfer_eccentricity_x_m ?? 0,
      transfer_eccentricity_y_m: stage.transfer_eccentricity_y_m ?? 0,
      transfer_basis: stage.transfer_basis ?? "",
    }));
    if (constructionStageLoads.length === 0 && column.construction_stage_load_t > 0 && column.construction_stage_load_source) {
      constructionStageLoads = [{
        stage_id: `STG-${column.construction_stage_load_source.handoff_fingerprint.slice(4)}`,
        stage_label: "舊案單一施工階段",
        target_column_id: columnId,
        load_t: column.construction_stage_load_t,
        distribution_factor: 1,
        distribution_basis: "",
        apply_transfer_eccentricity: false,
        transfer_eccentricity_x_m: 0,
        transfer_eccentricity_y_m: 0,
        transfer_basis: "",
        source: column.construction_stage_load_source,
      }];
    }
    const legacyControl = constructionStageLoads.reduce<ConstructionStageLoadAdoption | null>(
      (control, stage) => !control || stage.load_t > control.load_t ? stage : control,
      null,
    );
    return {
      ...column,
      column_id: columnId,
      construction_stage_load_t: legacyControl?.load_t ?? 0,
      construction_stage_load_source: legacyControl?.source ?? null,
      construction_stage_loads: constructionStageLoads,
    };
  });
}

function syncSupportRows(rows: SupportRow[], useDefaultTempForce: boolean): [SupportRow[], boolean] {
  let changed = false;
  const nextRows = rows.map((row, index) => {
    const updated: SupportRow = {
      ...row,
      ...normalizedAnalysisMapping(row),
      support_count: Math.max(row.support_count || 1, 1),
      temp_force_t: normalizeSupportTempForce(row.temp_force_t, index, useDefaultTempForce),
    };
    if (!isSameSupportRow(row, updated)) {
      changed = true;
    }
    return updated;
  });
  return [changed ? nextRows : rows, changed];
}

function buildSupportSeeds(rows: SupportRow[]): SupportSeed[] {
  return rows.map((row, index) => ({
    levelLabel: row.level_label || String(index + 1),
    supportCount: Math.max(row.support_count || 1, 1),
    spacingM: row.spacing_m || 0,
    totalForceT: (row.axial_force_t || 0) + (row.temp_force_t || 0),
    sectionName: row.section_name || "",
  }));
}

function buildCornerSeeds(topSeeds: SupportSeed[], bottomSeeds: SupportSeed[]): SupportSeed[] {
  const size = Math.max(topSeeds.length, bottomSeeds.length);
  const seeds: SupportSeed[] = [];
  for (let index = 0; index < size; index += 1) {
    const top = topSeeds[index];
    const bottom = bottomSeeds[index];
    const topForce = top?.totalForceT ?? 0;
    const bottomForce = bottom?.totalForceT ?? 0;
    const primary = topForce >= bottomForce ? top ?? bottom : bottom ?? top;
    if (!primary) continue;
    seeds.push({
      levelLabel: primary.levelLabel || String(index + 1),
      supportCount: primary.supportCount,
      spacingM: primary.spacingM,
      totalForceT: Math.max(topForce, bottomForce),
      sectionName: primary.sectionName,
    });
  }
  return seeds;
}

function supportSeedFromRow(row: SupportRow, index: number, useDefaultTempForce: boolean): SupportSeed {
  const supportCount = Math.max(row.support_count || 1, 1);
  const spacingM = row.spacing_m || 0;
  const tempForceT = normalizeSupportTempForce(row.temp_force_t, index, useDefaultTempForce);
  return {
    levelLabel: row.level_label || String(index + 1),
    supportCount,
    spacingM,
    totalForceT: (row.axial_force_t || 0) + tempForceT,
    sectionName: row.section_name || "",
  };
}

function normalizeSupportTempForce(value: number, index: number, useDefaultTempForce: boolean): number {
  if (!useDefaultTempForce) return value || 0;
  return defaultSupportTempForce(index);
}

function shouldFollowSupportSection(currentSection: string, previousSupportSection: string): boolean {
  return !currentSection || (!!previousSupportSection && currentSection === previousSupportSection);
}

function shouldFollowAutoNumber(currentValue: number, previousDefault: number): boolean {
  return currentValue <= 0 || nearlyEqual(currentValue, previousDefault);
}

function shouldFollowSupportCount(currentCount: number, previousSupportCount: number): boolean {
  return currentCount <= 0 || currentCount === previousSupportCount;
}

function shouldFollowLevelLabel(currentLabel: string, previousLabel: string): boolean {
  return !currentLabel || currentLabel === previousLabel;
}

function isAutoManagedWaleRow(row: WaleRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportCount(row.wale_count, previousSeed.supportCount) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.support_spacing_m, roundValue(previousSeed.spacingM)) &&
    shouldFollowAutoNumber(row.span_m, autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount))
  );
}

function isAutoManagedBraceRow(row: BraceRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.l1_m, defaultBraceL1()) &&
    shouldFollowAutoNumber(row.l2_m, defaultBraceL2(previousSeed.supportCount))
  );
}

function isAutoManagedCornerBraceRow(row: CornerBraceRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.length_m, defaultBraceL2(previousSeed.supportCount))
  );
}

function cascadeSupportEdit(
  previousProject: ProjectState,
  nextProject: ProjectState,
  key: SupportKey,
  index: number,
): ProjectState {
  const previousRow = previousProject[key][index];
  const nextRow = nextProject[key][index];
  if (!previousRow || !nextRow) return nextProject;

  const useDefaultTempForce =
    key === "top_supports"
      ? nextProject.calculation_options.auto_temp_force_top_supports
      : nextProject.calculation_options.auto_temp_force_bottom_supports;
  const previousUseDefaultTempForce =
    key === "top_supports"
      ? previousProject.calculation_options.auto_temp_force_top_supports
      : previousProject.calculation_options.auto_temp_force_bottom_supports;

  const previousSeed = supportSeedFromRow(previousRow, index, previousUseDefaultTempForce);
  const nextSeed = supportSeedFromRow(nextRow, index, useDefaultTempForce);

  const waleKey = key === "top_supports" ? "top_wales" : "bottom_wales";
  const braceKey = key === "top_supports" ? "top_braces" : "bottom_braces";

  const nextWales = [...nextProject[waleKey]];
  const existingWale = nextWales[index];
  if (existingWale) {
    const updatedWale: WaleRow = {
      ...existingWale,
      level_label: shouldFollowLevelLabel(existingWale.level_label, previousSeed.levelLabel)
        ? nextSeed.levelLabel
        : existingWale.level_label,
      wale_count: shouldFollowSupportCount(existingWale.wale_count, previousSeed.supportCount)
        ? nextSeed.supportCount
        : existingWale.wale_count,
      section_name: shouldFollowSupportSection(existingWale.section_name, previousSeed.sectionName)
        ? nextSeed.sectionName
        : existingWale.section_name,
      support_spacing_m: shouldFollowAutoNumber(existingWale.support_spacing_m, roundValue(previousSeed.spacingM))
        ? roundValue(nextSeed.spacingM)
        : existingWale.support_spacing_m,
      span_m: shouldFollowAutoNumber(existingWale.span_m, autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount))
        ? autoWaleSpan(nextSeed.spacingM, nextSeed.supportCount)
        : existingWale.span_m,
      line_load_tf_per_m: shouldFollowAutoNumber(existingWale.line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed)))
        ? roundValue(estimatedLineLoad(nextSeed))
        : existingWale.line_load_tf_per_m,
    };
    nextWales[index] = updatedWale;
  }

  const nextBraces = [...nextProject[braceKey]];
  const existingBrace = nextBraces[index];
  if (existingBrace && existingBrace.force_source !== "analysis_import") {
    const updatedBrace: BraceRow = {
      ...existingBrace,
      level_label: shouldFollowLevelLabel(existingBrace.level_label, previousSeed.levelLabel)
        ? nextSeed.levelLabel
        : existingBrace.level_label,
      section_name: shouldFollowSupportSection(existingBrace.section_name, previousSeed.sectionName)
        ? nextSeed.sectionName
        : existingBrace.section_name,
      l1_m: shouldFollowAutoNumber(existingBrace.l1_m, defaultBraceL1()) ? defaultBraceL1() : existingBrace.l1_m,
      l2_m: shouldFollowAutoNumber(existingBrace.l2_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultBraceL2(nextSeed.supportCount)
        : existingBrace.l2_m,
      tributary_line_load_tf_per_m: shouldFollowAutoNumber(
        existingBrace.tributary_line_load_tf_per_m,
        roundValue(estimatedLineLoad(previousSeed)),
      )
        ? roundValue(estimatedLineLoad(nextSeed))
        : existingBrace.tributary_line_load_tf_per_m,
    };
    nextBraces[index] = updatedBrace;
  }

  return {
    ...nextProject,
    [waleKey]: nextWales,
    [braceKey]: nextBraces,
  };
}

function syncWaleRows(
  rows: WaleRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [WaleRow[], boolean] {
  if (seeds.length === 0) return [rows, false];
  const nextRows = [...rows];
  let changed = false;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultLineLoad = estimatedLineLoad(seed);
    const defaultRow = defaultWaleRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    const previousAutoSpan = autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount);
    const nextAutoSpan = autoWaleSpan(defaultRow.support_spacing_m, defaultRow.wale_count);
    const shouldRefreshSpan =
      existing.span_m <= 0 ||
      nearlyEqual(existing.span_m, previousAutoSpan) ||
      existing.span_m > defaultRow.support_spacing_m;
    const shouldRefreshLineLoad =
      existing.line_load_tf_per_m <= 0 ||
      nearlyEqual(existing.line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed))) ||
      isAutoManagedWaleRow(existing, previousSeed);
    const updated: WaleRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      wale_count: shouldFollowSupportCount(existing.wale_count, previousSeed.supportCount)
        ? defaultRow.wale_count
        : existing.wale_count,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      span_m: shouldRefreshSpan ? nextAutoSpan : existing.span_m,
      support_spacing_m: shouldFollowAutoNumber(existing.support_spacing_m, roundValue(previousSeed.spacingM))
        ? defaultRow.support_spacing_m
        : existing.support_spacing_m,
      line_load_tf_per_m: shouldRefreshLineLoad ? roundValue(defaultLineLoad) : existing.line_load_tf_per_m,
    };
    if (!isSameWaleRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function syncBraceRows(
  rows: BraceRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [BraceRow[], boolean] {
  const normalizedRows: BraceRow[] = rows.map((row) => ({ ...row, ...normalizedAnalysisMapping(row) }));
  let changed = normalizedRows.some((row, index) => !isSameBraceRow(row, rows[index]));
  if (seeds.length === 0) return [changed ? normalizedRows : rows, changed];
  const nextRows: BraceRow[] = [...normalizedRows];
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultRow = defaultBraceRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    if (existing.force_source === "analysis_import") {
      continue;
    }
    const shouldRefreshTributaryLoad =
      existing.tributary_line_load_tf_per_m <= 0 ||
      nearlyEqual(existing.tributary_line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed))) ||
      isAutoManagedBraceRow(existing, previousSeed);
    const updated: BraceRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      l1_m: shouldFollowAutoNumber(existing.l1_m, defaultBraceL1()) ? defaultRow.l1_m : existing.l1_m,
      l2_m: shouldFollowAutoNumber(existing.l2_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultRow.l2_m
        : existing.l2_m,
      angle_deg: existing.angle_deg > 0 ? existing.angle_deg : defaultRow.angle_deg,
      tributary_line_load_tf_per_m: shouldRefreshTributaryLoad
        ? defaultRow.tributary_line_load_tf_per_m
        : existing.tributary_line_load_tf_per_m,
    };
    if (!isSameBraceRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function syncCornerBraceRows(
  rows: CornerBraceRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [CornerBraceRow[], boolean] {
  if (seeds.length === 0) return [rows, false];
  const nextRows = [...rows];
  let changed = false;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultRow = defaultCornerBraceRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    const updated: CornerBraceRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      length_m: shouldFollowAutoNumber(existing.length_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultRow.length_m
        : existing.length_m,
      axial_force_t:
        existing.axial_force_t <= 0 ||
        nearlyEqual(existing.axial_force_t, roundValue(previousSeed.totalForceT)) ||
        isAutoManagedCornerBraceRow(existing, previousSeed)
          ? defaultRow.axial_force_t
          : existing.axial_force_t,
    };
    if (!isSameCornerBraceRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function estimatedLineLoad(seed: SupportSeed): number {
  if (seed.spacingM <= 0) return 0;
  return (seed.totalForceT * seed.supportCount) / seed.spacingM;
}

function supportClearanceByCount(supportCount: number): number {
  return supportCount >= 2 ? 1.9 : 1.5;
}

function autoWaleSpan(spacingM: number, supportCount: number): number {
  return roundValue(Math.max(spacingM - supportClearanceByCount(supportCount), 0));
}

function defaultBraceL1(): number {
  return 1.5;
}

function defaultBraceL2(supportCount: number): number {
  return supportCount >= 2 ? 2.6 : 3.0;
}

function fallbackSectionName(
  seed: SupportSeed,
  rows: Array<{ section_name: string }>,
): string {
  if (seed.sectionName) return seed.sectionName;
  return rows.find((row) => row.section_name)?.section_name || "";
}

function defaultWaleRow(seed: SupportSeed, rows: WaleRow[]): WaleRow {
  return {
    level_label: seed.levelLabel,
    wale_count: seed.supportCount,
    section_name: fallbackSectionName(seed, rows),
    span_m: autoWaleSpan(seed.spacingM, seed.supportCount),
    support_spacing_m: roundValue(seed.spacingM),
    line_load_tf_per_m: roundValue(estimatedLineLoad(seed)),
  };
}

function defaultWaleRowForIndex(rows: WaleRow[], seeds: SupportSeed[], index: number): WaleRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultWaleRow(seed, rows) : emptyWaleRow();
}

function defaultBraceRow(seed: SupportSeed, rows: BraceRow[]): BraceRow {
  return {
    level_label: seed.levelLabel,
    section_name: fallbackSectionName(seed, rows),
    l1_m: defaultBraceL1(),
    l2_m: defaultBraceL2(seed.supportCount),
    angle_deg: 45,
    tributary_line_load_tf_per_m: roundValue(estimatedLineLoad(seed)),
  };
}

function defaultBraceRowForIndex(rows: BraceRow[], seeds: SupportSeed[], index: number): BraceRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultBraceRow(seed, rows) : emptyBraceRow();
}

function defaultCornerBraceRow(seed: SupportSeed, rows: CornerBraceRow[]): CornerBraceRow {
  return {
    level_label: seed.levelLabel,
    section_name: fallbackSectionName(seed, rows),
    length_m: defaultBraceL2(seed.supportCount),
    axial_force_t: roundValue(seed.totalForceT),
  };
}

function defaultCornerBraceRowForIndex(
  rows: CornerBraceRow[],
  seeds: SupportSeed[],
  index: number,
): CornerBraceRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultCornerBraceRow(seed, rows) : emptyCornerBraceRow();
}

function nearlyEqual(left: number, right: number, epsilon = 1e-6): boolean {
  return Math.abs(left - right) <= epsilon;
}

function isSameSupportRow(left: SupportRow, right: SupportRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.support_count === right.support_count &&
    left.section_name === right.section_name &&
    left.axial_force_t === right.axial_force_t &&
    left.temp_force_t === right.temp_force_t &&
    left.spacing_m === right.spacing_m &&
    analysisMappingSignature(left) === analysisMappingSignature(right)
  );
}

function isSameWaleRow(left: WaleRow, right: WaleRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.wale_count === right.wale_count &&
    left.section_name === right.section_name &&
    left.span_m === right.span_m &&
    left.support_spacing_m === right.support_spacing_m &&
    left.line_load_tf_per_m === right.line_load_tf_per_m
  );
}

function isSameBraceRow(left: BraceRow, right: BraceRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.section_name === right.section_name &&
    left.l1_m === right.l1_m &&
    left.l2_m === right.l2_m &&
    left.angle_deg === right.angle_deg &&
    left.tributary_line_load_tf_per_m === right.tributary_line_load_tf_per_m &&
    analysisMappingSignature(left) === analysisMappingSignature(right)
  );
}

function normalizedAnalysisMapping(row: SupportRow | BraceRow): AnalysisMappingPatch & {
  force_source: "manual" | "analysis_import";
  analysis_stage_cases: AnalysisForceCase[];
  analysis_install_stage_index: number | null;
  analysis_install_stage_label: string;
  analysis_control_stage_index: number | null;
  analysis_control_stage_label: string;
  analysis_removal_stage_index: number | null;
  analysis_removal_stage_label: string;
} {
  const cases = row.analysis_stage_cases ?? [];
  const forceSource = row.force_source ?? (cases.length > 0 ? "analysis_import" : "manual");
  return {
    force_source: forceSource,
    analysis_stage_cases: cases,
    analysis_install_stage_index: row.analysis_install_stage_index ?? null,
    analysis_install_stage_label: row.analysis_install_stage_label ?? "",
    analysis_control_stage_index: row.analysis_control_stage_index ?? null,
    analysis_control_stage_label: row.analysis_control_stage_label ?? "",
    analysis_removal_stage_index: row.analysis_removal_stage_index ?? null,
    analysis_removal_stage_label: row.analysis_removal_stage_label ?? "",
    removal_transfer_mode: row.removal_transfer_mode ?? "unassigned",
    removal_transfer_target: row.removal_transfer_target ?? "",
    removal_transfer_direction: row.removal_transfer_direction ?? "",
    removal_transfer_share_percent: row.removal_transfer_share_percent ?? 100,
    removal_transfer_additional_receivers: row.removal_transfer_additional_receivers ?? [],
    removal_transfer_basis: row.removal_transfer_basis ?? "",
    removal_transfer_confirmed: row.removal_transfer_confirmed ?? false,
    construction_step_label: row.construction_step_label ?? "",
    analysis_mapping_confirmed: row.analysis_mapping_confirmed ?? false,
    analysis_mapping_basis: row.analysis_mapping_basis ?? "",
  };
}

function analysisMappingSignature(row: SupportRow | BraceRow): string {
  return JSON.stringify(normalizedAnalysisMapping(row));
}

function isSameCornerBraceRow(left: CornerBraceRow, right: CornerBraceRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.section_name === right.section_name &&
    left.length_m === right.length_m &&
    left.axial_force_t === right.axial_force_t
  );
}

type ImportedStrutRow = {
  stageIndex: number;
  stageLabel: string;
  installStageIndex: number;
  installStageLabel: string;
  index: number;
  classification: "support" | "brace";
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  stiffness: number;
  stageCases?: AnalysisForceCase[];
};

type ImportedIgnoredEventRow = {
  stageIndex: number;
  stageLabel: string;
  classification: "floor" | "remove" | "other";
  buttNo?: number | null;
  depth_m?: number | null;
  span_m?: number | null;
  angle_deg?: number | null;
  load_t?: number | null;
  stiffness?: number | null;
  description: string;
};

type ImportedAssignment = {
  id: string;
  kind: "support" | "brace";
  levelLabel: string;
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  installStageIndex: number;
  installStageLabel: string;
  controlStageIndex: number;
  controlStageLabel: string;
  removalStageIndex: number | null;
  removalStageLabel: string;
  stageCases: AnalysisForceCase[];
  stageLabels: string[];
};

type ImportSummary = {
  supportCount: number;
  braceCount: number;
  floorCount: number;
  removeCount: number;
  otherCount: number;
  candidateCount: number;
};

type StageImportRow = {
  index: number;
  label: string;
  excavation_depth_m?: number | null;
  water_level_m?: number | null;
  candidateCount: number;
  ignoredCount: number;
};

type LevelSummaryRow = {
  label: string;
  support: SummaryItem[];
  wale: SummaryItem[];
  brace: SummaryItem[];
  corner: SummaryItem[];
  worstRatio?: number | null;
  status: string;
};

type SummaryColumnKey = "support" | "wale" | "brace" | "corner";

type ColumnSummaryRow = {
  moduleName: string;
  label: string;
  sectionName: string;
  ratio?: number | null;
  status: string;
  note: string;
};

function buildLevelSummaryRows(rows: SummaryItem[]): LevelSummaryRow[] {
  const grouped = new Map<string, LevelSummaryRow>();
  for (const row of rows) {
    if (row.group === "柱構件") continue;
    const existing =
      grouped.get(row.label) ??
      {
        label: row.label,
        support: [],
        wale: [],
        brace: [],
        corner: [],
        worstRatio: null,
        status: "OK",
      };
    const bucket = summaryBucket(row.group);
    if (bucket === "support") existing.support.push(row);
    if (bucket === "wale") existing.wale.push(row);
    if (bucket === "brace") existing.brace.push(row);
    if (bucket === "corner") existing.corner.push(row);
    existing.worstRatio =
      existing.worstRatio === null
        ? normalizedRatio(row.utilization_ratio)
        : Math.max(normalizedRatio(existing.worstRatio), normalizedRatio(row.utilization_ratio));
    existing.status = combineStatus([existing.status, row.status]);
    grouped.set(row.label, existing);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      support: sortSummaryItems(row.support),
      wale: sortSummaryItems(row.wale),
      brace: sortSummaryItems(row.brace),
      corner: sortSummaryItems(row.corner),
    }))
    .sort((a, b) => compareLayerLabel(a.label, b.label));
}

const summaryColumnDefinitions: Array<{ key: SummaryColumnKey; label: string }> = [
  { key: "support", label: "水平支撐" },
  { key: "wale", label: "橫擋" },
  { key: "brace", label: "斜撐" },
  { key: "corner", label: "大角撐" },
];

function availableSummaryColumns(rows: SummaryItem[]): Array<{ key: SummaryColumnKey; label: string }> {
  const available = new Set<SummaryColumnKey>();
  rows.forEach((row) => {
    const bucket = summaryBucket(row.group);
    if (bucket !== "other") {
      available.add(bucket);
    }
  });
  return summaryColumnDefinitions.filter((column) => available.has(column.key));
}

function summaryRowItems(row: LevelSummaryRow, key: SummaryColumnKey): SummaryItem[] {
  return row[key];
}

function buildColumnSummaryRows(rows: CheckResult[]): ColumnSummaryRow[] {
  return rows.map((row) => {
    const warnings = Array.isArray(row.details.warnings)
      ? row.details.warnings.filter((item): item is string => typeof item === "string")
      : [];
    return {
      moduleName: row.module_name,
      label: row.label,
      sectionName: String(row.inputs["型號"] ?? "—"),
      ratio: row.utilization_ratio,
      status: row.status,
      note: warnings.length > 0 ? warnings.join("；") : row.controlling_condition,
    };
  });
}

function buildKeyControlRows(rows: CheckResult[]): CheckResult[] {
  const flagged = rows.filter((row) => row.status !== "OK");
  const source = flagged.length > 0 ? flagged : rows;
  return [...source]
    .sort((a, b) => normalizedRatio(b.utilization_ratio) - normalizedRatio(a.utilization_ratio))
    .slice(0, flagged.length > 0 ? undefined : 10);
}

function emptyImportSummary(): ImportSummary {
  return {
    supportCount: 0,
    braceCount: 0,
    floorCount: 0,
    removeCount: 0,
    otherCount: 0,
    candidateCount: 0,
  };
}

function buildImportSummary(analysisImport: AnalysisImportResult): ImportSummary {
  if (analysisImport.events.length > 0) {
    const summary = emptyImportSummary();
    for (const event of analysisImport.events) {
      if (event.classification === "support") summary.supportCount += 1;
      else if (event.classification === "brace") summary.braceCount += 1;
      else if (event.classification === "floor") summary.floorCount += 1;
      else if (event.classification === "remove") summary.removeCount += 1;
      else summary.otherCount += 1;
    }
    summary.candidateCount = summary.supportCount + summary.braceCount;
    return summary;
  }

  const rows = flattenImportedStruts(analysisImport);
  return {
    supportCount: rows.filter((row) => row.classification === "support").length,
    braceCount: rows.filter((row) => row.classification === "brace").length,
    floorCount: 0,
    removeCount: 0,
    otherCount: 0,
    candidateCount: rows.length,
  };
}

function buildStageImportRows(analysisImport: AnalysisImportResult): StageImportRow[] {
  if (analysisImport.events.length > 0) {
    const counts = new Map<number, { candidateCount: number; ignoredCount: number }>();
    for (const event of analysisImport.events) {
      const bucket = counts.get(event.stage_index) ?? { candidateCount: 0, ignoredCount: 0 };
      if (event.classification === "support" || event.classification === "brace") {
        bucket.candidateCount += 1;
      } else {
        bucket.ignoredCount += 1;
      }
      counts.set(event.stage_index, bucket);
    }
    return analysisImport.stages.map((stage) => {
      const bucket = counts.get(stage.index) ?? { candidateCount: 0, ignoredCount: 0 };
      return {
        index: stage.index,
        label: stage.label,
        excavation_depth_m: stage.excavation_depth_m,
        water_level_m: stage.water_level_m,
        candidateCount: bucket.candidateCount,
        ignoredCount: bucket.ignoredCount,
      };
    });
  }

  return analysisImport.stages.map((stage) => ({
    index: stage.index,
    label: stage.label,
    excavation_depth_m: stage.excavation_depth_m,
    water_level_m: stage.water_level_m,
    candidateCount: stage.struts.length,
    ignoredCount: 0,
  }));
}

function flattenImportedStruts(analysisImport: AnalysisImportResult): ImportedStrutRow[] {
  if (analysisImport.events.length > 0) {
    const stageLabels = new Map(analysisImport.stages.map((stage) => [stage.index, stage.label]));
    const rows = analysisImport.events.flatMap((event) => {
      if (!isCandidateEvent(event)) return [];
      if (
        event.depth_m === null ||
        event.depth_m === undefined ||
        event.span_m === null ||
        event.span_m === undefined ||
        event.angle_deg === null ||
        event.angle_deg === undefined ||
        event.load_t === null ||
        event.load_t === undefined ||
        event.stiffness === null ||
        event.stiffness === undefined
      ) {
        return [];
      }
      return [
        {
          stageIndex: event.stage_index,
          stageLabel: event.stage_label,
          installStageIndex: event.stage_index,
          installStageLabel: event.stage_label,
          index: event.butt_no ?? 0,
          classification: event.classification,
          depth_m: event.depth_m,
          span_m: event.span_m,
          angle_deg: event.angle_deg,
          load_t: event.load_t,
          stiffness: event.stiffness,
          stageCases: event.stage_force_cases?.length
            ? event.stage_force_cases
            : (event.control_stage_indices?.length ? event.control_stage_indices : [event.stage_index]).map(
                (stageIndex) => ({
                  stage_index: stageIndex,
                  stage_label: stageLabels.get(stageIndex) ?? `施工階段 ${stageIndex}`,
                  axial_force_t: Number(Number(event.load_t).toFixed(6)),
                }),
              ),
        },
      ];
    });
    if (rows.length > 0) return rows;
  }
  return analysisImport.stages.flatMap((stage) =>
    stage.struts.map((strut) => ({
      stageIndex: stage.index,
      stageLabel: stage.label,
      installStageIndex: stage.index,
      installStageLabel: stage.label,
      index: strut.index,
      classification: isSupportCandidate(strut.angle_deg) ? "support" : "brace",
      depth_m: strut.depth_m,
      span_m: strut.span_m,
      angle_deg: strut.angle_deg,
      load_t: strut.load_t,
      stiffness: strut.stiffness,
    })),
  );
}

function flattenIgnoredImportEvents(analysisImport: AnalysisImportResult): ImportedIgnoredEventRow[] {
  if (analysisImport.events.length === 0) return [];
  return analysisImport.events
    .filter(isIgnoredEvent)
    .map((event) => ({
      stageIndex: event.stage_index,
      stageLabel: event.stage_label,
      classification: event.classification,
      buttNo: event.butt_no,
      depth_m: event.depth_m,
      span_m: event.span_m,
      angle_deg: event.angle_deg,
      load_t: event.load_t,
      stiffness: event.stiffness,
      description: event.description,
    }));
}

function isCandidateEvent(event: AnalysisEvent): event is AnalysisEvent & { classification: "support" | "brace" } {
  return event.classification === "support" || event.classification === "brace";
}

function isIgnoredEvent(
  event: AnalysisEvent,
): event is AnalysisEvent & { classification: "floor" | "remove" | "other" } {
  return event.classification === "floor" || event.classification === "remove" || event.classification === "other";
}

function suggestedSupportType(
  angleDeg: number,
  classification?: ImportedStrutRow["classification"],
): string {
  if (classification === "support") return "水平支撐候選";
  if (classification === "brace") return "斜撐候選";
  if (Math.abs(angleDeg) <= 10) return "水平支撐候選";
  if (Math.abs(angleDeg) < 80) return "斜撐候選";
  return "特殊形式，請確認";
}

function buildImportedAssignments(
  analysisImport: AnalysisImportResult,
): ImportedAssignment[] {
  const consolidated = consolidateImportedStruts(flattenImportedStruts(analysisImport));
  const removals = new Map(
    analysisImport.events
      .filter((event) => event.classification === "remove" && event.butt_no != null)
      .sort((left, right) => left.stage_index - right.stage_index)
      .map((event) => [event.butt_no as number, event]),
  );
  const supports = consolidated.filter((item) => isSupportCandidate(item.angle_deg));
  const braces = consolidated.filter((item) => isBraceCandidate(item.angle_deg));
  return [
    ...assignCandidateRows(supports, "support", removals),
    ...assignCandidateRows(braces, "brace", removals),
  ];
}

type ConsolidatedImportedStrut = ImportedStrutRow & { stageCases: AnalysisForceCase[] };

function stageForceCase(row: ImportedStrutRow): AnalysisForceCase {
  return {
    stage_index: row.stageIndex,
    stage_label: row.stageLabel,
    axial_force_t: Number(row.load_t.toFixed(6)),
  };
}

function mergeStageForceCases(cases: AnalysisForceCase[], row: ImportedStrutRow): AnalysisForceCase[] {
  const merged = new Map(cases.map((item) => [`${item.stage_index}\u0000${item.stage_label}`, { ...item }]));
  const candidates = row.stageCases?.length ? row.stageCases : [stageForceCase(row)];
  for (const candidate of candidates) {
    const key = `${candidate.stage_index}\u0000${candidate.stage_label}`;
    const existing = merged.get(key);
    if (!existing || candidate.axial_force_t >= existing.axial_force_t) merged.set(key, candidate);
  }
  return [...merged.values()].sort((left, right) =>
    left.stage_index - right.stage_index || left.stage_label.localeCompare(right.stage_label),
  );
}

function consolidateImportedStruts(rows: ImportedStrutRow[]): ConsolidatedImportedStrut[] {
  const grouped = new Map<string, ConsolidatedImportedStrut>();
  for (const row of rows) {
    const key = `${row.classification}-${row.index}-${row.depth_m.toFixed(2)}-${Math.abs(row.angle_deg).toFixed(1)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row, stageCases: row.stageCases?.length ? row.stageCases : [stageForceCase(row)] });
      continue;
    }
    const stageCases = mergeStageForceCases(existing.stageCases, row);
    const install = [
      { index: existing.installStageIndex, label: existing.installStageLabel },
      { index: row.installStageIndex, label: row.installStageLabel },
    ].sort((left, right) => left.index - right.index)[0];
    if (row.load_t >= existing.load_t) {
      grouped.set(key, {
        ...row,
        stageCases,
        installStageIndex: install.index,
        installStageLabel: install.label,
      });
      continue;
    }
    existing.stageCases = stageCases;
    existing.installStageIndex = install.index;
    existing.installStageLabel = install.label;
    existing.span_m = Math.max(existing.span_m, row.span_m);
    existing.stiffness = Math.max(existing.stiffness, row.stiffness);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.depth_m - right.depth_m || left.index - right.index || left.stageIndex - right.stageIndex,
  );
}

function assignCandidateRows(
  rows: ConsolidatedImportedStrut[],
  kind: "support" | "brace",
  removals: Map<number, AnalysisEvent>,
): ImportedAssignment[] {
  return rows.map((row, index) => {
    const maximumForce = Math.max(...row.stageCases.map((item) => item.axial_force_t));
    const control = row.stageCases.find((item) => item.axial_force_t === maximumForce) ?? stageForceCase(row);
    const removal = removals.get(row.index);
    return {
      id: `${kind}-${row.index}-${row.depth_m.toFixed(2)}-${index}`,
      kind,
      levelLabel: String(index + 1),
      depth_m: row.depth_m,
      span_m: row.span_m,
      angle_deg: row.angle_deg,
      load_t: row.load_t,
      installStageIndex: row.installStageIndex,
      installStageLabel: row.installStageLabel,
      controlStageIndex: control.stage_index,
      controlStageLabel: control.stage_label,
      removalStageIndex: removal?.stage_index ?? null,
      removalStageLabel: removal?.stage_label ?? "",
      stageCases: row.stageCases,
      stageLabels: row.stageCases.map((item) => item.stage_label),
    };
  });
}

function toCandidateSupportRow(
  item: ImportedAssignment,
  existingRows: SupportRow[],
  index: number,
  useDefaultTempForce: boolean,
): SupportRow {
  const existingTempForce = existingRows[index]?.temp_force_t ?? 0;
  return {
    level_label: item.levelLabel,
    support_count: existingRows[index]?.support_count ?? 1,
    section_name: pickSectionName(existingRows, index),
    axial_force_t: roundValue(item.load_t),
    temp_force_t:
      existingTempForce > 0 ? existingTempForce : normalizeSupportTempForce(0, index, useDefaultTempForce),
    spacing_m: roundValue(item.span_m),
    force_source: "analysis_import",
    analysis_stage_cases: item.stageCases,
    analysis_install_stage_index: item.installStageIndex,
    analysis_install_stage_label: item.installStageLabel,
    analysis_control_stage_index: item.controlStageIndex,
    analysis_control_stage_label: item.controlStageLabel,
    analysis_removal_stage_index: item.removalStageIndex,
    analysis_removal_stage_label: item.removalStageLabel,
    removal_transfer_mode: "unassigned",
    removal_transfer_target: "",
    removal_transfer_direction: "",
    removal_transfer_share_percent: 100,
    removal_transfer_additional_receivers: [],
    removal_transfer_basis: "",
    removal_transfer_confirmed: false,
    construction_step_label: "",
    analysis_mapping_confirmed: false,
    analysis_mapping_basis: "",
  };
}

function toCandidateBraceRow(
  item: ImportedAssignment,
  existingRows: BraceRow[],
  index: number,
): BraceRow {
  const baseLength = Math.max(item.span_m, 0.001);
  const tributaryLineLoad =
    item.load_t * Math.sin((Math.abs(item.angle_deg) * Math.PI) / 180) / baseLength;
  return {
    level_label: item.levelLabel,
    section_name: pickSectionName(existingRows, index),
    l1_m: roundValue(baseLength),
    l2_m: roundValue(baseLength),
    angle_deg: roundValue(item.angle_deg),
    tributary_line_load_tf_per_m: roundValue(tributaryLineLoad),
    force_source: "analysis_import",
    analysis_stage_cases: item.stageCases,
    analysis_install_stage_index: item.installStageIndex,
    analysis_install_stage_label: item.installStageLabel,
    analysis_control_stage_index: item.controlStageIndex,
    analysis_control_stage_label: item.controlStageLabel,
    analysis_removal_stage_index: item.removalStageIndex,
    analysis_removal_stage_label: item.removalStageLabel,
    removal_transfer_mode: "unassigned",
    removal_transfer_target: "",
    removal_transfer_direction: "",
    removal_transfer_share_percent: 100,
    removal_transfer_additional_receivers: [],
    removal_transfer_basis: "",
    removal_transfer_confirmed: false,
    construction_step_label: "",
    analysis_mapping_confirmed: false,
    analysis_mapping_basis: "",
  };
}

function pickSectionName<T extends { section_name: string }>(rows: T[], index: number): string {
  return rows[index]?.section_name || rows[0]?.section_name || "";
}

function roundValue(value: number): number {
  return Number(value.toFixed(3));
}

function isSupportCandidate(angleDeg: number): boolean {
  return Math.abs(angleDeg) <= 10;
}

function isBraceCandidate(angleDeg: number): boolean {
  return Math.abs(angleDeg) > 10 && Math.abs(angleDeg) < 80;
}

function candidateKindLabel(kind: ImportedAssignment["kind"]): string {
  return kind === "support" ? "水平支撐候選" : "斜撐候選";
}

function ignoredEventLabel(classification: ImportedIgnoredEventRow["classification"]): string {
  if (classification === "floor") return "樓版 / 樓層事件";
  if (classification === "remove") return "拆撐事件";
  return "其他事件";
}

function otherAnalysisSide(side: AnalysisSourceSide): AnalysisSourceSide {
  return side === "top" ? "bottom" : "top";
}

function deriveSingleAnalysisSide(
  topMode: AnalysisSourceMode,
  bottomMode: AnalysisSourceMode,
): AnalysisSourceSide | null {
  const topActive = topMode !== "unused";
  const bottomActive = bottomMode !== "unused";
  if (topActive && !bottomActive) return "top";
  if (bottomActive && !topActive) return "bottom";
  return null;
}

function deriveAnalysisWorkflowMode(
  topMode: AnalysisSourceMode,
  bottomMode: AnalysisSourceMode,
): AnalysisWorkflowMode {
  if (topMode === "manual" && bottomMode === "unused") return "single_manual";
  if (topMode === "unused" && bottomMode === "manual") return "single_manual";
  if (topMode === "import" && bottomMode === "unused") return "single_import";
  if (topMode === "unused" && bottomMode === "import") return "single_import";
  if (topMode === "manual" && bottomMode === "manual") return "dual_manual";
  if (topMode === "import" && bottomMode === "import") return "dual_import";
  return "mixed";
}

function analysisWorkflowModeLabel(mode: AnalysisWorkflowMode): string {
  return analysisWorkflowOptions.find((option) => option.value === mode)?.label ?? "進階混合";
}

function analysisWorkflowHint(
  mode: AnalysisWorkflowMode,
  side: AnalysisSourceSide,
): string {
  const sideLabel = sidePrefixLabel(side);
  if (mode === "single_manual") {
    return `單層手動模式會只顯示 ${sideLabel} 的整頁輸入表，適合直接輸入 N1、N2、間距與支撐型號。`;
  }
  if (mode === "dual_manual") {
    return "雙層手動模式改成上下堆疊，先完成上層，再往下整理下層，閱讀與輸入都更直覺。";
  }
  if (mode === "single_import") {
    return `單層匯入模式只整理 ${sideLabel} 一側資料，可先核對事件分類與候選列，再帶到後續設計頁。`;
  }
  if (mode === "dual_import") {
    return "雙層匯入模式會依序整理上層與下層，不再一開始就把兩張窄卡同時攤開。";
  }
  return "進階混合模式適合上層與下層採不同資料來源時使用，可個別切換匯入、手動或不使用。";
}

function setAnalysisSourceModeOnProject(
  project: ProjectState,
  side: AnalysisSourceSide,
  mode: AnalysisSourceMode,
): ProjectState {
  const nextProject = {
    ...project,
    top_analysis_source: { ...project.top_analysis_source },
    bottom_analysis_source: { ...project.bottom_analysis_source },
    calculation_options: { ...project.calculation_options },
    calculation_results: null,
  };
  const targetSource =
    side === "top" ? nextProject.top_analysis_source : nextProject.bottom_analysis_source;
  targetSource.mode = mode;

  if (side === "top") {
    if (mode === "unused") {
      nextProject.calculation_options.include_top_supports = false;
      nextProject.calculation_options.include_top_wales = false;
      nextProject.calculation_options.include_top_braces = false;
      if (!nextProject.calculation_options.include_bottom_supports) {
        nextProject.calculation_options.include_bottom_supports = true;
      }
    } else {
      nextProject.calculation_options.include_top_supports = true;
      if (nextProject.top_supports.length === 0) {
        nextProject.top_supports = [
          emptySupportRow(0, nextProject.calculation_options.auto_temp_force_top_supports),
        ];
      }
    }
  } else if (mode === "unused") {
    nextProject.calculation_options.include_bottom_supports = false;
    nextProject.calculation_options.include_bottom_wales = false;
    nextProject.calculation_options.include_bottom_braces = false;
    if (!nextProject.calculation_options.include_top_supports) {
      nextProject.calculation_options.include_top_supports = true;
    }
  } else {
    nextProject.calculation_options.include_bottom_supports = true;
    if (nextProject.bottom_supports.length === 0) {
      nextProject.bottom_supports = [
        emptySupportRow(0, nextProject.calculation_options.auto_temp_force_bottom_supports),
      ];
    }
  }

  return nextProject;
}

function analysisSourceModeLabel(mode: AnalysisSourceMode): string {
  if (mode === "import") return "匯入分析檔";
  if (mode === "manual") return "手動輸入";
  return "不使用";
}

function supportModeLabel(options: CalculationOptions): string {
  if (options.include_top_supports && options.include_bottom_supports) {
    return "雙向支撐";
  }
  if (options.include_top_supports) {
    return "單向支撐（上層）";
  }
  if (options.include_bottom_supports) {
    return "單向支撐（下層）";
  }
  return "未設定";
}

function sidePrefixLabel(side: "top" | "bottom"): string {
  return side === "top" ? "上層" : "下層";
}

function isSingleModuleMode(topEnabled: boolean, bottomEnabled: boolean): boolean {
  return topEnabled !== bottomEnabled;
}

function activeModuleSide(topEnabled: boolean, bottomEnabled: boolean): "top" | "bottom" | null {
  if (topEnabled && !bottomEnabled) return "top";
  if (bottomEnabled && !topEnabled) return "bottom";
  return null;
}

function editingModuleTitle(
  side: "top" | "bottom",
  baseName: string,
  topEnabled: boolean,
  bottomEnabled: boolean,
): string {
  const activeSide = activeModuleSide(topEnabled, bottomEnabled);
  if (activeSide === side) return baseName;
  return `${sidePrefixLabel(side)}${baseName}`;
}

function hasTextValue(value: string): boolean {
  return value.trim().length > 0;
}

function hasPositiveValue(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSupportRowComplete(row: SupportRow): boolean {
  return hasTextValue(row.level_label) && row.support_count > 0 && hasTextValue(row.section_name) && hasPositiveValue(row.spacing_m) && isAnalysisMappingComplete(row);
}

function isWaleRowComplete(row: WaleRow): boolean {
  return hasTextValue(row.level_label) && row.wale_count > 0 && hasTextValue(row.section_name) && hasPositiveValue(row.span_m) && hasPositiveValue(row.support_spacing_m);
}

function isBraceRowComplete(row: BraceRow): boolean {
  return hasTextValue(row.level_label) && hasTextValue(row.section_name) && hasPositiveValue(row.l1_m) && hasPositiveValue(row.l2_m) && hasPositiveValue(row.angle_deg) && isAnalysisMappingComplete(row);
}

function isAnalysisMappingComplete(row: SupportRow | BraceRow): boolean {
  if (row.force_source !== "analysis_import") return true;
  return Boolean(
    row.analysis_mapping_confirmed &&
    row.analysis_install_stage_index != null &&
    row.analysis_install_stage_label?.trim() &&
    row.construction_step_label?.trim() &&
    row.analysis_mapping_basis?.trim() &&
    (row.analysis_stage_cases?.length ?? 0) > 0,
  );
}

function isCornerBraceRowComplete(row: CornerBraceRow): boolean {
  return hasTextValue(row.level_label) && hasTextValue(row.section_name) && hasPositiveValue(row.length_m);
}

function columnInputComplete(column: ColumnScenarioInput): boolean {
  return (
    hasTextValue(column.column_section_name) &&
    hasTextValue(column.foundation_type) &&
    hasTextValue(column.foundation_shape) &&
    hasPositiveValue(column.foundation_size_x_m) &&
    hasPositiveValue(column.foundation_size_y_m) &&
    hasPositiveValue(column.column_length_m) &&
    hasPositiveValue(column.kh_kg_per_cm3) &&
    hasPositiveValue(column.bottom_to_excavation_distance_m) &&
    hasPositiveValue(column.embedment_length_cm) &&
    hasPositiveValue(column.concrete_strength_kg_per_cm2)
  );
}

function rowCompletionSummary<T>(rows: T[], checker: (row: T) => boolean): string {
  if (rows.length === 0) return "尚未建立";
  const completed = rows.filter(checker).length;
  if (completed === rows.length) return `已齊 ${completed}/${rows.length}`;
  return `待補 ${rows.length - completed} 列`;
}

function columnCompletionSummary(column: ColumnScenarioInput): string {
  if (!column.enabled) return "未納入檢討";
  return columnInputComplete(column) ? "已齊" : "待補 1 組";
}

function moduleStateSummary(enabled: boolean, rowCount: number, completion: string): string {
  if (!enabled) return `不考慮 / 保留 ${rowCount} 列`;
  return `${rowCount} 列 / ${completion}`;
}

function moduleShortcutLabel(label: string, enabled: boolean, rowCount: number, completion: string): string {
  if (!enabled) return `${label} · 不考慮`;
  if (completion.startsWith("待補")) return `${label} · ${rowCount}列 · ${completion}`;
  if (completion.startsWith("已齊")) return `${label} · ${rowCount}列 · 已齊`;
  return `${label} · ${completion}`;
}

function usesConcreteWallParameters(wallType: string | null | undefined): boolean {
  return normalizeWallTypeValue(wallType ?? "") === "連續壁";
}

function normalizeWallTypeValue(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.includes("連續") || compact.includes("连续")) return "連續壁";
  if (compact.includes("鋼板")) return "鋼板樁";
  return "其他";
}

function countCustomizedAdvancedSettings(
  params: ProjectState["basic_parameters"] | null | undefined,
): number {
  if (!params) return 0;
  return ([
    !nearlyEqual(params.alpha_support, ADVANCED_PARAMETER_DEFAULTS.alpha_support),
    !nearlyEqual(params.alpha_wale, ADVANCED_PARAMETER_DEFAULTS.alpha_wale),
    !nearlyEqual(params.alpha_brace, ADVANCED_PARAMETER_DEFAULTS.alpha_brace),
    !nearlyEqual(params.alpha_corner_brace, ADVANCED_PARAMETER_DEFAULTS.alpha_corner_brace),
    !nearlyEqual(params.alpha_column, ADVANCED_PARAMETER_DEFAULTS.alpha_column),
    !nearlyEqual(params.psi_material, ADVANCED_PARAMETER_DEFAULTS.psi_material),
  ].filter(Boolean)).length;
}

function buildComponentTabSummary(
  items: Array<string | null>,
  options: { emptyLabel: string; completeLabel: string },
): string {
  const values = items.filter(Boolean) as string[];
  if (values.length === 0) return options.emptyLabel;
  if (values.every((value) => value.startsWith("已齊"))) return options.completeLabel;
  const waiting = values.filter((value) => value.startsWith("待補")).length;
  if (waiting > 0) return `待補 ${waiting} 組`;
  if (values.some((value) => value.startsWith("尚未"))) return "尚未建立";
  return values.join(" / ");
}

function buildComponentTabTone(
  items: Array<string | null>,
  emptyAsMuted = false,
): "ok" | "warn" | "muted" {
  const values = items.filter(Boolean) as string[];
  if (values.length === 0) return emptyAsMuted ? "muted" : "warn";
  if (values.every((value) => value.startsWith("已齊"))) return "ok";
  return "warn";
}

function componentTabForPanel(panelId: string): ComponentTabKey | null {
  if (panelId.includes("supports")) return "support";
  if (panelId.includes("wales")) return "wale";
  if (panelId.includes("braces")) return panelId.includes("corner") ? "corner" : "brace";
  return null;
}

function analysisSourceCompletion(
  mode: AnalysisSourceMode,
  source: AnalysisSideSource,
  manualRows: SupportRow[],
  importedAssignments: ImportedAssignment[],
  summary: ImportSummary,
): string {
  if (mode === "unused") return "未納入";
  if (mode === "manual") return rowCompletionSummary(manualRows, isSupportRowComplete);
  if (!source.import_result.source_name) return "尚未匯入";
  if (summary.otherCount > 0) return `待判讀 ${summary.otherCount} 筆`;
  if (importedAssignments.length > 0) return `已整理 ${importedAssignments.length} 筆`;
  if (summary.candidateCount > 0) return "待重建草稿";
  return "未辨識候選";
}

function analysisSourceTone(mode: AnalysisSourceMode, completion: string): string {
  if (mode === "unused") return "muted";
  if (completion.startsWith("已齊") || completion.startsWith("已整理")) return "ok";
  if (completion.startsWith("尚未")) return "muted";
  return "warn";
}

function columnVariantLabel(variant: ColumnScenarioInput["variant"]): string {
  return (
    columnVariantOptions.find((option) => option.value === variant)?.label ?? "柱構件"
  );
}

function activeSupportRows(project: ProjectState): SupportRow[] {
  return [
    ...(project.calculation_options.include_top_supports ? project.top_supports : []),
    ...(project.calculation_options.include_bottom_supports ? project.bottom_supports : []),
  ].map((row) => ({ ...row }));
}

function createColumnScenario(
  project: ProjectState,
  variant: ColumnScenarioInput["variant"],
): ColumnScenarioInput {
  return {
    column_id: `COL-${crypto.randomUUID().toUpperCase()}`,
    title: columnVariantLabel(variant),
    variant,
    enabled: true,
    column_section_name: "",
    support_rows: activeSupportRows(project),
    foundation_type: foundationTypeOptions[0],
    foundation_shape: foundationShapeOptions[0],
    foundation_size_x_m: 0.8,
    foundation_size_y_m: 2.5,
    column_length_m: 20.0,
    kh_kg_per_cm3: 4.0,
    pile_width_cm: null,
    bottom_to_excavation_distance_m: 4.0,
    eccentricity_x_m: null,
    eccentricity_y_m: 0.0,
    embedment_length_cm: 300.0,
    concrete_strength_kg_per_cm2: 175.0,
    soil_layers: toFoundationSoils(project.analysis_import.soils),
    construction_stage_load_t: 0.0,
    construction_stage_load_source: null,
    construction_stage_loads: [],
    compression_fs: 2.0,
    tension_fs: 3.0,
    pile_unit_weight_t_per_m3: 1.8,
  };
}

function defaultColumnEccentricityX(column: ColumnScenarioInput, section: SectionProperty | null): number {
  if (column.eccentricity_x_m !== null && column.eccentricity_x_m !== undefined) {
    return column.eccentricity_x_m;
  }
  if (section) {
    return roundValue(section.depth_cm / 200.0 + 0.2);
  }
  return 0.2;
}

function summaryBucket(group: string): "support" | "wale" | "brace" | "corner" | "other" {
  if (group.includes("水平支撐")) return "support";
  if (group.includes("橫擋")) return "wale";
  if (group.includes("斜撐")) return "brace";
  if (group.includes("角撐")) return "corner";
  return "other";
}

function sortSummaryItems(items: SummaryItem[]): SummaryItem[] {
  return [...items].sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
}

function groupOrder(group: string): number {
  if (group.startsWith("上")) return 0;
  if (group.startsWith("下")) return 1;
  return 2;
}

function groupPrefix(group: string, options: CalculationOptions): string {
  if (group.includes("水平支撐") && isSingleModuleMode(options.include_top_supports, options.include_bottom_supports)) return "";
  if (group.includes("橫擋") && isSingleModuleMode(options.include_top_wales, options.include_bottom_wales)) return "";
  if (group.includes("斜撐") && isSingleModuleMode(options.include_top_braces, options.include_bottom_braces)) return "";
  if (group.startsWith("上")) return "上";
  if (group.startsWith("下")) return "下";
  return "";
}

function summaryHeadline(item: SummaryItem, options: CalculationOptions): string {
  return `${groupPrefix(item.group, options)} ${fmtRatio(item.utilization_ratio)} ${item.status}`.trim();
}

function summarySectionName(item: SummaryItem): string {
  return item.section_name ? `型號：${item.section_name}` : "型號：未選型號";
}

function wallMomentStrength(params: ProjectState["basic_parameters"] | null | undefined): number {
  if (!params || !usesConcreteWallParameters(params.wall_type)) return 0;
  return (
    0.9 *
    2.0 *
    Math.sqrt(params.wall_fc_kg_per_cm2) *
    (100.0 * params.wall_thickness_cm * params.wall_thickness_cm / 6.0) /
    100000.0
  );
}

function wallShearStrength(params: ProjectState["basic_parameters"] | null | undefined): number {
  if (!params || !usesConcreteWallParameters(params.wall_type)) return 0;
  return (
    0.75 *
    0.53 *
    Math.sqrt(params.wall_fc_kg_per_cm2) *
    (100.0 * params.wall_thickness_cm) /
    1000.0
  );
}

function displayCheckModuleName(moduleName: string, options: CalculationOptions): string {
  if (moduleName.includes("水平支撐") && isSingleModuleMode(options.include_top_supports, options.include_bottom_supports)) {
    return "水平支撐";
  }
  if (moduleName.includes("橫擋") && isSingleModuleMode(options.include_top_wales, options.include_bottom_wales)) {
    return "橫擋";
  }
  if (moduleName.includes("斜撐") && isSingleModuleMode(options.include_top_braces, options.include_bottom_braces)) {
    return "斜撐";
  }
  return moduleName;
}

function locateLabelForModule(moduleName: string): string {
  if (moduleName.includes("柱")) return "前往柱構件";
  return "前往支撐設定";
}

function panelTargetForModule(
  moduleName: string,
  options: CalculationOptions,
): { step: number; panelId?: string } {
  if (moduleName.includes("柱")) {
    return { step: STEP_COLUMNS, panelId: "column-settings-panel" };
  }
  if (moduleName.includes("角撐")) {
    return { step: STEP_COMPONENTS, panelId: "corner-braces-panel" };
  }
  const supportSide = inferModuleSide(moduleName, options);
  if (moduleName.includes("水平支撐")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-supports-panel" : "top-supports-panel" };
  }
  if (moduleName.includes("橫擋")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-wales-panel" : "top-wales-panel" };
  }
  if (moduleName.includes("斜撐")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-braces-panel" : "top-braces-panel" };
  }
  return { step: STEP_COMPONENTS };
}

function inferModuleSide(moduleName: string, options: CalculationOptions): "top" | "bottom" {
  if (moduleName.startsWith("下")) return "bottom";
  if (moduleName.startsWith("上")) return "top";
  if (moduleName.includes("水平支撐")) {
    return activeModuleSide(options.include_top_supports, options.include_bottom_supports) ?? "top";
  }
  if (moduleName.includes("橫擋")) {
    return activeModuleSide(options.include_top_wales, options.include_bottom_wales) ?? "top";
  }
  if (moduleName.includes("斜撐")) {
    return activeModuleSide(options.include_top_braces, options.include_bottom_braces) ?? "top";
  }
  return "top";
}

function panelFocusClass(activePanelId: string | null, panelId: string): string {
  return activePanelId === panelId ? "panel-focus-ring" : "";
}

function combineStatus(statuses: string[]): string {
  if (statuses.includes("NG")) return "NG";
  if (statuses.includes("Say~OK")) return "Say~OK";
  return "OK";
}

function compareLayerLabel(left: string, right: string): number {
  const leftValue = Number(left);
  const rightValue = Number(right);
  if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
    return leftValue - rightValue;
  }
  return left.localeCompare(right, "zh-Hant");
}

function normalizedRatio(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

function fmtRatio(value: number | null | undefined): string {
  return fmt(normalizedRatio(value));
}

function formatDemandAllowable(row: CheckResult): string {
  return `${fmt(row.computed_value)} / ${fmt(row.allowable_value)}`;
}

function statusTone(status: string): "ok" | "warn" | "ng" {
  if (status === "NG") return "ng";
  if (status === "Say~OK") return "warn";
  return "ok";
}

function fmt(value: number | string | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return `${value.toFixed(3)}${suffix ? ` ${suffix}` : ""}`;
  return value;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtClock(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function serializeProjectState(project: ProjectState): string {
  return JSON.stringify(project);
}

export default App;
