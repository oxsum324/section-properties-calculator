param(
  [ValidateSet('all', 'load', 'fmt', 'deep')][string]$Phase = 'all',
  [string]$Tools = '',
  [string]$BaselineRef = 'INDEX',
  [string]$BaseUrl = '',
  [switch]$List
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptArgs = @('--phase', $Phase, '--baseline-ref', $BaselineRef)
if ($List) { $scriptArgs += '--list' }
if ($Tools) { $scriptArgs += @('--only', $Tools) }
if ($BaseUrl) { $scriptArgs += @('--base-url', $BaseUrl) }
if (-not $List) {
  $depsRoot = Join-Path $repoRoot '鋼筋混凝土/tools'
  . (Join-Path $depsRoot 'ensure-playwright-deps.ps1') -Root $depsRoot -PreferredDirName '.column-testdeps'
}
node (Join-Path $repoRoot 'report-utils.browser.test.js') @scriptArgs
if ($LASTEXITCODE -ne 0) { throw "Report utilities browser checks failed with exit code $LASTEXITCODE" }
