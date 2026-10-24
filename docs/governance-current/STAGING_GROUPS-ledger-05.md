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
