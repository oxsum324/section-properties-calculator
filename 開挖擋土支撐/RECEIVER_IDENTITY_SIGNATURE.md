# RVR 回簽身分數位簽章合約

本合約在既有 `receiver-capacity-verification-receipt`（RVR）內容完整性指紋之外，提供可選的 Ed25519 回簽身分驗證。未簽 RVR 保持相容，仍可驗證工程內容，但回簽身分必須人工核對。

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

`identitySignature` 與 `receiptFingerprint` 均不納入 RVR 指紋運算，因此在既有 RVR 加入簽章不會改變其內容指紋。驗章前仍須先通過完整的 RVR、ERH 與 ERT 關聯驗證。

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

私人金鑰應留在接收單位既有的簽章設備、金鑰庫或離線程序。本工具只接收公開金鑰與已完成的簽章，不產生、不上傳也不保存私人金鑰。本機信任清冊是來源端管理者的採信決策；登錄前應透過獨立管道核對公鑰指紋與所屬單位。

## 不需編輯 JSON 的離線簽署流程

1. 在「接收端回簽助手」建立或載入未簽 RVR，按「下載離線身分簽署請求」，取得 `receiver-verification-identity-signing-request`（RSR）JSON。
2. 接收單位於自己的電腦雙擊 `簽署RVR身分請求.bat`，依序選取 RSR 與既有 Ed25519 PEM 私人金鑰。若私鑰已加密，程式只在本機終端提示密碼。
3. 離線程式驗證 RSR 指紋與實際簽署 bytes 一致後，產出 `receiver-verification-identity-signature-response` JSON。
4. 回到助手按「匯入離線簽章回應」。後端會重新核對 RSR、RVR、ERH、來源計算指紋與回簽單位，驗證 Ed25519 簽章後下載已簽 RVR。
5. 公鑰仍須由來源端管理者經獨立管道核對並登錄本機信任清冊，才能顯示「受信任簽章通過」。

命令列環境也可直接執行：

```powershell
python -m backend.sign_receiver_request --request <RSR.json> --private-key <Ed25519-private-key.pem> --output <signature-response.json>
```

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
