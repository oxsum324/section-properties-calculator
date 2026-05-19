from __future__ import annotations

import math
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
    for column in project.columns:
        if not column.enabled:
            continue
        column.support_rows = [row.model_copy(deep=True) for row in synced_support_rows]
        result = calculate_column_scenario(column, params)
        results.column_checks.append(result)
        results.summary.append(_summary("柱構件", column.title, column.column_section_name, result))
    return results


def calculate_horizontal_support(row: SupportRow, params: BasicParameters, module_name: str) -> CheckResult:
    label = _layer_label(row.level_label)
    inputs = {
        "軸力 N1": row.axial_force_t,
        "溫度荷重 N2": row.temp_force_t,
        "水平間距 SL": row.spacing_m,
        "型號": row.section_name,
    }
    section, invalid = _resolve_section(module_name, label, "support_interaction", row.section_name, inputs)
    if invalid:
        return invalid
    if row.spacing_m <= 0:
        return _incomplete_check(
            module_name,
            label,
            "support_interaction",
            "請輸入大於 0 的水平間距。",
            inputs,
        )
    total_force = row.axial_force_t + row.temp_force_t
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    klr = row.spacing_m * 100.0 / section.ry_cm
    axial_stress = total_force / section.area_cm2
    fa_allow = allowable_axial_stress(
        klr,
        cc_value(params),
        params.e_tf_per_cm2,
        params.fy_tf_per_cm2,
    ) * params.alpha_support
    section_class = classify_column_section(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        axial_stress,
    )
    line_load = section.unit_weight_kgf_per_m / 1000.0 + params.surcharge_wl_tf_per_m
    moment = line_load * row.spacing_m**2 / 8.0
    fbx_stress = moment * 100.0 / section.sx_cm3
    fby_stress = 0.0
    fbx_allow = allowable_fbx(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        section.rt_cm,
        row.spacing_m * 100.0,
        lc,
        1.0,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_support
    fby_allow = allowable_fby(
        section.flange_width_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_support
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.spacing_m * 100.0 / section.rx_cm) ** 2)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((row.spacing_m * 100.0 / section.ry_cm) ** 2)
    ratio = interaction_ratio(
        params.fy_tf_per_cm2,
        axial_stress,
        fa_allow,
        fbx_stress,
        fbx_allow,
        fby_stress,
        fby_allow,
        fex,
        fey,
        params.cm_factor,
        params.cm_factor,
    ) / params.psi_material
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
    lc = min(
        20.0 * section.flange_width_cm / math.sqrt(params.fy_tf_per_cm2),
        1400.0
        / (
            (section.depth_cm / (section.flange_width_cm * section.flange_thickness_cm))
            * params.fy_tf_per_cm2
        ),
    )
    klr = lb * 100.0 / section.ry_cm
    fa_value = axial_force / section.area_cm2
    fa_allow = allowable_axial_stress(
        klr,
        cc_value(params),
        params.e_tf_per_cm2,
        params.fy_tf_per_cm2,
    ) * params.alpha_brace
    section_class = classify_column_section(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        fa_value,
    )
    line_load = section.unit_weight_kgf_per_m / 1000.0
    moment = line_load * lb**2 / 8.0
    fbx_stress = moment * 100.0 / section.sx_cm3
    fbx_allow = allowable_fbx(
        section.depth_cm,
        section.flange_width_cm,
        section.web_thickness_cm,
        section.flange_thickness_cm,
        section.rt_cm,
        lb * 100.0,
        lc,
        1.0,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_brace
    fby_stress = 0.0
    fby_allow = allowable_fby(
        section.flange_width_cm,
        section.flange_thickness_cm,
        params.fy_tf_per_cm2,
        section_class,
    ) * params.alpha_brace
    fex = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((lb * 100.0 / section.rx_cm) ** 2)
    fey = 12.0 / 23.0 * math.pi**2 * params.e_tf_per_cm2 / ((lb * 100.0 / section.ry_cm) ** 2)
    ratio = interaction_ratio(
        params.fy_tf_per_cm2,
        fa_value,
        fa_allow,
        fbx_stress,
        fbx_allow,
        fby_stress,
        fby_allow,
        fex,
        fey,
        params.cm_factor,
        params.cm_factor,
    ) / params.psi_material
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


def calculate_column_scenario(column: ColumnScenarioInput, params: BasicParameters) -> CheckResult:
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
    n1 = sum(params.surcharge_wl_tf_per_m * row.spacing_m * row.support_count for row in column.support_rows)
    n2 = sum(find_section(row.section_name).unit_weight_kgf_per_m / 1000.0 * row.support_count * row.spacing_m for row in column.support_rows)
    n3 = sum((row.axial_force_t + row.temp_force_t) / 100.0 * 4.0 for row in column.support_rows)
    n4 = section.unit_weight_kgf_per_m / 1000.0 * column.column_length_m
    total_n = n1 + n2 + n3 + n4
    pt = max(0.0, n3 - n4 - n2 - n1)
    e_x = column.eccentricity_x_m if column.eccentricity_x_m is not None else section.depth_cm / 200.0 + 0.2
    e_y = column.eccentricity_y_m
    mx = n3 * e_x
    my = total_n * e_y
    fa_value = total_n / section.area_cm2
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
    fbx_value = mx * 100.0 / section.sx_cm3
    fby_value = my * 100.0 / section.sy_cm3 if section.sy_cm3 else 0.0
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
    compression = _compression_breakdown(column, section)
    tension = _tension_breakdown(column, section)
    compression_capacity = compression["allowable_t"]
    tension_capacity = tension["allowable_t"]
    compression_ratio = total_n / max(compression_capacity, 1e-6)
    tension_ratio = pt / max(tension_capacity, 1e-6) if pt > 0 else 0.0
    warnings: list[str] = []
    if compression_capacity < total_n:
        warnings.append("壓入力檢核未通過")
    if tension_capacity < pt:
        warnings.append("拉拔力檢核未通過")
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
            "N": round(total_n, 3),
            "PT": round(pt, 3),
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
        },
    )


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
