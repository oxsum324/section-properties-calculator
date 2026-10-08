# 結構工具平台 V1.6

現況鑑定現場紀錄 V0.7.0：入口 `/condition-survey`，新增梁 U 型裂縫條數（不列總長）、磁磚受損塊數快填、房間及照片整理、單張照片機位、主照片選擇與附件同步編號。照片附件可下載含影像 HTML、列印 PDF 及編號對照；原始媒體和全部紀錄另以版本 3 備份保存。保留平面圖庫、簡圖選取刪除、縮放擴展、照片圈註及離線拍照。操作與限制見 [field-survey/README.md](field-survey/README.md)。電腦可用 `啟動現況鑑定紀錄.bat`。

這個資料夾目前已整理成一套分層式結構工具平台，並正式進入 `V1.6`。工具箱首頁已升級為弘一設計系統新版 `結構工具箱/index.html`（深藍 hero、構件子分頁與治理卡，依 `home.js` 單一資料源驅動）；原公文版主選單保留為 `結構工具箱/index-classic.html` 可隨時回退，本機伺服器 clean route 為 `/toolbox-home`。2026-10-03 首頁改為精簡卡片（定位一段＋標籤，「輸出／閱讀狀態」收在「詳情」或「展開卡片詳情」），平台狀態與開發路線移至工具清單下方收合區，手機版分類橫向捲動、篩選 chips、搜尋列置頂；RC 梁／柱／牆／剪力牆改由共用計算操作列鏡射摘要，並在輸入分頁計算後切到綜合結果；鋼梁／鋼柱正式頁新增本機輸入草稿自動保存，啟用 TXT 的計算書預覽另可下載 Word 文書版（10/04 起為真正 `.docx`，非正式附件）。2026-10-08 第四階段：鋼構主頁 MathJax、石材頁 PDF.js 與 DOCX 執行期改為首次使用才載入（鋼構主頁初始 JS 2.64 MB → 0.55 MB、石材頁 1.82 MB → 0.66 MB）；石材本機服務探測改為服務辨識＋埠覆寫；拉力草圖與土壓示意圖版面修正；40 個正式工具頁加入共用無障礙腳本 `tool-page-a11y.js`（axe serious／critical 0）；首頁工具卡加入搜尋別名。平台目前區分：
第五階段開發門檻使用根目錄 `run-phase-gates.ps1`，直接從 V3 派工第 0 節解析 26 條命令；每個 package 完成並提交後執行，摘要保存在忽略版控的 `output/phase-gates/<時間戳>/summary.json`，不代表正式預檢或發布。
T19 工具頁無障礙檢查使用 `test-tool-page-a11y.ps1`，40 頁各以桌機／手機掃描；axe 任一違規、主地標或 H1 數量不是 1 都會失敗，詳細節點與截取結果寫入 ignored `output/playwright/tool-page-a11y/`。

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
- 開挖擋土支撐正式計算書結果鏈：schema v11 保存不含快取計算結果的 ProjectState，回讀後以目前 Python 後端核心重新計算，逐項核對支撐、橫擋、斜撐、大角撐與柱構件共 47 筆檢核、618 項結果欄位，再以重算結果及同一計算指紋產生明確核可的正式附件 PDF 與 DOCX。兩種格式都記錄文件狀態、產出工具、版本、輸出／核可時間及計算指紋；空白工程名稱或設計者不構成 NG。核可 PDF 的日常組包另要求逐頁像素、OCR 與文字層對齊證據，並提供只含兩者的原子 ZIP 搬運套件；證據只進內部追溯區，ZIP 不是正式附件包，缺漏或竄改不得自動放行。Producer 私密保存 ProjectState、結果及兩份成品 SHA-256；release aggregate 核對 `1/1` 並形成私人集合 SHA-256。Pages 僅顯示「開挖結果鏈 `1/1`」，不公開 ProjectState、輸入／結果資料、計算指紋或成品雜湊。
- 局部快算計算書結果鏈：schema v12 先建立基礎局部檢核、設備局部荷重與擋土土壓三頁的來源 JSON 重播；Schema v28 再把地坪 Westergaard 納入第四頁，Schema v29 再納入柱保護層偏差強度評估第五頁；Schema v30 再納入鋼索索力頻率法快算第六頁。六頁都須先匯出實際來源 JSON，刻意改動欄位後回讀並重算，再逐值核對全部輸入與全部結果；最後由同一重播狀態產生 PDF，核對計算指紋與成品 SHA-256。Producer 私密保存來源 JSON、輸入／結果雜湊、逐值斷言、計算指紋與 PDF 雜湊；release aggregate 依 inventory 推導並核對 `6/6`，形成私人集合 SHA-256。舊正式證據的 Schema v27 `3/3`、Schema v28 `4/4` 與 Schema v29 `5/5` 只供已發布快照過渡讀取，不得滿足 Schema v30 新證據。Pages 僅顯示「局部快算結果鏈 `6/6`」，不公開來源 JSON、輸入／結果資料、計算指紋或成品雜湊。
- 工具成熟度矩陣產生器：
  [結構工具箱/tools/tool-maturity-matrix.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/tool-maturity-matrix.js:1)
  - 合併正式工具與局部快算 manifest，輸出 `reportTextSmoke` / `報告可讀文字抽檢`、`documentState` / `計算書文件狀態`、golden case、JSON round-trip、reference traceability 等治理覆蓋率，讓首頁與巡檢儀表板能看見報告可讀性及內部審閱／正式附件核可邊界證據，但不把頁面閱讀狀態明細寫入計算書或列印 PDF。
  - 最近一次正式放行另把八類 RC 的 HTML 附件清冊固定為梁 4、柱 6、板 5、牆 4、剪力牆 2、基礎 6、單樁 3、補強 2，共 32 份；逐檔核對正式狀態、計算指紋、位元組數與 SHA-256。巡檢儀表板顯示各類預期／實際／已驗證數、集合 hash 與匿名附件 hash；若數量、驗證或 hash 異常，須紅標到實際異常的 RC 類別，桌面與手機版皆受瀏覽器回歸保護。真實檔名只留在私人放行證據，不寫入計算書、列印、PDF 或公開狀態。
  - 每份 RC 正式附件在渲染完成時即把 bytes 與 SHA-256 寫入當輪 audit／summary；release gate 必須重新讀取實體 HTML 與原始渲染紀錄比對。`html-attachment-integrity` 負向契約固定證明附件遭刪除、截短或等長改寫時皆會阻擋，不得把異動後重新計算的雜湊冒充原始產出證據。
  - release 即使失敗，也會在本機保留 `output/preflight/attachment-integrity-latest.json`，以匿名附件序號列出八類 RC 的預期、實際、已驗證、hash 與異常代碼。本機巡檢儀表板只有在該診斷與最新失敗 release 的 runId 相符時才顯示，並把代碼翻成「檔案缺失」「SHA-256 不符」「位元組數不符」「清冊多出附件」「缺少原始完整性紀錄」等可直接處置的原因及建議處置；此狀態另提供「複製失敗項目處置清單」，只整理工具名稱、匿名附件序號、原因與安全處置，不含檔名、路徑、hash 或 bytes，並以固定八類 RC 白名單提供「開啟來源工具」捷徑。清單與捷徑都不進列印、計算書、PDF 或公開成功狀態。hash／bytes 不符時不得改寫清冊冒充原始證據；清冊多出附件時也不得手動刪項湊數，兩者都必須由原始計算重新輸出。同時註明公開狀態仍保留哪一次成功 release；此 git ignored 診斷不得發布至 Pages。本機另從最近 20 筆正式 release 讀取各輪附件診斷，將具當輪失敗證據的異常配對到其後第一筆整體通過且附件 32 / 32 / 32、問題 0 項的正式放行，形成最多五筆「附件異常關閉紀錄」；沒有當輪診斷的舊失敗不推測、不補造。這項歷程只顯示 release 編號、時間、匿名問題數、受影響工具與成功計數，不含檔名、路徑或 hash，且只供本機畫面使用，不進列印、計算書、PDF 或公開 Pages。
