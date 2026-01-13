# Excel Data Import Guide

## Quick Start

### Method 1: Using the Batch Script (Recommended)

Simply double-click `import_data.bat` to import data from the default Excel file.

```batch
import_data.bat
```

### Method 2: Import from a Specific File

Drag and drop your Excel file onto `import_data.bat`, or run:

```batch
import_data.bat "path\to\your\file.xlsx"
```

### Method 3: Manual Python Script

```batch
cd backend
python import_excel_data.py
```

---

## Prerequisites

1. **Backend Server Running**
   - The FastAPI backend must be running on port 8000
   - Start it with: `cd backend && python -m uvicorn app.main:app --reload`

2. **Python Packages**
   - openpyxl (for Excel file reading)
   - requests (for API calls)

3. **Excel File Format**
   - The Excel file must follow the expected structure
   - Should have "Diesel" and "Petrol" sheets
   - Column mappings defined in `import_excel_data.py`

---

## What the Script Does

1. **Authentication**
   - Logs in as owner1 user
   - Gets authentication token

2. **Sheet Processing**
   - Reads "Diesel" sheet → Imports to TANK-DIESEL
   - Reads "Petrol" sheet → Imports to TANK-PETROL

3. **Data Extraction**
   - Parses each row from the Excel file
   - Extracts:
     - Date and shift type
     - Nozzle readings (electronic & mechanical)
     - Tank dip readings (opening, closing, after-delivery)
     - Tank volumes
     - Financial data (price, cash banked)
     - Customer allocations (Diesel only)

4. **API Submission**
   - Submits each reading to `/api/v1/tank-readings/readings`
   - Performs all Excel formula calculations on the backend
   - Validates readings and assigns PASS/WARNING/FAIL status

---

## Excel File Structure

### Required Sheets
- **Diesel**: Diesel tank readings
- **Petrol**: Petrol tank readings

### Expected Columns

| Column | Description | Example |
|--------|-------------|---------|
| B | Date | 2025-12-01 |
| C | Shift Type | Day/Night |
| D-AD | Nozzle readings (4 nozzles: 1A, 1B, 2A, 2B) | Attendant, Electronic, Mechanical |
| AF | Opening dip (cm) | 107.3 |
| AH | Closing dip (cm) | 99.8 |
| AI | Opening volume (L) | 16554.32 |
| AL | Closing volume (L) | 15038.73 |
| AX | Price per liter | 26.98 |
| BD | Actual cash banked | 42000.00 |
| AR-BB | Customer allocations (Diesel only) | Drive-in, Volcano, Hammington, etc. |

---

## Import Results

### Success Indicators
- Green "[OK]" messages
- "Imported: X" count in summary
- Reading IDs displayed in log

### Common Issues

#### Issue: Backend server not running
**Solution:** Start the backend server first
```batch
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Issue: Authentication failed
**Solution:** Check credentials in `import_excel_data.py`
- Default: username='owner1', password='owner123'

#### Issue: Column not found
**Solution:** Verify Excel file structure matches expected format
- Check column mappings in `import_excel_data.py`
- Ensure header row is at row 3

#### Issue: Date parsing error
**Solution:** Ensure dates are in proper format
- Format: YYYY-MM-DD or Excel date serial number
- Column B should contain valid dates

---

## Viewing Imported Data

After successful import:

1. **Tank Readings Report**
   - URL: http://localhost:3000/tank-readings-report
   - Select date range and tank
   - View all imported readings

2. **Tank Movement Analysis**
   - URL: http://localhost:3000/tank-movement
   - Analyze volume movements
   - Check variance and losses

3. **Validation Thresholds**
   - URL: http://localhost:3000/settings (Validation Thresholds tab)
   - Adjust PASS/WARNING/FAIL thresholds
   - Recommended: PASS=2.0%, WARNING=3.5%

---

## Troubleshooting

### Check Import Log
The script creates `import_log.txt` with detailed information:
```batch
type backend\import_log.txt
```

### Verify Backend is Running
```batch
curl http://localhost:8000/api/v1/auth/users
```

### Test with Sample Data
First 5 rows only (modify script):
```python
for row in range(4, 9):  # Only rows 4-8
```

### Re-run Import
The import is idempotent - you can re-run it multiple times. The backend uses in-memory storage, so data is replaced on each import.

---

## Advanced Usage

### Import Multiple Files
Create a batch script to import multiple files:
```batch
@echo off
for %%f in (*.xlsx) do (
    echo Importing %%f...
    import_data.bat "%%f"
)
```

### Schedule Automatic Imports
Use Windows Task Scheduler to run daily:
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at 6 AM)
4. Action: Start Program → `import_data.bat`

### Custom Column Mappings
Edit `backend/import_excel_data.py` and update `COLUMN_MAP` dictionary:
```python
COLUMN_MAP = {
    'B': 'date',
    'C': 'shift',
    # Add your custom columns here
}
```

---

## Support

For issues or questions:
1. Check import_log.txt for error details
2. Verify Excel file structure
3. Ensure backend server is running
4. Check API documentation: http://localhost:8000/docs

---

## File Locations

- **Batch Script:** `import_data.bat`
- **Python Script:** `backend/import_excel_data.py`
- **Import Log:** `backend/import_log.txt`
- **Excel File:** `backend/Daily Station Stock Movement Reconciliation Luanshya December 2025.xlsx`
