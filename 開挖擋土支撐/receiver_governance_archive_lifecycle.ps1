param(
  [ValidateSet("IssueStatus", "Finalize", "Verify")]
  [string]$Mode = "Finalize",
  [string]$ArchiveRequestPath,
  [string]$ProviderReceiptPath,
  [string]$PrivateKeyPath,
  [string]$PrivateKeyPasswordEnv,
  [string]$ObservedAt,
  [ValidateSet("present", "missing", "inaccessible")]
  [string]$ObjectStatus,
  [ValidateSet("matched", "mismatched", "not-verified")]
  [string]$ContentHashStatus,
  [string]$ObservedObjectSha256,
  [int]$ObservedObjectSizeBytes,
  [ValidateSet("active", "not-active", "unknown")]
  [string]$ImmutabilityStatus,
  [ValidateSet("worm-compliance", "worm-governance", "retention-lock")]
  [string]$ImmutabilityMode,
  [string]$RetentionPolicyId,
  [string]$RetentionUntil,
  [ValidateSet("active", "not-active", "not-supported")]
  [string]$LegalHoldStatus,
  [string]$ObservationMethod,
  [string]$ObservationReference,
  [string]$GavPackage,
  [string]$ProviderStatusReceiptPath,
  [string]$ProviderPublicKeyPath,
  [string]$ProviderKeyApprovalEvidencePath,
  [string]$ProviderKeyApprovalBasis,
  [int]$ReviewIntervalDays = 90,
  [int]$MaximumObservationAgeHours = 72,
  [int]$RetentionWarningDays = 180,
  [string]$PackagePath,
  [string]$AsOf,
  [string]$OutputDirectory,
  [string]$OpenSslPath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

function Select-OpenFile {
  param([string]$Title, [string]$Filter)
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = $Title
  $dialog.Filter = $Filter
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "File selection was cancelled." }
  return $dialog.FileName
}

function Select-Folder {
  param([string]$Description)
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "Folder selection was cancelled." }
  return $dialog.SelectedPath
}

function Read-RequiredValue {
  param([string]$Prompt, [string]$Title, [string]$DefaultValue = "")
  $value = [Microsoft.VisualBasic.Interaction]::InputBox($Prompt, $Title, $DefaultValue).Trim()
  if (-not $value) { throw "$Title was not provided." }
  return $value
}

