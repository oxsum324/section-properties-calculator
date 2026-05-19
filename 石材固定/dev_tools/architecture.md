# 石材計算書產生器 — 架構與計算治理鏈

> 本文件記錄目前實際的模組邊界與資料流，作為後續治理決策的依據。
> 與 user 的「最迫切：建立一條唯一可信的計算資料鏈」原則對齊。

---

## 計算資料鏈（current state）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  輸入端                                                                  │
│  V2 HTML sidebar 表單 → inputs() → readInput → STORAGE_KEY               │
│  (key = 'stone_calc_spec_v3')                                             │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  計算核心（已抽出，單一可信源）                                          │
│                                                                          │
│  js/constants.spec.js          : window.STONE_CONSTANTS (frozen)         │
│  js/calculator.spec.js         : window.StoneCalculator                  │
│    - calcCase(cd, inp)         : 主計算入口                              │
│    - inferCheckSense(...)      : check semantics 分類器                  │
│    - VERSION                   : 公式邏輯版本                            │
│  js/formula-registry.spec.js   : window.StoneFormulaRegistry             │
│    - refs                      : 法規依據對照                            │
│    - checks                    : 公式 + 條號 + 單位                      │
│                                                                          │
│  ⚠ 注意：V2 inline JS 仍有部分 wrapper 邏輯（render、computeAllCases…）  │
│    它們**呼叫 calcCase**，不再獨立計算 → 維持單一信賴源。                │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  結構化結果 API（V2 公開介面）                                           │
│                                                                          │
│  window.getCalculationResults() → {                                      │
│    meta: { calculator_version, formula_registry_version, ... },          │
│    input: <inputs()>,                                                    │
│    cases: [{ id, name, type, w, h, Fph, Wp, T, V,                        │
│              DCR_governing, governing_check, passed,                     │
│              checks: [{ id, item, formula, sense, value, limit, dcr,     │
│                         pass, ref, unit }] }],                           │
│    summary: { all_passed, governing_dcr, governing_case,                 │
│               governing_check, case_count },                             │
│    warnings: [...]                                                       │
│  }                                                                       │
│                                                                          │
│  此 API 是「畫面/PDF/Word/稽核/baseline/verifier」的唯一讀取點。         │
│  禁止下游模組再從 DOM 反向解析計算數值。                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       ┌──────────┐         ┌──────────┐        ┌──────────┐
       │  畫面    │         │  匯出    │        │  稽核    │
       │ (render) │         │          │        │          │
       └──────────┘         └──────────┘        └──────────┘
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
            ┌──────────┐    ┌──────────┐    ┌──────────────┐
            │  PDF     │    │  Word    │    │  Baseline    │
            │ exportPDF│    │auto_word │    │  capture     │
            │          │    │   .py    │    │              │
            └──────────┘    └──────────┘    └──────────────┘
```

---

## 治理規則

### ✅ 推薦路徑（formal deliverables）

| 用途 | 路徑 | 理由 |
|---|---|---|
| 預覽 | V2 → render() | 直接消費 calcCase |
| PDF | V2 → exportPDF() → @media print | 用同一份 DOM |
| Word | `auto_word.py` (Playwright) | HTML → 列印 PDF → docx；**不重算** |
| 稽核 baseline | V2 → `getCalculationResults()` → JSON | 結構化來源 |
| 交叉驗算 | `verifier.py` | 故意獨立公式，僅供品檢，**不採用其數值** |

### ❌ 禁止路徑（will produce inconsistent output）

| 模組 | 風險 | 處置 |
|---|---|---|
| `generate_docx.py` | 含獨立 `calc_case()`，Fph 使用簡化式 1.6×SDS×Ip×Wp，與 V2 細算式不一致 | ⚠ 已加 LEGACY banner + DeprecationWarning |
| 任何下游從 DOM regex 解析數值 | 排版/KaTeX 變動即失效 | ⚠ 已修正 baseline capture 改用 API |

---

## 公式版本指紋

目前版本字串（人工語意層）：

| 模組 | 版本字串 |
|---|---|
| StoneCalculator | `2026.04.23-spec-core11` |
| StoneFormulaRegistry | `formula-registry-2026.04.25` |
| Baseline schema | `1.0.0` |
| Project JSON schema | `stone-calc/v3` |

`captured_env.calculator_version` 與 `formula_registry_version` 已被 baseline 記錄。
未來新增 `calc_logic_hash`（對 calculator.spec.js + constants.spec.js 兩檔內容做 SHA-256）以建立**自動指紋**，避免手改版本字串遺漏。

---

## LocalStorage Keys

V2 實際使用：

| Key | 用途 |
|---|---|
| `stone_calc_spec_v3` | 主資料儲存（schema v3） |
| `stone_calc_spec_v1` | legacy fallback |
| `stoneToolDevMode` | 啟用 dev 模式 |
| `stoneV2UserTemplates` | 使用者範本 |
| `stoneV2ChangeLog` | REV 版次紀錄 |
| `stoneV2ValidationRefs` | 驗算對照參考值 |
| `stone_review_dashboard_collapsed` | 審查儀表板狀態 |

⚠ 過去 V2 內部誤用了 `stoneToolV1.0Data` 與 `stoneToolData` key，已於 2026-04-27 修正。

---

## 已修正的早期 Bug

| ID | 描述 | 影響 | 修正 |
|---|---|---|---|
| KEY-001 | LocalStorage key 寫死 `stoneToolV1.0Data` | Undo/Redo、驗算備份、REV 計算、baseline capture 都讀錯 key（資料丟失風險） | 全部改為 `stone_calc_spec_v3` 並加 `stone_calc_spec_v1` fallback |
| API-001 | baseline 透過 DOM regex 解析計算結果 | KaTeX 渲染後排版變動即失效 | 改用 `window.getCalculationResults()` 結構化 API |
| API-002 | API 引用不存在的 `readInput()` | structured_cases 永遠 null | 改為 `inputs()` |

---

## 治理事項進度（2026-04-27 完成階段）

| 優先 | 項目 | 狀態 |
|---|---|---|
| 1 | calc-core 抽出（純函式、無 DOM 依賴） | ✅ 完成（在 `js/calculator.spec.js`）|
| 1 | 結構化 result API | ✅ 完成（`getCalculationResults()`）|
| 1 | golden samples 護欄 | ✅ 完成（5 baseline + auto_capture/diff）|
| 2 | check semantics（tier/category/sense/severity 分類） | ✅ **API 層完成**：每筆 check 含 `tier`（strength/detailing/info）與 `severity`；governing_check 僅篩 strength；summary 三層分流 `strength_governing / detailing_fails / info_fails`。**V2 主預覽（render）視覺分區尚待**（不影響資料正確性） |
| 3 | Python 去計算化 | ✅ 完成（generate_docx LEGACY banner，正式路徑為 auto_word.py，verifier.py 重新定位為交叉驗算器）|
| 4 | 版本指紋三層 | ✅ 完成（`calculator_version` + `formula_registry_version` 人工語意 + `calc_source_hash` SHA-256 自動指紋）|
| 5 | 匯出前三層檢查（block/warn/info） | ✅ 完成（`v2CollectExportChecklist` + `v2ExportChecklistHtml` + `v2GuardedExport` 阻擋邏輯；含「草稿標記」機制）|
| 6 | DCR 分層呈現（API 層） | ✅ 完成（強度 / 構造 / 資訊三層分流）|
| 7 | 法規版本綁定 | 🟡 已在 `formula-registry.spec.js` refs；UI 顯示尚待 |
| 8 | 工程交付文字改寫 | 🟡 部分（匯出按鈕已加副標「正式閱讀 / 可編輯交件 / 忠實版面 / 可追算」）|
| 9 | 啟動診斷頁、舊檔轉換提示 | ⏳ 未動 |

## 本日完成的具體交付

### 結構化 API
- `window.getCalculationResults()` 返回完整結構化結果
- 每筆 check 增加 `tier`（strength/detailing/info/unclassified）與 `severity`（critical/warning/info）
- `summary` 含 `strength_governing` / `detailing_fails` / `info_fails` 三層彙總
- `meta.calc_source_hash` 啟動時對 `calculator.spec.js + constants.spec.js + formula-registry.spec.js` 三檔做 SHA-256（fetch 載入；http:// 環境穩定，file:// 受限時為 null）

### 三層匯出檢查
- BLOCK：必填空白、無案例、結果缺失、強度 DCR>1.0、物理衝突、HTML/server hash 不一致
- WARN：核心欄範圍外、DCR>0.9、構造不滿足、交付品質 B/C 級、簽章資訊缺失等
- INFO：版本指紋、案例數、附錄資訊
- 含 BLOCK 時：「仍要匯出」按鈕變灰，匯出檔自動加上 `_DRAFT` 標記與草稿水印（XLSX 已實作）

### XLSX 摘要重構
- 從消費 DOM 改為消費 `getCalculationResults()`
- 改用 SpreadsheetML XML 格式（取代 HTML-as-xls）
- DCR 為 `xl:type="Number"` raw numeric，可直接二次運算
- 三 sheet：案例摘要 / 完整 Checks / 版本與 Meta
- 條件式色階（綠 < 0.9 / 黃 0.9-1.0 / 紅 > 1.0）

### 已修正的 bug

| ID | 描述 | 影響 | 修正 |
|---|---|---|---|
| KEY-001 | LocalStorage key 寫死 `stoneToolV1.0Data` | Undo/Redo、驗算備份、REV、baseline capture 都讀錯 | 全改為 `stone_calc_spec_v3` |
| API-001 | baseline 透過 DOM regex 解析計算結果 | KaTeX 渲染後失效 | 改用 `getCalculationResults()` 結構化 API |
| API-002 | API 引用不存在的 `readInput()` | structured cases 永遠 null | 改為 `inputs()` |
| API-003 | getCalculationResults 內 let 變數 TDZ 錯誤（變數使用早於宣告） | 整個 API 回傳 null | 重排程式碼順序 |
| SEM-001 | DCR 排序未分 strength vs detailing tier | governing_check 誤指構造項目（如「背擴孔深度」）為強度 NG | 引入 tier 分類，僅 strength 進入 governing 排序 |

---

## 待處理 → 已全部完成

- ✅ **V2 主預覽 render() 視覺分區**（Phase 8）：`.chk` 元素 post-render 標 `data-tier`，左邊框依 tier 著色（強度=綠/橙/紅依 DCR 區間；構造=橘；資訊=藍灰）。每張案例頁頂部新增「三層摘要 banner」顯示強度 / 構造 / 資訊各狀態。
- ✅ **法規版本 UI 顯示**（Phase 9）：`v2InjectRegulationFooter` 在預覽末頁追加 `📋 本計算書引用之規範版本` 表，含 `formula-registry.refs` 全部 8 條 + Calculator/Registry 版本 + calc_source_hash。
- ✅ **啟動診斷頁**（Phase 10）：`dev_tools/diagnostics.html` 自動檢測 7 大類：瀏覽器環境、V2 主檔、計算核心三檔、KaTeX、本地伺服器、LocalStorage、金樣本護欄；含 ✓/⚠/✗ 三色摘要與重新檢測按鈕。
- ✅ **舊檔轉換提示**（Phase 11）：`v2-migration-toast` 載入後 1.5s 偵測 `_projectMigrationInfo`；migration_persist_status='saved' 顯示綠色成功；'failed' 顯示橙色警告（不自動隱藏）；integrity 'mismatch' 延遲顯示警告。
- ✅ **工程交付文字改寫**（Phase 12）：
  - 狀態燈 `#v2-status-pill` 升級為三層感知（🔴 X 項需修正 / ⚠ X 項待確認 / ✓ 通過，可正式匯出）
  - 匯出按鈕加副標（正式閱讀 / 可編輯交件 / 忠實版面 / 可追算）
  - 三層匯出檢查訊息採工程交付風格

---

## 治理鏈最終狀態

```
                   輸入 (sidebar form)
                         ↓
              inputs() / caseData(id)
                         ↓
              ╔══════════════════════════════╗
              ║  calc-core 唯一信賴源        ║
              ║  StoneCalculator.calcCase()  ║
              ║  (js/calculator.spec.js)     ║
              ╚══════════════════════════════╝
                         ↓
              ╔══════════════════════════════╗
              ║  結構化 result API           ║
              ║  getCalculationResults()     ║
              ║  ├─ meta (含三層指紋)         ║
              ║  ├─ cases[] (含 tier 分類)    ║
              ║  └─ summary (三層 governing)  ║
              ╚══════════════════════════════╝
                ↓        ↓        ↓        ↓
           render()   匯出檢查  baseline  XLSX/Word
            (HTML)    (3 tier)  capture  (raw num)
              ↓                           ↓
           PDF                          稽核
```

下游禁止再從 DOM 反向解析。
generate_docx.py 已標 LEGACY；正式 Word 路徑為 auto_word.py（不重算，只列印）。

---

最後更新：2026-04-27（本日全面治理鏈升級完成）

---

## 2026-04-27 第二輪：17 點治理檢查全面完工

完成項目（按完工順序）：

| Phase | 內容 | 狀態 |
|---|---|---|
| A | `v2FormatNumber` 統一格式器 + DCR 跨門檻守衛（CRITICAL_BAND 0.85–1.05 強制 4 位小數，跨門檻自動提高至 5 位） | ✅ |
| B | 完整交付指紋：`input_hash` + `normalized_input_hash` + `result_hash`（自動寫入 meta） | ✅ |
| C | `auto_word.py` 指紋閘門：缺指紋自動加「草稿 DRAFT」浮水印，標明缺失原因 | ✅ |
| D | 匯出檢查訊息「原因/目前值/要求值/建議處理」四欄結構（block 級已重寫；含工程交付風格表格呈現） | ✅ |
| E | 校核流程欄位：`v2GetReviewWorkflow / v2SetReviewWorkflow`（created_by / checked_by / approved_by / revision_history 寫入 LocalStorage 並併入 meta） | ✅ |
| F | 法規版本封面顯示：cov-page 底部加「主要計算依據」一行小字（耐風／耐震／錨栓／石材） | ✅ |
| G | migration 詳細列出：`stoneV2MigrationAudit` 稽核 entry + toast 顯示「套用預設欄位 N 項」具體列出 | ✅ |
| H | result trace：每筆 check 增加 `trace` 物件含 `formula_symbol / calculation / allowable_source / ref_text / intermediates` | ✅ |

