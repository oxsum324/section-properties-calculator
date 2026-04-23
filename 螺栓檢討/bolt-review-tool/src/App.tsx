import {
  Suspense,
  type ChangeEvent,
  lazy,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { getAnchorReinforcementOverlay } from './anchorReinforcementOverlay'
import {
  getBasePlatePlanDimensions,
  getColumnSectionType,
  getDerivedBasePlateCantilevers,
} from './basePlateGeometry'
import { getBasePlateBearingOverlay } from './bearingOverlay'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import { db, ensureSeedData, resetLocalDatabase } from './db'
import {
  normalizeReportSettings,
  defaultProducts,
  defaultProject,
} from './defaults'
import type {
  AreaUnit,
  AnchorFamily,
  AnchorLayout,
  AnchorProduct,
  BasePlateSectionType,
  BearingConfinementMode,
  CheckResult,
  ColumnSectionType,
  DimensionCheck,
  ForceUnit,
  LoadCasePresetInput,
  LoadCombinationComponents,
  LengthUnit,
  ProjectLoadCase,
  ProjectAuditEntry,
  ProjectAuditSource,
  ProjectCase,
  ProjectLayoutVariant,
  ProjectDocumentKind,
  ProductEvidenceEntry,
  ProductEvidenceFieldKey,
  ReportMode,
  ReportSettings,
  ProjectSnapshot,
  ReviewResult,
  ReviewStatus,
  StoredDocumentFile,
  StressUnit,
  UnitPreferences,
} from './domain'
import type {
  EvidenceFieldView,
  EvidenceLinkStatusFilter,
  EvidenceLinkSummary,
} from './evidenceLinks'
import type { EvaluationFieldState } from './evaluationCatalog'
import {
  createProjectAuditEntry,
  formatAuditHash,
  getLatestProjectAuditEntry,
} from './evaluationAudit'
import type {
  ProductTemplate,
} from './productTemplates'
import {
  applyProjectTemplate,
  findProjectTemplateById,
  projectTemplates as projectTemplateCatalog,
  type ProjectTemplateCategory,
  type ProjectTemplateRecommendation,
} from './projectTemplates'
import { recommendProjectTemplates } from './projectTemplateRecommendations'
import { normalizeLoadCasePresetInput } from './loadCasePresetInput'
import {
  getRuleProfileById,
  getRuleProfileOptions,
  normalizeRuleProfileId,
} from './ruleProfiles'
import type { ReportArtifactParams } from './reportExport'
import { REPORT_TIMESTAMP_LABELS } from './reportTimestamps'
import { getResultPresentationSummary } from './resultPresentation'
import type { SeismicRouteGuidance } from './seismicRouteGuidance'
import ResourceLibraryHub, {
  type ResourceLibraryTabId,
} from './ResourceLibraryHub'
import {
  formatInputQuantity,
  fromDisplayValue,
  getInputStep,
  getUnitOptionLabel,
  getUnitSymbol,
  normalizeUnitPreferences,
  toDisplayValue,
} from './units'
import type { QuantityKind } from './units'

const ProjectTemplateLibrary = lazy(() => import('./ProjectTemplateLibrary'))
const ProductTemplateLibrary = lazy(() => import('./ProductTemplateLibrary'))
const ProductScanAssistant = lazy(() => import('./ProductScanAssistant'))

const numberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
})

const loadCaseDelimitedHeaderRow =
  'name,tension_kN,shear_x_kN,shear_y_kN,moment_x_kN_m,moment_y_kN_m,shear_ecc_x_mm,shear_ecc_y_mm,shear_lever_arm_mm,shear_anchor_count,interaction_equation,consider_seismic,seismic_input_mode,eq_tension_kN,eq_shear_total_kN,eq_shear_x_kN,eq_shear_y_kN,eq_moment_x_kN_m,eq_moment_y_kN_m,seismic_design_method,omega_o,ductile_stretch_length_mm,ductile_buckling_restrained,ductile_attachment_mechanism_verified,attachment_yield_tension_kN,attachment_yield_shear_kN,attachment_yield_interaction,omega_attachment'

