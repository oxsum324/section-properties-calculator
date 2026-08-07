@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage_receiver_key.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage_receiver_key.ps1" %*
)
if errorlevel 1 (
  echo.
  echo RVR organization key creation failed.
  pause
  exit /b 1
)
echo.
echo RVR organization key package created.
pause
