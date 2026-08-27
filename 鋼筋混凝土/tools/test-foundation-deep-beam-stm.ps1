$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sharedRoot = Join-Path (Split-Path -Parent $root) 'shared'
$unitTest = Join-Path $sharedRoot 'foundation-deep-beam-stm.test.js'
$browserTest = Join-Path $root 'foundation-deep-beam-stm-regression.test.js'
$ensureDeps = Join-Path $root 'ensure-playwright-deps.ps1'
. $ensureDeps -Root $root -PreferredDirName '.foundation-testdeps'

Write-Host "`n== Foundation deep-member STM unit tests ==" -ForegroundColor Cyan
node $unitTest
if ($LASTEXITCODE -ne 0) { throw "foundation deep-member STM unit tests failed with exit code $LASTEXITCODE" }

Write-Host "`n== Foundation deep-member STM browser and PDF regression ==" -ForegroundColor Cyan
node $browserTest
if ($LASTEXITCODE -ne 0) { throw "foundation deep-member STM browser regression failed with exit code $LASTEXITCODE" }

Write-Host "`nFoundation deep-member STM checks completed successfully." -ForegroundColor Green
