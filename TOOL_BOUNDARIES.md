# 工具交付邊界

## 混凝土強度非破壞檢測推估（T44，2026-10-14）

`結構工具箱/tools/concrete-ndt/` 依 `結構工具箱/tools/floor-slab/` 的 core／HTML／golden／test 四檔結構新增對應檔，另依派工新增 `concrete-strength-ndt-spec.js`。五檔為 `concrete-strength-ndt-core.js`、`concrete-strength-ndt-spec.js`、`concrete-strength-ndt.html`、`concrete-strength-ndt-golden-cases.js`、`concrete-strength-ndt-core.test.js`；core 無 DOM，所有工程公式、係數、單位與來源集中於 spec。預設值為假設，需技師確認；不提供未有儀器及現地校正依據的通用強度曲線或角度修正數值。規格確認資料只由使用者明確操作讀取同目錄固定 `concrete-strength-ndt-confirmed.json`，本階段不提供該檔；案例 JSON 不得提高規格確認狀態。

新路由 `/concrete-strength-ndt` 分類為 `reference`、公開身分為 `assist`，計算書僅內部審閱，不提供正式附件資格；既有 40 個 formal 入口與六個 formal 局部快算工具的資格不變。反彈擊數不得當作測區樣本數；同測區三法結果以配對差異比對，三法合併統計標明數值彙整、非獨立試體母體。報告區分「已確認事項／合理推定／待補充」，只陳述數據與假設，不替使用者下採用結論。所有輸出均由同步 core／spec 與既有報告 helper 產生，不新增壓縮、延後載入、第三方套件或 CDN。

`結構工具箱/tools/local-quick-tools.manifest.json`、`local-quick-tool-metadata.js` 及 local-quick 契約／browser smoke 納入第七工具的 assist 負向檢查；`結構工具箱/tools/tool-workflow.manifest.json` 與其契約納入第二個明列 assist 例外，總範圍為 40 formal＋連續梁＋NDT，既有斷言保留。首頁 `結構工具箱/assets/home/src/home.source.js` 的卡片、aliases、routeFileMap、日期與五檔依賴同批登錄，`home.js` 仍由既有 canonical builder 生成；`vercel.json` 同批登錄乾淨路由。新 core／spec／頁面屬公開程式，golden、測試與所有收據為開發資料，依既有成品排除規則處理。

`tool-workflow.browser.test.js` 為新路由明列唯一實際計算函式探針，`tool-workflow.browser.contract.test.js` 驗證原 40 個來源探針與新增 NDT 探針；只在測試 HTTP 回應插入，不改產品計算。所有舊瀏覽器斷言保留。

SRC 梁／柱既有公開腳本已壓縮，workflow 測試以 ignored 依賴樹中既有 Acorn 解析公開 callback 綁定及同一詞法作用域的實際計算函式，在原函式本文插入探針；缺漏或重複綁定立即失敗，不能只數按鍵或包裝公開 callback。私有契約驗證同名函式、重複宣告及無綁定反例；不改 SRC 公開程式或可讀來源，也不新增套件。

`tool-page-a11y.browser.test.js` 預設仍檢查原 40 個 formal 工具；指定新路由時另接受明列 assist 的 NDT，清冊必須為 53 卡／40 formal，未知路由失敗關閉。`tool-page-a11y-build.contract.test.js` 保留原 42 個 profile 與 40 個 a11y source 依賴檢查，再獨立核對 NDT 的 profile、a11y、載入順序與日期依賴，不放寬尺寸。`結構工具箱/tools/build-pages-artifact.js` 以精確私有項排除新工具的 golden；core／spec／HTML 公開，測試依既有 `.test.js` 後綴排除。

## 2026-10-10：覆工板手機報告溢出追加修正

依委託人追加授權，`覆工板/index.html` 的既有 `#report-output` 在螢幕提供局部水平捲動、鍵盤焦點與區域標籤，保留原計算、七張表格、報告 DOM 與匯出內容。列印解除容器寬度限制與 overflow 裁切；不以隱藏頁面溢出掩蓋表格內容。原 375 px 溢出 263 px 的失敗收據保留，另在提交後的乾淨 HEAD 重跑原 workflow 與報告契約；不放寬斷言、不重設容量基準。
## 2026-10-10：第七階段 T30 石材節點圖延後載入

石材 V2 主頁改用 `石材固定/assets/detail-bk.webp` 與 `detail-pk.webp`，由原始 JPEG 輸出、尺寸各 1600×1280 且各低於 120 KB；首頁 render 與工法縮圖不請求節點圖，放大或首次計算書／Word 匯出才以單一 Promise 載入，12 秒逾時後可重試。計算書 popup HTML 與 Word／DOCX 必須內嵌成功載入的圖；失敗時固定輸出「節點參考圖暫無法載入」，不留下外部 URL 或 undefined。圖片是公開 Pages 成品，不進 `vendor/`；既有原 JPEG 仍作為素材保留。

`石材固定/stone-detail-lazy.browser.test.js` 以 pinned Edge 154／Playwright 1.63 序列驗證冷開與 render、單 key 請求／promise 去重、timeout／retry、真正 popup HTML 的 data URI 與 file URL 離線重開、未攔截 DOCX runtime 的實際 ZIP media／relationships、阻斷圖片 fallback，以及真正 `.doc` 下載 bytes 離線重開。每個案例保留 console、pageerror、requestfailed 與資源請求原始摘要於 ignored `output/playwright/stone-detail-lazy/`；DOCX 成功案例不攔截 runtime，fixture 不替代正式匯出。

## 2026-10-10：第七階段 T29 耐震頁圖表延後載入

`tool-workflow.browser.test.js` 在覆工板計算後，以既有分頁返回參數欄再測快捷鍵；保留原有輸入失效、模態視窗、頁面橫溢與列印斷言。覆工板產品檔未更動，測試揭露的既有手機報告表格橫溢須另案處理，不能放寬斷言或宣稱完整工作流通過。

`結構工具箱/tools/formal-browser-smoke.test.js` 在耐震圖表量測前等待當前 Chart 實例完成繪製，尺寸與幾何斷言仍保持；測試等待不進入產品或計算書。

