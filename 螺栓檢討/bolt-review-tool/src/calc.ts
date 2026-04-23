import type {
  AnchorFamily,
  AnchorLayout,
  AnchorPoint,
  AnchorProduct,
  BearingConfinementMode,
  CheckResult,
  DimensionCheck,
  DimensionSource,
  LoadCaseReview,
  ProductCompleteness,
  ProjectLayoutVariant,
  ProjectCase,
  ProjectLoadCase,
  ReviewBatchResult,
  ReviewResult,
  ReviewStatus,
  RuleCitation,
  RuleProfile,
  ResultDiagnostic,
  ResultFactor,
  ReviewVisualization,
  ReviewVisualizationRectangle,
  VisualizationEdge,
} from './domain'
import { getRuleProfileById } from './ruleProfiles'
import {
  computeBasePlateStressState,
  hasMeaningfulBasePlateMoment,
} from './basePlateStressState'
import { getEffectiveBasePlateCantilevers } from './basePlateGeometry'

interface Interval {
  start: number
  end: number
}

interface Rectangle {
  x1: number
  x2: number
  y1: number
  y2: number
}

interface AnchorReinforcementStrength {
  nominalStrengthKn: number
  designStrengthKn: number
  formal: boolean
  note: string
}

interface AnchorTensionDemand {
  anchor: AnchorPoint
  appliedTensionKn: number
  elasticTensionKn: number
}

interface TensionDemandDistribution {
  perAnchor: AnchorTensionDemand[]
  loadedAnchors: AnchorTensionDemand[]
  loadedAnchorCount: number
  totalTensionKn: number
  maxAnchorTensionKn: number
  eccentricityMm: number
  eccentricityXmm: number
  eccentricityYmm: number
  note: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return value
  }

  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function factor(
  symbol: string,
  label: string,
  value: number | string,
  note?: string,
): ResultFactor {
  return {
    symbol,
    label,
    value: typeof value === 'number' ? String(round(value, 3)) : value,
    note,
  }
}

function diagnostic(
  key: string,
  severity: ReviewStatus,
  message: string,
): ResultDiagnostic {
  return { key, severity, message }
}

function grossAreaFromDiameter(diameterMm: number) {
  return Math.PI * diameterMm * diameterMm * 0.25
}

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) {
    return []
  }

  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = [sorted[0]]

  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1]
    if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end)
      continue
    }
    merged.push({ ...interval })
  }

  return merged
}

function unionLength(intervals: Interval[]) {
  return mergeIntervals(intervals).reduce(
    (sum, interval) => sum + Math.max(0, interval.end - interval.start),
    0,
  )
}

function unionArea(rectangles: Rectangle[]) {
  if (rectangles.length === 0) {
    return 0
  }

  const xs = Array.from(
    new Set(rectangles.flatMap((rect) => [rect.x1, rect.x2])),
  ).sort((a, b) => a - b)

  let total = 0
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index]
    const right = xs[index + 1]
    if (right <= left) {
      continue
    }

    const active = rectangles.filter(
      (rect) => rect.x1 < right && rect.x2 > left,
    )
    if (active.length === 0) {
      continue
    }

    const yIntervals = active.map((rect) => ({
      start: rect.y1,
      end: rect.y2,
    }))
    total += unionLength(yIntervals) * (right - left)
  }

  return total
}

function getAnchorCategory(product: AnchorProduct) {
  return product.evaluation.anchorCategory ?? 3
}

function getConcretePhiSelection(
  product: AnchorProduct,
  supplementaryReinforcement: boolean,
  mode: 'breakout' | 'pullout',
) {
  if (product.family === 'cast_in') {
    if (mode === 'pullout') {
      return {
        phi: 0.7,
        label: '預埋 Condition B（pullout / pryout 固定）',
      }
    }
    return {
      phi: supplementaryReinforcement ? 0.75 : 0.7,
      label: `預埋 ${supplementaryReinforcement ? 'Condition A' : 'Condition B'}`,
    }
  }

  const category = getAnchorCategory(product)
  if (mode === 'pullout') {
    if (category === 1) {
      return { phi: 0.65, label: '後置分類 1' }
    }
    if (category === 2) {
      return { phi: 0.55, label: '後置分類 2' }
    }
    return { phi: 0.45, label: '後置分類 3' }
  }

  if (supplementaryReinforcement) {
    if (category === 1) {
      return { phi: 0.75, label: '後置分類 1 + Condition A' }
    }
    if (category === 2) {
      return { phi: 0.65, label: '後置分類 2 + Condition A' }
    }
    return { phi: 0.55, label: '後置分類 3 + Condition A' }
  }

  if (category === 1) {
    return { phi: 0.65, label: '後置分類 1 + Condition B' }
  }
  if (category === 2) {
    return { phi: 0.55, label: '後置分類 2 + Condition B' }
  }
  return { phi: 0.45, label: '後置分類 3 + Condition B' }
}

function concretePhi(
  product: AnchorProduct,
  supplementaryReinforcement: boolean,
  mode: 'breakout' | 'pullout',
) {
  return getConcretePhiSelection(product, supplementaryReinforcement, mode).phi
}

function getResultSeverity(status: ReviewStatus) {
  switch (status) {
    case 'fail':
      return 5
    case 'incomplete':
      return 4
    case 'screening':
      return 3
    case 'warning':
      return 2
    case 'pass':
    default:
      return 1
  }
}

function compareResultsForGovernance(first: CheckResult, second: CheckResult) {
  const severityGap = getResultSeverity(second.status) - getResultSeverity(first.status)
  if (severityGap !== 0) {
    return severityGap
  }
  return second.dcr - first.dcr
}

function compareLoadCaseReviewsForGovernance(
  first: LoadCaseReview,
  second: LoadCaseReview,
) {
  const overallGap =
    getResultSeverity(second.review.summary.overallStatus) -
    getResultSeverity(first.review.summary.overallStatus)
  if (overallGap !== 0) {
    return overallGap
  }

  const formalGap =
    getResultSeverity(second.review.summary.formalStatus) -
    getResultSeverity(first.review.summary.formalStatus)
  if (formalGap !== 0) {
    return formalGap
  }

  return (
    (second.review.summary.governingDcr ?? second.review.summary.maxDcr) -
    (first.review.summary.governingDcr ?? first.review.summary.maxDcr)
  )
}

function compareBatchReviewsForSelection(
  first: ReviewBatchResult,
  second: ReviewBatchResult,
) {
  const overallGap =
    getResultSeverity(first.summary.overallStatus) -
    getResultSeverity(second.summary.overallStatus)
  if (overallGap !== 0) {
    return overallGap
  }

  const formalGap =
    getResultSeverity(first.summary.formalStatus) -
    getResultSeverity(second.summary.formalStatus)
  if (formalGap !== 0) {
    return formalGap
  }

  const firstGoverning = first.summary.governingDcr ?? first.summary.maxDcr
  const secondGoverning = second.summary.governingDcr ?? second.summary.maxDcr
  if (firstGoverning !== secondGoverning) {
    return firstGoverning - secondGoverning
  }

  return first.summary.maxDcr - second.summary.maxDcr
}

function getProjectLoadCases(project: ProjectCase) {
  const loadCases =
    project.loadCases && project.loadCases.length > 0
      ? project.loadCases
      : [
          {
            id: project.activeLoadCaseId ?? 'load-case-1',
            name: 'LC1',
            loads: project.loads,
          } satisfies ProjectLoadCase,
        ]

  return loadCases.map((loadCase) => ({
    ...loadCase,
    loads: {
      ...project.loads,
      ...loadCase.loads,
    },
  }))
}

function pickGoverningMode(
  results: CheckResult[],
  emptyLabel: string,
  zeroDemandLabel: string,
) {
  if (results.length === 0) {
    return emptyLabel
  }

  const governing = [...results].sort(compareResultsForGovernance)[0]
  if (governing.status === 'pass' && governing.dcr <= 0) {
    return zeroDemandLabel
  }

  return governing.mode
}

function getDefaultShearAnchorCount(project: ProjectCase) {
  const dominantX = Math.abs(project.loads.shearXKn)
  const dominantY = Math.abs(project.loads.shearYKn)

  if (dominantX > dominantY) {
    return Math.max(1, project.layout.anchorCountY)
  }
  if (dominantY > dominantX) {
    return Math.max(1, project.layout.anchorCountX)
  }
  return Math.max(1, Math.max(project.layout.anchorCountX, project.layout.anchorCountY))
}

function getShearLeverArmFactor(project: ProjectCase, product: AnchorProduct) {
  const leverArm = Math.max(0, project.loads.shearLeverArmMm ?? 0)
  if (leverArm <= 0 || product.diameterMm <= 0) {
    return 1
  }

  return Math.min(1, 1 / (1 + leverArm / (2 * product.diameterMm)))
}

function getEarthquakeShearComponents(loads: ProjectCase['loads']) {
  if (
    typeof loads.designEarthquakeShearXKn === 'number' ||
    typeof loads.designEarthquakeShearYKn === 'number'
  ) {
    return {
      x: loads.designEarthquakeShearXKn ?? 0,
      y: loads.designEarthquakeShearYKn ?? 0,
    }
  }

  return {
    x: loads.designEarthquakeShearKn ?? 0,
    y: 0,
  }
}

function getEarthquakeMomentComponents(loads: ProjectCase['loads']) {
  return {
    x: loads.designEarthquakeMomentXKnM ?? 0,
    y: loads.designEarthquakeMomentYKnM ?? 0,
  }
}

function getSeismicInputMode(loads: ProjectCase['loads']) {
  return loads.seismicInputMode ?? 'total_design'
}

function getBasePlateConfinementMode(
  layout: AnchorLayout,
): BearingConfinementMode {
  if (layout.basePlateConfinementMode === 'partial') {
    return 'partial'
  }
  if (
    layout.basePlateConfinementMode === 'full' ||
    layout.basePlateConfinedOnAllSides
  ) {
    return 'full'
  }
  return 'none'
}

function getBasePlateBendingCitation(profile: RuleProfile): RuleCitation {
  return {
    ...profile.citations.supportBearing,
    title: '基板抗彎厚度',
    note: 'AISC DG1 工程擴充',
  }
}

function getMinimumAvailableDesignMode(
  results: Array<CheckResult | null | undefined>,
) {
  return results
    .filter(
      (result): result is CheckResult =>
        result != null &&
        result.status !== 'incomplete' &&
        Number.isFinite(result.designStrengthKn) &&
        result.designStrengthKn > 0,
    )
    .sort((left, right) => {
      const strengthGap =
        round(left.designStrengthKn, 1) - round(right.designStrengthKn, 1)
      if (strengthGap !== 0) {
        return strengthGap
      }
      return compareResultsForGovernance(left, right)
    })[0]
}

function composeLoadsWithEarthquakeFactor(
  loads: ProjectCase['loads'],
  earthquakeFactor: number,
) {
  const earthquakeShear = getEarthquakeShearComponents(loads)
  const earthquakeMoment = getEarthquakeMomentComponents(loads)
  const earthquakeTension = Math.max(0, loads.designEarthquakeTensionKn)

  return {
    ...loads,
    // Preserve the load sign here so downstream tension and bearing checks can
    // independently route tension (+) and compression (-) demand correctly.
    tensionKn: loads.tensionKn + earthquakeFactor * earthquakeTension,
    shearXKn: loads.shearXKn + earthquakeFactor * earthquakeShear.x,
    shearYKn: loads.shearYKn + earthquakeFactor * earthquakeShear.y,
    momentXKnM: loads.momentXKnM + earthquakeFactor * earthquakeMoment.x,
    momentYKnM: loads.momentYKnM + earthquakeFactor * earthquakeMoment.y,
  }
}

function getSeismicAmplificationFactor(loads: ProjectCase['loads']) {
  if (!loads.considerSeismic) {
    return 1
  }

  switch (loads.seismicDesignMethod) {
    case 'overstrength':
      return Math.max(1, loads.overstrengthFactor ?? 1)
    case 'nonyielding_attachment':
      return Math.max(
        1,
        loads.attachmentOverstrengthFactor ?? loads.overstrengthFactor ?? 1,
      )
    default:
      return 1
  }
}

function getEntryTotalLoads(loads: ProjectCase['loads']) {
  if (
    loads.considerSeismic &&
    getSeismicInputMode(loads) === 'static_plus_earthquake'
  ) {
    return composeLoadsWithEarthquakeFactor(loads, 1)
  }

  return loads
}

function getBondCriticalEdgeDistance(
  product: AnchorProduct,
  crackedConcrete: boolean,
) {
  if (product.evaluation.criticalEdgeDistanceMm) {
    return {
      valueMm: product.evaluation.criticalEdgeDistanceMm,
      source: 'product' as const,
    }
  }

  const tauUncr = product.evaluation.uncrackedBondStressMpa
  if (tauUncr && tauUncr > 0) {
    return {
      valueMm: 10 * product.diameterMm * Math.sqrt(tauUncr / 7.6),
      source: 'tau_uncr' as const,
    }
  }

  const tauCr = product.evaluation.crackedBondStressMpa
  if (crackedConcrete && tauCr && tauCr > 0) {
    return {
      valueMm: 10 * product.diameterMm * Math.sqrt(tauCr / 4.5),
      source: 'tau_cr' as const,
    }
  }

  return null
}

function getConcreteBreakoutCrackingAdjustment(
  product: AnchorProduct,
  layout: AnchorLayout,
) {
  if (layout.crackedConcrete) {
    return { factor: 1, formal: true, note: '' }
  }

  if (product.family === 'cast_in') {
    return { factor: 1.25, formal: true, note: '' }
  }

  if (isPostInstalledFamily(product.family)) {
    if (product.evaluation.uncrackedConcreteQualified) {
      const ratio = clamp(product.evaluation.kcUncrackedRatio ?? 1.4, 1, 1.4)
      return {
        factor: ratio,
        formal: true,
        note:
          ratio !== 1.4
            ? `未開裂混凝土 kc 比值採 ${round(ratio, 3)}`
            : '',
      }
    }
    return {
      factor: 1,
      formal: false,
      note: '未覆核產品評估報告之未開裂混凝土適用性，ψ_c,N 退回 1.0 並維持初篩',
    }
  }

  return { factor: 1, formal: true, note: '' }
}

function buildEffectiveProjectForChecks(project: ProjectCase) {
  if (!project.loads.considerSeismic) {
    return { project, note: '' }
  }

  const seismicInputMode = getSeismicInputMode(project.loads)
  const amplificationFactor = getSeismicAmplificationFactor(project.loads)
  const amplificationLabel =
    project.loads.seismicDesignMethod === 'nonyielding_attachment'
      ? 'Ω_attachment'
      : 'Ωo'

  if (seismicInputMode === 'static_plus_earthquake') {
    return {
      project: {
        ...project,
        loads: composeLoadsWithEarthquakeFactor(
          project.loads,
          amplificationFactor,
        ),
      },
      note:
        amplificationFactor > 1
          ? `已依靜載 / 非地震分量 + ${amplificationLabel} × 地震分量（${amplificationLabel} = ${round(amplificationFactor, 2)}）組成主檢核載重`
          : '已依靜載 / 非地震分量 + 1.0E 組成主檢核載重',
    }
  }

  if (amplificationFactor <= 1) {
    return { project, note: '' }
  }

  return {
    project: {
      ...project,
      loads: composeLoadsWithEarthquakeFactor(
        project.loads,
        amplificationFactor - 1,
      ),
    },
    note: `已依總設計值 + (${amplificationLabel} - 1) × 地震分量（${amplificationLabel} = ${round(amplificationFactor, 2)}）組成主檢核載重`,
  }
}

function getProductFamilyLabel(family: AnchorFamily) {
  switch (family) {
    case 'cast_in':
      return '預埋錨栓'
    case 'post_installed_expansion':
      return '後置膨脹錨栓'
    case 'post_installed_bonded':
      return '後置黏結式錨栓'
    case 'screw_anchor':
      return '螺紋錨栓'
    case 'undercut_anchor':
      return '擴底式錨栓'
    case 'shear_lug':
      return '剪力榫'
    default:
      return family
  }
}