- GitHub Pages deploy / live smoke：
  [結構工具箱/tools/pages-live-smoke.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/pages-live-smoke.js:1)
  [結構工具箱/tools/pages-live-browser-smoke.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/pages-live-browser-smoke.js:1)
  [結構工具箱/tools/run-pages-browser-smoke.sh](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/run-pages-browser-smoke.sh:1)
  [.github/pages-smoke/normalize-playwright-result.js](/C:/Users/USER/Desktop/AI/小工具製作/.github/pages-smoke/normalize-playwright-result.js:1)
  [結構工具箱/tools/build-pages-artifact.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/build-pages-artifact.js:1)
  [結構工具箱/tools/build-pages-clean-routes.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/build-pages-clean-routes.js:1)
  [結構工具箱/tools/build-pages-deployment-manifest.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/build-pages-deployment-manifest.js:1)
  [結構工具箱/tools/verify-pages-release-lineage.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/verify-pages-release-lineage.js:1)
  [push-pages-release.ps1](/C:/Users/USER/Desktop/AI/小工具製作/push-pages-release.ps1:1)
  - 正式 live HTTP smoke 採兩層且有限的暫態容錯：每個公開請求最多等待 15 秒；遇到逾時、HTTP 5xx 或明列網路暫態錯誤時，先以 1 秒間隔最多嘗試 4 次，只有單一請求仍未恢復時，才在 5 秒後完整重跑全部清冊一次。404、內容、大小、SHA-256、provenance 或私有邊界錯誤都不重試。staged gate 與本機 artifact 預演未設定 request retry，但共用 30 秒單一請求逾時，避免任何 gate 無限懸掛。安全推送等待器另會先等 Actions run 進入 `completed`，才讀取 `--log-failed` 判斷唯一允許復原的 deploy-pages queued timeout，避免 run 尚在收尾時以 GitHub CLI 競態掩蓋原始失敗工作。
  - 正式 live browser smoke 若 Playwright CLI 回傳成功但未帶 routes / checks / issues，會在 5 秒後完整重跑一次；第二次仍無可驗證結果即失敗關閉。此有界重試只處理 runner／CLI 空回應，不會把頁面斷言、內容、來源或隱私邊界錯誤改判為成功。
  - 由 `.github/workflows/pages-deploy.yml` 在 `master` push 後以 GitHub Actions 發布 Pages artifact；staging 完成後，`build-pages-clean-routes.js` 依 `vercel.json` 為 GitHub Pages 產生不覆寫既有頁面的靜態短網址轉向頁，使首頁公開的 `/rc-column`、`/steel-beam-formal` 等 clean route 在 Pages 專案子路徑下也能使用，並保留 query 與 hash。workflow 會先拒絕有 tracked 或 untracked 變更的 checkout，再於 staged root 產生公開 `pages-deployment.json`；v2 manifest 以固定 ordinal 排序列出每個非隱藏發布檔案的相對路徑、位元組數與 SHA-256，並由封閉逐檔清冊重算 `sha256-tree-v1`、fileCount、totalBytes，同時綁定 master commit、Actions runId、attempt 與 `sourceDirty: false`，builder source與 manifest 本身不進 digest。上線前與上線後 HTTP smoke 都必須把 manifest 的 commit/runId 對齊當次 workflow、拒絕 dirty provenance，並以最多 8 個並行請求逐檔下載整個公開 artifact，核對 HTTP 200、大小及 SHA-256；摘要正確但任一實際檔案缺漏、陳舊或遭替換仍會阻擋，避免舊站、舊 artifact、未提交內容或錯誤部署被正常頁面 200 掩蓋。workflow 先以短暫 HTTP server 直接服務 staged `_site`，在 archive / upload / deploy 前完成由 `home.js` 與 `vercel.json` 動態推導的全部首頁 route、公開狀態與私有邊界，並以 Playwright 對每條 route 執行桌機與手機真實瀏覽；任一錯誤都會阻擋壞版上線。build 與 live-smoke job 以 `.github/pages-smoke/package-lock.json` 固定 `@playwright/cli`、其 Playwright runtime、Terser 與遞迴依賴的版本、tarball 及 integrity；兩階段都先執行 `npm ci --ignore-scripts`，每次從零重建 `node_modules` 並驗證安裝版本，不再以 `npx --yes` 執行時解析套件。兩個 job 都以精確的 `actions/cache@v5` key 快取 `~/.npm` 內容位址資料庫，不快取 `node_modules`；另以同樣無模糊 restore key 的 cache 共用 `~/.cache/ms-playwright`，兩種 key 都綁定 runner OS、CPU 架構與整份 lockfile digest，瀏覽器 key另綁定 Chromium 家族。首次 miss 由 build 下載並保存後，live-smoke 可恢復同一份內容；兩階段即使 cache hit 仍執行 lockfile 安裝及 `install-browser chromium`，不以快取取代完整性準備或存在性補檢。build 與 live-smoke 會先把來源身分、cache、安裝與兩段 smoke 組成封閉 v1 JSON，以不同名稱保存為 14 天 Actions artifact，再於最後一個 `if: always()` step 寫入 GitHub Actions job summary；因此 summary 的 job 結果也涵蓋證據上傳。摘要固定揭露 lockfile digest、精確 cache hit、各階段耗時／重試／檢查數與效能警示。`.github/pages-smoke/performance-budget.json` 以同一 commit 三輪暖快取實測為基準，runtime 安裝 8 秒、HTTP 90 秒、browser 180 秒只產生 `::warning` 與摘要警示，不阻擋發布；格式錯誤、證據不完整或上傳失敗仍照常阻擋。獨立 `performance-trend` job 只接受同一 run 的 build／live 成對封閉收據、兩種 exact cache hit、成功完整 smoke 及相同 lock digest；再聚合相同 lock digest 最近最多 20 輪，逐輪保存六個耗時觀測值並以 nearest-rank 重算 P50／P95。歷史成功 run 若只留下單邊收據會明確排除；workflow 重跑留下同名 artifact 時，依 `created_at` 與 artifact ID 選取最新 build／live 收據，再由趨勢產生器驗證配對內容，不把重複附件誤判為效能失敗。少於 3 輪明確標為 `collecting`，達 3 輪才為 `ready`；lockfile 改變自動開始新序列，不混合不可比較樣本。趨勢 JSON 與摘要保存 14 天，當輪缺件、選入的收據格式錯誤、統計不可重算或上傳失敗會阻擋 workflow，但效能超標仍只屬警示。基準、單輪收據、趨勢與摘要都屬私有 CI 治理，不進 Pages artifact、計算書或正式附件。deploy job 沿用 `deploy-pages@v5` 官方 600,000 ms（10 分鐘）硬上限，逾時仍會取消並判定失敗；deploy 成功後再對正式網址重跑相同 HTTP 與 browser smoke，形成上線前阻擋與上線後確認。共用 runner 以 1280 × 800 與 390 × 844 實際瀏覽全部 route，攔截 console / page / request / HTTP 錯誤、整頁橫向溢位，並專項驗證 RC 單樁寬表、風壓參考圖及石材 A4 局部捲動；CLI 必須依 JSON `isError` 判定，不得只採用程序碼。staged gate 與本機 artifact 預演維持一次失敗立即阻擋；只有正式 live 的 HTTP smoke 與 browser smoke 遇到 HTTP 5xx 或明列的暫態網路錯誤時，才會各自在 5 秒後完整重跑最多一次。HTTP smoke 對逐檔清冊、公開頁、資產、舊輸出及私有邊界的任何 5xx 都先視為暫態失敗，不得把 503 誤當成「私有檔案未公開」的成功證據；404、大小／雜湊不符、JS / pageerror、overflow、內容或 provenance 驗證失敗，以及第二次持續失敗仍直接阻擋。`--check-private-boundary` 會確認 Markdown、`CONTEXT.md`、`docs/adr/`、PowerShell / batch、測試檔、合約檔、route builder、deployment manifest builder、browser smoke source / runner、私有 smoke package／lockfile／效能基準／摘要／趨勢產生器、`dev_tools/`、Python / TypeScript source、backend、package manifest 與本機註冊檔未被發布。部署前也可先跑 [run-pages-artifact-smoke.ps1](/C:/Users/USER/Desktop/AI/小工具製作/run-pages-artifact-smoke.ps1:1)，它會先以同一 lockfile 重建本機 smoke runtime，再在 temp 目錄產生同樣含 clean route 與 provenance manifest 的 Pages artifact，依序呼叫共享 HTTP 與瀏覽器 smoke；若工作樹尚有修改，本機 manifest 會如實記錄 `sourceDirty: true`，不冒充正式 clean deployment。
  - 鋼構 `core/formal-core-manifest.json` 是本機 vendored core 同步證據，保存工作站絕對路徑、來源雜湊與同步時間；它不屬於鋼構頁面執行資產。Pages builder 必須精確排除，HTTP private-boundary smoke 也必須對該路徑做非 200 負向探針，避免帳號、工作區路徑與私人同步資訊外洩。除此之外，builder 會逐檔掃描 staged artifact，拒絕 Windows 使用者目錄以及目前建置機 repo／家目錄的原始、斜線與 JSON 跳脫變體；不是只靠已知私有檔名清單。
  - 上述「只接受 exact cache hit」是趨勢統計的納入條件，不是 workflow 成功條件；當輪冷快取若收據完整且 smoke 成功，會以明確排除原因維持正常部署，待累積可比較的暖快取樣本後再進入 P50／P95。
  - 目前 deployment manifest 已由上述 v2 清冊升級為 v3 manifest：除保留完整逐檔清冊外，另從實際發布的 tracked 快照封閉帶入正式 release runId、產生時間與受測來源 SHA。若 preflight 不是 `quick=false`、兩個 force flag 皆為 true、乾淨來源且 checks / post-checks 全通過，或 report-readiness runId 不一致，artifact 建置直接停止。巡檢儀表板另把一般巡檢新鮮度與正式放行證據拆開；7 日／30 日只作重驗提醒，公開部署 carrier、Actions run、release run 或 tested source 身分不一致則明示「未對齊」，不得由較新的單項巡檢掩蓋。
  - 巡檢儀表板以有效 schema v3 `pages-deployment.json` 自動進入公開摘要模式；資料範圍與部署信任分開判定，帶有合法布林 `sourceDirty` 的 staging manifest 仍屬公開 artifact，dirty 狀態則由部署信任卡揭露。公開頁只請求 deployment manifest 與三份 tracked status，不再探測 `output/`、私人 log、診斷 hash、RVR 或 GSM 本機監測。三份快照都明列 `publicEvidenceSchemaVersion: 3`，並由 [public-evidence-schema.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/assets/status/public-evidence-schema.js:1) 在快照產出、Pages manifest 建置、live smoke 與 dashboard 共用同一套欄位型別、release 身分、四面向完成規則及最多 8 次的正式 release 公開摘要鏈。歷程 schema v2 逐次保存受測 commit、正式／後置門檻、四面向、十組完成數，以及 12 個 required counter 的基準／維持／提升／縮減／混合分類；不保存案件、輸入、逐檔清冊、來源路徑或私密雜湊。任何縮減預設阻擋 release；只有一次性 `.github/public-release-reduction-authorization.json` 精確對應上一個 runId、全部縮減欄位與前後數值，並提供可公開理由時才可通過。授權未使用、沿用到下一輪、含私密路徑或額外欄位同樣阻擋；設定檔不發布，公開歷程只保留理由。產生器只從 Git 中可重驗的成套舊快照回填，重複 carrier 去重，不完整舊資料不推測。[public-evidence-schema.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/public-evidence-schema.test.js:1) 與 [public-release-change-governance.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/public-release-change-governance.test.js:1) 分別是版本化證據與門檻退化 preflight gate，固定證明未知版本、字串完成數、跨 release 混用、偽造變化、歷史缺漏／倒序／未對齊、未授權縮減、過期／未使用授權、未宣告私密欄位及絕對私密路徑會失敗關閉。四張卡片不重複同一全平台結論，而分別呈現「正式 release 總覽」、「鋼構正式附件證據」、「RC 正式附件證據」與「風震與跨家族交付證據」；其下另以最新優先表格顯示公開歷程、變化分類，縮減時並顯示簡短理由。完成數直接取自型別正確的 tracked preflight / report-readiness 欄位，任何必要欄位缺漏、型別錯誤或完成數未滿都顯示公開證據不足，不以私人資料或文案推定通過。公開閱讀流程會移除沒有公開資料的成熟度、RVR／GSM、preflight 細項與私人巡檢歷程區塊，只保留 release、附件完整性與去識別證據摘要；相關 `output/` 連結隱藏。本機 localhost 若需完整診斷，可用 `?audit_scope=local` 明確啟用；非 localhost 不接受此覆寫。共用 Pages browser smoke 會在 staged artifact 與正式網址以桌機、手機驗證公開 dashboard，並在正式網域故意附加該 query，證明仍為公開模式且零 private-output 請求。
  - 發布前可執行 `node 結構工具箱/tools/public-release-change-assistant.js --json` 唯讀比較目前正式輸出與公開基準；維持或提升時不產生核准。確有縮減且已完成工程判斷時，才使用 `--write-authorization --reason-code scope-change --reason "可公開且不含案件或路徑的理由"` 寫入精確一次性核准。該核准不得手動提前清除；成功發布並由 tracked 公開歷程證明完全相同的縮減後，執行 `--reset-authorization` 才會安全重設為 inactive。候選檔、核准檔與相關測試都是私人治理，不進 Pages 或計算書。
  - 真正的 release 模式會在三份公開快照及 post-check 全部完成後，自動以 [public-release-decision-receipt.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/public-release-decision-receipt.js:1) 將封閉式私人決策收據寫入 `output/preflight/history/<runId>/`。收據保存正式／後置門檻、變化分類、核准是否實際使用、受測 commit 與三組證據雜湊，並以 `PRD-` 內容指紋鏈回上一份收據；同 run 重跑只能接受完全相同內容，舊收據竄改、倒序或前一輪核准尚未重設都會阻擋。Git-tracked `.github/public-release-decision-anchor.json` 只保存鏈尖 ID／雜湊，不含案件或決策內容，讓整個 ignored 私人鏈遭刪除時仍能失敗關閉。若 release 曾使用縮減核准，`--reset-authorization` 會另增不可混用的 `PRA-` 重設收據；收據失敗時 active 核准會自動復原。可用 `node 結構工具箱/tools/public-release-decision-receipt.js --check-history --json` 唯讀驗證。整條決策鏈與錨點只屬工作站私人治理，不發布、不進 dashboard、計算書或正式附件，亦不等同個人數位簽章。
  - `build-pages-artifact.js` 是 Actions 與本機預演共用的唯一發布清冊：由 Git tracked 檔案加上未 ignored 的工作中新增檔建立 artifact，集中排除文件、測試、治理腳本與 backend / source tree，並透過獨立暫存 index 套用 Git clean filter，使 Windows 與 Linux 對相同內容產生相同檔案數、bytes 與 tree digest；不再各自維護 `robocopy` / `rsync` 排除規則。複製後還必須逐檔通過本機路徑內容掃描，掃描筆數須等於發布檔數且 findings 為 0，否則 staging 直接失敗。
  - 正式推送建議執行 `push-pages-release.bat`；批次入口會優先使用 PowerShell 7 (`pwsh -NoProfile`)，未安裝時才回退 Windows PowerShell 5.1。也可直接執行 `pwsh -NoProfile -File .\push-pages-release.ps1`。PowerShell 腳本以檔名尋找受治理的工具腳本，不在來源內硬編碼中文路徑，因此 5.1 後備入口也不受 UTF-8 無 BOM 解碼影響。入口會先拒絕 dirty、錯誤分支與遠端分歧，並以 `verify-pages-release-lineage.js` 確認 HEAD 的直接父提交就是公開快照所列的 `sourceCommitSha`，且兩者差異恰為三個狀態 JSON 與一個不公開的決策鏈尖錨點；任何未經該輪 release 測試的 HTML、JS 或計算核心夾帶變更都在 push 前阻擋。Actions build 會以 `fetch-depth: 2` 重做相同檢查，只使用非 force push；推送後等待同一 SHA 的 push workflow，逾時且沒有既有 run 才使用既有 `workflow_dispatch` 後備入口。完成判定要求 build、deploy、live-smoke、performance-trend 四個 job 全部成功，核對公開 `pages-deployment.json` 的 commit、runId 與 `sourceDirty=false`，並由執行安全推送的工作站再獨立呼叫 `pages-live-smoke.js`，直接從正式網址逐檔重驗 v2 清冊、全部公開檔案、由公開清冊動態推導的全部路由、狀態資料與私有邊界；工作站預設最多嘗試 3 次、間隔 10 秒，且只有受治理 smoke 明確認定的 5xx 或網路暫態錯誤才重跑，內容、雜湊、來源或隱私邊界錯誤仍立即失敗。只有這項工作站事後複驗也成功，結果才輸出 `publicArtifactVerified=true`、重試政策及已驗證的 schemaVersion、fileCount、totalBytes 與 digest。這項共同完成條件同樣套用一般推送、已存在的同 SHA 部署與 `-VerifyOnly`。若 GitHub Actions 頂層 run 狀態延遲但四個必要 job 已成功，結果會標示 `aggregateStatusStale=true`；若個別 job 聚合狀態延遲，則只有在 run 已 completed/success 且該 job 每一個 step 都 completed/success 時，才標示 `aggregateJobStatusStale=true` 並接受相同證據。只有 deploy 失敗紀錄同時明列 `deployment_queued`／`deployment_in_progress`、`Timeout reached, aborting!` 與取消動作，且同一 SHA 的 Pages API 在 180 秒內轉為 `succeed` 時，入口才會對同一 run 執行 `gh run rerun --failed`，等待 deploy、live-smoke 與 performance-trend 補成全綠並回傳 `deploymentRecoveryUsed=true`；其餘 job／step、後端未完成或工作站逐檔複驗在有上限的暫態重試後仍失敗時都直接停止，也不得以新 dispatch 掩蓋。`-VerifyOnly` 可唯讀複驗現有 HEAD；只有搭配 `-VerifyOnly -AllowDirtyVerification` 時才可在 dirty 工作樹讀取既有部署，該選項永遠不能授權 push 或 dispatch。
  - 工作站 HTTP smoke 成功後另輸出機器可讀的 `pagesHttpSmokeAttemptCount`；安全發布入口只接受唯一、正整數且不超過設定上限的值，並在結果揭露 `publicArtifactVerificationAttemptCount` 與 `publicArtifactVerificationRetried`。缺少、重複或超界的嘗試次數證據一律阻擋完成。
