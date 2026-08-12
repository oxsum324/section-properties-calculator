@echo off
setlocal
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0onboard_receiver_governance_archive_lifecycle_monitor.ps1" -Mode Interactive
set code=%errorlevel%
if not "%code%"=="0" pause
exit /b %code%
