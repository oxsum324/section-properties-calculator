# Staging 分包建議

本檔目前扮演兩個角色：第一，記錄已發布到 `master` / GitHub Pages 的分包與證據；第二，保留下次同類變更可直接套用的 staging playbook。它不是目前待提交清單；若 `git status` 是 clean，以下 `git add` 區塊只作為未來變更時的審查邊界與 preflight coverage 來源。

## 目前狀態

- 工作樹基準：最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準，本文件不硬編碼自我引用的最新 commit hash，避免提交後立即失真。
- 狀態快照證據基準：以 tracked `結構工具箱/assets/status/preflight-summary.json` 與 `report-readiness-status.json` 的 `runId`、`sourcePath`、`sourceHash` 為準；承載提交由 `git log -1 --oneline` 查詢，不在本 ledger 重複硬編碼。
- 已落地提交：
  - `4944fa7 Harden page-only report readiness release evidence`
  - `b1a534e Expand report boundary governance across tools`
  - `d530816 Refresh anchor deployment assets`
  - `60f3c18 Update release status snapshots`
  - `2029758 Enforce formal attachment boundaries and rendered release evidence`
- 公開狀態快照正式放行基準：上述 tracked JSON 必須為 `quick=false`、`ForcePlatformAudit=true`、`ForceSlowChecks=true`、`recordsCount=passedCount`、post checks 全數通過，且沒有慢測或平台巡檢重用；當前 `runId` 直接讀取 JSON，不在本 ledger 複製。
- 公開狀態快照發布基準：最新 `Pages deploy` 必須為 completed/success，並以 `gh run list --workflow "Pages deploy" --limit 1` 查詢；workflow run ID 不在本 ledger 硬編碼。
- 報告閱讀狀態：`頁面專用`，page-only boundary `4/4`、可讀文字 `17/17`、瀏覽器 smoke `2/2`、首頁正式工具實際交付物渲染 `31/31`、補充報告 / 服務成品 `2/2`，issue `0`；此總覽只能出現在頁面或工具本身，不得附入計算書、列印輸出或 PDF，也不得寫入 Word / DOCX 或 workbook。
- 下列 A0~G 是下次同類變更的分包 playbook，不是目前待 staging 清單。

## A0. 報告閱讀狀態與 Pages release governance

已落地：`4944fa7 Harden page-only report readiness release evidence`。下次若再次調整頁面專用「優先建議報告閱讀狀態」、公開首頁狀態快照、Pages artifact 邊界或正式放行證據，這包仍應優先提交；它不納入錨栓 build hash 資產，也不納入 RC / Steel / 風力 / 地震工具頁本體的大量 UI 調整。

下次同類變更低風險可整檔 staging 的檔案：

```powershell
git add -- CONTEXT.md docs/adr/0001-page-only-report-readiness.md
git add -- ".github/workflows/pages-deploy.yml" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "push-pages-release.ps1" "push-pages-release.bat" "run-preflight-tools-ci.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js"
git add -- "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/tool-maturity-matrix.js"
git add -- "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

下次同類變更需要人工 hunk review，或改隨後續「報告邊界 / 跨家族 contract」包一起 staging：

- `STAGING_GROUPS.md`：若只提交 A0，需只挑 release ledger、A0 區塊與必要共同驗證 hunk，避免把其他 future playbook 調整混入。
- `TOOL_BOUNDARIES.md`：若只提交 A0，需只挑 Pages / status snapshot / page-only 邊界相關 hunk。
- `preflight-tools.ps1`：若只提交 A0，需只挑 `pagesReleaseGovernanceContractCommand`、`prValidationContractCommand` 與對應 `pages-release-governance-contract` / `pr-validation-contract` record hunk。
- `README.md`：若只提交 A0，需只挑 Pages / report-readiness 相關 hunk。
- `TOOL_REPORT_GUIDE.md`：若只提交 A0，需只挑 glossary / ADR / page-only 邊界 hunk。
- `toolbox-entrypoints.contract.test.js`：若整檔 staging，必須同步 staging 它引用的 contract / preflight / home source 變更。
- `結構工具箱/tools/report-disclosure.contract.test.js`、`結構工具箱/tools/audit-dashboard-browser-smoke.test.js`：依賴跨家族 report-boundary 變更，除非 A0 同時擴成報告邊界大包，否則不要整檔 staging。

提交前驗證：

```powershell
node .\pages-release-governance.contract.test.js
node .\pr-validation.contract.test.js
node .\toolbox-entrypoints.contract.test.js
node .\結構工具箱\tools\report-disclosure.contract.test.js
node .\結構工具箱\tools\tool-maturity-matrix.js --write --check
.\run-preflight-tools-release.bat
.\run-pages-artifact-smoke.ps1
.\push-pages-release.ps1 -VerifyOnly
git diff --check -- README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/adr/0001-page-only-report-readiness.md ".github/workflows/pages-deploy.yml" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "push-pages-release.ps1" "push-pages-release.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js" "toolbox-entrypoints.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
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
git add -- .gitignore README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/ docs/adr/0001-page-only-report-readiness.md .github/workflows/pages-deploy.yml .github/workflows/pr-validation.yml preflight-tools.ps1 run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-ci.bat run-preflight-tools-release.bat run-pages-artifact-smoke.ps1 push-pages-release.ps1 push-pages-release.bat sync-anchor-deployment.ps1 continuous-beam-regression.test.js test-continuous-beam.ps1 "連續梁分析.html" browser-dialogs.contract.test.js decking-tools.contract.test.js frame-analysis.contract.test.js pages-release-governance.contract.test.js pr-validation.contract.test.js section-tools.contract.test.js stone-feedback.contract.test.js struct-dx.contract.test.js toolbox-entrypoints.contract.test.js
git add -- platform-audit-preflight.ps1 refresh-platform-status.ps1 audit-all.ps1 run-audit-all.bat run-audit-all-loop.bat
git add -- "鋼構工具/run-audit.bat" "鋼筋混凝土/run-audit.bat" "結構工具箱/audit-core.ps1" "結構工具箱/run-audit-core.bat"
git add -- "開挖擋土支撐/start_html_mode.ps1" "開挖擋土支撐/stop_html_mode.ps1" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js" "開挖擋土支撐/backend/tests/release_report_artifacts.py"
git add -- index.html "斷面性質計算.html" "合成斷面性質.html" "RC補強斷面性質.html"
git add -- "解題/struct_dx/frontend/diagnosis.html" "解題/struct_dx/frontend/verify_engine.html" "解題/struct_dx/frontend/struct_suite.html"
git add -- "鋼構工具/audit-tool.ps1" "鋼構工具/steel-audit-browser-runner.js"
git add -- "結構工具箱/core/style.css" "結構工具箱/core/direct-print-boundary.css"
git add -- "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js"
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/core/wind-report.js" "結構工具箱/tools/風力" "結構工具箱/tools/地震力" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/wind-shared-profile.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "TOOL_REPORT_GUIDE.md"
git add -- ".github/workflows/pages-deploy.yml" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "run-pages-artifact-smoke.ps1" "開挖擋土支撐/index.html" "toolbox-entrypoints.contract.test.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
git add -- "結構工具箱/core/ui/report.js" "鋼構工具/core/ui/report.js" "鋼構工具/core/formal-core-manifest.json" "結構工具箱/core/wind-report.js" "結構工具箱/core/loads/loadcombo.js" "結構工具箱/core/ui/force-picker.js" "結構工具箱/core/ui/forces-receive.js" "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/local-quick-tools.contract.test.js" "結構工具箱/tools/formal-golden-harvest.js" "結構工具箱/tools/force-picker.html" "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html" "鋼筋混凝土/tools/beam.html" "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/shear-wall.html"
git add -- "結構工具箱/tools/地震力/seismic-force.html" "結構工具箱/tools/地震力/seismic-appendage.html" "結構工具箱/tools/地震力/seismic-misc.html" "結構工具箱/tools/地震力/seismic-dynamic.html"
git add -- "結構工具箱/tools/風力/wind-special.html"
git add -- "結構工具箱/tools/風力/wind-shared-profile.js" "結構工具箱/tools/風力/wind-overview.html" "結構工具箱/tools/風力/wind-kzt.html" "結構工具箱/tools/風力/wind-force.html" "結構工具箱/tools/風力/wind-cc.html" "結構工具箱/tools/風力/wind-object-frame.html" "結構工具箱/tools/風力/wind-object-solid.html" "結構工具箱/tools/風力/wind-object-tower.html" "結構工具箱/tools/風力/wind-open-roof.html" "結構工具箱/tools/風力/wind-parapet.html" "結構工具箱/tools/風力/wind-fence-sign.html" "結構工具箱/tools/風力/wind-lattice-tower.html" "結構工具箱/tools/風力/wind-sign-pole.html"
```

建議提交訊息：

```text
Add formal report traceability metadata
```

## B. 錨栓部署鏡像

已落地：`d530816 Refresh anchor deployment assets`。下次更新 `anchor/` 靜態部署輸出時，必須讓舊 hash 刪除、新 hash 新增與部署 fingerprint manifest 一起 staging；共用鏡像固定採 `./` 相對 base，才能同時支援 Pages 倉庫子路徑與 Vercel `/anchor/`。

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
git add -A -- anchor/index.html anchor/service-worker.js anchor/manifest.webmanifest anchor/deployment-manifest.json anchor/assets
```

