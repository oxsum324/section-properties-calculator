import { describe, expect, it } from 'vitest'
import { assessProductCompleteness, evaluateProjectBatch } from './calc'
import { defaultProducts, defaultProject, normalizeReportSettings } from './defaults'
import { createProjectAuditEntry } from './evaluationAudit'

describe('evaluationAudit', () => {
  it('creates a stable hash for identical review content', async () => {
    const product = defaultProducts[0]
    const batchReview = evaluateProjectBatch(defaultProject, product)
    const snapshot = {
      overallStatus: batchReview.summary.overallStatus,
      governingMode: batchReview.summary.governingMode,
      governingDcr: batchReview.summary.governingDcr,
      maxDcr: batchReview.summary.maxDcr,
      controllingLoadCaseName: batchReview.controllingLoadCaseName,
      updatedAt: '2026-04-22T00:00:00.000Z',
    }

    const [first, second] = await Promise.all([
      createProjectAuditEntry({
        project: defaultProject,
        selectedProduct: product,
        batchReview,
        reportSettings: normalizeReportSettings(defaultProject.report),
        completeness: assessProductCompleteness(product),
        snapshot,
        source: 'manual',
      }),
      createProjectAuditEntry({
        project: defaultProject,
        selectedProduct: product,
        batchReview,
        reportSettings: normalizeReportSettings(defaultProject.report),
        completeness: assessProductCompleteness(product),
        snapshot,
        source: 'manual',
      }),
    ])

    expect(first.hash).toBe(second.hash)
  })

  it('changes hash when engineering inputs change', async () => {
    const product = defaultProducts[0]
    const changedProject = {
      ...defaultProject,
      loads: {
        ...defaultProject.loads,
        tensionKn: defaultProject.loads.tensionKn + 10,
      },
    }
    const baselineReview = evaluateProjectBatch(defaultProject, product)
    const changedReview = evaluateProjectBatch(changedProject, product)

    const baseline = await createProjectAuditEntry({
      project: defaultProject,
      selectedProduct: product,
      batchReview: baselineReview,
      reportSettings: normalizeReportSettings(defaultProject.report),
      completeness: assessProductCompleteness(product),
      snapshot: {
        overallStatus: baselineReview.summary.overallStatus,
        governingMode: baselineReview.summary.governingMode,
        governingDcr: baselineReview.summary.governingDcr,
        maxDcr: baselineReview.summary.maxDcr,
        controllingLoadCaseName: baselineReview.controllingLoadCaseName,
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
      source: 'manual',
    })

    const changed = await createProjectAuditEntry({
      project: changedProject,
      selectedProduct: product,
      batchReview: changedReview,
      reportSettings: normalizeReportSettings(changedProject.report),
      completeness: assessProductCompleteness(product),
      snapshot: {
        overallStatus: changedReview.summary.overallStatus,
        governingMode: changedReview.summary.governingMode,
        governingDcr: changedReview.summary.governingDcr,
        maxDcr: changedReview.summary.maxDcr,
        controllingLoadCaseName: changedReview.controllingLoadCaseName,
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
      source: 'manual',
    })

    expect(changed.hash).not.toBe(baseline.hash)
  })
})