### 治理鏈最終視覺

```
單一輸入 → calc-core (StoneCalculator) → getCalculationResults()
                                            ↓
              meta.calc_source_hash         (公式自動指紋)
              meta.input_hash               (輸入指紋)
              meta.normalized_input_hash    (預留 schema 驗證後指紋)
              meta.result_hash              (結果指紋)
              meta.review_workflow          (created/checked/approved)
              cases[].checks[].trace        (中間值追溯)
                                            ↓
   ┌──────┬──────────┬──────────┬──────────────┐
   ↓      ↓          ↓          ↓              ↓
 render  3 層       baseline   XLSX          auto_word.py
 + tier  匯出檢查    capture    raw num         ↓
 banner  (block/    +integrity                指紋閘門
 + 法規  warn/       check                   缺指紋→DRAFT 浮水印
 footer  info)       ↓                       ↓
                    auto_diff               PDF
                    drift detect
                    ↓
                    schedule
                    .bat (Task Scheduler)
```

### 數值正確性守衛（Phase A 細節）

- **DCR = 0.999** → 顯示 `0.999`（保留 3 位）
- **DCR = 1.001** → 顯示 `1.001`（保留 3 位，跨 1.0 門檻）
- **DCR = 1.004** → 顯示 `1.004`（**進入 CRITICAL_BAND 0.85-1.05 自動 4 位**，避免錯誤顯示為 1.00）
- **DCR = 0.9001** → 顯示 `0.9001`（4 位，標 `(>0.9)`）
- **跨門檻自動標記**：`0.901 (>0.9)`、`1.001 (>1.0)`

---

最後更新：2026-04-27（17 點治理檢查全面完工）

---

## 2026-04-27 第三輪：剩餘 3 項閉環

| Phase | 項目 | 完成度 |
|---|---|---|
| J | #13 verifier 容許值配置 | ✅ `dev_tools/verifier.config.json` + verifier.py 改用分類容許值；DCR 含 `must_not_cross` 守衛；類別不一致即 ERROR |
| K | #6 預設值來源標示 + 影響主 DCR 標記 | ✅ `V2_FIELD_HINTS` 21 個高風險欄位；每欄加「D」紅徽（影響 DCR）+「預」藍徽（預設值來源）；仍為原始預設值時欄位邊條 + 「· 仍為預設值」灰字提示 |
| L | #4 審查儀表板 dock 模式 | ✅ 三狀態切換：top（預設） → docked（桌機右側 320px / 平板手機底部 50vh） → docked-mini（桌機左側立排條 / 手機 48px 抽屜把手）；handle 含最危險檢核摘要；LocalStorage 記憶 |

### 17 點檢查表 — 最終 100%

| # | 項目 | 狀態 |
|---|---|---|
| 1 | 計算核心單一來源 | ✅ |
| 2 | 先做 golden samples 再重構 | ✅ |
| 3 | 結構化 result API | ✅ |
| 4 | 審查儀表板可折疊側欄 | ✅ |
| 5 | 匯出前檢查三層 | ✅ |
| 6 | 輸入欄位工程表單化 | ✅ |
| 7 | 錯誤文字工程交付語氣 | ✅ |
| 8 | DCR 分層 + sense | ✅ |
| 9 | 公式與交付指紋 | ✅ |
| 10 | 結果 trace | ✅ |
| 11 | 法規版本綁定 | ✅ |
| 12 | Python 端去計算化 | ✅ |
| 13 | verifier 降級為交叉檢查器 | ✅ |
| 14 | 校核流程欄位 | ✅ |
| 15 | 小數與單位規則統一 | ✅ |
| 16 | 跨門檻不可被四捨五入掩蓋 | ✅ |
| 17 | 舊檔轉換可見 | ✅ |

🟢 17/17 完成

最後更新：2026-04-27（17 點全部閉環）

---

## 2026-04-27 第四輪：端對端驗證 + 一鍵測試套件

### Phase N — 真實生產行為驗證

| 行為 | 驗證方式 | 結果 |
|---|---|---|
| auto_word.py 指紋閘門 | 用刻意缺 hash 的 payload 渲染 PDF，檢查 .v2-draft-watermark 注入 | ✅ 12 張 a4 全部含浮水印；4.6 MB PDF 正常產生；「草稿 DRAFT」文字可見 |
| Phase K 預設值徽章 | 21 個欄位實際 DOM 檢查 | ✅ 21/21 含「預」、19/21 含「D」、19/21 仍為預設值 |
| Phase L dock 模式 | 三狀態切換 + computed style 驗證 | ✅ docked: position=fixed/right=0px；mini: width=48px |
| Phase J verifier 配置 | 5 種跨門檻 / 容許值類別實測 | ✅ 全部正確：DCR 跨 0.9/1.0 觸發 must_not_cross；Cpe ±2%；Fph 1e-6 嚴格 |

### Phase O — 一鍵測試套件

新增 `tests/` 結構：

```
tests/
├── README.md                    # 使用指南
├── run_all_tests.bat            # ★ Windows 一鍵入口
├── ci_summary.py                # log → JSON 摘要報告
├── _run_log/                    # 歷史 log
│   ├── _last_run.log
│   └── _last_summary.json       # CI 友善格式
└── golden/
    ├── auto_capture.py
    ├── auto_diff.py
    ├── case_*.json              # 5 組基準
    └── _drift_log/
```

涵蓋 7 項驗證（一鍵跑）：
1. regression-smoke（calc-core）
2. formula-registry-smoke
3. review-dashboard-smoke
4. version-sync-smoke
5. V2 HTML inline JS 語法檢查
6. baseline drift（5 組 golden samples）
7. auto_word.py 指紋閘門端對端

最終結果：**7 PASS / 0 FAIL**（CI 摘要 JSON 自動產生）

### 生產就緒狀態

- ✅ 計算核心：4 套 smoke + 5 組 baseline
- ✅ 視覺渲染：tier 分區（DOM 與 API 100% 對齊）+ tier banner + 法規 footer + 預設值徽章
- ✅ 治理：calc_source_hash + input/normalized/result hash + review_workflow + result trace
- ✅ 匯出：三層檢查（block/warn/info）+ 草稿浮水印自動注入
- ✅ Python：auto_word 指紋閘門已驗證真實觸發；generate_docx LEGACY；verifier 容許值配置
- ✅ 排程：schedule_drift_check.bat / run_all_tests.bat
- ✅ 文件：architecture.md + baseline_schema.md + tests/README.md + diagnostics.html

最後更新：2026-04-27（端對端驗證 + 一鍵測試套件完成）

---

## 2026-04-27 第五輪：治理鏈最後一環閉合 — Schema Validation

使用者指出的鏈：
```
golden samples → schema → calc-core → structured result → hash/trace → 匯出只讀 result
```

第 2 環（schema）為唯一未實質完成項目。本輪閉合：

### 新增模組

**`js/input-schema.spec.js`** — 純函式（無 DOM 依賴），可在瀏覽器與 Node.js 通用：
- `INP_SCHEMA`：21 個關鍵全域欄位（st_t、w_v、s_sds、m_anc_type、m_pin_d…）
- `CASE_SCHEMA`：10 個案例欄位（w、h、type、fx、fy1、fy2、bh、H1、d1）
- `validateAndNormalize(raw)` 回傳 `{ normalized, errors[], warnings[], applied_defaults[], version }`

驗證規則：
| 情境 | 處理 |
|---|---|
| 缺欄位 + 有 default | 套用 default + 加入 `applied_defaults` |
| 缺欄位 + 無 default + required | `errors.push({ code: 'required_missing' })` |
| 字串型數值 | 自動 coerce 成 number；無法解析 → `type_error` |
| enum 違反 | `errors.push({ code: 'enum_invalid' })` |
| 範圍超出 | `warnings.push({ code: 'range_above_max'/'range_below_min' })`（非 error） |
| schema 外欄位 | 原樣保留（不丟棄） |
| 幾何衝突（fx*2 ≥ w / fy1+fy2 ≥ h） | `errors.push({ code: 'geometry_conflict' })` |

**`js/input-schema-smoke.test.js`** — 10 組 smoke test 全 PASS：
- 完整合法輸入 / 缺欄位用 default / 字串 coerce / type 錯誤 / enum 違反 / 範圍 warn / 幾何衝突 / 空 cases / schema 外欄位保留 / 確定性

### V2 治理鏈接入

`window.getCalculationResults()`：
1. 取 `rawInp` + `rawCases`
2. 呼叫 `StoneInputSchema.validateAndNormalize` → 取得 normalized 與 errors/warnings
3. 用 normalized 執行 `computeAllCasesScoped`（不再傳 raw）
4. `meta.input_schema_version` + `meta.schema_validation` 寫入 result

`window.v2RefreshDeliveryHashes()`：
- 從前的 `normalized_input_hash = input_hash`（alias）
- 改為 `normalized_input_hash = SHA-256(StoneInputSchema.validateAndNormalize(raw).normalized)`
- **真正獨立的指紋**（任何輸入正規化後內容變化都會反映）

### 三層匯出檢查整合

`v2CollectExportChecklist`：
- schema errors → BLOCK 級（每筆含原因/目前值/要求值/建議處理）
- schema warnings → WARN 級
- applied_defaults → INFO 級（列出被套用預設的欄位名）

### baseline 攜帶 schema 指紋

`captured_env` 新增：
- `input_schema_version: 'input-schema-2026.04.27'`
- `schema_validation_summary: { version, error_count, warning_count, applied_defaults_count, applied_defaults }`

5 組 baseline 已重拍，approved drift entry 寫入 `_approval_log.md`。

### 9 項一鍵驗證套件（從 8 升至 9）

新增 `node js/input-schema-smoke.test.js`，run_all_tests.bat + ci_summary.py 同步擴充。

```
================================================================
V2 全測試套件 CI 摘要 — PASS
================================================================
  ✓ regression smoke               PASS
  ✓ formula-registry               PASS   32 checks
  ✓ review-dashboard               PASS
  ✓ version-sync                   PASS
  ✓ input-schema                   PASS   input-schema-2026.04.27, 10 tests   ← 新增
  ✓ V2 HTML inline JS syntax       PASS
  ✓ baseline drift                 PASS   5/5
  ✓ auto_word fingerprint gate     PASS
  ✓ visual decoration              PASS
----------------------------------------------------------------
  9 PASS / 0 FAIL
================================================================
```

### 治理鏈最終全貌（6/6 環全閉合）

```
單一輸入 (raw_input)
    ↓
┌──────────────────────────────────┐
│ ① schema validation              │ ← 本輪新增
│   StoneInputSchema               │
│   .validateAndNormalize()        │
│   → errors / warnings /          │
│     applied_defaults             │
└──────────────────────────────────┘
    ↓
normalized_input
    ↓
┌──────────────────────────────────┐
│ ② calc-core (純函式)             │
│   StoneCalculator.calcCase()     │
│   js/calculator.spec.js          │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ ③ structured result API          │
│   getCalculationResults()        │
│   meta + cases + summary         │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ ④ hash / trace                    │
│   calc_source_hash               │
│   input_hash                     │
│   normalized_input_hash (真獨立)  │
│   result_hash                    │
│   checks[].trace                 │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ ⑤ 匯出只讀 result                │
│   render → PDF                   │
│   auto_word.py（指紋閘門）        │
│   XLSX (raw numeric)             │
│   JSON (含完整 meta)             │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ ⑥ golden samples 護欄            │
│   tests/golden/case_01..05       │
│   auto_capture / auto_diff       │
│   approved drift 流程             │
└──────────────────────────────────┘
```

最後更新：2026-04-27（治理鏈 6/6 環全閉合，9 項一鍵驗證 PASS）

---

## 2026-04-27 第六輪：V2.1.0 進版

依 architecture.md 自評後的「最具 ROI 5 項」執行：

| 項 | 內容 | 狀態 |
|---|---|---|
| A1 | 預設只展開 ①②③，⑤ 規範附加模組改預設收合 | ✅ |
| A2 | 匯出按鈕集中化：① 主要交付 / ② 進階輸出 / ③ 專案存檔 三組 | ✅ |
| C1 | `V2_THRESHOLDS` 擴充為通用閾值守衛機制（不僅限 DCR） | ✅ |
| C2 | 列印時 `<thead>` 跨頁重複（`display:table-header-group`）；長表格續頁有表頭 | ✅ |
| B4 Phase 1 | **規範 profile JSON 化骨架**：5 份 JSON + registry + meta + footer | ✅ |
| B2 | `tests/quick_check.bat`（< 5 秒，免 Playwright 的快速驗證） | ✅ |

### 規範 profile 倉庫

```
js/code-profiles/
├── _README.md / _schema.md
├── cns_wind_107.json           （建築物耐風設計規範及解說 107 年版）
├── cns_seismic_113.json        （建築物耐震設計規範及解說 113 年版）
├── aci_318_appendix_d.json     （ACI 318 Appendix D）
├── cns_steel_general.json      （鋼構造容許應力法）
└── cns_stone_general.json      （CNS 14448 / CNS 6300 / JASS 9）

js/code-profiles-registry.spec.js  （註冊表 + getProfile / getActiveProfile / buildActiveProfilesMeta）
js/code-profiles-registry-smoke.test.js  （11 項 smoke）
```

### V2.1.0 寫入 meta 的新欄位

```jsonc
{
  "meta": {
    "calculator_version": "2026.04.23-spec-core11",
    "formula_registry_version": "formula-registry-2026.04.25",
    "input_schema_version": "input-schema-2026.04.27",
    "code_profiles_registry_version": "code-profiles-registry-2026.04.27-v1",   // ← V2.1
    "code_profiles": {                                                            // ← V2.1
      "wind":    { "id": "cns_wind_107", "name": "...", "issued": "..." },
      "seismic": { "id": "cns_seismic_113", "name": "...", "issued": "..." },
      "anchor":  { "id": "aci_318_appendix_d", "name": "...", "issued": "..." },
      "steel":   { "id": "cns_steel_general", "name": "...", "issued": null },
      "stone":   { "id": "cns_stone_general", "name": "...", "issued": null }
    },
    "calc_source_hash": "sha256:...",
    "input_hash": "sha256:...",
    "normalized_input_hash": "sha256:...",
    "result_hash": "sha256:...",
    "review_workflow": { ... },
    "schema_validation": { errors:[], warnings:[], applied_defaults:[] }
  }
}
```

