# 鋼筋混凝土構件設計工具箱

目前工具入口為 [index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/index.html)，模組位於 [tools](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools:1)，共用函式位於 [shared](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/shared:1)。

## 目前模組

- `梁 Beam`
- `柱 Column`
- `板 Slab`
- `牆 Wall`
- `剪力牆 Shear Wall`
- `基礎 Foundation`
- `單樁 Single Pile`

深梁、基礎二維與樁帽三維 STM 子流程另由 `結構工具箱/tools/independent-engineering-adapters/rc-stm-strength.js` 接入獨立工程基準。每個能力保留兩個代表性合格案、一個隔離拒絕案、一組「略低／等於／略高」臨界值，以及一組「負裕度在 EPS 內／剛超出 EPS」案例：深梁鎖定 25° 壓桿角度、基礎二維鎖定 23.4.4 剪力容量、樁帽三維鎖定 X/Y 拉桿層容許錯位。二十四案共 564 項封閉解斷言，schema 明確區分 `strength-pass` 15 / 15 與 `strength-reject` 9 / 9。Oracle 不讀 production 結果，會各自重算力與力矩平衡、壓桿／拉桿、節點、多排形心、剪力及帶號裕度；故意改動中間量、把不合格案例放行、把合格案例拒絕或改變 EPS 邊界時均必須阻擋。整體狀態為 24 / 24 案、564 項斷言：3 個代表性強度案已升為 `/rc-deep-beam-stm`、`/rc-foundation-deep-beam-stm`、`/rc-pile-cap-3d-stm` 正式路由基準，其餘 supplemental candidate cases 21 / 21，candidate capabilities 維持 3 / 3；不得把這些限定拓樸擴張為所有 STM 案件均已獨立驗證。

## 自動巡檢

已提供整套 RC 巡檢腳本：

- [audit-tool.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/audit-tool.ps1:1)
- [run-audit.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit.bat:1)
- [run-audit-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit-loop.bat:1)

巡檢會跑：

- `shared/common.js` helper 單元測試
- `shared/project-storage.js` 案件存讀檔單元測試
- RC 專案 JSON／計算書指紋一致性 contract（另含七類工具的正式 HTML＋來源 JSON 實檔組包，以及竄改、錯版本與完整身分改寫失敗封閉）
- 稽核狀態與首頁選單 contract
- RC STM 獨立工程基準 gate（24 / 24 案、564 項斷言；合格 15 / 15、拒絕 9 / 9，另驗證 false acceptance / false rejection 失敗關閉）
- 首頁入口瀏覽器 smoke
- 梁報告視覺 smoke contract
- 梁回歸測試與報告視覺 smoke
- 深梁 STM 計算核心、梁頁導流、瀏覽器與 PDF 回歸
- 柱報告視覺 smoke contract
- 柱回歸測試與報告視覺 smoke
- 板報告視覺 smoke contract
- 板回歸測試與報告視覺 smoke
- 牆報告視覺 smoke contract
- 牆回歸測試與報告視覺 smoke
- RC 條文語意追蹤 catalog
- RC 條文語意追蹤 contract
- 剪力牆完整 suite
- 剪力牆報告視覺 smoke contract
- 剪力牆報告視覺 smoke
- 基礎報告視覺 smoke contract
- 基礎回歸測試與報告視覺 smoke
- 單樁報告視覺 smoke contract
- 單樁回歸測試與報告視覺 smoke
- RC 補強報告視覺 smoke contract
- RC 補強報告視覺 smoke

RC STM gate 使用與全平台相同的私有 catalog 與獨立 Oracle，但 RC 本地巡檢只載入 `rc-stm-strength.js` production adapter，不連帶載入鋼構、風力或其他工具的 production adapter。這讓 RC 計算核心、三項限定 STM 拓樸與其 24 案／564 項證據可在本模組內失敗關閉，同時維持跨工具責任邊界。最新單次證據寫入 `鋼筋混凝土/output/audit/rc-stm-independent-engineering-benchmarks.txt`；該檔為私有 QA 證據，不進入計算書或 Pages 公開成品。

