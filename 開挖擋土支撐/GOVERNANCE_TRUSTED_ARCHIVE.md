# 治理可信時間外部 DMS／WORM 歸檔證據

本流程接續已通過驗證的 GTV 可信時間證據，建立可交付外部文件管理系統或 WORM 保存庫的單一封存物件，並驗證保存端針對該物件簽發的收據。它採供應商中立的離線交換契約，不會自行上傳、替組織選擇服務，或把本機複製冒充外部保存。

## 三種產物

- `GAD`：外部歸檔請求包。內含一份請求 JSON 與一份 `GAP` ZIP。
- `GAP`：待入庫的單一封存物件。它是未加密、未壓縮、無子資料夾的封閉平面 ZIP，保存一份可重新驗證的完整 GTV bytes。
- `GAR`：外部保存端在實際入庫後，以其 Ed25519 私人金鑰簽發的收據。它固定 GAD、GAP SHA-256／大小、保存端、保存庫、物件 ID、不可變版本 ID、入庫時間、保留模式、保存政策 ID、期限與 legal hold 狀態。
- `GAV`：本機以組織獨立核定的保存端公開金鑰驗證 GAR 後建立的完整證據包。它包含 GAD、GAP、GAR、保存端公開金鑰、實際金鑰核定證據檔與 GAV 驗證收據，可離線重驗。

`GAR` 與 `GAV` 的名稱是治理證據代碼，不是工程計算結果或計算書章節。

## 案件端流程

1. 先依 `GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md` 產生並重驗完整 GTV。
2. 雙擊 `建立治理可信時間外部歸檔請求.bat`，選取 GTV，填寫核定的保存端組織、保存庫識別碼、要求的不可變模式、保存政策 ID 與最低保留期限，並決定是否要求 active legal hold。
3. 將完整 GAD 資料夾交給外部保存端。真正要入庫的 bytes 是其中唯一的 `GAP-...zip`；GAD JSON 是不可任意改寫的要求與雜湊清單。
4. 外部保存端必須先把 GAP 實際存入指定保存庫、取得物件 ID 與不可變版本 ID，再簽發 GAR。只回覆電子郵件、截圖、上傳成功文字或未簽 JSON，不符合此交換契約。
5. 透過組織既有資安、契約或金鑰清冊，獨立取得並核對保存端 Ed25519 公開金鑰。不得只因 GAR 附了一把公鑰便自動信任。
6. 雙擊 `完成治理可信時間外部歸檔證據包.bat`，選取 GAD、GAR、已核定的公開金鑰與當時實際採用的核定證據檔，並記錄其政策、清冊、契約或簽署紀錄定位。核定證據會以原始 bytes 與 SHA-256 保存在 GAV，不得只留下文字說明。
7. 程式會重新驗證 GAP 內完整 GTV、GAR 簽章及全部保存條件。只有 `stored`、保存端／保存庫相符、不可變模式完全相符、實際期限不早於要求，且要求 legal hold 時狀態為 `active`，才會建立 GAV。
8. 日後雙擊 `驗證治理可信時間外部歸檔證據包.bat`，即可離線重驗 GAV 的六份檔案及其完整證據鏈。

## 不可變模式

GAD 只接受下列明確模式：

- `worm-compliance`
- `worm-governance`
- `retention-lock`

保存端 GAR 必須回覆與請求完全相同的模式。一般版本控制、備份、唯讀檔案、Windows 權限或 `versioned-dms` 不等於不可變保留鎖，因此不能用來完成 GAV。

## 外部保存端簽發 GAR

供應者可依 `governance-trusted-timestamp-external-archive-provider-receipt.v1` 自行實作介接，也可在隔離的保存端環境使用隨附 CLI。私人金鑰只由 `issue-receipt` 讀取，不會寫入 GAR 或 GAV：

GAD 與 GAR 的機器可讀契約位於 `GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json`（JSON Schema draft 2020-12）。供應者實作必須保留封閉欄位與簽章 payload 規則；通過一般 schema 驗證仍不能取代本工具對指紋、簽章、保留條件及完整 GTV 的重驗。

