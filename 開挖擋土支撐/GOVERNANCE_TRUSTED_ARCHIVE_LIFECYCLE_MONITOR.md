# 多案件外部歸檔生命週期排程監測

本流程在既有 GSP 多案件總覽之上增加 Windows 每日排程與轉換式提醒。每次仍完整重驗來源樹內所有 GSC；它不是讀取昨天的 GSP 後推算今天狀態，也不會登入保存端、續期保留鎖、修改 GSC 或自動處理 legal hold。

## 日常入口

- `安裝多案件外部歸檔生命週期每日監測.bat`：選擇 GSC 案件群根目錄與完全分離的專用狀態資料夾，先實際執行一次完整掃描，成功後才建立目前 Windows 使用者的每日 09:00 工作排程。
- `檢查多案件外部歸檔生命週期監測排程.bat`：檢查排程是否存在、啟用、仍指向目前工具，以及最近執行資訊。若從排程參數可安全取得狀態資料夾，也會驗證 GSM 狀態、事件鏈與預設 36 小時新鮮度。
- `移除多案件外部歸檔生命週期每日監測.bat`：只移除工作排程，不刪除狀態資料夾、事件或任何 GSC。

排程採目前登入帳號的互動權杖、有限權限、`StartWhenAvailable` 與 `IgnoreNew`：電腦休眠錯過時間後可補跑；上一輪尚未完成時不重疊啟動。動作固定安裝當下 Windows PowerShell 與目前監測腳本的絕對路徑，Status 會重新核對，避免以同名程式或相似參數冒充。通知必須有互動登入工作階段才可顯示，監測與事件記錄本身不依賴通知成功。

## 狀態與通知節流

每次掃描產生兩層不同指紋：

1. `GSP-...` 固定本次完整評估，包含評估時間，因此每次重驗都不同。
2. `GMS-...` 只固定需要管理者關注的穩定訊號：案件／GSC 選取、期限、狀態、原因、無效包與問題；不含每天自然改變的評估時間或剩餘秒數。

首次執行會建立基準事件。之後只有 `GMS-...` 改變才追加一份不可覆寫的 `GME-...` 事件；相同訊號只更新 latest GSM，不增加事件、不重複警示。限時 120 秒的桌面通知只出現在：

- 首次即為 `upcoming`、`review-due` 或 `blocked`；
- 注意內容、案件集合或嚴重度改變；
- 從需要注意恢復為全部 `current`。

全部 `current` 但案件清單改變時仍會追加事件以保持盤點歷程，但不彈出警示。排程退出碼維持 GSP 語意：`0` 全部 current、`2` upcoming／review-due、`3` blocked、`1` 執行或完整性錯誤。Windows 工作排程因此可把非零結果保留為需要注意的最近結果；它不代表工作排程本身未執行。

退出碼 `1` 表示當次無法產生可信的目前狀態，例如 Python、OpenSSL、來源磁碟、寫入或既有狀態鏈驗證失敗。啟用桌面警示時，這類執行／完整性失敗每次嘗試都會警示，不套用狀態轉換節流；必須先排除原因並恢復可信事件鏈，不能把舊 latest 當成目前狀態。

## 封閉本機狀態

專用狀態資料夾只允許：

- `GSM-外部歸檔生命週期監測-latest.json`
- `events/` 內依序號及 `GME-...` 指紋命名的封閉 JSON 事件
- `.GSM-monitor.lock` 排他鎖

每次排程會先驗證既有 latest 與完整事件鏈一致，再開始新的來源掃描；舊 latest 遭竄改、事件鏈缺 latest 或 latest 沒有事件鏈時不得直接覆寫。未知檔案、連結、硬連結、事件改名、序號缺口、指紋錯誤、前後訊號／狀態不連續、時間倒退或並行執行也都失敗關閉。新增事件與 latest 發布任一步失敗時會撤回新事件並還原舊 latest。`verify-state` 會驗證完整事件鏈並判斷 latest 是否超過新鮮度門檻，但不重新掃描 GSC；要主張目前狀態，仍必須執行新的 monitor run。

