@echo off
setlocal
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName System.Windows.Forms; $s=New-Object System.Windows.Forms.FolderBrowserDialog; $s.Description='Select the physical parent folder containing case GSC packages'; if($s.ShowDialog() -ne 'OK'){exit 1}; $o=New-Object System.Windows.Forms.FolderBrowserDialog; $o.Description='Select or create a separate controlled folder for local GSM monitor state'; $o.ShowNewFolderButton=$true; if($o.ShowDialog() -ne 'OK'){exit 1}; & '%~dp0manage_receiver_governance_archive_lifecycle_monitor_task.ps1' -Mode Install -TaskName 'GSC多案件外部歸檔生命週期每日監測' -SourceRoot $s.SelectedPath -StateDirectory $o.SelectedPath"
set code=%errorlevel%
if not "%code%"=="0" pause
exit /b %code%
