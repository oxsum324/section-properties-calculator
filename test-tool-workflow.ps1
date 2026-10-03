param(
  [string]$Tools = '',
  [ValidateSet('', 'rc', 'steel', 'wind', 'seismic', 'analysis', 'native')][string]$Group = '',
  [string]$Widths = '1280,375',
  [string]$BaseUrl = '',
  [switch]$List,
  [switch]$Menu
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptArgs = @()
if ($List) { $scriptArgs += '--list' }
if ($Menu) { $scriptArgs += '--menu' }
if ($Tools) { $scriptArgs += @('--only', $Tools) }
if ($Group) { $scriptArgs += @('--group', $Group) }
if ($BaseUrl) { $scriptArgs += @('--base-url', $BaseUrl) }
$scriptArgs += @('--widths', $Widths)
if (-not $List) {
  $depsRoot = Join-Path $repoRoot '鋼筋混凝土/tools'
  . (Join-Path $depsRoot 'ensure-playwright-deps.ps1') -Root $depsRoot -PreferredDirName '.column-testdeps'
}
node (Join-Path $repoRoot 'tool-workflow.browser.test.js') @scriptArgs
if ($LASTEXITCODE -ne 0) { throw "Tool workflow checks failed with exit code $LASTEXITCODE" }
