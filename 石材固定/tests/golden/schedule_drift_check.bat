@echo off
REM ─────────────────────────────────────────────────────────────────────
REM schedule_drift_check.bat — V2 Baseline 漂移定期檢查
REM
REM 註冊到 Windows 工作排程器：
REM   schtasks /Create /SC DAILY /ST 06:00 /TN "V2_Baseline_Drift" ^
REM     /TR "C:\Users\USER\Desktop\AI\小工具製作\石材固定\tests\golden\schedule_drift_check.bat"
REM
REM 立即執行測試：
REM   schedule_drift_check.bat
REM
REM 結果：
REM   - 報告寫入 tests/golden/_drift_log/YYYY-MM-DD.txt
REM   - 失敗時 exit code 非 0；可由排程器發信件通知
REM ─────────────────────────────────────────────────────────────────────

setlocal

REM 切到專案目錄
cd /d "%~dp0..\.."
if errorlevel 1 (
  echo [ERROR] 切換目錄失敗
  exit /b 2
)

REM 準備時戳與 log 目錄
set "DATESTAMP=%date:~0,4%-%date:~5,2%-%date:~8,2%"
set "TIMESTAMP=%time:~0,2%-%time:~3,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "LOG_DIR=tests\golden\_drift_log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\%DATESTAMP%_%TIMESTAMP%.txt"

echo === V2 Baseline Drift Check ===
echo 開始時間：%DATESTAMP% %TIMESTAMP%
echo 報告檔：%LOG_FILE%
echo.

REM 執行 diff
python tests\golden\auto_diff.py --report "%LOG_FILE%"
set "EXITCODE=%errorlevel%"

echo.
echo === 結束 (exit code: %EXITCODE%) ===

REM exit code 對應：
REM   0 = 全部通過
REM   1 = 至少一案例漂移
REM   2 = 執行錯誤

if %EXITCODE% NEQ 0 (
  echo [警告] 偵測到漂移或錯誤，請檢視 %LOG_FILE%
)

endlocal & exit /b %EXITCODE%