const loadCaseDelimitedExampleRow =
  'LC1,80,18,6,0,0,,,,,linear,false,total_design,0,0,0,0,0,0,standard,1,0,false,false,0,0,none,1'

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return numberFormatter.format(value)
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${formatNumber(sizeBytes / 1024)} KB`
  }

  return `${formatNumber(sizeBytes / (1024 * 1024))} MB`
}

function statusLabel(status: ReviewStatus) {
  switch (status) {
    case 'pass':
      return '符合'
    case 'fail':
      return '不符合'
    case 'screening':
      return '初篩'
    case 'incomplete':
      return '需補資料'
    case 'warning':
      return '提醒'
    default:
      return status
  }
}

function getGoverningDcr(summary: { governingDcr?: number; maxDcr: number }) {
  return summary.governingDcr ?? summary.maxDcr
}

function getSeismicGuidanceBadgeStatus(state: string): ReviewStatus {
  switch (state) {
    case 'ready':
      return 'pass'
    case 'configuration_issue':
      return 'warning'
    case 'needs_input':
    default:
      return 'incomplete'
  }
}

function getBearingConfinementMode(
  layout: AnchorLayout,
): BearingConfinementMode {
  if (layout.basePlateConfinementMode === 'partial') {
    return 'partial'
  }
  if (
    layout.basePlateConfinementMode === 'full' ||
    layout.basePlateConfinedOnAllSides
  ) {
    return 'full'
  }
  return 'none'
}

function getBasePlateSectionType(layout: AnchorLayout): BasePlateSectionType {
  return layout.basePlateSectionType === 'custom' ? 'custom' : 'rectangle'
}

function basePlateSectionTypeLabel(type: BasePlateSectionType) {
  return type === 'custom' ? '自訂 Sx / Sy' : '矩形承壓區'
}

function columnSectionTypeLabel(type: ColumnSectionType) {
  switch (type) {
    case 'i_h':
      return 'I / H 形柱'
    case 'rect':
      return '矩形柱'
    case 'pipe':
      return '圓管 / 圓柱'
    case 'manual':
    default:
      return '手動輸入'
  }
}

function getEffectiveBasePlateLoadedArea(layout: AnchorLayout) {
  if (layout.basePlateLoadedAreaMm2 > 0) {
    return layout.basePlateLoadedAreaMm2
  }
  const width = Math.max(0, layout.basePlateLoadedWidthMm ?? 0)
  const height = Math.max(0, layout.basePlateLoadedHeightMm ?? 0)
  return width > 0 && height > 0 ? width * height : 0
}

function resultStatusSeverity(status: ReviewStatus) {
  switch (status) {
    case 'fail':
      return 5
    case 'incomplete':
      return 4
    case 'screening':
      return 3
    case 'warning':
      return 2
    case 'pass':
    default:
      return 1
  }
}

function productMatchesSearch(product: AnchorProduct, raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) {
    return true
  }
  const familyText = familyLabel(product.family)
  const haystack = [
    product.brand,
    product.model,
    product.family,
    familyText,
  ]
    .map((text) => String(text ?? '').toLowerCase())
    .join('\n')
  // 多關鍵字以空白分隔 — 需全部命中
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

function familyLabel(family: AnchorFamily) {
  switch (family) {
    case 'cast_in':
      return '預埋錨栓'
    case 'post_installed_expansion':
      return '後置膨脹錨栓'
    case 'post_installed_bonded':
      return '後置黏結式錨栓'
    case 'screw_anchor':
      return '螺紋錨栓'
    case 'undercut_anchor':
      return '擴底式錨栓'
    case 'shear_lug':
      return '剪力榫'
    default:
      return family
  }
}

function documentKindLabel(kind: ProjectDocumentKind) {
  switch (kind) {
    case 'eta':
      return 'ETA / 評估'
    case 'catalog':
      return '型錄 / 手冊'
    case 'drawing':
      return '圖面 / 施工圖'
    case 'calculation':
      return '計算書 / 比對'
    case 'photo':
      return '照片 / 現況'
    case 'other':
      return '其他'
    default:
      return kind
  }
}

function projectTemplateCategoryLabel(category: ProjectTemplateCategory) {
  switch (category) {
    case 'steel_column':
      return '鋼柱柱腳'
    case 'pipe_column':
      return '鋼管柱柱腳'
    case 'embed_plate':
      return '埋件 / 牆面固定'
    case 'equipment_base':
      return '設備基座'
    default:
      return category
  }
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function cloneProject(project: ProjectCase) {
  const baseLoads = { ...defaultProject.loads, ...project.loads }
  const bearingConfinementMode =
    project.layout?.basePlateConfinementMode ??
    (project.layout?.basePlateConfinedOnAllSides ? 'full' : 'none')
  const loadCases =
    project.loadCases && project.loadCases.length > 0
      ? project.loadCases.map((item) => ({
          ...item,
          loads: {
            ...baseLoads,
            ...item.loads,
          },
        }))
      : [
          {
            id: project.activeLoadCaseId ?? 'load-case-1',
            name: 'LC1',
            loads: baseLoads,
          } satisfies ProjectLoadCase,
        ]
  const activeLoadCaseId = loadCases.some(
    (item) => item.id === project.activeLoadCaseId,
  )
    ? project.activeLoadCaseId
    : loadCases[0]?.id
  const activeLoads =
    loadCases.find((item) => item.id === activeLoadCaseId)?.loads ?? baseLoads

  return {
    ...project,
    ruleProfileId: normalizeRuleProfileId(project.ruleProfileId),
    layout: {
      ...defaultProject.layout,
      ...project.layout,
      basePlateConfinementMode: bearingConfinementMode,
      basePlateConfinedOnAllSides: bearingConfinementMode === 'full',
    },
    loads: activeLoads,
    loadCases,
    activeLoadCaseId,
    loadPresetInput: normalizeLoadCasePresetInput(project.loadPresetInput),
    ui: normalizeUnitPreferences(project.ui),
    report: normalizeReportSettings(project.report),
    candidateLayoutVariants: (project.candidateLayoutVariants ?? []).map(
      (item) => ({
        ...item,
        layout: {
          ...defaultProject.layout,
          ...item.layout,
        },
      }),
    ),
    documents: (project.documents ?? []).map((item) => ({ ...item })),
    auditTrail: (project.auditTrail ?? []).map((item) => ({
      ...item,
      summary: { ...item.summary },
    })),
  }
}

function replaceProjectInList(
  projects: ProjectCase[],
  nextProject: ProjectCase,
) {
  const normalized = cloneProject(nextProject)
  const targetIndex = projects.findIndex((item) => item.id === normalized.id)

  if (targetIndex === -1) {
    return [...projects, normalized]
  }

  return projects.map((item, index) =>
    index === targetIndex ? normalized : item,
  )
}

function makeUniqueProjectName(baseName: string, projects: ProjectCase[]) {
  const trimmed = baseName.trim() || '新案例'

  if (!projects.some((item) => item.name === trimmed)) {
    return trimmed
  }

  let index = 2
  while (projects.some((item) => item.name === `${trimmed} ${index}`)) {
    index += 1
  }

  return `${trimmed} ${index}`
}

function normalizeProjectSelection(
  project: ProjectCase,
  products: AnchorProduct[],
) {
  const fallbackProductId = products[0]?.id ?? project.selectedProductId
  const selectedProductId = products.some(
    (item) => item.id === project.selectedProductId,
  )
    ? project.selectedProductId
    : fallbackProductId
  const candidateProductIds = Array.from(
    new Set(
      (project.candidateProductIds ?? [selectedProductId]).filter((productId) =>
        products.some((item) => item.id === productId),
      ),
    ),
  )
  if (!candidateProductIds.includes(selectedProductId)) {
    candidateProductIds.unshift(selectedProductId)
  }

  return cloneProject({
    ...project,
    selectedProductId,
    candidateProductIds,
  })
}

function buildProjectSnapshot(
  summary: ReviewResult['summary'],
  controllingLoadCaseName?: string,
): ProjectSnapshot {
  return {
    overallStatus: summary.overallStatus,
    governingMode: summary.governingMode,
    governingDcr: getGoverningDcr(summary),
    maxDcr: summary.maxDcr,
    controllingLoadCaseName,
    updatedAt: new Date().toISOString(),
  }
}

function auditSourceLabel(source: ProjectAuditSource) {
  switch (source) {
    case 'manual':
      return '手動留存'
    case 'preview':
      return '報表預覽'
    case 'print':
      return '列印報表'
    case 'html':
      return '匯出 HTML'
    case 'xlsx':
      return '匯出 XLSX'
    case 'docx':
      return '匯出 DOCX'
    default:
      return source
  }
}

const projectIdSeed = Date.now()
let projectIdSequence = 0
const loadCaseIdSeed = Date.now()
let loadCaseIdSequence = 0
const layoutVariantIdSeed = Date.now()
let layoutVariantIdSequence = 0
const documentIdSeed = Date.now()
let documentIdSequence = 0

function nextProjectId() {
  projectIdSequence += 1
  return `project-${projectIdSeed}-${projectIdSequence}`
}

function nextDocumentId() {
  documentIdSequence += 1
  return `document-${documentIdSeed}-${documentIdSequence}`
}

function nextLoadCaseId() {
  loadCaseIdSequence += 1
  return `load-case-${loadCaseIdSeed}-${loadCaseIdSequence}`
}

function nextLayoutVariantId() {
  layoutVariantIdSequence += 1
  return `layout-variant-${layoutVariantIdSeed}-${layoutVariantIdSequence}`
}

function cloneProduct(product: AnchorProduct, id: string) {
  return {
    ...product,
    id,
    evaluation: { ...product.evaluation },
    evidence: { ...product.evidence },
  }
}

function nextTemplateImportId(templateId: string, products: AnchorProduct[]) {
  const prefix = `${templateId}-import-`
  const usedIndexes = new Set(
    products
      .filter((item) => item.id.startsWith(prefix))
      .map((item) => Number(item.id.slice(prefix.length)))
      .filter((value) => Number.isInteger(value) && value > 0),
  )

  let nextIndex = 1
  while (usedIndexes.has(nextIndex)) {
    nextIndex += 1
  }

  return `${prefix}${nextIndex}`
}

function makeBlankProduct() {
  const timestamp = Date.now()
  return {
    id: `product-${timestamp}`,
    family: 'post_installed_expansion' as const,
    installationBehavior: 'torque_controlled' as const,
    brand: 'New',
    model: `Custom-${timestamp.toString().slice(-4)}`,
    description: '自訂產品資料',
    diameterMm: 16,
    effectiveAreaMm2: 157,
    embedmentMinMm: 60,
    embedmentMaxMm: 200,
    steelYieldStrengthMpa: 500,
    steelUltimateStrengthMpa: 650,
    evaluation: {},
    source: '使用者自建',
    notes: '',
  }
}

function sectionCitation(label: string, clause: string) {
  return `${clause} ${label}`
}

function makeUniqueLoadCaseName(baseName: string, loadCases: ProjectLoadCase[]) {
  const trimmed = baseName.trim() || 'LC'

  if (!loadCases.some((item) => item.name === trimmed)) {
    return trimmed
  }

  let index = 2
  while (loadCases.some((item) => item.name === `${trimmed}-${index}`)) {
    index += 1
  }

  return `${trimmed}-${index}`
}

function makeUniqueLayoutVariantName(
  baseName: string,
  variants: ProjectLayoutVariant[],
) {
  const trimmed = baseName.trim() || '候選配置'

  if (!variants.some((item) => item.name === trimmed)) {
    return trimmed
  }

  let index = 2
  while (variants.some((item) => item.name === `${trimmed}-${index}`)) {
    index += 1
  }

  return `${trimmed}-${index}`
}

function reportModeLabel(mode: ReportMode) {
  return mode === 'summary' ? '摘要版' : '完整明細版'
}

function seismicInputModeLabel(mode: ProjectCase['loads']['seismicInputMode']) {
  return mode === 'static_plus_earthquake'
    ? '靜載 / 非地震分量 + 地震分量'
    : '總設計值已含地震分量'
}

function formatDate(value?: string) {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(value?: string) {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatQuantity(
  value: number,
  quantity: QuantityKind,
  units: UnitPreferences,
) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return `${formatNumber(toDisplayValue(value, quantity, units))} ${getUnitSymbol(quantity, units)}`
}

function formatLayoutVariantSummary(
  layout: AnchorLayout,
  units: UnitPreferences,
) {
  const anchorCount = layout.anchorCountX * layout.anchorCountY
  const minimumEdge = Math.min(
    layout.edgeLeftMm,
    layout.edgeRightMm,
    layout.edgeBottomMm,
    layout.edgeTopMm,
  )

  return [
    `${layout.anchorCountX} × ${layout.anchorCountY}（${anchorCount} 支）`,
    `hef ${formatQuantity(layout.effectiveEmbedmentMm, 'length', units)}`,
    `sx ${formatQuantity(layout.spacingXmm, 'length', units)}`,
    `sy ${formatQuantity(layout.spacingYmm, 'length', units)}`,
    `cmin ${formatQuantity(minimumEdge, 'length', units)}`,
  ].join(' / ')
}

function formatResultValue(
  result: CheckResult,
  value: number,
  units: UnitPreferences,
) {
  if (result.presentation === 'ratio') {
    return formatNumber(value)
  }
  if (result.presentation === 'stress') {
    return formatQuantity(value, 'stress', units)
  }
  if (result.presentation === 'length') {
    return formatQuantity(value, 'length', units)
  }

  return formatQuantity(value, 'force', units)
}

function formatResultFactorList(result: CheckResult) {
  if (!result.factors || result.factors.length === 0) {
    return '—'
  }

  return result.factors
    .map((item) =>
      item.note
        ? `${item.symbol}=${item.value}（${item.label}；${item.note}）`
        : `${item.symbol}=${item.value}（${item.label}）`,
    )
    .join('；')
}

function dimensionSourceLabel(source: DimensionCheck['source']) {
  if (source === 'product') {
    return '產品值'
  }

  if (source === 'code_fallback') {
    return '規範退回值'
  }

  return '規範值'
}

function formatEvidenceValue(
  value: unknown,
  quantity: QuantityKind | undefined,
  units: UnitPreferences,
) {
  if (typeof value === 'number') {
    return quantity
      ? formatQuantity(value, quantity, units)
      : formatNumber(value)
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  if (typeof value === 'string' && value) {
    return value
  }

  return '未填'
}

function Badge({ status }: { status: ReviewStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
}

type BatchReviewResult = ReturnType<typeof evaluateProjectBatch>
type CandidateProductReview = ReturnType<typeof evaluateCandidateProducts>[number]
type LayoutVariantReview = ReturnType<typeof evaluateLayoutVariants>[number]

function getCandidateLoadCaseReview(
  candidateReview: CandidateProductReview,
  loadCaseId: string,
) {
  return candidateReview.batchReview.loadCaseReviews.find(
    (item) => item.loadCaseId === loadCaseId,
  )
}

function buildCandidateComparisonMatrix(
  batchReview: BatchReviewResult,
  candidateProductReviews: ReturnType<typeof evaluateCandidateProducts>,
) {
  return batchReview.loadCaseReviews.map((loadCaseReview) => ({
    loadCaseId: loadCaseReview.loadCaseId,
    loadCaseName: loadCaseReview.loadCaseName,
    isActive: loadCaseReview.loadCaseId === batchReview.activeLoadCaseId,
    isControlling: loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId,
    candidateCells: candidateProductReviews.map((candidateReview) => ({
      candidateReview,
      loadCaseReview: getCandidateLoadCaseReview(
        candidateReview,
        loadCaseReview.loadCaseId,
      ),
      isControllingForProduct:
        candidateReview.batchReview.controllingLoadCaseId ===
        loadCaseReview.loadCaseId,
    })),
  }))
}

function getLayoutVariantLoadCaseReview(
  layoutVariantReview: LayoutVariantReview,
  loadCaseId: string,
) {
  return layoutVariantReview.batchReview.loadCaseReviews.find(
    (item) => item.loadCaseId === loadCaseId,
  )
}

function buildLayoutComparisonMatrix(
  batchReview: BatchReviewResult,
  layoutVariantReviews: LayoutVariantReview[],
) {
  return batchReview.loadCaseReviews.map((loadCaseReview) => ({
    loadCaseId: loadCaseReview.loadCaseId,
    loadCaseName: loadCaseReview.loadCaseName,
    isActive: loadCaseReview.loadCaseId === batchReview.activeLoadCaseId,
    isControlling: loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId,
    variantCells: layoutVariantReviews.map((layoutVariantReview) => ({
      layoutVariantReview,
      loadCaseReview: getLayoutVariantLoadCaseReview(
        layoutVariantReview,
        loadCaseReview.loadCaseId,
      ),
      isControllingForVariant:
        layoutVariantReview.batchReview.controllingLoadCaseId ===
        loadCaseReview.loadCaseId,
    })),
  }))
}

function UnitNumberField(props: {
  label: string
  quantity: QuantityKind
  units: UnitPreferences
  value?: number
  onValueChange?: (value: number | undefined) => void
  optional?: boolean
  disabled?: boolean
  min?: number
  fallback?: number
  /** 可選的輸入警告；非 null 時以黃底小字顯示於輸入框下方，不攔截輸入。 */
  warning?: string | null
}) {
  const {
    label,
    quantity,
    units,
    value,
    onValueChange,
    optional = false,
    disabled = false,
    min,
    fallback = 0,
    warning = null,
  } = props

  const unitSymbol = getUnitSymbol(quantity, units)

  return (
    <label
      title={`${label}（單位：${unitSymbol}；可於頂部切換）`}
      className={warning ? 'field-has-warning' : undefined}
    >
      <span className="label-row">
        <span>{label}</span>
        <span className="unit-chip">{unitSymbol}</span>
      </span>
      <input
        type="number"
        step={getInputStep(quantity, units)}
        min={min}
        disabled={disabled}
        value={
          optional
            ? formatInputQuantity(value, quantity, units)
            : formatInputQuantity(value ?? fallback, quantity, units)
        }
        onChange={(event) => {
          if (!onValueChange) {
            return
          }

          if (optional && event.target.value.trim() === '') {
            onValueChange(undefined)
            return
          }

          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed)) {
            onValueChange(optional ? undefined : fallback)
            return
          }

          onValueChange(fromDisplayValue(parsed, quantity, units))
        }}
      />
      {warning ? (
        <span className="field-warning" role="status">
          {warning}
        </span>
      ) : null}
    </label>
  )
}

function DimensionRow({
  check,
  units,
}: {
  check: DimensionCheck
  units: UnitPreferences
}) {
  return (
    <tr>
      <td>{check.label}</td>
      <td>{formatQuantity(check.actualMm, 'length', units)}</td>
      <td>{formatQuantity(check.requiredMm, 'length', units)}</td>
      <td>{dimensionSourceLabel(check.source)}</td>
      <td>{sectionCitation(check.citation.title, check.citation.clause)}</td>
      <td>
        <Badge status={check.status} />
      </td>
    </tr>
  )
}

function GeometrySketch({
  review,
  units,
}: {
  review: ReviewResult
  units: UnitPreferences
}) {
  const { project, anchorPoints } = review
  const { layout } = project
  const viewBox = `0 0 ${layout.concreteWidthMm} ${layout.concreteHeightMm}`
  const anchorStateMap = new Map(
    review.visualization.anchors.map((item) => [item.anchorId, item]),
  )
  const edgeLabelMap = new Map<string, string[]>()

  review.visualization.edges.forEach((item) => {
    const labels = edgeLabelMap.get(item.edge) ?? []
    if (!labels.includes(item.label)) {
      labels.push(item.label)
    }
    edgeLabelMap.set(item.edge, labels)
  })
  const anchorReinforcementOverlay = getAnchorReinforcementOverlay(
    layout,
    anchorPoints,
  )
  const basePlateBearingOverlay = getBasePlateBearingOverlay(
    layout,
    review.analysisLoads,
  )

  return (
    <svg className="geometry-sketch" viewBox={viewBox} role="img" aria-label="錨栓幾何示意">
      <rect
        x="0"
        y="0"
        width={layout.concreteWidthMm}
        height={layout.concreteHeightMm}
        rx="8"
        className="concrete-body"
      />

      {basePlateBearingOverlay ? (
        <g>
          <rect
            x={basePlateBearingOverlay.loadedArea.x1}
            y={basePlateBearingOverlay.loadedArea.y1}
            width={
              basePlateBearingOverlay.loadedArea.x2 -
              basePlateBearingOverlay.loadedArea.x1
            }
            height={
              basePlateBearingOverlay.loadedArea.y2 -
              basePlateBearingOverlay.loadedArea.y1
            }
            className="bearing-zone"
          />
          {basePlateBearingOverlay.contactArea ? (
            <rect
              x={basePlateBearingOverlay.contactArea.x1}
              y={basePlateBearingOverlay.contactArea.y1}
              width={
                basePlateBearingOverlay.contactArea.x2 -
                basePlateBearingOverlay.contactArea.x1
              }
              height={
                basePlateBearingOverlay.contactArea.y2 -
                basePlateBearingOverlay.contactArea.y1
              }
              className={`bearing-contact-zone bearing-contact-zone-${basePlateBearingOverlay.mode}`}
            />
          ) : null}
          <text
            x={basePlateBearingOverlay.labelX}
            y={basePlateBearingOverlay.labelY}
            className="bearing-overlay-label"
          >
            {basePlateBearingOverlay.label}
          </text>
        </g>
      ) : null}

      {review.visualization.rectangles.map((rectangle) => (
        <rect
          key={rectangle.id}
          x={rectangle.x1}
          y={rectangle.y1}
          width={rectangle.x2 - rectangle.x1}
          height={rectangle.y2 - rectangle.y1}
          className={`breakout-zone breakout-zone-${rectangle.kind}`}
        />
      ))}

      {anchorReinforcementOverlay ? (
        <g>
          <rect
            x={anchorReinforcementOverlay.x1}
            y={anchorReinforcementOverlay.y1}
            width={anchorReinforcementOverlay.x2 - anchorReinforcementOverlay.x1}
            height={anchorReinforcementOverlay.y2 - anchorReinforcementOverlay.y1}
            className="reinforcement-zone"
          />
          <line
            x1={anchorReinforcementOverlay.x1}
            y1={anchorReinforcementOverlay.y1}
            x2={anchorReinforcementOverlay.x2}
            y2={anchorReinforcementOverlay.y2}
            className="reinforcement-line"
          />
          <line
            x1={anchorReinforcementOverlay.x2}
            y1={anchorReinforcementOverlay.y1}
            x2={anchorReinforcementOverlay.x1}
            y2={anchorReinforcementOverlay.y2}
            className="reinforcement-line"
          />
          <text
            x={anchorReinforcementOverlay.labelX}
            y={anchorReinforcementOverlay.labelY}
            className="reinforcement-label"
          >
            {anchorReinforcementOverlay.label}
          </text>
        </g>
      ) : null}

      {Array.from(edgeLabelMap.entries()).map(([edge, labels]) => {
        if (edge === 'left') {
          return (
            <g key={edge}>
              <line x1="4" y1="0" x2="4" y2={layout.concreteHeightMm} className="edge-highlight" />
              <text x="12" y="22" className="edge-label">
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        if (edge === 'right') {
          return (
            <g key={edge}>
              <line
                x1={layout.concreteWidthMm - 4}
                y1="0"
                x2={layout.concreteWidthMm - 4}
                y2={layout.concreteHeightMm}
                className="edge-highlight"
              />
              <text
                x={layout.concreteWidthMm - 12}
                y="22"
                textAnchor="end"
                className="edge-label"
              >
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        if (edge === 'bottom') {
          return (
            <g key={edge}>
              <line
                x1="0"
                y1={layout.concreteHeightMm - 4}
                x2={layout.concreteWidthMm}
                y2={layout.concreteHeightMm - 4}
                className="edge-highlight"
              />
              <text x="12" y={layout.concreteHeightMm - 12} className="edge-label">
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        return (
          <g key={edge}>
            <line x1="0" y1="4" x2={layout.concreteWidthMm} y2="4" className="edge-highlight" />
            <text x="12" y="22" className="edge-label">
              {labels.join(' / ')}
            </text>
          </g>
        )
      })}

      {anchorPoints.map((point) => {
        const anchorState = anchorStateMap.get(point.id)
        const anchorClass =
          anchorState?.state === 'tension'
            ? 'anchor-node anchor-node-tension'
            : anchorState?.state === 'compression'
              ? 'anchor-node anchor-node-compression'
              : 'anchor-node anchor-node-neutral'

        return (
        <g key={point.id}>
          <circle cx={point.x} cy={point.y} r={10} className={anchorClass} />
          <circle cx={point.x} cy={point.y} r={3} className="anchor-center" />
          <text x={point.x} y={point.y - 16} textAnchor="middle" className="anchor-label">
            {point.id}
          </text>
          <text x={point.x} y={point.y + 24} textAnchor="middle" className="anchor-demand">
            {anchorState
              ? `${anchorState.elasticTensionKn >= 0 ? '+' : ''}${formatNumber(anchorState.elasticTensionKn)}`
              : '0'}
          </text>
        </g>
      )})}

      <text x="16" y="24" className="sketch-title">
        混凝土平面 / 活躍組合
      </text>
      <text x="16" y="46" className="sketch-legend">
        紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區
      </text>
      <text x="16" y={layout.concreteHeightMm - 14} className="sketch-meta">
        {formatQuantity(layout.concreteWidthMm, 'length', units)} × {formatQuantity(layout.concreteHeightMm, 'length', units)}
      </text>
    </svg>
  )
}

function ReportDocument({
  batchReview,
  candidateProductReviews,
  layoutVariantReviews,
  review,
  selectedProduct,
  completeness,
  evaluationFieldStates,
  unitPreferences,
  reportSettings,
  saveMessage,
  latestAuditEntry,
}: {
  batchReview: ReturnType<typeof evaluateProjectBatch>
  candidateProductReviews: ReturnType<typeof evaluateCandidateProducts>
  layoutVariantReviews: ReturnType<typeof evaluateLayoutVariants>
  review: ReviewResult
  selectedProduct: AnchorProduct
  completeness: ReturnType<typeof assessProductCompleteness>
  evaluationFieldStates: EvaluationFieldState[]
  unitPreferences: UnitPreferences
  reportSettings: ReportSettings
  saveMessage: string
  latestAuditEntry: ProjectAuditEntry | null
}) {
  const evidenceRows = evaluationFieldStates.filter(
    (field) => field.hasValue || field.hasEvidence,
  )
  const summaryResults = [...review.results]
    .sort((left, right) => {
      const severityGap =
        resultStatusSeverity(right.status) - resultStatusSeverity(left.status)
      if (severityGap !== 0) {
        return severityGap
      }
      return right.dcr - left.dcr
    })
    .slice(0, 3)
  const factorResults = review.results.filter(
    (result) => result.factors && result.factors.length > 0,
  )
  const flaggedDimensions = review.dimensionChecks.filter(
    (check) => check.status !== 'pass',
  )
  const candidateComparisonMatrix = buildCandidateComparisonMatrix(
    batchReview,
    candidateProductReviews,
  )
  const layoutComparisonMatrix = buildLayoutComparisonMatrix(
    batchReview,
    layoutVariantReviews,
  )
  const bestLayoutVariantReview = layoutVariantReviews[0]
  const isSummaryReport = reportSettings.reportMode === 'summary'
  const combinedNotes = Array.from(
    new Set([...review.summary.notes, ...completeness.missing]),
  )
  const caseDocuments = review.project.documents ?? []
  const coverHighlights = [
    {
      label: '整體判定',
      value: statusLabel(batchReview.summary.overallStatus),
    },
    {
      label: '正式判定',
      value: statusLabel(batchReview.summary.formalStatus),
    },
    {
      label: '控制模式',
      value: batchReview.summary.governingMode,
    },
    {
      label: '控制組合',
      value: batchReview.controllingLoadCaseName,
    },
    {
      label: '控制 DCR',
      value: formatNumber(getGoverningDcr(batchReview.summary)),
    },
    {
      label: '批次最大 DCR',
      value: formatNumber(batchReview.summary.maxDcr),
    },
  ]

  return (
    <section className="print-report print-only">
      <section className="report-cover">
        <div className="report-cover-badge">
          {reportSettings.companyName || '工程報表草稿'}
        </div>
        <p className="report-kicker">Taiwan RC Anchor Review Report</p>
        <h1>{review.project.name}</h1>
        <p className="report-cover-subtitle">
          台灣《建築物混凝土結構設計規範》112年版第17章
          <br />
          混凝土結構用錨栓檢討{reportModeLabel(reportSettings.reportMode)}
        </p>

        <div className="report-cover-grid">
          <article className="report-cover-card">
            <span>案號 / 專案</span>
            <strong>{reportSettings.projectCode || '未填'}</strong>
          </article>
          <article className="report-cover-card">
            <span>發行日期</span>
            <strong>{formatDate(reportSettings.issueDate)}</strong>
          </article>
          <article className="report-cover-card">
            <span>規範版本</span>
            <strong>{review.ruleProfile.versionLabel}</strong>
          </article>
          <article className="report-cover-card">
            <span>輸出模式</span>
            <strong>{reportModeLabel(reportSettings.reportMode)}</strong>
          </article>
        </div>

        <div className="report-cover-highlights">
          {coverHighlights.map((item) => (
            <article key={item.label} className="report-highlight-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        <div className="report-cover-footer">
          <div>
            <span>設計</span>
            <strong>{reportSettings.designer || '—'}</strong>
          </div>
          <div>
            <span>校核</span>
            <strong>{reportSettings.checker || '—'}</strong>
          </div>
          <div>
            <span>產品</span>
            <strong>{selectedProduct.brand} {selectedProduct.model}</strong>
          </div>
        </div>
      </section>

      <div className="report-running-head">
        <span>{review.project.name}</span>
        <span>{reportSettings.projectCode || '未填案號'}</span>
        <span>{review.ruleProfile.chapter17Title}</span>
      </div>

      <div className="report-running-foot">
        <span>{reportSettings.companyName || '工程報表草稿'}</span>
        <span>{saveMessage}</span>
        <span className="report-page-number" />
      </div>

      <div className="report-body">
        <header className="report-header">
          <div>
            <p className="report-org">
              {reportSettings.companyName || '工程報表草稿'}
            </p>
            <p className="report-kicker">Taiwan RC Anchor Review Report</p>
            <h1>{review.project.name}</h1>
            <p className="report-subtitle">
              台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討
              {reportModeLabel(reportSettings.reportMode)}
            </p>
            <div className="report-meta-inline">
              <span>案號：{reportSettings.projectCode || '—'}</span>
              <span>設計：{reportSettings.designer || '—'}</span>
              <span>校核：{reportSettings.checker || '—'}</span>
            </div>
          </div>
          <div className="report-meta">
            <div>
              <span>發行日期</span>
              <strong>{formatDate(reportSettings.issueDate)}</strong>
            </div>
            <div>
              <span>{REPORT_TIMESTAMP_LABELS.editedAt}</span>
              <strong>{formatDateTime(review.project.updatedAt)}</strong>
            </div>
            <div>
              <span>{REPORT_TIMESTAMP_LABELS.generatedAt}</span>
              <strong>{formatDateTime(new Date().toISOString())}</strong>
            </div>
            <div>
              <span>{REPORT_TIMESTAMP_LABELS.auditedAt}</span>
              <strong>{latestAuditEntry ? formatDateTime(latestAuditEntry.createdAt) : '尚未留存'}</strong>
            </div>
            <div>
              <span>{REPORT_TIMESTAMP_LABELS.auditSource}</span>
              <strong>{latestAuditEntry ? auditSourceLabel(latestAuditEntry.source) : '—'}</strong>
            </div>
            <div>
              <span>規範版本</span>
              <strong>{review.ruleProfile.versionLabel}</strong>
            </div>
          </div>
        </header>

        <section className="report-grid">
          <article className="report-card">
            <h2>案例資訊</h2>
            <dl className="report-list">
              <div>
                <dt>案例名稱</dt>
                <dd>{review.project.name}</dd>
              </div>
              <div>
                <dt>規範</dt>
                <dd>{review.ruleProfile.chapter17Title}</dd>
              </div>
              <div>
                <dt>案號 / 專案</dt>
                <dd>{reportSettings.projectCode || '未填'}</dd>
              </div>
              <div>
                <dt>目前單位</dt>
                <dd>
                  {getUnitSymbol('length', unitPreferences)} / {getUnitSymbol('area', unitPreferences)} / {getUnitSymbol('force', unitPreferences)} / {getUnitSymbol('stress', unitPreferences)}
                </dd>
              </div>
              <div>
                <dt>產品族群</dt>
                <dd>{familyLabel(selectedProduct.family)}</dd>
              </div>
            </dl>
          </article>

          <article className="report-card">
            <h2>簽核資訊</h2>
            <dl className="report-list">
              <div>
                <dt>公司 / 單位</dt>
                <dd>{reportSettings.companyName || '未填'}</dd>
              </div>
              <div>
                <dt>設計者</dt>
                <dd>{reportSettings.designer || '未填'}</dd>
              </div>
              <div>
                <dt>校核者</dt>
                <dd>{reportSettings.checker || '未填'}</dd>
              </div>
              <div>
                <dt>輸出模式</dt>
                <dd>{reportModeLabel(reportSettings.reportMode)}</dd>
              </div>
            </dl>
          </article>

          <article className="report-card">
            <h2>產品資訊</h2>
            <dl className="report-list">
              <div>
                <dt>品牌 / 型號</dt>
                <dd>{selectedProduct.brand} {selectedProduct.model}</dd>
              </div>
              <div>
                <dt>直徑 da</dt>
                <dd>{formatQuantity(selectedProduct.diameterMm, 'length', unitPreferences)}</dd>
              </div>
              <div>
                <dt>Ase</dt>
                <dd>{formatQuantity(selectedProduct.effectiveAreaMm2, 'area', unitPreferences)}</dd>
              </div>
              <div>
                <dt>評估標準</dt>
                <dd>{selectedProduct.evaluation.qualificationStandard ?? '未填'}</dd>
              </div>
            </dl>
          </article>

          <article className="report-card">
            <h2>總結</h2>
            <dl className="report-list">
              <div>
                <dt>整體判定</dt>
                <dd>{statusLabel(batchReview.summary.overallStatus)}</dd>
              </div>
              <div>
                <dt>正式判定</dt>
                <dd>{statusLabel(batchReview.summary.formalStatus)}</dd>
              </div>
              <div>
                <dt>控制模式</dt>
                <dd>{batchReview.summary.governingMode}</dd>
              </div>
              <div>
                <dt>控制組合</dt>
                <dd>{batchReview.controllingLoadCaseName}</dd>
              </div>
              <div>
                <dt>控制 DCR</dt>
                <dd>{formatNumber(getGoverningDcr(batchReview.summary))}</dd>
              </div>
              <div>
                <dt>批次最大 DCR</dt>
                <dd>{formatNumber(batchReview.summary.maxDcr)}</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="report-section">
          <h2>載重組合批次檢核</h2>
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>組合</th>
                <th>拉力 N</th>
                <th>合成剪力 V</th>
                <th>控制模式</th>
                <th>控制 DCR</th>
                <th>整體狀態</th>
              </tr>
            </thead>
            <tbody>
              {batchReview.loadCaseReviews.map((item) => (
                <tr key={item.loadCaseId}>
                  <td>{item.loadCaseName}</td>
                  <td>{formatQuantity(item.review.analysisLoads.tensionKn, 'force', unitPreferences)}</td>
                  <td>{formatQuantity(Math.hypot(item.review.analysisLoads.shearXKn, item.review.analysisLoads.shearYKn), 'force', unitPreferences)}</td>
                  <td>{item.review.summary.governingMode}</td>
                  <td>{formatNumber(getGoverningDcr(item.review.summary))}</td>
                  <td>{statusLabel(item.review.summary.overallStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {candidateProductReviews.length > 1 ? (
          <section className="report-section">
            <h2>候選產品比選</h2>
            {candidateProductReviews[0] ? (
              <p className="helper-text">
                建議候選方案：{candidateProductReviews[0].product.brand} {candidateProductReviews[0].product.model}，
                控制組合為 {candidateProductReviews[0].batchReview.controllingLoadCaseName}，
                控制 DCR = {formatNumber(getGoverningDcr(candidateProductReviews[0].batchReview.summary))}。
              </p>
            ) : null}
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>產品</th>
                  <th>族群</th>
                  <th>控制組合</th>
                  <th>控制模式</th>
                  <th>控制 DCR</th>
                  <th>整體狀態</th>
                  <th>正式性</th>
                </tr>
              </thead>
              <tbody>
                {candidateProductReviews.map((item) => (
                  <tr key={`candidate-report-${item.product.id}`}>
                    <td>{item.product.brand} {item.product.model}{item.product.id === selectedProduct.id ? '（目前選定）' : ''}</td>
                    <td>{familyLabel(item.product.family)}</td>
                    <td>{item.batchReview.controllingLoadCaseName}</td>
                    <td>{item.batchReview.summary.governingMode}</td>
                    <td>{formatNumber(getGoverningDcr(item.batchReview.summary))}</td>
                    <td>{statusLabel(item.batchReview.summary.overallStatus)}</td>
                    <td>{statusLabel(item.batchReview.summary.formalStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>產品 × 載重組合矩陣</h3>
            <table className="data-table report-table comparison-matrix-table">
              <thead>
                <tr>
                  <th>載重組合</th>
                  {candidateProductReviews.map((item) => (
                    <th key={`candidate-report-matrix-head-${item.product.id}`}>
                      {item.product.brand} {item.product.model}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidateComparisonMatrix.map((row) => (
                  <tr key={`candidate-report-matrix-row-${row.loadCaseId}`}>
                    <td>
                      {row.loadCaseName}
                      {row.isActive && row.isControlling
                        ? '（目前編輯 / 控制組合）'
                        : row.isActive
                          ? '（目前編輯）'
                          : row.isControlling
                            ? '（控制組合）'
                            : ''}
                    </td>
                    {row.candidateCells.map((cell) => (
                      <td
                        key={`candidate-report-matrix-cell-${row.loadCaseId}-${cell.candidateReview.product.id}`}
                      >
                        {cell.loadCaseReview ? (
                          <div className="candidate-matrix-cell">
                            <strong className="candidate-matrix-dcr">
                              DCR {formatNumber(getGoverningDcr(cell.loadCaseReview.review.summary))}
                            </strong>
                            <span>
                              {statusLabel(
                                cell.loadCaseReview.review.summary.overallStatus,
                              )}
                            </span>
                            <small>
                              {cell.loadCaseReview.review.summary.governingMode}
                              {cell.isControllingForProduct
                                ? ' / 該產品控制'
                                : ''}
                            </small>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {layoutVariantReviews.length > 1 ? (
          <section className="report-section">
            <h2>候選配置比選</h2>
            {bestLayoutVariantReview ? (
              <p className="helper-text">
                建議配置方案：{bestLayoutVariantReview.variant.name}，
                幾何摘要為 {formatLayoutVariantSummary(bestLayoutVariantReview.variant.layout, unitPreferences)}，
                控制組合為 {bestLayoutVariantReview.batchReview.controllingLoadCaseName}，
                控制 DCR = {formatNumber(getGoverningDcr(bestLayoutVariantReview.batchReview.summary))}。
              </p>
            ) : null}
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>配置</th>
                  <th>幾何摘要</th>
                  <th>控制組合</th>
                  <th>控制模式</th>
                  <th>控制 DCR</th>
                  <th>整體狀態</th>
                  <th>正式性</th>
                </tr>
              </thead>
              <tbody>
                {layoutVariantReviews.map((item) => (
                  <tr key={`layout-report-${item.variant.id}`}>
                    <td>{item.variant.name}{item.isCurrent ? '（目前配置）' : ''}</td>
                    <td>{formatLayoutVariantSummary(item.variant.layout, unitPreferences)}</td>
                    <td>{item.batchReview.controllingLoadCaseName}</td>
                    <td>{item.batchReview.summary.governingMode}</td>
                    <td>{formatNumber(getGoverningDcr(item.batchReview.summary))}</td>
                    <td>{statusLabel(item.batchReview.summary.overallStatus)}</td>
                    <td>{statusLabel(item.batchReview.summary.formalStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>配置 × 載重組合矩陣</h3>
            <table className="data-table report-table comparison-matrix-table">
              <thead>
                <tr>
                  <th>載重組合</th>
                  {layoutVariantReviews.map((item) => (
                    <th key={`layout-report-matrix-head-${item.variant.id}`}>
                      {item.variant.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {layoutComparisonMatrix.map((row) => (
                  <tr key={`layout-report-matrix-row-${row.loadCaseId}`}>
                    <td>
                      {row.loadCaseName}
                      {row.isActive && row.isControlling
                        ? '（目前編輯 / 控制組合）'
                        : row.isActive
                          ? '（目前編輯）'
                          : row.isControlling
                            ? '（控制組合）'
                            : ''}
                    </td>
                    {row.variantCells.map((cell) => (
                      <td
                        key={`layout-report-matrix-cell-${row.loadCaseId}-${cell.layoutVariantReview.variant.id}`}
                      >
                        {cell.loadCaseReview ? (
                          <div className="candidate-matrix-cell">
                            <strong className="candidate-matrix-dcr">
                              DCR {formatNumber(getGoverningDcr(cell.loadCaseReview.review.summary))}
                            </strong>
                            <span>
                              {statusLabel(
                                cell.loadCaseReview.review.summary.overallStatus,
                              )}
                            </span>
                            <small>
                              {cell.loadCaseReview.review.summary.governingMode}
                              {cell.isControllingForVariant
                                ? ' / 該配置控制'
                                : ''}
                            </small>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="report-section">
          <h2>幾何與載重</h2>
          <div className="report-grid">
            <article className="report-card">
              <h3>幾何</h3>
              <dl className="report-list">
                <div>
                  <dt>混凝土平面</dt>
                  <dd>{formatQuantity(review.project.layout.concreteWidthMm, 'length', unitPreferences)} × {formatQuantity(review.project.layout.concreteHeightMm, 'length', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>構材厚度</dt>
                  <dd>{formatQuantity(review.project.layout.thicknessMm, 'length', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>有效埋深 hef</dt>
                  <dd>{formatQuantity(review.project.layout.effectiveEmbedmentMm, 'length', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>錨栓數量</dt>
                  <dd>{review.anchorPoints.length}</dd>
                </div>
                <div>
                  <dt>錨栓補強鋼筋</dt>
                  <dd>
                    {review.project.layout.anchorReinforcementEnabled
                      ? `${formatQuantity(review.project.layout.anchorReinforcementAreaMm2, 'area', unitPreferences)} / fy ${formatQuantity(review.project.layout.anchorReinforcementYieldMpa, 'stress', unitPreferences)}`
                      : '未啟用'}
                  </dd>
                </div>
                <div>
                  <dt>基板承壓</dt>
                  <dd>
                    {review.project.layout.basePlateBearingEnabled
                      ? `A1 ${formatQuantity(getEffectiveBasePlateLoadedArea(review.project.layout), 'area', unitPreferences)} / A2 ${formatQuantity(review.project.layout.basePlateSupportAreaMm2, 'area', unitPreferences)}${(review.project.layout.basePlateLoadedWidthMm ?? 0) > 0 && (review.project.layout.basePlateLoadedHeightMm ?? 0) > 0 ? ` / b1 × h1 ${formatQuantity(review.project.layout.basePlateLoadedWidthMm ?? 0, 'length', unitPreferences)} × ${formatQuantity(review.project.layout.basePlateLoadedHeightMm ?? 0, 'length', unitPreferences)}` : ''}${(review.project.layout.basePlatePlanWidthMm ?? 0) > 0 && (review.project.layout.basePlatePlanHeightMm ?? 0) > 0 ? ` / B × N ${formatQuantity(review.project.layout.basePlatePlanWidthMm ?? 0, 'length', unitPreferences)} × ${formatQuantity(review.project.layout.basePlatePlanHeightMm ?? 0, 'length', unitPreferences)}` : ''}${((review.project.layout.columnCentroidOffsetXmm ?? 0) !== 0 || (review.project.layout.columnCentroidOffsetYmm ?? 0) !== 0) ? ` / 柱偏移 ${formatQuantity(review.project.layout.columnCentroidOffsetXmm ?? 0, 'length', unitPreferences)} × ${formatQuantity(review.project.layout.columnCentroidOffsetYmm ?? 0, 'length', unitPreferences)}` : ''} / ${basePlateSectionTypeLabel(getBasePlateSectionType(review.project.layout))}${review.project.layout.basePlateBendingEnabled ? ` / tp ${formatQuantity(review.project.layout.basePlateThicknessMm, 'length', unitPreferences)} / Fy ${formatQuantity(review.project.layout.basePlateSteelYieldMpa, 'stress', unitPreferences)}` : ''}`
                      : '未啟用'}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="report-card">
              <h3>載重</h3>
              <dl className="report-list">
                <div>
                  <dt>明細組合</dt>
                  <dd>{batchReview.activeLoadCaseName}</dd>
                </div>
                <div>
                  <dt>拉力 N</dt>
                  <dd>{formatQuantity(review.analysisLoads.tensionKn, 'force', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>剪力 Vx</dt>
                  <dd>{formatQuantity(review.analysisLoads.shearXKn, 'force', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>剪力 Vy</dt>
                  <dd>{formatQuantity(review.analysisLoads.shearYKn, 'force', unitPreferences)}</dd>
                </div>
                <div>
                  <dt>地震輸入模式</dt>
                  <dd>{seismicInputModeLabel(review.project.loads.seismicInputMode)}</dd>
                </div>
                <div>
                  <dt>耐震入口</dt>
                  <dd>{review.project.loads.considerSeismic ? '納入' : '未納入'}</dd>
                </div>
              </dl>
              {review.analysisNote ? <p className="helper-text">{review.analysisNote}</p> : null}
            </article>
          </div>
        </section>

        {isSummaryReport ? (
          <>
            <section className="report-section">
              <h2>控制檢核摘要</h2>
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>模式</th>
                    <th>條文</th>
                      <th>需求值</th>
                      <th>設計值</th>
                    <th>DCR</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryResults.map((result) => (
                    <tr key={result.id}>
                        <td>
                          <div className="result-mode-cell">
                            <strong>{result.mode}</strong>
                            <small>
                              {getResultPresentationSummary(result, unitPreferences)}
                            </small>
                          </div>
                        </td>
                        <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                      <td>{formatResultValue(result, result.demandKn, unitPreferences)}</td>
                      <td>{formatResultValue(result, result.designStrengthKn, unitPreferences)}</td>
                      <td>{formatNumber(result.dcr)}</td>
                      <td>{result.formal ? `${statusLabel(result.status)} / 正式` : `${statusLabel(result.status)} / 初篩`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="report-section">
              <h2>φ / ψ 採用總表</h2>
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>模式</th>
                    <th>條文</th>
                    <th>採用因子</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {factorResults.map((result) => (
                    <tr key={`factor-summary-${result.id}`}>
                      <td>{result.mode}</td>
                      <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                      <td>{formatResultFactorList(result)}</td>
                      <td>{result.formal ? `${statusLabel(result.status)} / 正式` : `${statusLabel(result.status)} / 初篩`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="report-section">
              <h2>尺寸重點</h2>
              {flaggedDimensions.length > 0 ? (
                <table className="data-table report-table">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>實際</th>
                      <th>需求</th>
                      <th>來源</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedDimensions.map((check) => (
                      <tr key={check.id}>
                        <td>{check.label}</td>
                        <td>{formatQuantity(check.actualMm, 'length', unitPreferences)}</td>
                        <td>{formatQuantity(check.requiredMm, 'length', unitPreferences)}</td>
                        <td>{dimensionSourceLabel(check.source)}</td>
                        <td>{statusLabel(check.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="report-summary-note">
                  摘要版僅保留控制項目與例外尺寸。若要完整條文明細與產品證據，請切換成完整明細版後列印。
                </p>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="report-section">
              <h2>最小尺寸檢核</h2>
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>實際</th>
                    <th>需求</th>
                    <th>來源</th>
                    <th>條文</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {review.dimensionChecks.map((check) => (
                    <tr key={check.id}>
                      <td>{check.label}</td>
                      <td>{formatQuantity(check.actualMm, 'length', unitPreferences)}</td>
                      <td>{formatQuantity(check.requiredMm, 'length', unitPreferences)}</td>
                      <td>{dimensionSourceLabel(check.source)}</td>
                      <td>{sectionCitation(check.citation.title, check.citation.clause)}</td>
                      <td>{statusLabel(check.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="report-section">
              <h2>破壞模式檢核</h2>
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>模式</th>
                    <th>條文</th>
                      <th>需求值</th>
                      <th>設計值</th>
                    <th>DCR</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {review.results.map((result) => (
                    <tr key={result.id}>
                        <td>
                          <div className="result-mode-cell">
                            <strong>{result.mode}</strong>
                            <small>
                              {getResultPresentationSummary(result, unitPreferences)}
                            </small>
                          </div>
                        </td>
                        <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                      <td>{formatResultValue(result, result.demandKn, unitPreferences)}</td>
                      <td>{formatResultValue(result, result.designStrengthKn, unitPreferences)}</td>
                      <td>{formatNumber(result.dcr)}</td>
                      <td>{result.formal ? `${statusLabel(result.status)} / 正式` : `${statusLabel(result.status)} / 初篩`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="report-section">
              <h2>φ / ψ 採用總表</h2>
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>模式</th>
                    <th>條文</th>
                    <th>採用因子</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {factorResults.map((result) => (
                    <tr key={`factor-full-${result.id}`}>
                      <td>{result.mode}</td>
                      <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                      <td>{formatResultFactorList(result)}</td>
                      <td>{result.formal ? `${statusLabel(result.status)} / 正式` : `${statusLabel(result.status)} / 初篩`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="report-section">
              <h2>產品證據對照</h2>
              {evidenceRows.length > 0 ? (
                <table className="data-table report-table">
                  <thead>
                    <tr>
                      <th>欄位</th>
                      <th>目前值</th>
                      <th>文件 / 報告</th>
                      <th>頁碼 / 表號</th>
                      <th>已核對</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidenceRows.map((field) => (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        <td>{formatEvidenceValue(field.rawValue, field.quantity, unitPreferences)}</td>
                        <td>{field.evidence?.documentName ?? '—'}</td>
                        <td>{field.evidence?.page ?? '—'}</td>
                        <td>{field.evidence?.verified ? '是' : '否'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="report-note">目前尚未建立產品證據對照。</p>
              )}
            </section>
          </>
        )}

        <section className="report-section">
          <h2>附件與文件清單</h2>
          {caseDocuments.length > 0 ? (
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>類型</th>
                  <th>檔名</th>
                  <th>大小</th>
                  <th>已核對</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {caseDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.name}</td>
                    <td>{documentKindLabel(document.kind)}</td>
                    <td>{document.fileName}</td>
                    <td>{formatFileSize(document.sizeBytes)}</td>
                    <td>{document.verified ? '是' : '否'}</td>
                    <td>{document.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="report-note">目前尚未掛入案例附件。</p>
          )}
        </section>

        <section className="report-section">
          <h2>工程提醒</h2>
          <ul className="report-bullets">
            {Array.from(new Set([...combinedNotes, ...batchReview.summary.notes])).map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>拉力分配已納入 N + Mx + My 的受拉側錨栓近似分配。</li>
          </ul>
        </section>

        <section className="report-signoff">
          <article className="report-signoff-card">
            <span>設計者簽核</span>
            <strong>{reportSettings.designer || '待填'}</strong>
            <div className="report-signature-line" />
          </article>
          <article className="report-signoff-card">
            <span>校核者簽核</span>
            <strong>{reportSettings.checker || '待填'}</strong>
            <div className="report-signature-line" />
          </article>
          <article className="report-signoff-card">
            <span>發行日期</span>
            <strong>{formatDate(reportSettings.issueDate)}</strong>
            <div className="report-signature-line" />
          </article>
        </section>
      </div>
    </section>
  )
}

type WorkspaceTabId =
  | 'member'
  | 'product'
  | 'loads'
  | 'seismic'
  | 'baseplate'
  | 'result'
  | 'report'

interface WorkspaceTabDefinition {
  id: WorkspaceTabId
  label: string
  hint: string
}

const WORKSPACE_TABS: WorkspaceTabDefinition[] = [
  { id: 'member', label: '構件／配置', hint: '混凝土基材 fc′ / 裂縫 / hef / 陣列 / 間距 / 邊距' },
  { id: 'product', label: '產品', hint: '產品選擇 / 候選比選 / 評估值 / 證據' },
  { id: 'loads', label: '載重', hint: 'N / V / M / 載重組合批次 / CSV 匯入' },
  { id: 'seismic', label: '耐震', hint: '耐震路徑 / Ωo / 韌性 / 附掛物降伏' },
  { id: 'baseplate', label: '柱腳', hint: '基板承壓 / 抗彎厚度 / 錨栓補強鋼筋' },
  { id: 'result', label: '結果', hint: 'DCR / φψ 採用 / 候選比選 / 逐項明細 / 匯出' },
]

interface CommandItem {
  id: string
  label: string
  group: string
  hint?: string
  run: () => void
}

function CommandPalette(props: {
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  commands: CommandItem[]
}) {
  const { query, onQueryChange, onClose, commands } = props
  const normalized = query.trim().toLowerCase()
  const filtered = commands.filter((cmd) => {
    if (!normalized) {
      return true
    }
    const haystack = `${cmd.label} ${cmd.group} ${cmd.hint ?? ''}`.toLowerCase()
    return normalized
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token))
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 當 query 變動時重置 active index：derive during render + 只有 index 超過 filtered 時修正
  // 避免 setState-in-effect 警告；filtered 本身是 render 時推導
  const effectiveActiveIndex =
    filtered.length === 0
      ? 0
      : Math.min(activeIndex, filtered.length - 1)

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-palette-index="${effectiveActiveIndex}"]`,
    )
    active?.scrollIntoView({ block: 'nearest' })
  }, [effectiveActiveIndex])

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onClick={onClose}
    >
      <div
        className="command-palette-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          className="command-palette-input"
          value={query}
          placeholder="輸入關鍵字：tab 名稱 / 案例 / 產品 / 動作…"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const target = filtered[effectiveActiveIndex]
              if (target) {
                target.run()
                onClose()
              }
            }
          }}
          aria-label="命令搜尋"
        />
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-palette-empty">
              沒有符合的指令；試試「切換」「匯出」「案例」等關鍵字
            </div>
          ) : null}
          {filtered.map((cmd, index) => (
            <button
              key={cmd.id}
              type="button"
              data-palette-index={index}
              className={`command-palette-item${
                index === effectiveActiveIndex ? ' active' : ''
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                cmd.run()
                onClose()
              }}
            >
              <span className="command-palette-item-label">{cmd.label}</span>
              <span className="command-palette-item-group">{cmd.group}</span>
              {cmd.hint ? (
                <span className="command-palette-item-hint">{cmd.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="command-palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 切換 · <kbd>Enter</kbd> 執行 ·
            <kbd>Esc</kbd> 關閉
          </span>
          <span>共 {filtered.length} / {commands.length} 項</span>
        </div>
      </div>
    </div>
  )
}

function App() {
  // 預設落地頁為資源庫（首頁 hub）：讓使用者先選樣板 / 載入案例，再進檢核工作台
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('report')
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false)
  const [products, setProducts] = useState<AnchorProduct[]>(defaultProducts)
  const [projects, setProjects] = useState<ProjectCase[]>(() => [
    cloneProject(defaultProject),
  ])
  const [activeProjectId, setActiveProjectId] = useState(defaultProject.id)
  const [project, setProject] = useState<ProjectCase>(() =>
    cloneProject(defaultProject),
  )
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hydrationError, setHydrationError] = useState<string | null>(null)
  const [hydrationRetryCount, setHydrationRetryCount] = useState(0)
  const [isResetting, setIsResetting] = useState(false)
  const [saveMessage, setSaveMessage] = useState('尚未同步到本機資料庫')
  // 短暫 toast：每次 saveMessage 變更且已 hydrated 時浮現 3.5 秒後自動消失
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  )
  const [projectTemplateFilter, setProjectTemplateFilter] = useState<
    'all' | ProjectTemplateCategory
  >('all')
  const [projectTemplateSearch, setProjectTemplateSearch] = useState('')
  const [resourceLibraryTab, setResourceLibraryTab] =
    useState<ResourceLibraryTabId>('project_templates')
  const [templateFilter, setTemplateFilter] = useState<'all' | AnchorFamily>('all')
  const [templateSearch, setTemplateSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [templateCatalog, setTemplateCatalog] = useState<ProductTemplate[] | null>(
    null,
  )
  const [pendingDocumentKind, setPendingDocumentKind] =
    useState<ProjectDocumentKind>('catalog')
  const [evidenceDocumentKindFilter, setEvidenceDocumentKindFilter] =
    useState<'all' | ProjectDocumentKind>('all')
  const [evidenceLinkStatusFilter, setEvidenceLinkStatusFilter] =
    useState<EvidenceLinkStatusFilter>('all')
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null)
  const [previewDocumentFile, setPreviewDocumentFile] =
    useState<StoredDocumentFile | null>(null)
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null)
  const [previewDocumentError, setPreviewDocumentError] = useState('')
  const [pendingLoadCaseImportMode, setPendingLoadCaseImportMode] =
    useState<'append' | 'replace'>('append')
  const [loadCasePasteText, setLoadCasePasteText] = useState('')
  const [seismicRouteGuidance, setSeismicRouteGuidance] =
    useState<SeismicRouteGuidance | null>(null)
  const [evaluationFieldStates, setEvaluationFieldStates] = useState<
    EvaluationFieldState[]
  >([])
  const [evidenceCoverage, setEvidenceCoverage] = useState({
    total: 0,
    withValue: 0,
    withEvidence: 0,
    verified: 0,
  })
  const [filteredEvidenceFieldViews, setFilteredEvidenceFieldViews] = useState<
    EvidenceFieldView[]
  >([])
  const [evidenceLinkSummaries, setEvidenceLinkSummaries] = useState<
    EvidenceLinkSummary[]
  >([])
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const loadCaseCsvInputRef = useRef<HTMLInputElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadAppState() {
      setLoading(true)
      setHydrationError(null)
      try {
        await ensureSeedData()
        const storedProducts = await db.products.toArray()
        const storedProjects = await db.projects.toArray()
        const nextProducts =
          storedProducts.length > 0 ? storedProducts : defaultProducts
        const nextProjects = (
          storedProjects.length > 0 ? storedProjects : [defaultProject]
        ).map((item) => normalizeProjectSelection(item, nextProducts))
        const initialProject =
          [...nextProjects].sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          )[0] ?? cloneProject(defaultProject)

        if (!mounted) {
          return
        }

        setProducts(nextProducts)
        setProjects(nextProjects)
        setActiveProjectId(initialProject.id)
        setProject(initialProject)
        setHydrated(true)
      } catch (error) {
        if (!mounted) {
          return
        }
        console.error('[bolt-review] 啟動載入失敗', error)
        const message =
          error instanceof Error ? error.message : String(error ?? '未知錯誤')
        setHydrationError(message)
        // fallback：以 defaults 讓使用者至少能操作，但不 setHydrated 以避免覆寫 DB
        setProducts(defaultProducts)
        setProjects([cloneProject(defaultProject)])
        setActiveProjectId(defaultProject.id)
        setProject(cloneProject(defaultProject))
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadAppState()

    return () => {
      mounted = false
    }
  }, [hydrationRetryCount])

  const retryHydration = useCallback(() => {
    setHydrationRetryCount((count) => count + 1)
  }, [])

  const resetLocalDatabaseAndReload = useCallback(async () => {
    if (isResetting) {
      return
    }
    const confirmed = window.confirm(
      '將清除本機所有案例、產品與文件附件並重建預設資料。此操作不可復原，是否繼續？',
    )
    if (!confirmed) {
      return
    }
    setIsResetting(true)
    try {
      await resetLocalDatabase()
      setHydrationRetryCount((count) => count + 1)
    } catch (error) {
      console.error('[bolt-review] 清空本機資料失敗', error)
      const message =
        error instanceof Error ? error.message : String(error ?? '未知錯誤')
      setHydrationError(`清空本機資料失敗：${message}`)
    } finally {
      setIsResetting(false)
    }
  }, [isResetting])

  const selectedProduct =
    products.find((item) => item.id === project.selectedProductId) ?? products[0]
  const candidateProducts = products.filter((item) =>
    (project.candidateProductIds ?? [project.selectedProductId]).includes(item.id),
  )
  const candidateLayoutVariants = project.candidateLayoutVariants ?? []
  const deferredProject = useDeferredValue(project)
  const deferredProduct = useDeferredValue(selectedProduct)
  const deferredCandidateProducts = useDeferredValue(candidateProducts)
  const deferredCandidateLayoutVariants = useDeferredValue(candidateLayoutVariants)
  const unitPreferences = normalizeUnitPreferences(project.ui)
  const reportSettings = normalizeReportSettings(project.report)
  const simpleMode = unitPreferences.simpleMode
  const activeRuleProfile = getRuleProfileById(project.ruleProfileId)
  const ruleProfileOptions = getRuleProfileOptions()
  // 重量級計算以 useMemo 快取；deferred 值變動才重算，避免使用者打字每 keystroke 都跑完整評估
  const batchReview = useMemo(
    () => evaluateProjectBatch(deferredProject, deferredProduct, activeRuleProfile),
    [deferredProject, deferredProduct, activeRuleProfile],
  )
  const candidateProductReviews = useMemo(
    () =>
      evaluateCandidateProducts(
        deferredProject,
        deferredCandidateProducts,
        activeRuleProfile,
      ),
    [deferredProject, deferredCandidateProducts, activeRuleProfile],
  )
  const layoutVariantReviews = useMemo(
    () =>
      evaluateLayoutVariants(
        deferredProject,
        deferredProduct,
        deferredCandidateLayoutVariants,
        activeRuleProfile,
      ),
    [
      deferredProject,
      deferredProduct,
      deferredCandidateLayoutVariants,
      activeRuleProfile,
    ],
  )
  const candidateComparisonMatrix = useMemo(
    () => buildCandidateComparisonMatrix(batchReview, candidateProductReviews),
    [batchReview, candidateProductReviews],
  )
  const layoutComparisonMatrix = useMemo(
    () => buildLayoutComparisonMatrix(batchReview, layoutVariantReviews),
    [batchReview, layoutVariantReviews],
  )
  const bestCandidateReview = candidateProductReviews[0]
  const bestLayoutVariantReview = layoutVariantReviews[0]
  const review = batchReview.activeReview
  const factorResults = review.results.filter(
    (result) => result.factors && result.factors.length > 0,
  )
  const activeLoadCaseId = project.activeLoadCaseId ?? project.loadCases?.[0]?.id
  const activeLoadCase =
    project.loadCases?.find((item) => item.id === activeLoadCaseId) ??
    project.loadCases?.[0] ??
    {
      id: activeLoadCaseId ?? 'load-case-1',
      name: 'LC1',
      loads: project.loads,
    }
  const usingSeparatedSeismicInput =
    project.loads.considerSeismic &&
    (project.loads.seismicInputMode ?? 'total_design') ===
      'static_plus_earthquake'
  const loadCaseLibrary = project.loadCases ?? [activeLoadCase]
  const loadPresetInput = normalizeLoadCasePresetInput(project.loadPresetInput)
  const basePlatePlan = getBasePlatePlanDimensions(project.layout)
  const derivedBasePlateCantilevers = getDerivedBasePlateCantilevers(
    project.layout,
  )
  const columnSectionType = getColumnSectionType(project.layout)
  const completeness = assessProductCompleteness(selectedProduct)
  const activeSeismicResult =
    review.results.find((result) => result.id === 'seismic') ?? null
  const activeSnapshot = buildProjectSnapshot(
    batchReview.summary,
    batchReview.controllingLoadCaseName,
  )
  const projectLibrary = projects.map((item) =>
    item.id === project.id
      ? cloneProject({
          ...project,
          snapshot: activeSnapshot,
        })
      : normalizeProjectSelection(item, products),
  )
  const caseCards = [...projectLibrary].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
  const latestAuditEntry = useMemo(
    () => getLatestProjectAuditEntry(project) ?? null,
    [project],
  )
  const caseDocuments = useMemo(() => project.documents ?? [], [project.documents])
  const previewDocumentMeta = previewDocumentId
    ? caseDocuments.find((item) => item.id === previewDocumentId) ?? null
    : null
  const normalizedProjectTemplateSearch = projectTemplateSearch
    .trim()
    .toLowerCase()
  const availableProjectTemplates = projectTemplateCatalog
  const filteredProjectTemplates = availableProjectTemplates
    .filter((template) =>
      projectTemplateFilter === 'all'
        ? true
        : template.category === projectTemplateFilter,
    )
    .filter((template) => {
      if (!normalizedProjectTemplateSearch) {
        return true
      }

      const haystack = [
        template.name,
        projectTemplateCategoryLabel(template.category),
        template.summary,
        ...template.highlights,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedProjectTemplateSearch)
    })
  const normalizedTemplateSearch = templateSearch.trim().toLowerCase()
  const availableTemplates = templateCatalog ?? []
  const filteredTemplates = availableTemplates
    .filter((template) =>
      templateFilter === 'all' ? true : template.family === templateFilter,
    )
    .filter((template) => {
      if (!normalizedTemplateSearch) {
        return true
      }

      const haystack = [
        template.brand,
        template.series,
        template.summary,
        template.caveat,
        ...template.highlights,
        ...template.references.map((reference) => reference.label),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedTemplateSearch)
    })
  const resourceLibraryTabs = [
    {
      id: 'project_templates',
      label: '案件樣板',
      description: '先用常見柱腳 / 埋件 / 設備固定案例起案。',
      badge: `${filteredProjectTemplates.length} 個樣板`,
    },
    {
      id: 'product_templates',
      label: '產品模板',
      description: '補常用系列模板，再接著填 ETA / ICC / 型錄值。',
      badge: `${filteredTemplates.length} 個模板`,
    },
    {
      id: 'product_scan',
      label: '產品掃描',
      description: '依目前幾何與載重，直接掃出可加入比選的方案。',
      badge: `${candidateProducts.length} 個候選`,
    },
  ] satisfies Array<{
    id: ResourceLibraryTabId
    label: string
    description: string
    badge: string
  }>
  const recommendedProjectTemplates = useMemo<ProjectTemplateRecommendation[]>(
    () => recommendProjectTemplates(project, selectedProduct.family).slice(0, 3),
    [project, selectedProduct.family],
  )

  useEffect(() => {
    let cancelled = false

    void import('./productTemplates').then(({ productTemplates }) => {
      if (cancelled) {
        return
      }

      setTemplateCatalog(productTemplates)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void import('./seismicRouteGuidance').then(({ getSeismicRouteGuidance }) => {
      if (cancelled) {
        return
      }

      setSeismicRouteGuidance(
        getSeismicRouteGuidance(project.loads, selectedProduct, activeSeismicResult),
      )
    })

    return () => {
      cancelled = true
    }
  }, [project.loads, selectedProduct, activeSeismicResult])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      import('./evaluationCatalog'),
      import('./evidenceLinks'),
    ]).then(([evaluationModule, evidenceModule]) => {
      if (cancelled) {
        return
      }

      const nextEvaluationFieldStates =
        evaluationModule.getEvaluationFieldStates(selectedProduct)
      const nextEvidenceCoverage =
        evaluationModule.getEvidenceCoverageSummary(selectedProduct)
      const nextEvidenceFieldViews = evidenceModule.createEvidenceFieldViews(
        nextEvaluationFieldStates,
        caseDocuments,
      )

      setEvaluationFieldStates(nextEvaluationFieldStates)
      setEvidenceCoverage(nextEvidenceCoverage)
      setFilteredEvidenceFieldViews(
        evidenceModule.filterEvidenceFieldViews(nextEvidenceFieldViews, {
          documentKind: evidenceDocumentKindFilter,
          status: evidenceLinkStatusFilter,
        }),
      )
      setEvidenceLinkSummaries(
        evidenceModule.summarizeEvidenceLinks(nextEvidenceFieldViews, caseDocuments),
      )
    })

    return () => {
      cancelled = true
    }
  }, [
    selectedProduct,
    caseDocuments,
    evidenceDocumentKindFilter,
    evidenceLinkStatusFilter,
  ])

  const [isDirty, setIsDirty] = useState(false)
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')

  // 任何 project / products 變動後，先標記為 dirty；debounce 儲存完成才清除
  // 此處 setState 是刻意觸發 UI 更新（未儲存徽章），非同步外部系統
  useEffect(() => {
    if (!hydrated) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDirty(true)
  }, [hydrated, products, project, projects])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    const timeout = window.setTimeout(() => {
      const activeProject = normalizeProjectSelection(project, products)
      const activeProduct =
        products.find((item) => item.id === activeProject.selectedProductId) ??
        products[0]
      const activeBatchReview = evaluateProjectBatch(
        activeProject,
        activeProduct,
        getRuleProfileById(activeProject.ruleProfileId),
      )
      const nextProjectsToPersist = projects.map((item) =>
        item.id === activeProject.id
          ? cloneProject({
              ...activeProject,
              snapshot: buildProjectSnapshot(
                activeBatchReview.summary,
                activeBatchReview.controllingLoadCaseName,
              ),
            })
          : normalizeProjectSelection(item, products),
      )

      Promise.all([
        db.products.bulkPut(products),
        db.projects.bulkPut(nextProjectsToPersist),
      ])
        .then(() => {
          setSaveMessage(
            `已離線儲存 ${new Date().toLocaleTimeString('zh-TW')}`,
          )
          setIsDirty(false)
        })
        .catch((error) => {
          console.warn('[bolt-review] 自動儲存失敗', error)
          const message =
            error instanceof Error ? error.message : String(error ?? '未知錯誤')
          setSaveMessage(`自動儲存失敗：${message}`)
          // 保留 isDirty=true，提示使用者需人工留意
        })
    }, 450)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [hydrated, products, project, projects])

  // saveMessage 變動時冒出 toast（hydration 前不觸發，避免初始訊息刷屏）
  const savedMessageRef = useRef(saveMessage)
  useEffect(() => {
    if (!hydrated) {
      savedMessageRef.current = saveMessage
      return
    }
    if (savedMessageRef.current === saveMessage) {
      return
    }
    savedMessageRef.current = saveMessage
    const id = Date.now() + Math.random()
    setToast({ id, message: saveMessage })
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, 3500)
    return () => window.clearTimeout(timeout)
  }, [saveMessage, hydrated])

  // 有未儲存變更時，關閉分頁前給瀏覽器原生提示
  useEffect(() => {
    if (!isDirty) {
      return
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 現代瀏覽器只會顯示通用訊息，returnValue 用於相容舊版
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }, [isDirty])

  // 全視窗拖放 JSON：任意位置拖入檔案即可還原工作區備份
  useEffect(() => {
    if (!hydrated) {
      return
    }
    // 使用 counter 避免 dragleave 在子元素間觸發時誤判離開
    let dragCounter = 0
    const hasFile = (event: DragEvent) =>
      Array.from(event.dataTransfer?.items ?? []).some(
        (item) => item.kind === 'file',
      )
    const onDragEnter = (event: DragEvent) => {
      if (!hasFile(event)) {
        return
      }
      dragCounter += 1
      event.preventDefault()
      setIsDraggingFile(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFile(event)) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFile(event)) {
        return
      }
      dragCounter = Math.max(0, dragCounter - 1)
      if (dragCounter === 0) {
        setIsDraggingFile(false)
      }
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFile(event)) {
        return
      }
      event.preventDefault()
      dragCounter = 0
      setIsDraggingFile(false)
      const file = event.dataTransfer?.files?.[0]
      if (!file) {
        return
      }
      void importFileHandlerRef.current.run(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [hydrated])

  // 切換 tab 後，把 active tab 按鈕自動捲進可視範圍（手機窄橫向捲軸時需要）
  useEffect(() => {
    if (!hydrated) {
      return
    }
    const raf = window.requestAnimationFrame(() => {
      const active = document.querySelector<HTMLElement>(
        '.workspace-tabs button.active',
      )
      active?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [activeTab, hydrated])

  // 切到結果頁且整體判定有問題時，自動捲到「建議動作」提示卡
  useEffect(() => {
    if (!hydrated || activeTab !== 'result') {
      return
    }
    const overall = batchReview.summary.overallStatus
    const needsAttention =
      overall === 'fail' || overall === 'warning' || overall === 'incomplete'
    if (!needsAttention) {
      return
    }
    const raf = window.requestAnimationFrame(() => {
      const hint = document.querySelector<HTMLElement>('[data-action-hint]')
      hint?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [activeTab, hydrated, batchReview.summary.overallStatus])

  // 切換 tab 後自動聚焦到該 tab 第一個可編輯欄位（input/select/textarea）
  // 只在主要輸入型 tab 啟用，避免 result/report 頁跳焦干擾閱讀
  useEffect(() => {
    if (!hydrated) {
      return
    }
    const FOCUSABLE_TABS: WorkspaceTabId[] = [
      'member',
      'product',
      'loads',
      'seismic',
      'baseplate',
    ]
    if (!FOCUSABLE_TABS.includes(activeTab)) {
      return
    }
    // 給 CSS data-shows 一個 frame 讓 display 切換；並避免初次 mount 立刻搶焦點
    const raf = window.requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>(
        `.app-shell[data-active-tab="${activeTab}"] .panel-input`,
      )
      if (!panel) {
        return
      }
      const target = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      if (target && !panel.contains(document.activeElement)) {
        try {
          target.focus({ preventScroll: true })
        } catch {
          target.focus()
        }
      }
    })
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [activeTab, hydrated])

  // 鍵盤捷徑的 handler 用 ref 儲存；待 printReport / recordCurrentAuditTrail 宣告後再 assign
  const shortcutHandlersRef = useRef<{
    recordCurrentAuditTrail: (source: ProjectAuditSource) => void
    printReport: () => void
  }>({
    recordCurrentAuditTrail: () => {},
    printReport: () => {},
  })

  // 拖放匯入的 handler ref（importWorkspaceFromFile 在此下方宣告，透過物件欄位避免 ref.current 被替換）
  const importFileHandlerRef = useRef<{ run: (file: File) => Promise<void> }>({
    run: async () => {},
  })

  useEffect(() => {
    if (!previewDocumentId) {
      return
    }

    let cancelled = false
    const currentId = previewDocumentId
    let objectUrl: string | null = null

    async function loadPreview() {
      const file = await db.files.get(currentId)

      if (cancelled) {
        return
      }

      if (!file) {
        setPreviewDocumentFile(null)
        setPreviewDocumentError('找不到附件檔案，請重新上傳。')
        setPreviewDocumentUrl(null)
        return
      }

      objectUrl = window.URL.createObjectURL(file.blob)
      setPreviewDocumentFile(file)
      setPreviewDocumentError('')
      setPreviewDocumentUrl(objectUrl)
    }

    void loadPreview()

    return () => {
      cancelled = true
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }
  }, [previewDocumentId])

  function commitProject(nextProject: ProjectCase) {
    const normalized = normalizeProjectSelection(nextProject, products)

    startTransition(() => {
      setProject(normalized)
      setProjects((current) => replaceProjectInList(current, normalized))
    })
  }

  function patchProject(patch: Partial<ProjectCase>) {
    commitProject({
      ...project,
      ...patch,
      updatedAt: new Date().toISOString(),
    })
  }

  function patchCandidateProducts(nextCandidateProductIds: string[]) {
    const normalized = Array.from(new Set(nextCandidateProductIds))
    if (!normalized.includes(project.selectedProductId)) {
      normalized.unshift(project.selectedProductId)
    }
    patchProject({
      candidateProductIds: normalized,
    })
  }

  function applyCandidateProductSelection(productId: string) {
    patchProject({
      selectedProductId: productId,
      candidateProductIds: Array.from(
        new Set([...(project.candidateProductIds ?? [project.selectedProductId]), productId]),
      ),
    })
    const product = products.find((item) => item.id === productId)
    if (product) {
      setSaveMessage(`已切換目前產品：${product.brand} ${product.model}`)
    }
  }

  function patchUi(patch: Partial<UnitPreferences>) {
    patchProject({
      ui: {
        ...unitPreferences,
        ...patch,
      },
    })
  }

  function patchReport(patch: Partial<ReportSettings>) {
    patchProject({
      report: {
        ...reportSettings,
        ...patch,
      },
    })
  }

  function patchLoadPresetInput(
    patch: Partial<LoadCasePresetInput>,
  ) {
    patchProject({
      loadPresetInput: {
        ...loadPresetInput,
        ...patch,
      },
    })
  }

  function patchLoadPresetComponent(
    key: keyof Pick<LoadCasePresetInput, 'dead' | 'live' | 'earthquake'>,
    patch: Partial<LoadCombinationComponents>,
  ) {
    patchLoadPresetInput({
      [key]: {
        ...loadPresetInput[key],
        ...patch,
      },
    })
  }

  function patchProjectDocument(
    documentId: string,
    patch: Partial<NonNullable<ProjectCase['documents']>[number]>,
  ) {
    patchProject({
      documents: caseDocuments.map((item) =>
        item.id === documentId
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    })
  }

  function patchLayout(patch: Partial<AnchorLayout>) {
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      layout: {
        ...project.layout,
        ...patch,
      },
    })
  }

  function patchLayoutVariants(nextVariants: ProjectLayoutVariant[]) {
    patchProject({
      candidateLayoutVariants: nextVariants.map((item) => ({
        ...item,
        layout: {
          ...defaultProject.layout,
          ...item.layout,
        },
      })),
    })
  }

  function createLayoutVariantFromCurrent() {
    const nextVariant: ProjectLayoutVariant = {
      id: nextLayoutVariantId(),
      name: makeUniqueLayoutVariantName('候選配置', candidateLayoutVariants),
      layout: {
        ...project.layout,
      },
      note: '',
      updatedAt: new Date().toISOString(),
    }

    patchLayoutVariants([...candidateLayoutVariants, nextVariant])
    setSaveMessage(`已加入候選配置：${nextVariant.name}`)
  }

  function patchLayoutVariantMeta(
    variantId: string,
    patch: Partial<Pick<ProjectLayoutVariant, 'name' | 'note'>>,
  ) {
    patchLayoutVariants(
      candidateLayoutVariants.map((item) =>
        item.id === variantId
          ? {
              ...item,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  function applyLayoutVariantSelection(variantId: string) {
    const variant = candidateLayoutVariants.find((item) => item.id === variantId)
    if (!variant) {
      return
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      layout: {
        ...variant.layout,
      },
    })
    setSaveMessage(`已套用候選配置：${variant.name}`)
  }

  function overwriteLayoutVariantFromCurrent(variantId: string) {
    const variant = candidateLayoutVariants.find((item) => item.id === variantId)
    if (!variant) {
      return
    }

    patchLayoutVariants(
      candidateLayoutVariants.map((item) =>
        item.id === variantId
          ? {
              ...item,
              layout: {
                ...project.layout,
              },
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
    setSaveMessage(`已用目前配置覆寫：${variant.name}`)
  }

  function duplicateLayoutVariant(variantId: string) {
    const source = candidateLayoutVariants.find((item) => item.id === variantId)
    if (!source) {
      return
    }

    const nextVariant: ProjectLayoutVariant = {
      ...source,
      id: nextLayoutVariantId(),
      name: makeUniqueLayoutVariantName(source.name, candidateLayoutVariants),
      layout: {
        ...source.layout,
      },
      updatedAt: new Date().toISOString(),
    }

    patchLayoutVariants([...candidateLayoutVariants, nextVariant])
    setSaveMessage(`已複製候選配置：${nextVariant.name}`)
  }

  function deleteLayoutVariant(variantId: string) {
    const variant = candidateLayoutVariants.find((item) => item.id === variantId)
    if (!variant) {
      return
    }

    patchLayoutVariants(
      candidateLayoutVariants.filter((item) => item.id !== variantId),
    )
    setSaveMessage(`已刪除候選配置：${variant.name}`)
  }

  function applyDerivedBasePlateCantilevers() {
    if (!derivedBasePlateCantilevers) {
      return
    }

    patchLayout({
      basePlateCantileverXmm: derivedBasePlateCantilevers.xMm,
      basePlateCantileverYmm: derivedBasePlateCantilevers.yMm,
    })
  }

  function patchLoads(patch: Partial<ProjectCase['loads']>) {
    const nextLoads = {
      ...project.loads,
      ...patch,
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loads: nextLoads,
      loadCases: loadCaseLibrary.map((item) =>
        item.id === activeLoadCase.id
          ? {
              ...item,
              loads: {
                ...item.loads,
                ...patch,
              },
            }
          : item,
      ),
      })
  }

  function patchLoadCaseRow(loadCaseId: string, patch: Partial<ProjectCase['loads']>) {
    const nextLoadCases = loadCaseLibrary.map((item) =>
      item.id === loadCaseId
        ? {
            ...item,
            loads: {
              ...item.loads,
              ...patch,
            },
          }
        : item,
    )
    const nextActiveLoadCase =
      loadCaseId === activeLoadCase.id
        ? nextLoadCases.find((item) => item.id === loadCaseId)?.loads ?? project.loads
        : project.loads

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loads: nextActiveLoadCase,
      loadCases: nextLoadCases,
    })
  }

  function applyRecommendedSeismicRoute() {
    const recommendation = seismicRouteGuidance?.recommendation
    if (!recommendation) {
      return
    }

    patchLoads({
      considerSeismic: true,
      seismicDesignMethod: recommendation.method,
    })
  }

  function selectLoadCase(loadCaseId: string) {
    const nextLoadCase = loadCaseLibrary.find((item) => item.id === loadCaseId)
    if (!nextLoadCase) {
      return
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: {
        ...project.loads,
        ...nextLoadCase.loads,
      },
    })
  }

  function createLoadCase() {
    const nextLoadCase: ProjectLoadCase = {
      id: nextLoadCaseId(),
      name: makeUniqueLoadCaseName(`LC${loadCaseLibrary.length + 1}`, loadCaseLibrary),
      loads: {
        ...project.loads,
      },
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: nextLoadCase.loads,
      loadCases: [...loadCaseLibrary, nextLoadCase],
    })
    setSaveMessage(`已新增載重組合：${nextLoadCase.name}`)
  }

  function duplicateLoadCase() {
    const nextLoadCase: ProjectLoadCase = {
      id: nextLoadCaseId(),
      name: makeUniqueLoadCaseName(`${activeLoadCase.name} 副本`, loadCaseLibrary),
      loads: {
        ...activeLoadCase.loads,
      },
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: nextLoadCase.loads,
      loadCases: [...loadCaseLibrary, nextLoadCase],
    })
    setSaveMessage(`已複製載重組合：${nextLoadCase.name}`)
  }

  function deleteActiveLoadCase() {
    if (loadCaseLibrary.length === 1) {
      return
    }

    const currentIndex = loadCaseLibrary.findIndex(
      (item) => item.id === activeLoadCase.id,
    )
    const remaining = loadCaseLibrary.filter((item) => item.id !== activeLoadCase.id)
    const fallbackLoadCase =
      remaining[currentIndex] ?? remaining[currentIndex - 1] ?? remaining[0]

    if (!fallbackLoadCase) {
      return
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: fallbackLoadCase.id,
      loads: fallbackLoadCase.loads,
      loadCases: remaining,
    })
    setSaveMessage(`已刪除載重組合：${activeLoadCase.name}`)
  }

  function renameActiveLoadCase(name: string) {
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loadCases: loadCaseLibrary.map((item) =>
        item.id === activeLoadCase.id
          ? {
              ...item,
              name,
            }
          : item,
      ),
    })
  }

  async function applyLoadCasePreset(mode: 'replace' | 'append') {
    const { buildLoadCasePresets } = await import('./loadCasePresets')
    const generated = buildLoadCasePresets(activeLoadCase.loads, loadPresetInput)
    const sourceCases = mode === 'replace' ? [] : loadCaseLibrary
    const nextLoadCases = [...sourceCases]

    for (const preset of generated) {
      nextLoadCases.push({
        id: nextLoadCaseId(),
        name: makeUniqueLoadCaseName(preset.name, nextLoadCases),
        loads: preset.loads,
      })
    }

    const nextActiveLoadCase =
      mode === 'replace'
        ? nextLoadCases[0]
        : activeLoadCase

    if (!nextActiveLoadCase) {
      return
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextActiveLoadCase.id,
      loads: nextActiveLoadCase.loads,
      loadCases: nextLoadCases,
    })
    setSaveMessage(
      mode === 'replace'
        ? `已依 D / L / E preset 重建 ${generated.length} 組載重組合`
        : `已附加 ${generated.length} 組 preset 載重組合`,
    )
  }

  async function exportLoadCasesCsv() {
    const { serializeLoadCasesToCsv } = await import('./loadCaseCsv')
    const csv = serializeLoadCasesToCsv(loadCaseLibrary)
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8',
    })
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = project.name.trim() || 'bolt-review'

    link.href = objectUrl
    link.download = `${safeName}-load-cases.csv`
    link.click()
    window.URL.revokeObjectURL(objectUrl)
    setSaveMessage(
      `已匯出 ${loadCaseLibrary.length} 組載重組合 CSV（固定使用 kN / kN-m / mm）`,
    )
  }

  function openLoadCaseCsvImportDialog(mode: 'append' | 'replace') {
    setPendingLoadCaseImportMode(mode)
    loadCaseCsvInputRef.current?.click()
  }

  function commitImportedLoadCases(
    parsed: Array<{ name: string; loads: ProjectLoadCase['loads'] }>,
    mode: 'append' | 'replace',
    sourceLabel: string,
    warningMessages: string[] = [],
  ) {
    const sourceCases = mode === 'replace' ? [] : loadCaseLibrary
    const nextLoadCases = [...sourceCases]

    for (const item of parsed) {
      nextLoadCases.push({
        id: nextLoadCaseId(),
        name: makeUniqueLoadCaseName(item.name, nextLoadCases),
        loads: item.loads,
      })
    }

    const nextActiveLoadCase =
      mode === 'replace'
        ? nextLoadCases[0]
        : activeLoadCase

    if (!nextActiveLoadCase) {
      throw new Error('匯入後沒有可用的載重組合。')
    }

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextActiveLoadCase.id,
      loads: nextActiveLoadCase.loads,
      loadCases: nextLoadCases,
    })
    const uniqueWarnings = [...new Set(warningMessages.filter(Boolean))]
    const warningSummary =
      uniqueWarnings.length === 0
        ? ''
        : uniqueWarnings.length <= 2
          ? `；警告：${uniqueWarnings.join('；')}`
          : `；警告：${uniqueWarnings.slice(0, 2).join('；')}；另有 ${uniqueWarnings.length - 2} 項警告`

    setSaveMessage(
      mode === 'replace'
        ? `已由${sourceLabel}覆蓋並匯入 ${parsed.length} 組載重組合（固定使用 kN / kN-m / mm）${warningSummary}`
        : `已由${sourceLabel}附加 ${parsed.length} 組載重組合（固定使用 kN / kN-m / mm）${warningSummary}`,
    )
  }

  async function importLoadCasesCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const { parseLoadCasesFromCsvDetailed } = await import('./loadCaseCsv')
      const parsed = parseLoadCasesFromCsvDetailed(text, activeLoadCase.loads)
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors.join('；'))
      }
      commitImportedLoadCases(
        parsed.rows,
        pendingLoadCaseImportMode,
        ' CSV ',
        parsed.warnings,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '載重組合 CSV 匯入失敗。'
      setSaveMessage(`載重組合 CSV 匯入失敗：${message}`)
    } finally {
      event.target.value = ''
    }
  }

  async function copyLoadCaseHeaderRow() {
    try {
      await navigator.clipboard.writeText(loadCaseDelimitedHeaderRow)
      setSaveMessage('已複製載重組合欄名，可直接貼到 Excel 第一列。')
    } catch {
      setSaveMessage('複製欄名失敗，請確認瀏覽器允許剪貼簿存取。')
    }
  }

  async function importPastedLoadCases(mode: 'append' | 'replace') {
    if (!loadCasePasteText.trim()) {
      setSaveMessage('請先貼上 Excel / CSV 表格內容。')
      return
    }

    try {
      const { parseLoadCasesFromTableTextDetailed } = await import('./loadCaseCsv')
      const parsed = parseLoadCasesFromTableTextDetailed(
        loadCasePasteText,
        activeLoadCase.loads,
      )
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors.join('；'))
      }
      commitImportedLoadCases(parsed.rows, mode, '貼上表格', parsed.warnings)
      setLoadCasePasteText('')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '貼上表格匯入失敗。'
      setSaveMessage(`貼上表格匯入失敗：${message}`)
    }
  }

  function patchSelectedProduct(patch: Partial<AnchorProduct>) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? {
                ...item,
                ...patch,
                evaluation: {
                  ...item.evaluation,
                  ...patch.evaluation,
                },
              }
            : item,
        ),
      )
    })
  }

  function patchSelectedProductEvaluation(
    patch: Partial<AnchorProduct['evaluation']>,
  ) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? {
                ...item,
                evaluation: {
                  ...item.evaluation,
                  ...patch,
                },
              }
            : item,
        ),
      )
    })
  }

  function patchSelectedProductEvidence(
    field: ProductEvidenceFieldKey,
    patch: Partial<ProductEvidenceEntry>,
  ) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? {
                ...item,
                evidence: {
                  ...item.evidence,
                  [field]: {
                    ...item.evidence?.[field],
                    ...patch,
                  },
                },
              }
            : item,
        ),
      )
    })
  }

  async function loadProjectTemplate(templateId: string) {
    const template =
      findProjectTemplateById(templateId) ??
      projectTemplateCatalog.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    clearPreviewDocument()
    commitProject(applyProjectTemplate(template, project))
    setSaveMessage(`已套用案件樣板：${template.name}`)
  }

  function selectProject(projectId: string) {
    const nextProject = projectLibrary.find((item) => item.id === projectId)
    if (!nextProject) {
      return
    }

    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(projectId)
      setProject(nextProject)
      setProjects((current) => replaceProjectInList(current, nextProject))
      setSaveMessage(`已切換案例：${nextProject.name}`)
    })
  }

  function createProject() {
    const nextProject = normalizeProjectSelection(
      {
        ...defaultProject,
        id: nextProjectId(),
        name: makeUniqueProjectName('新案例', projectLibrary),
        selectedProductId: selectedProduct.id,
        ui: project.ui,
        report: project.report,
        updatedAt: new Date().toISOString(),
      },
      products,
    )

    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(nextProject.id)
      setProject(nextProject)
      setProjects((current) => [...current, nextProject])
      setSaveMessage(`已新增案例：${nextProject.name}`)
    })
  }

  function resetCurrentProjectToDefaults() {
    const confirmed = window.confirm(
      `將把目前案例「${project.name}」的所有輸入還原為預設值，但保留案例 ID、名稱、UI 偏好與報表設定。此操作不可復原（可先匯出 JSON 備份）。確定繼續？`,
    )
    if (!confirmed) {
      return
    }
    const preservedId = project.id
    const preservedName = project.name
    const preservedUi = project.ui
    const preservedReport = project.report
    const preservedRuleProfileId = project.ruleProfileId
    const next = normalizeProjectSelection(
      {
        ...cloneProject(defaultProject),
        id: preservedId,
        name: preservedName,
        ui: preservedUi,
        report: preservedReport,
        ruleProfileId: preservedRuleProfileId,
        updatedAt: new Date().toISOString(),
      },
      products,
    )
    clearPreviewDocument()
    startTransition(() => {
      setProject(next)
      setProjects((current) => replaceProjectInList(current, next))
      setSaveMessage(`已將「${preservedName}」還原為預設值`)
    })
  }

  function duplicateProject() {
    const nextProject = cloneProject({
      ...project,
      id: nextProjectId(),
      name: makeUniqueProjectName(`${project.name} 副本`, projectLibrary),
      updatedAt: new Date().toISOString(),
    })

    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(nextProject.id)
      setProject(nextProject)
      setProjects((current) => [...current, nextProject])
      setSaveMessage(`已複製案例：${nextProject.name}`)
    })
  }

  function deleteCurrentProject() {
    if (projectLibrary.length === 1) {
      return
    }

    const targetIndex = projectLibrary.findIndex((item) => item.id === project.id)
    const remaining = projectLibrary.filter((item) => item.id !== project.id)
    const fallbackProject =
      remaining[targetIndex] ?? remaining[targetIndex - 1] ?? remaining[0]

    if (!fallbackProject) {
      return
    }

    clearPreviewDocument()
    startTransition(() => {
      setProjects(remaining)
      setActiveProjectId(fallbackProject.id)
      setProject(fallbackProject)
      setSaveMessage(`已刪除案例：${project.name}`)
    })

    void db.projects.delete(project.id)
    void db.files.where('projectId').equals(project.id).delete()
  }

  function exportCurrentCase() {
    // 只輸出目前單一案例 + 其使用的產品（以 selectedProductId 與候選）+ 該案件附件
    // 附件為 async 取得；使用 IIFE 封裝
    void (async () => {
      try {
        const { buildWorkspaceBackup } = await import('./backup')
        const caseProject = normalizeProjectSelection(project, products)
        const linkedProductIds = new Set<string>([
          caseProject.selectedProductId,
          ...(caseProject.candidateProductIds ?? []),
        ])
        const linkedProducts = products.filter((item) =>
          linkedProductIds.has(item.id),
        )
        const allFiles = await db.files.toArray()
        const linkedFiles = allFiles.filter(
          (file) => file.projectId === caseProject.id,
        )
        const payload = await buildWorkspaceBackup(
          linkedProducts,
          [caseProject],
          linkedFiles,
        )
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        })
        const objectUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        const safeName =
          (caseProject.name || 'anchor-case')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'anchor-case'
        const exportDate = payload.exportedAt.slice(0, 10)
        link.href = objectUrl
        link.download = `${safeName}-${exportDate}.json`
        link.click()
        window.URL.revokeObjectURL(objectUrl)
        setSaveMessage(
          `已匯出單案 ${linkedProducts.length} 產品 / ${linkedFiles.length} 附件：${safeName}`,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '匯出失敗'
        setSaveMessage(`單案匯出失敗：${message}`)
      }
    })()
  }

  async function exportWorkspace() {
    const { buildWorkspaceBackup } = await import('./backup')
    const files = await db.files.toArray()
    const payload = await buildWorkspaceBackup(products, projectLibrary, files)
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const exportDate = payload.exportedAt.slice(0, 10)

    link.href = objectUrl
    link.download = `bolt-review-backup-${exportDate}.json`
    link.click()
    window.URL.revokeObjectURL(objectUrl)
    setSaveMessage(
      `已匯出 ${payload.projects.length} 個案例 / ${payload.products.length} 個產品 / ${payload.files.length} 份附件`,
    )
  }

  function openImportDialog() {
    importInputRef.current?.click()
  }

  async function importWorkspaceFromFile(file: File) {
    try {
      if (
        !file.type.includes('json') &&
        !file.name.toLowerCase().endsWith('.json')
      ) {
        setSaveMessage(`忽略非 JSON 檔案：${file.name}`)
        return
      }
      const { mergeWorkspaceBackup, parseWorkspaceBackup } = await import('./backup')
      const text = await file.text()
      const parsed = parseWorkspaceBackup(text)
      const currentFiles = await db.files.toArray()
      const merged = mergeWorkspaceBackup(
        products,
        projectLibrary,
        currentFiles,
        parsed,
      )
      const nextProject =
        merged.projects[merged.projects.length - 1] ?? project

      await db.files.bulkPut(merged.files)

      clearPreviewDocument()
      startTransition(() => {
        setProducts(merged.products)
        setProjects(merged.projects)
        setActiveProjectId(nextProject.id)
        setProject(nextProject)
      })

      setSaveMessage(
        `已匯入 ${merged.importedProjects} 個案例 / ${merged.importedProducts} 個產品 / ${merged.importedFiles} 份附件`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '匯入失敗，請確認 JSON 格式。'
      setSaveMessage(`匯入失敗：${message}`)
    }
  }

  async function importWorkspace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      await importWorkspaceFromFile(file)
    } finally {
      event.target.value = ''
    }
  }

  function openDocumentDialog() {
    documentInputRef.current?.click()
  }

  function previewCaseDocument(documentId: string) {
    if (previewDocumentId === documentId) {
      return
    }

    setPreviewDocumentFile(null)
    setPreviewDocumentError('')
    setPreviewDocumentUrl(null)
    setPreviewDocumentId(documentId)
  }

  function clearPreviewDocument() {
    setPreviewDocumentFile(null)
    setPreviewDocumentError('')
    setPreviewDocumentUrl(null)
    setPreviewDocumentId(null)
  }

  async function uploadCaseDocuments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])

    if (files.length === 0) {
      return
    }

    const addedAt = new Date().toISOString()
    const documents = files.map((file) => {
      const id = nextDocumentId()

      return {
        document: {
          id,
          name: file.name,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          kind: pendingDocumentKind,
          note: '',
          verified: false,
          addedAt,
        },
        storedFile: {
          id,
          projectId: project.id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          blob: file,
          updatedAt: addedAt,
        } satisfies StoredDocumentFile,
      }
    })

    await db.files.bulkPut(documents.map((item) => item.storedFile))
    patchProject({
      documents: [...caseDocuments, ...documents.map((item) => item.document)],
    })
    setPreviewDocumentId(documents[0]?.document.id ?? null)
    setSaveMessage(`已加入 ${documents.length} 份案例文件`)
    event.target.value = ''
  }

  async function openCaseDocument(documentId: string) {
    const file = await db.files.get(documentId)
    if (!file) {
      setSaveMessage('找不到附件檔案，請重新上傳。')
      return
    }

    const objectUrl = window.URL.createObjectURL(file.blob)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl)
    }, 60_000)
  }

  async function downloadCaseDocument(documentId: string) {
    const file = await db.files.get(documentId)
    if (!file) {
      setSaveMessage('找不到附件檔案，請重新上傳。')
      return
    }

    const objectUrl = window.URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = file.fileName
    link.click()
    window.URL.revokeObjectURL(objectUrl)
  }

  async function deleteCaseDocument(documentId: string) {
    await db.files.delete(documentId)
    if (previewDocumentId === documentId) {
      setPreviewDocumentId(null)
    }
    patchProject({
      documents: caseDocuments.filter((item) => item.id !== documentId),
    })
    setSaveMessage('已刪除案例附件')
  }

  function createProduct() {
    const next = makeBlankProduct()
    setProducts((current) => [...current, next])
    patchProject({ selectedProductId: next.id })
  }

  async function importTemplate(templateId: string) {
    const { instantiateProductTemplate, productTemplates } = await import(
      './productTemplates'
    )
    const template = productTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    const imported = instantiateProductTemplate(
      template,
      nextTemplateImportId(template.id, products),
    )

    startTransition(() => {
      setProducts((current) => [...current, imported])
      setProject((current) => ({
        ...current,
        selectedProductId: imported.id,
        updatedAt: new Date().toISOString(),
      }))
      setSaveMessage(`已匯入模板：${template.brand} ${template.series}`)
    })
  }

  async function applyTemplate(templateId: string) {
    const { applyTemplateToProduct, productTemplates } = await import(
      './productTemplates'
    )
    const template = productTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    const applied = applyTemplateToProduct(template, selectedProduct)
    startTransition(() => {
      setProducts((current) =>
        current.map((item) => (item.id === selectedProduct.id ? applied : item)),
      )
      setSaveMessage(`已套用模板：${template.brand} ${template.series}`)
    })
  }

  function duplicateSelectedProduct() {
    const nextId = `copy-${Date.now()}`
    const cloned = cloneProduct(selectedProduct, nextId)
    cloned.model = `${selectedProduct.model}-copy`
    setProducts((current) => [...current, cloned])
    patchProject({ selectedProductId: nextId })
  }

  function deleteSelectedProduct() {
    if (products.length === 1) {
      return
    }

    const remaining = products.filter((item) => item.id !== selectedProduct.id)
    setProducts(remaining)
    patchProject({ selectedProductId: remaining[0].id })
  }

  async function ensureProjectAudit(
    source: ProjectAuditSource,
  ): Promise<{
    auditEntry: ProjectAuditEntry
    auditTrail: ProjectAuditEntry[]
    reused: boolean
  }> {
    const snapshot = buildProjectSnapshot(
      batchReview.summary,
      batchReview.controllingLoadCaseName,
    )
    const nextEntry = await createProjectAuditEntry({
      project: cloneProject({
        ...project,
        snapshot,
      }),
      selectedProduct,
      batchReview,
      reportSettings,
      completeness,
      snapshot,
      source,
    })
    const currentTrail = project.auditTrail ?? []
    const existingEntry = currentTrail.find((item) => item.hash === nextEntry.hash)
    if (existingEntry) {
      return {
        auditEntry: existingEntry,
        auditTrail: currentTrail,
        reused: true,
      }
    }

    const nextProject = cloneProject({
      ...project,
      updatedAt: new Date().toISOString(),
      snapshot,
      auditTrail: [nextEntry, ...currentTrail].slice(0, 25),
    })
    commitProject(nextProject)

    return {
      auditEntry: nextEntry,
      auditTrail: nextProject.auditTrail ?? [nextEntry],
      reused: false,
    }
  }

  async function recordCurrentAuditTrail(source: ProjectAuditSource) {
    const { auditEntry, reused } = await ensureProjectAudit(source)
    setSaveMessage(
      reused
        ? `已沿用既有留痕：${formatAuditHash(auditEntry.hash)}`
        : `已留存檢核簽章：${formatAuditHash(auditEntry.hash)}`,
    )
  }

  function getReportArtifactParams(
    autoPrint = false,
    auditEntry: ProjectAuditEntry | null = latestAuditEntry,
    auditTrail: ProjectAuditEntry[] = project.auditTrail ?? [],
    reportGeneratedAt: string = new Date().toISOString(),
  ): ReportArtifactParams {
    return {
      batchReview,
      candidateProductReviews,
      layoutVariantReviews,
      review,
      selectedProduct,
      completeness,
      evaluationFieldStates,
      unitPreferences,
      reportSettings,
      saveMessage,
      auditEntry: auditEntry ?? undefined,
      auditTrail,
      autoPrint,
      reportGeneratedAt,
    }
  }

  async function buildReportHtml(
    autoPrint = false,
    source: ProjectAuditSource = 'html',
  ) {
    const { auditEntry, auditTrail } = await ensureProjectAudit(source)
    const { buildStandaloneReportHtml } = await import('./reportExport')

    return buildStandaloneReportHtml(
      getReportArtifactParams(autoPrint, auditEntry, auditTrail),
    )
  }

  async function buildReportBlobUrl(
    autoPrint = false,
    source: ProjectAuditSource = 'html',
  ) {
    const html = await buildReportHtml(autoPrint, source)
    return URL.createObjectURL(
      new Blob([html], {
        type: 'text/html;charset=utf-8',
      }),
    )
  }

  async function openStandaloneReportWindow(autoPrint = false) {
    const url = await buildReportBlobUrl(
      autoPrint,
      autoPrint ? 'print' : 'preview',
    )
    const nextWindow = window.open(url, '_blank')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    if (!nextWindow) {
      setSaveMessage('瀏覽器封鎖了報告視窗，請允許彈出視窗後再試。')
      return
    }
    setSaveMessage(autoPrint ? '已開啟獨立報告列印視窗。' : '已開啟獨立報告預覽。')
  }

  // 每次 render 後同步 ref（printReport / recordCurrentAuditTrail 在此檔上方宣告但下游呼叫 openStandaloneReportWindow）
  useEffect(() => {
    shortcutHandlersRef.current.recordCurrentAuditTrail = recordCurrentAuditTrail
    shortcutHandlersRef.current.printReport = () => {
      void openStandaloneReportWindow(true)
    }
    // eslint-disable-next-line react-hooks/immutability
    importFileHandlerRef.current.run = importWorkspaceFromFile
  })

  // 全域鍵盤捷徑：Ctrl/Cmd+S 留痕、Ctrl/Cmd+P 列印、Alt+1–6 切 tab、Alt+0 回首頁、Esc 返回結果
  useEffect(() => {
    if (!hydrated) {
      return
    }
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey
      const alt = event.altKey
      if (meta && !alt && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcutHandlersRef.current.recordCurrentAuditTrail('manual')
        return
      }
      if (meta && !alt && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        shortcutHandlersRef.current.printReport()
        return
      }
      // Ctrl/Cmd+K：開啟命令面板
      if (meta && !alt && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteQuery('')
        setShowCommandPalette(true)
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      if (alt && !meta && !event.shiftKey) {
        if (event.key === '0' || event.key.toLowerCase() === 'r') {
          event.preventDefault()
          setActiveTab('report')
          return
        }
        const digit = Number(event.key)
        if (Number.isInteger(digit) && digit >= 1 && digit <= WORKSPACE_TABS.length) {
          event.preventDefault()
          const targetTab = WORKSPACE_TABS[digit - 1]
          setActiveTab(targetTab.id)
          setHasEnteredWorkspace(true)
          return
        }
      }
      if (event.key === 'Escape') {
        if (showCommandPalette) {
          event.preventDefault()
          setShowCommandPalette(false)
          return
        }
        if (showShortcutHelp) {
          event.preventDefault()
          setShowShortcutHelp(false)
          return
        }
        if (activeTab === 'report' && hasEnteredWorkspace) {
          event.preventDefault()
          setActiveTab('result')
        }
      }
      // Shift+? 或 ? ：開啟快捷鍵說明浮層
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault()
        setShowShortcutHelp((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [hydrated, activeTab, hasEnteredWorkspace, showShortcutHelp, showCommandPalette])

  async function exportHtmlReport() {
    const url = await buildReportBlobUrl(false, 'html')
    const link = document.createElement('a')
    const safeName =
      (project.name || 'anchor-review-report')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim() || 'anchor-review-report'

    link.href = url
    link.download = `${safeName}.html`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setSaveMessage(`已匯出 HTML 報告：${safeName}.html`)
  }

  async function exportXlsxReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('xlsx')
    const { serializeReportWorkbook } = await import('./reportWorkbook')
    const buffer = await serializeReportWorkbook(
      getReportArtifactParams(false, auditEntry, auditTrail),
    )
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName =
      (project.name || 'anchor-review-report')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim() || 'anchor-review-report'

    link.href = url
    link.download = `${safeName}.xlsx`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setSaveMessage(
      reused
        ? `已匯出 XLSX 報告：${safeName}.xlsx（沿用留痕 ${formatAuditHash(auditEntry.hash)}）`
        : `已匯出 XLSX 報告：${safeName}.xlsx`,
    )
  }

  async function exportDocxReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('docx')
    const { serializeReportDocument } = await import('./reportDocx')
    const buffer = await serializeReportDocument(
      getReportArtifactParams(false, auditEntry, auditTrail),
    )
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName =
      (project.name || 'anchor-review-report')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replaceAll(/\s+/g, '-')

    link.href = url
    link.download = `${safeName}.docx`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setSaveMessage(
      reused
        ? `已匯出 DOCX 報告：${safeName}.docx（沿用留痕 ${formatAuditHash(auditEntry.hash)}）`
        : `已匯出 DOCX 報告：${safeName}.docx`,
    )
  }

  if (loading) {
    return (
      <main className="loading-screen" aria-busy="true" role="status">
        <div className="loading-card">
          <div className="loading-spinner" aria-hidden="true" />
          <strong>錨栓檢討工具</strong>
          <span>正在讀取離線資料庫與規範設定…</span>
          <small>
            首次載入會建立本機 IndexedDB、載入產品型錄與規範資料；
            若卡住超過 10 秒請試 F5 重新整理。
          </small>
        </div>
      </main>
    )
  }

  if (hydrationError && !hydrated) {
    return (
      <main className="loading-screen hydration-error" role="alert">
        <div className="hydration-error-card">
          <h2>離線資料庫讀取失敗</h2>
          <p className="hydration-error-message">錯誤訊息：{hydrationError}</p>
          <p className="helper-text">
            可能原因：瀏覽器處於無痕/隱私模式、IndexedDB 配額已滿、或資料庫版本不相容。
            可先嘗試重新載入；若持續失敗，可清空本機資料後以預設值重建。
          </p>
          <div className="hydration-error-actions">
            <button type="button" onClick={retryHydration} disabled={isResetting}>
              重新嘗試載入
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void resetLocalDatabaseAndReload()
              }}
              disabled={isResetting}
            >
              {isResetting ? '清空中…' : '清空本機資料後重建'}
            </button>
          </div>
          <p className="helper-text">
            注意：清空會移除本機案例、產品、文件附件，且不可復原。
            建議先於正常狀態下匯出 JSON 備份。
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell" data-active-tab={activeTab}>
      <a href="#main-content" className="skip-to-main">
        跳到主要內容
      </a>
      <div className="screen-only">
      <header className="app-header app-header-compact">
        <div className="app-header-main">
          <h1>錨栓檢討工具</h1>
          <button
            type="button"
            className="shortcut-help-trigger"
            onClick={() => setShowShortcutHelp(true)}
            title="顯示鍵盤快捷鍵（也可按 ?）"
            aria-label="顯示鍵盤快捷鍵說明"
          >
            ?
          </button>
          <span className="app-header-ref">
            <a href={activeRuleProfile.officialUrl} target="_blank" rel="noreferrer">
              {activeRuleProfile.chapter17Title}
            </a>
            <em>· {activeRuleProfile.versionLabel}</em>
          </span>
        </div>
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {false && (
        <div className="app-header-status-archived" style={{ display: 'none' }}>
          <p className="lede">
            依 <a href={activeRuleProfile.officialUrl} target="_blank" rel="noreferrer">{activeRuleProfile.name}</a>{' '}
            第17章進行預埋、膨脹與黏結式錨栓檢討。內部固定以 mm / kN / MPa 計算，畫面可切換成 cm / m / kgf / tf 顯示與輸入。
          </p>
        </div>
        )}
        <div className="app-header-status">
          <div className="status-chip">
            <span>案例</span>
            <div className="badge-row">
              <Badge status={batchReview.summary.overallStatus} />
              <Badge status={batchReview.summary.formalStatus} />
            </div>
          </div>
          <div
            className={`status-chip${isDirty ? ' status-chip-dirty' : ''}`}
            title={
              isDirty
                ? '有變更尚未寫入本機資料庫（約 0.5 秒內自動儲存）'
                : saveMessage
            }
            aria-live="polite"
            aria-atomic="true"
          >
            <span>同步</span>
            <strong className="status-chip-truncate">
              {isDirty ? '未儲存變更…' : saveMessage}
            </strong>
          </div>
          <div
            className="status-chip"
            title={
              latestAuditEntry
                ? `${auditSourceLabel(latestAuditEntry.source)} / ${formatDateTime(latestAuditEntry.createdAt)}`
                : '尚未留存；可手動留痕或於匯出報告時自動建立'
            }
          >
            <span>留痕</span>
            <strong>
              {latestAuditEntry ? formatAuditHash(latestAuditEntry.hash) : '尚未留存'}
            </strong>
          </div>
        </div>
      </header>

      <section className="toolbar">
        <div className="toolbar-group">
          <label>
            案例名稱
            <input
              value={project.name}
              onChange={(event) => patchProject({ name: event.target.value })}
            />
          </label>
          <label>
            規範版本
            <select
              value={project.ruleProfileId}
              onChange={(event) =>
                patchProject({
                  ruleProfileId: normalizeRuleProfileId(event.target.value),
                })
              }
            >
              {ruleProfileOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setActiveTab('report')}
            title="開啟案件樣板、案例庫、文件附件與匯出設定"
          >
            資源 / 樣板
          </button>
        </div>

        <div className="toolbar-group toolbar-export" data-shows="result report">
          <button type="button" onClick={() => shortcutHandlersRef.current.printReport()}>
            列印報表
          </button>
          <button type="button" onClick={() => {
            void openStandaloneReportWindow(false)
          }}>
            預覽報表
          </button>
          <button type="button" onClick={() => {
            void exportHtmlReport()
          }}>
            匯出 HTML
          </button>
          <button type="button" onClick={() => {
            void exportXlsxReport()
          }}>
            匯出 XLSX
          </button>
          <button type="button" onClick={() => {
            void exportDocxReport()
          }}>
            匯出 DOCX
          </button>
          <button type="button" className="secondary-button" onClick={() => {
            void recordCurrentAuditTrail('manual')
          }}>
            留存簽章
          </button>
        </div>

        <div className="toolbar-group toolbar-units">
          <label>
            長度
            <select
              value={unitPreferences.lengthUnit}
              onChange={(event) =>
                patchUi({ lengthUnit: event.target.value as LengthUnit })
              }
            >
              {(['mm', 'cm', 'm'] as LengthUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {getUnitOptionLabel(unit)}
                </option>
              ))}
            </select>
          </label>
          <label>
            面積
            <select
              value={unitPreferences.areaUnit}
              onChange={(event) =>
                patchUi({ areaUnit: event.target.value as AreaUnit })
              }
            >
              {(['mm2', 'cm2'] as AreaUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {getUnitOptionLabel(unit)}
                </option>
              ))}
            </select>
          </label>
          <label>
            力量
            <select
              value={unitPreferences.forceUnit}
              onChange={(event) =>
                patchUi({ forceUnit: event.target.value as ForceUnit })
              }
            >
              {(['kN', 'kgf', 'tf'] as ForceUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {getUnitOptionLabel(unit)}
                </option>
              ))}
            </select>
          </label>
          <label>
            應力
            <select
              value={unitPreferences.stressUnit}
              onChange={(event) =>
                patchUi({ stressUnit: event.target.value as StressUnit })
              }
            >
              {(['MPa', 'kgf_cm2'] as StressUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {getUnitOptionLabel(unit)}
                </option>
              ))}
            </select>
          </label>
          <label className="switch switch-inline">
            <input
              type="checkbox"
              checked={simpleMode}
              onChange={(event) =>
                patchUi({ simpleMode: event.target.checked })
              }
            />
            <span>簡化模式</span>
          </label>
        </div>

        <div className="toolbar-note" data-shows="report">
          <strong>規範唯一預設：</strong>
          <span>{activeRuleProfile.chapter17Title}</span>
          <span className="separator">/</span>
          <span>案例會凍結在目前 profileId</span>
        </div>
      </section>

      <nav
        className="workspace-tabs"
        role="tablist"
        aria-label="錨栓檢討分頁"
        onKeyDown={(event) => {
          // WAI-ARIA tablist：左右鍵切換、Home/End 跳首尾；其他 key 交還瀏覽器
          const currentIndex = WORKSPACE_TABS.findIndex(
            (item) => item.id === activeTab,
          )
          if (currentIndex < 0) {
            return
          }
          let nextIndex = currentIndex
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex =
              (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length
          } else if (event.key === 'Home') {
            nextIndex = 0
          } else if (event.key === 'End') {
            nextIndex = WORKSPACE_TABS.length - 1
          } else {
            return
          }
          event.preventDefault()
          const nextTab = WORKSPACE_TABS[nextIndex]
          setActiveTab(nextTab.id)
          setHasEnteredWorkspace(true)
          // 捲動 + focus 會透過 useEffect 自動處理，這裡額外確保新按鈕 focus
          window.requestAnimationFrame(() => {
            const next = document.querySelector<HTMLButtonElement>(
              `.workspace-tabs button[data-tab-id="${nextTab.id}"]`,
            )
            next?.focus({ preventScroll: false })
          })
        }}
      >
        {WORKSPACE_TABS.map((tab) => {
          const dimmed =
            (tab.id === 'seismic' && !project.loads.considerSeismic) ||
            (tab.id === 'baseplate' &&
              !project.layout.basePlateBearingEnabled &&
              !project.layout.basePlateBendingEnabled &&
              !project.layout.anchorReinforcementEnabled &&
              !project.layout.shearHairpinReinforcement)
          // Tab 標示：result tab 依整體判定顯示徽章；其他 tab 只在有錯時顯示
          let badge: { tone: 'fail' | 'warn' | 'pass'; label: string } | null =
            null
          if (tab.id === 'result') {
            const overall = batchReview.summary.overallStatus
            if (overall === 'fail') {
              badge = { tone: 'fail', label: '不合格' }
            } else if (overall === 'warning' || overall === 'screening') {
              badge = { tone: 'warn', label: overall === 'warning' ? '須注意' : '篩選' }
            } else if (overall === 'incomplete') {
              badge = { tone: 'warn', label: '待補' }
            } else if (overall === 'pass' && !completeness.formal) {
              badge = { tone: 'warn', label: '待補資料' }
            } else if (overall === 'pass') {
              badge = { tone: 'pass', label: 'OK' }
            }
          }
          const className = [
            activeTab === tab.id ? 'active' : '',
            dimmed && activeTab !== tab.id ? 'dimmed' : '',
            badge ? `tab-with-badge tab-badge-${badge.tone}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={className}
              onClick={() => {
                setActiveTab(tab.id)
                setHasEnteredWorkspace(true)
              }}
              title={
                dimmed
                  ? `${tab.hint}（尚未啟用，點擊進入 tab 後可在該頁勾選）`
                  : badge
                    ? `${tab.hint}｜狀態：${badge.label}`
                    : tab.hint
              }
            >
              <span>{tab.label}</span>
              {badge ? (
                <span className="tab-badge" aria-label={`狀態 ${badge.label}`}>
                  {badge.label}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="resource-library-wrapper" data-shows="report">
      <div className="resource-back-bar">
        <button
          type="button"
          className="primary-cta"
          onClick={() => {
            setActiveTab('member')
            setHasEnteredWorkspace(true)
          }}
        >
          {hasEnteredWorkspace ? '返回檢核工作台 →' : '開始檢核（進入構件／配置）→'}
        </button>
        {hasEnteredWorkspace ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setActiveTab('result')
            }}
          >
            返回結果頁
          </button>
        ) : null}
        <span className="resource-back-hint">
          {hasEnteredWorkspace
            ? '樣板、案例庫、文件附件可於此維護；完成後返回結果頁檢視與匯出。'
            : '首次使用可先從下方「案件樣板庫」套入典型情境，或於「案例庫」建立新案後開始檢核。'}
        </span>
        <span
          className="resource-back-active-case"
          title={`最後編修 ${formatDateTime(project.updatedAt)}`}
        >
          目前案例：<strong>{project.name || '未命名'}</strong>
          <em>
            DCR = {formatNumber(getGoverningDcr(batchReview.summary))} · 整體
            {' '}
            {statusLabel(batchReview.summary.overallStatus)}
          </em>
        </span>
      </div>
      <section className="workspace-backup-bar" aria-label="工作區備份">
        <div className="workspace-backup-info">
          <strong>工作區備份</strong>
          <span>
            匯出 JSON 將所有案例、產品與附件打包下載；還原可在另一台裝置重建。
          </span>
        </div>
        <div className="workspace-backup-actions">
          <button
            type="button"
            onClick={() => {
              void exportWorkspace()
            }}
          >
            匯出 JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={openImportDialog}
          >
            還原 JSON
          </button>
        </div>
      </section>
      {caseCards.length > 0 ? (
        <section className="recent-cases-panel" aria-label="最近編輯的案例">
          <div className="recent-cases-header">
            <h3>最近編輯的案例</h3>
            <span className="recent-cases-subtitle">
              點擊卡片直接載入並進入檢核工作台
            </span>
          </div>
          <div className="recent-cases-grid">
            {caseCards.slice(0, 3).map((item) => {
              const isActive = item.id === project.id
              return (
                <button
                  key={`recent-${item.id}`}
                  type="button"
                  className={`recent-case-card${isActive ? ' active' : ''}`}
                  onClick={() => {
                    if (!isActive) {
                      selectProject(item.id)
                    }
                    setActiveTab('member')
                    setHasEnteredWorkspace(true)
                  }}
                  title={`${item.name}｜最後編修 ${formatDateTime(item.updatedAt)}`}
                >
                  <span className="recent-case-name">
                    {item.name}
                    {isActive ? (
                      <span className="recent-case-active-badge">目前案例</span>
                    ) : null}
                  </span>
                  <span className="recent-case-meta">
                    {formatDateTime(item.updatedAt)}
                  </span>
                  <span className="recent-case-hint">
                    {isActive ? '繼續檢核 →' : '載入並進入檢核 →'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
      <ResourceLibraryHub
        activeTab={resourceLibraryTab}
        tabs={resourceLibraryTabs}
        onTabChange={(tabId) => {
          startTransition(() => {
            setResourceLibraryTab(tabId)
          })
        }}
      >
        {resourceLibraryTab === 'project_templates' ? (
          <Suspense
            fallback={
              <section className="case-library">
                <div className="panel-title">
                  <h2>案件樣板庫</h2>
                  <p>案件樣板載入中…</p>
                </div>
              </section>
            }
          >
            <ProjectTemplateLibrary
              loaded={true}
              filteredTemplates={filteredProjectTemplates}
              recommendations={recommendedProjectTemplates}
              filter={projectTemplateFilter}
              search={projectTemplateSearch}
              products={products}
              onFilterChange={setProjectTemplateFilter}
              onSearchChange={setProjectTemplateSearch}
              onApplyTemplate={(templateId) => {
                void loadProjectTemplate(templateId)
              }}
            />
          </Suspense>
        ) : null}
        {resourceLibraryTab === 'product_templates' ? (
          <Suspense fallback={<div className="helper-text">模板資料載入中…</div>}>
            <ProductTemplateLibrary
              simpleMode={simpleMode}
              templateCatalog={templateCatalog}
              filteredTemplates={filteredTemplates}
              availableTemplateCount={availableTemplates.length}
              templateFilter={templateFilter}
              templateSearch={templateSearch}
              unitPreferences={unitPreferences}
              onFilterChange={setTemplateFilter}
              onSearchChange={setTemplateSearch}
              onImportTemplate={(templateId) => {
                void importTemplate(templateId)
              }}
              onApplyTemplate={(templateId) => {
                void applyTemplate(templateId)
              }}
            />
          </Suspense>
        ) : null}
        {resourceLibraryTab === 'product_scan' ? (
          <Suspense fallback={<div className="helper-text">產品掃描中…</div>}>
            <ProductScanAssistant
              simpleMode={simpleMode}
              project={project}
              products={products}
              selectedProduct={selectedProduct}
              onAddCandidate={(productId) => {
                patchCandidateProducts([
                  ...(project.candidateProductIds ?? [project.selectedProductId]),
                  productId,
                ])
                const product = products.find((item) => item.id === productId)
                if (product) {
                  setSaveMessage(
                    `已加入候選比選：${product.brand} ${product.model}`,
                  )
                }
              }}
              onAddCandidates={(productIds) => {
                patchCandidateProducts([
                  ...(project.candidateProductIds ?? [project.selectedProductId]),
                  ...productIds,
                ])
                setSaveMessage(`已加入 ${productIds.length} 個產品到候選比選`)
              }}
            />
          </Suspense>
        ) : null}
      </ResourceLibraryHub>
      </div>

      <section className="panel case-library" data-shows="report">
        <div className="case-library-header">
          <div className="panel-title">
            <h2>案例庫</h2>
            <p>同一台裝置可離線保存多個錨栓檢核案，隨時切換與複製。</p>
          </div>
          <div className="case-actions">
            <button type="button" onClick={createProject}>
              新增案例
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={duplicateProject}
            >
              複製目前案例
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={resetCurrentProjectToDefaults}
              title="保留案例 ID / 名稱 / UI / 規範版本，其他欄位全部還原為預設"
            >
              還原為預設值
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={exportCurrentCase}
              title="僅匯出目前案例 + 選用/候選產品 + 該案附件"
            >
              匯出本案 JSON
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={deleteCurrentProject}
              disabled={projectLibrary.length === 1}
            >
              刪除目前案例
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void exportWorkspace()
              }}
            >
              匯出 JSON
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={openImportDialog}
            >
              匯入 JSON
            </button>
          </div>
        </div>

        <div className="case-count">
          目前共 {projectLibrary.length} 個案例，正在編輯：
          <strong> {project.name}</strong>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importWorkspace(event)
          }}
        />
        <input
          ref={loadCaseCsvInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            void importLoadCasesCsv(event)
          }}
        />

        <div className="case-grid">
          {caseCards.map((item) => {
            const cardProduct = products.find(
              (product) => product.id === item.selectedProductId,
            )

            return (
              <button
                key={item.id}
                type="button"
                className={`case-card ${item.id === activeProjectId ? 'active' : ''}`}
                onClick={() => selectProject(item.id)}
              >
                <div className="case-card-top">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.report?.projectCode || '未填案號'}</span>
                  </div>
                  <Badge status={item.snapshot?.overallStatus ?? 'warning'} />
                </div>
                <div className="case-card-meta">
                  <span>{cardProduct ? `${cardProduct.brand} ${cardProduct.model}` : '產品未指定'}</span>
                  <span>{item.snapshot?.governingMode ?? '尚未計算'}</span>
                  <span>{item.snapshot?.controllingLoadCaseName ? `控制組合 ${item.snapshot.controllingLoadCaseName}` : '單一組合'}</span>
                </div>
                <div className="case-card-footer">
                  <span>
                    控制 DCR {formatNumber(item.snapshot?.governingDcr ?? item.snapshot?.maxDcr ?? 0)}
                  </span>
                  <span>{formatDateTime(item.updatedAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="workspace" id="main-content" tabIndex={-1}>
        <section
          className="panel panel-input"
          data-shows="member product loads seismic baseplate"
        >
          <div className="panel-title" data-shows="member">
            <h2>構件 / 配置</h2>
            <p>混凝土基材（fc′、尺寸、裂縫 / 輕質 / Condition A-B）＋錨栓幾何（hef、陣列、間距、邊距）。</p>
          </div>
          <div className="panel-title" data-shows="product">
            <h2>選擇錨栓產品</h2>
            <p>切換目前產品，勾選候選清單並排比選多個錨栓型號。</p>
          </div>
          <div className="panel-title" data-shows="loads">
            <h2>載重輸入</h2>
            <p>N / V / M、偏心與受剪錨栓數；可展開下方管理載重組合批次與 CSV 匯入。</p>
          </div>
          <div className="panel-title" data-shows="seismic">
            <h2>耐震入口設定</h2>
            <p>17.10 地震份額、路徑選擇與韌性 / 附掛物降伏條件。</p>
          </div>
          <div className="panel-title" data-shows="baseplate">
            <h2>柱腳與基板</h2>
            <p>基板承壓、抗彎厚度、錨栓補強鋼筋替代路徑與剪力 U 型補強。</p>
          </div>

          <div className="field-grid">
            <label className="field-slot" data-shows="product">
              選定產品
              <select
                value={project.selectedProductId}
                onChange={(event) =>
                  patchProject({ selectedProductId: event.target.value })
                }
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {familyLabel(product.family)} / {product.brand} {product.model}
                  </option>
                ))}
              </select>
            </label>
            <details
              className="fold-panel sub-panel"
              data-shows="product"
              open={!simpleMode || candidateProducts.length > 1}
            >
              <summary className="fold-summary">
                <span>候選產品比選</span>
                <small>{candidateProducts.length} 個方案</small>
              </summary>
              <div className="fold-stack">
                <p className="helper-text">
                  可在同一案例下勾選多個產品並排比較；目前選定產品會自動納入，不可移除。
                </p>
                <div className="switch-grid">
                  {products.map((product) => {
                    const checked = (project.candidateProductIds ?? [project.selectedProductId]).includes(
                      product.id,
                    )
                    const locked = product.id === project.selectedProductId
                    return (
                      <label key={`candidate-${product.id}`} className="switch">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={(event) => {
                            const current = project.candidateProductIds ?? [project.selectedProductId]
                            patchCandidateProducts(
                              event.target.checked
                                ? [...current, product.id]
                                : current.filter((item) => item !== product.id),
                            )
                          }}
                        />
                        <span>
                          {familyLabel(product.family)} / {product.brand} {product.model}
                          {locked ? '（目前選定）' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </details>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="混凝土強度 f'c"
                quantity="stress"
                units={unitPreferences}
                value={project.layout.concreteStrengthMpa}
                onValueChange={(value) =>
                  patchLayout({ concreteStrengthMpa: value ?? 28 })
                }
                fallback={28}
                warning={
                  project.layout.concreteStrengthMpa < 17
                    ? "f'c 低於 17 MPa 不建議"
                    : project.layout.concreteStrengthMpa > 70
                      ? "f'c 超過 70 MPa 超出 Ch.17 適用範圍"
                      : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="構材厚度 ha"
                quantity="length"
                units={unitPreferences}
                value={project.layout.thicknessMm}
                onValueChange={(value) =>
                  patchLayout({ thicknessMm: value ?? 0 })
                }
                warning={
                  project.layout.thicknessMm <= 0
                    ? '構材厚度須大於 0'
                    : project.layout.thicknessMm <
                        1.5 * (project.layout.effectiveEmbedmentMm ?? 0)
                      ? 'ha < 1.5hef，將觸發 17.6.2.1.2 側面破壞檢核'
                      : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="混凝土寬度"
                quantity="length"
                units={unitPreferences}
                value={project.layout.concreteWidthMm}
                onValueChange={(value) =>
                  patchLayout({ concreteWidthMm: value ?? 0 })
                }
                warning={
                  project.layout.concreteWidthMm <= 0
                    ? '寬度須大於 0'
                    : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="混凝土高度"
                quantity="length"
                units={unitPreferences}
                value={project.layout.concreteHeightMm}
                onValueChange={(value) =>
                  patchLayout({ concreteHeightMm: value ?? 0 })
                }
                warning={
                  project.layout.concreteHeightMm <= 0
                    ? '高度須大於 0'
                    : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="有效埋置深度 hef"
                quantity="length"
                units={unitPreferences}
                value={project.layout.effectiveEmbedmentMm}
                onValueChange={(value) =>
                  patchLayout({ effectiveEmbedmentMm: value ?? 0 })
                }
                warning={
                  (project.layout.effectiveEmbedmentMm ?? 0) <= 0
                    ? 'hef 須大於 0（依產品 ETA 評估值填入）'
                    : null
                }
              />
            </div>
            <label className="field-slot" data-shows="member">
              錨栓列數 X
              <input
                type="number"
                min="1"
                value={project.layout.anchorCountX}
                onChange={(event) =>
                  patchLayout({ anchorCountX: Math.max(1, parseNumber(event.target.value, 1)) })
                }
              />
            </label>
            <label className="field-slot" data-shows="member">
              錨栓列數 Y
              <input
                type="number"
                min="1"
                value={project.layout.anchorCountY}
                onChange={(event) =>
                  patchLayout({ anchorCountY: Math.max(1, parseNumber(event.target.value, 1)) })
                }
              />
            </label>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="間距 sx"
                quantity="length"
                units={unitPreferences}
                value={project.layout.spacingXmm}
                onValueChange={(value) =>
                  patchLayout({ spacingXmm: value ?? 0 })
                }
                warning={
                  project.layout.anchorCountX > 1 && project.layout.spacingXmm <= 0
                    ? 'X 方向多錨栓時間距須大於 0'
                    : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="間距 sy"
                quantity="length"
                units={unitPreferences}
                value={project.layout.spacingYmm}
                onValueChange={(value) =>
                  patchLayout({ spacingYmm: value ?? 0 })
                }
                warning={
                  project.layout.anchorCountY > 1 && project.layout.spacingYmm <= 0
                    ? 'Y 方向多錨栓時間距須大於 0'
                    : null
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="左邊距"
                quantity="length"
                units={unitPreferences}
                value={project.layout.edgeLeftMm}
                onValueChange={(value) =>
                  patchLayout({ edgeLeftMm: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="右邊距"
                quantity="length"
                units={unitPreferences}
                value={project.layout.edgeRightMm}
                onValueChange={(value) =>
                  patchLayout({ edgeRightMm: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="下邊距"
                quantity="length"
                units={unitPreferences}
                value={project.layout.edgeBottomMm}
                onValueChange={(value) =>
                  patchLayout({ edgeBottomMm: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="member">
              <UnitNumberField
                label="上邊距"
                quantity="length"
                units={unitPreferences}
                value={project.layout.edgeTopMm}
                onValueChange={(value) =>
                  patchLayout({ edgeTopMm: value ?? 0 })
                }
              />
            </div>
            <details
              className="fold-panel sub-panel"
              data-shows="member result"
              open={!simpleMode || candidateLayoutVariants.length > 0}
            >
              <summary className="fold-summary">
                <span>候選配置比選</span>
                <small>{candidateLayoutVariants.length + 1} 個配置（含目前配置）</small>
              </summary>
              <div className="fold-stack">
                <p className="helper-text">
                  主畫面維持單一幾何輸入；可把目前配置存成候選，之後再套回來微調，並與其他配置一起比較。
                </p>
                <div className="action-row">
                  <button type="button" onClick={createLayoutVariantFromCurrent}>
                    加入目前配置為候選
                  </button>
                </div>
                {candidateLayoutVariants.length > 0 ? (
                  <table className="data-table compact-table">
                    <thead>
                      <tr>
                        <th>名稱</th>
                        <th>幾何摘要</th>
                        <th>備註</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateLayoutVariants.map((variant) => (
                        <tr key={variant.id}>
                          <td>
                            <input
                              value={variant.name}
                              onChange={(event) =>
                                patchLayoutVariantMeta(variant.id, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>{formatLayoutVariantSummary(variant.layout, unitPreferences)}</td>
                          <td>
                            <input
                              value={variant.note ?? ''}
                              placeholder="例如邊距放大 / hef 變更"
                              onChange={(event) =>
                                patchLayoutVariantMeta(variant.id, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <div className="action-row">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => applyLayoutVariantSelection(variant.id)}
                              >
                                套用
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  overwriteLayoutVariantFromCurrent(variant.id)
                                }
                              >
                                以目前覆寫
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => duplicateLayoutVariant(variant.id)}
                              >
                                複製
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => deleteLayoutVariant(variant.id)}
                              >
                                刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="helper-text">
                    目前尚未建立候選配置；可先把現在這組幾何存成候選，再修改主畫面繼續比較。
                  </p>
                )}
              </div>
            </details>
            <div className="load-case-panel">
              <div className="load-case-panel-header">
                <div>
                  <strong>載重組合</strong>
                  <small>可建立多組 N / V / M，批次取最不利控制組合。</small>
                </div>
                <div className="case-actions">
                  <button type="button" onClick={createLoadCase}>
                    新增組合
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={duplicateLoadCase}
                  >
                    複製組合
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={deleteActiveLoadCase}
                    disabled={loadCaseLibrary.length === 1}
                  >
                    刪除組合
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void exportLoadCasesCsv()}
                  >
                    匯出 CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openLoadCaseCsvImportDialog('append')}
                  >
                    匯入 CSV 附加
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openLoadCaseCsvImportDialog('replace')}
                  >
                    匯入 CSV 覆蓋
                  </button>
                </div>
              </div>
              <p className="helper-text">
                載重組合 CSV 固定使用內部單位 `kN / kN-m / mm`。可先匯出模板到
                Excel 編修，再用 `附加` 或 `覆蓋` 匯回工具；未提供的欄位會沿用目前組合的預設值。
              </p>
              <div className="load-case-strip">
                {loadCaseLibrary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`load-case-chip ${item.id === activeLoadCase.id ? 'active' : ''}`}
                    onClick={() => selectLoadCase(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      N {formatQuantity(item.loads.tensionKn, 'force', unitPreferences)}
                    </small>
                  </button>
                ))}
              </div>
              <div className="field-grid compact-grid load-case-meta-grid">
                <label>
                  目前組合名稱
                  <input
                    value={activeLoadCase.name}
                    onChange={(event) => renameActiveLoadCase(event.target.value)}
                  />
                </label>
                <div className="load-case-stat">
                  <span>批次控制組合</span>
                  <strong>{batchReview.controllingLoadCaseName}</strong>
                </div>
                <div className="load-case-stat">
                  <span>批次最大數值 DCR</span>
                  <strong>{formatNumber(batchReview.summary.maxDcr)}</strong>
                </div>
              </div>
              <details className="fold-panel sub-panel" data-shows="loads">
                <summary className="fold-summary">
                  <span>載重組合矩陣快速編輯</span>
                  <small>批次調整核心 N / V / M，不需逐一切換組合</small>
                </summary>
                <div className="fold-stack">
                  <p className="helper-text">
                    這裡適合快速調整每組的核心 `N / Vx / Vy / Mx / My`。
                    偏心、耐震路徑、受剪錨栓數等細部欄位仍以「目前組合」下方表單為主。
                  </p>
                  <div className="matrix-table-wrap">
                    <table className="matrix-edit-table">
                      <thead>
                        <tr>
                          <th>組合</th>
                          <th>N</th>
                          <th>Vx</th>
                          <th>Vy</th>
                          <th>Mx</th>
                          <th>My</th>
                          <th>目前編輯</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadCaseLibrary.map((item) => (
                          <tr
                            key={item.id}
                            className={item.id === activeLoadCase.id ? 'is-active' : undefined}
                          >
                            <td>
                              <div className="matrix-loadcase-name">
                                <strong>{item.name}</strong>
                                <small>
                                  {item.id === batchReview.controllingLoadCaseId
                                    ? '控制組合'
                                    : '批次組合'}
                                </small>
                              </div>
                            </td>
                            <td>
                              <input
                                type="number"
                                step={getInputStep('force', unitPreferences)}
                                value={formatInputQuantity(
                                  item.loads.tensionKn,
                                  'force',
                                  unitPreferences,
                                )}
                                onChange={(event) =>
                                  patchLoadCaseRow(item.id, {
                                    tensionKn: fromDisplayValue(
                                      parseNumber(event.target.value, 0),
                                      'force',
                                      unitPreferences,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={getInputStep('force', unitPreferences)}
                                value={formatInputQuantity(
                                  item.loads.shearXKn,
                                  'force',
                                  unitPreferences,
                                )}
                                onChange={(event) =>
                                  patchLoadCaseRow(item.id, {
                                    shearXKn: fromDisplayValue(
                                      parseNumber(event.target.value, 0),
                                      'force',
                                      unitPreferences,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={getInputStep('force', unitPreferences)}
                                value={formatInputQuantity(
                                  item.loads.shearYKn,
                                  'force',
                                  unitPreferences,
                                )}
                                onChange={(event) =>
                                  patchLoadCaseRow(item.id, {
                                    shearYKn: fromDisplayValue(
                                      parseNumber(event.target.value, 0),
                                      'force',
                                      unitPreferences,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={getInputStep('moment', unitPreferences)}
                                value={formatInputQuantity(
                                  item.loads.momentXKnM,
                                  'moment',
                                  unitPreferences,
                                )}
                                onChange={(event) =>
                                  patchLoadCaseRow(item.id, {
                                    momentXKnM: fromDisplayValue(
                                      parseNumber(event.target.value, 0),
                                      'moment',
                                      unitPreferences,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={getInputStep('moment', unitPreferences)}
                                value={formatInputQuantity(
                                  item.loads.momentYKnM,
                                  'moment',
                                  unitPreferences,
                                )}
                                onChange={(event) =>
                                  patchLoadCaseRow(item.id, {
                                    momentYKnM: fromDisplayValue(
                                      parseNumber(event.target.value, 0),
                                      'moment',
                                      unitPreferences,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => selectLoadCase(item.id)}
                              >
                                {item.id === activeLoadCase.id ? '正在編輯' : '切換'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>
            <details
              className="fold-panel sub-panel"
              data-shows="baseplate"
              open={!simpleMode || project.layout.basePlateBearingEnabled}
            >
              <summary className="fold-summary">
                <span>基板承壓檢核</span>
                <small>22.8 支承強度延伸檢核</small>
              </summary>
              <div className="fold-stack">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.basePlateBearingEnabled}
                    onChange={(event) =>
                      patchLayout({
                        basePlateBearingEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>啟用基板下混凝土承壓檢核</span>
                </label>
                <label>
                  偏心承壓斷面模數來源
                  <select
                    value={getBasePlateSectionType(project.layout)}
                    onChange={(event) =>
                      patchLayout({
                        basePlateSectionType: event.target
                          .value as BasePlateSectionType,
                      })
                    }
                  >
                    <option value="rectangle">矩形承壓區自動計算 Sx / Sy</option>
                    <option value="custom">自訂 Sx / Sy（非矩形基板）</option>
                  </select>
                </label>
                <div className="field-grid compact-grid">
                  <UnitNumberField
                    label="A1 承壓面積"
                    quantity="area"
                    units={unitPreferences}
                    value={project.layout.basePlateLoadedAreaMm2}
                    onValueChange={(value) =>
                      patchLayout({ basePlateLoadedAreaMm2: value ?? 0 })
                    }
                  />
                  <UnitNumberField
                    label="A2 支承面積"
                    quantity="area"
                    units={unitPreferences}
                    value={project.layout.basePlateSupportAreaMm2}
                    onValueChange={(value) =>
                      patchLayout({ basePlateSupportAreaMm2: value ?? 0 })
                    }
                  />
                  <UnitNumberField
                    label="承壓面寬 b1"
                    quantity="length"
                    units={unitPreferences}
                    value={project.layout.basePlateLoadedWidthMm ?? 0}
                    onValueChange={(value) =>
                      patchLayout({ basePlateLoadedWidthMm: value ?? 0 })
                    }
                  />
                  <UnitNumberField
                    label="承壓面高 h1"
                    quantity="length"
                    units={unitPreferences}
                    value={project.layout.basePlateLoadedHeightMm ?? 0}
                    onValueChange={(value) =>
                      patchLayout({ basePlateLoadedHeightMm: value ?? 0 })
                    }
                  />
                </div>
                <div className="field-grid compact-grid">
                  <UnitNumberField
                    label="基板平面寬 B"
                    quantity="length"
                    units={unitPreferences}
                    value={project.layout.basePlatePlanWidthMm ?? 0}
                    onValueChange={(value) =>
                      patchLayout({ basePlatePlanWidthMm: value ?? 0 })
                    }
                  />
                  <UnitNumberField
                    label="基板平面高 N"
                    quantity="length"
                    units={unitPreferences}
                    value={project.layout.basePlatePlanHeightMm ?? 0}
                    onValueChange={(value) =>
                      patchLayout({ basePlatePlanHeightMm: value ?? 0 })
                    }
                  />
                </div>
                {getBasePlateSectionType(project.layout) === 'custom' ? (
                  <div className="field-grid compact-grid">
                    <label>
                      <span className="label-row">
                        <span>自訂 Sx</span>
                        <span className="unit-chip">mm³</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1000"
                        value={String(project.layout.basePlateSectionModulusXmm3 ?? 0)}
                        onChange={(event) =>
                          patchLayout({
                            basePlateSectionModulusXmm3: parseNumber(
                              event.target.value.replaceAll(',', ''),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span className="label-row">
                        <span>自訂 Sy</span>
                        <span className="unit-chip">mm³</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1000"
                        value={String(project.layout.basePlateSectionModulusYmm3 ?? 0)}
                        onChange={(event) =>
                          patchLayout({
                            basePlateSectionModulusYmm3: parseNumber(
                              event.target.value.replaceAll(',', ''),
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                {(project.layout.basePlateLoadedWidthMm ?? 0) > 0 &&
                (project.layout.basePlateLoadedHeightMm ?? 0) > 0 ? (
                  <div className="fold-stack compact-stack">
                    <p className="helper-text">
                      目前 `b1 × h1` 回推 A1 =
                      {' '}
                      {formatQuantity(
                        (project.layout.basePlateLoadedWidthMm ?? 0) *
                          (project.layout.basePlateLoadedHeightMm ?? 0),
                        'area',
                        unitPreferences,
                      )}
                      。若 A1 留空，承壓模組會自動採這個值；若 A1 與此值不一致，結果會維持初篩提醒。
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          patchLayout({
                            basePlateLoadedAreaMm2:
                              (project.layout.basePlateLoadedWidthMm ?? 0) *
                              (project.layout.basePlateLoadedHeightMm ?? 0),
                          })
                        }
                      >
                        由 b1 × h1 回填 A1
                      </button>
                    </div>
                  </div>
                ) : null}
                <label>
                  支承圍束條件
                  <select
                    value={getBearingConfinementMode(project.layout)}
                    onChange={(event) => {
                      const nextMode = event.target
                        .value as BearingConfinementMode
                      patchLayout({
                        basePlateConfinementMode: nextMode,
                        basePlateConfinedOnAllSides: nextMode === 'full',
                      })
                    }}
                  >
                    <option value="none">無圍束放大</option>
                    <option value="partial">部分圍束（工程擴充，上限 1.5）</option>
                    <option value="full">完整圍束（22.8.3.2，上限 2.0）</option>
                  </select>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(project.layout.basePlateBearingMomentExternallyVerified)}
                    onChange={(event) =>
                      patchLayout({
                        basePlateBearingMomentExternallyVerified:
                          event.target.checked,
                      })
                    }
                  />
                  <span>若存在 Mx / My，已另行驗算偏心承壓分佈</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.basePlateBendingEnabled}
                    onChange={(event) =>
                      patchLayout({
                        basePlateBendingEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>啟用基板抗彎厚度檢核（AISC DG1 工程擴充）</span>
                </label>
                {project.layout.basePlateBendingEnabled ? (
                  <div className="fold-stack compact-stack">
                    <div className="field-grid compact-grid">
                      <UnitNumberField
                        label="基板實際厚度 tp"
                        quantity="length"
                        units={unitPreferences}
                        value={project.layout.basePlateThicknessMm}
                        onValueChange={(value) =>
                          patchLayout({
                            basePlateThicknessMm: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="基板鋼材 Fy"
                        quantity="stress"
                        units={unitPreferences}
                        value={project.layout.basePlateSteelYieldMpa}
                        onValueChange={(value) =>
                          patchLayout({
                            basePlateSteelYieldMpa: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="x 向懸臂長度 lx"
                        quantity="length"
                        units={unitPreferences}
                        value={project.layout.basePlateCantileverXmm}
                        onValueChange={(value) =>
                          patchLayout({
                            basePlateCantileverXmm: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="y 向懸臂長度 ly"
                        quantity="length"
                        units={unitPreferences}
                        value={project.layout.basePlateCantileverYmm}
                        onValueChange={(value) =>
                          patchLayout({
                            basePlateCantileverYmm: value ?? 0,
                          })
                        }
                      />
                    </div>
                    <label>
                      鋼柱斷面類型
                      <select
                        value={columnSectionType}
                        onChange={(event) =>
                          patchLayout({
                            columnSectionType: event.target
                              .value as ColumnSectionType,
                          })
                        }
                      >
                        <option value="manual">手動輸入 lx / ly</option>
                        <option value="i_h">I / H 形柱</option>
                        <option value="rect">矩形柱</option>
                        <option value="pipe">圓管 / 圓柱</option>
                      </select>
                    </label>
                    {columnSectionType !== 'manual' ? (
                      <div className="field-grid compact-grid">
                        <UnitNumberField
                          label={columnSectionType === 'pipe' ? '柱徑 d' : '柱深 d'}
                          quantity="length"
                          units={unitPreferences}
                          value={project.layout.columnDepthMm ?? 0}
                          onValueChange={(value) =>
                            patchLayout({
                              columnDepthMm: value ?? 0,
                            })
                          }
                        />
                        <UnitNumberField
                          label={
                            columnSectionType === 'pipe'
                              ? '柱徑 / 寬度 b'
                              : '柱寬 / 翼緣寬 bf'
                          }
                          quantity="length"
                          units={unitPreferences}
                          value={project.layout.columnFlangeWidthMm ?? 0}
                          onValueChange={(value) =>
                            patchLayout({
                              columnFlangeWidthMm: value ?? 0,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="field-grid compact-grid">
                      <UnitNumberField
                        label="柱心偏移 ex"
                        quantity="length"
                        units={unitPreferences}
                        value={project.layout.columnCentroidOffsetXmm ?? 0}
                        optional
                        onValueChange={(value) =>
                          patchLayout({
                            columnCentroidOffsetXmm: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="柱心偏移 ey"
                        quantity="length"
                        units={unitPreferences}
                        value={project.layout.columnCentroidOffsetYmm ?? 0}
                        optional
                        onValueChange={(value) =>
                          patchLayout({
                            columnCentroidOffsetYmm: value ?? 0,
                          })
                        }
                      />
                    </div>
                    {derivedBasePlateCantilevers ? (
                      <div className="fold-stack compact-stack">
                        <p className="helper-text">
                          目前可由 {columnSectionTypeLabel(columnSectionType)} 自動推算：
                          {' '}
                          {`m = ${formatQuantity(derivedBasePlateCantilevers.mMm, 'length', unitPreferences)}，n = ${formatQuantity(derivedBasePlateCantilevers.nMm, 'length', unitPreferences)}，λn' = ${formatQuantity(derivedBasePlateCantilevers.lambdaPrimeMm, 'length', unitPreferences)}，建議 lx = ${formatQuantity(derivedBasePlateCantilevers.xMm, 'length', unitPreferences)}，ly = ${formatQuantity(derivedBasePlateCantilevers.yMm, 'length', unitPreferences)}`}
                          。
                          {basePlatePlan.source === 'loaded_area'
                            ? ' 目前 B / N 尚未另填，暫以 b1 / h1 作為基板平面尺寸推算。'
                            : ''}
                        </p>
                        <div className="action-row">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={applyDerivedBasePlateCantilevers}
                          >
                            由柱斷面回填 lx / ly
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <p className="helper-text">
                      `lx / ly` 請輸入從鋼柱受壓邊或控制面到基板自由邊的懸臂長度，工具會取
                      `l = max(lx, ly)` 計算 `tp,min`。這一列屬 AISC DG1 工程擴充，不是第 17 章原始條文公式。
                    </p>
                    <p className="helper-text">
                      若輸入柱心偏移 `ex / ey`，工具會把軸壓 `N &lt; 0` 轉成附加彎矩
                      `ΔMy = N × ex`、`ΔMx = N × ey` 並併入基板承壓與基板抗彎檢核。
                    </p>
                  </div>
                ) : null}
                <p className="helper-text">
                  本模組目前以分析載重中的負拉力 `N &lt; 0` 作為軸向壓力需求，未納入基板偏心壓力分佈。`φ = 0.65`
                  由規範 profile 固定提供；若有 `Mx / My` 且已填 `b1 / h1`，工具會改用 `σ = N/A + Mx/Sx + My/Sy`
                  的保守偏心承壓應力檢核。
                </p>
                {getBasePlateSectionType(project.layout) === 'custom' ? (
                  <p className="helper-text">
                    目前採 `自訂 Sx / Sy` 路徑。`b1 / h1` 仍用來回推 A1、判讀 kern 與 uplift，
                    `Sx / Sy` 則請依實際基板幾何以 `mm³` 輸入；未填齊時，存在 `Mx / My`
                    的承壓結果會維持資料不足。
                  </p>
                ) : (
                  <p className="helper-text">
                    若採 `b1 / h1` 進入偏心承壓應力模式，工具目前假設承壓區為矩形並以 `Sx / Sy`
                    矩形斷面計算；非矩形基板或局部接觸形狀請切到 `自訂 Sx / Sy`
                    或另按實際幾何覆核。
                  </p>
                )}
              </div>
            </details>
            <details
              className="fold-panel sub-panel"
              data-shows="loads"
              open={!simpleMode}
            >
              <summary className="fold-summary">
                <span>載重組合 Preset</span>
                <small>D / L / E 一鍵展開常用組合</small>
              </summary>
              <div className="fold-stack">
                <p className="helper-text">
                  輸入死載 D、活載 L、地震分量 E 的 N / V / M 組件後，可一鍵產生
                  `1.2D+1.6L`、`1.2D±1.0E+1.0L`、`0.9D±1.0E`、`1.2D±ΩoE+1.0L`
                  、`0.9D±ΩoE`，若有填 `Ωattachment` 也會加上對應的
                  `ΩattachmentE` 組合。產生出的組合視為已明確組合之設計載重，
                  會自動清空 17.10 額外地震入口欄位，避免重複放大。
                </p>
                <div className="preset-component-grid">
                  <section className="preset-card">
                    <h4>死載 D</h4>
                    <div className="field-grid compact-grid">
                      <UnitNumberField
                        label="N"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.dead.tensionKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('dead', {
                            tensionKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vx"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.dead.shearXKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('dead', {
                            shearXKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vy"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.dead.shearYKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('dead', {
                            shearYKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Mx"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.dead.momentXKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('dead', {
                            momentXKnM: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="My"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.dead.momentYKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('dead', {
                            momentYKnM: value ?? 0,
                          })
                        }
                      />
                    </div>
                  </section>
                  <section className="preset-card">
                    <h4>活載 L</h4>
                    <div className="field-grid compact-grid">
                      <UnitNumberField
                        label="N"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.live.tensionKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('live', {
                            tensionKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vx"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.live.shearXKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('live', {
                            shearXKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vy"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.live.shearYKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('live', {
                            shearYKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Mx"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.live.momentXKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('live', {
                            momentXKnM: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="My"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.live.momentYKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('live', {
                            momentYKnM: value ?? 0,
                          })
                        }
                      />
                    </div>
                  </section>
                  <section className="preset-card">
                    <h4>地震分量 E</h4>
                    <div className="field-grid compact-grid">
                      <UnitNumberField
                        label="N"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.earthquake.tensionKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('earthquake', {
                            tensionKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vx"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.earthquake.shearXKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('earthquake', {
                            shearXKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Vy"
                        quantity="force"
                        units={unitPreferences}
                        value={loadPresetInput.earthquake.shearYKn}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('earthquake', {
                            shearYKn: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="Mx"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.earthquake.momentXKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('earthquake', {
                            momentXKnM: value ?? 0,
                          })
                        }
                      />
                      <UnitNumberField
                        label="My"
                        quantity="moment"
                        units={unitPreferences}
                        value={loadPresetInput.earthquake.momentYKnM}
                        onValueChange={(value) =>
                          patchLoadPresetComponent('earthquake', {
                            momentYKnM: value ?? 0,
                          })
                        }
                      />
                    </div>
                  </section>
                </div>
                <div className="field-grid compact-grid">
                  <label>
                    <span className="label-row">
                      <span>Ωo</span>
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={loadPresetInput.overstrengthFactor}
                      onChange={(event) =>
                        patchLoadPresetInput({
                          overstrengthFactor: Math.max(
                            1,
                            parseNumber(event.target.value, 1),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="label-row">
                      <span>Ωattachment</span>
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={loadPresetInput.attachmentOverstrengthFactor}
                      onChange={(event) =>
                        patchLoadPresetInput({
                          attachmentOverstrengthFactor: Math.max(
                            1,
                            parseNumber(event.target.value, 1),
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="action-row preset-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void applyLoadCasePreset('append')}
                  >
                    附加 Preset 組合
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyLoadCasePreset('replace')}
                  >
                    覆蓋目前組合
                  </button>
                </div>
                <details className="fold-panel sub-panel" data-shows="loads">
                  <summary className="fold-summary">
                    <span>Excel / CSV 貼上匯入</span>
                    <small>支援從 Excel 直接複製整塊表格貼上</small>
                  </summary>
                  <div className="fold-stack">
                    <p className="helper-text">
                      可直接從 Excel 複製含欄名的整塊表格貼到下方，工具會自動辨識
                      `Tab` 或 `CSV` 分隔。欄位固定使用內部單位 `kN / kN-m / mm`。
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void copyLoadCaseHeaderRow()
                        }}
                      >
                        複製欄名
                      </button>
                    </div>
                    <label>
                      貼上表格內容
                      <textarea
                        rows={8}
                        value={loadCasePasteText}
                        onChange={(event) => setLoadCasePasteText(event.target.value)}
                        placeholder={`${loadCaseDelimitedHeaderRow}\n${loadCaseDelimitedExampleRow}`}
                      />
                    </label>
                    <div className="action-row preset-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void importPastedLoadCases('append')}
                      >
                        貼上內容附加
                      </button>
                      <button
                        type="button"
                        onClick={() => void importPastedLoadCases('replace')}
                      >
                        貼上內容覆蓋
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </details>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label={usingSeparatedSeismicInput ? '靜載 / 非地震拉力 N' : '設計拉力 N'}
                quantity="force"
                units={unitPreferences}
                value={project.loads.tensionKn}
                onValueChange={(value) =>
                  patchLoads({ tensionKn: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label={usingSeparatedSeismicInput ? '靜載 / 非地震剪力 Vx' : '剪力 Vx'}
                quantity="force"
                units={unitPreferences}
                value={project.loads.shearXKn}
                onValueChange={(value) =>
                  patchLoads({ shearXKn: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label={usingSeparatedSeismicInput ? '靜載 / 非地震剪力 Vy' : '剪力 Vy'}
                quantity="force"
                units={unitPreferences}
                value={project.loads.shearYKn}
                onValueChange={(value) =>
                  patchLoads({ shearYKn: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label={usingSeparatedSeismicInput ? '靜載 / 非地震彎矩 Mx' : 'Mx'}
                quantity="moment"
                units={unitPreferences}
                value={project.loads.momentXKnM}
                onValueChange={(value) =>
                  patchLoads({ momentXKnM: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label={usingSeparatedSeismicInput ? '靜載 / 非地震彎矩 My' : 'My'}
                quantity="moment"
                units={unitPreferences}
                value={project.loads.momentYKnM}
                onValueChange={(value) =>
                  patchLoads({ momentYKnM: value ?? 0 })
                }
              />
            </div>
            <label className="field-slot" data-shows="loads">
              <span className="label-row">
                <span>受剪錨栓數</span>
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={
                  project.loads.shearAnchorCount &&
                  project.loads.shearAnchorCount > 0
                    ? project.loads.shearAnchorCount
                    : Math.abs(project.loads.shearXKn) > Math.abs(project.loads.shearYKn)
                      ? project.layout.anchorCountY
                      : Math.abs(project.loads.shearYKn) > Math.abs(project.loads.shearXKn)
                        ? project.layout.anchorCountX
                        : Math.max(
                            project.layout.anchorCountX,
                            project.layout.anchorCountY,
                          )
                }
                onChange={(event) =>
                  patchLoads({
                    shearAnchorCount: Math.max(
                      1,
                      parseNumber(event.target.value, 1),
                    ),
                  })
                }
              />
            </label>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label="剪力槓桿臂 e_v"
                quantity="length"
                units={unitPreferences}
                value={project.loads.shearLeverArmMm}
                optional
                onValueChange={(value) =>
                  patchLoads({ shearLeverArmMm: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label="剪力偏心 e'Vx"
                quantity="length"
                units={unitPreferences}
                value={project.loads.shearEccentricityXmm}
                optional
                onValueChange={(value) =>
                  patchLoads({ shearEccentricityXmm: value ?? 0 })
                }
              />
            </div>
            <div className="field-slot" data-shows="loads">
              <UnitNumberField
                label="剪力偏心 e'Vy"
                quantity="length"
                units={unitPreferences}
                value={project.loads.shearEccentricityYmm}
                optional
                onValueChange={(value) =>
                  patchLoads({ shearEccentricityYmm: value ?? 0 })
                }
              />
            </div>
          </div>

          <div className="switch-grid" data-shows="member seismic baseplate">
            <label className="switch" data-shows="member">
              <input
                type="checkbox"
                checked={project.layout.crackedConcrete}
                onChange={(event) =>
                  patchLayout({ crackedConcrete: event.target.checked })
                }
              />
              <span>開裂混凝土</span>
            </label>
            <label className="switch" data-shows="member">
              <input
                type="checkbox"
                checked={project.layout.supplementaryReinforcement}
                onChange={(event) =>
                  patchLayout({
                    supplementaryReinforcement: event.target.checked,
                  })
                }
              />
              <span>配置補強 / 錨定鋼筋</span>
            </label>
            <label className="switch" data-shows="baseplate">
              <input
                type="checkbox"
                checked={project.layout.shearHairpinReinforcement}
                onChange={(event) =>
                  patchLayout({
                    shearHairpinReinforcement: event.target.checked,
                  })
                }
              />
              <span>剪力 U 型補強鋼筋（需另依 17.7.2.5.1 配置細節覆核）</span>
            </label>
            <label className="switch" data-shows="member">
              <input
                type="checkbox"
                checked={project.layout.lightweightConcrete}
                onChange={(event) =>
                  patchLayout({ lightweightConcrete: event.target.checked })
                }
              />
              <span>輕質混凝土</span>
            </label>
            <label className="switch" data-shows="seismic">
              <input
                type="checkbox"
                checked={project.loads.considerSeismic}
                onChange={(event) =>
                  patchLoads(
                    event.target.checked
                      ? { considerSeismic: true }
                      : {
                          considerSeismic: false,
                          seismicInputMode: 'total_design',
                          designEarthquakeTensionKn: 0,
                          designEarthquakeShearKn: 0,
                          designEarthquakeShearXKn: 0,
                          designEarthquakeShearYKn: 0,
                          designEarthquakeMomentXKnM: 0,
                          designEarthquakeMomentYKnM: 0,
                          seismicDesignMethod: 'standard',
                          overstrengthFactor: 1,
                          ductileStretchLengthMm: 0,
                          ductileBucklingRestrained: false,
                          attachmentYieldTensionKn: 0,
                          attachmentYieldShearKn: 0,
                          attachmentOverstrengthFactor: 1,
                        },
                  )
                }
              />
              <span>納入 17.10 耐震入口</span>
            </label>
          </div>

          <details
            className="fold-panel sub-panel"
            data-shows="baseplate"
            open={!simpleMode || project.layout.anchorReinforcementEnabled}
          >
            <summary className="fold-summary">
              <span>錨栓補強鋼筋路徑</span>
              <small>17.5.2.1(d) / φ = 0.75</small>
            </summary>
            <div className="fold-stack">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={project.layout.anchorReinforcementEnabled}
                  onChange={(event) =>
                    patchLayout({
                      anchorReinforcementEnabled: event.target.checked,
                    })
                  }
                />
                <span>啟用錨栓補強鋼筋替代 breakout 路徑</span>
              </label>
              <div className="field-grid compact-grid">
                <UnitNumberField
                  label="補強鋼筋總面積 As"
                  quantity="area"
                  units={unitPreferences}
                  value={project.layout.anchorReinforcementAreaMm2}
                  onValueChange={(value) =>
                    patchLayout({ anchorReinforcementAreaMm2: value ?? 0 })
                  }
                />
                <UnitNumberField
                  label="補強鋼筋 fy"
                  quantity="stress"
                  units={unitPreferences}
                  value={project.layout.anchorReinforcementYieldMpa}
                  onValueChange={(value) =>
                    patchLayout({ anchorReinforcementYieldMpa: value ?? 0 })
                  }
                />
              </div>
              <div className="switch-grid">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.anchorReinforcementWithinHalfCa1}
                    onChange={(event) =>
                      patchLayout({
                        anchorReinforcementWithinHalfCa1: event.target.checked,
                      })
                    }
                  />
                  <span>補強鋼筋位於 0.5ca1 範圍內</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.anchorReinforcementIntersectsEachAnchor}
                    onChange={(event) =>
                      patchLayout({
                        anchorReinforcementIntersectsEachAnchor: event.target.checked,
                      })
                    }
                  />
                  <span>每支錨栓至少 1 根鋼筋與破壞面相交</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.anchorReinforcementDevelopedForTension}
                    onChange={(event) =>
                      patchLayout({
                        anchorReinforcementDevelopedForTension: event.target.checked,
                      })
                    }
                  />
                  <span>已覆核拉力 failure plane 兩側第25章伸展</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={project.layout.anchorReinforcementDevelopedForShear}
                    onChange={(event) =>
                      patchLayout({
                        anchorReinforcementDevelopedForShear: event.target.checked,
                      })
                    }
                  />
                  <span>已覆核剪力 failure plane 兩側第25章伸展</span>
                </label>
              </div>
              <p className="helper-text">
                依 17.5.2.1(d) 與 17.5.2.1.1，這裡的 As 指錨栓群周圍有效補強鋼筋總面積。若補強鋼筋跨越潛在破壞面、位於 0.5ca1 內、每支錨栓至少有 1 根鋼筋相交且已依第25章完成伸展覆核，可用 φ = 0.75 的鋼筋強度取代混凝土拉破或剪破強度。
              </p>
            </div>
          </details>

          <div className="field-grid compact-grid" data-shows="loads">
            <label>
              拉剪互制式
              <select
                value={project.loads.interactionEquation}
                onChange={(event) =>
                  patchLoads({
                    interactionEquation: event.target
                      .value as ProjectCase['loads']['interactionEquation'],
                  })
                }
              >
                <option value="linear">線性 / 1.2（預設保守）</option>
                <option value="power">5/3 次方</option>
              </select>
            </label>
          </div>

          <details
            className="fold-panel sub-panel"
            data-shows="seismic"
            open={!simpleMode || project.loads.considerSeismic}
          >
            <summary className="fold-summary">
              <span>耐震入口設定</span>
              <small>17.10 路徑與地震份額</small>
            </summary>
            <p className="helper-text">
              可切換兩種輸入方式：一種是上方 `N / V / M` 已含地震效應的總設計值；另一種是上方欄位只輸入靜載 / 非地震分量，由此區的地震分量自動組成 `1.0E` 或 `Ωo × E` 主檢核載重。
            </p>
            <div className="field-grid compact-grid">
              <label>
                地震份額輸入方式
                <select
                  value={project.loads.seismicInputMode ?? 'total_design'}
                  onChange={(event) =>
                    patchLoads({
                      seismicInputMode: event.target
                        .value as ProjectCase['loads']['seismicInputMode'],
                    })
                  }
                >
                  <option value="total_design">總設計值已含地震分量</option>
                  <option value="static_plus_earthquake">靜載 / 非地震分量 + 地震分量</option>
                </select>
              </label>
              <UnitNumberField
                label="地震拉力份額"
                quantity="force"
                units={unitPreferences}
                value={project.loads.designEarthquakeTensionKn}
                min={0}
                onValueChange={(value) =>
                  patchLoads({ designEarthquakeTensionKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="地震剪力 Ex"
                quantity="force"
                units={unitPreferences}
                value={project.loads.designEarthquakeShearXKn ?? 0}
                onValueChange={(value) =>
                  patchLoads({ designEarthquakeShearXKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="地震剪力 Ey"
                quantity="force"
                units={unitPreferences}
                value={project.loads.designEarthquakeShearYKn ?? 0}
                onValueChange={(value) =>
                  patchLoads({ designEarthquakeShearYKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="地震彎矩 Mx"
                quantity="moment"
                units={unitPreferences}
                value={project.loads.designEarthquakeMomentXKnM ?? 0}
                onValueChange={(value) =>
                  patchLoads({ designEarthquakeMomentXKnM: value ?? 0 })
                }
              />
              <UnitNumberField
                label="地震彎矩 My"
                quantity="moment"
                units={unitPreferences}
                value={project.loads.designEarthquakeMomentYKnM ?? 0}
                onValueChange={(value) =>
                  patchLoads({ designEarthquakeMomentYKnM: value ?? 0 })
                }
              />
              <label>
                設計方式
                <select
                  value={project.loads.seismicDesignMethod}
                  onChange={(event) =>
                    patchLoads({
                      seismicDesignMethod: event.target
                        .value as ProjectCase['loads']['seismicDesignMethod'],
                    })
                  }
                >
                  <option value="standard">未指定</option>
                  <option value="ductile_steel">韌性鋼材路徑</option>
                  <option value="attachment_yield">附掛物降伏路徑</option>
                  <option value="nonyielding_attachment">非降伏附掛物</option>
                  <option value="overstrength">Ωo 放大</option>
                </select>
              </label>
              <label>
                Ωo
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={project.loads.overstrengthFactor ?? 1}
                  onChange={(event) =>
                    patchLoads({
                      overstrengthFactor: Math.max(
                        1,
                        parseNumber(event.target.value, 1),
                      ),
                    })
                  }
                />
              </label>
              {project.loads.seismicDesignMethod === 'ductile_steel' ? (
                <>
                  <UnitNumberField
                    label="有效延性長度 ℓdu"
                    quantity="length"
                    units={unitPreferences}
                    value={project.loads.ductileStretchLengthMm ?? 0}
                    onValueChange={(value) =>
                      patchLoads({ ductileStretchLengthMm: value ?? 0 })
                    }
                  />
                  <label>
                    <span>受壓段防止挫屈</span>
                    <input
                      type="checkbox"
                      checked={Boolean(project.loads.ductileBucklingRestrained)}
                      onChange={(event) =>
                        patchLoads({
                          ductileBucklingRestrained: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>附掛物具足夠降伏機制</span>
                    <input
                      type="checkbox"
                      checked={Boolean(project.loads.ductileAttachmentMechanismVerified)}
                      onChange={(event) =>
                        patchLoads({
                          ductileAttachmentMechanismVerified:
                            event.target.checked,
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
              {project.loads.seismicDesignMethod === 'attachment_yield' ? (
                <>
                  <UnitNumberField
                    label="附掛物降伏可傳遞拉力"
                    quantity="force"
                    units={unitPreferences}
                    value={project.loads.attachmentYieldTensionKn ?? 0}
                    min={0}
                    onValueChange={(value) =>
                      patchLoads({ attachmentYieldTensionKn: value ?? 0 })
                    }
                  />
                  <UnitNumberField
                    label="附掛物降伏可傳遞剪力"
                    quantity="force"
                    units={unitPreferences}
                    value={project.loads.attachmentYieldShearKn ?? 0}
                    min={0}
                    onValueChange={(value) =>
                      patchLoads({ attachmentYieldShearKn: value ?? 0 })
                    }
                  />
                  <label>
                    附掛物降伏互制
                    <select
                      value={project.loads.attachmentYieldInteractionEquation ?? 'none'}
                      onChange={(event) =>
                        patchLoads({
                          attachmentYieldInteractionEquation: event.target
                            .value as ProjectCase['loads']['attachmentYieldInteractionEquation'],
                        })
                      }
                    >
                      <option value="none">不加互制</option>
                      <option value="linear">線性 / 1.2</option>
                      <option value="power">5/3 次方</option>
                    </select>
                  </label>
                </>
              ) : null}
              {project.loads.seismicDesignMethod === 'nonyielding_attachment' ? (
                <label>
                  Ωattachment
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={project.loads.attachmentOverstrengthFactor ?? 1}
                    onChange={(event) =>
                      patchLoads({
                        attachmentOverstrengthFactor: Math.max(
                          1,
                          parseNumber(event.target.value, 1),
                        ),
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
            {seismicRouteGuidance ? (
              <article
                className={`route-guidance-card route-guidance-card-${seismicRouteGuidance.state}`}
              >
                <div className="route-guidance-header">
                  <div>
                    <strong>{seismicRouteGuidance.title}</strong>
                    <small>{seismicRouteGuidance.clause}</small>
                  </div>
                  <Badge
                    status={getSeismicGuidanceBadgeStatus(seismicRouteGuidance.state)}
                  />
                </div>
                <p className="helper-text">{seismicRouteGuidance.summary}</p>
                <p className="route-state-note">
                  <strong>目前路徑狀態：</strong>
                  {seismicRouteGuidance.stateMessage}
                </p>
                <div className="route-readiness-section">
                  <h3>五條路徑 readiness</h3>
                  <div className="route-readiness-grid">
                    {seismicRouteGuidance.routeMatrix.map((route) => (
                      <article
                        key={route.method}
                        className={`route-readiness-card route-readiness-card-${route.state}${route.isCurrent ? ' route-readiness-card-current' : ''}`}
                      >
                        <div className="route-readiness-head">
                          <div>
                            <strong>{route.title}</strong>
                            <small>
                              {route.clause}
                              {route.isCurrent ? ' / 目前路徑' : ''}
                            </small>
                          </div>
                          <Badge status={getSeismicGuidanceBadgeStatus(route.state)} />
                        </div>
                        <div
                          className="route-readiness-bar"
                          aria-label={`${route.title} readiness ${Math.round(route.readinessScore * 100)}%`}
                        >
                          <span
                            style={{
                              width: `${Math.max(6, Math.round(route.readinessScore * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="helper-text">
                          {route.readinessLabel} / {Math.round(route.readinessScore * 100)}%
                        </p>
                        <p className="helper-text">
                          待補輸入 {route.missingInputCount} 項
                          {route.configurationIssueCount > 0
                            ? `，配置限制 ${route.configurationIssueCount} 項`
                            : '，目前無額外配置限制'}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="route-guidance-grid">
                  <div>
                    <h3>條件清單</h3>
                    <ul className="reference-list">
                      {seismicRouteGuidance.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>目前缺漏</h3>
                    {seismicRouteGuidance.missing.length > 0 ? (
                      <ul className="alert-list">
                        {seismicRouteGuidance.missing.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ok-note">目前這條路徑所需的額外輸入已齊備。</p>
                    )}
                  </div>
                  <div>
                    <h3>建議路徑</h3>
                    {seismicRouteGuidance.recommendation ? (
                      <div className="route-recommendation">
                        <p>
                          <strong>{seismicRouteGuidance.recommendation.title}</strong>
                          {`：${seismicRouteGuidance.recommendation.reason}`}
                          {seismicRouteGuidance.recommendation.method ===
                          project.loads.seismicDesignMethod
                            ? '（與目前選定路徑相同）'
                            : ''}
                        </p>
                        {seismicRouteGuidance.recommendation.method !==
                        project.loads.seismicDesignMethod ? (
                          <div className="action-row">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={applyRecommendedSeismicRoute}
                            >
                              套用建議路徑
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="helper-text">
                        目前沒有額外推薦路徑，可維持現行設定繼續檢核。
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ) : (
              <article className="route-guidance-card route-guidance-card-needs_input">
                <p className="helper-text">正在載入耐震路徑建議…</p>
              </article>
            )}
          </details>

          <details
            className="fold-panel sub-panel"
            data-shows="report"
            open={!simpleMode}
          >
            <summary className="fold-summary">
              <span>報表設定</span>
              <small>公司、案號、設計 / 校核與輸出模式</small>
            </summary>
            <div className="field-grid">
              <label>
                公司 / 單位
                <input
                  value={reportSettings.companyName}
                  placeholder="例如 XX 結構技師事務所"
                  onChange={(event) =>
                    patchReport({ companyName: event.target.value })
                  }
                />
              </label>
              <label>
                案號 / 專案代碼
                <input
                  value={reportSettings.projectCode}
                  placeholder="例如 P-2026-014"
                  onChange={(event) =>
                    patchReport({ projectCode: event.target.value })
                  }
                />
              </label>
              <label>
                設計者
                <input
                  value={reportSettings.designer}
                  placeholder="例如 王大明"
                  onChange={(event) =>
                    patchReport({ designer: event.target.value })
                  }
                />
              </label>
              <label>
                校核者
                <input
                  value={reportSettings.checker}
                  placeholder="例如 李小華"
                  onChange={(event) =>
                    patchReport({ checker: event.target.value })
                  }
                />
              </label>
              <label>
                發行日期
                <input
                  type="date"
                  value={reportSettings.issueDate}
                  onChange={(event) =>
                    patchReport({ issueDate: event.target.value })
                  }
                />
              </label>
              <label>
                輸出模式
                <select
                  value={reportSettings.reportMode}
                  onChange={(event) =>
                    patchReport({
                      reportMode: event.target.value as ReportMode,
                    })
                  }
                >
                  <option value="full">完整明細版</option>
                  <option value="summary">摘要版</option>
                </select>
              </label>
            </div>
            <p className="helper-text">
              摘要版列印時只保留控制檢核與例外尺寸；完整明細版會附上逐項條文與產品證據對照。
            </p>
          </details>

          <details
            className="fold-panel sub-panel"
            data-shows="report"
            open={!simpleMode || caseDocuments.length > 0}
          >
            <summary className="fold-summary">
              <span>案例附件 / 文件管理</span>
              <small>離線保存 PDF、圖片與佐證檔</small>
            </summary>
            <div className="sub-panel-header">
              <div>
                <p className="helper-text">
                  已上傳的案例文件會保存在本機 IndexedDB，也能在證據欄位直接選用文件名稱。
                </p>
              </div>
              <div className="document-upload-row">
                <label className="document-kind-field">
                  文件類型
                  <select
                    value={pendingDocumentKind}
                    onChange={(event) =>
                      setPendingDocumentKind(
                        event.target.value as ProjectDocumentKind,
                      )
                    }
                  >
                    {(
                      [
                        'eta',
                        'catalog',
                        'drawing',
                        'calculation',
                        'photo',
                        'other',
                      ] as ProjectDocumentKind[]
                    ).map((kind) => (
                      <option key={kind} value={kind}>
                        {documentKindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={openDocumentDialog}>
                  上傳文件
                </button>
              </div>
            </div>

            <input
              ref={documentInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                void uploadCaseDocuments(event)
              }}
            />

            {previewDocumentMeta ? (
              <article className="document-preview-panel">
                <div className="document-preview-head">
                  <div>
                    <h4>文件預覽</h4>
                    <p className="helper-text">
                      {previewDocumentMeta.name} /{' '}
                      {documentKindLabel(previewDocumentMeta.kind)} /{' '}
                      {previewDocumentMeta.fileName}
                    </p>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void openCaseDocument(previewDocumentMeta.id)
                      }}
                    >
                      新分頁開啟
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={clearPreviewDocument}
                    >
                      收起預覽
                    </button>
                  </div>
                </div>

                {previewDocumentError ? (
                  <p className="helper-text">{previewDocumentError}</p>
                ) : previewDocumentFile && previewDocumentUrl ? (
                  previewDocumentFile.mimeType.startsWith('image/') ? (
                    <img
                      className="document-preview-image"
                      src={previewDocumentUrl}
                      alt={previewDocumentMeta.name}
                    />
                  ) : previewDocumentFile.mimeType === 'application/pdf' ? (
                    <iframe
                      className="document-preview-frame"
                      src={previewDocumentUrl}
                      title={previewDocumentMeta.name}
                    />
                  ) : (
                    <div className="document-preview-fallback">
                      <p className="helper-text">
                        這個檔案類型目前不提供內嵌預覽，可以用新分頁開啟或直接下載。
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void downloadCaseDocument(previewDocumentMeta.id)
                        }}
                      >
                        下載附件
                      </button>
                    </div>
                  )
                ) : (
                  <p className="helper-text">正在載入文件預覽…</p>
                )}
              </article>
            ) : null}

            {caseDocuments.length > 0 ? (
              <div className="document-grid">
                {caseDocuments.map((document) => (
                  <article key={document.id} className="document-card">
                    <div className="document-card-top">
                      <div>
                        <h4>{document.name}</h4>
                        <p className="helper-text">
                          {documentKindLabel(document.kind)} / {document.fileName} /{' '}
                          {formatFileSize(document.sizeBytes)}
                        </p>
                      </div>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={document.verified}
                          onChange={(event) =>
                            patchProjectDocument(document.id, {
                              verified: event.target.checked,
                            })
                          }
                        />
                        已核對
                      </label>
                    </div>

                    <div className="field-grid">
                      <label>
                        文件名稱
                        <input
                          value={document.name}
                          onChange={(event) =>
                            patchProjectDocument(document.id, {
                              name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        文件類型
                        <select
                          value={document.kind}
                          onChange={(event) =>
                            patchProjectDocument(document.id, {
                              kind: event.target.value as ProjectDocumentKind,
                            })
                          }
                        >
                          {(
                            [
                              'eta',
                              'catalog',
                              'drawing',
                              'calculation',
                              'photo',
                              'other',
                            ] as ProjectDocumentKind[]
                          ).map((kind) => (
                            <option key={kind} value={kind}>
                              {documentKindLabel(kind)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="notes-field">
                      文件備註
                      <textarea
                        value={document.note}
                        placeholder="記錄此文件的用途，例如 ETA 表號、型錄版本或施工現況"
                        onChange={(event) =>
                          patchProjectDocument(document.id, {
                            note: event.target.value,
                          })
                        }
                      />
                    </label>

                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          previewCaseDocument(document.id)
                        }}
                      >
                        預覽
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void openCaseDocument(document.id)
                        }}
                      >
                        新分頁
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void downloadCaseDocument(document.id)
                        }}
                      >
                        下載
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void deleteCaseDocument(document.id)
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="helper-text">
                目前這個案例還沒有附件。你可以先上傳 ETA、型錄、圖面或現場照片，後續證據欄位就能直接引用。
              </p>
            )}
          </details>

          <div className="legacy-panel" data-shows="report">
            <h3>單位預覽</h3>
            <p>內部固定以 mm / kN / MPa 計算；畫面依你選的單位即時換算。`kg` 介面以 `kgf` 顯示。</p>
            <ul>
              <li>目前長度輸入 / 顯示單位：{getUnitSymbol('length', unitPreferences)}</li>
              <li>目前面積輸入 / 顯示單位：{getUnitSymbol('area', unitPreferences)}</li>
              <li>目前力量輸入 / 顯示單位：{getUnitSymbol('force', unitPreferences)}</li>
              <li>目前應力輸入 / 顯示單位：{getUnitSymbol('stress', unitPreferences)}</li>
              <li>{usingSeparatedSeismicInput ? '靜載 / 非地震拉力 N' : '設計拉力 N'} = {formatQuantity(project.loads.tensionKn, 'force', unitPreferences)}</li>
              <li>{usingSeparatedSeismicInput ? '靜載 / 非地震合成剪力 V' : '合成剪力 V'} = {formatQuantity(Math.hypot(project.loads.shearXKn, project.loads.shearYKn), 'force', unitPreferences)}</li>
            </ul>
          </div>
        </section>

        <section className="panel panel-geometry" data-shows="member product loads seismic baseplate result">
          <div className="panel-title geometry-title-main">
            <h2>配置預覽</h2>
            <p>SVG 顯示群錨配置、1.5hef 投影、控制自由邊與錨栓拉 / 壓色碼（所有頁面同步）。</p>
          </div>
          <div className="panel-title" data-shows="product">
            <h2>產品資料庫</h2>
            <p>維護產品清單、切換目前產品，並於下方填入或覆核產品評估值。</p>
          </div>

          <div className="geometry-block">
            <GeometrySketch review={review} units={unitPreferences} />

            <div className="geometry-metrics">
              <div className="metric-box">
                <span>錨栓數量</span>
                <strong>{review.anchorPoints.length}</strong>
              </div>
              <div className="metric-box">
                <span>批次最大 DCR</span>
                <strong>{formatNumber(batchReview.summary.maxDcr)}</strong>
              </div>
              <div className="metric-box">
                <span>控制組合</span>
                <strong>{batchReview.controllingLoadCaseName}</strong>
              </div>
              <div className="metric-box">
                <span>補強鋼筋</span>
                <strong>{project.layout.anchorReinforcementEnabled ? '已啟用' : '未啟用'}</strong>
              </div>
            </div>
          </div>

          <div className="sub-panel product-panel" data-shows="product">
            <div className="sub-panel-header">
              <h3>產品資料庫</h3>
              <div className="action-row">
                <button type="button" onClick={createProduct}>
                  新增
                </button>
                <button type="button" onClick={duplicateSelectedProduct}>
                  複製
                </button>
                <button type="button" onClick={deleteSelectedProduct}>
                  刪除
                </button>
              </div>
            </div>

            <div className="product-search-row">
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="搜尋品牌 / 型號 / 類型…"
                aria-label="搜尋產品"
              />
              {productSearch ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setProductSearch('')}
                  aria-label="清除搜尋"
                >
                  清除
                </button>
              ) : null}
              <span className="product-count-hint">
                {productSearch
                  ? `${products.filter((p) => productMatchesSearch(p, productSearch)).length} / ${products.length}`
                  : `${products.length} 個產品`}
              </span>
            </div>

            <div className="product-list">
              {products
                .filter((product) => productMatchesSearch(product, productSearch))
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={`product-pill ${product.id === selectedProduct.id ? 'active' : ''}`}
                    onClick={() => patchProject({ selectedProductId: product.id })}
                  >
                    <span>{familyLabel(product.family)}</span>
                    <strong>{product.brand} {product.model}</strong>
                  </button>
                ))}
              {productSearch &&
              products.filter((p) => productMatchesSearch(p, productSearch)).length === 0 ? (
                <div className="helper-text">
                  無符合搜尋的產品；試試更短關鍵字或清除搜尋。
                </div>
              ) : null}
            </div>

            <div className="field-grid compact-grid">
              <label>
                類型
                <select
                  value={selectedProduct.family}
                  onChange={(event) =>
                    patchSelectedProduct({
                      family: event.target.value as AnchorProduct['family'],
                    })
                  }
                >
                  <option value="cast_in">預埋錨栓</option>
                  <option value="post_installed_expansion">後置膨脹錨栓</option>
                  <option value="post_installed_bonded">後置黏結式錨栓</option>
                </select>
              </label>
              <label>
                安裝行為
                <select
                  value={selectedProduct.installationBehavior}
                  onChange={(event) =>
                    patchSelectedProduct({
                      installationBehavior: event.target.value as AnchorProduct['installationBehavior'],
                    })
                  }
                >
                  <option value="not_torqued">未扭緊</option>
                  <option value="torqued">預埋扭緊</option>
                  <option value="torque_controlled">扭力控制型</option>
                  <option value="displacement_controlled">位移控制型</option>
                  <option value="bonded">黏結式</option>
                </select>
              </label>
              <label>
                品牌
                <input
                  value={selectedProduct.brand}
                  onChange={(event) =>
                    patchSelectedProduct({ brand: event.target.value })
                  }
                />
              </label>
              <label>
                型號
                <input
                  value={selectedProduct.model}
                  onChange={(event) =>
                    patchSelectedProduct({ model: event.target.value })
                  }
                />
              </label>
              <UnitNumberField
                label="直徑 da"
                quantity="length"
                units={unitPreferences}
                value={selectedProduct.diameterMm}
                onValueChange={(value) =>
                  patchSelectedProduct({
                    diameterMm: value ?? 0,
                  })
                }
              />
              <UnitNumberField
                label="有效面積 Ase"
                quantity="area"
                units={unitPreferences}
                value={selectedProduct.effectiveAreaMm2}
                onValueChange={(value) =>
                  patchSelectedProduct({
                    effectiveAreaMm2: value ?? 0,
                  })
                }
              />
              <UnitNumberField
                label="fy"
                quantity="stress"
                units={unitPreferences}
                value={selectedProduct.steelYieldStrengthMpa}
                onValueChange={(value) =>
                  patchSelectedProduct({
                    steelYieldStrengthMpa: value ?? 0,
                  })
                }
              />
              <UnitNumberField
                label="fu"
                quantity="stress"
                units={unitPreferences}
                value={selectedProduct.steelUltimateStrengthMpa}
                onValueChange={(value) =>
                  patchSelectedProduct({
                    steelUltimateStrengthMpa: value ?? 0,
                  })
                }
              />
            </div>

            <details
              className="fold-panel sub-panel"
              data-shows="product"
              open={!simpleMode}
            >
              <summary className="fold-summary">
                <span>產品評估值</span>
                <small>評估標準、幾何限制、拉出 / 握裹值</small>
              </summary>
              <div className="field-grid compact-grid">
                <UnitNumberField
                  label="Abrg"
                  quantity="area"
                  units={unitPreferences}
                  value={selectedProduct.headBearingAreaMm2}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProduct({
                      headBearingAreaMm2: value,
                    })
                  }
                />
                <label>
                  評估標準
                  <select
                    value={selectedProduct.evaluation.qualificationStandard ?? ''}
                    onChange={(event) =>
                      patchSelectedProductEvaluation({
                        qualificationStandard: event.target.value
                          ? (event.target.value as AnchorProduct['evaluation']['qualificationStandard'])
                          : undefined,
                      })
                    }
                  >
                    <option value="">未填</option>
                    <option value="ACI_355_2">ACI 355.2</option>
                    <option value="ACI_355_4">ACI 355.4</option>
                    <option value="EAD_330232_00_0601">EAD 330232-00-0601</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
                <label>
                  後置錨栓分類
                  <select
                    value={selectedProduct.evaluation.anchorCategory ?? ''}
                    onChange={(event) =>
                      patchSelectedProductEvaluation({
                        anchorCategory: event.target.value
                          ? (Number(event.target.value) as 1 | 2 | 3)
                          : undefined,
                      })
                    }
                  >
                    <option value="">未填</option>
                    <option value="1">分類 1</option>
                    <option value="2">分類 2</option>
                    <option value="3">分類 3</option>
                  </select>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={selectedProduct.evaluation.crackedConcreteQualified ?? false}
                    onChange={(event) =>
                      patchSelectedProductEvaluation({
                        crackedConcreteQualified: event.target.checked,
                      })
                    }
                  />
                  <span>產品已覆核開裂混凝土</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={selectedProduct.evaluation.uncrackedConcreteQualified ?? false}
                    onChange={(event) =>
                      patchSelectedProductEvaluation({
                        uncrackedConcreteQualified: event.target.checked,
                      })
                    }
                  />
                  <span>產品已覆核未開裂混凝土</span>
                </label>
                <label>
                  kc,uncr / kc,cr
                  <input
                    type="number"
                    min="1"
                    max="1.4"
                    step="0.01"
                    value={selectedProduct.evaluation.kcUncrackedRatio ?? ''}
                    onChange={(event) =>
                      patchSelectedProductEvaluation({
                        kcUncrackedRatio: event.target.value
                          ? Math.min(1.4, Math.max(1, parseNumber(event.target.value, 1)))
                          : undefined,
                      })
                    }
                  />
                </label>
                <UnitNumberField
                  label="cmin"
                  quantity="length"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.minEdgeDistanceMm}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      minEdgeDistanceMm: value,
                    })
                  }
                />
                <UnitNumberField
                  label="smin"
                  quantity="length"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.minSpacingMm}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      minSpacingMm: value,
                    })
                  }
                />
                <UnitNumberField
                  label="hmin"
                  quantity="length"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.minThicknessMm}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      minThicknessMm: value,
                    })
                  }
                />
                <UnitNumberField
                  label="開裂拉出破壞強度"
                  quantity="force"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.crackedPulloutStrengthKn}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      crackedPulloutStrengthKn: value,
                    })
                  }
                />
                <UnitNumberField
                  label="未開裂拉出破壞強度"
                  quantity="force"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.uncrackedPulloutStrengthKn}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      uncrackedPulloutStrengthKn: value,
                    })
                  }
                />
                <UnitNumberField
                  label="開裂握裹強度"
                  quantity="stress"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.crackedBondStressMpa}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      crackedBondStressMpa: value,
                    })
                  }
                />
                <UnitNumberField
                  label="未開裂握裹強度"
                  quantity="stress"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.uncrackedBondStressMpa}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      uncrackedBondStressMpa: value,
                    })
                  }
                />
                <UnitNumberField
                  label="臨界邊距 cac"
                  quantity="length"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.criticalEdgeDistanceMm}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      criticalEdgeDistanceMm: value,
                    })
                  }
                />
                <UnitNumberField
                  label="劈裂臨界邊距 cac,split"
                  quantity="length"
                  units={unitPreferences}
                  value={selectedProduct.evaluation.splittingCriticalEdgeDistanceMm}
                  optional
                  onValueChange={(value) =>
                    patchSelectedProductEvaluation({
                      splittingCriticalEdgeDistanceMm: value,
                    })
                  }
                />
              </div>
            </details>

            <details
              className="fold-panel sub-panel"
              data-shows="product"
              open={!simpleMode}
            >
              <summary className="fold-summary">
                <span>產品描述與來源</span>
                <small>說明、文件來源與備註</small>
              </summary>
              <div className="field-grid">
                <label className="notes-field">
                  產品描述
                  <textarea
                    value={selectedProduct.description}
                    onChange={(event) =>
                      patchSelectedProduct({ description: event.target.value })
                    }
                  />
                </label>
                <label className="notes-field">
                  資料來源
                  <textarea
                    value={selectedProduct.source}
                    onChange={(event) =>
                      patchSelectedProduct({ source: event.target.value })
                    }
                  />
                </label>
              </div>

              <label className="notes-field">
                評估與備註
                <textarea
                  value={selectedProduct.notes}
                  onChange={(event) =>
                    patchSelectedProduct({ notes: event.target.value })
                  }
                />
              </label>
            </details>

            <div className="sub-panel">
              <h3>正式判定待補欄位</h3>
              {completeness.formal ? (
                <p className="ok-note">目前欄位已足以進入 v1 正式判定。</p>
              ) : (
                <>
                  <p className="helper-text">
                    下面這些欄位還沒補齊，所以目前結果仍會維持在「初篩 / 需補資料」狀態。
                  </p>
                  <ul className="template-highlights">
                    {completeness.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <details
              className="fold-panel sub-panel"
              data-shows="product"
              open={!simpleMode}
            >
              <summary className="fold-summary">
                <span>ETA / ICC / 型錄欄位對照</span>
                <small>文件頁碼、表號、核對狀態</small>
              </summary>
              <div className="sub-panel-header">
                <div>
                  <p className="helper-text">
                    每個正式判定欄位都可以掛上文件名稱、頁碼或表號，以及核對狀態，方便之後回查。
                  </p>
                </div>
                <div className="evidence-toolbar">
                  <div className="badge-row">
                    <span className="template-verified">已填值 {evidenceCoverage.withValue}/{evidenceCoverage.total}</span>
                    <span className="template-verified">已掛來源 {evidenceCoverage.withEvidence}/{evidenceCoverage.total}</span>
                    <span className="template-verified">已核對 {evidenceCoverage.verified}/{evidenceCoverage.total}</span>
                  </div>
                  <div className="evidence-filter-row">
                    <label className="document-kind-field">
                      附件類型
                      <select
                        value={evidenceDocumentKindFilter}
                        onChange={(event) =>
                          setEvidenceDocumentKindFilter(
                            event.target.value as 'all' | ProjectDocumentKind,
                          )
                        }
                      >
                        <option value="all">全部附件</option>
                        {(
                          [
                            'eta',
                            'catalog',
                            'drawing',
                            'calculation',
                            'photo',
                            'other',
                          ] as ProjectDocumentKind[]
                        ).map((kind) => (
                          <option key={kind} value={kind}>
                            {documentKindLabel(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="document-kind-field">
                      連結狀態
                      <select
                        value={evidenceLinkStatusFilter}
                        onChange={(event) =>
                          setEvidenceLinkStatusFilter(
                            event.target.value as EvidenceLinkStatusFilter,
                          )
                        }
                      >
                        <option value="all">全部欄位</option>
                        <option value="linked">已連結附件</option>
                        <option value="missing">尚未連結</option>
                        <option value="verified">已核對</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              {caseDocuments.length > 0 ? (
                <div className="evidence-summary-grid">
                  {evidenceLinkSummaries.map((summary) => (
                    <article key={summary.document.id} className="evidence-summary-card">
                      <div className="evidence-summary-head">
                        <div>
                          <h4>{summary.document.name}</h4>
                          <p className="helper-text">
                            {documentKindLabel(summary.document.kind)} / 已引用 {summary.referencedFields.length} 個欄位
                          </p>
                        </div>
                        <div className="action-row">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              previewCaseDocument(summary.document.id)
                            }}
                          >
                            預覽
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              void openCaseDocument(summary.document.id)
                            }}
                          >
                            新分頁
                          </button>
                        </div>
                      </div>
                      {summary.referencedFields.length > 0 ? (
                        <>
                          <div className="badge-row">
                            <span className="template-verified">
                              已核對 {summary.verifiedFields.length}/{summary.referencedFields.length}
                            </span>
                          </div>
                          <div className="reference-chip-row">
                            {summary.referencedFields.map((label) => (
                              <span key={label} className="reference-chip">
                                {label}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="helper-text">
                          這份附件目前還沒有被任何正式判定欄位引用。
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="evidence-grid">
                {filteredEvidenceFieldViews.map(({ field, linkedDocument }) => {
                  return (
                    <article key={field.key} className="evidence-card">
                      <div className="evidence-head">
                        <div>
                          <h4>{field.label}</h4>
                          <p className="helper-text">{field.guidance}</p>
                        </div>
                        <div className="badge-row">
                          <Badge status={field.hasValue ? 'pass' : 'incomplete'} />
                          <span className="template-verified">
                            {formatEvidenceValue(field.rawValue, field.quantity, unitPreferences)}
                          </span>
                        </div>
                      </div>

                      <div className="evidence-status-row">
                        <span className={field.hasEvidence ? 'ok-note' : 'helper-text'}>
                          {field.hasEvidence ? '已掛文件來源' : '尚未掛文件來源'}
                        </span>
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={field.evidence?.verified ?? false}
                            onChange={(event) =>
                              patchSelectedProductEvidence(field.key, {
                                verified: event.target.checked,
                              })
                            }
                          />
                          已核對
                        </label>
                      </div>

                      {linkedDocument ? (
                        <div className="evidence-link-row">
                          <span className="template-verified">
                            已連結附件：{linkedDocument.name}
                          </span>
                          <div className="action-row">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                previewCaseDocument(linkedDocument.id)
                              }}
                            >
                              預覽附件
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                void openCaseDocument(linkedDocument.id)
                              }}
                            >
                              新分頁
                            </button>
                          </div>
                        </div>
                      ) : caseDocuments.length > 0 ? (
                        <div className="evidence-link-row">
                          <span className="helper-text">
                            可直接選用已上傳附件名稱，並用預覽確認頁碼與表號。
                          </span>
                        </div>
                      ) : null}

                      <div className="field-grid">
                        <label>
                          文件 / 報告
                          <input
                            list="case-document-names"
                            value={field.evidence?.documentName ?? ''}
                            placeholder="例如 ETA-19/0520 Table C1"
                            onChange={(event) =>
                              patchSelectedProductEvidence(field.key, {
                                documentName: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          頁碼 / 表號
                          <input
                            value={field.evidence?.page ?? ''}
                            placeholder="例如 p.18 / Table 7"
                            onChange={(event) =>
                              patchSelectedProductEvidence(field.key, {
                                page: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      {caseDocuments.length > 0 ? (
                        <div className="field-grid compact-grid">
                          <label>
                            套用已上傳附件
                            <select
                              value={linkedDocument?.id ?? ''}
                              onChange={(event) => {
                                const nextDocument = caseDocuments.find(
                                  (item) => item.id === event.target.value,
                                )
                                patchSelectedProductEvidence(field.key, {
                                  documentName: nextDocument?.name ?? '',
                                })
                                if (nextDocument) {
                                  previewCaseDocument(nextDocument.id)
                                }
                              }}
                            >
                              <option value="">未連結</option>
                              {caseDocuments.map((document) => (
                                <option key={document.id} value={document.id}>
                                  {document.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <label className="notes-field">
                        摘要 / 對照說明
                        <textarea
                          value={field.evidence?.note ?? ''}
                          placeholder="記錄尺寸條件、裂縫狀態、埋深、清孔條件等關鍵限制"
                          onChange={(event) =>
                            patchSelectedProductEvidence(field.key, {
                              note: event.target.value,
                            })
                          }
                        />
                      </label>
                    </article>
                  )
                })}
              </div>
              {filteredEvidenceFieldViews.length === 0 ? (
                <p className="helper-text">
                  目前篩選條件下沒有符合的正式判定欄位。
                </p>
              ) : null}
            </details>
            <datalist id="case-document-names">
              {caseDocuments.map((document) => (
                <option key={document.id} value={document.name} />
              ))}
            </datalist>
          </div>
        </section>

        <section className="panel panel-results" data-shows="result">
          <div className="panel-title">
            <h2>結果摘要</h2>
            <p>右側聚焦控制條文、正式判定狀態與缺資料警示。</p>
          </div>

          <div className={`summary-banner summary-${batchReview.summary.overallStatus}`}>
            <div>
              <p>整體判定</p>
              <h3>{statusLabel(batchReview.summary.overallStatus)}</h3>
            </div>
            <div className="banner-badges">
              <Badge status={batchReview.summary.overallStatus} />
              <Badge status={batchReview.summary.formalStatus} />
            </div>
          </div>

          {(() => {
            const dcr = getGoverningDcr(batchReview.summary)
            const overall = batchReview.summary.overallStatus
            if (overall === 'fail' || (overall === 'warning' && dcr > 0.9)) {
              return (
                <div className="action-hint action-hint-fail" data-action-hint>
                  <strong>建議動作</strong>
                  <span>
                    控制模式：<em>{batchReview.summary.governingMode}</em>；
                    建議依主控拉/剪模式回頭調整
                    {batchReview.summary.governingTensionMode.includes('breakout')
                      ? ' hef 或補強鋼筋'
                      : batchReview.summary.governingShearMode.includes('breakout')
                        ? ' 邊距 ca1 或剪力 U 型補強'
                        : batchReview.summary.governingTensionMode.includes('pullout')
                          ? ' 錨栓 Np 評估值或直徑'
                          : batchReview.summary.governingShearMode.includes('pryout')
                            ? ' hef 或減少偏心距'
                            : '產品規格或幾何條件'}
                    ；或於候選比選中加入替代方案比較。
                  </span>
                </div>
              )
            }
            if (overall === 'incomplete') {
              return (
                <div className="action-hint action-hint-warn" data-action-hint>
                  <strong>待補資料</strong>
                  <span>
                    {completeness.missing.slice(0, 2).join('、') || '請於產品頁補齊評估值'}
                    {completeness.missing.length > 2 ? '…' : ''}
                  </span>
                </div>
              )
            }
            return null
          })()}

          <div className="summary-grid">
            <div className="summary-card">
              <span>控制模式</span>
              <strong>{batchReview.summary.governingMode}</strong>
              <small>
                {batchReview.controllingLoadCaseName} / 控制 DCR = {formatNumber(getGoverningDcr(batchReview.summary))}
              </small>
            </div>
            <div className="summary-card">
              <span>控制拉力</span>
              <strong>{batchReview.summary.governingTensionMode}</strong>
              <small>{sectionCitation('拉力控制', '17.6')}</small>
            </div>
            <div className="summary-card">
              <span>控制剪力</span>
              <strong>{batchReview.summary.governingShearMode}</strong>
              <small>{sectionCitation('剪力控制', '17.7')}</small>
            </div>
          </div>

          {batchReview.summary.overallStatus === 'incomplete' ? (
            <p className="helper-text incomplete-emphasis">
              本案目前存在資料不足項目，DCR 僅能作為排序參考，不能視為完整控制值。
            </p>
          ) : null}
          {getGoverningDcr(batchReview.summary) < batchReview.summary.maxDcr ? (
            <p className="helper-text">
              目前同時顯示「控制 DCR」與「最大數值 DCR」。前者跟隨 severity 判定，後者僅作數值統計。
            </p>
          ) : null}

          <div className="sub-panel" data-shows="result">
            <h3>載重組合矩陣</h3>
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>組合</th>
                  <th>N</th>
                  <th>V</th>
                  <th>控制模式</th>
                  <th>控制 DCR</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {batchReview.loadCaseReviews.map((item) => (
                  <tr
                    key={item.loadCaseId}
                    className={item.loadCaseId === batchReview.controllingLoadCaseId ? 'table-highlight-row' : ''}
                  >
                    <td>
                      <div className="table-mode">
                        <strong>{item.loadCaseName}</strong>
                        <small>
                          {item.loadCaseId === activeLoadCase.id ? '目前編輯' : item.loadCaseId === batchReview.controllingLoadCaseId ? '控制組合' : '批次結果'}
                        </small>
                      </div>
                    </td>
                    <td>{formatQuantity(item.review.analysisLoads.tensionKn, 'force', unitPreferences)}</td>
                    <td>{formatQuantity(Math.hypot(item.review.analysisLoads.shearXKn, item.review.analysisLoads.shearYKn), 'force', unitPreferences)}</td>
                    <td>{item.review.summary.governingMode}</td>
                    <td>{formatNumber(getGoverningDcr(item.review.summary))}</td>
                    <td>
                      <Badge status={item.review.summary.overallStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {candidateProductReviews.length > 1 ? (
            <div className="sub-panel" data-shows="result">
              <h3>候選產品比選</h3>
              {bestCandidateReview ? (
                <div className="summary-card">
                  <span>建議候選方案</span>
                  <strong>
                    {bestCandidateReview.product.brand} {bestCandidateReview.product.model}
                  </strong>
                  <small>
                    {familyLabel(bestCandidateReview.product.family)} / 控制組合 {bestCandidateReview.batchReview.controllingLoadCaseName} / 控制 DCR {formatNumber(getGoverningDcr(bestCandidateReview.batchReview.summary))}
                  </small>
                  {bestCandidateReview.product.id !== selectedProduct.id ? (
                    <div className="action-row">
                      <button
                        type="button"
                        onClick={() =>
                          applyCandidateProductSelection(bestCandidateReview.product.id)
                        }
                      >
                        套用為目前產品
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>產品</th>
                    <th>族群</th>
                    <th>控制組合</th>
                    <th>控制模式</th>
                    <th>控制 DCR</th>
                    <th>整體狀態</th>
                    <th>正式性</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateProductReviews.map((item) => (
                    <tr
                      key={`candidate-review-${item.product.id}`}
                      className={item.product.id === selectedProduct.id ? 'table-highlight-row' : ''}
                    >
                      <td>
                        <div className="table-mode">
                          <strong>{item.product.brand} {item.product.model}</strong>
                          <small>{item.product.id === selectedProduct.id ? '目前選定' : '候選方案'}</small>
                        </div>
                      </td>
                      <td>{familyLabel(item.product.family)}</td>
                      <td>{item.batchReview.controllingLoadCaseName}</td>
                      <td>{item.batchReview.summary.governingMode}</td>
                      <td>{formatNumber(getGoverningDcr(item.batchReview.summary))}</td>
                      <td><Badge status={item.batchReview.summary.overallStatus} /></td>
                      <td><Badge status={item.batchReview.summary.formalStatus} /></td>
                      <td>
                        {item.product.id === selectedProduct.id ? (
                          <span className="helper-text">目前產品</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyCandidateProductSelection(item.product.id)}
                          >
                            套用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="matrix-section">
                <h4>產品 × 載重組合矩陣</h4>
                <table className="data-table compact-table comparison-matrix-table">
                  <thead>
                    <tr>
                      <th>載重組合</th>
                      {candidateProductReviews.map((item) => (
                        <th key={`candidate-matrix-head-${item.product.id}`}>
                          <div className="table-mode">
                            <strong>{item.product.brand} {item.product.model}</strong>
                            <small>
                              {item.product.id === selectedProduct.id
                                ? '目前選定'
                                : familyLabel(item.product.family)}
                            </small>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidateComparisonMatrix.map((row) => (
                      <tr
                        key={`candidate-matrix-row-${row.loadCaseId}`}
                        className={row.isControlling ? 'table-highlight-row' : ''}
                      >
                        <td>
                          <div className="table-mode">
                            <strong>{row.loadCaseName}</strong>
                            <small>
                              {row.isActive && row.isControlling
                                ? '目前編輯 / 控制組合'
                                : row.isActive
                                  ? '目前編輯'
                                  : row.isControlling
                                    ? '控制組合'
                                    : '批次結果'}
                            </small>
                          </div>
                        </td>
                        {row.candidateCells.map((cell) => (
                          <td
                            key={`candidate-matrix-cell-${row.loadCaseId}-${cell.candidateReview.product.id}`}
                          >
                            {cell.loadCaseReview ? (
                              <div
                                className={`candidate-matrix-cell${cell.isControllingForProduct ? ' candidate-matrix-cell-controlling' : ''}`}
                              >
                                <strong className="candidate-matrix-dcr">
                                  DCR {formatNumber(getGoverningDcr(cell.loadCaseReview.review.summary))}
                                </strong>
                                <Badge
                                  status={
                                    cell.loadCaseReview.review.summary.overallStatus
                                  }
                                />
                                <small>
                                  {cell.loadCaseReview.review.summary.governingMode}
                                  {cell.isControllingForProduct
                                    ? ' / 該產品控制'
                                    : ''}
                                </small>
                              </div>
                            ) : (
                              <span className="helper-text">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {layoutVariantReviews.length > 1 ? (
            <div className="sub-panel" data-shows="result">
              <h3>候選配置比選</h3>
              {bestLayoutVariantReview ? (
                <div className="summary-card">
                  <span>建議配置方案</span>
                  <strong>{bestLayoutVariantReview.variant.name}</strong>
                  <small>
                    {formatLayoutVariantSummary(
                      bestLayoutVariantReview.variant.layout,
                      unitPreferences,
                    )}{' '}
                    / 控制組合 {bestLayoutVariantReview.batchReview.controllingLoadCaseName}{' '}
                    / 控制 DCR{' '}
                    {formatNumber(
                      getGoverningDcr(bestLayoutVariantReview.batchReview.summary),
                    )}
                  </small>
                  {!bestLayoutVariantReview.isCurrent ? (
                    <div className="action-row">
                      <button
                        type="button"
                        onClick={() =>
                          applyLayoutVariantSelection(bestLayoutVariantReview.variant.id)
                        }
                      >
                        套用為目前配置
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>配置</th>
                    <th>幾何摘要</th>
                    <th>控制組合</th>
                    <th>控制模式</th>
                    <th>控制 DCR</th>
                    <th>整體狀態</th>
                    <th>正式性</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {layoutVariantReviews.map((item) => (
                    <tr
                      key={`layout-variant-review-${item.variant.id}`}
                      className={item.isCurrent ? 'table-highlight-row' : ''}
                    >
                      <td>
                        <div className="table-mode">
                          <strong>{item.variant.name}</strong>
                          <small>{item.isCurrent ? '目前配置' : item.variant.note || '候選配置'}</small>
                        </div>
                      </td>
                      <td>{formatLayoutVariantSummary(item.variant.layout, unitPreferences)}</td>
                      <td>{item.batchReview.controllingLoadCaseName}</td>
                      <td>{item.batchReview.summary.governingMode}</td>
                      <td>{formatNumber(getGoverningDcr(item.batchReview.summary))}</td>
                      <td><Badge status={item.batchReview.summary.overallStatus} /></td>
                      <td><Badge status={item.batchReview.summary.formalStatus} /></td>
                      <td>
                        {item.isCurrent ? (
                          <span className="helper-text">目前配置</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyLayoutVariantSelection(item.variant.id)}
                          >
                            套用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="matrix-section">
                <h4>配置 × 載重組合矩陣</h4>
                <table className="data-table compact-table comparison-matrix-table">
                  <thead>
                    <tr>
                      <th>載重組合</th>
                      {layoutVariantReviews.map((item) => (
                        <th key={`layout-matrix-head-${item.variant.id}`}>
                          <div className="table-mode">
                            <strong>{item.variant.name}</strong>
                            <small>{item.isCurrent ? '目前配置' : formatLayoutVariantSummary(item.variant.layout, unitPreferences)}</small>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {layoutComparisonMatrix.map((row) => (
                      <tr
                        key={`layout-matrix-row-${row.loadCaseId}`}
                        className={row.isControlling ? 'table-highlight-row' : ''}
                      >
                        <td>
                          <div className="table-mode">
                            <strong>{row.loadCaseName}</strong>
                            <small>
                              {row.isActive && row.isControlling
                                ? '目前編輯 / 控制組合'
                                : row.isActive
                                  ? '目前編輯'
                                  : row.isControlling
                                    ? '控制組合'
                                    : '批次結果'}
                            </small>
                          </div>
                        </td>
                        {row.variantCells.map((cell) => (
                          <td
                            key={`layout-matrix-cell-${row.loadCaseId}-${cell.layoutVariantReview.variant.id}`}
                          >
                            {cell.loadCaseReview ? (
                              <div
                                className={`candidate-matrix-cell${cell.isControllingForVariant ? ' candidate-matrix-cell-controlling' : ''}`}
                              >
                                <strong className="candidate-matrix-dcr">
                                  DCR {formatNumber(getGoverningDcr(cell.loadCaseReview.review.summary))}
                                </strong>
                                <Badge
                                  status={
                                    cell.loadCaseReview.review.summary.overallStatus
                                  }
                                />
                                <small>
                                  {cell.loadCaseReview.review.summary.governingMode}
                                  {cell.isControllingForVariant
                                    ? ' / 該配置控制'
                                    : ''}
                                </small>
                              </div>
                            ) : (
                              <span className="helper-text">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="sub-panel" data-shows="result">
            <h3>φ / ψ 採用總表</h3>
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>模式</th>
                  <th>條文</th>
                  <th>採用因子</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {factorResults.map((result) => (
                  <tr key={`factor-panel-${result.id}`}>
                    <td>{result.mode}</td>
                    <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                    <td>{formatResultFactorList(result)}</td>
                    <td>
                      <Badge status={result.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sub-panel" data-shows="result">
            <h3>正式判定狀態</h3>
            <div className="status-stack">
              <div className="status-line">
                <span>產品完整性</span>
                <Badge status={completeness.formal ? 'pass' : 'incomplete'} />
              </div>
              <div className="status-line">
                <span>選定產品</span>
                <strong>{selectedProduct.brand} {selectedProduct.model}</strong>
              </div>
              <div className="status-line">
                <span>產品族群</span>
                <strong>{familyLabel(selectedProduct.family)}</strong>
              </div>
            </div>

            {completeness.missing.length > 0 ? (
              <ul className="alert-list">
                {completeness.missing.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : (
              <p className="ok-note">該產品目前具備 v1 所需之正式判定欄位。</p>
            )}
          </div>

          <details
            className="fold-panel sub-panel"
            data-shows="result"
            open={!simpleMode || activeTab === 'result'}
          >
            <summary className="fold-summary">
              <span>規範焦點與工程提醒</span>
              <small>條文入口與注意事項</small>
            </summary>
            <div className="fold-stack">
              <div>
                <h3>規範焦點</h3>
                <ul className="reference-list">
                  <li>17.6 拉力強度</li>
                  <li>17.7 剪力強度</li>
                  <li>17.8 拉剪互制</li>
                  <li>17.9 邊距 / 間距 / 厚度</li>
                  <li>17.10 耐震入口</li>
                  <li>17.11 剪力榫已保留欄位，v1 不納入主流程</li>
                </ul>
              </div>
              <div>
                <h3>工程提醒</h3>
                <ul className="reference-list">
                  {batchReview.summary.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                  <li>拉力分配已納入 N + Mx + My 之受拉側錨栓近似分配。</li>
                  <li>若使用型錄容許值而非產品評估值，工具只應做初篩，不應視為正式設計結論。</li>
                </ul>
              </div>
            </div>
          </details>
        </section>
      </section>

      <details
        className="panel panel-bottom fold-panel"
        data-shows="result"
        open={!simpleMode || activeTab === 'result'}
      >
        <summary className="fold-summary panel-title-like">
          <span>逐項檢核明細</span>
          <small>條文編號、需求值與設計強度</small>
        </summary>
        <div className="panel-title">
          <p>每一列都回傳條文編號、設計強度、需求值與目前使用的是產品值還是規範退回值。</p>
        </div>

        <div className="tables-grid">
          <div>
            <h3>最小尺寸檢核</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>項目</th>
                  <th>實際</th>
                  <th>需求</th>
                  <th>來源</th>
                  <th>條文</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {review.dimensionChecks.map((check) => (
                  <DimensionRow key={check.id} check={check} units={unitPreferences} />
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3>破壞模式與互制</h3>
            <table className="data-table">
              <thead>
                    <tr>
                      <th>模式</th>
                      <th>條文</th>
                      <th>需求值</th>
                      <th>設計值</th>
                      <th>採用因子</th>
                      <th>DCR</th>
                      <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {review.results.map((result) => (
                  <tr key={result.id}>
                      <td>
                        <div className="table-mode">
                          <strong>{result.mode}</strong>
                          <small>
                            {getResultPresentationSummary(result, unitPreferences)}
                            {result.note ? ` / ${result.note}` : ''}
                          </small>
                        </div>
                      </td>
                    <td>{sectionCitation(result.citation.title, result.citation.clause)}</td>
                    <td>{formatResultValue(result, result.demandKn, unitPreferences)}</td>
                    <td>{formatResultValue(result, result.designStrengthKn, unitPreferences)}</td>
                    <td>{formatResultFactorList(result)}</td>
                    <td>{formatNumber(result.dcr)}</td>
                    <td>
                      <div className="status-stack">
                        <Badge status={result.status} />
                        <small>{result.formal ? '正式' : '初篩 / 補資料'}</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      </div>

      <ReportDocument
        batchReview={batchReview}
        candidateProductReviews={candidateProductReviews}
        layoutVariantReviews={layoutVariantReviews}
        review={review}
        selectedProduct={selectedProduct}
        completeness={completeness}
        evaluationFieldStates={evaluationFieldStates}
        unitPreferences={unitPreferences}
        reportSettings={reportSettings}
        saveMessage={saveMessage}
        latestAuditEntry={latestAuditEntry}
      />
      {isDraggingFile ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <strong>📥 放開以匯入備份 JSON</strong>
            <span>
              拖放的檔案會與現有工作區合併（以 ID 為 key）；
              非 JSON 檔案會被忽略。
            </span>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          key={toast.id}
          className="toast"
          role="status"
          aria-live="polite"
          onClick={() => setToast(null)}
        >
          {toast.message}
        </div>
      ) : null}
      {showCommandPalette ? (
        <CommandPalette
          query={paletteQuery}
          onQueryChange={setPaletteQuery}
          onClose={() => setShowCommandPalette(false)}
          commands={[
            ...WORKSPACE_TABS.map((tab) => ({
              id: `tab:${tab.id}`,
              label: `切換到 ${tab.label}`,
              group: '導覽',
              hint: tab.hint,
              run: () => {
                setActiveTab(tab.id)
                setHasEnteredWorkspace(true)
              },
            })),
            {
              id: 'tab:report',
              label: '回到資源庫 hub',
              group: '導覽',
              hint: '案件樣板 / 案例庫 / 附件 / 匯出',
              run: () => setActiveTab('report'),
            },
            ...caseCards.slice(0, 10).map((item) => ({
              id: `case:${item.id}`,
              label: `載入案例：${item.name}`,
              group: '案例',
              hint: formatDateTime(item.updatedAt),
              run: () => {
                selectProject(item.id)
                setActiveTab('member')
                setHasEnteredWorkspace(true)
              },
            })),
            ...products.slice(0, 10).map((item) => ({
              id: `product:${item.id}`,
              label: `切換產品：${item.brand} ${item.model}`,
              group: '產品',
              hint: familyLabel(item.family),
              run: () => {
                patchProject({ selectedProductId: item.id })
                setActiveTab('product')
                setHasEnteredWorkspace(true)
              },
            })),
            {
              id: 'action:print',
              label: '列印報表',
              group: '動作',
              hint: 'Ctrl/Cmd+P',
              run: () => shortcutHandlersRef.current.printReport(),
            },
            {
              id: 'action:preview',
              label: '預覽報表（獨立視窗）',
              group: '動作',
              hint: '可在新分頁檢視完整報告',
              run: () => {
                void openStandaloneReportWindow(false)
              },
            },
            {
              id: 'action:export-html',
              label: '匯出 HTML 報告',
              group: '動作',
              hint: '下載單檔離線可讀',
              run: () => {
                void exportHtmlReport()
              },
            },
            {
              id: 'action:export-xlsx',
              label: '匯出 XLSX 報告',
              group: '動作',
              hint: '表格版多工作表',
              run: () => {
                void exportXlsxReport()
              },
            },
            {
              id: 'action:export-docx',
              label: '匯出 DOCX 報告',
              group: '動作',
              hint: '含幾何配置圖',
              run: () => {
                void exportDocxReport()
              },
            },
            {
              id: 'action:audit',
              label: '留存簽章（手動留痕）',
              group: '動作',
              hint: 'Ctrl/Cmd+S',
              run: () =>
                shortcutHandlersRef.current.recordCurrentAuditTrail('manual'),
            },
            {
              id: 'action:export-case',
              label: '匯出本案 JSON（僅目前案例）',
              group: '動作',
              hint: '含選用 / 候選產品 + 該案附件',
              run: () => exportCurrentCase(),
            },
            {
              id: 'action:backup',
              label: '匯出整個工作區 JSON',
              group: '動作',
              hint: '含所有案例 / 產品 / 附件',
              run: () => {
                void exportWorkspace()
              },
            },
            {
              id: 'action:help',
              label: '顯示鍵盤快捷鍵',
              group: '動作',
              hint: '?',
              run: () => setShowShortcutHelp(true),
            },
          ]}
        />
      ) : null}
      {showShortcutHelp ? (
        <div
          className="shortcut-help-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcut-help-title"
          onClick={() => setShowShortcutHelp(false)}
        >
          <div
            className="shortcut-help-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shortcut-help-header">
              <h2 id="shortcut-help-title">鍵盤快捷鍵</h2>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowShortcutHelp(false)}
                aria-label="關閉說明"
              >
                關閉
              </button>
            </div>
            <table className="shortcut-help-table">
              <tbody>
                <tr>
                  <td><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>S</kbd></td>
                  <td>手動留痕（auto-save 已自動；此處建立審查 hash 簽章）</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>P</kbd></td>
                  <td>開啟獨立列印視窗</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></td>
                  <td>命令面板：快速切 tab / 案例 / 產品 / 匯出</td>
                </tr>
                <tr>
                  <td><kbd>Alt</kbd> + <kbd>1</kbd>–<kbd>6</kbd></td>
                  <td>切換 構件／配置 · 產品 · 載重 · 耐震 · 柱腳 · 結果</td>
                </tr>
                <tr>
                  <td><kbd>Alt</kbd> + <kbd>0</kbd> 或 <kbd>R</kbd></td>
                  <td>回到資源庫首頁 hub</td>
                </tr>
                <tr>
                  <td><kbd>Esc</kbd></td>
                  <td>資源庫返回結果頁 / 關閉本說明</td>
                </tr>
                <tr>
                  <td><kbd>?</kbd></td>
                  <td>開啟 / 關閉本快捷鍵說明</td>
                </tr>
              </tbody>
            </table>
            <p className="helper-text shortcut-help-note">
              在輸入框內時，<kbd>Alt</kbd>/<kbd>Esc</kbd> 不會攔截，以避免干擾輸入；
              <kbd>Ctrl</kbd>+<kbd>S</kbd>/<kbd>Ctrl</kbd>+<kbd>P</kbd> 皆會覆寫瀏覽器預設行為。
            </p>
            <div className="shortcut-help-version">
              <span>
                build：<code>{__APP_COMMIT_HASH__}</code> ·
                <code>{formatDateTime(__APP_BUILD_TIME__)}</code>
              </span>
              <span>
                規範：{activeRuleProfile.chapter17Title} ·{' '}
                {activeRuleProfile.versionLabel}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
