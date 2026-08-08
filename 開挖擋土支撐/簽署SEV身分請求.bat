@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign_receiver_request.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign_receiver_request.ps1" %*
)
if errorlevel 1 (
  echo.
  echo SEV identity signing failed.
  pause
  exit /b 1
)
echo.
echo SEV identity signature response created.
pause
