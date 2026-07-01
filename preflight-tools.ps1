param(
  [switch]$Quiet,
  [switch]$Quick,
  [switch]$ForcePlatformAudit,
  [switch]$ForceSlowChecks
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $root "output\preflight"
$historyDir = Join-Path $outputDir "history"
$slowStatusDir = Join-Path $outputDir "slow-check-status"
$slowStatusMaxAgeHours = 24

if (-not (Test-Path $outputDir)) {
  New-Item -Path $outputDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $historyDir)) {
  New-Item -Path $historyDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $slowStatusDir)) {
  New-Item -Path $slowStatusDir -ItemType Directory | Out-Null
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
function Wait-PreflightRuntimeCooldown {
  param(
    [string]$Reason,
    [int]$Seconds = 8
  )

  if ($Seconds -le 0) { return }
  Write-Status "[preflight] runtime cooldown ${Seconds}s: $Reason" "DarkGray"
  Start-Sleep -Seconds $Seconds
}
function Test-PreflightTransientRuntimeFailure {
  param([string]$LogPath)

  if ([string]::IsNullOrWhiteSpace($LogPath) -or -not (Test-Path -LiteralPath $LogPath)) { return $false }
  $text = Get-Content -LiteralPath $LogPath -Raw -Encoding UTF8
  return ($text -match 'spawn(?:Sync)? .*EPERM|spawn EPERM|WinError 5|access is denied|Permission denied|browserType\.launch: spawn EPERM')
}

function Clear-PreflightRuntimeProcesses {
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
    Write-Status "[preflight] cleared runtime processes after ${Reason}: $($stopped -join ', ')" "DarkGray"
    Start-Sleep -Seconds 5
  }
}
function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value,
    [int]$Depth = 8
  )
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Get-TextFileLines {
  param([object]$Value)

  if ($null -eq $Value) {
    return @()
  }

  if ($Value -is [string]) {
    return @($Value)
  }

  if ($Value -is [System.Collections.IEnumerable]) {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in $Value) {
      foreach ($line in @(Get-TextFileLines $item)) {
        $lines.Add($line)
      }
    }
    return @($lines.ToArray())
  }

  return @([string]$Value)
}

function Write-TextFile {
  param(
    [string]$Path,
    [object]$Value
  )

  $text = (@(Get-TextFileLines $Value) -join [Environment]::NewLine) + [Environment]::NewLine
  [System.IO.File]::WriteAllText($Path, $text, [System.Text.UTF8Encoding]::new($false))
}
function Remove-PreflightAnsiEscape {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return $Text
  }

  return [regex]::Replace($Text, '\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-Z\\-_]', '')
}
function Get-ForbiddenLogGlyphCount {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return 0
  }

  $plainText = Remove-PreflightAnsiEscape $Text
  return [regex]::Matches($plainText, "[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\uE000-\uF8FF]").Count
}

function Repair-PreflightMojibake {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return $Text
  }

  $originalBadGlyphs = Get-ForbiddenLogGlyphCount $Text
  if ($originalBadGlyphs -eq 0) {
    return $Text
  }

  try {
    $legacyEncoding = [System.Text.Encoding]::GetEncoding(950)
    $utf8Encoding = [System.Text.UTF8Encoding]::new($false, $false)
    $candidate = $utf8Encoding.GetString($legacyEncoding.GetBytes($Text))
    $candidateBadGlyphs = Get-ForbiddenLogGlyphCount $candidate
    if ($candidateBadGlyphs -lt $originalBadGlyphs) {
      return $candidate
    }
  } catch {
    return $Text
  }

  return $Text
}
function Invoke-PreflightCheck {
  param(
    [string]$Key,
    [string]$Label,
    [string]$Workdir,
    [string]$Command,
    [string]$RunDir,
    [int]$TimeoutSeconds = 180
  )

  $latestLog = Join-Path $outputDir "$Key.txt"
  $historyLog = Join-Path $RunDir "$Key.txt"
  $scriptPath = Join-Path $RunDir "$Key.ps1"
  $stdoutPath = Join-Path $RunDir "$Key.stdout.txt"
  $stderrPath = Join-Path $RunDir "$Key.stderr.txt"

  if (-not (Test-Path $Workdir)) {
    $message = "Workdir not found: $Workdir"
    Write-TextFile -Path $latestLog -Value $message
    Write-TextFile -Path $historyLog -Value $message
    return [pscustomobject]@{
      key = $Key
      label = $Label
      pass = $false
      exitCode = 404
      seconds = 0
      mode = "workdir-missing"
      reused = $false
      workdir = $Workdir
      workdirRelative = Get-PreflightRelativePath $Workdir
      command = $Command
      commandHash = Get-CommandHash $Command
      script = ""
      log = $latestLog
      historyLog = $historyLog
    }
  }

  Write-Status "=== $Label ===" "Cyan"
  $scriptEncodingBootstrap = @(
    '$utf8NoBom = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::InputEncoding = $utf8NoBom',
    '[Console]::OutputEncoding = $utf8NoBom',
    '$OutputEncoding = $utf8NoBom'
    'chcp.com 65001 > $null'
    '$env:PYTHONUTF8 = "1"'
    '$env:PYTHONIOENCODING = "utf-8"'
    '$env:NO_COLOR = "1"'
    '$env:FORCE_COLOR = "0"'
    '$env:CI = "1"'
  ) -join [Environment]::NewLine
  Set-Content -Path $scriptPath -Value ($scriptEncodingBootstrap + [Environment]::NewLine + $Command) -Encoding Unicode
  $startedAt = Get-Date
  $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $processInfo.FileName = "powershell"
  $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
  $processInfo.WorkingDirectory = $Workdir
  $processInfo.UseShellExecute = $false
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $processInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $processInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  $processInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $processInfo
  $timedOut = $false
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
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
    $stdoutRaw = if ($stdoutTask.IsCompleted) { [string]$stdoutTask.Result } else { "`n[preflight] stdout read timed out after process termination.`n" }
    $stderrRaw = if ($stderrTask.IsCompleted) { [string]$stderrTask.Result } else { "`n[preflight] stderr read timed out after process termination.`n" }
    if ($timedOut) {
      $stderrRaw = $stderrRaw + "`n[preflight] command timed out after $TimeoutSeconds seconds; process tree was terminated. script=$scriptPath`n"
    }
    $stdoutText = Remove-PreflightAnsiEscape (Repair-PreflightMojibake $stdoutRaw)
    $stderrText = Remove-PreflightAnsiEscape (Repair-PreflightMojibake $stderrRaw)
    [System.IO.File]::WriteAllText($stdoutPath, $stdoutText, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($stderrPath, $stderrText, [System.Text.UTF8Encoding]::new($false))
  } finally {
    $process.Dispose()
  }
  $seconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)

  $stdout = if (Test-Path $stdoutPath) { Get-Content -Path $stdoutPath -Raw -Encoding UTF8 } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath -Raw -Encoding UTF8 } else { "" }
  $output = @($stdout, $stderr) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($latestLog, $output, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($historyLog, $output, [System.Text.UTF8Encoding]::new($false))

  return [pscustomobject]@{
    key = $Key
    label = $Label
    pass = ($exitCode -eq 0 -and -not $timedOut)
    exitCode = $exitCode
    seconds = $seconds
    mode = if ($timedOut) { "timeout" } else { "run-command" }
    reused = $false
    workdir = $Workdir
    workdirRelative = Get-PreflightRelativePath $Workdir
    command = $Command
    commandHash = Get-CommandHash $Command
    script = $scriptPath
    log = $latestLog
    historyLog = $historyLog
  }
}

function Get-TextHash {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-FileText {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  $text = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path, [System.Text.Encoding]::UTF8)
  return $text.TrimStart([char]0xFEFF)
}

function Get-FileTextHash {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  return Get-TextHash (Get-FileText -Path $Path)
}

function Get-FileMtimeIso {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  return (Get-Item -LiteralPath $Path).LastWriteTimeUtc.ToString("o")
}

function Get-CommandHash {
  param([string]$Command)
  return Get-TextHash $Command
}

function Get-SlowCheckStatusPath {
  param([string]$Key)
  return (Join-Path $slowStatusDir "$Key.json")
}

function Resolve-PreflightPath {
  param([string]$PathValue)
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return (Join-Path $root $PathValue)
}

function Get-PreflightRelativePath {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return "" }
  try {
    $rootPath = [System.IO.Path]::GetFullPath($root)
    $fullPath = [System.IO.Path]::GetFullPath($PathValue)
    if ($fullPath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) { return "." }
    if (-not $rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
      $rootPath = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    }
    if ($fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $fullPath.Substring($rootPath.Length).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
    }
    return $fullPath
  } catch {
    return $PathValue
  }
}

function Get-CacheDefinitionHash {
  param([object]$Cache)

  $definition = [ordered]@{
    roots = @($Cache.roots | ForEach-Object { [string]$_ })
    extensions = @($Cache.extensions | ForEach-Object { ([string]$_).ToLowerInvariant() })
    excludePatterns = @($Cache.excludePatterns | ForEach-Object { [string]$_ })
  }

  return Get-TextHash ($definition | ConvertTo-Json -Compress -Depth 8)
}

