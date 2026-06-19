$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'beam-regression.test.js'
$htmlFile = Join-Path $root 'beam.html'
$tmpJs = Join-Path $env:TEMP 'beam-check.js'
$depRoot = Join-Path $root '.beam-testdeps'
$fallbackDeps = @(
  (Join-Path $root '.beam-testdeps'),
  (Join-Path $root '.column-testdeps'),
  (Join-Path $root '.foundation-testdeps'),
  (Join-Path $root '.slab-testdeps'),
  (Join-Path $root '.single-pile-testdeps')
)

Write-Host '== Ensure Playwright dependency ==' -ForegroundColor Cyan
$playwrightRoot = $fallbackDeps | Where-Object { Test-Path (Join-Path $_ 'node_modules\playwright') } | Select-Object -First 1
if (-not $playwrightRoot) {
  if (!(Test-Path $depRoot)) {
    New-Item -ItemType Directory -Path $depRoot | Out-Null
  }
  npm init -y --prefix $depRoot | Out-Null
  npm install --prefix $depRoot playwright --silent
  $playwrightRoot = $depRoot
}
$env:NODE_PATH = Join-Path $playwrightRoot 'node_modules'
Write-Host "Using Playwright deps: $playwrightRoot" -ForegroundColor DarkGray

Write-Host "`n== Beam regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "beam regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Beam syntax check ==" -ForegroundColor Cyan
$html = Get-Content $htmlFile -Raw
$matches = [regex]::Matches($html, '<script[^>]*>([\s\S]*?)</script>')
if ($matches.Count -eq 0) {
  throw 'script block not found in beam.html'
}
$js = $matches[$matches.Count - 1].Groups[1].Value
Set-Content -Path $tmpJs -Value $js -Encoding UTF8
node --check $tmpJs
if ($LASTEXITCODE -ne 0) {
  throw "beam syntax check failed with exit code $LASTEXITCODE"
}

Write-Host "`nBeam checks completed successfully." -ForegroundColor Green
