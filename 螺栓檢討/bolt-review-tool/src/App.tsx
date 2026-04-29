import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
// getAnchorReinforcementOverlay 已下放至 ./GeometrySketch
import {
  CURRENT_CALC_ENGINE_VERSION,
  ENGINEERING_USE_DISCLAIMER,
  getCalcEngineVersionStatus,
  normalizeCalcEngineVersion,
} from './appMeta'
import {
  getColumnSectionType,
  getDerivedBasePlateCantilevers,
} from './basePlateGeometry'
// getBasePlateBearingOverlay 已下放至 ./GeometrySketch
import {
  assessProductCompleteness,
  evaluateProjectBatch,
} from './calc'
import { db } from './db'
import {
  normalizeReportSettings,
  defaultProducts,
  defaultProject,
} from './defaults'
import type {
  AnchorFamily,
  AnchorLayout,
  AnchorProduct,
  LoadCasePresetInput,
  LoadCombinationComponents,
  ProjectLoadCase,
  ProjectCase,
  ProjectDocumentKind,
  ReportSettings,
  ProjectSnapshot,
  ReviewResult,
  UnitPreferences,
} from './domain'
import type {
  EvidenceFieldView,
  EvidenceLinkStatusFilter,
  EvidenceLinkSummary,
} from './evidenceLinks'
import type { EvaluationFieldState } from './evaluationCatalog'
import {
  formatAuditHash,
  getLatestProjectAuditEntry,
} from './evaluationAudit'
import type {
  ProductTemplate,
} from './productTemplates'
import {
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
import type { SeismicRouteGuidance } from './seismicRouteGuidance'
import ResourceLibraryHub, {
  type ResourceLibraryTabId,
} from './ResourceLibraryHub'
import { WelcomeCard } from './WelcomeCard'
import { SensitivityPanel } from './SensitivityPanel'
import { CommandPalette } from './CommandPalette'
import { AnalysisLoadsCard } from './AnalysisLoadsCard'
import { AnchorReinforcementPanel } from './AnchorReinforcementPanel'
import { AuditHistoryPanel } from './AuditHistoryPanel'
import { BasePlateBearingPanel } from './BasePlateBearingPanel'
import { CaseDocumentsPanel } from './CaseDocumentsPanel'
import { CaseLibraryPanel } from './CaseLibraryPanel'
import { EvidenceLinksPanel } from './EvidenceLinksPanel'
import { FormulaReferencePanel } from './FormulaReferencePanel'
import { GeometrySketch } from './GeometrySketch'
import { HSectionAnchorHelperPanel } from './HSectionAnchorHelperPanel'
import { LandingHubGrid } from './LandingHubGrid'
import { LayoutVariantsPanel } from './LayoutVariantsPanel'
import { LoadCaseMatrixPanel } from './LoadCaseMatrixPanel'
import { LoadPresetPanel } from './LoadPresetPanel'
import { PerAnchorMechanicsPanel } from './PerAnchorMechanicsPanel'
import { ProductEvaluationPanel } from './ProductEvaluationPanel'
import { QuickCheckCard } from './QuickCheckCard'
import { ReportDocument } from './ReportDocument'
import { ReportSettingsPanel } from './ReportSettingsPanel'
import { ResultsDetailPanel } from './ResultsDetailPanel'
import { Badge } from './resultDisplay'
import {
  formatResultFactorList,
  sectionCitation,
  statusLabel,
} from './resultDisplayHelpers'
import { SeismicInputPanel } from './SeismicInputPanel'
import { StatusBanners } from './StatusBanners'
import { TopHeaderToolbar } from './TopHeaderToolbar'
import { UnitNumberField } from './UnitNumberField'
import { useAuditTrail } from './useAuditTrail'
import { useDocumentLibrary } from './useDocumentLibrary'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useLayoutVariants } from './useLayoutVariants'
import {
  useLoadCaseLibrary,
  loadCaseDelimitedHeaderRow,
  loadCaseDelimitedExampleRow,
} from './useLoadCaseLibrary'
import { useProductLibrary } from './useProductLibrary'
import { useProjectLibrary } from './useProjectLibrary'
import { useReportExports } from './useReportExports'
import { useReviewArtifacts } from './useReviewArtifacts'
import { useWorkspaceHydration } from './useWorkspaceHydration'
import {
  auditSourceLabel,
  formatDateTime,
  formatLayoutVariantSummary,
  formatNumber,
  formatQuantity,
  getGoverningDcr,
  parseNumber,
} from './formatHelpers'
import {
  IconClipboard,
  IconDownload,
} from './Icons'
import {
  getUnitSymbol,
  normalizeUnitPreferences,
} from './units'

const ProjectTemplateLibrary = lazy(() => import('./ProjectTemplateLibrary'))
const ProductTemplateLibrary = lazy(() => import('./ProductTemplateLibrary'))
const ProductScanAssistant = lazy(() => import('./ProductScanAssistant'))

// loadCaseDelimitedHeaderRow / loadCaseDelimitedExampleRow 已下放至 useLoadCaseLibrary

// formatNumber / formatFileSize 已移至 ./formatHelpers

// statusLabel / Badge / sectionCitation / formatResultValue / formatResultFactorList /
// dimensionSourceLabel / DimensionRow 已移至 ./resultDisplay

// getGoverningDcr 已移至 ./formatHelpers

// getSeismicGuidanceBadgeStatus 已移至 ./SeismicInputPanel
// getBearingConfinementMode 已移至 ./BasePlateBearingPanel
// getBasePlateSectionType / basePlateSectionTypeLabel / columnSectionTypeLabel /
// getEffectiveBasePlateLoadedArea 已下放至 BasePlateBearingPanel
// resultStatusSeverity 已下放至 ReportDocument

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

