import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import { getBasePlateBearingOverlay } from './bearingOverlay'

describe('getBasePlateBearingOverlay', () => {
  it('returns null when bearing is disabled', () => {
    const overlay = getBasePlateBearingOverlay(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: false,
      },
      defaultProject.loads,
    )

    expect(overlay).toBeNull()
  })

  it('builds a full contact area when no uplift is present', () => {
    const overlay = getBasePlateBearingOverlay(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 240,
        basePlateLoadedHeightMm: 240,
      },
      {
        ...defaultProject.loads,
        tensionKn: -120,
        momentXKnM: 0,
        momentYKnM: 0,
      },
    )

    expect(overlay?.mode).toBe('uniform')
    expect(overlay?.contactArea).toEqual(overlay?.loadedArea)
  })

  it('reduces the contact area when x-direction uplift is present', () => {
    const overlay = getBasePlateBearingOverlay(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 300,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -100,
        momentYKnM: 8,
      },
    )

    expect(overlay?.mode).toBe('uplift_x')
    expect((overlay?.contactArea?.x2 ?? 0) - (overlay?.contactArea?.x1 ?? 0)).toBeLessThan(
      (overlay?.loadedArea.x2 ?? 0) - (overlay?.loadedArea.x1 ?? 0),
    )
  })

  it('marks major uplift when the compression block disappears', () => {
    const overlay = getBasePlateBearingOverlay(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 240,
        basePlateLoadedHeightMm: 240,
      },
      {
        ...defaultProject.loads,
        tensionKn: -10,
        momentXKnM: 2,
      },
    )

    expect(overlay?.mode).toBe('major_uplift_y')
    expect(overlay?.label).toContain('y 向 uplift')
    expect(overlay?.contactArea).toBeUndefined()
  })

  it('marks dual-direction major uplift when both compression blocks disappear', () => {
    const overlay = getBasePlateBearingOverlay(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 240,
        basePlateLoadedHeightMm: 240,
      },
      {
        ...defaultProject.loads,
        tensionKn: -10,
        momentXKnM: 2,
        momentYKnM: 2,
      },
    )

    expect(overlay?.mode).toBe('major_uplift_xy')
    expect(overlay?.label).toContain('雙向 uplift')
    expect(overlay?.contactArea).toBeUndefined()
  })
})
