@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-governance-hub.ps1"
exit /b %ERRORLEVEL%
