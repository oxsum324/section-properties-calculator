$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ensureDeps = Join-Path $toolsDir 'ensure-playwright-deps.ps1'
. $ensureDeps -Root $toolsDir -PreferredDirName '.foundation-testdeps'

Write-Host "`n== Pile-cap 3D STM unit tests =="
node "$toolsDir\..\shared\pile-cap-3d-stm.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Foundation to pile-cap 3D STM bridge unit tests =="
node "$toolsDir\..\shared\pile-cap-3d-stm-bridge.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Pile-cap LRFD load-component adapter unit tests =="
node "$toolsDir\..\shared\pile-cap-load-combinations.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== ETABS/SAP2000 joint reaction load adapter unit tests =="
node "$toolsDir\..\shared\joint-reaction-load-adapter.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== ETABS/SAP2000 joint reaction compatibility fixture tests =="
node "$toolsDir\..\shared\joint-reaction-load-adapter-fixtures.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Joint reaction browser/Node sanitizer core tests =="
node "$toolsDir\..\shared\joint-reaction-fixture-sanitizer-core.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Joint reaction fixture sanitizer privacy tests =="
node "$toolsDir\..\shared\joint-reaction-fixture-sanitizer.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Joint reaction observed fixture promotion gate tests =="
node "$toolsDir\..\shared\joint-reaction-fixture-promotion-gate.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Joint reaction observed intake workflow tests =="
node "$toolsDir\..\shared\joint-reaction-observed-intake.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Pile-cap 3D STM multi-load envelope unit tests =="
node "$toolsDir\..\shared\pile-cap-3d-stm-envelope.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Pile-cap 3D STM browser and PDF regression =="
node "$toolsDir\pile-cap-3d-stm-regression.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Foundation to pile-cap 3D STM one-click bridge regression =="
node "$toolsDir\pile-cap-3d-stm-bridge-regression.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nPile-cap 3D STM checks completed successfully."
