# 鋼構接頭檢核工具

目前版本為可離線開啟的前端小工具，版面套用鋼梁 / RC 梁式模板，統一採：

- 左側輸入資料
- 右側輸出報表
- 計算流程展開
- 核可判讀與列印模式

## 目前已支援

- `單剪力板 Shear Tab`
- `柱續接 Column Splice`
- `支撐 / Gusset 接頭`
- `梁柱彎矩接頭`

## 主要檢核內容

- 螺栓剪力
- 螺栓拉力
- 孔承壓
- 板件總斷面降伏
- 淨斷面斷裂
- 塊狀撕裂
- 填角銲強度
- Whitmore 有效寬度
- Panel Zone 等效容量篩選
- 最小 / 最大間距與邊距

## 檔案

- `index.html`：頁面與表單模板
- `styles.css`：介面樣式
- `calculator.js`：四種接頭的檢核公式
- `app.js`：互動、報表、參數字典與輸出
- `calculator.smoke-test.js`：快速回歸檢查

## 使用方式

直接開啟 [index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼構工具/index.html) 即可使用。

若要用本機伺服器開啟：

```powershell
python -m http.server 4173
```

再瀏覽：

```text
http://127.0.0.1:4173/index.html
```

## 目前邊界

- 孔型特殊行為仍以承壓型假設作提醒式檢查
- 未納入螺栓剪拉合成
- 未納入滑動臨界接頭
- 未納入 prying action、端板彎曲非線性與偏心栓群分析
- 耐震特別規定、continuity plate、panel doubler 仍需另行補充

## 驗證

```powershell
node .\calculator.smoke-test.js
```
