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
RECEIVER_OPERATOR_BACKUP_DISPOSITION_RECEIPT_KIND = (
    "receiver-operator-governance-backup-disposition-receipt"
)
_MANAGED_BACKUP_PATTERN = re.compile(
    r"^managed-(?P<exported>\d{8}T\d{6}Z)-expires-(?P<expires>\d{8}T\d{6}Z)-"
    r"(?P<fingerprint>ROB-[0-9A-F]{20})\.json$"
)
_DRILL_RECEIPT_PATTERN = re.compile(
    r"^recovery-drill-(?P<performed>\d{8}T\d{6}Z)-(?P<fingerprint>ROD-[0-9A-F]{20})\.json$"
)
_DISPOSITION_RECEIPT_PATTERN = re.compile(
    r"^backup-disposition-(?P<completed>\d{8}T\d{6}Z)-"
    r"(?P<fingerprint>RBD-[0-9A-F]{20})\.json$"
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


def _text_sha256(value: str) -> str:
    return "SHA256-" + hashlib.sha256(value.encode("utf-8")).hexdigest().upper()


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


def _disposition_directory(store: ReceiverOperatorStore) -> Path:
    return store.db_path.parent / "receiver_operator_governance_dispositions"


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
        "backupDispositionClaimCount": normalized["summary"].get(
            "backupDispositionClaimCount",
            0,
        ),
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


def _disposition_receipt_fingerprint(receipt: dict[str, Any]) -> str:
    payload = {key: value for key, value in receipt.items() if key != "receiptFingerprint"}
    return "RBD-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def validate_receiver_operator_backup_disposition_receipt(
    receipt: Any,
) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise ValueError("操作員治理備份處置收據必須是 JSON 物件。")
    if (
        receipt.get("schemaVersion") != 1
        or receipt.get("kind") != RECEIVER_OPERATOR_BACKUP_DISPOSITION_RECEIPT_KIND
    ):
        raise ValueError("操作員治理備份處置收據版本或種類不受支援。")
    fingerprint_rules = {
        "requestFingerprint": r"RBR-[0-9A-F]{20}",
        "backupFingerprint": r"ROB-[0-9A-F]{20}",
        "snapshotFingerprint": r"ROG-[0-9A-F]{20}",
        "managedFileSha256": r"SHA256-[0-9A-F]{64}",
        "caseReferenceSha256": r"SHA256-[0-9A-F]{64}",
        "basisSha256": r"SHA256-[0-9A-F]{64}",
        "requestedByOperatorId": r"ROP-[0-9A-F]{20}",
        "approvedByOperatorId": r"ROP-[0-9A-F]{20}",
        "completionOperatorId": r"ROP-[0-9A-F]{20}",
        "receiptFingerprint": r"RBD-[0-9A-F]{20}",
    }
    if any(
        not re.fullmatch(pattern, str(receipt.get(field) or ""))
        for field, pattern in fingerprint_rules.items()
    ):
        raise ValueError("操作員治理備份處置收據的指紋或操作員 ID 格式不正確。")
    if receipt["requestedByOperatorId"] == receipt["approvedByOperatorId"]:
        raise ValueError("操作員治理備份處置收據的申請人與覆核人不得相同。")
    managed_file_name = str(receipt.get("managedFileName") or "").strip()
    if (
        not managed_file_name
        or len(managed_file_name) > 240
        or Path(managed_file_name).name != managed_file_name
        or not managed_file_name.endswith(".json")
    ):
        raise ValueError("操作員治理備份處置收據的受管制檔名不正確。")
    times = {
        field: _parse_time(receipt.get(field), label)
        for field, label in (
            ("exportedAt", "操作員治理備份匯出時間"),
            ("retentionUntil", "操作員治理備份保存期限"),
            ("requestedAt", "操作員治理備份處置申請時間"),
            ("expiresAt", "操作員治理備份處置覆核期限"),
            ("approvedAt", "操作員治理備份處置覆核時間"),
            ("completedAt", "操作員治理備份處置完成時間"),
        )
    }
    if not (
        times["exportedAt"] < times["retentionUntil"] <= times["requestedAt"]
        <= times["approvedAt"] <= times["expiresAt"]
        and times["approvedAt"] <= times["completedAt"]
    ):
        raise ValueError("操作員治理備份處置收據的時間順序不正確。")
    if times["completedAt"] > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("操作員治理備份處置完成時間不可晚於目前時間。")
    disposition = receipt.get("disposition")
    if disposition != {
        "trigger": "explicit-two-person-approved-expired-backup-disposition",
        "managedFileAbsentAfterDisposition": True,
        "automaticExpiryDeletion": False,
        "ordinaryFilesystemEntryRemovalOnly": True,
        "secureEraseGuaranteed": False,
        "otherCopiesMayRemain": True,
    }:
        raise ValueError("操作員治理備份處置收據的刪除語意邊界不正確。")
    privacy = receipt.get("privacy")
    if privacy != {
        "containsPassphrase": False,
        "containsPassword": False,
        "containsUsername": False,
        "containsServerPath": False,
    }:
        raise ValueError("操作員治理備份處置收據的隱私邊界不正確。")
    if receipt.get("receiptFingerprint") != _disposition_receipt_fingerprint(receipt):
        raise ValueError("操作員治理備份處置收據指紋驗證失敗。")
    return dict(receipt)


