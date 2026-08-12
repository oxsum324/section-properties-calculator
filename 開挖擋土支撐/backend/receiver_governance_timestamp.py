from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Any
import unicodedata

from .verify_receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_verification_receipt,
    validate_receiver_governance_checkpoint_verification_receipt,
)


ARCHIVE_SCHEMA_VERSION = 1
ARCHIVE_KIND = "receiver-governance-checkpoint-rfc3161-archive-manifest"
ARCHIVE_CONTEXT = "receiver-governance-checkpoint-rfc3161-archive-v1"
TIMESTAMP_RECEIPT_KIND = "receiver-governance-checkpoint-rfc3161-verification-receipt"
ARCHIVE_BOUNDARY = {
    "localCreatedAtIsNotTrustedTime": True,
    "requiresExternalRfc3161Response": True,
    "doesNotSubmitToTimestampAuthority": True,
    "doesNotVerifyExternalStorage": True,
    "doesNotConstituteEngineeringApproval": True,
    "formalCalculationAttachment": False,
}
TIMESTAMP_BOUNDARY = {
    "independentOfflineValidation": True,
    "noServiceRequired": True,
    "noProjectDatabaseRequired": True,
    "noPrivateKeysAcceptedOrRetained": True,
    "privateKeyMaterialRejected": True,
    "timestampBindsManifestAndReferencedFileHashes": True,
    "timestampEstablishesExistenceByGenTimeOnlyWhenTsaTrustAndPolicyAreAccepted": True,
    "tsaTrustAnchorIsUserSelected": True,
    "tsaRevocationStatusNotEstablished": True,
    "doesNotVerifyExternalStorage": True,
    "doesNotConstituteEngineeringApproval": True,
    "verificationReceiptIsNotStandaloneProof": True,
    "requiresCompletePackageForRevalidation": True,
    "formalCalculationAttachment": False,
}
EVIDENCE_KEYS = {
    "verificationReceipt",
    "checkpoint",
    "trustRegistryBackup",
    "currentHistoryExport",
}
MAX_JSON_BYTES = 5_000_000
MAX_BINARY_BYTES = 20_000_000


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _fingerprint(prefix: str, record: dict[str, Any], field: str) -> str:
    payload = {key: value for key, value in record.items() if key != field}
    return f"{prefix}-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def archive_manifest_fingerprint(record: dict[str, Any]) -> str:
    return _fingerprint("GAM", record, "manifestFingerprint")


def timestamp_verification_fingerprint(record: dict[str, Any]) -> str:
    return _fingerprint("GTV", record, "verificationFingerprint")


def _iso(value: Any, label: str) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label}不是有效 ISO 8601 日期時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{label}必須包含時區。")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_file_name(value: Any, label: str) -> str:
    name = str(value or "")
    reserved_stem = name.split(".", 1)[0].upper()
    if (
        not name
        or name != name.strip()
        or len(name) > 180
        or Path(name).name != name
        or "/" in name
        or "\\" in name
        or name in {".", ".."}
        or name != unicodedata.normalize("NFC", name)
        or name.endswith((" ", "."))
        or any(ord(character) < 32 or character in '<>:"|?*' for character in name)
        or reserved_stem in {"CON", "PRN", "AUX", "NUL"}
        or re.fullmatch(r"(?:COM|LPT)[1-9]", reserved_stem) is not None
    ):
        raise ValueError(f"{label}檔名不安全。")
    return name


def _summary(name: str, raw: bytes) -> dict[str, Any]:
    return {
        "fileName": _safe_file_name(name, "來源"),
        "fileSha256": hashlib.sha256(raw).hexdigest(),
        "fileSizeBytes": len(raw),
    }


def _validate_summary(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"fileName", "fileSha256", "fileSizeBytes"}:
        raise ValueError(f"{label}檔案摘要格式不正確。")
    name = _safe_file_name(value.get("fileName"), label)
    digest = str(value.get("fileSha256", ""))
    size = value.get("fileSizeBytes")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError(f"{label} SHA-256 格式不正確。")
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise ValueError(f"{label}檔案大小不正確。")
    return {"fileName": name, "fileSha256": digest, "fileSizeBytes": size}


def _read_bytes(path: Path, *, max_bytes: int, label: str) -> bytes:
    is_junction = getattr(path, "is_junction", lambda: False)
    if path.is_symlink() or is_junction() or not path.is_file():
        raise ValueError(f"{label}必須是既有一般檔案。")
    raw = path.read_bytes()
    if not raw or len(raw) > max_bytes:
        raise ValueError(f"{label}必須是 1 至 {max_bytes} bytes。")
    return raw


def _validate_public_certificate_bundle(raw: bytes, label: str) -> None:
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{label}必須是純 PEM 公開憑證包。") from exc
    pattern = re.compile(
        r"-----BEGIN (?:TRUSTED )?CERTIFICATE-----\s+"
        r"[A-Za-z0-9+/=\r\n]+"
        r"-----END (?:TRUSTED )?CERTIFICATE-----",
        re.MULTILINE,
    )
    blocks = pattern.findall(text)
    residual = pattern.sub("", text).strip()
    if not blocks or residual:
        raise ValueError(f"{label}只能包含 PEM 公開憑證，不得包含私鑰或其他資料。")


