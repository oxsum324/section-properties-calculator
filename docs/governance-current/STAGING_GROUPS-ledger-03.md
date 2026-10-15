# docs/governance-current/STAGING_GROUPS-ledger-03.md

<!-- P2-BOOK:docs/governance-current/STAGING_GROUPS-ledger-03.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

<!-- P2-SEGMENT:SG-03-001 -->
```

建議提交訊息：

```text
Replace anchor dialogs with in-app confirmations
```

## 正式附件包進度觀測

調整 `attachment-package-build.js` 的建立階段事件時，需連同組包單元測試與三份治理文件 staging。階段事件只屬旁路觀測，任何執行中事件寫入錯誤都不得中止或改寫核心結果；觀測端可保留最後已驗證階段，但已成功發布的附件包不得因後續進度通知失敗而誤報失敗。測試必須至少涵蓋發布完成後的 `complete` 通知失敗。

## 首頁正式放行日期來源

調整首頁狀態或 release 快照時，需一併 staging `結構工具箱/assets/home/home.js`、`toolbox-entrypoints.contract.test.js` 與三份治理文件。`HOME_TOOL_UPDATES` 不得保存人工 fallback 正式放行日；執行期只可接受 passing、非 quick、兩個 force 旗標成立、來源 commit 可辨識且乾淨的 tracked preflight snapshot。契約須固定未載入提示與正式快照導入路徑，避免 release 狀態提交跨日後產生首頁落後日期。

正式 release 新鮮度不得沿用四類一般巡檢的最新時間。dashboard 只能以 tracked 正式 preflight 快照計算 7 日／30 日提醒，並透過 schema v3 `pages-deployment.json` 核對 carrier commit、Actions run、release run 與 tested source；年齡屬提示，身分對齊才是公開部署可信度的必要條件。

## 下次提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
.\run-pages-artifact-smoke.ps1
.\push-pages-release.ps1 -VerifyOnly
git diff --check
git status --short --untracked-files=normal
```
### 獨立工程基準

- Gusset V1 沿用 `/steel-formal` 路由，不增加正式入口分母；`independent-engineering-adapters/steel-formal.js`、catalog、runner 與測試必須同批加入獨立 Gusset／平板支撐強度、單列 L 形區塊剪力與派生面積 oracle，以及壓力、正負偏心、Whitmore 首末栓長度與可用板寬限制等負向案例。oracle 不得讀取 production golden expected，且不得把此限定代表案擴張成耐震、BRB、壓力、角鋼／WT／HSS 或任意接頭拓樸驗證。
- 鋼索頻率法納入後，獨立基準正式入口為 39 / 39，local-quick 工具家族為重疊的 6 / 6；`cable-tension-frequency` 頁面、core、core regression、`independent-engineering-adapters/cable-tension-frequency.js`、catalog、runner、測試與成熟度合約必須同批 staging，不得只提交 golden regression 或公開頁。這批負向證據須包含嚴格數字、正安全整數 `mode`、finite／正值及溢位／下溢失敗關閉，獨立閉式 oracle 不得取代 production core 的型別與安全閘門。
- 正式入口為 40 / 40；深梁、基礎二維與樁帽三維 STM 各有 1 個代表性強度案升為正式路由基準，其餘 supplemental candidate cases 21 / 21、candidate capabilities 3 / 3；整體 STM suite 維持 24 / 24 案與 564 項獨立斷言。每個能力包含五個 `strength-pass` 與三個 `strength-reject`，整體合計預期合格 15 / 15、預期拒絕 9 / 9；除代表性與隔離拒絕案外，另以「略低／等於／略高」三案及「負裕度在 EPS 內／剛超出 EPS」兩案鎖定 25° 壓桿角度、23.4.4 剪力容量及 X/Y 拉桿層容許錯位，並分開核對帶號裕度、等號允收及浮點容許差。STM adapter、catalog、runner、測試及三個 production core 必須同批檢視；`鋼筋混凝土/audit-tool.ps1`、`tools/rc-stm-independent-engineering-gate.test.js`、audit status contract、`preflight-tools.ps1` 與跨工具 release contract 也須同批 staging，確保 RC 本地巡檢與平台 gate 都核對 24 / 24、564 及 false acceptance／false rejection。正式入口升級只適用已聲明的限定拓樸，不得被解讀為所有 STM 拓樸均已驗證。
- `結構工具箱/tools/independent-engineering-benchmarks.catalog.json`
- `結構工具箱/tools/independent-engineering-benchmarks.js`
- `結構工具箱/tools/independent-engineering-benchmarks.test.js`
- `結構工具箱/tools/independent-engineering-adapters/cable-tension-frequency.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-column-pm.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-beam-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-stm-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-shear-wall-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-wall-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-retrofit-section.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-foundation.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-pile.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-beam-asd.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-column-asd.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-plate-connection.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-formal.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-slab-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-force-mwfrs.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-solid-table210.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-cc.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-parapet.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-open-roof.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-frame.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-lattice-tower.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-tower.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-fence-sign.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-sign-pole.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-force-static.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-appendage.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-misc.js`
- `結構工具箱/tools/independent-engineering-adapters/anchor-cast-in.js`
- `鋼構工具/core/materials/steel.js`、`steel-beam-formal.html`、`steel-beam-formal.js`、`steel-column-formal.html`、`steel-column-formal.js`、`steel-formal.regression-test.js`
- `結構工具箱/core/loads/wind.js`、`結構工具箱/tools/風力/wind-force.html`、`結構工具箱/tools/風力/wind-cc.html`、`結構工具箱/tools/風力/wind-sign-pole.html`、`結構工具箱/tests/wind.test.js`、`結構工具箱/tools/formal-tools.contract.test.js`
- `結構工具箱/core/loads/seismic.js`、`結構工具箱/tools/地震力/seismic-force.html`、`結構工具箱/tools/地震力/seismic-misc.html`、`結構工具箱/tests/seismic.test.js`
- `螺栓檢討/bolt-review-tool/src/calc.ts`、`calc.test.ts`、`defaults.ts`、`backup.ts`、`螺栓檢討/anchor-report.contract.test.js`
- `鋼筋混凝土/shared/foundation-isolated.js`、`foundation-isolated.test.js`、`foundation-pile.js`、`foundation-pile.test.js`、`flexure.js`
- `鋼筋混凝土/shared/slab-evaluator.js`、`slab-evaluator.test.js`、`鋼筋混凝土/tools/slab.html`、`slab-regression.test.js`、`test-slab.ps1`
- `鋼筋混凝土/shared/wall.js`、`pmsection.js`、`wall-inplane-evaluator.js`、`鋼筋混凝土/tools/wall.html`、`wall-regression.test.js`、`test-wall.ps1`
- `RC補強斷面性質.html`、`鋼筋混凝土/tools/retrofit-report-visual.test.js`、`retrofit-report-visual.contract.test.js`、`test-retrofit-report.ps1`
- `鋼筋混凝土/tools/foundation.html`、`foundation-regression.test.js`、`foundation-regression-cases.json`、`single-pile-designer.html`、`single-pile-regression.test.js`、`test-foundation.ps1`
- `石材固定/石材計算書產生器_規範版V2.html`、`石材固定/js/constants.spec.js`、`石材固定/js/calculator.spec.js`、`石材固定/tests/visual_decoration_test.py`、`石材固定/tests/ci_summary.py`、`石材固定/tests/run_all_tests.bat`、`石材固定/tests/README.md`、`結構工具箱/tools/independent-engineering-adapters/stone-fixing.js`
- `結構工具箱/tools/tool-maturity-matrix.js`
- `preflight-tools.ps1`
- `結構工具箱/tools/release-readiness.contract.test.js`
- `README.md`、`TOOL_BOUNDARIES.md`、`TOOL_REPORT_GUIDE.md`

