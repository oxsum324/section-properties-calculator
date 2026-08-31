from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import math
from typing import Any

from .calculations import (
    allowable_axial_stress,
    allowable_fbx,
    allowable_fby,
    classify_column_section,
    interaction_components,
)
from .removal_transfer_handoff import validate_removal_transfer_handoff
from .schemas import ReshoreMemberCapacityInput, SectionProperty
from .workbook_loader import find_section


SCHEMA_VERSION = 4
KIND = "excavation-reshore-member-capacity-calculation"
FINGERPRINT_PREFIX = "RSC"
BEARING_EVIDENCE_SCHEMA_VERSION = 1
BEARING_EVIDENCE_KIND = "excavation-reshore-end-bearing-evidence"
BEARING_EVIDENCE_FINGERPRINT_PREFIX = "RSB"
STEEL_CODE_PAGE_URL = "https://www.nlma.gov.tw/ch/legislation/regsearch/7176"
STEEL_CODE_CHAPTER_4_URL = "https://www.nlma.gov.tw/uploads/files/e7c2c9d73eefc69beecde12336374b9b.pdf"
STEEL_CODE_CHAPTER_6_URL = "https://www.nlma.gov.tw/uploads/files/e139e8d278188c817090a2510017202e.pdf"
STEEL_CODE_CHAPTER_7_URL = "https://www.nlma.gov.tw/uploads/files/91bbcbd01a38582e6c5b1f00dd367683.pdf"
STEEL_CODE_CHAPTER_8_URL = "https://www.nlma.gov.tw/uploads/files/f6ed32171e4e99a9c49e85ca3b733d3c.pdf"
STEEL_CODE_CHAPTER_10_URL = "https://www.nlma.gov.tw/filesys/file/chinese/publication/law/law/803495-10.pdf"
AISC_BEARING_PLATE_REFERENCE_URL = "https://ej.aisc.org/index.php/engj/article/view/214"


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


def _digest(value: Any, prefix: str = FINGERPRINT_PREFIX) -> str:
    digest = hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()[:20].upper()
    return f"{prefix}-{digest}"


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
        "rtCm": _rounded(section.rt_cm),
        "sxCm3": _rounded(section.sx_cm3),
        "syCm3": _rounded(section.sy_cm3),
    }


def _input_snapshot(value: ReshoreMemberCapacityInput) -> dict[str, Any]:
    return {
        "analysisMode": value.analysis_mode,
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
        "transferEccentricityXM": _rounded(value.transfer_eccentricity_x_m),
        "transferEccentricityYM": _rounded(value.transfer_eccentricity_y_m),
        "additionalMomentXTfMPerMember": _rounded(value.additional_moment_x_tf_m_per_member),
        "additionalMomentYTfMPerMember": _rounded(value.additional_moment_y_tf_m_per_member),
        "strongAxisLateralUnbracedLengthM": _rounded(value.strong_axis_lateral_unbraced_length_m),
        "momentGradientCoefficientCb": _rounded(value.moment_gradient_coefficient_cb),
        "momentAmplificationCoefficientCmx": _rounded(value.moment_amplification_coefficient_cmx),
        "momentAmplificationCoefficientCmy": _rounded(value.moment_amplification_coefficient_cmy),
        "governingLoadCombination": value.governing_load_combination.strip(),
        "effectiveLengthBasis": value.effective_length_basis.strip(),
        "loadDistributionBasis": value.load_distribution_basis.strip(),
        "additionalLoadBasis": value.additional_load_basis.strip(),
        "eccentricityAndMomentBasis": value.eccentricity_and_moment_basis.strip(),
        "bendingStabilityBasis": value.bending_stability_basis.strip(),
        "stressIncreaseBasis": value.stress_increase_basis.strip(),
        "pureAxialNoEccentricityConfirmed": value.pure_axial_no_eccentricity_confirmed,
        "endBearingMode": value.end_bearing_mode,
        "topEndPlateFyTfPerCm2": _rounded(value.top_end_plate_fy_tf_per_cm2),
        "topEndPlateWidthCm": _rounded(value.top_end_plate_width_cm),
        "topEndPlateLengthCm": _rounded(value.top_end_plate_length_cm),
        "topEndPlateThicknessCm": _rounded(value.top_end_plate_thickness_cm),
        "topSupportMaterial": value.top_support_material,
        "topSupportMaterialStrengthTfPerCm2": _rounded(value.top_support_material_strength_tf_per_cm2),
        "topSupportTruePlaneConfirmed": value.top_support_true_plane_confirmed,
        "bottomEndPlateWidthCm": _rounded(value.bottom_end_plate_width_cm),
        "bottomEndPlateLengthCm": _rounded(value.bottom_end_plate_length_cm),
        "bottomEndPlateThicknessCm": _rounded(value.bottom_end_plate_thickness_cm),
        "bottomEndPlateFyTfPerCm2": _rounded(value.bottom_end_plate_fy_tf_per_cm2),
        "bottomSupportMaterial": value.bottom_support_material,
        "bottomSupportMaterialStrengthTfPerCm2": _rounded(value.bottom_support_material_strength_tf_per_cm2),
        "bottomSupportTruePlaneConfirmed": value.bottom_support_true_plane_confirmed,
        "endBearingConfigurationBasis": value.end_bearing_configuration_basis.strip(),
        "endPlateBendingMethodBasis": value.end_plate_bending_method_basis.strip(),
        "topSupportBearingBasis": value.top_support_bearing_basis.strip(),
        "bottomSupportBearingBasis": value.bottom_support_bearing_basis.strip(),
        "centeredFullContactEndBearingConfirmed": value.centered_full_contact_end_bearing_confirmed,
        "hSectionEndFinishedConfirmed": value.h_section_end_finished_confirmed,
        "unperforatedUnstiffenedSinglePlateConfirmed": value.unperforated_unstiffened_single_plate_confirmed,
    }


