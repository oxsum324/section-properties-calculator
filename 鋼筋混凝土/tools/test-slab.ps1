$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'slab-regression.test.js'
$visualTestFile = Join-Path $root 'slab-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.slab-testdeps'

Write-Host "`n== Slab regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "slab regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Slab report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "slab report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nSlab checks completed successfully." -ForegroundColor Green