此組需一起提交，避免只有測試案例卻沒有 production core、preflight、成熟度與報告邊界。完整通過標示 40 / 40 個正式入口；golden case 或同核心結果鏈不等同獨立工程驗證，也不得算入獨立覆蓋。第十九條路由為正式區域風壓 C&C，獨立核對 18 m 高度界線、部分封閉內壓高度及屋面角隅負壓提前收斂；第二十條路由為正式女兒牆風壓，獨立核對 MWFRS 式 2.3、圖 3.4 與圖 3.5 三條設計路線；第二十一條路由為正式開放式屋頂風壓，獨立核對單斜／雙斜屋頂、有／無阻擋、小／中／大有效面積、坡度直接取值／內插及 10° 高度切換；第二十二條路由為正式中空式／格子式風力，獨立核對表 2.11 圓形低／高 D√q(z) 與平邊構材三條路線、三種實體率帶、等效寬度及底部作用；第二十三條路由為正式格構式高塔風力，獨立核對表 2.15 四段基本係數、構材／斜風向修正與完整分段剪力／彎矩力流；第二十四條路由為煙囪／水塔風力，獨立核對表 2.12 斷面路線、h/D 邊界、圓形 D√q(z) 分流、形狀修正、頂部附加物與完整分段力流；第二十五條路由為圍牆／標示物風力，獨立核對表 2.10 地面與高架雙路線、低高界夾制、內插、專案 C_f 採用值、實體率修正及底部作用；第二十六條路由為獨立式招牌／燈桿風力，獨立核對表 2.10 面板、表 2.14 圓管門檻、表 2.13 角柱四個細長比區間、支柱分段力流及組合底部作用；第二十七條路由為 RC 一般牆，獨立核對承重／非承重／地下室／結構牆厚度、Wall Pier、完整 P–M、簡式失敗關閉、αc 內插、配筋與地下室側壓雙模型；第二十八條路由為 RC 補強斷面，獨立核對梁底貼 CFRP、CFRP／鋼板 U 型包覆、脫層、轉換斷面、剪力上限、柱圍束軸壓與 P–M；第二十九條路由為鋼構正式主工具，獨立核對主工具連接板、螺栓拉力構件、單剪力板、平板支撐 Gusset、梁柱彎矩接頭與全斷面 CJP 耐震柱續接，以及其限定的雙側縱向填角銲與 ASD 全滲透開槽銲；梁柱彎矩只涵蓋已登錄單一選定構架面的 Mpr／MprFar／Vp、六項強度與強柱弱梁，柱續接只涵蓋同材同斷面全斷面 CJP 的 Eamp、七項強度與細部閘門，不涵蓋 AISC 358 預認證、正交構架面、完整接頭設計、PJP／螺栓式／箱型／組合構材／jumbo 柱續接或完工驗收；第三十條路由為覆工板系統，獨立核對一般載重與長柱／未側撐重載兩案的板面、大小梁、共構柱、握裹與樁基完整受力鏈；第三十一條路由為石材固定，獨立核對背扣／插銷、風震需求、有效固定點、錨栓容量與折減、角鋼、板材局部、層間變位與熱伸縮；第三十二條路由為包覆型 SRC 梁，獨立核對撓曲、寬厚比、鋼骨／RC 剪力分擔、一般剪力、剪力摩擦與失敗控制；第三十三條路由為包覆型 SRC 柱，獨立核對斷面幾何、寬厚比、剛度分配、鋼骨受壓與壓彎互制；第三十四至第三十六條路由分別為 RC 深梁、基礎深梁二維與樁帽三維 STM，獨立核對其限定拓樸的代表性強度案；第三十七條路由為地坪 Westergaard，獨立核對內部／邊緣／角隅載重應力、相對勁度半徑與等效接觸半徑；第三十八條路由為柱保護層偏差強度評估，獨立建立四面筋位、應變相容、等值壓力塊與固定 Pu 根解，不讀 production golden answer。第三十九條路由為鋼索索力頻率法快算，以非完美且不連續振型獨立核對過原點擬合、N／kN 單位換算、逐模態殘差與目標區間，不讀 production golden answer。第四十條路由為平面剛架，以懸臂端點力閉式解獨立核對位移、支承剪力與彎矩，並由 production adapter 直接執行頁面求解器。既定 P0／P1 基準路由已完成；分析摘要身分的 `/seismic-dynamic` 不得計入正式附件入口覆蓋。

開挖證據鏈組包：調整 ERH／RVR／SEV／SCV／RTB 原生分類時，必須同批 staging `attachment-package-check.js`、檢查／組包／事後驗證測試、開挖 traceability catalog／contract、SCV 說明、README 與 `TOOL_BOUNDARIES.md`。測試須證明完整鏈可進 v3 包的內部追溯區並通過事後複驗，缺檔／雜湊／指紋／採用狀態矛盾 blocked，孤立或重複引用 review，且治理 JSON 不得進正式附件區。組包關係檢查不冒充 Python 受控內容或 Ed25519 簽章驗證。

Schema v25 正式 Excel 雙封印：錨栓 `reportWorkbookSeal.ts`、獨立 `結構工具箱/tools/xlsx-seal-verifier.js` 與 `結構工具箱/tools/xlsx-seal-verifier.test.js`、附件組包檢查、release aggregate、成熟度矩陣、首頁完成數、Pages 私有邊界、錨栓部署鏡像與四份治理文件必須同批 staging。測試須分別證明內容／公式／快取結果竄改與文件狀態／核可時間／計算指紋／內容 SHA 竄改失敗關閉；公開資料不得含封印值、工作表內容或竄改樣本。

