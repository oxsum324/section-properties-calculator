# 工具交付邊界

本檔用來區分「應納入版本控管的工具碼」與「只作為本機案例、輸出或參考資料的檔案」。原則是：可重跑的程式、測試、preflight 與必要部署資產可以進 repo；大型工程案例、Office/PDF 輸出、暫存資料與本機快取不進 repo。

## 目前建議狀態

| 區域 | 建議 | 理由 |
|---|---|---|
| `preflight-tools.ps1`、`run-preflight-tools.bat`、`run-preflight-tools-quick.bat`、`run-preflight-tools-release.bat` | 納入 | 已成為跨工具交付前檢查入口；quick / normal / release wrapper 需一起提交，release wrapper 固定強制慢檢查與平台 audit。 |
| `audit-all.ps1`、`refresh-platform-status.ps1`、`platform-audit-preflight.ps1`、`run-audit-all.bat`、`run-audit-all-loop.bat` | 納入 | 平台 audit orchestration 與 preflight 重用判定入口；`audit-all.ps1` 子 audit 採 `ProcessStartInfo` 執行，避免 Windows `Path` / `PATH` 環境鍵重複時 `Start-Process` 失敗，也避免子系統 audit 狀態新鮮但整體摘要或 dashboard decision hash 未刷新。 |
| `鋼構工具/run-audit.bat`、`鋼筋混凝土/run-audit.bat`、`結構工具箱/audit-core.ps1`、`結構工具箱/run-audit-core.bat` | 納入 | 子系統 audit wrapper 與規範核心 audit 入口；preflight helper script 清冊會檢查這些入口存在並列入 staging 文件。 |
| `開挖擋土支撐/start_html_mode.ps1`、`開挖擋土支撐/stop_html_mode.ps1` | 納入 | 開挖擋土支撐本機服務邊界 smoke 需要的啟停入口；工程資料仍排除。 |
| `開挖擋土支撐/excavation-traceability.catalog.json`、`開挖擋土支撐/excavation-traceability.contract.test.js` | 納入 | 開挖擋土支撐服務型工具的規範語意追蹤 catalog 與契約測試；集中確認分析輸出匯入、支撐 / 橫擋 / 斜撐 / 大角撐、柱與基礎、PDF / DOCX 報表、本機服務資料治理的來源、輸入、計算、報告、證據與人工複核邊界。 |
| `continuous-beam-regression.test.js`、`test-continuous-beam.ps1` | 納入 | 補齊根目錄連續梁回歸檢查。 |
| `stone-feedback.contract.test.js` | 納入 | 石材 V2、舊版與 baseline capture feedback 合約；確認通知、確認、範本管理與錯誤提示不回退原生 dialog。 |
| `石材固定/stone-traceability.catalog.json`、`石材固定/stone-traceability.contract.test.js` | 納入 | 石材 V2 條文語意追蹤 catalog 與契約測試；集中確認風力 / 耐震需求、錨栓與連接件、石材板塊與孔位、使用性與交付稽核的規範來源、輸入、計算、報告、證據與人工複核邊界。 |
| `struct-dx.contract.test.js` | 納入 | struct.dx 前端 feedback 合約；確認 diagnosis、verify engine、struct suite 三頁都有 action status outlet 與 helper。 |
| `decking-tools.contract.test.js` | 納入 | 覆工板前端 feedback 合約；確認套用、匯出與 reset 確認維持頁內狀態與受控確認流程。 |
| `覆工板/decking-traceability.catalog.json`、`覆工板/decking-traceability.contract.test.js` | 納入 | 覆工板條文語意追蹤 catalog 與契約測試；集中確認 HS20 / PC400 / 吊車載重、覆工板面 / 小梁 / 大梁彎剪撓度、大梁 Pu、共構柱、握裹、樁基、JSON / Word 報表與施工臨設邊界的規範來源、輸入、計算、報告、證據與人工複核邊界。 |
| `section-tools.contract.test.js` | 納入 | 根目錄斷面工具 feedback 合約；確認斷面性質、合成斷面與 RC 補強報表維持 inline status，不回退原生 alert。 |
| `browser-dialogs.contract.test.js` | 納入 | 全專案瀏覽器原生 dialog 合約；掃描 HTML/JS/TS/TSX，要求正式工具不回退 `alert` / `prompt`，並讓 `confirm` 只能經審核路徑保留。 |
| `anchor/` | 納入部署資產 | Vercel `/anchor/` 乾淨路由直接使用此輸出；hash asset 更新時舊檔刪除與新檔新增需一起提交，並同步 `anchor/deployment-manifest.json` 的 source fingerprint。 |
| `sync-anchor-deployment.ps1` | 納入 | 錨栓 React 工具的正式部署同步入口；以 `/anchor/` base build、受控清理 `anchor/assets`、複製 dist 並寫入部署 fingerprint manifest。 |
| `結構工具箱/tools/風力/*.html` | 納入 | 風力頁面共用報告路徑屬於平台可用性修正。 |
| `鋼構工具/audit-tool.ps1`、`鋼構工具/steel-audit-browser-runner.js` | 納入 | 鋼構自巡檢改由單一 Edge CDP browser runner 執行 21 個實頁快照，減少 Playwright CLI 往返；runner 逐情境 timeout，且 abort 會落 `audit-status.json` 供 preflight 判斷。 |
| `石材固定/` | 納入程式碼與必要離線 vendor，排除參考資料與輸出 | 已有 self_check、quick smoke、版本治理、golden samples、條文語意追蹤與交付流程；納入正式 V2 工具、測試、治理文件、必要 vendor，PDF/XLS/Word 範例、圖片、專案報告與舊版 HTML 不進 repo。 |
| `開挖擋土支撐/` | 納入程式碼，排除工程資料 | Backend tests、frontend build、launcher 靜態 smoke 與 traceability contract 已納入 preflight；只提交 `index.html`、backend/frontend 原始碼、設定、README、啟停腳本、traceability catalog / contract 與本目錄 `.gitignore`，不提交工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`。 |
| `覆工板/` | 納入程式碼，排除工程資料與輸出 | 已有 `index.html`、Python 報告產生器、固定 smoke fixture、條文語意追蹤與 preflight 產報檢查；Excel、PDF、doc/docx、抽圖、dump 與吊車參考資料不進 repo。 |
| `鋼架/` | 可納入 | 目前只有單一 HTML 靜態工具，preflight 已做基本 smoke。 |
| `結構工具箱/tools/foundation/` | 納入 | 基礎局部檢核為靜態快算工具，已拆 `foundation-local-core.js`、`foundation-local-golden-cases.js` 與 `foundation-local-core.test.js`，preflight 會跑 golden regression。注意不要改放到 `tools/基礎/`，會被根目錄 `基礎/` ignore 規則誤排除。 |
| `結構工具箱/tools/equipment/` | 納入 | 設備局部荷重為靜態快算工具，已拆 `equipment-load-core.js`、`equipment-load-golden-cases.js` 與 `equipment-load-core.test.js`，preflight 會跑接觸壓 / 分布壓 / 單點反力 regression。 |
| `結構工具箱/tools/earth/` | 納入 | 擋土土壓局部快算為靜態初估工具，已拆 `earth-pressure-core.js`、`earth-pressure-golden-cases.js` 與 `earth-pressure-core.test.js`，preflight 會跑 Rankine 土壓 / 水壓 / 簡化穩定 regression。 |
| `結構工具箱/tools/local-quick-tools.manifest.json` | 納入 | 高頻局部快算工具清冊；集中記錄路由、入口檔、核心檔、golden regression、smoke 標記與文件邊界，避免新增工具時只改頁面、漏改契約與 preflight。 |
| `結構工具箱/tools/local-quick-tools.run.js` | 納入 | manifest-driven 局部快算測試入口；由清冊呼叫 JSON 匯出 helper regression 與共同契約，preflight 以此作為局部快算總閘門。 |
| `結構工具箱/tools/local-quick-export.js` | 納入 | 高頻局部快算共用 JSON 匯出 helper；集中處理 payload 組裝、非有限數值序列化與下載動作，避免各頁匯出格式分歧。 |
| `結構工具箱/tools/local-quick-export.test.js` | 納入 | JSON 匯出 helper 的 Node stub regression；驗證 payload、預設檔名、MIME、click/remove/revoke 與 Infinity/NaN 序列化，不依賴瀏覽器下載事件。 |
| `結構工具箱/tools/local-quick-output-consistency.test.js` | 納入 | 局部快算跨輸出一致性 regression；以 manifest + golden cases 驗證 core result、JSON payload、summary/checks、schema、provenance 與 HTML 匯出/report metadata 的工具身份一致。 |
| `結構工具箱/tools/local-quick-browser-smoke.test.js` | 納入 | 局部快算 Edge/CDP 瀏覽器 smoke；啟動臨時靜態 server 並模擬 `vercel.json` rewrites，在 desktop/mobile viewport 載入首頁、乾淨路由與三個工具頁，檢查初始計算、JSON 匯出按鈕 payload、設備 / 土壓 JSON round-trip、列印計算書 metadata、script、console error 與橫向溢出。 |
| `結構工具箱/tools/formal-tools.manifest.json` | 納入 | 風力 / 地震正式工具清冊；集中記錄 14 個正式頁的路由、報表、JSON、示意圖、pilot golden cases 與 regression 期望，避免首頁、`vercel.json`、smoke 與文件漂移。 |
| `結構工具箱/tools/formal-tools.run.js` | 納入 | 正式工具 manifest runner；由清冊呼叫共同契約與正式頁 Edge 瀏覽器 smoke。工具成熟度矩陣由 `preflight-tools.ps1` 在主檢查 summary 寫出後統一重產與檢查，避免新增 governance key 時讀到舊 summary。 |
| `結構工具箱/tools/formal-tools.contract.test.js` | 納入 | 正式工具共同契約測試；集中確認 14 個正式工具檔案、首頁入口、乾淨路由、文件邊界、報表分流、示意圖角色與 golden case 欄位。 |
| `結構工具箱/tools/formal-browser-smoke.test.js` | 納入 | 風力 / 地震正式頁 Edge/CDP 瀏覽器 smoke；覆蓋 14 個正式 / 報表頁，包含 MWFRS、C&C、開放式屋面、女兒牆、表 2.10、2.11、2.12、2.15、招牌 / 燈桿、等值靜力、附屬構造物、雜項工作物與動力摘要頁的乾淨路由、桌機 / 手機橫向溢出、詳算式 / 簡易結果切換、具備者的 JSON 匯出、列印計算書與示意圖角色。 |
| `結構工具箱/tools/tool-maturity-matrix.js` | 納入 | 工具成熟度矩陣產生器；合併正式工具與局部快算 manifest，輸出治理覆蓋率與下一步品質欄位 JSON / Markdown 給巡檢儀表板讀取，並將最新 `output/` 結果精簡成首頁公開狀態快照 `結構工具箱/assets/status/*.json`。preflight 會在主檢查 summary 寫出後先重產矩陣，再執行 `audit-dashboard-contract-final`、browser smoke 與 live-output post-check，避免新增 governance key 時讀到舊 summary 或 sourceHash stale 假失敗。 |
| `結構工具箱/tools/pages-live-smoke.js`、`.github/workflows/pages-deploy.yml` | 納入 | GitHub Pages Actions 部署與上線後 smoke；workflow 在 `master` push 後 staging 靜態站台、以 `configure-pages@v6`、手動 tar、`upload-artifact@v6`、`deploy-pages@v5` 發布 Pages artifact，deploy 成功後再執行 live smoke，確認公開首頁、`home.js` 與 `結構工具箱/assets/status/*.json` 均可讀，且首頁不依賴 git ignored `output/` 路徑。`deploy-pages@v5` 需保留 `actions: read` 權限。 |
| `結構工具箱/tools/local-quick-tools.contract.test.js` | 納入 | 高頻局部快算共同契約測試；集中確認工具檔案、首頁入口、乾淨路由、README、邊界文件、staging 建議、頁面責任邊界與各工具 golden regression。 |
| `鋼構工具/steel-traceability.catalog.json`、`鋼構工具/steel-traceability.contract.test.js` | 納入 | 鋼構條文語意追蹤 catalog 與契約測試；集中確認鋼構正式入口、連接板、拉力構件、鋼梁與鋼柱的規範來源、輸入、計算、報告、證據與人工複核邊界。 |
| `螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json`、`螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts` | 納入 | 錨栓條文語意追蹤 catalog 與契約測試；集中確認第17章主強度、後置錨栓產品評估、17.10 耐震路徑、22.8.3 基板承壓與補強鋼筋替代 breakout 的規範來源、輸入、計算、報告、證據與人工複核邊界。 |
| `toolbox-entrypoints.contract.test.js` | 納入 | 工具箱入口合約；集中確認首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案存在性；執行首頁正式狀態治理、首頁版本治理、首頁公開狀態快照、Pages deploy / live smoke、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性、目前工作樹覆蓋率與非 formal 責任邊界檢查。maturity matrix 外的 `formal` 卡片需在 `governanceSources` 標明 RC / Steel / Anchor / Stone / Decking 等 preflight gate；`HOME_DATA_UPDATED` 必須為 ISO 日期，首頁版本需對齊工具頁 `APP_VERSION` / `TOOL_VERSION`；首頁狀態資料必須讀取 tracked `結構工具箱/assets/status/*.json`，不得依賴 git ignored `output/` 路徑；Pages deploy workflow 必須使用 `configure-pages`、`upload-pages-artifact`、`deploy-pages` 並在 deploy 後執行 `pages-live-smoke.js` 檢查公開首頁狀態；`preflight-tools.ps1` 執行的 `*.contract.test.js` 必須列入 `STAGING_GROUPS.md` 與本表；preflight JS 執行檔清冊要求具體 `.test.js` / `.run.js` 也列入 `STAGING_GROUPS.md` 與本表，preflight helper script 清冊要求 `.ps1` / `.bat` 入口也列入 staging 與本表；含非 ASCII 文字的 `.ps1` 必須保留 UTF-8 BOM，避免 Windows PowerShell 5.1 讀取中文路徑時 mojibake；`STAGING_GROUPS.md` 的 `git add` 路徑必須在 checkout 中存在；git-aware 的 tracked deletion、未追蹤 ignored path 與目前 `git status` 變更覆蓋率由 preflight `staging-groups-coverage` gate 檢查；assist / reference / estimate / workflow / report / service / legacy / external 卡片需符合 `stateBoundaryRules`，避免首頁、manifest、`tool-maturity-matrix.js` 與部署路由漂移。 |
| `結構工具箱/tools/audit-dashboard.contract.test.js` | 納入 | 巡檢儀表板歷程合約；確認 latest preflight summary 與 preflight history 的耗時 / 最慢檢查、quick/full/failure 狀態、慢測重用、每筆 latest record 的 latest/history log 追蹤、通過檢查 log hygiene、成熟度升級缺口與多案例門檻欄位都能被 dashboard 讀取。 |
| `結構工具箱/tools/audit-dashboard-browser-smoke.test.js` | 納入 | 巡檢儀表板瀏覽器 smoke；用 fixture 驅動 dashboard，並拒絕任何未列入 fixture map 的 `output/` 請求，確認 latest record 表格、pass/fail 狀態、exitCode、latest/history log 連結、preflight history 與成熟度矩陣在真實 Edge/CDP 渲染下可用。 |
| `結構工具箱/index.html` | 納入 | 正式工具箱首頁（弘一設計系統新版，依 `home.js` 單一資料源）；原公文版主選單保留為 `結構工具箱/index-classic.html` 可回退，clean route `/toolbox-home` 導向首頁。 |
| `結構工具箱/assets/home/` | 納入 | 首頁 Web App 的資料驅動工具清單、分類樣式與 inline SVG 小圖示；不再使用分類圖片資產。 |
| `結構工具箱/assets/status/` | 納入 | GitHub Pages 可讀的首頁公開狀態快照；由 `tool-maturity-matrix.js --write` 從 git ignored `output/` 精簡產生，只保留狀態、runId、失敗數、筆數、耗時與 sourceHash 等公開欄位，不保留本機絕對路徑。 |
| `結構工具箱/assets/hy/colors_and_type.css` | 納入 | 弘一首頁設計 token；只使用本機 / 系統字型，不載入遠端 Google Fonts，確保離線 preflight 與現場瀏覽器可用。 |
| `螺栓檢討/bolt-review-tool/` | 保持原工具碼與 deploy 輸出分流 | 原始 React 工具用 npm verify；`anchor/` 是部署鏡像。修改原始碼後先跑 `sync-anchor-deployment.ps1`，再跑 preflight。新增規範路線時同步更新 `src/anchor-traceability.catalog.json` 與 `src/anchorTraceabilityCatalog.test.ts`。 |

## 不進 repo 的類型

- `node_modules/`、`.vite/`、`.playwright-cli/`
- `tmp/`、`_tmp/`、`__pycache__/`、`.pytest_cache/`
- `output/`、測試 run log、release bundle
- 本機專案資料：`app_data/`
- 大型工程輸出與參考：PDF、Excel、Word、LibreOffice 暫存 profile
- 反查或抽取資料：`_extracted/`、dump 文字檔、OLE/EMF/WMF 圖檔
- 名稱剛好命中忽略規則的工具目錄，例如 `結構工具箱/tools/基礎/`；靜態工具應使用不被忽略的英文資料夾，如 `tools/foundation/`。

## 提交前檢查順序

1. `.\run-preflight-tools-quick.bat`
2. `.\run-preflight-tools-release.bat`
3. `git status --short --untracked-files=normal`
4. 修改錨栓原始碼後執行 `.\sync-anchor-deployment.ps1`。
5. 確認 `anchor/assets` 舊 hash 刪除與新 hash 新增成對出現，且 `anchor/deployment-manifest.json` 已更新。

實際 staging 分包請參考 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)。
