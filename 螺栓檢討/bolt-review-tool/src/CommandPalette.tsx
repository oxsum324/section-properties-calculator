import { useEffect, useRef, useState } from 'react'

export interface CommandItem {
  id: string
  label: string
  group: string
  hint?: string
  run: () => void
}

/**
 * 命令面板：Ctrl/Cmd+K 啟用，支援關鍵字模糊搜尋與鍵盤導航。
 *
 * 從 App.tsx 抽出（~115 行）；無外部相依，純依 props 驅動。
 */
export function CommandPalette(props: {
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  commands: CommandItem[]
}) {
  const { query, onQueryChange, onClose, commands } = props
  const normalized = query.trim().toLowerCase()
  const filtered = commands.filter((cmd) => {
    if (!normalized) {
      return true
    }
    const haystack = `${cmd.label} ${cmd.group} ${cmd.hint ?? ''}`.toLowerCase()
    return normalized
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token))
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 當 query 變動時重置 active index：derive during render + 只有 index 超過 filtered 時修正
  // 避免 setState-in-effect 警告；filtered 本身是 render 時推導
  const effectiveActiveIndex =
    filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1)

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-palette-index="${effectiveActiveIndex}"]`,
    )
    active?.scrollIntoView({ block: 'nearest' })
  }, [effectiveActiveIndex])

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onClick={onClose}
    >
      <div
        className="command-palette-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          className="command-palette-input"
          value={query}
          placeholder="輸入關鍵字：tab 名稱 / 案例 / 產品 / 動作…"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const target = filtered[effectiveActiveIndex]
              if (target) {
                target.run()
                onClose()
              }
            }
          }}
          aria-label="命令搜尋"
        />
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-palette-empty">
              沒有符合的指令；試試「切換」「匯出」「案例」等關鍵字
            </div>
          ) : null}
          {filtered.map((cmd, index) => (
            <button
              key={cmd.id}
              type="button"
              data-palette-index={index}
              className={`command-palette-item${
                index === effectiveActiveIndex ? ' active' : ''
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                cmd.run()
                onClose()
              }}
            >
              <span className="command-palette-item-label">{cmd.label}</span>
              <span className="command-palette-item-group">{cmd.group}</span>
              {cmd.hint ? (
                <span className="command-palette-item-hint">{cmd.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="command-palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 切換 · <kbd>Enter</kbd> 執行 ·
            <kbd>Esc</kbd> 關閉
          </span>
          <span>
            共 {filtered.length} / {commands.length} 項
          </span>
        </div>
      </div>
    </div>
  )
}
