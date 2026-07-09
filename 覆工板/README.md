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

`decking-report.contract.test.js` 會先做 Python 語法編譯，再用 `test-fixtures/report-smoke.json` 產生一份 smoke `.docx` 到 `output/preflight/`。它同時確認 `report/gen_report.py`、`python-docx`、固定 JSON schema、案名 / 編號 / 日期與章節輸出仍正常，且頁面上的附件閱讀狀態不會混入 Word 計算書。

`decking-traceability.contract.test.js` 會檢查 `decking-traceability.catalog.json` 的條文語意追蹤，確認覆工板面 / 小梁 / 大梁、Pu 傳力與共構柱、握裹 / 樁基、JSON / Word 報表與施工臨設邊界各自追得到規範來源、輸入、計算核心、報告落點、測試證據與人工複核邊界。

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

## 條文語意追蹤

`decking-traceability.catalog.json` 是覆工板系統計算工具的條文語意追蹤 catalog，涵蓋：

- HS 20-44、PC400、吊車集中載重與覆工板面 / 小梁 / 大梁三組工況包絡。
- 鋼構容許應力、斷面分類、側撐、彎矩、剪力與撓度檢核。
- 大梁柱頂 Pu 三情境與共構柱 AISC 軸壓加雙軸彎矩交互式。
- H 型鋼貫入 PC 握裹力與砂層簡化樁基承載估算。
- 前端 JSON、Python Word 計算書、固定 smoke fixture 與施工臨設邊界。

新增或修改載重假設、公式路線、斷面表、報告段落、JSON 欄位或人工複核邊界時，請同步更新 `decking-traceability.catalog.json` 並執行 `node decking-traceability.contract.test.js`。此 catalog 用來讓審查者看得出每個判定追到哪裡，不取代施工圖、吊裝計畫、地質資料、材料證明、正式臨設模型或設計者判斷。

## 使用提醒

本工具屬施工臨時構台與局部構件初步檢核工具，輸出結果需依實際施工載重、機具配置、支承條件與正式設計責任再複核。若載重條件或構件配置超出工具假設，不應直接採用計算書結論。
