$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'single-pile-regression.test.js'
$visualTestFile = Join-Path $root 'single-pile-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.single-pile-testdeps'

Write-Host "`n== Single pile regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "single pile regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Single pile report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "single pile report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nSingle pile checks completed successfully." -ForegroundColor Green
