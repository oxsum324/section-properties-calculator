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
$BrowserSmokeScript = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'pages-live-browser-smoke.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)pages-live-browser-smoke.js" } |
  Select-Object -First 1
if (-not $BrowserSmokeScript) {
  throw 'Could not find pages-live-browser-smoke.js under the repository tools directories.'
}
$ArtifactBuilder = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'build-pages-artifact.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)build-pages-artifact.js" } |
  Select-Object -First 1
if (-not $ArtifactBuilder) {
  throw 'Could not find build-pages-artifact.js under the repository tools directory.'
}
$RouteBuilder = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'build-pages-clean-routes.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)build-pages-clean-routes.js" } |
  Select-Object -First 1
if (-not $RouteBuilder) {
  throw 'Could not find build-pages-clean-routes.js under the repository tools directory.'
}
$DeploymentManifestBuilder = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'build-pages-deployment-manifest.js' |
  Where-Object { $_.FullName -like "*$([IO.Path]::DirectorySeparatorChar)tools$([IO.Path]::DirectorySeparatorChar)build-pages-deployment-manifest.js" } |
  Select-Object -First 1
if (-not $DeploymentManifestBuilder) {
  throw 'Could not find build-pages-deployment-manifest.js under the repository tools directory.'
}

$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) {
  throw 'python is required to serve the staged Pages artifact.'
}
$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Node) {
  $Node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $Node) {
  throw 'node is required to run the staged Pages browser smoke.'
}
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $Npm) {
  $Npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $Npm) {
  throw 'npm is required to install the pinned Pages smoke runtime.'
}
$PagesSmokeRuntime = Join-Path $RepoRoot '.github\pages-smoke'
$PagesSmokeRuntimeManifest = Join-Path $PagesSmokeRuntime 'package.json'
$PlaywrightManifest = Join-Path $PagesSmokeRuntime 'node_modules\@playwright\cli\package.json'
$PlaywrightCli = Join-Path $PagesSmokeRuntime 'node_modules\@playwright\cli\playwright-cli.js'
$TerserManifest = Join-Path $PagesSmokeRuntime 'node_modules\terser\package.json'
$TerserCli = Join-Path $PagesSmokeRuntime 'node_modules\terser\bin\terser'

& $Npm.Source ci --ignore-scripts --no-audit --no-fund --prefix $PagesSmokeRuntime
if ($LASTEXITCODE -ne 0) {
  throw "Pinned Pages smoke runtime installation failed with exit code $LASTEXITCODE"
}
$ExpectedRuntime = Get-Content -Raw -LiteralPath $PagesSmokeRuntimeManifest | ConvertFrom-Json
$InstalledPlaywright = Get-Content -Raw -LiteralPath $PlaywrightManifest | ConvertFrom-Json
$InstalledTerser = Get-Content -Raw -LiteralPath $TerserManifest | ConvertFrom-Json
if ($ExpectedRuntime.dependencies.'@playwright/cli' -ne $InstalledPlaywright.version) {
  throw "Pages smoke Playwright version mismatch: expected $($ExpectedRuntime.dependencies.'@playwright/cli'), installed $($InstalledPlaywright.version)"
}
if ($ExpectedRuntime.dependencies.terser -ne $InstalledTerser.version) {
  throw "Pages smoke Terser version mismatch: expected $($ExpectedRuntime.dependencies.terser), installed $($InstalledTerser.version)"
}

$Stamp = Get-Date -Format 'yyyyMMddHHmmss'
$SiteRoot = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp"

& node $ArtifactBuilder.FullName --repo-root $RepoRoot --site-root $SiteRoot
if ($LASTEXITCODE -ne 0) {
  throw "build-pages-artifact.js failed with exit code $LASTEXITCODE"
}
& node $RouteBuilder.FullName --site-root $SiteRoot --config (Join-Path $RepoRoot 'vercel.json')
if ($LASTEXITCODE -ne 0) {
  throw "build-pages-clean-routes.js failed with exit code $LASTEXITCODE"
}
New-Item -ItemType File -Path (Join-Path $SiteRoot '.nojekyll') -Force | Out-Null
$CommitSha = ((& git -C $RepoRoot rev-parse HEAD) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $CommitSha -notmatch '^[0-9a-f]{40}$') {
  throw 'Could not resolve the repository HEAD commit for the Pages deployment manifest.'
}
$SourceDirty = -not [string]::IsNullOrWhiteSpace(((& git -C $RepoRoot status --porcelain --untracked-files=all) | Out-String).Trim())
$LocalRunId = "local-$Stamp"
& node $DeploymentManifestBuilder.FullName `
  --site-root $SiteRoot `
  --commit-sha $CommitSha `
  --source-ref 'local-artifact' `
  --source-dirty $SourceDirty.ToString().ToLowerInvariant() `
  --run-id $LocalRunId `
  --run-attempt '1'
