@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -ForceSlowChecks -ForcePlatformAudit
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -ForceSlowChecks -ForcePlatformAudit
)
if errorlevel 1 (
  echo.
  echo Release tool preflight failed.
  exit /b 1
)
echo.
echo Release tool preflight finished successfully.
