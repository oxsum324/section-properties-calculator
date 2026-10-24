# docs/governance-current/STAGING_GROUPS-ledger-05.md

<!-- P2-BOOK:docs/governance-current/STAGING_GROUPS-ledger-05.md -->

> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。

<!-- P2-SEGMENT:SG-05-001 -->
## 2026-10-23：第十八階段（V18）R2 重新落地與上線後小修

依 `_tmp/派工/小工具優化派工指示-20261023-V18.md` 於本機執行（Codex 沙箱無法啟動瀏覽器工作階段，改由本機代為執行）。

委託人裁定（2026-10-23）：首頁 LCP 行動版 A／B 交替各 3 次 2,152→2,320 ms（+7.8%）予以接受，本階段指標改記 ≤ +8%。

### V18-T55a 錨栓同步保留無障礙標籤

`sync-anchor-deployment.ps1` 鏡像 dist 後呼叫私有工具 `結構工具箱/tools/anchor-a11y-tag.js`，於 `anchor/index.html` 缺 `../tool-page-a11y.js` 標籤時補回（冪等）；`tool-page-a11y-build.contract.test.js` 以無標籤之 dist 樣本驗證補回恰一個、重複執行不變，並確認同步腳本於複製後呼叫。腳本維持純 ASCII。以 `-SkipVerify` 實際同步一次確認標籤補回後，`anchor/` 已還原至 HEAD。

```powershell
git add -- sync-anchor-deployment.ps1 tool-page-a11y-build.contract.test.js "結構工具箱/tools/anchor-a11y-tag.js" "結構工具箱/tools/build-pages-artifact.js" STAGING_GROUPS.md TOOL_BOUNDARIES.md
```

### V18-T55b 本機 serve smoke 鋼構標題

`serve-local-browser-smoke.test.js` 於 `steel-formal/` 路由原等候寫死之「鋼構連接板正式規範核算工具 V1.1」，實際主套件標題為「鋼構正式規範核算工具 V1.3」，30 秒逾時並使後續路由從未執行（乾淨 9b964467 即失敗）；改由 `鋼構工具/tool-metadata.js` 之接頭版本與 `鋼構工具/src/app.source.js` 之主套件名稱組成期望標題。修正後 5 路由 × 2 視窗與 26 個報表就緒頁全數通過，後續路由未發現其他問題。

```powershell
git add -- serve-local-browser-smoke.test.js STAGING_GROUPS.md
```

### V18-T55c RC 板、牆舊檔遷移一致化

`鋼筋混凝土/tools/slab.html`、`wall.html` 以 `LEGACY_REPLAY_VERSIONS = ['V3.1', 'V3.2']` 判定舊檔：以原版本驗證計算指紋後依 V3.3 重新計算，提示「原為 V3.x 專案檔，已依 V3.3 重新計算，請另存 V3.3 專案檔」；V3.2 舊檔（E1 前上線版）原本直接以版本不符拒絕。板、牆回歸與計算書測試各增 V3.2 遷移一例，fixture 為 a2054691（V3.2 上線版）頁面以同一組輸入另存之 `鋼筋混凝土/tools/tests/fixtures/{slab,wall}-project-v3.2.json`（保留原計算指紋）；其他 RC 頁不動。

```powershell
git add -- "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/slab-regression.test.js" "鋼筋混凝土/tools/wall-regression.test.js" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/tests/fixtures/slab-project-v3.2.json" "鋼筋混凝土/tools/tests/fixtures/wall-project-v3.2.json" STAGING_GROUPS.md
```

### V18-T55d 石材固定 V3.1.1

石材 vendor 之 wind.js、seismic.js 已同步修正後計算核心，公開版本依 `石材固定/CHANGELOG.md` 規則升為 V3.1.1：`APP_VERSION`（version-sync.js）、`SERVER_VERSION`（server.py）、頁面標題、位置與頁首標籤、交付檢查清單、版本 smoke 釘值、首頁卡；`home.js`、導覽清冊與家族頁以建置器重產。calculator `VERSION` 與 profile archive 不動。石材回歸 smoke、版本 smoke、規範 profile smoke、Python 55 項測試與 `self_check.py` 通過；回歸數值未變。

