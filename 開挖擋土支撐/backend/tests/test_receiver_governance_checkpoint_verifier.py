from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_signing_request,
)
from backend.app.receiver_governance_health import (
    build_receiver_governance_health_history_export,
    build_receiver_governance_health_snapshot,
)
from backend.app.receiver_key_enrollment import build_receiver_key_enrollment
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_trust_backup import build_receiver_trust_registry_backup
from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.sign_receiver_request import build_signature_response
from backend.verify_receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_verification_receipt,
    governance_checkpoint_verification_fingerprint,
    validate_receiver_governance_checkpoint_verification_receipt,
)


FIXED_NOW = datetime(2026, 8, 12, 6, 0, tzinfo=timezone.utc)


def _file_summary(name: str, character: str) -> dict[str, str]:
    return {"fileName": name, "fileSha256": character * 64}


class ReceiverGovernanceCheckpointVerifierTests(unittest.TestCase):
    def prepared(self, directory: str):
        root = Path(directory)
        operator_store = ReceiverOperatorStore(root / "operators.sqlite3")
        trust_store = ReceiverTrustStore(root / "trust.json")
        admin = operator_store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
        first_health = build_receiver_governance_health_snapshot(
            operator_store,
            trust_store,
            generated_at=FIXED_NOW,
        )
        operator_store.record_governance_health_observation(
            first_health,
            change_type="operator-bootstrap",
            actor_operator_id=admin["id"],
        )
        first_history = operator_store.governance_health_history()
        key = Ed25519PrivateKey.generate()
        checkpoint_request = build_receiver_governance_checkpoint_signing_request(
            first_history,
            signed_at=FIXED_NOW,
        )
        checkpoint = build_signature_response(checkpoint_request, key)
        return operator_store, trust_store, admin, first_history, key, checkpoint

    def test_integrity_only_receipt_is_valid_but_does_not_establish_trust_or_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _, _, _, _, _, checkpoint = self.prepared(directory)
            receipt = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files={"checkpoint": _file_summary("checkpoint.json", "1")},
                verified_at="2026-08-12T06:10:00Z",
            )

        self.assertRegex(receipt["verificationFingerprint"], r"^GCV-[0-9A-F]{20}$")
        self.assertEqual(receipt["summary"]["integrityStatus"], "valid")
        self.assertEqual(receipt["summary"]["trustStatus"], "valid-signature-untrusted-key")
        self.assertEqual(receipt["summary"]["historyStatus"], "not-compared")
        self.assertEqual(receipt["summary"]["anchorStatus"], "trust-and-history-not-established")
        self.assertTrue(receipt["boundary"]["noServiceRequired"])
        self.assertTrue(receipt["boundary"]["noProjectDatabaseRequired"])
        self.assertFalse(receipt["boundary"]["formalCalculationAttachment"])

    def test_empty_but_valid_history_checkpoint_remains_independently_verifiable(self) -> None:
        history = {
            "schemaVersion": 1,
            "kind": "receiver-governance-health-history",
            "chainValid": True,
            "observationCount": 0,
            "headFingerprint": None,
            "observations": [],
        }
        checkpoint = build_signature_response(
            build_receiver_governance_checkpoint_signing_request(history, signed_at=FIXED_NOW),
            Ed25519PrivateKey.generate(),
        )
        receipt = build_receiver_governance_checkpoint_verification_receipt(
            checkpoint,
            source_files={"checkpoint": _file_summary("empty-checkpoint.json", "0")},
        )

        self.assertEqual(receipt["checkpoint"]["observationCount"], 0)
        self.assertIsNone(receipt["checkpoint"]["headFingerprint"])
        self.assertEqual(receipt["summary"]["integrityStatus"], "valid")

    def test_trusted_backup_and_same_or_extended_ghe_establish_provided_history_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            operator_store, trust_store, admin, first_history, key, checkpoint = self.prepared(directory)
            trust_store.register_enrollment(
                build_receiver_key_enrollment(key, "治理單位", "治理簽章"),
                True,
            )
            backup = build_receiver_trust_registry_backup(
                trust_store,
                exported_at="2026-08-12T06:05:00Z",
            )
            first_export = build_receiver_governance_health_history_export(
                first_history,
                exported_at=FIXED_NOW,
            )
            source_files = {
                "checkpoint": _file_summary("checkpoint.json", "1"),
                "trustRegistryBackup": _file_summary("trust-backup.json", "2"),
                "currentHistoryExport": _file_summary("current-history.json", "3"),
            }
            same = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files=source_files,
                trust_registry_backup=backup,
                current_history_export=first_export,
            )
            self.assertEqual(same["summary"]["anchorStatus"], "trusted-anchor-for-provided-history")
            self.assertEqual(same["comparison"]["relation"], "current-matches-checkpoint")

            operator_store.create_operator(
                "requester-one",
                "專責申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            next_health = build_receiver_governance_health_snapshot(
                operator_store,
                trust_store,
                generated_at=datetime(2026, 8, 12, 6, 15, tzinfo=timezone.utc),
            )
            operator_store.record_governance_health_observation(
                next_health,
                change_type="operator-created",
                actor_operator_id=admin["id"],
            )
            extended_export = build_receiver_governance_health_history_export(
                operator_store.governance_health_history(),
                exported_at=datetime(2026, 8, 12, 6, 16, tzinfo=timezone.utc),
            )
            extended = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files=source_files,
                trust_registry_backup=backup,
                current_history_export=extended_export,
            )
            self.assertEqual(extended["comparison"]["relation"], "current-extends-checkpoint")
            self.assertEqual(extended["summary"]["anchorStatus"], "trusted-anchor-for-provided-history")

    def test_rollback_and_divergence_are_not_accepted_for_provided_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            operator_store, trust_store, admin, first_history, key, _ = self.prepared(directory)
            trust_store.register_enrollment(build_receiver_key_enrollment(key, "治理單位", "治理簽章"), True)
            backup = build_receiver_trust_registry_backup(trust_store)
            operator_store.create_operator(
                "requester-one", "專責申請人", "Requester-Secure-2026!",
                ["receiver-key-requester"], actor_operator_id=admin["id"],
            )
            next_health = build_receiver_governance_health_snapshot(
                operator_store, trust_store,
                generated_at=datetime(2026, 8, 12, 6, 15, tzinfo=timezone.utc),
            )
            operator_store.record_governance_health_observation(
                next_health, change_type="operator-created", actor_operator_id=admin["id"],
            )
            checkpoint = build_signature_response(
                build_receiver_governance_checkpoint_signing_request(
                    operator_store.governance_health_history(),
                    signed_at=datetime(2026, 8, 12, 6, 16, tzinfo=timezone.utc),
                ),
                key,
            )
            source_files = {
                "checkpoint": _file_summary("checkpoint.json", "1"),
                "trustRegistryBackup": _file_summary("trust.json", "2"),
                "currentHistoryExport": _file_summary("current.json", "3"),
            }
            behind = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files=source_files,
                trust_registry_backup=backup,
                current_history_export=build_receiver_governance_health_history_export(first_history),
            )
            self.assertEqual(behind["comparison"]["relation"], "current-behind-checkpoint")
            self.assertEqual(behind["summary"]["anchorStatus"], "not-anchor-for-provided-history")

            other_operator = ReceiverOperatorStore(Path(directory) / "other.sqlite3")
            other_trust = ReceiverTrustStore(Path(directory) / "other-trust.json")
            other_admin = other_operator.bootstrap("other-admin", "其他管理員", "Other-Secure-2026!")
            other_health = build_receiver_governance_health_snapshot(other_operator, other_trust)
            other_operator.record_governance_health_observation(
                other_health, change_type="operator-bootstrap", actor_operator_id=other_admin["id"],
            )
            diverged = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files=source_files,
                trust_registry_backup=backup,
                current_history_export=build_receiver_governance_health_history_export(
                    other_operator.governance_health_history()
                ),
            )
            self.assertEqual(diverged["comparison"]["relation"], "current-diverged-from-checkpoint")
            self.assertEqual(diverged["summary"]["anchorStatus"], "not-anchor-for-provided-history")

    def test_revoked_key_and_tampered_receipt_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _, trust_store, _, history, key, checkpoint = self.prepared(directory)
            enrollment = build_receiver_key_enrollment(key, "治理單位", "治理簽章")
            trust_store.register_enrollment(enrollment, True)
            trust_store.revoke_key(
                enrollment["keyId"], reason_code="retired", reason="例行撤銷。",
                handled_by="管理員", incident_reference="GCV-REV-001",
                revocation_confirmed=True,
            )
            receipt = build_receiver_governance_checkpoint_verification_receipt(
                checkpoint,
                source_files={
                    "checkpoint": _file_summary("checkpoint.json", "1"),
                    "trustRegistryBackup": _file_summary("trust.json", "2"),
                    "currentHistoryExport": _file_summary("current.json", "3"),
                },
                trust_registry_backup=build_receiver_trust_registry_backup(trust_store),
                current_history_export=build_receiver_governance_health_history_export(history),
            )
            self.assertEqual(receipt["summary"]["trustStatus"], "valid-signature-revoked-key")
            self.assertEqual(receipt["summary"]["anchorStatus"], "valid-signature-trust-not-established")
            tampered = deepcopy(receipt)
            tampered["summary"]["anchorStatus"] = "trusted-anchor-for-provided-history"
            tampered["verificationFingerprint"] = governance_checkpoint_verification_fingerprint(tampered)
            with self.assertRaisesRegex(ValueError, "結論與驗證結果不一致"):
                validate_receiver_governance_checkpoint_verification_receipt(tampered)

    def test_cli_verifies_without_service_or_project_database(self) -> None:
        project_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            _, trust_store, _, history, key, checkpoint = self.prepared(directory)
            trust_store.register_enrollment(build_receiver_key_enrollment(key, "治理單位", "治理簽章"), True)
            checkpoint_path = temp / "checkpoint.json"
            trust_path = temp / "trust-backup.json"
            history_path = temp / "current-history.json"
            output_path = temp / "verification.json"
            unavailable_db = temp / "must-not-be-created.sqlite3"
            checkpoint_path.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
            trust_path.write_text(json.dumps(build_receiver_trust_registry_backup(trust_store), ensure_ascii=False), encoding="utf-8")
            history_path.write_text(json.dumps(build_receiver_governance_health_history_export(history), ensure_ascii=False), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable, "-m", "backend.verify_receiver_governance_checkpoint",
                    "--checkpoint", str(checkpoint_path),
                    "--trust-backup", str(trust_path),
                    "--current-history", str(history_path),
                    "--output", str(output_path),
                ],
                cwd=project_root,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={
                    **os.environ,
                    "PYTHONUTF8": "1",
                    "STRUT_DB_PATH": str(unavailable_db),
                    "STRUT_RECEIVER_TRUST_REGISTRY_PATH": str(temp / "must-not-be-read.json"),
                },
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("治理健康檢核點驗證完成", completed.stdout)
            self.assertFalse(unavailable_db.exists())
            written = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(written["summary"]["anchorStatus"], "trusted-anchor-for-provided-history")
            self.assertTrue(written["boundary"]["noServiceRequired"])

            repeated = subprocess.run(
                [
                    sys.executable, "-m", "backend.verify_receiver_governance_checkpoint",
                    "--checkpoint", str(checkpoint_path),
                    "--output", str(output_path),
                ],
                cwd=project_root,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONUTF8": "1"},
            )
            self.assertNotEqual(repeated.returncode, 0)
            self.assertIn("不會覆寫", repeated.stderr)

            overwrite_source = subprocess.run(
                [
                    sys.executable, "-m", "backend.verify_receiver_governance_checkpoint",
                    "--checkpoint", str(checkpoint_path),
                    "--output", str(checkpoint_path),
                ],
                cwd=project_root,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONUTF8": "1"},
            )
            self.assertNotEqual(overwrite_source.returncode, 0)
            self.assertIn("不得覆寫任何來源檔案", overwrite_source.stderr)


if __name__ == "__main__":
    unittest.main()
