@echo off
setlocal

if "%~1"=="" (
  echo 用法：
  echo   檢查多案件附件治理總覽.bat "案件上層資料夾"
  echo.
  echo 工具只掃描直接子資料夾，並固定唯讀。
  echo ready 不代表任何案件的正式附件核可。
  pause
  exit /b 3
)

node "%~dp0attachment-case-governance-portfolio.js" --parent "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
