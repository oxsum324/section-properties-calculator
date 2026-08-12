# 多案件外部歸檔生命週期排程監測

本流程在既有 GSP 多案件總覽之上增加 Windows 每日排程與轉換式提醒。每次仍完整重驗來源樹內所有 GSC；它不是讀取昨天的 GSP 後推算今天狀態，也不會登入保存端、續期保留鎖、修改 GSC 或自動處理 legal hold。

## 日常入口

- `安裝多案件外部歸檔生命週期每日監測.bat`：啟動案件導入精靈。選擇 GSC 案件群根目錄與完全分離的專用狀態資料夾後，先做唯讀完整預掃並顯示去識別計數、排程時間、提醒設定與 `GMI-...` 設定指紋。預覽不寫入 GSM 狀態、不註冊排程；必須勾選核可方塊，才會用同一設定指紋重新完整掃描並建立目前 Windows 使用者的每日 09:00 工作排程。取消或關閉視窗均不建立排程。
- `開啟多案件生命週期監控管理中心.bat`：集中讀取由本工具建立在工作排程根目錄的所有 GSM 排程，顯示正常、待關注與維運問題數量，以及各排程的新鮮度、最近／下次執行、漏跑、來源與狀態資料夾。可從同一畫面新增、重新預覽／更新或移除排程；更新仍須走 `GMI-...` 指紋與核可方塊，移除另須明確勾選且只刪排程、不刪 GSM 證據。
- `檢查多案件外部歸檔生命週期監測排程.bat`：檢查排程是否存在、啟用、仍指向目前工具，以及最近執行資訊。若從排程參數可安全取得狀態資料夾，也會驗證 GSM 狀態、事件鏈與預設 36 小時新鮮度。
- `移除多案件外部歸檔生命週期每日監測.bat`：只移除工作排程，不刪除狀態資料夾、事件或任何 GSC。

排程採目前登入帳號的互動權杖、有限權限、`StartWhenAvailable` 與 `IgnoreNew`：電腦休眠錯過時間後可補跑；上一輪尚未完成時不重疊啟動。動作固定安裝當下 Windows PowerShell 與目前監測腳本的絕對路徑，Status 會重新核對，避免以同名程式或相似參數冒充。通知必須有互動登入工作階段才可顯示，監測與事件記錄本身不依賴通知成功。

## 案件導入草稿與核可

案件導入不是正式附件核可。它只表示使用者核對了本機監測來源、狀態資料夾與排程設定，並同意建立維運排程。精靈分成兩個不可混用的階段：

1. `Preview` 先由工作排程管理器驗證實體路徑、來源／狀態分離及有限權限排程定義，再直接從來源做一次唯讀 GSC 完整重驗。畫面只顯示狀態與數量，不把案件名稱、絕對路徑或證據指紋寫入預覽 JSON。
2. `Install` 必須攜帶 Preview 對完整設定產生的 `GMI-...` 指紋。時間、路徑、提醒、掃描深度、新鮮度或輸出位置任一項改變，指紋即不相符，安裝會在來源寫入與排程註冊前失敗。

畫面的「核可並安裝」預設停用，只有勾選「我已核對來源、狀態資料夾與排程設定」才可執行。取消結果固定回報 `taskInstalled=false` 與 `monitorStateWritten=false`；若已完成預覽才取消，`sourceScanExecuted=true` 會如實保留唯讀掃描已發生的事實。唯讀預掃若顯示無 GSC、無效包、應重驗或 blocked，仍須先回到案件資料確認；核可方塊不能把異常資料改成合格，也不能把內部治理排程變成計算書附件核可。

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

若需改時間、無桌面警示或以受控腳本導入，先取得導入草稿：

```powershell
.\onboard_receiver_governance_archive_lifecycle_monitor.ps1 `
  -Mode Preview `
  -SourceRoot "D:\案件群" `
  -StateDirectory "E:\受控治理監測\案件群-GSM" `
  -DailyAt "07:30" `
  -NoAlert