提交前檢查：

```powershell
Select-String -Path "anchor/index.html","anchor/service-worker.js" -Pattern '\./assets/|BASE_PATH'
Get-Content "anchor/deployment-manifest.json"
```

建議提交訊息：

```text
Refresh anchor deployment assets
```

## C. 候選工具目錄

下次不建議直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件、`stone-traceability.catalog.json`、`stone-traceability.contract.test.js`、`stone-report.contract.test.js` 與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。注意：`dev_tools/`、Python helper、測試資料與本機註冊檔可留在 repo 供治理使用，但 GitHub Pages artifact 必須排除，避免 baseline / diagnostics / source / local launcher helper 等維護檔公開。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`（含 `backend/tests/release_report_artifacts.py`）、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`、`excavation-traceability.catalog.json`、`excavation-traceability.contract.test.js`、`excavation-report.contract.test.js`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。preflight 已做 launcher、traceability contract、report boundary contract、backend quick/full tests 與 frontend build；正式 release 的當輪 PDF、DOCX、latest download 副本與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/excavation-formal/`。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`、`decking-report.contract.test.js`、`decking-traceability.catalog.json`、`decking-traceability.contract.test.js`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile、Word 報告邊界 contract 與 traceability contract；正式 release 的當輪 DOCX 與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/decking-formal/`，不提交案件成品。
- `鋼架/`：目前只有 `平面剛架分析.html`，頁面 / 計算書邊界已由根目錄 `frame-analysis.contract.test.js` 治理；產出追溯與內部審閱／正式附件核可狀態必須與頁面本體及該 contract 一起 staging、一起審查。

舊版附件包升級評估：新增或調整 `attachment-package-upgrade-assess.js` 時，必須同步 staging 回歸測試、`評估舊版附件包升級.bat`、事後驗證器欄位、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。評估器固定唯讀，先沿用事後驗證；blocked 包不得提出升級捷徑，v1／v2 完整包只能回傳 review／CLI 1，並要求保留舊包、由原始工具重新確認與輸出、重新核可、另建 v3。不得原地修改舊包、補造 metadata、推算核可時間或自行產生正式附件；v3 完整包回傳 ready／CLI 0，任何完整性或工程內容錯誤仍以 blocked／CLI 2 優先。v3 驗證必須重新解析包內正式附件與來源 JSON，套用正向內容及文件狀態規則，並核對清單 metadata 與實際文字；測試需涵蓋同步改寫附件、雜湊、清單及附件包指紋後，空殼內容與 metadata 不一致仍被阻擋。逐份工作清單必須以產出工具、正規化版本與共享指紋配對，列出附件、來源、舊輸出時間、指紋及四項待辦；來源缺漏時標示外部可信來源，不得從報告反推輸入，v3／blocked 工作清單固定為空。測試需涵蓋多附件配對、來源缺漏、文字／JSON 同源，並以升級前後全目錄 SHA-256 快照證明零寫入。

舊版附件安全升級工作區：新增或調整 `attachment-package-upgrade-workspace.js` 時，必須同步 staging 測試、`建立舊版附件升級工作區.bat`、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。建立器只能在完整 v1／v2 包上另建工作區，且建立後仍為 review／CLI 1；不得複製舊附件、來源、metadata 或核可時間。內部 JSON／Markdown 待辦固定放在 `00_內部升級工作說明_勿附入主報告/`，可交給正式組包器的新檔案固定放在獨立的 `01_新組包來源/`，初始內容只能是空白子資料夾。輸出不得位於舊包內、包住舊包或覆寫既有資料夾，需採暫存後原子發布；測試必須以舊包 SHA-256 快照、精確工作區檔案清冊、核可欄位排除、發布失敗清理及 v3／blocked 不建工作區證明邊界。

升級工作區完成度閘門：新增或調整 `attachment-package-upgrade-workspace-check.js` 時，必須同步 staging 測試、`檢查舊版附件升級工作區.bat`、`attachment-package-build.js` 強制接線、preflight、Pages 私有清冊與三份治理文件。完成度檢查固定唯讀，需驗證 `WSP-` 工作清單指紋、JSON／Markdown 同源、兩區固定邊界，再以產出工具與共享舊指紋逐份唯一配對新計算書及新來源；新版本可不同，但新檔彼此的版本／案件／指紋需一致，且輸出、來源儲存與正式核可均不得早於工作區建立時間。缺件或未核可只能 review，指紋／控制邊界異常必須 blocked，只有全部完成可 ready。組包器辨識 `01_新組包來源` 後不得繞過此閘門，新 v3 輸出也不得落在工作區內。測試必須涵蓋空白工作區、複製舊檔仍不通過、全新輸出可組成驗證通過的 v3、內部審閱、來源／報告指紋不符、清單／Markdown／根目錄遭改寫、CLI 0／1／2／3 與全工作區 SHA-256 零寫入。

統一升級流程：新增或調整 `attachment-package-upgrade-flow.js` 時，必須同步 staging 測試、`舊版附件包升級流程.bat`、preflight、Pages 私有清冊與三份治理文件。入口只能辨識正式附件包、升級工作區與 `01_新組包來源`；具有正式／內部附件包邊界但清單遺失的輸入仍需送入驗證並 blocked，不得視為未知資料夾。v1／v2 只能建立安全工作區後停在 review，v3 ready 必須零變更，工作區只有完成度 ready 才能呼叫正式組包器；直接選新組包來源也必須回溯父工作區，不能繞過人工核可。測試需涵蓋三種輸入辨識、舊包零寫入、空白工作區不建包、完整工作區建立並驗證 v3、來源資料夾直入仍受閘門、v3 零變更、篡改／缺清單 blocked、工作區內輸出拒絕及 CLI 0／1／2／3。

外部升級歷程：新增或調整 `attachment-package-upgrade-history.js` 時，必須同步 staging 測試、統一流程 CLI／批次參數、preflight、Pages 私有清冊與三份治理文件。歷程位置需在舊包、工作區、來源區及新包之外，並於受管產物變更前完成安全／可寫驗證；收據不得含計算內容、輸入值或核可時間，只保留階段、狀態與指紋證據。JSON 收據需使用唯一 receiptId、`HIS-` 指紋、不可覆寫目標、同目錄暫存與原子更名；失敗必須清除暫存。測試需涵蓋預設外部路徑、四種邊界拒絕、寫入探針零殘留、指紋、無核可欄位、不可覆寫、原子發布失敗清理、ready／review／blocked 收據、v3 包零寫入及不安全歷程位置在動作前停止。

歷程唯讀索引：新增或調整 `attachment-package-upgrade-history-index.js` 時，必須同步測試、`檢查附件升級內部歷程.bat`、preflight、Pages 私有清冊與三份治理文件。索引器不得建立、修改、改名或刪除任何歷程、附件包或工作區檔案；需以封閉欄位、重複 JSON key、檔名語意、`HIS-` 指紋、動作／狀態一致性、完成摘要及雙快照驗證目前收據，並只在標準輸出產生不含完整路徑的 `HIX-` 集合指紋。刪除偵測必須依賴歷程資料夾外保存的可信 `valid` 基準：新增為 review，遺失或同 ID 改變為 blocked；基準放在歷程內、格式損壞、重複 ID／指紋或集合指紋不符都需失敗封閉。結果只代表歷程完整性，不得作為正式附件核可。

可信基準發布器：新增或調整 `attachment-package-upgrade-history-baseline.js` 時，必須同步測試、`建立附件升級可信基準.bat`、preflight、Pages 私有清冊與三份治理文件。發布前必須呼叫同一唯讀索引，只有 valid 可建立新基準；若指定舊基準，新增為 review、遺失或改變為 blocked，三者都不得寫出新檔。輸出需位於歷程外且不得包住歷程或經連結重新導向，禁止覆寫，並採獨占暫存、fsync、自我驗證與原子更名；失敗需清除暫存及本次新建的空資料夾。測試必須涵蓋有效預設發布、CLI、歷程零寫入、無完整路徑、既有檔拒絕、內含／外包路徑拒絕、空歷程 review、篡改 blocked、既有基準新增不發布與原子發布失敗清理。基準只供內部完整性比對，不得附入報告或作為正式核可。

可信基準版本前進：新增或調整 `attachment-package-upgrade-history-baseline-advance.js` 時，必須同步測試、`推進附件升級可信基準.bat`、preflight、Pages 私有清冊與三份治理文件。入口必須要求既有基準；完全相符時零寫入，純新增只能 review，只有明確 `--accept-additions` 且具複核人與依據時才可前進。遺失、同 ID 改變、收據或基準篡改及其他警告不得接受。輸出固定為不覆寫的外部目錄，內含新版 valid 基準與內部核准紀錄；核准紀錄需以 `HAD-` 指紋綁定新舊 SHA-256、`HIX-`、收據數及逐筆新增 `HIS-`。兩檔必須交叉驗證、回讀目前歷程並在歷程／舊基準雙快照不變後才整包原子發布；失敗需清除暫存及新建空父目錄。測試需涵蓋待核准 review、明確前進、無新增零寫入、CLI 0／1／2／3、舊基準零寫入、缺失／改變／篡改 blocked、路徑邊界、整包交叉驗證、SHA 篡改、原子更名失敗及發布前競態清理。內部核准不是正式附件核可。

可信基準版本鏈驗證：新增或調整 `attachment-package-upgrade-history-baseline-chain.js` 時，必須同步測試、`檢查附件升級可信基準版本鏈.bat`、前進包驗證、preflight、Pages 私有清冊與三份治理文件。入口必須唯讀掃描初始基準與逐代前進包，依 SHA-256 與核准紀錄建立單根、單終端線性鏈；逐段驗證封閉欄位、重複 JSON key、`HAD-`、新舊 `HIX-`、純新增集合及時間順序，最後只用終端基準比對目前歷程。缺口、分叉、合流、重複基準、替換、缺少核准、歷程遺失或改變均 blocked；終端相符為 valid，僅有尚待前進的合法新增為 review。檢查前後必須重驗版本鏈、外部初始基準與歷程快照；輸出不得含完整路徑、複核人或依據，只能以 `HCX-` 指紋表示鏈內容。測試需涵蓋多代有效鏈、外部初始基準、缺口、分叉、替換、重複基準、缺少／重複鍵核准、終端不符、待前進、空鏈、額外項目、競態與 CLI 0／1／2／3。結果不是正式附件核可或數位簽章。

案件附件治理總覽：新增或調整 `attachment-case-governance-overview.js` 時，必須同步測試、`檢查案件附件治理總覽.bat`、附件包驗證、版本鏈驗證、preflight、Pages 私有清冊與三份治理文件。入口只能組合既有判定，不得自行將 review 提升為 ready；附件包 ready 且版本鏈 valid 才能進入內部歸檔複核，任一 review 維持 review，任一 blocked 或檢查期間來源改變以 blocked 優先。正式附件包、外部歷程與版本鏈根目錄必須完全分離，外部初始基準也不得落入任一受管根目錄；檢查前後需比較四者快照。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露名稱、封閉摘要、下一步代碼及 `PKG-`／`HIX-`／`HCX-`／`GOV-` 指紋。測試需涵蓋 ready、待前進 review、附件包損壞、版本鏈缺件、外部初始基準、路徑重疊、競態、零寫入、資訊最小化、穩定指紋與 CLI 0／1／2／3。總覽不是正式附件核可或數位簽章。

單一案件根目錄入口：新增或調整 `attachment-case-governance-root.js` 時，必須同步測試、`檢查案件根目錄附件治理.bat`、案件治理總覽、preflight、Pages 私有清冊與三份治理文件。入口只能掃描直接子資料夾，以封閉結構辨識候選；正式附件包、外部歷程及可信基準鏈各恰好一組才可繼續，缺少、多組、跨角色、連結或無法讀取時均 blocked，不得用最新日期、名稱偏好或排序猜選。完成內層總覽後必須重掃候選並重驗三個已選目錄快照，任何競態改變以 blocked 優先。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露直接子目錄名稱、候選、下一步及 `CAS-`／既有治理指紋。測試需涵蓋標準與非標準名稱、唯一辨識、缺件、多候選、版本鏈損壞、候選競態、待前進、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。入口不是正式附件核可或數位簽章。

多案件附件治理總覽：新增或調整 `attachment-case-governance-portfolio.js` 時，必須同步測試、`檢查多案件附件治理總覽.bat`、單一案件根目錄入口、preflight、Pages 私有清冊與三份治理文件。入口只能掃描指定上層的直接子資料夾，以封閉治理候選辨識案件，其餘資料夾明列忽略；不得遞迴、依名稱猜測或改變個案判定。任一 blocked 使整批 blocked，否則任一 review 使整批 review，全部 ready 才能回報 ready。處置分群只能沿用個案問題與下一步代碼：P0 停止歸檔、P1 合法新增待基準前進、P2 相容性或其他人工確認；同案多重原因可列入多群，但各優先層級案件數只能依最高優先計一次，分群不得提升或降低原狀態。`--only-actionable` 與 `--priority` 只准縮減顯示集合；完整狀態、退出碼、總數及 `POR-` 指紋不得改變，視圖須標明全部案件指紋範圍、保留完整摘要與所有上層問題。檢查前後需重掃案件集合並重驗每案候選快照；上層連結、空集合或競態均 blocked。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露案件名稱、封閉摘要、優先群組、問題／下一步代碼及 `POR-`／既有治理指紋。測試需涵蓋多案 ready、review、blocked、不完整案件、非案件忽略、空集合、競態、多重原因、唯一優先計數、篩選不改狀態／退出碼／指紋、上層問題不隱藏、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。總覽不是正式附件核可或數位簽章。

多案件治理快照比較：新增或調整 `attachment-case-governance-portfolio-compare.js` 時，必須同步測試、`比較多案件附件治理總覽.bat`、完整多案件總覽、preflight、Pages 私有清冊與三份治理文件。只接受未篩選的完整 v1 總覽實體 JSON；必須封閉驗證欄位、重複鍵、大小、摘要、案件唯一性、狀態、邊界與可重算分群，並於比較後重驗兩份來源內容未變。比較按案件名稱分類新增、移除、改善、惡化、同狀態變更與未變；`CMP-` 必須綁定兩個 `POR-` 與差異。結果狀態不得低於目前批次健康，惡化或新增 blocked 亦必須 blocked，其他差異至少 review。`--only-blocking` 與可重複的 `--change` 只准縮減顯示案件及對應下一步；篩選結果須使用 comparison view、標明 `fingerprintScope=all-changes` 與完整／顯示／隱藏筆數，完整狀態、摘要、退出碼及 `CMP-` 指紋不得改變。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露快照檔名、案件名稱、狀態／優先層級、差異代碼與指紋。測試需涵蓋六類差異、目前 blocked／review 保留、純 metadata 改變、篩選視圖拒絕、阻擋聚焦、重複差異類型正規化、篩選不改狀態／摘要／退出碼／指紋、隱藏案件不從下一步洩漏、重複鍵、額外欄位、錯誤摘要、競態、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。比較器不是正式附件核可、版本前進或數位簽章。

多案件治理快照保存：新增或調整 `attachment-case-governance-portfolio-snapshot.js` 時，必須同步測試、`保存多案件附件治理快照.bat`、完整多案件總覽、比較器、preflight、Pages 私有清冊與三份治理文件。輸出資料夾必須與案件上層雙向分離且為實體路徑；檔名需綁定總覽時間與 `POR-`，同名不得覆寫。完整 JSON 應以排他暫存、fsync、比較器封閉規則回讀、相同時間重建總覽及發布前後來源快照重驗完成自我驗證，再以原子硬連結發布；目標競態不得覆寫，任一步失敗需清除暫存，已發布後才發現來源異動亦需撤回新檔。原總覽含 `portfolio-changed-during-read` 時不得保存；其餘穩定 ready／review／blocked 可保存且退出碼須維持 0／1／2。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露資料夾名稱、檔名、SHA-256、案件數與 `POR-`。測試需涵蓋三種狀態保存、讀取異動不保存、總覽二次確認、發布前後來源競態、暫存破壞、同名與外部目標競態不覆寫、來源零寫入、資訊最小化、暫存清理及 CLI 0／1／2／3。快照不是正式附件核可、版本前進或數位簽章。

多案件治理快照索引：新增或調整 `attachment-case-governance-portfolio-snapshot-index.js` 時，必須同步測試、`檢查多案件治理快照歷程.bat`、保存器、比較器、preflight、Pages 私有清冊與三份治理文件。索引根目錄須為實體資料夾，只接受發布器產生、檔名與內容時間／`POR-` 一致、link count 為 1 的完整 JSON；連結、子目錄、非 JSON、破損／重複 key、改名、同群組重複時間、檔案上限與索引期間變動均 blocked。依內含案件上層名稱分群，索引完整性與各群組最新快照健康分開計算，整體狀態不得較低；不足兩份為 review。最新兩版比較只接受單一群組專用資料夾；混合群組不得猜選，須 blocked 並要求分流。選定後沿用比較器及其篩選語意，完成後再重驗整個資料夾與全部有效快照；任何新增、移除、替換或內容變更均 blocked。`PSI-` 必須綁定群組、全部有效快照及問題；輸出不得含完整路徑、計算內容、複核人或依據。測試需涵蓋單份 review、穩定比較、退步 blocked、最新健康保留、多群組、重複時間、改名、損壞／重複 key、非 JSON、子目錄、硬連結、junction、索引與比較競態、穩定指紋、零寫入、資訊最小化及 CLI 0／1／2／3。索引與比較不是正式附件核可、版本前進或數位簽章。

多案件治理快照趨勢：新增或調整 `attachment-case-governance-portfolio-snapshot-trend.js` 時，必須同步測試、`分析多案件治理快照趨勢.bat`、索引、比較器、preflight、Pages 私有清冊與三份治理文件。輸入須先完整通過索引；只接受單一案件群組，少於兩份為 review 且不得建立趨勢，多群組或任何索引錯誤均 blocked，不得猜選。趨勢必須依內含時間逐一比較全部相鄰快照，分開保存目前健康、最新轉折、目前注意及歷史累計；狀態不得低於目前健康、最新轉折或目前注意，已改善的舊惡化只保留歷史，不能永久誤標目前 blocked。案件注意排序只能沿用目前狀態、既有 P0／P1／P2、最新惡化、目前移除與仍存在的反覆問題，不得宣稱量化風險分數。`TRD-` 必須綁定 `PSI-`、全部來源、相鄰 `CMP-`、狀態軌跡、案件趨勢、問題趨勢及分析問題；完成後再重驗整個資料夾與所有來源雜湊。輸出不得含完整路徑、計算內容、複核人或依據。測試需涵蓋穩定趨勢、惡化、改善、反覆案件／上層問題、目前移除、單份 review、多群組、無效檔、分析競態、穩定指紋、零寫入、資訊最小化及 CLI 0／1／2／3。趨勢不是正式附件核可、版本前進、風險評分或數位簽章。

多案件治理趨勢處置：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition.js` 時，必須同步測試、兩個處置批次入口、趨勢分析器、preflight、Pages 私有清冊與三份治理文件。處置資料夾必須與快照完全分離，收據只接受實體封閉 JSON、單一 link count、連續序號、時間不倒退、檔名一致及前一 `TRA-` 完整相接；異常、競態或同一有效目標重複收據均 blocked。案件移除 `DTE-` 必須綁定本次 missing 起點與最後出現時間；反覆問題 `DTE-` 必須綁定本次 active 起點、受影響案件集合及上層出現狀態，證據改變時舊收據不得沿用。唯讀組合結果完成前需同時重驗趨勢與收據鏈；發布需以處置上層排他鎖、排他暫存、fsync、封閉回讀、發布前趨勢／鏈重驗、原子硬連結及發布後雙重重驗完成；來源或鏈在任一邊界改變需撤回本次檔案。`TAI-` 綁定全鏈，`TDS-` 綁定目前適用狀態。結果不得揭露完整路徑、計算內容、複核人或依據。確認只能解除指定歷史型 P2 注意，狀態不得低於目前健康、最新轉折、P0 或 P1。測試需涵蓋空鏈、持續移除跨期適用、重新加入後再移除需重簽、反覆問題、受影響集合改變、目前 review 不提升、重複確認、破損／改名／非 JSON／硬連結／斷鏈、路徑重疊、暫存破壞、唯讀組合／來源／收據鏈／目標競態、原來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。處置不是正式附件核可、版本前進、風險評分或數位簽章。

