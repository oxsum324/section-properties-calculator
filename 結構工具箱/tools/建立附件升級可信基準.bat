@echo off
setlocal

if "%~1"=="" (
  echo 請將「附件升級內部歷程_勿附入主報告」資料夾拖曳到本批次檔，或使用：
  echo   建立附件升級可信基準.bat "C:\case\history" ["C:\trusted\old-baseline.json"] ["C:\trusted\new-baseline.json"]
  pause
  exit /b 3
)

if "%~2"=="" (
  node "%~dp0attachment-package-upgrade-history-baseline.js" --history "%~1"
) else if "%~3"=="" (
  node "%~dp0attachment-package-upgrade-history-baseline.js" --history "%~1" --baseline "%~2"
) else (
  node "%~dp0attachment-package-upgrade-history-baseline.js" --history "%~1" --baseline "%~2" --output "%~3"
)
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
