param(
  [switch]$Quiet,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $root "output\preflight"
$decisionPath = Join-Path $outputDir "platform-audit-decision.json"
$decisionLogPath = "output\preflight\platform-audit-decision.json"

if (-not (Test-Path -LiteralPath $outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

function Write-Status {
  param(
    [string]$Message,
    [string]$Color = "Gray"
  )
  if ($Quiet) { return }
  Write-Host $Message -ForegroundColor $Color
}

function Test-ChildPath {
  param(
    [string]$BasePath,
    [string]$RelativePath
  )
  return (Test-Path -LiteralPath (Join-Path $BasePath $RelativePath))
}

function Resolve-RequiredDirectory {
  param(
    [string]$Key,
    [scriptblock]$Predicate
  )

  $matches = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object {
    & $Predicate $_.FullName
  })

  if ($matches.Count -eq 0) {
    throw "Unable to resolve component directory: $Key"
  }
  if ($matches.Count -gt 1) {
    $names = ($matches | ForEach-Object { $_.FullName }) -join "; "
    throw "Ambiguous component directory for ${Key}: $names"
  }
  return $matches[0].FullName
}

function Read-Json {
  param([string]$Path)
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
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

function Get-TextHash {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-FileText {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return '' }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).TrimStart([char]0xFEFF)
}

function Get-FileHashSha256 {
  param([string]$Path)
  $text = Get-FileText -Path $Path
  if ([string]::IsNullOrEmpty($text)) { return '' }
  return Get-TextHash $text
}

function Get-FileMtimeIso {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return '' }
  $file = Get-Item -LiteralPath $Path
  return $file.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

function Get-NewerSourceFiles {
  param(
    [string[]]$Roots,
    [datetime]$AuditTime,
    [string[]]$Extensions,
    [string[]]$ExcludePatterns,
    [string[]]$ExtraFiles = @()
  )

  $items = @()
  foreach ($rootPath in $Roots) {
    if (-not (Test-Path -LiteralPath $rootPath)) { continue }
    $items += Get-ChildItem -LiteralPath $rootPath -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
      $full = $_.FullName
      $excluded = $false
      foreach ($pattern in $ExcludePatterns) {
        if ($full -match $pattern) {
          $excluded = $true
          break
        }
      }
      -not $excluded -and
        $Extensions -contains $_.Extension.ToLowerInvariant() -and
        $_.LastWriteTime -gt $AuditTime.AddSeconds(2)
    }
  }

  foreach ($filePath in $ExtraFiles) {
    if (-not (Test-Path -LiteralPath $filePath)) { continue }
    $file = Get-Item -LiteralPath $filePath
    if ($file.LastWriteTime -gt $AuditTime.AddSeconds(2)) {
      $items += $file
    }
  }

  return @($items | Sort-Object LastWriteTime -Descending)
}

function Test-ComponentStatusFresh {
  param(
    [string]$Key,
    [string]$Label,
    [string]$StatusPath,
    [string[]]$SourceRoots,
    [string[]]$SourceExtensions,
    [string[]]$ExcludePatterns,
    [string[]]$ExtraFiles = @()
  )

  if (-not (Test-Path -LiteralPath $StatusPath)) {
    return [pscustomobject]@{
      key = $Key
      label = $Label
      pass = $false
      fresh = $false
      statusPath = $StatusPath
      statusHash = ''
      statusMtime = ''
      summaryPath = ''
      summaryHash = ''
      summaryMtime = ''
      historySummaryPath = ''
      historySummaryHash = ''
      historySummaryMtime = ''
      runId = ''
      generatedAt = ''
      failureCount = 1
      reason = 'missing status'
      newerFiles = @()
    }
  }

  $statusFile = Get-Item -LiteralPath $StatusPath
  $status = Read-Json -Path $StatusPath
  $failureCount = if ($null -ne $status.failureCount) { [int]$status.failureCount } else { 1 }
  $statusPass = [bool]$status.pass -and $failureCount -eq 0
  $summaryPath = [string]$status.lastSummary
  $historySummaryPath = [string]$status.lastHistorySummary

  $summaryPaths = @($summaryPath, $historySummaryPath)
  $missingSummaries = @($summaryPaths | Where-Object { -not $_ -or -not (Test-Path -LiteralPath $_) })
  $newer = Get-NewerSourceFiles `
    -Roots $SourceRoots `
    -AuditTime $statusFile.LastWriteTime `
    -Extensions $SourceExtensions `
    -ExcludePatterns $ExcludePatterns `
    -ExtraFiles $ExtraFiles

  $reasonParts = New-Object System.Collections.Generic.List[string]
  if (-not $statusPass) { $reasonParts.Add('status did not pass') }
  if ($missingSummaries.Count -gt 0) { $reasonParts.Add('missing referenced summary') }
  if ($newer.Count -gt 0) { $reasonParts.Add('source newer than status') }

  return [pscustomobject]@{
    key = $Key
    label = $Label
    pass = $statusPass
    fresh = ($statusPass -and $missingSummaries.Count -eq 0 -and $newer.Count -eq 0)
    statusPath = $StatusPath
    statusHash = Get-FileHashSha256 -Path $StatusPath
    statusMtime = Get-FileMtimeIso -Path $StatusPath
    summaryPath = $summaryPath
    summaryHash = Get-FileHashSha256 -Path $summaryPath
    summaryMtime = Get-FileMtimeIso -Path $summaryPath
    historySummaryPath = $historySummaryPath
    historySummaryHash = Get-FileHashSha256 -Path $historySummaryPath
    historySummaryMtime = Get-FileMtimeIso -Path $historySummaryPath
    runId = [string]$status.runId
    generatedAt = [string]$status.generatedAt
    failureCount = $failureCount
    reason = if ($reasonParts.Count) { ($reasonParts -join '; ') } else { 'fresh' }
    newerFiles = @($newer | Select-Object -First 8 | ForEach-Object {
      [pscustomobject]@{
        path = $_.FullName
        lastWriteTime = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
      }
    })
  }
}

function Get-DecisionSourceTrace {
  param([object[]]$Components)

  return [ordered]@{
    componentStatusFiles = @($Components | ForEach-Object {
      [pscustomobject]@{
        key = $_.key
        statusPath = $_.statusPath
        statusHash = $_.statusHash
        statusMtime = $_.statusMtime
        summaryPath = $_.summaryPath
        summaryHash = $_.summaryHash
        summaryMtime = $_.summaryMtime
      }
    })
  }
}

function Write-Decision {
  param([object]$Decision)
  Write-JsonFile -Path $decisionPath -Value $Decision -Depth 10
}

$steelDir = Resolve-RequiredDirectory -Key 'steel' -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath 'plate-check.html') -and
    (Test-ChildPath -BasePath $dir -RelativePath 'audit-tool.ps1')
}
$rcDir = Resolve-RequiredDirectory -Key 'rc' -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath 'shared\common.js') -and
    (Test-ChildPath -BasePath $dir -RelativePath 'audit-tool.ps1')
}
$coreDir = Resolve-RequiredDirectory -Key 'core' -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath 'core\wind-report.js') -and
    (Test-ChildPath -BasePath $dir -RelativePath 'audit-core.ps1')
}

function Get-PlatformComponentResults {
  $steelResult = Test-ComponentStatusFresh `
    -Key 'steel' `
    -Label 'Steel formal audit' `
    -StatusPath (Join-Path $steelDir 'output\audit\audit-status.json') `
    -SourceRoots @($steelDir) `
    -SourceExtensions @('.html', '.js', '.json', '.ps1', '.bat', '.md', '.css') `
    -ExcludePatterns @('\\output\\audit\\', '\\node_modules\\')

  $rcResult = Test-ComponentStatusFresh `
    -Key 'rc' `
    -Label 'RC audit' `
    -StatusPath (Join-Path $rcDir 'output\audit\audit-status.json') `
    -SourceRoots @($rcDir) `
    -SourceExtensions @('.html', '.js', '.json', '.ps1', '.bat', '.md') `
    -ExcludePatterns @('\\output\\audit\\', '\\tools\\\.[^\\]+-testdeps\\', '\\node_modules\\')

  $coreResult = Test-ComponentStatusFresh `
    -Key 'core' `
    -Label 'Structural core audit' `
    -StatusPath (Join-Path $coreDir 'output\audit\audit-status.json') `
    -SourceRoots @((Join-Path $coreDir 'core'), (Join-Path $coreDir 'tests')) `
    -SourceExtensions @('.html', '.js', '.json', '.ps1', '.bat', '.md', '.css') `
    -ExcludePatterns @('\\output\\audit\\', '\\node_modules\\') `
    -ExtraFiles @((Join-Path $coreDir 'audit-core.ps1'))

  return @($steelResult, $rcResult, $coreResult)
}

$componentResults = Get-PlatformComponentResults
$allFresh = @($componentResults | Where-Object { -not $_.fresh }).Count -eq 0
$refreshScript = Join-Path $root 'refresh-platform-status.ps1'
$auditAllScript = Join-Path $root 'audit-all.ps1'

if ($allFresh -and -not $Force) {
  Write-Status 'Reusing fresh component audit statuses.' 'Green'
  & $refreshScript -Quiet
  $componentResults = Get-PlatformComponentResults
  $decision = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    mode = 'reuse-status'
    reused = $true
    force = [bool]$Force
    decisionPath = $decisionPath
    sourceTrace = Get-DecisionSourceTrace -Components $componentResults
    components = @($componentResults)
  }
  Write-Decision -Decision $decision
  Write-Output "platform audit preflight mode=reuse-status reused=True force=$([bool]$Force)"
  foreach ($component in $componentResults) {
    $statusHashShort = if ($component.statusHash) { $component.statusHash.Substring(0, [Math]::Min(12, $component.statusHash.Length)) } else { '-' }
    Write-Output "component $($component.key): fresh=$($component.fresh), runId=$($component.runId), generatedAt=$($component.generatedAt), statusHash=$statusHashShort"
  }
  Write-Output "decision=$decisionLogPath"
  exit 0
}