`結構工具箱/core/ui/chart-runtime.js` 僅由 `/seismic-force` 與 `/seismic-dynamic` 首次繪製反應譜時呼叫，透過單一 Promise 管理 jsDelivr Chart.js 4.4.7、12 秒逾時及失敗重試；其大小需 ≤889 bytes。兩頁冷開與動力摘要還原均不下載 Chart.js。Chart 載入失敗時仍顯示計算結果、legend 與反應譜數值資料；計算核心與報表不等待延後載入。計算書只內嵌已成功繪製的 data URI，無有效圖時改列數值表或文字 fallback。`seismic-chart-lazy.browser.test.js` 是私人 Edge／Playwright 測試，輸出只存 ignored `output/playwright/seismic-chart-lazy/`；原始錯誤、請求數、HEAD 與 dirty 收據均保留。共用 runtime 對兩條路由各計一筆 capacity difference，既有契約不去重，基準不得由本包重設。

`report-core-parity-map.json` 與 `report-core-parity.contract.test.js` 比對 core／RC popup factory 內嵌 approval script 的九個必要等價區段。標記註解位於 `buildAttachmentApprovalReport` 與 `buildRcAttachmentApprovalReport` 輸出的 `<script data-attachment-approval-script>` 本文；契約先抽出該內嵌 script 再定位標記及比對 JavaScript token。序列化移除清單、封印 adapter 與 popup presentation 的既有差異在 map 明列原因；兩份 runtime 仍分治。map JSON 以 Pages artifact builder 精確排除，live smoke 對 map 與 .test.js 執行私有路徑探測。

報表與載入稽核修正：`report-format-parity.core.js`／`report-format-parity.contract.test.js` 檢查 TXT 表、列、格及標籤／單位／判定，完整四案與指定子集分開驗收，browser 與後段必須明確傳遞同輪輸出目錄；不得以最新目錄推定來源。`結構工具箱/tools/tool-load-budget-contract.js`／`結構工具箱/tools/tool-load-budget-contract.test.js`分開容量差異與 HTTP／導覽／腳本／工作流故障，功能錯誤、缺漏路由、無效 bytes 或來源漂移皆不得重設基準。兩個純 Node 契約接入 quick／CI／正式 preflight；完整 Word／52 頁 browser 仍為獨立派工驗收。helper、基準、測試與來源收據不發布至 Pages 或進入計算書；開發檢查不得冒充正式放行。

共用報表純工具以 `結構工具箱/core/ui/report-utils.js` 為單一來源，鋼構由 `sync-formal-core.ps1` 同步，RC 以獨立 adapter 明列跳脫／非同步差異；RC `report.js` 不由鋼構腳本同步。可攜 HTML 將純工具 factory 內嵌，不依賴 opener 或外部共用脚本才能驗證／列印。直接列印邊界 CSS 由 core 同步至 RC，家族例外維持明列，不能解除操作頁列印限制。

第二階段操作頁樣式：`結構工具箱/assets/hy/continuous-beam-ui.css`、`frame-analysis-ui.css` 與 `鋼筋混凝土/shared/tool-page.css` 為正式來源碼，只管理操作介面，引用 `colors_and_type.css` 的共用 token；計算書 popup 不引用這些樣式。`tool-page-layout.browser.test.js`／`test-tool-page-layout.ps1` 為可重跑的 11 頁桌機／手機版面契約，截圖與結果 JSON 寫入忽略的 `output/playwright/tool-page-layout/`，不能作為正式交付物或實機驗證證據。新增 CSS 亦須列入首頁相對應工具的 `HOME_TOOL_UPDATE_DEPENDENCIES`。

本檔用來區分「應納入版本控管的工具碼」與「只作為本機案例、輸出或參考資料的檔案」。原則是：可重跑的程式、測試、preflight 與必要部署資產可以進 repo；大型工程案例、Office/PDF 輸出、暫存資料與本機快取不進 repo。

獨立工程基準現行覆蓋 40 / 40 個正式入口，其中 local-quick 工具家族是重疊的 6 / 6。`independent-engineering-adapters/frame-analysis.js` 直接執行平面剛架頁面求解器，並以懸臂端點力閉式解獨立核對位移、支承剪力與彎矩；`independent-engineering-adapters/cable-tension-frequency.js` 則直接執行鋼索頻率法 production core，鎖定公開頁對 core 的載入、輸入與計算呼叫。鋼索 adapter 所執行的 core regression 另須固定嚴格數字、正安全整數 `mode`、finite／正值與溢位／下溢失敗關閉反例；兩個 oracle 均不得讀取 golden expected，也不得把限定代表案例擴張宣稱為完整工程設計驗證。

<!-- P2_INCLUDE:docs/governance-current/TOOL_BOUNDARIES-catalog-01.md -->
<!-- P2_INCLUDE:docs/governance-current/TOOL_BOUNDARIES-catalog-02.md -->
<!-- P2_INCLUDE:docs/governance-current/TOOL_BOUNDARIES-catalog-03.md -->
<!-- P2_INCLUDE:docs/governance-current/TOOL_BOUNDARIES-catalog-04.md -->
## 不進 repo 的類型

- `node_modules/`、`.vite/`、`.playwright-cli/`
- `tmp/`、`_tmp/`、`__pycache__/`、`.pytest_cache/`
- `output/`、測試 run log、release bundle
- 本機專案資料：`app_data/`
- 大型工程輸出與參考：PDF、Excel、Word、LibreOffice 暫存 profile
- 工程資格化、實案收件與實案 G1 工作區：`case-bundle.draft.json`、`case-bundle-EQB-*.json`、`case-bundle.g1.review.json`、`case-bundle.g1.draft.json`、`beam-column-moment-real-case-intake.json`、`beam-column-moment-real-case-intake-readiness.receipt.json`、`beam-column-moment-real-case-g1-decision.template.json`、`beam-column-moment-real-case-g1-decision.json`、`beam-column-moment-real-case-g1-decision.receipt.json`、`beam-column-moment-real-case-g1.input.json`、`beam-column-moment-real-case.production.json`、`beam-column-moment-real-case.g1-review.html`、`beam-column-moment-real-case-g1.comparison-data.json`、`inputs/`、`outputs/`、`references/`、`reports/` 與所有實案識別／計算／外部基準證據
- 反查或抽取資料：`_extracted/`、dump 文字檔、OLE/EMF/WMF 圖檔
- 名稱剛好命中忽略規則的工具目錄，例如 `結構工具箱/tools/基礎/`；靜態工具應使用不被忽略的英文資料夾，如 `tools/foundation/`。