首頁入口瀏覽器 smoke 入口為 [tools/test-rc-index-menu.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-rc-index-menu.ps1:1)，會以本機 HTTP server 實際開啟首頁與各工具卡片，檢查：

- menu card 目標頁皆回傳 HTTP 200。
- browser console / page error / 4xx 或 5xx response 皆不得出現。
- 各工具頁需有 title 與基本可見內容，並輸出首頁截圖與 JSON 稽核紀錄。
- 梁、柱、板、牆、剪力牆、基礎、單樁與 RC 補強斷面共 8 個輸出頁，瀏覽器直接列印時只能產生一頁「RC 工具主頁列印已封鎖」通知；工作頁內容不得進入 PDF。
- 各頁「計算書」按鈕產生可列印的內部審閱版；在預覽視窗勾選核可後改為正式附件。預覽中的「下載目前版本 HTML」會保留一條不必執行 JavaScript 即可辨識的文件狀態、核可時間與計算指紋，重新開啟時沿用同一列並還原核可控制；分頁標題同步包含文件狀態與計算指紋，供瀏覽器列印／存 PDF 採用可辨識的預設檔名。梁、柱、板、牆、剪力牆、基礎、單樁與 RC 補強斷面共 8 個報告視覺 smoke，皆使用 `tools/report-portable-html-check.js` 實際勾選核可並點擊下載，確認 HTML 檔名等於「計算書名稱_正式附件_計算指紋」、靜態狀態可由附件檢查器讀取，且不夾帶核可／下載控制；HTML 成品會實際保存至當輪 release 證據目錄，檔名與指紋寫回各報告 audit JSON，再由彙整器逐份重讀驗證。空白案件欄位可由主文承接，工程 NG 不等同文件 DRAFT；計算輸入變更後核可自動失效。
- 梁、柱、板、牆、剪力牆、基礎、單樁、深梁 STM、基礎深梁 STM、樁帽三維 STM 與 RC 補強斷面（梁／柱）的計算書預覽另提供同一報告狀態衍生的 TXT 文字備查。文字檔固定包含 `文件類別：文字備查`、`正式附件資格：否`、產出工具、版本、輸出時間、計算指紋及內容 SHA-256；它不含圖形、版面或核可控制，即使來源 HTML 已核可，附件組包仍會以 `non-formal-reference-text` 失敗封閉。正式交付仍以核可 HTML、PDF 或原生 Office 成品為準。

RC 條文語意追蹤 catalog 位於 [tools/rc-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/rc-traceability.catalog.json:1)，目前覆蓋梁、柱、板、牆、剪力牆、基礎與單樁，集中登記：

- 採用的規範章節與條文路線。
- 對應輸入欄位、計算核心與報告落點。
- 覆蓋該路線的 regression / browser smoke 證據檔。
- 仍須依施工圖、專案模型或設計者判定人工複核的項目。

獨立契約測試位於 [tools/rc-traceability.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/rc-traceability.contract.test.js:1)，會確認每個 RC 模組的 trace 數量、規範來源、報告落點、證據檔存在與人工複核措辭，並由 RC audit 與平台 preflight 直接執行。

