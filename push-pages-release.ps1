param(
  [string]$Remote = 'origin',
  [string]$Branch = 'master',
  [string]$Workflow = 'Pages deploy',
  [string]$WorkflowFile = 'pages-deploy.yml',
  [int]$PushRunWaitSeconds = 90,
  [int]$RunTimeoutSeconds = 1800,
  [int]$ManifestTimeoutSeconds = 300,
  [int]$DeploymentRecoverySeconds = 180,
  [int]$PollSeconds = 5,
  [int]$PublicSmokeAttempts = 3,
  [int]$PublicSmokeRetryDelaySeconds = 10,
  [switch]$ForceDeploy,
  [switch]$VerifyOnly,
  [switch]$AllowDirtyVerification,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 may decode native UTF-8 output with the process code page
# when this script runs hidden with redirected output. GitHub JSON can contain a
# Chinese commit title, so pin both native-process channels before invoking gh.
$script:NativeUtf8Encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $script:NativeUtf8Encoding
$OutputEncoding = $script:NativeUtf8Encoding

function Write-ProgressLine {
  param([string]$Message)
  if (-not $Quiet) {
    Write-Host "[pages-release] $Message"
  }
}

function Invoke-ExternalText {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [switch]$AllowEmpty
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 turns native stderr (including successful Git progress)
    # into a terminating NativeCommandError when the caller uses Stop.
    $ErrorActionPreference = 'Continue'
    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $text = (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
  if ($exitCode -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $exitCode. $text"
  }
  if (-not $AllowEmpty -and -not $text) {
    throw "$FilePath $($Arguments -join ' ') returned no output."
  }
  return $text
}

function Invoke-ExternalJson {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $text = Invoke-ExternalText -FilePath $FilePath -Arguments $Arguments
  try {
    return $text | ConvertFrom-Json
  } catch {
    throw "$FilePath $($Arguments -join ' ') did not return valid JSON. $text"
  }
}

function Invoke-PublicArtifactVerification {
  param(
    [string]$ScriptPath,
    [string]$PagesUrl,
    [string]$HeadSha,
    [long]$RunId
  )

  $attemptsVariable = 'PAGES_HTTP_SMOKE_ATTEMPTS'
  $delayVariable = 'PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS'
  $previousAttempts = [Environment]::GetEnvironmentVariable($attemptsVariable, 'Process')
  $previousDelay = [Environment]::GetEnvironmentVariable($delayVariable, 'Process')
  try {
    [Environment]::SetEnvironmentVariable($attemptsVariable, [string]$PublicSmokeAttempts, 'Process')
    [Environment]::SetEnvironmentVariable($delayVariable, [string]$PublicSmokeRetryDelaySeconds, 'Process')
    $verificationOutput = Invoke-ExternalText -FilePath $script:NodePath -Arguments @(
      $ScriptPath,
      '--base-url', $PagesUrl,
      '--check-private-boundary',
      '--expected-commit-sha', $HeadSha,
      '--expected-run-id', ([string]$RunId),
      '--expect-clean-source'
    )
    $attemptMatches = [regex]::Matches($verificationOutput, '(?m)^pagesHttpSmokeAttemptCount=(\d+)\s*$')
    if ($attemptMatches.Count -ne 1) {
      throw 'Public artifact verification did not return exactly one attempt-count marker.'
    }
    $attemptCount = [int]$attemptMatches[0].Groups[1].Value
    if ($attemptCount -le 0 -or $attemptCount -gt $PublicSmokeAttempts) {
      throw "Public artifact verification returned invalid attempt count $attemptCount."
    }
    return $attemptCount
  } finally {
    [Environment]::SetEnvironmentVariable($attemptsVariable, $previousAttempts, 'Process')
    [Environment]::SetEnvironmentVariable($delayVariable, $previousDelay, 'Process')
  }
}

function Get-WorkflowRuns {
  param(
    [string]$HeadSha
  )

  $payload = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
    'run', 'list',
    '--workflow', $Workflow,
    '--commit', $HeadSha,
    '--limit', '20',
    '--json', 'databaseId,event,status,conclusion,createdAt,updatedAt,url,headSha'
  )
  return @($payload | Where-Object { ([string]$_.headSha).ToLowerInvariant() -eq $HeadSha.ToLowerInvariant() })
}

function Get-RunEvidence {
  param(
    [long]$RunId
  )

  $run = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
    'api', "repos/$script:RepoName/actions/runs/$RunId"
  )
  $jobsPayload = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
    'api', "repos/$script:RepoName/actions/runs/$RunId/jobs?per_page=100"
  )
  $jobs = @($jobsPayload.jobs)
  $expectedNames = @('build', 'deploy', 'live-smoke', 'performance-trend')

  $failedJobs = @($jobs | Where-Object {
    $_.status -eq 'completed' -and $_.conclusion -ne 'success'
  })
  if ($failedJobs.Count -gt 0) {
    $failedSummary = ($failedJobs | ForEach-Object { "$($_.name)=$($_.conclusion)" }) -join ', '
    throw "Pages workflow run $RunId has failed jobs: $failedSummary. $($run.html_url)"
  }

  $jobEvidence = @()
  $allExpectedSuccessful = $true
  $staleJobNames = @()
  foreach ($expectedName in $expectedNames) {
    $job = @($jobs | Where-Object { $_.name -eq $expectedName } | Select-Object -First 1)
    if ($job.Count -eq 0) {
      $allExpectedSuccessful = $false
      $jobEvidence += [ordered]@{
        name = $expectedName
        status = 'missing'
        conclusion = $null
        completedAt = $null
      }
      continue
    }
    $steps = @($job[0].steps)
    $failedSteps = @($steps | Where-Object {
      $_.status -eq 'completed' -and $_.conclusion -ne 'success'
    })
    if ($failedSteps.Count -gt 0) {
      $failedStepSummary = ($failedSteps | ForEach-Object { "$expectedName/$($_.name)=$($_.conclusion)" }) -join ', '
      throw "Pages workflow run $RunId has failed steps: $failedStepSummary. $($run.html_url)"
    }
    $allStepsSuccessful = ($steps.Count -gt 0 -and @($steps | Where-Object {
      $_.status -ne 'completed' -or $_.conclusion -ne 'success'
    }).Count -eq 0)
    $jobAggregateSuccessful = ($job[0].status -eq 'completed' -and $job[0].conclusion -eq 'success')
    $jobAggregateStale = (-not $jobAggregateSuccessful -and
      $run.status -eq 'completed' -and $run.conclusion -eq 'success' -and $allStepsSuccessful)
    if ($jobAggregateStale) {
      $staleJobNames += $expectedName
    }
    $effectiveSuccessful = ($jobAggregateSuccessful -or $jobAggregateStale)

    $jobEvidence += [ordered]@{
      name = [string]$job[0].name
      status = [string]$job[0].status
      conclusion = [string]$job[0].conclusion
      completedAt = [string]$job[0].completed_at
      stepCount = $steps.Count
      allStepsSuccessful = $allStepsSuccessful
      aggregateStatusStale = $jobAggregateStale
      effectiveSuccessful = $effectiveSuccessful
    }
    if (-not $effectiveSuccessful) {
      $allExpectedSuccessful = $false
    }
  }

  if ($run.status -eq 'completed' -and -not $allExpectedSuccessful) {
    throw "Pages workflow run $RunId completed without all required jobs succeeding. $($run.html_url)"
  }

  return [pscustomobject]@{
    Run = $run
    Jobs = $jobEvidence
    AllExpectedSuccessful = $allExpectedSuccessful
    TopLevelStale = ($allExpectedSuccessful -and $run.status -ne 'completed')
    JobStatusStale = ($staleJobNames.Count -gt 0)
    StaleJobNames = $staleJobNames
  }
}

