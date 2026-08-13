# Staging 分包建議

本檔目前扮演兩個角色：第一，記錄已發布到 `master` / GitHub Pages 的分包與證據；第二，保留下次同類變更可直接套用的 staging playbook。它不是目前待提交清單；若 `git status` 是 clean，以下 `git add` 區塊只作為未來變更時的審查邊界與 preflight coverage 來源。

## 目前狀態

- 工作樹基準：最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準，本文件不硬編碼自我引用的最新 commit hash，避免提交後立即失真。
- 狀態快照證據基準：以 tracked `結構工具箱/assets/status/preflight-summary.json` 與 `report-readiness-status.json` 的 `runId`、`sourcePath`、`sourceHash` 為準；承載提交由 `git log -1 --oneline` 查詢，不在本 ledger 重複硬編碼。
- 已落地提交：
  - `4944fa7 Harden page-only report readiness release evidence`
  - `b1a534e Expand report boundary governance across tools`
  - `d530816 Refresh anchor deployment assets`
  - `60f3c18 Update release status snapshots`
  - `2029758 Enforce formal attachment boundaries and rendered release evidence`
- 公開狀態快照正式放行基準：上述 tracked JSON 必須為 `quick=false`、`ForcePlatformAudit=true`、`ForceSlowChecks=true`、`sourceDirty=false`、`recordsCount=passedCount`、post checks 全數通過，且沒有慢測或平台巡檢重用；`sourceCommitSha`、`sourceBranch` 必須明確指出受測來源，當前 `runId` 直接讀取 JSON，不在本 ledger 複製。
- 公開狀態快照發布基準：最新 `Pages deploy` 必須為 completed/success，並以 `gh run list --workflow "Pages deploy" --limit 1` 查詢；workflow run ID 不在本 ledger 硬編碼。
- 報告閱讀狀態：`頁面專用`，page-only boundary `4/4`、可讀文字 `17/17`、瀏覽器 smoke `2/2`、首頁正式工具實際交付物渲染 `31/31`、補充報告 / 服務成品 `2/2`、成品檔案完整性 `139/139`、風力／地震數值結果鏈 `14/14`、RC 結果鏈 `34/34`、RC 來源組包 `32/32`、RC 核可 HTML 列印 `34/34`、RC HTML 內容封印 `34/34`、鋼構結果鏈 `5/5`、石材結果鏈 `1/1`、錨栓結果鏈 `1/1`、覆工板結果鏈 `1/1`、開挖結果鏈 `1/1`，issue `0`；此總覽只能出現在頁面或工具本身，不得附入計算書、列印輸出或 PDF，也不得寫入 Word / DOCX 或 workbook。公開的 139 份只分成正式 PDF／證據 `60`、RC PDF／PNG `66` 與混合格式附件 `13` 三類計數；結果鏈、RC 來源組包、核可 HTML 列印及內容封印也只公開完成數，不得帶出 scope、檔名、工具版本、bytes、雜湊、golden case 內容、RC 案例資料、補強表單快照、鋼構／石材／錨栓／覆工板／開挖來源資料、預期數值、重現指紋、成品雜湊或計算指紋。
- 下列 A0~G 是下次同類變更的分包 playbook，不是目前待 staging 清單。

## A0. 報告閱讀狀態與 Pages release governance

已落地：`4944fa7 Harden page-only report readiness release evidence`。下次若再次調整頁面專用「優先建議報告閱讀狀態」、公開首頁狀態快照、Pages artifact 邊界或正式放行證據，這包仍應優先提交；它不納入錨栓 build hash 資產，也不納入 RC / Steel / 風力 / 地震工具頁本體的大量 UI 調整。

下次同類變更低風險可整檔 staging 的檔案：

```powershell
git add -- CONTEXT.md docs/adr/0001-page-only-report-readiness.md
git add -- ".github/workflows/pages-deploy.yml" ".github/pages-smoke/package.json" ".github/pages-smoke/package-lock.json" ".github/pages-smoke/performance-budget.json" ".github/pages-smoke/write-ci-summary.js" ".github/pages-smoke/build-performance-trend.js" ".github/pages-smoke/build-performance-trend.test.js" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "push-pages-release.ps1" "push-pages-release.bat" "run-preflight-tools-ci.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js"
git add -- "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/verify-pages-release-lineage.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/public-evidence-schema.test.js"
git add -- "結構工具箱/assets/status/public-evidence-schema.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

下次同類變更需要人工 hunk review，或改隨後續「報告邊界 / 跨家族 contract」包一起 staging：

- `STAGING_GROUPS.md`：若只提交 A0，需只挑 release ledger、A0 區塊與必要共同驗證 hunk，避免把其他 future playbook 調整混入。
- `TOOL_BOUNDARIES.md`：若只提交 A0，需只挑 Pages / status snapshot / page-only 邊界相關 hunk。
- `preflight-tools.ps1`：若只提交 A0，需只挑 `pagesReleaseGovernanceContractCommand`、`prValidationContractCommand` 與對應 `pages-release-governance-contract` / `pr-validation-contract` record hunk。
- `README.md`：若只提交 A0，需只挑 Pages / report-readiness 相關 hunk。
- `TOOL_REPORT_GUIDE.md`：若只提交 A0，需只挑 glossary / ADR / page-only 邊界 hunk。
- `toolbox-entrypoints.contract.test.js`：若整檔 staging，必須同步 staging 它引用的 contract / preflight / home source 變更。
- `結構工具箱/tools/report-disclosure.contract.test.js`、`結構工具箱/tools/audit-dashboard-browser-smoke.test.js`：依賴跨家族 report-boundary 變更，除非 A0 同時擴成報告邊界大包，否則不要整檔 staging。

提交前驗證：

```powershell
node .\.github\pages-smoke\build-performance-trend.test.js
node .\pages-release-governance.contract.test.js
node .\pr-validation.contract.test.js
node .\toolbox-entrypoints.contract.test.js
node .\結構工具箱\tools\report-disclosure.contract.test.js
node .\結構工具箱\tools\tool-maturity-matrix.js --write --check
.\run-preflight-tools-release.bat
.\run-pages-artifact-smoke.ps1
.\push-pages-release.ps1 -VerifyOnly
git diff --check -- README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/adr/0001-page-only-report-readiness.md ".github/workflows/pages-deploy.yml" ".github/pages-smoke/performance-budget.json" ".github/pages-smoke/write-ci-summary.js" ".github/pages-smoke/build-performance-trend.js" ".github/pages-smoke/build-performance-trend.test.js" ".github/workflows/pr-validation.yml" "run-pages-artifact-smoke.ps1" "push-pages-release.ps1" "push-pages-release.bat" "pages-release-governance.contract.test.js" "pr-validation.contract.test.js" "toolbox-entrypoints.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "結構工具箱/tools/verify-pages-release-lineage.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json"
```

`push-pages-release.ps1` 的成功不只依賴 Actions job 與 manifest 身分；一般推送、既有同 SHA 部署及 `-VerifyOnly` 都必須由目前工作站再次執行公開 `pages-live-smoke.js`，逐檔核對 v2 清冊與正式網址內容，並在結果回傳 `publicArtifactVerified=true`。工作站預設最多進行 3 次、間隔 10 秒的完整複驗，僅由 smoke 對 5xx 或網路暫態錯誤啟用；非暫態錯誤立即失敗，暫態重試用盡後也維持失敗，不得只因遠端 workflow 已綠燈而略過。

上述逐檔清冊現由 schema v3 延續並增列 `releaseEvidence`。Pages provenance 變更必須同批 staging `結構工具箱/audit-dashboard.html`、dashboard contract / browser smoke、deployment manifest builder、HTTP smoke、safe push wrapper、release governance contract 與三份治理文件。builder 必須從實際發布的 tracked preflight / report-readiness 快照驗證正式 release 條件並綁定 release runId、產生時間與受測來源 SHA；公開 smoke 再核對 manifest 與兩份快照。dashboard 必須分開顯示一般巡檢與正式 release 新鮮度，7 日／30 日只作重驗提醒；缺 manifest 顯示「未部署證據」，身分不一致顯示紅色「未對齊」。

dashboard 公開／本機資料範圍變更也屬 A0 同包。有效 v3 manifest 必須使公開頁只讀 manifest 與三份 tracked status，禁止發出任何 `output/` 請求並隱藏私人摘要連結；四張公開卡片必須各自以 tracked 結構化欄位驗證正式 release、鋼構、RC、風震／跨家族交付完成數，不得複製同一 platform pass 或以文案推定。localhost 只有明確 `?audit_scope=local` 才啟用完整診斷。`audit-dashboard-browser-smoke.test.js` 應以 request audit 同時證明本機資料仍完整、公開桌面與手機皆零 private-output 請求，並核對四個證據面向及完成數；不能只忽略 404 console 訊息。

成功 smoke 必須輸出唯一的 `pagesHttpSmokeAttemptCount`；安全發布入口只接受大於 0 且不超過 `PublicSmokeAttempts` 的值，並回報 `publicArtifactVerificationAttemptCount` 與 `publicArtifactVerificationRetried`。缺少、重複或超界均視為工作站驗證失敗。

Pages CI 效能趨勢固定使用私有 `performance-trend` job：當輪 build／live 收據必須完整成對，歷史只取成功 run 中同樣成對的 14 天 artifact。只有四個 exact cache hit 的同 lock digest 樣本可進最近 20 輪序列；冷快取當輪要列出排除原因，不能誤判部署失敗。trend v1 必須逐輪保存 build／live 的 runtime、HTTP、browser 六個毫秒值，並能重算 nearest-rank P50／P95；不足 3 輪顯示 `collecting`，不得假裝具備成熟統計。趨勢來源、測試、JSON、摘要與歷史收據均為私有 CI 治理，不得發布至 Pages 或放入計算書／正式附件。

Windows 發布一律優先執行 `push-pages-release.bat`；此入口先找 PowerShell 7，再以 Windows PowerShell 5.1 後備。`push-pages-release.ps1` 必須維持 ASCII 來源路徑解析，不得重新加入會受 5.1 UTF-8 無 BOM 解碼影響的中文路徑字面值。

下次不要混入本包：

- `anchor/assets/` 舊 hash 刪除 / 新 hash 新增，改放 B 包。
- `鋼筋混凝土/`、`鋼構工具/`、`結構工具箱/tools/風力/`、`結構工具箱/tools/地震力/` 的頁面本體變更，改放 E / F 或正式工具包。
- `螺栓檢討/bolt-review-tool/` 原始碼與 `/anchor/` 部署鏡像，分別放 G / B 包。

已落地提交訊息；下次可沿用同樣聚焦格式：

```text
Harden page-only report readiness release evidence
```

## A. 平台穩定化與驗證入口

已落地：跨家族報告 / 閱讀狀態治理主要在 `b1a534e Expand report boundary governance across tools`。下次若再次調整巡檢、preflight、ignore 與文件，仍可用本包作為平台治理 playbook；它不包含錨栓 build hash 資產。

下次可直接 staging 的檔案：

```powershell
git add -- .gitignore README.md TOOL_BOUNDARIES.md TOOL_REPORT_GUIDE.md STAGING_GROUPS.md CONTEXT.md docs/ docs/adr/0001-page-only-report-readiness.md .github/workflows/pages-deploy.yml .github/workflows/pr-validation.yml preflight-tools.ps1 run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-ci.bat run-preflight-tools-release.bat run-pages-artifact-smoke.ps1 push-pages-release.ps1 push-pages-release.bat sync-anchor-deployment.ps1 continuous-beam-regression.test.js test-continuous-beam.ps1 "連續梁分析.html" browser-dialogs.contract.test.js decking-tools.contract.test.js frame-analysis.contract.test.js pages-release-governance.contract.test.js pr-validation.contract.test.js section-tools.contract.test.js stone-feedback.contract.test.js struct-dx.contract.test.js toolbox-entrypoints.contract.test.js
git add -- platform-audit-preflight.ps1 refresh-platform-status.ps1 audit-all.ps1 run-audit-all.bat run-audit-all-loop.bat
git add -- "鋼構工具/run-audit.bat" "鋼筋混凝土/run-audit.bat" "結構工具箱/audit-core.ps1" "結構工具箱/run-audit-core.bat"
git add -- run-audit-all.bat run-audit-all-loop.bat run-preflight-tools.bat run-preflight-tools-quick.bat run-preflight-tools-ci.bat run-preflight-tools-release.bat "鋼筋混凝土/run-audit.bat" "鋼筋混凝土/run-audit-loop.bat" "鋼構工具/run-audit.bat" "鋼構工具/run-audit-loop.bat" "鋼構工具/run-sync-formal-core.bat" "結構工具箱/run-audit-core.bat" "安裝案件附件工作台捷徑.bat" "檢查案件附件工作台捷徑.bat" "移除案件附件工作台捷徑.bat" "結構工具箱/tools/啟動案件附件工作台.bat" "結構工具箱/tools/啟動案件附件治理檢視器.bat" "結構工具箱/tools/啟動正式附件包管理器.bat" "結構工具箱/tools/啟動舊版附件升級助手.bat"
git add -- "開挖擋土支撐/start_html_mode.ps1" "開挖擋土支撐/stop_html_mode.ps1" "開挖擋土支撐/sign_receiver_request.ps1" "開挖擋土支撐/簽署RVR身分請求.bat" "開挖擋土支撐/簽署SEV身分請求.bat" "開挖擋土支撐/簽署治理健康檢核點.bat" "開挖擋土支撐/verify_receiver_governance_checkpoint.ps1" "開挖擋土支撐/驗證治理健康檢核點.bat" "開挖擋土支撐/receiver_governance_timestamp.ps1" "開挖擋土支撐/建立治理檢核可信時間請求.bat" "開挖擋土支撐/完成治理檢核可信時間證據包.bat" "開挖擋土支撐/驗證治理檢核可信時間證據包.bat" "開挖擋土支撐/verify_source_evidence_chain.ps1" "開挖擋土支撐/驗證SEV證據鏈.bat" "開挖擋土支撐/backup_receiver_trust_registry.ps1" "開挖擋土支撐/check_receiver_trust_backup_health.ps1" "開挖擋土支撐/備份與演練RVR信任清冊.bat" "開挖擋土支撐/檢查RVR備份健康狀態.bat" "開挖擋土支撐/GOVERNANCE_CHECKPOINT_VERIFIER.md" "開挖擋土支撐/GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md" "開挖擋土支撐/SOURCE_EVIDENCE_CHAIN_VERIFIER.md" "開挖擋土支撐/RECEIVER_IDENTITY_SIGNATURE.md" "開挖擋土支撐/RECEIVER_KEY_MANAGEMENT.md" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js" "開挖擋土支撐/backend/verify_receiver_governance_checkpoint.py" "開挖擋土支撐/backend/receiver_governance_timestamp.py" "開挖擋土支撐/backend/verify_source_evidence_chain.py" "開挖擋土支撐/backend/tests/test_receiver_governance_checkpoint_verifier.py" "開挖擋土支撐/backend/tests/test_receiver_governance_timestamp.py" "開挖擋土支撐/backend/tests/test_source_evidence_chain_verifier.py" "開挖擋土支撐/backend/app/receiver_governance_checkpoint.py" "開挖擋土支撐/backend/app/receiver_trust_recovery.py" "開挖擋土支撐/backend/backup_receiver_trust_registry.py" "開挖擋土支撐/backend/tests/test_receiver_governance_checkpoint.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/backend/tests/test_receiver_trust_recovery.py" "開挖擋土支撐/backend/tests/release_report_artifacts.py"

