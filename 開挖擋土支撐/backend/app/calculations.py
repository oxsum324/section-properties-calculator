from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
from collections.abc import Callable
from datetime import datetime

from .schemas import (
    BasicParameters,
    BraceRow,
    CalculationOptions,
    CalculationResults,
    CheckResult,
    ColumnScenarioInput,
    CornerBraceRow,
    ProjectState,
    SummaryItem,
    SupportRow,
    WaleRow,
)
from .workbook_loader import find_section


def _validate_construction_stage_handoff(load_t: float, source: object) -> tuple[bool, str]:
    record = getattr(source, "handoff_record", None)
    if not isinstance(record, dict) or not record:
        return False, "施工構台荷重缺少可追溯交接來源或原始記錄，無法由後端重驗。"
    fingerprint = str(record.get("handoffFingerprint") or "")
    if not re.fullmatch(r"CSH-[0-9A-F]{20}", fingerprint):
        return False, "施工構台荷重交接指紋格式不正確。"
    unsigned = {key: value for key, value in record.items() if key != "handoffFingerprint"}
    try:
        canonical = json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError):
        return False, "施工構台荷重交接內容不是有效的封閉 JSON。"
    expected = "CSH-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20].upper()
    if not hmac.compare_digest(fingerprint, expected):
        return False, "施工構台荷重交接內容與指紋不一致。"
    record_source = record.get("source")
    record_load = record.get("load")
    boundary = record.get("boundary")
    if record.get("schemaVersion") != 1 or record.get("kind") != "construction-stage-decking-load-handoff":
        return False, "施工構台荷重交接版本或種類不受支援。"
    if not isinstance(record_source, dict) or not isinstance(record_load, dict) or not isinstance(boundary, dict):
        return False, "施工構台荷重交接欄位不完整。"
    if record_load.get("target") != "excavation-composite-column" or record_load.get("unit") != "tf":
        return False, "施工構台荷重交接目標或單位不受支援。"
    record_load_t = record_load.get("controlAxialLoadTf")
    if isinstance(record_load_t, bool) or not isinstance(record_load_t, (int, float)) or not math.isfinite(record_load_t):
        return False, "施工構台荷重交接控制軸力不是有限數值。"
    if not math.isclose(float(record_load_t), load_t, rel_tol=1e-9, abs_tol=1e-9):
        return False, "施工構台荷重與交接檔控制軸力不一致。"
    calculation_fingerprint = str(record_source.get("calculationFingerprint") or "")
    if not re.fullmatch(r"CF-[0-9A-F]{16}", calculation_fingerprint):
        return False, "施工構台荷重來源計算指紋不正確。"
    controlling_cases = record_load.get("controllingCases")
    if not isinstance(controlling_cases, list) or not controlling_cases or any(case not in {"Pu1", "Pu2", "Pu3"} for case in controlling_cases):
        return False, "施工構台荷重控制工況不正確。"
    if boundary.get("requiresExplicitAcceptance") is not True or boundary.get("autoApplied") is not False:
        return False, "施工構台荷重交接未保留明確採用邊界。"
    if (
        getattr(source, "kind", "") != record.get("kind")
        or getattr(source, "handoff_fingerprint", "") != fingerprint
        or getattr(source, "source_tool", "") != str(record_source.get("toolName") or "")
        or getattr(source, "source_version", "") != str(record_source.get("toolVersion") or "")
        or getattr(source, "source_calculation_fingerprint", "") != calculation_fingerprint
        or getattr(source, "source_project_name", "") != str(record_source.get("projectName") or "")
        or getattr(source, "source_project_no", "") != str(record_source.get("projectNo") or "")
        or getattr(source, "controlling_cases", []) != controlling_cases
    ):
        return False, "施工構台荷重來源摘要與原始交接記錄不一致。"
    return True, ""


def classify_beam_section(d: float, bf: float, tw: float, tf: float, fy: float) -> str:
    b = bf / 2.0
    h = d - 2.0 * tf
    l1 = b / tf
    l2 = h / tw
    lpd1 = 14.0 / math.sqrt(fy)
    lp1 = 17.0 / math.sqrt(fy)
    lr1 = 25.0 / math.sqrt(fy)
    if l1 < lpd1:
        lda1 = 1
    elif l1 < lp1:
        lda1 = 2
    elif l1 < lr1:
        lda1 = 3
    else:
        lda1 = 4

    lpd2 = 138.0 / math.sqrt(fy)
    lp2 = 170.0 / math.sqrt(fy)
    lr2 = 260.0 / math.sqrt(fy)
    if l2 < lpd2:
        lda2 = 1
    elif l2 < lp2:
        lda2 = 2
    elif l2 < lr2:
        lda2 = 3
    else:
        lda2 = 4
    section_id = max(lda1, lda2)
    return _section_class_name(section_id)


def classify_column_section(d: float, bf: float, tw: float, tf: float, fy: float, fa_value: float) -> str:
    b = bf / 2.0
    h = d - 2.0 * tf
    l1 = b / tf
    l2 = h / tw
    lpd1 = 14.0 / math.sqrt(fy)
    lp1 = 17.0 / math.sqrt(fy)
    lr1 = 25.0 / math.sqrt(fy)
    if l1 < lpd1:
        lda1 = 1
    elif l1 < lp1:
        lda1 = 2
    elif l1 < lr1:
        lda1 = 3
    else:
        lda1 = 4

    if fa_value / fy <= 0.16:
        lpd2 = 138.0 / math.sqrt(fy) * (1.0 - 3.17 * fa_value / fy)
        lp2 = 170.0 / math.sqrt(fy) * (1.0 - 3.74 * fa_value / fy)
    else:
        lpd2 = 68.0 / math.sqrt(fy)
        lp2 = 68.0 / math.sqrt(fy)
    lr2 = 260.0 / math.sqrt(fy)
    if l2 < lpd2:
        lda2 = 1
    elif l2 < lp2:
        lda2 = 2
    elif l2 < lr2:
        lda2 = 3
    else:
        lda2 = 4
    section_id = max(lda1, lda2)
    return _section_class_name(section_id)


def _section_class_name(section_id: int) -> str:
    return {
        1: "塑性斷面",
        2: "結實斷面",
        3: "半結實斷面",
        4: "細長肢材斷面",
    }[section_id]


def allowable_axial_stress(klr: float, cc: float, e_value: float, fy: float) -> float:
    r = klr / cc if cc else 0.0
    if klr < cc:
        numerator = (1.0 - (r**2) / 2.0) * fy
        denominator = 5.0 / 3.0 + 3.0 * r / 8.0 - (r**3) / 8.0
        return numerator / denominator
    return (12.0 / 23.0) * math.pi**2 * e_value / (klr**2)


def allowable_fbx(
    d: float,
    bf: float,
    tw: float,
    tf: float,
    rt: float,
    lb_cm: float,
    lc_cm: float,
    cb: float,
    fy: float,
    section_class: str,
) -> float:
    if lb_cm < lc_cm:
        if section_class in {"塑性斷面", "結實斷面"}:
            return 0.66 * fy
        if section_class == "半結實斷面":
            return fy * (0.79 - 0.0075 * bf / (2.0 * tf) * math.sqrt(fy))
        return 0.6 * fy
    if section_class == "細長肢材斷面":
        return 0.6 * fy
    if lb_cm / rt > math.sqrt(35800.0 * cb / fy):
        fbx = 12000.0 * cb / (lb_cm / rt) ** 2
        fb = 840.0 * cb / (lb_cm * d / (bf * tf))
        fbx = max(fbx, fb)
    else:
        fbx = (2.0 / 3.0 - fy * (lb_cm / rt) ** 2 / (107600.0 * cb)) * fy
    return min(fbx, 0.6 * fy)


def allowable_fby(bf: float, tf: float, fy: float, section_class: str) -> float:
    if section_class in {"塑性斷面", "結實斷面"}:
        return 0.75 * fy
    if section_class == "半結實斷面":
        return fy * (1.075 - 0.019 * bf / (2.0 * tf) * math.sqrt(fy))
    return 0.6 * fy


