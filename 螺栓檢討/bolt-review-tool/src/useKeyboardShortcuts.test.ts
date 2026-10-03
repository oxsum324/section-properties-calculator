// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { topWorkspaceDialog, useKeyboardShortcuts } from './useKeyboardShortcuts'

let root: Root
let host: HTMLDivElement
const callbacks = () => ({
  calculateAndShowResults: vi.fn(), printReport: vi.fn(), recordCurrentAuditTrail: vi.fn(),
  selectProject: vi.fn(), setActiveTab: vi.fn(), setHasEnteredWorkspace: vi.fn(),
  setShowCommandPalette: vi.fn(), setShowShortcutHelp: vi.fn(), setPaletteQuery: vi.fn(),
})
type Callbacks = ReturnType<typeof callbacks>
function Harness({ actions }: { actions: Callbacks }) {
  useKeyboardShortcuts({ hydrated: true, activeTab: 'member', hasEnteredWorkspace: true,
    showCommandPalette: false, showShortcutHelp: false, workspaceTabs: [{ id: 'member' }],
    caseCards: [], activeProjectId: 'qa', ...actions })
  return createElement('input', { 'aria-label': 'QA 輸入' })
}
function key(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
})

describe('錨栓工作流程快捷鍵', () => {
  it('輸入框內 Ctrl+Enter 只呼叫一次重算，不列印、留痕、核可或選用候選', () => {
    const actions = callbacks()
    act(() => root.render(createElement(Harness, { actions })))
    const input = host.querySelector('input')!
    const event = key(input, { key: 'Enter', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.calculateAndShowResults).toHaveBeenCalledTimes(1)
    expect(actions.printReport).not.toHaveBeenCalled()
    expect(actions.recordCurrentAuditTrail).not.toHaveBeenCalled()
    expect(actions.selectProject).not.toHaveBeenCalled()
    key(input, { key: 'Enter', ctrlKey: true, repeat: true })
    key(input, { key: 'Enter', ctrlKey: true, isComposing: true })
    key(input, { key: 'Enter', ctrlKey: true, keyCode: 229 })
    expect(actions.calculateAndShowResults).toHaveBeenCalledTimes(1)
  })
  it('命令面板開啟時攔住 Ctrl+Enter，避免執行面板中的匯出命令', () => {
    const actions = callbacks()
    act(() => root.render(createElement(Harness, { actions })))
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true')
    modal.className = 'command-palette-backdrop'
    const input = document.createElement('input'); modal.appendChild(input); document.body.appendChild(modal)
    const executeCommand = vi.fn(); input.addEventListener('keydown', executeCommand)
    key(input, { key: 'Enter', ctrlKey: true })
    key(input, { key: 'Enter', ctrlKey: true, repeat: true })
    key(input, { key: 'Enter', ctrlKey: true, isComposing: true })
    key(input, { key: 'Enter', ctrlKey: true, keyCode: 229 })
    expect(actions.calculateAndShowResults).not.toHaveBeenCalled()
    expect(executeCommand).not.toHaveBeenCalled()
    key(input, { key: 'Escape' })
    expect(actions.setShowCommandPalette).toHaveBeenCalledExactlyOnceWith(false)
  })
  it('Esc 依 z-index 只關最上層說明，較低命令面板維持開啟', () => {
    const actions = callbacks()
    act(() => root.render(createElement(Harness, { actions })))
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true" class="command-palette-backdrop" style="z-index:10"><input></div><div role="dialog" aria-modal="true" class="shortcut-help-backdrop" style="z-index:20"></div>')
    expect(topWorkspaceDialog()?.className).toBe('shortcut-help-backdrop')
    key(document.querySelector('.command-palette-backdrop input')!, { key: 'Escape' })
    expect(actions.setShowShortcutHelp).toHaveBeenCalledExactlyOnceWith(false)
    expect(actions.setShowCommandPalette).not.toHaveBeenCalled()
  })
})
