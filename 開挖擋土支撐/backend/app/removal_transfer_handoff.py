from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import base64
import binascii
import hashlib
import hmac
import json
import math
import re
from typing import Any, Iterable

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .schemas import (
    BraceRow,
    CheckResult,
    ProjectState,
    SupportRow,
    normalized_removal_transfer_allocations,
)


HANDOFF_SCHEMA_VERSION = 3
RECEIPT_SCHEMA_VERSION = 1
SCHEMA_VERSION = HANDOFF_SCHEMA_VERSION
KIND = "excavation-removal-transfer-handoff"
RECEIPT_KIND = "receiver-capacity-verification-receipt"
RECEIPT_FINGERPRINT_PREFIX = "RVR"
IDENTITY_SIGNATURE_CONTEXT = "receiver-verification-identity-signature-v1"
IDENTITY_SIGNING_REQUEST_KIND = "receiver-verification-identity-signing-request"
IDENTITY_SIGNATURE_RESPONSE_KIND = "receiver-verification-identity-signature-response"
TRANSFER_MODE_LABELS = {
    "outside_scope": "本構件檢核範圍外（另案檢核）",
    "floor": "移轉至樓版",
    "reshore": "移轉至重撐／回撐",
    "permanent_structure": "移轉至永久結構",
    "other": "其他人工指定處置",
}

_COLLECTIONS = (
    ("top_supports", "support", "top", "上層水平支撐", "include_top_supports", "support_checks"),
    ("bottom_supports", "support", "bottom", "下層水平支撐", "include_bottom_supports", "support_checks"),
    ("top_braces", "brace", "top", "上層斜撐", "include_top_braces", "brace_checks"),
    ("bottom_braces", "brace", "bottom", "下層斜撐", "include_bottom_braces", "brace_checks"),
)


