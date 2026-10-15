# docs/governance-current/README-audit.md

<!-- P2-BOOK:docs/governance-current/README-audit.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

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

附件整理完成、送出計算附件前，可執行：

```text
node 結構工具箱/tools/attachment-package-check.js --input <附件資料夾> --project-no <計畫編號>
```

它讀取 PDF、DOCX、XLSX、JSON、HTML 與文字附件，會自動略過 `.evidence.json`、成對的文字擷取檔、渲染摘要及作業系統雜項檔案，並檢查同工具版本、來源 JSON 與正式計算書的計算指紋配對、真正重複的來源／輸出及頁面專用文字。所有被辨識為計算文件的成品另須通過同一正向內容契約：一般計算書至少可辨識採用輸入、計算／檢核過程、工程結果及至少兩個實際工程數值；明確標題為計算摘要者可省略重複詳算，但仍須包含採用輸入、工程結果與相同的數值門檻。只有標題、章名、文件狀態、核可時間或追溯欄位的空殼文件一律 blocked；版本、日期、時間與計算指紋也不算工程數值。HTML 的 script、style、template 與 noscript 程式內容不計入可見工程內容。來源 JSON 維持追溯資料角色，不套用計算書正向內容群組。每份檔案會在內容解析前後取得 SHA-256；檢查期間若仍被重新輸出或替換即 blocked。來源資料夾本身或其內容若含符號連結、Windows junction 或其他特殊項目也會列名並阻擋，避免靜默遺漏或帶入選取資料夾以外的檔案。`文件狀態：內部審閱` 會阻擋正式組包；文件同時具備 `文件狀態：正式附件` 與有效 `核可時間` 才能自動放行。輸出時間與核可時間會依台灣本地格式或具時區 ISO 格式解析；無效輸出日期降為 `review`，核可早於輸出則 blocked，同一顯示秒可接受。計畫名稱、計畫編號與設計人可由主文承接，不列為必要欄位。缺少產出工具、版本、輸出時間、指紋或遇到未支援格式時仍降為 `review`。命令列採失敗封閉：只有 `ready` 回傳退出碼 `0`；`review` 回傳 `1`、`blocked` 回傳 `2`，參數或執行錯誤回傳 `3`。檢查結果只供內部整理，不得附入計算書、列印或 PDF。

日常組包與 v3 正式附件包事後驗證會重新計算 RC、風力／地震共用正式 HTML、錨栓正式 HTML，以及錨栓正式 XLSX 的內容／核可封印。共用 HTML 計算書的正式附件核可另提供「核可人」與「核可依據」選填欄位；兩欄留空不構成 NG、DRAFT 或組包阻擋，填寫後只以精簡頁尾紀錄進入正式附件，輸入控制仍在列印時隱藏。新版 RC／共用正式 HTML 核可封印 v2 會把兩欄連同狀態、時間、標題、計算指紋及內容封印一起綁定，任何改寫均由附件檢查器阻擋；既有 v1 核可封印仍可依原規則驗證。舊版正式 HTML 或 XLSX 缺少任一應有封印時降為 `review`；正文、公式、快取結果、文件狀態、核可時間、計算指紋、工具身分或文件標題被改寫時固定 `blocked`。即使同步重算檔案雜湊、附件包清單與包指紋，也不能繞過附件內容的雙封印驗證。組包與事後驗證摘要分別列出 HTML 雙封印與 XLSX 雙封印完成數，只顯示完成數與通過／異常狀態，不輸出封印值、封印範圍或正文；這些資訊只供內部交付確認，不進入正式附件，且 SHA-256 封印不是核可人的身分數位簽章。

