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

`src/anchorTraceabilityCatalog.test.ts` 會檢查 catalog 結構、證據檔存在、README 說明，以及核心原始碼仍保留 17.6、17.7、17.8、17.9、17.10、22.8.3 與補強鋼筋路線。repo 根層級的 `螺栓檢討/anchor-traceability.contract.test.js` 另會檢查平台 preflight、首頁 governance 與 staging / boundary 文件是否同步，讓 `anchor-traceability-contract` 成為獨立可追溯 gate。新增計算路徑、報告段落或人工判斷邊界時，需同步更新 catalog 與 contract test。

## 常用指令

```powershell
npm run typecheck
npm run lint
npm run test
npm run verify
```

更新原始碼後，從 repo 根目錄執行部署同步：

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
```

部署同步會以 `ANCHOR_BASE_PATH=/anchor/` build，刷新 `anchor/` 靜態輸出與 `anchor/deployment-manifest.json` 的 source fingerprint。提交時應把原始碼變更與 `/anchor/` 部署鏡像變更分清楚檢查。

## 人工複核邊界

本工具的正式判定仍依賴設計者輸入與專案文件。下列事項不得只由工具輸出取代人工判斷：產品評估報告版本與適用條件、裂縫狀態、施工圖邊距與間距、地震載重組合與 Omega 值、補強鋼筋伸展與實際配筋、基板偏心承壓接觸區、剪力榫與柱腳整體設計。
