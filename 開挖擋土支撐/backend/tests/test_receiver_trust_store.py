from __future__ import annotations

import base64
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.app.receiver_key_enrollment import (
    build_receiver_key_enrollment,
    validate_receiver_key_enrollment,
)
from backend.manage_receiver_key import create_receiver_key_package


class ReceiverTrustStoreTests(unittest.TestCase):
    def test_registers_pem_key_and_persists_revocation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receiver-trust.json"
            store = ReceiverTrustStore(path)
            public_key = Ed25519PrivateKey.generate().public_key()
            pem = public_key.public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            ).decode("ascii")

            record = store.register_key("接收端結構技師事務所", "2026 正式章", pem, True)
            self.assertRegex(record["keyId"], r"^RVK-[0-9A-F]{20}$")
            self.assertEqual(store.list_keys()[0]["status"], "trusted")

            revoked = store.revoke_key(record["keyId"])
            self.assertEqual(revoked["status"], "revoked")
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved["keys"][0]["status"], "revoked")
            self.assertIsNotNone(saved["keys"][0]["revokedAt"])

    def test_accepts_raw_base64_and_rejects_duplicate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            value = base64.b64encode(raw).decode("ascii")
            store.register_key("接收端單位", "正式章", value, True)
            with self.assertRaisesRegex(ValueError, "已存在"):
                store.register_key("接收端單位", "正式章", value, True)

    def test_rejects_non_ed25519_public_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            with self.assertRaisesRegex(ValueError, "Ed25519"):
                store.register_key("接收端單位", "錯誤章", base64.b64encode(b"x" * 31).decode("ascii"), True)

    def test_requires_explicit_independent_verification(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            with self.assertRaisesRegex(ValueError, "獨立管道核對"):
                store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"))

    def test_validates_and_registers_proof_of_possession_enrollment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            enrollment = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "  接收端結構技師事務所  ",
                "  2026 正式章  ",
                created_at="2026-08-07T16:00:00Z",
            )

            record = store.register_enrollment(enrollment, True)

            self.assertRegex(enrollment["packageFingerprint"], r"^RKE-[0-9A-F]{20}$")
            self.assertEqual(enrollment["organization"], "接收端結構技師事務所")
            self.assertEqual(enrollment["displayName"], "2026 正式章")
            self.assertEqual(record["registrationMethod"], "enrollment-package")
            self.assertTrue(record["proofOfPossessionVerified"])
            self.assertEqual(record["enrollmentFingerprint"], enrollment["packageFingerprint"])

            tampered = deepcopy(enrollment)
            tampered["organization"] = "冒用單位"
            with self.assertRaisesRegex(ValueError, "持有證明驗證失敗"):
                validate_receiver_key_enrollment(tampered)

    def test_rotation_enrollment_links_but_does_not_revoke_previous_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            old = build_receiver_key_enrollment(Ed25519PrivateKey.generate(), "接收端單位", "舊章")
            store.register_enrollment(old, True)
            new = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章",
                replaces_key_id=old["keyId"],
            )

            new_record = store.register_enrollment(new, True)
            records = store.list_keys()

            self.assertEqual(new_record["replacesKeyId"], old["keyId"])
            self.assertEqual(records[0]["status"], "trusted")
            self.assertEqual(records[1]["status"], "trusted")

    def test_creates_encrypted_private_key_and_public_only_enrollment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            private_path, enrollment_path, enrollment = create_receiver_key_package(
                Path(directory),
                "接收端單位",
                "離線正式章",
                b"correct horse battery staple",
            )

            private_key = serialization.load_pem_private_key(
                private_path.read_bytes(),
                password=b"correct horse battery staple",
            )
            saved_enrollment = json.loads(enrollment_path.read_text(encoding="utf-8"))

            self.assertIsInstance(private_key, Ed25519PrivateKey)
            self.assertEqual(validate_receiver_key_enrollment(saved_enrollment), enrollment)
            self.assertNotIn("private", enrollment_path.read_text(encoding="utf-8").lower())


if __name__ == "__main__":
    unittest.main()
