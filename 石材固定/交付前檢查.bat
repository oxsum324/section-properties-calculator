@echo off
cd /d "%~dp0"

echo ================================================
echo  Stone report pre-delivery check
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python was not found in PATH.
    echo        Install Python or add python to PATH.
    pause
    exit /b 1
)

python "pre_delivery_check.py"
if errorlevel 1 goto failed

echo.
echo ================================================
echo  PASS: pre-delivery check completed
echo ================================================
pause
exit /b 0

:failed
echo.
echo ================================================
echo  FAIL: pre-delivery check failed
echo ================================================
pause
exit /b 1