多案件治理趨勢處置可信檢查點：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js` 時，必須同步測試、兩個檢查點批次入口、處置收據鏈、preflight、Pages 私有清冊與三份治理文件。檢查點輸出須與快照及處置鏈雙向分離；只接受封閉實體 JSON、單一 link count、內容一致檔名及標準時間。`TAC-` 必須綁定完整收據參照、每檔 SHA-256、終端 `TRA-` 與 `TAI-`，前進檔另綁定前一檢查點的檔名、`TAC-` 與 SHA-256。檢查必須使用明確指定的外部檢查點，不得自動猜選最新檔；鏈尾遭刪除時，即使剩餘前綴仍自洽也需 blocked，既有前綴變更 blocked，純新增 review。初始及前進都建立不可覆寫新檔；前進只接受完整相同前綴且必須明確 `--accept-additions`。發布需使用輸出上層排他鎖、排他暫存、fsync、封閉回讀、原子硬連結及發布前後快照／鏈／前一檢查點重驗，失敗撤回本次檔案且不得誤刪他人鎖。狀態不得低於目前處置結果，公開結果不得含完整路徑、複核人或依據。測試需涵蓋初始、完全相符、純新增、明確前進、尾端截斷、前綴改動、改名／重複 key／額外欄位／硬連結、路徑重疊、不可覆寫、暫存與來源競態、既有鎖保留、舊檢查點零修改、來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。檢查點不是正式附件核可、防竄改儲存或數位簽章。

多案件治理趨勢處置可信檢查點歷程：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js` 時，必須同步測試、歷程批次入口、可信檢查點、preflight、Pages 私有清冊與三份治理文件。歷程須與快照及處置鏈完全分離，明確指定的受信任終點必須是歷程根目錄中的直接實體檔案；不得依時間或檔名自動猜選。只接受封閉實體 JSON、單一 link count 與內容一致檔名；全鏈恰有一份 initial，advance 必須逐份綁定前一檔名、`TAC-` 及 SHA-256，保留完整收據前綴、增加收據數、正確記錄接受新增數，並維持案件群組、快照及處置資料夾範圍。缺檔、替換、改名、分叉、循環、回退、範圍切換、非 JSON、連結、硬連結或讀取競態均 blocked；指定終點後有合法新增則 review。`TCH-` 綁定有序全鏈，組合結果完成前須再驗治理快照、處置鏈、歷程及終點。狀態不得低於目前處置／工程狀態，輸出不得含完整路徑、複核人或依據。測試需涵蓋單檔、指定鏈尾、指定舊終點、尾端刪除後剩餘前綴自洽、缺中間檔、分叉、範圍變更、改名、非 JSON、硬連結、路徑重疊、讀取競態、目前 review 保留、來源零寫入、資訊最小化、穩定指紋與 CLI 0／1／2／3。歷程驗證不是正式附件核可、防竄改儲存或數位簽章。

