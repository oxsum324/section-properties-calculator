@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage

if "%~6"=="" goto initialize
goto advance

:initialize
node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js" --directory "%~1" --ledger "%~2" --initialize --output "%~3" --reviewer "%~4" --basis "%~5"
goto done

:advance
node "%~dp0attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js" --directory "%~1" --ledger "%~2" --advance --checkpoint "%~6" --accept-additions --output "%~3" --reviewer "%~4" --basis "%~5"

:done
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   初始：建立多案件治理趨勢處置檢查點.bat "治理快照資料夾" "內部處置紀錄資料夾" "外部檢查點資料夾" "複核人" "複核依據"
echo   前進：建立多案件治理趨勢處置檢查點.bat "治理快照資料夾" "內部處置紀錄資料夾" "外部檢查點資料夾" "複核人" "複核依據" "前一檢查點 JSON"
echo.
echo 前進只接受既有前綴完全相同的新收據；每次都建立新檔，不覆寫舊檢查點。
echo 檢查點不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