## 正式附件包進度觀測邊界

`attachment-package-build.js` 的建立階段事件只供旁路觀測。執行中寫入失敗不得中止或改寫 check / build / verify 結果；觀測端可停留於最後已驗證階段，但不得把已原子發布成功的附件包誤報為失敗。輸入的事件檔路徑仍須在啟動核心動作前完成受管暫存區驗證，非法路徑維持失敗封閉。

## 首頁正式放行日期來源

首頁工具內容更新日與正式放行日是不同資料：逐工具日期留在 `HOME_TOOL_UPDATES`，正式放行日只由 tracked `preflight-summary.json` 在執行期提供。快照必須是 passing、非 quick、強制平台巡檢與慢測、來源 commit 可辨識且乾淨，否則卡片只引導查看上方交付前檢查狀態，不得顯示人工猜定日期。

Pages deployment manifest 現採 schema v3。前表所稱 v2 封閉逐檔清冊仍完整保留，並新增 `releaseEvidence`，直接綁定實際發布之 tracked `preflight-summary.json` 的正式 release runId、產生時間與受測來源 SHA；同時要求 `report-readiness-status.json` 通過且 runId 一致。不是 full run、未強制平台巡檢或慢測、來源不乾淨、checks / post-checks 未全數通過，或兩份公開快照身分不一致時，artifact 建置必須失敗封閉。巡檢儀表板的「一般巡檢新鮮度」與「正式放行證據」分開顯示；7 日與 30 日門檻只提供重驗提醒，不改寫既有 release 身分。公開 manifest 缺少時只顯示「未部署證據」；carrier、Actions run、release run 或 tested source 任一不一致時顯示紅色「未對齊」，不得用較新的單項巡檢掩蓋。

有效 schema v3 deployment manifest 同時是 dashboard 的公開資料範圍界線；資料範圍與部署信任不可混為一談，staging manifest 的 `sourceDirty` 只要是合法布林仍屬公開 artifact，dirty 狀態另由部署信任卡揭露及 gate 判定。公開模式只讀 manifest 與 `assets/status/` 三份 tracked 摘要，不請求 Git ignored `output/`、私人 log、本機附件診斷、RVR 或 GSM 狀態；三份摘要皆須符合 `publicEvidenceSchemaVersion: 2`，並由同一公開 Schema 模組逐欄、逐型別驗證四個證據面向及最多 8 次的封閉公開 release 歷史。必要欄位缺漏、未知版本、型別錯誤、完成數未滿、runId 不一致、歷史倒序／衝突／未對齊或 pass flag 不成立都不得宣稱完整，且不得把同一 platform pass 複製成四張模組卡；型別無效的數值顯示為不可用，不得以原字串偽裝成有效比值。沒有公開資料的成熟度、RVR／GSM、preflight 細項與私人巡檢歷程整區移出公開閱讀流程；本機模式仍完整保留。私人摘要與連結明示僅限本機，不得因私人檔 404 顯示為工程巡檢異常。只有 localhost 可用 `?audit_scope=local` 進入完整本機診斷；外部網域即使帶相同 query 仍維持公開模式。dashboard 專用 browser smoke 必須證明本機診斷、四個公開證據面向、結構化完成數、公開 release 歷史、失敗關閉、公開資訊密度與隱藏私人連結未退化；共用 Pages browser smoke 則在 staged artifact 與正式網址的桌面／手機驗證公開 scope 與零 private-output 請求，正式網址另故意附加 local query，證明外部覆寫無效。

本機 Windows Pages artifact 預演仍以 pinned Terser 產生與 Actions 相同的 browser program；為避免完整驗證成長後突破 Windows 命令列長度，PowerShell 先以 GZip 壓縮並 Base64 編碼，runner 再把壓縮內容交給受控頁面環境的 `DecompressionStream('gzip')` 解壓，將原程式碼回傳後執行。browser smoke source 仍不得進入 Pages artifact，bootstrap 仍受 7,500 字元硬上限約束，壓縮傳輸不得成為發布測試 source 的例外。

Pages browser smoke 的跨平台 CLI 回傳由 `.github/pages-smoke/normalize-playwright-result.js` 正規化；只接受具正整數 `routes`／`checks` 與非負 `issues` 的封閉結果。正式 live runner 收到 CLI 成功但缺少量測值時，最多完整重跑一次，第二次仍缺值即失敗關閉；頁面斷言、內容、來源或隱私邊界錯誤不因這項 runner 重試而放寬。此 helper 與 runner、CI 摘要同屬私有發布治理，不進 Pages、計算書或正式附件。

RC 深梁、基礎二維與樁帽三維 STM 的獨立工程基準屬私有補充驗證：`rc-stm-strength.js` 只橋接 production core，oracle 另行推導每個能力兩個代表性合格案、一個隔離拒絕案、一組「略低／等於／略高」臨界值及一組「負裕度在 EPS 內／剛超出 EPS」案例，整體合計 24 案、564 項斷言；3 個代表性強度案升為正式路由基準，其餘 candidate cases 21 / 21，candidate capabilities 維持 3 / 3，整體 `strength-pass` 15 / 15、`strength-reject` 9 / 9。三組控制各自鎖定 25° 壓桿角度、23.4.4 剪力容量及 X/Y 拉桿層容許錯位，分開核對帶號裕度、等號允收、EPS 浮點容許差與單一控制分支；runner 會阻擋 production 錯誤放行或錯誤拒絕。`鋼筋混凝土/audit-tool.ps1` 的 RC 本地 gate 使用同一 catalog／oracle，但只載入 RC STM adapter；RC status 固定記錄正式與候選合計 24 個守門，preflight 再核對該 gate 的成功紀錄、24 / 24、15 / 15、9 / 9、564 及兩類失敗關閉 token，且把三份外部共享依賴納入 freshness 判定。三個 Pages 正式路由只涵蓋已聲明的限定拓樸，不得據此宣稱所有 STM 幾何、配筋配置、節點型式或傳力路徑均已驗證。adapter、catalog、runner、RC 本地 gate、audit／preflight 契約與三個 production core 是同一治理邊界，不得拆開交付。