附件治理工作區：新增或調整 `attachment-case-governance-workspace.js` 時，必須同步測試、兩個工作區批次入口、可信檢查點歷程、preflight、Pages 私有清冊與三份治理文件。設定資料夾須與快照、處置鏈及檢查點歷程完全分離；`TGW-` 必須綁定工作區名稱、相對於設定資料夾的三個已正規化來源路徑、受信任終點的檔名／`TAC-`／SHA-256、內部複核決定及前一設定身分。唯讀入口只接受單一 `--config`，設定檔必須是內容一致檔名的封閉實體 JSON 且 link count 為 1；解析後須確認來源拓撲、終點三重身分、檢查點歷程及目前處置狀態，完成前再次重讀設定、終點與全部來源。初始及前進皆以輸出上層排他鎖、排他暫存、fsync、封閉回讀、原子硬連結及發布前後重驗建立不可覆寫新檔；前進固定沿用前一設定名稱與來源，新終點須為舊終點後續檢查點，並綁定前一設定檔名、`TGW-` 及 SHA-256。改名、重複 key、額外欄位、硬連結、相對拓撲失效、終點替換、來源切換或競態均 blocked，既有鎖不得誤刪。公開結果不得含相對／完整路徑、複核人或依據，狀態不得低於目前工程狀態。測試需涵蓋初始、單檔 ready、合法終點前進、舊設定 review、前一設定鏈結、不可覆寫、終點三重身分不符、改名／重複 key／額外欄位／硬連結、相對拓撲、路徑重疊、暫存／來源／前一設定競態、既有鎖、工程 review 保留、來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。工作區設定不是正式附件核可、防竄改儲存或數位簽章。

