@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo  石材計算書 Word 產生伺服器
echo ================================================
echo.
echo  啟動後請保持此視窗開啟。
echo  在工具頁面按「匯出 Word」即可直接產生 Word 檔。
echo.
echo  按 Ctrl+C 可停止伺服器。
echo ================================================
echo.

:: 2 秒後自動開啟瀏覽器（獨立子程序）
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8765"

:: 前景執行伺服器（Ctrl+C 可正常停止）
python server.py

if %errorlevel% neq 0 (
    echo.
    echo 啟動失敗，請確認 Python 已安裝且在 PATH 中。
    pause
)
