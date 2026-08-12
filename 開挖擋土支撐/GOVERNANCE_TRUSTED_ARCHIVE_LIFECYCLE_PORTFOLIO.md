# 多案件外部歸檔生命週期總覽

本工具接續完整 `GSC`，用來回答「目前受控案件群中，哪些外部歸檔物件仍在有效週期、即將重驗、已應重驗或已阻擋」。它是只讀治理總覽，不會登入 DMS／WORM、不會變更 GSC，也不會替任何案件自動續期、解除 legal hold 或核可工程內容。

## 三個入口

- `檢查多案件外部歸檔生命週期.bat`：選取案件上層資料夾後，即時完整重驗所有 GSC，輸出 JSON；不建立快照。
- `建立多案件外部歸檔生命週期總覽快照.bat`：除即時掃描外，另選與來源完全分離的受控資料夾，建立封閉雙檔 `GSP` 快照並開啟 HTML。
- `驗證多案件外部歸檔生命週期總覽快照.bat`：驗證 GSP 的 JSON 指紋、固定檔名、精確兩檔集合及決定性 HTML。它只證明快照自身未改，不會重新讀取來源 GSC，也不得用來主張目前保存狀態仍有效。

## 掃描與選鏈規則

1. 來源根目錄必須是實體資料夾；掃描不跟隨符號連結或目錄連接。
2. 每個名稱符合 `GSC-外部歸檔生命週期檢查點-GSC-...` 的候選資料夾，都會使用正式 GSC 驗證器重新驗證原 GAV、GSR 簽章、現行公開金鑰、核定證據及封閉五檔內容。
3. 同一保存端組織、保存庫、物件 ID 與不可變版本 ID 組成一條生命週期鏈。
4. 相同 `GSC` 指紋出現在不同案件資料夾時視為同一證據的複本，只計為一個檢查點並列出複本位置。
5. 同一鏈依保存端 `observedAt` 選取最新檢查點；較舊且完整有效的 GSC 留在 `superseded` 歷史清單。
6. 如果相同最新觀察時間存在不同有效 GSC，或相同保存物件／版本對應不同 GAP 摘要，禁止自動選定並將該鏈列為 `blocked`。
7. 任一候選包未通過完整驗證，都會使總覽 `blocked`；有效舊包不得掩蓋毀損、竄改或格式錯誤的新候選包。
8. 掃描結束前會重新盤點候選路徑及逐檔 SHA-256。來源在掃描或發布期間變動時，總覽列為不穩定，GSP 不會發布或會被撤回。

預設最多掃描 12 層、25,000 個資料夾及 5,000 個候選包。達到任何安全上限都會顯示阻擋，不會以不完整結果冒充完整盤點。

## 狀態與退出碼

GSC 原始生命週期狀態保持不變：

- `current`：尚未到下次重驗期限，也未進入 GSC 的保留期限預警窗。
- `review-due`：週期重驗已到，或已進入保留期限預警窗；歷史完整性仍可驗證，但不得繼續主張目前狀態。
- `blocked`：保留期限已到，或總覽發現衝突、無效包、不安全路徑、不完整掃描或來源異動。

總覽另有 `upcoming` 提醒層，預設在下次重驗或保留期限 30 天內顯示。`upcoming` 不會把 GSC 的 `current` 改成 `review-due`，只表示應預先安排保存端重新觀察與簽發 GSR。

- 退出碼 `0`：全部鏈目前有效，且不在即將到期提醒窗。
- 退出碼 `2`：至少一鏈為 `upcoming` 或 `review-due`。
- 退出碼 `3`：總覽 `blocked`。
- 退出碼 `1`：命令、環境或快照格式無效。

## GSP 封閉快照

每份 GSP 是一個不覆寫的新資料夾，只含：

- `GSP-外部歸檔生命週期總覽-GSP-....json`
- `GSP-外部歸檔生命週期總覽-GSP-....html`

JSON 保存評估時間、相對案件路徑、逐鏈選取結果、期限、提醒、歷史檢查點、重複複本、無效包、掃描問題與 `GSP-...` 指紋；不保存來源根目錄的絕對路徑。HTML 完全由同一 JSON 決定性產生，沒有外部 script、字型或網路資源。缺檔、增檔、改名、JSON 或 HTML 竄改都會驗證失敗。

發布目的地必須與來源樹及本工具程式庫完全分離；位於來源樹內、包住來源樹，或位於工具程式庫內都會拒絕發布。程式庫另以 `.gitignore` 與 Pages artifact 排除規則防止誤納，但這些只是縱深防線，不能取代受控外部輸出位置。

封閉 JSON Schema 位於 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json`。Schema 只檢查交換欄位，不能取代 GSP 指紋、決定性 HTML、封閉資料夾或來源 GSC 完整重驗。

## CLI

```powershell
python -m backend.receiver_governance_archive_lifecycle_portfolio --openssl "C:\Program Files\Git\usr\bin\openssl.exe" scan `
  --source-root "D:\案件群" --upcoming-days 30
```

```powershell
python -m backend.receiver_governance_archive_lifecycle_portfolio --openssl "C:\Program Files\Git\usr\bin\openssl.exe" publish `
  --source-root "D:\案件群" --output-root "E:\受控治理快照" --upcoming-days 30
```

```powershell
python -m backend.receiver_governance_archive_lifecycle_portfolio verify-snapshot `
  --package "E:\受控治理快照\GSP-外部歸檔生命週期總覽-GSP-..."
```

`--as-of` 只供可重現測試或指定稽核基準時間；一般執行應省略，使用目前 UTC 時間。

## 責任邊界

- GSP 是內部治理總覽，不是 GSC、GSR、GAR、GAV 或外部保存庫的替代品。
- GSP 自我驗證通過，只表示當時總覽 JSON／HTML 未被改寫；目前狀態必須重新完整掃描來源 GSC。
- GSR 仍是保存端對其查詢結果的簽章證言，本工具不獨立觀察外部保存庫或供應者內部控制。
- GSP 不構成工程計算正確、設計核可、正式附件核可或法律保存程序完成。
- GSP、GSC、GSR、GAV、金鑰及核定證據都不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。
