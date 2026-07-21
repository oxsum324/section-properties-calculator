import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import { CURRENT_CALC_ENGINE_VERSION, ENGINEERING_USE_DISCLAIMER } from './appMeta'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { buildStandaloneReportHtml } from './reportExport'
import { normalizeUnitPreferences } from './units'

const PAGE_ONLY_REPORT_STATUS_NEEDLES = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
  '輸入模式',
  '計算書模式',
  '換算對照',
  '流程顯示',
  '報表模式',
  '輸出設定',
]

function expectNoPageOnlyReportStatus(text: string) {
  for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES) {
    expect(text).not.toContain(needle)
  }
}

describe('buildStandaloneReportHtml', () => {
  it('renders a standalone HTML report with core sections', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const batchReview = evaluateProjectBatch(defaultProject, product!)
    const candidateProductReviews = evaluateCandidateProducts(defaultProject, [
      product!,
    ])
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews,
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(defaultProject.ui),
      reportSettings: normalizeReportSettings({
        companyName: '測試工程顧問有限公司',
        projectCode: 'ANCHOR-001',
        designer: '王設計',
        checker: '李複核',
        issueDate: '2026-07-20',
        documentApproved: true,
        documentApprovedAt: '2026-07-20T10:00:00.000Z',
      }),
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain(defaultProject.name)
    expect(html).toContain('載重組合批次檢核')
    expect(html).toContain('φ / ψ 採用總表')
    expect(html).toContain('使用邊界與版本追溯')
    expect(html).toContain('data-document-state="formal-attachment"')
    expect(html).toContain('文件狀態：正式附件')
    expect(html).toContain('本計算內容已完成審閱，核可作為正式附件')
    expect(html).toContain('王設計')
    expect(html).toContain('李複核')
    expect(html).not.toContain('DRAFT /')
    expect(html).toContain(CURRENT_CALC_ENGINE_VERSION)
    expect(html).toContain(ENGINEERING_USE_DISCLAIMER)
    expect(html).not.toContain('離線狀態')
    expectNoPageOnlyReportStatus(html)
  })

  it('renders audit trail metadata when provided', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const batchReview = evaluateProjectBatch(defaultProject, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(defaultProject, [
        product!,
      ]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(defaultProject.ui),
      reportSettings: normalizeReportSettings(defaultProject.report),
      auditEntry: {
        id: 'audit-1',
        createdAt: '2026-04-22T10:00:00.000Z',
        hash: 'abcdef1234567890abcdef1234567890',
        source: 'manual',
        ruleProfileId: defaultProject.ruleProfileId,
        projectName: defaultProject.name,
        productLabel: `${product!.brand} ${product!.model}`,
        summary: {
          overallStatus: batchReview.summary.overallStatus,
          governingMode: batchReview.summary.governingMode,
          governingDcr:
            batchReview.summary.governingDcr ?? batchReview.summary.maxDcr,
          maxDcr: batchReview.summary.maxDcr,
          controllingLoadCaseName: batchReview.controllingLoadCaseName,
          updatedAt: '2026-04-22T10:00:00.000Z',
        },
      },
      auditTrail: [
        {
          id: 'audit-1',
          createdAt: '2026-04-22T10:00:00.000Z',
          hash: 'abcdef1234567890abcdef1234567890',
          source: 'manual',
          ruleProfileId: defaultProject.ruleProfileId,
          projectName: defaultProject.name,
          productLabel: `${product!.brand} ${product!.model}`,
          summary: {
            overallStatus: batchReview.summary.overallStatus,
            governingMode: batchReview.summary.governingMode,
            governingDcr:
              batchReview.summary.governingDcr ?? batchReview.summary.maxDcr,
            maxDcr: batchReview.summary.maxDcr,
            controllingLoadCaseName: batchReview.controllingLoadCaseName,
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
        },
      ],
    })

    expect(html).toContain('審查留痕')
    expect(html).toContain('ABCDEF123456')
    expect(html).toContain('手動留存')
  })

  it('escapes potentially unsafe text in report fields', () => {
    const product = {
      ...defaultProducts[0],
      brand: 'A&B <Test>',
      model: '"Quoted"',
    }
    const project = {
      ...defaultProject,
      name: '案例 <script>alert(1)</script>',
      selectedProductId: product.id,
    }
    const batchReview = evaluateProjectBatch(project, product)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product]),
      review: batchReview.activeReview,
      selectedProduct: product,
      completeness: assessProductCompleteness(product),
      evaluationFieldStates: getEvaluationFieldStates(product),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('A&amp;B &lt;Test&gt;')
  })

  it('can include an auto-print script for standalone report windows', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const batchReview = evaluateProjectBatch(defaultProject, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(defaultProject, [
        product!,
      ]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(defaultProject.ui),
      reportSettings: normalizeReportSettings(defaultProject.report),
      autoPrint: true,
    })

    expect(html).toContain('window.print()')
  })

  it('renders candidate layout comparison sections when variants are provided', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      candidateLayoutVariants: [
        {
          id: 'layout-wide',
          name: '加大邊距方案',
          layout: {
            ...defaultProject.layout,
            edgeLeftMm: 160,
            edgeRightMm: 160,
            edgeBottomMm: 160,
            edgeTopMm: 160,
          },
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      layoutVariantReviews: evaluateLayoutVariants(
        project,
        product!,
        project.candidateLayoutVariants ?? [],
      ),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('候選配置比選')
    expect(html).toContain('配置 × 載重組合矩陣')
    expect(html).toContain('加大邊距方案')
  })

  it('renders seismic route readiness matrix in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      loads: {
        ...defaultProject.loads,
        considerSeismic: true,
        seismicDesignMethod: 'overstrength' as const,
        overstrengthFactor: 2,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            considerSeismic: true,
            seismicDesignMethod: 'overstrength' as const,
            overstrengthFactor: 2,
          },
        },
      ],
    }
    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('route-matrix')
    expect(html).toContain('Ωo 放大路徑')
    expect(html).toContain('readiness')
  })

  it('includes anchor reinforcement overlay labels in standalone reports when enabled', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        anchorReinforcementEnabled: true,
        anchorReinforcementAreaMm2: 4000,
        anchorReinforcementYieldMpa: 420,
      },
    }
    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('補強鋼筋 As=4000 fy=420')
    expect(html).toContain('綠 = 錨栓補強鋼筋')
  })

  it('shows the effective bearing area in standalone reports when A1 is derived from b1 × h1', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 0,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        basePlateSupportAreaMm2: 90000,
      },
    }
    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('A1 40,000')
    expect(html).toContain('b1 × h1')
    expect(html).toContain('矩形承壓區之 Sx / Sy 假設')
  })

  it('renders base-plate bearing overlay layers in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        basePlateSupportAreaMm2: 90000,
      },
      loads: {
        ...defaultProject.loads,
        tensionKn: -200,
        momentXKnM: 15,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            tensionKn: -200,
            momentXKnM: 15,
          },
        },
      ],
    }

    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('bearing-zone')
    expect(html).toContain('bearing-contact-zone')
    expect(html).toContain('A1 / 接觸承壓區')
  })

  it('shows custom section modulus metadata in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        basePlateSectionType: 'custom' as const,
        basePlateSectionModulusXmm3: 800000,
        basePlateSectionModulusYmm3: 760000,
        basePlateSupportAreaMm2: 90000,
      },
      loads: {
        ...defaultProject.loads,
        tensionKn: -200,
        momentXKnM: 20,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            tensionKn: -200,
            momentXKnM: 20,
          },
        },
      ],
    }

    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('自訂 Sx / Sy')
    expect(html).toContain('Sx 800,000 mm³')
    expect(html).toContain('Sy 760,000 mm³')
  })

  it('shows presentation labels for result rows in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        basePlateSupportAreaMm2: 90000,
      },
      loads: {
        ...defaultProject.loads,
        tensionKn: -200,
        momentXKnM: 20,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            tensionKn: -200,
            momentXKnM: 20,
          },
        },
      ],
    }

    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('應力（MPa）')
  })

  it('includes derived base plate cantilever and column offset metadata in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateBendingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        basePlateSupportAreaMm2: 90000,
        basePlatePlanWidthMm: 320,
        basePlatePlanHeightMm: 420,
        basePlateThicknessMm: 25,
        basePlateSteelYieldMpa: 250,
        columnSectionType: 'i_h' as const,
        columnDepthMm: 200,
        columnFlangeWidthMm: 200,
        columnCentroidOffsetXmm: 20,
      },
      loads: {
        ...defaultProject.loads,
        tensionKn: -300,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            tensionKn: -300,
          },
        },
      ],
    }

    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('B × N')
    expect(html).toContain('柱偏移')
    expect(html).toContain('AISC DG1 自動推算')
  })

  it('includes seismic route state and recommendation in standalone reports', () => {
    const product = defaultProducts.find(
      (item) => item.id === defaultProject.selectedProductId,
    )
    expect(product).toBeDefined()

    const project = {
      ...defaultProject,
      loads: {
        ...defaultProject.loads,
        considerSeismic: true,
        seismicDesignMethod: 'standard' as const,
        designEarthquakeTensionKn: 30,
        overstrengthFactor: 2,
      },
      loadCases: [
        {
          ...(defaultProject.loadCases?.[0] ?? {
            id: 'load-case-1',
            name: 'LC1',
          }),
          loads: {
            ...(defaultProject.loadCases?.[0]?.loads ?? defaultProject.loads),
            considerSeismic: true,
            seismicDesignMethod: 'standard' as const,
            designEarthquakeTensionKn: 30,
            overstrengthFactor: 2,
          },
        },
      ],
    }
    const batchReview = evaluateProjectBatch(project, product!)
    const html = buildStandaloneReportHtml({
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [product!]),
      review: batchReview.activeReview,
      selectedProduct: product!,
      completeness: assessProductCompleteness(product!),
      evaluationFieldStates: getEvaluationFieldStates(product!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(html).toContain('耐震路徑建議')
    expect(html).toContain('Ωo 放大路徑')
    expect(html).toContain('建議路徑')
  })
})