### 法規 footer 顯示變化

從前：
```
Calculator: V2.0.2 (...html)
Formula Registry: formula-registry-...
```
（內部術語洩漏）

現在：
```
耐風 profile: cns_wind_107  建築物耐風設計規範及解說（107 年版）
耐震 profile: cns_seismic_113  建築物耐震設計規範及解說（113 年版）
錨栓 profile: aci_318_appendix_d  ACI 318 Appendix D
鋼結構 profile: cns_steel_general  鋼構造建築物鋼結構設計技術規範
石材 profile: cns_stone_general  CNS 14448、CNS 6300 A1028 與 JASS 9
公式指紋: sha256:c66769fe8642e...
```

### 10 項驗證套件最終 PASS

```
================================================================
V2 全測試套件 CI 摘要 — PASS
================================================================
  ✓ regression smoke               PASS
  ✓ formula-registry               PASS   32 checks
  ✓ review-dashboard               PASS
  ✓ version-sync                   PASS
  ✓ input-schema                   PASS   10 tests
  ✓ code-profiles                  PASS   11 tests   ← V2.1 新增
  ✓ V2 HTML inline JS syntax       PASS
  ✓ baseline drift                 PASS   5/5
  ✓ auto_word fingerprint gate     PASS
  ✓ visual decoration              PASS
----------------------------------------------------------------
  10 PASS / 0 FAIL
================================================================
```

最後更新：2026-04-27（V2.1.0 進版完成；治理鏈含規範 profile 骨架）

---

## 2026-04-27 第七輪：B4 Phase 2 demo 上線

### Migration helper

`js/code-profiles-registry.spec.js` 新增：
```js
StoneCodeProfiles.getParam(inp, scope, key, fallback)
```
- active profile 內含 key → 回傳 profile 值
- 否則回傳 fallback（保證向後相容）

### 首例 profile-aware 計算（seismicDemand）

`js/calculator.spec.js` 中 `seismicDemand(inp, Wp, ipEff)` 函式：

| 從前（hardcoded） | 現在（profile-aware） |
|---|---|
| `1.6 * sds * ip * Wp` | `getParam(inp, 'seismic', 'Fph_simple_factor', 1.6) * sds * ip * Wp` |
| `0.3 * sds * ip * Wp` | `getParam(inp, 'seismic', 'Fph_detailed_lower_factor', 0.3) * sds * ip * Wp` |
| `0.4 * ap * sds * ip * (1 + 2 * zhRatio) / rp` | `getParam(inp, 'seismic', 'Fph_detailed_base_factor', 0.4) * ap * ...` |
| `'Fph = 1.6 × SDS × Ip × Wp'`（formula 字串） | `\`Fph = ${fphSimpleFactor} × ...\``（動態） |

### Migration pattern

```
1. 在 profile JSON 加入該係數（若尚未有）
2. 在 calc-core 對應位置替換為 getParam 呼叫，fallback = 原 hardcoded
3. 跑 baseline drift —— 應為 0（profile 預設值與 hardcoded 相等）
4. 之後規範改版時：只改 profile JSON，calc-core 不動
```

### 驗證

baseline drift 5/5 = 0% — 證實 migration 正確（讀 profile 與讀 hardcoded 結果一致）。
6 套 Node smoke 全 PASS（regression / formula-registry / review-dashboard / version-sync / input-schema / **code-profiles** 含 4 項新增 getParam 測試）。

### 候選下一批遷移

| profile 鍵 | 在 calc-core 的位置 | 風險 | 狀態 |
|---|---|---|---|
| `psi_cV_full_rebar`（1.4）/ `psi_cV_edge_rebar`（1.2）/ `psi_cV_no_rebar`（1.0） | anchor concrete check | 低 | ✅ V2.1.1 已遷移 |
| `psi_cN_uncracked`（1.25）/ `psi_cN_cracked`（1.0） | anchor pull-out | 低 | ✅ V2.1.1 已遷移 |
| `phi_steel`（0.75）| anchor strength reduction | 中 | ✅ V2.1.1 已遷移 |
| `service_factor_typical`（1.6）| anchor SF 法服務係數 | 低 | ✅ V2.1.1 已遷移 |
| `interaction_exponent_steel`（5/3） | tension-shear interaction | 低 | ✅ V2.1.1 已遷移 |
| `Fb_factor_static`（0.6）/ `Fb_factor_with_wind_seismic`（1.25）/ `Fv_factor`（0.4） | 鋼材 Fb / Va 計算 | 低 | ✅ V2.1.1 已遷移 |
| `Rp_stone_panel_default`（2.5）/ `ap_default`（1.0） | sp_seis_rp / sp_seis_ap input default | 中 | ✅ V2.1.2 已遷移 |
| `Ip_facade_minimum`（1.5） | effectiveIp() 自動提升下限 | 中 | ✅ V2.1.2 已遷移 |
| `granite_grade2_fb`（55）/ `granite_grade2_ft`（35） | panelCheck() sp_stone_fb / sp_stone_ft 預設 | 中 | ✅ V2.1.2 已遷移 |
| `back_anchor_cone_angle_deg_default`（30°） | panelCheck() sp_panel_cone_angle 預設 | 低 | ✅ V2.1.2 已遷移 |
| `thermal_alpha_stone_default`（8e-6）/ `thermal_delta_T_default`（40） | thermalCheck() | 低 | ✅ V2.1.2 已遷移 |
| `min_thickness_default_mm`（30）/ `max_panel_area_default_m2`（1.0） | dimensionCheck() | 低 | ✅ V2.1.2 已遷移 |
| `Fy_SUS304_default`（2100） | m_fy 預設（buildCaseCheckData / slipPlate）| 低 | ✅ V2.1.3 已遷移 |
| `PEV_factor_conservative`（0.5）/ `PEV_factor_standard`（0.2） | calcCase() PEV 計算 | 低 | ✅ V2.1.3 已遷移 |
| `granite_grade1`/`marble`/`sandstone` fb·ft（其他石材等級） | sp_stone_grade enum 切換（HTML-side prefill） | 中 | 🔜 V2.2 候選（需先解 STONE_GRADE_CATALOG 與 profile 並存） |
| `thermal_alpha_steel`（12e-6） | 鋼支架伸縮（待補檢核） | 低 | 🔜 V2.2 候選（需先補檢核項目） |
| `Cpe_zone_4_typical` / `GCpi_enclosed` 風壓係數 | computeWindFromGCp() | 中 | 🔜 V2.2 候選（需重構 0 fallback 語意） |
| `Fy_A36_default`（2500） | m_fy A36 切換（需 enum）| 低 | 🔜 V2.2 候選 |
| `min_anchor_diameter_mm` / `min_embedment_mm` / `min_edge_distance_mm` | 待補錨栓構造檢核 | 中 | 🔜 V2.2 候選 |

每批遷移獨立走 approved drift（baseline drift 應為 0）後再做下一批。

### V2.1.0 整體治理鏈最終圖

```
raw_input
   ↓
schema validation (input-schema-2026.04.27)
   ↓
normalized input
   ↓
calc-core (calculator.spec.js)
   ↓ ←─ getParam(scope, key, fallback) ←─ code-profiles-registry
   ↓                                          ↓
   ↓                                       js/code-profiles/*.json
   ↓                                       ── cns_wind_107
   ↓                                       ── cns_seismic_113   (V2.1.0 Fph 4 + V2.1.2 ap/Rp/Ip 3 + V2.1.3 PEV 2 = 9 係數)
   ↓                                       ── aci_318_appendix_d (V2.1.1 ψc 5 + φ/SF 2 + interaction 1 = 8 係數)
   ↓                                       ── cns_steel_general  (V2.1.1 Fb/Fv 3 + V2.1.3 Fy 1 = 4 係數)
   ↓                                       ── cns_stone_general  (V2.1.2 fb/ft/cone/熱脹/厚度/面積 7 係數)
   ↓
structured result API（meta 含 5 hash + code_profiles + schema_validation + review_workflow）
   ↓
hash / trace（24/24 含 trace）
   ↓
匯出只讀 result（PDF / Word / docx / XLSX raw numeric）
   ↓
golden samples 護欄（5 baseline + auto_diff + approved drift）
   ↓
排程定期跑 / 一鍵測試套件（10/10 PASS）
```

最後更新：2026-04-29（V3.0.2 — protocol 規格驗證器移植至 Python（audit_compare.py）+ CLI --strict-protocol 閘門 + server.py 寫入 governance_protocol_version；JS+Python 雙端驗證器；audit_compare 13 → 19 項；baseline drift = 0）

---

## 第八輪（V2.1.1）：規範參數遷移延伸

### 動機

V2.1.0 完成第一批 demo（耐震 Fph 4 係數）後，候選清單仍有 11 個高頻參數待遷移。此輪一次性處理錨栓相關（ψc / φ / 互制 / SF）與鋼材 Fb/Fv，將「治理鏈第二環」實質擴展。

### 範圍

| 批次 | scope | 鍵 | 位置 |
|---|---|---|---|
| 1 | anchor | `interaction_exponent_steel` | `buildCaseCheckData()` 拉剪互制式 |
| 2 | anchor | `psi_cN_uncracked` / `psi_cN_cracked` / `psi_cV_full_rebar` / `psi_cV_edge_rebar` / `psi_cV_no_rebar` | `psiFactors()` |
| 3 | anchor | `phi_steel` / `service_factor_typical` | `anchorCapacity()` 預設值 |
| 4 | steel | `Fb_factor_static` / `Fb_factor_with_wind_seismic` / `Fv_factor` | `buildCaseCheckData()` 鋼材檢核 + 主流程 `inp.w_cf` 預設 |

### 一致性處理

`interaction_exponent_steel` 原 profile 值 1.67（規範上的截斷顯示），calc-core 實際以 `5/3` 計算。為避免精度差異，將 profile JSON / inline registry / smoke test 三處統一改為 `5/3`（= 1.6666666666666667）。

### 驗證結果（V2.1.1）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke 全通過
- 全 10 項一鍵測試套件 PASS

---

## 第九輪（V2.1.2）：石材／熱脹／耐震輸入預設遷移

### 動機

V2.1.1 後，calc-core 主要的「規範常數」已遷移完畢。V2.1.2 處理「規範建議的工程預設值」這層 — 例如外牆 Ip 最低 1.5、石材厚度 30 mm、單片面積 1.0 m²、熱脹 ΔT = 40°C，使這些建議值得以與正式規範同步異動。

### 範圍

| 批次 | scope | 鍵 | 位置 |
|---|---|---|---|
| 1 | stone | `granite_grade2_fb` / `granite_grade2_ft` / `back_anchor_cone_angle_deg_default` | `panelCheck()` 預設 |
| 2 | stone | `thermal_alpha_stone_default` / `thermal_delta_T_default` | `thermalCheck()` 預設 |
| 3 | seismic | `ap_default` / `Rp_stone_panel_default` / `Ip_facade_minimum` | `seismicDemand()` / `effectiveIp()` |
| 3 | stone | `min_thickness_default_mm` / `max_panel_area_default_m2` | `dimensionCheck()` |

### 一致性處理

`dimensionCheck()` 原以硬編字串 `'t ≥ 30'` 與 `'A ≤ 1.0'` 顯示判準；本輪改為以 profile 值動態組裝顯示字串，避免規範改版後計算與報告文字分歧。row 內的 limit 數值與 toFixed 也同步使用 profile 值。

### 累計

| 版次 | 已遷移係數 | 涵蓋 scope |
|---|---|---|
| V2.1.0 | 4 | seismic |
| V2.1.1 | 11（累 15）| anchor、steel |
| V2.1.2 | 10（累 25）| stone、seismic |

### 驗證結果（V2.1.2）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke 全通過
- 全 10 項一鍵測試套件 PASS

---

## 第十輪（V2.1.3）：鋼材 Fy ／耐震 PEV ／顯示字串動態化

### 動機

V2.1.2 完成 25 個規範參數遷移後，calc-core 中尚有兩類「規範常數型」hardcoded 值：
1. `inp.m_fy` 預設 2100（SUS304）— 散見兩處（buildCaseCheckData / slipPlate）
2. `PEV = 0.5·PE` 與 `PEV = 0.2·SDS·D` 的兩個倍率係數

此外，幾個顯示字串仍硬編「0.5PE」「0.2SDS」「Fb 不乘 1.25」，在規範改版時容易與計算分歧。本輪一次處理。

### 範圍

| 批次 | scope | 鍵 | 位置 |
|---|---|---|---|
| 1 | steel | `Fy_SUS304_default` | `buildCaseCheckData()` 角鋼 + `slipPlateCheckData()` 伸縮片 |
| 2 | seismic | `PEV_factor_conservative` / `PEV_factor_standard` | `calcCase()` 主流程 |
| 3 | – | 顯示字串改用 `pevMethod` / `wcfDefault` 變數 | calcCase() narrative |

### 一致性處理

- PEV method 字串原為硬編 `'0.5PE 保守式'` / `'Ev = 0.2SDSD 規範式'`，改用 `${pevConservativeFactor}` / `${pevStandardFactor}` 動態組裝
- 「Fb 不乘 1.25」改用 `${wcfDefault.toFixed(2)}` 動態組裝（V2.1.1 已將 `inp.w_cf` 預設改為 profile 取得）
- 累計 V2.1.x 共 **30 個規範參數**已 profile-aware

### 後續路線

V2.1.x 規範常數遷移系列至此告一段落。剩餘候選（其他石材等級、鋼材 thermal_alpha_steel、風壓 GCpi/Cpe、錨栓構造最小值）多需先補檢核項目或重構輸入語意，建議併入 **V2.2 規劃**。

### 驗證結果（V2.1.3）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke 全通過
- 全 10 項一鍵測試套件 PASS

---

## 第十一輪（V2.2.0）：profile 治理鏈強化（從遷移轉向驗證）

### 動機

V2.1.x 完成 30 個規範參數遷移後，治理鏈第二環的「讀取／消費」已成熟。但仍有兩個治理空缺：

