import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import { getResultPresentationSummary } from './resultPresentation'
import { normalizeUnitPreferences } from './units'

describe('getResultPresentationSummary', () => {
  const units = normalizeUnitPreferences(defaultProject.ui)

  it('labels force results with the active force unit', () => {
    expect(
      getResultPresentationSummary({ presentation: 'force' }, units),
    ).toBe('力量（kN）')
  })

  it('labels stress results with the active stress unit', () => {
    expect(
      getResultPresentationSummary({ presentation: 'stress' }, units),
    ).toBe('應力（MPa）')
  })

  it('labels length results with the active length unit', () => {
    expect(
      getResultPresentationSummary({ presentation: 'length' }, units),
    ).toBe('長度（mm）')
  })

  it('labels ratio results as unitless values', () => {
    expect(
      getResultPresentationSummary({ presentation: 'ratio' }, units),
    ).toBe('比值（無單位）')
  })
})
