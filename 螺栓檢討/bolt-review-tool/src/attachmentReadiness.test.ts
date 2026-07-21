import { describe, expect, it } from 'vitest'
import { buildAttachmentReadinessModel } from './attachmentReadiness'
import {
  assessProductCompleteness,
  evaluateProject,
  evaluateProjectBatch,
} from './calc'
import type { ProjectCase } from './domain'
import { defaultProducts, defaultProject, normalizeReportSettings } from './defaults'

const baseProduct = defaultProducts.find(
  (product) => product.id === 'generic-cast-m20',
)!
const readyReportSettings = normalizeReportSettings({
  companyName: '測試工程顧問有限公司',
  projectCode: 'ANCHOR-001',
  designer: '王設計',
  checker: '李複核',
  issueDate: '2026-07-20',
})

function cloneProject(overrides: Partial<ProjectCase> = {}): ProjectCase {
  return {
    ...defaultProject,
    loads: { ...defaultProject.loads },
    loadCases: (defaultProject.loadCases ?? []).map((loadCase) => ({
      ...loadCase,
      loads: { ...loadCase.loads },
    })),
    excludedCheckIds: [...(defaultProject.excludedCheckIds ?? [])],
    ...overrides,
  }
}

function buildModel(
  project: ProjectCase = cloneProject(),
  reportSettings = readyReportSettings,
) {
  const review = evaluateProject(project, baseProduct)
  return buildAttachmentReadinessModel({
    review,
    completeness: assessProductCompleteness(baseProduct),
    reportSettings,
  })
}

describe('buildAttachmentReadinessModel', () => {
  it('marks a passing case ready without changing export boundaries', () => {
    const model = buildModel()

    expect(model.status).toBe('ready')
    expect(model.label).toBe('可作附件')
    expect(model.priority.label).toBe('優先閱讀')
    expect(model.priority.value).toContain('HTML / XLSX / DOCX')
    expect(model.items).toContainEqual({
      label: '輸出邊界',
      value: '頁面顯示，不進計算書、列印或 PDF',
      tone: 'neutral',
    })
    expect(model.notes.join('\n')).toContain('不會寫入計算書或列印 PDF')
  })

  it('blocks report attachment use when governing checks fail', () => {
    const project = cloneProject({
      loads: {
        ...defaultProject.loads,
        tensionKn: 100000,
      },
      loadCases: (defaultProject.loadCases ?? []).map((loadCase) => ({
        ...loadCase,
        loads: {
          ...loadCase.loads,
          tensionKn: 100000,
        },
      })),
    })

    const model = buildModel(project)

    expect(model.status).toBe('blocked')
    expect(model.label).toBe('暫勿作附件')
    expect(model.priority.value).toContain('先處理')
  })

  it('uses the controlling load case instead of only the active editor case', () => {
    const safeLoadCase = defaultProject.loadCases![0]
    const project = cloneProject({
      activeLoadCaseId: safeLoadCase.id,
      loadCases: [
        {
          ...safeLoadCase,
          loads: { ...safeLoadCase.loads },
        },
        {
          ...safeLoadCase,
          id: 'load-case-fail',
          name: '控制失敗組合',
          loads: { ...safeLoadCase.loads, tensionKn: 100000 },
        },
      ],
    })
    const batchReview = evaluateProjectBatch(project, baseProduct)
    const model = buildAttachmentReadinessModel({
      batchReview,
      review: batchReview.activeReview,
      completeness: assessProductCompleteness(baseProduct),
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(batchReview.activeReview.summary.overallStatus).toBe('pass')
    expect(batchReview.summary.overallStatus).toBe('fail')
    expect(batchReview.controllingLoadCaseId).toBe('load-case-fail')
    expect(model.status).toBe('blocked')
    expect(model.priority.value).toContain('不符合')
  })

  it('requires manual review when checks are intentionally excluded', () => {
    const model = buildModel(cloneProject({ excludedCheckIds: ['pullout'] }))

    expect(model.status).toBe('review')
    expect(model.label).toBe('可作附件，需人工複核')
    expect(model.priority.value).toContain('不檢討')
  })

  it('requires manual review when project and sign-off metadata is incomplete', () => {
    const model = buildModel(
      cloneProject(),
      normalizeReportSettings(defaultProject.report),
    )

    expect(model.status).toBe('review')
    expect(model.priority.value).toContain('案號 / 專案')
    expect(model.priority.value).toContain('設計人員')
    expect(model.priority.value).toContain('複核人員')
    expect(model.items).toContainEqual({
      label: '案件資料',
      value: '缺 5 項',
      tone: 'warn',
    })
  })

  it('requires manual review when product evaluation data is incomplete', () => {
    const incompleteProduct = defaultProducts.find(
      (product) => product.id === 'template-expansion-m16',
    )!
    const project = cloneProject({
      selectedProductId: incompleteProduct.id,
    })
    const review = evaluateProject(project, incompleteProduct)
    const model = buildAttachmentReadinessModel({
      review,
      completeness: assessProductCompleteness(incompleteProduct),
      reportSettings: readyReportSettings,
    })

    expect(assessProductCompleteness(incompleteProduct).formal).toBe(false)
    expect(model.status).toBe('review')
    expect(model.priority.value).toContain('產品評估資料缺')
  })

  it('requires manual review when the imported calculation version is not current', () => {
    const model = buildModel(
      cloneProject({ calcEngineVersion: 'legacy-backup-v1-unverified' }),
    )

    expect(model.status).toBe('review')
    expect(model.priority.value).toContain('計算版本與目前工具不一致')
    expect(model.items).toContainEqual(
      expect.objectContaining({
        label: '計算版本',
        tone: 'warn',
      }),
    )
  })
})
