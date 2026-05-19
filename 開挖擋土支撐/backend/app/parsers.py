from __future__ import annotations

import re
from pathlib import Path

from .schemas import AnalysisEvent, AnalysisImportResult, AnalysisStage, AnalysisStrut, SoilLayer


_FLOAT = r"[-+]?\d+(?:\.\d+)?"


def parse_analysis_file(filename: str, content: str) -> AnalysisImportResult:
    suffix = Path(filename).suffix.lower()
    if suffix in {".lst", ".rio"}:
        return _parse_lst_like(filename, content)
    if suffix == ".o":
        return _parse_o_file(filename, content)
    result = _parse_lst_like(filename, content)
    if not result.stages and not result.events:
        result = _parse_o_file(filename, content)
    result.warnings.append(f"未辨識副檔名 {suffix}，已使用最佳努力解析。")
    return result


def _parse_lst_like(filename: str, content: str) -> AnalysisImportResult:
    result = AnalysisImportResult(
        source_name=filename,
        source_type="LST/RIO",
        raw_preview=content.splitlines()[:40],
    )
    lines = content.splitlines()
    title_match = re.search(r"DATA FILE NAME\s*:\s*(.+)", content)
    if title_match:
        result.project_title = title_match.group(1).strip()

    for line in lines:
        stripped = line.strip()
        if not result.wall_length_m:
            m = re.search(r"RETAINING WALL : LENGTH\s+(%s)\s+M" % _FLOAT, stripped)
            if m:
                result.wall_length_m = float(m.group(1))
        if not result.wall_thickness_m:
            m = re.search(r"RETAINING WALL USE T\s*=\s*(%s)\s*m" % _FLOAT, stripped)
            if m:
                result.wall_thickness_m = float(m.group(1))
        if not result.excavation_depth_m:
            m = re.search(r"EXCAVATION DEPTH\s+(%s)\s+M" % _FLOAT, stripped)
            if m:
                result.excavation_depth_m = float(m.group(1))
        if not result.ground_water_level_m:
            m = re.search(r"GROUND WATER LEVEL\s*=\s*(%s)\s+M" % _FLOAT, stripped)
            if m:
                result.ground_water_level_m = float(m.group(1))
        if not result.wall_ei_tf_m2_per_m:
            m = re.search(r"EI=.*?=\s*(%s)\s*tf-m\^2/m" % _FLOAT, stripped)
            if m:
                result.wall_ei_tf_m2_per_m = float(m.group(1))

    soil_pattern = re.compile(
        r"^\s*\d+\s+\.\.\.\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)"
        % (_FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT)
    )
    soil_index = 1
    for line in lines:
        match = soil_pattern.match(line)
        if not match:
            continue
        depth = float(match.group(1))
        phi = float(match.group(8))
        cohesion = float(match.group(7))
        kh = float(match.group(12))
        result.soils.append(
            SoilLayer(
                index=soil_index,
                name=f"Layer {soil_index}",
                depth_m=depth,
                unit_weight_t_per_m3=float(match.group(2)),
                phi_deg=phi,
                cohesion_t_per_m2=cohesion,
                ka=float(match.group(4)),
                kp=float(match.group(6)),
                es_t_per_m2=float(match.group(11)),
                kh_t_per_m3=kh,
                soil_type="clay" if cohesion > 0 else "sand",
            )
        )
        soil_index += 1

    stage_header_pattern = re.compile(r"\* Stage\s+(\d+)\s+(.+)", re.I)
    excavation_header_pattern = re.compile(r"Excavtion Depth=\s*(%s)\s*m" % _FLOAT, re.I)
    excav_command_pattern = re.compile(r": EXC\(2\)\s+(%s)" % _FLOAT)
    water_command_pattern = re.compile(r": EAU\(2\)\s+(%s)" % _FLOAT)
    setup_pattern = re.compile(
        r": BUT\((\d+)\)\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s)"
        % (_FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT)
    )
    remove_pattern = re.compile(r": BUT\(0,\s*(\d+)\)")

    current_stage: AnalysisStage | None = None
    current_stage_description = ""
    for line in lines:
        header_match = stage_header_pattern.search(line)
        if header_match:
            stage_index = int(header_match.group(1))
            current_stage_description = _clean_text(header_match.group(2))
            current_stage = AnalysisStage(index=stage_index, label=f"施工階段 {stage_index}")
            excavation_match = excavation_header_pattern.search(current_stage_description)
            if excavation_match:
                current_stage.excavation_depth_m = float(excavation_match.group(1))
            result.stages.append(current_stage)
            continue

        if current_stage is None:
            continue

        excavation_match = excav_command_pattern.search(line)
        if excavation_match and current_stage.excavation_depth_m is None:
            current_stage.excavation_depth_m = float(excavation_match.group(1))
            continue

        water_match = water_command_pattern.search(line)
        if water_match:
            current_stage.water_level_m = float(water_match.group(1))
            continue

        setup_match = setup_pattern.search(line)
        if setup_match:
            depth = float(setup_match.group(2))
            span = float(setup_match.group(3))
            angle = float(setup_match.group(4))
            load = abs(float(setup_match.group(5)))
            stiffness = float(setup_match.group(6))
            classification = _classify_setup_event(current_stage_description, span, angle, load)
            _append_event(
                result,
                current_stage,
                classification=classification,
                butt_no=None,
                depth_m=depth,
                span_m=span,
                angle_deg=angle,
                load_t=load,
                stiffness=stiffness,
                description=current_stage_description,
            )
            continue

        remove_match = remove_pattern.search(line)
        if remove_match:
            _append_event(
                result,
                current_stage,
                classification="remove",
                butt_no=int(remove_match.group(1)),
                description=current_stage_description or "拆撐事件",
            )

    if not result.soils:
        result.warnings.append("未從 LST/RIO 內容辨識出土層參數。")
    if not result.stages:
        result.warnings.append("未從 LST/RIO 內容辨識出施工階段。")
    return result


