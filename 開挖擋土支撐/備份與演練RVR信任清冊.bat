@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup_receiver_trust_registry.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup_receiver_trust_registry.ps1" %*
)
if errorlevel 1 (
  echo.
  echo RVR trust registry backup or recovery drill failed.
  pause
  exit /b 1
)
echo.
echo RVR trust registry backup and isolated recovery drill completed.
pause
