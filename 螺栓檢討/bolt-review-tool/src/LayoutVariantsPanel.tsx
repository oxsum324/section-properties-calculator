import type {
  AnchorLayout,
  ProjectLayoutVariant,
  UnitPreferences,
} from './domain'
import { formatQuantity } from './formatHelpers'

function formatLayoutVariantSummary(
  layout: AnchorLayout,
  units: UnitPreferences,
) {
  const anchorCount = layout.anchorCountX * layout.anchorCountY
  const minimumEdge = Math.min(
    layout.edgeLeftMm,
    layout.edgeRightMm,
    layout.edgeBottomMm,
    layout.edgeTopMm,
  )
  return [
    `${layout.anchorCountX} × ${layout.anchorCountY}（${anchorCount} 支）`,
    `hef ${formatQuantity(layout.effectiveEmbedmentMm, 'length', units)}`,
    `sx ${formatQuantity(layout.spacingXmm, 'length', units)}`,
    `sy ${formatQuantity(layout.spacingYmm, 'length', units)}`,
    `cmin ${formatQuantity(minimumEdge, 'length', units)}`,
  ].join(' / ')
}

/**
 * 候選配置比選面板：在主畫面維持單一幾何輸入的前提下，把目前配置存成候選；
 * 之後可套用回主畫面、以目前覆寫、複製、刪除。
 *
 * 從 App.tsx 抽出（~98 行）；P1 拆分序列之一。
 */
export function LayoutVariantsPanel(props: {
  candidateLayoutVariants: ProjectLayoutVariant[]
  simpleMode: boolean
  unitPreferences: UnitPreferences
  createLayoutVariantFromCurrent: () => void
  applyLayoutVariantSelection: (variantId: string) => void
  overwriteLayoutVariantFromCurrent: (variantId: string) => void
  duplicateLayoutVariant: (variantId: string) => void
  deleteLayoutVariant: (variantId: string) => void
  patchLayoutVariantMeta: (
    variantId: string,
    patch: Partial<ProjectLayoutVariant>,
  ) => void
}) {
  const {
    candidateLayoutVariants,
    simpleMode,
    unitPreferences,
    createLayoutVariantFromCurrent,
    applyLayoutVariantSelection,
    overwriteLayoutVariantFromCurrent,
    duplicateLayoutVariant,
    deleteLayoutVariant,
    patchLayoutVariantMeta,
  } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="member result"
      open={!simpleMode || candidateLayoutVariants.length > 0}
    >
      <summary className="fold-summary">
        <span>候選配置比選</span>
        <small>
          {candidateLayoutVariants.length + 1} 個配置（含目前配置）
        </small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          主畫面維持單一幾何輸入；可把目前配置存成候選，之後再套回來微調，並與其他配置一起比較。
        </p>
        <div className="action-row">
          <button type="button" onClick={createLayoutVariantFromCurrent}>
            加入目前配置為候選
          </button>
        </div>
        {candidateLayoutVariants.length > 0 ? (
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>幾何摘要</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {candidateLayoutVariants.map((variant) => (
                <tr key={variant.id}>
                  <td>
                    <input
                      value={variant.name}
                      onChange={(event) =>
                        patchLayoutVariantMeta(variant.id, {
                          name: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    {formatLayoutVariantSummary(
                      variant.layout,
                      unitPreferences,
                    )}
                  </td>
                  <td>
                    <input
                      value={variant.note ?? ''}
                      placeholder="例如邊距放大 / hef 變更"
                      onChange={(event) =>
                        patchLayoutVariantMeta(variant.id, {
                          note: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          applyLayoutVariantSelection(variant.id)
                        }
                      >
                        套用
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          overwriteLayoutVariantFromCurrent(variant.id)
                        }
                      >
                        以目前覆寫
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => duplicateLayoutVariant(variant.id)}
                      >
                        複製
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => deleteLayoutVariant(variant.id)}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="helper-text">
            目前尚未建立候選配置；可先把現在這組幾何存成候選，再修改主畫面繼續比較。
          </p>
        )}
      </div>
    </details>
  )
}
