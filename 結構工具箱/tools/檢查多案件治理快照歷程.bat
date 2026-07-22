@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto index
if /I not "%~2"=="compare" goto usage
if "%~3"=="" goto compare
if /I "%~3"=="blocking" goto blocking

node "%~dp0attachment-case-governance-portfolio-snapshot-index.js" --directory "%~1" --compare-latest --change "%~3"
goto done

:blocking
node "%~dp0attachment-case-governance-portfolio-snapshot-index.js" --directory "%~1" --compare-latest --only-blocking
goto done

:compare
node "%~dp0attachment-case-governance-portfolio-snapshot-index.js" --directory "%~1" --compare-latest
goto done

:index
node "%~dp0attachment-case-governance-portfolio-snapshot-index.js" --directory "%~1"

:done
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   檢查多案件治理快照歷程.bat "內部治理快照資料夾" [compare] [blocking^|regressed^|added^|removed^|improved^|changed^|unchanged]
echo.
echo compare 只在資料夾含單一案件群組且至少兩份有效快照時比較最新兩版。
echo 索引與比較固定唯讀，不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
