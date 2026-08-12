from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_governance_health import build_receiver_governance_health_snapshot
from backend.app.receiver_key_enrollment import build_receiver_key_enrollment
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_trust_store import ReceiverTrustStore


FIXED_NOW = datetime(2026, 8, 12, 1, 30, tzinfo=timezone.utc)


class ReceiverGovernanceHealthTests(unittest.TestCase):
    def stores(self, directory: str) -> tuple[ReceiverOperatorStore, ReceiverTrustStore]:
        root = Path(directory)
        return (
            ReceiverOperatorStore(root / "operators.sqlite3"),
            ReceiverTrustStore(root / "receiver-trust.json"),
        )

    def test_health_progresses_from_attention_to_overlap_to_complete(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")

            attention = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            self.assertEqual(attention["status"], "attention")
            self.assertFalse(attention["distinctPairAvailable"])

            store.create_operator(
                "requester-one",
                "專責申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            overlap = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            self.assertEqual(overlap["status"], "overlap")
            self.assertTrue(overlap["distinctPairAvailable"])
            self.assertFalse(overlap["dedicatedPairAvailable"])
            self.assertNotEqual(
                attention["healthFingerprint"], overlap["healthFingerprint"]
            )

            store.create_operator(
                "approver-one",
                "專責覆核人",
                "Approver-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            complete = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            self.assertEqual(complete["status"], "complete")
            self.assertTrue(complete["dedicatedPairAvailable"])
            self.assertNotEqual(
                overlap["healthFingerprint"], complete["healthFingerprint"]
            )
            self.assertRegex(complete["healthFingerprint"], r"^RGH-[0-9A-F]{20}$")
            self.assertRegex(
                complete["sources"]["operatorGovernanceSnapshotFingerprint"],
                r"^ROG-[0-9A-F]{20}$",
            )
            self.assertRegex(
                complete["sources"]["trustRegistryFingerprint"],
                r"^RTR-[0-9A-F]{20}$",
            )
            self.assertFalse(complete["consistencyBoundary"]["crossStoreAtomic"])
            self.assertTrue(
                complete["consistencyBoundary"]["authorizationRevalidatedPerOperation"]
            )

    def test_health_excludes_disabled_and_password_reset_accounts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
            requester = store.create_operator(
                "requester-one",
                "申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            approver = store.create_operator(
                "approver-one",
                "覆核人",
                "Approver-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            store.set_disabled(requester["id"], True, actor_operator_id=admin["id"])
            store.reset_password(
                approver["id"],
                "Temporary-Secure-2026!",
                actor_operator_id=admin["id"],
            )

            health = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            self.assertEqual(health["activeRequesterCount"], 1)
            self.assertEqual(health["activeApproverCount"], 1)
            self.assertFalse(health["distinctPairAvailable"])
            self.assertEqual(health["status"], "attention")

    def test_orphaned_pending_sqlite_claim_fails_closed_and_fingerprint_is_stable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
            requester = store.create_operator(
                "requester-one",
                "申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            store.create_operator(
                "approver-one",
                "覆核人",
                "Approver-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            summary = {
                "requestFingerprint": "RVE-AAAAAAAAAAAAAAAAAAAA",
                "newKeyId": "RVK-NEW-ORPHAN",
                "oldKeyId": "RVK-OLD-ORPHAN",
                "requestedAt": "2026-08-12T01:00:00Z",
                "expiresAt": "2026-08-15T01:00:00Z",
            }
            with store.rotation_request_transaction(requester["id"], summary["newKeyId"]) as connection:
                store.record_rotation_request(connection, summary, requester["id"])

            first = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            second = build_receiver_governance_health_snapshot(
                store,
                trust,
                generated_at=datetime(2026, 8, 12, 1, 31, tzinfo=timezone.utc),
            )
            self.assertEqual(first["status"], "attention")
            self.assertEqual(first["pendingRotationCount"], 1)
            self.assertEqual(first["unreviewablePendingCount"], 1)
            self.assertEqual(
                first["unreviewablePendingClaims"][0]["reasonCodes"],
                ["missing-or-nonpending-trust-registry-event"],
            )
            self.assertEqual(first["healthFingerprint"], second["healthFingerprint"])
            self.assertNotEqual(first["generatedAt"], second["generatedAt"])

    def test_pending_trust_event_without_sqlite_claim_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
            requester = store.create_operator(
                "requester-one",
                "申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            store.create_operator(
                "approver-one",
                "覆核人",
                "Approver-Secure-2026!",
                ["receiver-key-approver"],
                actor_operator_id=admin["id"],
            )
            old = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(), "接收端單位", "舊章"
            )
            trust.register_enrollment(old, True)
            new = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章",
                replaces_key_id=old["keyId"],
            )
            trust.register_enrollment(new, True)
            rotation_request = trust.request_rotation_completion(
                new["keyId"],
                reason="切換完成。",
                requested_by=requester["displayName"],
                requester_role="治理申請人",
                requested_by_operator_id=requester["id"],
                incident_reference="KEY-MISSING-CLAIM-001",
                request_confirmed=True,
            )

            health = build_receiver_governance_health_snapshot(
                store, trust, generated_at=FIXED_NOW
            )
            self.assertEqual(health["status"], "attention")
            self.assertEqual(health["pendingRotationCount"], 1)
            self.assertEqual(health["unreviewablePendingCount"], 1)
            self.assertEqual(
                health["unreviewablePendingClaims"],
                [
                    {
                        "claimType": "receiver-key-rotation",
                        "requestFingerprint": rotation_request["requestFingerprint"],
                        "reasonCodes": ["missing-sqlite-claim"],
                    }
                ],
            )

    def test_http_health_endpoint_is_admin_only_and_returns_no_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store, trust = self.stores(directory)
            admin = store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
            requester = store.create_operator(
                "requester-one",
                "申請人",
                "Requester-Secure-2026!",
                ["receiver-key-requester"],
                actor_operator_id=admin["id"],
            )
            with (
                patch.object(main_module, "receiver_operator_store", store),
                patch.object(main_module, "receiver_trust_store", trust),
            ):
                anonymous = TestClient(main_module.app)
                self.assertEqual(
                    anonymous.get("/api/receiver-governance-health").status_code,
                    401,
                )

                requester_client = TestClient(main_module.app)
                login = requester_client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "requester-one", "password": "Requester-Secure-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                self.assertEqual(
                    requester_client.get("/api/receiver-governance-health").status_code,
                    403,
                )

                admin_client = TestClient(main_module.app)
                login = admin_client.post(
                    "/api/receiver-operator-auth/login",
                    json={"username": "root-admin", "password": "Strong-Secure-2026!"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                response = admin_client.get("/api/receiver-governance-health")
                self.assertEqual(response.status_code, 200, response.text)
                payload = response.json()
                serialized = str(payload).casefold()
                for secret in ("password", "salt", "username", "displayname"):
                    self.assertNotIn(secret, serialized)
                self.assertEqual(payload["kind"], "receiver-governance-separation-health")


if __name__ == "__main__":
    unittest.main()