def _canonical_json(value: Any) -> str:
    def normalize(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, float) and math.isfinite(item) and item.is_integer():
            return int(item)
        return item

    return json.dumps(normalize(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(prefix: str, value: Any, length: int = 20) -> str:
    digest = hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()[:length].upper()
    return f"{prefix}-{digest}"


def _handoff_fingerprint(record: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in record.items() if key != "handoffFingerprint"}
    return _digest("ERH", unsigned)


def receiver_verification_receipt_fingerprint(record: dict[str, Any]) -> str:
    unsigned = {
        key: value
        for key, value in record.items()
        if key not in {"receiptFingerprint", "identitySignature"}
    }
    return _digest(RECEIPT_FINGERPRINT_PREFIX, unsigned)


def receiver_identity_key_id(public_key_bytes: bytes) -> str:
    if len(public_key_bytes) != 32:
        raise ValueError("Ed25519 公鑰必須為 32 bytes。")
    return f"RVK-{hashlib.sha256(public_key_bytes).hexdigest()[:20].upper()}"


def _receiver_identity_signing_payload_from_fields(
    *,
    receipt_fingerprint: str,
    handoff_fingerprint: str,
    source_calculation_fingerprint: str,
    organization: str,
    signed_at: str,
) -> bytes:
    payload = {
        "context": IDENTITY_SIGNATURE_CONTEXT,
        "signedAt": signed_at,
        "receiptFingerprint": receipt_fingerprint,
        "handoffFingerprint": handoff_fingerprint,
        "sourceCalculationFingerprint": source_calculation_fingerprint,
        "organization": organization.strip(),
    }
    return _canonical_json(payload).encode("utf-8")


def receiver_identity_signing_payload(receipt: dict[str, Any], signed_at: str) -> bytes:
    authority = receipt.get("verificationAuthority", {})
    return _receiver_identity_signing_payload_from_fields(
        receipt_fingerprint=str(receipt.get("receiptFingerprint", "")),
        handoff_fingerprint=str(receipt.get("handoffFingerprint", "")),
        source_calculation_fingerprint=str(receipt.get("sourceCalculationFingerprint", "")),
        organization=str(authority.get("organization", "")),
        signed_at=signed_at,
    )


def _receiver_identity_signing_request_fingerprint(request: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in request.items() if key != "requestFingerprint"}
    return _digest("RSR", unsigned)


def validate_receiver_identity_signing_request(
    request: dict[str, Any],
    receipt: dict[str, Any] | None = None,
    handoff: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise ValueError("RVR 身分簽署請求格式不正確。")
    if request.get("schemaVersion") != 1 or request.get("kind") != IDENTITY_SIGNING_REQUEST_KIND:
        raise ValueError("RVR 身分簽署請求版本或種類不受支援。")
    if request.get("algorithm") != "Ed25519" or request.get("payloadEncoding") != "base64":
        raise ValueError("RVR 身分簽署請求演算法或訊息編碼不受支援。")
    receipt_fingerprint = str(request.get("receiptFingerprint", ""))
    handoff_fingerprint = str(request.get("handoffFingerprint", ""))
    source_fingerprint = str(request.get("sourceCalculationFingerprint", ""))
    if not re.fullmatch(r"RVR-[0-9A-F]{20}", receipt_fingerprint):
        raise ValueError("RVR 身分簽署請求缺少有效回簽指紋。")
    if not re.fullmatch(r"ERH-[0-9A-F]{20}", handoff_fingerprint):
        raise ValueError("RVR 身分簽署請求缺少有效交接指紋。")
    if not re.fullmatch(r"CF-[0-9A-F]{16}", source_fingerprint):
        raise ValueError("RVR 身分簽署請求缺少有效來源計算指紋。")
    organization = _required_text(request.get("organization"), "簽署請求單位", max_length=120)
    signed_at = _required_text(request.get("signedAt"), "簽署請求時間", max_length=40)
    try:
        datetime.fromisoformat(signed_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("RVR 身分簽署請求時間不是有效 ISO 8601 日期時間。") from exc
    expected_payload = _receiver_identity_signing_payload_from_fields(
        receipt_fingerprint=receipt_fingerprint,
        handoff_fingerprint=handoff_fingerprint,
        source_calculation_fingerprint=source_fingerprint,
        organization=organization,
        signed_at=signed_at,
    )
    try:
        payload = base64.b64decode(
            _required_text(request.get("payloadBase64"), "簽署訊息", max_length=1000),
            validate=True,
        )
    except (binascii.Error, ValueError) as exc:
        raise ValueError("RVR 身分簽署請求的訊息不是有效 Base64。") from exc
    if not hmac.compare_digest(payload, expected_payload):
        raise ValueError("RVR 身分簽署請求的欄位與實際簽署訊息不一致。")
    fingerprint = str(request.get("requestFingerprint", ""))
    if not re.fullmatch(r"RSR-[0-9A-F]{20}", fingerprint) or not hmac.compare_digest(
        fingerprint,
        _receiver_identity_signing_request_fingerprint(request),
    ):
        raise ValueError("RVR 身分簽署請求內容與請求指紋不一致。")
    if receipt is not None:
        if (
            receipt_fingerprint != str(receipt.get("receiptFingerprint", ""))
            or handoff_fingerprint != str(receipt.get("handoffFingerprint", ""))
            or source_fingerprint != str(receipt.get("sourceCalculationFingerprint", ""))
            or organization != str(receipt.get("verificationAuthority", {}).get("organization", "")).strip()
        ):
            raise ValueError("RVR 身分簽署請求與目前回簽內容不一致。")
    if handoff is not None and (
        handoff_fingerprint != str(handoff.get("handoffFingerprint", ""))
        or source_fingerprint != str(handoff.get("source", {}).get("calculationFingerprint", ""))
    ):
        raise ValueError("RVR 身分簽署請求與目前 ERH 交接內容不一致。")
    return deepcopy(request)


def build_receiver_identity_signing_request(
    receipt: dict[str, Any],
    handoff: dict[str, Any],
    *,
    signed_at: str | None = None,
) -> dict[str, Any]:
    validated_handoff = validate_removal_transfer_handoff(handoff)
    validated_receipt = validate_receiver_verification_receipt(receipt, validated_handoff)
    requested_at = signed_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = receiver_identity_signing_payload(validated_receipt, requested_at)
    request = {
        "schemaVersion": 1,
        "kind": IDENTITY_SIGNING_REQUEST_KIND,
        "algorithm": "Ed25519",
        "payloadEncoding": "base64",
        "signedAt": requested_at,
        "receiptFingerprint": validated_receipt["receiptFingerprint"],
        "handoffFingerprint": validated_receipt["handoffFingerprint"],
        "sourceCalculationFingerprint": validated_receipt["sourceCalculationFingerprint"],
        "organization": validated_receipt["verificationAuthority"]["organization"].strip(),
        "payloadBase64": base64.b64encode(payload).decode("ascii"),
    }
    request["requestFingerprint"] = _receiver_identity_signing_request_fingerprint(request)
    return validate_receiver_identity_signing_request(request, validated_receipt, validated_handoff)


def attach_receiver_identity_signature(
    receipt: dict[str, Any],
    handoff: dict[str, Any],
    signature_response: dict[str, Any],
) -> dict[str, Any]:
    validated_handoff = validate_removal_transfer_handoff(handoff)
    validated_receipt = validate_receiver_verification_receipt(receipt, validated_handoff)
    if not isinstance(signature_response, dict):
        raise ValueError("RVR 身分簽章回應格式不正確。")
    if (
        signature_response.get("schemaVersion") != 1
        or signature_response.get("kind") != IDENTITY_SIGNATURE_RESPONSE_KIND
    ):
        raise ValueError("RVR 身分簽章回應版本或種類不受支援。")
    signing_request = validate_receiver_identity_signing_request(
        signature_response.get("signingRequest"),
        validated_receipt,
        validated_handoff,
    )
    signature = signature_response.get("signature")
    if not isinstance(signature, dict):
        raise ValueError("RVR 身分簽章回應缺少簽章資料。")
    if signature.get("algorithm") != "Ed25519":
        raise ValueError("RVR 身分簽章回應的簽章演算法不受支援。")
    signed_receipt = deepcopy(validated_receipt)
    signed_receipt["identitySignature"] = {
        "schemaVersion": 1,
        "algorithm": "Ed25519",
        "keyId": signature.get("keyId"),
        "publicKeyBase64": signature.get("publicKeyBase64"),
        "signedAt": signing_request["signedAt"],
        "signatureBase64": signature.get("signatureBase64"),
    }
    validate_receiver_verification_receipt(signed_receipt, validated_handoff)
    verify_receiver_identity_signature(signed_receipt)
    return signed_receipt


def verify_receiver_identity_signature(
    receipt: dict[str, Any],
    trusted_keys: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    signature_record = receipt.get("identitySignature")
    if signature_record is None:
        return {
            "status": "manual-review-required",
            "signaturePresent": False,
            "cryptographicValid": False,
            "trusted": False,
            "keyId": None,
            "message": "RVR 內容完整，但未附數位簽章；回簽單位與人員身分仍須人工核對。",
        }
    if not isinstance(signature_record, dict):
        raise ValueError("RVR 身分簽章格式不正確。")
    if signature_record.get("schemaVersion") != 1 or signature_record.get("algorithm") != "Ed25519":
        raise ValueError("RVR 身分簽章版本或演算法不受支援。")
    signed_at = _required_text(signature_record.get("signedAt"), "簽章時間", max_length=40)
    try:
        datetime.fromisoformat(signed_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("RVR 身分簽章時間不是有效 ISO 8601 日期時間。") from exc
    try:
        public_key_bytes = base64.b64decode(
            _required_text(signature_record.get("publicKeyBase64"), "簽章公鑰", max_length=80),
            validate=True,
        )
        signature_bytes = base64.b64decode(
            _required_text(signature_record.get("signatureBase64"), "簽章值", max_length=120),
            validate=True,
        )
    except (binascii.Error, ValueError) as exc:
        raise ValueError("RVR 身分簽章的公鑰或簽章值不是有效 Base64。") from exc
    if len(public_key_bytes) != 32 or len(signature_bytes) != 64:
        raise ValueError("RVR 身分簽章的 Ed25519 公鑰或簽章長度不正確。")
    key_id = receiver_identity_key_id(public_key_bytes)
    if not hmac.compare_digest(str(signature_record.get("keyId", "")), key_id):
        raise ValueError("RVR 身分簽章的公鑰識別與實際公鑰不一致。")
    try:
        Ed25519PublicKey.from_public_bytes(public_key_bytes).verify(
            signature_bytes,
            receiver_identity_signing_payload(receipt, signed_at),
        )
    except InvalidSignature as exc:
        raise ValueError("RVR 身分數位簽章驗證失敗，內容、簽章時間或簽章值可能已變更。") from exc

    trusted_key = next((item for item in trusted_keys if item.get("keyId") == key_id), None)
    base_result = {
        "signaturePresent": True,
        "cryptographicValid": True,
        "trusted": False,
        "keyId": key_id,
        "signedAt": signed_at,
    }
    if trusted_key is None:
        return {
            **base_result,
            "status": "valid-signature-untrusted-key",
            "message": "數位簽章有效，但此公鑰尚未列入本機信任清冊；回簽身分仍須人工核對。",
        }
    if trusted_key.get("status") != "trusted":
        return {
            **base_result,
            "status": "valid-signature-revoked-key",
            "message": "數位簽章有效，但此公鑰已撤銷；不得視為受信任回簽。",
        }
    receipt_organization = str(receipt.get("verificationAuthority", {}).get("organization", "")).strip()
    trusted_organization = str(trusted_key.get("organization", "")).strip()
    if not hmac.compare_digest(trusted_organization.encode("utf-8"), receipt_organization.encode("utf-8")):
        return {
            **base_result,
            "status": "valid-signature-organization-mismatch",
            "message": "數位簽章有效，但 RVR 驗證單位與信任清冊登錄單位不一致。",
        }
    return {
        **base_result,
        "status": "trusted-signature-valid",
        "trusted": True,
        "trustedOrganization": trusted_key.get("organization"),
        "keyLabel": trusted_key.get("displayName"),
        "message": "RVR 內容完整，且回簽單位的受信任 Ed25519 數位簽章驗證通過。",
    }


def _transfer_id(transfer: dict[str, Any], calculation_fingerprint: str) -> str:
    return _digest("ERT", {"sourceCalculationFingerprint": calculation_fingerprint, "transfer": transfer})


def _iter_rows_with_checks(project: ProjectState) -> Iterable[tuple[str, str, str, str, int, SupportRow | BraceRow, CheckResult]]:
    if project.calculation_results is None:
        raise ValueError("尚未完成最新計算，無法建立拆撐承接構造交接檔。")
    cursors = {"support_checks": 0, "brace_checks": 0}
    for collection, member_type, side, module_name, option_name, checks_name in _COLLECTIONS:
        if not bool(getattr(project.calculation_options, option_name)):
            continue
        rows = list(getattr(project, collection))
        checks = list(getattr(project.calculation_results, checks_name))
        for row_index, row in enumerate(rows):
            cursor = cursors[checks_name]
            if cursor >= len(checks):
                raise ValueError(f"{module_name}的計算結果與輸入列數不一致，請重新計算。")
            yield collection, member_type, side, module_name, row_index, row, checks[cursor]
            cursors[checks_name] = cursor + 1


def _control_case(row: SupportRow | BraceRow) -> Any:
    control_index = row.analysis_control_stage_index
    control_label = row.analysis_control_stage_label.strip()
    for case in row.analysis_stage_cases:
        if case.stage_index == control_index and case.stage_label.strip() == control_label:
            return case
    raise ValueError(f"{row.level_label or '未命名構件'}缺少可重現的控制分析階段。")


def _build_transfer(
    *,
    collection: str,
    member_type: str,
    side: str,
    module_name: str,
    row_index: int,
    row: SupportRow | BraceRow,
    check: CheckResult,
    allocation: dict[str, Any],
    calculation_fingerprint: str,
) -> dict[str, Any]:
    if check.status == "NG":
        raise ValueError(f"{module_name}第 {row_index + 1} 列尚未形成可交接的有效檢核結果。")
    if row.force_source != "analysis_import" or row.analysis_removal_stage_index is None:
        raise ValueError(f"{module_name}第 {row_index + 1} 列不是具拆撐階段的外部分析列。")
    mode = str(allocation["mode"])
    if mode not in TRANSFER_MODE_LABELS or not row.removal_transfer_confirmed:
        raise ValueError(f"{module_name}第 {row_index + 1} 列尚未確認拆撐後荷重處置。")
    if not str(allocation["basis"]).strip():
        raise ValueError(f"{module_name}第 {row_index + 1} 列缺少拆撐處置依據。")
    if not str(allocation["direction"]).strip():
        raise ValueError(f"{module_name}第 {row_index + 1} 列缺少傳力方向或作用線。")
    if mode != "outside_scope" and not str(allocation["target"]).strip():
        raise ValueError(f"{module_name}第 {row_index + 1} 列缺少承接構造或指定對象。")
    share_percent = float(allocation["share_percent"])
    if not math.isfinite(share_percent) or share_percent <= 0 or share_percent > 100:
        raise ValueError(f"{module_name}第 {row_index + 1} 列的承接分配比例不正確。")

    control = _control_case(row)
    axial_force = float(control.axial_force_t)
    if not math.isfinite(axial_force) or axial_force < 0:
        raise ValueError(f"{module_name}第 {row_index + 1} 列的控制軸力不是非負有限數值。")
    if member_type == "support":
        design_axial_force = float(check.details.get("total_force_t", axial_force))
    else:
        design_axial_force = float(check.details.get("axial_force_t", axial_force))
    receiver_demand = design_axial_force * share_percent / 100.0

    transfer = {
        "sourceMember": {
            "collection": collection,
            "memberType": member_type,
            "side": side,
            "rowIndex": row_index,
            "moduleName": module_name,
            "levelLabel": row.level_label,
            "sectionName": row.section_name,
        },
        "lifecycle": {
            "installationStage": {
                "index": row.analysis_install_stage_index,
                "label": row.analysis_install_stage_label,
            },
            "controlStage": {
                "index": control.stage_index,
                "label": control.stage_label,
            },
            "removalStage": {
                "index": row.analysis_removal_stage_index,
                "label": row.analysis_removal_stage_label,
            },
            "constructionStep": row.construction_step_label,
            "mappingBasis": row.analysis_mapping_basis,
        },
        "sourceDemand": {
            "unit": "tf",
            "analysisControlAxialForceTf": round(axial_force, 6),
            "memberDesignAxialForceTf": round(design_axial_force, 6),
            "receiverTransferDemandTf": round(receiver_demand, 6),
            "allocationSharePercent": round(share_percent, 6),
            "analysisCases": [
                {
                    "stageIndex": case.stage_index,
                    "stageLabel": case.stage_label,
                    "axialForceTf": round(float(case.axial_force_t), 6),
                }
                for case in row.analysis_stage_cases
            ],
            "basis": "承接設計需求取來源構件設計軸力；承接構造之實際分配、偏心及載重組合仍待接收端驗證。",
        },
        "receiver": {
            "mode": mode,
            "modeLabel": TRANSFER_MODE_LABELS[mode],
            "target": str(allocation["target"]).strip(),
            "direction": str(allocation["direction"]).strip(),
            "dispositionBasis": str(allocation["basis"]).strip(),
            "receiverIdentityRequired": mode == "outside_scope" and not str(allocation["target"]).strip(),
        },
        "sourceCheck": {
            "status": check.status,
            "formulaId": check.formula_id,
            "utilizationRatio": check.utilization_ratio,
            "controllingCondition": check.controlling_condition,
        },
        "verification": {
            "status": "pending",
            "required": True,
            "autoVerified": False,
            "acceptedReceiptKind": RECEIPT_KIND,
        },
    }
    transfer["transferId"] = _transfer_id(transfer, calculation_fingerprint)
    return transfer


def build_removal_transfer_handoff(
    project: ProjectState,
    calculation_fingerprint: str,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    if not re.fullmatch(r"CF-[0-9A-F]{16}", calculation_fingerprint):
        raise ValueError("缺少有效的來源計算指紋，無法建立拆撐承接構造交接檔。")

    transfers: list[dict[str, Any]] = []
    for collection, member_type, side, module_name, row_index, row, check in _iter_rows_with_checks(project):
        if row.analysis_removal_stage_index is None:
            continue
        allocations = normalized_removal_transfer_allocations(row)
        if not allocations:
            raise ValueError(f"{module_name}第 {row_index + 1} 列缺少拆撐承接分配資料。")
        total_share = sum(float(allocation["share_percent"]) for allocation in allocations)
        if not math.isclose(total_share, 100.0, rel_tol=0.0, abs_tol=0.01):
            raise ValueError(
                f"{module_name}第 {row_index + 1} 列的拆撐承接分配比例合計必須為 100%，目前為 {total_share:g}%。"
            )
        for allocation in allocations:
            transfers.append(_build_transfer(
                collection=collection,
                member_type=member_type,
                side=side,
                module_name=module_name,
                row_index=row_index,
                row=row,
                check=check,
                allocation=allocation,
                calculation_fingerprint=calculation_fingerprint,
            ))
    if not transfers:
        raise ValueError("目前沒有已完成計算且已確認拆撐處置的支撐或斜撐可建立交接檔。")

    record = {
        "schemaVersion": HANDOFF_SCHEMA_VERSION,
        "kind": KIND,
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "toolId": "excavation-support",
            "toolName": "開挖擋土支撐工具",
            "toolVersion": "v0.1.0",
            "projectId": project.metadata.id or "",
            "projectName": project.metadata.name,
            "projectNo": project.metadata.project_code,
            "calculationFingerprint": calculation_fingerprint,
        },
        "transfers": transfers,
        "verificationSummary": {
            "status": "pending",
            "required": len(transfers),
            "verified": 0,
            "receiptKind": RECEIPT_KIND,
        },
        "receiptContract": {
            "schemaVersion": RECEIPT_SCHEMA_VERSION,
            "kind": RECEIPT_KIND,
            "fingerprintAlgorithm": "RVR-SHA256-canonical-json-first-20-uppercase",
            "coverage": "all-ERT-transfers-required",
            "verifierIdentityAuthentication": "manual-review-or-ed25519-trust-registry",
        },
        "boundary": {
            "requiresReceiverVerification": True,
            "autoApplied": False,
            "autoVerified": False,
            "scope": "本檔交接拆撐來源構件、生命週期、控制軸力、承接設計需求及人工採用的承接對象與傳力方向；不代表樓版、重撐、永久結構或其他承接構造已完成容量、方向正確性、分配、偏心或載重組合檢核。",
        },
    }
    record["handoffFingerprint"] = _handoff_fingerprint(record)
    return validate_removal_transfer_handoff(record)


def validate_removal_transfer_handoff(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError("拆撐承接構造交接檔格式不正確。")
    schema_version = record.get("schemaVersion")
    if (
        isinstance(schema_version, bool)
        or schema_version not in {1, 2, HANDOFF_SCHEMA_VERSION}
        or record.get("kind") != KIND
    ):
        raise ValueError("拆撐承接構造交接檔版本或種類不受支援。")
    if not re.fullmatch(r"CF-[0-9A-F]{16}", str(record.get("source", {}).get("calculationFingerprint", ""))):
        raise ValueError("拆撐承接構造交接檔缺少有效來源計算指紋。")
    fingerprint = str(record.get("handoffFingerprint", ""))
    if not re.fullmatch(r"ERH-[0-9A-F]{20}", fingerprint) or fingerprint != _handoff_fingerprint(record):
        raise ValueError("拆撐承接構造交接內容與交接指紋不一致。")
    transfers = record.get("transfers")
    if not isinstance(transfers, list) or not transfers:
        raise ValueError("拆撐承接構造交接檔沒有可驗證的交接列。")
    source_fingerprint = str(record["source"]["calculationFingerprint"])
    seen_ids: set[str] = set()
    allocation_groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for transfer in transfers:
        transfer_id = str(transfer.get("transferId", ""))
        unsigned = {key: value for key, value in transfer.items() if key != "transferId"}
        if transfer_id != _transfer_id(unsigned, source_fingerprint) or transfer_id in seen_ids:
            raise ValueError("拆撐承接構造交接列識別或內容不一致。")
        seen_ids.add(transfer_id)
        if schema_version in {2, HANDOFF_SCHEMA_VERSION}:
            source_demand = transfer.get("sourceDemand", {})
            receiver = transfer.get("receiver", {})
            demand = source_demand.get("receiverTransferDemandTf")
            if isinstance(demand, bool) or not isinstance(demand, (int, float)) or not math.isfinite(demand) or demand < 0:
                raise ValueError("拆撐交接列缺少非負有限的承接設計需求。")
            _required_text(receiver.get("direction"), "拆撐傳力方向", max_length=120)
        if schema_version == HANDOFF_SCHEMA_VERSION:
            share = source_demand.get("allocationSharePercent")
            if isinstance(share, bool) or not isinstance(share, (int, float)) or not math.isfinite(share) or share <= 0 or share > 100:
                raise ValueError("拆撐交接列缺少有效的承接分配比例。")
            source_member = transfer.get("sourceMember", {})
            group_key = (
                str(source_member.get("collection", "")),
                str(source_member.get("rowIndex", "")),
                str(source_member.get("memberType", "")),
            )
            allocation_groups.setdefault(group_key, []).append(transfer)
        verification = transfer.get("verification", {})
        if verification.get("status") != "pending" or verification.get("required") is not True or verification.get("autoVerified") is not False:
            raise ValueError("未回簽的拆撐交接列必須維持待驗證，且不得自動標示完成。")
    for group in allocation_groups.values():
        total_share = sum(float(item["sourceDemand"]["allocationSharePercent"]) for item in group)
        if not math.isclose(total_share, 100.0, rel_tol=0.0, abs_tol=0.01):
            raise ValueError("同一拆撐來源的承接分配比例合計必須為 100%。")
        identities = [
            (
                str(item["receiver"].get("mode", "")),
                str(item["receiver"].get("target", "")).casefold(),
                str(item["receiver"].get("direction", "")).casefold(),
            )
            for item in group
        ]
        if len(set(identities)) != len(identities):
            raise ValueError("同一拆撐來源含重複的承接對象與傳力方向。")
    boundary = record.get("boundary", {})
    if boundary.get("requiresReceiverVerification") is not True or boundary.get("autoApplied") is not False or boundary.get("autoVerified") is not False:
        raise ValueError("拆撐承接構造交接檔未保留接收端明確驗證邊界。")
    receipt_contract = record.get("receiptContract", {})
    if (
        receipt_contract.get("schemaVersion") != RECEIPT_SCHEMA_VERSION
        or receipt_contract.get("kind") != RECEIPT_KIND
        or receipt_contract.get("coverage") != "all-ERT-transfers-required"
        or receipt_contract.get("verifierIdentityAuthentication") not in {
            "manual-review-required",
            "manual-review-or-ed25519-trust-registry",
        }
    ):
        raise ValueError("拆撐承接構造交接檔缺少受控回簽契約。")
    return deepcopy(record)


def same_removal_transfer_handoff_content(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Compare issued handoffs without treating issuance time as engineering content."""
    ignored = {"generatedAt", "handoffFingerprint"}
    left_payload = {key: value for key, value in left.items() if key not in ignored}
    right_payload = {key: value for key, value in right.items() if key not in ignored}
    return hmac.compare_digest(
        _canonical_json(left_payload).encode("utf-8"),
        _canonical_json(right_payload).encode("utf-8"),
    )


def _required_text(value: Any, field_name: str, *, max_length: int = 240) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"承接構造回簽缺少{field_name}。")
    if len(text) > max_length:
        raise ValueError(f"承接構造回簽的{field_name}過長。")
    return text


def _finite_nonnegative(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"承接構造回簽的{field_name}不是有效數值。")
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"承接構造回簽的{field_name}不是非負有限數值。")
    return number


def validate_receiver_verification_receipt(
    receipt: dict[str, Any],
    handoff: dict[str, Any],
) -> dict[str, Any]:
    """Validate the receiver result content; identity trust is evaluated separately."""
    validated_handoff = validate_removal_transfer_handoff(handoff)
    if not isinstance(receipt, dict):
        raise ValueError("承接構造回簽格式不正確。")
    if receipt.get("schemaVersion") != RECEIPT_SCHEMA_VERSION or receipt.get("kind") != RECEIPT_KIND:
        raise ValueError("承接構造回簽版本或種類不受支援。")

    fingerprint = str(receipt.get("receiptFingerprint", ""))
    expected_fingerprint = receiver_verification_receipt_fingerprint(receipt)
    if not re.fullmatch(r"RVR-[0-9A-F]{20}", fingerprint) or not hmac.compare_digest(
        fingerprint,
        expected_fingerprint,
    ):
        raise ValueError("承接構造回簽內容與回簽指紋不一致。")
    if not hmac.compare_digest(
        str(receipt.get("handoffFingerprint", "")),
        str(validated_handoff["handoffFingerprint"]),
    ):
        raise ValueError("承接構造回簽所指向的 ERH 交接版本不存在或不一致。")
    if not hmac.compare_digest(
        str(receipt.get("sourceCalculationFingerprint", "")),
        str(validated_handoff["source"]["calculationFingerprint"]),
    ):
        raise ValueError("承接構造回簽的來源計算指紋與 ERH 交接檔不一致。")

    issued_at = _required_text(receipt.get("issuedAt"), "回簽時間", max_length=40)
    try:
        datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("承接構造回簽時間不是有效 ISO 8601 日期時間。") from exc

    authority = receipt.get("verificationAuthority")
    if not isinstance(authority, dict):
        raise ValueError("承接構造回簽缺少驗證單位與人員資料。")
    _required_text(authority.get("organization"), "驗證單位", max_length=120)
    _required_text(authority.get("verifierName"), "驗證人員", max_length=80)
    _required_text(authority.get("verifierRole"), "驗證人員職責", max_length=80)
    _required_text(authority.get("reportReference"), "正式檢核文件編號", max_length=160)

    results = receipt.get("results")
    if not isinstance(results, list) or not results:
        raise ValueError("承接構造回簽沒有逐筆驗證結果。")
    required_ids = {str(item["transferId"]) for item in validated_handoff["transfers"]}
    received_ids: set[str] = set()
    passed = 0
    failed = 0
    for result in results:
        if not isinstance(result, dict):
            raise ValueError("承接構造回簽包含格式不正確的逐筆結果。")
        transfer_id = str(result.get("transferId", ""))
        if transfer_id not in required_ids or transfer_id in received_ids:
            raise ValueError("承接構造回簽的 ERT 交接列不存在、重複或不屬於指定 ERH。")
        received_ids.add(transfer_id)
        status = result.get("status")
        if status not in {"passed", "failed"}:
            raise ValueError("承接構造回簽逐筆狀態只允許 passed 或 failed。")
        _required_text(result.get("receiverTarget"), "承接構造識別", max_length=160)
        _required_text(result.get("verificationBasis"), "逐筆檢核依據")
        _required_text(result.get("conclusion"), "逐筆檢核結論")
        adopted_demand = _finite_nonnegative(result.get("adoptedDemandTf"), "採用需求值")
        if validated_handoff.get("schemaVersion") in {2, HANDOFF_SCHEMA_VERSION}:
            transfer = next(item for item in validated_handoff["transfers"] if item["transferId"] == transfer_id)
            minimum_demand = float(transfer["sourceDemand"]["receiverTransferDemandTf"])
            if adopted_demand + 1e-9 < minimum_demand:
                raise ValueError("承接構造回簽採用需求不得小於 ERH 交接的承接設計需求。")
        ratio = _finite_nonnegative(result.get("capacityUtilizationRatio"), "容量利用率")
        if status == "passed" and ratio > 1.0 + 1e-9:
            raise ValueError("承接構造回簽將容量利用率大於 1 的結果標示為 passed。")
        if status == "passed":
            passed += 1
        else:
            failed += 1
    if received_ids != required_ids:
        raise ValueError("承接構造回簽未完整涵蓋指定 ERH 的全部 ERT 交接列。")

    summary = receipt.get("summary")
    expected_status = "passed" if failed == 0 else "failed"
    if not isinstance(summary, dict) or summary.get("status") != expected_status:
        raise ValueError("承接構造回簽彙整狀態與逐筆結果不一致。")
    if summary.get("passed") != passed or summary.get("failed") != failed:
        raise ValueError("承接構造回簽彙整筆數與逐筆結果不一致。")

    boundary = receipt.get("boundary")
    if not isinstance(boundary, dict):
        raise ValueError("承接構造回簽缺少責任邊界。")
    if (
        boundary.get("receiverCalculationCompleted") is not True
        or boundary.get("sourceToolDidNotAutoVerify") is not True
        or boundary.get("verifierIdentityRequiresManualReview") is not True
    ):
        raise ValueError("承接構造回簽未保留接收端計算與回簽人身分核對邊界。")
    return deepcopy(receipt)


def build_receiver_verification_receipt(
    handoff: dict[str, Any],
    verification_authority: dict[str, Any],
    results: list[dict[str, Any]],
    *,
    issued_at: str | None = None,
) -> dict[str, Any]:
    """Build a minimal controlled RVR receipt from receiver-entered results."""
    validated_handoff = validate_removal_transfer_handoff(handoff)
    authority = {
        "organization": verification_authority.get("organization", ""),
        "verifierName": verification_authority.get("verifierName", ""),
        "verifierRole": verification_authority.get("verifierRole", ""),
        "reportReference": verification_authority.get("reportReference", ""),
    }
    controlled_results = [
        {
            "transferId": result.get("transferId", ""),
            "status": result.get("status", ""),
            "receiverTarget": result.get("receiverTarget", ""),
            "adoptedDemandTf": result.get("adoptedDemandTf"),
            "capacityUtilizationRatio": result.get("capacityUtilizationRatio"),
            "verificationBasis": result.get("verificationBasis", ""),
            "conclusion": result.get("conclusion", ""),
        }
        for result in results
        if isinstance(result, dict)
    ]
    passed = sum(result["status"] == "passed" for result in controlled_results)
    failed = sum(result["status"] == "failed" for result in controlled_results)
    receipt = {
        "schemaVersion": RECEIPT_SCHEMA_VERSION,
        "kind": RECEIPT_KIND,
        "issuedAt": issued_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "handoffFingerprint": validated_handoff["handoffFingerprint"],
        "sourceCalculationFingerprint": validated_handoff["source"]["calculationFingerprint"],
        "verificationAuthority": authority,
        "results": controlled_results,
        "summary": {
            "status": "passed" if failed == 0 and passed == len(controlled_results) else "failed",
            "passed": passed,
            "failed": failed,
        },
        "boundary": {
            "receiverCalculationCompleted": True,
            "sourceToolDidNotAutoVerify": True,
            "verifierIdentityRequiresManualReview": True,
        },
    }
    receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)
    return validate_receiver_verification_receipt(receipt, validated_handoff)


__all__ = [
    "SCHEMA_VERSION",
    "KIND",
    "RECEIPT_KIND",
    "IDENTITY_SIGNING_REQUEST_KIND",
    "IDENTITY_SIGNATURE_RESPONSE_KIND",
    "attach_receiver_identity_signature",
    "build_removal_transfer_handoff",
    "build_receiver_identity_signing_request",
    "build_receiver_verification_receipt",
    "receiver_verification_receipt_fingerprint",
    "receiver_identity_key_id",
    "receiver_identity_signing_payload",
    "same_removal_transfer_handoff_content",
    "validate_removal_transfer_handoff",
    "validate_receiver_identity_signing_request",
    "validate_receiver_verification_receipt",
    "verify_receiver_identity_signature",
]
