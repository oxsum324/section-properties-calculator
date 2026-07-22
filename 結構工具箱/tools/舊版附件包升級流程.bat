@echo off
setlocal

if "%~1"=="" (
  echo 請將正式附件包、升級工作區或「01_新組包來源」資料夾拖曳到本批次檔，或使用：
  echo   舊版附件包升級流程.bat "C:\case\input" ["C:\case\output"] [計畫編號]
  pause
  exit /b 3
)

if "%~2"=="" (
  node "%~dp0attachment-package-upgrade-flow.js" --input "%~1"
) else if "%~3"=="" (
  node "%~dp0attachment-package-upgrade-flow.js" --input "%~1" --output "%~2"
) else (
  node "%~dp0attachment-package-upgrade-flow.js" --input "%~1" --output "%~2" --project-no "%~3"
)

set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
