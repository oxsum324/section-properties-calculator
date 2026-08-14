[CmdletBinding()]
param(
  [ValidateSet('Install', 'Status', 'Remove', 'Run')]
  [string]$Action = 'Status',
  [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')]
  [string]$DailyAt = '09:00'
)

$ErrorActionPreference = 'Stop'
$taskName = 'StructuralTools-PublicReleaseDecisionBackupHealth'
$runner = Join-Path $PSScriptRoot 'run-public-release-decision-backup-health.ps1'
$shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell.exe -ErrorAction Stop).Source }
$expectedArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""

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
  $dailyTrigger = $trigger -and [string]$trigger.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger'
  $timeMatches = $dailyTrigger -and ([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $DailyAt
  $principalMatches = $taskSid -eq $currentSid -and [string]$Task.Principal.LogonType -eq 'Interactive' -and [string]$Task.Principal.RunLevel -eq 'Limited'
  $settingsMatch = [bool]$Task.Settings.StartWhenAvailable -and [string]$Task.Settings.MultipleInstances -eq 'IgnoreNew'
  return [bool]($executeMatches -and $argumentMatches -and $dailyTrigger -and $timeMatches -and $principalMatches -and $settingsMatch -and $Task.State -ne 'Disabled')
}

function Write-TaskStatus {
  param([object]$Task)
  $info = if ($Task) { Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue } else { $null }
  $hasRun = [bool]($info -and [int64]$info.LastTaskResult -ne 267011 -and $info.LastRunTime -ge [datetime]'2000-01-01')
  [pscustomobject]@{
    schemaVersion = 1
    kind = 'public-release-decision-backup-health-task-status'
    installed = [bool]$Task
    configurationValid = Test-ManagedTaskConfiguration -Task $Task
    state = if ($Task) { [string]$Task.State } else { 'Missing' }
    dailyAt = $DailyAt
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
  if ($LASTEXITCODE -ne 0) { throw 'Initial external backup health verification failed; scheduled task was not installed.' }
  $startAt = [datetime]::Today.Add([timespan]::ParseExact($DailyAt, 'hh\:mm', [Globalization.CultureInfo]::InvariantCulture))
  $taskAction = New-ScheduledTaskAction -Execute $shell -Argument $expectedArguments
  $trigger = New-ScheduledTaskTrigger -Daily -At $startAt
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -Description 'Validates private release decision backup mirrors, chained restore drill history, and drill freshness without publishing private details.' -Force | Out-Null
}

$task = Get-ManagedTask
Write-TaskStatus -Task $task
if (-not $task -or -not (Test-ManagedTaskConfiguration -Task $task)) { exit 1 }
exit 0
