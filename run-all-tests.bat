@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-all-tests.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-all-tests.ps1" %*
)
exit /b %ERRORLEVEL%
