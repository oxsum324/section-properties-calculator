from __future__ import annotations

import copy
from contextlib import closing
import json
from pathlib import Path
import shutil
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


def _record_health(
    store: ReceiverOperatorStore,
    actor_operator_id: str,
    sequence: int,
    *,
    status: str = "attention",
    change_type: str | None = None,
) -> dict:
    token = f"{sequence:020X}"
    return store.record_governance_health_observation(
        {
            "kind": "receiver-governance-separation-health",
            "status": status,
            "healthFingerprint": f"RGH-{token}",
            "activeRequesterCount": sequence,
            "activeApproverCount": sequence,
            "pendingRotationCount": 0,
            "pendingBackupDispositionCount": 0,
            "unreviewablePendingCount": 0,
            "sources": {
                "operatorGovernanceSnapshotFingerprint": f"ROG-{token}",
                "trustRegistryFingerprint": f"RTR-{token}",
                "operatorAuditHeadFingerprint": None,
            },
        },
        change_type=change_type or f"test-health-{sequence}",
        actor_operator_id=actor_operator_id,
    )


class ReceiverOperatorBackupTests(unittest.TestCase):
    def test_v3_backup_encrypts_governance_health_history_and_binds_summary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            admin = store.bootstrap("history-admin", "歷程管理員", "History-Strong-2026!")
            _record_health(store, admin["id"], 1)

            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            self.assertEqual(backup["schemaVersion"], 3)
            self.assertEqual(backup["summary"]["governanceHealthObservationCount"], 1)
            self.assertRegex(
                backup["summary"]["governanceHealthHeadFingerprint"],
                r"^GHR-[0-9A-F]{20}$",
            )
            encoded = json.dumps(backup, ensure_ascii=False)
            self.assertNotIn("test-health-1", encoded)
            self.assertNotIn(admin["id"], encoded)

            normalized, snapshot, history = (
                backup_module._decrypt_receiver_operator_governance_backup_payload(
                    backup,
                    PASSPHRASE,
                )
            )
            self.assertEqual(normalized["schemaVersion"], 3)
            self.assertEqual(snapshot, store.governance_snapshot())
            self.assertEqual(history, store.governance_health_history())

            unchanged_preview = preview_receiver_operator_governance_restore(
                store,
                backup,
                PASSPHRASE,
            )["preview"]
            self.assertFalse(unchanged_preview["restoreAllowed"])
            self.assertFalse(unchanged_preview["wouldReplace"])
            self.assertEqual(
                unchanged_preview["healthHistoryAction"],
                "already-current",
            )

            tampered = copy.deepcopy(backup)
            tampered["summary"]["governanceHealthObservationCount"] = 2
            with self.assertRaisesRegex(ValueError, "整包指紋驗證失敗"):
                decrypt_receiver_operator_governance_backup(tampered, PASSPHRASE)

            malformed_head = copy.deepcopy(backup)
            malformed_head["summary"]["governanceHealthHeadFingerprint"] = (
                "GHR-gggggggggggggggggggg"
            )
            malformed_head["backupFingerprint"] = backup_module._backup_fingerprint(
                malformed_head
            )
            with self.assertRaisesRegex(ValueError, "治理健康歷程鏈首格式不正確"):
                decrypt_receiver_operator_governance_backup(malformed_head, PASSPHRASE)

    def test_v3_restore_recovers_history_and_safeguards_replaced_local_chain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source_admin = source.bootstrap(
                "source-admin",
                "來源管理員",
                "Correct-Horse-2026!",
            )
            _record_health(source, source_admin["id"], 1)
            _record_health(source, source_admin["id"], 2, status="overlap")
            source_history = source.governance_health_history()
            backup = build_receiver_operator_governance_backup(source, PASSPHRASE)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            target_admin = target.bootstrap(
                "target-admin",
                "目標管理員",
                "Target-Strong-2026!",
            )
            _record_health(
                target,
                target_admin["id"],
                9,
                change_type="operator-bootstrap",
            )
            target_history = target.governance_health_history()
            preview = preview_receiver_operator_governance_restore(
                target,
                backup,
                PASSPHRASE,
            )["preview"]
            self.assertTrue(preview["historyIncludedInBackup"])
            self.assertEqual(preview["healthHistoryAction"], "replace-from-backup")
            self.assertEqual(preview["backupHealthObservationCount"], 2)

            restored = restore_receiver_operator_governance_backup(
                target,
                backup,
                PASSPHRASE,
                current_actor_operator_id=target_admin["id"],
                recovery_username="source-admin",
                recovery_password="Correct-Horse-2026!",
                restore_confirmed=True,
            )
            self.assertTrue(restored["historyRestoredFromBackup"])
            self.assertEqual(target.governance_health_history(), source_history)
            safeguard_path = (
                root
                / "receiver_operator_governance_backups"
                / restored["safeguardFileName"]
            )
            safeguard = json.loads(safeguard_path.read_text(encoding="utf-8"))
            self.assertEqual(safeguard["schemaVersion"], 3)
            _, _, safeguard_history = (
                backup_module._decrypt_receiver_operator_governance_backup_payload(
                    safeguard,
                    PASSPHRASE,
                )
            )
            self.assertEqual(safeguard_history, target_history)

    def test_v3_restore_accepts_history_forward_extension_and_rejects_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = root / "source.sqlite3"
            source = ReceiverOperatorStore(source_path)
            admin = source.bootstrap("chain-admin", "鏈管理員", "Chain-Strong-2026!")
            _record_health(source, admin["id"], 1)
            first_backup = build_receiver_operator_governance_backup(source, PASSPHRASE)
            target_path = root / "target.sqlite3"
            shutil.copy2(source_path, target_path)

            _record_health(source, admin["id"], 2, status="complete")
            forward_backup = build_receiver_operator_governance_backup(source, PASSPHRASE)
            target = ReceiverOperatorStore(target_path)
            forward = preview_receiver_operator_governance_restore(
                target,
                forward_backup,
                PASSPHRASE,
            )["preview"]
            self.assertTrue(forward["restoreAllowed"])
            self.assertTrue(forward["wouldReplace"])
            self.assertEqual(forward["healthHistoryAction"], "extend-from-backup")

            restored = restore_receiver_operator_governance_backup(
                target,
                forward_backup,
                PASSPHRASE,
                current_actor_operator_id=admin["id"],
                recovery_username="chain-admin",
                recovery_password="Chain-Strong-2026!",
                restore_confirmed=True,
            )
            self.assertEqual(restored["restoredHealthObservationCount"], 2)

            rollback = preview_receiver_operator_governance_restore(
                source,
                first_backup,
                PASSPHRASE,
            )["preview"]
            self.assertFalse(rollback["restoreAllowed"])
            self.assertTrue(any("GHR" in reason and "不得回退" in reason for reason in rollback["blockingReasons"]))

    def test_v3_restore_aborts_if_health_history_changes_after_preview(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source_admin = source.bootstrap(
                "source-admin",
                "來源管理員",
                "Correct-Horse-2026!",
            )
            _record_health(source, source_admin["id"], 1)
            backup = build_receiver_operator_governance_backup(source, PASSPHRASE)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            target_admin = target.bootstrap(
                "target-admin",
                "目標管理員",
                "Target-Strong-2026!",
            )
            _record_health(
                target,
                target_admin["id"],
                9,
                change_type="operator-bootstrap",
            )
            original_safeguard = backup_module._write_safeguard_backup

            def write_then_append_history(*args, **kwargs):
                result = original_safeguard(*args, **kwargs)
                _record_health(target, target_admin["id"], 10)
                return result

            with patch.object(
                backup_module,
                "_write_safeguard_backup",
                side_effect=write_then_append_history,
            ):
                with self.assertRaisesRegex(ValueError, "治理健康歷程在預覽後已變更"):
                    restore_receiver_operator_governance_backup(
                        target,
                        backup,
                        PASSPHRASE,
                        current_actor_operator_id=target_admin["id"],
                        recovery_username="source-admin",
                        recovery_password="Correct-Horse-2026!",
                        restore_confirmed=True,
                    )
            self.assertEqual(target.list_operators()[0]["username"], "target-admin")
            self.assertEqual(target.governance_health_history()["observationCount"], 2)

    def test_legacy_v2_restore_preserves_local_health_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverOperatorStore(root / "source.sqlite3")
            source.bootstrap("source-admin", "來源管理員", "Correct-Horse-2026!")
            legacy_backup = backup_module._encrypt_snapshot(
                source.governance_snapshot(),
                PASSPHRASE,
                exported_at="2026-08-01T00:00:00Z",
            )
            self.assertEqual(legacy_backup["schemaVersion"], 2)

            target = ReceiverOperatorStore(root / "target.sqlite3")
            target_admin = target.bootstrap(
                "target-admin",
                "目標管理員",
                "Target-Strong-2026!",
            )
            _record_health(
                target,
                target_admin["id"],
                9,
                change_type="operator-bootstrap",
            )
            original_history = target.governance_health_history()
            preview = preview_receiver_operator_governance_restore(
                target,
                legacy_backup,
                PASSPHRASE,
            )["preview"]
            self.assertFalse(preview["historyIncludedInBackup"])
            self.assertEqual(
                preview["healthHistoryAction"],
                "preserve-local-legacy-backup",
            )

            restored = restore_receiver_operator_governance_backup(
                target,
                legacy_backup,
                PASSPHRASE,
                current_actor_operator_id=target_admin["id"],
                recovery_username="source-admin",
                recovery_password="Correct-Horse-2026!",
                restore_confirmed=True,
            )
            self.assertFalse(restored["historyIncludedInBackup"])
            self.assertFalse(restored["historyRestoredFromBackup"])
            self.assertEqual(target.governance_health_history(), original_history)

    def test_legacy_v1_backup_remains_readable_after_disposition_claim_upgrade(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverOperatorStore(Path(directory) / "operators.sqlite3")
            store.bootstrap("legacy-admin", "舊版備份管理員", "Legacy-Strong-2026!")
            current = store.governance_snapshot()
            legacy_snapshot = {
                "schemaVersion": 1,
                "kind": current["kind"],
                "operators": current["operators"],
                "rotationClaims": current["rotationClaims"],
                "auditEvents": current["auditEvents"],
            }
            legacy_backup = backup_module._encrypt_snapshot(
                legacy_snapshot,
                PASSPHRASE,
                exported_at="2026-08-01T00:00:00Z",
            )
            self.assertEqual(legacy_backup["schemaVersion"], 1)
            self.assertNotIn("backupDispositionClaimCount", legacy_backup["summary"])
            _, decrypted = decrypt_receiver_operator_governance_backup(
                legacy_backup,
                PASSPHRASE,
            )
            self.assertEqual(decrypted["schemaVersion"], 1)
            self.assertNotIn("backupDispositionClaims", decrypted)

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
                self.assertEqual(exported.json()["backup"]["schemaVersion"], 3)
                self.assertGreaterEqual(
                    exported.json()["backup"]["summary"]["governanceHealthObservationCount"],
                    1,
                )
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
