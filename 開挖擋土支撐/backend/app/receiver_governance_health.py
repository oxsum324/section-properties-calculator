from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from typing import Any

from .receiver_operator_auth import ReceiverOperatorStore
from .receiver_operator_backup import receiver_operator_snapshot_fingerprint
from .receiver_trust_backup import receiver_trust_registry_fingerprint
from .receiver_trust_store import ReceiverTrustStore


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value: Any) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("治理健康快照中的 claim 時間必須包含時區。")
    return parsed.astimezone(timezone.utc)


def _is_pending(claim: dict[str, Any], now: datetime) -> bool:
    return claim.get("state") == "pending" and _parse_time(claim.get("expiresAt")) > now


def _health_fingerprint(payload: dict[str, Any]) -> str:
    return "RGH-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def build_receiver_governance_health_snapshot(
    operator_store: ReceiverOperatorStore,
    trust_store: ReceiverTrustStore,
    *,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    now = (generated_at or datetime.now(timezone.utc)).astimezone(timezone.utc)

    # Each source is internally validated and fingerprinted. They are deliberately
    # read separately because SQLite and the JSON trust registry are not one atomic store.
    operator_snapshot = operator_store.governance_snapshot()
    trust_snapshot = trust_store.snapshot()
    operator_fingerprint = receiver_operator_snapshot_fingerprint(operator_snapshot)
    trust_fingerprint = receiver_trust_registry_fingerprint(
        trust_snapshot["keys"],
        trust_snapshot["events"],
    )
    rotation_requests = trust_store.rotation_requests_from_snapshot(trust_snapshot, now=now)

    operators = operator_snapshot["operators"]
    active_operators = [
        operator
        for operator in operators
        if not operator["disabled"] and not operator["passwordResetRequired"]
    ]
    active_requesters = [
        operator
        for operator in active_operators
        if "receiver-key-requester" in operator["roles"]
    ]
    active_approvers = [
        operator
        for operator in active_operators
        if "receiver-key-approver" in operator["roles"]
    ]
    dedicated_requesters = [
        operator
        for operator in active_requesters
        if "receiver-key-approver" not in operator["roles"]
    ]
    dedicated_approvers = [
        operator
        for operator in active_approvers
        if "receiver-key-requester" not in operator["roles"]
    ]
    distinct_pair_available = any(
        requester["id"] != approver["id"]
        for requester in active_requesters
        for approver in active_approvers
    )
    dedicated_pair_available = any(
        requester["id"] != approver["id"]
        for requester in dedicated_requesters
        for approver in dedicated_approvers
    )

    rotation_claims = {
        claim["requestFingerprint"]: claim
        for claim in operator_snapshot["rotationClaims"]
    }
    pending_rotation_requests = [
        request for request in rotation_requests if request["status"] == "pending"
    ]
    pending_rotation_fingerprints = {
        request["requestFingerprint"] for request in pending_rotation_requests
    }
    pending_sqlite_rotation_fingerprints = {
        claim["requestFingerprint"]
        for claim in operator_snapshot["rotationClaims"]
        if _is_pending(claim, now)
    }
    pending_backup_requests = [
        claim
        for claim in operator_snapshot.get("backupDispositionClaims", [])
        if _is_pending(claim, now)
    ]
    unreviewable: list[dict[str, Any]] = []

    for request in pending_rotation_requests:
        fingerprint = request["requestFingerprint"]
        requester_id = request.get("requestedByOperatorId")
        claim = rotation_claims.get(fingerprint)
        reasons: list[str] = []
        if request.get("identityAssurance") != "authenticated-local-account" or not requester_id:
            reasons.append("legacy-procedural-identity")
        if claim is None:
            reasons.append("missing-sqlite-claim")
        elif not _is_pending(claim, now):
            reasons.append("sqlite-claim-not-pending")
        elif claim.get("requestedByOperatorId") != requester_id:
            reasons.append("requester-id-mismatch")
        if not requester_id or not any(approver["id"] != requester_id for approver in active_approvers):
            reasons.append("no-distinct-active-approver")
        if reasons:
            unreviewable.append({
                "claimType": "receiver-key-rotation",
                "requestFingerprint": fingerprint,
                "reasonCodes": reasons,
            })

    for claim in operator_snapshot["rotationClaims"]:
        if _is_pending(claim, now) and claim["requestFingerprint"] not in pending_rotation_fingerprints:
            unreviewable.append({
                "claimType": "receiver-key-rotation",
                "requestFingerprint": claim["requestFingerprint"],
                "reasonCodes": ["missing-or-nonpending-trust-registry-event"],
            })

    for claim in pending_backup_requests:
        requester_id = claim["requestedByOperatorId"]
        if not any(approver["id"] != requester_id for approver in active_approvers):
            unreviewable.append({
                "claimType": "operator-backup-disposition",
                "requestFingerprint": claim["requestFingerprint"],
                "reasonCodes": ["no-distinct-active-approver"],
            })

    if not distinct_pair_available or unreviewable:
        status = "attention"
        status_label = "需要處理"
    elif dedicated_pair_available:
        status = "complete"
        status_label = "分權完整"
    else:
        status = "overlap"
        status_label = "可執行但角色重疊"

    if not distinct_pair_available:
        next_action_code = "establish-distinct-operators"
    elif unreviewable:
        next_action_code = "restore-claim-reviewability"
    elif not dedicated_pair_available:
        next_action_code = "separate-dedicated-roles"
    else:
        next_action_code = "maintain-separation"

    audit_events = operator_snapshot["auditEvents"]
    controlled = {
        "schemaVersion": 1,
        "kind": "receiver-governance-separation-health",
        "status": status,
        "statusLabel": status_label,
        "nextActionCode": next_action_code,
        "activeRequesterCount": len(active_requesters),
        "activeApproverCount": len(active_approvers),
        "distinctPairAvailable": distinct_pair_available,
        "dedicatedPairAvailable": dedicated_pair_available,
        "pendingRotationCount": len(
            pending_rotation_fingerprints | pending_sqlite_rotation_fingerprints
        ),
        "pendingBackupDispositionCount": len(pending_backup_requests),
        "unreviewablePendingCount": len(unreviewable),
        "unreviewablePendingClaims": unreviewable,
        "sources": {
            "operatorGovernanceSnapshotFingerprint": operator_fingerprint,
            "trustRegistryFingerprint": trust_fingerprint,
            "operatorAuditHeadFingerprint": (
                audit_events[-1]["eventFingerprint"] if audit_events else None
            ),
        },
        "consistencyBoundary": {
            "operatorDatabaseSnapshot": "single-sqlite-read-transaction",
            "trustRegistrySnapshot": "single-validated-json-snapshot",
            "crossStoreAtomic": False,
            "authorizationRevalidatedPerOperation": True,
        },
    }
    return {
        **controlled,
        "generatedAt": _iso(now),
        "healthFingerprint": _health_fingerprint(controlled),
    }


__all__ = ["build_receiver_governance_health_snapshot"]
