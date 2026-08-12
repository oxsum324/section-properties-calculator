# 治理健康檢核點獨立驗證器

`驗證治理健康檢核點.bat` 用於在不啟動開挖擋土支撐服務、不連接專案資料庫且不讀取私人金鑰的情況下，重新驗證外部保存的治理健康簽章檢核點。

## 可驗證內容

- 只選 GHC：驗證 GCR、完整 GHE、Ed25519、Key ID、GHC 指紋與封閉欄位，確認內容未遭竄改；沒有 RTB 時只表示「簽章有效但信任未建立」。
- 加選 RTB：驗證公開信任清冊備份及其事件鏈；除核對 Key ID，也會比較完整 Ed25519 公鑰，再依該備份快照將簽章金鑰分類為受信任、未知或已撤銷。只有 Key ID、完整公鑰與受信任狀態都一致，才可建立目前清冊快照下的信任；相同公鑰可使用 raw Base64 或 PEM 表示。
- 再加選目前 GHE：比較檢核點與所提供歷程為相同、向前延伸、落後或分叉；只有受信任簽章且目前 GHE 相同或延伸，才標示為該份 GHE 的可信錨點。

雙擊 `驗證治理健康檢核點.bat` 後依序選檔即可。命令列也可使用：

```powershell
.\verify_receiver_governance_checkpoint.ps1 `
  -CheckpointPath "D:\records\checkpoint.json" `
  -TrustBackupPath "D:\records\trust-backup.json" `
  -CurrentHistoryPath "D:\records\current-history.json"
```

預設會在 GHC 旁產生 `GCV-治理健康檢核點驗證收據-GCV-....json`。GCV 保存來源檔名與 SHA-256、GHC／GCR／GHE 指紋、RTB／RTR 指紋、簽章信任分類、歷程關係及固定責任邊界；它不包含私鑰、帳號資料或專案資料庫內容。

驗證器對每個來源只讀取一次，使用同一份 bytes 解析內容並計算 SHA-256；輸出路徑不得等於任何來源檔，且既有 GCV 不會被覆寫。

## 證據邊界

GCV 是重新驗證結果，不是可脫離來源檔使用的單獨證明。保存或移交時應讓 GHC、使用的 RTB、使用的目前 GHE 與 GCV 一起保留；日後仍應從來源檔重新驗證，而不是只相信收據文字。

RTB 只證明該公開信任清冊在 `exportedAt` 快照中的狀態；因 `signedAt` 是簽署者可自陳的內容，即使 RTB 顯示金鑰受信任，也不能反推它在自陳簽署時間已受信任。RTB 不證明組織身分由第三方認證，也不證明 `signedAt` 是可信時間。GHC 與 GCV 都不能證明檔案確已離開本機、不能取代 RFC 3161 或文件管理系統不可變紀錄，也不構成工程核可或正式計算附件。外部保存位置、權限、保存年限與可信時間證據仍由組織另行管理。

若案件確實需要第三方可信時間，可在 GCV 完成後執行 `建立治理檢核可信時間請求.bat`，取得外部 TSA 回應後再執行 `完成治理檢核可信時間證據包.bat`。流程會建立可完整重驗的 GAM／GTS／GTV 證據包；詳細證明範圍、TSA 信任根與撤銷邊界見 `GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md`。

若還要證明保存端已接受封存物件與特定保留鎖，須在 GTV 後另走 GAD／GAP／GAR／GAV 外部歸檔收據流程；詳見 `GOVERNANCE_TRUSTED_ARCHIVE.md`。GAV 驗證保存端簽章證言，但不會即時查詢外部保存庫現況。