```powershell
git add -- "石材固定/js/version-sync.js" "石材固定/js/version-sync-smoke.test.js" "石材固定/server.py" "石材固定/石材計算書產生器_規範版V2.html" "石材固定/RELEASE_CHECKLIST.md" "石材固定/CHANGELOG.md" "結構工具箱/assets/home/src/home.source.js" "結構工具箱/assets/home/home.js" "結構工具箱/tools/nav/tool-nav.manifest.json" tool-nav.manifest.js STAGING_GROUPS.md
```

### V18-審查修正-1 錨栓同步先補標籤再鏡像

依 `_tmp/派工/回報/V18-程式碼審查-20261024.md` 第 2、4 項與建議 S4：`anchor-a11y-tag.js` 改為插在最後一個 `</body>`（不分大小寫）之前，保留同行內容、BOM 與行尾；多標籤、缺 body、非標準引用以非零結束且不寫檔。`sync-anchor-deployment.ps1` 改在暫存目錄補標籤、核對引用資產與產生 manifest，全部通過才鏡像至 `anchor/`；helper 與錨栓原始碼目錄改以碼點組成之確切路徑定位（維持純 ASCII），不再掃描取第一個。契約加單元案例與 4 種腳本變異（刪 helper 呼叫、刪 `$LASTEXITCODE` 檢查、補標籤移到鏡像後、退回目錄掃描）。端對端同步後只有雜湊檔名、manifest 與 `service-worker.js` 建置戳變動，已還原。

```powershell
git add -- sync-anchor-deployment.ps1 tool-page-a11y-build.contract.test.js "結構工具箱/tools/anchor-a11y-tag.js" TOOL_BOUNDARIES.md STAGING_GROUPS.md
```

### V18-審查修正-2 柱頁主程式快取參數與共用還原

審查第 3、5 項：`column.html` 改載 `column.app.js?v=1`；新增私有測試輔助 `鋼筋混凝土/tools/column-app-source.test.js` 集中標籤、`COLUMN_APP_VERSION` 與還原全文，九支測試改用（日後調升只改頁面標籤與該常數）。`rc-format.contract` 對柱頁改讀還原全文，並以記憶體變異證明在 app.js 寫回 `function fmt(` 會被抓到。

```powershell
git add -- "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/column-app-source.test.js" "鋼筋混凝土/tools/column-app-extraction.contract.test.js" "鋼筋混凝土/tools/column-regression.test.js" "鋼筋混凝土/tools/rc-project-fingerprint.contract.test.js" rc-format.contract.test.js toolbox-entrypoints.contract.test.js tool-page-layout.browser.test.js tool-workflow.browser.test.js "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/tool-workflow-adapters.test.js" "結構工具箱/tools/tool-workflow.manifest.test.js" STAGING_GROUPS.md
```

### V18-審查修正-3 板、牆舊檔判定改變時載入並揭露

審查第 1、7 項與 S5（委託人裁定選項 A）：新增 `鋼筋混凝土/shared/project-replay.js`（`window.RCProjectReplay`，gzip 約 3 KB），只由板、牆於 `report.js` 後載入；`report.js` 與其他 RC 頁不變。V3.1、V3.2 舊檔仍須通過來源指紋驗證且輸入逐欄重現；僅結果摘要不同時接受，狀態列以警示揭露「原判定 → V3.3 判定」與審查警示數並要求另存；輸入無法重現者拒收並列出欄位；V3.3 檔維持嚴格比對。版本正規化與 report.js 逐字等價（契約比對 17 組輸入）。fixture 以 a2054691 頁面另存之判定翻轉檔（板端跨剪力、牆 #6 ρℓ=0.001295），未重簽。首頁 `/rc-slab`、`/rc-wall` 更新日相依加入新檔；`audit-status.contract` 列為必備 QA 檔。

