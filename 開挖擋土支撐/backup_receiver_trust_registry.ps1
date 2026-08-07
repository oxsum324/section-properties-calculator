param(
  [ValidateSet("Cycle", "Backup", "Verify", "Drill")]
  [string]$Mode = "Cycle",
  [string]$OutputDirectory,
  [string]$BackupFile,
  [string]$RegistryPath,
  [int]$MaxAgeDays = 30
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"

function Select-OutputDirectory {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the controlled folder for RVR trust registry backups and drill receipts"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Folder selection was cancelled."
  }
  return $dialog.SelectedPath
}

function Select-BackupFile {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Select an RVR trust registry backup"
  $dialog.Filter = "RVR trust registry backup (*.json)|*.json"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Backup selection was cancelled."
  }
  return $dialog.FileName
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before running RVR trust registry backup."
}

if ($Mode -in @("Cycle", "Backup", "Drill") -and -not $OutputDirectory) {
  $OutputDirectory = Select-OutputDirectory
}
if ($Mode -in @("Verify", "Drill") -and -not $BackupFile) {
  $BackupFile = Select-BackupFile
}
if ($MaxAgeDays -le 0) {
  throw "MaxAgeDays must be greater than zero."
}

$arguments = @("-m", "backend.backup_receiver_trust_registry")
if ($RegistryPath) {
  $arguments += @("--registry", $RegistryPath)
}
switch ($Mode) {
  "Cycle" {
    $arguments += @("cycle", "--output-dir", $OutputDirectory, "--max-age-days", $MaxAgeDays)
  }
  "Backup" {
    $arguments += @("backup", "--output-dir", $OutputDirectory)
  }
  "Verify" {
    $arguments += @("verify", "--backup", $BackupFile, "--max-age-days", $MaxAgeDays)
  }
  "Drill" {
    $arguments += @("drill", "--backup", $BackupFile, "--receipt-dir", $OutputDirectory, "--max-age-days", $MaxAgeDays)
  }
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "RVR trust registry backup or recovery drill failed. Review the message above."
  }
  Write-Host "RVR trust registry backup operation completed with verification evidence." -ForegroundColor Green
} finally {
  Pop-Location
}
