from __future__ import annotations

import argparse
import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from typing import Any
import unicodedata
import zipfile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .receiver_governance_archive import (
    IMMUTABILITY_MODES,
    LEGAL_HOLD_STATUSES,
    MAX_ARCHIVE_BYTES,
    _identifier,
    _json_from_bytes,
    _load_private_key,
    _load_public_key_bytes,
    _provider_key_id,
    _public_key_pem,
    _read_source_directory,
    _reject_private_key_material,
    _text,
    _utc_datetime,
    _validate_approval_evidence,
    validate_archive_provider_receipt,
    validate_archive_request,
    verify_archive_verification_package,
)
from .receiver_governance_timestamp import (
    MAX_BINARY_BYTES,
    MAX_JSON_BYTES,
    _assert_closed_directory,
    _canonical_json_bytes,
    _copy_exclusive,
    _iso,
    _now_iso,
    _read_bytes,
    _safe_file_name,
    _summary,
    _validate_summary,
    find_openssl,
)


STATUS_KIND = "governance-trusted-timestamp-external-archive-lifecycle-provider-status"
STATUS_CONTEXT = "governance-trusted-timestamp-external-archive-lifecycle-provider-status-v1"
CHECKPOINT_KIND = "governance-trusted-timestamp-external-archive-lifecycle-checkpoint"
CHECKPOINT_CONTEXT = "governance-trusted-timestamp-external-archive-lifecycle-checkpoint-v1"
GAV_PACKAGE_MEDIA_TYPE = "application/zip"
GAV_PACKAGE_PROFILE = "closed-flat-zip-stored-gav-v1"
OBJECT_STATUSES = {"present", "missing", "inaccessible"}
CONTENT_HASH_STATUSES = {"matched", "mismatched", "not-verified"}
IMMUTABILITY_STATUSES = {"active", "not-active", "unknown"}
MAX_GAV_PACKAGE_BYTES = MAX_ARCHIVE_BYTES + 20_000_000
MAX_GAV_FILES = 16
MAX_REVIEW_INTERVAL_DAYS = 366
MAX_OBSERVATION_AGE_HOURS = 24 * 31
MAX_RETENTION_WARNING_DAYS = 3660
LIFECYCLE_BOUNDARY = {
    "providerStatusRequiresActualRepositoryObservation": True,
    "providerSignedStatusIsAttestationNotIndependentObservation": True,
    "checkpointDoesNotQueryExternalRepository": True,
    "checkpointDoesNotProveProviderOperationalControls": True,
    "standaloneCheckpointJsonIsNotCompleteEvidence": True,
    "packageVerificationRequiredForGovernedCurrentAssessment": True,
    "historicalIntegrityRemainsVerifiableAfterReviewDue": True,
    "reviewDueDoesNotInvalidateHistoricalSignatureEvidence": True,
    "providerPublicKeyWasExplicitlySelected": True,
    "providerKeyRotationRequiresNewIndependentApprovalEvidence": True,
    "providerKeyApprovalEvidenceContentIsNotInterpreted": True,
    "noPrivateKeyCredentialInputsAcceptedByFinalizeOrVerify": True,
    "recognizablePrivateKeyFilesAndPemMaterialRejected": True,
    "doesNotConstituteEngineeringApproval": True,
    "formalCalculationAttachment": False,
}


def _fingerprint(prefix: str, record: dict[str, Any], field: str) -> str:
    payload = {key: value for key, value in record.items() if key != field}
    return f"{prefix}-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def _status_fingerprint_payload(record: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(record)
    payload.pop("statusFingerprint", None)
    signature = payload.get("signature")
    if isinstance(signature, dict):
        signature.pop("value", None)
    return payload


def lifecycle_status_fingerprint(record: dict[str, Any]) -> str:
    return "GSR-" + hashlib.sha256(_canonical_json_bytes(_status_fingerprint_payload(record))).hexdigest()[:20].upper()


def _status_signature_payload(record: dict[str, Any]) -> bytes:
    payload = deepcopy(record)
    signature = payload.get("signature")
    if not isinstance(signature, dict):
        raise ValueError("GSR 缺少簽章欄位。")
    signature.pop("value", None)
    return _canonical_json_bytes(payload)


def lifecycle_checkpoint_fingerprint(record: dict[str, Any]) -> str:
    return _fingerprint("GSC", record, "checkpointFingerprint")


def _load_request_and_receipt(request_path: Path, receipt_path: Path) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    request_raw = _read_bytes(request_path, max_bytes=MAX_JSON_BYTES, label="GAD")
    receipt_raw = _read_bytes(receipt_path, max_bytes=MAX_JSON_BYTES, label="GAR")
    request = validate_archive_request(_json_from_bytes(request_raw, "GAD"))
    receipt = validate_archive_provider_receipt(_json_from_bytes(receipt_raw, "GAR"))
    if (
        receipt["requestFingerprint"] != request["requestFingerprint"]
        or receipt["requestId"] != request["requestId"]
        or receipt["archiveObject"] != request["archiveObject"]
    ):
        raise ValueError("GSR 來源 GAD 與 GAR 不一致。")
    return request, receipt, request_raw, receipt_raw


