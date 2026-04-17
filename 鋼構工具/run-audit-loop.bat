@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0audit-tool.ps1" -Quiet -Loop -IntervalSeconds 60
if errorlevel 1 (
  echo.
  echo Audit loop stopped because an issue was detected.
  exit /b 1
)
echo.
echo Audit loop finished.
