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
    approve_receiver_operator_backup_disposition,
    list_receiver_operator_governance_recovery_inventory,
    perform_receiver_operator_governance_recovery_drill,
    request_receiver_operator_backup_disposition,
    validate_receiver_operator_backup_disposition_receipt,
    validate_receiver_operator_recovery_drill_receipt,
    write_managed_receiver_operator_governance_backup,
)


PASSPHRASE = "Governance-Recovery-Phrase-2026!"


class ReceiverOperatorRecoveryLifecycleTests(unittest.TestCase):
    @staticmethod
    def _expired_managed_backup(
        store: ReceiverOperatorStore,
    ) -> tuple[dict[str, object], dict[str, object]]:
        backup = build_receiver_operator_governance_backup(
            store,
            PASSPHRASE,
            exported_at="2026-01-01T00:00:00Z",
        )
        managed = write_managed_receiver_operator_governance_backup(
            store,
            backup,
            retention_days=1,
        )
        return backup, managed

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

    def test_expired_backup_disposition_requires_different_reviewer_and_writes_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            requester = store.bootstrap(
                "disposition-admin",
                "到期處置申請人",
                "Disposition-Strong-2026!",
            )
            reviewer = store.create_operator(
                "disposition-reviewer",
                "到期處置覆核人",
                "Reviewer-Strong-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            _backup, managed = self._expired_managed_backup(store)
            requested = request_receiver_operator_backup_disposition(
                store,
                str(managed["backupFingerprint"]),
                actor_operator_id=requester["id"],
                case_reference="RET-2026-001",
                basis="依組織備份媒體保存與到期處置程序辦理。",
                request_confirmed=True,
            )
            self.assertEqual(requested["request"]["state"], "pending")
            with self.assertRaisesRegex(ValueError, "必須與申請帳號不同"):
                approve_receiver_operator_backup_disposition(
                    store,
                    requested["request"]["requestFingerprint"],
                    actor_operator_id=requester["id"],
                    approval_confirmed=True,
                )

            completed = approve_receiver_operator_backup_disposition(
                store,
                requested["request"]["requestFingerprint"],
                actor_operator_id=reviewer["id"],
                approval_confirmed=True,
            )
            self.assertEqual(completed["request"]["state"], "completed")
            self.assertTrue(completed["managedFileRemovedDuringCall"])
            receipt = validate_receiver_operator_backup_disposition_receipt(
                completed["receipt"]
            )
            self.assertTrue(
                receipt["disposition"]["managedFileAbsentAfterDisposition"]
            )
            self.assertFalse(receipt["disposition"]["automaticExpiryDeletion"])
            self.assertFalse(receipt["disposition"]["secureEraseGuaranteed"])
            managed_path = (
                root
                / "receiver_operator_governance_backups"
                / "managed"
                / str(managed["fileName"])
            )
            self.assertFalse(managed_path.exists())
            receipt_path = (
                root
                / "receiver_operator_governance_dispositions"
                / completed["receiptFileName"]
            )
            receipt_text = receipt_path.read_text(encoding="utf-8")
            self.assertNotIn("disposition-admin", receipt_text)
            self.assertNotIn("disposition-reviewer", receipt_text)
            self.assertNotIn("Disposition-Strong-2026!", receipt_text)
            self.assertNotIn(PASSPHRASE, receipt_text)
            self.assertNotIn(str(root), receipt_text)
            self.assertNotIn("RET-2026-001", receipt_text)
            self.assertNotIn("依組織備份媒體保存與到期處置程序辦理。", receipt_text)
            inventory = list_receiver_operator_governance_recovery_inventory(store)
            self.assertEqual(len(inventory["backupDispositionRequests"]), 1)
            self.assertEqual(len(inventory["backupDispositionReceipts"]), 1)
            self.assertEqual(
                inventory["backupDispositionRequests"][0]["receiptFingerprint"],
                receipt["receiptFingerprint"],
            )
            audit = store.list_audit_events()
            event_types = [item["eventType"] for item in audit["events"]]
            self.assertIn("operator-backup-disposition-requested", event_types)
            self.assertIn("operator-backup-disposition-approved", event_types)
            self.assertIn("operator-backup-disposition-completed", event_types)

    def test_disposition_claim_is_preserved_by_governance_backup_and_tampering_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            requester = store.bootstrap(
                "claim-admin",
                "處置治理申請人",
                "Claim-Strong-2026!",
            )
            reviewer = store.create_operator(
                "claim-reviewer",
                "處置治理覆核人",
                "Review-Claim-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            _backup, managed = self._expired_managed_backup(store)
            requested = request_receiver_operator_backup_disposition(
                store,
                str(managed["backupFingerprint"]),
                actor_operator_id=requester["id"],
                case_reference="RET-2026-002",
                basis="媒體處置程序與案件紀錄已核對。",
                request_confirmed=True,
            )
            completed = approve_receiver_operator_backup_disposition(
                store,
                requested["request"]["requestFingerprint"],
                actor_operator_id=reviewer["id"],
                approval_confirmed=True,
            )
            snapshot = store.governance_snapshot()
            self.assertEqual(snapshot["schemaVersion"], 2)
            self.assertEqual(len(snapshot["backupDispositionClaims"]), 1)
            self.assertEqual(snapshot["backupDispositionClaims"][0]["state"], "completed")
            governance_backup = build_receiver_operator_governance_backup(store, PASSPHRASE)
            self.assertEqual(governance_backup["schemaVersion"], 2)
            self.assertEqual(
                governance_backup["summary"]["backupDispositionClaimCount"],
                1,
            )
            tampered = copy.deepcopy(completed["receipt"])
            tampered["caseReferenceSha256"] = "SHA256-" + "0" * 64
            with self.assertRaisesRegex(ValueError, "收據指紋驗證失敗"):
                validate_receiver_operator_backup_disposition_receipt(tampered)

    def test_interrupted_disposition_can_resume_without_duplicate_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            requester = store.bootstrap(
                "resume-admin",
                "中斷處置申請人",
                "Resume-Strong-2026!",
            )
            reviewer = store.create_operator(
                "resume-reviewer",
                "中斷處置覆核人",
                "Resume-Review-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            _backup, managed = self._expired_managed_backup(store)
            requested = request_receiver_operator_backup_disposition(
                store,
                str(managed["backupFingerprint"]),
                actor_operator_id=requester["id"],
                case_reference="RET-2026-003",
                basis="測試中斷後由同一覆核帳號續辦。",
                request_confirmed=True,
            )
            with patch.object(
                store,
                "complete_backup_disposition",
                side_effect=RuntimeError("simulated interruption"),
            ):
                with self.assertRaisesRegex(RuntimeError, "simulated interruption"):
                    approve_receiver_operator_backup_disposition(
                        store,
                        requested["request"]["requestFingerprint"],
                        actor_operator_id=reviewer["id"],
                        approval_confirmed=True,
                    )
            interrupted = store.backup_disposition_claims()[0]
            self.assertEqual(interrupted["state"], "removal-in-progress")
            self.assertFalse(
                (
                    root
                    / "receiver_operator_governance_backups"
                    / "managed"
                    / str(managed["fileName"])
                ).exists()
            )
            receipt_files_before = list(
                (root / "receiver_operator_governance_dispositions").glob("*.json")
            )
            self.assertEqual(len(receipt_files_before), 1)
            resumed = approve_receiver_operator_backup_disposition(
                store,
                requested["request"]["requestFingerprint"],
                actor_operator_id=reviewer["id"],
                approval_confirmed=True,
            )
            self.assertTrue(resumed["completionRecoveredAfterInterruption"])
            self.assertEqual(resumed["request"]["state"], "completed")
            self.assertEqual(
                len(list((root / "receiver_operator_governance_dispositions").glob("*.json"))),
                1,
            )

    def test_http_disposition_requires_csrf_roles_and_different_operator(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReceiverOperatorStore(root / "operators.sqlite3")
            requester = store.bootstrap(
                "http-disposition-admin",
                "HTTP 處置申請人",
                "Http-Disposition-2026!",
            )
            store.create_operator(
                "http-disposition-reviewer",
                "HTTP 處置覆核人",
                "Http-Reviewer-2026!",
                ["receiver-key-approver"],
                actor_operator_id=requester["id"],
            )
            _backup, managed = self._expired_managed_backup(store)
            with patch.object(main_module, "receiver_operator_store", store):
                client = TestClient(main_module.app)
                login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={
                        "username": "http-disposition-admin",
                        "password": "Http-Disposition-2026!",
                    },
                )
                csrf = login.json()["csrfToken"]
                payload = {
                    "backup_fingerprint": managed["backupFingerprint"],
                    "case_reference": "RET-HTTP-001",
                    "basis": "HTTP 雙人覆核流程驗證。",
                    "request_confirmed": True,
                }
                missing_csrf = client.post(
                    "/api/receiver-operator-governance-backups/disposition-requests",
                    json=payload,
                )
                self.assertEqual(missing_csrf.status_code, 403, missing_csrf.text)
                requested = client.post(
                    "/api/receiver-operator-governance-backups/disposition-requests",
                    headers={"X-CSRF-Token": csrf},
                    json=payload,
                )
                self.assertEqual(requested.status_code, 200, requested.text)
                request_fingerprint = requested.json()["request"]["requestFingerprint"]
                same_operator = client.post(
                    "/api/receiver-operator-governance-backups/disposition-requests/"
                    f"{request_fingerprint}/approve",
                    headers={"X-CSRF-Token": csrf},
                    json={"approval_confirmed": True},
                )
                self.assertEqual(same_operator.status_code, 400, same_operator.text)
                reviewer_login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={
                        "username": "http-disposition-reviewer",
                        "password": "Http-Reviewer-2026!",
                    },
                )
                reviewer_csrf = reviewer_login.json()["csrfToken"]
                approved = client.post(
                    "/api/receiver-operator-governance-backups/disposition-requests/"
                    f"{request_fingerprint}/approve",
                    headers={"X-CSRF-Token": reviewer_csrf},
                    json={"approval_confirmed": True},
                )
                self.assertEqual(approved.status_code, 200, approved.text)
                self.assertEqual(approved.json()["request"]["state"], "completed")


if __name__ == "__main__":
    unittest.main()
