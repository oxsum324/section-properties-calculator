$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'column-regression.test.js'
$depRoot = Join-Path $root '.column-testdeps'

if (!(Test-Path $depRoot)) {
  New-Item -ItemType Directory -Path $depRoot | Out-Null
}

Write-Host '== Ensure Playwright dependency ==' -ForegroundColor Cyan
if (!(Test-Path (Join-Path $depRoot 'node_modules\\playwright'))) {
  npm init -y --prefix $depRoot | Out-Null
  npm install --prefix $depRoot playwright --silent
}

$env:NODE_PATH = Join-Path $depRoot 'node_modules'

Write-Host "`n== Column regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "column regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`nColumn checks completed successfully." -ForegroundColor Green