1. profile JSON 與 CONSTS 之間缺乏自動一致性檢查（marble / sandstone fb·ft 已被發現不一致）
2. profile 自身缺乏 schema 驗證（缺欄位、scope 錯誤、SemVer 違反不會被偵測）

V2.2.0 補齊這兩項。

### 範圍

| 項目 | 內容 |
|---|---|
| profile / CONSTS 對齊 | marble fb 40→35、ft 25→22；sandstone fb 30→22、ft 20→14（CNS 為主）|
| 新 API | `validateProfile()` / `validateAllProfiles()` / `auditProfileAgainstConsts()` |
| smoke test 強化 | 15 → 21 項；新增驗證函式正反向 + JSON↔inline 深入比對 |
| 副發現 | `cns_seismic_113` 缺 `ap_rigid/flexible`（補入）、`cns_steel_general` 冗餘 `shear_reduction`（移除）|

### 治理鏈圖更新

```
profile JSON / inline registry
     ↓                ↓
     ↓        validateProfile()  ─→ schema 違反偵測
     ↓                ↓
     ↓        validateAllProfiles()  ─→ 啟動自我檢查
     ↓                ↓
     ↓        auditProfileAgainstConsts(CONSTS)  ─→ 與 CONSTS 漂移偵測
     ↓                ↓
calc-core ←─ getParam（仍 V2.1.x 機制）
```

### 驗證結果（V2.2.0）

- baseline drift 5/5 = **0%**（calc-core 行為完全不變）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 全通過
- code-profiles-registry-smoke：15 → **21 項** 全通過

### 後續路線（V2.2.0 提出）

- ~~**V2.2.1**：HTML profile picker UI~~ → 改為 V2.2.3（需先有第二份 profile 對照）
- ~~**V2.2.2**：profile diff viewer~~ → 改為 V2.2.4
- 實際 V2.2.1 改為「驗證 API 從函式可用推進到報告可見」（見下節）

---

## 第十二輪（V2.2.1）：profile 驗證結果可視化

### 動機

V2.2.0 把 `validateAllProfiles` 與 `auditProfileAgainstConsts` 兩個治理 API 上線，但結果只在 Node smoke 中可見；技師於簽證前無法在計算書介面直接確認。本輪把驗證結果**呈現於計算書末頁**，讓 governance 從「測試覆蓋」推進到「使用者可見」。

### 範圍

| 項目 | 內容 |
|---|---|
| `v2InjectRegulationFooter()` | 在法規版本表新增「規範自檢」一列，顯示 schema 驗證 + CONSTS 一致性結果 |
| `validateAllProfiles()` 整合 | footer 啟動時呼叫，失敗時顯示 ⚠ 與計數 |
| `auditProfileAgainstConsts()` 整合 | 比對 8 個石材 fb·ft 鍵與 `STONE_CONSTANTS.STONE_GRADE_CATALOG` |
| 配色 | 通過綠 #1a7a3a / 警告橘 #b3471d；列印與 PDF 皆保留 |
| `tests/visual_decoration_test.py` | 新增 `validation_badge_present` 斷言（Playwright 直接查找 DOM）|

### 設計選擇

- **不阻擋**：徽章僅供 governance 觀察，不替代 BLOCK 級匯出閘門。技師對 profile 校驗結果的責任需明顯但不過度警示。
- **不展開細節**：失敗時只顯示計數；點開查看細節留至 V2.2.4 的 diff viewer。

### 後續路線

- **V2.2.2**：規範參數總覽（active params 列表與公式連結）
- **V2.2.3**：HTML profile picker（需先有第二份 profile）
- **V2.2.4**：profile diff viewer
- **V2.3+**：補錨栓構造最小值檢核（approved drift）

### 驗證結果（V2.2.1）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含新斷言）全通過
- 法規 footer DOM 含「規範自檢」字樣（Playwright 已驗證）

---

## 第十三輪（V2.2.2）：規範參數總覽

### 動機

V2.2.1 「規範自檢」徽章告訴技師「驗證通過」，但無法回答「採用了什麼數值」。對技師簽證業務而言，這是關鍵漏洞：

- 同名 profile 之 params 可能因版本更新而變動
- 規範改版後若僅換 profile id，技師應能於計算書內直接核對採用值
- profile 失效或缺失時，總覽可顯示 fallback 來源

### 範圍

| 項目 | 內容 |
|---|---|
| `v2InjectActiveParamsOverview()` | 法規 footer 之後追加可展開 `<details>` 區塊 |
| 結構 | 5 scope 分組顯示，每組標題含 profile id 與 name |
| 數值格式 | 整數直顯／浮點 6 位／極值科學記號／陣列物件統計 |
| 列印 | `@media print` 自動展開、隱藏收合箭頭、`break-inside:avoid` |
| 測試 | visual_decoration_test 新增 3 項斷言（block 存在、scope ≥ 5、rows ≥ 25）|

### 實測

- 5 scopes × 平均 10 keys ≈ **52 個 params** 顯示於計算書末頁
- DOM 結構：`.v2-active-params .ap-scope` × 5；總列數 52

### 設計選擇

- **預設展開**：governance 透明性優先；技師可手動收合
- **不過濾僅顯示計算用 keys**：profile 內所有 keys（如 ip 陣列、論述用 keys）一併顯示，避免遮蔽 governance 資訊
- **數值就近格式化**：不四捨五入到顯示精度，技師核對時看到完整精度

### 後續路線

- **V2.2.3**：profile picker（多 profile 切換）
- **V2.2.4**：profile diff viewer
- **V2.3+**：錨栓構造最小值檢核（approved drift）

### 驗證結果（V2.2.2）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 3 項新斷言）全通過
- Playwright 確認 5 scope × 52 rows 已注入

---

## 第十四輪（V2.2.3）：profile picker 與第一個對照 profile

### 動機

V2.2.2 已將 active params 全列出供核對，但所有 scope 都只有一個 profile 候選 — picker 沒有切換對象。本輪上線**第一個對照 profile** 與**完整 picker UI 機制**，使治理鏈第二環從「單一規範」推進到「保守對照」。

### 範圍

| 項目 | 內容 |
|---|---|
| 對照 profile | `cns_seismic_113_conservative`：lower 0.3→0.4、Rp 2.5→2.0 |
| 定位 | 工程設計階段保守邊界比較；正式簽證須附說明 |
| inputs() | 讀取 `localStorage['stone_v2_profile_override']` 注入 `inp.code_profiles` |
| picker UI | 每個 scope 標題下方加 `<select>` 列出候選；@media print 隱藏 |
| 「已覆寫」徽章 | 非預設時顯示橘色提示 |
| 切換流程 | change → localStorage 寫入/刪除 → `window.render()` 自動觸發 |
| 測試 | smoke 由 21 → 22；visual_decoration_test 新增 2 項斷言 |

### 設計選擇

- **對照值非規範本身**：113 保守對照不取代 113 規範；params 中只變動 lower/Rp 兩鍵以利清楚比較
- **不寫入 case 檔**：override 存於 localStorage，跨 case 共用；保存案件 JSON 仍含 `inp.code_profiles` 供日後重現
- **列印不見 picker**：列印與 PDF 只見結果（已展開的 params 表），不見操作元素

### baseline drift = 0 邏輯

- DEFAULT_ACTIVE 仍為 `cns_seismic_113`
- baseline 5 案例的 inp 中無 `code_profiles` key，`resolveActiveProfiles({})` 仍回退 DEFAULT_ACTIVE
- 對照 profile 只在使用者主動切換時才生效

### 後續路線

- **V2.2.4**：profile diff viewer — 並排呈現兩 profile 之計算結果差異
- **V2.3+**：補錨栓構造最小值檢核（approved drift）
- **長期**：補實際歷史規範 profile（如 cns_seismic_111）

### 驗證結果（V2.2.3）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 2 項新斷言）全通過
- code-profiles-registry-smoke 22 項全通過
- Playwright 確認 picker 注入正常（seismic 候選 = 2）

---

## 第十五輪（V2.2.4）：profile diff viewer

### 動機

V2.2.3 picker 讓使用者切換對照 profile 並看到單側結果，但**無法直觀知道差距**。技師若要對照「採用對照 profile 後 DCR 升高多少 / Fph 變動幾%」，需要並排比較。本輪上線雙路計算 + delta 表格。

### 範圍

| 項目 | 內容 |
|---|---|
| `v2InjectProfileDiff()` | 雙路 calc-core 執行（A 強制預設、B 含 override），不動 localStorage |
| 比較 metrics | 每案例 Fph / DCR_governing / passed 狀態 |
| Δ% 上色 | 紅 = 上升（危險）、綠 = 下降（安全）、灰 = 持平 |
| 通過狀態變動 | `轉不通過`（紅）/ `轉通過`（綠）顯著標示 |
| 顯示時機 | localStorage 有 override 才顯示；無則隱藏（避免噪音）|
| 列印 / PDF | 自動展開 + `break-inside:avoid` |

### 雙路機制設計

```
inputs() → baseInp
  ├─ A: { ...baseInp, code_profiles: undefined }
  │      → schema.validateAndNormalize → computeAllCasesScoped → resA
  └─ B: { ...baseInp, code_profiles: override }
         → schema.validateAndNormalize → computeAllCasesScoped → resB

per-case: compare resA[i] vs resB[i] on { Fph, dcr_governing, passed }
```

### 視覺三色階

至此 v2 governance UI 形成清晰三色階：

| 區塊 | 配色 | 訊號 |
|---|---|---|
| 規範自檢徽章 | 綠 ✓ / 橘 ⚠ | 「狀態正確嗎」|
| 規範參數總覽 | 灰白 | 「採用了什麼數值」|
| profile diff viewer | 暖黃 | 「對照差異多大」|

### 護欄擴充

`tests/visual_decoration_test.py` 加單檔兩階段測試：

1. 預設驗 `profile_diff_present_no_override === false`
2. 模擬 override（`localStorage.setItem` + `render`）
3. 驗 diff viewer 注入、列數 ≥ 1、含 pct marker
4. 還原 localStorage 避免影響後續

### V2.2.x「UI 化」系列收尾

| 版次 | 核心交付 |
|---|---|
| V2.2.0 | profile/CONSTS 對齊 + 驗證 API |
| V2.2.1 | 「規範自檢」徽章 |
| V2.2.2 | 「規範參數總覽」（5 scope × 52 params）|
| V2.2.3 | profile picker + 第一個對照 profile |
| V2.2.4 | profile diff viewer（雙路對照）|

至此治理鏈第二環從「能讀」推進到「能驗證、可核對、可切換、可對照」。calc-core 行為從未改變（drift = 0），但技師簽證前的可見資訊已完整。

### 後續路線

- **V2.3+**：補錨栓構造最小值檢核（approved drift）
- **可能 V2.2.5**：preset bundle picker（一鍵切換多個 scope）
- **長期**：補歷史規範 profile（cns_seismic_111），diff viewer 直接支援

### 驗證結果（V2.2.4）

- baseline drift 5/5 = **0%**（diff viewer 純讀取，不寫入 hash 或 result）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 4 項新斷言）全通過
- Playwright 兩階段測試：無 override 隱藏、有 override 顯示且含 pct marker

---

## 第十六輪（V2.3.0）：detailing 層 profile 化

### 動機

V2.1.x 完成「強度層」規範參數遷移（30 個係數，涵蓋 Fph 上下限、錨栓 ψc/φ、鋼材 Fb 等）；V2.2.x 完成 profile 治理 UI。但 calc-core 中還有最後一類規範常數未動：**detailing 層的構造最小值**（錨栓直徑 ≥ 4、長度 ≥ 75、埋深 ≥ 40、邊距 ≥ 25）。

這類最小值雖然不影響強度 DCR，但是**規範層級的硬性條款**，應當與強度係數一樣具備可追溯性與可變更性（規範改版時只動 profile JSON）。

### 範圍

`customAnchorCheck()`（既有函式，由 `sp_custom_anchor_on` 模組閘控制）：

| 處 | 修改內容 |
|---|---|
| 4 處檢核斷言（一般錨栓）| 限值 `4/75/40/25` → `getParam('anchor', ...)` |
| 4 處檢核斷言（插梢鋼棒）| 同上 |
| 3 處 inp 預設值 | `sp_custom_anchor_edge_mm` / `sp_custom_pin_length/embed/edge_mm` 預設改 profile 取 |
| 8 處 row 公式字串 | `'L ≥ 75'` 等改 `\`L ≥ ${minL}\`` 動態組裝 |

profile 補新鍵：`aci_318_appendix_d.params.min_anchor_length_mm: 75`（同步 JSON / inline / smoke test）。

### 累計成果（橫跨強度與構造層）

| 層 | 已遷移 | 工具狀態 |
|---|---|---|
| V2.1.x 強度層 | 30 個係數 | calc-core 全 profile-aware |
| V2.3.0 構造層 | 5 個鍵（4 既有 + 1 新增）× 8 用點 | calc-core 全 profile-aware |
| **小計** | **35 個 profile 鍵 calc-core 直接消費** | – |

### baseline drift = 0 邏輯

- 4 個既有最小值 profile 鍵（diameter/embedment/edge_distance/length）值與 hardcoded 完全相同
- 3 個 inp 預設值（25/75/40/25）亦與既有 fallback 一致
- 5 個 baseline 案例之 inp 中 `code_profiles` 為空，走 DEFAULT_ACTIVE → 行為不變

### 後續路線

- **V2.3.1**：錨栓 vs 插梢分離 profile 鍵（如 pin 用較小 d_min）
- **V2.3.2**：錨栓 N_b / V_b 公式 profile 化（hef-power、k_c 等）
- **V2.4+**：規範變更追蹤（profile params SHA-256 寫入 result meta）

至此 calc-core 中**所有可被合理 profile 化的規範常數皆已遷移**；後續多需先擴充計算邏輯才有更多遷移目標。

### 驗證結果（V2.3.0）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 22 → **23 項** 全通過

---

## 第十七輪（V2.4.0）：規範變更追蹤指紋（profile params hash）

### 動機

V2.3.0 完成 calc-core 強度 + 構造雙層 profile 化（35 鍵），但 governance 仍欠：**規範值是否被偷偷改過，沒有可驗證的指紋**。例如某 profile JSON 的 `granite_grade2_fb` 從 55 改成 56，calc 結果略變但既有 baseline 指紋無法直接揭露此變動 — 必須回頭看 git diff。