function getAnchorReinforcementStrength(
  layout: AnchorLayout,
  mode: 'tension' | 'shear',
): AnchorReinforcementStrength | null {
  if (!layout.anchorReinforcementEnabled) {
    return null
  }

  if (
    layout.anchorReinforcementAreaMm2 <= 0 ||
    layout.anchorReinforcementYieldMpa <= 0
  ) {
    return null
  }

  const unmetChecks: string[] = []
  if (!layout.anchorReinforcementWithinHalfCa1) {
    unmetChecks.push('補強鋼筋需位於 0.5ca1 範圍內')
  }
  if (!layout.anchorReinforcementIntersectsEachAnchor) {
    unmetChecks.push('每支錨栓至少 1 根鋼筋需與潛在破壞面相交')
  }
  if (
    mode === 'tension'
      ? !layout.anchorReinforcementDevelopedForTension
      : !layout.anchorReinforcementDevelopedForShear
  ) {
    unmetChecks.push(
      mode === 'tension'
        ? '拉力 failure plane 兩側需完成第25章伸展覆核'
        : '剪力 failure plane 兩側需完成第25章伸展覆核',
    )
  }
  const formal = unmetChecks.length === 0
  const nominalStrengthKn =
    (layout.anchorReinforcementAreaMm2 *
      layout.anchorReinforcementYieldMpa) /
    1000
  const designStrengthKn = 0.75 * nominalStrengthKn

  return {
    nominalStrengthKn,
    designStrengthKn,
    formal,
    note: `依 17.5.2.1(d) / 17.5.2.1.1 採錨栓群周圍有效補強鋼筋總面積 As = ${round(layout.anchorReinforcementAreaMm2, 1)} mm²、fy = ${round(layout.anchorReinforcementYieldMpa, 1)} MPa、φ = 0.75${formal ? '' : `；${unmetChecks.join('、')}，結果維持初篩`}`,
  }
}

function isPostInstalledFamily(family: AnchorFamily) {
  return (
    family === 'post_installed_expansion' ||
    family === 'post_installed_bonded' ||
    family === 'screw_anchor' ||
    family === 'undercut_anchor'
  )
}

function buildTensionDemandDistribution(
  project: ProjectCase,
  anchorPoints: AnchorPoint[],
): TensionDemandDistribution {
  if (anchorPoints.length === 0) {
    return {
      perAnchor: [],
      loadedAnchors: [],
      loadedAnchorCount: 0,
      totalTensionKn: 0,
      maxAnchorTensionKn: 0,
      eccentricityMm: 0,
      eccentricityXmm: 0,
      eccentricityYmm: 0,
      note: '無錨栓座標可供分配拉力需求',
    }
  }

  const centroidX =
    anchorPoints.reduce((sum, point) => sum + point.x, 0) / anchorPoints.length
  const centroidY =
    anchorPoints.reduce((sum, point) => sum + point.y, 0) / anchorPoints.length
  const inertiaX = anchorPoints.reduce(
    (sum, point) => sum + (point.y - centroidY) ** 2,
    0,
  )
  const inertiaY = anchorPoints.reduce(
    (sum, point) => sum + (point.x - centroidX) ** 2,
    0,
  )
  const directTension = Math.max(0, project.loads.tensionKn) / anchorPoints.length
  const momentXKnMm = project.loads.momentXKnM * 1000
  const momentYKnMm = project.loads.momentYKnM * 1000
  const clippedAxes: string[] = []

  const perAnchor = anchorPoints.map((anchor) => {
    const x = anchor.x - centroidX
    const y = anchor.y - centroidY
    const momentXContribution =
      inertiaX > 0 ? (momentXKnMm * y) / inertiaX : 0
    const momentYContribution =
      inertiaY > 0 ? (momentYKnMm * x) / inertiaY : 0
    const elasticTension =
      directTension + momentXContribution + momentYContribution

    return {
      anchor,
      appliedTensionKn: Math.max(0, elasticTension),
      elasticTensionKn: elasticTension,
    }
  })

  if (Math.abs(momentXKnMm) > 0 && inertiaX === 0) {
    clippedAxes.push('Mx')
  }
  if (Math.abs(momentYKnMm) > 0 && inertiaY === 0) {
    clippedAxes.push('My')
  }

  const loadedAnchors = perAnchor.filter((item) => item.appliedTensionKn > 1e-6)
  const totalTensionKn = loadedAnchors.reduce(
    (sum, item) => sum + item.appliedTensionKn,
    0,
  )
  const maxAnchorTensionKn = loadedAnchors.reduce(
    (max, item) => Math.max(max, item.appliedTensionKn),
    0,
  )

  let eccentricityMm = 0
  let eccentricityXmm = 0
  let eccentricityYmm = 0
  if (totalTensionKn > 0) {
    const loadedGroupCentroidX =
      loadedAnchors.reduce((sum, item) => sum + item.anchor.x, 0) /
      loadedAnchors.length
    const loadedGroupCentroidY =
      loadedAnchors.reduce((sum, item) => sum + item.anchor.y, 0) /
      loadedAnchors.length
    const resultantX =
      loadedAnchors.reduce(
        (sum, item) => sum + item.anchor.x * item.appliedTensionKn,
        0,
      ) / totalTensionKn
    const resultantY =
      loadedAnchors.reduce(
        (sum, item) => sum + item.anchor.y * item.appliedTensionKn,
        0,
      ) / totalTensionKn
    eccentricityXmm = clamp(
      resultantX - loadedGroupCentroidX,
      -project.layout.concreteWidthMm,
      project.layout.concreteWidthMm,
    )
    eccentricityYmm = clamp(
      resultantY - loadedGroupCentroidY,
      -project.layout.concreteHeightMm,
      project.layout.concreteHeightMm,
    )
    eccentricityMm = Math.hypot(eccentricityXmm, eccentricityYmm)
  }

  const noteParts = [
    loadedAnchors.length > 0
      ? `採剛體基板近似分配 N / Mx / My，受拉側 ${loadedAnchors.length} 支錨栓參與拉力檢核`
      : '採剛體基板近似分配 N / Mx / My，目前無受拉側錨栓參與拉力檢核',
  ]
  if (project.loads.tensionKn < 0) {
    noteParts.push('壓力（負拉力）已於直接拉力項視為 0，僅彎矩分量參與拉力分配')
  }
  if (Math.abs(project.loads.momentXKnM) > 0 || Math.abs(project.loads.momentYKnM) > 0) {
    noteParts.push(
      `ΣT = ${round(totalTensionKn, 2)} kN，Tmax = ${round(maxAnchorTensionKn, 2)} kN，e'N = ${round(eccentricityMm, 1)} mm`,
    )
  }
  if (clippedAxes.length > 0) {
    noteParts.push(`${clippedAxes.join(' / ')} 無拉力分配力臂，該方向彎矩未納入錨栓拉力分配`)
  }

  return {
    perAnchor,
    loadedAnchors,
    loadedAnchorCount: loadedAnchors.length,
    totalTensionKn,
    maxAnchorTensionKn,
    eccentricityMm,
    eccentricityXmm,
    eccentricityYmm,
    note: noteParts.join('；'),
  }
}

function getTensionBreakoutBaseStrengthKn(
  profile: RuleProfile,
  product: AnchorProduct,
  layout: AnchorLayout,
) {
  const lambda = layout.lightweightConcrete ? 0.75 : profile.constants.lambdaA
  const hef = layout.effectiveEmbedmentMm
  if (hef >= 280 && hef <= 635) {
    return {
      strengthKn:
        (16 * lambda * Math.sqrt(layout.concreteStrengthMpa) * hef ** (5 / 3)) /
        1000,
      inRange: true,
      note: '',
    }
  }

  const kc =
    product.family === 'cast_in'
      ? profile.constants.kcCastIn
      : profile.constants.kcPostInstalled
  return {
    strengthKn: (kc * lambda * Math.sqrt(layout.concreteStrengthMpa) * hef ** 1.5) / 1000,
    inRange: hef <= 635,
    note:
      hef > 635
        ? 'hef 已超出 17.6.2.2.1 公式建議適用範圍（> 635 mm），目前結果僅供保守初篩。'
        : '',
  }
}

export function buildAnchorPoints(layout: AnchorLayout): AnchorPoint[] {
  const points: AnchorPoint[] = []
  const nx = layout.anchorCountX
  const ny = layout.anchorCountY
  const pattern = layout.anchorLayoutPattern ?? 'grid'

  for (let indexX = 0; indexX < nx; indexX += 1) {
    for (let indexY = 0; indexY < ny; indexY += 1) {
      // perimeter 型式：只保留外框，剔除內部（當 nx ≥ 3 且 ny ≥ 3 才有內部）
      if (
        pattern === 'perimeter' &&
        nx >= 3 &&
        ny >= 3 &&
        indexX > 0 &&
        indexX < nx - 1 &&
        indexY > 0 &&
        indexY < ny - 1
      ) {
        continue
      }
      points.push({
        id: `A${indexX + 1}-${indexY + 1}`,
        x: layout.edgeLeftMm + indexX * layout.spacingXmm,
        y: layout.edgeBottomMm + indexY * layout.spacingYmm,
      })
    }
  }

  return points
}

export function assessProductCompleteness(
  product: AnchorProduct,
): ProductCompleteness {
  const missing: string[] = []

  if (product.family === 'cast_in') {
    if (!product.headBearingAreaMm2 && !product.hookExtensionMm) {
      missing.push('需提供擴頭承壓面積或彎鉤伸長 eh')
    }
    if (
      !product.headBearingAreaMm2 &&
      product.hookExtensionMm &&
      (product.hookExtensionMm < 3 * product.diameterMm ||
        product.hookExtensionMm > 4.5 * product.diameterMm)
    ) {
      missing.push('彎鉤伸長 eh 須符合 3da 至 4.5da')
    }
    return { formal: missing.length === 0, missing }
  }

  if (!product.evaluation.qualificationStandard) {
    missing.push('缺少產品評估標準')
  }
  if (!product.evaluation.anchorCategory) {
    missing.push('缺少後置錨栓分類 1 / 2 / 3')
  }

  if (!product.evaluation.minEdgeDistanceMm) {
    missing.push('缺少產品最小邊距 cmin')
  }

  if (!product.evaluation.minSpacingMm) {
    missing.push('缺少產品最小間距 smin')
  }

  if (product.family === 'post_installed_expansion') {
    if (
      !product.evaluation.crackedPulloutStrengthKn &&
      !product.evaluation.uncrackedPulloutStrengthKn
    ) {
      missing.push('缺少膨脹錨栓拉出破壞強度資料')
    }
  }

  if (product.family === 'post_installed_bonded') {
    if (!product.evaluation.crackedBondStressMpa) {
      missing.push('缺少開裂混凝土握裹強度')
    }
    if (!product.evaluation.uncrackedBondStressMpa) {
      missing.push('缺少未開裂混凝土握裹強度')
    }
  }

  return { formal: missing.length === 0, missing }
}

function getSpacingRequirement(
  product: AnchorProduct,
  layout: AnchorLayout,
): { requiredMm: number; source: DimensionSource; note: string } {
  if (product.evaluation.minSpacingMm) {
    return {
      requiredMm: product.evaluation.minSpacingMm,
      source: 'product',
      note: '採產品評估報告之最小間距',
    }
  }

  if (product.family === 'cast_in') {
    return {
      requiredMm:
        product.installationBehavior === 'not_torqued'
          ? 4 * product.diameterMm
          : 6 * product.diameterMm,
      source: 'code',
      note: '採 17.9.2(a) 預埋錨栓基本值',
    }
  }

  if (product.family === 'screw_anchor') {
    return {
      requiredMm: 6 * product.diameterMm,
      source: 'code_fallback',
      note: '採 17.9.2(a) 螺紋錨栓基本值',
    }
  }

  return {
    requiredMm: Math.max(0.6 * layout.effectiveEmbedmentMm, 6 * product.diameterMm),
    source: 'code_fallback',
    note: '未輸入產品 smin，退回 17.9.2(a) 基本值',
  }
}

function getEdgeRequirement(
  product: AnchorProduct,
  layout: AnchorLayout,
): { requiredMm: number; source: DimensionSource; note: string } {
  const coverRequirement = layout.specifiedCoverRequirementMm
  const aggregateRequirement = 2 * layout.maxAggregateSizeMm

  if (product.family === 'cast_in') {
    return {
      requiredMm:
        product.installationBehavior === 'not_torqued'
          ? coverRequirement
          : 6 * product.diameterMm,
      source: 'code',
      note:
        product.installationBehavior === 'not_torqued'
          ? '採 17.9.2(a) 規範保護層需求'
          : '採 17.9.2(a) 扭緊預埋錨栓最小邊距',
    }
  }

  const productMinimum = product.evaluation.minEdgeDistanceMm
  if (productMinimum) {
    return {
      requiredMm: Math.max(coverRequirement, aggregateRequirement, productMinimum),
      source: 'product',
      note: '採產品評估報告之最小邊距',
    }
  }

  let fallback = 6 * product.diameterMm
  if (product.family === 'post_installed_expansion') {
    fallback =
      product.installationBehavior === 'displacement_controlled'
        ? 10 * product.diameterMm
        : 8 * product.diameterMm
  }

  return {
    requiredMm: Math.max(coverRequirement, aggregateRequirement, fallback),
    source: 'code_fallback',
    note: '缺少產品 cmin，退回 17.9.2(a)/(b) 基本值',
  }
}

function getThicknessRequirement(
  product: AnchorProduct,
  layout: AnchorLayout,
): { requiredMm: number; source: DimensionSource; note: string } {
  if (product.evaluation.minThicknessMm) {
    return {
      requiredMm: product.evaluation.minThicknessMm,
      source: 'product',
      note: '採產品評估報告之最小厚度',
    }
  }

  if (
    product.family === 'post_installed_expansion' ||
    product.family === 'undercut_anchor'
  ) {
    const hef = layout.effectiveEmbedmentMm
    const minimum = Math.max(1.5 * hef, hef + 100)
    return {
      requiredMm: minimum,
      source: 'code_fallback',
      note: '採 17.9.4 反推最小構材厚度：ha ≥ max(1.5hef, hef + 100)',
    }
  }

  return {
    requiredMm: layout.effectiveEmbedmentMm,
    source: 'code',
    note: '無額外厚度限制，僅檢查埋置深度不超過構材厚度',
  }
}

function createDimensionCheck(params: {
  id: string
  label: string
  requiredMm: number
  actualMm: number
  source: DimensionSource
  citation: RuleCitation
  note: string
  singleAnchorNote?: string
  exactMatch?: boolean
  toleranceMm?: number
}) {
  const toleranceMm = params.toleranceMm ?? 0.5
  const status: ReviewStatus =
    params.exactMatch
      ? Math.abs(params.actualMm - params.requiredMm) <= toleranceMm
        ? 'pass'
        : 'fail'
      : params.actualMm >= params.requiredMm
        ? 'pass'
        : 'fail'

  return {
    id: params.id,
    label: params.label,
    requiredMm: round(params.requiredMm, 1),
    actualMm: round(params.actualMm, 1),
    source: params.source,
    citation: params.citation,
    status,
    note: params.singleAnchorNote ?? params.note,
  } satisfies DimensionCheck
}

function buildDimensionChecks(
  profile: RuleProfile,
  product: AnchorProduct,
  layout: AnchorLayout,
) {
  const spacing = getSpacingRequirement(product, layout)
  const edge = getEdgeRequirement(product, layout)
  const thickness = getThicknessRequirement(product, layout)

  const actualSpacingX =
    layout.anchorCountX > 1 ? layout.spacingXmm : Number.POSITIVE_INFINITY
  const actualSpacingY =
    layout.anchorCountY > 1 ? layout.spacingYmm : Number.POSITIVE_INFINITY
  const actualSpacing = Math.min(actualSpacingX, actualSpacingY)
  const actualEdge = Math.min(
    layout.edgeLeftMm,
    layout.edgeRightMm,
    layout.edgeBottomMm,
    layout.edgeTopMm,
  )
  const actualWidthClosure =
    layout.edgeLeftMm +
    Math.max(0, layout.anchorCountX - 1) * layout.spacingXmm +
    layout.edgeRightMm
  const actualHeightClosure =
    layout.edgeBottomMm +
    Math.max(0, layout.anchorCountY - 1) * layout.spacingYmm +
    layout.edgeTopMm

  const spacingCheck = createDimensionCheck({
    id: 'spacing',
    label: '最小間距 smin',
    requiredMm: spacing.requiredMm,
    actualMm:
      actualSpacing === Number.POSITIVE_INFINITY ? spacing.requiredMm : actualSpacing,
    source: spacing.source,
    citation: profile.citations.minimumDimensions,
    note: spacing.note,
    singleAnchorNote:
      actualSpacing === Number.POSITIVE_INFINITY ? '單錨配置，間距檢核視為滿足' : undefined,
  })

  const edgeCheck = createDimensionCheck({
    id: 'edge',
    label: '最小邊距 cmin',
    requiredMm: edge.requiredMm,
    actualMm: actualEdge,
    source: edge.source,
    citation: profile.citations.minimumDimensions,
    note: edge.note,
  })

  const thicknessCheck = createDimensionCheck({
    id: 'thickness',
    label: '最小厚度 hmin',
    requiredMm: thickness.requiredMm,
    actualMm: layout.thicknessMm,
    source: thickness.source,
    citation: profile.citations.minimumDimensions,
    note: thickness.note,
  })

  const widthClosureCheck = createDimensionCheck({
    id: 'geometry-width-closure',
    label: 'X 向幾何閉合',
    requiredMm: layout.concreteWidthMm,
    actualMm: actualWidthClosure,
    source: 'code',
    citation: profile.citations.minimumDimensions,
    note: '檢查 edgeLeft + (nX - 1)·sx + edgeRight 是否等於構件寬度',
    exactMatch: true,
  })

  const heightClosureCheck = createDimensionCheck({
    id: 'geometry-height-closure',
    label: 'Y 向幾何閉合',
    requiredMm: layout.concreteHeightMm,
    actualMm: actualHeightClosure,
    source: 'code',
    citation: profile.citations.minimumDimensions,
    note: '檢查 edgeBottom + (nY - 1)·sy + edgeTop 是否等於構件高度',
    exactMatch: true,
  })

  return [
    spacingCheck,
    edgeCheck,
    thicknessCheck,
    widthClosureCheck,
    heightClosureCheck,
  ]
}