- Pull request validation：
  [.github/workflows/pr-validation.yml](/C:/Users/USER/Desktop/AI/小工具製作/.github/workflows/pr-validation.yml:1)
  - 每次送往 `master` 的 PR 會在 `windows-latest` 執行 `run-preflight-tools-ci.bat` 的 clean-checkout gate，以唯讀權限、無 secrets、限時 30 分鐘的方式建立狀態檢查；無論成功或失敗都保留 7 天的 preflight summary / history artifact。CI 模式只執行不依賴 ignored audit 狀態、未鎖定的本機 node_modules、未列明的 Python 套件或本機工具檔的可重現契約；workflow 會先安裝固定版本的 `pydantic`、`openpyxl`（供 `construction-stage-load-handoff` 回放開挖後端），並以 lockfile `npm ci` 安裝 `開挖擋土支撐/frontend` 與 `螺栓檢討/bolt-review-tool` 的 TypeScript 相依，且將 preflight 的 `TEMP` / `TMP` 指向 `runner.temp`，避免 runner 預設 8.3 短路徑被「不得透過連結重新導向」防護誤判；完整 46 項 quick 與正式 release preflight 仍須在交付工作站執行，CI 綠燈不得取代正式放行證據。`pr-validation.contract.test.js` 會鎖住觸發條件、權限、runtime 版本、wrapper、clean-checkout 邊界與證據路徑。
