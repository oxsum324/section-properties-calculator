import { useEffect, useRef } from 'react'
import type { ProjectAuditSource } from './domain'

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
  })
  useEffect(() => {
    caseCardsRef.current = caseCards
    activeProjectIdRef.current = activeProjectId
    selectProjectRef.current = selectProject
    handlersRef.current = { recordCurrentAuditTrail, printReport }
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
    const handleKeyDown = (event: KeyboardEvent) => {
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
      if (event.key === 'Escape') {
        if (showCommandPalette) {
          event.preventDefault()
          setShowCommandPalette(false)
          return
        }
        if (showShortcutHelp) {
          event.preventDefault()
          setShowShortcutHelp(false)
          return
        }
        if (activeTab === 'report' && hasEnteredWorkspace) {
          event.preventDefault()
          setActiveTab('result' as ExtraTabId)
        }
      }
      // Shift+? 或 ? ：切換快捷鍵說明浮層
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault()
        setShowShortcutHelp((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
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