// documentKindLabel 已下放至 CaseDocumentsPanel / EvidenceLinksPanel

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

// parseNumber 已移至 ./formatHelpers

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
    calcEngineVersion: normalizeCalcEngineVersion(project.calcEngineVersion),
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

// makeUniqueProjectName 已下放至 useProjectLibrary

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

// auditSourceLabel 已移至 ./formatHelpers

// projectIdSeed / projectIdSequence 已下放至 useProjectLibrary
// loadCaseIdSeed / loadCaseIdSequence 已下放至 useLoadCaseLibrary
// layoutVariantIdSeed / layoutVariantIdSequence 已下放至 useLayoutVariants
// documentIdSeed / nextDocumentId 已下放至 useDocumentLibrary

// nextProjectId 已下放至 useProjectLibrary

// nextLoadCaseId 已下放至 useLoadCaseLibrary

// nextLayoutVariantId 已下放至 useLayoutVariants

// cloneProduct / nextTemplateImportId / makeBlankProduct 已下放至 useProductLibrary

// makeUniqueLoadCaseName 已下放至 useLoadCaseLibrary

// makeUniqueLayoutVariantName 已下放至 useLayoutVariants

// reportModeLabel 已下放至 ReportDocument

// seismicInputModeLabel 已下放至 ReportDocument

// formatDate 已下放至 ReportDocument

// formatDateTime 已移至 ./formatHelpers
// formatQuantity 已移至 ./formatHelpers

// formatLayoutVariantSummary 已移至 ./formatHelpers


// formatEvidenceValue 已下放至 EvidenceLinksPanel

// BatchReviewResult / CandidateProductReview / LayoutVariantReview 型別已移至 ./reviewArtifacts

// 4 個比較矩陣 helper（getCandidateLoadCaseReview / buildCandidateComparisonMatrix /
// getLayoutVariantLoadCaseReview / buildLayoutComparisonMatrix）已移至 ./reviewArtifacts

// UnitNumberField 已移至 ./UnitNumberField

// GeometrySketch 已抽至 ./GeometrySketch

// ReportDocument 已抽至 ./ReportDocument

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



