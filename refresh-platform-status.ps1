param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$auditOutputDir = Join-Path $root "output\audit"
$historyDir = Join-Path $auditOutputDir "history"
$preflightOutputDir = Join-Path $root "output\preflight"
$decisionPath = Join-Path $preflightOutputDir "platform-audit-decision.json"

if (-not (Test-Path $auditOutputDir)) {
  New-Item -Path $auditOutputDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $historyDir)) {
  New-Item -Path $historyDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $preflightOutputDir)) {
  New-Item -Path $preflightOutputDir -ItemType Directory | Out-Null
}

function Write-Status {
  param(
    [string]$Message,
    [string]$Color = "Gray"
  )

  if ($Quiet) { return }
  Write-Host $Message -ForegroundColor $Color
}

function Get-TextFileLines {
  param([object]$Value)

  if ($null -eq $Value) { return @() }
  if ($Value -is [string]) { return @($Value) }
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

function Read-ComponentStatus {
  param(
    [string]$Key,
    [string]$Label,
    [string]$StatusPath
  )

  if (-not (Test-Path -LiteralPath $StatusPath)) {
    throw "Missing component audit status for ${Key}: $StatusPath"
  }

  $status = Get-Content -LiteralPath $StatusPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $summaryPath = [string]$status.lastSummary
  $historySummaryPath = [string]$status.lastHistorySummary

  if (-not $summaryPath -or -not (Test-Path -LiteralPath $summaryPath)) {
    throw "Missing component summary for ${Key}: $summaryPath"
  }
  if (-not $historySummaryPath -or -not (Test-Path -LiteralPath $historySummaryPath)) {
    throw "Missing component history summary for ${Key}: $historySummaryPath"
  }

  $failureCount = 0
  if ($null -ne $status.failureCount) {
    $failureCount = [int]$status.failureCount
  }
  $pass = [bool]$status.pass -and $failureCount -eq 0

  return [pscustomobject]@{
    key = $Key
    label = $Label
    exitCode = if ($pass) { 0 } else { 1 }
    pass = $pass
    log = $StatusPath
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
  }
}

function Update-HistoryManifest {
  $historyManifestPath = Join-Path $auditOutputDir "platform-history.json"
  $historyItems = New-Object System.Collections.Generic.List[object]

  $runDirs = Get-ChildItem -Path $historyDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 12

  foreach ($dir in $runDirs) {
    $summaryMarkdownPath = Join-Path $dir.FullName "platform-summary.md"
    $jsonPath = Join-Path $dir.FullName "platform-summary.json"
    if (-not (Test-Path -LiteralPath $jsonPath)) { continue }
    try {
      $payload = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $historyItems.Add([pscustomobject]@{
        runId = $payload.runId
        generatedAt = $payload.generatedAt
        pass = [bool]$payload.pass
        failureCount = [int]$payload.failureCount
        failures = @($payload.failures)
        summaryPath = $summaryMarkdownPath
        summaryJsonPath = $jsonPath
        summaryHash = Get-FileHashSha256 -Path $summaryMarkdownPath
        summaryJsonHash = Get-FileHashSha256 -Path $jsonPath
        summaryMtime = Get-FileMtimeIso -Path $summaryMarkdownPath
        summaryJsonMtime = Get-FileMtimeIso -Path $jsonPath
        source = $payload.source
        sourceTrace = $payload.sourceTrace
        records = @($payload.records)
      })
    } catch {
      continue
    }
  }

  [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    root = $root
    count = $historyItems.Count
    items = @($historyItems.ToArray())
  } | ForEach-Object { Write-JsonFile -Path $historyManifestPath -Value $_ -Depth 10 }
}

$steelDir = Resolve-RequiredDirectory -Key "steel" -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath "plate-check.html") -and
    (Test-ChildPath -BasePath $dir -RelativePath "audit-tool.ps1")
}
$rcDir = Resolve-RequiredDirectory -Key "rc" -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath "shared\common.js") -and
    (Test-ChildPath -BasePath $dir -RelativePath "audit-tool.ps1")
}
$coreDir = Resolve-RequiredDirectory -Key "core" -Predicate {
  param($dir)
  (Test-ChildPath -BasePath $dir -RelativePath "core\wind-report.js") -and
    (Test-ChildPath -BasePath $dir -RelativePath "audit-core.ps1")
}

$components = @(
  @{
    Key = "steel"
    Label = "Steel formal audit"
    StatusPath = (Join-Path $steelDir "output\audit\audit-status.json")
  },
  @{
    Key = "rc"
    Label = "RC audit"
    StatusPath = (Join-Path $rcDir "output\audit\audit-status.json")
  },
  @{
    Key = "core"
    Label = "Structural core audit"
    StatusPath = (Join-Path $coreDir "output\audit\audit-status.json")
  }
)

