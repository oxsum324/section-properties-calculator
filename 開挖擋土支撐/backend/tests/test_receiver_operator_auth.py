from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_key_enrollment import build_receiver_key_enrollment
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_trust_store import ReceiverTrustStore


class ReceiverOperatorStoreTests(unittest.TestCase):
    def test_existing_operator_database_adds_password_reset_column_without_rebuild(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "operators.sqlite3"
            with closing(sqlite3.connect(db_path)) as connection:
                connection.execute(
                    """
                    CREATE TABLE receiver_operators (
                        id TEXT PRIMARY KEY,
                        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                        display_name TEXT NOT NULL,
                        password_salt BLOB NOT NULL,
                        password_hash BLOB NOT NULL,
                        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
                        created_at TEXT NOT NULL
                    )
                    """
                )
                connection.commit()

            store = ReceiverOperatorStore(db_path)
            with closing(sqlite3.connect(db_path)) as connection:
                columns = {
                    row[1]
                    for row in connection.execute("PRAGMA table_info(receiver_operators)").fetchall()
                }
            self.assertIn("password_reset_required", columns)
            operator = store.bootstrap("migrated-admin", "既有資料庫管理員", "Migration-Secure-2026!")
            self.assertFalse(operator["passwordResetRequired"])
            self.assertTrue(store.list_audit_events()["chainValid"])
            with closing(sqlite3.connect(db_path)) as connection:
                maintenance = connection.execute(
                    "SELECT restore_authorized FROM receiver_operator_maintenance WHERE id = 1"
                ).fetchone()[0]
                self.assertEqual(maintenance, 0)
                with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                    connection.execute("DELETE FROM receiver_operator_audit_events")

    def test_http_boundary_requires_session_csrf_role_and_restricts_cors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            operator_store = ReceiverOperatorStore(root / "operators.sqlite3")
            trust_store = ReceiverTrustStore(root / "receiver-trust.json")
            old = build_receiver_key_enrollment(Ed25519PrivateKey.generate(), "接收端單位", "舊章")
            trust_store.register_enrollment(old, True)
            new = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章",
                replaces_key_id=old["keyId"],
            )
            trust_store.register_enrollment(new, True)

            with (
                patch.object(main_module, "receiver_operator_store", operator_store),
                patch.object(main_module, "receiver_trust_store", trust_store),
            ):
                anonymous = TestClient(main_module.app)
                unauthorized = anonymous.post(
                    f"/api/removal-transfer-trust-keys/{new['keyId']}/rotation-requests",
                    json={
                        "reason": "切換完成。",
                        "incident_reference": "KEY-HTTP-001",
                        "request_confirmed": True,
                    },
                )
                self.assertEqual(unauthorized.status_code, 401, unauthorized.text)

                bootstrap = anonymous.post(
                    "/api/receiver-operator-auth/bootstrap",
                    json={
                        "username": "http-admin",
                        "display_name": "HTTP 管理員",
                        "password": "Correct-Horse-2026!",
                    },
                )
                self.assertEqual(bootstrap.status_code, 200, bootstrap.text)
                set_cookie = bootstrap.headers["set-cookie"].lower()
                self.assertIn("httponly", set_cookie)
                self.assertIn("samesite=strict", set_cookie)
                missing_csrf = anonymous.post(
                    f"/api/removal-transfer-trust-keys/{new['keyId']}/rotation-requests",
                    json={
                        "reason": "切換完成。",
                        "incident_reference": "KEY-HTTP-001",
                        "request_confirmed": True,
                    },
                )
                self.assertEqual(missing_csrf.status_code, 403, missing_csrf.text)

                csrf = bootstrap.json()["csrfToken"]
                created = anonymous.post(
                    "/api/receiver-operators",
                    headers={"X-CSRF-Token": csrf},
                    json={
                        "username": "approver-only",
                        "display_name": "僅覆核帳號",
                        "password": "Independent-Secure-2026!",
                        "roles": ["receiver-key-approver"],
                    },
                )
                self.assertEqual(created.status_code, 200, created.text)
                approver = TestClient(main_module.app)
                login = approver.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "approver-only", "password": "Independent-Secure-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                wrong_role = approver.post(
                    f"/api/removal-transfer-trust-keys/{new['keyId']}/rotation-requests",
                    headers={"X-CSRF-Token": login.json()["csrfToken"]},
                    json={
                        "reason": "切換完成。",
                        "incident_reference": "KEY-HTTP-001",
                        "request_confirmed": True,
                    },
                )
                self.assertEqual(wrong_role.status_code, 403, wrong_role.text)

                cors = anonymous.options(
                    "/api/receiver-operators",
                    headers={
                        "Origin": "https://attacker.example",
                        "Access-Control-Request-Method": "POST",
                    },
                )
                self.assertNotEqual(cors.headers.get("access-control-allow-origin"), "https://attacker.example")

    def test_bootstrap_hashes_password_and_creates_csrf_protected_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "operators.sqlite3"
            store = ReceiverOperatorStore(db_path)
            self.assertTrue(store.bootstrap_required())
            operator = store.bootstrap("trust-admin", "王管理者", "Correct-Horse-2026!")
            self.assertFalse(store.bootstrap_required())
            self.assertEqual(
                set(operator["roles"]),
                {"receiver-key-admin", "receiver-key-requester", "receiver-key-approver"},
            )
            with self.assertRaisesRegex(ValueError, "不得再次建立"):
                store.bootstrap("other-admin", "第二管理者", "Another-Secure-2026!")

            with closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT password_salt, password_hash FROM receiver_operators WHERE id = ?",
                    (operator["id"],),
                ).fetchone()
            self.assertNotIn(b"Correct-Horse-2026!", bytes(row[0]) + bytes(row[1]))

            session = store.create_session(operator["id"])
            authenticated = store.require_session(
                session["sessionToken"],
                required_role="receiver-key-admin",
                csrf_token=session["csrfToken"],
            )
            self.assertEqual(authenticated["operator"]["id"], operator["id"])
            with self.assertRaisesRegex(PermissionError, "CSRF"):
                store.require_session(
                    session["sessionToken"],
                    required_role="receiver-key-admin",
                    csrf_token="wrong-token",
                )
            store.delete_session(session["sessionToken"])
            self.assertIsNone(store.get_session(session["sessionToken"]))

    def test_authenticated_event_without_sqlite_claim_is_visible_but_cannot_be_approved(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            operator_store = ReceiverOperatorStore(root / "operators.sqlite3")
            trust_store = ReceiverTrustStore(root / "receiver-trust.json")
            requester = operator_store.bootstrap(
                "request-admin",
                "王申請人",
                "Requester-Secure-2026!",
            )
            operator_store.create_operator(
                "reviewer-only",
                "李覆核者",
                "Independent-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            old = build_receiver_key_enrollment(Ed25519PrivateKey.generate(), "接收端單位", "舊章")
            trust_store.register_enrollment(old, True)
            new = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章",
                replaces_key_id=old["keyId"],
            )
            trust_store.register_enrollment(new, True)
            request_summary = trust_store.request_rotation_completion(
                new["keyId"],
                reason="切換完成。",
                requested_by=requester["displayName"],
                requester_role="輪替申請人",
                requested_by_operator_id=requester["id"],
                incident_reference="KEY-MISSING-CLAIM-001",
                request_confirmed=True,
            )

            with (
                patch.object(main_module, "receiver_operator_store", operator_store),
                patch.object(main_module, "receiver_trust_store", trust_store),
            ):
                reviewer = TestClient(main_module.app)
                listed = reviewer.get("/api/removal-transfer-trust-keys")
                self.assertEqual(listed.status_code, 200, listed.text)
                self.assertEqual(listed.json()["rotationRequests"][0]["authorizationState"], "missing-claim")

                login = reviewer.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "reviewer-only", "password": "Independent-Secure-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                approval = reviewer.post(
                    f"/api/removal-transfer-trust-key-rotation-requests/{request_summary['requestFingerprint']}/approve",
                    headers={"X-CSRF-Token": login.json()["csrfToken"]},
                    json={"approval_confirmed": True},
                )
                self.assertEqual(approval.status_code, 400, approval.text)
                self.assertIn("不是由已驗證的本機登入帳號提出", approval.text)
                old_after = next(item for item in trust_store.list_keys() if item["keyId"] == old["keyId"])
                self.assertEqual(old_after["status"], "trusted")

    def test_roles_are_enforced_and_login_is_rate_limited(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            admin = store.bootstrap("trust-admin", "王管理者", "Correct-Horse-2026!")
            reviewer = store.create_operator(
                "trust-reviewer",
                "李覆核者",
                "Reviewer-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            session = store.create_session(reviewer["id"])
            with self.assertRaisesRegex(PermissionError, "角色"):
                store.require_session(
                    session["sessionToken"],
                    required_role="receiver-key-requester",
                    csrf_token=session["csrfToken"],
                )
            for _ in range(5):
                with self.assertRaisesRegex(ValueError, "帳號或密碼"):
                    store.authenticate("trust-reviewer", "Wrong-Password-2026!")
            with self.assertRaisesRegex(ValueError, "失敗次數過多"):
                store.authenticate("trust-reviewer", "Reviewer-Secure-2026!")

    def test_bootstrap_and_pending_rotation_claims_are_unique_across_store_instances(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "operators.sqlite3"
            first = ReceiverOperatorStore(db_path)
            second = ReceiverOperatorStore(db_path)

            def bootstrap(store: ReceiverOperatorStore, username: str) -> str:
                try:
                    store.bootstrap(username, username, "Bootstrap-Secure-2026!")
                    return "created"
                except ValueError:
                    return "blocked"

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda args: bootstrap(*args), [(first, "admin-one"), (second, "admin-two")]))
            self.assertEqual(sorted(results), ["blocked", "created"])

            admin = first.list_operators()[0]
            summary = {
                "requestFingerprint": "RVE-11111111111111111111",
                "newKeyId": "RVK-NEW",
                "oldKeyId": "RVK-OLD",
                "requestedAt": "2026-08-11T00:00:00Z",
                "expiresAt": "2099-08-14T00:00:00Z",
            }
            with first.rotation_request_transaction(admin["id"], summary["newKeyId"]) as connection:
                first.record_rotation_request(connection, summary, admin["id"])
            with self.assertRaisesRegex(ValueError, "已有待覆核申請"):
                with second.rotation_request_transaction(admin["id"], summary["newKeyId"]):
                    pass

    def test_parallel_database_approvals_allow_one_completion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "operators.sqlite3"
            store = ReceiverOperatorStore(db_path)
            requester = store.bootstrap("request-admin", "王申請人", "Requester-Secure-2026!")
            first_reviewer = store.create_operator(
                "reviewer-one",
                "李覆核者",
                "Independent-One-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            second_reviewer = store.create_operator(
                "reviewer-two",
                "陳覆核者",
                "Independent-Two-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            summary = {
                "requestFingerprint": "RVE-22222222222222222222",
                "newKeyId": "RVK-NEW",
                "oldKeyId": "RVK-OLD",
                "requestedAt": "2026-08-11T00:00:00Z",
                "expiresAt": "2099-08-14T00:00:00Z",
            }
            with store.rotation_request_transaction(requester["id"], summary["newKeyId"]) as connection:
                store.record_rotation_request(connection, summary, requester["id"])

            def approve(operator_id: str, suffix: str) -> str:
                try:
                    local_store = ReceiverOperatorStore(db_path)
                    with local_store.rotation_approval_transaction(
                        operator_id, summary["requestFingerprint"]
                    ) as (connection, _claim):
                        local_store.record_rotation_approval(
                            connection,
                            summary["requestFingerprint"],
                            operator_id,
                            f"RVE-{suffix * 20}",
                            "2026-08-11T01:00:00Z",
                        )
                    return "completed"
                except ValueError:
                    return "blocked"

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(
                    executor.map(
                        lambda args: approve(*args),
                        [(first_reviewer["id"], "A"), (second_reviewer["id"], "B")],
                    )
                )
            self.assertEqual(sorted(results), ["blocked", "completed"])
            claims = store.rotation_claims()
            self.assertEqual(claims[0]["state"], "completed")
            self.assertIn(
                claims[0]["approved_by_operator_id"],
                {first_reviewer["id"], second_reviewer["id"]},
            )

    def test_account_lifecycle_revokes_access_blocks_pending_claims_and_keeps_audit_chain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "operators.sqlite3"
            store = ReceiverOperatorStore(db_path)
            admin = store.bootstrap("trust-admin", "王管理者", "Correct-Horse-2026!")
            backup_admin = store.create_operator(
                "backup-admin",
                "李備援管理者",
                "Independent-Backup-2026!",
                ["receiver-key-admin"],
                actor_operator_id=admin["id"],
            )
            requester = store.create_operator(
                "rotation-user",
                "陳申請人",
                "Requester-Start-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            old_session = store.create_session(requester["id"])
            summary = {
                "requestFingerprint": "RVE-33333333333333333333",
                "newKeyId": "RVK-NEW-LIFECYCLE",
                "oldKeyId": "RVK-OLD-LIFECYCLE",
                "requestedAt": "2026-08-11T00:00:00Z",
                "expiresAt": "2099-08-14T00:00:00Z",
            }
            with store.rotation_request_transaction(requester["id"], summary["newKeyId"]) as connection:
                store.record_rotation_request(connection, summary, requester["id"])

            updated = store.update_roles(
                requester["id"],
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            self.assertEqual(updated["roles"], ["receiver-key-approver"])
            self.assertEqual(store.rotation_claims()[0]["state"], "blocked")
            with self.assertRaisesRegex(PermissionError, "角色"):
                store.require_session(
                    old_session["sessionToken"],
                    required_role="receiver-key-requester",
                    csrf_token=old_session["csrfToken"],
                )

            reset = store.reset_password(
                requester["id"],
                "Temporary-Reset-2026!",
                actor_operator_id=admin["id"],
            )
            self.assertTrue(reset["passwordResetRequired"])
            self.assertIsNone(store.get_session(old_session["sessionToken"]))
            authenticated = store.authenticate("rotation-user", "Temporary-Reset-2026!")
            self.assertTrue(authenticated["passwordResetRequired"])
            reset_session = store.create_session(requester["id"])
            with self.assertRaisesRegex(PermissionError, "必須先變更"):
                store.require_session(
                    reset_session["sessionToken"],
                    required_role="receiver-key-approver",
                    csrf_token=reset_session["csrfToken"],
                )
            store.require_session(
                reset_session["sessionToken"],
                csrf_token=reset_session["csrfToken"],
                allow_password_reset=True,
            )
            changed = store.change_password(
                requester["id"],
                "Temporary-Reset-2026!",
                "Permanent-Changed-2026!",
            )
            self.assertFalse(changed["passwordResetRequired"])
            self.assertIsNone(store.get_session(reset_session["sessionToken"]))
            with self.assertRaisesRegex(ValueError, "帳號或密碼"):
                store.authenticate("rotation-user", "Temporary-Reset-2026!")
            store.authenticate("rotation-user", "Permanent-Changed-2026!")

            active_session = store.create_session(requester["id"])
            disabled = store.set_disabled(
                requester["id"],
                True,
                actor_operator_id=admin["id"],
            )
            self.assertTrue(disabled["disabled"])
            self.assertIsNone(store.get_session(active_session["sessionToken"]))
            with self.assertRaisesRegex(ValueError, "帳號或密碼"):
                store.authenticate("rotation-user", "Permanent-Changed-2026!")
            enabled = store.set_disabled(
                requester["id"],
                False,
                actor_operator_id=admin["id"],
            )
            self.assertFalse(enabled["disabled"])
            store.authenticate("rotation-user", "Permanent-Changed-2026!")

            with self.assertRaisesRegex(ValueError, "不得自行變更角色"):
                store.update_roles(
                    admin["id"],
                    ["receiver-key-admin"],
                    actor_operator_id=admin["id"],
                )
            with self.assertRaisesRegex(ValueError, "不得自行停用"):
                store.set_disabled(admin["id"], True, actor_operator_id=admin["id"])
            with self.assertRaisesRegex(ValueError, "不得由重設入口"):
                store.reset_password(
                    admin["id"],
                    "Admin-Reset-Blocked-2026!",
                    actor_operator_id=admin["id"],
                )

            store.set_disabled(
                backup_admin["id"],
                True,
                actor_operator_id=admin["id"],
            )
            with self.assertRaisesRegex(PermissionError, "啟用中的"):
                store.create_operator(
                    "blocked-create",
                    "不得建立",
                    "Blocked-Create-2026!",
                    ["receiver-key-admin"],
                    actor_operator_id=backup_admin["id"],
                )

            audit = store.list_audit_events()
            self.assertTrue(audit["chainValid"])
            self.assertGreaterEqual(audit["eventCount"], 9)
            event_types = {event["eventType"] for event in audit["events"]}
            self.assertTrue(
                {
                    "operator-bootstrap-created",
                    "operator-created",
                    "operator-roles-changed",
                    "operator-password-reset",
                    "operator-password-changed",
                    "operator-disabled",
                    "operator-enabled",
                }.issubset(event_types)
            )
            with closing(sqlite3.connect(db_path)) as connection:
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE receiver_operator_audit_events SET event_type = 'tampered' WHERE sequence_no = 1"
                    )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute("DELETE FROM receiver_operator_audit_events WHERE sequence_no = 1")

    def test_http_password_reset_requires_change_before_admin_actions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            operator_store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            with patch.object(main_module, "receiver_operator_store", operator_store):
                primary = TestClient(main_module.app)
                bootstrap = primary.post(
                    "/api/receiver-operator-auth/bootstrap",
                    json={
                        "username": "primary-admin",
                        "display_name": "主要管理者",
                        "password": "Primary-Secure-2026!",
                    },
                )
                self.assertEqual(bootstrap.status_code, 200, bootstrap.text)
                csrf = bootstrap.json()["csrfToken"]
                created = primary.post(
                    "/api/receiver-operators",
                    headers={"X-CSRF-Token": csrf},
                    json={
                        "username": "managed-admin",
                        "display_name": "受管管理者",
                        "password": "Independent-Admin-2026!",
                        "roles": ["receiver-key-admin"],
                    },
                )
                self.assertEqual(created.status_code, 200, created.text)
                target = created.json()["operator"]
                reset = primary.post(
                    f"/api/receiver-operators/{target['id']}/password-reset",
                    headers={"X-CSRF-Token": csrf},
                    json={"new_password": "Temporary-Access-2026!"},
                )
                self.assertEqual(reset.status_code, 200, reset.text)
                self.assertTrue(reset.json()["operator"]["passwordResetRequired"])

                managed = TestClient(main_module.app)
                login = managed.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "managed-admin", "password": "Temporary-Access-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                self.assertTrue(login.json()["operator"]["passwordResetRequired"])
                managed_csrf = login.json()["csrfToken"]
                blocked = managed.get("/api/receiver-operators")
                self.assertEqual(blocked.status_code, 403, blocked.text)
                changed = managed.post(
                    "/api/receiver-operator-auth/change-password",
                    headers={"X-CSRF-Token": managed_csrf},
                    json={
                        "current_password": "Temporary-Access-2026!",
                        "new_password": "Permanent-Access-2026!",
                    },
                )
                self.assertEqual(changed.status_code, 200, changed.text)
                self.assertTrue(changed.json()["loggedOut"])
                relogin = managed.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "managed-admin", "password": "Permanent-Access-2026!"},
                )
                self.assertEqual(relogin.status_code, 200, relogin.text)
                self.assertFalse(relogin.json()["operator"]["passwordResetRequired"])

                audit = primary.get("/api/receiver-operator-audit-events")
                self.assertEqual(audit.status_code, 200, audit.text)
                self.assertTrue(audit.json()["chainValid"])
                self.assertGreaterEqual(audit.json()["eventCount"], 4)


if __name__ == "__main__":
    unittest.main()
