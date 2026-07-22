@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage
if "%~3"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js" --directory "%~1" --ledger "%~2" --checkpoint "%~3"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   檢查多案件治理趨勢處置檢查點.bat "治理快照資料夾" "內部處置紀錄資料夾" "指定的外部可信檢查點 JSON"
echo.
echo 必須明確指定受保護位置中的檢查點；不得自動猜選較新或較舊檔案。
echo 檢查點與結果不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