外部歸檔收據：`git add -- "開挖擋土支撐/receiver_governance_archive.ps1" "開挖擋土支撐/建立治理可信時間外部歸檔請求.bat" "開挖擋土支撐/完成治理可信時間外部歸檔證據包.bat" "開挖擋土支撐/驗證治理可信時間外部歸檔證據包.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json" "開挖擋土支撐/backend/receiver_governance_archive.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive.py" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/backend/tests/test_reporting.py" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
外部歸檔生命週期：`git add -- "開挖擋土支撐/receiver_governance_archive_lifecycle.ps1" "開挖擋土支撐/簽發外部歸檔週期狀態收據.bat" "開挖擋土支撐/建立外部歸檔生命週期檢查點.bat" "開挖擋土支撐/驗證外部歸檔生命週期檢查點.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE.md" "開挖擋土支撐/GOVERNANCE_CHECKPOINT_TRUSTED_TIMESTAMP.md" "開挖擋土支撐/RECEIVER_IDENTITY_SIGNATURE.md" "開挖擋土支撐/RECEIVER_KEY_MANAGEMENT.md" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/tools/pages-live-smoke.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
多案件外部歸檔生命週期總覽：`git add -- .gitignore "開挖擋土支撐/receiver_governance_archive_lifecycle_portfolio.ps1" "開挖擋土支撐/檢查多案件外部歸檔生命週期.bat" "開挖擋土支撐/建立多案件外部歸檔生命週期總覽快照.bat" "開挖擋土支撐/驗證多案件外部歸檔生命週期總覽快照.bat" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE.md" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle_portfolio.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle_portfolio.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" pages-release-governance.contract.test.js "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
多案件外部歸檔生命週期排程監測、案件導入、管理中心與本機儀表板：`git add -- .gitignore "開挖擋土支撐/receiver_governance_archive_lifecycle_monitor.ps1" "開挖擋土支撐/manage_receiver_governance_archive_lifecycle_monitor_task.ps1" "開挖擋土支撐/onboard_receiver_governance_archive_lifecycle_monitor.ps1" "開挖擋土支撐/receiver_governance_archive_lifecycle_monitor_center.ps1" "開挖擋土支撐/安裝多案件外部歸檔生命週期每日監測.bat" "開挖擋土支撐/開啟多案件生命週期監控管理中心.bat" "開挖擋土支撐/檢查多案件外部歸檔生命週期監測排程.bat" "開挖擋土支撐/移除多案件外部歸檔生命週期每日監測.bat" "開挖擋土支撐/backend/receiver_governance_archive_lifecycle_monitor.py" "開挖擋土支撐/backend/tests/test_receiver_governance_archive_lifecycle_monitor.py" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR.md" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json" "開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/README.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" pages-release-governance.contract.test.js "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"`
git add -- index.html "斷面性質計算.html" "合成斷面性質.html" "RC補強斷面性質.html" dev_tools/section-properties-browser-smoke.js
git add -- "解題/struct_dx/frontend/diagnosis.html" "解題/struct_dx/frontend/verify_engine.html" "解題/struct_dx/frontend/struct_suite.html"
git add -- "鋼構工具/audit-tool.ps1" "鋼構工具/steel-audit-browser-runner.js"
git add -- "結構工具箱/core/style.css" "結構工具箱/core/direct-print-boundary.css"
git add -- "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js"
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/core/wind-report.js" "結構工具箱/tools/風力" "結構工具箱/tools/地震力" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/wind-shared-profile.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "TOOL_REPORT_GUIDE.md"
git add -- ".github/workflows/pages-deploy.yml" ".github/pages-smoke/package.json" ".github/pages-smoke/package-lock.json" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/pages-live-browser-smoke.js" "結構工具箱/tools/run-pages-browser-smoke.sh" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/build-pages-clean-routes.js" "結構工具箱/tools/build-pages-deployment-manifest.js" "run-pages-artifact-smoke.ps1" "開挖擋土支撐/index.html" "pages-release-governance.contract.test.js" "toolbox-entrypoints.contract.test.js" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
git add -- "結構工具箱/core/ui/report.js" "鋼構工具/core/ui/report.js" "鋼構工具/core/formal-core-manifest.json" "結構工具箱/core/wind-report.js" "結構工具箱/core/loads/loadcombo.js" "結構工具箱/core/ui/force-picker.js" "結構工具箱/core/ui/forces-receive.js" "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/local-quick-tools.contract.test.js" "結構工具箱/tools/formal-golden-harvest.js" "結構工具箱/tools/force-picker.html" "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html" "鋼筋混凝土/tools/beam.html" "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/shear-wall.html"
git add -- "結構工具箱/tools/地震力/seismic-force.html" "結構工具箱/tools/地震力/seismic-appendage.html" "結構工具箱/tools/地震力/seismic-misc.html" "結構工具箱/tools/地震力/seismic-dynamic.html"
git add -- "結構工具箱/tools/風力/wind-special.html"
git add -- "結構工具箱/tools/風力/wind-shared-profile.js" "結構工具箱/tools/風力/wind-overview.html" "結構工具箱/tools/風力/wind-kzt.html" "結構工具箱/tools/風力/wind-force.html" "結構工具箱/tools/風力/wind-cc.html" "結構工具箱/tools/風力/wind-object-frame.html" "結構工具箱/tools/風力/wind-object-solid.html" "結構工具箱/tools/風力/wind-object-tower.html" "結構工具箱/tools/風力/wind-open-roof.html" "結構工具箱/tools/風力/wind-parapet.html" "結構工具箱/tools/風力/wind-fence-sign.html" "結構工具箱/tools/風力/wind-lattice-tower.html" "結構工具箱/tools/風力/wind-sign-pole.html"
```

建議提交訊息：

```text
Add formal report traceability metadata
```

## B. 錨栓部署鏡像

已落地：`d530816 Refresh anchor deployment assets`。下次更新 `anchor/` 靜態部署輸出時，必須讓舊 hash 刪除、新 hash 新增與部署 fingerprint manifest 一起 staging；共用鏡像固定採 `./` 相對 base，才能同時支援 Pages 倉庫子路徑與 Vercel `/anchor/`。

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-anchor-deployment.ps1
git add -A -- anchor/index.html anchor/service-worker.js anchor/manifest.webmanifest anchor/deployment-manifest.json anchor/assets
```

提交前檢查：

```powershell
Select-String -Path "anchor/index.html","anchor/service-worker.js" -Pattern '\./assets/|BASE_PATH'
Get-Content "anchor/deployment-manifest.json"
```

建議提交訊息：

```text
Refresh anchor deployment assets
```

## C. 候選工具目錄

下次不建議直接整包 staging。先分別決定是否納入 repo，並把案例資料、Office/PDF 輸出與暫存資料排除。

- `石材固定/`：以「正式 V2 工具、測試治理與必要離線 vendor 納入，參考資料排除」處理。納入 `.gitignore`、核心 HTML、server/export Python、`js/`、`tests/`、`dev_tools/`、必要 `vendor/`、文件、`stone-traceability.catalog.json`、`stone-traceability.contract.test.js`、`stone-report.contract.test.js` 與維護批次檔；排除 PDF/XLS/Word 範例、圖片、`專案報告/`、output/release/tmp 與舊版 HTML。注意：`dev_tools/`、Python helper、測試資料與本機註冊檔可留在 repo 供治理使用，但 GitHub Pages artifact 必須排除，避免 baseline / diagnostics / source / local launcher helper 等維護檔公開。
- `開挖擋土支撐/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`backend/`（含 `requirements.txt`、治理健康 GCR／GHC／GCV 檢核點與獨立驗證、`backend/app/pdf_render_evidence.py`、`backend/tests/test_pdf_render_evidence.py`、`backend/tests/release_report_artifacts.py` 與匿名正式附件證據鏈演練）、`frontend/index.html`、`frontend/package*.json`、`frontend/src/`、`frontend/tsconfig*.json`、`frontend/vite.config.cjs`、`frontend/vite.config.ts`、`start_html_mode.ps1`、`stop_html_mode.ps1`、`excavation-traceability.catalog.json`、`excavation-traceability.contract.test.js`、`excavation-report.contract.test.js`；排除工程案例、Office/PDF、分析輸出、`app_data/`、`tmp/`、`frontend/dist/`、`*.tsbuildinfo`。PDF／DOCX 報表文件狀態、核可欄位、API／前端控制、核可 PDF 逐頁 OCR／文字層證據與 `.formal-source.zip` 搬運套件、報表測試、治理檢核點與獨立 GCV 驗證、證據鏈演練、附件檢查／組包／事後驗證器、catalog 與文件必須一起 staging；preflight 已做 launcher、traceability contract、report boundary contract、backend quick/full tests 與 frontend build，完整 backend gate 會實際組成並驗證匿名 v3 正式附件包。正式 release 的當輪 PDF、DOCX、latest download 副本與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/excavation-formal/`。
- `覆工板/`：以「程式碼納入、工程資料排除」處理。納入 `.gitignore`、`README.md`、`index.html`、`report/gen_report.py`、`shared/h-section-table.js`、`test-fixtures/report-smoke.json`、`dump_xls.py`、`產生計算書.bat`、`decking-result-replay.js`、`decking-report.contract.test.js`、`decking-traceability.catalog.json`、`decking-traceability.contract.test.js`；排除 Excel、Word/PDF、`吊車/`、`_extracted/`、dump 文字檔、pycache 與本機輸出。preflight 已做 Python compile、來源 JSON 重算、Word 報告邊界 contract 與 traceability contract；正式 release 的當輪來源 JSON、DOCX 與結構摘要只留在 ignored 的 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/decking-formal/`，不提交案件成品。
- `鋼架/`：目前只有 `平面剛架分析.html`，頁面 / 計算書邊界已由根目錄 `frame-analysis.contract.test.js` 治理；產出追溯與內部審閱／正式附件核可狀態必須與頁面本體及該 contract 一起 staging、一起審查。

舊版附件包升級評估：新增或調整 `attachment-package-upgrade-assess.js` 時，必須同步 staging 回歸測試、`評估舊版附件包升級.bat`、事後驗證器欄位、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。評估器固定唯讀，先沿用事後驗證；blocked 包不得提出升級捷徑，v1／v2 完整包只能回傳 review／CLI 1，並要求保留舊包、由原始工具重新確認與輸出、重新核可、另建 v3。不得原地修改舊包、補造 metadata、推算核可時間或自行產生正式附件；v3 完整包回傳 ready／CLI 0，任何完整性或工程內容錯誤仍以 blocked／CLI 2 優先。v3 驗證必須重新解析包內正式附件與來源 JSON，套用正向內容及文件狀態規則，並核對清單 metadata 與實際文字；測試需涵蓋同步改寫附件、雜湊、清單及附件包指紋後，空殼內容與 metadata 不一致仍被阻擋。逐份工作清單必須以產出工具、正規化版本與共享指紋配對，列出附件、來源、舊輸出時間、指紋及四項待辦；來源缺漏時標示外部可信來源，不得從報告反推輸入，v3／blocked 工作清單固定為空。測試需涵蓋多附件配對、來源缺漏、文字／JSON 同源，並以升級前後全目錄 SHA-256 快照證明零寫入。

舊版附件安全升級工作區：新增或調整 `attachment-package-upgrade-workspace.js` 時，必須同步 staging 測試、`建立舊版附件升級工作區.bat`、preflight 接線、Pages artifact／private-boundary 清冊與三份治理文件。建立器只能在完整 v1／v2 包上另建工作區，且建立後仍為 review／CLI 1；不得複製舊附件、來源、metadata 或核可時間。內部 JSON／Markdown 待辦固定放在 `00_內部升級工作說明_勿附入主報告/`，可交給正式組包器的新檔案固定放在獨立的 `01_新組包來源/`，初始內容只能是空白子資料夾。輸出不得位於舊包內、包住舊包或覆寫既有資料夾，需採暫存後原子發布；測試必須以舊包 SHA-256 快照、精確工作區檔案清冊、核可欄位排除、發布失敗清理及 v3／blocked 不建工作區證明邊界。

升級工作區完成度閘門：新增或調整 `attachment-package-upgrade-workspace-check.js` 時，必須同步 staging 測試、`檢查舊版附件升級工作區.bat`、`attachment-package-build.js` 強制接線、preflight、Pages 私有清冊與三份治理文件。完成度檢查固定唯讀，需驗證 `WSP-` 工作清單指紋、JSON／Markdown 同源、兩區固定邊界，再以產出工具與共享舊指紋逐份唯一配對新計算書及新來源；新版本可不同，但新檔彼此的版本／案件／指紋需一致，且輸出、來源儲存與正式核可均不得早於工作區建立時間。缺件或未核可只能 review，指紋／控制邊界異常必須 blocked，只有全部完成可 ready。組包器辨識 `01_新組包來源` 後不得繞過此閘門，新 v3 輸出也不得落在工作區內。測試必須涵蓋空白工作區、複製舊檔仍不通過、全新輸出可組成驗證通過的 v3、內部審閱、來源／報告指紋不符、清單／Markdown／根目錄遭改寫、CLI 0／1／2／3 與全工作區 SHA-256 零寫入。

統一升級流程：新增或調整 `attachment-package-upgrade-flow.js` 時，必須同步 staging 測試、`舊版附件包升級流程.bat`、preflight、Pages 私有清冊與三份治理文件。入口只能辨識正式附件包、升級工作區與 `01_新組包來源`；具有正式／內部附件包邊界但清單遺失的輸入仍需送入驗證並 blocked，不得視為未知資料夾。v1／v2 只能建立安全工作區後停在 review，v3 ready 必須零變更，工作區只有完成度 ready 才能呼叫正式組包器；直接選新組包來源也必須回溯父工作區，不能繞過人工核可。測試需涵蓋三種輸入辨識、舊包零寫入、空白工作區不建包、完整工作區建立並驗證 v3、來源資料夾直入仍受閘門、v3 零變更、篡改／缺清單 blocked、工作區內輸出拒絕及 CLI 0／1／2／3。

外部升級歷程：新增或調整 `attachment-package-upgrade-history.js` 時，必須同步 staging 測試、統一流程 CLI／批次參數、preflight、Pages 私有清冊與三份治理文件。歷程位置需在舊包、工作區、來源區及新包之外，並於受管產物變更前完成安全／可寫驗證；收據不得含計算內容、輸入值或核可時間，只保留階段、狀態與指紋證據。JSON 收據需使用唯一 receiptId、`HIS-` 指紋、不可覆寫目標、同目錄暫存與原子更名；失敗必須清除暫存。測試需涵蓋預設外部路徑、四種邊界拒絕、寫入探針零殘留、指紋、無核可欄位、不可覆寫、原子發布失敗清理、ready／review／blocked 收據、v3 包零寫入及不安全歷程位置在動作前停止。

歷程唯讀索引：新增或調整 `attachment-package-upgrade-history-index.js` 時，必須同步測試、`檢查附件升級內部歷程.bat`、preflight、Pages 私有清冊與三份治理文件。索引器不得建立、修改、改名或刪除任何歷程、附件包或工作區檔案；需以封閉欄位、重複 JSON key、檔名語意、`HIS-` 指紋、動作／狀態一致性、完成摘要及雙快照驗證目前收據，並只在標準輸出產生不含完整路徑的 `HIX-` 集合指紋。刪除偵測必須依賴歷程資料夾外保存的可信 `valid` 基準：新增為 review，遺失或同 ID 改變為 blocked；基準放在歷程內、格式損壞、重複 ID／指紋或集合指紋不符都需失敗封閉。結果只代表歷程完整性，不得作為正式附件核可。

可信基準發布器：新增或調整 `attachment-package-upgrade-history-baseline.js` 時，必須同步測試、`建立附件升級可信基準.bat`、preflight、Pages 私有清冊與三份治理文件。發布前必須呼叫同一唯讀索引，只有 valid 可建立新基準；若指定舊基準，新增為 review、遺失或改變為 blocked，三者都不得寫出新檔。輸出需位於歷程外且不得包住歷程或經連結重新導向，禁止覆寫，並採獨占暫存、fsync、自我驗證與原子更名；失敗需清除暫存及本次新建的空資料夾。測試必須涵蓋有效預設發布、CLI、歷程零寫入、無完整路徑、既有檔拒絕、內含／外包路徑拒絕、空歷程 review、篡改 blocked、既有基準新增不發布與原子發布失敗清理。基準只供內部完整性比對，不得附入報告或作為正式核可。

可信基準版本前進：新增或調整 `attachment-package-upgrade-history-baseline-advance.js` 時，必須同步測試、`推進附件升級可信基準.bat`、preflight、Pages 私有清冊與三份治理文件。入口必須要求既有基準；完全相符時零寫入，純新增只能 review，只有明確 `--accept-additions` 且具複核人與依據時才可前進。遺失、同 ID 改變、收據或基準篡改及其他警告不得接受。輸出固定為不覆寫的外部目錄，內含新版 valid 基準與內部核准紀錄；核准紀錄需以 `HAD-` 指紋綁定新舊 SHA-256、`HIX-`、收據數及逐筆新增 `HIS-`。兩檔必須交叉驗證、回讀目前歷程並在歷程／舊基準雙快照不變後才整包原子發布；失敗需清除暫存及新建空父目錄。測試需涵蓋待核准 review、明確前進、無新增零寫入、CLI 0／1／2／3、舊基準零寫入、缺失／改變／篡改 blocked、路徑邊界、整包交叉驗證、SHA 篡改、原子更名失敗及發布前競態清理。內部核准不是正式附件核可。

