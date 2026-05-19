$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'continuous-beam-regression.test.js'

Write-Host '== Continuous beam regression tests ==' -ForegroundColor Cyan
node $testFile

Write-Host "`nContinuous beam regression checks completed successfully." -ForegroundColor Green
