/**
 * 首次造訪歡迎卡
 *
 * 顯示條件：showWelcome=true 且 hasEnteredWorkspace=false
 * 由 App 元件控制 onDismiss（寫入 localStorage 等持久化）
 *
 * 純展示元件；無內部狀態。從 App.tsx 抽出後 App 主檔減少 ~55 行。
 */
export function WelcomeCard(props: { onDismiss: () => void }) {
  return (
    <section className="welcome-card" aria-labelledby="welcome-card-title">
      <div className="welcome-card-header">
        <h2 id="welcome-card-title">歡迎使用錨栓檢討工具</h2>
        <button
          type="button"
          className="welcome-close"
          aria-label="關閉歡迎卡"
          onClick={props.onDismiss}
        >
          ✕
        </button>
      </div>
      <p className="welcome-intro">
        符合台灣 112 年版規範第 17 章 / ACI 318-19 Ch.17。
        <strong>預設案例「柱腳基板示例」可直接套用通過</strong>，
        不必先填欄位即可看到完整檢核流程。
      </p>
      <ol className="welcome-steps">
        <li>
          <strong>選樣板或載入案例</strong>
          <span>下方「推薦案件樣板」/「最近編輯案例」直接套用</span>
        </li>
        <li>
          <strong>進入「構件／配置」分頁</strong>
          <span>fc′、hef、邊距、錨栓陣列；含 H 型鋼周邊輔助</span>
        </li>
        <li>
          <strong>填「載重」</strong>
          <span>精簡模式只需 N / V / M；進階可批次組合</span>
        </li>
        <li>
          <strong>看「結果」</strong>
          <span>整體判定 / 逐項 DCR / 敏感度分析 / 一鍵匯出 PDF/XLSX/DOCX</span>
        </li>
      </ol>
      <p className="welcome-shortcut-hint">
        💡 任何時候按 <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> 開啟命令面板， 或按{' '}
        <kbd>?</kbd> 查看快捷鍵
      </p>
    </section>
  )
}
