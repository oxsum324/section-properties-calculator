import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  buildAnchorPoints,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProject,
  evaluateProjectBatch,
} from './calc'
import {
  defaultProducts,
  defaultProject,
  twRc112AnchorProfile,
} from './defaults'
import type { AnchorProduct, ProjectCase } from './domain'

function cloneProject(project: ProjectCase): ProjectCase {
  return {
    ...project,
    layout: { ...project.layout },
    loads: { ...project.loads },
    loadCases: project.loadCases?.map((item) => ({
      ...item,
      loads: { ...item.loads },
    })),
    candidateLayoutVariants: project.candidateLayoutVariants?.map((item) => ({
      ...item,
      layout: { ...item.layout },
    })),
  }
}

function cloneProduct(product: AnchorProduct): AnchorProduct {
  return {
    ...product,
    evaluation: { ...product.evaluation },
  }
}

describe('buildAnchorPoints', () => {
  it('creates a 2x2 grid from edge distances and spacing', () => {
    const points = buildAnchorPoints(defaultProject.layout)

    expect(points).toEqual([
      { id: 'A1-1', x: 120, y: 120 },
      { id: 'A1-2', x: 120, y: 300 },
      { id: 'A2-1', x: 300, y: 120 },
      { id: 'A2-2', x: 300, y: 300 },
    ])
  })

  it('perimeter pattern excludes interior anchors (H-section with web-side bolts)', () => {
    const layout = {
      ...defaultProject.layout,
      anchorCountX: 3,
      anchorCountY: 3,
      spacingXmm: 100,
      spacingYmm: 100,
      edgeLeftMm: 50,
      edgeBottomMm: 50,
      anchorLayoutPattern: 'perimeter' as const,
    }
    const points = buildAnchorPoints(layout)
    // 3x3 外框 = 8 支（扣除中心 A2-2）
    expect(points).toHaveLength(8)
    expect(points.find((p) => p.id === 'A2-2')).toBeUndefined()
    // 四角仍存在
    expect(points.find((p) => p.id === 'A1-1')).toBeDefined()
    expect(points.find((p) => p.id === 'A3-3')).toBeDefined()
    // 腹板側邊（中列的上下端點）仍存在
    expect(points.find((p) => p.id === 'A2-1')).toBeDefined()
    expect(points.find((p) => p.id === 'A2-3')).toBeDefined()
  })

  it('perimeter pattern is identity when nx < 3 or ny < 3', () => {
    const layout22 = {
      ...defaultProject.layout,
      anchorCountX: 2,
      anchorCountY: 2,
      anchorLayoutPattern: 'perimeter' as const,
    }
    // 2x2 無內部 → 4 點
    expect(buildAnchorPoints(layout22)).toHaveLength(4)

    const layout52 = {
      ...defaultProject.layout,
      anchorCountX: 5,
      anchorCountY: 2,
      spacingXmm: 80,
      spacingYmm: 200,
      anchorLayoutPattern: 'perimeter' as const,
    }
    // 5x2 無內部 → 10 點（等同 grid）
    expect(buildAnchorPoints(layout52)).toHaveLength(10)
  })
})