Schema v27 RC STM 補充正式附件：深梁、基礎深梁與樁帽三維 STM 的三個頁面、browser／PDF regression、`report-portable-html-check.js`、`report-screenshot-quality.js`、rendered inventory／aggregate、成熟度矩陣、release contract 與四份治理文件必須同批 staging。當輪 `rc-stm-formal` 必須保存內部審閱 PDF／PNG、核可 HTML、獨立列印 PDF與逐工具 evidence JSON；release 要求附件 `3/3`、實體成品 `12/12`，並重驗計算指紋、離線重開、內容／核可雙封印與兩類竄改阻擋。三者維持 RC 梁／基礎流程內子工具，不增加首頁正式工具數。

RC STM 的跨工具邊界必須連同 RC 梁最小／最大配筋與多排筋核心、對應回歸案例與獨立工程基準、LoadCombo／ForcePicker 契約，以及平面剛架 V1.6 產生 D／L／W／E 支承反力分量的頁面、contract、metadata 與共用列印依賴同批 staging。前述發送端、中介格式、接收端、重算核心與證據不得分批。

鋼構同步 manifest 的 Pages 私有邊界：`鋼構工具/core/formal-core-manifest.json` 保存工作站絕對路徑與同步雜湊，只供本機 audit，不是公開 runtime。調整此邊界時必須同批 staging `結構工具箱/tools/build-pages-artifact.js`、`結構工具箱/tools/pages-live-smoke.js`、`pages-release-governance.contract.test.js`、`toolbox-entrypoints.contract.test.js`、README 與 `TOOL_BOUNDARIES.md`；測試須同時證明 builder 精確排除、HTTP 私有路徑非 200，且實際暫存 artifact 不含本機帳號或工作區絕對路徑。

## 現況鑑定會勘簽認 V0.30.0

V0.30.0 會勘簽認階段 A：`field-survey/signoff.js`、`signoff-ui.js` 與現有紀錄、備份、附件頁碼整合；新 runtime 要進 `sw.js` 和 `release.mjs`。資料庫及備份格式 17，舊案件檔仍可讀；更新前關閉其他開著的舊視窗。`結構工具箱/tools/build-pages-artifact.js` 與 `pages-release-governance.contract.test.js` 同批檢查簽認 HTML、簽名資料包、範本 JSON 的改名私密輸出。發布只含程式，簽認案例及 PNG 均留在私有案件與 `output/`。實體 iPhone／Android 檢核待使用者試用，不得以模擬標記完成。

V0.30.1 調整觸控簽名入口與姓名選填。IndexedDB 及 `.csurvey` 版本 18，讀取 1～17；以 V0.30.0 實際已發布提交做升級來源，確認舊視窗拒寫、舊案件保存與離線更新。公開成品仍只疊加 `field-survey/` 執行檔；使用者簽名資料不進 Pages。

V0.30.2 將簽認作廢原因由瀏覽器原生 `prompt` 改為簽認視窗內的必填欄位（`field-survey/signoff-ui.js`、`app.css`），使 `browser-dialogs.contract.test.js` 通過；作廢資料仍為 `voided = { at, reason }`，IndexedDB 及 `.csurvey` 版本維持 18。`tests/v030-browser.js` 改以畫面操作驗證空白原因擋存、取消不變動及確認作廢。

V0.30.3 在現場紀錄固定上方加入手動螢幕常亮開關，使用瀏覽器 Screen Wake Lock；顯示真正取得、暫停或失效的狀態，切離頁面後返回會重新嘗試。無支援或遭省電設定拒絕時提示手機自動鎖定設定。IndexedDB 及 `.csurvey` 維持 18；`tests/v0303-browser.js` 驗證開關、回到前景、系統收回與拒絕。

## 現況鑑定現場紀錄 V0.7.0

本次包含 `field-survey/report.js`、`report-ui.js` 與 `tests/report-browser.js`：U 型裂縫條數不列總長、磁磚塊數、房間整理、各照片機位與主照片／附件選片、同步流水號與獨立 HTML／列印 PDF。新備份版本 3，資料庫版本 3，舊資料保留。另同步 `結構工具箱/tools/build-pages-artifact.js`、`結構工具箱/tools/pages-live-smoke.js` 及 `pages-release-governance.contract.test.js`；附件 HTML 與 JSON 編號對照是私人案件輸出，不得發布。公開只有產生附件的程式。

本組只加入現場紀錄工具、首頁入口與驗證，不改既有結構計算結果。原始研究及個案資料留在忽略發布的 `output/`。

```powershell
<!-- P2-SEGMENT:SG-03-002 -->
```

`field-survey/tests/` 及 README、package.json 依既有 artifact 規則排除；公開只包含操作頁、程式、樣式、離線資源清單及圖示。

本組 preflight 執行入口：`field-survey/tests/model.test.js`、`field-survey/tests/browser.test.js`。

備份的發布排除與改名偵測一併交付：`結構工具箱/tools/build-pages-artifact.js`、`pages-release-governance.contract.test.js`。所有 `.csurvey` 及 `-核對收據.json` 排除發布；改名後仍以資料包標頭或 JSON kind 阻擋。

首頁新增工作流卡片後，同步維護 `結構工具箱/tools/public-status-claims.contract.test.js` 與 `結構工具箱/tools/local-quick-browser-smoke.test.js` 的 52 項入口檢查。主頁使用 `field-survey/recorder.html`，維持 clean URL 下相對資源位置一致。

`.gitignore` 也忽略案件備份與核對收據，避免一般 Git staging 收入私人資料。
# 2026-10-03：T3 計算操作整合

T3 同包提交共用 workflow、一般頁 adapter、41 入口接線與快捷鍵測試；錨栓同包包含 React 來源及 `sync-anchor-deployment.ps1` 的產物。入口清冊由發布分流排除，測試證據保留於 `output/`，不提交。T2 報表純函式、T4 鋼構計算書 renderer 與 T5 文書匯出仍各自分包。

T4 提交共用報表 presentation API、鋼構專用正文接線、同步副本／manifest 與相容性、九案證據鏈測試；不混入 T5 DOCX adapter。正式附件資格與公開放行仍由原治理流程決定。

T4 同包包含附件可見性解析器、其隱藏正文負向案例，以及 `steel-report-package-contract.js` 的 Pages 私有排除；來源完整性為定向驗收 wrapper 的條件，不修改通用組包的來源政策。

## 2026-10-03：T5 真正 DOCX 文書版

T5 同包提交共用 report-docx、core／鋼構同步副本與 RC 獨立 adapter、45 份 renderer 消費頁的輕量依賴、首頁依賴登錄、附件檢查器 DOCX 非正式辨識及負向契約。沿用已追蹤的 docx 9.6.1 vendor 與 MIT LICENSE，不新增 CDN。一起提交 DOCX 單元／整合／瀏覽器／合成文件入口與 Word 渲染入口；產生的 DOCX、HTML、PDF、PNG、trace 及案例只保留 ignored output，不加入 Pages 或提交。T6 首頁介面與效能仍另包。

## 2026-10-03：T6 首頁品質