def interaction_ratio(
    fy: float,
    fa_value: float,
    fa_allow: float,
    fbx_value: float,
    fbx_allow: float,
    fby_value: float,
    fby_allow: float,
    fex_value: float,
    fey_value: float,
    cmx: float,
    cmy: float,
) -> float:
    if fa_allow == 0 or fbx_allow == 0 or fby_allow == 0:
        return 999.0
    primary_ratio = fa_value / fa_allow
    if primary_ratio <= 0.15:
        return primary_ratio + fbx_value / fbx_allow + fby_value / fby_allow
    ratio = (
        primary_ratio
        + cmx * fbx_value / ((1.0 - fa_value / max(fex_value, 1e-6)) * fbx_allow)
        + cmy * fby_value / ((1.0 - fa_value / max(fey_value, 1e-6)) * fby_allow)
    )
    alt = fa_value / (0.6 * fy) + fbx_value / fbx_allow + fby_value / fby_allow
    return max(ratio, alt)


def calculate_project(project: ProjectState) -> CalculationResults:
    results = CalculationResults(generated_at=datetime.now())
    params = project.basic_parameters
    options, option_warnings = _normalized_calculation_options(project)
    results.warnings.extend(option_warnings)
    synced_support_rows = _all_support_rows(project, options)
    top_support_name = _module_name("top", "水平支撐", options.include_top_supports, options.include_bottom_supports)
    bottom_support_name = _module_name("bottom", "水平支撐", options.include_top_supports, options.include_bottom_supports)
    top_wale_name = _module_name("top", "橫擋", options.include_top_wales, options.include_bottom_wales)
    bottom_wale_name = _module_name("bottom", "橫擋", options.include_top_wales, options.include_bottom_wales)
    top_brace_name = _module_name("top", "斜撐", options.include_top_braces, options.include_bottom_braces)
    bottom_brace_name = _module_name("bottom", "斜撐", options.include_top_braces, options.include_bottom_braces)

    if options.include_top_supports:
        for row in project.top_supports:
            result = calculate_horizontal_support(row, params, top_support_name)
            results.support_checks.append(result)
            results.summary.append(_summary(top_support_name, row.level_label, row.section_name, result))
    if options.include_bottom_supports:
        for row in project.bottom_supports:
            result = calculate_horizontal_support(row, params, bottom_support_name)
            results.support_checks.append(result)
            results.summary.append(_summary(bottom_support_name, row.level_label, row.section_name, result))
    if options.include_top_wales:
        for row in project.top_wales:
            result = calculate_wale(
                row,
                params,
                top_wale_name,
                consider_wall_deduction=options.consider_wall_deduction_for_wales,
            )
            results.wale_checks.append(result)
            results.summary.append(_summary(top_wale_name, row.level_label, row.section_name, result))
    if options.include_bottom_wales:
        for row in project.bottom_wales:
            result = calculate_wale(
                row,
                params,
                bottom_wale_name,
                consider_wall_deduction=options.consider_wall_deduction_for_wales,
            )
            results.wale_checks.append(result)
            results.summary.append(_summary(bottom_wale_name, row.level_label, row.section_name, result))
    if options.include_top_braces:
        for row in project.top_braces:
            result = calculate_brace(row, params, top_brace_name)
            results.brace_checks.append(result)
            results.summary.append(_summary(top_brace_name, row.level_label, row.section_name, result))
    if options.include_bottom_braces:
        for row in project.bottom_braces:
            result = calculate_brace(row, params, bottom_brace_name)
            results.brace_checks.append(result)
            results.summary.append(_summary(bottom_brace_name, row.level_label, row.section_name, result))
    if options.include_corner_braces:
        for row in project.corner_braces:
            result = calculate_corner_brace(row, params)
            results.corner_brace_checks.append(result)
            results.summary.append(_summary("大角撐", row.level_label, row.section_name, result))
    distribution_errors = _construction_stage_distribution_errors(project)
    for column_index, column in enumerate(project.columns):
        if not column.enabled:
            continue
        column.support_rows = [row.model_copy(deep=True) for row in synced_support_rows]
        result = calculate_column_scenario(column, params, distribution_errors.get(column_index, ""))
        results.column_checks.append(result)
        results.summary.append(_summary("柱構件", column.title, column.column_section_name, result))
    return results


def _analysis_mapping_inputs(row: object) -> dict[str, object]:
    if getattr(row, "force_source", "manual") != "analysis_import":
        return {}
    cases = list(getattr(row, "analysis_stage_cases", []))
    install_index = getattr(row, "analysis_install_stage_index", None)
    install_label = str(getattr(row, "analysis_install_stage_label", "")).strip()
    removal_index = getattr(row, "analysis_removal_stage_index", None)
    removal_label = str(getattr(row, "analysis_removal_stage_label", "")).strip()
    transfer_mode = str(getattr(row, "removal_transfer_mode", "unassigned"))
    control_index = getattr(row, "analysis_control_stage_index", None)
    control_label = str(getattr(row, "analysis_control_stage_label", "")).strip()
    control_case = next(
        (
            case for case in cases
            if case.stage_index == control_index and case.stage_label.strip() == control_label
        ),
        None,
    )
    receiver_demand = None
    if control_case is not None:
        receiver_demand = float(control_case.axial_force_t) + float(getattr(row, "temp_force_t", 0.0))
    transfer_labels = {
        "outside_scope": "本構件檢核範圍外（另案檢核）",
        "floor": "移轉至樓版",
        "reshore": "移轉至重撐／回撐",
        "permanent_structure": "移轉至永久結構",
        "other": "其他人工指定處置",
    }
    return {
        "內力來源": "外部分析階段包絡",
        "分析安裝階段": f"#{install_index or '—'} {install_label}".strip(),
        "控制分析階段": f"#{control_index or '—'} {control_label}".strip(),
        "分析拆撐階段": f"#{removal_index} {removal_label}".strip() if removal_index else "未辨識拆撐事件",
        "拆撐後荷重處置": transfer_labels.get(transfer_mode, "未指定") if removal_index else "不適用",
        "拆撐後承接構造": str(getattr(row, "removal_transfer_target", "")).strip() or "—",
        "拆撐傳力方向": str(getattr(row, "removal_transfer_direction", "")).strip() or "—",
        "拆撐承接設計需求": f"{receiver_demand:g} tf" if removal_index and receiver_demand is not None else "—",
        "拆撐處置依據": str(getattr(row, "removal_transfer_basis", "")).strip() or "—",
        "施工步驟": getattr(row, "construction_step_label", ""),
        "階段對應依據": getattr(row, "analysis_mapping_basis", ""),
        "分析階段候選數": len(cases),
        "分析階段內力": "；".join(
            f"#{case.stage_index} {case.stage_label} = {case.axial_force_t:g} tf"
            for case in cases
        ),
    }


