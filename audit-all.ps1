param(
  [switch]$Quiet,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [int]$MaxRuns = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$auditOutputDir = Join-Path $root "output\audit"
$historyDir = Join-Path $auditOutputDir "history"
$lockPath = Join-Path $auditOutputDir "platform-audit.lock.json"

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

  if ($Quiet -and -not $Force) {
    return
  }
  Write-Host $Message -ForegroundColor $Color
}

function Acquire-Lock {
  if (Test-Path $lockPath) {
    try {
      $lockInfo = Get-Content -Path $lockPath -Raw | ConvertFrom-Json
      $lockingProcess = Get-Process -Id ([int]$lockInfo.pid) -ErrorAction SilentlyContinue
      if ($lockingProcess) {
        throw "Another platform audit is already active (PID $($lockInfo.pid))."
      }
    } catch {
      if ($_.Exception.Message -like "Another platform audit is already active*") {
        throw
      }
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

function Release-Lock {
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

function Invoke-Audit {
  param(
    [string]$Label,
    [string]$Workdir,
    [string]$Command,
    [string]$RunDir
  )

  $safeLabel = ($Label -replace '[^A-Za-z0-9\-]+', '-').Trim('-').ToLowerInvariant()
  $latestLog = Join-Path $auditOutputDir "$safeLabel.txt"
  $historyLog = Join-Path $RunDir "$safeLabel.txt"
  $stdoutPath = Join-Path $RunDir "$safeLabel.stdout.txt"
  $stderrPath = Join-Path $RunDir "$safeLabel.stderr.txt"

  Write-Status "=== $Label ===" "Cyan"
  $proc = Start-Process -FilePath powershell -ArgumentList @(
    "-NoProfile",
    "-Command",
    $Command
  ) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -Wait -WindowStyle Hidden
  $stdout = if (Test-Path $stdoutPath) { Get-Content -Path $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath -Raw } else { "" }
  $output = @($stdout, $stderr) -join [Environment]::NewLine
  $exitCode = $proc.ExitCode

  Set-Content -Path $latestLog -Value $output -Encoding UTF8
  Set-Content -Path $historyLog -Value $output -Encoding UTF8

  return [pscustomobject]@{
    label = $Label
    log = $latestLog
    exitCode = $exitCode
  }
}

function Update-HistoryManifest {
  $historyManifestPath = Join-Path $auditOutputDir "platform-history.json"
  $historyItems = New-Object System.Collections.Generic.List[object]

  $runDirs = Get-ChildItem -Path $historyDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 12

  foreach ($dir in $runDirs) {
    $jsonPath = Join-Path $dir.FullName "platform-summary.json"
    if (-not (Test-Path $jsonPath)) {
      continue
    }
    try {
      $payload = Get-Content -Path $jsonPath -Raw | ConvertFrom-Json
      $historyItems.Add([pscustomobject]@{
        runId = $payload.runId
        generatedAt = $payload.generatedAt
        pass = [bool]$payload.pass
        failureCount = [int]$payload.failureCount
        failures = @($payload.failures)
        summaryPath = (Join-Path $dir.FullName "platform-summary.md")
        summaryJsonPath = $jsonPath
        records = @($payload.records)
      })
    } catch {
      continue
    }
  }

  $manifest = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    count = $historyItems.Count
    items = @($historyItems.ToArray())
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $historyManifestPath -Encoding UTF8
}

function Run-PlatformAuditPass {
  $runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $runDir = Join-Path $historyDir $runStamp
  New-Item -Path $runDir -ItemType Directory -Force | Out-Null

  $steelDir = (Get-ChildItem -Path $root -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "plate-check.html")
  } | Select-Object -First 1 -ExpandProperty FullName)
  $rcDir = (Get-ChildItem -Path $root -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "shared\report.js")
  } | Select-Object -First 1 -ExpandProperty FullName)
  $coreDir = (Get-ChildItem -Path $root -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "core\wind-report.js")
  } | Select-Object -First 1 -ExpandProperty FullName)

  if (-not $steelDir -or -not $rcDir -or -not $coreDir) {
    throw "Unable to resolve steel, RC, or core tool directories."
  }
  $steelAuditScript = Join-Path $steelDir "audit-tool.ps1"
  $rcAuditScript = Join-Path $rcDir "audit-tool.ps1"
  $coreAuditScript = Join-Path $coreDir "audit-core.ps1"

  $jobs = @(
    @{
      key = "steel"
      label = "Steel formal audit"
      workdir = $steelDir
      command = "& '$steelAuditScript' -Quiet"
      statusPath = (Join-Path $steelDir "output\audit\audit-status.json")
      summaryPath = (Join-Path $steelDir "output\audit\audit-summary.md")
    },
    @{
      key = "rc"
      label = "RC audit"
      workdir = $rcDir
      command = "& '$rcAuditScript' -Quiet"
      statusPath = (Join-Path $rcDir "output\audit\audit-status.json")
      summaryPath = (Join-Path $rcDir "output\audit\audit-summary.md")
    },
    @{
      key = "core"
      label = "Structural core audit"
      workdir = $coreDir
      command = "& '$coreAuditScript' -Quiet"
      statusPath = (Join-Path $coreDir "output\audit\audit-status.json")
      summaryPath = (Join-Path $coreDir "output\audit\audit-summary.md")
    }
  )

  $records = New-Object System.Collections.Generic.List[object]
  $summaryLines = New-Object System.Collections.Generic.List[string]
  $failures = New-Object System.Collections.Generic.List[string]

  foreach ($job in $jobs) {
    $record = Invoke-Audit -Label $job.label -Workdir $job.workdir -Command $job.command -RunDir $runDir
    $status = $null
    if (Test-Path $job.statusPath) {
      $status = Get-Content -Path $job.statusPath -Raw | ConvertFrom-Json
    }
    $pass = [bool]($record.exitCode -eq 0 -and $status -and $status.pass)
    $statusRunId = if ($status) { $status.runId } else { "" }
    $statusFailureCount = if ($status) { $status.failureCount } else { -1 }
    if (-not $pass) {
      $failures.Add("$($job.key): exitCode=$($record.exitCode)")
    }
    $records.Add([pscustomobject]@{
      key = $job.key
      label = $job.label
      exitCode = $record.exitCode
      pass = $pass
      log = $record.log
      statusPath = $job.statusPath
      summaryPath = $job.summaryPath
      runId = $statusRunId
      failureCount = $statusFailureCount
    })
    $summaryLines.Add("- $($job.label): pass=$pass, exitCode=$($record.exitCode), log=$($record.log)")
    if ($status) {
      $summaryLines.Add("  runId=$($status.runId), failureCount=$($status.failureCount)")
      $summaryLines.Add("  summary=$($job.summaryPath)")
    }
  }

  $overallPass = ($failures.Count -eq 0)
  $summaryPath = Join-Path $auditOutputDir "platform-summary.md"
  $summaryJsonPath = Join-Path $auditOutputDir "platform-summary.json"
  $statusPath = Join-Path $auditOutputDir "platform-status.json"
  $historySummaryPath = Join-Path $runDir "platform-summary.md"
  $historySummaryJsonPath = Join-Path $runDir "platform-summary.json"

  $summaryContent = @(
    "# Platform Audit Summary"
    ""
    "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "- root: $root"
    "- runId: $runStamp"
    "- pass: $overallPass"
    ""
    $summaryLines
  )
  Set-Content -Path $summaryPath -Value $summaryContent -Encoding UTF8
  Set-Content -Path $historySummaryPath -Value $summaryContent -Encoding UTF8

  $payload = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    runId = $runStamp
    pass = $overallPass
    failureCount = $failures.Count
    failures = @($failures.ToArray())
    records = @($records.ToArray())
  }
  $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryJsonPath -Encoding UTF8
  $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $historySummaryJsonPath -Encoding UTF8

  $statusPayload = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    runId = $runStamp
    quiet = [bool]$Quiet
    loop = [bool]$Loop
    pass = $overallPass
    failureCount = $failures.Count
    modules = @("steel", "rc", "core")
    lastSummary = $summaryPath
    lastHistorySummary = $historySummaryPath
  }
  $statusPayload | ConvertTo-Json -Depth 5 | Set-Content -Path $statusPath -Encoding UTF8
  Update-HistoryManifest

  return [pscustomobject]@{
    runId = $runStamp
    pass = $overallPass
    failureCount = $failures.Count
    failures = @($failures.ToArray())
    summaryPath = $summaryPath
    statusPath = $statusPath
  }
}

$runIndex = 0

try {
  Acquire-Lock

  do {
    $runIndex += 1
    $result = Run-PlatformAuditPass

    if ($result.pass) {
      Write-Status "Platform audit pass #$runIndex completed cleanly. runId=$($result.runId)" "Green" -Force
      Write-Status "Summary: $($result.summaryPath)" "DarkGreen" -Force
    } else {
      Write-Status "Platform audit pass #$runIndex found issues. runId=$($result.runId)" "Red" -Force
      Write-Status ("Failures: " + ($result.failures -join "; ")) "Red" -Force
      throw ("Platform audit found issues: " + ($result.failures -join "; "))
    }

    if ($Loop) {
      if ($MaxRuns -gt 0 -and $runIndex -ge $MaxRuns) {
        break
      }
      Write-Status "Sleeping ${IntervalSeconds}s before next platform audit pass..." "DarkGray"
      Start-Sleep -Seconds $IntervalSeconds
    }
  } while ($Loop)
} finally {
  Release-Lock
}
