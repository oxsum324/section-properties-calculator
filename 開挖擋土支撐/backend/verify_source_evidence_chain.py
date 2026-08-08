from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any

from .app.receiver_trust_backup import validate_receiver_trust_registry_backup
from .app.removal_transfer_handoff import (
    validate_removal_transfer_handoff,
    validate_receiver_verification_receipt,
    validate_source_capacity_evidence_verification,
    verify_receiver_identity_signature,
    verify_source_evidence_identity_signature,
)


CHAIN_VERIFICATION_SCHEMA_VERSION = 1
CHAIN_VERIFICATION_KIND = "source-evidence-chain-verification-receipt"
CHAIN_VERIFICATION_FINGERPRINT_PREFIX = "SCV"
IDENTITY_STATUSES = {
    "manual-review-required",
    "valid-signature-untrusted-key",
    "valid-signature-revoked-key",
    "valid-signature-organization-mismatch",
    "trusted-signature-valid",
}


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def chain_verification_fingerprint(record: dict[str, Any]) -> str:
    payload = {key: value for key, value in record.items() if key != "verificationFingerprint"}
    digest = hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()
    return f"{CHAIN_VERIFICATION_FINGERPRINT_PREFIX}-{digest}"


def _parse_iso(value: Any, label: str) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label}不是有效 ISO 8601 日期時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{label}必須包含時區。")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _adoption_status(engineering_status: str, rvr_identity: dict[str, Any], sev_identity: dict[str, Any]) -> str:
    if engineering_status != "passed":
        return "not-eligible-engineering-failed"
    if rvr_identity.get("trusted") is True and sev_identity.get("trusted") is True:
        return "eligible-trusted-identities"
    return "manual-identity-review-required"


def _validate_file_summary(item: Any, label: str) -> None:
    file_name = str(item.get("fileName", "")).strip() if isinstance(item, dict) else ""
    if (
        not isinstance(item, dict)
        or not file_name
        or Path(file_name).name != file_name
        or "/" in file_name
        or "\\" in file_name
        or not re.fullmatch(r"[0-9a-f]{64}", str(item.get("fileSha256", "")))
    ):
        raise ValueError(f"證據鏈驗證收據的{label}來源檔案摘要不完整。")


def _validate_identity_result(item: Any, label: str) -> None:
    if not isinstance(item, dict):
        raise ValueError(f"證據鏈驗證收據缺少 {label} 身分驗證結果。")
    status = item.get("status")
    if status not in IDENTITY_STATUSES:
        raise ValueError(f"證據鏈驗證收據的 {label} 身分狀態不受支援。")
    signature_present = item.get("signaturePresent")
    cryptographic_valid = item.get("cryptographicValid")
    trusted = item.get("trusted")
    if not all(isinstance(value, bool) for value in (signature_present, cryptographic_valid, trusted)):
        raise ValueError(f"證據鏈驗證收據的 {label} 身分布林結果不完整。")
    key_id = item.get("keyId")
    if status == "manual-review-required":
        if signature_present or cryptographic_valid or trusted or key_id is not None:
            raise ValueError(f"證據鏈驗證收據的 {label} 未簽署狀態不一致。")
        return
    if not signature_present or not cryptographic_valid or not re.fullmatch(r"RVK-[0-9A-F]{20}", str(key_id or "")):
        raise ValueError(f"證據鏈驗證收據的 {label} 簽章驗證結果不一致。")
    if trusted != (status == "trusted-signature-valid"):
        raise ValueError(f"證據鏈驗證收據的 {label} 信任狀態不一致。")


