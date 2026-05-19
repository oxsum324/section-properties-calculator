@echo off
cd /d "%~dp0"

echo ================================================
echo  Stone audit report comparison
echo ================================================
echo  Quality gate: --fail-on-regression is enabled.
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python was not found in PATH.
    echo        Install Python or add python to PATH.
    pause
    exit /b 1
)

set "OLD_REPORT=%~1"
set "NEW_REPORT=%~2"

if "%OLD_REPORT%"=="" if "%NEW_REPORT%"=="" (
    echo No files were provided. Comparing the latest two audit reports in output.
    echo.
    python "audit_compare.py" --latest --fail-on-regression
    set "COMPARE_EXIT=%ERRORLEVEL%"
    goto compare_done
)

if "%OLD_REPORT%"=="" (
    set /p "OLD_REPORT=Old audit JSON path: "
)
if "%NEW_REPORT%"=="" (
    set /p "NEW_REPORT=New audit JSON path: "
)

if not exist "%OLD_REPORT%" (
    echo [FAIL] Old audit report not found:
    echo        %OLD_REPORT%
    pause
    exit /b 1
)

if not exist "%NEW_REPORT%" (
    echo [FAIL] New audit report not found:
    echo        %NEW_REPORT%
    pause
    exit /b 1
)

echo.
python "audit_compare.py" "%OLD_REPORT%" "%NEW_REPORT%" --fail-on-regression
set "COMPARE_EXIT=%ERRORLEVEL%"

:compare_done
echo.
if "%COMPARE_EXIT%"=="0" (
    echo [PASS] No quality regression detected.
) else if "%COMPARE_EXIT%"=="2" (
    echo [WARN] Quality regression detected. Review the differences above before delivery.
) else (
    echo [FAIL] Audit comparison failed.
)

pause
exit /b %COMPARE_EXIT%
