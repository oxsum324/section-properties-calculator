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
    attach_source_evidence_identity_signature,
    build_removal_transfer_handoff,
    build_receiver_identity_signing_request,
    build_receiver_verification_receipt,
    build_source_capacity_evidence_verification,
    build_source_evidence_identity_signing_request,
    SOURCE_EVIDENCE_SIGNATURE_RESPONSE_KIND,
    receiver_verification_receipt_fingerprint,
    source_evidence_verification_fingerprint,
    receiver_identity_key_id,
    receiver_identity_signing_payload,
    same_removal_transfer_handoff_content,
    validate_removal_transfer_handoff,
    validate_receiver_identity_signing_request,
    validate_receiver_verification_receipt,
    validate_source_capacity_evidence_verification,
    validate_source_evidence_identity_signing_request,
    verify_receiver_identity_signature,
    verify_source_evidence_identity_signature,
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

    def receiver_receipt(self, handoff, *, status: str = "passed", schema_version: int = 1):
        results = []
        for transfer in handoff["transfers"]:
            ratio = 0.82 if status == "passed" else 1.08
            adopted_demand = transfer["sourceDemand"].get(
                "receiverTransferDemandTf",
                transfer["sourceDemand"]["memberDesignAxialForceTf"],
            )
            result = {
                "transferId": transfer["transferId"],
                "status": status,
                "receiverTarget": transfer["receiver"]["target"] or "另案承接構造 RC-01",
                "adoptedDemandTf": adopted_demand,
                "capacityUtilizationRatio": ratio,
                "verificationBasis": "承接構造階段分析模型 RV-01",
                "conclusion": "容量及傳力路徑檢核通過" if status == "passed" else "容量檢核不通過",
            }
            if schema_version >= 2:
                result["verifiedCapacityTf"] = adopted_demand / ratio
            if schema_version >= 3:
                result["capacityEvidence"] = {
                    "documentReference": "RV-01-20260807",
                    "revision": "A",
                    "issuedDate": "2026-08-07",
                    "pageReference": "第 12 頁／4.2 節",
                    "fileName": "receiver-capacity-report.pdf",
                    "fileSha256": "a" * 64,
                }
            if schema_version >= 4:
                result["verificationScope"] = {
                    "analysisModelReference": "承接構造階段分析模型 RV-01",
                    "governingLoadCombination": "拆撐階段 LC-RM-01",
                    "directionAndDistributionBasis": "依施工順序圖沿第一道支撐軸線分配",
                    "eccentricityAndSecondaryEffectBasis": "依模型節點偏心及二階分析結果",
                    "checkedLimitStates": ["axial", "shear", "connection"],
                    "otherChecksStatus": status,
                }
            if schema_version >= 5:
                result["supplementalChecks"] = [
                    {
                        "checkId": check_id,
                        "status": status,
                        "basis": f"{label}正式檢核章節",
                        "evidence": {
                            "documentReference": f"RV-01-{check_id}",
                            "revision": "A",
                            "issuedDate": "2026-08-07",
                            "pageReference": f"{label}章節",
                            "fileName": f"receiver-{check_id}.pdf",
                            "fileSha256": f"{index:x}" * 64,
                        },
                    }
                    for index, (check_id, label) in enumerate((
                        ("connection", "接頭與接合"),
                        ("bearing", "端部與局部承壓"),
                        ("receiving-structure", "基礎、樓版或承接主體"),
                        ("bracing-and-effective-length", "側向支撐與有效長度條件"),
                        ("construction-sequence-and-preload", "施工順序、預載與卸載控制"),
                    ), start=1)
                ]
            results.append(result)
        failed = sum(item["status"] == "failed" for item in results)
        receipt = {
            "schemaVersion": schema_version,
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
        if schema_version >= 2:
            receipt["boundary"]["capacityValueFromReceiverDocument"] = True
        if schema_version >= 3:
            receipt["boundary"]["capacityEvidenceFileNotEmbedded"] = True
        if schema_version >= 4:
            receipt["boundary"]["verificationScopeStructured"] = True
        if schema_version >= 5:
            receipt["boundary"].update({
                "supplementalChecksStructured": True,
                "supplementalEvidenceFilesNotEmbedded": True,
                "otherChecksStatusDerived": True,
            })
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)
        return receipt

    def source_evidence_matches(self, receipt):
        matches = []
        for result in receipt["results"]:
            matches.append({
                "transferId": result["transferId"],
                "evidenceKey": "capacity",
                "selectedFileName": result["capacityEvidence"]["fileName"],
                "actualSha256": result["capacityEvidence"]["fileSha256"],
            })
            for check in result.get("supplementalChecks", []):
                if "evidence" not in check:
                    continue
                matches.append({
                    "transferId": result["transferId"],
                    "evidenceKey": check["checkId"],
                    "selectedFileName": check["evidence"]["fileName"],
                    "actualSha256": check["evidence"]["fileSha256"],
                })
        return matches

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
        self.assertEqual(record["schemaVersion"], 4)
        self.assertEqual(record["receiptContract"]["schemaVersion"], 5)
        self.assertEqual(
            record["receiptContract"]["verificationScope"],
            "per-ERT-structured-model-combination-load-path-eccentricity-and-limit-states",
        )
        self.assertEqual(
            record["receiptContract"]["capacityCheck"],
            "adopted-demand-divided-by-verified-capacity",
        )
        self.assertEqual(
            record["receiptContract"]["capacityEvidence"],
            "per-ERT-document-metadata-and-sha256",
        )
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

    def test_builds_two_ert_rows_for_closed_multi_receiver_allocation(self) -> None:
        project = self.prepared_project()
        row = project.top_supports[0]
        row.removal_transfer_share_percent = 60.0
        row.removal_transfer_additional_receivers = [{
            "mode": "reshore",
            "target": "第二道回撐 R2",
            "direction": "沿 R2 軸線",
            "share_percent": 40.0,
            "basis": "拆撐分流分析 TR-02",
        }]
        project.calculation_results = calculate_project(project)

        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))

        self.assertEqual(len(record["transfers"]), 2)
        self.assertEqual(
            [item["sourceDemand"]["allocationSharePercent"] for item in record["transfers"]],
            [60.0, 40.0],
        )
        self.assertEqual(
            sum(item["sourceDemand"]["receiverTransferDemandTf"] for item in record["transfers"]),
            106.0,
        )
        self.assertEqual(record["verificationSummary"]["required"], 2)

    def test_keeps_legacy_v1_handoff_read_compatibility(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        legacy = deepcopy(record)
        legacy["schemaVersion"] = 1
        legacy["receiptContract"]["schemaVersion"] = 1
        legacy["receiptContract"].pop("capacityCheck")
        legacy["receiptContract"].pop("capacityEvidence")
        source_fingerprint = legacy["source"]["calculationFingerprint"]
        for transfer in legacy["transfers"]:
            transfer["sourceDemand"].pop("receiverTransferDemandTf")
            transfer["receiver"].pop("direction")
            unsigned = {key: value for key, value in transfer.items() if key != "transferId"}
            transfer["transferId"] = _transfer_id(unsigned, source_fingerprint)
        legacy["handoffFingerprint"] = _handoff_fingerprint(legacy)

        self.assertEqual(validate_removal_transfer_handoff(legacy), legacy)

    def test_keeps_legacy_v2_handoff_read_compatibility(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        legacy = deepcopy(record)
        legacy["schemaVersion"] = 2
        legacy["receiptContract"]["schemaVersion"] = 1
        legacy["receiptContract"].pop("capacityCheck")
        legacy["receiptContract"].pop("capacityEvidence")
        source_fingerprint = legacy["source"]["calculationFingerprint"]
        for transfer in legacy["transfers"]:
            transfer["sourceDemand"].pop("allocationSharePercent")
            unsigned = {key: value for key, value in transfer.items() if key != "transferId"}
            transfer["transferId"] = _transfer_id(unsigned, source_fingerprint)
        legacy["handoffFingerprint"] = _handoff_fingerprint(legacy)

        self.assertEqual(validate_removal_transfer_handoff(legacy), legacy)

    def test_keeps_legacy_v3_handoff_with_v1_receipt_contract(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        legacy = deepcopy(record)
        legacy["receiptContract"]["schemaVersion"] = 1
        legacy["receiptContract"].pop("capacityCheck")
        legacy["receiptContract"].pop("capacityEvidence")
        legacy["handoffFingerprint"] = _handoff_fingerprint(legacy)

        self.assertEqual(validate_removal_transfer_handoff(legacy), legacy)

    def test_keeps_legacy_v3_handoff_with_v2_receipt_contract(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        legacy = deepcopy(record)
        legacy["receiptContract"]["schemaVersion"] = 2
        legacy["receiptContract"].pop("capacityEvidence")
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

    def test_keeps_legacy_v1_receipt_without_capacity_read_compatibility(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=1)

        self.assertNotIn("verifiedCapacityTf", receipt["results"][0])
        self.assertEqual(validate_receiver_verification_receipt(receipt, handoff), receipt)

    def test_keeps_legacy_v2_receipt_without_document_evidence(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=2)

        self.assertNotIn("capacityEvidence", receipt["results"][0])
        self.assertEqual(validate_receiver_verification_receipt(receipt, handoff), receipt)

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
        draft = self.receiver_receipt(handoff, schema_version=5)
        draft["verificationAuthority"]["untrustedField"] = "must not survive"
        draft["results"][0]["untrustedField"] = "must not survive"

        receipt = build_receiver_verification_receipt(
            handoff,
            draft["verificationAuthority"],
            draft["results"],
            issued_at="2026-08-07T12:00:00Z",
        )

        self.assertEqual(receipt["summary"], {"status": "passed", "passed": 1, "failed": 0})
        self.assertEqual(receipt["schemaVersion"], 5)
        self.assertGreater(receipt["results"][0]["verifiedCapacityTf"], receipt["results"][0]["adoptedDemandTf"])
        self.assertEqual(
            receipt["results"][0]["capacityUtilizationRatio"],
            round(
                receipt["results"][0]["adoptedDemandTf"]
                / receipt["results"][0]["verifiedCapacityTf"],
                6,
            ),
        )
        self.assertNotIn("untrustedField", receipt["verificationAuthority"])
        self.assertNotIn("untrustedField", receipt["results"][0])
        self.assertTrue(receipt["boundary"]["receiverCalculationCompleted"])
        self.assertTrue(receipt["boundary"]["capacityEvidenceFileNotEmbedded"])
        self.assertEqual(receipt["results"][0]["capacityEvidence"]["fileSha256"], "a" * 64)
        self.assertEqual(receipt["results"][0]["verificationScope"]["otherChecksStatus"], "passed")
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
        draft = self.receiver_receipt(handoff, schema_version=5)
        draft["results"].pop()

        with self.assertRaisesRegex(ValueError, "未完整涵蓋"):
            build_receiver_verification_receipt(
                handoff,
                draft["verificationAuthority"],
                draft["results"],
            )

    def test_v5_requires_evidence_for_each_passed_supplemental_check(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        del draft["results"][0]["supplementalChecks"][0]["evidence"]

        with self.assertRaisesRegex(ValueError, "標示通過時必須連結證據檔"):
            build_receiver_verification_receipt(
                handoff,
                draft["verificationAuthority"],
                draft["results"],
            )

    def test_v5_derives_other_checks_status_and_sev_v2_covers_every_file(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        receipt = build_receiver_verification_receipt(
            handoff,
            draft["verificationAuthority"],
            draft["results"],
        )

        self.assertEqual(receipt["schemaVersion"], 5)
        self.assertEqual(receipt["results"][0]["verificationScope"]["otherChecksStatus"], "passed")
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "逐檔比對 RVR v5 引用證據",
            self.source_evidence_matches(receipt),
        )
        self.assertEqual(record["schemaVersion"], 2)
        self.assertEqual(record["summary"]["required"], 6)
        self.assertEqual({check["evidenceKey"] for check in record["checks"]}, {
            "capacity",
            "connection",
            "bearing",
            "receiving-structure",
            "bracing-and-effective-length",
            "construction-sequence-and-preload",
        })

    def test_v5_rejects_rsc_file_reused_as_supplemental_pass_evidence(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        capacity = draft["results"][0]["capacityEvidence"]
        capacity["documentReference"] = "RSC-1234567890ABCDEF1234"
        draft["results"][0]["supplementalChecks"][0]["evidence"]["fileSha256"] = capacity["fileSha256"]

        with self.assertRaisesRegex(ValueError, "RSC 構件容量證據不得重複"):
            build_receiver_verification_receipt(
                handoff,
                draft["verificationAuthority"],
                draft["results"],
            )

    def test_v5_rejects_legacy_sev_v1_partial_evidence_coverage(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        receipt = build_receiver_verification_receipt(handoff, draft["verificationAuthority"], draft["results"])
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "逐檔比對",
            self.source_evidence_matches(receipt),
        )
        record["schemaVersion"] = 1
        record["verificationFingerprint"] = source_evidence_verification_fingerprint(record)

        with self.assertRaisesRegex(ValueError, "RVR v5 必須使用 SEV v2"):
            validate_source_capacity_evidence_verification(record, handoff, receipt)

    def test_v5_supplemental_check_failure_controls_overall_result(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        draft["results"][0]["supplementalChecks"][0]["status"] = "failed"

        receipt = build_receiver_verification_receipt(
            handoff,
            draft["verificationAuthority"],
            draft["results"],
            issued_at="2026-08-07T12:00:00Z",
        )

        self.assertLess(receipt["results"][0]["capacityUtilizationRatio"], 1.0)
        self.assertEqual(receipt["results"][0]["status"], "failed")
        self.assertEqual(receipt["summary"], {"status": "failed", "passed": 0, "failed": 1})

    def test_v4_rejects_missing_structured_verification_scope(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        del draft["results"][0]["verificationScope"]

        with self.assertRaisesRegex(ValueError, "缺少逐列驗算範圍"):
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

    def test_v2_rejects_capacity_ratio_mismatch(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=2)
        receipt["results"][0]["capacityUtilizationRatio"] = 0.5
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "需求／核定承載力不一致"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_v2_rejects_manual_status_override(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=2)
        receipt["results"][0]["status"] = "failed"
        receipt["summary"] = {"status": "failed", "passed": 0, "failed": 1}
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "自動判定不一致"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_v3_rejects_tampered_capacity_evidence_hash(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        receipt["results"][0]["capacityEvidence"]["fileSha256"] = "not-a-sha256"
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "SHA-256 格式不正確"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_v3_rejects_capacity_evidence_filename_path(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        receipt["results"][0]["capacityEvidence"]["fileName"] = r"C:\\secret\\report.pdf"
        receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)

        with self.assertRaisesRegex(ValueError, "檔名不得包含路徑"):
            validate_receiver_verification_receipt(receipt, handoff)

    def test_assistant_derives_failed_status_from_demand_and_capacity(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        draft = self.receiver_receipt(handoff, schema_version=5)
        adopted_demand = draft["results"][0]["adoptedDemandTf"]
        draft["results"][0]["verifiedCapacityTf"] = adopted_demand / 1.25
        draft["results"][0]["capacityUtilizationRatio"] = 0.1
        draft["results"][0]["status"] = "passed"

        receipt = build_receiver_verification_receipt(
            handoff,
            draft["verificationAuthority"],
            draft["results"],
        )

        self.assertEqual(receipt["results"][0]["capacityUtilizationRatio"], 1.25)
        self.assertEqual(receipt["results"][0]["status"], "failed")
        self.assertEqual(receipt["summary"], {"status": "failed", "passed": 0, "failed": 1})

    def test_builds_source_capacity_evidence_verification_record(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)

        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {
                "organization": "來源端設計單位",
                "verifierName": "李工程師",
                "verifierRole": "設計覆核",
            },
            "逐列比對接收端正式檢核文件",
            self.source_evidence_matches(receipt),
            verified_at="2026-08-08T12:00:00Z",
        )

        self.assertRegex(record["verificationFingerprint"], r"^SEV-[0-9A-F]{20}$")
        self.assertEqual(record["summary"], {
            "status": "matched",
            "required": 1,
            "matched": 1,
            "fileNameDifferences": 0,
        })
        self.assertTrue(record["boundary"]["byteIdentityOnly"])
        self.assertEqual(record["checks"][0]["revision"], receipt["results"][0]["capacityEvidence"]["revision"])
        self.assertEqual(record["checks"][0]["issuedDate"], receipt["results"][0]["capacityEvidence"]["issuedDate"])
        self.assertEqual(
            validate_source_capacity_evidence_verification(record, handoff, receipt),
            record,
        )

    def test_rejects_source_evidence_record_when_actual_hash_differs(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        matches = self.source_evidence_matches(receipt)
        matches[0]["actualSha256"] = "b" * 64

        with self.assertRaisesRegex(ValueError, "與 RVR 記錄值不相符"):
            build_source_capacity_evidence_verification(
                handoff,
                receipt,
                {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
                "文件比對",
                matches,
            )

    def test_keeps_legacy_sev_v1_read_compatibility_for_pre_v5_receipt(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "文件比對",
            self.source_evidence_matches(receipt),
        )
        record["schemaVersion"] = 1
        for check in record["checks"]:
            check.pop("evidenceKey")
            check.pop("evidenceRole")
            check.pop("checkLabel")
        record["boundary"].pop("allReferencedEvidenceFilesCompared")
        record["verificationFingerprint"] = source_evidence_verification_fingerprint(record)

        self.assertEqual(
            validate_source_capacity_evidence_verification(record, handoff, receipt),
            record,
        )

    def test_rejects_tampered_source_evidence_verification_record(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "文件比對",
            self.source_evidence_matches(receipt),
        )
        record["checks"][0]["selectedFileName"] = "tampered.pdf"

        with self.assertRaisesRegex(ValueError, "內容與指紋不一致"):
            validate_source_capacity_evidence_verification(record, handoff, receipt)

    def test_rejects_source_evidence_record_with_rewritten_rvr_metadata(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "文件比對",
            self.source_evidence_matches(receipt),
        )
        record["checks"][0]["documentReference"] = "被改寫的文件"
        record["verificationFingerprint"] = source_evidence_verification_fingerprint(record)

        with self.assertRaisesRegex(ValueError, "RVR 文件受控欄位不一致"):
            validate_source_capacity_evidence_verification(record, handoff, receipt)

    def test_builds_and_attaches_source_evidence_offline_signature(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "文件比對",
            self.source_evidence_matches(receipt),
        )
        request = build_source_evidence_identity_signing_request(
            record,
            signed_at="2026-08-08T14:00:00Z",
        )
        private_key = Ed25519PrivateKey.generate()
        response = build_signature_response(request, private_key)
        signed_record = attach_source_evidence_identity_signature(record, response)

        self.assertRegex(request["requestFingerprint"], r"^SSR-[0-9A-F]{20}$")
        self.assertEqual(response["kind"], SOURCE_EVIDENCE_SIGNATURE_RESPONSE_KIND)
        self.assertEqual(signed_record["verificationFingerprint"], record["verificationFingerprint"])
        self.assertEqual(
            verify_source_evidence_identity_signature(signed_record)["status"],
            "valid-signature-untrusted-key",
        )
        public_key = private_key.public_key().public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
        trusted_key = {
            "keyId": receiver_identity_key_id(public_key),
            "organization": "來源端",
            "displayName": "來源端核驗金鑰",
            "status": "trusted",
        }
        self.assertTrue(verify_source_evidence_identity_signature(signed_record, [trusted_key])["trusted"])
        self.assertEqual(
            validate_source_capacity_evidence_verification(signed_record, handoff, receipt),
            signed_record,
        )

    def test_rejects_tampered_source_evidence_signing_request_and_signed_record(self) -> None:
        project = self.prepared_project()
        handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        receipt = self.receiver_receipt(handoff, schema_version=3)
        record = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {"organization": "來源端", "verifierName": "李工程師", "verifierRole": "覆核"},
            "文件比對",
            self.source_evidence_matches(receipt),
        )
        request = build_source_evidence_identity_signing_request(record)
        tampered_request = deepcopy(request)
        tampered_request["organization"] = "冒用單位"
        with self.assertRaisesRegex(ValueError, "欄位與實際簽署訊息不一致"):
            validate_source_evidence_identity_signing_request(tampered_request)

        response = build_signature_response(request, Ed25519PrivateKey.generate())
        signed_record = attach_source_evidence_identity_signature(record, response)
        signed_record["verificationBasis"] = "遭改寫"
        signed_record["verificationFingerprint"] = source_evidence_verification_fingerprint(signed_record)
        with self.assertRaisesRegex(ValueError, "SEV 身分數位簽章驗證失敗"):
            validate_source_capacity_evidence_verification(signed_record, handoff, receipt)

    def test_reuses_handoff_when_only_issue_time_changes(self) -> None:
        project = self.prepared_project()
        fingerprint = calculation_fingerprint(project)
        first = build_removal_transfer_handoff(project, fingerprint, generated_at="2026-08-07T10:00:00Z")
        second = build_removal_transfer_handoff(project, fingerprint, generated_at="2026-08-07T11:00:00Z")

        self.assertNotEqual(first["handoffFingerprint"], second["handoffFingerprint"])
        self.assertTrue(same_removal_transfer_handoff_content(first, second))


if __name__ == "__main__":
    unittest.main()