T6 同包提交首頁 HTML／CSS／JS、sync-home-initial-view.js 及其精確 Pages 私有排除、homepage-quality.browser.test.js 與 PowerShell 入口／依賴準備。量測相依版本固定為 Lighthouse 13.5.0、Playwright 1.63.0、axe-playwright 4.13.0，package／lock／報告保存在 ignored output；固定三輪取中位數且保留全部分數及錯誤。未證明主腳本解析為主要瓶頸，因此不拆工具清冊；不修改 assets/status 與 public-release JSON、不執行正式預檢或發布。

## 2026-10-08：第四階段 T12～T16（按需載入、本機服務辨識、圖像、無障礙、別名）

T12-A／B 同包提交石材 HTML 與 `ui_smoke_test.py`；T12-C 同包提交鋼構 `app.js`、兩個入口 HTML 與 `mathjax-lazy-load-smoke.py`；T13 同包提交石材 HTML、`server.py`、`server_smoke_test.py`、`self_check.py`、`local-server-probe-smoke.py`；T14 同包提交 `earth-pressure.html`、鋼構 `app.js` 與 `sketch-presentation-smoke.py`；T15 同包提交 `tool-page-a11y.js`、瀏覽器測試、PowerShell 入口與 40 頁 script 接線（a11y 腳本一律在 `project-meta-profile.js` 之前）；T16 同包提交 `home.js` aliases、入口契約與 local-quick smoke。Python smoke、`.ps1` 與 `*.test.js` 依既有私有後綴規則不進 Pages；`tool-page-a11y.js` 為公開執行期。

<!-- P2-SEGMENT:SG-03-003 -->

## 2026-10-08：第五階段 T18（V3 26 條快速門檻執行器）

T18 提交根目錄 `run-phase-gates.ps1`、`run-phase-gates.contract.test.js`、README 與治理文件。執行器直接解析 `_tmp/派工/小工具優化派工指示-20261008-V3.md` 第 0 節命令區塊，不複製或改寫清單；`-SelfTestFailure` 僅供故障記錄契約測試，不屬正式 26 條清單。每次 package 先提交再執行，輸出 `output/phase-gates/`；output 與回報資料夾忽略、不 staging、不發布。

```powershell
<!-- P2-SEGMENT:SG-03-004 -->
```


## 2026-10-08：第五階段 T19（40 頁 × 2 viewport axe 違規歸零）

T19 清除基線中 26 條缺少 main landmark 的正式頁與空表頭違規，並為共用表頭、覆工板狀態列及石材工址列補上具名稱的 region；石材報表引用標題維持原視覺樣式並調整語意層級。無障礙瀏覽器測試對 40 頁 × 2 viewport 的每一項 axe violation 設為失敗，另檢查恰有一個 main 與 H1。首頁清冊已含 40 頁 tool-page-a11y.js；另將石材工址執行期登錄於該路由更新依賴。

```powershell
<!-- P2-SEGMENT:SG-03-005 -->
```


## 2026-10-08：第五階段 T20（計算書 popup MathJax 與離線 fallback）

T20 將計算書 popup 改為共用 Blob HTML 導覽，修正 Edge 空白 popup `document.write` 不發出外部腳本請求；只在正文含公式時才啟動 MathJax，逾時／載入失敗顯示共用可讀 fallback，RC 仍由獨立報表 factory 呼叫共用 utility adapter。下載 HTML 由產品按鈕實際落盤後以 `file://` 離線重開，核對 fallback、文件類別與內容／核可封印。`report-mathjax-popup.browser.test.js` 使用明示 loader stub（不代表真實公式排版），另外保留真實 route.abort 與 production 12 秒無回應案例的所有 console/page errors；Edge 原生 `ERR_INTERNET_DISCONNECTED` 與「零 console error」指標衝突時，測試及回報必須標示未通過並列原始錯誤。

```powershell
<!-- P2-SEGMENT:SG-03-006 -->
```

## 2026-10-08：第五階段 T21（測試穩定性）

T21 同包提交鋼構報表同步重算與真瀏覽器同快照檢查、石材 server smoke 的 UUID 暫存與受限清理重試，以及本機服務探測的靜默 TCP 負向案例。`--probe-only` 僅驗服務探測；完整入口仍含 UI smoke，既有 `badMethods=4` 失敗不得被 probe-only 通過取代。既有報表五連跑與三次一般權限 server smoke 證據引用於 T21 回報；不把 ignored output 或 `_tmp/派工/回報` 納入版控。

```powershell
<!-- P2-SEGMENT:SG-03-007 -->
```

## 2026-10-08：第五階段 T22（core／RC 報表漂移契約）

T22 以九組內嵌 approval script marker 比對必要等價區段；lexer 忽略註解與排版空白，保留識別符、運算子、字串、樣板與正規表示式 token，負向自測涵蓋字串差異、程式差異、marker 缺漏／重複及 comment-like literal。序列化移除清單、family seal adapter 與 popup presentation 差異記入 map 並維持 core／RC 分治。report-core-parity-map.json 以 Pages 精確清單排除，契約測試依 .test.js 後綴排除；live smoke 對兩者探測私有 404。

<!-- P2-SEGMENT:SG-03-008 -->

## 2026-10-08：第五階段 T23（家族慢測統一執行器）

`run-family-wrappers.ps1` 與 `run-family-wrappers.contract.test.js` 一起提交；tracked 清單以 repo-relative 路徑加 `$PSScriptRoot` 定位，清單順序固定為 10 個 RC PowerShell wrapper、鋼構 `run-audit.bat`、連續梁 PowerShell wrapper、剛架與 local-quick Node smoke。執行輸出與摘要只寫 ignored `output/family-wrappers/`，14 個 child 序列執行，失敗仍保存 stdout／stderr log 並計入總失敗。新增 `report-popup-fixture.test.js` 配合 beam／column／slab regression、steel audit runner 與 local-quick 中採 Blob 導覽的 legacy 報表案例：測試替身讀取真實 HTML Blob、等候 Blob URL 文件 load 後再觀察 autoPrint，保留既有 HTML、來源、popup 回傳及 focus／print 斷言，不修改 production Blob 導覽。六個獨立 local-quick 工具仍以原 `document.write` 測試替身覆蓋原有輸出 API。所有新增 `.ps1`／`.test.js` 檔依私有後綴規則排除 Pages。

```powershell
<!-- P2-SEGMENT:SG-03-009 -->
```

## 2026-10-09：第五階段放行前修正（工址列 core／vendor 同步、staging 覆蓋佔位符）

第五階段 T19 只在 `石材固定/vendor/loads/project-location.js` 把共用工址列改為具 `aria-label` 的 `section`，未同步到來源 `結構工具箱/core/loads/project-location.js`，正式預檢 `regulatory-data-contract` 的 SHA-256 同步比對因此失敗；修正方式是把同一變更寫回 core，再以 `結構工具箱/tools/sync-stone-regulatory-vendor.js` 重新產生 vendor 副本，並重跑 `sync-home-update-dates.js`（五條風力／耐震路由與石材頁更新日）。另 `preflight-tools.ps1` 的 staging 覆蓋檢查改為略過含 `<`、`>` 佔位符的行內路徑（例如時間戳目錄），避免 `Test-Path` 擲回不合法字元。vendor 檔必須由同步腳本產生、不得手改。

