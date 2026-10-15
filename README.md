# 結構工具平台 V1.6

混凝土強度非破壞檢測推估 V0.1：入口 `/concrete-strength-ndt`，提供反彈錘、超音波及鑽心資料推估與配對比對、兩種內部審閱計算書、TXT 備查及案例 JSON。`結構工具箱/tools/concrete-ndt/` 包含 `concrete-strength-ndt-core.js`、`concrete-strength-ndt-spec.js`、`concrete-strength-ndt.html`、`concrete-strength-ndt-golden-cases.js`、`concrete-strength-ndt-core.test.js`；所有工程公式與係數集中規格模組，預設值為假設，需技師確認。首頁分類 `reference`、身分 `assist`，不提供正式附件資格，三法彙整 n 不視為獨立試體數；不取代現地校正、材料試驗或工程判定。局部快算清冊納入第七個工具，原六個正式工具不變；workflow 納入 NDT 後為 42 入口、formal 仍 40。首頁來源 `結構工具箱/assets/home/src/home.source.js` 與 `vercel.json` 同步登錄，日期由既有同步腳本處理，未更動放行狀態。

現況鑑定現場紀錄 V0.7.0：入口 `/condition-survey`，新增梁 U 型裂縫條數（不列總長）、磁磚受損塊數快填、房間及照片整理、單張照片機位、主照片選擇與附件同步編號。照片附件可下載含影像 HTML、列印 PDF 及編號對照；原始媒體和全部紀錄另以版本 3 備份保存。保留平面圖庫、簡圖選取刪除、縮放擴展、照片圈註及離線拍照。操作與限制見 [field-survey/README.md](field-survey/README.md)。電腦可用 `啟動現況鑑定紀錄.bat`。

這個資料夾目前已整理成一套分層式結構工具平台，並正式進入 `V1.6`。工具箱首頁已升級為弘一設計系統新版 `結構工具箱/index.html`（深藍 hero、構件子分頁與治理卡，依 `home.js` 單一資料源驅動）；原公文版主選單保留為 `結構工具箱/index-classic.html` 可隨時回退，本機伺服器 clean route 為 `/toolbox-home`。2026-10-03 首頁改為精簡卡片（定位一段＋標籤，「輸出／閱讀狀態」收在「詳情」或「展開卡片詳情」），平台狀態與開發路線移至工具清單下方收合區，手機版分類橫向捲動、篩選 chips、搜尋列置頂；RC 梁／柱／牆／剪力牆改由共用計算操作列鏡射摘要，並在輸入分頁計算後切到綜合結果；鋼梁／鋼柱正式頁新增本機輸入草稿自動保存，啟用 TXT 的計算書預覽另可下載 Word 文書版（10/04 起為真正 `.docx`，非正式附件）。2026-10-08 第四階段：鋼構主頁 MathJax、石材頁 PDF.js 與 DOCX 執行期改為首次使用才載入（鋼構主頁初始 JS 2.64 MB → 0.55 MB、石材頁 1.82 MB → 0.66 MB）；石材本機服務探測改為服務辨識＋埠覆寫；拉力草圖與土壓示意圖版面修正；40 個正式工具頁加入共用無障礙腳本 `tool-page-a11y.js`（axe serious／critical 0）；首頁工具卡加入搜尋別名。平台目前區分：
第五階段開發門檻使用根目錄 `run-phase-gates.ps1`，直接從 V3 派工第 0 節解析 29 條命令；每個 package 完成並提交後執行，摘要保存在忽略版控的 `output/phase-gates/`，不代表正式預檢或發布。
T24 無障礙公開執行期由可讀 source 與固定 Terser 5.44.0 建置為 9,972 bytes（原 16,500），檔名與路徑不變；以 `node 結構工具箱/tools/build-tool-page-a11y.js --check` 驗證逐位元組一致，source／建置器與套件不發布至 Pages。
T31 共用執行期以 `結構工具箱/tools/build-minified-runtimes.js` 固定 Terser 5.44.0 確定性建置 a11y、案件表頭 profile 與風力核心；可讀來源與建置器列入 Pages 私有清單，公開路徑不變，石材 wind vendor 僅由同步腳本產生。
T19 工具頁無障礙檢查使用 `test-tool-page-a11y.ps1`，40 頁各以桌機／手機掃描；axe 任一違規、主地標或 H1 數量不是 1 都會失敗，詳細節點與截取結果寫入 ignored `output/playwright/tool-page-a11y/`。
T20 含 TeX 公式的計算書 popup 才請求 MathJax；報表以 Blob HTML 導覽載入，離線或逾時會顯示可讀文字 fallback，下載 HTML 可直接以 `file://` 離線重開。
T29 耐震靜力與動力頁的 Chart.js 僅於首次繪製反應譜時載入，載入失敗仍保留完整譜值資料與計算書文字內容。
覆工板手機彙整計算書改為報告區內水平捲動，可用鍵盤移動檢視寬表格；列印保留完整表格，計算與匯出內容不變。
T30 石材兩張節點參考圖改為首次放大或報表輸出才載入；計算書 HTML、Word、DOCX 與伺服器 PDF→DOCX 路徑仍內嵌圖片，失敗時明列固定 fallback。列印視窗同步保留後，以含相對資源 base 的 Blob HTML 導覽，避免 Edge 在 document.write 時停在 Paged.js 前。
T21 鋼構報表匯出前同步更新計算與摘要並沿用同一結果快照；石材 smoke 暫存以 UUID 子目錄清理，另有約 1,400 ms 靜默 TCP 降級案例。`--probe-only` 只驗本機服務探測，完整入口仍須先通過既有 UI smoke。
T23 家族慢測使用根目錄 `run-family-wrappers.ps1` 依序執行 14 個既有 wrapper，保存完整逐項 log 與 HEAD／dirty 證據；`-ListCommands` 只列清單供契約檢查。RC、鋼構及 local-quick 中採 Blob 導覽的 legacy 報表案例使用私有 `report-popup-fixture.test.js`，實際讀取 HTML Blob 並等待 Blob URL 文件 load 後再檢查自動列印與內容；六個獨立 local-quick 工具仍以原 `document.write` 測試替身覆蓋其既有輸出 API。測試檔不進 Pages。