def validate_source_evidence_chain_verification_receipt(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError("證據鏈驗證收據必須是 JSON 物件。")
    if (
        record.get("schemaVersion") != CHAIN_VERIFICATION_SCHEMA_VERSION
        or record.get("kind") != CHAIN_VERIFICATION_KIND
    ):
        raise ValueError("證據鏈驗證收據版本或種類不受支援。")
    _parse_iso(record.get("verifiedAt"), "證據鏈驗證時間")
    fingerprint = str(record.get("verificationFingerprint", ""))
    if not re.fullmatch(r"SCV-[0-9A-F]{20}", fingerprint):
        raise ValueError("證據鏈驗證收據指紋格式不正確。")
    if fingerprint != chain_verification_fingerprint(record):
        raise ValueError("證據鏈驗證收據內容與指紋不一致。")
    links = record.get("links")
    if not isinstance(links, dict):
        raise ValueError("證據鏈驗證收據缺少指紋連結。")
    for field, pattern in {
        "sourceCalculationFingerprint": r"CF-[0-9A-F]{16}",
        "handoffFingerprint": r"ERH-[0-9A-F]{20}",
        "receiptFingerprint": r"RVR-[0-9A-F]{20}",
        "sourceEvidenceVerificationFingerprint": r"SEV-[0-9A-F]{20}",
    }.items():
        if not re.fullmatch(pattern, str(links.get(field, ""))):
            raise ValueError("證據鏈驗證收據包含無效或缺漏的指紋連結。")
    files = record.get("sourceFiles")
    if not isinstance(files, dict):
        raise ValueError("證據鏈驗證收據缺少來源檔案摘要。")
    for required in ("handoff", "receipt", "sourceEvidenceVerification"):
        _validate_file_summary(files.get(required), required)
    trust_registry = record.get("trustRegistry")
    if not isinstance(trust_registry, dict) or not isinstance(trust_registry.get("provided"), bool):
        raise ValueError("證據鏈驗證收據缺少信任清冊狀態。")
    if trust_registry["provided"]:
        if (
            not re.fullmatch(r"RTB-[0-9A-F]{20}", str(trust_registry.get("backupFingerprint", "")))
            or not re.fullmatch(r"RTR-[0-9A-F]{20}", str(trust_registry.get("registryFingerprint", "")))
        ):
            raise ValueError("證據鏈驗證收據的信任清冊指紋不正確。")
        _validate_file_summary(files.get("trustRegistryBackup"), "trustRegistryBackup")
    elif (
        trust_registry.get("backupFingerprint") is not None
        or trust_registry.get("registryFingerprint") is not None
        or "trustRegistryBackup" in files
    ):
        raise ValueError("證據鏈驗證收據的未提供信任清冊狀態不一致。")
    for count_field in ("keyCount", "eventCount"):
        count = trust_registry.get(count_field)
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError("證據鏈驗證收據的信任清冊筆數不正確。")
        if not trust_registry["provided"] and count != 0:
            raise ValueError("證據鏈驗證收據的未提供信任清冊筆數必須為 0。")
    summary = record.get("summary")
    if not isinstance(summary, dict) or summary.get("chainStatus") != "valid":
        raise ValueError("證據鏈驗證收據未聲明完整性驗證通過。")
    engineering_status = summary.get("engineeringStatus")
    if engineering_status not in {"passed", "failed"}:
        raise ValueError("證據鏈驗證收據的工程狀態不受支援。")
    rvr_identity = record.get("rvrIdentityVerification")
    sev_identity = record.get("sevIdentityVerification")
    _validate_identity_result(rvr_identity, "RVR")
    _validate_identity_result(sev_identity, "SEV")
    expected_adoption = _adoption_status(engineering_status, rvr_identity, sev_identity)
    if summary.get("adoptionStatus") != expected_adoption:
        raise ValueError("證據鏈驗證收據的採用狀態與工程／身分結果不一致。")
    boundary = record.get("boundary")
    if (
        not isinstance(boundary, dict)
        or boundary.get("independentOfflineValidation") is not True
        or boundary.get("noProjectDatabaseRequired") is not True
        or boundary.get("noPrivateKeysRead") is not True
        or boundary.get("doesNotRecalculateEngineeringCapacity") is not True
        or boundary.get("doesNotConstituteEngineeringApproval") is not True
        or boundary.get("receiptIsNotStandaloneProof") is not True
        or boundary.get("requiresSourceFilesForRevalidation") is not True
    ):
        raise ValueError("證據鏈驗證收據未保留獨立驗證與工程責任邊界。")
    return deepcopy(record)


def build_source_evidence_chain_verification_receipt(
    handoff: dict[str, Any],
    receipt: dict[str, Any],
    source_evidence_verification: dict[str, Any],
    *,
    source_files: dict[str, dict[str, str]],
    trust_registry_backup: dict[str, Any] | None = None,
    verified_at: str | None = None,
) -> dict[str, Any]:
    validated_handoff = validate_removal_transfer_handoff(handoff)
    validated_receipt = validate_receiver_verification_receipt(receipt, validated_handoff)
    validated_sev = validate_source_capacity_evidence_verification(
        source_evidence_verification,
        validated_handoff,
        validated_receipt,
    )
    trust_backup = (
        validate_receiver_trust_registry_backup(trust_registry_backup)
        if trust_registry_backup is not None
        else None
    )
    trusted_keys = trust_backup["registry"]["keys"] if trust_backup else []
    rvr_identity = verify_receiver_identity_signature(validated_receipt, trusted_keys)
    sev_identity = verify_source_evidence_identity_signature(validated_sev, trusted_keys)
    engineering_status = str(validated_receipt["summary"]["status"])
    record = {
        "schemaVersion": CHAIN_VERIFICATION_SCHEMA_VERSION,
        "kind": CHAIN_VERIFICATION_KIND,
        "verifiedAt": _parse_iso(
            verified_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "證據鏈驗證時間",
        ),
        "links": {
            "sourceCalculationFingerprint": validated_handoff["source"]["calculationFingerprint"],
            "handoffFingerprint": validated_handoff["handoffFingerprint"],
            "receiptFingerprint": validated_receipt["receiptFingerprint"],
            "sourceEvidenceVerificationFingerprint": validated_sev["verificationFingerprint"],
        },
        "sourceFiles": deepcopy(source_files),
        "trustRegistry": {
            "provided": trust_backup is not None,
            "backupFingerprint": trust_backup["backupFingerprint"] if trust_backup else None,
            "registryFingerprint": trust_backup["registry"]["registryFingerprint"] if trust_backup else None,
            "keyCount": trust_backup["registry"]["keyCount"] if trust_backup else 0,
            "eventCount": trust_backup["registry"]["eventCount"] if trust_backup else 0,
        },
        "rvrIdentityVerification": rvr_identity,
        "sevIdentityVerification": sev_identity,
        "summary": {
            "chainStatus": "valid",
            "engineeringStatus": engineering_status,
            "adoptionStatus": _adoption_status(engineering_status, rvr_identity, sev_identity),
        },
        "boundary": {
            "independentOfflineValidation": True,
            "noProjectDatabaseRequired": True,
            "noPrivateKeysRead": True,
            "doesNotRecalculateEngineeringCapacity": True,
            "doesNotConstituteEngineeringApproval": True,
            "receiptIsNotStandaloneProof": True,
            "requiresSourceFilesForRevalidation": True,
        },
    }
    record["verificationFingerprint"] = chain_verification_fingerprint(record)
    return validate_source_evidence_chain_verification_receipt(record)


def _read_json(path: Path, *, max_bytes: int) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError(f"{path.name} 必須是 {max_bytes // 1_000_000 or 1} MB 以下的 JSON 檔案。")
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path.name} 不是有效的 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} 最外層必須是 JSON 物件。")
    return value