```powershell
<!-- P2-SEGMENT:SG-03-010 -->
```

## 2026-10-09：第六階段 T27（規範鏡像與首頁日期門檻）

T27 將 V3 第 0 節命令區塊末尾追加規範資料 core／vendor 同步契約與首頁日期唯讀檢查，執行器及逐字清單契約同步要求 28 條，保留隔離故障注入的非零退出驗證。V3 與每包回報位於 ignored `_tmp/派工/`，只更新本機權威清單，不強制加入版控；summary.json 留在 ignored `output/phase-gates/`。每包最終提交後在乾淨樹執行全部門檻，不改正式預檢或公開狀態。治理文件行內輸出路徑以實際目錄表示，不含角括號佔位符。

```powershell
<!-- P2-SEGMENT:SG-03-011 -->
```

## 2026-10-09：第六階段 T24（無障礙公開執行期確定性壓縮）

可讀 source 僅新增必要註解，固定 Terser 5.44.0 建置原 `tool-page-a11y.js`，由 16,500 bytes 降至 9,972 bytes，減少 6,528 bytes；公開檔名、40 頁相對引用及 script 順序不變。source／build 精確列入 Pages PRIVATE_FILES；build contract 依測試後綴排除。`.gitattributes` 固定生成檔與 source 為 LF，避免 Windows checkout 換行造成逐位元組檢查漂移。Terser 只安裝於 ignored `output/playwright/phase2-quality-deps/`，版本、manifest 與 lock 由既有依賴入口核對，套件及 package／lock 不 staging。

首頁維持公開 JS 並將 source 同時加入相同 40 條路由更新依賴；先提交以取得真實來源日期，再在乾淨樹執行日期同步並 amend 同一任務提交，最終乾淨樹 `--check` 無差異。V3 命令區塊末尾追加 `node tool-page-a11y-build.contract.test.js` 為第 29 條；每包門檻完整重跑，T24 另跑 40 頁 × 2 viewport 無障礙、52 頁載入預算及 14 組家族慢測。載入量與原始 sourceDrift 如實回報，不重設基準。

```powershell
<!-- P2-SEGMENT:SG-03-012 -->
```

## 2026-10-09：第六階段放行前（14 頁補 icon link、載入預算基準重設）

40 個正式工具頁中有 14 頁（風力 9、耐震 3、地坪 Westergaard、鋼索頻率法）未宣告 `<link rel="icon">`，桌機瀏覽器會自動請求 `/favicon.ico` 並在 console 留下 404；比照其餘 29 頁在 `<title>` 之後補 `<link rel="icon" href="data:,">`，不影響 script 順序與無障礙結果。載入預算基準經委託人授權以 `--write-baseline` 重設為第五／六階段現況（52 路由 17,789,913 → 18,128,164 bytes；增量來自已上線的第五階段共用報表模組，第六階段 a11y 執行期每頁減 6,528）。基準 JSON 只能由該指令產生，不得手改。

```powershell
<!-- P2-SEGMENT:SG-03-013 -->
```

## 2026-10-10：第七階段 T28（連續梁 Firebase 按需載入）

連續梁頁保留原 Firebase 11.6.0 網址、設定與 `beam_saves` 資料流程，將兩個模組延後至首次雲端儲存／載入操作，並以共用 Promise、12 秒逾時與可重試 fallback 管理失敗。每次載入使用同源隱藏 iframe 建立新 module realm；成功後保留 iframe 維持 SDK realm，失敗／逾時則移除，避免瀏覽器快取失敗 module map 阻斷重試。儲存 payload 在 SDK realm 內由 JSON 純資料重建並附加 timestamp，以符合 Firestore plain-object 原型檢查；集合、欄位及 `data` 字串內容不變。`continuous-beam-cloud-lazy.browser.test.js` 以明確 fixture 驗證冷開 0 次、首次恰 2 次、阻斷後 fallback／重試、逾時重試、並行呼叫及新增／覆蓋 payload 契約。獨立真實 CDN 案例透過正式 `_fbSave()` 初始化 Firebase 並開啟儲存視窗，但不確認儲存、不查詢或讀寫 Firestore。瀏覽器 console、pageerror、requestfailed 原始紀錄及 summary 均只寫 ignored `output/playwright/continuous-beam-cloud-lazy/`。既有計算、報表、本地 JSON 與暫存流程保持獨立。

```powershell
<!-- P2-SEGMENT:SG-03-014 -->
```

## 2026-10-10：第七階段 T30（石材節點圖延後載入）

正式 V2 主頁移除兩張 JPEG base64，新增由原始 JPEG 轉出的公開 `石材固定/assets/detail-bk.webp`／`detail-pk.webp`；冷開與同步 render 保持 0 請求，首次放大或報表／Word 輸出才載入。計算書 popup 對輸出 clone 先同步保留新視窗，再 await 封裝 data URI；Blob HTML 帶入相對資源 base 並導覽至已保留的視窗，避開 Edge 在 document.write 時停於 Paged.js 前。Word、DOCX 與 `auto_word.py` PDF→DOCX 路徑均先完成圖檔封裝，再交給既有同步 builder／PDF→DOCX 流程。每 key 使用單一 Promise、12 秒全流程 timeout、失敗清除可重試；缺圖統一輸出「節點參考圖暫無法載入」。正常 DOCX browser 案例不攔截本機 docx 9.6.1 runtime，實際解析 ZIP 的 detail media 與 document relationships；另分開驗證阻斷情境與 `.doc` 真下載 bytes 的離線重開。新測試私有、僅 summary 與當輪成品寫入 ignored output；首頁 `/stone-fixing` dependency 同步登錄兩張 WebP，首頁更新日需一併更新。不新增套件或產品 HTML 下載入口。

```powershell
<!-- P2-SEGMENT:SG-03-015 -->
```

## 2026-10-10：第七階段 T31（共用執行期確定性壓縮）

單一 `build-minified-runtimes.js` manifest 以 ignored Terser 5.44.0 建置原 a11y、案件表頭 profile 與 wind runtime；ECMA 2020、compress/mangle、禁止 unsafe／property mangling，所有輸出保持既有公開路徑並以 `--check` 位元組驗證。原 a11y `build-tool-page-a11y.js` 僅作薄 wrapper，保留既有 generated marker 與 9,972 bytes，40 頁接線和 profile 最後位置契約不變。兩個 readable source、canonical builder 與舊 wrapper 登入 Pages `PRIVATE_FILES`，來源、生成檔和石材 vendor wind 固定 LF。首頁依賴維持 42 個 profile 輸出路由並加 source；wind core 輸出依賴 16 路由加 source，石材 vendor wind 路由也加入公開 vendor 輸出及 core source。Profile 行為測試仍執行公開生成檔，只把 source needles 指向 readable source；wind 原 VM／數值回歸改讀 source，增加代表案例的 generated VM 對照；所有 benchmark adapters 和 SHA-256 鏡像測試仍讀公開輸出。vendor wind 僅由 `sync-stone-regulatory-vendor.js` 產生。容量差異保留原始逐路由項目，不重設 baseline。

