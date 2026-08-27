$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sharedRoot = Join-Path (Split-Path -Parent $root) 'shared'
$unitTest = Join-Path $sharedRoot 'deep-beam-stm.test.js'
$browserTest = Join-Path $root 'deep-beam-stm-regression.test.js'
$ensureDeps = Join-Path $root 'ensure-playwright-deps.ps1'
. $ensureDeps -Root $root -PreferredDirName '.beam-testdeps'

Write-Host "`n== Deep beam STM unit tests ==" -ForegroundColor Cyan
node $unitTest
if ($LASTEXITCODE -ne 0) { throw "deep beam STM unit tests failed with exit code $LASTEXITCODE" }

Write-Host "`n== Deep beam STM browser and PDF regression ==" -ForegroundColor Cyan
node $browserTest
if ($LASTEXITCODE -ne 0) { throw "deep beam STM browser regression failed with exit code $LASTEXITCODE" }

Write-Host "`nDeep beam STM checks completed successfully." -ForegroundColor Green
