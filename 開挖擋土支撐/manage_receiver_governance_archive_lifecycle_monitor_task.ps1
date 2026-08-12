param(
  [ValidateSet("Install", "Preview", "Status", "Remove")]
  [string]$Mode = "Status",
  [string]$TaskName = "GSC lifecycle portfolio daily monitor",
  [string]$SourceRoot,
  [string]$StateDirectory,
  [ValidatePattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")]
  [string]$DailyAt = "09:00",
  [ValidateRange(0, 366)]
  [int]$UpcomingDays = 30,
  [ValidateRange(1, 12)]
  [int]$MaxDepth = 12,
  [ValidateRange(1, 8784)]
  [int]$MaxAgeHours = 36,
  [string]$OpenSslPath,
  [switch]$NoAlert
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$monitorScript = Join-Path $root "receiver_governance_archive_lifecycle_monitor.ps1"
$powershellExecutable = (Get-Command powershell.exe -CommandType Application -ErrorAction Stop).Source
$taskDescription = "Read-only complete GSC lifecycle portfolio revalidation. Local governance only; not an engineering approval or formal attachment."
$initialMonitorExitCode = $null
$initialMonitorAttentionStatus = $null
$initialMonitorNotificationKind = $null
$previewTask = $null

if ([string]::IsNullOrWhiteSpace($TaskName)) { throw "TaskName must not be blank." }

function Quote-TaskArgument([string]$Value) {
  if ($Value.Contains('"')) { throw "Task arguments cannot contain a double quote." }
  return '"' + $Value + '"'
}

function Test-PathInside([string]$Parent, [string]$Candidate) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $candidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd('\') + '\'
  return $candidateFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)
}

function Get-TaskSnapshot {
  param($Task, $Info, [bool]$ActionMatches, [bool]$ScheduleMatches)
  return [ordered]@{
    schemaVersion = 1
    kind = "governance-external-archive-lifecycle-monitor-task-status"
    taskName = $TaskName
    installed = $null -ne $Task
    state = if ($Task) { [string]$Task.State } else { "NotInstalled" }
    enabled = if ($Task) { [string]$Task.State -ne "Disabled" } else { $false }
    actionMatchesCurrentTool = if ($Task) { $ActionMatches } else { $false }
    scheduleMatchesMonitorPolicy = if ($Task) { $ScheduleMatches } else { $false }
    configurationMatchesCurrentTool = if ($Task) { $ActionMatches -and $ScheduleMatches } else { $false }
    lastRunTime = if ($Info -and $Info.LastRunTime -gt [datetime]::MinValue) { $Info.LastRunTime.ToString("o") } else { $null }
    lastTaskResult = if ($Info) { $Info.LastTaskResult } else { $null }
    nextRunTime = if ($Info -and $Info.NextRunTime -gt [datetime]::MinValue) { $Info.NextRunTime.ToString("o") } else { $null }
    missedRunCount = if ($Info) { $Info.NumberOfMissedRuns } else { $null }
    boundary = [ordered]@{
      localOnly = $true
      sourceScanReadOnly = $true
      formalCalculationAttachment = $false
      pagesPublication = $false
    }
  }
}

if ($Mode -in @("Install", "Preview")) {
  if (-not $SourceRoot -or -not (Test-Path -LiteralPath $SourceRoot -PathType Container)) { throw "$Mode requires an existing SourceRoot." }
  if (-not $StateDirectory) { throw "$Mode requires StateDirectory." }
  if (-not (Test-Path -LiteralPath $StateDirectory -PathType Container)) { throw "StateDirectory must be a directory." }
  $sourceItem = Get-Item -LiteralPath $SourceRoot -Force
  $stateItem = Get-Item -LiteralPath $StateDirectory -Force
  if (($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($stateItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "SourceRoot and StateDirectory must be physical directories, not reparse points." }
  $SourceRoot = $sourceItem.FullName
  $StateDirectory = $stateItem.FullName
  $toolRepository = Split-Path -Parent $root
  if ((Test-PathInside $SourceRoot $StateDirectory) -or (Test-PathInside $StateDirectory $SourceRoot)) { throw "StateDirectory must be completely separate from SourceRoot." }
  if (Test-PathInside $toolRepository $StateDirectory) { throw "StateDirectory must not be inside the tool repository." }

  $runArgs = @(
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", (Quote-TaskArgument $monitorScript),
    "-Mode", "Run",
    "-SourceRoot", (Quote-TaskArgument ([IO.Path]::GetFullPath($SourceRoot))),
    "-StateDirectory", (Quote-TaskArgument ([IO.Path]::GetFullPath($StateDirectory))),
    "-UpcomingDays", "$UpcomingDays",
    "-MaxDepth", "$MaxDepth"
  )
  if ($OpenSslPath) { $runArgs += @("-OpenSslPath", (Quote-TaskArgument ([IO.Path]::GetFullPath($OpenSslPath)))) }
  if (-not $NoAlert) { $runArgs += "-ShowAlert" }
  $argumentText = $runArgs -join " "

  if ($Mode -eq "Install") {
    $initialArguments = @(
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", $monitorScript,
      "-Mode", "Run",
      "-SourceRoot", $SourceRoot,
      "-StateDirectory", $StateDirectory,
      "-UpcomingDays", "$UpcomingDays",
      "-MaxDepth", "$MaxDepth"
    )
    if ($OpenSslPath) { $initialArguments += @("-OpenSslPath", $OpenSslPath) }
    if (-not $NoAlert) { $initialArguments += "-ShowAlert" }
    $initialOutput = @(& $powershellExecutable @initialArguments 2>&1)
    $initialExitCode = $LASTEXITCODE
    $initialText = ($initialOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
    if ($initialExitCode -notin @(0, 2, 3)) { throw "Initial lifecycle monitor run failed; the task was not installed. $initialText" }
    try {
      $initialResult = $initialText | ConvertFrom-Json
    } catch {
      throw "Initial lifecycle monitor returned unreadable JSON; the task was not installed."
    }
    $initialMonitorExitCode = $initialExitCode
    $initialMonitorAttentionStatus = [string]$initialResult.attentionStatus
    $initialMonitorNotificationKind = [string]$initialResult.notification.kind
  }

  $today = Get-Date
  $parts = $DailyAt.Split(':')
  $at = Get-Date -Year $today.Year -Month $today.Month -Day $today.Day -Hour ([int]$parts[0]) -Minute ([int]$parts[1]) -Second 0
  $action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $argumentText -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -Daily -At $at
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $taskDescription
  if ($Mode -eq "Install") {
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
  } else {
    $previewTask = $task
  }
}

if ($Mode -eq "Remove") {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
}

$taskObject = if ($Mode -eq "Preview") { $previewTask } else { Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
$taskInfo = if ($taskObject -and $Mode -ne "Preview") { Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop } else { $null }
$expectedScript = [IO.Path]::GetFullPath($monitorScript)
$expectedPowerShell = [IO.Path]::GetFullPath($powershellExecutable)
$actionMatches = $false
$scheduleMatches = $false
$taskArgumentText = $null
$configuredSourceRoot = $null
$configuredStateDirectory = $null
if ($taskObject -and @($taskObject.Actions).Count -eq 1) {
  $taskAction = @($taskObject.Actions)[0]
  $taskArgumentText = [string]$taskAction.Arguments
  $workingDirectoryMatches = $false
  try { $workingDirectoryMatches = [IO.Path]::GetFullPath([string]$taskAction.WorkingDirectory) -eq [IO.Path]::GetFullPath($root) } catch { $workingDirectoryMatches = $false }
  $executableMatches = $false
  try { $executableMatches = [IO.Path]::GetFullPath([string]$taskAction.Execute) -eq $expectedPowerShell } catch { $executableMatches = $false }
  $fileArgumentPattern = '(?i)(?:^|\s)-File\s+"' + [regex]::Escape($expectedScript) + '"(?:\s|$)'
  $sourceMatch = [regex]::Match($taskArgumentText, '(?i)(?:^|\s)-SourceRoot\s+"(?<source>[^"]+)"')
  $stateMatch = [regex]::Match($taskArgumentText, '(?i)(?:^|\s)-StateDirectory\s+"(?<state>[^"]+)"')
  $pathPolicyMatches = $false
  if ($sourceMatch.Success -and $stateMatch.Success) {
    $configuredSourceRoot = $sourceMatch.Groups['source'].Value
    $configuredStateDirectory = $stateMatch.Groups['state'].Value
    try {
      $configuredSourceItem = Get-Item -LiteralPath $configuredSourceRoot -Force -ErrorAction Stop
      $configuredStateItem = Get-Item -LiteralPath $configuredStateDirectory -Force -ErrorAction Stop
      $configuredPhysical = `
        $configuredSourceItem.PSIsContainer -and $configuredStateItem.PSIsContainer -and `
        ($configuredSourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and `
        ($configuredStateItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0
      $configuredSeparated = `
        -not (Test-PathInside $configuredSourceItem.FullName $configuredStateItem.FullName) -and `
        -not (Test-PathInside $configuredStateItem.FullName $configuredSourceItem.FullName) -and `
        -not (Test-PathInside (Split-Path -Parent $root) $configuredStateItem.FullName)
      $pathPolicyMatches = $configuredPhysical -and $configuredSeparated
    } catch {
      $pathPolicyMatches = $false
    }
  }
  $actionMatches = `
    $executableMatches -and `
    $taskArgumentText -match $fileArgumentPattern -and `
    $taskArgumentText -match '(?i)(?:^|\s)-Mode\s+Run(?:\s|$)' -and `
    $sourceMatch.Success -and $stateMatch.Success -and $pathPolicyMatches -and `
    $workingDirectoryMatches
}
if ($taskObject -and @($taskObject.Triggers).Count -eq 1) {
  $taskTrigger = @($taskObject.Triggers)[0]
  $scheduleMatches = `
    $taskTrigger.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' -and `
    $taskTrigger.Enabled -eq $true -and `
    $taskTrigger.DaysInterval -eq 1 -and `
    $taskObject.Settings.StartWhenAvailable -eq $true -and `
    [string]$taskObject.Settings.MultipleInstances -eq 'IgnoreNew' -and `
    [string]$taskObject.Settings.ExecutionTimeLimit -eq 'PT2H' -and `
    [string]$taskObject.Principal.LogonType -eq 'Interactive' -and `
    [string]$taskObject.Principal.RunLevel -eq 'Limited'
}
$snapshot = Get-TaskSnapshot -Task $taskObject -Info $taskInfo -ActionMatches $actionMatches -ScheduleMatches $scheduleMatches
if ($Mode -eq "Install") {
  $snapshot["initialMonitorExitCode"] = $initialMonitorExitCode
  $snapshot["initialMonitorAttentionStatus"] = $initialMonitorAttentionStatus
  $snapshot["initialMonitorNotificationKind"] = $initialMonitorNotificationKind
}
if ($Mode -eq "Preview") {
  $snapshot["preview"] = $true
  $snapshot["installed"] = $false
  $snapshot["state"] = "Preview"
}

$expectedStateDirectoryMatches = $true
if ($Mode -eq "Status" -and $StateDirectory) {
  try { $expectedStateDirectoryMatches = [IO.Path]::GetFullPath($StateDirectory) -eq [IO.Path]::GetFullPath($configuredStateDirectory) } catch { $expectedStateDirectoryMatches = $false }
  $snapshot["expectedStateDirectoryMatches"] = $expectedStateDirectoryMatches
}
$effectiveStateDirectory = $configuredStateDirectory
if ($Mode -eq "Status" -and $taskObject -and $effectiveStateDirectory) {
  try {
    $verifyOutput = @(& $powershellExecutable -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $monitorScript -Mode VerifyState -StateDirectory $effectiveStateDirectory -MaxAgeHours $MaxAgeHours 2>&1)
    $snapshot["monitorStateExitCode"] = $LASTEXITCODE
    $verifyText = ($verifyOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
    try { $snapshot["monitorStateResult"] = $verifyText | ConvertFrom-Json } catch { $snapshot["monitorStateResult"] = $null }
  } catch {
    $snapshot["monitorStateExitCode"] = 1
    $snapshot["monitorStateResult"] = $null
  }
}

$snapshot | ConvertTo-Json -Depth 5
if ($Mode -eq "Status") {
  $knownTaskResult = -not $taskInfo -or $taskInfo.LastRunTime -le [datetime]::MinValue -or $taskInfo.LastTaskResult -in @(0, 2, 3)
  $knownMonitorState = -not $taskObject -or ($snapshot.Contains('monitorStateExitCode') -and $snapshot.monitorStateExitCode -eq 0)
  if (-not $taskObject -or -not $snapshot.enabled -or -not $snapshot.configurationMatchesCurrentTool -or -not $expectedStateDirectoryMatches -or -not $knownTaskResult -or -not $knownMonitorState) { exit 3 }
}
exit 0
