[CmdletBinding()]
param(
  [ValidateSet('Install', 'Status', 'Remove', 'Run')]
  [string]$Action = 'Status',
  [ValidateSet('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')]
  [string]$WeeklyDay = 'Sunday',
  [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')]
  [string]$WeeklyAt = '09:15'
)

$ErrorActionPreference = 'Stop'
$taskName = 'StructuralTools-PublicReleaseDecisionRestoreDrill'
$runner = Join-Path $PSScriptRoot 'run-public-release-decision-restore-drill.ps1'
$shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell.exe -ErrorAction Stop).Source }
$expectedArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
$dayMasks = @{ Sunday = 1; Monday = 2; Tuesday = 4; Wednesday = 8; Thursday = 16; Friday = 32; Saturday = 64 }

function Get-ManagedTask {
  Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

function Test-ManagedTaskConfiguration {
  param([object]$Task)
  if (-not $Task) { return $false }
  $actions = @($Task.Actions)
  $triggers = @($Task.Triggers)
  if ($actions.Count -ne 1 -or $triggers.Count -ne 1) { return $false }
  $taskAction = $actions[0]
  $trigger = $triggers[0]
  try {
    $executeMatches = [System.IO.Path]::GetFullPath([string]$taskAction.Execute) -eq [System.IO.Path]::GetFullPath($shell)
    $taskSid = ([Security.Principal.NTAccount]::new([string]$Task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  } catch {
    return $false
  }
  $argumentMatches = [string]$taskAction.Arguments -eq $expectedArguments
  $weeklyTrigger = $trigger -and [string]$trigger.CimClass.CimClassName -eq 'MSFT_TaskWeeklyTrigger'
  $timeMatches = $weeklyTrigger -and ([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $WeeklyAt
  $dayMatches = $weeklyTrigger -and [int]$trigger.DaysOfWeek -eq [int]$dayMasks[$WeeklyDay]
  $intervalMatches = $weeklyTrigger -and [int]$trigger.WeeksInterval -eq 1
  $principalMatches = $taskSid -eq $currentSid -and [string]$Task.Principal.LogonType -eq 'Interactive' -and [string]$Task.Principal.RunLevel -eq 'Limited'
  $settingsMatch = [bool]$Task.Settings.StartWhenAvailable -and [string]$Task.Settings.MultipleInstances -eq 'IgnoreNew'
  return [bool]($executeMatches -and $argumentMatches -and $weeklyTrigger -and $timeMatches -and $dayMatches -and $intervalMatches -and $principalMatches -and $settingsMatch -and $Task.State -ne 'Disabled')
}

function Write-TaskStatus {
  param([object]$Task)
  $info = if ($Task) { Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue } else { $null }
  $hasRun = [bool]($info -and [int64]$info.LastTaskResult -ne 267011 -and $info.LastRunTime -ge [datetime]'2000-01-01')
  [pscustomobject]@{
    schemaVersion = 1
    kind = 'public-release-decision-restore-drill-task-status'
    installed = [bool]$Task
    configurationValid = Test-ManagedTaskConfiguration -Task $Task
    state = if ($Task) { [string]$Task.State } else { 'Missing' }
    weeklyDay = $WeeklyDay
    weeklyAt = $WeeklyAt
    lastTaskResult = if ($hasRun) { [int64]$info.LastTaskResult } else { $null }
    lastRunTime = if ($hasRun) { $info.LastRunTime.ToString('o') } else { '' }
    nextRunTime = if ($info -and $info.NextRunTime -gt [datetime]::MinValue) { $info.NextRunTime.ToString('o') } else { '' }
  } | ConvertTo-Json -Depth 4
}

if ($Action -eq 'Run') {
  & $runner
  exit $LASTEXITCODE
}

if ($Action -eq 'Remove') {
  $existing = Get-ManagedTask
  if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-TaskStatus -Task (Get-ManagedTask)
  exit 0
}

if ($Action -eq 'Install') {
  & $runner | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Initial isolated external restore drill failed; scheduled task was not installed.' }
  $startAt = [datetime]::Today.Add([timespan]::ParseExact($WeeklyAt, 'hh\:mm', [Globalization.CultureInfo]::InvariantCulture))
  $taskAction = New-ScheduledTaskAction -Execute $shell -Argument $expectedArguments
  $trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek $WeeklyDay -At $startAt
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -Description 'Runs an isolated private restore drill, records its receipt, and verifies the current provider-confirmed cloud checkpoint.' -Force | Out-Null
}

$task = Get-ManagedTask
Write-TaskStatus -Task $task
if (-not $task -or -not (Test-ManagedTaskConfiguration -Task $task)) { exit 1 }
exit 0
