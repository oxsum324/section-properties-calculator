# 治理健康檢核點 RFC 3161 可信時間證據

本流程在既有 GHC／GCV 完整性與信任驗證之外，選配外部 RFC 3161 時間戳。它不會自行連線或替組織選擇時間戳服務，而是建立標準查詢，再以組織明確採用的 TSA 信任根離線驗證回應。

## 使用時機

當 GHC 只保存在本機時，Ed25519 可證明內容由對應私鑰簽署，但 `signedAt` 仍是自陳時間。若案件需要第三方時間證據，可在產生並保存 GCV 後執行下列流程：

1. 雙擊 `建立治理檢核可信時間請求.bat`。
2. 選取 GCV。程式會依 GCV 自動尋找同資料夾的 GHC、RTB 與目前 GHE；找不到時才要求選檔。
3. 程式重新驗證 GCV 可由所選來源完整重建，再建立 `GAM-...` 請求包。包內是來源檔的同一份 bytes、封閉的 GAM 清單及 `GTS-...tsq`。
4. 依組織核定程序將 GTS 查詢送交 RFC 3161 TSA。網路傳送、帳號、費用、TSA URL、服務條款與回應下載均由組織管理；本工具不內建或暗中呼叫任何 TSA。
5. 取得 DER 格式的時間戳回應（通常為 `.tsr` 或 `.tst`）及組織核定的 PEM TSA 信任根；若 TSA 另提供 PEM 中繼鏈，也一併保存。憑證檔只能含公開 `CERTIFICATE`／`TRUSTED CERTIFICATE` 區塊，混入私鑰或其他資料會被拒絕且不會封裝。
6. 雙擊 `完成治理檢核可信時間證據包.bat`，選取 GAM 請求包、TSA 回應、信任根與選用中繼鏈。
7. 程式以 OpenSSL 同時驗證「TSA 回應 ↔ 原 GTS nonce」及「TSA 回應 ↔ GAM 實際 bytes」，再建立完整 `GTV-...` 證據包並立刻唯讀重驗。
8. 日後雙擊 `驗證治理檢核可信時間證據包.bat`，選取完整 GTV 資料夾即可重驗全部檔案雜湊、GCV／GHC／RTB／GHE、GAM、GTS、TSA 回應與憑證鏈。

## 命令列

```powershell
python -m backend.receiver_governance_timestamp prepare `
  --verification-receipt "D:\records\verification.json" `
  --checkpoint "D:\records\checkpoint.json" `
  --trust-backup "D:\records\trust-backup.json" `
  --current-history "D:\records\current-history.json"

python -m backend.receiver_governance_timestamp finalize `
  --prepared-directory "D:\records\GAM-治理檢核可信時間請求包-..." `
  --timestamp-response "D:\download\response.tsr" `
  --trust-anchor "D:\policy\tsa-root.pem" `
  --untrusted-chain "D:\download\tsa-chain.pem"

python -m backend.receiver_governance_timestamp verify `
  --package "D:\records\GTV-治理檢核可信時間證據包-..."
```

Windows 入口會優先使用 PATH 中的 OpenSSL，否則尋找 Git for Windows 隨附的 OpenSSL。命令列可在子命令之前用 `--openssl` 指定經組織核定的執行檔。

## 實際證明範圍

通過的 GTV 表示：

- GAM 清單與其列出的 GCV、GHC、選用 RTB、選用目前 GHE bytes 完全相符；
- GCV 可由包內來源重新建立，並保留原完整性、簽章信任、歷程關係與錨定狀態；
- TSA 回應的 message imprint 是 SHA-256，查詢 nonce 相符；
- TSA 回應的憑證鏈可連到本次明確選取的信任根；
- GAM 實際 bytes 最遲於 TSA 回應所列 `genTime` 已存在，前提是採用者接受該 TSA、信任根與 policy identifier。

GAM 的 `createdAt` 與 GTV 的 `verifiedAt` 都是本機時間，不是可信時間。可信時間只能來自已驗證的 TSA `genTime`。

## 不可省略的人工治理

- TSA 信任根必須由組織既有資安、憑證或文件治理程序核定，不能只因檔案可被 OpenSSL 讀取就採信。
- 本工具不查詢 OCSP／CRL，也不證明 TSA 憑證在日後仍未被撤銷；長期保存應另依組織政策保存撤銷資訊、TSA 政策與必要的續時戳證據。
- 通過 HTTPS 下載不等於 TSA 信任；必須保存實際回應與驗證時採用的信任根／中繼鏈。
- RFC 3161 證明的是內容最遲於 `genTime` 已存在，不證明內容在該時間已完成工程核可，也不證明檔案已存入異地、WORM、保留鎖或文件管理系統。
- 若要主張外部保存，仍須另保留文件管理系統的不可變版本、保留政策、存取紀錄或其他組織證據。

若組織需要保存端對實際入庫、物件／版本 ID、保留鎖與 legal hold 簽署負責，可接續執行 `建立治理可信時間外部歸檔請求.bat`、取得外部保存端 GAR 後執行 `完成治理可信時間外部歸檔證據包.bat`。GAD／GAP／GAR／GAV 的交換契約與證明限制見 `GOVERNANCE_TRUSTED_ARCHIVE.md`。

GAV 只證明初始入庫回覆與當時保存條件；長期案件應由保存端定期重新觀察同一物件與版本並簽發 GSR，再由案件端建立 GSC。GSC 到期後仍可驗證歷史完整性，但不能當作目前保存狀態仍有效；週期契約見 `GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md`。

## 計算書邊界

GAM、GTS、TSA 回應、TSA 憑證與 GTV 都是治理證據，不是工程計算內容，不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。它們可與案件主文分開保存在內部歸檔或稽核區；計算書仍只保留採用輸入、計算過程、規範依據、工程結果與核可狀態。