Windows 本機可直接雙擊根目錄的 `啟動斷面計算工具.bat` 或 `啟動螺栓檢討工具.bat`，啟動必要的 localhost 服務後直接進入指定工具，不必先經過平台首頁。螺栓工具是模組化 Web App，不應直接雙擊 `anchor/index.html` 以 `file://` 開啟；專用啟動檔可避開瀏覽器模組安全限制，資料仍只在本機處理。命令列亦可使用 `node serve-local.js --route /section` 或 `node serve-local.js --route /anchor`。`serve-local-browser-smoke.test.js` 會以桌機與手機瀏覽器實測鋼構、RC、斷面、錨栓及巡檢儀表板入口，避免資料夾 redirect 或尾斜線造成相對資源與頁內連結失效；本機未產生的部署清冊與 GSM 監控 JSON 只會在明列白名單內回傳帶標記的 `null`，其他遺失資源仍維持 404。

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

工具箱首頁改用七類力量來源與檢核目的：`結構分析力量`、`風力規範外力`、`地震力規範外力`、`構件承載力檢核`、`連接、附掛物與外牆構件`、`斷面、係數與資料查詢`、`施工臨設與現場快算`。`正式核算`、`初估 / 簡化`、`本機服務` 與 `過渡工具` 只作為工具卡標籤。首頁樣式與資料驅動工具清單位於 [結構工具箱/assets/home/](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/assets/home/home.js:1)，GitHub Pages 可讀的首頁狀態快照位於 `結構工具箱/assets/status/`，由 `tool-maturity-matrix.js --write` 從本機 `output/` 精簡產生；preflight 快照優先採用最新 full run。每輪第一次矩陣 refresh 固定帶 `--preserve-homepage-status`，只驗證矩陣而不在後置檢查完成前發布半成品快照；quick 與一般 full preflight 的最後 refresh 仍保留 tracked 正式快照，只有來源乾淨且強制重跑慢測與平台巡檢的正式 release，才會在後置檢查完成後一次發布公開狀態，且不直接部署完整巡檢輸出。首頁健康卡會直接揭露 `完整檢查`、`快速檢查` 或 `正式放行` 模式與 `runId`，讓讀者能分辨目前頁面看到的是 quick、full 還是 release 證據。

