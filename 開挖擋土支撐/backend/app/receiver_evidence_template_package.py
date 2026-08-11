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
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .removal_transfer_handoff import receiver_identity_key_id


RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND = "receiver-supplemental-evidence-template-library"
RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_PACKAGE_KIND = "receiver-evidence-template-publisher-package"
RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_CONTEXT = "receiver-evidence-template-publisher-package-v1"
SUPPORTED_LIBRARY_SCHEMA_VERSIONS = {2, 3}
MAX_TEMPLATE_COUNT = 100

_LIBRARY_FINGERPRINT_PATTERN = re.compile(r"^ETL-[0-9A-F]{20}$")
_PACKAGE_FINGERPRINT_PATTERN = re.compile(r"^ETP-[0-9A-F]{20}$")
_KEY_ID_PATTERN = re.compile(r"^RVK-[0-9A-F]{20}$")


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _required_text(value: Any, label: str, maximum: int = 200) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"範本發布封包缺少 {label}。")
    if len(text) > maximum:
        raise ValueError(f"範本發布封包的 {label} 過長。")
    return text


def _iso_datetime(value: Any, label: str) -> str:
    text = _required_text(value, label, 64)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"範本發布封包的 {label} 不是有效 ISO 8601 時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"範本發布封包的 {label} 必須包含時區。")
    return text


def _assert_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    unexpected = set(value) - expected
    missing = expected - set(value)
    if unexpected:
        raise ValueError(f"{label}含有不允許的欄位：{'、'.join(sorted(unexpected))}。")
    if missing:
        raise ValueError(f"{label}缺少必要欄位：{'、'.join(sorted(missing))}。")


def _reject_embedded_evidence_identifiers(value: Any) -> None:
    if isinstance(value, dict):
        forbidden = {"fileName", "fileSha256"} & set(value)
        if forbidden:
            raise ValueError("範本發布封包不得包含證據檔名或 SHA-256。")
        for item in value.values():
            _reject_embedded_evidence_identifiers(item)
    elif isinstance(value, list):
        for item in value:
            _reject_embedded_evidence_identifiers(item)


def validate_receiver_evidence_template_library_envelope(library: Any) -> dict[str, Any]:
    if not isinstance(library, dict):
        raise ValueError("範本發布封包內的範本庫格式不正確。")
    _assert_exact_keys(
        library,
        {"schemaVersion", "kind", "exportedAt", "boundary", "templates"},
        "範本庫",
    )
    schema_version = library.get("schemaVersion")
    if isinstance(schema_version, bool) or schema_version not in SUPPORTED_LIBRARY_SCHEMA_VERSIONS:
        raise ValueError("範本發布封包只支援範本庫 schema v2 或 v3。")
    if library.get("kind") != RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND:
        raise ValueError("範本發布封包內的範本庫種類不受支援。")
    _iso_datetime(library.get("exportedAt"), "範本庫匯出時間")
    boundary = library.get("boundary")
    if not isinstance(boundary, dict):
        raise ValueError("範本發布封包內的範本庫缺少責任邊界。")
    required_boundary = {
        "descriptiveFieldsOnly",
        "evidenceFileNameExcluded",
        "evidenceFileSha256Excluded",
        "actualEvidenceFileRequiredAfterApply",
        "governanceRequiredBeforeApply",
        "importedApprovalRequiresLocalReview",
    }
    if schema_version >= 3:
        required_boundary |= {
            "publisherProvenanceIsInformational",
            "localApprovalStillRequiredAfterImport",
        }
    if any(boundary.get(key) is not True for key in required_boundary):
        raise ValueError("範本發布封包內的範本庫未完整聲明治理、證據排除與本機重審邊界。")
    if set(boundary) != required_boundary:
        raise ValueError("範本發布封包內的範本庫責任邊界含有不受支援的欄位。")
    templates = library.get("templates")
    if not isinstance(templates, list) or not templates:
        raise ValueError("範本發布封包至少必須包含一筆範本。")
    if len(templates) > MAX_TEMPLATE_COUNT:
        raise ValueError(f"範本發布封包最多包含 {MAX_TEMPLATE_COUNT} 筆範本。")
    template_ids: list[str] = []
    for index, template in enumerate(templates, start=1):
        if not isinstance(template, dict):
            raise ValueError(f"範本發布封包的第 {index} 筆範本格式不正確。")
        template_ids.append(_required_text(template.get("templateId"), f"第 {index} 筆範本識別碼", 200))
    if len(set(template_ids)) != len(template_ids):
        raise ValueError("範本發布封包包含重複的範本識別碼。")
    _reject_embedded_evidence_identifiers(templates)
    return deepcopy(library)


