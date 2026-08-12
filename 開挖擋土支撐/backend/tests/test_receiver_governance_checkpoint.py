from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_signing_request,
    compare_receiver_governance_checkpoint_history,
    validate_receiver_governance_signed_checkpoint,
    verify_receiver_governance_checkpoint_against_current,
)
from backend.app.receiver_governance_health import build_receiver_governance_health_snapshot
from backend.app.receiver_key_enrollment import build_receiver_key_enrollment
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.sign_receiver_request import build_signature_response


FIXED_NOW = datetime(2026, 8, 12, 4, 30, tzinfo=timezone.utc)


class ReceiverGovernanceCheckpointTests(unittest.TestCase):
    def stores(self, directory: str, suffix: str = "") -> tuple[ReceiverOperatorStore, ReceiverTrustStore]:
        root = Path(directory)
        return (
            ReceiverOperatorStore(root / f"operators{suffix}.sqlite3"),
            ReceiverTrustStore(root / f"trust{suffix}.json"),
        )

    def history_with_one_observation(
        self,
        store: ReceiverOperatorStore,
        trust: ReceiverTrustStore,
        username: str = "root-admin",
    ) -> tuple[dict, dict]:
        admin = store.bootstrap(username, "管理員", "Strong-Secure-2026!")
        health = build_receiver_governance_health_snapshot(store, trust, generated_at=FIXED_NOW)
        store.record_governance_health_observation(
            health,
            change_type="operator-bootstrap",
            actor_operator_id=admin["id"],
        )
        return store.governance_health_history(), admin

    def signed_checkpoint(self, history: dict, key: Ed25519PrivateKey) -> dict:
        request = build_receiver_governance_checkpoint_signing_request(
            history,
            signed_at=FIXED_NOW,
        )
        return build_signature_response(request, key)

    def test_signed_checkpoint_is_self_contained_and_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            history, _ = self.history_with_one_observation(store, trust)
            checkpoint = self.signed_checkpoint(history, Ed25519PrivateKey.generate())
            self.assertRegex(checkpoint["checkpointFingerprint"], r"^GHC-[0-9A-F]{20}$")
            validated = validate_receiver_governance_signed_checkpoint(checkpoint)
            self.assertTrue(validated["signature"]["cryptographicValid"])
            self.assertFalse(validated["signature"]["trusted"])
            self.assertFalse(validated["boundary"]["externalTimestamp"])
            self.assertFalse(validated["boundary"]["externalStorageVerified"])
            self.assertFalse(validated["boundary"]["formalCalculationAttachment"])

            tampered = {
                **checkpoint,
                "signingRequest": {
                    **checkpoint["signingRequest"],
                    "observationCount": 999,
                },
            }
            with self.assertRaisesRegex(ValueError, "摘要與實際歷程不一致"):
                validate_receiver_governance_signed_checkpoint(tampered)

    def test_trusted_checkpoint_accepts_same_or_extended_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            history, admin = self.history_with_one_observation(store, trust)
            key = Ed25519PrivateKey.generate()
            enrollment = build_receiver_key_enrollment(key, "治理單位", "治理簽章")
            trust.register_enrollment(enrollment, True)
            checkpoint = self.signed_checkpoint(history, key)

            same = verify_receiver_governance_checkpoint_against_current(
                checkpoint,
                history,
                trust.list_keys(),
            )
            self.assertTrue(same["acceptedForCurrentState"])
            self.assertEqual(same["comparison"]["relation"], "current-matches-checkpoint")
            self.assertEqual(same["signature"]["status"], "trusted-signature-valid")

            store.create_operator(
                "requester-one",
                "專責申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            next_health = build_receiver_governance_health_snapshot(
                store,
                trust,
                generated_at=datetime(2026, 8, 12, 4, 31, tzinfo=timezone.utc),
            )
            store.record_governance_health_observation(
                next_health,
                change_type="operator-created",
                actor_operator_id=admin["id"],
            )
            extended = verify_receiver_governance_checkpoint_against_current(
                checkpoint,
                store.governance_health_history(),
                trust.list_keys(),
            )
            self.assertTrue(extended["acceptedForCurrentState"])
            self.assertEqual(extended["comparison"]["relation"], "current-extends-checkpoint")

    def test_checkpoint_detects_rollback_and_divergence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            first, admin = self.history_with_one_observation(store, trust)
            store.create_operator(
                "requester-one",
                "專責申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            health = build_receiver_governance_health_snapshot(
                store,
                trust,
                generated_at=datetime(2026, 8, 12, 4, 31, tzinfo=timezone.utc),
            )
            store.record_governance_health_observation(
                health,
                change_type="operator-created",
                actor_operator_id=admin["id"],
            )
            second = store.governance_health_history()
            behind = compare_receiver_governance_checkpoint_history(second, first)
            self.assertEqual(behind["relation"], "current-behind-checkpoint")

            other_store, other_trust = self.stores(directory, "-other")
            other, _ = self.history_with_one_observation(other_store, other_trust, "other-admin")
            diverged = compare_receiver_governance_checkpoint_history(second, other)
            self.assertEqual(diverged["relation"], "current-diverged-from-checkpoint")

    def test_revoked_or_untrusted_key_does_not_anchor_current_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            history, _ = self.history_with_one_observation(store, trust)
            key = Ed25519PrivateKey.generate()
            checkpoint = self.signed_checkpoint(history, key)
            untrusted = verify_receiver_governance_checkpoint_against_current(
                checkpoint,
                history,
                trust.list_keys(),
            )
            self.assertFalse(untrusted["acceptedForCurrentState"])
            self.assertEqual(untrusted["signature"]["status"], "valid-signature-untrusted-key")

            enrollment = build_receiver_key_enrollment(key, "治理單位", "治理簽章")
            trust.register_enrollment(enrollment, True)
            trust.revoke_key(
                enrollment["keyId"],
                reason_code="retired",
                reason="測試撤銷治理簽章。",
                handled_by="管理員",
                incident_reference="GHC-REVOKE-001",
                revocation_confirmed=True,
            )
            revoked = verify_receiver_governance_checkpoint_against_current(
                checkpoint,
                history,
                trust.list_keys(),
            )
            self.assertFalse(revoked["acceptedForCurrentState"])
            self.assertEqual(revoked["signature"]["status"], "valid-signature-revoked-key")

    def test_key_id_match_without_exact_public_key_match_is_not_trusted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            history, _ = self.history_with_one_observation(store, trust)
            key = Ed25519PrivateKey.generate()
            checkpoint = self.signed_checkpoint(history, key)
            enrollment = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "治理單位",
                "不同完整公鑰",
            )
            collision_like_record = {
                "keyId": checkpoint["signature"]["keyId"],
                "publicKeyBase64": enrollment["publicKeyBase64"],
                "organization": "治理單位",
                "displayName": "Key ID 相同但完整公鑰不同",
                "status": "trusted",
            }

            validated = validate_receiver_governance_signed_checkpoint(
                checkpoint,
                [collision_like_record],
            )

            self.assertFalse(validated["signature"]["trusted"])
            self.assertEqual(
                validated["signature"]["status"],
                "valid-signature-untrusted-key",
            )
            self.assertIn("完整公鑰", validated["signature"]["message"])

    def test_same_public_key_in_pem_representation_remains_trusted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            history, _ = self.history_with_one_observation(store, trust)
            key = Ed25519PrivateKey.generate()
            checkpoint = self.signed_checkpoint(history, key)
            pem_public_key = key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            ).decode("ascii")
            trusted_record = {
                "keyId": checkpoint["signature"]["keyId"],
                "publicKeyBase64": pem_public_key,
                "organization": "治理單位",
                "displayName": "PEM 表示的同一公鑰",
                "status": "trusted",
            }

            validated = validate_receiver_governance_signed_checkpoint(
                checkpoint,
                [trusted_record],
            )

            self.assertTrue(validated["signature"]["trusted"])
            self.assertEqual(validated["signature"]["status"], "trusted-signature-valid")

    def test_checkpoint_api_is_admin_only_and_compares_current_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
            key = Ed25519PrivateKey.generate()
            trust.register_enrollment(
                build_receiver_key_enrollment(key, "治理單位", "治理簽章"),
                True,
            )
            with (
                patch.object(main_module, "receiver_operator_store", store),
                patch.object(main_module, "receiver_trust_store", trust),
            ):
                anonymous = TestClient(main_module.app)
                self.assertEqual(
                    anonymous.get(
                        "/api/receiver-governance-health/history/checkpoint-signing-request"
                    ).status_code,
                    401,
                )
                client = TestClient(main_module.app)
                login = client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "root-admin", "password": "Strong-Secure-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                health = client.get("/api/receiver-governance-health")
                self.assertEqual(health.status_code, 200, health.text)
                request_response = client.get(
                    "/api/receiver-governance-health/history/checkpoint-signing-request"
                )
                self.assertEqual(request_response.status_code, 200, request_response.text)
                checkpoint = build_signature_response(
                    request_response.json()["signingRequest"],
                    key,
                )
                validated = client.post(
                    "/api/receiver-governance-health/history/checkpoint/validate",
                    json=checkpoint,
                    headers={"X-CSRF-Token": login.json()["csrfToken"]},
                )
                self.assertEqual(validated.status_code, 200, validated.text)
                self.assertTrue(validated.json()["acceptedForCurrentState"])
                self.assertEqual(
                    validated.json()["comparison"]["relation"],
                    "current-matches-checkpoint",
                )
                store.create_operator(
                    "requester-one",
                    "專責申請人",
                    "Requester-Secure-2026!",
                    ["receiver-key-requester"],
                    actor_operator_id=admin["id"],
                )
                drifted = client.post(
                    "/api/receiver-governance-health/history/checkpoint/validate",
                    json=checkpoint,
                    headers={"X-CSRF-Token": login.json()["csrfToken"]},
                )
                self.assertEqual(drifted.status_code, 200, drifted.text)
                self.assertFalse(drifted.json()["acceptedForCurrentState"])
                self.assertFalse(drifted.json()["currentSnapshotRecorded"])
                self.assertIn("尚未寫入 GHR", drifted.json()["acceptanceMessage"])
                self.assertEqual(
                    client.get(
                        "/api/receiver-governance-health/history/checkpoint-signing-request"
                    ).status_code,
                    409,
                )


if __name__ == "__main__":
    unittest.main()
