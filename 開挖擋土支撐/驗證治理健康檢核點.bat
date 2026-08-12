@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0verify_receiver_governance_checkpoint.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0verify_receiver_governance_checkpoint.ps1" %*
)
if errorlevel 1 (
  echo.
  echo Governance health checkpoint verification failed.
  pause
  exit /b 1
)
echo.
echo GCV governance checkpoint verification receipt created.
pause