def _json_from_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label}不是有效 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label}最外層必須是 JSON 物件。")
    return value


def _validate_unique_names(items: dict[str, dict[str, Any]]) -> None:
    names = [unicodedata.normalize("NFC", item["fileName"]).casefold() for item in items.values()]
    if len(names) != len(set(names)):
        raise ValueError("治理可信時間證據包含不分大小寫重複檔名。")


def build_archive_manifest(
    verification_receipt: dict[str, Any],
    *,
    evidence_files: dict[str, dict[str, Any]],
    created_at: str | None = None,
) -> dict[str, Any]:
    receipt = validate_receiver_governance_checkpoint_verification_receipt(verification_receipt)
    expected_keys = {"verificationReceipt", *receipt["sourceFiles"].keys()}
    if set(evidence_files) != expected_keys or not set(evidence_files) <= EVIDENCE_KEYS:
        raise ValueError("GAM 證據檔集合與 GCV 所列來源不一致。")
    normalized_files = {
        key: _validate_summary(value, f"GAM {key}")
        for key, value in evidence_files.items()
    }
    _validate_unique_names(normalized_files)
    manifest: dict[str, Any] = {
        "schemaVersion": ARCHIVE_SCHEMA_VERSION,
        "kind": ARCHIVE_KIND,
        "archiveContext": ARCHIVE_CONTEXT,
        "createdAt": _iso(created_at or _now_iso(), "GAM 建立時間"),
        "evidenceFiles": normalized_files,
        "checkpointSummary": {
            "verificationFingerprint": receipt["verificationFingerprint"],
            "checkpointFingerprint": receipt["checkpoint"]["checkpointFingerprint"],
            "requestFingerprint": receipt["checkpoint"]["requestFingerprint"],
            "historyExportFingerprint": receipt["checkpoint"]["exportFingerprint"],
            "integrityStatus": receipt["summary"]["integrityStatus"],
            "trustStatus": receipt["summary"]["trustStatus"],
            "historyStatus": receipt["summary"]["historyStatus"],
            "anchorStatus": receipt["summary"]["anchorStatus"],
        },
        "timestampRequest": {
            "standard": "RFC 3161",
            "messageImprintAlgorithm": "sha256",
            "nonceRequired": True,
            "tsaCertificateRequested": True,
        },
        "boundary": ARCHIVE_BOUNDARY,
    }
    manifest["manifestFingerprint"] = archive_manifest_fingerprint(manifest)
    return validate_archive_manifest(manifest)


