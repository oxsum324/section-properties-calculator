# 鋼構正式規範核算工具

目前版本為可離線開啟的前端小工具，版面套用鋼梁 / RC 梁式模板；正式規範核算目前收斂於下列模組，統一採：

- 左側輸入資料
- 右側輸出報表
- 計算流程展開
- 核可判讀與列印模式
- 內建自巡檢狀態顯示

## 目前可提供正式規範核算之模組

- `連接板檢核 Connection Plate`
- `拉力構件 Tension Member`

## 開發中模組

- `單剪力板 Shear Tab`
- `柱續接 Column Splice`
- `支撐 / Gusset 接頭`
- `梁柱彎矩接頭`

上述開發中模組仍保留於程式內，但主工具已不作為正式規範覆核入口。

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

## 檔案

- `index.html`：頁面與表單模板
- `plate-check.html`：連接板獨立入口頁
- `styles.css`：介面樣式
- `calculator.js`：多接頭、連接板與拉力構件的檢核公式
- `app.js`：互動、報表、參數字典與輸出
- `calculator.smoke-test.js`：快速回歸檢查
- `audit-tool.ps1`：自動巡檢腳本，支援單次靜默檢查與循環巡檢
- `run-audit.bat`：可直接雙擊啟動單次靜默巡檢
- `run-audit-loop.bat`：可直接雙擊啟動循環靜默巡檢
- `sync-formal-core.ps1`：同步 `鋼構工具/core` 與 `結構工具箱/core` 的正式頁共用核心
- `run-sync-formal-core.bat`：可直接雙擊執行 formal core 同步
- `core/formal-core-manifest.json`：正式頁 vendored core 的來源、雜湊與同步時間指紋

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

## 目前邊界

- 孔型特殊行為仍以承壓型假設作提醒式檢查
- 未納入螺栓剪拉合成
- 未納入滑動臨界接頭
- 未納入 prying action、端板彎曲非線性與偏心栓群分析
- 連接板幾何推導目前限定矩形板與規則孔群
- 拉力構件之幾何模式目前以規則孔群與常用銲接配置為主，特殊交錯孔群宜改採面積輸入
- 銲接模組目前以單一銲道型式之靜力設計為主；若同一受力面存在組合銲道，仍應另依 10.2.5 整理後確認
- 耐震特別規定、continuity plate、panel doubler 仍需另行補充

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
巡檢情境已包含首頁、獨立連接板頁，以及鋼梁 / 鋼柱正式頁的實頁快照。

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

若以本機伺服器模式開啟工具，右側報表上方會直接顯示最新一輪 `內建自巡檢狀態`。