V2.4.0 補上 per-profile params 指紋，寫入 result.meta + 顯示於 footer。

### 演算法選擇 — 為何不用 SHA-256

| 指標 | Web Crypto SHA-256 | 自實作 SHA-256 sync | cyrb53（採用）|
|---|---|---|---|
| 同步 | ❌ async only | ✓ 但 ~50 行 | ✓ ~10 行 |
| 結果長度 | 64 hex | 64 hex | 14 hex |
| 碰撞率 | 極低 | 極低 | ~0.0001%（53-bit）|
| 適合用途 | 密碼學/防偽 | 同左 | governance fingerprint |
| 顯示徽章友善 | ❌ 太長 | ❌ 太長 | ✓ 14 字元 |

採 cyrb53：governance 不需密碼學等級；14 字元 hex 適合做 footer 徽章；同步無依賴，Node + browser 通用。

### 範圍

| 項目 | 內容 |
|---|---|
| `_canonicalJSON()` | 鍵遞迴排序確定性序列化 |
| `_cyrb53()` | 53-bit 同步 hash |
| `getProfileParamsHash(id)` | `'cyrb53:' + 14 hex` |
| `getAllProfileHashes()` | 對照表 |
| `buildActiveProfileHashes(inp)` | `{ scope: { id, hash } }`，給 meta 用 |
| HTML meta | 寫入 `code_profiles_hashes`（既有 `code_profiles` 旁邊）|
| footer 徽章 | 灰色小 tag 顯示 14 hex，title tooltip 說明 |

### 完整治理指紋鏈

至此 result.meta 含 **5 層治理指紋**：

| 層 | 指紋 | 變動觸發 |
|---|---|---|
| 1 | `input_hash` | 任何 raw input 變動 |
| 2 | `normalized_input_hash` | schema 後仍有實質變動 |
| 3 | `result_hash` | 計算結果變動 |
| 4 | `calc_source_hash` | calc-core JS 檔內容變動（SHA-256）|
| 5 | **`code_profiles_hashes`** | profile params 變動（cyrb53）|

### baseline drift = 0 邏輯

- `auto_diff.py` 比對 `result.summary` 內容（Fph / Tmax / Vmax / DCR / passed），不比對 `meta.code_profiles_hashes`
- 新增 meta 欄位不影響既有 baseline 比對

### 後續路線

- **V2.4.1**：審查模式 — 比對歷史 profile hashes（顯示「已變動於 V2.X.Y」）
- **V2.4.2**：profile 變動時觸發 governance 警示（hash mismatch with last archived run）
- **V2.5+**：calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint

### 驗證結果（V2.4.0）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 23 → **27 項** 全通過（4 項 V2.4.0 hash 斷言）
- visual_decoration_test 新增 3 項：hashes_present、count >= 5、format_ok

---

## 第十八輪（V2.4.1）：profile hash archive 與「自 V2.X.Y 起已變動」審查徽章

### 動機

V2.4.0 上線後技師可看到當下指紋，但仍欠：**「自上次發行版以來，規範值是否變動」沒有可視化結論**。簽證現場若 profile JSON 被偷偷改過 `granite_grade2_fb` 從 55 變 56，技師需要對照舊指紋才能發現。V2.4.1 把這個比對自動化、可視化。

### archive snapshot 結構

```js
PROFILE_HASH_ARCHIVE = [
  {
    version: 'V2.4.0',
    date:    '2026-04-28',
    note:    '首批 archive 基線',
    hashes:  { profileId: 'cyrb53:...', ... }
  },
  // 未來變動時 append 新 entry
]
```

### 新增 API

| API | 用途 |
|---|---|
| `getLatestProfileArchive()` | 最新 snapshot 物件（陣列尾端）|
| `compareProfileHashWithArchive(id)` | 單一 profile 與 archive 比對 |
| `buildActiveProfileChangelog(inp)` | 全 5 scope 走比對；給 meta 用 |
| `PROFILE_HASH_ARCHIVE` | frozen 陣列直接讀 |

### 三類偵測結果

| 狀態 | 條件 | UI 表現 |
|---|---|---|
| 一致 | archive hash === current hash | 不顯示徽章（保持簡潔）|
| 已變動 | archive 有此 id 但 hash 不同 | 紅色 ⚠ `自 V2.X.Y 起已變動` |
| 新 profile | archive 無此 id（後加入）| 橘色 ＋ `新 profile` |

### 治理鏈現況

```
profile JSON / inline registry
       ↓
       ├── canonicalJSON → cyrb53 → 14-hex 指紋
       │                                 ↓
       │                  buildActiveProfileHashes
       │                                 ↓
       │                  result.meta.code_profiles_hashes  ← V2.4.0
       │                                 ↓
       │                  footer 14-hex 徽章
       │
       └── 比對 PROFILE_HASH_ARCHIVE[最新]   ← V2.4.1 新增
                       ↓
        buildActiveProfileChangelog
                       ↓
        result.meta.code_profiles_changelog
                       ↓
        footer ⚠/＋ 變動徽章（僅變動或新增時）
```

### baseline drift = 0 邏輯

- archive snapshot 與目前 inline registry 完全一致（剛拍攝）
- `buildActiveProfileChangelog({})` 對所有 baseline 案例 anyChanged=false
- 純 meta + UI 增添；calc 結果完全不變

### 後續路線

- **V2.4.2**：archive 異動時於匯出端閘門化（changed=true 自動加「規範變動聲明」附錄）
- **V2.5+**：calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint

### 驗證結果（V2.4.1）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 27 → **32 項** 全通過（5 項 V2.4.1 archive 斷言）
- visual_decoration_test 新增 2 項：changelog_present、no_drift

---

## 第十九輪（V2.4.2）：archive drift 整合至匯出檢查閘門

### 動機

V2.4.1 footer 徽章在預覽中可見，但**匯出後 PDF 中是否會被技師注意到無法保證**。簽證業務應**強制留下書面提醒**：規範變動已被察覺，技師須附說明。V2.4.2 把 archive drift 整合進既有「匯出前檢查」三層閘門，提升至 WARN 等級（觸發確認對話框）。

### 範圍

`v2CollectExportChecklist()` 新增規則 21、22：

| # | 級別 | 觸發 | 文字（節錄）|
|---|---|---|---|
| 21 | WARN | `cl.anyChanged === true` | `規範 profile params 已偏離 archive baseline：<scope>（自 V2.X.Y 起）...` |
| 22 | INFO | `cl.anyNew === true` | `偵測到新 profile：<scope>（<id>）...` |

### 設計選擇

- **WARN 而非 BLOCK**：profile 變動本身合法（規範改版時必發生）；BLOCK 過嚴會阻擋必要簽證。WARN 觸發確認對話框，技師需 acknowledge。
- **僅 anyChanged=true 才觸發**：archive 一致時不顯示，保持 checklist 乾淨。
- **複用既有閘門**：BLOCK/WARN/INFO 三層分區、確認對話框、匯出阻擋邏輯皆既有；新規則無視覺重複。

### 完整 archive 治理鏈

```
profile JSON 變更
       │
       ↓
[1] cyrb53 hash 變動 ──────────── (V2.4.0)
       ↓
[2] buildActiveProfileChangelog 偵測 anyChanged=true ── (V2.4.1)
       ↓
[3a] footer ⚠ 紅色徽章「自 V2.X.Y 起已變動」── (V2.4.1)
       ↓
[3b] 匯出檢查 WARN「建議附規範變動聲明」 ── (V2.4.2 ← 本輪)
       ↓
[4] 確認對話框 → 技師手動 acknowledge
       ↓
[5] PDF/Word/docx 匯出（含書面 archive 比對 meta）
```

### 測試策略：stub 注入

archive 與目前 inline 對齊，無法直接觸發 anyChanged=true。測試方式：

- **stub `window.getCalculationResults`** 注入 fake `code_profiles_changelog`
- 呼叫 `v2CollectExportChecklist(payload, null)`
- 驗證 items 中含 WARN、文字含 `'archive baseline'`
- 還原 stub

此測試有助於日後規範真改變時，確保閘門不被悄悄打破。

### 後續路線

- **V2.5+**：calc_source_hash 與 code_profiles_hashes 整合為單一 governance fingerprint
- **長期**：「規範變動聲明」附錄產生器（archived hash → current hash 自動敘述差異）

### 驗證結果（V2.4.2）

- baseline drift 5/5 = **0%**（純檢查邏輯增添；archive 對齊故無 WARN 觸發）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾（含 V2.4.2 stub 測試）全通過
- Playwright 確認 stub anyChanged=true 後 v2CollectExportChecklist 產出 1 條 WARN

---

## 第二十輪（V2.5.0）：governance fingerprint — 工具 + 規範雙治理面向之合成指紋

### 動機

V2.4.x 完成「規範變動可偵測、可警示、可閘門化」三層。但簽證稽核時若需要**單一字串引用整個 governance 狀態**（工具版本 + 規範版本），技師仍須拼接 `calc_source_hash`（SHA-256 64 字元）與多個 `code_profiles_hashes` 條目。V2.5.0 把兩者合成為單一 `gov:` 指紋。

### 設計

```
calc_source_hash      = SHA-256 of calc-core JS         （V2.0.x，工具面向）
code_profiles_hashes  = cyrb53 per profile params       （V2.4.0，規範面向）
                              ↓ 合成
governance_fingerprint = 'gov:' + cyrb53(
                            calcSourceHash + '|' + canonicalJSON(codeProfilesHashes)
                         )                              （V2.5.0 新）
```

任一面向變動皆會更新此指紋。14 字元 hex，前綴 `gov:`，總長 18 字元；適合 footer 顯示與簽證引用。

### 新 API

| API | 用途 |
|---|---|
| `computeFingerprint(str)` | 對任意字串產 cyrb53 指紋（暴露 helper）|
| `buildGovernanceFingerprint(calcSourceHash, codeProfilesHashes)` | 合成 `gov:` 指紋；缺 calcSourceHash 回 null |

### 6 層治理指紋

| 層 | 指紋 | 變動觸發 | 演算 |
|---|---|---|---|
| 1 | `input_hash` | raw input | SHA-256 |
| 2 | `normalized_input_hash` | schema 後仍變動 | SHA-256 |
| 3 | `result_hash` | 計算結果 | SHA-256 |
| 4 | `calc_source_hash` | calc-core JS | SHA-256 |
| 5 | `code_profiles_hashes` | profile params | cyrb53 per scope |
| 6 | **`governance_fingerprint`** | 4 + 5 任一 | cyrb53 合成 |

### 為何 V2.5.0 不用 SHA-256

合成指紋之 input 已是兩個密碼學等級 hash（calc_source_hash 為 SHA-256），合成階段用 cyrb53 不會降低整體 entropy，且：
- 同步、無 async 機制
- 14 字元 hex 適合做 footer 顯示
- 不是 standalone security primitive，故不需 SHA-256

### 測試策略：雙階段

| 階段 | 環境 | 預期 |
|---|---|---|
| 1 | file://（fetch 失敗）| `__CALC_SOURCE_HASH=null` → fingerprint=null（合理）|
| 2 | stub 注入 | `gov:xxx` 14-hex；footer「治理指紋」列出現 |

### 後續路線

- **V2.5.1**：governance_fingerprint 寫入匯出檔名（如 `_gov-17a81d.docx`）
- **V2.5.2**：governance_fingerprint 寫入 review_summary、cover 末端 footer
- **長期**：「規範變動聲明」附錄產生器（archived hash → current hash 自動敘述）

至此治理鏈完整：6 層指紋涵蓋輸入、過程、結果、工具、規範、合成；任一環節變動皆有可追溯指紋，技師簽證時可引用單一 `gov:` 字串。

### 驗證結果（V2.5.0）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- code-profiles-registry-smoke 由 32 → **35 項** 全通過（3 項 V2.5.0 fingerprint 斷言）
- Playwright 雙階段測試：file:// 階段 fingerprint=null（合理）；stub 階段 `gov:17a81de1da0c4f` + footer 列出現

---

## 第二十一輪（V2.5.1）：governance fingerprint 寫入匯出檔名

### 動機

V2.5.0 把治理指紋寫入 meta 與 footer，但**檔名只含 APP_VERSION + 時間戳**，技師收到一批匯出檔時無法從檔名直接判讀治理狀態。實務上專案資料夾常累積數十份計算書，從檔名快速辨識治理一致性是基本需求。

### 範圍

新增 helper `governanceFingerprintShort()`：取 `gov:` 後 6 字元 → `_gov-xxxxxx`；缺值（file:// 或未啟動 fetch）回空字串。

`exportBaseFilename(kind)` 末尾追加此後綴，所有匯出統一受惠：

| 匯出類型 | 命名來源 | 自動含 `_gov-` |
|---|---|---|
| DOCX 計算書 | `${exportBaseFilename('計算書')}.docx` | ✓ |
| Word .doc | 同上 | ✓ |
| XLSX 案例表 | `exportBaseFilename(...)` | ✓ |
| 檢核摘要 .xls | 直接 ISO date（既有方式）| ✗（既有日期格式保留）|
| CSV 驗算對照 / 變更紀錄 | 直接 ISO date（既有方式）| ✗（既有日期格式保留）|
| 批次試算 CSV | `exportBaseFilename('批次試算')` | ✓ |
| 專案 JSON 存檔 | `exportBaseFilename('專案')` | ✓ |
| 稽核報告 JSON | 同 | ✓ |

僅走 `exportBaseFilename` 的匯出受影響；既有採直接 ISO date 命名的次要 CSV/XLS 保持原狀（避免無意改變既有腳本相容性）。

### 命名範例

```
案名_石材固定計算書_V2.5.1_20260429_0135_gov-17a81d.docx
案名_石材固定專案_V2.5.1_20260429_0135_gov-17a81d.json
案名_石材固定批次試算_V2.5.1_20260429_0135_gov-17a81d.csv
```

### 6 字元 vs 14 字元

| 用途 | 字元 | 理由 |
|---|---|---|
| 檔名末尾 | 6 hex（V2.5.1）| ≈16.7M 種狀態，檔名不過長 |
| meta + footer | 14 hex（V2.5.0）| 完整指紋；技師可在文件內查全 |

