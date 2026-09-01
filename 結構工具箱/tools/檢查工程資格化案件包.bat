@echo off
setlocal

if "%~1"=="" goto usage

node "%~dp0engineering-qualification-case-bundle.js" --input "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
goto finish

:usage
echo Usage:
echo   check qualification case bundle BAT "case-bundle JSON"
echo.
echo This is a read-only integrity and qualification check; it does not approve an attachment.
if not defined ENGINEERING_QUALIFICATION_NO_PAUSE pause
set "RESULT=3"

:finish
exit /b %RESULT%