describe('Taiwan Chapter 17 review engine', () => {
  it('returns formal cast-in review results with chapter citations', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(defaultProject, castIn!)

    expect(assessProductCompleteness(castIn!)).toEqual({
      formal: true,
      missing: [],
    })
    expect(review.ruleProfile.id).toBe('tw_rc_112_anchor_profile')
    expect(review.results.every((result) => result.citation.chapter === '17')).toBe(true)
    expect(review.results.some((result) => result.id === 'steel-tension' && result.formal)).toBe(true)
    expect(review.results.some((result) => result.id === 'pullout' && result.formal)).toBe(true)
    expect(review.summary.notes).toContain('產品資料完整，可顯示正式規範判定。')
  })

  it('treats missing post-installed product evaluation data as incomplete or screening', () => {
    const expansion = defaultProducts.find(
      (product) => product.id === 'template-expansion-m16',
    )
    expect(expansion).toBeDefined()

    const review = evaluateProject(
      {
        ...cloneProject(defaultProject),
        selectedProductId: expansion!.id,
      },
      expansion!,
    )

    expect(assessProductCompleteness(expansion!).formal).toBe(false)
    expect(review.results.some((result) => result.id === 'pullout' && result.status === 'incomplete')).toBe(true)
    expect(['screening', 'incomplete']).toContain(review.summary.formalStatus)
  })

  it('requires post-installed anchor category data before marking results as formal', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.minEdgeDistanceMm = 120
    expansion.evaluation.minSpacingMm = 180
    expansion.evaluation.crackedPulloutStrengthKn = 24
    expansion.evaluation.uncrackedPulloutStrengthKn = 28

    const review = evaluateProject(
      {
        ...cloneProject(defaultProject),
        selectedProductId: expansion.id,
      },
      expansion,
    )

    expect(review.summary.formalStatus).toBe('incomplete')
    expect(review.summary.notes.join(' ')).toContain('後置錨栓分類')
  })

  it('uses code fallback minimum dimensions when product minimum values are not provided', () => {
    const expansion = defaultProducts.find(
      (product) => product.id === 'template-expansion-m16',
    )
    expect(expansion).toBeDefined()

    const review = evaluateProject(
      {
        ...cloneProject(defaultProject),
        selectedProductId: expansion!.id,
      },
      expansion!,
    )

    const spacingCheck = review.dimensionChecks.find((check) => check.id === 'spacing')
    const edgeCheck = review.dimensionChecks.find((check) => check.id === 'edge')
    const thicknessCheck = review.dimensionChecks.find((check) => check.id === 'thickness')

    expect(spacingCheck?.source).toBe('code_fallback')
    expect(edgeCheck?.source).toBe('code_fallback')
    expect(thicknessCheck?.source).toBe('code_fallback')
  })

  it('uses product minimum dimensions when evaluation values are provided', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.minSpacingMm = 210
    expansion.evaluation.minEdgeDistanceMm = 135
    expansion.evaluation.minThicknessMm = 260
    expansion.evaluation.crackedPulloutStrengthKn = 24
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.anchorCategory = 1

    const project = cloneProject(defaultProject)
    project.selectedProductId = expansion.id

    const review = evaluateProject(project, expansion)
    const spacingCheck = review.dimensionChecks.find((check) => check.id === 'spacing')
    const edgeCheck = review.dimensionChecks.find((check) => check.id === 'edge')
    const thicknessCheck = review.dimensionChecks.find((check) => check.id === 'thickness')

    expect(spacingCheck?.source).toBe('product')
    expect(spacingCheck?.requiredMm).toBe(210)
    expect(edgeCheck?.source).toBe('product')
    expect(edgeCheck?.requiredMm).toBe(135)
    expect(thicknessCheck?.source).toBe('product')
    expect(thicknessCheck?.requiredMm).toBe(260)
  })

  it('flags Chapter 17.10 escalation when seismic demand exceeds the 20 percent entry threshold', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.designEarthquakeTensionKn = 30
    project.loads.designEarthquakeShearKn = 5
    project.loads.seismicDesignMethod = 'standard'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!, twRc112AnchorProfile)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.citation.clause).toBe('17.10')
    expect(seismic?.status).toBe('warning')
    expect(seismic?.formal).toBe(false)
    expect(seismic?.routeDiagnostics?.some((item) => item.key === 'entry_requires_upgraded_route')).toBe(true)
  })

  it('keeps edge distance checks active even when supplementary reinforcement is enabled', () => {
    const project = cloneProject(defaultProject)
    project.layout.supplementaryReinforcement = true
    project.layout.edgeLeftMm = 25
    project.layout.edgeRightMm = 25
    project.layout.edgeBottomMm = 25
    project.layout.edgeTopMm = 25

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const edgeCheck = review.dimensionChecks.find((check) => check.id === 'edge')

    expect(edgeCheck?.source).toBe('code')
    expect(edgeCheck?.status).toBe('fail')
  })

  it('reverses 17.9.4 fallback thickness correctly for post-installed expansion anchors', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.crackedPulloutStrengthKn = 24

    const project = cloneProject(defaultProject)
    project.selectedProductId = expansion.id
    project.layout.effectiveEmbedmentMm = 100

    const review = evaluateProject(project, expansion)
    const thicknessCheck = review.dimensionChecks.find((check) => check.id === 'thickness')

    expect(thicknessCheck?.requiredMm).toBe(200)
  })

  it('flags inconsistent plan geometry when edge plus spacing closure does not match the concrete size', () => {
    const project = cloneProject(defaultProject)
    project.layout.edgeRightMm = 80

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const widthClosure = review.dimensionChecks.find(
      (check) => check.id === 'geometry-width-closure',
    )

    expect(widthClosure?.status).toBe('fail')
  })

  it('uses tension-side anchors when moments create uplift without direct axial tension', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.momentYKnM = 10

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const steelTension = review.results.find((result) => result.id === 'steel-tension')

    expect(steelTension?.demandKn).toBeGreaterThan(0)
    expect(steelTension?.note).toContain('受拉側 2 支錨栓')
  })

  it('checks cast-in pullout against both group and single-anchor demand', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(defaultProject, castIn!)
    const pullout = review.results.find((result) => result.id === 'pullout')

    expect(pullout?.mode).toBe('拉出破壞強度')
    expect(pullout?.note).toContain('單支 DCR')
    expect(pullout?.note).toContain('群組 DCR')
  })

  it('keeps cast-in pullout and pryout on Condition B even with supplementary reinforcement', () => {
    const project = cloneProject(defaultProject)
    project.layout.supplementaryReinforcement = true
    project.loads.shearXKn = 40

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const pullout = review.results.find((result) => result.id === 'pullout')
    const pryout = review.results.find((result) => result.id === 'pryout')

    expect(pullout?.note).toContain('φ = 0.7')
    expect(pryout?.note).toContain('φ = 0.7')
  })

  it('applies ψc,P = 1.4 to hooked cast-in anchors in uncracked concrete', () => {
    const castInHook = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    castInHook.headBearingAreaMm2 = undefined
    castInHook.hookExtensionMm = 60

    const crackedProject = cloneProject(defaultProject)
    crackedProject.layout.crackedConcrete = true

    const uncrackedProject = cloneProject(defaultProject)
    uncrackedProject.layout.crackedConcrete = false

    const crackedReview = evaluateProject(crackedProject, castInHook)
    const uncrackedReview = evaluateProject(uncrackedProject, castInHook)
    const crackedPullout = crackedReview.results.find((result) => result.id === 'pullout')
    const uncrackedPullout = uncrackedReview.results.find((result) => result.id === 'pullout')

    expect(crackedPullout?.nominalStrengthKn).toBeGreaterThan(0)
    expect(uncrackedPullout?.nominalStrengthKn).toBeCloseTo(
      (crackedPullout?.nominalStrengthKn ?? 0) * 1.4,
      0,
    )
  })

  it('rejects hooked cast-in anchors when eh is outside 3da to 4.5da', () => {
    const castInHook = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    castInHook.headBearingAreaMm2 = undefined
    castInHook.hookExtensionMm = 40

    expect(assessProductCompleteness(castInHook).formal).toBe(false)
    expect(assessProductCompleteness(castInHook).missing.join(' ')).toContain(
      '3da',
    )

    const review = evaluateProject(defaultProject, castInHook)
    const pullout = review.results.find((result) => result.id === 'pullout')

    expect(pullout?.status).toBe('incomplete')
    expect(pullout?.note).toContain('3da')
  })

  it('uses only the critical edge row tension demand for side-face blowout', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 100
    project.layout.effectiveEmbedmentMm = 320

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const sideFace = review.results.find((result) => result.id === 'side-face-blowout')

    expect(sideFace?.demandKn).toBe(50)
    expect(sideFace?.note).toContain('沿該自由邊受拉需求 = 50')
    expect(sideFace?.factors?.some((item) => item.symbol === 'c_a1')).toBe(true)
    expect(sideFace?.factors?.some((item) => item.symbol === 'φ')).toBe(true)
  })

  it('evaluates base-plate concrete bearing from compressive axial demand', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinedOnAllSides = true
    project.layout.basePlateConfinementMode = 'full'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.demandKn).toBe(300)
    expect(bearing?.factors?.some((item) => item.symbol === 'A1')).toBe(true)
    expect(bearing?.factors?.some((item) => item.symbol === 'φ')).toBe(true)
    expect(bearing?.note).toContain('依規範 profile 之承壓常數採用')
  })

  it('downgrades concrete bearing to warning when moments are present', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 12
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateSupportAreaMm2 = 90000

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('warning')
    expect(bearing?.formal).toBe(false)
    expect(bearing?.note).toContain('Mx / My')
  })

  it('evaluates eccentric concrete bearing stress when loaded width and height are provided', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 12
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'full'
    project.layout.basePlateConfinedOnAllSides = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.presentation).toBe('stress')
    expect(bearing?.demandKn).toBeCloseTo(16.67, 2)
    expect(bearing?.designStrengthKn).toBeCloseTo(23.2, 1)
    expect(bearing?.note).toContain('偏心承壓應力檢核')
    expect(bearing?.factors?.some((item) => item.symbol === 'σmax')).toBe(true)
  })

  it('adds column centroid offset moments into eccentric concrete bearing stress', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'full'
    project.layout.basePlateConfinedOnAllSides = true
    project.layout.columnCentroidOffsetXmm = 20

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.presentation).toBe('stress')
    expect(bearing?.demandKn).toBeCloseTo(12, 1)
    expect(bearing?.note).toContain('柱心偏移')
    expect(
      bearing?.factors?.find((item) => item.symbol === 'ΔMy')?.value,
    ).toBe('6')
    expect(bearing?.factors?.some((item) => item.symbol === 'My,eff')).toBe(true)
  })

  it('uses custom base-plate section modulus inputs for eccentric bearing stress', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 8
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSectionType = 'custom'
    project.layout.basePlateSectionModulusXmm3 = 800000
    project.layout.basePlateSectionModulusYmm3 = 800000
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'full'
    project.layout.basePlateConfinedOnAllSides = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.presentation).toBe('stress')
    expect(bearing?.demandKn).toBeCloseTo(17.5, 1)
    expect(bearing?.note).toContain('自訂 Sx / Sy')
    expect(bearing?.factors?.find((item) => item.symbol === 'section')?.value).toBe(
      '自訂 Sx / Sy',
    )
  })

  it('marks eccentric bearing as incomplete when custom section modulus is selected but missing', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 12
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSectionType = 'custom'
    project.layout.basePlateSectionModulusXmm3 = 0
    project.layout.basePlateSectionModulusYmm3 = 0
    project.layout.basePlateSupportAreaMm2 = 90000

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('incomplete')
    expect(bearing?.formal).toBe(false)
    expect(bearing?.note).toContain('Sx / Sy 未填齊')
  })

  it('switches to triangular bearing stress when eccentricity exceeds the kern boundary', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 20
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.presentation).toBe('stress')
    expect(bearing?.demandKn).toBeCloseTo(30, 1)
    expect(bearing?.note).toContain('三角壓應力分佈')
    expect(bearing?.factors?.some((item) => item.symbol === 'e_x')).toBe(true)
  })

  it('warns when bearing eccentricity implies major uplift beyond the compression block', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 40
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('warning')
    expect(bearing?.formal).toBe(false)
    expect(bearing?.note).toContain('大部分可能 uplift')
  })

  it('derives A1 from b1 and h1 when the loaded area is not entered', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 0
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'full'
    project.layout.basePlateConfinedOnAllSides = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.note).toContain('已由 b1 × h1')
    expect(bearing?.factors?.find((item) => item.symbol === 'A1')?.value).toBe('40000')
  })

  it('downgrades bearing review when A1 conflicts with b1 × h1', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 50000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('screening')
    expect(bearing?.formal).toBe(false)
    expect(bearing?.note).toContain('不一致')
  })

  it('supports partial confinement as a conservative bearing extension', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'partial'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.factors?.find((item) => item.symbol === 'β_b')?.value).toBe('1.5')
    expect(bearing?.note).toContain('部分圍束支承')
  })

  it('restores formal bearing review when eccentric compression is externally verified', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 12
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateBearingMomentExternallyVerified = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(bearing?.status).toBe('pass')
    expect(bearing?.formal).toBe(true)
    expect(bearing?.note).toContain('另行驗算')
  })

  it('evaluates base-plate bending thickness with AISC DG1 extension inputs', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateThicknessMm = 25
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 40
    project.layout.basePlateCantileverYmm = 35

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    expect(basePlateBending?.status).toBe('pass')
    expect(basePlateBending?.presentation).toBe('length')
    expect(basePlateBending?.demandKn).toBeCloseTo(10.33, 2)
    expect(basePlateBending?.designStrengthKn).toBe(25)
    expect(basePlateBending?.note).toContain('AISC DG1')
    expect(
      basePlateBending?.factors?.find((item) => item.symbol === 'tp,req')?.value,
    ).toBe('10.328')
  })

  it('uses the same uplift contact length logic for concrete bearing and base-plate bending', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 20
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateThicknessMm = 25
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 40
    project.layout.basePlateCantileverYmm = 35

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    const bearingContactLength = bearing?.factors?.find(
      (item) => item.symbol === 'x_c',
    )?.value
    const bendingContactLength = basePlateBending?.factors?.find(
      (item) => item.symbol === 'x_c',
    )?.value

    expect(bearingContactLength).toBeDefined()
    expect(bearingContactLength).toBe(bendingContactLength)
  })

  it('derives base-plate bending cantilevers from column section geometry when lx / ly are not entered', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlatePlanWidthMm = 320
    project.layout.basePlatePlanHeightMm = 420
    project.layout.basePlateThicknessMm = 35
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 0
    project.layout.basePlateCantileverYmm = 0
    project.layout.columnSectionType = 'i_h'
    project.layout.columnDepthMm = 200
    project.layout.columnFlangeWidthMm = 200

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    expect(basePlateBending?.status).toBe('pass')
    expect(basePlateBending?.note).toContain('自動推算')
    expect(basePlateBending?.factors?.find((item) => item.symbol === 'l')?.value).toBe(
      '115',
    )
    expect(basePlateBending?.factors?.find((item) => item.symbol === 'm')?.value).toBe(
      '115',
    )
    expect(basePlateBending?.factors?.find((item) => item.symbol === 'n')?.value).toBe(
      '80',
    )
  })

  it('marks base-plate bending as incomplete when required inputs are missing', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateThicknessMm = 0
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 40
    project.layout.basePlateCantileverYmm = 35

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    expect(basePlateBending?.status).toBe('incomplete')
    expect(basePlateBending?.note).toContain('tp')
  })

  it('clears misleading demand and design values for base-plate bending under major uplift warning', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -300
    project.loads.momentYKnM = 40
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateLoadedWidthMm = 200
    project.layout.basePlateLoadedHeightMm = 200
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateThicknessMm = 25
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 40
    project.layout.basePlateCantileverYmm = 35

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    expect(basePlateBending?.status).toBe('warning')
    expect(basePlateBending?.designStrengthKn).toBe(0)
    expect(basePlateBending?.demandKn).toBe(0)
    expect(basePlateBending?.note).toContain('大部分承壓區 uplift')
  })

  it('reminds users to review other load cases when base-plate bending is inactive for the current case', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 20
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateBendingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateThicknessMm = 25
    project.layout.basePlateSteelYieldMpa = 250
    project.layout.basePlateCantileverXmm = 40
    project.layout.basePlateCantileverYmm = 35

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const basePlateBending = review.results.find(
      (result) => result.id === 'base-plate-bending',
    )

    expect(basePlateBending?.status).toBe('pass')
    expect(basePlateBending?.note).toContain('請切換 Loadcase 再核')
  })

  it('keeps bonded anchor strength in screening mode when uncracked splitting edge data is missing', () => {
    const bonded = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-bonded-m16')!,
    )
    bonded.evaluation.qualificationStandard = 'ACI_355_4'
    bonded.evaluation.anchorCategory = 1
    bonded.evaluation.minEdgeDistanceMm = 120
    bonded.evaluation.minSpacingMm = 180
    bonded.evaluation.crackedBondStressMpa = 10
    bonded.evaluation.uncrackedBondStressMpa = 14
    bonded.evaluation.criticalEdgeDistanceMm = 140

    const project = cloneProject(defaultProject)
    project.selectedProductId = bonded.id
    project.layout.crackedConcrete = false

    const review = evaluateProject(project, bonded)
    const bond = review.results.find((result) => result.id === 'bond')

    expect(bond?.status).toBe('screening')
    expect(bond?.formal).toBe(false)
    expect(bond?.note).toContain('cac,split')
  })

  it('derives bonded cNa from τuncr when product critical edge distance is not provided', () => {
    const bonded = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-bonded-m16')!,
    )
    bonded.evaluation.qualificationStandard = 'ACI_355_4'
    bonded.evaluation.anchorCategory = 1
    bonded.evaluation.minEdgeDistanceMm = 120
    bonded.evaluation.minSpacingMm = 180
    bonded.evaluation.crackedBondStressMpa = 10
    bonded.evaluation.uncrackedBondStressMpa = 14

    const project = cloneProject(defaultProject)
    project.selectedProductId = bonded.id
    project.layout.crackedConcrete = true

    const review = evaluateProject(project, bonded)
    const bond = review.results.find((result) => result.id === 'bond')

    expect(assessProductCompleteness(bonded).missing.join(' ')).not.toContain('臨界邊距')
    expect(bond?.status).not.toBe('incomplete')
    expect(bond?.note).toContain('由 τuncr 推導')
  })

  it('keeps uncracked post-installed breakout in screening until uncracked qualification is confirmed', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.anchorCategory = 1
    expansion.evaluation.minEdgeDistanceMm = 120
    expansion.evaluation.minSpacingMm = 180
    expansion.evaluation.crackedPulloutStrengthKn = 24
    expansion.evaluation.uncrackedPulloutStrengthKn = 28

    const project = cloneProject(defaultProject)
    project.selectedProductId = expansion.id
    project.layout.crackedConcrete = false
    project.loads.tensionKn = 20

    const screeningReview = evaluateProject(project, expansion)
    const screeningBreakout = screeningReview.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expansion.evaluation.uncrackedConcreteQualified = true
    const formalReview = evaluateProject(project, expansion)
    const formalBreakout = formalReview.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(screeningBreakout?.status).toBe('screening')
    expect(screeningBreakout?.formal).toBe(false)
    expect(screeningBreakout?.note).toContain('ψ_c,N = 1')
    expect(formalBreakout?.formal).toBe(true)
    expect(formalBreakout?.note).toContain('ψ_c,N = 1.4')
  })

  it('reduces concrete shear breakout strength when shear eccentricity is present', () => {
    const centeredProject = cloneProject(defaultProject)
    centeredProject.loads.shearXKn = 40
    centeredProject.loads.shearYKn = 0
    centeredProject.loads.shearEccentricityXmm = 0

    const eccentricProject = cloneProject(centeredProject)
    eccentricProject.loads.shearEccentricityXmm = 80

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const centeredReview = evaluateProject(centeredProject, castIn!)
    const eccentricReview = evaluateProject(eccentricProject, castIn!)
    const centeredShear = centeredReview.results.find(
      (result) => result.id === 'concrete-breakout-shear',
    )
    const eccentricShear = eccentricReview.results.find(
      (result) => result.id === 'concrete-breakout-shear',
    )

    expect(eccentricShear?.dcr).toBeGreaterThan(centeredShear?.dcr ?? 0)
    expect(eccentricShear?.note).toContain("ψ_ec,V")
  })

  it('reduces steel shear strength when a shear lever arm is present', () => {
    const centeredProject = cloneProject(defaultProject)
    centeredProject.loads.shearXKn = 40
    centeredProject.loads.shearYKn = 0
    centeredProject.loads.shearLeverArmMm = 0

    const leverArmProject = cloneProject(centeredProject)
    leverArmProject.loads.shearLeverArmMm = 80

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const centeredReview = evaluateProject(centeredProject, castIn!)
    const leverArmReview = evaluateProject(leverArmProject, castIn!)
    const centeredShear = centeredReview.results.find(
      (result) => result.id === 'steel-shear',
    )
    const leverArmShear = leverArmReview.results.find(
      (result) => result.id === 'steel-shear',
    )

    expect(leverArmShear?.dcr).toBeGreaterThan(centeredShear?.dcr ?? 0)
    expect(leverArmShear?.note).toContain('e_v')
  })

  it('does not apply the steel shear lever arm factor to concrete shear breakout', () => {
    const centeredProject = cloneProject(defaultProject)
    centeredProject.loads.shearXKn = 40
    centeredProject.loads.shearYKn = 0
    centeredProject.loads.shearLeverArmMm = 0

    const leverArmProject = cloneProject(centeredProject)
    leverArmProject.loads.shearLeverArmMm = 80

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const centeredReview = evaluateProject(centeredProject, castIn!)
    const leverArmReview = evaluateProject(leverArmProject, castIn!)
    const centeredConcrete = centeredReview.results.find(
      (result) => result.id === 'concrete-breakout-shear',
    )
    const leverArmConcrete = leverArmReview.results.find(
      (result) => result.id === 'concrete-breakout-shear',
    )

    expect(leverArmConcrete?.dcr).toBe(centeredConcrete?.dcr)
  })

  it('uses severity-based governing selection for interaction checks', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.anchorCategory = 1
    expansion.evaluation.minEdgeDistanceMm = 120
    expansion.evaluation.minSpacingMm = 180

    const project = cloneProject(defaultProject)
    project.selectedProductId = expansion.id
    project.loads.tensionKn = 1
    project.loads.shearXKn = 0.1
    project.loads.shearYKn = 0
    project.loads.interactionEquation = 'power'
    project.layout.crackedConcrete = true

    const review = evaluateProject(project, expansion)
    const interaction = review.results.find((result) => result.id === 'interaction')

    expect(interaction?.status).toBe('incomplete')
    expect(review.summary.governingMode).toBe(interaction?.mode)
    expect(review.summary.governingDcr).toBe(interaction?.dcr)
    expect(review.summary.maxDcr).toBeGreaterThanOrEqual(review.summary.governingDcr)
  })

  it('omits side-face blowout when the critical edge row has no tension demand', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.momentYKnM = 0
    project.layout.effectiveEmbedmentMm = 320

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const sideFace = review.results.find((result) => result.id === 'side-face-blowout')

    expect(sideFace).toBeUndefined()
  })

  it('marks pryout incomplete when the breakout basis is zero', () => {
    const project = cloneProject(defaultProject)
    project.layout.concreteStrengthMpa = 0
    project.loads.shearXKn = 10

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const pryout = review.results.find((result) => result.id === 'pryout')

    expect(pryout?.status).toBe('incomplete')
    expect(pryout?.note).toContain('拉破基準為 0')
  })

  it('applies kc,uncr ratio when an uncracked post-installed product is qualified', () => {
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.anchorCategory = 1
    expansion.evaluation.minEdgeDistanceMm = 120
    expansion.evaluation.minSpacingMm = 180
    expansion.evaluation.crackedPulloutStrengthKn = 24
    expansion.evaluation.uncrackedPulloutStrengthKn = 28
    expansion.evaluation.uncrackedConcreteQualified = true
    expansion.evaluation.kcUncrackedRatio = 1.2

    const project = cloneProject(defaultProject)
    project.selectedProductId = expansion.id
    project.layout.crackedConcrete = false
    project.loads.tensionKn = 20

    const review = evaluateProject(project, expansion)
    const breakout = review.results.find((result) => result.id === 'concrete-breakout-tension')

    expect(breakout?.formal).toBe(true)
    expect(breakout?.note).toContain('ψ_c,N = 1.2')
  })

  it('supports bonded cNa fallback from τcr in cracked concrete when τuncr is unavailable', () => {
    const bonded = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-bonded-m16')!,
    )
    bonded.evaluation.qualificationStandard = 'ACI_355_4'
    bonded.evaluation.anchorCategory = 1
    bonded.evaluation.minEdgeDistanceMm = 120
    bonded.evaluation.minSpacingMm = 180
    bonded.evaluation.crackedBondStressMpa = 10
    bonded.evaluation.uncrackedBondStressMpa = undefined

    const project = cloneProject(defaultProject)
    project.selectedProductId = bonded.id
    project.layout.crackedConcrete = true

    const review = evaluateProject(project, bonded)
    const bond = review.results.find((result) => result.id === 'bond')

    expect(bond?.status).not.toBe('incomplete')
    expect(bond?.note).toContain('τcr 開裂推導')
  })

  it('reports interaction checks as dimensionless ratio results', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120
    project.loads.shearXKn = 70
    project.loads.shearYKn = 0

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const interaction = review.results.find((result) => result.id === 'interaction')

    expect(interaction?.presentation).toBe('ratio')
    expect(interaction?.designStrengthKn).toBeGreaterThan(0)
  })

  it('defaults interaction checks to the ACI 17.8.3 linear tri-linear (<= 1.2)', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120
    project.loads.shearXKn = 70

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const interaction = review.results.find((result) => result.id === 'interaction')

    expect(interaction?.note).toContain('≤ 1.2')
    expect(interaction?.designStrengthKn).toBe(1.2)
  })

  it('allows opting into the 5/3 interaction equation', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120
    project.loads.shearXKn = 70
    project.loads.interactionEquation = 'power'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const interaction = review.results.find((result) => result.id === 'interaction')

    expect(interaction?.note).toContain('5/3')
    expect(interaction?.designStrengthKn).toBe(1)
  })

  it('supports strict linear interaction (sum <= 1.0, no 1.2 allowance)', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120
    project.loads.shearXKn = 70
    project.loads.interactionEquation = 'linear_strict'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const interaction = review.results.find((result) => result.id === 'interaction')

    expect(interaction?.note).toContain('保守')
    expect(interaction?.designStrengthKn).toBe(1)
    // 保守式 DCR 應 >= 規範式 DCR（同樣的 T, V，分母由 1.2 改 1.0）
    const projectDefault = cloneProject(project)
    projectDefault.loads.interactionEquation = 'linear'
    const reviewDefault = evaluateProject(projectDefault, castIn!)
    const interactionDefault = reviewDefault.results.find(
      (item) => item.id === 'interaction',
    )
    expect(interaction?.dcr).toBeGreaterThanOrEqual(interactionDefault?.dcr ?? 0)
  })

  it('excludedCheckIds hides items from summary and does not pollute overallStatus', () => {
    // 用 expansion 產品缺資料的情境，預期 seismic 或 pullout 為 incomplete
    const expansion = defaultProducts.find(
      (product) => product.id === 'template-expansion-m16',
    )
    expect(expansion).toBeDefined()
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 10
    project.loads.shearXKn = 5
    project.layout.crackedConcrete = true
    project.loads.considerSeismic = true

    const baseline = evaluateProject(project, expansion!)
    const incompleteIds = baseline.results
      .filter((r) => r.status === 'incomplete')
      .map((r) => r.id)
    expect(incompleteIds.length).toBeGreaterThan(0)

    // 標記全部 incomplete 項目為不檢討
    project.excludedCheckIds = incompleteIds
    const filtered = evaluateProject(project, expansion!)

    // 整體判定不應再受 incomplete 影響
    expect(filtered.summary.overallStatus).not.toBe('incomplete')
    // 備註需列出被排除項目
    expect(
      filtered.summary.notes.some((note) => note.includes('不檢討')),
    ).toBe(true)
    // results 仍保留全部（UI 需顯示），只是 summary 不算
    expect(filtered.results.length).toBe(baseline.results.length)
  })

  it('applies 17.8.1 / 17.8.2 exception when either ratio <= 0.2', () => {
    // T ratio 很小、V ratio 大 → 應免作 17.8.3，直接以 V 檢核
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 5 // T ratio ~很小
    project.loads.shearXKn = 80

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const interaction = review.results.find((result) => result.id === 'interaction')
    expect(interaction?.note).toContain('17.8')
    // DCR 應等於 max(T,V) 而非 sum / 1.2
    // （此處 V 支配 → interaction DCR ≈ V 的 DCR）
  })

  it('warns when seismic entry ratios cannot be formed because total factored demand is zero', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.shearXKn = 0
    project.loads.shearYKn = 0
    project.loads.considerSeismic = true
    project.loads.designEarthquakeTensionKn = 10

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('warning')
    expect(seismic?.note).toContain('無法判讀 20% 入口比值')
    expect(seismic?.routeDiagnostics?.some((item) => item.key === 'entry_total_zero')).toBe(true)
  })

  it('builds total design demand from static plus earthquake components when requested', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 10
    project.loads.shearXKn = 4
    project.loads.shearYKn = 0
    project.loads.considerSeismic = true
    project.loads.seismicInputMode = 'static_plus_earthquake'
    project.loads.designEarthquakeTensionKn = 20
    project.loads.designEarthquakeShearXKn = 6
    project.loads.seismicDesignMethod = 'standard'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)

    expect(review.analysisLoads.tensionKn).toBe(30)
    expect(review.analysisLoads.shearXKn).toBe(10)
    expect(review.analysisNote).toContain('1.0E')
    const seismic = review.results.find((result) => result.id === 'seismic')
    expect(seismic?.note).toContain('靜載 / 非地震分量 + 1.0E')
  })

  it('amplifies demands when the overstrength path is selected', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 2
    project.loads.designEarthquakeTensionKn = 20
    project.loads.designEarthquakeShearXKn = 6

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const baseReview = evaluateProject(defaultProject, castIn!)
    const amplifiedReview = evaluateProject(project, castIn!)
    const baseSteelTension = baseReview.results.find((result) => result.id === 'steel-tension')
    const amplifiedSteelTension = amplifiedReview.results.find(
      (result) => result.id === 'steel-tension',
    )
    const seismic = amplifiedReview.results.find((result) => result.id === 'seismic')

    expect(amplifiedSteelTension?.demandKn).toBeGreaterThan(baseSteelTension?.demandKn ?? 0)
    expect(amplifiedSteelTension?.note).toContain('Ωo = 2')
    expect(seismic?.note).toContain('Ωo = 2')
  })

  it('evaluates the ductile steel seismic route when ductility detailing is provided', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 20
    project.loads.shearXKn = 0
    project.loads.shearYKn = 0
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'ductile_steel'
    project.loads.designEarthquakeTensionKn = 10

    const castIn = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    castIn.effectiveAreaMm2 = 20
    project.loads.ductileStretchLengthMm = 8 * castIn.diameterMm
    project.loads.ductileBucklingRestrained = true
    project.loads.ductileAttachmentMechanismVerified = true

    const review = evaluateProject(project, castIn)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('pass')
    expect(seismic?.factors?.some((item) => item.symbol === 'fu/fy')).toBe(true)
    expect(seismic?.note).toContain('φNn,concrete ≥ 1.2Nsa')
  })

  it('warns on the ductile steel route when concrete design strength cannot包覆 1.2Nsa', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 20
    project.loads.shearXKn = 0
    project.loads.shearYKn = 0
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'ductile_steel'
    project.loads.designEarthquakeTensionKn = 10

    const castIn = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    castIn.effectiveAreaMm2 = 600
    project.loads.ductileStretchLengthMm = 8 * castIn.diameterMm
    project.loads.ductileBucklingRestrained = true
    project.loads.ductileAttachmentMechanismVerified = true

    const review = evaluateProject(project, castIn)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('warning')
    expect(seismic?.note).toContain('控制混凝土設計強度需 ≥ 1.2Nsa')
    expect(seismic?.routeDiagnostics?.some((item) => item.key === 'ductile_concrete_strength')).toBe(true)
  })

  it('warns on the ductile steel route when the attachment ductility mechanism is not verified', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 20
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'ductile_steel'
    project.loads.designEarthquakeTensionKn = 10

    const castIn = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    castIn.effectiveAreaMm2 = 20
    project.loads.ductileStretchLengthMm = 8 * castIn.diameterMm
    project.loads.ductileBucklingRestrained = true
    project.loads.ductileAttachmentMechanismVerified = false

    const review = evaluateProject(project, castIn)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('warning')
    expect(seismic?.note).toContain('附掛物存在足夠降伏機制')
  })

  it('warns when the attachment-yield seismic route is missing transfer capacities', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'attachment_yield'
    project.loads.designEarthquakeTensionKn = 30

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('warning')
    expect(seismic?.note).toContain('請輸入附掛物降伏可傳遞拉力')
    expect(seismic?.routeDiagnostics?.some((item) => item.key === 'attachment_yield_tension_input')).toBe(true)
  })

  it('warns when attachment-yield fuse demand exceeds anchor design strength margin', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'attachment_yield'
    project.loads.shearXKn = 0
    project.loads.shearYKn = 0
    project.loads.designEarthquakeTensionKn = 30
    project.loads.attachmentYieldTensionKn = 400

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.status).toBe('warning')
    expect(seismic?.note).toContain('不足以包覆 1.2 × 附掛物降伏拉力上限')
    expect(seismic?.routeDiagnostics?.some((item) => item.key === 'attachment_yield_tension_strength')).toBe(true)
  })

  it('applies optional interaction checking for the attachment-yield route', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'attachment_yield'
    project.loads.designEarthquakeTensionKn = 30
    project.loads.designEarthquakeShearXKn = 20
    project.loads.attachmentYieldTensionKn = 30
    project.loads.attachmentYieldShearKn = 20
    project.loads.attachmentYieldInteractionEquation = 'power'

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.factors?.some((item) => item.symbol === 'Eq_attach')).toBe(true)
    expect(seismic?.note).toContain('互制')
  })

  it('uses Ωattachment to amplify demands for the nonyielding attachment route', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'nonyielding_attachment'
    project.loads.attachmentOverstrengthFactor = 1.8
    project.loads.designEarthquakeTensionKn = 20

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')
    const steelTension = review.results.find((result) => result.id === 'steel-tension')

    expect(review.analysisLoads.tensionKn).toBe(96)
    expect(review.analysisNote).toContain('Ω_attachment = 1.8')
    expect(seismic?.factors?.some((item) => item.symbol === 'Ω_attachment')).toBe(true)
    expect(steelTension?.note).toContain('Ω_attachment = 1.8')
  })

  it('uses static plus ΩoE when seismic components are entered separately', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.shearXKn = 0
    project.loads.considerSeismic = true
    project.loads.seismicInputMode = 'static_plus_earthquake'
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 2
    project.loads.designEarthquakeTensionKn = 20
    project.loads.designEarthquakeShearXKn = 5

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const steelTension = review.results.find((result) => result.id === 'steel-tension')

    expect(review.analysisLoads.tensionKn).toBe(40)
    expect(review.analysisLoads.shearXKn).toBe(10)
    expect(review.analysisNote).toContain('Ωo × 地震分量')
    expect(steelTension?.note).toContain('Ωo = 2')
  })

  it('preserves compression under seismic static_plus_earthquake mode', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -100
    project.loads.considerSeismic = true
    project.loads.seismicInputMode = 'static_plus_earthquake'
    project.loads.seismicDesignMethod = 'standard'
    project.loads.designEarthquakeTensionKn = 30
    project.layout.basePlateBearingEnabled = true
    project.layout.basePlateLoadedAreaMm2 = 40000
    project.layout.basePlateSupportAreaMm2 = 90000
    project.layout.basePlateConfinementMode = 'full'
    project.layout.basePlateConfinedOnAllSides = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const bearing = review.results.find((result) => result.id === 'concrete-bearing')

    expect(review.analysisLoads.tensionKn).toBe(-70)
    expect(bearing?.demandKn).toBe(70)
    expect(bearing?.status).toBe('pass')
  })

  it('routes static_plus_earthquake compression that flips to uplift into tension checks', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -30
    project.loads.considerSeismic = true
    project.loads.seismicInputMode = 'static_plus_earthquake'
    project.loads.seismicDesignMethod = 'standard'
    project.loads.designEarthquakeTensionKn = 50

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const steelTension = review.results.find((result) => result.id === 'steel-tension')

    expect(review.analysisLoads.tensionKn).toBe(20)
    expect(steelTension?.demandKn).toBeGreaterThan(0)
  })

  it('amplifies earthquake moments independently under the overstrength path', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.momentYKnM = 5
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 2
    project.loads.designEarthquakeMomentYKnM = 5

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const baseProject = cloneProject(project)
    baseProject.loads.considerSeismic = false
    const baseReview = evaluateProject(baseProject, castIn!)
    const amplifiedReview = evaluateProject(project, castIn!)
    const baseSteelTension = baseReview.results.find((result) => result.id === 'steel-tension')
    const amplifiedSteelTension = amplifiedReview.results.find(
      (result) => result.id === 'steel-tension',
    )

    expect(amplifiedSteelTension?.demandKn).toBeGreaterThan(baseSteelTension?.demandKn ?? 0)
  })

  it('keeps overstrength-amplified tension nonnegative when base load is compressive', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = -30
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 1.5
    project.loads.designEarthquakeTensionKn = 100

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const steelTension = review.results.find((result) => result.id === 'steel-tension')

    expect(steelTension?.demandKn).toBeGreaterThan(0)
  })

  it('uses total design shear plus (Ωo - 1)E when earthquake is already included in the total', () => {
    const project = cloneProject(defaultProject)
    project.loads.shearXKn = 10
    project.loads.shearYKn = 0
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 2
    project.loads.designEarthquakeShearXKn = -8

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const steelShear = review.results.find((result) => result.id === 'steel-shear')

    expect(review.analysisLoads.shearXKn).toBe(2)
    expect(steelShear?.demandKn).toBe(2)
  })

  it('warns when hef exceeds the Chapter 17 breakout formula range', () => {
    const project = cloneProject(defaultProject)
    project.layout.effectiveEmbedmentMm = 700
    project.loads.tensionKn = 5

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.status).toBe('warning')
    expect(breakout?.note).toContain('> 635 mm')
  })

  it('does not pretend all anchors are loaded when there is no uplift demand', () => {
    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 0
    project.loads.momentXKnM = 0
    project.loads.momentYKnM = 0

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const pullout = review.results.find((result) => result.id === 'pullout')

    expect(pullout?.note).toContain('無受拉錨栓')
  })

  it('allows anchor reinforcement to replace concrete breakout in tension when stronger', () => {
    const project = cloneProject(defaultProject)
    project.layout.anchorReinforcementEnabled = true
    project.layout.anchorReinforcementAreaMm2 = 4000
    project.layout.anchorReinforcementYieldMpa = 420
    project.layout.anchorReinforcementWithinHalfCa1 = true
    project.layout.anchorReinforcementIntersectsEachAnchor = true
    project.layout.anchorReinforcementDevelopedForTension = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.formal).toBe(true)
    expect(breakout?.note).toContain('已取代混凝土拉破強度')
  })

  it('notes when anchor reinforcement takes over tension breakout beyond hef range', () => {
    const project = cloneProject(defaultProject)
    project.layout.effectiveEmbedmentMm = 700
    project.layout.anchorReinforcementEnabled = true
    project.layout.anchorReinforcementAreaMm2 = 4000
    project.layout.anchorReinforcementYieldMpa = 420
    project.layout.anchorReinforcementWithinHalfCa1 = true
    project.layout.anchorReinforcementIntersectsEachAnchor = true
    project.layout.anchorReinforcementDevelopedForTension = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.note).toContain('hef 已超出 17.6.2.2.1 基礎公式適用範圍')
  })

  it('tracks phi and psi factors on concrete breakout results', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(defaultProject, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.factors?.some((item) => item.symbol === 'φ')).toBe(true)
    expect(breakout?.factors?.some((item) => item.symbol === 'ψ_ec,N')).toBe(true)
  })

  it('tracks route and omega factors on seismic entry results', () => {
    const project = cloneProject(defaultProject)
    project.loads.considerSeismic = true
    project.loads.seismicDesignMethod = 'overstrength'
    project.loads.overstrengthFactor = 2
    project.loads.designEarthquakeTensionKn = 20

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const seismic = review.results.find((result) => result.id === 'seismic')

    expect(seismic?.factors?.some((item) => item.symbol === 'route')).toBe(true)
    expect(seismic?.factors?.some((item) => item.symbol === 'Ωo')).toBe(true)
  })

  it('keeps anchor reinforcement breakout replacement in screening until development is confirmed', () => {
    const project = cloneProject(defaultProject)
    project.layout.anchorReinforcementEnabled = true
    project.layout.anchorReinforcementAreaMm2 = 4000
    project.layout.anchorReinforcementYieldMpa = 420
    project.layout.anchorReinforcementWithinHalfCa1 = true
    project.layout.anchorReinforcementIntersectsEachAnchor = true
    project.layout.anchorReinforcementDevelopedForTension = false

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.formal).toBe(false)
    expect(['screening', 'fail']).toContain(breakout?.status)
    expect(breakout?.note).toContain('第25章伸展覆核')
  })

  it('allows anchor reinforcement to replace concrete shear breakout when stronger', () => {
    const project = cloneProject(defaultProject)
    project.layout.anchorReinforcementEnabled = true
    project.layout.anchorReinforcementAreaMm2 = 4000
    project.layout.anchorReinforcementYieldMpa = 420
    project.layout.anchorReinforcementWithinHalfCa1 = true
    project.layout.anchorReinforcementIntersectsEachAnchor = true
    project.layout.anchorReinforcementDevelopedForShear = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-shear',
    )

    expect(breakout?.formal).toBe(true)
    expect(breakout?.note).toContain('已取代混凝土剪破強度')
  })

  it('requires all anchor reinforcement checklist items before marking the path formal', () => {
    const project = cloneProject(defaultProject)
    project.layout.anchorReinforcementEnabled = true
    project.layout.anchorReinforcementAreaMm2 = 4000
    project.layout.anchorReinforcementYieldMpa = 420
    project.layout.anchorReinforcementWithinHalfCa1 = false
    project.layout.anchorReinforcementIntersectsEachAnchor = true
    project.layout.anchorReinforcementDevelopedForTension = true

    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const review = evaluateProject(project, castIn!)
    const breakout = review.results.find(
      (result) => result.id === 'concrete-breakout-tension',
    )

    expect(breakout?.formal).toBe(false)
    expect(breakout?.note).toContain('0.5ca1')
  })

  it('skips pryout for bonded anchors', () => {
    const bonded = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-bonded-m16')!,
    )
    bonded.evaluation.qualificationStandard = 'ACI_355_4'
    bonded.evaluation.anchorCategory = 1
    bonded.evaluation.crackedBondStressMpa = 10
    bonded.evaluation.uncrackedBondStressMpa = 14
    bonded.evaluation.minEdgeDistanceMm = 120
    bonded.evaluation.minSpacingMm = 180

    const project = cloneProject(defaultProject)
    project.selectedProductId = bonded.id

    const review = evaluateProject(project, bonded)

    expect(review.results.some((result) => result.id === 'pryout')).toBe(false)
  })

  it('evaluates multiple load cases and reports the controlling combination', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const project = cloneProject(defaultProject)
    project.loadCases = [
      {
        id: 'lc-service',
        name: '1.2D+1.6L',
        loads: {
          ...project.loads,
          tensionKn: 40,
          shearXKn: 8,
        },
      },
      {
        id: 'lc-seismic',
        name: '0.9D+1.0E',
        loads: {
          ...project.loads,
          tensionKn: 120,
          shearXKn: 28,
        },
      },
    ]
    project.activeLoadCaseId = 'lc-service'
    project.loads = { ...project.loadCases[0].loads }

    const batch = evaluateProjectBatch(project, castIn!)

    expect(batch.loadCaseReviews).toHaveLength(2)
    expect(batch.activeLoadCaseName).toBe('1.2D+1.6L')
    expect(batch.controllingLoadCaseName).toBe('0.9D+1.0E')
    expect(batch.summary.notes.join(' ')).toContain('控制組合為 0.9D+1.0E')
  })

  it('notes when the currently edited load case is also the controlling combination', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const project = cloneProject(defaultProject)
    project.loadCases = [
      {
        id: 'lc1',
        name: '0.9D+1.0E',
        loads: {
          ...project.loads,
          tensionKn: 120,
          shearXKn: 28,
        },
      },
      {
        id: 'lc2',
        name: '1.2D+1.6L',
        loads: {
          ...project.loads,
          tensionKn: 40,
          shearXKn: 8,
        },
      },
    ]
    project.activeLoadCaseId = 'lc1'
    project.loads = { ...project.loadCases[0].loads }

    const batch = evaluateProjectBatch(project, castIn!)

    expect(batch.summary.notes.join(' ')).toContain('當前編輯組合即為控制組合')
  })

  it('compares multiple candidate products and sorts by selection suitability', () => {
    const castIn = cloneProduct(
      defaultProducts.find((product) => product.id === 'generic-cast-m20')!,
    )
    const expansion = cloneProduct(
      defaultProducts.find((product) => product.id === 'template-expansion-m16')!,
    )
    expansion.evaluation.qualificationStandard = 'ACI_355_2'
    expansion.evaluation.anchorCategory = 1
    expansion.evaluation.minEdgeDistanceMm = 120
    expansion.evaluation.minSpacingMm = 180
    expansion.evaluation.crackedPulloutStrengthKn = 24
    expansion.evaluation.uncrackedPulloutStrengthKn = 28

    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120

    const comparison = evaluateCandidateProducts(project, [castIn, expansion])

    expect(comparison).toHaveLength(2)
    expect(comparison[0].product.id).toBe(castIn.id)
    expect(comparison[1].product.id).toBe(expansion.id)
  })

  it('compares candidate layouts and pushes the weaker geometry behind better options', () => {
    const castIn = defaultProducts.find((product) => product.id === 'generic-cast-m20')
    expect(castIn).toBeDefined()

    const project = cloneProject(defaultProject)
    project.loads.tensionKn = 120
    project.layout = {
      ...project.layout,
      edgeLeftMm: 90,
      edgeRightMm: 90,
      edgeBottomMm: 90,
      edgeTopMm: 90,
      effectiveEmbedmentMm: 110,
    }
    project.candidateLayoutVariants = [
      {
        id: 'layout-tight',
        name: '邊距不足方案',
        layout: {
          ...project.layout,
          edgeLeftMm: 70,
          edgeRightMm: 70,
          edgeBottomMm: 70,
          edgeTopMm: 70,
          effectiveEmbedmentMm: 100,
        },
        updatedAt: new Date().toISOString(),
      },
    ]

    const comparison = evaluateLayoutVariants(
      project,
      castIn!,
      project.candidateLayoutVariants,
    )

    expect(comparison).toHaveLength(2)
    expect(comparison[0].variant.id).toBe('__current__')
    expect(comparison[comparison.length - 1].variant.id).toBe('layout-tight')
  })
})
