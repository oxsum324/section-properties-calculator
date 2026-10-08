$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$driver = Join-Path $repoRoot 'tool-page-a11y.browser.test.js'
$ensure = Join-Path $repoRoot 'ensure-homepage-quality-deps.ps1'
$deps = Join-Path $repoRoot 'output\playwright\phase2-quality-deps\node_modules'
$required = @{
  'playwright' = '1.63.0'
  '@axe-core\playwright' = '4.13.0'
}

if (-not (Test-Path -LiteralPath $driver)) { throw "Missing browser test driver: $driver" }
if (-not (Test-Path -LiteralPath $ensure)) { throw "Missing dependency setup script: $ensure" }
& $ensure
foreach ($name in $required.Keys) {
  $packageFile = Join-Path $deps (Join-Path $name 'package.json')
  if (-not (Test-Path -LiteralPath $packageFile)) { throw "Missing preinstalled dependency: $packageFile" }
  $actual = (Get-Content -Raw -Encoding UTF8 $packageFile | ConvertFrom-Json).version
  if ($actual -ne $required[$name]) { throw "Expected $name $($required[$name]); found $actual" }
}

$driverArgs = @('--require-zero-violations') + $args
& node $driver @driverArgs
if ($LASTEXITCODE -ne 0) { throw "Tool page accessibility checks failed with exit code $LASTEXITCODE" }
