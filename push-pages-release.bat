@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0push-pages-release.ps1" %*
if errorlevel 1 (
  echo.
  echo Pages push and release verification failed.
  exit /b 1
)
echo.
echo Pages push and release verification finished successfully.
