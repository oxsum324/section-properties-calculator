from __future__ import annotations

import base64
import binascii
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from .receiver_operator_auth import ReceiverOperatorStore


RECEIVER_OPERATOR_BACKUP_KIND = "receiver-operator-governance-encrypted-backup"
_KDF_N = 2**15
_KDF_R = 8
_KDF_P = 1
_KEY_LENGTH = 32


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_exported_at(value: Any) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("操作員治理備份的匯出時間格式不正確。") from exc
    if parsed.tzinfo is None:
        raise ValueError("操作員治理備份的匯出時間必須包含時區。")
    parsed = parsed.astimezone(timezone.utc)
    if parsed > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("操作員治理備份的匯出時間不可晚於目前時間。")
    return parsed.isoformat().replace("+00:00", "Z")


def _validate_passphrase(value: Any) -> str:
    passphrase = str(value or "")
    if len(passphrase) < 16 or len(passphrase) > 256:
        raise ValueError("操作員治理備份密碼長度須為 16 至 256 個字元。")
    if passphrase.strip() != passphrase:
        raise ValueError("操作員治理備份密碼前後不得含有空白。")
    return passphrase


def _decode_base64(value: Any, *, field: str, expected_length: int | None = None) -> bytes:
    try:
        decoded = base64.b64decode(str(value or "").strip(), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"操作員治理備份的 {field} 不是有效 Base64。") from exc
    if expected_length is not None and len(decoded) != expected_length:
        raise ValueError(f"操作員治理備份的 {field} 長度不正確。")
    return decoded


def receiver_operator_snapshot_fingerprint(snapshot: Any) -> str:
    validated = ReceiverOperatorStore.validate_governance_snapshot(snapshot)
    return "ROG-" + hashlib.sha256(_canonical_json_bytes(validated)).hexdigest()[:20].upper()


def _backup_fingerprint(backup: dict[str, Any]) -> str:
    payload = {key: value for key, value in backup.items() if key != "backupFingerprint"}
    return "ROB-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def _derive_key(passphrase: str, salt: bytes, *, n: int, r: int, p: int) -> bytes:
    return Scrypt(salt=salt, length=_KEY_LENGTH, n=n, r=r, p=p).derive(passphrase.encode("utf-8"))


def _backup_aad(backup: dict[str, Any]) -> bytes:
    return _canonical_json_bytes(
        {
            "schemaVersion": backup["schemaVersion"],
            "kind": backup["kind"],
            "exportedAt": backup["exportedAt"],
            "encryption": backup["encryption"],
            "summary": backup["summary"],
        }
    )


def _encrypt_snapshot(
    snapshot: dict[str, Any],
    passphrase: str,
    *,
    exported_at: str,
) -> dict[str, Any]:
    snapshot = ReceiverOperatorStore.validate_governance_snapshot(snapshot)
    passphrase = _validate_passphrase(passphrase)
    salt = secrets.token_bytes(16)
    nonce = secrets.token_bytes(12)
    active_admin_count = sum(
        not item["disabled"] and "receiver-key-admin" in item["roles"]
        for item in snapshot["operators"]
    )
    backup: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": RECEIVER_OPERATOR_BACKUP_KIND,
        "exportedAt": _parse_exported_at(exported_at),
        "encryption": {
            "algorithm": "AES-256-GCM",
            "kdf": "scrypt",
            "n": _KDF_N,
            "r": _KDF_R,
            "p": _KDF_P,
            "keyLength": _KEY_LENGTH,
            "saltBase64": base64.b64encode(salt).decode("ascii"),
            "nonceBase64": base64.b64encode(nonce).decode("ascii"),
        },
        "summary": {
            "operatorCount": len(snapshot["operators"]),
            "activeAdminCount": active_admin_count,
            "rotationClaimCount": len(snapshot["rotationClaims"]),
            "auditEventCount": len(snapshot["auditEvents"]),
            "snapshotFingerprint": receiver_operator_snapshot_fingerprint(snapshot),
        },
    }
    key = _derive_key(passphrase, salt, n=_KDF_N, r=_KDF_R, p=_KDF_P)
    ciphertext = AESGCM(key).encrypt(nonce, _canonical_json_bytes(snapshot), _backup_aad(backup))
    backup["ciphertextBase64"] = base64.b64encode(ciphertext).decode("ascii")
    backup["backupFingerprint"] = _backup_fingerprint(backup)
    return validate_receiver_operator_backup_envelope(backup)


