from __future__ import annotations

import copy
from contextlib import closing
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app import receiver_operator_backup as backup_module
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_operator_backup import (
    build_receiver_operator_governance_backup,
    decrypt_receiver_operator_governance_backup,
    preview_receiver_operator_governance_restore,
    restore_receiver_operator_governance_backup,
)


PASSPHRASE = "Governance-Backup-Phrase-2026!"


class ReceiverOperatorBackupTests(unittest.TestCase):
    def test_encrypted_backup_hides_credentials_accounts_and_runtime_sessions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            admin = store.bootstrap("backup-admin", "備份管理員", "Correct-Horse-2026!")
            user = store.create_operator(
                "rotation-user",
                "輪替操作員",
                "Independent-User-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            store.create_session(admin["id"])
            store.create_session(user["id"])
            with self.assertRaises(ValueError):
                store.authenticate("rotation-user", "Wrong-Password-2026!")

            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            encoded = json.dumps(backup, ensure_ascii=False)
            self.assertNotIn("backup-admin", encoded)
            self.assertNotIn("rotation-user", encoded)
            self.assertNotIn("Correct-Horse-2026!", encoded)
            self.assertNotIn("passwordHashBase64", encoded)
            self.assertNotIn("session", encoded.casefold())
            self.assertEqual(backup["encryption"]["algorithm"], "AES-256-GCM")
            self.assertEqual(backup["encryption"]["kdf"], "scrypt")
            self.assertEqual(backup["summary"]["operatorCount"], 2)

            _, snapshot = decrypt_receiver_operator_governance_backup(backup, PASSPHRASE)
            self.assertEqual(
                {item["username"] for item in snapshot["operators"]},
                {"backup-admin", "rotation-user"},
            )
            self.assertNotIn("sessions", snapshot)
            self.assertNotIn("loginAttempts", snapshot)

    def test_wrong_passphrase_and_ciphertext_tampering_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            store.bootstrap("backup-admin", "備份管理員", "Correct-Horse-2026!")
            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            with self.assertRaisesRegex(ValueError, "密碼不正確或密文已遭竄改"):
                decrypt_receiver_operator_governance_backup(
                    backup,
                    "Wrong-Governance-Phrase-2026!",
                )

            tampered = copy.deepcopy(backup)
            ciphertext = tampered["ciphertextBase64"]
            tampered["ciphertextBase64"] = ("A" if ciphertext[0] != "A" else "B") + ciphertext[1:]
            with self.assertRaisesRegex(ValueError, "整包指紋驗證失敗"):
                decrypt_receiver_operator_governance_backup(tampered, PASSPHRASE)

    def test_restore_requires_backup_admin_credential_safeguards_current_state_and_revokes_sessions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source_admin = source.bootstrap("source-admin", "來源管理員", "Correct-Horse-2026!")
            source.create_operator(
                "source-reviewer",
                "來源覆核人",
                "Independent-Review-2026!",
                ["receiver-key-approver"],
                actor_operator_id=source_admin["id"],
            )
            backup = build_receiver_operator_governance_backup(source, PASSPHRASE)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            recovery_admin = target.bootstrap(
                "recovery-admin",
                "現況復原管理員",
                "Recovery-Current-2026!",
            )
            current_session = target.create_session(recovery_admin["id"])
            preview = preview_receiver_operator_governance_restore(target, backup, PASSPHRASE)["preview"]
            self.assertEqual(preview["currentStatus"], "fresh-recovery-bootstrap")
            self.assertTrue(preview["restoreAllowed"])
            self.assertEqual(preview["addedUsernames"], ["source-admin", "source-reviewer"])
            self.assertEqual(preview["removedUsernames"], ["recovery-admin"])

            with self.assertRaisesRegex(ValueError, "備份內管理員帳號或密碼不正確"):
                restore_receiver_operator_governance_backup(
                    target,
                    backup,
                    PASSPHRASE,
                    current_actor_operator_id=recovery_admin["id"],
                    recovery_username="source-admin",
                    recovery_password="Wrong-Source-Password-2026!",
                    restore_confirmed=True,
                )
            self.assertEqual(target.list_operators()[0]["username"], "recovery-admin")

            restored = restore_receiver_operator_governance_backup(
                target,
                backup,
                PASSPHRASE,
                current_actor_operator_id=recovery_admin["id"],
                recovery_username="source-admin",
                recovery_password="Correct-Horse-2026!",
                restore_confirmed=True,
            )
            self.assertTrue(restored["restored"])
            self.assertTrue(restored["loggedOut"])
            self.assertEqual(restored["revokedSessions"], 1)
            self.assertIsNone(target.get_session(current_session["sessionToken"]))
            self.assertEqual(
                {item["username"] for item in target.list_operators()},
                {"source-admin", "source-reviewer"},
            )
            self.assertEqual(
                target.authenticate("source-admin", "Correct-Horse-2026!")["id"],
                source_admin["id"],
            )
            audit = target.list_audit_events()
            self.assertTrue(audit["chainValid"])
            self.assertEqual(audit["events"][0]["eventType"], "operator-governance-restored")
            safeguard_path = root / "receiver_operator_governance_backups" / restored["safeguardFileName"]
            self.assertTrue(safeguard_path.is_file())
            safeguard_text = safeguard_path.read_text(encoding="utf-8")
            self.assertNotIn("recovery-admin", safeguard_text)
            self.assertNotIn("Recovery-Current-2026!", safeguard_text)
            safeguard = json.loads(safeguard_text)
            _, safeguard_snapshot = decrypt_receiver_operator_governance_backup(safeguard, PASSPHRASE)
            self.assertEqual(safeguard_snapshot["operators"][0]["username"], "recovery-admin")

            with closing(target._connect()) as connection:
                with self.assertRaisesRegex(Exception, "append-only"):
                    connection.execute("DELETE FROM receiver_operator_audit_events")

    def test_failed_transaction_rolls_back_data_sessions_and_maintenance_unlock(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source_admin = source.bootstrap("source-admin", "來源管理員", "Correct-Horse-2026!")
            source_snapshot = source.governance_snapshot()

            target = ReceiverOperatorStore(root / "target.sqlite3")
            recovery_admin = target.bootstrap(
                "recovery-admin",
                "現況復原管理員",
                "Recovery-Current-2026!",
            )
            session = target.create_session(recovery_admin["id"])
            with patch.object(target, "_record_audit_event", side_effect=RuntimeError("forced rollback")):
                with self.assertRaisesRegex(RuntimeError, "forced rollback"):
                    target.replace_governance_snapshot(
                        source_snapshot,
                        current_actor_operator_id=recovery_admin["id"],
                        recovery_operator_id=source_admin["id"],
                        expected_current_snapshot=target.governance_snapshot(),
                        restore_details={"backupFingerprint": "ROB-test"},
                    )

            self.assertEqual(target.list_operators()[0]["username"], "recovery-admin")
            self.assertIsNotNone(target.get_session(session["sessionToken"]))
            with closing(target._connect()) as connection:
                maintenance = connection.execute(
                    "SELECT restore_authorized FROM receiver_operator_maintenance WHERE id = 1"
                ).fetchone()[0]
                self.assertEqual(maintenance, 0)
                with self.assertRaisesRegex(Exception, "append-only"):
                    connection.execute("DELETE FROM receiver_operator_audit_events")

    def test_restore_aborts_when_governance_changes_after_preview(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source.bootstrap("source-admin", "來源管理員", "Correct-Horse-2026!")
            backup = build_receiver_operator_governance_backup(source, PASSPHRASE)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            recovery_admin = target.bootstrap(
                "recovery-admin",
                "現況復原管理員",
                "Recovery-Current-2026!",
            )
            session = target.create_session(recovery_admin["id"])
            original_safeguard = backup_module._write_safeguard_backup

            def write_then_mutate(*args, **kwargs):
                result = original_safeguard(*args, **kwargs)
                target.create_operator(
                    "racing-reviewer",
                    "同時異動覆核人",
                    "Concurrent-Review-2026!",
                    ["receiver-key-approver"],
                    actor_operator_id=recovery_admin["id"],
                )
                return result

            with patch.object(backup_module, "_write_safeguard_backup", side_effect=write_then_mutate):
                with self.assertRaisesRegex(ValueError, "預覽後已變更"):
                    restore_receiver_operator_governance_backup(
                        target,
                        backup,
                        PASSPHRASE,
                        current_actor_operator_id=recovery_admin["id"],
                        recovery_username="source-admin",
                        recovery_password="Correct-Horse-2026!",
                        restore_confirmed=True,
                    )

            self.assertEqual(
                {item["username"] for item in target.list_operators()},
                {"recovery-admin", "racing-reviewer"},
            )
            self.assertIsNotNone(target.get_session(session["sessionToken"]))

    def test_restore_rejects_history_rollback_and_identical_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            admin = store.bootstrap("backup-admin", "備份管理員", "Correct-Horse-2026!")
            original = build_receiver_operator_governance_backup(store, PASSPHRASE)
            identical = preview_receiver_operator_governance_restore(store, original, PASSPHRASE)["preview"]
            self.assertFalse(identical["restoreAllowed"])
            self.assertIn("完全相同", identical["blockingReasons"][0])

            store.create_operator(
                "new-reviewer",
                "新增覆核人",
                "Independent-New-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            rollback = preview_receiver_operator_governance_restore(store, original, PASSPHRASE)["preview"]
            self.assertFalse(rollback["restoreAllowed"])
            self.assertIn("不得回退", rollback["blockingReasons"][0])

    def test_http_backup_restore_requires_admin_csrf_and_logs_out_restored_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source.bootstrap("source-admin", "來源管理員", "Correct-Horse-2026!")
            source_backup = build_receiver_operator_governance_backup(source, PASSPHRASE)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            target.bootstrap("recovery-admin", "現況復原管理員", "Recovery-Current-2026!")
            with patch.object(main_module, "receiver_operator_store", target):
                client = TestClient(main_module.app)
                login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "recovery-admin", "password": "Recovery-Current-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                csrf = login.json()["csrfToken"]

                exported = client.post(
                    "/api/receiver-operator-governance-backups/export",
                    headers={"X-CSRF-Token": csrf},
                    json={"passphrase": PASSPHRASE},
                )
                self.assertEqual(exported.status_code, 200, exported.text)
                self.assertNotIn("recovery-admin", json.dumps(exported.json(), ensure_ascii=False))
                self.assertTrue(exported.json()["auditEventFingerprint"].startswith("ROE-"))
                _, exported_snapshot = decrypt_receiver_operator_governance_backup(
                    exported.json()["backup"],
                    PASSPHRASE,
                )
                self.assertEqual(
                    exported_snapshot["auditEvents"][-1]["eventType"],
                    "operator-governance-backup-exported",
                )

                validated = client.post(
                    "/api/receiver-operator-governance-backups/validate",
                    headers={"X-CSRF-Token": csrf},
                    json={"backup": source_backup, "passphrase": PASSPHRASE},
                )
                self.assertEqual(validated.status_code, 200, validated.text)
                self.assertTrue(validated.json()["preview"]["restoreAllowed"])
                self.assertEqual(
                    validated.json()["preview"]["currentStatus"],
                    "fresh-recovery-bootstrap",
                )

                missing_csrf = client.post(
                    "/api/receiver-operator-governance-backups/restore",
                    json={
                        "backup": source_backup,
                        "passphrase": PASSPHRASE,
                        "recovery_username": "source-admin",
                        "recovery_password": "Correct-Horse-2026!",
                        "restore_confirmed": True,
                    },
                )
                self.assertEqual(missing_csrf.status_code, 403, missing_csrf.text)

                restored = client.post(
                    "/api/receiver-operator-governance-backups/restore",
                    headers={"X-CSRF-Token": csrf},
                    json={
                        "backup": source_backup,
                        "passphrase": PASSPHRASE,
                        "recovery_username": "source-admin",
                        "recovery_password": "Correct-Horse-2026!",
                        "restore_confirmed": True,
                    },
                )
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertTrue(restored.json()["loggedOut"])
                self.assertIn("Max-Age=0", restored.headers.get("set-cookie", ""))
                session = client.get("/api/receiver-operator-auth/session")
                self.assertFalse(session.json()["authenticated"])
                source_login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "source-admin", "password": "Correct-Horse-2026!"},
                )
                self.assertEqual(source_login.status_code, 200, source_login.text)


if __name__ == "__main__":
    unittest.main()
