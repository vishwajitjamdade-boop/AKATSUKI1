@echo off
title DevDarshan - Smart Temple Management System
color 0A
echo.
echo  ========================================
echo   DevDarshan - Starting Backend Server
echo  ========================================
echo.

cd /d d:\AKATSUKI1

echo  [1/2] Installing packages (first run only)...
call npm install --silent 2>nul
if %errorlevel% neq 0 (
  echo  ERROR: npm not found. Install Node.js from https://nodejs.org
  pause
  exit /b 1
)

echo  [2/2] Starting server...
echo.
echo  =========================================
echo   Server running at http://localhost:3000
echo   Open browser and go to:
echo   http://localhost:3000/index.html
echo  =========================================
echo.
echo  Credentials:
echo    Security Admin: admin / admin123
echo    Devotee:        devotee / dev123
echo.
echo  Press Ctrl+C to stop the server.
echo.

node server.js
pause
