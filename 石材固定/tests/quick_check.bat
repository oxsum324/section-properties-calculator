@echo off
REM ─────────────────────────────────────────────────────────────────────
REM quick_check.bat — V2 快速檢查（< 5 秒，無 Playwright）
REM
REM 跑 6 套 Node smoke + JS 語法檢查
REM 不跑 baseline drift / auto_word / visual decoration（這 3 項需 Playwright）
REM
REM 用途：
REM   - 修改 V2 後立即驗證計算核心未壞
REM   - 配合手動 commit 前快速確認
REM   - 完整驗證請改用 tests\run_all_tests.bat
REM ─────────────────────────────────────────────────────────────────────

setlocal EnableDelayedExpansion
cd /d "%~dp0.."

set "FAILED=0"
echo === V2 quick_check ===
echo.

for %%T in (regression-smoke formula-registry-smoke review-dashboard-smoke version-sync-smoke input-schema-smoke code-profiles-registry-smoke) do (
  node js\%%T.test.js > nul 2>&1
  if errorlevel 1 (
    echo   X %%T - FAIL
    node js\%%T.test.js
    set /a FAILED+=1
  ) else (
    echo   v %%T
  )
)

node tests\syntax_check.js > nul 2>&1
if errorlevel 1 (
  echo   X V2 HTML inline JS syntax - FAIL
  node tests\syntax_check.js
  set /a FAILED+=1
) else (
  echo   v V2 HTML inline JS syntax
)

echo.
if %FAILED% EQU 0 (
  echo  v 全部 7 項 quick check 通過
  echo    完整驗證（含漂移/PDF/視覺）：tests\run_all_tests.bat
) else (
  echo  X 有 %FAILED% 項失敗
)

endlocal & exit /b %FAILED%
