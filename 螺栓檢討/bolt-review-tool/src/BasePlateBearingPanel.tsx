import type {
  AnchorLayout,
  BasePlateSectionType,
  BearingConfinementMode,
  ColumnSectionType,
  ProjectCase,
  UnitPreferences,
} from './domain'
import {
  getBasePlatePlanDimensions,
  getDerivedBasePlateCantilevers,
} from './basePlateGeometry'
import { formatQuantity } from './formatHelpers'
import { UnitNumberField } from './UnitNumberField'

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getBearingConfinementMode(
  layout: AnchorLayout,
): BearingConfinementMode {
  if (layout.basePlateConfinementMode === 'partial') {
    return 'partial'
  }
  if (
    layout.basePlateConfinementMode === 'full' ||
    layout.basePlateConfinedOnAllSides
  ) {
    return 'full'
  }
  return 'none'
}

function getBasePlateSectionType(
  layout: AnchorLayout,
): BasePlateSectionType {
  return layout.basePlateSectionType === 'custom' ? 'custom' : 'rectangle'
}

function columnSectionTypeLabel(type: ColumnSectionType) {
  switch (type) {
    case 'i_h':
      return 'I / H 形柱'
    case 'rect':
      return '矩形柱'
    case 'pipe':
      return '圓管 / 圓柱'
    case 'manual':
    default:
      return '手動輸入'
  }
}

/**
 * 基板承壓檢核面板（22.8 支承強度延伸 + AISC DG1 抗彎厚度工程擴充）：
 * A1 / A2 / b1 / h1 / B / N / Sx / Sy / 圍束模式 / 抗彎 tp / 鋼柱斷面 / lx-ly / 柱心偏移。
 *
 * 從 App.tsx 抽出（~384 行）；P1 拆分序列之一。
 */
