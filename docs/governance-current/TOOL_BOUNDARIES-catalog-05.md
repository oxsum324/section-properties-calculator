# docs/governance-current/TOOL_BOUNDARIES-catalog-05.md

<!-- P2-BOOK:docs/governance-current/TOOL_BOUNDARIES-catalog-05.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

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

新增私有附冊 [STAGING_GROUPS-ledger-04](docs/governance-current/STAGING_GROUPS-ledger-04.md)，用途為保存原順序的分組指令，既有 loader 回填主檔標記以還原正文；附冊不進公開成品。分組覆蓋掃描讀主檔與全部 staging 附冊原文，只改讀取範圍，路徑存在、ignored、tracked deletion 與 unclassified 判定不變。2026-10-24 V20 新增 [STAGING_GROUPS-ledger-05](docs/governance-current/STAGING_GROUPS-ledger-05.md)，以同一分段機制收納 V18、V19 階段段落，主檔餘量回到約 8 KB（磁碟 CRLF）；附冊不進公開成品。

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

<!-- T51-REGISTRATION-START -->
## 2026-10-18：T51 正式預檢環境與執行器邊界

`結構工具箱/tools/release-environment.ps1` 僅供 `preflight-tools.ps1` 的正式 release 路徑，在來源乾淨及取得單例鎖後、平台與慢速稽核前執行。它只用程序層級的 `STRUCTURAL_TOOLS_PYTHON` 選擇 Python；明確指定無效即失敗，不安裝套件，且只在子程序環境固定 Python／原生 Windows PowerShell。完整石材環境 probe、自我檢查與報告契約失敗時，只保存 ignored 私有收據並停止，不形成正式 run 或公開狀態。Windows PowerShell 5.1 僅是 `run-preflight-tools-release.bat` 的執行器要求；一般、quick 與 CI wrapper 規則不變。正式預檢既有 70 keys、順序、命令、3 個 post-checks 與 `Clear-PreflightRuntimeProcesses` 行為均不在此包修改範圍。
<!-- T51-REGISTRATION-END -->

<!-- T52-REGISTRATION-START -->
## 2026-10-18：T52 NDT 顯示層鍵名邊界

鍵名轉譯僅在 `結構工具箱/tools/concrete-ndt/concrete-strength-ndt.html`：精確 15 個內建鍵顯示中文名稱及原鍵，畫面、摘要／詳細報告與 TXT 共用同一 helper；未知或自訂鍵原樣顯示。`local-quick-tools.manifest.json` 只准在 NDT 項目追加 `reportNeedles`，其餘項目維持 deep equal。既有首頁日期同步將 NDT 由 2026-10-16 更新至 2026-10-18，範圍僅為 `home.source.js` 與既有建置器產生的 `home.js`，不新增壓縮策略。不得改 core、spec、golden、JSON 或 trace；NDT 維持 assist 身分及既有附件資格，不新增 lazy-load。
<!-- T52-REGISTRATION-END -->
<!-- T53-REGISTRATION-START -->
## 2026-10-20：T53 預檢與平台稽核程序所有權

正式預檢與平台稽核為每項檢查使用 Windows Job Object 管理本輪啟動的程序樹，包含 Node 與 Edge 子孫；Job 設定 KILL_ON_JOB_CLOSE。事件閘門確保子程序在成功指派 Job 前不能開始執行。若指派失敗，閘門保持關閉，收尾僅限本次剛啟動的子程序 handle；不依程序名稱或啟動時間搜尋、停止既存程序。前次自有殘留由 Windows 在擁有者結束、Job 最後一個 handle 關閉時一併結束；啟動時僅記錄並略過不屬本輪的同名程序，不執行名稱式清理。

檢查成功、錯誤及逾時都會關閉本輪 Job；重試只收尾失敗檢查自己的程序樹，不觸及外部程序。收尾記錄僅含程序名稱、PID、StartTime 與檢查 key，不記完整命令列或使用者路徑。

程序快照或清理紀錄寫入失敗時，最外層 finally 仍關閉自有 Job／事件 handle 並回報失敗，不得因觀測錯誤遺留程序或假報通過。