可信基準版本鏈驗證：新增或調整 `attachment-package-upgrade-history-baseline-chain.js` 時，必須同步測試、`檢查附件升級可信基準版本鏈.bat`、前進包驗證、preflight、Pages 私有清冊與三份治理文件。入口必須唯讀掃描初始基準與逐代前進包，依 SHA-256 與核准紀錄建立單根、單終端線性鏈；逐段驗證封閉欄位、重複 JSON key、`HAD-`、新舊 `HIX-`、純新增集合及時間順序，最後只用終端基準比對目前歷程。缺口、分叉、合流、重複基準、替換、缺少核准、歷程遺失或改變均 blocked；終端相符為 valid，僅有尚待前進的合法新增為 review。檢查前後必須重驗版本鏈、外部初始基準與歷程快照；輸出不得含完整路徑、複核人或依據，只能以 `HCX-` 指紋表示鏈內容。測試需涵蓋多代有效鏈、外部初始基準、缺口、分叉、替換、重複基準、缺少／重複鍵核准、終端不符、待前進、空鏈、額外項目、競態與 CLI 0／1／2／3。結果不是正式附件核可或數位簽章。

案件附件治理總覽：新增或調整 `attachment-case-governance-overview.js` 時，必須同步測試、`檢查案件附件治理總覽.bat`、附件包驗證、版本鏈驗證、preflight、Pages 私有清冊與三份治理文件。入口只能組合既有判定，不得自行將 review 提升為 ready；附件包 ready 且版本鏈 valid 才能進入內部歸檔複核，任一 review 維持 review，任一 blocked 或檢查期間來源改變以 blocked 優先。正式附件包、外部歷程與版本鏈根目錄必須完全分離，外部初始基準也不得落入任一受管根目錄；檢查前後需比較四者快照。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露名稱、封閉摘要、下一步代碼及 `PKG-`／`HIX-`／`HCX-`／`GOV-` 指紋。測試需涵蓋 ready、待前進 review、附件包損壞、版本鏈缺件、外部初始基準、路徑重疊、競態、零寫入、資訊最小化、穩定指紋與 CLI 0／1／2／3。總覽不是正式附件核可或數位簽章。

單一案件根目錄入口：新增或調整 `attachment-case-governance-root.js` 時，必須同步測試、`檢查案件根目錄附件治理.bat`、案件治理總覽、preflight、Pages 私有清冊與三份治理文件。入口只能掃描直接子資料夾，以封閉結構辨識候選；正式附件包、外部歷程及可信基準鏈各恰好一組才可繼續，缺少、多組、跨角色、連結或無法讀取時均 blocked，不得用最新日期、名稱偏好或排序猜選。完成內層總覽後必須重掃候選並重驗三個已選目錄快照，任何競態改變以 blocked 優先。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露直接子目錄名稱、候選、下一步及 `CAS-`／既有治理指紋。測試需涵蓋標準與非標準名稱、唯一辨識、缺件、多候選、版本鏈損壞、候選競態、待前進、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。入口不是正式附件核可或數位簽章。

多案件附件治理總覽：新增或調整 `attachment-case-governance-portfolio.js` 時，必須同步測試、`檢查多案件附件治理總覽.bat`、單一案件根目錄入口、preflight、Pages 私有清冊與三份治理文件。入口只能掃描指定上層的直接子資料夾，以封閉治理候選辨識案件，其餘資料夾明列忽略；不得遞迴、依名稱猜測或改變個案判定。任一 blocked 使整批 blocked，否則任一 review 使整批 review，全部 ready 才能回報 ready。處置分群只能沿用個案問題與下一步代碼：P0 停止歸檔、P1 合法新增待基準前進、P2 相容性或其他人工確認；同案多重原因可列入多群，但各優先層級案件數只能依最高優先計一次，分群不得提升或降低原狀態。`--only-actionable` 與 `--priority` 只准縮減顯示集合；完整狀態、退出碼、總數及 `POR-` 指紋不得改變，視圖須標明全部案件指紋範圍、保留完整摘要與所有上層問題。檢查前後需重掃案件集合並重驗每案候選快照；上層連結、空集合或競態均 blocked。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露案件名稱、封閉摘要、優先群組、問題／下一步代碼及 `POR-`／既有治理指紋。測試需涵蓋多案 ready、review、blocked、不完整案件、非案件忽略、空集合、競態、多重原因、唯一優先計數、篩選不改狀態／退出碼／指紋、上層問題不隱藏、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。總覽不是正式附件核可或數位簽章。

多案件治理快照比較：新增或調整 `attachment-case-governance-portfolio-compare.js` 時，必須同步測試、`比較多案件附件治理總覽.bat`、完整多案件總覽、preflight、Pages 私有清冊與三份治理文件。只接受未篩選的完整 v1 總覽實體 JSON；必須封閉驗證欄位、重複鍵、大小、摘要、案件唯一性、狀態、邊界與可重算分群，並於比較後重驗兩份來源內容未變。比較按案件名稱分類新增、移除、改善、惡化、同狀態變更與未變；`CMP-` 必須綁定兩個 `POR-` 與差異。結果狀態不得低於目前批次健康，惡化或新增 blocked 亦必須 blocked，其他差異至少 review。`--only-blocking` 與可重複的 `--change` 只准縮減顯示案件及對應下一步；篩選結果須使用 comparison view、標明 `fingerprintScope=all-changes` 與完整／顯示／隱藏筆數，完整狀態、摘要、退出碼及 `CMP-` 指紋不得改變。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露快照檔名、案件名稱、狀態／優先層級、差異代碼與指紋。測試需涵蓋六類差異、目前 blocked／review 保留、純 metadata 改變、篩選視圖拒絕、阻擋聚焦、重複差異類型正規化、篩選不改狀態／摘要／退出碼／指紋、隱藏案件不從下一步洩漏、重複鍵、額外欄位、錯誤摘要、競態、零寫入、穩定指紋、資訊最小化及 CLI 0／1／2／3。比較器不是正式附件核可、版本前進或數位簽章。

多案件治理快照保存：新增或調整 `attachment-case-governance-portfolio-snapshot.js` 時，必須同步測試、`保存多案件附件治理快照.bat`、完整多案件總覽、比較器、preflight、Pages 私有清冊與三份治理文件。輸出資料夾必須與案件上層雙向分離且為實體路徑；檔名需綁定總覽時間與 `POR-`，同名不得覆寫。完整 JSON 應以排他暫存、fsync、比較器封閉規則回讀、相同時間重建總覽及發布前後來源快照重驗完成自我驗證，再以原子硬連結發布；目標競態不得覆寫，任一步失敗需清除暫存，已發布後才發現來源異動亦需撤回新檔。原總覽含 `portfolio-changed-during-read` 時不得保存；其餘穩定 ready／review／blocked 可保存且退出碼須維持 0／1／2。輸出不得含完整路徑、計算內容、複核人或依據，只能揭露資料夾名稱、檔名、SHA-256、案件數與 `POR-`。測試需涵蓋三種狀態保存、讀取異動不保存、總覽二次確認、發布前後來源競態、暫存破壞、同名與外部目標競態不覆寫、來源零寫入、資訊最小化、暫存清理及 CLI 0／1／2／3。快照不是正式附件核可、版本前進或數位簽章。

多案件治理快照索引：新增或調整 `attachment-case-governance-portfolio-snapshot-index.js` 時，必須同步測試、`檢查多案件治理快照歷程.bat`、保存器、比較器、preflight、Pages 私有清冊與三份治理文件。索引根目錄須為實體資料夾，只接受發布器產生、檔名與內容時間／`POR-` 一致、link count 為 1 的完整 JSON；連結、子目錄、非 JSON、破損／重複 key、改名、同群組重複時間、檔案上限與索引期間變動均 blocked。依內含案件上層名稱分群，索引完整性與各群組最新快照健康分開計算，整體狀態不得較低；不足兩份為 review。最新兩版比較只接受單一群組專用資料夾；混合群組不得猜選，須 blocked 並要求分流。選定後沿用比較器及其篩選語意，完成後再重驗整個資料夾與全部有效快照；任何新增、移除、替換或內容變更均 blocked。`PSI-` 必須綁定群組、全部有效快照及問題；輸出不得含完整路徑、計算內容、複核人或依據。測試需涵蓋單份 review、穩定比較、退步 blocked、最新健康保留、多群組、重複時間、改名、損壞／重複 key、非 JSON、子目錄、硬連結、junction、索引與比較競態、穩定指紋、零寫入、資訊最小化及 CLI 0／1／2／3。索引與比較不是正式附件核可、版本前進或數位簽章。

多案件治理快照趨勢：新增或調整 `attachment-case-governance-portfolio-snapshot-trend.js` 時，必須同步測試、`分析多案件治理快照趨勢.bat`、索引、比較器、preflight、Pages 私有清冊與三份治理文件。輸入須先完整通過索引；只接受單一案件群組，少於兩份為 review 且不得建立趨勢，多群組或任何索引錯誤均 blocked，不得猜選。趨勢必須依內含時間逐一比較全部相鄰快照，分開保存目前健康、最新轉折、目前注意及歷史累計；狀態不得低於目前健康、最新轉折或目前注意，已改善的舊惡化只保留歷史，不能永久誤標目前 blocked。案件注意排序只能沿用目前狀態、既有 P0／P1／P2、最新惡化、目前移除與仍存在的反覆問題，不得宣稱量化風險分數。`TRD-` 必須綁定 `PSI-`、全部來源、相鄰 `CMP-`、狀態軌跡、案件趨勢、問題趨勢及分析問題；完成後再重驗整個資料夾與所有來源雜湊。輸出不得含完整路徑、計算內容、複核人或依據。測試需涵蓋穩定趨勢、惡化、改善、反覆案件／上層問題、目前移除、單份 review、多群組、無效檔、分析競態、穩定指紋、零寫入、資訊最小化及 CLI 0／1／2／3。趨勢不是正式附件核可、版本前進、風險評分或數位簽章。

多案件治理趨勢處置：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition.js` 時，必須同步測試、兩個處置批次入口、趨勢分析器、preflight、Pages 私有清冊與三份治理文件。處置資料夾必須與快照完全分離，收據只接受實體封閉 JSON、單一 link count、連續序號、時間不倒退、檔名一致及前一 `TRA-` 完整相接；異常、競態或同一有效目標重複收據均 blocked。案件移除 `DTE-` 必須綁定本次 missing 起點與最後出現時間；反覆問題 `DTE-` 必須綁定本次 active 起點、受影響案件集合及上層出現狀態，證據改變時舊收據不得沿用。唯讀組合結果完成前需同時重驗趨勢與收據鏈；發布需以處置上層排他鎖、排他暫存、fsync、封閉回讀、發布前趨勢／鏈重驗、原子硬連結及發布後雙重重驗完成；來源或鏈在任一邊界改變需撤回本次檔案。`TAI-` 綁定全鏈，`TDS-` 綁定目前適用狀態。結果不得揭露完整路徑、計算內容、複核人或依據。確認只能解除指定歷史型 P2 注意，狀態不得低於目前健康、最新轉折、P0 或 P1。測試需涵蓋空鏈、持續移除跨期適用、重新加入後再移除需重簽、反覆問題、受影響集合改變、目前 review 不提升、重複確認、破損／改名／非 JSON／硬連結／斷鏈、路徑重疊、暫存破壞、唯讀組合／來源／收據鏈／目標競態、原來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。處置不是正式附件核可、版本前進、風險評分或數位簽章。

多案件治理趨勢處置可信檢查點：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js` 時，必須同步測試、兩個檢查點批次入口、處置收據鏈、preflight、Pages 私有清冊與三份治理文件。檢查點輸出須與快照及處置鏈雙向分離；只接受封閉實體 JSON、單一 link count、內容一致檔名及標準時間。`TAC-` 必須綁定完整收據參照、每檔 SHA-256、終端 `TRA-` 與 `TAI-`，前進檔另綁定前一檢查點的檔名、`TAC-` 與 SHA-256。檢查必須使用明確指定的外部檢查點，不得自動猜選最新檔；鏈尾遭刪除時，即使剩餘前綴仍自洽也需 blocked，既有前綴變更 blocked，純新增 review。初始及前進都建立不可覆寫新檔；前進只接受完整相同前綴且必須明確 `--accept-additions`。發布需使用輸出上層排他鎖、排他暫存、fsync、封閉回讀、原子硬連結及發布前後快照／鏈／前一檢查點重驗，失敗撤回本次檔案且不得誤刪他人鎖。狀態不得低於目前處置結果，公開結果不得含完整路徑、複核人或依據。測試需涵蓋初始、完全相符、純新增、明確前進、尾端截斷、前綴改動、改名／重複 key／額外欄位／硬連結、路徑重疊、不可覆寫、暫存與來源競態、既有鎖保留、舊檢查點零修改、來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。檢查點不是正式附件核可、防竄改儲存或數位簽章。

多案件治理趨勢處置可信檢查點歷程：新增或調整 `attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js` 時，必須同步測試、歷程批次入口、可信檢查點、preflight、Pages 私有清冊與三份治理文件。歷程須與快照及處置鏈完全分離，明確指定的受信任終點必須是歷程根目錄中的直接實體檔案；不得依時間或檔名自動猜選。只接受封閉實體 JSON、單一 link count 與內容一致檔名；全鏈恰有一份 initial，advance 必須逐份綁定前一檔名、`TAC-` 及 SHA-256，保留完整收據前綴、增加收據數、正確記錄接受新增數，並維持案件群組、快照及處置資料夾範圍。缺檔、替換、改名、分叉、循環、回退、範圍切換、非 JSON、連結、硬連結或讀取競態均 blocked；指定終點後有合法新增則 review。`TCH-` 綁定有序全鏈，組合結果完成前須再驗治理快照、處置鏈、歷程及終點。狀態不得低於目前處置／工程狀態，輸出不得含完整路徑、複核人或依據。測試需涵蓋單檔、指定鏈尾、指定舊終點、尾端刪除後剩餘前綴自洽、缺中間檔、分叉、範圍變更、改名、非 JSON、硬連結、路徑重疊、讀取競態、目前 review 保留、來源零寫入、資訊最小化、穩定指紋與 CLI 0／1／2／3。歷程驗證不是正式附件核可、防竄改儲存或數位簽章。

附件治理工作區：新增或調整 `attachment-case-governance-workspace.js` 時，必須同步測試、兩個工作區批次入口、可信檢查點歷程、preflight、Pages 私有清冊與三份治理文件。設定資料夾須與快照、處置鏈及檢查點歷程完全分離；`TGW-` 必須綁定工作區名稱、相對於設定資料夾的三個已正規化來源路徑、受信任終點的檔名／`TAC-`／SHA-256、內部複核決定及前一設定身分。唯讀入口只接受單一 `--config`，設定檔必須是內容一致檔名的封閉實體 JSON 且 link count 為 1；解析後須確認來源拓撲、終點三重身分、檢查點歷程及目前處置狀態，完成前再次重讀設定、終點與全部來源。初始及前進皆以輸出上層排他鎖、排他暫存、fsync、封閉回讀、原子硬連結及發布前後重驗建立不可覆寫新檔；前進固定沿用前一設定名稱與來源，新終點須為舊終點後續檢查點，並綁定前一設定檔名、`TGW-` 及 SHA-256。改名、重複 key、額外欄位、硬連結、相對拓撲失效、終點替換、來源切換或競態均 blocked，既有鎖不得誤刪。公開結果不得含相對／完整路徑、複核人或依據，狀態不得低於目前工程狀態。測試需涵蓋初始、單檔 ready、合法終點前進、舊設定 review、前一設定鏈結、不可覆寫、終點三重身分不符、改名／重複 key／額外欄位／硬連結、相對拓撲、路徑重疊、暫存／來源／前一設定競態、既有鎖、工程 review 保留、來源零寫入、資訊最小化、穩定指紋及 CLI 0／1／2／3。工作區設定不是正式附件核可、防竄改儲存或數位簽章。

共用計算書文件狀態：調整 `結構工具箱/core/ui/report.js` 的核可方塊、內部審閱／正式附件頁尾、目前版本 HTML 下載、PDF 預設標題、空白案件欄位省略或輸入變更撤銷核可時，必須同步 staging `section-tools.contract.test.js`、`continuous-beam-regression.test.js`、`frame-analysis.contract.test.js`、相關頁面、README、邊界文件、ADR、首頁／矩陣／dashboard 說明與 browser smoke。下載 HTML 必須保存唯一且不執行 JavaScript 也能辨識的文件狀態列、核可時間與計算指紋，移除互動控制，重新開啟時沿用該列且不得重複插入狀態 UI；分頁標題必須由穩定報告名稱、目前文件狀態與指紋組成，不得在重新載入或切換時重複串接；頁面診斷明細仍維持 page-only。

