[CmdletBinding()]
param(
    [switch]$ListCommands,
    [string]$RunTimestamp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$familyWrappers = @(
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-beam.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-column.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-slab.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-wall.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-shear-wall.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-foundation.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-single-pile.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-deep-beam-stm.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-foundation-deep-beam-stm.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼筋混凝土/tools/test-pile-cap-3d-stm.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = '鋼構工具/run-audit.bat'; kind = 'batch' }
    [pscustomobject]@{ path = 'test-continuous-beam.ps1'; kind = 'powershell' }
    [pscustomobject]@{ path = 'frame-analysis-browser-smoke.test.js'; kind = 'node' }
    [pscustomobject]@{ path = '結構工具箱/tools/local-quick-browser-smoke.test.js'; kind = 'node' }
)

function Get-WrapperCommand {
    param([Parameter(Mandatory = $true)]$Wrapper)

    switch ($Wrapper.kind) {
        'powershell' {
            return "pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$($Wrapper.path)`""
        }
        'batch' {
            return "cmd /d /c call `"$($Wrapper.path)`""
        }
        'node' {
            return "node `"$($Wrapper.path)`""
        }
        default {
            throw "Unsupported wrapper kind '$($Wrapper.kind)' for '$($Wrapper.path)'."
        }
    }
}

function Get-WrapperInvocation {
    param([Parameter(Mandatory = $true)]$Wrapper)

    $absolutePath = Join-Path $PSScriptRoot ($Wrapper.path.Replace('/', [IO.Path]::DirectorySeparatorChar))
    switch ($Wrapper.kind) {
        'powershell' {
            return [pscustomobject]@{
                executable = 'pwsh'
                arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $absolutePath)
                command = Get-WrapperCommand $Wrapper
            }
        }
        'batch' {
            return [pscustomobject]@{
                executable = $env:ComSpec
                arguments = @()
                command = Get-WrapperCommand $Wrapper
            }
        }
        'node' {
            return [pscustomobject]@{
                executable = 'node'
                arguments = @($absolutePath)
                command = Get-WrapperCommand $Wrapper
            }
        }
        default {
            throw "Unsupported wrapper kind '$($Wrapper.kind)' for '$($Wrapper.path)'."
        }
    }
}

if ($familyWrappers.Count -ne 14) {
    throw "The tracked family wrapper list must contain exactly 14 entries; found $($familyWrappers.Count)."
}

$commandEntries = @()
foreach ($wrapper in $familyWrappers) {
    $invocation = Get-WrapperInvocation $wrapper
    if ([string]::IsNullOrWhiteSpace($invocation.executable)) {
        throw "The executable could not be resolved for '$($wrapper.path)'."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot ($wrapper.path.Replace('/', [IO.Path]::DirectorySeparatorChar))) -PathType Leaf)) {
        throw "Wrapper file not found: $($wrapper.path)"
    }
    $commandEntries += [pscustomobject]@{
        index = $commandEntries.Count + 1
        path = $wrapper.path
        kind = $wrapper.kind
        command = $invocation.command
    }
}

if ($ListCommands) {
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject @($commandEntries) -Compress -Depth 4))
    exit 0
}

if ([string]::IsNullOrWhiteSpace($RunTimestamp)) {
    $RunTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
}
if ($RunTimestamp -notmatch '^\d{8}-\d{6}(?:-\d{3})?$') {
    throw "RunTimestamp must use yyyyMMdd-HHmmss[-fff]; received '$RunTimestamp'."
}

$runDirectory = Join-Path $PSScriptRoot "output/family-wrappers/$RunTimestamp"
if (Test-Path -LiteralPath $runDirectory) {
    throw "Run directory already exists: $runDirectory"
}
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-GitHead {
    $head = & git -C $PSScriptRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0) {
        throw 'git rev-parse HEAD failed.'
    }
    return ([string]$head).Trim()
}

function Test-GitDirty {
    $status = @(& git -C $PSScriptRoot status --porcelain)
    if ($LASTEXITCODE -ne 0) {
        throw 'git status --porcelain failed.'
    }
    return ($status.Count -gt 0)
}

