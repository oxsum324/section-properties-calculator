# docs/governance-current/README-catalog-01.md

<!-- P2-BOOK:docs/governance-current/README-catalog-01.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

## 正式工具與入口

- 平台總入口：
  [結構工具箱/index.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/index.html:1)
- 平台巡檢儀表板：
  [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
  可直接檢視平台 history、preflight latest / full / quick、近期異常趨勢、耗時、最慢檢查，以及本機 RVR 備份健康摘要與異常／恢復轉換歷程，並固定提醒頁面診斷明細不會寫入計算書、列印或 PDF。計算書預設為可列印的 `文件狀態：內部審閱`；使用者勾選核可後改為 `文件狀態：正式附件` 並記錄核可時間與計算指紋。核可後修改選填的核可人或核可依據會立即撤銷正式狀態、清除舊核可時間，必須再次明確勾選。工程 NG 與文件核可是不同概念，計畫名稱、編號及設計人空白時可由主文承接。首頁的頁面專用總覽另會顯示最近一次正式放行的實際交付物渲染完成數，但公開快照不包含交付檔名或案件內容。
- 鋼構正式規範工具：
  [鋼構工具/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/index.html:1)
- 鋼構正式頁 regression：
  [鋼構工具/steel-formal.regression-test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/steel-formal.regression-test.js:1)
  - 固定檢查連接板、拉力構件、單剪力板 Shear Tab、Gusset 拉力支撐接頭、梁柱彎矩耐震能力審查、全斷面 CJP 耐震柱續接、鋼梁與鋼柱的正式頁／模組、共用報表 helper、page-only 產報前檢查與計算書內容邊界；結果區的「產生計算書」與頁首輸出都走同一個可追溯報表流程，不直接列印工作頁。四個正式工作頁所涵蓋的八類正式核算皆可匯出及重新匯入機器可讀的計算來源 JSON，與同次正式計算書共用計算指紋；匯入會驗證 schema、工具種類、工具版本、精確欄位集合與快照指紋，重新計算後只有指紋完全相同才保留套用結果，否則回復原輸入。browser runner 會實際下載來源快照、以真實檔案重新匯入、驗證錯誤版本、欄位與列舉遭拒並逐頁比對，不只檢查欄位存在。四個鋼構正式工作頁的瀏覽器直接列印已由共用 CSS 封鎖，只顯示一頁操作指引；計算書彈窗仍可列印或存成 PDF，並可在其中核可為正式附件。連接板／拉力構件／單剪力板／Gusset／梁柱彎矩／柱續接主工具頁在本機讀取鋼構細部巡檢，公開部署則讀取已發布的平台狀態快照，不再請求私有 `output/audit` 路徑。正式輸出固定以採用輸入、公式代入、結果與結論為主，不輸出輸入模式、換算、流程、介面摘要卡、符號教學或長篇條文說明。browser runner 會實際點擊八類正式核算的結果區按鈕，把 HTML 彈窗型計算書轉成 PDF 與可讀文字，實際下載並核對 9 份 TXT 備查，也會把四個工作頁各自直接列印成 PDF，確認只有一頁邊界通知且不含表單、案件資料或 `DRAFT`。
- 鋼梁 / 鋼柱既有案件延續頁：
  - 只供既有案件延續或復核比較；必須選擇用途並確認後，才可產生「舊案延續計算記錄」。頁面本體的直接列印不提供計算附件，新案正式計算附件必須由鋼梁 / 鋼柱正式頁產出。
- RC 工具入口：
  [鋼筋混凝土/index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/index.html:1)
  - RC 梁、柱、板、牆、剪力牆、基礎、單樁與補強斷面的工程 ready / review / blocked 狀態只留在工作頁輔助審閱；計算書一律預設為可列印的內部審閱，勾選「本計算內容已完成審閱，核可作為正式附件」後才成為正式附件。未填計畫名稱、編號或設計人時省略該列並由主文承接；NG 結果仍可如實列入核可附件。RC 柱另將計算方法、適用邊界與條文覆蓋診斷留在 HTML 頁面，計算書只保留採用資料、計算式、檢核結果、結論及已完成的可追溯複核紀錄。梁、柱、板、牆、剪力牆、基礎與單樁的專案 JSON 重新匯入時會驗證 schema、工具種類、工具版本及來源計算指紋；套用後必須重算出相同指紋才保留結果，否則自動回復原輸入。RC 柱的人工複核需留下依據、文件編號、複核人、時間與計算條件 context key，相關輸入變更後自動失效；完成紀錄會隨專案 JSON 保存並寫入計算書。8 個 RC 工作頁的瀏覽器直接列印仍完全封鎖，兩種文件狀態皆由「計算書」流程產生。
- 基礎局部檢核：
  [結構工具箱/tools/foundation/foundation-local.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/foundation/foundation-local.html:1)
- 設備局部荷重：
  [結構工具箱/tools/equipment/equipment-load.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/equipment/equipment-load.html:1)
- 擋土土壓局部檢核：
  [結構工具箱/tools/earth/earth-pressure.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/earth/earth-pressure.html:1)
- 地坪承載檢核（Westergaard）：
  [結構工具箱/tools/floor-slab/floor-slab-westergaard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/floor-slab/floor-slab-westergaard.html:1)
- 柱保護層偏差強度評估：
  [結構工具箱/tools/rc/column-cover-deviation.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/rc/column-cover-deviation.html:1)
- 鋼索索力評估（頻率法）：
  [結構工具箱/tools/cable-tension/cable-tension-frequency.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/cable-tension/cable-tension-frequency.html:1)
  - 依理想張緊弦關係由單一或多振型頻率反算索力，多振型採過原點擬合並顯示諧波偏差。每列 `mode` 必須是正安全整數；來源 JSON 的布林、物件／陣列、空字串、夾帶單位或其他非嚴格數字不得以寬鬆轉型帶入。計算鏈所有量都必須為 finite，且凡定義為正值的中間量與結果均須大於 0，否則失敗關閉。
  - 有效振動長度、單位長度總質量、頻率／振型辨識與諧波容許差共 4 項依據必須可追溯；提供目標索力時，另須有「目標索力與容許差」依據，合計 5 項。空白、`待確認`、`N/A`、`不適用` 等占位文字不得通過。諧波容許差與目標索力容許差的 `0.1%–10%` 都只是本頁有效輸入範圍，不是規範上限；實際採用值屬專案指定，計算書在有目標時須列目標容許差、索力下限／上限及其依據。此快算不自動修正垂度、彎曲勁度、端部柔度、斜度、阻尼器或集中質量，亦不取代鋼索強度、疲勞、錨頭與整體安全詳算。
- 上述六個局部快算工具以 `local-quick-tool-metadata.js` 作為公開版本唯一來源；首頁、工具頁、案件 JSON 與計算書的「工具版本」必須一致，並另列 `Core.version` 為「計算引擎」，避免排版改版與公式核心改版互相混淆。
- 連續梁、平面剛架、斷面性質與合成斷面以 `analysis-section-tool-metadata.js` 統一公開版本與內嵌計算引擎識別；工具頁、案件 JSON 與計算書必須沿用同一份 metadata，計算書保留大寫 `V` 的公開版本並另列「計算引擎」。
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
  - 在 Edge/CDP 內檢查六個局部快算頁的乾淨路由、JSON 匯出 / 回讀、詳算式與簡易結果列印計算書，並把報告 HTML 轉成可讀文字抽檢必要章節與 page-only wording 排除清單。桌機代表案例會實際下載 6 份 TXT，核對 UTF-8 BOM、可追溯檔名、畫面計算書同源內容、SHA-256 與附件組包阻擋結果。6 個工作頁的瀏覽器直接列印另由共用邊界樣式完全封鎖，只輸出一頁操作指引；真正的計算書仍由頁面上的「列印計算書」流程產生。
- 風力 / 地震正式頁瀏覽器 smoke：
  [結構工具箱/tools/formal-browser-smoke.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-browser-smoke.test.js:1)
- 風力 / 地震正式工具 manifest：
  [結構工具箱/tools/formal-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.manifest.json:1)
- 風力 / 地震正式工具 manifest runner：
  [結構工具箱/tools/formal-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.run.js:1)
- 風力 / 地震正式工具共同契約測試：
  [結構工具箱/tools/formal-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-tools.contract.test.js:1)
  - 固定檢查正式工具 manifest、乾淨路由、報表分流、示意圖角色與 HTML 彈窗型計算書可讀文字，避免頁面專用「優先建議報告閱讀狀態」混入列印計算書。14 個正式風力／地震計算書統一由 `core/ui/report.js` 產生內部審閱／正式附件核可控制；空白案件欄位不阻擋列印或核可，工程 review / blocked 仍如實留在結果但不產生 DRAFT 浮水印。預覽工具列可直接下載目前版本 HTML，亦可由同一份計算書狀態衍生 TXT 文字備查；TXT 不因來源 HTML 已核可而取得正式附件資格。browser smoke 逐工具實際下載 14 份 TXT，核對 UTF-8 BOM、可追溯檔名、同源內容、SHA-256、圖形與 page-only wording 排除，並要求附件組包固定阻擋為 `non-formal-reference-text`；實體標示物另鎖定表 2.10 的 `C_f(ν)`、`C_f(M/N)` 與取較大控制路線。HTML 下載檔會保留一條可由附件組包檢查器靜態辨識的文件狀態、核可時間與計算指紋，不必執行 JavaScript，重新開啟時則沿用該列且不重複產生狀態列或核可控制。核可後修改選填核可紀錄會立即回到內部審閱並清除原核可時間，必須重新勾選才形成新的正式附件。分頁標題也會隨核可切換成「計算書名稱＋文件狀態＋計算指紋」，使瀏覽器列印／存 PDF 的預設檔名可直接辨識版本。案件 JSON 匯入固定驗證完全相同的 schema、工具識別、工具版本與來源計算指紋，套用後必須由目前計算核心重算出同一指紋；錯版本、輸入不合格或重算不一致時會保留／回復原輸入。browser smoke 逐工具實測正常 round-trip、錯版本不改畫面、錯指紋回復、核可切換、HTML 保存、靜態附件辨識、PDF 預設標題、選填核可紀錄異動撤銷核可，以及計算輸入變更撤銷核可。14 個工作頁的瀏覽器直接列印仍由共用邊界樣式完全封鎖。
- 耐風共用案件檔與一鍵預填契約：
  [結構工具箱/tools/wind-shared-profile.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/wind-shared-profile.contract.test.js:1)
  - `wind-overview.html` 以 `wind-shared-profile.v1` 保存案件識別、地點、地況、用途係數、Kzt 與主結構幾何；由總覽開啟 11 個支援工具時，會以明確欄位映射自動預填。只有主風力抵抗系統工具會承接總高、正整數樓層數與 X／Y 平面尺寸；屋頂平均高、屋簷高、風向專用尺寸、招牌與塔體等專用幾何不會由總覽代填，所有子工具仍須確認其專用幾何與規範路線。
- 跨工具共用表頭與明確套用契約：
  [結構工具箱/tools/project-meta-profile.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/project-meta-profile.test.js:1)
- 目前具備 `projName`、`projNo`、`projDesigner` 標準欄位的 34 個 RC、鋼構、風力、地震、局部快算與一般分析頁，均可將非空白表頭儲存為 `tool-project-meta-profile.v1`，並由 `tool-project-meta-profile-library.v1` 保存最多 20 個案件。既有單一共用表頭會自動承接到清單；有計畫編號時以編號辨識同案，重存即更新而不重複，超過上限才移除最舊資料。清單可依案名、編號或設計者搜尋，並以成功套用時間優先、儲存時間次之排列；單純搜尋或選案不算使用。案件可封存而不刪除，預設不顯示；封存案件必須先解除封存才可套用。最近使用與封存狀態保存於本機 `tool-project-meta-profile-view.v1`，搜尋字詞不留存；這些狀態只管理 HTML 清單，不寫入案件 profile、備份或計算書。選案只改變待套用來源、不改目前頁面，仍須明確點選套用。共用資料只包含計畫名稱、編號與設計者，不含尺寸、荷重、材料、計算參數或核可狀態；空白來源不覆蓋目標頁既有值，三欄皆空白時不取代既有清單。目標頁已有不同的非空白值時，第一次點擊只列出衝突欄位且不改畫面，必須針對同一份來源與未變更的目標資料再次確認才會覆寫；空白或相同值則可直接套用。若同一案件後續改變計畫編號或主要識別，可用「更新所選識別」先比較原案件與目前頁面，第二次確認後原地更名並承接封存與最近使用狀態；新識別若已存在則不直接覆寫，必須明確選擇保留既有目標案件或採用目前頁面表頭，再將兩筆合併為一筆。預覽期間清單與頁面皆零寫入，頁面或清單變更會使舊確認失效。清單可匯出為封閉的 `tool-project-meta-profile-backup.v1` JSON 並在其他瀏覽器匯入；匯入固定先預覽、再次確認才合併，本機缺少案件列為新增，同案內容相同略過，內容不同則進入逐案差異選擇；若將超過 20 筆則整批阻擋且不刪除任何本機資料。備份包含全部作用中與封存案件的三欄表頭內容，但不攜帶本機封存或最近使用標記；匯入的新案件預設為作用中。備份上限 256 KiB，格式、筆數、重複識別、允許欄位及「不含工程輸入／核可狀態」邊界均會重新驗證；預覽後本機清單若改變，舊確認立即失效。控制列僅顯示於 HTML 工作頁並於列印隱藏，空白表頭仍可由主文承接且不影響附件核可。
  - 所選案件另在 HTML 控制列顯示儲存時間、來源工具與版本，協助辨識資料來源；這些資訊仍不寫入計算書。永久刪除固定採兩次明確點擊，第一次只顯示不可復原警告且維持零寫入；選案、搜尋、封存、套用、匯入、匯出、重新儲存或底層清單改變都會撤銷舊確認。需要保留但暫不使用的案件應採可復原封存。
  - 備份匯入遇到同一案件識別時，會逐欄比較計畫名稱、編號與設計者；內容相同直接略過，內容不同則在 HTML 顯示本機／備份差異，逐案提供「保留本機」與「採用備份」。預設一律保留本機；改選採用備份仍只更新預覽，最後整批確認且本機 library signature 未變更才寫入。替換同案只更新三欄 profile 與其來源時間資訊，不改案件數、封存／最近使用狀態、目前頁面、工程輸入或核可狀態。
- 風力 / 地震條文語意追蹤 catalog：
  [結構工具箱/tools/formal-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.catalog.json:1)
- 風力 / 地震條文語意追蹤契約測試：
  [結構工具箱/tools/formal-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/formal-traceability.contract.test.js:1)
- 錨栓條文語意追蹤契約測試：
  [螺栓檢討/anchor-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/螺栓檢討/anchor-traceability.contract.test.js:1)
  - 以 `螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json` 與 `螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts` 為源頭，確認錨栓第17章、17.10、22.8.3、產品評估與補強鋼筋 traceability 仍可追到輸入、計算、報告、證據與人工複核邊界；平台 preflight 會以 `anchor-traceability-contract` 留下獨立通過紀錄，再由 `anchor-verify` 與 `anchor-route` 覆核原始碼與部署鏡像。
- 錨栓報告邊界契約測試：
  [螺栓檢討/anchor-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/螺栓檢討/anchor-report.contract.test.js:1)
  - 包裝 `reportExport` / `reportDocx` / `reportWorkbook` / `reportText` / `attachmentReadiness` / `reportDocumentState` / `reportWorkspace` / `documentApproval` / `backup` 與 `reportArtifacts` 十組 vitest，確認頁面輔助文字不混入錨栓 HTML、PDF、DOCX、XLSX 或 TXT。所有正式輸出預設為內部審閱；明確勾選核可後，HTML / DOCX / XLSX 均標示正式附件與核可時間，檔名不再附加 `_DRAFT`。TXT 從同一次 HTML 報告主文衍生，使用 UTF-8 BOM、追溯檔名與可重算 SHA-256，固定標示為非正式文字備查，附件組包以 `non-formal-reference-text` 阻擋。案件欄位可留白並由主文承接，工程 NG 亦可經文件核可如實輸出。任何計算內容、產品、案例或匯入狀態變更，以及公司、案號、設計／校核人、發行日期、輸出模式或 LOGO 等成品設定變更，都會撤銷舊核可；只有核可旗標、匯出留痕、衍生快照與儲存時間不會誤觸撤銷。工作區 JSON v2 仍以目前核心重算並比對每一案例指紋，錯產品、缺案例或指紋不符時保留原工作區。
- 石材報告邊界契約測試：
  [石材固定/stone-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/石材固定/stone-report.contract.test.js:1)
  - 包裝 `server_smoke_test.py` 內與匯出稽核最相關的測試，固定檢查 Word/PDF 匯出稽核摘要、頁面專用「優先建議報告閱讀狀態」清理與 payload HTML 不一致時的降級判定，避免 page-only 閱讀狀態混入正式交付。V2 操作主頁另共用 `結構工具箱/core/direct-print-boundary.css`；瀏覽器功能表直接列印只顯示一頁邊界通知，`#printout` 不得繞過封鎖，正式預覽 / PDF / Word 仍走獨立報表輸出。
- 跨家族報告揭露契約測試：
  [結構工具箱/tools/report-disclosure.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/report-disclosure.contract.test.js:1)
  - 讀取 formal、RC、鋼構、錨栓、石材、覆工板與開挖擋土支撐 traceability catalog，要求每筆 trace 至少有一個人可讀報告落點、人工複核邊界與可追溯依據，並以 `report-disclosure-contract` 納入 preflight。`結構工具箱/tools/calculation-book-content-boundary.json` 是全工具計算書內容的單一來源，`calculation-book-content-boundary.js` 則提供 release 與日常附件組包共用的判讀器：統一排除頁面閱讀狀態、介面模式、流程提示、方法分級與規範覆蓋矩陣，並要求實際成品包含採用輸入、計算／檢核過程、工程結果及至少兩個實際工程數值；版本、日期、時間與計算指紋不計入數值證據。明確標題為計算摘要者可省略重複詳算，但仍須保留採用輸入、工程結果與相同的數值門檻；原生計算書另須保有工具、版本、輸出時間及計算指紋。必要條文、假設、計算結果與已完成複核仍放在對應計算列。
- 交付物一致性契約測試：
  [結構工具箱/tools/delivery-artifacts.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/delivery-artifacts.contract.test.js:1)
  - 追蹤石材 audit JSON / Word / PDF、錨栓 HTML / XLSX / DOCX 報告、覆工板 JSON 匯出 / Word 計算書與開挖擋土支撐 PDF / DOCX / latest download API 的輸出邊界，要求 traceability catalog、README、smoke fixture、報表產生器、下載端點與前端產出狀態一致，並以 `delivery-artifacts-contract` 納入 preflight 與 Global Governance Gates。
- 公開狀態宣告一致性契約測試：
  [結構工具箱/tools/public-status-claims.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/public-status-claims.contract.test.js:1)
  - 以首頁 `home.js` 動態產生的工具 metadata 清冊為唯一公開工具清冊，逐卡禁止會自行過期的 `NEW` 標籤。RC 家族入口的 11 個版本與 formal 狀態必須對齊首頁，並移除手動整體版本、最後改版日期與 draft 標示；RC 公開入口固定讀 tracked `platform-status.json`。鋼構四個正式入口對齊共用 `SteelToolMetadata`；風力／地震 17 個公開入口對齊 `FormalToolMetadata`，其中 14 個報告把公開語意版本列為「工具版本」，既有 `TOOL_VERSION` 只作案件相容與計算核心識別，另列為「計算引擎」。連續梁、平面剛架、斷面性質與合成斷面則由 `AnalysisSectionToolMetadata` 鎖住首頁、工具頁、案件 JSON 與計算書的版本／引擎分工。石材畫面、核心與報告共用 `StonePublicMetadata` 的 `V3.0.7`，不再重複顯示舊 `V2`／`V2.1`。錨栓同樣把首頁 `V1.0` 與 build-derived 計算引擎分欄；覆工板的畫面、JSON 與報表共用 metadata；開挖入口維持「服務型」且不固化通過次數。公開頁預設只讀 tracked 平台快照，本機私有 audit 必須以明確診斷模式選用。乾淨 Pages artifact 即使由 localhost 預覽，也不得探測不發布的 `output/audit`；`index-classic.html` 只保留舊書籤相容。契約另沿用 canonical public-evidence schema：preflight 與 report-readiness 必須屬於同一輪乾淨、強制重跑且完整通過的 release；platform-status 保留平台 audit 自己的 runId，但產生時間必須落在該 release 執行窗口內。Pages HTTP smoke 會拒絕舊宣告，Playwright 則在桌面與行動版核對 canonical 版本，並驗證 RC、舊網址相容入口、分析／斷面、鋼構、風力／地震、石材、覆工板與開挖入口的直接列印封鎖。
- 正式放行證據契約測試：
  [結構工具箱/tools/release-readiness.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/release-readiness.contract.test.js:1)
  - 正式 release 單例鎖：`release-preflight-lock.ps1` 以工作區正規化路徑衍生 Windows 具名 Mutex，同一工作區第二輪立即失敗關閉；持鎖程序被終止後由作業系統自動釋放，不留下需人工刪除的鎖檔。不同工作區及 quick／CI preflight 不互相阻擋；`release-preflight-lock.test.js` 會以真實雙程序覆蓋競爭、隔離與強制終止後重新取得。
  - 確認 `run-preflight-tools-release.bat` 固定帶 `-ForceSlowChecks` 與 `-ForcePlatformAudit` 且不透傳任意參數，preflight 本體也會拒絕 `-Quick` 與 release force flags 同時使用；啟動時另記錄 `sourceCommitSha`、`sourceBranch`、`sourceDirty`，正式放行只接受可辨識 commit 且工作樹乾淨的來源。`結構工具箱/tools/rendered-delivery-evidence.js` 會把風力 / 地震、局部快算、鋼構與 SRC 正式報表真正列印成 PDF，再以 Poppler 檢查頁數、可讀文字、非空白頁、稀疏末頁、頁邊截切、表格標題、閱讀順序、頁尾與內容不得混列、頁尾不得只剩孤立章節標題、每個續頁必須從章節 / 步驟 / 重複表頭開始，以及 page-only 文字排除；從孤立公式、單一資料列或無標籤片段起頁時，`uncontextualPageStartCount` 必須大於 0 並阻擋正式放行。上述 canonical PDF 的原始 evidence 會先保存成品 SHA-256，family summary 再獨立保存成品 bytes、成品 SHA-256 與 evidence SHA-256；總放行逐檔重讀三者並比對，檔案即使被等長替換成另一份有效 PDF 仍須阻擋。負向 fixture 固定證明此等長改寫不會只靠 `%PDF` 簽章漏過。這些雜湊只留在私人當輪證據，不進計算書或 Pages 公開快照。共用列印樣式會讓章節標題跟隨後續內容、表格列不被拆頁，且跨頁表格重複表頭；短輸入群組可用明確的 `keepTogether` 標記局部保留，不對所有輸入表全面強制不跨頁。`結構工具箱/tools/rendered-delivery-evidence.inventory.json` 對齊首頁 40 個 formal 入口，`結構工具箱/tools/rendered-delivery-evidence.contract.test.js` 則彙整 RC、鋼構、風 / 震、局部快算、錨栓、石材、覆工板、SRC 梁與 SRC 柱的當輪實際證據；非 formal 的動力分析摘要另以 `seismic-report` 補充證據重新解析當輪 PDF 與 evidence JSON，開挖本機服務則以 `excavation-formal` 保存當輪 PDF、DOCX 與 latest download 副本並核對雜湊，使首頁 `40/40` 與補充報告 / 服務成品 `2/2` 分開揭露。錨栓正式報告會把當輪 HTML、DOCX、XLSX 保存在 `anchor-formal` 證據目錄，總閘門會重新解析 HTML、`word/document.xml` 與 XLSX workbook / worksheet XML，核對案名、章節、工作表、檔案尺寸與 page-only 排除清單，不再只接受 `anchor-report-contract` 日誌。石材正式報告會把當輪 PDF、DOCX 與 audit JSON 保存在 `stone-formal` 證據目錄，總閘門會重新解析 PDF 並核對 DOCX 簽章與 audit 尺寸，不再只接受測試日誌文字。覆工板正式報告會把當輪 DOCX 保存在 `decking-formal` 證據目錄，總閘門會重新解析 `word/document.xml`，核對案名、編號、日期、章節、段落、表格、檔案尺寸與 page-only 排除清單，不再接受固定共用路徑或測試日誌代替當輪成品。RC 平台 audit 延續執行各正式頁的 PNG / PDF 視覺 smoke，並共用同一套 PDF 分頁成品檢查。所有渲染證據寫入當輪 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/`，並由 `release-readiness-contract` 鎖住；preflight summary / history / homepage status 同時保留 force flags、Git 來源身分、啟動時工作樹狀態、慢測重用與平台 audit 重用資訊，避免把一般 full run、dirty run 或 quick run 誤當正式放行證據。release 尾段 history manifest 尚未更新時，矩陣刷新必須優先讀取當輪通過的 full summary 與完整渲染證據；latest 為 quick 或失敗時則回退最近一次通過的 full history，不讓失敗 run 覆蓋公開成功快照。
- Canonical 渲染完整性集合：schema v3 release aggregate 會把風力／地震、局部快算、鋼構與 SRC 的 33 組 PDF／evidence 去重為 66 份實體檔。Family summary 必須同時保存 PDF 與 evidence 的 bytes、SHA-256；總閘門逐檔穩定重讀並保存集合 SHA-256。PDF 或 evidence 任一遭同大小替換都會阻擋 release；詳細清冊只留在私人當輪證據。Schema v14 再納入群樁側向分配的第 34 組 RC 結果鏈與第 34 份 RC HTML，當時 Pages 的「成品檔案完整性」公開正式 PDF／證據 `66/66`、RC PDF／PNG `66/66`、混合格式附件 `13/13` 與合計 `145/145`。Schema v28 將地坪 Westergaard 的三組 PDF／evidence 納入 canonical 集合，新正式證據因此要求 `72/72`，公開合計提升為 `151/151`；Schema v29 再納入柱保護層偏差強度評估的詳細、內部審閱與阻擋審閱三組 PDF／evidence，當輪新正式證據要求 `78/78`，公開合計提升為 `157/157`；Schema v30 再納入鋼索索力頻率法快算的詳細、內部審閱與阻擋審閱三組 PDF／evidence，新正式證據要求 canonical `84/84`、公開合計 `163/163`。Schema v27、Schema v28 與 Schema v29 的舊正式快照只作過渡，不得滿足 Schema v30。公開狀態只顯示類別、數量及通過狀態，不公開檔名、逐檔雜湊或完整性集合。Schema v15 另要求 32 組具專案 JSON 的 RC 設計案例，全部以真實來源 JSON 與核可後正式 HTML 通過附件檢查器，且來源／報告指紋必須與重算結果一致；Pages 只公開「RC 來源組包 `32/32`」，不公開案例、檔名、版本、scope、來源雜湊或計算指紋。Schema v16 再把 RC 設計與補強共 34 份核可 HTML 以無外部網路請求方式重新開啟並列印成 PDF，逐份重驗正式狀態、工程內容、頁面專用文字排除、分頁及成品 SHA-256；Pages 只公開「RC 核可 HTML 列印 `34/34`」，不公開檔名、bytes、成品雜湊或指紋。Schema v17 再要求這 34 份 HTML 對標題、追溯欄位、輸入、公式、結果、圖像資料與頁尾建立可重算的 SHA-256 內容封印；瀏覽器重開與附件檢查器必須分別重算一致，內容變更即阻擋組包，舊版無封印輸出則轉人工確認。Schema v18 另以獨立 SHA-256 核可封印綁定文件狀態、核可時間、計算指紋、報告／檔案標題及內容封印；核可欄位異動會獨立阻擋，舊版缺少核可封印則轉人工複核。Schema v19 將同一雙封印規則擴及 14 項風力／地震正式計算書，並由實際下載 HTML 重算、驗證內容與核可資料的獨立竄改攔截。Schema v20 再將同一規則擴及鋼構主工具連接板、主工具拉力構件、獨立連接板、鋼梁與鋼柱共 5 份正式 HTML；三類主工具報告也改為預設可列印內部審閱、明確核可後正式附件，空白案件欄位省略且不阻擋核可。Schema v21 再納入錨栓正式 HTML：核可只能在工作頁完成，匯出附件的身分為只讀，內容與核可資料各自封印且兩種竄改反例都必須被阻擋。兩種封印都是下載後防竄改證據，不是核可人身分的數位簽章；Pages 只公開各家族的內容／核可封印完成數。
- Schema v31 將鋼構主工具單剪力板 Shear Tab 納入渲染、鋼構結果鏈與內容／核可雙封印，三項都要求 `6/6`；其 PDF／evidence pair 使 canonical 提升為 `86/86`、公開合計提升為 `165/165`。首頁 formal routes 仍為 `39/39`、局部快算仍為 `6/6`；Schema v30 的鋼構 `5/5`、canonical `84/84`、公開 `163/163` 與更舊快照只作過渡，不得滿足 Schema v31。
- Schema v32 將平面剛架正式附件納入矩陣外獨立 `frame-analysis-formal` 家族：`frame-analysis-browser-smoke.test.js` 保存來源 JSON 重播、PDF／evidence、核可 HTML 與內容／核可雙封印，三條證據鏈均要求 `1/1`；新增 canonical pair 使完整性為 `88/88`、公開成品合計為 `167/167`，首頁 formal routes 為 `40/40`。Schema v31 的 `39/39`、`86/86`、`165/165` 只作已發布 lineage，不得滿足 Schema v32。
- Schema v33 將鋼構主工具平板支撐 Gusset 拉力接頭納入鋼構結果鏈與內容／核可雙封印，鋼構三條證據鏈均要求 `7/7`；新增 PDF／evidence pair 使 canonical 完整性為 `90/90`、公開成品合計為 `169/169`，首頁 formal routes 維持 `40/40`。Gusset 正式範圍限 LRFD、靜力非耐震、非 BRB、同心純拉力、扁鋼／平板支撐、單一直線標準孔 F10T 承壓型單剪螺栓與接至支承的雙側縱向填角銲；F10T 標稱剪應力依表 10.3-2 採含牙 4.00 tf/cm²／不含牙 5.00 tf/cm²，Gusset 有效淨面積採 `Ae = min(An, 0.85Ag)`。Whitmore 單列起始寬為 0，展開長度固定為首末螺栓中心距；V1 另保守限縮 `Lconn ≤ 1250 mm`，這是尚未實作長接合折減時的工具適用邊界，不宣稱為所有支撐端接的普遍條文要求。壓力、偏心、外加剪力／彎矩、角鋼／WT／HSS、剪力遲滯、反覆載重與其他拓樸均失敗關閉。Schema v32 的鋼構 `6/6`、canonical `88/88`、公開 `167/167` 只供 lineage，不得滿足 Schema v33。
- Schema v34 將鋼構主工具梁柱彎矩接頭與全斷面 CJP 耐震柱續接一併納入鋼構結果鏈與內容／核可雙封印，鋼構三條證據鏈均要求 `9/9`；兩組 PDF／evidence pair 使 canonical 完整性為 `94/94`、公開成品合計為 `173/173`，首頁 formal routes 維持 `40/40`。梁柱彎矩接頭限 LRFD、單一指定平面與 SMRF／IMRF 審查，保留 `Mpr`、跨端 `MprFar`、`Vp=(Mpr+MprFar)×1000/Lh`（`Mpr` 為 kN-m、`Lh` 為 mm）、增強節點強柱弱梁分母及外部硬體證據，且不宣稱 AISC 358 預認證或完整接頭設計；柱續接限相同材料、同斷面、對齊軋製 H 型鋼的全斷面 CJP，位置須至少 1.2 m、最大板厚 40 mm，並保存 Eamp、WPS 與 NDT 證據，不宣稱完整柱構材設計或現況驗收。兩者皆以嚴格來源 JSON、失敗關閉 preset、可讀公式與精確 NG 失敗集合組包；Schema v33 的鋼構 `7/7`、canonical `90/90`、公開 `169/169` 只供 lineage，不得滿足 Schema v34。
- Schema v35 將 RSC v4／RSB v1 接收端正式附件納入 `excavation-formal`：附件 `1/1`、六份實體成品 `6/6`，canonical `96/96`、mixed-format `17/17`、乾淨 DOCX `5/5`、公開匿名成品合計 `179/179`。正式放行必須實際保存 exact RSC／RSB JSON、PDF、DOCX、canonical evidence 與只含 PDF／evidence 的 formal-source ZIP，並在私密 aggregate 重驗逐檔 bytes／SHA-256、RSC→RSB 父鏈、需求重播、PDF／DOCX 內容、OOXML、canonical 關聯及 ZIP 清冊；Pages 只公開 `1/1`、`6/6` 與匿名分類數量，不得公開檔名、雜湊、計算指紋或逐檔 records。Schema v34 的 `94/94`、`13/13`、`4/4`、`173/173` 只供 transition，不得滿足 Schema v35。
- Shear Tab 的工程適用性採規範判定並失敗關閉：連接板與梁腹板 `Fy ≤ 345 MPa`，連接板、梁腹板與支承材料均須 `Fu ≥ Fy`，螺栓節距 `pitch ≤ 76.2 mm`，板高 `plateHeight ≤ 914.4 mm`。一般延性材料另須依專案材料文件或設計者確認 `conventionalMaterialConfirmed=true`；此專案確認不得覆寫上述數值限制。連接板彎曲以螺栓側與銲道側偏心的控制值 `e_p = max(e_b, e_w)` 計算；頁面、來源 JSON、計算書與正式附件均須保留 `e_b`、`e_w`、`e_p` 及控制側的可追溯記錄。
- Schema v22 新增正式 Word 附件乾淨封裝 gate：石材、錨栓、覆工板與開挖擋土支撐的當輪 DOCX 必須 `4/4` 通過 OOXML 關聯稽核。未引用媒體或頁首頁尾、實際批註、未接受修訂、外掛範本、外部圖片、嵌入物件、巨集或非預期 custom XML 都會阻擋 release；合法超連結與 python-docx 空白書目容器不誤判。Pages 只公開完成數，不公開檔名、封裝清冊或逐檔細節。
- Schema v23 新增正式 Excel 附件乾淨封裝 gate：目前錨栓檢討當輪 XLSX 必須 `1/1` 通過 OOXML 關聯、工作表可見性與公式快取稽核。外部關聯、外部公式或連線、公式錯誤／缺少快取結果、隱藏工作表／列／欄／名稱、批註、嵌入物件、巨集、孤兒媒體或非預期 custom XML 都會阻擋 release；正常內部重算公式、凍結標題、篩選器與列印設定可保留。Pages 只公開完成數，不公開檔名、工作表清冊、公式或逐檔細節。
- Schema v24 新增正式 Excel 列印成品 gate：錨栓 XLSX 產製器本身必須為 9 張工作表寫入 A4、寬表橫向、單頁寬、不強制單頁高、明確列印範圍與續頁重複表頭。release 以獨立 Microsoft Excel 程序唯讀開啟實際成品，禁止外部連結更新與巨集，逐張輸出 PDF；9/9 張工作表須通過來源雜湊、A4／方向／縮放設定、可讀文字、非空白頁、頁邊裁切、續頁表頭及橫向溢出檢查。Office 匯出摘要、工作表名稱、PDF、逐頁像素指標與雜湊只留在私人 release 證據，Pages 僅公開 `1/1` 活頁簿與 `9/9` 工作表完成數。
- Schema v25 新增正式 Excel 雙封印 gate：錨栓 XLSX 的 `Summary` 可見列保存內容封印與核可封印。內容封印涵蓋所有工作表的非空白儲存格、公式與快取結果，但不混入文件狀態等核可欄位；核可封印再綁定內容 SHA-256、文件狀態、核可資訊、產出工具、版本、固定格式輸出時間與計算指紋。release 由獨立 OOXML 驗證器重算 `1/1` 內容封印及 `1/1` 核可封印，並以正文竄改、偽造內容封印及核可欄位竄改反例證明失敗關閉。這是 SHA-256 防竄改證據，不是核可人身分的數位簽章；Pages 只公開 `2/2` 完成數，不公開封印值、工作表內容或竄改樣本。
- Schema v27 把 RC 梁／基礎流程內的深梁、基礎深梁與樁帽三維 STM 升為獨立首頁正式入口，並納入專用正式附件 gate。三者各自先輸出內部審閱 PDF 與整頁 PNG，再實際勾選核可、下載可攜 HTML、重算內容／核可雙封印、驗證兩類竄改阻擋，最後在零外部網路請求的新頁面重開並列印正式 PDF；release aggregate 必須從當輪 `rc-stm-formal` 目錄逐檔重驗 `3/3` 附件及 `12/12` 實體成品。三頁新增 `/rc-deep-beam-stm`、`/rc-foundation-deep-beam-stm`、`/rc-pile-cap-3d-stm` 獨立首頁正式入口，使正式入口總數成為 36；仍保留 RC 梁／基礎流程銜接與限定拓樸，也不改變既有 RC 設計／補強 34 組結果鏈及 32 組來源 JSON 組包口徑。
  - 原子邊界同時納入 RC 梁最小／最大配筋與多排筋核心、深梁適用性的獨立工程基準，以及平面剛架 V1.6 將 D／L／W／E 基本反力傳入樁帽 STM 的上游路徑；不得只提交三個 STM 頁面或只提交接收端。
- 正式計算書結果鏈：schema v4 會要求 14 個風力／地震正式工具先在同一瀏覽器工作階段完成 manifest 全部 golden case 的 selector、metric 與文字結果斷言，再以最後一個已驗證案例的同一計算狀態產生正式附件。Producer summary 保存 golden case 身分雜湊、驗證案例數、斷言數與報告計算指紋，release aggregate 重新核對 `14/14` 並保存集合 SHA-256；Pages 僅顯示「數值結果鏈 `14/14`」，不公開案例輸入、預期數值、案例雜湊或計算指紋。
- RC 正式計算書結果鏈：schema v5 另要求 RC 梁、柱、板、牆、剪力牆、基礎與單樁的 30 組瀏覽器回歸案例，先把實際專案快照重現計算，再確認 PDF 與核可後可攜 HTML 沿用同一計算指紋。每筆 producer audit 保存案例 ID、專案快照 SHA-256、結果斷言數及計算指紋；release aggregate 核對 `30/30`、唯一案例身分與集合 SHA-256。Pages 僅顯示「RC 結果鏈 `30/30`」，不公開案例資料、專案快照雜湊或計算指紋。
- 鋼構正式計算書結果鏈：schema v6 再要求主工具連接板、主工具拉力構件、獨立連接板、鋼梁與鋼柱共 5 個計算來源，在同一瀏覽器工作階段匯出來源 JSON、重新匯入重算、確認不相容版本會被拒絕且不改動既有狀態，再核對渲染計算書沿用同一計算指紋。Producer 保存來源 payload SHA-256、結果斷言數與計算指紋；release aggregate 核對 `5/5`、唯一案例身分與集合 SHA-256。Pages 僅顯示「鋼構結果鏈 `5/5`」，不公開來源資料、來源雜湊或計算指紋。
- RC 補強結果鏈：schema v7 把梁、柱補強兩組真實瀏覽器案例加入既有 RC 結果鏈。Producer 先保存補強表單與計算結果快照，刻意改動需求值後再還原表單重算，確認結果與原快照一致，最後核對重播報告及核可後可攜 HTML 沿用同一計算指紋；release aggregate 因此由 `30/30` 擴為 `32/32`。Pages 仍只顯示「RC 結果鏈 `32/32`」，不公開案例內容、來源快照雜湊或計算指紋。
- RC 土壓銜接結果鏈：schema v13 再加入土壓 JSON → RC 基礎的真實瀏覽器案例；先由同版土壓核心重算來源、拒絕遭竄改或不相容的模型，再保存 RC 專案重播與 PDF／正式 HTML 同一計算指紋，將 RC 結果鏈擴為 `33/33`。
- RC 群樁側向結果鏈：schema v14 加入群樁 X／Y 向側向荷重分配案例，保存輸入重播、PDF／PNG、正式 HTML 與同一計算指紋，將 RC 結果鏈擴為 `34/34`；專業 p-y 結果必須經模型核對及工程師明確採用，未採用相符結果時仍維持待確認，不宣稱側向設計完成。
- 石材正式計算書結果鏈：schema v8 由目前瀏覽器核心重播 `case_01_standard_safe` golden 輸入，精確核對地震力、固定件需求與控制強度等 6 項結果，再由同一 payload 產生 PDF、DOCX 與 audit。Producer 保存 golden 檔、來源 payload、輸入／結果／計算來源及三份成品的 SHA-256；release aggregate 核對 `1/1` 並形成私人集合 SHA-256。Pages 僅顯示「石材結果鏈 `1/1`」，不公開 golden 案例資料、來源 payload、結果或成品雜湊。
- 錨栓正式計算書結果鏈：schema v9 由 v2 工作區備份保存案例重現指紋，匯入後以目前計算核心重新計算並核對控制組合、控制模式、DCR 與判定等 7 項結果，再以同一重現指紋產生正式 HTML、DOCX 與 XLSX。Producer 私密保存實際來源備份及三份成品 SHA-256；release aggregate 核對 `1/1` 並形成私人集合 SHA-256。Pages 僅顯示「錨栓結果鏈 `1/1`」，不公開工作區資料、來源備份雜湊、案例重現／計算指紋或成品雜湊。
- 覆工板正式計算書結果鏈：schema v10 由固定匯出 JSON 的六組輸入呼叫目前頁面計算核心，逐項重算覆工板面、小梁、大梁、共構柱、握裹與樁基共 31 項控制結果，再以重算結果及同一計算指紋產生 DOCX。Producer 私密保存實際來源 JSON、來源及成品 SHA-256；release aggregate 核對 `1/1` 並形成私人集合 SHA-256。Pages 僅顯示「覆工板結果鏈 `1/1`」，不公開來源 JSON、輸入／結果資料、計算指紋或成品雜湊。