附件組包文件分類：調整 `attachment-package-check.js` 的 `文件狀態：內部審閱` 阻擋、`文件狀態：正式附件`、輸出／核可時間辨識與順序、追溯欄位、來源內容穩定性、來源符號連結／junction 或未分類 review 規則時，必須同步 staging 檢查／組包／事後驗證測試、三個批次入口與三份治理文件。計畫名稱、計畫編號與設計人可由主文承接；產出工具、版本、輸出時間與指紋仍依追溯規則檢查，正式附件另須具備有效核可時間，且核可不得早於輸出。專案 JSON 維持來源資料角色，不要求報告文件狀態或核可時間；來源在解析前後的 SHA-256 必須一致，組包時需再確認檢查完成、複製前、複製後與目標檔案雜湊完全相同，測試需模擬檢查後替換與複製期間變更皆失敗封閉。來源根目錄或內容含連結／junction 時必須 blocked 並列名，組包複製層還需逐層拒絕連結及確認實際來源未越界。`attachment-package-build.js` 只在 ready 後把正式文件與內部追溯資料分流，禁止覆寫既有輸出或留下半成品，並必須在暫存區呼叫同一驗證器，完整通過才原子發布；Windows 原子更名若短暫回傳 `EPERM`／`EACCES`／`EBUSY`，只能在目標仍不存在時有限重試，其他錯誤不得放寬。新建包的 v3 指紋需涵蓋檔案雜湊、追溯欄位、正式核可時間、計畫編號、建立時間、檢查摘要與正式／內部分流邊界，測試需證明各類 metadata 篡改會阻擋、輸出／核可／組包時間順序即使指紋重算一致仍會被驗證器阻擋，並保留既有 v1／v2 包相容測試；相容測試必須證明舊包仍可完成原版完整性核對，但狀態固定為 review／CLI 1，不得與 v3 的 ready／CLI 0 混同，且任何完整性錯誤都以 blocked／CLI 2 優先。事後驗證測試另需證明清單每一層 JSON 欄位唯一，字面重複及以跳脫序列表示的同名欄位即使解析後指紋吻合仍須失敗封閉；頂層、檢查摘要、分流邊界與附件紀錄還需採封閉欄位白名單，所有未定義欄位即使未影響指紋仍須阻擋。重複路徑、大小寫碰撞、非 NFC 名稱、Windows 保留名稱及尾端空白／句點也都必須阻擋，且大小寫碰撞即使指紋重算一致仍不得放行。驗證器還需對清單、README、全部附件及目錄結構建立讀取後與結束前雙快照；測試必須在第一次雜湊成功後改變附件，並確認只由第二次快照以 `package-changed-during-verification` 失敗封閉。驗證入口根目錄本身為 symlink／junction 時需直接 blocked，並以不受 Windows 大整數精度影響的原生身分欄位在結束前重驗；測試需模擬根目錄身分變更並確認同樣失敗封閉。測試也需證明自我驗證失敗時暫存與輸出皆不存在。`attachment-package-verify.js` 只讀取既有正式附件包，需阻擋清單／雜湊／指紋／README 不符、遺漏、額外項目、符號連結與路徑越界，且不得將驗證結果寫回包內。
附件可見性與 XLSX 封印證據：調整 `attachment-package-check.js`、`rendered-delivery-evidence.js` 或 PDF／HTML／DOCX／XLSX 可見內容判定時，必須把單元測試、`attachment-canonical-render-e2e.test.js`、同一個 `attachment-package-check` preflight key、README 與 `TOOL_BOUNDARIES.md` 一起 staging。E2E 需用實際 Edge 同次工作階段產出 PDF 與 canonical evidence，證明白字白底／列印隱藏文字不計入，並覆蓋 PDF SHA 竄改、evidence 改名重用、`visibleText.text`／SHA 竄改、偽造內容邊界／文件 profile 及 PDF metadata 不一致皆降 review；開挖原生 PDF 則須由實際後端逐頁建立像素、RapidOCR 與文字層對齊證據，測試 OCR 文字／SHA／分數／門檻竄改、內部追溯分流及事後複驗。XLSX 測試另須涵蓋 hidden sheet／row／column、隱藏欄存在時缺少 cell `r` 參照的 review 路徑，以及 `reportWorkbookSeal.ts`、`xlsx-seal-verifier.js`、附件檢查、release aggregate、Pages 私有邊界與文件同步 staging；內容、公式、快取結果、內容 SHA 或核可欄位竄改皆須失敗關閉。`pdftotext` 不得標示成 visible 或 OCR。
同一 preflight key 不得整體標成 slow：quick／CI 必須保留 `attachment-package-check.test.js`，只有 `-not $Quick -and -not $CI` 時才在單元測試成功後追加 Edge E2E。Profile 契約需由可見標題判定 book／summary family，完整追溯欄位提升為 `traceable-*`；測試須同時證明 traceable book／summary 正例、非 traceable 降級與 summary 偽造失敗，以及 `compiled-engineering-report` 的 book-family 相容性。

正式附件包管理器：新增或調整 `attachment-package-manager-worker.js`、`attachment-package-manager.ps1`、`啟動正式附件包管理器.bat` 時，必須同步 staging `attachment-package-manager.contract.test.js`、preflight、Pages artifact／HTTP 私有邊界清冊、README 與 `TOOL_BOUNDARIES.md`。介面只能包裝既有 check / build / verify，禁止在 GUI 或 worker 另行改判狀態；檢查與驗證維持唯讀，只有明確建立動作可呼叫既有 v3 組包器。檢查與驗證須在外部背景 worker 執行，UI thread 正常完成不得同步等待；進行中同一按鈕須可停止，五分鐘逾時、路徑改變、關窗與明確取消都要終止程序並以 PID 限定清理系統暫存區的 IPC 結果與來源 ZIP 隔離根目錄，過期結果不得套用。鍵盤須以 `Ctrl+L` 聚焦目前模式路徑、`Enter` 只執行來源檢查或事後驗證、`Esc` 停止唯讀工作；Enter 不得呼叫 build，正式建立仍須明確點按。來源／驗證控制項須固定 Tab 順序、輔助名稱與權限描述。視窗須由游標所在螢幕 working area 限制尺寸並手動置中；800 × 640px 小視窗須以 1040 × 784px 固定內容面及獨立雙向捲動容器保留全部控制項，狀態列固定，`Ctrl+L` 聚焦時把路徑欄帶入可視區。來源區拖放只接受單一現有實體資料夾或精確 `.formal-source.zip`，驗證區拖放只接受單一現有實體資料夾；多重路徑、一般檔案、來源 ZIP 誤放驗證區、連結與特殊項目必須拒絕且不得改變原路徑。合法拖入只能觸發既有背景唯讀 check / verify，不能形成 build 權限或執行 build。正式建立必須另走獨立背景 worker 與既有原子組包核心，UI thread 不得同步等待；開始前重驗 ready grant，建立中鎖定輸入與其他動作、保持畫面回應。核心只可用受管 JSONL 回報準備來源、重新檢查、建立暫存包、發布前驗證、原子發布等真實階段；UI 只接受固定白名單並搭配真實經過時間，不得顯示 worker 任意文字或無法證明的百分比。Esc 與關窗不得取消 worker。建立不可混用唯讀取消／逾時流程，完成後才套用核心結果、恢復 UI、清除一次性權限及結果／階段 IPC 與來源 ZIP 暫存。計畫編號維持選填，只可在欄位原本空白且來源恰有一個一致非空值時帶入；來源空白不得降級，多值衝突不得猜選，使用者輸入不得覆寫，建立前核心仍須重查。來源可為資料夾或精確兩檔的 `.formal-source.zip`；ZIP 必須先驗中央目錄、同名配對、數量與大小，只將指定 PDF／證據寫入隔離暫存區，完成後清理，並以路徑穿越、多檔、錯配、背景取消與暫存清理反例鎖定。ZIP 檢查 ready 時只可在空白欄位顯示原 ZIP 旁的不覆寫預計輸出，不得建立資料夾；使用者指定輸出不得覆寫，來源切換只能清除仍未編輯的舊自動建議。組包與事後驗證結果須分別顯示核心回傳的 HTML 與 XLSX 雙封印完成數／應驗數，逐份只顯示家族與通過／異常，不得顯示封印值、scope 或正文；XLSX 內容與核可竄改反例必須在重算附件 SHA、清單與包指紋後仍由事後驗證失敗關閉。PowerShell 非 ASCII 檔須保留 UTF-8 BOM，`-Smoke` 不得開啟視窗或寫入案件資料；動態取消、鍵盤、viewport、drag-and-drop 與 build responsiveness smoke 必須使用真實 WinForms message loop，證明清理、鍵盤／拖放權限、背景建立可回應、真實階段與經過時間持續更新但不可取消／關窗、完成後 UI 復原、結果／階段 IPC 清除、所選螢幕邊界、雙向捲動、右下內容及固定狀態列；所有 smoke 都不得建立附件包。四個管理器檔案均不得發布至 Pages。

案件附件治理檢視器：新增或調整 `attachment-case-governance-viewer-worker.js`、`attachment-case-governance-viewer.ps1`、`啟動案件附件治理檢視器.bat` 時，必須同步 staging `attachment-case-governance-viewer.contract.test.js`、preflight、Pages artifact／HTTP 私有邊界清冊、README 與 `TOOL_BOUNDARIES.md`。單案與多案模式只能包裝既有 root／portfolio 唯讀核心；篩選只縮減畫面，不得改變狀態、退出碼或治理指紋。GUI 與 worker 禁止建立、修改、核可、輸出或寫入案件資料，PowerShell 非 ASCII 檔須保留 UTF-8 BOM，四個檢視器檔案均不得發布至 Pages。

舊版附件升級助手：新增或調整 `attachment-package-upgrade-assistant-worker.js`、`attachment-package-upgrade-assistant.ps1`、`啟動舊版附件升級助手.bat` 時，必須同步 staging `attachment-package-upgrade-assistant.contract.test.js`、preflight、Pages artifact／HTTP 私有邊界清冊、README 與 `TOOL_BOUNDARIES.md`。inspect 固定包裝既有 assessment／workspace-check 唯讀核心，execute 必須重查且只呼叫既有 unified flow；禁止另做複製、組包、核可、收據、覆寫或不安全輸出。輸入或計畫編號改變需撤銷可執行授權，執行前另需明確勾選確認。PowerShell 非 ASCII 檔須保留 UTF-8 BOM，四個助手檔案均不得發布至 Pages。

案件附件工作台：新增或調整根目錄 `啟動案件附件工作台.bat`、`attachment-governance-hub-worker.js`、`attachment-governance-hub.ps1`、tools 內 `啟動案件附件工作台.bat` 時，必須同步 staging `attachment-governance-hub.contract.test.js`、三套既有 GUI 及其契約、preflight、Pages artifact／HTTP 私有邊界清冊、README 與 `TOOL_BOUNDARIES.md`。根目錄捷徑只能完整轉交參數給既有受治理啟動器，不得直接呼叫 PowerShell 或形成第二套權限。工作台可把使用者由啟動參數、對應選擇器或工作台內拖入的單一現有實體資料夾或 `.formal-source.zip` 以 `InitialPath` 預填到既有工具；三種帶入方式可立即執行唯讀 advisor，但一般檔案、多重路徑、連結或特殊項目不得接受。來源 ZIP 固定建議管理器 `source` 模式，hub 不得解析 ZIP、建立暫存區、啟動子工具或改變案件狀態；只有使用者明確點擊建議工具後，管理器才以既有安全來源檢查處理，仍不得自動組包。資料夾的新組包正向訊號必須是報告型檔案，或具有產出工具、版本、計畫編號、計算指紋等追溯欄位的來源附件；一般 JSON、不支援檔案或特殊項目不得單獨形成建議。唯讀 worker 只能重用既有輸入類型、升級評估、案件／多案件掃描與附件來源檢查核心來建議工具及 `InitialMode`；不得另做治理狀態、組包、升級或核可。只有目前路徑與建議完全相符且使用者明確點擊建議工具時，hub 才可傳入 `AutoInspect`；三套 GUI 只能分別觸發既有 `check / verify`、`case / portfolio` 或 `inspect`，不得觸發 `build / execute`、確認勾選或任何寫入動作。原按鈕、重查與確認閘門仍須保留；非建議工具只能預填。畫面必須明示自動辨識仍是唯讀、單擊捷徑的權限差異及治理 ready 不等於正式核可。PowerShell 非 ASCII 檔須保留 UTF-8 BOM，根目錄捷徑與四個工作台檔案均不得發布至 Pages。

工作台 advisor 非同步、鍵盤操作與視窗邊界：外部 Node 程序不得在 UI thread 同步等待；只能由 WinForms 計時器輪詢完成。工作台寬高須依啟動瞬間游標所在螢幕的工作區縮減並手動置中，不得固定使用主要螢幕；最低 780 × 640px 時主要內容必須由獨立容器雙向捲動、狀態列保持固定，且底部正式核可提醒及最右側工具按鈕仍可完整到達。小視窗 smoke 必須在顯示前設定 800 × 640px，驗證視窗四邊仍在所選螢幕工作區內，並以真實 `WM_VSCROLL / SB_BOTTOM`、`WM_HSCROLL / SB_RIGHT` 及畫面座標驗證內容邊界。控制項須有明確 Tab 順序、輔助名稱與權限描述，並支援 `Ctrl+L` 聚焦路徑、`Enter` 執行目前的唯讀辨識操作及辨識中以 `Esc` 停止；鍵盤 smoke 必須證明焦點能使最右側工具完整進入窄視窗可視區。辨識期間按鈕必須切換為「停止辨識」，使用者可立即取消背景程序且工作台保持開啟；路徑改變也必須取消舊程序。結果套用前必須重驗目前路徑，60 秒逾時與視窗關閉都需清理背景程序；worker 逾時或失敗時須清除建議、將按鈕改為「重新辨識」並顯示可重試狀態。契約需同時守住 UI 不阻塞、過期結果不覆蓋、背景程序不殘留，且取消／逾時／失敗不形成任何子工具啟動或案件寫入；取消 smoke 必須以真實 WinForms message loop 先觸發按鈕 `PerformClick()` 停止第一個 worker，再啟動第二個 worker 並送出真實 `Esc`，驗證兩種停止路徑的 worker、advisor、視窗、待命按鈕與取消訊息最終狀態；生命週期 smoke 必須在同一視窗切換資料夾並正常關閉，驗證前後兩個 worker 均被清除；逾時 smoke 必須由真實 WinForms 計時器終止第一個慢速 worker，再以同一按鈕 `PerformClick()` 重試，驗證第二個 worker 正常完成、結果取代逾時狀態且前後程序均不殘留；失敗 smoke 必須以真實 worker 錯誤完成相同的重試復原，兩者均不得被人工對話框阻塞。

```powershell
git add -- "石材固定/石材計算書產生器_規範版V2.html" "石材固定/server.py" "石材固定/ui_smoke_test.py" "石材固定/js/code-profiles-registry.spec.js" "石材固定/js/code-profiles-registry-smoke.test.js" "石材固定/js/regression-smoke.test.js"
git add -- "石材固定/README.md" "石材固定/CHANGELOG.md" "石材固定/PROJECT_FILES.md" "石材固定/RELEASE_CHECKLIST.md" "石材固定/自我檢查.bat" "石材固定/stone-traceability.catalog.json" "石材固定/stone-traceability.contract.test.js" "石材固定/stone-report.contract.test.js"
git add -- "開挖擋土支撐/README.md" "開挖擋土支撐/RECEIVER_EVIDENCE_TEMPLATES.md" "開挖擋土支撐/excavation-traceability.catalog.json" "開挖擋土支撐/excavation-traceability.contract.test.js" "開挖擋土支撐/excavation-report.contract.test.js" "開挖擋土支撐/receiver-evidence-templates.test.js" "開挖擋土支撐/backend/requirements.txt" "開挖擋土支撐/backend/app/schemas.py" "開挖擋土支撐/backend/app/calculations.py" "開挖擋土支撐/backend/app/main.py" "開挖擋土支撐/backend/app/receiver_capacity.py" "開挖擋土支撐/backend/app/pdf_render_evidence.py" "開挖擋土支撐/backend/app/reporting.py" "開挖擋土支撐/backend/app/workbook_loader.py" "開挖擋土支撐/backend/tests/handoff_fixtures.py" "開挖擋土支撐/backend/tests/test_attachment_package_evidence_chain_drill.py" "開挖擋土支撐/backend/tests/test_receiver_capacity.py" "開挖擋土支撐/backend/tests/test_calculations.py" "開挖擋土支撐/backend/tests/test_import_flow.py" "開挖擋土支撐/backend/tests/test_pdf_render_evidence.py" "開挖擋土支撐/backend/tests/test_project_store.py" "開挖擋土支撐/backend/tests/test_report_delivery_api.py" "開挖擋土支撐/backend/tests/test_reporting.py" "開挖擋土支撐/backend/tests/release_report_artifacts.py" "開挖擋土支撐/frontend/src/App.tsx" "開挖擋土支撐/frontend/src/api.ts" "開挖擋土支撐/frontend/src/receiverEvidenceTemplates.ts" "開挖擋土支撐/frontend/src/styles.css" "開挖擋土支撐/frontend/src/types.ts"
git add -- "覆工板/README.md" "覆工板/decking-result-replay.js" "覆工板/decking-report.contract.test.js" "覆工板/test-fixtures/report-smoke.json" "覆工板/decking-traceability.catalog.json" "覆工板/decking-traceability.contract.test.js" "結構工具箱/tools/construction-stage-load-handoff.js" "結構工具箱/tools/construction-stage-load-handoff.test.js" "結構工具箱/tools/建立覆工板施工階段荷重交接檔.bat"

施工階段荷重交接改動必須同批 staging 覆工板重播／traceability、交接產生器／測試／批次入口、開挖 schema／計算／報告／前端／測試、`preflight-tools.ps1`、首頁治理來源與三份治理文件。交接只能由完整覆工板 JSON 以現行核心重算並核對 `Pu1 / Pu2 / Pu3 / PuMax` 與來源計算指紋後建立；輸出固定為 `construction-stage-decking-load-handoff` v1、tf 單位及 `CSH-` 指紋，且不得假設開挖柱座標方向。開挖端必須由使用者以固定柱位 ID 逐柱明確匯入，不得自動套用、傳遞核可狀態或在中間柱採用；每柱最多 20 個唯一階段。來源控制軸力不得改寫；同一交接指紋於所有啟用柱位的分配比例合計必須為 100%，多柱時逐柱分配依據必填且階段名稱須一致，後端以來源軸力乘比例作為各柱 Np，違反即對相關柱位失敗關閉。若採用階段附加偏心，必須另行明確勾選、輸入帶正負號的 X／Y 偏心及採用依據；後端以 `Np × Δe` 產生附加彎矩，並拒絕未勾選夾帶偏心、勾選後零偏心或缺依據。後端需重驗柱位、階段、來源及 CSH，連同零施工構台荷重基準案逐案計算，再分別包絡柱互制、基礎壓入與拉拔控制階段。PDF／DOCX 只列來源軸力、分配比例與依據、各柱採用軸力、偏心、衍生／最終彎矩、控制階段及精簡來源追溯。比例合計檢查不證明比例的工程正確性；座標方向、支撐內力變化與二階效應仍屬人工複核邊界。
```

