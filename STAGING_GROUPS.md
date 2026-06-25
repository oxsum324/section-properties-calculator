# Staging 分包建議

本檔把目前工作樹切成可審查的提交包。目的不是強制拆 commit，而是避免把平台修正、部署資產、候選工具目錄與既有使用者變更混在同一包。

## A. 平台穩定化與驗證入口

適合第一包提交。這包處理巡檢、preflight、ignore 與文件，不包含錨栓 build hash 資產。

可直接 staging 的檔案：

```powershell
git add -- .gitignore README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md preflight-tools.ps1 run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-release.bat sync-anchor-deployment.ps1 continuous-beam-regression.test.js test-continuous-beam.ps1 "連續梁分析.html" browser-dialogs.contract.test.js decking-tools.contract.test.js section-tools.contract.test.js stone-feedback.contract.test.js struct-dx.contract.test.js toolbox-entrypoints.contract.test.js
git add -- platform-audit-preflight.ps1 refresh-platform-status.ps1 audit-all.ps1 run-audit-all.bat run-audit-all-loop.bat
git add -- "鋼構工具/run-audit.bat" "鋼筋混凝土/run-audit.bat" "結構工具箱/audit-core.ps1" "結構工具箱/run-audit-core.bat"
git add -- "開挖擋土支撐/start_html_mode.ps1" "開挖擋土支撐/stop_html_mode.ps1"
git add -- index.html "斷面性質計算.html" "合成斷面性質.html" "RC補強斷面性質.html"
git add -- "解題/struct_dx/frontend/diagnosis.html" "解題/struct_dx/frontend/verify_engine.html" "解題/struct_dx/frontend/struct_suite.html"
git add -- "鋼構工具/audit-tool.ps1" "鋼構工具/steel-audit-browser-runner.js"
git add -- "結構工具箱/core/style.css"
git add -- "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js"
git add -- "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/tool-maturity-matrix.js"
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/tools/formal-golden-harvest.js" "結構工具箱/tools/force-picker.html"
git add -- "結構工具箱/tools/地震力/seismic-force.html" "結構工具箱/tools/地震力/seismic-appendage.html" "結構工具箱/tools/地震力/seismic-misc.html" "結構工具箱/tools/地震力/seismic-dynamic.html"
git add -- "結構工具箱/tools/風力/wind-special.html"
git add -- "結構工具箱/tools/風力/wind-force.html" "結構工具箱/tools/風力/wind-object-frame.html" "結構工具箱/tools/風力/wind-object-solid.html" "結構工具箱/tools/風力/wind-object-tower.html" "結構工具箱/tools/風力/wind-open-roof.html" "結構工具箱/tools/風力/wind-fence-sign.html" "結構工具箱/tools/風力/wind-lattice-tower.html" "結構工具箱/tools/風力/wind-sign-pole.html"
```

需要人工 hunk review，不建議整檔直接 staging：

- `結構工具箱/core/wind-report.js`
- `結構工具箱/tools/風力/wind-cc.html`
- `結構工具箱/tools/風力/wind-parapet.html`

原因：這三個檔案在本輪前已經是 modified。若要納入，先用 `git diff -- <path>` 或互動式 staging 確認內容都屬於同一個修正主題。

建議提交訊息：

```text
Stabilize platform audits and tool preflight checks
```

## B. 錨栓部署鏡像

適合第二包提交。這包是 `/anchor/` 靜態部署輸出更新，必須讓舊 hash 刪除、新 hash 新增與部署 fingerprint manifest 一起 staging。

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
git add -A -- anchor/index.html anchor/service-worker.js anchor/deployment-manifest.json anchor/assets
```

提交前檢查：

```powershell
Select-String -Path "anchor/index.html","anchor/service-worker.js" -Pattern "/anchor/|BASE_PATH"
Get-Content "anchor/deployment-manifest.json"
```

建議提交訊息：

```text
Refresh anchor deployment assets
```

## C. 候選工具目錄

不建議在目前直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件、`stone-traceability.catalog.json`、`stone-traceability.contract.test.js` 與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`、`decking-traceability.catalog.json`、`decking-traceability.contract.test.js`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile、Word 產報 smoke 與 traceability contract。
- `鋼架/`：目前只有 `平面剛架分析.html`，可在確認用途後獨立一包納入。

```powershell
git add -- "石材固定/README.md" "石材固定/stone-traceability.catalog.json" "石材固定/stone-traceability.contract.test.js"
git add -- "覆工板/README.md" "覆工板/decking-traceability.catalog.json" "覆工板/decking-traceability.contract.test.js"
```

## D. 高頻局部快算工具

已納入 `結構工具箱/tools/` 下，適合獨立小包提交。這類工具應維持「HTML 只渲染、core.js 做計算、*.test.js 做 golden regression」的形態。

```powershell
git add -- "結構工具箱/tools/foundation/foundation-local.html" "結構工具箱/tools/foundation/foundation-local-core.js" "結構工具箱/tools/foundation/foundation-local-core.test.js" "結構工具箱/tools/foundation/foundation-local-golden-cases.js"
git add -- "結構工具箱/tools/equipment/equipment-load.html" "結構工具箱/tools/equipment/equipment-load-core.js" "結構工具箱/tools/equipment/equipment-load-core.test.js" "結構工具箱/tools/equipment/equipment-load-golden-cases.js"
git add -- "結構工具箱/tools/earth/earth-pressure.html" "結構工具箱/tools/earth/earth-pressure-core.js" "結構工具箱/tools/earth/earth-pressure-core.test.js" "結構工具箱/tools/earth/earth-pressure-golden-cases.js"
git add -- "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "結構工具箱/index.html" "結構工具箱/assets/home/home.js" "結構工具箱/assets/hy/colors_and_type.css" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "vercel.json" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js"
```

