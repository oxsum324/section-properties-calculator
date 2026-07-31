@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0attachment-case-governance-viewer.ps1"
exit /b %ERRORLEVEL%
