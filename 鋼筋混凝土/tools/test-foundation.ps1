$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'foundation-regression.test.js'
$visualTestFile = Join-Path $root 'foundation-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.foundation-testdeps'

Write-Host "`n== Foundation regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Foundation report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nFoundation checks completed successfully." -ForegroundColor Green
