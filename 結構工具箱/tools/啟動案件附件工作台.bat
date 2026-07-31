@echo off
setlocal
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1" -InitialPath %*
)
exit /b %ERRORLEVEL%