function Wait-RunJobs {
  param(
    [long]$RunId
  )

  $deadline = (Get-Date).AddSeconds($RunTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $evidence = Get-RunEvidence -RunId $RunId
    if ($evidence.AllExpectedSuccessful) {
      if ($evidence.JobStatusStale) {
        Write-ProgressLine "Required job aggregates are stale for $($evidence.StaleJobNames -join ', '), but the completed successful run and every job step agree."
      }
      if ($evidence.TopLevelStale) {
        Write-ProgressLine "All required jobs succeeded; the aggregate run status is still $($evidence.Run.status)."
      } else {
        Write-ProgressLine 'All required Pages jobs succeeded.'
      }
      return $evidence
    }
    $states = ($evidence.Jobs | ForEach-Object { "$($_.name)=$($_.status)" }) -join ', '
    Write-ProgressLine "Waiting for run $RunId ($states)."
    Start-Sleep -Seconds $PollSeconds
  }
  throw "Timed out after $RunTimeoutSeconds seconds waiting for Pages workflow run $RunId."
}

function Get-PagesInfo {
  return Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
    'api', "repos/$script:RepoName/pages"
  )
}

function Test-QueuedPagesDeploymentTimeout {
  param(
    [long]$RunId
  )

  $failedLog = Invoke-ExternalText -FilePath $script:GhPath -Arguments @(
    'run', 'view', ([string]$RunId), '--log-failed'
  ) -AllowEmpty
  return ($failedLog -match 'Current status: deployment_(queued|in_progress)' -and
    $failedLog -match 'Timeout reached, aborting!' -and
    $failedLog -match 'Canceling Pages deployment')
}

