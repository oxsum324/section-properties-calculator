# Baseline JSON Schema (v1.0)

> 重構護欄的地基文件。此 schema 規範 `tests/golden/*.json` 的格式。
> 任何 baseline 檔不符此 schema 應被 `diff.js` 拒絕載入。

## 設計目的

1. **characterization**：在 calc-core 抽取前凍結現況，確保 refactor 不改變數值
2. **approved_engineering**：人工確認過的正式基準案例，作為公式正確性護欄
3. **跨年追溯**：透過 `captured_env` 指紋知道 baseline 拍於哪一版 V2

## 設計原則

- **不可逆**：baseline 一旦提交，後續變更必須走 `baseline:approve` 流程
- **去識別化**：實際業主/技師/地址資訊不得進入 git
- **自描述**：單檔即可獨立解讀，不依賴外部 context

---

## 頂層結構

```jsonc
{
  "schema_version": "1.0.0",
  "case_id":        "case_01_standard_safe",
  "purpose":        "characterization",
  "title":          "標準安全案 870×800 / 30mm 背扣 4H",
  "notes":          "依規範模式風壓 + 一般 SDS=0.6 工址；DCR 應落於 0.6~0.8 區間",

  "captured_env":   { /* 見下節 A */ },
  "input":          { /* 見下節 B */ },
  "result":         { /* 見下節 C */ },
  "expected":       { /* 見下節 D，僅 approved_* purpose 需填 */ },
  "audit":          { /* 見下節 E */ }
}
```

---

## A. captured_env — 拍攝環境指紋

```jsonc
{
  "v2_html_hash":     "sha256:abcd1234…",   // 拍攝當下 V2 HTML 全文 hash
  "calc_source_hash": "sha256:abcd1234…",   // calc-core.js 抽出前等於 v2_html_hash
  "ua":               "Chrome/124 …",        // navigator.userAgent
  "ts":               "2026-04-27T10:00:00Z",
  "captured_by":      "OMITTED",             // 去識別化後填 OMITTED；未去識別填技師證號
  "deidentified":     true,                  // 是否經過去識別化（true 才能進 git）
  "platform":         "Windows / wmux"
}
```

**強制要求**：
- `v2_html_hash` 與 `calc_source_hash` 不可為空
- 提交至 git 時 `deidentified` 必須為 `true`

---

## B. input — 輸入資料

```jsonc
{
  "raw":         { /* V2 LocalStorage 原始 JSON 內容 */ },
  "normalized":  null   // 預留欄位：calc-core 抽出後填入「驗證後 normalized 結構」
}
```

**注意**：
- v1 階段 `normalized` 為 `null`；refactor 後填入 `validateInputSchema()` 輸出
- `raw` 必須通過去識別化（自動掃描專案名/業主/地址/技師證號）

---

## C. result — 計算結果

```jsonc
{
  "summary": {
    "Fph":             80.64,           // kgf/m²，可從 DOM 抓取
    "Tmax":            null,            // 待 calc-core 結構化 result 後填入
    "Vmax":            null,
    "DCR_governing":   0.852,
    "governing_check": "anchor_T",
    "passed":          true             // 整體是否通過（DCR_governing ≤ 1.0）
  },

  "raw_dom_text":   "依建築物耐震規範…",   // 暫時保留：當前 V2 #preview-sheets.textContent
                                          // 用於 v1 階段 regex 比對；calc-core 完成後可刪除

  "checks":         null   // 預留：calc-core check semantics 抽出後填入完整列表
                            // 結構參考 § F
}
```

---

## D. expected — 期望值（僅 approved_* purpose 填）

| purpose | 是否需填 expected |
|---|---|
| `characterization` | ❌ null（鎖現狀，diff 直接比 result） |
| `approved_safe` | ✓ 必填 |
| `approved_critical` | ✓ 必填，且需註明 DCR 接近 1.0 的合理範圍 |
| `approved_failure` | ✓ 必填 `passed: false` 與失敗原因 |
| `regression_fixture` | ✓ 必填，並引用對應 bug ticket |

