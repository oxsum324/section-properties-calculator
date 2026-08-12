from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any

from .app.receiver_governance_checkpoint import (
    compare_receiver_governance_checkpoint_history,
    validate_receiver_governance_signed_checkpoint,
)
from .app.receiver_governance_health import (
    validate_receiver_governance_health_history_export,
)
from .app.receiver_trust_backup import validate_receiver_trust_registry_backup


VERIFICATION_SCHEMA_VERSION = 1
VERIFICATION_KIND = "receiver-governance-checkpoint-verification-receipt"
VERIFICATION_BOUNDARY = {
    "independentOfflineValidation": True,
    "noServiceRequired": True,
    "noProjectDatabaseRequired": True,
    "noPrivateKeysRead": True,
    "doesNotVerifyExternalStorage": True,
    "doesNotProvideExternalTimestamp": True,
    "trustRegistrySnapshotDoesNotProveTrustAtSignedAt": True,
    "doesNotConstituteEngineeringApproval": True,
    "verificationReceiptIsNotStandaloneProof": True,
    "requiresSourceFilesForRevalidation": True,
    "formalCalculationAttachment": False,
}
TRUST_STATUSES = {
    "trusted-signature-valid",
    "valid-signature-untrusted-key",
    "valid-signature-revoked-key",
}
HISTORY_RELATIONS = {
    "current-matches-checkpoint",
    "current-extends-checkpoint",
    "current-behind-checkpoint",
    "current-diverged-from-checkpoint",
}


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def governance_checkpoint_verification_fingerprint(record: dict[str, Any]) -> str:
    payload = {key: value for key, value in record.items() if key != "verificationFingerprint"}
    digest = hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()
    return f"GCV-{digest}"


def _parse_iso(value: Any, label: str) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label}不是有效 ISO 8601 日期時間。") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{label}必須包含時區。")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json_with_summary(path: Path, *, max_bytes: int) -> tuple[dict[str, Any], dict[str, str]]:
    if not path.is_file():
        raise ValueError(f"{path.name} 必須是 {max_bytes // 1_000_000 or 1} MB 以下的 JSON 檔案。")
    try:
        raw = path.read_bytes()
        if len(raw) > max_bytes:
            raise ValueError(f"{path.name} 必須是 {max_bytes // 1_000_000 or 1} MB 以下的 JSON 檔案。")
        value = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path.name} 不是有效的 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} 最外層必須是 JSON 物件。")
    return value, {
        "fileName": path.name,
        "fileSha256": hashlib.sha256(raw).hexdigest(),
    }


def _validate_file_summary(item: Any, label: str) -> None:
    file_name = str(item.get("fileName", "")).strip() if isinstance(item, dict) else ""
    if (
        not isinstance(item, dict)
        or set(item) != {"fileName", "fileSha256"}
        or not file_name
        or Path(file_name).name != file_name
        or "/" in file_name
        or "\\" in file_name
        or not re.fullmatch(r"[0-9a-f]{64}", str(item.get("fileSha256", "")))
    ):
        raise ValueError(f"治理檢核點驗證收據的 {label} 來源檔案摘要不完整。")


def _anchor_status(signature_trusted: bool, relation: str | None) -> str:
    if relation is None:
        return (
            "trusted-signature-history-not-compared"
            if signature_trusted
            else "trust-and-history-not-established"
        )
    if not signature_trusted:
        return "valid-signature-trust-not-established"
    if relation in {"current-matches-checkpoint", "current-extends-checkpoint"}:
        return "trusted-anchor-for-provided-history"
    return "not-anchor-for-provided-history"