$records = New-Object System.Collections.Generic.List[object]
$summaryLines = New-Object System.Collections.Generic.List[string]
$failures = New-Object System.Collections.Generic.List[string]

foreach ($component in $components) {
  $record = Read-ComponentStatus -Key $component.Key -Label $component.Label -StatusPath $component.StatusPath
  $records.Add($record)
  if (-not $record.pass) {
    $failures.Add("$($record.key): failureCount=$($record.failureCount), runId=$($record.runId)")
  }
  $summaryHashShort = if ($record.summaryHash) { $record.summaryHash.Substring(0, [Math]::Min(12, $record.summaryHash.Length)) } else { '-' }
  $statusHashShort = if ($record.statusHash) { $record.statusHash.Substring(0, [Math]::Min(12, $record.statusHash.Length)) } else { '-' }
  $summaryLines.Add("- $($record.label): pass=$($record.pass), status=$($record.statusPath), statusHash=$statusHashShort")
  $summaryLines.Add("  runId=$($record.runId), failureCount=$($record.failureCount), generatedAt=$($record.generatedAt)")
  $summaryLines.Add("  summary=$($record.summaryPath), summaryHash=$summaryHashShort")
}

$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $historyDir $runStamp
New-Item -Path $runDir -ItemType Directory -Force | Out-Null

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
  "- source: component-status-refresh"
  ""
  $summaryLines
)
Write-TextFile -Path $summaryPath -Value $summaryContent
Write-TextFile -Path $historySummaryPath -Value $summaryContent

$sourceTrace = [ordered]@{
  componentStatusFiles = @($records.ToArray() | ForEach-Object {
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
$payload = [ordered]@{
  generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  root = $root
  runId = $runStamp
  pass = $overallPass
  source = "component-status-refresh"
  sourceTrace = $sourceTrace
  failureCount = $failures.Count
  failures = @($failures.ToArray())
  records = @($records.ToArray())
}
Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 10
Write-JsonFile -Path $historySummaryJsonPath -Value $payload -Depth 10
$decisionPayload = [ordered]@{
  generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  root = $root
  mode = "component-status-refresh"
  reused = $true
  force = $false
  decisionPath = $decisionPath
  source = "component-status-refresh"
  sourceTrace = $sourceTrace
  components = @($records.ToArray())
}
Write-JsonFile -Path $decisionPath -Value $decisionPayload -Depth 10

$platformSummaryHash = Get-FileHashSha256 -Path $summaryPath
$platformSummaryJsonHash = Get-FileHashSha256 -Path $summaryJsonPath
$platformHistorySummaryHash = Get-FileHashSha256 -Path $historySummaryPath
$platformHistorySummaryJsonHash = Get-FileHashSha256 -Path $historySummaryJsonPath

[ordered]@{
  generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  root = $root
  runId = $runStamp
  quiet = [bool]$Quiet
  loop = $false
  pass = $overallPass
  source = "component-status-refresh"
  failureCount = $failures.Count
  modules = @("steel", "rc", "core")
  lastSummary = $summaryPath
  lastSummaryHash = $platformSummaryHash
  lastSummaryMtime = Get-FileMtimeIso -Path $summaryPath
  lastSummaryJson = $summaryJsonPath
  lastSummaryJsonHash = $platformSummaryJsonHash
  lastSummaryJsonMtime = Get-FileMtimeIso -Path $summaryJsonPath
  lastHistorySummary = $historySummaryPath
  lastHistorySummaryHash = $platformHistorySummaryHash
  lastHistorySummaryMtime = Get-FileMtimeIso -Path $historySummaryPath
  lastHistorySummaryJson = $historySummaryJsonPath
  lastHistorySummaryJsonHash = $platformHistorySummaryJsonHash
  lastHistorySummaryJsonMtime = Get-FileMtimeIso -Path $historySummaryJsonPath
} | ForEach-Object { Write-JsonFile -Path $statusPath -Value $_ -Depth 8 }

Update-HistoryManifest

if ($overallPass) {
  Write-Status "Platform status refreshed from component audit statuses. runId=$runStamp" "Green"
  Write-Output "platform status refresh OK (runId=$runStamp)"
  exit 0
}

Write-Status "Platform status refresh found failures. runId=$runStamp" "Red"
Write-Error ("Platform status refresh failures: " + ($failures -join "; "))
exit 1