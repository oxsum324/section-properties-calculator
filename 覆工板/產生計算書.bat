@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ================================================
echo   覆工板系統結構計算書 — Word 產報工具
echo ================================================
echo.
python report\gen_report.py %1
echo.
pause