```powershell
<!-- P2-SEGMENT:SG-03-016 -->
```

## 2026-10-10：覆工板手機報告溢出追加修正

只調整既有 `#report-output` 的螢幕局部捲動、焦點與區域標籤，列印解除裁切；計算及七張表格原內容不改。保留原報告契約與手機橫溢斷言，於最終乾淨 HEAD 驗收。首頁日期依同步腳本處理，不手改狀態 JSON。

```powershell
<!-- P2-SEGMENT:SG-03-017 -->
```

## 2026-10-10：撤銷 profile 屬性鍵別名、改訂 profile 體積門檻 39,000

撤銷 `622a5f79 Reduce project profile runtime size`：該變更把 565 處屬性存取改成常數索引只為多壓 2,495 bytes，gzip 傳輸量反而 11,904 → 11,981 bytes，可讀來源嚴重劣化。`project-meta-profile.js` 回到 Terser 直接壓縮的 38,027 bytes（原檔 71,641，減 47%），`tool-page-a11y-build.contract.test.js` 的 profile 門檻由 36,000 改為 39,000；`wind.js` 門檻 45,000 不變。可讀來源與產出檔仍由 `build-minified-runtimes.js --check` 守住逐位元組一致。

```powershell
<!-- P2-SEGMENT:SG-03-018 -->
```

## 2026-10-10：第七階段放行前載入預算基準重設

依委託人授權以 `node 結構工具箱/tools/tool-load-budget.browser.test.js --write-baseline` 重設 52 路由基準 18,128,164 → 14,922,588 bytes，涵蓋第七階段的 Firebase／Chart.js 按需載入、石材照片外置、三檔確定性壓縮，以及新增共用腳本 `結構工具箱/core/ui/chart-runtime.js`（680 bytes，耐震力／耐震動力兩路由）。基準 JSON 只能由該指令產生，不得手改。

```powershell
<!-- P2-SEGMENT:SG-03-019 -->
```


## 2026-10-11：T33 首頁最近使用與釘選

首頁最近使用／釘選與私有瀏覽器測試同包；不更動工具清冊白名單、路由、分類、首頁日期依賴或 index.html 腳本順序。測試收據只留 ignored output。

```powershell
<!-- P2-SEGMENT:SG-03-020 -->
```

## 2026-10-11：撤銷 RC 主頁共用 helper 抽取（T34）

撤銷 `ee3ffc80 Extract shared UI helpers from RC pages`：抽出的 `rc-page-ui.source.js` 55,602 bytes 中只有約 58 行為六頁真正共用，其餘以頁名分支存放各頁專屬 UI 邏輯；六頁內嵌 script 合計僅減 49,102 bytes，但每頁多載 35,980 bytes 外部檔（首訪總量增加 215,880 bytes），維護需跨兩檔。委託人裁定撤銷，六支 RC 主頁、建置清單、私有登錄、首頁依賴與文件回到撤銷前狀態；RC 共用抽取若再進行，須以真正跨頁等價的 helper 為範圍。

```powershell
<!-- P2-SEGMENT:SG-03-021 -->
```

## 2026-10-11：T36 第二批共用執行期確定性壓縮

六份可讀來源保持原始內容，僅統一 LF：`結構工具箱/core/ui/src/report-docx.source.js`、`結構工具箱/core/ui/src/tool-workflow.source.js`、`結構工具箱/tools/src/tool-workflow-adapters.source.js`、`結構工具箱/tools/src/project-storage.source.js`、`鋼筋混凝土/shared/src/project-storage.source.js`、`結構工具箱/core/loads/src/loadcombo.source.js`。沿用 `結構工具箱/tools/build-minified-runtimes.js` 與 ignored Terser 5.44.0 產生原公開路徑，首行標記來源，不使用 unsafe 或 property mangling。來源精確列入 Pages PRIVATE_FILES，來源與生成檔固定 LF；生成一致性、逐檔體積上限（本批實測加 10%、向上取整）與對應首頁來源依賴由 `tool-page-a11y-build.contract.test.js` 檢查，原三檔上限保持。

鏡像 manifest 的四筆來源均不含本批六檔。`結構工具箱/tools/project-storage.test.js` 保留全部字面斷言並改讀可讀來源；`結構工具箱/tools/local-quick-tools.contract.test.js` 的 LoadCombo VM 改讀來源，公開輸出仍由既有 LoadCombo 行為／家族測試執行。`report-docx-integration.contract.test.js` 同時載入公開與來源版本，保留各自可攜 HTML factory／Word 邊界全部斷言；其餘 HTML script VM 與 require 讀取者執行公開輸出之行為，不依賴函式排版。首頁依賴依實際 script 消費頁補齊公開檔及來源檔；不更改工具清冊欄位或公開路徑。

```powershell
<!-- P2-SEGMENT:SG-03-022 -->
```

DOCX integration 的舊 popup 替身未提供現行 Blob／URL API，使用未壓縮來源也會失敗；本包僅補齊替身並檢查 MIME／Blob 導覽，不更動任何 report.js 或 report-utils.js。首次失敗與原替身重現紀錄保留，所有原 Word／可攜 HTML 斷言均保留。

## 2026-10-11：撤銷首頁個人功能延後掛載（T35）

撤銷 `5b2e1645 Defer homepage personal controls until after paint`：延後掛載後 Lighthouse LCP 中位數 2,609／2,607 ms，與延後前 2,618 ms 無差別；為使 CLS 歸零改用固定 24rem 的「釘選與最近使用」面板，桌機只釘兩張卡時留下大片空白、手機第二張卡被裁切需在框內捲動，屬可見的體驗退步。委託人裁定撤銷，`home.js`、`home.css` 與 `home-recents.browser.test.js` 回到第八階段上線版；首頁 LCP 依 2026-10-11 裁定接受現狀，該測試不在正式預檢。

```powershell
<!-- P2-SEGMENT:SG-03-023 -->
```


## 2026-10-11：T38 首頁確定性壓縮分組

