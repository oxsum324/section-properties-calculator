@echo off
setlocal

if "%~1"=="" (
  echo Drag an attachment folder onto this file, or run:
  echo   檢查附件組包.bat "C:\case\attachments"
  pause
  exit /b 2
)

node "%~dp0attachment-package-check.js" --input "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