def _validate_analysis_force_mapping(
    row: object,
    adopted_axial_force_t: float,
    *,
    adopted_tolerance_t: float = 0.001,
) -> tuple[object | None, str]:
    if getattr(row, "force_source", "manual") != "analysis_import":
        return None, ""
    cases = list(getattr(row, "analysis_stage_cases", []))
    if not cases:
        return None, "外部分析內力缺少控制階段候選值，無法確認控制階段。"
    if any(not math.isfinite(float(case.axial_force_t)) or float(case.axial_force_t) < 0 for case in cases):
        return None, "外部分析階段軸力必須為有限且不小於 0 的壓力值。"
    install_index = getattr(row, "analysis_install_stage_index", None)
    install_label = str(getattr(row, "analysis_install_stage_label", "")).strip()
    if install_index is None or not install_label:
        return None, "外部分析內力缺少支撐安裝階段；請重新匯入分析檔。"
    identities = [(case.stage_index, case.stage_label.strip().casefold()) for case in cases]
    if len(set(identities)) != len(identities):
        return None, "外部分析內力含重複的階段識別，無法建立唯一對應。"
    control_index = getattr(row, "analysis_control_stage_index", None)
    control_label = str(getattr(row, "analysis_control_stage_label", "")).strip()
    controls = [
        case for case in cases
        if case.stage_index == control_index and case.stage_label.strip() == control_label
    ]
    if len(controls) != 1:
        return None, "控制分析階段與控制階段候選值不一致。"
    if any(case.stage_index < install_index for case in cases):
        return None, "外部分析的控制內力階段早於支撐安裝階段，時序不成立。"
    control = controls[0]
    maximum_force = max(float(case.axial_force_t) for case in cases)
    if not math.isclose(float(control.axial_force_t), maximum_force, rel_tol=0.0, abs_tol=1e-6):
        return None, "控制分析階段不是本列控制階段軸力包絡最大值。"
    removal_index = getattr(row, "analysis_removal_stage_index", None)
    removal_label = str(getattr(row, "analysis_removal_stage_label", "")).strip()
    if (removal_index is None) != (not removal_label):
        return None, "外部分析的拆撐階段編號與名稱不完整。"
    if removal_index is not None and removal_index <= max(case.stage_index for case in cases):
        return None, "外部分析的拆撐階段未晚於控制內力階段，時序不成立。"
    transfer_mode = str(getattr(row, "removal_transfer_mode", "unassigned"))
    transfer_target = str(getattr(row, "removal_transfer_target", "")).strip()
    transfer_direction = str(getattr(row, "removal_transfer_direction", "")).strip()
    transfer_basis = str(getattr(row, "removal_transfer_basis", "")).strip()
    transfer_confirmed = bool(getattr(row, "removal_transfer_confirmed", False))
    if removal_index is not None:
        if transfer_mode == "unassigned":
            return None, "已辨識拆撐階段，但尚未指定拆撐後荷重處置。"
        if transfer_mode != "outside_scope" and not transfer_target:
            return None, "拆撐後荷重處置必須填寫承接構造或指定對象。"
        if not transfer_direction:
            return None, "拆撐後荷重處置必須填寫傳力方向或作用線。"
        if not transfer_basis:
            return None, "拆撐後荷重處置必須填寫正式分析、施工順序圖或專案文件依據。"
        if not transfer_confirmed:
            return None, "尚未確認拆撐後荷重處置及其承接構造檢核邊界。"
    elif transfer_mode != "unassigned" or transfer_target or transfer_direction or transfer_basis or transfer_confirmed:
        return None, "未辨識拆撐階段，不得保留拆撐後荷重處置資料。"
    if not math.isclose(
        adopted_axial_force_t,
        float(control.axial_force_t),
        rel_tol=0.0,
        abs_tol=adopted_tolerance_t,
    ):
        return None, "目前採用內力與控制分析階段軸力不一致，請重新套用分析候選值。"
    if not bool(getattr(row, "analysis_mapping_confirmed", False)):
        return None, "尚未確認控制分析階段與實際施工步驟的對應。"
    if not str(getattr(row, "construction_step_label", "")).strip():
        return None, "採用外部分析內力時必須填寫實際施工步驟。"
    if not str(getattr(row, "analysis_mapping_basis", "")).strip():
        return None, "採用外部分析內力時必須填寫階段對應依據。"
    return control, ""


def _analysis_stage_envelope(
    row: object,
    ratio_for_force: Callable[[float], float],
) -> dict[str, object]:
    """Evaluate every imported construction stage instead of trusting force rank alone."""
    if getattr(row, "force_source", "manual") != "analysis_import":
        return {}
    evaluated = [
        (
            int(case.stage_index),
            str(case.stage_label),
            float(case.axial_force_t),
            float(ratio_for_force(float(case.axial_force_t))),
        )
        for case in getattr(row, "analysis_stage_cases", [])
    ]
    if not evaluated:
        return {}
    controlling = max(evaluated, key=lambda item: item[3])
    return {
        "analysis_stage_utilization_envelope": [
            f"#{stage_index} {stage_label}: N={force_t:g} tf, R={ratio:.3f}"
            for stage_index, stage_label, force_t, ratio in evaluated
        ],
        "analysis_utilization_controlling_stage": f"#{controlling[0]} {controlling[1]}",
        "analysis_utilization_controlling_ratio": round(controlling[3], 6),
    }


def calculate_horizontal_support(row: SupportRow, params: BasicParameters, module_name: str) -> CheckResult:
    label = _layer_label(row.level_label)
    inputs = {
        "軸力 N1": row.axial_force_t,
        "溫度荷重 N2": row.temp_force_t,
        "水平間距 SL": row.spacing_m,
        "型號": row.section_name,
        **_analysis_mapping_inputs(row),
    }
    section, invalid = _resolve_section(module_name, label, "support_interaction", row.section_name, inputs)
    if invalid:
        return invalid
    _, mapping_error = _validate_analysis_force_mapping(row, row.axial_force_t)
    if mapping_error:
        return _incomplete_check(
            module_name,
            label,
            "support_interaction",
            mapping_error,
            inputs,
        )
    if row.spacing_m <= 0:
        return _incomplete_check(
            module_name,
            label,
            "support_interaction",
            "請輸入大於 0 的水平間距。",
            inputs,
        )
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    klr = row.spacing_m * 100.0 / section.ry_cm
    fa_allow = allowable_axial_stress(
        klr,
        cc_value(params),
        params.e_tf_per_cm2,
        params.fy_tf_per_cm2,
    ) * params.alpha_support
    line_load = section.unit_weight_kgf_per_m / 1000.0 + params.surcharge_wl_tf_per_m
    moment = line_load * row.spacing_m**2 / 8.0
    fbx_stress = moment * 100.0 / section.sx_cm3
    fby_stress = 0.0
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.spacing_m * 100.0 / section.rx_cm) ** 2)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.spacing_m * 100.0 / section.ry_cm) ** 2)
    def evaluate_force(axial_force_t: float) -> tuple[float, float, str, float, float, float]:
        total_force_t = axial_force_t + row.temp_force_t
        stress = total_force_t / section.area_cm2
        classification = classify_column_section(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
            stress,
        )
        allowable_fbx_value = allowable_fbx(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            section.rt_cm,
            row.spacing_m * 100.0,
            lc,
            1.0,
            params.fy_tf_per_cm2,
            classification,
        ) * params.alpha_support
        allowable_fby_value = allowable_fby(
            section.flange_width_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
            classification,
        ) * params.alpha_support
        interaction = interaction_ratio(
            params.fy_tf_per_cm2,
            stress,
            fa_allow,
            fbx_stress,
            allowable_fbx_value,
            fby_stress,
            allowable_fby_value,
            fex,
            fey,
            params.cm_factor,
            params.cm_factor,
        ) / params.psi_material
        return interaction, total_force_t, classification, stress, allowable_fbx_value, allowable_fby_value

    ratio, total_force, section_class, axial_stress, fbx_allow, fby_allow = evaluate_force(row.axial_force_t)
    stage_envelope = _analysis_stage_envelope(row, lambda force: evaluate_force(force)[0])
    status = _status_with_margin(ratio)
    return CheckResult(
        module_name=module_name,
        label=label,
        formula_id="support_interaction",
        inputs=inputs,
        computed_value=round(ratio, 3),
        allowable_value=1.0,
        utilization_ratio=round(ratio, 3),
        status=status,
        controlling_condition="軸力與撓曲交互作用比",
        details={
            **_section_snapshot(section),
            "area_cm2": section.area_cm2,
            "total_force_t": round(total_force, 4),
            "lc_cm": round(lc, 4),
            "klr": round(klr, 4),
            "axial_stress": round(axial_stress, 4),
            "fa_allow": round(fa_allow, 4),
            "section_class": section_class,
            "line_load": round(line_load, 4),
            "moment_tf_m": round(moment, 4),
            "fbx_stress": round(fbx_stress, 4),
            "fbx_allow": round(fbx_allow, 4),
            "fby_allow": round(fby_allow, 4),
            "fex": round(fex, 4),
            "fey": round(fey, 4),
            **stage_envelope,
        },
    )


