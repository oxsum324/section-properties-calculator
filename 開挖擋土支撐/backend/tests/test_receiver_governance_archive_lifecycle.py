from __future__ import annotations

import base64
from copy import deepcopy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.receiver_governance_archive import finalize_archive_verification_package
from backend.receiver_governance_archive_lifecycle import (
    _read_gav_zip,
    _status_signature_payload,
    finalize_lifecycle_checkpoint_package,
    issue_lifecycle_provider_status,
    lifecycle_checkpoint_fingerprint,
    lifecycle_status_fingerprint,
    validate_lifecycle_checkpoint,
    verify_lifecycle_checkpoint_package,
)
from backend.tests import test_receiver_governance_archive as archive_tests


OBSERVED_AT = "2026-09-01T00:00:00Z"
STATUS_SIGNED_AT = "2026-09-01T00:01:00Z"
CHECKPOINT_VERIFIED_AT = "2026-09-01T00:02:00Z"
LIFECYCLE_RETENTION = "2038-08-12T00:00:00Z"


class ReceiverGovernanceArchiveLifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory()
        cls.root = Path(cls.workspace.name)
        helper = archive_tests.ReceiverGovernanceArchiveTests(methodName="runTest")
        helper.setUp()
        cls.openssl = helper.openssl
        cls.prepared = helper.prepare(cls.root)
        cls.initial_private_path = cls.root / "initial-provider-private.pem"
        helper.private_key(cls.initial_private_path)
        cls.initial_receipt = helper.issue(cls.root, cls.prepared, cls.initial_private_path)
        cls.initial_approval = helper.approval_evidence(cls.root)
        cls.gav = finalize_archive_verification_package(
            prepared_directory=Path(cls.prepared["directory"]),
            provider_receipt_path=Path(cls.initial_receipt["receiptPath"]),
            provider_public_key_path=Path(cls.initial_receipt["providerPublicKeyPath"]),
            provider_key_approval_evidence_path=cls.initial_approval,
            provider_key_approval_basis="Records policy RP-12 approved provider key list, item 4",
            output_directory=cls.root / "gav",
            openssl_path=cls.openssl,
            verified_at="2026-08-12T08:03:00Z",
        )
        cls.request_path = next(Path(cls.prepared["directory"]).glob("GAD-*.json"))
        cls.receipt_path = Path(cls.initial_receipt["receiptPath"])
        cls.request = json.loads(cls.request_path.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls) -> None:
        cls.workspace.cleanup()

    def setUp(self) -> None:
        self.case = Path(tempfile.mkdtemp(dir=self.root))

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.case, ignore_errors=True)

    def private_key(self, name: str = "current-provider-private.pem") -> Path:
        path = self.case / name
        key = Ed25519PrivateKey.generate()
        path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        return path

    def approval(self, name: str = "current-key-approval.txt") -> Path:
        path = self.case / name
        path.write_text("Approved rotated provider lifecycle key under records policy RP-12.\n", encoding="utf-8")
        return path

    def issue_status(self, *, key_path: Path, output_name: str = "gsr", **overrides: object) -> dict:
        values: dict[str, object] = {
            "archive_request_path": self.request_path,
            "provider_receipt_path": self.receipt_path,
            "private_key_path": key_path,
            "observed_at": OBSERVED_AT,
            "object_status": "present",
            "content_hash_status": "matched",
            "observed_object_sha256": self.request["archiveObject"]["fileSha256"],
            "observed_object_size_bytes": self.request["archiveObject"]["fileSizeBytes"],
            "immutability_status": "active",
            "immutability_mode": "worm-compliance",
            "retention_policy_id": "records-policy-RP-12",
            "retention_until": LIFECYCLE_RETENTION,
            "legal_hold_status": "active",
            "observation_method": "repository-api-sha256",
            "observation_reference": "audit-event-20260901-0001",
            "signed_at": STATUS_SIGNED_AT,
            "output_directory": self.case / output_name,
        }
        values.update(overrides)
        return issue_lifecycle_provider_status(**values)  # type: ignore[arg-type]

    def finalize(self, status: dict, *, approval: Path, public_key: Path | None = None, output_name: str = "gsc", **overrides: object) -> dict:
        values: dict[str, object] = {
            "gav_package": Path(self.gav["directory"]),
            "provider_status_receipt_path": Path(status["statusReceiptPath"]),
            "provider_public_key_path": public_key or Path(status["providerPublicKeyPath"]),
            "provider_key_approval_evidence_path": approval,
            "provider_key_approval_basis": "Records policy RP-12 current provider lifecycle key register",
            "review_interval_days": 90,
            "maximum_observation_age_hours": 72,
            "retention_warning_days": 180,
            "output_directory": self.case / output_name,
            "openssl_path": self.openssl,
            "verified_at": CHECKPOINT_VERIFIED_AT,
        }
        values.update(overrides)
        return finalize_lifecycle_checkpoint_package(**values)  # type: ignore[arg-type]

    def test_rotated_key_round_trip_schema_windows_and_lifecycle_exit_codes(self) -> None:
        rotated_private = self.private_key()
        self.assertNotEqual(rotated_private.read_bytes(), self.initial_private_path.read_bytes())
        status = self.issue_status(key_path=rotated_private)
        approval = self.approval()
        final = self.finalize(status, approval=approval)
        package = Path(final["directory"])
        self.assertEqual(len(list(package.iterdir())), 5)
        result = verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        checkpoint = result["checkpoint"]
        self.assertEqual(result["assessment"]["lifecycleStatus"], "current")
        self.assertEqual(checkpoint["summary"]["objectStatus"], "present-hash-matched")
        self.assertTrue(checkpoint["boundary"]["providerKeyRotationRequiresNewIndependentApprovalEvidence"])
        self.assertNotEqual(checkpoint["sourceFiles"]["providerPublicKey"]["fileSha256"], json.loads(next(package.glob("GSC-*.json")).read_text(encoding="utf-8"))["sourceFiles"]["gavPackage"]["fileSha256"])

        schema = json.loads((Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json").read_text(encoding="utf-8"))
        status_json = json.loads(Path(status["statusReceiptPath"]).read_text(encoding="utf-8"))
        checkpoint_json = json.loads(next(package.glob("GSC-*.json")).read_text(encoding="utf-8"))
        archive_tests.assert_json_schema(self, status_json, schema["$defs"]["providerStatus"], schema)
        archive_tests.assert_json_schema(self, checkpoint_json, schema["$defs"]["lifecycleCheckpoint"], schema)

        invalid_standalone = []
        before_observation = deepcopy(checkpoint_json)
        before_observation["verifiedAt"] = "2026-08-31T23:59:59Z"
        invalid_standalone.append(before_observation)
        stale_observation = deepcopy(checkpoint_json)
        stale_observation["verifiedAt"] = "2026-09-05T00:00:01Z"
        invalid_standalone.append(stale_observation)
        expired_on_creation = deepcopy(checkpoint_json)
        expired_on_creation["verifiedAt"] = expired_on_creation["policy"]["nextReviewDueAt"]
        invalid_standalone.append(expired_on_creation)
        short_retention = deepcopy(checkpoint_json)
        short_retention["observation"]["retentionUntil"] = short_retention["policy"]["nextReviewDueAt"]
        invalid_standalone.append(short_retention)
        inactive_hold = deepcopy(checkpoint_json)
        inactive_hold["observation"]["legalHoldStatus"] = "not-active"
        invalid_standalone.append(inactive_hold)
        for mutated in invalid_standalone:
            mutated["checkpointFingerprint"] = lifecycle_checkpoint_fingerprint(mutated)
            with self.subTest(invalid_standalone=mutated["checkpointFingerprint"]):
                with self.assertRaises(ValueError):
                    validate_lifecycle_checkpoint(mutated)

        open_boundary = deepcopy(checkpoint_json)
        open_boundary["boundary"]["unexpectedBoundary"] = True
        with self.assertRaises(AssertionError):
            archive_tests.assert_json_schema(self, open_boundary, schema["$defs"]["lifecycleCheckpoint"], schema)

        self.assertEqual(verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl, as_of="2026-12-01T00:00:00Z")["assessment"]["lifecycleStatus"], "review-due")
        self.assertEqual(verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl, as_of="2038-08-12T00:00:00Z")["assessment"]["lifecycleStatus"], "blocked")
        with self.assertRaisesRegex(ValueError, "不得早於"):
            verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl, as_of="2026-08-31T00:00:00Z")

        command = [
            os.sys.executable, "-m", "backend.receiver_governance_archive_lifecycle", "--openssl", str(self.openssl),
            "verify-checkpoint", "--package", str(package), "--as-of", "2026-12-01T00:00:00Z",
        ]
        cli = subprocess.run(command, cwd=Path(__file__).resolve().parents[2], capture_output=True, check=False)
        self.assertEqual(cli.returncode, 2, cli.stderr.decode("utf-8", errors="replace"))
        self.assertEqual(json.loads(cli.stdout.decode("utf-8"))["assessment"]["historicalIntegrityStatus"], "valid")
        command[-1] = "2038-08-12T00:00:00Z"
        blocked = subprocess.run(command, cwd=Path(__file__).resolve().parents[2], capture_output=True, check=False)
        self.assertEqual(blocked.returncode, 3, blocked.stderr.decode("utf-8", errors="replace"))

        if os.name == "nt":
            launcher = Path(__file__).resolve().parents[2] / "receiver_governance_archive_lifecycle.ps1"
            powershell = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher), "-Mode", "Verify", "-PackagePath", str(package), "-AsOf", "2026-09-02T00:00:00Z", "-OpenSslPath", str(self.openssl)],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(powershell.returncode, 0, powershell.stderr + powershell.stdout)

    def test_negative_or_stale_provider_status_fails_closed(self) -> None:
        key = self.private_key()
        approval = self.approval()
        cases = [
            {"output_name": "missing", "object_status": "missing", "content_hash_status": "not-verified", "observed_object_sha256": None, "observed_object_size_bytes": None},
            {"output_name": "inactive", "immutability_status": "not-active"},
            {"output_name": "hold-off", "legal_hold_status": "not-active"},
        ]
        for index, case in enumerate(cases):
            with self.subTest(case=case["output_name"]):
                status = self.issue_status(key_path=key, **case)
                target = self.case / f"rejected-{index}"
                with self.assertRaises(ValueError):
                    self.finalize(status, approval=approval, output_name=target.name)
                self.assertFalse(target.exists())

        stale = self.issue_status(key_path=key, output_name="stale")
        with self.assertRaisesRegex(ValueError, "新鮮度"):
            self.finalize(stale, approval=approval, output_name="stale-out", verified_at="2026-09-10T00:00:00Z")
        short = self.issue_status(key_path=key, output_name="short", retention_until="2026-10-01T00:00:00Z")
        with self.assertRaisesRegex(ValueError, "原 GAV|下一次重驗"):
            self.finalize(short, approval=approval, output_name="short-out")

    def test_wrong_key_private_material_tamper_and_hostile_zip_are_rejected(self) -> None:
        key = self.private_key()
        status = self.issue_status(key_path=key)
        approval = self.approval()
        wrong_key = self.private_key("wrong-private.pem")
        wrong_public = self.case / "wrong-public.pem"
        loaded_wrong = serialization.load_pem_private_key(wrong_key.read_bytes(), password=None)
        wrong_public.write_bytes(loaded_wrong.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        with self.assertRaisesRegex(ValueError, "keyId"):
            self.finalize(status, approval=approval, public_key=wrong_public, output_name="wrong-key-out")
        with self.assertRaisesRegex(ValueError, "私人金鑰"):
            self.finalize(status, approval=key, output_name="private-evidence-out")
        gav_verification = json.loads(next(Path(self.gav["directory"]).glob("GAV-*.json")).read_text(encoding="utf-8"))
        gav_request = Path(self.gav["directory"]) / gav_verification["sourceFiles"]["request"]["fileName"]
        with self.assertRaisesRegex(ValueError, "獨立文件"):
            self.finalize(status, approval=gav_request, output_name="gav-source-evidence-out")

        final = self.finalize(status, approval=approval)
        package = Path(final["directory"])
        status_path = next(package.glob("GSR-*.json"))
        raw = json.loads(status_path.read_text(encoding="utf-8"))
        raw["observation"]["observationReference"] = "tampered-event"
        raw["statusFingerprint"] = lifecycle_status_fingerprint(raw)
        private = serialization.load_pem_private_key(key.read_bytes(), password=None)
        raw["signature"]["value"] = base64.b64encode(private.sign(_status_signature_payload(raw))).decode("ascii")
        status_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl)
        (package / "unexpected.txt").write_text("extra", encoding="utf-8")
        with self.assertRaises(ValueError):
            verify_lifecycle_checkpoint_package(package, openssl_path=self.openssl)

        compressed = io.BytesIO()
        with zipfile.ZipFile(compressed, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("one.txt", "data")
        with self.assertRaisesRegex(ValueError, "未加密、未壓縮"):
            _read_gav_zip(compressed.getvalue())


if __name__ == "__main__":
    unittest.main()
