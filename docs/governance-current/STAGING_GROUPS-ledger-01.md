# docs/governance-current/STAGING_GROUPS-ledger-01.md

<!-- P2-BOOK:docs/governance-current/STAGING_GROUPS-ledger-01.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

<!-- P2-SEGMENT:SG-01-001 -->
# Staging 分包建議

## 混凝土強度非破壞檢測推估（T44，2026-10-14）

`結構工具箱/tools/concrete-ndt/` 依 floor-slab 四檔結構新增 core／HTML／golden／test，另新增 spec，完整五檔同包提交。所有工程公式與係數集中 `concrete-strength-ndt-spec.js`，預設值為假設，需技師確認。core 無 DOM，資料欄位與原始／修正值分列；`concrete-strength-ndt-confirmed.json` 本階段不提供，案例 JSON 不得代替規格確認。此工具為 `reference` 分類、`assist` 身分，計算書不具正式附件資格，既有六個 formal 局部快算工具與 40 個 formal 入口的責任邊界不變。

首頁來源卡片、aliases、routeFileMap、HOME_TOOL_UPDATES、HOME_TOOL_UPDATE_DEPENDENCIES 與 `vercel.json` 的乾淨路由同批登錄；首頁公開執行期仍由既有 canonical builder 產生，日期由既有同步腳本更新。local-quick 清冊／metadata／契約／smoke 加入第七工具的嚴格 assist 負向檢查；workflow 清冊／契約明列 40 formal＋連續梁＋NDT 共 42 入口，不放寬舊斷言。新 core 先單跑計時，提交後的乾淨最終 HEAD 依序跑門檻、local-quick 契約／smoke、workflow、新路由 a11y 與完整載入預算；新路由造成 53／52 清冊或容量差異照實回報，不重設基準。所有 PowerShell 使用 Windows PowerShell 5.1，重型組不與門檻並行；計算書、TXT、列印不依賴延後載入的程式庫。

```powershell
<!-- P2-SEGMENT:SG-01-002 -->
```

## 2026-10-10：第七階段 T29（耐震頁 Chart.js 按需載入）

同包修正 `tool-workflow.browser.test.js` 的覆工板測試導航：計算切至報告後，以既有分頁返回參數再聚焦；所有原有斷言保留。手機報告表格橫溢照實列待決，覆工板產品不納入本包修改。

`結構工具箱/tools/formal-browser-smoke.test.js` 量測耐震圖表前等待當前 Chart 實例完成繪製，保留原尺寸與幾何斷言；等待僅用於測試，計算核心與計算書不受影響。

`結構工具箱/core/ui/chart-runtime.js` 為耐震靜力與動力頁共用的延後載入器，12 秒逾時、單一 Promise、失敗可重試並防止逾時後舊 script 回呼污染新請求；實際檔案須 ≤889 bytes。兩頁冷開不載入 Chart.js；首次需要畫譜才載入，失敗時保留耐震力圖說、完整數值表及動力頁規範譜表。摘要還原、計算核心和計算書產出不等待 Chart.js；報表只嵌入成功繪製的 data URI，無有效圖時以資料表／文字說明呈現。`結構工具箱/tools/seismic-chart-lazy.browser.test.js` 記錄原始瀏覽器錯誤、請求數和 summary，驗證 cold／first chart／blocked、動力摘要冷開 restore、timeout retry、並發與過期 generation。容量差異依契約逐路由列出，共用檔預期在兩路由各列一筆；保留契約現況，照原文回報，不去重或重設 baseline。

```powershell
<!-- P2-SEGMENT:SG-01-003 -->
```

## 報表與載入稽核修正包（2026-10-04，本機）

`report-format-parity.core.js`、`report-format-parity.contract.test.js`、報表 browser／parity／PowerShell 入口，以及 `結構工具箱/tools/tool-load-budget-contract.js`、`結構工具箱/tools/tool-load-budget-contract.test.js` 與載入 browser 檢查器同包審閱。`preflight-tools.ps1` 的 `report-format-parity-contract`／`tool-load-budget-contract` 是 quick、CI 與正式模式皆執行的輕量門檻；它們不代表已重跑四案 Word 或 52 頁載入。新 helper、載入基準及測試屬私人驗收工具，必須同時維護 Pages 排除與治理契約。基準只能接受容量差異，功能錯誤與來源漂移不得寫入；本包不重設既有基準、不更改公開狀態快照。

## 第二階段 T2 共用報表工具包（2026-10-03，本機）

`結構工具箱/core/ui/report-utils.js` 是等價純函式的單一來源；core 報表與鋼構副本、RC 薄 adapter `鋼筋混凝土/shared/report-utils.js`、載入順序與各測試 VM 的依賴須同包提交。RC 的計算指紋／封印仍採獨立契約。`shared/common.js` 提供格式化政策，原頁面 strict／coerce、預設位數與 fallback 差異以等價案例鎖定。`core/direct-print-boundary.css` 同步 RC 副本並保留明列的家族差異；同步脚本的 `-Check` 及首頁依賴日期同批驗證。純 Node 等價測試不能代替真實 popup／下載 HTML 的瀏覽器回歸。

## 第二階段 T1 操作頁樣式包（2026-10-03，本機）

