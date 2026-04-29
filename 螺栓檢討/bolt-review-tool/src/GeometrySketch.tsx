import type { ReviewResult, UnitPreferences } from './domain'
import { getAnchorReinforcementOverlay } from './anchorReinforcementOverlay'
import { getBasePlateBearingOverlay } from './bearingOverlay'
import { formatNumber, formatQuantity } from './formatHelpers'

/**
 * 錨栓配置 SVG 示意：混凝土平面、邊距高亮、A_Nc / A_Vc 投影、錨栓補強鋼筋、
 * A1 承壓 / 接觸承壓區、各錨栓拉壓 / 中性狀態。
 *
 * 從 App.tsx 抽出（~223 行）；純展示，無外部 callback。
 */
export function GeometrySketch({
  review,
  units,
}: {
  review: ReviewResult
  units: UnitPreferences
}) {
  const { project, anchorPoints } = review
  const { layout } = project
  const viewBox = `0 0 ${layout.concreteWidthMm} ${layout.concreteHeightMm}`
  const anchorStateMap = new Map(
    review.visualization.anchors.map((item) => [item.anchorId, item]),
  )
  const edgeLabelMap = new Map<string, string[]>()

  review.visualization.edges.forEach((item) => {
    const labels = edgeLabelMap.get(item.edge) ?? []
    if (!labels.includes(item.label)) {
      labels.push(item.label)
    }
    edgeLabelMap.set(item.edge, labels)
  })
  const anchorReinforcementOverlay = getAnchorReinforcementOverlay(
    layout,
    anchorPoints,
  )
  const basePlateBearingOverlay = getBasePlateBearingOverlay(
    layout,
    review.analysisLoads,
  )

  return (
    <svg className="geometry-sketch" viewBox={viewBox} role="img" aria-label="錨栓幾何示意">
      <rect
        x="0"
        y="0"
        width={layout.concreteWidthMm}
        height={layout.concreteHeightMm}
        rx="8"
        className="concrete-body"
      />

      {basePlateBearingOverlay ? (
        <g>
          <rect
            x={basePlateBearingOverlay.loadedArea.x1}
            y={basePlateBearingOverlay.loadedArea.y1}
            width={
              basePlateBearingOverlay.loadedArea.x2 -
              basePlateBearingOverlay.loadedArea.x1
            }
            height={
              basePlateBearingOverlay.loadedArea.y2 -
              basePlateBearingOverlay.loadedArea.y1
            }
            className="bearing-zone"
          />
          {basePlateBearingOverlay.contactArea ? (
            <rect
              x={basePlateBearingOverlay.contactArea.x1}
              y={basePlateBearingOverlay.contactArea.y1}
              width={
                basePlateBearingOverlay.contactArea.x2 -
                basePlateBearingOverlay.contactArea.x1
              }
              height={
                basePlateBearingOverlay.contactArea.y2 -
                basePlateBearingOverlay.contactArea.y1
              }
              className={`bearing-contact-zone bearing-contact-zone-${basePlateBearingOverlay.mode}`}
            />
          ) : null}
          <text
            x={basePlateBearingOverlay.labelX}
            y={basePlateBearingOverlay.labelY}
            className="bearing-overlay-label"
          >
            {basePlateBearingOverlay.label}
          </text>
        </g>
      ) : null}

      {review.visualization.rectangles.map((rectangle) => (
        <rect
          key={rectangle.id}
          x={rectangle.x1}
          y={rectangle.y1}
          width={rectangle.x2 - rectangle.x1}
          height={rectangle.y2 - rectangle.y1}
          className={`breakout-zone breakout-zone-${rectangle.kind}`}
        />
      ))}

      {anchorReinforcementOverlay ? (
        <g>
          <rect
            x={anchorReinforcementOverlay.x1}
            y={anchorReinforcementOverlay.y1}
            width={anchorReinforcementOverlay.x2 - anchorReinforcementOverlay.x1}
            height={anchorReinforcementOverlay.y2 - anchorReinforcementOverlay.y1}
            className="reinforcement-zone"
          />
          <line
            x1={anchorReinforcementOverlay.x1}
            y1={anchorReinforcementOverlay.y1}
            x2={anchorReinforcementOverlay.x2}
            y2={anchorReinforcementOverlay.y2}
            className="reinforcement-line"
          />
          <line
            x1={anchorReinforcementOverlay.x2}
            y1={anchorReinforcementOverlay.y1}
            x2={anchorReinforcementOverlay.x1}
            y2={anchorReinforcementOverlay.y2}
            className="reinforcement-line"
          />
          <text
            x={anchorReinforcementOverlay.labelX}
            y={anchorReinforcementOverlay.labelY}
            className="reinforcement-label"
          >
            {anchorReinforcementOverlay.label}
          </text>
        </g>
      ) : null}

      {Array.from(edgeLabelMap.entries()).map(([edge, labels]) => {
        if (edge === 'left') {
          return (
            <g key={edge}>
              <line x1="4" y1="0" x2="4" y2={layout.concreteHeightMm} className="edge-highlight" />
              <text x="12" y="22" className="edge-label">
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        if (edge === 'right') {
          return (
            <g key={edge}>
              <line
                x1={layout.concreteWidthMm - 4}
                y1="0"
                x2={layout.concreteWidthMm - 4}
                y2={layout.concreteHeightMm}
                className="edge-highlight"
              />
              <text
                x={layout.concreteWidthMm - 12}
                y="22"
                textAnchor="end"
                className="edge-label"
              >
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        if (edge === 'bottom') {
          return (
            <g key={edge}>
              <line
                x1="0"
                y1={layout.concreteHeightMm - 4}
                x2={layout.concreteWidthMm}
                y2={layout.concreteHeightMm - 4}
                className="edge-highlight"
              />
              <text x="12" y={layout.concreteHeightMm - 12} className="edge-label">
                {labels.join(' / ')}
              </text>
            </g>
          )
        }

        return (
          <g key={edge}>
            <line x1="0" y1="4" x2={layout.concreteWidthMm} y2="4" className="edge-highlight" />
            <text x="12" y="22" className="edge-label">
              {labels.join(' / ')}
            </text>
          </g>
        )
      })}

      {anchorPoints.map((point) => {
        const anchorState = anchorStateMap.get(point.id)
        const anchorClass =
          anchorState?.state === 'tension'
            ? 'anchor-node anchor-node-tension'
            : anchorState?.state === 'compression'
              ? 'anchor-node anchor-node-compression'
              : 'anchor-node anchor-node-neutral'

        return (
        <g key={point.id}>
          <circle cx={point.x} cy={point.y} r={10} className={anchorClass} />
          <circle cx={point.x} cy={point.y} r={3} className="anchor-center" />
          <text x={point.x} y={point.y - 16} textAnchor="middle" className="anchor-label">
            {point.id}
          </text>
          <text x={point.x} y={point.y + 24} textAnchor="middle" className="anchor-demand">
            {anchorState
              ? `${anchorState.elasticTensionKn >= 0 ? '+' : ''}${formatNumber(anchorState.elasticTensionKn)}`
              : '0'}
          </text>
        </g>
      )})}

      <text x="16" y="24" className="sketch-title">
        混凝土平面 / 活躍組合
      </text>
      <text x="16" y="46" className="sketch-legend">
        紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區
      </text>
      <text x="16" y={layout.concreteHeightMm - 14} className="sketch-meta">
        {formatQuantity(layout.concreteWidthMm, 'length', units)} × {formatQuantity(layout.concreteHeightMm, 'length', units)}
      </text>
    </svg>
  )
}