def _parse_o_file(filename: str, content: str) -> AnalysisImportResult:
    result = AnalysisImportResult(
        source_name=filename,
        source_type="O",
        raw_preview=content.splitlines()[:40],
    )
    lines = content.splitlines()

    result.project_title = _extract_o_project_title(lines)

    for index, line in enumerate(lines):
        stripped = line.strip()
        if not result.ground_water_level_m:
            match = re.search(r"INITIAL GROUND WATER LEVEL\s*=\s*(%s)" % _FLOAT, stripped)
            if match:
                result.ground_water_level_m = float(match.group(1))
        if result.wall_ei_tf_m2_per_m is None and re.search(r"WALL NO\s+LEVEL\s+EI", stripped):
            for probe in lines[index + 1 : index + 5]:
                values = re.findall(_FLOAT, probe)
                if len(values) >= 3:
                    result.wall_ei_tf_m2_per_m = float(values[-1])
                    break

    soil_header_seen = False
    for line in lines:
        stripped = line.strip()
        if "SOIL NO" in stripped and "LEVEL" in stripped:
            soil_header_seen = True
            continue
        if not soil_header_seen:
            continue
        if not stripped:
            break
        if not re.match(r"^\d+\s", stripped):
            if result.soils:
                break
            continue
        parts = re.split(r"\s+", stripped)
        if len(parts) < 12:
            continue
        try:
            index = int(parts[0])
            depth = float(parts[1])
            weight = float(parts[2])
            ka = float(parts[3])
            kp = float(parts[5])
            cohesion = float(parts[6])
            kh = float(parts[8])
            phi = float(parts[9])
            soil_flag = parts[11]
        except ValueError:
            continue
        result.soils.append(
            SoilLayer(
                index=index,
                name=f"Layer {index}",
                depth_m=depth,
                unit_weight_t_per_m3=weight,
                ka=ka,
                kp=kp,
                cohesion_t_per_m2=cohesion,
                kh_t_per_m3=kh,
                phi_deg=phi,
                soil_type="clay" if soil_flag.upper() == "U" or cohesion > 0 else "sand",
            )
        )

    phase_pattern = re.compile(r"\*\*\* PHASE NO\.\s+(\d+)")
    exc_pattern = re.compile(r"EXC\(2\)\s+EXCAVATION LEVEL =\s+(%s)" % _FLOAT)
    gwt_pattern = re.compile(r"SEP\(0\).*?=\s+(%s)\s+(%s)" % (_FLOAT, _FLOAT))
    setup_pattern = re.compile(
        r"BUT\(0\)\s+LEVEL-SPAN-DEGREE-LOAD-STIFFNESS =\s+(%s)\s+(%s)\s+(%s)\s+(%s)\s+(%s).*?(?:BUT NO\.\s*(\d+))?"
        % (_FLOAT, _FLOAT, _FLOAT, _FLOAT, _FLOAT)
    )
    remove_pattern = re.compile(r"BUT\(0\)\s+LEVEL-SPAN =\s+(%s)\s+(%s)\s+\*\*\*\s+REMOVED BUT NO\.\s*(\d+)" % (_FLOAT, _FLOAT))

    current_stage: AnalysisStage | None = None
    for line in lines:
        phase_match = phase_pattern.search(line)
        if phase_match:
            current_stage = AnalysisStage(
                index=int(phase_match.group(1)),
                label=f"施工階段 {phase_match.group(1)}",
            )
            result.stages.append(current_stage)
            continue
        if current_stage is None:
            continue

        excavation_match = exc_pattern.search(line)
        if excavation_match:
            current_stage.excavation_depth_m = float(excavation_match.group(1))
            continue

        water_match = gwt_pattern.search(line)
        if water_match:
            current_stage.water_level_m = float(water_match.group(2))
            continue

        setup_match = setup_pattern.search(line)
        if setup_match:
            depth = float(setup_match.group(1))
            span = float(setup_match.group(2))
            angle = float(setup_match.group(3))
            load = abs(float(setup_match.group(4)))
            stiffness = float(setup_match.group(5))
            butt_no_match = re.search(r"BUT NO\.\s*(\d+)", line)
            butt_no = int(butt_no_match.group(1)) if butt_no_match else None
            classification = _classify_setup_event(line, span, angle, load)
            _append_event(
                result,
                current_stage,
                classification=classification,
                butt_no=butt_no,
                depth_m=depth,
                span_m=span,
                angle_deg=angle,
                load_t=load,
                stiffness=stiffness,
                description=_clean_text(line),
            )
            continue

        remove_match = remove_pattern.search(line)
        if remove_match:
            _append_event(
                result,
                current_stage,
                classification="remove",
                butt_no=int(remove_match.group(3)),
                depth_m=float(remove_match.group(1)),
                span_m=float(remove_match.group(2)),
                description=_clean_text(line),
            )

    _apply_o_but_force_summary(result, lines)

    if result.stages:
        excavation_depths = [stage.excavation_depth_m for stage in result.stages if stage.excavation_depth_m is not None]
        if excavation_depths:
            result.excavation_depth_m = max(excavation_depths)
    if not result.stages:
        result.warnings.append("未從 .o 內容辨識出施工階段。")
    if not result.soils:
        result.warnings.append("未從 .o 內容辨識出土層參數。")
    return result


