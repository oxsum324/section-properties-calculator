@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -Quick -CI
if errorlevel 1 (
  echo.
  echo CI clean-checkout preflight failed.
  exit /b 1
)
echo.
echo CI clean-checkout preflight finished successfully.