function Get-PagesDeploymentStatus {
  param(
    [string]$HeadSha
  )

  try {
    $deployment = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
      'api', "repos/$script:RepoName/pages/deployments/$HeadSha"
    )
    return ([string]$deployment.status).Trim()
  } catch {
    return ''
  }
}

function Wait-PagesDeploymentRecovery {
  param(
    [string]$HeadSha
  )

  $deadline = (Get-Date).AddSeconds($DeploymentRecoverySeconds)
  while ((Get-Date) -lt $deadline) {
    $status = Get-PagesDeploymentStatus -HeadSha $HeadSha
    if ($status -eq 'succeed') {
      Write-ProgressLine "Pages backend completed deployment $HeadSha after the action timeout."
      return $true
    }
    Write-ProgressLine "Waiting for the timed-out Pages backend deployment ($status)."
    Start-Sleep -Seconds $PollSeconds
  }
  return $false
}

function Wait-RerunAttempt {
  param(
    [long]$RunId,
    [int]$PreviousAttempt
  )

  $deadline = (Get-Date).AddSeconds([Math]::Max(60, $PollSeconds * 12))
  while ((Get-Date) -lt $deadline) {
    $run = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
      'api', "repos/$script:RepoName/actions/runs/$RunId"
    )
    if ([int]$run.run_attempt -gt $PreviousAttempt) {
      return
    }
    Start-Sleep -Seconds $PollSeconds
  }
  throw "Timed out waiting for rerun attempt after Pages backend recovery for run $RunId."
}

function Wait-RunJobsWithRecovery {
  param(
    [long]$RunId,
    [string]$HeadSha
  )

  try {
    return Wait-RunJobs -RunId $RunId
  } catch {
    $initialError = $_
    $run = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
      'api', "repos/$script:RepoName/actions/runs/$RunId"
    )
    if (-not (Test-QueuedPagesDeploymentTimeout -RunId $RunId)) {
      throw $initialError
    }
    if (-not (Wait-PagesDeploymentRecovery -HeadSha $HeadSha)) {
      throw "Pages deployment remained incomplete for $DeploymentRecoverySeconds seconds after the queued-deployment timeout. $initialError"
    }

    $previousAttempt = [int]$run.run_attempt
    Write-ProgressLine "Rerunning failed jobs for run $RunId after the Pages backend completed."
    Invoke-ExternalText -FilePath $script:GhPath -Arguments @(
      'run', 'rerun', ([string]$RunId), '--failed'
    ) -AllowEmpty | Out-Null
    Wait-RerunAttempt -RunId $RunId -PreviousAttempt $previousAttempt
    $script:DeploymentRecoveryUsed = $true
    return Wait-RunJobs -RunId $RunId
  }
}

function Get-PublicManifest {
  param(
    [string]$PagesUrl
  )

  $baseUrl = $PagesUrl.TrimEnd('/')
  $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $manifestUrl = "$baseUrl/pages-deployment.json?release_check=$cacheBust"
  try {
    return Invoke-RestMethod -Uri $manifestUrl -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 30
  } catch {
    return $null
  }
}

function Test-ManifestIdentity {
  param(
    [object]$Manifest,
    [string]$HeadSha,
    [string]$RunId
  )

  if (-not $Manifest) { return $false }
  if (([string]$Manifest.commitSha).ToLowerInvariant() -ne $HeadSha.ToLowerInvariant()) { return $false }
  if ([string]$Manifest.runId -ne [string]$RunId) { return $false }
  if ($Manifest.sourceDirty -isnot [bool] -or [bool]$Manifest.sourceDirty) { return $false }
  return $true
}

