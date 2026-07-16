# 變更紀錄

本檔記錄石材固定計算書工具的主要版本變更。正式修改工具前後，請同步更新此檔、`APP_VERSION`、`SERVER_VERSION`，必要時也更新 `TEMPLATE_CATALOG_VERSION` 與回歸測試基準值。

## V3.0.4 - 2026-07-16

版本同步：`APP_VERSION = V3.0.4`；`SERVER_VERSION = 3.0.4`。

### 重點：專案 profile 還原與跨專案隔離

- 修正專案 JSON 已保存 `code_profiles`，但載入或匯入時未還原執行中 profile，第一次重新渲染便可能把專案選擇覆寫遺失的問題。
- 修正瀏覽器既有 `stone_v2_profile_override` 可能汙染另一個未指定 profile 的專案，造成 active profile 與 `Rp` 等實際輸入互相矛盾的問題。
- 新增 `normalizeProfileOverrides()`，只接受已登錄、scope 相符且非預設的 profile id；無效、跨 scope、未知 scope 與多餘預設值都會回到標準預設狀態。
- profile 執行狀態改為由目前專案完整取代：先更新記憶體、再持久化 localStorage。即使 localStorage 寫入失敗，本輪計算仍採專案值並顯示既有儲存錯誤提示。
- `ui_smoke_test.py` 新增真實瀏覽器回歸，驗證新環境能從專案還原保守 profile，且預設／舊版專案會清除無關的瀏覽器覆寫。
- 條文語意追蹤 catalog 升級至 0.3.0，納入 profile 專案還原、runtime 狀態與瀏覽器測試證據。
- 首頁與 classic 入口卡片同步顯示 V3.0.4。

## V3.0.3 - 2026-07-16

版本同步：`APP_VERSION = V3.0.3`；`SERVER_VERSION = 3.0.3`。

### 重點：profile picker 與實際計算欄位同步

- 修正切換 `cns_seismic_113_conservative` 後，畫面 `Rp` 仍停在預設 profile 的 2.5，導致部分高度比案例未採保守 profile 之 `Rp = 2.0` 的問題。
- 新增 `PROFILE_INPUT_BINDINGS` 與 `buildProfileInputUpdates()`：只有仍等於前一 profile 預設值或空白的欄位會同步，使用者已自行覆寫的數值會保留並提示。
- profile picker 會先同步欄位、保存專案，再重新計算與渲染；不再只更新 localStorage 內的 profile id。
- `regression-smoke.test.js` 現在會載入實際 profile registry，並驗證 `z/h = 1.0` 代表案例由預設 profile 的 `Fph = 3.4992 kgf/m²` 提升為保守 profile 的 `Fph = 4.3740 kgf/m²`，同時確認報告採用 `Rp = 2.0`。
- `code-profiles-registry-smoke.test.js` 補上舊預設同步、人工覆寫保留與無效 scope/profile 拒絕測試。
- `ui_smoke_test.py` 新增實際瀏覽器操作驗證，覆蓋保守 profile 同步、切回預設，以及人工 `Rp` 覆寫保留。
- 修正 UI smoke 內含 `await` 的整合檢查未宣告 `async`，確保後段的安全性與無障礙測試實際執行。
- 首頁與 classic 入口卡片同步顯示 V3.0.3，並更新石材工具內容日期。

## V3.0.2 - 2026-04-29

版本同步：`APP_VERSION = V3.0.2`；`SERVER_VERSION = 3.0.2`。

### 重點：audit_compare CLI 整合 protocol 合規檢查

V3.0.1 把 protocol 驗證器寫入 JS registry 與 dashboard 顯示；但**audit_compare（Python CLI）此時仍不知 protocol 概念**。技師若用 audit_compare 比對兩份報告，可能其中一份不合規卻無人察覺。V3.0.2 把驗證器移植至 Python CLI，並新增 `--strict-protocol` 閘門。

### 三點整合

#### 1. Python 版 `validate_governance_meta(meta)`

`audit_compare.py` 新增 Python 實作，**與 JS 版邏輯對等**：

| 共用 | JS（registry）| Python（audit_compare）|
|---|---|---|
| 9 項檢查 | ✓ | ✓ |
| 9 個錯誤條款 | ✓ | ✓ |
| SemVer 1.0.x 相容 | ✓ | ✓ |
| 邏輯一致性檢查 | ✓ | ✓ |

未來 protocol 演進時，兩處須同步維護。

#### 2. server.py audit JSON 寫入

`write_export_audit()` 新增：

```jsonc
"tool": {
  ...,
  "governance_protocol_version": "1.0.0"      // V3.0.2 新
},
"trace": {
  "input_hash": "...",
  "normalized_input_hash": "..."   // V3.0.2 新（既有 meta 內已有，但 trace 之前未鏡射）
  "result_hash": "...",            // V3.0.2 新（同上）
  "governance_protocol_version": "1.0.0"   // V3.0.2 新（與 tool 同欄）
  ...
}
```

#### 3. audit_compare.py 整合

| 處 | 修改 |
|---|---|
| `extract_metrics()` | 讀 `governance_protocol_version` + 收集 trace 之 `_governance_meta_for_validation` |
| `compare_metrics()` | 新增 `protocol` diff entry（含 old/new 版本 + old/new validation 結果）|
| `render_text()` | 印出「Protocol version」+「Protocol compliance: OLD ✓/⚠ \| NEW ✓/⚠」+ 前 3 項錯誤 |
| CLI `--strict-protocol` | 任一報告不合規 → exit 3（與 `--fail-on-regression` 之 exit 2 並存；strict 優先）|

### Exit code 語意

| code | 條件 |
|---|---|
| 0 | 全綠燈 |
| 2 | `--fail-on-regression` + 品質退步 |
| **3** | **`--strict-protocol` + 任一報告不合規（V3.0.2 新）** |

### 護欄擴充

`audit_compare_test.py` 新增 V3.0.2 6 項測試：
1. 合規 meta → ok=true
2. 不支援 protocol version → 報錯
3. 邏輯違反（fingerprint without calc_source_hash）→ 報錯
4. `--strict-protocol` + 兩份均不合規 → exit 3
5. `--strict-protocol` + 兩份均合規 → exit 0
6. `render_text` 含 `Protocol version` + `1.0.0` + `compliant` 字樣

audit_compare 從 13 → **19 項** 全綠燈。

### 護欄驗證

- baseline drift 5/5 = **0%**（純稽核 metadata + CLI；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（**19**）全通過

### V3.0.0 → V3.0.1 → V3.0.2 演進

| 版次 | 涵蓋介面 |
|---|---|
| V3.0.0 | spec 文件（人讀規範）|
| V3.0.1 | JS 驗證器 + dashboard 徽章（HTML 介面）|
| **V3.0.2** | **Python 驗證器 + audit_compare CLI（CLI 介面）** |

protocol 規格現於：JS（前端）與 Python（CLI 稽核）兩端皆有對等驗證實作；**spec 在工具任一介面皆可被機械強制**。

### 後續路線

- **V3.1+**：擴充 protocol（only-add；可能加 D5 第五維度）
- **長期**：其他工程計算工具實作 protocol 1.0；ack_hash 寫入 docx custom XML

## V3.0.1 - 2026-04-29

### 重點：StoneGovernanceProtocol v1.0 規格驗證器（spec 從文件變成可執行護欄）

V3.0.0 上線了 spec 文件，但**spec 必須有自動驗證機制才有約束力**。本版次新增 `validateGovernanceMeta(meta)` 規格驗證器，把 V3.0.0 spec 文件之 9 個合規條款轉化為可執行的程式檢查，並於 dashboard 顯示「protocol compliant」徽章。

### `validateGovernanceMeta(meta)` 9 項檢查

| # | 檢查 | spec 章節 |
|---|---|---|
| 1 | `governance_protocol_version` 存在且為 1.0.x | § 11 版本相容性 |
| 2 | SHA-256 欄位格式（input/normalized/result_hash）| § 4.1 |
| 3 | `calc_source_hash` 格式（warning if 缺）| § 4.1 / § 5.2 |
| 4 | `code_profiles` + `code_profiles_hashes` 結構 | § 3 / § 4.2 |
| 5 | `governance_fingerprint` 格式（gov:14hex）| § 4.2 |
| 6 | `governance_ack_hash` 格式（ack:14hex；可為 null）| § 4.2 |
| 7 | `code_profiles_changelog` 結構完整 | § 3 |
| 8 | 邏輯一致：fingerprint 須與 calc_source_hash 並存 | § 5.2 |
| 9 | 邏輯一致：ack 文字與 hash 並存 | § 3 |

回傳結構：

```jsonc
{
  "ok": true|false,
  "version": "1.0.0",
  "errors": ["..."],
  "warnings": ["..."],
  "checks": [{ "label": "...", "ok": true, "note": "..." }]
}
```

### `buildGovernanceComplianceBadge(meta)`

人讀合規摘要（dashboard / CLI 顯示用）：

| 狀態 | label |
|---|---|
| ok | `✓ protocol 1.0.0 compliant` |
| 不合規 | `⚠ protocol 不合規（N 項錯誤）` |

### Dashboard 整合

V2.9.0 dashboard `<summary>` 列頂端追加綠橘雙態徽章：

```
🏛 治理一致性總覽 [✓ 治理狀態正常] [✓ protocol 1.0.0 compliant]
                                    ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                       V3.0.1 新
```

`data-protocol-ok` 屬性供測試與外部稽核工具讀取。

### 護欄擴充

- `code-profiles-registry-smoke`: 41 → **47 項**（6 項 V3.0.1 驗證器斷言）
- `tests/visual_decoration_test.py`: 新增 `protocol_badge_present` + `protocol_badge_ok==='true'` 斷言

#### 6 項 smoke 涵蓋場景

1. 完整合規 meta → ok=true
2. 缺 protocol_version → ok=false
3. 不支援版本（2.0.0）→ ok=false
4. SHA-256 格式錯誤 → 報錯
5. 邏輯違反（fingerprint 但無 calc_source_hash）→ 報錯
6. `buildGovernanceComplianceBadge` 合規與不合規區分

實測：dashboard summary 顯示 `✓ protocol 1.0.0 compliant`，protocol_badge_ok=true。

### 護欄驗證

- baseline drift 5/5 = **0%**（純驗證邏輯 + UI）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### V3.0.0 vs V3.0.1 差異

| 版次 | 內容 |
|---|---|
| V3.0.0 | spec 文件（人讀為主）+ 版本常數 |
| **V3.0.1** | **驗證器（機讀執行）+ dashboard 徽章** |

spec 從「規格文件」推進到「自動執行的護欄」。

### 後續路線

- **V3.0.2（候選）**：audit_compare CLI 整合 protocol 合規檢查（兩份報告均合規才視為可比對）
- **V3.1+**：擴充 protocol（only-add；如新增 D5 第五維度）
- **長期**：其他工程計算工具實作 protocol 1.0；ack_hash 寫入 docx custom XML

## V3.0.0 - 2026-04-29

### 重點：StoneGovernanceProtocol v1.0 標準化規格上線（V2 治理鏈系列收尾）

V2.4.0 ~ V2.9.1 共 33 輪迭代累積之治理鏈設計，於本版次正式提煉為**標準化規格文件**：
**`dev_tools/StoneGovernanceProtocol-v1.0.md`**。

任何 protocol-compliant 工具（含本工具與未來其他工程計算工具）皆可依此 spec 實作相同治理欄位，使**跨工具、跨版本之計算書治理狀態具備互通性**。

### Spec 文件結構

`StoneGovernanceProtocol-v1.0.md` 共 14 章：

| 章 | 內容 |
|---|---|
| 1 | 目的（可驗證 / 可追溯 / 可比對 / 可申明）|
| 2 | 治理鏈四維度（D1 工具 / D2 規範 / D3 一致性 / D4 申明）|
| 3 | result.meta 欄位完整定義（JSON schema）|
| 4 | Hash 演算法規範（SHA-256 / cyrb53 / canonicalJSON）|
| 5 | 治理欄位 trigger 條件 |
| 6 | 7 個整合點（footer / 檔名 / docx / 封面 / 送審速覽 / audit / dashboard）|
| 7 | 視覺規範（5 配色語意 + 印刷規則）|
| 8 | dashboard 4 區塊規範 |
| 9 | 純文字摘要 60 字元寬規範 |
| 10 | 護欄要求（baseline drift / validateAll / audit_compare）|
| 11 | 版本相容性（1.0.x 保證 only-add）|
| 12 | 實作參考（指向 5 個關鍵檔案）|
| 13 | protocol 變更紀錄 |
| 14 | 治理連結 |

### 三點配套

#### 1. 註冊版本號

```js
// js/code-profiles-registry.spec.js
const STONE_GOVERNANCE_PROTOCOL_VERSION = '1.0.0';

// 暴露於 API
api.GOVERNANCE_PROTOCOL_VERSION = '1.0.0';
```

#### 2. 寫入 result.meta

```json
{
  "meta": {
    "governance_protocol_version": "1.0.0",
    ...
  }
}
```

跨工具 / 跨版本比對時可確認治理欄位 schema 相容性。

#### 3. 護欄擴充

- `code-profiles-registry-smoke`: 40 → **41 項**（新增 V3.0.0 protocol version 斷言）
- `visual_decoration_test`: 新增 `governance_protocol_version` 必為 `'1.0.0'` 斷言

### 為何 V3.0.0 而非 V2.9.2

semver major bump 之語意：
- V2.x：石材計算書產生器**特定工具**之內部演進
- **V3.0.0**：把治理鏈**標準化為跨工具規格**，工具自身只是其中一個 reference implementation

未來若新規範引入（如鋼結構計算書、基礎承載計算書）採同一套治理鏈，皆可宣稱 protocol 1.0 相容；本次發布為這種跨工具互通開啟可能性。

### 護欄驗證

- baseline drift 5/5 = **0%**（meta 新欄位不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- code-profiles-registry-smoke 由 40 → **41 項** 全通過

### V2.x 完整迭代回顧（33 輪）

| 系列 | 範圍 | 主題 |
|---|---|---|
| V2.0.x | – | 工具 V2 初版（calc-core / formula registry / input schema）|
| V2.1.x | 4 版次 | 30 個規範參數從 hardcoded → profile-aware（計強度層）|
| V2.2.x | 5 版次 | profile UI 化（picker / diff viewer / 規範自檢徽章 / 參數總覽 / 對照 profile）|
| V2.3.0 | 1 版次 | 構造層 profile 化（最小直徑 / 長度 / 邊距 / 埋深）|
| V2.4.x | 3 版次 | profile hash + archive 比對 + 匯出 WARN |
| V2.5.x | 3 版次 | governance fingerprint 寫入 5 位置 |
| V2.6.x | 2 版次 | 整合既有審查工具（gov_filename_diff / audit_compare）|
| V2.7.x | 3 版次 | 規範採用聲明（自動偵測 + ack + docx）|
| V2.8.x | 4 版次 | ack 防偽鏈（三方 hash + 歷史序列 + diff）|
| V2.9.x | 2 版次 | 治理 dashboard（HTML + 純文字）|
| **V3.0.0** | **本版** | **StoneGovernanceProtocol v1.0 spec 化** |

### 後續路線

- **V3.0.x**：實作參考工具更新（保持 protocol 1.0.x 相容）
- **V3.1+**：可能擴充 protocol（一律 only-add，保證向下相容）
- **長期**：ack_hash 寫入 docx custom XML part；其他工程計算工具實作 protocol 1.0

## V2.9.1 - 2026-04-29

### 重點：dashboard「複製為純文字」按鈕（電子郵件附帶治理摘要）

V2.9.0 把治理狀態整合於單頁 dashboard，但**HTML 介面只能在工具內查看**。技師若要把治理狀態貼到審查信件、電子郵件、即時通訊等場景，需要純文字版本。V2.9.1 上線「複製為純文字」按鈕。

### 純文字格式設計

```
治理一致性總覽（V2.9.1 / 2026-04-29 17:42:08Z）
============================================================
整體狀態：✓ 治理狀態正常

① 治理指紋
  - calc_source_hash: sha256:0123...
  - governance_fingerprint: gov:17a81de1da0c4f
  - 各 scope params hash:
      wind     cns_wind_107               cyrb53:abcd1234...
      seismic  cns_seismic_113            cyrb53:...
      ...

② profile 驗證
  - schema 驗證：✓ 全通過（5 個 profile）
  - CONSTS 一致性：✓ 一致

③ archive 漂移
  - 狀態：✓ 與最近 archive 對齊

④ ack 狀態
  - 採非預設 profile：是
  - 是否已補充：✓ 已填（57 字）
  - 採用理由（前 100 字）：本案因建築物座落於海濱腐蝕環境...
  - 聲明指紋：ack:1cb66887073ea7
  - 編輯演變次數：3
────────────────────────────────────────────────────────────
（本摘要由石材計算書產生器 V2 自動生成）
```

固定寬度 60 字元、4 區塊對應 dashboard 結構，純 ASCII + 圈號 + 必要的簡體中文標點，可貼至任何純文字介面。

### 兩個新 helper

| API | 用途 |
|---|---|
| `buildGovernanceTextSummary()` | 組成 dashboard 之純文字版（與 HTML 版邏輯同源）|
| `v2CopyGovernanceTextSummary(btn)` | 寫入剪貼簿；含 fallback 機制 |

### Clipboard 雙路寫入

```js
if (navigator.clipboard?.writeText) {
  // primary：modern Async Clipboard API
  navigator.clipboard.writeText(text);
} else {
  // fallback：textarea + document.execCommand('copy')
  v2CopyGovernanceTextFallback(text, flash);
}
```

兩條路徑皆寫入 `window.__v2LastCopiedText` 供測試驗證內容。按鈕點擊後 1.8 秒內顯示「✓ 已複製」回饋，逾時還原原標籤。

### UI 設計

| 屬性 | 值 |
|---|---|
| 位置 | dashboard 內容區頂端右對齊 |
| 樣式 | 綠框 + 白底 + 綠字（#1a7a3a / #4a8e57）|
| hover | 淺綠背景（#e7f5e9）|
| 列印 | `display:none !important`（PDF 不見操作元素）|

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.9.1 測試：

