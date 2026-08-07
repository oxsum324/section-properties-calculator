@echo off
setlocal
if "%~1"=="" (
  echo 請把覆工板工具匯出的 JSON 拖曳到本批次檔。
  exit /b 2
)
node "%~dp0construction-stage-load-handoff.js" --input "%~1"
if errorlevel 1 exit /b %errorlevel%
echo.
echo 交接檔已建立；請在開挖擋土支撐工具的指定共構柱內明確匯入套用。
