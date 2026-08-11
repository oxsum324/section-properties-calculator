import type {
  ReceiverCapacityEvidence,
  ReceiverSupplementalCheck,
  ReceiverSupplementalCheckId,
} from "./types";

export const RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION = 2 as const;
export const RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND = "receiver-supplemental-evidence-template-library" as const;
export const RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY = "excavation.receiverSupplementalEvidenceTemplates.v2";
export const LEGACY_RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY = "excavation.receiverSupplementalEvidenceTemplates.v1";
export const MAX_RECEIVER_EVIDENCE_TEMPLATES = 100;
export const MAX_RECEIVER_EVIDENCE_TEMPLATE_CHANGE_LOG = 50;

const LEGACY_SCHEMA_VERSION = 1;
const SUPPLEMENTAL_CHECK_IDS: ReceiverSupplementalCheckId[] = [
  "connection",
  "bearing",
  "receiving-structure",
  "bracing-and-effective-length",
  "construction-sequence-and-preload",
];

const CHANGE_FIELD_LABELS = {
  name: "範本名稱",
  basis: "查核依據",
  documentReference: "文件編號",
  revision: "文件版次",
  issuedDate: "文件日期",
  pageReference: "頁碼／章節",
} as const;

export type ReceiverEvidenceTemplateMetadata = Pick<
  ReceiverCapacityEvidence,
  "documentReference" | "revision" | "issuedDate" | "pageReference"
>;

export type ReceiverEvidenceTemplateChange = {
  revision: number;
  recordedAt: string;
  changedFields: string[];
};

export type ReceiverEvidenceTemplateGovernance = {
  status: "draft" | "approved";
  revision: number;
  reviewedBy: string;
  reviewedAt: string;
  validUntil: string;
  changeLog: ReceiverEvidenceTemplateChange[];
};

export type ReceiverEvidenceTemplate = {
  templateId: string;
  name: string;
  checkId: ReceiverSupplementalCheckId;
  basis: string;
  evidence: ReceiverEvidenceTemplateMetadata;
  governance: ReceiverEvidenceTemplateGovernance;
  createdAt: string;
  updatedAt: string;
};

export type ReceiverEvidenceTemplateLibrary = {
  schemaVersion: typeof RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION;
  kind: typeof RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND;
  exportedAt: string;
  boundary: {
    descriptiveFieldsOnly: true;
    evidenceFileNameExcluded: true;
    evidenceFileSha256Excluded: true;
    actualEvidenceFileRequiredAfterApply: true;
    governanceRequiredBeforeApply: true;
    importedApprovalRequiresLocalReview: true;
  };
  templates: ReceiverEvidenceTemplate[];
};

export type ReceiverEvidenceTemplateAvailability = {
  usable: boolean;
  status: "draft" | "approved" | "expired";
  reason: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式不正確。`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength = 500): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不可空白。`);
  if (text.length > maxLength) throw new Error(`${label}過長。`);
  return text;
}

