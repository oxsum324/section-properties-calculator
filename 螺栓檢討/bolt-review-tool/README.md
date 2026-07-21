# 錨栓檢討 React 工具

此目錄是 `/anchor/` 部署鏡像的原始碼。工具以 Vite / React 實作，用於混凝土結構用錨栓檢討、產品評估資料追蹤、耐震路徑判讀、基板承壓延伸檢核與報告匯出。

## 核心範圍

- 建築物混凝土結構設計規範第17章：拉力、剪力、拉剪互制、最小邊距 / 間距 / 厚度與 17.10 耐震路徑。
- 第22.8.3 支承承壓：基板下混凝土承壓、偏心承壓 stress state 與 uplift 邊界提醒。
- 後置錨栓產品評估：ACI 355.2 / 355.4、ETA、ICC-ES ESR 或同等評估資料的欄位完整性與文件連結。
- 錨栓補強鋼筋：17.5.2.1(d) / 17.5.2.1.1 條件式替代 breakout 路徑。

## 條文語意追蹤

`src/anchor-traceability.catalog.json` 是本工具的條文語意追蹤 catalog。每筆 trace 必須能對齊：

- 規範來源
- 輸入欄位
- 計算路線
- 報告落點
- 測試或程式證據
- 人工複核邊界

`src/anchorTraceabilityCatalog.test.ts` 會檢查 catalog 結構、證據檔存在、README 說明，以及核心原始碼仍保留 17.6、17.7、17.8、17.9、17.10、22.8.3 與補強鋼筋路線。repo 根層級的 `螺栓檢討/anchor-traceability.contract.test.js` 另會檢查平台 preflight、首頁 governance 與 staging / boundary 文件是否同步，讓 `anchor-traceability-contract` 成為獨立可追溯 gate；`螺栓檢討/anchor-report.contract.test.js` 則把報告匯出與附件閱讀狀態、`reportDocumentState` 文件分類、`backup.test.ts` 案例重現，以及 `tests/reportArtifacts.test.ts` 的實體產物測試收斂成平台層報告邊界 gate。正式 release 會把同一案例序列化的 HTML、DOCX、XLSX 留在當輪 `anchor-formal`，再由總閘門解析 HTML、DOCX / XLSX ZIP 內容與工作表清冊，不以通過日誌取代成品。新增計算路徑、報告段落、workbook/docx 邊界、正式產物留存或人工判斷邊界時，需同步更新 catalog 與 contract test。

HTML 工作頁的產報前檢查只供操作判讀，不會整張搬入計算書。HTML、DOCX、XLSX 新輸出一律預設為可列印的「內部審閱」；勾選「本計算內容已完成審閱，核可作為正式附件」後，三種輸出都標示「正式附件」並記錄核可時間。計畫名稱、案號、公司、設計人、複核人及發行日期可留空，空白列省略並由主文承接。工程檢核不符仍如實列入計算書，但不會自動形成 DRAFT；文件核可也不代表工程結果 PASS。計算內容變更時既有核可會自動撤銷。

工作區 JSON 自 v2 起會為每一案例保存目前採用產品、計算版本與 `evaluateProjectBatch` 重算結果的 SHA-256 指紋。匯入時先驗證 schema / 版本，再於寫入 IndexedDB 前重新計算；缺少案例、產品不符或指紋不同時完全保留原工作區。既有 v1 備份仍可匯入救回，但會移除無法覆驗的舊留痕、標示為計算版本未確認，且文件回到內部審閱。v2 案例合併時因 ID、名稱、附件識別與更新時間可能重編，來源 audit trail 與文件核可也會撤銷，避免把已失效 hash 誤認為目前案件簽章。

## 常用指令

```powershell
npm run typecheck
npm run lint
npm run test
npm run verify
node ..\anchor-report.contract.test.js
```

更新原始碼後，從 repo 根目錄執行部署同步：

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
```

部署同步會以 `ANCHOR_BASE_PATH=./` build，刷新 `anchor/` 靜態輸出與 `anchor/deployment-manifest.json` 的 source fingerprint。相對資源路徑讓同一份鏡像可部署於 GitHub Pages 的倉庫子路徑與 Vercel `/anchor/`；提交時應把原始碼變更與部署鏡像變更分清楚檢查。

## 人工複核邊界

本工具的正式判定仍依賴設計者輸入與專案文件。下列事項不得只由工具輸出取代人工判斷：產品評估報告版本與適用條件、裂縫狀態、施工圖邊距與間距、地震載重組合與 Omega 值、補強鋼筋伸展與實際配筋、基板偏心承壓接觸區、剪力榫與柱腳整體設計。
