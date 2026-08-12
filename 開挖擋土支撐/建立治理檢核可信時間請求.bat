@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_timestamp.ps1" -Mode Prepare %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_timestamp.ps1" -Mode Prepare %*
)
if errorlevel 1 (
  echo.
  echo GAM / GTS trusted timestamp request preparation failed.
  pause
  exit /b 1
)
echo.
echo GAM / GTS trusted timestamp request package created.
pause