function buildTensionBreakoutRectangles(
  anchorPoints: AnchorPoint[],
  layout: AnchorLayout,
) {
  const radius = 1.5 * layout.effectiveEmbedmentMm
  return anchorPoints.map((anchor) => ({
    x1: clamp(anchor.x - radius, 0, layout.concreteWidthMm),
    x2: clamp(anchor.x + radius, 0, layout.concreteWidthMm),
    y1: clamp(anchor.y - radius, 0, layout.concreteHeightMm),
    y2: clamp(anchor.y + radius, 0, layout.concreteHeightMm),
  }))
}

function getActualMinimumEdgeDistance(layout: AnchorLayout) {
  return Math.min(
    layout.edgeLeftMm,
    layout.edgeRightMm,
    layout.edgeBottomMm,
    layout.edgeTopMm,
  )
}

function getAnchorSteelUltimate(product: AnchorProduct) {
  return Math.min(
    product.steelUltimateStrengthMpa,
    1.9 * product.steelYieldStrengthMpa,
    862,
  )
}

function getConcreteBreakoutTension(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  tensionDemand: TensionDemandDistribution,
  formal: boolean,
): CheckResult {
  const { layout } = project
  const phiSelection = getConcretePhiSelection(
    product,
    layout.supplementaryReinforcement,
    'breakout',
  )
  const crackingAdjustment = getConcreteBreakoutCrackingAdjustment(product, layout)
  const activeAnchorPoints = tensionDemand.loadedAnchors.map((item) => item.anchor)
  if (activeAnchorPoints.length === 0) {
    return {
      id: 'concrete-breakout-tension',
      mode: '混凝土拉破強度',
      citation: profile.citations.concreteBreakoutTension,
      status: formal ? 'pass' : 'screening',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal,
      edgeDistanceSource: 'code',
      note: '目前無受拉錨栓，混凝土拉破強度不成控制。',
    }
  }
  const failureArea = unionArea(
    buildTensionBreakoutRectangles(activeAnchorPoints, layout),
  )
  const singleArea = 9 * layout.effectiveEmbedmentMm * layout.effectiveEmbedmentMm
  const baseStrength = getTensionBreakoutBaseStrengthKn(profile, product, layout)
  const edgeDistanceFactor = Math.min(
    1,
    0.7 + 0.3 * (getActualMinimumEdgeDistance(layout) / (1.5 * layout.effectiveEmbedmentMm)),
  )
  const eccentricityFactor =
    tensionDemand.totalTensionKn > 0
      ? Math.min(
          1,
          1 /
            (1 + (2 * Math.abs(tensionDemand.eccentricityXmm)) / (3 * layout.effectiveEmbedmentMm)),
        ) *
        Math.min(
          1,
          1 /
            (1 + (2 * Math.abs(tensionDemand.eccentricityYmm)) / (3 * layout.effectiveEmbedmentMm)),
        )
      : 1
  const crackingFactor = crackingAdjustment.factor
  const nominalStrengthKn =
    (failureArea / singleArea) *
    edgeDistanceFactor *
    eccentricityFactor *
    crackingFactor *
    baseStrength.strengthKn
  const phi = phiSelection.phi
  const concreteDesignStrengthKn = phi * nominalStrengthKn
  const anchorReinforcement = getAnchorReinforcementStrength(layout, 'tension')
  const useAnchorReinforcement =
    Boolean(anchorReinforcement) &&
    (anchorReinforcement?.designStrengthKn ?? 0) > concreteDesignStrengthKn
  const designStrengthKn = useAnchorReinforcement
    ? anchorReinforcement!.designStrengthKn
    : concreteDesignStrengthKn
  const selectedNominalStrengthKn = useAnchorReinforcement
    ? anchorReinforcement!.nominalStrengthKn
    : nominalStrengthKn
  const demandKn = tensionDemand.totalTensionKn
  const dcr = demandKn <= 0 ? 0 : demandKn / designStrengthKn
  const breakoutFormal = useAnchorReinforcement
    ? formal && anchorReinforcement!.formal
    : formal && crackingAdjustment.formal && baseStrength.inRange

  let status: ReviewStatus = useAnchorReinforcement
    ? breakoutFormal
      ? 'pass'
      : 'screening'
    : breakoutFormal
      ? 'pass'
      : baseStrength.inRange
        ? 'screening'
        : 'warning'
  if (dcr > 1) {
    status = 'fail'
  }

  return {
    id: 'concrete-breakout-tension',
    mode: '混凝土拉破強度',
    citation: profile.citations.concreteBreakoutTension,
    status,
    designStrengthKn: round(designStrengthKn),
    nominalStrengthKn: round(selectedNominalStrengthKn),
    demandKn: round(demandKn),
    dcr: round(dcr, 3),
    formal: breakoutFormal,
    edgeDistanceSource: 'code',
    factors: [
      factor('A_Nc/A_Nco', '群錨投影面積比', failureArea / singleArea),
      factor('ψ_ed,N', '邊距修正', edgeDistanceFactor),
      factor('ψ_ec,N', '偏心修正', eccentricityFactor),
      factor('ψ_c,N', '裂縫修正', crackingFactor, phiSelection.label),
      factor('φ', '強度折減因子', phi, phiSelection.label),
      ...(anchorReinforcement
        ? [
            factor('φAsfy', '補強鋼筋路徑設計強度', anchorReinforcement.designStrengthKn, anchorReinforcement.note),
            factor('adopt', '採用設計強度', designStrengthKn, useAnchorReinforcement ? '補強鋼筋取代混凝土拉破路徑' : '混凝土拉破路徑控制'),
          ]
        : []),
    ],
    note: `A_Nc / A_Nco = ${round(failureArea / singleArea, 3)}，ψ_ed,N = ${round(edgeDistanceFactor, 3)}，ψ_ec,N = ${round(eccentricityFactor, 3)} (ex = ${round(Math.abs(tensionDemand.eccentricityXmm), 1)} mm, ey = ${round(Math.abs(tensionDemand.eccentricityYmm), 1)} mm)，ψ_c,N = ${round(crackingFactor, 3)}，φ = ${round(phi, 2)}（${phiSelection.label}）${crackingAdjustment.note ? `；${crackingAdjustment.note}` : ''}${baseStrength.note ? `；${baseStrength.note}` : ''}${anchorReinforcement ? `；混凝土路徑 = ${round(concreteDesignStrengthKn, 2)} kN，補強鋼筋路徑 = ${round(anchorReinforcement.designStrengthKn, 2)} kN，採 max = ${round(designStrengthKn, 2)} kN${useAnchorReinforcement ? '（補強鋼筋已取代混凝土拉破強度）' : ''}${useAnchorReinforcement && !baseStrength.inRange ? '；hef 已超出 17.6.2.2.1 基礎公式適用範圍，已由補強鋼筋路徑接管設計強度' : ''}；${anchorReinforcement.note}` : ''}；${tensionDemand.note}`,
  }
}

function getSteelTensionResult(
  profile: RuleProfile,
  product: AnchorProduct,
  tensionDemand: TensionDemandDistribution,
  formal: boolean,
): CheckResult {
  const usableArea =
    product.effectiveAreaMm2 || 0.75 * grossAreaFromDiameter(product.diameterMm)
  const singleNominalStrengthKn =
    (usableArea * getAnchorSteelUltimate(product)) / 1000
  const singleDesignStrengthKn = profile.phi.steelTension * singleNominalStrengthKn
  const demandKn = tensionDemand.maxAnchorTensionKn
  if (!Number.isFinite(singleDesignStrengthKn) || singleDesignStrengthKn <= 0) {
    return {
      id: 'steel-tension',
      mode: '鋼材拉力強度',
      citation: profile.citations.steelTension,
      status: 'incomplete',
      designStrengthKn: 0,
      nominalStrengthKn: round(singleNominalStrengthKn),
      demandKn: round(demandKn),
      dcr: 0,
      formal: false,
      note: '鋼材拉力設計強度無法成立，請確認錨栓有效面積與材料強度。',
    }
  }

  const dcr = demandKn <= 0 ? 0 : demandKn / singleDesignStrengthKn
  let status: ReviewStatus = formal ? 'pass' : 'screening'
  if (dcr > 1) {
    status = 'fail'
  }

  return {
    id: 'steel-tension',
    mode: '鋼材拉力強度',
    citation: profile.citations.steelTension,
    status,
    designStrengthKn: round(singleDesignStrengthKn),
    nominalStrengthKn: round(singleNominalStrengthKn),
    demandKn: round(demandKn),
    dcr: round(dcr, 3),
    formal,
    factors: [
      factor('φ', '強度折減因子', profile.phi.steelTension),
      factor('A_se', '有效鋼材面積', usableArea),
      factor('futa', '鋼材極限強度', getAnchorSteelUltimate(product)),
    ],
    note: `${tensionDemand.note}；依最大受拉錨栓檢核，Tmax / φNsa = ${round(dcr, 3)}`,
  }
}

function getPulloutResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  tensionDemand: TensionDemandDistribution,
  completeness: ProductCompleteness,
): CheckResult {
  const { layout } = project
  const phiSelection = getConcretePhiSelection(
    product,
    layout.supplementaryReinforcement,
    'pullout',
  )
  const phi = phiSelection.phi
  const demandKn = tensionDemand.totalTensionKn
  const maxAnchorDemandKn = tensionDemand.maxAnchorTensionKn
  const formal = completeness.formal

  if (product.family === 'cast_in') {
    if (tensionDemand.loadedAnchorCount <= 0 || demandKn <= 0) {
      return {
        id: 'pullout',
        mode: '拉出破壞強度',
        citation: profile.citations.pullout,
        status: 'pass',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: 0,
        dcr: 0,
        formal: true,
        note: '目前無受拉錨栓，拉出破壞強度不成控制。',
      }
    }

    let singleNominalStrengthKn = 0
    if (product.headBearingAreaMm2) {
      const crackFactor = layout.crackedConcrete ? 1 : 1.4
      singleNominalStrengthKn =
        (8 *
          product.headBearingAreaMm2 *
          layout.concreteStrengthMpa *
          crackFactor) /
        1000
    } else if (product.hookExtensionMm) {
      if (
        product.hookExtensionMm < 3 * product.diameterMm ||
        product.hookExtensionMm > 4.5 * product.diameterMm
      ) {
        return {
          id: 'pullout',
          mode: '拉出破壞強度',
          citation: profile.citations.pullout,
          status: 'incomplete',
          designStrengthKn: 0,
          nominalStrengthKn: 0,
          demandKn: round(demandKn),
          dcr: 0,
          formal: false,
          note: '彎鉤伸長 eh 未符合 3da 至 4.5da，無法依規範計算彎鉤錨栓拉出破壞強度。',
        }
      }
      const crackFactor = layout.crackedConcrete ? 1 : 1.4
      singleNominalStrengthKn =
        (0.9 *
          layout.concreteStrengthMpa *
          product.hookExtensionMm *
          product.diameterMm *
          crackFactor) /
        1000
    } else {
      return {
        id: 'pullout',
        mode: '拉出破壞 / 握裹強度',
        citation: profile.citations.pullout,
        status: 'incomplete',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: round(demandKn),
        dcr: 0,
        formal: false,
        note: '缺少擴頭承壓面積或彎鉤伸長 eh，無法計算預埋錨栓拉出破壞強度。',
      }
    }

    const singleDesignStrengthKn = phi * singleNominalStrengthKn
    const groupNominalStrengthKn =
      singleNominalStrengthKn * tensionDemand.loadedAnchorCount
    const groupDesignStrengthKn = singleDesignStrengthKn * tensionDemand.loadedAnchorCount
    const groupDcr = groupDesignStrengthKn > 0 ? demandKn / groupDesignStrengthKn : 0
    const singleDcr =
      singleDesignStrengthKn > 0 ? maxAnchorDemandKn / singleDesignStrengthKn : 0
    const controlsSingle = singleDcr >= groupDcr
    const dcr = Math.max(groupDcr, singleDcr)
    return {
      id: 'pullout',
      mode: '拉出破壞強度',
      citation: profile.citations.pullout,
      status: dcr > 1 ? 'fail' : 'pass',
      designStrengthKn: round(
        controlsSingle ? singleDesignStrengthKn : groupDesignStrengthKn,
      ),
      nominalStrengthKn: round(
        controlsSingle ? singleNominalStrengthKn : groupNominalStrengthKn,
      ),
      demandKn: round(controlsSingle ? maxAnchorDemandKn : demandKn),
      dcr: round(dcr, 3),
      formal: true,
      factors: [
        factor('φ', '強度折減因子', phi, phiSelection.label),
        factor(
          product.headBearingAreaMm2 ? 'ψ_c,P' : 'ψ_c,P',
          '裂縫修正',
          layout.crackedConcrete ? 1 : 1.4,
        ),
        factor('adopt', '採用控制檢核', controlsSingle ? '單支 Tmax' : '群組 ΣT'),
      ],
      note: product.headBearingAreaMm2
        ? `依預埋擴頭承壓面積計算拉出破壞強度，受拉側 ${tensionDemand.loadedAnchorCount} 支錨栓參與，單支 DCR = ${round(singleDcr, 3)}，群組 DCR = ${round(groupDcr, 3)}，採${controlsSingle ? '單支 Tmax' : '群組 ΣT'}控制，φ = ${round(phi, 2)}（${phiSelection.label}）`
        : `依彎鉤錨栓伸長 eh 計算拉出破壞強度，受拉側 ${tensionDemand.loadedAnchorCount} 支錨栓參與，單支 DCR = ${round(singleDcr, 3)}，群組 DCR = ${round(groupDcr, 3)}，採${controlsSingle ? '單支 Tmax' : '群組 ΣT'}控制，φ = ${round(phi, 2)}（${phiSelection.label}）`,
    }
  }

  if (product.family === 'post_installed_expansion') {
    const strength =
      layout.crackedConcrete
        ? product.evaluation.crackedPulloutStrengthKn ??
          product.evaluation.uncrackedPulloutStrengthKn
        : product.evaluation.uncrackedPulloutStrengthKn ??
          product.evaluation.crackedPulloutStrengthKn

    if (!strength) {
      return {
        id: 'pullout',
        mode: '拉出破壞強度',
        citation: profile.citations.pullout,
        status: 'incomplete',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: round(demandKn),
        dcr: 0,
        formal: false,
        note: '缺少後置膨脹錨栓之拉出破壞強度評估值，無法正式判定。',
      }
    }

    const expansionFormal =
      formal &&
      Boolean(
        layout.crackedConcrete
          ? product.evaluation.crackedPulloutStrengthKn
          : product.evaluation.uncrackedPulloutStrengthKn,
      )
    if (tensionDemand.loadedAnchorCount <= 0 || demandKn <= 0) {
      return {
        id: 'pullout',
        mode: '拉出破壞強度',
        citation: profile.citations.pullout,
        status: 'pass',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: 0,
        dcr: 0,
        formal: true,
        edgeDistanceSource: product.evaluation.crackedPulloutStrengthKn ? 'product' : 'code_fallback',
        note: '目前無受拉錨栓，拉出破壞強度不成控制。',
      }
    }

    const singleNominalStrengthKn = strength
    const singleDesignStrengthKn = phi * singleNominalStrengthKn
    const groupNominalStrengthKn =
      singleNominalStrengthKn * tensionDemand.loadedAnchorCount
    const groupDesignStrengthKn = singleDesignStrengthKn * tensionDemand.loadedAnchorCount
    const groupDcr = groupDesignStrengthKn > 0 ? demandKn / groupDesignStrengthKn : 0
    const singleDcr =
      singleDesignStrengthKn > 0 ? maxAnchorDemandKn / singleDesignStrengthKn : 0
    const controlsSingle = singleDcr >= groupDcr
    const dcr = Math.max(groupDcr, singleDcr)
    return {
      id: 'pullout',
      mode: '拉出破壞強度',
      citation: profile.citations.pullout,
      status: dcr > 1 ? 'fail' : expansionFormal ? 'pass' : 'screening',
      designStrengthKn: round(
        controlsSingle ? singleDesignStrengthKn : groupDesignStrengthKn,
      ),
      nominalStrengthKn: round(
        controlsSingle ? singleNominalStrengthKn : groupNominalStrengthKn,
      ),
      demandKn: round(controlsSingle ? maxAnchorDemandKn : demandKn),
      dcr: round(dcr, 3),
      formal: expansionFormal,
      edgeDistanceSource: product.evaluation.crackedPulloutStrengthKn ? 'product' : 'code_fallback',
      factors: [
        factor('φ', '強度折減因子', phi, phiSelection.label),
        factor('N_p,single', '單支產品拉出名義強度', singleNominalStrengthKn),
        factor('adopt', '採用控制檢核', controlsSingle ? '單支 Tmax' : '群組 ΣT'),
      ],
      note: `採產品評估報告提供之拉出破壞強度（已含對應裂縫狀態修正），受拉側 ${tensionDemand.loadedAnchorCount} 支錨栓參與，單支 DCR = ${round(singleDcr, 3)}，群組 DCR = ${round(groupDcr, 3)}，採${controlsSingle ? '單支 Tmax' : '群組 ΣT'}控制，φ = ${round(phi, 2)}（${phiSelection.label}）${expansionFormal ? '' : '；當前裂縫狀態之拉出值未完整提供，結果維持初篩'}`,
    }
  }

  if (product.family === 'post_installed_bonded') {
    if (tensionDemand.loadedAnchorCount <= 0 || demandKn <= 0) {
      return {
        id: 'bond',
        mode: '握裹強度',
        citation: profile.citations.bond,
        status: 'pass',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: 0,
        dcr: 0,
        formal: true,
        note: '目前無受拉錨栓，握裹強度不成控制。',
      }
    }

    const bondStress =
      layout.crackedConcrete
        ? product.evaluation.crackedBondStressMpa
        : product.evaluation.uncrackedBondStressMpa

    if (!bondStress) {
      return {
        id: 'bond',
        mode: '握裹強度',
        citation: profile.citations.bond,
        status: 'incomplete',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: round(demandKn),
        dcr: 0,
        formal: false,
        note: '缺少黏結式錨栓握裹強度資料，無法正式判定。',
      }
    }

    const criticalEdgeDistance = getBondCriticalEdgeDistance(product, layout.crackedConcrete)
    if (!criticalEdgeDistance) {
      return {
        id: 'bond',
        mode: '握裹強度',
        citation: profile.citations.bond,
        status: 'incomplete',
        designStrengthKn: 0,
        nominalStrengthKn: 0,
        demandKn: round(demandKn),
        dcr: 0,
        formal: false,
        note: '缺少可用之黏結式錨栓臨界邊距 cNa 或其推導資料，無法正式判定。',
      }
    }
    const splittingCriticalEdgeDistance =
      product.evaluation.splittingCriticalEdgeDistanceMm ?? criticalEdgeDistance.valueMm
    const usesCodeFallbackCriticalEdgeDistance =
      !product.evaluation.criticalEdgeDistanceMm
    const edgeFactor = product.evaluation.criticalEdgeDistanceMm
      ? Math.min(1, getActualMinimumEdgeDistance(layout) / criticalEdgeDistance.valueMm)
      : 1
    const eccentricFactor =
      tensionDemand.totalTensionKn > 0
        ? Math.min(
            1,
            1 /
              ((1 + Math.abs(tensionDemand.eccentricityXmm) / criticalEdgeDistance.valueMm) *
                (1 + Math.abs(tensionDemand.eccentricityYmm) / criticalEdgeDistance.valueMm)),
          )
        : 1
    const splittingFactor =
      !layout.crackedConcrete && !layout.supplementaryReinforcement
        ? Math.min(
            1,
            getActualMinimumEdgeDistance(layout) / splittingCriticalEdgeDistance,
          )
        : 1
    const activeAnchorPoints = tensionDemand.loadedAnchors.map((item) => item.anchor)
    const failureArea = unionArea(
      activeAnchorPoints.map((anchor) => ({
        x1: clamp(anchor.x - criticalEdgeDistance.valueMm, 0, layout.concreteWidthMm),
        x2: clamp(anchor.x + criticalEdgeDistance.valueMm, 0, layout.concreteWidthMm),
        y1: clamp(anchor.y - criticalEdgeDistance.valueMm, 0, layout.concreteHeightMm),
        y2: clamp(anchor.y + criticalEdgeDistance.valueMm, 0, layout.concreteHeightMm),
      })),
    )
    const singleArea =
      4 * criticalEdgeDistance.valueMm * criticalEdgeDistance.valueMm
    const areaRatio = singleArea > 0 ? failureArea / singleArea : 1
    const nominalStrengthKn =
      (Math.PI *
        product.diameterMm *
        layout.effectiveEmbedmentMm *
        bondStress *
        areaRatio *
        edgeFactor *
        eccentricFactor *
        splittingFactor) /
      1000
    const designStrengthKn = phi * nominalStrengthKn
    const dcr = demandKn <= 0 ? 0 : demandKn / designStrengthKn
    const bondFormal =
      formal &&
      (layout.crackedConcrete ||
        layout.supplementaryReinforcement ||
        Boolean(product.evaluation.splittingCriticalEdgeDistanceMm))

    return {
      id: 'bond',
      mode: '握裹強度',
      citation: profile.citations.bond,
      status: dcr > 1 ? 'fail' : bondFormal ? 'pass' : 'screening',
      designStrengthKn: round(designStrengthKn),
      nominalStrengthKn: round(nominalStrengthKn),
      demandKn: round(demandKn),
      dcr: round(dcr, 3),
      formal: bondFormal,
      edgeDistanceSource: product.evaluation.criticalEdgeDistanceMm
        ? 'product'
        : 'code_fallback',
      factors: [
        factor('A_Na/A_Nao', '握裹投影面積比', areaRatio),
        factor('ψ_ed,Na', '邊距修正', edgeFactor),
        factor('ψ_ec,Na', '偏心修正', eccentricFactor),
        factor('ψ_cp,Na', '劈裂修正', splittingFactor),
        factor('φ', '強度折減因子', phi, phiSelection.label),
      ],
      note: `τ = ${round(bondStress, 2)} MPa，cNa = ${round(criticalEdgeDistance.valueMm, 1)} mm${usesCodeFallbackCriticalEdgeDistance ? criticalEdgeDistance.source === 'tau_cr' ? '（依 τcr 開裂推導）' : '（依 17.6.5.1.2(b) 由 τuncr 推導）' : ''}，A_Na / A_Nao = ${round(areaRatio, 3)}，ψ_ed,Na = ${round(edgeFactor, 3)}，ψ_ec,Na = ${round(eccentricFactor, 3)}，ψ_cp,Na = ${round(splittingFactor, 3)}，φ = ${round(phi, 2)}（${phiSelection.label}）${!bondFormal ? '；未提供 cac,split，未開裂握裹強度維持初篩' : ''}；${tensionDemand.note}`,
    }
  }

  return {
    id: 'pullout',
    mode: '拉出破壞 / 握裹強度',
    citation: profile.citations.pullout,
    status: 'warning',
    designStrengthKn: 0,
    nominalStrengthKn: 0,
    demandKn: round(demandKn),
    dcr: 0,
    formal: false,
    note: `${getProductFamilyLabel(product.family)} 尚未納入 v1 正式拉出 / 握裹計算。`,
  }
}