開挖擋土支撐的 PDF／DOCX 預設為可列印的內部審閱，只有使用者在報表匯出頁明確勾選核可，才標示為正式附件並記錄核可時間；案件名稱與設計者留空仍可由主文承接。核可 PDF 會同步產生逐頁像素、OCR 與文字層對齊證據，以及只含 PDF／證據的單一 ZIP 組包來源套件；ZIP 只是搬運用來源套件，本身不是正式附件包，組包前須解壓為 PDF 與證據配對。若同案還要納入 ERH、RVR、SEV、SCV 或可選公開 RTB，則仍將治理 JSON、PDF 與其同名證據放在同一個組包來源資料夾，以完整案件來源組包。檢查器會把治理與渲染證據辨識為內部追溯，不拿來冒充計算來源／報告配對；SCV 所列來源檔名、SHA-256、各層指紋、工程結果、身分採用狀態及非工程核可邊界必須一致。完整鏈與 PDF 證據會隨 v3 包保存在 `99_內部追溯_勿附入主報告/來源資料/`，正式計算書仍只進入 `01_正式附件/`；缺檔或內容替換 blocked，孤立且未被 SCV 連結的治理證據維持 review。匿名端到端測試以實際後端產物證明核可 PDF 來源 ZIP 內容精確、組包後內部 JSON 不流入正文，且 OCR 證據或組包後 SEV 遭替換都會失敗封閉。組包器及事後驗證器都會重做這項檢查並只顯示完成組數。此關係檢查不重算 ERH／RVR／SEV 的受控內容或 Ed25519 簽章，正式複驗仍須使用包內來源檔重跑 `驗證SEV證據鏈.bat`。
附件可見性採失敗封閉：HTML 靜態檢查會排除 `hidden`、`aria-hidden`、列印媒體隱藏、透明、零尺寸及明確同色前景／背景內容；裁切、頁外位移或無法由靜態 CSS 確定的同色內容一律降為 `review`。DOCX 的 `w:vanish` 隱藏文字及 XLSX 的 hidden／veryHidden 工作表、隱藏列、隱藏欄都不計入工程內容；工作表存在隱藏欄但儲存格缺少 `r` 參照時，不猜測欄位而改列 `review`。PDF 的 `pdftotext` 只用於文字層 metadata 對照，不能證明實際可見或冒充 OCR；只有同一次瀏覽器列印工作階段取得的 print-visible DOM（computed style、有效背景／對比、`getClientRects`）、PDF SHA-256 與 `pdftoppm` 逐頁像素指標，或真正由渲染頁面取得的 OCR／vision 證據，才可自動視為 canonical evidence。檢查器會重算 evidence 內正規化 `visibleText.text` 的長度、SHA-256、文件 profile 與工程內容邊界，並要求正式狀態、核可時間、產出工具、版本、輸出時間及計算指紋與 PDF 文字層一致。這仍是可見性與一致性檢查：複雜 Office 條件格式、物件疊放、字型替換、透明度合成及掃描 PDF 的辨識誤差可能需要人工複核，不等同排版簽章或工程核可。
HTML 靜態判定會合併同一元素命中的 simple selector 規則與 inline style，並以預設白色頁面、繼承前景色及最近明示的祖先背景色判斷對比；白字落在預設白底、分拆規則形成同色前景／背景，以及 `width:0; height:0; overflow:hidden` 的內容都不得補足工程內容。明確白字／深色背景等有效對比則維持可見；外部 stylesheet、CSS `@import`、涉及可見性／配置／前景背景但無法解析的 selector，以及無法解析的 `color`／`background` 值（如 `hsl()`、`var()`）一律轉人工複核。純 typography 的複雜 selector 不會單獨觸發此狀態。
Canonical profile 也不直接相信 evidence 宣告：檢查器先由可見標題重判「計算書／計算摘要」family；可見內容同時具備產出工具、版本、輸出時間與計算指紋時，再提升為 `traceable-*` 並以較嚴格群組重算，避免把可追溯計算書降級或偽裝成摘要。`compiled-engineering-report` 可與計算書 family 相容，但仍以重判後 profile 檢核內容。preflight 的同一 `attachment-package-check` key 在 quick／CI 固定保留 Node 單元測試；只有 full／release 才在單元通過後追加實際 Edge canonical render E2E。

檢查通過後，可執行：

```text
node 結構工具箱/tools/attachment-package-build.js --input <附件資料夾> [--output <輸出資料夾>] [--project-no <計畫編號>]
```

組包器直接沿用上述檢查結果；只有 `ready` 且至少一份文件明確標示「文件狀態：正式附件」及有效核可時間時才會建立輸出。正式計算書放入 `01_正式附件/`；來源 JSON、SHA-256 清單與附件包指紋放入 `99_內部追溯_勿附入主報告/`。新建附件包採 `formal-attachment-package.v3`：附件包指紋除 v2 已涵蓋的檔案路徑、大小、SHA-256、建立時間、計畫編號、產出工具、版本、輸出時間、計算指紋、組包前摘要及正式／內部分流邊界外，再綁定每份正式附件的核可時間。`review`、內部審閱、來源連結／junction、無正式文件、輸出位於來源資料夾內或輸出位置已存在時皆不產生正式包；複製層另會逐層檢查來源實際路徑，並要求檢查完成、複製前、複製後與目標檔案的 SHA-256 完全相同，避免檢查後遭路徑轉向、重新輸出或內容替換。建立過程先寫入暫存資料夾，並以事後驗證器在暫存區完成逐檔大小、SHA-256、清單、指紋、資料夾邊界及正式附件工程內容自我驗證，全部通過後才原子更名；Windows 若於更名瞬間回傳 `EPERM`、`EACCES` 或 `EBUSY` 且正式輸出仍不存在，只會在 0.5 秒內有限重試，其他錯誤仍立即失敗。自我驗證失敗會清除暫存資料且不建立輸出，避免留下半成品或看似正式的異常附件包。

