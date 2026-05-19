# 擋土支撐計算網頁工具 v1

以 `2_開挖擋土支撐-v95000.xlsm`、既有分析輸出與計算書工作流為基礎，建立的單機本地版 web 工具。
目前版本已包含：

- `FastAPI + SQLite + 本地專案資料夾` 的後端骨架
- `.RIO / .LST / .o` 分析文字檔匯入 parser
- Excel `Fa / Fbx / Fby / LdaB / LdaC / Ratio` 對應的計算核心
- 支撐、橫擋、斜撐、大角撐、柱構件的檢核流程
- React + TypeScript 單頁 workflow 介面
- PDF 計算書輸出
- 後端基礎單元測試

## 專案結構

- `backend/app`: API、專案儲存、Excel 參考資料載入、parser、計算與報表
- `backend/tests`: parser 與計算 smoke tests
- `frontend`: React + Vite 前端
- `app_data`: 執行後自動建立，存放 SQLite、專案 JSON、匯入檔與 PDF 報表

本機工程案例、`.LST/.o/.i` 分析檔、Word/PDF 輸出與 Excel 參考活頁簿不隨程式碼提交；若要完整使用 Excel 參考資料，請在本機放置 `2_開挖擋土支撐-v95000.xlsm`。

## 啟動方式

### HTML 模式

直接建置前端並由後端提供靜態 HTML 頁面：

```powershell
.\start_html_mode.ps1
```

啟動完成後，開啟 `http://127.0.0.1:8000` 即可使用。

停止服務：

```powershell
.\stop_html_mode.ps1
```

### 1. 安裝後端套件

```powershell
C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pip install -r backend\requirements.txt
```

### 2. 啟動後端 API

```powershell
C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. 啟動前端開發伺服器

```powershell
cd frontend
npm install
npm run dev
```

開啟 `http://127.0.0.1:5173` 即可使用。

## 建置前端

```powershell
cd frontend
npm run build
```

建置完成後，FastAPI 會自動掛載 `frontend/dist`，可直接由後端提供靜態頁面。

## 測試

```powershell
C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest discover -s backend\tests
```

## 目前實作重點

- 參考資料直接讀取 `2_開挖擋土支撐-v95000.xlsm` 的型鋼、螺栓與預設案例
- 匯入分析檔後會保存原檔到 `app_data/projects/<id>/`
- 計算結果會寫回專案狀態，PDF 則輸出到 `app_data/reports/` 與專案資料夾

## 目前限制

- 柱構件檢核已可用，但仍屬第一版規範化移植，複雜案例仍建議和既有 Excel/計算書交叉比對
- `.RIO` 的支援目前以 LST 類文字格式最佳努力解析為主
- PDF 版面先以穩定輸出為優先，尚未完全複刻既有 Word 計算書版型
