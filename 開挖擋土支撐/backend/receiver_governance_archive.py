from __future__ import annotations

import argparse
import base64
from copy import deepcopy
from datetime import datetime, timezone
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
import uuid
import zipfile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

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
    verify_timestamp_package,
)


REQUEST_KIND = "governance-trusted-timestamp-external-archive-request"
REQUEST_CONTEXT = "governance-trusted-timestamp-external-archive-request-v1"
RECEIPT_KIND = "governance-trusted-timestamp-external-archive-provider-receipt"
RECEIPT_CONTEXT = "governance-trusted-timestamp-external-archive-provider-receipt-v1"
VERIFICATION_KIND = "governance-trusted-timestamp-external-archive-verification-receipt"
VERIFICATION_CONTEXT = "governance-trusted-timestamp-external-archive-verification-v1"
ARCHIVE_MEDIA_TYPE = "application/zip"
ARCHIVE_ZIP_PROFILE = "closed-flat-zip-stored-v1"
IMMUTABILITY_MODES = {"worm-compliance", "worm-governance", "retention-lock"}
LEGAL_HOLD_STATUSES = {"active", "not-active", "not-supported"}
REQUIRED_RECEIPT_FIELDS = [
    "provider organization and repository identifier",
    "archive object and immutable version identifiers",
    "stored status and stored time",
    "immutability mode and retention-until time",
    "legal-hold status",
    "exact archive object SHA-256 and byte size",
    "Ed25519 provider signature",
]
REQUEST_BOUNDARY = {
    "requiresExternalArchiveProviderAction": True,
    "doesNotUploadOrSubmitToExternalArchive": True,
    "requestCreationDoesNotProveExternalStorage": True,
    "versioningOrLocalCopyAloneDoesNotSatisfyWorm": True,
    "requiresProviderSignedReceipt": True,
    "requiresExplicitProviderKeyApproval": True,
    "doesNotConstituteEngineeringApproval": True,
    "formalCalculationAttachment": False,
}
VERIFICATION_BOUNDARY = {
    "independentOfflineValidation": True,
    "noServiceRequiredForReverification": True,
    "noProjectDatabaseRequired": True,
    "noPrivateKeyCredentialInputsAcceptedByFinalizeOrVerify": True,
    "recognizablePrivateKeyFilesAndPemMaterialRejected": True,
    "providerPublicKeyWasExplicitlySelected": True,
    "providerKeyApprovalMustBeIndependentlyConfirmed": True,
    "providerKeyApprovalEvidenceContentIsNotInterpreted": True,
    "providerSignedReceiptIsAttestationNotIndependentObservation": True,
    "doesNotQueryCurrentExternalRepositoryState": True,
    "doesNotProveObjectStillExistsAfterVerification": True,
    "doesNotVerifyProviderOperationalControls": True,
    "doesNotConstituteEngineeringApproval": True,
    "verificationReceiptIsNotStandaloneProof": True,
    "requiresCompletePackageForRevalidation": True,
    "formalCalculationAttachment": False,
}
MAX_ARCHIVE_BYTES = 100_000_000
MAX_ARCHIVE_ENTRIES = 32
MAX_TEXT = 500


def _json_from_bytes(raw: bytes, label: str) -> dict[str, Any]:
    def object_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{label}包含重複 JSON 欄位。")
            result[key] = value
        return result

    try:
        value = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=object_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label}不是有效 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label}最外層必須是 JSON 物件。")
    return value


def _text(value: Any, label: str, *, maximum: int = MAX_TEXT) -> str:
    text = str(value or "").strip()
    if not text or len(text) > maximum or any(ord(character) < 32 for character in text):
        raise ValueError(f"{label}不可空白、過長或含控制字元。")
    return text


def _identifier(value: Any, label: str) -> str:
    text = _text(value, label, maximum=200)
    if not re.fullmatch(r"[A-Za-z0-9._:/@+\-]{1,200}", text):
        raise ValueError(f"{label}只能使用可攜式識別字元。")
    return text


def _utc_datetime(value: Any, label: str) -> datetime:
    return datetime.fromisoformat(_iso(value, label).replace("Z", "+00:00"))


def _fingerprint(prefix: str, record: dict[str, Any], field: str) -> str:
    payload = {key: value for key, value in record.items() if key != field}
    return f"{prefix}-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def archive_request_fingerprint(record: dict[str, Any]) -> str:
    return _fingerprint("GAD", record, "requestFingerprint")


