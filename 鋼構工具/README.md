# 鋼構正式規範核算工具

目前接頭主工具版本為 V1.1，可離線開啟；版面套用鋼梁 / RC 梁式模板，正式規範核算目前收斂於下列模組，統一採：

- 左側輸入資料
- 右側輸出報表
- 計算流程展開
- 核可判讀與列印模式
- 內建自巡檢狀態顯示

## 目前可提供正式規範核算之模組

- `連接板檢核 Connection Plate`
- `拉力構件 Tension Member`
- `單剪力板 Shear Tab`（V1 正式範圍限 LRFD、單列 2–12 栓、栓距 ≤ 76.2 mm、板高 ≤ 914.4 mm、剪力板與梁腹板 Fy ≤ 345 MPa、單剪、表 10.3-5 標準孔、靜力承壓型、雙面填角銲與純剪力）
- `支撐接頭｜平板支撐 Gusset 拉力接頭`（V1 正式範圍限 LRFD、扁鋼／平板支撐矩形截面且全截面元素直接連接、正軸向同心拉力、靜力非耐震且非 BRB、F10T 標準孔單剪、單一直線 2–12 栓，以及 Gusset 至支承材兩側對稱縱向填角銲）

## 開發中模組

- `柱續接 Column Splice`
- `梁柱彎矩接頭`

上述兩個開發中模組仍保留於程式內，但主工具不會把它們作為正式規範覆核入口。

## 主要檢核內容

- 連接板全斷面降伏
- 連接板有效淨斷面斷裂
- 連接板區塊剪力破壞
- 拉力構件全斷面降伏
- 拉力構件有效淨斷面斷裂
- 拉力構件長細比
- 螺栓剪力
- 螺栓拉力
- 孔承壓
- 塊狀撕裂
- 填角銲、全滲透開槽銲、部分滲透開槽銲、塞孔 / 塞槽銲強度
- 最小 / 最大間距與邊距
- Shear Tab 最低設計剪力 `Vd = max(|Vu|, 4.5 tf)`
- Shear Tab 偏心栓群剪力與剪力板 / 梁腹板偏心孔承壓
- Shear Tab 剪力板全斷面剪力降伏、淨斷面剪力斷裂、板件與梁腹板單剪面 L 路徑塊狀撕裂，以及採 `e_p = max(e_b, e_w)` 的剪力板彎剪
- Shear Tab 偏心銲群之銲材與母材強度，以及表 10.3-5 孔徑、`e_b` 分支、`e_w`、雙面 `5/8 t_p` 填角銲、材料強度順序、Fy 與程序幾何硬上限、填板、孔距與邊距細部
- Gusset 與平板支撐的孔承壓、總斷面降伏、淨斷面斷裂，以及單一直線栓列採一個縱向剪力面加一個橫向拉力面之 L 路徑塊狀撕裂；栓接 Gusset 依 4.3 採 `Ae = min(An, 0.85Ag)`，平板支撐全截面元素直接連接則固定 `U = 1.0`、`Ae = An`
- F10T 承壓式螺栓剪力依表 10.3-2 採含牙 `4.00 tf/cm²`（`392.266 MPa`）、不含牙 `5.00 tf/cm²`（`490.333 MPa`），LRFD `φ = 0.75`
- 單一直線栓列 Whitmore 起始寬度固定為 0，`Lconn = (n−1)s`、理論寬度 `bW = 2Lconn tan30°`，再與專案實際可用板寬取較小值以求有效面積及降伏
- Gusset 雙側縱向填角銲之銲材、Gusset 母材與支承材母材三條強度路線，以及銲腳最小／最大、短銲道與長銲道硬邊界

## 檔案