共用計算書文件狀態：調整 `結構工具箱/core/ui/report.js` 的核可方塊、內部審閱／正式附件頁尾、空白案件欄位省略或輸入變更撤銷核可時，必須同步 staging `section-tools.contract.test.js`、`continuous-beam-regression.test.js`、`frame-analysis.contract.test.js`、相關頁面、README、邊界文件、ADR、首頁／矩陣／dashboard 說明與 browser smoke。頁面診斷明細仍維持 page-only。

附件組包文件分類：調整 `attachment-package-check.js` 的 `文件狀態：內部審閱` 阻擋、`文件狀態：正式附件`、輸出／核可時間辨識與順序、追溯欄位、來源內容穩定性、來源符號連結／junction 或未分類 review 規則時，必須同步 staging 檢查／組包／事後驗證測試、三個批次入口與三份治理文件。計畫名稱、計畫編號與設計人可由主文承接；產出工具、版本、輸出時間與指紋仍依追溯規則檢查，正式附件另須具備有效核可時間，且核可不得早於輸出。專案 JSON 維持來源資料角色，不要求報告文件狀態或核可時間；來源在解析前後的 SHA-256 必須一致，組包時需再確認檢查完成、複製前、複製後與目標檔案雜湊完全相同，測試需模擬檢查後替換與複製期間變更皆失敗封閉。來源根目錄或內容含連結／junction 時必須 blocked 並列名，組包複製層還需逐層拒絕連結及確認實際來源未越界。`attachment-package-build.js` 只在 ready 後把正式文件與內部追溯資料分流，禁止覆寫既有輸出或留下半成品，並必須在暫存區呼叫同一驗證器，完整通過才原子發布；Windows 原子更名若短暫回傳 `EPERM`／`EACCES`／`EBUSY`，只能在目標仍不存在時有限重試，其他錯誤不得放寬。新建包的 v3 指紋需涵蓋檔案雜湊、追溯欄位、正式核可時間、計畫編號、建立時間、檢查摘要與正式／內部分流邊界，測試需證明各類 metadata 篡改會阻擋、輸出／核可／組包時間順序即使指紋重算一致仍會被驗證器阻擋，並保留既有 v1／v2 包相容測試；相容測試必須證明舊包仍可完成原版完整性核對，但狀態固定為 review／CLI 1，不得與 v3 的 ready／CLI 0 混同，且任何完整性錯誤都以 blocked／CLI 2 優先。事後驗證測試另需證明清單每一層 JSON 欄位唯一，字面重複及以跳脫序列表示的同名欄位即使解析後指紋吻合仍須失敗封閉；頂層、檢查摘要、分流邊界與附件紀錄還需採封閉欄位白名單，所有未定義欄位即使未影響指紋仍須阻擋。重複路徑、大小寫碰撞、非 NFC 名稱、Windows 保留名稱及尾端空白／句點也都必須阻擋，且大小寫碰撞即使指紋重算一致仍不得放行。驗證器還需對清單、README、全部附件及目錄結構建立讀取後與結束前雙快照；測試必須在第一次雜湊成功後改變附件，並確認只由第二次快照以 `package-changed-during-verification` 失敗封閉。驗證入口根目錄本身為 symlink／junction 時需直接 blocked，並以不受 Windows 大整數精度影響的原生身分欄位在結束前重驗；測試需模擬根目錄身分變更並確認同樣失敗封閉。測試也需證明自我驗證失敗時暫存與輸出皆不存在。`attachment-package-verify.js` 只讀取既有正式附件包，需阻擋清單／雜湊／指紋／README 不符、遺漏、額外項目、符號連結與路徑越界，且不得將驗證結果寫回包內。
附件可見性證據：調整 `attachment-package-check.js`、`rendered-delivery-evidence.js` 或 PDF／HTML／DOCX／XLSX 可見內容判定時，必須把單元測試、`attachment-canonical-render-e2e.test.js`、同一個 `attachment-package-check` preflight key、README 與 `TOOL_BOUNDARIES.md` 一起 staging。E2E 需用實際 Edge 同次工作階段產出 PDF 與 canonical evidence，證明白字白底／列印隱藏文字不計入，並覆蓋 PDF SHA 竄改、evidence 改名重用、`visibleText.text`／SHA 竄改、偽造內容邊界／文件 profile 及 PDF metadata 不一致皆降 review；XLSX 測試另須涵蓋 hidden sheet／row／column 與隱藏欄存在時缺少 cell `r` 參照的 review 路徑。`pdftotext` 不得標示成 visible 或 OCR。
同一 preflight key 不得整體標成 slow：quick／CI 必須保留 `attachment-package-check.test.js`，只有 `-not $Quick -and -not $CI` 時才在單元測試成功後追加 Edge E2E。Profile 契約需由可見標題判定 book／summary family，完整追溯欄位提升為 `traceable-*`；測試須同時證明 traceable book／summary 正例、非 traceable 降級與 summary 偽造失敗，以及 `compiled-engineering-report` 的 book-family 相容性。

```powershell
git add -- "石材固定/石材計算書產生器_規範版V2.html" "石材固定/server.py" "石材固定/ui_smoke_test.py" "石材固定/js/code-profiles-registry.spec.js" "石材固定/js/code-profiles-registry-smoke.test.js" "石材固定/js/regression-smoke.test.js"
git add -- "石材固定/README.md" "石材固定/CHANGELOG.md" "石材固定/PROJECT_FILES.md" "石材固定/RELEASE_CHECKLIST.md" "石材固定/自我檢查.bat" "石材固定/stone-traceability.catalog.json" "石材固定/stone-traceability.contract.test.js" "石材固定/stone-report.contract.test.js"
git add -- "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js" "開挖擋土支撐/backend/tests/test_project_store.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/backend/tests/release_report_artifacts.py"
git add -- "覆工板/README.md" "覆工板/decking-report.contract.test.js" "覆工板/decking-traceability.catalog.json" "覆工板/decking-traceability.contract.test.js"
```

## D. 高頻局部快算工具

已納入 `結構工具箱/tools/` 下，適合獨立小包提交。這類工具應維持「HTML 只渲染、core.js 做計算、*.test.js 做 golden regression」的形態。

