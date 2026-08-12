from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from .calculations import calculate_project
from .config import get_settings
from .parsers import parse_analysis_file
from .pdf_render_evidence import build_pdf_canonical_render_evidence, build_pdf_formal_source_bundle
from .project_store import ProjectStore
from .removal_transfer_handoff import (
    attach_receiver_identity_signature,
    attach_source_evidence_identity_signature,
    build_removal_transfer_handoff,
    build_receiver_identity_signing_request,
    build_receiver_verification_receipt,
    build_source_capacity_evidence_verification,
    build_source_evidence_identity_signing_request,
    same_removal_transfer_handoff_content,
    validate_removal_transfer_handoff,
    validate_receiver_verification_receipt,
    validate_source_capacity_evidence_verification,
    verify_receiver_identity_signature,
    verify_source_evidence_identity_signature,
)
from .receiver_trust_store import ReceiverTrustStore
from .receiver_operator_auth import (
    RECEIVER_SESSION_COOKIE,
    RECEIVER_SESSION_HOURS,
    ReceiverOperatorStore,
    operator_role_label,
)
from .receiver_operator_backup import (
    build_receiver_operator_governance_backup,
    preview_receiver_operator_governance_restore,
    restore_receiver_operator_governance_backup,
)
from .receiver_operator_recovery import (
    approve_receiver_operator_backup_disposition,
    list_receiver_operator_governance_recovery_inventory,
    perform_receiver_operator_governance_recovery_drill,
    request_receiver_operator_backup_disposition,
    write_managed_receiver_operator_governance_backup,
)
from .receiver_governance_health import build_receiver_governance_health_snapshot
from .receiver_capacity import calculate_reshore_member_capacity
from .receiver_evidence_template_package import validate_receiver_evidence_template_publisher_package
from .receiver_key_enrollment import validate_receiver_key_enrollment
from .receiver_trust_backup import (
    build_receiver_trust_registry_backup,
    preview_receiver_trust_registry_restore,
    restore_receiver_trust_registry_backup,
)
from .reporting import build_report, build_word_report, calculation_fingerprint, report_document_metadata
from .schemas import (
    AnalysisImportResult,
    AnalysisSideSource,
    AttachReceiverSignatureRequest,
    AttachSourceEvidenceSignatureRequest,
    BootstrapPayload,
    BraceRow,
    BuildReceiverReceiptRequest,
    CalculateReshoreMemberCapacityRequest,
    ChangeReceiverOperatorPasswordRequest,
    BuildReceiverSigningRequestRequest,
    BuildSourceEvidenceVerificationRequest,
    BuildSourceEvidenceSigningRequestRequest,
    ApproveReceiverKeyRotationCompletionRequest,
    ApproveReceiverOperatorBackupDispositionRequest,
    CompleteReceiverKeyRotationRequest,
    CreateReceiverOperatorRequest,
    CreateProjectRequest,
    DrillReceiverOperatorGovernanceBackupRequest,
    ExportReceiverOperatorGovernanceBackupRequest,
    ProjectState,
    ReferenceData,
    RequestReceiverKeyRotationCompletionRequest,
    RequestReceiverOperatorBackupDispositionRequest,
    ReceiverOperatorBootstrapRequest,
    ReceiverOperatorLoginRequest,
    ResetReceiverOperatorPasswordRequest,
    ReportPayload,
    RegisterReceiverEnrollmentRequest,
    RestoreReceiverTrustRegistryRequest,
    RestoreReceiverOperatorGovernanceBackupRequest,
    RevokeReceiverTrustKeyRequest,
    SaveReferenceDataRequest,
    SaveProjectRequest,
    SaveProjectResponse,
    SetReceiverOperatorStatusRequest,
    SupportRow,
    UpdateReceiverOperatorRolesRequest,
    ValidateReceiverOperatorGovernanceBackupRequest,
    ValidateReceiverReceiptRequest,
)
from .workbook_loader import (
    load_default_project,
    load_reference_data,
    reset_reference_overrides,
    save_reference_data,
)

settings = get_settings()
store = ProjectStore()
receiver_trust_store = ReceiverTrustStore()
receiver_operator_store = ReceiverOperatorStore()

app = FastAPI(title="擋土支撐計算網頁工具", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _set_receiver_session_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        RECEIVER_SESSION_COOKIE,
        token,
        max_age=RECEIVER_SESSION_HOURS * 60 * 60,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
    )


def _receiver_operator(
    request: Request,
    *,
    required_role: str | None = None,
    require_csrf: bool = False,
    allow_password_reset: bool = False,
) -> dict[str, Any]:
    try:
        session = receiver_operator_store.require_session(
            request.cookies.get(RECEIVER_SESSION_COOKIE),
            required_role=required_role,
            csrf_token=(request.headers.get("x-csrf-token") or "") if require_csrf else None,
            allow_password_reset=allow_password_reset,
        )
    except PermissionError as exc:
        status_code = 401 if "請先登入" in str(exc) else 403
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return session["operator"]


def _receiver_auth_response(operator: dict[str, Any], session: dict[str, Any]) -> dict[str, Any]:
    return {
        "bootstrapRequired": False,
        "authenticated": True,
        "operator": operator,
        "csrfToken": session["csrfToken"],
        "expiresAt": session["expiresAt"],
        "assuranceBoundary": (
            "本機密碼登入可驗證同一服務資料庫中的帳號與角色；"
            "不等於外部組織目錄、自然人身分或公司授權已獲第三方驗證。"
        ),
    }


@app.get("/api/receiver-operator-auth/session")
def receiver_operator_session(request: Request) -> dict[str, Any]:
    bootstrap_required = receiver_operator_store.bootstrap_required()
    if bootstrap_required:
        return {"bootstrapRequired": True, "authenticated": False, "operator": None}
    session = receiver_operator_store.get_session(
        request.cookies.get(RECEIVER_SESSION_COOKIE),
        rotate_csrf=True,
    )
    if session is None:
        return {"bootstrapRequired": False, "authenticated": False, "operator": None}
    return _receiver_auth_response(session["operator"], session)