RC 五頁與 `shared/style.css`、`shared/tool-page.css`，鋼構四頁與兩份操作 CSS、梁柱結果卡 hidden 切換，連續梁／平面剛架與 `assets/hy/*-ui.css` 應同包審查。原 id/class、計算與報表樣式保留；新增的 HY 引用與首頁依賴日期同步同包提交。`test-tool-page-layout.ps1` 是 11 頁 1280／375 px 初始與結果狀態的版面回歸入口；另跑各家族既有 wrapper，RC 共用樣式須涵蓋基礎、單樁與三支 STM。量測截圖、JSON、Office 輸出均留在忽略目錄，不更新正式發布快照。本段不代表公開站已放行。

本檔目前扮演兩個角色：第一，記錄已發布到 `master` / GitHub Pages 的分包與證據；第二，保留下次同類變更可直接套用的 staging playbook。它不是目前待提交清單；若 `git status` 是 clean，以下 `git add` 區塊只作為未來變更時的審查邊界與 preflight coverage 來源。

## 已停用治理流程的私有資料防線

梁柱彎矩 G1 與工程資格化案件包已於 2026-09-29 停用並移除工具（可自 git tag `archive/governance-2026-09-29` 還原）。`.gitignore` 固定 basename、Pages builder 的案件包／實案 G1 basename 與 kind 內容掃描、qualification workspace marker 排除，以及 live HTTP 私有檔名探針仍保留，用來防止既有私人工作區資料誤入 repo 或 Pages；調整時須同批 staging `.gitignore`、`結構工具箱/tools/build-pages-artifact.js`、`結構工具箱/tools/pages-live-smoke.js` 與 `pages-release-governance.contract.test.js`。

## 目前狀態

- 工作樹基準：最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準，本文件不硬編碼自我引用的最新 commit hash，避免提交後立即失真。
- 狀態快照證據基準：以 tracked `結構工具箱/assets/status/preflight-summary.json` 與 `report-readiness-status.json` 的 `runId`、`sourcePath`、`sourceHash` 為準；承載提交由 `git log -1 --oneline` 查詢，不在本 ledger 重複硬編碼。
- 已落地提交：
  - `4944fa7 Harden page-only report readiness release evidence`
  - `b1a534e Expand report boundary governance across tools`
  - `d530816 Refresh anchor deployment assets`
  - `60f3c18 Update release status snapshots`
  - `2029758 Enforce formal attachment boundaries and rendered release evidence`
- 公開狀態快照正式放行基準：上述 tracked JSON 必須為 `quick=false`、`ForcePlatformAudit=true`、`ForceSlowChecks=true`、`sourceDirty=false`、`recordsCount=passedCount`、post checks 全數通過，且沒有慢測或平台巡檢重用；`sourceCommitSha`、`sourceBranch` 必須明確指出受測來源，當前 `runId` 直接讀取 JSON，不在本 ledger 複製。
- 公開狀態快照發布基準：最新 `Pages deploy` 必須為 completed/success，並以 `gh run list --workflow "Pages deploy" --limit 1` 查詢；workflow run ID 不在本 ledger 硬編碼。
- 公開狀態宣告一致性：首頁 `home.js` 動態產生的工具 metadata 是唯一公開清冊；RC 家族入口只重述一致版本與 formal 狀態；鋼構四個正式版本對齊共用 metadata；風力／地震 17 個入口對齊 `FormalToolMetadata`，報告將公開語意版本與內部計算引擎分欄；連續梁、平面剛架、斷面性質與合成斷面對齊 `AnalysisSectionToolMetadata`，畫面、案件 JSON 與計算書分列公開版本／內嵌計算引擎；石材畫面、核心與報告對齊 `StonePublicMetadata`，不得殘留舊 `V2`／`V2.1`；錨栓公開版本與計算引擎 build 分欄；覆工板頁面、JSON、報表共用 metadata；開挖維持服務型且不固化通過數；舊網址相容入口不得再保存第二份版本、能力、日期或通過狀態。`public-status-claims-contract` 必須留在 preflight summary 與 Global Governance Gates，Pages HTTP／Playwright 需覆蓋 canonical 版本、私有路徑排除及 RC／分析／斷面／鋼構／風力／地震／石材／覆工板／開挖／舊網址入口的直接列印封鎖。
- 報告閱讀狀態：`頁面專用`；首頁正式工具實際交付物渲染數量以 tracked `report-readiness-status.json` 為準，page-only boundary `4/4`、issue `0` 與補充報告 / 服務成品 `2/2` 仍須全數通過；可讀文字、瀏覽器 smoke、完整性、結果鏈與封印也都從同一正式快照讀取。本 ledger 所列 Schema v35 數字是下一版 release contract 目標，正式公開狀態仍以完成放行後的同 run 快照為準。此總覽只能出現在頁面或工具本身，不得附入計算書、列印輸出或 PDF，也不得寫入 Word / DOCX 或 workbook；公開狀態只顯示類別、數量及通過狀態，不得帶出 scope、檔名、工具版本、bytes、雜湊、golden case 內容、案件資料、來源資料、預期數值、重現指紋、成品雜湊或計算指紋。
- 已發布歷史快照（只供 lineage 查核）：Schema v28 曾為首頁正式工具實際交付物渲染 `37/37`、canonical `72/72`、公開合計 `151/151` 與局部快算結果鏈 `4/4`；Schema v29 曾為首頁正式工具實際交付物渲染 `38/38`、canonical `78/78`、公開合計 `157/157` 與局部快算結果鏈 `5/5`；Schema v30 曾為首頁正式工具實際交付物渲染 `39/39`、canonical `84/84`、公開合計 `163/163`、局部快算結果鏈 `6/6` 與鋼構結果鏈／雙封印 `5/5`。這些舊快照都不得冒充 Schema v31 的鋼構 `6/6`、canonical `86/86` 與公開合計 `165/165`；Schema v31 首頁 formal routes 仍為 `39/39`、局部快算仍為 `6/6`，只有 tracked 正式快照完成刷新後才能視為已發布。
- 已發布 Schema v32：`frame-analysis-formal` 來源 JSON 結果鏈、PDF／evidence 及核可 HTML 雙封印均為 `1/1`，canonical 為 `88/88`、公開合計為 `167/167`、首頁 formal routes 為 `40/40`；producer 仍由 `frame-analysis-browser-smoke.test.js` 留在正式 preflight。
- 已發布 Schema v33：鋼構主工具平板支撐 Gusset 拉力接頭的鋼構結果鏈與內容／核可雙封印均為 `7/7`，canonical 為 `90/90`、公開合計為 `169/169`、首頁 formal routes 維持 `40/40`；Schema v32 的鋼構 `6/6`、`88/88`、`167/167` 只供 lineage。
- Schema v34 保留梁柱彎矩接頭與全斷面 CJP 耐震柱續接的鋼構 `9/9`、canonical `94/94`、公開 `173/173` lineage；不得用來滿足下一版 RSC／RSB 附件治理。
- 下一版正式證據為 Schema v35：RSC v4／RSB v1 接收端正式附件必須 `1/1`，PDF、DOCX、canonical evidence、formal-source ZIP、RSC JSON 與 RSB JSON 六份成品必須 `6/6`；canonical 為 `96/96`、mixed-format 為 `17/17`、乾淨 DOCX 封裝為 `5/5`、公開匿名合計為 `179/179`。附件 builder、單元測試、release producer、rendered aggregate、成熟度、公開 schema、Pages 巡檢與治理文案必須同批 staging；公開狀態不得帶出檔名、SHA-256、RSC／RSB 計算指紋或逐檔 records。
- 下列 A0~G 是下次同類變更的分包 playbook，不是目前待 staging 清單。

