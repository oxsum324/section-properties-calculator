from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
from typing import Any

from .receiver_operator_auth import ReceiverOperatorStore
from .receiver_operator_backup import (
    decrypt_receiver_operator_governance_backup,
    receiver_operator_snapshot_fingerprint,
    restore_receiver_operator_governance_backup,
    validate_receiver_operator_backup_envelope,
)


RECEIVER_OPERATOR_RECOVERY_DRILL_KIND = "receiver-operator-governance-recovery-drill-receipt"
_MANAGED_BACKUP_PATTERN = re.compile(
    r"^managed-(?P<exported>\d{8}T\d{6}Z)-expires-(?P<expires>\d{8}T\d{6}Z)-"
    r"(?P<fingerprint>ROB-[0-9A-F]{20})\.json$"
)
_DRILL_RECEIPT_PATTERN = re.compile(
    r"^recovery-drill-(?P<performed>\d{8}T\d{6}Z)-(?P<fingerprint>ROD-[0-9A-F]{20})\.json$"
)


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


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


def _timestamp_token(value: datetime | str) -> str:
    parsed = value if isinstance(value, datetime) else _parse_time(value, "時間")
    return parsed.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "SHA256-" + digest.hexdigest().upper()


def _write_json_exclusive(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise


def _managed_directory(store: ReceiverOperatorStore) -> Path:
    return store.db_path.parent / "receiver_operator_governance_backups" / "managed"


def _drill_directory(store: ReceiverOperatorStore) -> Path:
    return store.db_path.parent / "receiver_operator_governance_drills"


def write_managed_receiver_operator_governance_backup(
    store: ReceiverOperatorStore,
    backup: Any,
    *,
    retention_days: int,
) -> dict[str, Any]:
    if not isinstance(retention_days, int) or isinstance(retention_days, bool):
        raise ValueError("受管制本機備份保存天數格式不正確。")
    if retention_days < 1 or retention_days > 365:
        raise ValueError("受管制本機備份保存天數須為 1 至 365 天。")
    normalized = validate_receiver_operator_backup_envelope(backup)
    exported_at = _parse_time(normalized["exportedAt"], "操作員治理備份匯出時間")
    retention_until = exported_at.replace(microsecond=0) + timedelta(days=retention_days)
    filename = (
        f"managed-{_timestamp_token(exported_at)}-expires-{_timestamp_token(retention_until)}-"
        f"{normalized['backupFingerprint']}.json"
    )
    path = _managed_directory(store) / filename
    _write_json_exclusive(path, normalized)
    try:
        saved = validate_receiver_operator_backup_envelope(
            json.loads(path.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        path.unlink(missing_ok=True)
        raise ValueError("受管制本機備份落地後重新驗證失敗，已移除不完整檔案。") from exc
    if saved["backupFingerprint"] != normalized["backupFingerprint"]:
        path.unlink(missing_ok=True)
        raise ValueError("受管制本機備份落地後指紋不一致，已移除不完整檔案。")
    return {
        "fileName": filename,
        "backupFingerprint": normalized["backupFingerprint"],
        "snapshotFingerprint": normalized["summary"]["snapshotFingerprint"],
        "exportedAt": normalized["exportedAt"],
        "retentionDays": retention_days,
        "retentionUntil": retention_until.isoformat().replace("+00:00", "Z"),
        "fileSha256": _file_sha256(path),
        "status": "active",
    }


def _managed_backup_item(path: Path, *, now: datetime) -> dict[str, Any]:
    match = _MANAGED_BACKUP_PATTERN.fullmatch(path.name)
    if match is None:
        raise ValueError("受管制備份檔名格式不正確。")
    try:
        normalized = validate_receiver_operator_backup_envelope(
            json.loads(path.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError("受管制備份內容或指紋驗證失敗。") from exc
    if normalized["backupFingerprint"] != match.group("fingerprint"):
        raise ValueError("受管制備份檔名與整包指紋不一致。")
    if _timestamp_token(normalized["exportedAt"]) != match.group("exported"):
        raise ValueError("受管制備份檔名與匯出時間不一致。")
    retention_until = datetime.strptime(
        match.group("expires"), "%Y%m%dT%H%M%SZ"
    ).replace(tzinfo=timezone.utc)
    exported_at = _parse_time(normalized["exportedAt"], "操作員治理備份匯出時間")
    retention_days = round((retention_until - exported_at).total_seconds() / 86400)
    if retention_days < 1 or retention_days > 365:
        raise ValueError("受管制備份保存期間超出允許範圍。")
    expired = now >= retention_until
    return {
        "fileName": path.name,
        "backupFingerprint": normalized["backupFingerprint"],
        "snapshotFingerprint": normalized["summary"]["snapshotFingerprint"],
        "exportedAt": normalized["exportedAt"],
        "retentionDays": retention_days,
        "retentionUntil": retention_until.isoformat().replace("+00:00", "Z"),
        "fileSha256": _file_sha256(path),
        "operatorCount": normalized["summary"]["operatorCount"],
        "activeAdminCount": normalized["summary"]["activeAdminCount"],
        "auditEventCount": normalized["summary"]["auditEventCount"],
        "expired": expired,
        "status": "expired" if expired else "active",
    }


def _receipt_fingerprint(receipt: dict[str, Any]) -> str:
    payload = {key: value for key, value in receipt.items() if key != "receiptFingerprint"}
    return "ROD-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def validate_receiver_operator_recovery_drill_receipt(receipt: Any) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise ValueError("操作員治理復原演練收據必須是 JSON 物件。")
    if (
        receipt.get("schemaVersion") != 1
        or receipt.get("kind") != RECEIVER_OPERATOR_RECOVERY_DRILL_KIND
    ):
        raise ValueError("操作員治理復原演練收據版本或種類不受支援。")
    performed_at = _parse_time(receipt.get("performedAt"), "操作員治理復原演練時間")
    if performed_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("操作員治理復原演練時間不可晚於目前時間。")
    fingerprint_rules = {
        "backupFingerprint": r"ROB-[0-9A-F]{20}",
        "backupSnapshotFingerprint": r"ROG-[0-9A-F]{20}",
        "productionSnapshotFingerprintBefore": r"ROG-[0-9A-F]{20}",
        "productionSnapshotFingerprintAfter": r"ROG-[0-9A-F]{20}",
        "isolatedRestoreEventFingerprint": r"ROE-[0-9A-F]{20}",
        "isolatedRestoredSnapshotFingerprint": r"ROG-[0-9A-F]{20}",
        "receiptFingerprint": r"ROD-[0-9A-F]{20}",
    }
    if any(
        not re.fullmatch(pattern, str(receipt.get(field) or ""))
        for field, pattern in fingerprint_rules.items()
    ):
        raise ValueError("操作員治理復原演練收據的指紋格式不正確。")
    for field in ("operatorCount", "activeAdminCount", "auditEventCount"):
        value = receipt.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"操作員治理復原演練收據的 {field} 不正確。")
    required_true = (
        "backupEnvelopeValidated",
        "encryptedSnapshotDecrypted",
        "backupAdminAuthenticated",
        "isolatedRestoreCompleted",
        "restoredAuditChainValid",
        "productionGovernanceUnchangedDuringDrill",
    )
    if any(receipt.get(field) is not True for field in required_true):
        raise ValueError("操作員治理復原演練沒有完成全部必要驗證。")
    if receipt.get("restoreTarget") != "isolated-temporary-sqlite":
        raise ValueError("操作員治理復原演練未使用隔離暫存 SQLite。")
    if receipt.get("result") != "passed":
        raise ValueError("操作員治理復原演練不是通過結果。")
    if (
        receipt["productionSnapshotFingerprintBefore"]
        != receipt["productionSnapshotFingerprintAfter"]
    ):
        raise ValueError("操作員治理復原演練期間正式治理資料已變更。")
    privacy = receipt.get("privacy")
    if privacy != {
        "containsPassphrase": False,
        "containsPassword": False,
        "containsUsername": False,
        "containsServerPath": False,
    }:
        raise ValueError("操作員治理復原演練收據的隱私邊界不正確。")
    if receipt.get("receiptFingerprint") != _receipt_fingerprint(receipt):
        raise ValueError("操作員治理復原演練收據指紋驗證失敗。")
    return dict(receipt)


def perform_receiver_operator_governance_recovery_drill(
    store: ReceiverOperatorStore,
    backup: Any,
    passphrase: str,
    *,
    recovery_username: str,
    recovery_password: str,
    performed_at: str | None = None,
) -> dict[str, Any]:
    normalized, backup_snapshot = decrypt_receiver_operator_governance_backup(backup, passphrase)
    before_snapshot = store.governance_snapshot()
    before_fingerprint = receiver_operator_snapshot_fingerprint(before_snapshot)
    with tempfile.TemporaryDirectory(prefix="receiver-operator-recovery-drill-") as directory:
        temporary_store = ReceiverOperatorStore(Path(directory) / "drill.sqlite3")
        bootstrap = temporary_store.bootstrap(
            "drill-bootstrap",
            "隔離復原演練啟動帳號",
            "Temporary-Drill-2026!",
        )
        restored = restore_receiver_operator_governance_backup(
            temporary_store,
            normalized,
            passphrase,
            current_actor_operator_id=bootstrap["id"],
            recovery_username=recovery_username,
            recovery_password=recovery_password,
            restore_confirmed=True,
        )
        temporary_store.authenticate(recovery_username, recovery_password)
        audit = temporary_store.list_audit_events()
        if not audit["chainValid"] or audit["events"][0]["eventType"] != "operator-governance-restored":
            raise ValueError("隔離復原後的操作員治理稽核鏈驗證失敗。")
        if restored["restoreEventFingerprint"] != audit["events"][0]["eventFingerprint"]:
            raise ValueError("隔離復原事件指紋與稽核鏈不一致。")
    after_snapshot = store.governance_snapshot()
    after_fingerprint = receiver_operator_snapshot_fingerprint(after_snapshot)
    if before_snapshot != after_snapshot or before_fingerprint != after_fingerprint:
        raise ValueError("復原演練期間正式操作員治理資料發生異動，拒絕產生通過收據。")
    performed_at = performed_at or _now_iso()
    _parse_time(performed_at, "操作員治理復原演練時間")
    receipt: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_OPERATOR_RECOVERY_DRILL_KIND,
        "performedAt": performed_at,
        "backupFingerprint": normalized["backupFingerprint"],
        "backupSnapshotFingerprint": normalized["summary"]["snapshotFingerprint"],
        "operatorCount": normalized["summary"]["operatorCount"],
        "activeAdminCount": normalized["summary"]["activeAdminCount"],
        "auditEventCount": normalized["summary"]["auditEventCount"],
        "backupEnvelopeValidated": True,
        "encryptedSnapshotDecrypted": True,
        "backupAdminAuthenticated": True,
        "restoreTarget": "isolated-temporary-sqlite",
        "isolatedRestoreCompleted": True,
        "isolatedRestoreEventFingerprint": restored["restoreEventFingerprint"],
        "isolatedRestoredSnapshotFingerprint": restored["restoredSnapshotFingerprint"],
        "restoredAuditChainValid": True,
        "productionSnapshotFingerprintBefore": before_fingerprint,
        "productionSnapshotFingerprintAfter": after_fingerprint,
        "productionGovernanceUnchangedDuringDrill": True,
        "result": "passed",
        "privacy": {
            "containsPassphrase": False,
            "containsPassword": False,
            "containsUsername": False,
            "containsServerPath": False,
        },
    }
    receipt["receiptFingerprint"] = _receipt_fingerprint(receipt)
    receipt = validate_receiver_operator_recovery_drill_receipt(receipt)
    filename = (
        f"recovery-drill-{_timestamp_token(performed_at)}-"
        f"{receipt['receiptFingerprint']}.json"
    )
    path = _drill_directory(store) / filename
    _write_json_exclusive(path, receipt)
    try:
        saved = validate_receiver_operator_recovery_drill_receipt(
            json.loads(path.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        path.unlink(missing_ok=True)
        raise ValueError("復原演練收據落地後重新驗證失敗，已移除不完整檔案。") from exc
    return {"receipt": saved, "receiptFileName": filename}


def list_receiver_operator_governance_recovery_inventory(
    store: ReceiverOperatorStore,
    *,
    drill_max_age_days: int = 30,
    now: datetime | None = None,
) -> dict[str, Any]:
    if drill_max_age_days < 1 or drill_max_age_days > 365:
        raise ValueError("復原演練最長允許天數須為 1 至 365 天。")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    managed_items: list[dict[str, Any]] = []
    invalid_backup_files: list[dict[str, str]] = []
    directory = _managed_directory(store)
    for path in sorted(directory.glob("*.json")) if directory.is_dir() else ():
        try:
            managed_items.append(_managed_backup_item(path, now=current))
        except ValueError as exc:
            invalid_backup_files.append({"fileName": path.name, "error": str(exc)})
    managed_items.sort(key=lambda item: item["exportedAt"], reverse=True)

    drills: list[dict[str, Any]] = []
    invalid_drill_files: list[dict[str, str]] = []
    drill_directory = _drill_directory(store)
    for path in sorted(drill_directory.glob("*.json")) if drill_directory.is_dir() else ():
        match = _DRILL_RECEIPT_PATTERN.fullmatch(path.name)
        try:
            if match is None:
                raise ValueError("復原演練收據檔名格式不正確。")
            receipt = validate_receiver_operator_recovery_drill_receipt(
                json.loads(path.read_text(encoding="utf-8"))
            )
            if receipt["receiptFingerprint"] != match.group("fingerprint"):
                raise ValueError("復原演練收據檔名與指紋不一致。")
            drills.append({**receipt, "receiptFileName": path.name})
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            invalid_drill_files.append({"fileName": path.name, "error": str(exc)})
    drills.sort(key=lambda item: item["performedAt"], reverse=True)

    issues: list[dict[str, str]] = []
    active_items = [item for item in managed_items if not item["expired"]]
    if invalid_backup_files:
        issues.append({"code": "invalid-managed-backup", "message": "受管制備份目錄含有無法驗證的檔案。"})
    if invalid_drill_files:
        issues.append({"code": "invalid-drill-receipt", "message": "復原演練目錄含有無法驗證的收據。"})
    if not managed_items:
        issues.append({"code": "no-managed-backup", "message": "尚無受管制本機治理備份。"})
    elif not active_items:
        issues.append({"code": "all-managed-backups-expired", "message": "所有受管制本機治理備份均已超過保存期限。"})
    latest_active = active_items[0] if active_items else None
    latest_drill = next(
        (
            item for item in drills
            if latest_active and item["backupFingerprint"] == latest_active["backupFingerprint"]
        ),
        None,
    )
    if latest_active and latest_drill is None:
        issues.append({"code": "latest-backup-not-drilled", "message": "最新有效受管制備份尚未完成隔離復原演練。"})
    elif latest_drill is not None:
        drill_age = (current - _parse_time(latest_drill["performedAt"], "復原演練時間")).total_seconds()
        if drill_age > drill_max_age_days * 86400:
            issues.append({"code": "latest-drill-overdue", "message": f"最新有效備份的復原演練已超過 {drill_max_age_days} 天。"})
    return {
        "generatedAt": current.isoformat().replace("+00:00", "Z"),
        "scope": "local-server-only",
        "managedBackups": managed_items,
        "drillReceipts": drills[:20],
        "invalidBackupFiles": invalid_backup_files,
        "invalidDrillFiles": invalid_drill_files,
        "health": {
            "status": "healthy" if not issues else "attention-required",
            "issueCount": len(issues),
            "issues": issues,
            "drillMaxAgeDays": drill_max_age_days,
            "latestActiveBackupFingerprint": latest_active["backupFingerprint"] if latest_active else None,
            "latestMatchingDrillReceiptFingerprint": latest_drill["receiptFingerprint"] if latest_drill else None,
        },
        "retentionBoundary": {
            "automaticDeletion": False,
            "secureEraseGuaranteed": False,
            "expiredFilesRequireStorageAdministratorDisposition": True,
        },
    }


__all__ = [
    "RECEIVER_OPERATOR_RECOVERY_DRILL_KIND",
    "list_receiver_operator_governance_recovery_inventory",
    "perform_receiver_operator_governance_recovery_drill",
    "validate_receiver_operator_recovery_drill_receipt",
    "write_managed_receiver_operator_governance_backup",
]