function App() {
  // 預設落地頁為資源庫（首頁 hub）；若上次離開時非 report，下次自動回到該 tab
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(() => {
    if (typeof window === 'undefined') {
      return 'report'
    }
    const saved = window.localStorage.getItem('bolt-review-tool:lastActiveTab')
    const validTabs: WorkspaceTabId[] = [
      'member',
      'product',
      'loads',
      'seismic',
      'baseplate',
      'result',
      'report',
    ]
    if (saved && (validTabs as string[]).includes(saved)) {
      return saved as WorkspaceTabId
    }
    return 'report'
  })
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.localStorage.getItem('bolt-review-tool:lastActiveTab') !== null &&
      window.localStorage.getItem('bolt-review-tool:lastActiveTab') !== 'report',
  )
  const [products, setProducts] = useState<AnchorProduct[]>(defaultProducts)
  const [projects, setProjects] = useState<ProjectCase[]>(() => [
    cloneProject(defaultProject),
  ])
  const [activeProjectId, setActiveProjectId] = useState(defaultProject.id)
  const [project, setProject] = useState<ProjectCase>(() =>
    cloneProject(defaultProject),
  )
  // 啟動水合 5 個 state + 2 個 callback 已下放至 useWorkspaceHydration（hook 呼叫於下方）
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
  // 案例 A/B/C 並排比較：勾選 2~3 個案例，立即顯示 summary 對照表
  const [comparedCaseIds, setComparedCaseIds] = useState<string[]>([])
  // 結果頁逐項檢核明細：點擊展開查看採用因子全表
  const [expandedResultIds, setExpandedResultIds] = useState<Set<string>>(
    new Set(),
  )
  // 結果明細表過濾：只看不通過 / 只看主控 / 全部
  const [resultDetailFilter, setResultDetailFilter] = useState<
    'all' | 'failing' | 'governing'
  >('all')
  // 案例庫搜尋字串：依名稱 / 案號 / 產品 / 控制模式即時過濾
  const [caseLibrarySearch, setCaseLibrarySearch] = useState('')
  // 留痕對比：勾選 2 筆 audit 顯示 diff（最多 2）
  const [auditCompareIds, setAuditCompareIds] = useState<string[]>([])
  // 首次造訪歡迎卡：localStorage 記錄是否已關閉
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return (
      window.localStorage.getItem('bolt-review-tool:welcomeDismissed') !==
      '1'
    )
  })
  const [templateCatalog, setTemplateCatalog] = useState<ProductTemplate[] | null>(
    null,
  )
  // pendingDocumentKind / preview {Id, File, Url, Error} state 已下放至 useDocumentLibrary
  const [evidenceDocumentKindFilter, setEvidenceDocumentKindFilter] =
    useState<'all' | ProjectDocumentKind>('all')
  const [evidenceLinkStatusFilter, setEvidenceLinkStatusFilter] =
    useState<EvidenceLinkStatusFilter>('all')
  // pendingLoadCaseImportMode / loadCasePasteText 已下放至 useLoadCaseLibrary
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
  // importInputRef 已下放至 useProjectLibrary
  // loadCaseCsvInputRef 已下放至 useLoadCaseLibrary
  // documentInputRef 已下放至 useDocumentLibrary

  // 啟動水合：讀取 IndexedDB → 失敗 fallback → 提供 retry / reset 兩個 callback
  const {
    hydrated,
    loading,
    hydrationError,
    isResetting,
    retryHydration,
    resetLocalDatabaseAndReload,
  } = useWorkspaceHydration({
    setProducts,
    setProjects,
    setActiveProjectId,
    setProject,
    cloneProject,
    normalizeProjectSelection,
  })

  const selectedProduct =
    products.find((item) => item.id === project.selectedProductId) ?? products[0]
  const candidateProducts = products.filter((item) =>
    (project.candidateProductIds ?? [project.selectedProductId]).includes(item.id),
  )
  const candidateLayoutVariants = project.candidateLayoutVariants ?? []
  const unitPreferences = normalizeUnitPreferences(project.ui)
  const reportSettings = normalizeReportSettings(project.report)
  const simpleMode = unitPreferences.simpleMode
  const activeRuleProfile = getRuleProfileById(project.ruleProfileId)
  const ruleProfileOptions = getRuleProfileOptions()
  // Review artifact 計算群（deferred + memo + 比較矩陣）已下放至 useReviewArtifacts
  const {
    batchReview,
    candidateProductReviews,
    layoutVariantReviews,
    candidateComparisonMatrix,
    layoutComparisonMatrix,
    review,
    factorResults,
    bestCandidateReview,
    bestLayoutVariantReview,
  } = useReviewArtifacts({
    project,
    selectedProduct,
    candidateProducts,
    candidateLayoutVariants,
    activeRuleProfile,
  })
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
  // basePlatePlan / derivedBasePlateCantilevers 計算下放至 BasePlateBearingPanel；
  // 這裡保留 derived 供 applyDerivedBasePlateCantilevers 使用。
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
  const calcEngineVersionStatus = useMemo(
    () => getCalcEngineVersionStatus(project.calcEngineVersion),
    [project.calcEngineVersion],
  )
  const calcEngineMismatch = calcEngineVersionStatus.mismatch
  const calcEngineStatusMessage = calcEngineMismatch
    ? `本案原始計算版本為 ${calcEngineVersionStatus.projectVersion}，目前工具為 ${calcEngineVersionStatus.runtimeVersion}。目前畫面結果已依最新版引擎重算，正式交付前應重新檢核並建立新留痕。`
    : `本案計算版本與目前工具版本一致：${calcEngineVersionStatus.runtimeVersion}`
  const caseDocuments = useMemo(() => project.documents ?? [], [project.documents])
  // previewDocumentMeta 已下放至 useDocumentLibrary（從其 hook 結果取得）
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
  // SW 新版可用時顯示 banner 提示重新載入
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  // PWA 可安裝事件：若瀏覽器支援，beforeinstallprompt 會被攔截，顯示一鍵安裝按鈕
  const installPromptRef = useRef<{
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  } | null>(null)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  // H 型鋼周邊錨栓 helper 的 6 個輸入狀態已下放至 HSectionAnchorHelperPanel 自管
  // 錨頭承壓面積 A_brg 換算輔助 3 個輸入狀態已下放至 ProductEvaluationPanel 自管

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

  // 保存最後 active tab 到 localStorage，供下次回來自動恢復
  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) {
      return
    }
    try {
      window.localStorage.setItem(
        'bolt-review-tool:lastActiveTab',
        activeTab,
      )
    } catch {
      // 隱私模式 / quota 等情境忽略；不影響主流程
    }
  }, [activeTab, hydrated])

  // SW 新版可用：main.tsx 會 dispatch CustomEvent，這裡監聽並顯示 banner
  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true)
    window.addEventListener(
      'bolt-review-tool:sw-update-available',
      handler as EventListener,
    )
    return () => {
      window.removeEventListener(
        'bolt-review-tool:sw-update-available',
        handler as EventListener,
      )
    }
  }, [])

  // PWA 安裝事件：攔截 beforeinstallprompt 後待使用者點擊「安裝」按鈕觸發
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      // BeforeInstallPromptEvent 不在標準 lib.dom，cast 為 unknown 後當作物件用
      installPromptRef.current = event as unknown as {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
      }
      setCanInstallPwa(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    const onInstalled = () => {
      installPromptRef.current = null
      setCanInstallPwa(false)
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

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

  // 拖放匯入的 handler ref（importWorkspaceFromFile 在此下方宣告，透過物件欄位避免 ref.current 被替換）
  const importFileHandlerRef = useRef<{ run: (file: File) => Promise<void> }>({
    run: async () => {},
  })
  // 鍵盤捷徑相關的 caseCardsRef / activeProjectIdRef / selectProjectRef 已下放至 useKeyboardShortcuts

  // 預覽載入 effect 已下放至 useDocumentLibrary
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

  function adoptCurrentCalcEngineVersion() {
    patchProject({
      calcEngineVersion: CURRENT_CALC_ENGINE_VERSION,
    })
    setSaveMessage(
      `已將本案計算版本更新為 ${CURRENT_CALC_ENGINE_VERSION}；建議立即重新留痕或重新匯出報表。`,
    )
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

  // 文件管理 hook：patchProjectDocument / 上傳 / 預覽 / 開啟 / 下載 / 刪除 + 預覽 state
  const {
    documentInputRef,
    pendingDocumentKind,
    setPendingDocumentKind,
    previewDocumentMeta,
    previewDocumentFile,
    previewDocumentUrl,
    previewDocumentError,
    openDocumentDialog,
    previewCaseDocument,
    clearPreviewDocument,
    patchProjectDocument,
    uploadCaseDocuments,
    openCaseDocument,
    downloadCaseDocument,
    deleteCaseDocument,
  } = useDocumentLibrary({
    project,
    caseDocuments,
    patchProject,
    setSaveMessage,
  })

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

  // 候選配置 6 個動作已下放至 useLayoutVariants
  const {
    createLayoutVariantFromCurrent,
    patchLayoutVariantMeta,
    applyLayoutVariantSelection,
    overwriteLayoutVariantFromCurrent,
    duplicateLayoutVariant,
    deleteLayoutVariant,
  } = useLayoutVariants({
    project,
    candidateLayoutVariants,
    patchProject,
    commitProject,
    setSaveMessage,
  })

  function applyDerivedBasePlateCantilevers() {
    if (!derivedBasePlateCantilevers) {
      return
    }

    patchLayout({
      basePlateCantileverXmm: derivedBasePlateCantilevers.xMm,
      basePlateCantileverYmm: derivedBasePlateCantilevers.yMm,
    })
  }

  // 載重組合 13 個動作 + 2 state + ref 已下放至 useLoadCaseLibrary
  const {
    loadCaseCsvInputRef,
    loadCasePasteText,
    setLoadCasePasteText,
    patchLoads,
    patchLoadCaseRow,
    selectLoadCase,
    createLoadCase,
    duplicateLoadCase,
    deleteActiveLoadCase,
    renameActiveLoadCase,
    applyLoadCasePreset,
    exportLoadCasesCsv,
    openLoadCaseCsvImportDialog,
    importLoadCasesCsv,
    copyLoadCaseHeaderRow,
    importPastedLoadCases,
  } = useLoadCaseLibrary({
    project,
    loadCaseLibrary,
    activeLoadCase,
    loadPresetInput,
    commitProject,
    setSaveMessage,
  })

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

  // 產品庫 8 個動作已下放至 useProductLibrary
  const {
    patchSelectedProduct,
    patchSelectedProductEvaluation,
    patchSelectedProductEvidence,
    createProduct,
    duplicateSelectedProduct,
    deleteSelectedProduct,
    importTemplate,
    applyTemplate,
  } = useProductLibrary({
    products,
    selectedProduct,
    setProducts,
    setProject,
    patchProject,
    setSaveMessage,
  })

  // 案例庫管理 11 個動作 + import input ref 已下放至 useProjectLibrary
  const {
    importInputRef,
    loadProjectTemplate,
    selectProject,
    createProject,
    resetCurrentProjectToDefaults,
    duplicateProject,
    deleteCurrentProject,
    exportCurrentCase,
    exportWorkspace,
    openImportDialog,
    importWorkspaceFromFile,
    importWorkspace,
  } = useProjectLibrary({
    project,
    projectLibrary,
    products,
    selectedProduct,
    projectTemplateCatalog,
    setProject,
    setProjects,
    setActiveProjectId,
    setProducts,
    setSaveMessage,
    clearPreviewDocument,
    commitProject,
    cloneProject,
    normalizeProjectSelection,
    replaceProjectInList,
  })

  // 文件管理 8 個動作 + 4 個 preview state + ref 已下放至 useDocumentLibrary（hook 呼叫於上方）

  // createProduct / importTemplate / applyTemplate / duplicateSelectedProduct /
  // deleteSelectedProduct 均已下放至 useProductLibrary（hook 呼叫於上方）

  // 留痕 4 個動作（ensure/record/delete/exportCsv）已下放至 useAuditTrail
  const {
    ensureProjectAudit,
    recordCurrentAuditTrail,
    deleteAuditEntry,
    exportAuditTrailCsv,
  } = useAuditTrail({
    project,
    selectedProduct,
    batchReview,
    reportSettings,
    completeness,
    cloneProject,
    commitProject,
    patchProject,
    setSaveMessage,
  })

  // 報表匯出（HTML / XLSX / DOCX / 獨立預覽 / 列印）已抽至 useReportExports
  const {
    openStandaloneReportWindow,
    exportHtmlReport,
    exportXlsxReport,
    exportDocxReport,
  } = useReportExports({
    project,
    batchReview,
    candidateProductReviews,
    layoutVariantReviews,
    review,
    selectedProduct,
    completeness,
    evaluationFieldStates,
    unitPreferences,
    reportSettings,
    latestAuditEntry,
    ensureProjectAudit,
    setSaveMessage,
  })

  // 每次 render 後同步拖放匯入的 ref
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    importFileHandlerRef.current.run = importWorkspaceFromFile
  })

  // 全域鍵盤捷徑：已下放至 useKeyboardShortcuts
  useKeyboardShortcuts({
    hydrated,
    activeTab,
    hasEnteredWorkspace,
    showShortcutHelp,
    showCommandPalette,
    workspaceTabs: WORKSPACE_TABS,
    caseCards,
    activeProjectId,
    recordCurrentAuditTrail,
    printReport: () => {
      void openStandaloneReportWindow(true)
    },
    selectProject,
    setActiveTab,
    setHasEnteredWorkspace,
    setShowCommandPalette,
    setShowShortcutHelp,
    setPaletteQuery,
  })

  // exportHtmlReport / exportXlsxReport / exportDocxReport 已下放至 useReportExports

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
    <main
      className="app-shell"
      data-active-tab={activeTab}
      data-loads-simple={unitPreferences.loadsSimpleMode ? '1' : '0'}
    >
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
          <div
            className={`status-chip${calcEngineMismatch ? ' status-chip-dirty' : ''}`}
            title={calcEngineStatusMessage}
          >
            <span>引擎</span>
            <strong className="status-chip-truncate">
              {calcEngineMismatch
                ? `${calcEngineVersionStatus.projectVersion} → ${calcEngineVersionStatus.runtimeVersion}`
                : calcEngineVersionStatus.runtimeVersion}
            </strong>
          </div>
        </div>
      </header>

      <StatusBanners
        swUpdateAvailable={swUpdateAvailable}
        onDismissSwUpdate={() => setSwUpdateAvailable(false)}
        onReload={() => window.location.reload()}
        calcEngineMismatch={calcEngineMismatch}
        projectCalcEngineVersion={calcEngineVersionStatus.projectVersion}
        runtimeCalcEngineVersion={calcEngineVersionStatus.runtimeVersion}
        onAdoptCurrentCalcEngineVersion={adoptCurrentCalcEngineVersion}
      />

      <TopHeaderToolbar
        project={project}
        patchProject={patchProject}
        ruleProfileOptions={ruleProfileOptions}
        unitPreferences={unitPreferences}
        patchUi={patchUi}
        simpleMode={simpleMode}
        activeRuleProfileChapter17Title={activeRuleProfile.chapter17Title}
        setActiveTab={setActiveTab}
        onOpenCommandPalette={() => {
          setPaletteQuery('')
          setShowCommandPalette(true)
        }}
        onPrintReport={() => {
          void openStandaloneReportWindow(true)
        }}
        onPreviewReport={() => openStandaloneReportWindow(false)}
        onExportHtmlReport={exportHtmlReport}
        onExportXlsxReport={exportXlsxReport}
        onExportDocxReport={exportDocxReport}
        onRecordAuditTrailManual={() => recordCurrentAuditTrail('manual')}
      />

      <section
        className={`action-hint ${calcEngineMismatch ? 'action-hint-warn' : 'action-hint-passive'}`}
        aria-live="polite"
      >
        <strong>
          {calcEngineMismatch ? '計算版本差異' : '簽證責任與版本追溯'}
        </strong>
        <span>
          {calcEngineStatusMessage} {ENGINEERING_USE_DISCLAIMER}
        </span>
        {calcEngineMismatch ? (
          <button
            type="button"
            className="secondary-button"
            onClick={adoptCurrentCalcEngineVersion}
          >
            將本案版本更新為目前 build
          </button>
        ) : null}
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
      {showWelcome && !hasEnteredWorkspace ? (
        <WelcomeCard
          onDismiss={() => {
            setShowWelcome(false)
            try {
              window.localStorage.setItem(
                'bolt-review-tool:welcomeDismissed',
                '1',
              )
            } catch {
              /* 隱私模式忽略 */
            }
          }}
        />
      ) : null}
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
      <LandingHubGrid
        caseCards={caseCards}
        project={project}
        onSelectProject={selectProject}
        onEnterWorkspace={() => {
          setActiveTab('member')
          setHasEnteredWorkspace(true)
        }}
        onCreateProject={createProject}
        recommendedProjectTemplates={recommendedProjectTemplates}
        onLoadProjectTemplate={loadProjectTemplate}
        onBrowseProjectTemplates={() => {
          setResourceLibraryTab('project_templates')
          window.requestAnimationFrame(() => {
            document
              .querySelector('.resource-library-wrapper')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }}
        onExportWorkspace={exportWorkspace}
        onOpenImportDialog={openImportDialog}
        canInstallPwa={canInstallPwa}
        installPromptRef={installPromptRef}
        onPwaInstalled={() => {
          setSaveMessage('已安裝為應用程式（可離線使用）')
          installPromptRef.current = null
          setCanInstallPwa(false)
        }}
        onPwaInstallCancelled={() => setSaveMessage('已取消安裝')}
        onPwaInstallFailed={() => setSaveMessage('安裝失敗：瀏覽器拒絕或不支援')}
        onGoToProductScan={() => {
          setResourceLibraryTab('product_scan')
          window.requestAnimationFrame(() => {
            document
              .querySelector('.resource-library-wrapper')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }}
        onRecordAuditTrail={recordCurrentAuditTrail}
      />
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

      <CaseLibraryPanel
        project={project}
        projectLibrary={projectLibrary}
        caseCards={caseCards}
        activeProjectId={activeProjectId}
        products={products}
        unitPreferences={unitPreferences}
        caseLibrarySearch={caseLibrarySearch}
        setCaseLibrarySearch={setCaseLibrarySearch}
        comparedCaseIds={comparedCaseIds}
        setComparedCaseIds={setComparedCaseIds}
        onCreateProject={createProject}
        onDuplicateProject={duplicateProject}
        onResetCurrentProjectToDefaults={resetCurrentProjectToDefaults}
        onExportCurrentCase={exportCurrentCase}
        onDeleteCurrentProject={deleteCurrentProject}
        onExportWorkspace={exportWorkspace}
        onOpenImportDialog={openImportDialog}
        onSelectProject={selectProject}
        setSaveMessage={setSaveMessage}
        importInputRef={importInputRef}
        loadCaseCsvInputRef={loadCaseCsvInputRef}
        onImportWorkspace={importWorkspace}
        onImportLoadCasesCsv={importLoadCasesCsv}
      />

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
            <p>
              {unitPreferences.loadsSimpleMode
                ? '精簡模式：只輸入一組設計 N / Vx / Vy / Mx / My；取消勾選進階模式啟用批次組合 / CSV / D·L·E Preset。'
                : '進階模式：可管理多組載重組合、D / L / E Preset、CSV 匯入。'}
            </p>
            <label
              className="switch switch-inline loads-simple-toggle"
              title="精簡模式僅保留單一組設計載重輸入；其他進階功能（批次、CSV、Preset）會隱藏"
            >
              <input
                type="checkbox"
                checked={unitPreferences.loadsSimpleMode ?? true}
                onChange={(event) =>
                  patchUi({ loadsSimpleMode: event.target.checked })
                }
              />
              <span>精簡載重模式</span>
            </label>
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
            <label className="field-slot" data-shows="member">
              排列型式
              <select
                value={project.layout.anchorLayoutPattern ?? 'grid'}
                onChange={(event) =>
                  patchLayout({
                    anchorLayoutPattern: event.target.value as
                      | 'grid'
                      | 'perimeter',
                  })
                }
                title="grid = 全網格；perimeter = 只保留外框（H 型鋼周邊 / 只在四周的螺栓）"
              >
                <option value="grid">全網格（nx × ny）</option>
                <option value="perimeter">
                  只外框（周邊螺栓，剔除內部）
                </option>
              </select>
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
            <HSectionAnchorHelperPanel
              unitPreferences={unitPreferences}
              patchLayout={patchLayout}
              setSaveMessage={setSaveMessage}
            />
            <LayoutVariantsPanel
              candidateLayoutVariants={candidateLayoutVariants}
              simpleMode={simpleMode}
              unitPreferences={unitPreferences}
              createLayoutVariantFromCurrent={createLayoutVariantFromCurrent}
              applyLayoutVariantSelection={applyLayoutVariantSelection}
              overwriteLayoutVariantFromCurrent={overwriteLayoutVariantFromCurrent}
              duplicateLayoutVariant={duplicateLayoutVariant}
              deleteLayoutVariant={deleteLayoutVariant}
              patchLayoutVariantMeta={patchLayoutVariantMeta}
            />
            <div className="load-case-panel" data-loads-advanced="1">
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
              <LoadCaseMatrixPanel
                loadCaseLibrary={loadCaseLibrary}
                activeLoadCase={activeLoadCase}
                controllingLoadCaseId={batchReview.controllingLoadCaseId}
                unitPreferences={unitPreferences}
                patchLoadCaseRow={patchLoadCaseRow}
                selectLoadCase={selectLoadCase}
              />
            </div>
            <BasePlateBearingPanel
              project={project}
              patchLayout={patchLayout}
              simpleMode={simpleMode}
              unitPreferences={unitPreferences}
              columnSectionType={columnSectionType}
              applyDerivedBasePlateCantilevers={applyDerivedBasePlateCantilevers}
            />
            <LoadPresetPanel
              loadPresetInput={loadPresetInput}
              unitPreferences={unitPreferences}
              simpleMode={simpleMode}
              patchLoadPresetComponent={patchLoadPresetComponent}
              patchLoadPresetInput={patchLoadPresetInput}
              applyLoadCasePreset={applyLoadCasePreset}
              copyLoadCaseHeaderRow={copyLoadCaseHeaderRow}
              loadCasePasteText={loadCasePasteText}
              setLoadCasePasteText={setLoadCasePasteText}
              importPastedLoadCases={importPastedLoadCases}
              loadCaseDelimitedHeaderRow={loadCaseDelimitedHeaderRow}
              loadCaseDelimitedExampleRow={loadCaseDelimitedExampleRow}
            />
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

          <AnchorReinforcementPanel
            project={project}
            patchLayout={patchLayout}
            unitPreferences={unitPreferences}
            simpleMode={simpleMode}
          />

          <div className="field-grid compact-grid" data-shows="loads">
            <label
              title="17.8.1 / 17.8.2：任一比值 ≤ 0.2 時免作互制（直接以 max(N/φNn, V/φVn) 檢核）"
            >
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
                <option value="linear">
                  17.8.3 線性（N/φNn + V/φVn ≤ 1.2）— 規範上限
                </option>
                <option value="linear_strict">
                  保守線性（N/φNn + V/φVn ≤ 1.0）
                </option>
                <option value="power">
                  17.8.3 5/3 次方（(N/φNn)^5/3 + (V/φVn)^5/3 ≤ 1.0）
                </option>
              </select>
            </label>
          </div>

          <QuickCheckCard review={review} unitPreferences={unitPreferences} />

          <SeismicInputPanel
            project={project}
            patchLoads={patchLoads}
            unitPreferences={unitPreferences}
            simpleMode={simpleMode}
            seismicRouteGuidance={seismicRouteGuidance}
            applyRecommendedSeismicRoute={applyRecommendedSeismicRoute}
          />

          <ReportSettingsPanel
            reportSettings={reportSettings}
            patchReport={patchReport}
            setSaveMessage={setSaveMessage}
            simpleMode={simpleMode}
          />

          <CaseDocumentsPanel
            caseDocuments={caseDocuments}
            pendingDocumentKind={pendingDocumentKind}
            setPendingDocumentKind={setPendingDocumentKind}
            documentInputRef={documentInputRef}
            uploadCaseDocuments={uploadCaseDocuments}
            openDocumentDialog={openDocumentDialog}
            previewDocumentMeta={previewDocumentMeta}
            previewDocumentFile={previewDocumentFile}
            previewDocumentUrl={previewDocumentUrl}
            previewDocumentError={previewDocumentError}
            clearPreviewDocument={clearPreviewDocument}
            openCaseDocument={openCaseDocument}
            downloadCaseDocument={downloadCaseDocument}
            previewCaseDocument={previewCaseDocument}
            deleteCaseDocument={deleteCaseDocument}
            patchProjectDocument={patchProjectDocument}
            simpleMode={simpleMode}
          />

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

            <ProductEvaluationPanel
              selectedProduct={selectedProduct}
              patchSelectedProduct={patchSelectedProduct}
              patchSelectedProductEvaluation={patchSelectedProductEvaluation}
              unitPreferences={unitPreferences}
              simpleMode={simpleMode}
              setSaveMessage={setSaveMessage}
            />

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

            <EvidenceLinksPanel
              simpleMode={simpleMode}
              unitPreferences={unitPreferences}
              caseDocuments={caseDocuments}
              evidenceCoverage={evidenceCoverage}
              evidenceDocumentKindFilter={evidenceDocumentKindFilter}
              setEvidenceDocumentKindFilter={setEvidenceDocumentKindFilter}
              evidenceLinkStatusFilter={evidenceLinkStatusFilter}
              setEvidenceLinkStatusFilter={setEvidenceLinkStatusFilter}
              evidenceLinkSummaries={evidenceLinkSummaries}
              filteredEvidenceFieldViews={filteredEvidenceFieldViews}
              patchSelectedProductEvidence={patchSelectedProductEvidence}
              previewCaseDocument={previewCaseDocument}
              openCaseDocument={openCaseDocument}
            />
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
              <button
                type="button"
                className="copy-summary-button"
                title="把整體判定 / 控制模式 / DCR 複製到剪貼簿，可貼到 Email/Slack/Teams"
                onClick={() => {
                  const dcr = getGoverningDcr(batchReview.summary)
                  const lines = [
                    `案例：${project.name}`,
                    `規範：${review.ruleProfile.chapter17Title}（${review.ruleProfile.versionLabel}）`,
                    `產品：${selectedProduct.brand} ${selectedProduct.model}`,
                    `整體判定：${statusLabel(batchReview.summary.overallStatus)}（${
                      completeness.formal ? '正式' : '初篩 / 待補資料'
                    }）`,
                    `控制模式：${batchReview.summary.governingMode}`,
                    `控制組合：${batchReview.controllingLoadCaseName}`,
                    `控制 DCR：${formatNumber(dcr)} / 最大數值 DCR：${formatNumber(batchReview.summary.maxDcr)}`,
                    `控制拉力：${batchReview.summary.governingTensionMode}`,
                    `控制剪力：${batchReview.summary.governingShearMode}`,
                    `案例最後編修：${formatDateTime(project.updatedAt)}`,
                    latestAuditEntry
                      ? `留痕：${formatAuditHash(latestAuditEntry.hash)} · ${auditSourceLabel(latestAuditEntry.source)} · ${formatDateTime(latestAuditEntry.createdAt)}`
                      : '留痕：尚未留存',
                  ]
                  const text = lines.join('\n')
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard
                      .writeText(text)
                      .then(() => setSaveMessage('結果摘要已複製到剪貼簿'))
                      .catch(() =>
                        setSaveMessage('複製失敗：瀏覽器拒絕剪貼簿存取'),
                      )
                  } else {
                    setSaveMessage('此瀏覽器不支援剪貼簿 API')
                  }
                }}
              >
                <IconClipboard aria-hidden /> 複製摘要
              </button>
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
            // 通過但餘裕緊：DCR ≥ 0.85 且 < 1.0，提示安全邊際偏低
            if (overall === 'pass' && dcr >= 0.85 && dcr < 1) {
              const marginPct = ((1 - dcr) * 100).toFixed(1)
              return (
                <div className="action-hint action-hint-warn" data-action-hint>
                  <strong>餘裕偏低</strong>
                  <span>
                    控制 DCR = {formatNumber(dcr)}（餘裕僅 {marginPct}%）；
                    通過但對載重變動敏感。建議：
                    {batchReview.summary.governingMode.includes('breakout')
                      ? ' 加大 hef 或邊距 ca1 / 使用補強鋼筋'
                      : batchReview.summary.governingMode.includes('pullout')
                        ? ' 加大附板 A_brg 或換更大直徑錨栓'
                        : batchReview.summary.governingMode.includes('pryout')
                          ? ' 加大 hef'
                          : ' 加大產品規格或幾何條件'}
                    。
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

          {/* 自動敘述卡：把整體判定、產品、幾何、載重、控制模式組成一段可貼到報告的中文敘述 */}
          <div className="auto-narrative-card">
            {(() => {
              const dcr = getGoverningDcr(batchReview.summary)
              const overallLabel = statusLabel(batchReview.summary.overallStatus)
              const layoutMin = Math.min(
                project.layout.edgeLeftMm,
                project.layout.edgeRightMm,
                project.layout.edgeBottomMm,
                project.layout.edgeTopMm,
              )
              const totalShear = Math.hypot(
                review.analysisLoads.shearXKn,
                review.analysisLoads.shearYKn,
              )
              const recommendation =
                batchReview.summary.overallStatus === 'fail'
                  ? '建議調整 hef、邊距或更換更大規格產品；可於候選比選增加替代方案後比較。'
                  : batchReview.summary.overallStatus === 'incomplete'
                    ? `產品評估資料尚需補齊（${completeness.missing.slice(0, 2).join('、') || '見產品頁待補項目'}），目前 DCR 僅供排序參考。`
                    : dcr >= 0.85
                      ? `通過但餘裕僅 ${((1 - dcr) * 100).toFixed(0)}%，建議保留更大邊距或加大 hef 以提升安全餘裕。`
                      : '通過且具合理安全餘裕；可進入正式設計階段。'
              const narrative =
                `本案依「${review.ruleProfile.chapter17Title}」（${review.ruleProfile.versionLabel}）` +
                `進行錨栓群檢核，採用 ${selectedProduct.brand} ${selectedProduct.model}` +
                `（${familyLabel(selectedProduct.family)}），錨栓配置 ${project.layout.anchorCountX}×${project.layout.anchorCountY}` +
                `（${review.anchorPoints.length} 支），hef = ${formatQuantity(project.layout.effectiveEmbedmentMm, 'length', unitPreferences)}，` +
                `間距 sx/sy = ${formatQuantity(project.layout.spacingXmm, 'length', unitPreferences)}/${formatQuantity(project.layout.spacingYmm, 'length', unitPreferences)}，` +
                `最小邊距 c_a,min = ${formatQuantity(layoutMin, 'length', unitPreferences)}；` +
                `f'c = ${formatQuantity(project.layout.concreteStrengthMpa, 'stress', unitPreferences)}` +
                `${project.layout.crackedConcrete ? '（cracked）' : '（uncracked）'}。` +
                `設計拉力 N = ${formatQuantity(review.analysisLoads.tensionKn, 'force', unitPreferences)}、` +
                `合成剪力 V = ${formatQuantity(totalShear, 'force', unitPreferences)}，` +
                `控制組合「${batchReview.controllingLoadCaseName}」。` +
                `整體判定 ${overallLabel}（${completeness.formal ? '正式' : '初篩'}），` +
                `控制 DCR = ${formatNumber(dcr)}，控制模式為「${batchReview.summary.governingMode}」。` +
                recommendation
              return (
                <>
                  <header>
                    <h4>自動報告敘述</h4>
                    <button
                      type="button"
                      className="copy-summary-button auto-narrative-copy"
                      title="複製整段敘述到剪貼簿，可直接貼入工程報告"
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          void navigator.clipboard
                            .writeText(narrative)
                            .then(() =>
                              setSaveMessage('已複製自動敘述到剪貼簿'),
                            )
                            .catch(() =>
                              setSaveMessage('複製失敗：瀏覽器拒絕剪貼簿'),
                            )
                        }
                      }}
                    >
                      <IconClipboard aria-hidden /> 複製敘述
                    </button>
                  </header>
                  <p className="auto-narrative-text">{narrative}</p>
                  <p className="helper-text">
                    自動依目前案件、產品、控制模式組成；可作為工程報告開頭段落或審查摘要起點，
                    請依實際情境潤飾後使用。
                  </p>
                </>
              )
            })()}
          </div>

          <AnalysisLoadsCard
            project={project}
            controllingLoadCaseName={batchReview.controllingLoadCaseName}
            analysisLoads={review.analysisLoads}
            analysisNote={review.analysisNote}
            unitPreferences={unitPreferences}
          />

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

          {/* 進階分析群組：3 個摺疊面板默認收起，視覺上聚合為一區 */}
          <section
            className="advanced-analysis-group"
            aria-label="進階分析"
            data-shows="result"
          >
            <div className="advanced-analysis-header">
              <h3>進階分析</h3>
              <small>依需求展開：敏感度 ／ 公式速查 ／ 留痕歷程</small>
            </div>
          <SensitivityPanel
            project={project}
            selectedProduct={selectedProduct}
            activeRuleProfile={activeRuleProfile}
            unitPreferences={unitPreferences}
            simpleMode={simpleMode}
            baselineDcr={getGoverningDcr(batchReview.summary)}
          />

          <FormulaReferencePanel />

          <AuditHistoryPanel
            project={project}
            latestAuditEntry={latestAuditEntry}
            auditCompareIds={auditCompareIds}
            setAuditCompareIds={setAuditCompareIds}
            recordCurrentAuditTrail={recordCurrentAuditTrail}
            exportAuditTrailCsv={exportAuditTrailCsv}
            deleteAuditEntry={deleteAuditEntry}
            setSaveMessage={setSaveMessage}
          />
          </section>

          <PerAnchorMechanicsPanel
            project={project}
            review={review}
            unitPreferences={unitPreferences}
          />

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

      <ResultsDetailPanel
        review={review}
        batchReview={batchReview}
        project={project}
        patchProject={patchProject}
        unitPreferences={unitPreferences}
        simpleMode={simpleMode}
        activeTab={activeTab}
        resultDetailFilter={resultDetailFilter}
        setResultDetailFilter={setResultDetailFilter}
        expandedResultIds={expandedResultIds}
        setExpandedResultIds={setExpandedResultIds}
        setSaveMessage={setSaveMessage}
      />
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
        latestAuditEntry={latestAuditEntry}
      />
      {isDraggingFile ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <strong>
              <IconDownload aria-hidden /> 放開以匯入備份 JSON
            </strong>
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
              run: () => {
                void openStandaloneReportWindow(true)
              },
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
              run: () => {
                void recordCurrentAuditTrail('manual')
              },
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
                  <td><kbd>Alt</kbd> + <kbd>]</kbd> / <kbd>[</kbd></td>
                  <td>循環切換下 / 上一個案例（依最近編輯排序）</td>
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
            <div className="shortcut-help-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowWelcome(true)
                  try {
                    window.localStorage.removeItem(
                      'bolt-review-tool:welcomeDismissed',
                    )
                  } catch {
                    /* 隱私模式忽略 */
                  }
                  setShowShortcutHelp(false)
                  setActiveTab('report')
                }}
                title="重新顯示首頁歡迎卡（4 步驟新手引導）"
              >
                重新顯示歡迎卡
              </button>
            </div>
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
