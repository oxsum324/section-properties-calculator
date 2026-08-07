param(
  [string]$Organization,
  [string]$DisplayName,
  [string]$OutputDirectory,
  [string]$ReplacesKeyId,
  [string]$PasswordEnv
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"

if (-not $Organization) {
  $Organization = Read-Host "Organization name"
}
if (-not $DisplayName) {
  $DisplayName = Read-Host "Key display name or purpose"
}
if (-not $OutputDirectory) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select a secure folder for the encrypted RVR private key"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Folder selection was cancelled."
  }
  $OutputDirectory = $dialog.SelectedPath
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before creating keys."
}

$arguments = @(
  "-m", "backend.manage_receiver_key", "create",
  "--organization", $Organization,
  "--display-name", $DisplayName,
  "--output-dir", $OutputDirectory
)
if ($ReplacesKeyId) {
  $arguments += @("--replaces-key-id", $ReplacesKeyId)
}
if ($PasswordEnv) {
  $arguments += @("--password-env", $PasswordEnv)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "RVR organization key creation failed. Review the message above."
  }
  Write-Host "Done. Keep the private PEM offline and send only the public enrollment JSON." -ForegroundColor Green
} finally {
  Pop-Location
}