兩者互補：檔名快速比對、文件內查全。

### 向下相容

- file:// 環境 → fingerprint=null → 後綴空字串 → 檔名格式不變（舊腳本可解析）
- http:// 環境 → 完整 `_gov-xxxxxx` 後綴

### 後續路線

- **V2.5.2**：fingerprint 寫入 review_summary 與 cover 末端 footer
- **V2.6+**：歷史檔名比對腳本（比較兩份檔名的 `_gov-XXX` 後綴）

### 驗證結果（V2.5.1）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- Playwright 雙階段測試：stub 階段 `_gov-17a81d` 後綴存在；file:// fallback 階段檔名不含 `_gov-`

---

## 第二十二輪（V2.5.2）：governance fingerprint 注入封面與送審速覽

### 動機

V2.5.0/5.1 把指紋寫入 meta、footer、檔名，但**正式報告主體頁面**仍未顯示。封面是技師簽證頁，送審速覽是審查者首見頁；簽證後的 PDF 任一份文件、任一頁皆需可追溯治理狀態。

### 注入位置

| 頁 | 元素 | 樣式 |
|---|---|---|
| 封面 `.cov-page` | `.pg-footer.cov-gov-footer` | 居中淡灰文字（9px / #888）|
| 送審速覽 | `.pg-footer.review-gov-footer` | 右對齊斜體淡灰（9px / #888）|

完整 14 字元 hex（與 V2.5.1 檔名 6-hex 互補：檔名快速比對、文件內查全）。

### 設計選擇：post-render decorator

cover() 與 reviewSummaryPage() 於 render 時序中**可能 `getCalculationResults()` 尚未產出最新 meta**（governance_fingerprint 依賴 `__CALC_SOURCE_HASH` 與 inp.code_profiles）。內聯 `${...}` 寫法會在 cover() 執行時即刻 evaluate helper，可能取到 stale 值。

改採 post-render decorator：

```js
function v2InjectGovernanceFooter(){
  const fpHtml = governanceFingerprintFooterHtml();
  if(!fpHtml) return;  // file:// 無 fingerprint，不注入
  document.querySelector('.cov-gov-footer').innerHTML = fpHtml;
  document.querySelector('.review-gov-footer').innerHTML = fpHtml;
}
```

於 render 完成後（setTimeout 100ms）執行，與既有 v2InjectRegulationFooter / v2InjectActiveParamsOverview / v2InjectProfileDiff 並列。

### V2.5.x 系列收尾總覽

| 版次 | fingerprint 注入位置 |
|---|---|
| V2.5.0 | `result.meta.governance_fingerprint` + 法規 footer 列 |
| V2.5.1 | 匯出檔名 `_gov-XXXXXX`（DOCX/XLSX/CSV/JSON 等 7 類）|
| V2.5.2 | 封面 + 送審速覽末端 |

**完整覆蓋**：meta → 預覽 footer → 檔名 → 封面 → 送審速覽。

### 護欄擴充

visual_decoration_test 新增 V2.5.2 4 項斷言：
- `cover_footer_present` 元素存在
- `cover_has_gov` 含「治理指紋」與「gov:」雙字串
- `review_footer_present` 元素存在
- `review_has_gov` 同含

測試流程：啟用 `review_summary_on` → 等 decorator 100ms setTimeout → 查 DOM → 還原。

### 後續路線

- **V2.6+**：歷史檔名比對腳本（解析 `_gov-XXX` 後綴對照差異）
- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述）

### 驗證結果（V2.5.2）

- baseline drift 5/5 = **0%**
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾全通過
- Playwright 確認 stub 階段封面與送審速覽末端皆含 `治理指紋 gov:17a81de1da0c4f`

---

## 第二十三輪（V2.6.0）：governance fingerprint 檔名比對工具

### 動機

V2.5.x 完成 governance fingerprint 全交付路徑覆蓋（meta / footer / 檔名 / 封面 / 送審速覽），但**事後稽核仍需手動比對檔名後綴**。技師若收到一批 5–10 份匯出檔，肉眼比對 14 字元 hex 易出錯。本輪新增 CLI 工具自動化此流程。

### 工具：`dev_tools/gov_filename_diff.py`

兩種模式：

| 模式 | 用法 | 用途 |
|---|---|---|
| 兩檔比對 | `gov_filename_diff.py f1 f2` | 兩份計算書是否同治理狀態 |
| 資料夾稽核 | `gov_filename_diff.py folder/` | 整個專案目錄一次掃描 |

支援 `--json` 旗標供 CI 整合。

### 設計規則

| 場景 | rc | 觀察 |
|---|---|---|
| 兩檔同 gov | 0 | ✓ 一致 |
| 兩檔不同 gov | 1 | ⚠ 工具或規範變動 |
| 缺後綴 | 1 | ⚠ 舊版本或 file:// 匯出 |
| 資料夾每專案內一致 | 0 | ✓ |
| 單一專案內多種 gov | 1 | ⚠ 同案件治理漂移 |

關鍵設計：**跨專案差異不視為失敗**（不同案件可採不同治理狀態），**同案件多狀態才算 NG**。

### 涵蓋

`SUPPORTED_EXTS = {.docx, .doc, .xlsx, .xls, .csv, .json, .pdf}`，與 V2.5.1 `exportBaseFilename` 對齊。

### 測試 12 cases

| 類別 | cases |
|---|---|
| 單元（parse_gov / parse_proj）| 5 |
| CLI 整合 | 7（含 JSON 輸出、完全一致資料夾、缺後綴、不一致案件）|

`tests/run_all_tests.bat` 由 5 段擴至 **6 段**，CI 由 10 → **11 段**。

### 完整 governance 路徑（V2.5.0 → V2.6.0）

| 階段 | 位置 / 工具 | 版次 |
|---|---|---|
| 計算 | `meta.governance_fingerprint` | V2.5.0 |
| 預覽 | 法規 footer 治理指紋列 | V2.5.0 |
| 檔名 | `_gov-XXXXXX` 後綴 | V2.5.1 |
| 封面 | `.cov-gov-footer` | V2.5.2 |
| 送審速覽 | `.review-gov-footer` | V2.5.2 |
| **稽核** | **gov_filename_diff CLI** | **V2.6.0** |

### 後續路線

- **V2.6.1**：與 `audit_compare.py` 整合（兩份稽核報告 + gov fingerprint 一併比對）
- **長期**：「規範變動聲明」附錄產生器

### 驗證結果（V2.6.0）

- baseline drift 5/5 = **0%**（工具獨立於 calc-core）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + **gov_filename_diff（12 cases）** 全通過

---

## 第二十四輪（V2.6.1）：governance fingerprint 整合至既有稽核工具鏈

### 動機

V2.6.0 補上**檔名級**比對；但既有 `audit_compare.py` 是工程實務上已長期使用的「兩份稽核 JSON 比對」工具。它已能比較交付品質、未通過數、控制 DCR 等指標，但**完全不知道規範或工具是否變動過**。本輪把 governance fingerprint 整合進去，使 audit_compare 同時呈現「品質指標 + 治理狀態」雙面向。

### 三點整合

| 環節 | 修改 |
|---|---|
| `server.py` `write_export_audit()` | `trace` 區段新增 `governance_fingerprint` / `calc_source_hash` / `code_profiles_hashes` |
| `audit_compare.py` `extract_metrics()` | 從 `trace` 讀取三欄到 metrics dict |
| `audit_compare.py` `compare_metrics()` | 新增 `governance_fingerprint` diff entry（含 changed bool 與 per-scope profile hash 變動詳情）|
| `audit_compare.py` `render_text()` | 變動時印出 `calc_source_hash 已變動` + per scope profile 變動 |

### 設計原則：fingerprint 變動 ≠ 品質退步

`regression_reasons()` **不**把 fingerprint 變動列入 regression 觸發條件。理由：

- profile / 規範改版時 fingerprint 必然變動，是合法狀態
- `--fail-on-regression` 應只阻擋品質惡化（grade 降級、未通過數增加、DCR 上升等）
- governance 漂移以 ⚠ CHANGED 標示，技師需檢視原因但不阻擋 CI

這保留既有 fail-on-regression 閘門語意，新增維度只做透明性。

### 護欄擴充

| 測試 | cases |
|---|---|
| 既有 audit_compare_test | 9 |
| V2.6.1 新增 | 2（same / changed）|
| **小計** | **11** |

實測通過：所有 11 cases 全綠燈。

### V2.6.x 完整：指紋從交付鏈延伸至審查鏈

```
[V2.5.0–2 交付鏈]              [V2.6.0–1 審查鏈]
  meta ─┐                        ┌─ 檔名比對 (gov_filename_diff)
  footer ┤                       │
  檔名 ──┼─ governance ──────────┼─ 稽核 JSON 比對 (audit_compare)
  封面 ──┤   fingerprint         │
  送審速覽┘                       └─（未來：規範變動聲明附錄）
```

簽證後的工程實務全循環閉環：從生成 → 顯示 → 寫入 → 比對 → 警示。

### 後續路線

- **長期**：「規範變動聲明」附錄產生器（archived → current 自動敘述差異，並嵌入 .docx）
- **可能 V2.7+**：fingerprint 寫入 reviewSummaryData 結構化欄位，技師於送審速覽手動 ack

### 驗證結果（V2.6.1）

- baseline drift 5/5 = **0%**（純稽核 metadata 擴充；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ **audit_compare（11，含 V2.6.1 新增 2）** 全通過

---

## 第二十五輪（V2.7.0）：規範採用聲明（governance 從機讀延伸到人讀）

### 動機

V2.5.x 把指紋寫入 5 個位置、V2.6.x 整合至兩個審查工具，但**全部都是機讀**：

- meta JSON 物件
- footer 文字
- 檔名後綴
- audit JSON

技師簽證時若採用非預設 profile 或 archive 已漂移，**正式計算書內仍需文字敘述採用理由**。V2.7.0 補上首個技師簽證面向之**人讀輸出**。

### 兩個函式

| 函式 | 用途 |
|---|---|
| `regulationChangeDeclaration(inp)` | 偵測 + 結構化資料；回 null（無事）或 `{overrides[], drifts[]}` |
| `regulationChangeDeclarationHtml(inp)` | 把結構渲染為 HTML 區塊；空時回空字串 |

### 觸發條件（任一）

| 類別 | 條件 | 寫入區塊 |
|---|---|---|
| override | active profile id ≠ DEFAULT_ACTIVE | 「採用之非預設 profile」清單 |
| drift | `anyChanged === true` | 「profile params 自最近 archive 起已變動」清單 |

兩類皆無時聲明區塊**不顯示**（避免 UI 噪音）。

### 顯示位置

`reviewSummaryPage()` 之「設計依據」表格之後、calc-note 之前。

送審速覽本身為 opt-in（V2.x 既有設計）；勾選後此聲明才顯示。

### 視覺設計

暖黃配色（與 V2.2.4 profile diff viewer 一致）：
- 邊框 `#e8c87a`
- 背景 `#fffaef`
- 標題 `📜 規範採用聲明（自動產生）` 字色 `#7a5210`
- 末尾深色提示框告知技師需補充工程判斷

### governance 完整路徑（機讀 + 人讀）

```
[機讀]                           [人讀]
V2.4.0 hash → meta                V2.7.0 規範採用聲明
V2.4.1 archive 比對                 ├─ overrides 列表
V2.4.2 匯出 WARN 閘門               ├─ drifts 列表
V2.5.x 5 位置寫入指紋                └─ 採用理由提示文字
V2.6.x gov_filename_diff +
       audit_compare 整合
                       ↓
        技師看送審速覽即可完成
        「治理狀態審視 + 工程判斷」
```

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.0 兩階段測試：

- **有 override**：localStorage 設 seismic override → 4 項 DOM 文字斷言（present、has_overrides、has_seismic_label、has_conservative_id）
- **無 override**：清掉後 present 應為 False

### 後續路線

- **V2.7.1**：data-needs-ack 標記 + 匯出檢查 WARN（採非預設但 inp.governance_ack 為空）
- **V2.7.2**：聲明同時嵌入 docx 匯出
- **長期**：技師可於 UI 編輯聲明文字

### 驗證結果（V2.7.0）

- baseline drift 5/5 = **0%**（純 UI；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（11）全通過
- Playwright 兩階段測試：override 階段 4 項斷言通過；無 override 階段 present=False

---

## 第二十六輪（V2.7.1）：governance_ack 補述閘門化

### 動機

V2.7.0 自動敘述只說「此情況存在」，但簽證實務上若**僅有自動敘述、缺技師工程判斷文字**，責任歸屬模糊。技師簽證計算書應同時包含：
1. 系統客觀偵測之事實（V2.7.0）
2. 技師主觀工程判斷之文字記錄（V2.7.1 ← 本輪）

### 三點配套

| 配套 | 內容 |
|---|---|
| **UI** | ①封面資訊 區新增 `governance_ack` textarea，含具體 placeholder 引導 |
| **匯出 WARN** | 偵測 override/drift AND ack 為空 → WARN（不阻擋但需 acknowledge）|
| **聲明區雙態切換** | 空 → 暖黃 + `data-needs-ack="true"`；已填 → 綠色「技師補充採用理由」段落 |

### 設計選擇

- **WARN 而非 BLOCK**：技師可能正在編輯，過嚴的 BLOCK 會阻擋修正流程
- **`data-needs-ack` 標記**：DOM 屬性供測試與未來擴充識別「需技師處理」項目
- **綠色 vs 暖黃**：分別代表「已處置」與「待處置」，配色與 V2.2.x governance 三色階一致

### 完整 governance acknowledgment 路徑

```
profile 改動或切換對照
       ↓
[1] regulationChangeDeclaration 偵測 override / drift     (V2.7.0)
       ↓
[2] 送審速覽顯示自動敘述                                  (V2.7.0)
       ↓
[3] 技師檢視；若採非預設則必填 governance_ack             (V2.7.1)
       ↓
[4] 匯出檢查：ack 空 → WARN                                (V2.7.1)
       ↓
[5] 送審速覽改顯示綠色「技師補充採用理由」段落             (V2.7.1)
       ↓
[6] 技師簽證計算書留下完整：自動偵測 + 工程判斷文字記錄
```

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.1 兩階段測試：

