import { useMemo, useState } from 'react'
import { evaluateProject } from './calc'
import type {
  AnchorProduct,
  ProjectCase,
  RuleProfile,
  UnitPreferences,
} from './domain'
import {
  formatNumber,
  formatQuantity,
  getGoverningDcr,
} from './formatHelpers'

/**
 * 敏感度分析面板：對 4 個關鍵輸入做 ±20% / ±10% 微擾，回傳對應 DCR 變化。
 * 讓使用者快速看到「再加 hef 10%、邊距 10%、減載 10% 會變成多少」，
 * 直接服務於補強設計的優化判斷。
 *
 * 從 App.tsx 抽出（~230 行）；無 App 內部狀態相依，純依 props 計算。
 */
export function SensitivityPanel(props: {
  project: ProjectCase
  selectedProduct: AnchorProduct
  activeRuleProfile: RuleProfile
  unitPreferences: UnitPreferences
  simpleMode: boolean
  baselineDcr: number
}) {
  const {
    project,
    selectedProduct,
    activeRuleProfile,
    unitPreferences,
    simpleMode,
    baselineDcr,
  } = props
  const [enabled, setEnabled] = useState(false)

  const variations = useMemo<
    Array<{
      axis: string
      label: string
      symbol: string
      baseline: number
      quantity: 'force' | 'length'
      perturb: (project: ProjectCase, factor: number) => ProjectCase
    }>
  >(() => {
    return [
      {
        axis: 'load',
        label: '設計拉力 N',
        symbol: 'N',
        baseline: project.loads.tensionKn,
        quantity: 'force',
        perturb: (p, factor) => ({
          ...p,
          loads: { ...p.loads, tensionKn: p.loads.tensionKn * factor },
        }),
      },
      {
        axis: 'shear',
        label: '設計剪力 V（同比例）',
        symbol: 'V',
        baseline: Math.hypot(project.loads.shearXKn, project.loads.shearYKn),
        quantity: 'force',
        perturb: (p, factor) => ({
          ...p,
          loads: {
            ...p.loads,
            shearXKn: p.loads.shearXKn * factor,
            shearYKn: p.loads.shearYKn * factor,
          },
        }),
      },
      {
        axis: 'hef',
        label: '有效埋置 hef',
        symbol: 'hef',
        baseline: project.layout.effectiveEmbedmentMm,
        quantity: 'length',
        perturb: (p, factor) => ({
          ...p,
          layout: {
            ...p.layout,
            effectiveEmbedmentMm: p.layout.effectiveEmbedmentMm * factor,
          },
        }),
      },
      {
        axis: 'edge',
        label: '邊距 ca（四側同比例）',
        symbol: 'ca',
        baseline: Math.min(
          project.layout.edgeLeftMm,
          project.layout.edgeRightMm,
          project.layout.edgeBottomMm,
          project.layout.edgeTopMm,
        ),
        quantity: 'length',
        perturb: (p, factor) => ({
          ...p,
          layout: {
            ...p.layout,
            edgeLeftMm: p.layout.edgeLeftMm * factor,
            edgeRightMm: p.layout.edgeRightMm * factor,
            edgeBottomMm: p.layout.edgeBottomMm * factor,
            edgeTopMm: p.layout.edgeTopMm * factor,
          },
        }),
      },
    ]
  }, [project])

  const factors = useMemo(() => [-0.2, -0.1, 0.1, 0.2], []) // ±10%、±20%

  const matrix = useMemo(() => {
    if (!enabled) {
      return null
    }
    return variations.map((variation) => {
      const cells = factors.map((delta) => {
        const factor = 1 + delta
        const perturbed = variation.perturb(project, factor)
        try {
          const review = evaluateProject(
            perturbed,
            selectedProduct,
            activeRuleProfile,
          )
          const dcr = getGoverningDcr(review.summary)
          const newValue = variation.baseline * factor
          return { delta, factor, dcr, newValue, ok: dcr <= 1 }
        } catch {
          return {
            delta,
            factor,
            dcr: Number.NaN,
            newValue: Number.NaN,
            ok: false,
          }
        }
      })
      return { variation, cells }
    })
  }, [enabled, variations, factors, project, selectedProduct, activeRuleProfile])

  return (
    <details
      className="fold-panel sub-panel sensitivity-panel"
      data-shows="result"
      open={enabled}
      onToggle={(event) => {
        const isOpen = (event.target as HTMLDetailsElement).open
        setEnabled(isOpen)
      }}
    >
      <summary className="fold-summary">
        <span>敏感度分析</span>
        <small>
          {simpleMode
            ? '按 ±10% / ±20% 微擾後 DCR 變化'
            : '展開此區會額外跑 16 次評估；4 個參數 × 4 個變化（±10%、±20%）'}
        </small>
      </summary>
      <div className="fold-stack">
        {!matrix ? (
          <p className="helper-text">
            展開後會以目前案例為基準，分別微擾 N / V / hef / ca 邊距各
            ±10% 與 ±20%，並以新數據重算控制 DCR；用於補強設計或變更案的快速試算。
          </p>
        ) : (
          <>
            <p className="helper-text">
              基準控制 DCR ={' '}
              <strong>{formatNumber(baselineDcr)}</strong>。
              下表顯示各參數變動後的新 DCR；
              標 ✓ 表示通過、✗ 表示超過 1.0。
            </p>
            <table className="data-table compact-table sensitivity-table">
              <thead>
                <tr>
                  <th>參數</th>
                  <th>基準</th>
                  {factors.map((delta) => (
                    <th key={`hd-${delta}`}>
                      {delta > 0
                        ? `+${(delta * 100).toFixed(0)}%`
                        : `${(delta * 100).toFixed(0)}%`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map(({ variation, cells }) => (
                  <tr key={variation.axis}>
                    <td>
                      <div className="table-mode">
                        <strong>{variation.label}</strong>
                        <small>
                          {formatQuantity(
                            variation.baseline,
                            variation.quantity,
                            unitPreferences,
                          )}
                        </small>
                      </div>
                    </td>
                    <td className="sensitivity-baseline">
                      <code>{formatNumber(baselineDcr)}</code>
                    </td>
                    {cells.map((cell) => (
                      <td
                        key={`${variation.axis}-${cell.delta}`}
                        className={`sensitivity-cell sensitivity-${
                          !Number.isFinite(cell.dcr)
                            ? 'na'
                            : cell.dcr > 1
                              ? 'fail'
                              : cell.dcr >= 0.85
                                ? 'warn'
                                : 'pass'
                        }`}
                        title={`${variation.symbol} = ${formatQuantity(
                          cell.newValue,
                          variation.quantity,
                          unitPreferences,
                        )} → DCR ${formatNumber(cell.dcr)}`}
                      >
                        <strong>{formatNumber(cell.dcr)}</strong>
                        <span>
                          {cell.ok ? '✓' : Number.isFinite(cell.dcr) ? '✗' : '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="helper-text">
              注意：此處只重算控制 DCR，未重新檢視拉剪互制細項；用於設計優化方向參考，
              正式檢核仍以主畫面實際輸入為準。
            </p>
          </>
        )}
      </div>
    </details>
  )
}
