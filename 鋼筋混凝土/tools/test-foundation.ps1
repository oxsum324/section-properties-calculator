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
$jointReactionLoadAdapterTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-load-adapter.test.js'
$jointReactionLoadAdapterFixturesTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-load-adapter-fixtures.test.js'
$jointReactionFixtureSanitizerCoreTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-fixture-sanitizer-core.test.js'
$jointReactionFixtureSanitizerTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-fixture-sanitizer.test.js'
$jointReactionFixturePromotionGateTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-fixture-promotion-gate.test.js'
$jointReactionObservedIntakeTestFile = Join-Path (Split-Path -Parent $root) 'shared\joint-reaction-observed-intake.test.js'
$foundationDeepStmUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\foundation-deep-beam-stm.test.js'
$foundationDeepStmBrowserTestFile = Join-Path $root 'foundation-deep-beam-stm-regression.test.js'
$pileCap3dStmUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-cap-3d-stm.test.js'
$pileCap3dStmBridgeUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-cap-3d-stm-bridge.test.js'
$pileCapLoadCombinationsUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-cap-load-combinations.test.js'
$pileCap3dStmEnvelopeUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\pile-cap-3d-stm-envelope.test.js'
$pileCap3dStmBrowserTestFile = Join-Path $root 'pile-cap-3d-stm-regression.test.js'
$pileCap3dStmBridgeBrowserTestFile = Join-Path $root 'pile-cap-3d-stm-bridge-regression.test.js'
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

Write-Host "`n== ETABS/SAP2000 joint reaction load adapter unit tests ==" -ForegroundColor Cyan
node $jointReactionLoadAdapterTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction load adapter unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== ETABS/SAP2000 joint reaction compatibility fixture tests ==" -ForegroundColor Cyan
node $jointReactionLoadAdapterFixturesTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction compatibility fixture tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Joint reaction browser/Node sanitizer core tests ==" -ForegroundColor Cyan
node $jointReactionFixtureSanitizerCoreTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction browser/Node sanitizer core tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Joint reaction fixture sanitizer privacy tests ==" -ForegroundColor Cyan
node $jointReactionFixtureSanitizerTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction fixture sanitizer privacy tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Joint reaction observed fixture promotion gate tests ==" -ForegroundColor Cyan
node $jointReactionFixturePromotionGateTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction observed fixture promotion gate tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Joint reaction observed intake workflow tests ==" -ForegroundColor Cyan
node $jointReactionObservedIntakeTestFile
if ($LASTEXITCODE -ne 0) {
  throw "joint reaction observed intake workflow tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Foundation deep-member STM unit tests ==" -ForegroundColor Cyan
node $foundationDeepStmUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation deep-member STM unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile-cap 3D STM unit tests ==" -ForegroundColor Cyan
node $pileCap3dStmUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile-cap 3D STM unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Foundation to pile-cap 3D STM bridge unit tests ==" -ForegroundColor Cyan
node $pileCap3dStmBridgeUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation to pile-cap 3D STM bridge unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile-cap LRFD load-component adapter unit tests ==" -ForegroundColor Cyan
node $pileCapLoadCombinationsUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile-cap LRFD load-component adapter unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile-cap 3D STM multi-load envelope unit tests ==" -ForegroundColor Cyan
node $pileCap3dStmEnvelopeUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile-cap 3D STM multi-load envelope unit tests failed with exit code $LASTEXITCODE"
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

Write-Host "`n== Foundation deep-member STM browser and PDF regression ==" -ForegroundColor Cyan
node $foundationDeepStmBrowserTestFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation deep-member STM browser regression failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Pile-cap 3D STM browser and PDF regression ==" -ForegroundColor Cyan
node $pileCap3dStmBrowserTestFile
if ($LASTEXITCODE -ne 0) {
  throw "pile-cap 3D STM browser regression failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Foundation to pile-cap 3D STM one-click bridge regression ==" -ForegroundColor Cyan
node $pileCap3dStmBridgeBrowserTestFile
if ($LASTEXITCODE -ne 0) {
  throw "foundation to pile-cap 3D STM bridge browser regression failed with exit code $LASTEXITCODE"
}

Write-Host "`nFoundation checks completed successfully." -ForegroundColor Green
