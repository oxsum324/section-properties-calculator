@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0sync-formal-core.ps1" %*
if errorlevel 1 (
  echo.
  echo Formal core sync failed.
  exit /b 1
)
echo.
echo Formal core sync finished successfully.
