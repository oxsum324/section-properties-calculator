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

            revoked = store.revoke_key(
                record["keyId"],
                reason_code="suspected-compromise",
                reason="保管電腦疑似遭未授權存取，先行撤銷並更換金鑰。",
                handled_by="王管理者",
                incident_reference="INC-2026-001",
                revocation_confirmed=True,
            )
            self.assertEqual(revoked["status"], "revoked")
            self.assertEqual(revoked["revocationReasonCode"], "suspected-compromise")
            self.assertEqual(revoked["revokedBy"], "王管理者")
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved["keys"][0]["status"], "revoked")
            self.assertIsNotNone(saved["keys"][0]["revokedAt"])
            self.assertEqual(len(saved["events"]), 2)
            self.assertEqual(saved["events"][0]["eventType"], "key-registered")
            self.assertEqual(saved["events"][1]["eventType"], "key-revoked")
            self.assertEqual(
                saved["events"][1]["previousEventFingerprint"],
                saved["events"][0]["eventFingerprint"],
            )
            self.assertEqual(revoked["revocationEventFingerprint"], saved["events"][1]["eventFingerprint"])

            with self.assertRaisesRegex(ValueError, "不可覆寫"):
                store.revoke_key(
                    record["keyId"],
                    reason_code="other",
                    reason="企圖改寫原始撤銷原因。",
                    handled_by="另一位管理者",
                    revocation_confirmed=True,
                )

    def test_revocation_requires_complete_confirmation_and_supported_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            record = store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"), True)

            with self.assertRaisesRegex(ValueError, "不可復原"):
                store.revoke_key(
                    record["keyId"],
                    reason_code="retired",
                    reason="完成除役程序。",
                    handled_by="管理者",
                )
            with self.assertRaisesRegex(ValueError, "不受支援"):
                store.revoke_key(
                    record["keyId"],
                    reason_code="erase-history",
                    reason="錯誤原因分類。",
                    handled_by="管理者",
                    revocation_confirmed=True,
                )
            self.assertEqual(store.list_keys()[0]["status"], "trusted")

    def test_event_chain_rejects_tampering_and_old_registry_remains_readable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receiver-trust.json"
            path.write_text(
                json.dumps({"schemaVersion": 1, "kind": "receiver-verification-trust-registry", "keys": []}),
                encoding="utf-8",
            )
            store = ReceiverTrustStore(path)
            self.assertEqual(store.list_events(), [])

            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"), True)
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["events"][0]["reason"] = "竄改後的事件原因"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "指紋驗證失敗"):
                store.list_events()

    def test_registry_rejects_revoked_key_restored_without_matching_event(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receiver-trust.json"
            store = ReceiverTrustStore(path)
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            record = store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"), True)
            store.revoke_key(
                record["keyId"],
                reason_code="confirmed-compromise",
                reason="確認私鑰已遭未授權複製。",
                handled_by="資安管理者",
                incident_reference="SEC-2026-002",
                revocation_confirmed=True,
            )
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["keys"][0]["status"] = "trusted"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "狀態與撤銷事件不一致"):
                store.list_keys()

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
