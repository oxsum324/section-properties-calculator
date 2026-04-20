param(
  [switch]$Quiet,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [int]$MaxRuns = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$playwrightWorkdir = $root
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

function Run-PlaywrightSnapshot {
  param(
    [string]$Url,
    [int]$Width,
    [int]$Height,
    [string]$Label,
    [string]$SetupCode = "",
    [string]$RunDir
  )

  Write-Status "Playwright snapshot [$Label] ${Width}x${Height}" "DarkCyan"
  npx --yes @playwright/cli open $Url | Out-Null
  npx --yes @playwright/cli resize $Width $Height | Out-Null
  if ($SetupCode) {
    npx --yes @playwright/cli run-code $SetupCode | Out-Null
  }
  $snapshot = npx --yes @playwright/cli snapshot
  if (-not ($snapshot -match "Page URL")) {
    throw "Playwright snapshot failed for $Label."
  }

  $snapshotName = "playwright-$Label.txt"
  $screenshotName = "playwright-$Label.png"
  $consoleName = "playwright-$Label-console.txt"
  $networkName = "playwright-$Label-network.txt"

  $snapshotPath = Join-Path $auditOutputDir $snapshotName
  $snapshotHistoryPath = Join-Path $RunDir $snapshotName
  $screenshotPath = Join-Path $auditOutputDir $screenshotName
  $screenshotHistoryPath = Join-Path $RunDir $screenshotName
  $consolePath = Join-Path $auditOutputDir $consoleName
  $consoleHistoryPath = Join-Path $RunDir $consoleName
  $networkPath = Join-Path $auditOutputDir $networkName
  $networkHistoryPath = Join-Path $RunDir $networkName

  Set-Content -Path $snapshotPath -Value $snapshot -Encoding UTF8
  Set-Content -Path $snapshotHistoryPath -Value $snapshot -Encoding UTF8
  npx --yes @playwright/cli screenshot --filename $screenshotPath --full-page | Out-Null
  Copy-Item -Path $screenshotPath -Destination $screenshotHistoryPath -Force

  $consoleOutput = npx --yes @playwright/cli console 2>&1
  $networkOutput = npx --yes @playwright/cli network 2>&1

  Set-Content -Path $consolePath -Value $consoleOutput -Encoding UTF8
  Set-Content -Path $consoleHistoryPath -Value $consoleOutput -Encoding UTF8
  Set-Content -Path $networkPath -Value $networkOutput -Encoding UTF8
  Set-Content -Path $networkHistoryPath -Value $networkOutput -Encoding UTF8

  $consoleJoined = ($consoleOutput -join "`n")
  $networkJoined = ($networkOutput -join "`n")
  $consoleErrors = if ($consoleJoined -match "Errors:\s*(\d+)") { [int]$matches[1] } else { 0 }
  $networkErrors = @($networkOutput | Where-Object { $_ -match "^\s*(GET|POST|PUT|PATCH|DELETE).*( 4\d\d | 5\d\d )" }).Count

  $summaryLines.Add("- ${Label}: snapshot=$snapshotPath")
  $summaryLines.Add("  screenshot=$screenshotPath")
  $summaryLines.Add("  console=$consolePath")
  $summaryLines.Add("  network=$networkPath")
  $summaryLines.Add("  consoleErrors=$consoleErrors, networkAlerts=$networkErrors")

  $auditRecords.Add([pscustomobject]@{
    label = $Label
    snapshot = $snapshotPath
    screenshot = $screenshotPath
    console = $consolePath
    network = $networkPath
    consoleErrors = $consoleErrors
    networkAlerts = $networkErrors
  })

  if ($consoleErrors -gt 0 -or $networkErrors -gt 0) {
    $auditFailures.Add("${Label}: consoleErrors=$consoleErrors, networkAlerts=$networkErrors")
  }

  npx --yes @playwright/cli close | Out-Null
}

function Run-PlaywrightScenario {
  param(
    [string]$ScenarioName,
    [string]$Url,
    [string]$RunDir,
    [string]$SetupCode = ""
  )

  $sizes = @(
    @{ Label = "desktop"; Width = 1440; Height = 1100 },
    @{ Label = "tablet"; Width = 834; Height = 1112 },
    @{ Label = "mobile"; Width = 390; Height = 844 }
  )

  foreach ($size in $sizes) {
    Invoke-Step "Playwright $ScenarioName $($size.Label) audit" {
      Run-PlaywrightSnapshot `
        -Url $Url `
        -Width $size.Width `
        -Height $size.Height `
        -Label "$ScenarioName-$($size.Label)" `
        -SetupCode $SetupCode `
        -RunDir $RunDir
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

  Push-Location $playwrightWorkdir
  try {
    $tensionScenarioCode = @"
await page.selectOption('select[name="connectionType"]', 'tension_member');
await page.dispatchEvent('select[name="connectionType"]', 'change');
await page.selectOption('#examplePresetSelect', 'tension_bolted_plate');
await page.click('#loadExampleBtn');
"@

    Run-PlaywrightScenario -ScenarioName "main-plate" -Url "$baseUrl/index.html" -RunDir $runDir
    Run-PlaywrightScenario -ScenarioName "main-tension" -Url "$baseUrl/index.html" -RunDir $runDir -SetupCode $tensionScenarioCode
    Run-PlaywrightScenario -ScenarioName "standalone-plate" -Url "$baseUrl/plate-check.html" -RunDir $runDir
    Run-PlaywrightScenario -ScenarioName "formal-beam" -Url "$baseUrl/steel-beam-formal.html" -RunDir $runDir
    Run-PlaywrightScenario -ScenarioName "formal-column" -Url "$baseUrl/steel-column-formal.html" -RunDir $runDir
  } finally {
    if ((Get-Location).Path -eq $playwrightWorkdir) {
      Pop-Location
    }
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