- 局部快算工具 manifest：
  [結構工具箱/tools/local-quick-tools.manifest.json](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.manifest.json:1)
  - `地坪承載檢核（Westergaard）` 納入相對勁度半徑、內部／自由邊緣／角隅載重應力、多輪或機具腳位同點疊加、容許彎拉應力比對、6 組 golden cases、JSON 回讀及兩段式計算書；疲勞、接縫傳力與沉陷明列為頁面外責任。
  - `柱保護層偏差強度評估` 只比較矩形、繫筋、非預力 RC 短柱在共同比較 Pu 下四個獨立 Mu 幅值的單軸 P-M 斷面強度；四面輸入必須是混凝土面至縱向主筋中心，或明確由箍筋外緣淨保護層加上箍筋直徑與主筋半徑換算。量測基準、斷面、材料或需求依據不足即失敗關閉；capacity OK 不等於保護層厚度合規，雙軸、二階、剪扭、握裹、耐久、防火與施工容許差另案判定。
  - 基礎局部檢核、設備局部荷重、擋土土壓、地坪 Westergaard、柱保護層偏差強度評估與鋼索索力頻率法快算的簡易結果／詳算式計算書共用 `core/ui/report.js` 文件核可模型：預設內部審閱、明確核可後成為正式附件，工程檢核不符或人工複核狀態仍如實列入計算內容。六頁另可由同一份畫面計算書下載 UTF-8 BOM 的 TXT 文字備查，包含來源文件狀態、工具版本、輸出時間、計算指紋與文字內容 SHA-256，固定明列不具正式附件資格；圖形、版面、核可控制與可執行完整性驗證仍以核可 HTML 或列印／存成 PDF 為準。頁面的產報前診斷明細仍不進計算書與 TXT；瀏覽器直接列印操作頁仍只顯示封鎖通知。
- 局部快算 manifest runner：
  [結構工具箱/tools/local-quick-tools.run.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/local-quick-tools.run.js:1)
- 載重組合完整向量 regression：
  [結構工具箱/tools/loadcombo-v2.test.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/loadcombo-v2.test.js:1)
  - 多內力載重組合保留同一個實際組合列的來源完整有號 tuple；不得分別取各分量最大絕對值後拼成不存在的設計內力。舊案鋼梁／鋼柱仍依需求分量列出篩選候選；沒有逐工況容量 evaluator 時不得把需求向量冒充容量互制。RC 梁會逐列計算正／負彎矩容量利用率，並依該列 Pu 重算 φVn、耐震 Vc 歸零與剪力利用率；設計模式另跨主筋號數、排數、箍筋號數、肢數與間距搜尋容量式候選，同時篩選正負彎矩、剪力、最小配筋、裂縫／排間／排內間距與可配置性。候選排序只留在工作頁，一鍵套用後切至正式檢核；Tu 達門檻時因尚未建立 φTn／V-T 互制容量而失敗關閉並要求另案詳算，不以需求向量假冒扭力容量。RC 柱會逐列以該列 Pu 重新計算 δns／δs、放大後 Mx／My 及雙軸 P-M 容量面利用率。一般 RC 牆依均布縱筋、輸入保護層與可選的兩端附加集中縱筋建立含軸壓、軸拉的應變相容 P-M 設計封包，逐列計算 `|Mu|/φMn @ Pu` 與 `|Vu|/φVn`；正式計算書輸出實際配筋斷面、P-M 設計互制圖與需求點。設計模式另以相同 evaluator 搜尋均布縱筋、端部附加筋、水平筋與層數，同時篩選 P-M、剪力、最小配筋、筋距及牆厚可配置性；候選排序與套用操作只留在工作頁，套用後切回正式檢核。特殊結構牆另納入單段剪力上限，真正超出 P-M 軸力封包時才失敗關閉。直接輸入 Mu 可留空並由 `Pu·e` 推導；`e ≤ h/6` 簡式只留在 HTML 對照，不作正式結論。剪力牆則沿用正式工況 evaluator，逐列重算 `|Mu|/φMn @ Pu`、21.2.4.1 剪力 φ 與 `Ve/φVn`。遇到軸力越界、二階不穩定或容量無法建立時都會失敗關閉並列為控制候選。使用者選取候選後，系統套用的仍是該列全部有號內力；寫入時再依構件欄位語意映射，來源 tuple 的符號與組合係數完整保存並列入計算書。所有控制候選、容量分數與篩選說明都只留在工作頁，不進計算書。RC 板單一 `wu` 保留原流程。
  - RC 柱設計模式跨 #6～#11 主筋、#3～#5 橫向筋與 2.5～15 cm 間距搜尋整體配筋候選；矩形柱另枚舉對稱每邊位置數與 1～4 束筋，圓形箍筋柱／螺旋柱則枚舉圓周均布根數並檢查弦向淨距。圓柱工作頁只顯示單一直徑 D，內部與專案檔固定正規化為 h=D；有效舊專案若保留不同 h，會先驗證原計算指紋再安全遷移，避免無效次尺寸污染結果與後續指紋。每列以正式應變相容 P-M 曲線、逐配置二階放大、Mpr／Ve 與雙軸容量面篩選，並檢查配筋率、兩向剪力、Av,min、斷面上限、一般／耐震間距與耐震圍束量；矩形柱再檢查排內配置與側撐。候選比較只留在工作頁，套用後切至正式檢核；錨定、搭接、首支箍筋、ℓo 外間距與施工圖仍依實際輸入完成正式或人工複核。計算書只保留實際採用配置及正式結果。
- 內力 Picker（內部流程）：
  [結構工具箱/tools/force-picker.html](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/force-picker.html:1)
  - 載重組合模式未選定完整組合時不建立或送出 payload；選定後會在 `meta.combination` 保存組合名稱、設計方法、組合係數與來源完整有號內力。送往 RC 梁／柱時另產生符合目標需求欄語意的採用值；不得用 magnitude 欄反推或冒充來源 signed tuple。此頁不列入首頁正式工具。
- 連續梁分析 regression：
  [continuous-beam-regression.test.js](/C:/Users/USER/Desktop/AI/小工具製作/continuous-beam-regression.test.js:1)、[continuous-beam-report-visual.test.js](/C:/Users/USER/Desktop/AI/小工具製作/continuous-beam-report-visual.test.js:1)
  - 固定檢查連續梁分析計算書的 HTML 輸出可讀文字、支承反力、梁示意圖、剪力圖與彎矩圖，並排除頁面專用閱讀狀態。另以雙跨混合載重案例實際匯出本地 JSON、改動目前案例、重新匯入與計算，要求採用輸入、反力、剪力、彎矩、撓度與計算書指紋完全一致；未知 schema 或拓撲不完整的 JSON 必須在改動目前案例前拒絕。V1.4 可由同一份計算書狀態下載 UTF-8 BOM 的 TXT 文字備查，保留來源文件狀態、產出工具、版本、輸出時間、計算指紋與可重算的文字 SHA-256；Edge 代表案例會實際下載檔案並要求附件組包固定為 `blocked / non-formal-reference-text`。TXT 不保存圖形與核可控制，也不具正式附件資格。計畫欄位可留空；直接輸入 I 值或其他待人工確認條件仍如實列入工程結果，但文件預設內部審閱，核可後才成為正式附件。瀏覽器直接列印操作頁已由共用邊界樣式封鎖。
