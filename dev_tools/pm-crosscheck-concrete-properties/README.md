# RC 柱 P-M 離線交叉驗證（concrete-properties）

本資料夾是開發用的離線比對腳本，不是工具頁、計算書或正式附件的一部分，也不屬於已登錄的獨立工程基準（`結構工具箱/tools/independent-engineering-benchmarks.catalog.json`）。`dev_tools/` 由 Pages 建置器以私有目錄排除，不會發布。

## 決策

不把 concrete-properties 整合進小工具，只作為 RC 柱 P-M「斷面力學層」的離線交叉驗證基準。

理由：

1. 授權：concrete-properties 為 MIT 授權（見下節），沒有授權障礙；但整合需在瀏覽器端提供 Python 執行環境（或改寫為 JavaScript），並引入 numpy、scipy、shapely、matplotlib 等相依套件，整合成本高。
2. 驗證範圍：concrete-properties 只有 AS3600、NZS3101 設計模組，沒有 ACI 318 或台灣規範模組。φ 折減、φPn,max 與台灣規範檢核（需求點利用率、細部、剪力、長柱放大）它驗證不了，因此不納入。
3. 後續：RC P-M 核心（`鋼筋混凝土/shared/pmsection.js`）或柱配筋函式（`鋼筋混凝土/tools/column.app.js` 的 `makeLayoutSym`、`expandBundle`、`getRebarPositions`、`buildBars`）有改動時，重跑本資料夾的三支柱對照。

## 授權

- concreteproperties 0.8.0：wheel 內 `concreteproperties-0.8.0.dist-info/licenses/LICENSE` 第一行為「MIT License」，著作權人 Robbie van Leeuwen；METADATA 的 `License: MIT License`。
- sectionproperties 3.10.2（相依套件）：同樣為 MIT License。
- 本資料夾的腳本只以 `import` 呼叫上述套件，沒有複製或修改其原始碼；虛擬環境與套件不進 repo。

## 檔案

| 檔案 | 用途 |
|---|---|
| `cases.json` | 三支柱案例輸入（N、mm、MPa） |
| `tool_pm.js` | 小工具端：直接 `require` repo 內 `pmsection.js`，並以 `vm` 執行從 `column.app.js` 原文抽出的四個配筋函式；不修改任何檔案 |
| `cp_pm.py` | concrete-properties 端：鋼筋座標直接取自 `tool_pm.js` 輸出，確保幾何一致 |
| `compare.py` | 對照並寫出 `compare_tables.md`、`summary.json` |
| `run_all.sh` | 一次跑完上述三步並記錄執行環境 |

輸出一律寫入已被 `.gitignore` 忽略的 `output/pm-crosscheck-concrete-properties/`（可用環境變數 `PMX_OUT` 改位置）。

## 使用方式

依賴版本（實跑環境）：Node.js v24.22.1；Python 3.13.5（concreteproperties 0.8.0 要求 Python ≥ 3.12）；concreteproperties 0.8.0、sectionproperties 3.10.2。

Linux、macOS 或 Git Bash：

```bash
# 自動在輸出夾建立 venv 並安裝固定版本
dev_tools/pm-crosscheck-concrete-properties/run_all.sh
# 或指定已安裝 concreteproperties 的 Python
PMX_PYTHON=/path/to/python dev_tools/pm-crosscheck-concrete-properties/run_all.sh
```

Windows PowerShell（不經 bash，逐步執行）：

```powershell
$out = "output\pm-crosscheck-concrete-properties"
py -3.13 -m venv "$out\venv"
& "$out\venv\Scripts\python.exe" -m pip install concreteproperties==0.8.0 sectionproperties==3.10.2
node dev_tools\pm-crosscheck-concrete-properties\tool_pm.js $out
& "$out\venv\Scripts\python.exe" dev_tools\pm-crosscheck-concrete-properties\cp_pm.py $out
& "$out\venv\Scripts\python.exe" dev_tools\pm-crosscheck-concrete-properties\compare.py $out
```

## 三支柱案例輸入

共同條件：Es = 200 GPa，fy = 420 MPa，εcu = 0.003，應力塊 0.85·f'c、a = β1·c；#8 主筋 db = 25.4 mm、As = 506.7 mm²（取自小工具 REBAR_TABLE）；保護層 cover = 40 mm，依目前 master 的語意，主筋中心 = cover + db/2（量到主筋外緣）。

