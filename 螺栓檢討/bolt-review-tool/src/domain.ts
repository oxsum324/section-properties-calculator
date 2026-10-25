export type RuleProfileId = 'tw_rc_112_anchor_profile'

export type AnchorFamily =
  | 'cast_in'
  | 'post_installed_expansion'
  | 'post_installed_bonded'
  | 'screw_anchor'
  | 'undercut_anchor'
  | 'shear_lug'

export type InstallationBehavior =
  | 'not_torqued'
  | 'torqued'
  | 'torque_controlled'
  | 'displacement_controlled'
  | 'bonded'
  | 'screw'
  | 'undercut'

export type QualificationStandard =
  | 'ACI_355_2'
  | 'ACI_355_4'
  | 'EAD_330232_00_0601'
  | 'MANUAL'

export type AnchorCategory = 1 | 2 | 3

export type SeismicDesignMethod =
  | 'standard'
  | 'ductile_steel'
  | 'attachment_yield'
  | 'nonyielding_attachment'
  | 'overstrength'

export type SeismicInputMode = 'total_design' | 'static_plus_earthquake'

/**
 * 拉剪互制方程：
 * - linear：ACI 318-19 §17.8.3 三折線合，N/(φNn) + V/(φVn) ≤ 1.2（規範上限）
 * - linear_strict：保守線性，N/(φNn) + V/(φVn) ≤ 1.0（無 1.2 放大餘裕）
 * - power：ACI 318-19 §17.8.3 5/3 次方，(N/(φNn))^5/3 + (V/(φVn))^5/3 ≤ 1.0
 *
 * 所有型式均受 17.8.1 / 17.8.2 的 0.2 門檻例外約束：
 * 若 V ≤ 0.2·φVn → 全 N 可用；若 N ≤ 0.2·φNn → 全 V 可用。
 */
export type InteractionEquation = 'linear' | 'linear_strict' | 'power'

export type BearingConfinementMode = 'none' | 'partial' | 'full'

export type BasePlateSectionType = 'rectangle' | 'custom'

export type ColumnSectionType = 'manual' | 'i_h' | 'rect' | 'pipe'

export type DimensionSource = 'code' | 'product' | 'code_fallback' | 'waived'

export type ReviewStatus =
  | 'pass'
  | 'fail'
  | 'screening'
  | 'incomplete'
  | 'warning'

export type ResultValuePresentation = 'force' | 'ratio' | 'stress' | 'length'

export type LengthUnit = 'mm' | 'cm' | 'm'

export type AreaUnit = 'mm2' | 'cm2'

export type ForceUnit = 'kN' | 'kgf' | 'tf'

export type StressUnit = 'MPa' | 'kgf_cm2'

export interface UnitPreferences {
  lengthUnit: LengthUnit
  areaUnit: AreaUnit
  forceUnit: ForceUnit
  stressUnit: StressUnit
  simpleMode: boolean
  /**
   * 精簡載重模式：隱藏載重組合批次 / D·L·E Preset / CSV 匯入 / 17.10 耐震入口，
   * 僅顯示單一組設計 N / Vx / Vy / Mx / My + 受剪錨栓數 + 拉剪互制式。
   * 讓單一設計值使用者（簡易機械基座、樁頭預埋、暫時性支架等）不被複雜選項干擾。
   * 預設 true（新案例預設精簡）；隨時可取消以進入進階模式。
   */
  loadsSimpleMode?: boolean
}

export type ReportMode = 'summary' | 'full' | 'code_check'

/**
 * 錨栓規範簡核附件的使用情境。
 *
 * slab_attachment 僅代表混凝土板上的錨栓固定；結構植筋之伸展、搭接、
 * 新舊混凝土界面傳力仍應依其適用章節另案檢核，不可用第 17 章錨栓結論取代。
 */
export type AnchorApplication =
  | 'general'
  | 'isolated_footing'
  | 'slab_attachment'