鋼構 `core/formal-core-manifest.json` 只屬本機同步與 audit 證據，含工作站絕對路徑、來源／目標 SHA-256 及同步時間，不是正式鋼構頁面的瀏覽器 runtime。`build-pages-artifact.js` 必須以精確私有檔案規則排除，`pages-live-smoke.js` 必須對同一路徑執行非 200 負向探針；builder 另須逐檔執行通用本機路徑內容掃描並失敗關閉，不得只靠該已知檔名。artifact 內容不得出現本機帳號或工作區絕對路徑。

## 提交前檢查順序

1. `.\run-preflight-tools-quick.bat`
2. `.\run-preflight-tools-release.bat`
3. `.\run-pages-artifact-smoke.ps1`
4. `git status --short --untracked-files=normal`
5. 修改錨栓原始碼後執行 `.\sync-anchor-deployment.ps1`。
6. 確認 `anchor/assets` 舊 hash 刪除與新 hash 新增成對出現，且 `anchor/deployment-manifest.json` 已更新。

實際 staging 分包請參考 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)。

## 接收端治理健康歷程邊界

接收端治理健康歷程 JSON 必須可由管理 HTML 送回後端重新驗證，並拒絕未知欄位、鏈語意不連續、筆數／鏈首／證據邊界或 `GHE` 整包指紋不一致。匯入只驗證，不得合併、覆寫正式歷程鏈，也不得使治理資訊進入 PDF／DOCX 計算書或公開 Pages。

GHR 歷程已由新版 v3 帳號治理加密備份涵蓋，可在通過解密、鏈驗證及回退／分叉防護後恢復正式鏈；v1／v2 舊版備份則只能保留復原目標的本機鏈。GHE 仍是獨立核驗檔，不是異地備援，重新匯入也不得恢復或合併正式鏈；v3 受管制本機副本同樣不等於異地保存或外部可信錨定。

管理 HTML 必須可從目前已驗證 GHR 建立封閉欄位的 `GCR` 簽署請求；完整 GHE、簽署時間、自陳邊界與獨立 context 須共同納入 Ed25519 payload，離線簽署器產生具 `GHC` 整包指紋的自足檢核點。匯入時必須重驗 Base64 canonical JSON、GHE、GCR、Ed25519、公鑰 Key ID、GHC、目前信任／撤銷狀態及 GHR 前綴關係；目前鏈短於檢核點須明示疑似回溯或資料遺失，非共同前綴須明示分叉，兩者均不得接受。未知或已撤銷公鑰即使密碼學簽章有效也不得視為目前狀態錨點。GHC 只是一份可攜式外部紀錄；應用程式不保存、不合併也不自動選取檢核點，不能證明其已離開本機，`signedAt` 也不是第三方可信時間戳。GCR、GHC、驗證結果與操作說明只屬 HTML 治理工作區，不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。

GHC 必須另有不啟動服務、不讀專案資料庫或私人金鑰的獨立驗證入口。它可在只提供 GHC 時驗證密碼學完整性；提供嚴格驗證的公開 RTB 時判斷該清冊在 `exportedAt` 快照中的受信任／未知／已撤銷狀態，但不得反推金鑰在可自陳的 `signedAt` 已受信任；再提供目前 GHE 時比較相同、延伸、落後或分叉。輸出的 `GCV` 收據須綁定各來源檔名與 SHA-256、GHC／GCR／GHE、RTB／RTR、簽章、歷程關係與固定責任邊界，並明示收據不能脫離來源檔作為單獨證明，不驗證外部保存或第三方時間戳，也不是工程核可或正式計算附件。

GCV 的選配可信時間流程必須先重新驗證 GCV 可由全部來源 bytes 完整重建，再以封閉 `GAM` 清單綁定檔名、大小、SHA-256 及治理摘要，產生要求 TSA 憑證且含 nonce 的 SHA-256 RFC 3161 `GTS` 查詢。工具不得內建、暗中選取或自動連線 TSA。取得外部回應後，必須以使用者明確選取的信任根同時驗證查詢 nonce、GAM 實際 bytes 與 TSA 憑證鏈，並把同一份已驗證快照封裝為 `GTV` 證據包；日後重驗須拒絕缺檔、加檔、子資料夾、檔名／指紋不一致、錯誤信任根、錯誤查詢、來源篡改或收據不一致。TSA `genTime` 只在採用者接受該 TSA、信任根與 policy identifier 時證明 GAM 綁定內容最遲於該時間已存在；本工具不查 OCSP／CRL、不證明異地保存、保留鎖、工程核可或正式附件資格。GAM、GTS、TSA 回應／憑證與 GTV 均不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。

GTV 的選配外部歸檔流程必須先把同一份已重驗 GTV bytes 封裝成未加密、未壓縮、無子資料夾、無重複可攜式檔名的封閉 `GAP` ZIP，再以 `GAD` 固定保存端、保存庫、GAP SHA-256／大小、不可變模式、最低期限與 legal hold 要求。工具不得自行上傳或把本機複製、一般版本控制、唯讀權限冒充 WORM。外部保存端只有在實際入庫後才能以獨立 Ed25519 金鑰簽發 `GAR`；案件端必須使用由組織另行核定的公開金鑰驗章、保存實際核定證據檔 bytes，且只有 provider／repository、物件／版本、stored、模式、期限與必要 legal hold 全部滿足時才可建立 `GAV`。日後重驗須重新驗證完整 GTV、GAD／GAP、GAR 簽章與六檔封閉 GAV。GAV 只證明指定公開金鑰可驗證的保存端簽章證言，不即時查詢外部物件是否仍存在，也不判讀核定文件、不驗證供應者作業控制、金鑰組織歸屬、工程核可或正式附件資格。GAD、GAP、GAR、公開金鑰、核定證據與 GAV 均不得進入 PDF／DOCX 計算書、正式附件包或公開 Pages。
鋼索頁面比較 helper `結構工具箱/tools/cable-tension/cable-tension-frequency-sensitivity.js` 納入發布與既有 core regression。僅重算固定單項 ±1% 的有效長度、線質量及全部模態頻率同比例情境；不改動基準輸入、工程判定、案件 JSON 或正式報告。獨立公式斷言與桌機／手機回歸須檢查非連續模態、基準不變、無效輸入清除舊情境及 page-only 範圍。情境不是量測不確定度，也不提升工程資格。

