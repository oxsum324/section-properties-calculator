param(
  [ValidateSet("Prepare", "Finalize", "Verify")]
  [string]$Mode = "Prepare",
  [string]$GtvPackage,
  [string]$ProviderOrganization,
  [string]$RepositoryId,
  [ValidateSet("worm-compliance", "worm-governance", "retention-lock")]
  [string]$ImmutabilityMode,
  [string]$RetentionPolicyId,
  [string]$RetentionUntil,
  [switch]$RequireLegalHold,
  [string]$PreparedDirectory,
  [string]$ProviderReceiptPath,
  [string]$ProviderPublicKeyPath,
  [string]$ProviderKeyApprovalEvidencePath,
  [string]$ProviderKeyApprovalBasis,
  [string]$PackagePath,
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

function Read-RequiredValue {
  param([string]$Prompt, [string]$Title, [string]$DefaultValue = "")
  $value = [Microsoft.VisualBasic.Interaction]::InputBox($Prompt, $Title, $DefaultValue).Trim()
  if (-not $value) {
    throw "$Title was not provided."
  }
  return $value
}

function Confirm-YesNo {
  param([string]$Message, [string]$Title)
  $result = [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  return $result -eq [System.Windows.Forms.DialogResult]::Yes
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
$pemFilter = "PEM public keys (*.pem)|*.pem|All files (*.*)|*.*"
$arguments = @("-m", "backend.receiver_governance_archive", "--openssl", $OpenSslPath)

if ($Mode -eq "Prepare") {
  if (-not $GtvPackage) {
    $GtvPackage = Select-Folder "Select the complete GTV trusted-timestamp evidence package"
  }
  if (-not $ProviderOrganization) {
    $ProviderOrganization = Read-RequiredValue "Enter the organization that will operate the external archive." "Archive provider organization"
  }
  if (-not $RepositoryId) {
    $RepositoryId = Read-RequiredValue "Enter the approved DMS/WORM repository identifier." "Archive repository ID"
  }
  if (-not $ImmutabilityMode) {
    $ImmutabilityMode = Read-RequiredValue "Enter worm-compliance, worm-governance, or retention-lock." "Required immutability mode" "worm-compliance"
  }
  if (-not $RetentionUntil) {
    $defaultRetention = [DateTime]::UtcNow.AddYears(10).ToString("yyyy-MM-ddT00:00:00Z")
    $RetentionUntil = Read-RequiredValue "Enter the minimum retention-until time in ISO 8601 UTC format." "Required retention-until" $defaultRetention
  }
  if (-not $RetentionPolicyId) {
    $RetentionPolicyId = Read-RequiredValue "Enter the approved retention policy identifier applied by the external repository." "Retention policy ID"
  }
  $legalHoldRequested = $RequireLegalHold.IsPresent
  if (-not $PSBoundParameters.ContainsKey("RequireLegalHold")) {
    $legalHoldRequested = Confirm-YesNo "Must the external receipt confirm an active legal hold?" "Legal hold requirement"
  }
  $arguments += @(
    "prepare",
    "--gtv-package", $GtvPackage,
    "--provider-organization", $ProviderOrganization,
    "--repository-id", $RepositoryId,
    "--immutability-mode", $ImmutabilityMode,
    "--retention-policy-id", $RetentionPolicyId,
    "--retention-until", $RetentionUntil
  )
  if ($legalHoldRequested) { $arguments += "--require-legal-hold" }
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} elseif ($Mode -eq "Finalize") {
  if (-not $PreparedDirectory) {
    $PreparedDirectory = Select-Folder "Select the prepared GAD external archive request package"
  }
  if (-not $ProviderReceiptPath) {
    $ProviderReceiptPath = Select-OpenFile "Select the GAR receipt signed by the external archive provider" $jsonFilter
  }
  if (-not $ProviderPublicKeyPath) {
    $ProviderPublicKeyPath = Select-OpenFile "Select the independently approved provider Ed25519 public key" $pemFilter
  }
  if (-not $ProviderKeyApprovalEvidencePath) {
    $ProviderKeyApprovalEvidencePath = Select-OpenFile "Select the policy, register, contract, or signed record that approved this provider key" "Approval evidence (*.*)|*.*"
  }
  if (-not $ProviderKeyApprovalBasis) {
    $ProviderKeyApprovalBasis = Read-RequiredValue "Record the policy, register, contract, or other independent basis used to approve this provider public key." "Provider key approval basis"
  }
  $arguments += @(
    "finalize",
    "--prepared-directory", $PreparedDirectory,
    "--provider-receipt", $ProviderReceiptPath,
    "--provider-public-key", $ProviderPublicKeyPath,
    "--provider-key-approval-evidence", $ProviderKeyApprovalEvidencePath,
    "--provider-key-approval-basis", $ProviderKeyApprovalBasis
  )
  if ($OutputDirectory) { $arguments += @("--output-directory", $OutputDirectory) }
} else {
  if (-not $PackagePath) {
    $PackagePath = Select-Folder "Select the complete GAV external archive evidence package"
  }
  $arguments += @("verify", "--package", $PackagePath)
}

Push-Location $root
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "The governance external archive operation failed."
  }
  Write-Host "The governance external archive operation completed." -ForegroundColor Green
} finally {
  Pop-Location
}