@app.post("/api/receiver-operator-auth/bootstrap")
def bootstrap_receiver_operator(
    payload: ReceiverOperatorBootstrapRequest,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=403, detail="首位管理員只能由本機連線建立。")
    try:
        operator = receiver_operator_store.bootstrap(
            payload.username,
            payload.display_name,
            payload.password,
        )
        session = receiver_operator_store.create_session(operator["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_receiver_session_cookie(response, session["sessionToken"], request)
    return _receiver_auth_response(operator, session)


@app.post("/api/receiver-operator-auth/login")
def login_receiver_operator(
    payload: ReceiverOperatorLoginRequest,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    try:
        operator = receiver_operator_store.authenticate(payload.username, payload.password)
        session = receiver_operator_store.create_session(operator["id"])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    _set_receiver_session_cookie(response, session["sessionToken"], request)
    return _receiver_auth_response(operator, session)


@app.post("/api/receiver-operator-auth/logout")
def logout_receiver_operator(request: Request, response: Response) -> dict[str, bool]:
    _receiver_operator(request, require_csrf=True, allow_password_reset=True)
    receiver_operator_store.delete_session(request.cookies.get(RECEIVER_SESSION_COOKIE))
    response.delete_cookie(RECEIVER_SESSION_COOKIE, path="/", samesite="strict")
    return {"loggedOut": True}


@app.get("/api/receiver-operators")
def list_receiver_operators(request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin")
    return {"operators": receiver_operator_store.list_operators()}


@app.get("/api/receiver-governance-health")
def get_receiver_governance_health(request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin")
    try:
        return build_receiver_governance_health_snapshot(
            receiver_operator_store,
            receiver_trust_store,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/receiver-operators")
def create_receiver_operator(payload: CreateReceiverOperatorRequest, request: Request) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        operator = receiver_operator_store.create_operator(
            payload.username,
            payload.display_name,
            payload.password,
            list(payload.roles),
            actor_operator_id=actor["id"],
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"operator": operator, "operators": receiver_operator_store.list_operators()}


@app.patch("/api/receiver-operators/{operator_id}/roles")
def update_receiver_operator_roles(
    operator_id: str,
    payload: UpdateReceiverOperatorRolesRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        operator = receiver_operator_store.update_roles(
            operator_id,
            list(payload.roles),
            actor_operator_id=actor["id"],
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"operator": operator, "operators": receiver_operator_store.list_operators()}


@app.patch("/api/receiver-operators/{operator_id}/status")
def set_receiver_operator_status(
    operator_id: str,
    payload: SetReceiverOperatorStatusRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        operator = receiver_operator_store.set_disabled(
            operator_id,
            payload.disabled,
            actor_operator_id=actor["id"],
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"operator": operator, "operators": receiver_operator_store.list_operators()}


@app.post("/api/receiver-operators/{operator_id}/password-reset")
def reset_receiver_operator_password(
    operator_id: str,
    payload: ResetReceiverOperatorPasswordRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        operator = receiver_operator_store.reset_password(
            operator_id,
            payload.new_password,
            actor_operator_id=actor["id"],
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"operator": operator, "operators": receiver_operator_store.list_operators()}


@app.post("/api/receiver-operator-auth/change-password")
def change_receiver_operator_password(
    payload: ChangeReceiverOperatorPasswordRequest,
    request: Request,
    response: Response,
) -> dict[str, bool]:
    actor = _receiver_operator(request, require_csrf=True, allow_password_reset=True)
    try:
        receiver_operator_store.change_password(
            actor["id"],
            payload.current_password,
            payload.new_password,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.delete_cookie(RECEIVER_SESSION_COOKIE, path="/", samesite="strict")
    return {"passwordChanged": True, "loggedOut": True}


@app.get("/api/receiver-operator-audit-events")
def list_receiver_operator_audit_events(request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin")
    try:
        return receiver_operator_store.list_audit_events()
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/receiver-operator-governance-backups/export")
def export_receiver_operator_governance_backup(
    payload: ExportReceiverOperatorGovernanceBackupRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        audit_event = receiver_operator_store.record_governance_backup_export(
            actor["id"],
            retain_server_copy=payload.retain_server_copy,
            retention_days=payload.retention_days if payload.retain_server_copy else None,
        )
        backup = build_receiver_operator_governance_backup(
            receiver_operator_store,
            payload.passphrase,
        )
        managed_backup = (
            write_managed_receiver_operator_governance_backup(
                receiver_operator_store,
                backup,
                retention_days=payload.retention_days,
            )
            if payload.retain_server_copy
            else None
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {
        "backup": backup,
        "auditEventFingerprint": audit_event["eventFingerprint"],
        "managedBackup": managed_backup,
    }


@app.get("/api/receiver-operator-governance-backups/inventory")
def list_receiver_operator_governance_backup_inventory(request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin")
    try:
        return list_receiver_operator_governance_recovery_inventory(receiver_operator_store)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/receiver-operator-governance-backups/disposition-requests")
def request_receiver_operator_governance_backup_disposition(
    payload: RequestReceiverOperatorBackupDispositionRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(
        request,
        required_role="receiver-key-requester",
        require_csrf=True,
    )
    try:
        result = request_receiver_operator_backup_disposition(
            receiver_operator_store,
            payload.backup_fingerprint,
            actor_operator_id=actor["id"],
            case_reference=payload.case_reference,
            basis=payload.basis,
            request_confirmed=payload.request_confirmed,
        )
        return {
            **result,
            "inventory": list_receiver_operator_governance_recovery_inventory(
                receiver_operator_store
            ),
        }
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post(
    "/api/receiver-operator-governance-backups/disposition-requests/"
    "{request_fingerprint}/approve"
)
def approve_receiver_operator_governance_backup_disposition(
    request_fingerprint: str,
    payload: ApproveReceiverOperatorBackupDispositionRequest,
    request: Request,
) -> dict[str, Any]:
    actor = _receiver_operator(
        request,
        required_role="receiver-key-approver",
        require_csrf=True,
    )
    try:
        result = approve_receiver_operator_backup_disposition(
            receiver_operator_store,
            request_fingerprint,
            actor_operator_id=actor["id"],
            approval_confirmed=payload.approval_confirmed,
        )
        return {
            **result,
            "inventory": list_receiver_operator_governance_recovery_inventory(
                receiver_operator_store
            ),
        }
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/receiver-operator-governance-backups/validate")
def validate_receiver_operator_governance_backup(
    payload: ValidateReceiverOperatorGovernanceBackupRequest,
    request: Request,
) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        return preview_receiver_operator_governance_restore(
            receiver_operator_store,
            payload.backup,
            payload.passphrase,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/receiver-operator-governance-backups/restore")
def restore_receiver_operator_governance(
    payload: RestoreReceiverOperatorGovernanceBackupRequest,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    actor = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        restored = restore_receiver_operator_governance_backup(
            receiver_operator_store,
            payload.backup,
            payload.passphrase,
            current_actor_operator_id=actor["id"],
            recovery_username=payload.recovery_username,
            recovery_password=payload.recovery_password,
            restore_confirmed=payload.restore_confirmed,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.delete_cookie(RECEIVER_SESSION_COOKIE, path="/", samesite="strict")
    return restored


@app.post("/api/receiver-operator-governance-backups/drill")
def drill_receiver_operator_governance_backup(
    payload: DrillReceiverOperatorGovernanceBackupRequest,
    request: Request,
) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        result = perform_receiver_operator_governance_recovery_drill(
            receiver_operator_store,
            payload.backup,
            payload.passphrase,
            recovery_username=payload.recovery_username,
            recovery_password=payload.recovery_password,
        )
        return {
            **result,
            "inventory": list_receiver_operator_governance_recovery_inventory(
                receiver_operator_store
            ),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _receipt_validation(receipt: dict[str, Any]) -> dict[str, Any]:
    identity = verify_receiver_identity_signature(receipt, receiver_trust_store.list_keys())
    return {
        "integrity": "valid",
        "engineeringStatus": receipt["summary"]["status"],
        "verifierIdentity": identity["status"],
        "identityVerification": identity,
    }


def _source_evidence_validation(record: dict[str, Any]) -> dict[str, Any]:
    return verify_source_evidence_identity_signature(record, receiver_trust_store.list_keys())


def _source_evidence_context(
    project: ProjectState,
    verification_fingerprint: str,
) -> tuple[int, dict[str, Any], dict[str, Any], dict[str, Any]]:
    record_index = next(
        (
            index for index, item in reversed(list(enumerate(project.source_capacity_evidence_verifications)))
            if str(item.get("verificationFingerprint", "")) == verification_fingerprint
        ),
        None,
    )
    if record_index is None:
        raise ValueError("本專案找不到指定的 SEV 核驗紀錄。")
    record = project.source_capacity_evidence_verifications[record_index]
    handoff = next(
        (
            item for item in reversed(project.removal_transfer_handoffs)
            if str(item.get("handoffFingerprint", "")) == str(record.get("handoffFingerprint", ""))
        ),
        None,
    )
    receipt = next(
        (
            item for item in reversed(project.removal_transfer_verification_receipts)
            if str(item.get("receiptFingerprint", "")) == str(record.get("receiptFingerprint", ""))
        ),
        None,
    )
    if handoff is None or receipt is None:
        raise ValueError("SEV 所指向的 ERH 或 RVR 已不存在於本專案。")
    validated_record = validate_source_capacity_evidence_verification(record, handoff, receipt)
    return record_index, validated_record, handoff, receipt


def _receiver_rotation_requests() -> list[dict[str, Any]]:
    claims = {
        item["request_fingerprint"]: item
        for item in receiver_operator_store.rotation_claims()
    }
    summaries = receiver_trust_store.list_rotation_requests()
    for summary in summaries:
        claim = claims.get(summary["requestFingerprint"])
        if summary.get("identityAssurance") != "authenticated-local-account":
            summary["authorizationState"] = "legacy-procedural"
        elif claim is None:
            summary["authorizationState"] = "missing-claim"
        else:
            summary["authorizationState"] = "tracked"
            summary["authorizationClaimState"] = claim["state"]
    return summaries


@app.get("/api/removal-transfer-trust-keys")
def list_receiver_trust_keys() -> dict[str, Any]:
    try:
        keys = receiver_trust_store.list_keys()
        events = receiver_trust_store.list_events()
        rotation_requests = _receiver_rotation_requests()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"schemaVersion": 1, "keys": keys, "events": events, "rotationRequests": rotation_requests}


@app.post("/api/removal-transfer-trust-keys")
def register_receiver_trust_key(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    operator = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        record = receiver_trust_store.register_key(
            str(payload.get("organization", "")),
            str(payload.get("displayName", "")),
            str(payload.get("publicKey", "")),
            payload.get("independentVerificationConfirmed") is True,
            registered_by=operator["displayName"],
            registered_by_operator_id=operator["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "key": record,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
        "rotationRequests": _receiver_rotation_requests(),
    }


@app.post("/api/removal-transfer-trust-keys/enrollments/validate")
def validate_receiver_trust_key_enrollment(enrollment: dict[str, Any]) -> dict[str, Any]:
    try:
        validated = validate_receiver_key_enrollment(enrollment)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"enrollment": validated, "proofOfPossession": "valid"}


@app.post("/api/removal-transfer-trust-keys/enrollments/register")
def register_receiver_trust_key_enrollment(
    payload: RegisterReceiverEnrollmentRequest,
    request: Request,
) -> dict[str, Any]:
    operator = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        record = receiver_trust_store.register_enrollment(
            payload.enrollment,
            payload.independent_verification_confirmed,
            registered_by=operator["displayName"],
            registered_by_operator_id=operator["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "key": record,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
        "rotationRequests": _receiver_rotation_requests(),
    }


@app.post("/api/removal-transfer-trust-keys/{key_id}/revoke")
def revoke_receiver_trust_key(
    key_id: str,
    payload: RevokeReceiverTrustKeyRequest,
    request: Request,
) -> dict[str, Any]:
    operator = _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        record = receiver_trust_store.revoke_key(
            key_id,
            reason_code=payload.reason_code,
            reason=payload.reason,
            handled_by=operator["displayName"],
            handled_by_operator_id=operator["id"],
            incident_reference=payload.incident_reference,
            revocation_confirmed=payload.revocation_confirmed,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="本機信任清冊找不到指定公鑰。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "key": record,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
        "rotationRequests": _receiver_rotation_requests(),
    }


@app.post("/api/removal-transfer-trust-keys/{new_key_id}/rotation-requests")
def request_receiver_key_rotation_completion(
    new_key_id: str,
    payload: RequestReceiverKeyRotationCompletionRequest,
    request: Request,
) -> dict[str, Any]:
    operator = _receiver_operator(request, required_role="receiver-key-requester", require_csrf=True)
    try:
        with receiver_operator_store.rotation_request_transaction(operator["id"], new_key_id) as connection:
            rotation_request = receiver_trust_store.request_rotation_completion(
                new_key_id,
                reason=payload.reason,
                requested_by=operator["displayName"],
                requester_role=operator_role_label("receiver-key-requester"),
                requested_by_operator_id=operator["id"],
                incident_reference=payload.incident_reference,
                request_confirmed=payload.request_confirmed,
            )
            receiver_operator_store.record_rotation_request(connection, rotation_request, operator["id"])
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="本機信任清冊找不到指定的輪替新金鑰。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "request": rotation_request,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
        "rotationRequests": _receiver_rotation_requests(),
    }


@app.post("/api/removal-transfer-trust-key-rotation-requests/{request_fingerprint}/approve")
def approve_receiver_key_rotation_completion(
    request_fingerprint: str,
    payload: ApproveReceiverKeyRotationCompletionRequest,
    request: Request,
) -> dict[str, Any]:
    operator = _receiver_operator(request, required_role="receiver-key-approver", require_csrf=True)
    try:
        with receiver_operator_store.rotation_approval_transaction(
            operator["id"], request_fingerprint
        ) as (connection, _claim):
            completed = receiver_trust_store.approve_rotation_completion(
                request_fingerprint,
                approved_by=operator["displayName"],
                approver_role=operator_role_label("receiver-key-approver"),
                approved_by_operator_id=operator["id"],
                approval_confirmed=payload.approval_confirmed,
            )
            receiver_operator_store.record_rotation_approval(
                connection,
                request_fingerprint,
                operator["id"],
                completed["event"]["eventFingerprint"],
                completed["event"]["effectiveAt"],
            )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="本機信任清冊找不到指定的輪替覆核申請。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        **completed,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
        "rotationRequests": _receiver_rotation_requests(),
    }


@app.post("/api/removal-transfer-trust-keys/{new_key_id}/complete-rotation")
def complete_receiver_key_rotation(
    new_key_id: str,
    payload: CompleteReceiverKeyRotationRequest,
    request: Request,
) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        completed = receiver_trust_store.complete_rotation(
            new_key_id,
            reason=payload.reason,
            handled_by=payload.handled_by,
            incident_reference=payload.incident_reference,
            rotation_confirmed=payload.rotation_confirmed,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="本機信任清冊找不到指定的輪替新金鑰。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {
        **completed,
        "keys": receiver_trust_store.list_keys(),
        "events": receiver_trust_store.list_events(),
    }


@app.post("/api/removal-transfer-trust-registry/backups/export")
def export_receiver_trust_registry_backup(request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        backup = build_receiver_trust_registry_backup(receiver_trust_store)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"backup": backup}


@app.post("/api/removal-transfer-trust-registry/backups/validate")
def validate_receiver_trust_registry_backup(backup: dict[str, Any], request: Request) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        return preview_receiver_trust_registry_restore(receiver_trust_store, backup)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/removal-transfer-trust-registry/backups/restore")
def restore_receiver_trust_registry(
    payload: RestoreReceiverTrustRegistryRequest,
    request: Request,
) -> dict[str, Any]:
    _receiver_operator(request, required_role="receiver-key-admin", require_csrf=True)
    try:
        restored = restore_receiver_trust_registry_backup(
            receiver_trust_store,
            payload.backup,
            restore_confirmed=payload.restore_confirmed,
        )
        return {
            **restored,
            "rotationRequests": _receiver_rotation_requests(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/removal-transfer-evidence-template-packages/validate")
def validate_receiver_evidence_template_package(package: dict[str, Any]) -> dict[str, Any]:
    try:
        return validate_receiver_evidence_template_publisher_package(
            package,
            receiver_trust_store.list_keys(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/removal-transfer-handoffs/validate")
def validate_external_removal_transfer_handoff(handoff: dict[str, Any]) -> dict[str, Any]:
    try:
        return validate_removal_transfer_handoff(handoff)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/removal-transfer-receipts/build")
def build_external_receiver_verification_receipt(
    request: BuildReceiverReceiptRequest,
) -> dict[str, Any]:
    try:
        handoff = validate_removal_transfer_handoff(request.handoff)
        receipt = build_receiver_verification_receipt(
            handoff,
            request.verification_authority,
            request.results,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "handoff": handoff,
        "receipt": receipt,
        "receiptValidation": _receipt_validation(receipt),
    }


@app.post("/api/removal-transfer/reshore-member-capacity")
def calculate_external_reshore_member_capacity(
    request: CalculateReshoreMemberCapacityRequest,
) -> dict[str, Any]:
    try:
        return calculate_reshore_member_capacity(
            request.handoff,
            request.transfer_id,
            request.calculation_input,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/removal-transfer-receipts/validate")
def validate_external_receiver_verification_receipt(
    request: ValidateReceiverReceiptRequest,
) -> dict[str, Any]:
    try:
        handoff = validate_removal_transfer_handoff(request.handoff)
        receipt = validate_receiver_verification_receipt(request.receipt, handoff)
        validation = _receipt_validation(receipt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "handoff": handoff,
        "receipt": receipt,
        "receiptValidation": validation,
    }


@app.post("/api/removal-transfer-receipts/signing-request")
def build_external_receiver_identity_signing_request(
    request: BuildReceiverSigningRequestRequest,
) -> dict[str, Any]:
    try:
        handoff = validate_removal_transfer_handoff(request.handoff)
        receipt = validate_receiver_verification_receipt(request.receipt, handoff)
        signing_request = build_receiver_identity_signing_request(receipt, handoff)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"signingRequest": signing_request}


@app.post("/api/removal-transfer-receipts/attach-signature")
def attach_external_receiver_identity_signature(
    request: AttachReceiverSignatureRequest,
) -> dict[str, Any]:
    try:
        handoff = validate_removal_transfer_handoff(request.handoff)
        receipt = attach_receiver_identity_signature(
            request.receipt,
            handoff,
            request.signature_response,
        )
        validation = _receipt_validation(receipt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "handoff": handoff,
        "receipt": receipt,
        "receiptValidation": validation,
    }


def _append_warning(project_result, message: str) -> None:
    if message not in project_result.warnings:
        project_result.warnings.append(message)


def _annotate_import_result(project_result) -> None:
    counts = _summarize_import_events(project_result)
    candidate_count = counts["support"] + counts["brace"]
    if candidate_count > 0:
        parts = []
        if counts["support"] > 0:
            parts.append(f"{counts['support']} 道水平支撐候選")
        if counts["brace"] > 0:
            parts.append(f"{counts['brace']} 道斜撐候選")
        if counts["floor"] > 0:
            parts.append(f"忽略樓版 {counts['floor']} 筆")
        if counts["remove"] > 0:
            parts.append(f"辨識拆撐事件 {counts['remove']} 筆")
        if counts["other"] > 0:
            parts.append(f"待人工判讀 {counts['other']} 筆")
        _append_warning(
            project_result,
            (
                f"已完成匯入分類：{'、'.join(parts)}。本次匯入僅代表單側分析結果，"
                "請先確認摘要內容，再於設計步驟補齊型號、橫擋與角撐資料。"
            ),
        )
        return
    if counts["floor"] > 0 or counts["remove"] > 0 or counts["other"] > 0:
        _append_warning(
            project_result,
            (
                "本次匯入未辨識出可直接套用的支撐候選；"
                f"樓版 {counts['floor']} 筆、拆撐 {counts['remove']} 筆、待人工判讀 {counts['other']} 筆。"
                "請確認匯入摘要後，再手動建立支撐列。"
            ),
        )
        return
    _append_warning(project_result, "本次匯入未辨識出支撐資料，請手動建立支撐列。")


def _side_label(side: Literal["top", "bottom"]) -> str:
    return "上層" if side == "top" else "下層"


def _flatten_imported_struts(project_result: AnalysisImportResult) -> list[dict[str, Any]]:
    if project_result.events:
        rows: list[dict[str, Any]] = []
        stage_labels = {stage.index: stage.label for stage in project_result.stages}
        for event in project_result.events:
            if event.classification not in {"support", "brace"}:
                continue
            if (
                event.depth_m is None
                or event.span_m is None
                or event.angle_deg is None
                or event.load_t is None
                or event.stiffness is None
            ):
                continue
            control_stage_indices = event.control_stage_indices or [event.stage_index]
            stage_force_cases = [item.model_dump() for item in event.stage_force_cases]
            rows.append(
                {
                    "stage_index": event.stage_index,
                    "stage_label": event.stage_label,
                    "install_stage_index": event.stage_index,
                    "install_stage_label": event.stage_label,
                    "index": event.butt_no or len(rows) + 1,
                    "classification": event.classification,
                    "depth_m": event.depth_m,
                    "span_m": event.span_m,
                    "angle_deg": event.angle_deg,
                    "load_t": event.load_t,
                    "stiffness": event.stiffness,
                    "stage_cases": stage_force_cases or [
                        {
                            "stage_index": stage_index,
                            "stage_label": stage_labels.get(stage_index, f"施工階段 {stage_index}"),
                            "axial_force_t": round(float(event.load_t), 6),
                        }
                        for stage_index in control_stage_indices
                    ],
                }
            )
        if rows:
            return rows

    rows: list[dict[str, Any]] = []
    for stage in project_result.stages:
        for strut in stage.struts:
            rows.append(
                {
                    "stage_index": stage.index,
                    "stage_label": stage.label,
                    "index": strut.index,
                    "classification": "support" if abs(strut.angle_deg) <= 10 else "brace",
                    "depth_m": strut.depth_m,
                    "span_m": strut.span_m,
                    "angle_deg": strut.angle_deg,
                    "load_t": strut.load_t,
                    "stiffness": strut.stiffness,
                }
            )
    return rows


def _stage_force_case(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "stage_index": int(row["stage_index"]),
        "stage_label": str(row["stage_label"]),
        "axial_force_t": round(float(row["load_t"]), 6),
    }


def _merge_stage_force_cases(cases: list[dict[str, Any]], row: dict[str, Any]) -> list[dict[str, Any]]:
    merged = {(int(item["stage_index"]), str(item["stage_label"])): dict(item) for item in cases}
    candidates = row.get("stage_cases") or [_stage_force_case(row)]
    for candidate in candidates:
        key = (int(candidate["stage_index"]), str(candidate["stage_label"]))
        existing = merged.get(key)
        if existing is None or float(candidate["axial_force_t"]) >= float(existing["axial_force_t"]):
            merged[key] = dict(candidate)
    return sorted(merged.values(), key=lambda item: (item["stage_index"], item["stage_label"]))


def _consolidate_imported_struts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = f"{row['classification']}-{row['index']}-{row['depth_m']:.2f}-{abs(row['angle_deg']):.1f}"
        existing = grouped.get(key)
        if existing is None:
            grouped[key] = {**row, "stage_cases": row.get("stage_cases") or [_stage_force_case(row)]}
            continue
        stage_cases = _merge_stage_force_cases(existing.get("stage_cases", []), row)
        install_candidates = [
            (int(existing.get("install_stage_index", existing["stage_index"])), str(existing.get("install_stage_label", existing["stage_label"]))),
            (int(row.get("install_stage_index", row["stage_index"])), str(row.get("install_stage_label", row["stage_label"]))),
        ]
        install_stage_index, install_stage_label = min(install_candidates, key=lambda item: item[0])
        if row["load_t"] >= existing["load_t"]:
            grouped[key] = {
                **row,
                "stage_cases": stage_cases,
                "install_stage_index": install_stage_index,
                "install_stage_label": install_stage_label,
            }
            continue
        existing["stage_cases"] = stage_cases
        existing["install_stage_index"] = install_stage_index
        existing["install_stage_label"] = install_stage_label
        existing["span_m"] = max(existing["span_m"], row["span_m"])
        existing["stiffness"] = max(existing["stiffness"], row["stiffness"])
    return sorted(
        grouped.values(),
        key=lambda item: (item["depth_m"], item["index"], item["stage_index"]),
    )


def _build_imported_assignments(project_result: AnalysisImportResult) -> list[dict[str, Any]]:
    consolidated = _consolidate_imported_struts(_flatten_imported_struts(project_result))
    removal_by_butt = {
        event.butt_no: event
        for event in sorted(project_result.events, key=lambda item: item.stage_index)
        if event.classification == "remove" and event.butt_no is not None
    }
    assignments: list[dict[str, Any]] = []
    for row in consolidated:
        kind = row.get("classification")
        if kind not in {"support", "brace"}:
            continue
        stage_cases = row.get("stage_cases", [_stage_force_case(row)])
        maximum_force = max(float(item["axial_force_t"]) for item in stage_cases)
        control = next(item for item in stage_cases if float(item["axial_force_t"]) == maximum_force)
        removal = removal_by_butt.get(row["index"])
        assignments.append(
            {
                "id": f"{kind}-{row['index']}-{row['depth_m']:.2f}-{len(assignments)}",
                "kind": kind,
                "level_label": str(len([item for item in assignments if item["kind"] == kind]) + 1),
                "depth_m": row["depth_m"],
                "span_m": row["span_m"],
                "angle_deg": row["angle_deg"],
                "load_t": row["load_t"],
                "install_stage_index": row.get("install_stage_index", row["stage_index"]),
                "install_stage_label": row.get("install_stage_label", row["stage_label"]),
                "control_stage_index": control["stage_index"],
                "control_stage_label": control["stage_label"],
                "removal_stage_index": removal.stage_index if removal else None,
                "removal_stage_label": removal.stage_label if removal else "",
                "stage_cases": stage_cases,
                "stage_labels": [item["stage_label"] for item in stage_cases],
            }
        )
    return assignments


def _pick_section_name(existing_rows: list[Any], index: int) -> str:
    if index < len(existing_rows):
        return getattr(existing_rows[index], "section_name", "") or ""
    if existing_rows:
        return getattr(existing_rows[0], "section_name", "") or ""
    return ""


def _to_candidate_support_row(
    item: dict[str, Any],
    existing_rows: list[SupportRow],
    index: int,
) -> SupportRow:
    return SupportRow(
        level_label=item["level_label"],
        support_count=existing_rows[index].support_count if index < len(existing_rows) else 1,
        section_name=_pick_section_name(existing_rows, index),
        axial_force_t=round(float(item["load_t"]), 3),
        temp_force_t=0.0,
        spacing_m=round(float(item["span_m"]), 3),
        force_source="analysis_import",
        analysis_stage_cases=item["stage_cases"],
        analysis_install_stage_index=item["install_stage_index"],
        analysis_install_stage_label=item["install_stage_label"],
        analysis_control_stage_index=item["control_stage_index"],
        analysis_control_stage_label=item["control_stage_label"],
        analysis_removal_stage_index=item["removal_stage_index"],
        analysis_removal_stage_label=item["removal_stage_label"],
        construction_step_label="",
        analysis_mapping_confirmed=False,
        analysis_mapping_basis="",
    )


def _to_candidate_brace_row(
    item: dict[str, Any],
    existing_rows: list[BraceRow],
    index: int,
) -> BraceRow:
    base_length = max(float(item["span_m"]), 0.001)
    tributary_line_load = float(item["load_t"]) * math.sin(math.radians(abs(float(item["angle_deg"])))) / base_length
    return BraceRow(
        level_label=item["level_label"],
        section_name=_pick_section_name(existing_rows, index),
        l1_m=round(base_length, 3),
        l2_m=round(base_length, 3),
        angle_deg=round(float(item["angle_deg"]), 3),
        tributary_line_load_tf_per_m=round(tributary_line_load, 3),
        force_source="analysis_import",
        analysis_stage_cases=item["stage_cases"],
        analysis_install_stage_index=item["install_stage_index"],
        analysis_install_stage_label=item["install_stage_label"],
        analysis_control_stage_index=item["control_stage_index"],
        analysis_control_stage_label=item["control_stage_label"],
        analysis_removal_stage_index=item["removal_stage_index"],
        analysis_removal_stage_label=item["removal_stage_label"],
        construction_step_label="",
        analysis_mapping_confirmed=False,
        analysis_mapping_basis="",
    )


def _apply_import_to_side(
    project: ProjectState,
    side: Literal["top", "bottom"],
    parsed: AnalysisImportResult,
) -> None:
    assignments = _build_imported_assignments(parsed)
    support_assignments = [item for item in assignments if item["kind"] == "support"]
    brace_assignments = [item for item in assignments if item["kind"] == "brace"]
    support_key = "top_supports" if side == "top" else "bottom_supports"
    brace_key = "top_braces" if side == "top" else "bottom_braces"
    wale_key = "top_wales" if side == "top" else "bottom_wales"
    source_key = "top_analysis_source" if side == "top" else "bottom_analysis_source"

    setattr(project, source_key, AnalysisSideSource(mode="import", import_result=parsed))

    if support_assignments or brace_assignments:
        existing_supports = list(getattr(project, support_key))
        existing_braces = list(getattr(project, brace_key))
        setattr(
            project,
            support_key,
            [
                _to_candidate_support_row(item, existing_supports, index)
                for index, item in enumerate(support_assignments)
            ],
        )
        setattr(
            project,
            brace_key,
            [
                _to_candidate_brace_row(item, existing_braces, index)
                for index, item in enumerate(brace_assignments)
            ],
        )
        setattr(project, wale_key, [])

    if side == "top":
        if getattr(project, support_key):
            project.calculation_options.include_top_supports = True
        if brace_assignments:
            project.calculation_options.include_top_braces = True
        project.top_analysis_source.mode = "import"
    else:
        if getattr(project, support_key):
            project.calculation_options.include_bottom_supports = True
        if brace_assignments:
            project.calculation_options.include_bottom_braces = True
        project.bottom_analysis_source.mode = "import"

    if (
        not project.calculation_options.include_top_supports
        and not project.calculation_options.include_bottom_supports
    ):
        if side == "top":
            project.calculation_options.include_top_supports = True
        else:
            project.calculation_options.include_bottom_supports = True

    project.calculation_results = None


def _pick_first_non_empty(values: list[Any]) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _merge_analysis_sources(
    project: ProjectState,
    latest_side: Literal["top", "bottom"],
) -> AnalysisImportResult:
    ordered_sides: list[Literal["top", "bottom"]] = [latest_side, "bottom" if latest_side == "top" else "top"]
    imports: list[tuple[Literal["top", "bottom"], AnalysisImportResult]] = []
    for side in ordered_sides:
        source = project.top_analysis_source if side == "top" else project.bottom_analysis_source
        if source.mode == "import" and source.import_result.source_name:
            imports.append((side, source.import_result))
    if not imports:
        return project.analysis_import

    source_name = "；".join(
        f"{_side_label(side)}：{result.source_name}" for side, result in imports if result.source_name
    )
    source_types = [result.source_type for _, result in imports if result.source_type]
    project_titles = [result.project_title for _, result in imports if result.project_title]
    wall_lengths = [result.wall_length_m for _, result in imports]
    wall_thicknesses = [result.wall_thickness_m for _, result in imports]
    excavation_depths = [result.excavation_depth_m for _, result in imports]
    water_levels = [result.ground_water_level_m for _, result in imports]
    wall_eis = [result.wall_ei_tf_m2_per_m for _, result in imports]

    stages = []
    events = []
    for side, result in imports:
        stage_mapping: dict[int, tuple[int, str]] = {}
        for stage in result.stages:
            new_index = len(stages) + 1
            new_label = f"{_side_label(side)} {stage.label}"
            stages.append(stage.model_copy(update={"index": new_index, "label": new_label}))
            stage_mapping[stage.index] = (new_index, new_label)
        for event in result.events:
            mapped_index, mapped_label = stage_mapping.get(
                event.stage_index,
                (event.stage_index, f"{_side_label(side)} {event.stage_label}"),
            )
            events.append(
                event.model_copy(
                    update={
                        "stage_index": mapped_index,
                        "stage_label": mapped_label,
                    }
                )
            )

    soils = _pick_first_non_empty(
        [[soil.model_copy(deep=True) for soil in result.soils] for _, result in imports if result.soils]
    )
    if not soils:
        soils = [soil.model_copy(deep=True) for soil in project.analysis_import.soils]

    warnings: list[str] = []
    for side, result in imports:
        for warning in result.warnings:
            message = f"{_side_label(side)}：{warning}"
            if message not in warnings:
                warnings.append(message)

    raw_preview: list[str] = []
    for side, result in imports:
        if result.raw_preview:
            raw_preview.append(f"[{_side_label(side)}]")
            raw_preview.extend(result.raw_preview[:20])

    return AnalysisImportResult(
        source_name=source_name,
        source_type=" / ".join(dict.fromkeys(source_types)) if source_types else "",
        project_title=_pick_first_non_empty(project_titles) or "",
        wall_length_m=_pick_first_non_empty(wall_lengths),
        wall_thickness_m=_pick_first_non_empty(wall_thicknesses),
        excavation_depth_m=_pick_first_non_empty(excavation_depths),
        ground_water_level_m=_pick_first_non_empty(water_levels),
        wall_ei_tf_m2_per_m=_pick_first_non_empty(wall_eis),
        soils=soils,
        stages=stages,
        events=events,
        warnings=warnings,
        raw_preview=raw_preview[:120],
    )


def _summarize_import_events(project_result: AnalysisImportResult) -> dict[str, int]:
    counts = {
        "support": 0,
        "brace": 0,
        "floor": 0,
        "remove": 0,
        "other": 0,
    }
    if project_result.events:
        for event in project_result.events:
            counts[event.classification] = counts.get(event.classification, 0) + 1
        return counts

    for stage in project_result.stages:
        for strut in stage.struts:
            if abs(strut.angle_deg) <= 10:
                counts["support"] += 1
            elif abs(strut.angle_deg) < 80:
                counts["brace"] += 1
            else:
                counts["other"] += 1
    return counts


@app.get("/api/bootstrap", response_model=BootstrapPayload)
def bootstrap() -> BootstrapPayload:
    return BootstrapPayload(
        reference_data=load_reference_data(),
        default_project=load_default_project(),
        sample_analysis_files=[path.name for path in settings.sample_analysis_files if path.exists()],
    )


@app.get("/api/reference-data", response_model=ReferenceData)
def get_reference_data() -> ReferenceData:
    return load_reference_data()


@app.put("/api/reference-data", response_model=ReferenceData)
def update_reference_data(request: SaveReferenceDataRequest) -> ReferenceData:
    try:
        return save_reference_data(request.reference_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/reference-data", response_model=ReferenceData)
def restore_reference_data() -> ReferenceData:
    return reset_reference_overrides()


@app.get("/api/projects")
def list_projects() -> list[dict[str, str | None]]:
    return [item.model_dump(mode="json") for item in store.list_projects()]


@app.post("/api/projects", response_model=ProjectState)
def create_project(request: CreateProjectRequest) -> ProjectState:
    return store.create_project(request.name)


@app.get("/api/projects/{project_id}", response_model=ProjectState)
def get_project(project_id: str) -> ProjectState:
    try:
        return store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.put("/api/projects/{project_id}", response_model=SaveProjectResponse)
def save_project(project_id: str, request: SaveProjectRequest) -> SaveProjectResponse:
    if project_id != request.project.metadata.id:
        raise HTTPException(status_code=400, detail="Project id mismatch")
    try:
        saved = store.save_project(request.project)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    return SaveProjectResponse(project=saved)


@app.post("/api/projects/{project_id}/import-analysis", response_model=ProjectState)
async def import_analysis(
    project_id: str,
    side: Literal["top", "bottom"] = Form(...),
    file: UploadFile = File(...),
) -> ProjectState:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    data = await file.read()
    store.save_imported_file(project_id, f"{side}-{file.filename or 'analysis.txt'}", data)
    content = data.decode("utf-8", errors="ignore")
    parsed = parse_analysis_file(file.filename or "analysis.txt", content)
    _annotate_import_result(parsed)
    _apply_import_to_side(project, side, parsed)
    project.analysis_import = _merge_analysis_sources(project, side)
    if parsed.project_title and not project.metadata.project_code:
        project.metadata.project_code = parsed.project_title
    if parsed.project_title and project.metadata.name == "Excel 轉換範例專案":
        project.metadata.name = parsed.project_title
    return store.save_project(project)


@app.post("/api/projects/{project_id}/calculate", response_model=ProjectState)
def calculate(project_id: str) -> ProjectState:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    project.calculation_results = calculate_project(project)
    return store.save_project(project)


@app.post("/api/projects/{project_id}/removal-transfer-handoff")
def generate_removal_transfer_handoff(project_id: str) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    project.calculation_results = calculate_project(project)
    try:
        candidate = build_removal_transfer_handoff(project, calculation_fingerprint(project))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    handoffs = list(project.removal_transfer_handoffs)
    latest_handoff_is_valid = False
    if handoffs:
        try:
            validate_removal_transfer_handoff(handoffs[-1])
            latest_handoff_is_valid = True
        except ValueError:
            latest_handoff_is_valid = False
    if latest_handoff_is_valid and same_removal_transfer_handoff_content(handoffs[-1], candidate):
        record = handoffs[-1]
    else:
        handoffs.append(candidate)
        project.removal_transfer_handoffs = handoffs[-50:]
        record = candidate
    store.save_project(project)
    return record


@app.post("/api/projects/{project_id}/removal-transfer-receipts")
async def import_removal_transfer_receipt(
    project_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    data = await file.read()
    if not data or len(data) > 1_000_000:
        raise HTTPException(status_code=400, detail="承接構造回簽檔必須為 1 MB 以下的非空 JSON。")
    try:
        payload = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="承接構造回簽檔不是有效的 UTF-8 JSON。") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="承接構造回簽最外層必須為 JSON 物件。")
    handoff_fingerprint = str(payload.get("handoffFingerprint", ""))
    handoff = next(
        (
            item
            for item in reversed(project.removal_transfer_handoffs)
            if str(item.get("handoffFingerprint", "")) == handoff_fingerprint
        ),
        None,
    )
    if handoff is None:
        raise HTTPException(status_code=400, detail="本專案找不到回簽所指向的已發 ERH 交接版本。")
    try:
        receipt = validate_receiver_verification_receipt(payload, handoff)
        validation = _receipt_validation(receipt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    receipt_fingerprint = str(receipt["receiptFingerprint"])
    if any(
        str(item.get("receiptFingerprint", "")) == receipt_fingerprint
        for item in project.removal_transfer_verification_receipts
    ):
        raise HTTPException(status_code=409, detail="本專案已匯入相同承接構造回簽。")
    project.removal_transfer_verification_receipts = [
        *project.removal_transfer_verification_receipts,
        receipt,
    ][-100:]
    store.save_imported_file(project_id, f"removal-transfer-receipt-{receipt_fingerprint}.json", data)
    project = store.save_project(project)
    return {
        "project": project,
        "handoff": handoff,
        "receipt": receipt,
        "receiptValidation": validation,
    }


@app.post("/api/projects/{project_id}/source-capacity-evidence-verifications")
def create_source_capacity_evidence_verification(
    project_id: str,
    request: BuildSourceEvidenceVerificationRequest,
) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    handoff = next(
        (
            item for item in reversed(project.removal_transfer_handoffs)
            if str(item.get("handoffFingerprint", "")) == request.handoff_fingerprint
        ),
        None,
    )
    receipt = next(
        (
            item for item in reversed(project.removal_transfer_verification_receipts)
            if str(item.get("receiptFingerprint", "")) == request.receipt_fingerprint
        ),
        None,
    )
    if handoff is None or receipt is None:
        raise HTTPException(status_code=400, detail="本專案找不到 SEV 所指向的 ERH 或 RVR。")
    try:
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            request.verification_authority,
            request.verification_basis,
            request.matches,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    fingerprint = str(record["verificationFingerprint"])
    project.source_capacity_evidence_verifications = [
        *project.source_capacity_evidence_verifications,
        record,
    ][-100:]
    store.save_imported_file(
        project_id,
        f"source-capacity-evidence-verification-{fingerprint}.json",
        (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    project = store.save_project(project)
    return {
        "project": project,
        "record": record,
        "identityVerification": _source_evidence_validation(record),
    }


@app.post("/api/projects/{project_id}/source-capacity-evidence-verifications/signing-request")
def build_project_source_evidence_signing_request(
    project_id: str,
    request: BuildSourceEvidenceSigningRequestRequest,
) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
        _, record, _, _ = _source_evidence_context(project, request.verification_fingerprint)
        signing_request = build_source_evidence_identity_signing_request(record)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"signingRequest": signing_request}


@app.post("/api/projects/{project_id}/source-capacity-evidence-verifications/attach-signature")
def attach_project_source_evidence_signature(
    project_id: str,
    request: AttachSourceEvidenceSignatureRequest,
) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
        record_index, record, handoff, receipt = _source_evidence_context(
            project,
            request.verification_fingerprint,
        )
        signed_record = attach_source_evidence_identity_signature(record, request.signature_response)
        signed_record = validate_source_capacity_evidence_verification(signed_record, handoff, receipt)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    project.source_capacity_evidence_verifications[record_index] = signed_record
    fingerprint = str(signed_record["verificationFingerprint"])
    store.save_imported_file(
        project_id,
        f"source-capacity-evidence-verification-signed-{fingerprint}.json",
        (json.dumps(signed_record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    project = store.save_project(project)
    return {
        "project": project,
        "record": signed_record,
        "identityVerification": _source_evidence_validation(signed_record),
    }


@app.get("/api/projects/{project_id}/source-capacity-evidence-verifications/{verification_fingerprint}/validation")
def validate_project_source_evidence_identity(
    project_id: str,
    verification_fingerprint: str,
) -> dict[str, Any]:
    try:
        project = store.get_project(project_id)
        _, record, _, _ = _source_evidence_context(project, verification_fingerprint)
        return {"identityVerification": _source_evidence_validation(record)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/report", response_model=ReportPayload)
def generate_report(project_id: str, concise: bool = False, approved: bool = False) -> ReportPayload:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    if project.calculation_results is None:
        project.calculation_results = calculate_project(project)
        project = store.save_project(project)
    output_at = datetime.now().astimezone()
    document_metadata = report_document_metadata(approved=approved, output_at=output_at)
    report_path = build_report(project, concise_mode=concise, approved=approved, output_at=output_at)
    evidence_path: Path | None = None
    source_bundle_path: Path | None = None
    if approved:
        try:
            evidence_path = build_pdf_canonical_render_evidence(report_path)
            source_bundle_path = build_pdf_formal_source_bundle(report_path, evidence_path)
        except Exception as exc:
            report_path.unlink(missing_ok=True)
            report_path.with_name(f"{report_path.stem}.canonical-render.evidence.json").unlink(missing_ok=True)
            report_path.with_name(f"{report_path.stem}.formal-source.zip").unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail=f"正式 PDF 可見性證據或來源套件建立失敗：{exc}") from exc
    store.save_report(project_id, report_path)
    return ReportPayload(
        project=project,
        report_path=str(report_path),
        download_url=f"/api/projects/{project_id}/report/files/{report_path.name}",
        latest_download_url=f"/api/projects/{project_id}/report/latest?v={report_path.name}",
        report_mode="concise" if concise else "detailed",
        report_kind="pdf",
        document_status=document_metadata["document_status"],
        approval_time=document_metadata["approval_time"] or None,
        canonical_evidence_url=(
            f"/api/projects/{project_id}/report/files/{evidence_path.name}" if evidence_path is not None else None
        ),
        formal_source_bundle_url=(
            f"/api/projects/{project_id}/report/files/{source_bundle_path.name}"
            if source_bundle_path is not None
            else None
        ),
    )


@app.get("/api/projects/{project_id}/report/latest")
def download_latest_report(project_id: str) -> FileResponse:
    path = store.project_dir(project_id) / "latest-report.pdf"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{project_id}-report.pdf",
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


@app.post("/api/projects/{project_id}/report/docx", response_model=ReportPayload)
def generate_word_report(project_id: str, concise: bool = False, approved: bool = False) -> ReportPayload:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    if project.calculation_results is None:
        project.calculation_results = calculate_project(project)
        project = store.save_project(project)
    output_at = datetime.now().astimezone()
    document_metadata = report_document_metadata(approved=approved, output_at=output_at)
    report_path = build_word_report(project, concise_mode=concise, approved=approved, output_at=output_at)
    store.save_report(project_id, report_path, latest_name="latest-report.docx")
    return ReportPayload(
        project=project,
        report_path=str(report_path),
        download_url=f"/api/projects/{project_id}/report/files/{report_path.name}",
        latest_download_url=f"/api/projects/{project_id}/report/latest-docx?v={report_path.name}",
        report_mode="concise" if concise else "detailed",
        report_kind="docx",
        document_status=document_metadata["document_status"],
        approval_time=document_metadata["approval_time"] or None,
    )


@app.get("/api/projects/{project_id}/report/latest-docx")
def download_latest_word_report(project_id: str) -> FileResponse:
    path = store.project_dir(project_id) / "latest-report.docx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{project_id}-report.docx",
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


@app.get("/api/projects/{project_id}/report/files/{filename}")
def download_generated_artifact(project_id: str, filename: str) -> FileResponse:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not safe_name.startswith(f"{project_id}-"):
        raise HTTPException(status_code=404, detail="Report not found")
    path = settings.reports_dir / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        media_type = "application/pdf"
    elif suffix == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif safe_name.endswith(".canonical-render.evidence.json"):
        media_type = "application/json"
    elif safe_name.endswith(".formal-source.zip"):
        media_type = "application/zip"
    else:
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type=media_type,
        filename=safe_name,
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


def _proxy_frontend_dev(request: Request, full_path: str) -> Response | None:
    target = settings.frontend_dev_url.rstrip("/")
    if full_path:
        target = f"{target}/{full_path.lstrip('/')}"
    query = request.url.query
    if query:
        target = f"{target}?{query}"

    upstream_request = UrlRequest(
        target,
        headers={"Accept": request.headers.get("accept", "*/*")},
    )
    try:
        with urlopen(upstream_request, timeout=2) as upstream:
            headers = {}
            for header_name in ("Content-Type", "Cache-Control", "ETag", "Last-Modified"):
                header_value = upstream.headers.get(header_name)
                if header_value:
                    headers[header_name] = header_value
            return Response(
                content=upstream.read(),
                status_code=getattr(upstream, "status", 200),
                headers=headers,
            )
    except HTTPError as exc:
        headers = {}
        content_type = exc.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type
        return Response(content=exc.read(), status_code=exc.code, headers=headers)
    except (URLError, OSError, TimeoutError):
        return None


def _serve_frontend_static(full_path: str) -> FileResponse:
    dist_dir = settings.frontend_dist_dir.resolve()
    relative_path = Path(full_path) if full_path else Path("index.html")
    candidate = (dist_dir / relative_path).resolve()
    if dist_dir not in candidate.parents and candidate != dist_dir:
        raise HTTPException(status_code=404, detail="Frontend not found")
    if candidate.is_file():
        return FileResponse(candidate)

    index_path = dist_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=503, detail="Frontend assets are not available")


def _serve_frontend(request: Request, full_path: str) -> Response:
    proxied = _proxy_frontend_dev(request, full_path)
    if proxied is not None:
        return proxied
    return _serve_frontend_static(full_path)


@app.get("/", include_in_schema=False)
def frontend_root(request: Request) -> Response:
    return _serve_frontend(request, "")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_catch_all(full_path: str, request: Request) -> Response:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    return _serve_frontend(request, full_path)
