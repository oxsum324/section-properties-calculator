from __future__ import annotations

import base64
from copy import deepcopy
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_evidence_template_package import (
    build_receiver_evidence_template_publisher_package,
    receiver_evidence_template_library_fingerprint,
    validate_receiver_evidence_template_publisher_package,
)
from backend.app.removal_transfer_handoff import receiver_identity_key_id


def _library() -> dict:
    return {
        "schemaVersion": 2,
        "kind": "receiver-supplemental-evidence-template-library",
        "exportedAt": "2026-08-11T08:00:00Z",
        "boundary": {
            "descriptiveFieldsOnly": True,
            "evidenceFileNameExcluded": True,
            "evidenceFileSha256Excluded": True,
            "actualEvidenceFileRequiredAfterApply": True,
            "governanceRequiredBeforeApply": True,
            "importedApprovalRequiresLocalReview": True,
        },
        "templates": [{
            "templateId": "RET-001",
            "name": "接頭與接合｜CONN-001｜A",
            "checkId": "connection",
            "basis": "依接頭計算書第 4 節完成檢核。",
            "evidence": {
                "documentReference": "CONN-001",
                "revision": "A",
                "issuedDate": "2026-08-11",
                "pageReference": "第 4-6 頁",
            },
            "governance": {
                "status": "approved",
                "revision": 1,
                "reviewedBy": "王小明",
                "reviewedAt": "2026-08-11T07:00:00Z",
                "validUntil": "2026-12-31",
                "changeLog": [{
                    "revision": 1,
                    "recordedAt": "2026-08-11T06:00:00Z",
                    "changedFields": ["建立範本"],
                }],
            },
            "createdAt": "2026-08-11T06:00:00Z",
            "updatedAt": "2026-08-11T07:00:00Z",
        }],
    }


def _trusted_key(private_key: Ed25519PrivateKey, organization: str = "接收端工程顧問") -> dict:
    raw = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    return {
        "keyId": receiver_identity_key_id(raw),
        "algorithm": "Ed25519",
        "organization": organization,
        "displayName": "範本發布章",
        "publicKeyBase64": base64.b64encode(raw).decode("ascii"),
        "status": "trusted",
    }


class ReceiverEvidenceTemplatePublisherPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.private_key = Ed25519PrivateKey.generate()
        self.package = build_receiver_evidence_template_publisher_package(
            _library(),
            self.private_key,
            "接收端工程顧問",
            "範本發布章",
            signed_at="2026-08-11T09:00:00Z",
        )

    def test_builds_and_verifies_cryptographic_package(self) -> None:
        result = validate_receiver_evidence_template_publisher_package(self.package)
        self.assertRegex(result["package"]["libraryFingerprint"], r"^ETL-[0-9A-F]{20}$")
        self.assertRegex(result["package"]["packageFingerprint"], r"^ETP-[0-9A-F]{20}$")
        self.assertEqual(
            result["package"]["libraryFingerprint"],
            receiver_evidence_template_library_fingerprint(_library()),
        )
        self.assertEqual(result["publisherVerification"]["status"], "valid-signature-untrusted-key")
        self.assertTrue(result["publisherVerification"]["cryptographicValid"])
        self.assertFalse(result["publisherVerification"]["trusted"])

    def test_default_signed_at_uses_browser_compatible_milliseconds(self) -> None:
        package = build_receiver_evidence_template_publisher_package(
            _library(),
            self.private_key,
            "接收端工程顧問",
            "範本發布章",
        )
        self.assertRegex(
            package["publisherSignature"]["signedAt"],
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
        )

    def test_api_uses_local_trust_registry_and_rejects_tampering(self) -> None:
        with patch.object(main_module.receiver_trust_store, "list_keys", return_value=[_trusted_key(self.private_key)]):
            response = TestClient(main_module.app).post(
                "/api/removal-transfer-evidence-template-packages/validate",
                json=self.package,
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["publisherVerification"]["status"], "trusted-signature-valid")

        tampered = deepcopy(self.package)
        tampered["library"]["templates"][0]["basis"] = "竄改內容"
        response = TestClient(main_module.app).post(
            "/api/removal-transfer-evidence-template-packages/validate",
            json=tampered,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("指紋", response.json()["detail"])

    def test_classifies_trusted_revoked_and_mismatched_keys(self) -> None:
        trusted = _trusted_key(self.private_key)
        verification = validate_receiver_evidence_template_publisher_package(
            self.package,
            [trusted],
        )["publisherVerification"]
        self.assertEqual(verification["status"], "trusted-signature-valid")
        self.assertTrue(verification["trusted"])

        revoked = {**trusted, "status": "revoked"}
        self.assertEqual(
            validate_receiver_evidence_template_publisher_package(
                self.package,
                [revoked],
            )["publisherVerification"]["status"],
            "valid-signature-revoked-key",
        )

        mismatch = {**trusted, "organization": "其他單位"}
        self.assertEqual(
            validate_receiver_evidence_template_publisher_package(
                self.package,
                [mismatch],
            )["publisherVerification"]["status"],
            "valid-signature-organization-mismatch",
        )

    def test_rejects_tampered_library_signature_and_fingerprint(self) -> None:
        tampered_library = deepcopy(self.package)
        tampered_library["library"]["templates"][0]["basis"] = "遭改寫的查核依據"
        with self.assertRaisesRegex(ValueError, "範本庫內容與範本庫指紋不一致"):
            validate_receiver_evidence_template_publisher_package(tampered_library)

        tampered_signature = deepcopy(self.package)
        tampered_signature["publisherSignature"]["signatureBase64"] = base64.b64encode(b"x" * 64).decode("ascii")
        with self.assertRaisesRegex(ValueError, "數位簽章驗證失敗"):
            validate_receiver_evidence_template_publisher_package(tampered_signature)

        tampered_fingerprint = deepcopy(self.package)
        tampered_fingerprint["packageFingerprint"] = "ETP-" + "0" * 20
        with self.assertRaisesRegex(ValueError, "封包指紋不一致"):
            validate_receiver_evidence_template_publisher_package(tampered_fingerprint)

    def test_rejects_evidence_filename_or_hash_anywhere_in_templates(self) -> None:
        forbidden_name = _library()
        forbidden_name["templates"][0]["evidence"]["fileName"] = "connection.pdf"
        with self.assertRaisesRegex(ValueError, "不得包含證據檔名或 SHA-256"):
            build_receiver_evidence_template_publisher_package(
                forbidden_name,
                self.private_key,
                "接收端工程顧問",
                "範本發布章",
            )

        forbidden_hash = _library()
        forbidden_hash["templates"][0]["evidence"]["fileSha256"] = "a" * 64
        with self.assertRaisesRegex(ValueError, "不得包含證據檔名或 SHA-256"):
            build_receiver_evidence_template_publisher_package(
                forbidden_hash,
                self.private_key,
                "接收端工程顧問",
                "範本發布章",
            )

    def test_accepts_schema_v3_boundary_but_never_treats_signature_as_local_approval(self) -> None:
        library = _library()
        library["schemaVersion"] = 3
        library["boundary"].update({
            "publisherProvenanceIsInformational": True,
            "localApprovalStillRequiredAfterImport": True,
        })
        package = build_receiver_evidence_template_publisher_package(
            library,
            self.private_key,
            "接收端工程顧問",
            "範本發布章",
            signed_at="2026-08-11T09:00:00Z",
        )
        result = validate_receiver_evidence_template_publisher_package(
            package,
            [_trusted_key(self.private_key)],
        )
        self.assertTrue(result["publisherVerification"]["trusted"])
        self.assertTrue(result["package"]["library"]["boundary"]["localApprovalStillRequiredAfterImport"])


if __name__ == "__main__":
    unittest.main()