function getCriticalEdgeDataForSide(
  anchorPoints: AnchorPoint[],
  layout: AnchorLayout,
) {
  const minLeft = Math.min(...anchorPoints.map((point) => point.x))
  const maxRight = Math.max(...anchorPoints.map((point) => layout.concreteWidthMm - point.x))
  const minBottom = Math.min(...anchorPoints.map((point) => point.y))
  const maxTop = Math.max(...anchorPoints.map((point) => layout.concreteHeightMm - point.y))
  const critical = Math.min(minLeft, maxRight, minBottom, maxTop)

  if (critical === minLeft) {
    return {
      edge: 'left',
      ca1: minLeft,
      row: anchorPoints.filter((point) => point.x === Math.min(...anchorPoints.map((item) => item.x))),
      parallelSpacing:
        layout.anchorCountY > 1 ? layout.spacingYmm : Number.POSITIVE_INFINITY,
      ca2: Math.min(layout.edgeBottomMm, layout.edgeTopMm),
    }
  }

  if (critical === maxRight) {
    return {
      edge: 'right',
      ca1: maxRight,
      row: anchorPoints.filter(
        (point) => point.x === Math.max(...anchorPoints.map((item) => item.x)),
      ),
      parallelSpacing:
        layout.anchorCountY > 1 ? layout.spacingYmm : Number.POSITIVE_INFINITY,
      ca2: Math.min(layout.edgeBottomMm, layout.edgeTopMm),
    }
  }

  if (critical === minBottom) {
    return {
      edge: 'bottom',
      ca1: minBottom,
      row: anchorPoints.filter(
        (point) => point.y === Math.min(...anchorPoints.map((item) => item.y)),
      ),
      parallelSpacing:
        layout.anchorCountX > 1 ? layout.spacingXmm : Number.POSITIVE_INFINITY,
      ca2: Math.min(layout.edgeLeftMm, layout.edgeRightMm),
    }
  }

  return {
    edge: 'top',
    ca1: maxTop,
    row: anchorPoints.filter(
      (point) => point.y === Math.max(...anchorPoints.map((item) => item.y)),
    ),
    parallelSpacing:
      layout.anchorCountX > 1 ? layout.spacingXmm : Number.POSITIVE_INFINITY,
    ca2: Math.min(layout.edgeLeftMm, layout.edgeRightMm),
  }
}

function getSideFaceBlowoutResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  tensionDemand: TensionDemandDistribution,
  formal: boolean,
): CheckResult | null {
  if (product.family !== 'cast_in') {
    return null
  }

  if (!product.headBearingAreaMm2) {
    return null
  }

  const { layout } = project
  const phiSelection = getConcretePhiSelection(
    product,
    layout.supplementaryReinforcement,
    'breakout',
  )
  const activeAnchorPoints = tensionDemand.loadedAnchors.map((item) => item.anchor)
  if (activeAnchorPoints.length === 0) {
    return null
  }
  const critical = getCriticalEdgeDataForSide(activeAnchorPoints, layout)
  if (layout.effectiveEmbedmentMm <= 2.5 * critical.ca1) {
    return null
  }

  const lambda = layout.lightweightConcrete ? 0.75 : profile.constants.lambdaA
  let nominalStrengthKn =
    (profile.constants.sideFaceBlowoutConstant *
      lambda *
      critical.ca1 *
      Math.sqrt(product.headBearingAreaMm2) *
      Math.sqrt(layout.concreteStrengthMpa)) /
    1000

  if (critical.ca2 < 3 * critical.ca1) {
    nominalStrengthKn *= (1 + critical.ca2 / critical.ca1) / 4
  }

  if (
    critical.parallelSpacing !== Number.POSITIVE_INFINITY &&
    critical.parallelSpacing < 6 * critical.ca1
  ) {
    nominalStrengthKn *= 1 + critical.parallelSpacing / (6 * critical.ca1)
  }

  const phi = phiSelection.phi
  const designStrengthKn = phi * nominalStrengthKn
  const rowAnchorIds = new Set(critical.row.map((anchor) => anchor.id))
  const demandKn = tensionDemand.loadedAnchors
    .filter((item) => rowAnchorIds.has(item.anchor.id))
    .reduce((sum, item) => sum + item.appliedTensionKn, 0)
  if (demandKn <= 0) {
    return null
  }
  const dcr = demandKn <= 0 ? 0 : demandKn / designStrengthKn

  return {
    id: 'side-face-blowout',
    mode: '側面破裂強度',
    citation: profile.citations.sideFaceBlowout,
    status: dcr > 1 ? 'fail' : formal ? 'pass' : 'screening',
    designStrengthKn: round(designStrengthKn),
    nominalStrengthKn: round(nominalStrengthKn),
    demandKn: round(demandKn),
    dcr: round(dcr, 3),
    formal,
    factors: [
      factor('c_a1', '控制自由邊邊距', critical.ca1),
      factor('A_brg', '錨頭承壓面積', product.headBearingAreaMm2),
      factor('λ_a', '輕質混凝土修正', lambda),
      factor('φ', '強度折減因子', phi, phiSelection.label),
    ],
    note: `控制自由邊為 ${critical.edge}，ca1 = ${round(critical.ca1, 1)} mm，沿該自由邊受拉需求 = ${round(demandKn, 2)} kN，φ = ${round(phi, 2)}（${phiSelection.label}）；${tensionDemand.note}`,
  }
}

