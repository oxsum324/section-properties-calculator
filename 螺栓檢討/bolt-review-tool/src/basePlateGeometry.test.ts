import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import {
  getBasePlatePlanDimensions,
  getDerivedBasePlateCantilevers,
  getEffectiveBasePlateCantilevers,
  getEffectiveBasePlateMoments,
} from './basePlateGeometry'

describe('basePlateGeometry helpers', () => {
  it('derives AISC DG1 cantilevers from I/H column and plate dimensions', () => {
    const derived = getDerivedBasePlateCantilevers({
      ...defaultProject.layout,
      basePlatePlanWidthMm: 320,
      basePlatePlanHeightMm: 420,
      columnSectionType: 'i_h',
      columnDepthMm: 200,
      columnFlangeWidthMm: 200,
    })

    expect(derived?.mMm).toBeCloseTo(115, 3)
    expect(derived?.nMm).toBeCloseTo(80, 3)
    expect(derived?.lambdaPrimeMm).toBeCloseTo(50, 3)
    expect(derived?.xMm).toBeCloseTo(80, 3)
    expect(derived?.yMm).toBeCloseTo(115, 3)
  })

  it('falls back to derived cantilevers when manual lx / ly are not entered', () => {
    const cantilevers = getEffectiveBasePlateCantilevers({
      ...defaultProject.layout,
      basePlateCantileverXmm: 0,
      basePlateCantileverYmm: 0,
      basePlatePlanWidthMm: 320,
      basePlatePlanHeightMm: 420,
      columnSectionType: 'i_h',
      columnDepthMm: 200,
      columnFlangeWidthMm: 200,
    })

    expect(cantilevers.source).toBe('derived')
    expect(cantilevers.xMm).toBeCloseTo(80, 3)
    expect(cantilevers.yMm).toBeCloseTo(115, 3)
  })

  it('treats pipe sections like circular rectangular references when deriving cantilevers', () => {
    const derived = getDerivedBasePlateCantilevers({
      ...defaultProject.layout,
      basePlatePlanWidthMm: 360,
      basePlatePlanHeightMm: 360,
      columnSectionType: 'pipe',
      columnDepthMm: 200,
    })

    expect(derived?.mMm).toBeCloseTo(80, 3)
    expect(derived?.nMm).toBeCloseTo(80, 3)
    expect(derived?.xMm).toBeCloseTo(80, 3)
    expect(derived?.yMm).toBeCloseTo(80, 3)
  })

  it('adds column centroid offsets as effective bearing moments', () => {
    const effective = getEffectiveBasePlateMoments(
      {
        ...defaultProject.layout,
        columnCentroidOffsetXmm: 20,
        columnCentroidOffsetYmm: -10,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
        momentXKnM: 2,
        momentYKnM: 1,
      },
    )

    expect(effective.deltaMomentXKnM).toBeCloseTo(-3, 3)
    expect(effective.deltaMomentYKnM).toBeCloseTo(6, 3)
    expect(effective.momentXKnM).toBeCloseTo(-1, 3)
    expect(effective.momentYKnM).toBeCloseTo(7, 3)
  })

  it('prefers explicit base plate plan dimensions over loaded area dimensions', () => {
    const plan = getBasePlatePlanDimensions({
      ...defaultProject.layout,
      basePlatePlanWidthMm: 360,
      basePlatePlanHeightMm: 500,
      basePlateLoadedWidthMm: 200,
      basePlateLoadedHeightMm: 200,
    })

    expect(plan.source).toBe('plan')
    expect(plan.widthMm).toBe(360)
    expect(plan.heightMm).toBe(500)
  })
})