## 現況鑑定紀錄試用工具

V0.30.0 增加會勘簽認：觸控手寫影像、向量筆跡、紙本簽章照片與簽署時摘要均保存在裝置案件與使用者匯出的 `.csurvey`；獨立簽認單 HTML／PNG 及併入標準附件的簽認頁均屬私人輸出，不得發布到 Pages。識別短碼只供對照，並非數位簽章、身分驗證、損害原因或責任認定。資料庫及備份格式為 17；實體手機與實際簽認流程仍需人工試用。

V0.30.1 允許觸控簽名不另填姓名；表單明示「姓名未另填」，不從筆跡推定身份。拒簽、不在場及紙本紀錄仍須填姓名。本機資料庫與備份格式升為 18，可讀舊格式 1～17；舊版接收端須更新。

V0.30.2 簽認作廢原因改在簽認視窗內填寫，原因必填、取消不變動；不使用瀏覽器原生輸入框。資料格式維持 18，作廢仍只標示該筆簽認不再採用，原簽名保留。

V0.30.3 現場作業可手動啟用螢幕常亮，狀態依瀏覽器實際取得的 Screen Wake Lock 顯示；切離頁面會由瀏覽器釋放，返回時再嘗試。裝置省電限制、手動鎖屏與系統強制鎖定仍以手機系統為準。資料格式維持 18。

驗證入口：`field-survey/tests/model.test.js` 與 `field-survey/tests/browser.test.js`，只用合成資料驗證，不作正式工程計算附件。

V0.7.0 另提供照片紀錄附件整理：梁 U 型裂縫以條數、選填單條展開長度記錄，不計算或列出總長；磁磚裂隙／破損以塊數記錄，重疊未確認不相加。房間、照片選取及主照片關聯保存於原案，正式照片流水號在附件預覽時生成，位置圖同步更新。獨立 HTML 與 JSON 編號對照保留當次來源與選片；可列印 PDF，須人工核閱後併入報告。這不是完整鑑定報告，也未套用公司 Word 範本。含私人影像的 HTML、附件對照 JSON 及備份均不得進入 Pages；改名檔以輸出標記或 JSON kind 阻擋。資料庫與備份均為版本 3，仍可讀舊備份。

`field-survey/` 為 `/condition-survey` 的手機現場紀錄工具，屬工作流入口，公開版本 V0.7.0。新增先依戶別／樓層建平面圖庫、選取刪除局部圖形、照片旁定位核對與照片位置圖對照副本。提供相機同意入口及預覽拍攝、部位／現況複選、各現況獨立面積（m²，實測或估計）、≤0.3 mm 快捷、可縮放／移動／四向擴展的門窗簡圖與端點／牆線吸附。保存戶別、位置、照片原檔、獨立圈註、語音備忘與量測；本版不判定安全、原因或責任，不提供正式鑑定報告。案件只保存在瀏覽器與使用者匯出的 `.csurvey`，私人資料及合成測試證據不得放入公開 artifact。資料測試與實際瀏覽器離線／還原測試納入 preflight；實體手機試拍及首案人工核對仍待執行。

V0.2.0 的 ＜0.3 mm／≥0.3 mm 為紀錄分類，不是安全門檻；區間不可代填成精確尺寸，初記與實測狀態分存。手繪簡圖以筆畫及 PNG 一起備份，明示未按比例；修訂另存新圖，只有再次保存位置才更換紀錄的圖面關聯。舊版精確量測與備份仍須能讀取。
# 2026-10-03：共用計算操作

`結構工具箱/core/ui/tool-workflow.js` 與 `結構工具箱/tools/tool-workflow-adapters.js` 承接首頁 40 個正式入口、RC 梁柱牆剪力牆及連續梁的計算、結果導覽與既有結論鏡射。RC 摘要沿用 `bannerStatus` 原始文字與狀態 class；輸入分頁按計算後切至綜合結果，操作提示列印隱藏。Ctrl／Cmd+Enter 只呼叫一次既有計算；Esc 只關閉最上層對話框。錨栓 React 入口由來源 hook 接入並經原部署同步腳本產生 `anchor/`。快捷鍵不核可、不採用資料、不匯出；待更新狀態不重新判定工程合格。提示只用於工作頁，列印與計算書排除。

`tool-workflow.manifest.json` 是 41 入口驗證清冊，屬本機開發資料，不列入 Pages 產物。連續梁維持 assist 身分。

## 2026-10-03：鋼構報表共用外框

鋼構 `app.js` 由共用 `buildReportDocumentHtml(cfg, presentation)`／`openReport` 組成計算書；presentation 只提供既有工程正文、CSS 與公式排版需求，放在共用內容封印範圍內。專用段落仍由鋼構來源產生，原 flat checks、snapshot 與計算指紋投影不變；不可藉 presentation 指定指紋。核可資格維持 `formalApprovalAllowed: result.passes`。本次九條驗收鏈另要求來源 JSON 完整；此為案例驗收條件，未改變通用附件檢查器處理單獨核可 HTML 的既有政策。

附件檢查器一般化解析 CSS 子元素與混合後代選擇器；只有可證明為 absolute／fixed 且零面積的 `clip:rect(...)` 才排除其隱藏內容。未知選擇器、非零／無法解析的裁切、負向偏移與同色隱藏仍須複核或阻擋，不使用公式套件白名單。`鋼構工具/steel-report-package-contract.js` 僅為本機測試 helper，排除 Pages。

## 2026-10-03：首頁品質與初始版面

首頁沿用 home.js 單一工具清冊；sync-home-initial-view.js 由同源清冊產生初始分類／篩選骨架，僅供開發使用並排除 Pages。defer、hero 預載與固定初始版面降低載入位移，材料頁籤維持完整 tablist／tab／tabpanel 關聯及鍵盤焦點。琥珀文字提高對比；不改工具資格、工程結果或公開狀態 JSON。Lighthouse／axe 與瀏覽器證據只存 output；本機模擬子目錄不等於公開 Pages 或實體裝置驗收。

