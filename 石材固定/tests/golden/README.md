# 🛡️ Golden Samples – 重構護欄

此目錄存放石材計算書產生器的「金樣本」(Golden Samples)，作為重構過程的不變條件。

## 📁 結構

```
tests/golden/
├── README.md                    # 本文件
├── _approval_log.md             # 所有 baseline 變更審核紀錄（強制）
├── case_01_*.json               # baseline 檔
├── case_02_*.json
└── ...
```

## 🎯 為何需要 Golden Samples

在抽出 `js/calc-core.js` 重構公式核心之前，必須先用「現況輸出」拍快照：

| 沒有快照 | 有快照 |
|---|---|
| refactor 後只能驗「新版自洽」 | 可驗「新版與舊版結果相同」 |
| 公式漂移無從察覺 | 漂移立即被 diff 標出 |
| 業主/審查爭議時無對照基準 | 可舉證計算邏輯版本與時點 |

## 📋 Schema

baseline JSON 格式詳見 [`../dev_tools/baseline_schema.md`](../../dev_tools/baseline_schema.md)。

頂層必含：
- `schema_version`：目前 `"1.0.0"`
- `case_id`：`case_NN_<descriptor>`
- `purpose`：見下表
- `captured_env`：拍攝環境指紋
- `input.raw`：去識別化後的輸入 JSON
- `result.summary`：關鍵計算結果
- `audit`：變更紀錄

## 📝 case_purpose 五種

| purpose | 用途 | 必填 expected | diff 嚴格度 |
|---|---|---|---|
| `characterization` | 鎖住現況不變 | ❌ | 嚴格 ±0.01% |
| `approved_safe` | 技師簽核標準正常案 | ✓ | ±0.5~1% |
| `approved_critical` | DCR 接近 1.0 邊界 | ✓ | 嚴格 + must_not_cross |
| `approved_failure` | 應失敗反例（負面測試） | ✓（passed: false） | 狀態必一致 |
| `regression_fixture` | 歷史 bug 不再復現 | ✓（含 bug ticket） | 嚴格 |

## 🚀 快速開始

### 自動化拍攝（推薦）

```bash
# 一次拍攝全部 inputs/ 內案例
python tests/golden/auto_capture.py

# 只拍特定案例
python tests/golden/auto_capture.py case_01

# 顯示瀏覽器（除錯用）
python tests/golden/auto_capture.py --headed
```

**輸入流程**：
1. 在 `tests/golden/inputs/case_NN_*.json` 定義案例（global_params + case_params）
2. 跑 `auto_capture.py`
3. 自動產出 `tests/golden/case_NN_*.json` 並完成去識別化
4. 在 `_approval_log.md` 新增 INITIAL entry

### 自動化漂移偵測

```bash
# 比對當前 V2 與所有既存 baseline
python tests/golden/auto_diff.py

# 自訂容許百分比（預設 ±1%）
python tests/golden/auto_diff.py --tolerance 0.5

# 只比對特定案例
python tests/golden/auto_diff.py case_01

# 同時輸出檔案報告
python tests/golden/auto_diff.py --report drift_report.txt
```

**退出碼**：
- `0` 全部通過
- `1` 至少一案例漂移超過容許
- `2` 執行錯誤

### 排程定期檢查（Windows）

註冊每日 06:00 自動跑漂移偵測：
```cmd
schtasks /Create /SC DAILY /ST 06:00 /TN "V2_Baseline_Drift" ^
  /TR "C:\Users\USER\Desktop\AI\小工具製作\石材固定\tests\golden\schedule_drift_check.bat"
```

立即手動執行測試：
```cmd
tests\golden\schedule_drift_check.bat
```

每日報告寫入：`tests/golden/_drift_log/YYYY-MM-DD_HH-MM.txt`

### 互動拍攝（舊流程，可選）

若需手動精準控制，仍可用：
1. 開啟 `dev_tools/baseline_capture.html`
2. 點「啟動 V2 開發模式」
3. 在 V2 中設定案例參數，按重新計算
4. 右上 Dev Capture 浮層填欄位、勾去識別化、Capture
5. 移動下載的 JSON 至 `tests/golden/`

### 變更現有 baseline（formula 合法改動）

```bash
# 1. 確認改動原因（規範修訂、bug 修正、依據變更）
# 2. 執行重新拍攝
# 3. 提交時必須附 reason
git diff tests/golden/case_01_*.json   # 檢視差異
# 4. 在 _approval_log.md 新增 UPDATE entry，含 reason、calc_source_hash 前後值
```

未來會有 CLI：
```bash
npm run baseline:approve case_01 --reason="耐震規範 113 修訂，地震上限式改變"
```

## 🔒 治理規則

### 不可違反

1. **去識別化**：所有 baseline 提交至 git 前必須去識別化（`captured_env.deidentified === true`）
2. **環境指紋**：`v2_html_hash`、`calc_source_hash` 不可為空
3. **變更紀錄**：任何新增/修改必在 `_approval_log.md` 記錄
4. **無聲覆蓋禁止**：覆蓋已存在 baseline 必須走 `baseline:approve` 流程

### 應避免

- 拍攝時開啟其他工具標籤（ts 與 ua 可能被污染）
- 在尚未 render 完成時 capture（result 不完整）
- 修改 baseline 結構欄位（schema 變更需 bump major version）

## 🛠 常見問題

### Q1: 拍出的 baseline 含我的工程名「台北 XX 大樓」怎麼辦？
A: 表示去識別化未啟用或失敗。**請勿提交至 git**，重新拍攝並確認勾選去識別化。

### Q2: 兩次拍同一案例 result 不同？
A: 檢查：
- 是否在 V2 完成 render 後再 capture（等檢核狀態燈變綠）
- 是否有時間戳欄位混入 input（REV 持續變動的徵兆）
- V2 HTML 是否在兩次拍攝間有變動（看 `v2_html_hash`）

### Q3: 何時應新增 baseline？
A:
- 發現新的代表性工程情境（如新工法、極端參數組合）
- 修補 bug 後（建立 `regression_fixture` 防止再現）
- 規範改版後（重新建立 `approved_*` 系列）

### Q4: 何時應淘汰 baseline？
A: 透過 `baseline:approve` 流程明確 deprecate，並在 `_approval_log.md` 標記原因。
不可直接 `git rm`。

## 📚 相關文件

- [`../dev_tools/baseline_schema.md`](../../dev_tools/baseline_schema.md) — Baseline JSON Schema 規格
- [`../dev_tools/baseline_capture.html`](../../dev_tools/baseline_capture.html) — Capture 工具頁
- [`./_approval_log.md`](./_approval_log.md) — 變更審核紀錄

## 📌 治理鏈定位

```
本目錄是治理鏈第一層護欄：

  輸入 → calc-core → result → 畫面/PDF/Word/稽核
              ↑
              └── tests/golden/ 守護此層不變條件
```

沒有此護欄，後續 calc-core 抽取、結構化 API、Python 去計算化、公式版本指紋
都將失去客觀比對基準。**這是所有重構的前置條件**。