def _file_summary(path: Path) -> dict[str, str]:
    return {
        "fileName": path.name,
        "fileSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="獨立驗證 ERH、RVR、SEV 與可選 RTB 的完整證據鏈。")
    parser.add_argument("--handoff", required=True, type=Path, help="ERH JSON")
    parser.add_argument("--receipt", required=True, type=Path, help="RVR JSON")
    parser.add_argument("--sev", required=True, type=Path, help="SEV JSON")
    parser.add_argument("--trust-backup", type=Path, help="可選：RTB 公開信任清冊備份 JSON")
    parser.add_argument("--output", type=Path, help="SCV 驗證收據 JSON；預設輸出在 SEV 旁")
    args = parser.parse_args()
    try:
        handoff = _read_json(args.handoff, max_bytes=1_000_000)
        receipt = _read_json(args.receipt, max_bytes=1_000_000)
        sev = _read_json(args.sev, max_bytes=1_000_000)
        trust_backup = _read_json(args.trust_backup, max_bytes=5_000_000) if args.trust_backup else None
        source_files = {
            "handoff": _file_summary(args.handoff),
            "receipt": _file_summary(args.receipt),
            "sourceEvidenceVerification": _file_summary(args.sev),
        }
        if args.trust_backup:
            source_files["trustRegistryBackup"] = _file_summary(args.trust_backup)
        verification = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=source_files,
            trust_registry_backup=trust_backup,
        )
        output = args.output or args.sev.with_name(
            f"SCV-證據鏈驗證收據-{verification['verificationFingerprint']}.json"
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(verification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"證據鏈驗證完成：{output}")
    print(f"鏈結狀態：{verification['summary']['chainStatus']}")
    print(f"工程狀態：{verification['summary']['engineeringStatus']}")
    print(f"採用狀態：{verification['summary']['adoptionStatus']}")
    print(f"驗證指紋：{verification['verificationFingerprint']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