RC 專案 JSON／計算書追溯對齊：調整 `attachment-package-check.js` 的 RC JSON 欄位辨識或 CSS 可見性解析時，需一併 staging 單元測試、七個 RC report visual producer、共用可攜 HTML gate、`rc-project-fingerprint.contract.test.js`、相關回歸測試與三份治理文件。既有 `metadata`／`fields` 及單樁 `state` 都必須可抽取案件資料；計算書 `outputSource` 必須與同頁專案 JSON 的工具名稱、版本完全相同。包內同時存在完整追溯來源與正式計算書時至少須有一組案件／工具／版本／指紋完整配對；零配對必須 `blocked`，不得以同時改寫工具身分、版本及指紋規避。每個正式瀏覽器案例都要以真實來源 JSON 與核可後 HTML 通過同一附件檢查器，且竄改指紋、錯版本與完整身分改寫來源必須 `blocked`。CSS 後代與屬性選擇器只可在可逐層對照實際標記時自動判讀；無法解析的組合器仍維持失敗封閉。不得要求改寫舊專案檔或另造轉接來源。

## D. 高頻局部快算工具

Windows 案件附件工作台捷徑安裝器：新增或調整根目錄 `安裝案件附件工作台捷徑.bat`、根目錄 `檢查案件附件工作台捷徑.bat`、根目錄 `移除案件附件工作台捷徑.bat` 或 `install-attachment-governance-shortcuts.ps1` 時，必須同步 staging `attachment-governance-shortcut-installer.test.js`、preflight、Pages artifact／HTTP 私有邊界清冊、README 與 `TOOL_BOUNDARIES.md`。桌面、SendTo 與開始功能表三個捷徑只能指向根目錄受治理啟動器，工作目錄必須對齊 repo，參數必須為空。SendTo 描述與安裝提示需明確說明可接收單一案件資料夾或 `.formal-source.zip`，但不得讓捷徑自行放寬驗證；一般檔案、多重選取、連結與特殊項目仍由工作台拒絕。檢查模式全程唯讀，個別捷徑只可回報 `current`、`repairable`、`foreign` 或 `absent`，整體依序判為 `ready`、`review` 或 `blocked`，且不得改變捷徑內容或時間。只有帶管理標記或精確指向目前 repo 受治理啟動器的捷徑可修復；指向其他資料夾同名批次檔的捷徑必須判為 `foreign`。必須先預檢全部目的地；任一處同名使用者捷徑都必須保留原檔、在寫入前停止整批安裝並失敗封閉。已正確安裝的捷徑不得重寫。移除模式只能刪除受管理捷徑，不存在與同名使用者捷徑必須分別回報 `absent` 與 `preserved`。PowerShell 檔須保留 UTF-8 BOM，五個檢查／安裝／移除檔案均不得發布至 Pages。

```powershell
git add -- "安裝案件附件工作台捷徑.bat" "檢查案件附件工作台捷徑.bat" "移除案件附件工作台捷徑.bat" "結構工具箱/tools/install-attachment-governance-shortcuts.ps1" "結構工具箱/tools/attachment-governance-shortcut-installer.test.js" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" "preflight-tools.ps1" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
```

已納入 `結構工具箱/tools/` 下，適合獨立小包提交。這類工具應維持「HTML 只渲染、core.js 做計算、*.test.js 做 golden regression」的形態。

```powershell
git add -- "結構工具箱/tools/foundation/foundation-local.html" "結構工具箱/tools/foundation/foundation-local-core.js" "結構工具箱/tools/foundation/foundation-local-core.test.js" "結構工具箱/tools/foundation/foundation-local-golden-cases.js"
git add -- "結構工具箱/tools/equipment/equipment-load.html" "結構工具箱/tools/equipment/equipment-load-core.js" "結構工具箱/tools/equipment/equipment-load-core.test.js" "結構工具箱/tools/equipment/equipment-load-golden-cases.js"
git add -- "結構工具箱/tools/earth/earth-pressure.html" "結構工具箱/tools/earth/earth-pressure-core.js" "結構工具箱/tools/earth/earth-pressure-core.test.js" "結構工具箱/tools/earth/earth-pressure-golden-cases.js" "結構工具箱/tools/earth/earth-pressure-rc-bridge.js"
git add -- "結構工具箱/core/ui/report.js" "結構工具箱/core/direct-print-boundary.css" "結構工具箱/core/loads/loadcombo.js" "結構工具箱/tools/local-quick-tools.manifest.json" "結構工具箱/tools/local-quick-tools.run.js" "結構工具箱/tools/local-quick-export.js" "結構工具箱/tools/local-quick-export.test.js" "結構工具箱/tools/local-quick-output-consistency.test.js" "結構工具箱/tools/loadcombo-v2.test.js" "結構工具箱/tools/local-quick-browser-smoke.test.js" "結構工具箱/tools/project-meta-profile.js" "結構工具箱/tools/project-meta-profile.test.js" "結構工具箱/tools/project-storage.test.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-traceability.catalog.json" "結構工具箱/tools/formal-traceability.contract.test.js" "結構工具箱/tools/formal-tools.run.js" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/formal-browser-smoke.test.js" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/rendered-delivery-evidence.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/rendered-delivery-evidence.inventory.json" "dev_tools/attachment-integrity-diagnostic.js" "結構工具箱/tools/attachment-integrity-diagnostic.test.js" "dev_tools/html-attachment-integrity.js" "結構工具箱/tools/html-attachment-integrity.test.js" "結構工具箱/tools/report-disclosure.contract.test.js" "結構工具箱/tools/delivery-artifacts.contract.test.js" "結構工具箱/tools/release-readiness.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/local-quick-tools.contract.test.js"
git add -- "啟動案件附件工作台.bat" "結構工具箱/tools/build-pages-artifact.js" "結構工具箱/tools/pages-live-smoke.js" "結構工具箱/tools/calculation-book-content-boundary.json" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/attachment-package-check.js" "結構工具箱/tools/attachment-package-check.test.js" "結構工具箱/tools/檢查附件組包.bat" "結構工具箱/tools/attachment-package-build.js" "結構工具箱/tools/attachment-package-build.test.js" "結構工具箱/tools/建立正式附件包.bat" "結構工具箱/tools/attachment-package-verify.js" "結構工具箱/tools/attachment-package-verify.test.js" "結構工具箱/tools/驗證正式附件包.bat" "結構工具箱/tools/attachment-package-manager-worker.js" "結構工具箱/tools/attachment-package-manager.ps1" "結構工具箱/tools/啟動正式附件包管理器.bat" "結構工具箱/tools/attachment-package-manager.contract.test.js" "結構工具箱/tools/attachment-case-governance-viewer-worker.js" "結構工具箱/tools/attachment-case-governance-viewer.ps1" "結構工具箱/tools/啟動案件附件治理檢視器.bat" "結構工具箱/tools/attachment-case-governance-viewer.contract.test.js" "結構工具箱/tools/attachment-package-upgrade-assistant-worker.js" "結構工具箱/tools/attachment-package-upgrade-assistant.ps1" "結構工具箱/tools/啟動舊版附件升級助手.bat" "結構工具箱/tools/attachment-package-upgrade-assistant.contract.test.js" "結構工具箱/tools/attachment-governance-hub-worker.js" "結構工具箱/tools/attachment-governance-hub.ps1" "結構工具箱/tools/啟動案件附件工作台.bat" "結構工具箱/tools/attachment-governance-hub.contract.test.js"
git add -- "結構工具箱/tools/rendered-delivery-evidence.js" "結構工具箱/tools/attachment-canonical-render-e2e.test.js" "preflight-tools.ps1" "README.md" "TOOL_BOUNDARIES.md" "STAGING_GROUPS.md"
git add -- "結構工具箱/tools/attachment-package-upgrade-assess.js" "結構工具箱/tools/attachment-package-upgrade-assess.test.js" "結構工具箱/tools/評估舊版附件包升級.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace.js" "結構工具箱/tools/attachment-package-upgrade-workspace.test.js" "結構工具箱/tools/建立舊版附件升級工作區.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-workspace-check.js" "結構工具箱/tools/attachment-package-upgrade-workspace-check.test.js" "結構工具箱/tools/檢查舊版附件升級工作區.bat" "結構工具箱/tools/attachment-package-build.js"
git add -- "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history.js" "結構工具箱/tools/attachment-package-upgrade-history.test.js" "結構工具箱/tools/attachment-package-upgrade-flow.js" "結構工具箱/tools/attachment-package-upgrade-flow.test.js" "結構工具箱/tools/舊版附件包升級流程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-index.js" "結構工具箱/tools/attachment-package-upgrade-history-index.test.js" "結構工具箱/tools/檢查附件升級內部歷程.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline.test.js" "結構工具箱/tools/建立附件升級可信基準.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.test.js" "結構工具箱/tools/推進附件升級可信基準.bat"
git add -- "結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.js" "結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.test.js" "結構工具箱/tools/檢查附件升級可信基準版本鏈.bat"
git add -- "結構工具箱/tools/attachment-case-governance-overview.js" "結構工具箱/tools/attachment-case-governance-overview.test.js" "結構工具箱/tools/檢查案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-root.js" "結構工具箱/tools/attachment-case-governance-root.test.js" "結構工具箱/tools/檢查案件根目錄附件治理.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio.js" "結構工具箱/tools/attachment-case-governance-portfolio.test.js" "結構工具箱/tools/檢查多案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-compare.js" "結構工具箱/tools/attachment-case-governance-portfolio-compare.test.js" "結構工具箱/tools/比較多案件附件治理總覽.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot.test.js" "結構工具箱/tools/保存多案件附件治理快照.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.test.js" "結構工具箱/tools/檢查多案件治理快照歷程.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.test.js" "結構工具箱/tools/分析多案件治理快照趨勢.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置.bat" "結構工具箱/tools/記錄多案件治理趨勢處置.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置檢查點.bat" "結構工具箱/tools/建立多案件治理趨勢處置檢查點.bat"
git add -- "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js" "結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.test.js" "結構工具箱/tools/檢查多案件治理趨勢處置檢查點歷程.bat"
git add -- "結構工具箱/tools/attachment-case-governance-workspace.js" "結構工具箱/tools/attachment-case-governance-workspace.test.js" "結構工具箱/tools/檢查附件治理工作區.bat" "結構工具箱/tools/建立附件治理工作區.bat"
git add -- "結構工具箱/index.html" "結構工具箱/index-classic.html" "結構工具箱/assets/home/home.js" "結構工具箱/assets/home/home.css" "結構工具箱/assets/status/platform-status.json" "結構工具箱/assets/status/preflight-summary.json" "結構工具箱/assets/status/report-readiness-status.json" "結構工具箱/assets/hy/colors_and_type.css" "結構工具箱/audit-dashboard.html" "結構工具箱/tools/audit-dashboard.contract.test.js" "結構工具箱/tools/audit-dashboard-browser-smoke.test.js" "vercel.json" "preflight-tools.ps1" "toolbox-entrypoints.contract.test.js"
```

局部快算計算書文件狀態變更必須把三個頁面、manifest、共用 renderer、共同契約、Edge/CDP browser smoke、成熟度矩陣與上述文件一起 staging。smoke 必須驗證空白案件欄位、預設內部審閱、核可正式附件及輸入變更撤銷核可；工程 review / blocked 不得再產生 DRAFT。工作頁直接列印仍只允許邊界通知。

工具成熟度矩陣輸出位於 `output/audit/tool-maturity-matrix.json` 與 `output/audit/tool-maturity-matrix.md`，屬於可重產生輸出，不建議 staging；首頁公開狀態快照位於 `結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json` 與 `結構工具箱/assets/status/report-readiness-status.json`，由 `tool-maturity-matrix.js --write` 依最新 `output/` 精簡產生，應與首頁狀態讀取邏輯一起 staging。quick preflight 只應以 `--preserve-homepage-status` 更新 ignored `output/audit` 矩陣，不應覆寫這三個 tracked 公開快照；正式放行或刻意刷新首頁狀態時才 staging 它們。應 staging 的是 `結構工具箱/tools/tool-maturity-matrix.js`、`formal-tools.manifest.json` 內的 golden cases、`local-quick-browser-smoke.test.js` 內的 JSON round-trip / 報告可讀文字抽檢、`project-storage.test.js` 的專案欄位 placeholder/trim 合約，以及 dashboard 讀取邏輯與 `audit-dashboard-browser-smoke.test.js` 的 fixture 渲染檢查。dashboard browser smoke 會拒絕未列入 fixture map 的 `output/` 請求，避免測試意外讀到本機最新輸出而掩蓋路徑漂移。

若本包調整風力 / 地震正式工具的 HTML 彈窗型計算書，`formal-tools.contract.test.js` 需同步保留輸出文字抽檢、共用核可狀態與 page-only wording 排除規則；`formal-browser-smoke.test.js` 必須實測內部審閱、正式附件、核可時間、空白欄位省略與輸入變更撤銷核可。調整案件 JSON 時，14 頁仍須驗證 schema、工具、版本與重現指紋。