$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$startHeadSha = Get-GitHead
$startDirty = Test-GitDirty
$results = [System.Collections.Generic.List[object]]::new()

foreach ($wrapper in $familyWrappers) {
    $invocation = Get-WrapperInvocation $wrapper
    $index = $results.Count + 1
    Write-Output ("Starting {0}/14: {1}" -f $index, $invocation.command)
    $stem = '{0:D2}-{1}' -f $index, ([IO.Path]::GetFileNameWithoutExtension($wrapper.path) -replace '[^A-Za-z0-9._-]', '-')
    $stdoutPath = Join-Path $runDirectory "$stem.stdout.log"
    $stderrPath = Join-Path $runDirectory "$stem.stderr.log"
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $exitCode = 127
    $launchError = $null
    $stdout = ''
    $stderr = ''
    $process = $null

    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $invocation.executable
        if ($wrapper.kind -eq 'batch') {
            $batchPath = Join-Path $PSScriptRoot ($wrapper.path.Replace('/', [IO.Path]::DirectorySeparatorChar))
            $startInfo.Arguments = '/d /c call "{0}"' -f $batchPath
        } else {
            $startInfo.Arguments = (($invocation.arguments | ForEach-Object {
                '"{0}"' -f ([string]$_).Replace('"', '\"')
            }) -join ' ')
        }
        $startInfo.WorkingDirectory = $PSScriptRoot
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
        $startInfo.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        if (-not $process.Start()) {
            throw "Process.Start returned false for '$($invocation.executable)'."
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    } catch {
        $launchError = $_.Exception.Message
        if ($stderr.Length -gt 0) {
            $stderr += [Environment]::NewLine
        }
        $stderr += "Runner launch error: $launchError"
        $exitCode = 127
    } finally {
        $stopwatch.Stop()
        if ($null -ne $process) {
            $process.Dispose()
        }
        [IO.File]::WriteAllText($stdoutPath, $stdout, $utf8NoBom)
        [IO.File]::WriteAllText($stderrPath, $stderr, $utf8NoBom)
    }

    $results.Add([pscustomobject]@{
        index = $index
        path = $wrapper.path
        kind = $wrapper.kind
        command = $invocation.command
        exitCode = $exitCode
        durationMilliseconds = [Math]::Round($stopwatch.Elapsed.TotalMilliseconds, 3)
        stdoutLog = $stdoutPath.Substring($PSScriptRoot.Length).TrimStart('\', '/').Replace('\', '/')
        stderrLog = $stderrPath.Substring($PSScriptRoot.Length).TrimStart('\', '/').Replace('\', '/')
        launchError = $launchError
    })
    Write-Output ("Completed {0}/14 with exit {1}: {2}" -f $index, $exitCode, $wrapper.path)
}

$completedAt = (Get-Date).ToUniversalTime().ToString('o')
$endHeadSha = Get-GitHead
$endDirty = Test-GitDirty
$allCommandsPassed = (@($results | Where-Object { $_.exitCode -ne 0 }).Count -eq 0)
$passed = $allCommandsPassed -and ($startHeadSha -eq $endHeadSha) -and (-not $startDirty) -and (-not $endDirty)
$summary = [pscustomobject]@{
    headSha = $startHeadSha
    startHeadSha = $startHeadSha
    endHeadSha = $endHeadSha
    startDirty = $startDirty
    endDirty = $endDirty
    dirty = $endDirty
    passed = $passed
    wrapperCount = $results.Count
    startedAt = $startedAt
    completedAt = $completedAt
    results = @($results.ToArray())
}
$summaryPath = Join-Path $runDirectory 'summary.json'
[IO.File]::WriteAllText($summaryPath, (ConvertTo-Json -InputObject $summary -Depth 8), $utf8NoBom)

$summaryRelativePath = $summaryPath.Substring($PSScriptRoot.Length).TrimStart('\', '/').Replace('\', '/')
Write-Output ("Family wrappers: {0}/14 passed; summary: {1}" -f (@($results | Where-Object { $_.exitCode -eq 0 }).Count), $summaryRelativePath)
if (-not $passed) {
    exit 1
}
exit 0
