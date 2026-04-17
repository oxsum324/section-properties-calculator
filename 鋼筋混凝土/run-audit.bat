@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0audit-tool.ps1" -Quiet
if errorlevel 1 (
  echo.
  echo RC audit failed.
  exit /b 1
)
echo.
echo RC audit finished successfully.
