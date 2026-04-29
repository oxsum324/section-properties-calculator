import type { ProjectCase, ReviewResult, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'

/**
 * 錨栓力學分配面板：依群錨彈性分析（軸力均分 + 彎矩線性分擔）逐支列出
 * 位置 / 受拉受壓狀態 / 彈性軸力 / 採用拉力 / 平均剪力分擔。
 *
 * 從 App.tsx 抽出（~96 行）；P1 拆分序列之一。
 */
export function PerAnchorMechanicsPanel(props: {
  project: ProjectCase
  review: ReviewResult
  unitPreferences: UnitPreferences
}) {
  const { project, review, unitPreferences } = props
  const anchorMap = new Map(
    review.visualization.anchors.map((a) => [a.anchorId, a]),
  )
  const totalShear = Math.hypot(
    project.loads.shearXKn,
    project.loads.shearYKn,
  )
  const shearAnchorCount =
    project.loads.shearAnchorCount && project.loads.shearAnchorCount > 0
      ? project.loads.shearAnchorCount
      : Math.max(project.layout.anchorCountX, project.layout.anchorCountY)
  const sharePerAnchor =
    shearAnchorCount > 0 ? totalShear / shearAnchorCount : 0

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="result"
      open={false}
    >
      <summary className="fold-summary">
        <span>錨栓力學分配</span>
        <small>每支錨栓拉壓 / 剪力分擔（彈性分析）</small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          依群錨彈性分析（軸力均分 + 彎矩線性分擔）；正號為受拉、負號為受壓。
          平均剪力為 V_total / 受剪錨栓數，符合規範保守簡化。
        </p>
        <table className="data-table compact-table per-anchor-table">
          <thead>
            <tr>
              <th>錨栓</th>
              <th>位置 (x, y)</th>
              <th>狀態</th>
              <th>彈性軸力</th>
              <th>採用拉力 (≥ 0)</th>
              <th>分擔剪力</th>
            </tr>
          </thead>
          <tbody>
            {review.anchorPoints.map((point) => {
              const state = anchorMap.get(point.id)
              const elastic = state?.elasticTensionKn ?? 0
              const applied = state?.appliedTensionKn ?? 0
              const stateLabel =
                state?.state === 'tension'
                  ? '受拉'
                  : state?.state === 'compression'
                    ? '受壓'
                    : '中性'
              return (
                <tr key={`per-anchor-${point.id}`}>
                  <td>
                    <strong>{point.id}</strong>
                  </td>
                  <td>
                    <code>
                      ({formatQuantity(point.x, 'length', unitPreferences)},{' '}
                      {formatQuantity(point.y, 'length', unitPreferences)})
                    </code>
                  </td>
                  <td>
                    <span
                      className={`anchor-state-pill anchor-state-${
                        state?.state ?? 'neutral'
                      }`}
                    >
                      {stateLabel}
                    </span>
                  </td>
                  <td className={elastic < 0 ? 'force-negative' : ''}>
                    {elastic >= 0 ? '+' : ''}
                    {formatQuantity(elastic, 'force', unitPreferences)}
                  </td>
                  <td>
                    {formatQuantity(applied, 'force', unitPreferences)}
                  </td>
                  <td>
                    {formatQuantity(
                      sharePerAnchor,
                      'force',
                      unitPreferences,
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="helper-text">
          註：剪力分擔採用「平均到受剪錨栓」的常見保守做法；若實際以最不利錨栓單獨檢核，
          請於主畫面調整「受剪錨栓數」並重新核對。
        </p>
      </div>
    </details>
  )
}
