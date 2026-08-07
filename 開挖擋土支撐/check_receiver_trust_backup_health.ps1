param(
  [string]$BackupDirectory,
  [string]$BackupTaskName,
  [int]$MaxAgeDays = 8,
  [string]$DashboardStatusPath,
  [string]$DashboardHistoryPath,
  [switch]$ShowAlert
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"

function Select-BackupDirectory {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the RVR trust registry backup folder to check"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Folder selection was cancelled."
  }
  return $dialog.SelectedPath
}

function Show-HealthAlert([string]$Message) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup($Message, 120, "RVR backup requires attention", 48)
  } catch {
    Write-Warning "Unable to display the RVR backup alert: $($_.Exception.Message)"
  }
}

function Write-AtomicJsonFile([string]$Path, $Payload) {
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -Path $directory -ItemType Directory | Out-Null
  }
  $temporaryPath = "$Path.$PID.tmp"
  $Payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
  Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

if (-not $BackupDirectory) {
  $BackupDirectory = Select-BackupDirectory
}
if (-not $DashboardStatusPath) {
  $DashboardStatusPath = Join-Path (Split-Path -Parent $root) "output\audit\rvr-backup-health-status.json"
}
if (-not $DashboardHistoryPath) {
  $DashboardHistoryPath = Join-Path (Split-Path -Parent $root) "output\audit\rvr-backup-health-history.json"
}
if ($MaxAgeDays -le 0) {
  throw "MaxAgeDays must be greater than zero."
}
if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
  throw "RVR backup directory does not exist: $BackupDirectory"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install the backend requirements before checking RVR backup health."
}

$issues = [System.Collections.Generic.List[string]]::new()
$issueCodes = [System.Collections.Generic.List[string]]::new()
$evidence = $null
$taskStatus = $null

Push-Location $root
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $python.Source -m backend.backup_receiver_trust_registry health `
      --backup-dir $BackupDirectory --max-age-days $MaxAgeDays 2>&1 | Out-String
    $evidenceExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($evidenceExitCode -eq 0) {
    try {
      $evidence = $output | ConvertFrom-Json
    } catch {
      $issues.Add("The backup evidence check returned an unreadable result.")
      $issueCodes.Add("evidence-result-unreadable")
    }
  } else {
    $detail = ($output -replace '\s+', ' ').Trim()
    if ($detail -match ': error: (?<message>.+)$') {
      $detail = $Matches['message'].Trim()
    }
    $issues.Add("Backup or recovery-drill evidence failed validation: $detail")
    $issueCodes.Add("evidence-validation-failed")
  }
} finally {
  Pop-Location
}

if ($BackupTaskName) {
  try {
    $task = Get-ScheduledTask -TaskName $BackupTaskName -ErrorAction Stop
    $taskInfo = Get-ScheduledTaskInfo -TaskName $BackupTaskName -ErrorAction Stop
    $taskStatus = [ordered]@{
      taskName = $BackupTaskName
      state = [string]$task.State
      lastRunTime = if ($taskInfo.LastRunTime -gt [datetime]::MinValue) { $taskInfo.LastRunTime.ToString("o") } else { $null }
      lastTaskResult = $taskInfo.LastTaskResult
      nextRunTime = if ($taskInfo.NextRunTime -gt [datetime]::MinValue) { $taskInfo.NextRunTime.ToString("o") } else { $null }
      numberOfMissedRuns = $taskInfo.NumberOfMissedRuns
    }
    if ([string]$task.State -eq "Disabled") {
      $issues.Add("The weekly backup and recovery-drill task is disabled.")
      $issueCodes.Add("backup-task-disabled")
    }
    if ($taskInfo.LastRunTime -le [datetime]::MinValue) {
      $issues.Add("The weekly backup and recovery-drill task has no run history.")
      $issueCodes.Add("backup-task-no-history")
    } elseif ($taskInfo.LastTaskResult -ne 0) {
      $issues.Add("The weekly backup and recovery-drill task failed with code $($taskInfo.LastTaskResult).")
      $issueCodes.Add("backup-task-last-run-failed")
    }
  } catch {
    $issues.Add("The weekly backup task cannot be found or read: $BackupTaskName.")
    $issueCodes.Add("backup-task-unavailable")
  }
}

$healthy = $issues.Count -eq 0
$status = [ordered]@{
  schemaVersion = 1
  checkedAt = [datetimeoffset]::Now.ToString("o")
  status = if ($healthy) { "healthy" } else { "attention-required" }
  maxAgeDays = $MaxAgeDays
  backupDirectory = $BackupDirectory
  evidence = $evidence
  backupTask = $taskStatus
  issues = @($issues)
}
$statusPath = Join-Path $BackupDirectory "RVR-backup-health-latest.json"
Write-AtomicJsonFile -Path $statusPath -Payload $status

$dashboardStatus = [ordered]@{
  schemaVersion = 1
  kind = "rvr-backup-health-status"
  checkedAt = $status.checkedAt
  status = $status.status
  maxAgeDays = $MaxAgeDays
  issueCount = $issues.Count
  issueCodes = @($issueCodes)
  evidence = if ($evidence) {
    [ordered]@{
      status = $evidence.status
      backupAgeSeconds = $evidence.backupAgeSeconds
      receiptAgeSeconds = $evidence.receiptAgeSeconds
      productionRegistryUnchanged = $evidence.productionRegistryUnchanged
    }
  } else { $null }
  backupTask = if ($taskStatus) {
    [ordered]@{
      state = $taskStatus.state
      lastRunTime = $taskStatus.lastRunTime
      lastTaskResult = $taskStatus.lastTaskResult
      nextRunTime = $taskStatus.nextRunTime
      numberOfMissedRuns = $taskStatus.numberOfMissedRuns
    }
  } else { $null }
  privacy = [ordered]@{
    scope = "local-only"
    containsPaths = $false
    containsRegistryContent = $false
  }
}
try {
  Write-AtomicJsonFile -Path $DashboardStatusPath -Payload $dashboardStatus
} catch {
  Write-Warning "Unable to publish the local dashboard health summary: $($_.Exception.Message)"
}

Push-Location $root
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $historyOutput = & $python.Source -m backend.backup_receiver_trust_registry history `
      --current-status $DashboardStatusPath `
      --history-dir $BackupDirectory `
      --dashboard-history $DashboardHistoryPath `
      --max-items 24 2>&1 | Out-String
    $historyExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
} finally {
  Pop-Location
}

if ($historyExitCode -ne 0) {
  $detail = ($historyOutput -replace '\s+', ' ').Trim()
  if ($detail -match ': error: (?<message>.+)$') {
    $detail = $Matches['message'].Trim()
  }
  $issues.Add("The append-only health transition history could not be recorded: $detail")
  $issueCodes.Add("history-record-failed")
  $healthy = $false
  $status.status = "attention-required"
  $status.issues = @($issues)
  $dashboardStatus.status = "attention-required"
  $dashboardStatus.issueCount = $issues.Count
  $dashboardStatus.issueCodes = @($issueCodes)
  Write-AtomicJsonFile -Path $statusPath -Payload $status
  Write-AtomicJsonFile -Path $DashboardStatusPath -Payload $dashboardStatus
}

$json = $status | ConvertTo-Json -Depth 8
Write-Output $json
if (-not $healthy) {
  if ($ShowAlert) {
    Show-HealthAlert ((@("RVR trust registry backup requires attention:") + @($issues) + @("Status file: $statusPath")) -join [Environment]::NewLine)
  }
  exit 1
}
exit 0
