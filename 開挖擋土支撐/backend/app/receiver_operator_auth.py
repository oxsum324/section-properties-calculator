from __future__ import annotations

import base64
import binascii
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any, Iterator
import uuid

from .config import get_settings


RECEIVER_OPERATOR_ROLES = {
    "receiver-key-admin",
    "receiver-key-requester",
    "receiver-key-approver",
}
RECEIVER_SESSION_COOKIE = "strut_receiver_operator_session"
RECEIVER_SESSION_HOURS = 12
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW_MINUTES = 15
LOGIN_LOCK_MINUTES = 5
_USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,40}$")
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_OPERATOR_ID_PATTERN = re.compile(r"^ROP-[A-F0-9]{20}$")
_AUDIT_EVENT_ID_PATTERN = re.compile(r"^ROA-[A-F0-9]{20}$")
_AUDIT_FINGERPRINT_PATTERN = re.compile(r"^ROE-[A-F0-9]{20}$")
_BACKUP_DISPOSITION_REQUEST_PATTERN = re.compile(r"^RBR-[A-F0-9]{20}$")
_BACKUP_DISPOSITION_RECEIPT_PATTERN = re.compile(r"^RBD-[A-F0-9]{20}$")
_BACKUP_FINGERPRINT_PATTERN = re.compile(r"^ROB-[A-F0-9]{20}$")
_SNAPSHOT_FINGERPRINT_PATTERN = re.compile(r"^ROG-[A-F0-9]{20}$")
_FILE_SHA256_PATTERN = re.compile(r"^SHA256-[A-F0-9]{64}$")
_AUDIT_EVENT_TYPES = {
    "operator-bootstrap-created",
    "operator-created",
    "operator-roles-changed",
    "operator-disabled",
    "operator-enabled",
    "operator-password-reset",
    "operator-password-changed",
    "operator-governance-backup-exported",
    "operator-backup-disposition-requested",
    "operator-backup-disposition-approved",
    "operator-backup-disposition-completed",
    "operator-governance-restored",
}
RECEIVER_OPERATOR_GOVERNANCE_SNAPSHOT_KIND = "receiver-operator-governance-snapshot"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
    )


def _validate_username(value: Any) -> str:
    username = str(value or "").strip()
    if not _USERNAME_PATTERN.fullmatch(username):
        raise ValueError("登入帳號須為 3 至 40 個英文字母、數字、句點、底線或連字號。")
    return username


def _validate_display_name(value: Any) -> str:
    display_name = str(value or "").strip()
    if not display_name:
        raise ValueError("顯示姓名不可空白。")
    if len(display_name) > 120:
        raise ValueError("顯示姓名不可超過 120 個字元。")
    return display_name


def _validate_password(password: Any, username: str) -> str:
    value = str(password or "")
    if len(value) < 12 or len(value) > 256:
        raise ValueError("密碼長度須為 12 至 256 個字元。")
    categories = sum(
        bool(pattern.search(value))
        for pattern in (
            re.compile(r"[a-z]"),
            re.compile(r"[A-Z]"),
            re.compile(r"[0-9]"),
            re.compile(r"[^A-Za-z0-9]"),
        )
    )
    if categories < 3:
        raise ValueError("密碼須至少包含大寫、小寫、數字、符號其中三類。")
    if username.casefold() in value.casefold():
        raise ValueError("密碼不得包含登入帳號。")
    return value


def _validate_roles(values: Any) -> list[str]:
    if not isinstance(values, (list, tuple, set)):
        raise ValueError("角色清單格式不正確。")
    roles = sorted({str(value).strip() for value in values if str(value).strip()})
    if not roles:
        raise ValueError("至少須指定一個接收端金鑰管理角色。")
    invalid = set(roles) - RECEIVER_OPERATOR_ROLES
    if invalid:
        raise ValueError(f"不支援的角色：{', '.join(sorted(invalid))}。")
    return roles


def _decode_backup_bytes(value: Any, *, field: str, expected_length: int) -> bytes:
    text = str(value or "").strip()
    try:
        decoded = base64.b64decode(text, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"操作員治理快照的 {field} 不是有效 Base64。") from exc
    if len(decoded) != expected_length:
        raise ValueError(f"操作員治理快照的 {field} 長度不正確。")
    return decoded


def _require_snapshot_string(value: Any, *, field: str, max_length: int = 500) -> str:
    text = str(value or "").strip()
    if not text or len(text) > max_length:
        raise ValueError(f"操作員治理快照的 {field} 不正確。")
    return text


def _backup_disposition_request_fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "RBR-" + hashlib.sha256(canonical).hexdigest()[:20].upper()


class ReceiverOperatorStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or get_settings().db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 15000")
        return connection

    def _init_db(self) -> None:
        with closing(self._connect()) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS receiver_operators (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    display_name TEXT NOT NULL,
                    password_salt BLOB NOT NULL,
                    password_hash BLOB NOT NULL,
                    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
                    password_reset_required INTEGER NOT NULL DEFAULT 0
                        CHECK (password_reset_required IN (0, 1)),
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS receiver_operator_roles (
                    operator_id TEXT NOT NULL REFERENCES receiver_operators(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    PRIMARY KEY (operator_id, role)
                );
                CREATE TABLE IF NOT EXISTS receiver_operator_sessions (
                    session_hash TEXT PRIMARY KEY,
                    operator_id TEXT NOT NULL REFERENCES receiver_operators(id) ON DELETE CASCADE,
                    csrf_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS receiver_login_attempts (
                    username TEXT PRIMARY KEY COLLATE NOCASE,
                    failed_count INTEGER NOT NULL,
                    window_started_at TEXT NOT NULL,
                    locked_until TEXT
                );
                CREATE TABLE IF NOT EXISTS receiver_rotation_claims (
                    request_fingerprint TEXT PRIMARY KEY,
                    new_key_id TEXT NOT NULL,
                    old_key_id TEXT NOT NULL,
                    requested_by_operator_id TEXT NOT NULL REFERENCES receiver_operators(id),
                    requested_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'expired', 'blocked')),
                    approved_by_operator_id TEXT REFERENCES receiver_operators(id),
                    approved_at TEXT,
                    completion_event_fingerprint TEXT UNIQUE,
                    CHECK (
                        approved_by_operator_id IS NULL
                        OR approved_by_operator_id <> requested_by_operator_id
                    )
                );
                CREATE UNIQUE INDEX IF NOT EXISTS receiver_rotation_one_pending_per_new_key
                    ON receiver_rotation_claims(new_key_id)
                    WHERE state = 'pending';
                CREATE TABLE IF NOT EXISTS receiver_backup_disposition_claims (
                    request_fingerprint TEXT PRIMARY KEY,
                    backup_fingerprint TEXT NOT NULL,
                    snapshot_fingerprint TEXT NOT NULL,
                    managed_file_name TEXT NOT NULL,
                    managed_file_sha256 TEXT NOT NULL,
                    exported_at TEXT NOT NULL,
                    retention_until TEXT NOT NULL,
                    requested_by_operator_id TEXT NOT NULL REFERENCES receiver_operators(id),
                    requested_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    case_reference TEXT NOT NULL,
                    basis TEXT NOT NULL,
                    state TEXT NOT NULL CHECK (
                        state IN ('pending', 'removal-in-progress', 'completed', 'expired', 'blocked')
                    ),
                    approved_by_operator_id TEXT REFERENCES receiver_operators(id),
                    approved_at TEXT,
                    completion_operator_id TEXT REFERENCES receiver_operators(id),
                    completed_at TEXT,
                    receipt_fingerprint TEXT UNIQUE,
                    completion_event_fingerprint TEXT UNIQUE,
                    CHECK (
                        approved_by_operator_id IS NULL
                        OR approved_by_operator_id <> requested_by_operator_id
                    )
                );
                CREATE UNIQUE INDEX IF NOT EXISTS receiver_backup_disposition_one_open_per_backup
                    ON receiver_backup_disposition_claims(backup_fingerprint)
                    WHERE state IN ('pending', 'removal-in-progress');
                CREATE TABLE IF NOT EXISTS receiver_operator_audit_events (
                    sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    event_type TEXT NOT NULL,
                    actor_operator_id TEXT NOT NULL REFERENCES receiver_operators(id),
                    actor_username TEXT NOT NULL,
                    actor_display_name TEXT NOT NULL,
                    target_operator_id TEXT NOT NULL REFERENCES receiver_operators(id),
                    target_username TEXT NOT NULL,
                    target_display_name TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    details_json TEXT NOT NULL,
                    previous_event_fingerprint TEXT,
                    event_fingerprint TEXT NOT NULL UNIQUE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS receiver_operator_audit_single_successor
                    ON receiver_operator_audit_events(previous_event_fingerprint)
                    WHERE previous_event_fingerprint IS NOT NULL;
                CREATE TABLE IF NOT EXISTS receiver_operator_maintenance (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    restore_authorized INTEGER NOT NULL DEFAULT 0
                        CHECK (restore_authorized IN (0, 1))
                );
                INSERT OR IGNORE INTO receiver_operator_maintenance (id, restore_authorized)
                    VALUES (1, 0);
                DROP TRIGGER IF EXISTS receiver_operator_audit_no_update;
                DROP TRIGGER IF EXISTS receiver_operator_audit_no_delete;
                CREATE TRIGGER receiver_operator_audit_no_update
                    BEFORE UPDATE ON receiver_operator_audit_events
                    WHEN COALESCE(
                        (SELECT restore_authorized FROM receiver_operator_maintenance WHERE id = 1),
                        0
                    ) = 0
                    BEGIN
                        SELECT RAISE(ABORT, 'receiver operator audit events are append-only');
                    END;
                CREATE TRIGGER receiver_operator_audit_no_delete
                    BEFORE DELETE ON receiver_operator_audit_events
                    WHEN COALESCE(
                        (SELECT restore_authorized FROM receiver_operator_maintenance WHERE id = 1),
                        0
                    ) = 0
                    BEGIN
                        SELECT RAISE(ABORT, 'receiver operator audit events are append-only');
                    END;
                """
            )
            operator_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(receiver_operators)").fetchall()
            }
            if "password_reset_required" not in operator_columns:
                connection.execute(
                    """
                    ALTER TABLE receiver_operators
                    ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0
                        CHECK (password_reset_required IN (0, 1))
                    """
                )
            connection.commit()

    def bootstrap_required(self) -> bool:
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM receiver_operators").fetchone()
        return int(row["count"]) == 0

    @staticmethod
    def _operator_public(connection: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        roles = [
            role_row["role"]
            for role_row in connection.execute(
                "SELECT role FROM receiver_operator_roles WHERE operator_id = ? ORDER BY role",
                (row["id"],),
            ).fetchall()
        ]
        return {
            "id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "roles": roles,
            "disabled": bool(row["disabled"]),
            "passwordResetRequired": bool(row["password_reset_required"]),
            "createdAt": row["created_at"],
            "identityAssurance": "authenticated-local-account",
        }

    @staticmethod
    def _record_audit_event(
        connection: sqlite3.Connection,
        *,
        event_type: str,
        actor_operator_id: str,
        target_operator_id: str,
        details: dict[str, Any],
    ) -> dict[str, Any]:
        actor = connection.execute(
            "SELECT * FROM receiver_operators WHERE id = ?",
            (actor_operator_id,),
        ).fetchone()
        target = connection.execute(
            "SELECT * FROM receiver_operators WHERE id = ?",
            (target_operator_id,),
        ).fetchone()
        if actor is None or target is None:
            raise ValueError("稽核事件的操作或目標帳號不存在。")
        previous = connection.execute(
            """
            SELECT event_fingerprint
            FROM receiver_operator_audit_events
            ORDER BY sequence_no DESC
            LIMIT 1
            """
        ).fetchone()
        event_id = "ROA-" + uuid.uuid4().hex[:20].upper()
        occurred_at = _iso(_utc_now())
        details_json = json.dumps(details, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        previous_fingerprint = previous["event_fingerprint"] if previous else None
        fingerprint_payload = {
            "eventId": event_id,
            "eventType": event_type,
            "actorOperatorId": actor_operator_id,
            "actorUsername": actor["username"],
            "actorDisplayName": actor["display_name"],
            "targetOperatorId": target_operator_id,
            "targetUsername": target["username"],
            "targetDisplayName": target["display_name"],
            "occurredAt": occurred_at,
            "details": json.loads(details_json),
            "previousEventFingerprint": previous_fingerprint,
        }
        event_fingerprint = "ROE-" + hashlib.sha256(
            json.dumps(
                fingerprint_payload,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()[:20].upper()
        connection.execute(
            """
            INSERT INTO receiver_operator_audit_events (
                event_id, event_type,
                actor_operator_id, actor_username, actor_display_name,
                target_operator_id, target_username, target_display_name,
                occurred_at, details_json, previous_event_fingerprint, event_fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                event_type,
                actor_operator_id,
                actor["username"],
                actor["display_name"],
                target_operator_id,
                target["username"],
                target["display_name"],
                occurred_at,
                details_json,
                previous_fingerprint,
                event_fingerprint,
            ),
        )
        return {**fingerprint_payload, "eventFingerprint": event_fingerprint}

    @staticmethod
    def _enabled_admin_count(connection: sqlite3.Connection) -> int:
        row = connection.execute(
            """
            SELECT COUNT(DISTINCT o.id) AS count
            FROM receiver_operators o
            JOIN receiver_operator_roles r ON r.operator_id = o.id
            WHERE o.disabled = 0 AND r.role = 'receiver-key-admin'
            """
        ).fetchone()
        return int(row["count"])

    @staticmethod
    def _require_operator(connection: sqlite3.Connection, operator_id: str) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM receiver_operators WHERE id = ?",
            (operator_id,),
        ).fetchone()
        if row is None:
            raise ValueError("找不到指定的接收端操作帳號。")
        return row

    @classmethod
    def _require_active_role(
        cls,
        connection: sqlite3.Connection,
        operator_id: str,
        role: str,
    ) -> sqlite3.Row:
        operator = cls._require_operator(connection, operator_id)
        has_role = connection.execute(
            """
            SELECT 1 FROM receiver_operator_roles
            WHERE operator_id = ? AND role = ?
            """,
            (operator_id, role),
        ).fetchone()
        if operator["disabled"] or has_role is None:
            raise PermissionError("操作帳號未啟用或缺少執行此操作所需的角色。")
        return operator

    @classmethod
    def _require_active_admin(cls, connection: sqlite3.Connection, operator_id: str) -> sqlite3.Row:
        operator = cls._require_operator(connection, operator_id)
        has_admin_role = connection.execute(
            """
            SELECT 1 FROM receiver_operator_roles
            WHERE operator_id = ? AND role = 'receiver-key-admin'
            """,
            (operator_id,),
        ).fetchone()
        if operator["disabled"] or has_admin_role is None:
            raise PermissionError("操作帳號必須是啟用中的接收端金鑰管理員。")
        return operator

    def _create_operator(
        self,
        connection: sqlite3.Connection,
        *,
        username: str,
        display_name: str,
        password: str,
        roles: list[str],
    ) -> dict[str, Any]:
        username = _validate_username(username)
        display_name = _validate_display_name(display_name)
        password = _validate_password(password, username)
        roles = _validate_roles(roles)
        operator_id = "ROP-" + uuid.uuid4().hex[:20].upper()
        salt = secrets.token_bytes(16)
        now = _iso(_utc_now())
        try:
            connection.execute(
                """
                INSERT INTO receiver_operators (
                    id, username, display_name, password_salt, password_hash, disabled, created_at
                ) VALUES (?, ?, ?, ?, ?, 0, ?)
                """,
                (operator_id, username, display_name, salt, _password_hash(password, salt), now),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("此登入帳號已存在。") from exc
        connection.executemany(
            "INSERT INTO receiver_operator_roles (operator_id, role) VALUES (?, ?)",
            [(operator_id, role) for role in roles],
        )
        row = connection.execute("SELECT * FROM receiver_operators WHERE id = ?", (operator_id,)).fetchone()
        return self._operator_public(connection, row)

    def bootstrap(self, username: str, display_name: str, password: str) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            count = int(connection.execute("SELECT COUNT(*) FROM receiver_operators").fetchone()[0])
            if count:
                raise ValueError("接收端操作帳號已完成初始設定，不得再次建立首位管理員。")
            operator = self._create_operator(
                connection,
                username=username,
                display_name=display_name,
                password=password,
                roles=sorted(RECEIVER_OPERATOR_ROLES),
            )
            self._record_audit_event(
                connection,
                event_type="operator-bootstrap-created",
                actor_operator_id=operator["id"],
                target_operator_id=operator["id"],
                details={"roles": operator["roles"]},
            )
            connection.commit()
            return operator

    def create_operator(
        self,
        username: str,
        display_name: str,
        password: str,
        roles: list[str],
        *,
        actor_operator_id: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_admin(connection, actor_operator_id)
            operator = self._create_operator(
                connection,
                username=username,
                display_name=display_name,
                password=password,
                roles=roles,
            )
            self._record_audit_event(
                connection,
                event_type="operator-created",
                actor_operator_id=actor_operator_id,
                target_operator_id=operator["id"],
                details={"roles": operator["roles"]},
            )
            connection.commit()
            return operator

    def list_operators(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM receiver_operators ORDER BY disabled, username COLLATE NOCASE"
            ).fetchall()
            return [self._operator_public(connection, row) for row in rows]

    def update_roles(
        self,
        target_operator_id: str,
        roles: list[str],
        *,
        actor_operator_id: str,
    ) -> dict[str, Any]:
        roles = _validate_roles(roles)
        if target_operator_id == actor_operator_id:
            raise ValueError("不得自行變更角色；請由另一位管理員執行。")
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_admin(connection, actor_operator_id)
            target = self._require_operator(connection, target_operator_id)
            current = self._operator_public(connection, target)
            if (
                not current["disabled"]
                and "receiver-key-admin" in current["roles"]
                and "receiver-key-admin" not in roles
                and self._enabled_admin_count(connection) <= 1
            ):
                raise ValueError("不得移除最後一位啟用中管理員的管理角色。")
            blocked_claim_count = 0
            blocked_disposition_count = 0
            if (
                "receiver-key-requester" in current["roles"]
                and "receiver-key-requester" not in roles
            ):
                cursor = connection.execute(
                    """
                    UPDATE receiver_rotation_claims
                    SET state = 'blocked'
                    WHERE requested_by_operator_id = ? AND state = 'pending'
                    """,
                    (target_operator_id,),
                )
                blocked_claim_count = cursor.rowcount
                cursor = connection.execute(
                    """
                    UPDATE receiver_backup_disposition_claims
                    SET state = 'blocked'
                    WHERE requested_by_operator_id = ? AND state = 'pending'
                    """,
                    (target_operator_id,),
                )
                blocked_disposition_count = cursor.rowcount
            connection.execute(
                "DELETE FROM receiver_operator_roles WHERE operator_id = ?",
                (target_operator_id,),
            )
            connection.executemany(
                "INSERT INTO receiver_operator_roles (operator_id, role) VALUES (?, ?)",
                [(target_operator_id, role) for role in roles],
            )
            updated = self._operator_public(connection, target)
            self._record_audit_event(
                connection,
                event_type="operator-roles-changed",
                actor_operator_id=actor_operator_id,
                target_operator_id=target_operator_id,
                details={
                    "previousRoles": current["roles"],
                    "roles": updated["roles"],
                    "blockedPendingRotationClaims": blocked_claim_count,
                    "blockedPendingBackupDispositionClaims": blocked_disposition_count,
                },
            )
            connection.commit()
            return updated

    def set_disabled(
        self,
        target_operator_id: str,
        disabled: bool,
        *,
        actor_operator_id: str,
    ) -> dict[str, Any]:
        if target_operator_id == actor_operator_id:
            raise ValueError("不得自行停用或重新啟用帳號；請由另一位管理員執行。")
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_admin(connection, actor_operator_id)
            target = self._require_operator(connection, target_operator_id)
            current = self._operator_public(connection, target)
            if current["disabled"] == bool(disabled):
                raise ValueError("帳號已是指定狀態，未產生變更。")
            if (
                disabled
                and "receiver-key-admin" in current["roles"]
                and self._enabled_admin_count(connection) <= 1
            ):
                raise ValueError("不得停用最後一位啟用中的管理員。")
            connection.execute(
                "UPDATE receiver_operators SET disabled = ? WHERE id = ?",
                (1 if disabled else 0, target_operator_id),
            )
            revoked_session_count = 0
            blocked_claim_count = 0
            blocked_disposition_count = 0
            if disabled:
                cursor = connection.execute(
                    "DELETE FROM receiver_operator_sessions WHERE operator_id = ?",
                    (target_operator_id,),
                )
                revoked_session_count = cursor.rowcount
                cursor = connection.execute(
                    """
                    UPDATE receiver_rotation_claims
                    SET state = 'blocked'
                    WHERE requested_by_operator_id = ? AND state = 'pending'
                    """,
                    (target_operator_id,),
                )
                blocked_claim_count = cursor.rowcount
                cursor = connection.execute(
                    """
                    UPDATE receiver_backup_disposition_claims
                    SET state = 'blocked'
                    WHERE requested_by_operator_id = ? AND state = 'pending'
                    """,
                    (target_operator_id,),
                )
                blocked_disposition_count = cursor.rowcount
            updated_row = self._require_operator(connection, target_operator_id)
            updated = self._operator_public(connection, updated_row)
            self._record_audit_event(
                connection,
                event_type="operator-disabled" if disabled else "operator-enabled",
                actor_operator_id=actor_operator_id,
                target_operator_id=target_operator_id,
                details={
                    "disabled": bool(disabled),
                    "revokedSessions": revoked_session_count,
                    "blockedPendingRotationClaims": blocked_claim_count,
                    "blockedPendingBackupDispositionClaims": blocked_disposition_count,
                },
            )
            connection.commit()
            return updated

    def reset_password(
        self,
        target_operator_id: str,
        new_password: str,
        *,
        actor_operator_id: str,
    ) -> dict[str, Any]:
        if target_operator_id == actor_operator_id:
            raise ValueError("管理員不得由重設入口重設自己的密碼；請使用變更本人密碼。")
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_admin(connection, actor_operator_id)
            target = self._require_operator(connection, target_operator_id)
            password = _validate_password(new_password, target["username"])
            salt = secrets.token_bytes(16)
            connection.execute(
                """
                UPDATE receiver_operators
                SET password_salt = ?, password_hash = ?, password_reset_required = 1
                WHERE id = ?
                """,
                (salt, _password_hash(password, salt), target_operator_id),
            )
            cursor = connection.execute(
                "DELETE FROM receiver_operator_sessions WHERE operator_id = ?",
                (target_operator_id,),
            )
            connection.execute(
                "DELETE FROM receiver_login_attempts WHERE username = ? COLLATE NOCASE",
                (target["username"],),
            )
            updated = self._operator_public(
                connection,
                self._require_operator(connection, target_operator_id),
            )
            self._record_audit_event(
                connection,
                event_type="operator-password-reset",
                actor_operator_id=actor_operator_id,
                target_operator_id=target_operator_id,
                details={"revokedSessions": cursor.rowcount, "passwordResetRequired": True},
            )
            connection.commit()
            return updated

    def change_password(
        self,
        operator_id: str,
        current_password: str,
        new_password: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            operator = self._require_operator(connection, operator_id)
            if operator["disabled"]:
                raise PermissionError("此操作帳號已停用。")
            candidate = _password_hash(str(current_password or "")[:256], bytes(operator["password_salt"]))
            if not hmac.compare_digest(candidate, bytes(operator["password_hash"])):
                raise ValueError("目前密碼不正確。")
            password = _validate_password(new_password, operator["username"])
            new_hash = _password_hash(password, bytes(operator["password_salt"]))
            if hmac.compare_digest(new_hash, bytes(operator["password_hash"])):
                raise ValueError("新密碼不得與目前密碼相同。")
            salt = secrets.token_bytes(16)
            connection.execute(
                """
                UPDATE receiver_operators
                SET password_salt = ?, password_hash = ?, password_reset_required = 0
                WHERE id = ?
                """,
                (salt, _password_hash(password, salt), operator_id),
            )
            cursor = connection.execute(
                "DELETE FROM receiver_operator_sessions WHERE operator_id = ?",
                (operator_id,),
            )
            connection.execute(
                "DELETE FROM receiver_login_attempts WHERE username = ? COLLATE NOCASE",
                (operator["username"],),
            )
            updated = self._operator_public(
                connection,
                self._require_operator(connection, operator_id),
            )
            self._record_audit_event(
                connection,
                event_type="operator-password-changed",
                actor_operator_id=operator_id,
                target_operator_id=operator_id,
                details={"revokedSessions": cursor.rowcount, "passwordResetRequired": False},
            )
            connection.commit()
            return updated

    @staticmethod
    def _audit_event_payload(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "eventId": row["event_id"],
            "eventType": row["event_type"],
            "actorOperatorId": row["actor_operator_id"],
            "actorUsername": row["actor_username"],
            "actorDisplayName": row["actor_display_name"],
            "targetOperatorId": row["target_operator_id"],
            "targetUsername": row["target_username"],
            "targetDisplayName": row["target_display_name"],
            "occurredAt": row["occurred_at"],
            "details": json.loads(row["details_json"]),
            "previousEventFingerprint": row["previous_event_fingerprint"],
        }

    @staticmethod
    def _validate_audit_event_list(
        values: Any,
        *,
        operator_ids: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        if not isinstance(values, list):
            raise ValueError("操作員治理快照的稽核事件格式不正確。")
        previous_fingerprint = None
        seen_event_ids: set[str] = set()
        seen_fingerprints: set[str] = set()
        events: list[dict[str, Any]] = []
        for raw in values:
            if not isinstance(raw, dict):
                raise ValueError("操作員治理快照含有格式不正確的稽核事件。")
            event_id = _require_snapshot_string(raw.get("eventId"), field="eventId", max_length=24)
            event_type = _require_snapshot_string(raw.get("eventType"), field="eventType", max_length=80)
            actor_operator_id = _require_snapshot_string(
                raw.get("actorOperatorId"), field="actorOperatorId", max_length=24
            )
            target_operator_id = _require_snapshot_string(
                raw.get("targetOperatorId"), field="targetOperatorId", max_length=24
            )
            if not _AUDIT_EVENT_ID_PATTERN.fullmatch(event_id) or event_id in seen_event_ids:
                raise ValueError("操作員治理快照的稽核事件 ID 不正確或重複。")
            if event_type not in _AUDIT_EVENT_TYPES:
                raise ValueError(f"操作員治理快照含有不支援的稽核事件：{event_type}。")
            if operator_ids is not None and (
                actor_operator_id not in operator_ids or target_operator_id not in operator_ids
            ):
                raise ValueError("操作員治理快照的稽核事件引用不存在的操作員。")
            actor_username = _validate_username(raw.get("actorUsername"))
            target_username = _validate_username(raw.get("targetUsername"))
            actor_display_name = _validate_display_name(raw.get("actorDisplayName"))
            target_display_name = _validate_display_name(raw.get("targetDisplayName"))
            occurred_at = _iso(_parse_time(_require_snapshot_string(raw.get("occurredAt"), field="occurredAt")))
            details = raw.get("details")
            if not isinstance(details, dict):
                raise ValueError("操作員治理快照的稽核事件 details 格式不正確。")
            details = json.loads(
                json.dumps(details, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            )
            previous = raw.get("previousEventFingerprint")
            if previous is not None:
                previous = _require_snapshot_string(
                    previous,
                    field="previousEventFingerprint",
                    max_length=24,
                )
            if previous != previous_fingerprint:
                raise ValueError("操作帳號稽核鏈前後指紋不一致，請停止復原並人工稽核。")
            payload = {
                "eventId": event_id,
                "eventType": event_type,
                "actorOperatorId": actor_operator_id,
                "actorUsername": actor_username,
                "actorDisplayName": actor_display_name,
                "targetOperatorId": target_operator_id,
                "targetUsername": target_username,
                "targetDisplayName": target_display_name,
                "occurredAt": occurred_at,
                "details": details,
                "previousEventFingerprint": previous,
            }
            expected = "ROE-" + hashlib.sha256(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()[:20].upper()
            event_fingerprint = _require_snapshot_string(
                raw.get("eventFingerprint"), field="eventFingerprint", max_length=24
            )
            if (
                not _AUDIT_FINGERPRINT_PATTERN.fullmatch(event_fingerprint)
                or event_fingerprint in seen_fingerprints
                or not hmac.compare_digest(expected, event_fingerprint)
            ):
                raise ValueError("操作帳號稽核事件內容指紋不一致，請停止復原並人工稽核。")
            events.append({**payload, "eventFingerprint": event_fingerprint})
            seen_event_ids.add(event_id)
            seen_fingerprints.add(event_fingerprint)
            previous_fingerprint = event_fingerprint
        return events

    def list_audit_events(self) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM receiver_operator_audit_events ORDER BY sequence_no"
            ).fetchall()
        events = self._validate_audit_event_list(
            [
                {**self._audit_event_payload(row), "eventFingerprint": row["event_fingerprint"]}
                for row in rows
            ]
        )
        return {
            "events": list(reversed(events)),
            "chainValid": True,
            "eventCount": len(events),
            "headFingerprint": events[-1]["eventFingerprint"] if events else None,
        }

    def record_governance_backup_export(
        self,
        actor_operator_id: str,
        *,
        retain_server_copy: bool = False,
        retention_days: int | None = None,
    ) -> dict[str, Any]:
        if retain_server_copy:
            if not isinstance(retention_days, int) or isinstance(retention_days, bool):
                raise ValueError("受管制本機備份必須指定保存天數。")
            if retention_days < 1 or retention_days > 365:
                raise ValueError("受管制本機備份保存天數須為 1 至 365 天。")
        details: dict[str, Any] = {
            "backupExportRequestId": "RBE-" + secrets.token_hex(10).upper(),
            "managedCopyRequested": retain_server_copy,
        }
        if retain_server_copy:
            details["retentionDays"] = retention_days
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_admin(connection, actor_operator_id)
            event = self._record_audit_event(
                connection,
                event_type="operator-governance-backup-exported",
                actor_operator_id=actor_operator_id,
                target_operator_id=actor_operator_id,
                details=details,
            )
            connection.commit()
        return event

    @classmethod
    def validate_governance_snapshot(cls, snapshot: Any) -> dict[str, Any]:
        if not isinstance(snapshot, dict):
            raise ValueError("操作員治理快照必須是 JSON 物件。")
        schema_version = snapshot.get("schemaVersion")
        if (
            schema_version not in {1, 2}
            or snapshot.get("kind") != RECEIVER_OPERATOR_GOVERNANCE_SNAPSHOT_KIND
        ):
            raise ValueError("操作員治理快照版本或種類不受支援。")
        raw_operators = snapshot.get("operators")
        if not isinstance(raw_operators, list) or not raw_operators:
            raise ValueError("操作員治理快照至少須包含一個操作帳號。")
        operators: list[dict[str, Any]] = []
        operator_ids: set[str] = set()
        usernames: set[str] = set()
        enabled_admin_count = 0
        for raw in raw_operators:
            if not isinstance(raw, dict):
                raise ValueError("操作員治理快照含有格式不正確的帳號。")
            operator_id = _require_snapshot_string(raw.get("id"), field="operator.id", max_length=24)
            if not _OPERATOR_ID_PATTERN.fullmatch(operator_id) or operator_id in operator_ids:
                raise ValueError("操作員治理快照的操作員 ID 不正確或重複。")
            username = _validate_username(raw.get("username"))
            if username.casefold() in usernames:
                raise ValueError("操作員治理快照含有重複的登入帳號。")
            display_name = _validate_display_name(raw.get("displayName"))
            roles = _validate_roles(raw.get("roles"))
            disabled = raw.get("disabled")
            password_reset_required = raw.get("passwordResetRequired")
            if not isinstance(disabled, bool) or not isinstance(password_reset_required, bool):
                raise ValueError("操作員治理快照的帳號狀態格式不正確。")
            created_at = _iso(_parse_time(_require_snapshot_string(raw.get("createdAt"), field="createdAt")))
            salt = _decode_backup_bytes(
                raw.get("passwordSaltBase64"), field="passwordSaltBase64", expected_length=16
            )
            password_hash = _decode_backup_bytes(
                raw.get("passwordHashBase64"), field="passwordHashBase64", expected_length=_SCRYPT_DKLEN
            )
            if not disabled and "receiver-key-admin" in roles:
                enabled_admin_count += 1
            operators.append(
                {
                    "id": operator_id,
                    "username": username,
                    "displayName": display_name,
                    "roles": roles,
                    "disabled": disabled,
                    "passwordResetRequired": password_reset_required,
                    "createdAt": created_at,
                    "passwordSaltBase64": base64.b64encode(salt).decode("ascii"),
                    "passwordHashBase64": base64.b64encode(password_hash).decode("ascii"),
                }
            )
            operator_ids.add(operator_id)
            usernames.add(username.casefold())
        if enabled_admin_count < 1:
            raise ValueError("操作員治理快照沒有啟用中的管理員，復原後將無法治理。")

        raw_claims = snapshot.get("rotationClaims")
        if not isinstance(raw_claims, list):
            raise ValueError("操作員治理快照的輪替 claim 格式不正確。")
        claims: list[dict[str, Any]] = []
        request_fingerprints: set[str] = set()
        completion_fingerprints: set[str] = set()
        pending_key_ids: set[str] = set()
        for raw in raw_claims:
            if not isinstance(raw, dict):
                raise ValueError("操作員治理快照含有格式不正確的輪替 claim。")
            request_fingerprint = _require_snapshot_string(
                raw.get("requestFingerprint"), field="requestFingerprint", max_length=120
            )
            if request_fingerprint in request_fingerprints:
                raise ValueError("操作員治理快照含有重複的輪替申請指紋。")
            requested_by = _require_snapshot_string(
                raw.get("requestedByOperatorId"), field="requestedByOperatorId", max_length=24
            )
            approved_by = raw.get("approvedByOperatorId")
            if approved_by is not None:
                approved_by = _require_snapshot_string(
                    approved_by, field="approvedByOperatorId", max_length=24
                )
            if requested_by not in operator_ids or (approved_by is not None and approved_by not in operator_ids):
                raise ValueError("操作員治理快照的輪替 claim 引用不存在的操作員。")
            if approved_by is not None and approved_by == requested_by:
                raise ValueError("操作員治理快照的輪替申請人與覆核人不得相同。")
            state = _require_snapshot_string(raw.get("state"), field="rotationClaim.state", max_length=20)
            if state not in {"pending", "completed", "expired", "blocked"}:
                raise ValueError("操作員治理快照的輪替 claim 狀態不受支援。")
            new_key_id = _require_snapshot_string(raw.get("newKeyId"), field="newKeyId", max_length=200)
            old_key_id = _require_snapshot_string(raw.get("oldKeyId"), field="oldKeyId", max_length=200)
            if state == "pending":
                if new_key_id in pending_key_ids:
                    raise ValueError("操作員治理快照同一新金鑰含有多筆待審 claim。")
                pending_key_ids.add(new_key_id)
            requested_at = _iso(
                _parse_time(_require_snapshot_string(raw.get("requestedAt"), field="requestedAt"))
            )
            expires_at = _iso(
                _parse_time(_require_snapshot_string(raw.get("expiresAt"), field="expiresAt"))
            )
            approved_at = raw.get("approvedAt")
            if approved_at is not None:
                approved_at = _iso(_parse_time(_require_snapshot_string(approved_at, field="approvedAt")))
            completion = raw.get("completionEventFingerprint")
            if completion is not None:
                completion = _require_snapshot_string(
                    completion, field="completionEventFingerprint", max_length=120
                )
                if completion in completion_fingerprints:
                    raise ValueError("操作員治理快照含有重複的輪替完成事件指紋。")
                completion_fingerprints.add(completion)
            if state == "completed" and (approved_by is None or approved_at is None or completion is None):
                raise ValueError("已完成的輪替 claim 缺少覆核資訊。")
            if state != "completed" and any(value is not None for value in (approved_by, approved_at, completion)):
                raise ValueError("未完成的輪替 claim 不得含有覆核完成資訊。")
            claims.append(
                {
                    "requestFingerprint": request_fingerprint,
                    "newKeyId": new_key_id,
                    "oldKeyId": old_key_id,
                    "requestedByOperatorId": requested_by,
                    "requestedAt": requested_at,
                    "expiresAt": expires_at,
                    "state": state,
                    "approvedByOperatorId": approved_by,
                    "approvedAt": approved_at,
                    "completionEventFingerprint": completion,
                }
            )
            request_fingerprints.add(request_fingerprint)

        raw_disposition_claims = (
            snapshot.get("backupDispositionClaims")
            if schema_version == 2
            else []
        )
        if not isinstance(raw_disposition_claims, list):
            raise ValueError("操作員治理快照的備份處置 claim 格式不正確。")
        disposition_claims: list[dict[str, Any]] = []
        disposition_request_fingerprints: set[str] = set()
        disposition_receipt_fingerprints: set[str] = set()
        disposition_completion_events: set[str] = set()
        open_backup_fingerprints: set[str] = set()
        for raw in raw_disposition_claims:
            if not isinstance(raw, dict):
                raise ValueError("操作員治理快照含有格式不正確的備份處置 claim。")
            backup_fingerprint = _require_snapshot_string(
                raw.get("backupFingerprint"), field="backupFingerprint", max_length=24
            )
            snapshot_fingerprint = _require_snapshot_string(
                raw.get("snapshotFingerprint"), field="snapshotFingerprint", max_length=24
            )
            managed_file_name = _require_snapshot_string(
                raw.get("managedFileName"), field="managedFileName", max_length=240
            )
            managed_file_sha256 = _require_snapshot_string(
                raw.get("managedFileSha256"), field="managedFileSha256", max_length=71
            )
            if (
                not _BACKUP_FINGERPRINT_PATTERN.fullmatch(backup_fingerprint)
                or not _SNAPSHOT_FINGERPRINT_PATTERN.fullmatch(snapshot_fingerprint)
                or not _FILE_SHA256_PATTERN.fullmatch(managed_file_sha256)
                or Path(managed_file_name).name != managed_file_name
                or not managed_file_name.endswith(".json")
            ):
                raise ValueError("操作員治理快照的備份處置檔案識別資料不正確。")
            requested_by = _require_snapshot_string(
                raw.get("requestedByOperatorId"), field="requestedByOperatorId", max_length=24
            )
            approved_by = raw.get("approvedByOperatorId")
            completion_operator_id = raw.get("completionOperatorId")
            if approved_by is not None:
                approved_by = _require_snapshot_string(
                    approved_by, field="approvedByOperatorId", max_length=24
                )
            if completion_operator_id is not None:
                completion_operator_id = _require_snapshot_string(
                    completion_operator_id, field="completionOperatorId", max_length=24
                )
            referenced_ids = {
                value
                for value in (requested_by, approved_by, completion_operator_id)
                if value is not None
            }
            if not referenced_ids.issubset(operator_ids):
                raise ValueError("操作員治理快照的備份處置 claim 引用不存在的操作員。")
            if approved_by is not None and approved_by == requested_by:
                raise ValueError("操作員治理快照的備份處置申請人與覆核人不得相同。")
            exported_at = _iso(
                _parse_time(_require_snapshot_string(raw.get("exportedAt"), field="exportedAt"))
            )
            retention_until = _iso(
                _parse_time(
                    _require_snapshot_string(raw.get("retentionUntil"), field="retentionUntil")
                )
            )
            requested_at = _iso(
                _parse_time(_require_snapshot_string(raw.get("requestedAt"), field="requestedAt"))
            )
            expires_at = _iso(
                _parse_time(_require_snapshot_string(raw.get("expiresAt"), field="expiresAt"))
            )
            if not (
                _parse_time(exported_at) < _parse_time(retention_until) <= _parse_time(requested_at)
                < _parse_time(expires_at)
            ):
                raise ValueError("操作員治理快照的備份處置時間順序不正確。")
            case_reference = _require_snapshot_string(
                raw.get("caseReference"), field="caseReference", max_length=120
            )
            basis = _require_snapshot_string(raw.get("basis"), field="basis", max_length=500)
            request_payload = {
                "backupFingerprint": backup_fingerprint,
                "snapshotFingerprint": snapshot_fingerprint,
                "managedFileName": managed_file_name,
                "managedFileSha256": managed_file_sha256,
                "exportedAt": exported_at,
                "retentionUntil": retention_until,
                "requestedByOperatorId": requested_by,
                "requestedAt": requested_at,
                "expiresAt": expires_at,
                "caseReference": case_reference,
                "basis": basis,
            }
            request_fingerprint = _require_snapshot_string(
                raw.get("requestFingerprint"), field="requestFingerprint", max_length=24
            )
            if (
                not _BACKUP_DISPOSITION_REQUEST_PATTERN.fullmatch(request_fingerprint)
                or request_fingerprint in disposition_request_fingerprints
                or request_fingerprint != _backup_disposition_request_fingerprint(request_payload)
            ):
                raise ValueError("操作員治理快照的備份處置申請指紋不正確或重複。")
            state = _require_snapshot_string(
                raw.get("state"), field="backupDispositionClaim.state", max_length=24
            )
            if state not in {
                "pending", "removal-in-progress", "completed", "expired", "blocked"
            }:
                raise ValueError("操作員治理快照的備份處置 claim 狀態不受支援。")
            if state in {"pending", "removal-in-progress"}:
                if backup_fingerprint in open_backup_fingerprints:
                    raise ValueError("操作員治理快照同一備份含有多筆未結案處置 claim。")
                open_backup_fingerprints.add(backup_fingerprint)
            approved_at = raw.get("approvedAt")
            completed_at = raw.get("completedAt")
            receipt_fingerprint = raw.get("receiptFingerprint")
            completion_event = raw.get("completionEventFingerprint")
            if approved_at is not None:
                approved_at = _iso(
                    _parse_time(_require_snapshot_string(approved_at, field="approvedAt"))
                )
            if completed_at is not None:
                completed_at = _iso(
                    _parse_time(_require_snapshot_string(completed_at, field="completedAt"))
                )
            if receipt_fingerprint is not None:
                receipt_fingerprint = _require_snapshot_string(
                    receipt_fingerprint, field="receiptFingerprint", max_length=24
                )
                if (
                    not _BACKUP_DISPOSITION_RECEIPT_PATTERN.fullmatch(receipt_fingerprint)
                    or receipt_fingerprint in disposition_receipt_fingerprints
                ):
                    raise ValueError("操作員治理快照的備份處置收據指紋不正確或重複。")
                disposition_receipt_fingerprints.add(receipt_fingerprint)
            if completion_event is not None:
                completion_event = _require_snapshot_string(
                    completion_event, field="completionEventFingerprint", max_length=24
                )
                if (
                    not _AUDIT_FINGERPRINT_PATTERN.fullmatch(completion_event)
                    or completion_event in disposition_completion_events
                ):
                    raise ValueError("操作員治理快照的備份處置完成事件指紋不正確或重複。")
                disposition_completion_events.add(completion_event)
            approval_values = (approved_by, approved_at)
            reservation_values = (completion_operator_id, completed_at, receipt_fingerprint)
            if state in {"pending", "expired", "blocked"} and any(
                value is not None for value in (*approval_values, *reservation_values, completion_event)
            ):
                raise ValueError("未覆核的備份處置 claim 不得含有覆核或完成資訊。")
            if state == "removal-in-progress":
                if any(value is None for value in approval_values):
                    raise ValueError("執行中的備份處置 claim 缺少第二人覆核資訊。")
                reserved = [value is not None for value in reservation_values]
                if any(reserved) and not all(reserved):
                    raise ValueError("執行中的備份處置 claim 完成收據保留資訊不完整。")
                if completion_event is not None:
                    raise ValueError("尚未完成的備份處置 claim 不得含有完成事件。")
            if state == "completed" and any(
                value is None for value in (*approval_values, *reservation_values, completion_event)
            ):
                raise ValueError("已完成的備份處置 claim 缺少覆核、收據或事件資訊。")
            if approved_at is not None and not (
                _parse_time(requested_at) <= _parse_time(approved_at) <= _parse_time(expires_at)
            ):
                raise ValueError("操作員治理快照的備份處置覆核時間不正確。")
            if completed_at is not None and (
                approved_at is None or _parse_time(completed_at) < _parse_time(approved_at)
            ):
                raise ValueError("操作員治理快照的備份處置完成時間不正確。")
            disposition_claims.append(
                {
                    "requestFingerprint": request_fingerprint,
                    **request_payload,
                    "state": state,
                    "approvedByOperatorId": approved_by,
                    "approvedAt": approved_at,
                    "completionOperatorId": completion_operator_id,
                    "completedAt": completed_at,
                    "receiptFingerprint": receipt_fingerprint,
                    "completionEventFingerprint": completion_event,
                }
            )
            disposition_request_fingerprints.add(request_fingerprint)

        events = cls._validate_audit_event_list(snapshot.get("auditEvents"), operator_ids=operator_ids)
        if not events or events[0]["eventType"] != "operator-bootstrap-created":
            raise ValueError("操作員治理快照缺少首位管理員建立事件。")
        created_operator_ids = {
            event["targetOperatorId"]
            for event in events
            if event["eventType"] in {"operator-bootstrap-created", "operator-created"}
        }
        if created_operator_ids != operator_ids:
            raise ValueError("操作員治理快照的帳號與建立事件無法一一對應。")
        events_by_fingerprint = {event["eventFingerprint"]: event for event in events}
        for claim in disposition_claims:
            request_events = [
                event
                for event in events
                if event["eventType"] == "operator-backup-disposition-requested"
                and event["details"].get("requestFingerprint") == claim["requestFingerprint"]
                and event["details"].get("backupFingerprint") == claim["backupFingerprint"]
                and event["actorOperatorId"] == claim["requestedByOperatorId"]
            ]
            if len(request_events) != 1:
                raise ValueError("操作員治理快照的備份處置 claim 缺少唯一申請稽核事件。")
            if claim["state"] in {"removal-in-progress", "completed"}:
                approval_events = [
                    event
                    for event in events
                    if event["eventType"] == "operator-backup-disposition-approved"
                    and event["details"].get("requestFingerprint") == claim["requestFingerprint"]
                    and event["actorOperatorId"] == claim["approvedByOperatorId"]
                ]
                if len(approval_events) != 1:
                    raise ValueError("操作員治理快照的備份處置 claim 缺少唯一第二人覆核事件。")
            if claim["state"] == "completed":
                completion_event = events_by_fingerprint.get(
                    claim["completionEventFingerprint"]
                )
                if (
                    completion_event is None
                    or completion_event["eventType"] != "operator-backup-disposition-completed"
                    or completion_event["details"].get("requestFingerprint")
                    != claim["requestFingerprint"]
                    or completion_event["details"].get("receiptFingerprint")
                    != claim["receiptFingerprint"]
                    or completion_event["actorOperatorId"] != claim["completionOperatorId"]
                ):
                    raise ValueError("操作員治理快照的備份處置完成事件與 claim 不一致。")
        return {
            "schemaVersion": schema_version,
            "kind": RECEIVER_OPERATOR_GOVERNANCE_SNAPSHOT_KIND,
            "operators": sorted(operators, key=lambda item: item["username"].casefold()),
            "rotationClaims": sorted(claims, key=lambda item: item["requestedAt"]),
            **(
                {
                    "backupDispositionClaims": sorted(
                        disposition_claims,
                        key=lambda item: item["requestedAt"],
                    )
                }
                if schema_version == 2
                else {}
            ),
            "auditEvents": events,
        }

    def _governance_snapshot(self, connection: sqlite3.Connection) -> dict[str, Any]:
        operator_rows = connection.execute(
            "SELECT * FROM receiver_operators ORDER BY username COLLATE NOCASE"
        ).fetchall()
        operators = []
        for row in operator_rows:
            public = self._operator_public(connection, row)
            operators.append(
                {
                    **{key: public[key] for key in (
                        "id", "username", "displayName", "roles", "disabled",
                        "passwordResetRequired", "createdAt",
                    )},
                    "passwordSaltBase64": base64.b64encode(bytes(row["password_salt"])).decode("ascii"),
                    "passwordHashBase64": base64.b64encode(bytes(row["password_hash"])).decode("ascii"),
                }
            )
        claim_rows = connection.execute(
            "SELECT * FROM receiver_rotation_claims ORDER BY requested_at"
        ).fetchall()
        claims = [
            {
                "requestFingerprint": row["request_fingerprint"],
                "newKeyId": row["new_key_id"],
                "oldKeyId": row["old_key_id"],
                "requestedByOperatorId": row["requested_by_operator_id"],
                "requestedAt": row["requested_at"],
                "expiresAt": row["expires_at"],
                "state": row["state"],
                "approvedByOperatorId": row["approved_by_operator_id"],
                "approvedAt": row["approved_at"],
                "completionEventFingerprint": row["completion_event_fingerprint"],
            }
            for row in claim_rows
        ]
        disposition_rows = connection.execute(
            "SELECT * FROM receiver_backup_disposition_claims ORDER BY requested_at"
        ).fetchall()
        disposition_claims = [
            {
                "requestFingerprint": row["request_fingerprint"],
                "backupFingerprint": row["backup_fingerprint"],
                "snapshotFingerprint": row["snapshot_fingerprint"],
                "managedFileName": row["managed_file_name"],
                "managedFileSha256": row["managed_file_sha256"],
                "exportedAt": row["exported_at"],
                "retentionUntil": row["retention_until"],
                "requestedByOperatorId": row["requested_by_operator_id"],
                "requestedAt": row["requested_at"],
                "expiresAt": row["expires_at"],
                "caseReference": row["case_reference"],
                "basis": row["basis"],
                "state": row["state"],
                "approvedByOperatorId": row["approved_by_operator_id"],
                "approvedAt": row["approved_at"],
                "completionOperatorId": row["completion_operator_id"],
                "completedAt": row["completed_at"],
                "receiptFingerprint": row["receipt_fingerprint"],
                "completionEventFingerprint": row["completion_event_fingerprint"],
            }
            for row in disposition_rows
        ]
        audit_rows = connection.execute(
            "SELECT * FROM receiver_operator_audit_events ORDER BY sequence_no"
        ).fetchall()
        events = [
            {**self._audit_event_payload(row), "eventFingerprint": row["event_fingerprint"]}
            for row in audit_rows
        ]
        return self.validate_governance_snapshot(
            {
                "schemaVersion": 2,
                "kind": RECEIVER_OPERATOR_GOVERNANCE_SNAPSHOT_KIND,
                "operators": operators,
                "rotationClaims": claims,
                "backupDispositionClaims": disposition_claims,
                "auditEvents": events,
            }
        )

    def governance_snapshot(self) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN")
            snapshot = self._governance_snapshot(connection)
            connection.commit()
            return snapshot

    @classmethod
    def verify_governance_snapshot_admin(
        cls,
        snapshot: Any,
        username: str,
        password: str,
    ) -> str:
        validated = cls.validate_governance_snapshot(snapshot)
        try:
            username = _validate_username(username)
        except ValueError:
            cls._dummy_password_check(str(password or ""))
            raise ValueError("備份內管理員帳號或密碼不正確。")
        operator = next(
            (item for item in validated["operators"] if item["username"].casefold() == username.casefold()),
            None,
        )
        if operator is None:
            cls._dummy_password_check(str(password or ""))
            raise ValueError("備份內管理員帳號或密碼不正確。")
        salt = base64.b64decode(operator["passwordSaltBase64"])
        expected = base64.b64decode(operator["passwordHashBase64"])
        candidate = _password_hash(str(password or "")[:256], salt)
        if (
            operator["disabled"]
            or "receiver-key-admin" not in operator["roles"]
            or not hmac.compare_digest(candidate, expected)
        ):
            raise ValueError("備份內管理員帳號或密碼不正確。")
        return operator["id"]

    def replace_governance_snapshot(
        self,
        snapshot: Any,
        *,
        current_actor_operator_id: str,
        recovery_operator_id: str,
        restore_details: dict[str, Any],
        expected_current_snapshot: Any,
    ) -> dict[str, Any]:
        validated = self.validate_governance_snapshot(snapshot)
        expected_current = self.validate_governance_snapshot(expected_current_snapshot)
        restored_ids = {item["id"] for item in validated["operators"]}
        if recovery_operator_id not in restored_ids:
            raise ValueError("指定的備份內復原管理員不存在。")
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            if self._governance_snapshot(connection) != expected_current:
                raise ValueError("操作員治理資料在預覽後已變更，請重新匯入備份並確認差異。")
            self._require_active_admin(connection, current_actor_operator_id)
            connection.execute(
                "UPDATE receiver_operator_maintenance SET restore_authorized = 1 WHERE id = 1"
            )
            session_count = int(
                connection.execute("SELECT COUNT(*) FROM receiver_operator_sessions").fetchone()[0]
            )
            connection.execute("DELETE FROM receiver_operator_sessions")
            connection.execute("DELETE FROM receiver_login_attempts")
            connection.execute("DELETE FROM receiver_backup_disposition_claims")
            connection.execute("DELETE FROM receiver_rotation_claims")
            connection.execute("DELETE FROM receiver_operator_roles")
            connection.execute("DELETE FROM receiver_operator_audit_events")
            connection.execute("DELETE FROM receiver_operators")
            for operator in validated["operators"]:
                connection.execute(
                    """
                    INSERT INTO receiver_operators (
                        id, username, display_name, password_salt, password_hash,
                        disabled, password_reset_required, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        operator["id"],
                        operator["username"],
                        operator["displayName"],
                        base64.b64decode(operator["passwordSaltBase64"]),
                        base64.b64decode(operator["passwordHashBase64"]),
                        1 if operator["disabled"] else 0,
                        1 if operator["passwordResetRequired"] else 0,
                        operator["createdAt"],
                    ),
                )
                connection.executemany(
                    "INSERT INTO receiver_operator_roles (operator_id, role) VALUES (?, ?)",
                    [(operator["id"], role) for role in operator["roles"]],
                )
            for claim in validated["rotationClaims"]:
                connection.execute(
                    """
                    INSERT INTO receiver_rotation_claims (
                        request_fingerprint, new_key_id, old_key_id,
                        requested_by_operator_id, requested_at, expires_at, state,
                        approved_by_operator_id, approved_at, completion_event_fingerprint
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        claim["requestFingerprint"], claim["newKeyId"], claim["oldKeyId"],
                        claim["requestedByOperatorId"], claim["requestedAt"], claim["expiresAt"],
                        claim["state"], claim["approvedByOperatorId"], claim["approvedAt"],
                        claim["completionEventFingerprint"],
                    ),
                )
            for claim in validated.get("backupDispositionClaims", []):
                connection.execute(
                    """
                    INSERT INTO receiver_backup_disposition_claims (
                        request_fingerprint, backup_fingerprint, snapshot_fingerprint,
                        managed_file_name, managed_file_sha256, exported_at, retention_until,
                        requested_by_operator_id, requested_at, expires_at,
                        case_reference, basis, state,
                        approved_by_operator_id, approved_at,
                        completion_operator_id, completed_at, receipt_fingerprint,
                        completion_event_fingerprint
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        claim["requestFingerprint"], claim["backupFingerprint"],
                        claim["snapshotFingerprint"], claim["managedFileName"],
                        claim["managedFileSha256"], claim["exportedAt"],
                        claim["retentionUntil"], claim["requestedByOperatorId"],
                        claim["requestedAt"], claim["expiresAt"], claim["caseReference"],
                        claim["basis"], claim["state"], claim["approvedByOperatorId"],
                        claim["approvedAt"], claim["completionOperatorId"],
                        claim["completedAt"], claim["receiptFingerprint"],
                        claim["completionEventFingerprint"],
                    ),
                )
            for event in validated["auditEvents"]:
                connection.execute(
                    """
                    INSERT INTO receiver_operator_audit_events (
                        event_id, event_type,
                        actor_operator_id, actor_username, actor_display_name,
                        target_operator_id, target_username, target_display_name,
                        occurred_at, details_json, previous_event_fingerprint, event_fingerprint
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event["eventId"], event["eventType"],
                        event["actorOperatorId"], event["actorUsername"], event["actorDisplayName"],
                        event["targetOperatorId"], event["targetUsername"], event["targetDisplayName"],
                        event["occurredAt"],
                        json.dumps(event["details"], ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                        event["previousEventFingerprint"], event["eventFingerprint"],
                    ),
                )
            restore_event = self._record_audit_event(
                connection,
                event_type="operator-governance-restored",
                actor_operator_id=recovery_operator_id,
                target_operator_id=recovery_operator_id,
                details={**restore_details, "revokedSessions": session_count},
            )
            connection.execute(
                "UPDATE receiver_operator_maintenance SET restore_authorized = 0 WHERE id = 1"
            )
            connection.commit()
        restored = self.governance_snapshot()
        return {
            "snapshot": restored,
            "restoreEvent": restore_event,
            "revokedSessions": session_count,
        }

    @staticmethod
    def _dummy_password_check(password: str) -> None:
        salt = b"receiver-auth-dummy"
        _password_hash(password[:256], salt)

    def authenticate(self, username: str, password: str) -> dict[str, Any]:
        username = _validate_username(username)
        password = str(password or "")
        now = _utc_now()
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            attempt = connection.execute(
                "SELECT * FROM receiver_login_attempts WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
            if attempt and attempt["locked_until"] and _parse_time(attempt["locked_until"]) > now:
                raise ValueError("登入失敗次數過多，請稍後再試。")
            row = connection.execute(
                "SELECT * FROM receiver_operators WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
            valid = False
            if row is None:
                self._dummy_password_check(password)
            elif not row["disabled"]:
                candidate = _password_hash(password[:256], bytes(row["password_salt"]))
                valid = hmac.compare_digest(candidate, bytes(row["password_hash"]))
            if not valid:
                window_start = now
                failed_count = 1
                if attempt and now - _parse_time(attempt["window_started_at"]) <= timedelta(
                    minutes=LOGIN_FAILURE_WINDOW_MINUTES
                ):
                    window_start = _parse_time(attempt["window_started_at"])
                    failed_count = int(attempt["failed_count"]) + 1
                locked_until = (
                    _iso(now + timedelta(minutes=LOGIN_LOCK_MINUTES))
                    if failed_count >= LOGIN_FAILURE_LIMIT
                    else None
                )
                connection.execute(
                    """
                    INSERT INTO receiver_login_attempts (
                        username, failed_count, window_started_at, locked_until
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(username) DO UPDATE SET
                        failed_count = excluded.failed_count,
                        window_started_at = excluded.window_started_at,
                        locked_until = excluded.locked_until
                    """,
                    (username, failed_count, _iso(window_start), locked_until),
                )
                connection.commit()
                raise ValueError("登入帳號或密碼不正確。")
            connection.execute(
                "DELETE FROM receiver_login_attempts WHERE username = ? COLLATE NOCASE",
                (username,),
            )
            connection.commit()
            return self._operator_public(connection, row)

    def create_session(self, operator_id: str) -> dict[str, Any]:
        session_token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        now = _utc_now()
        expires_at = now + timedelta(hours=RECEIVER_SESSION_HOURS)
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            operator = self._require_operator(connection, operator_id)
            if operator["disabled"]:
                raise ValueError("登入帳號或密碼不正確。")
            connection.execute(
                "DELETE FROM receiver_operator_sessions WHERE expires_at <= ?",
                (_iso(now),),
            )
            connection.execute(
                """
                INSERT INTO receiver_operator_sessions (
                    session_hash, operator_id, csrf_hash, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (_token_hash(session_token), operator_id, _token_hash(csrf_token), _iso(now), _iso(expires_at)),
            )
            connection.commit()
        return {
            "sessionToken": session_token,
            "csrfToken": csrf_token,
            "expiresAt": _iso(expires_at),
        }

    def get_session(self, session_token: str | None, *, rotate_csrf: bool = False) -> dict[str, Any] | None:
        token = str(session_token or "").strip()
        if not token:
            return None
        now = _utc_now()
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT s.*, o.username, o.display_name, o.disabled, o.created_at
                FROM receiver_operator_sessions s
                JOIN receiver_operators o ON o.id = s.operator_id
                WHERE s.session_hash = ?
                """,
                (_token_hash(token),),
            ).fetchone()
            if row is None or row["disabled"] or _parse_time(row["expires_at"]) <= now:
                connection.execute(
                    "DELETE FROM receiver_operator_sessions WHERE session_hash = ?",
                    (_token_hash(token),),
                )
                connection.commit()
                return None
            csrf_token = None
            if rotate_csrf:
                csrf_token = secrets.token_urlsafe(32)
                connection.execute(
                    "UPDATE receiver_operator_sessions SET csrf_hash = ? WHERE session_hash = ?",
                    (_token_hash(csrf_token), _token_hash(token)),
                )
            operator_row = connection.execute(
                "SELECT * FROM receiver_operators WHERE id = ?",
                (row["operator_id"],),
            ).fetchone()
            operator = self._operator_public(connection, operator_row)
            connection.commit()
            return {
                "operator": operator,
                "csrfToken": csrf_token,
                "csrfHash": row["csrf_hash"] if not rotate_csrf else _token_hash(csrf_token),
                "expiresAt": row["expires_at"],
                "sessionHash": row["session_hash"],
            }

    def require_session(
        self,
        session_token: str | None,
        *,
        required_role: str | None = None,
        csrf_token: str | None = None,
        allow_password_reset: bool = False,
    ) -> dict[str, Any]:
        session = self.get_session(session_token)
        if session is None:
            raise PermissionError("請先登入接收端金鑰管理帳號。")
        if session["operator"]["passwordResetRequired"] and not allow_password_reset:
            raise PermissionError("此帳號必須先變更管理員重設的臨時密碼。")
        if required_role and required_role not in session["operator"]["roles"]:
            raise PermissionError("目前登入帳號沒有執行此操作所需的角色。")
        if csrf_token is not None and not hmac.compare_digest(
            _token_hash(str(csrf_token or "")), str(session["csrfHash"])
        ):
            raise PermissionError("登入工作階段的 CSRF 驗證失敗，請重新整理或重新登入。")
        return session

    def delete_session(self, session_token: str | None) -> None:
        token = str(session_token or "").strip()
        if not token:
            return
        with closing(self._connect()) as connection:
            connection.execute(
                "DELETE FROM receiver_operator_sessions WHERE session_hash = ?",
                (_token_hash(token),),
            )
            connection.commit()

    @contextmanager
    def rotation_request_transaction(
        self,
        operator_id: str,
        new_key_id: str,
    ) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            now = _iso(_utc_now())
            connection.execute(
                """
                UPDATE receiver_rotation_claims
                SET state = 'expired'
                WHERE state = 'pending' AND expires_at <= ?
                """,
                (now,),
            )
            active = connection.execute(
                """
                SELECT request_fingerprint FROM receiver_rotation_claims
                WHERE new_key_id = ? AND state = 'pending'
                """,
                (new_key_id,),
            ).fetchone()
            if active:
                raise ValueError(f"此新金鑰已有待覆核申請 {active['request_fingerprint']}。")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def record_rotation_request(
        connection: sqlite3.Connection,
        summary: dict[str, Any],
        operator_id: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO receiver_rotation_claims (
                request_fingerprint, new_key_id, old_key_id,
                requested_by_operator_id, requested_at, expires_at, state
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
            """,
            (
                summary["requestFingerprint"],
                summary["newKeyId"],
                summary["oldKeyId"],
                operator_id,
                summary["requestedAt"],
                summary["expiresAt"],
            ),
        )

    @contextmanager
    def rotation_approval_transaction(
        self,
        operator_id: str,
        request_fingerprint: str,
    ) -> Iterator[tuple[sqlite3.Connection, dict[str, Any]]]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM receiver_rotation_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            if row is None:
                raise ValueError("此輪替申請不是由已驗證的本機登入帳號提出，不得以角色權限覆核。")
            if row["state"] == "completed":
                raise ValueError("此輪替完成申請已覆核執行，不得重複使用。")
            if row["state"] != "pending":
                raise ValueError("此輪替完成申請已非待覆核狀態。")
            if _parse_time(row["expires_at"]) <= _utc_now():
                connection.execute(
                    "UPDATE receiver_rotation_claims SET state = 'expired' WHERE request_fingerprint = ?",
                    (request_fingerprint,),
                )
                raise ValueError("此輪替完成申請已逾 72 小時有效期限，請重新提出申請。")
            if row["requested_by_operator_id"] == operator_id:
                raise ValueError("輪替覆核帳號必須與申請帳號不同。")
            yield connection, dict(row)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def record_rotation_approval(
        connection: sqlite3.Connection,
        request_fingerprint: str,
        operator_id: str,
        completion_event_fingerprint: str,
        approved_at: str,
    ) -> None:
        cursor = connection.execute(
            """
            UPDATE receiver_rotation_claims
            SET state = 'completed', approved_by_operator_id = ?, approved_at = ?,
                completion_event_fingerprint = ?
            WHERE request_fingerprint = ? AND state = 'pending'
            """,
            (operator_id, approved_at, completion_event_fingerprint, request_fingerprint),
        )
        if cursor.rowcount != 1:
            raise ValueError("輪替申請狀態已變更，未完成覆核寫入。")

    def rotation_claims(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM receiver_rotation_claims ORDER BY requested_at"
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _backup_disposition_claim_public(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        return {
            "requestFingerprint": row["request_fingerprint"],
            "backupFingerprint": row["backup_fingerprint"],
            "snapshotFingerprint": row["snapshot_fingerprint"],
            "managedFileName": row["managed_file_name"],
            "managedFileSha256": row["managed_file_sha256"],
            "exportedAt": row["exported_at"],
            "retentionUntil": row["retention_until"],
            "requestedByOperatorId": row["requested_by_operator_id"],
            "requestedAt": row["requested_at"],
            "expiresAt": row["expires_at"],
            "caseReference": row["case_reference"],
            "basis": row["basis"],
            "state": row["state"],
            "approvedByOperatorId": row["approved_by_operator_id"],
            "approvedAt": row["approved_at"],
            "completionOperatorId": row["completion_operator_id"],
            "completedAt": row["completed_at"],
            "receiptFingerprint": row["receipt_fingerprint"],
            "completionEventFingerprint": row["completion_event_fingerprint"],
        }

    def create_backup_disposition_request(
        self,
        operator_id: str,
        backup_item: dict[str, Any],
        *,
        case_reference: str,
        basis: str,
        request_confirmed: bool,
    ) -> dict[str, Any]:
        if request_confirmed is not True:
            raise ValueError("提出到期備份處置申請前必須明確確認。")
        case_reference = str(case_reference or "").strip()
        basis = str(basis or "").strip()
        if not case_reference or len(case_reference) > 120:
            raise ValueError("到期備份處置案件／變更編號須為 1 至 120 個字元。")
        if not basis or len(basis) > 500:
            raise ValueError("到期備份處置依據須為 1 至 500 個字元。")
        now = _utc_now()
        requested_at = _iso(now)
        expires_at = _iso(now + timedelta(hours=72))
        request_payload = {
            "backupFingerprint": backup_item["backupFingerprint"],
            "snapshotFingerprint": backup_item["snapshotFingerprint"],
            "managedFileName": backup_item["fileName"],
            "managedFileSha256": backup_item["fileSha256"],
            "exportedAt": backup_item["exportedAt"],
            "retentionUntil": backup_item["retentionUntil"],
            "requestedByOperatorId": operator_id,
            "requestedAt": requested_at,
            "expiresAt": expires_at,
            "caseReference": case_reference,
            "basis": basis,
        }
        request_fingerprint = _backup_disposition_request_fingerprint(request_payload)
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_role(connection, operator_id, "receiver-key-requester")
            connection.execute(
                """
                UPDATE receiver_backup_disposition_claims
                SET state = 'expired'
                WHERE state = 'pending' AND expires_at <= ?
                """,
                (requested_at,),
            )
            active = connection.execute(
                """
                SELECT request_fingerprint
                FROM receiver_backup_disposition_claims
                WHERE backup_fingerprint = ?
                  AND state IN ('pending', 'removal-in-progress')
                """,
                (backup_item["backupFingerprint"],),
            ).fetchone()
            if active:
                raise ValueError(
                    f"此到期備份已有未結案處置申請 {active['request_fingerprint']}。"
                )
            connection.execute(
                """
                INSERT INTO receiver_backup_disposition_claims (
                    request_fingerprint, backup_fingerprint, snapshot_fingerprint,
                    managed_file_name, managed_file_sha256, exported_at, retention_until,
                    requested_by_operator_id, requested_at, expires_at,
                    case_reference, basis, state
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    request_fingerprint,
                    request_payload["backupFingerprint"],
                    request_payload["snapshotFingerprint"],
                    request_payload["managedFileName"],
                    request_payload["managedFileSha256"],
                    request_payload["exportedAt"],
                    request_payload["retentionUntil"],
                    operator_id,
                    requested_at,
                    expires_at,
                    case_reference,
                    basis,
                ),
            )
            event = self._record_audit_event(
                connection,
                event_type="operator-backup-disposition-requested",
                actor_operator_id=operator_id,
                target_operator_id=operator_id,
                details={
                    "requestFingerprint": request_fingerprint,
                    "backupFingerprint": request_payload["backupFingerprint"],
                    "managedFileSha256": request_payload["managedFileSha256"],
                    "retentionUntil": request_payload["retentionUntil"],
                    "caseReference": case_reference,
                    "basis": basis,
                    "expiresAt": expires_at,
                    "automaticExpiryDeletion": False,
                    "secureEraseGuaranteed": False,
                },
            )
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            connection.commit()
        return {
            "request": self._backup_disposition_claim_public(row),
            "auditEventFingerprint": event["eventFingerprint"],
        }

    def prepare_backup_disposition_approval(
        self,
        operator_id: str,
        request_fingerprint: str,
        *,
        approval_confirmed: bool,
    ) -> dict[str, Any]:
        if approval_confirmed is not True:
            raise ValueError("第二人覆核到期備份處置前必須明確確認。")
        approval_event: dict[str, Any] | None = None
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_role(connection, operator_id, "receiver-key-approver")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            if row is None:
                raise ValueError("找不到指定的到期備份處置申請。")
            if row["state"] == "completed":
                raise ValueError("此到期備份處置申請已完成，不得重複覆核。")
            if row["state"] == "pending":
                if _parse_time(row["expires_at"]) <= _utc_now():
                    connection.execute(
                        """
                        UPDATE receiver_backup_disposition_claims
                        SET state = 'expired'
                        WHERE request_fingerprint = ? AND state = 'pending'
                        """,
                        (request_fingerprint,),
                    )
                    connection.commit()
                    raise ValueError("此到期備份處置申請已逾 72 小時，請重新提出。")
                if row["requested_by_operator_id"] == operator_id:
                    raise ValueError("到期備份處置覆核帳號必須與申請帳號不同。")
                approved_at = _iso(_utc_now())
                connection.execute(
                    """
                    UPDATE receiver_backup_disposition_claims
                    SET state = 'removal-in-progress', approved_by_operator_id = ?, approved_at = ?
                    WHERE request_fingerprint = ? AND state = 'pending'
                    """,
                    (operator_id, approved_at, request_fingerprint),
                )
                approval_event = self._record_audit_event(
                    connection,
                    event_type="operator-backup-disposition-approved",
                    actor_operator_id=operator_id,
                    target_operator_id=row["requested_by_operator_id"],
                    details={
                        "requestFingerprint": request_fingerprint,
                        "backupFingerprint": row["backup_fingerprint"],
                        "caseReference": row["case_reference"],
                        "ordinaryFilesystemRemovalAuthorized": True,
                        "secureEraseGuaranteed": False,
                    },
                )
            elif row["state"] != "removal-in-progress":
                raise ValueError("此到期備份處置申請已非待覆核狀態。")
            elif row["requested_by_operator_id"] == operator_id:
                raise ValueError("到期備份處置執行帳號不得是原申請帳號。")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            connection.commit()
        return {
            "claim": self._backup_disposition_claim_public(row),
            "approvalAuditEventFingerprint": (
                approval_event["eventFingerprint"] if approval_event else None
            ),
        }

    def reserve_backup_disposition_completion(
        self,
        operator_id: str,
        request_fingerprint: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_role(connection, operator_id, "receiver-key-approver")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            if row is None or row["state"] != "removal-in-progress":
                raise ValueError("到期備份處置不是可完成的執行中狀態。")
            if row["requested_by_operator_id"] == operator_id:
                raise ValueError("到期備份處置完成帳號不得是原申請帳號。")
            if (
                row["completion_operator_id"] is not None
                and row["completion_operator_id"] != operator_id
            ):
                raise ValueError("到期備份處置已由另一覆核帳號保留完成資訊。")
            if row["completion_operator_id"] is None:
                connection.execute(
                    """
                    UPDATE receiver_backup_disposition_claims
                    SET completion_operator_id = ?, completed_at = ?
                    WHERE request_fingerprint = ? AND state = 'removal-in-progress'
                    """,
                    (operator_id, _iso(_utc_now()), request_fingerprint),
                )
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            connection.commit()
        return self._backup_disposition_claim_public(row)

    def reserve_backup_disposition_receipt(
        self,
        request_fingerprint: str,
        *,
        completion_operator_id: str,
        completed_at: str,
        receipt_fingerprint: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            if row is None or row["state"] != "removal-in-progress":
                raise ValueError("到期備份處置不是可保留收據的執行中狀態。")
            if (
                row["completion_operator_id"] != completion_operator_id
                or row["completed_at"] != completed_at
            ):
                raise ValueError("到期備份處置完成保留資訊已變更。")
            if row["receipt_fingerprint"] not in {None, receipt_fingerprint}:
                raise ValueError("到期備份處置已保留不同的收據指紋。")
            connection.execute(
                """
                UPDATE receiver_backup_disposition_claims
                SET receipt_fingerprint = ?
                WHERE request_fingerprint = ? AND state = 'removal-in-progress'
                """,
                (receipt_fingerprint, request_fingerprint),
            )
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            connection.commit()
        return self._backup_disposition_claim_public(row)

    def complete_backup_disposition(
        self,
        operator_id: str,
        request_fingerprint: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require_active_role(connection, operator_id, "receiver-key-approver")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            if row is None or row["state"] != "removal-in-progress":
                raise ValueError("到期備份處置不是可結案的執行中狀態。")
            if row["requested_by_operator_id"] == operator_id:
                raise ValueError("到期備份處置結案帳號不得是原申請帳號。")
            if row["completion_operator_id"] != operator_id:
                raise ValueError("到期備份處置必須由保留完成資訊的覆核帳號結案。")
            if any(
                row[field] is None
                for field in (
                    "approved_by_operator_id", "approved_at", "completion_operator_id",
                    "completed_at", "receipt_fingerprint",
                )
            ):
                raise ValueError("到期備份處置缺少覆核或收據保留資訊。")
            event = self._record_audit_event(
                connection,
                event_type="operator-backup-disposition-completed",
                actor_operator_id=operator_id,
                target_operator_id=row["requested_by_operator_id"],
                details={
                    "requestFingerprint": request_fingerprint,
                    "backupFingerprint": row["backup_fingerprint"],
                    "receiptFingerprint": row["receipt_fingerprint"],
                    "managedFileRemoved": True,
                    "automaticExpiryDeletion": False,
                    "secureEraseGuaranteed": False,
                    "otherCopiesMayRemain": True,
                },
            )
            cursor = connection.execute(
                """
                UPDATE receiver_backup_disposition_claims
                SET state = 'completed', completion_event_fingerprint = ?
                WHERE request_fingerprint = ? AND state = 'removal-in-progress'
                """,
                (event["eventFingerprint"], request_fingerprint),
            )
            if cursor.rowcount != 1:
                raise ValueError("到期備份處置狀態已變更，未完成結案。")
            row = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims WHERE request_fingerprint = ?",
                (request_fingerprint,),
            ).fetchone()
            connection.commit()
        return {
            "claim": self._backup_disposition_claim_public(row),
            "completionAuditEventFingerprint": event["eventFingerprint"],
        }

    def backup_disposition_claims(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                UPDATE receiver_backup_disposition_claims
                SET state = 'expired'
                WHERE state = 'pending' AND expires_at <= ?
                """,
                (_iso(_utc_now()),),
            )
            rows = connection.execute(
                "SELECT * FROM receiver_backup_disposition_claims ORDER BY requested_at DESC"
            ).fetchall()
            connection.commit()
        return [self._backup_disposition_claim_public(row) for row in rows]


def operator_role_label(role: str) -> str:
    return {
        "receiver-key-admin": "接收端金鑰管理員",
        "receiver-key-requester": "治理申請人",
        "receiver-key-approver": "治理覆核人",
    }.get(role, role)