首頁的「下一步」不得沿用已完成的舊缺口。基礎局部檢核、設備局部荷重與擋土土壓目前分別有 4、6、4 組 golden cases，並已納入版本化 JSON、計算書模式與來源結果重播；設備頁已新增矩形四支點偏心反力、反力與力矩平衡核對及無拉力界線，基礎頁已可選用彈性／壓密沉陷時間率與液化簡化初判，土壓頁已涵蓋 Rankine／Coulomb、Mononobe-Okabe 與分層砂黏土。懸臂式主動土壓 JSON 可由 RC 基礎頁匯入；RC 頁會以同版核心重算並比對 schema、邏輯簽章、合力與傾覆矩後才採用，並已完成線性基底反力、qmin 全寬接觸、趾版底層及踵版頂層的 Mu、Vu、As、φMn、φVc 設計。樁基頁另已依 FHWA-HIF-18-031 表 7-1 納入 X／Y 向群樁 p-multiplier 與各列水平力分配，並可匯入專業 p-y JSON、直接讀取 CSV／TSV／TXT，或從 Excel 貼上 LPile／FB-MultiPier 類表格；不直接解析 `.xlsx`。表格轉換只接受明示欄名與單位，分別擷取樁頭列位移及全深度最大絕對剪力、彎矩，並保存 X／Y 原始檔名、列數與內容 SHA-256。LPile 類單樁案例採代表單樁 p-multiplier 荷重，群樁模型則採整組 Hx／Hy；候選資料仍須通過模型、荷重、單位、容量與來源證據核對，再由工程師明確勾選採用。已驗證候選可下載為與採用來源雜湊完全相同的 JSON 歸檔，重新匯入仍須通過目前模型核對；JSON 匯入上限為 1 MiB。採用紀錄 v2 會把這份原始 JSON 隨基礎專案保存，重新開啟後仍可下載並重算 SHA-256；舊 v1 採用紀錄仍可計算，但不會憑空重建缺少的來源位元組。候選建立後若模型或轉換設定改變，下載與採用都會重新驗證並失敗封閉；來源原文或採用結果被改動時也會阻擋。計算書只列採用後的位移、剪力、彎矩、分析範圍、分析荷重及來源證據，匯入警告與歸檔操作只留在 HTML 頁面。地下水、分層回填、Coulomb 垂直分力、靜止土壓、地震載重組合與扶壁系統仍失敗封閉或維持待確認。施工整合已完成覆工板控制柱頂軸力到開挖共構柱的受控交接：來源先用現行覆工板核心重算，再由使用者以固定柱位 ID 逐階段明確匯入；同一來源分配至多根啟用柱時，後端會封閉檢查比例合計 100%、逐柱分配依據與一致階段名稱，再以來源軸力乘比例作為各柱 Np。各柱連同零施工構台荷重基準案逐案計算，並分別包絡柱互制、基礎壓入與拉拔控制階段。設計者另可逐階段明確採用附加 X／Y 偏心與依據，由後端推導 ΔMx／ΔMy 並帶正負號組合最終彎矩；覆工板來源不自行推定開挖柱座標。外部分析匯入的支撐與斜撐也已保留各有效施工階段的軸力時序及唯一控制階段，必須填寫實際施工步驟、對應依據並明確確認；控制值、採用內力或確認狀態不一致即失敗關閉。計算書只留下已採用的來源、控制階段、施工步驟、工程依據與結果，操作警告仍留在 HTML。後續規劃應先讀取最新成熟度矩陣與巡檢儀表板，再深化拆撐／重撐承接構造驗算及 SRC 構件能力。新工具仍須在上線前定義適用範圍、規範依據、案例基準及計算書邊界。

SRC 梁已升格為正式入口 `/src-beam`：具純計算核心、現行規範追溯、官方教材回歸、獨立工程基準、完整輸入／結果頁、案件 JSON 指紋重播、精簡計算書、內部審閱／正式附件核可、直接列印封鎖及真實瀏覽器 PDF 驗證。工程名稱與設計者可留空並由主文承接；附件不因空白表頭欄位被判定為 NG。release 當輪另保存 PDF、來源案件 JSON、計算指紋與雜湊證據。

SRC 柱已以 `src-column.core.v1.0.0` 升格為限定範圍的正式構材附件入口 `/src-column`，頁面 V1.0、單向案件 schema v1、雙向案件 schema v1。已完成表 3.4-2、x／y 剛度分配、鋼骨雙軸壓彎、RC 應變相容 P-M／P-M-M、第 9.3 節軸力及選定方向的第 8.4.2、9.6.1、9.6.2、9.6.3 節子檢核；Y 向 RC 可依第 5.5.2 節自動計算，Y 向鋼骨只在專案明確指定 ANSI/AISC 360-22 G6 且確認無扭轉時自動計算，否則採專案確認值。計算書只列採用資料、公式、結果與結論，預設為可列印的內部審閱；受控 catalog 斷面在完成審閱並勾選核可後可作正式附件，人工斷面則維持內部審閱。catalog schema v17 明確分開本構材附件、主文／專案引用輸入及全構架／接頭區／接合細部另案附件；空白工程欄位、供貨或材證尚未附具均不會被誤判為構材 NG。獨立 oracle、正式工程基準與 rendered-delivery 當輪 PDF／案件／指紋／雜湊證據共同阻擋不完整放行。

開挖擋土支撐匯入治理現已進一步把 BUT 安裝階段、包絡摘要的控制內力階段與拆撐階段分開保存；`.o` 並列控制階段不再被設置階段取代，時序倒置會失敗關閉。已辨識拆撐事件時，使用者必須人工指定另案檢核、樓版、重撐／回撐、永久結構或其他荷重處置，填寫承接構造與正式依據並確認檢核邊界；工具不會從事件名稱自行推定傳力。正式計算書只列已採用的生命週期、拆撐處置與工程依據，不宣稱承接構造已完成容量檢核。

已確認的拆撐處置可另由報表匯出頁建立具來源計算指紋、逐列 `ERT-` 與整包 `ERH-` 完整性指紋的承接構造交接 JSON，已發版本會保存於專案。接收端完成正式模型檢核後，可在獨立「接收端回簽助手」匯入 ERH、逐列登錄結果並由後端受控產生 `receiver-capacity-verification-receipt`，也可用同一 ERH 檢查既有 RVR；來源端會驗證 `RVR-` 指紋、ERH／ERT 關聯、來源計算指紋及完整涵蓋後保存。助手只記錄接收端已完成的工程結果，不會自行計算承接構造容量。交接輸出、助手產生或回簽匯入成功都不會自動推定承接構造正式核可；未使用數位簽章時，回簽單位、人員與正式文件仍須人工核對。附加 Ed25519 簽章的 RVR 會再區分未知、撤銷、單位不符與本機受信任公鑰；只有簽章有效、公鑰已明確登錄且單位相符時，才顯示「受信任簽章通過」。

