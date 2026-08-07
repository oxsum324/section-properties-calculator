@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_receiver_trust_backup_health.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_receiver_trust_backup_health.ps1" %*
)
if errorlevel 1 (
  echo.
  echo RVR backup health requires attention. Review RVR-backup-health-latest.json.
  pause
  exit /b 1
)
echo.
echo RVR backup and recovery-drill evidence is healthy.
pause
