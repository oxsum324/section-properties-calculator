# 專案檔案清單

此清單用於搬移、備份、交接或納入版本管理前，判斷哪些檔案是核心工具，哪些是參考資料或可再生產物。

## 核心工具檔案

- `石材計算書產生器_規範版V2.html`：目前正式使用的 V2 前端工具。
- `server.py`：本機 HTTP 伺服器、靜態檔服務與匯出 API。
- `auto_word.py`：V2 一鍵 Word 匯出流程。
- `generate_docx.py`：舊版相容 DOCX 產生器，V2 payload 必須使用前端 results。
- `verifier.py`：輔助檢核腳本。
- `pdf_to_docx.py`：PDF 轉 Word 輔助流程。
- `paged.polyfill.js`：列印分頁使用的 Paged.js polyfill。
- `docx-9.6.1.tgz`：前端 DOCX 產生相關套件封存。
- `vendor/`：V2 HTML 離線執行所需第三方前端資產，包括 KaTeX、PDF.js、docx IIFE 與風壓 / 地震分區資料。

## 前端計算核心

- `js/constants.spec.js`：V2 規範版常數。
- `js/calculator.spec.js`：V2 規範版計算核心。
- `js/regression-smoke.test.js`：代表案例回歸測試。
- `js/formula-registry.spec.js`：計算項目的公式、單位與規範來源集中登錄。
- `js/formula-registry-smoke.test.js`：檢查實際檢核項目是否都有公式來源登錄。
- `js/code-profiles-registry.spec.js`：規範 profile、指紋、profile-owned 輸入綁定與安全同步 helper。
- `js/code-profiles-registry-smoke.test.js`：profile schema、雜湊、切換同步與人工覆寫保留測試。
- `js/version-sync.js`：V2 頁面側欄版本標示同步 helper。
- `js/version-sync-smoke.test.js`：版本標示同步 helper 的 Node smoke test。
- `js/review-dashboard.js`：審查儀表板狀態文字、交付品質分級、匯出前品質提醒、匯出前檢查 HTML 與確認門檻 helper。
- `js/review-dashboard-smoke.test.js`：審查儀表板狀態、交付品質、匯出前品質提醒、匯出前檢查 HTML 與確認門檻 helper 的 Node smoke test。
- `js/constants.js`、`js/calculator.js`：舊版或簡化版核心，保留作相容參考。

## 啟動與維護腳本

- `開啟石材計算書.bat`：建議使用的一鍵啟動入口。
- `啟動伺服器.bat`：前景啟動伺服器，適合除錯。
- `自我檢查.bat`：整合版本一致性、計算核心、伺服器 smoke test 與語法檢查。
- `比對稽核報告.bat`：比較兩份匯出稽核報告，並用品質門檻判斷是否退步。
- `清理暫存檔.bat`：列出已知暫存檔，預設不刪除。
- `建立交接包.bat`：預覽核心交接 ZIP 內容，預設不產生檔案。
- `交付前檢查.bat`：正式交付前品質門檻入口，整合自我檢查、稽核比對與交接包驗證。
- `註冊快速啟動.reg`：Windows 快速啟動註冊檔。
- `生成Word報告.bat`、`PDF轉Word.bat`：舊流程或輔助流程入口。

## 自動檢查與維護

- `self_check.py`：檢查路徑、版本、文件與變更紀錄一致性。
- `env_check.py`：檢查本機 Python、Node 與匯出相關 Python 套件。
- `server_smoke_test.py`：離線測試匯出安全、防 fallback、CORS、靜態檔範圍與 JSON 驗證。
- `release_bundle_smoke_test.py`：測試交接包核心檔完整、排除規則、manifest 驗證與 ZIP 可讀性。
- `ui_smoke_test.py`：以瀏覽器檢查 V2 頁面、審查儀表板、預覽頁、側欄版本標示、儀表板收合與明細視窗。
- `audit_schema.py`：稽核報告必要欄位 schema 與缺漏欄位檢查共用工具。
- `audit_schema_test.py`：稽核報告 schema 共用工具 smoke test。
- `audit_compare.py`：比對兩份匯出稽核報告，追蹤交付品質、正規化 DCR、警示最高 DCR、DCR 方法、工具/伺服器 HTML 一致性、稽核欄位完整性、未通過、警示與公式來源差異。
- `audit_compare_test.py`：稽核報告比對工具 smoke test。
- `cleanup_temp.py`：安全列出或清除已知暫存檔，並拒刪 workspace 外路徑與根目錄。
- `cleanup_temp_test.py`：暫存清理工具 smoke test，確認候選清單、刪除、workspace 邊界/根目錄保護與 `.gitignore` 規則覆蓋。
- `make_release_bundle.py`：產生核心工具交接 ZIP，檔名沿用 `SERVER_VERSION`，ZIP 內含 `RELEASE_MANIFEST.json` 追蹤檔案雜湊，可選擇包含參考資料或舊版檔案，並沿用清理工具規則排除遞迴目錄中的快取與暫存檔。
- `verify_release_bundle.py`：讀取交接 ZIP 內的 `RELEASE_MANIFEST.json`，驗證檔案大小與 SHA-256。
- `pre_delivery_check.py`：非互動交付前檢查流程，串接自我檢查、最新稽核品質門檻與暫存交接 ZIP 驗證。
- `.gitignore`：忽略可再生暫存、快取、測試輸出與匯出產物。

## 文件

- `README.md`：啟動、匯出、維護與清理說明。
- `CHANGELOG.md`：版本變更紀錄。
- `RELEASE_CHECKLIST.md`：正式送審或交付前人工檢查清單。
- `PROJECT_FILES.md`：本檔，說明檔案用途與保存建議。

## 參考資料與範例

- `01_背扣雙角鐵.jpg`
- `02_插銷鐵件.jpg`
- `02套管式膨脹螺栓.jpg`
- `02鎚釘式膨脹螺栓.png`
- `石材安裝施工規範.pdf`
- `建築物外牆石材施工規範研擬.pdf`
- `石材固定檢覈V1.101.xls`
- `完整計算書範例.doc`
- `簡化計算書(範例).pdf`
- `stone_report (5).json`

## 舊版或相容參考

- `石材計算書產生器.html`
- `石材計算書產生器_直接Word版.html`
- `石材計算書產生器_規範版.html`

正式使用與匯出應以 `石材計算書產生器_規範版V2.html` 為準；舊版檔案保留作比較與回溯，不建議作正式輸出來源。

## 可再生或可清理產物

以下類型通常可由 `清理暫存檔.bat` 或 `.gitignore` 處理，不建議納入正式版本管理：

- `__pycache__/`
- `.playwright-cli/`
- `test-results/`
- `tmp/`
- `output/`
- `release/`
- `_tmp_spec*/`
- `_tmp_stone_report*`
- `tmp-spec-inline*.js`
- `server-test.log`、`server-test.err`
- `plot.log`
- `sshot-*.jpg`
- `stone_report_test*`
- 參考 PDF / Excel / Word 範例、施工圖片與 `專案報告/` 圖檔屬可另行保存的參考資料，不列入核心版本控管。
