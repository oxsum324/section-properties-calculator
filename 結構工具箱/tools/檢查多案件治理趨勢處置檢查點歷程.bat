@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js" --directory "%~1" --ledger "%~2" --history "%~3" --head "%~4"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   檢查多案件治理趨勢處置檢查點歷程.bat "治理快照資料夾" "內部處置紀錄資料夾" "可信檢查點歷程資料夾" "明確指定的受信任 TAC 終點 JSON"
echo.
echo 不自動猜選最新檢查點；缺檔、替換、分叉、回退或指定終點不存在均會阻擋。
echo 工具、檢查點與結果不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
