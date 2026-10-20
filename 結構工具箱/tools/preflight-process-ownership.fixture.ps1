param([Parameter(Mandatory=$true)][string]$WorkspaceRoot,[Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'Windows PowerShell 5.1 required' }
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$helper=Join-Path $WorkspaceRoot '結構工具箱/tools/preflight-process-ownership.ps1'
. $helper
$native=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$edge=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'))|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1
if(-not$edge) { throw 'Installed Microsoft Edge is required for the ownership fixture.' }
[void][IO.Directory]::CreateDirectory($FixtureRoot)
$script:observed=[Collections.Generic.List[object]]::new()
$script:scenarios=[Collections.Generic.List[object]]::new()
$script:contexts=[Collections.Generic.List[object]]::new()
$script:roots=[Collections.Generic.List[Diagnostics.Process]]::new()
$treeScript=Join-Path $FixtureRoot 'tree.cjs'
$nodeSource=@'
const fs=require('node:fs'),cp=require('node:child_process');
const child=cp.spawn(process.env.OWNERSHIP_FIXTURE_EDGE,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-crash-reporter','--no-first-run','--remote-debugging-port=0','--user-data-dir='+process.env.OWNERSHIP_FIXTURE_PROFILE,'about:blank'],{stdio:'ignore',windowsHide:true});
child.on('error',()=>process.exit(2));
fs.writeFileSync(process.env.OWNERSHIP_FIXTURE_DATA,JSON.stringify({node:process.pid,edge:child.pid}));
if(process.env.OWNERSHIP_FIXTURE_MODE==='fail'){
  const ready=setInterval(()=>{if(fs.existsSync(process.env.OWNERSHIP_FIXTURE_DATA+'.observed')){clearInterval(ready);setTimeout(()=>{console.error('spawn EPERM ownership fixture');process.exit(1)},750)}},20);
}
else setInterval(()=>{},1000);
'@
[IO.File]::WriteAllText($treeScript,$nodeSource,[Text.UTF8Encoding]::new($false))

function Assert-Fixture([bool]$Condition,[string]$Message) { if(-not$Condition) { throw $Message } }
function Read-Identity([int]$ProcessId) {
  $process=Get-Process -Id $ProcessId -ErrorAction Stop
  try { return [pscustomobject]@{Id=$process.Id;Name=$process.ProcessName;StartTimeUtc=$process.StartTime.ToUniversalTime().ToString('o')} }
  finally { $process.Dispose() }
}
function Test-IdentityAlive($Identity) {
  $process=Get-Process -Id $Identity.Id -ErrorAction SilentlyContinue
  if(-not$process) { return $false }
  try {
    if($process.HasExited) { return $false }
    $stamp=$process.StartTime
    if($null -eq $stamp) {
      if($process.HasExited) { return $false }
      throw 'Live fixture process identity is unavailable.'
    }
    return $stamp.ToUniversalTime().ToString('o') -ceq $Identity.StartTimeUtc
  } catch { if($process.HasExited) { return $false }; throw }
  finally { $process.Dispose() }
}
function Assert-Exited($Identities) {
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  do { $alive=@($Identities|Where-Object{Test-IdentityAlive $_}); if(-not$alive.Count){return};Start-Sleep -Milliseconds 100 }while([DateTime]::UtcNow -lt $deadline)
  throw 'Fixture-owned process did not exit.'
}
function New-FixtureContext([string]$Name) {
  $context=New-OwnedProcessContext -LogPath(Join-Path $FixtureRoot ($Name+'.jsonl'))
  $script:contexts.Add($context); return $context
}
function Set-TreeEnvironment([string]$Name,[string]$Mode='hold') {
  $env:OWNERSHIP_FIXTURE_CASE=$Name
  $env:OWNERSHIP_FIXTURE_EDGE=$edge;$env:OWNERSHIP_FIXTURE_TREE=$treeScript
  $env:OWNERSHIP_FIXTURE_DATA=Join-Path $FixtureRoot ($Name+'.data.json')
  $env:OWNERSHIP_FIXTURE_PROFILE=Join-Path $FixtureRoot ($Name+'-profile')
  $env:OWNERSHIP_FIXTURE_MODE=$Mode
}
function New-FixtureStartInfo([string]$Script) {
  $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$native
  $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$Script+'"'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  return $info
}
function Start-FixtureTree($Context,[string]$Name,[string]$Mode='hold') {
  Set-TreeEnvironment $Name $Mode
  $scriptPath=Join-Path $FixtureRoot ($Name+'.ps1')
  [IO.File]::WriteAllText($scriptPath,(Get-OwnedProcessGateBootstrap)+[Environment]::NewLine+'& node $env:OWNERSHIP_FIXTURE_TREE; exit $LASTEXITCODE',[Text.UTF8Encoding]::new($true))
  $process=Start-OwnedProcess -Context $Context -CheckKey $Name -StartInfo(New-FixtureStartInfo $scriptPath)
  $script:roots.Add($process)
  return $process
}
function Wait-FixtureTree([string]$Name) {
  $data=Join-Path $FixtureRoot ($Name+'.data.json');$deadline=[DateTime]::UtcNow.AddSeconds(20)
  do {
    if(Test-Path -LiteralPath $data) {
      try {
        $ids=[IO.File]::ReadAllText($data,[Text.Encoding]::UTF8)|ConvertFrom-Json
        $result=@((Read-Identity ([int]$ids.node)),(Read-Identity ([int]$ids.edge)))
        foreach($item in $result){$script:observed.Add($item)}
        [IO.File]::WriteAllText(($data+'.observed'),'observed',[Text.UTF8Encoding]::new($false))
        return $result
      } catch {}
    }
    Start-Sleep -Milliseconds 100
  }while([DateTime]::UtcNow -lt $deadline)
  throw 'Fixture tree did not become ready.'
}
function Import-FixtureFunctions([string]$File,[string[]]$Names) {
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $WorkspaceRoot $File),[ref]$tokens,[ref]$errors)
  Assert-Fixture ($errors.Count -eq 0) 'Production script must parse.'
  foreach($name in $Names) {
    $definition=$ast.Find({param($item)$item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name},$true)
    Assert-Fixture ($null -ne $definition) ('Missing production function '+$name)
    . ([scriptblock]::Create($definition.Extent.Text.Replace('function '+$name+' {','function global:'+$name+' {')))
  }
}
Import-FixtureFunctions 'preflight-tools.ps1' @('Clear-PreflightRuntimeProcesses','Invoke-PreflightCheck','Get-CommandHash','Get-TextHash','Get-PreflightRelativePath','Remove-PreflightAnsiEscape','Repair-PreflightMojibake','Get-ForbiddenLogGlyphCount','Get-TextFileLines','Write-TextFile','Test-PreflightTransientRuntimeFailure')
Import-FixtureFunctions 'audit-all.ps1' @('Clear-AuditRuntimeProcesses','Invoke-Audit','Test-AuditTransientRuntimeFailure')
function global:Write-Status { param([string]$Message,[string]$Color,[switch]$Force) }
$root=$WorkspaceRoot;$outputDir=$FixtureRoot;$auditOutputDir=$FixtureRoot
$Quick=$false;$ForceSlowChecks=$false;$ForcePlatformAudit=$false;$isReleaseMode=$false
$decoyContext=New-FixtureContext 'decoy-support'
$script:preflightOwnership=New-FixtureContext 'preflight'
$script:auditOwnership=New-FixtureContext 'audit'
$failure=$null
try {
  [void](Start-FixtureTree $decoyContext 'unrelated-decoy')
  $decoys=@(Wait-FixtureTree 'unrelated-decoy')
  Assert-Fixture (@($decoys|Where-Object{$_.Name -eq 'node'}).Count -eq 1) 'Real unrelated Node decoy required.'
  Assert-Fixture (@($decoys|Where-Object{$_.Name -eq 'msedge'}).Count -eq 1) 'Real unrelated headless Edge decoy required.'
  foreach($kind in @('preflight','audit')) {
    if($kind -eq 'preflight'){Clear-PreflightRuntimeProcesses -Startup -Reason 'fixture startup'}else{Clear-AuditRuntimeProcesses -Startup -Reason 'fixture startup'}
    Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'Startup killed an unrelated decoy.'
    $context=if($kind -eq 'preflight'){$script:preflightOwnership}else{$script:auditOwnership}
    [void](Start-FixtureTree $context ($kind+'-owned'))
    $owned=@(Wait-FixtureTree ($kind+'-owned'))
    $before=@($context.Jobs[0].Job.Snapshot())
    Assert-Fixture (@($owned|Where-Object{$before.Id -notcontains $_.Id}).Count -eq 0) 'Node and Edge must both belong to the job before cleanup.'
    if($kind -eq 'preflight'){Clear-PreflightRuntimeProcesses -CheckKey 'fixture-failed' -Reason 'fixture retry'}else{Clear-AuditRuntimeProcesses -CheckKey 'fixture-failed' -Reason 'fixture retry'}
    Assert-Exited $owned
    Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'Retry killed an unrelated decoy.'
    $script:scenarios.Add([pscustomobject]@{name=($kind+'-startup-and-retry');pass=$true;unrelatedBefore=$decoys;unrelatedAfter=@($decoys|ForEach-Object{[pscustomobject]@{pid=$_.Id;alive=(Test-IdentityAlive $_)}});ownedBefore=$before;ownedAfter=@($owned|ForEach-Object{[pscustomobject]@{pid=$_.Id;alive=(Test-IdentityAlive $_)}})})
  }

  # Real invocation envelopes, extracted from production; only fake check contents run.
  # Observe the live Node/Edge identities before returning control to the real wait loop.
  # This fixture-only readiness barrier does not replace assignment, cleanup, or timeout code.
  $originalStart=${function:Start-OwnedProcess}.ToString()
  $observeStart=@'
param($Context,[string]$CheckKey,[Diagnostics.ProcessStartInfo]$StartInfo)
$process=& ([scriptblock]::Create($originalStart)) -Context $Context -CheckKey $CheckKey -StartInfo $StartInfo
if($CheckKey -match '-(?:eperm|timeout)$') { $script:envelopeOwned=@(Wait-FixtureTree $env:OWNERSHIP_FIXTURE_CASE) }
return $process
'@
  Set-Item -Path function:Start-OwnedProcess -Value ([scriptblock]::Create($observeStart))
  foreach($kind in @('preflight','audit')) {
    $name=$kind+'-eperm'; Set-TreeEnvironment $name 'fail'
    $command='& node $env:OWNERSHIP_FIXTURE_TREE; exit $LASTEXITCODE'
    if($kind -eq 'preflight') {
      $record=Invoke-PreflightCheck -Key $name -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot
      Assert-Fixture ($record.exitCode -eq 1 -and (Test-PreflightTransientRuntimeFailure $record.historyLog)) 'Preflight must retain EPERM detection.'
      Clear-PreflightRuntimeProcesses -CheckKey $name -Reason 'fixture retry'
    } else {
      $record=Invoke-Audit -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot
      Assert-Fixture ($record.exitCode -eq 1 -and (Test-AuditTransientRuntimeFailure $record.log)) 'Audit must retain EPERM detection.'
      Clear-AuditRuntimeProcesses -CheckKey $name -Reason 'fixture retry'
    }
    Assert-Fixture ($script:envelopeOwned.Count -eq 2) 'Both live EPERM process identities must be observed.'
    Assert-Exited $script:envelopeOwned
    Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'EPERM cleanup killed decoys.'
    $script:scenarios.Add([pscustomobject]@{name=$name;pass=$true;exitCode=$record.exitCode;ownedBefore=$script:envelopeOwned;ownedAfter=@($script:envelopeOwned|ForEach-Object{[pscustomobject]@{pid=$_.Id;alive=(Test-IdentityAlive $_)}});decoysAlive=$true})
  }

  foreach($kind in @('preflight','audit')) {
    $name=$kind+'-success';$command='Write-Output "ownership-success"'
    $record=if($kind -eq 'preflight'){Invoke-PreflightCheck -Key $name -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot}else{Invoke-Audit -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot}
    Assert-Fixture ($record.exitCode -eq 0) 'Successful check envelope must remain successful.'
    $script:scenarios.Add([pscustomobject]@{name=$name;pass=$true;exitCode=0})
    $name=$kind+'-timeout';Set-TreeEnvironment $name
    $command='& node $env:OWNERSHIP_FIXTURE_TREE; exit $LASTEXITCODE'
    $record=if($kind -eq 'preflight'){Invoke-PreflightCheck -Key $name -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot -TimeoutSeconds 1}else{Invoke-Audit -Label $name -Workdir $FixtureRoot -Command $command -RunDir $FixtureRoot -TimeoutSeconds 1}
    Assert-Fixture ($record.exitCode -eq 124) 'Original timeout must still fail with exit 124.'
    Assert-Fixture ($script:envelopeOwned.Count -eq 2) 'Both live timeout process identities must be observed.'
    Assert-Exited $script:envelopeOwned
    Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'PID-tree timeout killed an unrelated decoy.'
    $script:scenarios.Add([pscustomobject]@{name=$name;pass=$true;exitCode=124;ownedBefore=$script:envelopeOwned;ownedAfter=@($script:envelopeOwned|ForEach-Object{[pscustomobject]@{pid=$_.Id;alive=(Test-IdentityAlive $_)}});decoysAlive=$true})
  }
  Set-Item -Path function:Start-OwnedProcess -Value ([scriptblock]::Create($originalStart))

  # Even inventory or logging failure must close owned handles and retain the failure.
  foreach($fault in @('log','snapshot')) {
    $faultContext=New-FixtureContext ($fault+'-failure')
    [void](Start-FixtureTree $faultContext ($fault+'-failure'))
    $faultOwned=@(Wait-FixtureTree ($fault+'-failure'))
    $originalWriter=${function:Write-OwnedProcessRecord}.ToString()
    if($fault -eq 'log') {
      Set-Item -Path function:Write-OwnedProcessRecord -Value { throw 'fixture log unavailable' }
    } else {
      $proxy=[pscustomobject]@{Inner=$faultContext.Jobs[0].Job}
      $proxy|Add-Member ScriptMethod Snapshot { throw 'fixture snapshot unavailable' }
      $proxy|Add-Member ScriptMethod Dispose { $this.Inner.Dispose() }
      $faultContext.Jobs[0].Job=$proxy
    }
    $faultRejected=$false
    try { Clear-OwnedProcessJobs $faultContext }
    catch { $faultRejected=$_.Exception.Message -match ('fixture '+$fault+' unavailable') }
    finally { Set-Item -Path function:Write-OwnedProcessRecord -Value ([scriptblock]::Create($originalWriter)) }
    Assert-Fixture $faultRejected 'A cleanup observation failure must propagate.'
    Assert-Fixture ($faultContext.Jobs.Count -eq 0) 'Failure cleanup retained an owned job handle.'
    Assert-Exited $faultOwned
    Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'Observation failure cleanup killed an unrelated decoy.'
    $script:scenarios.Add([pscustomobject]@{name=($fault+'-failure-closes-owned-job');pass=$true;failurePropagated=$faultRejected;ownedBefore=$faultOwned;ownedAfter=@($faultOwned|ForEach-Object{[pscustomobject]@{pid=$_.Id;alive=(Test-IdentityAlive $_)}});decoysAlive=$true})
  }

  # Instrument only the pre-assignment observation in an isolated function copy.
  $gateMarker=Join-Path $FixtureRoot 'gate-marker.json';$env:OWNERSHIP_FIXTURE_GATE_MARKER=$gateMarker
  $gateScript=Join-Path $FixtureRoot 'gate-child.ps1'
  [IO.File]::WriteAllText($gateScript,(Get-OwnedProcessGateBootstrap)+[Environment]::NewLine+'[IO.File]::WriteAllText($env:OWNERSHIP_FIXTURE_GATE_MARKER,"released",[Text.UTF8Encoding]::new($false)); Start-Sleep -Seconds 60',[Text.UTF8Encoding]::new($true))
  $gateContext=New-FixtureContext 'gate'
  $instrumented=$originalStart.Replace('$job.Assign($process)','Start-Sleep -Milliseconds 250; $script:gateHeld = -not (Test-Path -LiteralPath $env:OWNERSHIP_FIXTURE_GATE_MARKER); $job.Assign($process)')
  Set-Item -Path function:Start-OwnedProcess -Value ([scriptblock]::Create($instrumented))
  $gated=Start-OwnedProcess -Context $gateContext -CheckKey 'gate-test' -StartInfo(New-FixtureStartInfo $gateScript);$script:roots.Add($gated)
  $deadline=[DateTime]::UtcNow.AddSeconds(5);while(-not(Test-Path -LiteralPath $gateMarker) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 50}
  Assert-Fixture ($script:gateHeld -and (Test-Path -LiteralPath $gateMarker)) 'Child executed before job assignment or failed to execute after release.'
  Clear-OwnedProcessJobs $gateContext
  Remove-Item -LiteralPath $gateMarker
  $denied=$originalStart.Replace('$job.Assign($process)','$script:deniedIdentity=[pscustomobject]@{Id=$process.Id;Name=$process.ProcessName;StartTimeUtc=$process.StartTime.ToUniversalTime().ToString("o")}; throw "fixture assignment denied"')
  Set-Item -Path function:Start-OwnedProcess -Value ([scriptblock]::Create($denied))
  $rejected=$false
  try{[void](Start-OwnedProcess -Context $gateContext -CheckKey 'assign-denied' -StartInfo(New-FixtureStartInfo $gateScript))}catch{$rejected=$_.Exception.Message -match 'fixture assignment denied'}
  Set-Item -Path function:Start-OwnedProcess -Value ([scriptblock]::Create($originalStart))
  Assert-Fixture ($rejected -and -not(Test-Path -LiteralPath $gateMarker)) 'Assignment failure must not execute child contents.'
  Assert-Exited @($script:deniedIdentity)
  $script:observed.Add($script:deniedIdentity)
  $script:scenarios.Add([pscustomobject]@{name='gate-before-assignment-and-fail-closed';pass=$true;gateHeld=$script:gateHeld;assignmentDenied=$rejected;commandExecutedOnDenial=$false})

  # Simulate an abruptly ended prior owner while a separate outer safety job stays open.
  Set-TreeEnvironment 'prior-owner-tree'
  $hostScript=Join-Path $FixtureRoot 'prior-owner.ps1'
  $env:OWNERSHIP_FIXTURE_HELPER=$helper;$env:OWNERSHIP_FIXTURE_ROOT=$FixtureRoot
  $hostBody=@'
. $env:OWNERSHIP_FIXTURE_HELPER
$inner=New-OwnedProcessContext -LogPath(Join-Path $env:OWNERSHIP_FIXTURE_ROOT 'prior-owner-inner.jsonl')
$scriptPath=Join-Path $env:OWNERSHIP_FIXTURE_ROOT 'prior-owner-inner.ps1'
[IO.File]::WriteAllText($scriptPath,(Get-OwnedProcessGateBootstrap)+[Environment]::NewLine+'& node $env:OWNERSHIP_FIXTURE_TREE; exit $LASTEXITCODE',[Text.UTF8Encoding]::new($true))
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$scriptPath+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$process=Start-OwnedProcess -Context $inner -CheckKey 'prior-owner-inner' -StartInfo $info
while($true){Start-Sleep -Seconds 1}
'@
  [IO.File]::WriteAllText($hostScript,(Get-OwnedProcessGateBootstrap)+[Environment]::NewLine+$hostBody,[Text.UTF8Encoding]::new($true))
  $priorSupport=New-FixtureContext 'prior-owner-support'
  $hostProcess=Start-OwnedProcess -Context $priorSupport -CheckKey 'prior-owner-host' -StartInfo(New-FixtureStartInfo $hostScript);$script:roots.Add($hostProcess)
  $priorOwned=@(Wait-FixtureTree 'prior-owner-tree')
  $hostProcess.Kill();[void]$hostProcess.WaitForExit(5000)
  Assert-Exited $priorOwned
  Clear-PreflightRuntimeProcesses -Startup -Reason 'fixture startup after prior owner'
  Clear-AuditRuntimeProcesses -Startup -Reason 'fixture startup after prior owner'
  Assert-Fixture (@($decoys|Where-Object{-not(Test-IdentityAlive $_)}).Count -eq 0) 'Prior-owner startup cleanup killed decoys.'
  $script:scenarios.Add([pscustomobject]@{name='prior-owner-abrupt-exit-and-nested-jobs';pass=$true;priorOwned=$priorOwned;priorOwnedAlive=$false;outerSafetyJobStillOpen=$true;decoysAlive=$true})
} catch { $failure='Line '+$_.InvocationInfo.ScriptLineNumber+': '+$_.Exception.Message }
finally {
  foreach($context in $script:contexts.ToArray()){foreach($entry in $context.Jobs.ToArray()){foreach($identity in $entry.Job.Snapshot()){$script:observed.Add($identity)}}}
  foreach($context in $script:contexts.ToArray()){try{Clear-OwnedProcessJobs $context}catch{if(-not$failure){$failure='Fixture cleanup failed.'}}}
  foreach($process in $script:roots.ToArray()){try{[void]$process.WaitForExit(5000)}finally{$process.Dispose()}}
  $remaining=@($script:observed|Where-Object{Test-IdentityAlive $_})
  if($remaining.Count -and -not$failure){$failure='Fixture left a known owned process alive.'}
  $receipt=[ordered]@{powerShellVersion=$PSVersionTable.PSVersion.ToString();strategy='A-windows-job-object';pass=($null -eq $failure);failure=$failure;scenarios=@($script:scenarios.ToArray());observed=@($script:observed.ToArray());remaining=@($remaining);pidReuseTest='not-applicable-job-handle-ownership';fullFormalPreflightRun=$false}
  [IO.File]::WriteAllText((Join-Path $FixtureRoot 'summary.json'),($receipt|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
}
if($failure){throw $failure}
Write-Output 'Ownership fixtures passed; all fixture-owned processes exited.'
