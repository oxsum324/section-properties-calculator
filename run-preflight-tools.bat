@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet
if errorlevel 1 (
  echo.
  echo Tool preflight failed.
  exit /b 1
)
echo.
echo Tool preflight finished successfully.
