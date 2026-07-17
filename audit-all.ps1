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

function Test-AuditTransientRuntimeFailure {
  param([string]$LogPath)

  if ([string]::IsNullOrWhiteSpace($LogPath) -or -not (Test-Path -LiteralPath $LogPath)) { return $false }
  $text = Get-Content -LiteralPath $LogPath -Raw -Encoding UTF8
  return ($text -match 'spawn(?:Sync)? .*EPERM|spawn EPERM|WinError 5|access is denied|Permission denied|browserType\.launch: spawn EPERM')
}

function Clear-AuditRuntimeProcesses {
  param(
    [datetime]$Since,
    [string]$Reason,
    [string[]]$ProcessNames = @("node", "chrome", "msedge")
  )

  $cutoff = $Since.AddSeconds(-5)
  $stopped = New-Object System.Collections.Generic.List[string]
  foreach ($proc in @(Get-Process $ProcessNames -ErrorAction SilentlyContinue)) {
    try {
      if ($proc.StartTime -lt $cutoff) { continue }
      $stopped.Add("$($proc.ProcessName):$($proc.Id)")
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  if ($stopped.Count -gt 0) {
    Write-Status "[platform-audit] cleared runtime processes after ${Reason}: $($stopped -join ', ')" "DarkGray"
    Start-Sleep -Seconds 5
  }
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
    [string]$RunDir,
    [int]$TimeoutSeconds = 300
  )

  if (-not (Test-Path -LiteralPath $Workdir)) {
    throw "missing audit workdir: $Workdir"
  }

  $safeLabel = ($Label -replace '[^A-Za-z0-9\-]+', '-').Trim('-').ToLowerInvariant()
  $latestLog = Join-Path $auditOutputDir "$safeLabel.txt"
  $historyLog = Join-Path $RunDir "$safeLabel.txt"
  $stdoutPath = Join-Path $RunDir "$safeLabel.stdout.txt"
  $stderrPath = Join-Path $RunDir "$safeLabel.stderr.txt"
  $scriptPath = Join-Path $RunDir "$safeLabel.ps1"

  $escapedWorkdir = $Workdir.Replace("'", "''")
  $scriptLines = @(
    '$ErrorActionPreference = "Stop"',
    '$utf8NoBom = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::InputEncoding = $utf8NoBom',
    '[Console]::OutputEncoding = $utf8NoBom',
    '$OutputEncoding = $utf8NoBom',
    '$env:PYTHONUTF8 = "1"',
    '$env:PYTHONIOENCODING = "utf-8"',
    '$env:NO_COLOR = "1"',
    '$env:FORCE_COLOR = "0"',
    '$env:CI = "1"',
    "Set-Location -LiteralPath '$escapedWorkdir'",
    $Command
  )
  [System.IO.File]::WriteAllText($scriptPath, ($scriptLines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.Encoding]::Unicode)

  Write-Status "=== $Label ===" "Cyan"
  $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $processInfo.FileName = "powershell"
  $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
  $processInfo.WorkingDirectory = $Workdir
  $processInfo.UseShellExecute = $false
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $processInfo.CreateNoWindow = $true

  $startedAt = Get-Date
  $process = [System.Diagnostics.Process]::Start($processInfo)
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $timedOut = $false
  $timeoutMs = [Math]::Max(1, $TimeoutSeconds) * 1000
  if (-not $process.WaitForExit($timeoutMs)) {
    $timedOut = $true
    try {
      taskkill.exe /PID $process.Id /T /F | Out-Null
    } catch {
      try { $process.Kill() } catch {}
    }
    try { [void]$process.WaitForExit(5000) } catch {}
  }
  [void]$stdoutTask.Wait(5000)
  [void]$stderrTask.Wait(5000)
  $exitCode = if ($timedOut) { 124 } else { [int]$process.ExitCode }
  $stdout = if ($stdoutTask.IsCompleted) { [string]$stdoutTask.Result } else { "`n[platform-audit] stdout read timed out after process termination.`n" }
  $stderr = if ($stderrTask.IsCompleted) { [string]$stderrTask.Result } else { "`n[platform-audit] stderr read timed out after process termination.`n" }
  if ($timedOut) {
    $stderr = $stderr + "`n[platform-audit] command timed out after $TimeoutSeconds seconds; process tree was terminated. script=$scriptPath`n"
  }
  $seconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
  $process.Dispose()

  [System.IO.File]::WriteAllText($stdoutPath, $stdout, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($stderrPath, $stderr, [System.Text.UTF8Encoding]::new($false))
  $output = @($stdout, $stderr) -join [Environment]::NewLine

  Set-Content -Path $latestLog -Value $output -Encoding UTF8
  Set-Content -Path $historyLog -Value $output -Encoding UTF8

  return [pscustomobject]@{
    label = $Label
    log = $latestLog
    exitCode = $exitCode
    seconds = $seconds
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
  $auditPassStartedAt = Get-Date
  Clear-AuditRuntimeProcesses -Since ((Get-Date).AddHours(-2)) -Reason "platform audit startup existing node cleanup" -ProcessNames @("node")
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
      timeoutSeconds = 360
    },
    @{
      key = "rc"
      label = "RC audit"
      workdir = $rcDir
      command = "& '$rcAuditScript' -Quiet"
      statusPath = (Join-Path $rcDir "output\audit\audit-status.json")
      summaryPath = (Join-Path $rcDir "output\audit\audit-summary.md")
      timeoutSeconds = 600
    },
    @{
      key = "core"
      label = "Structural core audit"
      workdir = $coreDir
      command = "& '$coreAuditScript' -Quiet"
      statusPath = (Join-Path $coreDir "output\audit\audit-status.json")
      summaryPath = (Join-Path $coreDir "output\audit\audit-summary.md")
      timeoutSeconds = 240
    }
  )

  $records = New-Object System.Collections.Generic.List[object]
  $summaryLines = New-Object System.Collections.Generic.List[string]
  $failures = New-Object System.Collections.Generic.List[string]

  foreach ($job in $jobs) {
    if ($records.Count -gt 0) {
      Write-Status "Cooling down 8s before next platform audit module..." "DarkGray"
      Start-Sleep -Seconds 8
    }
    $jobTimeoutSeconds = if ($job.ContainsKey('timeoutSeconds')) { [int]$job.timeoutSeconds } else { 300 }
    $record = Invoke-Audit -Label $job.label -Workdir $job.workdir -Command $job.command -RunDir $runDir -TimeoutSeconds $jobTimeoutSeconds
    $auditRetryCount = 0
    while ($record.exitCode -ne 0 -and $auditRetryCount -lt 2 -and (Test-AuditTransientRuntimeFailure -LogPath ([string]$record.log))) {
      $auditRetryCount += 1
      Clear-AuditRuntimeProcesses -Since $auditPassStartedAt -Reason "transient failure in $($job.key)"
      Write-Status "Retrying $($job.key) audit after transient runtime failure ($auditRetryCount/2)..." "DarkGray"
      Start-Sleep -Seconds 60
      $record = Invoke-Audit -Label $job.label -Workdir $job.workdir -Command $job.command -RunDir $runDir -TimeoutSeconds $jobTimeoutSeconds
    }
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
