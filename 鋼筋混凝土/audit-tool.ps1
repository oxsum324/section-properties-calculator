param(
  [switch]$Quiet,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [int]$MaxRuns = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsDir = Join-Path $root "tools"
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

  if ($Quiet -and -not $Force) {
    return
  }
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
        throw "Another RC audit run is already active (PID $($lockInfo.pid))."
      }
    } catch {
      if ($_.Exception.Message -like "Another RC audit run is already active*") {
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
    [string]$Workdir,
    [string]$RunDir,
    [int]$TimeoutSeconds = 300
  )

  $safeLabel = ($Label -replace '[^A-Za-z0-9\-]+', '-').Trim('-').ToLowerInvariant()
  if (-not $safeLabel) {
    $safeLabel = "step"
  }

  if (-not (Test-Path -LiteralPath $Workdir)) {
    throw "missing audit workdir: $Workdir"
  }

  $logName = "$safeLabel.txt"
  $latestLog = Join-Path $auditOutputDir $logName
  $historyLog = Join-Path $RunDir $logName
  $stdoutPath = Join-Path $RunDir "$safeLabel.stdout.txt"
  $stderrPath = Join-Path $RunDir "$safeLabel.stderr.txt"
  $scriptPath = Join-Path $RunDir "$safeLabel.ps1"

  Invoke-Step $Label {
    $escapedWorkdir = $Workdir.Replace("'", "''")
    $scriptLines = @(
      '$ErrorActionPreference = "Stop"'
      '$utf8NoBom = [System.Text.UTF8Encoding]::new($false)'
      '[Console]::InputEncoding = $utf8NoBom'
      '[Console]::OutputEncoding = $utf8NoBom'
      '$OutputEncoding = $utf8NoBom'
      '$env:PYTHONUTF8 = "1"'
      '$env:PYTHONIOENCODING = "utf-8"'
      '$env:NO_COLOR = "1"'
      '$env:FORCE_COLOR = "0"'
      '$env:CI = "1"'
      "Set-Location -LiteralPath '$escapedWorkdir'",
      $Command
    )
    [System.IO.File]::WriteAllText($scriptPath, ($scriptLines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.Encoding]::Unicode)

    $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = "powershell"
    $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    $processInfo.WorkingDirectory = $Workdir
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true

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
    $exitCode = if ($timedOut) { 124 } else { $process.ExitCode }
    $stdout = if ($stdoutTask.IsCompleted) { [string]$stdoutTask.Result } else { "`n[rc-audit] stdout read timed out after process termination.`n" }
    $stderr = if ($stderrTask.IsCompleted) { [string]$stderrTask.Result } else { "`n[rc-audit] stderr read timed out after process termination.`n" }
    if ($timedOut) {
      $stderr = $stderr + "`n[rc-audit] command timed out after $TimeoutSeconds seconds; process tree was terminated. script=$scriptPath`n"
    }
    $process.Dispose()

    [System.IO.File]::WriteAllText($stdoutPath, $stdout, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($stderrPath, $stderr, [System.Text.UTF8Encoding]::new($false))
    $output = @($stdout, $stderr) -join [Environment]::NewLine
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
    "# RC Audit Summary"
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
    modules = @("beam", "column", "slab", "wall", "shear-wall", "foundation", "single-pile")
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
    @{ Label = "Shared common helper unit tests"; Command = "Set-Location '$root'; node '.\shared\common.test.js'"; Workdir = $root },
    @{ Label = "RC traceability catalog contract"; Command = "Set-Location '$toolsDir'; node '.\rc-traceability.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Audit status metadata contract"; Command = "Set-Location '$toolsDir'; node '.\audit-status.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "RC index menu browser smoke"; Command = "& '$toolsDir\test-rc-index-menu.ps1'"; Workdir = $toolsDir },
    @{ Label = "Beam report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\beam-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Beam regression and report visual smoke"; Command = "& '$toolsDir\test-beam.ps1'"; Workdir = $toolsDir },
    @{ Label = "Column report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\column-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Column regression and report visual smoke"; Command = "`$env:RC_TEST_PORT='8131'; & '$toolsDir\test-column.ps1'; Remove-Item Env:RC_TEST_PORT -ErrorAction SilentlyContinue"; Workdir = $toolsDir },
    @{ Label = "Slab report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\slab-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Slab regression and report visual smoke"; Command = "`$env:RC_TEST_PORT='8132'; & '$toolsDir\test-slab.ps1'; Remove-Item Env:RC_TEST_PORT -ErrorAction SilentlyContinue"; Workdir = $toolsDir },
    @{ Label = "Wall report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\wall-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Wall regression and report visual smoke"; Command = "& '$toolsDir\test-wall.ps1'"; Workdir = $toolsDir },
    @{ Label = "Shear wall suite"; Command = "& '$toolsDir\test-shear-wall.ps1'"; Workdir = $toolsDir },
    @{ Label = "Shear wall report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\shear-wall-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Shear wall report visual smoke"; Command = "& '$toolsDir\test-shear-wall-report.ps1'"; Workdir = $toolsDir },
    @{ Label = "Foundation report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\foundation-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Foundation regression and report visual smoke"; Command = "`$env:RC_TEST_PORT='8133'; & '$toolsDir\test-foundation.ps1'; Remove-Item Env:RC_TEST_PORT -ErrorAction SilentlyContinue"; Workdir = $toolsDir },
    @{ Label = "Single pile report visual smoke contract"; Command = "Set-Location '$toolsDir'; node '.\single-pile-report-visual.contract.test.js'"; Workdir = $toolsDir },
    @{ Label = "Single pile regression and report visual smoke"; Command = "`$env:RC_TEST_PORT='8134'; & '$toolsDir\test-single-pile.ps1'; Remove-Item Env:RC_TEST_PORT -ErrorAction SilentlyContinue"; Workdir = $toolsDir }
    @{ Label = "RC Retrofit report visual smoke"; Command = "& '$toolsDir\test-retrofit-report.ps1'"; Workdir = $toolsDir }
  )

  foreach ($item in $commands) {
    Invoke-AuditCommand -Label $item.Label -Command $item.Command -Workdir $item.Workdir -RunDir $runDir
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
      Write-Status "RC audit pass #$runIndex completed cleanly. runId=$($result.runId)" "Green" -Force
      Write-Status "Summary: $($result.summaryPath)" "DarkGreen" -Force
    } else {
      Write-Status ""
      Write-Status "RC audit pass #$runIndex found issues. runId=$($result.runId)" "Red" -Force
      Write-Status ("Failures: " + ($result.failures -join "; ")) "Red" -Force
      throw ("RC audit found issues: " + ($result.failures -join "; "))
    }

    if ($Loop) {
      if ($MaxRuns -gt 0 -and $runIndex -ge $MaxRuns) {
        break
      }
      Write-Status "Sleeping ${IntervalSeconds}s before next RC audit pass..." "DarkGray"
      Start-Sleep -Seconds $IntervalSeconds
    }
  } while ($Loop)
} finally {
  Release-AuditLock
}