現行 ERH／RVR v5 已將每筆承接驗算的正式模型、控制載重組合、傳力與分配、偏心與二次效應、已檢核極限狀態，以及接頭、承壓、承接主體、側向支撐／有效長度、施工順序／預載五類補充查核納入受控指紋。每類均須記錄狀態與依據，標示通過時必須連結實際文件資料及 SHA-256；整體狀態由後端推導，不能用單一 RSC H 型鋼構件證據宣稱全部查核完成。來源端 SEV v2 會逐一重算 RVR 引用的所有證據檔。這是外部正式計算結果的可追溯回簽，不是對接收端工程內容的自動核可。

接收端回簽助手另提供五類補充證據的本機受控範本庫，可重用查核依據、文件編號、版次、日期與頁碼，亦可匯出／匯入、批次套用，或使用既有 RVR／SEV Ed25519 組織金鑰建立離線簽章發布包。schema v3 會保存內容版號、修訂差異、本機審核人、核准時間、有效期限，以及簽章包匯入當下的來源驗證紀錄；只有已核准且未過期的範本可用，修訂會自動升版、撤銷核准並清除原發布來源，任何外部匯入與舊 v1／v2 範本一律待本機重新核准。發布簽章只證明來源與傳遞完整性，不證明工程正確或案件適用。範本不保存檔名或 SHA-256，套用後必須重新選取各列實際證據檔，因此不會降低 RVR v5／SEV v2 的逐案證據門檻。

接收端回簽助手另提供 RSR 離線簽署請求與簽章回應匯入；Windows 使用者可直接執行 `開挖擋土支撐\簽署RVR身分請求.bat` 選取請求及既有 Ed25519 私鑰，毋須人工拼接 JSON。私人金鑰不會傳入網頁或後端。

接收單位尚無既有 Ed25519 私鑰時，可執行 `開挖擋土支撐\建立RVR組織簽章金鑰.bat`，在本機建立密碼加密私鑰與公開 RKE 登錄包。來源端匯入 RKE 後仍須透過獨立管道核對組織與 Key ID，持有證明不得自行視為組織身分證明。信任清冊變更現由具角色的本機登入帳號執行，採 scrypt 密碼雜湊、HttpOnly／SameSite=Strict 工作階段、CSRF、登入限速及 localhost CORS；管理員可停用／啟用帳號、調整角色與重設臨時密碼，密碼重設及停用會撤銷既有工作階段。既有 `receiver-key-requester`／`receiver-key-approver` 角色 ID 維持相容，HTML 分別顯示「治理申請人」／「治理覆核人」，同時負責金鑰輪替及到期備份處置；停用或撤除治理申請角色會阻斷該帳號尚未完成的兩類申請。帳號治理事件保存在禁止更新／刪除的 SQLite 指紋鏈，且不得自行停用、改角色或經管理入口重設自己的密碼。輪替 RKE 只先建立新舊 Key ID 關聯，新金鑰完成測試與切換後由治理申請人提出 `RVE-...` 申請，再由 operator ID 不同的治理覆核人核可。SQLite 交易與唯一／異人約束封閉跨程序競爭；這仍只驗證同一服務資料庫的帳號角色，不等於外部自然人或公司授權。疑似外洩、確認外洩或私鑰遺失仍可立即一般撤銷，並以串接事件保存本機生命週期紀錄。

接收端 HTML 另提供唯讀治理權限矩陣，逐列區分管理、申請與覆核權限，並明示角色疊加不代表自動繼承其他角色。登入後會再依後端工作階段回傳的角色與臨時密碼狀態，將目前帳號三項有效權限標示為有效、暫停或未授權；兼具申請與覆核角色仍不得覆核自己的申請。矩陣、目前帳號摘要與治理說明只供操作頁核對，不會進入 PDF／DOCX 計算書。

本機 RVR 信任清冊另可下載只含公開資料的 `RTB-...`／`RTR-...` 雙指紋備份。匯入後先驗證與預覽差異，明確核准時先建立復原前保護副本；有效清冊只允許事件鏈向前延伸，禁止用舊備份移除既有金鑰或逆轉撤銷。信任治理狀態維持在 HTML 工作區，不會混入正式計算書正文。

