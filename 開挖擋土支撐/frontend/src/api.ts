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
  ReshoreMemberCapacityCalculationResponse,
  ReshoreMemberCapacityInput,
  SourceCapacityEvidenceVerificationResponse,
  SourceEvidenceIdentitySigningRequest,
  SourceEvidenceIdentitySignatureResponse,
  ReceiverTrustKey,
  ReceiverTrustEvent,
  ReceiverRotationRequest,
  ReceiverOperator,
  ReceiverGovernanceHealthSnapshot,
  ReceiverGovernanceHealthHistory,
  ReceiverOperatorAuditSummary,
  ReceiverOperatorAuthState,
  ReceiverOperatorGovernanceBackup,
  ReceiverOperatorGovernanceRestorePreview,
  ReceiverOperatorGovernanceRestoreResult,
  ReceiverOperatorBackupDispositionRequest,
  ReceiverOperatorBackupDispositionReceipt,
  ReceiverOperatorManagedBackup,
  ReceiverOperatorRecoveryDrillReceipt,
  ReceiverOperatorRecoveryInventory,
  ReceiverOperatorRole,
  ReceiverRevocationReason,
  ReceiverTrustRegistryBackup,
  ReceiverTrustRestorePreview,
  ReceiverIdentitySigningRequest,
  ReceiverIdentitySignatureResponse,
  ReceiverIdentityVerification,
  ReceiverKeyEnrollment,
  ReportPayload,
} from "./types";
import type { ReceiverEvidenceTemplatePublisherVerification } from "./receiverEvidenceTemplates";

let receiverCsrfToken = typeof sessionStorage === "undefined"
  ? ""
  : sessionStorage.getItem("receiver-operator-csrf") ?? "";

function saveReceiverCsrfToken(value?: string) {
  receiverCsrfToken = value ?? "";
  if (typeof sessionStorage === "undefined") return;
  if (receiverCsrfToken) sessionStorage.setItem("receiver-operator-csrf", receiverCsrfToken);
  else sessionStorage.removeItem("receiver-operator-csrf");
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && receiverCsrfToken) {
    headers.set("X-CSRF-Token", receiverCsrfToken);
  }
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers,
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

async function receiverAuthRequest(url: string, init?: RequestInit): Promise<ReceiverOperatorAuthState> {
  const result = await request<ReceiverOperatorAuthState>(url, init);
  saveReceiverCsrfToken(result.csrfToken);
  return result;
}

