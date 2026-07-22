@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-snapshot.js" --parent "%~1" --output "%~2"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   保存多案件附件治理快照.bat "案件上層資料夾" "內部治理快照資料夾"
echo.
echo 快照資料夾必須與案件上層完全分離；同名快照永不覆寫。
echo 快照只供內部跨期比較，不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
