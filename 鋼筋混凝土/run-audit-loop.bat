@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit-tool.ps1" -Quiet -Loop -IntervalSeconds 60
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit-tool.ps1" -Quiet -Loop -IntervalSeconds 60
)
if errorlevel 1 (
  echo.
  echo RC audit loop stopped because an issue was detected.
  exit /b 1
)
echo.
echo RC audit loop finished.