- 斷面工具共同契約測試：
  [section-tools.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/section-tools.contract.test.js:1)
  - 鎖住斷面性質、合成斷面與 RC 補強斷面頁的 inline status / 報表 payload 邊界，並把共享報表與 runtime HTML 轉成可讀文字檢查標題、主要章節、核可狀態與 page-only wording 排除清單。斷面性質 V2.1 的計算書需列出實際採用尺寸、計算結果、文件狀態與完整追溯欄位；工作頁不再提供預先核可，計算書先以可列印的內部審閱開啟，只能在預覽內明確核可為正式附件。輸出欄位選取已納入計算指紋；核可人或依據異動會撤銷舊核可，重新核可後下載的 HTML 保存文件狀態與內容／核可雙封印，但序列化前會清除撤銷、驗證與下載等暫態操作訊息。實際下載的本地 JSON 改動尺寸再讀回時，重算指紋必須一致，未知 schema 也不得改變目前案例。舊 `斷面性質計算.html` 已縮成薄相容入口，保留 query／hash 後統一導向 `index.html`，不得再複製公式；真實瀏覽器 smoke 另核對 `pickI` 舊書籤、內部審閱／正式附件切換、核可撤銷、正式 HTML 雙封印及操作頁提示排除。合成斷面 V1.2 以版本化本地 JSON 實際執行「存檔、改動、讀回、重算」，要求採用輸入、斷面面積、慣性矩、斷面模數、迴轉半徑、開口／閉口扭轉常數及計算書指紋完全一致。RC 補強斷面 V1.7 也把原有梁柱表單重播鏈升級為正式本地 JSON 入口，完整保存案件資料、目前頁籤、梁與柱全部輸入；讀回後同時重算梁柱，要求計算結果與兩份計算書指紋不變。各工具對未知 schema、不完整欄位或不合法幾何都必須在改動目前案例前拒絕。計算書預設內部審閱，核可後標示正式附件；空白案件欄位可由主文繼承，NG 工程結果也不產生 DRAFT。工作頁直接列印及 JSON 操作按鈕仍由共用邊界樣式封鎖。
- 平面剛架報告邊界契約測試：
  [frame-analysis.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/frame-analysis.contract.test.js:1)
  - 鎖住 `鋼架/平面剛架分析.html` 的 JSON 重播結果鏈與頁面 / 計算書邊界。雙案例載重的門型剛架會實際經過 JSON 蒐集、模型改動、重新匯入與直接勁度法重算，要求模型、位移、反力、彈簧力、平衡結果、桿端力、M/V/N 圖與計算書指紋完全一致；另以懸臂端點力、簡支梁均佈載重、簡支梁跨中集中載重、固定－鉸支梁均佈載重、軸向桿加端彈簧、3–4–5 斜桿懸臂、固定柱腳門架側推、門架梁對稱均佈載重、相同水平彈簧柱腳門架側推、轉動彈簧柱腳懸臂側推、二層單跨剛接門架對稱樓層側力及不對稱二層剛架偏置節點載重十二條力學路徑，獨立核對位移、轉角、反力、端部釋放、彈簧分力、斜桿座標轉換、柱軸向變形、梁軸向約束與柱梁端矩。V1.1 將七組較完整的基準整理成工作頁「標準驗證案例庫」；V1.2 由基底支承與水平樓層梁辨識樓層，輸出目前組合的平均水平位移、層間位移、位移角、層剪力與控制樓層。V1.3 新增具名載重組合的複製、命名、切換、刪除與 JSON 保存，內力圖維持顯示目前組合，樓層表則逐組重算並分別標示位移角及層剪力的控制組合。V1.4 進一步逐組求解每支桿件沿長度的 N/V/M，分別保留最大值、最小值、局部位置與控制組合。V1.5 再對全部節點的 uX/uY/θ，以及固定或彈簧支承自由度的 Rx/Ry/Mz 建立最大值、最小值與控制組合包絡；不同方向與單位分開判定，不把位移和轉角或力與力矩混為同一個總控制值。計算書直接列出載重組合矩陣、目前組合反應、樓層、節點／支承及桿件內力包絡，不帶工作頁操作提示，也不自行套用規範容許值。V1.2 以下單組合 JSON 會由既有 `comboFactors` 自動建立一個相容組合；V1.3、V1.4 JSON 可直接沿用既有具名組合資料，未知 schema 或重複節點編號仍在清空目前模型前拒絕。附件閱讀狀態只留在頁面，`printReport()` 產出的 blob 計算書具備產出工具、版本、計算引擎、輸出時間、計算指紋與必要分析章節；案件欄位可留空，文件預設內部審閱並可核可為正式附件。
  - V1.6 新增基礎樁帽基本載重轉接：指定基礎節點、D/L/W/E 案例、Mx/My 映射及座標方向後，逐案以因子 1.0 重算支承反力，將 Ry 轉為壓力正 P，並依作用與反作用將 Mz 映射至指定基礎彎矩。可下載 `loadcombo-components-v1` JSON，或經 ForcePicker 傳至 `foundation.html`；接收端只建立候選，仍須人工採用並保存來源 SHA-256。單一平面未分析的正交方向固定列為 0，轉接設定隨專案 JSON 保存，重複案例映射會阻擋。
- 覆工板 Word 報告邊界契約測試：
  [覆工板/decking-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/覆工板/decking-report.contract.test.js:1)
  - 鎖住 `覆工板/report/gen_report.py` 與固定 smoke fixture 的 `.docx` 產報邊界，確認案名 / 編號 / 日期與主要章節仍會寫入 Word 計算書，但頁面上的附件閱讀狀態不會混入輸出；操作頁直接列印只顯示一頁邊界通知，頁面內「列印彙整計算書」才會暫時啟用只含彙整報告的 PDF 列印模式，Word 流程維持獨立。正式 release 另把當輪 DOCX 與結構摘要保存在 `decking-formal` 證據目錄，供平台總閘門重新解析。
- 開挖擋土支撐報告邊界契約測試：
  [開挖擋土支撐/excavation-report.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/開挖擋土支撐/excavation-report.contract.test.js:1)
  - 包裝 `backend.tests.test_reporting`，固定檢查 PDF 與 Word 共用「預設內部審閱、明確核可後正式附件」文件狀態、空白案件欄位可由主文承接、精簡追溯欄位及相同下載邊界，並排除頁面專用的「優先建議報告閱讀狀態」與頁面輔助提醒；完整後端測試另以匿名案件實際串起核可 DOCX、ERH／RVR／SEV／SCV／RTB、正式組包及竄改阻擋。正式 release 由 `backend/tests/release_report_artifacts.py` 把當輪正式 PDF、DOCX 與 latest download 副本保存到 `excavation-formal`，供總閘門重新解析並核對雜湊。
