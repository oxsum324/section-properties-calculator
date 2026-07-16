# 石材固定計算書工具

此資料夾目前以 `石材計算書產生器_規範版V2.html` 作為主工具頁面，後端由 `server.py` 提供本機匯出服務。

主要版本變更請見 `CHANGELOG.md`；正式輸出前檢查請見 `RELEASE_CHECKLIST.md`；檔案用途與保存建議請見 `PROJECT_FILES.md`。

## 啟動方式

雙擊 `開啟石材計算書.bat`。

流程會自動檢查 `http://127.0.0.1:8765/status`：

- 伺服器已啟動時，直接開啟 V2 工具頁。
- 伺服器未啟動時，背景啟動 `server.py` 後再開啟 V2 工具頁。

若需要看伺服器訊息，可改用 `啟動伺服器.bat`，它會以前景視窗執行。

## 匯出方式

建議使用 V2 頁面內建的匯出按鈕。

匯出時工具會：

- 使用 V2 畫面目前的計算結果。
- 在匯出前顯示必要檢查，例如案例是否存在、是否有未通過項目、簽章資料是否完整。
- 若有未通過或警示項目，審查明細可填寫工程覆核註記；註記會隨專案 JSON 保存並輸出至審查摘要。
- 審查儀表板會顯示交付品質分級：A 可交付、B 附註交付、C 先修正。
- 產生稽核報告 JSON，記錄工具版本、範本來源、輸入雜湊、交付品質、正規化控制 DCR、警示最高 DCR、DCR 檢核類型統計、伺服器一致性評估、公式來源覆蓋率、覆核註記數、計算摘要與輸出檔案。

正式送審或交付前，請搭配 `RELEASE_CHECKLIST.md` 逐項確認工程資料、附件、稽核報告與輸出版面。
若要跑完整交付前品質門檻，可雙擊 `交付前檢查.bat`。

## 修改後自我檢查

修改工具後，雙擊 `自我檢查.bat`。

它會執行：

- `python env_check.py`
- `python self_check.py`
- `node --check js\regression-smoke.test.js`
- `node js\regression-smoke.test.js`
- `node --check js\formula-registry.spec.js`
- `node --check js\formula-registry-smoke.test.js`
- `node --check js\version-sync.js`
- `node --check js\version-sync-smoke.test.js`
- `node js\version-sync-smoke.test.js`
- `node --check js\review-dashboard.js`
- `node --check js\review-dashboard-smoke.test.js`
- `node js\review-dashboard-smoke.test.js`
- `node js\formula-registry-smoke.test.js`
- `node --check js\code-profiles-registry.spec.js`
- `node --check js\code-profiles-registry-smoke.test.js`
- `node js\code-profiles-registry-smoke.test.js`
- `python server_smoke_test.py`
- `python audit_schema_test.py`
- `python audit_compare_test.py`
- `python cleanup_temp_test.py`
- `python release_bundle_smoke_test.py`
- `python ui_smoke_test.py`
- `node --check js\calculator.spec.js`
- `node --check js\constants.spec.js`
- `python -m py_compile server.py auto_word.py generate_docx.py verifier.py pdf_to_docx.py self_check.py server_smoke_test.py cleanup_temp.py cleanup_temp_test.py make_release_bundle.py release_bundle_smoke_test.py verify_release_bundle.py pre_delivery_check.py env_check.py ui_smoke_test.py audit_schema.py audit_schema_test.py audit_compare.py audit_compare_test.py`