def calculate_wale(
    row: WaleRow,
    params: BasicParameters,
    module_name: str,
    consider_wall_deduction: bool = True,
) -> CheckResult:
    label = _layer_label(row.level_label)
    inputs = {
        "跨度 Lw": row.span_m,
        "支撐間距 SS": row.support_spacing_m,
        "線載重 Ww": row.line_load_tf_per_m,
        "支數": row.wale_count,
        "型號": row.section_name,
    }
    section, invalid = _resolve_section(module_name, label, "wale_bending_shear", row.section_name, inputs)
    if invalid:
        return invalid
    if row.span_m <= 0:
        return _incomplete_check(
            module_name,
            label,
            "wale_bending_shear",
            "請輸入大於 0 的橫擋跨度。",
            inputs,
        )
    if row.wale_count <= 0:
        return _incomplete_check(
            module_name,
            label,
            "wale_bending_shear",
            "請輸入至少 1 支橫擋。",
            inputs,
        )
    wall_moment = wall_moment_strength(params) if consider_wall_deduction else 0.0
    wall_shear = wall_shear_strength(params) if consider_wall_deduction else 0.0
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    section_class = classify_beam_section(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
    )
    # Wall resistance can offset part of the wale demand; net demand should not go below zero.
    moment = max(0.0, row.line_load_tf_per_m * row.span_m**2 / 10.0 - wall_moment)
    shear = max(0.0, row.line_load_tf_per_m * row.span_m / 2.0 - wall_shear)
    fbx_stress = moment * 100.0 / (section.sx_cm3 * max(row.wale_count, 1))
    fv_stress = shear / (section.depth_cm * section.web_thickness_cm) / max(row.wale_count, 1)
    fbx_allow = allowable_fbx(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        section.rt_cm,
        row.span_m * 100.0,
        lc,
        1.0,
        params.fy_tf_per_cm2,
        section_class,
    )
    fv_allow = 0.4 * params.fy_tf_per_cm2
    bending_ratio = fbx_stress / max(fbx_allow * params.alpha_wale * params.psi_material, 1e-6)
    shear_ratio = fv_stress / max(fv_allow * params.alpha_wale * params.psi_material, 1e-6)
    final_ratio = max(bending_ratio, shear_ratio)
    status = _status_with_margin(final_ratio)
    if moment == 0.0 and shear == 0.0:
        controlling = "牆體抵抗已抵銷橫擋淨需求"
    else:
        controlling = "彎曲強度" if bending_ratio >= shear_ratio else "剪力強度"
    return CheckResult(
        module_name=module_name,
        label=label,
        formula_id="wale_bending_shear",
        inputs=inputs,
        computed_value=fbx_stress if controlling == "彎曲強度" else fv_stress,
        allowable_value=(fbx_allow if controlling == "彎曲強度" else fv_allow)
        * params.alpha_wale
        * params.psi_material,
        utilization_ratio=round(final_ratio, 3),
        status=status,
        controlling_condition=controlling,
        details={
            **_section_snapshot(section),
            "section_class": section_class,
            "lc_cm": round(lc, 4),
            "moment_tf_m": round(moment, 4),
            "shear_tf": round(shear, 4),
            "fbx_stress": round(fbx_stress, 4),
            "fv_stress": round(fv_stress, 4),
            "fbx_allow": round(fbx_allow, 4),
            "fv_allow": round(fv_allow, 4),
            "wall_moment_strength": round(wall_moment, 4),
            "wall_shear_strength": round(wall_shear, 4),
            "bending_ratio": round(bending_ratio, 4),
            "shear_ratio": round(shear_ratio, 4),
            "consider_wall_deduction": consider_wall_deduction,
        },
    )


def calculate_brace(row: BraceRow, params: BasicParameters, module_name: str) -> CheckResult:
    label = _layer_label(row.level_label)
    inputs = {
        "L1": row.l1_m,
        "L2": row.l2_m,
        "θ": row.angle_deg,
        "Ww": row.tributary_line_load_tf_per_m,
        "型號": row.section_name,
        **_analysis_mapping_inputs(row),
    }
    section, invalid = _resolve_section(module_name, label, "brace_interaction", row.section_name, inputs)
    if invalid:
        return invalid
    if row.l1_m <= 0 or row.l2_m <= 0:
        return _incomplete_check(
            module_name,
            label,
            "brace_interaction",
            "請輸入大於 0 的斜撐幾何長度 L1、L2。",
            inputs,
        )
    if row.angle_deg <= 0 or row.angle_deg >= 90:
        return _incomplete_check(
            module_name,
            label,
            "brace_interaction",
            "斜撐角度需介於 0 到 90 度之間。",
            inputs,
        )
    l3 = (row.l1_m + row.l2_m) / 2.0
    lb = round(row.l1_m / max(math.cos(math.radians(row.angle_deg)), 1e-6), 2)
    axial_force = row.tributary_line_load_tf_per_m * l3 / max(math.sin(math.radians(row.angle_deg)), 1e-6)
    # Imported brace line load is stored to 0.001 tf/m, so the reconstructed
    # axial force needs a small engineering-unit tolerance for round-trip use.
    control_case, mapping_error = _validate_analysis_force_mapping(
        row,
        axial_force,
        adopted_tolerance_t=0.05,
    )
    if mapping_error:
        return _incomplete_check(
            module_name,
            label,
            "brace_interaction",
            mapping_error,
            inputs,
        )
    if control_case is not None:
        # The imported stage force is authoritative; the line load is a rounded
        # UI reconstruction and is only used to verify that mapping has not drifted.
        axial_force = float(control_case.axial_force_t)
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    klr = lb * 100.0 / section.ry_cm
    fa_allow = allowable_axial_stress(
        klr,
        cc_value(params),
        params.e_tf_per_cm2,
        params.fy_tf_per_cm2,
    ) * params.alpha_brace
    line_load = section.unit_weight_kgf_per_m / 1000.0
    moment = line_load * lb**2 / 8.0
    fbx_stress = moment * 100.0 / section.sx_cm3
    fby_stress = 0.0
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((lb * 100.0 / section.rx_cm) ** 2)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((lb * 100.0 / section.ry_cm) ** 2)
    def evaluate_force(force_t: float) -> tuple[float, float, str, float, float]:
        stress = force_t / section.area_cm2
        classification = classify_column_section(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
            stress,
        )
        allowable_fbx_value = allowable_fbx(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            section.rt_cm,
            lb * 100.0,
            lc,
            1.0,
            params.fy_tf_per_cm2,
            classification,
        ) * params.alpha_brace
        allowable_fby_value = allowable_fby(
            section.flange_width_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
            classification,
        ) * params.alpha_brace
        interaction = interaction_ratio(
            params.fy_tf_per_cm2,
            stress,
            fa_allow,
            fbx_stress,
            allowable_fbx_value,
            fby_stress,
            allowable_fby_value,
            fex,
            fey,
            params.cm_factor,
            params.cm_factor,
        ) / params.psi_material
        return interaction, stress, classification, allowable_fbx_value, allowable_fby_value

    ratio, fa_value, section_class, fbx_allow, fby_allow = evaluate_force(axial_force)
    stage_envelope = _analysis_stage_envelope(row, lambda force: evaluate_force(force)[0])
    return CheckResult(
        module_name=module_name,
        label=label,
        formula_id="brace_interaction",
        inputs=inputs,
        computed_value=round(ratio, 3),
        allowable_value=1.0,
        utilization_ratio=round(ratio, 3),
        status="NG" if ratio > 1.0 else "OK",
        controlling_condition="軸力與撓曲交互作用比",
        details={
            **_section_snapshot(section),
            "l3_m": round(l3, 3),
            "lb_m": lb,
            "lc_cm": round(lc, 4),
            "klr": round(klr, 4),
            "axial_force_t": round(axial_force, 4),
            "self_weight_tf_per_m": round(line_load, 4),
            "fa_value": round(fa_value, 4),
            "fa_allow": round(fa_allow, 4),
            "section_class": section_class,
            "moment_tf_m": round(moment, 4),
            "fbx_stress": round(fbx_stress, 4),
            "fbx_allow": round(fbx_allow, 4),
            "fby_allow": round(fby_allow, 4),
            "fex": round(fex, 4),
            "fey": round(fey, 4),
            **stage_envelope,
        },
    )


