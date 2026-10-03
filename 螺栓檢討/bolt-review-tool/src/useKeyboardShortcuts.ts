import { useEffect, useRef } from 'react'
import type { ProjectAuditSource } from './domain'

export function topWorkspaceDialog() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')]
    .filter((node) => !node.hidden && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
    .sort((a, b) => (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0) - (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0)
      || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .at(-1)
}

interface CaseCardLite {
  id: string
}

interface WorkspaceTabLite<TabId extends string = string> {
  id: TabId
}

/**
 * 全域鍵盤捷徑：
 *   Ctrl/Cmd+S → 留痕簽章
 *   Ctrl/Cmd+P → 列印報表
 *   Ctrl/Cmd+K → 命令面板
 *   Ctrl/Cmd+Enter → 重算目前輸入並查看結果（不核可、不套用候選）
 *   Alt+1..N   → 切到對應 tab
 *   Alt+0/R    → 回到首頁 (report tab)
 *   Alt+] / [  → 案例循環切換
 *   Esc        → 關命令面板 / 關說明 / 從 report 返回 result
 *   ? / Shift+/ → 切換快捷鍵說明
 *
 * 內部用 ref 暫存「最新值與 callback」以避免每次依賴變動都重新註冊 listener；
 * 從 App.tsx 抽出（~115 行 + 5 個 ref 宣告）。
 */
export function useKeyboardShortcuts<
  TabId extends string,
  ExtraTabId extends string = 'report' | 'result',
>(deps: {
  hydrated: boolean
  activeTab: TabId | ExtraTabId
  hasEnteredWorkspace: boolean
  showShortcutHelp: boolean
  showCommandPalette: boolean
  workspaceTabs: WorkspaceTabLite<TabId>[]
  caseCards: CaseCardLite[]
  activeProjectId: string
  recordCurrentAuditTrail: (source: ProjectAuditSource) => Promise<void> | void
  printReport: () => void
  calculateAndShowResults: () => void
  selectProject: (projectId: string) => void
  /**
   * setActiveTab 支援切到內部某個 tab，或 'report' / 'result' 兩個結構面 tab
   * （兩者皆為 useState 的合法值；以 union 型別保留呼叫端的 setState 簽章）。
   */
  setActiveTab: (tab: TabId | ExtraTabId) => void
  setHasEnteredWorkspace: (entered: boolean) => void
  setShowCommandPalette: (show: boolean) => void
  setShowShortcutHelp: (
    updater: boolean | ((current: boolean) => boolean),
  ) => void
  setPaletteQuery: (value: string) => void
}) {
  const {
    hydrated,
    activeTab,
    hasEnteredWorkspace,
    showShortcutHelp,
    showCommandPalette,
    workspaceTabs,
    caseCards,
    activeProjectId,
    recordCurrentAuditTrail,
    printReport,
    calculateAndShowResults,
    selectProject,
    setActiveTab,
    setHasEnteredWorkspace,
    setShowCommandPalette,
    setShowShortcutHelp,
    setPaletteQuery,
  } = deps

  // 把「最新值」放進 ref，讓 effect 不必把這些列為 dependency 而頻繁 re-register
  const caseCardsRef = useRef(caseCards)
  const activeProjectIdRef = useRef(activeProjectId)
  const selectProjectRef = useRef(selectProject)
  const handlersRef = useRef({
    recordCurrentAuditTrail,
    printReport,
    calculateAndShowResults,
  })
  useEffect(() => {
    caseCardsRef.current = caseCards
    activeProjectIdRef.current = activeProjectId
    selectProjectRef.current = selectProject
    handlersRef.current = { recordCurrentAuditTrail, printReport, calculateAndShowResults }
  })

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    }
    // capture 只處理工作流程鍵，避免 Ctrl+Enter 在命令搜尋框誤執行匯出／套用命令。
    const handleWorkflowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const modal = topWorkspaceDialog()
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.isComposing || event.keyCode === 229 || event.repeat) return
        if (!modal) handlersRef.current.calculateAndShowResults()
        return
      }
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || event.repeat) return
      if (modal?.classList.contains('command-palette-backdrop')) {
        setShowCommandPalette(false)
      } else if (modal?.classList.contains('shortcut-help-backdrop')) {
        setShowShortcutHelp(false)
      } else if (modal) {
        return // 確認等其他視窗由各自的取消流程接手。
      } else if (!isTypingTarget(event.target) && activeTab === 'report' && hasEnteredWorkspace) {
        setActiveTab('result' as ExtraTabId)
      } else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return
      const meta = event.ctrlKey || event.metaKey
      const alt = event.altKey
      if (
        meta &&
        !alt &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault()
        void handlersRef.current.recordCurrentAuditTrail('manual')
        return
      }
      if (
        meta &&
        !alt &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault()
        handlersRef.current.printReport()
        return
      }
      if (
        meta &&
        !alt &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        setPaletteQuery('')
        setShowCommandPalette(true)
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      if (alt && !meta && !event.shiftKey) {
        if (event.key === '0' || event.key.toLowerCase() === 'r') {
          event.preventDefault()
          setActiveTab('report' as ExtraTabId)
          return
        }
        const digit = Number(event.key)
        if (
          Number.isInteger(digit) &&
          digit >= 1 &&
          digit <= workspaceTabs.length
        ) {
          event.preventDefault()
          const targetTab = workspaceTabs[digit - 1]
          setActiveTab(targetTab.id)
          setHasEnteredWorkspace(true)
          return
        }
        if (event.key === ']' || event.key === '[') {
          const cycleCases = caseCardsRef.current
          if (cycleCases.length <= 1) {
            return
          }
          event.preventDefault()
          const currentIndex = cycleCases.findIndex(
            (c) => c.id === activeProjectIdRef.current,
          )
          const direction = event.key === ']' ? 1 : -1
          const nextIndex =
            (currentIndex + direction + cycleCases.length) % cycleCases.length
          const next = cycleCases[nextIndex]
          if (next) {
            selectProjectRef.current(next.id)
          }
          return
        }
      }
      // Shift+? 或 ? ：切換快捷鍵說明浮層
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault()
        setShowShortcutHelp((current) => !current)
      }
    }
    window.addEventListener('keydown', handleWorkflowKeyDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleWorkflowKeyDown, true)
    }
  }, [
    hydrated,
    activeTab,
    hasEnteredWorkspace,
    showShortcutHelp,
    showCommandPalette,
    workspaceTabs,
    setActiveTab,
    setHasEnteredWorkspace,
    setShowCommandPalette,
    setShowShortcutHelp,
    setPaletteQuery,
  ])
}
