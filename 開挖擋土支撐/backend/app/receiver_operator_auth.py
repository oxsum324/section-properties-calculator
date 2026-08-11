from __future__ import annotations

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
                CREATE TRIGGER IF NOT EXISTS receiver_operator_audit_no_update
                    BEFORE UPDATE ON receiver_operator_audit_events
                    BEGIN
                        SELECT RAISE(ABORT, 'receiver operator audit events are append-only');
                    END;
                CREATE TRIGGER IF NOT EXISTS receiver_operator_audit_no_delete
                    BEFORE DELETE ON receiver_operator_audit_events
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

    def list_audit_events(self) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM receiver_operator_audit_events ORDER BY sequence_no"
            ).fetchall()
        previous_fingerprint = None
        events: list[dict[str, Any]] = []
        for row in rows:
            payload = self._audit_event_payload(row)
            if payload["previousEventFingerprint"] != previous_fingerprint:
                raise ValueError("操作帳號稽核鏈前後指紋不一致，請停止管理操作並人工稽核。")
            expected = "ROE-" + hashlib.sha256(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()[:20].upper()
            if not hmac.compare_digest(expected, row["event_fingerprint"]):
                raise ValueError("操作帳號稽核事件內容指紋不一致，請停止管理操作並人工稽核。")
            event = {**payload, "eventFingerprint": row["event_fingerprint"]}
            events.append(event)
            previous_fingerprint = row["event_fingerprint"]
        return {
            "events": list(reversed(events)),
            "chainValid": True,
            "eventCount": len(events),
            "headFingerprint": previous_fingerprint,
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


def operator_role_label(role: str) -> str:
    return {
        "receiver-key-admin": "接收端金鑰管理員",
        "receiver-key-requester": "輪替申請人",
        "receiver-key-approver": "輪替覆核人",
    }.get(role, role)
