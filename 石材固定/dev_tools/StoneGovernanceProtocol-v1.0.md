# StoneGovernanceProtocol v1.0

**Version**: 1.0.0
**Status**: Stable
**Date**: 2026-04-29
**Owner**: 弘一工程顧問有限公司（歐瀚文 執業土木技師）
**Implements**: 石材計算書產生器 V2.4.0–V2.9.1（合 33 輪迭代）

---

## 1. 目的

定義一組**機讀 + 人讀**雙形式之治理欄位與互動規範，使石材外牆固定構件計算書（或同類工程計算書）於簽證流程中具備：

1. **可驗證性**：計算工具版本、規範版本、輸入輸出皆有指紋
2. **可追溯性**：規範變動 / ack 編輯 / 工具升級皆可由指紋與序列重建
3. **可比對性**：兩份報告之治理狀態可機械比對
4. **可申明性**：採用非預設規範或漂移狀態必須留下技師工程判斷

本協定不規定計算邏輯本身，僅規定**治理 metadata 與互動流程**。

---

## 2. 治理鏈四維度

| 維度 | 對應內容 | 主要 hash 欄位 |
|---|---|---|
| **D1 工具** | calc-core JS 內容 | `calc_source_hash`（SHA-256）|
| **D2 規範** | 各 scope 之 active profile params | `code_profiles_hashes`（cyrb53 per scope）|
| **D3 一致性** | profile 與最近 archive 比對 | `code_profiles_changelog` |
| **D4 申明** | 技師對 D1–D3 變動之說明 | `governance_ack_hash`（cyrb53 三方）|

---

## 3. result.meta 欄位定義

任何 protocol-compliant 計算工具須於計算結果 meta 中寫入以下欄位：

```jsonc
{
  "meta": {
    // ── 通用 ──
    "app_version":                    "V3.0.0",
    "governance_protocol_version":    "1.0.0",
    "calculator_version":             "...",
    "formula_registry_version":       "...",
    "input_schema_version":           "...",
    "code_profiles_registry_version": "...",
    "generated_at":                   "ISO 8601 timestamp",

    // ── D1 工具 ──
    "calc_source_hash":         "sha256:<64 hex>",         // SHA-256 of calc-core JS files (concat with file boundary)
    "calc_source_files":        { "<filename>": "sha256:..." },

    // ── D2 規範 ──
    "code_profiles":            { "<scope>": { "id": "...", "name": "...", "issued": "..." } },
    "code_profiles_hashes":     { "<scope>": { "id": "...", "hash": "cyrb53:<14 hex>" } },

    // ── D3 一致性（與最近 archive 比對）──
    "code_profiles_changelog":  {
      "ok": true|false,
      "anyChanged": true|false,
      "anyNew": true|false,
      "perScope": {
        "<scope>": {
          "id": "...",
          "changed": true|false,
          "newProfile": true|false,
          "currentHash": "cyrb53:...",
          "archiveHash": "cyrb53:...",
          "archiveVersion": "V2.X.Y",
          "archiveDate": "YYYY-MM-DD"
        }
      }
    },

    // ── D4 申明 ──
    "governance_ack":           "技師補述文字（trim 後；無 trigger 且無補述時為 null）",
    "governance_ack_hash":      "ack:<14 hex>",            // cyrb53 of {overrides, drifts, ackText}
    "governance_fingerprint":   "gov:<14 hex>",            // cyrb53 of (calc_source_hash + '|' + canonicalJSON(code_profiles_hashes))

    // ── 輸入輸出指紋（V2.0–V2.1 既有）──
    "input_hash":              "sha256:...",
    "normalized_input_hash":   "sha256:...",
    "result_hash":             "sha256:..."
  }
}
```

---

## 4. Hash 演算法規範

### 4.1 SHA-256

| 欄位 | 輸入 |
|---|---|
| `calc_source_hash` | calc-core JS 全檔內容串接（含 file boundary marker `\n---FILE-BOUNDARY---\n`）|
| `input_hash` | 序列化 input |
| `normalized_input_hash` | schema validate 後的 normalized input |
| `result_hash` | 序列化 result（不含 meta hash 欄位）|

格式：`sha256:` + 64 字元 lowercase hex。

### 4.2 cyrb53（53-bit deterministic hash）

| 欄位 | 輸入 |
|---|---|
| `code_profiles_hashes[scope].hash` | `_canonicalJSON(profile.params)` |
| `governance_fingerprint` | `calc_source_hash + '|' + _canonicalJSON(code_profiles_hashes)` |
| `governance_ack_hash` | `_canonicalJSON({ overrides, drifts, ackText })` |

格式：
- profile params hash：`cyrb53:` + 14 字元 lowercase hex
- governance fingerprint：`gov:` + 14 字元 lowercase hex
- ack hash：`ack:` + 14 字元 lowercase hex

### 4.3 _canonicalJSON 規範

確定性 JSON 序列化：
- 物件之鍵遞迴排序（升序）
- 字串以 JSON 標準 escape
- 數值維持 `JSON.stringify` 預設行為
- 陣列維持原順序

```js
function _canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_canonicalJSON).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _canonicalJSON(value[k])).join(',') + '}';
}
```

### 4.4 為何 D2/D4 不採 SHA-256

D2/D4 hash 用於 footer / 檔名 / 徽章顯示，需要：
- 同步計算（無 async / await）
- 短長度（14 hex 適合 UI 嵌入）
- 不需密碼學防偽（governance 用途，非簽名）

cyrb53 53-bit 碰撞率 ~0.0001%，足夠 governance 場景。

---

## 5. 治理欄位 trigger 條件

### 5.1 governance_ack_hash 觸發

