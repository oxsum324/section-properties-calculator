$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'column-regression.test.js'
$visualTestFile = Join-Path $root 'column-report-visual.test.js'
$pmSectionTest = Join-Path (Split-Path -Parent $root) 'shared\pmsection.test.js'
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

Write-Host "`n== Shared PM section unit tests ==" -ForegroundColor Cyan
node $pmSectionTest
if ($LASTEXITCODE -ne 0) {
  throw "shared PM section tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Column regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "column regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Column report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "column report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nColumn checks completed successfully." -ForegroundColor Green
