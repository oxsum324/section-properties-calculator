param(
  [string]$CheckpointPath,
  [string]$TrustBackupPath,
  [string]$CurrentHistoryPath,
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"

function Select-OpenFile {
  param([string]$Title, [string]$Filter)
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = $Title
  $dialog.Filter = $Filter
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "File selection was cancelled."
  }
  return $dialog.FileName
}

function Should-SelectOptionalFile {
  param([string]$Message, [string]$Title)
  Add-Type -AssemblyName System.Windows.Forms
  $result = [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

$jsonFilter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
if (-not $CheckpointPath) {
  $CheckpointPath = Select-OpenFile "Select the GHC signed governance checkpoint JSON" $jsonFilter
}
if (-not $TrustBackupPath -and (Should-SelectOptionalFile "Select a public RTB backup to verify whether the signing key was trusted at backup time?" "Optional trust registry")) {
  $TrustBackupPath = Select-OpenFile "Select the optional RTB public trust-registry backup" $jsonFilter
}
if (-not $CurrentHistoryPath -and (Should-SelectOptionalFile "Select a current GHE export to compare history continuity?" "Optional current history")) {
  $CurrentHistoryPath = Select-OpenFile "Select the optional current GHE history export" $jsonFilter
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before verification."
}

$arguments = @(
  "-m", "backend.verify_receiver_governance_checkpoint",
  "--checkpoint", $CheckpointPath
)
if ($TrustBackupPath) {
  $arguments += @("--trust-backup", $TrustBackupPath)
}
if ($CurrentHistoryPath) {
  $arguments += @("--current-history", $CurrentHistoryPath)
}
if ($OutputPath) {
  $arguments += @("--output", $OutputPath)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Independent governance checkpoint verification failed."
  }
  Write-Host "Done. The GCV receipt is saved beside the selected GHC unless an output path was supplied." -ForegroundColor Green
} finally {
  Pop-Location
}
