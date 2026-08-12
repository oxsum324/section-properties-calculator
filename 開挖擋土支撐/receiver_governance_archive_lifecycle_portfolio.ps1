param(
  [ValidateSet("Scan", "Publish", "VerifySnapshot")]
  [string]$Mode = "Publish",
  [string]$SourceRoot,
  [string]$OutputRoot,
  [string]$PackagePath,
  [string]$AsOf,
  [ValidateRange(0, 366)]
  [int]$UpcomingDays = 30,
  [ValidateRange(1, 12)]
  [int]$MaxDepth = 12,
  [string]$OpenSslPath,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Add-Type -AssemblyName System.Windows.Forms

function Select-Folder {
  param([string]$Description, [bool]$AllowCreate = $false)
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $AllowCreate
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "Folder selection was cancelled." }
  return $dialog.SelectedPath
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python was not found. Install the excavation backend requirements first." }
if ($Mode -ne "VerifySnapshot" -and -not $OpenSslPath) {
  $command = Get-Command openssl -ErrorAction SilentlyContinue
  if ($command) {
    $OpenSslPath = $command.Source
  } else {
    $OpenSslPath = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  }
  if (-not $OpenSslPath) { throw "OpenSSL was not found. Install Git for Windows or provide -OpenSslPath." }
}

$arguments = @("-m", "backend.receiver_governance_archive_lifecycle_portfolio")
if ($OpenSslPath) { $arguments += @("--openssl", $OpenSslPath) }
if ($Mode -eq "Scan" -or $Mode -eq "Publish") {
  if (-not $SourceRoot) { $SourceRoot = Select-Folder "Select the physical parent folder containing case GSC packages" }
  $arguments += @(
    $(if ($Mode -eq "Publish") { "publish" } else { "scan" }),
    "--source-root", $SourceRoot,
    "--upcoming-days", "$UpcomingDays",
    "--max-depth", "$MaxDepth"
  )
  if ($AsOf) { $arguments += @("--as-of", $AsOf) }
  if ($Mode -eq "Publish") {
    if (-not $OutputRoot) { $OutputRoot = Select-Folder "Select a separate controlled folder for append-only GSP overview snapshots" $true }
    $arguments += @("--output-root", $OutputRoot)
  }
} else {
  if (-not $PackagePath) { $PackagePath = Select-Folder "Select the complete GSP lifecycle portfolio snapshot package" }
  $arguments += @("verify-snapshot", "--package", $PackagePath)
}

$exitCode = 1
Push-Location $root
try {
  $lines = @(& $python.Source @arguments)
  $exitCode = $LASTEXITCODE
  $text = $lines -join [Environment]::NewLine
  if ($text) { [Console]::Out.WriteLine($text) }
  if ($exitCode -notin @(0, 2, 3)) { throw "The lifecycle portfolio operation failed." }
  $result = $null
  if ($text) {
    try { $result = $text | ConvertFrom-Json } catch { $result = $null }
  }
  if ($Mode -eq "Publish" -and -not $NoOpen -and $result -and $result.htmlPath -and (Test-Path -LiteralPath $result.htmlPath -PathType Leaf)) {
    Start-Process -FilePath $result.htmlPath
  }
  if ($Mode -eq "VerifySnapshot") {
    Write-Host "The GSP snapshot package is internally intact. Current source state was not assessed; run a fresh scan for current status." -ForegroundColor Green
  } elseif ($exitCode -eq 0) {
    Write-Host "All selected lifecycle chains are current and outside the upcoming reminder window." -ForegroundColor Green
  } elseif ($exitCode -eq 2) {
    Write-Warning "At least one lifecycle chain is upcoming or review-due. Review the JSON/HTML overview."
  } else {
    Write-Host "The lifecycle portfolio is blocked by an expired, conflicting, invalid, unsafe, or unstable source state." -ForegroundColor Red
  }
} finally {
  Pop-Location
}
exit $exitCode