入口治理、首頁正式狀態治理、首頁版本治理、首頁公開狀態快照、Pages deploy / live smoke、preflight contract 文件化、preflight JS 執行檔清冊、preflight helper script 清冊、staging 指引可執行性、目前工作樹覆蓋率與非 formal 責任邊界變更需一併 staging `toolbox-entrypoints.contract.test.js`、`vercel.json` 與 `結構工具箱/assets/home/home.js`、`結構工具箱/assets/home/home.css`、`結構工具箱/assets/status/platform-status.json`、`結構工具箱/assets/status/preflight-summary.json`、`結構工具箱/assets/status/report-readiness-status.json`、`結構工具箱/assets/hy/colors_and_type.css`；跨家族報告揭露治理需一併 staging `結構工具箱/tools/report-disclosure.contract.test.js`，並讓 `report-disclosure-contract` 留在 preflight summary 中；交付物一致性治理需一併 staging `結構工具箱/tools/delivery-artifacts.contract.test.js`，並讓 `delivery-artifacts-contract` 留在 preflight summary 與 Global Governance Gates 中；這個契約現在要同時覆蓋 stone audit JSON / Word / PDF、錨栓 HTML / XLSX / DOCX、覆工板 JSON / Word 與開挖 PDF / DOCX / latest download API。正式放行證據治理需一併 staging `結構工具箱/tools/release-readiness.contract.test.js`、`run-preflight-tools-release.bat` 與 dashboard 相關檔案，並讓 `release-readiness-contract` 留在 preflight summary 與 Global Governance Gates 中，且 release wrapper 必須固定保留 `ForceSlowChecks` 與 `ForcePlatformAudit`；release 尾段矩陣刷新需優先採用當輪通過的 full summary 與當輪完整渲染證據，latest 為 quick 或失敗時則回退最近一次通過的 full history，不得因 history manifest 尚未更新而發布失敗狀態。這個合約會比對首頁入口、`routeFileMap`、`vercel.json`、`formal-tools.manifest.json`、`local-quick-tools.manifest.json` 與實際 HTML 檔案，要求 maturity matrix 外的正式卡片在 `governanceSources` 指向對應 preflight gate；其中風力 / 地震正式工具卡片需明列 `formal-traceability-contract`、`formal-tools-static` 與 `formal-browser-smoke`，RC 卡片的治理來源必須明列 `rc-traceability-contract`、`rc-audit-status`、`rc-column-report-contract`、`rc-shear-wall-report-contract`，Steel 卡片則必須明列 `steel-formal-regression`，Stone 卡片則必須明列 `stone-report-contract`。連續梁、平面剛架、斷面 / 合成斷面與局部快算卡片也要帶出對應的計算書 / 報表 / JSON 邊界 chip，讓首頁與成熟度矩陣一併揭露頁面專用「優先建議報告閱讀狀態」的報告邊界契約，而不是只剩一般 audit 標籤。首頁側欄的 `報告閱讀狀態總覽` 卡也要跟著 staging，確保 page-only 規則與已治理家族總覽會一起發布到工作頁，而不是只留在 matrix / preflight 輸出。也要求 `HOME_TOOL_UPDATES` 逐入口保存工具內容更新日，以 `releaseVerifiedAt` 對齊 tracked 正式放行快照，首頁卡片版本並須對齊工具頁 title / H1 / report metadata；要求首頁狀態讀取 tracked `assets/status` 快照而不是 git ignored `output/`，要求 Pages deploy workflow 使用 `configure-pages`、`upload-artifact`、`deploy-pages`，保留 `deploy-pages@v5` 官方 600,000 ms（10 分鐘）硬上限；正式推送入口只能在 failed log 精確命中 queued／in-progress timeout 與取消、且同一 SHA 的 Pages API 於 180 秒內轉為 `succeed` 時，對同一 run 重跑 failed jobs，其他失敗仍須停止，排除 Markdown / script / test / contract / `dev_tools/` / source / backend / package 類非公開檔案，並於 staged root 產生 v2 `pages-deployment.json`，以固定 ordinal 的封閉逐檔清冊列出每個發布檔案的相對路徑、位元組數與 SHA-256，再重算 `sha256-tree-v1`、fileCount、totalBytes，並綁定當次 commit、Actions runId 與 attempt；上線前與上線後 HTTP smoke 都必須比對同一 commit/runId，並以最多 8 個並行請求逐檔下載整個公開 artifact，核對 HTTP 200、大小與 SHA-256，builder source 與 manifest 本身不得發布或納入 digest。archive / upload / deploy 前需對 staged `_site` 執行 HTTP private-boundary 與 86 組 Playwright browser smoke，任一失敗即阻擋發布；deploy 後再對正式網址重跑相同檢查。HTTP smoke 與共用 `run-pages-browser-smoke.sh` 必須同時服務兩階段且不得納入公開 artifact；staged gate 與本機預演不重試，只有正式 live 的 HTTP smoke 與 browser smoke遇到 HTTP 5xx 或明列暫態網路錯誤時，才可各自於 5 秒後完整重跑最多一次，非暫態、404、大小或雜湊不符及第二次持續失敗仍阻擋；HTTP 私有邊界遇到 5xx 也必須先判為暫態失敗，不得把 503 當成非 200 的通過證據。並要求 `preflight-tools.ps1` 內執行的 `*.contract.test.js` 都列入本檔與 `TOOL_BOUNDARIES.md`，preflight JS 執行檔清冊也要求具體 `.test.js` / `.run.js` 列入本檔與 `TOOL_BOUNDARIES.md`，preflight helper script 清冊則要求 `.ps1` / `.bat` 入口列入 staging 與邊界文件，也要求本檔 `git add` 路徑必須在 checkout 中存在；git-aware 的 tracked deletion、未追蹤 ignored path 與目前 `git status` 變更覆蓋率由 preflight `staging-groups-coverage` gate 檢查，再用 `stateBoundaryRules` 確認非 formal 卡片的 limit / capability 沒有過度承諾。

Pages provenance 變更還必須一併 staging 共用 artifact builder、manifest builder、workflow、HTTP smoke、local artifact wrapper 與兩份入口／release contract。Actions 與本機預演只能透過 `build-pages-artifact.js` 的 Git tracked＋非 ignored 清冊產生發布樹，不得再分別維護 `rsync` / `robocopy` 排除規則；暫存 Git index 必須套用 LF clean filter，讓 Windows 與 Linux 對同一內容得到相同 fileCount、totalBytes 與 digest。正式 workflow 在 staging 前須以 `git status --porcelain --untracked-files=all` 證明 checkout 乾淨，manifest 固定記錄並驗證 `sourceDirty: false`；本機預演則如實保存 dirty/clean，不得只以 HEAD SHA 誤示為完整來源。

開挖完整後端慢測治理：`excavation-backend` 的 preflight 專屬上限為 `timeoutSeconds = 300`。調整開挖後端完整測試套件或 wrapper 時，必須同步 staging `preflight-tools.ps1`、入口契約、README 與邊界文件；不得以 timeout 調整取代、重用或縮減實際測試。

RC 柱報告慢測治理：`rc-column-report-contract` 的 preflight 專屬上限為 `timeoutSeconds = 600`。調整柱報告視覺案例、人工複核完成／正式附件核可案例或 wrapper 時，必須同步 staging `preflight-tools.ps1`、入口契約、README 與邊界文件。

風力／地震正式報表慢測治理：`formal-browser-smoke` 的 preflight 專屬上限為 `timeoutSeconds = 600`。調整 14 個正式工具的桌面／行動版瀏覽器證據、渲染彙整或 runner 時，必須同步 staging `preflight-tools.ps1`、入口契約、README 與邊界文件。

平台完整稽核慢測治理：`audit-all.ps1` 內完整 RC audit 的上限為 `timeoutSeconds = 900`，`preflight-tools.ps1` 外層 `platform-audit` 上限為 `timeoutSeconds = 1200`。`鋼筋混凝土/audit-tool.ps1` 只允許對精確 `net::ERR_NO_BUFFER_SPACE` 保存首次 log、冷卻 60 秒並重跑單一 RC gate 一次，其他錯誤與第二次失敗仍阻擋。調整平台平行策略、暫態重試或任一家族完整 audit 時，必須同步 staging `audit-all.ps1`、`preflight-tools.ps1`、`鋼筋混凝土/audit-tool.ps1`、`鋼筋混凝土/tools/audit-status.contract.test.js`、入口契約、README 與邊界文件；不得以 timeout 或重試調整取代、重用或縮減實際檢查。

首頁版本合約會同時檢查 `APP_VERSION`、`TOOL_VERSION`、title、H1、報告與 metadata；任一入口調整版本時，必須同步更新 `HOME_TOOL_UPDATES` 的逐工具日期與首頁版本。

注意事項：

- `run-preflight-tools-release.bat` 不得透傳 `%*` 或接受 `-Quick` 覆蓋；正式放行證據只能是 full run 加 `ForceSlowChecks` / `ForcePlatformAudit`，並由 preflight 啟動時寫入 `sourceCommitSha`、`sourceBranch`、`sourceDirty`；commit 無法辨識或工作樹不乾淨時必須立即阻擋。正式 release 單例鎖改動必須同批 staging `preflight-tools.ps1`、`結構工具箱/tools/release-preflight-lock.ps1`、`結構工具箱/tools/release-preflight-lock.test.js`、release contract、Pages 私有邊界與三份治理文件；測試須以真實雙程序證明同工作區競爭失敗關閉、不同工作區可並行、強制終止持鎖程序後可重新取得，且 quick／CI 不套用此鎖。
- `結構工具箱/tools/rendered-delivery-evidence.js` 與 formal / local / steel browser runner 必須同批 staging；release 證據需落在當輪 `PREFLIGHT_RUN_DIR/rendered-delivery-evidence/`，不得只留下 HTML 字串檢查，且多頁 PDF 必須拒絕頁尾與資料列混在同一文字行、頁尾孤立章節標題、從孤立公式 / 單一資料列 / 無標籤片段起頁，以及文字量與渲染墨量同時過低的稀疏末頁。錨栓正式報告證據改動需同批 staging `螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts`、anchor report contract、rendered inventory 與 aggregate / release contract，並保留當輪 HTML、DOCX、XLSX 供總閘門解析 Office XML，不能只用 `anchor-report-contract` 日誌代替成品。石材正式報告證據改動則需同批 staging `石材固定/auto_word_artifact_test.py` 及相同治理檔，並保留當輪 PDF、DOCX、audit JSON。覆工板正式報告證據改動需同批 staging `覆工板/decking-report.contract.test.js`、rendered inventory、aggregate / delivery / release contract 與覆工板 README，並在 `decking-formal` 保留當輪 DOCX 與結構摘要供總閘門重新解析，不能依賴 `output/preflight/cover-slab-report-contract.docx` 或通過日誌。開挖正式報告證據改動需同批 staging `開挖擋土支撐/excavation-report.contract.test.js`、`backend/tests/release_report_artifacts.py`、aggregate / delivery / release contract、成熟度矩陣、首頁狀態顯示與開挖 README；`excavation-formal` 必須保留當輪 PDF、DOCX 與 latest download 副本。動力分析摘要證據改動需同批 staging `formal-browser-smoke.test.js`（若產報本體有變）、aggregate / release contract、成熟度矩陣、首頁狀態顯示與相關文件，並重新解析 `seismic-dynamic-formal-report.pdf` 及 evidence JSON。兩者合計為補充報告 / 服務成品 `2/2`，與首頁 `31/31` 分開計數。共用報告樣式與 RC 視覺 PDF 必須同批納入，確保標題跟隨內容、表格列不拆頁、跨頁表頭重複，以及 `uncontextualPageStartCount=0`；個別 RC 輸入群組若使用 `keepTogether`，對應工具頁與共用 report helper 也必須同批 staging。
- Canonical rendered evidence aggregate 改動必須同批 staging `rendered-delivery-evidence.js`、aggregate contract、三個 producer browser runner 的既有 `writeEvidenceSummary` 呼叫路徑、`release-readiness.contract.test.js`、`tool-maturity-matrix.js`、`assets/home/home.js`、`pages-live-smoke.js` 與報告邊界文件。Schema v3 固定要求 30 組 PDF／evidence、60 份實體檔全數通過；schema v14 納入群樁側向分配 RC 基礎案例後，RC 視覺固定 `66`、混合格式固定 `13`，彙成「成品檔案完整性 `139/139`」的匿名計數。Family summary 缺 PDF 或 evidence bytes／SHA-256、總閘門未去重重驗、或同大小替換負向 fixture 未封鎖時不得 release；公開狀態不得複製 aggregate 私有欄位、scope、artifact 清冊或 set hash。
- 局部快算結果鏈 schema v12 改動必須同批 staging `local-quick-browser-smoke.test.js`、`rendered-delivery-evidence.contract.test.js`、`release-readiness.contract.test.js`、`tool-maturity-matrix.js`、`assets/home/home.js`、`pages-live-smoke.js`、`toolbox-entrypoints.contract.test.js` 與報告邊界文件。正式放行須由基礎、設備荷重、擋土土壓三份來源 JSON 完成全輸入／全結果重播，核對 PDF 計算指紋及成品雜湊；公開快照只發布 `3/3` 完成數，不得發布來源 JSON、案例資料、逐筆雜湊或計算指紋。
- RC 梁報告瀏覽器等待調整需同批 staging `鋼筋混凝土/tools/beam-report-visual.test.js`、`鋼筋混凝土/tools/beam-report-visual.contract.test.js` 與 `TOOL_BOUNDARIES.md`；高負載下 popup 最長等待 60 秒，逾時仍視為失敗，不得移除成品檢查。
- Formal result reconciliation 改動必須同批 staging `formal-tools.manifest.json`、`formal-browser-smoke.test.js`、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v4 固定要求風力／地震 14 個正式工具全部在產報前完成 golden case 重算斷言，producer 記錄用於產報的案例雜湊、驗證數、斷言數與報告指紋，aggregate 核對 `14/14` 並形成私人集合雜湊；公開狀態只顯示「數值結果鏈 `14/14`」。
- RC result reconciliation 改動必須同批 staging `report-result-reconciliation.js`、七個 `*-report-visual.test.js` producer、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v5 固定要求 30 組 RC 瀏覽器回歸案例完成專案快照重現、PDF 與正式 HTML 指紋核對；aggregate 核對 `30/30`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「RC 結果鏈 `30/30`」。
- Steel result reconciliation 改動必須同批 staging `steel-result-reconciliation.js`、`steel-audit-browser-runner.js` producer、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v6 固定要求主工具連接板、主工具拉力構件、獨立連接板、鋼梁與鋼柱共 5 個來源完成 JSON 匯出／重播、不相容版本拒絕與正式計算書指紋核對；aggregate 核對 `5/5`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「鋼構結果鏈 `5/5`」。
- RC retrofit result reconciliation 改動必須同批 staging `report-result-reconciliation.js`、`retrofit-report-visual.test.js` producer、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v7 固定要求梁、柱補強兩組案例先證明需求值變更會改變結果，再還原表單重算並核對報告／正式 HTML 指紋；aggregate 將 RC 結果鏈擴為 `32/32`、核對唯一案例身分與私人集合 SHA-256。公開狀態只顯示「RC 結果鏈 `32/32`」。
- RC 土壓銜接與擋土牆底版結果鏈改動必須同批 staging 土壓核心與橋接模組、`鋼筋混凝土/shared/retaining-base-demand.js` 及其單元測試、RC 基礎 producer／案例／contract、traceability catalog、rendered evidence inventory／aggregate、release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v13 固定要求 RC 結果鏈 `33/33`、RC PDF／PNG `64/64` 與 RC HTML `33/33`；既有擋土牆案例新增底版檢核群組不另增案例計數。
- RC 群樁側向分配或專業 p-y 銜接改動必須同批 staging 側向分配核心、`pile-py-result-bridge.js`、`pile-py-table-adapter.js`、各自單元測試、RC 基礎 producer／案例／contract、traceability catalog 與報告邊界文件。Schema v14 固定要求 RC 結果鏈 `34/34`、RC PDF／PNG `66/66` 與 RC HTML `34/34`；新增採用結果不另增案例計數。CSV／TSV／TXT 直接讀取、Excel 貼上、範本下載、原始檔名／內容雜湊、同位元組候選 JSON 歸檔、1 MiB 匯入上限與下載／採用前重驗須同批驗證；不得宣稱直接解析 `.xlsx`。`rc-pile-py-adoption.v2` 的來源原文保存、專案重開下載、SHA-256 重算、篡改阻擋及 v1 計算相容也須同批驗證。p-y 候選必須經模型／分析範圍／載重核對與工程師明確採用；代表單樁須對應 p-multiplier 最大單樁荷重，群樁才可對應整組 Hx／Hy。模型或來源原文變更須讓下載與採用都失敗封閉，未採用相符結果時不得以 p-multiplier 分配證據取代位移與樁身內力分析。
- RC 來源 JSON／正式 HTML 組包 aggregate 改動必須同批 staging 七個 RC `*-report-visual.test.js` producer（如未變更，仍須用當輪 release 證據驗證）、`rendered-delivery-evidence.contract.test.js`、`release-readiness.contract.test.js`、`tool-maturity-matrix.js`、`assets/home/home.js`、`pages-live-smoke.js`、`toolbox-entrypoints.contract.test.js` 與報告邊界文件。Schema v15 固定要求 32 組 RC 專案重播案例的真實來源 JSON／核可後正式 HTML 組包為 `ready`、只有一個指紋連結，且指紋與重算結果一致；補強兩案沒有專案 JSON，不納入計數。Aggregate 保存私人 records 與集合 SHA-256；公開狀態只顯示「RC 來源組包 `32/32`」，不得發布 scope、案例、檔名、工具版本、來源雜湊或計算指紋。
- RC 核可 HTML 獨立列印 aggregate 改動必須同批 staging `鋼筋混凝土/tools/report-portable-html-check.js`、`retrofit-report-visual.contract.test.js`、七個 RC producer（未變更仍須用當輪 release 證據驗證）、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke、入口契約與報告邊界文件。Schema v16 固定要求 RC 設計與補強共 34 份核可 HTML 在新瀏覽器頁面以零外部網路請求重開，print media 中核可／下載控制項不可見，再列印 PDF 並通過正式狀態、指紋、正向工程內容、page-only 排除、共同分頁與 producer／aggregate 雙重 SHA-256 驗證。公開狀態只顯示「RC 核可 HTML 列印 `34/34`」，不得發布 scope、案例、檔名、bytes、成品雜湊或計算指紋。
- RC HTML 內容封印改動必須同批 staging `鋼筋混凝土/shared/report.js`、`report-portable-html-check.js`、附件檢查器及其測試、八組 RC 視覺 smoke、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke、入口契約與邊界文件。Schema v17 固定要求 34 份核可 HTML 的計算主體有可重算 SHA-256 封印，瀏覽器與附件檢查器各自驗證；內容異動 blocked，舊版缺封印 review。內容封印不得稱為核可人數位簽章。公開狀態只顯示「RC HTML 內容封印 `34/34`」，不得發布逐檔封印、scope、records、案例或檔名。
- RC HTML 核可封印改動與內容封印同批 staging。Schema v18 固定要求 34 份核可 HTML 另以可重算 SHA-256 綁定文件狀態、核可時間、計算指紋、標題與內容封印；瀏覽器及附件檢查器各自驗證，核可資料異動 blocked，舊版缺封印 review。核可封印是防竄改證據，不得稱為核可人數位簽章。公開狀態只顯示「RC HTML 核可封印 `34/34`」，不得發布逐檔封印、scope、records、案例或檔名。
- 風力／地震正式 HTML 雙封印改動必須同批 staging `結構工具箱/core/ui/report.js`、`core/wind-report.js`、正式瀏覽器 smoke、附件檢查器及其反向測試、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與邊界文件。Schema v19 固定要求 14 項正式工具的實際下載 HTML 同時通過內容與核可封印重算，內容／核可竄改各自 blocked，舊版缺封印 review。公開狀態只顯示兩組 `14/14`，不得發布逐檔 scope、records、檔名或雜湊。
- 鋼構正式 HTML 雙封印改動必須同批 staging `鋼構工具/app.js`、`core/ui/report.js`、`steel-audit-browser-runner.js`、鋼構回歸與 audit wrapper、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與邊界文件。Schema v20 固定要求主工具連接板、主工具拉力構件、獨立連接板、鋼梁與鋼柱 5 份實際下載 HTML 同時通過內容與核可封印重算及兩種竄改反例；主工具計算書預設內部審閱，核可後正式附件，空白案件欄位省略且不阻擋核可。公開狀態只顯示兩組 `5/5`，不得發布逐檔 scope、records、檔名或雜湊。
- 錨栓正式 HTML 雙封印改動必須同批 staging `src/reportHtmlSeal.ts`、`src/reportExport.ts` 與測試、`tests/reportArtifacts.test.ts`、獨立 `anchor-html-seal-verifier.js`、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與邊界文件。Schema v21 固定要求工作頁核可後的 1 份實際下載 HTML 通過內容與核可封印重算及兩種竄改反例；匯出附件的正式／審閱身分為只讀，不得在附件內自行核可。公開狀態只顯示兩組 `1/1`，不得發布案件、逐檔 scope、records、檔名、指紋或雜湊。
- 正式 DOCX 封裝規則改動必須同批 staging `結構工具箱/tools/docx-package-integrity.js`、`結構工具箱/tools/docx-package-integrity.test.js`、rendered-delivery aggregate、release contract、preflight、成熟度矩陣、Pages 私有路徑清單及四份產製器文件。Schema v22 固定要求石材、錨栓、覆工板與開挖擋土支撐當輪 DOCX `4/4` 通過；未引用媒體／頁首頁尾、實際批註、未接受修訂、外掛範本、外部圖片、嵌入物件、巨集與非預期 custom XML 都會阻擋 release。公開狀態只顯示完成數，不公開檔名、封裝清冊或逐檔細節。
- 正式 XLSX 封裝規則改動必須同批 staging `結構工具箱/tools/xlsx-package-integrity.js`、`結構工具箱/tools/xlsx-package-integrity.test.js`、rendered-delivery aggregate、release contract、preflight、成熟度矩陣、首頁 metric、Pages 私有路徑清單及錨栓產製器文件。Schema v23 固定要求錨栓當輪 XLSX `1/1` 通過；外部關聯／外部公式／連線、公式錯誤或缺少快取結果、隱藏工作表／列／欄／名稱、批註、嵌入物件、巨集、孤兒媒體與非預期 custom XML 都會阻擋 release。公開狀態只顯示完成數，不公開檔名、工作表清冊、公式或逐檔細節。
- 正式 XLSX 列印規則改動必須同批 staging 錨栓 `reportWorkbook.ts`／測試、`結構工具箱/tools/xlsx-print-export.py`、`結構工具箱/tools/xlsx-print-visual.js`、`結構工具箱/tools/xlsx-print-visual.test.js`、rendered-delivery aggregate、release contract、preflight、成熟度矩陣、首頁 `Excel 列印成品` metric、Pages 私有清單與上述文件。Schema v24 要求 Microsoft Excel 唯讀輸出的活頁簿 `1/1`、工作表 `9/9` 通過，並固定 A4、寬表橫向、單頁寬、自動頁高、明確列印範圍、續頁表頭、無橫向溢出、可讀文字、非空白頁與無頁緣裁切；不得只測 OOXML 設定或由稽核器修改後再列印。公開狀態不得包含工作表名稱、PDF、逐頁指標或雜湊。
- 錨栓封印接入案件組包時，必須同批 staging `anchor-html-seal-verifier.js`、`attachment-package-check.js` 與單元測試、`attachment-package-verify.test.js`、release contract 及三份治理文件。測試須涵蓋正常 ready、舊版缺封印 review、內容／核可竄改 blocked，並證明同步重算正式包內檔案雜湊、清單及包指紋仍不能繞過事後語意驗證。
- Stone result reconciliation 改動必須同批 staging `auto_word_artifact_test.py` producer、golden 檔、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v8 固定要求目前瀏覽器核心重播 `case_01_standard_safe`、核對至少 6 項結果，再綁定 PDF、DOCX、audit 與來源雜湊；aggregate 核對 `1/1`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「石材結果鏈 `1/1`」。
- Anchor result reconciliation 改動必須同批 staging `tests/reportArtifacts.test.ts` producer、工作區備份重播、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v9 固定要求 v2 工作區備份完成案例重現驗證、目前核心至少 7 項結果核對，再綁定正式 HTML、DOCX、XLSX 與來源備份實體檔；aggregate 核對 `1/1`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「錨栓結果鏈 `1/1`」。
- Decking result reconciliation 改動必須同批 staging `decking-result-replay.js`、`decking-report.contract.test.js` producer、固定 JSON fixture、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v10 固定要求來源 JSON 六組輸入以目前頁面核心完成至少 31 項結果核對，再綁定 DOCX 計算指紋及來源／成品 SHA-256；aggregate 核對 `1/1`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「覆工板結果鏈 `1/1`」。
- Excavation result reconciliation 改動必須同批 staging `reporting.py`、`release_report_artifacts.py` producer、報告／追溯契約、aggregate / release contract、成熟度矩陣、首頁狀態、Pages live smoke 與報告邊界文件。Schema v11 固定要求保存未含快取結果的 ProjectState，以目前 Python 後端核心重算 47 筆構件檢核並完成至少 618 項結果欄位核對，再綁定 PDF／DOCX 計算指紋及來源／結果／成品 SHA-256；aggregate 核對 `1/1`、唯一案例身分與私人集合 SHA-256。公開狀態只顯示「開挖結果鏈 `1/1`」。
- 不要把基礎局部工具放在 `結構工具箱/tools/基礎/`，目前 `.gitignore` 的 `基礎/` 規則會讓該資料夾被忽略。
- 初估型工具的標題、報表與 note 都應保留「初估 / 局部」語意，避免被誤用為完整規範設計。


