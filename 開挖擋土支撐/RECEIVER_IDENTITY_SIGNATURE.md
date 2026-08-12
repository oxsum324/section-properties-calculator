# RVR／SEV 身分與治理健康檢核點數位簽章合約

本合約在既有 `receiver-capacity-verification-receipt`（RVR）內容完整性指紋之外，提供可選的 Ed25519 回簽身分驗證。未簽 RVR 保持相容，仍可驗證工程內容，但回簽身分必須人工核對。

同一合約亦適用於 `source-capacity-evidence-verification-record`（SEV）。SEV 使用相同 Ed25519 金鑰格式與本機信任清冊，但以獨立的簽署內容、`SSR-` 請求指紋及簽章回應種類隔離，避免 RVR 簽章被重播成 SEV 簽章。未簽 SEV 仍可證明逐列檔案雜湊核對結果，但核驗身分必須人工核對。

## 信任狀態

- `manual-review-required`：未附簽章。
- `valid-signature-untrusted-key`：簽章有效，但公鑰尚未登錄本機信任清冊。
- `valid-signature-revoked-key`：簽章有效，但公鑰已撤銷。
- `valid-signature-organization-mismatch`：簽章有效，但清冊單位與 RVR 回簽單位不同。
- `trusted-signature-valid`：簽章有效、公鑰受信任且單位相符。

## identitySignature 欄位

```json
{
  "schemaVersion": 1,
  "algorithm": "Ed25519",
  "keyId": "RVK-<SHA256(raw-public-key) 前 20 個大寫十六進位字元>",
  "publicKeyBase64": "<32-byte raw Ed25519 public key>",
  "signedAt": "<ISO 8601 date-time>",
  "signatureBase64": "<64-byte Ed25519 signature>"
}
```

RVR 的 `identitySignature` 與 `receiptFingerprint`、SEV 的 `identitySignature` 與 `verificationFingerprint` 均彼此分離，因此加入或更新簽章不會改變原內容指紋。驗章前仍須先通過完整的 SEV／RVR／ERH／ERT 關聯與受控欄位驗證。

RVR v3 以上版本的逐列承載力文件資料與 `fileSha256` 會納入 `receiptFingerprint`；RVR v4 的正式模型、控制載重組合、傳力與分配、偏心與二次效應、已檢核極限狀態也一併受保護。RVR v5 再加入五類補充查核的狀態、依據與個別證據檔資料，其他檢核彙整由後端自動推導；SEV v2 依 ERT 與證據種類逐一核對所有被引用檔案。證據檔本身不會嵌入 RVR、SEV 或簽署訊息，結構化欄位也不表示工具已重算工程內容。來源端仍須人工核對文件編號、版次、日期、頁碼、驗算範圍及內容。

## 簽署訊息

簽署端必須把下列物件以 UTF-8、鍵名排序、無多餘空白的 JSON 形式序列化，再以 Ed25519 對完整 bytes 簽署：

```json
{
  "context": "receiver-verification-identity-signature-v1",
  "handoffFingerprint": "<ERH fingerprint>",
  "organization": "<verificationAuthority.organization 去除首尾空白>",
  "receiptFingerprint": "<RVR fingerprint>",
  "signedAt": "<identitySignature.signedAt>",
  "sourceCalculationFingerprint": "<CF fingerprint>"
}
```

SEV 使用另一個不可互換的簽署訊息：

```json
{
  "context": "source-evidence-verification-identity-signature-v1",
  "handoffFingerprint": "<ERH fingerprint>",
  "organization": "<verificationAuthority.organization 去除首尾空白>",
  "receiptFingerprint": "<RVR fingerprint>",
  "signedAt": "<identitySignature.signedAt>",
  "sourceCalculationFingerprint": "<CF fingerprint>",
  "verificationFingerprint": "<SEV fingerprint>"
}
```

私人金鑰應留在接收單位既有的簽章設備、金鑰庫或離線程序。本工具只接收公開金鑰與已完成的簽章，不產生、不上傳也不保存私人金鑰。本機信任清冊是來源端管理者的採信決策；登錄前應透過獨立管道核對公鑰指紋與所屬單位。

若接收單位尚無既有 Ed25519 私鑰，可使用 `建立RVR組織簽章金鑰.bat` 建立密碼加密私鑰與具持有證明的公開 RKE 登錄包；建鑰、輪替與撤銷程序詳見 `RECEIVER_KEY_MANAGEMENT.md`。

輪替 RKE 登錄後只會建立新舊 Key ID 關聯，不會自動撤銷舊金鑰。管理者必須先完成新金鑰測試簽署與使用端切換，再由具申請角色的本機登入帳號建立具事件指紋、變更編號、切換摘要與 72 小時期限的輪替完成申請；第二個具覆核角色且 operator ID 不同的帳號另行覆核後，後端重驗關聯、單位與受信任狀態，才以不可復原事件撤銷正確的舊金鑰。SQLite 的交易鎖、唯一待審約束與異人 CHECK 使同一申請在多程序同時操作時只能成功一次，申請與完成事件會互相綁定。