def build_receiver_operator_governance_backup(
    store: ReceiverOperatorStore,
    passphrase: str,
    *,
    exported_at: str | None = None,
) -> dict[str, Any]:
    return _encrypt_snapshot(
        store.governance_snapshot(),
        passphrase,
        exported_at=exported_at or _now_iso(),
    )


def validate_receiver_operator_backup_envelope(backup: Any) -> dict[str, Any]:
    if not isinstance(backup, dict):
        raise ValueError("操作員治理備份必須是 JSON 物件。")
    if backup.get("schemaVersion") != 1 or backup.get("kind") != RECEIVER_OPERATOR_BACKUP_KIND:
        raise ValueError("操作員治理備份版本或種類不受支援。")
    exported_at = _parse_exported_at(backup.get("exportedAt"))
    encryption = backup.get("encryption")
    if not isinstance(encryption, dict):
        raise ValueError("操作員治理備份缺少加密參數。")
    if (
        encryption.get("algorithm") != "AES-256-GCM"
        or encryption.get("kdf") != "scrypt"
        or encryption.get("n") != _KDF_N
        or encryption.get("r") != _KDF_R
        or encryption.get("p") != _KDF_P
        or encryption.get("keyLength") != _KEY_LENGTH
    ):
        raise ValueError("操作員治理備份的加密參數不受支援。")
    salt = _decode_base64(encryption.get("saltBase64"), field="saltBase64", expected_length=16)
    nonce = _decode_base64(encryption.get("nonceBase64"), field="nonceBase64", expected_length=12)
    ciphertext = _decode_base64(backup.get("ciphertextBase64"), field="ciphertextBase64")
    if len(ciphertext) < 17:
        raise ValueError("操作員治理備份的密文長度不正確。")
    summary = backup.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("操作員治理備份缺少安全摘要。")
    normalized_summary: dict[str, Any] = {}
    for field in ("operatorCount", "activeAdminCount", "rotationClaimCount", "auditEventCount"):
        value = summary.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"操作員治理備份的 {field} 不正確。")
        normalized_summary[field] = value
    snapshot_fingerprint = str(summary.get("snapshotFingerprint") or "").strip()
    if not snapshot_fingerprint.startswith("ROG-") or len(snapshot_fingerprint) != 24:
        raise ValueError("操作員治理備份的快照指紋格式不正確。")
    normalized_summary["snapshotFingerprint"] = snapshot_fingerprint
    normalized = {
        "schemaVersion": 1,
        "kind": RECEIVER_OPERATOR_BACKUP_KIND,
        "exportedAt": exported_at,
        "encryption": {
            "algorithm": "AES-256-GCM",
            "kdf": "scrypt",
            "n": _KDF_N,
            "r": _KDF_R,
            "p": _KDF_P,
            "keyLength": _KEY_LENGTH,
            "saltBase64": base64.b64encode(salt).decode("ascii"),
            "nonceBase64": base64.b64encode(nonce).decode("ascii"),
        },
        "summary": normalized_summary,
        "ciphertextBase64": base64.b64encode(ciphertext).decode("ascii"),
        "backupFingerprint": str(backup.get("backupFingerprint") or "").strip(),
    }
    if normalized["backupFingerprint"] != _backup_fingerprint(normalized):
        raise ValueError("操作員治理備份的整包指紋驗證失敗。")
    return normalized