一組提交新增 `結構工具箱/assets/home/src/home.source.js` 與生成 `結構工具箱/assets/home/home.js`、`.gitattributes`、`結構工具箱/tools/build-minified-runtimes.js`、`結構工具箱/tools/build-pages-artifact.js`、`結構工具箱/tools/sync-home-update-dates.js`、`結構工具箱/tools/sync-home-initial-view.js`、`結構工具箱/tools/sync-survey-public-version.js`、`field-survey/release.mjs`，以及所有改讀首頁來源的契約／清冊解析器、`結構工具箱/tools/pages-live-smoke.js`、`homepage-quality.browser.test.js`、`tool-page-a11y-build.contract.test.js` 和三份治理文件。只改讀取位置及保留等價斷言，不改其他產出；回報、原始測試收據留在 ignored 的 `_tmp/派工/回報/` 與 `output/phase10/`。首頁來源／產出使用 LF，版本與日期同步必須重建，最終提交後乾淨 --check 無差異。
## 2026-10-11：T40 第三批確定性壓縮分組

以下十二個新增私有來源，與各原公開產出、`.gitattributes`、`結構工具箱/tools/build-minified-runtimes.js`、`結構工具箱/tools/build-pages-artifact.js`、`石材固定/vendor/loads/seismic-zones.js`（僅同步器生成）、首頁來源／生成檔／日期同步、全部改向契約與解析器、`browser-dialogs.contract.test.js`、`tool-page-a11y-build.contract.test.js`、README 與兩份治理文件同一組提交。

| 公開產出 | 新增私有來源 |
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

追溯跳過五檔不加入 staging；不改 status／release JSON，不把第三方依賴或測試收據加入追蹤。回報與來源位元組／讀者／追溯／鏡像查核收據留在 ignored 的 `_tmp/派工/回報/`、`_tmp/dispatch/phase10/`、`output/phase10/`；只在本機 master 一個任務提交，完成後串行重跑 29 條門檻、14 家族、40 頁 a11y 與 52 路由載入預算，不覆寫基準。

## 2026-10-11：撤銷首頁關鍵 CSS 內嵌（T39）

撤銷 `0145868b Inline deterministic critical styles for the homepage`：關鍵 CSS 內嵌加上 `home.css`／`colors_and_type.css` 延後載入後，兩次 Lighthouse 量測 CLS 由 0 變 0.633、效能分數由 99 跌至 66～67、LCP 2,327～2,433 ms 反而比只壓縮 `home.js` 的 2,156～2,171 ms 差；延後樣式造成首屏位移。委託人裁定撤銷，`index.html`、兩份 CSS、建置腳本與契約回到 T38 狀態；首頁 LCP 以 T38 結果為準。

```powershell
<!-- P2-SEGMENT:SG-03-024 -->
```

## 2026-10-11：入口契約 git 查詢記憶化（放行前修正）

第十階段 T38／T40 把多個可讀來源登錄進 `HOME_TOOL_UPDATE_DEPENDENCIES` 後，`toolbox-entrypoints.contract.test.js` 對每條路由的每個依賴各自執行 `git log`／`git status`／`git diff`，單跑 226 秒，超過正式預檢 180 秒逾時（runId 20261011-220100 失敗項之一）。改為以檔案路徑記憶化 `latestCommittedDate` 與 `hasWorkingTreeChange`，斷言與語意不變，單跑降為 54 秒。

同輪另一失敗為平台稽核：Codex 以 PowerShell 7 執行鋼構稽核後寫出的 `鋼構工具/output/audit/audit-status.json` 無 BOM，`audit-all.ps1` 以未指定編碼的 `Get-Content` 讀取時被 Windows PowerShell 當 CP950 解碼而 JSON 解析失敗；已就地補 BOM（ignored 輸出檔，未改腳本），稽核腳本讀檔一律加 `-Encoding UTF8` 列為後續派工。

```powershell
<!-- P2-SEGMENT:SG-03-025 -->
```

## 2026-10-11：鋼構正式稽核逾時預算 360 → 540 秒（放行前修正）

`audit-all.ps1` 的鋼構正式稽核（`鋼構工具/audit-tool.ps1`，27 組瀏覽器案例 × 3 尺寸）預算 360 秒；2026-10-11 兩次通過的實跑已達 296／337 秒，晚間負載下第三次（runId 20261011-225630 的平台稽核）在 334 秒仍差 5 組而被中止（exitCode 124），連鎖使 `rendered-delivery-evidence` 缺鋼構當輪摘要。預算改為 540 秒（約 1.5 倍常態），RC 1,200 秒與 core 240 秒不變；稽核內容、案例與斷言未改。

```powershell
<!-- P2-SEGMENT:SG-03-026 -->
```


## 2026-10-12：T41 稽核 UTF-8 與 5.1 家族分組

編碼契約、全部文字 I/O 編碼修正、5.1 家族入口與對應既有契約同包；不改案例、逾時預算、稽核流程或輸出結構。正式 preflight 只改讀檔編碼，既有 UTF-16 暫存腳本格式具理由保留。新契約先單跑量測，收據只留 ignored `output/phase11/`；指定 PS7 鋼構回歸後由 5.1 刷新與驗證本機平台狀態，不寫公開 JSON。

```powershell
<!-- P2-SEGMENT:SG-03-027 -->
```

## 2026-10-12：T42 鋼構兩檔建置與追溯分組

兩份私有來源、公開生成檔、確定性建置清單／契約／公開排除、原始碼讀者與追溯 source schema 同包；原目錄 evidence 與計算內容不變。來源不改可讀邏輯，只轉 LF。公開 HTTP 內部函式字面斷言移至來源契約，公開文字／URL 仍查產出；執行行為繼續使用公開產出。52 路由預算不寫 baseline，重型測試逐組、5.1 執行門檻與 wrapper。

```powershell
<!-- P2-SEGMENT:SG-03-028 -->
```

## 2026-10-12：撤銷石材 KaTeX 按需載入（T43）、鋼構壓縮比例斷言改 70%（T42）

撤銷 `89ed9340 Load stone KaTeX on demand`：冷開石材頁不捲動即產出計算書時，16 個公式全以 TeX 原文輸出（例如 `R_p = 24.19 	ext{kgf/m}^{2}`），T43 前同流程 16/16 為 KaTeX 排版；KaTeX 改為公式進入預覽可視區才載入，正式輸出未等待載入。委託人裁定撤銷，石材頁回到 head 以 defer 載入 KaTeX。

T42 鋼構 `app.js`／`calculator.js` 確定性壓縮實測為可讀來源的 66.0%（274,443／415,912 bytes），`tool-page-a11y-build.contract.test.js` 的整體比例斷言由 55% 改為 70%；兩檔各自的實測 +10% 上限不變。委託人接受 T41 預檢暫存子腳本以 UTF-16 寫出的編碼契約例外。

```powershell
<!-- P2-SEGMENT:SG-03-029 -->
```

## 2026-10-12：正式預檢平台稽核預算 1,500 → 2,100 秒（放行前修正）