操作員帳號、角色、密碼驗證值、SQLite 輪替 claim、到期備份處置 claim 與 ROE 稽核鏈另有獨立的 `ROB-...`／`ROG-...` AES-256-GCM 加密備份；它與只含公開資料的 RTB 不可互相取代。匯出及復原都須由已登入管理員通過 CSRF，復原另須備份密碼、備份內啟用管理員帳密及完整置換確認。登入工作階段與登入失敗紀錄不會備份，復原後全部工作階段一律撤銷。既有有效資料庫只接受稽核鏈向前延伸；只有全新單一啟動管理員環境可作災難復原例外。下載時可明確選擇保存 1 至 365 天的受管制本機加密副本；HTML 清冊會逐檔驗證封包、檔名、時間、ROB 指紋與 SHA-256，並要求最新有效副本在 30 天內具同一備份的 `ROD-...` 隔離復原演練收據。演練會在暫存 SQLite 實際復原、登入備份管理員、驗證稽核鏈及正式快照前後一致，不保存帳號或任何密碼。保存期限不觸發自動刪除；到期副本須由具申請角色的帳號建立 72 小時 `RBR-...` 申請，再由不同 operator ID 的覆核帳號確認後，才從受管制目錄做一般檔案項目移除並留下 `RBD-...` 收據。該收據與 ROE 事件會隨治理 claim 追溯，但不代表 SSD、同步端、快照或其他備份已安全抹除，其他副本仍可能存在。備份含加鹽密碼驗證值，雖不含明文密碼仍屬高度敏感資料，必須與密碼分開受控保存；治理備份、清冊、演練、處置、差異與復原結果只留在 HTML 管理區，不進正式計算書或公開 Pages。

離線維運可用 `開挖擋土支撐\backup_receiver_trust_registry.ps1 -Mode Cycle` 建立備份並在隔離暫存清冊執行真實復原，成功後產生 `RDR-...` 收據；該流程會比對正式清冊前後 SHA-256，不會修改正式清冊或自動清除歷史備份。

`開挖擋土支撐\check_receiver_trust_backup_health.ps1` 可每日驗證最新備份、RDR 收據、兩者的可追溯關聯與每週排程結果，並把不含路徑、檔名、指紋或清冊內容的本機摘要寫入 ignored `output/audit/rvr-backup-health-status.json`。狀態或問題代碼改變時，另在受控備份資料夾追加具 RBH 串鏈驗證的轉換紀錄；相同結果不重複新增。`-ShowAlert` 只在首次異常、問題種類改變或恢復正常時通知，相同異常仍回傳失敗但不每日重複彈窗；歷程寫入故障不套用節流。儀表板同時以預設 36 小時新鮮度門檻檢查摘要，漏跑超時後改顯示 `health-check-stale`，不讓舊的健康結果持續維持綠燈。儀表板只讀 ignored `output/audit/rvr-backup-health-history.json` 的去識別歷程，公開站顯示「僅限本機」，不發布備份位置，也不把狀態視為 Google Drive 遠端同步證明。

<!-- P2_INCLUDE:docs/governance-current/README-catalog-01.md -->
<!-- P2_INCLUDE:docs/governance-current/README-catalog-02.md -->
<!-- P2_INCLUDE:docs/governance-current/README-audit.md -->
## 獨立工程基準

既有 golden case、JSON 重播與成品結果鏈用來證明程式在版本間維持一致，但不等同獨立工程驗證，也不等同案件獨立比較或工具級驗證域。`結構工具箱/tools/independent-engineering-benchmarks.catalog.json` 另行登錄可由封閉式力學關係推導的案例，`independent-engineering-benchmarks.js` 不讀取 golden case 預期答案，會以獨立推導值核對目前 production core；每一筆仍只涵蓋其明列案例與分支。

平面剛架升格後，40 / 40 個正式入口各有至少一項已登錄的獨立基準證據；其中清冊驅動的 local-quick 工具家族以重疊切面另列 6 / 6，不重複加總為正式工具數。這個計數不代表全部輸入域、控制分支、真實案件 G2／G3 或簽證資格。`/frame-analysis` 以懸臂端點力閉式解獨立核對位移、支承剪力與彎矩，production adapter 直接執行頁面求解器；`/cable-tension-frequency` 仍以理想張緊弦、多振型過原點擬合與非完美諧波案例獨立重算索力、殘差與目標區間。兩者的 oracle 都不讀取 golden expected。

Gusset V1 沿用 `/steel-formal` 既有正式入口，因此不增加 40 / 40 路由分母；`steel-formal` adapter 另以獨立公式重算 Gusset／平板支撐材的總斷面、Gusset `Ae = min(An, 0.85Ag)` 與平板支撐 `Ae = An`、單一縱向剪力面的 L 形區塊剪力、表 10.3-2 F10T 4.00／5.00 tf/cm² 螺栓剪力與孔壁承壓、由首末栓中心距展開的 Whitmore 有效寬度、銲材及兩側母材強度，並以壓力、正負偏心、Whitmore 長度不符、V1 長接合邊界與非平板支撐反例驗證失敗關閉。這些 oracle 不讀取 production 的 golden expected。

