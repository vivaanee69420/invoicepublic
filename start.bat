@echo off
REM Double-click this file on Windows to start your dashboard.
cd /d "%~dp0"

echo Starting My Planner...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed yet - it's the free engine this app runs on.
  echo Opening the download page. Install it, then double-click this file again.
  start "" "https://nodejs.org/en/download/prebuilt-installer"
  pause
  exit /b 1
)

if not exist node_modules (
  echo First-time setup ^(installing components^)...
  call npm install --no-audit --no-fund || (echo Setup failed. & pause & exit /b 1)
  echo.
)

if exist owner-password.txt (
  set /p OWNER_PASSWORD=<owner-password.txt
) else (
  set OWNER_PASSWORD=changeme
  echo Using the default password "changeme". Create owner-password.txt to change it.
)
if "%PORT%"=="" set PORT=3000

echo.
echo Dashboard:    http://localhost:%PORT%
echo Staff portal: http://localhost:%PORT%/staff.html
echo Keep this window open while you use it; close it to stop the app.
echo.

start "" "http://localhost:%PORT%"
node server.js
