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
git add -- ".github/workflows/pages-deploy.yml" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "run-preflight-tools-ci.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js"
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
git diff --check -- README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/adr/0001-page-only-report-readiness.md ".github/workflows/pages-deploy.yml" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js" "toolbox-entrypoints.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
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
git add -- .gitignore README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/ docs/adr/0001-page-only-report-readiness.md .github/workflows/pages-deploy.yml .github/workflows/pr-validation.yml preflight-tools.ps1 run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-ci.bat run-preflight-tools-release.bat run-pages-artifact-smoke.ps1 sync-anchor-deployment.ps1 continuous-beam-regression.test.js test-continuous-beam.ps1 "連續梁分析.html" browser-dialogs.contract.test.js decking-tools.contract.test.js frame-analysis.contract.test.js pages-release-governance.contract.test.js pr-validation.contract.test.js section-tools.contract.test.js stone-feedback.contract.test.js struct-dx.contract.test.js toolbox-entrypoints.contract.test.js
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
git add -- "結構工具箱/core/ui/report.js" "鋼構工具/core/ui/report.js" "鋼構工具/core/formal-core-manifest.json" "結構工具箱/core/wind-report.js" "結構工具箱/core/ui/force-picker.js" "結構工具箱/core/ui/forces-receive.js" "結構工具箱/tools/formal-golden-harvest.js" "結構工具箱/tools/force-picker.html"
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

舊版附件包升級評估：新增或調整 `attachment-package-upgrade-assess.js` 時，必須同步 staging 回歸測試、`評估舊版附件包升級.bat`、事後驗證器欄位、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。評估器固定唯讀，先沿用事後完整性驗證；blocked 包不得提出升級捷徑，v1／v2 完整包只能回傳 review／CLI 1，並要求保留舊包、由原始工具重新確認與輸出、重新核可、另建 v3。不得原地修改舊包、補造 metadata、推算核可時間或自行產生正式附件；v3 完整包回傳 ready／CLI 0，任何完整性錯誤仍以 blocked／CLI 2 優先。逐份工作清單必須以產出工具、正規化版本與共享指紋配對，列出附件、來源、舊輸出時間、指紋及四項待辦；來源缺漏時標示外部可信來源，不得從報告反推輸入，v3／blocked 工作清單固定為空。測試需涵蓋多附件配對、來源缺漏、文字／JSON 同源，並以升級前後全目錄 SHA-256 快照證明零寫入。

舊版附件安全升級工作區：新增或調整 `attachment-package-upgrade-workspace.js` 時，必須同步 staging 測試、`建立舊版附件升級工作區.bat`、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。建立器只能在完整 v1／v2 包上另建工作區，且建立後仍為 review／CLI 1；不得複製舊附件、來源、metadata 或核可時間。內部 JSON／Markdown 待辦固定放在 `00_內部升級工作說明_勿附入主報告/`，可交給正式組包器的新檔案固定放在獨立的 `01_新組包來源/`，初始內容只能是空白子資料夾。輸出不得位於舊包內、包住舊包或覆寫既有資料夾，需採暫存後原子發布；測試必須以舊包 SHA-256 快照、精確工作區檔案清冊、核可欄位排除、發布失敗清理及 v3／blocked 不建工作區證明邊界。

升級工作區完成度閘門：新增或調整 `attachment-package-upgrade-workspace-check.js` 時，必須同步 staging 測試、`檢查舊版附件升級工作區.bat`、`attachment-package-build.js` 強制接線、preflight、Pages 私有清冊與三份治理文件。完成度檢查固定唯讀，需驗證 `WSP-` 工作清單指紋、JSON／Markdown 同源、兩區固定邊界，再以產出工具與共享舊指紋逐份唯一配對新計算書及新來源；新版本可不同，但新檔彼此的版本／案件／指紋需一致，且輸出、來源儲存與正式核可均不得早於工作區建立時間。缺件或未核可只能 review，指紋／控制邊界異常必須 blocked，只有全部完成可 ready。組包器辨識 `01_新組包來源` 後不得繞過此閘門，新 v3 輸出也不得落在工作區內。測試必須涵蓋空白工作區、複製舊檔仍不通過、全新輸出可組成驗證通過的 v3、內部審閱、來源／報告指紋不符、清單／Markdown／根目錄遭改寫、CLI 0／1／2／3 與全工作區 SHA-256 零寫入。

統一升級流程：新增或調整 `attachment-package-upgrade-flow.js` 時，必須同步 staging 測試、`舊版附件包升級流程.bat`、preflight、Pages 私有清冊與三份治理文件。入口只能辨識正式附件包、升級工作區與 `01_新組包來源`；具有正式／內部附件包邊界但清單遺失的輸入仍需送入驗證並 blocked，不得視為未知資料夾。v1／v2 只能建立安全工作區後停在 review，v3 ready 必須零變更，工作區只有完成度 ready 才能呼叫正式組包器；直接選新組包來源也必須回溯父工作區，不能繞過人工核可。測試需涵蓋三種輸入辨識、舊包零寫入、空白工作區不建包、完整工作區建立並驗證 v3、來源資料夾直入仍受閘門、v3 零變更、篡改／缺清單 blocked、工作區內輸出拒絕及 CLI 0／1／2／3。

