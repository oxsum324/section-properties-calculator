from __future__ import annotations

import base64
import binascii
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
from typing import Any, Iterable

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .receiver_governance_health import (
    build_receiver_governance_health_history_export,
    validate_receiver_governance_health_history_export,
)
from .receiver_operator_auth import ReceiverOperatorStore
from .removal_transfer_handoff import receiver_identity_key_id


CHECKPOINT_SIGNING_REQUEST_KIND = "receiver-governance-health-checkpoint-signing-request"
CHECKPOINT_SIGNATURE_RESPONSE_KIND = "receiver-governance-health-signed-checkpoint"
CHECKPOINT_SIGNATURE_CONTEXT = "receiver-governance-health-checkpoint-v1"
CHECKPOINT_BOUNDARY = {
    "portableExternalRecord": True,
    "externalStorageVerified": False,
    "externalTimestamp": False,
    "digitalSignature": True,
    "formalCalculationAttachment": False,
}


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _digest(prefix: str, value: Any) -> str:
    return f"{prefix}-{hashlib.sha256(_canonical_json_bytes(value)).hexdigest()[:20].upper()}"


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value: Any) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("治理健康檢核點簽署時間不是有效 ISO 8601 日期時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError("治理健康檢核點簽署時間必須包含時區。")
    return _iso(parsed)


def _payload(exported: dict[str, Any], signed_at: str) -> dict[str, Any]:
    return {
        "context": CHECKPOINT_SIGNATURE_CONTEXT,
        "signedAt": signed_at,
        "historyExport": exported,
        "boundary": CHECKPOINT_BOUNDARY,
    }


def _request_fingerprint(request: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in request.items() if key != "requestFingerprint"}
    return _digest("GCR", unsigned)


def _checkpoint_fingerprint(checkpoint: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in checkpoint.items() if key != "checkpointFingerprint"}
    return _digest("GHC", unsigned)


def build_receiver_governance_checkpoint_signing_request(
    history: dict[str, Any],
    *,
    signed_at: datetime | None = None,
) -> dict[str, Any]:
    requested_at = _iso(signed_at or datetime.now(timezone.utc))
    exported = build_receiver_governance_health_history_export(
        history,
        exported_at=datetime.fromisoformat(requested_at.replace("Z", "+00:00")),
    )
    payload = _payload(exported, requested_at)
    request = {
        "schemaVersion": 1,
        "kind": CHECKPOINT_SIGNING_REQUEST_KIND,
        "algorithm": "Ed25519",
        "payloadEncoding": "base64",
        "signedAt": requested_at,
        "exportFingerprint": exported["exportFingerprint"],
        "observationCount": exported["history"]["observationCount"],
        "headFingerprint": exported["history"]["headFingerprint"],
        "payloadBase64": base64.b64encode(_canonical_json_bytes(payload)).decode("ascii"),
    }
    request["requestFingerprint"] = _request_fingerprint(request)
    return validate_receiver_governance_checkpoint_signing_request(request)


def validate_receiver_governance_checkpoint_signing_request(request: Any) -> dict[str, Any]:
    expected_fields = {
        "schemaVersion", "kind", "algorithm", "payloadEncoding", "signedAt",
        "exportFingerprint", "observationCount", "headFingerprint", "payloadBase64",
        "requestFingerprint",
    }
    if not isinstance(request, dict) or set(request) != expected_fields:
        raise ValueError("治理健康檢核點簽署請求格式不正確或含有未識別欄位。")
    if request.get("schemaVersion") != 1 or request.get("kind") != CHECKPOINT_SIGNING_REQUEST_KIND:
        raise ValueError("治理健康檢核點簽署請求版本或種類不受支援。")
    if request.get("algorithm") != "Ed25519" or request.get("payloadEncoding") != "base64":
        raise ValueError("治理健康檢核點簽署演算法或訊息編碼不受支援。")
    signed_at = _parse_time(request.get("signedAt"))
    payload_base64 = str(request.get("payloadBase64", ""))
    if not payload_base64 or len(payload_base64) > 1_400_000:
        raise ValueError("治理健康檢核點簽署訊息缺少或超過 1 MB JSON 上限。")
    try:
        raw_payload = base64.b64decode(payload_base64, validate=True)
        payload = json.loads(raw_payload.decode("utf-8"))
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("治理健康檢核點簽署訊息不是有效 Base64 JSON。") from exc
    if not isinstance(payload, dict) or set(payload) != {"context", "signedAt", "historyExport", "boundary"}:
        raise ValueError("治理健康檢核點簽署訊息格式不正確。")
    if payload.get("context") != CHECKPOINT_SIGNATURE_CONTEXT:
        raise ValueError("治理健康檢核點簽署訊息用途不正確。")
    if payload.get("boundary") != CHECKPOINT_BOUNDARY:
        raise ValueError("治理健康檢核點簽署訊息的證據邊界不正確。")
    if not hmac.compare_digest(_parse_time(payload.get("signedAt")), signed_at):
        raise ValueError("治理健康檢核點簽署時間與訊息不一致。")
    exported = validate_receiver_governance_health_history_export(payload.get("historyExport"))
    history = exported["history"]
    if (
        request.get("exportFingerprint") != exported["exportFingerprint"]
        or request.get("observationCount") != history["observationCount"]
        or request.get("headFingerprint") != history["headFingerprint"]
    ):
        raise ValueError("治理健康檢核點簽署請求摘要與實際歷程不一致。")
    expected_payload = _canonical_json_bytes(_payload(exported, signed_at))
    if not hmac.compare_digest(raw_payload, expected_payload):
        raise ValueError("治理健康檢核點簽署訊息不是標準化內容。")
    fingerprint = str(request.get("requestFingerprint", ""))
    if not re.fullmatch(r"GCR-[0-9A-F]{20}", fingerprint) or not hmac.compare_digest(
        fingerprint,
        _request_fingerprint(request),
    ):
        raise ValueError("治理健康檢核點簽署請求指紋驗證失敗。")
    return deepcopy(request)


def build_receiver_governance_signed_checkpoint(
    signing_request: dict[str, Any],
    signature: dict[str, Any],
) -> dict[str, Any]:
    request = validate_receiver_governance_checkpoint_signing_request(signing_request)
    checkpoint = {
        "schemaVersion": 1,
        "kind": CHECKPOINT_SIGNATURE_RESPONSE_KIND,
        "signingRequest": request,
        "signature": signature,
    }
    checkpoint["checkpointFingerprint"] = _checkpoint_fingerprint(checkpoint)
    validate_receiver_governance_signed_checkpoint(checkpoint)
    return checkpoint


def _signature_trust_result(
    *,
    key_id: str,
    trusted_keys: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    trusted_key = next((item for item in trusted_keys if item.get("keyId") == key_id), None)
    if trusted_key is None:
        return {
            "status": "valid-signature-untrusted-key",
            "trusted": False,
            "message": "檢核點數位簽章有效，但此公鑰尚未列入目前信任清冊。",
        }
    if trusted_key.get("status") != "trusted":
        return {
            "status": "valid-signature-revoked-key",
            "trusted": False,
            "trustedOrganization": trusted_key.get("organization"),
            "keyLabel": trusted_key.get("displayName"),
            "message": "檢核點數位簽章有效，但此公鑰目前已撤銷。",
        }
    return {
        "status": "trusted-signature-valid",
        "trusted": True,
        "trustedOrganization": trusted_key.get("organization"),
        "keyLabel": trusted_key.get("displayName"),
        "message": "檢核點內容完整，且受信任 Ed25519 數位簽章驗證通過。",
    }


def validate_receiver_governance_signed_checkpoint(
    checkpoint: Any,
    trusted_keys: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    if not isinstance(checkpoint, dict) or set(checkpoint) != {
        "schemaVersion", "kind", "signingRequest", "signature", "checkpointFingerprint",
    }:
        raise ValueError("治理健康簽章檢核點格式不正確或含有未識別欄位。")
    if checkpoint.get("schemaVersion") != 1 or checkpoint.get("kind") != CHECKPOINT_SIGNATURE_RESPONSE_KIND:
        raise ValueError("治理健康簽章檢核點版本或種類不受支援。")
    request = validate_receiver_governance_checkpoint_signing_request(checkpoint.get("signingRequest"))
    signature = checkpoint.get("signature")
    if not isinstance(signature, dict) or set(signature) != {
        "algorithm", "keyId", "publicKeyBase64", "signatureBase64",
    }:
        raise ValueError("治理健康簽章檢核點缺少有效簽章資料。")
    if signature.get("algorithm") != "Ed25519":
        raise ValueError("治理健康簽章檢核點的簽章演算法不受支援。")
    public_key_base64 = str(signature.get("publicKeyBase64", ""))
    signature_base64 = str(signature.get("signatureBase64", ""))
    if len(public_key_base64) > 80 or len(signature_base64) > 120:
        raise ValueError("治理健康簽章檢核點的公鑰或簽章值長度不正確。")
    try:
        public_key_bytes = base64.b64decode(public_key_base64, validate=True)
        signature_bytes = base64.b64decode(signature_base64, validate=True)
    except binascii.Error as exc:
        raise ValueError("治理健康簽章檢核點的公鑰或簽章值不是有效 Base64。") from exc
    if len(public_key_bytes) != 32 or len(signature_bytes) != 64:
        raise ValueError("治理健康簽章檢核點的 Ed25519 公鑰或簽章長度不正確。")
    key_id = receiver_identity_key_id(public_key_bytes)
    if not hmac.compare_digest(str(signature.get("keyId", "")), key_id):
        raise ValueError("治理健康簽章檢核點的 Key ID 與實際公鑰不一致。")
    try:
        Ed25519PublicKey.from_public_bytes(public_key_bytes).verify(
            signature_bytes,
            base64.b64decode(request["payloadBase64"], validate=True),
        )
    except InvalidSignature as exc:
        raise ValueError("治理健康檢核點數位簽章驗證失敗，內容或簽章可能已變更。") from exc
    fingerprint = str(checkpoint.get("checkpointFingerprint", ""))
    if not re.fullmatch(r"GHC-[0-9A-F]{20}", fingerprint) or not hmac.compare_digest(
        fingerprint,
        _checkpoint_fingerprint(checkpoint),
    ):
        raise ValueError("治理健康簽章檢核點整包指紋驗證失敗。")
    payload = json.loads(base64.b64decode(request["payloadBase64"], validate=True).decode("utf-8"))
    trust = _signature_trust_result(key_id=key_id, trusted_keys=trusted_keys)
    return {
        "checkpoint": deepcopy(checkpoint),
        "historyExport": payload["historyExport"],
        "signature": {
            "cryptographicValid": True,
            "keyId": key_id,
            "signedAt": request["signedAt"],
            **trust,
        },
        "boundary": CHECKPOINT_BOUNDARY,
    }


def compare_receiver_governance_checkpoint_history(
    checkpoint_history: dict[str, Any],
    current_history: dict[str, Any],
) -> dict[str, Any]:
    checkpoint_history = ReceiverOperatorStore.validate_governance_health_history(checkpoint_history)
    current_history = ReceiverOperatorStore.validate_governance_health_history(current_history)
    checkpoint_fingerprints = [item["receiptFingerprint"] for item in checkpoint_history["observations"]]
    current_fingerprints = [item["receiptFingerprint"] for item in current_history["observations"]]
    shared = min(len(checkpoint_fingerprints), len(current_fingerprints))
    common_prefix = checkpoint_fingerprints[:shared] == current_fingerprints[:shared]
    if checkpoint_fingerprints == current_fingerprints:
        relation = "current-matches-checkpoint"
        label = "目前歷程與檢核點一致"
    elif common_prefix and len(current_fingerprints) > len(checkpoint_fingerprints):
        relation = "current-extends-checkpoint"
        label = "目前歷程由檢核點向前延伸"
    elif common_prefix and len(current_fingerprints) < len(checkpoint_fingerprints):
        relation = "current-behind-checkpoint"
        label = "目前歷程落後於檢核點，疑似回溯或資料遺失"
    else:
        relation = "current-diverged-from-checkpoint"
        label = "目前歷程與檢核點分叉"
    return {
        "relation": relation,
        "relationLabel": label,
        "checkpointObservationCount": checkpoint_history["observationCount"],
        "checkpointHeadFingerprint": checkpoint_history["headFingerprint"],
        "currentObservationCount": current_history["observationCount"],
        "currentHeadFingerprint": current_history["headFingerprint"],
    }


def verify_receiver_governance_checkpoint_against_current(
    checkpoint: Any,
    current_history: dict[str, Any],
    trusted_keys: Iterable[dict[str, Any]] = (),
    *,
    current_snapshot_recorded: bool = True,
) -> dict[str, Any]:
    validated = validate_receiver_governance_signed_checkpoint(checkpoint, trusted_keys)
    comparison = compare_receiver_governance_checkpoint_history(
        validated["historyExport"]["history"],
        current_history,
    )
    relation_acceptable = comparison["relation"] in {
        "current-matches-checkpoint", "current-extends-checkpoint",
    }
    accepted = (
        current_snapshot_recorded
        and validated["signature"]["trusted"]
        and relation_acceptable
    )
    if not current_snapshot_recorded:
        acceptance_message = "目前來源已變動但尚未寫入 GHR；請先記錄目前快照再重新驗證檢核點。"
    elif not validated["signature"]["trusted"]:
        acceptance_message = validated["signature"]["message"]
    elif not relation_acceptable:
        acceptance_message = comparison["relationLabel"]
    else:
        acceptance_message = "受信任簽章與目前 GHR 關係均通過，可作為目前狀態的外部錨點。"
    return {
        "valid": True,
        "acceptedForCurrentState": accepted,
        "acceptanceMessage": acceptance_message,
        "currentSnapshotRecorded": current_snapshot_recorded,
        "checkpointFingerprint": checkpoint["checkpointFingerprint"],
        "exportFingerprint": validated["historyExport"]["exportFingerprint"],
        "requestFingerprint": checkpoint["signingRequest"]["requestFingerprint"],
        "signature": validated["signature"],
        "comparison": comparison,
        "boundary": validated["boundary"],
    }


__all__ = [
    "CHECKPOINT_SIGNATURE_RESPONSE_KIND",
    "CHECKPOINT_SIGNING_REQUEST_KIND",
    "build_receiver_governance_checkpoint_signing_request",
    "build_receiver_governance_signed_checkpoint",
    "compare_receiver_governance_checkpoint_history",
    "validate_receiver_governance_checkpoint_signing_request",
    "validate_receiver_governance_signed_checkpoint",
    "verify_receiver_governance_checkpoint_against_current",
]
