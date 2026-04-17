@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0audit-core.ps1" -Quiet
if errorlevel 1 (
  echo.
  echo Structural core audit failed.
  exit /b 1
)
echo.
echo Structural core audit finished successfully.
