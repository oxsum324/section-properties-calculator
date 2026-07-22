@echo off
setlocal

if "%~1"=="" goto usage

node "%~dp0attachment-case-governance-workspace.js" --config "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
if not defined ATTACHMENT_GOVERNANCE_NO_PAUSE pause
goto finish

:usage
echo Usage:
echo   check-governance-workspace BAT "workspace config JSON"
echo.
echo The config binds snapshots, disposition ledger, checkpoint history, and trusted TAC head.
echo Configs, governance data, and results are internal only and must not be published to Pages.
if not defined ATTACHMENT_GOVERNANCE_NO_PAUSE pause
set "RESULT=3"

:finish
exit /b %RESULT%