狀態資料夾必須預先存在、專用，且與 GSC 來源樹及工具程式庫完全分離。latest 保存來源根目錄名稱、案件名稱與相對 GSC 路徑，供公司內部找到待處理案件；不保存來源根目錄絕對路徑。工作排程本身會由 Windows 保存必要的來源與狀態絕對路徑，應依本機帳號與 Task Scheduler 權限管理。

即使有人手動把 latest 或事件複製回程式庫，專用檔名仍受 `.gitignore`、Pages artifact 排除及線上負向探針保護；這些縱深防線不代表可把監測狀態資料夾設在程式庫內。

交換 Schema 位於 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json`。Schema 不能取代 Python 的語意數量重算、指紋、事件鏈、檔名、連結與競態驗證。

## 本機稽核儀表板

每次排程另在 repo 的 ignored `output/audit/` 原子更新三份去識別摘要：

- `gsm-lifecycle-monitor-status.json`：完整重驗時間、新鮮度、信任狀態與 current／upcoming／review-due／blocked／無效包／掃描錯誤計數。
- `gsm-lifecycle-monitor-history.json`：最近 24 筆去識別狀態與計數轉換。
- `gsm-lifecycle-monitor-task-status.json`：排程安裝、啟用、設定一致、最近結果、錯過次數與下次執行時間。

三份摘要不含案件名稱、來源／狀態路徑、排程名稱、保存端資料或 GSC／GSP／GSM／GME 指紋，並受 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json` 封閉欄位契約限制。平台巡檢儀表板只在本機 HTTP 模式讀取；公開站缺少摘要時固定顯示「僅限本機」，不推測目前狀態。摘要或排程狀態超過 36 小時即失敗可見；當次監測發生執行或完整性錯誤時，status 立即改成 `untrusted` 且清空舊案件計數，不能沿用先前正常數字。

## 非互動命令

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass `
  -File ".\receiver_governance_archive_lifecycle_monitor.ps1" `
  -Mode Run `
  -SourceRoot "D:\案件群" `
  -StateDirectory "E:\受控治理監測\案件群-GSM" `
  -UpcomingDays 30 `
  -ShowAlert
```

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass `
  -File ".\receiver_governance_archive_lifecycle_monitor.ps1" `
  -Mode VerifyState `
  -StateDirectory "E:\受控治理監測\案件群-GSM" `
  -MaxAgeHours 36
```

若需改時間或無桌面警示，可直接執行管理入口：

```powershell
.\manage_receiver_governance_archive_lifecycle_monitor_task.ps1 `
  -Mode Install `
  -SourceRoot "D:\案件群" `
  -StateDirectory "E:\受控治理監測\案件群-GSM" `
  -DailyAt "07:30" `
  -NoAlert
```

維護或自動測試可把 `-Mode Install` 改為 `-Mode Preview`。Preview 會建立並檢查同一份 ScheduledTask 定義，但不執行來源掃描、不註冊工作，也不修改狀態資料夾。

`-AsOf` 僅供測試或稽核重演；正式排程不設定該參數，必須使用實際執行時間判斷期限與新鮮度。

## 責任邊界

- GSM／GME 是公司內部期限治理資料，不是 GSC、GSP、外部保存庫或組織案件系統的替代品。
- 桌面通知失敗不會改變掃描結果；未登入、通知逾時或使用者未看見通知，也不能解讀為風險不存在。
- 排程使用目前 checkout 的 Python 與腳本；工具位置、Python、OpenSSL 或來源磁碟改變時，排程可能失敗，須由排程狀態與 36 小時新鮮度檢查發現。
- 狀態完整性與事件鏈是本機防誤改線索，不是外部可信時間戳或防止高權限人員重建整個資料夾的證明。
- upcoming 是預先安排重驗的提醒，不改寫 GSC current；review-due／blocked 也不改寫歷史證據。
- GSM、GME、排程資訊及通知不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages，也不構成工程核可、正式附件核可或法律保存完成。
- 去識別 dashboard 摘要只是本機維運檢視，不是案件清冊、外部保存現況證明或遠端監控服務；案件層處置仍須回到受控 GSM 狀態資料夾。
