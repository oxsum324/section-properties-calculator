# 鋼筋混凝土構件設計工具箱

目前工具入口為 [index.html](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/index.html)，模組位於 [tools](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/tools:1)，共用函式位於 [shared](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/shared:1)。

## 目前模組

- `梁 Beam`
- `柱 Column`
- `板 Slab`
- `牆 Wall`
- `基礎 Foundation`
- `單樁 Single Pile`

## 自動巡檢

已提供整套 RC 巡檢腳本：

- [audit-tool.ps1](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/audit-tool.ps1:1)
- [run-audit.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit.bat:1)
- [run-audit-loop.bat](/C:/Users/USER/Desktop/AI/小工具製作/鋼筋混凝土/run-audit-loop.bat:1)

巡檢會跑：

- 梁回歸測試
- 柱回歸測試
- 板回歸測試
- 牆回歸測試
- 基礎回歸測試
- 單樁回歸測試

## 執行方式

單次巡檢：

```powershell
.\audit-tool.ps1 -Quiet
```

循環巡檢：

```powershell
.\audit-tool.ps1 -Quiet -Loop -IntervalSeconds 60
```

也可直接雙擊：

```text
run-audit.bat
run-audit-loop.bat
```

## 輸出位置

- `output/audit/audit-summary.md`
- `output/audit/audit-summary.json`
- `output/audit/audit-status.json`
- `output/audit/history/<runId>/...`
