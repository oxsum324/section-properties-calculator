# 覆工板系統計算工具

本工具用於覆工板面、覆工小梁、覆工大梁、共構柱、H 型鋼握裹與樁基承載的局部檢核。前端為單一靜態 HTML，並可匯出 JSON 供 Python 產生 Word 計算書。

## 主要入口

- `index.html`：瀏覽器版計算工具。
- `shared/h-section-table.js`：H 型鋼斷面、覆工板與載重範本資料。
- `report/gen_report.py`：讀取 JSON 並輸出 `.docx` 計算書。
- `產生計算書.bat`：本機快速呼叫 Word 產報腳本。
- `test-fixtures/report-smoke.json`：preflight 用固定產報樣本。
- `dump_xls.py`：Excel 原始表反查輔助腳本，需 Windows Excel COM / pywin32；不屬於日常執行路徑。

## 驗證

在 repo 根目錄執行：

```powershell
.\preflight-tools.ps1 -Quick
```

覆工板檢查會執行 Python 語法編譯，並使用 `test-fixtures/report-smoke.json` 產生一份 smoke `.docx` 到 `output/preflight/`。這可同時確認 `report/gen_report.py`、`python-docx` 與固定 JSON schema 的基本相容性。

## 納管邊界

納入 repo：

- 工具源碼。
- 報表產生器。
- 必要 shared data。
- 固定 smoke fixture。

不納入 repo：

- Excel 原始表。
- Word / PDF 計算書。
- `吊車/` 參考資料。
- `_extracted/` 抽圖與 OLE 物件。
- dump 文字檔、pycache 與本機產出。

## 使用提醒

本工具屬施工臨時構台與局部構件初步檢核工具，輸出結果需依實際施工載重、機具配置、支承條件與正式設計責任再複核。若載重條件或構件配置超出工具假設，不應直接採用計算書結論。
