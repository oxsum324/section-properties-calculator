# 外部歸檔生命週期檢查點

本流程接續已完成的 `GAV`，用來處理「初始入庫收據有效，但長期案件仍需定期確認外部物件現況」的問題。

## 證據角色

- `GSR`：保存端週期狀態收據。保存端必須先在自身 DMS／WORM 保存庫重新查詢同一物件與不可變版本，確認物件存在、重新取得或計算 GAP SHA-256 與 bytes、不可變鎖、保留政策、期限及 legal hold，才可用當時有效的 Ed25519 私人金鑰簽發。
- `GSC`：案件端生命週期檢查點。案件端會完整重驗原 GAV、GSR 簽章、明確選取的現行保存端公開金鑰及其實際核定證據，只在物件存在、內容雜湊相符、不可變狀態 active、保存政策相同、期限涵蓋下一次重驗且必要 legal hold 仍 active 時建立。

GSR／GSC 是治理證據代碼，不是工程計算結果或計算書章節。

## 建議工作流程

1. 依組織保存政策決定重驗週期，例如 90 天，以及保留期限預警期，例如 180 天。
2. 將原 GAD、GAR 與外部物件識別交給保存端。保存端必須實際重新查詢保存庫，不能只重開舊 GAR、讀取案件端 GAV 或查看本機副本。
3. 保存端在隔離環境雙擊 `簽發外部歸檔週期狀態收據.bat`，或使用 `issue-status` CLI，填入實際觀察時間、方法、稽核事件 ID、物件 SHA-256／bytes、不可變模式與狀態、保留政策與期限、legal hold 狀態。
4. 案件端不得直接信任 GSR 夾帶的公開金鑰。應從組織核定的金鑰清冊、契約或資安程序獨立取得現行公開金鑰；如已輪替，必須取得新金鑰的核定證據。
5. 案件端雙擊 `建立外部歸檔生命週期檢查點.bat`，選取完整原 GAV、GSR、現行公開金鑰及其核定證據，建立封閉五檔 GSC。
6. 日後雙擊 `驗證外部歸檔生命週期檢查點.bat`，會先完整重驗原 GAV 與 GSC，再依現在時間評估狀態。

## 狀態語意與退出碼

- `current`／退出碼 `0`：檢查點完整，尚未到下一次重驗期限，也未進入保留期限預警窗。
- `review-due`／退出碼 `2`：歷史簽章與 bytes 仍有效，但已到週期重驗期限，或已進入保留期限預警窗。應取得新的保存端觀察與 GSR，不得把舊檢查點繼續當成目前狀態。
- `blocked`／退出碼 `3`：歷史證據仍可驗證，但 GSR 所列保留期限已到。應停止以此檢查點主張目前保存狀態，依組織程序處理續期、legal hold、事故調查或保存移轉。
- 格式、簽章、來源、封閉檔案或 bytes 驗證失敗／退出碼 `1`：證據本身無法成立；不是單純到期提醒。

到期不會改寫或刪除舊 GSC。歷史完整性與目前生命週期狀態分開判定；歷史檢查點保留「當時曾取得哪一份保存端簽章證言」的證據價值，但不得被解讀為目前仍有效。

## 保存端 CLI

```powershell
python -m backend.receiver_governance_archive_lifecycle issue-status `
  --archive-request "D:\records\GAD-外部歸檔請求-GAD-....json" `
  --provider-receipt "D:\records\GAR-外部歸檔簽章收據-GAR-....json" `
  --private-key "D:\provider-secret\archive-lifecycle-ed25519.pem" `
  --observed-at "2026-09-01T00:00:00Z" `
  --object-status present `
  --content-hash-status matched `
  --observed-object-sha256 "<repository-observed-sha256>" `
  --observed-object-size-bytes 123456 `
  --immutability-status active `
  --immutability-mode worm-compliance `
  --retention-policy-id records-policy-RP-12 `
  --retention-until "2038-08-12T00:00:00Z" `
  --legal-hold-status active `
  --observation-method repository-api-sha256 `
  --observation-reference audit-event-20260901-0001
```

`issue-status` 不會連線或查詢保存庫。它只把保存端已完成的觀察結果簽章；由未實際控制保存庫的人執行，只能形成該人的聲明，不能證明第三方保存現況。私人金鑰只在保存端環境使用，不得交給案件端或放入 GSC。

GSR 與 GSC 的封閉 JSON Schema 位於 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json`。Schema 驗證不能取代指紋、簽章、原 GAV、內容雜湊、保留期限與完整封閉包重驗。

## 案件端 CLI

```powershell
python -m backend.receiver_governance_archive_lifecycle --openssl "C:\Program Files\Git\usr\bin\openssl.exe" finalize-checkpoint `
  --gav-package "D:\records\GAV-..." `
  --provider-status-receipt "D:\returned\GSR-...json" `
  --provider-public-key "D:\approved-keys\current-provider.pem" `
  --provider-key-approval-evidence "D:\approved-keys\current-key-register.pdf" `
  --provider-key-approval-basis "Records policy RP-12 current key register" `
  --review-interval-days 90 `
  --maximum-observation-age-hours 72 `
  --retention-warning-days 180

python -m backend.receiver_governance_archive_lifecycle --openssl "C:\Program Files\Git\usr\bin\openssl.exe" verify-checkpoint `
  --package "D:\records\GSC-..."
```

GSC 會把完整原 GAV 封裝成未加密、未壓縮、無子資料夾的單一 ZIP，另保存 GSR、現行公開金鑰、實際核定證據及 GSC JSON。缺檔、增檔、改名、壓縮、加密、重複可攜式檔名、私人金鑰混入、內容替換或重驗期間來源變更均失敗關閉。

## 金鑰輪替

GSR 可以由原 GAR 之後新核定的保存端金鑰簽發。案件端必須明確選取該次 GSR 的現行公開金鑰，並把新金鑰的實際核定證據 bytes 與 SHA-256 納入 GSC。驗證器只驗證所選金鑰與簽章，不會自行判斷核定文件真偽、組織歸屬、撤銷狀態或契約效力。

## 責任邊界

- GSR 是保存端對其實際查詢結果的密碼學簽章證言；案件端驗證器不直接連線觀察外部保存庫。
- GSC 能證明原 GAV、最新 GSR、所選公開金鑰與核定證據 bytes 在當時相互一致，不證明保存端內部控制、稽核事件或 API 回覆一定真實。
- `current` 只表示未超過本 GSC 設定的週期與期限門檻，不取代組織保存政策、供應者契約、撤銷查核、legal hold 解除程序、事故處理或保存移轉。
- GSR／GSC 不代表工程內容正確、計算結果核可或正式附件核可。
- GSR、GSC、原 GAV、公開金鑰及核定證據都屬內部治理／稽核資料，不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。
