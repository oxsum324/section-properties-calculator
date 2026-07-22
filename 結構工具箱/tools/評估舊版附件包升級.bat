@echo off
setlocal

if "%~1"=="" (
  echo Drag a formal attachment package folder onto this file, or run:
  echo   評估舊版附件包升級.bat "C:\case\formal-package"
  pause
  exit /b 3
)

node "%~dp0attachment-package-upgrade-assess.js" --input "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
