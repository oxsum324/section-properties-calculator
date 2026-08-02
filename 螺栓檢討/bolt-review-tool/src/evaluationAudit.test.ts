import { describe, expect, it } from 'vitest'
import { assessProductCompleteness, evaluateProjectBatch } from './calc'
import { CURRENT_CALC_ENGINE_VERSION } from './appMeta'
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
    expect(first.calcEngineVersion).toBe(CURRENT_CALC_ENGINE_VERSION)
  })

  it('shares one calculation fingerprint across formats and document metadata', async () => {
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
    const baseReportSettings = normalizeReportSettings(defaultProject.report)
    const metadataProject = {
      ...defaultProject,
      id: 'renamed-case-id',
      name: '不同案件顯示名稱',
      updatedAt: '2026-08-02T09:00:00.000Z',
      report: {
        ...baseReportSettings,
        designer: '王設計',
        checker: '李複核',
        documentApproved: true,
        documentApprovedAt: '2026-08-02T09:01:00.000Z',
      },
    }

    const htmlEntry = await createProjectAuditEntry({
      project: defaultProject,
      selectedProduct: product,
      batchReview,
      reportSettings: baseReportSettings,
      completeness: assessProductCompleteness(product),
      snapshot,
      source: 'html',
    })
    const docxEntry = await createProjectAuditEntry({
      project: metadataProject,
      selectedProduct: product,
      batchReview,
      reportSettings: normalizeReportSettings(metadataProject.report),
      completeness: assessProductCompleteness(product),
      snapshot: { ...snapshot, updatedAt: '2026-08-02T09:02:00.000Z' },
      source: 'docx',
    })

    expect(docxEntry.hash).toBe(htmlEntry.hash)
    expect(htmlEntry.source).toBe('html')
    expect(docxEntry.source).toBe('docx')
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
