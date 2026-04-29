import { useMemo } from 'react'
import type { CommandItem } from './CommandPalette'
import type {
  AnchorFamily,
  AnchorProduct,
  ProjectAuditSource,
  ProjectCase,
} from './domain'
import { formatDateTime } from './formatHelpers'

interface CaseCardLite {
  id: string
  name: string
  updatedAt: string
}

interface WorkspaceTabLite<TabId extends string = string> {
  id: TabId
  label: string
  hint: string
}

function familyLabel(family: AnchorFamily): string {
  switch (family) {
    case 'cast_in':
      return '預埋錨栓'
    case 'post_installed_expansion':
      return '後置膨脹錨栓'
    case 'post_installed_bonded':
      return '後置黏結式錨栓'
    case 'screw_anchor':
      return '螺紋錨栓'
    case 'undercut_anchor':
      return '擴底式錨栓'
    case 'shear_lug':
      return '剪力榫'
    default:
      return family
  }
}

/**
 * 命令面板（Ctrl/⌘+K）指令清單建構：包含
 *   - 7 條 tab 切換 + 1 條回 hub
 *   - 最多 10 條案例 / 10 條產品快捷
 *   - 8 條動作（列印 / 預覽 / 匯出 HTML/XLSX/DOCX / 留痕 / 匯出本案 / 匯出工作區 / 顯示捷徑）
 *
 * 從 App.tsx 抽出（~120 行）；以 useMemo 快取，依賴變動才重建。
 */
export function useCommandPaletteCommands<TabId extends string>(deps: {
  workspaceTabs: WorkspaceTabLite<TabId>[]
  caseCards: CaseCardLite[]
  products: AnchorProduct[]
  setActiveTab: (tab: TabId | 'report' | 'member' | 'product') => void
  setHasEnteredWorkspace: (entered: boolean) => void
  selectProject: (projectId: string) => void
  patchProject: (patch: Partial<ProjectCase>) => void
  openStandaloneReportWindow: (autoPrint?: boolean) => Promise<void> | void
  exportHtmlReport: () => Promise<void> | void
  exportXlsxReport: () => Promise<void> | void
  exportDocxReport: () => Promise<void> | void
  recordCurrentAuditTrail: (
    source: ProjectAuditSource,
  ) => Promise<void> | void
  exportCurrentCase: () => void
  exportWorkspace: () => Promise<void> | void
  setShowShortcutHelp: (show: boolean) => void
}): CommandItem[] {
  const {
    workspaceTabs,
    caseCards,
    products,
    setActiveTab,
    setHasEnteredWorkspace,
    selectProject,
    patchProject,
    openStandaloneReportWindow,
    exportHtmlReport,
    exportXlsxReport,
    exportDocxReport,
    recordCurrentAuditTrail,
    exportCurrentCase,
    exportWorkspace,
    setShowShortcutHelp,
  } = deps

  return useMemo<CommandItem[]>(
    () => [
      ...workspaceTabs.map((tab) => ({
        id: `tab:${tab.id}`,
        label: `切換到 ${tab.label}`,
        group: '導覽',
        hint: tab.hint,
        run: () => {
          setActiveTab(tab.id)
          setHasEnteredWorkspace(true)
        },
      })),
      {
        id: 'tab:report',
        label: '回到資源庫 hub',
        group: '導覽',
        hint: '案件樣板 / 案例庫 / 附件 / 匯出',
        run: () => setActiveTab('report'),
      },
      ...caseCards.slice(0, 10).map((item) => ({
        id: `case:${item.id}`,
        label: `載入案例：${item.name}`,
        group: '案例',
        hint: formatDateTime(item.updatedAt),
        run: () => {
          selectProject(item.id)
          setActiveTab('member')
          setHasEnteredWorkspace(true)
        },
      })),
      ...products.slice(0, 10).map((item) => ({
        id: `product:${item.id}`,
        label: `切換產品：${item.brand} ${item.model}`,
        group: '產品',
        hint: familyLabel(item.family),
        run: () => {
          patchProject({ selectedProductId: item.id })
          setActiveTab('product')
          setHasEnteredWorkspace(true)
        },
      })),
      {
        id: 'action:print',
        label: '列印報表',
        group: '動作',
        hint: 'Ctrl/Cmd+P',
        run: () => {
          void openStandaloneReportWindow(true)
        },
      },
      {
        id: 'action:preview',
        label: '預覽報表（獨立視窗）',
        group: '動作',
        hint: '可在新分頁檢視完整報告',
        run: () => {
          void openStandaloneReportWindow(false)
        },
      },
      {
        id: 'action:export-html',
        label: '匯出 HTML 報告',
        group: '動作',
        hint: '下載單檔離線可讀',
        run: () => {
          void exportHtmlReport()
        },
      },
      {
        id: 'action:export-xlsx',
        label: '匯出 XLSX 報告',
        group: '動作',
        hint: '表格版多工作表',
        run: () => {
          void exportXlsxReport()
        },
      },
      {
        id: 'action:export-docx',
        label: '匯出 DOCX 報告',
        group: '動作',
        hint: '含幾何配置圖',
        run: () => {
          void exportDocxReport()
        },
      },
      {
        id: 'action:audit',
        label: '留存簽章（手動留痕）',
        group: '動作',
        hint: 'Ctrl/Cmd+S',
        run: () => {
          void recordCurrentAuditTrail('manual')
        },
      },
      {
        id: 'action:export-case',
        label: '匯出本案 JSON（僅目前案例）',
        group: '動作',
        hint: '含選用 / 候選產品 + 該案附件',
        run: () => exportCurrentCase(),
      },
      {
        id: 'action:backup',
        label: '匯出整個工作區 JSON',
        group: '動作',
        hint: '含所有案例 / 產品 / 附件',
        run: () => {
          void exportWorkspace()
        },
      },
      {
        id: 'action:help',
        label: '顯示鍵盤快捷鍵',
        group: '動作',
        hint: '?',
        run: () => setShowShortcutHelp(true),
      },
    ],
    [
      workspaceTabs,
      caseCards,
      products,
      setActiveTab,
      setHasEnteredWorkspace,
      selectProject,
      patchProject,
      openStandaloneReportWindow,
      exportHtmlReport,
      exportXlsxReport,
      exportDocxReport,
      recordCurrentAuditTrail,
      exportCurrentCase,
      exportWorkspace,
      setShowShortcutHelp,
    ],
  )
}
