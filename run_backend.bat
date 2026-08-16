@echo off
title NTIC Platform Backend (Dev)
cd /d "%~dp0"

REM Local development: auto-reload on file changes. Production entry points
REM (the root Dockerfile) do NOT set this, so they run without the reloader.
set NTIC_DEV_RELOAD=true

echo ===================================================
echo   Starting NTIC Platform Backend
echo   URL: http://localhost:5000   (auto-reload ON)
echo ===================================================

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at .venv\
    echo Create it with:
    echo     python -m venv .venv
    echo     .venv\Scripts\python -m pip install -r NticPlatform.Backend\requirements.txt
    pause
    exit /b 1
)

REM Fail fast with a clear message instead of a 404 on /api/ws at runtime.
.venv\Scripts\python -c "import websockets" >nul 2>nul
if %errorlevel% neq 0 (
    echo [Warning] WebSocket support is missing - real-time sync will not work.
    echo Installing uvicorn[standard]...
    .venv\Scripts\python -m pip install "uvicorn[standard]>=0.28.0"
)

.venv\Scripts\python NticPlatform.Backend\run.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Backend stopped with error code %errorlevel%.
    pause
)