```powershell
python -m backend.receiver_governance_archive issue-receipt `
  --prepared-directory "D:\incoming\GAD-..." `
  --private-key "D:\provider-secret\archive-receipt-ed25519.pem" `
  --archive-object-id "object-20260812-0001" `
  --version-id "immutable-version-0001" `
  --stored-at "2026-08-12T08:01:00Z" `
  --retention-until "2037-08-12T00:00:00Z" `
  --legal-hold-status active
```

這個指令不會替保存端執行入庫。保存端只有在其自身系統已確認 GAP 實際入庫、物件與版本 ID、保留鎖及 legal hold 後才能簽發。由案件端拿自己的金鑰執行此指令，只能製造自己的聲明，不能證明第三方保存。

若私人金鑰有密碼，使用 `--private-key-password-env` 指定只存在於保存端程序環境的密碼變數。不要把密碼放進命令列、GAD、GAR 或案件資料夾。

## 案件端命令列

```powershell
python -m backend.receiver_governance_archive prepare `
  --gtv-package "D:\records\GTV-..." `
  --provider-organization "External Records Custodian" `
  --repository-id "records-vault-01" `
  --immutability-mode worm-compliance `
  --retention-policy-id "records-policy-RP-12" `
  --retention-until "2036-08-12T00:00:00Z" `
  --require-legal-hold

python -m backend.receiver_governance_archive finalize `
  --prepared-directory "D:\records\GAD-..." `
  --provider-receipt "D:\returned\GAR-...json" `
  --provider-public-key "D:\approved-keys\archive-provider.pem" `
  --provider-key-approval-evidence "D:\approved-keys\RP-12-approved-key-list.pdf" `
  --provider-key-approval-basis "Records policy RP-12 approved key list, item 4"

python -m backend.receiver_governance_archive verify `
  --package "D:\records\GAV-..."
```

Windows 入口會優先使用 PATH 中的 OpenSSL，否則尋找 Git for Windows 隨附版本。`prepare`、`finalize` 與 `verify` 可在子命令之前用 `--openssl` 指定經組織核定的執行檔；明確指定錯誤路徑時會失敗，不會暗中改用其他版本。

## GAV 能證明什麼

通過的 GAV 表示：

- GAP bytes 與 GAD 所列 SHA-256、大小完全相符；
- GAP 是封閉、未加密、未壓縮的平面 ZIP，且內含的 GTV 可完整重驗；
- GAR 簽章可由本次明確選取的 Ed25519 公開金鑰驗證；
- GAR 固定相同 GAD、GAP、保存端、保存庫、物件 ID 與不可變版本 ID；
- GAR 自陳已入庫，且不可變模式、保留期限及必要的 legal hold 滿足原 GAD；
- GAV 保存了重驗所需的同一份 bytes及實際金鑰核定證據檔，缺檔、增檔、改名、重複可攜式檔名或內容竄改均會失敗。

## 仍須人工治理的範圍

- GAR 是保存端的密碼學簽章證言。驗證器不連線查詢外部保存庫，因此不會獨立觀察物件目前是否仍存在、是否真的位於異地，或保存端內部控制是否依契約運作。
- 保存端公開金鑰的組織歸屬、核定狀態、輪替、撤銷與契約效力，必須由案件外的正式程序確認。GAV 會保存當時選取的核定證據 bytes 與追溯文字，但驗證器不會判讀該文件內容或自行建立信任。
- GAV 驗證的是簽發當時的收據與保存要求。長期案件仍應依保存政策定期抽查外部物件、續期保留鎖、處理 legal hold 解除與保存供應者移轉。
- 長期週期重驗可接續使用 GSR／GSC 流程；保存端必須先實際重新查詢同一物件與保存狀態，案件端再以現行核定公開金鑰建立具重驗期限與保留期限預警的封閉檢查點。詳見 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md`。
- RFC 3161 時間戳證明 GAP 內容最遲於 TSA `genTime` 已存在；GAR 的 `storedAt` 與 `signedAt` 則是保存端簽署的時間聲明，兩者意義不同。
- GAV 不代表工程內容正確、計算結果核可或附件正式核可。

## 計算書與公開邊界

GAD、GAP、GAR、保存端公開金鑰與 GAV 都是內部治理／稽核證據，不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。正式計算書仍只呈現工程輸入、計算過程、規範依據、結果與核可狀態；外部保存證據應留在案件的受控治理區。
