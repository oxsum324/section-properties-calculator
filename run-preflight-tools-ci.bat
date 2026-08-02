@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -Quick -CI
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -Quick -CI
)
if errorlevel 1 (
  echo.
  echo CI clean-checkout preflight failed.
  exit /b 1
)
echo.
echo CI clean-checkout preflight finished successfully.
