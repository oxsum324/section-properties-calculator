@echo off
setlocal
where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0結構工具箱\tools\install-attachment-governance-shortcuts.ps1" -Check %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0結構工具箱\tools\install-attachment-governance-shortcuts.ps1" -Check %*
)
exit /b %ERRORLEVEL%