```powershell
git add -- "鋼筋混凝土/shared/project-replay.js" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/rc-project-fingerprint.contract.test.js" "鋼筋混凝土/tools/slab-regression.test.js" "鋼筋混凝土/tools/wall-regression.test.js" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/tests/fixtures/slab-project-v3.2-shear-flip.json" "鋼筋混凝土/tools/tests/fixtures/wall-project-v3.2-rhol-flip.json" "鋼筋混凝土/tools/audit-status.contract.test.js" "鋼筋混凝土/README.md" "結構工具箱/assets/home/src/home.source.js" STAGING_GROUPS.md
```

### V18-審查修正-4 三頁首屏可用性

審查第 6 項與 S1～S3：鋼索 ④ 輸出卡加 role=status 狀態列（空白時高度 0），「下載 JSON」確認改寫於此；梁、Kzt 頁首加 `<noscript>` 相對首頁連結；梁子分頁靜態 role=group（執行期仍升級為 tablist）；Kzt 存讀檔列移入原生 `<details>`，刪除 `:has()` 收合規則。四頁兩種寬度版面位移與列印截圖與 HEAD 相同。

```powershell
git add -- "鋼筋混凝土/tools/beam.html" "結構工具箱/tools/風力/wind-kzt.html" "結構工具箱/tools/cable-tension/cable-tension-frequency.html" "結構工具箱/core/tool-shell.css" "結構工具箱/tools/design/tool-shell.contract.test.js" STAGING_GROUPS.md
```

<!-- P2-SEGMENT:SG-05-002 -->
## 2026-10-24：第十九階段（V19）現況鑑定治理

依 V19 派工本機執行（Codex 沙箱禁 localhost）。T56 停用 overlay，現況鑑定只隨全站發布，升級測試入預檢；T57 package.json 版本入檢查；T58 README 拆出 CHANGELOG。

```powershell
git rm -- .github/workflows/field-survey-deploy.yml field-survey/release.mjs field-survey/release-baseline.json field-survey/tests/release-stage.cjs
git add -- .github/workflows/pages-deploy.yml preflight-tools.ps1 STAGING_GROUPS.md TOOL_BOUNDARIES.md "結構工具箱/tools/preflight-process-ownership.contract.test.js" "結構工具箱/tools/release-environment.contract.test.js"
git add -- "結構工具箱/tools/sync-survey-public-version.js" "結構工具箱/tools/public-status-claims.contract.test.js"
git add -- field-survey/README.md field-survey/CHANGELOG.md "field-survey/V0.8_操作與交付.md" "結構工具箱/tools/pages-live-smoke.js" README.md
```
<!-- P2-SEGMENT:SG-05-003 -->
## 2026-10-22：R1 工具箱導覽閉合、家族頁與設計系統收斂

依 2026-10-22 架構建議分包，第一輪合併 1A、1B、2 三包並分四組提交。各工具計算核心、計算書模板、正式附件輸出與 `結構工具箱/assets/status/` 快照均未改動；首頁工具卡維持 53 項，載入預算基線未重設。

### R1-2 設計系統收斂

弘一 token 為唯一來源；`結構工具箱/core/style.css` 與 `鋼筋混凝土/shared/style.css` 改引用 token，新增 `結構工具箱/core/family-theme.css`（RC 共用樣式以 @import 載入，其餘由頁面 link），依 body 的 data-family 屬性切換家族強調色、頁首深藍平塗加 4px 家族色條與按鈕三階。首頁卡片配色地震改琥珀、施工臨設改石板灰，並加入家族頁入口列樣式。只動顏色、字體、圓角與陰影，選擇器與版面尺寸不變。core 版 style.css、鋼構 styles.css 與連續梁、剛架 UI 樣式不使用 @import，改由 39 個連結它們的頁面依序 link token、family-theme 與原樣式表（axe 預載 CSSOM 會把 @import 相對路徑當成相對於頁面解析而 404）；本組另含 4 個未注入頂欄、但連結 core 版 style.css 的頁面。深藍頁首內未加 class 的連結改為白字底線。

```powershell
git add -- "結構工具箱/assets/hy/colors_and_type.css" "結構工具箱/core/style.css" "結構工具箱/core/family-theme.css" "結構工具箱/core/report-readiness.css" "鋼筋混凝土/shared/style.css" "鋼構工具/styles.css" "結構工具箱/assets/home/home.css" "結構工具箱/tools/design/design-tokens.contract.test.js" "結構工具箱/audit-dashboard.html" "結構工具箱/index-classic.html" "結構工具箱/tools/force-picker.html" "結構工具箱/tools/test-dashboard.html"
```