def calculate_corner_brace(row: CornerBraceRow, params: BasicParameters) -> CheckResult:
    label = _layer_label(row.level_label)
    inputs = {"長度 La": row.length_m, "軸力 Na": row.axial_force_t, "型號": row.section_name}
    section, invalid = _resolve_section("大角撐", label, "corner_brace_interaction", row.section_name, inputs)
    if invalid:
        return invalid
    if row.length_m <= 0:
        return _incomplete_check(
            "大角撐",
            label,
            "corner_brace_interaction",
            "請輸入大於 0 的大角撐長度。",
            inputs,
        )
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    klr = row.length_m * 100.0 / section.ry_cm
    fa_value = row.axial_force_t / section.area_cm2
    fa_allow = allowable_axial_stress(
        klr,
        cc_value(params),
        params.e_tf_per_cm2,
        params.fy_tf_per_cm2,
    ) * params.alpha_corner_brace
    section_class = classify_column_section(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        fa_value,
    )
    line_load = section.unit_weight_kgf_per_m / 1000.0
    moment = line_load * row.length_m**2 / 8.0
    fbx_stress = moment * 100.0 / section.sx_cm3
    fbx_allow = allowable_fbx(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        section.rt_cm,
        row.length_m * 100.0,
        lc,
        1.0,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_corner_brace
    fby_allow = allowable_fby(
        section.flange_width_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_corner_brace
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.length_m * 100.0 / section.rx_cm) ** 2)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.length_m * 100.0 / section.ry_cm) ** 2)
    ratio = interaction_ratio(
        params.fy_tf_per_cm2,
        fa_value,
        fa_allow,
        fbx_stress,
        fbx_allow,
        0.0,
        max(fby_allow, 1e-6),
        fex,
        fey,
        params.cm_factor,
        params.cm_factor,
    ) / params.psi_material
    return CheckResult(
        module_name="大角撐",
        label=label,
        formula_id="corner_brace_interaction",
        inputs=inputs,
        computed_value=round(ratio, 3),
        allowable_value=1.0,
        utilization_ratio=round(ratio, 3),
        status="NG" if ratio > 1.0 else "OK",
        controlling_condition="軸力與撓曲交互作用比",
        details={
            **_section_snapshot(section),
            "length_m": round(row.length_m, 4),
            "axial_force_t": round(row.axial_force_t, 4),
            "lc_cm": round(lc, 4),
            "klr": round(klr, 4),
            "fa_value": round(fa_value, 4),
            "fa_allow": round(fa_allow, 4),
            "section_class": section_class,
            "moment_tf_m": round(moment, 4),
            "self_weight_tf_per_m": round(line_load, 4),
            "fbx_stress": round(fbx_stress, 4),
            "fbx_allow": round(fbx_allow, 4),
            "fby_allow": round(fby_allow, 4),
            "fex": round(fex, 4),
            "fey": round(fey, 4),
        },
    )


