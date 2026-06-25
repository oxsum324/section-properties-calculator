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

## 自動巡檢

已提供整套 RC 巡檢腳本：

- [audit-tool.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/audit-tool.ps1:1)
- [run-audit.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit.bat:1)
- [run-audit-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit-loop.bat:1)

巡檢會跑：

- `shared/common.js` helper 單元測試
- 稽核狀態與首頁選單 contract
- 首頁入口瀏覽器 smoke
- 梁回歸測試與報告視覺 smoke
- 柱報告視覺 smoke contract
- 柱回歸測試與報告視覺 smoke
- 板回歸測試與報告視覺 smoke
- 牆回歸測試與報告視覺 smoke
- RC 條文語意追蹤 catalog
- 剪力牆完整 suite
- 剪力牆報告視覺 smoke
- 基礎回歸測試與報告視覺 smoke
- 單樁回歸測試與報告視覺 smoke

首頁入口瀏覽器 smoke 入口為 [tools/test-rc-index-menu.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-rc-index-menu.ps1:1)，會以本機 HTTP server 實際開啟首頁與各工具卡片，檢查：

- menu card 目標頁皆回傳 HTTP 200。
- browser console / page error / 4xx 或 5xx response 皆不得出現。
- 各工具頁需有 title 與基本可見內容，並輸出首頁截圖與 JSON 稽核紀錄。

RC 條文語意追蹤 catalog 位於 [tools/rc-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/rc-traceability.catalog.json:1)，目前覆蓋梁、柱、板、牆、剪力牆、基礎與單樁，集中登記：

- 採用的規範章節與條文路線。
- 對應輸入欄位、計算核心與報告落點。
- 覆蓋該路線的 regression / browser smoke 證據檔。
- 仍須依施工圖、專案模型或設計者判定人工複核的項目。

梁報告視覺 smoke 已接在 [tools/test-beam.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-beam.ps1:1)，會以瀏覽器產生計算書，檢查：

- 一般設計與 SMRF 剪力控制兩種代表報告情境。
- 梁斷面圖在計算書內有實際渲染。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格與圖示不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

柱報告視覺 smoke 已接在 [tools/test-column.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-column.ps1:1)，並由 [tools/column-report-visual.contract.test.js](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/column-report-visual.contract.test.js:1) 固定測試案例與品質門檻，會以瀏覽器產生計算書，檢查：

- 一般矩形柱、耐震搭接 Class A 不適用改列 B、首支箍筋/外區間距 NG 三種代表報告情境。
- 缺漏 / 複核摘要需位於總判定之後、細部檢核之前，並維持三張摘要卡。
- 耐震搭接、柱端錨定、橫向鋼筋間距與圍束等人工複核或不符項目需明確出現在報告中。
- 報告表格、摘要卡與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

板報告視覺 smoke 已接在 [tools/test-slab.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-slab.ps1:1)，會以瀏覽器產生計算書，檢查：

- 單向板基本例與無梁板邊柱保守例兩種代表報告情境。
- 板 1 m 寬條帶斷面配筋示意圖需實際進入計算書並完成渲染。
- 單向板係數法、簡化二向條帶初估、雙向衝剪與保守放大警語需出現在報告中。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、圖示與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

基礎報告視覺 smoke 已接在 [tools/test-foundation.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-foundation.ps1:1)，會以瀏覽器產生計算書，檢查：

- 獨立基腳與樁基／樁帽兩種代表報告情境。
- 樁基報告須揭露土層與單樁承載、群樁構造、服務性與樁身、樁帽結構四類檢核。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格與逐層承載力表不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

單樁報告視覺 smoke 已接在 [tools/test-single-pile.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-single-pile.ps1:1)，會以瀏覽器產生單樁計算書，檢查：

- 預設一般工程模式、BH-5 規範模式與細部參數需人工複核三種代表報告情境。
- 計算書須揭露採用方案、土層與單樁承載、服務性與樁身、規範假設檢核。
- 細部參數需人工複核時，計算書須列出「人工複核 / 補充資料需求」，並明示不列為 OK 結論。
- 土層與單樁採用深度示意圖需實際進入計算書並完成渲染。
- 逐層承載力表與候選方案矩陣需進入報告計算過程。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、示意圖與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

牆報告視覺 smoke 已接在 [tools/test-wall.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-wall.ps1:1)，會以瀏覽器產生計算書，檢查：

- 結構牆耐震與地下室外牆面外兩種代表報告情境。
- 牆水平斷面配筋示意圖需實際進入計算書並完成渲染。
- 條文對照與方法分級、面外 P-Δ、SBE 延伸與地下室外牆土壓概算需出現在報告中。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 報告表格、圖示與計算過程不得產生水平 overflow，並確認列印時 toolbar 隱藏。
- 輸出 PNG、PDF 與 JSON 稽核紀錄。

剪力牆 suite 入口為 [tools/test-shear-wall.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-shear-wall.ps1:1)，會同步檢查：

- `shared/pmsection.test.js`
- `shared/loadcases.test.js`
- `shared/wall-base.test.js`
- `shared/wall-evaluator.test.js`
- `tools/shear-wall-regression.test.js`

剪力牆報告視覺 smoke 入口為 [tools/test-shear-wall-report.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools/test-shear-wall-report.ps1:1)，會以瀏覽器產生計算書，檢查：

- 正常耐震牆與 Pu 軸力越界兩種報告情境。
- P-M 圖與牆斷面圖在計算書內有實際渲染。
- 報告不得出現 `NaN` / `Infinity` / `undefined` / `null` / `∞` 等原始無效值。
- 軸力越界時須明確呈現 `c@Pu 不採用` 與 `不適用`，不得誤列為 OK 結論。
- 輸出 PNG、PDF 與 JSON 稽核紀錄，並確認列印時 toolbar 隱藏。

## 執行方式

單次巡檢：

```powershell
.\audit-tool.ps1 -Quiet
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

單跑梁回歸測試與報告視覺 smoke：

```powershell
.\tools\test-beam.ps1
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

單跑首頁入口瀏覽器 smoke：

```powershell
.\tools\test-rc-index-menu.ps1
```

## 維護品質門檻

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
