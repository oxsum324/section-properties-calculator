$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'continuous-beam-regression.test.js'
$browserTestFile = Join-Path $root 'continuous-beam-report-visual.test.js'
$playwrightDepsScript = Get-ChildItem -LiteralPath $root -Directory |
  ForEach-Object { Join-Path $_.FullName 'tools\ensure-playwright-deps.ps1' } |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $playwrightDepsScript) {
  throw 'Unable to locate ensure-playwright-deps.ps1'
}
$playwrightRoot = Split-Path -Parent $playwrightDepsScript
. $playwrightDepsScript -Root $playwrightRoot -PreferredDirName '.beam-testdeps'

Write-Host '== Continuous beam regression tests ==' -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "Continuous beam regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Continuous beam report TXT browser smoke ==" -ForegroundColor Cyan
node $browserTestFile
if ($LASTEXITCODE -ne 0) {
  throw "Continuous beam report TXT browser smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nContinuous beam regression checks completed successfully." -ForegroundColor Green
