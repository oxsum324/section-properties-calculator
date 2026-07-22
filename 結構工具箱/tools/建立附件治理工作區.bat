@echo off
setlocal

if /I "%~1"=="initial" goto initial
if /I "%~1"=="advance" goto advance
goto usage

:initial
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage
if "%~6"=="" goto usage
if "%~7"=="" goto usage
if "%~8"=="" goto usage
if "%~9"=="" goto usage
node "%~dp0attachment-case-governance-workspace.js" --create --workspace-name "%~2" --directory "%~3" --ledger "%~4" --history "%~5" --head "%~6" --output "%~7" --reviewer "%~8" --basis "%~9"
goto done

:advance
if "%~2"=="" goto usage
if "%~3"=="" goto usage
if "%~4"=="" goto usage
if "%~5"=="" goto usage
if "%~6"=="" goto usage
node "%~dp0attachment-case-governance-workspace.js" --create --previous-config "%~2" --head "%~3" --output "%~4" --reviewer "%~5" --basis "%~6"

:done
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:usage
echo 用法：
echo   初始：建立附件治理工作區.bat initial "工作區名稱" "快照資料夾" "處置鏈資料夾" "檢查點歷程資料夾" "受信任 TAC 終點" "設定輸出資料夾" "複核人" "複核依據"
echo   前進：建立附件治理工作區.bat advance "前一工作區設定" "新受信任 TAC 終點" "設定輸出資料夾" "複核人" "複核依據"
echo.
echo 每次建立不可覆寫的新設定；前進固定沿用前一設定的名稱與三個來源。
pause
exit /b 3
