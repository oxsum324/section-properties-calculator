param(
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
function Get-RelativePathText {
  param([string]$BasePath, [string]$FullPath)
  $baseResolved = (Resolve-Path -LiteralPath $BasePath).Path.TrimEnd([char[]]@('\', '/'))
  $fullResolved = (Resolve-Path -LiteralPath $FullPath).Path
  if ($fullResolved.Equals($baseResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ''
  }
  $basePrefix = $baseResolved + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fullResolved.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside base path: $FullPath"
  }
  return $fullResolved.Substring($basePrefix.Length).Replace('\', '/')
}

function Get-FileSha256Text {
  param([string]$Path)
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($resolved)
  try {
    return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

# The bolt review app lives at one exact path; its family directory name is
# spelled with code points so this script stays pure ASCII, and no directory
# scan can pick a stale copy (for example under _tmp).
$boltFamilyDirName = -join ([char[]]@(0x87BA, 0x6813, 0x6AA2, 0x8A0E))
$boltRoot = Join-Path (Join-Path $root $boltFamilyDirName) 'bolt-review-tool'
if (-not (Test-Path -LiteralPath (Join-Path $boltRoot 'src\App.tsx') -PathType Leaf)) {
  throw "Missing bolt review app: $boltRoot"
}
$boltRoot = (Resolve-Path -LiteralPath $boltRoot).Path
$boltRelativeRoot = Get-RelativePathText -BasePath $root -FullPath $boltRoot

$anchorSourceRoots = @(
  (Join-Path $boltRelativeRoot 'src'),
  (Join-Path $boltRelativeRoot 'public'),
  (Join-Path $boltRelativeRoot 'package.json'),
  (Join-Path $boltRelativeRoot 'package-lock.json'),
  (Join-Path $boltRelativeRoot 'vite.config.ts'),
  (Join-Path $boltRelativeRoot 'tsconfig.json'),
  (Join-Path $boltRelativeRoot 'tsconfig.app.json'),
  (Join-Path $boltRelativeRoot 'tsconfig.node.json'),
  (Join-Path $boltRelativeRoot 'eslint.config.js')
)
$anchorSourceExtensions = @('.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.svg', '.webmanifest')
$anchorExcludePatterns = @('\node_modules\', '\dist\', '\coverage\')

function Get-AnchorSourceFingerprint {
  param([string]$WorkspaceRoot)

  $records = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $anchorSourceRoots) {
    $full = Join-Path $WorkspaceRoot $entry
    if (-not (Test-Path -LiteralPath $full)) {
      continue
    }

    $item = Get-Item -LiteralPath $full
    $files = @()
    if ($item.PSIsContainer) {
      $files = Get-ChildItem -LiteralPath $item.FullName -File -Recurse | Where-Object {
        $pathText = $_.FullName
        $excluded = $false
        foreach ($pattern in $anchorExcludePatterns) {
          if ($pathText -like "*$pattern*") {
            $excluded = $true
            break
          }
        }
        -not $excluded -and $anchorSourceExtensions -contains $_.Extension.ToLowerInvariant()
      }
    } elseif ($anchorSourceExtensions -contains $item.Extension.ToLowerInvariant()) {
      $files = @($item)
    }

    foreach ($file in $files) {
      $relative = Get-RelativePathText -BasePath $WorkspaceRoot -FullPath $file.FullName
      $hash = Get-FileSha256Text -Path $file.FullName
      $records.Add("$relative|$($file.Length)|$hash")
    }
  }

  $sortedRecords = $records.ToArray()
  [System.Array]::Sort($sortedRecords, [System.StringComparer]::Ordinal)
  $joined = $sortedRecords -join "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

$dist = Join-Path $boltRoot 'dist'
$anchor = Join-Path $root 'anchor'

if (-not (Test-Path -LiteralPath $boltRoot)) {
  throw "Missing bolt review app: $boltRoot"
}
if (-not (Test-Path -LiteralPath $anchor)) {
  throw "Missing anchor deployment directory: $anchor"
}

# The dist index.html lacks the shared accessibility runtime tag. The private
# helper lives at one exact path; its toolbox directory name is spelled with
# code points so this script stays pure ASCII, and no directory scan can pick
# a stale copy. Locate it before building so a missing helper fails fast.
$toolboxDirName = -join ([char[]]@(0x7D50, 0x69CB, 0x5DE5, 0x5177, 0x7BB1))
$a11yHelper = Join-Path (Join-Path (Join-Path $root $toolboxDirName) 'tools') 'anchor-a11y-tag.js'
if (-not (Test-Path -LiteralPath $a11yHelper -PathType Leaf)) {
  throw "Missing anchor accessibility helper: $a11yHelper"
}
$a11yHelper = (Resolve-Path -LiteralPath $a11yHelper).Path

Push-Location $boltRoot
try {
  if (-not $SkipVerify) {
    npm run verify
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  # The tracked anchor/ mirror is published at different parent paths by
  # GitHub Pages and Vercel. Relative URLs keep one build portable in both.
  $env:ANCHOR_BASE_PATH = './'
  npm run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$resolvedRoot = (Resolve-Path -LiteralPath $root).Path
$resolvedDist = (Resolve-Path -LiteralPath $dist).Path
$resolvedAnchor = (Resolve-Path -LiteralPath $anchor).Path
if (-not $resolvedDist.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "dist path outside workspace: $resolvedDist"
}
if (-not $resolvedAnchor.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "anchor path outside workspace: $resolvedAnchor"
}

if (-not (Test-Path -LiteralPath (Join-Path $resolvedDist 'index.html') -PathType Leaf)) {
  throw "Missing built anchor index: $resolvedDist"
}

# Stage the complete mirror first: copy dist, restore the accessibility tag
# (idempotent), verify referenced assets and write the manifest. anchor/ is
# overwritten only after every fallible step succeeded, so a failure never
# leaves it half-synced with a missing tag or a stale manifest.
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('anchor-sync-' + [System.Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($staging) | Out-Null
try {
  Copy-Item -Path (Join-Path $resolvedDist '*') -Destination $staging -Recurse -Force
  $stagedIndex = Join-Path $staging 'index.html'

  node $a11yHelper $stagedIndex
  if ($LASTEXITCODE -ne 0) {
    throw "anchor accessibility helper failed with exit code $LASTEXITCODE; anchor/ was not modified"
  }

  $index = Get-Content -LiteralPath $stagedIndex -Raw -Encoding UTF8
  $referencedAssets = [regex]::Matches($index, '(?:\./)?assets/([^"''<>]+)') |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique
  foreach ($assetName in @($referencedAssets)) {
    if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $staging 'assets') $assetName) -PathType Leaf)) {
      throw "Built anchor index references a missing asset: $assetName; anchor/ was not modified"
    }
  }
  $manifest = [ordered]@{
    generatedAt = (Get-Date).ToString('s')
    basePath = './'
    sourceFingerprint = Get-AnchorSourceFingerprint -WorkspaceRoot $resolvedRoot
    sourceRoots = $anchorSourceRoots
    referencedAssets = @($referencedAssets)
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $staging 'deployment-manifest.json') -Encoding UTF8

  $assets = Join-Path $resolvedAnchor 'assets'
  if (Test-Path -LiteralPath $assets) {
    $resolvedAssets = (Resolve-Path -LiteralPath $assets).Path
    if (-not $resolvedAssets.StartsWith($resolvedAnchor, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "assets path outside anchor directory: $resolvedAssets"
    }
    Remove-Item -LiteralPath $resolvedAssets -Recurse -Force
  }

  Copy-Item -Path (Join-Path $staging '*') -Destination $resolvedAnchor -Recurse -Force
  if ((Get-FileSha256Text -Path $stagedIndex) -ne (Get-FileSha256Text -Path (Join-Path $resolvedAnchor 'index.html'))) {
    throw 'anchor/index.html does not match the staged index after mirroring'
  }
} finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$manifestPath = Join-Path $resolvedAnchor 'deployment-manifest.json'
Write-Output "Anchor deployment synced: $manifestPath"