def calculate_column_scenario(
    column: ColumnScenarioInput,
    params: BasicParameters,
    distribution_error: str = "",
) -> CheckResult:
    inputs = {
        "型號": column.column_section_name,
        "基礎型式": column.foundation_type,
        "基礎形狀": column.foundation_shape,
        "基礎尺寸 Bx": round(column.foundation_size_x_m, 3),
        "基礎尺寸 By": round(column.foundation_size_y_m, 3),
        "埋置深度": round(column.embedment_length_cm / 100.0, 3),
        "FS壓入": round(column.compression_fs, 3),
        "FS拉拔": round(column.tension_fs, 3),
        "Kh": round(column.kh_kg_per_cm3, 3),
    }
    section, invalid = _resolve_section("柱構件", column.title, "column_interaction", column.column_section_name, inputs)
    if invalid:
        return invalid
    invalid_support_rows = [
        row.level_label or str(index + 1)
        for index, row in enumerate(column.support_rows)
        if not row.section_name.strip()
    ]
    if invalid_support_rows:
        return _incomplete_check(
            "柱構件",
            column.title,
            "column_interaction",
            f"支撐層 {', '.join(invalid_support_rows)} 尚未選擇型鋼型號，請先完成支撐選型。",
            inputs,
        )
    stage_cases, stage_error = _construction_stage_load_cases(column)
    if stage_error:
        return _incomplete_check(
            "柱構件",
            column.title,
            "column_interaction",
            stage_error,
            inputs,
        )
    if distribution_error:
        return _incomplete_check(
            "柱構件",
            column.title,
            "column_interaction",
            distribution_error,
            inputs,
        )
    if len(stage_cases) > 1 and column.variant == "middle":
        return _incomplete_check(
            "柱構件",
            column.title,
            "column_interaction",
            "施工構台荷重只能套用於共構柱情境。",
            inputs,
        )
    n1 = sum(params.surcharge_wl_tf_per_m * row.spacing_m * row.support_count for row in column.support_rows)
    n2 = sum(find_section(row.section_name).unit_weight_kgf_per_m / 1000.0 * row.support_count * row.spacing_m for row in column.support_rows)
    n3 = sum((row.axial_force_t + row.temp_force_t) / 100.0 * 4.0 for row in column.support_rows)
    n4 = section.unit_weight_kgf_per_m / 1000.0 * column.column_length_m
    e_x = column.eccentricity_x_m if column.eccentricity_x_m is not None else section.depth_cm / 200.0 + 0.2
    e_y = column.eccentricity_y_m
    base_mx = n3 * e_x
    pile_width_cm = column.pile_width_cm or section.flange_width_cm
    beta = ((column.kh_kg_per_cm3 * pile_width_cm) / (4.0 * params.e_tf_per_cm2 * 1000.0 * section.iy_cm4)) ** 0.25
    l0 = 1.0 / max(beta, 1e-8) / 100.0
    unsupported_length_m = l0 + column.bottom_to_excavation_distance_m
    klr_x = unsupported_length_m * 100.0 / section.rx_cm
    klr_y = unsupported_length_m * 100.0 / section.ry_cm
    fa_allow = allowable_axial_stress(klr_y, cc_value(params), params.e_tf_per_cm2, params.fy_tf_per_cm2) * params.alpha_column
    fbx_allow = 0.66 * params.fy_tf_per_cm2 * params.alpha_column
    fby_allow = 0.75 * params.fy_tf_per_cm2 * params.alpha_column
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / max(klr_x**2, 1e-6)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / max(klr_y**2, 1e-6)
    compression = _compression_breakdown(column, section)
    tension = _tension_breakdown(column, section)
    compression_capacity = compression["allowable_t"]
    tension_capacity = tension["allowable_t"]
    evaluated_cases: list[dict[str, object]] = []
    for stage in stage_cases:
        platform_load = float(stage["load_t"])
        total_n = platform_load + n1 + n2 + n3 + n4
        pt = max(0.0, n3 - n4 - n2 - n1 - platform_load)
        transfer_eccentricity_x_m = float(stage.get("transfer_eccentricity_x_m", 0.0))
        transfer_eccentricity_y_m = float(stage.get("transfer_eccentricity_y_m", 0.0))
        transfer_mx = platform_load * transfer_eccentricity_x_m
        transfer_my = platform_load * transfer_eccentricity_y_m
        mx = base_mx + transfer_mx
        my = total_n * e_y + transfer_my
        fa_value = total_n / section.area_cm2
        fbx_value = abs(mx) * 100.0 / section.sx_cm3
        fby_value = abs(my) * 100.0 / section.sy_cm3 if section.sy_cm3 else 0.0
        ratio = interaction_ratio(
            params.fy_tf_per_cm2,
            fa_value,
            fa_allow,
            fbx_value,
            fbx_allow,
            fby_value,
            fby_allow,
            fex,
            fey,
            1.0,
            1.0,
        ) / params.psi_material
        evaluated_cases.append({
            **stage,
            "total_n": total_n,
            "pt": pt,
            "mx": mx,
            "my": my,
            "transfer_mx": transfer_mx,
            "transfer_my": transfer_my,
            "fa_value": fa_value,
            "fbx_value": fbx_value,
            "fby_value": fby_value,
            "interaction_ratio": ratio,
            "compression_ratio": total_n / max(compression_capacity, 1e-6),
            "tension_ratio": pt / max(tension_capacity, 1e-6) if pt > 0 else 0.0,
        })
    interaction_control = max(evaluated_cases, key=lambda item: float(item["interaction_ratio"]))
    compression_control = max(evaluated_cases, key=lambda item: float(item["compression_ratio"]))
    tension_control = max(evaluated_cases, key=lambda item: float(item["tension_ratio"]))
    platform_load = float(interaction_control["load_t"])
    platform_source = interaction_control.get("source")
    total_n = float(interaction_control["total_n"])
    pt = float(interaction_control["pt"])
    mx = float(interaction_control["mx"])
    my = float(interaction_control["my"])
    fa_value = float(interaction_control["fa_value"])
    fbx_value = float(interaction_control["fbx_value"])
    fby_value = float(interaction_control["fby_value"])
    ratio = float(interaction_control["interaction_ratio"])
    compression_ratio = float(compression_control["compression_ratio"])
    tension_ratio = float(tension_control["tension_ratio"])
    warnings: list[str] = []
    if compression_ratio > 1.0:
        warnings.append(f"壓入力檢核未通過（控制階段：{compression_control['stage_label']}）")
    if tension_ratio > 1.0:
        warnings.append(f"拉拔力檢核未通過（控制階段：{tension_control['stage_label']}）")
    stage_envelope = [
        {
            "stage_id": item["stage_id"],
            "stage_label": item["stage_label"],
            "target_column_id": item["target_column_id"],
            "source_Np": round(float(item.get("source_load_t", item["load_t"])), 3),
            "distribution_factor": round(float(item.get("distribution_factor", 1.0)), 6),
            "distribution_basis": str(item.get("distribution_basis", "")),
            "Np": round(float(item["load_t"]), 3),
            "N": round(float(item["total_n"]), 3),
            "PT": round(float(item["pt"]), 3),
            "apply_transfer_eccentricity": bool(item.get("apply_transfer_eccentricity", False)),
            "transfer_eccentricity_x_m": round(float(item.get("transfer_eccentricity_x_m", 0.0)), 4),
            "transfer_eccentricity_y_m": round(float(item.get("transfer_eccentricity_y_m", 0.0)), 4),
            "transfer_basis": str(item.get("transfer_basis", "")),
            "transfer_mx_tf_m": round(float(item["transfer_mx"]), 4),
            "transfer_my_tf_m": round(float(item["transfer_my"]), 4),
            "Mx": round(float(item["mx"]), 4),
            "My": round(float(item["my"]), 4),
            "fbx_value": round(float(item["fbx_value"]), 4),
            "fby_value": round(float(item["fby_value"]), 4),
            "interaction_ratio": round(float(item["interaction_ratio"]), 4),
            "compression_ratio": round(float(item["compression_ratio"]), 4),
            "tension_ratio": round(float(item["tension_ratio"]), 4),
            "source_tool": getattr(item.get("source"), "source_tool", "") if item.get("source") else "",
            "source_version": getattr(item.get("source"), "source_version", "") if item.get("source") else "",
            "source_calculation_fingerprint": getattr(item.get("source"), "source_calculation_fingerprint", "") if item.get("source") else "",
            "handoff_fingerprint": getattr(item.get("source"), "handoff_fingerprint", "") if item.get("source") else "",
            "controlling_cases": list(getattr(item.get("source"), "controlling_cases", [])) if item.get("source") else [],
        }
        for item in evaluated_cases
    ]
    return CheckResult(
        module_name="柱構件",
        label=column.title,
        formula_id="column_interaction",
        inputs={
            **inputs,
            "N1": round(n1, 3),
            "N2": round(n2, 3),
            "N3": round(n3, 3),
            "N4": round(n4, 3),
            "Np": round(platform_load, 3),
            "來源 Np": round(float(interaction_control.get("source_load_t", platform_load)), 3),
            "反力分配比例": round(float(interaction_control.get("distribution_factor", 1.0)), 6),
            "反力分配依據": str(interaction_control.get("distribution_basis", "")),
            "N": round(total_n, 3),
            "PT": round(pt, 3),
            "施工階段": interaction_control["stage_label"],
            "施工階段編號": interaction_control["stage_id"],
            "施工階段包絡數": len(evaluated_cases),
            "施工構台荷重來源": getattr(platform_source, "source_tool", "") if platform_source else "",
            "來源工具版本": getattr(platform_source, "source_version", "") if platform_source else "",
            "來源計算指紋": getattr(platform_source, "source_calculation_fingerprint", "") if platform_source else "",
            "交接指紋": getattr(platform_source, "handoff_fingerprint", "") if platform_source else "",
            "來源控制工況": ", ".join(getattr(platform_source, "controlling_cases", [])) if platform_source else "",
        },
        computed_value=round(ratio, 3),
        allowable_value=1.0,
        utilization_ratio=round(ratio, 3),
        status=_status_with_margin(ratio),
        controlling_condition="柱軸力與彎矩交互作用比",
        details={
            **_section_snapshot(section),
            "fa_value": round(fa_value, 4),
            "mx_tf_m": round(mx, 4),
            "my_tf_m": round(my, 4),
            "fbx_value": round(fbx_value, 4),
            "fby_value": round(fby_value, 4),
            "beta": round(beta, 6),
            "l0_m": round(l0, 4),
            "unsupported_length_m": round(unsupported_length_m, 4),
            "klr_x": round(klr_x, 4),
            "klr_y": round(klr_y, 4),
            "e_x_m": round(e_x, 4),
            "e_y_m": round(e_y, 4),
            "fa_allow": round(fa_allow, 4),
            "fbx_allow": round(fbx_allow, 4),
            "fby_allow": round(fby_allow, 4),
            "fex": round(fex, 4),
            "fey": round(fey, 4),
            "compression_capacity_t": round(compression_capacity, 3),
            "tension_capacity_t": round(tension_capacity, 3),
            "compression_skin_t": round(compression["skin_t"], 3),
            "compression_tip_t": round(compression["tip_t"], 3),
            "compression_ratio": round(compression_ratio, 4),
            "compression_fs": round(column.compression_fs, 3),
            "tension_skin_t": round(tension["skin_t"], 3),
            "tension_self_weight_t": round(tension["self_weight_t"], 3),
            "tension_ratio": round(tension_ratio, 4),
            "tension_fs": round(column.tension_fs, 3),
            "foundation_area_cm2": round(compression["tip_area_cm2"], 3),
            "foundation_perimeter_cm": round(compression["perimeter_cm"], 3),
            "effective_embedment_m": round(compression["effective_embedment_m"], 3),
            "foundation_size_x_m": round(column.foundation_size_x_m, 3),
            "foundation_size_y_m": round(column.foundation_size_y_m, 3),
            "foundation_shape": column.foundation_shape,
            "foundation_type": column.foundation_type,
            "kh_kg_per_cm3": round(column.kh_kg_per_cm3, 3),
            "warnings": warnings,
            "construction_stage_envelope": stage_envelope,
            "construction_stage_controls": {
                "interaction": {
                    "stage_id": interaction_control["stage_id"],
                    "stage_label": interaction_control["stage_label"],
                    "Np": round(platform_load, 3),
                    "source_Np": round(float(interaction_control.get("source_load_t", platform_load)), 3),
                    "distribution_factor": round(float(interaction_control.get("distribution_factor", 1.0)), 6),
                    "distribution_basis": str(interaction_control.get("distribution_basis", "")),
                    "N": round(total_n, 3),
                    "transfer_eccentricity_x_m": round(float(interaction_control.get("transfer_eccentricity_x_m", 0.0)), 4),
                    "transfer_eccentricity_y_m": round(float(interaction_control.get("transfer_eccentricity_y_m", 0.0)), 4),
                    "transfer_mx_tf_m": round(float(interaction_control["transfer_mx"]), 4),
                    "transfer_my_tf_m": round(float(interaction_control["transfer_my"]), 4),
                    "transfer_basis": str(interaction_control.get("transfer_basis", "")),
                    "Mx": round(mx, 4),
                    "My": round(my, 4),
                    "ratio": round(ratio, 4),
                },
                "compression": {"stage_id": compression_control["stage_id"], "stage_label": compression_control["stage_label"], "Np": round(float(compression_control["load_t"]), 3), "N": round(float(compression_control["total_n"]), 3), "ratio": round(compression_ratio, 4)},
                "tension": {"stage_id": tension_control["stage_id"], "stage_label": tension_control["stage_label"], "Np": round(float(tension_control["load_t"]), 3), "PT": round(float(tension_control["pt"]), 3), "ratio": round(tension_ratio, 4)},
            },
            "construction_stage_assignment_count": max(len(evaluated_cases) - 1, 0),
        },
    )


