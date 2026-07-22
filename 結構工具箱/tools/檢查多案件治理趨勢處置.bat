@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition.js" --directory "%~1" --ledger "%~2"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   檢查多案件治理趨勢處置.bat "治理快照資料夾" "內部處置紀錄資料夾"
echo.
echo 本入口固定唯讀；處置紀錄不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
