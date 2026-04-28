import type { ReportMode, ReportSettings } from './domain'
import {
  CURRENT_APP_BUILD_TIME,
  CURRENT_CALC_ENGINE_VERSION,
  ENGINEERING_USE_DISCLAIMER,
} from './appMeta'
import { formatDateTime } from './formatHelpers'

const LOGO_MAX_BYTES = 200 * 1024

/**
 * 報表設定面板：公司 / 案號 / 設計 / 校核 / 發行日 / 輸出模式 / LOGO（≤ 200 KB）。
 *
 * 從 App.tsx 抽出（~140 行）；P1 拆分序列之一。
 */
export function ReportSettingsPanel(props: {
  reportSettings: ReportSettings
  patchReport: (patch: Partial<ReportSettings>) => void
  setSaveMessage: (message: string) => void
  simpleMode: boolean
}) {
  const { reportSettings, patchReport, setSaveMessage, simpleMode } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="report"
      open={!simpleMode}
    >
      <summary className="fold-summary">
        <span>報表設定</span>
        <small>公司、案號、設計 / 校核與輸出模式</small>
      </summary>
      <div className="field-grid">
        <label>
          公司 / 單位
          <input
            value={reportSettings.companyName}
            placeholder="例如 XX 結構技師事務所"
            onChange={(event) =>
              patchReport({ companyName: event.target.value })
            }
          />
        </label>
        <label>
          案號 / 專案代碼
          <input
            value={reportSettings.projectCode}
            placeholder="例如 P-2026-014"
            onChange={(event) =>
              patchReport({ projectCode: event.target.value })
            }
          />
        </label>
        <label>
          設計者
          <input
            value={reportSettings.designer}
            placeholder="例如 王大明"
            onChange={(event) =>
              patchReport({ designer: event.target.value })
            }
          />
        </label>
        <label>
          校核者
          <input
            value={reportSettings.checker}
            placeholder="例如 李小華"
            onChange={(event) => patchReport({ checker: event.target.value })}
          />
        </label>
        <label>
          發行日期
          <input
            type="date"
            value={reportSettings.issueDate}
            onChange={(event) =>
              patchReport({ issueDate: event.target.value })
            }
          />
        </label>
        <label>
          輸出模式
          <select
            value={reportSettings.reportMode}
            onChange={(event) =>
              patchReport({ reportMode: event.target.value as ReportMode })
            }
          >
            <option value="full">完整明細版</option>
            <option value="summary">摘要版</option>
          </select>
        </label>
      </div>
      <div className="report-logo-row">
        {reportSettings.companyLogoDataUrl ? (
          <div className="report-logo-preview">
            <img
              src={reportSettings.companyLogoDataUrl}
              alt="公司 LOGO 預覽"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => patchReport({ companyLogoDataUrl: '' })}
            >
              移除 LOGO
            </button>
          </div>
        ) : (
          <p className="helper-text" style={{ margin: 0 }}>
            尚未上傳公司 LOGO（建議 PNG / SVG，≤ 200KB）
          </p>
        )}
        <label className="report-logo-upload">
          <span className="secondary-button" role="button">
            {reportSettings.companyLogoDataUrl ? '更換 LOGO' : '上傳 LOGO'}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              if (file.size > LOGO_MAX_BYTES) {
                setSaveMessage(
                  `LOGO 檔案 ${(file.size / 1024).toFixed(0)} KB 超過 200 KB；請壓縮後再上傳`,
                )
                event.target.value = ''
                return
              }
              const reader = new FileReader()
              reader.onload = () => {
                const dataUrl = reader.result
                if (typeof dataUrl === 'string') {
                  patchReport({ companyLogoDataUrl: dataUrl })
                  setSaveMessage(`已上傳 LOGO：${file.name}`)
                }
              }
              reader.onerror = () => {
                setSaveMessage('LOGO 讀取失敗，請改用其他檔案')
              }
              reader.readAsDataURL(file)
              event.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="helper-text">
        摘要版列印時只保留控制檢核與例外尺寸；完整明細版會附上逐項條文與產品證據對照。
      </p>
      <p className="helper-text">
        目前工具版本：<code>{CURRENT_CALC_ENGINE_VERSION}</code> · build{' '}
        <code>{formatDateTime(CURRENT_APP_BUILD_TIME)}</code>。
        案例會保存本案計算版本，報表也會同步列出版本狀態與留痕資訊。
      </p>
      <p className="helper-text">{ENGINEERING_USE_DISCLAIMER}</p>
    </details>
  )
}
