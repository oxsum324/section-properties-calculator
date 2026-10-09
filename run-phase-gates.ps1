[CmdletBinding()]
param(
    [switch]$ListCommands,
    [switch]$SelfTestFailure,
    [string]$RunTimestamp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-V3PhaseCommands {
    $dispatchRelativePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('X3RtcC/mtL7lt6Uv5bCP5bel5YW35YSq5YyW5rS+5bel5oyH56S6LTIwMjYxMDA4LVYzLm1k'))
    $dispatchPath = Join-Path $PSScriptRoot ($dispatchRelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $dispatchPath -PathType Leaf)) {
        throw "V3 dispatch file not found: $dispatchPath"
    }

    $dispatch = [System.IO.File]::ReadAllText($dispatchPath, [System.Text.Encoding]::UTF8)
    $section = [regex]::Match($dispatch, '(?ms)^## 0\..*?^```(?:bash|sh)?\s*\r?\n(.*?)^```')
    if (-not $section.Success) {
        throw 'V3 section 0 command block was not found.'
    }

    $commands = @(
        $section.Groups[1].Value -split '\r?\n' |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_.Length -gt 0 }
    )
    if ($commands.Count -ne 28) {
        throw "V3 section 0 must contain exactly 28 commands; found $($commands.Count)."
    }
    return $commands
}

if ($ListCommands -and $SelfTestFailure) {
    throw '-ListCommands and -SelfTestFailure cannot be used together.'
}

if ($SelfTestFailure) {
    $commands = @("node -e process.stderr.write('phase-gate-injected-failure');process.exit(23)")
} else {
    $commands = @(Get-V3PhaseCommands)
}

if ($ListCommands) {
    [Console]::Out.WriteLine(($commands | ConvertTo-Json -Compress))
    exit 0
}

if ([string]::IsNullOrWhiteSpace($RunTimestamp)) {
    $RunTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
}
if ($RunTimestamp -notmatch '^\d{8}-\d{6}$') {
    throw "RunTimestamp must use yyyyMMdd-HHmmss; received '$RunTimestamp'."
}

$runStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$runDirectory = Join-Path $PSScriptRoot "output/phase-gates/$RunTimestamp"
if ($PSBoundParameters.ContainsKey('RunTimestamp') -and (Test-Path -LiteralPath $runDirectory)) {
    throw "Run directory already exists: $runDirectory"
}
while (Test-Path -LiteralPath $runDirectory) {
    Start-Sleep -Seconds 1
    $RunTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $runDirectory = Join-Path $PSScriptRoot "output/phase-gates/$RunTimestamp"
}
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$results = [System.Collections.Generic.List[object]]::new()
$index = 0

foreach ($command in $commands) {
    $index++
    $parts = @($command -split '\s+')
    $executable = $parts[0]
    $arguments = @()
    if ($parts.Count -gt 1) {
        $arguments = @($parts[1..($parts.Count - 1)])
    }

    $tempDirectory = Join-Path $env:TEMP ("phase-gate-{0}-{1}" -f $RunTimestamp, [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null
    $stdoutPath = Join-Path $tempDirectory 'stdout.log'
    $stderrPath = Join-Path $tempDirectory 'stderr.log'
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $exitCode = 127
    $launchError = $null

    $originalErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $executable @arguments 1> $stdoutPath 2> $stderrPath
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
    } catch {
        $launchError = $_.Exception.Message
    } finally {
        $ErrorActionPreference = $originalErrorActionPreference
    }

    $stopwatch.Stop()
    $stdoutTail = @()
    $stderrTail = @()
    if (Test-Path -LiteralPath $stdoutPath -PathType Leaf) {
        $stdoutTail = @(Get-Content -LiteralPath $stdoutPath -Tail 20 | ForEach-Object { $_.ToString() })
    }
    if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
        $stderrTail = @(Get-Content -LiteralPath $stderrPath -Tail 20 | ForEach-Object { $_.ToString() })
    }

    $results.Add([pscustomobject]@{
        command = $command
        exitCode = [int]$exitCode
        durationMilliseconds = [long]$stopwatch.ElapsedMilliseconds
        stdoutTail = $stdoutTail
        stderrTail = $stderrTail
        error = $launchError
    })
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
    Write-Host ('[{0:D2}/{1:D2}] exit={2} {3}' -f $index, $commands.Count, $exitCode, $command)
}

$headResult = & git -C $PSScriptRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) {
    throw 'git rev-parse HEAD failed while writing the phase gate summary.'
}
$dirtyLines = @(& git -C $PSScriptRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw 'git status --porcelain failed while writing the phase gate summary.'
}
$headSha = ($headResult | Out-String).Trim()
$dirty = $dirtyLines.Count -gt 0
$passed = @($results | Where-Object { $_.exitCode -ne 0 }).Count -eq 0
$summary = [ordered]@{
    headSha = $headSha
    dirty = [bool]$dirty
    passed = [bool]$passed
    sourceFile = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('X3RtcC/mtL7lt6Uv5bCP5bel5YW35YSq5YyW5rS+5bel5oyH56S6LTIwMjYxMDA4LVYzLm1k'))
    commandCount = $commands.Count
    startedAt = $runStartedAt
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    results = @($results)
}
$summaryPath = Join-Path $runDirectory 'summary.json'
$json = $summary | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($summaryPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Host "Summary: $summaryPath"
if (-not $passed) {
    exit 1
}
exit 0