```powershell
git add -- "結構工具箱/tools/foundation/foundation-local.html" "結構工具箱/tools/foundation/foundation-local-core.js" "結構工具箱/tools/foundation/foundation-local-core.test.js" "結構工具箱/tools/foundation/foundation-local-golden-cases.js"
git add -- "結構工具箱/tools/equipment/equipment-load.html" "結構工具箱/tools/equipment/equipment-load-core.js" "結構工具箱/tools/equipment/equipment-load-core.test.js" "結構工具箱/tools/equipment/equipment-load-golden-cases.js"
git add -- "結構工具箱/tools/earth/earth-pressure.html" "結構工具箱/tools/earth/earth-pressure-core.js" "結構工具箱/tools/earth/earth-pressure-core.test.js" "結構工具箱/tools/earth/earth-pressure-golden-cases.js"
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/core/direct-print-boundary.css" "結構工具箱/core/loads/loadcombo.js" "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/project-storage.test.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/rendered-delivery-evidence.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/rendered-delivery-evidence.inventory.json" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/delivery-artifacts.contract.test.js" "結構工具箱/tools/release-readiness.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "結構工具箱/tools/calculation-book-content-boundary.json" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/attachment-package-check.js" "結構工具箱/tools/attachment-package-check.test.js" "結構工具箱/tools/檢查附件組包.bat" "結構工具箱/tools/attachment-package-build.js" "結構工具箱/tools/attachment-package-build.test.js" "結構工具箱/tools/建立正式附件包.bat" "結構工具箱/tools/attachment-package-verify.js" "結構工具箱/tools/attachment-package-verify.test.js" "結構工具箱/tools/驗證正式附件包.bat"
git add -- "結構工具箱/tools/rendered-delivery-evidence.js" "結構工具箱/tools/attachment-canonical-render-e2e.test.js" "preflight-tools.ps1" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
git add -- "結構工具箱/tools/attachment-package-upgrade-assess.js" "結構工具箱/tools/attachment-package-upgrade-assess.test.js" "結構工具箱/tools/評估舊版附件包升級.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace.js" "結構工具箱/tools/attachment-package-upgrade-workspace.test.js" "結構工具箱/tools/建立舊版附件升級工作區.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace-check.js" "結構工具箱/tools/attachment-package-upgrade-workspace-check.test.js" "結構工具箱/tools/檢查舊版附件升級工作區.bat" "結構工具箱/tools/attachment-package-build.js"
git add -- "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history.js" "結構工具箱/tools/attachment-package-upgrade-history.test.js" "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-index.js" "結構工具箱/tools/attachment-package-upgrade-history-index.test.js" "結構工具箱/tools/檢查附件升級內部歷程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline.test.js" "結構工具箱/tools/建立附件升級可信基準.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.test.js" "結構工具箱/tools/推進附件升級可信基準.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.test.js" "結構工具箱/tools/檢查附件升級可信基準版本鏈.bat"
git add -- "結構工具箱/tools/attachment-case-governance-overview.js" "結構工具箱/tools/attachment-case-governance-overview.test.js" "結構工具箱/tools/檢查案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-root.js" "結構工具箱/tools/attachment-case-governance-root.test.js" "結構工具箱/tools/檢查案件根目錄附件治理.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio.js" "結構工具箱/tools/attachment-case-governance-portfolio.test.js" "結構工具箱/tools/檢查多案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-compare.js" "結構工具箱/tools/attachment-case-governance-portfolio-compare.test.js" "結構工具箱/tools/比較多案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot.test.js" "結構工具箱/tools/保存多案件附件治理快照.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.test.js" "結構工具箱/tools/檢查多案件治理快照歷程.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.test.js" "結構工具箱/tools/分析多案件治理快照趨勢.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置.bat" "結構工具箱/tools/記錄多案件治理趨勢處置.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置檢查點.bat" "結構工具箱/tools/建立多案件治理趨勢處置檢查點.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置檢查點歷程.bat"
git add -- "結構工具箱/tools/attachment-case-governance-workspace.js" "結構工具箱/tools/attachment-case-governance-workspace.test.js" "結構工具箱/tools/檢查附件治理工作區.bat" "結構工具箱/tools/建立附件治理工作區.bat"
git add -- "結構工具箱/index.html" "結構工具箱/index-classic.html" "結構工具箱/assets/home/home.js" "結構工具箱/assets/home/home.css" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json" "結構工具箱/assets/hy/colors_and_type.css" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "vercel.json" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js"
```

局部快算計算書文件狀態變更必須把三個頁面、manifest、共用 renderer、共同契約、Edge/CDP browser smoke、成熟度矩陣與上述文件一起 staging。smoke 必須驗證空白案件欄位、預設內部審閱、核可正式附件及輸入變更撤銷核可；工程 review / blocked 不得再產生 DRAFT。工作頁直接列印仍只允許邊界通知。

工具成熟度矩陣輸出位於 `output/audit/tool-maturity-matrix.json` 與 `output/audit/tool-maturity-matrix.md`，屬於可重產生輸出，不建議 staging；首頁公開狀態快照位於 `結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json` 與 `結構工具箱/assets/status/report-readiness-status.json`，由 `tool-maturity-matrix.js --write` 依最新 `output/` 精簡產生，應與首頁狀態讀取邏輯一起 staging。quick preflight 只應以 `--preserve-homepage-status` 更新 ignored `output/audit` 矩陣，不應覆寫這三個 tracked 公開快照；正式放行或刻意刷新首頁狀態時才 staging 它們。應 staging 的是 `結構工具箱/tools/tool-maturity-matrix.js`、`formal-tools.manifest.json` 內的 golden cases、`local-quick-browser-smoke.test.js` 內的 JSON round-trip / 報告可讀文字抽檢、`project-storage.test.js` 的專案欄位 placeholder/trim 合約，以及 dashboard 讀取邏輯與 `audit-dashboard-browser-smoke.test.js` 的 fixture 渲染檢查。dashboard browser smoke 會拒絕未列入 fixture map 的 `output/` 請求，避免測試意外讀到本機最新輸出而掩蓋路徑漂移。

若本包調整風力 / 地震正式工具的 HTML 彈窗型計算書，`formal-tools.contract.test.js` 需同步保留輸出文字抽檢、共用核可狀態與 page-only wording 排除規則；`formal-browser-smoke.test.js` 必須實測內部審閱、正式附件、核可時間、空白欄位省略與輸入變更撤銷核可。調整案件 JSON 時，14 頁仍須驗證 schema、工具、版本與重現指紋。

