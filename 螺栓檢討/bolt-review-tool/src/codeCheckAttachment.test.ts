import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateProjectBatch,
} from './calc'
import {
  anchorApplicationLabel,
  anchorConfigurationLabel,
  buildCodeCheckReviewSummary,
  codeCheckConfigurationIssues,
  codeCheckFormula,
  codeCheckScopeRows,
  isCodeCheckResult,
  normalizeAnchorApplication,
  reportModeLabel,
} from './codeCheckAttachment'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { buildStandaloneReportHtml } from './reportExport'
import { buildResultRows, buildSummaryRows } from './reportWorkbook'
import { normalizeUnitPreferences } from './units'

function buildCodeCheckParams() {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )!
  const project = {
    ...defaultProject,
    anchorApplication: 'isolated_footing' as const,
    excludedCheckIds: [],
    layout: {
      ...defaultProject.layout,
      basePlateBearingEnabled: false,
      basePlateBendingEnabled: false,
    },
    report: normalizeReportSettings({
      ...defaultProject.report,
      reportMode: 'code_check',
    }),
  }
  const batchReview = evaluateProjectBatch(project, product)
  return {
    batchReview,
    candidateProductReviews: evaluateCandidateProducts(
      project,
      defaultProducts.slice(0, 2),
    ),
    review: batchReview.activeReview,
    selectedProduct: product,
    completeness: assessProductCompleteness(product),
    evaluationFieldStates: getEvaluationFieldStates(product),
    unitPreferences: normalizeUnitPreferences(project.ui),
    reportSettings: normalizeReportSettings(project.report),
  }
}

describe('錨栓規範簡核附件', () => {
  it('將舊案例安全正規化，並區分單錨與群錨', () => {
    expect(normalizeAnchorApplication(undefined)).toBe('general')
    expect(anchorApplicationLabel('isolated_footing')).toContain('獨立基腳')
    expect(anchorApplicationLabel('slab_attachment')).toContain('板上')
    expect(anchorConfigurationLabel(1)).toBe('1 支／單錨')
    expect(anchorConfigurationLabel(4)).toContain('4 支／群錨')
    expect(reportModeLabel('code_check')).toBe('規範簡核附件版')
  })

  it('只納入第 17 章錨栓破壞模式，並提供規範式', () => {
    expect(isCodeCheckResult({ id: 'steel-tension' })).toBe(true)
    expect(isCodeCheckResult({ id: 'concrete-bearing' })).toBe(false)
    expect(codeCheckFormula({ id: 'steel-tension' })).toContain('φNsa')
    expect(codeCheckFormula({ id: 'concrete-breakout-tension' })).toContain(
      'ANc/ANco',
    )
    expect(codeCheckFormula({ id: 'interaction' })).toContain('17.8')
  })

  it('簡核封面結論不受非第 17 章基板模組污染', () => {
    const params = buildCodeCheckParams()
    const referenceResult = params.review.results[0]
    const scopedSummary = buildCodeCheckReviewSummary({
      ...params.review,
      results: [
        ...params.review.results,
        {
          ...referenceResult,
          id: 'concrete-bearing',
          mode: '混凝土承壓強度',
          status: 'fail',
          dcr: 999,
          demandKn: 999,
          designStrengthKn: 1,
        },
      ],
    })

    expect(scopedSummary.overallStatus).toBe('pass')
    expect(scopedSummary.governingMode).not.toBe('混凝土承壓強度')
    expect(scopedSummary.maxDcr).toBeLessThan(999)
  })

  it('將用途、群錨效應、公式與植筋邊界寫入 HTML 附件', () => {
    const params = buildCodeCheckParams()
    const html = buildStandaloneReportHtml(params)

    expect(html).toContain('規範簡核附件版')
    expect(html).toContain('規範簡核範圍與適用性')
    expect(html).toContain('獨立基腳錨栓連接')
    expect(html).toContain('群錨投影面積')
    expect(html).toContain('規範公式與代入說明')
    expect(html).toContain('φNsa')
    expect(html).toContain('不等於結構植筋')
    expect(html).not.toContain('<h2>候選產品比選</h2>')
  })

  it('將簡核範圍與公式寫入 XLSX/DOCX 共用資料列', () => {
    const params = buildCodeCheckParams()
    const summaryRows = buildSummaryRows(params)
    const resultRows = buildResultRows(params)

    expect(summaryRows).toContainEqual({
      項目: '輸出模式',
      值: '規範簡核附件版',
    })
    expect(summaryRows).toContainEqual(
      expect.objectContaining({ 項目: '檢核用途', 值: expect.stringContaining('獨立基腳') }),
    )
    expect(resultRows.length).toBeGreaterThan(0)
    expect(resultRows.every((row) => String(row.規範公式 ?? '').length > 0)).toBe(
      true,
    )
    expect(resultRows.some((row) => row.檢核模式 === '混凝土承壓強度')).toBe(false)
  })

  it('將未指定用途或混入基板模組列為待確認', () => {
    expect(
      codeCheckConfigurationIssues({
        ...defaultProject,
        anchorApplication: 'general',
      }),
    ).toContainEqual(expect.stringContaining('尚未指定'))
    expect(
      codeCheckConfigurationIssues({
        ...defaultProject,
        anchorApplication: 'slab_attachment',
        layout: {
          ...defaultProject.layout,
          basePlateBearingEnabled: true,
        },
      }),
    ).toContainEqual(expect.stringContaining('基板承壓'))
    expect(codeCheckScopeRows(defaultProject, 1)[1].value).toContain('單錨')
  })
})