def validate_archive_manifest(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "archiveContext", "createdAt", "evidenceFiles",
        "checkpointSummary", "timestampRequest", "boundary", "manifestFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GAM 格式不正確或含有未識別欄位。")
    if (
        value.get("schemaVersion") != ARCHIVE_SCHEMA_VERSION
        or value.get("kind") != ARCHIVE_KIND
        or value.get("archiveContext") != ARCHIVE_CONTEXT
    ):
        raise ValueError("GAM 版本、種類或內容脈絡不受支援。")
    _iso(value.get("createdAt"), "GAM 建立時間")
    files = value.get("evidenceFiles")
    if not isinstance(files, dict) or not {"verificationReceipt", "checkpoint"} <= set(files):
        raise ValueError("GAM 缺少 GCV 或 GHC 證據檔。")
    if not set(files) <= EVIDENCE_KEYS:
        raise ValueError("GAM 含有未識別證據檔角色。")
    normalized_files = {key: _validate_summary(item, f"GAM {key}") for key, item in files.items()}
    _validate_unique_names(normalized_files)
    summary = value.get("checkpointSummary")
    if not isinstance(summary, dict) or set(summary) != {
        "verificationFingerprint", "checkpointFingerprint", "requestFingerprint",
        "historyExportFingerprint", "integrityStatus", "trustStatus", "historyStatus",
        "anchorStatus",
    }:
        raise ValueError("GAM 缺少封閉的治理檢核摘要。")
    for field, pattern in {
        "verificationFingerprint": r"GCV-[0-9A-F]{20}",
        "checkpointFingerprint": r"GHC-[0-9A-F]{20}",
        "requestFingerprint": r"GCR-[0-9A-F]{20}",
        "historyExportFingerprint": r"GHE-[0-9A-F]{20}",
    }.items():
        if not re.fullmatch(pattern, str(summary.get(field, ""))):
            raise ValueError("GAM 治理檢核摘要指紋不正確。")
    if summary.get("integrityStatus") != "valid":
        raise ValueError("GAM 只能封裝完整性驗證通過的 GCV。")
    request = value.get("timestampRequest")
    if request != {
        "standard": "RFC 3161",
        "messageImprintAlgorithm": "sha256",
        "nonceRequired": True,
        "tsaCertificateRequested": True,
    }:
        raise ValueError("GAM 未保留固定 RFC 3161 SHA-256 查詢條件。")
    if value.get("boundary") != ARCHIVE_BOUNDARY:
        raise ValueError("GAM 未保留治理可信時間責任邊界。")
    fingerprint = str(value.get("manifestFingerprint", ""))
    if not re.fullmatch(r"GAM-[0-9A-F]{20}", fingerprint) or fingerprint != archive_manifest_fingerprint(value):
        raise ValueError("GAM 整包指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["createdAt"] = _iso(value["createdAt"], "GAM 建立時間")
    normalized["evidenceFiles"] = normalized_files
    return normalized


def _revalidate_evidence_bytes(
    raw_files: dict[str, bytes],
    file_names: dict[str, str],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    if set(raw_files) != set(file_names) or not {"verificationReceipt", "checkpoint"} <= set(raw_files):
        raise ValueError("治理可信時間證據來源集合不完整。")
    summaries = {key: _summary(file_names[key], raw) for key, raw in raw_files.items()}
    _validate_unique_names(summaries)
    receipt = validate_receiver_governance_checkpoint_verification_receipt(
        _json_from_bytes(raw_files["verificationReceipt"], "GCV")
    )
    expected_optional = set(receipt["sourceFiles"]) - {"checkpoint"}
    if set(raw_files) - {"verificationReceipt", "checkpoint"} != expected_optional:
        raise ValueError("選取的 RTB／目前 GHE 與 GCV 所列來源集合不一致。")
    for key, source in receipt["sourceFiles"].items():
        actual = summaries[key]
        if source["fileName"] != actual["fileName"] or source["fileSha256"] != actual["fileSha256"]:
            raise ValueError(f"{key} 檔名或 SHA-256 與 GCV 不一致。")
    checkpoint = _json_from_bytes(raw_files["checkpoint"], "GHC")
    trust_backup = (
        _json_from_bytes(raw_files["trustRegistryBackup"], "RTB")
        if "trustRegistryBackup" in raw_files else None
    )
    current_history = (
        _json_from_bytes(raw_files["currentHistoryExport"], "目前 GHE")
        if "currentHistoryExport" in raw_files else None
    )
    source_files = {
        key: {"fileName": item["fileName"], "fileSha256": item["fileSha256"]}
        for key, item in summaries.items() if key != "verificationReceipt"
    }
    rebuilt = build_receiver_governance_checkpoint_verification_receipt(
        checkpoint,
        source_files=source_files,
        trust_registry_backup=trust_backup,
        current_history_export=current_history,
        verified_at=receipt["verifiedAt"],
    )
    if rebuilt != receipt:
        raise ValueError("GCV 無法由所選來源檔完整重建。")
    return receipt, summaries


def _load_and_revalidate_evidence(
    *,
    verification_receipt_path: Path,
    checkpoint_path: Path,
    trust_backup_path: Path | None,
    current_history_path: Path | None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, bytes]]:
    paths: dict[str, Path] = {
        "verificationReceipt": verification_receipt_path,
        "checkpoint": checkpoint_path,
    }
    if trust_backup_path:
        paths["trustRegistryBackup"] = trust_backup_path
    if current_history_path:
        paths["currentHistoryExport"] = current_history_path
    raw_files = {
        key: _read_bytes(path, max_bytes=MAX_JSON_BYTES, label=key)
        for key, path in paths.items()
    }
    receipt, summaries = _revalidate_evidence_bytes(
        raw_files,
        {key: path.name for key, path in paths.items()},
    )
    return receipt, summaries, raw_files


def find_openssl(explicit: Path | None = None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(explicit)
    else:
        discovered = shutil.which("openssl")
        if discovered:
            candidates.append(Path(discovered))
        candidates.extend([
            Path(r"C:\Program Files\Git\usr\bin\openssl.exe"),
            Path(r"C:\Program Files\Git\mingw64\bin\openssl.exe"),
        ])
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate).casefold()
        if key in seen or not candidate.is_file():
            continue
        seen.add(key)
        try:
            completed = subprocess.run(
                [str(candidate), "version"], capture_output=True, check=False,
                timeout=15, text=True, encoding="utf-8", errors="replace",
            )
        except OSError:
            continue
        if completed.returncode == 0 and completed.stdout.startswith("OpenSSL "):
            return candidate.resolve()
    raise ValueError("找不到可執行的 OpenSSL；Windows 可使用 Git for Windows 隨附版本。")


def _run_openssl(openssl: Path, arguments: list[str], label: str) -> str:
    try:
        completed = subprocess.run(
            [str(openssl), *arguments], capture_output=True, check=False,
            timeout=45, text=True, encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f"{label}無法執行 OpenSSL。") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip().splitlines()
        tail = detail[-1] if detail else "未知錯誤"
        raise ValueError(f"{label}失敗：{tail[:300]}")
    return completed.stdout


def prepare_timestamp_request(
    *,
    verification_receipt_path: Path,
    checkpoint_path: Path,
    trust_backup_path: Path | None = None,
    current_history_path: Path | None = None,
    output_directory: Path | None = None,
    openssl_path: Path | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    receipt, summaries, raw_files = _load_and_revalidate_evidence(
        verification_receipt_path=verification_receipt_path,
        checkpoint_path=checkpoint_path,
        trust_backup_path=trust_backup_path,
        current_history_path=current_history_path,
    )
    manifest = build_archive_manifest(receipt, evidence_files=summaries, created_at=created_at)
    fingerprint = manifest["manifestFingerprint"]
    destination = output_directory or verification_receipt_path.parent / f"GAM-治理檢核可信時間請求包-{fingerprint}"
    if destination.exists():
        raise ValueError("GAM 請求包目錄已存在；為保留證據，本工具不會覆寫。")
    source_resolved = {path.resolve() for path in [verification_receipt_path, checkpoint_path, trust_backup_path, current_history_path] if path}
    if destination.resolve() in source_resolved:
        raise ValueError("GAM 輸出目錄不得等於來源檔案。")
    manifest_name = f"GAM-治理檢核可信時間清單-{fingerprint}.json"
    query_name = f"GTS-RFC3161時間戳請求-{fingerprint}.tsq"
    reserved = {manifest_name.casefold(), query_name.casefold()}
    if any(item["fileName"].casefold() in reserved for item in summaries.values()):
        raise ValueError("來源檔名與 GAM／GTS 保留檔名衝突。")
    openssl = find_openssl(openssl_path)
    destination.mkdir(parents=False, exist_ok=False)
    try:
        for key, item in summaries.items():
            (destination / item["fileName"]).write_bytes(raw_files[key])
        manifest_path = destination / manifest_name
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        query_path = destination / query_name
        _run_openssl(
            openssl,
            ["ts", "-query", "-data", str(manifest_path), "-sha256", "-cert", "-out", str(query_path)],
            "RFC 3161 查詢建立",
        )
        if not query_path.is_file() or query_path.stat().st_size == 0:
            raise ValueError("OpenSSL 未產生 RFC 3161 查詢檔。")
        query_text = _run_openssl(openssl, ["ts", "-query", "-in", str(query_path), "-text"], "RFC 3161 查詢自我檢查")
        if not re.search(r"Hash Algorithm:\s*sha256\b", query_text, re.IGNORECASE):
            raise ValueError("RFC 3161 查詢未採 SHA-256。")
        if not re.search(r"Certificate required:\s*yes\b", query_text, re.IGNORECASE):
            raise ValueError("RFC 3161 查詢未要求 TSA 憑證。")
        if not re.search(r"Nonce:\s*(?!unspecified)\S+", query_text, re.IGNORECASE):
            raise ValueError("RFC 3161 查詢缺少 nonce。")
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "manifestPath": str((destination / manifest_name).resolve()),
        "queryPath": str((destination / query_name).resolve()),
        "manifestFingerprint": fingerprint,
        "verificationFingerprint": receipt["verificationFingerprint"],
    }


def _single_file(directory: Path, pattern: str, label: str) -> Path:
    matches = [path for path in directory.glob(pattern) if path.is_file()]
    if len(matches) != 1:
        raise ValueError(f"證據包必須恰有一份 {label}。")
    return matches[0]


def _assert_closed_directory(directory: Path, expected_names: set[str], label: str) -> None:
    entries = list(directory.iterdir())
    files = [path for path in entries if path.is_file()]
    actual_names = [unicodedata.normalize("NFC", path.name).casefold() for path in files]
    if (
        len(entries) != len(expected_names)
        or len(files) != len(expected_names)
        or len(actual_names) != len(set(actual_names))
        or set(actual_names) != expected_names
    ):
        raise ValueError(f"{label}包含有遺漏、額外檔案、重複可攜式檔名或子資料夾。")


def _load_prepared_package(
    directory: Path,
) -> tuple[dict[str, Any], Path, Path, dict[str, Path], dict[str, bytes]]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError("GAM 請求包必須是既有資料夾。")
    manifest_path = _single_file(directory, "GAM-*.json", "GAM 清單")
    query_path = _single_file(directory, "GTS-*.tsq", "GTS 查詢")
    manifest = validate_archive_manifest(_json_from_bytes(_read_bytes(manifest_path, max_bytes=MAX_JSON_BYTES, label="GAM"), "GAM"))
    if manifest_path.name != f"GAM-治理檢核可信時間清單-{manifest['manifestFingerprint']}.json":
        raise ValueError("GAM 清單檔名與清單指紋不一致。")
    if query_path.name != f"GTS-RFC3161時間戳請求-{manifest['manifestFingerprint']}.tsq":
        raise ValueError("GTS 查詢檔名與 GAM 指紋不一致。")
    evidence_paths = {key: directory / item["fileName"] for key, item in manifest["evidenceFiles"].items()}
    expected_names = {manifest_path.name.casefold(), query_path.name.casefold(), *(path.name.casefold() for path in evidence_paths.values())}
    _assert_closed_directory(directory, expected_names, "GAM 請求")
    raw_files = {
        key: _read_bytes(path, max_bytes=MAX_JSON_BYTES, label=key)
        for key, path in evidence_paths.items()
    }
    raw_files["archiveManifest"] = _read_bytes(manifest_path, max_bytes=MAX_JSON_BYTES, label="GAM")
    raw_files["timestampQuery"] = _read_bytes(query_path, max_bytes=MAX_BINARY_BYTES, label="GTS")
    for key, path in evidence_paths.items():
        raw = raw_files[key]
        if _summary(path.name, raw) != manifest["evidenceFiles"][key]:
            raise ValueError(f"GAM 內 {key} 的 bytes 與清單不一致。")
    _revalidate_evidence_bytes(
        {key: raw_files[key] for key in evidence_paths},
        {key: path.name for key, path in evidence_paths.items()},
    )
    _assert_closed_directory(directory, expected_names, "GAM 請求")
    return manifest, manifest_path, query_path, evidence_paths, raw_files


def _timestamp_details(text: str) -> dict[str, str]:
    def field(label: str) -> str:
        match = re.search(rf"^\s*{re.escape(label)}:\s*(.+?)\s*$", text, re.MULTILINE | re.IGNORECASE)
        if not match:
            raise ValueError(f"RFC 3161 回應缺少 {label}。")
        return match.group(1).strip()

    if not re.search(r"Status:\s*Granted\.?\s*$", text, re.MULTILINE | re.IGNORECASE):
        raise ValueError("RFC 3161 回應狀態不是 Granted。")
    algorithm = field("Hash Algorithm").lower()
    if algorithm != "sha256":
        raise ValueError("RFC 3161 回應的 message imprint 不是 SHA-256。")
    policy = field("Policy OID")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", policy):
        raise ValueError("RFC 3161 回應的 TSA policy identifier 格式不正確。")
    return {
        "status": "granted",
        "messageImprintAlgorithm": algorithm,
        "policyIdentifier": policy,
        "serialNumber": field("Serial number")[:200],
        "genTime": field("Time stamp")[:200],
    }


def build_timestamp_verification_receipt(
    manifest: dict[str, Any],
    *,
    source_files: dict[str, dict[str, Any]],
    timestamp_details: dict[str, str],
    verified_at: str | None = None,
    openssl_version: str,
) -> dict[str, Any]:
    validated_manifest = validate_archive_manifest(manifest)
    expected_keys = {
        *validated_manifest["evidenceFiles"].keys(),
        "archiveManifest", "timestampQuery", "timestampResponse", "tsaTrustAnchor",
    }
    if "tsaUntrustedChain" in source_files:
        expected_keys.add("tsaUntrustedChain")
    if set(source_files) != expected_keys:
        raise ValueError("GTV 來源檔集合不完整。")
    normalized_files = {key: _validate_summary(item, f"GTV {key}") for key, item in source_files.items()}
    _validate_unique_names(normalized_files)
    if timestamp_details.get("status") != "granted" or timestamp_details.get("messageImprintAlgorithm") != "sha256":
        raise ValueError("GTV 只能記錄已授予且採 SHA-256 的 RFC 3161 回應。")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", str(timestamp_details.get("policyIdentifier", ""))):
        raise ValueError("GTV 的 TSA policy identifier 不正確。")
    receipt: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": TIMESTAMP_RECEIPT_KIND,
        "verifiedAt": _iso(verified_at or _now_iso(), "GTV 驗證時間"),
        "sourceFiles": normalized_files,
        "archive": {
            "manifestFingerprint": validated_manifest["manifestFingerprint"],
            "verificationFingerprint": validated_manifest["checkpointSummary"]["verificationFingerprint"],
            "checkpointFingerprint": validated_manifest["checkpointSummary"]["checkpointFingerprint"],
            "anchorStatus": validated_manifest["checkpointSummary"]["anchorStatus"],
        },
        "timestamp": {
            "standard": "RFC 3161",
            "status": "trusted-timestamp-valid",
            "messageImprintAlgorithm": "sha256",
            "policyIdentifier": timestamp_details["policyIdentifier"],
            "serialNumber": str(timestamp_details.get("serialNumber", ""))[:200],
            "genTime": str(timestamp_details.get("genTime", ""))[:200],
            "queryNonceVerified": True,
            "manifestBytesVerified": True,
            "certificateChainVerifiedToSelectedTrustAnchor": True,
            "opensslVersion": str(openssl_version).strip()[:200],
        },
        "summary": {
            "integrityStatus": "valid",
            "timestampStatus": "trusted-timestamp-valid",
            "archiveStatus": "timestamped-governance-evidence-manifest",
        },
        "boundary": TIMESTAMP_BOUNDARY,
    }
    receipt["verificationFingerprint"] = timestamp_verification_fingerprint(receipt)
    return validate_timestamp_verification_receipt(receipt)