外部升級歷程：新增或調整 `attachment-package-upgrade-history.js` 時，必須同步 staging 測試、統一流程 CLI／批次參數、preflight、Pages 私有清冊與三份治理文件。歷程位置需在舊包、工作區、來源區及新包之外，並於受管產物變更前完成安全／可寫驗證；收據不得含計算內容、輸入值或核可時間，只保留階段、狀態與指紋證據。JSON 收據需使用唯一 receiptId、`HIS-` 指紋、不可覆寫目標、同目錄暫存與原子更名；失敗必須清除暫存。測試需涵蓋預設外部路徑、四種邊界拒絕、寫入探針零殘留、指紋、無核可欄位、不可覆寫、原子發布失敗清理、ready／review／blocked 收據、v3 包零寫入及不安全歷程位置在動作前停止。

共用計算書文件狀態：調整 `結構工具箱/core/ui/report.js` 的核可方塊、內部審閱／正式附件頁尾、空白案件欄位省略或輸入變更撤銷核可時，必須同步 staging `section-tools.contract.test.js`、`continuous-beam-regression.test.js`、`frame-analysis.contract.test.js`、相關頁面、README、邊界文件、ADR、首頁／矩陣／dashboard 說明與 browser smoke。頁面診斷明細仍維持 page-only。