- `index.html`：頁面與表單模板
- `plate-check.html`：連接板獨立入口頁
- `styles.css`：介面樣式
- `calculator.js`：單剪力板、平板支撐 Gusset 拉力接頭、多接頭、連接板與拉力構件的檢核公式
- `app.js`：互動、報表、參數字典與輸出
- `tool-metadata.js`：鋼構正式工具名稱與 canonical 版號；正式報告不得再由頁面標題推測版本
- `calculator.smoke-test.js`：快速回歸檢查
- `steel-traceability.catalog.json`：鋼構條文語意追蹤 catalog，集中登記規範來源、輸入、計算路線、報告落點、測試證據與人工複核邊界
- `steel-traceability.contract.test.js`：檢查 traceability catalog schema、證據檔案、人工複核文字與開發中接頭邊界
- `audit-tool.ps1`：自動巡檢腳本，支援單次靜默檢查與循環巡檢
- `run-audit.bat`：可直接雙擊啟動單次靜默巡檢
- `run-audit-loop.bat`：可直接雙擊啟動循環靜默巡檢
- `sync-formal-core.ps1`：同步 `鋼構工具/core` 與 `結構工具箱/core` 的正式頁共用核心
- `run-sync-formal-core.bat`：可直接雙擊執行 formal core 同步
- `core/formal-core-manifest.json`：正式頁 vendored core 的來源、雜湊與同步時間指紋；共用計算書預覽可下載保留唯一且靜態可讀之文件狀態、核可時間與計算指紋的目前版本 HTML，重新開啟不重複插入狀態列，列印／存 PDF 的預設標題亦包含文件狀態與指紋

## 使用方式

直接開啟 [index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/index.html) 即可使用。

若要直接開啟獨立連接板工具，可使用：

[plate-check.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/plate-check.html)

若要用本機伺服器開啟：

```powershell
python -m http.server 4173
```

再瀏覽：

```text
http://127.0.0.1:4173/index.html
```

鋼梁 / 鋼柱正式頁現在可單獨部署於 `鋼構工具` 根目錄；其共用核心已內聚在 `core/materials/steel.js` 與 `core/ui/report.js`。
同步後的來源路徑、SHA256 指紋與同步時間會寫入 `core/formal-core-manifest.json`。

連接板、拉力構件、單剪力板、平板支撐 Gusset 拉力接頭、鋼梁與鋼柱正式計算書固定輸出 `產出工具`、`工具版本`、`輸出時間` 與 `計算指紋`。六類正式核算皆可匯出及重新匯入計算來源 JSON，保留案件資料、採用輸入、設計法與結果快照，並與同次正式計算書共用計算指紋；匯入時會驗證 schema、工具種類、工具版本及來源／報告快照指紋，重算指紋不同時回復原輸入，不會把近似結果誤標成重現成功。Gusset 來源 JSON 另採精確欄位集合、嚴格布林與列舉驗證，並比較完整內嵌報告；任何多欄、缺欄、型別錯誤或報告竄改都會交易式回復原輸入。跨模組匯入會先切換輸入卡可見性與欄位啟用狀態，再收集完整來源欄位；重播失敗時以同一路徑交易式回復原模組。來源 JSON 是機器可讀追溯資料，不會混入計算書內容。頁首與結果區的輸出按鈕都統一開啟同一份正式報表，不直接列印操作頁；browser audit 會實際點擊結果區按鈕、以真實檔案重現來源、拒絕錯誤版本、比對來源 JSON／計算書指紋並驗證產出的 PDF。SkyCiv、ClearCalcs、Dlubal 等介面功能借鏡僅保留在操作頁與本 README，不進入正式計算書或 PDF。

主工具連接板、主工具拉力構件、主工具單剪力板、主工具平板支撐 Gusset 拉力接頭、獨立連接板、鋼梁與鋼柱共 7 份正式計算書預覽也提供 TXT 文字備查下載。TXT 直接由畫面上的同一份計算書狀態衍生，不另行重算；檔案使用 UTF-8 BOM，包含來源文件狀態、產出工具、版本、輸出時間、計算指紋及可重算的文字內容 SHA-256，並固定明列「正式附件資格：否」。圖形、版面、核可控制與可執行完整性驗證仍以核可 HTML 或列印／存成 PDF 為準；附件組包器會以 `non-formal-reference-text` 阻擋 TXT 成為正式附件。舊版鋼梁／鋼柱延續頁不在此功能範圍，工作頁直接列印封鎖也不變。