def build_receiver_governance_checkpoint_verification_receipt(
    checkpoint: dict[str, Any],
    *,
    source_files: dict[str, dict[str, str]],
    trust_registry_backup: dict[str, Any] | None = None,
    current_history_export: dict[str, Any] | None = None,
    verified_at: str | None = None,
) -> dict[str, Any]:
    trust_backup = (
        validate_receiver_trust_registry_backup(trust_registry_backup)
        if trust_registry_backup is not None
        else None
    )
    trusted_keys = trust_backup["registry"]["keys"] if trust_backup else []
    validated = validate_receiver_governance_signed_checkpoint(checkpoint, trusted_keys)
    current_export = (
        validate_receiver_governance_health_history_export(current_history_export)
        if current_history_export is not None
        else None
    )
    comparison = (
        compare_receiver_governance_checkpoint_history(
            validated["historyExport"]["history"],
            current_export["history"],
        )
        if current_export
        else None
    )
    signature = validated["signature"]
    relation = comparison["relation"] if comparison else None
    record: dict[str, Any] = {
        "schemaVersion": VERIFICATION_SCHEMA_VERSION,
        "kind": VERIFICATION_KIND,
        "verifiedAt": _parse_iso(
            verified_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "治理檢核點驗證時間",
        ),
        "sourceFiles": deepcopy(source_files),
        "checkpoint": {
            "checkpointFingerprint": checkpoint["checkpointFingerprint"],
            "requestFingerprint": checkpoint["signingRequest"]["requestFingerprint"],
            "exportFingerprint": validated["historyExport"]["exportFingerprint"],
            "signedAt": signature["signedAt"],
            "observationCount": validated["historyExport"]["history"]["observationCount"],
            "headFingerprint": validated["historyExport"]["history"]["headFingerprint"],
        },
        "trustRegistry": {
            "provided": trust_backup is not None,
            "backupFingerprint": trust_backup["backupFingerprint"] if trust_backup else None,
            "registryFingerprint": (
                trust_backup["registry"]["registryFingerprint"] if trust_backup else None
            ),
            "exportedAt": trust_backup["exportedAt"] if trust_backup else None,
            "keyCount": trust_backup["registry"]["keyCount"] if trust_backup else 0,
            "eventCount": trust_backup["registry"]["eventCount"] if trust_backup else 0,
        },
        "signature": {
            "cryptographicValid": True,
            "status": signature["status"],
            "trusted": signature["trusted"],
            "keyId": signature["keyId"],
            "signedAt": signature["signedAt"],
            "trustedOrganization": signature.get("trustedOrganization"),
            "keyLabel": signature.get("keyLabel"),
        },
        "currentHistory": {
            "provided": current_export is not None,
            "exportFingerprint": current_export["exportFingerprint"] if current_export else None,
            "exportedAt": current_export["exportedAt"] if current_export else None,
        },
        "comparison": comparison,
        "summary": {
            "integrityStatus": "valid",
            "trustStatus": signature["status"],
            "historyStatus": relation or "not-compared",
            "anchorStatus": _anchor_status(signature["trusted"], relation),
        },
        "boundary": VERIFICATION_BOUNDARY,
    }
    record["verificationFingerprint"] = governance_checkpoint_verification_fingerprint(record)
    return validate_receiver_governance_checkpoint_verification_receipt(record)


