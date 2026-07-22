@echo off
setlocal

if "%~1"=="" (
  echo 請將舊版附件升級工作區資料夾拖曳到本批次檔，或使用：
  echo   檢查舊版附件升級工作區.bat "C:\case\upgrade-workspace" [計畫編號]
  pause
  exit /b 3
)

if "%~2"=="" (
  node "%~dp0attachment-package-upgrade-workspace-check.js" --input "%~1"
) else (
  node "%~dp0attachment-package-upgrade-workspace-check.js" --input "%~1" --project-no "%~2"
)

set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
