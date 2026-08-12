@echo off
setlocal
set "SCRIPT=%~dp0receiver_governance_archive_lifecycle_portfolio.ps1"
where pwsh >nul 2>nul
if %errorlevel% equ 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%" -Mode Publish
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%" -Mode Publish
)
set "CODE=%errorlevel%"
if "%CODE%"=="1" pause
exit /b %CODE%
