import type {
  ReceiverCapacityEvidence,
  ReceiverSupplementalCheck,
  ReceiverSupplementalCheckId,
} from "./types";

export const RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION = 1 as const;
export const RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND = "receiver-supplemental-evidence-template-library" as const;
export const RECEIVER_EVIDENCE_TEMPLATE_STORAGE_KEY = "excavation.receiverSupplementalEvidenceTemplates.v1";
export const MAX_RECEIVER_EVIDENCE_TEMPLATES = 100;

const SUPPLEMENTAL_CHECK_IDS: ReceiverSupplementalCheckId[] = [
  "connection",
  "bearing",
  "receiving-structure",
  "bracing-and-effective-length",
  "construction-sequence-and-preload",
];

export type ReceiverEvidenceTemplateMetadata = Pick<
  ReceiverCapacityEvidence,
  "documentReference" | "revision" | "issuedDate" | "pageReference"
>;

export type ReceiverEvidenceTemplate = {
  templateId: string;
  name: string;
  checkId: ReceiverSupplementalCheckId;
  basis: string;
  evidence: ReceiverEvidenceTemplateMetadata;
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
  };
  templates: ReceiverEvidenceTemplate[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式不正確。`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不可空白。`);
  if (text.length > 500) throw new Error(`${label}過長。`);
  return text;
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

function isoDateTime(value: unknown, label: string): string {
  const text = requiredText(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new Error(`${label}不是有效 ISO 8601 日期時間。`);
  }
  return text;
}

function checkId(value: unknown): ReceiverSupplementalCheckId {
  if (typeof value !== "string" || !SUPPLEMENTAL_CHECK_IDS.includes(value as ReceiverSupplementalCheckId)) {
    throw new Error("範本的補充查核類別不受支援。");
  }
  return value as ReceiverSupplementalCheckId;
}

export function validateReceiverEvidenceTemplate(value: unknown): ReceiverEvidenceTemplate {
  const source = record(value, "補充證據範本");
  const evidence = record(source.evidence, "範本文件資料");
  if ("fileName" in evidence || "fileSha256" in evidence) {
    throw new Error("補充證據範本不得保存證據檔名或 SHA-256；套用後須重新選取實際檔案。");
  }
  allowedKeys(source, ["templateId", "name", "checkId", "basis", "evidence", "createdAt", "updatedAt"], "補充證據範本");
  allowedKeys(evidence, ["documentReference", "revision", "issuedDate", "pageReference"], "範本文件資料");
  const validated = {
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
  if (validated.createdAt > validated.updatedAt) throw new Error("範本更新時間不得早於建立時間。");
  return validated;
}

export function templateFromSupplementalCheck(
  check: ReceiverSupplementalCheck,
  templateId: string,
  name: string,
  timestamp: string,
  createdAt = timestamp,
): ReceiverEvidenceTemplate {
  if (check.status !== "passed") throw new Error("只有標示為通過的補充查核才能儲存為範本。");
  return validateReceiverEvidenceTemplate({
    templateId,
    name,
    checkId: check.checkId,
    basis: check.basis,
    evidence: {
      documentReference: check.evidence?.documentReference,
      revision: check.evidence?.revision,
      issuedDate: check.evidence?.issuedDate,
      pageReference: check.evidence?.pageReference,
    },
    createdAt,
    updatedAt: timestamp,
  });
}

export function applyReceiverEvidenceTemplate(
  check: ReceiverSupplementalCheck,
  template: ReceiverEvidenceTemplate,
): ReceiverSupplementalCheck {
  const validated = validateReceiverEvidenceTemplate(template);
  if (check.checkId !== validated.checkId) throw new Error("範本類別與目前補充查核不一致。");
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
    },
    templates: templates.map(validateReceiverEvidenceTemplate),
  };
}

export function parseReceiverEvidenceTemplateLibrary(value: unknown): ReceiverEvidenceTemplate[] {
  const source = record(value, "補充證據範本庫");
  allowedKeys(source, ["schemaVersion", "kind", "exportedAt", "boundary", "templates"], "補充證據範本庫");
  if (
    source.schemaVersion !== RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_SCHEMA_VERSION
    || source.kind !== RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND
  ) {
    throw new Error("補充證據範本庫版本或種類不受支援。");
  }
  const boundary = record(source.boundary, "補充證據範本庫邊界");
  allowedKeys(
    boundary,
    ["descriptiveFieldsOnly", "evidenceFileNameExcluded", "evidenceFileSha256Excluded", "actualEvidenceFileRequiredAfterApply"],
    "補充證據範本庫邊界",
  );
  if (
    boundary.descriptiveFieldsOnly !== true
    || boundary.evidenceFileNameExcluded !== true
    || boundary.evidenceFileSha256Excluded !== true
    || boundary.actualEvidenceFileRequiredAfterApply !== true
  ) {
    throw new Error("補充證據範本庫未完整聲明檔案與雜湊排除邊界。");
  }
  isoDateTime(source.exportedAt, "範本庫匯出時間");
  if (!Array.isArray(source.templates)) throw new Error("補充證據範本庫缺少範本清單。");
  if (source.templates.length > MAX_RECEIVER_EVIDENCE_TEMPLATES) {
    throw new Error(`補充證據範本庫最多 ${MAX_RECEIVER_EVIDENCE_TEMPLATES} 筆。`);
  }
  const templates = source.templates.map(validateReceiverEvidenceTemplate);
  if (new Set(templates.map((template) => template.templateId)).size !== templates.length) {
    throw new Error("補充證據範本庫包含重複的範本識別碼。");
  }
  return templates;
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
