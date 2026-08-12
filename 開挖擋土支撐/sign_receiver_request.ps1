param(
  [string]$RequestPath,
  [string]$PrivateKeyPath,
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

if (-not $RequestPath) {
  $RequestPath = Select-OpenFile "Select the RVR, SEV, or governance checkpoint signing request JSON" "JSON files (*.json)|*.json|All files (*.*)|*.*"
}
if (-not $PrivateKeyPath) {
  $PrivateKeyPath = Select-OpenFile "Select an existing Ed25519 PEM private key" "PEM files (*.pem)|*.pem|All files (*.*)|*.*"
}
if (-not $OutputPath) {
  $request = Get-Item -LiteralPath $RequestPath
  $requestPayload = Get-Content -Raw -LiteralPath $RequestPath | ConvertFrom-Json
  $responsePrefix = if ($requestPayload.kind -eq "receiver-governance-health-checkpoint-signing-request") {
    "governance-health-signed-checkpoint-"
  } elseif ($requestPayload.kind -eq "source-evidence-verification-identity-signing-request") {
    "SEV-identity-signature-response-"
  } else {
    "RVR-identity-signature-response-"
  }
  $OutputPath = Join-Path $request.DirectoryName ($responsePrefix + $request.BaseName + ".json")
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before signing."
}

Push-Location $root
try {
  & $python.Source -m backend.sign_receiver_request `
    --request $RequestPath `
    --private-key $PrivateKeyPath `
    --output $OutputPath
  if ($LASTEXITCODE -ne 0) {
    throw "Offline signing failed. Review the message above."
  }
  Write-Host "Done. Import the signed JSON into the matching RVR, SEV, or governance checkpoint screen." -ForegroundColor Green
} finally {
  Pop-Location
}
