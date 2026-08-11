from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.app.receiver_trust_backup import (
    build_receiver_trust_registry_backup,
    preview_receiver_trust_registry_restore,
    restore_receiver_trust_registry_backup,
    validate_receiver_trust_registry_backup,
)
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

    def test_two_person_rotation_revokes_only_linked_old_key_and_persists_bidirectional_audit(self) -> None:
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
            store.register_enrollment(new, True)

            with self.assertRaisesRegex(ValueError, "明確確認"):
                store.request_rotation_completion(
                    new["keyId"],
                    reason="新金鑰已完成測試簽署。",
                    requested_by="王管理者",
                    requester_role="金鑰保管人",
                    incident_reference="KEY-2026-001",
                )

            rotation_request = store.request_rotation_completion(
                new["keyId"],
                reason="新金鑰已完成測試簽署與接收端切換。",
                requested_by="王管理者",
                requester_role="金鑰保管人",
                incident_reference="KEY-2026-001",
                request_confirmed=True,
            )
            self.assertEqual(rotation_request["status"], "pending")
            self.assertEqual(len(store.list_events()), 3)
            self.assertTrue(all(item["status"] == "trusted" for item in store.list_keys()))
            pending_snapshot = store.snapshot()
            with self.assertRaisesRegex(ValueError, "兩階段流程"):
                store.complete_rotation()
            with self.assertRaisesRegex(ValueError, "必須與申請人不同"):
                store.approve_rotation_completion(
                    rotation_request["requestFingerprint"],
                    approved_by="王管理者",
                    approver_role="資安覆核",
                    approval_confirmed=True,
                )

            completed = store.approve_rotation_completion(
                rotation_request["requestFingerprint"],
                approved_by="李覆核者",
                approver_role="資安覆核",
                approval_confirmed=True,
            )
            records = {item["keyId"]: item for item in store.list_keys()}
            events = store.list_events()

            self.assertEqual(completed["newKey"]["keyId"], new["keyId"])
            self.assertEqual(completed["revokedKey"]["keyId"], old["keyId"])
            self.assertEqual(records[old["keyId"]]["status"], "revoked")
            self.assertEqual(records[old["keyId"]]["replacedByKeyId"], new["keyId"])
            self.assertEqual(records[new["keyId"]]["status"], "trusted")
            self.assertEqual(
                records[new["keyId"]]["rotationCompletionEventFingerprint"],
                records[old["keyId"]]["revocationEventFingerprint"],
            )
            self.assertEqual(events[-1]["reasonCode"], "superseded-after-rotation")
            self.assertEqual(events[-1]["relatedKeyId"], new["keyId"])
            self.assertEqual(events[-1]["approvalRequestFingerprint"], rotation_request["requestFingerprint"])
            self.assertEqual(events[-1]["actorRole"], "資安覆核")
            self.assertEqual(completed["request"]["status"], "completed")
            self.assertEqual(ReceiverTrustStore.validate_snapshot(store.list_keys(), events)["keys"], store.list_keys())

            backup = build_receiver_trust_registry_backup(store)
            validated_backup = validate_receiver_trust_registry_backup(backup)
            backed_up_records = {
                item["keyId"]: item for item in validated_backup["registry"]["keys"]
            }
            self.assertEqual(
                backed_up_records[new["keyId"]]["rotationCompletionEventFingerprint"],
                records[new["keyId"]]["rotationCompletionEventFingerprint"],
            )
            self.assertEqual(backed_up_records[old["keyId"]]["replacedByKeyId"], new["keyId"])
            self.assertEqual(
                backed_up_records[new["keyId"]]["rotationApprovalRequestFingerprint"],
                rotation_request["requestFingerprint"],
            )

            forward_target = ReceiverTrustStore(Path(directory) / "forward-target.json")
            forward_target.replace_snapshot(
                pending_snapshot["keys"],
                pending_snapshot["events"],
                restore_confirmed=True,
            )
            forward_preview = preview_receiver_trust_registry_restore(forward_target, backup)["preview"]
            self.assertTrue(forward_preview["restoreAllowed"], forward_preview["blockingReasons"])
            restore_receiver_trust_registry_backup(forward_target, backup, restore_confirmed=True)
            self.assertEqual(forward_target.list_rotation_requests()[0]["status"], "completed")

            with self.assertRaisesRegex(ValueError, "已覆核執行"):
                store.approve_rotation_completion(
                    rotation_request["requestFingerprint"],
                    approved_by="另一位覆核者",
                    approver_role="資安覆核",
                    approval_confirmed=True,
                )

    def test_rotation_rejects_parallel_replacement_and_generic_completion_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            old = build_receiver_key_enrollment(Ed25519PrivateKey.generate(), "接收端單位", "舊章")
            store.register_enrollment(old, True)
            first = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章 A",
                replaces_key_id=old["keyId"],
            )
            store.register_enrollment(first, True)
            rotation_request = store.request_rotation_completion(
                first["keyId"],
                reason="新金鑰已完成測試簽署與使用端切換。",
                requested_by="王管理者",
                requester_role="金鑰保管人",
                incident_reference="KEY-2026-002",
                request_confirmed=True,
            )
            with self.assertRaisesRegex(ValueError, "已有待覆核申請"):
                store.request_rotation_completion(
                    first["keyId"],
                    reason="不得平行申請。",
                    requested_by="另一位申請人",
                    requester_role="金鑰保管人",
                    incident_reference="KEY-2026-002-B",
                    request_confirmed=True,
                )
            self.assertEqual(store.list_rotation_requests()[0]["requestFingerprint"], rotation_request["requestFingerprint"])
            second = build_receiver_key_enrollment(
                Ed25519PrivateKey.generate(),
                "接收端單位",
                "新章 B",
                replaces_key_id=old["keyId"],
            )
            with self.assertRaisesRegex(ValueError, "待完成輪替"):
                store.register_enrollment(second, True)
            with self.assertRaisesRegex(ValueError, "專用流程"):
                store.revoke_key(
                    old["keyId"],
                    reason_code="superseded-after-rotation",
                    reason="不得繞過輪替完成流程。",
                    handled_by="王管理者",
                    incident_reference="KEY-2026-002",
                    revocation_confirmed=True,
                )

    def test_two_person_rotation_api_returns_pending_then_completed_registry(self) -> None:
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
            store.register_enrollment(new, True)
            with patch.object(main_module, "receiver_trust_store", store):
                client = TestClient(main_module.app)
                requested = client.post(
                    f"/api/removal-transfer-trust-keys/{new['keyId']}/rotation-requests",
                    json={
                        "reason": "新金鑰已完成簽署測試與使用端切換。",
                        "requested_by": "王管理者",
                        "requester_role": "金鑰保管人",
                        "incident_reference": "KEY-2026-003",
                        "request_confirmed": True,
                    },
                )
                self.assertEqual(requested.status_code, 200, requested.text)
                request_fingerprint = requested.json()["request"]["requestFingerprint"]
                response = client.post(
                    f"/api/removal-transfer-trust-key-rotation-requests/{request_fingerprint}/approve",
                    json={
                        "approved_by": "李覆核者",
                        "approver_role": "資安覆核",
                        "approval_confirmed": True,
                    },
                )
                legacy = client.post(
                    f"/api/removal-transfer-trust-keys/{new['keyId']}/complete-rotation",
                    json={
                        "reason": "不得繞過。",
                        "handled_by": "王管理者",
                        "incident_reference": "KEY-2026-003",
                        "rotation_confirmed": True,
                    },
                )

            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(legacy.status_code, 409, legacy.text)
            payload = response.json()
            self.assertEqual(payload["newKey"]["keyId"], new["keyId"])
            self.assertEqual(payload["revokedKey"]["keyId"], old["keyId"])
            self.assertEqual(payload["revokedKey"]["status"], "revoked")
            self.assertEqual(len(payload["events"]), 4)
            self.assertEqual(payload["rotationRequests"][0]["status"], "completed")

    def test_rotation_request_expires_before_second_person_approval(self) -> None:
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
            store.register_enrollment(new, True)
            rotation_request = store.request_rotation_completion(
                new["keyId"],
                reason="新金鑰已完成測試簽署與使用端切換。",
                requested_by="王管理者",
                requester_role="金鑰保管人",
                incident_reference="KEY-2026-004",
                request_confirmed=True,
            )
            after_expiry = datetime.fromisoformat(rotation_request["expiresAt"].replace("Z", "+00:00")) + timedelta(seconds=1)
            with patch("backend.app.receiver_trust_store.datetime", wraps=datetime) as mocked_datetime:
                mocked_datetime.now.return_value = after_expiry.astimezone(timezone.utc)
                with self.assertRaisesRegex(ValueError, "已逾 72 小時"):
                    store.approve_rotation_completion(
                        rotation_request["requestFingerprint"],
                        approved_by="李覆核者",
                        approver_role="資安覆核",
                        approval_confirmed=True,
                    )

    def test_parallel_rotation_approvals_allow_exactly_one_completion(self) -> None:
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
            store.register_enrollment(new, True)
            rotation_request = store.request_rotation_completion(
                new["keyId"],
                reason="新金鑰已完成測試簽署與使用端切換。",
                requested_by="王管理者",
                requester_role="金鑰保管人",
                incident_reference="KEY-2026-005",
                request_confirmed=True,
            )

            def approve(name: str) -> str:
                try:
                    store.approve_rotation_completion(
                        rotation_request["requestFingerprint"],
                        approved_by=name,
                        approver_role="資安覆核",
                        approval_confirmed=True,
                    )
                    return "completed"
                except ValueError as exc:
                    return str(exc)

            with ThreadPoolExecutor(max_workers=2) as executor:
                outcomes = list(executor.map(approve, ["李覆核者", "陳覆核者"]))

            self.assertEqual(outcomes.count("completed"), 1)
            self.assertEqual(sum("已覆核執行" in item for item in outcomes), 1)
            self.assertEqual(len([item for item in store.list_events() if item["eventType"] == "key-revoked"]), 1)

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

    def test_builds_and_validates_public_only_trust_registry_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"), True)

            backup = build_receiver_trust_registry_backup(store)
            validated = validate_receiver_trust_registry_backup(backup)

            self.assertRegex(validated["backupFingerprint"], r"^RTB-[0-9A-F]{20}$")
            self.assertRegex(validated["registry"]["registryFingerprint"], r"^RTR-[0-9A-F]{20}$")
            self.assertEqual(validated["registry"]["keyCount"], 1)
            self.assertEqual(validated["registry"]["eventCount"], 1)
            self.assertNotIn("private", json.dumps(validated, ensure_ascii=False).lower())

            tampered = deepcopy(backup)
            tampered["registry"]["keys"][0]["status"] = "revoked"
            with self.assertRaisesRegex(ValueError, "清冊指紋驗證失敗|狀態與撤銷事件不一致"):
                validate_receiver_trust_registry_backup(tampered)

            contains_secret = deepcopy(backup)
            contains_secret["privateKey"] = "forbidden"
            with self.assertRaisesRegex(ValueError, "不得包含私密欄位"):
                validate_receiver_trust_registry_backup(contains_secret)

    def test_previews_and_restores_backup_with_safeguard_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target_path = root / "target.json"
            target = ReceiverTrustStore(target_path)
            first_raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            first_record = target.register_key(
                "備份來源單位",
                "正式章",
                base64.b64encode(first_raw).decode("ascii"),
                True,
            )
            source_path = root / "source.json"
            source_path.write_bytes(target_path.read_bytes())
            source = ReceiverTrustStore(source_path)
            source.revoke_key(
                first_record["keyId"],
                reason_code="retired",
                reason="測試清冊復原所需的除役紀錄。",
                handled_by="來源管理者",
                revocation_confirmed=True,
            )
            second_raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            second_record = source.register_key(
                "備份來源單位",
                "輪替章",
                base64.b64encode(second_raw).decode("ascii"),
                True,
            )
            backup = build_receiver_trust_registry_backup(source)

            preview = preview_receiver_trust_registry_restore(target, backup)["preview"]
            self.assertEqual(preview["addedKeyIds"], [second_record["keyId"]])
            self.assertEqual(preview["removedKeyIds"], [])
            self.assertTrue(preview["wouldReplace"])
            self.assertTrue(preview["restoreAllowed"])

            with self.assertRaisesRegex(ValueError, "明確確認"):
                restore_receiver_trust_registry_backup(target, backup)
            restored = restore_receiver_trust_registry_backup(target, backup, restore_confirmed=True)
            safeguard = Path(restored["safeguardPath"])

            self.assertTrue(safeguard.exists())
            self.assertEqual(target.list_keys()[0]["keyId"], first_record["keyId"])
            self.assertEqual(target.list_keys()[0]["status"], "revoked")
            self.assertEqual(restored["registryFingerprint"], backup["registry"]["registryFingerprint"])
            safeguarded_payload = json.loads(safeguard.read_text(encoding="utf-8"))
            self.assertEqual(safeguarded_payload["keys"][0]["keyId"], first_record["keyId"])
            self.assertEqual(safeguarded_payload["keys"][0]["status"], "trusted")

    def test_restore_blocks_revocation_rollback_or_key_removal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ReceiverTrustStore(Path(directory) / "receiver-trust.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            record = store.register_key("接收端單位", "正式章", base64.b64encode(raw).decode("ascii"), True)
            old_backup = build_receiver_trust_registry_backup(store)
            store.revoke_key(
                record["keyId"],
                reason_code="retired",
                reason="不可由舊備份回退的撤銷事件。",
                handled_by="來源管理者",
                revocation_confirmed=True,
            )

            preview = preview_receiver_trust_registry_restore(store, old_backup)["preview"]
            self.assertFalse(preview["restoreAllowed"])
            self.assertTrue(any("撤銷" in reason or "事件鏈" in reason for reason in preview["blockingReasons"]))
            with self.assertRaisesRegex(ValueError, "不得復原"):
                restore_receiver_trust_registry_backup(store, old_backup, restore_confirmed=True)
            self.assertEqual(store.list_keys()[0]["status"], "revoked")

    def test_restore_can_replace_unreadable_registry_after_preview(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = ReceiverTrustStore(root / "source.json")
            raw = Ed25519PrivateKey.generate().public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            source.register_key("來源單位", "正式章", base64.b64encode(raw).decode("ascii"), True)
            backup = build_receiver_trust_registry_backup(source)

            broken_path = root / "broken.json"
            broken_path.write_text("{not-json", encoding="utf-8")
            broken = ReceiverTrustStore(broken_path)
            preview = preview_receiver_trust_registry_restore(broken, backup)["preview"]
            self.assertEqual(preview["currentStatus"], "unreadable")
            self.assertTrue(preview["currentError"])

            restored = restore_receiver_trust_registry_backup(broken, backup, restore_confirmed=True)
            self.assertEqual(len(restored["keys"]), 1)
            self.assertEqual(broken.list_keys()[0]["organization"], "來源單位")
            self.assertEqual(Path(restored["safeguardPath"]).read_text(encoding="utf-8"), "{not-json")


if __name__ == "__main__":
    unittest.main()