if ($LASTEXITCODE -ne 0) {
  throw "build-pages-deployment-manifest.js failed with exit code $LASTEXITCODE"
}

if ($Port -le 0) {
  $Port = 48230 + (Get-Random -Maximum 500)
}
$BaseUrl = "http://127.0.0.1:$Port/"
$StdoutLog = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp.out.log"
$StderrLog = Join-Path ([IO.Path]::GetTempPath()) "struct-tools-pages-artifact-$Stamp.err.log"
$Server = $null
$BrowserSession = "pages-artifact-browser-$Stamp"
$BrowserOpened = $false

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

  node $SmokeScript.FullName `
    --base-url $BaseUrl `
    --check-private-boundary `
    --expected-commit-sha $CommitSha `
    --expected-run-id $LocalRunId
  if ($LASTEXITCODE -ne 0) {
    throw "pages-live-smoke.js failed with exit code $LASTEXITCODE"
  }

  $OpenRaw = (& $Node.Source $PlaywrightCli --json "-s=$BrowserSession" open $BaseUrl | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "Playwright CLI open failed with exit code $LASTEXITCODE"
  }
  $OpenResult = $OpenRaw | ConvertFrom-Json
  if ($OpenResult.isError) {
    throw "Playwright CLI open failed: $($OpenResult.error)"
  }
  $BrowserOpened = $true

  $BrowserCode = ((& $Node.Source $TerserCli $BrowserSmokeScript.FullName --compress 'side_effects=false' --mangle --format 'ascii_only=true') -join "`n").TrimEnd().TrimEnd(';')
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($BrowserCode)) {
    throw "pages-live-browser-smoke.js minification failed with exit code $LASTEXITCODE"
  }
  $BrowserCodeBytes = [Text.Encoding]::ASCII.GetBytes($BrowserCode)
  $CompressedCodeStream = New-Object IO.MemoryStream
  try {
    $GzipStream = New-Object IO.Compression.GZipStream($CompressedCodeStream, [IO.Compression.CompressionMode]::Compress, $true)
    try {
      $GzipStream.Write($BrowserCodeBytes, 0, $BrowserCodeBytes.Length)
    } finally {
      $GzipStream.Dispose()
    }
    $BrowserCodeBase64 = [Convert]::ToBase64String($CompressedCodeStream.ToArray())
  } finally {
    $CompressedCodeStream.Dispose()
  }
  $BrowserBootstrap = "async function(page){let c=await page.evaluate(async s=>{let a=Uint8Array.from(atob(s),c=>c.charCodeAt(0)),r=new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip')));return r.text()},'$BrowserCodeBase64');return await(eval(c))(page)}"
  if ($BrowserBootstrap.Length -ge 7500) {
    throw "pages-live-browser-smoke.js Windows bootstrap is too long: $($BrowserBootstrap.Length) characters"
  }
  $BrowserRaw = (& $Node.Source $PlaywrightCli --json "-s=$BrowserSession" run-code $BrowserBootstrap | Out-String)
  $BrowserExitCode = $LASTEXITCODE
  if ($BrowserExitCode -ne 0) {
    throw "Playwright CLI browser smoke failed with exit code $BrowserExitCode`n$($BrowserRaw.Trim())"
  }
  $BrowserResult = $BrowserRaw | ConvertFrom-Json
  if ($BrowserResult.isError) {
    throw "pages-live-browser-smoke.js failed: $($BrowserResult.error)"
  }
  Write-Host "Pages browser smoke passed: $($BrowserResult.result)"
  Write-Host "Local Pages artifact smoke passed: $BaseUrl"
}
finally {
  if ($BrowserOpened) {
    & $Node.Source $PlaywrightCli "-s=$BrowserSession" close 2>$null | Out-Null
  }
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