### R1-1A 共用導覽頂欄

根目錄 `tool-chrome.js` 與 `tool-nav.manifest.js` 為公開執行期，可讀來源、建置器、清冊產生器與私有清冊 JSON 位於 `結構工具箱/tools/nav/`。49 支工具頁各加 body 的 data-family 屬性、一個 44px 靜態占位與兩個 defer script（其中 35 頁同時含 R1-2 的樣式 link）；首頁支援分類與構件深連結；列印邊界樣式排除頂欄（RC 副本由 `鋼構工具/sync-formal-core.ps1` 同步並更新鏡像清單）。8 支既有契約的 body 釘值依新屬性改為精確字串，未刪斷言。

```powershell
<!-- P2-SEGMENT:SG-05-004 -->
```

### R1-1B 家族頁

`結構工具箱/tools/nav/build-family-pages.js` 由 `結構工具箱/assets/home/src/home.source.js` 靜態產出 5 個家族頁：`鋼筋混凝土/index.html`（路徑與巡檢卡不變）與 `結構工具箱/family/` 下 4 頁。`vercel.json` 新增 4 條家族路由。RC 巡檢契約的基礎深梁卡片標題改取首頁登錄名。

```powershell
git add -- "結構工具箱/tools/nav/build-family-pages.js" "結構工具箱/tools/nav/family-pages.contract.test.js" "結構工具箱/family/family.css" "結構工具箱/family/steel.html" "結構工具箱/family/wind.html" "結構工具箱/family/seismic.html" "結構工具箱/family/local-quick.html" "鋼筋混凝土/index.html" "鋼筋混凝土/tools/rc-index-menu-browser-smoke.test.js" "鋼筋混凝土/README.md" "鋼筋混凝土/tools/audit-status.contract.test.js" vercel.json
```

### R1-整合 門檻與治理登錄

首頁加入家族頁入口列；開發門檻清單由 31 條增為 34 條（第 30 至 32 條為導覽、家族頁與設計 token 契約）；登錄 README、TOOL_BOUNDARIES 與本文件。

```powershell
git add -- "結構工具箱/index.html" phase-gates.commands.json run-phase-gates.contract.test.js README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md
```

<!-- P2-SEGMENT:SG-05-005 -->
## 2026-10-23：E1 計算核心審查修正

依 `docs/審查報告-2026-10-23.md` 修正 60 餘項計算錯誤（約 40 項偏不保守），經 `docs/審查複核紀錄-2026-10-23.md` 獨立複核並補充修正後分組提交。計算書數值隨之改變；黃金案例、計算引擎版本與快取參數另以後續提交處理。

### E1-錨栓

拉破 Nb 於 hef 280–635 mm 改 SI 係數 3.9 並限預埋擴頭錨栓；後置錨栓改 kc 7；剪破改 √da 並加 le ≤ 8da；補彎鉤與 M12 可觀測測試。

```powershell
git add -- "螺栓檢討/bolt-review-tool/src/calc.ts" "螺栓檢討/bolt-review-tool/src/calc.test.ts"
```

### E1-斷面

弓形形心與 I、梯形對底邊 I、H 型鋼圓角形心與 Zy、rT、唇形 C 型鋼、梯形與拋物線 e/e₁；合成斷面圓角；RC 補強外貼材料轉換面積 n·A。

```powershell
git add -- index.html "合成斷面性質.html" "RC補強斷面性質.html" section-tools.contract.test.js
```

### E1-連續梁

勁度矩陣對角正規化與殘差複核，機構（鉸支＋自由端）改為拒算。

```powershell
git add -- "連續梁分析.html" continuous-beam-regression.test.js
```

### E1-鋼構

熱軋翼板 Qs 0.74 且 ≤ 1、HSS 剪力 φv 0.90、區塊剪力拉力面依實際區塊邊；鏡像清單以同步腳本重產。

