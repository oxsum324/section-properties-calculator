@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-pages-release.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-pages-release.ps1" %*
)
if errorlevel 1 (
  echo.
  echo Pages push and release verification failed.
  exit /b 1
)
echo.
echo Pages push and release verification finished successfully.