- `button_present`：複製按鈕存在
- `text_length >= 200`：純文字摘要長度達標
- `text_has_overview` + `text_has_section_1..4`：4 區塊 + 標題皆出現
- `copy_attempted`：點擊按鈕後 `__v2LastCopiedText` 已填入

實測：text_len=924、4 區塊全有、copy_attempted=True。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI + clipboard；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### V2.9.x 系列收尾

| 版次 | 交付 |
|---|---|
| V2.9.0 | 治理一致性 dashboard 單頁總覽（4 區塊）|
| V2.9.1 | 純文字版 + 一鍵複製按鈕 |

V2.9.x 完整：technician 不論在工具內看 HTML、列印 PDF、或寄送電子郵件，皆有對應形式的治理狀態摘要可用。

### 後續路線

- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part）
- **V3.0 規劃**：把整個治理鏈打包為標準化「StoneGovernanceProtocol」spec 文件，供其他工具沿用

## V2.9.0 - 2026-04-29

### 重點：governance 一致性 dashboard（單頁總覽）

V2.4.x ~ V2.8.x 累積大量治理欄位（meta hash / footer 徽章 / 規範採用聲明 / ack 演變表 / archive changelog ...），但**每個欄位散落於計算書不同位置**。技師簽證前若要快速確認「此次治理狀態是否完整無誤」，需逐一查找。V2.9.0 上線單頁治理總覽 dashboard，把所有治理欄位整合於一個可展開面板。

### 4 區塊結構

| # | 區塊 | 內容 |
|---|---|---|
| ① | 治理指紋 | calc_source_hash 狀態 + governance_fingerprint + 5 個 scope × {profile id, params hash} 表格 |
| ② | profile 驗證 | `validateAllProfiles` 結果 + `auditProfileAgainstConsts` 結果 |
| ③ | archive 漂移 | `code_profiles_changelog` 之 anyChanged + 漂移 scope 數 |
| ④ | ack 狀態 | trigger 狀態 + ack 已填字數 + ack_hash + 演變次數 |

### Status Pill 設計

每個項目以小徽章呈現：
- ✓ 綠色（#1a7a3a / #e7f5e9）：狀態正常
- ⚠ 橘色（#b3471d / #fdebd0）：需技師檢視

`<details>` summary 標題列含整體 pill：「✓ 治理狀態正常」或「⚠ 有狀態需檢視」（依各區塊綜合判定）；`data-overall-ok` 屬性供測試與未來擴充使用。

### 整體 OK 判定邏輯

```
allOk = calcOk
     && schemaOk
     && consistOk
     && archiveOk
     && ackOk

ackOk = !ackTriggered || ackProvided
```

亦即：`calc_source_hash` 已產生 + profile schema 全通過 + 與 CONSTS 一致 + 與 archive 對齊 + （無 trigger 或已填 ack）。

### 顯示位置

`v2InjectGovernanceDashboard()` post-render decorator，注入於 `#preview-sheets` 末端（與 regulation-footer 並列）。

接入既有 render decorator 鏈：

```js
v2InjectRegulationFooter();
v2InjectActiveParamsOverview();
v2InjectProfileDiff();
v2InjectGovernanceFooter();
v2RecordAckHashHistoryIfNew();
v2InjectGovernanceDashboard();  // V2.9.0 新增
```

### 視覺