## 2026-10-08：第五階段 T21 測試穩定性

`鋼構工具/app.js` 在報表匯出前執行 `update(false)`，以同步更新輸入計算與所有結果摘要，再由 `window.latestSteelConnectionResult` 建立報表；真瀏覽器以未觸發事件的 `requiredShear=2000` 驗證輸入、結論、公式及 fingerprint 同屬一份快照。`鋼構工具/steel-audit-browser-runner.js` 與 `steel-formal.regression-test.js` 負責該情境的實測及契約。

`石材固定/server_smoke_test.py` 將產物放在 `output/stone-server-smoke-temp/`，ZIP context 關閉、釋放參照後才進行最多五次有限清理；清理前必須驗證 resolved path 是暫存根目錄的直接子項。`石材固定/local-server-probe-smoke.py` 新增 TCP 接受 `/status` 但不送 HTTP 回應的負向情境，驗證約 1,400 ms 後靜默回到 `public_static` 且頁面預覽仍可用。`--probe-only` 明確跳過既有 UI smoke；完整入口的 UI smoke 失敗仍使整體失敗，probe-only 通過不可代稱完整通過。T26 工法卡維持 group 語意，UI smoke 驗群組名稱、唯一 aria-current 選取狀態及每個具名稱的 button／input 子控制項實際可 Tab 到；放大子按鈕以 Tab／Enter 操作，燈箱 Esc 關閉並回復焦點，工法選取既有 Enter 行為另保留驗證。這些測試與 output 證據不屬公開執行期或正式 release 證據。

## 2026-10-08：第五階段 T23 家族慢測執行器

根目錄 `run-family-wrappers.ps1` 以 repo-relative 清單和 `$PSScriptRoot`，依序執行 10 個 RC PowerShell wrapper、鋼構 batch audit、連續梁 PowerShell wrapper，以及兩個 Node browser smoke；每次只啟動一個 child，完整 stdout／stderr 寫入 ignored `output/family-wrappers/` 個別 log。摘要記錄命令、exit code、耗時、log 路徑、起訖 HEAD 與 dirty 狀態。`-ListCommands` 僅列出 14 項供契約檢查，不啟動測試。執行器與契約測試依 `.ps1`／`.test.js` 私有後綴規則不進 Pages。

`report-popup-fixture.test.js` 僅供 RC beam／column／slab、鋼構 audit 與 local-quick 中採 Blob 導覽的 legacy 報表案例使用，攔截實際 HTML Blob、解析 Blob 文字、以 Blob URL 導覽並在文件載入後送出 `load`。六個獨立 local-quick 工具仍使用原 `window.open` 加 `document.open/write/close` 替身，依其實際輸出 API 驗證；不得混用 fixture 或略過內容斷言。Blob 報表的 autoPrint focus／print 觀察必須等 load callback 完成；共用 fixture 及其呼叫端均為 `.test.js` 私有測試檔，不進 Pages。

## 2026-10-11：T33 首頁最近使用與釘選

`結構工具箱/assets/home/home.js` 以獨立的使用者狀態保存最多 8 筆最近使用與 12 筆釘選，工具清冊欄位不變。分類總覽前的區塊沿用同一 renderToolCard，釘選按鈕置於連結外；搜尋時隱藏、空資料不渲染。所有 localStorage 讀寫均捕捉錯誤。`結構工具箱/assets/home/home.css` 沿用既有 token。新私有 `home-recents.browser.test.js` 等待式驗證鍵盤導覽、重載、去重與上限、停用／異常儲存、個人區塊桌機與手機 axe；原始診斷與收據留在 ignored `output/playwright/home-recents/`，測試依既有 .test.js 規則排除 Pages。
## 2026-10-11：T36 第二批共用執行期確定性壓縮

六份可讀來源保持原始內容，僅統一 LF：`結構工具箱/core/ui/src/report-docx.source.js`、`結構工具箱/core/ui/src/tool-workflow.source.js`、`結構工具箱/tools/src/tool-workflow-adapters.source.js`、`結構工具箱/tools/src/project-storage.source.js`、`鋼筋混凝土/shared/src/project-storage.source.js`、`結構工具箱/core/loads/src/loadcombo.source.js`。沿用 `結構工具箱/tools/build-minified-runtimes.js` 與 ignored Terser 5.44.0 產生原公開路徑，首行標記來源，不使用 unsafe 或 property mangling。來源精確列入 Pages PRIVATE_FILES，來源與生成檔固定 LF；生成一致性、逐檔體積上限（本批實測加 10%、向上取整）與對應首頁來源依賴由 `tool-page-a11y-build.contract.test.js` 檢查，原三檔上限保持。

鏡像 manifest 的四筆來源均不含本批六檔。`結構工具箱/tools/project-storage.test.js` 保留全部字面斷言並改讀可讀來源；`結構工具箱/tools/local-quick-tools.contract.test.js` 的 LoadCombo VM 改讀來源，公開輸出仍由既有 LoadCombo 行為／家族測試執行。`report-docx-integration.contract.test.js` 同時載入公開與來源版本，保留各自可攜 HTML factory／Word 邊界全部斷言；其餘 HTML script VM 與 require 讀取者執行公開輸出之行為，不依賴函式排版。首頁依賴依實際 script 消費頁補齊公開檔及來源檔；不更改工具清冊欄位或公開路徑。

DOCX integration 的舊 popup 替身未提供現行 Blob／URL API，使用未壓縮來源也會失敗；本包僅補齊替身並檢查 MIME／Blob 導覽，不更動任何 report.js 或 report-utils.js。首次失敗與原替身重現紀錄保留，所有原 Word／可攜 HTML 斷言均保留。

## 2026-10-11：T38 首頁可讀來源與確定性產出

新增私有來源 `結構工具箱/assets/home/src/home.source.js`；原公開 `結構工具箱/assets/home/home.js` 由 `結構工具箱/tools/build-minified-runtimes.js` 的 home 項產生，Terser 5.44.0、LF、首行來源標記，公開引用不變。來源登錄 HOME_TOOL_UPDATE_DEPENDENCIES 與 Pages PRIVATE_FILES。首頁清冊、日期、初始檢視、版本同步及所有字面契約讀來源；日期與版本同步在寫入來源後自動重建，日期 --check 同時檢查來源日期與產出一致。公開網站 smoke 保留全部原文字／能力斷言，容許壓縮後等價空白與引號格式。建置契約體積為首次實測加 10%、向上取整；不改清冊欄位、路由或計算邏輯。
## 2026-10-11：T40 第三批確定性壓縮與追溯跳過

