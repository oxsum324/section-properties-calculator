param(
  [switch]$Quiet,
  [switch]$Quick
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $root "output\preflight"
$historyDir = Join-Path $outputDir "history"

if (-not (Test-Path $outputDir)) {
  New-Item -Path $outputDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $historyDir)) {
  New-Item -Path $historyDir -ItemType Directory | Out-Null
}

function Write-Status {
  param(
    [string]$Message,
    [string]$Color = "Gray",
    [switch]$Force
  )

  if ($Quiet -and -not $Force) {
    return
  }
  Write-Host $Message -ForegroundColor $Color
}

function Invoke-PreflightCheck {
  param(
    [string]$Key,
    [string]$Label,
    [string]$Workdir,
    [string]$Command,
    [string]$RunDir
  )

  $latestLog = Join-Path $outputDir "$Key.txt"
  $historyLog = Join-Path $RunDir "$Key.txt"
  $scriptPath = Join-Path $RunDir "$Key.ps1"
  $stdoutPath = Join-Path $RunDir "$Key.stdout.txt"
  $stderrPath = Join-Path $RunDir "$Key.stderr.txt"

  if (-not (Test-Path $Workdir)) {
    $message = "Workdir not found: $Workdir"
    Set-Content -Path $latestLog -Value $message -Encoding UTF8
    Set-Content -Path $historyLog -Value $message -Encoding UTF8
    return [pscustomobject]@{
      key = $Key
      label = $Label
      pass = $false
      exitCode = 404
      seconds = 0
      log = $latestLog
    }
  }

  Write-Status "=== $Label ===" "Cyan"
  Set-Content -Path $scriptPath -Value $Command -Encoding Unicode
  $startedAt = Get-Date
  $proc = Start-Process -FilePath powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $scriptPath
  ) -WorkingDirectory $Workdir -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -Wait -WindowStyle Hidden
  $seconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)

  $stdout = if (Test-Path $stdoutPath) { Get-Content -Path $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath -Raw } else { "" }
  $output = @($stdout, $stderr) -join [Environment]::NewLine
  Set-Content -Path $latestLog -Value $output -Encoding UTF8
  Set-Content -Path $historyLog -Value $output -Encoding UTF8

  return [pscustomobject]@{
    key = $Key
    label = $Label
    pass = ($proc.ExitCode -eq 0)
    exitCode = $proc.ExitCode
    seconds = $seconds
    log = $latestLog
  }
}

$auditAll = Join-Path $root "audit-all.ps1"

$windPathCommand = @'
$bad = Get-ChildItem -LiteralPath '結構工具箱\tools\風力' -Filter '*.html' | Where-Object {
  $html = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
  $html -match '鋼筋混凝土/shared/report\.js' -and $html -notmatch '\.\./\.\./\.\./鋼筋混凝土/shared/report\.js'
}
if ($bad) {
  $bad | ForEach-Object { Write-Error "bad wind report path: $($_.FullName)" }
  exit 1
}
Write-Output 'wind report paths OK'
exit 0
'@

