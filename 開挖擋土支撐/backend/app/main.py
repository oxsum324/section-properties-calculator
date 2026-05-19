from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from .calculations import calculate_project
from .config import get_settings
from .parsers import parse_analysis_file
from .project_store import ProjectStore
from .reporting import build_report, build_word_report
from .schemas import (
    AnalysisImportResult,
    AnalysisSideSource,
    BootstrapPayload,
    BraceRow,
    CreateProjectRequest,
    ProjectState,
    ReferenceData,
    ReportPayload,
    SaveReferenceDataRequest,
    SaveProjectRequest,
    SaveProjectResponse,
    SupportRow,
)
from .workbook_loader import (
    load_default_project,
    load_reference_data,
    reset_reference_overrides,
    save_reference_data,
)

settings = get_settings()
store = ProjectStore()

app = FastAPI(title="擋土支撐計算網頁工具", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _append_warning(project_result, message: str) -> None:
    if message not in project_result.warnings:
        project_result.warnings.append(message)


def _annotate_import_result(project_result) -> None:
    counts = _summarize_import_events(project_result)
    candidate_count = counts["support"] + counts["brace"]
    if candidate_count > 0:
        parts = []
        if counts["support"] > 0:
            parts.append(f"{counts['support']} 道水平支撐候選")
        if counts["brace"] > 0:
            parts.append(f"{counts['brace']} 道斜撐候選")
        if counts["floor"] > 0:
            parts.append(f"忽略樓版 {counts['floor']} 筆")
        if counts["remove"] > 0:
            parts.append(f"辨識拆撐事件 {counts['remove']} 筆")
        if counts["other"] > 0:
            parts.append(f"待人工判讀 {counts['other']} 筆")
        _append_warning(
            project_result,
            (
                f"已完成匯入分類：{'、'.join(parts)}。本次匯入僅代表單側分析結果，"
                "請先確認摘要內容，再於設計步驟補齊型號、橫擋與角撐資料。"
            ),
        )
        return
    if counts["floor"] > 0 or counts["remove"] > 0 or counts["other"] > 0:
        _append_warning(
            project_result,
            (
                "本次匯入未辨識出可直接套用的支撐候選；"
                f"樓版 {counts['floor']} 筆、拆撐 {counts['remove']} 筆、待人工判讀 {counts['other']} 筆。"
                "請確認匯入摘要後，再手動建立支撐列。"
            ),
        )
        return
    _append_warning(project_result, "本次匯入未辨識出支撐資料，請手動建立支撐列。")


def _side_label(side: Literal["top", "bottom"]) -> str:
    return "上層" if side == "top" else "下層"


def _flatten_imported_struts(project_result: AnalysisImportResult) -> list[dict[str, Any]]:
    if project_result.events:
        rows: list[dict[str, Any]] = []
        for event in project_result.events:
            if event.classification not in {"support", "brace"}:
                continue
            if (
                event.depth_m is None
                or event.span_m is None
                or event.angle_deg is None
                or event.load_t is None
                or event.stiffness is None
            ):
                continue
            rows.append(
                {
                    "stage_index": event.stage_index,
                    "stage_label": event.stage_label,
                    "index": event.butt_no or len(rows) + 1,
                    "classification": event.classification,
                    "depth_m": event.depth_m,
                    "span_m": event.span_m,
                    "angle_deg": event.angle_deg,
                    "load_t": event.load_t,
                    "stiffness": event.stiffness,
                }
            )
        if rows:
            return rows

    rows: list[dict[str, Any]] = []
    for stage in project_result.stages:
        for strut in stage.struts:
            rows.append(
                {
                    "stage_index": stage.index,
                    "stage_label": stage.label,
                    "index": strut.index,
                    "classification": "support" if abs(strut.angle_deg) <= 10 else "brace",
                    "depth_m": strut.depth_m,
                    "span_m": strut.span_m,
                    "angle_deg": strut.angle_deg,
                    "load_t": strut.load_t,
                    "stiffness": strut.stiffness,
                }
            )
    return rows


def _merge_stage_labels(left: str, right: str) -> str:
    labels = {label for label in [*left.split("、"), *right.split("、")] if label}
    return "、".join(labels)


def _consolidate_imported_struts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = f"{row['classification']}-{row['index']}-{row['depth_m']:.2f}-{abs(row['angle_deg']):.1f}"
        existing = grouped.get(key)
        if existing is None:
            grouped[key] = dict(row)
            continue
        if row["load_t"] >= existing["load_t"]:
            grouped[key] = {
                **row,
                "stage_label": _merge_stage_labels(existing["stage_label"], row["stage_label"]),
            }
            continue
        existing["stage_label"] = _merge_stage_labels(existing["stage_label"], row["stage_label"])
        existing["span_m"] = max(existing["span_m"], row["span_m"])
        existing["stiffness"] = max(existing["stiffness"], row["stiffness"])
    return sorted(
        grouped.values(),
        key=lambda item: (item["depth_m"], item["index"], item["stage_index"]),
    )


def _build_imported_assignments(project_result: AnalysisImportResult) -> list[dict[str, Any]]:
    consolidated = _consolidate_imported_struts(_flatten_imported_struts(project_result))
    assignments: list[dict[str, Any]] = []
    for row in consolidated:
        kind = row.get("classification")
        if kind not in {"support", "brace"}:
            continue
        assignments.append(
            {
                "id": f"{kind}-{row['index']}-{row['depth_m']:.2f}-{len(assignments)}",
                "kind": kind,
                "level_label": str(len([item for item in assignments if item["kind"] == kind]) + 1),
                "depth_m": row["depth_m"],
                "span_m": row["span_m"],
                "angle_deg": row["angle_deg"],
                "load_t": row["load_t"],
                "stage_labels": [label for label in row["stage_label"].split("、") if label],
            }
        )
    return assignments


def _pick_section_name(existing_rows: list[Any], index: int) -> str:
    if index < len(existing_rows):
        return getattr(existing_rows[index], "section_name", "") or ""
    if existing_rows:
        return getattr(existing_rows[0], "section_name", "") or ""
    return ""


def _to_candidate_support_row(
    item: dict[str, Any],
    existing_rows: list[SupportRow],
    index: int,
) -> SupportRow:
    return SupportRow(
        level_label=item["level_label"],
        support_count=existing_rows[index].support_count if index < len(existing_rows) else 1,
        section_name=_pick_section_name(existing_rows, index),
        axial_force_t=round(float(item["load_t"]), 3),
        temp_force_t=0.0,
        spacing_m=round(float(item["span_m"]), 3),
    )


def _to_candidate_brace_row(
    item: dict[str, Any],
    existing_rows: list[BraceRow],
    index: int,
) -> BraceRow:
    base_length = max(float(item["span_m"]), 0.001)
    tributary_line_load = float(item["load_t"]) * math.sin(math.radians(abs(float(item["angle_deg"])))) / base_length
    return BraceRow(
        level_label=item["level_label"],
        section_name=_pick_section_name(existing_rows, index),
        l1_m=round(base_length, 3),
        l2_m=round(base_length, 3),
        angle_deg=round(float(item["angle_deg"]), 3),
        tributary_line_load_tf_per_m=round(tributary_line_load, 3),
    )


def _apply_import_to_side(
    project: ProjectState,
    side: Literal["top", "bottom"],
    parsed: AnalysisImportResult,
) -> None:
    assignments = _build_imported_assignments(parsed)
    support_assignments = [item for item in assignments if item["kind"] == "support"]
    brace_assignments = [item for item in assignments if item["kind"] == "brace"]
    support_key = "top_supports" if side == "top" else "bottom_supports"
    brace_key = "top_braces" if side == "top" else "bottom_braces"
    wale_key = "top_wales" if side == "top" else "bottom_wales"
    source_key = "top_analysis_source" if side == "top" else "bottom_analysis_source"

    setattr(project, source_key, AnalysisSideSource(mode="import", import_result=parsed))

    if support_assignments or brace_assignments:
        existing_supports = list(getattr(project, support_key))
        existing_braces = list(getattr(project, brace_key))
        setattr(
            project,
            support_key,
            [
                _to_candidate_support_row(item, existing_supports, index)
                for index, item in enumerate(support_assignments)
            ],
        )
        setattr(
            project,
            brace_key,
            [
                _to_candidate_brace_row(item, existing_braces, index)
                for index, item in enumerate(brace_assignments)
            ],
        )
        setattr(project, wale_key, [])

    if side == "top":
        if getattr(project, support_key):
            project.calculation_options.include_top_supports = True
        if brace_assignments:
            project.calculation_options.include_top_braces = True
        project.top_analysis_source.mode = "import"
    else:
        if getattr(project, support_key):
            project.calculation_options.include_bottom_supports = True
        if brace_assignments:
            project.calculation_options.include_bottom_braces = True
        project.bottom_analysis_source.mode = "import"

    if (
        not project.calculation_options.include_top_supports
        and not project.calculation_options.include_bottom_supports
    ):
        if side == "top":
            project.calculation_options.include_top_supports = True
        else:
            project.calculation_options.include_bottom_supports = True

    project.calculation_results = None


def _pick_first_non_empty(values: list[Any]) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _merge_analysis_sources(
    project: ProjectState,
    latest_side: Literal["top", "bottom"],
) -> AnalysisImportResult:
    ordered_sides: list[Literal["top", "bottom"]] = [latest_side, "bottom" if latest_side == "top" else "top"]
    imports: list[tuple[Literal["top", "bottom"], AnalysisImportResult]] = []
    for side in ordered_sides:
        source = project.top_analysis_source if side == "top" else project.bottom_analysis_source
        if source.mode == "import" and source.import_result.source_name:
            imports.append((side, source.import_result))
    if not imports:
        return project.analysis_import

    source_name = "；".join(
        f"{_side_label(side)}：{result.source_name}" for side, result in imports if result.source_name
    )
    source_types = [result.source_type for _, result in imports if result.source_type]
    project_titles = [result.project_title for _, result in imports if result.project_title]
    wall_lengths = [result.wall_length_m for _, result in imports]
    wall_thicknesses = [result.wall_thickness_m for _, result in imports]
    excavation_depths = [result.excavation_depth_m for _, result in imports]
    water_levels = [result.ground_water_level_m for _, result in imports]
    wall_eis = [result.wall_ei_tf_m2_per_m for _, result in imports]

    stages = []
    events = []
    for side, result in imports:
        stage_mapping: dict[int, tuple[int, str]] = {}
        for stage in result.stages:
            new_index = len(stages) + 1
            new_label = f"{_side_label(side)} {stage.label}"
            stages.append(stage.model_copy(update={"index": new_index, "label": new_label}))
            stage_mapping[stage.index] = (new_index, new_label)
        for event in result.events:
            mapped_index, mapped_label = stage_mapping.get(
                event.stage_index,
                (event.stage_index, f"{_side_label(side)} {event.stage_label}"),
            )
            events.append(
                event.model_copy(
                    update={
                        "stage_index": mapped_index,
                        "stage_label": mapped_label,
                    }
                )
            )

    soils = _pick_first_non_empty(
        [[soil.model_copy(deep=True) for soil in result.soils] for _, result in imports if result.soils]
    )
    if not soils:
        soils = [soil.model_copy(deep=True) for soil in project.analysis_import.soils]

    warnings: list[str] = []
    for side, result in imports:
        for warning in result.warnings:
            message = f"{_side_label(side)}：{warning}"
            if message not in warnings:
                warnings.append(message)

    raw_preview: list[str] = []
    for side, result in imports:
        if result.raw_preview:
            raw_preview.append(f"[{_side_label(side)}]")
            raw_preview.extend(result.raw_preview[:20])

    return AnalysisImportResult(
        source_name=source_name,
        source_type=" / ".join(dict.fromkeys(source_types)) if source_types else "",
        project_title=_pick_first_non_empty(project_titles) or "",
        wall_length_m=_pick_first_non_empty(wall_lengths),
        wall_thickness_m=_pick_first_non_empty(wall_thicknesses),
        excavation_depth_m=_pick_first_non_empty(excavation_depths),
        ground_water_level_m=_pick_first_non_empty(water_levels),
        wall_ei_tf_m2_per_m=_pick_first_non_empty(wall_eis),
        soils=soils,
        stages=stages,
        events=events,
        warnings=warnings,
        raw_preview=raw_preview[:120],
    )


def _summarize_import_events(project_result: AnalysisImportResult) -> dict[str, int]:
    counts = {
        "support": 0,
        "brace": 0,
        "floor": 0,
        "remove": 0,
        "other": 0,
    }
    if project_result.events:
        for event in project_result.events:
            counts[event.classification] = counts.get(event.classification, 0) + 1
        return counts

    for stage in project_result.stages:
        for strut in stage.struts:
            if abs(strut.angle_deg) <= 10:
                counts["support"] += 1
            elif abs(strut.angle_deg) < 80:
                counts["brace"] += 1
            else:
                counts["other"] += 1
    return counts


@app.get("/api/bootstrap", response_model=BootstrapPayload)
def bootstrap() -> BootstrapPayload:
    return BootstrapPayload(
        reference_data=load_reference_data(),
        default_project=load_default_project(),
        sample_analysis_files=[path.name for path in settings.sample_analysis_files if path.exists()],
    )


@app.get("/api/reference-data", response_model=ReferenceData)
def get_reference_data() -> ReferenceData:
    return load_reference_data()


@app.put("/api/reference-data", response_model=ReferenceData)
def update_reference_data(request: SaveReferenceDataRequest) -> ReferenceData:
    try:
        return save_reference_data(request.reference_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/reference-data", response_model=ReferenceData)
def restore_reference_data() -> ReferenceData:
    return reset_reference_overrides()


@app.get("/api/projects")
def list_projects() -> list[dict[str, str | None]]:
    return [item.model_dump(mode="json") for item in store.list_projects()]


@app.post("/api/projects", response_model=ProjectState)
def create_project(request: CreateProjectRequest) -> ProjectState:
    return store.create_project(request.name)


@app.get("/api/projects/{project_id}", response_model=ProjectState)
def get_project(project_id: str) -> ProjectState:
    try:
        return store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.put("/api/projects/{project_id}", response_model=SaveProjectResponse)
def save_project(project_id: str, request: SaveProjectRequest) -> SaveProjectResponse:
    if project_id != request.project.metadata.id:
        raise HTTPException(status_code=400, detail="Project id mismatch")
    try:
        saved = store.save_project(request.project)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    return SaveProjectResponse(project=saved)


@app.post("/api/projects/{project_id}/import-analysis", response_model=ProjectState)
async def import_analysis(
    project_id: str,
    side: Literal["top", "bottom"] = Form(...),
    file: UploadFile = File(...),
) -> ProjectState:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    data = await file.read()
    store.save_imported_file(project_id, f"{side}-{file.filename or 'analysis.txt'}", data)
    content = data.decode("utf-8", errors="ignore")
    parsed = parse_analysis_file(file.filename or "analysis.txt", content)
    _annotate_import_result(parsed)
    _apply_import_to_side(project, side, parsed)
    project.analysis_import = _merge_analysis_sources(project, side)
    if parsed.project_title and not project.metadata.project_code:
        project.metadata.project_code = parsed.project_title
    if parsed.project_title and project.metadata.name == "Excel 轉換範例專案":
        project.metadata.name = parsed.project_title
    return store.save_project(project)


@app.post("/api/projects/{project_id}/calculate", response_model=ProjectState)
def calculate(project_id: str) -> ProjectState:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    project.calculation_results = calculate_project(project)
    return store.save_project(project)


@app.post("/api/projects/{project_id}/report", response_model=ReportPayload)
def generate_report(project_id: str, concise: bool = False) -> ReportPayload:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    if project.calculation_results is None:
        project.calculation_results = calculate_project(project)
        project = store.save_project(project)
    report_path = build_report(project, concise_mode=concise)
    store.save_report(project_id, report_path)
    return ReportPayload(
        project=project,
        report_path=str(report_path),
        download_url=f"/api/projects/{project_id}/report/files/{report_path.name}",
        latest_download_url=f"/api/projects/{project_id}/report/latest?v={report_path.name}",
        report_mode="concise" if concise else "detailed",
        report_kind="pdf",
    )


@app.get("/api/projects/{project_id}/report/latest")
def download_latest_report(project_id: str) -> FileResponse:
    path = store.project_dir(project_id) / "latest-report.pdf"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{project_id}-report.pdf",
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


@app.post("/api/projects/{project_id}/report/docx", response_model=ReportPayload)
def generate_word_report(project_id: str, concise: bool = False) -> ReportPayload:
    try:
        project = store.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    if project.calculation_results is None:
        project.calculation_results = calculate_project(project)
        project = store.save_project(project)
    report_path = build_word_report(project, concise_mode=concise)
    store.save_report(project_id, report_path, latest_name="latest-report.docx")
    return ReportPayload(
        project=project,
        report_path=str(report_path),
        download_url=f"/api/projects/{project_id}/report/files/{report_path.name}",
        latest_download_url=f"/api/projects/{project_id}/report/latest-docx?v={report_path.name}",
        report_mode="concise" if concise else "detailed",
        report_kind="docx",
    )


@app.get("/api/projects/{project_id}/report/latest-docx")
def download_latest_word_report(project_id: str) -> FileResponse:
    path = store.project_dir(project_id) / "latest-report.docx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{project_id}-report.docx",
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


@app.get("/api/projects/{project_id}/report/files/{filename}")
def download_generated_artifact(project_id: str, filename: str) -> FileResponse:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not safe_name.startswith(f"{project_id}-"):
        raise HTTPException(status_code=404, detail="Report not found")
    path = settings.reports_dir / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        media_type = "application/pdf"
    elif suffix == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type=media_type,
        filename=safe_name,
        headers={"Cache-Control": "no-store, no-cache, max-age=0", "Pragma": "no-cache"},
    )


def _proxy_frontend_dev(request: Request, full_path: str) -> Response | None:
    target = settings.frontend_dev_url.rstrip("/")
    if full_path:
        target = f"{target}/{full_path.lstrip('/')}"
    query = request.url.query
    if query:
        target = f"{target}?{query}"

    upstream_request = UrlRequest(
        target,
        headers={"Accept": request.headers.get("accept", "*/*")},
    )
    try:
        with urlopen(upstream_request, timeout=2) as upstream:
            headers = {}
            for header_name in ("Content-Type", "Cache-Control", "ETag", "Last-Modified"):
                header_value = upstream.headers.get(header_name)
                if header_value:
                    headers[header_name] = header_value
            return Response(
                content=upstream.read(),
                status_code=getattr(upstream, "status", 200),
                headers=headers,
            )
    except HTTPError as exc:
        headers = {}
        content_type = exc.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type
        return Response(content=exc.read(), status_code=exc.code, headers=headers)
    except (URLError, OSError, TimeoutError):
        return None


def _serve_frontend_static(full_path: str) -> FileResponse:
    dist_dir = settings.frontend_dist_dir.resolve()
    relative_path = Path(full_path) if full_path else Path("index.html")
    candidate = (dist_dir / relative_path).resolve()
    if dist_dir not in candidate.parents and candidate != dist_dir:
        raise HTTPException(status_code=404, detail="Frontend not found")
    if candidate.is_file():
        return FileResponse(candidate)

    index_path = dist_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=503, detail="Frontend assets are not available")


def _serve_frontend(request: Request, full_path: str) -> Response:
    proxied = _proxy_frontend_dev(request, full_path)
    if proxied is not None:
        return proxied
    return _serve_frontend_static(full_path)


@app.get("/", include_in_schema=False)
def frontend_root(request: Request) -> Response:
    return _serve_frontend(request, "")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_catch_all(full_path: str, request: Request) -> Response:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    return _serve_frontend(request, full_path)
