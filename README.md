# 結構工具平台 V1.6

這個資料夾目前已整理成一套分層式結構工具平台，並正式進入 `V1.6`。工具箱首頁已升級為弘一設計系統新版 `結構工具箱/index.html`（深藍 hero、構件子分頁與治理卡，依 `home.js` 單一資料源驅動）；原公文版主選單保留為 `結構工具箱/index-classic.html` 可隨時回退，本機伺服器 clean route 為 `/toolbox-home`。平台目前區分：

- `鋼構正式規範工具`
- `鋼筋混凝土工具`
- `耐風 / 耐震核心工具`
- `斷面性質與分析輔助工具`
- `連接件 / 錨栓 / 外牆固定工具`
- `施工臨時設施與高頻局部快算工具`

V1.6 的重點是額外新增公司內部 Web App 型工具入口，能同時看到：
- 正式規範核算模組
- 舊式頁面與輔助工具
- 服務型本機工具與靜態快算工具的啟動邊界
- 平台巡檢與健康狀態
- 各子系統的入口與摘要
- 搜尋、分類篩選與工具成熟度標籤

工具箱首頁改用七類力量來源與檢核目的：`結構分析力量`、`風力規範外力`、`地震力規範外力`、`構件承載力檢核`、`連接、附掛物與外牆構件`、`斷面、係數與資料查詢`、`施工臨設與現場快算`。`正式核算`、`初估 / 簡化`、`本機服務` 與 `舊版保留` 只作為工具卡標籤。首頁樣式與資料驅動工具清單位於 [結構工具箱/assets/home/](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/assets/home/home.js:1)，GitHub Pages 可讀的首頁狀態快照位於 `結構工具箱/assets/status/`，由 `tool-maturity-matrix.js --write` 從本機 `output/` 精簡產生；preflight 快照優先採用最新 full run，避免 quick run 覆蓋公開交付證據，且不直接部署完整巡檢輸出。

## 正式工具與入口

- 平台總入口：
  [結構工具箱/index.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/index.html:1)