def _extract_o_project_title(lines: list[str]) -> str:
    marker_index = next(
        (index for index, line in enumerate(lines) if "LIST OF INPUT DATA" in line),
        None,
    )
    if marker_index is None:
        return ""
    for line in lines[marker_index + 1 :]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("<") or "GROUND LEVEL" in stripped or "Declaration" in stripped:
            continue
        return stripped
    return ""


def _apply_o_but_force_summary(result: AnalysisImportResult, lines: list[str]) -> None:
    summary = _parse_o_but_force_summary(lines, len(result.stages))
    if not summary:
        return

    for event in result.events:
        if event.classification not in {"support", "brace"} or event.butt_no is None:
            continue
        butt_summary = summary.get(event.butt_no)
        if not butt_summary:
            continue
        event.load_t = butt_summary["controlling_load_t"]
        controlling_stages = butt_summary["controlling_stages"]
        if controlling_stages:
            stage_text = "、".join(f"#{stage_index}" for stage_index in controlling_stages)
            event.description = (
                f"{event.description} | 控制軸力 {-butt_summary['controlling_load_t']:.1f} tf"
                f" | 控制階段 {stage_text}"
            )

    for stage in result.stages:
        for strut in stage.struts:
            butt_summary = summary.get(strut.index)
            if not butt_summary:
                continue
            strut.load_t = butt_summary["controlling_load_t"]


