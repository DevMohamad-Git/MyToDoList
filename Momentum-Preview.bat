@echo off
title Momentum OS (Preview)
rem ============================================================
rem  Serves the built app (dist/) at http://localhost:4173.
rem  Run this, then open the installed "Momentum OS" desktop app
rem  so it can fetch its service-worker update from the live server.
rem ============================================================

cd /d "%~dp0"

if not exist package.json (
  echo.
  echo [Momentum] package.json not found in:
  echo     %~dp0
  echo Keep this .bat inside the MyToDoList project folder.
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo.
  echo [Momentum] No build found. Run "npm run build" first.
  echo.
  pause
  exit /b 1
)

echo.
echo [Momentum] Preview server: http://localhost:4173
echo [Momentum] Keep this window open, then open the installed Momentum OS app to update it.
echo.
call npm run preview

if errorlevel 1 (
  echo.
  echo [Momentum] Something went wrong. Take a screenshot of the message above.
  echo.
  pause
)
