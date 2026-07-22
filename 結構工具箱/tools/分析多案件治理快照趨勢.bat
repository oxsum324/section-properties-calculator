@echo off
setlocal

if "%~1"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-snapshot-trend.js" --directory "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   分析多案件治理快照趨勢.bat "單一案件群組的內部治理快照資料夾"
echo.
echo 趨勢沿用快照索引的封閉驗證，固定唯讀，不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