def request_receiver_operator_backup_disposition(
    store: ReceiverOperatorStore,
    backup_fingerprint: str,
    *,
    actor_operator_id: str,
    case_reference: str,
    basis: str,
    request_confirmed: bool,
    now: datetime | None = None,
) -> dict[str, Any]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    directory = _managed_directory(store)
    items: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")) if directory.is_dir() else ():
        try:
            items.append(_managed_backup_item(path, now=current))
        except ValueError:
            continue
    item = next(
        (candidate for candidate in items if candidate["backupFingerprint"] == backup_fingerprint),
        None,
    )
    if item is None:
        raise ValueError("找不到指定且可驗證的受管制本機治理備份。")
    if not item["expired"]:
        raise ValueError("受管制本機治理備份尚未到期，不得提出到期處置申請。")
    return store.create_backup_disposition_request(
        actor_operator_id,
        item,
        case_reference=case_reference,
        basis=basis,
        request_confirmed=request_confirmed,
    )


def approve_receiver_operator_backup_disposition(
    store: ReceiverOperatorStore,
    request_fingerprint: str,
    *,
    actor_operator_id: str,
    approval_confirmed: bool,
) -> dict[str, Any]:
    approval = store.prepare_backup_disposition_approval(
        actor_operator_id,
        request_fingerprint,
        approval_confirmed=approval_confirmed,
    )
    claim = approval["claim"]
    path = _managed_directory(store) / claim["managedFileName"]
    removed_during_call = False
    if path.exists():
        item = _managed_backup_item(path, now=datetime.now(timezone.utc))
        expected = {
            "backupFingerprint": claim["backupFingerprint"],
            "snapshotFingerprint": claim["snapshotFingerprint"],
            "fileName": claim["managedFileName"],
            "fileSha256": claim["managedFileSha256"],
            "exportedAt": claim["exportedAt"],
            "retentionUntil": claim["retentionUntil"],
        }
        if any(item[field] != value for field, value in expected.items()):
            raise ValueError("受管制備份已在申請後變更，拒絕執行處置。")
        if not item["expired"]:
            raise ValueError("受管制備份目前未到期，拒絕執行處置。")
        path.unlink()
        removed_during_call = True
    if path.exists():
        raise ValueError("受管制備份仍存在於管理目錄，未完成處置。")
    claim = store.reserve_backup_disposition_completion(
        actor_operator_id,
        request_fingerprint,
    )
    receipt: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_OPERATOR_BACKUP_DISPOSITION_RECEIPT_KIND,
        "completedAt": claim["completedAt"],
        "requestFingerprint": claim["requestFingerprint"],
        "backupFingerprint": claim["backupFingerprint"],
        "snapshotFingerprint": claim["snapshotFingerprint"],
        "managedFileName": claim["managedFileName"],
        "managedFileSha256": claim["managedFileSha256"],
        "exportedAt": claim["exportedAt"],
        "retentionUntil": claim["retentionUntil"],
        "requestedByOperatorId": claim["requestedByOperatorId"],
        "requestedAt": claim["requestedAt"],
        "expiresAt": claim["expiresAt"],
        "approvedByOperatorId": claim["approvedByOperatorId"],
        "approvedAt": claim["approvedAt"],
        "completionOperatorId": claim["completionOperatorId"],
        "caseReferenceSha256": _text_sha256(claim["caseReference"]),
        "basisSha256": _text_sha256(claim["basis"]),
        "disposition": {
            "trigger": "explicit-two-person-approved-expired-backup-disposition",
            "managedFileAbsentAfterDisposition": True,
            "automaticExpiryDeletion": False,
            "ordinaryFilesystemEntryRemovalOnly": True,
            "secureEraseGuaranteed": False,
            "otherCopiesMayRemain": True,
        },
        "privacy": {
            "containsPassphrase": False,
            "containsPassword": False,
            "containsUsername": False,
            "containsServerPath": False,
        },
    }
    receipt["receiptFingerprint"] = _disposition_receipt_fingerprint(receipt)
    receipt = validate_receiver_operator_backup_disposition_receipt(receipt)
    claim = store.reserve_backup_disposition_receipt(
        request_fingerprint,
        completion_operator_id=claim["completionOperatorId"],
        completed_at=claim["completedAt"],
        receipt_fingerprint=receipt["receiptFingerprint"],
    )
    filename = (
        f"backup-disposition-{_timestamp_token(claim['completedAt'])}-"
        f"{receipt['receiptFingerprint']}.json"
    )
    receipt_path = _disposition_directory(store) / filename
    if receipt_path.exists():
        existing = validate_receiver_operator_backup_disposition_receipt(
            json.loads(receipt_path.read_text(encoding="utf-8"))
        )
        if existing != receipt:
            raise ValueError("既有到期備份處置收據與保留內容不一致。")
    else:
        _write_json_exclusive(receipt_path, receipt)
    saved = validate_receiver_operator_backup_disposition_receipt(
        json.loads(receipt_path.read_text(encoding="utf-8"))
    )
    completed = store.complete_backup_disposition(
        actor_operator_id,
        request_fingerprint,
    )
    return {
        "request": completed["claim"],
        "receipt": saved,
        "receiptFileName": filename,
        "managedFileRemovedDuringCall": removed_during_call,
        "completionRecoveredAfterInterruption": not removed_during_call,
        "approvalAuditEventFingerprint": approval["approvalAuditEventFingerprint"],
        "completionAuditEventFingerprint": completed["completionAuditEventFingerprint"],
    }


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

    disposition_claims = store.backup_disposition_claims()
    disposition_receipts: list[dict[str, Any]] = []
    invalid_disposition_files: list[dict[str, str]] = []
    disposition_directory = _disposition_directory(store)
    for path in (
        sorted(disposition_directory.glob("*.json"))
        if disposition_directory.is_dir()
        else ()
    ):
        match = _DISPOSITION_RECEIPT_PATTERN.fullmatch(path.name)
        try:
            if match is None:
                raise ValueError("備份處置收據檔名格式不正確。")
            receipt = validate_receiver_operator_backup_disposition_receipt(
                json.loads(path.read_text(encoding="utf-8"))
            )
            if receipt["receiptFingerprint"] != match.group("fingerprint"):
                raise ValueError("備份處置收據檔名與指紋不一致。")
            if _timestamp_token(receipt["completedAt"]) != match.group("completed"):
                raise ValueError("備份處置收據檔名與完成時間不一致。")
            disposition_receipts.append({**receipt, "receiptFileName": path.name})
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            invalid_disposition_files.append({"fileName": path.name, "error": str(exc)})
    disposition_receipts.sort(key=lambda item: item["completedAt"], reverse=True)

    issues: list[dict[str, str]] = []
    active_items = [item for item in managed_items if not item["expired"]]
    if invalid_backup_files:
        issues.append({"code": "invalid-managed-backup", "message": "受管制備份目錄含有無法驗證的檔案。"})
    if invalid_drill_files:
        issues.append({"code": "invalid-drill-receipt", "message": "復原演練目錄含有無法驗證的收據。"})
    if invalid_disposition_files:
        issues.append({
            "code": "invalid-backup-disposition-receipt",
            "message": "到期備份處置目錄含有無法驗證的收據。",
        })
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
    claims_by_backup: dict[str, list[dict[str, Any]]] = {}
    for claim in disposition_claims:
        claims_by_backup.setdefault(claim["backupFingerprint"], []).append(claim)
    receipt_by_fingerprint = {
        receipt["receiptFingerprint"]: receipt
        for receipt in disposition_receipts
    }
    managed_by_fingerprint = {
        item["backupFingerprint"]: item
        for item in managed_items
    }
    for item in managed_items:
        if not item["expired"]:
            continue
        claims = claims_by_backup.get(item["backupFingerprint"], [])
        current_claim = next(
            (
                claim for claim in claims
                if claim["state"] in {"pending", "removal-in-progress", "completed"}
            ),
            None,
        )
        if current_claim is None:
            issues.append({
                "code": "expired-backup-disposition-required",
                "message": f"到期備份 {item['backupFingerprint']} 尚未提出雙人處置申請。",
            })
        elif current_claim["state"] == "pending":
            issues.append({
                "code": "expired-backup-disposition-pending-review",
                "message": f"到期備份 {item['backupFingerprint']} 的處置申請尚待第二人覆核。",
            })
        elif current_claim["state"] == "removal-in-progress":
            issues.append({
                "code": "expired-backup-disposition-incomplete",
                "message": f"到期備份 {item['backupFingerprint']} 的已核准處置尚未結案。",
            })
        else:
            issues.append({
                "code": "completed-disposition-file-still-present",
                "message": f"已完成處置的備份 {item['backupFingerprint']} 仍存在受管制目錄。",
            })
    for claim in disposition_claims:
        if claim["state"] == "removal-in-progress" and (
            claim["backupFingerprint"] not in managed_by_fingerprint
            or claim["completionOperatorId"] is not None
        ):
            issues.append({
                "code": "backup-disposition-completion-recovery-required",
                "message": f"處置申請 {claim['requestFingerprint']} 中斷，須由覆核帳號重新執行以完成收據與結案。",
            })
        if claim["state"] == "completed":
            receipt = receipt_by_fingerprint.get(claim["receiptFingerprint"])
            if (
                receipt is None
                or receipt["requestFingerprint"] != claim["requestFingerprint"]
                or receipt["backupFingerprint"] != claim["backupFingerprint"]
                or receipt["caseReferenceSha256"] != _text_sha256(claim["caseReference"])
                or receipt["basisSha256"] != _text_sha256(claim["basis"])
            ):
                issues.append({
                    "code": "completed-disposition-receipt-missing",
                    "message": f"已完成處置 {claim['requestFingerprint']} 缺少相符的不可覆寫收據。",
                })
    return {
        "generatedAt": current.isoformat().replace("+00:00", "Z"),
        "scope": "local-server-only",
        "managedBackups": managed_items,
        "drillReceipts": drills[:20],
        "invalidBackupFiles": invalid_backup_files,
        "invalidDrillFiles": invalid_drill_files,
        "backupDispositionRequests": disposition_claims,
        "backupDispositionReceipts": disposition_receipts[:50],
        "invalidBackupDispositionFiles": invalid_disposition_files,
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
            "explicitTwoPersonDispositionRequired": True,
            "approvedDispositionUsesOrdinaryFilesystemEntryRemoval": True,
            "secureEraseGuaranteed": False,
            "expiredFilesRequireStorageAdministratorDisposition": True,
            "otherCopiesMayRemain": True,
        },
    }


__all__ = [
    "RECEIVER_OPERATOR_BACKUP_DISPOSITION_RECEIPT_KIND",
    "RECEIVER_OPERATOR_RECOVERY_DRILL_KIND",
    "approve_receiver_operator_backup_disposition",
    "list_receiver_operator_governance_recovery_inventory",
    "perform_receiver_operator_governance_recovery_drill",
    "request_receiver_operator_backup_disposition",
    "validate_receiver_operator_backup_disposition_receipt",
    "validate_receiver_operator_recovery_drill_receipt",
    "write_managed_receiver_operator_governance_backup",
]