## A0. 報告閱讀狀態與 Pages release governance

已落地：`4944fa7 Harden page-only report readiness release evidence`。下次若再次調整頁面專用「優先建議報告閱讀狀態」、公開首頁狀態快照、Pages artifact 邊界或正式放行證據，這包仍應優先提交；它不納入錨栓 build hash 資產，也不納入 RC / Steel / 風力 / 地震工具頁本體的大量 UI 調整。若變更只把相同的 `.report-readiness` 面板樣式抽成共用資產，則共用 CSS、26 個引用頁、專用 contract / browser smoke 與 preflight 接線可留在同一 A0 包，且不得順手刷新公開狀態快照。

下次同類變更低風險可整檔 staging 的檔案：

```powershell
<!-- P2-SEGMENT:SG-01-004 -->
```

下次同類變更需要人工 hunk review，或改隨後續「報告邊界 / 跨家族 contract」包一起 staging：

- `STAGING_GROUPS.md`：若只提交 A0，需只挑 release ledger、A0 區塊與必要共同驗證 hunk，避免把其他 future playbook 調整混入。
- `TOOL_BOUNDARIES.md`：若只提交 A0，需只挑 Pages / status snapshot / page-only 邊界相關 hunk。
- `preflight-tools.ps1`：若只提交 A0，需只挑 `pagesReleaseGovernanceContractCommand`、`prValidationContractCommand` 與對應 `pages-release-governance-contract` / `pr-validation-contract` record hunk。
- `README.md`：若只提交 A0，需只挑 Pages / report-readiness 相關 hunk。
- `TOOL_REPORT_GUIDE.md`：若只提交 A0，需只挑 glossary / ADR / page-only 邊界 hunk。
- `toolbox-entrypoints.contract.test.js`：若整檔 staging，必須同步 staging 它引用的 contract / preflight / home source 變更。
- `結構工具箱/tools/report-disclosure.contract.test.js`、`結構工具箱/tools/audit-dashboard-browser-smoke.test.js`：依賴跨家族 report-boundary 變更，除非 A0 同時擴成報告邊界大包，否則不要整檔 staging。

提交前驗證：

