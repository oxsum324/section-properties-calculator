import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import {
  computeBasePlateBearingGeometry,
  computeBasePlateStressDistribution,
  computeBasePlateStressState,
} from './basePlateStressState'

describe('computeBasePlateStressState', () => {
  it('splits geometry and stress distribution into reusable layers', () => {
    const geometry = computeBasePlateBearingGeometry({
      ...defaultProject.layout,
      basePlateBearingEnabled: true,
      basePlateLoadedAreaMm2: 40000,
      basePlateLoadedWidthMm: 200,
      basePlateLoadedHeightMm: 200,
    })
    const distribution = computeBasePlateStressDistribution(
      geometry,
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
        momentYKnM: 20,
      },
    )

    expect(geometry.loadedAreaMm2).toBe(40000)
    expect(geometry.hasBearingStressSection).toBe(true)
    expect(distribution.upliftX).toBe(true)
    expect(distribution.contactLengthXmm).toBeCloseTo(100, 3)
  })

  it('computes contact length for uplift in the same way as bearing overlays and checks', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
        momentYKnM: 20,
      },
    )

    expect(state.upliftX).toBe(true)
    expect(state.majorUpliftX).toBe(false)
    expect(state.contactLengthXmm).toBeCloseTo(100, 3)
    expect(state.contactLengthYmm).toBeCloseTo(200, 3)
  })

  it('switches to the Y-direction uplift path when Mx exceeds the kern limit', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
        momentXKnM: 20,
      },
    )

    expect(state.upliftY).toBe(true)
    expect(state.majorUpliftY).toBe(false)
    expect(state.upliftX).toBe(false)
    expect(state.upliftStressYMpa).toBeGreaterThan(0)
    expect(state.directionalStressYMpa).toBeGreaterThan(0)
    expect(state.directionalStressXMpa).toBe(0)
    expect(state.contactLengthYmm).toBeCloseTo(100, 3)
  })

  it('marks dual-direction major uplift when both compression blocks disappear', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -10,
        momentXKnM: 2,
        momentYKnM: 2,
      },
    )

    expect(state.majorUpliftX).toBe(true)
    expect(state.majorUpliftY).toBe(true)
  })

  it('keeps custom section geometry separate from stress-distribution readiness', () => {
    const geometry = computeBasePlateBearingGeometry({
      ...defaultProject.layout,
      basePlateBearingEnabled: true,
      basePlateLoadedAreaMm2: 40000,
      basePlateLoadedWidthMm: 200,
      basePlateLoadedHeightMm: 200,
      basePlateSectionType: 'custom',
      basePlateSectionModulusXmm3: 0,
      basePlateSectionModulusYmm3: 0,
      basePlateBearingMomentExternallyVerified: true,
    })

    expect(geometry.basePlateSectionType).toBe('custom')
    expect(geometry.bearingMomentExternallyVerified).toBe(true)
    expect(geometry.hasBearingStressGeometry).toBe(true)
    expect(geometry.hasBearingStressSection).toBe(false)
  })

  it('preserves compression demand for base plate checks', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
      },
      {
        ...defaultProject.loads,
        tensionKn: -70,
      },
    )

    expect(state.demandCompressionKn).toBe(70)
    expect(state.axialStressMpa).toBeCloseTo(1.75, 3)
  })

  it('adds column centroid offset moments before evaluating eccentricity', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        columnCentroidOffsetXmm: 20,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
      },
    )

    expect(state.effectiveMoments.deltaMomentYKnM).toBeCloseTo(6, 3)
    expect(state.effectiveMomentYKnM).toBeCloseTo(6, 3)
    expect(state.eccentricityXmm).toBeCloseTo(20, 3)
  })

  it('adds column centroid offset moments on top of existing applied moments', () => {
    const state = computeBasePlateStressState(
      {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateLoadedAreaMm2: 40000,
        basePlateLoadedWidthMm: 200,
        basePlateLoadedHeightMm: 200,
        columnCentroidOffsetYmm: 30,
      },
      {
        ...defaultProject.loads,
        tensionKn: -300,
        momentXKnM: 4,
      },
    )

    expect(state.effectiveMoments.deltaMomentXKnM).toBeCloseTo(9, 3)
    expect(state.effectiveMomentXKnM).toBeCloseTo(13, 3)
    expect(state.eccentricityYmm).toBeCloseTo(43.333, 3)
  })
})