入口治理、首頁正式狀態治理、首頁版本治理、首頁公開狀態快照、Pages deploy / live smoke、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性、目前工作樹覆蓋率與非 formal 責任邊界變更需一併 staging `toolbox-entrypoints.contract.test.js`、`vercel.json` 與 `結構工具箱/assets/home/home.js`、`結構工具箱/assets/home/home.css`、`結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json`、`結構工具箱/assets/status/report-readiness-status.json`、`結構工具箱/assets/hy/colors_and_type.css`；跨家族報告揭露治理需一併 staging `結構工具箱/tools/report-disclosure.contract.test.js`，並讓 `report-disclosure-contract` 留在 preflight summary 中；交付物一致性治理需一併 staging `結構工具箱/tools/delivery-artifacts.contract.test.js`，並讓 `delivery-artifacts-contract` 留在 preflight summary 與 Global Governance Gates 中；這個契約現在要同時覆蓋 stone audit JSON / Word / PDF、錨栓 HTML / XLSX / DOCX、覆工板 JSON / Word 與開挖 PDF / DOCX / latest download API。正式放行證據治理需一併 staging `結構工具箱/tools/release-readiness.contract.test.js`、`run-preflight-tools-release.bat` 與 dashboard 相關檔案，並讓 `release-readiness-contract` 留在 preflight summary 與 Global Governance Gates 中，且 release wrapper 必須固定保留 `ForceSlowChecks` 與 `ForcePlatformAudit`；release 尾段矩陣刷新需優先採用當輪通過的 full summary 與當輪完整渲染證據，latest 為 quick 或失敗時則回退最近一次通過的 full history，不得因 history manifest 尚未更新而發布失敗狀態。這個合約會比對首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案，要求 maturity matrix 外的正式卡片在 `governanceSources` 指向對應 preflight gate；其中風力 / 地震正式工具卡片需明列 `formal-traceability-contract`、`formal-tools-static` 與 `formal-browser-smoke`，RC 卡片的治理來源必須明列 `rc-traceability-contract`、`rc-audit-status`、`rc-column-report-contract`、`rc-shear-wall-report-contract`，Steel 卡片則必須明列 `steel-formal-regression`，Stone 卡片則必須明列 `stone-report-contract`。連續梁、平面剛架、斷面 / 合成斷面與局部快算卡片也要帶出對應的計算書 / 報表 / JSON 邊界 chip，讓首頁與成熟度矩陣一併揭露頁面專用「優先建議報告閱讀狀態」的報告邊界契約，而不是只剩一般 audit 標籤。首頁側欄的 `報告閱讀狀態總覽` 卡也要跟著 staging，確保 page-only 規則與已治理家族總覽會一起發布到工作頁，而不是只留在 matrix / preflight 輸出。也要求 `HOME_TOOL_UPDATES` 逐入口保存工具內容更新日，以 `releaseVerifiedAt` 對齊 tracked 正式放行快照，首頁卡片版本並須對齊工具頁 title / H1 / report metadata；要求首頁狀態讀取 tracked `assets/status` 快照而不是 git ignored `output/`，要求 Pages deploy workflow 使用 `configure-pages`、`upload-artifact`、`deploy-pages`，排除 Markdown / script / test / contract / `dev_tools/` / source / backend / package 類非公開檔案，並於 staged root 產生 `pages-deployment.json`，以 `sha256-tree-v1` 綁定當次 commit、Actions runId、attempt 與實際發布 tree digest；上線前與上線後 HTTP smoke 都必須比對同一 commit/runId，builder source 不得發布。archive / upload / deploy 前需對 staged `_site` 執行 HTTP private-boundary 與 86 組 Playwright browser smoke，任一失敗即阻擋發布；deploy 後再對正式網址重跑相同檢查。HTTP smoke 與共用 `run-pages-browser-smoke.sh` 必須同時服務兩階段且不得納入公開 artifact；staged gate 與本機預演不重試，只有正式 live 的 HTTP smoke 與 browser smoke遇到 HTTP 5xx 或明列暫態網路錯誤時，才可各自於 5 秒後完整重跑最多一次，非暫態或第二次持續失敗仍阻擋；HTTP 私有邊界遇到 5xx 也必須先判為暫態失敗，不得把 503 當成非 200 的通過證據。並要求 `preflight-tools.ps1` 內執行的 `*.contract.test.js` 都列入本檔與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入本檔與 `TOOL_BOUNDARIES.md`，preflight helper script 清冊則要求 `.ps1` / `.bat` 入口列入 staging 與邊界文件，也要求本檔 `git add` 路徑必須在 checkout 中存在；git-aware 的 tracked deletion、未追蹤 ignored path 與目前 `git status` 變更覆蓋率由 preflight `staging-groups-coverage` gate 檢查，再用 `stateBoundaryRules` 確認非 formal 卡片的 limit / capability 沒有過度承諾。

Pages provenance 變更還必須一併 staging 共用 artifact builder、manifest builder、workflow、HTTP smoke、local artifact wrapper 與兩份入口／release contract。Actions 與本機預演只能透過 `build-pages-artifact.js` 的 Git tracked＋非 ignored 清冊產生發布樹，不得再分別維護 `rsync` / `robocopy` 排除規則；暫存 Git index 必須套用 LF clean filter，讓 Windows 與 Linux 對同一內容得到相同 fileCount、totalBytes 與 digest。正式 workflow 在 staging 前須以 `git status --porcelain --untracked-files=all` 證明 checkout 乾淨，manifest 固定記錄並驗證 `sourceDirty: false`；本機預演則如實保存 dirty/clean，不得只以 HEAD SHA 誤示為完整來源。

RC 柱報告慢測治理：`rc-column-report-contract` 的 preflight 專屬上限為 `timeoutSeconds = 600`。調整柱報告視覺案例、人工複核完成／正式附件核可案例或 wrapper 時，必須同步 staging `preflight-tools.ps1`、入口契約、README 與邊界文件。

風力／地震正式報表慢測治理：`formal-browser-smoke` 的 preflight 專屬上限為 `timeoutSeconds = 600`。調整 14 個正式工具的桌面／行動版瀏覽器證據、渲染彙整或 runner 時，必須同步 staging `preflight-tools.ps1`、入口契約、README 與邊界文件。

首頁版本合約會同時檢查 `APP_VERSION`、`TOOL_VERSION`、title、H1、報告與 metadata；任一入口調整版本時，必須同步更新 `HOME_TOOL_UPDATES` 的逐工具日期與首頁版本。

注意事項：

