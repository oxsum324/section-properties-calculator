@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign_receiver_evidence_templates.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign_receiver_evidence_templates.ps1" %*
)
if errorlevel 1 (
  echo.
  echo Receiver evidence template package signing failed.
  pause
  exit /b 1
)
echo.
echo Organization-signed receiver evidence template package created.
pause
