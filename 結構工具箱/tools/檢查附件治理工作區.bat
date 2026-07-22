@echo off
setlocal

if "%~1"=="" goto usage

node "%~dp0attachment-case-governance-workspace.js" --config "%~1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   檢查附件治理工作區.bat "附件治理工作區設定 JSON"
echo.
echo 單一設定檔會固定快照、處置鏈、檢查點歷程及受信任 TAC 終點三重身分。
echo 設定、治理資料與結果不得放入計算書、主報告、正式附件包或 Pages。
pause
exit /b 3
