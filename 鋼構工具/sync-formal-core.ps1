param(
  [switch]$Check,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetRoot = Join-Path $root "core"
$targetRootResolved = (Resolve-Path -Path $targetRoot).ProviderPath
$manifestPath = Join-Path $targetRoot "formal-core-manifest.json"
$steelSourceCandidates = @(Resolve-Path -Path (Join-Path $root "..\*\core\materials\steel.js") -ErrorAction Stop | Where-Object { $_.ProviderPath -notlike "$targetRootResolved*" })
$reportSourceCandidates = @(Resolve-Path -Path (Join-Path $root "..\*\core\ui\report.js") -ErrorAction Stop | Where-Object { $_.ProviderPath -notlike "$targetRootResolved*" })

if ($steelSourceCandidates.Count -ne 1) {
  throw "Unable to resolve a unique source steel core from sibling workspaces."
}

if ($reportSourceCandidates.Count -ne 1) {
  throw "Unable to resolve a unique source report core from sibling workspaces."
}

$mappings = @(
  [pscustomobject]@{
    Label = "steel core"
    Source = $steelSourceCandidates[0].ProviderPath
    Target = Join-Path $targetRoot "materials\steel.js"
  },
  [pscustomobject]@{
    Label = "report core"
    Source = $reportSourceCandidates[0].ProviderPath
    Target = Join-Path $targetRoot "ui\report.js"
  }
)

function Write-Status {
  param(
    [string]$Message,
    [string]$Color = "Gray"
  )

  if ($Quiet) {
    return
  }

  Write-Host $Message -ForegroundColor $Color
}

function Get-HashText {
  param([string]$Path)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      $hashBytes = $sha256.ComputeHash($stream)
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sha256.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
}

function Get-IsoTimestamp {
  param([datetime]$Value = (Get-Date))

  return $Value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Get-FileState {
  param($Mapping)

  $targetExists = Test-Path $Mapping.Target
  $sourceItem = Get-Item -LiteralPath $Mapping.Source
  $targetItem = if ($targetExists) { Get-Item -LiteralPath $Mapping.Target } else { $null }
  $sourceHash = Get-HashText $Mapping.Source
  $targetHash = if ($targetExists) { Get-HashText $Mapping.Target } else { $null }

  return [pscustomobject]@{
    label = $Mapping.Label
    source = $Mapping.Source
    target = $Mapping.Target
    sourceHash = $sourceHash
    targetHash = $targetHash
    sourceLastWriteUtc = Get-IsoTimestamp $sourceItem.LastWriteTimeUtc
    targetLastWriteUtc = if ($targetItem) { Get-IsoTimestamp $targetItem.LastWriteTimeUtc } else { $null }
    targetExists = $targetExists
    inSync = $targetExists -and ($sourceHash -eq $targetHash)
  }
}

function Read-Manifest {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  return Get-Content -Path $Path -Raw | ConvertFrom-Json
}

function Get-ManifestDrift {
  param(
    $Manifest,
    [object[]]$CurrentStates
  )

  $issues = New-Object System.Collections.Generic.List[object]

  if (-not $Manifest) {
    $issues.Add([pscustomobject]@{
      label = "formal-core-manifest"
      reason = "manifest-missing"
      path = $manifestPath
    })
    return $issues
  }

  $manifestFiles = @($Manifest.files)
  if ($manifestFiles.Count -ne $CurrentStates.Count) {
    $issues.Add([pscustomobject]@{
      label = "formal-core-manifest"
      reason = "manifest-file-count-mismatch"
      path = $manifestPath
    })
    return $issues
  }

  foreach ($state in $CurrentStates) {
    $manifestEntry = $manifestFiles | Where-Object { $_.label -eq $state.label } | Select-Object -First 1
    if (-not $manifestEntry) {
      $issues.Add([pscustomobject]@{
        label = $state.label
        reason = "manifest-entry-missing"
        path = $manifestPath
      })
      continue
    }

    if (
      $manifestEntry.source -ne $state.source -or
      $manifestEntry.target -ne $state.target -or
      $manifestEntry.sourceHash -ne $state.sourceHash -or
      $manifestEntry.targetHash -ne $state.targetHash
    ) {
      $issues.Add([pscustomobject]@{
        label = $state.label
        reason = "manifest-stale"
        path = $manifestPath
      })
    }
  }

  return $issues
}

function Write-Manifest {
  param(
    [object[]]$States,
    [string]$Mode,
    [object[]]$SyncedEntries
  )

  $payload = [ordered]@{
    generatedAt = Get-IsoTimestamp
    mode = $Mode
    toolRoot = $root
    targetRoot = $targetRoot
    manifestVersion = 1
    files = @(
      $States | ForEach-Object {
        [ordered]@{
          label = $_.label
          source = $_.source
          target = $_.target
          sourceHash = $_.sourceHash
          targetHash = $_.targetHash
          sourceLastWriteUtc = $_.sourceLastWriteUtc
          targetLastWriteUtc = $_.targetLastWriteUtc
          inSync = $_.inSync
        }
      }
    )
    syncedLabels = @($SyncedEntries | ForEach-Object { $_.label })
  }

  $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8
}

$drifted = New-Object System.Collections.Generic.List[object]
$synced = New-Object System.Collections.Generic.List[object]
$currentStates = New-Object System.Collections.Generic.List[object]

foreach ($mapping in $mappings) {
  if (-not (Test-Path $mapping.Source)) {
    throw "Missing source file: $($mapping.Source)"
  }

  $targetDir = Split-Path -Parent $mapping.Target
  if (-not (Test-Path $targetDir)) {
    New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
  }

  $state = Get-FileState $mapping
  $needsSync = -not $state.inSync

  if ($needsSync) {
    if ($Check) {
      $drifted.Add([pscustomobject]@{
        label = $mapping.Label
        source = $mapping.Source
        target = $mapping.Target
        sourceHash = $state.sourceHash
        targetHash = $state.targetHash
        reason = if (-not $state.targetExists) { "missing-target" } else { "hash-mismatch" }
      })
      $currentStates.Add($state)
      continue
    }

    Copy-Item -LiteralPath $mapping.Source -Destination $mapping.Target -Force
    $state = Get-FileState $mapping
    $synced.Add($state)
    Write-Status "Synced $($mapping.Label): $($mapping.Target)" "Green"
  } else {
    Write-Status "Up to date: $($mapping.Label)" "DarkGreen"
  }

  $currentStates.Add($state)
}

if ($Check) {
  $manifestDrift = Get-ManifestDrift -Manifest (Read-Manifest $manifestPath) -CurrentStates $currentStates
  foreach ($issue in $manifestDrift) {
    $drifted.Add($issue)
  }

  if ($drifted.Count -gt 0) {
    foreach ($item in $drifted) {
      Write-Status "Drift detected: $($item.label) ($($item.reason))" "Red"
      if ($item.PSObject.Properties.Name -contains "Source") {
        Write-Status "  source: $($item.Source)" "DarkRed"
      }
      if ($item.PSObject.Properties.Name -contains "Target") {
        Write-Status "  target: $($item.Target)" "DarkRed"
      }
      if ($item.PSObject.Properties.Name -contains "path") {
        Write-Status "  manifest: $($item.path)" "DarkRed"
      }
    }
    throw "Formal core drift detected. Run .\sync-formal-core.ps1 before auditing."
  }

  Write-Status "Manifest: $manifestPath" "DarkGreen"
  Write-Status "Formal core check passed." "Green"
  return
}

Write-Manifest -States $currentStates -Mode "sync" -SyncedEntries $synced
Write-Status "Manifest updated: $manifestPath" "DarkGreen"

if ($synced.Count -eq 0) {
  Write-Status "Formal core already in sync." "Green"
}