正式附件包在寄送、複製或歸檔後，可執行：

```text
node 結構工具箱/tools/attachment-package-verify.js --input <正式附件包資料夾>
```

驗證器不修改任何檔案，會逐一核對清單格式、資料夾邊界、檔案大小、SHA-256、附件包指紋與內部 README，並阻擋遺漏、替換、追溯欄位、核可時間或附件邊界變更、額外檔案／資料夾、符號連結及路徑越界；附件包根目錄本身若為符號連結或 Windows junction 也會直接阻擋，並在結束前以檔案系統身分重新確認根目錄未被替換。對目前 v3 包，驗證器還會直接重讀包內正式附件與來源 JSON，再次套用正向工程內容、頁面專用文字、正式附件身分、核可時間及來源／報告指紋配對規則；附件實際文字中的產出工具、版本、輸出時間、核可時間或計算指紋若與清單不同，即使重新計算出相符的檔案雜湊與附件包指紋仍會 blocked。清單、README、全部附件及目錄結構會在結束前再做第二次快照，雲端同步、重新輸出或人工整理若在驗證期間改變任何項目即失敗封閉。清單內每一層 JSON 物件的欄位名稱必須唯一；同字面欄位或以 `\u` 跳脫表示的同名欄位都會阻擋，避免不同解析器採第一值或最後值而讀出不同附件內容。清單另採封閉式欄位契約：頂層、檢查摘要、分流邊界及每筆正式／追溯附件紀錄只接受已定義欄位，任何未納入指紋的自訂狀態、簽章或擴充欄位都會阻擋，避免驗證器忽略而其他系統誤信。清單路徑另須採 NFC 正規化、避開 Windows 保留裝置名稱與尾端空白／句點，且以不分大小寫的可攜式路徑鍵維持唯一，避免 `A.pdf` 與 `a.pdf` 在 Windows 被重複計數為兩份附件。v3 包另會獨立驗證輸出時間有效、核可不早於輸出、清單建立時間為嚴格具時區格式且不早於任何正式附件核可時間，形成「輸出 ≤ 核可 ≤ 組包」的完整時間鏈。即使清單指紋重新計算一致，也不放行空殼附件、實際內容與清單不一致、重複／未定義 JSON 欄位、路徑碰撞或不合理時間。既有 `formal-attachment-package.v1` 與 `formal-attachment-package.v2` 附件包仍可依各自原指紋規則確認檔案完整性，但因未綁定 v3 的完整追溯 metadata／正式核可時間，結果固定為 `review`、退出碼 `1`，需人工確認或重新組包為 v3；只有完整性、工程內容與驗證期間穩定性都吻合的 v3 包才會自動判定 `ready` 並回傳退出碼 `0`。任何版本若有完整性異常都以 `blocked` 優先並回傳 `2`，參數或執行錯誤回傳 `3`。此機制仍不等同數位簽章或第三方身分驗證。

要處理既有 v1／v2 包時，可執行：

```text
node 結構工具箱/tools/attachment-package-upgrade-assess.js --input <正式附件包資料夾> [--json]
```

評估器先沿用同一完整性驗證器：異常包固定 blocked，不提供升級捷徑；完整的舊包則列為 review，依序要求保留舊包、由原始工具重新確認並輸出計算結果、重新勾選正式附件核可、另建新的 v3 包。它不修改附件包、不在原清單補欄位、不複製或推算舊核可時間，也不自行產生正式附件；v3 包若已驗證通過則明確回報不需升級。CLI 狀態碼維持 `ready=0`、`review=1`、`blocked=2`、參數或執行錯誤 `3`，`--json` 只把同一份內部評估輸出到標準輸出。

升級評估另會依「產出工具＋版本＋共享計算指紋」為每份正式附件配對包內來源資料，列出附件路徑、舊輸出時間、指紋、來源檔案及四項待辦。找不到來源時會逐份標示需回外部可信原始檔或原工具重建，禁止從舊報告反推輸入；文字與 `--json` 使用同一份工作清單。v3 或 blocked 包不產生誤導性的重新輸出清單。

