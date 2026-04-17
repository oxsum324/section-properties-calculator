@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0audit-all.ps1" -Quiet
if errorlevel 1 (
  echo.
  echo Platform audit failed.
  exit /b 1
)
echo.
echo Platform audit finished successfully.
