# Staging 分包建議

本檔目前扮演兩個角色：第一，記錄已發布到 `master` / GitHub Pages 的分包與證據；第二，保留下次同類變更可直接套用的 staging playbook。它不是目前待提交清單；若 `git status` 是 clean，以下 `git add` 區塊只作為未來變更時的審查邊界與 preflight coverage 來源。

## 目前狀態

- 工作樹基準：最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準，本文件不硬編碼自我引用的最新 commit hash，避免提交後立即失真。
- 狀態快照基準提交：`60f3c18 Update release status snapshots`，其公開快照指向正式放行證據 `20260710-053304`。
- 已落地提交：
  - `4944fa7 Harden page-only report readiness release evidence`
  - `b1a534e Expand report boundary governance across tools`
  - `d530816 Refresh anchor deployment assets`
  - `60f3c18 Update release status snapshots`
- 公開狀態快照正式放行基準：`runId=20260710-053304`，`quick=false`、`ForcePlatformAudit=true`、`ForceSlowChecks=true`、`49/49` 通過，post checks `3/3` 通過。
- 公開狀態快照發布基準：workflow run `29052463494`，`Pages deploy` completed/success；後續文件治理提交的最新 Pages run 以 `gh run list --limit 1` 為準，不在本 ledger 硬編碼。
- 報告閱讀狀態：`頁面專用`，page-only boundary `4/4`，issue `0`；此總覽只能出現在頁面或工具本身，不得附入計算書、列印輸出或 PDF。
- 下列 A0~G 是下次同類變更的分包 playbook，不是目前待 staging 清單。

## A0. 報告閱讀狀態與 Pages release governance

已落地：`4944fa7 Harden page-only report readiness release evidence`。下次若再次調整頁面專用「優先建議報告閱讀狀態」、公開首頁狀態快照、Pages artifact 邊界或正式放行證據，這包仍應優先提交；它不納入錨栓 build hash 資產，也不納入 RC / Steel / 風力 / 地震工具頁本體的大量 UI 調整。

下次同類變更低風險可整檔 staging 的檔案：

```powershell
git add -- CONTEXT.md docs/adr/0001-page-only-report-readiness.md
git add -- ".github/workflows/pages-deploy.yml" "run-pages-artifact-smoke.ps1" "pages-release-governance.contract.test.js"
git add -- "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/tool-maturity-matrix.js"
git add -- "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

下次同類變更需要人工 hunk review，或改隨後續「報告邊界 / 跨家族 contract」包一起 staging：

- `STAGING_GROUPS.md`：若只提交 A0，需只挑 release ledger、A0 區塊與必要共同驗證 hunk，避免把其他 future playbook 調整混入。
- `TOOL_BOUNDARIES.md`：若只提交 A0，需只挑 Pages / status snapshot / page-only 邊界相關 hunk。
- `preflight-tools.ps1`：若只提交 A0，需只挑 `pagesReleaseGovernanceContractCommand` 與 `pages-release-governance-contract` record hunk。
- `README.md`：若只提交 A0，需只挑 Pages / report-readiness 相關 hunk。
- `TOOL_REPORT_GUIDE.md`：若只提交 A0，需只挑 glossary / ADR / page-only 邊界 hunk。
- `toolbox-entrypoints.contract.test.js`：若整檔 staging，必須同步 staging 它引用的 contract / preflight / home source 變更。
- `結構工具箱/tools/report-disclosure.contract.test.js`、`結構工具箱/tools/audit-dashboard-browser-smoke.test.js`：依賴跨家族 report-boundary 變更，除非 A0 同時擴成報告邊界大包，否則不要整檔 staging。

提交前驗證：

```powershell
node .\pages-release-governance.contract.test.js
node .\toolbox-entrypoints.contract.test.js
node .\結構工具箱\tools\report-disclosure.contract.test.js
node .\結構工具箱\tools\tool-maturity-matrix.js --write --check
.\run-preflight-tools-release.bat
.\run-pages-artifact-smoke.ps1
git diff --check -- README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/adr/0001-page-only-report-readiness.md ".github/workflows/pages-deploy.yml" "run-pages-artifact-smoke.ps1" "toolbox-entrypoints.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

