param(
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
function Get-RelativePathText {
  param([string]$BasePath, [string]$FullPath)
  $baseResolved = (Resolve-Path -LiteralPath $BasePath).Path
  $fullResolved = (Resolve-Path -LiteralPath $FullPath).Path
  if (-not $baseResolved.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseResolved = $baseResolved + [System.IO.Path]::DirectorySeparatorChar
  }
  $baseUri = New-Object System.Uri($baseResolved)
  $fullUri = New-Object System.Uri($fullResolved)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fullUri).ToString()).Replace('\', '/')
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

$boltRoot = Get-ChildItem -LiteralPath $root -Directory |
  ForEach-Object { Join-Path $_.FullName 'bolt-review-tool' } |
  Where-Object { Test-Path -LiteralPath (Join-Path $_ 'src\App.tsx') } |
  Select-Object -First 1
if (-not $boltRoot) {
  throw "Missing bolt review app under workspace root: $root"
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

  $joined = ($records | Sort-Object) -join "`n"
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
$manifestPath = Join-Path $anchor 'deployment-manifest.json'

if (-not (Test-Path -LiteralPath $boltRoot)) {
  throw "Missing bolt review app: $boltRoot"
}
if (-not (Test-Path -LiteralPath $anchor)) {
  throw "Missing anchor deployment directory: $anchor"
}

Push-Location $boltRoot
try {
  if (-not $SkipVerify) {
    npm run verify
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  $env:ANCHOR_BASE_PATH = '/anchor/'
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

$assets = Join-Path $resolvedAnchor 'assets'
if (Test-Path -LiteralPath $assets) {
  $resolvedAssets = (Resolve-Path -LiteralPath $assets).Path
  if (-not $resolvedAssets.StartsWith($resolvedAnchor, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "assets path outside anchor directory: $resolvedAssets"
  }
  Remove-Item -LiteralPath $resolvedAssets -Recurse -Force
}

Copy-Item -Path (Join-Path $resolvedDist '*') -Destination $resolvedAnchor -Recurse -Force

$indexPath = Join-Path $resolvedAnchor 'index.html'
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$referencedAssets = [regex]::Matches($index, '/anchor/assets/([^"''<>]+)') |
  ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique
$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString('s')
  basePath = '/anchor/'
  sourceFingerprint = Get-AnchorSourceFingerprint -WorkspaceRoot $resolvedRoot
  sourceRoots = $anchorSourceRoots
  referencedAssets = @($referencedAssets)
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Output "Anchor deployment synced: $manifestPath"
