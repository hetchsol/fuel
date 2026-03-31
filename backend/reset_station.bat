@echo off
echo.
echo ============================================================
echo   NEXTSTOP STATION RESET
echo ============================================================
echo.
echo This will wipe ALL operational data and force a fresh setup.
echo The owner1 admin account will be preserved.
echo.

cd /d "%~dp0"

if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe reset_station.py
) else (
    python reset_station.py
)

echo.
pause