- 平台巡檢儀表板：
  [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
  可直接檢視平台 history、preflight latest / full / quick、近期異常趨勢、耗時與最慢檢查。
- 鋼構正式規範工具：
  [鋼構工具/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/index.html:1)
- RC 工具入口：
  [鋼筋混凝土/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/index.html:1)
- 基礎局部檢核：
  [結構工具箱/tools/foundation/foundation-local.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/foundation/foundation-local.html:1)
- 設備局部荷重：
  [結構工具箱/tools/equipment/equipment-load.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/equipment/equipment-load.html:1)
- 擋土土壓局部快算：
  [結構工具箱/tools/earth/earth-pressure.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/earth/earth-pressure.html:1)
- 局部快算共同契約測試：
  [結構工具箱/tools/local-quick-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.contract.test.js:1)
- 局部快算 JSON 匯出 helper：
  [結構工具箱/tools/local-quick-export.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-export.js:1)
- 局部快算 JSON 匯出 helper 測試：
  [結構工具箱/tools/local-quick-export.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-export.test.js:1)
- 局部快算輸出一致性測試：
  [結構工具箱/tools/local-quick-output-consistency.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-output-consistency.test.js:1)
- 局部快算瀏覽器 smoke：
  [結構工具箱/tools/local-quick-browser-smoke.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-browser-smoke.test.js:1)
- 風力 / 地震正式頁瀏覽器 smoke：
  [結構工具箱/tools/formal-browser-smoke.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-browser-smoke.test.js:1)
- 風力 / 地震正式工具 manifest：
  [結構工具箱/tools/formal-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.manifest.json:1)
- 風力 / 地震正式工具 manifest runner：
  [結構工具箱/tools/formal-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.run.js:1)
- 風力 / 地震正式工具共同契約測試：
  [結構工具箱/tools/formal-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.contract.test.js:1)
- 風力 / 地震條文語意追蹤 catalog：
  [結構工具箱/tools/formal-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.catalog.json:1)
- 風力 / 地震條文語意追蹤契約測試：
  [結構工具箱/tools/formal-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.contract.test.js:1)
- 錨栓條文語意追蹤契約測試：
  [螺栓檢討/anchor-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/螺栓檢討/anchor-traceability.contract.test.js:1)
  - 以 `螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json` 與 `螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts` 為源頭，確認錨栓第17章、17.10、22.8.3、產品評估與補強鋼筋 traceability 仍可追到輸入、計算、報告、證據與人工複核邊界；平台 preflight 會以 `anchor-traceability-contract` 留下獨立通過紀錄，再由 `anchor-verify` 與 `anchor-route` 覆核原始碼與部署鏡像。
- 跨家族報告揭露契約測試：
  [結構工具箱/tools/report-disclosure.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/report-disclosure.contract.test.js:1)
  - 讀取 formal、RC、鋼構、錨栓、石材、覆工板與開挖擋土支撐 traceability catalog，要求每筆 trace 至少有一個人可讀報告落點、人工複核邊界與可追溯依據，並以 `report-disclosure-contract` 納入 preflight，避免報告把規範判定、初估 / 簡化或專案文件人工複核混在一起。
- 交付物一致性契約測試：
  [結構工具箱/tools/delivery-artifacts.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/delivery-artifacts.contract.test.js:1)
  - 追蹤覆工板 JSON 匯出 / Word 計算書與開挖擋土支撐 PDF / DOCX / latest download API 的輸出邊界，要求 traceability catalog、README、smoke fixture、報表產生器、下載端點與前端產出狀態一致，並以 `delivery-artifacts-contract` 納入 preflight 與 Global Governance Gates。
- 工具成熟度矩陣產生器：
  [結構工具箱/tools/tool-maturity-matrix.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/tool-maturity-matrix.js:1)
- GitHub Pages deploy / live smoke：
  [結構工具箱/tools/pages-live-smoke.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/pages-live-smoke.js:1)
  - 由 `.github/workflows/pages-deploy.yml` 在 `master` push 後以 GitHub Actions 發布 Pages artifact，deploy 成功後再檢查公開首頁、`home.js`、`結構工具箱/assets/status/*.json` 與代表性公開工具頁是否可讀，並拒絕公開頁出現本機工作目錄路徑；`--check-private-boundary` 會確認 Markdown、PowerShell / batch、測試檔、合約檔、`dev_tools/`、Python / TypeScript source、backend、package manifest 與本機註冊檔未被發布，避免首頁狀態卡再次依賴未部署的 `output/` 或公開 artifact 混入維護工具。
- 局部快算工具 manifest：
  [結構工具箱/tools/local-quick-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.manifest.json:1)
- 局部快算 manifest runner：
  [結構工具箱/tools/local-quick-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.run.js:1)
- 工具箱入口合約測試：
  [toolbox-entrypoints.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/toolbox-entrypoints.contract.test.js:1)
  - 驗證首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案一致；同時做首頁正式狀態治理、首頁版本治理、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性與目前工作樹覆蓋率，要求 maturity matrix 外的 `formal` 卡片必須在 `governanceSources` 標明對應 preflight gate，`HOME_DATA_UPDATED` 必須為 ISO 日期，首頁卡片版本需對齊工具頁 `APP_VERSION` / `TOOL_VERSION`，`preflight-tools.ps1` 內執行的 `*.contract.test.js` 需列入 `STAGING_GROUPS.md` 與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入兩份文件，preflight helper script 清冊要求 `.ps1` / `.bat` 入口列入 staging 指引與邊界文件；含非 ASCII 文字的 `.ps1` 必須保留 UTF-8 BOM，避免 Windows PowerShell 5.1 讀取中文路徑時 mojibake，`STAGING_GROUPS.md` 的 `git add` 路徑需在 checkout 中存在；git-aware 的 tracked deletion / ignored path / 目前工作樹覆蓋率由 preflight `staging-groups-coverage` gate 檢查，確認每個 `git status` 變更都落在 staging 或人工 review 分包，再以 `stateBoundaryRules` 檢查非 formal 責任邊界，避免 assist / reference / estimate / workflow / report / service / legacy / external 類工具過度承諾。

## 巡檢分層

- 鋼構巡檢：
  [鋼構工具/audit-tool.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/audit-tool.ps1:1)
  - 使用單一 Edge CDP browser runner 跑完 21 個實頁快照，減少 Playwright CLI 往返；若瀏覽器步驟 abort，仍會寫入 `audit-status.json` 供 preflight 判斷。
- RC 巡檢：
  [鋼筋混凝土/audit-tool.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/audit-tool.ps1:1)
- 規範核心巡檢：
  [結構工具箱/audit-core.ps1](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-core.ps1:1)
- 全平台總巡檢：
  [audit-all.ps1](/C:/Users/USER/Desktop/AI/小工具製作/audit-all.ps1:1)
- 平台摘要輕量刷新：
  [refresh-platform-status.ps1](/C:/Users/USER/Desktop/AI/小工具製作/refresh-platform-status.ps1:1)
- 平台 audit preflight 重用判定：
  [platform-audit-preflight.ps1](/C:/Users/USER/Desktop/AI/小工具製作/platform-audit-preflight.ps1:1)
- 高價值工具交付前檢查：
  [preflight-tools.ps1](/C:/Users/USER/Desktop/AI/小工具製作/preflight-tools.ps1:1)
- 錨栓 `/anchor/` 部署同步：
  [sync-anchor-deployment.ps1](/C:/Users/USER/Desktop/AI/小工具製作/sync-anchor-deployment.ps1:1)

`audit-all.ps1` 用來守住主平台的鋼構、RC 與規範核心，子 audit 以 `ProcessStartInfo` 執行，避免 Windows `Path` / `PATH` 環境鍵重複造成 `Start-Process` 失敗；`refresh-platform-status.ps1` 可在三個子系統 audit 已通過時，快速刷新平台摘要、歷史紀錄與 `platform-audit-decision.json`，讓 dashboard component hash 不會沿用舊 decision；`platform-audit-preflight.ps1` 會先判定三個子系統 audit-status 是否通過且比來源檔新，若新鮮即重用狀態並刷新平台摘要，若 stale / missing 則自動回到 `audit-all.ps1`；需要強制完整重跑時可用 `run-preflight-tools.bat -ForcePlatformAudit`。`preflight-tools.ps1` 則再納入風力路徑、連續梁、批次啟動檔 smoke、generated artifact boundary、工具箱入口合約（首頁入口 / routeFileMap / vercel.json / formal-tools.manifest.json / local-quick-tools.manifest.json / 首頁版本治理 / Pages deploy / Pages live smoke / preflight contract 文件化 / staging 指引可執行性 / 目前工作樹覆蓋率 / HOME_DATA_UPDATED / APP_VERSION / TOOL_VERSION）、鋼構 / RC / 規範核心 audit 狀態新鮮度、風力 / 地震正式工具與鋼構 traceability contract、平台摘要刷新、runtime stale pid 首尾 gate、錨栓 source verify 與 `/anchor/` 部署 fingerprint、石材、開挖擋土支撐、覆工板、鋼架、局部快算 manifest runner / 共同契約 / JSON 匯出 helper / 跨輸出一致性 regression / Edge 瀏覽器 smoke（含 `vercel.json` 乾淨路由、JSON 匯出按鈕、JSON round-trip 與列印計算書）、風力 / 地震正式工具 manifest runner（14 個正式 / 報表頁，含乾淨路由、桌機 / 手機橫向溢出、詳算式 / 簡易結果分流 regression、具備者的 JSON 匯出、列印計算書、示意圖角色、示意圖幾何與 pilot golden cases）、preflight latest summary / history 耗時、最慢檢查摘要、latest/history log 可追溯性與通過 log hygiene、基礎局部檢核、設備局部荷重與擋土土壓局部快算 smoke / regression，適合交付前或跨工具大改後執行。主檢查 summary 寫出後先重產工具成熟度矩陣（含 `goldenCaseRegression`、`jsonRoundTrip`、`referenceTraceability` 下一步品質欄位，且 N/A 不列入分數分母），再執行巡檢儀表板 final history contract、fixture browser smoke 與 live-output smoke；這讓 dashboard 讀到的是當輪 summary，避免新增 governance key 時被舊 summary 或 sourceHash stale 假失敗卡住。GitHub Pages deploy workflow 是部署防線，會以 Actions 發布 artifact，部署成功後檢查公開首頁與首頁狀態快照，不取代本機 preflight。修改 `螺栓檢討/bolt-review-tool` 後，請先跑 `sync-anchor-deployment.ps1` 更新 `anchor/` 與 `anchor/deployment-manifest.json`，否則 anchor route gate 會視為部署鏡像 stale。`run-preflight-tools-quick.bat` 只跑靜態契約、狀態新鮮度、輕量 parser/import/store smoke 與 runtime gate；完整 browser smoke、完整 backend tests、錨栓 verify、前端 build 與平台完整 audit 仍以 full preflight 為準。full preflight 只會對通過、來源未更新且狀態不超過 24 小時的慢測重用新鮮狀態，並在 history 記錄 `slowReuseKeys`；需要強制重跑慢測時可用 `run-preflight-tools.bat -ForceSlowChecks`；正式放行可直接用 `run-preflight-tools-release.bat`，它固定帶 `-ForceSlowChecks -ForcePlatformAudit`，避免誤用快取狀態。

RC 基礎工具的 `tools/test-foundation.ps1` 已串接基礎報告視覺 smoke：固定開啟獨立基腳與樁基／樁帽計算書，檢查 NG 摘要、主要檢核群組、逐層承載力表、無 `NaN` / `Infinity` / `undefined` / `null` / `∞`、無水平溢出，並輸出 PNG / PDF / JSON 稽核檔；列印模式也會確認工具列隱藏。

跨工具納入版本控管前，先參考 [TOOL_BOUNDARIES.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_BOUNDARIES.md:1) 與 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)，避免把案例輸出、暫存檔、Office 文件或本機依賴一起提交。

