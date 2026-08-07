import {
  BootstrapPayload,
  ProjectListItem,
  ProjectState,
  ReferenceData,
  RemovalTransferHandoff,
  RemovalTransferReceiptImportResponse,
  ReceiverCapacityVerificationReceipt,
  ReceiverVerificationAuthority,
  ReceiverVerificationResult,
  ReceiverTrustKey,
  ReceiverTrustEvent,
  ReceiverRevocationReason,
  ReceiverTrustRegistryBackup,
  ReceiverTrustRestorePreview,
  ReceiverIdentitySigningRequest,
  ReceiverIdentitySignatureResponse,
  ReceiverKeyEnrollment,
  ReportPayload,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = "";
    try {
      const payload = JSON.parse(text) as { detail?: unknown };
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        detail = payload.detail;
      }
    } catch {}
    throw new Error(detail || text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  bootstrap: () => request<BootstrapPayload>("/api/bootstrap"),
  getReferenceData: () => request<ReferenceData>("/api/reference-data"),
  saveReferenceData: (referenceData: ReferenceData) =>
    request<ReferenceData>("/api/reference-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference_data: referenceData }),
    }),
  resetReferenceData: () =>
    request<ReferenceData>("/api/reference-data", {
      method: "DELETE",
    }),
  listProjects: () => request<ProjectListItem[]>("/api/projects"),
  createProject: (name: string) =>
    request<ProjectState>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  getProject: (projectId: string) => request<ProjectState>(`/api/projects/${projectId}`),
  saveProject: (project: ProjectState) =>
    request<{ project: ProjectState }>(`/api/projects/${project.metadata.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    }),
  importAnalysis: async (projectId: string, side: "top" | "bottom", file: File) => {
    const form = new FormData();
    form.append("side", side);
    form.append("file", file);
    return request<ProjectState>(`/api/projects/${projectId}/import-analysis`, {
      method: "POST",
      body: form,
    });
  },
  calculate: (projectId: string) =>
    request<ProjectState>(`/api/projects/${projectId}/calculate`, { method: "POST" }),
  generateRemovalTransferHandoff: (projectId: string) =>
    request<RemovalTransferHandoff>(`/api/projects/${projectId}/removal-transfer-handoff`, { method: "POST" }),
  importRemovalTransferReceipt: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<RemovalTransferReceiptImportResponse>(
      `/api/projects/${projectId}/removal-transfer-receipts`,
      { method: "POST", body: form },
    );
  },
  validateRemovalTransferHandoff: (handoff: RemovalTransferHandoff) =>
    request<RemovalTransferHandoff>("/api/removal-transfer-handoffs/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(handoff),
    }),
  buildReceiverVerificationReceipt: (
    handoff: RemovalTransferHandoff,
    verificationAuthority: ReceiverVerificationAuthority,
    results: ReceiverVerificationResult[],
  ) =>
    request<RemovalTransferReceiptImportResponse>("/api/removal-transfer-receipts/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff,
        verification_authority: verificationAuthority,
        results,
        receiver_calculation_confirmed: true,
        identity_review_acknowledged: true,
      }),
    }),
  validateReceiverVerificationReceipt: (
    handoff: RemovalTransferHandoff,
    receipt: unknown,
  ) =>
    request<RemovalTransferReceiptImportResponse>("/api/removal-transfer-receipts/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff, receipt }),
    }),
  listReceiverTrustKeys: () =>
    request<{ schemaVersion: 1; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[] }>("/api/removal-transfer-trust-keys"),
  registerReceiverTrustKey: (organization: string, displayName: string, publicKey: string) =>
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[] }>("/api/removal-transfer-trust-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization, displayName, publicKey, independentVerificationConfirmed: true }),
    }),
  validateReceiverKeyEnrollment: (enrollment: ReceiverKeyEnrollment) =>
    request<{ enrollment: ReceiverKeyEnrollment; proofOfPossession: "valid" }>(
      "/api/removal-transfer-trust-keys/enrollments/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrollment),
      },
    ),
  registerReceiverKeyEnrollment: (enrollment: ReceiverKeyEnrollment) =>
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[] }>(
      "/api/removal-transfer-trust-keys/enrollments/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollment, independent_verification_confirmed: true }),
      },
    ),
  revokeReceiverTrustKey: (
    keyId: string,
    revocation: {
      reasonCode: ReceiverRevocationReason;
      reason: string;
      handledBy: string;
      incidentReference: string;
    },
  ) =>
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[] }>(
      `/api/removal-transfer-trust-keys/${encodeURIComponent(keyId)}/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason_code: revocation.reasonCode,
          reason: revocation.reason,
          handled_by: revocation.handledBy,
          incident_reference: revocation.incidentReference,
          revocation_confirmed: true,
        }),
      },
    ),
  exportReceiverTrustRegistryBackup: () =>
    request<{ backup: ReceiverTrustRegistryBackup }>(
      "/api/removal-transfer-trust-registry/backups/export",
      { method: "POST" },
    ),
  validateReceiverTrustRegistryBackup: (backup: ReceiverTrustRegistryBackup) =>
    request<{ backup: ReceiverTrustRegistryBackup; preview: ReceiverTrustRestorePreview }>(
      "/api/removal-transfer-trust-registry/backups/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      },
    ),
  restoreReceiverTrustRegistryBackup: (backup: ReceiverTrustRegistryBackup) =>
    request<{
      keys: ReceiverTrustKey[];
      events: ReceiverTrustEvent[];
      safeguardPath: string | null;
      registryFingerprint: string;
      backupFingerprint: string;
      preview: ReceiverTrustRestorePreview;
    }>("/api/removal-transfer-trust-registry/backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup, restore_confirmed: true }),
    }),
  buildReceiverIdentitySigningRequest: (
    handoff: RemovalTransferHandoff,
    receipt: ReceiverCapacityVerificationReceipt,
  ) =>
    request<{ signingRequest: ReceiverIdentitySigningRequest }>("/api/removal-transfer-receipts/signing-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff, receipt }),
    }),
  attachReceiverIdentitySignature: (
    handoff: RemovalTransferHandoff,
    receipt: ReceiverCapacityVerificationReceipt,
    signatureResponse: ReceiverIdentitySignatureResponse,
  ) =>
    request<RemovalTransferReceiptImportResponse>("/api/removal-transfer-receipts/attach-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff, receipt, signature_response: signatureResponse }),
    }),
  generateReport: (projectId: string, concise = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report?concise=${concise ? "true" : "false"}`, {
      method: "POST",
    }),
  generateWordReport: (projectId: string, concise = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report/docx?concise=${concise ? "true" : "false"}`, {
      method: "POST",
    }),
};