- 主色調淺綠 (#f7faf7 / #c9d6cb)，與其他 governance 區塊（綠/暖黃/橘/灰藍）區隔
- 標題 `🏛 治理一致性總覽` 字色 #1a3a1c
- 預設 collapsed；點擊 `<summary>` 展開完整內容
- 列印時 `<details>` 元素仍存在；後續可由 print CSS 控制展開

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.9.0 測試：

- `present === true`：dashboard 元素存在
- `data-overall-ok`：整體狀態屬性可讀
- 4 區塊 text 包含「① 治理指紋」「② profile 驗證」「③ archive 漂移」「④ ack 狀態」
- `has_summary_pill`：含「治理狀態正常」或「有狀態需檢視」
- `fingerprint_table_rows >= 5`：5 個 scope 全列出

實測：present=True, overall_ok=true, 4 區塊全有, fingerprint_table_rows=5。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 整合；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### V2.4.x ~ V2.9.0 治理鏈完整成果

| 系列 | 主題 | 關鍵交付 |
|---|---|---|
| V2.4.x | profile hash + archive | hash + 比對 + 匯出閘門 |
| V2.5.x | governance fingerprint | meta + footer + 檔名 + 封面 + 送審速覽 |
| V2.6.x | 整合既有審查工具 | gov_filename_diff CLI + audit_compare |
| V2.7.x | 規範採用聲明 | UI + 自動偵測 + ack textarea + docx 嵌入 |
| V2.8.x | ack 防偽鏈 | 三方 hash + 歷史序列 + 詳細表格 + diff |
| **V2.9.0** | **總覽 dashboard** | **單頁治理一致性檢視（整合 V2.4–V2.8 所有欄位）** |

### 後續路線

- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part）
- **可能 V2.9.1+**：dashboard 提供「一鍵複製為純文字」按鈕，技師可貼至審查信件 / 電子郵件作為治理摘要
- **可能 V3.0**：將整個治理鏈打包為標準化「StoneGovernanceProtocol」spec，供其他工具沿用

## V2.8.3 - 2026-04-29

### 重點：ack 演變 A/B 兩列任選比對 + unified diff

V2.8.2 把 history 表格內容完整呈現，但**技師若要對照「第 1 版」與「第 5 版」的差異**仍需手動逐字比對。V2.8.3 上線 A/B 標記按鈕 + 簡易 LCS-based unified diff。

### 三點配套

#### 1. 全文存檔（recordAckHashHistory 擴增）

新增 `ack_text` 欄位（完整文字，上限 2000 字）：

```jsonc
{
  "ts": "...",
  "ack_hash": "ack:...",
  "ack_snippet": "前 50 字（顯示用）",
  "ack_text": "完整文字（diff 用，2000 字上限）",   // V2.8.3 新
  ...
}
```

V2.8.1 / V2.8.2 既有 `ack_snippet` 保留作為表格顯示；diff 用更長的 `ack_text`。

#### 2. LCS-based line diff（自實作 ~30 行）

```js
function v2LineDiff(oldText, newText) {
  // 標準 LCS 動態規劃 + 回溯
  // 回傳 [{ tag: '+'|'-'|' ', text: '...' }, ...]
}
function v2RenderLineDiffHtml(oldText, newText) {
  // 紅 (#a4242a / #fbe4e6) / 綠 (#1a7a3a / #e7f5e9) / 灰 (transparent)
}
```

無依賴；同步；deterministic。

#### 3. UI：A/B 按鈕 + diff panel

| 元素 | 行為 |
|---|---|
| 第 6 欄「比較」 | 每列含兩個 A/B 小按鈕 |
| `v2HandleAckDiffSelect(role, idx, projName)` | 點擊後標記為 base (A) 或 target (B)；高亮對應列（淡藍/淡黃）|
| `.v2-ack-diff-panel` | A、B 同時選定後渲染 unified diff；單選只顯示提示文字 |
| `@media print` | 隱藏 A/B 按鈕（列印不見操作元素）|

### 視覺

- A 行高亮淡藍 + 綠左邊框
- B 行高亮淡黃 + 橘左邊框
- diff 行：- 紅、+ 綠、空格灰
- diff panel `max-height:240px; overflow:auto` 防止過長破版

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.8.3 測試：

- 點 row 0 的 A 按鈕、row 2 的 B 按鈕
- 驗證 `.v2-ack-diff-panel .v2-ack-diff-content` 注入
- 驗證 diff 含 `- 理由 A 第一版` 與 `+ 理由 C 最終版`
- 驗證對應 `<tr>` 含 `v2-ack-row-a` / `v2-ack-row-b` class
- 表頭由 5 欄升至 6 欄

實測：diff_content_present=True, has_minus_line=True, has_plus_line=True, A/B 高亮 True/True。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 互動；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### V2.8.x ack 演變視覺最終形態

| 版次 | 視覺 |
|---|---|
| V2.8.0 | meta + footer 單一 hash |
| V2.8.1 | 一行徽章（次數 + 起訖日期 + 最近 hash）|
| V2.8.2 | `<details>` + 5 欄表格 |
| V2.8.3 | 6 欄表格（多「比較」欄）+ A/B 按鈕 + LCS diff panel |

### 後續路線

- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part），使 .docx 開啟即可驗證原文未竄改
- **可能 V2.9+**：governance 一致性 dashboard（單頁總覽：fingerprint / ack_hash / changelog / drift 全狀態）

## V2.8.2 - 2026-04-29

### 重點：ack 演變徽章升級為可展開明細表格

V2.8.1 上線徽章 `📊 ack 編輯演變：N 次`，但僅顯示「次數 + 首末日期 + 最近 hash」。技師若要詳查演變細節（哪一筆哪個時間點寫了什麼）需手動讀 localStorage。V2.8.2 把徽章升級為 `<details>` 可展開元件，內含完整明細表格。

### 升級內容

| 項目 | V2.8.1 | V2.8.2 |
|---|---|---|
| 元素類型 | `<div>` | `<details>` |
| 內容 | 一行文字 | summary（同 V2.8.1）+ 展開後 5 欄表格 |
| 互動 | 無 | 點擊展開 / 收合 |
| 列印 | 文字一行 | 仍為 details；可由列印 CSS 控制是否展開 |

### 表格 5 欄

| 欄 | 內容 |
|---|---|
| `#` | 序號（1, 2, 3, ...）|
| 時間（UTC）| ISO 8601 取秒級（例 `2026-04-29 11:02:08Z`）|
| `ack_hash` | `ack:` + 14 hex |
| 文字片段（前 50 字）| `ack_snippet`（V2.8.1 已存）|
| `ov/dr` | overrides / drifts 計數（例 `1/0`）|

`<thead>` 灰藍背景 (#dde5ee)；`<tbody>` 列以虛線分隔；底部義式註腳說明 localStorage 位置與 50 筆上限。

### 護欄擴充

`tests/visual_decoration_test.py` V2.8.1 測試擴增 V2.8.2 斷言：

- `badge_is_details === true`：升級為 `<details>` 元素
- `table_rows === 3`（對應三次模擬編輯）
- `header_count === 5`（5 欄表頭）

實測：is_details=True, rows=3, headers=5。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 升級；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### V2.8.x ack 演變展示路線

| 版次 | 視覺 |
|---|---|
| V2.8.0 | meta + footer 顯示單一 hash |
| V2.8.1 | 徽章「N 次」+ 起訖日期 + 最近 hash |
| V2.8.2 | `<details>` 可展開 5 欄明細表格 |

### 後續路線

- **V2.8.3（候選）**：增加「比較任兩列 ack 文字差異」按鈕（產生 unified diff）
- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part），使 .docx 開啟即可驗證原文未竄改

## V2.8.1 - 2026-04-29

### 重點：ack_hash 歷史序列保留（多次編輯演變紀錄）

V2.8.0 上線了 ack 三方雜湊作為防偽憑證；但**單一 hash 只反映「當下狀態」**，無法呈現技師多次編輯 ack 之演變。簽證實務上技師通常會多次調整理由文字，本版次補上歷史序列，讓 governance 可追溯到「ack 第幾版」。

### localStorage 結構

key：`stone_v2_ack_hash_history`

```jsonc
{
  "案A": [
    { "ts": "2026-04-29T10:15:23Z", "ack_hash": "ack:aaa...", "ack_snippet": "理由 A 第一版", "overrides_count": 1, "drifts_count": 0 },
    { "ts": "2026-04-29T11:02:08Z", "ack_hash": "ack:bbb...", "ack_snippet": "理由 B 補強", "overrides_count": 1, "drifts_count": 0 },
    ...
  ],
  "案B": [...]
}
```

per-project 分組；每筆含時間戳、hash、文字片段、override / drift 計數。

### 5 個 helper 函式

| API | 用途 |
|---|---|
| `_loadAckHashHistoryAll()` | 讀整個 localStorage map |
| `_saveAckHashHistoryAll(map)` | 寫回 |
| `getAckHashHistory(projName)` | 取單一專案序列 |
| `recordAckHashHistory(projName, ackHash, snippet, ovCount, drCount)` | 同 hash 不重複記錄；上限 50 筆 |
| `clearAckHashHistory(projName?)` | 清除（單一專案或全部）|

### 自動記錄機制

`v2RecordAckHashHistoryIfNew()` 接入 render 後 decorator 鏈，於既有 v2InjectGovernanceFooter 之後執行：

- 讀取最新 result.meta.governance_ack_hash
- 若 ack_hash 與該專案最後一筆不同 → append
- 同 hash 不重複（避免 noise）

### 「ack 編輯演變」徽章

`regulationChangeDeclarationHtml()` 末尾追加：

| 條件 | 顯示 |
|---|---|
| history.length < 2 | 不顯示（首次編輯不算演變）|
| history.length >= 2 | 灰藍配色徽章：`📊 ack 編輯演變：N 次（首日 → 最近日期）；最近 hash 為 ack:xxx` + `data-history-count="N"` |

採灰藍 (#4a6c8d / #eef2f7) 與其他 governance 區塊（綠/暖黃/橘）區隔。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.8.1 測試：

模擬技師三次編輯 ack 文字（理由 A → B → C），驗證：
- `history.length === 3`
- `distinct_hashes === 3`（每次不同 hash）
- 徽章 `data-history-count >= 3`
- 徽章文字含「編輯演變」

實測：length=3, distinct=3, badge_count=3，全綠燈。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 localStorage + UI；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過

### 完整 V2.7.x → V2.8.x governance ack 演進路徑

| 版次 | 新增治理層 |
|---|---|
| V2.7.0 | 自動偵測 + 送審速覽 HTML 區塊 |
| V2.7.1 | UI textarea + 匯出 WARN + 雙態切換 |
| V2.7.2 | docx 匯出嵌入 |
| V2.8.0 | 三方雜湊（archive + current + ack 文字）|
| **V2.8.1** | **ack_hash 歷史序列（演變紀錄）** |

### 後續路線

- **V2.8.2（候選）**：ack 演變徽章可展開明細（時間戳 / hash / 文字片段表格）
- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part），使 .docx 開啟即可驗證原文未竄改

## V2.8.0 - 2026-04-29

### 重點：governance ack 三方雜湊（archive ↔ current ↔ ack 防偽綁定）

V2.7.x 完成「治理聲明」自動偵測 + UI + 全交付管道覆蓋；但**聲明文字本身仍可在匯出後被竄改**，且機讀層面缺少防偽憑證。V2.8.0 補上聲明三方雜湊，使技師簽證後文字若被編輯 → hash 變動 → audit_compare 可察覺。

### 三方雜湊組成

`buildGovernanceAckHash(inp)` 計算：

```
ack_hash = 'ack:' + cyrb53(canonicalJSON({
  overrides: [{scope, id}, ...],     // 採用之非預設 profile 清單
  drifts:    [{scope, id, archiveHash, currentHash}, ...],  // params 漂移清單
  ackText:   inp.governance_ack.trim()
}))
```

任一方變動 → 三方雜湊變：
- override 切換 → overrides 變
- profile JSON 修改 → drifts.currentHash 變
- 技師編輯 ack 文字 → ackText 變

### 觸發條件

| 條件 | 行為 |
|---|---|
| 無 override 無 drift 無 ack 文字 | 回 null（不產生 hash，避免噪音）|
| 任一觸發 | 產生 `ack:` + 14 hex |

### 寫入位置

#### `result.meta`
```json
{
  "governance_ack": "技師輸入文字",
  "governance_ack_hash": "ack:1cb66887073ea7"
}
```

#### 法規 footer 第 6 列「聲明指紋」（V2.5.0 的 5 列之後）

```
公式指紋    sha256:abc...
治理指紋    gov:17a81de1da0c4f
聲明指紋    ack:1cb66887073ea7   ← V2.8.0 新
```

#### 稽核 JSON `trace` 區段（server.py write_export_audit）

```json
"trace": {
  ...,
  "governance_ack": "...",
  "governance_ack_hash": "ack:..."
}
```

#### audit_compare 比對

`compare_metrics()` 新增 `governance_ack` diff entry（含 `text_changed` / `hash_changed`）；`render_text()` 變動時自動列印「⚠ ack 文字內容已變動（技師重新編輯或匯出後被竄改？）」。

### 設計選擇

- **不視為 regression**：ack 變動是合法行為（規範改版 / 技師更新理由），但需透明化
- **僅 trigger 時產生 hash**：避免每份報告都有 hash 造成噪音
- **以 cyrb53 + 14 hex**：與 V2.5.0 governance fingerprint 一致；非密碼學等級但足夠 governance 用途

### 護欄擴充

- `code-profiles-registry-smoke.test.js` 由 35 → **40 項**（5 項 V2.8.0 ack hash 斷言：null/triggered/text-sensitivity/determinism/ack-only）
- `tests/visual_decoration_test.py` 新增 V2.8.0 三項斷言：`ack_hash_format_ok`、`footer_ack_row` 列出現、相同 input 兩次計算 hash 一致
- `audit_compare_test.py` 新增 V2.8.0 兩項測試：same（不變動）/ tampered（文字被改）；後者驗證 render_text 含「ack 文字內容已變動」
- 累計：smoke 35 → **40 項**；audit_compare 11 → **13 項**

### 護欄驗證

- baseline drift 5/5 = **0%**（meta 新欄位不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- 實測：override + ack 文字「V2.8.0 測試用採用理由」→ `ack:1cb66887073ea7`；連續兩次計算 hash 完全一致

### 完整 6 層治理指紋（升級為 7 層）

| 層 | 指紋 | 變動觸發 |
|---|---|---|
| 1 | `input_hash` | raw input |
| 2 | `normalized_input_hash` | schema 後仍變動 |
| 3 | `result_hash` | 計算結果 |
| 4 | `calc_source_hash` | calc-core JS |
| 5 | `code_profiles_hashes` | profile params |
| 6 | `governance_fingerprint` | 4 + 5 任一 |
| 7 | **`governance_ack_hash`** | override / drift / ack 文字任一 |

### 後續路線

- **V2.8.1（候選）**：歷史 ack_hash 序列保留，可比對技師多次編輯的 ack 演變
- **長期**：ack_hash 寫入 docx 內隱藏屬性，使 .docx 開啟即可驗證原文未竄改

## V2.7.2 - 2026-04-29

### 重點：規範採用聲明嵌入 docx 匯出

V2.7.0/7.1 完成 HTML 預覽與列印 PDF 之聲明顯示，但**直接 .docx 匯出（透過 docx.js 程式組裝）路徑未涵蓋**。簽證計算書若以 .docx 形式提交審查，技師需確保聲明同步出現於 .docx 內。本輪補上。

### 新增 helper：`docxRegulationDeclarationChildren(inp)`

回傳 `docx.Paragraph` / `docx.Table` 陣列，由 `buildDocxReviewSummarySection()` 直接 `...spread` 注入：

```js
docxSectionTitle('設計依據'),
docxTable(basisRows, ...),
// V2.7.2：規範採用聲明（採非預設 profile 或 archive 漂移時自動嵌入）
...docxRegulationDeclarationChildren(inp),
docxNote('本頁為送審快速索引；...'),
```

### 內容結構

觸發條件同 V2.7.0：override 或 drift。內容：

| 區塊 | 條件 | 形式 |
|---|---|---|
| 標題 | always（觸發時）| docxSectionTitle '規範採用聲明（自動產生）' |
| 採用之非預設 profile | overrides 非空 | docxNote + 4 欄表格（Scope / 採用 id / profile 名稱 / 預設 id）|
| profile params 漂移 | drifts 非空 | docxNote + 5 欄表格（Scope / id / 原 hash / 目前 hash / archive 版本日期）|
| 技師補充採用理由 | ack 非空 | docxNote + docxParagraph（直接寫入 ack 文字）|
| ack 缺漏提示 | ack 為空 | docxNote「⚠ 技師尚未補充...」|

無觸發條件時回空陣列（`...[]` 不產生任何內容）。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.2 兩階段測試：

- **override + 已填 ack**：`docxRegulationDeclarationChildren(inputs())` 回 `>= 4` 個 children（實測 5：title + override note + override table + ack note + ack paragraph）
- **無 override + 空 ack**：`length === 0`

### 護欄驗證

- baseline drift 5/5 = **0%**（純匯出邏輯擴充；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- autoword_guard_test 仍綠燈（docx 生成不崩潰）

### 完整 V2.7.x 系列收尾

| 版次 | 交付物 | 涵蓋路徑 |
|---|---|---|
| V2.7.0 | 自動偵測 + 送審速覽聲明 HTML 區塊 | HTML 預覽 + 列印 PDF |
| V2.7.1 | governance_ack textarea + 匯出 WARN + 雙態切換 | UI + 匯出檢查 |
| V2.7.2 | 聲明嵌入 docx 匯出 | 直接 docx 匯出路徑 |

V2.7.x 完成「治理聲明全交付管道覆蓋」：HTML / PDF / DOCX / Word 相容檔皆含同樣的聲明結構。

### 後續路線

- **長期**：`governance_ack` 文字寫入 result.meta 並 hash，作為簽證原文之防偽（防止匯出後文字被竄改）
- **可能 V2.8+**：聲明本身具備 hash 鏈（archive→current→ack 三方資料雜湊綁定）

## V2.7.1 - 2026-04-29

### 重點：governance_ack 補述閘門化（採非預設 profile 必須附工程判斷理由）

V2.7.0 自動偵測非預設 profile 與 archive 漂移並產生敘述，但**敘述只說「此情況存在」，不強制技師寫採用理由**。簽證實務上若僅有自動敘述、缺技師工程判斷，責任歸屬模糊。V2.7.1 補上：當聲明被觸發時 `governance_ack` 必填，否則匯出 WARN。

### 三點配套

#### 1. UI 欄位（`①封面資訊` 區）

```html
<label>規範採用聲明（採非預設 profile 時必填）</label>
<textarea id="governance_ack" rows="3" placeholder="例：本案因建築物座落於海濱腐蝕環境...">
```

placeholder 提供具體例句，引導技師具體說明採用理由（含工程判斷）。

#### 2. 匯出檢查 WARN 規則

`v2CollectExportChecklist()` 新增規則：

| 條件 | 級別 | 文字 |
|---|---|---|
| `regulationChangeDeclaration(inp)` 偵測有 override 或 drift  AND  `inp.governance_ack` 為空白 | WARN | `規範採用聲明欄位（governance_ack）為空，但已偵測到：採用非預設 profile（N 個 scope）...` |

WARN 觸發匯出確認對話框，技師需 acknowledge 才能繼續（不阻擋，但留下處理紀錄）。

#### 3. 送審速覽聲明區雙態切換

`regulationChangeDeclarationHtml()` 末段：

| ack 狀態 | 視覺 | 文字 |
|---|---|---|
| 空 | 暖黃配色 + `data-needs-ack="true"` 標記 | ⚠ 技師尚未補充採用理由；請於①封面資訊區之「規範採用聲明」欄位填寫工程判斷依據 |
| 已填 | 綠色配色（border `#4a8e57` / bg `#e7f5e9`）| **技師補充採用理由：** + 技師輸入文字（HTML escape 並保留換行）|

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.1 兩階段測試：

- **Override + 空 ack 階段**：`ack_warn_count >= 1` + DOM 含 `data-needs-ack="true"`
- **Override + 填 ack 階段**：`ack_warn_count === 0` + DOM 含「技師補充採用理由」段落

實測：empty 階段 warn=1 + needs_ack_marker=true；filled 階段 warn=0 + decl_has_reason=true。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI + 檢查邏輯；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（11）全通過

### 完整 governance acknowledgment 路徑

```
profile 改動或切換對照
       ↓
[1] regulationChangeDeclaration 偵測 override / drift（V2.7.0）
       ↓
[2] 送審速覽顯示自動敘述（V2.7.0）
       ↓
[3] 技師檢視；若採用非預設則必填 governance_ack（V2.7.1 ← 本輪）
       ↓
[4] 匯出檢查：ack 空 → WARN（V2.7.1）
       ↓
[5] 送審速覽改顯示綠色「技師補充採用理由」段落（V2.7.1）
       ↓
[6] 技師簽證計算書留下完整：自動偵測 + 工程判斷文字記錄
```

### 後續路線

- **V2.7.2**：聲明同時嵌入 docx 匯出（既有路徑只顯示於 HTML 預覽 + 列印 PDF）
- **長期**：governance_ack 文字寫入 result.meta.governance_ack 並 hash，作為簽證原文之防偽

## V2.7.0 - 2026-04-29

### 重點：規範採用聲明自動生成（首個技師簽證面向之輸出）

V2.5.x 把指紋寫入交付鏈、V2.6.x 整合至審查鏈，但兩者都是**機讀資料**。技師簽證時若採用非預設 profile 或 archive 已漂移，**正式計算書內仍需文字敘述採用理由**。本版次補上這層：自動偵測非預設狀態並產生人讀聲明，嵌入送審速覽。

### `regulationChangeDeclaration(inp)` 結構

回傳 null 或 `{ overrides: [...], drifts: [...] }`：

| 欄位 | 觸發條件 | 內容 |
|---|---|---|
| `overrides[]` | 任一 scope active profile id ≠ DEFAULT_ACTIVE | `{ scope, id, name, defaultId }` |
| `drifts[]` | `buildActiveProfileChangelog().anyChanged === true` | `{ scope, id, archiveHash, currentHash, archiveVersion, archiveDate }` |

兩類皆無時回 null（聲明區塊不顯示，避免 UI 噪音）。

### `regulationChangeDeclarationHtml(inp)`

把結構物件渲染為 HTML 區塊，置於送審速覽頁面尾段：

- 暖黃配色（與 profile diff viewer 一致），明確表達「需技師檢視之治理事項」
- 標題 `📜 規範採用聲明（自動產生）`
- 採用之非預設 profile 列表（含 scope 中文名 + id + 規範全名 + 預設 id 對照）
- profile params 漂移列表（含 archive hash → current hash + 起算版本日期）
- 末尾深色提示：「本聲明由系統自動產生；採用之 profile 與最近 archive 之間若有差異，技師應於正式簽證計算書補充採用理由與工程判斷依據。」

### 顯示位置

`reviewSummaryPage()` 之「設計依據」表格之後、calc-note 之前。送審速覽預設 opt-in；勾選後此聲明區塊才顯示。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.0 兩階段測試：

- **有 override 階段**：`localStorage.setItem('stone_v2_profile_override', { seismic: 'cns_seismic_113_conservative' })` → 預期 `present === true` 且文字含「採用之非預設 profile」「耐震」「cns_seismic_113_conservative」
- **無 override 階段**：清掉 override 後預期 `present === false`

實測：present=True 時 4 項斷言全綠；無 override 時 false。

### 護欄驗證

- baseline drift 5/5 = **0%**（聲明僅 UI；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（11）全通過

### 技師簽證面向之 governance 完整路徑

```
┌─ 機讀資料 ─────────────────────────┐  ┌─ 人讀敘述 ─────────────────────┐
│ V2.4.0 hash → meta                  │  │ V2.7.0 規範採用聲明（送審速覽）│
│ V2.4.1 archive 比對                 │  │   - overrides 列表             │
│ V2.4.2 匯出 WARN 閘門               │  │   - drifts 列表                │
│ V2.5.x 5 位置寫入指紋               │  │   - 採用理由提示文字           │
│ V2.6.x gov_filename_diff + audit_   │  │                                 │
│        compare 整合                 │  │                                 │
└─────────────────────────────────────┘  └─────────────────────────────────┘
                            ↓
                技師看一頁送審速覽即可完成「治理狀態審視 + 工程判斷」
```

### 後續路線

- **V2.7.1（候選）**：聲明區塊加 `data-needs-ack` 標記，匯出檢查若採非預設 profile 但 inp.governance_ack 為空 → WARN 提示技師補充採用理由
- **V2.7.2（候選）**：把聲明同時嵌入 docx 匯出（既有路徑只在 HTML 預覽顯示）
- **長期**：聲明文字可由技師於 UI 編輯（取代純自動生成）

## V2.6.1 - 2026-04-29

### 重點：governance fingerprint 整合至既有稽核比對工具鏈

V2.6.0 上線檔名比對 CLI；本版次延伸至**伺服器產出之稽核 JSON 報告**（`*_驗證報告.json`），並讓既有 `audit_compare.py` 在比對兩份稽核時同步呈現 governance 變動。

### 三點整合

#### 1. `server.py` 寫入稽核 JSON

`write_export_audit()` 之 `trace` 區段新增三欄：

```json
"trace": {
  "input_hash": "...",
  "payload_sha256": "...",
  "result_source": "frontend_results",
  "governance_fingerprint": "gov:17a81de1da0c4f",   // V2.6.1 新
  "calc_source_hash": "sha256:...",                 // V2.6.1 新
  "code_profiles_hashes": { "wind": {...}, ... }    // V2.6.1 新
}
```

讀自前端送來的 `meta` 欄位（V2.4.0 / V2.5.0 已寫入 result.meta）。

#### 2. `audit_compare.py` 比對與顯示

`extract_metrics()` 從 `trace` 讀取三欄；`compare_metrics()` 新增 `governance_fingerprint` diff entry：

```python
'governance_fingerprint': {
  'old': '...', 'new': '...',
  'changed': old != new,
  'old_calc_source_hash': '...', 'new_calc_source_hash': '...',
  'old_profiles_hashes': {...}, 'new_profiles_hashes': {...}
}
```

`render_text()` 列印 governance 比對結果；變動時自動展開 `calc_source_hash` 與 per-scope profile hash 之差異。

#### 3. 設計原則：governance 變動 ≠ 品質退步

`regression_reasons()` **不**因 fingerprint 變動而判退步（profile/規範改版時必然 fingerprint 變）。改以 ⚠ CHANGED 標示，需技師檢視原因。這保留既有 `--fail-on-regression` 退步閘門語意，新加維度只做透明性。

### 護欄擴充

`audit_compare_test.py` 新增 2 項 V2.6.1 測試：
- `test_v261_governance_fingerprint_same`：相同指紋 changed=False、不觸發 regression
- `test_v261_governance_fingerprint_changed`：不同指紋 → diff.changed=True → render_text 含 `Governance fingerprint`、`CHANGED`、`calc_source_hash 已變動`、`profile[seismic] 變動`

實測：11 個 audit_compare 測試全通過（既有 9 + V2.6.1 新增 2）。

### 護欄驗證

- baseline drift 5/5 = **0%**（純稽核 metadata 擴充；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ **audit_compare（11）** 全通過

### V2.6.x 系列收尾

| 版次 | 整合對象 | 用途 |
|---|---|---|
| V2.6.0 | 檔名（exportBaseFilename）| 事後從檔名快速比對 |
| V2.6.1 | 稽核 JSON（write_export_audit + audit_compare）| 兩份報告 governance + 品質一併比對 |

V2.5.x「指紋寫入交付鏈」+ V2.6.x「指紋整合至審查工具鏈」完整：簽證後的審查工作可全自動驗證治理一致性。

### 後續路線

- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述差異，並嵌入 .docx）
- **可能 V2.7+**：governance fingerprint 寫入 reviewSummaryData 結構化欄位，技師於送審速覽可手動標註 ack 狀態

## V2.6.0 - 2026-04-29

### 重點：governance fingerprint 檔名比對工具上線

V2.5.x 把指紋寫入 5 個位置（meta / footer / 檔名 / 封面 / 送審速覽）；本版次新增**事後稽核工具**，技師收到一批匯出檔後可一鍵比對治理一致性。

### 工具：`dev_tools/gov_filename_diff.py`

CLI 兩種模式：

```bash
# 兩檔比對
python dev_tools/gov_filename_diff.py file1.docx file2.docx

# 資料夾稽核（自動依案名分組）
python dev_tools/gov_filename_diff.py path/to/output/

# JSON 輸出（CI 友善）
python dev_tools/gov_filename_diff.py --json output/
```

### 行為規則

| 場景 | 退出碼 | 訊息 |
|---|---|---|
| 兩檔同 gov | 0 | ✓ governance 一致 |
| 兩檔不同 gov | 1 | ⚠ governance 不一致 |
| 任一檔無 _gov 後綴 | 1 | ⚠ 至少一份無後綴（舊版本或 file:// 匯出）|
| 資料夾：每專案內一致 | 0 | ✓ 全部專案治理一致 |
| 資料夾：某專案內不一致 | 1 | ⚠ 顯示哪些專案有幾種 gov 狀態 |
| `--json` | 同上 | 結構化 JSON 輸出 |

設計原則：
- **跨專案差異不視為失敗**（不同案件可能採不同治理狀態）
- **單一專案內多種 gov 狀態 → 失敗**（同案件不應出現治理漂移）
- **無後綴單獨列出**（情報用，不一定是 NG）

### 涵蓋副檔名

`SUPPORTED_EXTS = {.docx, .doc, .xlsx, .xls, .csv, .json, .pdf}`，與 V2.5.1 `exportBaseFilename` 涵蓋範圍對齊。

### 護欄擴充

新增 `tests/gov_filename_diff_test.py`，覆蓋 12 個測試：

- **單元測試**（5 項）：`parse_gov` 與 `parse_proj` 的標準命名／無後綴／非 6-hex 邊界
- **CLI 整合**（7 項）：兩檔同 gov、兩檔不同 gov、缺後綴、資料夾稽核（混合不一致與缺後綴）、JSON 輸出、完全一致資料夾、`-h` 說明

`tests/run_all_tests.bat` 由 5 段擴增至 6 段，新增 `[6/6] gov_filename_diff 工具測試`，CI 自動覆蓋。

### 護欄驗證

- baseline drift 5/5 = **0%**（檔名比對工具獨立於 calc-core）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + **gov_filename_diff（12 cases）** 全通過
- run_all_tests.bat 由 10 段升級至 **11 段**

### V2.5.x → V2.6.0 完整 governance 路徑

| 階段 | 工具 / 位置 | V2.x |
|---|---|---|
| 計算 | `meta.governance_fingerprint` | V2.5.0 |
| 預覽 | 法規 footer / 治理指紋列 | V2.5.0 |
| 匯出檔名 | `_gov-XXXXXX` 後綴 | V2.5.1 |
| 封面 | `.cov-gov-footer` | V2.5.2 |
| 送審速覽 | `.review-gov-footer` | V2.5.2 |
| **事後稽核** | **`gov_filename_diff.py` CLI** | **V2.6.0** |

### 後續路線

- **V2.6.1**：與 `audit_compare.py` 整合（兩份稽核 JSON 報告 + governance fingerprint 一併比對）
- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述差異）

## V2.5.2 - 2026-04-29

### 重點：governance fingerprint 寫入封面與送審速覽末端

V2.5.0 把指紋寫入 footer 與 meta；V2.5.1 寫入檔名末尾。本輪補上**正式報告主體之兩個關鍵頁**：封面（簽證頁脚）與送審速覽（審查者首見頁）。技師簽證後，計算書任一份文件、任一頁皆可追溯治理狀態。

### 注入位置

| 頁 | 位置 | 內容 |
|---|---|---|
| 封面 `.cov-page` | 末端 `.pg-footer.cov-gov-footer` | 居中淡灰文字 `治理指紋 gov:xxxxxxxxxxxxxx` |
| 送審速覽 | 末端 `.pg-footer.review-gov-footer` | 右對齊斜體淡灰文字，同格式 |

字級 9px、顏色 #888、不搶眼、列印保留。完整 14 字元 hex 不縮短（與 V2.5.1 檔名 6-hex 互補）。

### 設計選擇：post-render decorator 而非內聯 ${...}

cover() 與 reviewSummaryPage() 於 render 時序中可能 `getCalculationResults()` 尚未產出最新 meta（governance_fingerprint 計算依賴 `__CALC_SOURCE_HASH` 與 inp 之 active profiles）。改採 post-render decorator `v2InjectGovernanceFooter()`，於 render 完成後注入：

```js
function v2InjectGovernanceFooter(){
  const fpHtml = governanceFingerprintFooterHtml();
  if(!fpHtml) return;  // file:// 無 fingerprint，不注入
  document.querySelector('.cov-gov-footer').innerHTML = fpHtml;
  document.querySelector('.review-gov-footer').innerHTML = fpHtml;
}
```

接入既有 render 包裝鏈（與 v2InjectRegulationFooter / v2InjectActiveParamsOverview / v2InjectProfileDiff 並列）。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.5.2 4 項斷言（在 V2.5.0 stub 階段內）：
- `cover_footer_present === true`
- `cover_has_gov === true`（含「治理指紋」與「gov:」雙字串）
- `review_footer_present === true`
- `review_has_gov === true`

啟用 `review_summary_on` checkbox 以渲染送審速覽頁；測試後還原。

實測注入結果：兩個 footer 內容皆為 `治理指紋 gov:17a81de1da0c4f`。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 注入；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過

### V2.5.x 系列收尾

| 版次 | 治理指紋出現位置 |
|---|---|
| V2.5.0 | `result.meta.governance_fingerprint` + 法規 footer 列 |
| V2.5.1 | 匯出檔名 `_gov-XXXXXX` 後綴（DOCX/XLSX/CSV/JSON 等）|
| V2.5.2 | 封面末端 + 送審速覽末端 |

至此 governance fingerprint **覆蓋整個交付路徑**：meta → 預覽 footer → 檔名 → 封面 → 送審速覽。任一介面皆可追溯治理狀態。

### 後續路線

- **V2.6+**：歷史檔名比對腳本（解析 `_gov-XXX` 後綴對照差異）
- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述）

## V2.5.1 - 2026-04-29

### 重點：governance fingerprint 寫入匯出檔名

V2.5.0 把工具 + 規範雙治理面向合成為單一 `gov:` 指紋並寫入 meta；但**檔名仍只含 `APP_VERSION` 與時間戳**，技師收到一批匯出檔時**無法從檔名直接判讀治理狀態**。V2.5.1 把指紋前 6 字元寫入檔名末尾。

### 命名格式

```
原: 案名_石材固定計算書_V2.5.1_20260429_0135.docx
新: 案名_石材固定計算書_V2.5.1_20260429_0135_gov-17a81d.docx
                                            ↑↑↑↑↑↑↑↑↑↑↑
                                            governance suffix
```

6 字元 hex（≈16.7M 種狀態）足夠人類比對。完整 14 字元仍存於 footer 與 meta。

### 涵蓋範圍

`exportBaseFilename(kind)` 是統一的命名 helper，所有匯出都會經過：

- ✓ DOCX 計算書
- ✓ Word 相容檔（.doc）
- ✓ XLSX/XLS 案例表 / 檢核摘要
- ✓ CSV（驗算對照表 / 案例表 / 變更紀錄 / 批次試算）
- ✓ 專案 JSON 存檔
- ✓ 稽核 JSON 報告

### 向下相容

- file:// 環境（calc_source_hash 因 fetch 限制為 null）→ governance_fingerprint 為 null → `governanceFingerprintShort()` 回空字串 → 檔名不含 `_gov-`
- http:// 環境 → 完整 `_gov-xxxxxx` 後綴

不破壞現有檔名結構，只在末尾**追加可選後綴**，舊腳本依舊可解析。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.5.1 兩階段斷言：

- **stub 階段**：`__CALC_SOURCE_HASH` 注入後，`exportBaseFilename('計算書')` 必含 `_gov-[0-9a-f]{6}` 結尾
- **fallback 階段**：清掉 stub 後檔名不含 `_gov-` 子字串

實測 stub 階段檔名末尾：`..._V2.5.1_20260429_0135_gov-17a81d`。

### 護欄驗證

- baseline drift 5/5 = **0%**（純檔名格式擴充；不影響 calc 結果）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過

### 後續路線

- **V2.5.2**：governance_fingerprint 寫入 review_summary、cover 末端 footer，作為簽證頁脚識別
- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述差異）
- **可能 V2.6+**：歷史檔名比對 — 比對兩份匯出檔之 `_gov-XXX` 後綴，識別治理狀態異動

## V2.5.0 - 2026-04-29

### 重點：governance fingerprint — 工具 + 規範雙治理面向之單一指紋

V2.4.x 系列建立了「規範變動可偵測、可警示、可閘門化」三層機制。但簽證稽核時若需要**單一字串引用整個 governance 狀態**（工具 + 規範），技師仍須拼接 `calc_source_hash` 與 `code_profiles_hashes`。V2.5.0 上線單一合成指紋 `governance_fingerprint`。

### 設計

```
calc_source_hash      = SHA-256 of calc-core JS（V2.0.x，工具面向）
code_profiles_hashes  = cyrb53 per profile params（V2.4.0，規範面向）
                              ↓ 合成
governance_fingerprint = 'gov:' + cyrb53(calc_source_hash + '|' + canonicalJSON(code_profiles_hashes))
```

任一面向變動皆會更新此指紋。14 字元 hex，前綴 `gov:`，總長 18 字元，適合於 footer 顯示與簽證引用。

### 新增 API（`js/code-profiles-registry.spec.js`）

| API | 用途 |
|---|---|
| `computeFingerprint(str)` | 對任意字串產 cyrb53 指紋（暴露 helper）|
| `buildGovernanceFingerprint(calcSourceHash, codeProfilesHashes)` | 合成 `gov:` 指紋；缺 calcSourceHash 回 `null` |

### 寫入位置

`window.getCalculationResults().meta.governance_fingerprint`：
- file:// 環境：calc_source_hash 受 fetch 限制為 null → governance_fingerprint 為 null（合理，會於 INFO 級檢查項顯示）
- http:// 環境：完整字串，例如 `gov:17a81de1da0c4f`

### footer 治理指紋列

法規版本表新增「治理指紋」列，顯示完整 18 字元 `gov:xxx`，title tooltip 說明「工具或規範任一變動皆會更新此指紋」。

### 6 層治理指紋完整

| 層 | 指紋 | 變動觸發 |
|---|---|---|
| 1 | `input_hash` | raw input 變動 |
| 2 | `normalized_input_hash` | schema 後仍變動 |
| 3 | `result_hash` | 計算結果變動 |
| 4 | `calc_source_hash` | calc-core JS 內容變動 |
| 5 | `code_profiles_hashes` | profile params 變動 |
| 6 | **`governance_fingerprint`** | 4 + 5 任一變動 |

### 護欄擴充

`code-profiles-registry-smoke.test.js` 新增 3 項 V2.5.0 斷言：
- `computeFingerprint` 確定性 + 不同 input 不同 output
- `buildGovernanceFingerprint(null, ...)` 應回 null
- 隨 calc_source_hash 或 profiles 變動而 fingerprint 變

`tests/visual_decoration_test.py` 新增兩階段測試：
- 第一階段：file:// 環境 governance_fingerprint=null 屬正常（skipped 標記）
- 第二階段：stub `__CALC_SOURCE_HASH` 後 fingerprint 必為 gov:14hex、footer 列出現

### 護欄驗證

- baseline drift 5/5 = **0%**（純 meta + UI；archive 對齊故無 WARN）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 32 → **35 項** 全通過

### 後續路線

- **V2.5.1**：governance_fingerprint 寫入匯出檔名（如 `_gov-17a81d.docx`），可從檔名判讀治理狀態
- **V2.5.2**：governance_fingerprint 寫入 review_summary 與 cover 末端 footer，作為簽證頁脚識別
- **長期**：「規範變動聲明」附錄產生器（archived hash → current hash 自動敘述差異）

至此治理鏈完整：6 層指紋涵蓋輸入、過程、結果、工具、規範、合成；任何環節變動皆有可追溯指紋。

## V2.4.2 - 2026-04-29

### 重點：profile 變動於匯出端閘門化（archive drift → 匯出 WARN）

V2.4.1 已能於 footer 顯示「自 V2.X.Y 起已變動」徽章，但**徽章只在預覽中可見，匯出 PDF 後仍可能被忽略**。技師若採用變動後的 profile 簽證，應於正式計算書留下書面提醒。V2.4.2 把 archive drift 整合進既有「匯出前檢查」三層閘門系統。

### 整合到既有 export checklist

`v2CollectExportChecklist()` 新增兩條規則（位於規則 20 與 INFO 段之間）：

| 等級 | 觸發條件 | 文字 |
|---|---|---|
| WARN | `meta.code_profiles_changelog.anyChanged === true` | `規範 profile params 已偏離 archive baseline：<scope>（自 V2.X.Y 起）。簽證計算書建議附「規範變動聲明」附錄，說明採用之 profile 自上次發行以來的差異。` |
| INFO | `meta.code_profiles_changelog.anyNew === true` | `偵測到新 profile（archive 未紀錄）：<scope>（<id>）。下個版本上線時請於 PROFILE_HASH_ARCHIVE 新增 entry 以建立 baseline。` |

### 設計選擇

- **WARN 而非 BLOCK**：profile 變動本身合法（規範改版時必發生），但須留下書面紀錄。WARN 觸發匯出確認對話框，技師需手動 acknowledge 才能繼續。
- **僅當 anyChanged=true 才觸發**：與 archive 一致時 checklist 完全不顯示此項，保持 UI 乾淨。
- **複用既有 checklist 系統**：不新建獨立面板；BLOCK/WARN/INFO 三層分區、確認對話框、匯出阻擋邏輯皆既有。

### 完整 archive 治理鏈

```
profile JSON 變更
       ↓
[1] cyrb53 hash 變動 (V2.4.0)
       ↓
[2] buildActiveProfileChangelog 偵測 anyChanged=true (V2.4.1)
       ↓
[3a] footer ⚠ 紅色徽章「自 V2.X.Y 起已變動」(V2.4.1)
       ↓
[3b] 匯出檢查 WARN「建議附規範變動聲明」(V2.4.2 ← 本輪)
       ↓
[4] 確認對話框 → 技師手動 acknowledge
       ↓
[5] PDF / Word / docx 匯出（含書面 archive 比對 meta）
```

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.4.2 階段測試：

- **stub `window.getCalculationResults`** 注入 fake `code_profiles_changelog` 中 `anyChanged=true` 與 fake hashes
- 呼叫 `v2CollectExportChecklist(payload, null)`
- 驗證返回 items 中含 1 條 WARN、文字包含 `'archive baseline'`
- 還原 stub 避免影響後續

斷言 `gate_state.warn_hits >= 1` + 列印實際 WARN 文字（前 100 字）。

### 護欄驗證

- baseline drift 5/5 = **0%**（純檢查邏輯增添；archive 與目前 inline 對齊故 anyChanged=false，未觸發新 WARN）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 V2.4.2 stub 測試）全通過

### 後續路線

- **V2.5+**：calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint
- **長期**：實作「規範變動聲明」附錄產生器（archived hash → current hash 之 diff 自動敘述）

## V2.4.1 - 2026-04-29

### 重點：profile params 歷史 archive 與「自上次版本已變動」審查徽章

V2.4.0 寫入 cyrb53 指紋讓技師「看到當下值」，但無從直接知道**「自上次發行版以來規範值是否變動」**。V2.4.1 新增 archive snapshot + 比對 API，於 footer 直接以紅色警示徽章標出變動 scope。

### archive snapshot

`PROFILE_HASH_ARCHIVE`（registry 內 frozen 陣列）每次重大 profile 異動時新增一個 entry：

```jsonc
{
  "version": "V2.4.0",
  "date":    "2026-04-28",
  "note":    "首批 archive：V2.4.0 上線時對所有 profile 取 cyrb53 指紋作為基準",
  "hashes":  { /* 6 個 profile id → cyrb53:14hex */ }
}
```

V2.4.1 此 entry 即為**首批 baseline**；未來 profile params 變動時，新增下一個 entry 並更新 `latest`。

### 新增 4 個 API（`js/code-profiles-registry.spec.js`）

| API | 回傳 |
|---|---|
| `getLatestProfileArchive()` | 最新 snapshot 物件 |
| `compareProfileHashWithArchive(id)` | `{ changed, newProfile, currentHash, archiveHash, archiveVersion, archiveDate }` |
| `buildActiveProfileChangelog(inp)` | `{ ok, anyChanged, anyNew, perScope }` 給 meta 用 |
| `PROFILE_HASH_ARCHIVE` | 整個 archive 陣列（唯讀）|

### 寫入位置

- `result.meta.code_profiles_changelog`：完整 changelog（與既有 `code_profiles_hashes` 並列）
- 法規 footer：每個 scope 的 hash 徽章後追加：
  - 紅色 ⚠ `自 V2.X.Y 起已變動`：profile params 已偏離 archive
  - 橘色 ＋ `新 profile`：archive 中無此 profile id（新增者）

### 護欄擴充

`code-profiles-registry-smoke.test.js` 新增 5 項 V2.4.1 斷言：
- archive 含 V2.4.0 baseline 與 6 個 profile 之 hash
- 預設 inp 應 changed=false
- 不存在 profile id 不應視為「變動」
- `buildActiveProfileChangelog({})` anyChanged=false
- 切到對照 profile（已在 archive）也應 anyChanged=false

`tests/visual_decoration_test.py` 新增 2 項斷言：
- `code_profiles_changelog_present === true`
- `code_profiles_no_drift === true`

### 護欄驗證

- baseline drift 5/5 = **0%**（純 meta + UI 增添）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 27 → **32 項** 全通過
- visual_decoration_test 由 27 → 29 項斷言

### 後續路線

- **V2.4.2**：archive 異動時於匯出端閘門化（changed=true 自動加「規範變動聲明」附錄）
- **V2.5+**：calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint

## V2.4.0 - 2026-04-28

### 重點：規範變更追蹤指紋（profile params SHA 等級指紋寫入 result meta）

V2.3.0 完成 calc-core 強度 + 構造雙層 profile 化（35 個鍵）。但治理鏈仍欠一塊：**規範值是否被偷偷改過，沒有可驗證的指紋**。例如某 profile JSON 的 `granite_grade2_fb` 從 55 被改成 56，calc 結果略變但既有 baseline 指紋無法直接揭露此變動。

V2.4.0 補上：每個 profile 之 `params` 物件計算 deterministic 指紋，寫入 `result.meta.code_profiles_hashes`，並於計算書 footer 顯示。

### 指紋演算法選擇

評估三種：

| 方案 | 結果長度 | 同步 | 碰撞率 | 採用 |
|---|---|---|---|---|
| Web Crypto SHA-256 (async) | 64 hex | ❌ | 極低 | – |
| 自實作 SHA-256 (sync) | 64 hex | ✓ | 極低 | – |
| **cyrb53** (sync, 53-bit) | 14 hex | ✓ | ~0.0001% | **採用** |

選 cyrb53：governance 用途下足夠（不是用於密碼學防偽），同步、無依賴，可在 Node 與瀏覽器通用，產出 14 字元 hex 適合做小徽章顯示。

### 新增 API（`js/code-profiles-registry.spec.js`）

- `_canonicalJSON(obj)`：鍵遞迴排序的確定性序列化（保證 hash 不依賴 key 順序）
- `_cyrb53(str)`：53-bit 確定性 hash（同步）
- `getProfileParamsHash(id)` → `'cyrb53:' + 14 hex`
- `getAllProfileHashes()` → `{ id: 'cyrb53:...' }` 對照表
- `buildActiveProfileHashes(inp)` → `{ scope: { id, hash } }`，給 result.meta 使用

### 寫入位置

`window.getCalculationResults().meta.code_profiles_hashes`（與既有 `code_profiles` 並列）：

```jsonc
{
  "wind":    { "id": "cns_wind_107",         "hash": "cyrb53:7f2a93b1c4d8e0" },
  "seismic": { "id": "cns_seismic_113",      "hash": "cyrb53:ba8c4f72e1d39a" },
  "anchor":  { "id": "aci_318_appendix_d",   "hash": "cyrb53:..." },
  "steel":   { "id": "cns_steel_general",    "hash": "cyrb53:..." },
  "stone":   { "id": "cns_stone_general",    "hash": "cyrb53:..." }
}
```

### footer 徽章顯示

法規版本表中每個 scope 行尾追加灰色小徽章，顯示 14 字元 hash（`title` tooltip 說明用途）。任何 profile params 變動都會立即反映於徽章。

### 護欄擴充

`code-profiles-registry-smoke.test.js` 新增 4 項 V2.4.0 斷言：
- 確定性（同 input 同 output）
- 不同 profile 不同 hash
- `getAllProfileHashes` 涵蓋所有 6 個註冊 profile
- `buildActiveProfileHashes` 隨 inp 切換而變

`tests/visual_decoration_test.py` 新增 3 項斷言：
- `code_profiles_hashes_present === true`
- `code_profiles_hashes_count >= 5`
- `seismic_hash_format_ok`（cyrb53: + 14 hex）

### 護欄驗證

- baseline drift 5/5 = **0%**（hash 寫入 meta 不影響 calc，auto_diff 不比對 meta hashes）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 23 → **27 項** 全通過

### 治理鏈現況

```
profile JSON / inline registry
       ↓
       ├── canonicalJSON → cyrb53 → 14-hex 指紋
       │                                 ↓
       │                  buildActiveProfileHashes(inp)
       │                                 ↓
       └── calc-core (V2.1.x + V2.3.0 共 35 鍵消費)
                                         ↓
                       result.meta.code_profiles_hashes ←─┐
                                         ↓                 │
                       footer 徽章顯示（14 hex / scope）─┘
```

### 後續路線

- **V2.4.1**：審查模式 — 比對歷史 profile hashes（顯示「已變動於 V2.X.Y」）
- **V2.4.2**：profile 變動時觸發 governance 警示（hash mismatch with previous run）
- **V2.5+**：將 calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint

至此治理鏈已完整：raw input → schema → calc-core → result + 5 層指紋（input_hash + normalized_input_hash + result_hash + calc_source_hash + **code_profiles_hashes**）。

## V2.3.0 - 2026-04-28

### 重點：detailing 層 profile 化（錨栓構造最小值由 ACI Appendix D profile 取得）

V2.1.x 完成「強度層」規範參數遷移（30 個係數）；V2.2.x 完成 profile 治理 UI。本版次將最後一塊未動的 **detailing 層**（構造最小值檢核）也納入 profile-aware 機制：完成「強度 + 構造」雙層治理覆蓋。

### 範圍

`customAnchorCheck()` 內 4 項構造最小值原為 hardcoded：

| 檢核項目 | 原 hardcoded | profile 鍵 |
|---|---|---|
| 錨栓 / 插梢長度 L ≥ ? | 75 mm | `anchor.min_anchor_length_mm` |
| 錨栓 / 插梢埋深 hef ≥ ? | 40 mm | `anchor.min_embedment_mm`（既有）|
| 錨栓 / 插梢邊距 c ≥ ? | 25 mm | `anchor.min_edge_distance_mm`（既有）|
| 錨栓 / 插梢直徑 d ≥ ? | 4 mm | `anchor.min_anchor_diameter_mm`（既有）|

**新增 profile 鍵**：`min_anchor_length_mm: 75` 加入 `aci_318_appendix_d.json` + inline registry + smoke test。

### 遷移成果

`customAnchorCheck()` 內 4 限制 × 2 組（一般錨栓 + 插梢鋼棒）= **8 處檢核斷言** 全部 profile-aware；額外**3 處 inp 預設值**（`sp_custom_anchor_edge_mm`、`sp_custom_pin_length/embed/edge_mm`）也由 profile 取得。

`row()` 之公式字串（`L ≥ 75` / `hef ≥ 40` / `c ≥ 25` / `d ≥ 4`）與描述均改用 `${minL/H/C/D}` 動態組裝，避免規範改版後文字與計算分歧。

### 累計成果（橫跨強度與構造層）

| 層 | 涵蓋 | 已遷移係數 |
|---|---|---|
| 強度層（V2.1.x）| seismic、anchor、steel、stone | 30 |
| 構造層（V2.3.0）| anchor 構造最小值 | 4 限制 + 1 新 profile 鍵 |
| **小計** | – | **35 個 profile 鍵直接被 calc-core 消費** |

### 護欄驗證

- baseline drift 5/5 = **0%**（fallback 與 profile 值對齊；3 個 baseline 案例的構造檢核行為不變）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 22 → **23 項** 全通過

### 治理鏈現況

```
[ 強度 (V2.1.x) ] ─┐
                   ├─→ getParam(scope, key, fallback) ─→ active profile
[ 構造 (V2.3.0) ] ─┘                                       │
                                                            ↓
                                              5 個 profile JSON （+1 對照）
                                                            │
                              ┌─ validateProfile (V2.2.0) ──┤
                              ├─ auditAgainstConsts ────────┤
                              ├─ 「規範自檢」徽章 (V2.2.1) ─┤
                              ├─ 「規範參數總覽」 (V2.2.2) ─┤
                              ├─ profile picker (V2.2.3) ───┤
                              └─ profile diff viewer (V2.2.4)
```

### 後續路線

- **V2.3.1（候選）**：補錨栓構造最小值與插梢分離 profile 鍵（如 pin 用較小 d_min）
- **V2.3.2（候選）**：錨栓相關公式（hef 與 c 之 N_b、V_b 計算式）profile 化
- **V2.4+**：規範變更追蹤（profile params 之 SHA-256 hash 寫入 result meta）

至此 calc-core 中所有可被合理 profile 化的規範常數皆已遷移；後續多需先擴充計算邏輯（如新增公式項）才有更多遷移目標。

## V2.2.4 - 2026-04-28

### 重點：profile diff viewer（並排對照預設 vs 對照 profile 計算結果）

V2.2.3 上線了 picker，使用者可切換對照 profile 並看到 DCR 變動，但**只看到單側結果，無法直觀知道差距大小**。本版次新增 diff viewer，雙路執行 calc-core，並排呈現 A（強制預設）vs B（已覆寫）之每案例 metric。

### 雙路計算機制

`v2InjectProfileDiff()`：

- 不動 localStorage（避免副作用）
- 從 `inputs()` 取得當前完整 inp
- 構造兩份 inp：A = 移除 `code_profiles` 之 inp、B = 含 override 之 inp
- 各自走 `StoneInputSchema.validateAndNormalize()` 標準化（與 `getCalculationResults` 同條鏈）
- 各自呼叫 `computeAllCasesScoped()`
- 對每個案例比較：Fph、DCR_governing、passed 狀態
- 計算 Δ% 並上色：紅 = 上升（更危險）、綠 = 下降（更安全）、灰 = 持平

### 顯示邏輯

| 條件 | 行為 |
|---|---|
| 無 override | 不顯示（避免空白噪音）|
| 有 override | `<details open>` 區塊顯示於 active params 之後 |
| 列印 / PDF | 自動展開、`break-inside:avoid` |

### 視覺設計

- 配色：暖黃背景 `#fff8e8` + 邊框 `#e8c87a`，與「規範自檢」綠橘、「規範參數總覽」灰白形成 governance 三色階
- 每列含：案例名 / Fph(A,B,Δ%) / DCR(A,B,Δ%) / 通過狀態(A→B) / 變動標註
- 「轉不通過」/「轉通過」顯著標示，提醒技師審視
- 末尾 `pd-note` 紅字提醒：採 B（覆寫）簽證須附說明採用對照 profile 之理由

### 護欄擴充

`tests/visual_decoration_test.py` 新增 4 項斷言（單一檔案兩階段測試）：

1. **無 override 時**：`profile_diff_present_no_override === false`（不應出現）
2. **設定 seismic override 後**：`diff_state.present === true`
3. `row_count >= 1`：至少 1 列案例
4. `has_pct_marker`：含 `pd-up/down/eq` 百分比上色標記

測試流程：先驗無 override 狀態 → `localStorage.setItem('stone_v2_profile_override', ...)` + `render()` → 驗有 override 狀態 → `localStorage.removeItem` 還原避免影響後續。

### 護欄驗證

- baseline drift 5/5 = **0%**（diff viewer 純讀取既有 calc 結果，不寫入 hash 或 result）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 4 項新斷言）全通過
- Playwright 模擬 override 後 diff viewer 正確注入 1 列、含 pct marker

### 後續路線

- **V2.3+**：補錨栓構造最小值檢核（min_anchor_diameter / min_embedment / min_edge_distance），需走 approved drift 流程
- **長期**：補實際歷史規範 profile（如 cns_seismic_111）以對照不同年份規範影響；diff viewer 將直接支援
- **可能 V2.2.5**：profile picker 改為跨 scope 一鍵切換（preset bundle）

V2.2.x「治理鏈第二環的 UI 化」系列至此告一段落：profile 自身已可驗證、可核對、可切換、可對照。

## V2.2.3 - 2026-04-28

### 重點：profile picker 上線（從「單一規範」推進到「保守對照」）

V2.2.2 已展示所有 active params 給技師核對，但所有 scope 都只有一個 profile 候選 — picker 沒有意義。本版次新增第一個對照 profile，並上線完整 picker UI 機制。

### 新增對照 profile

`js/code-profiles/cns_seismic_113_conservative.json`（同步加入 inline registry）：

| 鍵 | 113 預設 | 113 保守對照 | 變動意義 |
|---|---|---|---|
| `Fph_detailed_lower_factor` | 0.3 | **0.4** | 細算下限拉高 33% |
| `Rp_stone_panel_default` | 2.5 | **2.0** | 反應修正係數降，需求增 25% |
| 其餘鍵 | – | 同 113 | 保留可比較性 |

定位：**工程設計階段保守邊界對照**；正式簽證採用須附說明採用理由。`notes` 欄位明確標註此原則。

### profile picker UI

於計算書末頁「規範參數總覽」每個 scope 標題下方追加：

- `<select>` 下拉，列出該 scope 全部候選 profile（用 `listProfilesByScope`）
- 「已覆寫」橘色徽章，提示目前非預設 profile
- `@media print` 隱藏 picker（列印只見結果，不見操作元素）

### inputs() ↔ localStorage ↔ picker 三向綁定

- 切換 picker → 寫入 `localStorage['stone_v2_profile_override']`（JSON 物件）
- `inputs()` 讀取 localStorage，注入 `inp.code_profiles`
- 切回預設 → 移除 key（清空時整鍵也刪除）
- picker change 自動觸發 `window.render()`，使用者立即看到 DCR / Fph 變動

### registry 擴增

`js/code-profiles-registry.spec.js` PROFILES 從 5 → 6 個；smoke test 由 21 → 22 項，新增：

- `[2]`：對照 profile 存在且 lower=0.4 / Rp=2.0 差異正確
- `[10]`：seismic scope candidate count >= 2
- `[18]`：validateAllProfiles 通過數放寬至 >= 5
- `[21][22]`：JSON↔inline 比對範圍含對照 profile

### 護欄擴充

`tests/visual_decoration_test.py` 新增 2 項斷言：
- `profile_picker_count >= 1`：seismic 應有 picker
- `seismic_picker_options >= 2`：seismic picker 候選 >= 2

實測：picker 數 = **1**，seismic 候選 = **2**。

### 護欄驗證

- baseline drift 5/5 = **0%**（DEFAULT_ACTIVE 仍為 cns_seismic_113，baseline 案例未啟用對照 profile）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 2 項新斷言）全通過
- code-profiles-registry-smoke 由 21 → **22 項** 全通過

### 後續路線

- **V2.2.4**：profile diff viewer — 並排對照預設 vs 對照 profile 的計算結果差異
- **V2.3+**：補錨栓構造最小值檢核（min_anchor_diameter / min_embedment / min_edge_distance），需走 approved drift 流程
- **長期**：補實際歷史規範 profile（如 cns_seismic_111）以對照不同年份規範影響

## V2.2.2 - 2026-04-28

### 重點：規範參數總覽（active profile params 全列表）

V2.2.1 已將 profile 驗證結果以「規範自檢」徽章呈現，但**徽章只能說「驗證通過」**，無法說「採用了什麼數值」。本版次新增「規範參數總覽」區塊，列出 5 個 scope 之 active profile 全部 52 個參數（5 scope × 平均 10 鍵），讓技師簽證前可逐項核對。

### 「規範參數總覽」區塊

`v2InjectActiveParamsOverview()` 在法規 footer 之後追加可展開區塊：

- 預設展開（`<details open>`）；列印與 PDF 自動展開全部內容（`@media print` 規則）
- 5 個 scope 分組顯示：耐風 / 耐震 / 錨栓 / 鋼結構 / 石材
- 每組顯示 profile id + name + 全部 params（key / value 對照表）
- 數值格式：整數直顯；浮點 6 位以內保留有效位數；極小值或極大值用科學記號；陣列顯示長度；物件顯示鍵數

### CSS 設計

`.v2-active-params` 採低存在感配色（背景 `#fcfdfe`、灰色虛線 row 邊界、monospace key）；列印時自動展開且收合箭頭隱藏；`break-inside:avoid` 避免跨頁切割。

### 護欄擴充

`tests/visual_decoration_test.py` 新增 3 項斷言：
- `active_params_block_present`：區塊已注入
- `active_params_scope_count >= 5`：5 個 scope 全展示
- `active_params_total_rows >= 25`：列數涵蓋 V2.1.x 累計遷移

實測產出 **52 個參數列**（5 scope）。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 增添；calc-core 與 hash 邏輯未變）
- 6 套 Node smoke + 語法 + autoword 指紋閘門 + 視覺裝飾（含 3 項新斷言）全通過

### 後續路線

- **V2.2.3**：HTML profile picker UI（讓使用者切換 active profile，需先有第二份 profile 對照如 cns_seismic_111）
- **V2.2.4**：profile diff viewer（兩份 profile 並排對照計算結果差異）
- **V2.3+**：補錨栓構造最小值檢核（min_anchor_diameter / min_embedment / min_edge_distance），需走 approved drift 流程

## V2.2.1 - 2026-04-28

### 重點：profile 驗證 API 從「函式可用」推進到「報告可見」

V2.2.0 上線了 `validateAllProfiles()` 與 `auditProfileAgainstConsts()` 兩個治理 API，但結果僅在 Node smoke test 中可見。本版次將其結果**直接呈現於計算書末頁的「規範版本」footer**，使技師簽證前能直接確認 profile 自身的健全性。

### 「規範自檢」徽章

`v2InjectRegulationFooter()` 新增一列「規範自檢」，於計算結果預覽末頁的法規版本表中顯示：

- **schema 驗證**：呼叫 `StoneCodeProfiles.validateAllProfiles()`，5 個 profile 全部通過時顯示 `✓ profile schema 驗證通過`
- **CONSTS 一致性**：以 `auditProfileAgainstConsts('cns_stone_general', ...)` 比對 profile 之 8 個石材 fb·ft 鍵與 `STONE_CONSTANTS.STONE_GRADE_CATALOG` 之對應路徑；一致時顯示 `✓ profile 與 CONSTS 一致`
- 任一檢查失敗時顯示 `⚠` 與失敗計數，但**不阻擋計算與匯出**（governance 觀察用，不取代既有 BLOCK 級閘門）

徽章採綠/橘雙色配色，列印與 PDF 匯出皆會留存。

### 護欄擴充

`tests/visual_decoration_test.py` 新增斷言 `validation_badge_present`：透過 Playwright 直接查找預覽 DOM 中是否有「規範自檢」字樣的 td；缺席時測試失敗。

### 護欄驗證

- baseline drift 5/5 = **0%**（純 UI 增添；calc-core 與輸出邏輯未變）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含新斷言）全通過

### 後續路線

- **V2.2.2**：規範參數總覽（list active params with formula links），預計同樣以可展開區塊方式呈現
- **V2.2.3**：HTML profile picker UI（讓使用者於設計階段切換 active profile，需先有第二份 profile 對照）
- **V2.3+**：補錨栓構造最小值檢核（min_anchor_diameter / min_embedment / min_edge_distance），需走 approved drift 流程

## V2.2.0 - 2026-04-28

### 重點：profile 治理鏈強化（從遷移轉向驗證）

V2.1.x 系列完成 30 個規範參數遷移後，本版次轉向 **profile 自身的健全性與一致性護欄**，將治理鏈第二環從「能讀取」推進到「能自我驗證」。

### profile / CONSTS 一致性對齊

審查 `js/code-profiles/cns_stone_general.json` 與 `js/constants.spec.js` 之 `STONE_GRADE_CATALOG`，發現 marble / sandstone 之 fb·ft 不一致：

| 等級 | 修正前 profile | CONSTS（CNS 為主）| 修正後 profile |
|---|---|---|---|
| marble fb | 40 | 35 | **35** |
| marble ft | 25 | 22 | **22** |
| sandstone fb | 30 | 22 | **22** |
| sandstone ft | 20 | 14 | **14** |

依使用者「CNS 國家標準優先」原則，profile 統一對齊 CNS 14448 / CNS 6300 A1028 試驗值（即 CONSTS 之來源）。`cns_stone_general.json` 註記亦更新說明 V2.2.0 校正範圍。

由於目前 calc-core 未直接消費 marble / sandstone 之 profile 鍵（仍由 `inp.sp_stone_fb / sp_stone_ft` 經 `panelCheck()` 流入，且 V2.1.2 預設使用 `granite_grade2_fb`），**baseline drift 仍為 0%**。

### profile schema 驗證 API（`js/code-profiles-registry.spec.js`）

新增三個治理函式：

- `validateProfile(profile)` → `{ ok, errors[] }`
  - 檢查必要欄位（schema_version / id / scope / name / params）
  - 檢查 scope 是否屬已知集合（DEFAULT_ACTIVE 中的 5 種）
  - 檢查 schema_version 符合 SemVer
- `validateAllProfiles()` → `{ ok, results[] }`
  - 對 5 個註冊 profile 全面驗證
- `auditProfileAgainstConsts(profileId, mapping, CONSTS)` → `{ ok, diffs[] }`
  - 將 profile 鍵與 CONSTS 路徑（如 `STONE_GRADE_CATALOG.marble.fb`）逐一比對
  - 任何差異列入 `diffs[]`，主要供啟動自我檢查與測試使用

### smoke test 強化

`code-profiles-registry-smoke.test.js` 從 15 項擴充到 **21 項**：

- 新增 `[15]–[19]`：覆蓋 validateProfile / validateAllProfiles / auditProfileAgainstConsts 之正反向案例
- 新增 `[21]`：profile JSON ↔ inline registry 之 params 數值深入比對（純 number / string 欄位逐一斷言）
- 過程中發現並修正：
  - `cns_seismic_113` JSON 缺 `ap_rigid` / `ap_flexible` ←→ inline；補入 inline
  - `cns_steel_general` JSON 重複 `shear_reduction`（與 `Fv_factor` 同值 0.4）；移除冗餘鍵

### 護欄驗證

- baseline drift 5/5 = **0%**（calc-core 行為完全不變）
- 6 套 Node smoke + 語法 + autoword 指紋閘門 + 視覺裝飾 全通過
- code-profiles-registry-smoke 由 15 → **21 項** 全通過

### 後續路線

V2.2 系列規劃：

- **V2.2.1（候選）**：HTML profile picker UI（讓使用者切換 active profile）
- **V2.2.2（候選）**：profile diff viewer（展示新舊 profile 影響的計算項目）
- **V2.3+**：補錨栓構造最小值檢核（min_anchor_diameter / min_embedment / min_edge_distance），需走 approved drift 流程

## V2.1.3 - 2026-04-28

### B4 Phase 2 第四批：鋼材 Fy 預設與耐震 PEV 係數遷移

延續 V2.1.0 / V2.1.1 / V2.1.2 的 `getParam(inp, scope, key, fallback)` pattern，再將 `js/calculator.spec.js` 中與耐震垂直分量及鋼材材性相關的硬編參數遷移為 profile-aware：

- **Batch 1：鋼材 Fy 預設**
  - `Fy_SUS304_default`（2100 kgf/cm²）→ `inp.m_fy` 預設值
  - 涉及兩處：`buildCaseCheckData()`（角鋼/支撐 Fy）與 `slipPlateCheckData()`（伸縮片 Fy）
- **Batch 2：耐震 PEV 係數**（`calcCase()` 內）
  - `PEV_factor_conservative`（0.5）→ 0.5PE 保守式倍率
  - `PEV_factor_standard`（0.2）→ 0.2 SDS·D 規範式倍率
- **Batch 3：顯示字串動態化**
  - PEV 方法字串改用 `pevMethod` 變數，避免規範改版後文字與計算分歧
  - 「角鋼容許應力採純靜載模式：Fb 不乘 1.25」改用 `wcfDefault` 動態組裝
  - 已於 V2.1.2 完成 `dimensionCheck()` 之 `t ≥ 30 / A ≤ 1.0`，本輪延伸至耐震/鋼材描述

三批共計 **5 個係數** 從 hardcoded 改為 `_profiles.getParam(...)`，**fallback = 原 hardcoded 值**保證向後相容。

### 累計 V2.1.x 遷移成果

| 版次 | 批次數 | 遷移係數累計 | 涉及 scope |
|---|---|---|---|
| V2.1.0 | 1 demo（耐震 Fph 4 係數）| 4 | seismic |
| V2.1.1 | 4 批（錨栓 ψc/φ/SF/互制 + 鋼材 Fb/Fv）| 11（累 15）| anchor、steel |
| V2.1.2 | 3 批（石材/熱脹/耐震/尺寸）| 10（累 25）| stone、seismic |
| V2.1.3 | 3 批（鋼材 Fy + 耐震 PEV + 顯示字串）| 5（累 **30**）| steel、seismic |

### 護欄驗證

- baseline drift 5/5 = **0%**（fallback 值與 profile 值對齊，行為不變）
- 6 套 Node smoke + 語法 + autoword 指紋閘門 + 視覺裝飾 全通過
- 全 10 項一鍵測試套件 PASS

### 候選後續批次（V2.1.4+）

- 風壓 GCpi / Cpe（需先重構 `computeWindFromGCp` 之 0 fallback 語意）
- 其他石材等級 fb/ft 切換邏輯（涉及 `STONE_GRADE_CATALOG` 與 profile 並存）
- 鋼材 thermal_alpha_steel（僅在補上「鋼支架伸縮檢核」後才有 calc-core 消費）
- 錨栓 `min_anchor_diameter_mm` / `min_embedment_mm` / `min_edge_distance_mm`（需新增對應 calc-core 檢核）

V2.1.x 系列至此告一段落：calc-core 中所有「規範常數型」hardcoded 值幾乎已全數 profile-aware；後續候選多需先補檢核項目或重構輸入語意，建議併入 V2.2 規劃。

## V2.1.2 - 2026-04-28

### B4 Phase 2 第三批：石材／熱脹／耐震輸入預設遷移

延續 V2.1.0 / V2.1.1 的 `getParam(inp, scope, key, fallback)` pattern，再將 `js/calculator.spec.js` 中三批與工程預設值高度相關的硬編參數遷移為 profile-aware：

- **Batch 1：石材容許值與背切錐角**（`panelCheck()` 內）
  - `granite_grade2_fb`（55 kgf/cm²）→ `inp.sp_stone_fb` 預設
  - `granite_grade2_ft`（35 kgf/cm²）→ `inp.sp_stone_ft` 預設
  - `back_anchor_cone_angle_deg_default`（30°）→ `inp.sp_panel_cone_angle` 預設
- **Batch 2：熱脹冷縮係數**（`thermalCheck()` 內）
  - `thermal_alpha_stone_default`（8e-6 /°C）→ `inp.sp_thermal_alpha` 預設
  - `thermal_delta_T_default`（40°C）→ `inp.sp_thermal_delta_t` 預設
- **Batch 3：耐震輸入預設與石材尺寸限制**
  - `seismic.ap_default`（1.0）/ `seismic.Rp_stone_panel_default`（2.5）→ `seismicDemand()` ap, rp 預設
  - `seismic.Ip_facade_minimum`（1.5）→ `effectiveIp()` 自動提升下限
  - `stone.min_thickness_default_mm`（30 mm）→ `dimensionCheck()` 厚度下限與顯示字串
  - `stone.max_panel_area_default_m2`（1.0 m²）→ `dimensionCheck()` 面積上限與顯示字串

三批共計 **10 個係數** 從 hardcoded 改為 `_profiles.getParam(...)`，**fallback = 原 hardcoded 值**保證向後相容。`dimensionCheck()` 的 row() 顯示字串改為動態組裝，避免規範改版後文字與計算分歧。

### 累計 V2.1.x 遷移成果

| 版次 | 批次數 | 遷移係數累計 | 涉及 scope |
|---|---|---|---|
| V2.1.0 | 1 demo（耐震 Fph 4 係數）| 4 | seismic |
| V2.1.1 | 4 批（錨栓 ψc/φ/SF/互制 + 鋼材 Fb/Fv）| 11（累計 15）| anchor、steel |
| V2.1.2 | 3 批（石材/熱脹/耐震/尺寸）| 10（累計 25）| stone、seismic |

### 護欄驗證

- baseline drift 5/5 = **0%**（fallback 值與 profile 值對齊，行為不變）
- 6 套 Node smoke + 語法 + autoword 指紋閘門 + 視覺裝飾 全通過
- 全 10 項一鍵測試套件 PASS

### 候選後續批次（V2.1.3+）

- 石材其他等級容許值（granite_grade1_fb/ft、marble_fb/ft、sandstone_fb/ft）—需配合 sp_stone_grade enum
- 熱脹鋼材係數 thermal_alpha_steel（鋼支架伸縮計算）
- 風壓 GCpi / Cpe（需先重構 computeWindFromGCp 之 0 fallback 語意）
- 鋼材 Fy_SUS304_default / Fy_A36_default

## V2.1.1 - 2026-04-27

### B4 Phase 2 第二批：規範參數遷移延伸（calc-core 真正消費 profile）

延續 V2.1.0 的 `getParam(inp, scope, key, fallback)` pattern，將 `js/calculator.spec.js` 中四批硬編規範參數遷移為 profile-aware：

- **Batch 1：錨栓拉剪互制指數**（`buildCaseCheckData()` 內）
  - `interaction_exponent_steel = 5/3`（ACI 318 Appendix D.7.3 精確形式）
  - 同時將 profile / smoke test 統一至 `5/3`，避免 1.67 與 5/3 的精度差異
- **Batch 2：錨栓 ψc 係數**（`psiFactors()` 內）
  - `psi_cN_uncracked` (1.25) / `psi_cN_cracked` (1.0)
  - `psi_cV_full_rebar` (1.4) / `psi_cV_edge_rebar` (1.2) / `psi_cV_no_rebar` (1.0)
  - 由 CONSTS.PSI_CV / PSI_CN 改為 profile 為主、CONSTS 為 fallback
- **Batch 3：錨栓 φ 折減係數**（`anchorCapacity()` 內）
  - `phi_steel = 0.75`（鋼材控制破壞）
  - `service_factor_typical = 1.6`（廠商試驗 SF 法服務係數）
  - `inp.sp_anchor_phi` 預設值由 profile 取得
- **Batch 4：鋼材容許應力係數**（`buildCaseCheckData()` / 主流程）
  - `Fb_factor_static = 0.6`（純靜載 D only 模式 Fb 倍率）
  - `Fb_factor_with_wind_seismic = 1.25`（D+W / D+E 組合提升）
  - `Fv_factor = 0.4`（剪力容許 Va = 0.4·Fy·A）
  - 同時 `inp.w_cf` 預設值改用 profile 之 `Fb_factor_with_wind_seismic`

四批共計 **11 個係數** 從 hardcoded 改為 `_profiles.getParam(...)`，**fallback = 原 hardcoded 值**保證向後相容。未來規範改版時，僅需更新 `js/code-profiles/aci_318_appendix_d.json` 或 `cns_steel_general.json`，calc-core 邏輯完全不動。

### 護欄驗證

- baseline drift 5/5 = **0%**（fallback 值與 profile 值對齊，行為不變）
- regression smoke / formula-registry / review-dashboard / version-sync / input-schema / **code-profiles-registry** 6 套 Node smoke 全通過
- syntax check / autoword guard / visual decoration 全通過
- 全 10 項一鍵測試套件 PASS

### 候選後續批次（V2.1.2+）

- 石材容許值（granite_grade1/2_fb / marble_fb / sandstone_fb 與對應 ft）
- 熱伸縮係數（thermal_alpha_stone / thermal_alpha_steel / thermal_delta_T）
- Rp_stone_panel_default（地震係數預設）/ Ip_facade_minimum
- 風壓 Cpe / GCpi 預設

## V2.1.0 - 2026-04-27

### 治理鏈強化

- **規範 profile JSON 化（B4 Phase 1）**：建立 `js/code-profiles/` 目錄，5 份規範參數獨立為 JSON profile（cns_wind_107、cns_seismic_113、aci_318_appendix_d、cns_steel_general、cns_stone_general）；`js/code-profiles-registry.spec.js` 統一註冊與查詢；`getCalculationResults().meta.code_profiles` 寫入 active profile id；法規 footer 顯示「採用 profile」資訊。Phase 2（calc-core 真正消費 profile）後續推進。
- **input-schema validation 鏈閉合**：raw input → schema → normalized → calc-core → result，meta 含 `input_schema_version` + `schema_validation`；errors → BLOCK 級匯出檢查、warnings → WARN、applied_defaults → INFO。
- **完整三層交付指紋**：`input_hash` + `normalized_input_hash`（schema 驗證後真獨立）+ `result_hash` 同時寫入 meta。
- **跨門檻顯示守衛擴充**：`V2_THRESHOLDS` 加入通用閾值機制；DCR=1.004 不再顯示為 1.00。

### 使用介面改善

- **匯出按鈕集中化**：原散落於 ③ 區段的 XLSX / CSV / 驗算 / 變更紀錄按鈕統一移至 `#btn-bar`，分「主要交付」「進階輸出」「專案存檔」三組。
- **預設收合 ⑤ 規範附加模組**：減少新使用者資訊過載；側欄頂部「全開／全收」工具列保留。
- **輸入欄位徽章**：21 個高風險欄位加「D」（影響 DCR）「預」（預設值來源）徽章 + 「仍為預設值」提示。
- **審查儀表板 dock 模式**：top / docked（桌機右側 320 px）/ docked-mini（48 px 立排條）三狀態切換。
- **送審速覽 opt-in**：「審查摘要」改名「送審速覽」並改為 opt-in（預設關閉），明示「本頁由設計者整理，僅供審查者快速索引；正式審查意見以審查單位制式表單為準」。

### 報告中性化（移除外露的內部術語）

- 「規範版」字尾全面從正式報告標題移除（HTML / Word / docx 三套）。
- 「案例 N」 / 「各案例附件」全面改「形式 N」 / 「各形式附件」（含資料層 normalize 預設）。
- 「工程覆核註記」改為「設計者註記」明示責任歸屬。
- 「規範附加摘要」改為「規範依據補充說明」。
- 「批次試算」字眼移除（外部用「敏感度分析」即可）。
- 移除送審速覽中「交付品質 A/B/C/D」、「工具版本／核心版本／產生器名／schema」、「範本來源」等內部追溯資訊。
- 「未勾選之規範模組不納入計算」等 UI 操作語言全面從報告主文移除。

### 列印 / 視覺

- KaTeX 0.16.11 離線版完整公式渲染（vendor/katex/，604 KB）；CRITICAL_BAND 內保留全位數，避免顯示精度損失。
- 列印時 `<thead>` 自動跨頁重複（`display:table-header-group`），長表格續頁不再無表頭。
- `.chk[data-tier]` 視覺分區（strength / detailing / info 三色左邊框）；governing_check 僅篩 strength tier。
- `auto_word.py` 指紋閘門：缺 `result / calc_source_hash / input_hash / result_hash` 時自動加「草稿 DRAFT」紅色斜體浮水印（80pt）並警示原因。

### 護欄與測試

- **9 項一鍵驗證套件**：`tests/run_all_tests.bat` + `tests/ci_summary.py` 涵蓋 6 套 Node smoke + 語法檢查 + baseline drift + auto_word 指紋閘門 + 視覺裝飾，產出 `_last_summary.json` CI 友善摘要。
- **快速檢查入口**：`tests/quick_check.bat` 跑 7 項免 Playwright 的快速檢查（< 5 秒）。
- **5 組 golden samples**：`tests/golden/auto_capture.py` + `auto_diff.py` + `_approval_log.md` 漂移偵測護欄；`schedule_drift_check.bat` 可註冊 Windows Task Scheduler 每日跑。
- **新增 6 套 Node smoke**：regression / formula-registry / review-dashboard / version-sync / **input-schema** / **code-profiles-registry**。

### 文件

- `dev_tools/architecture.md`：完整治理鏈紀錄與 17 點檢查表。
- `dev_tools/baseline_schema.md`、`baseline_capture.html`、`diagnostics.html`、`verifier.config.json`：護欄與診斷工具。
- `js/code-profiles/_README.md` + `_schema.md`：規範 profile JSON 倉庫使用規範。
- `tests/README.md`：測試套件使用指南。

### 既知限制

- `calc_source_hash` 在 `file://` 環境下因瀏覽器 fetch 安全限制為 `null`；透過 `啟動伺服器.bat` (`http://127.0.0.1:8765`) 可正常產生。

### B4 Phase 2 demo 上線（2026-04-27 追加）

`js/code-profiles-registry.spec.js` 新增 `getParam(inp, scope, key, fallback)` helper。**`js/calculator.spec.js` 中 `seismicDemand()` 函式為首例 profile-aware 計算分支**：

- `Fph_simple_factor`（耐震上限式 1.6）
- `Fph_detailed_lower_factor`（細式下限 0.3）
- `Fph_detailed_upper_factor`（細式上限 1.6）
- `Fph_detailed_base_factor`（細式基本式 0.4）

四個係數從 hardcoded 改為 `_profiles.getParam(inp, 'seismic', '...', fallback)`，**fallback = 原 hardcoded 值**保證向後相容。同時公式字串與註記也改用動態係數，未來規範改版時只需更新 `js/code-profiles/cns_seismic_*.json` 一個檔案，calc-core 邏輯完全不動。

baseline drift 5/5 = 0%（profile 預設值與原 hardcoded 一致），證實 migration pattern 正確。後續可繼續以同樣 pattern 漸進遷移其他規範參數（如 ψc 係數、φ 折減、Rp 預設值等）。

## V2.0.2 - 2026-04-25

### 修正

- 修正啟動路徑、伺服器根路徑與自動 Word 流程，統一指向 `石材計算書產生器_規範版V2.html`。
- 修正 `/generate` 舊版相容流程：V2 payload 若缺少有效前端 `results`，不再靜默退回舊 Python 公式。
- 修正自動 Word 與匯出檔名，避免不同匯出流程產生與 V2 畫面不一致的計算書。

### 新增

- 新增 Basic / Full 工作模式，並將工作模式寫入匯出 payload。
- 新增匯出前檢查清單，提醒缺案例、未通過項目、簽章資料、設計依據與伺服器版本不一致等風險。
- 新增審查摘要頁，HTML 預覽、相容 Word 與直接 DOCX 匯出皆會納入。
- 新增範本來源與版本追蹤，匯出 payload、審查摘要與稽核報告皆可追溯範本。
- 新增匯出稽核報告 JSON，記錄工具版本、範本來源、輸入雜湊、result source、案例摘要與輸出檔案。
- 新增螢幕用審查儀表板，於預覽區上方顯示案例數、未通過/警示數、控制 DCR、風壓來源、版本、伺服器一致性與範本來源。
- 審查儀表板支援點擊展開明細，列出未通過/警示項目、控制 DCR、範本與伺服器狀態。
- 新增 `js/regression-smoke.test.js`，覆蓋標準插銷、背扣與方向性風壓代表案例。
- 擴充 `js/regression-smoke.test.js`，追加 PEV 保守式、錨栓群組/邊距折減、手動 GCp/GCpi、層間變位、伸縮縫、靜載容許應力、單向板與拉剪分離計算情境。
- 新增 `js/formula-registry.spec.js` 與 `js/formula-registry-smoke.test.js`，集中登錄計算項目的公式、單位與規範來源，並檢查實際檢核項目是否都有可追溯說明。
- V2 審查儀表板與審查明細新增公式來源覆核；HTML、相容 Word 與直接 DOCX 的案例檢核表同步顯示公式來源。
- 新增工程覆核註記：未通過或警示項目可於審查明細填寫處置說明，註記會保存於專案 JSON 並輸出至審查摘要；匯出前會提醒尚未填寫註記的項目。
- 新增交付品質分級：整合案例狀態、未通過/警示、覆核註記、公式來源與伺服器一致性，於審查儀表板、審查明細、匯出前檢查與審查摘要顯示 A/B/C 分級。
- 匯出稽核報告新增結構化審查摘要，記錄交付品質、控制 DCR、公式來源覆蓋率與覆核註記數，便於跨版本比對。
- 新增 `audit_compare.py` 與 `audit_compare_test.py`，可比對兩份匯出稽核報告的交付品質、未通過數、警示數、控制 DCR、公式來源缺漏與覆核註記差異。
- `audit_compare.py` 新增 `--fail-on-regression`，交付品質、未通過數、警示數、控制 DCR 或公式來源缺漏變差時回傳失敗碼，便於交付前品質門檻使用。
- `audit_compare.py` 新增 `--latest`，可自動比較指定資料夾中最新兩份 `_驗證報告.json`。
- 新增 `比對稽核報告.bat`，提供拖曳、互動輸入或自動比較 `output` 最新兩份稽核報告的 Windows 入口，並預設啟用品質退步檢查。
- 新增 `self_check.py`，檢查 V2 HTML、啟動批次檔、server、auto_word 與版本宣告是否一致。
- 新增 `server_smoke_test.py`，離線檢查 V2 fallback 阻擋、匯出稽核摘要、CORS、靜態檔範圍與 JSON payload 驗證。
- 新增 `自我檢查.bat`，整合版本一致性、前後端語法、計算核心與伺服器 smoke test。
- 新增 `README.md` 與 `RELEASE_CHECKLIST.md`，提供啟動、維護與正式輸出前確認流程。
- 新增 `cleanup_temp.py` 與 `清理暫存檔.bat`，以 dry-run 優先方式列出並清理已知測試暫存檔。
- 新增 `.gitignore`，忽略測試暫存、快取、開發截圖與可再生匯出產物，降低維護時的 Git 狀態噪音。
- 新增 `PROJECT_FILES.md`，整理核心工具、測試維護、文件、參考資料、舊版相容與可清理產物。
- 新增 `make_release_bundle.py` 與 `建立交接包.bat`，以 dry-run 優先方式產生核心工具交接 ZIP，可選擇包含參考資料與舊版相容檔。
- 新增 `release_bundle_smoke_test.py`，檢查交接包必含核心檔、預設排除暫存/輸出/參考/舊版檔，並測試 ZIP 可讀。
- 新增 `env_check.py`，檢查 Python、Node、python-docx、lxml、pdf2docx、playwright 與 Chromium 執行環境。
- 新增 `ui_smoke_test.py`，以瀏覽器驗證 V2 頁面、審查儀表板、預覽頁與明細視窗。

### 強化

- 強化本機伺服器 CORS：POST 僅允許本機 HTTP 工具頁；`file://` 只保留 GET `/status`。
- 強化靜態檔服務範圍，只允許工具資料夾內檔案，阻擋上層資料夾與目錄列表。
- 強化 JSON payload 驗證，限制 Content-Type、UTF-8、根節點型別與 50 MB 大小。
- 強化匯出檔名規則，加入工程名稱、工具版本與時間戳，降低覆寫與混版風險。
- 強化 `/status` 診斷資訊，回傳 server version、tool HTML、URL、CORS 與 POST 限制。

### 維護注意

- V2 前端版本：`APP_VERSION = V2.0.2`。
- 伺服器版本：`SERVER_VERSION = 2.0.2`。
- 範本版本：`TEMPLATE_CATALOG_VERSION = templates-2026.04.25`。
- 計算核心版本：`StoneCalculator VERSION = 2026.04.23-spec-core11`。
- DCR 正規化：檢核列新增 `sense`（max/min/range），最小值與範圍型檢核不再被誤判為高 DCR 控制項；前後端 worst DCR 皆優先採用正規化值。
- 匯出稽核：後端驗證報告會補做工具 HTML / 伺服器一致性評估，偵測不一致時交付品質覆寫為 C。
- 報表可讀性：DCR 欄位新增檢核類型標示（最大值／最小值／範圍），後端稽核另列 `worst_warning` 與 `dcr_sense_counts`，避免警示項目與主控制項混淆。
- 可近用性：工作模式與規範模組篩選按鈕同步 `aria-pressed`，規範篩選補上群組名稱，讓目前選取狀態不只依賴視覺樣式。
- 可近用性：工作模式與規範模組篩選按鈕納入明確 `focus-visible` 樣式，鍵盤操作時可穩定辨識目前焦點。
- 可近用性：工作模式與規範模組篩選的初始 HTML 即包含群組名稱與 pressed 狀態，降低初始化前的語意落差。
- 可近用性：工具列符號按鈕（快捷鍵、復原、重做）補上明確 `aria-label`，避免只讀出符號。
- 可近用性：側欄搜尋框補上穩定 `aria-label`，不再只依賴 placeholder 表示用途。
- 可近用性：快速工具列補上具名 `toolbar` 語意，讓範本、展開收合、快捷鍵與復原/重做被辨識為同一組操作。
- 可近用性：快捷鍵、復原與重做按鈕補上 `aria-keyshortcuts`，讓 F1、Ctrl+Z、Ctrl+Y 可被輔助技術辨識。
- 可近用性：快捷鍵提示補上具名 region、`aria-hidden` 與觸發按鈕 `aria-expanded` 同步；範本管理入口補上 dialog target。
- 可近用性：進度遮罩補上 live status 與 `aria-hidden` 同步；PDF 頁面挑選器補上 dialog 語意、開關狀態與焦點還原。
- 可近用性：案例卡複製與刪除圖示按鈕補上明確 `aria-label`，動態案例操作不再只依賴圖示。
- 可近用性：工法卡放大鏡與附件移除圖示按鈕補上明確 `aria-label`，避免只讀出符號。
- 自我檢查：新增純圖示按鈕掃描，若缺少 `aria-label` / `aria-labelledby` 會於交付前擋下。
- 自我檢查：純圖示按鈕掃描器新增內建樣本測試，確認未標籤圖示會被抓出、有標籤或明確文字會放行。
- 可近用性：`.btn`、工法放大鏡、案例複製/收合與範本刪除等小型按鈕納入一致 `focus-visible` 樣式。
- 可近用性：案例刪除與附件移除這類 inline 圖示按鈕也納入 `focus-visible` 樣式，避免鍵盤焦點落點不明。
- 可近用性：PDF 頁面挑選器新增 Tab 焦點陷阱，鍵盤焦點會留在挑選 dialog 內循環。
- 可近用性：PDF 頁面挑選器補上 `aria-describedby`，全選、全不選與加入按鈕以 `aria-controls` 指向縮圖清單。
- 可近用性／安全性：附件清單縮圖補上 `alt`，並對附件檔名、說明與預覽 `src` 做 HTML escape。
- 可近用性／安全性：附圖附件正式預覽輸出同步 escape 工程名稱、附件標題、註記、圖片來源與說明，並補上圖片 `alt`。
- 穩定性：附圖每頁張數匯入、儲存與排版統一正規化為 1/2/4/6，避免異常值造成頁數估算與正式版面不一致。
- 穩定性／安全性：附圖附件啟用狀態、標題、註記與每頁張數改由 payload-aware helper 統一讀取，目錄與 Word/DOCX 附件標題同步 escape，避免舊 DOM 狀態殘留影響匯出。
- 穩定性：自訂範本、驗算對照與變更紀錄 localStorage 讀取加入陣列與項目型別守門，避免手動污染或舊資料格式造成清單渲染與 CSV 匯出中斷。
- 穩定性：範本載入時的 option 與工法卡查找改用 selector escape helper，避免自訂範本 method/key 含特殊字元時造成 selector 解析失敗。
- UI smoke：新增證書前置頁正式輸出的 escape / alt 樣本測試，與附圖附件頁共同覆蓋附件輸出路徑。
- 報表輸出：主文、耐風附錄、條文對照、簽核頁、批次分析與案例頁標題統一 escape 專案/案例名稱，避免特殊字元破壞正式版面。
- 報表輸出：工法實拍預覽、封面/簽核章、Word 證書頁與相容 Word 附錄標題補齊動態圖片路徑與標題 escape。
- 報表輸出：主文規範對照、面板/支承/錨栓摘要與案例檢核列補齊文字 escape，避免範本或案例文字影響正式報表結構。
- 輔助輸出：自訂範本管理清單與 Excel HTML 摘要匯出補齊方法、尺寸、標籤等 metadata escape。
- 互動介面：驗算對照表、錨栓查表提示與縣市/鄉鎮選單補齊動態值 escape，降低 localStorage 或資料表污染造成的 UI 破版風險。
- UI smoke：新增自訂範本與驗算對照表的 localStorage 污染樣本，確認管理清單與 input value 會正確 escape。
- 匯出安全：CSV 匯出新增共用 cell sanitizer，處理逗號/引號/換行並中和 `= + - @` 開頭的 Excel 公式注入風險；套用於案例、驗算、批次與變更紀錄 CSV。
- 穩定性：驗算對照、案例表與變更紀錄 CSV 匯出統一使用 `csvLine/downloadCsv`，標題列也走公式防護與共同下載釋放流程。
- 穩定性：案例檢核摘要 XLS、批次試算 CSV 與專案 JSON 匯出改走共用下載 helper，統一 object URL 建立、點擊與釋放流程。
- 穩定性：共用下載 helper 新增檔名正規化與長度上限，避免特殊字元、控制字元或過長專案名稱造成下載檔名異常。
- CSV 匯入：改為整份文字解析，保留引號欄位內的逗號、雙引號與換行；UI smoke 新增 quoted newline 樣本。
- CSV 匯入：案例表匯入新增副檔名/MIME 與 2 MB 大小檢查，並固定以 UTF-8 讀取，避免誤選非 CSV 或大型檔案。
- UI 安全性：PDF 解析錯誤訊息改以文字節點呈現；立面圖與簽章預覽改用 DOM image 節點與 `alt`，避免動態資料回流到 raw HTML。
- UI 安全性：圖片上傳入口新增光柵圖片白名單，只接受 PNG、JPG/JPEG、WEBP、GIF；SVG 或非圖片檔會被拒絕，PDF 維持由頁面挑選器轉成 PNG。
- UI 安全性：圖片與簽章/立面圖上傳新增 5 MB 上限，PDF 附件新增 25 MB 上限，避免大型檔案拖慢瀏覽器或撐爆本機儲存。
- UI 安全性：PDF 附件新增 30 頁總頁數與單次 12 頁匯入上限，避免縮圖與高解析轉圖一次處理過多頁面。
- UI 穩定性：PDF 頁面轉圖失敗時會恢復「加入所選頁面」按鈕並保留挑選視窗，不再留下半成品附件或卡在處理中。
- UI 穩定性：PDF 縮圖生成完成前會停用「加入所選頁面」，縮圖失敗時以文字錯誤提示並保留挑選視窗。
- 可近用性：附件清單的說明欄與移除按鈕新增含序號/檔名的可讀標籤，多附件時更容易辨識操作目標。
- 穩定性：附件刪除與說明更新新增索引驗證，避免異常或過期事件誤刪最後一張附件。
- 儲存穩定性：立面圖與簽章寫入 localStorage 失敗時會顯示同一套可讀錯誤訊息，不再靜默中斷預覽更新。
- 儲存穩定性：立面圖與簽章清除失敗時會保留既有預覽並顯示可讀錯誤，避免畫面顯示已清除但 localStorage 仍留有資料。
- UI 安全性：HTML、相容 Word 與直接 DOCX 匯出會重新檢查 localStorage 內的簽章與立面圖 data URL，舊版或手動寫入的非光柵圖片不再輸出。
- UI 安全性：相容 Word 圖片 helper 與 DOCX 圖片轉換再補最後一道 data URL 檢查，非安全圖片改以 placeholder 呈現或停止轉換。
- UI 安全性：附件與證書圖片陣列新增正規化層，預覽、頁數計算、HTML/Word/DOCX 匯出前都會移除非安全圖片項目。
- UI 安全性：啟動時會清理 localStorage 內殘留的非安全簽章與示意圖 data URL，避免舊資料持續留在工具狀態中。
- 儲存穩定性：啟動清理舊版非安全簽章/立面圖失敗時會回報可讀錯誤，避免不安全舊資料殘留卻無提示。
- 匯入安全性：專案 JSON 匯入新增副檔名/MIME 與 10 MB 大小檢查，並固定以 UTF-8 讀取後再解析。
- 匯入安全性：分享連結 `#import=` 改走與專案 JSON 相同的格式辨識、10 MB 大小限制、版本遷移與匯入前備份流程，不再先寫入 localStorage 才驗證。
- 輸出細節：專案 JSON 匯出下載後會釋放 object URL，降低連續匯出時的瀏覽器記憶體殘留。
- 儲存穩定性：專案狀態寫入 localStorage 失敗時會保留既有資料並顯示可理解的儲存空間/瀏覽器拒寫訊息；專案 JSON 匯出不再因本機暫存失敗而中止下載。
- 儲存穩定性：新版專案 storage 已成功寫入但舊版 key 清理失敗時，會保留新版資料並提示清理失敗，不再誤判整體儲存失敗。
- 儲存穩定性：復原/重做快照改讀寫新版專案 storage，套用失敗時會回報可讀錯誤，不再靜默停在舊版 key。
- 儲存穩定性：復原/重做套用快照失敗時會回復 undo/redo stack，避免儲存失敗後遺失可重試的快照歷史。
- 儲存穩定性：隔離備份寫入失敗時不再清除原本專案 storage，避免 localStorage 滿額或拒寫時同時失去備份與原資料。
- 儲存穩定性：隔離備份成功但原 storage 清除失敗時會回報可讀錯誤並回傳失敗，避免誤判壞檔已完整隔離。
- 儲存穩定性：啟動載入壞資料時會區分「隔離備份寫入失敗」與「備份成功但清理原 storage 失敗」，診斷訊息更精準。
- 儲存穩定性：啟動載入壞資料時的診斷訊息會依隔離備份是否成功分流，避免備份失敗但訊息仍顯示已清除。
- 儲存穩定性：可辨識舊專案遷移後若寫回 localStorage 失敗，畫面仍會載入遷移後資料並標記寫回失敗，不再讓載入流程整段中止。
- 追溯性：專案遷移寫回失敗狀態會寫入匯出 JSON meta，並出現在報表追溯註記中，提醒使用者匯出 JSON 保存目前狀態。
- 匯出前檢查：專案遷移後若本機儲存寫回失敗，匯出前會提醒先下載專案 JSON 保存目前狀態。
- 測試覆蓋：UI smoke 會直接驗證遷移寫回失敗狀態已進入匯出 JSON meta，避免只在畫面提醒、稽核檔卻漏記。
- 儲存穩定性：還原隔離備份前若無法先備份目前專案，還原流程會中止並保留現況，避免覆寫當前工作內容。
- 儲存穩定性：還原隔離備份前會先列出將還原的專案、時間與原因，並依目前是否有可辨識專案顯示不同覆寫/備份提示，避免誤點後直接切換目前專案。
- 維護性：匯入前備份、還原確認與實際還原流程共用目前專案辨識 helper，避免各路徑判斷日後漂移。
- 儲存穩定性：還原隔離備份時若目標專案寫入失敗，會回復原 recovery 內容並保留目前專案，避免救援資料被中途交換覆蓋。
- 儲存穩定性：還原隔離備份時若無法清除原 recovery key，還原流程會中止並保留備份提示，避免還原狀態不明。
- 儲存穩定性：隔離備份索引資料若已損壞，畫面仍會顯示下載/清除入口，並以 `.txt` 下載原始內容，避免救援資料變成隱形狀態。
- 儲存穩定性：隔離備份索引若是合法 JSON 但不是物件，會標示為索引格式不符並下載原始內容，不再混同為內容缺漏。
- 儲存穩定性：隔離備份索引存在但缺少實際 `raw` 內容時，會下載整份索引診斷資料並標示內容缺漏，避免產生空白備份檔。
- 儲存穩定性：隔離備份 `raw` 欄位若存在但不是字串，會標示為內容型別不符並下載索引診斷資料，不再混同為內容缺漏。
- 維護性：隔離備份是否可還原改由共用 helper 判斷，還原按鈕顯示與實際還原入口不再各自判斷。
- 維護性：隔離備份的專案顯示名稱改由共用 helper 產生，下載檔名、提示區、清除確認與還原確認訊息不再各自組字串。
- 維護性：隔離備份時間顯示改由共用 helper 產生，提示區與確認訊息不再各自格式化。
- UI 細節：隔離備份提示區只在備份內含有效專案名稱時顯示「備份專案」，避免空白專案名時誤把 storage key 當專案名稱。
- 維護性：隔離備份下載函式改回傳成功/無資料狀態，讓 UI smoke 與後續呼叫端能明確判斷下載流程結果。
- 儲存穩定性：隔離備份下載若瀏覽器下載 helper 拋出例外，會回傳失敗並保留 console 診斷，不再讓救援按鈕產生未處理例外。
- UI 細節：隔離備份的還原、下載與清除按鈕新增 `aria-label`，讓輔助工具與自動 smoke 都能明確辨識動作。
- UI 細節：隔離備份操作按鈕列新增群組語意與名稱，讓還原、下載、清除三個動作在輔助工具中歸為同一組。
- UI 細節：隔離備份提示區新增 `role="status"` 與 `aria-live="polite"`，讓救援狀態變更能被輔助工具溫和提示。
- 維護性：共用下載 helper 改以 `try/finally` 清理臨時 anchor 並排程釋放 object URL，同時回傳成功狀態供呼叫端判斷。
- 自我檢查：`self_check.py` 新增 `require_all()` 群組檢查 helper，並套用於 UI smoke 覆蓋總表、鍵盤/ARIA 互動語意、modal 焦點管理、dialog 語意宣告、validation modal 可及性、可見焦點/儀表板偏好、toolbar/進度/PDF picker 可及性、附件預覽/附錄逃逸、CSV 安全匯出/匯入、localStorage 陣列讀寫、recovery/storage 主題式診斷與交易保護、附件附錄設定正規化、報表輸出逃逸、範本 selector 防護、PDF 錯誤文字輸出、PDF picker 失敗恢復、上傳預覽 DOM 化、專案 JSON 匯入、分享連結匯入、圖片安全匯入/匯出、輸出前圖片重檢、圖片/PDF 匯入限制、檔案 picker 格式宣告、下載檔名與共用下載清理檢查，讓後續維護可列出缺漏子項目而不是只得到整串布林失敗。
- 儲存穩定性：匯入新專案前若無法先備份目前專案，匯入流程會中止並保留現況，避免新檔覆寫未備份的工作內容。
- 儲存穩定性：匯入新專案若目標 storage 寫入失敗，會回復匯入前既有的 recovery 備份，避免匯入中斷時覆蓋原本可救援資料。
- 儲存穩定性：下載隔離備份的檔名加入備份專案、可讀原因與時間戳，避免連續下載後難以追溯或互相覆蓋。
- 儲存穩定性：隔離備份下載副檔名改以是否為可辨識專案判斷，損壞或非本工具專案 JSON 會下載為 `.txt`，避免誤以為可直接匯入。
- UI 細節：分享連結匯入前產生的隔離備份提示改用可讀說明，不再顯示 `hash_import_replace` 內部原因碼。
- 儲存穩定性：清除隔離備份提示前會列出備份專案、時間與原因，且刪除失敗時會回報儲存錯誤，避免誤以為備份入口已安全清除。
- 儲存穩定性：自訂範本、驗算基準與變更紀錄寫入 localStorage 失敗時會回報可讀錯誤；自訂範本不再於寫入失敗時顯示已儲存。
- 儲存穩定性：工作模式與審查儀表板折疊狀態寫入失敗時會回報可讀錯誤，避免偏好設定重新整理後遺失卻無提示。
- 儲存穩定性：自動儲存失敗改為節流提示並不中斷 UI 操作，避免大量 `oninput` 呼叫造成未處理 Promise 錯誤。
- UI 細節：圖片與 PDF 檔案選擇器的 `accept` 改為明確副檔名清單，避免 `image/*` 讓 SVG 顯示為可選。
- UI smoke：新增工作模式與規範模組篩選的按鈕狀態切換檢查，避免 active 樣式與輔助狀態不同步。
- 稽核比對：`audit_compare.py` 納入 DCR 正規化方法、警示最高 DCR 與類型統計；方法不一致會被視為品質退步。
- 稽核比對：工具 HTML 與伺服器 HTML 一致性納入品質門檻，若新報告出現不一致會視為退步。
- 自我檢查：`server_smoke_test.py` 新增匯出驗證報告必要欄位 schema 檢查，避免稽核 JSON 缺少 DCR 方法、警示分流或伺服器一致性欄位。
- 稽核比對：新增 `audit_schema_missing` 指標與缺漏路徑清單；若新報告必要欄位缺漏增加，品質門檻會視為退步。
- 稽核比對：文字輸出會列出新版報告缺少的稽核欄位路徑，方便快速定位匯出流程缺漏。
- 維護性：新增 `audit_schema.py` 作為稽核 JSON 必備欄位的單一來源，供匯出 smoke test 與稽核比對共用。
- 自我檢查：新增 `audit_schema_test.py`，獨立驗證稽核 schema 與缺漏路徑偵測，並納入交接包。
- 文件一致性：`self_check.py` 會確認 README 與 `自我檢查.bat` 均納入 `audit_schema_test.py`，避免測試清單漂移。
- 文件一致性：README 的 Python 語法檢查範例同步列入 `audit_compare.py` / `audit_compare_test.py`，且 `self_check.py` 會檢查稽核相關檔案是否同時出現在 README 與 `自我檢查.bat`。
- 自我檢查：第 7 步標題改為 audit schema/comparison，並由 `self_check.py` 檢查，讓批次檔輸出與實際測試一致。
- 文件一致性：`self_check.py` 新增 Python 語法檢查檔案清單驗證，確保 README 範例與 `自我檢查.bat` 的 `py_compile` 步驟不漂移。
- 交接完整性：`self_check.py` 會確認核心 Python 檔同時列入 `PROJECT_FILES.md` 與 `make_release_bundle.py`，避免交接 ZIP 漏檔。
- 稽核追溯：前端 `review_summary` 會標示伺服器狀態尚未評估，後端寫入驗證報告時改為已評估並補上 `server_evaluation`。
- 稽核比對：`server_status_not_evaluated` 納入品質門檻，若新報告仍未完成伺服器評估會視為退步。
- 交付檢查：`RELEASE_CHECKLIST.md` 與 README 新增 `audit_compare.py --latest --fail-on-regression` 的正式交付前稽核比對門檻。
- 稽核比對入口：`比對稽核報告.bat` 顯示品質門檻已啟用，且 `self_check.py` 會確認批次檔包含 `--fail-on-regression`。
- 自我檢查：新增 `cleanup_temp_test.py`，驗證暫存清理候選清單、刪除行為、workspace 外拒刪保護與 `.gitignore` 規則覆蓋，並納入交接包。
- 暫存清理安全性：`cleanup_temp.py` 現在會拒刪 workspace 根目錄；交接包 smoke test 也明確檢查清理工具、環境檢查與 UI smoke test 是否納入核心 ZIP。
- 交接包潔淨度：`make_release_bundle.py` 遞迴收錄核心目錄時會排除快取、暫存與測試輸出；`release_bundle_smoke_test.py` 新增模擬案例避免 `js` 目錄混入暫存檔。
- 維護性：交接包排除規則會沿用 `cleanup_temp.py` 的暫存檔清單，並由 smoke test 檢查兩者一致，降低清理與交接規則漂移。
- 維護性：`release_bundle_smoke_test.py` 新增 `.gitignore` 覆蓋檢查，確保交接包排除規則與版本控制忽略規則一致。
- 版本一致性：`make_release_bundle.py` 的預設 ZIP 檔名改為沿用 `server.SERVER_VERSION`，並由 release bundle smoke test 與 `self_check.py` 檢查，避免升版時交接包檔名留在舊版本。
- 版本一致性：V2 側欄標頭版本改由 `APP_VERSION` 動態填入，`ui_smoke_test.py` 與 `self_check.py` 會檢查畫面標示與版本來源一致。
- 版本一致性：`server_smoke_test.py`、`audit_schema_test.py`、`audit_compare_test.py` 的版本樣本改由 `server.SERVER_VERSION` 產生，`self_check.py` 會避免 smoke test 硬寫目前版本。
- 交接追溯：`make_release_bundle.py` 建立 ZIP 時會加入 `RELEASE_MANIFEST.json`，記錄版本、打包選項、檔案清單與 SHA-256；release bundle smoke test 與 `self_check.py` 會檢查 manifest 存在。
- 交接驗證：新增 `verify_release_bundle.py`，可依 `RELEASE_MANIFEST.json` 驗證 ZIP 內檔案大小與 SHA-256；交接包 smoke test 會確認新產生的 ZIP 可通過驗證。
- 交接驗證：`release_bundle_smoke_test.py` 新增負向測試，確認缺少 `RELEASE_MANIFEST.json` 或檔案 SHA-256 不符時驗證會失敗。
- 交接驗證：`verify_release_bundle.py` 會拒絕 manifest 未登錄的額外 ZIP 內容，避免交接包混入不明檔案。
- 交接驗證：`verify_release_bundle.py` 會拒絕 `../` 與反斜線等不安全 manifest 路徑，降低交接包解壓或比對時的路徑風險。
- 交接驗證：`verify_release_bundle.py` 會拒絕重複 ZIP entry 與重複 manifest path，避免同名檔案造成驗證歧義。
- 交接驗證：`verify_release_bundle.py` 會檢查 manifest schema、`server_version`、`file_count`、檔案大小與 SHA-256 欄位格式，格式錯誤會直接失敗。
- 交接驗證：`verify_release_bundle.py` 會檢查 `created_at`、`tool_html`、`include_reference`、`include_legacy` 與 `output_name` 等頂層追溯欄位格式。
- 交接驗證：`verify_release_bundle.py` 會確認 manifest 的 `output_name` 與實際 ZIP 檔名一致，避免交接包改名後追溯資訊失真。
- 交接驗證：`verify_release_bundle.py` 會比對預設檔名 flavor（`core`、`with_refs`、`with_legacy`、`full`）與 manifest 打包選項，避免檔名描述與實際內容選項不一致。
- 交接驗證：`verify_release_bundle.py` 會比對預設檔名中的 `V...` 版本與 manifest `server_version`，避免交接包檔名版本與內容版本不一致。
- 交付流程：新增 `pre_delivery_check.py` 與 `交付前檢查.bat`，整合自我檢查、最新稽核回歸門檻、交接包 dry-run、暫存 ZIP 建立與 manifest 驗證。
- 維護整理：清理已知測試暫存檔與可再生輸出，降低工作目錄雜訊。
- 維護整理：`cleanup_temp.py` 的暫存目錄清單擴充為涵蓋 `__pycache__`、`.playwright-cli`、`test-results` 與 `tmp`，與 `.gitignore` 和交接包排除規則更一致。
- 前端模組化：新增 `js/version-sync.js`，先將 V2 側欄版本標示同步邏輯抽出為外部 helper，作為後續拆分大型 HTML 的低風險起點。
- 前端模組化：新增 `js/version-sync-smoke.test.js`，以 mock DOM 直接驗證版本標示 helper，並納入自我檢查與交付前檢查。
- 前端模組化：`js/review-dashboard.js` 與 `js/review-dashboard-smoke.test.js` 已涵蓋審查儀表板伺服器狀態文字、交付品質分級、匯出前品質提醒、匯出前檢查 HTML 與確認門檻 helper。
- 匯出前檢查：伺服器版本狀態改用審查儀表板共用 helper，避免儀表板與匯出檢查對 HTML / 版本不一致的文字判斷分叉。
- 匯出前檢查：確認門檻新增 HTML 端保守 fallback，若外部 helper 未載入，仍會依警示等級決定是否跳出確認視窗。
- 匯出前檢查：檢查清單 HTML 新增前端 fallback，外部 helper 未載入時仍會顯示可讀且已 escape 的確認內容。
- 匯出前檢查：交付品質提醒與原因文字新增前端 fallback，外部 helper 未載入時仍保留 A/B/C 原因說明。
- 自我檢查：新增匯出前檢查 fallback 保護項，確認交付品質提醒、確認門檻與 modal 內容的降級路徑仍存在。
- 自我檢查：新增 `js/review-dashboard.js` helper 匯出與 smoke test 覆蓋檢查，避免審查儀表板共用邏輯被整理時漏測。
- 維護整理：`js/review-dashboard-smoke.test.js` 改用合成版號，並納入自我檢查的「不得硬寫目前版本」清單，降低版本升級維護成本。
- 維護整理：`js/regression-smoke.test.js` 改以版本格式檢查取代硬寫目前計算核心版本，版本追溯改由自我檢查與 CHANGELOG 維持。
- 版面優化：審查儀表板新增收合/展開控制，收合狀態會保存，避免 sticky 儀表板遮住預覽頁面；UI smoke 與自我檢查同步覆蓋。
- 版面優化：審查儀表板新增鍵盤可近用性，獨立「明細」按鈕可用 Enter 開啟審查明細，收合按鈕不會誤觸明細。
- 版面優化：審查明細與匯出提醒 modal 改用共用開啟 helper，開啟時焦點移到主要按鈕，關閉後會回到原本觸發控制項。
- 版面優化：審查明細與匯出提醒 modal 新增 Tab / Shift+Tab 焦點循環，避免鍵盤焦點跑到背景頁面。
- 版面優化：審查明細與匯出提醒 modal 新增 `dialog` 語意、`aria-modal`、標題與內容關聯，提升輔助科技可讀性。
- 版面優化：審查明細與匯出提醒 modal 的 `aria-hidden` 會隨開啟/關閉同步切換，讓視覺狀態與輔助科技狀態一致。
- 版面優化：審查明細與匯出提醒 modal 關閉流程改為先回復焦點再標記隱藏，避免焦點短暫停留在 `aria-hidden` 內容內。
- 版面優化：審查明細與匯出提醒 modal 改用 viewport-based 寬度，窄視窗下不再被 380px 最小寬度撐出畫面。
- 版面優化：審查明細與匯出提醒 modal 內容區改為雙向自動捲動，窄視窗下寬表格與覆核註記欄不會被裁切。
- 版面優化：審查明細與匯出提醒 modal 的小螢幕 footer 支援按鈕換行，避免未來按鈕文字變長時擠出面板。
- 版面優化：審查明細與匯出提醒 modal 底部按鈕明確標示 `type="button"`，避免未來嵌入表單情境時誤觸 submit 行為。
- 版面優化：PDF 頁面挑選器、驗算對照 modal 與自訂範本管理浮層的動作按鈕也明確標示 `type="button"`。
- 版面優化：案例 CSV 匯入、CSV 匯出與檢核摘要匯出按鈕也明確標示 `type="button"`，避免未來嵌入表單時誤觸 submit。
- 版面優化：全工具固定與動態操作按鈕皆補齊 `type="button"`，包含範本、批次試算、主匯出列、案例卡與附件刪除按鈕。
- 版面優化：所有檔案上傳/載入觸發按鈕新增 `aria-controls`，明確對應其隱藏 file input，讓控制關係更可追溯。
- 可近用優化：手風琴標題、chip 選項、工法卡與狀態燈補上鍵盤語意，支援 Tab 聚焦與 Enter/Space 啟動。
- 可近用優化：手風琴、chip 與工法卡會同步 `aria-expanded` / `aria-pressed` 狀態，鍵盤操作與滑鼠操作可讀性一致。
- 可近用優化：工法示意圖 lightbox 補上 dialog 語意、`aria-hidden` 同步、描述性圖片 alt、關閉按鈕與焦點回復。
- 可近用優化：自訂範本管理浮層補上 dialog 語意、`aria-hidden` 同步、焦點進入/回復與 Tab 循環。
- 可近用優化：側欄檢核狀態燈補上 `aria-haspopup="dialog"`、`aria-controls` 與動態 `aria-label`，明確標示會開啟狀態提醒。
- 可近用優化：chip 選項群組與主要固定工法群組補上可讀 `aria-label`，讓輔助工具能讀出正在操作的選項類別。
- 版面優化：自訂範本管理浮層改用 viewport-based 寬度，小螢幕不再受固定 360px 最小寬度影響。
- 版面優化：驗算對照 modal 新增 `dialog` 語意、標題/內容關聯與 `aria-hidden` 開關同步，與審查明細 modal 的可近用標準一致。
- 版面優化：驗算對照 modal 改用 viewport-based 寬度，內容區可雙向捲動，小螢幕 footer 可換行，避免 680px 最小寬度撐出畫面。
- 版面優化：驗算對照 modal 開啟後會聚焦「關閉」按鈕，關閉後會回到原本的驗算入口按鈕。
- 版面優化：驗算對照 modal 新增 Tab / Shift+Tab 焦點循環，並支援 Escape 關閉後回到驗算入口。
- 版面優化：驗算對照 modal 關閉流程會先回復焦點；若回復目標不存在，會清除仍停在隱藏 modal 內的焦點。
- 版面優化：驗算對照 modal 已開啟時重新渲染表格，不會覆寫原本的返回焦點，關閉後仍回到驗算入口。
- 內容優化：審查明細、狀態提醒與匯出前檢查共用 modal 現在會依情境切換標題，避免審查明細仍顯示匯出前檢查。
- 版面優化：審查儀表板新增可見焦點樣式、可近用標籤與 `aria-controls`，讓收合控制與內容區關聯更清楚。
- 版面優化：審查儀表板改用 region 語意並新增獨立「明細」按鈕，避免互動按鈕巢狀在 button 語意容器內。
- 版面優化：審查儀表板收合狀態改由收合按鈕承擔 `aria-expanded`，內容區同步 `aria-hidden`，語意更集中。
- 版面優化：審查儀表板在中小視窗新增標頭換行、標題省略與較緊湊按鈕，避免右側預覽寬度不足時橫向溢出。
- 測試強化：UI smoke 會重新整理頁面並確認審查儀表板收合狀態由 `localStorage` 正確保存。
- 測試強化：UI smoke 會驗證收合後點擊面板標題仍能開啟審查明細，且收合按鈕事件不會冒泡造成誤開。
- 測試強化：UI smoke 新增 900px 寬度檢查，確認審查儀表板不會造成預覽區水平捲動。
- 測試強化：UI smoke 新增審查明細 modal 焦點檢查，確認 Enter 開啟後可用 Escape 關閉並回到「明細」按鈕。
- 測試強化：UI smoke 新增 modal Tab / Shift+Tab 循環檢查，確認焦點會在「返回修正」與主要按鈕間正確循環。
- 測試強化：UI smoke 新增審查明細 modal ARIA 語意檢查，避免對話框標題與內容關聯退化。
- 測試強化：UI smoke 新增 modal 底部按鈕型別檢查，確認關閉與主要動作按鈕皆為非 submit。
- 測試強化：UI smoke 新增側欄案例匯入/匯出按鈕型別檢查，避免操作按鈕退化成 submit。
- 測試強化：自我檢查會阻擋任何未宣告 `type` 的 `<button>`，UI smoke 也會檢查目前 DOM 中沒有缺漏型別的按鈕。
- 測試強化：UI smoke 會確認每個檔案挑選按鈕都控制存在且帶有 `accept` 的 file input。
- 測試強化：UI smoke 新增互動 div 的鍵盤語意與 Enter 啟動檢查，涵蓋手風琴、風壓 chip 與工法卡。
- 測試強化：UI smoke 新增工法示意圖 lightbox 的鍵盤開啟、ARIA 語意、Escape 關閉與焦點回復檢查。
- 測試強化：UI smoke 新增自訂範本管理浮層的 ARIA 語意、Escape 關閉、焦點回復與 390px 窄版配置檢查。
- 測試強化：UI smoke 新增狀態燈鍵盤開啟狀態提醒 modal、標題內容與 Escape 回焦檢查。
- 測試強化：UI smoke 新增 chip 群組與工法群組的可讀群組名稱檢查。
- 測試強化：UI smoke 新增驗算對照 modal 的 ARIA 語意與 `aria-hidden` 開關檢查。
- 測試強化：UI smoke 新增 390px 窄視窗驗算對照 modal 檢查，確認面板、表格捲動與 footer 換行都維持可用。
- 測試強化：UI smoke 新增驗算對照 modal 焦點進入與關閉後焦點回復檢查。
- 測試強化：UI smoke 新增驗算對照 modal 的 Tab / Shift+Tab 循環與 Escape 關閉檢查。
- 測試強化：UI smoke 新增驗算對照 modal 的背景點擊與「關閉」按鈕關閉檢查，並集中驗證關閉後焦點不留在隱藏 modal 內。
- 測試強化：UI smoke 新增驗算對照 modal 開啟中再次渲染的焦點回復檢查，避免返回焦點被 modal 內按鈕污染。
- 測試強化：UI smoke 新增 modal `aria-hidden` 開關檢查，確認開啟與關閉狀態可被輔助科技正確辨識。
- 測試強化：UI smoke 會確認 modal 關閉後焦點不留在隱藏對話框內。
- 測試強化：UI smoke 新增背景點擊關閉 modal 的焦點回復檢查，補齊非鍵盤關閉路徑。
- 測試強化：UI smoke 新增「返回修正」按鈕關閉 modal 的焦點回復檢查，補齊常用按鈕關閉路徑。
- 測試整理：UI smoke 將 modal 關閉後 `aria-hidden` 與焦點狀態檢查集中成 helper，降低三條關閉路徑的維護重複。
- 測試強化：UI smoke 新增 390px 窄視窗 modal 檢查，確認面板與底部按鈕不會超出 viewport。
- 測試強化：UI smoke 會確認窄視窗 modal 內容區允許水平捲動，保護審查表格可讀性。
- 測試強化：UI smoke 會確認審查明細 modal 的 ARIA 標題文字與實際情境一致。