## E. RC 正式工具與視覺回歸

這包集中 `鋼筋混凝土/` 的正式工具、共用核心、報表與 regression / browser smoke。內容多，提交前先用 `鋼筋混凝土/tools/test-*.ps1` 或 full preflight 驗證。

```powershell
git add -- "鋼筋混凝土/README.md" "鋼筋混凝土/audit-tool.ps1" "鋼筋混凝土/index.html" "鋼筋混凝土/tools/report-portable-html-check.js" "鋼筋混凝土/tools/retrofit-report-visual.test.js" "鋼筋混凝土/tools/retrofit-report-visual.contract.test.js" "鋼筋混凝土/tools/test-retrofit-report.ps1"
git add -- "鋼筋混凝土/shared" "鋼筋混凝土/tools"
git add -- "鋼筋混凝土/tools/rc-traceability.catalog.json" "鋼筋混凝土/tools/rc-traceability.contract.test.js" "鋼筋混凝土/tools/report-screenshot-quality.js" "鋼筋混凝土/shared/beam-rebar-designer.js" "鋼筋混凝土/shared/beam-rebar-designer.test.js" "鋼筋混凝土/tools/beam-regression.test.js" "鋼筋混凝土/tools/beam-report-visual.test.js" "鋼筋混凝土/tools/beam-report-visual.contract.test.js" "鋼筋混凝土/tools/test-beam.ps1" "鋼筋混凝土/tools/column-report-visual.test.js" "鋼筋混凝土/tools/column-report-visual.contract.test.js" "鋼筋混凝土/tools/test-column.ps1" "鋼筋混凝土/tools/slab.html" "鋼筋混凝土/tools/slab-report-visual.test.js" "鋼筋混凝土/tools/slab-report-visual.contract.test.js" "鋼筋混凝土/tools/test-slab.ps1" "鋼筋混凝土/tools/wall.html" "鋼筋混凝土/tools/wall-report-visual.test.js" "鋼筋混凝土/tools/wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-wall.ps1" "鋼筋混凝土/tools/shear-wall.html" "鋼筋混凝土/tools/shear-wall-report-visual.test.js" "鋼筋混凝土/tools/shear-wall-report-visual.contract.test.js" "鋼筋混凝土/tools/test-shear-wall-report.ps1" "鋼筋混凝土/tools/foundation.html" "鋼筋混凝土/tools/foundation-report-visual.test.js" "鋼筋混凝土/tools/foundation-report-visual.contract.test.js" "鋼筋混凝土/tools/test-foundation.ps1" "鋼筋混凝土/tools/single-pile-designer.html" "鋼筋混凝土/tools/single-pile-report-visual.test.js" "鋼筋混凝土/tools/single-pile-report-visual.contract.test.js" "鋼筋混凝土/tools/test-single-pile.ps1" "RC補強斷面性質.html" "鋼筋混凝土/tools/retrofit-report-visual.test.js" "鋼筋混凝土/tools/test-retrofit-report.ps1" "鋼筋混凝土/tools/audit-status.contract.test.js"
git add -- "鋼筋混凝土/shared/column-rebar-designer.js" "鋼筋混凝土/shared/column-rebar-designer.test.js" "鋼筋混凝土/shared/column-transverse-designer.js" "鋼筋混凝土/shared/column-transverse-designer.test.js" "鋼筋混凝土/tools/column.html" "鋼筋混凝土/tools/column-regression.test.js" "鋼筋混凝土/tools/column-report-visual.test.js" "鋼筋混凝土/tools/column-report-visual.contract.test.js" "鋼筋混凝土/tools/test-column.ps1"
```

`鋼筋混凝土/tools` 內的 `rc-traceability.catalog.json` 是 RC 條文語意追蹤 catalog，需和 `rc-traceability.contract.test.js`、各 RC regression、`report-screenshot-quality.js`、8 個正式輸出頁、各頁 `*-report-visual.test.js`／contract／`test-*.ps1` wrapper，以及 `audit-status.contract.test.js` 一起 staging；補強斷面對應的正式頁位於 repo root `RC補強斷面性質.html`。

建議提交訊息：

```text
Expand RC tool governance and report verification
```

## F. 鋼構正式頁與鋼構工具入口

這包集中 `鋼構工具/` 的正式頁、共用報表、manifest、樣式與 regression；`結構工具箱/tools/鋼構/` 是工具箱內的舊版 / 轉接頁，應與首頁狀態一起審查。`steel-formal.regression-test.js` 同時負責 HTML 彈窗型計算書的可讀文字抽檢、page-only wording 排除、四個正式工作頁的直接列印封鎖、舊版示意圖尺寸標註間距與圖面不可拆頁規則。

正式計算書若調整為 calculation-first 內容邊界，必須把共用 report helper、正向內容共用判讀器、PDF 驗證器、附件組包檢查器、RC report helper、鋼構正式頁與 browser runner、風力 / 地震正式工具 manifest、局部快算三頁及 browser smoke、跨家族 report-disclosure contract、ADR 與報告指南視為同一包審查。輸入模式、換算對照、流程顯示、輸出設定、符號詞典與長篇條文解釋只留在 HTML 畫面；採用值、公式代入、檢核結果、對應條文依據與必要人工複核限制才進入計算書，且檢核結論固定置於計算內容之後。成品 release 與日常附件組包必須依剖面通過採用輸入、計算／檢核過程、工程結果、至少兩個實際工程數值與必要追溯資訊；章名、狀態、版本、日期、時間與指紋不得充當工程數值。明確計算摘要可省略重複詳算但保留相同數值門檻，工作頁直接列印阻擋通知明確豁免正向計算內容。

```powershell
git add -- "鋼構工具/app.js" "鋼構工具/tool-metadata.js" "鋼構工具/index.html" "鋼構工具/plate-check.html" "鋼構工具/core" "鋼構工具/steel-beam-formal.html" "鋼構工具/steel-beam-formal.js" "鋼構工具/steel-column-formal.html" "鋼構工具/steel-column-formal.js" "鋼構工具/steel-formal.regression-test.js" "鋼構工具/steel-audit-browser-runner.js" "鋼構工具/steel-traceability.catalog.json" "鋼構工具/steel-traceability.contract.test.js" "鋼構工具/steel-member-formal.css" "鋼構工具/styles.css" "鋼構工具/README.md" "結構工具箱/core/direct-print-boundary.css"
git add -- "結構工具箱/tools/鋼構/steel-beam.html" "結構工具箱/tools/鋼構/steel-column.html"
git add -- "結構工具箱/core/ui/report.js" "鋼筋混凝土/shared/report.js" "結構工具箱/tools/calculation-book-content-boundary.json" "結構工具箱/tools/calculation-book-content-boundary.js" "結構工具箱/tools/formal-tools.manifest.json" "結構工具箱/tools/formal-tools.contract.test.js" "結構工具箱/tools/report-disclosure.contract.test.js"
git add -- "docs/adr/0003-calculation-book-content-boundary.md" "TOOL_REPORT_GUIDE.md" "TOOL_BOUNDARIES.md" "CONTEXT.md" "README.md" "STAGING_GROUPS.md"
```

`鋼構工具/steel-traceability.catalog.json` 是鋼構條文語意追蹤 catalog，需和 `steel-traceability.contract.test.js`、`audit-tool.ps1`、鋼構 regression / browser runner 與 dashboard maturity matrix 變更一起 staging。

建議提交訊息：

```text
Strengthen formal steel tool pages and reports
```

## G. 錨栓原始碼與部署鏡像前置

`螺栓檢討/bolt-review-tool/` 是 `/anchor/` 部署鏡像的來源。這包提交原始碼；提交 `/anchor/` hash 資產前，先跑 `sync-anchor-deployment.ps1` 並用 B 包提交部署鏡像。新增規範路線、報告段落、工作區備份 schema / 重現指紋、workbook/docx 邊界、正式產物留存或人工複核邊界時，需同步提交 `anchor-traceability.catalog.json`、package 內 `anchorTraceabilityCatalog.test.ts`、`backup.ts` / `backup.test.ts`、`useProjectLibrary.ts`、`attachmentReadiness.ts`、`reportDocumentState.ts`、對應報告 / 附件狀態測試、`tests/reportArtifacts.test.ts`，以及平台層 `螺栓檢討/anchor-traceability.contract.test.js`、`螺栓檢討/anchor-report.contract.test.js` 與 rendered delivery evidence 治理檔。只有 `src/` 或部署來源改動才需同步 `/anchor/` 鏡像；獨立 `tests/` 治理檔不屬於部署 fingerprint。

