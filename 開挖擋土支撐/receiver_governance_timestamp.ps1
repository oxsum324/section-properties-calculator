param(
  [ValidateSet("Prepare", "Finalize", "Verify")]
  [string]$Mode = "Prepare",
  [string]$VerificationReceiptPath,
  [string]$CheckpointPath,
  [string]$TrustBackupPath,
  [string]$CurrentHistoryPath,
  [string]$PreparedDirectory,
  [string]$TimestampResponsePath,
  [string]$TrustAnchorPath,
  [string]$UntrustedChainPath,
  [string]$PackagePath,
  [string]$OutputDirectory,
  [string]$OpenSslPath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"
Add-Type -AssemblyName System.Windows.Forms

function Select-OpenFile {
  param([string]$Title, [string]$Filter)
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = $Title
  $dialog.Filter = $Filter
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "File selection was cancelled."
  }
  return $dialog.FileName
}

function Select-Folder {
  param([string]$Description)
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Folder selection was cancelled."
  }
  return $dialog.SelectedPath
}

function Confirm-OptionalFile {
  param([string]$Message, [string]$Title)
  $result = [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

function Resolve-SiblingOrSelect {
  param([string]$ReceiptPath, [string]$ExpectedName, [string]$Title, [string]$Filter)
  if ($ExpectedName) {
    $candidate = Join-Path (Split-Path -Parent $ReceiptPath) $ExpectedName
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }
  return Select-OpenFile $Title $Filter
}

if (-not $OpenSslPath) {
  $command = Get-Command openssl -ErrorAction SilentlyContinue
  if ($command) {
    $OpenSslPath = $command.Source
  } else {
    $candidates = @(
      "C:\Program Files\Git\usr\bin\openssl.exe",
      "C:\Program Files\Git\mingw64\bin\openssl.exe"
    )
    $OpenSslPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  }
}
if (-not $OpenSslPath) {
  throw "OpenSSL was not found. Install Git for Windows or provide -OpenSslPath."
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the excavation backend requirements first."
}

$jsonFilter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
$pemFilter = "PEM certificates (*.pem;*.crt)|*.pem;*.crt|All files (*.*)|*.*"
$arguments = @("-m", "backend.receiver_governance_timestamp", "--openssl", $OpenSslPath)

if ($Mode -eq "Prepare") {
  if (-not $VerificationReceiptPath) {
    $VerificationReceiptPath = Select-OpenFile "Select the GCV governance checkpoint verification receipt" $jsonFilter
  }
  try {
    $receipt = Get-Content -LiteralPath $VerificationReceiptPath -Raw | ConvertFrom-Json
  } catch {
    throw "The GCV JSON could not be read: $($_.Exception.Message)"
  }
  $sourceFiles = $receipt.sourceFiles
  if (-not $CheckpointPath) {
    $CheckpointPath = Resolve-SiblingOrSelect $VerificationReceiptPath $sourceFiles.checkpoint.fileName "Select the GHC checkpoint referenced by the GCV" $jsonFilter
  }
  if ($sourceFiles.trustRegistryBackup -and -not $TrustBackupPath) {
    $TrustBackupPath = Resolve-SiblingOrSelect $VerificationReceiptPath $sourceFiles.trustRegistryBackup.fileName "Select the RTB public trust-registry backup referenced by the GCV" $jsonFilter
  }
  if ($sourceFiles.currentHistoryExport -and -not $CurrentHistoryPath) {
    $CurrentHistoryPath = Resolve-SiblingOrSelect $VerificationReceiptPath $sourceFiles.currentHistoryExport.fileName "Select the current GHE referenced by the GCV" $jsonFilter
  }
  $arguments += @("prepare", "--verification-receipt", $VerificationReceiptPath, "--checkpoint", $CheckpointPath)
  if ($TrustBackupPath) { $arguments += @("--trust-backup", $TrustBackupPath) }
  if ($CurrentHistoryPath) { $arguments += @("--current-history", $CurrentHistoryPath) }
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} elseif ($Mode -eq "Finalize") {
  if (-not $PreparedDirectory) {
    $PreparedDirectory = Select-Folder "Select the prepared GAM trusted-timestamp request package"
  }
  if (-not $TimestampResponsePath) {
    $TimestampResponsePath = Select-OpenFile "Select the RFC 3161 response returned by the external TSA" "RFC 3161 responses (*.tsr;*.tst)|*.tsr;*.tst|All files (*.*)|*.*"
  }
  if (-not $TrustAnchorPath) {
    $TrustAnchorPath = Select-OpenFile "Select the organization-approved TSA trust anchor" $pemFilter
  }
  if (-not $UntrustedChainPath -and (Confirm-OptionalFile "Did the TSA provide a separate intermediate certificate chain?" "Optional intermediate chain")) {
    $UntrustedChainPath = Select-OpenFile "Select the TSA intermediate certificate chain" $pemFilter
  }
  $arguments += @(
    "finalize",
    "--prepared-directory", $PreparedDirectory,
    "--timestamp-response", $TimestampResponsePath,
    "--trust-anchor", $TrustAnchorPath
  )
  if ($UntrustedChainPath) { $arguments += @("--untrusted-chain", $UntrustedChainPath) }
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} else {
  if (-not $PackagePath) {
    $PackagePath = Select-Folder "Select the complete GTV trusted-timestamp evidence package"
  }
  $arguments += @("verify", "--package", $PackagePath)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "The governance trusted-timestamp operation failed."
  }
  Write-Host "The governance trusted-timestamp operation completed." -ForegroundColor Green
} finally {
  Pop-Location
}
