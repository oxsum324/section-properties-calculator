import type { LoadCasePresetInput, UnitPreferences } from './domain'
import { UnitNumberField } from './UnitNumberField'

type ComponentKey = keyof Pick<
  LoadCasePresetInput,
  'dead' | 'live' | 'earthquake'
>

const COMPONENT_DEFINITIONS: Array<{ key: ComponentKey; label: string }> = [
  { key: 'dead', label: '死載 D' },
  { key: 'live', label: '活載 L' },
  { key: 'earthquake', label: '地震分量 E' },
]

/**
 * 載重組合 Preset 卡網：D / L / E 三組件的 N / Vx / Vy / Mx / My 輸入。
 *
 * 從 App.tsx 抽出（~180 行 → ~110 行；3 張卡片以單一定義映射收斂）；
 * 純展示，依 props 驅動，不持有狀態。
 */
export function LoadPresetGrid(props: {
  loadPresetInput: LoadCasePresetInput
  unitPreferences: UnitPreferences
  patchLoadPresetComponent: (
    key: ComponentKey,
    patch: Partial<LoadCasePresetInput['dead']>,
  ) => void
}) {
  const { loadPresetInput, unitPreferences, patchLoadPresetComponent } = props

  return (
    <div className="preset-component-grid">
      {COMPONENT_DEFINITIONS.map(({ key, label }) => {
        const component = loadPresetInput[key]
        return (
          <section key={key} className="preset-card">
            <h4>{label}</h4>
            <div className="field-grid compact-grid">
              <UnitNumberField
                label="N"
                quantity="force"
                units={unitPreferences}
                value={component.tensionKn}
                onValueChange={(value) =>
                  patchLoadPresetComponent(key, { tensionKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="Vx"
                quantity="force"
                units={unitPreferences}
                value={component.shearXKn}
                onValueChange={(value) =>
                  patchLoadPresetComponent(key, { shearXKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="Vy"
                quantity="force"
                units={unitPreferences}
                value={component.shearYKn}
                onValueChange={(value) =>
                  patchLoadPresetComponent(key, { shearYKn: value ?? 0 })
                }
              />
              <UnitNumberField
                label="Mx"
                quantity="moment"
                units={unitPreferences}
                value={component.momentXKnM}
                onValueChange={(value) =>
                  patchLoadPresetComponent(key, { momentXKnM: value ?? 0 })
                }
              />
              <UnitNumberField
                label="My"
                quantity="moment"
                units={unitPreferences}
                value={component.momentYKnM}
                onValueChange={(value) =>
                  patchLoadPresetComponent(key, { momentYKnM: value ?? 0 })
                }
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}
