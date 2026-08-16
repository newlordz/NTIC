@echo off
REM Nightly NTIC database backup. Runs scripts\db_backup.py with the PostgreSQL
REM client tools on PATH, and writes a timestamped log alongside the dumps.
REM
REM Registered as a Windows Scheduled Task; edit the task if you move the repo.

setlocal

set "REPO=%~dp0.."
set "PYTHON=%REPO%\.venv\Scripts\python.exe"
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "LOG=%REPO%\backups\backup.log"

REM Put pg_dump on PATH so db_backup.py can find it.
set "PATH=%PG_BIN%;%PATH%"

echo ============================================>> "%LOG%"
echo Backup started: %DATE% %TIME%>> "%LOG%"

"%PYTHON%" "%REPO%\scripts\db_backup.py" backup --prune 14 >> "%LOG%" 2>&1

echo Backup finished: %DATE% %TIME% (exit %ERRORLEVEL%)>> "%LOG%"
echo.>> "%LOG%"

exit /b %ERRORLEVEL%
