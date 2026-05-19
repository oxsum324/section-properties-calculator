$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPidPath = Join-Path $root "app_data\pids\html-mode-frontend.pid"
$backendPidPath = Join-Path $root "app_data\pids\html-mode-backend.pid"

if (Test-Path $frontendPidPath) {
  $frontendPid = Get-Content -Path $frontendPidPath -Raw
  if ($frontendPid) {
    $process = Get-Process -Id ([int]$frontendPid) -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped HTML mode frontend: PID $frontendPid"
    }
  }
  Remove-Item -Path $frontendPidPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path $backendPidPath) {
  $backendPid = Get-Content -Path $backendPidPath -Raw
  if ($backendPid) {
    $process = Get-Process -Id ([int]$backendPid) -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped HTML mode backend: PID $backendPid"
    }
  }
  Remove-Item -Path $backendPidPath -Force -ErrorAction SilentlyContinue
}

$listeners = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}

$frontendListeners = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
foreach ($listener in $frontendListeners) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "HTML mode stopped."
