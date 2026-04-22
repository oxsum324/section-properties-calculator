import { getAnchorReinforcementOverlay } from './anchorReinforcementOverlay'
import { getBasePlateBearingOverlay } from './bearingOverlay'
import {
  getBasePlatePlanDimensions,
  getColumnSectionType,
  getDerivedBasePlateCantilevers,
} from './basePlateGeometry'
import { getResultPresentationSummary } from './resultPresentation'
import { getSeismicRouteGuidance } from './seismicRouteGuidance'
import type {
  AnchorProduct,
  CheckResult,
  DimensionCheck,
  ProjectAuditEntry,
  ReportSettings,
  ReviewResult,
  ReviewStatus,
  UnitPreferences,
} from './domain'
import { getUnitSymbol, toDisplayValue } from './units'
import type { EvaluationFieldState } from './evaluationCatalog'

export interface ReportArtifactParams {
  batchReview: ReturnType<typeof import('./calc').evaluateProjectBatch>
  candidateProductReviews: ReturnType<typeof import('./calc').evaluateCandidateProducts>
  layoutVariantReviews?: ReturnType<typeof import('./calc').evaluateLayoutVariants>
  review: ReviewResult
  selectedProduct: AnchorProduct
  completeness: { formal: boolean; missing: string[] }
  evaluationFieldStates: EvaluationFieldState[]
  unitPreferences: UnitPreferences
  reportSettings: ReportSettings
  saveMessage: string
  auditEntry?: ProjectAuditEntry
  auditTrail?: ProjectAuditEntry[]
  autoPrint?: boolean
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 2,
  }).format(value)
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

