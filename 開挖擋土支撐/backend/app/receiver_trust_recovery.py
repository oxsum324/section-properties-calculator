from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
from typing import Any

from .receiver_trust_backup import (
    build_receiver_trust_registry_backup,
    restore_receiver_trust_registry_backup,
    validate_receiver_trust_registry_backup,
)
from .receiver_trust_store import ReceiverTrustStore, _canonical_json_bytes


RECEIVER_TRUST_RECOVERY_DRILL_KIND = "receiver-trust-registry-recovery-drill-receipt"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value: Any, label: str) -> datetime:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label}格式不正確。") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{label}必須包含時區。")
    return parsed.astimezone(timezone.utc)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return "SHA256-" + digest.hexdigest().upper()


def _receipt_fingerprint(receipt: dict[str, Any]) -> str:
    payload = {key: value for key, value in receipt.items() if key != "receiptFingerprint"}
    return "RDR-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def _timestamp_token(value: str) -> str:
    parsed = _parse_time(value, "時間")
    return parsed.strftime("%Y%m%d-%H%M%S-%f")


def _write_json_exclusive(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    created = False
    try:
        with path.open("x", encoding="utf-8", newline="\n") as stream:
            created = True
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except Exception:
        if created:
            path.unlink(missing_ok=True)
        raise


def write_receiver_trust_registry_backup(
    store: ReceiverTrustStore,
    output_directory: Path,
    *,
    exported_at: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    backup = build_receiver_trust_registry_backup(store, exported_at=exported_at)
    filename = (
        f"RVR-trust-registry-backup-{_timestamp_token(backup['exportedAt'])}-"
        f"{backup['registry']['registryFingerprint']}-{backup['backupFingerprint']}.json"
    )
    path = output_directory / filename
    _write_json_exclusive(path, backup)
    try:
        saved = validate_receiver_trust_registry_backup(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        path.unlink(missing_ok=True)
        raise ValueError("信任清冊備份落地後重新驗證失敗，已移除不完整檔案。") from exc
    if saved["backupFingerprint"] != backup["backupFingerprint"]:
        path.unlink(missing_ok=True)
        raise ValueError("信任清冊備份落地後指紋不一致，已移除不完整檔案。")
    return path, saved


def validate_receiver_trust_registry_backup_file(
    path: Path,
    *,
    max_age_days: int | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    try:
        backup = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("無法讀取信任清冊備份 JSON。") from exc
    validated = validate_receiver_trust_registry_backup(backup)
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    exported = _parse_time(validated["exportedAt"], "備份匯出時間")
    age_seconds = max(0.0, (current - exported).total_seconds())
    if max_age_days is not None:
        if max_age_days <= 0:
            raise ValueError("備份最長允許天數必須大於 0。")
        if age_seconds > max_age_days * 86400:
            raise ValueError(f"信任清冊備份已超過 {max_age_days} 天的新鮮度門檻。")
    return {
        "backup": validated,
        "fileSha256": _file_sha256(path),
        "ageSeconds": round(age_seconds, 3),
    }


def validate_receiver_trust_recovery_drill_receipt(receipt: Any) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise ValueError("復原演練收據必須是 JSON 物件。")
    if receipt.get("schemaVersion") != 1 or receipt.get("kind") != RECEIVER_TRUST_RECOVERY_DRILL_KIND:
        raise ValueError("復原演練收據版本或種類不受支援。")
    performed_at = _parse_time(receipt.get("performedAt"), "復原演練時間")
    if performed_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("復原演練時間不可晚於目前時間。")
    required_text = (
        "backupFileName",
        "backupFileSha256",
        "backupFingerprint",
        "registryFingerprint",
        "restoredRegistryFingerprint",
    )
    if any(not str(receipt.get(field) or "").strip() for field in required_text):
        raise ValueError("復原演練收據缺少必要識別資料。")
    if Path(str(receipt["backupFileName"])).name != receipt["backupFileName"]:
        raise ValueError("復原演練收據的備份檔名不得包含路徑。")
    format_rules = {
        "backupFileSha256": r"SHA256-[0-9A-F]{64}",
        "backupFingerprint": r"RTB-[0-9A-F]{20}",
        "registryFingerprint": r"RTR-[0-9A-F]{20}",
        "restoredRegistryFingerprint": r"RTR-[0-9A-F]{20}",
        "receiptFingerprint": r"RDR-[0-9A-F]{20}",
    }
    if any(not re.fullmatch(pattern, str(receipt.get(field) or "")) for field, pattern in format_rules.items()):
        raise ValueError("復原演練收據的指紋格式不正確。")
    if receipt.get("result") != "passed":
        raise ValueError("復原演練收據不是通過結果。")
    if receipt.get("restoreTarget") != "isolated-temporary-registry":
        raise ValueError("復原演練未使用隔離暫存清冊。")
    if receipt.get("productionRegistryUnchanged") is not True:
        raise ValueError("復原演練未證明正式信任清冊保持不變。")
    if not isinstance(receipt.get("productionRegistryObserved"), bool):
        raise ValueError("復原演練收據缺少正式信任清冊觀察狀態。")
    if receipt.get("registryFingerprint") != receipt.get("restoredRegistryFingerprint"):
        raise ValueError("復原演練後的清冊指紋不一致。")
    if not isinstance(receipt.get("keyCount"), int) or receipt["keyCount"] < 0:
        raise ValueError("復原演練收據的金鑰筆數不正確。")
    if not isinstance(receipt.get("eventCount"), int) or receipt["eventCount"] < 0:
        raise ValueError("復原演練收據的事件筆數不正確。")
    if not isinstance(receipt.get("backupAgeSeconds"), (int, float)) or receipt["backupAgeSeconds"] < 0:
        raise ValueError("復原演練收據的備份年齡不正確。")
    if receipt.get("receiptFingerprint") != _receipt_fingerprint(receipt):
        raise ValueError("復原演練收據指紋驗證失敗。")
    return dict(receipt)


def evaluate_receiver_trust_backup_directory(
    directory: Path,
    *,
    max_age_days: int = 8,
    now: datetime | None = None,
) -> dict[str, Any]:
    if max_age_days <= 0:
        raise ValueError("備份健康檢查的最長允許天數必須大於 0。")
    if not directory.is_dir():
        raise ValueError("RVR 備份資料夾不存在或無法讀取。")

    backup_paths = list(directory.glob("RVR-trust-registry-backup-*.json"))
    receipt_paths = list(directory.glob("RVR-recovery-drill-*.json"))
    if not backup_paths:
        raise ValueError("RVR 備份資料夾內沒有信任清冊備份。")
    if not receipt_paths:
        raise ValueError("RVR 備份資料夾內沒有復原演練收據。")

    latest_backup = max(backup_paths, key=lambda path: path.stat().st_mtime_ns)
    latest_receipt = max(receipt_paths, key=lambda path: path.stat().st_mtime_ns)
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    validated_file = validate_receiver_trust_registry_backup_file(
        latest_backup,
        max_age_days=max_age_days,
        now=current,
    )
    try:
        receipt_payload = json.loads(latest_receipt.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("無法讀取最新的 RVR 復原演練收據。") from exc
    receipt = validate_receiver_trust_recovery_drill_receipt(receipt_payload)
    performed_at = _parse_time(receipt["performedAt"], "復原演練時間")
    receipt_age_seconds = max(0.0, (current - performed_at).total_seconds())
    if receipt_age_seconds > max_age_days * 86400:
        raise ValueError(f"RVR 復原演練收據已超過 {max_age_days} 天的新鮮度門檻。")

    backup = validated_file["backup"]
    relationships = {
        "backupFileName": receipt["backupFileName"] == latest_backup.name,
        "backupFileSha256": receipt["backupFileSha256"] == validated_file["fileSha256"],
        "backupFingerprint": receipt["backupFingerprint"] == backup["backupFingerprint"],
        "registryFingerprint": receipt["registryFingerprint"] == backup["registry"]["registryFingerprint"],
    }
    if not all(relationships.values()):
        raise ValueError("最新備份與最新復原演練收據不是同一組可追溯證據。")
    if receipt["productionRegistryObserved"] is not True:
        raise ValueError("最新復原演練沒有實際觀察正式信任清冊。")

    return {
        "status": "backup-health-ok",
        "backupPath": str(latest_backup),
        "receiptPath": str(latest_receipt),
        "backupFingerprint": backup["backupFingerprint"],
        "registryFingerprint": backup["registry"]["registryFingerprint"],
        "receiptFingerprint": receipt["receiptFingerprint"],
        "backupAgeSeconds": validated_file["ageSeconds"],
        "receiptAgeSeconds": round(receipt_age_seconds, 3),
        "productionRegistryUnchanged": receipt["productionRegistryUnchanged"],
    }


def perform_receiver_trust_registry_recovery_drill(
    backup_path: Path,
    receipt_directory: Path,
    *,
    production_registry_path: Path | None = None,
    max_age_days: int | None = None,
    performed_at: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    before_hash = _file_sha256(production_registry_path) if production_registry_path and production_registry_path.exists() else None
    validated_file = validate_receiver_trust_registry_backup_file(
        backup_path,
        max_age_days=max_age_days,
    )
    backup = validated_file["backup"]
    with tempfile.TemporaryDirectory(prefix="rvr-trust-recovery-drill-") as directory:
        temporary_store = ReceiverTrustStore(Path(directory) / "receiver-trust-registry.json")
        restored = restore_receiver_trust_registry_backup(
            temporary_store,
            backup,
            restore_confirmed=True,
        )
        if restored["safeguardPath"] is not None:
            raise ValueError("隔離復原演練不應產生既有清冊保護副本。")
        restored_snapshot = temporary_store.snapshot()
        if len(restored_snapshot["keys"]) != backup["registry"]["keyCount"]:
            raise ValueError("復原演練後的金鑰筆數與備份不一致。")
        if len(restored_snapshot["events"]) != backup["registry"]["eventCount"]:
            raise ValueError("復原演練後的事件筆數與備份不一致。")
    after_hash = _file_sha256(production_registry_path) if production_registry_path and production_registry_path.exists() else None
    production_unchanged = before_hash == after_hash
    if not production_unchanged:
        raise ValueError("復原演練期間正式信任清冊發生異動，拒絕產生通過收據。")
    performed_at = performed_at or _now_iso()
    _parse_time(performed_at, "復原演練時間")
    receipt: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_TRUST_RECOVERY_DRILL_KIND,
        "performedAt": performed_at,
        "backupFileName": backup_path.name,
        "backupFileSha256": validated_file["fileSha256"],
        "backupFingerprint": backup["backupFingerprint"],
        "registryFingerprint": backup["registry"]["registryFingerprint"],
        "keyCount": backup["registry"]["keyCount"],
        "eventCount": backup["registry"]["eventCount"],
        "backupAgeSeconds": validated_file["ageSeconds"],
        "restoreTarget": "isolated-temporary-registry",
        "restoredRegistryFingerprint": restored["registryFingerprint"],
        "productionRegistryObserved": before_hash is not None,
        "productionRegistryUnchanged": production_unchanged,
        "result": "passed",
    }
    receipt["receiptFingerprint"] = _receipt_fingerprint(receipt)
    receipt = validate_receiver_trust_recovery_drill_receipt(receipt)
    filename = (
        f"RVR-recovery-drill-{_timestamp_token(performed_at)}-"
        f"{receipt['receiptFingerprint']}.json"
    )
    path = receipt_directory / filename
    _write_json_exclusive(path, receipt)
    try:
        saved = validate_receiver_trust_recovery_drill_receipt(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        path.unlink(missing_ok=True)
        raise ValueError("復原演練收據落地後重新驗證失敗，已移除不完整檔案。") from exc
    return path, saved


__all__ = [
    "RECEIVER_TRUST_RECOVERY_DRILL_KIND",
    "evaluate_receiver_trust_backup_directory",
    "perform_receiver_trust_registry_recovery_drill",
    "validate_receiver_trust_recovery_drill_receipt",
    "validate_receiver_trust_registry_backup_file",
    "write_receiver_trust_registry_backup",
]