function Wait-PublicManifest {
  param(
    [string]$PagesUrl,
    [string]$HeadSha,
    [long]$RunId
  )

  $deadline = (Get-Date).AddSeconds($ManifestTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $manifest = Get-PublicManifest -PagesUrl $PagesUrl
    if (Test-ManifestIdentity -Manifest $manifest -HeadSha $HeadSha -RunId ([string]$RunId)) {
      Write-ProgressLine "Public deployment manifest matches commit $HeadSha and run $RunId."
      return $manifest
    }
    Write-ProgressLine "Waiting for the public deployment manifest to match run $RunId."
    Start-Sleep -Seconds $PollSeconds
  }
  throw "Timed out after $ManifestTimeoutSeconds seconds waiting for the public Pages manifest to match commit $HeadSha and run $RunId."
}

function Select-LatestRun {
  param(
    [object[]]$Runs,
    [string]$Event
  )

  $candidates = @($Runs)
  if ($Event) {
    $candidates = @($candidates | Where-Object { $_.event -eq $Event })
  }
  if ($candidates.Count -eq 0) { return $null }
  return @($candidates | Sort-Object { [DateTimeOffset]::Parse([string]$_.createdAt) } -Descending)[0]
}

function Wait-PushRun {
  param(
    [string]$HeadSha
  )

  $deadline = (Get-Date).AddSeconds($PushRunWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    $pushRun = Select-LatestRun -Runs (Get-WorkflowRuns -HeadSha $HeadSha) -Event 'push'
    if ($pushRun) { return $pushRun }
    Write-ProgressLine "Waiting for a push-triggered '$Workflow' run for $HeadSha."
    Start-Sleep -Seconds $PollSeconds
  }
  return $null
}

function Dispatch-WorkflowRun {
  param(
    [string]$HeadSha
  )

  Write-ProgressLine "No push-triggered run appeared; dispatching '$Workflow' for $Branch."
  $dispatchStarted = [DateTimeOffset]::UtcNow.AddSeconds(-5)
  $dispatchOutput = Invoke-ExternalText -FilePath $script:GhPath -Arguments @(
    'workflow', 'run', $Workflow, '--ref', $Branch
  ) -AllowEmpty

  if ($dispatchOutput -match '/actions/runs/(?<id>\d+)') {
    $runId = [long]$Matches['id']
    return [pscustomobject]@{
      databaseId = $runId
      event = 'workflow_dispatch'
      url = $dispatchOutput.Trim()
      headSha = $HeadSha
    }
  }

  $deadline = (Get-Date).AddSeconds([Math]::Max(60, $PushRunWaitSeconds))
  while ((Get-Date) -lt $deadline) {
    $runs = @(Get-WorkflowRuns -HeadSha $HeadSha | Where-Object {
      $_.event -eq 'workflow_dispatch' -and [DateTimeOffset]::Parse([string]$_.createdAt) -ge $dispatchStarted
    })
    $run = Select-LatestRun -Runs $runs -Event 'workflow_dispatch'
    if ($run) { return $run }
    Start-Sleep -Seconds $PollSeconds
  }
  throw "The fallback workflow dispatch did not create a discoverable run for commit $HeadSha."
}

if ($PushRunWaitSeconds -lt 0 -or $RunTimeoutSeconds -le 0 -or $ManifestTimeoutSeconds -le 0 -or $DeploymentRecoverySeconds -le 0 -or $PollSeconds -le 0 -or $PublicSmokeAttempts -le 0 -or $PublicSmokeRetryDelaySeconds -lt 0) {
  throw 'Timeout values must be positive; PushRunWaitSeconds may be zero.'
}
if ($AllowDirtyVerification -and -not $VerifyOnly) {
  throw 'AllowDirtyVerification is only valid with VerifyOnly and can never authorize a push or dispatch.'
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $RepoRoot) { $RepoRoot = (Get-Location).Path }
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

function Resolve-RepoToolScript {
  param([Parameter(Mandatory = $true)][string]$LeafName)

  $matches = @(
    Get-ChildItem -LiteralPath $RepoRoot -Directory | ForEach-Object {
      $candidate = Join-Path $_.FullName (Join-Path 'tools' $LeafName)
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        (Resolve-Path -LiteralPath $candidate).Path
      }
    }
  )
  if ($matches.Count -ne 1) {
    throw "Expected exactly one governed tool script named '$LeafName'; found $($matches.Count)."
  }
  return $matches[0]
}

