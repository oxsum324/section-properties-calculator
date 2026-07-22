@echo off
setlocal

if "%~3"=="" (
  echo 用法：
  echo   檢查案件附件治理總覽.bat "正式附件包" "外部歷程資料夾" "可信基準根目錄" ["根目錄外的初始可信基準.json"]
  echo.
  echo 本工具固定唯讀；ready 只表示可進入內部歸檔複核，不代表正式附件核可。
  pause
  exit /b 3
)

if "%~4"=="" (
  node "%~dp0attachment-case-governance-overview.js" --package "%~1" --history "%~2" --chain-root "%~3"
) else (
  node "%~dp0attachment-case-governance-overview.js" --package "%~1" --history "%~2" --chain-root "%~3" --initial-baseline "%~4"
)
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
