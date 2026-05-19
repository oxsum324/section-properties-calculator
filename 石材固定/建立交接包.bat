@echo off
cd /d "%~dp0"

echo ================================================
echo  Stone report release bundle
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python was not found in PATH.
    echo        Install Python or add python to PATH.
    pause
    exit /b 1
)

python "make_release_bundle.py"
if errorlevel 1 goto failed

echo.
echo To create the core ZIP, run:
echo   python make_release_bundle.py --apply
echo.
echo To verify a created ZIP manifest, run:
echo   python verify_release_bundle.py release\your_bundle.zip
echo.
echo To include reference files, run:
echo   python make_release_bundle.py --apply --include-reference
echo.
pause
exit /b 0

:failed
echo.
echo Release bundle dry-run failed.
pause
exit /b 1