正式預檢既有 70 個 record keys、次序、命令與 3 項收尾檢查，以及平台稽核項目與預算均維持不變。T51 歷史範圍保留；本包授權僅涵蓋清理包裝與對應契約。2026-10-24 V19 依派工授權新增 `condition-survey-upgrade` 為第 71 項，兩支釘值契約的宣告雜湊與數量同步更新，原 70 項不變。

共用機制 `結構工具箱/tools/preflight-process-ownership.ps1`、隔離測例 `結構工具箱/tools/preflight-process-ownership.fixture.ps1` 與契約 `結構工具箱/tools/preflight-process-ownership.contract.test.js` 均為私有工具，以具名清單排除於 Pages 成品之外。
<!-- T53-REGISTRATION-END -->

<!-- R1-REGISTRATION-START -->
## 2026-10-22：R1 工具頁導覽、家族頁與家族主題

共用導覽頂欄由根目錄 `tool-chrome.js` 與 `tool-nav.manifest.js` 構成，只提供頁面瀏覽：麵包屑「結構工具箱、家族、工具」、同家族工具清單、版本與身分標籤。它不參與任何計算，不改變輸入、結果、JSON 或計算書。頂欄渲染進每頁 body 開頭的 44px 靜態占位，固定高度，不造成版面位移；占位與頂欄帶 `page-only-tool-chrome` 類別，`結構工具箱/core/direct-print-boundary.css` 與 `鋼筋混凝土/shared/direct-print-boundary.css` 在列印時隱藏。計算書由字串在獨立視窗建構，不序列化工具頁 DOM，因此不含頂欄。現況鑑定紀錄、錨栓、石材固定與外部套件 struct.dx 不注入。

導覽清冊由 `結構工具箱/tools/nav/build-tool-nav-manifest.js` 從 `結構工具箱/assets/home/src/home.source.js` 產生，家族依既有欄位推定（RC、鋼構／SRC、風力、地震、施工臨設與局部快算，其餘取第一個分類），不得手改，以 `--check` 驗證。`結構工具箱/tools/nav/tool-chrome.source.js`、`結構工具箱/tools/nav/build-tool-chrome.js`、清冊產生器與 `結構工具箱/tools/nav/tool-nav.manifest.json` 為私有檔案，以具名清單排除於 Pages 成品之外。

家族頁由 `結構工具箱/tools/nav/build-family-pages.js` 從同一資料源靜態產出 5 頁，屬導覽層，不是計算書；每頁以列印邊界封鎖直接列印。`鋼筋混凝土/index.html` 改為產出物，保留平台公開巡檢狀態卡；首頁工具登錄變更後須重新產出，`--check` 不一致即失敗。家族頁連結一律相對路徑；`vercel.json` 的 `/family-` 開頭路由僅適用 Vercel。

`結構工具箱/core/family-theme.css` 只調整顏色、頁首底色、頁首連結與按鈕階層，不改版面尺寸；計算書視窗不載入。被不同深度頁面共用的樣式表不得使用 @import，token 與家族主題由頁面以 link 依序載入；僅 `鋼筋混凝土/shared/style.css` 因頁面與樣式表同深度保留 @import。家族色對應為假設值，需技師確認後定案。首頁網址參數 `category` 與 `member` 僅設定初始篩選，無效值忽略。
<!-- R1-REGISTRATION-END -->

<!-- E1-REGISTRATION-START -->
## 2026-10-23：E1 計算核心審查修正

各工具之計算核心依審查與複核結果修正，預期值一律來自結構力學閉合解或規範原文手算，不取工具自身輸出或黃金案例。修正會改變既有案例之計算結果與計算指紋；舊案例 JSON 依各工具計算引擎版本規則處理。審查報告與複核紀錄所列「需技師決定」事項屬規範解讀或設計意圖，未代為修改，結果不代表該等事項已定案。`docs/` 之 Markdown 檔不發布至 Pages。
<!-- E1-REGISTRATION-END -->

