@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage

node "%~dp0attachment-case-governance-portfolio-compare.js" --previous "%~1" --current "%~2"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   比較多案件附件治理總覽.bat "前次完整總覽.json" "目前完整總覽.json"
echo.
echo 只接受未篩選的完整總覽 JSON，工具固定唯讀。
pause
exit /b 3
