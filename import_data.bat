@echo off
REM ============================================================================
REM Fuel Management System - Excel Data Import Script
REM ============================================================================
REM This script imports daily tank readings from Excel spreadsheets into the
REM fuel management system database.
REM
REM Usage:
REM   import_data.bat                    - Import from default December file
REM   import_data.bat "path\to\file.xlsx" - Import from specific file
REM ============================================================================

setlocal enabledelayedexpansion

REM Set colors for output
set GREEN=[92m
set RED=[91m
set YELLOW=[93m
set BLUE=[94m
set NC=[0m

echo.
echo %BLUE%========================================================================%NC%
echo %BLUE%    FUEL MANAGEMENT SYSTEM - EXCEL DATA IMPORT%NC%
echo %BLUE%========================================================================%NC%
echo.

REM Change to backend directory
cd /d "%~dp0backend"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR] Python is not installed or not in PATH%NC%
    echo Please install Python 3.7 or higher
    pause
    exit /b 1
)

REM Determine Excel file to import
if "%~1"=="" (
    set "EXCEL_FILE=Daily Station Stock Movement Reconciliation Luanshya December 2025.xlsx"
    echo %YELLOW%[INFO] No file specified, using default:%NC%
) else (
    set "EXCEL_FILE=%~1"
    echo %YELLOW%[INFO] Using specified file:%NC%
)
echo       %EXCEL_FILE%
echo.

REM Check if Excel file exists
if not exist "%EXCEL_FILE%" (
    echo %RED%[ERROR] Excel file not found:%NC%
    echo        %EXCEL_FILE%
    echo.
    echo Please ensure the file exists in the backend directory or provide the full path.
    pause
    exit /b 1
)

REM Check if backend server is running
echo %YELLOW%[CHECK] Verifying backend server is running...%NC%
curl -s http://localhost:8000/api/v1/auth/users >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR] Backend server is not running!%NC%
    echo.
    echo Please start the backend server first:
    echo   cd backend
    echo   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    echo.
    pause
    exit /b 1
)
echo %GREEN%[OK] Backend server is running%NC%
echo.

REM Check if import script exists
if not exist "import_excel_data.py" (
    echo %RED%[ERROR] Import script not found: import_excel_data.py%NC%
    pause
    exit /b 1
)

REM Display file information
echo %BLUE%========================================================================%NC%
echo %BLUE%    IMPORT DETAILS%NC%
echo %BLUE%========================================================================%NC%
for %%I in ("%EXCEL_FILE%") do (
    echo File Name : %%~nxI
    echo File Size : %%~zI bytes
    echo File Date : %%~tI
)
echo.

REM Confirm before proceeding
echo %YELLOW%[WARNING] This will import data from the Excel file into the database.%NC%
echo %YELLOW%          Existing data with the same dates will be overwritten.%NC%
echo.
set /p CONFIRM="Do you want to proceed? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo %RED%Import cancelled by user.%NC%
    pause
    exit /b 0
)

echo.
echo %BLUE%========================================================================%NC%
echo %BLUE%    STARTING IMPORT...%NC%
echo %BLUE%========================================================================%NC%
echo.

REM Run the import script and save output
python import_excel_data.py > import_log.txt 2>&1

REM Check if import was successful
if errorlevel 1 (
    echo.
    echo %RED%========================================================================%NC%
    echo %RED%    IMPORT FAILED!%NC%
    echo %RED%========================================================================%NC%
    echo.
    echo %RED%An error occurred during import. Check import_log.txt for details.%NC%
    echo.
    type import_log.txt
    pause
    exit /b 1
)

REM Display import results
echo.
echo %GREEN%========================================================================%NC%
echo %GREEN%    IMPORT COMPLETED SUCCESSFULLY!%NC%
echo %GREEN%========================================================================%NC%
echo.

REM Show summary from log file
findstr /C:"Imported:" /C:"Skipped:" /C:"Errors:" import_log.txt
echo.

REM Show last few lines of log
echo %BLUE%Import Log (last 10 lines):%NC%
powershell -command "Get-Content import_log.txt -Tail 10"
echo.

echo %GREEN%Full import log saved to: import_log.txt%NC%
echo.
echo %BLUE%========================================================================%NC%
echo %BLUE%    NEXT STEPS%NC%
echo %BLUE%========================================================================%NC%
echo.
echo 1. View imported data at: http://localhost:3000/tank-readings-report
echo 2. Check validation status for any FAIL readings
echo 3. Adjust validation thresholds if needed: http://localhost:3000/settings
echo.

pause
exit /b 0
