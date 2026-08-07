from __future__ import annotations

import base64
import json
from pathlib import Path
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.receiver_trust_store import ReceiverTrustStore


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

            record = store.register_key("接收端結構技師事務所", "2026 正式章", pem)
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
            store.register_key("接收端單位", "正式章", value)
            with self.assertRaisesRegex(ValueError, "已存在"):
                store.register_key("接收端單位", "正式章", value)

    def test_rejects_non_ed25519_public_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            with self.assertRaisesRegex(ValueError, "Ed25519"):
                store.register_key("接收端單位", "錯誤章", base64.b64encode(b"x" * 31).decode("ascii"))


if __name__ == "__main__":
    unittest.main()
