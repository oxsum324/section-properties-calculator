@echo off
setlocal

if "%~1"=="" (
  echo Drag a formal attachment package folder onto this file, or run:
  echo   驗證正式附件包.bat "C:\case\formal-package"
  pause
  exit /b 3
)

node "%~dp0attachment-package-verify.js" --input "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