`preflight-tools.ps1` 的 `platform-audit` 外層預算 1,500 秒，但 `audit-all.ps1` 內部三段預算合計為鋼構 540＋RC 1,200＋core 240＝1,980 秒（鋼構於 2026-10-11 由 360 調為 540）。runId 20261012-140428 中鋼構實跑 391 秒、RC 跑到 89／102 項時被外層 1,500 秒中止（exitCode 124），連鎖使 `rendered-delivery-evidence` 失敗。外層改為 2,100 秒，涵蓋內部合計並留約 120 秒啟動與彙整餘裕；稽核內容與內部預算不變。

```powershell
<!-- P2-SEGMENT:SG-03-030 -->
```

## 2026-10-15：撤銷治理文件歸檔（T45）、補齊新工具的工具數釘值（T44 放行前修正）

撤銷 `51182949 Archive governance execution history`：在「只搬歷程、不動規則」的限制下只能搬出 1,259 bytes，三份主文件仍 150／230／176 KB，`docs/governance-history/` 失去意義；委託人裁定撤銷，文件維持單一來源，瘦身另訂「分冊」任務。

T44 新增第 53 個首頁工具後，三支契約仍釘 52：`結構工具箱/tools/public-status-claims.contract.test.js`（工具數 52 → 53、local-quick 公開 metadata 6 → 7、新增 `concrete-strength-ndt` → `concrete-ndt` 資料夾對應）、`homepage-quality.browser.test.js`（連結數與路由數兩處）、`home-recents.browser.test.js`（五處卡片數）。新工具計算書範本的「計算引擎」改為 `escapeHtml(Core.version)`，與其他 local-quick 工具的契約 needle 一致。載入預算基準 `routeCount` 52 → 53 由委託人授權以 `--write-baseline` 重設（另列一節）。

```powershell
<!-- P2-SEGMENT:SG-03-031 -->
```

## 2026-10-15：載入預算路由數 52 → 53 與基準重設（T44 新工具）

`結構工具箱/tools/tool-load-budget-contract.js` 原把首頁路由數寫死 52（`validateBaseline` 兩處、`analyzeResults` 兩處），新增第 53 條路由後連 `--write-baseline` 都會在重寫前被既有基準驗證擋下。改為單一常數 `HOME_ROUTE_COUNT = 53`（匯出供測試用），`tool-load-budget-contract.test.js` 的 fixture 同步 53 條；新增或移除工具時只改這個常數並由委託人授權重設基準。過渡作法：依 `HOME_TOOL_UPDATES` 路由順序在基準 JSON 插入新路由佔位項（jsBytes 0），再由 `--write-baseline` 以實測重寫；重寫後基準仍完全由腳本產生，佔位項不留存。委託人已授權本次重設。

```powershell
<!-- P2-SEGMENT:SG-03-032 -->
```

## 2026-10-15：新工具對齊 local-quick 輸出一致性契約（T44 放行前修正二）

正式預檢 runId 20261015-095543 失敗於 `local-quick-tools-static`／`local-quick-tools-runner`（連鎖 `rendered-delivery-evidence`）：`結構工具箱/tools/local-quick-output-consistency.test.js` 以字面 needle 檢查每個 local-quick 頁面的 JSON 匯出物件（`id: '<key>'`、`name: '<label>'`、`pageVersion: PUBLIC_TOOL_VERSION`、`calculationEngine: Core.version`）與報表溯源行（`const prov = r.provenance || (Core.provenance ? Core.provenance() : {})`、`輸入格式`、`計算指紋`）。新工具頁面的匯出物件原本冒號後無空格、報表缺溯源行；已依既有六工具格式對齊，功能不變。此契約不在 29 條門檻內，新工具派工檔已列為必跑項。

```powershell
<!-- P2-SEGMENT:SG-03-033 -->
```

## 2026-10-15：canonical 交付證據範圍以清冊為準（T44 放行前修正三）

正式預檢 runId 20261015-104444 失敗於 `rendered-delivery-evidence`：local-quick 瀏覽器 smoke 為新工具 `concrete-strength-ndt`（assist、未入 `rendered-delivery-evidence.inventory.json`）產出 2 筆 PDF／evidence 紀錄，契約把 local-quick 家族所有紀錄都計入 Schema v35 的 96 份 canonical 檔案，實得 100。修正：`rendered-delivery-evidence.contract.test.js` 新增 `isInventoriedLocalQuickRecord`，local-quick 紀錄只有對應清冊 `evidenceKey`（或共用版面情境）才計入 canonical 集合；未入清冊工具的 PDF 仍由 smoke 逐檔驗證。以 `PREFLIGHT_RELEASE=1` 對 20261015-104444 的收據重跑契約：canonicalIntegrity 96/96 通過。若日後要把 NDT 納入正式交付證據鏈，需另案 Schema v36（清冊、6 份檔案含 blocked-boundary、各契約釘值 96 → 102、179 → 185）。

```powershell
<!-- P2-SEGMENT:SG-03-034 -->
```


## 2026-10-15：補回鋼索索力評估的圖面幾何欄位（T44 放行前修正四）

正式預檢 runId 20261015-113510 全部 70 項通過，但收尾檢查 `audit-dashboard-contract-final` 與 `audit-dashboard-live-output-smoke-final` 失敗：成熟度矩陣 `diagramGeometry` 覆蓋 20，與工具總數 21 不符。追查為 T44 改寫 `local-quick-tools.manifest.json` 時，誤刪既有工具 `cable-tension-frequency` 的 `diagramSelector`（`#cableTensionDiagram`）、`diagramRoleNeedles`（span／mode-shape／tension）與 `diagramChecks`，矩陣因而把該列判為 n/a。修正：依 3fb69a04 原文補回三個欄位，新工具的 `#metricGrid` 欄位保留；`git diff 3fb69a04` 對該清冊只剩新增無刪除。重跑 `tool-maturity-matrix.js --write --preserve-homepage-status` 得 diagramGeometry 21/21，`audit-dashboard.contract.test.js` 與 `local-quick-tools.contract.test.js`（7 工具）通過。治理規則：新增工具時只在清冊末端追加項目，不得改寫既有項目；核對新工具時以 `git diff 3fb69a04 -- 結構工具箱/tools/local-quick-tools.manifest.json` 檢查「只增無刪」。

```powershell
<!-- P2-SEGMENT:SG-03-035 -->
```

## 2026-10-15：載入預算 53 路由清冊契約補強

首頁 tools href、固定 baseline.routes、日期清冊與 routeFileMap 的一致性由純 helper 驗證；額外 /rc 別名允許存在。browser 量測順序沿用固定 baseline。負向契約涵蓋新增／替換、52／54、日期／映射缺漏、量測缺漏／重複／錯序及來源／HEAD 漂移；保留 DOCX guard、schemaVersion 1 收據與既有容量差異失敗規則。本包未改 baseline，瀏覽器量測另以最終 HEAD 收據核對，本包不含正式放行。

```powershell
<!-- P2-SEGMENT:SG-03-036 -->
```
