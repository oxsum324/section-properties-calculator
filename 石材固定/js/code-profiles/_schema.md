# Code Profile JSON Schema (v1.0)

## 頂層結構

```jsonc
{
  "schema_version": "1.0.0",
  "id": "cns_seismic_113",
  "scope": "seismic",
  "name": "建築物耐震設計規範及解說（113 年版）",
  "issued": "2024-XX-XX",
  "publisher": "內政部營建署",
  "supersedes": "cns_seismic_111",
  "expires": null,
  "params": { /* 各規範參數 key-value */ },
  "notes": "（必要時補充說明）"
}
```

## 必填欄位

| 欄位 | 說明 |
|---|---|
| `schema_version` | profile schema 版本（目前 1.0.0） |
| `id` | profile 識別碼（snake_case，全工具唯一） |
| `scope` | 屬於哪一類規範：`wind` / `seismic` / `anchor` / `steel` / `stone` |
| `name` | 完整人類可讀名稱（會顯示於法規 footer） |
| `issued` | 規範頒佈日期（ISO 8601）；未確定可填 null |
| `params` | 規範定義的具體參數 |

## scope enum

- `wind` — 耐風相關
- `seismic` — 耐震相關
- `anchor` — 錨栓設計（如 ACI 318 Appendix D）
- `steel` — 鋼結構容許值
- `stone` — 石材材料規範
- `geometry` — 幾何規則（孔位、邊距、間距）
- `internal` — 內部準則（事務所自定）

## params 內容

依 scope 不同有不同 schema。以下舉例：

### wind (CNS 耐風)

```jsonc
{
  "I_categories": { "general": 1.0, "important": 1.1, "essential": 1.15 },
  "exposure_classes": ["A", "B", "C"],
  "design_pressure_factor": 1.25,
  "GCpi_enclosed": 0.18,
  "GCpi_partial": 0.55,
  "Cpe_zone_4_max": 1.07,
  "Cpe_zone_5_max": 1.07
}
```

### seismic (CNS 耐震)

```jsonc
{
  "Fph_simple_factor": 1.6,         // Fph = 1.6 × SDS × Ip × Wp
  "Fph_detailed_lower": 0.3,        // 0.3 × SDS × Ip × Wp 下限
  "Fph_detailed_upper": 1.6,        // 與簡式同
  "ap_default": 1.0,
  "Rp_stone_panel": 2.5,
  "PEV_factor": 0.2,
  "Ip_categories": { "I": 1.0, "II": 1.25, "III": 1.5 }
}
```

### anchor (ACI 318 App. D)

```jsonc
{
  "phi_steel": 0.75,
  "phi_concrete_condition_b": 0.65,
  "psi_cN_uncracked": 1.25,
  "psi_cN_cracked": 1.0,
  "psi_cV_full_rebar": 1.4,
  "psi_cV_edge_rebar": 1.2,
  "psi_cV_no_rebar": 1.0,
  "service_factor": 1.6
}
```

### stone (CNS / JASS)

```jsonc
{
  "granite_grade1_fb": 70,          // kgf/cm²
  "granite_grade2_fb": 55,
  "marble_fb": 40,
  "sandstone_fb": 30,
  "min_thickness_default": 30,      // mm
  "max_panel_area_default": 1.0     // m²
}
```

## 變動審核

任何 profile JSON 變動須：

1. 在 `tests/golden/_approval_log.md` 加 entry，標明：
   - 變動原因（規範改版、勘誤、廠商試驗值更新）
   - profile id 與檔名
   - 變動前後 SHA-256
   - 是否觸發 baseline drift（若是，列影響 case）

2. 若新增 profile 應同時：
   - 給予新的 `id`（不可覆蓋舊 id）
   - 在舊 profile 的 `supersedes` 欄填入新 profile id
   - 在新 profile 的 `supersedes` 欄填入舊 profile id

3. 不可直接修改已發布的 profile（追溯性原則）

## meta.code_profiles 寫入規則

`getCalculationResults().meta.code_profiles` 應為：

```jsonc
{
  "wind":    "cns_wind_107",
  "seismic": "cns_seismic_113",
  "anchor":  "aci_318_appendix_d",
  "steel":   "cns_steel_general",
  "stone":   "cns_stone_general"
}
```

每個 scope 對應當時計算採用的 profile id。

最後更新：2026-04-27
