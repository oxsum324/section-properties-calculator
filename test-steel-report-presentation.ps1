param([switch]$List)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$testArgs = @()
if ($List) { $testArgs += '--list' }
node (Join-Path $taskRoot 'steel-report-presentation.browser.test.js') @testArgs
if ($LASTEXITCODE -ne 0) { throw "Steel report presentation checks failed: $LASTEXITCODE" }
