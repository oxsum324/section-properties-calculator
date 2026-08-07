from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.receiver_trust_recovery import (
    evaluate_receiver_trust_backup_directory,
    perform_receiver_trust_registry_recovery_drill,
    validate_receiver_trust_recovery_drill_receipt,
    validate_receiver_trust_registry_backup_file,
    write_receiver_trust_registry_backup,
)
from backend.app.receiver_trust_store import ReceiverTrustStore


class ReceiverTrustRecoveryTests(unittest.TestCase):
    @staticmethod
    def _registered_store(path: Path) -> ReceiverTrustStore:
        store = ReceiverTrustStore(path)
        raw = Ed25519PrivateKey.generate().public_key().public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
        store.register_key(
            "復原演練單位",
            "正式回簽章",
            base64.b64encode(raw).decode("ascii"),
            True,
        )
        return store

    def test_backup_cycle_restores_in_isolation_and_keeps_production_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry_path = root / "production" / "receiver-trust.json"
            store = self._registered_store(registry_path)
            production_before = registry_path.read_bytes()

            backup_path, backup = write_receiver_trust_registry_backup(store, root / "evidence")
            receipt_path, receipt = perform_receiver_trust_registry_recovery_drill(
                backup_path,
                root / "evidence",
                production_registry_path=registry_path,
                max_age_days=30,
            )

            self.assertEqual(registry_path.read_bytes(), production_before)
            self.assertRegex(backup_path.name, r"^RVR-trust-registry-backup-.*-RTR-[0-9A-F]{20}-RTB-[0-9A-F]{20}\.json$")
            self.assertRegex(receipt_path.name, r"^RVR-recovery-drill-.*-RDR-[0-9A-F]{20}\.json$")
            self.assertEqual(receipt["backupFingerprint"], backup["backupFingerprint"])
            self.assertEqual(receipt["registryFingerprint"], backup["registry"]["registryFingerprint"])
            self.assertTrue(receipt["productionRegistryUnchanged"])
            self.assertEqual(receipt["restoreTarget"], "isolated-temporary-registry")
            self.assertNotIn("private", backup_path.read_text(encoding="utf-8").lower())
            self.assertEqual(validate_receiver_trust_recovery_drill_receipt(receipt), receipt)

    def test_tampered_backup_cannot_create_drill_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            backup_path, backup = write_receiver_trust_registry_backup(store, root / "backups")
            tampered = deepcopy(backup)
            tampered["registry"]["keys"][0]["displayName"] = "遭改寫的名稱"
            backup_path.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "清冊指紋驗證失敗"):
                validate_receiver_trust_registry_backup_file(backup_path)
            with self.assertRaisesRegex(ValueError, "清冊指紋驗證失敗"):
                perform_receiver_trust_registry_recovery_drill(backup_path, root / "receipts")
            self.assertEqual(list((root / "receipts").glob("*.json")), [])

    def test_backup_freshness_gate_rejects_stale_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            exported = datetime.now(timezone.utc) - timedelta(days=31)
            backup_path, _ = write_receiver_trust_registry_backup(
                store,
                root / "backups",
                exported_at=exported.isoformat().replace("+00:00", "Z"),
            )

            with self.assertRaisesRegex(ValueError, "超過 30 天"):
                validate_receiver_trust_registry_backup_file(backup_path, max_age_days=30)
            self.assertEqual(
                validate_receiver_trust_registry_backup_file(backup_path, max_age_days=32)["backup"]["kind"],
                "receiver-verification-trust-registry-backup",
            )

    def test_existing_backup_is_never_overwritten_or_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            exported_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            backup_path, _ = write_receiver_trust_registry_backup(
                store,
                root / "backups",
                exported_at=exported_at,
            )
            original = backup_path.read_bytes()

            with self.assertRaises(FileExistsError):
                write_receiver_trust_registry_backup(
                    store,
                    root / "backups",
                    exported_at=exported_at,
                )
            self.assertTrue(backup_path.exists())
            self.assertEqual(backup_path.read_bytes(), original)

    def test_drill_receipt_tampering_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            backup_path, _ = write_receiver_trust_registry_backup(store, root / "evidence")
            _, receipt = perform_receiver_trust_registry_recovery_drill(
                backup_path,
                root / "evidence",
                production_registry_path=store.path,
            )
            tampered = deepcopy(receipt)
            tampered["keyCount"] += 1
            with self.assertRaisesRegex(ValueError, "收據指紋驗證失敗"):
                validate_receiver_trust_recovery_drill_receipt(tampered)
            invalid_path = deepcopy(receipt)
            invalid_path["backupFileName"] = "../backup.json"
            with self.assertRaisesRegex(ValueError, "不得包含路徑"):
                validate_receiver_trust_recovery_drill_receipt(invalid_path)
            future = deepcopy(receipt)
            future["performedAt"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            with self.assertRaisesRegex(ValueError, "不可晚於目前時間"):
                validate_receiver_trust_recovery_drill_receipt(future)

    def test_backup_health_accepts_a_current_matching_evidence_pair(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            backup_path, backup = write_receiver_trust_registry_backup(store, root / "evidence")
            receipt_path, receipt = perform_receiver_trust_registry_recovery_drill(
                backup_path,
                root / "evidence",
                production_registry_path=store.path,
            )

            result = evaluate_receiver_trust_backup_directory(root / "evidence", max_age_days=8)

            self.assertEqual(result["status"], "backup-health-ok")
            self.assertEqual(result["backupPath"], str(backup_path))
            self.assertEqual(result["receiptPath"], str(receipt_path))
            self.assertEqual(result["backupFingerprint"], backup["backupFingerprint"])
            self.assertEqual(result["receiptFingerprint"], receipt["receiptFingerprint"])
            self.assertTrue(result["productionRegistryUnchanged"])

    def test_backup_health_rejects_a_new_backup_without_matching_drill(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            first_backup, _ = write_receiver_trust_registry_backup(store, root / "evidence")
            perform_receiver_trust_registry_recovery_drill(
                first_backup,
                root / "evidence",
                production_registry_path=store.path,
            )
            second_export = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
            write_receiver_trust_registry_backup(store, root / "evidence", exported_at=second_export)

            with self.assertRaisesRegex(ValueError, "不是同一組可追溯證據"):
                evaluate_receiver_trust_backup_directory(root / "evidence", max_age_days=8)

    def test_backup_health_rejects_stale_drill_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = self._registered_store(root / "receiver-trust.json")
            now = datetime.now(timezone.utc)
            backup_path, _ = write_receiver_trust_registry_backup(
                store,
                root / "evidence",
                exported_at=now.isoformat().replace("+00:00", "Z"),
            )
            perform_receiver_trust_registry_recovery_drill(
                backup_path,
                root / "evidence",
                production_registry_path=store.path,
                performed_at=(now - timedelta(days=9)).isoformat().replace("+00:00", "Z"),
            )

            with self.assertRaisesRegex(ValueError, "復原演練收據已超過 8 天"):
                evaluate_receiver_trust_backup_directory(
                    root / "evidence",
                    max_age_days=8,
                    now=now,
                )


if __name__ == "__main__":
    unittest.main()