export type ProjectAuditSource =
  | 'manual'
  | 'preview'
  | 'print'
  | 'html'
  | 'txt'
  | 'xlsx'
  | 'docx'

export interface ReportSettings {
  companyName: string
  projectCode: string
  designer: string
  checker: string
  issueDate: string
  reportMode: ReportMode
  /** 本次計算內容是否已由使用者明確核可為正式附件；不作為工程 PASS 判定。 */
  documentApproved?: boolean
  /** 核可時間；修改計算內容或報告識別／版面設定時由頁面狀態清除。 */
  documentApprovedAt?: string
  /**
   * 公司 LOGO（dataURL，建議 PNG/SVG，最大 200KB）。
   * 報表封面與列印 running-head 自動帶入。空字串代表未設定。
   */
  companyLogoDataUrl?: string
}

export type ProjectDocumentKind =
  | 'eta'
  | 'catalog'
  | 'drawing'
  | 'calculation'
  | 'photo'
  | 'other'

export interface ProjectDocument {
  id: string
  name: string
  fileName: string
  mimeType: string
  sizeBytes: number
  kind: ProjectDocumentKind
  note: string
  verified: boolean
  addedAt: string
}

export interface StoredDocumentFile {
  id: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  blob: Blob
  updatedAt: string
}

export type ProductEvidenceFieldKey =
  | 'headBearingAreaMm2'
  | 'hookExtensionMm'
  | 'qualificationStandard'
  | 'anchorCategory'
  | 'crackedConcreteQualified'
  | 'uncrackedConcreteQualified'
  | 'kcUncrackedRatio'
  | 'minEdgeDistanceMm'
  | 'minSpacingMm'
  | 'minThicknessMm'
  | 'criticalEdgeDistanceMm'
  | 'splittingCriticalEdgeDistanceMm'
  | 'crackedPulloutStrengthKn'
  | 'uncrackedPulloutStrengthKn'
  | 'crackedBondStressMpa'
  | 'uncrackedBondStressMpa'
  | 'shearLoadBearingLengthMm'
  | 'seismicQualified'

export interface RuleCitation {
  chapter: string
  clause: string
  title: string
  note?: string
}

export interface RuleProfile {
  id: RuleProfileId
  name: string
  versionLabel: string
  officialPublishedDate: string
  effectiveDate: string
  errataDate: string
  officialUrl: string
  chapter17Url: string
  chapter17Title: string
  citations: Record<string, RuleCitation>
  constants: {
    lambdaA: number
    kcCastIn: number
    kcPostInstalled: number
    shearConstantA: number
    shearConstantB: number
    sideFaceBlowoutConstant: number
    pryoutThresholdMm: number
  }
  phi: {
    steelTension: number
    steelShear: number
    castInConcrete: number
    postInstalledConcrete: number
    concreteWithSupplementaryReinforcement: number
    bearingCompression: number
  }
}

export interface ProductEvaluationData {
  qualificationStandard?: QualificationStandard
  anchorCategory?: AnchorCategory
  crackedConcreteQualified?: boolean
  uncrackedConcreteQualified?: boolean
  kcUncrackedRatio?: number
  minEdgeDistanceMm?: number
  minSpacingMm?: number
  minThicknessMm?: number
  criticalEdgeDistanceMm?: number
  splittingCriticalEdgeDistanceMm?: number
  crackedPulloutStrengthKn?: number
  uncrackedPulloutStrengthKn?: number
  crackedBondStressMpa?: number
  uncrackedBondStressMpa?: number
  shearLoadBearingLengthMm?: number
  seismicQualified?: boolean
  notes?: string
}

export interface ProductEvidenceEntry {
  documentName?: string
  page?: string
  note?: string
  verified?: boolean
}

