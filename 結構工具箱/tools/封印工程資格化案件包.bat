@echo off
setlocal

if "%~1"=="" goto usage

node "%~dp0engineering-qualification-case-bundle.js" --seal "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
goto finish

:usage
echo Usage:
echo   seal qualification case bundle BAT "case-bundle.draft.json"
echo.
echo Sealing creates a fingerprint-bound file and never overwrites the draft.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
set "RESULT=3"

:finish
exit /b %RESULT%
