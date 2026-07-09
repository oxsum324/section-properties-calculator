import { describe, expect, it } from 'vitest'
import { buildAttachmentReadinessModel } from './attachmentReadiness'
import { assessProductCompleteness, evaluateProject } from './calc'
import type { ProjectCase } from './domain'
import { defaultProducts, defaultProject, normalizeReportSettings } from './defaults'

const baseProduct = defaultProducts.find(
  (product) => product.id === 'generic-cast-m20',
)!

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

function buildModel(project: ProjectCase = cloneProject()) {
  const review = evaluateProject(project, baseProduct)
  return buildAttachmentReadinessModel({
    review,
    completeness: assessProductCompleteness(baseProduct),
    reportSettings: normalizeReportSettings(project.report),
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

  it('requires manual review when checks are intentionally excluded', () => {
    const model = buildModel(cloneProject({ excludedCheckIds: ['pullout'] }))

    expect(model.status).toBe('review')
    expect(model.label).toBe('可作附件，需人工複核')
    expect(model.priority.value).toContain('不檢討')
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
      reportSettings: normalizeReportSettings(project.report),
    })

    expect(assessProductCompleteness(incompleteProduct).formal).toBe(false)
    expect(model.status).toBe('review')
    expect(model.priority.value).toContain('產品評估資料缺')
  })
})