```powershell
git add -- "結構工具箱/core/materials/steel.js" "鋼構工具/core/materials/steel.js" "鋼構工具/core/formal-core-manifest.json" "鋼構工具/src/calculator.source.js" "鋼構工具/calculator.js" "鋼構工具/calculator.smoke-test.js" "鋼構工具/steel-formal.regression-test.js"
```

### E1-風力

Kzt μ／γ、表 2.11 查表路線、式 2.21／2.23、圖 3.1／3.2 GCp、Kz 下限、用途係數、式 2.15、GCpi、表 2.10／2.13；既有測試依原文更新。

```powershell
<!-- P2-SEGMENT:SG-05-006 -->
```

### E1-地震

無力學週期取 Ta、近斷層表 2-3 乘 Fa／Fv、垂直 Ra、阻尼短週期段、(C2-11b) 0.096、αy、盆地 Ra 顯示。

```powershell
git add -- "結構工具箱/core/loads/seismic.js" "結構工具箱/tests/seismic.test.js" "結構工具箱/tools/地震力/seismic-force.html"
```

### E1-石材 vendor 同步

以 `結構工具箱/tools/sync-stone-regulatory-vendor.js` 同步新版 wind.js 與 seismic.js。

```powershell
git add -- "石材固定/vendor/loads/wind.js" "石材固定/vendor/loads/seismic.js"
```

### E1-施工臨設

設備角隅／邊緣穿孔周長、土壓層內水位、覆工板履帶 V2 與 LTB 及 F1-3、開挖 F1-6 與 F1-8 取大；覆工板報表 fixture 更新 4 欄。

```powershell
<!-- P2-SEGMENT:SG-05-007 -->
```

### E1-RC

梁 Vs 上限、柱 M2,min、牆 Vn 上限與最小筋比、板剪力係數與最小厚度（第三列 fy 5,600）、ℓdc 0.0044、獨立／聯合／筏式基腳、樁帽沖剪與實配鋼筋；regression 預期值依修正更新；ℓdc 測試掛入 test-column.ps1。

```powershell
<!-- P2-SEGMENT:SG-05-008 -->
```

### E1-獨立基準

覆工板、錨栓剪破、RC 補強轉換面積、RC 板剪力、RC 牆剪力上限與最小筋比之判定式改為獨立正確寫法；牆介接同步正式頁；條號 13.4.6.5。

```powershell
git add -- "結構工具箱/tools/independent-engineering-benchmarks.js" "結構工具箱/tools/independent-engineering-benchmarks.catalog.json" "結構工具箱/tools/independent-engineering-benchmarks.test.js" "結構工具箱/tools/independent-engineering-adapters/rc-wall-strength.js"
```

### E1-文件

審查報告原檔、複核紀錄、治理文件登錄，以及 `結構工具箱/tools/sync-home-update-dates.js` 重算之首頁工具更新日期。

```powershell
git add -- "docs/審查報告-2026-10-23.md" "docs/審查複核紀錄-2026-10-23.md" README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md "結構工具箱/assets/home/src/home.source.js" "結構工具箱/assets/home/home.js"
```

<!-- P2-SEGMENT:SG-05-009 -->
## 2026-10-23：E2 計算核心審查後續

依 `docs/審查報告-2026-10-23.md` 本機待辦 2–5、8 處理：錨栓部署重建、計算引擎版本與快取參數、正式工具黃金案例；覆工板原始 Excel 之更正另存新檔（`.xls` 不納入版本控制）。說明見 `docs/審查複核紀錄-2026-10-23.md` 第五至七節。

### E2-錨栓部署

以 `sync-anchor-deployment.ps1` 執行 verify 後重建並鏡像 `anchor/`（雜湊檔名整批替換），計算引擎版本隨建置 commit 更新。同步腳本不保留 `anchor/index.html` 之 `../tool-page-a11y.js` 載入標籤，鏡像後另行補回。

```powershell
git add -A -- anchor/index.html anchor/service-worker.js anchor/deployment-manifest.json anchor/assets
```

### E2-計算引擎版本與快取參數