| 柱 | 斷面 b×h (mm) | 主筋 | 每面根數（b 面／h 面） | f'c (MPa) | β1 | 彎曲軸 |
|---|---|---|---|---|---|---|
| A | 500×500 | 8-#8 | 3／3 | 28 | 0.85 | — |
| B | 500×500 | 12-#8 | 4／4 | 28 | 0.85 | — |
| C | 400×700 | 10-#8 | 3／4 | 35 | 0.80 | 強軸（h = 700） |

concrete-properties 端：混凝土矩形加 `add_bar`（32 點多邊形，面積依 As 縮放），鋼筋以孔洞方式扣除混凝土；`RectangularStressBlock(alpha=0.85, gamma=β1, ultimate_strain=0.003)`；`SteelElasticPlastic(fy, Es, fracture_strain=1.0)`。

關鍵點定義：純軸壓 Po；平衡點取最外受拉鋼筋 εt = εty = fy/Es，c = 0.003·dt/(0.003 + εty)；純彎以二分法求 Pn = 0。

## 現有驗證結果

- 執行時間：2026-10-30 09:02（台北時間）
- repo：`a2c4e97e`（origin/master，commit 時間 2026-10-26 13:46 台北時間）
- 數值以 `run_all.sh` 實跑輸出為準。

| 項目 | A | B | C |
|---|---|---|---|
| 關鍵點最大相對差（Po、平衡點 Pn／Mn、純彎 Mn） | 1.0×10⁻⁶ % | 5.2×10⁻⁷ % | 1.5×10⁻⁶ % |
| 整條標稱曲線最大 \|ΔMn\|（相同 Pn 內插） | 0.090 % | 0.045 % | 0.247 % |
| 整條標稱曲線平均 \|ΔMn\| | 0.007 % | 0.006 % | 0.009 % |
| 比對曲線點數 | 59 | 57 | 61 |
| 同一 c 逐點最大 \|ΔPn\| | 4.157 % | 2.069 % | 2.423 % |
| 同一 c 逐點最大 \|ΔMn\| | 1.088 % | 1.238 % | 0.955 % |

關鍵點數值（標稱；除 A 柱平衡點 Mn 有四捨五入位差外，兩邊至小數兩位相同）：

| 柱 | Po (kN) | 平衡點 Pn (kN) | 平衡點 Mn (kN·m) | 純彎 Mn (kN·m) |
|---|---|---|---|---|
| A | 7556.04 | 2655.57 | 612.53（cp 612.54） | 351.21 |
| B | 8359.05 | 2649.71 | 712.54 | 509.17 |
| C | 10307.40 | 3647.76 | 1111.17 | 641.49 |

曲線比對排除 Pn ≤ −0.2·Po 及 Mn < 1 kN·m 的點。純彎點的 Pn 兩邊都接近 0，不計百分比（`compare_tables.md` 中 C 柱純彎 ΔP 顯示 −100% 即此原因）。

差異來源：

- 關鍵點一致，因為兩邊採相同的應力塊、εcu 與鋼筋模型。
- 逐點的較大差異只出現在某層鋼筋剛好跨越應力塊邊緣 a = β1·c 時。小工具以鋼筋形心判斷整根扣或不扣排擠混凝土（`pmsection.js` 的 point 計算）；concrete-properties 依幾何只扣落在應力塊內的部分。Pn 接近 0 時百分比會放大。包絡線上只表現為小階梯。
- φ 由 `compare.py` 依小工具同一規則套到 cp 結果，所以兩邊 φ、φMn、φPn,max 一致不構成獨立驗證。

建議容許值（合理推定，尚未由使用者核定）：Po、平衡點、純彎 |Δ| ≤ 0.1%；整條曲線相同 Pn 下 |ΔMn| ≤ 0.5%；逐 c 點超過 0.5% 時，先檢查是否有鋼筋跨越應力塊邊緣。

## 已知限制

- 只驗證單軸標稱 P-M 的斷面力學層；φ 折減、φPn,max、需求點利用率與台灣規範檢核需另以手算或規範例題驗證。
- 兩邊採同一套應力塊假設，驗證的是實作與算術，不是模型選擇本身。
- 雙向容量面（小工具 32 角度凸包 vs cp `biaxial_bending_diagram`）與圓形斷面尚未實測比對。
- 只以 N、mm 單位跑過；kgf/cm² 原生單位未實跑。
- `tool_pm.js` 以函式名稱從 `column.app.js` 原文抽出四個函式；函式改名或參數改變時腳本會失敗，需同步調整。
- 保護層採目前 master 的語意（量到主筋外緣）。另有一組對應 `tool/pm-cover-to-stirrup` 的比對，待該分支決定後再補。
- 未納入 preflight、phase gate 或 CI；`run_all.sh` 需要 bash，Windows 請用上面的 PowerShell 指令。