function familyLabel(family: AnchorProduct['family']) {
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

function reportModeLabel(mode: ReportSettings['reportMode']) {
  return mode === 'summary' ? '摘要版' : '完整明細版'
}

function sectionCitation(title: string, clause: string) {
  return `${clause} ${title}`
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

function formatAuditHash(hash?: string, length = 12) {
  if (!hash) {
    return '—'
  }

  return hash.slice(0, Math.max(8, length)).toUpperCase()
}

function auditSourceLabel(source?: ProjectAuditEntry['source']) {
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
      return '—'
  }
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

function formatQuantity(
  value: number,
  quantity: 'length' | 'area' | 'force' | 'stress' | 'moment',
  units: UnitPreferences,
) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return `${formatNumber(toDisplayValue(value, quantity, units))} ${getUnitSymbol(quantity, units)}`
}

function formatLayoutVariantSummary(
  layout: ReviewResult['project']['layout'],
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

function getGoverningDcr(summary: { governingDcr?: number; maxDcr: number }) {
  return summary.governingDcr ?? summary.maxDcr
}

function getEffectiveBasePlateLoadedArea(review: ReviewResult) {
  if (review.project.layout.basePlateLoadedAreaMm2 > 0) {
    return review.project.layout.basePlateLoadedAreaMm2
  }
  const width = Math.max(0, review.project.layout.basePlateLoadedWidthMm ?? 0)
  const height = Math.max(0, review.project.layout.basePlateLoadedHeightMm ?? 0)
  return width > 0 && height > 0 ? width * height : 0
}

function getBasePlateSectionType(review: ReviewResult) {
  return review.project.layout.basePlateSectionType === 'custom'
    ? 'custom'
    : 'rectangle'
}

function basePlateSectionTypeLabel(sectionType: 'rectangle' | 'custom') {
  return sectionType === 'custom' ? '自訂 Sx / Sy' : '矩形承壓區'
}

function columnSectionTypeLabel(
  sectionType: ReturnType<typeof getColumnSectionType>,
) {
  switch (sectionType) {
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

function getGeometryZoneClass(kind: ReviewResult['visualization']['rectangles'][number]['kind']) {
  return `zone-${kind}`
}

function buildStatusChip(status: ReviewStatus) {
  return `<span class="chip chip-${status}">${escapeHtml(statusLabel(status))}</span>`
}

function buildGeometrySketchSvg(review: ReviewResult, units: UnitPreferences) {
  const { layout } = review.project
  const anchorReinforcementOverlay = getAnchorReinforcementOverlay(
    layout,
    review.anchorPoints,
  )
  const basePlateBearingOverlay = getBasePlateBearingOverlay(
    layout,
    review.analysisLoads,
  )
  const edgeLabelMap = new Map<string, string[]>()
  const anchorStateMap = new Map(
    review.visualization.anchors.map((item) => [item.anchorId, item]),
  )

  review.visualization.edges.forEach((item) => {
    const labels = edgeLabelMap.get(item.edge) ?? []
    if (!labels.includes(item.label)) {
      labels.push(item.label)
    }
    edgeLabelMap.set(item.edge, labels)
  })

  const rectangles = review.visualization.rectangles
    .map(
      (rectangle) =>
        `<rect x="${rectangle.x1}" y="${rectangle.y1}" width="${rectangle.x2 - rectangle.x1}" height="${rectangle.y2 - rectangle.y1}" class="zone ${getGeometryZoneClass(rectangle.kind)}" />`,
    )
    .join('')

  const bearingOverlay = basePlateBearingOverlay
    ? `<g>
        <rect
          x="${basePlateBearingOverlay.loadedArea.x1}"
          y="${basePlateBearingOverlay.loadedArea.y1}"
          width="${basePlateBearingOverlay.loadedArea.x2 - basePlateBearingOverlay.loadedArea.x1}"
          height="${basePlateBearingOverlay.loadedArea.y2 - basePlateBearingOverlay.loadedArea.y1}"
          class="bearing-zone"
        />
        ${
          basePlateBearingOverlay.contactArea
            ? `<rect
                x="${basePlateBearingOverlay.contactArea.x1}"
                y="${basePlateBearingOverlay.contactArea.y1}"
                width="${basePlateBearingOverlay.contactArea.x2 - basePlateBearingOverlay.contactArea.x1}"
                height="${basePlateBearingOverlay.contactArea.y2 - basePlateBearingOverlay.contactArea.y1}"
                class="bearing-contact-zone bearing-contact-zone-${basePlateBearingOverlay.mode}"
              />`
            : ''
        }
        <text
          x="${basePlateBearingOverlay.labelX}"
          y="${basePlateBearingOverlay.labelY}"
          class="bearing-overlay-label"
        >${escapeHtml(basePlateBearingOverlay.label)}</text>
      </g>`
    : ''

  const anchors = review.anchorPoints
    .map((point) => {
      const anchorState = anchorStateMap.get(point.id)
      const stateClass =
        anchorState?.state === 'tension'
          ? 'anchor-tension'
          : anchorState?.state === 'compression'
            ? 'anchor-compression'
            : 'anchor-neutral'
      const elastic = anchorState
        ? `${anchorState.elasticTensionKn >= 0 ? '+' : ''}${formatNumber(anchorState.elasticTensionKn)}`
        : '0'

      return `<g>
        <circle cx="${point.x}" cy="${point.y}" r="10" class="anchor ${stateClass}" />
        <circle cx="${point.x}" cy="${point.y}" r="3" class="anchor-center" />
        <text x="${point.x}" y="${point.y - 16}" text-anchor="middle" class="anchor-label">${escapeHtml(point.id)}</text>
        <text x="${point.x}" y="${point.y + 24}" text-anchor="middle" class="anchor-demand">${escapeHtml(elastic)}</text>
      </g>`
    })
    .join('')

  const edgeLabels = Array.from(edgeLabelMap.entries())
    .map(([edge, labels]) => {
      const text = escapeHtml(labels.join(' / '))
      if (edge === 'left') {
        return `<g><line x1="4" y1="0" x2="4" y2="${layout.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${text}</text></g>`
      }
      if (edge === 'right') {
        return `<g><line x1="${layout.concreteWidthMm - 4}" y1="0" x2="${layout.concreteWidthMm - 4}" y2="${layout.concreteHeightMm}" class="edge-highlight" /><text x="${layout.concreteWidthMm - 12}" y="22" text-anchor="end" class="edge-label">${text}</text></g>`
      }
      if (edge === 'bottom') {
        return `<g><line x1="0" y1="${layout.concreteHeightMm - 4}" x2="${layout.concreteWidthMm}" y2="${layout.concreteHeightMm - 4}" class="edge-highlight" /><text x="12" y="${layout.concreteHeightMm - 12}" class="edge-label">${text}</text></g>`
      }
      return `<g><line x1="0" y1="4" x2="${layout.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${text}</text></g>`
    })
    .join('')

  const reinforcementOverlay = anchorReinforcementOverlay
    ? `<g>
        <rect
          x="${anchorReinforcementOverlay.x1}"
          y="${anchorReinforcementOverlay.y1}"
          width="${anchorReinforcementOverlay.x2 - anchorReinforcementOverlay.x1}"
          height="${anchorReinforcementOverlay.y2 - anchorReinforcementOverlay.y1}"
          class="reinforcement-zone"
        />
        <line
          x1="${anchorReinforcementOverlay.x1}"
          y1="${anchorReinforcementOverlay.y1}"
          x2="${anchorReinforcementOverlay.x2}"
          y2="${anchorReinforcementOverlay.y2}"
          class="reinforcement-line"
        />
        <line
          x1="${anchorReinforcementOverlay.x2}"
          y1="${anchorReinforcementOverlay.y1}"
          x2="${anchorReinforcementOverlay.x1}"
          y2="${anchorReinforcementOverlay.y2}"
          class="reinforcement-line"
        />
        <text
          x="${anchorReinforcementOverlay.labelX}"
          y="${anchorReinforcementOverlay.labelY}"
          class="reinforcement-label"
        >${escapeHtml(anchorReinforcementOverlay.label)}</text>
      </g>`
    : ''

  return `<svg class="geometry" viewBox="0 0 ${layout.concreteWidthMm} ${layout.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${layout.concreteWidthMm}" height="${layout.concreteHeightMm}" rx="8" class="concrete-body" />
    ${bearingOverlay}
    ${rectangles}
    ${reinforcementOverlay}
    ${edgeLabels}
    ${anchors}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${layout.concreteHeightMm - 14}" class="sketch-meta">${escapeHtml(
      `${formatQuantity(layout.concreteWidthMm, 'length', units)} × ${formatQuantity(layout.concreteHeightMm, 'length', units)}`,
    )}</text>
  </svg>`
}

export function buildStandaloneReportHtml(params: ReportArtifactParams) {
  const {
    batchReview,
    candidateProductReviews,
    layoutVariantReviews = [],
    review,
    selectedProduct,
    completeness,
    evaluationFieldStates,
    unitPreferences,
    reportSettings,
    saveMessage,
    auditEntry,
    auditTrail = [],
    autoPrint = false,
  } = params

  const evidenceRows = evaluationFieldStates.filter(
    (field) => field.hasValue || field.hasEvidence,
  )
  const factorResults = review.results.filter(
    (result) => result.factors && result.factors.length > 0,
  )
  const seismicResult =
    review.results.find((result) => result.id === 'seismic') ?? null
  const seismicRouteGuidance = review.project.loads.considerSeismic
    ? getSeismicRouteGuidance(
        review.project.loads,
        selectedProduct,
        seismicResult,
      )
    : null
  const basePlateSectionType = getBasePlateSectionType(review)
  const basePlatePlan = getBasePlatePlanDimensions(review.project.layout)
  const derivedBasePlateCantilevers = getDerivedBasePlateCantilevers(
    review.project.layout,
  )
  const columnSectionType = getColumnSectionType(review.project.layout)
  const candidateMatrixRows = batchReview.loadCaseReviews
    .map((loadCaseReview) => {
      const cells = candidateProductReviews
        .map((candidateReview) => {
          const candidateLoadCase = candidateReview.batchReview.loadCaseReviews.find(
            (item) => item.loadCaseId === loadCaseReview.loadCaseId,
          )
          if (!candidateLoadCase) {
            return '<td>—</td>'
          }

          return `<td>
            <strong>DCR ${escapeHtml(
              formatNumber(getGoverningDcr(candidateLoadCase.review.summary)),
            )}</strong><br />
            ${buildStatusChip(candidateLoadCase.review.summary.overallStatus)}<br />
            <small>${escapeHtml(candidateLoadCase.review.summary.governingMode)}${candidateReview.batchReview.controllingLoadCaseId === loadCaseReview.loadCaseId ? ' / 該產品控制' : ''}</small>
          </td>`
        })
        .join('')

      const suffix =
        loadCaseReview.loadCaseId === batchReview.activeLoadCaseId &&
        loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId
          ? '（目前編輯 / 控制組合）'
          : loadCaseReview.loadCaseId === batchReview.activeLoadCaseId
            ? '（目前編輯）'
            : loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId
              ? '（控制組合）'
              : ''

      return `<tr><td>${escapeHtml(loadCaseReview.loadCaseName + suffix)}</td>${cells}</tr>`
    })
    .join('')

  const layoutMatrixRows = batchReview.loadCaseReviews
    .map((loadCaseReview) => {
      const cells = layoutVariantReviews
        .map((layoutVariantReview) => {
          const layoutLoadCase = layoutVariantReview.batchReview.loadCaseReviews.find(
            (item) => item.loadCaseId === loadCaseReview.loadCaseId,
          )

          if (!layoutLoadCase) {
            return '<td>—</td>'
          }

          return `<td>
              <div class="matrix-cell${layoutVariantReview.batchReview.controllingLoadCaseId === loadCaseReview.loadCaseId ? ' matrix-cell-controlling' : ''}">
                <strong>DCR ${escapeHtml(
                  formatNumber(getGoverningDcr(layoutLoadCase.review.summary)),
                )}</strong>
                ${buildStatusChip(layoutLoadCase.review.summary.overallStatus)}
                <small>${escapeHtml(layoutLoadCase.review.summary.governingMode)}${layoutVariantReview.batchReview.controllingLoadCaseId === loadCaseReview.loadCaseId ? ' / 該配置控制' : ''}</small>
              </div>
            </td>`
        })
        .join('')

      const label = loadCaseReview.loadCaseId === batchReview.activeLoadCaseId &&
        loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId
        ? '目前編輯 / 控制組合'
        : loadCaseReview.loadCaseId === batchReview.activeLoadCaseId
          ? '目前編輯'
          : loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId
            ? '控制組合'
            : '批次結果'

      return `<tr>
          <td>
            <div class="table-mode">
              <strong>${escapeHtml(loadCaseReview.loadCaseName)}</strong>
              <small>${escapeHtml(label)}</small>
            </div>
          </td>
          ${cells}
        </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(review.project.name)} - 錨栓檢討報告</title>
    <style>
      @page { size: A4; margin: 14mm 12mm 16mm; }
      :root { color-scheme: light; --ink:#14213d; --muted:#5b6475; --line:#d8deea; --panel:#f7f9fc; --accent:#0b7285; --warn:#c2410c; --pass:#166534; --fail:#b91c1c; --screen:#7c3aed; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif; color:var(--ink); background:#eef2f7; }
      main { max-width:1120px; margin:0 auto; padding:32px 24px 72px; }
      h1,h2,h3 { margin:0 0 12px; }
      p,li,td,th,dd,dt,small,span,strong { line-height:1.5; }
      .hero { background:linear-gradient(135deg,#ffffff 0%,#eef8fb 100%); border:1px solid var(--line); border-radius:24px; padding:28px; margin-bottom:24px; }
      .hero-grid,.grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
      .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:20px; margin-bottom:20px; box-shadow:0 8px 20px rgba(20,33,61,.06); }
      .chip { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; margin-right:6px; }
      .chip-pass { background:#dcfce7; color:var(--pass); }
      .chip-fail { background:#fee2e2; color:var(--fail); }
      .chip-incomplete { background:#fef3c7; color:#92400e; }
      .chip-screening { background:#ede9fe; color:var(--screen); }
      .chip-warning { background:#ffedd5; color:var(--warn); }
      .meta { color:var(--muted); }
      table { width:100%; border-collapse:collapse; }
      th,td { border:1px solid var(--line); padding:10px 12px; text-align:left; vertical-align:top; }
      th { background:#eef5fb; }
      .route-matrix { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:14px 0; }
      .route-matrix-card { border:1px solid var(--line); border-radius:14px; padding:12px; background:rgba(255,255,255,.76); }
      .route-matrix-card-current { box-shadow:inset 0 0 0 1px rgba(15,84,97,.12); }
      .route-matrix-card-ready { border-color:rgba(13,107,85,.22); }
      .route-matrix-card-needs_input { border-color:rgba(201,138,45,.24); }
      .route-matrix-card-configuration_issue { border-color:rgba(194,109,62,.26); }
      .route-matrix-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px; }
      .route-matrix-head strong { display:block; }
      .route-matrix-head small { color:var(--muted); }
      .route-matrix-bar { height:10px; border-radius:999px; background:rgba(15,58,69,.09); overflow:hidden; margin-bottom:8px; }
      .route-matrix-bar span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg, rgba(15,84,97,.88), rgba(194,109,62,.82)); }
      .geometry-wrap { overflow:auto; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:12px; }
      .geometry { width:100%; min-width:420px; height:auto; }
      .concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
      .bearing-zone { fill:rgba(123,92,168,.09); stroke:rgba(94,65,139,.42); stroke-width:2.4; stroke-dasharray:10 8; }
      .bearing-contact-zone { fill:rgba(110,77,163,.20); stroke:rgba(85,56,132,.56); stroke-width:2.8; }
      .bearing-contact-zone-uplift_x,.bearing-contact-zone-uplift_y,.bearing-contact-zone-uplift_xy { fill:rgba(129,72,191,.24); }
      .bearing-overlay-label { fill:#45315f; font-size:16px; font-weight:700; }
      .zone-tension_breakout { fill:rgba(14,165,233,.18); stroke:#0284c7; stroke-width:2; }
      .zone-shear_breakout_x,.zone-shear_breakout_y { fill:rgba(249,115,22,.16); stroke:#ea580c; stroke-width:2; }
      .reinforcement-zone { fill:rgba(24,133,84,.08); stroke:rgba(20,108,69,.6); stroke-width:2.5; stroke-dasharray:10 8; }
      .reinforcement-line { stroke:rgba(20,108,69,.55); stroke-width:2.5; stroke-linecap:round; }
      .edge-highlight { stroke:#dc2626; stroke-width:4; stroke-dasharray:10 8; }
      .edge-label,.anchor-label,.anchor-demand,.sketch-title,.sketch-legend,.sketch-meta,.reinforcement-label { font-size:12px; fill:#22304a; }
      .anchor { stroke:#10213b; stroke-width:2; }
      .anchor-tension { fill:#ef4444; }
      .anchor-compression { fill:#2563eb; }
      .anchor-neutral { fill:#9ca3af; }
      .anchor-center { fill:#fff; }
      ul { margin:8px 0 0; padding-left:20px; }
      @media print {
        body { background:#fff; }
        main { max-width:none; padding:0; }
        .card,.hero,.geometry-wrap { box-shadow:none; break-inside:avoid-page; }
        table { break-inside:auto; }
        tr,td,th { break-inside:avoid; }
        h2,h3 { break-after:avoid-page; }
        .hero { break-after:page; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="meta">${escapeHtml(reportSettings.companyName || '工程報表草稿')}</p>
        <h1>${escapeHtml(review.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${escapeHtml(reportModeLabel(reportSettings.reportMode))}</p>
        <div class="hero-grid">
          <div><small class="meta">案號 / 專案</small><div>${escapeHtml(reportSettings.projectCode || '未填')}</div></div>
          <div><small class="meta">規範版本</small><div>${escapeHtml(review.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${escapeHtml(formatDate(reportSettings.issueDate))}</div></div>
          <div><small class="meta">輸出時間</small><div>${escapeHtml(formatDateTime(review.project.updatedAt))}</div></div>
          <div><small class="meta">留痕 Hash</small><div>${escapeHtml(formatAuditHash(auditEntry?.hash))}</div></div>
          <div><small class="meta">留痕時間</small><div>${escapeHtml(formatDateTime(auditEntry?.createdAt))}</div></div>
          <div><small class="meta">整體判定</small><div>${buildStatusChip(batchReview.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${buildStatusChip(batchReview.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${escapeHtml(batchReview.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${escapeHtml(batchReview.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${escapeHtml(selectedProduct.brand)} ${escapeHtml(selectedProduct.model)}</strong> / ${escapeHtml(familyLabel(selectedProduct.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${escapeHtml(formatQuantity(selectedProduct.diameterMm, 'length', unitPreferences))}</li>
            <li>Ase = ${escapeHtml(formatQuantity(selectedProduct.effectiveAreaMm2, 'area', unitPreferences))}</li>
            <li>目前單位 = ${escapeHtml(getUnitSymbol('length', unitPreferences))} / ${escapeHtml(getUnitSymbol('area', unitPreferences))} / ${escapeHtml(getUnitSymbol('force', unitPreferences))} / ${escapeHtml(getUnitSymbol('stress', unitPreferences))}</li>
            <li>產品完整性 = ${escapeHtml(completeness.formal ? '正式判定' : '需補資料')}</li>
            <li>基板承壓 = ${escapeHtml(review.project.layout.basePlateBearingEnabled ? `已啟用（A1 ${formatQuantity(getEffectiveBasePlateLoadedArea(review), 'area', unitPreferences)} / ${basePlateSectionTypeLabel(basePlateSectionType)}${basePlatePlan.widthMm > 0 && basePlatePlan.heightMm > 0 ? ` / B × N ${formatQuantity(basePlatePlan.widthMm, 'length', unitPreferences)} × ${formatQuantity(basePlatePlan.heightMm, 'length', unitPreferences)}` : ''}${((review.project.layout.columnCentroidOffsetXmm ?? 0) !== 0 || (review.project.layout.columnCentroidOffsetYmm ?? 0) !== 0) ? ` / 柱偏移 ${formatQuantity(review.project.layout.columnCentroidOffsetXmm ?? 0, 'length', unitPreferences)} × ${formatQuantity(review.project.layout.columnCentroidOffsetYmm ?? 0, 'length', unitPreferences)}` : ''}${review.project.layout.basePlateBendingEnabled ? ` / tp ${formatQuantity(review.project.layout.basePlateThicknessMm, 'length', unitPreferences)} / Fy ${formatQuantity(review.project.layout.basePlateSteelYieldMpa, 'stress', unitPreferences)}` : ''}）` : '未啟用')}</li>
          </ul>
          ${
            seismicRouteGuidance
              ? `<p class="meta">耐震路徑狀態：${escapeHtml(seismicRouteGuidance.title)} / ${escapeHtml(seismicRouteGuidance.stateMessage)}${seismicRouteGuidance.recommendation ? ` 建議：${escapeHtml(seismicRouteGuidance.recommendation.title)}。` : ''}</p>`
              : ''
          }
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${escapeHtml(formatNumber(getGoverningDcr(batchReview.summary)))}</li>
            <li>批次最大數值 DCR = ${escapeHtml(formatNumber(batchReview.summary.maxDcr))}</li>
            <li>控制拉力 = ${escapeHtml(batchReview.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${escapeHtml(batchReview.summary.governingShearMode)}</li>
            <li>離線狀態 = ${escapeHtml(saveMessage)}</li>
            <li>最新留痕 = ${escapeHtml(auditEntry ? `${formatAuditHash(auditEntry.hash)} / ${auditSourceLabel(auditEntry.source)}` : '未留存')}</li>
          </ul>
          ${
            getGoverningDcr(batchReview.summary) < batchReview.summary.maxDcr
              ? '<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>'
              : ''
          }
        </article>
      </section>

      ${
        auditTrail.length > 0
          ? `<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${auditTrail
                    .map(
                      (entry) => `<tr>
                        <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
                        <td>${escapeHtml(auditSourceLabel(entry.source))}</td>
                        <td><code>${escapeHtml(formatAuditHash(entry.hash, 16))}</code></td>
                        <td>${escapeHtml(entry.summary.controllingLoadCaseName ?? '—')}</td>
                        <td>${escapeHtml(entry.summary.governingMode)}</td>
                        <td>${escapeHtml(formatNumber(entry.summary.governingDcr ?? entry.summary.maxDcr))}</td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </section>`
          : ''
      }

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${buildGeometrySketchSvg(review, unitPreferences)}
        </div>
        ${
          review.project.layout.basePlateBearingEnabled
            ? `<p class="meta">基板承壓：A1 ${escapeHtml(formatQuantity(getEffectiveBasePlateLoadedArea(review), 'area', unitPreferences))} / A2 ${escapeHtml(formatQuantity(review.project.layout.basePlateSupportAreaMm2, 'area', unitPreferences))}${(review.project.layout.basePlateLoadedWidthMm ?? 0) > 0 && (review.project.layout.basePlateLoadedHeightMm ?? 0) > 0 ? ` / b1 × h1 ${escapeHtml(formatQuantity(review.project.layout.basePlateLoadedWidthMm ?? 0, 'length', unitPreferences))} × ${escapeHtml(formatQuantity(review.project.layout.basePlateLoadedHeightMm ?? 0, 'length', unitPreferences))}` : ''}${basePlatePlan.widthMm > 0 && basePlatePlan.heightMm > 0 ? ` / B × N ${escapeHtml(formatQuantity(basePlatePlan.widthMm, 'length', unitPreferences))} × ${escapeHtml(formatQuantity(basePlatePlan.heightMm, 'length', unitPreferences))}` : ''}${((review.project.layout.columnCentroidOffsetXmm ?? 0) !== 0 || (review.project.layout.columnCentroidOffsetYmm ?? 0) !== 0) ? ` / 柱偏移 ${escapeHtml(formatQuantity(review.project.layout.columnCentroidOffsetXmm ?? 0, 'length', unitPreferences))} × ${escapeHtml(formatQuantity(review.project.layout.columnCentroidOffsetYmm ?? 0, 'length', unitPreferences))}` : ''} / ${escapeHtml(basePlateSectionTypeLabel(basePlateSectionType))}${basePlateSectionType === 'custom' ? ` / Sx ${escapeHtml(formatNumber(review.project.layout.basePlateSectionModulusXmm3 ?? 0))} mm³ / Sy ${escapeHtml(formatNumber(review.project.layout.basePlateSectionModulusYmm3 ?? 0))} mm³` : ''}</p>
               <p class="meta">${basePlateSectionType === 'custom' ? '若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。' : '若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。'}${columnSectionType !== 'manual' ? ` 基板抗彎若未手填 lx / ly，可由 ${escapeHtml(columnSectionTypeLabel(columnSectionType))}、B / N 與柱尺寸自動推算。` : ''}</p>
               ${derivedBasePlateCantilevers ? `<p class="meta">AISC DG1 自動推算：m = ${escapeHtml(formatQuantity(derivedBasePlateCantilevers.mMm, 'length', unitPreferences))} / n = ${escapeHtml(formatQuantity(derivedBasePlateCantilevers.nMm, 'length', unitPreferences))} / λn' = ${escapeHtml(formatQuantity(derivedBasePlateCantilevers.lambdaPrimeMm, 'length', unitPreferences))} / 建議 lx = ${escapeHtml(formatQuantity(derivedBasePlateCantilevers.xMm, 'length', unitPreferences))} / ly = ${escapeHtml(formatQuantity(derivedBasePlateCantilevers.yMm, 'length', unitPreferences))}</p>` : ''}`
            : ''
        }
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${batchReview.loadCaseReviews
              .map(
                (item) => `<tr>
                  <td>${escapeHtml(item.loadCaseName)}</td>
                  <td>${escapeHtml(formatQuantity(item.review.analysisLoads.tensionKn, 'force', unitPreferences))}</td>
                  <td>${escapeHtml(formatQuantity(Math.hypot(item.review.analysisLoads.shearXKn, item.review.analysisLoads.shearYKn), 'force', unitPreferences))}</td>
                  <td>${escapeHtml(item.review.summary.governingMode)}</td>
                  <td>${escapeHtml(formatNumber(getGoverningDcr(item.review.summary)))}</td>
                  <td>${buildStatusChip(item.review.summary.overallStatus)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        ${review.analysisNote ? `<p class="meta">${escapeHtml(review.analysisNote)}</p>` : ''}
      </section>

      ${
        seismicRouteGuidance
          ? `<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${escapeHtml(seismicRouteGuidance.title)}</strong> / ${escapeHtml(seismicRouteGuidance.clause)}</p>
              <p class="meta">${escapeHtml(seismicRouteGuidance.summary)}</p>
              <p class="meta">目前路徑狀態：${escapeHtml(seismicRouteGuidance.stateMessage)}</p>
              <div class="route-matrix">
                ${seismicRouteGuidance.routeMatrix
                  .map(
                    (route) => `<article class="route-matrix-card route-matrix-card-${route.state}${route.isCurrent ? ' route-matrix-card-current' : ''}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${escapeHtml(route.title)}</strong>
                          <small>${escapeHtml(route.clause)}${route.isCurrent ? ' / 目前路徑' : ''}</small>
                        </div>
                        <span class="chip chip-${getSeismicGuidanceBadgeStatus(route.state)}">${escapeHtml(route.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6, Math.round(route.readinessScore * 100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(route.readinessScore * 100)}% / 待補輸入 ${route.missingInputCount} 項${route.configurationIssueCount > 0 ? `，配置限制 ${route.configurationIssueCount} 項` : ''}</p>
                    </article>`,
                  )
                  .join('')}
              </div>
              ${
                seismicRouteGuidance.recommendation
                  ? `<p class="meta">建議路徑：<strong>${escapeHtml(seismicRouteGuidance.recommendation.title)}</strong>。${escapeHtml(seismicRouteGuidance.recommendation.reason)}</p>`
                  : ''
              }
            </section>`
          : ''
      }

      ${
        candidateProductReviews.length > 1
          ? `<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${candidateProductReviews
                    .map(
                      (item) => `<tr>
                        <td>${escapeHtml(item.product.brand)} ${escapeHtml(item.product.model)}${item.product.id === selectedProduct.id ? '（目前選定）' : ''}</td>
                        <td>${escapeHtml(familyLabel(item.product.family))}</td>
                        <td>${escapeHtml(item.batchReview.controllingLoadCaseName)}</td>
                        <td>${escapeHtml(item.batchReview.summary.governingMode)}</td>
                        <td>${escapeHtml(formatNumber(getGoverningDcr(item.batchReview.summary)))}</td>
                        <td>${buildStatusChip(item.batchReview.summary.overallStatus)}</td>
                        <td>${buildStatusChip(item.batchReview.summary.formalStatus)}</td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${candidateProductReviews
                      .map(
                        (item) =>
                          `<th>${escapeHtml(item.product.brand)} ${escapeHtml(item.product.model)}</th>`,
                      )
                      .join('')}
                  </tr>
                </thead>
                <tbody>${candidateMatrixRows}</tbody>
              </table>
            </section>`
          : ''
      }

      ${
        layoutVariantReviews.length > 1
          ? `<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${layoutVariantReviews
                    .map(
                      (item) => `<tr>
                        <td>${escapeHtml(item.variant.name)}${item.isCurrent ? '（目前配置）' : ''}</td>
                        <td>${escapeHtml(formatLayoutVariantSummary(item.variant.layout, unitPreferences))}</td>
                        <td>${escapeHtml(item.batchReview.controllingLoadCaseName)}</td>
                        <td>${escapeHtml(item.batchReview.summary.governingMode)}</td>
                        <td>${escapeHtml(formatNumber(getGoverningDcr(item.batchReview.summary)))}</td>
                        <td>${buildStatusChip(item.batchReview.summary.overallStatus)}</td>
                        <td>${buildStatusChip(item.batchReview.summary.formalStatus)}</td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${layoutVariantReviews
                      .map(
                        (item) =>
                          `<th>${escapeHtml(item.variant.name)}<br /><small class="meta">${escapeHtml(item.isCurrent ? '目前配置' : formatLayoutVariantSummary(item.variant.layout, unitPreferences))}</small></th>`,
                      )
                      .join('')}
                  </tr>
                </thead>
                <tbody>${layoutMatrixRows}</tbody>
              </table>
            </section>`
          : ''
      }

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${review.dimensionChecks
              .map(
                (check) => `<tr>
                  <td>${escapeHtml(check.label)}</td>
                  <td>${escapeHtml(formatQuantity(check.actualMm, 'length', unitPreferences))}</td>
                  <td>${escapeHtml(formatQuantity(check.requiredMm, 'length', unitPreferences))}</td>
                  <td>${escapeHtml(dimensionSourceLabel(check.source))}</td>
                  <td>${escapeHtml(sectionCitation(check.citation.title, check.citation.clause))}</td>
                  <td>${buildStatusChip(check.status)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>破壞模式檢核</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>需求值</th><th>設計值</th><th>DCR</th><th>狀態</th></tr></thead>
          <tbody>
            ${review.results
              .map(
                (result) => `<tr>
                  <td>${escapeHtml(result.mode)}<br /><small class="meta">${escapeHtml(getResultPresentationSummary(result, unitPreferences))}</small></td>
                  <td>${escapeHtml(sectionCitation(result.citation.title, result.citation.clause))}</td>
                  <td>${escapeHtml(formatResultValue(result, result.demandKn, unitPreferences))}</td>
                  <td>${escapeHtml(formatResultValue(result, result.designStrengthKn, unitPreferences))}</td>
                  <td>${escapeHtml(formatNumber(result.dcr))}</td>
                  <td>${buildStatusChip(result.status)} ${escapeHtml(result.formal ? '正式' : '初篩 / 補資料')}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${factorResults
              .map(
                (result) => `<tr>
                  <td>${escapeHtml(result.mode)}</td>
                  <td>${escapeHtml(sectionCitation(result.citation.title, result.citation.clause))}</td>
                  <td>${escapeHtml(formatResultFactorList(result))}</td>
                  <td>${buildStatusChip(result.status)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>

      ${
        evidenceRows.length > 0
          ? `<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${evidenceRows
                    .map((field) => {
                      const rawValue =
                        typeof field.rawValue === 'number' && field.quantity
                          ? formatQuantity(field.rawValue, field.quantity, unitPreferences)
                          : field.rawValue === undefined || field.rawValue === null || field.rawValue === ''
                            ? '未填'
                            : String(field.rawValue)
                      return `<tr>
                        <td>${escapeHtml(field.label)}</td>
                        <td>${escapeHtml(rawValue)}</td>
                        <td>${escapeHtml(field.evidence?.documentName ?? '—')}</td>
                        <td>${escapeHtml(field.evidence?.page ?? '—')}</td>
                        <td>${escapeHtml(field.evidence?.verified ? '是' : '否')}</td>
                      </tr>`
                    })
                    .join('')}
                </tbody>
              </table>
            </section>`
          : ''
      }

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...review.summary.notes, ...completeness.missing]))
            .map((note) => `<li>${escapeHtml(note)}</li>`)
            .join('')}
        </ul>
      </section>
    </main>
    ${
      autoPrint
        ? `<script>
            window.addEventListener('load', () => {
              window.setTimeout(() => window.print(), 160)
            })
          </script>`
        : ''
    }
  </body>
</html>`

  return html
}