def _parse_o_but_force_summary(
    lines: list[str],
    stage_count: int,
) -> dict[int, dict[str, float | list[int]]]:
    header_index = next(
        (
            index
            for index, line in enumerate(lines)
            if "Summary of BUT forces of All Phases with Envelope" in line
        ),
        None,
    )
    if header_index is None:
        return {}

    summary: dict[int, dict[str, float | list[int]]] = {}
    row_pattern = re.compile(r"^NO\.\s*(\d+)\s+(.+)$")
    for line in lines[header_index + 1 :]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Note:") or stripped.startswith("註解"):
            break
        row_match = row_pattern.match(stripped)
        if not row_match:
            continue

        butt_no = int(row_match.group(1))
        tokens = re.split(r"\s+", row_match.group(2))
        if len(tokens) < 3:
            continue
        stage_tokens = tokens[2 : 2 + stage_count]
        stage_values: list[float | None] = []
        for token in stage_tokens:
            try:
                stage_values.append(float(token))
            except ValueError:
                stage_values.append(None)

        compressive_values = [
            abs(value)
            for value in stage_values
            if value is not None and value < 0
        ]
        all_values = [abs(value) for value in stage_values if value is not None]
        controlling_load = max(compressive_values or all_values, default=0.0)
        controlling_stages = [
            index + 1
            for index, value in enumerate(stage_values)
            if value is not None and abs(abs(value) - controlling_load) < 1e-6
        ]
        summary[butt_no] = {
            "controlling_load_t": controlling_load,
            "controlling_stages": controlling_stages,
        }
    return summary


def _clean_text(text: str) -> str:
    return " ".join(text.replace("\u0000", " ").split())


def _classify_setup_event(description: str, span_m: float, angle_deg: float, load_t: float) -> str:
    upper = description.upper()
    floor_keywords = ("FLOOR", "SLAB", "FS", "B1F", "B2F", "B3F", "B4F")
    if any(keyword in upper for keyword in floor_keywords):
        return "floor"
    if load_t <= 1e-6 and span_m <= 1.5:
        return "floor"
    angle = abs(angle_deg)
    if angle <= 10.0 and load_t > 1e-6:
        return "support"
    if 10.0 < angle < 80.0 and load_t > 1e-6:
        return "brace"
    return "other"


def _append_event(
    result: AnalysisImportResult,
    stage: AnalysisStage,
    classification: str,
    butt_no: int | None = None,
    depth_m: float | None = None,
    span_m: float | None = None,
    angle_deg: float | None = None,
    load_t: float | None = None,
    stiffness: float | None = None,
    description: str = "",
) -> None:
    included = classification in {"support", "brace"}
    result.events.append(
        AnalysisEvent(
            stage_index=stage.index,
            stage_label=stage.label,
            classification=classification,
            butt_no=butt_no,
            depth_m=depth_m,
            span_m=span_m,
            angle_deg=angle_deg,
            load_t=load_t,
            stiffness=stiffness,
            description=description,
            included=included,
        )
    )
    if not included or depth_m is None or span_m is None or angle_deg is None or load_t is None or stiffness is None:
        return
    stage.struts.append(
        AnalysisStrut(
            index=butt_no or len(stage.struts) + 1,
            depth_m=depth_m,
            span_m=span_m,
            angle_deg=angle_deg,
            load_t=load_t,
            stiffness=stiffness,
        )
    )
