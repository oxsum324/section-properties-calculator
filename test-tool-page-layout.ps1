$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$depsRoot = Join-Path $repoRoot '鋼筋混凝土/tools'
. (Join-Path $depsRoot 'ensure-playwright-deps.ps1') -Root $depsRoot -PreferredDirName '.column-testdeps'
node (Join-Path $repoRoot 'tool-page-layout.browser.test.js')
if ($LASTEXITCODE -ne 0) { throw "Tool page layout checks failed with exit code $LASTEXITCODE" }