確認完整舊包需要升級後，可執行：

```text
node 結構工具箱/tools/attachment-package-upgrade-workspace.js --input <舊版正式附件包> [--output <新工作區>] [--json]
```

建立器只新增獨立工作區，不修改舊包，也不複製舊附件、來源資料、metadata 或核可時間；`00_內部升級工作說明_勿附入主報告/` 只放逐份待辦，`01_新組包來源/` 只預建空白的「重新輸出正式計算書」與「重新確認來源資料」資料夾。完成重算與重新核可後，只能選取 `01_新組包來源/` 交給正式組包器，不得選取整個升級工作區。工作區採暫存後原子發布，失敗不留半成品；建立成功仍固定為 `review`／退出碼 `1`，不代表正式附件已核可。v3 完整包不建立工作區並回傳 `ready=0`；異常包不建立工作區並回傳 `blocked=2`；參數或執行錯誤為 `3`。

新輸出整理完成後，可執行：

```text
node 結構工具箱/tools/attachment-package-upgrade-workspace-check.js --input <升級工作區> [--project-no <計畫編號>] [--json]
```

完成度檢查器固定唯讀，先核對工作清單指紋、JSON／Markdown 同源與目錄邊界，再沿用附件組包檢查，並以「產出工具＋舊計算指紋」逐份尋找各 1 份新計算書及新來源；新工具版本可以不同，但兩份新檔仍須彼此版本與指紋一致。新輸出、來源儲存與正式核可時間均不得早於工作區建立時間，因此手動複製舊包內容不會通過。缺件、內部審閱或尚未重新核可維持 `review=1`；指紋不符、清單遭修改、邊界多檔或不安全連結為 `blocked=2`；只有全部逐份完成才是 `ready=0`。正式組包器會自動辨識 `01_新組包來源/` 並先執行同一閘門，未通過時不建立附件包；通過後的新 v3 包也固定輸出在工作區外。

RC 基礎工具的 `tools/test-foundation.ps1` 已串接獨立基腳 production core、有限配筋需求、底版需求、群樁側向分配、p-y 結果橋接與表格換算純數值回歸，以及 8 份基礎報告視覺 smoke：涵蓋獨立、聯合、筏式、樁基／樁帽、代表單樁 p-y 採用及擋土牆，檢查 NG／待確認邊界、主要檢核群組、逐層承載力表、趾版底層與踵版頂層設計、無 `NaN` / `Infinity` / `undefined` / `null` / `∞`、無水平溢出，並輸出 PNG / PDF / JSON 稽核檔；列印模式也會確認工具列隱藏。

工具成熟度矩陣的下一步品質欄位同時包含 `reportTextSmoke`、`goldenCaseRegression`、`jsonRoundTrip` 與 `referenceTraceability`；其中 `reportTextSmoke` 只揭露報告可讀文字抽檢是否已被 smoke / contract 覆蓋，不把頁面專用閱讀狀態寫入計算書或 PDF。

跨工具納入版本控管前，先參考 [TOOL_BOUNDARIES.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_BOUNDARIES.md:1) 與 [STAGING_GROUPS.md](/C:/Users/USER/Desktop/AI/小工具製作/STAGING_GROUPS.md:1)，避免把案例輸出、暫存檔、Office 文件或本機依賴一起提交。

報表 core 與 RC 的九個必要等價區段由 `report-core-parity.contract.test.js` 逐段檢查；`report-core-parity-map.json` 是私有測試資料，Pages artifact builder 與 live smoke 均明確排除。

新增或重構工具、示意圖與列印計算書前，請先參考 [TOOL_REPORT_GUIDE.md](/C:/Users/USER/Desktop/AI/小工具製作/TOOL_REPORT_GUIDE.md:1)。此檔固定說明示意圖、詳算式 / 簡易結果版面、計算書出具內容規範、JSON 匯出匯入與回歸檢查重點，避免重複踩到報告格式與工程依據文字問題。

RC 梁、柱、板、牆、剪力牆、基礎與單樁既有專案 JSON 可直接抽取案件、產出工具、版本、輸出時間及計算指紋，並與同頁計算書自動配對，不需另行改寫來源檔。七個計算書固定使用與各自專案 JSON 相同的工具名稱及版本，避免同一次計算因追溯標籤漂移而停在人工複核。