export interface AnchorProduct {
  id: string
  family: AnchorFamily
  installationBehavior: InstallationBehavior
  brand: string
  model: string
  description: string
  diameterMm: number
  effectiveAreaMm2: number
  embedmentMinMm: number
  embedmentMaxMm: number
  steelYieldStrengthMpa: number
  steelUltimateStrengthMpa: number
  headBearingAreaMm2?: number
  hookExtensionMm?: number
  evaluation: ProductEvaluationData
  evidence?: Partial<Record<ProductEvidenceFieldKey, ProductEvidenceEntry>>
  source: string
  notes: string
}

export interface AnchorLayout {
  concreteWidthMm: number
  concreteHeightMm: number
  thicknessMm: number
  concreteStrengthMpa: number
  maxAggregateSizeMm: number
  specifiedCoverRequirementMm: number
  crackedConcrete: boolean
  lightweightConcrete: boolean
  supplementaryReinforcement: boolean
  /**
   * 舊版單一勾選（全域「剪力 U 型補強鋼筋」）。僅供舊案相容：未設定 shearEdgeReinforcement 時，
   * true 視為各自由邊皆為「配置不小於 D13 之鋼筋」（ψc,V = 1.2），不會自動升為 1.4。
   */
  shearHairpinReinforcement: boolean
  /**
   * 表 17.7.2.5.1（開裂）逐自由邊條件；一旦設定，各邊以此為準並忽略舊版單一勾選。
   * 'none'：錨栓無輔助鋼筋或角隅鋼筋小於 D13（1.0）
   * 'd13'：錨栓與邊緣之間配置不小於 D13 之鋼筋（1.2）
   * 'd13_stirrups'：錨栓與邊緣之間配置不小於 D13 之鋼筋，且圍繞鋼筋之箍筋間距不大於 10 cm（1.4）
   */
  shearEdgeReinforcement?: Partial<Record<VisualizationEdge, ShearEdgeReinforcement>>
  basePlateBearingEnabled: boolean
  basePlateLoadedAreaMm2: number
  basePlateLoadedWidthMm?: number
  basePlateLoadedHeightMm?: number
  basePlatePlanWidthMm?: number
  basePlatePlanHeightMm?: number
  basePlateSectionType?: BasePlateSectionType
  basePlateSectionModulusXmm3?: number
  basePlateSectionModulusYmm3?: number
  basePlateSupportAreaMm2: number
  basePlateConfinedOnAllSides: boolean
  basePlateConfinementMode?: BearingConfinementMode
  basePlateBearingMomentExternallyVerified?: boolean
  basePlateBendingEnabled: boolean
  basePlateThicknessMm: number
  basePlateSteelYieldMpa: number
  basePlateCantileverXmm: number
  basePlateCantileverYmm: number
  columnSectionType?: ColumnSectionType
  columnDepthMm?: number
  columnFlangeWidthMm?: number
  columnCentroidOffsetXmm?: number
  columnCentroidOffsetYmm?: number
  anchorReinforcementEnabled: boolean
  anchorReinforcementAreaMm2: number
  anchorReinforcementYieldMpa: number
  anchorReinforcementWithinHalfCa1: boolean
  anchorReinforcementIntersectsEachAnchor: boolean
  anchorReinforcementDevelopedForTension: boolean
  anchorReinforcementDevelopedForShear: boolean
  effectiveEmbedmentMm: number
  anchorCountX: number
  anchorCountY: number
  /**
   * 錨栓排列型式：
   * - 'grid'（預設）：nx × ny 矩形網格，所有位置皆有錨栓
   * - 'perimeter'：僅外框錨栓（H 型鋼周邊 / 大型柱腳周邊），
   *   亦即剔除 indexX ∈ [1, nx-2] 且 indexY ∈ [1, ny-2] 的內部位置。
   *   總數 = 2·nx + 2·(ny-2) = 2·(nx+ny-2)（nx,ny ≥ 2 時）。
   */
  anchorLayoutPattern?: 'grid' | 'perimeter'
  spacingXmm: number
  spacingYmm: number
  edgeLeftMm: number
  edgeRightMm: number
  edgeBottomMm: number
  edgeTopMm: number
}

