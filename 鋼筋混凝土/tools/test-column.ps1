$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'column-regression.test.js'
$visualTestFile = Join-Path $root 'column-report-visual.test.js'
$pmSectionTest = Join-Path (Split-Path -Parent $root) 'shared\pmsection.test.js'
$columnEvaluatorTest = Join-Path (Split-Path -Parent $root) 'shared\column-evaluator.test.js'
$columnRebarDesignerTest = Join-Path (Split-Path -Parent $root) 'shared\column-rebar-designer.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.column-testdeps'

Write-Host "`n== Shared PM section unit tests ==" -ForegroundColor Cyan
node $pmSectionTest
if ($LASTEXITCODE -ne 0) {
  throw "shared PM section tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Shared column evaluator unit tests ==" -ForegroundColor Cyan
node $columnEvaluatorTest
if ($LASTEXITCODE -ne 0) {
  throw "shared column evaluator tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Shared column rebar designer unit tests ==" -ForegroundColor Cyan
node $columnRebarDesignerTest
if ($LASTEXITCODE -ne 0) {
  throw "shared column rebar designer tests failed with exit code $LASTEXITCODE"
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
