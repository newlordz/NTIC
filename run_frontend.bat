@echo off
title NTIC Platform Frontend
cd /d "%~dp0NticPlatform.Frontend"

echo ===================================================
echo   Starting NTIC Platform Frontend
echo ===================================================

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: Check if build files exist for production server; build if missing
if not exist "dist\ntic-frontend\browser\index.html" (
    echo Build files missing. Building Angular application...
    call npm run build
)

echo Starting Frontend Server on http://localhost:8080 (Proxying /api to http://127.0.0.1:5000)...
node server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend server stopped with error code %errorlevel%.
    pause
)
