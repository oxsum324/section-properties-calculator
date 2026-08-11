from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import math
from typing import Any

from .calculations import allowable_axial_stress
from .removal_transfer_handoff import validate_removal_transfer_handoff
from .schemas import ReshoreMemberCapacityInput, SectionProperty
from .workbook_loader import find_section


SCHEMA_VERSION = 1
KIND = "excavation-reshore-member-capacity-calculation"
FINGERPRINT_PREFIX = "RSC"
STEEL_CODE_PAGE_URL = "https://www.nlma.gov.tw/ch/legislation/regsearch/7176"
STEEL_CODE_CHAPTER_4_URL = "https://www.nlma.gov.tw/uploads/files/e7c2c9d73eefc69beecde12336374b9b.pdf"
STEEL_CODE_CHAPTER_6_URL = "https://www.nlma.gov.tw/uploads/files/e139e8d278188c817090a2510017202e.pdf"


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


def _digest(value: Any) -> str:
    digest = hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()[:20].upper()
    return f"{FINGERPRINT_PREFIX}-{digest}"


def _rounded(value: float) -> float:
    return round(float(value), 6)


def _section_snapshot(section: SectionProperty) -> dict[str, Any]:
    return {
        "name": section.name,
        "depthCm": _rounded(section.depth_cm),
        "flangeWidthCm": _rounded(section.flange_width_cm),
        "webThicknessCm": _rounded(section.web_thickness_cm),
        "flangeThicknessCm": _rounded(section.flange_thickness_cm),
        "areaCm2": _rounded(section.area_cm2),
        "rxCm": _rounded(section.rx_cm),
        "ryCm": _rounded(section.ry_cm),
    }


def _input_snapshot(value: ReshoreMemberCapacityInput) -> dict[str, Any]:
    return {
        "sectionName": value.section_name.strip(),
        "memberCount": value.member_count,
        "unbracedLengthXM": _rounded(value.unbraced_length_x_m),
        "unbracedLengthYM": _rounded(value.unbraced_length_y_m),
        "effectiveLengthFactorKx": _rounded(value.effective_length_factor_kx),
        "effectiveLengthFactorKy": _rounded(value.effective_length_factor_ky),
        "fyTfPerCm2": _rounded(value.fy_tf_per_cm2),
        "eTfPerCm2": _rounded(value.e_tf_per_cm2),
        "allowableStressIncreaseFactor": _rounded(value.allowable_stress_increase_factor),
        "imbalanceFactor": _rounded(value.imbalance_factor),
        "additionalAxialLoadTfPerMember": _rounded(value.additional_axial_load_tf_per_member),
        "governingLoadCombination": value.governing_load_combination.strip(),
        "effectiveLengthBasis": value.effective_length_basis.strip(),
        "loadDistributionBasis": value.load_distribution_basis.strip(),
        "additionalLoadBasis": value.additional_load_basis.strip(),
        "stressIncreaseBasis": value.stress_increase_basis.strip(),
        "pureAxialNoEccentricityConfirmed": value.pure_axial_no_eccentricity_confirmed,
    }


def _validate_input_basis(value: ReshoreMemberCapacityInput) -> None:
    required_texts = (
        (value.governing_load_combination, "控制載重組合"),
        (value.effective_length_basis, "有效長度與側向支撐依據"),
        (value.load_distribution_basis, "共同支數、傳力方向與分配依據"),
    )
    for text, label in required_texts:
        if not text.strip():
            raise ValueError(f"{label}不得空白。")
    if value.allowable_stress_increase_factor == 1.25 and not value.stress_increase_basis.strip():
        raise ValueError("採用 1.25 容許應力提高係數時，必須填寫載重組合及提高依據。")
    if value.additional_axial_load_tf_per_member > 0 and not value.additional_load_basis.strip():
        raise ValueError("另加單支軸力大於 0 時，必須填寫其來源與計算依據。")