def validate_timestamp_verification_receipt(value: Any) -> dict[str, Any]:
    expected = {
        "schemaVersion", "kind", "verifiedAt", "sourceFiles", "archive",
        "timestamp", "summary", "boundary", "verificationFingerprint",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("GTV 格式不正確或含有未識別欄位。")
    if value.get("schemaVersion") != 1 or value.get("kind") != TIMESTAMP_RECEIPT_KIND:
        raise ValueError("GTV 版本或種類不受支援。")
    _iso(value.get("verifiedAt"), "GTV 驗證時間")
    files = value.get("sourceFiles")
    if not isinstance(files, dict):
        raise ValueError("GTV 缺少來源檔摘要。")
    required = {"verificationReceipt", "checkpoint", "archiveManifest", "timestampQuery", "timestampResponse", "tsaTrustAnchor"}
    if not required <= set(files) or not set(files) <= EVIDENCE_KEYS | {"archiveManifest", "timestampQuery", "timestampResponse", "tsaTrustAnchor", "tsaUntrustedChain"}:
        raise ValueError("GTV 來源檔角色不完整或含有未識別項目。")
    normalized_files = {key: _validate_summary(item, f"GTV {key}") for key, item in files.items()}
    _validate_unique_names(normalized_files)
    archive = value.get("archive")
    if not isinstance(archive, dict) or set(archive) != {"manifestFingerprint", "verificationFingerprint", "checkpointFingerprint", "anchorStatus"}:
        raise ValueError("GTV 缺少歸檔摘要。")
    for field, pattern in {
        "manifestFingerprint": r"GAM-[0-9A-F]{20}",
        "verificationFingerprint": r"GCV-[0-9A-F]{20}",
        "checkpointFingerprint": r"GHC-[0-9A-F]{20}",
    }.items():
        if not re.fullmatch(pattern, str(archive.get(field, ""))):
            raise ValueError("GTV 歸檔摘要指紋不正確。")
    timestamp = value.get("timestamp")
    if not isinstance(timestamp, dict) or set(timestamp) != {
        "standard", "status", "messageImprintAlgorithm", "policyIdentifier", "serialNumber",
        "genTime", "queryNonceVerified", "manifestBytesVerified",
        "certificateChainVerifiedToSelectedTrustAnchor", "opensslVersion",
    }:
        raise ValueError("GTV 缺少封閉的 RFC 3161 驗證結果。")
    if (
        timestamp.get("standard") != "RFC 3161"
        or timestamp.get("status") != "trusted-timestamp-valid"
        or timestamp.get("messageImprintAlgorithm") != "sha256"
        or timestamp.get("queryNonceVerified") is not True
        or timestamp.get("manifestBytesVerified") is not True
        or timestamp.get("certificateChainVerifiedToSelectedTrustAnchor") is not True
        or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", str(timestamp.get("policyIdentifier", "")))
        or not str(timestamp.get("serialNumber", "")).strip()
        or not str(timestamp.get("genTime", "")).strip()
        or not str(timestamp.get("opensslVersion", "")).startswith("OpenSSL ")
    ):
        raise ValueError("GTV 的 RFC 3161 驗證結果不完整。")
    if value.get("summary") != {
        "integrityStatus": "valid",
        "timestampStatus": "trusted-timestamp-valid",
        "archiveStatus": "timestamped-governance-evidence-manifest",
    }:
        raise ValueError("GTV 結論與 RFC 3161 驗證結果不一致。")
    if value.get("boundary") != TIMESTAMP_BOUNDARY:
        raise ValueError("GTV 未保留可信時間責任邊界。")
    fingerprint = str(value.get("verificationFingerprint", ""))
    if not re.fullmatch(r"GTV-[0-9A-F]{20}", fingerprint) or fingerprint != timestamp_verification_fingerprint(value):
        raise ValueError("GTV 整包指紋驗證失敗。")
    normalized = deepcopy(value)
    normalized["verifiedAt"] = _iso(value["verifiedAt"], "GTV 驗證時間")
    normalized["sourceFiles"] = normalized_files
    return normalized


def _verify_rfc3161(
    *,
    openssl: Path,
    manifest_path: Path,
    query_path: Path,
    response_path: Path,
    trust_anchor_path: Path,
    untrusted_chain_path: Path | None,
) -> tuple[dict[str, str], str, dict[str, bytes]]:
    snapshots = {
        "archiveManifest": _read_bytes(manifest_path, max_bytes=MAX_JSON_BYTES, label="GAM"),
        "timestampQuery": _read_bytes(query_path, max_bytes=MAX_BINARY_BYTES, label="GTS"),
        "timestampResponse": _read_bytes(response_path, max_bytes=MAX_BINARY_BYTES, label="RFC 3161 回應"),
        "tsaTrustAnchor": _read_bytes(trust_anchor_path, max_bytes=MAX_BINARY_BYTES, label="TSA 信任根"),
    }
    if untrusted_chain_path:
        snapshots["tsaUntrustedChain"] = _read_bytes(untrusted_chain_path, max_bytes=MAX_BINARY_BYTES, label="TSA 中繼憑證鏈")
    _validate_public_certificate_bundle(snapshots["tsaTrustAnchor"], "TSA 信任根")
    if "tsaUntrustedChain" in snapshots:
        _validate_public_certificate_bundle(snapshots["tsaUntrustedChain"], "TSA 中繼憑證鏈")
    with tempfile.TemporaryDirectory(prefix="ghc-rfc3161-") as directory:
        root = Path(directory)
        snapshot_paths = {
            "archiveManifest": root / "manifest.json",
            "timestampQuery": root / "request.tsq",
            "timestampResponse": root / "response.tsr",
            "tsaTrustAnchor": root / "trust-anchor.pem",
        }
        if "tsaUntrustedChain" in snapshots:
            snapshot_paths["tsaUntrustedChain"] = root / "untrusted-chain.pem"
        for key, path in snapshot_paths.items():
            path.write_bytes(snapshots[key])
        common = ["-in", str(snapshot_paths["timestampResponse"]), "-CAfile", str(snapshot_paths["tsaTrustAnchor"])]
        if "tsaUntrustedChain" in snapshot_paths:
            common.extend(["-untrusted", str(snapshot_paths["tsaUntrustedChain"])])
        _run_openssl(openssl, ["ts", "-verify", "-queryfile", str(snapshot_paths["timestampQuery"]), *common], "RFC 3161 查詢 nonce 與憑證鏈驗證")
        _run_openssl(openssl, ["ts", "-verify", "-data", str(snapshot_paths["archiveManifest"]), *common], "RFC 3161 GAM 實際 bytes 驗證")
        text = _run_openssl(openssl, ["ts", "-reply", "-in", str(snapshot_paths["timestampResponse"]), "-text"], "RFC 3161 回應解析")
    version = _run_openssl(openssl, ["version"], "OpenSSL 版本查詢").strip()
    return _timestamp_details(text), version, snapshots


def _copy_exclusive(raw: bytes, destination: Path) -> None:
    with destination.open("xb") as output:
        output.write(raw)


def finalize_timestamp_package(
    *,
    prepared_directory: Path,
    timestamp_response_path: Path,
    trust_anchor_path: Path,
    untrusted_chain_path: Path | None = None,
    output_directory: Path | None = None,
    openssl_path: Path | None = None,
    verified_at: str | None = None,
) -> dict[str, Any]:
    manifest, manifest_path, query_path, evidence_paths, prepared_raw = _load_prepared_package(prepared_directory)
    openssl = find_openssl(openssl_path)
    details, version, verified_raw = _verify_rfc3161(
        openssl=openssl,
        manifest_path=manifest_path,
        query_path=query_path,
        response_path=timestamp_response_path,
        trust_anchor_path=trust_anchor_path,
        untrusted_chain_path=untrusted_chain_path,
    )
    if (
        verified_raw["archiveManifest"] != prepared_raw["archiveManifest"]
        or verified_raw["timestampQuery"] != prepared_raw["timestampQuery"]
    ):
        raise ValueError("GAM 或 GTS 在來源重驗與 RFC 3161 驗證之間發生變更。")
    raw_files: dict[str, tuple[str, bytes]] = {
        **{
            key: (path.name, prepared_raw[key])
            for key, path in evidence_paths.items()
        },
        "archiveManifest": (manifest_path.name, verified_raw["archiveManifest"]),
        "timestampQuery": (query_path.name, verified_raw["timestampQuery"]),
        "timestampResponse": ("RFC3161-timestamp-response.tsr", verified_raw["timestampResponse"]),
        "tsaTrustAnchor": ("TSA-trust-anchor.pem", verified_raw["tsaTrustAnchor"]),
    }
    if untrusted_chain_path:
        raw_files["tsaUntrustedChain"] = ("TSA-untrusted-chain.pem", verified_raw["tsaUntrustedChain"])
    summaries = {key: _summary(name, raw) for key, (name, raw) in raw_files.items()}
    receipt = build_timestamp_verification_receipt(
        manifest,
        source_files=summaries,
        timestamp_details=details,
        verified_at=verified_at,
        openssl_version=version,
    )
    destination = output_directory or prepared_directory.parent / f"GTV-治理檢核可信時間證據包-{receipt['verificationFingerprint']}"
    if destination.exists():
        raise ValueError("GTV 證據包目錄已存在；為保留證據，本工具不會覆寫。")
    receipt_name = f"GTV-治理檢核可信時間驗證-{receipt['verificationFingerprint']}.json"
    reserved = {receipt_name.casefold()}
    names = [name.casefold() for name, _ in raw_files.values()]
    if len(names) != len(set(names)) or any(name in reserved for name in names):
        raise ValueError("GTV 證據包檔名衝突。")
    destination.mkdir(parents=False, exist_ok=False)
    try:
        for name, raw in raw_files.values():
            _copy_exclusive(raw, destination / name)
        _copy_exclusive((json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), destination / receipt_name)
        verified = verify_timestamp_package(destination, openssl_path=openssl)
    except Exception:
        shutil.rmtree(destination)
        raise
    return {
        "directory": str(destination.resolve()),
        "verificationFingerprint": verified["verificationFingerprint"],
        "manifestFingerprint": verified["archive"]["manifestFingerprint"],
        "timestampGenTime": verified["timestamp"]["genTime"],
        "timestampPolicyIdentifier": verified["timestamp"]["policyIdentifier"],
    }


def verify_timestamp_package(directory: Path, *, openssl_path: Path | None = None) -> dict[str, Any]:
    is_junction = getattr(directory, "is_junction", lambda: False)
    if directory.is_symlink() or is_junction() or not directory.is_dir():
        raise ValueError("GTV 證據包必須是既有資料夾。")
    receipt_path = _single_file(directory, "GTV-*.json", "GTV 收據")
    receipt = validate_timestamp_verification_receipt(
        _json_from_bytes(_read_bytes(receipt_path, max_bytes=MAX_JSON_BYTES, label="GTV"), "GTV")
    )
    if receipt_path.name != f"GTV-治理檢核可信時間驗證-{receipt['verificationFingerprint']}.json":
        raise ValueError("GTV 收據檔名與驗證指紋不一致。")
    expected_names = {receipt_path.name.casefold(), *(item["fileName"].casefold() for item in receipt["sourceFiles"].values())}
    _assert_closed_directory(directory, expected_names, "GTV 證據包")
    paths = {key: directory / item["fileName"] for key, item in receipt["sourceFiles"].items()}
    package_raw: dict[str, bytes] = {}
    for key, path in paths.items():
        limit = MAX_JSON_BYTES if key in EVIDENCE_KEYS | {"archiveManifest"} else MAX_BINARY_BYTES
        raw = _read_bytes(path, max_bytes=limit, label=key)
        package_raw[key] = raw
        if _summary(path.name, raw) != receipt["sourceFiles"][key]:
            raise ValueError(f"GTV 內 {key} 的 bytes 與收據不一致。")
    manifest = validate_archive_manifest(_json_from_bytes(package_raw["archiveManifest"], "GAM"))
    if (
        manifest["manifestFingerprint"] != receipt["archive"]["manifestFingerprint"]
        or manifest["checkpointSummary"]["verificationFingerprint"] != receipt["archive"]["verificationFingerprint"]
        or manifest["checkpointSummary"]["checkpointFingerprint"] != receipt["archive"]["checkpointFingerprint"]
        or manifest["checkpointSummary"]["anchorStatus"] != receipt["archive"]["anchorStatus"]
    ):
        raise ValueError("GTV 歸檔摘要與 GAM 不一致。")
    for key, item in manifest["evidenceFiles"].items():
        if receipt["sourceFiles"].get(key) != item:
            raise ValueError("GTV 與 GAM 的來源檔摘要不一致。")
    _revalidate_evidence_bytes(
        {key: package_raw[key] for key in manifest["evidenceFiles"]},
        {key: paths[key].name for key in manifest["evidenceFiles"]},
    )
    openssl = find_openssl(openssl_path)
    details, _version, verified_raw = _verify_rfc3161(
        openssl=openssl,
        manifest_path=paths["archiveManifest"],
        query_path=paths["timestampQuery"],
        response_path=paths["timestampResponse"],
        trust_anchor_path=paths["tsaTrustAnchor"],
        untrusted_chain_path=paths.get("tsaUntrustedChain"),
    )
    for key, raw in verified_raw.items():
        if raw != package_raw[key]:
            raise ValueError("GTV 來源在內容重驗與 RFC 3161 驗證之間發生變更。")
    if (
        details["policyIdentifier"] != receipt["timestamp"]["policyIdentifier"]
        or details["serialNumber"] != receipt["timestamp"]["serialNumber"]
        or details["genTime"] != receipt["timestamp"]["genTime"]
    ):
        raise ValueError("GTV 所列 RFC 3161 詳細資料與實際回應不一致。")
    _assert_closed_directory(directory, expected_names, "GTV 證據包")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description="建立或驗證治理健康 GCV 的 RFC 3161 可信時間證據包。")
    parser.add_argument("--openssl", type=Path, help="可選：OpenSSL 可執行檔路徑")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare", help="建立 GAM 清單與 GTS 時間戳查詢")
    prepare.add_argument("--verification-receipt", required=True, type=Path)
    prepare.add_argument("--checkpoint", required=True, type=Path)
    prepare.add_argument("--trust-backup", type=Path)
    prepare.add_argument("--current-history", type=Path)
    prepare.add_argument("--output-directory", type=Path)
    finalize = subparsers.add_parser("finalize", help="驗證 TSA 回應並建立完整 GTV 證據包")
    finalize.add_argument("--prepared-directory", required=True, type=Path)
    finalize.add_argument("--timestamp-response", required=True, type=Path)
    finalize.add_argument("--trust-anchor", required=True, type=Path)
    finalize.add_argument("--untrusted-chain", type=Path)
    finalize.add_argument("--output-directory", type=Path)
    verify = subparsers.add_parser("verify", help="唯讀重驗完整 GTV 證據包")
    verify.add_argument("--package", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = prepare_timestamp_request(
                verification_receipt_path=args.verification_receipt,
                checkpoint_path=args.checkpoint,
                trust_backup_path=args.trust_backup,
                current_history_path=args.current_history,
                output_directory=args.output_directory,
                openssl_path=args.openssl,
            )
            print(f"GAM 可信時間請求包建立完成：{result['directory']}")
            print(f"GAM 指紋：{result['manifestFingerprint']}")
            print(f"請將 GTS 查詢送交組織採用的 RFC 3161 TSA：{result['queryPath']}")
        elif args.command == "finalize":
            result = finalize_timestamp_package(
                prepared_directory=args.prepared_directory,
                timestamp_response_path=args.timestamp_response,
                trust_anchor_path=args.trust_anchor,
                untrusted_chain_path=args.untrusted_chain,
                output_directory=args.output_directory,
                openssl_path=args.openssl,
            )
            print(f"GTV 可信時間證據包建立並重驗完成：{result['directory']}")
            print(f"GTV 指紋：{result['verificationFingerprint']}")
            print(f"TSA genTime：{result['timestampGenTime']}")
        else:
            receipt = verify_timestamp_package(args.package, openssl_path=args.openssl)
            print(f"GTV 可信時間證據包驗證通過：{args.package.resolve()}")
            print(f"GTV 指紋：{receipt['verificationFingerprint']}")
            print(f"TSA genTime：{receipt['timestamp']['genTime']}")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
