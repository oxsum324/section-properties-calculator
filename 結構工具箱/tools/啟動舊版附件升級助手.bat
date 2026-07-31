@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-package-upgrade-assistant.ps1"
exit /b %ERRORLEVEL%