依各工具版本模型升計算引擎或頁面版本（具名引擎升 *.v1.1.0、數字引擎與公開版本同升、RC 與鋼構升頁面版本、局部快算核心升 minor），遞增 RC 共用腳本、土壓與設備核心之 `?v=`；以既有建置器重產首頁、導覽、家族頁與石材 vendor，首頁更新日依 `結構工具箱/tools/sync-home-update-dates.js` 重算；測試與清冊之版本釘值同步更新，未刪除或放寬斷言。

```powershell
<!-- P2-SEGMENT:SG-05-010 -->
```

### E2-黃金案例

以 `結構工具箱/tools/formal-golden-harvest.js` 收割 28 案，18 案依修正後輸出更新 82 個 expectedSelectors 與 11 個 expectedTextNeedles。

```powershell
git add -- "結構工具箱/tools/formal-tools.manifest.json"
```

### E2-文件

複核紀錄補 Excel 更正、黃金案例與錨栓部署三節，治理文件登錄。

```powershell
git add -- "docs/審查複核紀錄-2026-10-23.md" README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md
```

### E2-載入預算基線

經委託人授權，以 `node 結構工具箱/tools/tool-load-budget.browser.test.js --write-baseline` 重設 53 路由基準 13,426,910 → 14,324,731 bytes（基準 commit 6a07e52c → e31c757e）。檢查模式先列出 48 條 capacityDifferences（RC 共用腳本 `?v=` 遞增 19 條、核心 steel.js、wind.js、seismic.js 增大 29 條），功能失敗 0、來源未漂移。總增量中 853,188 bytes 為 R1 加入之 `tool-nav.manifest.js`（10,981）與 `tool-chrome.js`（6,431）於 49 條路由，其路徑不屬共用腳本量測範圍，未列入 capacityDifferences；其餘 44,633 bytes 來自本批計算核心修正。重設後檢查模式 0 失敗。基準 JSON 只能由該指令產生，不得手改。

```powershell
git add -- 結構工具箱/tools/tool-load-budget-baseline.json
```

<!-- P2-SEGMENT:SG-05-011 -->
## 2026-10-23：E3 工程判斷事項更正

委託人同意 `docs/審查複核紀錄-2026-10-23.md` 第四節前四項依 112 年版原文更正（說明見同檔第十節）。本批未升頁面版本與 `?v=`（E2 已遞增且尚未發布）；覆工板原始 Excel 撓度改閉合解另存第二版（`.xls` 不納入版本控制）。

### E3-拉力伸展長度

依表 25.4.2.3 分有利條件（6.6／5.3）與其他情況（4.4／3.5），ψt·ψe ≤ 1.7；梁依淨間距、保護層與最少箍筋判定，柱依 25.7.2.1 排內根數判定，未提供條件時採其他情況；回歸預期值依手算更新，柱 A 類不適用例改用可鑑別之搭接長度。

```powershell
git add -- "鋼筋混凝土/shared/devlength.js" "鋼筋混凝土/shared/devlength.test.js" "鋼筋混凝土/tools/beam.html" "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/beam-regression-cases.json" "鋼筋混凝土/tools/column-regression-cases.json"
```

### E3-板溫度筋與沖剪係數

收縮與溫度鋼筋比依 24.4.3.2 固定 0.0018；沖剪係數依表 22.6.5.2 改為 0.53(1+2/β)、0.265(2+αs·d/bo)；板回歸例 Y 向 φVc 依手算更新。

```powershell
git add -- "鋼筋混凝土/shared/slab-evaluator.js" "鋼筋混凝土/shared/slab-evaluator.test.js" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/slab-regression-cases.json"
```

### E3-基礎剪力

單向剪力依表 22.5.5.1(c) 計 ρw 與上限，13.2.6.2 淺基礎與擋土牆取 λs = 1、樁帽單向與雙向剪力計 λs；雙向係數依表 22.6.5.2；基腳握裹與耐震錨定改用共用 DevLength；樁帽撓曲分列強度與最小鋼筋量；`鋼筋混凝土/tools/pile-cap-3d-stm.html` 之橋接腳本補 `?v=3`；獨立基準同步。