目前獨立工程基準涵蓋設備矩形四支點偏心反力、力矩平衡與最大反力局部壓力、地坪 Westergaard 內部／邊緣／角隅載重應力與相對勁度半徑、乾土 Rankine 主動土壓、矩形基礎外力底壓、矩形 RC 柱平衡附近 P–M 控制點、矩形 RC 梁正負撓曲／最小鋼筋／耐震 Ve 控制且 Vc 歸零剪力、RC 特殊結構牆 P–M／耐震剪力／特殊邊界構材／施工縫剪摩擦、RC 一般牆的承重／非承重／地下室／結構牆厚度、Wall Pier、完整 P–M、簡式失敗關閉、面內剪力、配筋與地下室側壓、RC 梁柱補強斷面的底貼 CFRP／U 型 CFRP／U 型鋼板、脫層、轉換斷面、剪力上限、圍束軸壓與 P–M、RC 獨立基腳撓曲／單向剪力／衝剪、RC 單樁軸向承載／群樁反力／樁帽強度、正式鋼梁 ASD 的 F2 非彈性側向扭轉挫屈／G2 剪力／服務性撓度、正式鋼柱 ASD 的弱軸挫屈與雙向壓彎互制、矩形鋼構連接板 LRFD／ASD 的總斷面降伏／有效淨斷面斷裂／區塊剪力及螺栓孔細部、鋼構正式主工具的連接板／螺栓拉力構件／單剪力板／Gusset 平板支撐拉力接頭／梁柱彎矩接頭／全斷面 CJP 耐震柱續接，以及各自對應的填角銲／全滲透開槽銲、正式風力的剛性三層矩形建物雙方向 MWFRS、實體標示物表 2.10 雙 Cf 路線／專案採用值／斜風向偏心、正式區域風壓 C&C 的 18 m 高度界線／部分封閉內壓高度／屋面角隅負壓提前收斂、正式女兒牆風壓的 MWFRS 式 2.3／圖 3.4／圖 3.5 三條路線、正式開放式屋頂風壓的單斜／雙斜屋頂、有／無阻擋、小／中／大有效面積、坡度直接取值／內插及 10° 高度切換、正式中空式／格子式風力的表 2.11 圓形低／高 D√q(z) 與平邊構材三條路線、低／中／高實體率帶、等效寬度及底部作用、正式格構式高塔風力的表 2.15 四段基本係數、圓形構材與斜風向修正、分段風力及底部作用、正式煙囪／水塔風力的表 2.12 代表斷面、h/D 邊界、圓形 D√q(z) 自動分流、形狀修正、頂部附加物與分段底部作用、圍牆／標示物風力的表 2.10 地面／高架雙路線、界限夾制、內插、專案 C_f 採用值、實體率修正與底部作用、獨立式招牌／燈桿風力的面板表 2.10、圓管表 2.14、角柱表 2.13 四個細長比區間、分段支柱力流及組合底部作用、正式地震力的八層 RC 構架等值靜力與樓層分配、附屬構造物地震力的計算值／上限／下限控制及一般／近斷層垂直力、雜項工作物的相似建築式(2-3)／非相似剛性式(5-1)／非相似柔性式(5-2)及垂直力、正式錨栓的 2×2 預埋 M20 第 17 章拉剪強度與互制，一向 RC 板內跨／端跨的板厚、正負彎矩、溫度筋、撓曲強度與單向剪力，以及覆工板面、大小梁、共構柱、握裹與樁基完整受力鏈逐項手算，連同石材固定背扣／插銷兩組完整受力鏈，以及包覆型 SRC 梁撓曲、寬厚比、鋼骨／RC 剪力分擔與剪力上限，以及包覆型 SRC 柱斷面幾何、寬厚比、剛度分配、鋼骨受壓與壓彎互制，加上 RC 深梁、基礎深梁二維與樁帽三維 STM 的限定拓樸代表案，以及柱保護層偏差強度評估四面筋位、應變相容與固定 Pu 根解的獨立推導，並以理想張緊弦獨立核對鋼索多振型頻率法索力，另以懸臂端點力閉式解核對平面剛架位移、支承剪力與彎矩，40 / 40 個正式入口皆有至少一筆已登錄基準證據，但只證明下列案例、公式與控制分支，不建立整支工具驗證域。連接板正式頁的獨立基準忠實限定在板件強度與螺栓孔距／邊距／孔型細部，不擴張宣稱已完成螺栓剪力或孔壁承壓強度；鋼構正式主工具基準除既有規則孔群、同心靜力與單一銲道型式外，另涵蓋已登錄單剪力板案例的限定偏心栓群、板／梁腹板承壓、區塊剪力、板彎曲及雙側縱向填角銲、平板支撐 Gusset 的單列栓／Whitmore／區塊剪力／銲道、梁柱彎矩接頭的單一選定構架面 Mpr／MprFar／Vp／六項強度／強柱弱梁，以及同材同斷面全斷面 CJP 柱續接的 Eamp／七項強度／細部閘門；不擴張宣稱未登錄偏心栓群、拉剪互制、prying action、混合銲道、AISC 358 預認證、正交構架面、完整接頭設計、PJP／螺栓式／箱型／組合構材／jumbo 柱續接、完工驗收或其他施工細節均已獨立驗證；RC 板基準限定於一向板，不把雙向簡化條帶法或無梁板衝剪擴張宣稱為已獨立驗證；RC 一般牆基準限定於已登錄的六組矩形牆與地下室側壓案例，不擴張宣稱開口、翼版或面外二階分析均已獨立驗證；RC 補強斷面基準限定於已登錄的五組矩形梁柱案例，不擴張宣稱錨固、接著面、延性或施工細節均已獨立驗證；煙囪／水塔基準限定於已登錄的六組代表路線，不擴張宣稱所有斷面與專案修正均已驗證；圍牆／標示物基準限定於已登錄的四組地面／高架邊界案例，不擴張宣稱所有幾何與專案修正均已驗證；獨立式招牌／燈桿基準限定於已登錄的六組面板與支柱組合案例，不擴張宣稱所有支柱型式、幾何或專案修正均已驗證。覆工板基準限定於已登錄的一般載重與長柱／未側撐重載兩案，不擴張宣稱吊車配置、地層、施工階段或全部 H 型鋼斷面均已獨立驗證。石材固定基準限定於已登錄的背扣與插銷兩案，涵蓋風震需求、固定點、錨栓、角鋼、板材局部、層間變位與熱伸縮，不擴張宣稱所有石材、固定件、錨栓產品或施工細節均已驗證。既定 P0／P1 基準路由已完成。`/seismic-dynamic` 的首頁身分為分析摘要而非正式附件入口，日後可補充驗證，但不計入 40 個正式入口覆蓋。基準狀態只留在盤點與首頁頁面診斷，不寫入計算書或正式附件。

