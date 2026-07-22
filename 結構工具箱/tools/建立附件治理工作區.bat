@echo off
setlocal

if /I "%~1"=="initial" goto initial
if /I "%~1"=="advance" goto advance
goto usage

:initial
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage
if "%~6"=="" goto usage
if "%~7"=="" goto usage
if "%~8"=="" goto usage
if "%~9"=="" goto usage
node "%~dp0attachment-case-governance-workspace.js" --create --workspace-name "%~2" --directory "%~3" --ledger "%~4" --history "%~5" --head "%~6" --output "%~7" --reviewer "%~8" --basis "%~9"
goto done

:advance
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage
if "%~6"=="" goto usage
node "%~dp0attachment-case-governance-workspace.js" --create --previous-config "%~2" --head "%~3" --output "%~4" --reviewer "%~5" --basis "%~6"

:done
set "RESULT=%ERRORLEVEL%"
echo.
if not defined ATTACHMENT_GOVERNANCE_NO_PAUSE pause
goto finish

:usage
echo Usage:
echo   create-governance-workspace BAT initial "name" "snapshots" "ledger" "history" "trusted TAC head" "config output" "reviewer" "basis"
echo   create-governance-workspace BAT advance "previous config" "new trusted TAC head" "config output" "reviewer" "basis"
echo.
echo Every run creates a new immutable config. Advance keeps the existing name and sources.
if not defined ATTACHMENT_GOVERNANCE_NO_PAUSE pause
set "RESULT=3"

:finish
exit /b %RESULT%