def receiver_evidence_template_library_fingerprint(library: Any) -> str:
    validated = validate_receiver_evidence_template_library_envelope(library)
    digest = hashlib.sha256(_canonical_json_bytes(validated)).hexdigest().upper()
    return f"ETL-{digest[:20]}"


def _publisher_signing_payload(
    *,
    library_fingerprint: str,
    organization: str,
    display_name: str,
    key_id: str,
    signed_at: str,
) -> bytes:
    return _canonical_json_bytes({
        "context": RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_CONTEXT,
        "displayName": display_name,
        "keyId": key_id,
        "libraryFingerprint": library_fingerprint,
        "organization": organization,
        "signedAt": signed_at,
    })


def _package_fingerprint(package: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in package.items() if key != "packageFingerprint"}
    digest = hashlib.sha256(_canonical_json_bytes(unsigned)).hexdigest().upper()
    return f"ETP-{digest[:20]}"


def build_receiver_evidence_template_publisher_package(
    library: Any,
    private_key: Ed25519PrivateKey,
    organization: str,
    display_name: str,
    *,
    signed_at: str | None = None,
) -> dict[str, Any]:
    validated_library = validate_receiver_evidence_template_library_envelope(library)
    normalized_organization = _required_text(organization, "發布單位")
    normalized_display_name = _required_text(display_name, "發布金鑰名稱")
    normalized_signed_at = _iso_datetime(
        signed_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "簽章時間",
    )
    public_key_bytes = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    key_id = receiver_identity_key_id(public_key_bytes)
    library_fingerprint = receiver_evidence_template_library_fingerprint(validated_library)
    signature = private_key.sign(_publisher_signing_payload(
        library_fingerprint=library_fingerprint,
        organization=normalized_organization,
        display_name=normalized_display_name,
        key_id=key_id,
        signed_at=normalized_signed_at,
    ))
    package: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_PACKAGE_KIND,
        "libraryFingerprint": library_fingerprint,
        "library": validated_library,
        "publisherSignature": {
            "schemaVersion": 1,
            "algorithm": "Ed25519",
            "organization": normalized_organization,
            "displayName": normalized_display_name,
            "keyId": key_id,
            "publicKeyBase64": base64.b64encode(public_key_bytes).decode("ascii"),
            "signedAt": normalized_signed_at,
            "signatureBase64": base64.b64encode(signature).decode("ascii"),
        },
    }
    package["packageFingerprint"] = _package_fingerprint(package)
    return validate_receiver_evidence_template_publisher_package(package)["package"]