function Get-SourceFingerprintPath {
  param([string]$FullName)

  try {
    $fullPath = [System.IO.Path]::GetFullPath($FullName)
    $rootPath = [System.IO.Path]::GetFullPath($root)
    $trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $rootPath = $rootPath.TrimEnd($trimChars)
    $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    $comparison = [System.StringComparison]::OrdinalIgnoreCase

    if ($fullPath.Equals($rootPath, $comparison)) {
      return "."
    }
    if ($fullPath.StartsWith($prefix, $comparison)) {
      return $fullPath.Substring($prefix.Length).Replace("\", "/")
    }
    return $fullPath.Replace("\", "/")
  } catch {
    return ([string]$FullName).Replace("\", "/")
  }
}

function Get-SourceState {
  param(
    [object]$Cache
  )

  $extensions = @($Cache.extensions | ForEach-Object { [string]$_ })
  $excludePatterns = @($Cache.excludePatterns | ForEach-Object { [string]$_ })
  $files = New-Object System.Collections.Generic.List[object]
  $missingRoots = New-Object System.Collections.Generic.List[string]

  foreach ($rootPath in @($Cache.roots)) {
    $resolvedRoot = Resolve-PreflightPath ([string]$rootPath)
    if (-not (Test-Path -LiteralPath $resolvedRoot)) {
      $missingRoots.Add([string]$rootPath)
      continue
    }

    $item = Get-Item -LiteralPath $resolvedRoot
    $candidates = if ($item.PSIsContainer) {
      Get-ChildItem -LiteralPath $item.FullName -Recurse -File -ErrorAction SilentlyContinue
    } else {
      @($item)
    }

    foreach ($candidate in $candidates) {
      $full = [string]$candidate.FullName
      if ($extensions.Count -gt 0 -and -not ($extensions -contains $candidate.Extension.ToLowerInvariant())) {
        continue
      }
      $excluded = $false
      foreach ($pattern in $excludePatterns) {
        if ($full -match $pattern) {
          $excluded = $true
          break
        }
      }
      if ($excluded) { continue }
      $files.Add($candidate)
    }
  }

  $newest = $null
  if ($files.Count -gt 0) {
    $newest = @($files.ToArray() | Sort-Object LastWriteTime -Descending | Select-Object -First 1)[0]
  }

  return [pscustomobject]@{
    files = @($files.ToArray())
    count = $files.Count
    missingRoots = @($missingRoots.ToArray())
    newestPath = if ($newest) { [string]$newest.FullName } else { "" }
    newestTime = if ($newest) { $newest.LastWriteTime } else { [datetime]::MinValue }
  }
}

function Get-SourceFingerprint {
  param([object]$SourceState)

  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($file in @($SourceState.files | Sort-Object FullName)) {
    $fingerprintPath = Get-SourceFingerprintPath ([string]$file.FullName)
    $lines.Add("$fingerprintPath`t$($file.Length)`t$($file.LastWriteTimeUtc.Ticks)")
  }

  return Get-TextHash ($lines.ToArray() -join "`n")
}

function Try-InvokeCachedPreflightCheck {
  param(
    [object]$Check,
    [string]$RunDir
  )

  if ($ForceSlowChecks -or -not $Check.cache) {
    return $null
  }

  $key = [string]$Check.key
  $statusPath = Get-SlowCheckStatusPath $key
  $latestLog = Join-Path $outputDir "$key.txt"
  $historyLog = Join-Path $RunDir "$key.txt"
  $decisionPath = Join-Path $RunDir "$key-decision.json"
  $commandHash = Get-CommandHash ([string]$Check.command)
  $sourceState = Get-SourceState $Check.cache
  $cacheDefinitionHash = Get-CacheDefinitionHash $Check.cache
  $sourceFingerprint = Get-SourceFingerprint $sourceState
  $mode = "run-command"
  $reason = ""
  $status = $null
  $reused = $false
  $statusAgeHours = $null

  if ($sourceState.missingRoots.Count -gt 0) {
    $reason = "missing source roots: $($sourceState.missingRoots -join ', ')"
  } elseif (-not (Test-Path -LiteralPath $statusPath)) {
    $reason = "missing status"
  } else {
    try {
      $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $checkedAt = [datetime]::Parse([string]$status.checkedAt)
      $statusAgeHours = [Math]::Round(((Get-Date) - $checkedAt).TotalHours, 2)
      if (-not [bool]$status.pass) {
        $reason = "previous status did not pass"
      } elseif ([string]$status.commandHash -ne $commandHash) {
        $reason = "command hash changed"
      } elseif ([string]$status.cacheDefinitionHash -ne $cacheDefinitionHash) {
        $reason = "cache definition changed"
      } elseif ([string]$status.sourceFingerprint -ne $sourceFingerprint) {
        $reason = "source fingerprint changed"
      } elseif ($statusAgeHours -gt $slowStatusMaxAgeHours) {
        $reason = "status older than $slowStatusMaxAgeHours hours"
      } elseif ($sourceState.newestTime -gt $checkedAt.AddSeconds(2)) {
        $reason = "source newer than status: $($sourceState.newestPath)"
      } else {
        $mode = "reuse-status"
        $reason = "fresh status"
        $reused = $true
      }
    } catch {
      $reason = "invalid status: $($_.Exception.Message)"
    }
  }

  $decision = [ordered]@{
    key = $key
    label = [string]$Check.label
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    mode = $mode
    reused = $reused
    forceSlowChecks = [bool]$ForceSlowChecks
    reason = $reason
    statusPath = $statusPath
    commandHash = $commandHash
    cacheDefinitionHash = $cacheDefinitionHash
    sourceFingerprint = $sourceFingerprint
    sourceCount = $sourceState.count
    sourceNewestPath = $sourceState.newestPath
    sourceNewestTime = if ($sourceState.newestTime -eq [datetime]::MinValue) { "" } else { $sourceState.newestTime.ToString("o") }
    statusCheckedAt = if ($status) { [string]$status.checkedAt } else { "" }
    statusRunId = if ($status) { [string]$status.runId } else { "" }
    statusAgeHours = $statusAgeHours
    statusMaxAgeHours = $slowStatusMaxAgeHours
    statusCacheDefinitionHash = if ($status) { [string]$status.cacheDefinitionHash } else { "" }
    statusSourceFingerprint = if ($status) { [string]$status.sourceFingerprint } else { "" }
  }
  Write-JsonFile -Path $decisionPath -Value $decision -Depth 8

  if (-not $reused) {
    return $null
  }

  $lines = @(
    "slow check preflight mode=reuse-status reused=True forceSlowChecks=$([bool]$ForceSlowChecks)"
    "key=$key"
    "label=$([string]$Check.label)"
    "statusPath=$statusPath"
    "statusRunId=$([string]$status.runId)"
    "statusCheckedAt=$([string]$status.checkedAt)"
    "statusAgeHours=$($decision.statusAgeHours)"
    "statusMaxAgeHours=$($decision.statusMaxAgeHours)"
    "cacheDefinitionHash=$cacheDefinitionHash"
    "sourceFingerprint=$sourceFingerprint"
    "sourceCount=$($sourceState.count)"
    "sourceNewest=$($sourceState.newestPath)"
    "sourceNewestTime=$($decision.sourceNewestTime)"
    "decision=$decisionPath"
  )
  Write-TextFile -Path $latestLog -Value $lines
  Write-TextFile -Path $historyLog -Value $lines

  return [pscustomobject]@{
    key = $key
    label = [string]$Check.label
    pass = $true
    exitCode = 0
    seconds = 0.1
    mode = $mode
    reused = $reused
    workdir = [string]$Check.workdir
    workdirRelative = Get-PreflightRelativePath ([string]$Check.workdir)
    command = [string]$Check.command
    commandHash = Get-CommandHash ([string]$Check.command)
    statusCheckedAt = if ($status) { [string]$status.checkedAt } else { "" }
    statusAgeHours = $decision.statusAgeHours
    statusMaxAgeHours = $decision.statusMaxAgeHours
    script = ""
    log = $latestLog
    historyLog = $historyLog
  }
}

function Update-SlowCheckStatus {
  param(
    [object]$Check,
    [object]$Record,
    [string]$RunStamp
  )

  if (-not $Check.cache -or -not [bool]$Record.pass) {
    return
  }

  $sourceState = Get-SourceState $Check.cache
  $cacheDefinitionHash = Get-CacheDefinitionHash $Check.cache
  $sourceFingerprint = Get-SourceFingerprint $sourceState
  $statusPath = Get-SlowCheckStatusPath ([string]$Check.key)
  [ordered]@{
    key = [string]$Check.key
    label = [string]$Check.label
    pass = [bool]$Record.pass
    runId = $RunStamp
    checkedAt = (Get-Date).ToString("o")
    statusMaxAgeHours = $slowStatusMaxAgeHours
    commandHash = Get-CommandHash ([string]$Check.command)
    cacheDefinitionHash = $cacheDefinitionHash
    sourceFingerprint = $sourceFingerprint
    command = [string]$Check.command
    sourceRoots = @($Check.cache.roots)
    sourceExtensions = @($Check.cache.extensions)
    sourceExcludePatterns = @($Check.cache.excludePatterns)
    sourceCount = $sourceState.count
    sourceNewestPath = $sourceState.newestPath
    sourceNewestTime = if ($sourceState.newestTime -eq [datetime]::MinValue) { "" } else { $sourceState.newestTime.ToString("o") }
    workdir = [string]$Check.workdir
    workdirRelative = Get-PreflightRelativePath ([string]$Check.workdir)
    log = [string]$Record.log
    historyLog = [string]$Record.historyLog
  } | ForEach-Object { Write-JsonFile -Path $statusPath -Value $_ -Depth 8 }
}

function Format-HistoryMarkdownCell {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "-" }
  return $Value.Replace("|", "/")
}

function Format-HistoryMarkdownListCell {
  param([object[]]$Items)
  $values = @($Items | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { ([string]$_).Replace("|", "/") })
  if ($values.Count -eq 0) { return "-" }
  return ($values -join ", ")
}

function Format-HistoryHashCell {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "-" }
  return $Value.Substring(0, [Math]::Min(12, $Value.Length))
}

function Get-PreflightRunTextLogs {
  param([string]$RunDirPath)

  if ([string]::IsNullOrWhiteSpace($RunDirPath) -or -not (Test-Path -LiteralPath $RunDirPath)) {
    return @()
  }

  return @(
    Get-ChildItem -LiteralPath $RunDirPath -File -Filter "*.txt" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch '\.(stdout|stderr)\.txt$' } |
      Sort-Object Name |
      Select-Object -First 20 |
      ForEach-Object {
        [pscustomobject]@{
          name = $_.Name
          path = $_.FullName
          mtime = $_.LastWriteTime.ToString("o")
          bytes = [int64]$_.Length
        }
      }
  )
}

function Add-PreflightIncompleteHistoryItem {
  param(
    [System.Collections.Generic.List[object]]$Items,
    [System.IO.DirectoryInfo]$Directory,
    [string]$State,
    [string]$Reason,
    [string]$SummaryPath,
    [string]$SummaryJsonPath
  )

  $logFiles = @(Get-PreflightRunTextLogs -RunDirPath $Directory.FullName)
  $inProgress = ($State -eq "in-progress")
  $failureCount = if ($inProgress) { 0 } else { 1 }
  $failedKeys = if ($inProgress) { @() } else { @($Reason) }
  $failures = if ($inProgress) { @() } else { @("${Reason}: run directory has no completed preflight summary") }

  $Items.Add([pscustomobject]@{
    runId = [string]$Directory.Name
    generatedAt = $Directory.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    quick = $false
    forcePlatformAudit = $false
    forceSlowChecks = $false
    pass = $false
    state = $State
    complete = $false
    inProgress = $inProgress
    incomplete = (-not $inProgress)
    failureCount = $failureCount
    recordsCount = $logFiles.Count
    passedCount = 0
    failedKeys = @($failedKeys)
    slowReuseCount = 0
    slowReuseKeys = @()
    platformAuditMode = ""
    platformAuditReused = $null
    platformAuditDecisionPath = ""
    totalSeconds = 0.0
    slowestKey = ""
    slowestSeconds = 0.0
    slowestText = "-"
    slowestRecords = @()
    postCheckCount = 0
    postChecksPassedCount = 0
    postCheckFailures = @()
    postChecks = @()
    failures = @($failures)
    incompleteReason = $Reason
    runDir = [string]$Directory.FullName
    logFiles = @($logFiles)
    summaryPath = $SummaryPath
    summaryJsonPath = $SummaryJsonPath
    summaryHash = Get-FileTextHash -Path $SummaryPath
    summaryJsonHash = Get-FileTextHash -Path $SummaryJsonPath
    summaryMtime = Get-FileMtimeIso -Path $SummaryPath
    summaryJsonMtime = Get-FileMtimeIso -Path $SummaryJsonPath
  })
}

