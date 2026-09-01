@echo off
setlocal

if "%~4"=="" goto usage

node "%~dp0engineering-qualification-case-bundle.js" --init "%~1" --case-id "%~2" --case-label "%~3" --source-kind "%~4"
set "RESULT=%ERRORLEVEL%"
echo.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
goto finish

:usage
echo Usage:
echo   create qualification workspace BAT "new workspace" "case ID" "case label" "real-case^|synthetic^|code-example"
echo.
echo The workspace is private and must not be published to Pages or attached to a formal report.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
set "RESULT=3"

:finish
exit /b %RESULT%
