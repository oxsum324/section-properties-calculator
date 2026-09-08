@echo off
chcp 65001 >nul
cd /d "%~dp0"
node serve-local.js 4186 --route /field-survey/recorder.html
if errorlevel 1 pause