```powershell
git add -- "螺栓檢討/bolt-review-tool/README.md" "螺栓檢討/bolt-review-tool/package.json" "螺栓檢討/bolt-review-tool/package-lock.json" "螺栓檢討/bolt-review-tool/vite.config.ts"
git add -- "螺栓檢討/bolt-review-tool/src/App.css" "螺栓檢討/bolt-review-tool/src/App.tsx" "螺栓檢討/bolt-review-tool/src/backup.ts" "螺栓檢討/bolt-review-tool/src/backup.test.ts" "螺栓檢討/bolt-review-tool/src/confirmDialog.ts" "螺栓檢討/bolt-review-tool/src/defaults.ts" "螺栓檢討/bolt-review-tool/src/defaults.test.ts" "螺栓檢討/bolt-review-tool/src/useAuditTrail.ts" "螺栓檢討/bolt-review-tool/src/useProjectLibrary.ts" "螺栓檢討/bolt-review-tool/src/useWorkspaceHydration.ts"
git add -- "螺栓檢討/bolt-review-tool/src/AttachmentReadinessPanel.tsx" "螺栓檢討/bolt-review-tool/src/attachmentReadiness.ts" "螺栓檢討/bolt-review-tool/src/attachmentReadiness.test.ts" "螺栓檢討/bolt-review-tool/src/reportDocumentState.ts" "螺栓檢討/bolt-review-tool/src/reportDocumentState.test.ts" "螺栓檢討/bolt-review-tool/src/reportHtmlSeal.ts" "螺栓檢討/bolt-review-tool/src/reportExport.ts" "螺栓檢討/bolt-review-tool/src/reportExport.test.ts" "螺栓檢討/bolt-review-tool/src/reportDocx.ts" "螺栓檢討/bolt-review-tool/src/reportDocx.test.ts" "螺栓檢討/bolt-review-tool/src/reportWorkbook.ts" "螺栓檢討/bolt-review-tool/src/reportWorkbook.test.ts" "螺栓檢討/bolt-review-tool/src/useReportExports.ts"
git add -- "螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json" "螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts" "螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts" "螺栓檢討/anchor-traceability.contract.test.js" "螺栓檢討/anchor-report.contract.test.js"
git add -- "結構工具箱/tools/anchor-html-seal-verifier.js" "結構工具箱/tools/rendered-delivery-evidence.contract.test.js" "結構工具箱/tools/release-readiness.contract.test.js" "結構工具箱/tools/tool-maturity-matrix.js" "結構工具箱/tools/pages-live-smoke.js"
```

建議提交訊息：

```text
Replace anchor dialogs with in-app confirmations
```

## 正式附件包進度觀測

調整 `attachment-package-build.js` 或 `attachment-package-manager-worker.js` 的建立階段事件時，需連同組包單元測試、管理器契約與三份治理文件 staging。階段事件只屬旁路觀測，任何執行中 IPC 寫入錯誤都不得中止或改寫核心結果；畫面可保留最後已驗證階段，但已成功發布的附件包不得因後續進度通知失敗而誤報失敗。測試必須至少涵蓋發布完成後的 `complete` 通知失敗。

最終結果 IPC 必須在任何核心動作前排他保留，保留失敗時不得進入 check / build / verify；寫入須沿用已保留的檔案描述元並 fsync，避免完成後才遇到檔名競態。契約測試需用既有占用檔與延遲核心證明拒絕發生在動作前且不覆寫原檔。GUI 遇到缺漏或損壞結果時不得宣稱建立失敗，也不得直接授權重建；必須標成結果待確認，保留明確預定輸出並要求先執行唯讀附件包驗證。

套用結果前須再比對預期 action、封閉狀態與實際退出碼 0 / 1 / 2 / 3；任何錯配均拒絕，避免排他保留失敗時把預存內容誤認為本次 check / build / verify 結果。

每次來源檢查 ready 時，唯讀 worker 必須為空白輸出欄位產生含時間與隨機識別碼的唯一預定路徑，且不得建立該資料夾；使用者既有輸出不得覆寫，正式 build 沒有確切輸出時必須拒絕啟動，核心仍須阻擋既有位置。結果待確認復原入口只能在該精確預定輸出仍為實體資料夾時顯示，必須把同一路徑交給既有 `Start-ReadOnlyOperation -Action verify`，並沿用可取消、逾時、結果封套與暫存清理。測試需固定它不含 build、建立、修改或核可路由；不得掃描或猜選最新資料夾。

跨重啟復原收據必須在 build worker 啟動前以受管隨機檔名排他建立於目前使用者系統暫存區，固定 schema、request ID、24 小時期限、絕對來源／輸出、管理器與 worker PID／啟動時間及受管 IPC 路徑，worker 啟動後以同目錄原子替換更新。可信 build 結果或 `ready / review / blocked` 恢復 verify 結論後立即清除；交接異常且精確輸出存在時才保留。啟動掃描須拒絕非受管檔名、錯誤 schema、相對路徑、逾期或仍有原程序運作的收據；多筆只能顯示本機唯讀單選總覽，須列狀態、建立時間、有效至／剩餘期限與精確輸出路徑，依期限由近到遠穩定排序。期限超過 2 小時採一般文字色，2 小時內以深橙色及明文提示，30 分鐘內以紅色及明文提示；畫面說明與無障礙描述均須陳述分級，不得只靠顏色。初始不選取、定時刷新期限且不得猜選；刷新發現已選項目到期、輸出消失或失效時，必須清除選取及目前儲存格、停用三個動作，且失效列被再次點選時也不得保留選取。可見狀態與 assertive live region 必須通知狀態；未到期但輸出暫時不存在時須持續重查並通知恢復。到期收據與受管暫存檔須立即清除；全部候選均已到期時停止計時、將取消動作改為關閉並顯示無可驗證項目。明確選取仍有效且存在的輸出後，只可另以 Windows 檔案總管開啟該精確資料夾供人工查看；預覽不得呼叫 verifier、修改附件包或提升權限。啟動驗證前須重讀選定收據，重新確認管理資格、期限與精確路徑；取消或關閉清單、不可信封套或 `error` 驗證不得刪除任何未取得可信結論且尚未到期的收據。動態 WinForms smoke 必須證明三種期限分級、失效列拒選、選取失效後自動清除、暫時不可用持續重查、到期清理、全數到期停止計時與無障礙通知，且只對明確選定的一筆形成精確唯讀預覽及驗證、保留未選項目、不啟動 build，並完整清理測試檔案。

多筆復原總覽新增或調整精確路徑複製時，說明列與複製按鈕必須直接顯示 `Ctrl+C` 提示，並維持初始停用、明確單選、動作當下重查未逾期與資料夾存在性；一般模式只可將該精確路徑寫入 Windows 剪貼簿。清單 `Ctrl+C` 必須停用 DataGridView 原生整列複製並只轉交同一受控按鈕路由，無有效選取時仍須攔截且零寫入；動態 smoke 必須證明提示實際可見、攔截實際剪貼簿寫入、快捷鍵事件已處理，且不啟動 verifier、build、修改或核可。

單筆待確認狀態新增或調整精確路徑快捷鍵時，按鈕必須直接顯示 `Ctrl+C`，且只有焦點位於該按鈕時才可攔截快捷鍵並轉交同一點擊路由；其他欄位必須保留原生複製行為。動態 smoke 必須同時證明已聚焦時事件受控處理、未聚焦時不誤觸、一般剪貼簿寫入遭攔截，以及收據、精確輸出與權限邊界仍被重新核對。

單筆復原收據在主畫面待確認狀態卡提供精確路徑複製時，必須與唯讀驗證分成獨立按鈕，點擊當下重讀受管收據並核對期限、精確輸出與資料夾存在性；無收據的同次交接僅可使用已鎖定且仍存在的預定輸出。失效時須清除復原動作並失敗封閉。動態 smoke 必須先證明單筆複製不寫剪貼簿，再還原多筆未選總覽並完成原有取消與驗證流程；複製處理器不得含 verify、build、修改或核可路由。

單筆短期復原收據必須在主畫面狀態卡顯示本機有效至與剩餘時間，以 30 秒 UI timer 重讀精確收據並重查輸出資料夾；超過 2 小時採一般文字色，2 小時內以深橙色及明文提示，30 分鐘內以紅色及明文提示，無障礙說明亦須陳述急迫程度，不得只靠顏色。到期時須移除收據並自動隱藏、停用複製與唯讀驗證，提前失效或輸出不存在時亦須失敗封閉。無收據的同次交接不得顯示虛構期限或啟動計時器。動態 smoke 必須證明一般、2 小時及 30 分鐘三種分級，再以獨立短期收據模擬到期，證明兩個動作自動停用、計時器停止、收據移除且原多筆流程仍可還原；到期刷新不得含 copy、verify、build、修改或核可路由。

## 首頁正式放行日期來源

調整首頁狀態或 release 快照時，需一併 staging `結構工具箱/assets/home/home.js`、`toolbox-entrypoints.contract.test.js` 與三份治理文件。`HOME_TOOL_UPDATES` 不得保存人工 fallback 正式放行日；執行期只可接受 passing、非 quick、兩個 force 旗標成立、來源 commit 可辨識且乾淨的 tracked preflight snapshot。契約須固定未載入提示與正式快照導入路徑，避免 release 狀態提交跨日後產生首頁落後日期。

正式 release 新鮮度不得沿用四類一般巡檢的最新時間。dashboard 只能以 tracked 正式 preflight 快照計算 7 日／30 日提醒，並透過 schema v3 `pages-deployment.json` 核對 carrier commit、Actions run、release run 與 tested source；年齡屬提示，身分對齊才是公開部署可信度的必要條件。

## 下次提交前共同驗證

```powershell
.\preflight-tools.ps1 -Quick
.\preflight-tools.ps1
.\run-pages-artifact-smoke.ps1
.\push-pages-release.ps1 -VerifyOnly
git diff --check
git status --short --untracked-files=normal
```
### 獨立工程基準

- `結構工具箱/tools/independent-engineering-benchmarks.catalog.json`
- `結構工具箱/tools/independent-engineering-benchmarks.js`
- `結構工具箱/tools/independent-engineering-benchmarks.test.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-column-pm.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-beam-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-shear-wall-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-wall-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-retrofit-section.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-foundation.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-pile.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-beam-asd.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-column-asd.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-plate-connection.js`
- `結構工具箱/tools/independent-engineering-adapters/steel-formal.js`
- `結構工具箱/tools/independent-engineering-adapters/rc-slab-strength.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-force-mwfrs.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-solid-table210.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-cc.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-parapet.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-open-roof.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-frame.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-lattice-tower.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-object-tower.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-fence-sign.js`
- `結構工具箱/tools/independent-engineering-adapters/wind-sign-pole.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-force-static.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-appendage.js`
- `結構工具箱/tools/independent-engineering-adapters/seismic-misc.js`
- `結構工具箱/tools/independent-engineering-adapters/anchor-cast-in.js`
- `鋼構工具/core/materials/steel.js`、`steel-beam-formal.html`、`steel-beam-formal.js`、`steel-column-formal.html`、`steel-column-formal.js`、`steel-formal.regression-test.js`
- `結構工具箱/core/loads/wind.js`、`結構工具箱/tools/風力/wind-force.html`、`結構工具箱/tools/風力/wind-cc.html`、`結構工具箱/tools/風力/wind-sign-pole.html`、`結構工具箱/tests/wind.test.js`、`結構工具箱/tools/formal-tools.contract.test.js`
- `結構工具箱/core/loads/seismic.js`、`結構工具箱/tools/地震力/seismic-force.html`、`結構工具箱/tools/地震力/seismic-misc.html`、`結構工具箱/tests/seismic.test.js`
- `螺栓檢討/bolt-review-tool/src/calc.ts`、`calc.test.ts`、`defaults.ts`、`backup.ts`、`螺栓檢討/anchor-report.contract.test.js`
- `鋼筋混凝土/shared/foundation-isolated.js`、`foundation-isolated.test.js`、`foundation-pile.js`、`foundation-pile.test.js`、`flexure.js`
- `鋼筋混凝土/shared/slab-evaluator.js`、`slab-evaluator.test.js`、`鋼筋混凝土/tools/slab.html`、`slab-regression.test.js`、`test-slab.ps1`
- `鋼筋混凝土/shared/wall.js`、`pmsection.js`、`wall-inplane-evaluator.js`、`鋼筋混凝土/tools/wall.html`、`wall-regression.test.js`、`test-wall.ps1`
- `RC補強斷面性質.html`、`鋼筋混凝土/tools/retrofit-report-visual.test.js`、`retrofit-report-visual.contract.test.js`、`test-retrofit-report.ps1`
- `鋼筋混凝土/tools/foundation.html`、`foundation-regression.test.js`、`foundation-regression-cases.json`、`single-pile-designer.html`、`single-pile-regression.test.js`、`test-foundation.ps1`
- `石材固定/石材計算書產生器_規範版V2.html`、`石材固定/js/constants.spec.js`、`石材固定/js/calculator.spec.js`、`石材固定/tests/visual_decoration_test.py`、`石材固定/tests/ci_summary.py`、`石材固定/tests/run_all_tests.bat`、`石材固定/tests/README.md`、`結構工具箱/tools/independent-engineering-adapters/stone-fixing.js`
- `結構工具箱/tools/tool-maturity-matrix.js`
- `preflight-tools.ps1`
- `結構工具箱/tools/release-readiness.contract.test.js`
- `README.md`、`TOOL_BOUNDARIES.md`、`TOOL_REPORT_GUIDE.md`

此組需一起提交，避免只有測試案例卻沒有 production core、preflight、成熟度與報告邊界。完整通過標示 31 / 31 個正式入口；golden case 或同核心結果鏈不等同獨立工程驗證，也不得算入獨立覆蓋。第十九條路由為正式區域風壓 C&C，獨立核對 18 m 高度界線、部分封閉內壓高度及屋面角隅負壓提前收斂；第二十條路由為正式女兒牆風壓，獨立核對 MWFRS 式 2.3、圖 3.4 與圖 3.5 三條設計路線；第二十一條路由為正式開放式屋頂風壓，獨立核對單斜／雙斜屋頂、有／無阻擋、小／中／大有效面積、坡度直接取值／內插及 10° 高度切換；第二十二條路由為正式中空式／格子式風力，獨立核對表 2.11 圓形低／高 D√q(z) 與平邊構材三條路線、三種實體率帶、等效寬度及底部作用；第二十三條路由為正式格構式高塔風力，獨立核對表 2.15 四段基本係數、構材／斜風向修正與完整分段剪力／彎矩力流；第二十四條路由為煙囪／水塔風力，獨立核對表 2.12 斷面路線、h/D 邊界、圓形 D√q(z) 分流、形狀修正、頂部附加物與完整分段力流；第二十五條路由為圍牆／標示物風力，獨立核對表 2.10 地面與高架雙路線、低高界夾制、內插、專案 C_f 採用值、實體率修正及底部作用；第二十六條路由為獨立式招牌／燈桿風力，獨立核對表 2.10 面板、表 2.14 圓管門檻、表 2.13 角柱四個細長比區間、支柱分段力流及組合底部作用；第二十七條路由為 RC 一般牆，獨立核對承重／非承重／地下室／結構牆厚度、Wall Pier、完整 P–M、簡式失敗關閉、αc 內插、配筋與地下室側壓雙模型；第二十八條路由為 RC 補強斷面，獨立核對梁底貼 CFRP、CFRP／鋼板 U 型包覆、脫層、轉換斷面、剪力上限、柱圍束軸壓與 P–M；第二十九條路由為鋼構正式主工具，獨立核對主工具連接板、螺栓拉力構件、雙側縱向填角銲與 ASD 全滲透開槽銲；第三十條路由為覆工板系統，獨立核對一般載重與長柱／未側撐重載兩案的板面、大小梁、共構柱、握裹與樁基完整受力鏈；第三十一條路由為石材固定，獨立核對背扣／插銷、風震需求、有效固定點、錨栓容量與折減、角鋼、板材局部、層間變位與熱伸縮。既定 P0／P1 基準路由已完成；分析摘要身分的 `/seismic-dynamic` 不得計入正式附件入口覆蓋。

開挖證據鏈組包：調整 ERH／RVR／SEV／SCV／RTB 原生分類時，必須同批 staging `attachment-package-check.js`、檢查／組包／事後驗證測試、附件包管理器契約、開挖 traceability catalog／contract、SCV 說明、README 與 `TOOL_BOUNDARIES.md`。測試須證明完整鏈可進 v3 包的內部追溯區並通過事後複驗，缺檔／雜湊／指紋／採用狀態矛盾 blocked，孤立或重複引用 review，且治理 JSON 不得進正式附件區。組包關係檢查不冒充 Python 受控內容或 Ed25519 簽章驗證。

Schema v25 正式 Excel 雙封印：錨栓 `reportWorkbookSeal.ts`、獨立 `結構工具箱/tools/xlsx-seal-verifier.js` 與 `結構工具箱/tools/xlsx-seal-verifier.test.js`、附件組包檢查、release aggregate、成熟度矩陣、首頁完成數、Pages 私有邊界、錨栓部署鏡像與四份治理文件必須同批 staging。測試須分別證明內容／公式／快取結果竄改與文件狀態／核可時間／計算指紋／內容 SHA 竄改失敗關閉；公開資料不得含封印值、工作表內容或竄改樣本。