附件組包文件分類：調整 `attachment-package-check.js` 的 `文件狀態：內部審閱` 阻擋、`文件狀態：正式附件`、輸出／核可時間辨識與順序、追溯欄位、來源內容穩定性、來源符號連結／junction 或未分類 review 規則時，必須同步 staging 檢查／組包／事後驗證測試、三個批次入口與三份治理文件。計畫名稱、計畫編號與設計人可由主文承接；產出工具、版本、輸出時間與指紋仍依追溯規則檢查，正式附件另須具備有效核可時間，且核可不得早於輸出。專案 JSON 維持來源資料角色，不要求報告文件狀態或核可時間；來源在解析前後的 SHA-256 必須一致，組包時需再確認檢查完成、複製前、複製後與目標檔案雜湊完全相同，測試需模擬檢查後替換與複製期間變更皆失敗封閉。來源根目錄或內容含連結／junction 時必須 blocked 並列名，組包複製層還需逐層拒絕連結及確認實際來源未越界。`attachment-package-build.js` 只在 ready 後把正式文件與內部追溯資料分流，禁止覆寫既有輸出或留下半成品，並必須在暫存區呼叫同一驗證器，完整通過才原子發布；Windows 原子更名若短暫回傳 `EPERM`／`EACCES`／`EBUSY`，只能在目標仍不存在時有限重試，其他錯誤不得放寬。新建包的 v3 指紋需涵蓋檔案雜湊、追溯欄位、正式核可時間、計畫編號、建立時間、檢查摘要與正式／內部分流邊界，測試需證明各類 metadata 篡改會阻擋、輸出／核可／組包時間順序即使指紋重算一致仍會被驗證器阻擋，並保留既有 v1／v2 包相容測試；相容測試必須證明舊包仍可完成原版完整性核對，但狀態固定為 review／CLI 1，不得與 v3 的 ready／CLI 0 混同，且任何完整性錯誤都以 blocked／CLI 2 優先。事後驗證測試另需證明清單每一層 JSON 欄位唯一，字面重複及以跳脫序列表示的同名欄位即使解析後指紋吻合仍須失敗封閉；頂層、檢查摘要、分流邊界與附件紀錄還需採封閉欄位白名單，所有未定義欄位即使未影響指紋仍須阻擋。重複路徑、大小寫碰撞、非 NFC 名稱、Windows 保留名稱及尾端空白／句點也都必須阻擋，且大小寫碰撞即使指紋重算一致仍不得放行。驗證器還需對清單、README、全部附件及目錄結構建立讀取後與結束前雙快照；測試必須在第一次雜湊成功後改變附件，並確認只由第二次快照以 `package-changed-during-verification` 失敗封閉。驗證入口根目錄本身為 symlink／junction 時需直接 blocked，並以不受 Windows 大整數精度影響的原生身分欄位在結束前重驗；測試需模擬根目錄身分變更並確認同樣失敗封閉。測試也需證明自我驗證失敗時暫存與輸出皆不存在。`attachment-package-verify.js` 只讀取既有正式附件包，需阻擋清單／雜湊／指紋／README 不符、遺漏、額外項目、符號連結與路徑越界，且不得將驗證結果寫回包內。

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
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/core/direct-print-boundary.css" "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/project-storage.test.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/rendered-delivery-evidence.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/rendered-delivery-evidence.inventory.json" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/delivery-artifacts.contract.test.js" "結構工具箱/tools/release-readiness.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "結構工具箱/tools/attachment-package-check.js" "結構工具箱/tools/attachment-package-check.test.js" "結構工具箱/tools/檢查附件組包.bat" "結構工具箱/tools/attachment-package-build.js" "結構工具箱/tools/attachment-package-build.test.js" "結構工具箱/tools/建立正式附件包.bat" "結構工具箱/tools/attachment-package-verify.js" "結構工具箱/tools/attachment-package-verify.test.js" "結構工具箱/tools/驗證正式附件包.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-assess.js" "結構工具箱/tools/attachment-package-upgrade-assess.test.js" "結構工具箱/tools/評估舊版附件包升級.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace.js" "結構工具箱/tools/attachment-package-upgrade-workspace.test.js" "結構工具箱/tools/建立舊版附件升級工作區.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace-check.js" "結構工具箱/tools/attachment-package-upgrade-workspace-check.test.js" "結構工具箱/tools/檢查舊版附件升級工作區.bat" "結構工具箱/tools/attachment-package-build.js"
git add -- "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history.js" "結構工具箱/tools/attachment-package-upgrade-history.test.js" "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
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
git add -- "鋼筋混凝土/tools/rc-traceability.catalog.json" "鋼筋混凝土/tools/rc-traceability.contract.test.js" "鋼筋混凝土/tools/report-screenshot-quality.js" "鋼筋混凝土/tools/beam-report-visual.test.js" "鋼筋混凝土/tools/beam-report-visual.contract.test.js" "鋼筋混凝土/tools/test-beam.ps1" "鋼筋混凝土/tools/column-report-visual.test.js" "鋼筋混凝土/tools/column-report-visual.contract.test.js" "鋼筋混凝土/tools/test-column.ps1" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/slab-report-visual.test.js" "鋼筋混凝土/tools/slab-report-visual.contract.test.js" "鋼筋混凝土/tools/test-slab.ps1" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-wall.ps1" "鋼筋混凝土/tools/shear-wall.html" "鋼筋混凝土/tools/shear-wall-report-visual.test.js" "鋼筋混凝土/tools/shear-wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-shear-wall-report.ps1" "鋼筋混凝土/tools/foundation.html" "鋼筋混凝土/tools/foundation-report-visual.test.js" "鋼筋混凝土/tools/foundation-report-visual.contract.test.js" "鋼筋混凝土/tools/test-foundation.ps1" "鋼筋混凝土/tools/single-pile-designer.html" "鋼筋混凝土/tools/single-pile-report-visual.test.js" "鋼筋混凝土/tools/single-pile-report-visual.contract.test.js" "鋼筋混凝土/tools/test-single-pile.ps1" "RC補強斷面性質.html" "鋼筋混凝土/tools/retrofit-report-visual.test.js" "鋼筋混凝土/tools/test-retrofit-report.ps1" "鋼筋混凝土/tools/audit-status.contract.test.js"
```

`鋼筋混凝土/tools` 內的 `rc-traceability.catalog.json` 是 RC 條文語意追蹤 catalog，需和 `rc-traceability.contract.test.js`、各 RC regression、`report-screenshot-quality.js`、8 個正式輸出頁、各頁 `*-report-visual.test.js`／contract／`test-*.ps1` wrapper，以及 `audit-status.contract.test.js` 一起 staging；補強斷面對應的正式頁位於 repo root `RC補強斷面性質.html`。

建議提交訊息：

```text
Expand RC tool governance and report verification
```

## F. 鋼構正式頁與鋼構工具入口

這包集中 `鋼構工具/` 的正式頁、共用報表、manifest、樣式與 regression；`結構工具箱/tools/鋼構/` 是工具箱內的舊版 / 轉接頁，應與首頁狀態一起審查。`steel-formal.regression-test.js` 同時負責 HTML 彈窗型計算書的可讀文字抽檢、page-only wording 排除、四個正式工作頁的直接列印封鎖、舊版示意圖尺寸標註間距與圖面不可拆頁規則。

正式計算書若調整為 calculation-first 內容邊界，必須把共用 report helper、RC report helper、鋼構正式頁與 browser runner、風力 / 地震正式工具 manifest、跨家族 report-disclosure contract、ADR 與報告指南視為同一包審查。輸入模式、換算對照、流程顯示、輸出設定、符號詞典與長篇條文解釋只留在 HTML 畫面；採用值、公式代入、檢核結果、對應條文依據與必要人工複核限制才進入計算書，且檢核結論固定置於計算內容之後。

```powershell
git add -- "鋼構工具/app.js" "鋼構工具/tool-metadata.js" "鋼構工具/index.html" "鋼構工具/plate-check.html" "鋼構工具/core" "鋼構工具/steel-beam-formal.html" "鋼構工具/steel-beam-formal.js" "鋼構工具/steel-column-formal.html" "鋼構工具/steel-column-formal.js" "鋼構工具/steel-formal.regression-test.js" "鋼構工具/steel-audit-browser-runner.js" "鋼構工具/steel-traceability.catalog.json" "鋼構工具/steel-traceability.contract.test.js" "鋼構工具/steel-member-formal.css" "鋼構工具/styles.css" "鋼構工具/README.md" "結構工具箱/core/direct-print-boundary.css"
git add -- "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html"
git add -- "結構工具箱/core/ui/report.js" "鋼筋混凝土/shared/report.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/report-disclosure.contract.test.js"
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
git diff --check
git status --short --untracked-files=normal
```
