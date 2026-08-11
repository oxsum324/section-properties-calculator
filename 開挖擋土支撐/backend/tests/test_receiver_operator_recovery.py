from __future__ import annotations

import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_operator_backup import build_receiver_operator_governance_backup
from backend.app.receiver_operator_recovery import (
    list_receiver_operator_governance_recovery_inventory,
    perform_receiver_operator_governance_recovery_drill,
    validate_receiver_operator_recovery_drill_receipt,
    write_managed_receiver_operator_governance_backup,
)


PASSPHRASE = "Governance-Recovery-Phrase-2026!"


class ReceiverOperatorRecoveryLifecycleTests(unittest.TestCase):
    def test_managed_backup_inventory_tracks_retention_without_exposing_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            store.bootstrap("managed-admin", "受管制備份管理員", "Managed-Strong-2026!")
            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)

            managed = write_managed_receiver_operator_governance_backup(
                store,
                backup,
                retention_days=45,
            )
            self.assertRegex(managed["fileName"], r"^managed-.*-expires-.*-ROB-[0-9A-F]{20}\.json$")
            path = root / "receiver_operator_governance_backups" / "managed" / managed["fileName"]
            encoded = path.read_text(encoding="utf-8")
            self.assertNotIn("managed-admin", encoded)
            self.assertNotIn("Managed-Strong-2026!", encoded)

            inventory = list_receiver_operator_governance_recovery_inventory(store)
            self.assertEqual(inventory["scope"], "local-server-only")
            self.assertEqual(len(inventory["managedBackups"]), 1)
            self.assertEqual(inventory["managedBackups"][0]["retentionDays"], 45)
            self.assertEqual(inventory["managedBackups"][0]["status"], "active")
            self.assertEqual(inventory["health"]["status"], "attention-required")
            self.assertIn(
                "latest-backup-not-drilled",
                {item["code"] for item in inventory["health"]["issues"]},
            )
            self.assertFalse(inventory["retentionBoundary"]["automaticDeletion"])
            self.assertFalse(inventory["retentionBoundary"]["secureEraseGuaranteed"])

    def test_isolated_drill_uses_real_restore_login_and_keeps_production_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            admin = store.bootstrap("drill-admin", "復原演練管理員", "Drill-Strong-2026!")
            store.create_operator(
                "drill-reviewer",
                "復原演練覆核人",
                "Review-Strong-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            write_managed_receiver_operator_governance_backup(store, backup, retention_days=30)
            before = store.governance_snapshot()

            result = perform_receiver_operator_governance_recovery_drill(
                store,
                backup,
                PASSPHRASE,
                recovery_username="drill-admin",
                recovery_password="Drill-Strong-2026!",
            )
            self.assertEqual(store.governance_snapshot(), before)
            receipt = validate_receiver_operator_recovery_drill_receipt(result["receipt"])
            self.assertTrue(receipt["backupAdminAuthenticated"])
            self.assertTrue(receipt["isolatedRestoreCompleted"])
            self.assertTrue(receipt["restoredAuditChainValid"])
            self.assertTrue(receipt["productionGovernanceUnchangedDuringDrill"])
            receipt_path = root / "receiver_operator_governance_drills" / result["receiptFileName"]
            receipt_text = receipt_path.read_text(encoding="utf-8")
            self.assertNotIn("drill-admin", receipt_text)
            self.assertNotIn("Drill-Strong-2026!", receipt_text)
            self.assertNotIn(PASSPHRASE, receipt_text)
            inventory = list_receiver_operator_governance_recovery_inventory(store)
            self.assertEqual(inventory["health"]["status"], "healthy")
            self.assertEqual(
                inventory["health"]["latestMatchingDrillReceiptFingerprint"],
                receipt["receiptFingerprint"],
            )

    def test_inventory_marks_expiry_and_surfaces_invalid_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            store.bootstrap("expiry-admin", "保存期限管理員", "Expiry-Strong-2026!")
            backup = build_receiver_operator_governance_backup(
                store,
                PASSPHRASE,
                exported_at="2026-01-01T00:00:00Z",
            )
            write_managed_receiver_operator_governance_backup(store, backup, retention_days=1)
            managed_directory = root / "receiver_operator_governance_backups" / "managed"
            (managed_directory / "unexpected.json").write_text("{}", encoding="utf-8")

            inventory = list_receiver_operator_governance_recovery_inventory(
                store,
                now=datetime(2026, 1, 3, tzinfo=timezone.utc),
            )
            self.assertEqual(inventory["managedBackups"][0]["status"], "expired")
            self.assertEqual(inventory["managedBackups"][0]["retentionUntil"], "2026-01-02T00:00:00Z")
            issue_codes = {item["code"] for item in inventory["health"]["issues"]}
            self.assertIn("all-managed-backups-expired", issue_codes)
            self.assertIn("invalid-managed-backup", issue_codes)
            self.assertEqual(inventory["invalidBackupFiles"][0]["fileName"], "unexpected.json")

    def test_failed_drill_writes_no_receipt_and_tampered_receipt_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            store.bootstrap("drill-admin", "復原演練管理員", "Drill-Strong-2026!")
            backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            before = store.governance_snapshot()

            with self.assertRaisesRegex(ValueError, "備份內管理員帳號或密碼不正確"):
                perform_receiver_operator_governance_recovery_drill(
                    store,
                    backup,
                    PASSPHRASE,
                    recovery_username="drill-admin",
                    recovery_password="Wrong-Strong-2026!",
                )
            self.assertEqual(store.governance_snapshot(), before)
            self.assertFalse((root / "receiver_operator_governance_drills").exists())

            result = perform_receiver_operator_governance_recovery_drill(
                store,
                backup,
                PASSPHRASE,
                recovery_username="drill-admin",
                recovery_password="Drill-Strong-2026!",
            )
            tampered = copy.deepcopy(result["receipt"])
            tampered["operatorCount"] += 1
            with self.assertRaisesRegex(ValueError, "收據指紋驗證失敗"):
                validate_receiver_operator_recovery_drill_receipt(tampered)

    def test_http_managed_export_inventory_and_drill_require_admin_csrf(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            store.bootstrap("api-admin", "API 管理員", "Api-Strong-2026!")
            with patch.object(main_module, "receiver_operator_store", store):
                client = TestClient(main_module.app)
                login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "api-admin", "password": "Api-Strong-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                csrf = login.json()["csrfToken"]
                exported = client.post(
                    "/api/receiver-operator-governance-backups/export",
                    headers={"X-CSRF-Token": csrf},
                    json={
                        "passphrase": PASSPHRASE,
                        "retain_server_copy": True,
                        "retention_days": 60,
                    },
                )
                self.assertEqual(exported.status_code, 200, exported.text)
                self.assertEqual(exported.json()["managedBackup"]["retentionDays"], 60)

                inventory = client.get("/api/receiver-operator-governance-backups/inventory")
                self.assertEqual(inventory.status_code, 200, inventory.text)
                self.assertEqual(len(inventory.json()["managedBackups"]), 1)

                missing_csrf = client.post(
                    "/api/receiver-operator-governance-backups/drill",
                    json={
                        "backup": exported.json()["backup"],
                        "passphrase": PASSPHRASE,
                        "recovery_username": "api-admin",
                        "recovery_password": "Api-Strong-2026!",
                    },
                )
                self.assertEqual(missing_csrf.status_code, 403, missing_csrf.text)
                drilled = client.post(
                    "/api/receiver-operator-governance-backups/drill",
                    headers={"X-CSRF-Token": csrf},
                    json={
                        "backup": exported.json()["backup"],
                        "passphrase": PASSPHRASE,
                        "recovery_username": "api-admin",
                        "recovery_password": "Api-Strong-2026!",
                    },
                )
                self.assertEqual(drilled.status_code, 200, drilled.text)
                self.assertEqual(drilled.json()["receipt"]["result"], "passed")
                self.assertEqual(drilled.json()["inventory"]["health"]["status"], "healthy")
                self.assertNotIn("api-admin", json.dumps(drilled.json()["receipt"], ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
