@echo off
title FlowOS
rem ============================================================
rem  Double-click launcher for FlowOS.
rem  It always runs npm from THIS file's folder, so you never get
rem  the "Could not read package.json" (ENOENT) error.
rem ============================================================

cd /d "%~dp0"

if not exist package.json (
  echo.
  echo [FlowOS] package.json not found in:
  echo     %~dp0
  echo Keep FlowOS.bat inside the MyToDoList project folder.
  echo.
  pause
  exit /b 1
)

echo.
echo [FlowOS] Starting... the app will open in your browser at http://localhost:5173
echo [FlowOS] To stop the app, just close this black window.
echo.
call npm start

if errorlevel 1 (
  echo.
  echo [FlowOS] Something went wrong. Take a screenshot of the message above.
  echo.
  pause
)