def _resolve_transfer(handoff: dict[str, Any], transfer_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    validated_handoff = validate_removal_transfer_handoff(handoff)
    transfer = next(
        (item for item in validated_handoff["transfers"] if item.get("transferId") == transfer_id),
        None,
    )
    if transfer is None:
        raise ValueError("指定的承接列不存在於目前 ERH 交接檔。")
    if transfer.get("receiver", {}).get("mode") != "reshore":
        raise ValueError("H 型鋼重撐／回撐容量模組只接受 receiver.mode=reshore 的承接列。")
    return validated_handoff, transfer


def calculate_reshore_member_capacity(
    handoff: dict[str, Any],
    transfer_id: str,
    calculation_input: ReshoreMemberCapacityInput,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Calculate pure axial H-section reshore capacity without expanding receiver scope."""
    validated_handoff, transfer = _resolve_transfer(handoff, transfer_id)
    _validate_input_basis(calculation_input)
    try:
        section = find_section(calculation_input.section_name)
    except KeyError as exc:
        raise ValueError(str(exc)) from exc

    normalized_section_name = section.name.upper().replace(" ", "").replace("-", "")
    if not normalized_section_name.startswith(("H", "RH")):
        raise ValueError("本模組只接受參考資料庫中的 H 型鋼或 RH 型鋼斷面。")

    if min(section.area_cm2, section.rx_cm, section.ry_cm) <= 0:
        raise ValueError("型鋼資料的面積或迴轉半徑不是正值。")
    if min(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
    ) <= 0:
        raise ValueError("型鋼資料的幾何尺寸不是正值。")

    value = calculation_input
    demand_tf = float(transfer["sourceDemand"]["receiverTransferDemandTf"])
    klr_x = value.effective_length_factor_kx * value.unbraced_length_x_m * 100.0 / section.rx_cm
    klr_y = value.effective_length_factor_ky * value.unbraced_length_y_m * 100.0 / section.ry_cm
    klr_max = max(klr_x, klr_y)
    controlling_axis = "X" if klr_x >= klr_y else "Y"
    cc = math.sqrt(2.0 * math.pi**2 * value.e_tf_per_cm2 / value.fy_tf_per_cm2)
    base_allowable_stress = allowable_axial_stress(
        klr_max,
        cc,
        value.e_tf_per_cm2,
        value.fy_tf_per_cm2,
    )
    adjusted_allowable_stress = base_allowable_stress * value.allowable_stress_increase_factor
    per_member_capacity_tf = adjusted_allowable_stress * section.area_cm2
    transfer_demand_per_member_tf = demand_tf * value.imbalance_factor / value.member_count
    total_demand_per_member_tf = transfer_demand_per_member_tf + value.additional_axial_load_tf_per_member
    nominal_transfer_capacity_tf = max(
        per_member_capacity_tf - value.additional_axial_load_tf_per_member,
        0.0,
    ) * value.member_count / value.imbalance_factor
    member_total_utilization_ratio = (
        total_demand_per_member_tf / per_member_capacity_tf
        if per_member_capacity_tf > 0
        else math.inf
    )

    flange_ratio = section.flange_width_cm / (2.0 * section.flange_thickness_cm)
    flange_limit = 25.0 / math.sqrt(value.fy_tf_per_cm2)
    clear_web_depth_cm = max(section.depth_cm - 2.0 * section.flange_thickness_cm, 0.0)
    web_ratio = clear_web_depth_cm / section.web_thickness_cm
    web_limit = 68.0 / math.sqrt(value.fy_tf_per_cm2)
    slenderness_passed = klr_max <= 200.0
    local_slenderness_passed = flange_ratio <= flange_limit and web_ratio <= web_limit
    utilization_passed = (
        math.isfinite(member_total_utilization_ratio)
        and member_total_utilization_ratio <= 1.0
    )
    applicability_passed = slenderness_passed and local_slenderness_passed
    overall_passed = applicability_passed and utilization_passed
    adoptable_transfer_capacity_tf = nominal_transfer_capacity_tf if applicability_passed else 0.0
    transfer_capacity_utilization_ratio = (
        demand_tf / adoptable_transfer_capacity_tf
        if adoptable_transfer_capacity_tf > 0
        else math.inf
    )

    record = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": KIND,
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "handoffFingerprint": validated_handoff["handoffFingerprint"],
            "sourceCalculationFingerprint": validated_handoff["source"]["calculationFingerprint"],
            "transferId": transfer_id,
            "receiverTarget": transfer["receiver"]["target"],
            "receiverTransferDemandTf": _rounded(demand_tf),
        },
        "input": _input_snapshot(value),
        "section": _section_snapshot(section),
        "results": {
            "status": "passed" if overall_passed else "failed",
            "controllingAxis": controlling_axis,
            "klrX": _rounded(klr_x),
            "klrY": _rounded(klr_y),
            "klrMax": _rounded(klr_max),
            "cc": _rounded(cc),
            "baseAllowableAxialStressTfPerCm2": _rounded(base_allowable_stress),
            "adjustedAllowableAxialStressTfPerCm2": _rounded(adjusted_allowable_stress),
            "perMemberCapacityTf": _rounded(per_member_capacity_tf),
            "transferDemandPerMemberTf": _rounded(transfer_demand_per_member_tf),
            "totalDemandPerMemberTf": _rounded(total_demand_per_member_tf),
            "nominalTransferCapacityTf": _rounded(nominal_transfer_capacity_tf),
            "adoptableTransferCapacityTf": _rounded(adoptable_transfer_capacity_tf),
            "memberTotalUtilizationRatio": _rounded(member_total_utilization_ratio) if math.isfinite(member_total_utilization_ratio) else None,
            "capacityUtilizationRatio": _rounded(transfer_capacity_utilization_ratio) if math.isfinite(transfer_capacity_utilization_ratio) else None,
            "flangeSlendernessRatio": _rounded(flange_ratio),
            "flangeSlendernessLimit": _rounded(flange_limit),
            "webSlendernessRatio": _rounded(web_ratio),
            "webSlendernessLimit": _rounded(web_limit),
            "checks": {
                "memberSlenderness": "passed" if slenderness_passed else "failed",
                "localSlenderness": "passed" if local_slenderness_passed else "failed",
                "axialCapacity": "passed" if utilization_passed else "failed",
            },
        },
        "codeBasis": {
            "title": "鋼構造建築物鋼結構設計技術規範",
            "officialPage": STEEL_CODE_PAGE_URL,
            "memberSlenderness": {
                "chapter": "第四章 4.4",
                "criterion": "KL/r <= 200",
                "officialPdf": STEEL_CODE_CHAPTER_4_URL,
            },
            "localSlenderness": {
                "chapter": "第四章 4.5",
                "criteria": ["bf/(2tf) <= 25/sqrt(Fy)", "(d-2tf)/tw <= 68/sqrt(Fy)"],
                "officialPdf": STEEL_CODE_CHAPTER_4_URL,
            },
            "allowableAxialStress": {
                "chapter": "第六章 6.1 至 6.3",
                "formulaId": "STEEL-ASD-6.3-AXIAL-COMPRESSION",
                "officialPdf": STEEL_CODE_CHAPTER_6_URL,
            },
        },
        "verificationScope": {
            "checkedLimitStates": ["axial", "stability"],
            "uncoveredChecks": [
                "接頭與續接",
                "頂部與底部承壓及局部補強",
                "底座板、錨定與基礎",
                "樓版或永久結構之彎曲、剪力、沖切與承壓",
                "現場側向支撐與有效長度條件",
                "施工順序、預壓與卸載程序",
            ],
            "otherChecksStatus": "failed",
        },
        "boundary": {
            "pureAxialNoEccentricityOnly": True,
            "connectionAndBearingNotChecked": True,
            "floorOrPermanentStructureNotChecked": True,
            "constructionSequenceAndPreloadNotChecked": True,
            "requiresSeparateOtherChecks": True,
            "doesNotAutoApproveReceiverReceipt": True,
        },
    }
    record["calculationFingerprint"] = _digest(record)
    evidence_bytes = (_canonical_json(record) + "\n").encode("utf-8")
    evidence_sha256 = hashlib.sha256(evidence_bytes).hexdigest()
    return {
        "calculation": record,
        "evidence": {
            "fileName": f"reshore-member-capacity-{record['calculationFingerprint']}.json",
            "mediaType": "application/json",
            "contentEncoding": "base64",
            "contentBase64": base64.b64encode(evidence_bytes).decode("ascii"),
            "fileSha256": evidence_sha256,
            "documentReference": record["calculationFingerprint"],
            "revision": "v1",
            "issuedDate": record["generatedAt"][:10],
            "pageReference": "JSON 全文",
        },
    }