- 工具箱入口合約測試：
  [toolbox-entrypoints.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/toolbox-entrypoints.contract.test.js:1)
  - 驗證首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案一致；同時做首頁正式狀態治理、首頁版本治理、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性與目前工作樹覆蓋率，要求 maturity matrix 外的 `formal` 卡片必須在 `governanceSources` 標明對應 preflight gate；其中風力 / 地震正式工具首頁治理來源需明列 `formal-traceability-contract`、`formal-tools-static` 與 `formal-browser-smoke`，RC 首頁治理來源除了 `rc-traceability-contract` 與 `rc-audit-status`，也必須帶出 `rc-column-report-contract`、`rc-shear-wall-report-contract`，鋼構首頁治理來源則需明列 `steel-formal-regression`，石材首頁治理來源則需明列 `stone-report-contract`。連續梁、平面剛架、斷面 / 合成斷面與局部快算卡片也必須帶出對應的計算書 / 報表 / JSON 邊界 chip，讓首頁與成熟度矩陣能明示頁面專用「優先建議報告閱讀狀態」仍受報告邊界契約保護，不會混入計算書、列印或 PDF。首頁側欄的 `報告閱讀狀態總覽` 狀態卡則固定提醒這個 page-only 規則，並把風 / 震 / 鋼構正式工具、RC、連續梁 / 斷面與補強頁、平面剛架、錨栓、石材、覆工板、開挖擋土支撐與局部快算納入同一個頁面層總覽。`HOME_TOOL_UPDATES` 必須逐入口保存 ISO 工具內容更新日，並以 `releaseVerifiedAt` 對齊 tracked 正式放行快照；首頁卡片版本需對齊工具頁 `APP_VERSION` / `TOOL_VERSION`，且 title、H1、報告與 metadata 的可見版本不得互相矛盾。`preflight-tools.ps1` 內執行的 `*.contract.test.js` 需列入 `STAGING_GROUPS.md` 與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入兩份文件，preflight helper script 清冊要求 `.ps1` / `.bat` 入口列入 staging 指引與邊界文件；含非 ASCII 文字的 `.ps1` 必須保留 UTF-8 BOM，避免 Windows PowerShell 5.1 讀取中文路徑時 mojibake，`STAGING_GROUPS.md` 的 `git add` 路徑需在 checkout 中存在；git-aware 的 tracked deletion / ignored path / 目前工作樹覆蓋率由 preflight `staging-groups-coverage` gate 檢查，確認每個 `git status` 變更都落在 staging 或人工 review 分包，再以 `stateBoundaryRules` 檢查非 formal 責任邊界，避免 assist / reference / estimate / workflow / report / service / legacy / external 類工具過度承諾。
  - `excavation-backend` 會完整執行開挖擋土支撐 Python 測試套件；其 preflight 專屬上限固定為 `timeoutSeconds = 600`，容納真實附件證據鏈、治理封存 round-trip 與測試完成後程序收尾，仍維持逾時失敗且不得重用、跳過或縮減測試。
  - `rc-column-report-contract` 會完整渲染三個柱案例與人工複核後正式核可案例；其 preflight 專屬上限固定為 `timeoutSeconds = 600`，保留 release 全平台負載下的瀏覽器啟動與完整證據餘裕。
  - `formal-browser-smoke` 會在 release 模式逐一重跑 14 個風力／地震正式工具的桌面與行動版報表；其 preflight 專屬上限固定為 `timeoutSeconds = 600`，保留平台稽核後的瀏覽器啟動與 31 份正式渲染證據餘裕。
  - `audit-all.ps1` 內的完整 RC audit 固定為 `timeoutSeconds = 1200`，其 preflight 外層 `platform-audit` 固定為 `timeoutSeconds = 1500`；兩層仍保留逾時失敗與程序樹終止，只提供 release 全量瀏覽器證據與平台串行稽核所需的執行餘裕，不重用或略過任何 RC 檢查。RC 子 gate 只有在輸出精確出現 Windows／Chromium `net::ERR_NO_BUFFER_SPACE` 時，才保存首次失敗 log、冷卻 60 秒並重跑一次；其他錯誤或第二次失敗仍立即阻擋。

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
- 驗證後正式附件組包：
  [attachment-package-build.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-build.js:1)
- 正式附件包事後完整性與工程內容驗證：
  [attachment-package-verify.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-verify.js:1)
- 舊版正式附件包升級評估：
  [attachment-package-upgrade-assess.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-upgrade-assess.js:1)
- 舊版附件包安全升級工作區：
  [attachment-package-upgrade-workspace.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-upgrade-workspace.js:1)
- 舊版附件升級工作區完成度檢查：
  [attachment-package-upgrade-workspace-check.js](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/tools/attachment-package-upgrade-workspace-check.js:1)
- 錨栓 `anchor/` 可攜式部署同步（Pages 子路徑與 Vercel `/anchor/` 共用）：
  [sync-anchor-deployment.ps1](/C:/Users/USER/Desktop/AI/小工具製作/sync-anchor-deployment.ps1:1)

2026-09-29 起已停用並自 repo 移除下列治理流程：多案件治理趨勢、舊版附件升級使用者流程（統一升級流程、內部歷程、可信基準與升級助手）、單案附件治理（案件附件工作台、治理檢視器、總覽／根目錄／工作區與捷徑安裝器）、正式附件包管理器與建立／驗證／檢查附件組包批次入口、梁柱彎矩 G1、工程資格化案件包、RC STM 變更集審查，以及公開發布決策備份、還原演練、雲端檢查點與其排程。上列附件檢查、組包與驗證核心仍以 CLI 保留；如需恢復已停用流程，可自 git tag `archive/governance-2026-09-29` 還原。

所有直接啟動 PowerShell 的 `.bat` 均先找 `pwsh -NoProfile`，未安裝時才回退 `powershell -NoProfile`；launcher smoke 會自動掃描並阻擋漏掉此雙路徑的新增 wrapper。

錨栓的 tracked `anchor/` 鏡像固定以 `ANCHOR_BASE_PATH=./` 重建，讓同一份輸出可在 GitHub Pages 倉庫子路徑與 Vercel `/anchor/` 載入；Pages live smoke 也會實際請求入口引用資源，避免只驗到 HTML 200。

`audit-all.ps1` 用來守住主平台的鋼構、RC 與規範核心，子 audit 以 `ProcessStartInfo` 執行，避免 Windows `Path` / `PATH` 環境鍵重複造成 `Start-Process` 失敗；`refresh-platform-status.ps1` 可在三個子系統 audit 已通過時，快速刷新平台摘要、歷史紀錄與 `platform-audit-decision.json`，讓 dashboard component hash 不會沿用舊 decision；`platform-audit-preflight.ps1` 會先判定三個子系統 audit-status 是否通過且比來源檔新，若新鮮即重用狀態並刷新平台摘要，若 stale / missing 則自動回到 `audit-all.ps1`；需要強制完整重跑時可用 `run-preflight-tools.bat -ForcePlatformAudit`。`preflight-tools.ps1` 則再納入風力路徑、連續梁、批次啟動檔 smoke、generated artifact boundary、工具箱入口合約（首頁入口 / routeFileMap / vercel.json / formal-tools.manifest.json / local-quick-tools.manifest.json / 首頁版本治理 / Pages deploy / Pages live smoke / preflight contract 文件化 / staging 指引可執行性 / 目前工作樹覆蓋率 / HOME_TOOL_UPDATES / APP_VERSION / TOOL_VERSION）、鋼構 / RC / 規範核心 audit 狀態新鮮度、風力 / 地震正式工具與鋼構 traceability contract、平台摘要刷新、runtime stale pid 首尾 gate、錨栓 source verify、`/anchor/` 部署 fingerprint 與錨栓報告邊界 contract、石材、開挖擋土支撐報告邊界 contract、覆工板 Word 報告邊界 contract、平面剛架專屬報告邊界 contract、局部快算 manifest runner / 共同契約 / JSON 匯出 helper / 跨輸出一致性 regression / Edge 瀏覽器 smoke（含 `vercel.json` 乾淨路由、JSON 匯出按鈕、JSON round-trip 與列印計算書）、風力 / 地震正式工具 manifest runner（14 個正式 / 報表頁，含乾淨路由、桌機 / 手機橫向溢出、詳算式 / 簡易結果分流 regression、具備者的 JSON 匯出、列印計算書、示意圖角色、示意圖幾何與 pilot golden cases）、preflight latest summary / history 耗時、最慢檢查摘要、latest/history log 可追溯性與通過 log hygiene、基礎局部檢核、設備局部荷重與擋土土壓局部檢核 smoke / regression，適合交付前或跨工具大改後執行。主檢查 summary 寫出後先重產工具成熟度矩陣（含 `goldenCaseRegression`、`jsonRoundTrip`、`referenceTraceability` 下一步品質欄位，且 N/A 不列入分數分母），再執行巡檢儀表板 final history contract、fixture browser smoke 與 live-output smoke；這讓 dashboard 讀到的是當輪 summary，避免新增 governance key 時被舊 summary 或 sourceHash stale 假失敗卡住。quick preflight 的兩次矩陣 refresh 會保留 tracked 首頁公開狀態快照，只更新 ignored `output/audit`，避免本機 quick 驗證污染正式 release 快照。GitHub Pages deploy workflow 是部署防線，會以 Actions 發布 artifact，部署成功後檢查公開首頁與首頁狀態快照，不取代本機 preflight；部署前可用 `run-pages-artifact-smoke.ps1` 做本機 artifact 預演。若只是用 repo root 的臨時 HTTP server 做本機預覽，可對 `pages-live-smoke.js` 加 `--allow-local-output`，只跳過本機 `/output/` 路徑可讀性的假陽性，不放寬公開站檢查。修改 `螺栓檢討/bolt-review-tool` 後，請先跑 `sync-anchor-deployment.ps1` 更新 `anchor/` 與 `anchor/deployment-manifest.json`，否則 anchor route gate 會視為部署鏡像 stale。`run-preflight-tools-quick.bat` 只跑靜態契約、狀態新鮮度、輕量 parser/import/store smoke 與 runtime gate；完整 browser smoke、完整 backend tests、錨栓 verify、前端 build 與平台完整 audit 仍以 full preflight 為準。full preflight 只會對通過、來源未更新且狀態不超過 24 小時的慢測重用新鮮狀態，並在 history 記錄 `slowReuseKeys`；需要強制重跑慢測時可用 `run-preflight-tools.bat -ForceSlowChecks`；正式放行可直接用 `run-preflight-tools-release.bat`，它固定帶 `-ForceSlowChecks -ForcePlatformAudit`，避免誤用快取狀態。