```powershell
node .\.github\pages-smoke\build-performance-trend.test.js
node .\report-readiness-style.contract.test.js
node .\serve-local-browser-smoke.test.js
node .\pages-release-governance.contract.test.js
node .\pr-validation.contract.test.js
node .\toolbox-entrypoints.contract.test.js
node .\結構工具箱\tools\report-disclosure.contract.test.js
node .\結構工具箱\tools\tool-maturity-matrix.js --write --check
.\run-preflight-tools-release.bat
.\run-pages-artifact-smoke.ps1
.\push-pages-release.ps1 -VerifyOnly
git diff --check -- README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/adr/0001-page-only-report-readiness.md ".github/workflows/pages-deploy.yml" ".github/pages-smoke/performance-budget.json" ".github/pages-smoke/write-ci-summary.js" ".github/pages-smoke/build-performance-trend.js" ".github/pages-smoke/build-performance-trend.test.js" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "push-pages-release.ps1" "push-pages-release.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js" "toolbox-entrypoints.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/verify-pages-release-lineage.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

`push-pages-release.ps1` 的成功不只依賴 Actions job 與 manifest 身分；一般推送、既有同 SHA 部署及 `-VerifyOnly` 都必須由目前工作站再次執行公開 `pages-live-smoke.js`，逐檔核對 v2 清冊與正式網址內容，並在結果回傳 `publicArtifactVerified=true`。工作站預設最多進行 3 次、間隔 10 秒的完整複驗，僅由 smoke 對 5xx 或網路暫態錯誤啟用；非暫態錯誤立即失敗，暫態重試用盡後也維持失敗，不得只因遠端 workflow 已綠燈而略過。

上述逐檔清冊現由 schema v3 延續並增列 `releaseEvidence`。Pages provenance 變更必須同批 staging `結構工具箱/audit-dashboard.html`、dashboard contract / browser smoke、deployment manifest builder、HTTP smoke、safe push wrapper、release governance contract 與三份治理文件。builder 必須從實際發布的 tracked preflight / report-readiness 快照驗證正式 release 條件並綁定 release runId、產生時間與受測來源 SHA；公開 smoke 再核對 manifest 與兩份快照。artifact 完成複製後須逐檔掃描 Windows 使用者目錄與目前建置機 repo／家目錄的原始、斜線及 JSON 跳脫變體；掃描數與發布檔數不同或 findings 非 0 都要失敗關閉，已知私有 manifest 的精確排除不能取代這項通用守門。公開證據 schema v3／歷程 v2 另以 12 個 required counter 比較相鄰 release；先以 `public-release-change-assistant.js --json` 唯讀預覽，只有實際縮減才可用同一助手寫入一次性 `.github/public-release-reduction-authorization.json`，精確列出上一個 runId、全部縮減欄位／前後值與可公開理由。未使用、過期或不同 active 授權均阻擋；該輪發布後也只有 tracked 公開歷程證明完全相同縮減已使用時，`--reset-authorization` 才可重設 inactive。dashboard 必須分開顯示一般巡檢與正式 release 新鮮度，並揭露門檻基準、維持、提升、縮減或混合分類；7 日／30 日只作重驗提醒，缺 manifest 顯示「未部署證據」，身分不一致顯示紅色「未對齊」。

正式 release 私人決策收據與公開歷程同屬 A0，但收據本身固定留在 ignored `output/preflight/history/`，不得 staging。`public-release-decision-receipt.js` 只在正式／後置檢查及三份公開快照完成後新增封閉 `PRD-` 收據，並以 canonical SHA-256 鏈回上一輪；Git-tracked `.github/public-release-decision-anchor.json` 只保存最新鏈尖身分，使整批 ignored 收據被刪除仍會阻擋。同 run 不得改寫不同內容，斷鏈、錨點不符、舊收據竄改或前輪縮減核准仍 pending 都會失敗關閉。使用核准的 release 必須由 `public-release-change-assistant.js --reset-authorization` 另增 `PRA-` 重設收據才算結案；若收據交易失敗，active 授權必須復原。產生器、測試、收據、核准設定、錨點及其中證據雜湊都不進 Pages、dashboard、計算書或正式附件。

dashboard 公開／本機資料範圍變更也屬 A0 同包。有效 v3 manifest 必須使公開頁只讀 manifest 與三份 tracked status，禁止發出任何 `output/` 請求並隱藏私人摘要連結；四張公開卡片必須各自以 tracked 結構化欄位驗證正式 release、鋼構、RC、風震／跨家族交付完成數，不得複製同一 platform pass 或以文案推定。localhost 只有明確 `?audit_scope=local` 才啟用完整診斷。`audit-dashboard-browser-smoke.test.js` 應以 request audit 同時證明本機資料仍完整、公開桌面與手機皆零 private-output 請求，並核對四個證據面向及完成數；不能只忽略 404 console 訊息。

公開證據 Schema v2／歷史變更同樣屬 A0 同包。`preflight-summary.json` 只可在既有三快照 lineage 內保存最近 8 次正式 release 摘要；每筆必須含受測 commit、全數通過的正式／後置門檻、四面向與十組完成數，按 runId／時間遞增並以目前 release 為終點。舊資料只從 Git 中可重驗的三快照成套回填，重複 carrier 去重；不得推測不完整舊值或加入案件、輸入、逐檔清冊、來源路徑、私密雜湊。Dashboard、manifest、HTTP／browser smoke、schema 負向測試及三份治理文件必須一起 staging。

成功 smoke 必須輸出唯一的 `pagesHttpSmokeAttemptCount`；安全發布入口只接受大於 0 且不超過 `PublicSmokeAttempts` 的值，並回報 `publicArtifactVerificationAttemptCount` 與 `publicArtifactVerificationRetried`。缺少、重複或超界均視為工作站驗證失敗。

正式 live HTTP 另以每一請求 15000 ms 逾時、最多 4 次、間隔 1000 ms 的有限重試處理逾時／隨機 5xx／網路暫態，耗盡後才進入既有整輪清冊重跑；staged gate 與本機 artifact 預演仍維持單次請求失敗即阻擋，但共用預設 30000 ms 逾時，不能無限懸掛。工作站安全發布入口須設定並在 `finally` 還原 `PAGES_HTTP_REQUEST_ATTEMPTS`、`PAGES_HTTP_REQUEST_RETRY_DELAY_MILLISECONDS`、`PAGES_HTTP_REQUEST_TIMEOUT_MILLISECONDS`，並回報 request 上限、間隔與逾時。failed log 只能在 Actions API 證明 run 已 `completed` 後讀取；若 aggregate 尚未收斂，應保留原始 failed-job 錯誤，不得由 `gh run view --log-failed` 的 in-progress 錯誤覆寫根因。

Pages CI 效能趨勢固定使用私有 `performance-trend` job：當輪 build／live 收據必須完整成對，歷史只取成功 run 中同樣成對的 14 天 artifact。只有四個 exact cache hit 的同 lock digest 樣本可進最近 20 輪序列；冷快取當輪要列出排除原因，不能誤判部署失敗。trend v1 必須逐輪保存 build／live 的 runtime、HTTP、browser 六個毫秒值，並能重算 nearest-rank P50／P95；不足 3 輪顯示 `collecting`，不得假裝具備成熟統計。趨勢來源、測試、JSON、摘要與歷史收據均為私有 CI 治理，不得發布至 Pages 或放入計算書／正式附件。

Windows 發布一律優先執行 `push-pages-release.bat`；此入口先找 PowerShell 7，再以 Windows PowerShell 5.1 後備。`push-pages-release.ps1` 必須維持 ASCII 來源路徑解析，不得重新加入會受 5.1 UTF-8 無 BOM 解碼影響的中文路徑字面值。

下次不要混入本包：

- `anchor/assets/` 舊 hash 刪除 / 新 hash 新增，改放 B 包。
- `鋼筋混凝土/`、`鋼構工具/`、`結構工具箱/tools/風力/`、`結構工具箱/tools/地震力/` 的頁面本體變更，改放 E / F 或正式工具包。
- `螺栓檢討/bolt-review-tool/` 原始碼與 `/anchor/` 部署鏡像，分別放 G / B 包。

已落地提交訊息；下次可沿用同樣聚焦格式：

```text
Harden page-only report readiness release evidence
```

## A. 平台穩定化與驗證入口

已落地：跨家族報告 / 閱讀狀態治理主要在 `b1a534e Expand report boundary governance across tools`。下次若再次調整巡檢、preflight、ignore 與文件，仍可用本包作為平台治理 playbook；它不包含錨栓 build hash 資產。

下次可直接 staging 的檔案：

```powershell
<!-- P2-SEGMENT:SG-01-005 -->