function optionalText(value: unknown, label: string, maxLength = 500): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${label}格式不正確。`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${label}過長。`);
  return text;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label}須為正整數。`);
  return Number(value);
}

function allowedKeys(source: Record<string, unknown>, keys: string[], label: string): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(source).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`${label}含有不允許的欄位：${unexpected.join("、")}。`);
}

function isoDate(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label}須為 YYYY-MM-DD。`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label}不是有效日期。`);
  }
  return text;
}

function optionalIsoDate(value: unknown, label: string): string {
  const text = optionalText(value, label);
  return text ? isoDate(text, label) : "";
}

function isoDateTime(value: unknown, label: string): string {
  const text = requiredText(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new Error(`${label}不是有效 ISO 8601 日期時間。`);
  }
  return text;
}

function optionalIsoDateTime(value: unknown, label: string): string {
  const text = optionalText(value, label);
  return text ? isoDateTime(text, label) : "";
}

function checkId(value: unknown): ReceiverSupplementalCheckId {
  if (typeof value !== "string" || !SUPPLEMENTAL_CHECK_IDS.includes(value as ReceiverSupplementalCheckId)) {
    throw new Error("範本的補充查核類別不受支援。");
  }
  return value as ReceiverSupplementalCheckId;
}

function validateChangeLog(value: unknown, currentRevision: number): ReceiverEvidenceTemplateChange[] {
  if (!Array.isArray(value) || !value.length) throw new Error("範本缺少修訂紀錄。");
  if (value.length > MAX_RECEIVER_EVIDENCE_TEMPLATE_CHANGE_LOG) {
    throw new Error(`範本最多保留 ${MAX_RECEIVER_EVIDENCE_TEMPLATE_CHANGE_LOG} 筆修訂紀錄。`);
  }
  let previousRevision = 0;
  const changeLog = value.map((item, index) => {
    const source = record(item, `修訂紀錄 ${index + 1}`);
    allowedKeys(source, ["revision", "recordedAt", "changedFields"], `修訂紀錄 ${index + 1}`);
    const revision = positiveInteger(source.revision, `修訂紀錄 ${index + 1} 版號`);
    if (revision <= previousRevision) throw new Error("範本修訂紀錄版號必須遞增且不得重複。");
    previousRevision = revision;
    if (!Array.isArray(source.changedFields) || !source.changedFields.length || source.changedFields.length > 10) {
      throw new Error(`修訂紀錄 ${index + 1} 必須列出 1 至 10 個變更欄位。`);
    }
    const changedFields = source.changedFields.map((field, fieldIndex) => (
      requiredText(field, `修訂紀錄 ${index + 1} 變更欄位 ${fieldIndex + 1}`, 100)
    ));
    if (new Set(changedFields).size !== changedFields.length) throw new Error("同一筆修訂紀錄不得重複列出變更欄位。");
    return {
      revision,
      recordedAt: isoDateTime(source.recordedAt, `修訂紀錄 ${index + 1} 時間`),
      changedFields,
    };
  });
  if (changeLog[changeLog.length - 1].revision !== currentRevision) {
    throw new Error("範本目前版號必須與最新修訂紀錄一致。");
  }
  return changeLog;
}

function validateGovernance(value: unknown): ReceiverEvidenceTemplateGovernance {
  const source = record(value, "範本治理資料");
  allowedKeys(source, ["status", "revision", "reviewedBy", "reviewedAt", "validUntil", "changeLog"], "範本治理資料");
  if (source.status !== "draft" && source.status !== "approved") throw new Error("範本治理狀態不受支援。");
  const revision = positiveInteger(source.revision, "範本版號");
  const reviewedBy = optionalText(source.reviewedBy, "範本審核人", 100);
  const reviewedAt = optionalIsoDateTime(source.reviewedAt, "範本核准時間");
  const validUntil = optionalIsoDate(source.validUntil, "範本有效期限");
  if (source.status === "approved") {
    if (!reviewedBy || !reviewedAt || !validUntil) throw new Error("已核准範本必須具備審核人、核准時間與有效期限。");
    if (validUntil < reviewedAt.slice(0, 10)) throw new Error("範本有效期限不得早於核准日期。");
  } else if (reviewedBy || reviewedAt || validUntil) {
    throw new Error("待核准範本不得殘留審核人、核准時間或有效期限。");
  }
  return {
    status: source.status,
    revision,
    reviewedBy,
    reviewedAt,
    validUntil,
    changeLog: validateChangeLog(source.changeLog, revision),
  };
}

function validateTemplateCore(source: Record<string, unknown>): Omit<ReceiverEvidenceTemplate, "governance"> {
  const evidence = record(source.evidence, "範本文件資料");
  if ("fileName" in evidence || "fileSha256" in evidence) {
    throw new Error("補充證據範本不得保存證據檔名或 SHA-256；套用後須重新選取實際檔案。");
  }
  allowedKeys(evidence, ["documentReference", "revision", "issuedDate", "pageReference"], "範本文件資料");
  return {
    templateId: requiredText(source.templateId, "範本識別碼"),
    name: requiredText(source.name, "範本名稱"),
    checkId: checkId(source.checkId),
    basis: requiredText(source.basis, "查核依據"),
    evidence: {
      documentReference: requiredText(evidence.documentReference, "文件編號"),
      revision: requiredText(evidence.revision, "文件版次"),
      issuedDate: isoDate(evidence.issuedDate, "文件日期"),
      pageReference: requiredText(evidence.pageReference, "頁碼／章節"),
    },
    createdAt: isoDateTime(source.createdAt, "範本建立時間"),
    updatedAt: isoDateTime(source.updatedAt, "範本更新時間"),
  };
}

export function validateReceiverEvidenceTemplate(value: unknown): ReceiverEvidenceTemplate {
  const source = record(value, "補充證據範本");
  allowedKeys(source, ["templateId", "name", "checkId", "basis", "evidence", "governance", "createdAt", "updatedAt"], "補充證據範本");
  const core = validateTemplateCore(source);
  if (core.createdAt > core.updatedAt) throw new Error("範本更新時間不得早於建立時間。");
  const governance = validateGovernance(source.governance);
  if (governance.changeLog.some((entry) => entry.recordedAt < core.createdAt || entry.recordedAt > core.updatedAt)) {
    throw new Error("範本修訂紀錄時間必須落在建立與更新時間之間。");
  }
  return { ...core, governance };
}

function legacyTemplate(value: unknown): ReceiverEvidenceTemplate {
  const source = record(value, "舊版補充證據範本");
  allowedKeys(source, ["templateId", "name", "checkId", "basis", "evidence", "createdAt", "updatedAt"], "舊版補充證據範本");
  const core = validateTemplateCore(source);
  if (core.createdAt > core.updatedAt) throw new Error("舊版範本更新時間不得早於建立時間。");
  return validateReceiverEvidenceTemplate({
    ...core,
    governance: {
      status: "draft",
      revision: 1,
      reviewedBy: "",
      reviewedAt: "",
      validUntil: "",
      changeLog: [{ revision: 1, recordedAt: core.updatedAt, changedFields: ["由 v1 遷移，待本機核准"] }],
    },
  });
}

function checkSnapshot(check: ReceiverSupplementalCheck, name: string) {
  if (check.status !== "passed") throw new Error("只有標示為通過的補充查核才能儲存為範本。");
  return {
    name,
    checkId: check.checkId,
    basis: check.basis,
    evidence: {
      documentReference: check.evidence?.documentReference,
      revision: check.evidence?.revision,
      issuedDate: check.evidence?.issuedDate,
      pageReference: check.evidence?.pageReference,
    },
  };
}

export function templateFromSupplementalCheck(
  check: ReceiverSupplementalCheck,
  templateId: string,
  name: string,
  timestamp: string,
): ReceiverEvidenceTemplate {
  const snapshot = checkSnapshot(check, name);
  return validateReceiverEvidenceTemplate({
    templateId,
    ...snapshot,
    governance: {
      status: "draft",
      revision: 1,
      reviewedBy: "",
      reviewedAt: "",
      validUntil: "",
      changeLog: [{ revision: 1, recordedAt: timestamp, changedFields: ["建立範本"] }],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function reviseReceiverEvidenceTemplate(
  current: ReceiverEvidenceTemplate,
  check: ReceiverSupplementalCheck,
  name: string,
  timestamp: string,
): ReceiverEvidenceTemplate {
  const validated = validateReceiverEvidenceTemplate(current);
  const snapshot = checkSnapshot(check, name);
  if (snapshot.checkId !== validated.checkId) throw new Error("範本類別與目前補充查核不一致。");
  const changedFields = Object.entries(CHANGE_FIELD_LABELS).flatMap(([field, label]) => {
    const before = field === "name" || field === "basis"
      ? validated[field]
      : validated.evidence[field as keyof ReceiverEvidenceTemplateMetadata];
    const after = field === "name" || field === "basis"
      ? snapshot[field]
      : snapshot.evidence[field as keyof ReceiverEvidenceTemplateMetadata];
    return before === after ? [] : [label];
  });
  if (!changedFields.length) return validated;
  const revision = validated.governance.revision + 1;
  const changeLog = [...validated.governance.changeLog, { revision, recordedAt: timestamp, changedFields }]
    .slice(-MAX_RECEIVER_EVIDENCE_TEMPLATE_CHANGE_LOG);
  return validateReceiverEvidenceTemplate({
    ...validated,
    ...snapshot,
    governance: {
      status: "draft",
      revision,
      reviewedBy: "",
      reviewedAt: "",
      validUntil: "",
      changeLog,
    },
    updatedAt: timestamp,
  });
}

export function approveReceiverEvidenceTemplate(
  template: ReceiverEvidenceTemplate,
  reviewedBy: string,
  reviewedAt: string,
  validUntil: string,
): ReceiverEvidenceTemplate {
  const validated = validateReceiverEvidenceTemplate(template);
  return validateReceiverEvidenceTemplate({
    ...validated,
    governance: {
      ...validated.governance,
      status: "approved",
      reviewedBy,
      reviewedAt,
      validUntil,
    },
    updatedAt: reviewedAt,
  });
}

export function revokeReceiverEvidenceTemplateApproval(
  template: ReceiverEvidenceTemplate,
  timestamp: string,
): ReceiverEvidenceTemplate {
  const validated = validateReceiverEvidenceTemplate(template);
  return validateReceiverEvidenceTemplate({
    ...validated,
    governance: {
      ...validated.governance,
      status: "draft",
      reviewedBy: "",
      reviewedAt: "",
      validUntil: "",
    },
    updatedAt: timestamp,
  });
}

export function receiverEvidenceTemplateAvailability(
  template: ReceiverEvidenceTemplate,
  onDate: string,
): ReceiverEvidenceTemplateAvailability {
  const validated = validateReceiverEvidenceTemplate(template);
  const currentDate = isoDate(onDate, "範本使用日期");
  if (validated.governance.status !== "approved") {
    return { usable: false, status: "draft", reason: "待本機核准" };
  }
  if (validated.governance.validUntil < currentDate) {
    return { usable: false, status: "expired", reason: `已於 ${validated.governance.validUntil} 到期` };
  }
  return { usable: true, status: "approved", reason: `有效至 ${validated.governance.validUntil}` };
}

export function applyReceiverEvidenceTemplate(
  check: ReceiverSupplementalCheck,
  template: ReceiverEvidenceTemplate,
  onDate = new Date().toISOString().slice(0, 10),
): ReceiverSupplementalCheck {
  const validated = validateReceiverEvidenceTemplate(template);
  if (check.checkId !== validated.checkId) throw new Error("範本類別與目前補充查核不一致。");
  const availability = receiverEvidenceTemplateAvailability(validated, onDate);
  if (!availability.usable) throw new Error(`補充證據範本目前不可套用：${availability.reason}。`);
  return {
    checkId: check.checkId,
    status: "passed",
    basis: validated.basis,
    evidence: {
      ...validated.evidence,
      fileName: "",
      fileSha256: "",
    },
  };
}

export function buildReceiverEvidenceTemplateLibrary(
  templates: ReceiverEvidenceTemplate[],
  exportedAt: string,
): ReceiverEvidenceTemplateLibrary {
  return {
    schemaVersion: RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION,
    kind: RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND,
    exportedAt: isoDateTime(exportedAt, "範本庫匯出時間"),
    boundary: {
      descriptiveFieldsOnly: true,
      evidenceFileNameExcluded: true,
      evidenceFileSha256Excluded: true,
      actualEvidenceFileRequiredAfterApply: true,
      governanceRequiredBeforeApply: true,
      importedApprovalRequiresLocalReview: true,
    },
    templates: templates.map(validateReceiverEvidenceTemplate),
  };
}

function validateLibraryHeader(source: Record<string, unknown>, expectedBoundaryKeys: string[]): Record<string, unknown> {
  const boundary = record(source.boundary, "補充證據範本庫邊界");
  allowedKeys(boundary, expectedBoundaryKeys, "補充證據範本庫邊界");
  expectedBoundaryKeys.forEach((key) => {
    if (boundary[key] !== true) throw new Error("補充證據範本庫未完整聲明治理、檔案與雜湊排除邊界。");
  });
  isoDateTime(source.exportedAt, "範本庫匯出時間");
  if (!Array.isArray(source.templates)) throw new Error("補充證據範本庫缺少範本清單。");
  if (source.templates.length > MAX_RECEIVER_EVIDENCE_TEMPLATES) {
    throw new Error(`補充證據範本庫最多 ${MAX_RECEIVER_EVIDENCE_TEMPLATES} 筆。`);
  }
  return boundary;
}

export function parseReceiverEvidenceTemplateLibrary(value: unknown): ReceiverEvidenceTemplate[] {
  const source = record(value, "補充證據範本庫");
  allowedKeys(source, ["schemaVersion", "kind", "exportedAt", "boundary", "templates"], "補充證據範本庫");
  if (source.kind !== RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND) throw new Error("補充證據範本庫種類不受支援。");
  let templates: ReceiverEvidenceTemplate[];
  if (source.schemaVersion === RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION) {
    validateLibraryHeader(source, [
      "descriptiveFieldsOnly",
      "evidenceFileNameExcluded",
      "evidenceFileSha256Excluded",
      "actualEvidenceFileRequiredAfterApply",
      "governanceRequiredBeforeApply",
      "importedApprovalRequiresLocalReview",
    ]);
    templates = (source.templates as unknown[]).map(validateReceiverEvidenceTemplate);
  } else if (source.schemaVersion === LEGACY_SCHEMA_VERSION) {
    validateLibraryHeader(source, [
      "descriptiveFieldsOnly",
      "evidenceFileNameExcluded",
      "evidenceFileSha256Excluded",
      "actualEvidenceFileRequiredAfterApply",
    ]);
    templates = (source.templates as unknown[]).map(legacyTemplate);
  } else {
    throw new Error("補充證據範本庫版本不受支援。");
  }
  if (new Set(templates.map((template) => template.templateId)).size !== templates.length) {
    throw new Error("補充證據範本庫包含重複的範本識別碼。");
  }
  return templates;
}

export function prepareImportedReceiverEvidenceTemplates(
  templates: ReceiverEvidenceTemplate[],
): ReceiverEvidenceTemplate[] {
  return templates.map((template) => {
    const validated = validateReceiverEvidenceTemplate(template);
    if (validated.governance.status === "draft") return validated;
    return validateReceiverEvidenceTemplate({
      ...validated,
      governance: {
        ...validated.governance,
        status: "draft",
        reviewedBy: "",
        reviewedAt: "",
        validUntil: "",
      },
    });
  });
}

export function mergeReceiverEvidenceTemplates(
  current: ReceiverEvidenceTemplate[],
  incoming: ReceiverEvidenceTemplate[],
): ReceiverEvidenceTemplate[] {
  const merged = new Map<string, ReceiverEvidenceTemplate>();
  [...current, ...incoming].map(validateReceiverEvidenceTemplate).forEach((template) => {
    const existing = merged.get(template.templateId);
    if (!existing || existing.updatedAt <= template.updatedAt) merged.set(template.templateId, template);
  });
  if (merged.size > MAX_RECEIVER_EVIDENCE_TEMPLATES) {
    throw new Error(`本機補充證據範本最多 ${MAX_RECEIVER_EVIDENCE_TEMPLATES} 筆，請先刪除不再使用的範本。`);
  }
  return [...merged.values()].sort((left, right) => (
    left.checkId.localeCompare(right.checkId)
    || left.name.localeCompare(right.name, "zh-Hant")
    || left.templateId.localeCompare(right.templateId)
  ));
}
