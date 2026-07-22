@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage
if "%~6"=="" goto usage

if /I "%~5"=="removal" goto removal
if /I "%~5"=="issue" goto issue
goto usage

:removal
node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition.js" --directory "%~1" --ledger "%~2" --acknowledge --reviewer "%~3" --basis "%~4" --case-removal "%~6"
goto done

:issue
node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition.js" --directory "%~1" --ledger "%~2" --acknowledge --reviewer "%~3" --basis "%~4" --recurring-issue "%~6"

:done
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   記錄多案件治理趨勢處置.bat "治理快照資料夾" "內部處置紀錄資料夾" "內部複核人" "複核依據" removal^|issue "案件名稱或問題代碼"
echo.
echo 收據只解除相同持續證據的歷史型注意，不得覆蓋目前 blocked / review 或最新惡化。
echo 處置紀錄不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