外部歸檔收據：`git add -- "開挖擋土支撐/receiver_governance_archive.ps1" "開挖擋土支撐/建立治理可信時間外部歸檔請求.bat" "開挖擋土支撐/完成治理可信時間外部歸檔證據包.bat" "開挖擋土支撐/驗證治理可信時間外部歸檔證據包.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json" "開挖擋土支撐/backend/receiver_governance_archive.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive.py" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/backend/tests/test_reporting.py" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
外部歸檔生命週期：`git add -- "開挖擋土支撐/receiver_governance_archive_lifecycle.ps1" "開挖擋土支撐/簽發外部歸檔週期狀態收據.bat" "開挖擋土支撐/建立外部歸檔生命週期檢查點.bat" "開挖擋土支撐/驗證外部歸檔生命週期檢查點.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE.md" "開挖擋土支撐/GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md" "開挖擋土支撐/RECEIVER_IDENTITY_SIGNATURE.md" "開挖擋土支撐/RECEIVER_KEY_MANAGEMENT.md" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
多案件外部歸檔生命週期總覽：`git add -- .gitignore "開挖擋土支撐/receiver_governance_archive_lifecycle_portfolio.ps1" "開挖擋土支撐/檢查多案件外部歸檔生命週期.bat" "開挖擋土支撐/建立多案件外部歸檔生命週期總覽快照.bat" "開挖擋土支撐/驗證多案件外部歸檔生命週期總覽快照.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle_portfolio.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle_portfolio.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" pages-release-governance.contract.test.js "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
多案件外部歸檔生命週期排程監測、案件導入、管理中心與本機儀表板：`git add -- .gitignore "開挖擋土支撐/receiver_governance_archive_lifecycle_monitor.ps1" "開挖擋土支撐/manage_receiver_governance_archive_lifecycle_monitor_task.ps1" "開挖擋土支撐/onboard_receiver_governance_archive_lifecycle_monitor.ps1" "開挖擋土支撐/receiver_governance_archive_lifecycle_monitor_center.ps1" "開挖擋土支撐/安裝多案件外部歸檔生命週期每日監測.bat" "開挖擋土支撐/開啟多案件生命週期監控管理中心.bat" "開挖擋土支撐/檢查多案件外部歸檔生命週期監測排程.bat" "開挖擋土支撐/移除多案件外部歸檔生命週期每日監測.bat" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle_monitor.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle_monitor.py" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" pages-release-governance.contract.test.js "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
<!-- P2-SEGMENT:SG-01-006 -->
```

建議提交訊息：

```text
Add formal report traceability metadata
```

## B. 錨栓部署鏡像

已落地：`d530816 Refresh anchor deployment assets`。下次更新 `anchor/` 靜態部署輸出時，必須讓舊 hash 刪除、新 hash 新增與部署 fingerprint manifest 一起 staging；共用鏡像固定採 `./` 相對 base，才能同時支援 Pages 倉庫子路徑與 Vercel `/anchor/`。

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
<!-- P2-SEGMENT:SG-01-007 -->
```

提交前檢查：

```powershell
Select-String -Path "anchor/index.html","anchor/service-worker.js" -Pattern '\./assets/|BASE_PATH'
Get-Content "anchor/deployment-manifest.json"
```

建議提交訊息：

```text
Refresh anchor deployment assets
```

