# Calc Engine Validation Suite

外部基準對照測試集；目的：把 calc 引擎與外部已驗證來源（ACI 318-19 commentary R17、
公開技術報告、製造商評估報告）對照，確認在典型情境下吻合。

## 目錄結構

```
validation/
  aci-318-19/
    R17-cast-in-2x2-tension.json     ← 案件設定 + 期望值
    R17-post-installed-shear.json
    ...
```

每個檔案包含：

```json
{
  "id": "唯一 ID",
  "source": "ACI 318-19 R17.x.x 範例 / Hilti Profis screenshot / ...",
  "description": "情境敘述",
  "input": { ProjectCase 完整內容 },
  "product": { AnchorProduct 完整內容 },
  "expected": {
    "overallStatus": "pass|fail|incomplete|warning|screening",
    "checks": [
      {
        "id": "concrete-breakout-tension",
        "demandKn": 80,
        "designStrengthKn": 141.7,
        "dcrTolerance": 0.05
      }
    ]
  }
}
```

## 執行

`validation.test.ts` 載入此目錄內所有 JSON，跑 `evaluateProject` 後對照
`expected` 區塊。容許誤差預設 ±2%（個別案可用 `dcrTolerance` 覆寫）。

```bash
npx vitest run src/validation/validation.test.ts
```

## 加新案例

1. 在 `aci-318-19/` 下新增 `<id>.json`
2. 完整填入 `input.layout` / `input.loads` / `product`
3. 跑一次當前引擎、紀錄結果作為 `expected`（或從外部來源抄入）
4. CI 自動回歸；若 calc 引擎日後修了 ψ 因子，這層測試會立刻發現偏移

## 驗收原則

- 每個 case 都應有 `source` 欄位指向可追溯來源
- 容許誤差不應大於 5%；超過代表計算邏輯有歧異需釐清
- ACI commentary 範例優先；製造商計算因 ψ 修正不同可能差 2-3%