附件整理完成、送出計算附件前，可執行 `node 結構工具箱/tools/attachment-package-check.js --input <附件資料夾> --project-no <計畫編號>`。它讀取 PDF、DOCX、XLSX、JSON、HTML 與文字附件，會自動略過 `.evidence.json`、成對的文字擷取檔、渲染摘要及作業系統雜項檔案，並檢查同工具版本、來源 JSON 與正式計算書的計算指紋配對、真正重複的來源／輸出及頁面專用文字。所有被辨識為計算文件的成品另須通過同一正向內容契約：一般計算書至少可辨識採用輸入、計算／檢核過程、工程結果及至少兩個實際工程數值；明確標題為計算摘要者可省略重複詳算，但仍須包含採用輸入、工程結果與相同的數值門檻。只有標題、章名、文件狀態、核可時間或追溯欄位的空殼文件一律 blocked；版本、日期、時間與計算指紋也不算工程數值。HTML 的 script、style、template 與 noscript 程式內容不計入可見工程內容。來源 JSON 維持追溯資料角色，不套用計算書正向內容群組。每份檔案會在內容解析前後取得 SHA-256；檢查期間若仍被重新輸出或替換即 blocked。來源資料夾本身或其內容若含符號連結、Windows junction 或其他特殊項目也會列名並阻擋，避免靜默遺漏或帶入選取資料夾以外的檔案。`文件狀態：內部審閱` 會阻擋正式組包；文件同時具備 `文件狀態：正式附件` 與有效 `核可時間` 才能自動放行。輸出時間與核可時間會依台灣本地格式或具時區 ISO 格式解析；無效輸出日期降為 `review`，核可早於輸出則 blocked，同一顯示秒可接受。計畫名稱、計畫編號與設計人可由主文承接，不列為必要欄位。缺少產出工具、版本、輸出時間、指紋或遇到未支援格式時仍降為 `review`。命令列採失敗封閉：只有 `ready` 回傳退出碼 `0`；`review` 回傳 `1`、`blocked` 回傳 `2`，參數或執行錯誤回傳 `3`。檢查結果只供內部整理，不得附入計算書、列印或 PDF。

日常組包與 v3 正式附件包事後驗證會重新計算 RC、風力／地震共用正式 HTML、錨栓正式 HTML，以及錨栓正式 XLSX 的內容／核可封印。共用 HTML 計算書的正式附件核可另提供「核可人」與「核可依據」選填欄位；兩欄留空不構成 NG、DRAFT 或組包阻擋，填寫後只以精簡頁尾紀錄進入正式附件，輸入控制仍在列印時隱藏。新版 RC／共用正式 HTML 核可封印 v2 會把兩欄連同狀態、時間、標題、計算指紋及內容封印一起綁定，任何改寫均由附件檢查器阻擋；既有 v1 核可封印仍可依原規則驗證。舊版正式 HTML 或 XLSX 缺少任一應有封印時降為 `review`；正文、公式、快取結果、文件狀態、核可時間、計算指紋、工具身分或文件標題被改寫時固定 `blocked`。即使同步重算檔案雜湊、附件包清單與包指紋，也不能繞過附件內容的雙封印驗證。組包與事後驗證摘要分別列出 HTML 雙封印與 XLSX 雙封印完成數，只顯示完成數與通過／異常狀態，不輸出封印值、封印範圍或正文；這些資訊只供內部交付確認，不進入正式附件，且 SHA-256 封印不是核可人的身分數位簽章。

開挖擋土支撐的 PDF／DOCX 預設為可列印的內部審閱，只有使用者在報表匯出頁明確勾選核可，才標示為正式附件並記錄核可時間；案件名稱與設計者留空仍可由主文承接。核可 PDF 會同步產生逐頁像素、OCR 與文字層對齊證據，以及只含 PDF／證據的單一 ZIP 組包來源套件；ZIP 只是搬運用來源套件，本身不是正式附件包，組包前須解壓為 PDF 與證據配對。若同案還要納入 ERH、RVR、SEV、SCV 或可選公開 RTB，則仍將治理 JSON、PDF 與其同名證據放在同一個組包來源資料夾，以完整案件來源組包。檢查器會把治理與渲染證據辨識為內部追溯，不拿來冒充計算來源／報告配對；SCV 所列來源檔名、SHA-256、各層指紋、工程結果、身分採用狀態及非工程核可邊界必須一致。完整鏈與 PDF 證據會隨 v3 包保存在 `99_內部追溯_勿附入主報告/來源資料/`，正式計算書仍只進入 `01_正式附件/`；缺檔或內容替換 blocked，孤立且未被 SCV 連結的治理證據維持 review。匿名端到端測試以實際後端產物證明核可 PDF 來源 ZIP 內容精確、組包後內部 JSON 不流入正文，且 OCR 證據或組包後 SEV 遭替換都會失敗封閉。組包器及事後驗證器都會重做這項檢查並只顯示完成組數。此關係檢查不重算 ERH／RVR／SEV 的受控內容或 Ed25519 簽章，正式複驗仍須使用包內來源檔重跑 `驗證SEV證據鏈.bat`。
附件可見性採失敗封閉：HTML 靜態檢查會排除 `hidden`、`aria-hidden`、列印媒體隱藏、透明、零尺寸及明確同色前景／背景內容；裁切、頁外位移或無法由靜態 CSS 確定的同色內容一律降為 `review`。DOCX 的 `w:vanish` 隱藏文字及 XLSX 的 hidden／veryHidden 工作表、隱藏列、隱藏欄都不計入工程內容；工作表存在隱藏欄但儲存格缺少 `r` 參照時，不猜測欄位而改列 `review`。PDF 的 `pdftotext` 只用於文字層 metadata 對照，不能證明實際可見或冒充 OCR；只有同一次瀏覽器列印工作階段取得的 print-visible DOM（computed style、有效背景／對比、`getClientRects`）、PDF SHA-256 與 `pdftoppm` 逐頁像素指標，或真正由渲染頁面取得的 OCR／vision 證據，才可自動視為 canonical evidence。檢查器會重算 evidence 內正規化 `visibleText.text` 的長度、SHA-256、文件 profile 與工程內容邊界，並要求正式狀態、核可時間、產出工具、版本、輸出時間及計算指紋與 PDF 文字層一致。這仍是可見性與一致性檢查：複雜 Office 條件格式、物件疊放、字型替換、透明度合成及掃描 PDF 的辨識誤差可能需要人工複核，不等同排版簽章或工程核可。
HTML 靜態判定會合併同一元素命中的 simple selector 規則與 inline style，並以預設白色頁面、繼承前景色及最近明示的祖先背景色判斷對比；白字落在預設白底、分拆規則形成同色前景／背景，以及 `width:0; height:0; overflow:hidden` 的內容都不得補足工程內容。明確白字／深色背景等有效對比則維持可見；外部 stylesheet、CSS `@import`、涉及可見性／配置／前景背景但無法解析的 selector，以及無法解析的 `color`／`background` 值（如 `hsl()`、`var()`）一律轉人工複核。純 typography 的複雜 selector 不會單獨觸發此狀態。
Canonical profile 也不直接相信 evidence 宣告：檢查器先由可見標題重判「計算書／計算摘要」family；可見內容同時具備產出工具、版本、輸出時間與計算指紋時，再提升為 `traceable-*` 並以較嚴格群組重算，避免把可追溯計算書降級或偽裝成摘要。`compiled-engineering-report` 可與計算書 family 相容，但仍以重判後 profile 檢核內容。preflight 的同一 `attachment-package-check` key 在 quick／CI 固定保留 Node 單元測試；只有 full／release 才在單元通過後追加實際 Edge canonical render E2E。

