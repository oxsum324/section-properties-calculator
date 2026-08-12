@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_archive.ps1" -Mode Prepare %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0receiver_governance_archive.ps1" -Mode Prepare %*
)
if errorlevel 1 (
  echo.
  echo GAD external archive request preparation failed.
  pause
  exit /b 1
)
echo.
echo GAD external archive request package created.
pause