## 目前邊界

- Shear Tab V1 正式範圍限 LRFD、單剪力板、單列 2–12 支 CNS F10T 螺栓、栓距不大於 76.2 mm、板高不大於 914.4 mm、單剪、表 10.3-5 標準孔、靜力承壓型、雙面填角銲及純剪力；ASD、非零軸力、外加彎矩、非表列孔徑或單面銲會禁止核可
- Shear Tab 的偏心栓群、偏心銲群與剪力板彎曲篩核採專案指定之彈性模型；剪力板彎曲取 `e_p = max(e_b, e_w)`，板件與梁腹板塊狀撕裂採一個縱向剪力面加一個橫向拉力面的 L 路徑。標準孔 `e_b` 至少依 AISC EJ 2011 Table 1 取 2–5 栓 `a/2`、6–12 栓 `a`，`e_w` 不小於栓列至銲線距離，雙面銲腳不小於 `5/8 t_p`。設計者仍須以分析模型與核定施工圖確認 `Vu`、偏心及實際力流
- Shear Tab 的剪力板與梁腹板 Fy 均不得大於 345 MPa，各材料須滿足 Fu ≥ Fy，並須由設計者依核定材料規範確認可採 AISC EJ 2011 以 Fy = 36/50 ksi 建立之材料延性基礎；勾選確認不能覆寫 Fy、栓距或板高硬上限
- Shear Tab 不含高強或低延性鋼材、延伸型構造、滑動臨界、疲勞、反覆載重、耐震特別規定、火害、腐蝕、梁端削切，以及支承構件整體或局部極限狀態
- Gusset V1 只接受 `Pu > 0` 且 `requiredShear = requiredMoment = eccentricity = 0`；設計法、F10T 螺栓、表列標準孔、單剪、單一直線 2–12 栓、材料 `Fu ≥ Fy`、扣孔淨寬、Whitmore 可用板寬、雙側縱向銲及四項依據、兩項工程師確認均為封閉式硬條件。F10T 剪力採表 10.3-2 的 4.00／5.00 tf/cm² 路線；栓接 Gusset 有效淨斷面採 `Ae = min(An, 0.85Ag)`。支撐材限扁鋼／平板矩形截面且所有截面元素由單列栓直接連接，固定 `U = 1.0`、`Ae = An`；angle、WT、HSS 與剪力遲滯均排除。Gusset 與平板支撐塊狀撕裂固定採一個縱向剪力面加一個橫向拉力面的 L 路徑
- Gusset V1 的 Whitmore 連接長度必須大於 0 且等於 `(n−1)s`；單列 fastener-group 起始寬度為 0，理論寬度採 `2Lconn tan30°`，有效寬度再與專案可用板寬取較小者。表 10.3-2 註 [e] 原針對承壓式接合之續接拉力構材，規定平行拉力方向接合長度超過 125 cm 時表值降低 20%；本 Gusset 為端部接合，V1 在尚未實作長接合路線前保守援用 `Lconn ≤ 1250 mm`，並非一般接合之條文上限。`gussetConnectionWidth` 僅為 Gusset 栓孔斷面 gross plate width，用於 Ag／An，不是 Whitmore 初始寬；Gusset 淨寬同時受該 gross width 扣孔後之寬度與實際可用 Whitmore 寬限制。不含壓力、偏心、疲勞、反覆載重、耐震接頭、BRB、Gusset 壓力屈曲、折角外移與支承構件整體或局部極限狀態
- 連接板與拉力構件的孔型特殊行為仍以承壓型假設作提醒式檢查，且未納入偏心栓群與螺栓剪拉合成
- 連接板幾何推導目前限定矩形板與規則孔群
- 拉力構件之幾何模式目前以規則孔群與常用銲接配置為主，特殊交錯孔群宜改採面積輸入
- 拉力構件銲接模組目前以單一銲道型式之靜力設計為主；若同一受力面存在組合銲道，仍應另依 10.2.5 整理後確認
- 柱續接、梁柱彎矩接頭、prying action、端板彎曲非線性、continuity plate 與 panel doubler 仍需另行補充

