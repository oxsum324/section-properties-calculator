from __future__ import annotations

from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
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
                """
            )

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
            "createdAt": row["created_at"],
            "identityAssurance": "authenticated-local-account",
        }

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
            connection.commit()
            return operator

    def create_operator(
        self,
        username: str,
        display_name: str,
        password: str,
        roles: list[str],
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            operator = self._create_operator(
                connection,
                username=username,
                display_name=display_name,
                password=password,
                roles=roles,
            )
            connection.commit()
            return operator

    def list_operators(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM receiver_operators ORDER BY disabled, username COLLATE NOCASE"
            ).fetchall()
            return [self._operator_public(connection, row) for row in rows]

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
    ) -> dict[str, Any]:
        session = self.get_session(session_token)
        if session is None:
            raise PermissionError("請先登入接收端金鑰管理帳號。")
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