下次不要混入本包：

- `anchor/assets/` 舊 hash 刪除 / 新 hash 新增，改放 B 包。
- `鋼筋混凝土/`、`鋼構工具/`、`結構工具箱/tools/風力/`、`結構工具箱/tools/地震力/` 的頁面本體變更，改放 E / F 或正式工具包。
- `螺栓檢討/bolt-review-tool/` 原始碼與 `/anchor/` 部署鏡像，分別放 G / B 包。

已落地提交訊息；下次可沿用同樣聚焦格式：

```text
Harden page-only report readiness release evidence
```

## A. 平台穩定化與驗證入口

已落地：跨家族報告 / 閱讀狀態治理主要在 `b1a534e Expand report boundary governance across tools`。下次若再次調整巡檢、preflight、ignore 與文件，仍可用本包作為平台治理 playbook；它不包含錨栓 build hash 資產。

下次可直接 staging 的檔案：

```powershell
git add -- .gitignore README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/ docs/adr/0001-page-only-report-readiness.md preflight-tools.ps1 run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-release.bat run-pages-artifact-smoke.ps1 sync-anchor-deployment.ps1 continuous-beam-regression.test.js test-continuous-beam.ps1 "連續梁分析.html" browser-dialogs.contract.test.js decking-tools.contract.test.js frame-analysis.contract.test.js pages-release-governance.contract.test.js section-tools.contract.test.js stone-feedback.contract.test.js struct-dx.contract.test.js toolbox-entrypoints.contract.test.js
git add -- platform-audit-preflight.ps1 refresh-platform-status.ps1 audit-all.ps1 run-audit-all.bat run-audit-all-loop.bat
git add -- "鋼構工具/run-audit.bat" "鋼筋混凝土/run-audit.bat" "結構工具箱/audit-core.ps1" "結構工具箱/run-audit-core.bat"
git add -- "開挖擋土支撐/start_html_mode.ps1" "開挖擋土支撐/stop_html_mode.ps1" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js"
git add -- index.html "斷面性質計算.html" "合成斷面性質.html" "RC補強斷面性質.html"
git add -- "解題/struct_dx/frontend/diagnosis.html" "解題/struct_dx/frontend/verify_engine.html" "解題/struct_dx/frontend/struct_suite.html"
git add -- "鋼構工具/audit-tool.ps1" "鋼構工具/steel-audit-browser-runner.js"
git add -- "結構工具箱/core/style.css"
git add -- "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js"
git add -- "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/tool-maturity-matrix.js"
git add -- ".github/workflows/pages-deploy.yml" "結構工具箱/tools/pages-live-smoke.js" "run-pages-artifact-smoke.ps1" "開挖擋土支撐/index.html" "toolbox-entrypoints.contract.test.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
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

已落地：`d530816 Refresh anchor deployment assets`。下次更新 `/anchor/` 靜態部署輸出時，必須讓舊 hash 刪除、新 hash 新增與部署 fingerprint manifest 一起 staging。

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

下次不建議直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件、`stone-traceability.catalog.json`、`stone-traceability.contract.test.js`、`stone-report.contract.test.js` 與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。注意：`dev_tools/`、Python helper、測試資料與本機註冊檔可留在 repo 供治理使用，但 GitHub Pages artifact 必須排除，避免 baseline / diagnostics / source / local launcher helper 等維護檔公開。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`、`excavation-traceability.catalog.json`、`excavation-traceability.contract.test.js`、`excavation-report.contract.test.js`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。preflight 已做 launcher、traceability contract、report boundary contract、backend quick/full tests 與 frontend build。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`、`decking-report.contract.test.js`、`decking-traceability.catalog.json`、`decking-traceability.contract.test.js`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile、Word 報告邊界 contract 與 traceability contract。
- `鋼架/`：目前只有 `平面剛架分析.html`，頁面 / 計算書邊界已由根目錄 `frame-analysis.contract.test.js` 治理；若要納入 HTML 調整，建議與該 contract 一起審查。

```powershell
git add -- "石材固定/README.md" "石材固定/stone-traceability.catalog.json" "石材固定/stone-traceability.contract.test.js" "石材固定/stone-report.contract.test.js"
git add -- "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js" "開挖擋土支撐/backend/tests/test_project_store.py" "開挖擋土支撐/backend/tests/test_reporting.py"
git add -- "覆工板/README.md" "覆工板/decking-report.contract.test.js" "覆工板/decking-traceability.catalog.json" "覆工板/decking-traceability.contract.test.js"
```

## D. 高頻局部快算工具

已納入 `結構工具箱/tools/` 下，適合獨立小包提交。這類工具應維持「HTML 只渲染、core.js 做計算、*.test.js 做 golden regression」的形態。

```powershell
git add -- "結構工具箱/tools/foundation/foundation-local.html" "結構工具箱/tools/foundation/foundation-local-core.js" "結構工具箱/tools/foundation/foundation-local-core.test.js" "結構工具箱/tools/foundation/foundation-local-golden-cases.js"
git add -- "結構工具箱/tools/equipment/equipment-load.html" "結構工具箱/tools/equipment/equipment-load-core.js" "結構工具箱/tools/equipment/equipment-load-core.test.js" "結構工具箱/tools/equipment/equipment-load-golden-cases.js"
git add -- "結構工具箱/tools/earth/earth-pressure.html" "結構工具箱/tools/earth/earth-pressure-core.js" "結構工具箱/tools/earth/earth-pressure-core.test.js" "結構工具箱/tools/earth/earth-pressure-golden-cases.js"
git add -- "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/project-storage.test.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/delivery-artifacts.contract.test.js" "結構工具箱/tools/release-readiness.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "結構工具箱/index.html" "結構工具箱/assets/home/home.js" "結構工具箱/assets/home/home.css" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json" "結構工具箱/assets/hy/colors_and_type.css" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "vercel.json" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js"
```

工具成熟度矩陣輸出位於 `output/audit/tool-maturity-matrix.json` 與 `output/audit/tool-maturity-matrix.md`，屬於可重產生輸出，不建議 staging；首頁公開狀態快照位於 `結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json` 與 `結構工具箱/assets/status/report-readiness-status.json`，由 `tool-maturity-matrix.js --write` 依最新 `output/` 精簡產生，應與首頁狀態讀取邏輯一起 staging。quick preflight 只應以 `--preserve-homepage-status` 更新 ignored `output/audit` 矩陣，不應覆寫這三個 tracked 公開快照；正式放行或刻意刷新首頁狀態時才 staging 它們。應 staging 的是 `結構工具箱/tools/tool-maturity-matrix.js`、`formal-tools.manifest.json` 內的 golden cases、`local-quick-browser-smoke.test.js` 內的 JSON round-trip、`project-storage.test.js` 的專案欄位 placeholder/trim 合約，以及 dashboard 讀取邏輯與 `audit-dashboard-browser-smoke.test.js` 的 fixture 渲染檢查。dashboard browser smoke 會拒絕未列入 fixture map 的 `output/` 請求，避免測試意外讀到本機最新輸出而掩蓋路徑漂移。

入口治理、首頁正式狀態治理、首頁版本治理、首頁公開狀態快照、Pages deploy / live smoke、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性、目前工作樹覆蓋率與非 formal 責任邊界變更需一併 staging `toolbox-entrypoints.contract.test.js`、`vercel.json` 與 `結構工具箱/assets/home/home.js`、`結構工具箱/assets/home/home.css`、`結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json`、`結構工具箱/assets/status/report-readiness-status.json`、`結構工具箱/assets/hy/colors_and_type.css`；跨家族報告揭露治理需一併 staging `結構工具箱/tools/report-disclosure.contract.test.js`，並讓 `report-disclosure-contract` 留在 preflight summary 中；交付物一致性治理需一併 staging `結構工具箱/tools/delivery-artifacts.contract.test.js`，並讓 `delivery-artifacts-contract` 留在 preflight summary 與 Global Governance Gates 中；這個契約現在要同時覆蓋 stone audit JSON / Word / PDF、覆工板 JSON / Word 與開挖 PDF / DOCX / latest download API。正式放行證據治理需一併 staging `結構工具箱/tools/release-readiness.contract.test.js`、`run-preflight-tools-release.bat` 與 dashboard 相關檔案，並讓 `release-readiness-contract` 留在 preflight summary 與 Global Governance Gates 中，且 release wrapper 必須固定保留 `ForceSlowChecks` 與 `ForcePlatformAudit`。這個合約會比對首頁入口、`routeFileMap`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案，要求 maturity matrix 外的正式卡片在 `governanceSources` 指向對應 preflight gate；其中風力 / 地震正式工具卡片需明列 `formal-traceability-contract`、`formal-tools-static` 與 `formal-browser-smoke`，RC 卡片的治理來源必須明列 `rc-traceability-contract`、`rc-audit-status`、`rc-column-report-contract`、`rc-shear-wall-report-contract`，Steel 卡片則必須明列 `steel-formal-regression`，Stone 卡片則必須明列 `stone-report-contract`。連續梁、平面剛架、斷面 / 合成斷面與局部快算卡片也要帶出對應的計算書 / 報表 / JSON 邊界 chip，讓首頁與成熟度矩陣一併揭露頁面專用「優先建議報告閱讀狀態」的報告邊界契約，而不是只剩一般 audit 標籤。首頁側欄的 `報告閱讀狀態總覽` 卡也要跟著 staging，確保 page-only 規則與已治理家族總覽會一起發布到工作頁，而不是只留在 matrix / preflight 輸出。也要求 `HOME_DATA_UPDATED` 與首頁卡片版本對齊工具頁 `APP_VERSION` / `TOOL_VERSION`，要求首頁狀態讀取 tracked `assets/status` 快照而不是 git ignored `output/`，要求 Pages deploy workflow 使用 `configure-pages`、`upload-artifact`、`deploy-pages`，排除 Markdown / script / test / contract / `dev_tools/` / source / backend / package 類非公開檔案，並在 deploy 後執行 `pages-live-smoke.js --check-private-boundary` 檢查公開首頁狀態、代表性公開工具頁、本機路徑洩漏與 artifact 邊界，並要求 `preflight-tools.ps1` 內執行的 `*.contract.test.js` 都列入本檔與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入本檔與 `TOOL_BOUNDARIES.md`，preflight helper script 清冊則要求 `.ps1` / `.bat` 入口列入 staging 與邊界文件，也要求本檔 `git add` 路徑必須在 checkout 中存在；git-aware 的 tracked deletion、未追蹤 ignored path 與目前 `git status` 變更覆蓋率由 preflight `staging-groups-coverage` gate 檢查，再用 `stateBoundaryRules` 確認非 formal 卡片的 limit / capability 沒有過度承諾。

注意事項：

- `run-preflight-tools-release.bat` 不得透傳 `%*` 或接受 `-Quick` 覆蓋；正式放行證據只能是 full run 加 `ForceSlowChecks` / `ForcePlatformAudit`。
- 不要把基礎局部工具放在 `結構工具箱/tools/基礎/`，目前 `.gitignore` 的 `基礎/` 規則會讓該資料夾被忽略。
- 初估型工具的標題、報表與 note 都應保留「初估 / 局部」語意，避免被誤用為完整規範設計。


## E. RC 正式工具與視覺回歸

這包集中 `鋼筋混凝土/` 的正式工具、共用核心、報表與 regression / browser smoke。內容多，提交前先用 `鋼筋混凝土/tools/test-*.ps1` 或 full preflight 驗證。

```powershell
git add -- "鋼筋混凝土/README.md" "鋼筋混凝土/audit-tool.ps1" "鋼筋混凝土/index.html"
git add -- "鋼筋混凝土/shared" "鋼筋混凝土/tools"
git add -- "鋼筋混凝土/tools/rc-traceability.catalog.json" "鋼筋混凝土/tools/rc-traceability.contract.test.js" "鋼筋混凝土/tools/beam-report-visual.test.js" "鋼筋混凝土/tools/beam-report-visual.contract.test.js" "鋼筋混凝土/tools/test-beam.ps1" "鋼筋混凝土/tools/column-report-visual.test.js" "鋼筋混凝土/tools/column-report-visual.contract.test.js" "鋼筋混凝土/tools/test-column.ps1" "鋼筋混凝土/tools/slab-report-visual.test.js" "鋼筋混凝土/tools/slab-report-visual.contract.test.js" "鋼筋混凝土/tools/test-slab.ps1" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-wall.ps1" "鋼筋混凝土/tools/shear-wall-report-visual.test.js" "鋼筋混凝土/tools/shear-wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-shear-wall-report.ps1" "鋼筋混凝土/tools/foundation-report-visual.test.js" "鋼筋混凝土/tools/foundation-report-visual.contract.test.js" "鋼筋混凝土/tools/test-foundation.ps1" "鋼筋混凝土/tools/single-pile-report-visual.test.js" "鋼筋混凝土/tools/single-pile-report-visual.contract.test.js" "鋼筋混凝土/tools/test-single-pile.ps1" "鋼筋混凝土/tools/audit-status.contract.test.js"
```

`鋼筋混凝土/tools` 內的 `rc-traceability.catalog.json` 是 RC 條文語意追蹤 catalog，需和 `rc-traceability.contract.test.js`、各 RC regression、`beam-report-visual.test.js`、`beam-report-visual.contract.test.js`、`test-beam.ps1`、`column-report-visual.test.js`、`column-report-visual.contract.test.js`、`test-column.ps1`、`slab-report-visual.test.js`、`slab-report-visual.contract.test.js`、`test-slab.ps1`、`wall-report-visual.test.js`、`wall-report-visual.contract.test.js`、`test-wall.ps1`、`shear-wall-report-visual.test.js`、`shear-wall-report-visual.contract.test.js`、`test-shear-wall-report.ps1`、`foundation-report-visual.test.js`、`foundation-report-visual.contract.test.js`、`test-foundation.ps1`、`single-pile-report-visual.test.js`、`single-pile-report-visual.contract.test.js`、`test-single-pile.ps1` 與 `audit-status.contract.test.js` 一起 staging。

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

`螺栓檢討/bolt-review-tool/` 是 `/anchor/` 部署鏡像的來源。這包提交原始碼；提交 `/anchor/` hash 資產前，先跑 `sync-anchor-deployment.ps1` 並用 B 包提交部署鏡像。新增規範路線、報告段落、workbook/docx 邊界或人工複核邊界時，需同步提交 `anchor-traceability.catalog.json`、package 內 `anchorTraceabilityCatalog.test.ts`，以及平台層 `螺栓檢討/anchor-traceability.contract.test.js` 與 `螺栓檢討/anchor-report.contract.test.js`。

```powershell
git add -- "螺栓檢討/bolt-review-tool/README.md" "螺栓檢討/bolt-review-tool/package.json" "螺栓檢討/bolt-review-tool/vite.config.ts"
git add -- "螺栓檢討/bolt-review-tool/src/App.css" "螺栓檢討/bolt-review-tool/src/App.tsx" "螺栓檢討/bolt-review-tool/src/confirmDialog.ts" "螺栓檢討/bolt-review-tool/src/defaults.ts" "螺栓檢討/bolt-review-tool/src/defaults.test.ts" "螺栓檢討/bolt-review-tool/src/useAuditTrail.ts" "螺栓檢討/bolt-review-tool/src/useProjectLibrary.ts" "螺栓檢討/bolt-review-tool/src/useWorkspaceHydration.ts"
git add -- "螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json" "螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts" "螺栓檢討/anchor-traceability.contract.test.js" "螺栓檢討/anchor-report.contract.test.js"
```

建議提交訊息：

```text
Replace anchor dialogs with in-app confirmations
```

## 下次提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
.\run-pages-artifact-smoke.ps1
git diff --check
git status --short --untracked-files=normal
```
