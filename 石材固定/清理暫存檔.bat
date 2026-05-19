@echo off
cd /d "%~dp0"

echo ================================================
echo  Stone report temp cleanup
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python was not found in PATH.
    echo        Install Python or add python to PATH.
    pause
    exit /b 1
)

python "cleanup_temp.py"
if errorlevel 1 goto failed

echo.
echo To remove the listed files, run:
echo   python cleanup_temp.py --apply
echo.
pause
exit /b 0

:failed
echo.
echo Cleanup dry-run failed.
pause
exit /b 1
