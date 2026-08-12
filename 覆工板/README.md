# 覆工板系統計算工具

本工具用於覆工板面、覆工小梁、覆工大梁、共構柱、H 型鋼握裹與樁基承載的局部檢核。前端為單一靜態 HTML，並可匯出 JSON 供 Python 產生 Word 計算書。

## 主要入口

- `index.html`：瀏覽器版計算工具。
- `shared/h-section-table.js`：H 型鋼斷面、覆工板與載重範本資料。
- `report/gen_report.py`：讀取 JSON 並輸出 `.docx` 計算書。
- `產生計算書.bat`：本機快速呼叫 Word 產報腳本。
- `../結構工具箱/tools/construction-stage-load-handoff.js`：以現行覆工板核心重算並封裝共構柱施工階段軸力交接檔。
- `../結構工具箱/tools/建立覆工板施工階段荷重交接檔.bat`：將完整覆工板 JSON 拖曳後產生交接檔的 Windows 入口。
- `test-fixtures/report-smoke.json`：preflight 用固定產報樣本。
- `dump_xls.py`：Excel 原始表反查輔助腳本，需 Windows Excel COM / pywin32；不屬於日常執行路徑。

## 驗證

在 repo 根目錄執行：

```powershell
.\preflight-tools.ps1 -Quick
```

`decking-report.contract.test.js` 會先用 `decking-result-replay.js` 讀取 `test-fixtures/report-smoke.json` 的六組輸入，直接執行目前 `index.html` 計算核心，核對覆工板面、小梁、大梁、共構柱、握裹與樁基共 31 項結果；通過後才以重算 JSON 及同一計算指紋產生一份 smoke `.docx`。一般驗證寫入 `output/preflight/`；正式 release 則把當輪來源 JSON、DOCX 與摘要保存在 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/decking-formal/`。契約會確認 `report/gen_report.py`、`python-docx`、固定 JSON schema、案名 / 編號 / 日期、計算指紋與章節輸出仍正常，且頁面上的附件閱讀狀態不會混入 Word 計算書；平台總閘門會再解壓當輪 DOCX，重新核對來源與成品 SHA-256、文字、章節、表格、檔案尺寸及 page-only 排除清單。

正式 release 另以共通 OOXML 封裝檢查確認 DOCX 沒有未引用媒體／頁首頁尾、實際批註、未接受修訂、外掛範本、外部圖片、嵌入物件、巨集或非預期 custom XML。這項檢查只存在於內部交付證據，不寫入計算書。

`decking-traceability.contract.test.js` 會檢查 `decking-traceability.catalog.json` 的條文語意追蹤，確認覆工板面 / 小梁 / 大梁、Pu 傳力與共構柱、握裹 / 樁基、JSON / Word 報表與施工臨設邊界各自追得到規範來源、輸入、計算核心、報告落點、測試證據與人工複核邊界。

## 施工階段荷重交接

覆工板控制軸力可交給「開挖擋土支撐」的指定共構柱使用，但不會在兩個工具之間自動套用：

1. 在覆工板頁輸出包含輸入、結果與計算指紋的完整 JSON。
2. 將 JSON 拖曳到 `../結構工具箱/tools/建立覆工板施工階段荷重交接檔.bat`。
3. 產生器會以目前 `index.html` 計算核心重算 `Pu1 / Pu2 / Pu3 / PuMax`，核對原結果與計算指紋後，輸出帶有 `CSH-` 指紋的交接 JSON。
4. 在開挖工具的指定共構柱按「匯入並套用覆工板交接檔」。匯入後仍須重新計算，才會把控制軸力列為 `Np`。

原始覆工板結果、計算指紋、交接指紋、目標種類、單位或邊界宣告任一不符即拒絕匯入。交接檔只傳遞經重算核對的控制軸力與工況身分，不傳遞核可狀態，也不代表柱位置、支承反力分配、偏心、二階效應或完整施工階段模型已經複核。

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