def decrypt_receiver_operator_governance_backup(
    backup: Any,
    passphrase: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    normalized = validate_receiver_operator_backup_envelope(backup)
    passphrase = _validate_passphrase(passphrase)
    encryption = normalized["encryption"]
    salt = base64.b64decode(encryption["saltBase64"])
    nonce = base64.b64decode(encryption["nonceBase64"])
    ciphertext = base64.b64decode(normalized["ciphertextBase64"])
    key = _derive_key(
        passphrase,
        salt,
        n=encryption["n"],
        r=encryption["r"],
        p=encryption["p"],
    )
    try:
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, _backup_aad(normalized))
    except InvalidTag as exc:
        raise ValueError("操作員治理備份密碼不正確或密文已遭竄改。") from exc
    try:
        snapshot = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("操作員治理備份解密後不是有效 JSON。") from exc
    snapshot = ReceiverOperatorStore.validate_governance_snapshot(snapshot)
    summary = normalized["summary"]
    expected_summary = {
        "operatorCount": len(snapshot["operators"]),
        "activeAdminCount": sum(
            not item["disabled"] and "receiver-key-admin" in item["roles"]
            for item in snapshot["operators"]
        ),
        "rotationClaimCount": len(snapshot["rotationClaims"]),
        "auditEventCount": len(snapshot["auditEvents"]),
        "snapshotFingerprint": receiver_operator_snapshot_fingerprint(snapshot),
    }
    if summary != expected_summary:
        raise ValueError("操作員治理備份的外層摘要與加密快照不一致。")
    return normalized, snapshot


def _build_restore_preview(
    normalized: dict[str, Any],
    backup_snapshot: dict[str, Any],
    current_snapshot: dict[str, Any],
) -> dict[str, Any]:
    current_fingerprint = receiver_operator_snapshot_fingerprint(current_snapshot)
    backup_fingerprint = normalized["summary"]["snapshotFingerprint"]
    current_operators = {item["username"].casefold(): item for item in current_snapshot["operators"]}
    backup_operators = {item["username"].casefold(): item for item in backup_snapshot["operators"]}
    shared = sorted(set(current_operators) & set(backup_operators))
    account_changes = []
    for username in shared:
        current = current_operators[username]
        incoming = backup_operators[username]
        if (
            current["roles"] != incoming["roles"]
            or current["disabled"] != incoming["disabled"]
            or current["passwordResetRequired"] != incoming["passwordResetRequired"]
        ):
            account_changes.append(
                {
                    "username": incoming["username"],
                    "currentRoles": current["roles"],
                    "backupRoles": incoming["roles"],
                    "currentStatus": "disabled" if current["disabled"] else (
                        "password-reset-required" if current["passwordResetRequired"] else "enabled"
                    ),
                    "backupStatus": "disabled" if incoming["disabled"] else (
                        "password-reset-required" if incoming["passwordResetRequired"] else "enabled"
                    ),
                }
            )
    current_events = current_snapshot["auditEvents"]
    backup_events = backup_snapshot["auditEvents"]
    fresh_recovery_bootstrap = (
        len(current_snapshot["operators"]) == 1
        and bool(current_events)
        and current_events[0]["eventType"] == "operator-bootstrap-created"
        and all(
            event["eventType"] in {
                "operator-bootstrap-created",
                "operator-governance-backup-exported",
            }
            and event["actorOperatorId"] == current_snapshot["operators"][0]["id"]
            and event["targetOperatorId"] == current_snapshot["operators"][0]["id"]
            for event in current_events
        )
        and not current_snapshot["rotationClaims"]
    )
    blocking_reasons: list[str] = []
    if current_fingerprint == backup_fingerprint:
        blocking_reasons.append("備份與目前治理資料完全相同，不需要復原。")
    elif not fresh_recovery_bootstrap and backup_events[: len(current_events)] != current_events:
        blocking_reasons.append("備份稽核鏈不是目前治理歷程的向前延伸，不得回退或改寫既有事件。")
    return {
        "backupFingerprint": normalized["backupFingerprint"],
        "preview": {
            "currentStatus": "fresh-recovery-bootstrap" if fresh_recovery_bootstrap else "valid",
            "currentOperatorCount": len(current_snapshot["operators"]),
            "backupOperatorCount": len(backup_snapshot["operators"]),
            "currentAuditEventCount": len(current_events),
            "backupAuditEventCount": len(backup_events),
            "currentRotationClaimCount": len(current_snapshot["rotationClaims"]),
            "backupRotationClaimCount": len(backup_snapshot["rotationClaims"]),
            "addedUsernames": sorted(
                backup_operators[key]["username"] for key in set(backup_operators) - set(current_operators)
            ),
            "removedUsernames": sorted(
                current_operators[key]["username"] for key in set(current_operators) - set(backup_operators)
            ),
            "accountChanges": account_changes,
            "backupActiveAdminUsernames": sorted(
                item["username"]
                for item in backup_snapshot["operators"]
                if not item["disabled"] and "receiver-key-admin" in item["roles"]
            ),
            "currentSnapshotFingerprint": current_fingerprint,
            "backupSnapshotFingerprint": backup_fingerprint,
            "wouldReplace": current_fingerprint != backup_fingerprint,
            "restoreAllowed": not blocking_reasons,
            "blockingReasons": blocking_reasons,
            "sessionsWillBeRevoked": True,
        },
    }


