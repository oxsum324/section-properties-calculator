$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$testFile = Join-Path $root 'beam-regression.test.js'
$visualTestFile = Join-Path $root 'beam-report-visual.test.js'
$flexureTestFile = Join-Path (Split-Path -Parent $root) 'shared\flexure.test.js'
$applicabilityTestFile = Join-Path (Split-Path -Parent $root) 'shared\beam-applicability.test.js'
$deepBeamStmUnitTestFile = Join-Path (Split-Path -Parent $root) 'shared\deep-beam-stm.test.js'
$deepBeamStmBrowserTestFile = Join-Path $root 'deep-beam-stm-regression.test.js'
$evaluatorTestFile = Join-Path (Split-Path -Parent $root) 'shared\beam-evaluator.test.js'
$designerTestFile = Join-Path (Split-Path -Parent $root) 'shared\beam-rebar-designer.test.js'
$htmlFile = Join-Path $root 'beam.html'
$tmpJs = Join-Path $env:TEMP 'beam-check.js'
$playwrightDepsScript = Join-Path $root 'ensure-playwright-deps.ps1'
. $playwrightDepsScript -Root $root -PreferredDirName '.beam-testdeps'

Write-Host "`n== Shared flexure unit tests ==" -ForegroundColor Cyan
node $flexureTestFile
if ($LASTEXITCODE -ne 0) {
  throw "shared flexure unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Shared beam applicability unit tests ==" -ForegroundColor Cyan
node $applicabilityTestFile
if ($LASTEXITCODE -ne 0) {
  throw "shared beam applicability unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n== Deep beam STM unit tests ==" -ForegroundColor Cyan
node $deepBeamStmUnitTestFile
if ($LASTEXITCODE -ne 0) {
  throw "deep beam STM unit tests failed with exit code $LASTEXITCODE"
}

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

Write-Host "`n== Deep beam STM browser and PDF regression ==" -ForegroundColor Cyan
node $deepBeamStmBrowserTestFile
if ($LASTEXITCODE -ne 0) {
  throw "deep beam STM browser regression failed with exit code $LASTEXITCODE"
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
