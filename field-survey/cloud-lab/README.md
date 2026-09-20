# 現況鑑定雲端整合測試 0.1

測試網址：https://field-survey-cloud-lab.oxsum324-learning.workers.dev/

這是獨立的流程原型，正式現況工具仍為 V0.22.2。沒有修改正式資料庫、備份格式或原有網站；測試包不能匯入正式工具。Cloudflare R2 未啟用、Google Drive 尚未串接，Firebase 未部署。

## 使用方式

1. 可選自己的 JPEG／PNG，在本機試算 300／600 PPI 的照片副本，原檔不變，選取照片不會上傳。依列印寬度換算像素，不放大原圖；以實際輸出像素計算 PPI，並非修改 JPEG 的 DPI 標籤。副本移除原有 EXIF，僅供列印比較，不是案件交換包。
2. 建立共用測試空間，把頁面的完整連結給另一台裝置。連結中的隨機識別是測試空間的存取憑證，勿公開轉貼；不是正式登入／角色權限。
3. 選同事甲／乙、位置、狀況及合成照片品質，上傳測試包。伺服器只接受兩張已知合成 JPEG 與選單值，拒絕任意照片、文字和案件檔案。
4. 集中端取得提交，相同內容重送不增筆；相同位置有不同狀況時，先選保留哪種或兩者都保留。
5. 下載整合 JSON，下載前驗證整份提交及 JPEG SHA-256；未採用來源也保留，正式報告與案件沒有被修改。

## 雲端儲存與邊界

- Workers + D1 實際保存合成 JPEG 位元組與提交紀錄，並非僅在 localStorage 模擬。
- 只用小型資料庫驗證流程，不將 D1 當正式照片倉庫。
- 單次提交最多 400,000 bytes，全站至多 300 筆；插入上限與唯一鍵由 SQL 處理，重送不覆蓋。
- 每個空間依隨機識別的 SHA-256 分隔，查詢及下載均限定所屬空間。
- 七天後不再讀取，之後有新提交時清除到期資料；不宣稱到期當下即刪除。
- 不提供任意檔案上傳、修改／刪除正式案件或完整協作登入。不同狀況僅用於示範待核對項目，不推斷兩者互斥或屬於工程矛盾。
- 同一提交編號若內容不同回覆 409，原提交保留。上傳失敗可重送。

## 容量與費用建議（2026-09-20 查核）

使用者提供現有 Google Drive 付費容量為 5 TB；本次沒有查核帳戶剩餘空間。建議原始照片與完整備份仍保存至 Drive，網頁及提交比對由 Cloudflare 提供。

| 方案 | 官方限制／費用 | 適用定位 |
|---|---|---|
| 已有 Google Drive 5 TB | 依使用者既有方案；容量與授權是不同問題 | 原圖及完整案件保存 |
| Cloudflare R2 Standard | 免費 10 GB-month；超過後 US$0.015 / GB-month，另有操作額度與費用；直接從 R2 傳出不收流量費 | 若未來願意使用按量計費，適合程式化照片存取 |
| Firebase Cloud Storage | 需 Blaze 可計費方案；新 bucket 免費用量依地區／Google Cloud Storage 條件；舊 appspot bucket 有不同額度 | 適合想整合登入、資料庫與同步的應用，不能當免費 5 TB 空間 |
| Cloudflare Workers／D1 | Workers Free 每日 100,000 請求；D1 Free 共 5 GB、每日讀 500 萬列／寫 10 萬列 | 頁面、索引、提交紀錄；本原型的小型合成資料 |

例如 1,000 張 × 5 MB 約為 5 GB；壓成每張 1 MB 約為 1 GB。實際容量需另計既有檔案、錄音、備份與保留版本。免費 R2 額度約能長期放 2,000 張 5 MB 原圖，與 5 TB 相差很大。以 5,000 GB 全月使用估算，R2 Standard 純儲存約 US$74.85／月（扣 10 GB 免費額度），操作等費用另計。此為估算，並非帳單。

本次沒有啟用 R2、Firebase Blaze 或調整帳號付費方案。現有 R2 API 回覆「Please enable R2 through the Cloudflare Dashboard」。Drive 先前寫入測試因連線授權範圍不足失敗，容量充足不會解除該限制。

官方來源：
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

## 驗證與維護

執行 `node field-survey/cloud-lab/build.cjs` 由 index.html 與 client.js 產生 assets.js；worker.js 為入口，fixtures.js 僅含合成 JPEG。透過 Cloudflare API 以 ES modules 上傳三個模組，D1 binding 名稱為 DB。schema.sql 只供新資料庫初始化，不對既有資料庫重跑建表。

獨立 Worker：field-survey-cloud-lab；獨立 D1：field-survey-cloud-lab。D1 read replication disabled，保持測試提交後立即可讀。

執行 `node field-survey/cloud-lab/verify.cjs` 對線上測試站驗證：
- 兩個獨立 Chrome 瀏覽器環境上傳／列出／下載。
- 300／600 PPI 本機試算，選取照片時無 POST 請求。
- 重複提交、同編號異內容拒絕、選擇採用及保留所有來源。
- 提交與照片指紋核對、未授權與其他空間讀取拒絕、任意照片拒絕、大小上限。
- 同一分頁切換空間連結、390px／1200px 排版，以及線上 HTML／JS 位元組。

證據位於不發布的 output/cloud-lab-validation。此測試不等於實體 iOS／Android、斷線续傳、大量原圖或正式 .csurvey 合併驗證。