export function BasePlateBearingPanel(props: {
  project: ProjectCase
  patchLayout: (patch: Partial<AnchorLayout>) => void
  simpleMode: boolean
  unitPreferences: UnitPreferences
  columnSectionType: ColumnSectionType
  applyDerivedBasePlateCantilevers: () => void
}) {
  const {
    project,
    patchLayout,
    simpleMode,
    unitPreferences,
    columnSectionType,
    applyDerivedBasePlateCantilevers,
  } = props
  const basePlatePlan = getBasePlatePlanDimensions(project.layout)
  const derivedBasePlateCantilevers = getDerivedBasePlateCantilevers(
    project.layout,
  )

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="baseplate"
      open={!simpleMode || project.layout.basePlateBearingEnabled}
    >
      <summary className="fold-summary">
        <span>基板承壓檢核</span>
        <small>22.8 支承強度延伸檢核</small>
      </summary>
      <div className="fold-stack">
        <label className="switch">
          <input
            type="checkbox"
            checked={project.layout.basePlateBearingEnabled}
            onChange={(event) =>
              patchLayout({ basePlateBearingEnabled: event.target.checked })
            }
          />
          <span>啟用基板下混凝土承壓檢核</span>
        </label>
        <label>
          偏心承壓斷面模數來源
          <select
            value={getBasePlateSectionType(project.layout)}
            onChange={(event) =>
              patchLayout({
                basePlateSectionType: event.target
                  .value as BasePlateSectionType,
              })
            }
          >
            <option value="rectangle">矩形承壓區自動計算 Sx / Sy</option>
            <option value="custom">自訂 Sx / Sy（非矩形基板）</option>
          </select>
        </label>
        <div className="field-grid compact-grid">
          <UnitNumberField
            label="A1 承壓面積"
            quantity="area"
            units={unitPreferences}
            value={project.layout.basePlateLoadedAreaMm2}
            onValueChange={(value) =>
              patchLayout({ basePlateLoadedAreaMm2: value ?? 0 })
            }
          />
          <UnitNumberField
            label="A2 支承面積"
            quantity="area"
            units={unitPreferences}
            value={project.layout.basePlateSupportAreaMm2}
            onValueChange={(value) =>
              patchLayout({ basePlateSupportAreaMm2: value ?? 0 })
            }
          />
          <UnitNumberField
            label="承壓面寬 b1"
            quantity="length"
            units={unitPreferences}
            value={project.layout.basePlateLoadedWidthMm ?? 0}
            onValueChange={(value) =>
              patchLayout({ basePlateLoadedWidthMm: value ?? 0 })
            }
          />
          <UnitNumberField
            label="承壓面高 h1"
            quantity="length"
            units={unitPreferences}
            value={project.layout.basePlateLoadedHeightMm ?? 0}
            onValueChange={(value) =>
              patchLayout({ basePlateLoadedHeightMm: value ?? 0 })
            }
          />
        </div>
        <div className="field-grid compact-grid">
          <UnitNumberField
            label="基板平面寬 B"
            quantity="length"
            units={unitPreferences}
            value={project.layout.basePlatePlanWidthMm ?? 0}
            onValueChange={(value) =>
              patchLayout({ basePlatePlanWidthMm: value ?? 0 })
            }
          />
          <UnitNumberField
            label="基板平面高 N"
            quantity="length"
            units={unitPreferences}
            value={project.layout.basePlatePlanHeightMm ?? 0}
            onValueChange={(value) =>
              patchLayout({ basePlatePlanHeightMm: value ?? 0 })
            }
          />
        </div>
        {getBasePlateSectionType(project.layout) === 'custom' ? (
          <div className="field-grid compact-grid">
            <label>
              <span className="label-row">
                <span>自訂 Sx</span>
                <span className="unit-chip">mm³</span>
              </span>
              <input
                type="number"
                min={0}
                step="1000"
                value={String(project.layout.basePlateSectionModulusXmm3 ?? 0)}
                onChange={(event) =>
                  patchLayout({
                    basePlateSectionModulusXmm3: parseNumber(
                      event.target.value.replaceAll(',', ''),
                    ),
                  })
                }
              />
            </label>
            <label>
              <span className="label-row">
                <span>自訂 Sy</span>
                <span className="unit-chip">mm³</span>
              </span>
              <input
                type="number"
                min={0}
                step="1000"
                value={String(project.layout.basePlateSectionModulusYmm3 ?? 0)}
                onChange={(event) =>
                  patchLayout({
                    basePlateSectionModulusYmm3: parseNumber(
                      event.target.value.replaceAll(',', ''),
                    ),
                  })
                }
              />
            </label>
          </div>
        ) : null}
        {(project.layout.basePlateLoadedWidthMm ?? 0) > 0 &&
        (project.layout.basePlateLoadedHeightMm ?? 0) > 0 ? (
          <div className="fold-stack compact-stack">
            <p className="helper-text">
              目前 `b1 × h1` 回推 A1 ={' '}
              {formatQuantity(
                (project.layout.basePlateLoadedWidthMm ?? 0) *
                  (project.layout.basePlateLoadedHeightMm ?? 0),
                'area',
                unitPreferences,
              )}
              。若 A1 留空，承壓模組會自動採這個值；若 A1 與此值不一致，結果會維持初篩提醒。
            </p>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  patchLayout({
                    basePlateLoadedAreaMm2:
                      (project.layout.basePlateLoadedWidthMm ?? 0) *
                      (project.layout.basePlateLoadedHeightMm ?? 0),
                  })
                }
              >
                由 b1 × h1 回填 A1
              </button>
            </div>
          </div>
        ) : null}
        <label>
          支承圍束條件
          <select
            value={getBearingConfinementMode(project.layout)}
            onChange={(event) => {
              const nextMode = event.target.value as BearingConfinementMode
              patchLayout({
                basePlateConfinementMode: nextMode,
                basePlateConfinedOnAllSides: nextMode === 'full',
              })
            }}
          >
            <option value="none">無圍束放大</option>
            <option value="partial">部分圍束（工程擴充，上限 1.5）</option>
            <option value="full">完整圍束（22.8.3.2，上限 2.0）</option>
          </select>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(
              project.layout.basePlateBearingMomentExternallyVerified,
            )}
            onChange={(event) =>
              patchLayout({
                basePlateBearingMomentExternallyVerified:
                  event.target.checked,
              })
            }
          />
          <span>若存在 Mx / My，已另行驗算偏心承壓分佈</span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={project.layout.basePlateBendingEnabled}
            onChange={(event) =>
              patchLayout({
                basePlateBendingEnabled: event.target.checked,
              })
            }
          />
          <span>啟用基板抗彎厚度檢核（AISC DG1 工程擴充）</span>
        </label>
        {project.layout.basePlateBendingEnabled ? (
          <div className="fold-stack compact-stack">
            <div className="field-grid compact-grid">
              <UnitNumberField
                label="基板實際厚度 tp"
                quantity="length"
                units={unitPreferences}
                value={project.layout.basePlateThicknessMm}
                onValueChange={(value) =>
                  patchLayout({ basePlateThicknessMm: value ?? 0 })
                }
              />
              <UnitNumberField
                label="基板鋼材 Fy"
                quantity="stress"
                units={unitPreferences}
                value={project.layout.basePlateSteelYieldMpa}
                onValueChange={(value) =>
                  patchLayout({ basePlateSteelYieldMpa: value ?? 0 })
                }
              />
              <UnitNumberField
                label="x 向懸臂長度 lx"
                quantity="length"
                units={unitPreferences}
                value={project.layout.basePlateCantileverXmm}
                onValueChange={(value) =>
                  patchLayout({ basePlateCantileverXmm: value ?? 0 })
                }
              />
              <UnitNumberField
                label="y 向懸臂長度 ly"
                quantity="length"
                units={unitPreferences}
                value={project.layout.basePlateCantileverYmm}
                onValueChange={(value) =>
                  patchLayout({ basePlateCantileverYmm: value ?? 0 })
                }
              />
            </div>
            <label>
              鋼柱斷面類型
              <select
                value={columnSectionType}
                onChange={(event) =>
                  patchLayout({
                    columnSectionType: event.target
                      .value as ColumnSectionType,
                  })
                }
              >
                <option value="manual">手動輸入 lx / ly</option>
                <option value="i_h">I / H 形柱</option>
                <option value="rect">矩形柱</option>
                <option value="pipe">圓管 / 圓柱</option>
              </select>
            </label>
            {columnSectionType !== 'manual' ? (
              <div className="field-grid compact-grid">
                <UnitNumberField
                  label={columnSectionType === 'pipe' ? '柱徑 d' : '柱深 d'}
                  quantity="length"
                  units={unitPreferences}
                  value={project.layout.columnDepthMm ?? 0}
                  onValueChange={(value) =>
                    patchLayout({ columnDepthMm: value ?? 0 })
                  }
                />
                <UnitNumberField
                  label={
                    columnSectionType === 'pipe'
                      ? '柱徑 / 寬度 b'
                      : '柱寬 / 翼緣寬 bf'
                  }
                  quantity="length"
                  units={unitPreferences}
                  value={project.layout.columnFlangeWidthMm ?? 0}
                  onValueChange={(value) =>
                    patchLayout({ columnFlangeWidthMm: value ?? 0 })
                  }
                />
              </div>
            ) : null}
            <div className="field-grid compact-grid">
              <UnitNumberField
                label="柱心偏移 ex"
                quantity="length"
                units={unitPreferences}
                value={project.layout.columnCentroidOffsetXmm ?? 0}
                optional
                onValueChange={(value) =>
                  patchLayout({ columnCentroidOffsetXmm: value ?? 0 })
                }
              />
              <UnitNumberField
                label="柱心偏移 ey"
                quantity="length"
                units={unitPreferences}
                value={project.layout.columnCentroidOffsetYmm ?? 0}
                optional
                onValueChange={(value) =>
                  patchLayout({ columnCentroidOffsetYmm: value ?? 0 })
                }
              />
            </div>
            {derivedBasePlateCantilevers ? (
              <div className="fold-stack compact-stack">
                <p className="helper-text">
                  目前可由 {columnSectionTypeLabel(columnSectionType)} 自動推算：{' '}
                  {`m = ${formatQuantity(derivedBasePlateCantilevers.mMm, 'length', unitPreferences)}，n = ${formatQuantity(derivedBasePlateCantilevers.nMm, 'length', unitPreferences)}，λn' = ${formatQuantity(derivedBasePlateCantilevers.lambdaPrimeMm, 'length', unitPreferences)}，建議 lx = ${formatQuantity(derivedBasePlateCantilevers.xMm, 'length', unitPreferences)}，ly = ${formatQuantity(derivedBasePlateCantilevers.yMm, 'length', unitPreferences)}`}
                  。
                  {basePlatePlan.source === 'loaded_area'
                    ? ' 目前 B / N 尚未另填，暫以 b1 / h1 作為基板平面尺寸推算。'
                    : ''}
                </p>
                <div className="action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={applyDerivedBasePlateCantilevers}
                  >
                    由柱斷面回填 lx / ly
                  </button>
                </div>
              </div>
            ) : null}
            <p className="helper-text">
              `lx / ly` 請輸入從鋼柱受壓邊或控制面到基板自由邊的懸臂長度，工具會取
              `l = max(lx, ly)` 計算 `tp,min`。這一列屬 AISC DG1 工程擴充，不是第 17 章原始條文公式。
            </p>
            <p className="helper-text">
              若輸入柱心偏移 `ex / ey`，工具會把軸壓 `N &lt; 0` 轉成附加彎矩
              `ΔMy = N × ex`、`ΔMx = N × ey` 並併入基板承壓與基板抗彎檢核。
            </p>
          </div>
        ) : null}
        <p className="helper-text">
          本模組目前以分析載重中的負拉力 `N &lt; 0` 作為軸向壓力需求，未納入基板偏心壓力分佈。`φ = 0.65`
          由規範 profile 固定提供；若有 `Mx / My` 且已填 `b1 / h1`，工具會改用 `σ = N/A + Mx/Sx + My/Sy`
          的保守偏心承壓應力檢核。
        </p>
        {getBasePlateSectionType(project.layout) === 'custom' ? (
          <p className="helper-text">
            目前採 `自訂 Sx / Sy` 路徑。`b1 / h1` 仍用來回推 A1、判讀 kern 與 uplift，
            `Sx / Sy` 則請依實際基板幾何以 `mm³` 輸入；未填齊時，存在 `Mx / My`
            的承壓結果會維持資料不足。
          </p>
        ) : (
          <p className="helper-text">
            若採 `b1 / h1` 進入偏心承壓應力模式，工具目前假設承壓區為矩形並以 `Sx / Sy`
            矩形斷面計算；非矩形基板或局部接觸形狀請切到 `自訂 Sx / Sy`
            或另按實際幾何覆核。
          </p>
        )}
      </div>
    </details>
  )
}
