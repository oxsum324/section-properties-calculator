@echo off
REM ─────────────────────────────────────────────────────────────────────
REM run_all_tests.bat — V2 工具一鍵全測試套件
REM
REM 涵蓋：
REM   1. 4 套 Node.js smoke 測試（calc-core / formula-registry / dashboard / version-sync）
REM   2. JS 語法靜態檢查（V2 HTML inline script）
REM   3. 5 組 baseline 漂移偵測（auto_diff.py）
REM   4. auto_word.py 指紋閘門端對端驗證
REM   5. 最終 CI 摘要報告
REM
REM 結束碼：
REM   0 = 全通過
REM   非 0 = 至少一項失敗，詳見 _last_run.log
REM ─────────────────────────────────────────────────────────────────────

setlocal EnableDelayedExpansion

cd /d "%~dp0.."
if errorlevel 1 (
  echo [ERROR] 切換目錄失敗
  exit /b 99
)

set "LOG_DIR=tests\_run_log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "DATESTAMP=%date:~0,4%-%date:~5,2%-%date:~8,2%"
set "TIMESTAMP=%time:~0,2%-%time:~3,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "RUN_LOG=%LOG_DIR%\%DATESTAMP%_%TIMESTAMP%.log"
set "LATEST=%LOG_DIR%\_last_run.log"

echo. > "%RUN_LOG%"
echo === V2 一鍵全測試套件 ===
echo 開始時間：%DATESTAMP% %TIMESTAMP%
echo 報告檔：%RUN_LOG%
echo.

set "TOTAL_FAILED=0"

REM ── [1/5] Node.js smoke 測試（含 input-schema）──
echo [1/5] Node.js Smoke Tests
echo [1/5] Node.js Smoke Tests >> "%RUN_LOG%"

for %%T in (regression-smoke formula-registry-smoke review-dashboard-smoke version-sync-smoke input-schema-smoke code-profiles-registry-smoke) do (
  node js\%%T.test.js >> "%RUN_LOG%" 2>&1
  if errorlevel 1 (
    echo   X %%T - FAIL
    echo   X %%T - FAIL >> "%RUN_LOG%"
    set /a TOTAL_FAILED+=1
  ) else (
    echo   v %%T
  )
)

REM ── [2/5] JS 語法檢查 ──
echo.
echo [2/5] V2 HTML inline JS 語法檢查
echo [2/5] V2 HTML inline JS 語法檢查 >> "%RUN_LOG%"
node tests\syntax_check.js >> "%RUN_LOG%" 2>&1
if errorlevel 1 (
  echo   X 語法檢查失敗
  set /a TOTAL_FAILED+=1
) else (
  echo   v 語法 OK
)

REM ── [3/5] Baseline 漂移偵測 ──
echo.
echo [3/5] Baseline 漂移偵測（5 組案例）
echo [3/5] Baseline 漂移偵測 >> "%RUN_LOG%"
python tests\golden\auto_diff.py >> "%RUN_LOG%" 2>&1
if errorlevel 1 (
  echo   X 漂移偵測失敗（含偏移或執行錯誤）
  echo   X 漂移偵測失敗 >> "%RUN_LOG%"
  set /a TOTAL_FAILED+=1
) else (
  echo   v 5/5 PASS
)

REM ── [4/5] auto_word 指紋閘門驗證 ──
echo.
echo [4/5] auto_word.py 指紋閘門端對端驗證
echo [4/5] auto_word.py 指紋閘門驗證 >> "%RUN_LOG%"
python tests\autoword_guard_test.py >> "%RUN_LOG%" 2>&1
if errorlevel 1 (
  echo   X 指紋閘門驗證失敗
  set /a TOTAL_FAILED+=1
) else (
  echo   v 草稿浮水印確認注入
)

REM ── [5/6] 視覺裝飾驗證（tier banner / 法規 footer / dock 模式 / 預設值徽章）──
echo.
echo [5/6] 視覺裝飾測試（Phase K/L/8/9/1b）
echo [5/6] 視覺裝飾測試 >> "%RUN_LOG%"
python tests\visual_decoration_test.py >> "%RUN_LOG%" 2>&1
if errorlevel 1 (
  echo   X 視覺裝飾驗證失敗
  set /a TOTAL_FAILED+=1
) else (
  echo   v 視覺裝飾全通過
)

REM ── [6/6] V2.6.0：governance fingerprint 檔名比對工具測試 ──
echo.
echo [6/6] gov_filename_diff 工具測試（V2.6.0）
echo [6/6] gov_filename_diff 工具測試 >> "%RUN_LOG%"
python tests\gov_filename_diff_test.py >> "%RUN_LOG%" 2>&1
if errorlevel 1 (
  echo   X gov_filename_diff 測試失敗
  set /a TOTAL_FAILED+=1
) else (
  echo   v gov_filename_diff 12 cases 全通過
)

REM ── 摘要 ──
echo.
echo ============================================================
if %TOTAL_FAILED% EQU 0 (
  echo  v 全部通過
  echo  v 全部通過 >> "%RUN_LOG%"
  set "RESULT=PASS"
) else (
  echo  X 有 %TOTAL_FAILED% 項失敗
  echo  X 有 %TOTAL_FAILED% 項失敗 >> "%RUN_LOG%"
  set "RESULT=FAIL"
)
echo  詳見：%RUN_LOG%
echo ============================================================

REM 複製為 _last_run.log 方便檢視
copy /y "%RUN_LOG%" "%LATEST%" >nul

REM 產生摘要報告（CI 友善）
python tests\ci_summary.py "%RUN_LOG%" 2>nul

endlocal & exit /b %TOTAL_FAILED%
