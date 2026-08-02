import { describe, expect, it } from 'vitest'
import appSource from './App.tsx?raw'

describe('report workspace placement', () => {
  it('keeps approval and case-document controls in the visible report workspace', () => {
    const reportWorkspaceStart = appSource.indexOf(
      '<div className="resource-library-wrapper" data-shows="report">',
    )
    const reportWorkspaceEnd = appSource.indexOf(
      '<CaseLibraryPanel',
      reportWorkspaceStart,
    )
    const inputWorkspaceStart = appSource.indexOf(
      '<section className="workspace"',
      reportWorkspaceEnd,
    )
    const reportSettingsPosition = appSource.indexOf(
      '<ReportSettingsPanel',
      reportWorkspaceStart,
    )
    const caseDocumentsPosition = appSource.indexOf(
      '<CaseDocumentsPanel',
      reportWorkspaceStart,
    )

    expect(reportWorkspaceStart).toBeGreaterThanOrEqual(0)
    expect(reportWorkspaceEnd).toBeGreaterThan(reportWorkspaceStart)
    expect(inputWorkspaceStart).toBeGreaterThan(reportWorkspaceEnd)
    expect(reportSettingsPosition).toBeGreaterThan(reportWorkspaceStart)
    expect(reportSettingsPosition).toBeLessThan(reportWorkspaceEnd)
    expect(caseDocumentsPosition).toBeGreaterThan(reportWorkspaceStart)
    expect(caseDocumentsPosition).toBeLessThan(reportWorkspaceEnd)
    expect(appSource.indexOf('<ReportSettingsPanel', inputWorkspaceStart)).toBe(
      -1,
    )
    expect(appSource.indexOf('<CaseDocumentsPanel', inputWorkspaceStart)).toBe(
      -1,
    )
  })
})
