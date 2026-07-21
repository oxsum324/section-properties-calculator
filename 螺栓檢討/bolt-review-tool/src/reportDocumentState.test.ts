import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  evaluateProjectBatch,
} from './calc'
import type { ProjectCase } from './domain'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import {
  appendReportDocumentStateSuffix,
  buildReportDocumentState,
} from './reportDocumentState'

const product = defaultProducts.find(
  (item) => item.id === defaultProject.selectedProductId,
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
    report: { ...readyReportSettings },
    ...overrides,
  }
}

function buildState(project: ProjectCase = cloneProject()) {
  const batchReview = evaluateProjectBatch(project, product)
  return buildReportDocumentState({
    batchReview,
    review: batchReview.activeReview,
    completeness: assessProductCompleteness(product),
    reportSettings: normalizeReportSettings(project.report),
  })
}

describe('buildReportDocumentState', () => {
  it('keeps passing reports as a sign-off candidate without declaring them formal', () => {
    const state = buildState()

    expect(state).toMatchObject({
      status: 'ready',
      label: '可送簽版',
      isDraft: false,
    })
    expect(state.reason).toContain('技師複核及簽章')
    expect(appendReportDocumentStateSuffix('錨栓檢討', state)).toBe('錨栓檢討')
  })

  it('marks intentionally excluded checks as a review draft', () => {
    const state = buildState(cloneProject({ excludedCheckIds: ['pullout'] }))

    expect(state).toMatchObject({
      status: 'review',
      label: 'DRAFT / 待人工複核',
      isDraft: true,
    })
    expect(state.reason).toContain('不檢討')
    expect(appendReportDocumentStateSuffix('錨栓檢討', state)).toBe(
      '錨栓檢討_DRAFT',
    )
  })

  it('marks failed calculations as a blocked draft', () => {
    const failingLoads = {
      ...defaultProject.loads,
      tensionKn: 100000,
    }
    const state = buildState(
      cloneProject({
        loads: failingLoads,
        loadCases: (defaultProject.loadCases ?? []).map((loadCase) => ({
          ...loadCase,
          loads: { ...loadCase.loads, tensionKn: 100000 },
        })),
      }),
    )

    expect(state).toMatchObject({
      status: 'blocked',
      label: 'DRAFT / 檢核不符',
      isDraft: true,
    })
    expect(state.reason).toContain('不得送簽')
  })

  it('keeps a calculation-version mismatch as a review draft', () => {
    const state = buildState(
      cloneProject({ calcEngineVersion: 'legacy-backup-v1-unverified' }),
    )

    expect(state).toMatchObject({
      status: 'review',
      label: 'DRAFT / 待人工複核',
      isDraft: true,
    })
    expect(state.reason).toContain('計算版本與目前工具不一致')
  })
})