工具成熟度矩陣輸出位於 `output/audit/tool-maturity-matrix.json` 與 `output/audit/tool-maturity-matrix.md`，屬於可重產生輸出，不建議 staging；應 staging 的是 `結構工具箱/tools/tool-maturity-matrix.js`、`formal-tools.manifest.json` 內的 golden cases、`local-quick-browser-smoke.test.js` 內的 JSON round-trip，以及 dashboard 讀取邏輯與 `audit-dashboard-browser-smoke.test.js` 的 fixture 渲染檢查。dashboard browser smoke 會拒絕未列入 fixture map 的 `output/` 請求，避免測試意外讀到本機最新輸出而掩蓋路徑漂移。

入口治理、首頁正式狀態治理、首頁版本治理、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性、目前工作樹覆蓋率與非 formal 責任邊界變更需一併 staging `toolbox-entrypoints.contract.test.js`、`vercel.json` 與 `結構工具箱/assets/home/home.js`、`結構工具箱/assets/hy/colors_and_type.css`；這個合約會比對首頁入口、`routeFileMap`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案，要求 maturity matrix 外的正式卡片在 `governanceSources` 指向對應 preflight gate，要求 `HOME_DATA_UPDATED` 與首頁卡片版本對齊工具頁 `APP_VERSION` / `TOOL_VERSION`，並要求 `preflight-tools.ps1` 內執行的 `*.contract.test.js` 都列入本檔與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入本檔與 `TOOL_BOUNDARIES.md`，preflight helper script 清冊則要求 `.ps1` / `.bat` 入口列入 staging 與邊界文件，也要求本檔 `git add` 路徑必須在 checkout 中存在；git-aware 的 tracked deletion、未追蹤 ignored path 與目前 `git status` 變更覆蓋率由 preflight `staging-groups-coverage` gate 檢查，再用 `stateBoundaryRules` 確認非 formal 卡片的 limit / capability 沒有過度承諾。

注意事項：

- 不要把基礎局部工具放在 `結構工具箱/tools/基礎/`，目前 `.gitignore` 的 `基礎/` 規則會讓該資料夾被忽略。
- 初估型工具的標題、報表與 note 都應保留「初估 / 局部」語意，避免被誤用為完整規範設計。


## E. RC 正式工具與視覺回歸

這包集中 `鋼筋混凝土/` 的正式工具、共用核心、報表與 regression / browser smoke。內容多，提交前先用 `鋼筋混凝土/tools/test-*.ps1` 或 full preflight 驗證。

```powershell
git add -- "鋼筋混凝土/README.md" "鋼筋混凝土/audit-tool.ps1" "鋼筋混凝土/index.html"
git add -- "鋼筋混凝土/shared" "鋼筋混凝土/tools"
```

`鋼筋混凝土/tools` 內的 `rc-traceability.catalog.json` 是 RC 條文語意追蹤 catalog，需和各 RC regression、report visual 與 `audit-status.contract.test.js` 一起 staging。

建議提交訊息：

```text
Expand RC tool governance and report verification
```

## F. 鋼構正式頁與鋼構工具入口

這包集中 `鋼構工具/` 的正式頁、共用報表、manifest、樣式與 regression；`結構工具箱/tools/鋼構/` 是工具箱內的舊版 / 轉接頁，應與首頁狀態一起審查。

```powershell
git add -- "鋼構工具/app.js" "鋼構工具/core" "鋼構工具/index.html" "鋼構工具/steel-beam-formal.html" "鋼構工具/steel-beam-formal.js" "鋼構工具/steel-column-formal.html" "鋼構工具/steel-column-formal.js" "鋼構工具/steel-formal.regression-test.js" "鋼構工具/steel-traceability.catalog.json" "鋼構工具/steel-traceability.contract.test.js" "鋼構工具/steel-member-formal.css" "鋼構工具/styles.css"
git add -- "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html"
```

`鋼構工具/steel-traceability.catalog.json` 是鋼構條文語意追蹤 catalog，需和 `steel-traceability.contract.test.js`、`audit-tool.ps1`、鋼構 regression / browser runner 與 dashboard maturity matrix 變更一起 staging。

建議提交訊息：

```text
Strengthen formal steel tool pages and reports
```

## G. 錨栓原始碼與部署鏡像前置

`螺栓檢討/bolt-review-tool/` 是 `/anchor/` 部署鏡像的來源。這包提交原始碼；提交 `/anchor/` hash 資產前，先跑 `sync-anchor-deployment.ps1` 並用 B 包提交部署鏡像。新增規範路線、報告段落或人工複核邊界時，需同步提交 `anchor-traceability.catalog.json` 與 contract test。

```powershell
git add -- "螺栓檢討/bolt-review-tool/README.md" "螺栓檢討/bolt-review-tool/package.json" "螺栓檢討/bolt-review-tool/vite.config.ts"
git add -- "螺栓檢討/bolt-review-tool/src/App.css" "螺栓檢討/bolt-review-tool/src/App.tsx" "螺栓檢討/bolt-review-tool/src/confirmDialog.ts" "螺栓檢討/bolt-review-tool/src/defaults.ts" "螺栓檢討/bolt-review-tool/src/defaults.test.ts" "螺栓檢討/bolt-review-tool/src/useAuditTrail.ts" "螺栓檢討/bolt-review-tool/src/useProjectLibrary.ts" "螺栓檢討/bolt-review-tool/src/useWorkspaceHydration.ts"
git add -- "螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json" "螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts"
```

建議提交訊息：

```text
Replace anchor dialogs with in-app confirmations
```

## 提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
git diff --check
git status --short --untracked-files=normal
```