檢查通過後，可執行 `node 結構工具箱/tools/attachment-package-build.js --input <附件資料夾> [--output <輸出資料夾>] [--project-no <計畫編號>]`。組包器直接沿用上述檢查結果；只有 `ready` 且至少一份文件明確標示「文件狀態：正式附件」及有效核可時間時才會建立輸出。正式計算書放入 `01_正式附件/`；來源 JSON、SHA-256 清單與附件包指紋放入 `99_內部追溯_勿附入主報告/`。新建附件包採 `formal-attachment-package.v3`：附件包指紋除 v2 已涵蓋的檔案路徑、大小、SHA-256、建立時間、計畫編號、產出工具、版本、輸出時間、計算指紋、組包前摘要及正式／內部分流邊界外，再綁定每份正式附件的核可時間。`review`、內部審閱、來源連結／junction、無正式文件、輸出位於來源資料夾內或輸出位置已存在時皆不產生正式包；複製層另會逐層檢查來源實際路徑，並要求檢查完成、複製前、複製後與目標檔案的 SHA-256 完全相同，避免檢查後遭路徑轉向、重新輸出或內容替換。建立過程先寫入暫存資料夾，並以事後驗證器在暫存區完成逐檔大小、SHA-256、清單、指紋、資料夾邊界及正式附件工程內容自我驗證，全部通過後才原子更名；Windows 若於更名瞬間回傳 `EPERM`、`EACCES` 或 `EBUSY` 且正式輸出仍不存在，只會在 0.5 秒內有限重試，其他錯誤仍立即失敗。自我驗證失敗會清除暫存資料且不建立輸出，避免留下半成品或看似正式的異常附件包。

正式附件包在寄送、複製或歸檔後，可執行 `node 結構工具箱/tools/attachment-package-verify.js --input <正式附件包資料夾>`。驗證器不修改任何檔案，會逐一核對清單格式、資料夾邊界、檔案大小、SHA-256、附件包指紋與內部 README，並阻擋遺漏、替換、追溯欄位、核可時間或附件邊界變更、額外檔案／資料夾、符號連結及路徑越界；附件包根目錄本身若為符號連結或 Windows junction 也會直接阻擋，並在結束前以檔案系統身分重新確認根目錄未被替換。對目前 v3 包，驗證器還會直接重讀包內正式附件與來源 JSON，再次套用正向工程內容、頁面專用文字、正式附件身分、核可時間及來源／報告指紋配對規則；附件實際文字中的產出工具、版本、輸出時間、核可時間或計算指紋若與清單不同，即使重新計算出相符的檔案雜湊與附件包指紋仍會 blocked。清單、README、全部附件及目錄結構會在結束前再做第二次快照，雲端同步、重新輸出或人工整理若在驗證期間改變任何項目即失敗封閉。清單內每一層 JSON 物件的欄位名稱必須唯一；同字面欄位或以 `\u` 跳脫表示的同名欄位都會阻擋，避免不同解析器採第一值或最後值而讀出不同附件內容。清單另採封閉式欄位契約：頂層、檢查摘要、分流邊界及每筆正式／追溯附件紀錄只接受已定義欄位，任何未納入指紋的自訂狀態、簽章或擴充欄位都會阻擋，避免驗證器忽略而其他系統誤信。清單路徑另須採 NFC 正規化、避開 Windows 保留裝置名稱與尾端空白／句點，且以不分大小寫的可攜式路徑鍵維持唯一，避免 `A.pdf` 與 `a.pdf` 在 Windows 被重複計數為兩份附件。v3 包另會獨立驗證輸出時間有效、核可不早於輸出、清單建立時間為嚴格具時區格式且不早於任何正式附件核可時間，形成「輸出 ≤ 核可 ≤ 組包」的完整時間鏈。即使清單指紋重新計算一致，也不放行空殼附件、實際內容與清單不一致、重複／未定義 JSON 欄位、路徑碰撞或不合理時間。既有 `formal-attachment-package.v1` 與 `formal-attachment-package.v2` 附件包仍可依各自原指紋規則確認檔案完整性，但因未綁定 v3 的完整追溯 metadata／正式核可時間，結果固定為 `review`、退出碼 `1`，需人工確認或重新組包為 v3；只有完整性、工程內容與驗證期間穩定性都吻合的 v3 包才會自動判定 `ready` 並回傳退出碼 `0`。任何版本若有完整性異常都以 `blocked` 優先並回傳 `2`，參數或執行錯誤回傳 `3`。此機制仍不等同數位簽章或第三方身分驗證。

要處理既有 v1／v2 包時，可執行 `node 結構工具箱/tools/attachment-package-upgrade-assess.js --input <正式附件包資料夾> [--json]`。評估器先沿用同一完整性驗證器：異常包固定 blocked，不提供升級捷徑；完整的舊包則列為 review，依序要求保留舊包、由原始工具重新確認並輸出計算結果、重新勾選正式附件核可、另建新的 v3 包。它不修改附件包、不在原清單補欄位、不複製或推算舊核可時間，也不自行產生正式附件；v3 包若已驗證通過則明確回報不需升級。CLI 狀態碼維持 `ready=0`、`review=1`、`blocked=2`、參數或執行錯誤 `3`，`--json` 只把同一份內部評估輸出到標準輸出。

升級評估另會依「產出工具＋版本＋共享計算指紋」為每份正式附件配對包內來源資料，列出附件路徑、舊輸出時間、指紋、來源檔案及四項待辦。找不到來源時會逐份標示需回外部可信原始檔或原工具重建，禁止從舊報告反推輸入；文字與 `--json` 使用同一份工作清單。v3 或 blocked 包不產生誤導性的重新輸出清單。

確認完整舊包需要升級後，可執行 `node 結構工具箱/tools/attachment-package-upgrade-workspace.js --input <舊版正式附件包> [--output <新工作區>] [--json]`。建立器只新增獨立工作區，不修改舊包，也不複製舊附件、來源資料、metadata 或核可時間；`00_內部升級工作說明_勿附入主報告/` 只放逐份待辦，`01_新組包來源/` 只預建空白的「重新輸出正式計算書」與「重新確認來源資料」資料夾。完成重算與重新核可後，只能選取 `01_新組包來源/` 交給正式組包器，不得選取整個升級工作區。工作區採暫存後原子發布，失敗不留半成品；建立成功仍固定為 `review`／退出碼 `1`，不代表正式附件已核可。v3 完整包不建立工作區並回傳 `ready=0`；異常包不建立工作區並回傳 `blocked=2`；參數或執行錯誤為 `3`。

新輸出整理完成後，可執行 `node 結構工具箱/tools/attachment-package-upgrade-workspace-check.js --input <升級工作區> [--project-no <計畫編號>] [--json]`。完成度檢查器固定唯讀，先核對工作清單指紋、JSON／Markdown 同源與目錄邊界，再沿用附件組包檢查，並以「產出工具＋舊計算指紋」逐份尋找各 1 份新計算書及新來源；新工具版本可以不同，但兩份新檔仍須彼此版本與指紋一致。新輸出、來源儲存與正式核可時間均不得早於工作區建立時間，因此手動複製舊包內容不會通過。缺件、內部審閱或尚未重新核可維持 `review=1`；指紋不符、清單遭修改、邊界多檔或不安全連結為 `blocked=2`；只有全部逐份完成才是 `ready=0`。正式組包器會自動辨識 `01_新組包來源/` 並先執行同一閘門，未通過時不建立附件包；通過後的新 v3 包也固定輸出在工作區外。

RC 基礎工具的 `tools/test-foundation.ps1` 已串接獨立基腳 production core、有限配筋需求、底版需求、群樁側向分配、p-y 結果橋接與表格換算純數值回歸，以及 8 份基礎報告視覺 smoke：涵蓋獨立、聯合、筏式、樁基／樁帽、代表單樁 p-y 採用及擋土牆，檢查 NG／待確認邊界、主要檢核群組、逐層承載力表、趾版底層與踵版頂層設計、無 `NaN` / `Infinity` / `undefined` / `null` / `∞`、無水平溢出，並輸出 PNG / PDF / JSON 稽核檔；列印模式也會確認工具列隱藏。

工具成熟度矩陣的下一步品質欄位同時包含 `reportTextSmoke`、`goldenCaseRegression`、`jsonRoundTrip` 與 `referenceTraceability`；其中 `reportTextSmoke` 只揭露報告可讀文字抽檢是否已被 smoke / contract 覆蓋，不把頁面專用閱讀狀態寫入計算書或 PDF。

跨工具納入版本控管前，先參考 [TOOL_BOUNDARIES.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_BOUNDARIES.md:1) 與 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)，避免把案例輸出、暫存檔、Office 文件或本機依賴一起提交。

新增或重構工具、示意圖與列印計算書前，請先參考 [TOOL_REPORT_GUIDE.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_REPORT_GUIDE.md:1)。此檔固定說明示意圖、詳算式 / 簡易結果版面、計算書出具內容規範、JSON 匯出匯入與回歸檢查重點，避免重複踩到報告格式與工程依據文字問題。

RC 梁、柱、板、牆、剪力牆、基礎與單樁既有專案 JSON 可直接抽取案件、產出工具、版本、輸出時間及計算指紋，並與同頁計算書自動配對，不需另行改寫來源檔。七個計算書固定使用與各自專案 JSON 相同的工具名稱及版本，避免同一次計算因追溯標籤漂移而停在人工複核。

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
