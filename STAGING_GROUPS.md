# Staging 分包建議

本檔把目前工作樹切成可審查的提交包。目的不是強制拆 commit，而是避免把平台修正、部署資產、候選工具目錄與既有使用者變更混在同一包。

## A. 平台穩定化與驗證入口

適合第一包提交。這包處理巡檢、preflight、ignore 與文件，不包含錨栓 build hash 資產。

可直接 staging 的檔案：

```powershell
git add -- .gitignore README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md preflight-tools.ps1 run-preflight-tools.bat continuous-beam-regression.test.js test-continuous-beam.ps1
git add -- "鋼構工具/audit-tool.ps1"
git add -- "結構工具箱/core/style.css"
git add -- "結構工具箱/tools/formal-browser-smoke.test.js"
git add -- "結構工具箱/tools/風力/wind-force.html" "結構工具箱/tools/風力/wind-object-frame.html" "結構工具箱/tools/風力/wind-object-solid.html" "結構工具箱/tools/風力/wind-object-tower.html" "結構工具箱/tools/風力/wind-open-roof.html" "結構工具箱/tools/風力/wind-fence-sign.html" "結構工具箱/tools/風力/wind-lattice-tower.html" "結構工具箱/tools/風力/wind-sign-pole.html"
git add -A -- "結構工具箱/tools/風力/wind-shape-factor.html"
```

需要人工 hunk review，不建議整檔直接 staging：

- `結構工具箱/core/wind-report.js`
- `結構工具箱/tools/風力/wind-cc.html`
- `結構工具箱/tools/風力/wind-parapet.html`

原因：這三個檔案在本輪前已經是 modified。若要納入，先用 `git diff -- <path>` 或互動式 staging 確認內容都屬於同一個修正主題。

建議提交訊息：

```text
Stabilize platform audits and tool preflight checks
```

## B. 錨栓部署鏡像

適合第二包提交。這包是 `/anchor/` 靜態部署輸出更新，必須讓舊 hash 刪除與新 hash 新增一起 staging。

```powershell
git add -A -- anchor/index.html anchor/service-worker.js anchor/assets
```

提交前檢查：

```powershell
Select-String -Path "anchor/index.html","anchor/service-worker.js" -Pattern "/anchor/|BASE_PATH"
```

建議提交訊息：

```text
Refresh anchor deployment assets
```

## C. 候選工具目錄

不建議在目前直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile 與 Word 產報 smoke。
- `鋼架/`：目前只有 `平面剛架分析.html`，可在確認用途後獨立一包納入。

## D. 高頻局部快算工具

已納入 `結構工具箱/tools/` 下，適合獨立小包提交。這類工具應維持「HTML 只渲染、core.js 做計算、*.test.js 做 golden regression」的形態。

```powershell
git add -- "結構工具箱/tools/foundation/foundation-local.html" "結構工具箱/tools/foundation/foundation-local-core.js" "結構工具箱/tools/foundation/foundation-local-core.test.js" "結構工具箱/tools/foundation/foundation-local-golden-cases.js"
git add -- "結構工具箱/tools/equipment/equipment-load.html" "結構工具箱/tools/equipment/equipment-load-core.js" "結構工具箱/tools/equipment/equipment-load-core.test.js" "結構工具箱/tools/equipment/equipment-load-golden-cases.js"
git add -- "結構工具箱/tools/earth/earth-pressure.html" "結構工具箱/tools/earth/earth-pressure-core.js" "結構工具箱/tools/earth/earth-pressure-core.test.js" "結構工具箱/tools/earth/earth-pressure-golden-cases.js"
git add -- "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "結構工具箱/index.html" "vercel.json" "preflight-tools.ps1"
```

注意事項：

- 不要把基礎局部工具放在 `結構工具箱/tools/基礎/`，目前 `.gitignore` 的 `基礎/` 規則會讓該資料夾被忽略。
- 初估型工具的標題、報表與 note 都應保留「初估 / 局部」語意，避免被誤用為完整規範設計。

## 提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
git diff --check
git status --short --untracked-files=normal
```