def _validate_input_basis(value: ReshoreMemberCapacityInput) -> None:
    stable_positive_values = (
        value.unbraced_length_x_m,
        value.unbraced_length_y_m,
        value.fy_tf_per_cm2,
        value.e_tf_per_cm2,
        value.strong_axis_lateral_unbraced_length_m,
        value.moment_gradient_coefficient_cb,
        value.moment_amplification_coefficient_cmx,
        value.moment_amplification_coefficient_cmy,
    )
    if any(not math.isfinite(item) or item < 0.000001 for item in stable_positive_values):
        raise ValueError("構件計算的正值輸入至少須為 0.000001，且必須是有限數值。")
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
    bending_effects = (
        value.transfer_eccentricity_x_m,
        value.transfer_eccentricity_y_m,
        value.additional_moment_x_tf_m_per_member,
        value.additional_moment_y_tf_m_per_member,
    )
    if value.analysis_mode == "pure_axial":
        if not value.pure_axial_no_eccentricity_confirmed:
            raise ValueError("純軸壓模式必須確認構件無偏心、彎矩或其他橫向作用。")
        if any(effect > 0 for effect in bending_effects):
            raise ValueError("純軸壓模式不得輸入偏心距或附加彎矩。")
    else:
        if not any(effect > 0 for effect in bending_effects):
            raise ValueError("軸壓與雙向彎矩模式至少須輸入一項偏心距或附加彎矩。")
        if not value.eccentricity_and_moment_basis.strip():
            raise ValueError("軸壓與雙向彎矩模式必須填寫偏心距、彎矩來源與方向依據。")
        if not value.bending_stability_basis.strip():
            raise ValueError("軸壓與雙向彎矩模式必須填寫側向未支撐長度、Cb 與 Cm 依據。")
    if value.end_bearing_mode == "centered_rectangular_plate":
        if value.analysis_mode != "pure_axial":
            raise ValueError("上下端直接承壓模組只適用於已確認無偏心的純軸壓模式。")
        if value.allowable_stress_increase_factor != 1.0:
            raise ValueError("上下端直接承壓模組目前只接受容許應力提高係數 1.00。")
        if not value.centered_full_contact_end_bearing_confirmed:
            raise ValueError("上下端直接承壓模組必須確認對心、全板密貼、無拉力、無剪力且無錨栓參與。")
        if not value.h_section_end_finished_confirmed:
            raise ValueError("上下端直接承壓模組必須確認 H 型鋼端面已精確鋸平、研磨或加工至真實平面。")
        if not value.unperforated_unstiffened_single_plate_confirmed:
            raise ValueError("上下端直接承壓模組只接受無孔洞、無加勁且非疊板的單片矩形端板。")
        if value.top_support_material == "finished_steel" and not value.top_support_true_plane_confirmed:
            raise ValueError("頂端採加工鋼面承壓時，必須確認支承鋼面已精確鋸平、研磨或加工至真實平面。")
        if value.bottom_support_material == "finished_steel" and not value.bottom_support_true_plane_confirmed:
            raise ValueError("底端採加工鋼面承壓時，必須確認支承鋼面已精確鋸平、研磨或加工至真實平面。")
        required_bearing_texts = (
            (value.end_bearing_configuration_basis, "上下端端板配置與密貼依據"),
            (value.end_plate_bending_method_basis, "端板局部彎曲工程模型採用依據"),
            (value.top_support_bearing_basis, "頂端支承面容許承壓依據"),
            (value.bottom_support_bearing_basis, "底端支承面容許承壓依據"),
        )
        for text, label in required_bearing_texts:
            if not text.strip():
                raise ValueError(f"{label}不得空白。")
        bearing_values = (
            value.top_end_plate_fy_tf_per_cm2,
            value.top_end_plate_width_cm,
            value.top_end_plate_length_cm,
            value.top_end_plate_thickness_cm,
            value.top_support_material_strength_tf_per_cm2,
            value.bottom_end_plate_fy_tf_per_cm2,
            value.bottom_end_plate_width_cm,
            value.bottom_end_plate_length_cm,
            value.bottom_end_plate_thickness_cm,
            value.bottom_support_material_strength_tf_per_cm2,
        )
        if any(not math.isfinite(item) or item < 0.000001 for item in bearing_values):
            raise ValueError("啟用上下端直接承壓時，兩端端板尺寸、厚度及材料強度至少須為 0.000001，且必須是有限數值。")


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