$anchorRouteCommand = @'
$indexPath = 'anchor\index.html'
$workerPath = 'anchor\service-worker.js'
if (-not (Test-Path -LiteralPath $indexPath)) { Write-Error "missing $indexPath"; exit 1 }
if (-not (Test-Path -LiteralPath $workerPath)) { Write-Error "missing $workerPath"; exit 1 }
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$worker = Get-Content -LiteralPath $workerPath -Raw -Encoding UTF8
if ($index -notmatch '/anchor/assets/index-[^"]+\.js') { Write-Error 'anchor index does not point at /anchor/assets/index-*.js'; exit 1 }
if ($worker -notmatch "BASE_PATH\s*=\s*'/anchor/'") { Write-Error 'anchor service worker BASE_PATH is not /anchor/'; exit 1 }
$assetNames = [regex]::Matches($index, '/anchor/assets/([^"]+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
foreach ($name in $assetNames) {
  $assetPath = Join-Path 'anchor\assets' $name
  if (-not (Test-Path -LiteralPath $assetPath)) {
    Write-Error "missing referenced anchor asset: $assetPath"
    exit 1
  }
}
Write-Output "anchor route assets OK ($($assetNames.Count) referenced assets)"
exit 0
'@

$frameStaticCommand = @'
$htmlPath = '鋼架\平面剛架分析.html'
if (-not (Test-Path -LiteralPath $htmlPath)) { Write-Error "missing $htmlPath"; exit 1 }
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$needles = @(
  '<title>平面剛架分析',
  'function solveLinear',
  'function analyze',
  'id="geomCanvas"',
  'id="momCanvas"',
  'id="dispTbl"'
)
foreach ($needle in $needles) {
  if ($html -notlike "*$needle*") {
    Write-Error "frame analysis static smoke missing: $needle"
    exit 1
  }
}
Write-Output 'frame analysis static smoke OK'
exit 0
'@

$foundationLocalCommand = @'
$htmlPath = '結構工具箱\tools\foundation\foundation-local.html'
$exportPath = '結構工具箱\tools\local-quick-export.js'
$corePath = '結構工具箱\tools\foundation\foundation-local-core.js'
$testPath = '結構工具箱\tools\foundation\foundation-local-core.test.js'
$goldenPath = '結構工具箱\tools\foundation\foundation-local-golden-cases.js'
if (-not (Test-Path -LiteralPath $htmlPath)) { Write-Error "missing $htmlPath"; exit 1 }
if (-not (Test-Path -LiteralPath $exportPath)) { Write-Error "missing $exportPath"; exit 1 }
if (-not (Test-Path -LiteralPath $corePath)) { Write-Error "missing $corePath"; exit 1 }
if (-not (Test-Path -LiteralPath $testPath)) { Write-Error "missing $testPath"; exit 1 }
if (-not (Test-Path -LiteralPath $goldenPath)) { Write-Error "missing $goldenPath"; exit 1 }
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$core = Get-Content -LiteralPath $corePath -Raw -Encoding UTF8
$needles = @(
  'foundation-local-smoke',
  '<title>基礎局部檢核 V0.1</title>',
  'function calculateFoundationLocal',
  '../local-quick-export.js',
  'foundation-local-core.js',
  'id="btnCalc"',
  'id="btnJson"',
  'id="metricGrid"',
  'id="checkList"',
  'id="coreVersion"',
  '工具與責任邊界',
  'function downloadResultJson',
  'LocalQuickExport',
  'FoundationLocalCore',
  '計算指紋',
  '基礎局部檢核'
)
foreach ($needle in $needles) {
  if ($html -notlike "*$needle*") {
    Write-Error "foundation local static smoke missing: $needle"
    exit 1
  }
}
$coreNeedles = @(
  'FoundationLocalCore',
  'function calculate',
  'function validateInput',
  'module.exports'
)
foreach ($needle in $coreNeedles) {
  if ($core -notlike "*$needle*") {
    Write-Error "foundation local core smoke missing: $needle"
    exit 1
  }
}
node $testPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'foundation local static and regression smoke OK'
exit 0
'@

$equipmentLoadCommand = @'
$htmlPath = '結構工具箱\tools\equipment\equipment-load.html'
$exportPath = '結構工具箱\tools\local-quick-export.js'
$corePath = '結構工具箱\tools\equipment\equipment-load-core.js'
$testPath = '結構工具箱\tools\equipment\equipment-load-core.test.js'
$goldenPath = '結構工具箱\tools\equipment\equipment-load-golden-cases.js'
if (-not (Test-Path -LiteralPath $htmlPath)) { Write-Error "missing $htmlPath"; exit 1 }
if (-not (Test-Path -LiteralPath $exportPath)) { Write-Error "missing $exportPath"; exit 1 }
if (-not (Test-Path -LiteralPath $corePath)) { Write-Error "missing $corePath"; exit 1 }
if (-not (Test-Path -LiteralPath $testPath)) { Write-Error "missing $testPath"; exit 1 }
if (-not (Test-Path -LiteralPath $goldenPath)) { Write-Error "missing $goldenPath"; exit 1 }
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$core = Get-Content -LiteralPath $corePath -Raw -Encoding UTF8
$needles = @(
  'equipment-load-smoke',
  '<title>設備局部荷重 V0.1</title>',
  'function calculateEquipmentLoad',
  '../local-quick-export.js',
  'equipment-load-core.js',
  'id="btnCalc"',
  'id="btnJson"',
  'id="metricGrid"',
  'id="checkList"',
  'id="coreVersion"',
  '工具與責任邊界',
  'function downloadResultJson',
  'LocalQuickExport',
  'EquipmentLoadCore',
  '計算指紋',
  '設備局部荷重'
)
foreach ($needle in $needles) {
  if ($html -notlike "*$needle*") {
    Write-Error "equipment load static smoke missing: $needle"
    exit 1
  }
}
$coreNeedles = @(
  'EquipmentLoadCore',
  'function calculate',
  'function validateInput',
  'module.exports'
)
foreach ($needle in $coreNeedles) {
  if ($core -notlike "*$needle*") {
    Write-Error "equipment load core smoke missing: $needle"
    exit 1
  }
}
node $testPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'equipment load static and regression smoke OK'
exit 0
'@

$earthPressureCommand = @'
$htmlPath = '結構工具箱\tools\earth\earth-pressure.html'
$exportPath = '結構工具箱\tools\local-quick-export.js'
$corePath = '結構工具箱\tools\earth\earth-pressure-core.js'
$testPath = '結構工具箱\tools\earth\earth-pressure-core.test.js'
$goldenPath = '結構工具箱\tools\earth\earth-pressure-golden-cases.js'
if (-not (Test-Path -LiteralPath $htmlPath)) { Write-Error "missing $htmlPath"; exit 1 }
if (-not (Test-Path -LiteralPath $exportPath)) { Write-Error "missing $exportPath"; exit 1 }
if (-not (Test-Path -LiteralPath $corePath)) { Write-Error "missing $corePath"; exit 1 }
if (-not (Test-Path -LiteralPath $testPath)) { Write-Error "missing $testPath"; exit 1 }
if (-not (Test-Path -LiteralPath $goldenPath)) { Write-Error "missing $goldenPath"; exit 1 }
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$core = Get-Content -LiteralPath $corePath -Raw -Encoding UTF8
$needles = @(
  'earth-pressure-smoke',
  '<title>擋土土壓局部快算 V0.1</title>',
  'function calculateEarthPressure',
  '../local-quick-export.js',
  'earth-pressure-core.js',
  'id="btnCalc"',
  'id="btnJson"',
  'id="metricGrid"',
  'id="checkList"',
  'id="coreVersion"',
  '工具與責任邊界',
  'function downloadResultJson',
  'LocalQuickExport',
  'EarthPressureCore',
  '計算指紋',
  '擋土土壓局部快算'
)
foreach ($needle in $needles) {
  if ($html -notlike "*$needle*") {
    Write-Error "earth pressure static smoke missing: $needle"
    exit 1
  }
}
$coreNeedles = @(
  'EarthPressureCore',
  'function calculate',
  'function validateInput',
  'module.exports'
)
foreach ($needle in $coreNeedles) {
  if ($core -notlike "*$needle*") {
    Write-Error "earth pressure core smoke missing: $needle"
    exit 1
  }
}
node $testPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'earth pressure static and regression smoke OK'
exit 0
'@

$localQuickToolsContractCommand = @'
$testPath = '結構工具箱\tools\local-quick-tools.contract.test.js'
if (-not (Test-Path -LiteralPath $testPath)) {
  Write-Error "missing $testPath"
  exit 1
}
node $testPath
exit $LASTEXITCODE
'@

$excavationLauncherCommand = @'
$launcherPath = '開挖擋土支撐\index.html'
$readmePath = '開挖擋土支撐\README.md'
$startPath = '開挖擋土支撐\start_html_mode.ps1'
$stopPath = '開挖擋土支撐\stop_html_mode.ps1'
foreach ($path in @($launcherPath, $readmePath, $startPath, $stopPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Error "missing excavation service file: $path"
    exit 1
  }
}
$launcher = Get-Content -LiteralPath $launcherPath -Raw -Encoding UTF8
$startScript = Get-Content -LiteralPath $startPath -Raw -Encoding UTF8
$stopScript = Get-Content -LiteralPath $stopPath -Raw -Encoding UTF8
$launcherNeedles = @(
  '本機服務工具',
  'start_html_mode.ps1 -OpenBrowser',
  'stop_html_mode.ps1',
  '/api/health',
  'app_data/',
  '服務邊界',
  '不可直接當靜態部署'
)
foreach ($needle in $launcherNeedles) {
  if ($launcher -notlike "*$needle*") {
    Write-Error "excavation launcher smoke missing: $needle"
    exit 1
  }
}
$startNeedles = @('Test-HealthEndpoint', 'uvicorn', '--port', '8000', 'html-mode-backend.pid')
foreach ($needle in $startNeedles) {
  if ($startScript -notlike "*$needle*") {
    Write-Error "excavation start script smoke missing: $needle"
    exit 1
  }
}
$stopNeedles = @('html-mode-backend.pid', 'LocalPort 8000', 'LocalPort 5173', 'HTML mode stopped')
foreach ($needle in $stopNeedles) {
  if ($stopScript -notlike "*$needle*") {
    Write-Error "excavation stop script smoke missing: $needle"
    exit 1
  }
}
Write-Output 'excavation launcher and service-boundary smoke OK'
exit 0
'@

$stoneQuickCommand = @'
$tests = @(
  'regression-smoke',
  'formula-registry-smoke',
  'review-dashboard-smoke',
  'version-sync-smoke',
  'input-schema-smoke',
  'code-profiles-registry-smoke'
)
foreach ($test in $tests) {
  Write-Output "node js\$test.test.js"
  node "js\$test.test.js"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'node tests\syntax_check.js'
node 'tests\syntax_check.js'
exit $LASTEXITCODE
'@

$deckReportCommand = @'
python -m py_compile dump_xls.py report\gen_report.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sample = 'test-fixtures\report-smoke.json'
if (-not (Test-Path -LiteralPath $sample)) {
  Write-Error "missing cover slab report smoke fixture: $sample"
  exit 1
}

$outDir = '..\output\preflight'
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -Path $outDir -ItemType Directory | Out-Null
}

$out = Join-Path $outDir 'cover-slab-report-smoke.docx'
$env:COVER_SLAB_NO_OPEN = '1'
python report\gen_report.py $sample $out
$code = $LASTEXITCODE
Remove-Item Env:\COVER_SLAB_NO_OPEN -ErrorAction SilentlyContinue
if ($code -ne 0) { exit $code }
if (-not (Test-Path -LiteralPath $out)) {
  Write-Error "missing cover slab smoke report: $out"
  exit 1
}

Write-Output "cover slab report smoke OK: $out"
exit 0
'@

$checks = @(
  [pscustomobject]@{
    key = "platform-audit"
    label = "Platform audit (steel, RC, core)"
    workdir = $root
    command = "& '$auditAll' -Quiet"
    slow = $true
  },
  [pscustomobject]@{
    key = "wind-report-paths"
    label = "Wind shared report path preflight"
    workdir = $root
    command = $windPathCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "continuous-beam"
    label = "Continuous beam regression"
    workdir = $root
    command = "& '.\test-continuous-beam.ps1'"
    slow = $false
  },
  [pscustomobject]@{
    key = "anchor-verify"
    label = "Anchor bolt review verify"
    workdir = (Join-Path $root "螺栓檢討\bolt-review-tool")
    command = 'npm run verify'
    slow = $true
  },
  [pscustomobject]@{
    key = "anchor-route"
    label = "Anchor deployment route preflight"
    workdir = $root
    command = $anchorRouteCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-self-check"
    label = "Stone fixing env and self check"
    workdir = (Join-Path $root "石材固定")
    command = 'python env_check.py; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; python self_check.py; exit $LASTEXITCODE'
    slow = $false
  },
  [pscustomobject]@{
    key = "stone-quick-check"
    label = "Stone fixing quick smoke tests"
    workdir = (Join-Path $root "石材固定")
    command = $stoneQuickCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-launcher"
    label = "Excavation launcher service-boundary smoke"
    workdir = $root
    command = $excavationLauncherCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-backend"
    label = "Excavation support backend tests"
    workdir = (Join-Path $root "開挖擋土支撐")
    command = 'python -m unittest discover -s backend\tests'
    slow = $false
  },
  [pscustomobject]@{
    key = "excavation-frontend"
    label = "Excavation support frontend build"
    workdir = (Join-Path $root "開挖擋土支撐\frontend")
    command = 'npm run build'
    slow = $true
  },
  [pscustomobject]@{
    key = "deck-python"
    label = "Cover slab report smoke"
    workdir = (Join-Path $root "覆工板")
    command = $deckReportCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "frame-static"
    label = "Frame analysis static smoke"
    workdir = $root
    command = $frameStaticCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "local-quick-tools-contract"
    label = "Local quick tools contract"
    workdir = $root
    command = $localQuickToolsContractCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "foundation-local-static"
    label = "Foundation local static smoke"
    workdir = $root
    command = $foundationLocalCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "equipment-load-static"
    label = "Equipment load static smoke"
    workdir = $root
    command = $equipmentLoadCommand
    slow = $false
  },
  [pscustomobject]@{
    key = "earth-pressure-static"
    label = "Earth pressure static smoke"
    workdir = $root
    command = $earthPressureCommand
    slow = $false
  }
)

if ($Quick) {
  $checks = @($checks | Where-Object { -not $_.slow })
}

$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $historyDir $runStamp
New-Item -Path $runDir -ItemType Directory -Force | Out-Null

$records = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$summaryLines = New-Object System.Collections.Generic.List[string]

foreach ($check in $checks) {
  $record = Invoke-PreflightCheck -Key $check.key -Label $check.label -Workdir $check.workdir -Command $check.command -RunDir $runDir
  $records.Add($record)
  $summaryLines.Add("- $($record.label): pass=$($record.pass), exitCode=$($record.exitCode), seconds=$($record.seconds), log=$($record.log)")
  if (-not $record.pass) {
    $failures.Add("$($record.key): exitCode=$($record.exitCode), log=$($record.log)")
  }
}

$overallPass = ($failures.Count -eq 0)
$summaryPath = Join-Path $outputDir "preflight-summary.md"
$summaryJsonPath = Join-Path $outputDir "preflight-summary.json"
$historySummaryPath = Join-Path $runDir "preflight-summary.md"
$historySummaryJsonPath = Join-Path $runDir "preflight-summary.json"

$summaryContent = @(
  "# Tool Preflight Summary"
  ""
  "- generatedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  "- root: $root"
  "- runId: $runStamp"
  "- quick: $([bool]$Quick)"
  "- pass: $overallPass"
  ""
  $summaryLines
)

Set-Content -Path $summaryPath -Value $summaryContent -Encoding UTF8
Set-Content -Path $historySummaryPath -Value $summaryContent -Encoding UTF8

$payload = [ordered]@{
  generatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  root = $root
  runId = $runStamp
  quick = [bool]$Quick
  pass = $overallPass
  failureCount = $failures.Count
  failures = @($failures.ToArray())
  records = @($records.ToArray())
}
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryJsonPath -Encoding UTF8
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $historySummaryJsonPath -Encoding UTF8

if ($overallPass) {
  Write-Status "Tool preflight completed cleanly. runId=$runStamp" "Green" -Force
  Write-Status "Summary: $summaryPath" "DarkGreen" -Force
  exit 0
}

Write-Status "Tool preflight found issues. runId=$runStamp" "Red" -Force
Write-Status ("Failures: " + ($failures -join "; ")) "Red" -Force
Write-Status "Summary: $summaryPath" "DarkRed" -Force
exit 1
