import type { AnchorLayout, LoadCase } from './domain'
import { getEffectiveBasePlateMoments } from './basePlateGeometry'

export interface BasePlateLoadedAreaState {
  loadedWidthMm: number
  loadedHeightMm: number
  geometricLoadedAreaMm2: number
  loadedAreaMm2: number
  loadedAreaDerivedFromGeometry: boolean
  loadedAreaMismatch: boolean
}

export interface BasePlateStressState extends BasePlateLoadedAreaState {
  demandCompressionKn: number
  bearingMomentExternallyVerified: boolean
  basePlateSectionType: 'rectangle' | 'custom'
  customSectionModulusXmm3: number
  customSectionModulusYmm3: number
  hasCustomSectionModuli: boolean
  sectionModulusX: number
  sectionModulusY: number
  hasBearingStressGeometry: boolean
  hasBearingStressSection: boolean
  axialStressMpa: number
  effectiveMoments: ReturnType<typeof getEffectiveBasePlateMoments>
  effectiveMomentXKnM: number
  effectiveMomentYKnM: number
  hasBearingMoment: boolean
  eccentricityYmm: number
  eccentricityXmm: number
  kernYmm: number
  kernXmm: number
  compressionMarginYmm: number
  compressionMarginXmm: number
  upliftY: boolean
  upliftX: boolean
  majorUpliftY: boolean
  majorUpliftX: boolean
  bendingStressXMpa: number
  bendingStressYMpa: number
  upliftStressYMpa: number
  upliftStressXMpa: number
  contactLengthYmm: number
  contactLengthXmm: number
  directionalStressYMpa: number
  directionalStressXMpa: number
  demandStressMpa: number
}

export interface BasePlateBearingGeometryState extends BasePlateLoadedAreaState {
  bearingMomentExternallyVerified: boolean
  basePlateSectionType: 'rectangle' | 'custom'
  customSectionModulusXmm3: number
  customSectionModulusYmm3: number
  hasCustomSectionModuli: boolean
  sectionModulusX: number
  sectionModulusY: number
  hasBearingStressGeometry: boolean
  hasBearingStressSection: boolean
}

export interface BasePlateStressDistributionState {
  demandCompressionKn: number
  axialStressMpa: number
  effectiveMoments: ReturnType<typeof getEffectiveBasePlateMoments>
  effectiveMomentXKnM: number
  effectiveMomentYKnM: number
  hasBearingMoment: boolean
  eccentricityYmm: number
  eccentricityXmm: number
  kernYmm: number
  kernXmm: number
  compressionMarginYmm: number
  compressionMarginXmm: number
  upliftY: boolean
  upliftX: boolean
  majorUpliftY: boolean
  majorUpliftX: boolean
  bendingStressXMpa: number
  bendingStressYMpa: number
  upliftStressYMpa: number
  upliftStressXMpa: number
  contactLengthYmm: number
  contactLengthXmm: number
  directionalStressYMpa: number
  directionalStressXMpa: number
  demandStressMpa: number
}

export function getBasePlateSectionType(layout: AnchorLayout) {
  return layout.basePlateSectionType === 'custom' ? 'custom' : 'rectangle'
}

export function hasMeaningfulBasePlateMoment(value: number | undefined) {
  return Math.abs(value ?? 0) > 0.01
}

