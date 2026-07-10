$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$visualTestFile = Join-Path $root 'retrofit-report-visual.test.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.beam-testdeps'

node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "RC retrofit report visual smoke failed with exit code $LASTEXITCODE"
}
