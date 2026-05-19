export type ProjectListItem = {
  id: string;
  name: string;
  updated_at?: string | null;
};

export type SectionProperty = {
  name: string;
  depth_cm: number;
  flange_width_cm: number;
  web_thickness_cm: number;
  flange_thickness_cm: number;
  area_cm2: number;
  unit_weight_kgf_per_m: number;
  ix_cm4: number;
  iy_cm4: number;
  rx_cm: number;
  ry_cm: number;
  rt_cm: number;
  sx_cm3: number;
  sy_cm3: number;
  zx_cm3: number;
  zy_cm3: number;
};

export type BoltStrengthRow = {
  grade: string;
  ft_tf_per_cm2?: number | null;
  fv_tf_per_cm2?: number | null;
  sizes: Record<string, number>;
};

export type BasicParameters = {
  e_tf_per_cm2: number;
  fy_tf_per_cm2: number;
  cm_factor: number;
  surcharge_wl_tf_per_m: number;
  alpha_support: number;
  alpha_wale: number;
  alpha_brace: number;
  alpha_corner_brace: number;
  alpha_column: number;
  psi_material: number;
  wall_type: string;
  wall_thickness_cm: number;
  wall_fc_kg_per_cm2: number;
};

export type SupportRow = {
  level_label: string;
  support_count: number;
  section_name: string;
  axial_force_t: number;
  temp_force_t: number;
  spacing_m: number;
};

export type WaleRow = {
  level_label: string;
  wale_count: number;
  section_name: string;
  span_m: number;
  support_spacing_m: number;
  line_load_tf_per_m: number;
};

export type BraceRow = {
  level_label: string;
  section_name: string;
  l1_m: number;
  l2_m: number;
  angle_deg: number;
  tributary_line_load_tf_per_m: number;
};

export type CornerBraceRow = {
  level_label: string;
  section_name: string;
  length_m: number;
  axial_force_t: number;
};

export type CalculationOptions = {
  include_top_supports: boolean;
  include_bottom_supports: boolean;
  auto_temp_force_top_supports: boolean;
  auto_temp_force_bottom_supports: boolean;
  consider_wall_deduction_for_wales: boolean;
  include_top_wales: boolean;
  include_bottom_wales: boolean;
  include_top_braces: boolean;
  include_bottom_braces: boolean;
  include_corner_braces: boolean;
};

export type FoundationSoilLayer = {
  index: number;
  name: string;
  depth_m: number;
  thickness_m: number;
  n_value?: number | null;
  su_t_per_m2?: number | null;
  soil_type: "sand" | "clay" | "mixed";
};

export type ColumnScenarioInput = {
  title: string;
  variant: "middle" | "composite_normal" | "composite_crane";
  enabled: boolean;
  column_section_name: string;
  support_rows: SupportRow[];
  foundation_type: string;
  foundation_shape: string;
  foundation_size_x_m: number;
  foundation_size_y_m: number;
  column_length_m: number;
  kh_kg_per_cm3: number;
  pile_width_cm?: number | null;
  bottom_to_excavation_distance_m: number;
  eccentricity_x_m?: number | null;
  eccentricity_y_m: number;
  embedment_length_cm: number;
  concrete_strength_kg_per_cm2: number;
  soil_layers: FoundationSoilLayer[];
  compression_fs: number;
  tension_fs: number;
  pile_unit_weight_t_per_m3: number;
};

export type SoilLayer = {
  index: number;
  name: string;
  thickness_m?: number | null;
  depth_m?: number | null;
  n_value?: number | null;
  unit_weight_t_per_m3?: number | null;
  phi_deg?: number | null;
  cohesion_t_per_m2?: number | null;
  delta_ratio?: number | null;
  su_t_per_m2?: number | null;
  ka?: number | null;
  kp?: number | null;
  es_t_per_m2?: number | null;
  kh_t_per_m3?: number | null;
  soil_type: "sand" | "clay" | "mixed";
};

export type AnalysisStrut = {
  index: number;
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  stiffness: number;
};

export type AnalysisEvent = {
  stage_index: number;
  stage_label: string;
  classification: "support" | "brace" | "floor" | "remove" | "other";
  butt_no?: number | null;
  depth_m?: number | null;
  span_m?: number | null;
  angle_deg?: number | null;
  load_t?: number | null;
  stiffness?: number | null;
  description: string;
  included: boolean;
};

export type AnalysisStage = {
  index: number;
  label: string;
  excavation_depth_m?: number | null;
  water_level_m?: number | null;
  struts: AnalysisStrut[];
};

export type AnalysisImportResult = {
  source_name: string;
  source_type: string;
  project_title: string;
  wall_length_m?: number | null;
  wall_thickness_m?: number | null;
  excavation_depth_m?: number | null;
  ground_water_level_m?: number | null;
  wall_ei_tf_m2_per_m?: number | null;
  soils: SoilLayer[];
  stages: AnalysisStage[];
  events: AnalysisEvent[];
  warnings: string[];
  raw_preview: string[];
};

export type AnalysisSourceMode = "unused" | "import" | "manual";

export type AnalysisSideSource = {
  mode: AnalysisSourceMode;
  import_result: AnalysisImportResult;
};

export type CheckResult = {
  module_name: string;
  label: string;
  formula_id: string;
  inputs: Record<string, string | number>;
  computed_value?: number | null;
  allowable_value?: number | null;
  utilization_ratio?: number | null;
  status: "OK" | "Say~OK" | "NG";
  controlling_condition: string;
  details: Record<string, string | number | string[]>;
};

export type SummaryItem = {
  group: string;
  label: string;
  section_name: string;
  status: string;
  utilization_ratio?: number | null;
};

export type CalculationResults = {
  generated_at: string;
  support_checks: CheckResult[];
  wale_checks: CheckResult[];
  brace_checks: CheckResult[];
  corner_brace_checks: CheckResult[];
  column_checks: CheckResult[];
  summary: SummaryItem[];
  warnings: string[];
};

export type ReferenceData = {
  sections: SectionProperty[];
  bolts: BoltStrengthRow[];
  basic_defaults: BasicParameters;
};

export type ProjectMetadata = {
  id?: string | null;
  name: string;
  project_code: string;
  client: string;
  designer: string;
  checker: string;
  organization: string;
  location: string;
  notes: string;
  spec_pack_version: string;
  unit_system: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProjectState = {
  metadata: ProjectMetadata;
  basic_parameters: BasicParameters;
  calculation_options: CalculationOptions;
  top_analysis_source: AnalysisSideSource;
  bottom_analysis_source: AnalysisSideSource;
  analysis_import: AnalysisImportResult;
  top_supports: SupportRow[];
  bottom_supports: SupportRow[];
  top_wales: WaleRow[];
  bottom_wales: WaleRow[];
  top_braces: BraceRow[];
  bottom_braces: BraceRow[];
  corner_braces: CornerBraceRow[];
  columns: ColumnScenarioInput[];
  calculation_results?: CalculationResults | null;
};

export type BootstrapPayload = {
  reference_data: ReferenceData;
  default_project: ProjectState;
  sample_analysis_files: string[];
};

export type ReportPayload = {
  project: ProjectState;
  report_path: string;
  download_url: string;
  latest_download_url?: string | null;
  report_mode: "detailed" | "concise";
  report_kind: "pdf" | "docx";
};
