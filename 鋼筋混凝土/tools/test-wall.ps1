$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$evaluatorTestFile = Join-Path (Split-Path -Parent $root) 'shared\wall-inplane-evaluator.test.js'
$regressionTestFile = Join-Path $root 'wall-regression.test.js'
$visualTestFile = Join-Path $root 'wall-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.wall-testdeps'

Write-Host "`n== Wall in-plane evaluator tests ==" -ForegroundColor Cyan
node $evaluatorTestFile
if ($LASTEXITCODE -ne 0) {
  throw "wall in-plane evaluator tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Wall regression tests ==" -ForegroundColor Cyan
node $regressionTestFile
if ($LASTEXITCODE -ne 0) {
  throw "wall regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Wall report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "wall report visual smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nWall checks completed successfully." -ForegroundColor Green
