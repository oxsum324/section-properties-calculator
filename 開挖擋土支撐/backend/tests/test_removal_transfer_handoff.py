from __future__ import annotations

from copy import deepcopy
import json
import base64
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.calculations import calculate_project
from backend.app.removal_transfer_handoff import (
    IDENTITY_SIGNATURE_RESPONSE_KIND,
    KIND,
    RECEIPT_KIND,
    attach_receiver_identity_signature,
    build_removal_transfer_handoff,
    build_receiver_identity_signing_request,
    build_receiver_verification_receipt,
    receiver_verification_receipt_fingerprint,
    receiver_identity_key_id,
    receiver_identity_signing_payload,
    same_removal_transfer_handoff_content,
    validate_removal_transfer_handoff,
    validate_receiver_identity_signing_request,
    validate_receiver_verification_receipt,
    verify_receiver_identity_signature,
)
from backend.app.removal_transfer_handoff import _handoff_fingerprint, _transfer_id
from backend.sign_receiver_request import build_signature_response
from backend.app.reporting import calculation_fingerprint
from backend.app.schemas import AnalysisForceCase
from backend.app.workbook_loader import load_default_project


class RemovalTransferHandoffTests(unittest.TestCase):
    def prepared_project(self):
        project = load_default_project().model_copy(deep=True)
        project.metadata.id = "removal-transfer-test"
        project.metadata.name = "拆撐交接測試案"
        project.metadata.project_code = "EX-RT-01"
        row = project.top_supports[0]
        row.force_source = "analysis_import"
        row.analysis_stage_cases = [
            AnalysisForceCase(stage_index=2, stage_label="第二階開挖", axial_force_t=row.axial_force_t),
        ]
        row.analysis_install_stage_index = 1
        row.analysis_install_stage_label = "第一道支撐安裝"
        row.analysis_control_stage_index = 2
        row.analysis_control_stage_label = "第二階開挖"
        row.analysis_removal_stage_index = 3
        row.analysis_removal_stage_label = "第一道支撐拆除"
        row.removal_transfer_mode = "floor"
        row.removal_transfer_target = "B2F 樓版 S1 區"
        row.removal_transfer_direction = "沿第一道支撐軸線向東"
        row.removal_transfer_basis = "拆撐順序圖 CS-04"
        row.removal_transfer_confirmed = True
        row.construction_step_label = "第二階開挖完成"
        row.analysis_mapping_basis = "施工順序圖 CS-02"
        row.analysis_mapping_confirmed = True
        project.calculation_results = calculate_project(project)
        return project

    def receiver_receipt(self, handoff, *, status: str = "passed"):
        results = []
        for transfer in handoff["transfers"]:
            ratio = 0.82 if status == "passed" else 1.08
            results.append(
                {
                    "transferId": transfer["transferId"],
                    "status": status,
                    "receiverTarget": transfer["receiver"]["target"] or "另案承接構造 RC-01",
                    "adoptedDemandTf": transfer["sourceDemand"]["memberDesignAxialForceTf"],
                    "capacityUtilizationRatio": ratio,
                    "verificationBasis": "承接構造階段分析模型 RV-01",
                    "conclusion": "容量及傳力路徑檢核通過" if status == "passed" else "容量檢核不通過",
                }
            )
        failed = sum(item["status"] == "failed" for item in results)
        receipt = {
            "schemaVersion": 1,
            "kind": RECEIPT_KIND,
            "issuedAt": "2026-08-07T12:00:00Z",
            "handoffFingerprint": handoff["handoffFingerprint"],
            "sourceCalculationFingerprint": handoff["source"]["calculationFingerprint"],
            "verificationAuthority": {
                "organization": "承接構造設計單位",
                "verifierName": "王工程師",
                "verifierRole": "結構設計覆核",
                "reportReference": "RV-01-20260807",
            },
            "results": results,
            "summary": {
                "status": "failed" if failed else "passed",
                "passed": len(results) - failed,
                "failed": failed,
            },
            "boundary": {
                "receiverCalculationCompleted": True,
                "sourceToolDidNotAutoVerify": True,
                "verifierIdentityRequiresManualReview": True,
            },
        }
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)
        return receipt

    def signed_receipt(self, receipt, *, signed_at: str = "2026-08-07T12:00:00Z"):
        private_key = Ed25519PrivateKey.generate()
        public_key = private_key.public_key().public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
        signature = private_key.sign(receiver_identity_signing_payload(receipt, signed_at))
        receipt["identitySignature"] = {
            "schemaVersion": 1,
            "algorithm": "Ed25519",
            "keyId": receiver_identity_key_id(public_key),
            "publicKeyBase64": base64.b64encode(public_key).decode("ascii"),
            "signedAt": signed_at,
            "signatureBase64": base64.b64encode(signature).decode("ascii"),
        }
        return receipt, public_key

    def test_builds_pending_receiver_verification_handoff(self) -> None:
        project = self.prepared_project()
        fingerprint = calculation_fingerprint(project)

        record = build_removal_transfer_handoff(
            project,
            fingerprint,
            generated_at="2026-08-07T10:00:00Z",
        )

        self.assertEqual(record["kind"], KIND)
        self.assertEqual(record["schemaVersion"], 2)
        self.assertEqual(record["receiptContract"]["schemaVersion"], 1)
        self.assertRegex(record["handoffFingerprint"], r"^ERH-[0-9A-F]{20}$")
        self.assertEqual(record["source"]["calculationFingerprint"], fingerprint)
        self.assertEqual(len(record["transfers"]), 1)
        transfer = record["transfers"][0]
        self.assertRegex(transfer["transferId"], r"^ERT-[0-9A-F]{20}$")
        self.assertEqual(transfer["sourceMember"]["collection"], "top_supports")
        self.assertEqual(transfer["sourceDemand"]["analysisControlAxialForceTf"], 76.0)
        self.assertEqual(transfer["sourceDemand"]["memberDesignAxialForceTf"], 106.0)
        self.assertEqual(transfer["sourceDemand"]["receiverTransferDemandTf"], 106.0)
        self.assertEqual(transfer["receiver"]["target"], "B2F 樓版 S1 區")
        self.assertEqual(transfer["receiver"]["direction"], "沿第一道支撐軸線向東")
        self.assertEqual(transfer["verification"]["status"], "pending")
        self.assertEqual(transfer["verification"]["acceptedReceiptKind"], RECEIPT_KIND)
        self.assertTrue(record["boundary"]["requiresReceiverVerification"])
        self.assertFalse(record["boundary"]["autoVerified"])
        self.assertEqual(validate_removal_transfer_handoff(json.loads(json.dumps(record))), record)

    def test_rejects_tampered_transfer_content(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        changed = deepcopy(record)
        changed["transfers"][0]["sourceDemand"]["analysisControlAxialForceTf"] += 1

        with self.assertRaisesRegex(ValueError, "交接內容與交接指紋不一致"):
            validate_removal_transfer_handoff(changed)

    def test_keeps_legacy_v1_handoff_read_compatibility(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        legacy = deepcopy(record)
        legacy["schemaVersion"] = 1
        source_fingerprint = legacy["source"]["calculationFingerprint"]
        for transfer in legacy["transfers"]:
            transfer["sourceDemand"].pop("receiverTransferDemandTf")
            transfer["receiver"].pop("direction")
            unsigned = {key: value for key, value in transfer.items() if key != "transferId"}
            transfer["transferId"] = _transfer_id(unsigned, source_fingerprint)
        legacy["handoffFingerprint"] = _handoff_fingerprint(legacy)

        self.assertEqual(validate_removal_transfer_handoff(legacy), legacy)

    def test_outside_scope_handoff_keeps_receiver_identity_pending(self) -> None:
        project = self.prepared_project()
        row = project.top_supports[0]
        row.removal_transfer_mode = "outside_scope"
        row.removal_transfer_target = ""
        row.removal_transfer_direction = "沿第一道支撐軸線向東"
        row.removal_transfer_basis = "拆撐順序圖 CS-04，承接構造另案檢核"
        project.calculation_results = calculate_project(project)

        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))

        self.assertTrue(record["transfers"][0]["receiver"]["receiverIdentityRequired"])
        self.assertEqual(record["verificationSummary"]["status"], "pending")

    def test_rejects_source_member_that_did_not_pass_calculation(self) -> None:
        project = self.prepared_project()
        row = project.top_supports[0]
        row.axial_force_t = 100000.0
        row.analysis_stage_cases[0].axial_force_t = row.axial_force_t
        project.calculation_results = calculate_project(project)

        with self.assertRaisesRegex(ValueError, "尚未形成可交接的有效檢核結果"):
            build_removal_transfer_handoff(project, calculation_fingerprint(project))

    def test_requires_at_least_one_confirmed_removal_transfer(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_results = calculate_project(project)

        with self.assertRaisesRegex(ValueError, "目前沒有已完成計算"):
            build_removal_transfer_handoff(project, calculation_fingerprint(project))

    def test_validates_complete_external_receiver_receipt(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)

        validated = validate_receiver_verification_receipt(receipt, handoff)

        self.assertRegex(validated["receiptFingerprint"], r"^RVR-[0-9A-F]{20}$")
        self.assertEqual(validated["summary"]["status"], "passed")
        self.assertTrue(validated["boundary"]["verifierIdentityRequiresManualReview"])
        round_tripped = json.loads(json.dumps(receipt))
        self.assertEqual(validate_receiver_verification_receipt(round_tripped, handoff), receipt)

    def test_rejects_receiver_demand_below_erh_transfer_demand(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        receipt["results"][0]["adoptedDemandTf"] = (
            handoff["transfers"][0]["sourceDemand"]["receiverTransferDemandTf"] - 0.001
        )
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "不得小於 ERH"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_unsigned_receipt_keeps_manual_identity_review(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)

        identity = verify_receiver_identity_signature(receipt)

        self.assertEqual(identity["status"], "manual-review-required")
        self.assertFalse(identity["signaturePresent"])

    def test_valid_signature_is_untrusted_until_key_is_registered(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt, public_key = self.signed_receipt(self.receiver_receipt(handoff))

        self.assertEqual(
            receiver_verification_receipt_fingerprint(receipt),
            receipt["receiptFingerprint"],
        )
        identity = verify_receiver_identity_signature(receipt)
        self.assertEqual(identity["status"], "valid-signature-untrusted-key")
        self.assertTrue(identity["cryptographicValid"])
        trusted = verify_receiver_identity_signature(receipt, [{
            "keyId": receiver_identity_key_id(public_key),
            "organization": receipt["verificationAuthority"]["organization"],
            "displayName": "接收端正式簽章",
            "status": "trusted",
        }])
        self.assertEqual(trusted["status"], "trusted-signature-valid")
        self.assertTrue(trusted["trusted"])

    def test_rejects_invalid_identity_signature(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt, _ = self.signed_receipt(self.receiver_receipt(handoff))
        receipt["identitySignature"]["signedAt"] = "2026-08-07T12:01:00Z"

        with self.assertRaisesRegex(ValueError, "數位簽章驗證失敗"):
            verify_receiver_identity_signature(receipt)

    def test_valid_signature_does_not_trust_revoked_or_mismatched_key(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt, public_key = self.signed_receipt(self.receiver_receipt(handoff))
        key = {
            "keyId": receiver_identity_key_id(public_key),
            "organization": receipt["verificationAuthority"]["organization"],
            "displayName": "接收端正式簽章",
            "status": "revoked",
        }
        self.assertEqual(
            verify_receiver_identity_signature(receipt, [key])["status"],
            "valid-signature-revoked-key",
        )
        key["status"] = "trusted"
        key["organization"] = "其他單位"
        self.assertEqual(
            verify_receiver_identity_signature(receipt, [key])["status"],
            "valid-signature-organization-mismatch",
        )

    def test_builds_offline_signing_request_and_attaches_response(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        request = build_receiver_identity_signing_request(
            receipt,
            handoff,
            signed_at="2026-08-07T14:00:00Z",
        )
        private_key = Ed25519PrivateKey.generate()

        response = build_signature_response(request, private_key)
        signed_receipt = attach_receiver_identity_signature(receipt, handoff, response)

        self.assertRegex(request["requestFingerprint"], r"^RSR-[0-9A-F]{20}$")
        self.assertEqual(response["kind"], IDENTITY_SIGNATURE_RESPONSE_KIND)
        self.assertEqual(signed_receipt["receiptFingerprint"], receipt["receiptFingerprint"])
        self.assertEqual(
            verify_receiver_identity_signature(signed_receipt)["status"],
            "valid-signature-untrusted-key",
        )

    def test_rejects_tampered_signing_request_or_signature_response(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        request = build_receiver_identity_signing_request(
            receipt,
            handoff,
            signed_at="2026-08-07T14:00:00Z",
        )
        tampered_request = deepcopy(request)
        tampered_request["organization"] = "冒用單位"
        with self.assertRaisesRegex(ValueError, "欄位與實際簽署訊息不一致"):
            validate_receiver_identity_signing_request(tampered_request)

        response = build_signature_response(request, Ed25519PrivateKey.generate())
        response["signature"]["algorithm"] = "RSA"
        with self.assertRaisesRegex(ValueError, "簽章演算法不受支援"):
            attach_receiver_identity_signature(receipt, handoff, response)

        response = build_signature_response(request, Ed25519PrivateKey.generate())
        response["signature"]["signatureBase64"] = base64.b64encode(b"x" * 64).decode("ascii")
        with self.assertRaisesRegex(ValueError, "數位簽章驗證失敗"):
            attach_receiver_identity_signature(receipt, handoff, response)

    def test_builds_controlled_receiver_receipt_for_assistant(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff)
        draft["verificationAuthority"]["untrustedField"] = "must not survive"
        draft["results"][0]["untrustedField"] = "must not survive"

        receipt = build_receiver_verification_receipt(
            handoff,
            draft["verificationAuthority"],
            draft["results"],
            issued_at="2026-08-07T12:00:00Z",
        )

        self.assertEqual(receipt["summary"], {"status": "passed", "passed": 1, "failed": 0})
        self.assertNotIn("untrustedField", receipt["verificationAuthority"])
        self.assertNotIn("untrustedField", receipt["results"][0])
        self.assertTrue(receipt["boundary"]["receiverCalculationCompleted"])
        self.assertRegex(receipt["receiptFingerprint"], r"^RVR-[0-9A-F]{20}$")
        self.assertEqual(
            validate_receiver_verification_receipt(json.loads(json.dumps(receipt)), handoff),
            receipt,
        )

    def test_assistant_rejects_missing_receiver_result(self) -> None:
        project = self.prepared_project()
        second = deepcopy(project.top_supports[0])
        second.level_label = "第二層"
        project.top_supports.append(second)
        project.calculation_results = calculate_project(project)
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff)
        draft["results"].pop()

        with self.assertRaisesRegex(ValueError, "未完整涵蓋"):
            build_receiver_verification_receipt(
                handoff,
                draft["verificationAuthority"],
                draft["results"],
            )

    def test_rejects_tampered_receiver_receipt(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        receipt["results"][0]["adoptedDemandTf"] += 1

        with self.assertRaisesRegex(ValueError, "回簽內容與回簽指紋不一致"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_rejects_incomplete_receiver_receipt(self) -> None:
        project = self.prepared_project()
        second = deepcopy(project.top_supports[0])
        second.level_label = "第二層"
        project.top_supports.append(second)
        project.calculation_results = calculate_project(project)
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        receipt["results"].pop()
        receipt["summary"]["passed"] = 1
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "未完整涵蓋"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_rejects_passed_receipt_with_over_capacity_ratio(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff)
        receipt["results"][0]["capacityUtilizationRatio"] = 1.01
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "利用率大於 1"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_reuses_handoff_when_only_issue_time_changes(self) -> None:
        project = self.prepared_project()
        fingerprint = calculation_fingerprint(project)
        first = build_removal_transfer_handoff(project, fingerprint, generated_at="2026-08-07T10:00:00Z")
        second = build_removal_transfer_handoff(project, fingerprint, generated_at="2026-08-07T11:00:00Z")

        self.assertNotEqual(first["handoffFingerprint"], second["handoffFingerprint"])
        self.assertTrue(same_removal_transfer_handoff_content(first, second))


if __name__ == "__main__":
    unittest.main()