export const api = {
  getReceiverOperatorSession: () =>
    receiverAuthRequest("/api/receiver-operator-auth/session"),
  bootstrapReceiverOperator: (username: string, displayName: string, password: string) =>
    receiverAuthRequest("/api/receiver-operator-auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, display_name: displayName, password }),
    }),
  loginReceiverOperator: (username: string, password: string) =>
    receiverAuthRequest("/api/receiver-operator-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  logoutReceiverOperator: async () => {
    const result = await request<{ loggedOut: true }>("/api/receiver-operator-auth/logout", { method: "POST" });
    saveReceiverCsrfToken();
    return result;
  },
  listReceiverOperators: () => request<{ operators: ReceiverOperator[] }>("/api/receiver-operators"),
  getReceiverGovernanceHealth: () =>
    request<ReceiverGovernanceHealthSnapshot>("/api/receiver-governance-health"),
  getReceiverGovernanceHealthHistory: () =>
    request<ReceiverGovernanceHealthHistory>("/api/receiver-governance-health/history"),
  exportReceiverGovernanceHealthHistory: () =>
    request<Record<string, unknown>>("/api/receiver-governance-health/history/export"),
  validateReceiverGovernanceHealthHistory: (exported: unknown) =>
    request<{
      valid: true;
      exportFingerprint: string;
      observationCount: number;
      headFingerprint: string | null;
    }>("/api/receiver-governance-health/history/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    }),
  recordReceiverGovernanceHealthObservation: () =>
    request<{ health: ReceiverGovernanceHealthSnapshot }>(
      "/api/receiver-governance-health/observations",
      { method: "POST" },
    ),
  createReceiverOperator: (
    username: string,
    displayName: string,
    password: string,
    roles: ReceiverOperatorRole[],
  ) => request<{ operator: ReceiverOperator; operators: ReceiverOperator[] }>("/api/receiver-operators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, display_name: displayName, password, roles }),
  }),
  updateReceiverOperatorRoles: (operatorId: string, roles: ReceiverOperatorRole[]) =>
    request<{ operator: ReceiverOperator; operators: ReceiverOperator[] }>(
      `/api/receiver-operators/${encodeURIComponent(operatorId)}/roles`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      },
    ),
  setReceiverOperatorDisabled: (operatorId: string, disabled: boolean) =>
    request<{ operator: ReceiverOperator; operators: ReceiverOperator[] }>(
      `/api/receiver-operators/${encodeURIComponent(operatorId)}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      },
    ),
  resetReceiverOperatorPassword: (operatorId: string, newPassword: string) =>
    request<{ operator: ReceiverOperator; operators: ReceiverOperator[] }>(
      `/api/receiver-operators/${encodeURIComponent(operatorId)}/password-reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      },
    ),
  changeReceiverOperatorPassword: async (currentPassword: string, newPassword: string) => {
    const result = await request<{ passwordChanged: true; loggedOut: true }>(
      "/api/receiver-operator-auth/change-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      },
    );
    saveReceiverCsrfToken();
    return result;
  },
  listReceiverOperatorAuditEvents: () =>
    request<ReceiverOperatorAuditSummary>("/api/receiver-operator-audit-events"),
  exportReceiverOperatorGovernanceBackup: (
    passphrase: string,
    retainServerCopy: boolean,
    retentionDays: number,
  ) =>
    request<{
      backup: ReceiverOperatorGovernanceBackup;
      auditEventFingerprint: string;
      managedBackup: ReceiverOperatorManagedBackup | null;
    }>(
      "/api/receiver-operator-governance-backups/export",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passphrase,
          retain_server_copy: retainServerCopy,
          retention_days: retentionDays,
        }),
      },
    ),
  listReceiverOperatorGovernanceRecoveryInventory: () =>
    request<ReceiverOperatorRecoveryInventory>(
      "/api/receiver-operator-governance-backups/inventory",
    ),
  requestReceiverOperatorBackupDisposition: (
    backupFingerprint: string,
    caseReference: string,
    basis: string,
  ) => request<{
    request: ReceiverOperatorBackupDispositionRequest;
    auditEventFingerprint: string;
    inventory: ReceiverOperatorRecoveryInventory;
  }>("/api/receiver-operator-governance-backups/disposition-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backup_fingerprint: backupFingerprint,
      case_reference: caseReference,
      basis,
      request_confirmed: true,
    }),
  }),
  approveReceiverOperatorBackupDisposition: (
    requestFingerprint: string,
  ) => request<{
    request: ReceiverOperatorBackupDispositionRequest;
    receipt: ReceiverOperatorBackupDispositionReceipt;
    receiptFileName: string;
    managedFileRemovedDuringCall: boolean;
    completionRecoveredAfterInterruption: boolean;
    approvalAuditEventFingerprint: string | null;
    completionAuditEventFingerprint: string;
    inventory: ReceiverOperatorRecoveryInventory;
  }>(
    "/api/receiver-operator-governance-backups/disposition-requests/"
      + `${encodeURIComponent(requestFingerprint)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_confirmed: true }),
    },
  ),
  validateReceiverOperatorGovernanceBackup: (
    backup: ReceiverOperatorGovernanceBackup,
    passphrase: string,
  ) => request<{
    backupFingerprint: string;
    preview: ReceiverOperatorGovernanceRestorePreview;
  }>("/api/receiver-operator-governance-backups/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backup, passphrase }),
  }),
  restoreReceiverOperatorGovernanceBackup: async (
    backup: ReceiverOperatorGovernanceBackup,
    passphrase: string,
    recoveryUsername: string,
    recoveryPassword: string,
  ) => {
    const result = await request<ReceiverOperatorGovernanceRestoreResult>(
      "/api/receiver-operator-governance-backups/restore",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup,
          passphrase,
          recovery_username: recoveryUsername,
          recovery_password: recoveryPassword,
          restore_confirmed: true,
        }),
      },
    );
    saveReceiverCsrfToken();
    return result;
  },
  drillReceiverOperatorGovernanceBackup: (
    backup: ReceiverOperatorGovernanceBackup,
    passphrase: string,
    recoveryUsername: string,
    recoveryPassword: string,
  ) => request<{
    receipt: ReceiverOperatorRecoveryDrillReceipt;
    receiptFileName: string;
    inventory: ReceiverOperatorRecoveryInventory;
  }>(
    "/api/receiver-operator-governance-backups/drill",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backup,
        passphrase,
        recovery_username: recoveryUsername,
        recovery_password: recoveryPassword,
      }),
    },
  ),
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
  createSourceCapacityEvidenceVerification: (
    projectId: string,
    handoffFingerprint: string,
    receiptFingerprint: string,
    verificationAuthority: { organization: string; verifierName: string; verifierRole: string },
    verificationBasis: string,
    matches: Array<{ transferId: string; evidenceKey: string; selectedFileName: string; actualSha256: string }>,
  ) => request<SourceCapacityEvidenceVerificationResponse>(
    `/api/projects/${projectId}/source-capacity-evidence-verifications`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff_fingerprint: handoffFingerprint,
        receipt_fingerprint: receiptFingerprint,
        verification_authority: verificationAuthority,
        verification_basis: verificationBasis,
        matches,
        evidence_files_compared: true,
      }),
    },
  ),
  buildSourceEvidenceIdentitySigningRequest: (projectId: string, verificationFingerprint: string) =>
    request<{ signingRequest: SourceEvidenceIdentitySigningRequest }>(
      `/api/projects/${projectId}/source-capacity-evidence-verifications/signing-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_fingerprint: verificationFingerprint }),
      },
    ),
  attachSourceEvidenceIdentitySignature: (
    projectId: string,
    verificationFingerprint: string,
    signatureResponse: SourceEvidenceIdentitySignatureResponse,
  ) => request<SourceCapacityEvidenceVerificationResponse>(
    `/api/projects/${projectId}/source-capacity-evidence-verifications/attach-signature`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verification_fingerprint: verificationFingerprint,
        signature_response: signatureResponse,
      }),
    },
  ),
  validateSourceEvidenceIdentity: (projectId: string, verificationFingerprint: string) =>
    request<{ identityVerification: ReceiverIdentityVerification }>(
      `/api/projects/${projectId}/source-capacity-evidence-verifications/${verificationFingerprint}/validation`,
    ),
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
  calculateReshoreMemberCapacity: (
    handoff: RemovalTransferHandoff,
    transferId: string,
    calculationInput: ReshoreMemberCapacityInput,
  ) => request<ReshoreMemberCapacityCalculationResponse>(
    "/api/removal-transfer/reshore-member-capacity",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff,
        transfer_id: transferId,
        calculation_input: calculationInput,
      }),
    },
  ),
  listReceiverTrustKeys: () =>
    request<{ schemaVersion: 1; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[]; rotationRequests: ReceiverRotationRequest[] }>("/api/removal-transfer-trust-keys"),
  registerReceiverTrustKey: (organization: string, displayName: string, publicKey: string) =>
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[]; rotationRequests: ReceiverRotationRequest[] }>("/api/removal-transfer-trust-keys", {
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
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[]; rotationRequests: ReceiverRotationRequest[] }>(
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
      incidentReference: string;
    },
  ) =>
    request<{ key: ReceiverTrustKey; keys: ReceiverTrustKey[]; events: ReceiverTrustEvent[]; rotationRequests: ReceiverRotationRequest[] }>(
      `/api/removal-transfer-trust-keys/${encodeURIComponent(keyId)}/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason_code: revocation.reasonCode,
          reason: revocation.reason,
          incident_reference: revocation.incidentReference,
          revocation_confirmed: true,
        }),
      },
    ),
  requestReceiverKeyRotationCompletion: (
    newKeyId: string,
    rotation: {
      reason: string;
      incidentReference: string;
    },
  ) =>
    request<{
      request: ReceiverRotationRequest;
      keys: ReceiverTrustKey[];
      events: ReceiverTrustEvent[];
      rotationRequests: ReceiverRotationRequest[];
    }>(`/api/removal-transfer-trust-keys/${encodeURIComponent(newKeyId)}/rotation-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: rotation.reason,
        incident_reference: rotation.incidentReference,
        request_confirmed: true,
      }),
    }),
  approveReceiverKeyRotationCompletion: (
    requestFingerprint: string,
  ) =>
    request<{
      newKey: ReceiverTrustKey;
      revokedKey: ReceiverTrustKey;
      event: ReceiverTrustEvent;
      request: ReceiverRotationRequest;
      keys: ReceiverTrustKey[];
      events: ReceiverTrustEvent[];
      rotationRequests: ReceiverRotationRequest[];
    }>(`/api/removal-transfer-trust-key-rotation-requests/${encodeURIComponent(requestFingerprint)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_confirmed: true }),
    }),
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
      rotationRequests: ReceiverRotationRequest[];
      safeguardPath: string | null;
      registryFingerprint: string;
      backupFingerprint: string;
      preview: ReceiverTrustRestorePreview;
    }>("/api/removal-transfer-trust-registry/backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup, restore_confirmed: true }),
    }),
  validateReceiverEvidenceTemplatePublisherPackage: (publisherPackage: unknown) =>
    request<{
      package: {
        schemaVersion: 1;
        kind: "receiver-evidence-template-publisher-package";
        libraryFingerprint: string;
        library: unknown;
        packageFingerprint: string;
      };
      publisherVerification: ReceiverEvidenceTemplatePublisherVerification;
    }>("/api/removal-transfer-evidence-template-packages/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publisherPackage),
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
  generateReport: (projectId: string, concise = false, approved = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report?concise=${concise ? "true" : "false"}&approved=${approved ? "true" : "false"}`, {
      method: "POST",
    }),
  generateWordReport: (projectId: string, concise = false, approved = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report/docx?concise=${concise ? "true" : "false"}&approved=${approved ? "true" : "false"}`, {
      method: "POST",
    }),
};