export interface LoadCase {
  tensionKn: number
  shearXKn: number
  shearYKn: number
  shearEccentricityXmm?: number
  shearEccentricityYmm?: number
  shearLeverArmMm?: number
  shearAnchorCount?: number
  momentXKnM: number
  momentYKnM: number
  interactionEquation: InteractionEquation
  considerSeismic: boolean
  seismicInputMode: SeismicInputMode
  designEarthquakeTensionKn: number
  designEarthquakeShearKn: number
  designEarthquakeShearXKn?: number
  designEarthquakeShearYKn?: number
  designEarthquakeMomentXKnM?: number
  designEarthquakeMomentYKnM?: number
  seismicDesignMethod: SeismicDesignMethod
  overstrengthFactor?: number
  ductileStretchLengthMm?: number
  ductileBucklingRestrained?: boolean
  ductileAttachmentMechanismVerified?: boolean
  attachmentYieldTensionKn?: number
  attachmentYieldShearKn?: number
  attachmentYieldInteractionEquation?: InteractionEquation | 'none'
  attachmentOverstrengthFactor?: number
}

export interface LoadCombinationComponents {
  tensionKn: number
  shearXKn: number
  shearYKn: number
  momentXKnM: number
  momentYKnM: number
}

export interface LoadCasePresetInput {
  dead: LoadCombinationComponents
  live: LoadCombinationComponents
  earthquake: LoadCombinationComponents
  overstrengthFactor: number
  attachmentOverstrengthFactor: number
}

export interface ProjectLoadCase {
  id: string
  name: string
  loads: LoadCase
}

export interface ProjectLayoutVariant {
  id: string
  name: string
  layout: AnchorLayout
  note?: string
  updatedAt: string
}

export interface ProjectSnapshot {
  overallStatus: ReviewStatus
  governingMode: string
  governingDcr?: number
  maxDcr: number
  controllingLoadCaseName?: string
  updatedAt: string
}

export interface ProjectAuditEntry {
  id: string
  createdAt: string
  hash: string
  source: ProjectAuditSource
  calcEngineVersion?: string
  ruleProfileId: RuleProfileId
  projectName: string
  productLabel: string
  summary: ProjectSnapshot
}

export interface ProjectCase {
  id: string
  name: string
  ruleProfileId: RuleProfileId
  calcEngineVersion?: string
  selectedProductId: string
  /** 第 17 章規範簡核附件的用途；舊案例未設定時視為 general。 */
  anchorApplication?: AnchorApplication
  candidateProductIds?: string[]
  candidateLayoutVariants?: ProjectLayoutVariant[]
  layout: AnchorLayout
  loads: LoadCase
  loadCases?: ProjectLoadCase[]
  activeLoadCaseId?: string
  loadPresetInput?: LoadCasePresetInput
  ui?: UnitPreferences
  report?: ReportSettings
  documents?: ProjectDocument[]
  /**
   * 使用者標記「不檢討此項」的檢核 ID 清單（例如 'side-face-blowout', 'seismic'）。
   * 這些檢核：
   * - 仍會在 UI 結果頁顯示，但以弱化樣式呈現並標註「不列入報告」
   * - 不參與 overallStatus / maxDcr / governingMode 的判定
   * - 不寫入 HTML / XLSX / DOCX / 畫面列印區的報告表格
   * 用於本案不適用、資料不足且不影響主控的次要檢核，避免「incomplete」污染整體判定。
   */
  excludedCheckIds?: string[]
  updatedAt: string
  snapshot?: ProjectSnapshot
  auditTrail?: ProjectAuditEntry[]
}

export interface AnchorPoint {
  id: string
  x: number
  y: number
}