def validate_receiver_evidence_template_publisher_package(
    package: Any,
    trusted_keys: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    if not isinstance(package, dict):
        raise ValueError("範本發布封包格式不正確。")
    _assert_exact_keys(
        package,
        {
            "schemaVersion",
            "kind",
            "libraryFingerprint",
            "library",
            "publisherSignature",
            "packageFingerprint",
        },
        "範本發布封包",
    )
    if package.get("schemaVersion") != 1 or package.get("kind") != RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_PACKAGE_KIND:
        raise ValueError("範本發布封包版本或種類不受支援。")
    library = validate_receiver_evidence_template_library_envelope(package.get("library"))
    library_fingerprint = str(package.get("libraryFingerprint", ""))
    expected_library_fingerprint = receiver_evidence_template_library_fingerprint(library)
    if not _LIBRARY_FINGERPRINT_PATTERN.fullmatch(library_fingerprint) or not hmac.compare_digest(
        library_fingerprint,
        expected_library_fingerprint,
    ):
        raise ValueError("範本發布封包的範本庫內容與範本庫指紋不一致。")

    signature = package.get("publisherSignature")
    if not isinstance(signature, dict):
        raise ValueError("範本發布封包缺少發布者簽章。")
    _assert_exact_keys(
        signature,
        {
            "schemaVersion",
            "algorithm",
            "organization",
            "displayName",
            "keyId",
            "publicKeyBase64",
            "signedAt",
            "signatureBase64",
        },
        "範本發布者簽章",
    )
    if signature.get("schemaVersion") != 1 or signature.get("algorithm") != "Ed25519":
        raise ValueError("範本發布者簽章版本或演算法不受支援。")
    organization = _required_text(signature.get("organization"), "發布單位")
    display_name = _required_text(signature.get("displayName"), "發布金鑰名稱")
    signed_at = _iso_datetime(signature.get("signedAt"), "簽章時間")
    key_id = _required_text(signature.get("keyId"), "Key ID", 24)
    if not _KEY_ID_PATTERN.fullmatch(key_id):
        raise ValueError("範本發布者簽章的 Key ID 格式不正確。")
    try:
        public_key_bytes = base64.b64decode(str(signature.get("publicKeyBase64", "")), validate=True)
        signature_bytes = base64.b64decode(str(signature.get("signatureBase64", "")), validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise ValueError("範本發布者簽章的公鑰或簽章值不是有效 Base64。") from exc
    if len(public_key_bytes) != 32 or len(signature_bytes) != 64:
        raise ValueError("範本發布者簽章的 Ed25519 公鑰或簽章長度不正確。")
    if not hmac.compare_digest(key_id, receiver_identity_key_id(public_key_bytes)):
        raise ValueError("範本發布者簽章的 Key ID 與實際公鑰不一致。")
    try:
        Ed25519PublicKey.from_public_bytes(public_key_bytes).verify(
            signature_bytes,
            _publisher_signing_payload(
                library_fingerprint=library_fingerprint,
                organization=organization,
                display_name=display_name,
                key_id=key_id,
                signed_at=signed_at,
            ),
        )
    except InvalidSignature as exc:
        raise ValueError("範本發布者數位簽章驗證失敗，內容或簽章資料可能已變更。") from exc

    normalized_package = {
        "schemaVersion": 1,
        "kind": RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_PACKAGE_KIND,
        "libraryFingerprint": library_fingerprint,
        "library": library,
        "publisherSignature": {
            "schemaVersion": 1,
            "algorithm": "Ed25519",
            "organization": organization,
            "displayName": display_name,
            "keyId": key_id,
            "publicKeyBase64": base64.b64encode(public_key_bytes).decode("ascii"),
            "signedAt": signed_at,
            "signatureBase64": base64.b64encode(signature_bytes).decode("ascii"),
        },
        "packageFingerprint": str(package.get("packageFingerprint", "")),
    }
    package_fingerprint = normalized_package["packageFingerprint"]
    if not _PACKAGE_FINGERPRINT_PATTERN.fullmatch(package_fingerprint) or not hmac.compare_digest(
        package_fingerprint,
        _package_fingerprint(normalized_package),
    ):
        raise ValueError("範本發布封包內容與封包指紋不一致。")

    trusted_key = next((item for item in trusted_keys if item.get("keyId") == key_id), None)
    verification: dict[str, Any] = {
        "signaturePresent": True,
        "cryptographicValid": True,
        "trusted": False,
        "keyId": key_id,
        "signedAt": signed_at,
        "organization": organization,
        "displayName": display_name,
        "libraryFingerprint": library_fingerprint,
        "packageFingerprint": package_fingerprint,
    }
    if trusted_key is None:
        verification.update({
            "status": "valid-signature-untrusted-key",
            "message": "範本發布簽章有效，但此公鑰尚未列入本機信任清冊；匯入後仍須本機人工核准。",
        })
    elif trusted_key.get("status") != "trusted":
        verification.update({
            "status": "valid-signature-revoked-key",
            "message": "範本發布簽章有效，但此公鑰已撤銷；不得視為受信任來源，匯入後仍須本機人工核准。",
        })
    elif not hmac.compare_digest(
        str(trusted_key.get("organization", "")).strip().encode("utf-8"),
        organization.encode("utf-8"),
    ):
        verification.update({
            "status": "valid-signature-organization-mismatch",
            "message": "範本發布簽章有效，但發布單位與本機信任清冊登錄單位不一致。",
        })
    else:
        verification.update({
            "status": "trusted-signature-valid",
            "trusted": True,
            "trustedOrganization": trusted_key.get("organization"),
            "keyLabel": trusted_key.get("displayName"),
            "message": "範本發布封包完整，且發布單位的受信任 Ed25519 簽章驗證通過；範本仍須本機人工核准。",
        })
    return {"package": deepcopy(normalized_package), "publisherVerification": verification}


__all__ = [
    "RECEIVER_EVIDENCE_TEMPLATE_LIBRARY_KIND",
    "RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_CONTEXT",
    "RECEIVER_EVIDENCE_TEMPLATE_PUBLISHER_PACKAGE_KIND",
    "build_receiver_evidence_template_publisher_package",
    "receiver_evidence_template_library_fingerprint",
    "validate_receiver_evidence_template_library_envelope",
    "validate_receiver_evidence_template_publisher_package",
]
