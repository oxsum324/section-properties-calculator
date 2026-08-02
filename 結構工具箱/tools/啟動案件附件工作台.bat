@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  if "%~1"=="" (
    pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1"
  ) else (
    pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1" -InitialPath %*
  )
) else (
  if "%~1"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1"
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1" -InitialPath %*
  )
)
exit /b %ERRORLEVEL%
