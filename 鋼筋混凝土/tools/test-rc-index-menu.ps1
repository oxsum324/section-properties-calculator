$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'rc-index-menu-browser-smoke.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.rc-index-testdeps'

Write-Host "`n== RC index menu browser smoke ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "RC index menu browser smoke failed with exit code $LASTEXITCODE"
}

Write-Host "`nRC index menu checks completed successfully." -ForegroundColor Green