<!-- E2-REGISTRATION-START -->
## 2026-10-23：E2 計算核心審查後續

計算核心修正後，各工具依既有版本模型升版，並遞增受影響共用腳本之快取參數；舊案例 JSON 之處置維持各工具原規則（具版本檢查者拒絕並提示來源與目前版本，只存輸入者讀入後重算）。正式工具黃金案例之預期值取自修正後頁面輸出並逐類抽驗。覆工板原始 Excel 之更正版另存新檔，原檔未修改；Excel 撓度式、型鋼查表與大梁 Vmax 範圍屬觀察事項，未代為修改。
載入預算基準經委託人授權以 `--write-baseline` 重設為 14,324,731 bytes（53 路由，e31c757e），涵蓋 E1、E2 之共用腳本增量與 R1 導覽 runtime。
<!-- E2-REGISTRATION-END -->

<!-- E3-REGISTRATION-START -->
## 2026-10-23：E3 工程判斷事項更正

拉力伸展長度依表 25.4.2.3 分條件取係數、收縮與溫度鋼筋比固定 0.0018、基礎單向剪力依表 22.5.5.1(c) 並依 13.2.6.2 區分 λs、雙向剪力係數依表 22.6.5.2。條件資料不足時採保守之「其他情況」並於計算書標示；各模式之 ρw 取法與 Nu = 0 等假設列於計算書，結果不代表該等假設已定案。預設例判定改變（聯合基腳、樁帽單向剪力）屬依原文更正之結果。
<!-- E3-REGISTRATION-END -->
<!-- R2-REGISTRATION-START -->
## 2026-10-23：R2 首屏、首頁分組與頁面程式外移

`結構工具箱/core/tool-shell.css` 是工具頁首屏共用樣式（案件列、主要動作列、壓縮頁首），只用 token，由頁面 link 載入；目前套用 RC 梁、風力 Kzt、鋼索索力三頁。首屏重排只搬移元素與新增外層容器，不改 id、class 名稱、輸入預設值、計算流程或計算書。手機主要動作列以 CSS 固定於底部，不在執行期插入元素。

首頁「全部」檢視依家族分段，家族由既有欄位推導，與 `結構工具箱/tools/nav/tool-nav.manifest.json` 一致；每段預設顯示 6 張，其餘以 class 收合但保留在 DOM。分類卡（`#categoryOverview`）是唯一的分類清單，不再保留隱藏的篩選鏡像；首頁文件須維持在 14 KB 以內，避免 Lighthouse 模擬多一次往返。平台狀態區留在首頁頁尾、不收合；`結構工具箱/platform-status.html` 重用首頁執行期的同一組狀態渲染函式顯示完整內容，不含工具清單，不是計算書；`vercel.json` 的 `/platform-status` 僅適用 Vercel。

`鋼筋混凝土/tools/column.app.js` 是 RC 柱頁主程式，由 `鋼筋混凝土/tools/column.html` 逐字抽出（2026-10-23 V18 由當時 master 之 column.html 重新抽出，含 E1～E3 修正），未壓縮，在原位置同步載入；不得手動與頁面分歧，以 `鋼筋混凝土/tools/column-app-extraction.contract.test.js` 守門。以字面讀取柱頁程式的測試須讀還原後全文。是否以 Terser 壓縮為待決選項（gzip 可再降約 27%），需先處理瀏覽器探針與私有來源登錄。

根目錄 `tool-chrome.css` 只保留頂欄占位的 44px 高度並在列印隱藏，由 49 個注入頂欄的工具頁在 head 第一個樣式表前 link；占位不得使用行內 style。
<!-- R2-REGISTRATION-END -->

<!-- V18-REGISTRATION-START -->
## 2026-10-23：第十八階段（V18）

`結構工具箱/tools/anchor-a11y-tag.js` 為私有開發工具（不進 Pages），只在錨栓部署同步時於暫存目錄補回 index 之共用無障礙執行期標籤（插在最後一個 `</body>` 前，不改其他內容），全部檢查通過後才鏡像至 `anchor/`。

<!-- V18-REGISTRATION-END -->

