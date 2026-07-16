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

工具箱首頁改用七類力量來源與檢核目的：`結構分析力量`、`風力規範外力`、`地震力規範外力`、`構件承載力檢核`、`連接、附掛物與外牆構件`、`斷面、係數與資料查詢`、`施工臨設與現場快算`。`正式核算`、`初估 / 簡化`、`本機服務` 與 `過渡工具` 只作為工具卡標籤。首頁樣式與資料驅動工具清單位於 [結構工具箱/assets/home/](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/assets/home/home.js:1)，GitHub Pages 可讀的首頁狀態快照位於 `結構工具箱/assets/status/`，由 `tool-maturity-matrix.js --write` 從本機 `output/` 精簡產生；preflight 快照優先採用最新 full run，quick preflight 的矩陣 refresh 會帶 `--preserve-homepage-status`，避免 quick run 覆蓋公開交付證據，且不直接部署完整巡檢輸出。首頁健康卡會直接揭露 `完整檢查`、`快速檢查` 或 `正式放行` 模式與 `runId`，讓讀者能分辨目前頁面看到的是 quick、full 還是 release 證據。

## 正式工具與入口

- 平台總入口：
  [結構工具箱/index.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/index.html:1)
- 平台巡檢儀表板：
  [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
  可直接檢視平台 history、preflight latest / full / quick、近期異常趨勢、耗時與最慢檢查，並固定提醒頁面診斷明細不會寫入計算書、列印或 PDF；RC 梁柱若非 ready，內部檢討輸出會另帶 `DRAFT／非正式附件` 文件分類，並由附件組包檢查阻擋。首頁的頁面專用總覽另會顯示最近一次正式放行的實際交付物渲染完成數，但公開快照不包含交付檔名或案件內容。
- 鋼構正式規範工具：
  [鋼構工具/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/index.html:1)
- 鋼構正式頁 regression：
  [鋼構工具/steel-formal.regression-test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/steel-formal.regression-test.js:1)
  - 固定檢查連接板、拉力構件、鋼梁與鋼柱的正式頁、共用報表 helper、page-only 產報前檢查邊界；結果區的「輸出正式報表」與頁首輸出都走同一個可追溯報表流程，不直接列印工作頁。browser runner 會實際點擊結果區按鈕，把 HTML 彈窗型計算書轉成 PDF 與可讀文字，確認產出工具、工具版本、輸出時間、計算指紋、計畫資訊、主要章節，以及 page-only / 功能借鏡文字排除清單。
- 鋼梁 / 鋼柱既有案件延續頁：
  - 只供既有案件延續或復核比較；必須選擇用途並確認後，才可產生「舊案延續計算記錄」。頁面本體的直接列印不提供計算附件，新案正式計算附件必須由鋼梁 / 鋼柱正式頁產出。
- RC 工具入口：
  [鋼筋混凝土/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/index.html:1)
  - RC 梁、柱只有案件資料完整且計算狀態 ready 時才可作正式附件；非 ready 的計算書明確標示 `DRAFT／非正式附件`。若從工作頁直接使用瀏覽器列印，列印版固定顯示非正式附件邊界與 `DRAFT` 浮水印，必須改由「計算書」流程取得可判定附件狀態的輸出。
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
  - 在 Edge/CDP 內檢查三個局部快算頁的乾淨路由、JSON 匯出 / 回讀、詳算式與簡易結果列印計算書，並把報告 HTML 轉成可讀文字抽檢必要章節與 page-only wording 排除清單。
- 風力 / 地震正式頁瀏覽器 smoke：
  [結構工具箱/tools/formal-browser-smoke.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-browser-smoke.test.js:1)
- 風力 / 地震正式工具 manifest：
  [結構工具箱/tools/formal-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.manifest.json:1)
- 風力 / 地震正式工具 manifest runner：
  [結構工具箱/tools/formal-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.run.js:1)
- 風力 / 地震正式工具共同契約測試：
  [結構工具箱/tools/formal-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.contract.test.js:1)
  - 固定檢查正式工具 manifest、乾淨路由、報表分流、示意圖角色與 HTML 彈窗型計算書可讀文字，避免頁面專用「優先建議報告閱讀狀態」混入列印計算書。
- 耐風共用案件檔與一鍵預填契約：
  [結構工具箱/tools/wind-shared-profile.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/wind-shared-profile.contract.test.js:1)
  - `wind-overview.html` 以 `wind-shared-profile.v1` 保存案件識別、地點、地況、用途係數、Kzt 與主結構幾何；由總覽開啟 11 個支援工具時，會以明確欄位映射自動預填。只有主風力抵抗系統工具會承接總高、正整數樓層數與 X／Y 平面尺寸；屋頂平均高、屋簷高、風向專用尺寸、招牌與塔體等專用幾何不會由總覽代填，所有子工具仍須確認其專用幾何與規範路線。
- 風力 / 地震條文語意追蹤 catalog：
  [結構工具箱/tools/formal-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.catalog.json:1)
- 風力 / 地震條文語意追蹤契約測試：
  [結構工具箱/tools/formal-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.contract.test.js:1)
- 錨栓條文語意追蹤契約測試：
  [螺栓檢討/anchor-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/螺栓檢討/anchor-traceability.contract.test.js:1)
  - 以 `螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json` 與 `螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts` 為源頭，確認錨栓第17章、17.10、22.8.3、產品評估與補強鋼筋 traceability 仍可追到輸入、計算、報告、證據與人工複核邊界；平台 preflight 會以 `anchor-traceability-contract` 留下獨立通過紀錄，再由 `anchor-verify` 與 `anchor-route` 覆核原始碼與部署鏡像。
- 錨栓報告邊界契約測試：
  [螺栓檢討/anchor-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/螺栓檢討/anchor-report.contract.test.js:1)
  - 包裝 `reportExport` / `reportDocx` / `reportWorkbook` / `attachmentReadiness` 與 `reportArtifacts` 五組 vitest，確認「優先建議報告閱讀狀態」與頁面輔助文字只留在工作頁面，不混入錨栓計算書、列印 PDF 或 workbook/docx 輸出；正式 release 另會把同一案例實際序列化的 HTML、DOCX、XLSX 保存在當輪 `anchor-formal` 證據目錄。
- 石材報告邊界契約測試：
  [石材固定/stone-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/石材固定/stone-report.contract.test.js:1)
  - 包裝 `server_smoke_test.py` 內與匯出稽核最相關的三組測試，固定檢查 Word/PDF 匯出稽核摘要、頁面專用「優先建議報告閱讀狀態」清理與 payload HTML 不一致時的降級判定，避免 page-only 閱讀狀態混入正式交付。
- 跨家族報告揭露契約測試：
  [結構工具箱/tools/report-disclosure.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/report-disclosure.contract.test.js:1)
  - 讀取 formal、RC、鋼構、錨栓、石材、覆工板與開挖擋土支撐 traceability catalog，要求每筆 trace 至少有一個人可讀報告落點、人工複核邊界與可追溯依據，並以 `report-disclosure-contract` 納入 preflight，避免報告把規範判定、初估 / 簡化或專案文件人工複核混在一起。
- 交付物一致性契約測試：
  [結構工具箱/tools/delivery-artifacts.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/delivery-artifacts.contract.test.js:1)
  - 追蹤石材 audit JSON / Word / PDF、錨栓 HTML / XLSX / DOCX 報告、覆工板 JSON 匯出 / Word 計算書與開挖擋土支撐 PDF / DOCX / latest download API 的輸出邊界，要求 traceability catalog、README、smoke fixture、報表產生器、下載端點與前端產出狀態一致，並以 `delivery-artifacts-contract` 納入 preflight 與 Global Governance Gates。
- 正式放行證據契約測試：
  [結構工具箱/tools/release-readiness.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/release-readiness.contract.test.js:1)
  - 確認 `run-preflight-tools-release.bat` 固定帶 `-ForceSlowChecks` 與 `-ForcePlatformAudit` 且不透傳任意參數，preflight 本體也會拒絕 `-Quick` 與 release force flags 同時使用；`結構工具箱/tools/rendered-delivery-evidence.js` 會把風力 / 地震、局部快算與鋼構正式報表真正列印成 PDF，再以 Poppler 檢查頁數、可讀文字、非空白頁、稀疏末頁、頁邊截切、表格標題、閱讀順序、頁尾與內容不得混列、頁尾不得只剩孤立章節標題、每個續頁必須從章節 / 步驟 / 重複表頭開始，以及 page-only 文字排除；從孤立公式、單一資料列或無標籤片段起頁時，`uncontextualPageStartCount` 必須大於 0 並阻擋正式放行。共用列印樣式會讓章節標題跟隨後續內容、表格列不被拆頁，且跨頁表格重複表頭；短輸入群組可用明確的 `keepTogether` 標記局部保留，不對所有輸入表全面強制不跨頁。`結構工具箱/tools/rendered-delivery-evidence.inventory.json` 對齊首頁 31 個 formal 入口，`結構工具箱/tools/rendered-delivery-evidence.contract.test.js` 則彙整 RC、鋼構、風 / 震、局部快算、錨栓、石材與覆工板的當輪實際證據。錨栓正式報告會把當輪 HTML、DOCX、XLSX 保存在 `anchor-formal` 證據目錄，總閘門會重新解析 HTML、`word/document.xml` 與 XLSX workbook / worksheet XML，核對案名、章節、工作表、檔案尺寸與 page-only 排除清單，不再只接受 `anchor-report-contract` 日誌。石材正式報告會把當輪 PDF、DOCX 與 audit JSON 保存在 `stone-formal` 證據目錄，總閘門會重新解析 PDF 並核對 DOCX 簽章與 audit 尺寸，不再只接受測試日誌文字。覆工板正式報告會把當輪 DOCX 保存在 `decking-formal` 證據目錄，總閘門會重新解析 `word/document.xml`，核對案名、編號、日期、章節、段落、表格、檔案尺寸與 page-only 排除清單，不再接受固定共用路徑或測試日誌代替當輪成品。RC 平台 audit 延續執行各正式頁的 PNG / PDF 視覺 smoke，並共用同一套 PDF 分頁成品檢查。所有渲染證據寫入當輪 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/`，並由 `release-readiness-contract` 鎖住；preflight summary / history / homepage status 同時保留 force flags、慢測重用與平台 audit 重用資訊，避免把一般 full run 或 quick run 誤當正式放行證據。release 尾段 history manifest 尚未更新時，矩陣刷新必須優先讀取當輪通過的 full summary 與完整渲染證據；latest 為 quick 或失敗時則回退最近一次通過的 full history，不讓失敗 run 覆蓋公開成功快照。
- 工具成熟度矩陣產生器：
  [結構工具箱/tools/tool-maturity-matrix.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/tool-maturity-matrix.js:1)
  - 合併正式工具與局部快算 manifest，輸出 `reportTextSmoke` / `報告可讀文字抽檢`、golden case、JSON round-trip、reference traceability 等治理覆蓋率，讓首頁與巡檢儀表板能看見報告可讀性證據，但不把頁面閱讀狀態寫入計算書或列印 PDF。
- GitHub Pages deploy / live smoke：
  [結構工具箱/tools/pages-live-smoke.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/pages-live-smoke.js:1)
  - 由 `.github/workflows/pages-deploy.yml` 在 `master` push 後以 GitHub Actions 發布 Pages artifact，deploy 成功後再檢查公開首頁、`home.js`、`結構工具箱/assets/status/*.json` 與代表性公開工具頁是否可讀，並拒絕公開頁出現本機工作目錄路徑；`--check-private-boundary` 會確認 Markdown、`CONTEXT.md`、`docs/adr/`、PowerShell / batch、測試檔、合約檔、`dev_tools/`、Python / TypeScript source、backend、package manifest 與本機註冊檔未被發布，避免首頁狀態卡再次依賴未部署的 `output/` 或公開 artifact 混入維護工具。部署前可先跑 [run-pages-artifact-smoke.ps1](/C:/Users/USER/Desktop/AI/小工具製作/run-pages-artifact-smoke.ps1:1)，它會在本機 temp 目錄產生接近 Pages artifact 的靜態站台並呼叫同一支 smoke。
- Pull request validation：
  [.github/workflows/pr-validation.yml](/C:/Users/USER/Desktop/AI/小工具製作/.github/workflows/pr-validation.yml:1)
  - 每次送往 `master` 的 PR 會在 `windows-latest` 執行 `run-preflight-tools-ci.bat` 的 clean-checkout gate，以唯讀權限、無 secrets、限時 30 分鐘的方式建立狀態檢查；無論成功或失敗都保留 7 天的 preflight summary / history artifact。CI 模式只執行不依賴 ignored audit 狀態、本機 node_modules、Python 額外套件或本機工具檔的可重現契約；完整 46 項 quick 與正式 release preflight 仍須在交付工作站執行，CI 綠燈不得取代正式放行證據。`pr-validation.contract.test.js` 會鎖住觸發條件、權限、runtime 版本、wrapper、clean-checkout 邊界與證據路徑。
- 局部快算工具 manifest：
  [結構工具箱/tools/local-quick-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.manifest.json:1)
- 局部快算 manifest runner：
  [結構工具箱/tools/local-quick-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.run.js:1)
- 連續梁分析 regression：
  [continuous-beam-regression.test.js](/C:/Users/USER/Desktop/AI/小工具製作/continuous-beam-regression.test.js:1)
  - 固定檢查連續梁分析計算書的 HTML 輸出可讀文字、計畫資訊、支承反力、梁示意圖、剪力圖與彎矩圖，並排除頁面專用閱讀狀態。
- 斷面工具共同契約測試：
  [section-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/section-tools.contract.test.js:1)
  - 鎖住斷面性質、合成斷面與 RC 補強斷面頁的 inline status / 報表 payload 邊界，並把共享報表與 runtime HTML 轉成可讀文字檢查標題、計畫資訊、主要章節與 page-only wording 排除清單，避免頁面專用閱讀狀態混入正式報表。
- 平面剛架報告邊界契約測試：
  [frame-analysis.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/frame-analysis.contract.test.js:1)
  - 鎖住 `鋼架/平面剛架分析.html` 的頁面 / 計算書邊界，確認附件閱讀狀態只留在頁面，`printReport()` 實際產出的 blob 計算書具備足量可讀文字、必要分析章節與節點 / 桿件資料，且不帶 page-only wording，並維持彈性支承、分析組合、平衡檢核與響應式版面 smoke。
- 覆工板 Word 報告邊界契約測試：
  [覆工板/decking-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/覆工板/decking-report.contract.test.js:1)
  - 鎖住 `覆工板/report/gen_report.py` 與固定 smoke fixture 的 `.docx` 產報邊界，確認案名 / 編號 / 日期與主要章節仍會寫入 Word 計算書，但頁面上的附件閱讀狀態不會混入輸出；正式 release 另把當輪 DOCX 與結構摘要保存在 `decking-formal` 證據目錄，供平台總閘門重新解析。
- 開挖擋土支撐報告邊界契約測試：
  [開挖擋土支撐/excavation-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/開挖擋土支撐/excavation-report.contract.test.js:1)
  - 包裝 `backend.tests.test_reporting`，固定檢查 PDF 正式版與 Word 編修版共用同一套報表文字與下載邊界，並排除頁面專用的「優先建議報告閱讀狀態」與頁面輔助提醒。
- 工具箱入口合約測試：
  [toolbox-entrypoints.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/toolbox-entrypoints.contract.test.js:1)
  - 驗證首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案一致；同時做首頁正式狀態治理、首頁版本治理、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性與目前工作樹覆蓋率，要求 maturity matrix 外的 `formal` 卡片必須在 `governanceSources` 標明對應 preflight gate；其中風力 / 地震正式工具首頁治理來源需明列 `formal-traceability-contract`、`formal-tools-static` 與 `formal-browser-smoke`，RC 首頁治理來源除了 `rc-traceability-contract` 與 `rc-audit-status`，也必須帶出 `rc-column-report-contract`、`rc-shear-wall-report-contract`，鋼構首頁治理來源則需明列 `steel-formal-regression`，石材首頁治理來源則需明列 `stone-report-contract`。連續梁、平面剛架、斷面 / 合成斷面與局部快算卡片也必須帶出對應的計算書 / 報表 / JSON 邊界 chip，讓首頁與成熟度矩陣能明示頁面專用「優先建議報告閱讀狀態」仍受報告邊界契約保護，不會混入計算書、列印或 PDF。首頁側欄的 `報告閱讀狀態總覽` 狀態卡則固定提醒這個 page-only 規則，並把風 / 震 / 鋼構正式工具、RC、連續梁 / 斷面與補強頁、平面剛架、錨栓、石材、覆工板、開挖擋土支撐與局部快算納入同一個頁面層總覽。`HOME_TOOL_UPDATES` 必須逐入口保存 ISO 工具內容更新日，並以 `releaseVerifiedAt` 對齊 tracked 正式放行快照；首頁卡片版本需對齊工具頁 `APP_VERSION` / `TOOL_VERSION`，且 title、H1、報告與 metadata 的可見版本不得互相矛盾。`preflight-tools.ps1` 內執行的 `*.contract.test.js` 需列入 `STAGING_GROUPS.md` 與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入兩份文件，preflight helper script 清冊要求 `.ps1` / `.bat` 入口列入 staging 指引與邊界文件；含非 ASCII 文字的 `.ps1` 必須保留 UTF-8 BOM，避免 Windows PowerShell 5.1 讀取中文路徑時 mojibake，`STAGING_GROUPS.md` 的 `git add` 路徑需在 checkout 中存在；git-aware 的 tracked deletion / ignored path / 目前工作樹覆蓋率由 preflight `staging-groups-coverage` gate 檢查，確認每個 `git status` 變更都落在 staging 或人工 review 分包，再以 `stateBoundaryRules` 檢查非 formal 責任邊界，避免 assist / reference / estimate / workflow / report / service / legacy / external 類工具過度承諾。

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
- 案件附件組包一致性檢查：
  [attachment-package-check.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-check.js:1)
- 錨栓 `/anchor/` 部署同步：
  [sync-anchor-deployment.ps1](/C:/Users/USER/Desktop/AI/小工具製作/sync-anchor-deployment.ps1:1)

`audit-all.ps1` 用來守住主平台的鋼構、RC 與規範核心，子 audit 以 `ProcessStartInfo` 執行，避免 Windows `Path` / `PATH` 環境鍵重複造成 `Start-Process` 失敗；`refresh-platform-status.ps1` 可在三個子系統 audit 已通過時，快速刷新平台摘要、歷史紀錄與 `platform-audit-decision.json`，讓 dashboard component hash 不會沿用舊 decision；`platform-audit-preflight.ps1` 會先判定三個子系統 audit-status 是否通過且比來源檔新，若新鮮即重用狀態並刷新平台摘要，若 stale / missing 則自動回到 `audit-all.ps1`；需要強制完整重跑時可用 `run-preflight-tools.bat -ForcePlatformAudit`。`preflight-tools.ps1` 則再納入風力路徑、連續梁、批次啟動檔 smoke、generated artifact boundary、工具箱入口合約（首頁入口 / routeFileMap / vercel.json / formal-tools.manifest.json / local-quick-tools.manifest.json / 首頁版本治理 / Pages deploy / Pages live smoke / preflight contract 文件化 / staging 指引可執行性 / 目前工作樹覆蓋率 / HOME_TOOL_UPDATES / APP_VERSION / TOOL_VERSION）、鋼構 / RC / 規範核心 audit 狀態新鮮度、風力 / 地震正式工具與鋼構 traceability contract、平台摘要刷新、runtime stale pid 首尾 gate、錨栓 source verify、`/anchor/` 部署 fingerprint 與錨栓報告邊界 contract、石材、開挖擋土支撐報告邊界 contract、覆工板 Word 報告邊界 contract、平面剛架專屬報告邊界 contract、局部快算 manifest runner / 共同契約 / JSON 匯出 helper / 跨輸出一致性 regression / Edge 瀏覽器 smoke（含 `vercel.json` 乾淨路由、JSON 匯出按鈕、JSON round-trip 與列印計算書）、風力 / 地震正式工具 manifest runner（14 個正式 / 報表頁，含乾淨路由、桌機 / 手機橫向溢出、詳算式 / 簡易結果分流 regression、具備者的 JSON 匯出、列印計算書、示意圖角色、示意圖幾何與 pilot golden cases）、preflight latest summary / history 耗時、最慢檢查摘要、latest/history log 可追溯性與通過 log hygiene、基礎局部檢核、設備局部荷重與擋土土壓局部快算 smoke / regression，適合交付前或跨工具大改後執行。主檢查 summary 寫出後先重產工具成熟度矩陣（含 `goldenCaseRegression`、`jsonRoundTrip`、`referenceTraceability` 下一步品質欄位，且 N/A 不列入分數分母），再執行巡檢儀表板 final history contract、fixture browser smoke 與 live-output smoke；這讓 dashboard 讀到的是當輪 summary，避免新增 governance key 時被舊 summary 或 sourceHash stale 假失敗卡住。quick preflight 的兩次矩陣 refresh 會保留 tracked 首頁公開狀態快照，只更新 ignored `output/audit`，避免本機 quick 驗證污染正式 release 快照。GitHub Pages deploy workflow 是部署防線，會以 Actions 發布 artifact，部署成功後檢查公開首頁與首頁狀態快照，不取代本機 preflight；部署前可用 `run-pages-artifact-smoke.ps1` 做本機 artifact 預演。若只是用 repo root 的臨時 HTTP server 做本機預覽，可對 `pages-live-smoke.js` 加 `--allow-local-output`，只跳過本機 `/output/` 路徑可讀性的假陽性，不放寬公開站檢查。修改 `螺栓檢討/bolt-review-tool` 後，請先跑 `sync-anchor-deployment.ps1` 更新 `anchor/` 與 `anchor/deployment-manifest.json`，否則 anchor route gate 會視為部署鏡像 stale。`run-preflight-tools-quick.bat` 只跑靜態契約、狀態新鮮度、輕量 parser/import/store smoke 與 runtime gate；完整 browser smoke、完整 backend tests、錨栓 verify、前端 build 與平台完整 audit 仍以 full preflight 為準。full preflight 只會對通過、來源未更新且狀態不超過 24 小時的慢測重用新鮮狀態，並在 history 記錄 `slowReuseKeys`；需要強制重跑慢測時可用 `run-preflight-tools.bat -ForceSlowChecks`；正式放行可直接用 `run-preflight-tools-release.bat`，它固定帶 `-ForceSlowChecks -ForcePlatformAudit`，避免誤用快取狀態。

附件整理完成、送出計算附件前，可將附件資料夾拖曳到 `結構工具箱/tools/檢查附件組包.bat`，或執行 `node 結構工具箱/tools/attachment-package-check.js --input <附件資料夾> --project-no <計畫編號>`。它讀取 PDF、DOCX、XLSX、JSON、HTML 與文字附件，會自動略過 `.evidence.json`、成對的文字擷取檔與渲染摘要等驗證中間檔，並將舊案的 `V4.0`、`工具.v1` 等版本值正規化為 `v…` 後比對，檢查案件資訊、同工具版本、計算指紋重複與頁面專用文字；含「非正式附件」「內部檢討版」或「不得作為正式附件」等 DRAFT 文件標記時會直接阻擋組包，附件缺少產出工具、版本或輸出時間時則要求人工確認。結果只供內部組包整理，不得附入計算書、列印或 PDF。若需要保留機器可讀結果，另以 `--output <內部檢查結果.json>` 指定存放於附件資料夾外的位置。

RC 基礎工具的 `tools/test-foundation.ps1` 已串接基礎報告視覺 smoke：固定開啟獨立基腳與樁基／樁帽計算書，檢查 NG 摘要、主要檢核群組、逐層承載力表、無 `NaN` / `Infinity` / `undefined` / `null` / `∞`、無水平溢出，並輸出 PNG / PDF / JSON 稽核檔；列印模式也會確認工具列隱藏。

工具成熟度矩陣的下一步品質欄位同時包含 `reportTextSmoke`、`goldenCaseRegression`、`jsonRoundTrip` 與 `referenceTraceability`；其中 `reportTextSmoke` 只揭露報告可讀文字抽檢是否已被 smoke / contract 覆蓋，不把頁面專用閱讀狀態寫入計算書或 PDF。

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
  - 固定以 `-ForceSlowChecks -ForcePlatformAudit` 執行且不接受 `%*` 任意參數透傳；儀表板會將同時具備這兩個 force flags 的 full run 標示為 Release。
- 高價值工具 quick preflight：
  [run-preflight-tools-quick.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-preflight-tools-quick.bat:1)
- Pull request clean-checkout preflight：
  [run-preflight-tools-ci.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-preflight-tools-ci.bat:1)

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
