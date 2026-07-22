@echo off
setlocal

if "%~2"=="" (
  echo 用法：
  echo   檢查附件升級可信基準版本鏈.bat "歷程資料夾" "可信基準根目錄" ["根目錄外的初始可信基準.json"]
  echo.
  echo 本工具固定唯讀，結果不是正式附件核可。
  pause
  exit /b 3
)

if "%~3"=="" (
  node "%~dp0attachment-package-upgrade-history-baseline-chain.js" --history "%~1" --chain-root "%~2"
) else (
  node "%~dp0attachment-package-upgrade-history-baseline-chain.js" --history "%~1" --chain-root "%~2" --initial-baseline "%~3"
)
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