function getConcreteBearingResult(
  profile: RuleProfile,
  project: ProjectCase,
): CheckResult | null {
  const { layout, loads } = project
  if (!layout.basePlateBearingEnabled) {
    return null
  }

  const stressState = computeBasePlateStressState(layout, loads)
  const {
    loadedWidthMm,
    loadedHeightMm,
    geometricLoadedAreaMm2,
    loadedAreaMm2,
    loadedAreaDerivedFromGeometry,
    loadedAreaMismatch,
    demandCompressionKn: demandKn,
    bearingMomentExternallyVerified,
    basePlateSectionType,
    customSectionModulusXmm3,
    customSectionModulusYmm3,
    hasCustomSectionModuli,
    sectionModulusX,
    sectionModulusY,
    hasBearingStressGeometry,
    hasBearingStressSection,
    effectiveMoments,
    effectiveMomentXKnM,
    effectiveMomentYKnM,
    hasBearingMoment,
    eccentricityYmm,
    eccentricityXmm,
    kernYmm,
    kernXmm,
    compressionMarginYmm,
    compressionMarginXmm,
    upliftY,
    upliftX,
    majorUpliftY,
    majorUpliftX,
    contactLengthYmm,
    contactLengthXmm,
    demandStressMpa,
  } = stressState
  if (loadedAreaMm2 <= 0) {
    return {
      id: 'concrete-bearing',
      mode: '基板下混凝土承壓',
      citation: profile.citations.supportBearing,
      status: 'incomplete',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal: false,
      note: '已啟用基板下混凝土承壓檢核，但 A1 承壓面積未填，且 b1 / h1 亦不足以回推 A1。',
    }
  }

  const inputSupportAreaMm2 = layout.basePlateSupportAreaMm2
  const supportAreaMm2 = Math.max(inputSupportAreaMm2, loadedAreaMm2)
  const supportAreaAdjusted = inputSupportAreaMm2 > 0 && inputSupportAreaMm2 < loadedAreaMm2
  const baseNominalStrengthKn =
    (0.85 * layout.concreteStrengthMpa * loadedAreaMm2) / 1000
  const confinementMode = getBasePlateConfinementMode(layout)
  const supportRatio = supportAreaMm2 / loadedAreaMm2
  const baseConfinementFactor = Math.sqrt(supportRatio)
  const confinementLimit =
    confinementMode === 'full' ? 2 : confinementMode === 'partial' ? 1.5 : 1
  const confinementMultiplier =
    confinementMode === 'none'
      ? 1
      : Math.min(baseConfinementFactor, confinementLimit)
  const nominalStrengthKn = baseNominalStrengthKn * confinementMultiplier
  const phi = profile.phi.bearingCompression
  const designStrengthKn = phi * nominalStrengthKn
  const allowableStressMpa =
    phi * 0.85 * layout.concreteStrengthMpa * confinementMultiplier
  const demandValue =
    hasBearingMoment && hasBearingStressSection ? demandStressMpa : demandKn
  const designValue =
    hasBearingMoment && hasBearingStressSection
      ? allowableStressMpa
      : designStrengthKn
  const dcr =
    demandValue <= 0 || designValue <= 0 ? 0 : demandValue / designValue
  const formal =
    !supportAreaAdjusted &&
    !loadedAreaMismatch &&
    !(majorUpliftX || majorUpliftY) &&
    (!hasBearingMoment ||
      bearingMomentExternallyVerified ||
      hasBearingStressSection)

  let status: ReviewStatus =
    demandKn <= 0 ? 'pass' : formal ? 'pass' : 'screening'
  if (
    hasBearingMoment &&
    basePlateSectionType === 'custom' &&
    !hasCustomSectionModuli &&
    !bearingMomentExternallyVerified
  ) {
    status = 'incomplete'
  }
  if (
    hasBearingMoment &&
    !bearingMomentExternallyVerified &&
    !hasBearingStressSection &&
    !(basePlateSectionType === 'custom' && !hasCustomSectionModuli)
  ) {
    status = 'warning'
  }
  if (majorUpliftX || majorUpliftY) {
    status = 'warning'
  } else if (dcr > 1) {
    status = 'fail'
  }

  const noteParts = [
    `A1 = ${round(loadedAreaMm2, 1)} mm²`,
    `A2 = ${round(supportAreaMm2, 1)} mm²`,
    confinementMode === 'full'
      ? `採完整圍束支承，√(A2/A1) = ${round(baseConfinementFactor, 3)}，上限取 ${round(confinementMultiplier, 3)}`
      : confinementMode === 'partial'
        ? `採部分圍束支承之工程擴充，√(A2/A1) = ${round(baseConfinementFactor, 3)}，上限取 ${round(confinementMultiplier, 3)}`
        : '未啟用圍束支承，承壓放大係數取 1.0',
    `φ = ${round(phi, 2)}（依規範 profile 之承壓常數採用）`,
  ]
  if (loadedAreaDerivedFromGeometry) {
    noteParts.push(
      `A1 未另填，已由 b1 × h1 = ${round(loadedWidthMm, 1)} × ${round(loadedHeightMm, 1)} 回推`,
    )
  }
  if (basePlateSectionType === 'custom') {
    noteParts.push(
      hasCustomSectionModuli
        ? `偏心承壓之斷面模數採自訂 Sx / Sy = ${round(customSectionModulusXmm3, 1)} / ${round(customSectionModulusYmm3, 1)} mm³；b1 / h1 僅用於接觸尺寸、kern 與 uplift 判讀`
        : bearingMomentExternallyVerified
          ? '已選擇自訂斷面模數路徑，且使用者已聲明偏心承壓另行驗算；本模組僅保留平均軸壓承壓結果供對照'
          : '已選擇自訂斷面模數路徑，但 Sx / Sy 未填齊；若存在 Mx / My，結果維持資料不足',
    )
  } else if (hasBearingStressGeometry) {
    noteParts.push('偏心承壓之斷面模數採矩形承壓區 Sx / Sy 公式')
  }
  if (loadedAreaMismatch) {
    noteParts.push(
      `輸入 A1 與 b1 × h1 = ${round(geometricLoadedAreaMm2, 1)} mm² 不一致，結果維持初篩提醒`,
    )
  }
  if (upliftY) {
    noteParts.push(
      majorUpliftY
        ? 'Mx,eff 導致承壓合力已超出 y 向 kern 範圍甚多，基板大部分可能 uplift，應由錨栓拉力路徑共同控制'
        : `Mx,eff 導致 y 向偏心超出 kern，已改採三角壓應力分佈；e_y = ${round(eccentricityYmm, 2)} mm，c_y = ${round(compressionMarginYmm, 2)} mm，y 向接觸長度 y_c = ${round(contactLengthYmm, 2)} mm`,
    )
  }
  if (upliftX) {
    noteParts.push(
      majorUpliftX
        ? 'My,eff 導致承壓合力已超出 x 向 kern 範圍甚多，基板大部分可能 uplift，應由錨栓拉力路徑共同控制'
        : `My,eff 導致 x 向偏心超出 kern，已改採三角壓應力分佈；e_x = ${round(eccentricityXmm, 2)} mm，c_x = ${round(compressionMarginXmm, 2)} mm，x 向接觸長度 x_c = ${round(contactLengthXmm, 2)} mm`,
    )
  }
  if (
    Math.abs(effectiveMoments.deltaMomentXKnM) > 1e-6 ||
    Math.abs(effectiveMoments.deltaMomentYKnM) > 1e-6
  ) {
    noteParts.push(
      `已將柱心偏移換算為附加彎矩 ΔMx = ${round(effectiveMoments.deltaMomentXKnM, 3)} kN-m、ΔMy = ${round(effectiveMoments.deltaMomentYKnM, 3)} kN-m，故偏心承壓採 Mx,eff = ${round(effectiveMomentXKnM, 3)} kN-m、My,eff = ${round(effectiveMomentYKnM, 3)} kN-m`,
    )
  }
  if (supportAreaAdjusted) {
    noteParts.push('輸入 A2 小於 A1，已退回 A2 = A1，結果維持初篩')
  }
  if (hasBearingMoment && hasBearingStressSection) {
    noteParts.push(
      upliftX && upliftY
        ? `已採偏心承壓應力檢核，雙向 uplift 採 X / Y 獨立三角形分佈合成之保守壓應力，σmax = ${round(demandStressMpa, 3)} MPa；嚴格分析宜另做接觸區迭代或基板有限元素分析`
        : `已採偏心承壓應力檢核，雙向偏心下取 Y / X 分佈合成之保守壓應力，σmax = ${round(demandStressMpa, 3)} MPa`,
    )
  } else if (
    hasBearingMoment &&
    basePlateSectionType === 'custom' &&
    !hasCustomSectionModuli &&
    !bearingMomentExternallyVerified
  ) {
    noteParts.push(
      '目前存在 Mx / My，但自訂 Sx / Sy 尚未填入，無法完成偏心承壓應力檢核；請補齊斷面模數或改採矩形承壓區',
    )
  } else if (hasBearingMoment && !bearingMomentExternallyVerified) {
    noteParts.push(
      '目前存在 Mx / My，基板承壓實際應採偏心壓力分佈驗算；本模組僅提供平均軸壓承壓檢核，結果維持提醒狀態',
    )
  } else if (hasBearingMoment) {
    noteParts.push(
      '目前存在 Mx / My，使用者已聲明偏心承壓另行驗算；本模組僅保留平均軸壓承壓檢核供對照',
    )
  }
  if (demandKn <= 0) {
    noteParts.push('目前分析載重未出現軸向壓力需求，承壓不成控制')
  } else {
    noteParts.push(
      hasBearingMoment && hasBearingStressSection
        ? '承壓 demand 係以負拉力 N < 0 轉為軸向壓力需求，並加上 Mx / My 對應之保守邊緣壓應力。'
        : '承壓 demand 係以負拉力 N < 0 轉為軸向壓力需求；本模組目前僅以平均軸壓檢核，未納入基板偏心壓力分佈',
    )
  }

  return {
    id: 'concrete-bearing',
    mode: '基板下混凝土承壓',
    citation: profile.citations.supportBearing,
    status,
    designStrengthKn: round(designValue),
    nominalStrengthKn: round(nominalStrengthKn),
    demandKn: round(demandValue),
    dcr: round(dcr, 3),
    formal,
    presentation: hasBearingMoment && hasBearingStressSection ? 'stress' : 'force',
    factors: [
      factor('A1', '實際承壓面積', round(loadedAreaMm2, 1)),
      ...(geometricLoadedAreaMm2 > 0
        ? [factor('b1h1', '承壓面幾何面積', round(geometricLoadedAreaMm2, 1))]
        : []),
      factor('A2/A1', '支承面積比', round(supportAreaMm2 / loadedAreaMm2, 3)),
      factor(
        'β_b',
        '支承圍束放大',
        round(confinementMultiplier, 3),
        confinementMode === 'full'
          ? '22.8.3.2；完整圍束，上限 2.0'
          : confinementMode === 'partial'
            ? '工程擴充；部分圍束時上限 1.5'
            : '未啟用圍束',
      ),
      factor(
        'φ',
        '強度折減因子',
        round(phi, 2),
        '依規範 profile 之承壓常數採用',
      ),
      factor(
        'section',
        '承壓區斷面模數來源',
        basePlateSectionType === 'custom' ? '自訂 Sx / Sy' : '矩形公式',
      ),
      ...(Math.abs(effectiveMoments.deltaMomentXKnM) > 1e-6
        ? [
            factor(
              'ΔMx',
              '柱心偏移附加彎矩',
              round(effectiveMoments.deltaMomentXKnM, 3),
            ),
          ]
        : []),
      ...(Math.abs(effectiveMoments.deltaMomentYKnM) > 1e-6
        ? [
            factor(
              'ΔMy',
              '柱心偏移附加彎矩',
              round(effectiveMoments.deltaMomentYKnM, 3),
            ),
          ]
        : []),
      ...(hasBearingStressGeometry && hasMeaningfulBasePlateMoment(effectiveMomentXKnM)
        ? [
            factor('e_y', 'y 向偏心距', round(eccentricityYmm, 2)),
            factor('kern_y', 'y 向 kern 邊界', round(kernYmm, 2)),
            factor('Mx,eff', '有效彎矩 Mx', round(effectiveMomentXKnM, 3)),
            ...(upliftY && !majorUpliftY
              ? [factor('y_c', 'y 向接觸長度', round(contactLengthYmm, 2))]
              : []),
          ]
        : []),
      ...(hasBearingStressGeometry && hasMeaningfulBasePlateMoment(effectiveMomentYKnM)
        ? [
            factor('e_x', 'x 向偏心距', round(eccentricityXmm, 2)),
            factor('kern_x', 'x 向 kern 邊界', round(kernXmm, 2)),
            factor('My,eff', '有效彎矩 My', round(effectiveMomentYKnM, 3)),
            ...(upliftX && !majorUpliftX
              ? [factor('x_c', 'x 向接觸長度', round(contactLengthXmm, 2))]
              : []),
          ]
        : []),
      ...(hasBearingStressGeometry
        ? [
            factor('b1', '承壓面寬', round(loadedWidthMm, 1)),
            factor('h1', '承壓面高', round(loadedHeightMm, 1)),
            factor(
              'Sx',
              '承壓面截面模數 x',
              round(sectionModulusX, 1),
              basePlateSectionType === 'custom' ? '使用者自訂輸入' : '矩形承壓區公式',
            ),
            factor(
              'Sy',
              '承壓面截面模數 y',
              round(sectionModulusY, 1),
              basePlateSectionType === 'custom' ? '使用者自訂輸入' : '矩形承壓區公式',
            ),
          ]
        : []),
      ...(hasBearingMoment && hasBearingStressSection
        ? [
            factor('σmax', '最大壓應力', round(demandStressMpa, 3)),
            factor('φσb', '設計容許承壓應力', round(allowableStressMpa, 3)),
          ]
        : []),
    ],
    note: noteParts.join('；'),
  }
}

function getBasePlateBendingResult(
  profile: RuleProfile,
  project: ProjectCase,
): CheckResult | null {
  const { layout, loads } = project
  if (!layout.basePlateBearingEnabled || !layout.basePlateBendingEnabled) {
    return null
  }

  const stressState = computeBasePlateStressState(layout, loads)
  const {
    loadedAreaMm2,
    demandCompressionKn: demandKn,
    bearingMomentExternallyVerified,
    basePlateSectionType,
    hasCustomSectionModuli,
    hasBearingStressSection,
    effectiveMoments,
    effectiveMomentXKnM,
    effectiveMomentYKnM,
    hasBearingMoment,
    majorUpliftX,
    majorUpliftY,
    upliftX,
    upliftY,
    demandStressMpa,
    contactLengthXmm,
    contactLengthYmm,
  } = stressState

  const actualThicknessMm = Math.max(0, layout.basePlateThicknessMm)
  const plateYieldMpa = Math.max(0, layout.basePlateSteelYieldMpa)
  const effectiveCantilevers = getEffectiveBasePlateCantilevers(layout)
  const cantileverXmm = effectiveCantilevers.xMm
  const cantileverYmm = effectiveCantilevers.yMm
  const criticalCantileverMm = Math.max(cantileverXmm, cantileverYmm)
  const phiFlexure = 0.9

  if (loadedAreaMm2 <= 0) {
    return {
      id: 'base-plate-bending',
      mode: '基板抗彎厚度',
      citation: getBasePlateBendingCitation(profile),
      status: 'incomplete',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal: false,
      presentation: 'length',
      note: '已啟用基板抗彎厚度檢核，但 A1 承壓面積未填，且 b1 / h1 亦不足以回推 A1。',
    }
  }

  if (demandKn <= 0) {
    return {
      id: 'base-plate-bending',
      mode: '基板抗彎厚度',
      citation: getBasePlateBendingCitation(profile),
      status: 'pass',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal: true,
      presentation: 'length',
      note: '目前分析載重未出現軸向壓力需求，基板抗彎厚度不成控制；若其他載重組合含軸壓，請切換 Loadcase 再核。',
    }
  }

  const missingInputs: string[] = []
  if (actualThicknessMm <= 0) {
    missingInputs.push('tp')
  }
  if (plateYieldMpa <= 0) {
    missingInputs.push('Fy,plate')
  }
  if (criticalCantileverMm <= 0) {
    missingInputs.push('l_x / l_y')
  }
  if (
    hasBearingMoment &&
    basePlateSectionType === 'custom' &&
    !hasCustomSectionModuli &&
    !bearingMomentExternallyVerified
  ) {
    missingInputs.push('Sx / Sy')
  }

  if (missingInputs.length > 0) {
    return {
      id: 'base-plate-bending',
      mode: '基板抗彎厚度',
      citation: getBasePlateBendingCitation(profile),
      status: 'incomplete',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal: false,
      presentation: 'length',
      note: `已啟用基板抗彎厚度檢核，但缺少必要輸入：${missingInputs.join('、')}。`,
    }
  }

  if ((majorUpliftX || majorUpliftY) && !bearingMomentExternallyVerified) {
    return {
      id: 'base-plate-bending',
      mode: '基板抗彎厚度',
      citation: getBasePlateBendingCitation(profile),
      status: 'warning',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: 0,
      dcr: 0,
      formal: false,
      presentation: 'length',
      factors: [
        factor('tp', '基板實際厚度', round(actualThicknessMm, 3)),
        factor('Fy', '基板降伏強度', round(plateYieldMpa, 3)),
        factor('l_x', 'x 向懸臂長度', round(cantileverXmm, 3)),
        factor('l_y', 'y 向懸臂長度', round(cantileverYmm, 3)),
        factor('l', '控制懸臂長度', round(criticalCantileverMm, 3)),
      ],
      note:
        '偏心已使基板大部分承壓區 uplift，AISC DG1 厚度需求宜配合完整柱腳接觸區分析或外部基板設計計算；本列維持提醒狀態。',
    }
  }

  const requiredThicknessMm =
    criticalCantileverMm * Math.sqrt((2 * demandStressMpa) / (phiFlexure * plateYieldMpa))
  const dcr =
    actualThicknessMm <= 0 || requiredThicknessMm <= 0
      ? 0
      : requiredThicknessMm / actualThicknessMm
  const formal =
    !(hasBearingMoment && !hasBearingStressSection) ||
    bearingMomentExternallyVerified
  let status: ReviewStatus = formal ? 'pass' : 'screening'
  if (dcr > 1) {
    status = 'fail'
  }
  if (hasBearingMoment && !hasBearingStressSection && !bearingMomentExternallyVerified) {
    status = 'warning'
  }

  const noteParts = [
    '基板抗彎厚度依 AISC DG1 工程擴充以局部承壓應力估算，並用控制懸臂長度 l = max(lx, ly) 計算 t_p,min。',
    `tp = ${round(actualThicknessMm, 3)} mm，Fy,plate = ${round(plateYieldMpa, 3)} MPa，l = ${round(criticalCantileverMm, 3)} mm，t_p,min = ${round(requiredThicknessMm, 3)} mm`,
  ]
  if (effectiveCantilevers.source === 'derived' && effectiveCantilevers.derived) {
    const derived = effectiveCantilevers.derived
    noteParts.push(
      `懸臂長度已由柱斷面自動推算：m = ${round(derived.mMm, 3)} mm，n = ${round(derived.nMm, 3)} mm，λn' = ${round(derived.lambdaPrimeMm, 3)} mm，採 lx = ${round(derived.xMm, 3)} mm、ly = ${round(derived.yMm, 3)} mm`,
    )
  }
  if (upliftX && upliftY) {
    noteParts.push(
      '雙向 uplift 採 X / Y 獨立三角形分佈合成之保守壓應力；嚴格分析仍宜另做接觸區迭代或有限元素分析。',
    )
  } else if (upliftX || upliftY) {
    noteParts.push('已沿 uplift 方向採三角形壓應力分佈。')
  }
  if (hasBearingMoment && !hasBearingStressSection && bearingMomentExternallyVerified) {
    noteParts.push(
      '目前存在 Mx / My，但使用者已聲明偏心承壓外部驗算完成；本列沿用現有壓應力作為基板厚度檢核參考。',
    )
  }
  if (
    Math.abs(effectiveMoments.deltaMomentXKnM) > 1e-6 ||
    Math.abs(effectiveMoments.deltaMomentYKnM) > 1e-6
  ) {
    noteParts.push(
      `已將柱心偏移換算為附加彎矩 ΔMx = ${round(effectiveMoments.deltaMomentXKnM, 3)} kN-m、ΔMy = ${round(effectiveMoments.deltaMomentYKnM, 3)} kN-m，故厚度檢核採 Mx,eff = ${round(effectiveMomentXKnM, 3)} kN-m、My,eff = ${round(effectiveMomentYKnM, 3)} kN-m`,
    )
  }

  return {
    id: 'base-plate-bending',
    mode: '基板抗彎厚度',
    citation: getBasePlateBendingCitation(profile),
    status,
    designStrengthKn: round(actualThicknessMm, 3),
    nominalStrengthKn: round(requiredThicknessMm, 3),
    demandKn: round(requiredThicknessMm, 3),
    dcr: round(dcr, 3),
    formal,
    presentation: 'length',
    factors: [
      factor('σmax', '控制承壓應力', round(demandStressMpa, 3)),
      factor('φb', '基板抗彎折減因子', round(phiFlexure, 3), 'AISC DG1 工程擴充採用'),
      factor('Fy', '基板降伏強度', round(plateYieldMpa, 3)),
      factor('l_x', 'x 向懸臂長度', round(cantileverXmm, 3)),
      factor('l_y', 'y 向懸臂長度', round(cantileverYmm, 3)),
      factor('l', '控制懸臂長度', round(criticalCantileverMm, 3)),
      ...(effectiveCantilevers.source === 'derived' && effectiveCantilevers.derived
        ? [
            factor('m', '柱外緣 y 向懸臂', round(effectiveCantilevers.derived.mMm, 3)),
            factor('n', '柱外緣 x 向懸臂', round(effectiveCantilevers.derived.nMm, 3)),
            factor("λn'", 'AISC DG1 補充控制長度', round(effectiveCantilevers.derived.lambdaPrimeMm, 3)),
          ]
        : []),
      ...(Math.abs(effectiveMoments.deltaMomentXKnM) > 1e-6
        ? [factor('ΔMx', '柱心偏移附加彎矩', round(effectiveMoments.deltaMomentXKnM, 3))]
        : []),
      ...(Math.abs(effectiveMoments.deltaMomentYKnM) > 1e-6
        ? [factor('ΔMy', '柱心偏移附加彎矩', round(effectiveMoments.deltaMomentYKnM, 3))]
        : []),
      ...(upliftY && !majorUpliftY
        ? [factor('y_c', 'y 向接觸長度', round(contactLengthYmm, 3))]
        : []),
      ...(upliftX && !majorUpliftX
        ? [factor('x_c', 'x 向接觸長度', round(contactLengthXmm, 3))]
        : []),
      factor('tp,req', '需求厚度', round(requiredThicknessMm, 3)),
      factor('tp', '實際厚度', round(actualThicknessMm, 3)),
    ],
    note: noteParts.join('；'),
  }
}

function getSteelShearResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  formal: boolean,
): CheckResult {
  const usableArea = product.effectiveAreaMm2 || 0.75 * grossAreaFromDiameter(product.diameterMm)
  const totalAnchors =
    project.layout.anchorCountX * project.layout.anchorCountY
  const requestedShearAnchorCount = project.loads.shearAnchorCount
  const shearAnchorCount = clamp(
    Math.round(
      requestedShearAnchorCount && requestedShearAnchorCount > 0
        ? requestedShearAnchorCount
        : getDefaultShearAnchorCount(project),
    ),
    1,
    totalAnchors,
  )
  const leverArmFactor = getShearLeverArmFactor(project, product)
  const nominalStrengthKn =
    (0.6 *
      usableArea *
      getAnchorSteelUltimate(product) *
      shearAnchorCount *
      leverArmFactor) /
    1000
  const designStrengthKn = profile.phi.steelShear * nominalStrengthKn
  const demandKn = Math.hypot(project.loads.shearXKn, project.loads.shearYKn)
  const dcr = demandKn <= 0 ? 0 : demandKn / designStrengthKn
  let status: ReviewStatus = formal ? 'pass' : 'screening'
  if (dcr > 1) {
    status = 'fail'
  }

  return {
    id: 'steel-shear',
    mode: '鋼材剪力強度',
    citation: profile.citations.steelShear,
    status,
    designStrengthKn: round(designStrengthKn),
    nominalStrengthKn: round(nominalStrengthKn),
    demandKn: round(demandKn),
    dcr: round(dcr, 3),
    formal,
    factors: [
      factor('φ', '強度折減因子', profile.phi.steelShear),
      factor('n_v', '受剪錨栓數', shearAnchorCount),
      factor('ψ_e,v', '槓桿臂修正', leverArmFactor),
    ],
    note:
      demandKn <= 0
        ? '無剪力需求，鋼材剪力強度未成控制。'
        : `剪力需求以 Vx / Vy 合成向量處理，受剪錨栓數 = ${shearAnchorCount}，e_v = ${round(Math.max(0, project.loads.shearLeverArmMm ?? 0), 1)} mm，槓桿臂修正 = ${round(leverArmFactor, 3)}`,
  }
}

function getEdgeRowForShear(
  anchorPoints: AnchorPoint[],
  layout: AnchorLayout,
  direction: 'x' | 'y',
  sign: 1 | -1,
) {
  if (direction === 'x') {
    const targetX =
      sign > 0
        ? Math.max(...anchorPoints.map((point) => point.x))
        : Math.min(...anchorPoints.map((point) => point.x))
    const row = anchorPoints.filter((point) => point.x === targetX)
    const actualCa1 =
      sign > 0 ? layout.concreteWidthMm - targetX : targetX
    const ca2 = Math.min(layout.edgeBottomMm, layout.edgeTopMm)
    const parallelSpacing =
      layout.anchorCountY > 1 ? layout.spacingYmm : Number.POSITIVE_INFINITY
    const effectiveCa1 = Math.min(
      actualCa1,
      Math.min(
        ca2 / 1.5,
        layout.thicknessMm / 1.5,
        Number.isFinite(parallelSpacing) ? parallelSpacing / 3 : Number.POSITIVE_INFINITY,
      ),
    )
    return {
      row,
      ca1: effectiveCa1,
      actualCa1,
      ca2,
      parallelSpacing,
      intervals: row.map((point) => ({
        start: clamp(point.y - 1.5 * effectiveCa1, 0, layout.concreteHeightMm),
        end: clamp(point.y + 1.5 * effectiveCa1, 0, layout.concreteHeightMm),
      })),
    }
  }

  const targetY =
    sign > 0
      ? Math.max(...anchorPoints.map((point) => point.y))
      : Math.min(...anchorPoints.map((point) => point.y))
  const row = anchorPoints.filter((point) => point.y === targetY)
  const actualCa1 = sign > 0 ? layout.concreteHeightMm - targetY : targetY
  const ca2 = Math.min(layout.edgeLeftMm, layout.edgeRightMm)
  const parallelSpacing =
    layout.anchorCountX > 1 ? layout.spacingXmm : Number.POSITIVE_INFINITY
  const effectiveCa1 = Math.min(
    actualCa1,
    Math.min(
      ca2 / 1.5,
      layout.thicknessMm / 1.5,
      Number.isFinite(parallelSpacing) ? parallelSpacing / 3 : Number.POSITIVE_INFINITY,
    ),
  )
  return {
    row,
    ca1: effectiveCa1,
    actualCa1,
    ca2,
    parallelSpacing,
    intervals: row.map((point) => ({
      start: clamp(point.x - 1.5 * effectiveCa1, 0, layout.concreteWidthMm),
      end: clamp(point.x + 1.5 * effectiveCa1, 0, layout.concreteWidthMm),
    })),
  }
}

function getShearBreakoutEdgeLabel(
  direction: 'x' | 'y',
  sign: 1 | -1,
): VisualizationEdge {
  if (direction === 'x') {
    return sign > 0 ? 'right' : 'left'
  }

  return sign > 0 ? 'top' : 'bottom'
}

function buildShearVisualizationRectangles(
  project: ProjectCase,
  anchorPoints: AnchorPoint[],
) {
  const rectangles: ReviewVisualizationRectangle[] = []
  const edges: ReviewVisualization['edges'] = []

  if (Math.abs(project.loads.shearXKn) > 0) {
    const sign = project.loads.shearXKn >= 0 ? 1 : -1
    const edgeRow = getEdgeRowForShear(anchorPoints, project.layout, 'x', sign)
    if (edgeRow.ca1 >= 1) {
      const projection = 1.5 * edgeRow.ca1
      rectangles.push(
        ...edgeRow.intervals.map((interval, index) => ({
          id: `shear-x-${index}`,
          kind: 'shear_breakout_x' as const,
          x1:
            sign > 0
              ? clamp(project.layout.concreteWidthMm - projection, 0, project.layout.concreteWidthMm)
              : 0,
          x2:
            sign > 0
              ? project.layout.concreteWidthMm
              : clamp(projection, 0, project.layout.concreteWidthMm),
          y1: interval.start,
          y2: interval.end,
        })),
      )
      edges.push({
        edge: getShearBreakoutEdgeLabel('x', sign),
        label: 'Vcb,x',
      })
    }
  }

  if (Math.abs(project.loads.shearYKn) > 0) {
    const sign = project.loads.shearYKn >= 0 ? 1 : -1
    const edgeRow = getEdgeRowForShear(anchorPoints, project.layout, 'y', sign)
    if (edgeRow.ca1 >= 1) {
      const projection = 1.5 * edgeRow.ca1
      rectangles.push(
        ...edgeRow.intervals.map((interval, index) => ({
          id: `shear-y-${index}`,
          kind: 'shear_breakout_y' as const,
          x1: interval.start,
          x2: interval.end,
          y1:
            sign > 0
              ? clamp(project.layout.concreteHeightMm - projection, 0, project.layout.concreteHeightMm)
              : 0,
          y2:
            sign > 0
              ? project.layout.concreteHeightMm
              : clamp(projection, 0, project.layout.concreteHeightMm),
        })),
      )
      edges.push({
        edge: getShearBreakoutEdgeLabel('y', sign),
        label: 'Vcb,y',
      })
    }
  }

  return { rectangles, edges }
}

function buildReviewVisualization(
  product: AnchorProduct,
  project: ProjectCase,
  anchorPoints: AnchorPoint[],
  tensionDemand: TensionDemandDistribution,
): ReviewVisualization {
  const tensionRectangles = buildTensionBreakoutRectangles(
    tensionDemand.loadedAnchors.map((item) => item.anchor),
    project.layout,
  ).map((rect, index) => ({
    id: `tension-breakout-${index}`,
    kind: 'tension_breakout' as const,
    ...rect,
  }))
  const shearVisualization = buildShearVisualizationRectangles(project, anchorPoints)
  const edges: ReviewVisualization['edges'] = [...shearVisualization.edges]

  if (
    product.family === 'cast_in' &&
    product.headBearingAreaMm2 &&
    tensionDemand.loadedAnchors.length > 0
  ) {
    const critical = getCriticalEdgeDataForSide(
      tensionDemand.loadedAnchors.map((item) => item.anchor),
      project.layout,
    )
    if (project.layout.effectiveEmbedmentMm > 2.5 * critical.ca1) {
      edges.push({
        edge: critical.edge as VisualizationEdge,
        label: 'Nsb',
      })
    }
  }

  return {
    anchors: tensionDemand.perAnchor.map((item) => ({
      anchorId: item.anchor.id,
      appliedTensionKn: round(item.appliedTensionKn, 3),
      elasticTensionKn: round(item.elasticTensionKn, 3),
      state:
        item.elasticTensionKn > 1e-6
          ? 'tension'
          : item.elasticTensionKn < -1e-6
            ? 'compression'
            : 'neutral',
    })),
    rectangles: [...tensionRectangles, ...shearVisualization.rectangles],
    edges,
  }
}

function getShearBreakoutDirectionalStrength(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  anchorPoints: AnchorPoint[],
  direction: 'x' | 'y',
  sign: 1 | -1,
) {
  const { layout } = project
  const edgeRow = getEdgeRowForShear(anchorPoints, layout, direction, sign)
  if (edgeRow.ca1 < 1) {
    return 0
  }

  const lambda = layout.lightweightConcrete ? 0.75 : profile.constants.lambdaA
  const le =
    product.evaluation.shearLoadBearingLengthMm ?? layout.effectiveEmbedmentMm
  const baseStrengthKn =
    (Math.min(
      profile.constants.shearConstantA *
        lambda *
        (le / product.diameterMm) ** 0.2 *
        Math.sqrt(layout.concreteStrengthMpa) *
        product.diameterMm ** 0.2 *
        edgeRow.ca1 ** 1.5,
      profile.constants.shearConstantB *
        lambda *
        Math.sqrt(layout.concreteStrengthMpa) *
        edgeRow.ca1 ** 1.5,
    )) /
    1000
  const projectedHeight = 1.5 * edgeRow.ca1
  const area = unionLength(edgeRow.intervals) * projectedHeight
  const areaRatio = area / (4.5 * edgeRow.ca1 * edgeRow.ca1)
  const edgeFactor = Math.min(1, 0.7 + 0.3 * (edgeRow.ca2 / (1.5 * edgeRow.ca1)))
  const shearEccentricity =
    direction === 'x'
      ? Math.abs(project.loads.shearEccentricityXmm ?? 0)
      : Math.abs(project.loads.shearEccentricityYmm ?? 0)
  const eccentricityFactor =
    edgeRow.ca1 > 0 ? Math.min(1, 1 / (1 + (2 * shearEccentricity) / (3 * edgeRow.ca1))) : 1
  const crackingFactor = layout.crackedConcrete
    ? layout.shearHairpinReinforcement
      ? 1.2
      : 1
    : 1.4
  return (
    areaRatio *
    edgeFactor *
    eccentricityFactor *
    crackingFactor *
    baseStrengthKn *
    concretePhi(product, layout.supplementaryReinforcement, 'breakout')
  )
}

function getConcreteShearBreakoutResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  anchorPoints: AnchorPoint[],
  formal: boolean,
): CheckResult {
  const phiSelection = getConcretePhiSelection(
    product,
    project.layout.supplementaryReinforcement,
    'breakout',
  )
  const strengthX =
    Math.abs(project.loads.shearXKn) > 0
      ? getShearBreakoutDirectionalStrength(
          profile,
          product,
          project,
          anchorPoints,
          'x',
          project.loads.shearXKn >= 0 ? 1 : -1,
        )
      : Number.POSITIVE_INFINITY
  const strengthY =
    Math.abs(project.loads.shearYKn) > 0
      ? getShearBreakoutDirectionalStrength(
          profile,
          product,
          project,
          anchorPoints,
          'y',
          project.loads.shearYKn >= 0 ? 1 : -1,
        )
      : Number.POSITIVE_INFINITY

  const dcrX =
    Number.isFinite(strengthX) && strengthX > 0
      ? Math.abs(project.loads.shearXKn) / strengthX
      : 0
  const dcrY =
    Number.isFinite(strengthY) && strengthY > 0
      ? Math.abs(project.loads.shearYKn) / strengthY
      : 0
  const demandKn = Math.hypot(project.loads.shearXKn, project.loads.shearYKn)
  const orthogonalDcr =
    dcrX > 0 && dcrY > 0 ? Math.hypot(dcrX, dcrY) : Math.max(dcrX, dcrY)
  const availableStrengths = [strengthX, strengthY].filter(
    (strength) => Number.isFinite(strength) && strength > 0,
  )
  const weakerEdgeStrength =
    availableStrengths.length > 0
      ? Math.min(...availableStrengths)
      : Number.POSITIVE_INFINITY
  const cornerVectorDcr =
    dcrX > 0 && dcrY > 0 && weakerEdgeStrength > 0
      ? demandKn / weakerEdgeStrength
      : 0
  const dcr = Math.max(orthogonalDcr, cornerVectorDcr)
  const concreteDesignStrength =
    dcr > 0 ? demandKn / dcr : Number.POSITIVE_INFINITY
  const anchorReinforcement = getAnchorReinforcementStrength(
    project.layout,
    'shear',
  )
  const useAnchorReinforcement =
    Boolean(anchorReinforcement) &&
    (anchorReinforcement?.designStrengthKn ?? 0) > concreteDesignStrength
  const equivalentDesignStrength = useAnchorReinforcement
    ? anchorReinforcement!.designStrengthKn
    : concreteDesignStrength
  const selectedDcr =
    demandKn <= 0 || equivalentDesignStrength <= 0
      ? 0
      : demandKn / equivalentDesignStrength
  let status: ReviewStatus = useAnchorReinforcement
    ? formal && anchorReinforcement!.formal
      ? 'pass'
      : 'screening'
    : formal
      ? 'pass'
      : 'screening'
  if (selectedDcr > 1) {
    status = 'fail'
  }

  return {
    id: 'concrete-breakout-shear',
    mode: '混凝土剪破強度',
    citation: profile.citations.concreteBreakoutShear,
    status,
    designStrengthKn: round(equivalentDesignStrength),
    nominalStrengthKn: round(
      useAnchorReinforcement
        ? anchorReinforcement!.nominalStrengthKn
        : equivalentDesignStrength,
    ),
    demandKn: round(demandKn),
    dcr: round(selectedDcr, 3),
    formal: useAnchorReinforcement ? formal && anchorReinforcement!.formal : formal,
    factors: [
      factor('ψ_c,V', '裂縫 / 剪力補強修正', project.layout.crackedConcrete ? (project.layout.shearHairpinReinforcement ? 1.2 : 1) : 1.4),
      factor('φ', '強度折減因子', phiSelection.phi, phiSelection.label),
      ...(anchorReinforcement
        ? [
            factor('φAsfy', '補強鋼筋路徑設計強度', anchorReinforcement.designStrengthKn, anchorReinforcement.note),
            factor('adopt', '採用設計強度', equivalentDesignStrength, useAnchorReinforcement ? '補強鋼筋取代混凝土剪破路徑' : '混凝土剪破路徑控制'),
          ]
        : []),
    ],
    note: `Vx / Vcb,x = ${round(dcrX, 3)}，Vy / Vcb,y = ${round(dcrY, 3)}；正交向量互制 = ${round(orthogonalDcr, 3)}，較弱自由邊合向量 = ${round(cornerVectorDcr, 3)}，採較保守者。ψ_c,V = ${project.layout.crackedConcrete ? (project.layout.shearHairpinReinforcement ? 1.2 : 1) : 1.4}${project.layout.shearHairpinReinforcement ? '（需符合 17.7.2.5.1 之 U 型補強鋼筋配置要求）' : ''}，已納入 ψ_ec,V（e'Vx = ${round(Math.abs(project.loads.shearEccentricityXmm ?? 0), 1)} mm，e'Vy = ${round(Math.abs(project.loads.shearEccentricityYmm ?? 0), 1)} mm），φ = ${round(phiSelection.phi, 2)}（${phiSelection.label}）${anchorReinforcement ? `；混凝土路徑 = ${round(concreteDesignStrength, 2)} kN，補強鋼筋路徑 = ${round(anchorReinforcement.designStrengthKn, 2)} kN，採 max = ${round(equivalentDesignStrength, 2)} kN${useAnchorReinforcement ? '（補強鋼筋已取代混凝土剪破強度）' : ''}；${anchorReinforcement.note}` : ''}`,
  }
}

function getPryoutResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  tensionBreakout: CheckResult,
  pulloutLike: CheckResult,
  formal: boolean,
): CheckResult | null {
  if (product.family === 'post_installed_bonded') {
    return null
  }

  const kcp =
    project.layout.effectiveEmbedmentMm < profile.constants.pryoutThresholdMm ? 1 : 2
  const tensionBasisKn =
    pulloutLike.nominalStrengthKn > 0
      ? Math.min(tensionBreakout.nominalStrengthKn, pulloutLike.nominalStrengthKn)
      : tensionBreakout.nominalStrengthKn
  if (tensionBasisKn <= 0) {
    return {
      id: 'pryout',
      mode: '撬出強度',
      citation: profile.citations.pryout,
      status: 'incomplete',
      designStrengthKn: 0,
      nominalStrengthKn: 0,
      demandKn: round(Math.hypot(project.loads.shearXKn, project.loads.shearYKn)),
      dcr: 0,
      formal: false,
      note: '拉破基準為 0，無法計算撬出強度。',
    }
  }
  const nominalStrengthKn = tensionBasisKn * kcp
  const phiSelection = getConcretePhiSelection(
    product,
    project.layout.supplementaryReinforcement,
    'pullout',
  )
  const phi = phiSelection.phi
  const designStrengthKn = nominalStrengthKn * phi
  const demandKn = Math.hypot(project.loads.shearXKn, project.loads.shearYKn)
  const dcr = demandKn <= 0 ? 0 : demandKn / designStrengthKn
  const pryoutFormal =
    formal && tensionBreakout.formal && pulloutLike.formal

  return {
    id: 'pryout',
    mode: '撬出強度',
    citation: profile.citations.pryout,
    status: dcr > 1 ? 'fail' : pryoutFormal ? 'pass' : 'screening',
    designStrengthKn: round(designStrengthKn),
    nominalStrengthKn: round(nominalStrengthKn),
    demandKn: round(demandKn),
    dcr: round(dcr, 3),
    formal: pryoutFormal,
    factors: [
      factor('k_cp', '撬出係數', kcp),
      factor('min', '拉力基準', tensionBasisKn),
      factor('φ', '強度折減因子', phi, phiSelection.label),
    ],
    note: `k_cp = ${kcp}，基準採 min(Ncbg, Npn/Na) = ${round(tensionBasisKn, 2)} kN，φ = ${round(phi, 2)}（${phiSelection.label}）`,
  }
}

function getInteractionResult(
  profile: RuleProfile,
  project: ProjectCase,
  tensionResult: CheckResult,
  shearResult: CheckResult,
  formal: boolean,
): CheckResult {
  const tensionRatio = tensionResult.dcr
  const shearRatio = shearResult.dcr
  const interactionMethod = project.loads.interactionEquation ?? 'linear'

  let demand = 0
  let capacity = Number.POSITIVE_INFINITY
  let dcr = 0
  let note = '依 17.8 互制式檢核'

  if (tensionRatio <= 0.2 || shearRatio <= 0.2) {
    dcr = Math.max(tensionRatio, shearRatio)
    demand = round(dcr, 3)
    capacity = 1
    note = '任一方向比值小於 0.2，依 17.8.1 / 17.8.2 可免互制放大'
  } else if (interactionMethod === 'power') {
    dcr = tensionRatio ** (5 / 3) + shearRatio ** (5 / 3)
    demand = round(dcr, 3)
    capacity = 1
    note = '依使用者選定之 5/3 次方互制式進行拉剪互制檢核'
  } else {
    dcr = (tensionRatio + shearRatio) / 1.2
    demand = round(tensionRatio + shearRatio, 3)
    capacity = 1.2
    note = '依保守線性互制式進行拉剪互制檢核，(Nu / φNn + Vu / φVn) / 1.2'
  }

  let status: ReviewStatus
  if (dcr > 1) {
    status = 'fail'
  } else if (
    tensionResult.status === 'incomplete' ||
    shearResult.status === 'incomplete'
  ) {
    status = 'incomplete'
  } else if (
    tensionResult.status === 'warning' ||
    shearResult.status === 'warning'
  ) {
    status = 'warning'
  } else if (
    tensionResult.status === 'screening' ||
    shearResult.status === 'screening' ||
    !tensionResult.formal ||
    !shearResult.formal
  ) {
    status = 'screening'
  } else {
    status = 'pass'
  }

  return {
    id: 'interaction',
    mode: '拉力與剪力互制',
    citation: profile.citations.interaction,
    status,
    designStrengthKn: capacity,
    nominalStrengthKn: capacity,
    demandKn: demand,
    dcr: round(dcr, 3),
    formal: formal && tensionResult.formal && shearResult.formal,
    presentation: 'ratio',
    factors: [
      factor('Eq.', '互制方程', project.loads.interactionEquation === 'power' ? '5/3 次方' : '線性 / 1.2'),
      factor('T', '控制拉力模式', tensionResult.mode),
      factor('V', '控制剪力模式', shearResult.mode),
    ],
    note,
  }
}

function getSeismicResult(
  profile: RuleProfile,
  product: AnchorProduct,
  project: ProjectCase,
  tensionSteel: CheckResult,
  tensionConcreteModes: Array<CheckResult | null>,
  shearModes: Array<CheckResult | null>,
  formal: boolean,
): CheckResult | null {
  const { loads } = project
  if (!loads.considerSeismic) {
    return null
  }

  const seismicInputMode = getSeismicInputMode(loads)
  const entryLoads = getEntryTotalLoads(loads)
  const totalTension = Math.max(0, entryLoads.tensionKn)
  const earthquakeTension = Math.max(0, loads.designEarthquakeTensionKn)
  const totalShear = Math.hypot(entryLoads.shearXKn, entryLoads.shearYKn)
  const earthquakeShear = getEarthquakeShearComponents(loads)
  const earthquakeShearMagnitude = Math.hypot(earthquakeShear.x, earthquakeShear.y)
  const entryBasisNote =
    seismicInputMode === 'static_plus_earthquake'
      ? '此比值以靜載 / 非地震分量 + 1.0E 之未放大總需求為基準。'
      : '此比值以未放大前總需求為基準。'
  if (
    (earthquakeTension > 0 && totalTension <= 0) ||
    (earthquakeShearMagnitude > 0 && totalShear <= 0)
  ) {
    const routeDiagnostics = [
      diagnostic(
        'entry_total_zero',
        'warning',
        '已輸入地震分量，但總因數化拉力或剪力為 0，無法判讀 20% 入口比值，請先確認載重組合。',
      ),
    ]
    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status: 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: 0,
      dcr: 0,
      formal: false,
      presentation: 'ratio',
      routeDiagnostics,
      diagnostics: routeDiagnostics,
      note: `已輸入地震分量，但總因數化拉力或剪力為 0，無法判讀 20% 入口比值，請先確認載重組合。${entryBasisNote}`,
    }
  }

  const tensionRatio =
    totalTension > 0 ? earthquakeTension / totalTension : 0
  const shearRatio = totalShear > 0 ? earthquakeShearMagnitude / totalShear : 0
  const entryRatio = Math.max(tensionRatio, shearRatio)
  const entryDcr = entryRatio / 0.2
  const seismicFactors = [
    factor('N_eq/N_u', '地震拉力占比', tensionRatio),
    factor('V_eq/V_u', '地震剪力占比', shearRatio),
    factor('route', '耐震設計路徑', loads.seismicDesignMethod === 'standard' ? '一般路徑' : loads.seismicDesignMethod),
    ...(loads.seismicDesignMethod === 'overstrength'
      ? [factor('Ωo', '放大係數', Math.max(1, loads.overstrengthFactor ?? 1))]
      : []),
    ...(loads.seismicDesignMethod === 'nonyielding_attachment'
      ? [
          factor(
            'Ω_attachment',
            '附掛物放大係數',
            Math.max(
              1,
              loads.attachmentOverstrengthFactor ?? loads.overstrengthFactor ?? 1,
            ),
          ),
        ]
      : []),
  ]

  if (tensionRatio <= 0.2 && shearRatio <= 0.2) {
    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status: formal ? 'pass' : 'screening',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: round(entryRatio, 3),
      dcr: round(entryDcr, 3),
      formal,
      presentation: 'ratio',
      factors: seismicFactors,
      note: `設計地震力占總因數化拉力 / 剪力不超過 20%，可依 17.10 一般路徑設計。${entryBasisNote}`,
    }
  }

  if (loads.seismicDesignMethod === 'standard') {
    const routeDiagnostics = [
      diagnostic(
        'entry_requires_upgraded_route',
        'warning',
        '設計地震力占比超過 20%，需升級到 17.10.5.3 / 17.10.6.3 指定之韌性或 Ωo 路徑。',
      ),
    ]
    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status: 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: round(entryRatio, 3),
      dcr: round(entryDcr, 3),
      formal: false,
      presentation: 'ratio',
      factors: seismicFactors,
      routeDiagnostics,
      diagnostics: routeDiagnostics,
      note:
        `設計地震力占比超過 20%，需升級到 17.10.5.3 / 17.10.6.3 指定之韌性或 Ωo 路徑，並非一般 fail。${entryBasisNote}`,
    }
  }

  if (loads.seismicDesignMethod === 'overstrength') {
    const overstrengthFactor = Math.max(1, loads.overstrengthFactor ?? 1)
    if (overstrengthFactor <= 1) {
      const routeDiagnostics = [
        diagnostic(
          'overstrength_factor_missing',
          'incomplete',
          '已選擇 Ωo 路徑，但尚未輸入有效 Ωo 值。',
        ),
      ]
      return {
        id: 'seismic',
        mode: '耐震設計入口',
        citation: profile.citations.seismic,
        status: 'warning',
        designStrengthKn: 0.2,
        nominalStrengthKn: 0.2,
        demandKn: round(entryRatio, 3),
        dcr: round(entryDcr, 3),
        formal: false,
        presentation: 'ratio',
        factors: seismicFactors,
        routeDiagnostics,
        diagnostics: routeDiagnostics,
        note: `已選擇 Ωo 路徑，但尚未輸入有效 Ωo 值，主檢核不應視為完成。${entryBasisNote}`,
      }
    }
  }

  if (loads.seismicDesignMethod === 'ductile_steel') {
    const stretchLengthMm = Math.max(0, loads.ductileStretchLengthMm ?? 0)
    const requiredStretchLengthMm = 8 * product.diameterMm
    const steelRatio =
      product.steelYieldStrengthMpa > 0
        ? product.steelUltimateStrengthMpa / product.steelYieldStrengthMpa
        : 0
    const steelRatioOk = steelRatio >= 1.3
    const stretchOk = stretchLengthMm >= requiredStretchLengthMm
    const bucklingOk = Boolean(loads.ductileBucklingRestrained)
    const attachmentMechanismOk = Boolean(
      loads.ductileAttachmentMechanismVerified,
    )
    const controllingConcreteMode = getMinimumAvailableDesignMode(
      tensionConcreteModes,
    )
    const steelStrengthKn = 1.2 * Math.max(0, tensionSteel.nominalStrengthKn)
    const concreteDesignKn = Math.max(
      0,
      controllingConcreteMode?.designStrengthKn ?? 0,
    )
    const routeOk =
      steelRatioOk &&
      stretchOk &&
      bucklingOk &&
      attachmentMechanismOk &&
      concreteDesignKn > 0 &&
      concreteDesignKn >= steelStrengthKn
    const routeFormal = formal && routeOk
    const diagnostics: ResultDiagnostic[] = []
    if (!steelRatioOk) {
      diagnostics.push(
        diagnostic(
          'ductile_fu_fy',
          'warning',
          `目前 fu/fy = ${round(steelRatio, 3)}，需 ≥ 1.3。`,
        ),
      )
    }
    if (!stretchOk) {
      diagnostics.push(
        diagnostic(
          'ductile_stretch_length',
          'warning',
          `有效延性長度需 ≥ 8da（${round(requiredStretchLengthMm, 1)} mm）。`,
        ),
      )
    }
    if (!bucklingOk) {
      diagnostics.push(
        diagnostic(
          'ductile_buckling',
          'warning',
          '需確認反覆載重下鋼材受壓段已防止挫屈。',
        ),
      )
    }
    if (!attachmentMechanismOk) {
      diagnostics.push(
        diagnostic(
          'ductile_attachment_mechanism',
          'warning',
          '需確認附掛物存在足夠降伏機制可傳遞錨栓降伏力。',
        ),
      )
    }
    if (!(concreteDesignKn > 0 && concreteDesignKn >= steelStrengthKn)) {
      diagnostics.push(
        diagnostic(
          'ductile_concrete_strength',
          'warning',
          '目前配置下控制混凝土設計強度尚不足以包覆 1.2Nsa。',
        ),
      )
    }

    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status: routeOk ? (routeFormal ? 'pass' : 'screening') : 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: round(entryRatio, 3),
      dcr: round(entryDcr, 3),
      formal: routeFormal,
      presentation: 'ratio',
      routeDiagnostics: diagnostics,
      diagnostics,
      factors: [
        ...seismicFactors,
        factor('fu/fy', '鋼材強度比', round(steelRatio, 3)),
        factor('ℓ_du', '有效延性長度', round(stretchLengthMm, 1), `需 ≥ ${round(requiredStretchLengthMm, 1)} mm`),
        factor(
          'Mechanism',
          '附掛物降伏機制',
          attachmentMechanismOk ? '已驗證' : '未驗證',
          '17.10.5.3(a)(v)',
        ),
        factor(
          '1.2Nsa',
          '韌性鋼材設計比較強度',
          round(steelStrengthKn, 2),
        ),
        factor(
          'Nconc',
          '控制混凝土設計強度',
          round(concreteDesignKn, 2),
          controllingConcreteMode?.mode ?? '無可比較混凝土拉力模式',
        ),
      ],
      note: routeOk
        ? `已選擇韌性鋼材路徑；fu/fy = ${round(steelRatio, 3)}，有效延性長度 = ${round(stretchLengthMm, 1)} mm，控制混凝土設計強度 = ${round(concreteDesignKn, 2)} kN，並已確認附掛物具足夠降伏機制可傳遞錨栓降伏力，滿足 φNn,concrete ≥ 1.2Nsa。${entryBasisNote}`
        : `韌性鋼材路徑尚未成立：${steelRatioOk ? '' : 'fu/fy 需 ≥ 1.3；'}${stretchOk ? '' : `有效延性長度需 ≥ 8da（${round(requiredStretchLengthMm, 1)} mm）；`}${bucklingOk ? '' : '需確認反覆載重下鋼材受壓段已防止挫屈；'}${attachmentMechanismOk ? '' : '需確認附掛物存在足夠降伏機制可傳遞錨栓降伏力；'}${concreteDesignKn >= steelStrengthKn && concreteDesignKn > 0 ? '' : '控制混凝土設計強度需 ≥ 1.2Nsa；'}${entryBasisNote}`,
    }
  }

  if (loads.seismicDesignMethod === 'attachment_yield') {
    const attachmentYieldTensionKn = Math.max(
      0,
      loads.attachmentYieldTensionKn ?? 0,
    )
    const attachmentYieldShearKn = Math.max(0, loads.attachmentYieldShearKn ?? 0)
    const controllingTensionMode = getMinimumAvailableDesignMode([
      tensionSteel,
      ...tensionConcreteModes,
    ])
    const controllingShearMode = getMinimumAvailableDesignMode(shearModes)
    const anchorDesignTensionKn = Math.max(
      0,
      controllingTensionMode?.designStrengthKn ?? 0,
    )
    const anchorDesignShearKn = Math.max(
      0,
      controllingShearMode?.designStrengthKn ?? 0,
    )
    const requiredAttachmentTensionKn = 1.2 * attachmentYieldTensionKn
    const requiredAttachmentShearKn = 1.2 * attachmentYieldShearKn
    const tensionProvided =
      totalTension <= 0 ||
      (attachmentYieldTensionKn > 0 &&
        anchorDesignTensionKn >= requiredAttachmentTensionKn)
    const shearProvided =
      totalShear <= 0 ||
      (attachmentYieldShearKn > 0 &&
        anchorDesignShearKn >= requiredAttachmentShearKn)
    const attachmentInteraction =
      loads.attachmentYieldInteractionEquation ?? 'none'
    const tensionInteractionRatio =
      requiredAttachmentTensionKn > 0 && anchorDesignTensionKn > 0
        ? requiredAttachmentTensionKn / anchorDesignTensionKn
        : 0
    const shearInteractionRatio =
      requiredAttachmentShearKn > 0 && anchorDesignShearKn > 0
        ? requiredAttachmentShearKn / anchorDesignShearKn
        : 0
    const interactionDcr =
      attachmentInteraction === 'power'
        ? tensionInteractionRatio ** (5 / 3) + shearInteractionRatio ** (5 / 3)
        : attachmentInteraction === 'linear'
          ? (tensionInteractionRatio + shearInteractionRatio) / 1.2
          : Math.max(tensionInteractionRatio, shearInteractionRatio)
    const interactionRequired =
      attachmentInteraction !== 'none' &&
      requiredAttachmentTensionKn > 0 &&
      requiredAttachmentShearKn > 0
    const interactionOk = !interactionRequired || interactionDcr <= 1
    const routeOk = tensionProvided && shearProvided && interactionOk
    const routeFormal = formal && routeOk
    const diagnostics: ResultDiagnostic[] = []
    if (totalTension > 0 && attachmentYieldTensionKn <= 0) {
      diagnostics.push(
        diagnostic(
          'attachment_yield_tension_input',
          'incomplete',
          '請輸入附掛物降伏可傳遞拉力。',
        ),
      )
    } else if (!tensionProvided) {
      diagnostics.push(
        diagnostic(
          'attachment_yield_tension_strength',
          'warning',
          '目前配置下控制錨栓設計拉力強度不足以包覆 1.2 × Nyield。',
        ),
      )
    }
    if (totalShear > 0 && attachmentYieldShearKn <= 0) {
      diagnostics.push(
        diagnostic(
          'attachment_yield_shear_input',
          'incomplete',
          '請輸入附掛物降伏可傳遞剪力。',
        ),
      )
    } else if (!shearProvided) {
      diagnostics.push(
        diagnostic(
          'attachment_yield_shear_strength',
          'warning',
          '目前配置下控制錨栓設計剪力強度不足以包覆 1.2 × Vyield。',
        ),
      )
    }
    if (interactionRequired && !interactionOk) {
      diagnostics.push(
        diagnostic(
          'attachment_yield_interaction',
          'warning',
          '目前配置下附掛物降伏拉剪互制未通過。',
        ),
      )
    }

    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status: routeOk ? (routeFormal ? 'pass' : 'screening') : 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: round(entryRatio, 3),
      dcr: round(entryDcr, 3),
      formal: routeFormal,
      presentation: 'ratio',
      routeDiagnostics: diagnostics,
      diagnostics,
      factors: [
        ...seismicFactors,
        factor(
          'φN_anchor',
          '控制錨栓設計拉力強度',
          round(anchorDesignTensionKn, 2),
          controllingTensionMode?.mode ?? '無可比較錨栓拉力模式',
        ),
        factor(
          'φV_anchor',
          '控制錨栓設計剪力強度',
          round(anchorDesignShearKn, 2),
          controllingShearMode?.mode ?? '無可比較錨栓剪力模式',
        ),
        factor(
          '1.2N_attach',
          '1.2 × 附掛物降伏拉力上限',
          round(requiredAttachmentTensionKn, 2),
        ),
        factor(
          '1.2V_attach',
          '1.2 × 附掛物降伏剪力上限',
          round(requiredAttachmentShearKn, 2),
        ),
        ...(interactionRequired
          ? [
              factor(
                'Eq_attach',
                '附掛物降伏互制',
                attachmentInteraction === 'power' ? '5/3 次方' : '線性 / 1.2',
              ),
              factor(
                'DCR_attach',
                '附掛物降伏互制比值',
                round(interactionDcr, 3),
              ),
            ]
          : []),
      ],
      note: routeOk
        ? `已選擇附掛物降伏路徑；控制錨栓設計強度已分別滿足 φNn ≥ 1.2Nyield,attachment 與 φVn ≥ 1.2Vyield,attachment${interactionRequired ? `，並通過${attachmentInteraction === 'power' ? ' 5/3 次方' : ' 線性'}互制檢核` : '；目前僅有單向降伏需求，未啟動互制檢核'}。${entryBasisNote}`
        : `附掛物降伏路徑尚未成立：${totalTension > 0 && attachmentYieldTensionKn <= 0 ? '請輸入附掛物降伏可傳遞拉力；' : ''}${totalShear > 0 && attachmentYieldShearKn <= 0 ? '請輸入附掛物降伏可傳遞剪力；' : ''}${!tensionProvided ? '控制錨栓設計拉力強度不足以包覆 1.2 × 附掛物降伏拉力上限；' : ''}${!shearProvided ? '控制錨栓設計剪力強度不足以包覆 1.2 × 附掛物降伏剪力上限；' : ''}${interactionRequired && !interactionOk ? '附掛物降伏拉剪互制未通過；' : ''}${!interactionRequired ? '目前僅有單向降伏需求，未啟動互制檢核；' : ''}${entryBasisNote}`,
    }
  }

  if (loads.seismicDesignMethod === 'nonyielding_attachment') {
    const attachmentFactor = Math.max(
      1,
      loads.attachmentOverstrengthFactor ?? loads.overstrengthFactor ?? 1,
    )
    const routeFormal = formal && attachmentFactor > 1
    const routeDiagnostics =
      attachmentFactor > 1
        ? undefined
        : [
            diagnostic(
              'attachment_overstrength_missing',
              'incomplete',
              '非降伏附掛物路徑需提供有效 Ωattachment 值。',
            ),
          ]
    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: profile.citations.seismic,
      status:
        attachmentFactor > 1
          ? product.evaluation.seismicQualified === false
            ? 'warning'
            : routeFormal
              ? 'pass'
              : 'screening'
          : 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: round(entryRatio, 3),
      dcr: round(entryDcr, 3),
      formal: routeFormal,
      presentation: 'ratio',
      routeDiagnostics,
      diagnostics: routeDiagnostics,
      factors: [
        ...seismicFactors,
        factor('Ω_attachment', '附掛物放大係數', round(attachmentFactor, 2)),
      ],
      note:
        attachmentFactor > 1
          ? `已選擇非降伏附掛物路徑，主檢核已依 Ω_attachment = ${round(attachmentFactor, 2)} 放大地震分量。${entryBasisNote}`
          : `非降伏附掛物路徑需提供有效 Ω_attachment 值。${entryBasisNote}`,
    }
  }

  return {
    id: 'seismic',
    mode: '耐震設計入口',
    citation: profile.citations.seismic,
    status: product.evaluation.seismicQualified === false ? 'warning' : formal ? 'pass' : 'screening',
    designStrengthKn: 0.2,
    nominalStrengthKn: 0.2,
    demandKn: round(entryRatio, 3),
    dcr: round(entryDcr, 3),
    formal,
    presentation: 'ratio',
    factors: seismicFactors,
    note:
      loads.seismicDesignMethod === 'overstrength'
        ? `已選擇 Ωo 路徑，主檢核已依 Ωo = ${round(Math.max(1, loads.overstrengthFactor ?? 1), 2)} 放大地震分量。${entryBasisNote}`
        : `已選擇 ${loads.seismicDesignMethod} 路徑，仍需以實際附掛物與 Ωo 條件覆核。${entryBasisNote}`,
  }
}