RC 深梁、基礎二維與樁帽三維 STM 的整體獨立驗證仍為 24 / 24 案、564 項斷言：3 個代表性強度案已升為正式路由基準，其餘 supplemental candidate cases 21 / 21（`strength-pass` 12 / 12、`strength-reject` 9 / 9），candidate capabilities 維持 3 / 3。每個能力保留兩個代表性合格案、一個隔離拒絕案、一組「略低／等於／略高」三案臨界值，以及一組「負裕度在 EPS 內／剛超出 EPS」兩案：深梁鎖定 25° 壓桿角度、基礎二維鎖定 23.4.4 剪力容量、樁帽三維鎖定 X/Y 拉桿層容許錯位。整體 STM suite 明確區分 `strength-pass` 15 / 15 與 `strength-reject` 9 / 9；獨立 oracle 重算平衡、壓桿／拉桿、節點、多排鋼筋形心、剪力及帶號裕度，並以故意改值、錯誤放行與錯誤拒絕證明能阻擋同源漂移、false acceptance、false rejection 及 EPS 邊界漂移。`鋼筋混凝土/audit-tool.ps1` 另以 RC 本地巡檢第 6 個 gate 執行同一 catalog／oracle 的 RC 限定 runner，只載入 `rc-stm-strength.js`，並由 preflight 逐項核對 24 / 24、15 / 15、9 / 9、564 與兩類失敗關閉證據。正式路由升級不代表所有 STM 拓樸均已驗證。

SRC 梁以 catalog v2 正式基準登錄於 `/src-beam`，production 核心以應變相容與二分法求中性軸，獨立 oracle 則在張力筋降伏、壓力筋彈性的明確適用域內用二次方程封閉解重算，並以 4 組案例、41 項斷言核對撓曲、寬厚比、鋼骨／RC 剪力分擔、一般剪力、剪力摩擦與失敗控制。正式頁具案件 JSON、精簡計算書、核可與真實瀏覽器證據；release 當輪另驗證 PDF、來源 JSON、計算指紋與雜湊。

可單獨執行：

```powershell
node 結構工具箱/tools/independent-engineering-benchmarks.test.js
node 結構工具箱/tools/independent-engineering-benchmarks.js --write
```

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

Preflight 歷程會保留失敗、中斷或摘要缺漏的原始事實，並以 `abnormalCount`、`resolvedAbnormalCount` 與 `unresolvedAbnormalCount` 區分歷史異常和目前風險；未完成紀錄另保留 `resolvedIncompleteCount`／`unresolvedIncompleteCount` 子統計。只有具可辨識 commit、乾淨來源、強制平台巡檢及慢測的後續成功正式放行，才能把較早異常標為「已收斂」；原紀錄、失敗 key 與原因不刪除，儀表板也不再把已收斂紀錄誤列為目前待處理異常。

## 正式附件包進度觀測邊界

正式建立的階段事件只供旁路觀測。執行中若階段事件暫時無法寫入，觀測端可停留在最後一個已驗證階段，但不得改變檢查、組包、發布或事後驗證的核心結果，尤其不得把已原子發布成功的附件包誤報成建立失敗。組包單元測試以每一階段都拋錯的故障注入，證明觀測通道失效仍可取得真實成功結果與已發布附件包。

## 鋼索輸入敏感度比較

