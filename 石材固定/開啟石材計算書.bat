@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: ────────────────────────────────────────────────
::  石材計算書 一鍵啟動
::  - 若伺服器已在背景運作 → 直接開瀏覽器
::  - 否則用 pythonw（無主控台視窗）啟動伺服器 → 再開瀏覽器
:: ────────────────────────────────────────────────

set "URL=http://127.0.0.1:8765/石材固定/石材計算書產生器_規範版V2.html"

:: 1. 偵測伺服器是否已開
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:8765/status' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { 0 }" 2>nul | findstr /c:"200" >nul
if %errorlevel% equ 0 (
    start "" "%URL%"
    exit /b
)

:: 2. 伺服器未啟 → pythonw 背景啟動（無視窗）
start "" pythonw "%~dp0server.py"

:: 3. 等伺服器起來（輪詢最多 10 秒）
for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:8765/status' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { 0 }" 2>nul | findstr /c:"200" >nul
    if not errorlevel 1 goto :ready
)

echo 伺服器啟動失敗。
pause
exit /b 1

:ready
start "" "%URL%"
