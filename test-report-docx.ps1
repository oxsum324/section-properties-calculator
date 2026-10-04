param(
  [string]$Tools = '',
  [string]$BaseUrl = '',
  [switch]$List
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptArgs = @()
if ($List) { $scriptArgs += '--list' }
if ($Tools) { $scriptArgs += @('--only', $Tools) }
if ($BaseUrl) { $scriptArgs += @('--base-url', $BaseUrl) }
if (-not $List) {
  $depsRoot = Join-Path $repoRoot '鋼筋混凝土/tools'
  . (Join-Path $depsRoot 'ensure-playwright-deps.ps1') -Root $depsRoot -PreferredDirName '.column-testdeps'
  foreach ($dependency in @('jszip', 'jsdom')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "螺栓檢討/bolt-review-tool/node_modules/$dependency"))) {
      throw "缺少既有 anchor 測試依賴 $dependency；請先完成該專案依賴安裝。"
    }
  }
}
node (Join-Path $repoRoot 'report-docx.browser.test.js') @scriptArgs
if ($LASTEXITCODE -ne 0) { throw "Report DOCX browser checks failed with exit code $LASTEXITCODE" }
if (-not $List) {
  node (Join-Path $repoRoot 'report-format-parity.test.js')
  if ($LASTEXITCODE -ne 0) { throw "Report format parity checks failed with exit code $LASTEXITCODE" }
}