function Update-PreflightHistoryManifest {
  $historyManifestPath = Join-Path $outputDir "preflight-history.json"
  $historyMarkdownPath = Join-Path $outputDir "preflight-history.md"
  $historyItems = New-Object System.Collections.Generic.List[object]
  $historyLines = New-Object System.Collections.Generic.List[string]

  $runDirs = Get-ChildItem -Path $historyDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 20

  foreach ($dir in $runDirs) {
    $jsonPath = Join-Path $dir.FullName "preflight-summary.json"
    $markdownPath = Join-Path $dir.FullName "preflight-summary.md"
    if (-not (Test-Path -LiteralPath $jsonPath)) {
      $ageMinutes = ((Get-Date) - $dir.LastWriteTime).TotalMinutes
      $runState = if ($ageMinutes -lt 10) { "in-progress" } else { "incomplete" }
      Add-PreflightIncompleteHistoryItem -Items $historyItems -Directory $dir -State $runState -Reason "missing-summary" -SummaryPath $markdownPath -SummaryJsonPath $jsonPath
      continue
    }
    try {
      $payload = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $records = @($payload.records)
      $passedCount = @($records | Where-Object { $_.pass }).Count
      $failedKeys = @($records | Where-Object { -not $_.pass } | ForEach-Object { [string]$_.key })
      $postChecksPath = Join-Path $dir.FullName "post-checks.json"
      $postChecks = @()
      if (Test-Path -LiteralPath $postChecksPath) {
        try {
          $postChecksPayload = Get-Content -LiteralPath $postChecksPath -Raw -Encoding UTF8 | ConvertFrom-Json
          $postChecks = @($postChecksPayload | ForEach-Object {
            if ($null -ne $_.PSObject.Properties['value'] -and $null -ne $_.PSObject.Properties['Count']) {
              $_.value | ForEach-Object { $_ }
            } else {
              $_
            }
          })
        } catch {
          $postChecks = @()
        }
      }
      $postCheckFailures = @($postChecks | Where-Object { -not $_.pass } | ForEach-Object { [string]$_.key })
      $postChecksPassedCount = @($postChecks | Where-Object { $_.pass }).Count
      $slowReuseKeys = New-Object System.Collections.Generic.List[string]
      $platformAuditMode = ""
      $platformAuditReused = $null
      $platformAuditDecisionPath = ""
      $platformAuditRecord = @($records | Where-Object { $_.key -eq "platform-audit" } | Select-Object -First 1)
      if ($platformAuditRecord.Count -gt 0) {
        $platformAuditLog = [string]$platformAuditRecord[0].historyLog
        if (-not $platformAuditLog) {
          $platformAuditLog = Join-Path $dir.FullName "$([string]$platformAuditRecord[0].key).txt"
        }
        if (-not (Test-Path -LiteralPath $platformAuditLog)) {
          $platformAuditLog = [string]$platformAuditRecord[0].log
        }
        if ($platformAuditLog -and (Test-Path -LiteralPath $platformAuditLog)) {
          $platformAuditText = Get-Content -LiteralPath $platformAuditLog -Raw -Encoding UTF8
          if ($platformAuditText -match "mode=([A-Za-z0-9\-]+)") {
            $platformAuditMode = $matches[1]
          }
          if ($platformAuditText -match "reused=([A-Za-z]+)") {
            $platformAuditReused = [System.Convert]::ToBoolean($matches[1])
          }
          if ($platformAuditText -match "decision=([^\r\n]+)") {
            $platformAuditDecisionPath = $matches[1].Trim()
          }
        }
      }

      foreach ($record in $records) {
        $recordReused = $false
        if ($null -ne $record.PSObject.Properties['reused']) {
          $recordReused = [bool]$record.reused
        }
        if ($recordReused) {
          $slowReuseKeys.Add([string]$record.key)
          continue
        }
        $recordLog = [string]$record.historyLog
        if (-not $recordLog) {
          $recordLog = Join-Path $dir.FullName "$([string]$record.key).txt"
        }
        if (-not (Test-Path -LiteralPath $recordLog)) {
          $recordLog = [string]$record.log
        }
        if ($recordLog -and (Test-Path -LiteralPath $recordLog)) {
          $recordText = Get-Content -LiteralPath $recordLog -Raw -Encoding UTF8
          if ($recordText -match "slow check preflight mode=reuse-status reused=True") {
            $slowReuseKeys.Add([string]$record.key)
          }
        }
      }

      $totalSeconds = 0.0
      foreach ($record in $records) {
        if ($null -ne $record.seconds) {
          $totalSeconds += [double]$record.seconds
        }
      }
      $totalSeconds = [Math]::Round($totalSeconds, 1)

      $slowRecords = New-Object System.Collections.Generic.List[object]
      $sortedRecords = @($records | Sort-Object -Property @{
        Expression = { if ($null -eq $_.seconds) { 0 } else { [double]$_.seconds } }
        Descending = $true
      } | Select-Object -First 3)
      foreach ($record in $sortedRecords) {
        $recordSeconds = 0.0
        if ($null -ne $record.seconds) {
          $recordSeconds = [Math]::Round([double]$record.seconds, 1)
        }
        $slowRecords.Add([pscustomobject]@{
          key = [string]$record.key
          label = [string]$record.label
          seconds = $recordSeconds
          pass = [bool]$record.pass
          mode = [string]$record.mode
          reused = if ($null -ne $record.PSObject.Properties['reused']) { [bool]$record.reused } else { $false }
          workdirRelative = [string]$record.workdirRelative
          commandHash = [string]$record.commandHash
          log = [string]$record.log
          historyLog = [string]$record.historyLog
        })
      }

      $slowestKey = ""
      $slowestSeconds = 0.0
      $slowestText = "-"
      if ($slowRecords.Count -gt 0) {
        $slowestKey = [string]$slowRecords[0].key
        $slowestSeconds = [double]$slowRecords[0].seconds
        $slowestText = "$slowestKey $($slowestSeconds)s"
      }

      $summaryHash = Get-FileTextHash -Path $markdownPath
      $summaryJsonHash = Get-FileTextHash -Path $jsonPath
      $summaryMtime = Get-FileMtimeIso -Path $markdownPath
      $summaryJsonMtime = Get-FileMtimeIso -Path $jsonPath

      $historyItems.Add([pscustomobject]@{
        runId = [string]$payload.runId
        generatedAt = [string]$payload.generatedAt
        quick = [bool]$payload.quick
        forcePlatformAudit = [bool]$payload.forcePlatformAudit
        forceSlowChecks = [bool]$payload.forceSlowChecks
        pass = [bool]$payload.pass
        state = "completed"
        complete = $true
        inProgress = $false
        incomplete = $false
        failureCount = [int]$payload.failureCount
        recordsCount = $records.Count
        passedCount = $passedCount
        failedKeys = $failedKeys
        slowReuseCount = $slowReuseKeys.Count
        slowReuseKeys = @($slowReuseKeys.ToArray())
        platformAuditMode = $platformAuditMode
        platformAuditReused = $platformAuditReused
        platformAuditDecisionPath = $platformAuditDecisionPath
        totalSeconds = $totalSeconds
        slowestKey = $slowestKey
        slowestSeconds = $slowestSeconds
        slowestText = $slowestText
        slowestRecords = @($slowRecords.ToArray())
        postCheckCount = $postChecks.Count
        postChecksPassedCount = $postChecksPassedCount
        postCheckFailures = $postCheckFailures
        postChecks = @($postChecks)
        failures = @($payload.failures)
        incompleteReason = ""
        runDir = [string]$dir.FullName
        logFiles = @()
        summaryPath = $markdownPath
        summaryJsonPath = $jsonPath
        summaryHash = $summaryHash
        summaryJsonHash = $summaryJsonHash
        summaryMtime = $summaryMtime
        summaryJsonMtime = $summaryJsonMtime
      })
    } catch {
      Add-PreflightIncompleteHistoryItem -Items $historyItems -Directory $dir -State "invalid-summary" -Reason "invalid-summary" -SummaryPath $markdownPath -SummaryJsonPath $jsonPath
      continue
    }
  }

  $completedCount = @($historyItems | Where-Object { $_.complete }).Count
  $inProgressCount = @($historyItems | Where-Object { $_.inProgress }).Count
  $incompleteCount = @($historyItems | Where-Object { $_.incomplete }).Count

  $historyLines.Add("# Tool Preflight History")
  $historyLines.Add("")
  $historyLines.Add("- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
  $historyLines.Add("- root: $root")
  $historyLines.Add("- count: $($historyItems.Count)")
  $historyLines.Add("- completedCount: $completedCount")
  $historyLines.Add("- inProgressCount: $inProgressCount")
  $historyLines.Add("- incompleteCount: $incompleteCount")
  $historyLines.Add("")
  $historyLines.Add("| runId | state | generatedAt | quick | pass | failures | failed keys | passed / checks | duration(s) | platform audit | slow reuse | slow reuse keys | slowest | summary | summary json | summary hash | post checks | summary json hash |")
  $historyLines.Add("|---|---|---|---:|---:|---:|---|---:|---:|---|---:|---|---|---|---|---|---|---|")
  foreach ($item in $historyItems) {
    $platformMode = if ($item.platformAuditMode) { $item.platformAuditMode } else { "-" }
    $failedKeyText = Format-HistoryMarkdownListCell @($item.failedKeys)
    $slowReuseKeyText = Format-HistoryMarkdownListCell @($item.slowReuseKeys)
    $summaryPathText = Format-HistoryMarkdownCell $item.summaryPath
    $summaryJsonPathText = Format-HistoryMarkdownCell $item.summaryJsonPath
    $summaryHashText = Format-HistoryHashCell $item.summaryHash
    $summaryJsonHashText = Format-HistoryHashCell $item.summaryJsonHash
    $postCheckText = if ($item.postCheckCount -gt 0) { "$($item.postChecksPassedCount) / $($item.postCheckCount)" } else { "-" }
    $historyLines.Add("| $($item.runId) | $($item.state) | $($item.generatedAt) | $($item.quick) | $($item.pass) | $($item.failureCount) | $failedKeyText | $($item.passedCount) / $($item.recordsCount) | $($item.totalSeconds) | $platformMode | $($item.slowReuseCount) | $slowReuseKeyText | $($item.slowestText) | $summaryPathText | $summaryJsonPathText | $summaryHashText | $postCheckText | $summaryJsonHashText |")
  }

  [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    count = $historyItems.Count
    completedCount = $completedCount
    inProgressCount = $inProgressCount
    incompleteCount = $incompleteCount
    items = @($historyItems.ToArray())
  } | ForEach-Object { Write-JsonFile -Path $historyManifestPath -Value $_ -Depth 8 }
  Write-TextFile -Path $historyMarkdownPath -Value $historyLines
}

$platformAuditPreflight = Join-Path $root "platform-audit-preflight.ps1"
$platformAuditArgs = "-Quiet"
if ($ForcePlatformAudit) {
  $platformAuditArgs = "$platformAuditArgs -Force"
}
$platformAuditCommand = "& '$platformAuditPreflight' $platformAuditArgs"

$windPathCommand = @'
$bad = Get-ChildItem -LiteralPath '結構工具箱\tools\風力' -Filter '*.html' | Where-Object {
  $html = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
  $html -match '鋼筋混凝土/shared/report\.js' -and $html -notmatch '\.\./\.\./\.\./鋼筋混凝土/shared/report\.js'
}
if ($bad) {
  $bad | ForEach-Object { Write-Error "bad wind report path: $($_.FullName)" }
  exit 1
}
Write-Output 'wind report paths OK'
exit 0
'@

$anchorRouteCommand = @'
$indexPath = 'anchor\index.html'
$workerPath = 'anchor\service-worker.js'
$manifestPath = 'anchor\deployment-manifest.json'
$sourceRoots = @(
  '螺栓檢討\bolt-review-tool\src',
  '螺栓檢討\bolt-review-tool\public',
  '螺栓檢討\bolt-review-tool\package.json',
  '螺栓檢討\bolt-review-tool\package-lock.json',
  '螺栓檢討\bolt-review-tool\vite.config.ts',
  '螺栓檢討\bolt-review-tool\tsconfig.json',
  '螺栓檢討\bolt-review-tool\tsconfig.app.json',
  '螺栓檢討\bolt-review-tool\tsconfig.node.json',
  '螺栓檢討\bolt-review-tool\eslint.config.js'
)
$sourceExtensions = @('.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.svg', '.webmanifest')
$excludePatterns = @('\node_modules\', '\dist\', '\coverage\')
function Get-RelativePathText([string]$BasePath, [string]$FullPath) {
  $baseResolved = (Resolve-Path -LiteralPath $BasePath).Path
  $fullResolved = (Resolve-Path -LiteralPath $FullPath).Path
  if (-not $baseResolved.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseResolved = $baseResolved + [System.IO.Path]::DirectorySeparatorChar
  }
  $baseUri = New-Object System.Uri($baseResolved)
  $fullUri = New-Object System.Uri($fullResolved)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fullUri).ToString()).Replace('/', '/')
}
function Get-FileSha256Text([string]$Path) {
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($resolved)
  try {
    return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}
function Get-AnchorSourceFingerprint([string]$WorkspaceRoot) {
  $records = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $sourceRoots) {
    $full = Join-Path $WorkspaceRoot $entry
    if (-not (Test-Path -LiteralPath $full)) { continue }
    $item = Get-Item -LiteralPath $full
    $files = @()
    if ($item.PSIsContainer) {
      $files = Get-ChildItem -LiteralPath $item.FullName -File -Recurse | Where-Object {
        $pathText = $_.FullName
        $excluded = $false
        foreach ($pattern in $excludePatterns) {
          if ($pathText -like "*$pattern*") { $excluded = $true; break }
        }
        -not $excluded -and $sourceExtensions -contains $_.Extension.ToLowerInvariant()
      }
    } elseif ($sourceExtensions -contains $item.Extension.ToLowerInvariant()) {
      $files = @($item)
    }
    foreach ($file in $files) {
      $relative = Get-RelativePathText (Get-Location).Path $file.FullName
      $hash = Get-FileSha256Text $file.FullName
      $records.Add("$relative|$($file.Length)|$hash")
    }
  }
  $joined = ($records | Sort-Object) -join "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}
if (-not (Test-Path -LiteralPath $indexPath)) { Write-Error "missing $indexPath"; exit 1 }
if (-not (Test-Path -LiteralPath $workerPath)) { Write-Error "missing $workerPath"; exit 1 }
if (-not (Test-Path -LiteralPath $manifestPath)) { Write-Error "missing $manifestPath; run sync-anchor-deployment.ps1"; exit 1 }
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$worker = Get-Content -LiteralPath $workerPath -Raw -Encoding UTF8
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($index -notmatch '/anchor/assets/index-[^"]+\.js') { Write-Error 'anchor index does not point at /anchor/assets/index-*.js'; exit 1 }
if ($worker -notmatch "BASE_PATH\s*=\s*'/anchor/'") { Write-Error 'anchor service worker BASE_PATH is not /anchor/'; exit 1 }
if ($manifest.basePath -ne '/anchor/') { Write-Error "anchor deployment manifest basePath is not /anchor/: $($manifest.basePath)"; exit 1 }
$currentFingerprint = Get-AnchorSourceFingerprint (Get-Location).Path
if ($manifest.sourceFingerprint -ne $currentFingerprint) {
  Write-Error "anchor deployment source fingerprint is stale; run sync-anchor-deployment.ps1"
  exit 1
}
$assetNames = [regex]::Matches($index, '/anchor/assets/([^"]+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
foreach ($name in $assetNames) {
  $assetPath = Join-Path 'anchor\assets' $name
  if (-not (Test-Path -LiteralPath $assetPath)) {
    Write-Error "missing referenced anchor asset: $assetPath"
    exit 1
  }
}
Write-Output "anchor route assets OK ($($assetNames.Count) referenced assets, source fingerprint current)"
exit 0
'@

$frameStaticCommand = @'
$htmlPath = '鋼架\平面剛架分析.html'
if (-not (Test-Path -LiteralPath $htmlPath)) { Write-Error "missing $htmlPath"; exit 1 }
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$needles = @(
  '<title>平面剛架分析',
  'function solveLinear',
  'function analyze',
  'id="geomCanvas"',
  'id="momCanvas"',
  'id="dispTbl"',
  'id="reportStatus"',
  'function setReportStatus',
  'grid-template-columns: minmax(560px, 0.9fr) minmax(0, 1.1fr)',
  '.main-layout > * { min-width: 0; }',
  '.row2 input, .row2 select, .row3 input, .row3 select { width: 100%; min-width: 0; }',
  'canvas { display: block; max-width: 100%; height: auto; margin: 0 auto; }',
  '@media (max-width: 1180px)',
  'function drawBoundedCanvasText',
  'const boundsX =',
  'boundsX.push(bx, px)',
  'fitToCanvas(cv, boundsX, boundsY, 74)',
  'function makeNode',
  'function activeSpring',
  'kX/kY (tf/m)',
  'kθ (tf·m/rad)',
  '+= kx',
  '-activeSpring(nodes',
  'springForces',
  "loadExample('springPortal')",
  '載重案例 / 分析組合',
  'function validateModel',
  'function computeAppliedResultant',
  'function renderModelChecks',
  'function syncLoadCaseTableFromDom',
  'function setReportLink',
  'id="reportLink"',
  'lastReportObjectUrl',
  'URL.createObjectURL(new Blob',
  'overflow-x: auto',
  'equilibrium',
  'formatActiveCombination',
  'comboFactors',
  'caseId: normalizeLoadCaseId'
)
foreach ($needle in $needles) {
  if ($html -notlike "*$needle*") {
    Write-Error "frame analysis static smoke missing: $needle"
    exit 1
  }
}
if ($html -like "*alert(*") {
  Write-Error "frame analysis static smoke found blocking alert"
  exit 1
}
Write-Output 'frame analysis static smoke OK'
exit 0
'@

$generatedArtifactBoundaryCommand = @'
$tracked = git -c core.quotePath=false ls-files
if ($LASTEXITCODE -ne 0) {
  Write-Error 'git ls-files failed'
  exit $LASTEXITCODE
}

$allowedPatterns = @(
  '^石材固定/vendor/package/dist/'
)
$blockedPatterns = @(
  '^螺栓檢討/bolt-review-tool/dist/',
  '^開挖擋土支撐/frontend/dist/',
  '^output/',
  '/output/',
  '/node_modules/',
  '/\.vite/',
  '/app_data/',
  '/__pycache__/',
  '/\.pytest_cache/'
)

$offenders = @()
foreach ($path in $tracked) {
  $normalized = $path.Replace('\', '/')
  $allowed = $false
  foreach ($pattern in $allowedPatterns) {
    if ($normalized -match $pattern) {
      $allowed = $true
      break
    }
  }
  if ($allowed) {
    continue
  }
  foreach ($pattern in $blockedPatterns) {
    if ($normalized -match $pattern) {
      $offenders += $normalized
      break
    }
  }
}

if ($offenders.Count -gt 0) {
  Write-Error "tracked generated artifacts are not allowed:`n$($offenders -join "`n")"
  exit 1
}
Write-Output "generated artifact boundary OK ($($tracked.Count) tracked files checked)"
exit 0
'@

$sectionToolsContractCommand = @'
node section-tools.contract.test.js
exit $LASTEXITCODE
'@

$deckingToolsContractCommand = @'
node decking-tools.contract.test.js
exit $LASTEXITCODE
'@

$deckingTraceabilityContractCommand = @'
node 覆工板/decking-traceability.contract.test.js
exit $LASTEXITCODE
'@

$formalTraceabilityContractCommand = @'
node 結構工具箱/tools/formal-traceability.contract.test.js
exit $LASTEXITCODE
'@

$rcTraceabilityContractCommand = @'
node 鋼筋混凝土/tools/rc-traceability.contract.test.js
exit $LASTEXITCODE
'@

$steelTraceabilityContractCommand = @'
node 鋼構工具/steel-traceability.contract.test.js
exit $LASTEXITCODE
'@

$anchorTraceabilityContractCommand = @'
node 螺栓檢討/anchor-traceability.contract.test.js
exit $LASTEXITCODE
'@

$reportDisclosureContractCommand = @'
node 結構工具箱/tools/report-disclosure.contract.test.js
exit $LASTEXITCODE
'@

$deliveryArtifactsContractCommand = @'
node 結構工具箱/tools/delivery-artifacts.contract.test.js
exit $LASTEXITCODE
'@

$releaseReadinessContractCommand = @'
node 結構工具箱/tools/release-readiness.contract.test.js
exit $LASTEXITCODE
'@

$excavationTraceabilityContractCommand = @'
node 開挖擋土支撐/excavation-traceability.contract.test.js
exit $LASTEXITCODE
'@

$structDxContractCommand = @'
node struct-dx.contract.test.js
exit $LASTEXITCODE
'@

$stoneFeedbackContractCommand = @'
node stone-feedback.contract.test.js
exit $LASTEXITCODE
'@

$stoneTraceabilityContractCommand = @'
node 石材固定/stone-traceability.contract.test.js
exit $LASTEXITCODE
'@

$browserDialogsContractCommand = @'
node browser-dialogs.contract.test.js
exit $LASTEXITCODE
'@

$toolboxEntrypointsContractCommand = @'
node toolbox-entrypoints.contract.test.js
exit $LASTEXITCODE
'@

$stagingGroupsCoverageCommand = @'
$ErrorActionPreference = "Stop"
$stagingPath = "STAGING_GROUPS.md"
$staging = Get-Content -LiteralPath $stagingPath -Raw -Encoding UTF8

function Normalize-PathText {
  param([string]$PathValue)
  return $PathValue.Replace("\", "/")
}

function New-PathSet {
  param([string[]]$Items)
  $set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($item in $Items) {
    if ([string]::IsNullOrWhiteSpace($item)) { continue }
    [void]$set.Add((Normalize-PathText $item))
  }
  return ,$set
}

function Get-StagingGitAddPaths {
  param([string]$Text)
  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($line in ($Text -split "`r?`n")) {
    if (-not $line.TrimStart().StartsWith("git add")) { continue }
    $matches = [regex]::Matches($line, '"([^"]+)"|([^\s]+)')
    $tokens = @($matches | ForEach-Object { if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value } })
    if ($tokens.Count -lt 3) { continue }
    foreach ($token in $tokens[2..($tokens.Count - 1)]) {
      if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "--" -or $token -eq "-A" -or $token.StartsWith("-")) { continue }
      $paths.Add((Normalize-PathText $token))
    }
  }
  return @($paths.ToArray() | Sort-Object -Unique)
}

function Get-DocumentedCoveragePaths {
  param([string]$Text)
  $paths = New-Object System.Collections.Generic.List[string]
  $inlineText = [regex]::Replace($Text, '(?s)```.*?```', '')
  foreach ($match in [regex]::Matches($inlineText, '`([^`]+)`')) {
    $token = [string]$match.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($token) -or $token.Contains(" ") -or $token.Contains("*") -or $token.Contains("`r") -or $token.Contains("`n")) { continue }
    if ($token -match '^(git|node|powershell|\.\|/)') { continue }
    $clean = Normalize-PathText $token
    $testPath = $clean.TrimEnd("/")
    if ($clean.EndsWith("/") -or (Test-Path -LiteralPath $testPath)) { $paths.Add($clean) }
  }
  return @($paths.ToArray() | Sort-Object -Unique)
}

function New-CoverageIndex {
  param([string[]]$CoveragePaths)
  $exact = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $prefixSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($coverage in $CoveragePaths) {
    $normalized = Normalize-PathText $coverage
    if ([string]::IsNullOrWhiteSpace($normalized)) { continue }
    [void]$exact.Add($normalized)
    $isDirectory = $normalized.EndsWith("/")
    if (-not $isDirectory -and (Test-Path -LiteralPath $normalized)) {
      $isDirectory = (Get-Item -LiteralPath $normalized).PSIsContainer
    }
    if ($isDirectory) { [void]$prefixSet.Add($normalized.TrimEnd("/") + "/") }
  }
  return [pscustomobject]@{
    Exact = $exact
    DirectoryPrefixes = [string[]]@($prefixSet)
  }
}

function Test-IsCovered {
  param([string]$PathValue, $CoverageIndex)
  $normalizedPath = Normalize-PathText $PathValue
  if ($CoverageIndex.Exact.Contains($normalizedPath)) { return $true }
  foreach ($prefix in $CoverageIndex.DirectoryPrefixes) {
    if ($normalizedPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

$gitAddPaths = @(Get-StagingGitAddPaths $staging)
$trackedOutput = @(& git -c core.quotePath=false ls-files)
if ($LASTEXITCODE -ne 0) { throw "git ls-files failed" }
$trackedPathSet = New-PathSet $trackedOutput
$ignoredOutput = @($gitAddPaths | & git -c core.quotePath=false check-ignore --stdin)
$checkIgnoreExit = $LASTEXITCODE
if ($checkIgnoreExit -ne 0 -and $checkIgnoreExit -ne 1) { throw "git check-ignore failed" }
$ignoredPathSet = New-PathSet $ignoredOutput
foreach ($pathValue in $gitAddPaths) {
  $normalizedPath = Normalize-PathText $pathValue
  $exists = Test-Path -LiteralPath $pathValue
  $tracked = $trackedPathSet.Contains($normalizedPath)
  if (-not $exists -and -not $tracked) { throw "STAGING_GROUPS path must exist or be a tracked deletion: $pathValue" }
  if (-not $tracked -and $ignoredPathSet.Contains($normalizedPath)) { throw "STAGING_GROUPS path is ignored and untracked: $pathValue" }
}

$coveragePaths = @($gitAddPaths + @(Get-DocumentedCoveragePaths $staging) | Sort-Object -Unique)
$statusLines = @(& git -c core.quotePath=false status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw "git status failed" }
$changedPaths = New-Object System.Collections.Generic.List[string]
foreach ($line in $statusLines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $pathValue = Normalize-PathText ($line.Substring(3))
  if ($pathValue -match ' -> ') { $pathValue = @($pathValue -split ' -> ')[-1] }
  $changedPaths.Add($pathValue)
}
$coverageIndex = New-CoverageIndex $coveragePaths
$unclassified = @($changedPaths.ToArray() | Where-Object { -not (Test-IsCovered $_ $coverageIndex) })
if ($unclassified.Count -gt 0) {
  throw "STAGING_GROUPS missing current worktree coverage:`n$($unclassified -join "`n")"
}
Write-Output "staging groups coverage OK (gitAddPaths=$($gitAddPaths.Count), changed=$($changedPaths.Count), unclassified=0)"
exit 0
'@


$localQuickToolsStaticCommand = @'
$checks = @(
  '結構工具箱\tools\local-quick-export.test.js',
  '結構工具箱\tools\local-quick-output-consistency.test.js',
  '結構工具箱\tools\local-quick-tools.contract.test.js'
)
foreach ($check in $checks) {
  if (-not (Test-Path -LiteralPath $check)) {
    Write-Error "missing $check"
    exit 1
  }
  node $check
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'local quick static contract OK'
exit 0
'@

$localQuickToolsRunnerCommand = @'
$runnerPath = '結構工具箱\tools\local-quick-tools.run.js'
if (-not (Test-Path -LiteralPath $runnerPath)) {
  Write-Error "missing $runnerPath"
  exit 1
}
node $runnerPath
exit $LASTEXITCODE
'@

$formalToolsStaticCommand = @'
$checks = @(
  '結構工具箱\tools\formal-tools.contract.test.js'
)
foreach ($check in $checks) {
  if (-not (Test-Path -LiteralPath $check)) {
    Write-Error "missing $check"
    exit 1
  }
  node $check
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'formal tools static contract OK'
exit 0
'@

$formalToolsRunnerCommand = @'
$runnerPath = '結構工具箱\tools\formal-tools.run.js'
if (-not (Test-Path -LiteralPath $runnerPath)) {
  Write-Error "missing $runnerPath"
  exit 1
}
node $runnerPath
exit $LASTEXITCODE
'@

$launcherScriptsCommand = @'
$checks = @(
  @{
    Path = 'run-preflight-tools.bat'
    Needles = @('preflight-tools.ps1', '-Quiet', '%*')
  },
  @{
    Path = 'run-preflight-tools-release.bat'
    Needles = @('preflight-tools.ps1', '-Quiet', '-ForceSlowChecks', '-ForcePlatformAudit', '%*')
  },
  @{
    Path = 'run-preflight-tools-quick.bat'
    Needles = @('preflight-tools.ps1', '-Quiet', '-Quick')
  },
  @{
    Path = 'run-audit-all.bat'
    Needles = @('audit-all.ps1', '-Quiet')
  },
  @{
    Path = 'run-audit-all-loop.bat'
    Needles = @('audit-all.ps1', '-Quiet', '-Loop', '-IntervalSeconds', '60')
  },
  @{
    Path = 'platform-audit-preflight.ps1'
    Needles = @('mode=reuse-status', 'mode=run-audit-all', 'refresh-platform-status.ps1', 'audit-all.ps1', '-Force')
  },
  @{
    Path = 'sync-anchor-deployment.ps1'
    Needles = @('ANCHOR_BASE_PATH', '/anchor/', 'deployment-manifest.json', 'sourceFingerprint', 'Remove-Item', 'Copy-Item')
  },
  @{
    Path = '鋼構工具\run-audit.bat'
    Needles = @('audit-tool.ps1', '-Quiet')
  },
  @{
    Path = '鋼筋混凝土\run-audit.bat'
    Needles = @('audit-tool.ps1', '-Quiet')
  },
  @{
    Path = '結構工具箱\run-audit-core.bat'
    Needles = @('audit-core.ps1', '-Quiet')
  }
)

foreach ($check in $checks) {
  if (-not (Test-Path -LiteralPath $check.Path)) {
    Write-Error "missing launcher script: $($check.Path)"
    exit 1
  }

  $content = Get-Content -LiteralPath $check.Path -Raw -Encoding UTF8
  foreach ($needle in $check.Needles) {
    if ($content -notlike "*$needle*") {
      Write-Error "launcher script missing '$needle': $($check.Path)"
      exit 1
    }
  }
}

Write-Output "launcher scripts smoke OK ($($checks.Count) scripts)"
exit 0
'@

$steelAuditStatusCommand = @'
$statusPath = '鋼構工具\output\audit\audit-status.json'
if (-not (Test-Path -LiteralPath $statusPath)) {
  Write-Error "missing steel audit status: $statusPath"
  exit 1
}

$statusFile = Get-Item -LiteralPath $statusPath
$status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $status.pass -or [int]$status.failureCount -ne 0) {
  Write-Error "last steel audit did not pass: runId=$($status.runId), failureCount=$($status.failureCount)"
  exit 1
}

foreach ($path in @($status.lastSummary, $status.lastHistorySummary)) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) {
    Write-Error "missing steel audit summary referenced by status: $path"
    exit 1
  }
}

$auditTime = $statusFile.LastWriteTime
$steelRoot = '鋼構工具'
$sourceExtensions = @('.html', '.js', '.json', '.ps1', '.bat', '.md', '.css')
$newer = Get-ChildItem -LiteralPath $steelRoot -Recurse -File | Where-Object {
  $full = $_.FullName
  $sourceExtensions -contains $_.Extension.ToLowerInvariant() -and
    $full -notmatch '\\output\\audit\\' -and
    $full -notmatch '\\node_modules\\' -and
    $_.LastWriteTime -gt $auditTime.AddSeconds(2)
} | Sort-Object LastWriteTime -Descending

if ($newer) {
  $items = ($newer | Select-Object -First 8 | ForEach-Object {
    "$($_.FullName) ($($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
  }) -join [Environment]::NewLine
  Write-Error "steel audit status is stale; rerun .\鋼構工具\audit-tool.ps1 -Quiet. Newer files:$([Environment]::NewLine)$items"
  exit 1
}

Write-Output "steel audit status OK (runId=$($status.runId), checkedAt=$($statusFile.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
exit 0
'@

$rcAuditStatusCommand = @'
$statusPath = '鋼筋混凝土\output\audit\audit-status.json'
if (-not (Test-Path -LiteralPath $statusPath)) {
  Write-Error "missing RC audit status: $statusPath"
  exit 1
}

$statusFile = Get-Item -LiteralPath $statusPath
$status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $status.pass -or [int]$status.failureCount -ne 0) {
  Write-Error "last RC audit did not pass: runId=$($status.runId), failureCount=$($status.failureCount)"
  exit 1
}

$expectedModules = @('beam', 'column', 'slab', 'wall', 'shear-wall', 'foundation', 'single-pile')
$actualModules = @($status.modules)
if (($actualModules -join '|') -ne ($expectedModules -join '|')) {
  Write-Error "RC audit module list drifted: $($actualModules -join ', ')"
  exit 1
}

foreach ($path in @($status.lastSummary, $status.lastHistorySummary)) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) {
    Write-Error "missing RC audit summary referenced by status: $path"
    exit 1
  }
}

$auditTime = $statusFile.LastWriteTime
$rcRoot = '鋼筋混凝土'
$sourceExtensions = @('.html', '.js', '.json', '.ps1', '.bat', '.md')
$newer = Get-ChildItem -LiteralPath $rcRoot -Recurse -File | Where-Object {
  $full = $_.FullName
  $sourceExtensions -contains $_.Extension.ToLowerInvariant() -and
    $full -notmatch '\\output\\audit\\' -and
    $full -notmatch '\\tools\\\.[^\\]+-testdeps\\' -and
    $full -notmatch '\\node_modules\\' -and
    $_.LastWriteTime -gt $auditTime.AddSeconds(2)
} | Sort-Object LastWriteTime -Descending

if ($newer) {
  $items = ($newer | Select-Object -First 8 | ForEach-Object {
    "$($_.FullName) ($($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
  }) -join [Environment]::NewLine
  Write-Error "RC audit status is stale; rerun .\鋼筋混凝土\audit-tool.ps1 -Quiet. Newer files:$([Environment]::NewLine)$items"
  exit 1
}

Write-Output "RC audit status OK (runId=$($status.runId), modules=$($actualModules.Count), checkedAt=$($statusFile.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
exit 0
'@

$coreAuditStatusCommand = @'
$statusPath = '結構工具箱\output\audit\audit-status.json'
if (-not (Test-Path -LiteralPath $statusPath)) {
  Write-Error "missing structural core audit status: $statusPath"
  exit 1
}

$statusFile = Get-Item -LiteralPath $statusPath
$status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $status.pass -or [int]$status.failureCount -ne 0) {
  Write-Error "last structural core audit did not pass: runId=$($status.runId), failureCount=$($status.failureCount)"
  exit 1
}

$expectedModules = @('wind', 'seismic')
$actualModules = @($status.modules)
if (($actualModules -join '|') -ne ($expectedModules -join '|')) {
  Write-Error "structural core audit module list drifted: $($actualModules -join ', ')"
  exit 1
}

foreach ($path in @($status.lastSummary, $status.lastHistorySummary)) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) {
    Write-Error "missing structural core audit summary referenced by status: $path"
    exit 1
  }
}

$auditTime = $statusFile.LastWriteTime
$sourceExtensions = @('.html', '.js', '.json', '.ps1', '.bat', '.md', '.css')
$checkRoots = @('結構工具箱\core', '結構工具箱\tests')
$newer = @()
foreach ($rootPath in $checkRoots) {
  if (Test-Path -LiteralPath $rootPath) {
    $newer += Get-ChildItem -LiteralPath $rootPath -Recurse -File | Where-Object {
      $sourceExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.LastWriteTime -gt $auditTime.AddSeconds(2)
    }
  }
}
$auditScript = Get-Item -LiteralPath '結構工具箱\audit-core.ps1'
if ($auditScript.LastWriteTime -gt $auditTime.AddSeconds(2)) {
  $newer += $auditScript
}
$newer = @($newer | Sort-Object LastWriteTime -Descending)

if ($newer) {
  $items = ($newer | Select-Object -First 8 | ForEach-Object {
    "$($_.FullName) ($($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
  }) -join [Environment]::NewLine
  Write-Error "structural core audit status is stale; rerun .\結構工具箱\audit-core.ps1 -Quiet. Newer files:$([Environment]::NewLine)$items"
  exit 1
}

Write-Output "structural core audit status OK (runId=$($status.runId), modules=$($actualModules.Count), checkedAt=$($statusFile.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
exit 0
'@

$runtimePidCleanlinessCommand = @'
$pidFiles = @(Get-ChildItem -LiteralPath . -Recurse -Filter '*.pid' -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '\\node_modules\\'
})
$stale = New-Object System.Collections.Generic.List[string]
$alive = 0

foreach ($pidFile in $pidFiles) {
  $raw = Get-Content -LiteralPath $pidFile.FullName -Raw -ErrorAction SilentlyContinue
  $pidText = if ($null -eq $raw) { "" } else { ([string]$raw).Trim() }
  if ($pidText -notmatch '^\d+$') {
    $stale.Add("invalid pid file: $($pidFile.FullName)")
    continue
  }

  $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
  if ($null -eq $proc) {
    $stale.Add("stale pid file: $($pidFile.FullName) -> $pidText")
    continue
  }

  $alive += 1
}

if ($stale.Count -gt 0) {
  $stale | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "runtime pid cleanliness OK (pidFiles=$($pidFiles.Count), alive=$alive)"
exit 0
'@

$toolMaturityMatrixRefreshCommand = @'
$matrixPath = '結構工具箱\tools\tool-maturity-matrix.js'
if (-not (Test-Path -LiteralPath $matrixPath)) {
  Write-Error "missing $matrixPath"
  exit 1
}
node $matrixPath --write --check
exit $LASTEXITCODE
'@

$auditDashboardContractCommand = @'
Set-Location '結構工具箱'
node '.\tools\audit-dashboard.contract.test.js'
exit $LASTEXITCODE
'@

$auditDashboardBrowserSmokeCommand = @'
Set-Location '結構工具箱'
node '.\tools\audit-dashboard-browser-smoke.test.js'
exit $LASTEXITCODE
'@

$auditDashboardLiveOutputSmokeCommand = @'
Set-Location '結構工具箱'
node '.\tools\audit-dashboard-browser-smoke.test.js' --live-output
exit $LASTEXITCODE
'@

$excavationLauncherCommand = @'
$launcherPath = '開挖擋土支撐\index.html'
$readmePath = '開挖擋土支撐\README.md'
$startPath = '開挖擋土支撐\start_html_mode.ps1'
$stopPath = '開挖擋土支撐\stop_html_mode.ps1'
foreach ($path in @($launcherPath, $readmePath, $startPath, $stopPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Error "missing excavation service file: $path"
    exit 1
  }
}
$launcher = Get-Content -LiteralPath $launcherPath -Raw -Encoding UTF8
$startScript = Get-Content -LiteralPath $startPath -Raw -Encoding UTF8
$stopScript = Get-Content -LiteralPath $stopPath -Raw -Encoding UTF8
$launcherNeedles = @(
  '本機服務工具',
  'start_html_mode.ps1 -OpenBrowser',
  'stop_html_mode.ps1',
  '/api/health',
  'app_data/',
  '服務邊界',
  '不可直接當靜態部署'
)
foreach ($needle in $launcherNeedles) {
  if ($launcher -notlike "*$needle*") {
    Write-Error "excavation launcher smoke missing: $needle"
    exit 1
  }
}
$startNeedles = @('Test-HealthEndpoint', 'uvicorn', '--port', '8000', 'html-mode-backend.pid')
foreach ($needle in $startNeedles) {
  if ($startScript -notlike "*$needle*") {
    Write-Error "excavation start script smoke missing: $needle"
    exit 1
  }
}
$stopNeedles = @('html-mode-backend.pid', 'LocalPort 8000', 'LocalPort 5173', 'HTML mode stopped')
foreach ($needle in $stopNeedles) {
  if ($stopScript -notlike "*$needle*") {
    Write-Error "excavation stop script smoke missing: $needle"
    exit 1
  }
}
Write-Output 'excavation launcher and service-boundary smoke OK'
exit 0
'@

$stoneQuickCommand = @'
$tests = @(
  'regression-smoke',
  'formula-registry-smoke',
  'review-dashboard-smoke',
  'version-sync-smoke',
  'input-schema-smoke',
  'code-profiles-registry-smoke'
)
foreach ($test in $tests) {
  Write-Output "node js\$test.test.js"
  node "js\$test.test.js"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'node tests\syntax_check.js'
node 'tests\syntax_check.js'
exit $LASTEXITCODE
'@

$deckReportCommand = @'
python -m py_compile dump_xls.py report\gen_report.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sample = 'test-fixtures\report-smoke.json'
if (-not (Test-Path -LiteralPath $sample)) {
  Write-Error "missing cover slab report smoke fixture: $sample"
  exit 1
}

$outDir = '..\output\preflight'
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -Path $outDir -ItemType Directory | Out-Null
}

$out = Join-Path $outDir 'cover-slab-report-smoke.docx'
$env:COVER_SLAB_NO_OPEN = '1'
python report\gen_report.py $sample $out
$code = $LASTEXITCODE
Remove-Item Env:\COVER_SLAB_NO_OPEN -ErrorAction SilentlyContinue
if ($code -ne 0) { exit $code }
if (-not (Test-Path -LiteralPath $out)) {
  Write-Error "missing cover slab smoke report: $out"
  exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $out).Path)
try {
  $entry = $zip.GetEntry('word/document.xml')
  if ($null -eq $entry) {
    Write-Error "cover slab smoke report missing word/document.xml: $out"
    exit 1
  }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $documentXml = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
} finally {
  $zip.Dispose()
}

$pageOnlyReportStatusNeedles = @(
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF'
)
foreach ($needle in $pageOnlyReportStatusNeedles) {
  if ($documentXml.Contains($needle)) {
    Write-Error "cover slab smoke report leaked page-only report status wording: $needle"
    exit 1
  }
}

Write-Output "cover slab report smoke OK: $out"
exit 0
'@

$excavationBackendCache = [pscustomobject]@{
  roots = @(
    '開挖擋土支撐\backend',
    '開挖擋土支撐\2_開挖擋土支撐-v95000.xlsm',
    '開挖擋土支撐\一般(分析+擋土+支撐).docx',
    '開挖擋土支撐\支撐.png',
    '開挖擋土支撐\橫擋&斜撐.png'
  )
  extensions = @('.py', '.json', '.txt', '.xlsm', '.docx', '.png')
  excludePatterns = @('\\__pycache__\\', '\\.pytest_cache\\', '\\app_data\\', '\\output\\', '\\tmp\\')
}

$excavationFrontendCache = [pscustomobject]@{
  roots = @(
    '開挖擋土支撐\frontend',
    '開挖擋土支撐\backend\app\main.py'
  )
  extensions = @('.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py')
  excludePatterns = @('\\node_modules\\', '\\dist\\', '\\coverage\\')
}

$anchorVerifyCache = [pscustomobject]@{
  roots = @(
    '螺栓檢討\bolt-review-tool\src',
    '螺栓檢討\bolt-review-tool\public',
    '螺栓檢討\bolt-review-tool\package.json',
    '螺栓檢討\bolt-review-tool\package-lock.json',
    '螺栓檢討\bolt-review-tool\vite.config.ts',
    '螺栓檢討\bolt-review-tool\tsconfig.json',
    '螺栓檢討\bolt-review-tool\tsconfig.app.json',
    '螺栓檢討\bolt-review-tool\tsconfig.node.json',
    '螺栓檢討\bolt-review-tool\eslint.config.js'
  )
  extensions = @('.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html')
  excludePatterns = @('\\node_modules\\', '\\dist\\', '\\coverage\\')
}

$localQuickRunnerCache = [pscustomobject]@{
  roots = @(
    '結構工具箱\tools\local-quick-tools.manifest.json',
    '結構工具箱\tools\local-quick-tools.run.js',
    '結構工具箱\tools\local-quick-browser-smoke.test.js',
    '結構工具箱\tools\local-quick-tools.contract.test.js',
    '結構工具箱\tools\local-quick-export.js',
    '結構工具箱\tools\local-quick-export.test.js',
    '結構工具箱\tools\local-quick-output-consistency.test.js',
    '結構工具箱\tools\foundation',
    '結構工具箱\tools\foundation\foundation-local.html',
    '結構工具箱\tools\test-dashboard.html',
    '結構工具箱\index.html',
    '結構工具箱\index-classic.html',
    '結構工具箱\assets\home',
    'vercel.json'
  )
  extensions = @('.html', '.js', '.json', '.css', '.md')
  excludePatterns = @('\\output\\', '\\node_modules\\')
}

$formalRunnerCache = [pscustomobject]@{
  roots = @(
    '結構工具箱\tools\formal-tools.manifest.json',
    '結構工具箱\tools\formal-tools.run.js',
    '結構工具箱\tools\formal-browser-smoke.test.js',
    '結構工具箱\tools\formal-tools.contract.test.js',
    '結構工具箱\tools\tool-maturity-matrix.js',
    '結構工具箱\tools\風力',
    '結構工具箱\tools\地震力',
    '結構工具箱\core',
    '鋼筋混凝土\shared',
    'TOOL_REPORT_GUIDE.md',
    'vercel.json'
  )
  extensions = @('.html', '.js', '.json', '.css', '.md')
  excludePatterns = @('\\output\\', '\\node_modules\\')
}

$checks = @(
  [pscustomobject]@{
    key = "platform-audit"
    label = "Platform audit (steel, RC, core)"
    workdir = $root
    command = $platformAuditCommand
    slow = $true
    timeoutSeconds = 900
  },
  [pscustomobject]@{
    key = "wind-report-paths"
    label = "Wind shared report path preflight"
    workdir = $root
    command = $windPathCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "continuous-beam"
    label = "Continuous beam regression"
    workdir = $root
    command = "& '.\test-continuous-beam.ps1'"
    slow = $false
  },
  [pscustomobject]@{
    key = "section-tools-contract"
    label = "Section tools feedback contract"
    workdir = $root
    command = $sectionToolsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "decking-tools-contract"
    label = "Decking tool feedback contract"
    workdir = $root
    command = $deckingToolsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "decking-traceability-contract"
    label = "Decking traceability catalog contract"
    workdir = $root
    command = $deckingTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "formal-traceability-contract"
    label = "Formal wind and seismic traceability catalog contract"
    workdir = $root
    command = $formalTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "rc-traceability-contract"
    label = "RC traceability catalog contract"
    workdir = $root
    command = $rcTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "steel-traceability-contract"
    label = "Steel traceability catalog contract"
    workdir = $root
    command = $steelTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "anchor-traceability-contract"
    label = "Anchor traceability catalog contract"
    workdir = $root
    command = $anchorTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "report-disclosure-contract"
    label = "Cross-family report disclosure contract"
    workdir = $root
    command = $reportDisclosureContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "delivery-artifacts-contract"
    label = "Delivery artifact governance contract"
    workdir = $root
    command = $deliveryArtifactsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "release-readiness-contract"
    label = "Release readiness governance contract"
    workdir = $root
    command = $releaseReadinessContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "struct-dx-contract"
    label = "struct.dx frontend feedback contract"
    workdir = $root
    command = $structDxContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-feedback-contract"
    label = "Stone feedback contract"
    workdir = $root
    command = $stoneFeedbackContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-traceability-contract"
    label = "Stone traceability catalog contract"
    workdir = $root
    command = $stoneTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "browser-dialogs-contract"
    label = "Browser dialog contract"
    workdir = $root
    command = $browserDialogsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "toolbox-entrypoints-contract"
    label = "Toolbox entrypoints contract"
    workdir = $root
    command = $toolboxEntrypointsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "staging-groups-coverage"
    label = "Staging groups worktree coverage"
    workdir = $root
    command = $stagingGroupsCoverageCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "launcher-scripts"
    label = "Launcher script smoke"
    workdir = $root
    command = $launcherScriptsCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "generated-artifact-boundary"
    label = "Generated artifact boundary contract"
    workdir = $root
    command = $generatedArtifactBoundaryCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "steel-audit-status"
    label = "Steel audit status freshness gate"
    workdir = $root
    command = $steelAuditStatusCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "rc-audit-status"
    label = "RC audit status freshness gate"
    workdir = $root
    command = $rcAuditStatusCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "core-audit-status"
    label = "Structural core audit status freshness gate"
    workdir = $root
    command = $coreAuditStatusCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "platform-status-refresh"
    label = "Platform audit summary refresh"
    workdir = $root
    command = "& '.\refresh-platform-status.ps1' -Quiet"
    slow = $false
  },
  [pscustomobject]@{
    key = "runtime-pid-cleanliness"
    label = "Runtime stale pid gate"
    workdir = $root
    command = $runtimePidCleanlinessCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "anchor-verify"
    label = "Anchor bolt review verify"
    workdir = (Join-Path $root "螺栓檢討\bolt-review-tool")
    command = 'npm run verify'
    slow = $true
    cache = $anchorVerifyCache
  },
  [pscustomobject]@{
    key = "anchor-route"
    label = "Anchor deployment route preflight"
    workdir = $root
    command = $anchorRouteCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-self-check"
    label = "Stone fixing env and self check"
    workdir = (Join-Path $root "石材固定")
    command = 'python env_check.py; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; python self_check.py; exit $LASTEXITCODE'
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-quick-check"
    label = "Stone fixing quick smoke tests"
    workdir = (Join-Path $root "石材固定")
    command = $stoneQuickCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-launcher"
    label = "Excavation launcher service-boundary smoke"
    workdir = $root
    command = $excavationLauncherCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-traceability-contract"
    label = "Excavation traceability catalog contract"
    workdir = $root
    command = $excavationTraceabilityContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-backend-quick"
    label = "Excavation parser/import/store smoke"
    workdir = (Join-Path $root "開挖擋土支撐")
    command = 'python -m unittest backend.tests.test_parsers backend.tests.test_import_flow backend.tests.test_project_store'
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-backend"
    label = "Excavation support backend tests"
    workdir = (Join-Path $root "開挖擋土支撐")
    command = 'python -m unittest discover -s backend\tests'
    slow = $true
    cache = $excavationBackendCache
  },
  [pscustomobject]@{
    key = "excavation-frontend"
    label = "Excavation support frontend build"
    workdir = (Join-Path $root "開挖擋土支撐\frontend")
    command = 'npm run build'
    slow = $true
    cache = $excavationFrontendCache
  },
  [pscustomobject]@{
    key = "deck-python"
    label = "Cover slab report smoke"
    workdir = (Join-Path $root "覆工板")
    command = $deckReportCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "frame-static"
    label = "Frame analysis static smoke"
    workdir = $root
    command = $frameStaticCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "local-quick-tools-static"
    label = "Local quick tools static contract"
    workdir = $root
    command = $localQuickToolsStaticCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "local-quick-tools-runner"
    label = "Local quick tools manifest runner"
    workdir = $root
    command = $localQuickToolsRunnerCommand
    slow = $true
    cache = $localQuickRunnerCache
    timeoutSeconds = 240
  },
  [pscustomobject]@{
    key = "formal-tools-static"
    label = "Formal wind and seismic static contract"
    workdir = $root
    command = $formalToolsStaticCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "formal-browser-smoke"
    label = "Formal wind and seismic manifest runner"
    workdir = $root
    command = $formalToolsRunnerCommand
    slow = $true
    cache = $formalRunnerCache
    timeoutSeconds = 300
  },
  [pscustomobject]@{
    key = "runtime-pid-cleanliness-final"
    label = "Runtime stale pid final gate"
    workdir = $root
    command = $runtimePidCleanlinessCommand
    slow = $false
  }
)

if ($Quick) {
  $checks = @($checks | Where-Object { -not $_.slow })
}

Update-PreflightHistoryManifest

$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $historyDir $runStamp
New-Item -Path $runDir -ItemType Directory -Force | Out-Null

$records = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$summaryLines = New-Object System.Collections.Generic.List[string]
$preflightStartedAt = Get-Date

if (-not $Quick -and ($ForceSlowChecks -or $ForcePlatformAudit)) {
  Clear-PreflightRuntimeProcesses -Since ((Get-Date).AddHours(-2)) -Reason "release startup existing node cleanup" -ProcessNames @("node")
  Wait-PreflightRuntimeCooldown -Reason "release slow checks startup" -Seconds 20
}

foreach ($check in $checks) {
  $record = Try-InvokeCachedPreflightCheck -Check $check -RunDir $runDir
  if ($null -eq $record) {
    $timeoutSeconds = if ($check.PSObject.Properties['timeoutSeconds']) { [int]$check.timeoutSeconds } else { 180 }
    $record = Invoke-PreflightCheck -Key $check.key -Label $check.label -Workdir $check.workdir -Command $check.command -RunDir $runDir -TimeoutSeconds $timeoutSeconds
    $transientRetryCount = 0
    while (-not [bool]$record.pass -and [bool]$check.slow -and $transientRetryCount -lt 2 -and (Test-PreflightTransientRuntimeFailure -LogPath ([string]$record.historyLog))) {
      $transientRetryCount += 1
      Clear-PreflightRuntimeProcesses -Since $preflightStartedAt -Reason "transient failure in $($check.key)"
      Wait-PreflightRuntimeCooldown -Reason "retry $transientRetryCount for $($check.key)" -Seconds 60
      $record = Invoke-PreflightCheck -Key $check.key -Label $check.label -Workdir $check.workdir -Command $check.command -RunDir $runDir -TimeoutSeconds $timeoutSeconds
    }
    Update-SlowCheckStatus -Check $check -Record $record -RunStamp $runStamp
  }
  $records.Add($record)
  $summaryLines.Add("- $($record.label): pass=$($record.pass), exitCode=$($record.exitCode), seconds=$($record.seconds), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")
  if (-not $record.pass) {
    $failures.Add("$($record.key): exitCode=$($record.exitCode), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")
  }
  $recordWasReused = $false
  if ($null -ne $record.PSObject.Properties['reused']) { $recordWasReused = [bool]$record.reused }
  if (-not $Quick -and [bool]$check.slow -and -not $recordWasReused) {
    Wait-PreflightRuntimeCooldown -Reason "after slow check $($check.key)" -Seconds 8
  }
}

$forbiddenLogPattern = "[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\uE000-\uF8FF]"
foreach ($record in $records) {
  if (-not [bool]$record.pass) { continue }
  $recordLogPath = [string]$record.log
  if ([string]::IsNullOrWhiteSpace($recordLogPath) -or -not (Test-Path -LiteralPath $recordLogPath)) { continue }
  $recordLogText = Get-Content -LiteralPath $recordLogPath -Raw -Encoding UTF8
  if ($recordLogText -match $forbiddenLogPattern) {
    $failures.Add("$($record.key): log contains mojibake/control glyphs, log=$($record.log), historyLog=$($record.historyLog)")
  }
}

$overallPass = ($failures.Count -eq 0)
$runRecordsCount = $records.Count
$runPassedCount = @($records | Where-Object { $_.pass }).Count
$runTotalSeconds = 0.0
foreach ($record in $records) {
  if ($null -ne $record.seconds) { $runTotalSeconds += [double]$record.seconds }
}
$runTotalSeconds = [Math]::Round($runTotalSeconds, 1)
$runFailedKeys = New-Object System.Collections.Generic.List[string]
$runSlowReuseKeys = New-Object System.Collections.Generic.List[string]
foreach ($record in $records) {
  if (-not [bool]$record.pass) { $runFailedKeys.Add([string]$record.key) }
  $recordReused = $false
  if ($null -ne $record.PSObject.Properties['reused']) {
    $recordReused = [bool]$record.reused
  }
  if ($recordReused) { $runSlowReuseKeys.Add([string]$record.key) }
}
$runPlatformAuditMode = ""
$runPlatformAuditReused = $null
$runPlatformAuditDecisionPath = ""
$runPlatformAuditRecord = @($records | Where-Object { $_.key -eq "platform-audit" } | Select-Object -First 1)
if ($runPlatformAuditRecord.Count -gt 0) {
  $runPlatformAuditLog = [string]$runPlatformAuditRecord[0].historyLog
  if (-not $runPlatformAuditLog) { $runPlatformAuditLog = [string]$runPlatformAuditRecord[0].log }
  if ($runPlatformAuditLog -and (Test-Path -LiteralPath $runPlatformAuditLog)) {
    $runPlatformAuditText = Get-Content -LiteralPath $runPlatformAuditLog -Raw -Encoding UTF8
    if ($runPlatformAuditText -match "mode=([A-Za-z0-9\-]+)") { $runPlatformAuditMode = $matches[1] }
    if ($runPlatformAuditText -match "reused=([A-Za-z]+)") { $runPlatformAuditReused = [System.Convert]::ToBoolean($matches[1]) }
    if ($runPlatformAuditText -match "decision=([^\r\n]+)") { $runPlatformAuditDecisionPath = $matches[1].Trim() }
  }
}

$runSlowRecords = New-Object System.Collections.Generic.List[object]
$runSortedRecords = @($records | Sort-Object -Property @{
  Expression = { if ($null -eq $_.seconds) { 0 } else { [double]$_.seconds } }
  Descending = $true
} | Select-Object -First 3)
foreach ($record in $runSortedRecords) {
  $recordSeconds = 0.0
  if ($null -ne $record.seconds) { $recordSeconds = [Math]::Round([double]$record.seconds, 1) }
  $runSlowRecords.Add([pscustomobject]@{
    key = [string]$record.key
    label = [string]$record.label
    seconds = $recordSeconds
    pass = [bool]$record.pass
    mode = [string]$record.mode
    reused = if ($null -ne $record.PSObject.Properties['reused']) { [bool]$record.reused } else { $false }
    workdirRelative = [string]$record.workdirRelative
    commandHash = [string]$record.commandHash
    log = [string]$record.log
    historyLog = [string]$record.historyLog
  })
}
$runSlowestKey = ""
$runSlowestSeconds = 0.0
$runSlowestText = "-"
if ($runSlowRecords.Count -gt 0) {
  $runSlowestKey = [string]$runSlowRecords[0].key
  $runSlowestSeconds = [double]$runSlowRecords[0].seconds
  $runSlowestText = "$runSlowestKey $($runSlowestSeconds)s"
}
$summaryMetricLines = New-Object System.Collections.Generic.List[string]
$summaryMetricLines.Add("- recordsCount: $runRecordsCount")
$summaryMetricLines.Add("- passedCount: $runPassedCount")
$summaryMetricLines.Add("- failedKeys: $(Format-HistoryMarkdownListCell @($runFailedKeys.ToArray()))")
$summaryMetricLines.Add("- slowReuseCount: $($runSlowReuseKeys.Count)")
$summaryMetricLines.Add("- slowReuseKeys: $(Format-HistoryMarkdownListCell @($runSlowReuseKeys.ToArray()))")
$summaryMetricLines.Add("- platformAuditMode: $(Format-HistoryMarkdownCell $runPlatformAuditMode)")
$summaryMetricLines.Add("- platformAuditReused: $runPlatformAuditReused")
$summaryMetricLines.Add("- platformAuditDecisionPath: $(Format-HistoryMarkdownCell $runPlatformAuditDecisionPath)")
$summaryMetricLines.Add("- totalSeconds: $runTotalSeconds")
$summaryMetricLines.Add("- slowest: $runSlowestText")
if ($runSlowRecords.Count -gt 0) {
  $summaryMetricLines.Add("- slowestRecords:")
  foreach ($record in $runSlowRecords) {
    $summaryMetricLines.Add("  - $($record.key): seconds=$($record.seconds), pass=$($record.pass), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")
  }
} else {
  $summaryMetricLines.Add("- slowestRecords: []")
}

$summaryPath = Join-Path $outputDir "preflight-summary.md"
$summaryJsonPath = Join-Path $outputDir "preflight-summary.json"
$historySummaryPath = Join-Path $runDir "preflight-summary.md"
$historySummaryJsonPath = Join-Path $runDir "preflight-summary.json"

$summaryContent = @(
  "# Tool Preflight Summary"
  ""
  "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  "- root: $root"
  "- runId: $runStamp"
  "- quick: $([bool]$Quick)"
  "- forcePlatformAudit: $([bool]$ForcePlatformAudit)"
  "- forceSlowChecks: $([bool]$ForceSlowChecks)"
  "- pass: $overallPass"
  $summaryMetricLines
  ""
  $summaryLines
)

Write-TextFile -Path $summaryPath -Value $summaryContent
Write-TextFile -Path $historySummaryPath -Value $summaryContent

$payload = [ordered]@{
  generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  root = $root
  runId = $runStamp
  quick = [bool]$Quick
  forcePlatformAudit = [bool]$ForcePlatformAudit
  forceSlowChecks = [bool]$ForceSlowChecks
  pass = $overallPass
  failureCount = $failures.Count
  failures = @($failures.ToArray())
  failedKeys = @($runFailedKeys.ToArray())
  slowReuseCount = $runSlowReuseKeys.Count
  slowReuseKeys = @($runSlowReuseKeys.ToArray())
  platformAuditMode = $runPlatformAuditMode
  platformAuditReused = $runPlatformAuditReused
  platformAuditDecisionPath = $runPlatformAuditDecisionPath
  recordsCount = $runRecordsCount
  passedCount = $runPassedCount
  totalSeconds = $runTotalSeconds
  slowestKey = $runSlowestKey
  slowestSeconds = $runSlowestSeconds
  slowestText = $runSlowestText
  slowestRecords = @($runSlowRecords.ToArray())
  records = @($records.ToArray())
}
Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 6
Write-JsonFile -Path $historySummaryJsonPath -Value $payload -Depth 6

$maturityMatrixScript = Join-Path $root "結構工具箱\tools\tool-maturity-matrix.js"
if ($overallPass -and (Test-Path -LiteralPath $maturityMatrixScript)) {
  $matrixProc = Start-Process -FilePath node -ArgumentList @(
    $maturityMatrixScript,
    "--write",
    "--check"
  ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $runDir "tool-maturity-matrix.stdout.txt") -RedirectStandardError (Join-Path $runDir "tool-maturity-matrix.stderr.txt") -PassThru -Wait -WindowStyle Hidden
  if ($matrixProc.ExitCode -ne 0) {
    $overallPass = $false
    $matrixLog = Join-Path $runDir "tool-maturity-matrix.stderr.txt"
    $failures.Add("tool-maturity-matrix-refresh: exitCode=$($matrixProc.ExitCode), log=$matrixLog")
    $summaryContent = @(
      "# Tool Preflight Summary"
      ""
      "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
      "- root: $root"
      "- runId: $runStamp"
      "- quick: $([bool]$Quick)"
      "- forcePlatformAudit: $([bool]$ForcePlatformAudit)"
      "- forceSlowChecks: $([bool]$ForceSlowChecks)"
      "- pass: $overallPass"
      $summaryMetricLines
      ""
      $summaryLines
      "- Tool maturity matrix refresh: pass=False, exitCode=$($matrixProc.ExitCode), log=$matrixLog"
    )
    Write-TextFile -Path $summaryPath -Value $summaryContent
    Write-TextFile -Path $historySummaryPath -Value $summaryContent
    $payload["pass"] = $overallPass
    $payload["failureCount"] = $failures.Count
    $payload["failures"] = @($failures.ToArray())
    Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 6
    Write-JsonFile -Path $historySummaryJsonPath -Value $payload -Depth 6
  } else {
    Update-PreflightHistoryManifest
    function Publish-PreflightPostChecks {
      param([object[]]$Checks)

      $checksArray = @($Checks)
      $passedCount = @($checksArray | Where-Object { $_.pass }).Count
      $failedKeys = @($checksArray | Where-Object { -not $_.pass } | ForEach-Object { $_.key })
      Write-JsonFile -Path (Join-Path $outputDir "post-checks.json") -Value $checksArray -Depth 6
      Write-JsonFile -Path (Join-Path $runDir "post-checks.json") -Value $checksArray -Depth 6

      $payload["pass"] = $overallPass
      $payload["failureCount"] = $failures.Count
      $payload["failures"] = @($failures.ToArray())
      $payload["postCheckCount"] = $checksArray.Count
      $payload["postChecksPassedCount"] = $passedCount
      $payload["postCheckFailures"] = @($failedKeys)
      $payload["postChecks"] = @($checksArray)

      $failureText = if ($failedKeys.Count -gt 0) { $failedKeys -join ", " } else { "[]" }
      $summaryLinesLocal = @(
        "- postCheckCount: $($checksArray.Count)",
        "- postChecksPassedCount: $passedCount",
        "- postCheckFailures: $failureText"
      )
      $detailLinesLocal = New-Object System.Collections.Generic.List[string]
      foreach ($checkRecord in $checksArray) {
        $detailLinesLocal.Add("- $($checkRecord.label): pass=$($checkRecord.pass), exitCode=$($checkRecord.exitCode), log=$($checkRecord.log), historyLog=$($checkRecord.historyLog)")
      }
      $content = @(
        "# Tool Preflight Summary",
        "",
        "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "- root: $root",
        "- runId: $runStamp",
        "- quick: $([bool]$Quick)",
        "- forcePlatformAudit: $([bool]$ForcePlatformAudit)",
        "- forceSlowChecks: $([bool]$ForceSlowChecks)",
        "- pass: $overallPass",
        $summaryMetricLines,
        $summaryLinesLocal,
        "",
        $summaryLines,
        $detailLinesLocal
      )
      Write-TextFile -Path $summaryPath -Value $content
      Write-TextFile -Path $historySummaryPath -Value $content
      Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 6
      Write-JsonFile -Path $historySummaryJsonPath -Value $payload -Depth 6

      return [pscustomobject]@{
        checks = @($checksArray)
        count = $checksArray.Count
        passedCount = $passedCount
        failedKeys = @($failedKeys)
        summaryLines = @($summaryLinesLocal)
        detailLines = @($detailLinesLocal.ToArray())
      }
    }

    $postCheckRecords = New-Object System.Collections.Generic.List[object]
    $finalContractRecord = Invoke-PreflightCheck -Key "audit-dashboard-contract-final" -Label "Audit dashboard final output contract" -Workdir $root -Command $auditDashboardContractCommand -RunDir $runDir
    $postCheckRecords.Add($finalContractRecord)
    if (-not $Quick) {
      $finalBrowserSmokeRecord = Invoke-PreflightCheck -Key "audit-dashboard-browser-smoke-final" -Label "Audit dashboard final browser smoke" -Workdir $root -Command $auditDashboardBrowserSmokeCommand -RunDir $runDir
      $postCheckRecords.Add($finalBrowserSmokeRecord)
      Publish-PreflightPostChecks -Checks @($postCheckRecords.ToArray()) | Out-Null
      Update-PreflightHistoryManifest
      $finalLiveOutputSmokeRecord = Invoke-PreflightCheck -Key "audit-dashboard-live-output-smoke-final" -Label "Audit dashboard final live-output smoke" -Workdir $root -Command $auditDashboardLiveOutputSmokeCommand -RunDir $runDir
      $postCheckRecords.Add($finalLiveOutputSmokeRecord)
    }

    $postChecks = @($postCheckRecords.ToArray())
    foreach ($postCheckRecord in $postChecks) {
      if (-not $postCheckRecord.pass) {
        $overallPass = $false
        $failures.Add("$($postCheckRecord.key): exitCode=$($postCheckRecord.exitCode), mode=$($postCheckRecord.mode), reused=$($postCheckRecord.reused), workdir=$($postCheckRecord.workdirRelative), commandHash=$($postCheckRecord.commandHash), log=$($postCheckRecord.log), historyLog=$($postCheckRecord.historyLog)")
      }
    }
    $postCheckState = Publish-PreflightPostChecks -Checks $postChecks
    $postCheckCount = $postCheckState.count
    $postChecksPassedCount = $postCheckState.passedCount
    $postCheckFailures = @($postCheckState.failedKeys)
    $postCheckSummaryLines = @($postCheckState.summaryLines)
    $postCheckDetailLines = @($postCheckState.detailLines)
    $postSummaryMatrixProc = Start-Process -FilePath node -ArgumentList @(
      $maturityMatrixScript,
      "--write",
      "--check"
    ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $runDir "tool-maturity-matrix-final.stdout.txt") -RedirectStandardError (Join-Path $runDir "tool-maturity-matrix-final.stderr.txt") -PassThru -Wait -WindowStyle Hidden
    if ($postSummaryMatrixProc.ExitCode -ne 0) {
      $overallPass = $false
      $matrixLog = Join-Path $runDir "tool-maturity-matrix-final.stderr.txt"
      $failures.Add("tool-maturity-matrix-final-refresh: exitCode=$($postSummaryMatrixProc.ExitCode), log=$matrixLog")
      $payload["pass"] = $overallPass
      $payload["failureCount"] = $failures.Count
      $payload["failures"] = @($failures.ToArray())
      $summaryContent = @(
        "# Tool Preflight Summary",
        "",
        "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "- root: $root",
        "- runId: $runStamp",
        "- quick: $([bool]$Quick)",
        "- forcePlatformAudit: $([bool]$ForcePlatformAudit)",
        "- forceSlowChecks: $([bool]$ForceSlowChecks)",
        "- pass: $overallPass",
        $summaryMetricLines,
        $postCheckSummaryLines,
        "",
        $summaryLines,
        $postCheckDetailLines,
        "- Tool maturity matrix final refresh: pass=False, exitCode=$($postSummaryMatrixProc.ExitCode), log=$matrixLog"
      )
      Write-TextFile -Path $summaryPath -Value $summaryContent
      Write-TextFile -Path $historySummaryPath -Value $summaryContent
      Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 6
      Write-JsonFile -Path $historySummaryJsonPath -Value $payload -Depth 6
    }
  }
}

Update-PreflightHistoryManifest

if ($overallPass) {
  Write-Status "Tool preflight completed cleanly. runId=$runStamp" "Green" -Force
  Write-Status "Summary: $summaryPath" "DarkGreen" -Force
  exit 0
}

Write-Status "Tool preflight found issues. runId=$runStamp" "Red" -Force
Write-Status ("Failures: " + ($failures -join "; ")) "Red" -Force
Write-Status "Summary: $summaryPath" "DarkRed" -Force
exit 1