export type VisualizationEdge = 'left' | 'right' | 'bottom' | 'top'

export type ShearEdgeReinforcement = 'none' | 'd13' | 'd13_stirrups'

export interface ReviewVisualizationAnchor {
  anchorId: string
  appliedTensionKn: number
  elasticTensionKn: number
  state: 'tension' | 'compression' | 'neutral'
}

export interface ReviewVisualizationRectangle {
  id: string
  kind: 'tension_breakout'
  x1: number
  x2: number
  y1: number
  y2: number
}

export interface ReviewVisualizationEdgeHighlight {
  edge: VisualizationEdge
  label: string
}

/**
 * 混凝土剪破側視（垂直自由邊之剖面）資料；A_Vc 為構材側面投影，不畫成平面面積。
 * 長度 mm、面積 mm²。
 */
export interface ShearSideView {
  id: string
  direction: 'x' | 'y'
  edge: VisualizationEdge
  /** 實際邊距 ca1（臨界錨栓列至自由邊） */
  actualCa1Mm: number
  /** 17.7.2.1.1 限制後之 ca1' */
  ca1Mm: number
  ca1Limited: boolean
  thicknessMm: number
  embedmentMm: number
  /** 1.5ca1' */
  fullHeightMm: number
  /** A_Vc 投影高度 min(1.5ca1', ha) */
  projectedHeightMm: number
  truncated: boolean
  /** A_Vc 平行邊緣之投影寬度 */
  widthMm: number
  avcMm2: number
  avcoMm2: number
}

export interface ReviewVisualization {
  anchors: ReviewVisualizationAnchor[]
  /** 平面圖矩形：僅 A_Nc（拉破）；剪破 A_Vc 改以 shearSideViews 側視表示 */
  rectangles: ReviewVisualizationRectangle[]
  edges: ReviewVisualizationEdgeHighlight[]
  shearSideViews: ShearSideView[]
}

export interface DimensionCheck {
  id: string
  label: string
  requiredMm: number
  actualMm: number
  source: DimensionSource
  citation: RuleCitation
  status: ReviewStatus
  note?: string
}

export interface CheckResult {
  id: string
  mode: string
  citation: RuleCitation
  status: ReviewStatus
  designStrengthKn: number
  nominalStrengthKn: number
  demandKn: number
  dcr: number
  edgeDistanceSource?: DimensionSource
  formal: boolean
  presentation?: ResultValuePresentation
  factors?: ResultFactor[]
  routeDiagnostics?: ResultDiagnostic[]
  diagnostics?: ResultDiagnostic[]
  note?: string
}

export interface ResultFactor {
  symbol: string
  label: string
  value: string
  note?: string
}

export interface ResultDiagnostic {
  key: string
  severity: ReviewStatus
  message: string
}

export interface ReviewSummary {
  overallStatus: ReviewStatus
  formalStatus: ReviewStatus
  maxDcr: number
  governingDcr: number
  governingMode: string
  governingTensionMode: string
  governingShearMode: string
  notes: string[]
}

export interface ReviewResult {
  ruleProfile: RuleProfile
  product: AnchorProduct
  project: ProjectCase
  analysisLoads: LoadCase
  analysisNote?: string
  anchorPoints: AnchorPoint[]
  visualization: ReviewVisualization
  dimensionChecks: DimensionCheck[]
  results: CheckResult[]
  summary: ReviewSummary
}

export interface LoadCaseReview {
  loadCaseId: string
  loadCaseName: string
  review: ReviewResult
}

export interface ReviewBatchResult {
  activeLoadCaseId: string
  activeLoadCaseName: string
  activeReview: ReviewResult
  controllingLoadCaseId: string
  controllingLoadCaseName: string
  controllingReview: ReviewResult
  loadCaseReviews: LoadCaseReview[]
  summary: ReviewSummary
}

export interface ProductCompleteness {
  formal: boolean
  missing: string[]
}