def build_lifecycle_provider_status(
    *,
    request: dict[str, Any],
    provider_receipt: dict[str, Any],
    private_key: Ed25519PrivateKey,
    observed_at: str,
    object_status: str,
    content_hash_status: str,
    observed_object_sha256: str | None,
    observed_object_size_bytes: int | None,
    immutability_status: str,
    immutability_mode: str,
    retention_policy_id: str,
    retention_until: str,
    legal_hold_status: str,
    observation_method: str,
    observation_reference: str,
    signed_at: str | None = None,
) -> dict[str, Any]:
    request = validate_archive_request(request)
    provider_receipt = validate_archive_provider_receipt(provider_receipt)
    if (
        provider_receipt["requestFingerprint"] != request["requestFingerprint"]
        or provider_receipt["requestId"] != request["requestId"]
        or provider_receipt["archiveObject"] != request["archiveObject"]
    ):
        raise ValueError("GSR 來源 GAD 與 GAR 不一致。")
    if object_status not in OBJECT_STATUSES or content_hash_status not in CONTENT_HASH_STATUSES:
        raise ValueError("GSR 物件或內容雜湊狀態不受支援。")
    if immutability_status not in IMMUTABILITY_STATUSES or immutability_mode not in IMMUTABILITY_MODES:
        raise ValueError("GSR 不可變保存狀態不受支援。")
    if legal_hold_status not in LEGAL_HOLD_STATUSES:
        raise ValueError("GSR legal hold 狀態不受支援。")
    observed = _iso(observed_at, "GSR 觀察時間")
    signed = _iso(signed_at or _now_iso(), "GSR 簽發時間")
    retention = _iso(retention_until, "GSR 保留期限")
    if _utc_datetime(signed, "GSR 簽發時間") < _utc_datetime(observed, "GSR 觀察時間"):
        raise ValueError("GSR 簽發時間不得早於保存狀態觀察時間。")
    if _utc_datetime(observed, "GSR 觀察時間") < _utc_datetime(provider_receipt["signature"]["signedAt"], "GAR 簽發時間"):
        raise ValueError("GSR 觀察時間不得早於原 GAR 簽發時間。")
    observed_object: dict[str, Any] | None
    if object_status == "present":
        digest = str(observed_object_sha256 or "")
        size = observed_object_size_bytes
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            raise ValueError("GSR present 物件必須提供實際觀察的 SHA-256 與正整數 bytes。")
        observed_object = {"fileSha256": digest, "fileSizeBytes": size}
        if content_hash_status == "not-verified":
            raise ValueError("GSR present 物件不得把內容雜湊標為未驗證。")
        expected = request["archiveObject"]
        matches = digest == expected["fileSha256"] and size == expected["fileSizeBytes"]
        if (content_hash_status == "matched") != matches:
            raise ValueError("GSR 內容雜湊狀態與實際觀察摘要不一致。")
    else:
        if content_hash_status != "not-verified" or observed_object_sha256 is not None or observed_object_size_bytes is not None:
            raise ValueError("GSR 缺失或無法存取的物件不得夾帶內容摘要，且必須標為 not-verified。")
        observed_object = None
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": STATUS_KIND,
        "statusContext": STATUS_CONTEXT,
        "source": {
            "requestFingerprint": request["requestFingerprint"],
            "receiptFingerprint": provider_receipt["receiptFingerprint"],
            "archiveObject": request["archiveObject"],
        },
        "provider": provider_receipt["provider"],
        "observation": {
            "observedAt": observed,
            "objectStatus": object_status,
            "contentHashStatus": content_hash_status,
            "observedObject": observed_object,
            "immutabilityStatus": immutability_status,
            "immutabilityMode": immutability_mode,
            "retentionPolicyId": _identifier(retention_policy_id, "GSR 保存政策識別碼"),
            "retentionUntil": retention,
            "legalHoldStatus": legal_hold_status,
            "observationMethod": _identifier(observation_method, "GSR 觀察方法"),
            "observationReference": _identifier(observation_reference, "GSR 觀察紀錄識別碼"),
        },
        "signature": {
            "algorithm": "Ed25519",
            "keyId": _provider_key_id(private_key.public_key()),
            "signedAt": signed,
            "value": "",
        },
    }
    record["statusFingerprint"] = lifecycle_status_fingerprint(record)
    record["signature"]["value"] = base64.b64encode(private_key.sign(_status_signature_payload(record))).decode("ascii")
    return validate_lifecycle_provider_status(record)