$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $gitCommand) { $gitCommand = Get-Command git -ErrorAction SilentlyContinue }
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
$ghCommand = Get-Command gh.exe -ErrorAction SilentlyContinue
if (-not $ghCommand) { $ghCommand = Get-Command gh -ErrorAction SilentlyContinue }
if (-not $gitCommand) { throw 'git is required.' }
if (-not $nodeCommand) { throw 'Node.js is required.' }
if (-not $ghCommand) { throw 'GitHub CLI (gh) is required.' }
$script:GitPath = $gitCommand.Source
$script:NodePath = $nodeCommand.Source
$script:GhPath = $ghCommand.Source

Invoke-ExternalText -FilePath $script:GhPath -Arguments @('auth', 'status') -AllowEmpty | Out-Null
$script:RepoName = (Invoke-ExternalText -FilePath $script:GhPath -Arguments @(
  'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'
)).Trim()

$workflowInfo = Invoke-ExternalJson -FilePath $script:GhPath -Arguments @(
  'api', "repos/$script:RepoName/actions/workflows/$WorkflowFile"
)
if ($workflowInfo.state -ne 'active') {
  throw "Workflow $WorkflowFile is not active. Current state: $($workflowInfo.state)."
}

$currentBranch = (Invoke-ExternalText -FilePath $script:GitPath -Arguments @('branch', '--show-current')).Trim()
if ($currentBranch -ne $Branch) {
  throw "Current branch is '$currentBranch'; expected '$Branch'."
}

$workingTree = Invoke-ExternalText -FilePath $script:GitPath -Arguments @(
  'status', '--porcelain', '--untracked-files=all'
) -AllowEmpty
if ($workingTree -and -not ($VerifyOnly -and $AllowDirtyVerification)) {
  throw 'The working tree is not clean. Commit or remove tracked and untracked changes before pushing.'
}

$headSha = (Invoke-ExternalText -FilePath $script:GitPath -Arguments @('rev-parse', 'HEAD')).Trim().ToLowerInvariant()
if ($headSha -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve a full Git HEAD SHA. Received: $headSha"
}

$lineageScript = Resolve-RepoToolScript -LeafName 'verify-pages-release-lineage.js'
Write-ProgressLine "Verifying that HEAD only carries status snapshots for its tested parent commit."
Invoke-ExternalText -FilePath $script:NodePath -Arguments @(
  $lineageScript,
  '--repo-root', $RepoRoot,
  '--head-sha', $headSha,
  '--expected-branch', $Branch
) | Out-Null

$pagesInfo = Get-PagesInfo
$pagesUrl = ([string]$pagesInfo.html_url).Trim()
if (-not $pagesUrl) { throw 'The repository does not expose a GitHub Pages URL.' }

if ($VerifyOnly) {
  $currentManifest = Get-PublicManifest -PagesUrl $pagesUrl
  if (-not $currentManifest -or ([string]$currentManifest.commitSha).ToLowerInvariant() -ne $headSha) {
    throw "The public Pages manifest does not match local HEAD $headSha."
  }
  if ($currentManifest.sourceDirty -isnot [bool] -or [bool]$currentManifest.sourceDirty) {
    throw 'The public Pages manifest does not prove sourceDirty=false.'
  }
  $selectedRun = [pscustomobject]@{
    databaseId = [long]([string]$currentManifest.runId)
    event = 'manifest-verification'
    url = "https://github.com/$script:RepoName/actions/runs/$([string]$currentManifest.runId)"
    headSha = $headSha
  }
  $pushed = $false
} else {
  Write-ProgressLine "Fetching $Remote/$Branch before push."
  Invoke-ExternalText -FilePath $script:GitPath -Arguments @('fetch', '--prune', $Remote, $Branch) -AllowEmpty | Out-Null
  $remoteRef = "$Remote/$Branch"
  $remoteSha = (Invoke-ExternalText -FilePath $script:GitPath -Arguments @('rev-parse', $remoteRef)).Trim().ToLowerInvariant()
  $countsText = (Invoke-ExternalText -FilePath $script:GitPath -Arguments @(
    'rev-list', '--left-right', '--count', "$remoteRef...HEAD"
  )).Trim()
  $counts = @($countsText -split '\s+')
  if ($counts.Count -lt 2) { throw "Could not parse Git ahead/behind counts: $countsText" }
  $behind = [int]$counts[0]
  $ahead = [int]$counts[1]
  if ($behind -gt 0) {
    throw "Local $Branch is behind or diverged from $remoteRef by $behind commit(s). Resolve this before release."
  }

  $pushed = $false
  if ($ahead -gt 0) {
    Write-ProgressLine "Pushing $ahead commit(s) to $remoteRef without force."
    Invoke-ExternalText -FilePath $script:GitPath -Arguments @('push', $Remote, "$Branch`:$Branch") -AllowEmpty | Out-Null
    $pushed = $true
    $remoteSha = (Invoke-ExternalText -FilePath $script:GitPath -Arguments @('rev-parse', $remoteRef)).Trim().ToLowerInvariant()
    if ($remoteSha -ne $headSha) {
      throw "Remote $remoteRef is $remoteSha after push; expected $headSha."
    }
  } else {
    Write-ProgressLine "$remoteRef already matches local HEAD."
  }

  $currentManifest = Get-PublicManifest -PagesUrl $pagesUrl
  if (-not $ForceDeploy -and $currentManifest -and
      ([string]$currentManifest.commitSha).ToLowerInvariant() -eq $headSha -and
      $currentManifest.sourceDirty -is [bool] -and -not [bool]$currentManifest.sourceDirty) {
    Write-ProgressLine 'The public Pages manifest already matches HEAD; reusing its release run.'
    $selectedRun = [pscustomobject]@{
      databaseId = [long]([string]$currentManifest.runId)
      event = 'existing-deployment'
      url = "https://github.com/$script:RepoName/actions/runs/$([string]$currentManifest.runId)"
      headSha = $headSha
    }
  } else {
    $selectedRun = $null
    if ($pushed) {
      $selectedRun = Wait-PushRun -HeadSha $headSha
    }
    if (-not $selectedRun) {
      $existingRuns = Get-WorkflowRuns -HeadSha $headSha
      $selectedRun = Select-LatestRun -Runs $existingRuns -Event ''
    }
    if (-not $selectedRun) {
      $selectedRun = Dispatch-WorkflowRun -HeadSha $headSha
    }
  }
}

