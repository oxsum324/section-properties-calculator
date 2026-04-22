import type { AnchorLayout, ColumnSectionType, LoadCase } from './domain'

export interface BasePlatePlanDimensions {
  widthMm: number
  heightMm: number
  source: 'plan' | 'loaded_area' | 'none'
}

export interface DerivedCantileverResult {
  sectionType: ColumnSectionType
  xMm: number
  yMm: number
  mMm: number
  nMm: number
  lambdaPrimeMm: number
  planWidthMm: number
  planHeightMm: number
}

export interface BasePlateOffsetMoments {
  deltaMomentXKnM: number
  deltaMomentYKnM: number
}

function positive(value: number | undefined) {
  return Math.max(0, value ?? 0)
}

export function getColumnSectionType(layout: AnchorLayout): ColumnSectionType {
  return layout.columnSectionType ?? 'manual'
}

export function getBasePlatePlanDimensions(
  layout: AnchorLayout,
): BasePlatePlanDimensions {
  const planWidthMm = positive(layout.basePlatePlanWidthMm)
  const planHeightMm = positive(layout.basePlatePlanHeightMm)
  if (planWidthMm > 0 && planHeightMm > 0) {
    return { widthMm: planWidthMm, heightMm: planHeightMm, source: 'plan' }
  }

  const loadedWidthMm = positive(layout.basePlateLoadedWidthMm)
  const loadedHeightMm = positive(layout.basePlateLoadedHeightMm)
  if (loadedWidthMm > 0 && loadedHeightMm > 0) {
    return {
      widthMm: loadedWidthMm,
      heightMm: loadedHeightMm,
      source: 'loaded_area',
    }
  }

  return { widthMm: 0, heightMm: 0, source: 'none' }
}

export function getDerivedBasePlateCantilevers(
  layout: AnchorLayout,
): DerivedCantileverResult | null {
  const sectionType = getColumnSectionType(layout)
  if (sectionType === 'manual') {
    return null
  }

  const { widthMm: planWidthMm, heightMm: planHeightMm } =
    getBasePlatePlanDimensions(layout)
  const depthMm = positive(layout.columnDepthMm)
  const flangeWidthMm = positive(layout.columnFlangeWidthMm)

  if (planWidthMm <= 0 || planHeightMm <= 0 || depthMm <= 0) {
    return null
  }

  const widthReferenceMm =
    flangeWidthMm > 0 ? flangeWidthMm : depthMm

  let mMm = 0
  let nMm = 0
  let lambdaPrimeMm = 0

  switch (sectionType) {
    case 'i_h':
      if (flangeWidthMm <= 0) {
        return null
      }
      mMm = Math.max(0, (planHeightMm - 0.95 * depthMm) / 2)
      nMm = Math.max(0, (planWidthMm - 0.8 * flangeWidthMm) / 2)
      lambdaPrimeMm = 0.25 * Math.sqrt(depthMm * flangeWidthMm)
      break
    case 'rect':
    case 'pipe':
      mMm = Math.max(0, (planHeightMm - depthMm) / 2)
      nMm = Math.max(0, (planWidthMm - widthReferenceMm) / 2)
      break
    default:
      return null
  }

  return {
    sectionType,
    xMm: Math.max(nMm, lambdaPrimeMm),
    yMm: Math.max(mMm, lambdaPrimeMm),
    mMm,
    nMm,
    lambdaPrimeMm,
    planWidthMm,
    planHeightMm,
  }
}

export function getEffectiveBasePlateCantilevers(layout: AnchorLayout) {
  const manualXmm = positive(layout.basePlateCantileverXmm)
  const manualYmm = positive(layout.basePlateCantileverYmm)
  if (manualXmm > 0 || manualYmm > 0) {
    return {
      xMm: manualXmm,
      yMm: manualYmm,
      source: 'manual' as const,
      derived: null,
    }
  }

  const derived = getDerivedBasePlateCantilevers(layout)
  if (derived) {
    return {
      xMm: derived.xMm,
      yMm: derived.yMm,
      source: 'derived' as const,
      derived,
    }
  }

  return {
    xMm: 0,
    yMm: 0,
    source: 'none' as const,
    derived: null,
  }
}

export function getBasePlateOffsetMoments(
  layout: AnchorLayout,
  loads: LoadCase,
): BasePlateOffsetMoments {
  const compressionKn = Math.max(0, -loads.tensionKn)
  const offsetXmm = layout.columnCentroidOffsetXmm ?? 0
  const offsetYmm = layout.columnCentroidOffsetYmm ?? 0

  return {
    deltaMomentXKnM: (compressionKn * offsetYmm) / 1000,
    deltaMomentYKnM: (compressionKn * offsetXmm) / 1000,
  }
}

export function getEffectiveBasePlateMoments(
  layout: AnchorLayout,
  loads: LoadCase,
) {
  const offset = getBasePlateOffsetMoments(layout, loads)

  return {
    momentXKnM: loads.momentXKnM + offset.deltaMomentXKnM,
    momentYKnM: loads.momentYKnM + offset.deltaMomentYKnM,
    ...offset,
  }
}
