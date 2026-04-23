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

export type InteractionEquation = 'linear' | 'power'

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
}

export type ReportMode = 'summary' | 'full'

export type ProjectAuditSource =
  | 'manual'
  | 'preview'
  | 'print'
  | 'html'
  | 'xlsx'
  | 'docx'

export interface ReportSettings {
  companyName: string
  projectCode: string
  designer: string
  checker: string
  issueDate: string
  reportMode: ReportMode
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
  shearHairpinReinforcement: boolean
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
  ruleProfileId: RuleProfileId
  projectName: string
  productLabel: string
  summary: ProjectSnapshot
}

export interface ProjectCase {
  id: string
  name: string
  ruleProfileId: RuleProfileId
  selectedProductId: string
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

export interface ReviewVisualizationAnchor {
  anchorId: string
  appliedTensionKn: number
  elasticTensionKn: number
  state: 'tension' | 'compression' | 'neutral'
}

export interface ReviewVisualizationRectangle {
  id: string
  kind: 'tension_breakout' | 'shear_breakout_x' | 'shear_breakout_y'
  x1: number
  x2: number
  y1: number
  y2: number
}

export interface ReviewVisualizationEdgeHighlight {
  edge: VisualizationEdge
  label: string
}

export interface ReviewVisualization {
  anchors: ReviewVisualizationAnchor[]
  rectangles: ReviewVisualizationRectangle[]
  edges: ReviewVisualizationEdgeHighlight[]
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
