import { describe, expect, it } from 'vitest'
import { defaultProject, normalizeReportSettings } from './defaults'
import { buildDocumentApprovalCalculationKey } from './documentApproval'

describe('buildDocumentApprovalCalculationKey', () => {
  it('keeps approval across report metadata, audit, snapshot and save-time updates', () => {
    const baseline = buildDocumentApprovalCalculationKey(defaultProject)
    const updated = {
      ...defaultProject,
      report: {
        ...normalizeReportSettings(defaultProject.report),
        designer: '王設計',
        documentApproved: true,
        documentApprovedAt: '2026-08-02T09:00:00.000Z',
      },
      auditTrail: [],
      snapshot: {
        overallStatus: 'pass' as const,
        governingMode: '拉力與剪力互制',
        governingDcr: 0.71,
        maxDcr: 0.71,
        controllingLoadCaseName: 'LC1',
        updatedAt: '2026-08-02T09:00:01.000Z',
      },
      updatedAt: '2026-08-02T09:00:02.000Z',
    }

    expect(buildDocumentApprovalCalculationKey(updated)).toBe(baseline)
  })

  it('revokes approval when calculation inputs change', () => {
    const baseline = buildDocumentApprovalCalculationKey(defaultProject)
    const changed = {
      ...defaultProject,
      loads: {
        ...defaultProject.loads,
        tensionKn: defaultProject.loads.tensionKn + 1,
      },
    }

    expect(buildDocumentApprovalCalculationKey(changed)).not.toBe(baseline)
  })
})
