import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * 使用者按下「重新載入元件」時的 callback；預設為 window.location.reload()。
   */
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * 頂層 Error Boundary：捕捉 render / lifecycle 階段的 JS 例外，
 * 以一個可操作的錯誤卡片取代白屏。與 loadAppState 的 hydration 錯誤 UI 互補：
 * - hydration 錯誤 = 開啟 IndexedDB 失敗（非 render 例外）
 * - 此處 = render 邏輯丟例外（例如 calc.ts 某條 edge case、reportExport 解析錯）
 *
 * 提供兩顆按鈕：
 * - 重新載入元件：clearError + 嘗試重新 render（同一份資料）
 * - 重新整理頁面：window.location.reload()（等同按 F5）
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[bolt-review] ErrorBoundary caught render error', error, info)
    this.setState({ info })
  }

  handleReset = () => {
    this.setState({ error: null, info: null })
    this.props.onReset?.()
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    const { error, info } = this.state
    if (!error) {
      return this.props.children
    }
    return (
      <main className="loading-screen hydration-error" role="alert">
        <div className="hydration-error-card">
          <h2>錨栓工具發生執行時錯誤</h2>
          <p className="hydration-error-message">
            {error.name}: {error.message}
          </p>
          <p className="helper-text">
            可能是輸入了異常極端值、本地資料損壞，或程式仍有邊界 bug。
            可先「重新載入元件」看是否只是暫時性狀態；若仍失敗，請「重新整理頁面」
            讓 loadAppState 重新跑，或改用首頁備份列還原 JSON。
          </p>
          <div className="hydration-error-actions">
            <button type="button" onClick={this.handleReset}>
              重新載入元件
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={this.handleReload}
            >
              重新整理頁面
            </button>
          </div>
          {info?.componentStack ? (
            <details className="fold-panel" style={{ marginTop: 12 }}>
              <summary className="fold-summary">
                <span>元件堆疊（給開發者）</span>
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.78rem',
                  color: '#4b5f66',
                  maxHeight: 240,
                  overflow: 'auto',
                  background: '#fafcfc',
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {info.componentStack}
              </pre>
            </details>
          ) : null}
        </div>
      </main>
    )
  }
}
