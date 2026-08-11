param(
  [string]$LibraryPath,
  [string]$PrivateKeyPath,
  [string]$Organization,
  [string]$DisplayName,
  [string]$OutputPath,
  [string]$PasswordEnv
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

if (-not $LibraryPath) {
  $LibraryPath = Select-OpenFile "Select the receiver evidence template library JSON" "JSON files (*.json)|*.json|All files (*.*)|*.*"
}
if (-not $PrivateKeyPath) {
  $PrivateKeyPath = Select-OpenFile "Select an existing Ed25519 PEM private key" "PEM files (*.pem)|*.pem|All files (*.*)|*.*"
}
if (-not $Organization) {
  $Organization = Read-Host "Publisher organization exactly as registered in the RKE trust registry"
}
if (-not $DisplayName) {
  $DisplayName = Read-Host "Publisher key name or release purpose"
}
if (-not $OutputPath) {
  $library = Get-Item -LiteralPath $LibraryPath
  $OutputPath = Join-Path $library.DirectoryName ("organization-signed-" + $library.BaseName + ".json")
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before signing."
}

$arguments = @(
  "-m", "backend.sign_receiver_evidence_templates",
  "--library", $LibraryPath,
  "--private-key", $PrivateKeyPath,
  "--organization", $Organization,
  "--display-name", $DisplayName,
  "--output", $OutputPath
)
if ($PasswordEnv) {
  $arguments += @("--password-env", $PasswordEnv)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Receiver evidence template signing failed. Review the message above."
  }
  Write-Host "Done. Import the organization-signed JSON from the receiver evidence template panel." -ForegroundColor Green
} finally {
  Pop-Location
}
