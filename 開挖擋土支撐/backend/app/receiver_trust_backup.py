from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any

from .receiver_trust_store import ReceiverTrustStore, _canonical_json_bytes


RECEIVER_TRUST_BACKUP_KIND = "receiver-verification-trust-registry-backup"
RECEIVER_TRUST_REGISTRY_KIND = "receiver-verification-trust-registry"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_exported_at(value: Any) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("信任清冊備份的匯出時間格式不正確。") from exc
    if parsed.tzinfo is None:
        raise ValueError("信任清冊備份的匯出時間必須包含時區。")
    if parsed.astimezone(timezone.utc) > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("信任清冊備份的匯出時間不可晚於目前時間。")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_public_only(value: Any, path: str = "backup") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = str(key).lower()
            if any(token in lowered for token in ("private", "password", "secret")):
                raise ValueError(f"信任清冊備份不得包含私密欄位：{path}.{key}")
            _ensure_public_only(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _ensure_public_only(item, f"{path}[{index}]")


def receiver_trust_registry_fingerprint(keys: list[dict[str, Any]], events: list[dict[str, Any]]) -> str:
    payload = {
        "schemaVersion": 1,
        "kind": RECEIVER_TRUST_REGISTRY_KIND,
        "keys": keys,
        "events": events,
    }
    return "RTR-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def _backup_fingerprint(backup: dict[str, Any]) -> str:
    payload = {key: value for key, value in backup.items() if key != "backupFingerprint"}
    return "RTB-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def build_receiver_trust_registry_backup(
    store: ReceiverTrustStore,
    *,
    exported_at: str | None = None,
) -> dict[str, Any]:
    snapshot = store.snapshot()
    keys = snapshot["keys"]
    events = snapshot["events"]
    exported_at = _parse_exported_at(exported_at or _now_iso())
    registry_fingerprint = receiver_trust_registry_fingerprint(keys, events)
    backup: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_TRUST_BACKUP_KIND,
        "exportedAt": exported_at,
        "registry": {
            "schemaVersion": 1,
            "kind": RECEIVER_TRUST_REGISTRY_KIND,
            "keys": keys,
            "events": events,
            "keyCount": len(keys),
            "eventCount": len(events),
            "chainHeadEventFingerprint": events[-1]["eventFingerprint"] if events else None,
            "registryFingerprint": registry_fingerprint,
        },
    }
    backup["backupFingerprint"] = _backup_fingerprint(backup)
    _ensure_public_only(backup)
    return validate_receiver_trust_registry_backup(backup)


def validate_receiver_trust_registry_backup(backup: Any) -> dict[str, Any]:
    if not isinstance(backup, dict):
        raise ValueError("信任清冊備份必須是 JSON 物件。")
    _ensure_public_only(backup)
    if backup.get("schemaVersion") != 1 or backup.get("kind") != RECEIVER_TRUST_BACKUP_KIND:
        raise ValueError("信任清冊備份版本或種類不受支援。")
    exported_at = _parse_exported_at(backup.get("exportedAt"))
    registry = backup.get("registry")
    if not isinstance(registry, dict):
        raise ValueError("信任清冊備份缺少 registry 快照。")
    if registry.get("schemaVersion") != 1 or registry.get("kind") != RECEIVER_TRUST_REGISTRY_KIND:
        raise ValueError("信任清冊備份內的 registry 版本或種類不受支援。")
    snapshot = ReceiverTrustStore.validate_snapshot(registry.get("keys"), registry.get("events"))
    keys = snapshot["keys"]
    events = snapshot["events"]
    if registry.get("keyCount") != len(keys) or registry.get("eventCount") != len(events):
        raise ValueError("信任清冊備份的筆數摘要與實際內容不一致。")
    expected_head = events[-1]["eventFingerprint"] if events else None
    if registry.get("chainHeadEventFingerprint") != expected_head:
        raise ValueError("信任清冊備份的事件鏈尾指紋不一致。")
    registry_fingerprint = receiver_trust_registry_fingerprint(keys, events)
    if registry.get("registryFingerprint") != registry_fingerprint:
        raise ValueError("信任清冊備份的清冊指紋驗證失敗。")
    normalized = {
        "schemaVersion": 1,
        "kind": RECEIVER_TRUST_BACKUP_KIND,
        "exportedAt": exported_at,
        "registry": {
            "schemaVersion": 1,
            "kind": RECEIVER_TRUST_REGISTRY_KIND,
            "keys": keys,
            "events": events,
            "keyCount": len(keys),
            "eventCount": len(events),
            "chainHeadEventFingerprint": expected_head,
            "registryFingerprint": registry_fingerprint,
        },
        "backupFingerprint": str(backup.get("backupFingerprint", "")),
    }
    if normalized["backupFingerprint"] != _backup_fingerprint(normalized):
        raise ValueError("信任清冊備份的整包指紋驗證失敗。")
    return normalized


