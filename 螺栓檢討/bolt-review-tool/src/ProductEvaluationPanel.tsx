import { useState } from 'react'
import type { AnchorProduct, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'
import { UnitNumberField } from './UnitNumberField'

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

type PlateShape = 'square' | 'circle' | 'hex_nut'

/**
 * 產品評估值面板：附板 / 錨頭尺寸 → A_brg 換算輔助；評估標準（ACI 355.2 / .4 / EAD / Manual）；
 * 後置錨栓分類（1/2/3）；裂縫條件；kc,uncr/kc,cr；最小邊距 / 間距 / 厚度；
 * 開裂 / 未開裂拉出 / 握裹強度；cac / cac,split。
 *
 * 從 App.tsx 抽出（~310 行）；A_brg helper 的 3 個輸入狀態下放至元件自管。
 */
export function ProductEvaluationPanel(props: {
  selectedProduct: AnchorProduct
  patchSelectedProduct: (patch: Partial<AnchorProduct>) => void
  patchSelectedProductEvaluation: (
    patch: Partial<AnchorProduct['evaluation']>,
  ) => void
  unitPreferences: UnitPreferences
  simpleMode: boolean
  setSaveMessage: (message: string) => void
}) {
  const {
    selectedProduct,
    patchSelectedProduct,
    patchSelectedProductEvaluation,
    unitPreferences,
    simpleMode,
    setSaveMessage,
  } = props
  const [plateHelperShape, setPlateHelperShape] = useState<PlateShape>('square')
  const [plateHelperSizeMm, setPlateHelperSizeMm] = useState(60)
  const [plateHelperDeductShank, setPlateHelperDeductShank] = useState(true)

  const da = selectedProduct.diameterMm ?? 0
  const s = Math.max(0, plateHelperSizeMm)
  let gross = 0
  if (plateHelperShape === 'square') {
    gross = s * s
  } else if (plateHelperShape === 'circle') {
    gross = (Math.PI / 4) * s * s
  } else {
    // 六角螺帽：A = 2·√3 · (s/2)² = (√3/2)·s²
    gross = (Math.sqrt(3) / 2) * s * s
  }
  const shank = plateHelperDeductShank ? (Math.PI / 4) * da * da : 0
  const aBrg = Math.max(0, gross - shank)

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="product"
      open={!simpleMode}
    >
      <summary className="fold-summary">
        <span>產品評估值</span>
        <small>評估標準、幾何限制、拉出 / 握裹值</small>
      </summary>
      <div className="plate-abrg-helper">
        <div className="plate-abrg-helper-title">
          <strong>附板 / 錨頭尺寸 → A_brg 換算輔助</strong>
          <small>附板錨栓（有頭螺栓）時填 A_brg；下方協助由附板幾何反算</small>
        </div>
        <div className="field-grid compact-grid">
          <label>
            附板型式
            <select
              value={plateHelperShape}
              onChange={(event) =>
                setPlateHelperShape(event.target.value as PlateShape)
              }
            >
              <option value="square">方形附板（邊長 a）</option>
              <option value="circle">圓形附板（直徑 D）</option>
              <option value="hex_nut">六角螺帽（對邊距 s）</option>
            </select>
          </label>
          <UnitNumberField
            label={
              plateHelperShape === 'square'
                ? '附板邊長 a'
                : plateHelperShape === 'circle'
                  ? '附板直徑 D'
                  : '螺帽對邊距 s'
            }
            quantity="length"
            units={unitPreferences}
            value={plateHelperSizeMm}
            onValueChange={(value) => setPlateHelperSizeMm(value ?? 0)}
          />
          <label className="switch">
            <input
              type="checkbox"
              checked={plateHelperDeductShank}
              onChange={(event) =>
                setPlateHelperDeductShank(event.target.checked)
              }
            />
            <span>扣除螺桿斷面積（da² π/4）</span>
          </label>
        </div>
        <div className="plate-abrg-preview">
          <span>毛面積 = {formatQuantity(gross, 'area', unitPreferences)}</span>
          <span>
            扣除螺桿 = {formatQuantity(shank, 'area', unitPreferences)}
          </span>
          <strong>
            A_brg = {formatQuantity(aBrg, 'area', unitPreferences)}
          </strong>
          <button
            type="button"
            disabled={aBrg <= 0}
            onClick={() => {
              patchSelectedProduct({ headBearingAreaMm2: aBrg })
              setSaveMessage(
                `已套用 A_brg = ${aBrg.toFixed(0)} mm²（${
                  plateHelperShape === 'square'
                    ? '方板'
                    : plateHelperShape === 'circle'
                      ? '圓板'
                      : '六角螺帽'
                }）`,
              )
            }}
          >
            套用到 A_brg
          </button>
        </div>
      </div>
      <div className="field-grid compact-grid">
        <UnitNumberField
          label="Abrg"
          quantity="area"
          units={unitPreferences}
          value={selectedProduct.headBearingAreaMm2}
          optional
          onValueChange={(value) =>
            patchSelectedProduct({ headBearingAreaMm2: value })
          }
        />
        <label>
          評估標準
          <select
            value={selectedProduct.evaluation.qualificationStandard ?? ''}
            onChange={(event) =>
              patchSelectedProductEvaluation({
                qualificationStandard: event.target.value
                  ? (event.target
                      .value as AnchorProduct['evaluation']['qualificationStandard'])
                  : undefined,
              })
            }
          >
            <option value="">未填</option>
            <option value="ACI_355_2">ACI 355.2</option>
            <option value="ACI_355_4">ACI 355.4</option>
            <option value="EAD_330232_00_0601">EAD 330232-00-0601</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label>
          後置錨栓分類
          <select
            value={selectedProduct.evaluation.anchorCategory ?? ''}
            onChange={(event) =>
              patchSelectedProductEvaluation({
                anchorCategory: event.target.value
                  ? (Number(event.target.value) as 1 | 2 | 3)
                  : undefined,
              })
            }
          >
            <option value="">未填</option>
            <option value="1">分類 1</option>
            <option value="2">分類 2</option>
            <option value="3">分類 3</option>
          </select>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={
              selectedProduct.evaluation.crackedConcreteQualified ?? false
            }
            onChange={(event) =>
              patchSelectedProductEvaluation({
                crackedConcreteQualified: event.target.checked,
              })
            }
          />
          <span>產品已覆核開裂混凝土</span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={
              selectedProduct.evaluation.uncrackedConcreteQualified ?? false
            }
            onChange={(event) =>
              patchSelectedProductEvaluation({
                uncrackedConcreteQualified: event.target.checked,
              })
            }
          />
          <span>產品已覆核未開裂混凝土</span>
        </label>
        <label>
          kc,uncr / kc,cr
          <input
            type="number"
            min="1"
            max="1.4"
            step="0.01"
            value={selectedProduct.evaluation.kcUncrackedRatio ?? ''}
            onChange={(event) =>
              patchSelectedProductEvaluation({
                kcUncrackedRatio: event.target.value
                  ? Math.min(
                      1.4,
                      Math.max(1, parseNumber(event.target.value, 1)),
                    )
                  : undefined,
              })
            }
          />
        </label>
        <UnitNumberField
          label="cmin"
          quantity="length"
          units={unitPreferences}
          value={selectedProduct.evaluation.minEdgeDistanceMm}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ minEdgeDistanceMm: value })
          }
        />
        <UnitNumberField
          label="smin"
          quantity="length"
          units={unitPreferences}
          value={selectedProduct.evaluation.minSpacingMm}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ minSpacingMm: value })
          }
        />
        <UnitNumberField
          label="hmin"
          quantity="length"
          units={unitPreferences}
          value={selectedProduct.evaluation.minThicknessMm}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ minThicknessMm: value })
          }
        />
        <UnitNumberField
          label="開裂拉出破壞強度"
          quantity="force"
          units={unitPreferences}
          value={selectedProduct.evaluation.crackedPulloutStrengthKn}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ crackedPulloutStrengthKn: value })
          }
        />
        <UnitNumberField
          label="未開裂拉出破壞強度"
          quantity="force"
          units={unitPreferences}
          value={selectedProduct.evaluation.uncrackedPulloutStrengthKn}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({
              uncrackedPulloutStrengthKn: value,
            })
          }
        />
        <UnitNumberField
          label="開裂握裹強度"
          quantity="stress"
          units={unitPreferences}
          value={selectedProduct.evaluation.crackedBondStressMpa}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ crackedBondStressMpa: value })
          }
        />
        <UnitNumberField
          label="未開裂握裹強度"
          quantity="stress"
          units={unitPreferences}
          value={selectedProduct.evaluation.uncrackedBondStressMpa}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ uncrackedBondStressMpa: value })
          }
        />
        <UnitNumberField
          label="臨界邊距 cac"
          quantity="length"
          units={unitPreferences}
          value={selectedProduct.evaluation.criticalEdgeDistanceMm}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({ criticalEdgeDistanceMm: value })
          }
        />
        <UnitNumberField
          label="劈裂臨界邊距 cac,split"
          quantity="length"
          units={unitPreferences}
          value={selectedProduct.evaluation.splittingCriticalEdgeDistanceMm}
          optional
          onValueChange={(value) =>
            patchSelectedProductEvaluation({
              splittingCriticalEdgeDistanceMm: value,
            })
          }
        />
      </div>
    </details>
  )
}
