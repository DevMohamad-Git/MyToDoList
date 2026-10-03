@echo off
title Momentum OS
rem ============================================================
rem  Double-click launcher for Momentum OS.
rem  It always runs npm from THIS file's folder, so you never get
rem  the "Could not read package.json" (ENOENT) error.
rem ============================================================

cd /d "%~dp0"

if not exist package.json (
  echo.
  echo [Momentum] package.json not found in:
  echo     %~dp0
  echo Keep Momentum.bat inside the MyToDoList project folder.
  echo.
  pause
  exit /b 1
)

echo.
echo [Momentum] Starting... the app will open in your browser at http://localhost:5173
echo [Momentum] To stop the app, just close this black window.
echo.
call npm start

if errorlevel 1 (
  echo.
  echo [Momentum] Something went wrong. Take a screenshot of the message above.
  echo.
  pause
)
