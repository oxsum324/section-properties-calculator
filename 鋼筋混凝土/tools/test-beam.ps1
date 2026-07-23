$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'beam-regression.test.js'
$visualTestFile = Join-Path $root 'beam-report-visual.test.js'
$evaluatorTestFile = Join-Path (Split-Path -Parent $root) 'shared\beam-evaluator.test.js'
$designerTestFile = Join-Path (Split-Path -Parent $root) 'shared\beam-rebar-designer.test.js'
$htmlFile = Join-Path $root 'beam.html'
$tmpJs = Join-Path $env:TEMP 'beam-check.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.beam-testdeps'

Write-Host "`n== Shared beam evaluator unit tests ==" -ForegroundColor Cyan
node $evaluatorTestFile
if ($LASTEXITCODE -ne 0) {
  throw "shared beam evaluator unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Shared beam rebar designer unit tests ==" -ForegroundColor Cyan
node $designerTestFile
if ($LASTEXITCODE -ne 0) {
  throw "shared beam rebar designer unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Beam regression tests ==" -ForegroundColor Cyan
node $testFile
if ($LASTEXITCODE -ne 0) {
  throw "beam regression tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Beam report visual smoke ==" -ForegroundColor Cyan
node $visualTestFile
if ($LASTEXITCODE -ne 0) {
  throw "beam report visual smoke failed with exit code $LASTEXITCODE"
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
