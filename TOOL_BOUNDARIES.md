# 工具交付邊界

本檔用來區分「應納入版本控管的工具碼」與「只作為本機案例、輸出或參考資料的檔案」。原則是：可重跑的程式、測試、preflight 與必要部署資產可以進 repo；大型工程案例、Office/PDF 輸出、暫存資料與本機快取不進 repo。

## 目前建議狀態

| 區域 | 建議 | 理由 |
|---|---|---|
| `preflight-tools.ps1`、`run-preflight-tools.bat` | 納入 | 已成為跨工具交付前檢查入口。 |
| `continuous-beam-regression.test.js`、`test-continuous-beam.ps1` | 納入 | 補齊根目錄連續梁回歸檢查。 |
| `anchor/` | 納入部署資產 | Vercel `/anchor/` 乾淨路由直接使用此輸出；hash asset 更新時舊檔刪除與新檔新增需一起提交。 |
| `結構工具箱/tools/風力/*.html` | 納入 | 風力頁面共用報告路徑屬於平台可用性修正。 |
| `鋼構工具/audit-tool.ps1` | 納入 | 修正 Playwright CLI `network` 指令不存在時造成總巡檢中斷。 |
| `石材固定/` | 建議納入，但先排除輸出、暫存與大型參考 | 已有 self_check、quick smoke、版本治理與交付流程；適合成為正式工具，但需先清掉輸出與案例雜訊。 |
| `開挖擋土支撐/` | 納入程式碼，排除工程資料 | Backend tests 與 frontend build 已納入 preflight；只提交 backend/frontend 原始碼、設定、README、啟停腳本與本目錄 `.gitignore`，不提交工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`。 |
| `覆工板/` | 暫列候選工具 | 已有 `index.html` 與 Python 報告產生器；目前仍混有 Excel、PDF、doc/docx、抽圖與 dump 檔，需先分離案例資料。 |
| `鋼架/` | 可納入 | 目前只有單一 HTML 靜態工具，preflight 已做基本 smoke。 |
| `螺栓檢討/bolt-review-tool/` | 保持原工具碼與 deploy 輸出分流 | 原始 React 工具用 npm verify；`anchor/` 是部署鏡像。 |

## 不進 repo 的類型

- `node_modules/`、`.vite/`、`.playwright-cli/`
- `tmp/`、`_tmp/`、`__pycache__/`、`.pytest_cache/`
- `output/`、測試 run log、release bundle
- 本機專案資料：`app_data/`
- 大型工程輸出與參考：PDF、Excel、Word、LibreOffice 暫存 profile

## 提交前檢查順序

1. `.\preflight-tools.ps1 -Quick`
2. `.\preflight-tools.ps1`
3. `git status --short --untracked-files=normal`
4. 確認 `anchor/assets` 舊 hash 刪除與新 hash 新增成對出現。

實際 staging 分包請參考 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)。