`env_check.py` 會檢查 Python、Node、python-docx、lxml、pdf2docx、playwright 與 Chromium 是否可用。
其中 `js/regression-smoke.test.js` 會檢查標準插銷式、背扣式與方向性風壓三組代表案例，避免計算核心回到舊版假設。
`js/formula-registry-smoke.test.js` 會檢查實際計算項目都有對應的公式、單位與規範來源登錄；V2 審查儀表板、審查明細與輸出檢核表會引用同一份來源表。
`stone-traceability.contract.test.js` 會檢查 `stone-traceability.catalog.json` 的條文語意追蹤，確認風力 / 耐震需求、錨栓與連接件、石材板塊與孔位、使用性與交付稽核各自追得到規範來源、輸入、計算核心、報告落點、測試證據與人工複核邊界。
`js/version-sync-smoke.test.js` 會用 mock DOM 檢查側欄版本標示 helper。
`js/code-profiles-registry-smoke.test.js` 會檢查 active profile、指紋、profile-owned 輸入同步、專案 profile 正規化與 profile-owned migration 預設；切換 profile 時只更新仍等於舊 profile 預設的欄位，使用者自行覆寫的值會保留。`ui_smoke_test.py` 另以隔離瀏覽器驗證專案 JSON 在匯入／重新載入後會完整取代 runtime profile；缺少 `Ip / ap / Rp` 時依 active profile 補齊並記錄 `meta.applied_defaults`，明示人工值則保留，避免換電腦遺失選擇、被另一個專案的 localStorage 狀態汙染，或出現 profile 與實算欄位矛盾。
`js/regression-smoke.test.js` 另以實際計算核心驗證保守耐震 profile 的 Rp 同步與 Fph 需求差異，避免 registry 選項只改 metadata、不改實算。
`js/review-dashboard-smoke.test.js` 會檢查審查儀表板伺服器狀態文字、交付品質分級、匯出前品質提醒、匯出前檢查 HTML 與確認門檻 helper。
`self_check.py` 會檢查 V2 HTML 檔名、前端版本、後端版本、啟動批次檔、自動 Word URL、README、CHANGELOG 與正式輸出清單是否一致，並避免 smoke test 硬寫目前版本。
`server_smoke_test.py` 會離線檢查 V2 `/generate` fallback 阻擋、前端 results 來源判斷、匯出稽核報告摘要、CORS 白名單、靜態檔範圍與 JSON payload 驗證。
`audit_schema_test.py` 會檢查稽核必要欄位 schema 與缺漏路徑偵測；`audit_compare_test.py` 會檢查兩份匯出稽核報告的交付品質、未通過數、警示數、控制 DCR、警示最高 DCR、DCR 正規化方法、伺服器狀態是否已評估、工具/伺服器 HTML 一致性、稽核必要欄位缺漏、公式來源與覆核註記差異比對。
`cleanup_temp_test.py` 會檢查暫存清理工具只處理已知候選、拒刪 workspace 外路徑與根目錄，且 `.gitignore` 有覆蓋清理規則；`release_bundle_smoke_test.py` 會檢查交接包核心檔案完整、暫存/輸出/舊版檔案預設不混入、遞迴目錄會排除快取與暫存，交接包排除規則涵蓋清理工具清單並被 `.gitignore` 覆蓋，manifest 可由 `verify_release_bundle.py` 驗證，且缺少 manifest、manifest schema/頂層欄位/檔案欄位格式錯誤、`output_name` 與實際 ZIP 檔名不符、檔名版本或 flavor 與 manifest 不符、SHA-256 不符、出現未登錄額外檔案、重複路徑或 manifest 含不安全路徑都會被拒絕，並在系統暫存資料夾試建 ZIP。
`ui_smoke_test.py` 會用瀏覽器檢查 V2 頁面、審查儀表板、預覽頁、側欄版本標示、儀表板收合與儀表板明細視窗。
`pre_delivery_check.py` 會非互動執行自我檢查、最新稽核報告品質門檻（若 `output` 內至少有兩份稽核報告）、交接包 dry-run、暫存 ZIP 建立與 manifest 驗證。

## 暫存檔清理

雙擊 `清理暫存檔.bat` 可列出已知測試暫存檔。此批次檔只做 dry-run；確認清單後，可執行 `python cleanup_temp.py --apply` 並輸入 `YES` 進行清理。

