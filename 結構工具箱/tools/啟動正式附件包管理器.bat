@echo off
setlocal

where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-package-manager.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-package-manager.ps1"
)
exit /b %ERRORLEVEL%