def _evaluate_end_plate(
    *,
    total_demand_per_member_tf: float,
    width_cm: float,
    length_cm: float,
    thickness_cm: float,
    support_material: str,
    support_material_strength_tf_per_cm2: float,
    plate_fy_tf_per_cm2: float,
    member_fy_tf_per_cm2: float,
    section: SectionProperty,
) -> tuple[dict[str, Any], float]:
    """Evaluate one centered rectangular end plate under uniform support pressure."""
    plate_area_cm2 = width_cm * length_cm
    contact_pressure = total_demand_per_member_tf / plate_area_cm2
    effective_loaded_width_cm = 0.80 * section.flange_width_cm
    effective_loaded_length_cm = 0.95 * section.depth_cm
    width_projection_cm = (width_cm - effective_loaded_width_cm) / 2.0
    length_projection_cm = (length_cm - effective_loaded_length_cm) / 2.0
    governing_projection_cm = max(width_projection_cm, length_projection_cm)
    support_allowable_bearing_tf_per_cm2 = (
        0.90 * min(plate_fy_tf_per_cm2, support_material_strength_tf_per_cm2)
        if support_material == "finished_steel"
        else 0.35 * support_material_strength_tf_per_cm2
    )
    allowable_plate_bending_stress = 0.60 * plate_fy_tf_per_cm2
    required_thickness_cm = governing_projection_cm * math.sqrt(
        3.0 * contact_pressure / allowable_plate_bending_stress
    )
    support_bearing_utilization = (
        contact_pressure / support_allowable_bearing_tf_per_cm2
    )
    plate_bending_utilization = (
        3.0
        * contact_pressure
        * governing_projection_cm**2
        / (allowable_plate_bending_stress * thickness_cm**2)
    )
    support_capacity_per_member_tf = (
        support_allowable_bearing_tf_per_cm2 * plate_area_cm2
    )
    h_section_end_bearing_stress = total_demand_per_member_tf / section.area_cm2
    h_section_end_allowable_bearing_stress = 0.90 * min(
        member_fy_tf_per_cm2,
        plate_fy_tf_per_cm2,
    )
    h_section_end_bearing_utilization = (
        h_section_end_bearing_stress / h_section_end_allowable_bearing_stress
    )
    h_section_end_bearing_capacity_per_member_tf = (
        h_section_end_allowable_bearing_stress * section.area_cm2
    )
    plate_bending_pressure_capacity = (
        allowable_plate_bending_stress
        * thickness_cm**2
        / (3.0 * governing_projection_cm**2)
    )
    plate_bending_capacity_per_member_tf = (
        plate_bending_pressure_capacity * plate_area_cm2
    )
    governing_capacity_per_member_tf = min(
        support_capacity_per_member_tf,
        plate_bending_capacity_per_member_tf,
        h_section_end_bearing_capacity_per_member_tf,
    )
    support_passed = support_bearing_utilization <= 1.0
    plate_passed = plate_bending_utilization <= 1.0
    h_section_end_passed = h_section_end_bearing_utilization <= 1.0
    return {
        "status": (
            "passed"
            if support_passed and plate_passed and h_section_end_passed
            else "failed"
        ),
        "plateAreaCm2": _rounded(plate_area_cm2),
        "contactPressureTfPerCm2": _rounded(contact_pressure),
        "supportMaterial": support_material,
        "supportMaterialStrengthTfPerCm2": _rounded(support_material_strength_tf_per_cm2),
        "plateFyTfPerCm2": _rounded(plate_fy_tf_per_cm2),
        "supportAllowableBearingTfPerCm2": _rounded(support_allowable_bearing_tf_per_cm2),
        "supportBearingUtilizationRatio": _rounded(support_bearing_utilization),
        "effectiveLoadedWidthCm": _rounded(effective_loaded_width_cm),
        "effectiveLoadedLengthCm": _rounded(effective_loaded_length_cm),
        "widthProjectionCm": _rounded(width_projection_cm),
        "lengthProjectionCm": _rounded(length_projection_cm),
        "governingProjectionCm": _rounded(governing_projection_cm),
        "allowablePlateBendingStressTfPerCm2": _rounded(allowable_plate_bending_stress),
        "requiredPlateThicknessCm": _rounded(required_thickness_cm),
        "providedPlateThicknessCm": _rounded(thickness_cm),
        "plateBendingUtilizationRatio": _rounded(plate_bending_utilization),
        "supportCapacityPerMemberTf": _rounded(support_capacity_per_member_tf),
        "plateBendingCapacityPerMemberTf": _rounded(plate_bending_capacity_per_member_tf),
        "hSectionEndBearingStressTfPerCm2": _rounded(h_section_end_bearing_stress),
        "hSectionEndAllowableBearingStressTfPerCm2": _rounded(
            h_section_end_allowable_bearing_stress
        ),
        "hSectionEndBearingUtilizationRatio": _rounded(
            h_section_end_bearing_utilization
        ),
        "hSectionEndBearingCapacityPerMemberTf": _rounded(
            h_section_end_bearing_capacity_per_member_tf
        ),
        "governingCapacityPerMemberTf": _rounded(governing_capacity_per_member_tf),
        "checks": {
            "supportBearing": "passed" if support_passed else "failed",
            "endPlateLocalBending": "passed" if plate_passed else "failed",
            "hSectionFinishedEndBearing": "passed" if h_section_end_passed else "failed",
        },
    }, governing_capacity_per_member_tf


