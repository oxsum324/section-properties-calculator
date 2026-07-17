param(
  [int]$Port = 0,
  [switch]$KeepSite
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $RepoRoot) {
  $RepoRoot = (Get-Location).Path
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

$SmokeScript = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'pages-live-smoke.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)pages-live-smoke.js" } |
  Select-Object -First 1
if (-not $SmokeScript) {
  throw 'Could not find pages-live-smoke.js under the repository tools directories.'
}
$RouteBuilder = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'build-pages-clean-routes.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)build-pages-clean-routes.js" } |
  Select-Object -First 1
if (-not $RouteBuilder) {
  throw 'Could not find build-pages-clean-routes.js under the repository tools directory.'
}

$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) {
  throw 'python is required to serve the staged Pages artifact.'
}

$Stamp = Get-Date -Format 'yyyyMMddHHmmss'
$SiteRoot = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp"
New-Item -ItemType Directory -Path $SiteRoot | Out-Null

$ExcludeDirs = @(
  '.git',
  '.github',
  '.claude',
  '.codex',
  '_site',
  'output',
  'dev_tools',
  'tests',
  'node_modules',
  '.vite',
  '.playwright-cli',
  '.pytest_cache',
  '__pycache__',
  '.column-testdeps',
  '.foundation-testdeps',
  '.single-pile-testdeps',
  '.slab-testdeps',
  'app_data',
  'tmp',
  '_tmp'
)
$DynamicExcludeDirs = @()
$DynamicExcludeDirs += Get-ChildItem -LiteralPath $RepoRoot -Recurse -Directory -Filter 'bolt-review-tool' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).claude$([IO.Path]::DirectorySeparatorChar)*" } |
  Select-Object -ExpandProperty FullName
$DynamicExcludeDirs += Get-ChildItem -LiteralPath $RepoRoot -Recurse -Directory -Filter 'backend' -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).claude$([IO.Path]::DirectorySeparatorChar)*" -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'app/main.py'))
  } |
  Select-Object -ExpandProperty FullName
$DynamicExcludeDirs += Get-ChildItem -LiteralPath $RepoRoot -Recurse -Directory -Filter 'frontend' -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).claude$([IO.Path]::DirectorySeparatorChar)*" -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'src/App.tsx')) -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json'))
  } |
  Select-Object -ExpandProperty FullName
$ExcludeDirs += $DynamicExcludeDirs
$ExcludeFiles = @(
  'README.md',
  'STAGING_GROUPS.md',
  'TOOL_BOUNDARIES.md',
  'TOOL_REPORT_GUIDE.md',
  'pages-live-smoke.js',
  'build-pages-clean-routes.js',
  'attachment-package-check.js',
  'rendered-delivery-evidence.js',
  'rendered-delivery-evidence.inventory.json',
  '*.py',
  '*.pyc',
  '*.reg',
  '*.ts',
  '*.tsx',
  '*.tgz',
  'package.json',
  'package-lock.json',
  'requirements.txt',
  'vite.config.*',
  '*.ps1',
  '*.bat',
  '*.test.js',
  '*.contract.test.js',
  '*.md'
)

& robocopy $RepoRoot $SiteRoot /E /XD $ExcludeDirs /XF $ExcludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}
& node $RouteBuilder.FullName --site-root $SiteRoot --config (Join-Path $RepoRoot 'vercel.json')
if ($LASTEXITCODE -ne 0) {
  throw "build-pages-clean-routes.js failed with exit code $LASTEXITCODE"
}
New-Item -ItemType File -Path (Join-Path $SiteRoot '.nojekyll') -Force | Out-Null

if ($Port -le 0) {
  $Port = 48230 + (Get-Random -Maximum 500)
}
$BaseUrl = "http://127.0.0.1:$Port/"
$StdoutLog = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp.out.log"
$StderrLog = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp.err.log"
$Server = $null

try {
  $Server = Start-Process -FilePath $Python.Source `
    -ArgumentList @('-m', 'http.server', [string]$Port, '--bind', '127.0.0.1') `
    -WorkingDirectory $SiteRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 60; $Attempt += 1) {
    try {
      $Response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -eq 200) {
        $Ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $Ready) {
    throw "temporary Pages server did not become ready at $BaseUrl"
  }

  node $SmokeScript.FullName --base-url $BaseUrl --check-private-boundary
  if ($LASTEXITCODE -ne 0) {
    throw "pages-live-smoke.js failed with exit code $LASTEXITCODE"
  }
  Write-Host "Local Pages artifact smoke passed: $BaseUrl"
}
finally {
  if ($Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force
  }
  if (-not $KeepSite) {
    $ResolvedSite = (Resolve-Path $SiteRoot).Path
    $ResolvedTemp = (Resolve-Path ([IO.Path]::GetTempPath())).Path
    $Leaf = Split-Path $ResolvedSite -Leaf
    if ($ResolvedSite.StartsWith($ResolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and $Leaf.StartsWith('struct-tools-pages-artifact-', [StringComparison]::Ordinal)) {
      Remove-Item -LiteralPath $ResolvedSite -Recurse -Force
    }
  } else {
    Write-Host "Staged Pages artifact kept at: $SiteRoot"
  }
}