以下十二份可讀來源新增為私有 LF，正文與開工 HEAD 僅統一 LF；公開路徑由既有 `結構工具箱/tools/build-minified-runtimes.js`、Terser 5.44.0 生成，首行標記，未使用 unsafe 或 property mangling。五份現況調查檔保持 ES module 語意及原相對 import 路徑，其餘維持原全域／CommonJS API。建置契約檢查全部清單、LF、私有邊界、生成一致、逐檔實測加 10% 向上取整與 ES module／script 語法；來源與實際消費頁依賴同步登錄。

| 公開產出 | 新私有可讀來源 |
|---|---|
| `field-survey/report-ui.js` | `field-survey/src/report-ui.source.js` |
| `field-survey/signoff-ui.js` | `field-survey/src/signoff-ui.source.js` |
| `field-survey/sketch.js` | `field-survey/src/sketch.source.js` |
| `field-survey/detail.js` | `field-survey/src/detail.source.js` |
| `field-survey/model.js` | `field-survey/src/model.source.js` |
| `SRC工具/src-column.js` | `SRC工具/src/src-column.source.js` |
| `SRC工具/src-beam.js` | `SRC工具/src/src-beam.source.js` |
| `SRC工具/core/src-beam-core.js` | `SRC工具/core/src/src-beam-core.source.js` |
| `結構工具箱/core/wind-report.js` | `結構工具箱/core/src/wind-report.source.js` |
| `結構工具箱/core/loads/seismic-zones.js` | `結構工具箱/core/loads/src/seismic-zones.source.js` |
| `結構工具箱/tools/風力/wind-shared-profile.js` | `結構工具箱/tools/風力/src/wind-shared-profile.source.js` |
| `鋼筋混凝土/shared/common.js` | `鋼筋混凝土/shared/src/common.source.js` |

壓縮前檢查 `鋼構工具/core/formal-core-manifest.json`、石材 vendor 同步清單與所有追溯清冊：`SRC工具/core/src-column-core.js`、`鋼構工具/steel-beam-formal.js`、`鋼構工具/steel-column-formal.js` 明列追溯；`結構工具箱/core/materials/steel.js` 與 `結構工具箱/core/loads/seismic.js` 的鏡像也明列，因此同源跳過。`結構工具箱/core/loads/seismic-zones.js` 建置後只由 `結構工具箱/tools/sync-stone-regulatory-vendor.js` 同步 `石材固定/vendor/loads/seismic-zones.js`。所有其他鏡像／追溯清冊、report.js／report-utils.js、RC shared/report.js、鋼構 app.js／calculator.js 與 field-survey/app.js 不變。

原始碼 needle（SRC 頁、WindReport、調查版本、成熟度解析器）改讀來源；原有 require／VM 的固定預期行為斷言繼續測公開產出，vendor SHA 契約繼續驗生成檔。原生對話框掃描同時保留公開／來源檔，只透過建置清單對應既有 confirm 核准計數，未新增核准額度。量化指標不通過時保留差額與選項，不改可讀來源或基準。

## 2026-10-12：T41 PowerShell 文字編碼與 5.1 家族入口

新增私有 `powershell-encoding.contract.test.js`，用 Windows PowerShell 5.1 AST 掃描全部追蹤 `.ps1` 的 Get-Content／Set-Content／Out-File 及 ReadAllText，保留檔名、行號與多行命令，並以缺漏、錯誤編碼及註解／字串反例驗證。文字讀取明確 UTF-8；寫入同樣指定 UTF-8。唯一具理由的既有例外為 `preflight-tools.ps1` 的 UTF-16 暫存 child script，依 V11 只改讀檔與輸出格式不變邊界保留，須如實回報。家族執行器只選 Windows PowerShell 5.1，不更改 14 項內容、順序與斷言；本輪驗證 PATH 排除 PowerShell 7，使既有 batch 使用 5.1 後備，啟動器原一般政策不改。PS7 僅允許指定鋼構無 BOM 回歸實驗一次。收據與回報留 ignored output／派工資料夾，不更動公開 status／release。

## 2026-10-12：T42 鋼構主頁確定性壓縮

私有可讀來源 `鋼構工具/src/app.source.js`、`鋼構工具/src/calculator.source.js` 只從既有公開檔搬移並統一 LF；公開 `鋼構工具/app.js`、`鋼構工具/calculator.js` 維持原路徑，由既有 Terser 5.44.0 canonical builder 生成。兩檔不在 formal core 鏡像清單，core 與石材 vendor 不動。追溯目錄 evidence 保留公開檔，逐筆增 source 對照且不改 id、clause、calculation；原始碼／VM 契約與工程 adapter 讀來源，require、Python 真頁行為與 node --check 保留公開產出。公開 HTTP smoke 的內部函式名稱斷言移到來源契約，HTTP 改查生成標記且原網址、中文與禁止 host 推論斷言保留；未刪原語意。兩份來源登錄公開排除、LF、首頁兩路由日期依賴，工作流程 sourceFile 指向可讀檔。建置位元組上限按實測 +10%，合計仍須符合來源 55%；量化差額不得自行放寬。

## 2026-10-15：載入預算 53 路由清冊契約補強

結構工具箱/tools/tool-load-budget-contract.js 新增首頁 tools href、固定 baseline.routes、HOME_TOOL_UPDATES.routes 與 routeFileMap 的集合／映射驗證；routeFileMap 可保留 /rc 別名。browser runner 先核對三份清冊，再依 baseline 順序量測；純契約另涵蓋未核准新增／替換、52／54、日期或映射缺漏、結果缺漏／重複／順序，以及來源／HEAD 漂移。保留 HOME_ROUTE_COUNT = 53、DOCX guard、source hash、HEAD 起訖及 schemaVersion 1 收據欄位；固定 baseline 未改。此登錄不代表已完成瀏覽器量測或正式放行。