export function getBasePlateLoadedAreaState(
  layout: AnchorLayout,
): BasePlateLoadedAreaState {
  const loadedWidthMm = Math.max(0, layout.basePlateLoadedWidthMm ?? 0)
  const loadedHeightMm = Math.max(0, layout.basePlateLoadedHeightMm ?? 0)
  const geometricLoadedAreaMm2 =
    loadedWidthMm > 0 && loadedHeightMm > 0 ? loadedWidthMm * loadedHeightMm : 0
  const loadedAreaMm2 =
    layout.basePlateLoadedAreaMm2 > 0
      ? layout.basePlateLoadedAreaMm2
      : geometricLoadedAreaMm2
  const loadedAreaDerivedFromGeometry =
    layout.basePlateLoadedAreaMm2 <= 0 && geometricLoadedAreaMm2 > 0
  const loadedAreaMismatch =
    layout.basePlateLoadedAreaMm2 > 0 &&
    geometricLoadedAreaMm2 > 0 &&
    Math.abs(layout.basePlateLoadedAreaMm2 - geometricLoadedAreaMm2) /
      geometricLoadedAreaMm2 >
      0.1

  return {
    loadedWidthMm,
    loadedHeightMm,
    geometricLoadedAreaMm2,
    loadedAreaMm2,
    loadedAreaDerivedFromGeometry,
    loadedAreaMismatch,
  }
}

export function computeBasePlateBearingGeometry(
  layout: AnchorLayout,
): BasePlateBearingGeometryState {
  const loadedAreaState = getBasePlateLoadedAreaState(layout)
  const {
    loadedWidthMm,
    loadedHeightMm,
    geometricLoadedAreaMm2,
    loadedAreaMm2,
    loadedAreaDerivedFromGeometry,
    loadedAreaMismatch,
  } = loadedAreaState
  const bearingMomentExternallyVerified = Boolean(
    layout.basePlateBearingMomentExternallyVerified,
  )
  const basePlateSectionType = getBasePlateSectionType(layout)
  const customSectionModulusXmm3 = Math.max(
    0,
    layout.basePlateSectionModulusXmm3 ?? 0,
  )
  const customSectionModulusYmm3 = Math.max(
    0,
    layout.basePlateSectionModulusYmm3 ?? 0,
  )
  const hasCustomSectionModuli =
    customSectionModulusXmm3 > 0 && customSectionModulusYmm3 > 0
  const hasBearingStressGeometry = loadedWidthMm > 0 && loadedHeightMm > 0
  const rectangularSectionModulusX =
    hasBearingStressGeometry && loadedHeightMm > 0
      ? (loadedWidthMm * loadedHeightMm * loadedHeightMm) / 6
      : 0
  const rectangularSectionModulusY =
    hasBearingStressGeometry && loadedWidthMm > 0
      ? (loadedHeightMm * loadedWidthMm * loadedWidthMm) / 6
      : 0
  const sectionModulusX =
    basePlateSectionType === 'custom'
      ? hasCustomSectionModuli
        ? customSectionModulusXmm3
        : 0
      : rectangularSectionModulusX
  const sectionModulusY =
    basePlateSectionType === 'custom'
      ? hasCustomSectionModuli
        ? customSectionModulusYmm3
        : 0
      : rectangularSectionModulusY
  const hasBearingStressSection =
    hasBearingStressGeometry &&
    (basePlateSectionType === 'rectangle' || hasCustomSectionModuli)

  return {
    loadedWidthMm,
    loadedHeightMm,
    geometricLoadedAreaMm2,
    loadedAreaMm2,
    loadedAreaDerivedFromGeometry,
    loadedAreaMismatch,
    bearingMomentExternallyVerified,
    basePlateSectionType,
    customSectionModulusXmm3,
    customSectionModulusYmm3,
    hasCustomSectionModuli,
    sectionModulusX,
    sectionModulusY,
    hasBearingStressGeometry,
    hasBearingStressSection,
  }
}

