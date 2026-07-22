@echo off
setlocal

if "%~4"=="" (
  echo 用法：
  echo   推進附件升級可信基準.bat "歷程資料夾" "既有可信基準.json" "內部複核人" "複核依據" ["新前進包資料夾"]
  echo.
  echo 此核准只接受歷程新增收據，不是正式附件核可。
  pause
  exit /b 3
)

if "%~5"=="" (
  node "%~dp0attachment-package-upgrade-history-baseline-advance.js" --history "%~1" --baseline "%~2" --accept-additions --reviewer "%~3" --basis "%~4"
) else (
  node "%~dp0attachment-package-upgrade-history-baseline-advance.js" --history "%~1" --baseline "%~2" --accept-additions --reviewer "%~3" --basis "%~4" --output "%~5"
)
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
