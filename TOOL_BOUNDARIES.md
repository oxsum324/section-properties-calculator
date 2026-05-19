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
| `石材固定/` | 納入程式碼與必要離線 vendor，排除參考資料與輸出 | 已有 self_check、quick smoke、版本治理、golden samples 與交付流程；納入正式 V2 工具、測試、治理文件、必要 vendor，PDF/XLS/Word 範例、圖片、專案報告與舊版 HTML 不進 repo。 |
| `開挖擋土支撐/` | 納入程式碼，排除工程資料 | Backend tests、frontend build 與 launcher 靜態 smoke 已納入 preflight；只提交 `index.html`、backend/frontend 原始碼、設定、README、啟停腳本與本目錄 `.gitignore`，不提交工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`。 |
| `覆工板/` | 納入程式碼，排除工程資料與輸出 | 已有 `index.html`、Python 報告產生器、固定 smoke fixture 與 preflight 產報檢查；Excel、PDF、doc/docx、抽圖、dump 與吊車參考資料不進 repo。 |
| `鋼架/` | 可納入 | 目前只有單一 HTML 靜態工具，preflight 已做基本 smoke。 |
| `結構工具箱/tools/foundation/` | 納入 | 基礎局部檢核為靜態快算工具，已拆 `foundation-local-core.js`、`foundation-local-golden-cases.js` 與 `foundation-local-core.test.js`，preflight 會跑 golden regression。注意不要改放到 `tools/基礎/`，會被根目錄 `基礎/` ignore 規則誤排除。 |
| `結構工具箱/tools/equipment/` | 納入 | 設備局部荷重為靜態快算工具，已拆 `equipment-load-core.js`、`equipment-load-golden-cases.js` 與 `equipment-load-core.test.js`，preflight 會跑接觸壓 / 分布壓 / 單點反力 regression。 |
| `結構工具箱/tools/earth/` | 納入 | 擋土土壓局部快算為靜態初估工具，已拆 `earth-pressure-core.js`、`earth-pressure-golden-cases.js` 與 `earth-pressure-core.test.js`，preflight 會跑 Rankine 土壓 / 水壓 / 簡化穩定 regression。 |
| `結構工具箱/tools/local-quick-tools.manifest.json` | 納入 | 高頻局部快算工具清冊；集中記錄路由、入口檔、核心檔、golden regression、smoke 標記與文件邊界，避免新增工具時只改頁面、漏改契約與 preflight。 |
| `結構工具箱/tools/local-quick-tools.run.js` | 納入 | manifest-driven 局部快算測試入口；由清冊呼叫 JSON 匯出 helper regression 與共同契約，preflight 以此作為局部快算總閘門。 |
| `結構工具箱/tools/local-quick-export.js` | 納入 | 高頻局部快算共用 JSON 匯出 helper；集中處理 payload 組裝、非有限數值序列化與下載動作，避免各頁匯出格式分歧。 |
| `結構工具箱/tools/local-quick-export.test.js` | 納入 | JSON 匯出 helper 的 Node stub regression；驗證 payload、預設檔名、MIME、click/remove/revoke 與 Infinity/NaN 序列化，不依賴瀏覽器下載事件。 |
| `結構工具箱/tools/local-quick-tools.contract.test.js` | 納入 | 高頻局部快算共同契約測試；集中確認工具檔案、首頁入口、乾淨路由、README、邊界文件、staging 建議、頁面責任邊界與各工具 golden regression。 |
| `螺栓檢討/bolt-review-tool/` | 保持原工具碼與 deploy 輸出分流 | 原始 React 工具用 npm verify；`anchor/` 是部署鏡像。 |

## 不進 repo 的類型

- `node_modules/`、`.vite/`、`.playwright-cli/`
- `tmp/`、`_tmp/`、`__pycache__/`、`.pytest_cache/`
- `output/`、測試 run log、release bundle
- 本機專案資料：`app_data/`
- 大型工程輸出與參考：PDF、Excel、Word、LibreOffice 暫存 profile
- 反查或抽取資料：`_extracted/`、dump 文字檔、OLE/EMF/WMF 圖檔
- 名稱剛好命中忽略規則的工具目錄，例如 `結構工具箱/tools/基礎/`；靜態工具應使用不被忽略的英文資料夾，如 `tools/foundation/`。

## 提交前檢查順序

1. `.\preflight-tools.ps1 -Quick`
2. `.\preflight-tools.ps1`
3. `git status --short --untracked-files=normal`
4. 確認 `anchor/assets` 舊 hash 刪除與新 hash 新增成對出現。

實際 staging 分包請參考 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)。
