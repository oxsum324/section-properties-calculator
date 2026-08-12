from __future__ import annotations

import base64
from datetime import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import zipfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.receiver_governance_archive import (
    _read_closed_zip,
    _receipt_signature_payload,
    archive_receipt_fingerprint,
    finalize_archive_verification_package,
    issue_archive_provider_receipt,
    prepare_archive_request,
    verify_archive_verification_package,
)
from backend.receiver_governance_timestamp import (
    finalize_timestamp_package,
    find_openssl,
    prepare_timestamp_request,
)
from backend.tests import test_receiver_governance_timestamp as timestamp_tests


CREATED_AT = "2026-08-12T08:00:00Z"
STORED_AT = "2026-08-12T08:01:00Z"
SIGNED_AT = "2026-08-12T08:02:00Z"
REQUEST_RETENTION = "2036-08-12T00:00:00Z"
ACTUAL_RETENTION = "2037-08-12T00:00:00Z"


def assert_json_schema(test: unittest.TestCase, value: object, schema: dict, root: dict) -> None:
    if "$ref" in schema:
        target: object = root
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part]  # type: ignore[index]
        assert isinstance(target, dict)
        assert_json_schema(test, value, target, root)
        return
    if "const" in schema:
        test.assertEqual(value, schema["const"])
    if "enum" in schema:
        test.assertIn(value, schema["enum"])
    expected_type = schema.get("type")
    if expected_type == "object":
        test.assertIsInstance(value, dict)
        assert isinstance(value, dict)
        required = set(schema.get("required", []))
        properties = schema.get("properties", {})
        test.assertTrue(required <= set(value))
        if schema.get("additionalProperties") is False:
            test.assertEqual(set(value), set(properties))
        for key, item in value.items():
            if key in properties:
                assert_json_schema(test, item, properties[key], root)
    elif expected_type == "string":
        test.assertIsInstance(value, str)
        assert isinstance(value, str)
        test.assertGreaterEqual(len(value), schema.get("minLength", 0))
        test.assertLessEqual(len(value), schema.get("maxLength", len(value)))
        if "pattern" in schema:
            test.assertRegex(value, re.compile(schema["pattern"]))
        if schema.get("format") == "date-time":
            datetime.fromisoformat(value.replace("Z", "+00:00"))
    elif expected_type == "integer":
        test.assertIsInstance(value, int)
        test.assertNotIsInstance(value, bool)
        test.assertGreaterEqual(value, schema.get("minimum", value))
    elif expected_type == "boolean":
        test.assertIsInstance(value, bool)


class ReceiverGovernanceArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.timestamp_helper = timestamp_tests.ReceiverGovernanceTimestampTests(methodName="runTest")
        self.openssl = find_openssl()

    def build_gtv(self, root: Path) -> Path:
        paths = self.timestamp_helper.source_files(root / "sources")
        prepared = prepare_timestamp_request(
            verification_receipt_path=paths["verificationReceipt"],
            checkpoint_path=paths["checkpoint"],
            trust_backup_path=paths["trustRegistryBackup"],
            current_history_path=paths["currentHistoryExport"],
            output_directory=root / "timestamp-request",
            openssl_path=self.openssl,
            created_at="2026-08-12T06:03:00Z",
        )
        response, trust_anchor = self.timestamp_helper.tsa(
            root / "tsa",
            self.openssl,
            Path(prepared["queryPath"]),
        )
        final = finalize_timestamp_package(
            prepared_directory=Path(prepared["directory"]),
            timestamp_response_path=response,
            trust_anchor_path=trust_anchor,
            output_directory=root / "gtv",
            openssl_path=self.openssl,
            verified_at="2026-08-12T06:04:00Z",
        )
        return Path(final["directory"])

    def private_key(self, path: Path) -> Ed25519PrivateKey:
        key = Ed25519PrivateKey.generate()
        path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
        return key

    def approval_evidence(self, root: Path) -> Path:
        path = root / "provider-key-approval-record.txt"
        path.write_text(
            "Records policy RP-12 approved provider key list, item 4.\n",
            encoding="utf-8",
        )
        return path

    def prepare(self, root: Path, *, legal_hold: bool = True) -> dict:
        return prepare_archive_request(
            gtv_package=self.build_gtv(root),
            provider_organization="External Records Custodian",
            repository_id="records-vault-01",
            immutability_mode="worm-compliance",
            retention_policy_id="records-policy-RP-12",
            retention_until=REQUEST_RETENTION,
            legal_hold_required=legal_hold,
            output_directory=root / "archive-request",
            openssl_path=self.openssl,
            created_at=CREATED_AT,
            request_id="GADR-0123456789ABCDEF0123456789ABCDEF",
        )

    def issue(self, root: Path, prepared: dict, key_path: Path) -> dict:
        return issue_archive_provider_receipt(
            prepared_directory=Path(prepared["directory"]),
            private_key_path=key_path,
            archive_object_id="object-20260812-0001",
            version_id="immutable-version-0001",
            stored_at=STORED_AT,
            retention_until=ACTUAL_RETENTION,
            legal_hold_status="active",
            signed_at=SIGNED_AT,
            output_directory=root / "provider-receipt",
        )

    def test_real_gtv_archive_round_trip_and_independent_reverification(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepared = self.prepare(root)
            request_dir = Path(prepared["directory"])
            self.assertEqual(len(list(request_dir.iterdir())), 2)
            schema = json.loads(
                (Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json").read_text(encoding="utf-8")
            )
            request_json = json.loads(Path(prepared["requestPath"]).read_text(encoding="utf-8"))
            assert_json_schema(self, request_json, schema["$defs"]["archiveRequest"], schema)
            archive_path = Path(prepared["archiveObjectPath"])
            with zipfile.ZipFile(archive_path, "r") as archive:
                self.assertGreater(len(archive.infolist()), 5)
                self.assertTrue(all(item.compress_type == zipfile.ZIP_STORED for item in archive.infolist()))
                self.assertTrue(all("/" not in item.filename and "\\" not in item.filename for item in archive.infolist()))

            private_path = root / "provider-private.pem"
            private_raw_before = self.private_key(private_path)
            receipt = self.issue(root, prepared, private_path)
            self.assertEqual(len(list(Path(receipt["directory"]).iterdir())), 2)
            receipt_json = json.loads(Path(receipt["receiptPath"]).read_text(encoding="utf-8"))
            assert_json_schema(self, receipt_json, schema["$defs"]["providerReceipt"], schema)

            final = finalize_archive_verification_package(
                prepared_directory=request_dir,
                provider_receipt_path=Path(receipt["receiptPath"]),
                provider_public_key_path=Path(receipt["providerPublicKeyPath"]),
                provider_key_approval_evidence_path=self.approval_evidence(root),
                provider_key_approval_basis="Records policy RP-12 approved provider key list, item 4",
                output_directory=root / "gav",
                openssl_path=self.openssl,
                verified_at="2026-08-12T08:03:00Z",
            )
            package = Path(final["directory"])
            self.assertEqual(len(list(package.iterdir())), 6)
            verified = verify_archive_verification_package(package, openssl_path=self.openssl)
            self.assertEqual(verified["summary"]["requestComplianceStatus"], "fulfilled")
            self.assertEqual(verified["summary"]["storageEvidenceStatus"], "provider-signed-attestation-valid")
            self.assertEqual(verified["archive"]["archiveObjectId"], "object-20260812-0001")
            self.assertEqual(verified["archive"]["retentionPolicyId"], "records-policy-RP-12")
            self.assertEqual(verified["archive"]["retentionUntil"], ACTUAL_RETENTION)
            self.assertTrue(verified["boundary"]["providerSignedReceiptIsAttestationNotIndependentObservation"])
            self.assertTrue(verified["boundary"]["doesNotQueryCurrentExternalRepositoryState"])
            private_bytes = private_path.read_bytes()
            self.assertNotEqual(private_bytes, b"")
            self.assertFalse(any(path.read_bytes() == private_bytes for path in package.iterdir()))
            self.assertIsInstance(private_raw_before, Ed25519PrivateKey)
            self.assertFalse((root / "must-not-be-created.sqlite3").exists())

            if os.name == "nt":
                launcher = Path(__file__).resolve().parents[2] / "receiver_governance_archive.ps1"
                powershell = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        str(launcher),
                        "-Mode",
                        "Verify",
                        "-PackagePath",
                        str(package),
                        "-OpenSslPath",
                        str(self.openssl),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env={
                        **os.environ,
                        "PYTHONUTF8": "1",
                        "STRUT_DB_PATH": str(root / "must-not-be-created.sqlite3"),
                    },
                )
                self.assertEqual(powershell.returncode, 0, powershell.stderr)
                self.assertIn("governance external archive operation completed", powershell.stdout)
                self.assertFalse((root / "must-not-be-created.sqlite3").exists())

            (package / "extra.txt").write_text("not allowed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "額外檔案"):
                verify_archive_verification_package(package, openssl_path=self.openssl)
            (package / "extra.txt").unlink()

            archive_copy = package / archive_path.name
            archive_copy.write_bytes(archive_copy.read_bytes() + b"tampered")
            with self.assertRaisesRegex(ValueError, "bytes.*驗證收據不一致"):
                verify_archive_verification_package(package, openssl_path=self.openssl)

    def test_policy_shortfall_wrong_key_and_signature_tampering_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepared = self.prepare(root)
            key_path = root / "provider-private.pem"
            provider_key = self.private_key(key_path)
            approval_evidence = self.approval_evidence(root)
            with self.assertRaisesRegex(ValueError, "保留期限短於"):
                issue_archive_provider_receipt(
                    prepared_directory=Path(prepared["directory"]),
                    private_key_path=key_path,
                    archive_object_id="object-1",
                    version_id="version-1",
                    stored_at=STORED_AT,
                    retention_until="2030-01-01T00:00:00Z",
                    legal_hold_status="active",
                    signed_at=SIGNED_AT,
                    output_directory=root / "short-retention",
                )
            self.assertFalse((root / "short-retention").exists())
            with self.assertRaisesRegex(ValueError, "legal hold"):
                issue_archive_provider_receipt(
                    prepared_directory=Path(prepared["directory"]),
                    private_key_path=key_path,
                    archive_object_id="object-1",
                    version_id="version-1",
                    stored_at=STORED_AT,
                    retention_until=ACTUAL_RETENTION,
                    legal_hold_status="not-active",
                    signed_at=SIGNED_AT,
                    output_directory=root / "inactive-hold",
                )
            self.assertFalse((root / "inactive-hold").exists())

            issued = self.issue(root, prepared, key_path)
            wrong_key_path = root / "wrong-public.pem"
            wrong_key_path.write_bytes(
                Ed25519PrivateKey.generate().public_key().public_bytes(
                    serialization.Encoding.PEM,
                    serialization.PublicFormat.SubjectPublicKeyInfo,
                )
            )
            with self.assertRaisesRegex(ValueError, "keyId.*不一致"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=Path(issued["receiptPath"]),
                    provider_public_key_path=wrong_key_path,
                    provider_key_approval_evidence_path=approval_evidence,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "wrong-key",
                    openssl_path=self.openssl,
                )
            self.assertFalse((root / "wrong-key").exists())

            tampered = json.loads(Path(issued["receiptPath"]).read_text(encoding="utf-8"))
            tampered["provider"]["archiveObjectId"] = "object-tampered"
            tampered["receiptFingerprint"] = archive_receipt_fingerprint(tampered)
            tampered_path = root / "tampered-receipt.json"
            tampered_path.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "簽章驗證失敗"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=tampered_path,
                    provider_public_key_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_evidence_path=approval_evidence,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "tampered-output",
                    openssl_path=self.openssl,
                )
            self.assertFalse((root / "tampered-output").exists())

            noncompliant = json.loads(Path(issued["receiptPath"]).read_text(encoding="utf-8"))
            noncompliant["storage"]["retentionUntil"] = "2030-01-01T00:00:00Z"
            noncompliant["receiptFingerprint"] = archive_receipt_fingerprint(noncompliant)
            noncompliant["signature"]["value"] = base64.b64encode(
                provider_key.sign(_receipt_signature_payload(noncompliant))
            ).decode("ascii")
            noncompliant_path = root / "valid-signature-short-retention.json"
            noncompliant_path.write_text(json.dumps(noncompliant, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "保留期限短於"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=noncompliant_path,
                    provider_public_key_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_evidence_path=approval_evidence,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "noncompliant-output",
                    openssl_path=self.openssl,
                )
            self.assertFalse((root / "noncompliant-output").exists())

    def test_compressed_zip_private_material_and_missing_openssl_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepared = self.prepare(root, legal_hold=False)
            archive_path = Path(prepared["archiveObjectPath"])
            with zipfile.ZipFile(archive_path, "r") as source:
                files = {info.filename: source.read(info) for info in source.infolist()}
            compressed = root / "compressed.zip"
            with zipfile.ZipFile(compressed, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, raw in files.items():
                    archive.writestr(name, raw)
            with self.assertRaisesRegex(ValueError, "未壓縮"):
                _read_closed_zip(compressed.read_bytes(), self.openssl)
            with self.assertRaisesRegex(ValueError, "尾隨資料"):
                _read_closed_zip(archive_path.read_bytes() + b"trailing", self.openssl)

            key_path = root / "provider-private.pem"
            self.private_key(key_path)
            issued = self.issue(root, prepared, key_path)
            approval_evidence = self.approval_evidence(root)
            mixed_public = root / "mixed-public.pem"
            mixed_public.write_bytes(Path(issued["providerPublicKeyPath"]).read_bytes() + key_path.read_bytes())
            with self.assertRaisesRegex(ValueError, "不得包含私人金鑰"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=Path(issued["receiptPath"]),
                    provider_public_key_path=mixed_public,
                    provider_key_approval_evidence_path=approval_evidence,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "mixed-key-output",
                    openssl_path=self.openssl,
                )
            with self.assertRaisesRegex(ValueError, "核定證據.*不得包含私人金鑰"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=Path(issued["receiptPath"]),
                    provider_public_key_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_evidence_path=key_path,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "private-approval-output",
                    openssl_path=self.openssl,
                )
            with self.assertRaisesRegex(ValueError, "獨立文件"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=Path(issued["receiptPath"]),
                    provider_public_key_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_evidence_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "public-key-as-approval-output",
                    openssl_path=self.openssl,
                )
            with self.assertRaisesRegex(ValueError, "找不到可執行的 OpenSSL"):
                finalize_archive_verification_package(
                    prepared_directory=Path(prepared["directory"]),
                    provider_receipt_path=Path(issued["receiptPath"]),
                    provider_public_key_path=Path(issued["providerPublicKeyPath"]),
                    provider_key_approval_evidence_path=approval_evidence,
                    provider_key_approval_basis="Approved list item 4",
                    output_directory=root / "missing-openssl-output",
                    openssl_path=root / "missing-openssl.exe",
                )


if __name__ == "__main__":
    unittest.main()
