@echo off
setlocal

if "%~1"=="" (
  echo Drag an attachment folder onto this file, or run:
  echo   建立正式附件包.bat "C:\case\attachments"
  pause
  exit /b 3
)

node "%~dp0attachment-package-build.js" --input "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
