@echo off
setlocal
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0receiver_governance_archive_lifecycle_monitor_center.ps1" -Mode Interactive
set code=%errorlevel%
if not "%code%"=="0" pause
exit /b %code%