<!-- N1-REGISTRATION-START -->
## 2026-10-16：N1 治理分冊容量與登錄守門

`結構工具箱/tools/governance-documents.contract.test.js` 依 loader 的 GROUPS 核對三主檔及登錄附冊、current 目錄實體清冊、分冊所屬主檔與原始 UTF-8 bytes 每份不超過 60,000；55,000 只作規劃提醒。保留各原 reader 的文件範圍、AND／OR／NOT 與舊負向測例，不固定正文 hash、規則數或附冊數。`preflight-tools.ps1` 僅在既有 formal-tools-static 加入子命令並逐項記錄退出碼；隔離 fixture 驗證非零失敗傳遞，不新增頂層 record 或改寫歷史 29 條門檻。`pages-release-governance.contract.test.js` 具名驗證登錄文件及 loader／契約保持私有，公開工具頁不受影響。本機驗收不代表正式預檢或發布。
<!-- N1-REGISTRATION-END -->

<!-- T46-REGISTRATION-START -->
## 2026-10-16：T46 治理文件現行位置規則

新增私有附冊 [STAGING_GROUPS-ledger-04](docs/governance-current/STAGING_GROUPS-ledger-04.md)，用途為保存原順序的分組指令，既有 loader 回填主檔標記以還原正文；附冊不進公開成品。分組覆蓋掃描讀主檔與全部 staging 附冊原文，只改讀取範圍，路徑存在、ignored、tracked deletion 與 unclassified 判定不變。

現行規則：新段落仍寫在主檔；主檔超過 50,000 bytes 時再依本模式移入新附冊。分組指令可依原順序移入 staging 附冊，主檔原位置以分段標記還原；此位置規則取代早期「git add 行必須留在主檔」的敘述，原敘述保留作歷程，其餘治理規則不變。各治理實體文件仍以 60,000 bytes 為上限，不調高上限。
<!-- T46-REGISTRATION-END -->

<!-- T47-REGISTRATION-START -->
NDT 同測區配對覆蓋摘要僅從既有 zoneResults 衍生；測區沿用首尾空白裁切及 160 字元限制，正規化後完全相同才配對，大小寫分開，不作模糊比對或補值。三法共同、恰兩法、僅一法互斥計數，測區數不是獨立試體數或母體樣本數；頁面、摘要與詳細計算書、TXT、JSON 同源，只陳述數據。工程數值、規格、版本與資格不變；NDT 本頁的既有計算指紋投影只排除新增衍生欄，舊 JSON 可重算，匯出仍保存完整結果，不改共用 exporter。
NDT 距離／時間回讀測例的指紋 fixture 同樣只排除純衍生覆蓋欄，保留距時值、回讀成功與拒絕／還原的全部原斷言。
<!-- T47-REGISTRATION-END -->

<!-- T48-REGISTRATION-START -->
## 2026-10-17：T48 重撐單向核心區直接承壓

`開挖擋土支撐/backend/app/receiver_capacity.py` 新增 `_evaluate_kern_end_plate` 與閉式容量區間；既有 `_evaluate_end_plate` 及舊模式輸出保持不變。`開挖擋土支撐/backend/app/reporting.py` 提供純格式 helper，供 `receiver_capacity_attachment.py` 呈現已驗證的精確 RSC／RSB 回應；不把接收端助手數據寫入 ProjectState 或來源專案主 PDF／DOCX。RSC schema 維持 v4；新模式 RSB 為 v2，既有模式 RSB v1 bytes 不變。

新模式限單向強軸核心區全板接觸 `e <= L/6`、弱軸偏心與附加彎矩均為零、容許應力提高係數 1.00，並要求確認全板密貼及端板方向。頁面與附件列出 e、L/6、接觸壓力、承壓與端板彎曲結果、可行區間和簡化假設。超出核心區、雙向彎矩、錨栓、銲道及承接構件本體不在此模式範圍。零係數常數矛盾輸出 `minTf=null`、`maxTf=null`、`feasible=false` 與非空原因；有限但 `minTf > maxTf` 的空區間保留原有限界限。

本機保留 14 檔未提交工作樹，不推送、不重設基準；本輪未跑測試或建置。門檻與 family wrapper 規則維持原文，dirty 狀態造成的總結果照實記錄，不得調整 wrapper 或宣稱乾淨 HEAD。
<!-- T48-REGISTRATION-END -->

<!-- P2-REGISTRATION-START -->
治理正文分冊由 `結構工具箱/tools/governance-documents.js` 回填，契約：`結構工具箱/tools/governance-documents.contract.test.js`。分冊按各 include marker 所在位置回填。
<!-- P2-REGISTRATION-END -->

<!-- T49-REGISTRATION-START -->
## 2026-10-18：T49 門檻命令清單與交付物契約

`run-phase-gates.ps1` 改讀根目錄版控清單 `phase-gates.commands.json`（31 條）；清單及 runner 為私有治理檔案，不進 Pages 公開成品。
<!-- T49-REGISTRATION-END -->

<!-- P2-BOOK-INDEX-START -->
## 分冊索引

- [docs/governance-current/README-catalog-01.md](docs/governance-current/README-catalog-01.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/README-catalog-02.md](docs/governance-current/README-catalog-02.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/README-audit.md](docs/governance-current/README-audit.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/TOOL_BOUNDARIES-catalog-01.md](docs/governance-current/TOOL_BOUNDARIES-catalog-01.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/TOOL_BOUNDARIES-catalog-02.md](docs/governance-current/TOOL_BOUNDARIES-catalog-02.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/TOOL_BOUNDARIES-catalog-03.md](docs/governance-current/TOOL_BOUNDARIES-catalog-03.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/TOOL_BOUNDARIES-catalog-04.md](docs/governance-current/TOOL_BOUNDARIES-catalog-04.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/STAGING_GROUPS-ledger-01.md](docs/governance-current/STAGING_GROUPS-ledger-01.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/STAGING_GROUPS-ledger-02.md](docs/governance-current/STAGING_GROUPS-ledger-02.md)：loader依本文 include marker 原位置回填。
- [docs/governance-current/STAGING_GROUPS-ledger-03.md](docs/governance-current/STAGING_GROUPS-ledger-03.md)：loader依本文 include marker 原位置回填。
<!-- P2-BOOK-INDEX-END -->
