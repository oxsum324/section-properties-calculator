import type { AnchorLayout, ProjectCase, UnitPreferences } from './domain'
import { UnitNumberField } from './UnitNumberField'

/**
 * 錨栓補強鋼筋路徑面板（17.5.2.1(d) / φ = 0.75）：
 * 啟用後可用補強鋼筋強度替代混凝土拉破或剪破強度；含 4 個前提條件 checkbox
 * （0.5ca1 內 / 每支至少 1 根 / 拉力伸展覆核 / 剪力伸展覆核）。
 *
 * 從 App.tsx 抽出（~97 行）；P1 拆分序列之一。
 */
export function AnchorReinforcementPanel(props: {
  project: ProjectCase
  patchLayout: (patch: Partial<AnchorLayout>) => void
  unitPreferences: UnitPreferences
  simpleMode: boolean
}) {
  const { project, patchLayout, unitPreferences, simpleMode } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="baseplate"
      open={!simpleMode || project.layout.anchorReinforcementEnabled}
    >
      <summary className="fold-summary">
        <span>錨栓補強鋼筋路徑</span>
        <small>17.5.2.1(d) / φ = 0.75</small>
      </summary>
      <div className="fold-stack">
        <label className="switch">
          <input
            type="checkbox"
            checked={project.layout.anchorReinforcementEnabled}
            onChange={(event) =>
              patchLayout({
                anchorReinforcementEnabled: event.target.checked,
              })
            }
          />
          <span>啟用錨栓補強鋼筋替代 breakout 路徑</span>
        </label>
        <div className="field-grid compact-grid">
          <UnitNumberField
            label="補強鋼筋總面積 As"
            quantity="area"
            units={unitPreferences}
            value={project.layout.anchorReinforcementAreaMm2}
            onValueChange={(value) =>
              patchLayout({ anchorReinforcementAreaMm2: value ?? 0 })
            }
          />
          <UnitNumberField
            label="補強鋼筋 fy"
            quantity="stress"
            units={unitPreferences}
            value={project.layout.anchorReinforcementYieldMpa}
            onValueChange={(value) =>
              patchLayout({ anchorReinforcementYieldMpa: value ?? 0 })
            }
          />
        </div>
        <div className="switch-grid">
          <label className="switch">
            <input
              type="checkbox"
              checked={project.layout.anchorReinforcementWithinHalfCa1}
              onChange={(event) =>
                patchLayout({
                  anchorReinforcementWithinHalfCa1: event.target.checked,
                })
              }
            />
            <span>補強鋼筋位於 0.5ca1 範圍內</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={
                project.layout.anchorReinforcementIntersectsEachAnchor
              }
              onChange={(event) =>
                patchLayout({
                  anchorReinforcementIntersectsEachAnchor:
                    event.target.checked,
                })
              }
            />
            <span>每支錨栓至少 1 根鋼筋與破壞面相交</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={
                project.layout.anchorReinforcementDevelopedForTension
              }
              onChange={(event) =>
                patchLayout({
                  anchorReinforcementDevelopedForTension:
                    event.target.checked,
                })
              }
            />
            <span>已覆核拉力 failure plane 兩側第25章伸展</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={project.layout.anchorReinforcementDevelopedForShear}
              onChange={(event) =>
                patchLayout({
                  anchorReinforcementDevelopedForShear: event.target.checked,
                })
              }
            />
            <span>已覆核剪力 failure plane 兩側第25章伸展</span>
          </label>
        </div>
        <p className="helper-text">
          依 17.5.2.1(d) 與 17.5.2.1.1，這裡的 As 指錨栓群周圍有效補強鋼筋總面積。若補強鋼筋跨越潛在破壞面、位於 0.5ca1 內、每支錨栓至少有 1 根鋼筋相交且已依第25章完成伸展覆核，可用 φ = 0.75 的鋼筋強度取代混凝土拉破或剪破強度。
        </p>
      </div>
    </details>
  )
}