`.gitignore` 已忽略可再生的暫存檔、測試輸出、快取與 `output` 匯出資料夾；正式交付檔仍請依 `RELEASE_CHECKLIST.md` 另行歸檔。

## 條文語意追蹤

`stone-traceability.catalog.json` 是 V2 正式計算書的條文語意追蹤 catalog，涵蓋：

- 風力、耐震需求、code profile 指紋，以及專案匯入／重新載入時的 profile 還原、profile-owned 缺值補齊與跨專案隔離。
- 膨脹螺栓、背扣、馬車螺栓、插銷、伸縮片與角鋼檢核。
- 石材板彎曲、孔周剪應力、背擴孔錐形拉出、孔位幾何、厚度、面積、材料與自訂尺寸檢核。
- 層間變位、掛件轉角、溫度伸縮縫、稽核 JSON、公式來源覆蓋與 golden sample drift 管理。

新增或修改規範來源、公式路線、報告段落、輸入欄位或人工複核邊界時，請同步更新 `stone-traceability.catalog.json` 並執行 `node stone-traceability.contract.test.js`。此 catalog 的定位是讓審查者看得出每個判定追到哪裡，不取代施工圖、材料證明、專案文件或設計者判斷。

## 交接與備份

正式交付前可先雙擊 `交付前檢查.bat`；此入口會執行完整自我檢查、稽核回歸門檻與交接 ZIP 驗證。

雙擊 `建立交接包.bat` 可預覽核心交接 ZIP 內容。確認後執行 `python make_release_bundle.py --apply` 產生核心工具包，ZIP 檔名會沿用 `SERVER_VERSION`，並內含 `RELEASE_MANIFEST.json` 記錄版本、打包選項、檔案清單與 SHA-256；可用 `python verify_release_bundle.py release\交接包.zip` 驗證 ZIP 內容是否仍符合 manifest。若要連同參考 PDF、圖片與範例一併打包，執行 `python make_release_bundle.py --apply --include-reference`。

若要比較兩次匯出的稽核報告，可執行：

```bat
python audit_compare.py output\舊版_驗證報告.json output\新版_驗證報告.json
```

也可以直接雙擊 `比對稽核報告.bat`，依提示輸入兩份稽核報告路徑；或將兩份 `_驗證報告.json` 依序拖曳到批次檔上。
若直接雙擊且不提供檔案，會自動比較 `output` 資料夾中最新兩份 `_驗證報告.json`。

命令列也可直接比對最新兩份：

```bat
python audit_compare.py --latest
```

若要作為品質門檻，遇到交付品質、未通過數、警示數、控制 DCR、DCR 正規化方法、伺服器狀態尚未完成稽核評估、工具/伺服器 HTML 一致性、稽核必要欄位缺漏或公式來源缺漏變差時回傳失敗碼：

```bat
python audit_compare.py output\舊版_驗證報告.json output\新版_驗證報告.json --fail-on-regression
```

正式交付前若 `output` 資料夾已有前次稽核檔，也可直接執行：

```bat
python audit_compare.py --latest --fail-on-regression
```

若新版稽核報告缺少必要欄位，文字輸出會列出缺漏路徑，方便回查是哪個匯出流程漏寫。

## 維護注意

- 修改工具功能或匯出流程後，請同步更新 `CHANGELOG.md`。
- 新增、移除或改名重要檔案後，請同步更新 `PROJECT_FILES.md`。
- 主頁面檔名應維持與 `server.py`、`auto_word.py`、`開啟石材計算書.bat` 一致。
- 若調整 V2 預設值、材料參數、風壓或耐震公式，請同步更新 `js/regression-smoke.test.js` 的基準值。
- 若新增可切換 profile 或 profile-owned 輸入欄位，請同步更新 `PROFILE_INPUT_BINDINGS`，並驗證舊預設會跟隨切換、人工覆寫不被覆蓋、專案 JSON 重載可還原選擇、缺值依 active profile 補齊並留下 `meta.applied_defaults`，且預設專案不會沿用其他專案的 runtime 覆寫。
- 若修改內建範本，請同步更新 `TEMPLATE_CATALOG_VERSION`，讓匯出稽核報告可追溯範本來源。
- 不建議再使用舊版 `石材計算書產生器_規範版.html` 作為正式匯出來源。

