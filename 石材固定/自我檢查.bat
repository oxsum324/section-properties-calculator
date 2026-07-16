@echo off
cd /d "%~dp0"

echo ================================================
echo  Stone report tool self-check
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Node.js was not found in PATH.
    echo        Install Node.js or add node to PATH.
    pause
    exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python was not found in PATH.
    echo        Install Python or add python to PATH.
    pause
    exit /b 1
)

echo [1/11] Checking environment dependencies...
python "env_check.py"
if errorlevel 1 goto failed

echo.
echo [2/11] Checking project version and path consistency...
python "self_check.py"
if errorlevel 1 goto failed

echo.
echo [3/11] Checking regression test syntax...
node --check "js\regression-smoke.test.js"
if errorlevel 1 goto failed

echo.
echo [4/11] Running calculator regression smoke tests...
node "js\regression-smoke.test.js"
if errorlevel 1 goto failed

echo.
echo [5/11] Running formula registry smoke tests...
node --check "js\formula-registry.spec.js"
if errorlevel 1 goto failed
node --check "js\formula-registry-smoke.test.js"
if errorlevel 1 goto failed
node --check "js\version-sync.js"
if errorlevel 1 goto failed
node --check "js\version-sync-smoke.test.js"
if errorlevel 1 goto failed
node "js\version-sync-smoke.test.js"
if errorlevel 1 goto failed
node --check "js\review-dashboard.js"
if errorlevel 1 goto failed
node --check "js\review-dashboard-smoke.test.js"
if errorlevel 1 goto failed
node "js\review-dashboard-smoke.test.js"
if errorlevel 1 goto failed
node "js\formula-registry-smoke.test.js"
if errorlevel 1 goto failed
node --check "js\code-profiles-registry.spec.js"
if errorlevel 1 goto failed
node --check "js\code-profiles-registry-smoke.test.js"
if errorlevel 1 goto failed
node "js\code-profiles-registry-smoke.test.js"
if errorlevel 1 goto failed

echo.
echo [6/11] Running server export smoke tests...
python "server_smoke_test.py"
if errorlevel 1 goto failed

echo.
echo [7/11] Running audit schema/comparison smoke tests...
python "audit_schema_test.py"
if errorlevel 1 goto failed
python "audit_compare_test.py"
if errorlevel 1 goto failed

echo.
echo [8/11] Running cleanup/release bundle smoke tests...
python "cleanup_temp_test.py"
if errorlevel 1 goto failed
python "release_bundle_smoke_test.py"
if errorlevel 1 goto failed

echo.
echo [9/11] Running UI smoke test...
python "ui_smoke_test.py"
if errorlevel 1 goto failed

echo.
echo [10/11] Checking frontend calculator syntax...
node --check "js\calculator.spec.js"
if errorlevel 1 goto failed
node --check "js\constants.spec.js"
if errorlevel 1 goto failed

echo.
echo [11/11] Checking Python backend syntax...
python -m py_compile server.py auto_word.py generate_docx.py verifier.py pdf_to_docx.py self_check.py server_smoke_test.py cleanup_temp.py cleanup_temp_test.py make_release_bundle.py release_bundle_smoke_test.py verify_release_bundle.py pre_delivery_check.py env_check.py ui_smoke_test.py audit_schema.py audit_schema_test.py audit_compare.py audit_compare_test.py
if errorlevel 1 goto failed

echo.
echo ================================================
echo  PASS: all checks completed successfully
echo ================================================
pause
exit /b 0

:failed
echo.
echo ================================================
echo  FAIL: please fix the error shown above
echo ================================================
pause
exit /b 1