def validate_lifecycle_provider_status(value: Any) -> dict[str, Any]:
    expected = {"schemaVersion", "kind", "statusContext", "source", "provider", "observation", "signature", "statusFingerprint"}
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GSR 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != STATUS_KIND or value.get("statusContext") != STATUS_CONTEXT:
        raise ValueError("GSR 版本、種類或內容脈絡不受支援。")
    source = value.get("source")
    if not isinstance(source, dict) or set(source) != {"requestFingerprint", "receiptFingerprint", "archiveObject"}:
        raise ValueError("GSR 缺少封閉的來源摘要。")
    if not re.fullmatch(r"GAD-[0-9A-F]{20}", str(source.get("requestFingerprint", ""))) or not re.fullmatch(r"GAR-[0-9A-F]{20}", str(source.get("receiptFingerprint", ""))):
        raise ValueError("GSR 來源指紋格式不正確。")
    archive_object = source.get("archiveObject")
    if not isinstance(archive_object, dict) or set(archive_object) != {"fileName", "fileSha256", "fileSizeBytes", "mediaType", "zipProfile"}:
        raise ValueError("GSR 封存物件摘要格式不正確。")
    normalized_object = {
        **_validate_summary({key: archive_object[key] for key in ("fileName", "fileSha256", "fileSizeBytes")}, "GSR archiveObject"),
        "mediaType": archive_object.get("mediaType"),
        "zipProfile": archive_object.get("zipProfile"),
    }
    if normalized_object["mediaType"] != "application/zip" or normalized_object["zipProfile"] != "closed-flat-zip-stored-v1":
        raise ValueError("GSR 封存物件格式不受支援。")
    provider = value.get("provider")
    if not isinstance(provider, dict) or set(provider) != {"organization", "repositoryId", "archiveObjectId", "versionId"}:
        raise ValueError("GSR 缺少封閉的保存端識別資料。")
    normalized_provider = {
        "organization": _text(provider.get("organization"), "GSR 保存端組織", maximum=200),
        "repositoryId": _identifier(provider.get("repositoryId"), "GSR 保存庫識別碼"),
        "archiveObjectId": _identifier(provider.get("archiveObjectId"), "GSR 物件識別碼"),
        "versionId": _identifier(provider.get("versionId"), "GSR 版本識別碼"),
    }
    observation = value.get("observation")
    observation_fields = {
        "observedAt", "objectStatus", "contentHashStatus", "observedObject",
        "immutabilityStatus", "immutabilityMode", "retentionPolicyId", "retentionUntil",
        "legalHoldStatus", "observationMethod", "observationReference",
    }
    if not isinstance(observation, dict) or set(observation) != observation_fields:
        raise ValueError("GSR 缺少封閉的保存狀態觀察資料。")
    object_status = observation.get("objectStatus")
    hash_status = observation.get("contentHashStatus")
    if object_status not in OBJECT_STATUSES or hash_status not in CONTENT_HASH_STATUSES:
        raise ValueError("GSR 物件或內容雜湊狀態不受支援。")
    observed_object = observation.get("observedObject")
    if object_status == "present":
        if not isinstance(observed_object, dict) or set(observed_object) != {"fileSha256", "fileSizeBytes"}:
            raise ValueError("GSR present 物件缺少觀察摘要。")
        digest = str(observed_object.get("fileSha256", ""))
        size = observed_object.get("fileSizeBytes")
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            raise ValueError("GSR 觀察物件摘要不正確。")
        matches = digest == normalized_object["fileSha256"] and size == normalized_object["fileSizeBytes"]
        if hash_status == "not-verified" or (hash_status == "matched") != matches:
            raise ValueError("GSR 內容雜湊狀態與觀察物件摘要不一致。")
        normalized_observed_object: dict[str, Any] | None = {"fileSha256": digest, "fileSizeBytes": size}
    else:
        if observed_object is not None or hash_status != "not-verified":
            raise ValueError("GSR 缺失或無法存取物件的摘要狀態不正確。")
        normalized_observed_object = None
    if observation.get("immutabilityStatus") not in IMMUTABILITY_STATUSES or observation.get("immutabilityMode") not in IMMUTABILITY_MODES or observation.get("legalHoldStatus") not in LEGAL_HOLD_STATUSES:
        raise ValueError("GSR 不可變保存或 legal hold 狀態不受支援。")
    normalized_observation = {
        **observation,
        "observedAt": _iso(observation.get("observedAt"), "GSR 觀察時間"),
        "observedObject": normalized_observed_object,
        "retentionPolicyId": _identifier(observation.get("retentionPolicyId"), "GSR 保存政策識別碼"),
        "retentionUntil": _iso(observation.get("retentionUntil"), "GSR 保留期限"),
        "observationMethod": _identifier(observation.get("observationMethod"), "GSR 觀察方法"),
        "observationReference": _identifier(observation.get("observationReference"), "GSR 觀察紀錄識別碼"),
    }
    signature = value.get("signature")
    if not isinstance(signature, dict) or set(signature) != {"algorithm", "keyId", "signedAt", "value"}:
        raise ValueError("GSR 缺少封閉的 Ed25519 簽章。")
    signed_at = _iso(signature.get("signedAt"), "GSR 簽發時間")
    try:
        signature_raw = base64.b64decode(str(signature.get("value", "")), validate=True)
    except ValueError as exc:
        raise ValueError("GSR 簽章不是有效 Base64。") from exc
    if signature.get("algorithm") != "Ed25519" or not re.fullmatch(r"AKI-[0-9A-F]{20}", str(signature.get("keyId", ""))) or len(signature_raw) != 64:
        raise ValueError("GSR Ed25519 簽章欄位不完整。")
    if _utc_datetime(signed_at, "GSR 簽發時間") < _utc_datetime(normalized_observation["observedAt"], "GSR 觀察時間"):
        raise ValueError("GSR 簽發時間不得早於保存狀態觀察時間。")
    fingerprint = str(value.get("statusFingerprint", ""))
    if not re.fullmatch(r"GSR-[0-9A-F]{20}", fingerprint) or fingerprint != lifecycle_status_fingerprint(value):
        raise ValueError("GSR 指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["source"]["archiveObject"] = normalized_object
    normalized["provider"] = normalized_provider
    normalized["observation"] = normalized_observation
    normalized["signature"]["signedAt"] = signed_at
    return normalized


def verify_lifecycle_provider_signature(status: dict[str, Any], public_key: Ed25519PublicKey) -> dict[str, Any]:
    validated = validate_lifecycle_provider_status(status)
    if validated["signature"]["keyId"] != _provider_key_id(public_key):
        raise ValueError("GSR keyId 與明確選取的保存端公開金鑰不一致。")
    try:
        public_key.verify(base64.b64decode(validated["signature"]["value"], validate=True), _status_signature_payload(validated))
    except (InvalidSignature, ValueError) as exc:
        raise ValueError("GSR 保存端 Ed25519 簽章驗證失敗。") from exc
    return validated


def issue_lifecycle_provider_status(
    *,
    archive_request_path: Path,
    provider_receipt_path: Path,
    private_key_path: Path,
    observed_at: str,
    object_status: str,
    content_hash_status: str,
    observed_object_sha256: str | None,
    observed_object_size_bytes: int | None,
    immutability_status: str,
    immutability_mode: str,
    retention_policy_id: str,
    retention_until: str,
    legal_hold_status: str,
    observation_method: str,
    observation_reference: str,
    output_directory: Path | None = None,
    signed_at: str | None = None,
    private_key_password_env: str | None = None,
) -> dict[str, Any]:
    request, receipt, _, _ = _load_request_and_receipt(archive_request_path, provider_receipt_path)
    private_key = _load_private_key(private_key_path, private_key_password_env)
    status = build_lifecycle_provider_status(
        request=request,
        provider_receipt=receipt,
        private_key=private_key,
        observed_at=observed_at,
        object_status=object_status,
        content_hash_status=content_hash_status,
        observed_object_sha256=observed_object_sha256,
        observed_object_size_bytes=observed_object_size_bytes,
        immutability_status=immutability_status,
        immutability_mode=immutability_mode,
        retention_policy_id=retention_policy_id,
        retention_until=retention_until,
        legal_hold_status=legal_hold_status,
        observation_method=observation_method,
        observation_reference=observation_reference,
        signed_at=signed_at,
    )
    destination = output_directory or provider_receipt_path.parent / f"GSR-外部歸檔週期狀態收據包-{status['statusFingerprint']}"
    if destination.exists():
        raise ValueError("GSR 輸出目錄已存在；本工具不會覆寫。")
    status_name = f"GSR-外部歸檔週期狀態-{status['statusFingerprint']}.json"
    public_name = f"GSR-provider-public-key-{status['signature']['keyId']}.pem"
    destination.mkdir(parents=False, exist_ok=False)
    try:
        _copy_exclusive((json.dumps(status, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / status_name)
        _copy_exclusive(_public_key_pem(private_key.public_key()), destination / public_name)
        _assert_closed_directory(destination, {status_name.casefold(), public_name.casefold()}, "GSR 收據包")
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "statusReceiptPath": str((destination / status_name).resolve()),
        "providerPublicKeyPath": str((destination / public_name).resolve()),
        "statusFingerprint": status["statusFingerprint"],
        "providerKeyId": status["signature"]["keyId"],
    }


def _build_gav_zip(raw_files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for name in sorted(raw_files, key=lambda item: unicodedata.normalize("NFC", item).casefold()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 0
            info.external_attr = 0
            archive.writestr(info, raw_files[name])
    raw = output.getvalue()
    if not raw or len(raw) > MAX_GAV_PACKAGE_BYTES:
        raise ValueError("GSC 內 GAV 封裝大小超過限制。")
    return raw


def _read_gav_zip(raw: bytes) -> dict[str, bytes]:
    if not raw or len(raw) > MAX_GAV_PACKAGE_BYTES or not raw.startswith(b"PK\x03\x04") or b"PK\x06\x06" in raw or b"PK\x06\x07" in raw:
        raise ValueError("GSC 內 GAV 必須是無前置資料且不使用 Zip64 的標準 ZIP。")
    eocd = raw.rfind(b"PK\x05\x06")
    if eocd < 0 or eocd + 22 > len(raw) or int.from_bytes(raw[eocd + 20:eocd + 22], "little") != 0 or eocd + 22 != len(raw):
        raise ValueError("GSC 內 GAV 不得包含 ZIP comment 或尾隨資料。")
    raw_files: dict[str, bytes] = {}
    portable_names: set[str] = set()
    try:
        with zipfile.ZipFile(io.BytesIO(raw), "r") as archive:
            infos = archive.infolist()
            if archive.comment or not infos or len(infos) > MAX_GAV_FILES:
                raise ValueError("GSC 內 GAV 檔案數或 ZIP comment 不符合封閉規則。")
            total = 0
            for info in infos:
                name = _safe_file_name(info.filename, "GSC 內 GAV")
                portable = unicodedata.normalize("NFC", name).casefold()
                unix_mode = (info.external_attr >> 16) & 0xFFFF
                if (
                    info.is_dir() or "/" in info.filename or "\\" in info.filename or portable in portable_names
                    or info.flag_bits & 0x1 or info.flag_bits & ~0x800 or info.compress_type != zipfile.ZIP_STORED
                    or info.file_size != info.compress_size or (unix_mode & 0o170000) == 0o120000
                    or info.file_size <= 0 or info.file_size > MAX_ARCHIVE_BYTES
                ):
                    raise ValueError("GSC 內 GAV 必須是未加密、未壓縮、無連結且無重複檔名的封閉平面 ZIP。")
                portable_names.add(portable)
                total += info.file_size
                if total > MAX_GAV_PACKAGE_BYTES:
                    raise ValueError("GSC 內 GAV 解封後總大小超過限制。")
                extracted = archive.read(info)
                if len(extracted) != info.file_size:
                    raise ValueError("GSC 內 GAV ZIP 檔案大小不一致。")
                raw_files[name] = extracted
    except zipfile.BadZipFile as exc:
        raise ValueError("GSC 內 GAV 不是有效 ZIP。") from exc
    return raw_files


def _verify_packaged_gav(raw: bytes, openssl_path: Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    raw_files = _read_gav_zip(raw)
    with tempfile.TemporaryDirectory(prefix="gsc-gav-") as directory:
        root = Path(directory)
        for name, content in raw_files.items():
            _copy_exclusive(content, root / name)
        verification = verify_archive_verification_package(root, openssl_path=openssl_path)
    return verification, raw_files


def _gav_request(raw_files: dict[str, bytes], verification: dict[str, Any]) -> dict[str, Any]:
    request_name = verification["sourceFiles"]["request"]["fileName"]
    if request_name not in raw_files:
        raise ValueError("GSC 內 GAV 缺少 GAD。")
    return validate_archive_request(_json_from_bytes(raw_files[request_name], "GSC 內 GAD"))


def _validate_positive_status(request: dict[str, Any], gav: dict[str, Any], status: dict[str, Any]) -> None:
    expected_provider = {
        "organization": gav["archive"]["providerOrganization"],
        "repositoryId": gav["archive"]["repositoryId"],
        "archiveObjectId": gav["archive"]["archiveObjectId"],
        "versionId": gav["archive"]["versionId"],
    }
    if status["source"] != {
        "requestFingerprint": gav["archive"]["requestFingerprint"],
        "receiptFingerprint": gav["archive"]["receiptFingerprint"],
        "archiveObject": request["archiveObject"],
    } or status["provider"] != expected_provider:
        raise ValueError("GSR 未綁定同一份 GAV、GAD、GAR 或外部物件。")
    observation = status["observation"]
    if observation["objectStatus"] != "present" or observation["contentHashStatus"] != "matched":
        raise ValueError("GSR 未證明同一外部物件仍存在且內容 SHA-256 相符。")
    if observation["immutabilityStatus"] != "active" or observation["immutabilityMode"] != gav["archive"]["immutabilityMode"]:
        raise ValueError("GSR 未證明原不可變保存模式仍為 active。")
    if observation["retentionPolicyId"] != gav["archive"]["retentionPolicyId"]:
        raise ValueError("GSR 保存政策 ID 與原 GAV 不一致。")
    if _utc_datetime(observation["retentionUntil"], "GSR 保留期限") < _utc_datetime(gav["archive"]["retentionUntil"], "GAV 保留期限"):
        raise ValueError("GSR 保留期限短於原 GAV。")
    if request["requirements"]["legalHoldRequired"] and observation["legalHoldStatus"] != "active":
        raise ValueError("原 GAD 要求 legal hold，但 GSR 未證明仍為 active。")
    if _utc_datetime(observation["observedAt"], "GSR 觀察時間") < _utc_datetime(gav["verifiedAt"], "GAV 驗證時間"):
        raise ValueError("GSR 觀察時間早於原 GAV 驗證時間。")


def build_lifecycle_checkpoint(
    *,
    gav: dict[str, Any],
    request: dict[str, Any],
    status: dict[str, Any],
    source_files: dict[str, dict[str, Any]],
    provider_key_approval_basis: str,
    review_interval_days: int,
    maximum_observation_age_hours: int,
    retention_warning_days: int,
    verified_at: str,
) -> dict[str, Any]:
    expected_sources = {"gavPackage", "providerStatusReceipt", "providerPublicKey", "providerKeyApprovalEvidence"}
    if set(source_files) != expected_sources:
        raise ValueError("GSC 來源檔集合不完整。")
    normalized_sources = {key: _validate_summary(item, f"GSC {key}") for key, item in source_files.items()}
    names = [unicodedata.normalize("NFC", item["fileName"]).casefold() for item in normalized_sources.values()]
    if len(names) != len(set(names)):
        raise ValueError("GSC 來源檔名衝突。")
    if not isinstance(review_interval_days, int) or isinstance(review_interval_days, bool) or not 1 <= review_interval_days <= MAX_REVIEW_INTERVAL_DAYS:
        raise ValueError("GSC review interval 必須為 1 至 366 天。")
    if not isinstance(maximum_observation_age_hours, int) or isinstance(maximum_observation_age_hours, bool) or not 1 <= maximum_observation_age_hours <= MAX_OBSERVATION_AGE_HOURS:
        raise ValueError("GSC observation age 上限必須為 1 至 744 小時。")
    if not isinstance(retention_warning_days, int) or isinstance(retention_warning_days, bool) or not 0 <= retention_warning_days <= MAX_RETENTION_WARNING_DAYS:
        raise ValueError("GSC retention warning 必須為 0 至 3660 天。")
    verified = _iso(verified_at, "GSC 驗證時間")
    observed_dt = _utc_datetime(status["observation"]["observedAt"], "GSR 觀察時間")
    verified_dt = _utc_datetime(verified, "GSC 驗證時間")
    signed_dt = _utc_datetime(status["signature"]["signedAt"], "GSR 簽發時間")
    if verified_dt < signed_dt:
        raise ValueError("GSC 驗證時間不得早於 GSR 簽發時間。")
    if verified_dt - observed_dt > timedelta(hours=maximum_observation_age_hours):
        raise ValueError("GSR 觀察時間已超過 GSC 允許的新鮮度上限。")
    next_due_dt = observed_dt + timedelta(days=review_interval_days)
    retention_dt = _utc_datetime(status["observation"]["retentionUntil"], "GSR 保留期限")
    if verified_dt >= next_due_dt:
        raise ValueError("GSR 在建立 GSC 時已超過下一次重驗期限。")
    if retention_dt <= next_due_dt:
        raise ValueError("GSR 保留期限不晚於下一次重驗期限；請先延長保留或縮短重驗週期。")
    legal_summary = "satisfied" if request["requirements"]["legalHoldRequired"] else "not-required"
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": CHECKPOINT_KIND,
        "checkpointContext": CHECKPOINT_CONTEXT,
        "verifiedAt": verified,
        "sourceFiles": normalized_sources,
        "source": {
            "gavVerificationFingerprint": gav["verificationFingerprint"],
            "requestFingerprint": gav["archive"]["requestFingerprint"],
            "receiptFingerprint": gav["archive"]["receiptFingerprint"],
            "statusFingerprint": status["statusFingerprint"],
            "archiveObject": request["archiveObject"],
        },
        "archive": {
            "providerOrganization": gav["archive"]["providerOrganization"],
            "repositoryId": gav["archive"]["repositoryId"],
            "archiveObjectId": gav["archive"]["archiveObjectId"],
            "versionId": gav["archive"]["versionId"],
            "initialStoredAt": gav["archive"]["storedAt"],
            "legalHoldRequired": request["requirements"]["legalHoldRequired"],
        },
        "observation": status["observation"],
        "policy": {
            "reviewIntervalDays": review_interval_days,
            "maximumObservationAgeHours": maximum_observation_age_hours,
            "retentionWarningDays": retention_warning_days,
            "nextReviewDueAt": next_due_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "summary": {
            "integrityStatus": "valid",
            "originalArchiveEvidenceStatus": "valid",
            "providerSignatureStatus": "valid-explicitly-selected-key",
            "objectStatus": "present-hash-matched",
            "immutabilityStatus": "active",
            "retentionStatus": "satisfied-through-next-review",
            "legalHoldStatus": legal_summary,
        },
        "providerKeyApprovalBasis": _text(provider_key_approval_basis, "GSC 保存端金鑰核定依據", maximum=500),
        "boundary": LIFECYCLE_BOUNDARY,
    }
    record["checkpointFingerprint"] = lifecycle_checkpoint_fingerprint(record)
    return validate_lifecycle_checkpoint(record)


def validate_lifecycle_checkpoint(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "checkpointContext", "verifiedAt", "sourceFiles", "source",
        "archive", "observation", "policy", "summary", "providerKeyApprovalBasis", "boundary", "checkpointFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GSC 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != CHECKPOINT_KIND or value.get("checkpointContext") != CHECKPOINT_CONTEXT:
        raise ValueError("GSC 版本、種類或內容脈絡不受支援。")
    verified = _iso(value.get("verifiedAt"), "GSC 驗證時間")
    files = value.get("sourceFiles")
    expected_files = {"gavPackage", "providerStatusReceipt", "providerPublicKey", "providerKeyApprovalEvidence"}
    if not isinstance(files, dict) or set(files) != expected_files:
        raise ValueError("GSC 缺少封閉的來源檔摘要。")
    normalized_files = {key: _validate_summary(item, f"GSC {key}") for key, item in files.items()}
    names = [unicodedata.normalize("NFC", item["fileName"]).casefold() for item in normalized_files.values()]
    if len(names) != len(set(names)):
        raise ValueError("GSC 來源檔名衝突。")
    source = value.get("source")
    if not isinstance(source, dict) or set(source) != {"gavVerificationFingerprint", "requestFingerprint", "receiptFingerprint", "statusFingerprint", "archiveObject"}:
        raise ValueError("GSC 缺少封閉的來源證據摘要。")
    patterns = {
        "gavVerificationFingerprint": r"GAV-[0-9A-F]{20}",
        "requestFingerprint": r"GAD-[0-9A-F]{20}",
        "receiptFingerprint": r"GAR-[0-9A-F]{20}",
        "statusFingerprint": r"GSR-[0-9A-F]{20}",
    }
    if any(not re.fullmatch(pattern, str(source.get(field, ""))) for field, pattern in patterns.items()):
        raise ValueError("GSC 來源證據指紋格式不正確。")
    archive_object = source.get("archiveObject")
    if not isinstance(archive_object, dict) or set(archive_object) != {"fileName", "fileSha256", "fileSizeBytes", "mediaType", "zipProfile"}:
        raise ValueError("GSC 封存物件摘要格式不正確。")
    _validate_summary({key: archive_object[key] for key in ("fileName", "fileSha256", "fileSizeBytes")}, "GSC archiveObject")
    if archive_object.get("mediaType") != "application/zip" or archive_object.get("zipProfile") != "closed-flat-zip-stored-v1":
        raise ValueError("GSC 封存物件格式不受支援。")
    archive = value.get("archive")
    if not isinstance(archive, dict) or set(archive) != {"providerOrganization", "repositoryId", "archiveObjectId", "versionId", "initialStoredAt", "legalHoldRequired"}:
        raise ValueError("GSC 缺少封閉的外部物件摘要。")
    if not isinstance(archive.get("legalHoldRequired"), bool):
        raise ValueError("GSC legal hold 要求必須是布林值。")
    normalized_archive = {
        **archive,
        "providerOrganization": _text(archive.get("providerOrganization"), "GSC 保存端組織", maximum=200),
        "repositoryId": _identifier(archive.get("repositoryId"), "GSC 保存庫識別碼"),
        "archiveObjectId": _identifier(archive.get("archiveObjectId"), "GSC 物件識別碼"),
        "versionId": _identifier(archive.get("versionId"), "GSC 版本識別碼"),
        "initialStoredAt": _iso(archive.get("initialStoredAt"), "GSC 初始入庫時間"),
    }
    observation = value.get("observation")
    observation_fields = {
        "observedAt", "objectStatus", "contentHashStatus", "observedObject",
        "immutabilityStatus", "immutabilityMode", "retentionPolicyId", "retentionUntil",
        "legalHoldStatus", "observationMethod", "observationReference",
    }
    if not isinstance(observation, dict) or set(observation) != observation_fields:
        raise ValueError("GSC 缺少保存狀態觀察資料。")
    if observation.get("objectStatus") != "present" or observation.get("contentHashStatus") != "matched" or observation.get("immutabilityStatus") != "active":
        raise ValueError("GSC 只接受存在、內容相符且不可變狀態 active 的觀察。")
    observed_object = observation.get("observedObject")
    if not isinstance(observed_object, dict) or set(observed_object) != {"fileSha256", "fileSizeBytes"}:
        raise ValueError("GSC 缺少觀察物件摘要。")
    if observed_object != {"fileSha256": archive_object["fileSha256"], "fileSizeBytes": archive_object["fileSizeBytes"]}:
        raise ValueError("GSC 觀察物件摘要與原 GAP 不一致。")
    normalized_observation = {
        **observation,
        "observedAt": _iso(observation.get("observedAt"), "GSC 觀察時間"),
        "retentionPolicyId": _identifier(observation.get("retentionPolicyId"), "GSC 保存政策識別碼"),
        "retentionUntil": _iso(observation.get("retentionUntil"), "GSC 保留期限"),
        "observationMethod": _identifier(observation.get("observationMethod"), "GSC 觀察方法"),
        "observationReference": _identifier(observation.get("observationReference"), "GSC 觀察紀錄識別碼"),
    }
    if normalized_observation.get("immutabilityMode") not in IMMUTABILITY_MODES or normalized_observation.get("legalHoldStatus") not in LEGAL_HOLD_STATUSES:
        raise ValueError("GSC 保存模式或 legal hold 狀態不受支援。")
    policy = value.get("policy")
    if not isinstance(policy, dict) or set(policy) != {"reviewIntervalDays", "maximumObservationAgeHours", "retentionWarningDays", "nextReviewDueAt"}:
        raise ValueError("GSC 缺少封閉的週期政策。")
    review_days = policy.get("reviewIntervalDays")
    age_hours = policy.get("maximumObservationAgeHours")
    warning_days = policy.get("retentionWarningDays")
    if not isinstance(review_days, int) or isinstance(review_days, bool) or not 1 <= review_days <= MAX_REVIEW_INTERVAL_DAYS:
        raise ValueError("GSC review interval 不正確。")
    if not isinstance(age_hours, int) or isinstance(age_hours, bool) or not 1 <= age_hours <= MAX_OBSERVATION_AGE_HOURS:
        raise ValueError("GSC observation age 上限不正確。")
    if not isinstance(warning_days, int) or isinstance(warning_days, bool) or not 0 <= warning_days <= MAX_RETENTION_WARNING_DAYS:
        raise ValueError("GSC retention warning 不正確。")
    next_due = _iso(policy.get("nextReviewDueAt"), "GSC 下次重驗期限")
    verified_dt = _utc_datetime(verified, "GSC 驗證時間")
    observed_dt = _utc_datetime(normalized_observation["observedAt"], "GSC 觀察時間")
    next_due_dt = _utc_datetime(next_due, "GSC 下次重驗期限")
    retention_until_dt = _utc_datetime(normalized_observation["retentionUntil"], "GSC 保留期限")
    expected_due = observed_dt + timedelta(days=review_days)
    if next_due_dt != expected_due:
        raise ValueError("GSC 下次重驗期限與週期政策不一致。")
    if verified_dt < observed_dt:
        raise ValueError("GSC 驗證時間不得早於保存端觀察時間。")
    if verified_dt - observed_dt > timedelta(hours=age_hours):
        raise ValueError("GSC 保存端觀察資料已超過允許時效。")
    if verified_dt >= next_due_dt:
        raise ValueError("GSC 建立時已達或超過下次重驗期限。")
    if retention_until_dt <= next_due_dt:
        raise ValueError("GSC 保留期限必須晚於下次重驗期限。")
    if archive["legalHoldRequired"] and normalized_observation["legalHoldStatus"] != "active":
        raise ValueError("GSC 要求 legal hold，但保存端觀察狀態不是 active。")
    expected_summary = {
        "integrityStatus": "valid",
        "originalArchiveEvidenceStatus": "valid",
        "providerSignatureStatus": "valid-explicitly-selected-key",
        "objectStatus": "present-hash-matched",
        "immutabilityStatus": "active",
        "retentionStatus": "satisfied-through-next-review",
        "legalHoldStatus": "satisfied" if archive["legalHoldRequired"] else "not-required",
    }
    if value.get("summary") != expected_summary or value.get("boundary") != LIFECYCLE_BOUNDARY:
        raise ValueError("GSC 結論或責任邊界不完整。")
    basis = _text(value.get("providerKeyApprovalBasis"), "GSC 保存端金鑰核定依據", maximum=500)
    fingerprint = str(value.get("checkpointFingerprint", ""))
    if not re.fullmatch(r"GSC-[0-9A-F]{20}", fingerprint) or fingerprint != lifecycle_checkpoint_fingerprint(value):
        raise ValueError("GSC 指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["verifiedAt"] = verified
    normalized["sourceFiles"] = normalized_files
    normalized["archive"] = normalized_archive
    normalized["observation"] = normalized_observation
    normalized["policy"]["nextReviewDueAt"] = next_due
    normalized["providerKeyApprovalBasis"] = basis
    return normalized


def finalize_lifecycle_checkpoint_package(
    *,
    gav_package: Path,
    provider_status_receipt_path: Path,
    provider_public_key_path: Path,
    provider_key_approval_evidence_path: Path,
    provider_key_approval_basis: str,
    review_interval_days: int,
    maximum_observation_age_hours: int,
    retention_warning_days: int,
    output_directory: Path | None = None,
    openssl_path: Path | None = None,
    verified_at: str | None = None,
) -> dict[str, Any]:
    openssl = find_openssl(openssl_path)
    gav = verify_archive_verification_package(gav_package, openssl_path=openssl)
    gav_raw_files = _read_source_directory(gav_package, "GAV")
    gav_zip = _build_gav_zip(gav_raw_files)
    packaged_gav, packaged_files = _verify_packaged_gav(gav_zip, openssl)
    if packaged_gav != gav or packaged_files != gav_raw_files:
        raise ValueError("GSC 內 GAV 封裝與原 GAV bytes 不一致。")
    request = _gav_request(gav_raw_files, gav)
    status_raw = _read_bytes(provider_status_receipt_path, max_bytes=MAX_JSON_BYTES, label="GSR")
    public_raw = _read_bytes(provider_public_key_path, max_bytes=100_000, label="GSR 保存端公開金鑰")
    approval_raw = _read_bytes(provider_key_approval_evidence_path, max_bytes=MAX_BINARY_BYTES, label="GSR 保存端金鑰核定證據")
    _validate_approval_evidence(approval_raw, provider_key_approval_evidence_path.name)
    if approval_raw in {gav_zip, status_raw, public_raw, *gav_raw_files.values()}:
        raise ValueError("GSC 金鑰核定證據必須是獨立文件，不得以其他來源檔充數。")
    status = validate_lifecycle_provider_status(_json_from_bytes(status_raw, "GSR"))
    if provider_status_receipt_path.name != f"GSR-外部歸檔週期狀態-{status['statusFingerprint']}.json":
        raise ValueError("GSR 檔名與指紋不一致。")
    public_key = _load_public_key_bytes(public_raw)
    status = verify_lifecycle_provider_signature(status, public_key)
    _validate_positive_status(request, gav, status)
    verified = _iso(verified_at or _now_iso(), "GSC 驗證時間")
    gav_zip_name = f"GAV-原外部歸檔證據包-{gav['verificationFingerprint']}.zip"
    status_name = provider_status_receipt_path.name
    public_name = f"GSC-provider-current-public-key-{status['signature']['keyId']}.pem"
    approval_name = f"GSC-provider-current-key-approval-{provider_key_approval_evidence_path.name}"
    for name in (gav_zip_name, status_name, public_name, approval_name):
        _safe_file_name(name, "GSC")
    raw_files = {
        "gavPackage": (gav_zip_name, gav_zip),
        "providerStatusReceipt": (status_name, status_raw),
        "providerPublicKey": (public_name, public_raw),
        "providerKeyApprovalEvidence": (approval_name, approval_raw),
    }
    portable = [unicodedata.normalize("NFC", name).casefold() for name, _ in raw_files.values()]
    if len(portable) != len(set(portable)):
        raise ValueError("GSC 來源檔名衝突。")
    checkpoint = build_lifecycle_checkpoint(
        gav=gav,
        request=request,
        status=status,
        source_files={key: _summary(name, raw) for key, (name, raw) in raw_files.items()},
        provider_key_approval_basis=provider_key_approval_basis,
        review_interval_days=review_interval_days,
        maximum_observation_age_hours=maximum_observation_age_hours,
        retention_warning_days=retention_warning_days,
        verified_at=verified,
    )
    destination = output_directory or gav_package.parent / f"GSC-外部歸檔生命週期檢查點-{checkpoint['checkpointFingerprint']}"
    if destination.exists():
        raise ValueError("GSC 輸出目錄已存在；本工具不會覆寫。")
    checkpoint_name = f"GSC-外部歸檔生命週期檢查點-{checkpoint['checkpointFingerprint']}.json"
    if checkpoint_name.casefold() in portable:
        raise ValueError("GSC 檢查點檔名與來源檔衝突。")
    destination.mkdir(parents=False, exist_ok=False)
    try:
        for name, raw in raw_files.values():
            _copy_exclusive(raw, destination / name)
        _copy_exclusive((json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / checkpoint_name)
        result = verify_lifecycle_checkpoint_package(destination, openssl_path=openssl, as_of=verified)
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "checkpointFingerprint": checkpoint["checkpointFingerprint"],
        "statusFingerprint": status["statusFingerprint"],
        "nextReviewDueAt": checkpoint["policy"]["nextReviewDueAt"],
        "retentionUntil": checkpoint["observation"]["retentionUntil"],
        "lifecycleStatus": result["assessment"]["lifecycleStatus"],
    }


def assess_lifecycle_checkpoint(checkpoint: dict[str, Any], *, as_of: str | None = None) -> dict[str, Any]:
    checkpoint = validate_lifecycle_checkpoint(checkpoint)
    assessed_at = _iso(as_of or _now_iso(), "GSC 評估時間")
    current = _utc_datetime(assessed_at, "GSC 評估時間")
    if current < _utc_datetime(checkpoint["verifiedAt"], "GSC 驗證時間"):
        raise ValueError("GSC 評估時間不得早於檢查點驗證時間。")
    next_due = _utc_datetime(checkpoint["policy"]["nextReviewDueAt"], "GSC 下次重驗期限")
    retention = _utc_datetime(checkpoint["observation"]["retentionUntil"], "GSC 保留期限")
    warning_start = retention - timedelta(days=checkpoint["policy"]["retentionWarningDays"])
    reasons: list[str] = []
    if current >= retention:
        status = "blocked"
        reasons.append("retention-expired")
    else:
        if current >= next_due:
            reasons.append("periodic-review-due")
        if current >= warning_start:
            reasons.append("retention-renewal-window")
        status = "review-due" if reasons else "current"
    return {
        "assessedAt": assessed_at,
        "historicalIntegrityStatus": "valid",
        "lifecycleStatus": status,
        "reasons": reasons,
        "nextReviewDueAt": checkpoint["policy"]["nextReviewDueAt"],
        "retentionUntil": checkpoint["observation"]["retentionUntil"],
        "checkpointFingerprint": checkpoint["checkpointFingerprint"],
    }


def verify_lifecycle_checkpoint_package(
    directory: Path,
    *,
    openssl_path: Path | None = None,
    as_of: str | None = None,
) -> dict[str, Any]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError("GSC 必須是既有一般資料夾。")
    checkpoint_paths = list(directory.glob("GSC-*.json"))
    if len(checkpoint_paths) != 1:
        raise ValueError("GSC 必須恰有一份檢查點 JSON。")
    checkpoint_path = checkpoint_paths[0]
    checkpoint_raw = _read_bytes(checkpoint_path, max_bytes=MAX_JSON_BYTES, label="GSC")
    checkpoint = validate_lifecycle_checkpoint(_json_from_bytes(checkpoint_raw, "GSC"))
    if checkpoint_path.name != f"GSC-外部歸檔生命週期檢查點-{checkpoint['checkpointFingerprint']}.json":
        raise ValueError("GSC 檢查點檔名與指紋不一致。")
    expected_names = {checkpoint_path.name.casefold(), *(item["fileName"].casefold() for item in checkpoint["sourceFiles"].values())}
    _assert_closed_directory(directory, expected_names, "GSC")
    paths = {key: directory / item["fileName"] for key, item in checkpoint["sourceFiles"].items()}
    raw_files: dict[str, bytes] = {}
    for key, path in paths.items():
        maximum = MAX_GAV_PACKAGE_BYTES if key == "gavPackage" else MAX_BINARY_BYTES
        if key == "providerStatusReceipt":
            maximum = MAX_JSON_BYTES
        elif key == "providerPublicKey":
            maximum = 100_000
        raw = _read_bytes(path, max_bytes=maximum, label=f"GSC {key}")
        raw_files[key] = raw
        if _summary(path.name, raw) != checkpoint["sourceFiles"][key]:
            raise ValueError(f"GSC 內 {key} bytes 與檢查點不一致。")
    _validate_approval_evidence(raw_files["providerKeyApprovalEvidence"], paths["providerKeyApprovalEvidence"].name)
    if raw_files["providerKeyApprovalEvidence"] in {raw_files["gavPackage"], raw_files["providerStatusReceipt"], raw_files["providerPublicKey"]}:
        raise ValueError("GSC 金鑰核定證據必須是獨立文件。")
    openssl = find_openssl(openssl_path)
    gav, gav_files = _verify_packaged_gav(raw_files["gavPackage"], openssl)
    request = _gav_request(gav_files, gav)
    if raw_files["providerKeyApprovalEvidence"] in set(gav_files.values()):
        raise ValueError("GSC 金鑰核定證據不得以原 GAV 內的來源檔充數。")
    status = validate_lifecycle_provider_status(_json_from_bytes(raw_files["providerStatusReceipt"], "GSR"))
    if paths["providerStatusReceipt"].name != f"GSR-外部歸檔週期狀態-{status['statusFingerprint']}.json":
        raise ValueError("GSR 檔名與指紋不一致。")
    public_key = _load_public_key_bytes(raw_files["providerPublicKey"])
    verify_lifecycle_provider_signature(status, public_key)
    _validate_positive_status(request, gav, status)
    expected_source = {
        "gavVerificationFingerprint": gav["verificationFingerprint"],
        "requestFingerprint": gav["archive"]["requestFingerprint"],
        "receiptFingerprint": gav["archive"]["receiptFingerprint"],
        "statusFingerprint": status["statusFingerprint"],
        "archiveObject": request["archiveObject"],
    }
    expected_archive = {
        "providerOrganization": gav["archive"]["providerOrganization"],
        "repositoryId": gav["archive"]["repositoryId"],
        "archiveObjectId": gav["archive"]["archiveObjectId"],
        "versionId": gav["archive"]["versionId"],
        "initialStoredAt": gav["archive"]["storedAt"],
        "legalHoldRequired": request["requirements"]["legalHoldRequired"],
    }
    if checkpoint["source"] != expected_source or checkpoint["archive"] != expected_archive or checkpoint["observation"] != status["observation"]:
        raise ValueError("GSC 摘要與實際 GAV／GSR 不一致。")
    build_probe = build_lifecycle_checkpoint(
        gav=gav,
        request=request,
        status=status,
        source_files=checkpoint["sourceFiles"],
        provider_key_approval_basis=checkpoint["providerKeyApprovalBasis"],
        review_interval_days=checkpoint["policy"]["reviewIntervalDays"],
        maximum_observation_age_hours=checkpoint["policy"]["maximumObservationAgeHours"],
        retention_warning_days=checkpoint["policy"]["retentionWarningDays"],
        verified_at=checkpoint["verifiedAt"],
    )
    if build_probe != checkpoint:
        raise ValueError("GSC 無法由實際來源重建。")
    if _read_bytes(checkpoint_path, max_bytes=MAX_JSON_BYTES, label="GSC") != checkpoint_raw:
        raise ValueError("GSC 在重驗過程中發生變更。")
    for key, path in paths.items():
        maximum = MAX_GAV_PACKAGE_BYTES if key == "gavPackage" else MAX_BINARY_BYTES
        if key == "providerStatusReceipt":
            maximum = MAX_JSON_BYTES
        elif key == "providerPublicKey":
            maximum = 100_000
        if _read_bytes(path, max_bytes=maximum, label=f"GSC {key}") != raw_files[key]:
            raise ValueError(f"GSC 內 {key} 在重驗過程中發生變更。")
    _assert_closed_directory(directory, expected_names, "GSC")
    return {"checkpoint": checkpoint, "assessment": assess_lifecycle_checkpoint(checkpoint, as_of=as_of)}


def main() -> int:
    parser = argparse.ArgumentParser(description="建立、驗證並評估外部 DMS/WORM 歸檔生命週期檢查點。")
    parser.add_argument("--openssl", type=Path, help="可選：OpenSSL 可執行檔路徑")
    commands = parser.add_subparsers(dest="command", required=True)

    issue = commands.add_parser("issue-status", help="保存端於實際重新查詢外部保存庫後簽發 GSR")
    issue.add_argument("--archive-request", required=True, type=Path)
    issue.add_argument("--provider-receipt", required=True, type=Path)
    issue.add_argument("--private-key", required=True, type=Path)
    issue.add_argument("--private-key-password-env")
    issue.add_argument("--observed-at", required=True)
    issue.add_argument("--object-status", required=True, choices=sorted(OBJECT_STATUSES))
    issue.add_argument("--content-hash-status", required=True, choices=sorted(CONTENT_HASH_STATUSES))
    issue.add_argument("--observed-object-sha256")
    issue.add_argument("--observed-object-size-bytes", type=int)
    issue.add_argument("--immutability-status", required=True, choices=sorted(IMMUTABILITY_STATUSES))
    issue.add_argument("--immutability-mode", required=True, choices=sorted(IMMUTABILITY_MODES))
    issue.add_argument("--retention-policy-id", required=True)
    issue.add_argument("--retention-until", required=True)
    issue.add_argument("--legal-hold-status", required=True, choices=sorted(LEGAL_HOLD_STATUSES))
    issue.add_argument("--observation-method", required=True)
    issue.add_argument("--observation-reference", required=True)
    issue.add_argument("--signed-at")
    issue.add_argument("--output-directory", type=Path)

    finalize = commands.add_parser("finalize-checkpoint", help="驗證 GAV 與 GSR 後建立封閉 GSC")
    finalize.add_argument("--gav-package", required=True, type=Path)
    finalize.add_argument("--provider-status-receipt", required=True, type=Path)
    finalize.add_argument("--provider-public-key", required=True, type=Path)
    finalize.add_argument("--provider-key-approval-evidence", required=True, type=Path)
    finalize.add_argument("--provider-key-approval-basis", required=True)
    finalize.add_argument("--review-interval-days", required=True, type=int)
    finalize.add_argument("--maximum-observation-age-hours", type=int, default=72)
    finalize.add_argument("--retention-warning-days", type=int, default=180)
    finalize.add_argument("--verified-at")
    finalize.add_argument("--output-directory", type=Path)

    verify = commands.add_parser("verify-checkpoint", help="離線重驗 GSC 並評估 current/review-due/blocked")
    verify.add_argument("--package", required=True, type=Path)
    verify.add_argument("--as-of")

    args = parser.parse_args()
    try:
        if args.command == "issue-status":
            result = issue_lifecycle_provider_status(
                archive_request_path=args.archive_request,
                provider_receipt_path=args.provider_receipt,
                private_key_path=args.private_key,
                private_key_password_env=args.private_key_password_env,
                observed_at=args.observed_at,
                object_status=args.object_status,
                content_hash_status=args.content_hash_status,
                observed_object_sha256=args.observed_object_sha256,
                observed_object_size_bytes=args.observed_object_size_bytes,
                immutability_status=args.immutability_status,
                immutability_mode=args.immutability_mode,
                retention_policy_id=args.retention_policy_id,
                retention_until=args.retention_until,
                legal_hold_status=args.legal_hold_status,
                observation_method=args.observation_method,
                observation_reference=args.observation_reference,
                signed_at=args.signed_at,
                output_directory=args.output_directory,
            )
            exit_code = 0
        elif args.command == "finalize-checkpoint":
            result = finalize_lifecycle_checkpoint_package(
                gav_package=args.gav_package,
                provider_status_receipt_path=args.provider_status_receipt,
                provider_public_key_path=args.provider_public_key,
                provider_key_approval_evidence_path=args.provider_key_approval_evidence,
                provider_key_approval_basis=args.provider_key_approval_basis,
                review_interval_days=args.review_interval_days,
                maximum_observation_age_hours=args.maximum_observation_age_hours,
                retention_warning_days=args.retention_warning_days,
                verified_at=args.verified_at,
                output_directory=args.output_directory,
                openssl_path=args.openssl,
            )
            exit_code = 0
        else:
            result = verify_lifecycle_checkpoint_package(args.package, openssl_path=args.openssl, as_of=args.as_of)
            exit_code = {"current": 0, "review-due": 2, "blocked": 3}[result["assessment"]["lifecycleStatus"]]
        os.sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        os.sys.stdout.buffer.flush()
        return exit_code
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