RC 專案 JSON 與正式計算書共用同一枚 `CF-` 計算指紋。指紋納入工具識別、計算模式、計算欄位、結果摘要、外力匯入及人工複核紀錄；案名、計畫編號、設計者、儲存時間、版本字串與純畫面分頁不納入。基礎分頁代表不同計算類型，另以計算情境納入。梁、柱、板、牆、剪力牆、基礎與單樁讀取專案 JSON 時，會先驗證 schema、工具種類、工具版本及來源內容指紋，再套用輸入並重新計算；只有重算指紋與來源完全相同才保留匯入結果，不相容、遭修改或無法完整還原時會回復匯入前狀態。這 7 個工具的計算書另固定使用和專案 JSON 完全相同的產出工具名稱及版本；附件組包器可辨識既有 RC `metadata`／`fields` 與單樁 `state` 格式，據案件、工具、版本及 `CF-` 自動配對來源與報告，不要求改寫舊專案檔。柱與剪力牆已先以 [shared/project-storage.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/shared/project-storage.js:1) 共用欄位收集、欄位回填、JSON 下載、瀏覽器暫存、檔名清理與 1 MiB 匯入上限；schema、工具版本、計算指紋與失敗回復仍由各工具保有。契約測試位於 [tools/rc-project-fingerprint.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/rc-project-fingerprint.contract.test.js:1)，7 個報告視覺 smoke 會實際套用來源並比對重算指紋與報告頁完全一致；梁、柱、板回歸另以真實檔案介面確認錯誤版本遭拒且現有輸入不變。RC 稽核的柱、板、基礎與單樁瀏覽器套件每輪會向作業系統取得不同的 loopback 埠，避免多個工作目錄或 release 流程同時執行時互撞。

