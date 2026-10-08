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

  # npm >= 7 ignores --prefix for `npm init` and writes package.json to the
  # current directory (often the repo root), so seed the manifest directly.
  $depPackageJson = Join-Path $depRoot 'package.json'
  if (-not (Test-Path -LiteralPath $depPackageJson -PathType Leaf)) {
    [System.IO.File]::WriteAllText(
      $depPackageJson,
      "{`n  `"name`": `"playwright-testdeps`",`n  `"private`": true`n}`n",
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  Push-Location -LiteralPath $depRoot
  try {
    npm install --prefix $depRoot playwright --silent
    if ($LASTEXITCODE -ne 0) {
      throw "npm install playwright failed in $depRoot with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
  $playwrightRoot = $depRoot
}

$env:NODE_PATH = Join-Path $playwrightRoot 'node_modules'
Write-Host "Using Playwright deps: $playwrightRoot" -ForegroundColor DarkGray