def validate_receiver_governance_checkpoint_verification_receipt(record: Any) -> dict[str, Any]:
    expected_fields = {
        "schemaVersion", "kind", "verifiedAt", "sourceFiles", "checkpoint",
        "trustRegistry", "signature", "currentHistory", "comparison", "summary",
        "boundary", "verificationFingerprint",
    }
    if not isinstance(record, dict) or set(record) != expected_fields:
        raise ValueError("治理檢核點驗證收據格式不正確或含有未識別欄位。")
    if record.get("schemaVersion") != VERIFICATION_SCHEMA_VERSION or record.get("kind") != VERIFICATION_KIND:
        raise ValueError("治理檢核點驗證收據版本或種類不受支援。")
    _parse_iso(record.get("verifiedAt"), "治理檢核點驗證時間")

    source_files = record.get("sourceFiles")
    if not isinstance(source_files, dict) or "checkpoint" not in source_files:
        raise ValueError("治理檢核點驗證收據缺少來源檔案摘要。")
    _validate_file_summary(source_files["checkpoint"], "checkpoint")

    trust = record.get("trustRegistry")
    if not isinstance(trust, dict) or set(trust) != {
        "provided", "backupFingerprint", "registryFingerprint", "exportedAt",
        "keyCount", "eventCount",
    } or not isinstance(trust.get("provided"), bool):
        raise ValueError("治理檢核點驗證收據缺少信任清冊摘要。")
    if trust["provided"]:
        if set(source_files) - {"checkpoint", "trustRegistryBackup", "currentHistoryExport"}:
            raise ValueError("治理檢核點驗證收據含有未識別來源檔案。")
        if "trustRegistryBackup" not in source_files:
            raise ValueError("治理檢核點驗證收據缺少 RTB 來源檔案摘要。")
        _validate_file_summary(source_files["trustRegistryBackup"], "trustRegistryBackup")
        if (
            not re.fullmatch(r"RTB-[0-9A-F]{20}", str(trust.get("backupFingerprint", "")))
            or not re.fullmatch(r"RTR-[0-9A-F]{20}", str(trust.get("registryFingerprint", "")))
        ):
            raise ValueError("治理檢核點驗證收據的信任清冊指紋不正確。")
        _parse_iso(trust.get("exportedAt"), "信任清冊備份匯出時間")
    elif (
        trust.get("backupFingerprint") is not None
        or trust.get("registryFingerprint") is not None
        or trust.get("exportedAt") is not None
        or "trustRegistryBackup" in source_files
    ):
        raise ValueError("治理檢核點驗證收據的未提供信任清冊狀態不一致。")
    for field in ("keyCount", "eventCount"):
        value = trust.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError("治理檢核點驗證收據的信任清冊筆數不正確。")
        if not trust["provided"] and value != 0:
            raise ValueError("治理檢核點驗證收據的未提供信任清冊筆數必須為 0。")

    checkpoint = record.get("checkpoint")
    if not isinstance(checkpoint, dict) or set(checkpoint) != {
        "checkpointFingerprint", "requestFingerprint", "exportFingerprint", "signedAt",
        "observationCount", "headFingerprint",
    }:
        raise ValueError("治理檢核點驗證收據缺少檢核點摘要。")
    for field, pattern in {
        "checkpointFingerprint": r"GHC-[0-9A-F]{20}",
        "requestFingerprint": r"GCR-[0-9A-F]{20}",
        "exportFingerprint": r"GHE-[0-9A-F]{20}",
    }.items():
        if not re.fullmatch(pattern, str(checkpoint.get(field, ""))):
            raise ValueError("治理檢核點驗證收據的檢核點指紋摘要不正確。")
    _parse_iso(checkpoint.get("signedAt"), "治理檢核點簽署時間")
    observation_count = checkpoint.get("observationCount")
    if not isinstance(observation_count, int) or isinstance(observation_count, bool) or observation_count < 0:
        raise ValueError("治理檢核點驗證收據的歷程筆數不正確。")
    head_fingerprint = checkpoint.get("headFingerprint")
    if (
        (observation_count == 0 and head_fingerprint is not None)
        or (
            observation_count > 0
            and not re.fullmatch(r"GHR-[0-9A-F]{20}", str(head_fingerprint or ""))
        )
    ):
        raise ValueError("治理檢核點驗證收據的歷程鏈首不正確。")

    signature = record.get("signature")
    if not isinstance(signature, dict) or set(signature) != {
        "cryptographicValid", "status", "trusted", "keyId", "signedAt",
        "trustedOrganization", "keyLabel",
    }:
        raise ValueError("治理檢核點驗證收據缺少簽章結果。")
    if signature.get("cryptographicValid") is not True or signature.get("status") not in TRUST_STATUSES:
        raise ValueError("治理檢核點驗證收據的簽章完整性狀態不正確。")
    if signature.get("trusted") != (signature.get("status") == "trusted-signature-valid"):
        raise ValueError("治理檢核點驗證收據的簽章信任狀態不一致。")
    if not re.fullmatch(r"RVK-[0-9A-F]{20}", str(signature.get("keyId", ""))):
        raise ValueError("治理檢核點驗證收據的 Key ID 不正確。")
    if _parse_iso(signature.get("signedAt"), "簽章結果時間") != _parse_iso(checkpoint.get("signedAt"), "檢核點時間"):
        raise ValueError("治理檢核點驗證收據的簽署時間不一致。")
    if signature["trusted"] and not trust["provided"]:
        raise ValueError("未提供信任清冊時不得聲明簽章受信任。")

    current = record.get("currentHistory")
    if not isinstance(current, dict) or set(current) != {"provided", "exportFingerprint", "exportedAt"} or not isinstance(current.get("provided"), bool):
        raise ValueError("治理檢核點驗證收據缺少目前歷程狀態。")
    comparison = record.get("comparison")
    if current["provided"]:
        if "currentHistoryExport" not in source_files:
            raise ValueError("治理檢核點驗證收據缺少目前 GHE 來源檔案摘要。")
        _validate_file_summary(source_files["currentHistoryExport"], "currentHistoryExport")
        if not re.fullmatch(r"GHE-[0-9A-F]{20}", str(current.get("exportFingerprint", ""))):
            raise ValueError("治理檢核點驗證收據的目前 GHE 指紋不正確。")
        _parse_iso(current.get("exportedAt"), "目前 GHE 匯出時間")
        if not isinstance(comparison, dict) or set(comparison) != {
            "relation", "relationLabel", "checkpointObservationCount",
            "checkpointHeadFingerprint", "currentObservationCount", "currentHeadFingerprint",
        } or comparison.get("relation") not in HISTORY_RELATIONS:
            raise ValueError("治理檢核點驗證收據的歷程比較結果不正確。")
        if (
            comparison.get("checkpointObservationCount") != observation_count
            or comparison.get("checkpointHeadFingerprint") != checkpoint.get("headFingerprint")
        ):
            raise ValueError("治理檢核點驗證收據的檢核點歷程比較摘要不一致。")
    elif (
        current.get("exportFingerprint") is not None
        or current.get("exportedAt") is not None
        or comparison is not None
        or "currentHistoryExport" in source_files
    ):
        raise ValueError("治理檢核點驗證收據的未提供目前歷程狀態不一致。")
    allowed_source_files = {"checkpoint"}
    if trust["provided"]:
        allowed_source_files.add("trustRegistryBackup")
    if current["provided"]:
        allowed_source_files.add("currentHistoryExport")
    if set(source_files) != allowed_source_files:
        raise ValueError("治理檢核點驗證收據的來源檔案集合不一致。")

    summary = record.get("summary")
    relation = comparison["relation"] if comparison else None
    if not isinstance(summary, dict) or summary != {
        "integrityStatus": "valid",
        "trustStatus": signature["status"],
        "historyStatus": relation or "not-compared",
        "anchorStatus": _anchor_status(signature["trusted"], relation),
    }:
        raise ValueError("治理檢核點驗證收據的結論與驗證結果不一致。")
    if record.get("boundary") != VERIFICATION_BOUNDARY:
        raise ValueError("治理檢核點驗證收據未保留獨立驗證責任邊界。")
    fingerprint = str(record.get("verificationFingerprint", ""))
    if not re.fullmatch(r"GCV-[0-9A-F]{20}", fingerprint) or fingerprint != governance_checkpoint_verification_fingerprint(record):
        raise ValueError("治理檢核點驗證收據的整包指紋驗證失敗。")
    return deepcopy(record)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="不啟動服務、不讀取專案資料庫，獨立驗證 GHC、可選 RTB 與目前 GHE。"
    )
    parser.add_argument("--checkpoint", required=True, type=Path, help="GHC 簽章檢核點 JSON")
    parser.add_argument("--trust-backup", type=Path, help="可選：RTB 公開信任清冊備份 JSON")
    parser.add_argument("--current-history", type=Path, help="可選：目前 GHE 完整歷程匯出 JSON")
    parser.add_argument("--output", type=Path, help="GCV 驗證收據；預設輸出在 GHC 旁")
    args = parser.parse_args()
    try:
        checkpoint, checkpoint_summary = _read_json_with_summary(args.checkpoint, max_bytes=2_000_000)
        trust_backup = None
        trust_summary = None
        if args.trust_backup:
            trust_backup, trust_summary = _read_json_with_summary(args.trust_backup, max_bytes=5_000_000)
        current_history = None
        current_summary = None
        if args.current_history:
            current_history, current_summary = _read_json_with_summary(args.current_history, max_bytes=2_000_000)
        source_files = {"checkpoint": checkpoint_summary}
        if trust_summary:
            source_files["trustRegistryBackup"] = trust_summary
        if current_summary:
            source_files["currentHistoryExport"] = current_summary
        verification = build_receiver_governance_checkpoint_verification_receipt(
            checkpoint,
            source_files=source_files,
            trust_registry_backup=trust_backup,
            current_history_export=current_history,
        )
        output = args.output or args.checkpoint.with_name(
            f"GCV-治理健康檢核點驗證收據-{verification['verificationFingerprint']}.json"
        )
        source_paths = {
            path.resolve()
            for path in (args.checkpoint, args.trust_backup, args.current_history)
            if path is not None
        }
        if output.resolve() in source_paths:
            raise ValueError("GCV 輸出路徑不得覆寫任何來源檔案。")
        if output.exists():
            raise ValueError("GCV 輸出檔已存在；為保留既有證據，本工具不會覆寫。")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x", encoding="utf-8") as output_file:
            output_file.write(json.dumps(verification, ensure_ascii=False, indent=2) + "\n")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"治理健康檢核點驗證完成：{output}")
    print(f"密碼學完整性：{verification['summary']['integrityStatus']}")
    print(f"簽章信任狀態：{verification['summary']['trustStatus']}")
    print(f"歷程比較狀態：{verification['summary']['historyStatus']}")
    print(f"錨定狀態：{verification['summary']['anchorStatus']}")
    print(f"驗證指紋：{verification['verificationFingerprint']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