---

## 治理鏈強化（2026-04-27 起）

V2 已完成 17 點治理檢查全閉環，並建立 8 項一鍵驗證套件。完整紀錄請見 `dev_tools/architecture.md`。

### 一鍵全測試（建議定期執行）

```cmd
tests\run_all_tests.bat
```

涵蓋 8 項驗證：
1. regression smoke（calc-core 計算正確性）
2. formula-registry smoke（32 個 check 對應規範完整性）
3. review-dashboard smoke（交付品質 A/B/C/D 評級）
4. version-sync smoke
5. V2 HTML inline JS 語法
6. baseline drift（5 組 golden samples）
7. auto_word.py 指紋閘門端對端
8. 視覺裝飾（tier banner / 法規 footer / dock mode / 預設值徽章）

退出碼：`0` = 全通過；非 0 = 失敗（log 在 `tests/_run_log/`，摘要 JSON 在 `_last_summary.json`）

### 啟動診斷（非開發者友善）

開啟 `dev_tools/diagnostics.html` 自動檢測：瀏覽器環境、V2 主檔、計算核心三檔、KaTeX 字型、本地伺服器、LocalStorage、5 組 golden samples 完整性。

### 治理治項

- **計算核心單一來源**：所有正式輸出（PDF / Word / XLSX / 稽核 JSON / 儀表板）皆從 `getCalculationResults()` 結構化 API 讀取，禁止 DOM 反向解析
- **三層公式指紋**：`calc_source_hash`（calc-core 三檔 SHA-256）+ `input_hash` + `result_hash` 自動計算
- **跨門檻顯示守衛**：DCR=1.004 強制顯示 1.004，不被四捨五入掩蓋為 1.00（責任風險守衛）
- **草稿模式**：缺指紋的 payload 經 `auto_word.py` 渲染時自動加「草稿 DRAFT」浮水印
- **Golden samples 護欄**：5 組案例自動拍攝、排程定期偵測漂移
- **校核流程欄位**：created_by / checked_by / approved_by / revision history（多技師事務所）
- **規範版本綁定**：封面與預覽末頁顯示「主要計算依據」（耐風 / 耐震 / 錨栓 / 石材）
- **舊檔轉換可見**：載入 v1 schema 時 toast 顯示「套用預設欄位 N 項」
- **verifier 容許值配置**：`dev_tools/verifier.config.json` 分類容許值（封閉式 1e-6 / 經驗 ±2% / 查表 ±0.5% / DCR must_not_cross 0.9/1.0）

### 排程

每日自動跑全測試：
```cmd
schtasks /Create /SC DAILY /ST 06:00 /TN "V2_All_Tests" ^
  /TR "C:\Users\USER\Desktop\AI\小工具製作\石材固定\tests\run_all_tests.bat"
```

### 開發模式

URL 加 `?dev=1` 啟用 dev 浮層（含 baseline capture）：
```
http://127.0.0.1:8765/石材計算書產生器_規範版V2.html?dev=1
```
詳見 `dev_tools/baseline_capture.html`。

### 變動 calc-core 後

修改 `js/calculator.spec.js` 後：
- `calc_source_hash` 自動變動 → baseline diff 偵測為漂移
- 跑 `tests\run_all_tests.bat` 確認結果不漂移
- 若為刻意漂移（規範修訂、bug 修正），走 approved drift 流程：
  - 重拍：`python tests\golden\auto_capture.py`
  - 在 `tests\golden\_approval_log.md` 新增 UPDATE entry，含 reason 與 calc_source_hash 前後值
