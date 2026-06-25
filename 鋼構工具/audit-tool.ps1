param(
  [switch]$Quiet,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [int]$MaxRuns = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPort = 8123
$baseUrl = "http://127.0.0.1:$serverPort"
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
      $lockingPid = [int]$lockInfo.pid
      $lockingProcess = Get-Process -Id $lockingPid -ErrorAction SilentlyContinue
      if ($lockingProcess) {
        throw "Another audit run is already active (PID $lockingPid)."
      }
    } catch {
      if ($_.Exception.Message -like "Another audit run is already active*") {
        throw
      }
    }
    Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
  }

  $lockPayload = [ordered]@{
    pid = $PID
    startedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    quiet = [bool]$Quiet
    loop = [bool]$Loop
  }
  $lockPayload | ConvertTo-Json -Depth 3 | Set-Content -Path $lockPath -Encoding UTF8
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

function Ensure-Server {
  try {
    $response = Invoke-WebRequest -Uri "$baseUrl/index.html" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      Write-Status "HTTP server already available at $baseUrl" "DarkGreen"
      return $null
    }
  } catch {
    # start a new server below
  }

  Write-Status "Starting local HTTP server at $baseUrl" "DarkYellow"
  $process = Start-Process -FilePath python -ArgumentList "-m", "http.server", "$serverPort" -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -Uri "$baseUrl/index.html" -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -ne 200) {
    throw "Unable to start local server."
  }
  return $process
}

function Invoke-BrowserAuditRunner {
  param([string]$RunDir)

  $runnerPath = Join-Path $root "steel-audit-browser-runner.js"
  if (-not (Test-Path -LiteralPath $runnerPath)) {
    throw "Missing steel browser audit runner: $runnerPath"
  }

  $runnerSummaryPath = Join-Path $RunDir "steel-browser-runner-summary.json"
  $runnerArgs = @(
    $runnerPath,
    "--base-url", $baseUrl,
    "--output-dir", $auditOutputDir,
    "--history-dir", $RunDir,
    "--summary-json", $runnerSummaryPath
  )
  if ($Quiet) {
    $runnerArgs += "--quiet"
  }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runnerOutput = & node @runnerArgs 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  foreach ($line in @($runnerOutput)) {
    Write-Status ([string]$line) "DarkGray"
  }

  if (-not (Test-Path -LiteralPath $runnerSummaryPath)) {
    $details = (@($runnerOutput) | ForEach-Object { [string]$_ }) -join "`n"
    throw "Steel browser audit runner did not write summary JSON. exitCode=$exitCode`n$details"
  }

  $runnerSummary = Get-Content -LiteralPath $runnerSummaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($line in @($runnerSummary.summaryLines)) {
    $summaryLines.Add([string]$line)
  }
  foreach ($record in @($runnerSummary.records)) {
    $auditRecords.Add($record)
  }
  foreach ($failure in @($runnerSummary.failures)) {
    $auditFailures.Add([string]$failure)
  }

  if ($exitCode -ne 0) {
    $details = (@($runnerOutput) | ForEach-Object { [string]$_ }) -join "`n"
    throw "Steel browser audit runner failed. exitCode=$exitCode`n$details"
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
    "# Audit Summary"
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
    lastSummary = $summaryPath
    lastHistorySummary = $historySummaryPath
  }
  $statusPayload | ConvertTo-Json -Depth 4 | Set-Content -Path $statusPath -Encoding UTF8

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

  try {

  Invoke-Step "Node syntax check: app.js" {
    node --check "$root\app.js"
  }

  Invoke-Step "Node syntax check: calculator.js" {
    node --check "$root\calculator.js"
  }

  Invoke-Step "Smoke test" {
    node "$root\calculator.smoke-test.js"
    $summaryLines.Add("- smoke-test: pass")
    $auditRecords.Add([pscustomobject]@{
      label = "smoke-test"
      status = "pass"
    })
  }

  Invoke-Step "Steel formal regression test" {
    node "$root\steel-formal.regression-test.js"
    $summaryLines.Add("- steel-formal-regression-test: pass")
    $auditRecords.Add([pscustomobject]@{
      label = "steel-formal-regression-test"
      status = "pass"
    })
  }

  Invoke-Step "Steel traceability catalog contract" {
    node "$root\steel-traceability.contract.test.js"
    $summaryLines.Add("- steel-traceability-contract: pass")
    $auditRecords.Add([pscustomobject]@{
      label = "steel-traceability-contract"
      status = "pass"
    })
  }

  Invoke-Step "Formal core sync check" {
    & "$root\sync-formal-core.ps1" -Check -Quiet:$Quiet
    $summaryLines.Add("- formal-core-sync-check: pass")
    $manifestPath = Join-Path $root "core\formal-core-manifest.json"
    if (Test-Path $manifestPath) {
      $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
      $summaryLines.Add("- formal-core-manifest: $manifestPath")
      $summaryLines.Add("  generatedAt=$($manifest.generatedAt)")
      $summaryLines.Add("  files=$((@($manifest.files).Count))")
      $auditRecords.Add([pscustomobject]@{
        label = "formal-core-manifest"
        path = $manifestPath
        generatedAt = $manifest.generatedAt
        fileCount = @($manifest.files).Count
      })
    }
    $auditRecords.Add([pscustomobject]@{
      label = "formal-core-sync-check"
      status = "pass"
    })
  }

  Invoke-Step "Edge CDP browser audit" {
    Invoke-BrowserAuditRunner -RunDir $runDir
  }
  } catch {
    $auditFailures.Add("audit-aborted: $($_.Exception.Message)")
  }

  $paths = Save-AuditOutputs -RunDir $runDir -RunStamp $runStamp
  $result = [pscustomobject]@{
    runId = $runStamp
    pass = ($auditFailures.Count -eq 0)
    failureCount = $auditFailures.Count
    failures = @($auditFailures.ToArray())
    summaryPath = $paths.SummaryPath
    summaryJsonPath = $paths.SummaryJsonPath
    statusPath = $paths.StatusPath
    historySummaryPath = $paths.HistorySummaryPath
  }
  return $result
}

$spawnedServer = $null
$runIndex = 0

try {
  Acquire-AuditLock
  $spawnedServer = Ensure-Server

  do {
    $runIndex += 1
    $result = Run-AuditPass

    if ($result.pass) {
      Write-Status ""
      Write-Status "Audit pass #$runIndex completed cleanly. runId=$($result.runId)" "Green" -Force
      Write-Status "Summary: $($result.summaryPath)" "DarkGreen" -Force
    } else {
      Write-Status ""
      Write-Status "Audit pass #$runIndex found issues. runId=$($result.runId)" "Red" -Force
      Write-Status ("Failures: " + ($result.failures -join "; ")) "Red" -Force
      throw ("Audit found issues: " + ($result.failures -join "; "))
    }

    if ($Loop) {
      if ($MaxRuns -gt 0 -and $runIndex -ge $MaxRuns) {
        break
      }
      Write-Status "Sleeping ${IntervalSeconds}s before next audit pass..." "DarkGray"
      Start-Sleep -Seconds $IntervalSeconds
    }
  } while ($Loop)
} finally {
  if ($spawnedServer -and -not $spawnedServer.HasExited) {
    Stop-Process -Id $spawnedServer.Id -Force
  }
  Release-AuditLock
}
