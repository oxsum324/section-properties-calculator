function Invoke-ReleaseEnvironmentPrecheck {
  param([Parameter(Mandatory=$true)][string]$WorkspaceRoot,
    [string]$SourceCommitSha, [string]$SourceBranch)
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    throw 'Release environment precheck requires Windows PowerShell 5.1.'
  }
  $started = Get-Date
  $sourceStatus=@(& git -C $WorkspaceRoot status --porcelain=v1 --untracked-files=all 2>$null)
  $sourceDirty=if ($LASTEXITCODE -eq 0) { $sourceStatus.Count -gt 0 } else { $null }
  $attemptId = $started.ToString('yyyyMMdd-HHmmss-fff') + '-' + $PID
  $directory = Join-Path $WorkspaceRoot ('output\preflight\environment-precheck\' + $attemptId)
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $receiptPath = Join-Path $directory 'receipt.json'
  $utf8 = [Text.UTF8Encoding]::new($false)
  $commands = [Collections.Generic.List[object]]::new()
  $receipt = [ordered]@{ attemptId=$attemptId; sourceCommitSha=$SourceCommitSha;
    sourceBranch=$SourceBranch; sourceDirty=$sourceDirty; startedAt=$started.ToUniversalTime().ToString('o');
    powerShellVersion=$PSVersionTable.PSVersion.ToString(); pass=$false; exitCode=1;
    pythonExecutable=$null; environment=$null; artifactSummary=$null; commands=@(); error=$null; durationSeconds=0 }
  $oldPath = $env:PATH
  $isolatedNames = @('PREFLIGHT_RUN_DIR','PREFLIGHT_CHECK_KEY','PREFLIGHT_RELEASE','STONE_RENDERED_EVIDENCE_DIR')
  $saved = @{}
  foreach ($name in $isolatedNames) { $saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
  $succeeded = $false
  function Invoke-EnvironmentCommand {
    param([string]$Name,[string]$Executable,[string[]]$Arguments,[string]$Workdir,[int]$TimeoutSeconds=180)
    # Windows CommandLineToArgvW escaping, including paths containing spaces and quotes.
    $quoted = @($Arguments | ForEach-Object {
      '"' + ([regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')) + '"'
    }) -join ' '
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$Executable; $info.Arguments=$quoted; $info.WorkingDirectory=$Workdir
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $info.StandardOutputEncoding=$utf8; $info.StandardErrorEncoding=$utf8
    $info.EnvironmentVariables['PYTHONUTF8']='1'
    $info.EnvironmentVariables['PYTHONIOENCODING']='utf-8'
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$info
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $code=1; $stdout=''; $stderr=''
    try {
      [void]$process.Start()
      $out=$process.StandardOutput.ReadToEndAsync(); $err=$process.StandardError.ReadToEndAsync()
      if (-not $process.WaitForExit($TimeoutSeconds*1000)) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
        [void]$process.WaitForExit(5000); $code=124
      } else { $code=$process.ExitCode }
      if ($out.Wait(5000)) { $stdout=$out.Result }
      if ($err.Wait(5000)) { $stderr=$err.Result }
    } catch { $stderr=$_.Exception.Message } finally { $watch.Stop(); $process.Dispose() }
    $outPath=Join-Path $directory ($Name+'.stdout.log'); $errPath=Join-Path $directory ($Name+'.stderr.log')
    [IO.File]::WriteAllText($outPath,$stdout,$utf8); [IO.File]::WriteAllText($errPath,$stderr,$utf8)
    $commands.Add([pscustomobject]@{name=$Name;executable=$Executable;arguments=$Arguments;
      exitCode=$code;durationSeconds=$watch.Elapsed.TotalSeconds;stdout=$outPath;stderr=$errPath})
    if ($code -ne 0) { $receipt.exitCode=$code; throw "Release environment command '$Name' failed ($code). Receipt: $receiptPath" }
    return $stdout
  }
  try {
    $selection=[Environment]::GetEnvironmentVariable('STRUCTURAL_TOOLS_PYTHON','Process')
    if (-not [string]::IsNullOrWhiteSpace($selection)) {
      if (-not [IO.Path]::IsPathRooted($selection) -or -not (Test-Path -LiteralPath $selection -PathType Leaf)) {
        throw 'STRUCTURAL_TOOLS_PYTHON must name an existing absolute Python executable; fallback is disabled.'
      }
      $selected=(Resolve-Path -LiteralPath $selection).Path
    } else {
      $selected=(Get-Command python -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    }
    $identity=Invoke-EnvironmentCommand 'python_identity' $selected @('-c','import json,sys; print(json.dumps(dict(executable=sys.executable,version=sys.version)))') $WorkspaceRoot 30 | ConvertFrom-Json
    $python=(Resolve-Path -LiteralPath $identity.executable -ErrorAction Stop).Path
    $receipt.pythonExecutable=$python
    $nativePs=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0'
    # Nested legacy BATs prefer pwsh. Exclude those directories only in this process.
    $remaining=@($oldPath -split ';' | Where-Object {
      $_ -and -not (Test-Path -LiteralPath (Join-Path $_ 'pwsh.exe')) -and
      -not (Test-Path -LiteralPath (Join-Path $_ 'pwsh.cmd')) -and
      -not (Test-Path -LiteralPath (Join-Path $_ 'pwsh.bat'))
    })
    $env:PATH=(@((Split-Path -Parent $python),$nativePs)+$remaining) -join ';'
    $resolved=(Get-Command python -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    if ([IO.Path]::GetFullPath($resolved) -ine $python) { throw 'Selected Python cannot be pinned through the process PATH.' }
    $env:PREFLIGHT_RUN_DIR=Join-Path $directory 'isolated-artifacts'
    $env:PREFLIGHT_CHECK_KEY='environment-precheck'; $env:PREFLIGHT_RELEASE='1'
    $env:STONE_RENDERED_EVIDENCE_DIR=Join-Path $env:PREFLIGHT_RUN_DIR 'rendered-delivery-evidence\stone-formal'
    $probe=Invoke-EnvironmentCommand 'env_probe' $python @((Join-Path $WorkspaceRoot '石材固定\env_check.py'),'--json') $WorkspaceRoot 45 | ConvertFrom-Json
    $receipt.environment=$probe
    if (-not $probe.pass -or [IO.Path]::GetFullPath($probe.python.executable) -ine $python) { throw 'Python import probe or interpreter identity failed.' }
    [void](Invoke-EnvironmentCommand 'self_check' $python @('self_check.py') (Join-Path $WorkspaceRoot '石材固定'))
    $node=(Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    [void](Invoke-EnvironmentCommand 'stone_contract' $node @('stone-report.contract.test.js') (Join-Path $WorkspaceRoot '石材固定'))
    $artifactSummaryPath=Join-Path $env:STONE_RENDERED_EVIDENCE_DIR 'rendered-delivery-evidence-summary.json'
    if (Test-Path -LiteralPath $artifactSummaryPath -PathType Leaf) {
      $receipt.artifactSummary=[IO.File]::ReadAllText($artifactSummaryPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    }
    $receipt.pass=$true; $receipt.exitCode=0; $succeeded=$true
  } catch { $receipt.error=$_.Exception.Message; throw } finally {
    foreach ($name in $isolatedNames) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    if (-not $succeeded) { $env:PATH=$oldPath }
    $receipt.commands=@($commands.ToArray())
    $receipt.durationSeconds=((Get-Date)-$started).TotalSeconds
    [IO.File]::WriteAllText($receiptPath,($receipt | ConvertTo-Json -Depth 16),$utf8)
  }
  return [pscustomobject]@{attemptId=$attemptId;directory=$directory;receiptPath=$receiptPath;
    pythonExecutable=$python;environment=$probe;pinnedPath=$env:PATH}
}

function Assert-ReleaseEnvironmentPinned {
  param($State)
  if ($env:PATH -cne $State.pinnedPath -or
      (Get-Command python -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source -ine $State.pythonExecutable) {
    throw 'Release Python environment changed after precheck.'
  }
}

function Set-ReleaseEnvironmentRunLink {
  param($State,[string]$RunId)
  $stream=[IO.File]::OpenRead($State.receiptPath)
  $sha=[Security.Cryptography.SHA256]::Create()
  try { $digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
  $link=[ordered]@{attemptId=$State.attemptId;runId=$RunId;receiptSha256=$digest}
  [IO.File]::WriteAllText((Join-Path $State.directory 'formal-run-link.json'),($link|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
