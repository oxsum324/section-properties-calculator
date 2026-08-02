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
  it('defaults every newly generated report to printable internal review', () => {
    const state = buildState()

    expect(state).toMatchObject({
      status: 'internal-review',
      label: '內部審閱',
      isDraft: false,
    })
    expect(appendReportDocumentStateSuffix('錨栓檢討', state)).toBe(
      '錨栓檢討_內部審閱',
    )
    expect(
      appendReportDocumentStateSuffix(
        '錨栓檢討',
        state,
        'abcdef1234567890fedcba0987654321',
      ),
    ).toBe('錨栓檢討_內部審閱_CF-ABCDEF1234567890')
  })

  it('uses explicit approval to classify the document as a formal attachment', () => {
    const state = buildState(cloneProject({
      report: {
        ...readyReportSettings,
        documentApproved: true,
        documentApprovedAt: '2026-07-20T10:00:00.000Z',
      },
    }))

    expect(state).toMatchObject({
      status: 'formal-attachment',
      label: '正式附件',
      isDraft: false,
    })
    expect(state.reason).toContain('核可時間')
    expect(state.reason).toBe('核可時間：2026/07/20 18:00:00')
    expect(state.reason).not.toContain('T10:00:00.000Z')
    expect(
      appendReportDocumentStateSuffix(
        '錨栓檢討',
        state,
        'CF-ABCDEF1234567890',
      ),
    ).toBe('錨栓檢討_正式附件_CF-ABCDEF1234567890')
  })

  it('keeps intentionally excluded checks visible without converting the document to DRAFT', () => {
    const state = buildState(cloneProject({ excludedCheckIds: ['pullout'] }))

    expect(state).toMatchObject({
      status: 'internal-review',
      label: '內部審閱',
      isDraft: false,
    })
    expect(appendReportDocumentStateSuffix('錨栓檢討', state)).toBe(
      '錨栓檢討_內部審閱',
    )
  })

  it('allows an approved formal attachment to truthfully contain failed calculations', () => {
    const failingLoads = {
      ...defaultProject.loads,
      tensionKn: 100000,
    }
    const state = buildState(
      cloneProject({
        loads: failingLoads,
        report: {
          ...readyReportSettings,
          documentApproved: true,
          documentApprovedAt: '2026-07-20T10:00:00.000Z',
        },
        loadCases: (defaultProject.loadCases ?? []).map((loadCase) => ({
          ...loadCase,
          loads: { ...loadCase.loads, tensionKn: 100000 },
        })),
      }),
    )

    expect(state).toMatchObject({
      status: 'formal-attachment',
      label: '正式附件',
      isDraft: false,
    })
  })

  it('keeps a calculation-version mismatch as internal review until explicit approval', () => {
    const state = buildState(
      cloneProject({ calcEngineVersion: 'legacy-backup-v1-unverified' }),
    )

    expect(state).toMatchObject({
      status: 'internal-review',
      label: '內部審閱',
      isDraft: false,
    })
  })
})
