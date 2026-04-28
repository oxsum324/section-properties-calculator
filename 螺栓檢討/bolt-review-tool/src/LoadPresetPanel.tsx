import type { LoadCasePresetInput, UnitPreferences } from './domain'
import { LoadPresetGrid } from './LoadPresetGrid'

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 載重組合 Preset 面板：D / L / E 組件輸入卡網（LoadPresetGrid）+ Ωo / Ωattachment +
 * 「附加 / 覆蓋」按鈕 + Excel / CSV 貼上匯入子面板。
 *
 * 從 App.tsx 抽出（~127 行）；P1 拆分序列之一。
 */
export function LoadPresetPanel(props: {
  loadPresetInput: LoadCasePresetInput
  unitPreferences: UnitPreferences
  simpleMode: boolean
  patchLoadPresetComponent: (
    key: keyof Pick<LoadCasePresetInput, 'dead' | 'live' | 'earthquake'>,
    patch: Partial<LoadCasePresetInput['dead']>,
  ) => void
  patchLoadPresetInput: (patch: Partial<LoadCasePresetInput>) => void
  applyLoadCasePreset: (mode: 'append' | 'replace') => Promise<void> | void
  copyLoadCaseHeaderRow: () => Promise<void> | void
  loadCasePasteText: string
  setLoadCasePasteText: (text: string) => void
  importPastedLoadCases: (
    mode: 'append' | 'replace',
  ) => Promise<void> | void
  loadCaseDelimitedHeaderRow: string
  loadCaseDelimitedExampleRow: string
}) {
  const {
    loadPresetInput,
    unitPreferences,
    simpleMode,
    patchLoadPresetComponent,
    patchLoadPresetInput,
    applyLoadCasePreset,
    copyLoadCaseHeaderRow,
    loadCasePasteText,
    setLoadCasePasteText,
    importPastedLoadCases,
    loadCaseDelimitedHeaderRow,
    loadCaseDelimitedExampleRow,
  } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="loads"
      data-loads-advanced="1"
      open={!simpleMode}
    >
      <summary className="fold-summary">
        <span>載重組合 Preset</span>
        <small>D / L / E 一鍵展開常用組合</small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          輸入死載 D、活載 L、地震分量 E 的 N / V / M 組件後，可一鍵產生
          `1.2D+1.6L`、`1.2D±1.0E+1.0L`、`0.9D±1.0E`、`1.2D±ΩoE+1.0L`
          、`0.9D±ΩoE`，若有填 `Ωattachment` 也會加上對應的
          `ΩattachmentE` 組合。產生出的組合視為已明確組合之設計載重，
          會自動清空 17.10 額外地震入口欄位，避免重複放大。
        </p>
        <LoadPresetGrid
          loadPresetInput={loadPresetInput}
          unitPreferences={unitPreferences}
          patchLoadPresetComponent={patchLoadPresetComponent}
        />
        <div className="field-grid compact-grid">
          <label>
            <span className="label-row">
              <span>Ωo</span>
            </span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={loadPresetInput.overstrengthFactor}
              onChange={(event) =>
                patchLoadPresetInput({
                  overstrengthFactor: Math.max(
                    1,
                    parseNumber(event.target.value, 1),
                  ),
                })
              }
            />
          </label>
          <label>
            <span className="label-row">
              <span>Ωattachment</span>
            </span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={loadPresetInput.attachmentOverstrengthFactor}
              onChange={(event) =>
                patchLoadPresetInput({
                  attachmentOverstrengthFactor: Math.max(
                    1,
                    parseNumber(event.target.value, 1),
                  ),
                })
              }
            />
          </label>
        </div>
        <div className="action-row preset-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void applyLoadCasePreset('append')}
          >
            附加 Preset 組合
          </button>
          <button
            type="button"
            onClick={() => void applyLoadCasePreset('replace')}
          >
            覆蓋目前組合
          </button>
        </div>
        <details className="fold-panel sub-panel" data-shows="loads">
          <summary className="fold-summary">
            <span>Excel / CSV 貼上匯入</span>
            <small>支援從 Excel 直接複製整塊表格貼上</small>
          </summary>
          <div className="fold-stack">
            <p className="helper-text">
              可直接從 Excel 複製含欄名的整塊表格貼到下方，工具會自動辨識
              `Tab` 或 `CSV` 分隔。欄位固定使用內部單位 `kN / kN-m / mm`。
            </p>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void copyLoadCaseHeaderRow()
                }}
              >
                複製欄名
              </button>
            </div>
            <label>
              貼上表格內容
              <textarea
                rows={8}
                value={loadCasePasteText}
                onChange={(event) => setLoadCasePasteText(event.target.value)}
                placeholder={`${loadCaseDelimitedHeaderRow}\n${loadCaseDelimitedExampleRow}`}
              />
            </label>
            <div className="action-row preset-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void importPastedLoadCases('append')}
              >
                貼上內容附加
              </button>
              <button
                type="button"
                onClick={() => void importPastedLoadCases('replace')}
              >
                貼上內容覆蓋
              </button>
            </div>
          </div>
        </details>
      </div>
    </details>
  )
}
