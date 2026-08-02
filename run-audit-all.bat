@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit-all.ps1" -Quiet
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit-all.ps1" -Quiet
)
if errorlevel 1 (
  echo.
  echo Platform audit failed.
  exit /b 1
)
echo.
echo Platform audit finished successfully.