def _receipt_fingerprint_payload(record: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(record)
    payload.pop("receiptFingerprint", None)
    signature = payload.get("signature")
    if isinstance(signature, dict):
        signature.pop("value", None)
    return payload


def archive_receipt_fingerprint(record: dict[str, Any]) -> str:
    return "GAR-" + hashlib.sha256(_canonical_json_bytes(_receipt_fingerprint_payload(record))).hexdigest()[:20].upper()


def _receipt_signature_payload(record: dict[str, Any]) -> bytes:
    payload = deepcopy(record)
    signature = payload.get("signature")
    if not isinstance(signature, dict):
        raise ValueError("GAR 缺少簽章欄位。")
    signature.pop("value", None)
    return _canonical_json_bytes(payload)


def archive_verification_fingerprint(record: dict[str, Any]) -> str:
    return _fingerprint("GAV", record, "verificationFingerprint")


def _public_key_raw(public_key: Ed25519PublicKey) -> bytes:
    return public_key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def _provider_key_id(public_key: Ed25519PublicKey) -> str:
    return "AKI-" + hashlib.sha256(_public_key_raw(public_key)).hexdigest()[:20].upper()


def _public_key_pem(public_key: Ed25519PublicKey) -> bytes:
    return public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _load_public_key_bytes(raw: bytes) -> Ed25519PublicKey:
    if b"PRIVATE KEY" in raw.upper():
        raise ValueError("外部保存端公開金鑰不得包含私人金鑰資料。")
    try:
        key = serialization.load_pem_public_key(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("外部保存端公開金鑰不是有效 PEM。") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("外部保存端公開金鑰必須是 Ed25519。")
    if raw.strip() != _public_key_pem(key).strip():
        raise ValueError("外部保存端公開金鑰必須是單一純 Ed25519 SubjectPublicKeyInfo PEM。")
    return key


def _reject_private_key_material(raw: bytes, label: str) -> None:
    if re.search(
        br"-----BEGIN (?:ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
        raw,
        re.IGNORECASE,
    ):
        raise ValueError(f"{label}不得包含私人金鑰資料。")


def _validate_approval_evidence(raw: bytes, file_name: str) -> None:
    _safe_file_name(file_name, "外部保存端金鑰核定證據")
    if Path(file_name).suffix.casefold() in {".key", ".p12", ".pfx", ".jks"}:
        raise ValueError("外部保存端金鑰核定證據不得使用私人金鑰容器副檔名。")
    _reject_private_key_material(raw, "外部保存端金鑰核定證據")


def _load_private_key(path: Path, password_env: str | None) -> Ed25519PrivateKey:
    raw = _read_bytes(path, max_bytes=100_000, label="外部保存端私人金鑰")
    password = None
    if password_env:
        value = os.environ.get(password_env)
        if value is None:
            raise ValueError(f"找不到私人金鑰密碼環境變數 {password_env}。")
        password = value.encode("utf-8")
    try:
        key = serialization.load_pem_private_key(raw, password=password)
    except (TypeError, ValueError) as exc:
        raise ValueError("外部保存端私人金鑰無法讀取。") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("外部保存端私人金鑰必須是 Ed25519。")
    return key


def _archive_object(value: Any, label: str) -> dict[str, Any]:
    expected = {"fileName", "fileSha256", "fileSizeBytes", "mediaType", "zipProfile"}
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"{label}封存物件摘要格式不正確。")
    summary = _validate_summary(
        {key: value[key] for key in ("fileName", "fileSha256", "fileSizeBytes")},
        label,
    )
    if value.get("mediaType") != ARCHIVE_MEDIA_TYPE or value.get("zipProfile") != ARCHIVE_ZIP_PROFILE:
        raise ValueError(f"{label}封存物件格式不受支援。")
    return {**summary, "mediaType": ARCHIVE_MEDIA_TYPE, "zipProfile": ARCHIVE_ZIP_PROFILE}


def build_archive_request(
    *,
    archive_object: dict[str, Any],
    gtv_receipt: dict[str, Any],
    provider_organization: str,
    repository_id: str,
    immutability_mode: str,
    retention_policy_id: str,
    retention_until: str,
    legal_hold_required: bool,
    created_at: str | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    normalized_object = _archive_object(archive_object, "GAD")
    provider = _text(provider_organization, "外部保存端組織", maximum=200)
    repository = _identifier(repository_id, "外部保存庫識別碼")
    retention_policy = _identifier(retention_policy_id, "外部保存政策識別碼")
    if immutability_mode not in IMMUTABILITY_MODES:
        raise ValueError("GAD 不支援指定的不可變保存模式。")
    created = _iso(created_at or _now_iso(), "GAD 建立時間")
    retention = _iso(retention_until, "GAD 保留期限")
    if _utc_datetime(retention, "GAD 保留期限") <= _utc_datetime(created, "GAD 建立時間"):
        raise ValueError("GAD 保留期限必須晚於請求建立時間。")
    if not isinstance(legal_hold_required, bool):
        raise ValueError("GAD legal hold 要求必須是布林值。")
    rid = request_id or f"GADR-{uuid.uuid4().hex.upper()}"
    if not re.fullmatch(r"GADR-[0-9A-F]{32}", rid):
        raise ValueError("GAD requestId 格式不正確。")
    source = {
        "gtvVerificationFingerprint": str(gtv_receipt.get("verificationFingerprint", "")),
        "gtvVerifiedAt": _iso(gtv_receipt.get("verifiedAt"), "GTV 驗證時間"),
        "timestampGenTime": _text(gtv_receipt.get("timestamp", {}).get("genTime"), "GTV TSA genTime", maximum=200),
        "timestampPolicyIdentifier": _identifier(
            gtv_receipt.get("timestamp", {}).get("policyIdentifier"),
            "GTV TSA policy identifier",
        ),
    }
    if not re.fullmatch(r"GTV-[0-9A-F]{20}", source["gtvVerificationFingerprint"]):
        raise ValueError("GAD 的 GTV 指紋格式不正確。")
    if _utc_datetime(created, "GAD 建立時間") < _utc_datetime(source["gtvVerifiedAt"], "GTV 驗證時間"):
        raise ValueError("GAD 建立時間不得早於 GTV 驗證時間。")
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": REQUEST_KIND,
        "requestContext": REQUEST_CONTEXT,
        "requestId": rid,
        "createdAt": created,
        "source": source,
        "archiveObject": normalized_object,
        "requirements": {
            "providerOrganization": provider,
            "repositoryId": repository,
            "storageStatus": "stored",
            "immutabilityMode": immutability_mode,
            "retentionPolicyId": retention_policy,
            "retentionUntil": retention,
            "legalHoldRequired": legal_hold_required,
        },
        "requiredReceiptFields": REQUIRED_RECEIPT_FIELDS,
        "boundary": REQUEST_BOUNDARY,
    }
    record["requestFingerprint"] = archive_request_fingerprint(record)
    return validate_archive_request(record)


def validate_archive_request(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "requestContext", "requestId", "createdAt", "source",
        "archiveObject", "requirements", "requiredReceiptFields", "boundary", "requestFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GAD 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != REQUEST_KIND or value.get("requestContext") != REQUEST_CONTEXT:
        raise ValueError("GAD 版本、種類或內容脈絡不受支援。")
    if not re.fullmatch(r"GADR-[0-9A-F]{32}", str(value.get("requestId", ""))):
        raise ValueError("GAD requestId 格式不正確。")
    created = _iso(value.get("createdAt"), "GAD 建立時間")
    source = value.get("source")
    if not isinstance(source, dict) or set(source) != {
        "gtvVerificationFingerprint", "gtvVerifiedAt", "timestampGenTime", "timestampPolicyIdentifier"
    }:
        raise ValueError("GAD 缺少封閉的 GTV 來源摘要。")
    if not re.fullmatch(r"GTV-[0-9A-F]{20}", str(source.get("gtvVerificationFingerprint", ""))):
        raise ValueError("GAD 的 GTV 指紋格式不正確。")
    normalized_source = {
        "gtvVerificationFingerprint": source["gtvVerificationFingerprint"],
        "gtvVerifiedAt": _iso(source.get("gtvVerifiedAt"), "GTV 驗證時間"),
        "timestampGenTime": _text(source.get("timestampGenTime"), "GTV TSA genTime", maximum=200),
        "timestampPolicyIdentifier": _identifier(source.get("timestampPolicyIdentifier"), "GTV TSA policy identifier"),
    }
    archive_object = _archive_object(value.get("archiveObject"), "GAD")
    requirements = value.get("requirements")
    if not isinstance(requirements, dict) or set(requirements) != {
        "providerOrganization", "repositoryId", "storageStatus", "immutabilityMode",
        "retentionPolicyId", "retentionUntil", "legalHoldRequired",
    }:
        raise ValueError("GAD 缺少封閉的外部保存要求。")
    mode = str(requirements.get("immutabilityMode", ""))
    retention = _iso(requirements.get("retentionUntil"), "GAD 保留期限")
    legal_hold = requirements.get("legalHoldRequired")
    if (
        requirements.get("storageStatus") != "stored"
        or mode not in IMMUTABILITY_MODES
        or not isinstance(legal_hold, bool)
        or _utc_datetime(retention, "GAD 保留期限") <= _utc_datetime(created, "GAD 建立時間")
    ):
        raise ValueError("GAD 外部保存要求不完整。")
    normalized_requirements = {
        "providerOrganization": _text(requirements.get("providerOrganization"), "外部保存端組織", maximum=200),
        "repositoryId": _identifier(requirements.get("repositoryId"), "外部保存庫識別碼"),
        "storageStatus": "stored",
        "immutabilityMode": mode,
        "retentionPolicyId": _identifier(requirements.get("retentionPolicyId"), "外部保存政策識別碼"),
        "retentionUntil": retention,
        "legalHoldRequired": legal_hold,
    }
    if _utc_datetime(created, "GAD 建立時間") < _utc_datetime(normalized_source["gtvVerifiedAt"], "GTV 驗證時間"):
        raise ValueError("GAD 建立時間不得早於 GTV 驗證時間。")
    if value.get("requiredReceiptFields") != REQUIRED_RECEIPT_FIELDS or value.get("boundary") != REQUEST_BOUNDARY:
        raise ValueError("GAD 未保留完整收據要求或責任邊界。")
    fingerprint = str(value.get("requestFingerprint", ""))
    if not re.fullmatch(r"GAD-[0-9A-F]{20}", fingerprint) or fingerprint != archive_request_fingerprint(value):
        raise ValueError("GAD 指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["createdAt"] = created
    normalized["source"] = normalized_source
    normalized["archiveObject"] = archive_object
    normalized["requirements"] = normalized_requirements
    return normalized


def _read_source_directory(directory: Path, label: str) -> dict[str, bytes]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError(f"{label}必須是既有一般資料夾。")
    entries = list(directory.iterdir())
    if not entries or len(entries) > MAX_ARCHIVE_ENTRIES:
        raise ValueError(f"{label}檔案數不在允許範圍。")
    raw_files: dict[str, bytes] = {}
    portable_names: set[str] = set()
    total = 0
    for path in entries:
        junction = getattr(path, "is_junction", lambda: False)
        if path.is_symlink() or junction() or not path.is_file():
            raise ValueError(f"{label}不得包含符號連結、junction 或子資料夾。")
        name = _safe_file_name(path.name, label)
        portable = unicodedata.normalize("NFC", name).casefold()
        if portable in portable_names:
            raise ValueError(f"{label}包含重複可攜式檔名。")
        portable_names.add(portable)
        raw = _read_bytes(path, max_bytes=MAX_BINARY_BYTES, label=f"{label} {name}")
        total += len(raw)
        if total > MAX_ARCHIVE_BYTES:
            raise ValueError(f"{label}總大小超過限制。")
        raw_files[name] = raw
    return raw_files


def _verify_gtv_snapshot(raw_files: dict[str, bytes], openssl_path: Path | None) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="gtv-archive-snapshot-") as directory:
        root = Path(directory)
        for name, raw in raw_files.items():
            _copy_exclusive(raw, root / name)
        return verify_timestamp_package(root, openssl_path=openssl_path)


def _build_closed_zip(raw_files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for name in sorted(raw_files, key=lambda item: unicodedata.normalize("NFC", item).casefold()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 0
            info.external_attr = 0
            archive.writestr(info, raw_files[name])
    raw = output.getvalue()
    if not raw or len(raw) > MAX_ARCHIVE_BYTES:
        raise ValueError("GAP 封存物件大小超過限制。")
    return raw


def _read_closed_zip(raw: bytes, openssl_path: Path | None, *, verify_gtv: bool = True) -> tuple[dict[str, bytes], dict[str, Any] | None]:
    if not raw or len(raw) > MAX_ARCHIVE_BYTES:
        raise ValueError("GAP 封存物件大小不正確。")
    if not raw.startswith(b"PK\x03\x04") or b"PK\x06\x06" in raw or b"PK\x06\x07" in raw:
        raise ValueError("GAP 必須是無前置資料且不使用 Zip64 的標準 ZIP。")
    eocd = raw.rfind(b"PK\x05\x06")
    if eocd < 0 or eocd + 22 > len(raw):
        raise ValueError("GAP 缺少有效 ZIP 結尾紀錄。")
    comment_length = int.from_bytes(raw[eocd + 20:eocd + 22], "little")
    if comment_length != 0 or eocd + 22 != len(raw):
        raise ValueError("GAP 不得包含 ZIP comment 或尾隨資料。")
    raw_files: dict[str, bytes] = {}
    portable_names: set[str] = set()
    try:
        with zipfile.ZipFile(io.BytesIO(raw), "r") as archive:
            if archive.comment:
                raise ValueError("GAP 不得包含 ZIP comment。")
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ARCHIVE_ENTRIES:
                raise ValueError("GAP 封存物件檔案數不在允許範圍。")
            total = 0
            for info in infos:
                name = _safe_file_name(info.filename, "GAP")
                portable = unicodedata.normalize("NFC", name).casefold()
                unix_mode = (info.external_attr >> 16) & 0xFFFF
                if (
                    info.is_dir()
                    or "/" in info.filename
                    or "\\" in info.filename
                    or portable in portable_names
                    or info.flag_bits & 0x1
                    or info.flag_bits & ~0x800
                    or info.compress_type != zipfile.ZIP_STORED
                    or info.file_size != info.compress_size
                    or (unix_mode & 0o170000) == 0o120000
                    or info.file_size <= 0
                    or info.file_size > MAX_BINARY_BYTES
                ):
                    raise ValueError("GAP 必須是未加密、未壓縮、無連結且無重複檔名的封閉平面 ZIP。")
                portable_names.add(portable)
                total += info.file_size
                if total > MAX_ARCHIVE_BYTES:
                    raise ValueError("GAP 解封後總大小超過限制。")
                extracted = archive.read(info)
                if len(extracted) != info.file_size:
                    raise ValueError("GAP ZIP 檔案大小不一致。")
                raw_files[name] = extracted
    except zipfile.BadZipFile as exc:
        raise ValueError("GAP 不是有效 ZIP 封存物件。") from exc
    receipt = _verify_gtv_snapshot(raw_files, openssl_path) if verify_gtv else None
    return raw_files, receipt


def prepare_archive_request(
    *,
    gtv_package: Path,
    provider_organization: str,
    repository_id: str,
    immutability_mode: str,
    retention_policy_id: str,
    retention_until: str,
    legal_hold_required: bool = False,
    output_directory: Path | None = None,
    openssl_path: Path | None = None,
    created_at: str | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    openssl = find_openssl(openssl_path)
    snapshot = _read_source_directory(gtv_package, "GTV 證據包")
    gtv = _verify_gtv_snapshot(snapshot, openssl)
    archive_raw = _build_closed_zip(snapshot)
    _, archived_gtv = _read_closed_zip(archive_raw, openssl)
    if archived_gtv is None or archived_gtv["verificationFingerprint"] != gtv["verificationFingerprint"]:
        raise ValueError("GAP 封存後的 GTV 與來源快照不一致。")
    archive_name = f"GAP-治理可信時間封存物件-{gtv['verificationFingerprint']}.zip"
    archive_object = {
        **_summary(archive_name, archive_raw),
        "mediaType": ARCHIVE_MEDIA_TYPE,
        "zipProfile": ARCHIVE_ZIP_PROFILE,
    }
    request = build_archive_request(
        archive_object=archive_object,
        gtv_receipt=gtv,
        provider_organization=provider_organization,
        repository_id=repository_id,
        immutability_mode=immutability_mode,
        retention_policy_id=retention_policy_id,
        retention_until=retention_until,
        legal_hold_required=legal_hold_required,
        created_at=created_at,
        request_id=request_id,
    )
    destination = output_directory or gtv_package.parent / f"GAD-治理可信時間外部歸檔請求包-{request['requestFingerprint']}"
    if destination.exists():
        raise ValueError("GAD 請求包目錄已存在；為保留證據，本工具不會覆寫。")
    request_name = f"GAD-外部歸檔請求-{request['requestFingerprint']}.json"
    destination.mkdir(parents=False, exist_ok=False)
    try:
        _copy_exclusive(archive_raw, destination / archive_name)
        _copy_exclusive((json.dumps(request, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / request_name)
        loaded, _, _, _, loaded_gtv = _load_prepared_request(destination, openssl_path=openssl, verify_gtv=True)
        if loaded_gtv is None or loaded["requestFingerprint"] != request["requestFingerprint"]:
            raise ValueError("GAD 請求包建立後自我驗證失敗。")
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "requestPath": str((destination / request_name).resolve()),
        "archiveObjectPath": str((destination / archive_name).resolve()),
        "requestFingerprint": request["requestFingerprint"],
        "gtvVerificationFingerprint": gtv["verificationFingerprint"],
    }


def _single_file(directory: Path, pattern: str, label: str) -> Path:
    matches = [path for path in directory.glob(pattern) if path.is_file()]
    if len(matches) != 1:
        raise ValueError(f"證據包必須恰有一份 {label}。")
    return matches[0]


def _load_prepared_request(
    directory: Path,
    *,
    openssl_path: Path | None,
    verify_gtv: bool,
) -> tuple[dict[str, Any], Path, Path, dict[str, bytes], dict[str, Any] | None]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError("GAD 請求包必須是既有一般資料夾。")
    request_path = _single_file(directory, "GAD-*.json", "GAD 請求")
    archive_path = _single_file(directory, "GAP-*.zip", "GAP 封存物件")
    request_raw = _read_bytes(request_path, max_bytes=MAX_JSON_BYTES, label="GAD")
    request = validate_archive_request(_json_from_bytes(request_raw, "GAD"))
    if request_path.name != f"GAD-外部歸檔請求-{request['requestFingerprint']}.json":
        raise ValueError("GAD 請求檔名與指紋不一致。")
    if archive_path.name != request["archiveObject"]["fileName"]:
        raise ValueError("GAP 封存物件檔名與 GAD 不一致。")
    expected_names = {request_path.name.casefold(), archive_path.name.casefold()}
    _assert_closed_directory(directory, expected_names, "GAD 請求包")
    archive_raw = _read_bytes(archive_path, max_bytes=MAX_ARCHIVE_BYTES, label="GAP")
    if _summary(archive_path.name, archive_raw) != {
        key: request["archiveObject"][key] for key in ("fileName", "fileSha256", "fileSizeBytes")
    }:
        raise ValueError("GAP 實際 bytes 與 GAD 封存物件摘要不一致。")
    _, gtv = _read_closed_zip(archive_raw, openssl_path, verify_gtv=verify_gtv)
    if gtv is not None and (
        gtv["verificationFingerprint"] != request["source"]["gtvVerificationFingerprint"]
        or gtv["verifiedAt"] != request["source"]["gtvVerifiedAt"]
        or gtv["timestamp"]["genTime"] != request["source"]["timestampGenTime"]
        or gtv["timestamp"]["policyIdentifier"] != request["source"]["timestampPolicyIdentifier"]
    ):
        raise ValueError("GAD 的 GTV 來源摘要與 GAP 內實際 GTV 不一致。")
    _assert_closed_directory(directory, expected_names, "GAD 請求包")
    return request, request_path, archive_path, {"request": request_raw, "archiveObject": archive_raw}, gtv


def build_archive_provider_receipt(
    request: dict[str, Any],
    *,
    private_key: Ed25519PrivateKey,
    archive_object_id: str,
    version_id: str,
    stored_at: str,
    retention_until: str,
    legal_hold_status: str,
    signed_at: str | None = None,
) -> dict[str, Any]:
    validated_request = validate_archive_request(request)
    requirements = validated_request["requirements"]
    stored = _iso(stored_at, "GAR 入庫時間")
    signed = _iso(signed_at or _now_iso(), "GAR 簽發時間")
    retention = _iso(retention_until, "GAR 保留期限")
    if legal_hold_status not in LEGAL_HOLD_STATUSES:
        raise ValueError("GAR legal hold 狀態不受支援。")
    public_key = private_key.public_key()
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIPT_KIND,
        "receiptContext": RECEIPT_CONTEXT,
        "requestFingerprint": validated_request["requestFingerprint"],
        "requestId": validated_request["requestId"],
        "archiveObject": validated_request["archiveObject"],
        "provider": {
            "organization": requirements["providerOrganization"],
            "repositoryId": requirements["repositoryId"],
            "archiveObjectId": _identifier(archive_object_id, "外部封存物件識別碼"),
            "versionId": _identifier(version_id, "外部不可變版本識別碼"),
        },
        "storage": {
            "status": "stored",
            "storedAt": stored,
            "immutabilityMode": requirements["immutabilityMode"],
            "retentionPolicyId": requirements["retentionPolicyId"],
            "retentionUntil": retention,
            "legalHoldStatus": legal_hold_status,
        },
        "signature": {
            "schemaVersion": 1,
            "algorithm": "Ed25519",
            "keyId": _provider_key_id(public_key),
            "signedAt": signed,
        },
    }
    record["receiptFingerprint"] = archive_receipt_fingerprint(record)
    record["signature"]["value"] = base64.b64encode(private_key.sign(_receipt_signature_payload(record))).decode("ascii")
    validated = validate_archive_provider_receipt(record)
    _validate_request_compliance(validated_request, validated)
    return validated


def validate_archive_provider_receipt(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "receiptContext", "requestFingerprint", "requestId",
        "archiveObject", "provider", "storage", "signature", "receiptFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GAR 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != RECEIPT_KIND or value.get("receiptContext") != RECEIPT_CONTEXT:
        raise ValueError("GAR 版本、種類或內容脈絡不受支援。")
    if not re.fullmatch(r"GAD-[0-9A-F]{20}", str(value.get("requestFingerprint", ""))):
        raise ValueError("GAR 的 GAD 指紋格式不正確。")
    if not re.fullmatch(r"GADR-[0-9A-F]{32}", str(value.get("requestId", ""))):
        raise ValueError("GAR requestId 格式不正確。")
    archive_object = _archive_object(value.get("archiveObject"), "GAR")
    provider = value.get("provider")
    if not isinstance(provider, dict) or set(provider) != {"organization", "repositoryId", "archiveObjectId", "versionId"}:
        raise ValueError("GAR 缺少封閉的外部保存端識別資料。")
    normalized_provider = {
        "organization": _text(provider.get("organization"), "外部保存端組織", maximum=200),
        "repositoryId": _identifier(provider.get("repositoryId"), "外部保存庫識別碼"),
        "archiveObjectId": _identifier(provider.get("archiveObjectId"), "外部封存物件識別碼"),
        "versionId": _identifier(provider.get("versionId"), "外部不可變版本識別碼"),
    }
    storage = value.get("storage")
    if not isinstance(storage, dict) or set(storage) != {
        "status", "storedAt", "immutabilityMode", "retentionPolicyId",
        "retentionUntil", "legalHoldStatus",
    }:
        raise ValueError("GAR 缺少封閉的保存狀態。")
    if (
        storage.get("status") != "stored"
        or storage.get("immutabilityMode") not in IMMUTABILITY_MODES
        or storage.get("legalHoldStatus") not in LEGAL_HOLD_STATUSES
    ):
        raise ValueError("GAR 保存狀態不受支援。")
    normalized_storage = {
        "status": "stored",
        "storedAt": _iso(storage.get("storedAt"), "GAR 入庫時間"),
        "immutabilityMode": storage["immutabilityMode"],
        "retentionPolicyId": _identifier(storage.get("retentionPolicyId"), "外部保存政策識別碼"),
        "retentionUntil": _iso(storage.get("retentionUntil"), "GAR 保留期限"),
        "legalHoldStatus": storage["legalHoldStatus"],
    }
    signature = value.get("signature")
    if not isinstance(signature, dict) or set(signature) != {
        "schemaVersion", "algorithm", "keyId", "signedAt", "value"
    }:
        raise ValueError("GAR 缺少封閉的 Ed25519 簽章。")
    signed_at = _iso(signature.get("signedAt"), "GAR 簽發時間")
    signature_value = str(signature.get("value", ""))
    try:
        signature_raw = base64.b64decode(signature_value, validate=True)
    except ValueError as exc:
        raise ValueError("GAR 簽章不是有效 Base64。") from exc
    if (
        signature.get("schemaVersion") != 1
        or signature.get("algorithm") != "Ed25519"
        or not re.fullmatch(r"AKI-[0-9A-F]{20}", str(signature.get("keyId", "")))
        or len(signature_raw) != 64
    ):
        raise ValueError("GAR Ed25519 簽章欄位不完整。")
    normalized_signature = {
        "schemaVersion": 1,
        "algorithm": "Ed25519",
        "keyId": signature["keyId"],
        "signedAt": signed_at,
        "value": signature_value,
    }
    fingerprint = str(value.get("receiptFingerprint", ""))
    if not re.fullmatch(r"GAR-[0-9A-F]{20}", fingerprint) or fingerprint != archive_receipt_fingerprint(value):
        raise ValueError("GAR 指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["archiveObject"] = archive_object
    normalized["provider"] = normalized_provider
    normalized["storage"] = normalized_storage
    normalized["signature"] = normalized_signature
    return normalized


def verify_archive_provider_signature(receipt: dict[str, Any], public_key: Ed25519PublicKey) -> dict[str, Any]:
    validated = validate_archive_provider_receipt(receipt)
    if validated["signature"]["keyId"] != _provider_key_id(public_key):
        raise ValueError("GAR 簽章 keyId 與明確選取的外部保存端公開金鑰不一致。")
    try:
        signature = base64.b64decode(validated["signature"]["value"], validate=True)
        public_key.verify(signature, _receipt_signature_payload(validated))
    except (InvalidSignature, ValueError) as exc:
        raise ValueError("GAR 外部保存端 Ed25519 簽章驗證失敗。") from exc
    return validated


def _validate_request_compliance(request: dict[str, Any], receipt: dict[str, Any]) -> None:
    if (
        receipt["requestFingerprint"] != request["requestFingerprint"]
        or receipt["requestId"] != request["requestId"]
        or receipt["archiveObject"] != request["archiveObject"]
    ):
        raise ValueError("GAR 與 GAD 請求或封存物件不一致。")
    requirements = request["requirements"]
    if (
        receipt["provider"]["organization"] != requirements["providerOrganization"]
        or receipt["provider"]["repositoryId"] != requirements["repositoryId"]
        or receipt["storage"]["status"] != requirements["storageStatus"]
        or receipt["storage"]["immutabilityMode"] != requirements["immutabilityMode"]
        or receipt["storage"]["retentionPolicyId"] != requirements["retentionPolicyId"]
    ):
        raise ValueError("GAR 未滿足指定保存端、保存庫、狀態、不可變模式或保存政策。")
    if _utc_datetime(receipt["storage"]["storedAt"], "GAR 入庫時間") < _utc_datetime(request["createdAt"], "GAD 建立時間"):
        raise ValueError("GAR 入庫時間早於 GAD 請求建立時間。")
    if _utc_datetime(receipt["signature"]["signedAt"], "GAR 簽發時間") < _utc_datetime(receipt["storage"]["storedAt"], "GAR 入庫時間"):
        raise ValueError("GAR 簽發時間早於入庫時間。")
    if _utc_datetime(receipt["storage"]["retentionUntil"], "GAR 保留期限") < _utc_datetime(requirements["retentionUntil"], "GAD 保留期限"):
        raise ValueError("GAR 實際保留期限短於 GAD 要求。")
    if requirements["legalHoldRequired"] and receipt["storage"]["legalHoldStatus"] != "active":
        raise ValueError("GAD 要求 legal hold，但 GAR 未證明狀態為 active。")


def issue_archive_provider_receipt(
    *,
    prepared_directory: Path,
    private_key_path: Path,
    archive_object_id: str,
    version_id: str,
    stored_at: str,
    retention_until: str,
    legal_hold_status: str,
    output_directory: Path | None = None,
    signed_at: str | None = None,
    private_key_password_env: str | None = None,
) -> dict[str, Any]:
    request, _, _, _, _ = _load_prepared_request(
        prepared_directory,
        openssl_path=None,
        verify_gtv=False,
    )
    private_key = _load_private_key(private_key_path, private_key_password_env)
    receipt = build_archive_provider_receipt(
        request,
        private_key=private_key,
        archive_object_id=archive_object_id,
        version_id=version_id,
        stored_at=stored_at,
        retention_until=retention_until,
        legal_hold_status=legal_hold_status,
        signed_at=signed_at,
    )
    destination = output_directory or prepared_directory.parent / f"GAR-外部歸檔簽章收據包-{receipt['receiptFingerprint']}"
    if destination.exists():
        raise ValueError("GAR 收據輸出目錄已存在；本工具不會覆寫。")
    receipt_name = f"GAR-外部歸檔簽章收據-{receipt['receiptFingerprint']}.json"
    public_name = f"GAR-provider-public-key-{receipt['signature']['keyId']}.pem"
    destination.mkdir(parents=False, exist_ok=False)
    try:
        _copy_exclusive((json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / receipt_name)
        _copy_exclusive(_public_key_pem(private_key.public_key()), destination / public_name)
        _assert_closed_directory(destination, {receipt_name.casefold(), public_name.casefold()}, "GAR 收據包")
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "receiptPath": str((destination / receipt_name).resolve()),
        "providerPublicKeyPath": str((destination / public_name).resolve()),
        "receiptFingerprint": receipt["receiptFingerprint"],
        "providerKeyId": receipt["signature"]["keyId"],
    }


def build_archive_verification_receipt(
    *,
    request: dict[str, Any],
    provider_receipt: dict[str, Any],
    source_files: dict[str, dict[str, Any]],
    provider_key_approval_basis: str,
    verified_at: str | None = None,
) -> dict[str, Any]:
    expected_sources = {
        "request", "archiveObject", "providerReceipt", "providerPublicKey",
        "providerKeyApprovalEvidence",
    }
    if set(source_files) != expected_sources:
        raise ValueError("GAV 來源檔集合不完整。")
    normalized_sources = {key: _validate_summary(item, f"GAV {key}") for key, item in source_files.items()}
    portable = [unicodedata.normalize("NFC", item["fileName"]).casefold() for item in normalized_sources.values()]
    if len(portable) != len(set(portable)):
        raise ValueError("GAV 來源檔名衝突。")
    basis = _text(provider_key_approval_basis, "外部保存端金鑰核定依據", maximum=500)
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": VERIFICATION_KIND,
        "verificationContext": VERIFICATION_CONTEXT,
        "verifiedAt": _iso(verified_at or _now_iso(), "GAV 驗證時間"),
        "sourceFiles": normalized_sources,
        "source": request["source"],
        "archive": {
            "requestFingerprint": request["requestFingerprint"],
            "receiptFingerprint": provider_receipt["receiptFingerprint"],
            "providerKeyId": provider_receipt["signature"]["keyId"],
            "providerOrganization": provider_receipt["provider"]["organization"],
            "repositoryId": provider_receipt["provider"]["repositoryId"],
            "archiveObjectId": provider_receipt["provider"]["archiveObjectId"],
            "versionId": provider_receipt["provider"]["versionId"],
            "storedAt": provider_receipt["storage"]["storedAt"],
            "immutabilityMode": provider_receipt["storage"]["immutabilityMode"],
            "retentionPolicyId": provider_receipt["storage"]["retentionPolicyId"],
            "retentionUntil": provider_receipt["storage"]["retentionUntil"],
            "legalHoldStatus": provider_receipt["storage"]["legalHoldStatus"],
            "providerKeyApprovalBasis": basis,
        },
        "summary": {
            "integrityStatus": "valid",
            "providerSignatureStatus": "valid-explicitly-selected-key",
            "requestComplianceStatus": "fulfilled",
            "storageEvidenceStatus": "provider-signed-attestation-valid",
        },
        "boundary": VERIFICATION_BOUNDARY,
    }
    record["verificationFingerprint"] = archive_verification_fingerprint(record)
    return validate_archive_verification_receipt(record)


def validate_archive_verification_receipt(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "verificationContext", "verifiedAt", "sourceFiles",
        "source", "archive", "summary", "boundary", "verificationFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GAV 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != VERIFICATION_KIND or value.get("verificationContext") != VERIFICATION_CONTEXT:
        raise ValueError("GAV 版本、種類或內容脈絡不受支援。")
    verified = _iso(value.get("verifiedAt"), "GAV 驗證時間")
    files = value.get("sourceFiles")
    if not isinstance(files, dict) or set(files) != {
        "request", "archiveObject", "providerReceipt", "providerPublicKey",
        "providerKeyApprovalEvidence",
    }:
        raise ValueError("GAV 缺少封閉的來源檔摘要。")
    normalized_files = {key: _validate_summary(item, f"GAV {key}") for key, item in files.items()}
    portable = [unicodedata.normalize("NFC", item["fileName"]).casefold() for item in normalized_files.values()]
    if len(portable) != len(set(portable)):
        raise ValueError("GAV 來源檔名衝突。")
    source = value.get("source")
    if not isinstance(source, dict) or set(source) != {
        "gtvVerificationFingerprint", "gtvVerifiedAt", "timestampGenTime", "timestampPolicyIdentifier"
    } or not re.fullmatch(r"GTV-[0-9A-F]{20}", str(source.get("gtvVerificationFingerprint", ""))):
        raise ValueError("GAV 的 GTV 來源摘要不正確。")
    archive = value.get("archive")
    if not isinstance(archive, dict) or set(archive) != {
        "requestFingerprint", "receiptFingerprint", "providerKeyId", "providerOrganization",
        "repositoryId", "archiveObjectId", "versionId", "storedAt", "immutabilityMode",
        "retentionPolicyId", "retentionUntil", "legalHoldStatus", "providerKeyApprovalBasis",
    }:
        raise ValueError("GAV 缺少封閉的外部保存摘要。")
    if (
        not re.fullmatch(r"GAD-[0-9A-F]{20}", str(archive.get("requestFingerprint", "")))
        or not re.fullmatch(r"GAR-[0-9A-F]{20}", str(archive.get("receiptFingerprint", "")))
        or not re.fullmatch(r"AKI-[0-9A-F]{20}", str(archive.get("providerKeyId", "")))
        or archive.get("immutabilityMode") not in IMMUTABILITY_MODES
        or archive.get("legalHoldStatus") not in LEGAL_HOLD_STATUSES
    ):
        raise ValueError("GAV 外部保存摘要狀態不正確。")
    normalized_archive = {
        **archive,
        "providerOrganization": _text(archive.get("providerOrganization"), "外部保存端組織", maximum=200),
        "repositoryId": _identifier(archive.get("repositoryId"), "外部保存庫識別碼"),
        "archiveObjectId": _identifier(archive.get("archiveObjectId"), "外部封存物件識別碼"),
        "versionId": _identifier(archive.get("versionId"), "外部不可變版本識別碼"),
        "storedAt": _iso(archive.get("storedAt"), "GAV 入庫時間"),
        "retentionPolicyId": _identifier(archive.get("retentionPolicyId"), "外部保存政策識別碼"),
        "retentionUntil": _iso(archive.get("retentionUntil"), "GAV 保留期限"),
        "providerKeyApprovalBasis": _text(archive.get("providerKeyApprovalBasis"), "外部保存端金鑰核定依據", maximum=500),
    }
    if value.get("summary") != {
        "integrityStatus": "valid",
        "providerSignatureStatus": "valid-explicitly-selected-key",
        "requestComplianceStatus": "fulfilled",
        "storageEvidenceStatus": "provider-signed-attestation-valid",
    }:
        raise ValueError("GAV 結論與外部保存收據驗證結果不一致。")
    if value.get("boundary") != VERIFICATION_BOUNDARY:
        raise ValueError("GAV 未保留外部保存責任邊界。")
    fingerprint = str(value.get("verificationFingerprint", ""))
    if not re.fullmatch(r"GAV-[0-9A-F]{20}", fingerprint) or fingerprint != archive_verification_fingerprint(value):
        raise ValueError("GAV 指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["verifiedAt"] = verified
    normalized["sourceFiles"] = normalized_files
    normalized["archive"] = normalized_archive
    return normalized


def finalize_archive_verification_package(
    *,
    prepared_directory: Path,
    provider_receipt_path: Path,
    provider_public_key_path: Path,
    provider_key_approval_evidence_path: Path,
    provider_key_approval_basis: str,
    output_directory: Path | None = None,
    openssl_path: Path | None = None,
    verified_at: str | None = None,
) -> dict[str, Any]:
    openssl = find_openssl(openssl_path)
    request, request_path, archive_path, prepared_raw, gtv = _load_prepared_request(
        prepared_directory,
        openssl_path=openssl,
        verify_gtv=True,
    )
    receipt_raw = _read_bytes(provider_receipt_path, max_bytes=MAX_JSON_BYTES, label="GAR")
    public_raw = _read_bytes(provider_public_key_path, max_bytes=100_000, label="外部保存端公開金鑰")
    approval_raw = _read_bytes(
        provider_key_approval_evidence_path,
        max_bytes=MAX_BINARY_BYTES,
        label="外部保存端金鑰核定證據",
    )
    _validate_approval_evidence(approval_raw, provider_key_approval_evidence_path.name)
    if approval_raw in {public_raw, receipt_raw, prepared_raw["request"], prepared_raw["archiveObject"]}:
        raise ValueError("外部保存端金鑰核定證據必須是獨立文件，不得以公開金鑰或其他來源檔充數。")
    receipt = validate_archive_provider_receipt(_json_from_bytes(receipt_raw, "GAR"))
    public_key = _load_public_key_bytes(public_raw)
    receipt = verify_archive_provider_signature(receipt, public_key)
    _validate_request_compliance(request, receipt)
    if gtv is None:
        raise ValueError("GAD 缺少可驗證的 GTV。")
    raw_files = {
        "request": (request_path.name, prepared_raw["request"]),
        "archiveObject": (archive_path.name, prepared_raw["archiveObject"]),
        "providerReceipt": (provider_receipt_path.name, receipt_raw),
        "providerPublicKey": (provider_public_key_path.name, public_raw),
        "providerKeyApprovalEvidence": (provider_key_approval_evidence_path.name, approval_raw),
    }
    names = [unicodedata.normalize("NFC", name).casefold() for name, _ in raw_files.values()]
    if len(names) != len(set(names)):
        raise ValueError("GAV 來源檔名衝突。")
    verification = build_archive_verification_receipt(
        request=request,
        provider_receipt=receipt,
        source_files={key: _summary(name, raw) for key, (name, raw) in raw_files.items()},
        provider_key_approval_basis=provider_key_approval_basis,
        verified_at=verified_at,
    )
    destination = output_directory or prepared_directory.parent / f"GAV-治理可信時間外部歸檔證據包-{verification['verificationFingerprint']}"
    if destination.exists():
        raise ValueError("GAV 證據包目錄已存在；為保留證據，本工具不會覆寫。")
    verification_name = f"GAV-外部歸檔驗證-{verification['verificationFingerprint']}.json"
    if verification_name.casefold() in names:
        raise ValueError("GAV 驗證收據檔名與來源衝突。")
    destination.mkdir(parents=False, exist_ok=False)
    try:
        for name, raw in raw_files.values():
            _copy_exclusive(raw, destination / name)
        _copy_exclusive((json.dumps(verification, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / verification_name)
        verified = verify_archive_verification_package(destination, openssl_path=openssl)
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "verificationFingerprint": verified["verificationFingerprint"],
        "requestFingerprint": verified["archive"]["requestFingerprint"],
        "receiptFingerprint": verified["archive"]["receiptFingerprint"],
        "archiveObjectId": verified["archive"]["archiveObjectId"],
        "retentionUntil": verified["archive"]["retentionUntil"],
    }


def verify_archive_verification_package(
    directory: Path,
    *,
    openssl_path: Path | None = None,
) -> dict[str, Any]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError("GAV 證據包必須是既有一般資料夾。")
    verification_path = _single_file(directory, "GAV-*.json", "GAV 驗證收據")
    verification_raw = _read_bytes(verification_path, max_bytes=MAX_JSON_BYTES, label="GAV")
    verification = validate_archive_verification_receipt(_json_from_bytes(verification_raw, "GAV"))
    if verification_path.name != f"GAV-外部歸檔驗證-{verification['verificationFingerprint']}.json":
        raise ValueError("GAV 驗證收據檔名與指紋不一致。")
    expected_names = {
        verification_path.name.casefold(),
        *(item["fileName"].casefold() for item in verification["sourceFiles"].values()),
    }
    _assert_closed_directory(directory, expected_names, "GAV 證據包")
    paths = {key: directory / item["fileName"] for key, item in verification["sourceFiles"].items()}
    raw_files: dict[str, bytes] = {}
    for key, path in paths.items():
        if key == "archiveObject":
            maximum = MAX_ARCHIVE_BYTES
        elif key == "providerPublicKey":
            maximum = 100_000
        elif key == "providerKeyApprovalEvidence":
            maximum = MAX_BINARY_BYTES
        else:
            maximum = MAX_JSON_BYTES
        raw = _read_bytes(path, max_bytes=maximum, label=f"GAV {key}")
        raw_files[key] = raw
        if _summary(path.name, raw) != verification["sourceFiles"][key]:
            raise ValueError(f"GAV 內 {key} 的 bytes 與驗證收據不一致。")
    _validate_approval_evidence(
        raw_files["providerKeyApprovalEvidence"],
        paths["providerKeyApprovalEvidence"].name,
    )
    if raw_files["providerKeyApprovalEvidence"] in {
        raw_files["providerPublicKey"], raw_files["providerReceipt"],
        raw_files["request"], raw_files["archiveObject"],
    }:
        raise ValueError("外部保存端金鑰核定證據必須是獨立文件，不得以公開金鑰或其他來源檔充數。")
    request = validate_archive_request(_json_from_bytes(raw_files["request"], "GAD"))
    receipt = validate_archive_provider_receipt(_json_from_bytes(raw_files["providerReceipt"], "GAR"))
    public_key = _load_public_key_bytes(raw_files["providerPublicKey"])
    verify_archive_provider_signature(receipt, public_key)
    _validate_request_compliance(request, receipt)
    if _summary(paths["archiveObject"].name, raw_files["archiveObject"]) != {
        key: request["archiveObject"][key] for key in ("fileName", "fileSha256", "fileSizeBytes")
    }:
        raise ValueError("GAV 的 GAP 實際 bytes 與 GAD 不一致。")
    openssl = find_openssl(openssl_path)
    _, gtv = _read_closed_zip(raw_files["archiveObject"], openssl, verify_gtv=True)
    if gtv is None or (
        gtv["verificationFingerprint"] != request["source"]["gtvVerificationFingerprint"]
        or gtv["verifiedAt"] != request["source"]["gtvVerifiedAt"]
        or gtv["timestamp"]["genTime"] != request["source"]["timestampGenTime"]
        or gtv["timestamp"]["policyIdentifier"] != request["source"]["timestampPolicyIdentifier"]
    ):
        raise ValueError("GAV 的 GAP 內 GTV 與 GAD 來源摘要不一致。")
    expected_archive = {
        "requestFingerprint": request["requestFingerprint"],
        "receiptFingerprint": receipt["receiptFingerprint"],
        "providerKeyId": receipt["signature"]["keyId"],
        "providerOrganization": receipt["provider"]["organization"],
        "repositoryId": receipt["provider"]["repositoryId"],
        "archiveObjectId": receipt["provider"]["archiveObjectId"],
        "versionId": receipt["provider"]["versionId"],
        "storedAt": receipt["storage"]["storedAt"],
        "immutabilityMode": receipt["storage"]["immutabilityMode"],
        "retentionPolicyId": receipt["storage"]["retentionPolicyId"],
        "retentionUntil": receipt["storage"]["retentionUntil"],
        "legalHoldStatus": receipt["storage"]["legalHoldStatus"],
        "providerKeyApprovalBasis": verification["archive"]["providerKeyApprovalBasis"],
    }
    if verification["source"] != request["source"] or verification["archive"] != expected_archive:
        raise ValueError("GAV 摘要與實際 GAD／GAR／公開金鑰不一致。")
    if _read_bytes(verification_path, max_bytes=MAX_JSON_BYTES, label="GAV") != verification_raw:
        raise ValueError("GAV 驗證收據在重驗過程中發生變更。")
    for key, path in paths.items():
        maximum = MAX_ARCHIVE_BYTES if key == "archiveObject" else MAX_BINARY_BYTES
        if key in {"request", "providerReceipt"}:
            maximum = MAX_JSON_BYTES
        elif key == "providerPublicKey":
            maximum = 100_000
        if _read_bytes(path, max_bytes=maximum, label=f"GAV {key}") != raw_files[key]:
            raise ValueError(f"GAV 內 {key} 在重驗過程中發生變更。")
    _assert_closed_directory(directory, expected_names, "GAV 證據包")
    return verification


def main() -> int:
    parser = argparse.ArgumentParser(description="建立或驗證 GTV 的外部 DMS/WORM 歸檔簽章收據證據包。")
    parser.add_argument("--openssl", type=Path, help="可選：OpenSSL 可執行檔路徑")
    commands = parser.add_subparsers(dest="command", required=True)

    prepare = commands.add_parser("prepare", help="建立 GAD 外部歸檔請求包與單一 GAP ZIP")
    prepare.add_argument("--gtv-package", required=True, type=Path)
    prepare.add_argument("--provider-organization", required=True)
    prepare.add_argument("--repository-id", required=True)
    prepare.add_argument("--immutability-mode", required=True, choices=sorted(IMMUTABILITY_MODES))
    prepare.add_argument("--retention-policy-id", required=True)
    prepare.add_argument("--retention-until", required=True)
    prepare.add_argument("--require-legal-hold", action="store_true")
    prepare.add_argument("--output-directory", type=Path)

    issue = commands.add_parser("issue-receipt", help="供外部保存端於實際入庫後簽發 GAR 收據")
    issue.add_argument("--prepared-directory", required=True, type=Path)
    issue.add_argument("--private-key", required=True, type=Path)
    issue.add_argument("--private-key-password-env")
    issue.add_argument("--archive-object-id", required=True)
    issue.add_argument("--version-id", required=True)
    issue.add_argument("--stored-at", required=True)
    issue.add_argument("--retention-until", required=True)
    issue.add_argument("--legal-hold-status", required=True, choices=sorted(LEGAL_HOLD_STATUSES))
    issue.add_argument("--signed-at")
    issue.add_argument("--output-directory", type=Path)

    finalize = commands.add_parser("finalize", help="驗證 GAR 並建立完整 GAV 外部歸檔證據包")
    finalize.add_argument("--prepared-directory", required=True, type=Path)
    finalize.add_argument("--provider-receipt", required=True, type=Path)
    finalize.add_argument("--provider-public-key", required=True, type=Path)
    finalize.add_argument("--provider-key-approval-evidence", required=True, type=Path)
    finalize.add_argument("--provider-key-approval-basis", required=True)
    finalize.add_argument("--output-directory", type=Path)

    verify = commands.add_parser("verify", help="唯讀重驗完整 GAV 證據包")
    verify.add_argument("--package", required=True, type=Path)

    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = prepare_archive_request(
                gtv_package=args.gtv_package,
                provider_organization=args.provider_organization,
                repository_id=args.repository_id,
                immutability_mode=args.immutability_mode,
                retention_policy_id=args.retention_policy_id,
                retention_until=args.retention_until,
                legal_hold_required=args.require_legal_hold,
                output_directory=args.output_directory,
                openssl_path=args.openssl,
            )
        elif args.command == "issue-receipt":
            result = issue_archive_provider_receipt(
                prepared_directory=args.prepared_directory,
                private_key_path=args.private_key,
                private_key_password_env=args.private_key_password_env,
                archive_object_id=args.archive_object_id,
                version_id=args.version_id,
                stored_at=args.stored_at,
                retention_until=args.retention_until,
                legal_hold_status=args.legal_hold_status,
                signed_at=args.signed_at,
                output_directory=args.output_directory,
            )
        elif args.command == "finalize":
            result = finalize_archive_verification_package(
                prepared_directory=args.prepared_directory,
                provider_receipt_path=args.provider_receipt,
                provider_public_key_path=args.provider_public_key,
                provider_key_approval_evidence_path=args.provider_key_approval_evidence,
                provider_key_approval_basis=args.provider_key_approval_basis,
                output_directory=args.output_directory,
                openssl_path=args.openssl,
            )
        else:
            result = verify_archive_verification_package(args.package, openssl_path=args.openssl)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