def preview_receiver_operator_governance_restore(
    store: ReceiverOperatorStore,
    backup: Any,
    passphrase: str,
) -> dict[str, Any]:
    normalized, backup_snapshot = decrypt_receiver_operator_governance_backup(backup, passphrase)
    return _build_restore_preview(normalized, backup_snapshot, store.governance_snapshot())


def _write_safeguard_backup(
    store: ReceiverOperatorStore,
    passphrase: str,
    snapshot: dict[str, Any],
) -> tuple[str, str]:
    safeguard = _encrypt_snapshot(snapshot, passphrase, exported_at=_now_iso())
    directory = store.db_path.parent / "receiver_operator_governance_backups"
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = (
        f"pre-restore-{timestamp}-{safeguard['backupFingerprint']}-"
        f"{secrets.token_hex(4)}.json"
    )
    path = directory / filename
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(safeguard, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    return filename, safeguard["backupFingerprint"]


def restore_receiver_operator_governance_backup(
    store: ReceiverOperatorStore,
    backup: Any,
    passphrase: str,
    *,
    current_actor_operator_id: str,
    recovery_username: str,
    recovery_password: str,
    restore_confirmed: bool = False,
) -> dict[str, Any]:
    if restore_confirmed is not True:
        raise ValueError("復原操作必須明確確認。")
    normalized, backup_snapshot = decrypt_receiver_operator_governance_backup(backup, passphrase)
    current_snapshot = store.governance_snapshot()
    preview_result = _build_restore_preview(normalized, backup_snapshot, current_snapshot)
    if not preview_result["preview"]["restoreAllowed"]:
        raise ValueError("此操作員治理備份不得復原：" + " ".join(preview_result["preview"]["blockingReasons"]))
    recovery_operator_id = store.verify_governance_snapshot_admin(
        backup_snapshot,
        recovery_username,
        recovery_password,
    )
    safeguard_filename, safeguard_fingerprint = _write_safeguard_backup(
        store,
        passphrase,
        current_snapshot,
    )
    restored = store.replace_governance_snapshot(
        backup_snapshot,
        current_actor_operator_id=current_actor_operator_id,
        recovery_operator_id=recovery_operator_id,
        expected_current_snapshot=current_snapshot,
        restore_details={
            "backupFingerprint": normalized["backupFingerprint"],
            "backupSnapshotFingerprint": normalized["summary"]["snapshotFingerprint"],
            "safeguardBackupFingerprint": safeguard_fingerprint,
            "safeguardFileName": safeguard_filename,
            "initiatedByPreviousOperatorId": current_actor_operator_id,
            "recoveryUsername": recovery_username,
        },
    )
    restored_fingerprint = receiver_operator_snapshot_fingerprint(restored["snapshot"])
    return {
        "restored": True,
        "loggedOut": True,
        "backupFingerprint": normalized["backupFingerprint"],
        "backupSnapshotFingerprint": normalized["summary"]["snapshotFingerprint"],
        "restoredSnapshotFingerprint": restored_fingerprint,
        "restoreEventFingerprint": restored["restoreEvent"]["eventFingerprint"],
        "safeguardFileName": safeguard_filename,
        "safeguardBackupFingerprint": safeguard_fingerprint,
        "revokedSessions": restored["revokedSessions"],
        "preview": preview_result["preview"],
    }


__all__ = [
    "RECEIVER_OPERATOR_BACKUP_KIND",
    "build_receiver_operator_governance_backup",
    "decrypt_receiver_operator_governance_backup",
    "preview_receiver_operator_governance_restore",
    "receiver_operator_snapshot_fingerprint",
    "restore_receiver_operator_governance_backup",
    "validate_receiver_operator_backup_envelope",
]
