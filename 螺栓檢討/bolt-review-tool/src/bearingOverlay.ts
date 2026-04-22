import type { AnchorLayout, LoadCase } from './domain'
import { computeBasePlateStressState } from './basePlateStressState'

export interface BearingOverlayRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface BasePlateBearingOverlay {
  loadedArea: BearingOverlayRect
  contactArea?: BearingOverlayRect
  label: string
  labelX: number
  labelY: number
  mode:
    | 'uniform'
    | 'uplift_x'
    | 'uplift_y'
    | 'uplift_xy'
    | 'major_uplift_x'
    | 'major_uplift_y'
    | 'major_uplift_xy'
}

export function getBasePlateBearingOverlay(
  layout: AnchorLayout,
  loads: LoadCase,
) {
  if (!layout.basePlateBearingEnabled) {
    return null
  }

  const stressState = computeBasePlateStressState(layout, loads)
  const {
    loadedWidthMm,
    loadedHeightMm,
    demandCompressionKn: demandKn,
    effectiveMomentXKnM,
    effectiveMomentYKnM,
    upliftY,
    upliftX,
    majorUpliftY,
    majorUpliftX,
    contactLengthYmm,
    contactLengthXmm,
  } = stressState
  if (loadedWidthMm <= 0 || loadedHeightMm <= 0) {
    return null
  }

  const loadedArea: BearingOverlayRect = {
    x1: (layout.concreteWidthMm - loadedWidthMm) / 2,
    y1: (layout.concreteHeightMm - loadedHeightMm) / 2,
    x2: (layout.concreteWidthMm + loadedWidthMm) / 2,
    y2: (layout.concreteHeightMm + loadedHeightMm) / 2,
  }
  if (demandKn <= 0) {
    return {
      loadedArea,
      contactArea: loadedArea,
      label: 'A1 承壓面 / 無壓力需求',
      labelX: loadedArea.x1 + 8,
      labelY: Math.max(18, loadedArea.y1 - 8),
      mode: 'uniform',
    } satisfies BasePlateBearingOverlay
  }

  if (majorUpliftX || majorUpliftY) {
    const majorMode: BasePlateBearingOverlay['mode'] =
      majorUpliftX && majorUpliftY
        ? 'major_uplift_xy'
        : majorUpliftX
          ? 'major_uplift_x'
          : 'major_uplift_y'
    const directionLabel =
      majorMode === 'major_uplift_xy'
        ? '雙向'
        : majorMode === 'major_uplift_x'
          ? 'x 向'
          : 'y 向'

    return {
      loadedArea,
      label: `A1 承壓面 / ${directionLabel} uplift 警示`,
      labelX: loadedArea.x1 + 8,
      labelY: Math.max(18, loadedArea.y1 - 8),
      mode: majorMode,
    } satisfies BasePlateBearingOverlay
  }

  let contactX1 = loadedArea.x1
  let contactX2 = loadedArea.x2
  let contactY1 = loadedArea.y1
  let contactY2 = loadedArea.y2

  if (upliftX) {
    const compressesLeft = effectiveMomentYKnM >= 0
    if (compressesLeft) {
      contactX2 = loadedArea.x1 + contactLengthXmm
    } else {
      contactX1 = loadedArea.x2 - contactLengthXmm
    }
  }

  if (upliftY) {
    const compressesBottom = effectiveMomentXKnM >= 0
    if (compressesBottom) {
      contactY1 = loadedArea.y2 - contactLengthYmm
    } else {
      contactY2 = loadedArea.y1 + contactLengthYmm
    }
  }

  const mode: BasePlateBearingOverlay['mode'] = upliftX
    ? upliftY
      ? 'uplift_xy'
      : 'uplift_x'
    : upliftY
      ? 'uplift_y'
      : 'uniform'

  return {
    loadedArea,
    contactArea: {
      x1: contactX1,
      y1: contactY1,
      x2: contactX2,
      y2: contactY2,
    },
    label:
      mode === 'uniform'
        ? 'A1 承壓面 / 接觸區'
        : `A1 承壓面 / 接觸區 ${Math.round(contactLengthXmm)}×${Math.round(contactLengthYmm)}`,
    labelX: loadedArea.x1 + 8,
    labelY: Math.max(18, loadedArea.y1 - 8),
    mode,
  } satisfies BasePlateBearingOverlay
}
