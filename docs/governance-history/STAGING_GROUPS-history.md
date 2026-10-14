## 2026-10-11：T36 第二批共用執行期確定性壓縮


DOCX integration 的舊 popup 替身未提供現行 Blob／URL API，使用未壓縮來源也會失敗；本包僅補齊替身並檢查 MIME／Blob 導覽，不更動任何 report.js 或 report-utils.js。首次失敗與原替身重現紀錄保留，所有原 Word／可攜 HTML 斷言均保留。

## 2026-10-12：撤銷石材 KaTeX 按需載入（T43）、鋼構壓縮比例斷言改 70%（T42）


撤銷 `89ed9340 Load stone KaTeX on demand`：冷開石材頁不捲動即產出計算書時，16 個公式全以 TeX 原文輸出（例如 `R_p = 24.19 	ext{kgf/m}^{2}`），T43 前同流程 16/16 為 KaTeX 排版；KaTeX 改為公式進入預覽可視區才載入，正式輸出未等待載入。委託人裁定撤銷，石材頁回到 head 以 defer 載入 KaTeX。

