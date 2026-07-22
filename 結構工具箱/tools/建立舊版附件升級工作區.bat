@echo off
setlocal

if "%~1"=="" (
  echo 請將舊版正式附件包資料夾拖曳到本批次檔，或使用：
  echo   建立舊版附件升級工作區.bat "C:\case\formal-package" ["C:\case\upgrade-workspace"]
  pause
  exit /b 3
)

if "%~2"=="" (
  node "%~dp0attachment-package-upgrade-workspace.js" --input "%~1"
) else (
  node "%~dp0attachment-package-upgrade-workspace.js" --input "%~1" --output "%~2"
)

set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
