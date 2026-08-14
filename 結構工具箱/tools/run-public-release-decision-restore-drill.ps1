[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$drillScript = Join-Path $PSScriptRoot 'public-release-decision-restore-drill.js'
$externalDirectory = [Environment]::GetEnvironmentVariable('PUBLIC_RELEASE_DECISION_BACKUP_DIR', 'User')
if ([string]::IsNullOrWhiteSpace($externalDirectory)) {
  Write-Error 'PUBLIC_RELEASE_DECISION_BACKUP_DIR is not configured for the current user.'
  exit 1
}
if (-not (Test-Path -LiteralPath $externalDirectory -PathType Container)) {
  Write-Error 'The configured external release decision backup directory is unavailable.'
  exit 1
}

$env:PUBLIC_RELEASE_DECISION_BACKUP_DIR = $externalDirectory
& node $drillScript --write --require-external --json --repo-root $repoRoot
exit $LASTEXITCODE