## 條文語意追蹤

鋼構條文語意追蹤 catalog 位於 [steel-traceability.catalog.json](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/steel-traceability.catalog.json:1)，目前覆蓋：

- 鋼構正式規範主工具：連接板、拉力構件、單剪力板 Shear Tab、平板支撐 Gusset 拉力接頭，以及柱續接與梁柱彎矩兩個開發中接頭邊界。
- 獨立連接板：standalone 入口與主工具連接板路線一致性。
- 鋼梁正式頁：第七章撓曲、剪力、HSS 與使用性邊界。
- 鋼柱正式頁：第八章軸壓、互制、HSS 與有效長度邊界。

這份 catalog 不取代規範或設計者判定；它用來確保每個正式鋼構工具都能追到規範來源、輸入欄位、計算核心、報告落點、測試證據與人工複核事項。`audit-tool.ps1` 會執行 `steel-traceability.contract.test.js`，避免新增或修改鋼構工具時只補頁面、不補 traceability。

## 網路參考工具

以下網站僅作功能流程與報表呈現方式參考，不作本工具之規範依據：

- [SkyCiv Connection Design](https://skyciv.com/structural-software/connection-design-software/)
- [ClearCalcs](https://clearcalcs.com/)
- [Dlubal](https://www.dlubal.com/)
- [AISC Design Examples](https://www.aisc.org/publications/design-examples/)

## 驗證

```powershell
node .\calculator.smoke-test.js
```

若要執行完整自動巡檢：

```powershell
.\audit-tool.ps1
```

若更新了 [結構工具箱/core](/C:/Users/USER/Desktop/AI/小工具製作/結構工具箱/core) 內的正式頁共用核心，可先同步：

```powershell
.\sync-formal-core.ps1
```

若要直接雙擊同步，也可執行：

```text
run-sync-formal-core.bat
```

若只想檢查是否已漂移、不直接覆蓋：

```powershell
.\sync-formal-core.ps1 -Check
```

若要以靜默模式執行單次巡檢：

```powershell
.\audit-tool.ps1 -Quiet
```

若要循環執行巡檢：

```powershell
.\audit-tool.ps1 -Quiet -Loop -IntervalSeconds 60
```

`audit-tool.ps1` 目前也會自動檢查 `鋼構工具/core` 是否仍與 `結構工具箱/core` 保持同步。
巡檢同時會檢查 `steel-traceability.catalog.json`，確認正式鋼構工具的條文語意追蹤與人工複核邊界仍完整。
巡檢情境已包含主工具連接板、拉力構件、單剪力板、平板支撐 Gusset 拉力接頭、獨立連接板頁，以及鋼梁 / 鋼柱正式頁的實頁快照。瀏覽器段落由單一 Edge CDP browser runner 執行，不需額外 npm 套件，並逐情境設定 timeout；桌機代表案例會實際下載 7 份 TXT，核對 BOM、檔名、內容、SHA-256 與附件組包阻擋結果。

或直接執行：

```text
run-audit.bat
```

若要直接啟動循環巡檢：

```text
run-audit-loop.bat
```

巡檢輸出會寫入：

- `output/audit/audit-summary.md`
- `output/audit/audit-summary.json`
- `output/audit/audit-status.json`
- `output/audit/playwright-*.txt`
- `output/audit/playwright-*.png`
- `output/audit/history/<runId>/...`

若以本機或區網伺服器開啟工具，右側報表上方會顯示最新一輪鋼構本機自巡檢狀態；公開部署則改讀 `結構工具箱/assets/status/platform-status.json`，明確標示為平台公開巡檢快照，不會請求未發布的 `output/audit/audit-status.json`。
