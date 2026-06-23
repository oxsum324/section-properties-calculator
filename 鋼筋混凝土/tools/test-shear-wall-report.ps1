$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'shear-wall-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.shear-wall-report-testdeps'

Write-Host "`n== Shear wall report visual smoke ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "shear wall report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nShear wall report visual checks completed successfully." -ForegroundColor Green
