@echo off
setlocal

if "%~1"=="" (
  echo 請將「附件升級內部歷程_勿附入主報告」資料夾拖曳到本批次檔，或使用：
  echo   檢查附件升級內部歷程.bat "C:\case\history" ["C:\trusted\history-baseline.json"]
  pause
  exit /b 3
)

if "%~2"=="" (
  node "%~dp0attachment-package-upgrade-history-index.js" --history "%~1"
) else (
  node "%~dp0attachment-package-upgrade-history-index.js" --history "%~1" --baseline "%~2"
)

set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
