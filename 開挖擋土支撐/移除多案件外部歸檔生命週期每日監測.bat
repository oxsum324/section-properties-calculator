@echo off
setlocal
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage_receiver_governance_archive_lifecycle_monitor_task.ps1" -Mode Remove -TaskName "GSC多案件外部歸檔生命週期每日監測"
set code=%errorlevel%
pause
exit /b %code%