```

確認輸出的唯讀掃描摘要與 `configurationFingerprint` 後，再以完全相同的參數執行 `-Mode Install -ConfirmedConfigurationFingerprint "GMI-..."`。安裝入口會重做預覽；若任何設定已改變，拒絕註冊。底層 `manage_receiver_governance_archive_lifecycle_monitor_task.ps1 -Mode Preview` 只建立並檢查 ScheduledTask 草稿，不掃描來源、不註冊工作、不修改狀態資料夾；直接呼叫其 `Install` 同樣必須提供該 Preview 的設定指紋，不能繞過確認。

## 本機多案件管理中心

管理中心只列出符合本工具固定描述、位於 Task Scheduler 根目錄的排程；不能只因名稱相似就納入。每個候選排程仍由底層 Status 重新核對 PowerShell、腳本絕對路徑、完整參數、來源／狀態實體分離、觸發器與有限權限原則。管理中心呼叫 Status 時使用 `-NoDashboardWrite`，因此巡覽多個排程不會反覆覆寫單一平台 dashboard 摘要。這次集中盤點只驗證排程與既有 GSM 鏈／新鮮度，不重新掃描來源 GSC；來源完整重驗仍由每日排程執行，或在「重新預覽／更新」時明確啟動唯讀預掃。

狀態分成：

- `正常`：設定一致、排程啟用、最近結果可接受，且 GSM 狀態完整、未過期且無注意事項。
- `即將到期`、`應重驗`、`阻擋`：GSM 狀態仍可驗證，但案件治理需要處置。
- `設定漂移`、`排程停用`、`最近執行失敗`、`狀態無法驗證`、`狀態過期`：本機維運問題，不得以舊正常狀態掩蓋。

管理中心的完整快照只存在程序記憶體，預設不寫檔；畫面會顯示排程名稱、來源與狀態絕對路徑，這些內容可能包含案件識別資訊，因此明確屬本機機密維運資料，與公開稽核儀表板的去識別三份摘要不同。`Smoke` 模式只使用虛構路徑並限寫 `output/playwright/` 畫面證據；正式資料不得截圖後附入計算書或上傳 Pages。

「重新預覽／更新」會把目前設定帶入案件導入精靈，但仍重新唯讀掃描、重新產生 `GMI-...`，且必須再次勾選核可；不是一鍵覆寫。「移除排程」必須勾選「只移除 Windows 排程，保留既有監測證據」，完成後再重新列舉確認。管理中心不提供刪除 GSM 狀態、事件或 GSC 的功能。

`-AsOf` 僅供測試或稽核重演；正式排程不設定該參數，必須使用實際執行時間判斷期限與新鮮度。

## 責任邊界

- GSM／GME 是公司內部期限治理資料，不是 GSC、GSP、外部保存庫或組織案件系統的替代品。
- 桌面通知失敗不會改變掃描結果；未登入、通知逾時或使用者未看見通知，也不能解讀為風險不存在。
- 排程使用目前 checkout 的 Python 與腳本；工具位置、Python、OpenSSL 或來源磁碟改變時，排程可能失敗，須由排程狀態與 36 小時新鮮度檢查發現。
- 狀態完整性與事件鏈是本機防誤改線索，不是外部可信時間戳或防止高權限人員重建整個資料夾的證明。
- upcoming 是預先安排重驗的提醒，不改寫 GSC current；review-due／blocked 也不改寫歷史證據。
- GSM、GME、排程資訊及通知不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages，也不構成工程核可、正式附件核可或法律保存完成。
- 管理中心快照包含本機排程名稱與絕對路徑，敏感度高於去識別 dashboard 摘要；不得持久化為公開資產、附入計算書、放入正式附件包或以畫面截圖對外發布。
- 去識別 dashboard 摘要只是本機維運檢視，不是案件清冊、外部保存現況證明或遠端監控服務；案件層處置仍須回到受控 GSM 狀態資料夾。