| 階段 | 條件 | 預期 |
|---|---|---|
| 1 | override 在效力 + ack 空 | `ack_warn_count >= 1` + `data-needs-ack="true"` 元素存在 |
| 2 | override 在效力 + 填 ack | `ack_warn_count === 0` + DOM 含「技師補充採用理由」 |

### 後續路線

- **V2.7.2**：聲明同時嵌入 docx 匯出
- **長期**：`governance_ack` 文字寫入 result.meta 並 hash，作為簽證原文防偽

### 驗證結果（V2.7.1）

- baseline drift 5/5 = **0%**（純 UI + 檢查邏輯）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（11）全通過
- Playwright 兩階段：empty 階段 warn=1 + needs_ack=true；filled 階段 warn=0 + reason 段落存在

---

## 第二十七輪（V2.7.2）：規範採用聲明嵌入 docx 匯出

### 動機

V2.7.0/7.1 完成 HTML 預覽與列印 PDF 之聲明顯示。但 V2 工具支援 **3 種主要交付格式**：HTML（預覽 + 列印 PDF）、相容 Word .doc、直接 .docx（docx.js 程式組裝）。後者完全獨立的渲染管道，須個別補上聲明。

### 範圍

新增 helper：

```js
function docxRegulationDeclarationChildren(inp){
  if (無觸發) return [];
  return [
    docxSectionTitle('規範採用聲明（自動產生）'),
    docxNote('採用之非預設 profile：'),
    docxTable([...overrides...]),
    docxNote('profile params 自最近 archive 起已變動：'),
    docxTable([...drifts...]),
    docxNote('技師補充採用理由：') 或 缺漏提示,
    docxParagraph(ackText) 或 docxNote(警告),
  ];
}
```

於 `buildDocxReviewSummarySection()` 之「設計依據」區塊之後直接 `...spread`。

### 完整 V2.7.x 系列收尾

| 版次 | 交付物 | 路徑 |
|---|---|---|
| V2.7.0 | 自動偵測 + 送審速覽 HTML 區塊 | 預覽 + 列印 PDF |
| V2.7.1 | governance_ack UI + 匯出 WARN + 雙態切換 | UI + 檢查 |
| V2.7.2 | docx 匯出 helper + 注入 review summary | 直接 docx |

V2.7.x「治理聲明全交付管道覆蓋」完成：

```
聲明資料源 (regulationChangeDeclaration)
       ↓
   ┌───┴───┬────────┬─────────┐
   ↓       ↓        ↓         ↓
HTML 預覽  列印 PDF  相容 .doc  直接 .docx
(V2.7.0)   (V2.7.0)  (沿用 HTML) (V2.7.2)
```

### 護欄擴充

`tests/visual_decoration_test.py` 新增 V2.7.2 兩階段測試：

- override + ack 階段：`docxRegulationDeclarationChildren(inputs())` 回 `>= 4` children
- 無 override + 空 ack 階段：回 `length === 0`

實測：override+ack 回 5 children；無觸發回 0。

### 後續路線

- **長期**：`governance_ack` 寫入 result.meta 並 hash（防止匯出後文字竄改）
- **可能 V2.8+**：聲明本身 hash 鏈（archive ↔ current ↔ ack 三方雜湊綁定）

### 驗證結果（V2.7.2）

- baseline drift 5/5 = **0%**（純匯出邏輯擴充）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（11）全通過

---

## 第二十八輪（V2.8.0）：governance ack 三方雜湊

### 動機

V2.7.x 完成自動偵測 + UI + 全交付管道覆蓋；但**聲明文字本身仍可在匯出後被竄改**，且機讀層面缺少防偽憑證。技師簽證後若 .docx 文字被編輯：
- HTML 預覽看不到（已交付的 docx）
- footer 指紋（V2.5.0）反映的是「工具+規範」，不含 ack
- audit_compare 缺乏比較軸

V2.8.0 補上 ack 雜湊，使 ack 文字成為 governance 鏈一部分。

### 三方雜湊組成

```
ack_hash = 'ack:' + cyrb53(canonicalJSON({
  overrides: [{scope, id}, ...],     // 採用之非預設 profile（排序）
  drifts:    [{scope, id, archiveHash, currentHash}, ...],  // archive 漂移
  ackText:   trim(inp.governance_ack)
}))
```

任一方變動 → ack_hash 變。

### 為何「三方」而非「ack 單獨 hash」

如果只 hash ack 文字，技師可能不修改文字但切換 profile（達成不同治理意圖卻使用相同說明）。三方綁定確保：
- 同 ack 文字 + 不同 profile → 不同 hash（防止文字重用）
- 同 profile + 編輯 ack → 不同 hash（防止文字竄改）
- 完全相同 → 相同 hash（重複計算可重現）

### 5 個整合點

| 點 | 修改 |
|---|---|
| `code-profiles-registry.spec.js` | 新增 `buildGovernanceAckHash(inp)` |
| HTML `getCalculationResults().meta` | 寫入 `governance_ack` + `governance_ack_hash` |
| 法規 footer | 新增第 6 列「聲明指紋」 |
| `server.py write_export_audit()` | `trace` 區新增 `governance_ack` + `governance_ack_hash` |
| `audit_compare.py` | extract + compare + render；新增 `text_changed` / `hash_changed` 比對 |

### 治理指紋升至 7 層

| 層 | 指紋 | 觸發 |
|---|---|---|
| 1 | `input_hash` | raw input |
| 2 | `normalized_input_hash` | schema |
| 3 | `result_hash` | 計算結果 |
| 4 | `calc_source_hash` | calc-core JS |
| 5 | `code_profiles_hashes` | profile params |
| 6 | `governance_fingerprint` | 工具+規範合成 |
| 7 | **`governance_ack_hash`** | override+drift+ack 三方 |

### 護欄擴充

| 測試 | 新增 | 累計 |
|---|---|---|
| code-profiles-registry-smoke | 5 項 | 35 → **40** |
| visual_decoration_test | 3 項 | 持續累積 |
| audit_compare_test | 2 項 | 11 → **13** |

### 後續路線

- **V2.8.1**：歷史 ack_hash 序列保留（多次編輯 ack 之演變紀錄）
- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part）

### 驗證結果（V2.8.0）

- baseline drift 5/5 = **0%**（meta 新欄位不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- 實測 ack hash：override + 「V2.8.0 測試用採用理由」→ `ack:1cb66887073ea7`；兩次計算一致

---

## 第二十九輪（V2.8.1）：ack_hash 歷史序列保留

### 動機

V2.8.0 上線 ack 三方雜湊作為防偽憑證；但**單一 hash 只反映「當下狀態」**，技師簽證實務上通常多次調整 ack 文字，governance 應追溯演變過程。V2.8.1 補上歷史序列。

### 設計

per-project localStorage（key `stone_v2_ack_hash_history`）：

```jsonc
{
  "案A": [
    { "ts": "...", "ack_hash": "ack:aaa", "ack_snippet": "...", "overrides_count": 1, "drifts_count": 0 },
    ...
  ]
}
```

每筆含時間戳、hash、50 字內文字片段、override/drift 計數；上限 50 筆 per-project（`shift()` 滾動）。

### 5 個 helper

| API | 用途 |
|---|---|
| `_loadAckHashHistoryAll()` / `_saveAckHashHistoryAll()` | 內部 |
| `getAckHashHistory(projName)` | 取單一專案序列 |
| `recordAckHashHistory(...)` | 同 hash 不重複；上限 50 |
| `clearAckHashHistory(projName?)` | 清除 |

### 自動記錄機制

`v2RecordAckHashHistoryIfNew()` 接入既有 render 後 decorator 鏈，於 v2InjectGovernanceFooter 之後執行：

```js
v2InjectRegulationFooter();
v2InjectActiveParamsOverview();
v2InjectProfileDiff();
v2InjectGovernanceFooter();
v2RecordAckHashHistoryIfNew();  // ← V2.8.1 新增
```

每次 render 後讀取最新 ack_hash；與最後一筆不同 → append。同 hash 自動 dedupe，避免 render 多次造成重複。

### 「ack 編輯演變」徽章

`regulationChangeDeclarationHtml()` 末尾追加：

| 條件 | 顯示 |
|---|---|
| history.length < 2 | 不顯示 |
| history.length >= 2 | 灰藍徽章：`📊 ack 編輯演變：N 次` + `data-history-count="N"` |

灰藍配色（#4a6c8d / #eef2f7）與其他 governance 區塊區隔（綠/暖黃/橘）。

### 完整 governance ack 演進路徑

```
[V2.7.0] 自動偵測 ─→ HTML 區塊
     ↓
[V2.7.1] UI textarea ─→ 匯出 WARN ─→ 雙態切換
     ↓
[V2.7.2] docx 匯出嵌入
     ↓
[V2.8.0] 三方雜湊（archive + current + ack 文字）
     ↓
[V2.8.1] 歷史序列保留（演變紀錄）  ← 本輪
```

### 護欄擴充

visual_decoration_test 新增 V2.8.1 測試：模擬技師三次編輯 ack（理由 A→B→C），驗證 history.length=3 + distinct_hashes=3 + badge_count=3。

實測：3 次編輯後序列正確，徽章正確顯示。

### 後續路線

- **V2.8.2**：ack 演變徽章可展開明細（時間戳 / hash / 文字片段表格）
- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part）

### 驗證結果（V2.8.1）

- baseline drift 5/5 = **0%**（純 localStorage + UI；不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- Playwright 三次編輯場景：history.length=3, distinct_hashes=3, badge_count=3

---

## 第三十輪（V2.8.2）：ack 演變徽章升級為可展開明細表格

### 動機

V2.8.1 徽章僅顯示「次數 + 起訖日期 + 最近 hash」。技師詳查演變細節需手動讀 localStorage。V2.8.2 把徽章升級為 `<details>` 可展開元件，內含 5 欄完整明細表格。

### 5 欄結構

| 欄 | 來源 | 顯示 |
|---|---|---|
| `#` | 索引 | 1, 2, 3, ... |
| 時間（UTC） | `h.ts` | ISO 8601 秒級 |
| `ack_hash` | `h.ack_hash` | `ack:` + 14 hex |
| 文字片段（前 50 字）| `h.ack_snippet` | V2.8.1 已存 |
| `ov/dr` | `h.overrides_count / h.drifts_count` | 例 `1/0` |

### 視覺

