@echo off
setlocal
set "SCRIPT=%~dp0receiver_governance_archive_lifecycle.ps1"
where pwsh >nul 2>nul
if %errorlevel% equ 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%" -Mode IssueStatus
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%" -Mode IssueStatus
)
set "CODE=%errorlevel%"
if not "%CODE%"=="0" pause
exit /b %CODE%
