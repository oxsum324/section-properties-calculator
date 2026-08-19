[CmdletBinding()]
param(
  [string]$PathPattern = '',
  [switch]$ListOnly,
  [switch]$FailFast,
  [switch]$SkipDependencyBootstrap,
  [ValidateRange(1, 86400)]
  [int]$TimeoutSeconds = 900,
  [string]$JsonOutput = ''
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$topLevelDirectories = @(Get-ChildItem -LiteralPath $workspaceRoot -Directory)
$playwrightBootstrapFile = @($topLevelDirectories | ForEach-Object {
  $candidate = Join-Path $_.FullName 'tools\ensure-playwright-deps.ps1'
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { Get-Item -LiteralPath $candidate }
}) | Select-Object -First 1
$rcTools = if ($playwrightBootstrapFile) { $playwrightBootstrapFile.DirectoryName } else { '' }
$boltPackageFile = @($topLevelDirectories | ForEach-Object {
  $candidate = Join-Path $_.FullName 'bolt-review-tool\package.json'
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { Get-Item -LiteralPath $candidate }
}) | Select-Object -First 1
$boltPackage = if ($boltPackageFile) { $boltPackageFile.DirectoryName } else { '' }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$rgCommand = Get-Command rg -ErrorAction SilentlyContinue
$originalNodePath = $env:NODE_PATH

function ConvertTo-NativeArgument {
  param([AllowEmptyString()][string]$Value)

  if ($Value -eq '') {
    return '""'
  }
  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  # Apply the Windows CommandLineToArgvW quoting rules.
  return '"' + ([regex]::Replace($Value, '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}

function Invoke-NativeTest {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][int]$Timeout
  )

  $startedAt = Get-Date
  $timedOut = $false

  $argumentLine = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = $argumentLine
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Unable to start test process: $FilePath"
  }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  if (-not $process.WaitForExit($Timeout * 1000)) {
    $timedOut = $true
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
  $process.WaitForExit()

  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $combined = (@($stdout, $stderr) | Where-Object { $_ }) -join [Environment]::NewLine
  $exitCode = if ($timedOut) { 124 } else { $process.ExitCode }
  $process.Dispose()

  return [pscustomobject]@{
    ExitCode = $exitCode
    TimedOut = $timedOut
    Seconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
    Output = $combined
  }
}

function Test-IsEnvironmentBlock {
  param([string]$Output)

  if (-not $Output) {
    return $false
  }

  $environmentPatterns = @(
    'Cannot find module.+playwright',
    'Cannot find module.+vitest',
    'MODULE_NOT_FOUND[\s\S]*(playwright|vitest)',
    'Executable doesn''t exist[\s\S]*playwright',
    'playwright install',
    '(spawn|spawnSync)[\s\S]*ENOENT',
    '(pdftotext|pdfinfo|tar)(\.exe)?[^\r\n]*(not recognized|command not found|No such file)',
    'EXTERNAL_TOOL_UNAVAILABLE',
    'Unable to resolve (pdftotext|pdfinfo|tar)',
    'ERR_PNPM_NO_OFFLINE_META',
    'npm ERR![\s\S]*(network|ENETUNREACH|ECONNREFUSED|ETIMEDOUT)'
  )

  foreach ($pattern in $environmentPatterns) {
    if ($Output -match $pattern) {
      return $true
    }
  }
  return $false
}

function Get-OutputTail {
  param([string]$Output, [int]$LineCount = 40)

  if (-not $Output) {
    return ''
  }
  return (($Output -split '\r?\n') | Select-Object -Last $LineCount) -join [Environment]::NewLine
}

function Write-JsonResult {
  param([object]$Payload)

  if (-not $JsonOutput) {
    return
  }

  $target = if ([System.IO.Path]::IsPathRooted($JsonOutput)) {
    $JsonOutput
  } else {
    Join-Path $workspaceRoot $JsonOutput
  }
  $targetDirectory = Split-Path -Parent $target
  if ($targetDirectory -and -not (Test-Path $targetDirectory)) {
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
  }
  $Payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $target -Encoding UTF8
  Write-Host "JSON result: $target" -ForegroundColor DarkGray
}

try {
  if (-not $rgCommand) {
    throw 'rg is required to discover the repository test inventory.'
  }

  Push-Location $workspaceRoot
  try {
    $testPaths = @(& $rgCommand.Source --files -g '*.test.js' -g '*.test.ts') |
      Where-Object { $_ } |
      Sort-Object -Unique
  } finally {
    Pop-Location
  }

  $discoveredCount = $testPaths.Count
  if ($PathPattern) {
    try {
      $testPaths = @($testPaths | Where-Object { $_ -match $PathPattern })
    } catch {
      throw "Invalid -PathPattern regular expression: $PathPattern"
    }
  }

  $plans = @(foreach ($relativePath in $testPaths) {
    $absolutePath = Join-Path $workspaceRoot $relativePath
    if ($relativePath.EndsWith('.test.js', [System.StringComparison]::OrdinalIgnoreCase)) {
      $needsPlaywright = Select-String -LiteralPath $absolutePath -Pattern 'require\(\s*[''"]playwright[''"]\s*\)' -Quiet
      [pscustomobject]@{
        Path = $relativePath
        AbsolutePath = $absolutePath
        Kind = if ($needsPlaywright) { 'node+playwright' } else { 'node' }
        Supported = $true
        UnsupportedReason = ''
      }
      continue
    }

    $boltPrefix = $boltPackage.TrimEnd('\') + '\'
    if ($absolutePath.StartsWith($boltPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      [pscustomobject]@{
        Path = $relativePath
        AbsolutePath = $absolutePath
        Kind = 'vitest'
        Supported = $true
        UnsupportedReason = ''
      }
    } else {
      [pscustomobject]@{
        Path = $relativePath
        AbsolutePath = $absolutePath
        Kind = 'unsupported'
        Supported = $false
        UnsupportedReason = 'TypeScript test is outside the registered Vitest package.'
      }
    }
  })

  Write-Host '== Repository test inventory ==' -ForegroundColor Cyan
  Write-Host "Discovered: $discoveredCount   Selected: $($plans.Count)"
  ($plans | Group-Object Kind | Sort-Object Name) | ForEach-Object {
    Write-Host ('  {0,-20} {1,4}' -f $_.Name, $_.Count)
  }

  if ($ListOnly) {
    foreach ($plan in $plans) {
      Write-Output ("{0}`t{1}" -f $plan.Kind, $plan.Path)
    }
    Write-JsonResult ([ordered]@{
      mode = 'list'
      discovered = $discoveredCount
      selected = $plans.Count
      tests = @($plans | Select-Object Path, Kind, Supported, UnsupportedReason)
    })
    exit 0
  }

  $results = New-Object System.Collections.Generic.List[object]
  $playwrightBootstrapError = ''
  $playwrightPlans = @($plans | Where-Object { $_.Kind -eq 'node+playwright' })
  if ($playwrightPlans.Count -gt 0) {
    if ($SkipDependencyBootstrap) {
      if (-not $env:NODE_PATH) {
        $playwrightBootstrapError = 'Playwright bootstrap was skipped and NODE_PATH is empty.'
      }
    } else {
      $bootstrapScript = Join-Path $rcTools 'ensure-playwright-deps.ps1'
      try {
        . $bootstrapScript -Root $rcTools -PreferredDirName '.beam-testdeps'
      } catch {
        $playwrightBootstrapError = "Playwright dependency bootstrap failed: $($_.Exception.Message)"
      }
    }
  }

  $vitestEntry = Join-Path $boltPackage 'node_modules\vitest\vitest.mjs'
  $index = 0
  foreach ($plan in $plans) {
    $index += 1
    $status = ''
    $detail = ''
    $exitCode = $null
    $seconds = 0
    $output = ''

    if (-not $plan.Supported) {
      $status = 'UNSUPPORTED_DIRECT'
      $detail = $plan.UnsupportedReason
    } elseif (-not $nodeCommand) {
      $status = 'BLOCKED_ENV'
      $detail = 'node executable is unavailable.'
    } elseif ($plan.Kind -eq 'node+playwright' -and $playwrightBootstrapError) {
      $status = 'BLOCKED_ENV'
      $detail = $playwrightBootstrapError
    } elseif ($plan.Kind -eq 'vitest' -and -not (Test-Path $vitestEntry)) {
      $status = 'BLOCKED_ENV'
      $detail = "Vitest entrypoint is missing: $vitestEntry"
    } else {
      if ($plan.Kind -eq 'vitest') {
        $boltPrefix = $boltPackage.TrimEnd('\') + '\'
        $packageRelativePath = $plan.AbsolutePath.Substring($boltPrefix.Length).Replace('\', '/')
        $invocation = Invoke-NativeTest `
          -FilePath $nodeCommand.Source `
          -Arguments @($vitestEntry, 'run', $packageRelativePath) `
          -WorkingDirectory $boltPackage `
          -Timeout $TimeoutSeconds
      } else {
        $invocation = Invoke-NativeTest `
          -FilePath $nodeCommand.Source `
          -Arguments @($plan.AbsolutePath) `
          -WorkingDirectory $workspaceRoot `
          -Timeout $TimeoutSeconds
      }

      $exitCode = $invocation.ExitCode
      $seconds = $invocation.Seconds
      $output = $invocation.Output
      if ($invocation.TimedOut) {
        $status = 'FAIL_CODE'
        $detail = "Timed out after $TimeoutSeconds seconds."
      } elseif ($invocation.ExitCode -eq 0) {
        $status = 'PASS'
      } elseif (Test-IsEnvironmentBlock $output) {
        $status = 'BLOCKED_ENV'
        $detail = 'Known dependency or external-tool failure signature detected.'
      } else {
        $status = 'FAIL_CODE'
        $detail = 'Test process returned a non-zero exit code.'
      }
    }

    $result = [pscustomobject]@{
      Path = $plan.Path
      Runner = $plan.Kind
      Status = $status
      ExitCode = $exitCode
      Seconds = $seconds
      Detail = $detail
      OutputTail = if ($status -eq 'PASS') { '' } else { Get-OutputTail $output }
    }
    $results.Add($result)

    $color = switch ($status) {
      'PASS' { 'Green' }
      'FAIL_CODE' { 'Red' }
      'BLOCKED_ENV' { 'Yellow' }
      default { 'DarkYellow' }
    }
    Write-Host ('[{0}/{1}] {2,-18} {3,8:N2}s  {4}' -f $index, $plans.Count, $status, $seconds, $plan.Path) -ForegroundColor $color
    if ($status -ne 'PASS') {
      if ($detail) {
        Write-Host "  $detail" -ForegroundColor DarkGray
      }
      if ($result.OutputTail) {
        Write-Host $result.OutputTail -ForegroundColor DarkGray
      }
    }

    if ($FailFast -and $status -ne 'PASS') {
      break
    }
  }

  $summary = [ordered]@{
    PASS = @($results | Where-Object Status -eq 'PASS').Count
    FAIL_CODE = @($results | Where-Object Status -eq 'FAIL_CODE').Count
    BLOCKED_ENV = @($results | Where-Object Status -eq 'BLOCKED_ENV').Count
    UNSUPPORTED_DIRECT = @($results | Where-Object Status -eq 'UNSUPPORTED_DIRECT').Count
  }

  Write-Host "`n== Repository test summary ==" -ForegroundColor Cyan
  foreach ($category in @('PASS', 'FAIL_CODE', 'BLOCKED_ENV', 'UNSUPPORTED_DIRECT')) {
    Write-Host ('  {0,-20} {1,4}' -f $category, $summary[$category])
  }
  Write-Host ('  {0,-20} {1,4}' -f 'TOTAL_EXECUTED', $results.Count)

  Write-JsonResult ([ordered]@{
    mode = 'run'
    generatedAt = (Get-Date).ToString('o')
    root = $workspaceRoot
    discovered = $discoveredCount
    selected = $plans.Count
    executed = $results.Count
    summary = $summary
    results = $results
  })

  if (($summary.FAIL_CODE + $summary.BLOCKED_ENV + $summary.UNSUPPORTED_DIRECT) -gt 0) {
    exit 1
  }
  exit 0
} finally {
  $env:NODE_PATH = $originalNodePath
}
