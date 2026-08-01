@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0結構工具箱\tools\install-attachment-governance-shortcuts.ps1" %*
exit /b %ERRORLEVEL%
