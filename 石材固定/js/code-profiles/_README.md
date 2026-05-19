# Code Profiles — 規範參數 JSON 倉庫

## 設計目的

過去 V2 內所有規範相關係數（如 `Fph = 1.6 × SDS × Ip × Wp` 的「1.6」上限式、ψc,V = 1.4、Rp = 2.5 等）都散落於 `js/calculator.spec.js`。
規範改版時（如耐震規範 113 → 115），技師需 grep 散落代碼一一檢視。

本目錄將每份規範的關鍵參數抽出為**獨立 JSON profile**，達到：

1. **法規版本綁定**：每份計算書記錄當時引用的 profile id 與雜湊
2. **追溯性**：舊案載入時自動沿用拍攝當時的 profile，不會被新版規範意外覆寫
3. **可維護性**：規範改版時改一個 JSON，calc-core 不變
4. **可比對**：同案在不同 profile 下的 DCR 差異可量化分析

## Phase 進度（截至 V2.1.0）

| Phase | 內容 | 狀態 |
|---|---|---|
| **1** | 建立目錄結構、定義 5 份初始 profile JSON、註冊到 `js/code-profiles-registry.spec.js`、寫入 `getCalculationResults().meta.code_profiles` 與法規 footer | ✅ 本版本 |
| **2** | calc-core 真正消費 profile（取代散落的 hardcoded 數值），實作 profile-aware 計算分支 | ⏳ 計畫中 |
| **3** | UI 加入 profile 切換器，並支援「以舊 profile 重算」模式以驗證新舊規範差異 | ⏳ 計畫中 |

## 目錄結構

```
js/code-profiles/
├── _README.md                    （本文件）
├── _schema.md                    profile JSON schema 規格
├── cns_wind_107.json             建築物耐風設計規範（107 年版）
├── cns_seismic_113.json          建築物耐震設計規範及解說（113 年版）
├── aci_318_appendix_d.json       ACI 318 Appendix D（混凝土結構用錨栓）
├── cns_steel_general.json        鋼構造建築物鋼結構設計技術規範
└── cns_stone_general.json        石材外牆規範（CNS 14448 / CNS 6300 + JASS 9）
```

## 使用慣例

- 每份 profile **只描述參數**，不寫公式邏輯（公式邏輯在 calc-core）
- profile JSON 應**完全可重現**（無 `Date.now()`、無外部 fetch）
- profile id 採 `<scope>_<version>` 格式（snake_case）
- profile 變動須記錄於 `tests/golden/_approval_log.md`，並走 approved drift 流程

## 相關治理鏈位置

```
原 raw input
    ↓
schema validation (input-schema.spec.js)
    ↓
normalized input
    ↓
calc-core (calculator.spec.js)            ← Phase 2 將消費 profiles
    ↓
structured result API (含 meta.code_profiles 指紋) ← Phase 1 已注入
    ↓
法規 footer 顯示「依 cns_seismic_113 計算」
```

最後更新：2026-04-27（V2.1.0 Phase 1 上線）
