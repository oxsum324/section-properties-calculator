/**
 * 列印報表元件：把 batchReview / candidateReviews / layoutVariants / 評估證據 /
 * 留痕等資料組成完整的列印頁面（封面 + 摘要 + 條文 + 候選比選 + 佐證表 + 簽證頁）。
 *
 * 從 App.tsx 抽出（~926 行，是專案中最大的單一元件）；
 * 與獨立 reportExport 模組（HTML 匯出版）共用 4 個比較矩陣 helper 與部分格式化函式。
 */
import {
  CURRENT_APP_BUILD_TIME,
  CURRENT_CALC_ENGINE_VERSION,
  ENGINEERING_USE_DISCLAIMER,
} from './appMeta'
import {
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
  assessProductCompleteness,
} from './calc'
import type {
  AnchorFamily,
  AnchorLayout,
  AnchorProduct,
  BasePlateSectionType,
  ProjectAuditEntry,
  ProjectCase,
  ProjectDocumentKind,
  ReportMode,
  ReportSettings,
  ReviewResult,
  ReviewStatus,
  UnitPreferences,
} from './domain'
import type { EvaluationFieldState } from './evaluationCatalog'
import {
  auditSourceLabel,
  formatDateTime,
  formatFileSize,
  formatLayoutVariantSummary,
  formatNumber,
  formatQuantity,
  getGoverningDcr,
} from './formatHelpers'
import { getUnitSymbol, type QuantityKind } from './units'
import { getResultPresentationSummary } from './resultPresentation'
import {
  dimensionSourceLabel,
  formatResultFactorList,
  formatResultValue,
  sectionCitation,
  statusLabel,
} from './resultDisplayHelpers'
import { REPORT_TIMESTAMP_LABELS } from './reportTimestamps'
import {
  buildCandidateComparisonMatrix,
  buildLayoutComparisonMatrix,
} from './reviewArtifacts'

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

function reportModeLabel(mode: ReportMode) {
  return mode === 'summary' ? '摘要版' : '完整明細版'
}

function seismicInputModeLabel(
  mode: ProjectCase['loads']['seismicInputMode'],
) {
  return mode === 'static_plus_earthquake'
    ? '靜載 / 非地震分量 + 地震分量'
    : '總設計值已含地震分量'
}

function familyLabel(family: AnchorFamily): string {
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

function getBasePlateSectionType(
  layout: AnchorLayout,
): BasePlateSectionType {
  return layout.basePlateSectionType === 'custom' ? 'custom' : 'rectangle'
}

function basePlateSectionTypeLabel(type: BasePlateSectionType): string {
  return type === 'custom' ? '自訂 Sx / Sy' : '矩形承壓區'
}

function getEffectiveBasePlateLoadedArea(layout: AnchorLayout): number {
  if (layout.basePlateLoadedAreaMm2 > 0) {
    return layout.basePlateLoadedAreaMm2
  }
  const width = Math.max(0, layout.basePlateLoadedWidthMm ?? 0)
  const height = Math.max(0, layout.basePlateLoadedHeightMm ?? 0)
  return width > 0 && height > 0 ? width * height : 0
}

function documentKindLabel(kind: ProjectDocumentKind): string {
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

function formatEvidenceValue(
  value: unknown,
  quantity: QuantityKind | undefined,
  units: UnitPreferences,
): string {
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

export function ReportDocument({
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
        {reportSettings.companyLogoDataUrl ? (
          <img
            src={reportSettings.companyLogoDataUrl}
            alt={reportSettings.companyName || '公司 LOGO'}
            className="report-cover-logo"
          />
        ) : null}
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
        <span>{review.ruleProfile.versionLabel}</span>
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
                  {review.results
                    .filter(
                      (result) =>
                        !(review.project.excludedCheckIds ?? []).includes(
                          result.id,
                        ),
                    )
                    .map((result) => (
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

        <section className="report-section report-disclaimer-section">
          <h2>使用邊界與版本</h2>
          <dl className="report-version-list">
            <div>
              <dt>本案計算版本</dt>
              <dd>
                <code>
                  {review.project.calcEngineVersion ?? CURRENT_CALC_ENGINE_VERSION}
                </code>
              </dd>
            </div>
            <div>
              <dt>目前工具版本</dt>
              <dd>
                <code>{CURRENT_CALC_ENGINE_VERSION}</code> · build{' '}
                {formatDateTime(CURRENT_APP_BUILD_TIME)}
              </dd>
            </div>
            <div>
              <dt>版本一致性</dt>
              <dd>
                {(review.project.calcEngineVersion ??
                  CURRENT_CALC_ENGINE_VERSION) === CURRENT_CALC_ENGINE_VERSION
                  ? '✓ 一致'
                  : '⚠ 不一致：建議重新留痕'}
              </dd>
            </div>
            <div>
              <dt>規範版本</dt>
              <dd>
                {review.ruleProfile.chapter17Title} ·{' '}
                {review.ruleProfile.versionLabel}
              </dd>
            </div>
          </dl>
          <p className="report-disclaimer-text">
            <strong>簽證責任聲明：</strong>
            {ENGINEERING_USE_DISCLAIMER}
          </p>
        </section>
      </div>
    </section>
  )
}
