from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProjectMetadata(BaseModel):
    id: str | None = None
    name: str = "未命名擋土支撐專案"
    project_code: str = ""
    client: str = ""
    designer: str = ""
    checker: str = ""
    organization: str = ""
    location: str = ""
    notes: str = ""
    spec_pack_version: str = "標準包 v1"
    unit_system: str = "公制"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SectionProperty(BaseModel):
    name: str
    depth_cm: float
    flange_width_cm: float
    web_thickness_cm: float
    flange_thickness_cm: float
    area_cm2: float
    unit_weight_kgf_per_m: float
    ix_cm4: float
    iy_cm4: float
    rx_cm: float
    ry_cm: float
    rt_cm: float
    sx_cm3: float
    sy_cm3: float
    zx_cm3: float
    zy_cm3: float


class BoltStrengthRow(BaseModel):
    grade: str
    ft_tf_per_cm2: float | None = None
    fv_tf_per_cm2: float | None = None
    sizes: dict[str, float] = Field(default_factory=dict)


class SoilLayer(BaseModel):
    index: int
    name: str
    thickness_m: float | None = None
    depth_m: float | None = None
    n_value: float | None = None
    unit_weight_t_per_m3: float | None = None
    phi_deg: float | None = None
    cohesion_t_per_m2: float | None = None
    delta_ratio: float | None = None
    su_t_per_m2: float | None = None
    ka: float | None = None
    kp: float | None = None
    es_t_per_m2: float | None = None
    kh_t_per_m3: float | None = None
    soil_type: Literal["sand", "clay", "mixed"] = "mixed"


class AnalysisStrut(BaseModel):
    index: int
    depth_m: float
    span_m: float
    angle_deg: float
    load_t: float
    stiffness: float


class AnalysisEvent(BaseModel):
    stage_index: int
    stage_label: str
    classification: Literal["support", "brace", "floor", "remove", "other"] = "other"
    butt_no: int | None = None
    depth_m: float | None = None
    span_m: float | None = None
    angle_deg: float | None = None
    load_t: float | None = None
    stiffness: float | None = None
    description: str = ""
    included: bool = False


class AnalysisStage(BaseModel):
    index: int
    label: str
    excavation_depth_m: float | None = None
    water_level_m: float | None = None
    struts: list[AnalysisStrut] = Field(default_factory=list)


class AnalysisImportResult(BaseModel):
    source_name: str = ""
    source_type: str = ""
    project_title: str = ""
    wall_length_m: float | None = None
    wall_thickness_m: float | None = None
    excavation_depth_m: float | None = None
    ground_water_level_m: float | None = None
    wall_ei_tf_m2_per_m: float | None = None
    soils: list[SoilLayer] = Field(default_factory=list)
    stages: list[AnalysisStage] = Field(default_factory=list)
    events: list[AnalysisEvent] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    raw_preview: list[str] = Field(default_factory=list)


class AnalysisSideSource(BaseModel):
    mode: Literal["unused", "import", "manual"] = "unused"
    import_result: AnalysisImportResult = Field(default_factory=AnalysisImportResult)


class BasicParameters(BaseModel):
    e_tf_per_cm2: float = 2040.0
    fy_tf_per_cm2: float = 2.5
    cm_factor: float = 1.0
    surcharge_wl_tf_per_m: float = 0.2
    alpha_support: float = 1.25
    alpha_wale: float = 1.25
    alpha_brace: float = 1.25
    alpha_corner_brace: float = 1.25
    alpha_column: float = 1.25
    psi_material: float = 0.9
    wall_type: str = "連續壁"
    wall_thickness_cm: float = 100.0
    wall_fc_kg_per_cm2: float = 245.0


class SupportRow(BaseModel):
    level_label: str
    support_count: int = 1
    section_name: str
    axial_force_t: float
    temp_force_t: float
    spacing_m: float


class WaleRow(BaseModel):
    level_label: str
    wale_count: int = 1
    section_name: str
    span_m: float
    support_spacing_m: float
    line_load_tf_per_m: float


class BraceRow(BaseModel):
    level_label: str
    section_name: str
    l1_m: float
    l2_m: float
    angle_deg: float
    tributary_line_load_tf_per_m: float


class CornerBraceRow(BaseModel):
    level_label: str
    section_name: str
    length_m: float
    axial_force_t: float


class CalculationOptions(BaseModel):
    include_top_supports: bool = True
    include_bottom_supports: bool = True
    auto_temp_force_top_supports: bool = True
    auto_temp_force_bottom_supports: bool = True
    consider_wall_deduction_for_wales: bool = True
    include_top_wales: bool = True
    include_bottom_wales: bool = True
    include_top_braces: bool = True
    include_bottom_braces: bool = True
    include_corner_braces: bool = True


