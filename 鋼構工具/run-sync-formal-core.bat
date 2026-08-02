@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-formal-core.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-formal-core.ps1" %*
)
if errorlevel 1 (
  echo.
  echo Formal core sync failed.
  exit /b 1
)
echo.
echo Formal core sync finished successfully.