- `<thead>` 灰藍背景 (#dde5ee)；`<tbody>` 列以虛線分隔
- summary 同 V2.8.1（次數 + 起訖 + 最近 hash 摘要）
- 底部義式註腳：localStorage 位置與 50 筆上限說明
- 列印時 `<details>` 元素仍存在；後續可由 print CSS 強制展開

### V2.8.x 視覺演進

| 版次 | 視覺 |
|---|---|
| V2.8.0 | footer 單一 hash 文字 |
| V2.8.1 | 一行徽章（次數 + 日期 + 最近 hash）|
| V2.8.2 | 可展開 `<details>` + 5 欄明細表格 |

### 護欄擴充

visual_decoration_test V2.8.1 測試擴增 V2.8.2 斷言：

- `badge_is_details === true`：升級為 `<details>` 元素
- `table_rows === 3`：3 列對應 3 次編輯
- `header_count === 5`：5 欄表頭

### 後續路線

- **V2.8.3（候選）**：增加「比較任兩列 ack 文字差異」按鈕（產生 unified diff）
- **長期**：ack_hash 寫入 docx 內隱藏屬性（custom XML part）

### 驗證結果（V2.8.2）

- baseline drift 5/5 = **0%**（純 UI 升級）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- Playwright：is_details=True, rows=3, headers=5

---

## 第三十一輪（V2.8.3）：ack 演變 A/B 任選比對 + LCS-based unified diff

### 動機

V2.8.2 把 history 表格完整呈現，但技師對照不同版本仍需手動逐字比對。V2.8.3 上線 A/B 標記按鈕 + 自實作 LCS line-based unified diff。

### 三點配套

| 環節 | 內容 |
|---|---|
| 全文存檔 | `recordAckHashHistory` 新增 `ack_text` 欄位（2000 字上限）|
| Diff 演算 | `v2LineDiff(old, new)` 自實作 ~30 行 LCS DP + 回溯，回 `[{tag, text}]` |
| UI 互動 | 6 欄表格新增「比較」欄；每列含 A/B 小按鈕；點選後高亮 + 渲染 diff panel |

### LCS Diff 設計選擇

| 選項 | 為何不採 |
|---|---|
| 引入第三方 lib（diff-match-patch / jsdiff）| 工具堅持單檔 HTML 無 npm 依賴 |
| 字元級 diff | 中文字元級 diff 視覺雜亂；line-level 對短段文字最合適 |
| Myers diff | 較複雜；LCS DP 對 < 100 行夠用 |

採 LCS DP（O(m·n) 時間 + 回溯）：簡潔 ~30 行；deterministic；與既有 cyrb53 / canonicalJSON 風格一致。

### V2.8.x 視覺最終形態

| 版次 | 視覺 |
|---|---|
| V2.8.0 | meta + footer 單一 hash |
| V2.8.1 | 一行徽章 |
| V2.8.2 | `<details>` + 5 欄表格 |
| V2.8.3 | 6 欄表格 + A/B 按鈕 + LCS diff panel |

### 護欄擴充

visual_decoration_test V2.8.3 測試：programmatic 點擊 row 0 A + row 2 B；驗證：
- diff_content_present
- has_minus_line（紅色 - 行）
- has_plus_line（綠色 + 行）
- row A/B 高亮 class 正確
- 表頭由 5 欄升至 6 欄

### 後續路線

- **長期**：ack_hash 寫入 docx 內隱藏屬性
- **可能 V2.9+**：governance 一致性 dashboard（單頁總覽）

### 驗證結果（V2.8.3）

- baseline drift 5/5 = **0%**（純 UI 互動）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- Playwright：點擊 A/B 後 diff 內容含預期紅綠行；A/B 列高亮 class 套用正確

---

## 第三十二輪（V2.9.0）：治理一致性 dashboard

### 動機

V2.4.x ~ V2.8.x 累積大量治理欄位，但**散落於計算書不同位置**：
- 法規 footer 6 列（指紋、ack hash、規範自檢...）
- 規範參數總覽（5 scope × 53 params）
- profile diff viewer
- 規範採用聲明（送審速覽）
- ack 演變表格

技師簽證前若要快速確認治理狀態，需在多處查找。V2.9.0 把所有狀態整合為**單頁總覽**。

### 4 區塊結構

| # | 區塊 | 來源 |
|---|---|---|
| ① | 治理指紋 | meta.calc_source_hash, meta.governance_fingerprint, meta.code_profiles_hashes |
| ② | profile 驗證 | validateAllProfiles + auditProfileAgainstConsts |
| ③ | archive 漂移 | meta.code_profiles_changelog |
| ④ | ack 狀態 | meta.governance_ack + meta.governance_ack_hash + getAckHashHistory |

### Status Pill

每項目用 ✓ 綠 / ⚠ 橘 兩態表達。整體 pill 取所有項目 AND：

```
allOk = calcOk && schemaOk && consistOk && archiveOk && ackOk
```

### V2.4–V2.9 治理鏈完整成果

| 系列 | 主題 | 關鍵交付 |
|---|---|---|
| V2.4.x | profile hash + archive | hash + 比對 + 匯出閘門 |
| V2.5.x | governance fingerprint | meta + footer + 檔名 + 封面 + 送審速覽 |
| V2.6.x | 整合既有審查工具 | gov_filename_diff + audit_compare |
| V2.7.x | 規範採用聲明 | UI + 自動偵測 + ack + docx |
| V2.8.x | ack 防偽鏈 | 三方 hash + 歷史 + 表格 + diff |
| **V2.9.0** | **總覽 dashboard** | 單頁 4 區塊整合 |

### 設計選擇：dashboard 在哪一頁

| 選項 | 為何不採 |
|---|---|
| 送審速覽頁 | 該頁 opt-in；無勾選時 dashboard 也消失，不利日常 governance 檢視 |
| 主預覽頂端 | 切斷既有「目錄 → 主文 → 附件」流程 |
| 獨立新頁 | 增加列印頁數負擔 |
| **末端與 footer 並列**（採用） | 不打擾主流程；展開後一目了然；列印可選擇是否展開 |

### 護欄擴充

visual_decoration_test V2.9.0 測試：

- `present`：注入成功
- `data-overall-ok`：屬性可讀
- 4 區塊文字內容存在
- `fingerprint_table_rows >= 5`

### 後續路線

- **V2.9.1**：dashboard「一鍵複製為純文字」按鈕（電子郵件附帶治理摘要）
- **V3.0**：StoneGovernanceProtocol — 標準化治理鏈 spec 供其他工具沿用

### 驗證結果（V2.9.0）

- baseline drift 5/5 = **0%**（純 UI 整合）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- Playwright：4 區塊全注入；fingerprint_table_rows=5；overall_ok=true

---

## 第三十三輪（V2.9.1）：dashboard「複製為純文字」按鈕

### 動機

V2.9.0 把治理狀態整合於 HTML dashboard，但**HTML 介面只能在工具內查看**。技師若要把治理狀態貼至：
- 審查信件
- 電子郵件正文
- 即時通訊（Slack、LINE 等）
- 純文字審查記錄

需要純文字版本。V2.9.1 上線一鍵複製。

### 純文字格式設計

固定 60 字元寬、4 區塊對應 dashboard 結構：

```
治理一致性總覽（V2.9.1 / ts）
============================================================
整體狀態：✓ 治理狀態正常

① 治理指紋
  - calc_source_hash: ...
  - governance_fingerprint: ...
  - 各 scope params hash 表

② profile 驗證
③ archive 漂移
④ ack 狀態
────────────────────────────────────────────────────────────
（本摘要由石材計算書產生器 V2 自動生成）
```

設計選擇：純 ASCII + 圈號 + 必要中文標點；不用 Unicode 樣式字型，確保所有純文字介面相容。

### 兩個新 helper

| API | 用途 |
|---|---|
| `buildGovernanceTextSummary()` | 與 HTML 版邏輯同源；同樣讀 meta.* / SP API / localStorage |
| `v2CopyGovernanceTextSummary(btn)` | 寫剪貼簿 + 按鈕 flash 回饋 |

### Clipboard 雙路寫入

```
primary：navigator.clipboard.writeText（modern Async Clipboard API）
fallback：textarea + document.execCommand('copy')（舊瀏覽器 / file:// 限制）
```

兩路徑皆寫入 `window.__v2LastCopiedText` 供測試驗證；按鈕 1.8s 內顯示「✓ 已複製」回饋。

### 護欄擴充

visual_decoration_test V2.9.1 測試：

- 按鈕注入存在
- text_length >= 200（合理摘要長度）
- 4 區塊文字皆出現
- 點擊後 `__v2LastCopiedText` 確實填入

實測：text_len=924, 4 區塊全有, copy_attempted=True。

### V2.9.x 系列完整

| 版次 | 形式 | 適用場景 |
|---|---|---|
| V2.9.0 | HTML dashboard | 工具內查看 |
| V2.9.1 | 純文字 + 剪貼簿 | 信件 / 郵件 / 通訊 |

技師不論用哪一種介面審查治理狀態，皆有對應形式可用。

### 後續路線

- **V3.0**：StoneGovernanceProtocol spec 文件
- **長期**：ack_hash 寫入 docx 內隱藏屬性

### 驗證結果（V2.9.1）

- baseline drift 5/5 = **0%**（純 UI + clipboard）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- Playwright：button_present=True, text_length=924, 4 區塊全有, copy_attempted=True

---

## 第三十四輪（V3.0.0）：StoneGovernanceProtocol v1.0 規格化（major version bump）

### 動機

V2.4.0 ~ V2.9.1 共 33 輪迭代累積完整治理鏈，但**散落於 architecture.md 數十輪紀錄與 CHANGELOG**。技師若想引用這套設計於他種工程計算工具（鋼結構、基礎、組合柱...），需要**獨立可閱讀的 spec 文件**，而不是逐輪研讀演進史。

V3.0.0 把治理鏈正式 spec 化為 `StoneGovernanceProtocol v1.0`。

### 為何是 V3.0.0 而非 V2.9.2

| 觀點 | 說明 |
|---|---|
| V2.x | 石材計算書產生器**特定工具**之內部演進 |
| V3.0.0 | 把治理鏈**標準化為跨工具規格**，本工具是其中一個 reference implementation |

semver major bump 反映此 conceptual shift：從「工具自我演進」轉向「規格與實作分離」。

### Spec 文件結構

`dev_tools/StoneGovernanceProtocol-v1.0.md` 共 14 章：

1. 目的（4 個治理目標）
2. 治理鏈四維度（D1 工具 / D2 規範 / D3 一致性 / D4 申明）
3. result.meta JSON schema
4. Hash 演算法（SHA-256 / cyrb53 / canonicalJSON）
5. trigger 條件
6. 7 個整合點
7. 視覺規範（5 配色語意 + 印刷規則）
8. dashboard 結構
9. 純文字摘要規範
10. 護欄要求
11. 版本相容性（1.0.x only-add）
12. 實作參考（5 個關鍵檔案）
13. protocol 變更紀錄
14. 治理連結

### 三點配套

| 配套 | 內容 |
|---|---|
| 版本常數 | `STONE_GOVERNANCE_PROTOCOL_VERSION = '1.0.0'` 於 registry |
| API 暴露 | `Reg.GOVERNANCE_PROTOCOL_VERSION` |
| meta 寫入 | `result.meta.governance_protocol_version = '1.0.0'` |

跨工具 / 跨版本比對時可確認治理欄位 schema 相容性。

### V2.x 完整 33 輪迭代回顧

| 系列 | 範圍 | 主題 |
|---|---|---|
| V2.0.x | – | 工具初版（calc-core 抽取 + formula registry + input schema）|
| V2.1.x | 4 版 | 強度層 profile 化（30 個係數）|
| V2.2.x | 5 版 | profile UI 化 |
| V2.3.0 | 1 版 | 構造層 profile 化 |
| V2.4.x | 3 版 | hash + archive + 匯出閘門 |
| V2.5.x | 3 版 | governance fingerprint 5 位置 |
| V2.6.x | 2 版 | 整合既有審查工具 |
| V2.7.x | 3 版 | 規範採用聲明 |
| V2.8.x | 4 版 | ack 防偽鏈 |
| V2.9.x | 2 版 | 治理 dashboard |
| **V3.0.0** | **本版** | **StoneGovernanceProtocol v1.0 spec 化** |

### 後續路線

- **V3.0.x**：實作參考工具更新（保持 protocol 1.0.x 相容）
- **V3.1+**：擴充 protocol（only-add 規則）
- **長期**：其他工程計算工具實作 protocol 1.0；ack_hash 寫入 docx custom XML

### 驗證結果（V3.0.0）

- baseline drift 5/5 = **0%**（meta 新欄位不影響 calc）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- code-profiles-registry-smoke 由 40 → **41 項** 全通過
- Playwright：governance_protocol_version='1.0.0' 寫入 meta

---

## 第三十五輪（V3.0.1）：StoneGovernanceProtocol 規格驗證器

### 動機

V3.0.0 上線了 spec 文件，但**spec 必須有自動驗證機制才有約束力**。否則：
- 實作者可能漏寫某欄位，spec 文件無法察覺
- 跨工具互通時無法快速確認對方是否合規
- 未來 protocol 演進時無基準比對

V3.0.1 把 spec 9 項合規條款轉化為可執行驗證器。

### 9 項檢查對應 spec 章節

| # | 檢查 | spec § |
|---|---|---|
| 1 | protocol_version 存在且為 1.0.x | § 11 |
| 2 | SHA-256 欄位格式 | § 4.1 |
| 3 | calc_source_hash 格式 | § 4.1 / § 5.2 |
| 4 | code_profiles + code_profiles_hashes 結構 | § 3 / § 4.2 |
| 5 | governance_fingerprint 格式 | § 4.2 |
| 6 | governance_ack_hash 格式 | § 4.2 |
| 7 | code_profiles_changelog 結構 | § 3 |
| 8 | 邏輯一致：fingerprint ↔ calc_source_hash | § 5.2 |
| 9 | 邏輯一致：ack 文字 ↔ hash | § 3 |

### V3.0.0 ↔ V3.0.1 對比

| 版次 | 內容 |
|---|---|
| V3.0.0 | spec 文件（人讀規範）+ 版本常數 |
| V3.0.1 | 驗證器（機讀執行）+ dashboard 合規徽章 |

spec 由「規格文件」推進到「自動執行的護欄」。

### Dashboard 視覺整合

```
🏛 治理一致性總覽 [✓ 治理狀態正常] [✓ protocol 1.0.0 compliant]
```

兩個 pill：左邊「治理狀態」（V2.9.0 已有，反映 4 區塊綜合）；右邊「protocol 合規」（V3.0.1 新，反映 9 項格式檢查）。技師可同時看到「我這次計算結果是否正常」與「這份報告是否符合 protocol 規格」。

### 後續路線

- **V3.0.2**：audit_compare CLI 整合 protocol 合規檢查
- **V3.1**：擴充 protocol（only-add；如 D5 第五維度）
- **長期**：其他工程計算工具實作 protocol 1.0

### 驗證結果（V3.0.1）

- baseline drift 5/5 = **0%**（純驗證邏輯 + UI）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（13）全通過
- code-profiles-registry-smoke 由 41 → **47 項** 全通過（6 項 V3.0.1 驗證器斷言）
- Playwright：dashboard 顯示 `✓ protocol 1.0.0 compliant`，protocol_badge_ok=true

---

## 第三十六輪（V3.0.2）：protocol 驗證器移植至 Python CLI

### 動機

V3.0.1 把驗證器寫入 JS registry 與 dashboard，但 audit_compare（Python CLI 工具）此時仍**不知 protocol 概念**。技師若以 audit_compare 比對兩份報告，可能其中一份不合規卻無人察覺。

V3.0.2 把驗證邏輯**對等移植至 Python**，並新增 CLI 閘門。

### 三點整合

| 整合 | 內容 |
|---|---|
| Python `validate_governance_meta()` | 與 JS `validateGovernanceMeta()` 邏輯對等（9 項檢查）|
| `server.py` audit JSON | tool/trace 區段新增 `governance_protocol_version`；trace 鏡射 normalized_input_hash / result_hash |
| `audit_compare.py` 整合 | extract + compare + render_text 三向擴增 |
| `--strict-protocol` flag | 任一報告不合規 → exit 3 |

### Exit code 語意

| code | 條件 |
|---|---|
| 0 | 全綠燈 |
| 2 | `--fail-on-regression` + 品質退步 |
| 3 | `--strict-protocol` + 任一不合規（新）|

strict-protocol 優先（exit 3 > exit 2）；CI 系統可同時加兩 flag。

### V3.0.x 演進

| 版次 | 涵蓋介面 |
|---|---|
| V3.0.0 | spec 文件（人讀規範）|
| V3.0.1 | JS 驗證器 + dashboard 徽章（HTML 端）|
| **V3.0.2** | **Python 驗證器 + CLI 閘門（CLI 端）** |

protocol 規格現於 JS（前端）與 Python（CLI 稽核）**雙端皆可機械強制**。

### 雙端維護要求

當 protocol 演進時（如新增第 10 項檢查），兩處須同步：

| 檔案 | 函式 |
|---|---|
| `js/code-profiles-registry.spec.js` | `validateGovernanceMeta(meta)` |
| `audit_compare.py` | `validate_governance_meta(meta)` |

兩端皆有 smoke / unittest 護欄；任一端漏改會被測試覆蓋偵測。

### 後續路線

- **V3.1+**：擴充 protocol（only-add；如 D5 維度）
- **長期**：其他工程計算工具實作 protocol 1.0

### 驗證結果（V3.0.2）

- baseline drift 5/5 = **0%**（純稽核 metadata + CLI 邏輯）
- 6 套 Node smoke + 語法 + autoword + 視覺裝飾 + gov_filename_diff（12）+ audit_compare（**13 → 19 項**）全通過
- 19 項 audit_compare 包含 V3.0.2 新增 6 項：合規 / 不支援版本 / 邏輯違反 / strict-protocol exit 3 / strict-protocol exit 0 / render_text 含 protocol 字樣
