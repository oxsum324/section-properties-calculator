# Joint Reactions 合成相容性樣本

本資料夾只保存為自動化測試製作的合成資料，用來固定轉接器支援的欄名、分隔符、前置說明與失敗關閉規則。

- 不是 CSI、ETABS 或 SAP2000 提供的官方範例。
- 不是任何實際工程模型的匯出結果。
- 不得作為分析結果、設計依據或正式附件來源。
- 檔名中的 `etabs-like`／`sap2000-like` 只表示格式相容性情境，不表示已覆蓋所有軟體版本。

樣本清冊與預期結果由 `manifest.json` 管理，並由 `joint-reaction-load-adapter-fixtures.test.js` 驗證。若日後取得已匿名化的實際匯出檔，應另標示為 `anonymized-observed-export`，保留軟體版本、匯出表名與單位系統後再加入，不得覆寫本合成樣本的來源聲明。

轉接器只允許 `Linear Static`／`LinStatic` 進入 D／L／W／E 線性組合。`Combination`、`Response Spectrum`、`Time History`、`Nonlinear Static`、其他 CaseType，以及同一節點與案例的多步驟／重複列都必須失敗關閉；清冊含單列 Response Spectrum 反例，避免以「只有一列」誤判為可線性疊加的基本案例。

## 實際匯出檔匿名化入口

原始匯出檔不得直接複製進本資料夾。建議使用收件 CLI；它會一次建立匿名候選、evidence、預設全部未核可的人工 review 與 intake receipt，並輸出到已由 Git 排除的 `output/anonymized-fixtures/joint-reactions/`：

```powershell
node .\鋼筋混凝土\shared\joint-reaction-observed-intake.js --input "<Joint Reactions 匯出檔>" --software ETABS --version "<實際版本>" --units "<實際單位>" --fixture-id "<小寫唯一 ID>"
```

也可在基礎工具頁讀入實際 CSV／TSV／TXT，填寫來源軟體版本、確認為實際匯出後，直接下載 `rc-joint-reaction-browser-intake-package.v1`。把下載物交由同一收件入口安全解包，不必複製貼上原始表格：

```powershell
node .\鋼筋混凝土\shared\joint-reaction-observed-intake.js --package "<基礎頁下載的 intake-package.json>"
```

解包會拒絕路徑跳脫、候選雜湊不符、預先核可 review 或非固定匿名輸出，並只重建 candidate、evidence、review 與 receipt 四個受控檔案；包內多餘欄位不會落盤。

瀏覽器與 Node 共用的底層 sanitizer core 會以固定 token 取代工程識別、節點、樓層與案例名稱，以合成值取代全部 F1～M3，清除前置說明及未知欄位資料；只保留原表頭、分隔格式、引號方式與列結構。收件工具固定以 `actual-observed` 聲明實際來源，並要求後續人工確認；底層 `--origin` 仍明確區分 `actual-observed`、`synthetic-compatibility` 或 `privacy-test`，只有前者可進入升級閘門。輸出的 `.evidence.json` 同時保存來源／匿名檔 SHA-256，但不保存來源路徑或檔名，且狀態固定為 `candidate-manual-review-required`。候選與 receipt 檔名只採匿名輸出 SHA-256 前綴，不得留下完整或部分來源 SHA-256；receipt 也不保存來源路徑、檔名或原始 SHA-256。必須逐項完成人工審閱清單及相容性測試後，才能另行升級為 `anonymized-observed-export`。

## 匿名觀察樣本升級閘門

先打開收件工具產生的 `.review.json`，填入有效 `reviewedAt`、`reviewer`，並只在逐項人工確認後把對應 assertion 改為 `true`。接著以 receipt 進行唯讀評估：

```powershell
node .\鋼筋混凝土\shared\joint-reaction-observed-intake.js --receipt "<candidate.intake.json>"
```

只有輸出 `ready: true` 後，才可在同一命令明確加上 `--promote yes`，把匿名檔及不含來源 SHA-256 的 provenance 寫入 `observed/`，並更新獨立的 `observed-manifest.json`。`joint-reaction-fixture-promotion-gate.js` 仍是底層閘門，預設只評估、不寫檔。審閱聲明有任一項未明確為 `true`、reviewer 仍是空白或模板佔位字、候選雜湊不符、來源不是 `actual-observed`、數值不是匿名器固定合成值、結構無法重播或 ID 重複，都會失敗關閉。原始匯出檔與 ignored candidate evidence 永遠不會由升級閘門複製進測試庫。
