@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -Quick
if errorlevel 1 (
  echo.
  echo Quick tool preflight failed.
  exit /b 1
)
echo.
echo Quick tool preflight finished successfully.
