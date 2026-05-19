# Staging 分包建議

本檔把目前工作樹切成可審查的提交包。目的不是強制拆 commit，而是避免把平台修正、部署資產、候選工具目錄與既有使用者變更混在同一包。

## A. 平台穩定化與驗證入口

適合第一包提交。這包處理巡檢、preflight、ignore 與文件，不包含錨栓 build hash 資產。

可直接 staging 的檔案：

```powershell
git add -- .gitignore README.md TOOL_BOUNDARIES.md STAGING_GROUPS.md preflight-tools.ps1 run-preflight-tools.bat continuous-beam-regression.test.js test-continuous-beam.ps1
git add -- "鋼構工具/audit-tool.ps1"
git add -- "結構工具箱/tools/風力/wind-force.html" "結構工具箱/tools/風力/wind-object-frame.html" "結構工具箱/tools/風力/wind-object-solid.html" "結構工具箱/tools/風力/wind-object-tower.html" "結構工具箱/tools/風力/wind-open-roof.html" "結構工具箱/tools/風力/wind-shape-factor.html"
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

- `石材固定/`：工具成熟度最高，但混有參考 PDF、範例 doc、專案報告圖檔與 vendor 檔。建議先建立「程式碼清單」後分批納入。
- `開挖擋土支撐/`：backend/frontend 架構清楚，但混有工程案例、輸出與 TypeScript build info。建議先納入 `backend/`、`frontend/src/`、設定與 tests，再處理範例資料。
- `覆工板/`：目前仍是工具與案例資料混合。建議先納入 `index.html`、`report/`、`shared/`、`dump_xls.py`，大型 Excel/Word/PDF 另放參考資料或 ignore。
- `鋼架/`：目前只有 `平面剛架分析.html`，可在確認用途後獨立一包納入。

## 提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
git diff --check
git status --short --untracked-files=normal
```