def _construction_stage_load_cases(column: ColumnScenarioInput) -> tuple[list[dict[str, object]], str]:
    baseline = {
        "stage_id": "BASE",
        "stage_label": "無施工構台荷重基準案",
        "target_column_id": column.column_id or "LEGACY-COLUMN",
        "source_load_t": 0.0,
        "load_t": 0.0,
        "distribution_factor": 1.0,
        "distribution_basis": "",
        "apply_transfer_eccentricity": False,
        "transfer_eccentricity_x_m": 0.0,
        "transfer_eccentricity_y_m": 0.0,
        "transfer_basis": "",
        "source": None,
    }
    adoptions = list(column.construction_stage_loads)
    if not adoptions and column.construction_stage_load_t > 0:
        source = column.construction_stage_load_source
        valid, message = _validate_construction_stage_handoff(column.construction_stage_load_t, source)
        if not valid:
            return [baseline], message
        return [
            baseline,
            {
                "stage_id": f"LEGACY-{source.handoff_fingerprint[4:]}",
                "stage_label": "舊案單一施工階段",
                "target_column_id": column.column_id or "LEGACY-COLUMN",
                "source_load_t": column.construction_stage_load_t,
                "load_t": column.construction_stage_load_t,
                "distribution_factor": 1.0,
                "distribution_basis": "",
                "apply_transfer_eccentricity": False,
                "transfer_eccentricity_x_m": 0.0,
                "transfer_eccentricity_y_m": 0.0,
                "transfer_basis": "",
                "source": source,
            },
        ], ""
    if not adoptions:
        return [baseline], ""
    if not column.column_id.strip():
        return [baseline], "共構柱缺少固定柱識別碼，無法確認施工階段荷重對應。"
    seen_ids: set[str] = set()
    seen_labels: set[str] = set()
    seen_fingerprints: set[str] = set()
    cases = [baseline]
    for adoption in adoptions:
        stage_id = adoption.stage_id.strip().upper()
        stage_label = adoption.stage_label.strip()
        if not re.fullmatch(r"STG-[0-9A-F]{20}", stage_id):
            return [baseline], "施工階段識別碼格式不正確。"
        if not stage_label or len(stage_label) > 80:
            return [baseline], "施工階段名稱必須為 1 至 80 個字元。"
        if adoption.target_column_id != column.column_id:
            return [baseline], f"施工階段「{stage_label}」所綁定的柱識別碼與目前共構柱不一致。"
        fingerprint = adoption.source.handoff_fingerprint
        if fingerprint in seen_fingerprints:
            return [baseline], "同一共構柱不得重複採用相同覆工板交接檔。"
        if stage_id in seen_ids:
            return [baseline], "同一共構柱不得有重複的施工階段識別碼。"
        normalized_label = stage_label.casefold()
        if normalized_label in seen_labels:
            return [baseline], "同一共構柱不得有重複的施工階段名稱。"
        valid, message = _validate_construction_stage_handoff(adoption.load_t, adoption.source)
        if not valid:
            return [baseline], f"施工階段「{stage_label}」：{message}"
        if not math.isfinite(adoption.distribution_factor) or not 0.0 < adoption.distribution_factor <= 1.0:
            return [baseline], f"施工階段「{stage_label}」反力分配比例必須大於 0 且不超過 100%。"
        if not math.isfinite(adoption.transfer_eccentricity_x_m) or not math.isfinite(adoption.transfer_eccentricity_y_m):
            return [baseline], f"施工階段「{stage_label}」附加偏心必須為有限數值。"
        has_transfer_eccentricity = (
            abs(adoption.transfer_eccentricity_x_m) > 1e-12
            or abs(adoption.transfer_eccentricity_y_m) > 1e-12
        )
        if adoption.apply_transfer_eccentricity and not has_transfer_eccentricity:
            return [baseline], f"施工階段「{stage_label}」已勾選採用附加偏心，但 X、Y 偏心均為 0。"
        if not adoption.apply_transfer_eccentricity and has_transfer_eccentricity:
            return [baseline], f"施工階段「{stage_label}」尚未明確勾選採用附加偏心。"
        if adoption.apply_transfer_eccentricity and not adoption.transfer_basis.strip():
            return [baseline], f"施工階段「{stage_label}」採用附加偏心時必須填寫採用依據。"
        seen_ids.add(stage_id)
        seen_labels.add(normalized_label)
        seen_fingerprints.add(fingerprint)
        cases.append({
            "stage_id": stage_id,
            "stage_label": stage_label,
            "target_column_id": adoption.target_column_id,
            "source_load_t": adoption.load_t,
            "load_t": adoption.load_t * adoption.distribution_factor,
            "distribution_factor": adoption.distribution_factor,
            "distribution_basis": adoption.distribution_basis.strip(),
            "apply_transfer_eccentricity": adoption.apply_transfer_eccentricity,
            "transfer_eccentricity_x_m": adoption.transfer_eccentricity_x_m,
            "transfer_eccentricity_y_m": adoption.transfer_eccentricity_y_m,
            "transfer_basis": adoption.transfer_basis.strip(),
            "source": adoption.source,
        })
    return cases, ""


def _construction_stage_distribution_errors(project: ProjectState) -> dict[int, str]:
    """Validate that each verified decking reaction is distributed exactly once."""
    groups: dict[str, list[tuple[int, str, float, str]]] = {}
    for column_index, column in enumerate(project.columns):
        if not column.enabled:
            continue
        if column.construction_stage_loads:
            for adoption in column.construction_stage_loads:
                fingerprint = adoption.source.handoff_fingerprint.strip().upper()
                if not fingerprint:
                    continue
                groups.setdefault(fingerprint, []).append((
                    column_index,
                    adoption.stage_label.strip(),
                    adoption.distribution_factor,
                    adoption.distribution_basis.strip(),
                ))
        elif column.construction_stage_load_t > 0 and column.construction_stage_load_source:
            fingerprint = column.construction_stage_load_source.handoff_fingerprint.strip().upper()
            if fingerprint:
                groups.setdefault(fingerprint, []).append((
                    column_index,
                    "舊案單一施工階段",
                    1.0,
                    "",
                ))

    errors: dict[int, str] = {}
    for fingerprint, assignments in groups.items():
        if len({column_index for column_index, _, _, _ in assignments}) != len(assignments):
            message = f"交接指紋 {fingerprint} 含同柱重複採用，無法完成跨柱反力分配驗證。"
            for column_index, _, _, _ in assignments:
                errors.setdefault(column_index, message)
            # The duplicate column's local validator will provide the more specific message.
            continue
        factors = [factor for _, _, factor, _ in assignments]
        if any(not math.isfinite(factor) or not 0.0 < factor <= 1.0 for factor in factors):
            message = f"交接指紋 {fingerprint} 的反力分配比例必須大於 0 且不超過 100%。"
        else:
            total = sum(factors)
            if not math.isclose(total, 1.0, rel_tol=0.0, abs_tol=1e-6):
                message = f"交接指紋 {fingerprint} 的跨柱反力分配合計為 {total * 100:.2f}%，必須等於 100%。"
            elif len(assignments) > 1 and any(not basis for _, _, _, basis in assignments):
                message = f"交接指紋 {fingerprint} 分配至多根柱時，每一柱都必須填寫反力分配依據。"
            else:
                labels = {label.casefold() for _, label, _, _ in assignments}
                if len(assignments) > 1 and len(labels) > 1:
                    message = f"交接指紋 {fingerprint} 分配至多根柱時，施工階段名稱必須一致。"
                else:
                    continue
        for column_index, _, _, _ in assignments:
            errors.setdefault(column_index, message)
    return errors


def cc_value(params: BasicParameters) -> float:
    return math.sqrt(2.0 * math.pi**2 * params.e_tf_per_cm2 / params.fy_tf_per_cm2)


