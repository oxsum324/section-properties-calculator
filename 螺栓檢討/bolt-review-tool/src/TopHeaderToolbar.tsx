import type {
  AreaUnit,
  ForceUnit,
  LengthUnit,
  ProjectCase,
  StressUnit,
  UnitPreferences,
} from './domain'
import { IconCommand } from './Icons'
import { getUnitOptionLabel } from './units'
import {
  getRuleProfileOptions,
  normalizeRuleProfileId,
} from './ruleProfiles'

type RuleProfileOption = ReturnType<typeof getRuleProfileOptions>[number]

/**
 * 頂部工具列：案例名稱、規範版本、資源 / 樣板入口、快速命令、匯出群組、單位偏好、簡化模式。
 *
 * 從 App.tsx 抽出（~160 行）；P1 拆分序列之一。
 */
export function TopHeaderToolbar(props: {
  project: ProjectCase
  patchProject: (patch: Partial<ProjectCase>) => void
  ruleProfileOptions: RuleProfileOption[]
  unitPreferences: UnitPreferences
  patchUi: (patch: Partial<UnitPreferences>) => void
  simpleMode: boolean
  activeRuleProfileChapter17Title: string
  /** 在元件內僅會以 'report' 呼叫；以字面型別保留呼叫端的 setState 型別。 */
  setActiveTab: (tab: 'report') => void
  onOpenCommandPalette: () => void
  onPrintReport: () => void
  onPreviewReport: () => void
  onExportHtmlReport: () => Promise<void> | void
  onExportXlsxReport: () => Promise<void> | void
  onExportDocxReport: () => Promise<void> | void
  onRecordAuditTrailManual: () => Promise<void> | void
}) {
  const {
    project,
    patchProject,
    ruleProfileOptions,
    unitPreferences,
    patchUi,
    simpleMode,
    activeRuleProfileChapter17Title,
    setActiveTab,
    onOpenCommandPalette,
    onPrintReport,
    onPreviewReport,
    onExportHtmlReport,
    onExportXlsxReport,
    onExportDocxReport,
    onRecordAuditTrailManual,
  } = props

  return (
    <section className="toolbar">
      <div className="toolbar-group">
        <label>
          案例名稱
          <input
            value={project.name}
            onChange={(event) => patchProject({ name: event.target.value })}
          />
        </label>
        <label>
          規範版本
          <select
            value={project.ruleProfileId}
            onChange={(event) =>
              patchProject({
                ruleProfileId: normalizeRuleProfileId(event.target.value),
              })
            }
          >
            {ruleProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setActiveTab('report')}
          title="開啟案件樣板、案例庫、文件附件與匯出設定"
        >
          資源 / 樣板
        </button>
        <button
          type="button"
          className="command-palette-trigger"
          onClick={onOpenCommandPalette}
          title="快速跳到 tab / 案例 / 產品 / 動作（Ctrl/Cmd+K）"
          aria-label="開啟命令面板"
        >
          <IconCommand aria-hidden />
          <span>快速命令</span>
          <kbd className="command-palette-trigger-kbd">Ctrl+K</kbd>
        </button>
      </div>

      <div className="toolbar-group toolbar-export" data-shows="result report">
        <button type="button" onClick={onPrintReport}>
          列印報表
        </button>
        <button
          type="button"
          onClick={() => {
            void onPreviewReport()
          }}
        >
          預覽報表
        </button>
        <button
          type="button"
          onClick={() => {
            void onExportHtmlReport()
          }}
        >
          匯出 HTML
        </button>
        <button
          type="button"
          onClick={() => {
            void onExportXlsxReport()
          }}
        >
          匯出 XLSX
        </button>
        <button
          type="button"
          onClick={() => {
            void onExportDocxReport()
          }}
        >
          匯出 DOCX
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void onRecordAuditTrailManual()
          }}
        >
          留存簽章
        </button>
      </div>

      <div className="toolbar-group toolbar-units">
        <label>
          長度
          <select
            value={unitPreferences.lengthUnit}
            onChange={(event) =>
              patchUi({ lengthUnit: event.target.value as LengthUnit })
            }
          >
            {(['mm', 'cm', 'm'] as LengthUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {getUnitOptionLabel(unit)}
              </option>
            ))}
          </select>
        </label>
        <label>
          面積
          <select
            value={unitPreferences.areaUnit}
            onChange={(event) =>
              patchUi({ areaUnit: event.target.value as AreaUnit })
            }
          >
            {(['mm2', 'cm2'] as AreaUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {getUnitOptionLabel(unit)}
              </option>
            ))}
          </select>
        </label>
        <label>
          力量
          <select
            value={unitPreferences.forceUnit}
            onChange={(event) =>
              patchUi({ forceUnit: event.target.value as ForceUnit })
            }
          >
            {(['kN', 'kgf', 'tf'] as ForceUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {getUnitOptionLabel(unit)}
              </option>
            ))}
          </select>
        </label>
        <label>
          應力
          <select
            value={unitPreferences.stressUnit}
            onChange={(event) =>
              patchUi({ stressUnit: event.target.value as StressUnit })
            }
          >
            {(['MPa', 'kgf_cm2'] as StressUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {getUnitOptionLabel(unit)}
              </option>
            ))}
          </select>
        </label>
        <label className="switch switch-inline">
          <input
            type="checkbox"
            checked={simpleMode}
            onChange={(event) => patchUi({ simpleMode: event.target.checked })}
          />
          <span>簡化模式</span>
        </label>
      </div>

      <div className="toolbar-note" data-shows="report">
        <strong>規範唯一預設：</strong>
        <span>{activeRuleProfileChapter17Title}</span>
        <span className="separator">/</span>
        <span>案例會凍結在目前 profileId</span>
      </div>
    </section>
  )
}
