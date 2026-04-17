param(
  [switch]$Quiet,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [int]$MaxRuns = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testsDir = Join-Path $root "tests"
$auditOutputDir = Join-Path $root "output\audit"
$historyDir = Join-Path $auditOutputDir "history"
$lockPath = Join-Path $auditOutputDir "audit.lock.json"
$summaryLines = New-Object System.Collections.Generic.List[string]
$auditRecords = New-Object System.Collections.Generic.List[object]
$auditFailures = New-Object System.Collections.Generic.List[string]

if (-not (Test-Path $auditOutputDir)) {
  New-Item -Path $auditOutputDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $historyDir)) {
  New-Item -Path $historyDir -ItemType Directory | Out-Null
}

function Write-Status {
  param(
    [string]$Message,
    [string]$Color = "Gray",
    [switch]$Force
  )
  if ($Quiet -and -not $Force) { return }
  Write-Host $Message -ForegroundColor $Color
}

function Reset-AuditState {
  $summaryLines.Clear()
  $auditRecords.Clear()
  $auditFailures.Clear()
}

function Acquire-AuditLock {
  if (Test-Path $lockPath) {
    try {
      $lockInfo = Get-Content -Path $lockPath -Raw | ConvertFrom-Json
      $lockingProcess = Get-Process -Id ([int]$lockInfo.pid) -ErrorAction SilentlyContinue
      if ($lockingProcess) {
        throw "Another core audit run is already active (PID $($lockInfo.pid))."
      }
    } catch {
      if ($_.Exception.Message -like "Another core audit run is already active*") { throw }
    }
    Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
  }

  [ordered]@{
    pid = $PID
    startedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    quiet = [bool]$Quiet
    loop = [bool]$Loop
  } | ConvertTo-Json -Depth 3 | Set-Content -Path $lockPath -Encoding UTF8
}

function Release-AuditLock {
  if (Test-Path $lockPath) {
    try {
      $lockInfo = Get-Content -Path $lockPath -Raw | ConvertFrom-Json
      if ([int]$lockInfo.pid -eq $PID) {
        Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )
  Write-Status ""
  Write-Status "=== $Label ===" "Cyan"
  & $Action
}

function Invoke-AuditCommand {
  param(
    [string]$Label,
    [string]$Command,
    [string]$RunDir
  )

  $safeLabel = ($Label -replace '[^A-Za-z0-9\-]+', '-').Trim('-').ToLowerInvariant()
  if (-not $safeLabel) { $safeLabel = "step" }
  $logName = "$safeLabel.txt"
  $latestLog = Join-Path $auditOutputDir $logName
  $historyLog = Join-Path $RunDir $logName

  Invoke-Step $Label {
    $output = & powershell -NoProfile -Command $Command 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    Set-Content -Path $latestLog -Value $output -Encoding UTF8
    Set-Content -Path $historyLog -Value $output -Encoding UTF8

    $summaryLines.Add("- ${Label}: log=$latestLog")
    $summaryLines.Add("  exitCode=$exitCode")
    $auditRecords.Add([pscustomobject]@{
      label = $Label
      log = $latestLog
      exitCode = $exitCode
    })

    if ($exitCode -ne 0) {
      $auditFailures.Add("${Label}: exitCode=$exitCode")
      throw "$Label failed with exit code $exitCode"
    }
  }
}

function Save-AuditOutputs {
  param(
    [string]$RunDir,
    [string]$RunStamp
  )

  $summaryPath = Join-Path $auditOutputDir "audit-summary.md"
  $summaryJsonPath = Join-Path $auditOutputDir "audit-summary.json"
  $statusPath = Join-Path $auditOutputDir "audit-status.json"
  $historySummaryPath = Join-Path $RunDir "audit-summary.md"
  $historySummaryJsonPath = Join-Path $RunDir "audit-summary.json"

  $summaryContent = @(
    "# Structural Core Audit Summary"
    ""
    "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "- root: $root"
    "- runId: $RunStamp"
    ""
    $summaryLines
  )
  Set-Content -Path $summaryPath -Value $summaryContent -Encoding UTF8
  Set-Content -Path $historySummaryPath -Value $summaryContent -Encoding UTF8

  $auditPayload = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    runId = $RunStamp
    failures = @($auditFailures.ToArray())
    records = @($auditRecords.ToArray())
  }
  $auditPayload | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryJsonPath -Encoding UTF8
  $auditPayload | ConvertTo-Json -Depth 6 | Set-Content -Path $historySummaryJsonPath -Encoding UTF8

  $statusPayload = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    runId = $RunStamp
    quiet = [bool]$Quiet
    loop = [bool]$Loop
    pass = ($auditFailures.Count -eq 0)
    failureCount = $auditFailures.Count
    modules = @("wind", "seismic")
    lastSummary = $summaryPath
    lastHistorySummary = $historySummaryPath
  }
  $statusPayload | ConvertTo-Json -Depth 6 | Set-Content -Path $statusPath -Encoding UTF8

  return @{
    SummaryPath = $summaryPath
    SummaryJsonPath = $summaryJsonPath
    StatusPath = $statusPath
    HistorySummaryPath = $historySummaryPath
  }
}

function Run-AuditPass {
  $runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $runDir = Join-Path $historyDir $runStamp
  New-Item -Path $runDir -ItemType Directory -Force | Out-Null
  Reset-AuditState

  $commands = @(
    @{ Label = "Wind core test"; Command = "Set-Location '$testsDir'; node '.\wind.test.js'" },
    @{ Label = "Seismic core test"; Command = "Set-Location '$testsDir'; node '.\seismic.test.js'" }
  )

  foreach ($item in $commands) {
    Invoke-AuditCommand -Label $item.Label -Command $item.Command -RunDir $runDir
  }

  $paths = Save-AuditOutputs -RunDir $runDir -RunStamp $runStamp
  return [pscustomobject]@{
    runId = $runStamp
    pass = ($auditFailures.Count -eq 0)
    failureCount = $auditFailures.Count
    failures = @($auditFailures.ToArray())
    summaryPath = $paths.SummaryPath
    summaryJsonPath = $paths.SummaryJsonPath
    statusPath = $paths.StatusPath
    historySummaryPath = $paths.HistorySummaryPath
  }
}

$runIndex = 0

try {
  Acquire-AuditLock

  do {
    $runIndex += 1
    $result = Run-AuditPass

    if ($result.pass) {
      Write-Status ""
      Write-Status "Core audit pass #$runIndex completed cleanly. runId=$($result.runId)" "Green" -Force
      Write-Status "Summary: $($result.summaryPath)" "DarkGreen" -Force
    } else {
      Write-Status ""
      Write-Status "Core audit pass #$runIndex found issues. runId=$($result.runId)" "Red" -Force
      Write-Status ("Failures: " + ($result.failures -join "; ")) "Red" -Force
      throw ("Core audit found issues: " + ($result.failures -join "; "))
    }

    if ($Loop) {
      if ($MaxRuns -gt 0 -and $runIndex -ge $MaxRuns) { break }
      Write-Status "Sleeping ${IntervalSeconds}s before next core audit pass..." "DarkGray"
      Start-Sleep -Seconds $IntervalSeconds
    }
  } while ($Loop)
} finally {
  Release-AuditLock
}
