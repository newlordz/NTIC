@echo off
title NTIC Platform Frontend (Live Dev Mode)
cd /d "%~dp0NticPlatform.Frontend"

echo ===================================================
echo   Starting Angular Dev Server (Live Reload)
echo   URL: http://localhost:4200
echo   API Proxy: http://127.0.0.1:5000
echo ===================================================

npx ng serve --proxy-config proxy.conf.json --port 4200 --open

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Dev server stopped with error code %errorlevel%.
    pause
)
