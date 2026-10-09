param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$depsRoot = Join-Path $repoRoot 'output\playwright\phase2-quality-deps'
$packageFile = Join-Path $depsRoot 'package.json'
$lockFile = Join-Path $depsRoot 'package-lock.json'
$required = [ordered]@{
  'lighthouse' = '13.5.0'
  'playwright' = '1.63.0'
  '@axe-core/playwright' = '4.13.0'
  'terser' = '5.44.0'
}

New-Item -ItemType Directory -Path $depsRoot -Force | Out-Null
$npm = Get-Command npm.cmd -ErrorAction Stop
$installLog = Join-Path $depsRoot 'ensure-dependencies.log'
$startedAt = (Get-Date).ToString('o')
$mode = 'already-installed'

function Get-InstalledVersions {
  $versions = @{}
  foreach ($name in $required.Keys) {
    $packagePath = Join-Path (Join-Path $depsRoot 'node_modules') (Join-Path $name 'package.json')
    if (-not (Test-Path -LiteralPath $packagePath)) { return $null }
    $versions[$name] = (Get-Content -Raw -Encoding UTF8 $packagePath | ConvertFrom-Json).version
  }
  return $versions
}

$manifestMatches = $false
if (Test-Path -LiteralPath $packageFile) {
  $manifest = Get-Content -Raw -Encoding UTF8 $packageFile | ConvertFrom-Json
  $manifestMatches = $true
  foreach ($name in $required.Keys) {
    $dependency = $manifest.dependencies.PSObject.Properties[$name]
    if ($null -eq $dependency -or $dependency.Value -ne $required[$name]) { $manifestMatches = $false }
  }
}
$installed = Get-InstalledVersions
$installedMatches = $null -ne $installed
if ($installedMatches) {
  foreach ($name in $required.Keys) { if ($installed[$name] -ne $required[$name]) { $installedMatches = $false } }
}

if ($manifestMatches -and (Test-Path -LiteralPath $lockFile) -and $installedMatches) {
  $lockDependenciesJson = & node -e "const lock=require(process.argv[1]);process.stdout.write(JSON.stringify(lock.packages[''].dependencies))" $lockFile
  if ($LASTEXITCODE -ne 0) { throw "Could not read ignored dependency lock: $lockFile" }
  $lockDependencies = $lockDependenciesJson | ConvertFrom-Json
  foreach ($name in $required.Keys) {
    if ($lockDependencies.PSObject.Properties[$name].Value -ne $required[$name]) { throw "Ignored dependency lock does not pin $name $($required[$name]): $lockFile" }
  }
  $command = 'npm.cmd ci --prefix <ignored-output>/playwright/phase2-quality-deps --no-audit --no-fund (skipped; exact locked packages are already installed)'
  Set-Content -Encoding UTF8 $installLog "startedAt=$startedAt`nmode=$mode`ncommand=$command`nlockFile=$lockFile`n"
} else {
  if (-not $manifestMatches) {
    $manifest = [ordered]@{ name = 'phase2-quality-deps'; private = $true; version = '1.0.0'; dependencies = $required }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding Ascii $packageFile
  }
  if ((Test-Path -LiteralPath $lockFile) -and $manifestMatches) {
    $mode = 'npm-ci-from-ignored-lock'
    $arguments = @('ci', '--prefix', $depsRoot, '--no-audit', '--no-fund')
    $command = 'npm.cmd ci --prefix "' + $depsRoot + '" --no-audit --no-fund'
  } else {
    $mode = 'first-install-pinned-exact-versions'
    $packages = @($required.GetEnumerator() | ForEach-Object { "$($_.Key)@$($_.Value)" })
    $arguments = @('install', '--prefix', $depsRoot, '--save-exact') + $packages + @('--no-audit', '--no-fund')
    $command = 'npm.cmd install --prefix "' + $depsRoot + '" --save-exact ' + ($packages -join ' ') + ' --no-audit --no-fund'
  }
  $header = "startedAt=$startedAt`nmode=$mode`ncommand=$command`nlockFile=$lockFile`n"
  Set-Content -Encoding UTF8 $installLog $header
  & $npm.Source @arguments 2>&1 | Tee-Object -FilePath $installLog -Append
  if ($LASTEXITCODE -ne 0) { throw "npm dependency setup failed with exit code $LASTEXITCODE; see $installLog" }
}

$final = Get-InstalledVersions
foreach ($name in $required.Keys) {
  if ($null -eq $final -or $final[$name] -ne $required[$name]) { throw "Dependency setup did not produce the pinned $name $($required[$name])" }
}
if (-not (Test-Path -LiteralPath $lockFile)) { throw "npm did not create the ignored dependency lock: $lockFile" }
Write-Output "Homepage quality dependencies ready: Lighthouse 13.5.0, Playwright 1.63.0, axe-playwright 4.13.0, Terser 5.44.0"
Write-Output "Ignored package lock: $lockFile"