def calculate_reshore_member_capacity(
    handoff: dict[str, Any],
    transfer_id: str,
    calculation_input: ReshoreMemberCapacityInput,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Calculate H-section reshore axial or axial-biaxial member capacity."""
    validated_handoff, transfer = _resolve_transfer(handoff, transfer_id)
    value = calculation_input.model_copy(
        update={
            key: _rounded(child)
            for key, child in calculation_input.model_dump().items()
            if isinstance(child, float)
        }
    )
    _validate_input_basis(value)
    try:
        section = find_section(value.section_name)
    except KeyError as exc:
        raise ValueError(str(exc)) from exc
    section = section.model_copy(
        update={
            key: _rounded(child)
            for key, child in section.model_dump().items()
            if isinstance(child, float)
        }
    )

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
    if value.analysis_mode == "axial_biaxial_bending" and min(
        section.rt_cm,
        section.sx_cm3,
        section.sy_cm3,
    ) <= 0:
        raise ValueError("軸壓與雙向彎矩模式所需的 rT、Sx 或 Sy 斷面性質不是正值。")
    if value.end_bearing_mode == "centered_rectangular_plate":
        for label, width_cm, length_cm in (
            (
                "頂端",
                value.top_end_plate_width_cm,
                value.top_end_plate_length_cm,
            ),
            (
                "底端",
                value.bottom_end_plate_width_cm,
                value.bottom_end_plate_length_cm,
            ),
        ):
            if width_cm < section.flange_width_cm or length_cm < section.depth_cm:
                raise ValueError(
                    f"{label}端板寬度不得小於 H 型鋼翼板寬，長度不得小於 H 型鋼斷面深度。"
                )

    demand_tf = _rounded(float(transfer["sourceDemand"]["receiverTransferDemandTf"]))
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
    lc_cm = min(
        20.0 * section.flange_width_cm / math.sqrt(value.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * value.fy_tf_per_cm2
        ),
    )
    fex = (12.0 / 23.0) * math.pi**2 * value.e_tf_per_cm2 / max(klr_x**2, 1e-9)
    fey = (12.0 / 23.0) * math.pi**2 * value.e_tf_per_cm2 / max(klr_y**2, 1e-9)

    def evaluate_transfer(total_transfer_demand_tf: float) -> dict[str, Any]:
        transfer_per_member = total_transfer_demand_tf * value.imbalance_factor / value.member_count
        axial_per_member = transfer_per_member + value.additional_axial_load_tf_per_member
        axial_stress = axial_per_member / section.area_cm2
        moment_x = (
            transfer_per_member * value.transfer_eccentricity_x_m
            + value.additional_moment_x_tf_m_per_member
        )
        moment_y = (
            transfer_per_member * value.transfer_eccentricity_y_m
            + value.additional_moment_y_tf_m_per_member
        )
        bending_stress_x = abs(moment_x) * 100.0 / section.sx_cm3 if section.sx_cm3 else 0.0
        bending_stress_y = abs(moment_y) * 100.0 / section.sy_cm3 if section.sy_cm3 else 0.0
        section_class = classify_column_section(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            value.fy_tf_per_cm2,
            axial_stress,
        )
        if value.analysis_mode == "pure_axial":
            base_fbx = 0.0
            base_fby = 0.0
            adjusted_fbx = 0.0
            adjusted_fby = 0.0
            utilization = axial_stress / adjusted_allowable_stress if adjusted_allowable_stress > 0 else math.inf
            interaction = {
                "interaction821Ratio": None,
                "interaction822Ratio": None,
                "interaction823Ratio": None,
                "governingInteractionEquation": None,
            }
        else:
            base_fbx = allowable_fbx(
                section.depth_cm,
                section.flange_width_cm,
                section.web_thickness_cm,
                section.flange_thickness_cm,
                section.rt_cm,
                value.strong_axis_lateral_unbraced_length_m * 100.0,
                lc_cm,
                value.moment_gradient_coefficient_cb,
                value.fy_tf_per_cm2,
                section_class,
            )
            base_fby = allowable_fby(
                section.flange_width_cm,
                section.flange_thickness_cm,
                value.fy_tf_per_cm2,
                section_class,
            )
            adjusted_fbx = base_fbx * value.allowable_stress_increase_factor
            adjusted_fby = base_fby * value.allowable_stress_increase_factor
            unstable = (
                (bending_stress_x > 0 and axial_stress >= fex)
                or (bending_stress_y > 0 and axial_stress >= fey)
            )
            interaction = (
                {
                    "interaction821Ratio": None,
                    "interaction822Ratio": None,
                    "interaction823Ratio": None,
                    "governingInteractionEquation": None,
                }
                if unstable
                else interaction_components(
                    value.fy_tf_per_cm2 * value.allowable_stress_increase_factor,
                    axial_stress,
                    adjusted_allowable_stress,
                    bending_stress_x,
                    adjusted_fbx,
                    bending_stress_y,
                    adjusted_fby,
                    fex,
                    fey,
                    value.moment_amplification_coefficient_cmx,
                    value.moment_amplification_coefficient_cmy,
                )
            )
            utilization = math.inf if unstable else float(interaction["ratio"])
        bending_utilization_x = (
            bending_stress_x / adjusted_fbx if adjusted_fbx > 0 else 0.0
        )
        bending_utilization_y = (
            bending_stress_y / adjusted_fby if adjusted_fby > 0 else 0.0
        )
        dominant_bending_axis = (
            None
            if bending_utilization_x == 0.0 and bending_utilization_y == 0.0
            else "X" if bending_utilization_x >= bending_utilization_y else "Y"
        )
        return {
            "transferDemandPerMemberTf": transfer_per_member,
            "totalDemandPerMemberTf": axial_per_member,
            "axialStressTfPerCm2": axial_stress,
            "momentXTfMPerMember": moment_x,
            "momentYTfMPerMember": moment_y,
            "bendingStressXTfPerCm2": bending_stress_x,
            "bendingStressYTfPerCm2": bending_stress_y,
            "sectionClass": section_class,
            "baseAllowableBendingStressXTfPerCm2": base_fbx,
            "baseAllowableBendingStressYTfPerCm2": base_fby,
            "adjustedAllowableBendingStressXTfPerCm2": adjusted_fbx,
            "adjustedAllowableBendingStressYTfPerCm2": adjusted_fby,
            "bendingUtilizationX": bending_utilization_x,
            "bendingUtilizationY": bending_utilization_y,
            "dominantBendingAxis": dominant_bending_axis,
            **{
                key: child
                for key, child in interaction.items()
                if key != "ratio"
            },
            "memberInteractionRatio": utilization,
        }

    current_effects = evaluate_transfer(demand_tf)
    member_total_utilization_ratio = float(current_effects["memberInteractionRatio"])
    if value.analysis_mode == "pure_axial":
        nominal_transfer_capacity_tf = max(
            per_member_capacity_tf - value.additional_axial_load_tf_per_member,
            0.0,
        ) * value.member_count / value.imbalance_factor
    else:
        zero_ratio = float(evaluate_transfer(0.0)["memberInteractionRatio"])
        if not math.isfinite(zero_ratio) or zero_ratio > 1.0:
            nominal_transfer_capacity_tf = 0.0
        else:
            lower = 0.0
            upper = max(demand_tf, 1.0)
            while upper < 1_000_000.0:
                upper_ratio = float(evaluate_transfer(upper)["memberInteractionRatio"])
                if not math.isfinite(upper_ratio) or upper_ratio > 1.0:
                    break
                lower = upper
                upper *= 2.0
            for _ in range(100):
                midpoint = (lower + upper) / 2.0
                midpoint_ratio = float(evaluate_transfer(midpoint)["memberInteractionRatio"])
                if math.isfinite(midpoint_ratio) and midpoint_ratio <= 1.0:
                    lower = midpoint
                else:
                    upper = midpoint
            nominal_transfer_capacity_tf = lower
    capacity_effects = evaluate_transfer(nominal_transfer_capacity_tf)

    bearing_checked = value.end_bearing_mode == "centered_rectangular_plate"
    top_end_bearing = None
    bottom_end_bearing = None
    end_bearing_transfer_capacity_tf = math.inf
    end_bearing_passed = True
    if bearing_checked:
        top_end_bearing, top_end_capacity_per_member_tf = _evaluate_end_plate(
            total_demand_per_member_tf=total_demand_per_member_tf,
            width_cm=value.top_end_plate_width_cm,
            length_cm=value.top_end_plate_length_cm,
            thickness_cm=value.top_end_plate_thickness_cm,
            support_material=value.top_support_material,
            support_material_strength_tf_per_cm2=value.top_support_material_strength_tf_per_cm2,
            plate_fy_tf_per_cm2=value.top_end_plate_fy_tf_per_cm2,
            member_fy_tf_per_cm2=value.fy_tf_per_cm2,
            section=section,
        )
        bottom_end_bearing, bottom_end_capacity_per_member_tf = _evaluate_end_plate(
            total_demand_per_member_tf=total_demand_per_member_tf,
            width_cm=value.bottom_end_plate_width_cm,
            length_cm=value.bottom_end_plate_length_cm,
            thickness_cm=value.bottom_end_plate_thickness_cm,
            support_material=value.bottom_support_material,
            support_material_strength_tf_per_cm2=value.bottom_support_material_strength_tf_per_cm2,
            plate_fy_tf_per_cm2=value.bottom_end_plate_fy_tf_per_cm2,
            member_fy_tf_per_cm2=value.fy_tf_per_cm2,
            section=section,
        )
        governing_end_capacity_per_member_tf = min(
            top_end_capacity_per_member_tf,
            bottom_end_capacity_per_member_tf,
        )
        end_bearing_transfer_capacity_tf = max(
            governing_end_capacity_per_member_tf - value.additional_axial_load_tf_per_member,
            0.0,
        ) * value.member_count / value.imbalance_factor
        end_bearing_passed = (
            top_end_bearing["status"] == "passed"
            and bottom_end_bearing["status"] == "passed"
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
    overall_passed = applicability_passed and utilization_passed and end_bearing_passed
    governing_transfer_capacity_tf = min(
        nominal_transfer_capacity_tf,
        end_bearing_transfer_capacity_tf,
    )
    adoptable_transfer_capacity_tf = governing_transfer_capacity_tf if applicability_passed else 0.0
    governing_capacity_mode = (
        "end_bearing"
        if bearing_checked and end_bearing_transfer_capacity_tf < nominal_transfer_capacity_tf
        else "member"
    )
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
            "analysisMode": value.analysis_mode,
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
            "endBearingTransferCapacityTf": (
                _rounded(end_bearing_transfer_capacity_tf) if bearing_checked else None
            ),
            "adoptableTransferCapacityTf": _rounded(adoptable_transfer_capacity_tf),
            "governingCapacityMode": governing_capacity_mode,
            "memberTotalUtilizationRatio": _rounded(member_total_utilization_ratio) if math.isfinite(member_total_utilization_ratio) else None,
            "memberInteractionRatio": _rounded(member_total_utilization_ratio) if math.isfinite(member_total_utilization_ratio) else None,
            "capacityInteractionRatio": (
                _rounded(float(capacity_effects["memberInteractionRatio"]))
                if math.isfinite(float(capacity_effects["memberInteractionRatio"]))
                else None
            ),
            "capacityInteraction821Ratio": (
                _rounded(float(capacity_effects["interaction821Ratio"]))
                if capacity_effects["interaction821Ratio"] is not None
                else None
            ),
            "capacityInteraction822Ratio": (
                _rounded(float(capacity_effects["interaction822Ratio"]))
                if capacity_effects["interaction822Ratio"] is not None
                else None
            ),
            "capacityInteraction823Ratio": (
                _rounded(float(capacity_effects["interaction823Ratio"]))
                if capacity_effects["interaction823Ratio"] is not None
                else None
            ),
            "capacityGoverningInteractionEquation": capacity_effects["governingInteractionEquation"],
            "capacityMomentXTfMPerMember": _rounded(float(capacity_effects["momentXTfMPerMember"])),
            "capacityMomentYTfMPerMember": _rounded(float(capacity_effects["momentYTfMPerMember"])),
            "capacityUtilizationRatio": _rounded(transfer_capacity_utilization_ratio) if math.isfinite(transfer_capacity_utilization_ratio) else None,
            "lcCm": _rounded(lc_cm),
            "strongAxisLateralUnbracedLengthCm": _rounded(value.strong_axis_lateral_unbraced_length_m * 100.0),
            "fexTfPerCm2": _rounded(fex),
            "feyTfPerCm2": _rounded(fey),
            **{
                key: _rounded(child) if isinstance(child, float) and math.isfinite(child) else child
                for key, child in current_effects.items()
                if key not in {"memberInteractionRatio"}
            },
            "flangeSlendernessRatio": _rounded(flange_ratio),
            "flangeSlendernessLimit": _rounded(flange_limit),
            "webSlendernessRatio": _rounded(web_ratio),
            "webSlendernessLimit": _rounded(web_limit),
            "endBearing": (
                {
                    "mode": value.end_bearing_mode,
                    "top": top_end_bearing,
                    "bottom": bottom_end_bearing,
                }
                if bearing_checked
                else None
            ),
            "checks": {
                "memberSlenderness": "passed" if slenderness_passed else "failed",
                "localSlenderness": "passed" if local_slenderness_passed else "failed",
                "axialCapacity": "passed" if utilization_passed else "failed",
                "memberInteraction": "passed" if utilization_passed else "failed",
                "topEndBearing": (
                    top_end_bearing["status"] if top_end_bearing else "not_checked"
                ),
                "bottomEndBearing": (
                    bottom_end_bearing["status"] if bottom_end_bearing else "not_checked"
                ),
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
            **(
                {
                    "allowableBendingStress": {
                        "chapter": "第七章 7.2 與 7.3",
                        "formulaId": "STEEL-ASD-7-BENDING",
                        "officialPdf": STEEL_CODE_CHAPTER_7_URL,
                    },
                    "axialBendingInteraction": {
                        "chapter": "第八章 8.2",
                        "formulaId": "STEEL-ASD-8.2-1-TO-8.2-3",
                        "officialPdf": STEEL_CODE_CHAPTER_8_URL,
                    },
                }
                if value.analysis_mode == "axial_biaxial_bending"
                else {}
            ),
            **(
                {
                    "supportBearing": {
                        "authority": "規範判定",
                        "chapter": "第十章 10.8 與 10.9",
                        "criteria": [
                            "研磨或加工鋼面 Fp = 0.90 min(Fy,plate, Fy,support)",
                            "混凝土全面積承壓 Fp = 0.35 f'c",
                        ],
                        "officialPdf": STEEL_CODE_CHAPTER_10_URL,
                        "basisFields": [
                            "topSupportBearingBasis",
                            "bottomSupportBearingBasis",
                        ],
                    },
                    "hSectionFinishedEndBearing": {
                        "authority": "規範判定",
                        "chapter": "第十章 10.8",
                        "criterion": "精確鋸平、研磨或加工端面之 Fp = 0.90 min(Fy,H, Fy,plate)",
                        "officialPdf": STEEL_CODE_CHAPTER_10_URL,
                    },
                    "endPlateLocalBending": {
                        "authority": "專案指定",
                        "method": "均佈支承反力下之無加勁矩形承壓板懸臂法",
                        "formulaId": "PROJECT-SPECIFIED-BEARING-PLATE-CANTILEVER-060FY",
                        "criterion": "m=(L-0.95d)/2, n=(B-0.80bf)/2, ell=max(m,n), t_required=ell*sqrt(3fp/Fb), Fb=0.60Fy",
                        "mechanicsReference": AISC_BEARING_PLATE_REFERENCE_URL,
                        "basisField": "endPlateBendingMethodBasis",
                    },
                    "compressionBearingConnectionBoundary": {
                        "chapter": "第十章 10.1.4",
                        "criterion": "承壓接合仍須另以足夠接合物維持正確位置；其他受壓構材之續接材與接合物至少須承受構件強度 50%，並檢討規定作用",
                        "officialPdf": STEEL_CODE_CHAPTER_10_URL,
                    },
                }
                if bearing_checked
                else {}
            ),
        },
        "verificationScope": {
            "checkedLimitStates": (
                ["axial", "bending", "stability"]
                if value.analysis_mode == "axial_biaxial_bending"
                else ["axial", "stability"]
            ),
            "uncoveredChecks": (
                [
                    "接頭與續接（含端板與 H 型鋼之銲道、螺栓及定位接合）",
                    "加勁肋及 H 型鋼局部補強",
                    "底座板、錨定與基礎",
                    "樓版或永久結構本體之彎曲、剪力、沖切與承壓",
                    "現場側向支撐與有效長度條件",
                    "施工順序、預壓與卸載程序",
                ]
                if bearing_checked
                else [
                    "接頭與續接",
                    "頂部與底部承壓及局部補強",
                    "底座板、錨定與基礎",
                    "樓版或永久結構之彎曲、剪力、沖切與承壓",
                    "現場側向支撐與有效長度條件",
                    "施工順序、預壓與卸載程序",
                ]
            ),
            "otherChecksStatus": "failed",
        },
        "boundary": {
            "pureAxialNoEccentricityOnly": value.analysis_mode == "pure_axial",
            "axialBiaxialBendingInteractionChecked": value.analysis_mode == "axial_biaxial_bending",
            # Legacy combined flag remains fail-closed while either connection or bearing is unchecked.
            # v4 consumers should use the split connectionNotChecked/endBearingChecked fields below.
            "connectionAndBearingNotChecked": True,
            "connectionNotChecked": True,
            "endBearingChecked": bearing_checked,
            "endPlateLocalBendingChecked": bearing_checked,
            "localReinforcementNotChecked": True,
            "floorOrPermanentStructureNotChecked": True,
            "constructionSequenceAndPreloadNotChecked": True,
            "requiresSeparateOtherChecks": True,
            "doesNotAutoApproveReceiverReceipt": True,
        },
    }
    record["calculationFingerprint"] = _digest(record)
    evidence_bytes = (_canonical_json(record) + "\n").encode("utf-8")
    evidence_sha256 = hashlib.sha256(evidence_bytes).hexdigest()
    response = {
        "calculation": record,
        "evidence": {
            "fileName": f"reshore-member-capacity-{record['calculationFingerprint']}.json",
            "mediaType": "application/json",
            "contentEncoding": "base64",
            "contentBase64": base64.b64encode(evidence_bytes).decode("ascii"),
            "fileSha256": evidence_sha256,
            "documentReference": record["calculationFingerprint"],
            "revision": "v4",
            "issuedDate": record["generatedAt"][:10],
            "pageReference": "JSON 全文",
        },
    }
    if bearing_checked:
        bearing_record = {
            "schemaVersion": BEARING_EVIDENCE_SCHEMA_VERSION,
            "kind": BEARING_EVIDENCE_KIND,
            "generatedAt": record["generatedAt"],
            "source": {
                **record["source"],
                "reshoreCalculationFingerprint": record["calculationFingerprint"],
                "reshoreCalculationEvidenceFileName": response["evidence"]["fileName"],
                "reshoreCalculationEvidenceFileSha256": evidence_sha256,
            },
            "input": {
                key: child
                for key, child in record["input"].items()
                if key
                in {
                    "endBearingMode",
                    "memberCount",
                    "imbalanceFactor",
                    "additionalAxialLoadTfPerMember",
                    "fyTfPerCm2",
                    "governingLoadCombination",
                    "loadDistributionBasis",
                    "additionalLoadBasis",
                    "topEndPlateFyTfPerCm2",
                    "topEndPlateWidthCm",
                    "topEndPlateLengthCm",
                    "topEndPlateThicknessCm",
                    "topSupportMaterial",
                    "topSupportMaterialStrengthTfPerCm2",
                    "topSupportTruePlaneConfirmed",
                    "bottomEndPlateWidthCm",
                    "bottomEndPlateLengthCm",
                    "bottomEndPlateThicknessCm",
                    "bottomEndPlateFyTfPerCm2",
                    "bottomSupportMaterial",
                    "bottomSupportMaterialStrengthTfPerCm2",
                    "bottomSupportTruePlaneConfirmed",
                    "endBearingConfigurationBasis",
                    "endPlateBendingMethodBasis",
                    "topSupportBearingBasis",
                    "bottomSupportBearingBasis",
                    "centeredFullContactEndBearingConfirmed",
                    "hSectionEndFinishedConfirmed",
                    "unperforatedUnstiffenedSinglePlateConfirmed",
                    "allowableStressIncreaseFactor",
                    "stressIncreaseBasis",
                }
            },
            "section": record["section"],
            "results": {
                "status": "passed" if end_bearing_passed else "failed",
                "transferDemandPerMemberTf": record["results"]["transferDemandPerMemberTf"],
                "totalDemandPerMemberTf": record["results"]["totalDemandPerMemberTf"],
                "endBearingTransferCapacityTf": record["results"]["endBearingTransferCapacityTf"],
                "top": top_end_bearing,
                "bottom": bottom_end_bearing,
            },
            "codeBasis": {
                key: child
                for key, child in record["codeBasis"].items()
                if key
                in {
                    "title",
                    "officialPage",
                    "supportBearing",
                    "hSectionFinishedEndBearing",
                    "endPlateLocalBending",
                    "compressionBearingConnectionBoundary",
                }
            },
            "boundary": {
                "centeredPureCompressionOnly": True,
                "supportAllowableBearingDerivedFromMaterialStrength": True,
                "concreteBearingAreaEnhancementNotUsed": True,
                "singleUnperforatedUnstiffenedRectangularPlateOnly": True,
                "receivingStructureStrengthNotDerived": True,
                "connectionWeldsBoltsAnchorsNotChecked": True,
                "stiffenersAndLocalReinforcementNotChecked": True,
                "constructionSequenceAndPreloadNotChecked": True,
                "doesNotAutoApproveReceiverReceipt": True,
            },
        }
        bearing_record["calculationFingerprint"] = _digest(
            bearing_record,
            BEARING_EVIDENCE_FINGERPRINT_PREFIX,
        )
        bearing_evidence_bytes = (_canonical_json(bearing_record) + "\n").encode("utf-8")
        response["bearingEvidence"] = {
            "fileName": f"reshore-end-bearing-{bearing_record['calculationFingerprint']}.json",
            "mediaType": "application/json",
            "contentEncoding": "base64",
            "contentBase64": base64.b64encode(bearing_evidence_bytes).decode("ascii"),
            "fileSha256": hashlib.sha256(bearing_evidence_bytes).hexdigest(),
            "documentReference": bearing_record["calculationFingerprint"],
            "revision": "v1",
            "issuedDate": bearing_record["generatedAt"][:10],
            "pageReference": "JSON 全文",
        }
    return response
