param(
  [Parameter(Mandatory=$true)][string]$InputDirectory,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$driver = Join-Path $PSScriptRoot 'render-report-docx-word.py'
# Late binding avoids stale Office .NET type-library registration on some hosts.
# The driver creates and closes only its own Word Application.
python $driver $InputDirectory $OutputDirectory
if ($LASTEXITCODE -ne 0) { throw "Word rendering failed with exit code $LASTEXITCODE" }