鋼索頻率法頁面另提供「單項 ±1% 索力敏感度」：由同版 core 分別重算有效長度、線質量及所有模態頻率同比例變動的六個情境。±1% 僅為示範擾動，並非量測誤差、專案容許差或統計信賴區間。由 [FHWA 理想弦公式](https://infotechnology.fhwa.dot.gov/vibration-testing/) 可推得固定振型下 `T ∝ mL²f₁²`；單項長度／頻率 −1% 與 +1% 分別造成索力 −1.99% 與 +2.01%，線質量則為 ±1%。情境不修改原輸入、採用索力、判定、JSON、計算指紋或正式計算書；無效輸入會清除舊情境。此為頁面比較功能，計算核心與既有 V0.1 案件格式維持相容，不宣稱處理振型誤認、個別頻率隨機誤差、垂度、彎曲勁度或端部柔度。

## 首頁正式放行日期來源

`HOME_TOOL_UPDATES` 只維護逐入口的工具內容日期；首頁不得再人工硬編碼「最近正式放行日」。只有 tracked `preflight-summary.json` 同時符合 passing、非 quick、強制平台巡檢、強制慢測、來源 commit 可辨識且乾淨時，瀏覽器才會把該快照的產出日期帶入工具卡提示；快照尚未載入時固定顯示「以上方交付前檢查狀態為準」。因此 release 狀態提交跨過台灣午夜時，不會再讓首頁日期落後或要求無意義的手動改日。

## 巡檢閱讀方式

- 若要直接看全平台巡檢狀態與各模組摘要預覽，優先開啟
  [結構工具箱/audit-dashboard.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/audit-dashboard.html:1)
- 若要重新產生最新狀態，再依序使用：
  [run-audit-all.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all.bat:1)
  或
  [run-audit-all-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/run-audit-all-loop.bat:1)

首頁可釘選最多 12 項工具並顯示最近使用 8 筆；資料只保存在此瀏覽器，搜尋時隱藏個人區塊，儲存不可用仍可正常操作。以 `node home-recents.browser.test.js` 驗證，私有收據保存於 ignored `output/playwright/home-recents/`。
## 2026-10-11：T36 第二批共用執行期確定性壓縮

六份可讀來源保持原始內容，僅統一 LF：`結構工具箱/core/ui/src/report-docx.source.js`、`結構工具箱/core/ui/src/tool-workflow.source.js`、`結構工具箱/tools/src/tool-workflow-adapters.source.js`、`結構工具箱/tools/src/project-storage.source.js`、`鋼筋混凝土/shared/src/project-storage.source.js`、`結構工具箱/core/loads/src/loadcombo.source.js`。沿用 `結構工具箱/tools/build-minified-runtimes.js` 與 ignored Terser 5.44.0 產生原公開路徑，首行標記來源，不使用 unsafe 或 property mangling。來源精確列入 Pages PRIVATE_FILES，來源與生成檔固定 LF；生成一致性、逐檔體積上限（本批實測加 10%、向上取整）與對應首頁來源依賴由 `tool-page-a11y-build.contract.test.js` 檢查，原三檔上限保持。

鏡像 manifest 的四筆來源均不含本批六檔。`結構工具箱/tools/project-storage.test.js` 保留全部字面斷言並改讀可讀來源；`結構工具箱/tools/local-quick-tools.contract.test.js` 的 LoadCombo VM 改讀來源，公開輸出仍由既有 LoadCombo 行為／家族測試執行。`report-docx-integration.contract.test.js` 同時載入公開與來源版本，保留各自可攜 HTML factory／Word 邊界全部斷言；其餘 HTML script VM 與 require 讀取者執行公開輸出之行為，不依賴函式排版。首頁依賴依實際 script 消費頁補齊公開檔及來源檔；不更改工具清冊欄位或公開路徑。

DOCX integration 的舊 popup 替身未提供現行 Blob／URL API，使用未壓縮來源也會失敗；本包僅補齊替身並檢查 MIME／Blob 導覽，不更動任何 report.js 或 report-utils.js。首次失敗與原替身重現紀錄保留，所有原 Word／可攜 HTML 斷言均保留。

首頁可讀來源在 `結構工具箱/assets/home/src/home.source.js`；`node 結構工具箱/tools/sync-home-update-dates.js` 同步日期並自動重建公開 home.js，附 `--check` 時同時核對日期與確定性產出。


第三批十二份執行期沿用 `build-minified-runtimes.js`（`--check` 防止漂移）；可讀來源、公開產出及追溯跳過清單列於 TOOL_BOUNDARIES／STAGING_GROUPS，原始碼契約讀來源，行為契約仍測公開產出，石材鏡像只經同步器產生。

T41：PowerShell 文字讀寫採明確 UTF-8，由 `node powershell-encoding.contract.test.js` 掃描；家族驗證使用 Windows PowerShell 5.1，既有 preflight UTF-16 暫存腳本依格式邊界保留並於契約列明理由。

T42 鋼構主頁 app／calculator 的私有可讀來源位於 `鋼構工具/src/`，公開路徑由既有確定性建置產生；追溯目錄同時保留公開 evidence 與來源對照。

2026-10-15 載入預算契約補強：首頁 tools href 清冊與固定 53 路由 baseline、更新日期清冊交叉核對，並確認每個首頁路由均有 routeFileMap 對應；保留額外 /rc 別名，量測順序依固定 baseline。baseline 不變。純 Node 契約涵蓋未核准新增或替換、52／54 路由、缺映射／日期、量測缺漏／重複／順序、來源與 HEAD 漂移。瀏覽器量測另以最終 HEAD 收據核對，本包不含正式放行。


<!-- P2-REGISTRATION-START -->
治理正文分冊由 `結構工具箱/tools/governance-documents.js` 回填，契約：`結構工具箱/tools/governance-documents.contract.test.js`。分冊按各 include marker 所在位置回填。
<!-- P2-REGISTRATION-END -->

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
