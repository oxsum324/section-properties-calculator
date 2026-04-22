import type { AnchorLayout, AnchorPoint } from './domain'

export interface AnchorReinforcementOverlay {
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  label: string
}

export function getAnchorReinforcementOverlay(
  layout: AnchorLayout,
  anchorPoints: AnchorPoint[],
) {
  if (!layout.anchorReinforcementEnabled || anchorPoints.length === 0) {
    return null
  }

  const minX = Math.min(...anchorPoints.map((point) => point.x))
  const maxX = Math.max(...anchorPoints.map((point) => point.x))
  const minY = Math.min(...anchorPoints.map((point) => point.y))
  const maxY = Math.max(...anchorPoints.map((point) => point.y))
  const margin = Math.max(
    18,
    Math.min(
      layout.spacingXmm > 0 ? layout.spacingXmm / 5 : 30,
      layout.spacingYmm > 0 ? layout.spacingYmm / 5 : 30,
      42,
    ),
  )

  const x1 = Math.max(12, minX - margin)
  const x2 = Math.min(layout.concreteWidthMm - 12, maxX + margin)
  const y1 = Math.max(20, minY - margin)
  const y2 = Math.min(layout.concreteHeightMm - 20, maxY + margin)

  return {
    x1,
    y1,
    x2,
    y2,
    labelX: x1 + 8,
    labelY: Math.max(18, y1 - 8),
    label: `補強鋼筋 As=${Math.round(layout.anchorReinforcementAreaMm2)} fy=${Math.round(layout.anchorReinforcementYieldMpa)}`,
  } satisfies AnchorReinforcementOverlay
}
