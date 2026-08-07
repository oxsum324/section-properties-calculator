from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
from typing import Any
from uuid import uuid4

from .receiver_trust_backup import (
    build_receiver_trust_registry_backup,
    restore_receiver_trust_registry_backup,
    validate_receiver_trust_registry_backup,
)
from .receiver_trust_store import ReceiverTrustStore, _canonical_json_bytes


RECEIVER_TRUST_RECOVERY_DRILL_KIND = "receiver-trust-registry-recovery-drill-receipt"
RECEIVER_TRUST_BACKUP_HEALTH_TRANSITION_KIND = "rvr-backup-health-transition"
RECEIVER_TRUST_BACKUP_HEALTH_STATUS_KIND = "rvr-backup-health-status"
RECEIVER_TRUST_BACKUP_HEALTH_HISTORY_KIND = "rvr-backup-health-history"
_HEALTH_STATES = {"healthy", "attention-required"}
_HEALTH_EVENT_STATES = _HEALTH_STATES | {"unobserved"}


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


def _health_event_fingerprint(event: dict[str, Any]) -> str:
    payload = {key: value for key, value in event.items() if key != "eventFingerprint"}
    return "RBH-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


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


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary_path.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _validate_health_issue_codes(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("備份健康摘要的問題代碼必須是陣列。")
    codes: list[str] = []
    for item in value:
        if not isinstance(item, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", item):
            raise ValueError("備份健康摘要含有格式不正確的問題代碼。")
        if item in codes:
            raise ValueError("備份健康摘要的問題代碼不得重複。")
        codes.append(item)
    return sorted(codes)


def validate_receiver_trust_backup_health_status(status: Any) -> dict[str, Any]:
    if not isinstance(status, dict):
        raise ValueError("備份健康摘要必須是 JSON 物件。")
    if status.get("schemaVersion") != 1 or status.get("kind") != RECEIVER_TRUST_BACKUP_HEALTH_STATUS_KIND:
        raise ValueError("備份健康摘要版本或種類不受支援。")
    checked_at = _parse_time(status.get("checkedAt"), "備份健康檢查時間")
    if checked_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("備份健康檢查時間不可晚於目前時間。")
    health_status = status.get("status")
    if health_status not in _HEALTH_STATES:
        raise ValueError("備份健康摘要的狀態不受支援。")
    issue_codes = _validate_health_issue_codes(status.get("issueCodes"))
    if status.get("issueCount") != len(issue_codes):
        raise ValueError("備份健康摘要的問題數與問題代碼不一致。")
    if health_status == "healthy" and issue_codes:
        raise ValueError("正常的備份健康摘要不得含有問題代碼。")
    if health_status == "attention-required" and not issue_codes:
        raise ValueError("需要處理的備份健康摘要必須含有問題代碼。")
    privacy = status.get("privacy")
    if not isinstance(privacy, dict) or privacy.get("scope") != "local-only":
        raise ValueError("備份健康摘要必須標示為僅限本機。")
    if privacy.get("containsPaths") is not False or privacy.get("containsRegistryContent") is not False:
        raise ValueError("備份健康摘要不得含有路徑或信任清冊內容。")
    return dict(status)


def validate_receiver_trust_backup_health_transition(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict):
        raise ValueError("備份健康轉換紀錄必須是 JSON 物件。")
    if event.get("schemaVersion") != 1 or event.get("kind") != RECEIVER_TRUST_BACKUP_HEALTH_TRANSITION_KIND:
        raise ValueError("備份健康轉換紀錄版本或種類不受支援。")
    observed_at = _parse_time(event.get("observedAt"), "備份健康轉換時間")
    if observed_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("備份健康轉換時間不可晚於目前時間。")
    if event.get("fromStatus") not in _HEALTH_EVENT_STATES or event.get("toStatus") not in _HEALTH_STATES:
        raise ValueError("備份健康轉換紀錄含有不受支援的狀態。")
    issue_codes = _validate_health_issue_codes(event.get("issueCodes"))
    if event.get("issueCount") != len(issue_codes):
        raise ValueError("備份健康轉換紀錄的問題數與問題代碼不一致。")
    if event.get("toStatus") == "healthy" and issue_codes:
        raise ValueError("轉為正常的備份健康紀錄不得含有問題代碼。")
    if event.get("toStatus") == "attention-required" and not issue_codes:
        raise ValueError("轉為需要處理的備份健康紀錄必須含有問題代碼。")
    for field in ("evidenceStatus", "backupTaskState"):
        if event.get(field) is not None and not isinstance(event.get(field), str):
            raise ValueError("備份健康轉換紀錄含有格式不正確的狀態欄位。")
    if event.get("backupTaskLastTaskResult") is not None and not isinstance(event.get("backupTaskLastTaskResult"), int):
        raise ValueError("備份健康轉換紀錄的排程結果格式不正確。")
    previous = event.get("previousEventFingerprint")
    if previous is not None and not re.fullmatch(r"RBH-[0-9A-F]{20}", str(previous)):
        raise ValueError("備份健康轉換紀錄的前筆指紋格式不正確。")
    if not re.fullmatch(r"RBH-[0-9A-F]{20}", str(event.get("eventFingerprint") or "")):
        raise ValueError("備份健康轉換紀錄的指紋格式不正確。")
    if event.get("eventFingerprint") != _health_event_fingerprint(event):
        raise ValueError("備份健康轉換紀錄指紋驗證失敗。")
    return dict(event)


def _read_receiver_trust_backup_health_transitions(directory: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for path in directory.glob("RVR-backup-health-event-*.json") if directory.is_dir() else ():
        try:
            event = validate_receiver_trust_backup_health_transition(
                json.loads(path.read_text(encoding="utf-8"))
            )
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"無法驗證備份健康轉換紀錄：{path.name}") from exc
        if not path.name.endswith(f"-{event['eventFingerprint']}.json"):
            raise ValueError(f"備份健康轉換紀錄檔名與指紋不一致：{path.name}")
        events.append(event)
    events.sort(key=lambda item: _parse_time(item["observedAt"], "備份健康轉換時間"))
    previous: str | None = None
    for event in events:
        if event["previousEventFingerprint"] != previous:
            raise ValueError("備份健康轉換紀錄的串鏈驗證失敗。")
        previous = event["eventFingerprint"]
    return events


def _build_receiver_trust_backup_health_history(
    events: list[dict[str, Any]],
    *,
    max_items: int,
) -> dict[str, Any]:
    if max_items <= 0:
        raise ValueError("儀表板健康歷程筆數必須大於 0。")
    items = [{
        "observedAt": event["observedAt"],
        "fromStatus": event["fromStatus"],
        "toStatus": event["toStatus"],
        "issueCount": event["issueCount"],
        "issueCodes": event["issueCodes"],
        "evidenceStatus": event["evidenceStatus"],
        "backupTaskState": event["backupTaskState"],
        "backupTaskLastTaskResult": event["backupTaskLastTaskResult"],
    } for event in reversed(events[-max_items:])]
    return {
        "schemaVersion": 1,
        "kind": RECEIVER_TRUST_BACKUP_HEALTH_HISTORY_KIND,
        "generatedAt": _now_iso(),
        "itemCount": len(items),
        "items": items,
        "privacy": {
            "scope": "local-only",
            "containsPaths": False,
            "containsRegistryContent": False,
            "containsEvidenceFingerprints": False,
        },
    }


def record_receiver_trust_backup_health_transition(
    status: Any,
    history_directory: Path,
    dashboard_history_path: Path,
    *,
    max_items: int = 24,
) -> dict[str, Any]:
    current = validate_receiver_trust_backup_health_status(status)
    events = _read_receiver_trust_backup_health_transitions(history_directory)
    issue_codes = _validate_health_issue_codes(current["issueCodes"])
    latest = events[-1] if events else None
    unchanged = bool(
        latest
        and latest["toStatus"] == current["status"]
        and latest["issueCodes"] == issue_codes
    )
    event_path: Path | None = None
    if not unchanged:
        observed_at = current["checkedAt"]
        if latest and _parse_time(observed_at, "備份健康檢查時間") <= _parse_time(
            latest["observedAt"], "備份健康轉換時間"
        ):
            raise ValueError("新的備份健康轉換時間必須晚於既有紀錄。")
        evidence = current.get("evidence") if isinstance(current.get("evidence"), dict) else {}
        task = current.get("backupTask") if isinstance(current.get("backupTask"), dict) else {}
        event: dict[str, Any] = {
            "schemaVersion": 1,
            "kind": RECEIVER_TRUST_BACKUP_HEALTH_TRANSITION_KIND,
            "observedAt": observed_at,
            "fromStatus": latest["toStatus"] if latest else "unobserved",
            "toStatus": current["status"],
            "issueCount": len(issue_codes),
            "issueCodes": issue_codes,
            "evidenceStatus": evidence.get("status") if isinstance(evidence.get("status"), str) else None,
            "backupTaskState": task.get("state") if isinstance(task.get("state"), str) else None,
            "backupTaskLastTaskResult": task.get("lastTaskResult") if isinstance(task.get("lastTaskResult"), int) else None,
            "previousEventFingerprint": latest["eventFingerprint"] if latest else None,
        }
        event["eventFingerprint"] = _health_event_fingerprint(event)
        event = validate_receiver_trust_backup_health_transition(event)
        event_path = history_directory / (
            f"RVR-backup-health-event-{_timestamp_token(observed_at)}-"
            f"{event['eventFingerprint']}.json"
        )
        _write_json_exclusive(event_path, event)
        try:
            saved = validate_receiver_trust_backup_health_transition(
                json.loads(event_path.read_text(encoding="utf-8"))
            )
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            event_path.unlink(missing_ok=True)
            raise ValueError("備份健康轉換紀錄落地後重新驗證失敗，已移除不完整檔案。") from exc
        events.append(saved)
    dashboard_history = _build_receiver_trust_backup_health_history(events, max_items=max_items)
    try:
        _write_json_atomic(dashboard_history_path, dashboard_history)
    except Exception:
        if event_path is not None:
            event_path.unlink(missing_ok=True)
        raise
    return {
        "status": "unchanged" if unchanged else "transition-recorded",
        "eventPath": str(event_path) if event_path else None,
        "eventFingerprint": events[-1]["eventFingerprint"] if events else None,
        "dashboardHistoryPath": str(dashboard_history_path),
        "transitionCount": len(events),
        "dashboardItemCount": dashboard_history["itemCount"],
    }


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
    "RECEIVER_TRUST_BACKUP_HEALTH_HISTORY_KIND",
    "RECEIVER_TRUST_BACKUP_HEALTH_STATUS_KIND",
    "RECEIVER_TRUST_BACKUP_HEALTH_TRANSITION_KIND",
    "RECEIVER_TRUST_RECOVERY_DRILL_KIND",
    "evaluate_receiver_trust_backup_directory",
    "perform_receiver_trust_registry_recovery_drill",
    "record_receiver_trust_backup_health_transition",
    "validate_receiver_trust_backup_health_status",
    "validate_receiver_trust_backup_health_transition",
    "validate_receiver_trust_recovery_drill_receipt",
    "validate_receiver_trust_registry_backup_file",
    "write_receiver_trust_registry_backup",
]
