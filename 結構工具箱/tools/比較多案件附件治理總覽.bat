@echo off
setlocal

if "%~1"=="" goto usage
if "%~2"=="" goto usage

if "%~3"=="" goto full
if /I "%~3"=="blocking" goto blocking

node "%~dp0attachment-case-governance-portfolio-compare.js" --previous "%~1" --current "%~2" --change "%~3"
goto done

:blocking
node "%~dp0attachment-case-governance-portfolio-compare.js" --previous "%~1" --current "%~2" --only-blocking
goto done

:full
node "%~dp0attachment-case-governance-portfolio-compare.js" --previous "%~1" --current "%~2"

:done
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   比較多案件附件治理總覽.bat "前次完整總覽.json" "目前完整總覽.json" [blocking^|regressed^|added^|removed^|improved^|changed^|unchanged]
echo.
echo blocking 只顯示目前 blocked 或惡化案件；篩選不改變完整狀態、退出碼或 CMP 指紋。
echo 輸入只接受未篩選的完整總覽 JSON，工具固定唯讀。
pause
exit /b 3