export function computeBasePlateStressDistribution(
  geometry: BasePlateBearingGeometryState,
  layout: AnchorLayout,
  loads: LoadCase,
): BasePlateStressDistributionState {
  const demandCompressionKn = Math.max(0, -loads.tensionKn)
  const axialStressMpa =
    geometry.loadedAreaMm2 > 0
      ? (demandCompressionKn * 1000) / geometry.loadedAreaMm2
      : 0
  const effectiveMoments = getEffectiveBasePlateMoments(layout, loads)
  const effectiveMomentXKnM = effectiveMoments.momentXKnM
  const effectiveMomentYKnM = effectiveMoments.momentYKnM
  const hasBearingMoment =
    hasMeaningfulBasePlateMoment(effectiveMomentXKnM) ||
    hasMeaningfulBasePlateMoment(effectiveMomentYKnM)
  const eccentricityYmm =
    demandCompressionKn > 0
      ? (Math.abs(effectiveMomentXKnM) * 1000) / demandCompressionKn
      : 0
  const eccentricityXmm =
    demandCompressionKn > 0
      ? (Math.abs(effectiveMomentYKnM) * 1000) / demandCompressionKn
      : 0
  const kernYmm = geometry.loadedHeightMm / 6
  const kernXmm = geometry.loadedWidthMm / 6
  const compressionMarginYmm = geometry.loadedHeightMm / 2 - eccentricityYmm
  const compressionMarginXmm = geometry.loadedWidthMm / 2 - eccentricityXmm
  const upliftY =
    geometry.hasBearingStressGeometry &&
    hasMeaningfulBasePlateMoment(effectiveMomentXKnM) &&
    eccentricityYmm > kernYmm
  const upliftX =
    geometry.hasBearingStressGeometry &&
    hasMeaningfulBasePlateMoment(effectiveMomentYKnM) &&
    eccentricityXmm > kernXmm
  const majorUpliftY = upliftY && compressionMarginYmm <= 0
  const majorUpliftX = upliftX && compressionMarginXmm <= 0
  const bendingStressXMpa =
    hasBearingMoment && geometry.hasBearingStressSection && geometry.sectionModulusX > 0
      ? (Math.abs(effectiveMomentXKnM) * 1_000_000) / geometry.sectionModulusX
      : 0
  const bendingStressYMpa =
    hasBearingMoment && geometry.hasBearingStressSection && geometry.sectionModulusY > 0
      ? (Math.abs(effectiveMomentYKnM) * 1_000_000) / geometry.sectionModulusY
      : 0
  const upliftStressYMpa =
    upliftY && compressionMarginYmm > 0
      ? (2 * demandCompressionKn * 1000) /
        (3 * compressionMarginYmm * geometry.loadedWidthMm)
      : 0
  const upliftStressXMpa =
    upliftX && compressionMarginXmm > 0
      ? (2 * demandCompressionKn * 1000) /
        (3 * compressionMarginXmm * geometry.loadedHeightMm)
      : 0
  const contactLengthYmm =
    upliftY && compressionMarginYmm > 0
      ? Math.min(geometry.loadedHeightMm, 3 * compressionMarginYmm)
      : geometry.loadedHeightMm
  const contactLengthXmm =
    upliftX && compressionMarginXmm > 0
      ? Math.min(geometry.loadedWidthMm, 3 * compressionMarginXmm)
      : geometry.loadedWidthMm
  // uplift 路徑已包含軸壓項，這裡扣回 axial stress 避免與最後總合重複計入。
  const directionalStressYMpa = upliftY
    ? Math.max(0, upliftStressYMpa - axialStressMpa)
    : bendingStressXMpa
  const directionalStressXMpa = upliftX
    ? Math.max(0, upliftStressXMpa - axialStressMpa)
    : bendingStressYMpa
  const demandStressMpa =
    hasBearingMoment && geometry.hasBearingStressSection
      ? Math.max(0, axialStressMpa + directionalStressYMpa + directionalStressXMpa)
      : axialStressMpa

  return {
    demandCompressionKn,
    axialStressMpa,
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
    bendingStressXMpa,
    bendingStressYMpa,
    upliftStressYMpa,
    upliftStressXMpa,
    contactLengthYmm,
    contactLengthXmm,
    directionalStressYMpa,
    directionalStressXMpa,
    demandStressMpa,
  }
}

export function computeBasePlateStressState(
  layout: AnchorLayout,
  loads: LoadCase,
): BasePlateStressState {
  const geometry = computeBasePlateBearingGeometry(layout)
  const distribution = computeBasePlateStressDistribution(geometry, layout, loads)

  return {
    ...geometry,
    ...distribution,
  }
}