$runId = [long]$selectedRun.databaseId
if ($runId -le 0) { throw 'Could not resolve a valid Pages workflow run ID.' }
Write-ProgressLine "Tracking run $runId."
$script:DeploymentRecoveryUsed = $false
$runEvidence = Wait-RunJobsWithRecovery -RunId $runId -HeadSha $headSha
$manifest = Wait-PublicManifest -PagesUrl $pagesUrl -HeadSha $headSha -RunId $runId
$publicSmokeScript = Resolve-RepoToolScript -LeafName 'pages-live-smoke.js'
Write-ProgressLine "Independently verifying every public artifact file from this workstation (up to $PublicSmokeAttempts attempt(s), transient failures only)."
$publicArtifactVerificationAttemptCount = Invoke-PublicArtifactVerification -ScriptPath $publicSmokeScript -PagesUrl $pagesUrl -HeadSha $headSha -RunId $runId

$result = [ordered]@{
  schemaVersion = 1
  status = 'success'
  repository = $script:RepoName
  remote = $Remote
  branch = $Branch
  headSha = $headSha
  pushed = $pushed
  verifyOnly = [bool]$VerifyOnly
  workflow = $Workflow
  runId = [string]$runId
  runEvent = [string]$selectedRun.event
  runUrl = [string]$selectedRun.url
  aggregateRunStatus = [string]$runEvidence.Run.status
  aggregateRunConclusion = [string]$runEvidence.Run.conclusion
  aggregateStatusStale = [bool]$runEvidence.TopLevelStale
  aggregateJobStatusStale = [bool]$runEvidence.JobStatusStale
  deploymentRecoveryUsed = [bool]$script:DeploymentRecoveryUsed
  staleJobNames = @($runEvidence.StaleJobNames)
  jobs = $runEvidence.Jobs
  pagesUrl = $pagesUrl
  pagesStatus = [string]$pagesInfo.status
  publicArtifactVerified = $true
  publicArtifactVerificationAttemptCount = $publicArtifactVerificationAttemptCount
  publicArtifactVerificationRetried = $publicArtifactVerificationAttemptCount -gt 1
  publicArtifactVerificationMaxAttempts = $PublicSmokeAttempts
  publicArtifactVerificationRetryDelaySeconds = $PublicSmokeRetryDelaySeconds
  deploymentManifest = [ordered]@{
    schemaVersion = $manifest.schemaVersion
    commitSha = [string]$manifest.commitSha
    runId = [string]$manifest.runId
    runAttempt = $manifest.runAttempt
    sourceDirty = [bool]$manifest.sourceDirty
    artifactDigest = [string]$manifest.artifactDigest
    fileCount = $manifest.fileCount
    totalBytes = $manifest.totalBytes
  }
}

$result | ConvertTo-Json -Depth 8