本機帳號能驗證同一服務資料庫內的帳號、角色與工作階段，不等於外部組織目錄、自然人身分或公司授權已由第三方驗證；正式組織仍須以既有簽核或身分系統決定帳號與權限。JSON 事件清冊與 SQLite claim 不是跨檔單一原子交易，任何缺少 claim 或狀態矛盾都必須失敗關閉並人工稽核。疑似外洩、確認外洩或私鑰遺失應立即撤銷，不得等待輪替覆核期限。

本機信任清冊可另匯出只含公開資料的 `RTB-...`／`RTR-...` 雙指紋備份。匯入只建立差異預覽，不自動改動清冊；有效清冊只允許事件鏈向前延伸，禁止用舊備份逆轉撤銷或刪除既有 Key ID。備份、復原及保護副本規則詳見 `RECEIVER_KEY_MANAGEMENT.md`。

定期備份可另以隔離暫存清冊執行真實復原演練，成功後產生 `RDR-...` 收據；演練不得寫入正式清冊，也不會把治理證據帶入計算書。

撤銷必須保存原因分類、處理摘要、處理者、時間及選用的事故／案件編號，並寫入串接 `RVE-...` 指紋的本機事件清冊。已撤銷 Key ID 不得復原或覆寫原事件；若為誤撤銷，應建立並核對新的 Key ID。事件指紋只支援本機稽核與竄改偵測，不等於外部可信時間戳。

## 不需編輯 JSON 的離線簽署流程

1. 在「接收端回簽助手」建立或載入未簽 RVR，按「下載離線身分簽署請求」，取得 `receiver-verification-identity-signing-request`（RSR）JSON。
2. 接收單位於自己的電腦雙擊 `簽署RVR身分請求.bat`，依序選取 RSR 與既有 Ed25519 PEM 私人金鑰。若私鑰已加密，程式只在本機終端提示密碼。
3. 離線程式驗證 RSR 指紋與實際簽署 bytes 一致後，產出 `receiver-verification-identity-signature-response` JSON。
4. 回到助手按「匯入離線簽章回應」。後端會重新核對 RSR、RVR、ERH、來源計算指紋與回簽單位，驗證 Ed25519 簽章後下載已簽 RVR。
5. 公鑰仍須由來源端管理者經獨立管道核對並登錄本機信任清冊，才能顯示「受信任簽章通過」。

命令列環境也可直接執行：

```powershell
python -m backend.sign_receiver_request --request <RSR、SSR 或 GCR.json> --private-key <Ed25519-private-key.pem> --output <signature-response-or-checkpoint.json>
```

同一離線簽署器也接受管理頁匯出的治理健康 `GCR-...` 請求；Windows 可直接執行 `簽署治理健康檢核點.bat`。輸出為 `GHC-...` 簽章檢核點，應保存於接收端服務主機之外，再由管理頁匯入驗證目前 GHR 是否相同、延伸、落後或分叉。外部保存位置也可執行 `驗證治理健康檢核點.bat`，不啟動服務或讀取專案資料庫；搭配公開 RTB 與目前 GHE 會產生綁定來源 SHA-256 的 `GCV-...` 重新驗證收據。GCV 不能脫離來源檔單獨使用。若組織另採 RFC 3161 TSA，可由 GAM／GTS／GTV 流程將 GCV 與來源綁定到外部 TSA `genTime`；工具不自行選擇 TSA，且不查 OCSP／CRL。GHC 使用獨立的簽章 context，不會與 RSR／SSR 混用；GHC／GCV／GAM／GTS／GTV 都不是 RVR／SEV 工程身分核可或正式計算附件，沒有通過 GTV 的 GHC／GCV 也不是第三方時間戳。

SEV 操作不需命令列：在 SEV 區塊下載 `SSR-` 請求後，雙擊 `簽署SEV身分請求.bat`，依序選擇 SSR 與既有 Ed25519 PEM 私鑰，再回到原畫面匯入產出的 `source-evidence-verification-identity-signature-response` JSON。相同的 Python 指令也會依請求種類自動產生正確的 RVR 或 SEV 回應，且兩者都不包含私人金鑰或密碼。

簽章回應會包含完整 RSR 與下列公開資料，不包含私人金鑰或密碼：

```json
{
  "schemaVersion": 1,
  "kind": "receiver-verification-identity-signature-response",
  "signingRequest": { "requestFingerprint": "RSR-..." },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "RVK-...",
    "publicKeyBase64": "...",
    "signatureBase64": "..."
  }
}
```
