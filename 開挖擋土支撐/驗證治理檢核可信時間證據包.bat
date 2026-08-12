@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_timestamp.ps1" -Mode Verify %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_timestamp.ps1" -Mode Verify %*
)
if errorlevel 1 (
  echo.
  echo GTV trusted timestamp package verification failed.
  pause
  exit /b 1
)
echo.
echo GTV trusted timestamp evidence package verified.
pause