- `run-preflight-tools-release.bat` 不得透傳 `%*` 或接受 `-Quick` 覆蓋；正式放行證據只能是 full run 加 `ForceSlowChecks` / `ForcePlatformAudit`。
- `結構工具箱/tools/rendered-delivery-evidence.js` 與 formal / local / steel browser runner 必須同批 staging；release 證據需落在當輪 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/`，不得只留下 HTML 字串檢查，且多頁 PDF 必須拒絕頁尾與資料列混在同一文字行、頁尾孤立章節標題、從孤立公式 / 單一資料列 / 無標籤片段起頁，以及文字量與渲染墨量同時過低的稀疏末頁。錨栓正式報告證據改動需同批 staging `螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts`、anchor report contract、rendered inventory 與 aggregate / release contract，並保留當輪 HTML、DOCX、XLSX 供總閘門解析 Office XML，不能只用 `anchor-report-contract` 日誌代替成品。石材正式報告證據改動則需同批 staging `石材固定/auto_word_artifact_test.py` 及相同治理檔，並保留當輪 PDF、DOCX、audit JSON。覆工板正式報告證據改動需同批 staging `覆工板/decking-report.contract.test.js`、rendered inventory、aggregate / delivery / release contract 與覆工板 README，並在 `decking-formal` 保留當輪 DOCX 與結構摘要供總閘門重新解析，不能依賴 `output/preflight/cover-slab-report-contract.docx` 或通過日誌。開挖正式報告證據改動需同批 staging `開挖擋土支撐/excavation-report.contract.test.js`、`backend/tests/release_report_artifacts.py`、aggregate / delivery / release contract、成熟度矩陣、首頁狀態顯示與開挖 README；`excavation-formal` 必須保留當輪 PDF、DOCX 與 latest download 副本。動力分析摘要證據改動需同批 staging `formal-browser-smoke.test.js`（若產報本體有變）、aggregate / release contract、成熟度矩陣、首頁狀態顯示與相關文件，並重新解析 `seismic-dynamic-formal-report.pdf` 及 evidence JSON。兩者合計為補充報告 / 服務成品 `2/2`，與首頁 `31/31` 分開計數。共用報告樣式與 RC 視覺 PDF 必須同批納入，確保標題跟隨內容、表格列不拆頁、跨頁表頭重複，以及 `uncontextualPageStartCount=0`；個別 RC 輸入群組若使用 `keepTogether`，對應工具頁與共用 report helper 也必須同批 staging。
- 不要把基礎局部工具放在 `結構工具箱/tools/基礎/`，目前 `.gitignore` 的 `基礎/` 規則會讓該資料夾被忽略。
- 初估型工具的標題、報表與 note 都應保留「初估 / 局部」語意，避免被誤用為完整規範設計。


## E. RC 正式工具與視覺回歸

這包集中 `鋼筋混凝土/` 的正式工具、共用核心、報表與 regression / browser smoke。內容多，提交前先用 `鋼筋混凝土/tools/test-*.ps1` 或 full preflight 驗證。

```powershell
git add -- "鋼筋混凝土/README.md" "鋼筋混凝土/audit-tool.ps1" "鋼筋混凝土/index.html" "鋼筋混凝土/tools/retrofit-report-visual.test.js" "鋼筋混凝土/tools/test-retrofit-report.ps1"
git add -- "鋼筋混凝土/shared" "鋼筋混凝土/tools"
git add -- "鋼筋混凝土/tools/rc-traceability.catalog.json" "鋼筋混凝土/tools/rc-traceability.contract.test.js" "鋼筋混凝土/tools/report-screenshot-quality.js" "鋼筋混凝土/shared/beam-rebar-designer.js" "鋼筋混凝土/shared/beam-rebar-designer.test.js" "鋼筋混凝土/tools/beam-regression.test.js" "鋼筋混凝土/tools/beam-report-visual.test.js" "鋼筋混凝土/tools/beam-report-visual.contract.test.js" "鋼筋混凝土/tools/test-beam.ps1" "鋼筋混凝土/tools/column-report-visual.test.js" "鋼筋混凝土/tools/column-report-visual.contract.test.js" "鋼筋混凝土/tools/test-column.ps1" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/slab-report-visual.test.js" "鋼筋混凝土/tools/slab-report-visual.contract.test.js" "鋼筋混凝土/tools/test-slab.ps1" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-wall.ps1" "鋼筋混凝土/tools/shear-wall.html" "鋼筋混凝土/tools/shear-wall-report-visual.test.js" "鋼筋混凝土/tools/shear-wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-shear-wall-report.ps1" "鋼筋混凝土/tools/foundation.html" "鋼筋混凝土/tools/foundation-report-visual.test.js" "鋼筋混凝土/tools/foundation-report-visual.contract.test.js" "鋼筋混凝土/tools/test-foundation.ps1" "鋼筋混凝土/tools/single-pile-designer.html" "鋼筋混凝土/tools/single-pile-report-visual.test.js" "鋼筋混凝土/tools/single-pile-report-visual.contract.test.js" "鋼筋混凝土/tools/test-single-pile.ps1" "RC補強斷面性質.html" "鋼筋混凝土/tools/retrofit-report-visual.test.js" "鋼筋混凝土/tools/test-retrofit-report.ps1" "鋼筋混凝土/tools/audit-status.contract.test.js"
```

`鋼筋混凝土/tools` 內的 `rc-traceability.catalog.json` 是 RC 條文語意追蹤 catalog，需和 `rc-traceability.contract.test.js`、各 RC regression、`report-screenshot-quality.js`、8 個正式輸出頁、各頁 `*-report-visual.test.js`／contract／`test-*.ps1` wrapper，以及 `audit-status.contract.test.js` 一起 staging；補強斷面對應的正式頁位於 repo root `RC補強斷面性質.html`。

建議提交訊息：

```text
Expand RC tool governance and report verification
```

## F. 鋼構正式頁與鋼構工具入口

這包集中 `鋼構工具/` 的正式頁、共用報表、manifest、樣式與 regression；`結構工具箱/tools/鋼構/` 是工具箱內的舊版 / 轉接頁，應與首頁狀態一起審查。`steel-formal.regression-test.js` 同時負責 HTML 彈窗型計算書的可讀文字抽檢、page-only wording 排除、四個正式工作頁的直接列印封鎖、舊版示意圖尺寸標註間距與圖面不可拆頁規則。

正式計算書若調整為 calculation-first 內容邊界，必須把共用 report helper、正向內容共用判讀器、PDF 驗證器、附件組包檢查器、RC report helper、鋼構正式頁與 browser runner、風力 / 地震正式工具 manifest、局部快算三頁及 browser smoke、跨家族 report-disclosure contract、ADR 與報告指南視為同一包審查。輸入模式、換算對照、流程顯示、輸出設定、符號詞典與長篇條文解釋只留在 HTML 畫面；採用值、公式代入、檢核結果、對應條文依據與必要人工複核限制才進入計算書，且檢核結論固定置於計算內容之後。成品 release 與日常附件組包必須依剖面通過採用輸入、計算／檢核過程、工程結果、至少兩個實際工程數值與必要追溯資訊；章名、狀態、版本、日期、時間與指紋不得充當工程數值。明確計算摘要可省略重複詳算但保留相同數值門檻，工作頁直接列印阻擋通知明確豁免正向計算內容。

```powershell
git add -- "鋼構工具/app.js" "鋼構工具/tool-metadata.js" "鋼構工具/index.html" "鋼構工具/plate-check.html" "鋼構工具/core" "鋼構工具/steel-beam-formal.html" "鋼構工具/steel-beam-formal.js" "鋼構工具/steel-column-formal.html" "鋼構工具/steel-column-formal.js" "鋼構工具/steel-formal.regression-test.js" "鋼構工具/steel-audit-browser-runner.js" "鋼構工具/steel-traceability.catalog.json" "鋼構工具/steel-traceability.contract.test.js" "鋼構工具/steel-member-formal.css" "鋼構工具/styles.css" "鋼構工具/README.md" "結構工具箱/core/direct-print-boundary.css"
git add -- "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html"
git add -- "結構工具箱/core/ui/report.js" "鋼筋混凝土/shared/report.js" "結構工具箱/tools/calculation-book-content-boundary.json" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/report-disclosure.contract.test.js"
git add -- "docs/adr/0003-calculation-book-content-boundary.md" "TOOL_REPORT_GUIDE.md" "TOOL_BOUNDARIES.md" "CONTEXT.md" "README.md" "STAGING_GROUPS.md"
```

`鋼構工具/steel-traceability.catalog.json` 是鋼構條文語意追蹤 catalog，需和 `steel-traceability.contract.test.js`、`audit-tool.ps1`、鋼構 regression / browser runner 與 dashboard maturity matrix 變更一起 staging。

建議提交訊息：

```text
Strengthen formal steel tool pages and reports
```

## G. 錨栓原始碼與部署鏡像前置

`螺栓檢討/bolt-review-tool/` 是 `/anchor/` 部署鏡像的來源。這包提交原始碼；提交 `/anchor/` hash 資產前，先跑 `sync-anchor-deployment.ps1` 並用 B 包提交部署鏡像。新增規範路線、報告段落、工作區備份 schema / 重現指紋、workbook/docx 邊界、正式產物留存或人工複核邊界時，需同步提交 `anchor-traceability.catalog.json`、package 內 `anchorTraceabilityCatalog.test.ts`、`backup.ts` / `backup.test.ts`、`useProjectLibrary.ts`、`attachmentReadiness.ts`、`reportDocumentState.ts`、對應報告 / 附件狀態測試、`tests/reportArtifacts.test.ts`，以及平台層 `螺栓檢討/anchor-traceability.contract.test.js`、`螺栓檢討/anchor-report.contract.test.js` 與 rendered delivery evidence 治理檔。只有 `src/` 或部署來源改動才需同步 `/anchor/` 鏡像；獨立 `tests/` 治理檔不屬於部署 fingerprint。

```powershell
git add -- "螺栓檢討/bolt-review-tool/README.md" "螺栓檢討/bolt-review-tool/package.json" "螺栓檢討/bolt-review-tool/vite.config.ts"
git add -- "螺栓檢討/bolt-review-tool/src/App.css" "螺栓檢討/bolt-review-tool/src/App.tsx" "螺栓檢討/bolt-review-tool/src/backup.ts" "螺栓檢討/bolt-review-tool/src/backup.test.ts" "螺栓檢討/bolt-review-tool/src/confirmDialog.ts" "螺栓檢討/bolt-review-tool/src/defaults.ts" "螺栓檢討/bolt-review-tool/src/defaults.test.ts" "螺栓檢討/bolt-review-tool/src/useAuditTrail.ts" "螺栓檢討/bolt-review-tool/src/useProjectLibrary.ts" "螺栓檢討/bolt-review-tool/src/useWorkspaceHydration.ts"
git add -- "螺栓檢討/bolt-review-tool/src/AttachmentReadinessPanel.tsx" "螺栓檢討/bolt-review-tool/src/attachmentReadiness.ts" "螺栓檢討/bolt-review-tool/src/attachmentReadiness.test.ts" "螺栓檢討/bolt-review-tool/src/reportDocumentState.ts" "螺栓檢討/bolt-review-tool/src/reportDocumentState.test.ts" "螺栓檢討/bolt-review-tool/src/reportExport.ts" "螺栓檢討/bolt-review-tool/src/reportExport.test.ts" "螺栓檢討/bolt-review-tool/src/reportDocx.ts" "螺栓檢討/bolt-review-tool/src/reportDocx.test.ts" "螺栓檢討/bolt-review-tool/src/reportWorkbook.ts" "螺栓檢討/bolt-review-tool/src/reportWorkbook.test.ts" "螺栓檢討/bolt-review-tool/src/useReportExports.ts"
git add -- "螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json" "螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts" "螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts" "螺栓檢討/anchor-traceability.contract.test.js" "螺栓檢討/anchor-report.contract.test.js"
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
.\push-pages-release.ps1 -VerifyOnly
git diff --check
git status --short --untracked-files=normal
```
