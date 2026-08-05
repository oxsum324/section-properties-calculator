$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'foundation-regression.test.js'
$visualTestFile = Join-Path $root 'foundation-report-visual.test.js'
$isolatedStrengthTestFile = Join-Path (Split-Path -Parent $root) 'shared\foundation-isolated.test.js'
$pileStrengthTestFile = Join-Path (Split-Path -Parent $root) 'shared\foundation-pile.test.js'
$baseDemandTestFile = Join-Path (Split-Path -Parent $root) 'shared\retaining-base-demand.test.js'
$pileGroupLateralTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-group-lateral.test.js'
$pilePyBridgeTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-py-result-bridge.test.js'
$pilePyTableAdapterTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-py-table-adapter.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.foundation-testdeps'

Write-Host "`n== Isolated footing strength core unit tests ==" -ForegroundColor Cyan
node $isolatedStrengthTestFile
if ($LASTEXITCODE -ne 0) {
  throw "isolated footing strength core unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile axial, group and pile-cap core unit tests ==" -ForegroundColor Cyan
node $pileStrengthTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile axial, group and pile-cap core unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Retaining wall base demand unit tests ==" -ForegroundColor Cyan
node $baseDemandTestFile
if ($LASTEXITCODE -ne 0) {
  throw "retaining wall base demand unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile group lateral distribution unit tests ==" -ForegroundColor Cyan
node $pileGroupLateralTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile group lateral distribution unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile p-y result bridge unit tests ==" -ForegroundColor Cyan
node $pilePyBridgeTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile p-y result bridge unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile p-y table adapter unit tests ==" -ForegroundColor Cyan
node $pilePyTableAdapterTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile p-y table adapter unit tests failed with exit code $LASTEXITCODE"
}

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
