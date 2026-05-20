@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js not found on PATH. Install Node.js then retry.
  pause
  exit /b 1
)
node "%~dp0serve-local.js" %*
