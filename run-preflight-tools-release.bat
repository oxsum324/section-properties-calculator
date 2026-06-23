@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0preflight-tools.ps1" -Quiet -ForceSlowChecks -ForcePlatformAudit %*
if errorlevel 1 (
  echo.
  echo Release tool preflight failed.
  exit /b 1
)
echo.
echo Release tool preflight finished successfully.