新增或重構工具、示意圖與列印計算書前，請先參考 [TOOL_REPORT_GUIDE.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_REPORT_GUIDE.md:1)。此檔固定說明示意圖、詳算式 / 簡易結果版面、計算書出具內容規範、JSON 匯出匯入與回歸檢查重點，避免重複踩到報告格式與工程依據文字問題。

## 巡檢啟動

- 鋼構：
  [run-audit.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/run-audit.bat:1)
- RC：
  [鋼筋混凝土/run-audit.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit.bat:1)
- 規範核心：
  [結構工具箱/run-audit-core.bat](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/run-audit-core.bat:1)
- 全平台：
  [run-audit-all.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all.bat:1)
- 全平台循環：
  [run-audit-all-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all-loop.bat:1)
- 高價值工具 preflight：
  [run-preflight-tools.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-preflight-tools.bat:1)
- 高價值工具 release preflight：
  [run-preflight-tools-release.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-preflight-tools-release.bat:1)
- 高價值工具 quick preflight：
  [run-preflight-tools-quick.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-preflight-tools-quick.bat:1)

## 最新平台摘要

- [platform-summary.md](/C:/Users/USER/Desktop/AI/小工具製作/output/audit/platform-summary.md:1)
- [platform-status.json](/C:/Users/USER/Desktop/AI/小工具製作/output/audit/platform-status.json:1)
- [platform-history.json](/C:/Users/USER/Desktop/AI/小工具製作/output/audit/platform-history.json:1)
- [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
- [preflight-summary.md](/C:/Users/USER/Desktop/AI/小工具製作/output/preflight/preflight-summary.md:1)
- [preflight-history.md](/C:/Users/USER/Desktop/AI/小工具製作/output/preflight/preflight-history.md:1)
- [tool-maturity-matrix.md](/C:/Users/USER/Desktop/AI/小工具製作/output/audit/tool-maturity-matrix.md:1)

## 巡檢閱讀方式

- 若要直接看全平台巡檢狀態與各模組摘要預覽，優先開啟
  [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
- 若要重新產生最新狀態，再依序使用：
  [run-audit-all.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all.bat:1)
  或
  [run-audit-all-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all-loop.bat:1)
