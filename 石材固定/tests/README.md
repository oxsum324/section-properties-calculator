# tests/ — 一鍵全測試套件

V2 工具的端對端測試與漂移偵測入口。

## 快速使用

### Windows 一鍵跑全套
```cmd
tests\run_all_tests.bat
```
退出碼：`0` = 全通過；非 0 = 至少一項失敗（log 在 `tests/_run_log/`）

### 個別跑

```bash
# Node.js smoke 4 套（純計算邏輯，無瀏覽器）
node js/regression-smoke.test.js
node js/formula-registry-smoke.test.js
node js/review-dashboard-smoke.test.js
node js/version-sync-smoke.test.js

# V2 HTML inline JS 語法檢查
node tmp/_v2syntax.js

# 5 組 baseline 漂移偵測（Playwright）
python tests/golden/auto_diff.py

# auto_word.py 指紋閘門端對端驗證
python tmp/_v2_autoword_draft_verify.py

# CI 摘要報告
python tests/ci_summary.py tests/_run_log/_last_run.log
```

## 測試覆蓋範圍

| 類別 | 工具 | 涵蓋 |
|---|---|---|
| 計算正確性 | `regression-smoke.test.js` | StoneCalculator 主流程、20+ 計算斷言 |
| 公式版本 | `formula-registry-smoke.test.js` | 32 個 check 對應 registry 完整性 |
| 儀表板邏輯 | `review-dashboard-smoke.test.js` | 交付品質 A/B/C/D 評級 |
| 版本同步 | `version-sync-smoke.test.js` | toolHeader 與內部 APP_VERSION 一致 |
| HTML 語法 | `tmp/_v2syntax.js` | V2 inline script 解析無錯 |
| 漂移偵測 | `tests/golden/auto_diff.py` | 5 組 golden samples 對照當前 V2 結果 |
| 指紋閘門 | `tmp/_v2_autoword_draft_verify.py` | auto_word.py 缺指紋時草稿浮水印注入 |

## 排程定期跑

Windows Task Scheduler 註冊每日 06:00 自動跑：
```cmd
schtasks /Create /SC DAILY /ST 06:00 /TN "V2_All_Tests" ^
  /TR "C:\Users\USER\Desktop\AI\小工具製作\石材固定\tests\run_all_tests.bat"
```

## 結果產物

```
tests/
├── _run_log/
│   ├── _last_run.log           # 最近一次完整 log
│   ├── _last_summary.json      # 結構化摘要（CI 友善）
│   └── YYYY-MM-DD_HH-MM.log    # 歷史記錄
└── golden/
    └── _drift_log/
        └── YYYY-MM-DD_*.txt    # 漂移偵測歷史報告
```

## CI 友善格式

`_last_summary.json` 結構：
```json
{
  "overall": "PASS",
  "pass_count": 7,
  "fail_count": 0,
  "results": {
    "smoke_calc": { "label": "regression smoke", "status": "PASS", "detail": "2026.04.23-spec-core11" },
    "smoke_formula": { ... },
    ...
  },
  "log_file": "tests/_run_log/2026-04-27_15-30.log",
  "generated_at": "2026-04-27T15:30:42"
}
```

供 GitHub Actions / Task Scheduler / 其他自動化讀取。

## 失敗處理

任一項失敗時：
1. 開啟 `tests/_run_log/_last_run.log` 找具體錯誤訊息
2. 若是 `baseline drift`：跑 `python tests/golden/auto_diff.py --tolerance 2.0` 確認是否為非預期變動，若為「approved drift」則重拍 baseline 並更新 `tests/golden/_approval_log.md`
3. 若是 `regression smoke`：表示 calc-core 本身計算錯誤，需立即檢視 `js/calculator.spec.js`
4. 若是 `auto_word fingerprint gate`：檢查 `auto_word.py` 的 `validate_payload_for_formal_output` 邏輯
