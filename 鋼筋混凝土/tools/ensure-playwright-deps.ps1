param(
  [Parameter(Mandatory = $true)]
  [string]$Root,

  [Parameter(Mandatory = $true)]
  [string]$PreferredDirName
)

$ErrorActionPreference = 'Stop'

$dependencyDirNames = @(
  '.beam-testdeps',
  '.column-testdeps',
  '.wall-testdeps',
  '.foundation-testdeps',
  '.slab-testdeps',
  '.single-pile-testdeps',
  '.rc-index-testdeps',
  '.shear-wall-report-testdeps'
)

if (-not ($dependencyDirNames -contains $PreferredDirName)) {
  throw "Unknown Playwright dependency directory: $PreferredDirName"
}

$depRoot = Join-Path $Root $PreferredDirName
$fallbackDeps = @($depRoot)
$fallbackDeps += $dependencyDirNames |
  Where-Object { $_ -ne $PreferredDirName } |
  ForEach-Object { Join-Path $Root $_ }

Write-Host '== Ensure Playwright dependency ==' -ForegroundColor Cyan
$playwrightRoot = $fallbackDeps |
  Where-Object { Test-Path (Join-Path $_ 'node_modules\playwright') } |
  Select-Object -First 1

if (-not $playwrightRoot) {
  if (-not (Test-Path $depRoot)) {
    New-Item -ItemType Directory -Path $depRoot | Out-Null
  }

  npm init -y --prefix $depRoot | Out-Null
  npm install --prefix $depRoot playwright --silent
  $playwrightRoot = $depRoot
}

$env:NODE_PATH = Join-Path $playwrightRoot 'node_modules'
Write-Host "Using Playwright deps: $playwrightRoot" -ForegroundColor DarkGray