```powershell
git add -- "鋼筋混凝土/shared/foundation-isolated.js" "鋼筋混凝土/shared/foundation-isolated.test.js" "鋼筋混凝土/shared/foundation-pile.js" "鋼筋混凝土/shared/foundation-pile.test.js" "鋼筋混凝土/tools/foundation.html" "鋼筋混凝土/tools/foundation-regression.test.js" "鋼筋混凝土/tools/foundation-regression-cases.json" "鋼筋混凝土/tools/pile-cap-3d-stm.html" "結構工具箱/tools/independent-engineering-benchmarks.js"
```

### E3-文件

複核紀錄補第十節與覆工板 Excel 第二版，治理文件登錄。

```powershell
git add -- "docs/審查複核紀錄-2026-10-23.md" README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md
```

### E3-審查後修正

獨立程式審查指出之條件判定問題：梁逐排判定（含排間淨距與箍筋間距）、柱以實際淨距與箍筋間距判定、獨立基腳握裹兩向檢核；基礎頁無效輸入不沿用上次結果、樁帽缺尺寸不顯示 NaN、計算書文字補正；新增三個手算回歸案例。

```powershell
git add -- "鋼筋混凝土/tools/beam.html" "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/foundation.html" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/beam-regression-cases.json" "鋼筋混凝土/tools/column-regression-cases.json" "鋼筋混凝土/tools/foundation-regression-cases.json" "鋼筋混凝土/tools/foundation-regression.test.js" "docs/審查複核紀錄-2026-10-23.md" STAGING_GROUPS.md
```

### E3-Pages 公開頁錨點

Pages 部署流程之 `結構工具箱/tools/pages-live-smoke.js` 仍以 `V1.7` 檢查 RC 入口頁，RC 補強已於 E2 升為 V1.8，致 run 39932966975 於「Verify staged Pages artifact」失敗、未部署；錨點改為 `V1.8`，本機 `run-pages-artifact-smoke.ps1` 通過（HTTP 53 路由、瀏覽器 53 路由雙視窗 112 項）。

```powershell
git add -- "結構工具箱/tools/pages-live-smoke.js" STAGING_GROUPS.md
```

### E3-載入預算基線

經委託人授權，以 `node 結構工具箱/tools/tool-load-budget.browser.test.js --write-baseline` 重設 53 路由基準 14,324,731 → 14,345,255 bytes（基準 commit 7d4aabdf → 2b62f9a3）。檢查模式先列出 11 條 capacityDifferences：`devlength.js?v=3` 3,193 → 4,748（梁、柱、板、牆、剪力牆、基礎 6 路由）、`foundation-isolated.js?v=2` 5,605 → 12,494、`foundation-pile.js?v=2` 15,294 → 17,440（基礎、單樁）、`slab-evaluator.js?v=2` 9,200 → 9,213，以及 `/rc-pile-cap-3d-stm` 之 `pile-cap-3d-stm-bridge.js?v=3`（22,932 bytes，僅快取參數變更、大小不變）；功能失敗 0、來源未漂移。重設後檢查模式 0 失敗。基準 JSON 只能由該指令產生，不得手改。

```powershell
git add -- 結構工具箱/tools/tool-load-budget-baseline.json STAGING_GROUPS.md
```

<!-- P2-SEGMENT:SG-05-012 -->
## 2026-10-23：R2 首屏重排、首頁分組與 RC 柱程式外移

依架構建議第 5 節第二輪，分四組提交。計算核心、計算書模板、正式附件輸出與 `結構工具箱/assets/status/` 快照均未改動；首頁工具卡維持 53 項，載入預算基線未重設。

### R2-0 頂欄占位改由樣式表保留（修正 R1）

R1 的頂欄占位使用行內 style（min-height:44px），使版面測試對鋼構正式頁與連接板的行內樣式上限 0 失敗（R1 未跑該測試）。新增根目錄 `tool-chrome.css` 保留 44px 並在列印隱藏，49 頁移除行內樣式、在 head 第一個樣式表前 link；找不到工具時改以 `data-tool-chrome-empty` 釋放高度。本組對同時屬於 R2-3、R2-5 的 4 頁只提交占位修正部分。