def _normalized_calculation_options(
    project: ProjectState,
) -> tuple[CalculationOptions, list[str]]:
    options = project.calculation_options.model_copy(deep=True)
    warnings: list[str] = []
    if options.include_top_supports or options.include_bottom_supports:
        return options, warnings

    if project.top_supports:
        options.include_top_supports = True
        warnings.append("水平支撐至少需納入一側，已暫以上層水平支撐進行檢核。")
        return options, warnings
    if project.bottom_supports:
        options.include_bottom_supports = True
        warnings.append("水平支撐至少需納入一側，已暫以下層水平支撐進行檢核。")
        return options, warnings

    options.include_top_supports = True
    warnings.append("本案未提供水平支撐列，且水平支撐模組至少應納入一側。")
    return options, warnings


def _all_support_rows(project: ProjectState, options: CalculationOptions) -> list[SupportRow]:
    rows: list[SupportRow] = []
    if options.include_top_supports:
        rows.extend(row.model_copy(deep=True) for row in project.top_supports)
    if options.include_bottom_supports:
        rows.extend(row.model_copy(deep=True) for row in project.bottom_supports)
    return rows


def _module_name(side: str, base_name: str, top_enabled: bool, bottom_enabled: bool) -> str:
    if top_enabled ^ bottom_enabled:
        return base_name
    prefix = "上層" if side == "top" else "下層"
    return f"{prefix}{base_name}"


def wall_moment_strength(params: BasicParameters) -> float:
    if params.wall_type != "連續壁":
        return 0.0
    return 0.9 * 2.0 * math.sqrt(params.wall_fc_kg_per_cm2) * (
        100.0 * params.wall_thickness_cm * params.wall_thickness_cm / 6.0
    ) / 100000.0


def wall_shear_strength(params: BasicParameters) -> float:
    if params.wall_type != "連續壁":
        return 0.0
    return (
        0.75
        * 0.53
        * math.sqrt(params.wall_fc_kg_per_cm2)
        * (100.0 * params.wall_thickness_cm)
        / 1000.0
    )


def _compression_breakdown(column: ColumnScenarioInput, section) -> dict[str, float]:
    tip_area_cm2, perimeter_cm = _foundation_dimensions(column, section)
    foundation_type = _normalized_foundation_type(column.foundation_type)
    total_skin = 0.0
    last_qb = 0.0
    effective_embedment = 0.0
    for soil, layer_length in _iter_effective_soil_segments(column):
        if layer_length <= 0:
            continue
        effective_embedment += layer_length
        if soil.soil_type == "clay":
            alpha = 0.45
            su = soil.su_t_per_m2 or 0.0
            total_skin += alpha * su * layer_length * perimeter_cm / 100.0
            last_qb = 6.0 * su * tip_area_cm2 / 10000.0
        else:
            n_value = soil.n_value or 0.0
            total_skin += (n_value / 3.0) * layer_length * perimeter_cm / 100.0
            qb_factor = 7.5 if foundation_type == "鑽掘或引孔樁" else 30.0
            last_qb = qb_factor * n_value * tip_area_cm2 / 10000.0
    allowable = (total_skin + last_qb) / max(column.compression_fs, 1e-6)
    return {
        "tip_area_cm2": tip_area_cm2,
        "perimeter_cm": perimeter_cm,
        "skin_t": total_skin,
        "tip_t": last_qb,
        "allowable_t": allowable,
        "effective_embedment_m": effective_embedment,
    }


def _compression_capacity(column: ColumnScenarioInput, section) -> float:
    return _compression_breakdown(column, section)["allowable_t"]


def _tension_breakdown(column: ColumnScenarioInput, section) -> dict[str, float]:
    tip_area_cm2, perimeter_cm = _foundation_dimensions(column, section)
    total_skin = 0.0
    effective_embedment = 0.0
    for soil, layer_length in _iter_effective_soil_segments(column):
        if layer_length <= 0:
            continue
        effective_embedment += layer_length
        if soil.soil_type == "clay":
            alpha = 0.45
            su = soil.su_t_per_m2 or 0.0
            total_skin += alpha * su * layer_length * perimeter_cm / 100.0
        else:
            total_skin += (soil.n_value or 0.0) / 3.0 * layer_length * perimeter_cm / 100.0
    self_weight = effective_embedment * tip_area_cm2 / 10000.0 * column.pile_unit_weight_t_per_m3
    allowable = total_skin / max(column.tension_fs, 1e-6) + self_weight
    return {
        "tip_area_cm2": tip_area_cm2,
        "perimeter_cm": perimeter_cm,
        "skin_t": total_skin,
        "self_weight_t": self_weight,
        "allowable_t": allowable,
        "effective_embedment_m": effective_embedment,
    }


def _tension_capacity(column: ColumnScenarioInput, section) -> float:
    return _tension_breakdown(column, section)["allowable_t"]


def _iter_effective_soil_segments(column: ColumnScenarioInput):
    remaining_m = max(column.embedment_length_cm / 100.0, 0.0)
    for soil in column.soil_layers:
        if remaining_m <= 0:
            break
        layer_thickness = max(soil.thickness_m, 0.0)
        if layer_thickness <= 0:
            continue
        effective_length = min(layer_thickness, remaining_m)
        remaining_m -= effective_length
        yield soil, effective_length


def _foundation_dimensions(column: ColumnScenarioInput, section) -> tuple[float, float]:
    if _normalized_foundation_shape(column.foundation_shape) == "(直徑)":
        diameter_cm = column.foundation_size_x_m * 100.0
        area_cm2 = math.pi * (diameter_cm**2) / 4.0
        perimeter_cm = math.pi * diameter_cm
        return area_cm2, perimeter_cm
    width_cm = column.foundation_size_x_m * 100.0
    height_cm = column.foundation_size_y_m * 100.0
    return width_cm * height_cm, 2.0 * (width_cm + height_cm)


def _normalized_foundation_type(value: str) -> str:
    if "引孔" in value or "鑽掘" in value:
        return "鑽掘或引孔樁"
    return "打入樁"


def _normalized_foundation_shape(value: str) -> str:
    return "(直徑)" if value == "(直徑)" else "(寬×長)"


def _status_with_margin(ratio: float) -> str:
    if ratio > 1.05:
        return "NG"
    if ratio > 1.0:
        return "Say~OK"
    return "OK"


def _section_snapshot(section) -> dict[str, float]:
    return {
        "section_depth_cm": round(section.depth_cm, 4),
        "section_flange_width_cm": round(section.flange_width_cm, 4),
        "section_web_thickness_cm": round(section.web_thickness_cm, 4),
        "section_flange_thickness_cm": round(section.flange_thickness_cm, 4),
        "section_area_cm2": round(section.area_cm2, 4),
        "section_unit_weight_kgf_per_m": round(section.unit_weight_kgf_per_m, 4),
        "section_ix_cm4": round(section.ix_cm4, 4),
        "section_iy_cm4": round(section.iy_cm4, 4),
        "section_rx_cm": round(section.rx_cm, 4),
        "section_ry_cm": round(section.ry_cm, 4),
        "section_rt_cm": round(section.rt_cm, 4),
        "section_sx_cm3": round(section.sx_cm3, 4),
        "section_sy_cm3": round(section.sy_cm3, 4),
    }


def _layer_label(level_label: str) -> str:
    return f"第 {level_label or '?'} 層"


def _incomplete_check(
    module_name: str,
    label: str,
    formula_id: str,
    message: str,
    inputs: dict[str, object],
) -> CheckResult:
    return CheckResult(
        module_name=module_name,
        label=label,
        formula_id=formula_id,
        inputs=inputs,
        status="NG",
        controlling_condition="資料未完整",
        details={"message": message},
    )


def _resolve_section(
    module_name: str,
    label: str,
    formula_id: str,
    section_name: str,
    inputs: dict[str, object],
):
    if not section_name.strip():
        return None, _incomplete_check(
            module_name,
            label,
            formula_id,
            "尚未選擇型鋼型號。",
            inputs,
        )
    try:
        return find_section(section_name), None
    except KeyError:
        return None, _incomplete_check(
            module_name,
            label,
            formula_id,
            f"找不到型鋼資料：{section_name}",
            inputs,
        )


def _summary(group: str, label: str, section_name: str, result: CheckResult) -> SummaryItem:
    return SummaryItem(
        group=group,
        label=label,
        section_name=section_name,
        status=result.status,
        utilization_ratio=result.utilization_ratio,
    )
