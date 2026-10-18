[CmdletBinding()]
param(
    [switch]$ListCommands,
    [switch]$SelfTestFailure,
    [string]$RunTimestamp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-PhaseGateCommands {
    $manifestPath = Join-Path $PSScriptRoot 'phase-gates.commands.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Phase gate command manifest not found: $manifestPath"
    }

    $manifestText = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    try {
        $manifest = $manifestText | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "Phase gate command manifest is invalid JSON: $($_.Exception.Message)"
    }
    if ($manifest.schemaVersion -ne 1) {
        throw "Phase gate command manifest schemaVersion must be 1; found '$($manifest.schemaVersion)'."
    }
    if ($manifest.commands -isnot [System.Array] -or $manifest.commands.Count -eq 0) {
        throw 'Phase gate command manifest commands must be a non-empty array.'
    }
    foreach ($command in $manifest.commands) {
        if ($command -isnot [string] -or [string]::IsNullOrWhiteSpace($command)) {
            throw 'Phase gate command manifest commands must contain only non-empty strings.'
        }
    }
    return @($manifest.commands)
}

if ($ListCommands -and $SelfTestFailure) {
    throw '-ListCommands and -SelfTestFailure cannot be used together.'
}

if ($SelfTestFailure) {
    $commands = @("node -e process.stderr.write('phase-gate-injected-failure');process.exit(23)")
} else {
    $commands = @(Get-PhaseGateCommands)
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
        $stdoutTail = @(Get-Content -Encoding UTF8 -LiteralPath $stdoutPath -Tail 20 | ForEach-Object { $_.ToString() })
    }
    if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
        $stderrTail = @(Get-Content -Encoding UTF8 -LiteralPath $stderrPath -Tail 20 | ForEach-Object { $_.ToString() })
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
    sourceFile = 'phase-gates.commands.json'
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