```powershell
<!-- P2-SEGMENT:SG-05-013 -->
```

### R2-5 RC 柱內嵌程式外移

`鋼筋混凝土/tools/column.html` 的 246,721 bytes 主內嵌程式逐字移到 `鋼筋混凝土/tools/column.app.js`（未壓縮，同位置同步載入），頁面降為 46,336 bytes、純標記 95%；19 個情境的計算書與案例 JSON 改前改後逐位元組相同，HTML 加 JS 合計 gzip +0.70%。9 支以字面讀取柱頁程式的測試改讀還原後全文，未刪斷言。

```powershell
git add -- "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/column.app.js" "鋼筋混凝土/tools/column-app-extraction.contract.test.js" "鋼筋混凝土/tools/column-regression.test.js" "鋼筋混凝土/tools/rc-project-fingerprint.contract.test.js" "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/tool-workflow-adapters.test.js" "結構工具箱/tools/tool-workflow.manifest.test.js" tool-workflow.browser.test.js tool-page-layout.browser.test.js
```

### R2-3 工具頁首屏重排

RC 梁、風力 Kzt、鋼索索力三頁改為案件列、輸入、結果、輸出的首屏順序，存讀檔與共用表頭收進案件區，主要動作只留開始計算與計算書；新增 `結構工具箱/core/tool-shell.css` 由頁面 link 載入。三頁第一組工程輸入皆進入手機與桌機首屏；Kzt 原有表單標籤與對比問題修正為 axe 0；計算書與 JSON 逐位元組不變；未改任何 id。

```powershell
git add -- "鋼筋混凝土/tools/beam.html" "結構工具箱/tools/風力/wind-kzt.html" "結構工具箱/tools/cable-tension/cable-tension-frequency.html" "結構工具箱/core/tool-shell.css" "結構工具箱/tools/design/tool-shell.contract.test.js"
```

### R2-4 首頁分組與平台狀態降級

分類卡含「全部」成為唯一可見篩選（左側清單保留為隱藏狀態鏡像），「全部」依家族分段、每段先顯示 6 張，53 張卡皆在 DOM；卡片減密、Hero 減半；平台狀態改為頁尾精簡列並新增 `結構工具箱/platform-status.html` 完整狀態專頁與 `/platform-status` 路由。手機捲動長度約減半，CLS 0。

```powershell
git add -- "結構工具箱/index.html" "結構工具箱/assets/home/home.css" "結構工具箱/assets/home/src/home.source.js" "結構工具箱/assets/home/home.js" "結構工具箱/tools/sync-home-initial-view.js" "結構工具箱/platform-status.html" vercel.json homepage-quality.browser.test.js home-recents.browser.test.js "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/pages-live-smoke.js"
```

### R2-6 移除首頁隱藏分類鏡像（LCP 修正）

改前改後交替量測手機 Lighthouse：R2-4 後 LCP 由約 2,155 ms 升到約 2,480 ms。原因是首頁文件 14,804 bytes 超過模擬的初始傳輸視窗（約 14.6 KB），多一次往返；樣式表大小不是原因（壓縮到 27 KB 仍不變）。移除只供舊測試讀取的隱藏 `#categoryFilters` 鏡像後首頁降為 13,002 bytes；兩支測試改為斷言「不得有第二份分類清單」，未刪除按下狀態檢查。

```powershell
git add -- "結構工具箱/index.html" "結構工具箱/assets/home/src/home.source.js" "結構工具箱/assets/home/home.js" "結構工具箱/assets/home/home.css" "結構工具箱/tools/sync-home-initial-view.js" "結構工具箱/tools/nav/tool-chrome.browser.test.js" homepage-quality.browser.test.js
```

### R2-整合 門檻與治理登錄

首頁更新日期依賴表補上新檔；`toolbox-entrypoints.contract.test.js` 含柱頁全文讀取與首頁分組斷言；開發門檻由 34 條增為 36 條；新檔登錄 LF；登錄 README、TOOL_BOUNDARIES 與本文件。

```powershell
git add -- toolbox-entrypoints.contract.test.js phase-gates.commands.json run-phase-gates.contract.test.js .gitattributes README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md
```