function buildSummary(
  product: AnchorProduct,
  completeness: ProductCompleteness,
  dimensionChecks: DimensionCheck[],
  results: CheckResult[],
) {
  const dimensionFailure = dimensionChecks.some((item) => item.status === 'fail')
  const incomplete = results.some((item) => item.status === 'incomplete')
  const hasFail = results.some((item) => item.status === 'fail')
  const hasScreening = results.some((item) => item.status === 'screening')
  const maxResult =
    [...results].sort(compareResultsForGovernance)[0] ?? results[0]

  let overallStatus: ReviewStatus = 'pass'
  if (dimensionFailure || hasFail) {
    overallStatus = 'fail'
  } else if (incomplete) {
    overallStatus = 'incomplete'
  } else if (hasScreening) {
    overallStatus = 'screening'
  }

  const tensionResults = results.filter((item) => item.citation.clause.startsWith('17.6'))
  const shearResults = results.filter((item) => item.citation.clause.startsWith('17.7'))
  const governingTensionMode = pickGoverningMode(
    tensionResults,
    '無拉力結果',
    '無拉力',
  )
  const governingShearMode = pickGoverningMode(
    shearResults,
    '無剪力結果',
    '無剪力',
  )

  const notes = [
    `${getProductFamilyLabel(product.family)}：${product.brand} ${product.model}`,
    completeness.formal
      ? '產品資料完整，可顯示正式規範判定。'
      : `缺少產品評估資料：${completeness.missing.join('、')}`,
  ]
  if (incomplete && !hasFail) {
    notes.push('存在 incomplete 檢核時，最大 DCR 僅供排序參考，不能視為完整控制值。')
  }

  const governingDcr = round(
    Number.isFinite(maxResult?.dcr ?? Number.NaN) ? (maxResult?.dcr ?? 0) : 0,
    3,
  )
  const numericMaxDcr = round(
    results
      .filter((item) => Number.isFinite(item.dcr))
      .sort((first, second) => second.dcr - first.dcr)[0]?.dcr ?? 0,
    3,
  )
  if (governingDcr < numericMaxDcr) {
    notes.push(
      `最大數值 DCR = ${numericMaxDcr}，但控制模式依 severity 判定為「${maxResult?.mode ?? '尚無控制結果'}」，控制 DCR = ${governingDcr}。`,
    )
  }

  return {
    overallStatus,
    formalStatus: completeness.formal ? overallStatus : 'incomplete',
    maxDcr: numericMaxDcr,
    governingDcr,
    governingMode:
      maxResult && !(maxResult.status === 'pass' && maxResult.dcr <= 0)
        ? maxResult.mode
        : '尚無控制結果',
    governingTensionMode,
    governingShearMode,
    notes,
  }
}

export function evaluateProject(
  project: ProjectCase,
  product: AnchorProduct,
  profile: RuleProfile = getRuleProfileById(project.ruleProfileId),
): ReviewResult {
  const effectiveProjectBundle = buildEffectiveProjectForChecks(project)
  const analysisProject = effectiveProjectBundle.project
  const anchorPoints = buildAnchorPoints(analysisProject.layout)
  const tensionDemand = buildTensionDemandDistribution(analysisProject, anchorPoints)
  const completeness = assessProductCompleteness(product)
  const dimensionChecks = buildDimensionChecks(profile, product, project.layout)
  const results: CheckResult[] = []

  const tensionSteel = getSteelTensionResult(
    profile,
    product,
    tensionDemand,
    completeness.formal,
  )
  const tensionConcreteBreakout = getConcreteBreakoutTension(
    profile,
    product,
    analysisProject,
    tensionDemand,
    completeness.formal,
  )
  const pullout = getPulloutResult(
    profile,
    product,
    analysisProject,
    tensionDemand,
    completeness,
  )
  const concreteBearing = getConcreteBearingResult(profile, analysisProject)
  const basePlateBending = getBasePlateBendingResult(profile, analysisProject)
  const sideFaceBlowout = getSideFaceBlowoutResult(
    profile,
    product,
    analysisProject,
    tensionDemand,
    completeness.formal,
  )
  const shearSteel = getSteelShearResult(profile, product, analysisProject, completeness.formal)
  const shearConcreteBreakout = getConcreteShearBreakoutResult(
    profile,
    product,
    analysisProject,
    anchorPoints,
    completeness.formal,
  )
  const pryout = getPryoutResult(
    profile,
    product,
    analysisProject,
    tensionConcreteBreakout,
    pullout,
    completeness.formal,
  )

  results.push(tensionSteel, tensionConcreteBreakout, pullout)
  if (concreteBearing) {
    results.push(concreteBearing)
  }
  if (basePlateBending) {
    results.push(basePlateBending)
  }
  if (sideFaceBlowout) {
    results.push(sideFaceBlowout)
  }
  results.push(shearSteel, shearConcreteBreakout)
  if (pryout) {
    results.push(pryout)
  }

  const governingTension =
    [tensionSteel, tensionConcreteBreakout, pullout, sideFaceBlowout]
      .filter((item): item is CheckResult => Boolean(item))
      .sort(compareResultsForGovernance)[0] ?? tensionSteel
  const governingShear =
    [shearSteel, shearConcreteBreakout, pryout]
      .filter((item): item is CheckResult => Boolean(item))
      .sort(compareResultsForGovernance)[0] ?? shearSteel

  results.push(
    getInteractionResult(
      profile,
      analysisProject,
      governingTension,
      governingShear,
      completeness.formal,
    ),
  )

  const seismic = getSeismicResult(
    profile,
    product,
    analysisProject,
    tensionSteel,
    [tensionConcreteBreakout, pullout, sideFaceBlowout],
    [shearSteel, shearConcreteBreakout, pryout],
    completeness.formal,
  )
  if (seismic) {
    results.push(seismic)
  }
  if (effectiveProjectBundle.note) {
    const omegaAffectedIds = new Set([
      'steel-tension',
      'concrete-breakout-tension',
      'pullout',
      'bond',
      'side-face-blowout',
      'steel-shear',
      'concrete-breakout-shear',
      'pryout',
    ])
    results.forEach((result) => {
      if (omegaAffectedIds.has(result.id)) {
        result.note = `${result.note}；${effectiveProjectBundle.note}`
      }
    })
  }

  return {
    ruleProfile: profile,
    product,
    project,
    analysisLoads: analysisProject.loads,
    analysisNote: effectiveProjectBundle.note || undefined,
    anchorPoints,
    visualization: buildReviewVisualization(
      product,
      analysisProject,
      anchorPoints,
      tensionDemand,
    ),
    dimensionChecks,
    results,
    summary: buildSummary(product, completeness, dimensionChecks, results),
  }
}

export function evaluateProjectBatch(
  project: ProjectCase,
  product: AnchorProduct,
  profile: RuleProfile = getRuleProfileById(project.ruleProfileId),
): ReviewBatchResult {
  const loadCases = getProjectLoadCases(project)
  const loadCaseReviews = loadCases.map((loadCase) => ({
    loadCaseId: loadCase.id,
    loadCaseName: loadCase.name,
    review: evaluateProject(
      {
        ...project,
        loads: loadCase.loads,
      },
      product,
      profile,
    ),
  }))

  const activeLoadCase =
    loadCases.find((item) => item.id === project.activeLoadCaseId) ??
    loadCases[0]
  const activeReview =
    loadCaseReviews.find((item) => item.loadCaseId === activeLoadCase.id) ??
    loadCaseReviews[0]
  const controllingReview =
    [...loadCaseReviews].sort(compareLoadCaseReviewsForGovernance)[0] ??
    activeReview
  const notes = [...controllingReview.review.summary.notes]

  if (loadCaseReviews.length > 1) {
    notes.push(
      `共檢核 ${loadCaseReviews.length} 組載重組合，控制組合為 ${controllingReview.loadCaseName}。`,
    )
    if (activeReview.loadCaseId === controllingReview.loadCaseId) {
      notes.push('當前編輯組合即為控制組合。')
    }
  }

  return {
    activeLoadCaseId: activeReview.loadCaseId,
    activeLoadCaseName: activeReview.loadCaseName,
    activeReview: activeReview.review,
    controllingLoadCaseId: controllingReview.loadCaseId,
    controllingLoadCaseName: controllingReview.loadCaseName,
    controllingReview: controllingReview.review,
    loadCaseReviews,
    summary: {
      ...controllingReview.review.summary,
      notes,
    },
  }
}

export function evaluateCandidateProducts(
  project: ProjectCase,
  products: AnchorProduct[],
  profile: RuleProfile = getRuleProfileById(project.ruleProfileId),
) {
  return products
    .map((product) => ({
      product,
      completeness: assessProductCompleteness(product),
      batchReview: evaluateProjectBatch(project, product, profile),
    }))
    .sort((left, right) =>
      compareBatchReviewsForSelection(left.batchReview, right.batchReview),
    )
}

export function evaluateLayoutVariants(
  project: ProjectCase,
  product: AnchorProduct,
  variants: ProjectLayoutVariant[],
  profile: RuleProfile = getRuleProfileById(project.ruleProfileId),
) {
  return [
    {
      variant: {
        id: '__current__',
        name: '目前配置',
        layout: project.layout,
        updatedAt: project.updatedAt,
      } satisfies ProjectLayoutVariant,
      isCurrent: true,
      batchReview: evaluateProjectBatch(project, product, profile),
    },
    ...variants.map((variant) => ({
      variant,
      isCurrent: false,
      batchReview: evaluateProjectBatch(
        {
          ...project,
          layout: variant.layout,
        },
        product,
        profile,
      ),
    })),
  ].sort((left, right) =>
    compareBatchReviewsForSelection(left.batchReview, right.batchReview),
  )
}
