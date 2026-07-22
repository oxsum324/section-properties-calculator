@echo off
setlocal

if "%~1"=="" (
  echo 用法：
  echo   檢查案件根目錄附件治理.bat "案件根目錄"
  echo.
  echo 工具只掃描直接子資料夾；不猜選多組附件包、歷程或可信基準鏈。
  echo ready 只表示可進入內部歸檔複核，不代表正式附件核可。
  pause
  exit /b 3
)

node "%~dp0attachment-case-governance-root.js" --root "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