```jsonc
{
  "Fph":             { "value": 80.64, "tolerance_pct": 0.5 },
  "DCR_governing":   { "value": 0.852, "tolerance_pct": 1.0, "must_not_cross": [0.9, 1.0] },
  "governing_check": { "value": "anchor_T", "exact": true },
  "passed":          { "value": true,        "exact": true }
}
```

`must_not_cross`：即使在容許誤差內，跨越這些門檻仍視為失敗。

---

## E. audit — 變更紀錄

```jsonc
{
  "created_at":       "2026-04-27T10:00:00Z",
  "created_by":       "歐瀚文",                 // 內部紀錄，不去識別化
  "last_modified_at": "2026-04-27T10:00:00Z",
  "approvals": [
    {
      "ts":     "2026-04-27T10:00:00Z",
      "by":     "歐瀚文",
      "reason": "初版 characterization 拍攝",
      "calc_source_hash_before": null,
      "calc_source_hash_after":  "sha256:abcd…"
    }
    // 後續 baseline:approve 動作會 push 此處
  ]
}
```

---

## F. checks 結構（calc-core 完成後啟用）

預留設計，目前 v1 階段為 `null`。未來 calc-core 應產出：

```jsonc
[
  {
    "id":             "anchor_edge_distance",
    "title":          "錨栓邊距",
    "category":       "detailing",        // strength | detailing | construction | info
    "sense":          "min",              // max | min | range | info
    "value":          32,
    "limit":          25,
    "utilization":    0.78,               // = limit/value (when sense=min) 或 value/limit (when sense=max)
    "status":         "pass",             // pass | fail | warning | na
    "severity":       "info",             // critical | warning | info
    "code_ref":       "ACI 318 D.8.2",
    "reason":         "邊距 32mm 大於最小 25mm",
    "recommendation": null
  }
]
```

---

## case_purpose enum

| 值 | 用途 | diff 嚴格度 | 需填 expected |
|---|---|---|---|
| `characterization` | 鎖住現況，refactor 不變條件 | 嚴格（容許 ±0.01% 浮點誤差） | 否 |
| `approved_safe` | 技師簽核之標準正常案 | 中等（依 expected.tolerance_pct） | 是 |
| `approved_critical` | DCR 接近 1.0 邊界、控制項臨界 | 嚴格 + must_not_cross 守衛 | 是 |
| `approved_failure` | 應失敗的反例（負面測試） | passed=false 必須一致 | 是 |
| `regression_fixture` | 歷史 bug 不再復現 | 嚴格 + 引用 bug ticket | 是 |

---

## 去識別化規則

`window.__captureBaseline({ deidentify: true })` 自動執行：

| 欄位類型 | 處理方式 |
|---|---|
| 工程名稱 / project_name | → `CASE_<PURPOSE>_<ID>` |
| 業主名稱 / owner | → `OMITTED` |
| 工程位置 / 地址 | → `OMITTED` |
| 技師姓名 / engineer_name | → `OMITTED` |
| 技師證號 / license_no | → `OMITTED` |
| 公司印章圖檔 base64 | → 移除 |
| 任何 dataURL 圖檔 | → 標示 `<DEIDENTIFIED_IMAGE>` |
| 日期欄位（封面） | → `BASELINE_2026` |

**保留不變**：
- 所有數值、選項、係數、規範旗標
- 工法、尺寸、規格、材料參數
- 計算結果

---

## 檔名規則

```
tests/golden/case_<NN>_<purpose>_<descriptor>.json
```

例：
- `case_01_characterization_standard_4h_30mm.json`
- `case_02_approved_critical_dcr_near_1.json`
- `case_03_approved_failure_edge_distance.json`

---

## diff.js 比對流程（未來實作）

```
load baseline → load current V2 result →
  validate schema →
  compare summary (依 purpose 嚴格度) →
  compare governing_check (exact) →
  compare passed (exact) →
  if expected.must_not_cross 觸及 → fail →
  output 工程師友善 diff 報告
```

---

## Schema 版本演進

| 版本 | 變更 | 影響 |
|---|---|---|
| 1.0.0 | 初版 | — |
| 1.1.0 (預計) | normalized input 啟用 | 向下相容（null 視為「未填」） |
| 2.0.0 (預計) | checks 結構強制 | 不相容；需 migration |

任何不相容變更必須 bump major version 並提供 migration 腳本。
