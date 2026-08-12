param(
  [ValidateSet("Run", "VerifyState")]
  [string]$Mode = "Run",
  [string]$SourceRoot,
  [Parameter(Mandatory = $true)]
  [string]$StateDirectory,
  [ValidateRange(0, 366)]
  [int]$UpcomingDays = 30,
  [ValidateRange(1, 12)]
  [int]$MaxDepth = 12,
  [ValidateRange(1, 8784)]
  [int]$MaxAgeHours = 36,
  [string]$AsOf,
  [string]$OpenSslPath,
  [switch]$ShowAlert
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

function Show-MonitorAlert {
  param([string]$Title, [string]$Message, [int]$Icon)
  try {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup($Message, 120, $Title, $Icon)
  } catch {
    Write-Warning "Unable to display the lifecycle monitor alert: $($_.Exception.Message)"
  }
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python was not found. Install the excavation backend requirements first." }

$arguments = @("-m", "backend.receiver_governance_archive_lifecycle_monitor")
if ($Mode -eq "Run") {
  if (-not $SourceRoot) { throw "SourceRoot is required in Run mode." }
  if (-not $OpenSslPath) {
    $command = Get-Command openssl -ErrorAction SilentlyContinue
    if ($command) {
      $OpenSslPath = $command.Source
    } else {
      $OpenSslPath = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
  }
  if (-not $OpenSslPath) { throw "OpenSSL was not found. Install Git for Windows or provide -OpenSslPath." }
  $arguments += @(
    "--openssl", $OpenSslPath,
    "run",
    "--source-root", $SourceRoot,
    "--state-dir", $StateDirectory,
    "--upcoming-days", "$UpcomingDays",
    "--max-depth", "$MaxDepth"
  )
  if ($AsOf) { $arguments += @("--as-of", $AsOf) }
} else {
  $arguments += @(
    "verify-state",
    "--state-dir", $StateDirectory,
    "--max-age-hours", "$MaxAgeHours"
  )
  if ($AsOf) { $arguments += @("--as-of", $AsOf) }
}

$exitCode = 1
Push-Location $root
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $lines = @(& $python.Source @arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
} finally {
  Pop-Location
}

$text = ($lines | ForEach-Object { "$_" }) -join [Environment]::NewLine
if ($text) { [Console]::Out.WriteLine($text) }
if ($exitCode -notin @(0, 2, 3)) {
  if ($ShowAlert) {
    $detail = $text
    if ($detail.Length -gt 1200) { $detail = $detail.Substring(0, 1200) + "..." }
    $message = "The lifecycle monitor could not produce a trusted current state.`n`nThis operational or integrity failure is not alert-throttled. Resolve the failure and restore a trusted state chain before relying on the monitor."
    if ($detail) { $message += "`n`nDetails:`n$detail" }
    Show-MonitorAlert -Title "GSC lifecycle monitor failed" -Message $message -Icon 16
  }
  throw "The lifecycle monitor could not produce a trusted current state."
}
$result = $null
try { $result = $text | ConvertFrom-Json } catch { throw "The lifecycle monitor returned unreadable JSON." }

if ($Mode -eq "Run" -and $ShowAlert -and $result.notification.shouldNotify) {
  $summary = $result.monitor.signal.summary
  $message = "Status: $($result.attentionStatus)`nUpcoming: $($summary.upcomingCount)`nReview due: $($summary.reviewDueCount)`nBlocked chains: $($summary.blockedCount)`nInvalid packages: $($summary.invalidPackageCount)`nScan errors: $($summary.errorIssueCount)`n`nOpen the local latest JSON for case-level details:`n$($result.latestPath)"
  if ($result.notification.kind -eq "recovered") {
    Show-MonitorAlert -Title "GSC lifecycle monitor recovered" -Message $message -Icon 64
  } else {
    Show-MonitorAlert -Title "GSC lifecycle monitor requires attention" -Message $message -Icon 48
  }
}

exit $exitCode
