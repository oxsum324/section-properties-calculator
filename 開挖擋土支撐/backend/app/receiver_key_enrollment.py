from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .removal_transfer_handoff import receiver_identity_key_id


RECEIVER_KEY_ENROLLMENT_KIND = "receiver-verification-key-enrollment"
RECEIVER_KEY_ENROLLMENT_CONTEXT = "receiver-verification-key-enrollment-v1"
_KEY_ID_PATTERN = re.compile(r"^RVK-[0-9A-F]{20}$")
_PACKAGE_FINGERPRINT_PATTERN = re.compile(r"^RKE-[0-9A-F]{20}$")


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _normalized_text(value: Any, field: str, maximum: int = 200) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"RKE 公鑰登錄包缺少 {field}。")
    if len(text) > maximum:
        raise ValueError(f"RKE 公鑰登錄包的 {field} 過長。")
    return text


def _parse_created_at(value: Any) -> str:
    text = _normalized_text(value, "createdAt", 64)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("RKE 公鑰登錄包的 createdAt 不是有效 ISO 8601 時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError("RKE 公鑰登錄包的 createdAt 必須包含時區。")
    return text


def _proof_payload(enrollment: dict[str, Any]) -> dict[str, Any]:
    return {
        "context": RECEIVER_KEY_ENROLLMENT_CONTEXT,
        "algorithm": enrollment["algorithm"],
        "createdAt": enrollment["createdAt"],
        "displayName": enrollment["displayName"],
        "keyId": enrollment["keyId"],
        "organization": enrollment["organization"],
        "publicKeyBase64": enrollment["publicKeyBase64"],
        "replacesKeyId": enrollment["replacesKeyId"],
    }


def _package_fingerprint(enrollment: dict[str, Any]) -> str:
    controlled = {
        "schemaVersion": enrollment["schemaVersion"],
        "kind": enrollment["kind"],
        **_proof_payload(enrollment),
        "proofOfPossessionBase64": enrollment["proofOfPossessionBase64"],
    }
    digest = hashlib.sha256(_canonical_json_bytes(controlled)).hexdigest().upper()
    return f"RKE-{digest[:20]}"


def build_receiver_key_enrollment(
    private_key: Ed25519PrivateKey,
    organization: str,
    display_name: str,
    *,
    replaces_key_id: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    raw_public_key = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    key_id = receiver_identity_key_id(raw_public_key)
    replacement = str(replaces_key_id or "").strip() or None
    if replacement is not None and not _KEY_ID_PATTERN.fullmatch(replacement):
        raise ValueError("輪替舊金鑰 ID 必須是 RVK- 加 20 個大寫十六進位字元。")
    if replacement == key_id:
        raise ValueError("新金鑰不得宣告取代自己。")
    normalized_organization = _normalized_text(organization, "organization")
    normalized_display_name = _normalized_text(display_name, "displayName")
    normalized_created_at = _parse_created_at(
        created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )
    enrollment: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_KEY_ENROLLMENT_KIND,
        "algorithm": "Ed25519",
        "createdAt": normalized_created_at,
        "organization": normalized_organization,
        "displayName": normalized_display_name,
        "keyId": key_id,
        "publicKeyBase64": base64.b64encode(raw_public_key).decode("ascii"),
        "replacesKeyId": replacement,
    }
    enrollment["proofOfPossessionBase64"] = base64.b64encode(
        private_key.sign(_canonical_json_bytes(_proof_payload(enrollment)))
    ).decode("ascii")
    enrollment["packageFingerprint"] = _package_fingerprint(enrollment)
    return validate_receiver_key_enrollment(enrollment)


def validate_receiver_key_enrollment(enrollment: Any) -> dict[str, Any]:
    if not isinstance(enrollment, dict):
        raise ValueError("RKE 公鑰登錄包格式不正確。")
    if enrollment.get("schemaVersion") != 1 or enrollment.get("kind") != RECEIVER_KEY_ENROLLMENT_KIND:
        raise ValueError("RKE 公鑰登錄包版本或種類不受支援。")
    if enrollment.get("algorithm") != "Ed25519":
        raise ValueError("RKE 公鑰登錄包的演算法必須是 Ed25519。")

    organization = _normalized_text(enrollment.get("organization"), "organization")
    display_name = _normalized_text(enrollment.get("displayName"), "displayName")
    created_at = _parse_created_at(enrollment.get("createdAt"))
    key_id = _normalized_text(enrollment.get("keyId"), "keyId", 24)
    if not _KEY_ID_PATTERN.fullmatch(key_id):
        raise ValueError("RKE 公鑰登錄包的 keyId 格式不正確。")
    replacement = enrollment.get("replacesKeyId")
    if replacement is not None:
        replacement = str(replacement).strip()
        if not _KEY_ID_PATTERN.fullmatch(replacement):
            raise ValueError("RKE 公鑰登錄包的 replacesKeyId 格式不正確。")
        if replacement == key_id:
            raise ValueError("RKE 公鑰登錄包的新金鑰不得取代自己。")

    try:
        public_key_bytes = base64.b64decode(str(enrollment.get("publicKeyBase64", "")), validate=True)
        public_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
    except (ValueError, TypeError) as exc:
        raise ValueError("RKE 公鑰登錄包的公開金鑰不是 32-byte Ed25519 raw Base64。") from exc
    if receiver_identity_key_id(public_key_bytes) != key_id:
        raise ValueError("RKE 公鑰登錄包的 keyId 與公開金鑰不一致。")

    controlled = {
        "schemaVersion": 1,
        "kind": RECEIVER_KEY_ENROLLMENT_KIND,
        "algorithm": "Ed25519",
        "createdAt": created_at,
        "organization": organization,
        "displayName": display_name,
        "keyId": key_id,
        "publicKeyBase64": base64.b64encode(public_key_bytes).decode("ascii"),
        "replacesKeyId": replacement,
        "proofOfPossessionBase64": str(enrollment.get("proofOfPossessionBase64", "")),
        "packageFingerprint": str(enrollment.get("packageFingerprint", "")),
    }
    try:
        proof = base64.b64decode(controlled["proofOfPossessionBase64"], validate=True)
        if len(proof) != 64:
            raise ValueError
        public_key.verify(proof, _canonical_json_bytes(_proof_payload(controlled)))
    except (ValueError, TypeError, InvalidSignature) as exc:
        raise ValueError("RKE 公鑰登錄包的私鑰持有證明驗證失敗。") from exc

    fingerprint = controlled["packageFingerprint"]
    if not _PACKAGE_FINGERPRINT_PATTERN.fullmatch(fingerprint):
        raise ValueError("RKE 公鑰登錄包指紋格式不正確。")
    expected = _package_fingerprint(controlled)
    if not hmac.compare_digest(fingerprint, expected):
        raise ValueError("RKE 公鑰登錄包內容與包指紋不一致。")
    return deepcopy(controlled)


__all__ = [
    "RECEIVER_KEY_ENROLLMENT_CONTEXT",
    "RECEIVER_KEY_ENROLLMENT_KIND",
    "build_receiver_key_enrollment",
    "validate_receiver_key_enrollment",
]
