param(
  [switch]$SkipBuild,
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root "frontend"
$appDataDir = Join-Path $root "app_data"
$logDir = Join-Path $appDataDir "logs"
$pidDir = Join-Path $appDataDir "pids"
$frontendLog = Join-Path $logDir "html-mode-frontend.log"
$frontendErrLog = Join-Path $logDir "html-mode-frontend.err.log"
$frontendPidPath = Join-Path $pidDir "html-mode-frontend.pid"
$backendLog = Join-Path $logDir "html-mode-backend.log"
$backendErrLog = Join-Path $logDir "html-mode-backend.err.log"
$backendPidPath = Join-Path $pidDir "html-mode-backend.pid"
$python = "C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$url = "http://127.0.0.1:8000"
$frontendUrl = "http://127.0.0.1:5173"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
New-Item -ItemType Directory -Path $pidDir -Force | Out-Null

function Test-HealthEndpoint {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-FrontendEndpoint {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $frontendUrl -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-TrackedProcess($pidPath) {
  if (-not (Test-Path $pidPath)) {
    return
  }
  $trackedPid = Get-Content -Path $pidPath -Raw
  if ($trackedPid) {
    $existingProcess = Get-Process -Id ([int]$trackedPid) -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Stop-Process -Id $existingProcess.Id -Force
      Start-Sleep -Milliseconds 500
    }
  }
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $python)) {
  throw "Python runtime not found: $python"
}

$useFrontendDevServer = $false
if (-not $SkipBuild) {
  Push-Location $frontendDir
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Frontend build failed. Falling back to Vite dev proxy mode."
      $useFrontendDevServer = $true
    }
  } finally {
    Pop-Location
  }
}

if ($SkipBuild) {
  $useFrontendDevServer = $true
}

if (Test-HealthEndpoint) {
  Write-Host "HTML mode is already running: $url"
  if ($OpenBrowser) {
    Start-Process $url | Out-Null
  }
  exit 0
}

Stop-TrackedProcess $backendPidPath

if ($useFrontendDevServer) {
  if (-not (Test-FrontendEndpoint)) {
    Stop-TrackedProcess $frontendPidPath
    $frontendProcess = Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
      -WorkingDirectory $frontendDir `
      -RedirectStandardOutput $frontendLog `
      -RedirectStandardError $frontendErrLog `
      -PassThru `
      -WindowStyle Hidden
    Set-Content -Path $frontendPidPath -Value $frontendProcess.Id

    for ($index = 0; $index -lt 20; $index++) {
      Start-Sleep -Milliseconds 500
      if (Test-FrontendEndpoint) {
        break
      }
    }
  }

  if (-not (Test-FrontendEndpoint)) {
    if (Test-Path (Join-Path $frontendDir "dist\index.html")) {
      Write-Warning "Frontend dev proxy failed to start. Falling back to existing dist assets."
      $useFrontendDevServer = $false
    } else {
      throw "Frontend dev proxy failed to start. Check $frontendErrLog"
    }
  }
} else {
  Stop-TrackedProcess $frontendPidPath
}

$backendProcess = Start-Process `
  -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000") `
  -WorkingDirectory $root `
  -RedirectStandardOutput $backendLog `
  -RedirectStandardError $backendErrLog `
  -PassThru `
  -WindowStyle Hidden

Set-Content -Path $backendPidPath -Value $backendProcess.Id

for ($index = 0; $index -lt 20; $index++) {
  Start-Sleep -Milliseconds 500
  if (Test-HealthEndpoint) {
    if ($useFrontendDevServer) {
      Write-Host "HTML mode is ready via frontend dev proxy: $url"
    } else {
      Write-Host "HTML mode is ready: $url"
    }
    if ($OpenBrowser) {
      Start-Process $url | Out-Null
    }
    exit 0
  }
}

throw "HTML mode failed to start. Check $backendErrLog"
