param(
  [string]$HandoffPath,
  [string]$ReceiptPath,
  [string]$SevPath,
  [string]$TrustBackupPath,
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

function Should-SelectTrustBackup {
  Add-Type -AssemblyName System.Windows.Forms
  $result = [System.Windows.Forms.MessageBox]::Show(
    "Select a public RTB trust-registry backup for identity trust checks? Choose No for integrity-only verification.",
    "Optional trust registry",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

$jsonFilter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
if (-not $HandoffPath) {
  $HandoffPath = Select-OpenFile "Select the ERH handoff JSON" $jsonFilter
}
if (-not $ReceiptPath) {
  $ReceiptPath = Select-OpenFile "Select the RVR receipt JSON" $jsonFilter
}
if (-not $SevPath) {
  $SevPath = Select-OpenFile "Select the SEV verification JSON" $jsonFilter
}
if (-not $TrustBackupPath -and (Should-SelectTrustBackup)) {
  $TrustBackupPath = Select-OpenFile "Select the optional RTB public trust-registry backup" $jsonFilter
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before verification."
}

$arguments = @(
  "-m", "backend.verify_source_evidence_chain",
  "--handoff", $HandoffPath,
  "--receipt", $ReceiptPath,
  "--sev", $SevPath
)
if ($TrustBackupPath) {
  $arguments += @("--trust-backup", $TrustBackupPath)
}
if ($OutputPath) {
  $arguments += @("--output", $OutputPath)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Independent SEV evidence-chain verification failed."
  }
  Write-Host "Done. The SCV receipt is saved beside the selected SEV unless an output path was supplied." -ForegroundColor Green
} finally {
  Pop-Location
}
