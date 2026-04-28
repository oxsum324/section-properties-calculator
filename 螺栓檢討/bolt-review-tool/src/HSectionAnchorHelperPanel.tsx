import { useState } from 'react'
import type { AnchorLayout, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'
import { UnitNumberField } from './UnitNumberField'

/**
 * H 型鋼周邊錨栓配置輔助：依翼板寬度 bf、柱深 hc、每翼板螺栓數 n_f 與腹板每側 n_w，
 * 近似為「外接矩形 n_f × (2 + n_w)」配置；計算 sx · sy · 排列模式（grid / perimeter）
 * 並提供「套用到配置」按鈕。
 *
 * 從 App.tsx 抽出（~155 行；H 段參數狀態自管，不再透過 props 傳）。
 */
export function HSectionAnchorHelperPanel(props: {
  unitPreferences: UnitPreferences
  patchLayout: (patch: Partial<AnchorLayout>) => void
  setSaveMessage: (message: string) => void
}) {
  const { unitPreferences, patchLayout, setSaveMessage } = props
  const [hSectionBfMm, setHSectionBfMm] = useState(300)
  const [hSectionHcMm, setHSectionHcMm] = useState(300)
  const [hSectionFlangeEdgeMm, setHSectionFlangeEdgeMm] = useState(50)
  const [hSectionWebEdgeMm, setHSectionWebEdgeMm] = useState(50)
  const [hSectionAnchorsPerFlange, setHSectionAnchorsPerFlange] = useState(2)
  const [hSectionAnchorsPerWebSide, setHSectionAnchorsPerWebSide] = useState(0)

  const nf = Math.max(2, hSectionAnchorsPerFlange)
  const nw = Math.max(0, hSectionAnchorsPerWebSide)
  // X 方向螺栓數 = 翼板螺栓數（翼板本身就是 X 方向全部位置）
  const nxNew = nf
  // Y 方向螺栓數 = 2（翼板）+ 腹板每側 n_w 支（共 2·n_w 支）
  const nyNew = 2 + nw
  const sx =
    nxNew > 1
      ? Math.max(
          0,
          (hSectionBfMm - 2 * hSectionFlangeEdgeMm) / (nxNew - 1),
        )
      : 0
  const syOuter = Math.max(0, hSectionHcMm + 2 * hSectionWebEdgeMm)
  const sy = nyNew > 1 ? syOuter / (nyNew - 1) : 0
  // 用 perimeter 型式：只保留外框（腹板中間沒螺栓時）
  // nw=0 時等同於 grid（nx × 2），無差異
  const patternNew: 'grid' | 'perimeter' =
    nw > 0 && nxNew >= 3 ? 'perimeter' : 'grid'
  const totalCount =
    patternNew === 'perimeter'
      ? 2 * nxNew + 2 * (nyNew - 2)
      : nxNew * nyNew

  return (
    <details
      className="fold-panel sub-panel h-section-helper"
      data-shows="member"
      open={false}
    >
      <summary className="fold-summary">
        <span>H 型鋼周邊錨栓配置輔助</span>
        <small>翼板 / 柱深 / 每翼板螺栓數 → 自動算 sx · sy · 邊距</small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          H 型鋼柱腳典型為錨栓沿翼板周邊配置，非規則網格。
          以下依 <strong>翼板寬度 bf</strong>、<strong>柱深 hc</strong>、
          <strong>每翼板螺栓數 n_f</strong> 近似為「外接矩形 n_f × 2」網格：
          sx = (bf − 2·e_f) / (n_f − 1)、sy = hc + 2·e_w。
          僅適用於對稱配置；若翼板兩側螺栓數不同或含腹板螺栓請另外處理。
        </p>
        <div className="field-grid compact-grid">
          <UnitNumberField
            label="翼板寬度 bf"
            quantity="length"
            units={unitPreferences}
            value={hSectionBfMm}
            onValueChange={(value) => setHSectionBfMm(value ?? 0)}
          />
          <UnitNumberField
            label="柱深 hc"
            quantity="length"
            units={unitPreferences}
            value={hSectionHcMm}
            onValueChange={(value) => setHSectionHcMm(value ?? 0)}
          />
          <UnitNumberField
            label="翼板外緣到螺栓中心 e_f"
            quantity="length"
            units={unitPreferences}
            value={hSectionFlangeEdgeMm}
            onValueChange={(value) => setHSectionFlangeEdgeMm(value ?? 0)}
          />
          <UnitNumberField
            label="柱外緣到螺栓中心 e_w"
            quantity="length"
            units={unitPreferences}
            value={hSectionWebEdgeMm}
            onValueChange={(value) => setHSectionWebEdgeMm(value ?? 0)}
          />
          <label>
            每翼板螺栓數 n_f
            <select
              value={hSectionAnchorsPerFlange}
              onChange={(event) =>
                setHSectionAnchorsPerFlange(
                  Number(event.target.value) || 2,
                )
              }
            >
              <option value={2}>2（角點）</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label>
            腹板每側螺栓數 n_w
            <select
              value={hSectionAnchorsPerWebSide}
              onChange={(event) =>
                setHSectionAnchorsPerWebSide(
                  Number(event.target.value) || 0,
                )
              }
              title="腹板方向（柱深方向）兩側各插幾支螺栓（不含翼板端點）"
            >
              <option value={0}>0（只在翼板）</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>
        <div className="h-section-preview">
          <div className="h-section-metrics">
            <span>X 方向 {nxNew} 支 · Y 方向 {nyNew} 支</span>
            <span>排列 = {patternNew === 'perimeter' ? '只外框' : '全網格'}</span>
            <span>sx = {formatQuantity(sx, 'length', unitPreferences)}</span>
            <span>sy = {formatQuantity(sy, 'length', unitPreferences)}</span>
            <span>錨栓總數 = {totalCount}</span>
            <span>
              外接矩形 ={' '}
              {formatQuantity(hSectionBfMm, 'length', unitPreferences)} ×{' '}
              {formatQuantity(syOuter, 'length', unitPreferences)}
            </span>
          </div>
          <div className="action-row">
            <button
              type="button"
              disabled={
                hSectionBfMm <= 0 ||
                hSectionHcMm <= 0 ||
                sx < 0 ||
                sy <= 0
              }
              onClick={() => {
                patchLayout({
                  anchorCountX: nxNew,
                  anchorCountY: nyNew,
                  spacingXmm: sx,
                  spacingYmm: sy,
                  anchorLayoutPattern: patternNew,
                })
                setSaveMessage(
                  `已套用 H 型鋼周邊配置：${nxNew}×${nyNew}${
                    patternNew === 'perimeter' ? '（外框）' : ''
                  } 共 ${totalCount} 支`,
                )
              }}
            >
              套用到配置
            </button>
            <span className="helper-text" style={{ margin: 0 }}>
              nx×ny 寫入錨栓列數；當腹板側有螺栓時自動切到「只外框」排列。
              邊距請另行檢視。
            </span>
          </div>
        </div>
      </div>
    </details>
  )
}