## C. 候選工具目錄

下次不建議直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件、`stone-traceability.catalog.json`、`stone-traceability.contract.test.js`、`stone-report.contract.test.js` 與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。注意：`dev_tools/`、Python helper、測試資料與本機註冊檔可留在 repo 供治理使用，但 GitHub Pages artifact 必須排除，避免 baseline / diagnostics / source / local launcher helper 等維護檔公開。
- 石材風速／耐震資料治理必須以跨工具原子變更集提交：`結構工具箱/core/loads/wind.js`、`結構工具箱/core/loads/seismic-zones.js`、`結構工具箱/core/loads/seismic.js`、`結構工具箱/core/loads/regulatory-locations.js` 是唯一規範資料與換算核心；`結構工具箱/core/loads/project-location.js` 只保存縣市、鄉鎮與地盤分類，套用時必須由上述主庫重新解析，不得凍結規範係數。`結構工具箱/tools/sync-stone-regulatory-vendor.js` 只負責產生石材離線副本，`結構工具箱/tools/project-location.test.js` 與 `結構工具箱/tools/regulatory-data.contract.test.js` 必須在 preflight 驗證共用工址的明確套用、SHA-256 同步、行政區正規化、370 筆風速交叉比對零衝突與唯一明示例外。石材的 `vendor/loads/wind.js`、`vendor/loads/seismic-zones.js`、`vendor/loads/seismic.js`、`vendor/loads/regulatory-locations.js`、`vendor/loads/project-location.js`、石材正式 V2 頁、耐風案件總覽、四支正式耐震頁、input schema、traceability catalog／contract、report contract、瀏覽器 smoke、版本與交付文件需同批 staging；舊頁若保留，只能維持停止維護提示且不得再把 SsD 自動寫入 SDS。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`（含 `requirements.txt`、治理健康 GCR／GHC／GCV 檢核點與獨立驗證、`backend/app/pdf_render_evidence.py`、`backend/tests/test_pdf_render_evidence.py`、`backend/tests/release_report_artifacts.py` 與匿名正式附件證據鏈演練）、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`、`excavation-traceability.catalog.json`、`excavation-traceability.contract.test.js`、`excavation-report.contract.test.js`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。PDF／DOCX 報表文件狀態、核可欄位、API／前端控制、核可 PDF 逐頁 OCR／文字層證據與 `.formal-source.zip` 搬運套件、報表測試、治理檢核點與獨立 GCV 驗證、證據鏈演練、附件檢查／組包／事後驗證器、catalog 與文件必須一起 staging；preflight 已做 launcher、traceability contract、report boundary contract、backend quick/full tests 與 frontend build，完整 backend gate 會實際組成並驗證匿名 v3 正式附件包。正式 release 的當輪 PDF、DOCX、latest download 副本與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/excavation-formal/`。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`、`decking-result-replay.js`、`decking-report.contract.test.js`、`decking-traceability.catalog.json`、`decking-traceability.contract.test.js`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile、來源 JSON 重算、Word 報告邊界 contract 與 traceability contract；正式 release 的當輪來源 JSON、DOCX 與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/decking-formal/`，不提交案件成品。
- `鋼架/`：目前只有 `平面剛架分析.html`，頁面 / 計算書邊界已由根目錄 `frame-analysis.contract.test.js` 治理；產出追溯與內部審閱／正式附件核可狀態必須與頁面本體及該 contract 一起 staging、一起審查。
- 平面剛架 V1.6 的基礎樁帽基本載重轉接另依賴 `結構工具箱/core/loads/loadcombo.js`、`結構工具箱/core/ui/force-picker.js`、`鋼筋混凝土/tools/foundation.html` 與其轉接測試；上述檔案必須視為同一跨工具變更集。
- ETABS／SAP2000 Joint Reactions 表格轉接必須同批 staging `鋼筋混凝土/shared/joint-reaction-load-adapter.js`、單元測試、`joint-reaction-load-adapter-fixtures.test.js`、瀏覽器／Node 共用 `joint-reaction-fixture-sanitizer-core.js`／測試、`joint-reaction-fixture-sanitizer.js`／測試、`joint-reaction-fixture-promotion-gate.js`／測試、`joint-reaction-observed-intake.js`／測試、人工審閱模板、`shared/fixtures/joint-reactions/`、`鋼筋混凝土/tools/foundation.html`、基礎與樁帽橋接回歸、`鋼筋混凝土/tools/test-foundation.ps1`、`鋼筋混凝土/tools/test-pile-cap-3d-stm.ps1`、RC traceability catalog、`結構工具箱/tools/tool-maturity-matrix.js`、稽核儀表板及其契約／browser smoke、Pages artifact builder／HTTP 負向探針／release governance contract、報告邊界文件。不得只提交 UI：只有 `Linear Static`／`LinStatic` 可作線性組合基本案例；CaseType 缺漏、載重組合、Response Spectrum、Time History、Nonlinear Static、其他 CaseType、多步驟／重複列、單位、軸向、作用反作用與原始 CSV SHA-256 必須由同一變更集驗證。來源只先形成候選，人工採用後才可覆寫 D／L／W／E；讀檔預檢與匿名收件操作只留工作頁，不進計算書。fixtures 的來源政策必須保留：合成相容性樣本不得改稱官方或實際工程匯出檔；intake／sanitizer output 一律保持 ignored candidate，review 預設全部未核可，receipt 不保存來源路徑、檔名、完整或部分原始 hash，候選檔名只可使用匿名輸出 hash，且 `originKind` 必須明確分類，只有 `actual-observed` 可進 promotion gate。瀏覽器 `rc-joint-reaction-browser-intake-package.v1` 必須由 `--package` 安全解包、拒絕路徑跳脫與預先核可 review，並重建 receipt 後才可進人工審閱；直接 intake 與 `--package` 都必須先預檢四個輸出目標，拒絕符號連結、非一般檔案或既有不同內容，允許完全相同的重入，並在中途失敗時回滾當輪新建檔案。observed fixture 必須由 promotion gate 以有效 reviewer／reviewedAt、八項人工聲明與明確 `--promote yes` 升級，並與不含來源 SHA-256 的 provenance、`observed-manifest.json` 同批 staging，不得直接複製候選檔或 evidence。正式升級必須先確認清冊檔與完整父路徑的 resolved path／realpath 相同並在取得鎖前重查，拒絕祖先或直接 junction／符號連結及評估後路徑身分改變；再以清冊獨占鎖串行化，在鎖內重評估，以同目錄 backup／next、原清冊再確認、manifest 原子替換及寫後驗證完成。目標衝突、路徑 alias、鎖競爭、外部清冊異動或替換失敗都須保留原有／外部資料並回滾當輪新檔。中斷 lock、next、backup、clear 暫存不得 staging，必須由精確 `.gitignore` 排除。先以 `--lock-status yes` 唯讀診斷；只允許清除同主機、程序已停止至少 10 分鐘、無任何交易暫存、且為單純遺留鎖或三份正式產物已完整驗證的狀態。清除必須同時給 `--clear-stale-lock yes` 與診斷回傳的完整 lock SHA-256，經同目錄原子隔離與回讀才刪除；舊版／破損鎖、異地主機、活躍／近期程序、局部寫入、暫存殘留或競態內容一律失敗關閉。公開 Pages 只能包含 foundation 頁實際載入的 load adapter 與瀏覽器 sanitizer core；Node intake／sanitizer／promotion gate、review 模板及 fixtures 必須由集中發布清冊與 HTTP 負向探針排除。成熟度輸出與 dashboard 必須分開列出合成、實際匿名、候選、交易／canonical 路徑閘門狀態、唯讀 lock 診斷與 SHA 綁定清除命令；不得以合成 fixtures 增加正式成熟度或宣稱實際軟體版本已驗證。
- RC 深梁／基礎深構材／樁帽三維 STM 必須各自以「核心＋單元測試＋頁面＋browser／PDF regression＋PowerShell wrapper」為最小單位：`deep-beam-stm.js`／測試、`tools/deep-beam-stm.html`、`deep-beam-stm-regression.test.js`、`test-deep-beam-stm.ps1`；`foundation-deep-beam-stm.js`／測試、`tools/foundation-deep-beam-stm.html`、`foundation-deep-beam-stm-regression.test.js`、`test-foundation-deep-beam-stm.ps1`；`pile-cap-3d-stm.js`／測試、`tools/pile-cap-3d-stm.html`、`pile-cap-3d-stm-regression.test.js`、`pile-cap-3d-stm-bridge-regression.test.js`、`test-pile-cap-3d-stm.ps1`。並把共用 `beam-applicability.js`、`pile-cap-load-combinations.js`、`pile-cap-3d-stm-bridge.js`、`pile-cap-3d-stm-envelope.js` 及其測試、`鋼筋混凝土/tools/beam.html`、`foundation.html`、`test-beam.ps1`、`test-foundation.ps1`、RC index／README／traceability catalog、RC audit 接線與根目錄治理文件同批 staging。不得只提交三個 HTML 或只提交新核心。三頁的操作提示、適用性判斷與方法邊界維持 page-only；計算書只保留已採用模型、輸入、公式、代入、工程結果與文件狀態。多跨、偏心、開孔、不對稱、多柱、斜樁、拔力樁、水平反力、扭矩、缺角樁群、任意三維桁架及施工錨定細節不得因新增 STM 子工具而被宣稱已涵蓋；三頁現已依產品決策新增為 `/rc-deep-beam-stm`、`/rc-foundation-deep-beam-stm`、`/rc-pile-cap-3d-stm` 三個獨立首頁正式入口；首頁、clean route、Vercel、rendered inventory、獨立基準與契約必須同批 staging。
- `SRC工具/`：正式 `/src-beam` 與 `/src-column` 須一起納入 `core/src-beam-core.js`、`src-beam.html`、`src-beam.css`、`src-beam.js`、三個 core／contract／browser smoke 測試、`src-traceability.catalog.json`、`README.md` 與 `結構工具箱/tools/independent-engineering-adapters/src-beam.js`。這些檔案與獨立基準 catalog／runner／test、rendered delivery inventory／aggregate、`preflight-tools.ps1`、`vercel.json`、首頁卡片與根目錄文件必須一起 staging；瀏覽器輸出的 PNG／PDF／案件 JSON 仍留在 ignored output，不得提交。正式入口為 40 / 40；release 當輪必須在 `src-formal` 保存 PDF、來源 JSON、計算指紋與雜湊證據，且 Pages 須驗證首頁卡片、clean route 與私有證據邊界。
- `SRC工具/` 的正式 SRC 柱 V1.0 須將 `src-column.html`、`src-column.css`、`src-column.js`、頁面契約／瀏覽器測試、核心、catalog、oracle、外部弱軸剪力對照、所有對應測試、追溯 catalog、共用 `鋼筋混凝土/shared/pmsection.js`／測試、共用 `結構工具箱/core/ui/report.js`、首頁、`/src-column` Pages route、獨立工程基準、rendered-delivery inventory 與根目錄文件一起 staging。單向案件 schema v1、雙向案件 schema v1 與 traceability schema v17 的責任矩陣／材料來源政策必須同時驗證；V0.3～V0.8 舊案只可在重算並產生新指紋後遷移。受控 catalog 斷面可在人工審閱後勾選核可，人工斷面只能列印內部審閱。計算書只列採用教材表頁、catalog 版本、設計值、公式、結果與結論；責任矩陣及供貨／材證說明只留在 HTML。正式 release 必須在 `src-formal` 同時保存 SRC 梁與 SRC 柱核可 PDF、來源案件 JSON、計算指紋與雜湊證據。

舊版附件包升級評估：新增或調整 `attachment-package-upgrade-assess.js` 時，必須同步 staging 回歸測試、事後驗證器欄位、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。評估器固定唯讀，先沿用事後驗證；blocked 包不得提出升級捷徑，v1／v2 完整包只能回傳 review／CLI 1，並要求保留舊包、由原始工具重新確認與輸出、重新核可、另建 v3。不得原地修改舊包、補造 metadata、推算核可時間或自行產生正式附件；v3 完整包回傳 ready／CLI 0，任何完整性或工程內容錯誤仍以 blocked／CLI 2 優先。v3 驗證必須重新解析包內正式附件與來源 JSON，套用正向內容及文件狀態規則，並核對清單 metadata 與實際文字；測試需涵蓋同步改寫附件、雜湊、清單及附件包指紋後，空殼內容與 metadata 不一致仍被阻擋。逐份工作清單必須以產出工具、正規化版本與共享指紋配對，列出附件、來源、舊輸出時間、指紋及四項待辦；來源缺漏時標示外部可信來源，不得從報告反推輸入，v3／blocked 工作清單固定為空。測試需涵蓋多附件配對、來源缺漏、文字／JSON 同源，並以升級前後全目錄 SHA-256 快照證明零寫入。

舊版附件安全升級工作區：新增或調整 `attachment-package-upgrade-workspace.js` 時，必須同步 staging 測試、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。建立器只能在完整 v1／v2 包上另建工作區，且建立後仍為 review／CLI 1；不得複製舊附件、來源、metadata 或核可時間。內部 JSON／Markdown 待辦固定放在 `00_內部升級工作說明_勿附入主報告/`，可交給正式組包器的新檔案固定放在獨立的 `01_新組包來源/`，初始內容只能是空白子資料夾。輸出不得位於舊包內、包住舊包或覆寫既有資料夾，需採暫存後原子發布；測試必須以舊包 SHA-256 快照、精確工作區檔案清冊、核可欄位排除、發布失敗清理及 v3／blocked 不建工作區證明邊界。

升級工作區完成度閘門：新增或調整 `attachment-package-upgrade-workspace-check.js` 時，必須同步 staging 測試、`attachment-package-build.js` 強制接線、preflight、Pages 私有清冊與三份治理文件。完成度檢查固定唯讀，需驗證 `WSP-` 工作清單指紋、JSON／Markdown 同源、兩區固定邊界，再以產出工具與共享舊指紋逐份唯一配對新計算書及新來源；新版本可不同，但新檔彼此的版本／案件／指紋需一致，且輸出、來源儲存與正式核可均不得早於工作區建立時間。缺件或未核可只能 review，指紋／控制邊界異常必須 blocked，只有全部完成可 ready。組包器辨識 `01_新組包來源` 後不得繞過此閘門，新 v3 輸出也不得落在工作區內。測試必須涵蓋空白工作區、複製舊檔仍不通過、全新輸出可組成驗證通過的 v3、內部審閱、來源／報告指紋不符、清單／Markdown／根目錄遭改寫、CLI 0／1／2／3 與全工作區 SHA-256 零寫入。

共用計算書文件狀態：調整 `結構工具箱/core/ui/report.js` 的核可方塊、選填核可人／核可依據、內部審閱／正式附件頁尾、目前版本 HTML／TXT 下載、PDF 預設標題、空白案件欄位省略或輸入變更撤銷核可時，必須同步 staging `鋼構工具/core/ui/report.js`、`鋼筋混凝土/shared/report.js`、`section-tools.contract.test.js`、`continuous-beam-regression.test.js`、`continuous-beam-report-visual.test.js`、`frame-analysis.contract.test.js`、附件檢查器與反向測試、相關頁面、README、邊界文件、ADR、首頁／矩陣／dashboard 說明與 browser smoke。啟用 TXT 的頁面必須由同一份計算書狀態衍生 UTF-8 BOM 文字備查，Edge 代表案例須實際下載並驗證追溯檔名、同源內容、可重算 SHA-256 與 `blocked / non-formal-reference-text` 組包邊界。下載 HTML 必須保存唯一且不執行 JavaScript 也能辨識的文件狀態列、核可時間、已填核可紀錄與計算指紋，移除互動控制，重新開啟時沿用該列且不得重複插入狀態 UI；核可人與依據留空不得降低正式附件身分，填寫後則必須受核可封印保護。分頁標題必須由穩定報告名稱、目前文件狀態與指紋組成，不得在重新載入或切換時重複串接；頁面診斷明細仍維持 page-only。