```
triggered = (overrides.length > 0) OR (drifts.length > 0)
```

無 trigger 且 ack 文字為空時，`governance_ack_hash` 為 `null`。

### 5.2 governance_fingerprint 觸發

```
calc_source_hash 必要；缺失時 governance_fingerprint = null
```

file:// 環境下因 fetch 限制 calc_source_hash 通常為 null，此時 governance_fingerprint 亦為 null。

### 5.3 ack 必填閘門

匯出檢查須對以下情境發出 WARN（級別非 BLOCK）：

```
WARN if:
  triggered === true
  AND inp.governance_ack 為空
```

文字建議：「規範採用聲明欄位（governance_ack）為空，但已偵測到：採用非預設 profile（N 個 scope）。簽證前請補充採用理由與工程判斷依據。」

---

## 6. 整合點

| 整合點 | 必須含 |
|---|---|
| HTML 法規 footer | calc_source_hash + governance_fingerprint + ack hash 各一列徽章 |
| 匯出檔名 | `_gov-XXXXXX` 後綴（governance_fingerprint 前 6 hex）|
| docx 直接匯出 | review summary 區塊嵌入規範採用聲明 + ack 文字 |
| 封面 + 送審速覽 | 治理指紋 footer 文字 |
| 稽核 JSON `trace` 區段 | 完整 meta 欄位寫入 |
| audit_compare CLI | 比對兩份稽核 JSON 之治理欄位差異 |
| 治理 dashboard | 4 區塊單頁總覽（HTML + 純文字雙形式）|

---

## 7. 視覺規範

### 7.1 配色語意

| 色系 | 語意 |
|---|---|
| 綠（#1a7a3a / #e7f5e9）| ✓ 狀態正常 / 已處置 |
| 橘（#b3471d / #fdebd0）| ⚠ 需檢視 / 待處置 |
| 暖黃（#7a5210 / #fffaef）| 規範採用聲明（governance 主題）|
| 灰藍（#4a6c8d / #eef2f7）| ack 演變紀錄 |
| 淡綠（#1a3a1c / #f7faf7）| dashboard 主面板 |

### 7.2 印刷規範

| 元素 | 列印行為 |
|---|---|
| dashboard `<details>` | 保留；可由 print CSS 控制是否展開 |
| 操作按鈕（複製 / A/B 比較）| `display:none !important` |
| 規範自檢徽章 | 保留 |
| 治理指紋 / 聲明指紋 | 保留 |

---

## 8. 治理一致性 dashboard

dashboard 須含以下 4 區塊（`<details>` 預設可展開），順序固定：

1. **① 治理指紋**：calc_source_hash 狀態 + governance_fingerprint + scope × {id, hash} 表格
2. **② profile 驗證**：validateAllProfiles + auditProfileAgainstConsts
3. **③ archive 漂移**：anyChanged + 漂移 scope 清單
4. **④ ack 狀態**：trigger 狀態 + ack 字數 + ack_hash + 演變次數

整體狀態 pill：

```
allOk = calcOk AND schemaOk AND consistOk AND archiveOk AND ackOk
ackOk = NOT triggered OR ackProvided
```

---

## 9. 純文字摘要規範

固定 60 字元寬，4 區塊與 dashboard 一一對應：

```
治理一致性總覽（V<版本> / <時間戳>）
============================================================
整體狀態：✓ 治理狀態正常

① 治理指紋
② profile 驗證
③ archive 漂移
④ ack 狀態
────────────────────────────────────────────────────────────
（本摘要由<工具名>自動生成）
```

純 ASCII + 圈號 + 必要中文標點；不用 Unicode 樣式字型。

---

## 10. 護欄要求

protocol-compliant 工具須提供：

| 護欄 | 用途 |
|---|---|
| baseline drift 偵測 | profile 變動時 baseline 須走 approved-drift 流程 |
| validateAllProfiles | 所有註冊 profile 須通過 schema 驗證 |
| auditProfileAgainstConsts | profile 與工具 CONSTS（若有）須一致 |
| audit_compare CLI 整合 | 兩份稽核 JSON 治理狀態可比對 |
| ack hash 序列保留 | localStorage / 等價持久層紀錄編輯演變 |

---

## 11. 版本相容性

protocol version 1.0.x 之間保證：

- meta 欄位**只增不減**
- hash 格式**不變**（`sha256:` / `cyrb53:` / `gov:` / `ack:`）
- 整合點**不縮減**

不相容變更（移除欄位 / 改 hash 演算法 / 拆分整合點）須升級至 protocol 2.0+。

---

## 12. 實作參考

完整參考實作：

- `js/code-profiles-registry.spec.js`（V2.2.0 起）
- `石材計算書產生器_規範版V2.html`（V2.4.0 起）
- `server.py write_export_audit()`（V2.6.1 起）
- `audit_compare.py`（V2.6.1 起）
- `dev_tools/gov_filename_diff.py`（V2.6.0 起）

---

## 13. 變更紀錄

| protocol version | 主要變更 |
|---|---|
| 1.0.0（本版）| 從 V2.4–V2.9.1 33 輪迭代提煉之初版 spec |

---

## 14. 治理連結

- [`./architecture.md`](./architecture.md) — V2 整體架構說明（含逐輪迭代記錄）
- [`./baseline_schema.md`](./baseline_schema.md) — golden samples baseline schema
- [`../CHANGELOG.md`](../CHANGELOG.md) — V2 完整變更紀錄
- [`../tests/golden/_approval_log.md`](../tests/golden/_approval_log.md) — baseline 漂移審批紀錄

---

**簽核**：歐瀚文（執業土木技師）／ 弘一工程顧問有限公司
**日期**：2026-04-29