class FoundationSoilLayer(BaseModel):
    index: int
    name: str
    depth_m: float
    thickness_m: float
    n_value: float | None = None
    su_t_per_m2: float | None = None
    soil_type: Literal["sand", "clay", "mixed"] = "mixed"


class ColumnScenarioInput(BaseModel):
    title: str
    variant: Literal["middle", "composite_normal", "composite_crane"] = "middle"
    enabled: bool = True
    column_section_name: str
    support_rows: list[SupportRow] = Field(default_factory=list)
    foundation_type: str = "鑽掘或引孔樁"
    foundation_shape: str = "(直徑)"
    foundation_size_x_m: float = 0.8
    foundation_size_y_m: float = 2.5
    column_length_m: float = 20.0
    kh_kg_per_cm3: float = 4.0
    pile_width_cm: float | None = None
    bottom_to_excavation_distance_m: float = 4.0
    eccentricity_x_m: float | None = None
    eccentricity_y_m: float = 0.0
    embedment_length_cm: float = 300.0
    concrete_strength_kg_per_cm2: float = 175.0
    soil_layers: list[FoundationSoilLayer] = Field(default_factory=list)
    compression_fs: float = 2.0
    tension_fs: float = 3.0
    pile_unit_weight_t_per_m3: float = 1.8


class CheckResult(BaseModel):
    module_name: str
    label: str
    formula_id: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    computed_value: float | None = None
    allowable_value: float | None = None
    utilization_ratio: float | None = None
    status: Literal["OK", "Say~OK", "NG"] = "OK"
    controlling_condition: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class SummaryItem(BaseModel):
    group: str
    label: str
    section_name: str
    status: str
    utilization_ratio: float | None = None


class CalculationResults(BaseModel):
    generated_at: datetime
    support_checks: list[CheckResult] = Field(default_factory=list)
    wale_checks: list[CheckResult] = Field(default_factory=list)
    brace_checks: list[CheckResult] = Field(default_factory=list)
    corner_brace_checks: list[CheckResult] = Field(default_factory=list)
    column_checks: list[CheckResult] = Field(default_factory=list)
    summary: list[SummaryItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ReferenceData(BaseModel):
    sections: list[SectionProperty]
    bolts: list[BoltStrengthRow]
    basic_defaults: BasicParameters


class ProjectState(BaseModel):
    metadata: ProjectMetadata
    basic_parameters: BasicParameters = Field(default_factory=BasicParameters)
    calculation_options: CalculationOptions = Field(default_factory=CalculationOptions)
    top_analysis_source: AnalysisSideSource = Field(default_factory=AnalysisSideSource)
    bottom_analysis_source: AnalysisSideSource = Field(default_factory=AnalysisSideSource)
    analysis_import: AnalysisImportResult = Field(default_factory=AnalysisImportResult)
    top_supports: list[SupportRow] = Field(default_factory=list)
    bottom_supports: list[SupportRow] = Field(default_factory=list)
    top_wales: list[WaleRow] = Field(default_factory=list)
    bottom_wales: list[WaleRow] = Field(default_factory=list)
    top_braces: list[BraceRow] = Field(default_factory=list)
    bottom_braces: list[BraceRow] = Field(default_factory=list)
    corner_braces: list[CornerBraceRow] = Field(default_factory=list)
    columns: list[ColumnScenarioInput] = Field(default_factory=list)
    calculation_results: CalculationResults | None = None


class ProjectListItem(BaseModel):
    id: str
    name: str
    updated_at: datetime | None = None


class BootstrapPayload(BaseModel):
    reference_data: ReferenceData
    default_project: ProjectState
    sample_analysis_files: list[str]


class CreateProjectRequest(BaseModel):
    name: str = "新專案"


class ImportAnalysisResponse(BaseModel):
    analysis_import: AnalysisImportResult
    suggested_updates: dict[str, Any] = Field(default_factory=dict)


class SaveProjectRequest(BaseModel):
    project: ProjectState


class SaveProjectResponse(BaseModel):
    project: ProjectState


class SaveReferenceDataRequest(BaseModel):
    reference_data: ReferenceData


class ReportPayload(BaseModel):
    project: ProjectState
    report_path: str
    download_url: str
    latest_download_url: str | None = None
    report_mode: Literal["detailed", "concise"] = "detailed"
    report_kind: Literal["pdf", "docx"] = "pdf"