def preview_receiver_trust_registry_restore(
    store: ReceiverTrustStore,
    backup: Any,
) -> dict[str, Any]:
    validated = validate_receiver_trust_registry_backup(backup)
    backup_registry = validated["registry"]
    current_status = "missing" if not store.path.exists() else "valid"
    current_error: str | None = None
    try:
        current = store.snapshot()
    except ValueError as exc:
        current = {"keys": [], "events": []}
        current_status = "unreadable"
        current_error = str(exc)
    current_by_id = {item["keyId"]: item for item in current["keys"]}
    backup_by_id = {item["keyId"]: item for item in backup_registry["keys"]}
    shared_ids = sorted(set(current_by_id) & set(backup_by_id))
    status_changes = [
        {
            "keyId": key_id,
            "currentStatus": current_by_id[key_id]["status"],
            "backupStatus": backup_by_id[key_id]["status"],
        }
        for key_id in shared_ids
        if current_by_id[key_id]["status"] != backup_by_id[key_id]["status"]
    ]
    current_fingerprint = receiver_trust_registry_fingerprint(current["keys"], current["events"])
    blocking_reasons: list[str] = []
    if current_status == "valid":
        removed_key_ids = sorted(set(current_by_id) - set(backup_by_id))
        if removed_key_ids:
            blocking_reasons.append("備份會移除目前清冊既有的 Key ID。")
        if any(
            current_by_id[key_id]["status"] == "revoked" and backup_by_id[key_id]["status"] != "revoked"
            for key_id in shared_ids
        ):
            blocking_reasons.append("備份會把已撤銷金鑰恢復為受信任，違反不可逆撤銷原則。")
        backup_events = backup_registry["events"]
        if backup_events[: len(current["events"])] != current["events"]:
            blocking_reasons.append("備份事件鏈不是目前清冊的向前延伸，不得回退或改寫歷史事件。")
        for key_id in shared_ids:
            current_key = current_by_id[key_id]
            backup_key = backup_by_id[key_id]
            stable_fields = set(current_key) | set(backup_key)
            stable_fields -= {
                "status",
                "revokedAt",
                "revocationReasonCode",
                "revocationReason",
                "revokedBy",
                "revocationReference",
                "revocationEventFingerprint",
                "replacedByKeyId",
                "rotationCompletedAt",
                "rotationCompletionEventFingerprint",
                "rotationApprovalRequestFingerprint",
            }
            if any(current_key.get(field) != backup_key.get(field) for field in stable_fields):
                blocking_reasons.append(f"備份改寫既有金鑰 {key_id} 的登錄資料。")
            if current_key["status"] == "revoked" and current_key != backup_key:
                blocking_reasons.append(f"備份改寫已撤銷金鑰 {key_id} 的撤銷紀錄。")
    return {
        "backup": validated,
        "preview": {
            "currentStatus": current_status,
            "currentError": current_error,
            "currentKeyCount": len(current["keys"]),
            "currentEventCount": len(current["events"]),
            "backupKeyCount": backup_registry["keyCount"],
            "backupEventCount": backup_registry["eventCount"],
            "addedKeyIds": sorted(set(backup_by_id) - set(current_by_id)),
            "removedKeyIds": sorted(set(current_by_id) - set(backup_by_id)),
            "statusChanges": status_changes,
            "currentRegistryFingerprint": current_fingerprint,
            "backupRegistryFingerprint": backup_registry["registryFingerprint"],
            "wouldReplace": current_status != "valid" or current_fingerprint != backup_registry["registryFingerprint"],
            "restoreAllowed": not blocking_reasons,
            "blockingReasons": blocking_reasons,
        },
    }


def restore_receiver_trust_registry_backup(
    store: ReceiverTrustStore,
    backup: Any,
    *,
    restore_confirmed: bool = False,
) -> dict[str, Any]:
    preview_result = preview_receiver_trust_registry_restore(store, backup)
    if not preview_result["preview"]["restoreAllowed"]:
        reasons = " ".join(preview_result["preview"]["blockingReasons"])
        raise ValueError(f"此備份不得復原：{reasons}")
    validated = preview_result["backup"]
    registry = validated["registry"]
    restored = store.replace_snapshot(
        registry["keys"],
        registry["events"],
        restore_confirmed=restore_confirmed,
    )
    restored_fingerprint = receiver_trust_registry_fingerprint(restored["keys"], restored["events"])
    if restored_fingerprint != registry["registryFingerprint"]:
        raise ValueError("復原後的本機信任清冊指紋與備份不一致。")
    return {
        "keys": deepcopy(restored["keys"]),
        "events": deepcopy(restored["events"]),
        "safeguardPath": restored["safeguardPath"],
        "registryFingerprint": restored_fingerprint,
        "backupFingerprint": validated["backupFingerprint"],
        "preview": preview_result["preview"],
    }


__all__ = [
    "RECEIVER_TRUST_BACKUP_KIND",
    "build_receiver_trust_registry_backup",
    "preview_receiver_trust_registry_restore",
    "receiver_trust_registry_fingerprint",
    "restore_receiver_trust_registry_backup",
    "validate_receiver_trust_registry_backup",
]