function Confirm-ProviderObservation {
  $message = "This command does not query the repository. Continue only if the archive provider has actually re-observed the exact object, version, SHA-256, retention lock, and legal-hold state in its own system."
  $result = [System.Windows.Forms.MessageBox]::Show($message, "Provider observation required", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning)
  if ($result -ne [System.Windows.Forms.DialogResult]::Yes) { throw "Provider status issuance was cancelled." }
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python was not found. Install the excavation backend requirements first." }

if ($Mode -ne "IssueStatus" -and -not $OpenSslPath) {
  $command = Get-Command openssl -ErrorAction SilentlyContinue
  if ($command) {
    $OpenSslPath = $command.Source
  } else {
    $OpenSslPath = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  }
  if (-not $OpenSslPath) { throw "OpenSSL was not found. Install Git for Windows or provide -OpenSslPath." }
}

$jsonFilter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
$pemFilter = "PEM keys (*.pem)|*.pem|All files (*.*)|*.*"
$arguments = @("-m", "backend.receiver_governance_archive_lifecycle")
if ($OpenSslPath) { $arguments += @("--openssl", $OpenSslPath) }

if ($Mode -eq "IssueStatus") {
  Confirm-ProviderObservation
  if (-not $ArchiveRequestPath) { $ArchiveRequestPath = Select-OpenFile "Select the original GAD request JSON" $jsonFilter }
  if (-not $ProviderReceiptPath) { $ProviderReceiptPath = Select-OpenFile "Select the original GAR provider receipt JSON" $jsonFilter }
  if (-not $PrivateKeyPath) { $PrivateKeyPath = Select-OpenFile "Select the provider Ed25519 private key in the isolated provider environment" $pemFilter }
  if (-not $ObservedAt) { $ObservedAt = Read-RequiredValue "Enter the repository observation time in ISO 8601 UTC format." "Observed at" ([DateTime]::UtcNow.ToString("o")) }
  if (-not $ObjectStatus) { $ObjectStatus = Read-RequiredValue "Enter present, missing, or inaccessible." "Object status" "present" }
  if (-not $ContentHashStatus) { $ContentHashStatus = Read-RequiredValue "Enter matched, mismatched, or not-verified." "Content hash status" "matched" }
  if ($ObjectStatus -eq "present") {
    if (-not $ObservedObjectSha256) { $ObservedObjectSha256 = Read-RequiredValue "Enter the SHA-256 actually recomputed or returned by the repository." "Observed object SHA-256" }
    if ($ObservedObjectSizeBytes -le 0) { $ObservedObjectSizeBytes = [int](Read-RequiredValue "Enter the observed object byte size." "Observed object bytes") }
  }
  if (-not $ImmutabilityStatus) { $ImmutabilityStatus = Read-RequiredValue "Enter active, not-active, or unknown." "Immutability status" "active" }
  if (-not $ImmutabilityMode) { $ImmutabilityMode = Read-RequiredValue "Enter worm-compliance, worm-governance, or retention-lock." "Immutability mode" "worm-compliance" }
  if (-not $RetentionPolicyId) { $RetentionPolicyId = Read-RequiredValue "Enter the retention policy identifier currently applied by the repository." "Retention policy ID" }
  if (-not $RetentionUntil) { $RetentionUntil = Read-RequiredValue "Enter the current retention-until time in ISO 8601 UTC format." "Retention until" }
  if (-not $LegalHoldStatus) { $LegalHoldStatus = Read-RequiredValue "Enter active, not-active, or not-supported." "Legal hold status" "active" }
  if (-not $ObservationMethod) { $ObservationMethod = Read-RequiredValue "Enter a portable method identifier, for example repository-api-sha256." "Observation method" "repository-api-sha256" }
  if (-not $ObservationReference) { $ObservationReference = Read-RequiredValue "Enter the provider audit-event or query record identifier." "Observation reference" }
  $arguments += @(
    "issue-status", "--archive-request", $ArchiveRequestPath, "--provider-receipt", $ProviderReceiptPath,
    "--private-key", $PrivateKeyPath, "--observed-at", $ObservedAt, "--object-status", $ObjectStatus,
    "--content-hash-status", $ContentHashStatus, "--immutability-status", $ImmutabilityStatus,
    "--immutability-mode", $ImmutabilityMode, "--retention-policy-id", $RetentionPolicyId,
    "--retention-until", $RetentionUntil, "--legal-hold-status", $LegalHoldStatus,
    "--observation-method", $ObservationMethod, "--observation-reference", $ObservationReference
  )
  if ($ObjectStatus -eq "present") { $arguments += @("--observed-object-sha256", $ObservedObjectSha256, "--observed-object-size-bytes", "$ObservedObjectSizeBytes") }
  if ($PrivateKeyPasswordEnv) { $arguments += @("--private-key-password-env", $PrivateKeyPasswordEnv) }
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} elseif ($Mode -eq "Finalize") {
  if (-not $GavPackage) { $GavPackage = Select-Folder "Select the complete original GAV external archive evidence package" }
  if (-not $ProviderStatusReceiptPath) { $ProviderStatusReceiptPath = Select-OpenFile "Select the newly signed GSR lifecycle status receipt" $jsonFilter }
  if (-not $ProviderPublicKeyPath) { $ProviderPublicKeyPath = Select-OpenFile "Select the independently approved current provider Ed25519 public key" $pemFilter }
  if (-not $ProviderKeyApprovalEvidencePath) { $ProviderKeyApprovalEvidencePath = Select-OpenFile "Select the approval record for the current provider key" "Approval evidence (*.*)|*.*" }
  if (-not $ProviderKeyApprovalBasis) { $ProviderKeyApprovalBasis = Read-RequiredValue "Record the policy, register, contract, or signed basis approving the current provider key." "Current provider key approval basis" }
  $arguments += @(
    "finalize-checkpoint", "--gav-package", $GavPackage, "--provider-status-receipt", $ProviderStatusReceiptPath,
    "--provider-public-key", $ProviderPublicKeyPath, "--provider-key-approval-evidence", $ProviderKeyApprovalEvidencePath,
    "--provider-key-approval-basis", $ProviderKeyApprovalBasis, "--review-interval-days", "$ReviewIntervalDays",
    "--maximum-observation-age-hours", "$MaximumObservationAgeHours", "--retention-warning-days", "$RetentionWarningDays"
  )
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} else {
  if (-not $PackagePath) { $PackagePath = Select-Folder "Select the complete GSC lifecycle checkpoint package" }
  $arguments += @("verify-checkpoint", "--package", $PackagePath)
  if ($AsOf) { $arguments += @("--as-of", $AsOf) }
}

$exitCode = 1
Push-Location $root
try {
  & $python.Source @arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    Write-Host "The external archive lifecycle operation completed with current status." -ForegroundColor Green
  } elseif ($Mode -eq "Verify" -and $exitCode -eq 2) {
    Write-Warning "The checkpoint is historically valid, but periodic review or retention renewal is due."
  } elseif ($Mode -eq "Verify" -and $exitCode -eq 3) {
    Write-Host "The checkpoint is historically valid, but the current lifecycle assessment is blocked." -ForegroundColor Red
  } else {
    throw "The external archive lifecycle operation failed."
  }
} finally {
  Pop-Location
}
exit $exitCode