$reasons = @($componentResults | Where-Object { -not $_.fresh } | ForEach-Object {
  "$($_.key): $($_.reason)"
})
if ($Force) {
  $reasons = @('force requested') + $reasons
}

Write-Status 'Running full platform audit.' 'Yellow'
try {
  & $auditAllScript -Quiet
  $componentResults = Get-PlatformComponentResults
  $decision = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    mode = 'run-audit-all'
    reused = $false
    force = [bool]$Force
    decisionPath = $decisionPath
    reasons = @($reasons)
    sourceTrace = Get-DecisionSourceTrace -Components $componentResults
    components = @($componentResults)
  }
  Write-Decision -Decision $decision
  Write-Output "platform audit preflight mode=run-audit-all reused=False force=$([bool]$Force)"
  foreach ($reason in $reasons) {
    Write-Output "reason=$reason"
  }
  Write-Output "decision=$decisionLogPath"
  exit 0
} catch {
  $decision = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    mode = 'run-audit-all'
    reused = $false
    force = [bool]$Force
    decisionPath = $decisionPath
    reasons = @($reasons)
    error = $_.Exception.Message
    sourceTrace = Get-DecisionSourceTrace -Components $componentResults
    components = @($componentResults)
  }
  Write-Decision -Decision $decision
  Write-Error $_.Exception.Message
  exit 1
}