梁報告視覺 smoke contract 位於 [tools/beam-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/beam-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界與輸出證據檔名，避免頁面專用提醒或人工複核提示漂移進計算書。

梁報告視覺 smoke 已接在 [tools/test-beam.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-beam.ps1:1)，會以瀏覽器產生計算書，檢查：

- 一般設計與 SMRF 剪力控制兩種代表報告情境。
- 梁斷面圖在計算書內有實際渲染。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格與圖示不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

深梁另由 [tools/deep-beam-stm.html](tools/deep-beam-stm.html) 支援「對稱單跨、跨中集中載重」的二維壓拉桿模型。一般梁頁判定符合 9.9.1.1 時會顯示導流按鈕並帶入 h、ℓn、bw、d、fc'、fy 與由單側 Vu 換算的對稱 Pu 候選值。V0.3 可將底部拉桿配置為 1 至 12 排，自動分配各排支數，依 20.2.2.4 將 STM 拉桿 fy 限於 5,600 kgf/cm²，並依 25.2.1、25.2.2 檢核水平／垂直淨距、斷面容納與鋼筋群心；配筋斷面圖一併納入計算書。核心與瀏覽器／PDF 回歸已接入 `tools/test-beam.ps1`；其他載重、支承或開孔模型不得套用本頁拓樸，須另建與案件邊界相符的 STM。

基礎深構材另由 [tools/foundation-deep-beam-stm.html](tools/foundation-deep-beam-stm.html) V0.3 支援「單一置中柱載重 + 全長均佈地盤反力」及「單一置中柱載重 + 對稱離散樁反力群」兩種獨立二維條帶 STM。工具先封閉材料係數範圍、反力模式白名單與數值平衡容許值上限，再檢查垂直力、力矩、左右對稱性，以及壓桿水平分力的全域殘差；其中水平力殘差 1.0% 明確屬於數值品質門檻而非條文限值。通過後才計算扇形壓桿、分段底部拉桿、節點區、13.4.6.5 樁反力剪力計入及 25.2 多排拉桿配置；三維樁帽、偏心或非對稱反力不得以此頁取代正式模型。核心、瀏覽器與三頁 PDF 回歸已接入 `tools/test-foundation.ps1`。

樁帽三維力流另由 [tools/pile-cap-3d-stm.html](tools/pile-cap-3d-stm.html) V0.5 支援「單一柱／基座承壓面內垂直合力節點 + 完整矩形正交樁群」的三維 STM。核心固定將垂直力平衡容許誤差封閉於 2.0% 以下、雙軸力矩平衡各封閉於 1.0% 以下，並將 X/Y 壓桿水平分力的全域殘差各封閉於 1.0% 以下；這些百分比均明確屬於數值品質門檻而非條文限值。各樁正向因數化反力必須同時滿足 Pu、Mux、Muy 與 X/Y 水平力平衡，工具才會建立連往各樁的三維壓桿，並檢核 X/Y 整體底部拉桿帶、多排配筋、柱下 CCC 節點、樁頂 CCT 節點、13.4.6.1 有效深度與 13.4.6.5 剪力計入。基礎完整工具可選擇「目前頁面結果＋手動附加組合」，或將 Pu、Mux、Muy 的 D／L／W／E 基本分量交由共用 `LoadCombo.computeTuples()` 產生 LRFD 組合；`pile-cap-stm-load-combinations-v1` 會保留 `loadcombo-tuples-v2`、基本分量與組合來源。基本分量除頁面輸入外，也可匯入 `loadcombo-components-v1` 分析 JSON、由 ForcePicker 的 `foundation-pile-cap` 目標傳入，或直接讀取 ETABS／SAP2000 的 Joint Reactions CSV／TSV／TXT。Joint Reactions V1.1 轉接只接受單一節點、可線性疊加的 Linear Static／LinStatic 基本載重案例：使用者必須明確指定 D／L／W／E、來源單位、P 的 F1／F2／F3、Mx／My 的 M1／M2／M3 與軸向係數；CaseType 缺漏、載重組合、Response Spectrum、Time History、Nonlinear Static、多步驟、重複列或雙軸共用同一彎矩分量都會失敗關閉。工作頁另提供實際匯出檔準備清單，分開標示必要欄位與建議辨識欄位，並要求先確認單位、節點、基本案例及軸向；檔案讀取成功後會立即顯示表頭列、分隔符、節點與案例數，以及缺 CaseType、載重組合、其他 CaseType、多步驟或重複資料的預檢統計。清單、預檢診斷和原始表格都不進計算書或 PDF。P 固定轉為壓力正，基礎 Mx／My 固定採結構支承反力矩的反向作用，再套使用者指定座標倍率；轉接器不猜測分析模型單位或座標方向。外部資料只先形成候選，人工按下採用後才覆寫欄位；原始檔或傳遞內容的 SHA-256、節點、案例集、單位與軸向映射會進入來源追溯，採用後若任何分量被改寫，三維 STM 輸出會失敗關閉，直到重新採用或清除來源。相容性另由 `shared/fixtures/joint-reactions/manifest.json` 管理 7 組合成樣本，涵蓋逗號、Tab、分號、前置說明、欄名別名、引號內分隔符及四種失敗關閉；這些樣本明確不是 CSI 官方檔或工程資料，實際軟體版本仍須以匿名化匯出檔補驗。之後再以 `rc-foundation-pile-cap-3d-stm.v2` 一鍵傳送或下載最多 24 組因數化載重；每組均以同一樁群核心重算反力並獨立驗證正反力、Pu／Mux／Muy 平衡與合力節點範圍。三維頁會逐組計算，將基本分量匯入來源、基本載重分量、組合清冊及 X/Y 拉桿、三維壓桿、柱下／樁頂節點、最小壓桿角、23.4.4 剪力與最大單樁反力的控制值及來源組合列入計算書。舊版 v1 單組 JSON 仍可讀；任一來源數值在匯入後改變即撤銷來源追溯。橋接只承接基礎工具已有的幾何、材料、載重、樁反力及主筋候選，壓桿／節點有效面積、拓樸、局部拉桿分配與錨定仍須在三維 STM 頁確認。多柱、斜樁、拔力樁、水平反力、扭矩、缺角樁群、開孔及任意三維桁架維持明確阻擋；載重轉接、核心、橋接、包絡、瀏覽器與 PDF 回歸已接入 `tools/test-foundation.ps1`。

實際 Joint Reactions 匯出檔不得直接進入測試庫；瀏覽器與 Node 共用的 `shared/joint-reaction-fixture-sanitizer-core.js` 會清除工程識別與原始數值，只保留格式相容性所需結構，CLI `shared/joint-reaction-fixture-sanitizer.js` 再於已忽略的 output 區產生匿名候選檔與 evidence JSON。基礎工具頁讀入 CSV／TSV／TXT 後，可在填寫實際軟體版本並明確確認來源後直接下載 `rc-joint-reaction-browser-intake-package.v1`，不必複製貼上原始表格；包內只有匿名候選、匿名化證據、八項皆未核可的 review 與 receipt。候選與 receipt 檔名只採匿名輸出 SHA-256 前綴，不再留下完整或部分來源 hash。候選狀態固定要求人工檢查保留表頭及版本／表名／單位，通過後才可另行登錄為匿名觀察樣本。

匿名觀察樣本另由 `shared/joint-reaction-fixture-promotion-gate.js` 與獨立 `observed-manifest.json` 管理。升級閘門預設唯讀；只有候選 SHA-256、匿名化 transform、轉接器重播、固定合成數值、人工審閱八項聲明與清冊唯一性全部通過，並明確指定 promote，才會寫入 observed fixture。正式升級會先確認清冊檔及其完整父路徑的 resolved path 與 realpath 一致，拒絕透過符號連結或 junction 導向其他位置；接著取得清冊專用獨占鎖，在鎖內重新評估來源與清冊，預檢 observed 目錄及兩個新檔目標，建立並同步寫入同目錄 backup／next、fixture 與 provenance，再確認鎖及原清冊未被改動後原子替換 manifest；寫後驗證失敗會回復原清冊並移除當輪產物，外部競爭異動則保留且拒絕覆寫。取得鎖前會再次確認 canonical 清冊路徑，評估後若父路徑身分改變即零寫入阻擋。中斷留下的 lock 不會自動略過；先用 `--lock-status yes` 唯讀診斷，只有同一主機、程序已停止、鎖齡至少 10 分鐘、沒有 next／backup／clear 暫存，而且交易不是局部寫入，才會回報可安全清除。清除另須明確指定 `--clear-stale-lock yes` 及診斷當下的完整 lock SHA-256；工具以同目錄原子隔離、位元與雜湊回讀後才刪除，任何競態或內容改變都保留原鎖並失敗關閉。舊版／破損鎖、外地主機、活躍或近期程序、局部交易與復原暫存一律不自動清除；lock、next、backup 與 clear 暫存均由精確 `.gitignore` 規則排除。可提交 provenance 排除原始檔名、路徑與來源 SHA-256，避免工程原始檔留下可比對指紋。公開 Pages 僅發布 foundation 頁執行所需的 load adapter 與瀏覽器匿名化核心；Node sanitizer／intake／promotion gate、人工 review 模板及 fixtures 由發布清冊與 HTTP 負向探針封鎖。

`shared/joint-reaction-observed-intake.js` 是實際匯出樣本的單一收件入口：可用 `--input` 直接產生匿名候選、evidence、預設八項皆未核可的 review 與不含來源路徑／檔名／原始 hash 的 receipt，也可用 `--package "<瀏覽器下載的 intake-package.json>"` 安全解包頁面下載物。解包會重新驗證匿名器固定輸出、候選 SHA-256、檔名與 receipt 連結，拒絕路徑跳脫、額外夾帶欄位及預先核可的 review，再重建四個受控檔案。直接匯入與瀏覽器解包都會先預檢全部四個輸出目標，拒絕符號連結、非一般檔案及既有不同內容；完全相同的重跑保持原位元組不變，寫入中途失敗則回滾當輪新建檔案，不留下可誤認為完整收件的半套結果。以 receipt 重跑時預設只評估；必須在有效 reviewer、reviewedAt 與八項人工聲明全部完成後，另加明確 `--promote yes` 才會呼叫底層升級閘門。合成相容性或 privacy-test 來源即使其他欄位完整，也必須以 `origin-not-observed` 失敗關閉。

本機稽核儀表板會分開顯示 Joint Reactions 合成相容性樣本、已升級的實際匿名樣本、本機 ignored 候選清冊與匿名化升級閘門。合成測試通過不得宣告為任何實際 ETABS／SAP2000 版本已驗證；匿名觀察樣本也只證明清冊所列版本的格式相容性，不影響正式工具成熟度計數。目前沒有實際匿名樣本時，儀表板必須明確顯示實際版本覆蓋尚未證明。

柱報告視覺 smoke 已接在 [tools/test-column.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-column.ps1:1)，並由 [tools/column-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/column-report-visual.contract.test.js:1) 固定測試案例與品質門檻，會以瀏覽器產生計算書，檢查：

- 一般矩形柱、耐震搭接 Class A 不適用改列 B、首支箍筋/外區間距 NG 三種代表報告情境。
- 計算書不得輸出頁面用的「提醒」或「缺漏 / 複核摘要」卡；相關缺漏提示保留在工具頁面。
- 耐震搭接、柱端錨定、橫向鋼筋間距與圍束等技術判定仍需保留在檢核表與規範覆蓋矩陣中。
- 報告表格、規範覆蓋矩陣與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

板報告視覺 smoke contract 位於 [tools/slab-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/slab-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界與輸出證據檔名，避免待確認 / 正式分析需求等 page-only 提示漂移進計算書。

板報告視覺 smoke 已接在 [tools/test-slab.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-slab.ps1:1)，會以瀏覽器產生計算書，檢查：

- 單向板基本例、雙向有梁板、無梁板內柱待頁面確認例與無梁板邊柱保守例四種代表報告情境。
- 板 1 m 寬條帶斷面配筋示意圖需實際進入計算書並完成渲染。
- 單向板係數法、簡化二向條帶初估、雙向衝剪與保守放大警語需出現在報告中。
- 計算書不得輸出頁面用的「待確認」狀態 banner 或「待確認 / 正式分析需求」提示群組。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、圖示與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

基礎報告視覺 smoke contract 位於 [tools/foundation-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/foundation-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界與輸出證據檔名，避免聯合基腳 / 筏基待確認提示或 page-only 閱讀狀態漂移進計算書。懸臂式擋土牆另由 `shared/retaining-base-demand.js` 依線性基底反力分別建立趾版 `0.9D + 1.6H` 與踵版 `1.2D + 1.6H` 淨載重，固定端設計面分別為趾版底層、踵版頂層；地下水、分層回填、Coulomb 垂直分力及扶壁式仍維持待確認，不產生自動底版 OK。

基礎報告視覺 smoke 已接在 [tools/test-foundation.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-foundation.ps1:1)，會以瀏覽器產生計算書，檢查：

- 獨立、聯合、筏式、樁基／樁帽、群樁側向分配、懸臂式擋土牆與扶壁式待確認等八種代表報告情境。
- 樁基報告須揭露土層與單樁承載、群樁構造、服務性與樁身、樁帽結構四類檢核；輸入水平力時另輸出 FHWA / AASHTO p-multiplier、各列與最大單樁水平力。專業 p-y JSON、直接讀取的 CSV／TSV／TXT，或從 Excel 貼上的表格換算結果通過固定單位、樁群模型、分析範圍與實際分析 Hx／Hy 核對且經工程師明確採用後，計算書直接列出位移、剪力、彎矩、容量、分析識別、X／Y 來源檔名、列數與雜湊；LPile 類單樁結果使用代表單樁 p-multiplier 荷重，群樁結果使用整組荷重。已驗證候選可下載為與採用來源 SHA-256 相同的 JSON 並重新匯入；匯入上限為 1 MiB。採用紀錄 v2 會把來源原文保存在專案內，重開後仍可下載；舊 v1 仍可計算但無法重建缺少的來源檔。候選後續遇模型變更，或來源原文與採用結果不一致時，下載與採用均會失敗封閉；未採用相符結果時維持 NG。
- 懸臂式擋土牆報告須揭露 qmin 全寬接觸、趾版底層與踵版頂層之 Mu、Vu、As、φMn 與 φVc；需求核心另由 `shared/retaining-base-demand.test.js` 做純數值回歸。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格與逐層承載力表不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

單樁報告視覺 smoke contract 位於 [tools/single-pile-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/single-pile-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界、人工複核段落與輸出證據檔名，避免頁面專用提醒或人工複核結論漂移。

單樁報告視覺 smoke 已接在 [tools/test-single-pile.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-single-pile.ps1:1)，會以瀏覽器產生單樁計算書，檢查：

- 預設一般工程模式、BH-5 規範模式與細部參數需人工複核三種代表報告情境。
- 計算書須揭露採用方案、土層與單樁承載、服務性與樁身、規範假設檢核。
- 細部參數需人工複核時，計算書須列出「人工複核 / 補充資料需求」，並明示不列為 OK 結論。
- 土層與單樁採用深度示意圖需實際進入計算書並完成渲染。
- 逐層承載力表與候選方案矩陣需進入報告計算過程。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、示意圖與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

牆報告視覺 smoke contract 位於 [tools/wall-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/wall-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界與輸出證據檔名，避免地下室外牆或 SBE page-only 提示漂移進計算書。

柱、一般牆與特殊結構牆共用 `shared/pmsection.js` 的單軸應變相容核心。112 年版規範 21.2.2 的強度折減轉換採 `εty=fy/Es` 至 `εty+0.003`；RC 柱雙軸角度掃描與本機備援路徑採同一門檻，避免不同鋼筋等級仍固定套用 0.002／0.005。

牆報告視覺 smoke 已接在 [tools/test-wall.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-wall.ps1:1)，會以瀏覽器產生計算書，檢查：

- 結構牆耐震與地下室外牆面外兩種代表報告情境。
- 牆水平斷面配筋示意圖需實際進入計算書並完成渲染。
- 條文對照與方法分級、面外 P-Δ、SBE 延伸與地下室外牆土壓概算需出現在報告中。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、圖示與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄。

剪力牆 suite 入口為 [tools/test-shear-wall.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-shear-wall.ps1:1)，會同步檢查：

- `shared/pmsection.test.js`
- `shared/loadcases.test.js`
- `shared/wall-base.test.js`
- `shared/wall-evaluator.test.js`
- `tools/shear-wall-regression.test.js`

剪力牆報告視覺 smoke contract 位於 [tools/shear-wall-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/shear-wall-report-visual.contract.test.js:1)，固定檢查 visual smoke 案例、wrapper wiring、頁面附件閱讀狀態邊界與輸出證據檔名，避免案例清單或 page-only 邊界漂移。

剪力牆報告視覺 smoke 入口為 [tools/test-shear-wall-report.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-shear-wall-report.ps1:1)，會以瀏覽器產生計算書，檢查：

- 正常耐震牆與 Pu 軸力越界兩種報告情境。
- P-M 圖與牆斷面圖在計算書內有實際渲染。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 軸力越界時須明確呈現 `c@Pu 不採用` 與 `不適用`，不得誤列為 OK 結論。
- 輸出 PNG、PDF（含文字抽檢）與 JSON 稽核紀錄，並確認列印時 toolbar 隱藏。

## 執行方式

單次巡檢：

```powershell
.\audit-tool.ps1 -Quiet
```

只執行 RC STM 獨立工程基準：

```powershell
node .\tools\rc-stm-independent-engineering-gate.test.js
```

循環巡檢：

```powershell
.\audit-tool.ps1 -Quiet -Loop -IntervalSeconds 60
```

也可直接雙擊：

```text
run-audit.bat
run-audit-loop.bat
```

單跑剪力牆 suite：

```powershell
.\tools\test-shear-wall.ps1
```

單跑 shared common helper 單元測試：

```powershell
node .\shared\common.test.js
```

單跑 shared 案件存讀檔單元測試：

```powershell
node .\shared\project-storage.test.js
```

單跑梁回歸測試與報告視覺 smoke：

```powershell
.\tools\test-beam.ps1
```

單跑深梁 STM 核心、瀏覽器與 PDF 回歸：

```powershell
.\tools\test-deep-beam-stm.ps1
```

單跑基礎深梁／樁反力群二維 STM 核心、瀏覽器與 PDF 回歸：

```powershell
.\tools\test-foundation-deep-beam-stm.ps1
```

單跑樁帽三維 STM 核心、基礎工具一鍵橋接、瀏覽器與 PDF 回歸：

```powershell
.\tools\test-pile-cap-3d-stm.ps1
```

單跑柱回歸測試與報告視覺 smoke：

```powershell
.\tools\test-column.ps1
```

單跑板回歸測試與報告視覺 smoke：

```powershell
.\tools\test-slab.ps1
```

單跑牆回歸測試與報告視覺 smoke：

```powershell
.\tools\test-wall.ps1
```

單跑剪力牆報告視覺 smoke：

```powershell
.\tools\test-shear-wall-report.ps1
```

單跑基礎回歸測試與報告視覺 smoke：

```powershell
.\tools\test-foundation.ps1
```

單跑單樁回歸測試與報告視覺 smoke：

```powershell
.\tools\test-single-pile.ps1
```

單跑 RC 補強報告視覺 smoke：

```powershell
.\tools\test-retrofit-report.ps1
```

單跑首頁入口瀏覽器 smoke：

```powershell
.\tools\test-rc-index-menu.ps1
```

單跑 RC 專案 JSON／計算書指紋一致性 contract（含實檔組包）：

```powershell
node .\tools\rc-project-fingerprint.contract.test.js
```

## 維護品質門檻

- 完整 audit 的單一子 gate 若且唯若精確回報 Chromium `net::ERR_NO_BUFFER_SPACE`，會保存首次失敗 log、冷卻 60 秒並完整重跑一次；其他錯誤不重試，第二次仍失敗即停止，不能把重試視為通過或省略任何案例。

新增或重構共用計算核心時，應同時完成：

- 純函式 shared module，不直接依賴 DOM。
- 對應 shared `*.test.js`，涵蓋數值黃金案例、邊界條件與警示/待確認語意。
- 頁面 regression 守衛，確認 HTML 載入相對路徑、沒有重複內嵌核心公式、報告與摘要會呈現關鍵判定。
- 新增或調整首頁入口時，需同步更新首頁選單 contract 與首頁入口瀏覽器 smoke。
- 正式 `audit-tool.ps1` 必須接上該 suite；不能只依賴手動 `node` 測試。
- 新增 regression、report visual、browser smoke 或 shared test 時，需確認檔案沒有被 `.gitignore` 擋掉，並納入稽核狀態 contract。
- 若頁面輸出會影響使用者判讀，需以瀏覽器 QA 驗證摘要、報告與可見文字沒有 `NaN` / `Infinity` / 誤導性 OK。
- 完成後至少跑 `git diff --check`、對應 suite、`audit-tool.ps1 -Quiet`；跨工具影響時再跑根目錄 `preflight-tools.ps1 -Quick`。

## 輸出位置

- RC 巡檢摘要：`鋼筋混凝土/output/audit/audit-summary.md`
- RC 巡檢 JSON：`鋼筋混凝土/output/audit/audit-summary.json`
- RC 首頁狀態：`鋼筋混凝土/output/audit/audit-status.json`
- RC 歷史紀錄：`鋼筋混凝土/output/audit/history/<runId>/...`
- 瀏覽器報告證據：`output/playwright/*-report-*.png`、`output/playwright/*-report-*.pdf`、`output/playwright/*-visual-audit.json`
- 根目錄 preflight 摘要：`output/preflight/preflight-summary.md`
